"""Run exactly one pipeline job and retain its audit independently of the container."""
import argparse
from datetime import datetime, timezone
import fcntl
import json
from pathlib import Path
import uuid

from ..storage import atomic_json, read_json, now
from ..pipeline import safe_id
from .registry import JOBS
from .tasks import execute


def main(argv=None):
    base = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('job', choices=JOBS)
    parser.add_argument('--config', type=Path, default=base / 'config.json')
    parser.add_argument('--storage', type=Path, default=base / 'storage')
    parser.add_argument('--run-id', default=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S') + '-' + uuid.uuid4().hex[:8])
    parser.add_argument('--district')
    parser.add_argument('--candidate')
    parser.add_argument('--voting-only', action='store_true', help='Limit identity review to candidates with collected votes')
    parser.add_argument('--max-calls', type=int, choices=range(10001), default=0, metavar='0..10000')
    parser.add_argument('--workers', type=int, choices=range(1, 9), default=4)
    parser.add_argument('--max-pages', type=int, choices=range(1, 101), default=12)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--offline', action='store_true')
    mode.add_argument('--refresh', action='store_true')
    args = parser.parse_args(argv)
    safe_id(args.run_id)
    args.storage.mkdir(parents=True, exist_ok=True)
    audit_path = args.storage / 'runs' / args.run_id / (args.job + '.json')
    report = {'job': args.job, 'run_id': args.run_id, 'started_at': now(), 'status': 'running',
        'selection': {'district': args.district, 'candidate': args.candidate}, 'offline': args.offline}
    try:
        with (args.storage / '.job.lock').open('a') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise ValueError('Another ingestion job is writing this storage; retry after it finishes')
            atomic_json(audit_path, report)
            result = execute(args.job, args, read_json(args.config))
            errors = result.get('errors', []) or result.get('transcript_errors', [])
            failed = bool(errors) or result.get('exit_code', 0) not in {0, 3}
            candidates = result.get('candidates', [])
            pending = result.get('pending', []) or ([row for row in candidates if isinstance(row, dict) and row.get('result', '').startswith('pending_')] if isinstance(candidates, list) else [])
            report.update(result=result, status='failed' if failed else 'partial' if pending else 'completed', finished_at=now())
            atomic_json(audit_path, report)
            print(json.dumps(report, indent=2))
            return 1 if failed else 3 if pending else 0
    except (ValueError, KeyError, OSError, TypeError) as error:
        report.update(status='failed', errors=[{'message': str(error)}], finished_at=now())
        atomic_json(audit_path, report)
        print(json.dumps(report, indent=2))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
