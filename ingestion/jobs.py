#!/usr/bin/env python3
"""Plan or run one-shot Docker jobs without mounting the Docker socket in containers."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import uuid

from election.jobs.registry import JOBS, job_order
from election.storage import atomic_json, read_json, now
from election.pipeline import safe_id


def compose_command(base):
    command = ['docker', 'compose']
    env_file = base.parent / '.env'
    if env_file.exists():
        command += ['--env-file', str(env_file)]
    return command + ['-f', str(base / 'compose.yaml')]


def main(argv=None):
    base = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['plan', 'run', 'build'])
    parser.add_argument('jobs', nargs='*', choices=list(JOBS))
    parser.add_argument('--through', choices=JOBS)
    parser.add_argument('--from', dest='start', choices=JOBS)
    parser.add_argument('--storage', type=Path, default=base / 'storage')
    parser.add_argument('--config', type=Path, default=base / 'config.json')
    parser.add_argument('--district')
    parser.add_argument('--candidate')
    parser.add_argument('--voting-only', action='store_true', help='Limit identity review to candidates with collected votes')
    parser.add_argument('--max-calls', type=int, default=0)
    parser.add_argument('--workers', type=int, choices=range(1, 9), default=4)
    parser.add_argument('--max-pages', type=int, choices=range(1, 101), default=12)
    parser.add_argument('--run-id', default=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S') + '-' + uuid.uuid4().hex[:8])
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--offline', action='store_true')
    mode.add_argument('--refresh', action='store_true')
    args = parser.parse_args(argv)
    if not 0 <= args.max_calls <= 10000:
        parser.error('--max-calls must be between 0 and 10000')
    if args.jobs and (args.through or args.start):
        parser.error('Use explicit jobs or --through/--from, not both')
    try:
        selected = args.jobs or job_order(args.through or 'plan', args.start)
        safe_id(args.run_id)
    except ValueError as error:
        parser.error(str(error))
    if len(selected) != len(set(selected)):
        parser.error('Do not repeat a job in one run')
    if args.action == 'plan':
        print(json.dumps({'jobs': [{'name': name, 'description': JOBS[name].description, 'uses_model': JOBS[name].model} for name in selected],
            'max_calls_total': args.max_calls}, indent=2))
        return 0
    environment = os.environ.copy()
    environment.update(INGESTION_STORAGE=str(args.storage.resolve()), INGESTION_CONFIG=str(args.config.resolve()),
        INGESTION_UID=str(os.getuid()), INGESTION_GID=str(os.getgid()))
    compose = compose_command(base)
    if args.action == 'build':
        return subprocess.run(compose + ['build', 'profiles'], env=environment).returncode
    args.storage.mkdir(parents=True, exist_ok=True)
    run_path = args.storage / 'runs' / args.run_id / 'pipeline.json'
    if run_path.exists():
        parser.error('Run ID already exists; choose a new ID and --from to continue from a stage')
    report = {'run_id': args.run_id, 'started_at': now(), 'jobs': [], 'max_calls': args.max_calls, 'model_calls': 0}
    atomic_json(run_path, report)
    partial = False
    for name in selected:
        command = compose + ['run', '--rm', '--no-deps', name, '--run-id', args.run_id,
            '--max-calls', str(args.max_calls - report['model_calls']), '--workers', str(args.workers), '--max-pages', str(args.max_pages)]
        for flag, value in [('--district', args.district), ('--candidate', args.candidate)]:
            if value:
                command += [flag, value]
        if args.voting_only:
            command += ['--voting-only']
        if args.offline:
            command += ['--offline']
        elif args.refresh:
            command += ['--refresh']
        code = subprocess.run(command, env=environment).returncode
        audit = read_json(args.storage / 'runs' / args.run_id / (name + '.json'), {})
        calls = audit.get('result', {}).get('model_calls', 0)
        report['model_calls'] += calls
        report['jobs'].append({'name': name, 'exit_code': code, 'status': audit.get('status', 'failed'), 'model_calls': calls})
        if report['model_calls'] > args.max_calls:
            raise ValueError('A job exceeded the shared pipeline model-call budget')
        # A later review/publication job can resolve an earlier draft's pending work.
        partial = code == 3
        if code not in {0, 3}:
            report.update(status='failed', finished_at=now())
            atomic_json(run_path, report)
            return code
        atomic_json(run_path, report)
    report.update(status='partial' if partial else 'completed', finished_at=now())
    atomic_json(run_path, report)
    print(json.dumps(report, indent=2))
    return 3 if partial else 0


if __name__ == '__main__':
    raise SystemExit(main())
