"""Job adapters reuse pipeline modules; Docker contains no research logic."""
from pathlib import Path
import subprocess
import sys

from ..storage import SourceStore, read_json
from ..workflow import load_roster, run_district
from ..pipeline import curate, polish
from ..political import collect_transcripts, build_profiles
from ..platforms import collect_candidates, collect_parties, latest_attempt
from ..collection.candidate_records import run as collect_records
from ..collection.platform_discovery import discover
from ..analysis.alignment.batch import research_candidates
from ..analysis.alignment.research import research_cases
from ..analysis.alignment.review import source_review
from ..analysis.identity import review_identities


def execute(name, args, config):
    root, eid = args.storage, config['election']['id']
    store = SourceStore(root, offline=args.offline, refresh=args.refresh)
    selection = {'district': args.district, 'candidate': args.candidate}
    model = {**selection, 'max_calls': args.max_calls, 'offline': args.offline}
    if name == 'normalize':
        districts, rows, _ = load_roster(store, config)
        codes = [code for code in districts if not args.district or code.upper() == args.district.upper()]
        if args.candidate:
            registry = read_json(root / 'curated/identities.json', {'candidacies': []})
            matched = {row['district_code'] for row in rows if row['name'] == args.candidate}
            matched.update(row['district_code'] for row in registry['candidacies'] if args.candidate in {row['id'], row['ballot_name']} and row['election_id'] == eid)
            codes = sorted(set(codes) & matched)
        if not codes:
            raise ValueError('No constituencies match normalization selection')
        for code in codes:
            run_district(store, config, root, code, publish=False, download_documents=True)
        return {'districts': len(codes)}
    if name == 'records':
        code = collect_records(config, root, offline=args.offline, refresh=args.refresh, workers=args.workers, **selection)
        report = read_json(root / 'normalized' / eid / 'candidate-records/collection-audit.json')
        return {'collected': report['completed_candidates'], 'errors': report['failures'] + [error for row in report['results'] for error in row['errors']], 'exit_code': code}
    if name == 'discover':
        audit = discover(store, config, root, workers=args.workers)
        return {'directories': len(audit), 'errors': [row for row in audit if row['error']]}
    if name == 'platforms':
        _, rows, _ = load_roster(store, config)
        if args.candidate:
            registry = read_json(root / 'curated/identities.json', {'candidacies': []})
            names = {row['ballot_name'] for row in registry['candidacies'] if args.candidate in {row['id'], row['ballot_name']} and row['election_id'] == eid}
            names.add(args.candidate)
            rows = [row for row in rows if row['name'] in names]
        if args.district:
            rows = [row for row in rows if row['district_code'].upper() == args.district.upper()]
        if not rows:
            raise ValueError('No candidates match platform collection selection')
        paths = []
        for party in sorted({row['party_name'] for row in rows if row['party_name']}):
            paths.extend(collect_parties(store, config, root, party=party, max_pages=args.max_pages))
        for code in sorted({row['district_code'] for row in rows}):
            names = [row['name'] for row in rows if row['district_code'] == code] if args.candidate else [None]
            for candidate in names:
                paths.extend(collect_candidates(store, config, root, district=code, candidate=candidate, max_pages=args.max_pages))
        return {'platforms': len(paths), 'errors': [error for path in paths for error in latest_attempt(path)['coverage']['errors']]}
    if name == 'transcripts':
        audit = collect_transcripts(root, eid, offline=args.offline, refresh=args.refresh, workers=args.workers)
        audit['errors'] = [row for row in audit['results'] if row['status'] == 'failed']
        return audit
    if name == 'profiles':
        return build_profiles(root, eid)
    if name == 'refresh-publication':
        summary = build_profiles(root, eid)
        return {**summary, 'published_files': len(polish(root, eid, args.district))}
    if name == 'plan':
        return research_candidates(root, config, stage='init', **selection, offline=True)
    if name == 'identity-review':
        return review_identities(root, config, **model, workers=args.workers, voting_only=getattr(args, 'voting_only', False))
    if name == 'curate':
        paths = curate(root, eid, args.district)
        summary = build_profiles(root, eid)
        return {'curated_districts': len(paths), 'profiles': summary['candidates']}
    if name == 'research':
        return research_cases(root, config, **model, refresh=args.refresh, workers=args.workers)
    if name == 'evidence':
        return research_candidates(root, config, stage='collect', **selection, offline=args.offline, refresh=args.refresh)
    if name == 'comparison':
        report = research_candidates(root, config, stage='draft', **model, workers=args.workers)
        # Structurally rejected drafts are retained privately for the independent
        # reviewer to correct or reject. Input/endpoint failures still fail the job.
        rejected = [error for error in report['errors'] if error.get('case_id') and not error.get('endpoint_failure')]
        report['errors'] = [error for error in report['errors'] if error not in rejected]
        report['pending'] = [{'candidate_id': error['candidate_id'], 'reason': 'Draft needs independent source review', 'case_id': error['case_id']} for error in rejected]
        return report
    if name == 'source-review':
        return source_review(root, config, **model, workers=args.workers)
    if name == 'publish':
        report = research_candidates(root, config, stage='publish', **selection, offline=True)
        if not report['errors']:
            report['published_files'] = len(polish(root, eid, args.district))
            from ..analysis.coverage import build_report
            coverage = build_report(root, eid, root / 'runs' / args.run_id / 'coverage')
            report['analysis_coverage'] = coverage['counts']
            report['complete_for_candidates_with_votes'] = coverage['complete_for_candidates_with_votes']
        return report
    if name == 'finder-data':
        from ..finder import build_finder
        path, audit = build_finder(store, root)
        return {'publication': str(path), 'audit': audit}
    if name == 'test':
        result = subprocess.run([sys.executable, '-m', 'unittest', 'discover', '-s', str(Path(__file__).resolve().parents[2] / 'tests')])
        return {'exit_code': result.returncode}
    raise ValueError('No implementation for job ' + name)
