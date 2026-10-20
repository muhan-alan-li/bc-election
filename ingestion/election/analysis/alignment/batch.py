"""Roster-wide research planning and resumable candidate comparison stages.

An initialized manifest is a research checklist, not an approved promise or finding.
Each candidate needs their own selected actions, sources, and current review.
"""
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from pathlib import Path

from ...pipeline import safe_id
from ...storage import atomic_json, read_json
from .registry import PILLARS
from .drafting import run
from .publication import build_reviewed
from .preparation import prepare
from .validation import validate_result
from ..service import digest, provider_from_config

STAGES = {'plan', 'init', 'collect', 'draft', 'publish'}
BUNDLED_RESEARCH = Path(__file__).parent.parent / 'research'


def candidate_profiles(root, election_id, *, district=None, candidate=None):
    folder = Path(root) / 'curated/datasets/political' / safe_id(election_id) / 'candidates'
    profiles = []
    for path in sorted(folder.glob('*.json')):
        profile = read_json(path)
        if profile['id'] != path.stem or profile['election_id'] != election_id:
            raise ValueError('Research profile identity does not match its path or election')
        if district and profile['district_code'].upper() != district.upper():
            continue
        if candidate and candidate not in {profile['id'], profile['ballot_name']}:
            continue
        profiles.append(profile)
    if not profiles:
        raise ValueError('No candidate profiles match this research selection; build political profiles first')
    return profiles


def manifest_template(profile):
    return {'schema_version': 1, 'election_id': profile['election_id'],
        'candidate_id': profile['id'], 'person_id': profile['person_id'],
        'party_name': profile['party_name'],
        'scope': 'Selected, dated commitments compared with source-checked substantive actions.',
        'sources': [], 'cases': [], 'unassessed_commitments': [],
        'research_notes': ['Check candidate identity and prior offices before attributing records.',
            'Add dated party or candidate statements and exact operative evidence; topic overlap is not alignment.'],
        'pillar_checklist': [dict(pillar) for pillar in PILLARS]}


def research_inputs(root, election_id, candidate_id, research_dir=None):
    candidate_id = safe_id(candidate_id)
    folder = (Path(research_dir) if research_dir else Path(root) / 'curated/research') / safe_id(election_id) / candidate_id
    manifest = folder / 'manifest.json'
    if not manifest.exists():
        bundled = BUNDLED_RESEARCH / election_id / candidate_id / 'manifest.json'
        if bundled.exists():
            return bundled, bundled.with_name('review.json'), folder
    return manifest, folder / 'review.json', folder


def plan_candidate(profile, manifest_path, review_path):
    manifest = read_json(manifest_path)
    if manifest and any(manifest.get(key) != profile.get(profile_key) for key, profile_key in
                        [('candidate_id', 'id'), ('person_id', 'person_id'), ('election_id', 'election_id'), ('party_name', 'party_name')]):
        raise ValueError('Research manifest belongs to a different candidate, election, or party')
    actions = profile.get('actions', [])
    reviewed = [a for a in actions if a.get('attribution_status') == 'reviewed']
    cases = manifest.get('cases', []) if manifest else []
    coverage = profile.get('coverage', {})
    status = ('needs_identity_review' if coverage.get('identity_status') != 'reviewed' else
              'needs_action_research' if not reviewed else
              'needs_comparison_research' if not cases else
              'review_available' if review_path.exists() else 'ready_for_evidence')
    return {'candidate_id': profile['id'], 'ballot_name': profile['ballot_name'],
        'district_code': profile['district_code'], 'status': status,
        'collected_vote_entries': coverage.get('voting', {}).get('count', 0),
        'reviewed_actions': len(reviewed), 'manifest': str(manifest_path),
        'review': str(review_path), 'cases': len(cases),
        'published_comparisons': len((profile.get('alignment_analysis') or {}).get('findings', [])),
        'pillars': [{'id': p['id'], 'cases': sum(c.get('pillar_id') == p['id'] for c in cases)} for p in PILLARS]}


def research_candidates(root, config, *, stage='plan', district=None, candidate=None,
                        research_dir=None, max_calls=0, offline=False, refresh=False, provider=None, workers=1):
    if stage not in STAGES:
        raise ValueError('Unknown candidate research stage')
    if type(max_calls) is not int or not 0 <= max_calls <= 10000:
        raise ValueError('Batch max_calls must be between 0 and 10000')
    root = Path(root)
    election_id = safe_id(config['election']['id'])
    profiles = candidate_profiles(root, election_id, district=district, candidate=candidate)
    report = {'stage': stage, 'election_id': election_id, 'candidates': [], 'errors': [],
        'model_calls': 0, 'cache_hits': 0, 'prompt_tokens': 0, 'completion_tokens': 0}
    pending = []
    budget_lock, allocated = Lock(), 0
    if stage == 'draft':
        provider = provider or provider_from_config(config)
    def process(profile):
        nonlocal allocated
        manifest_path, review_path, folder = research_inputs(root, election_id, profile['id'], research_dir)
        try:
            row = plan_candidate(profile, manifest_path, review_path)
            if stage == 'init':
                local_manifest = folder / 'manifest.json'
                if not local_manifest.exists():
                    atomic_json(local_manifest, read_json(manifest_path) or manifest_template(profile))
                if review_path.exists() and review_path != folder / 'review.json' and not (folder / 'review.json').exists():
                    atomic_json(folder / 'review.json', read_json(review_path))
                row = plan_candidate(profile, local_manifest, folder / 'review.json')
            elif stage in {'collect', 'draft', 'publish'}:
                if row['status'] in {'needs_identity_review', 'needs_action_research', 'needs_comparison_research'}:
                    row['result'] = 'pending_research'
                elif stage == 'publish':
                    if not review_path.exists():
                        row['result'] = 'pending_source_review'
                    else:
                        manifest, review = read_json(manifest_path), read_json(review_path)
                        if stale_pipeline_review(root, profile, manifest, review):
                            row['result'] = 'pending_source_review'
                        else:
                            dossier = build_reviewed(root, manifest, review, write=False)
                            pending.append((root / 'curated/datasets/alignment' / election_id / (profile['id'] + '.json'), dossier))
                            row['result'] = 'validated'
                elif stage == 'draft' and review_path.exists() and current_review(root, manifest_path, review_path):
                    row['result'] = 'already_source_checked'
                else:
                    manifest = read_json(manifest_path)
                    allowance = min(20, max_calls - report['model_calls'])
                    if stage == 'draft' and workers > 1:
                        _, jobs, _ = prepare(root, manifest, offline=offline, refresh=refresh)
                        needed = 0
                        for job in jobs:
                            key = digest({'input_hash': job['input_hash'], 'provider': provider.identity})
                            cached = read_json(root / 'normalized/alignment' / election_id / profile['id'] / 'results' / (key + '.json'))
                            if cached and cached.get('input_hash') == job['input_hash'] and cached.get('provider') == provider.identity:
                                validate_result(cached['result'], job)
                            else:
                                needed += 1
                        with budget_lock:
                            allowance = min(20, needed, max_calls - allocated)
                            allocated += allowance
                    audit = run(root, config, manifest,
                        max_calls=allowance, offline=offline,
                        refresh=refresh, provider=provider, collect_only=stage == 'collect')
                    row['audit'] = audit
                    with budget_lock:
                        for key in ('model_calls', 'cache_hits', 'prompt_tokens', 'completion_tokens'):
                            report[key] += audit.get(key, 0)
                    report['errors'].extend({'candidate_id': profile['id'], **error} for error in audit['errors'])
            report['candidates'].append(row)
        except (ValueError, KeyError, OSError) as error:
            report['errors'].append({'candidate_id': profile['id'], 'message': str(error)})
    if stage == 'draft' and workers > 1:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            list(pool.map(process, profiles))
    else:
        for profile in profiles:
            process(profile)
    for field in ('candidates', 'errors'):
        report[field].sort(key=lambda row: row['candidate_id'])
    if stage == 'publish' and not report['errors']:
        for path, dossier in pending:
            atomic_json(path, dossier)
        if pending:
            from ...political import build_profiles, polish_profiles
            build_profiles(root, election_id)
            polish_profiles(root, election_id)
        report['published_candidates'] = len(pending)
    report['status_counts'] = dict(Counter(row['status'] for row in report['candidates']))
    atomic_json(root / 'normalized/research' / election_id / 'latest-run.json', report)
    return report


def current_review(root, manifest_path, review_path):
    try:
        build_reviewed(root, read_json(manifest_path), read_json(review_path), write=False)
        return True
    except (ValueError, KeyError, OSError):
        return False


def stale_pipeline_review(root, profile, manifest, review):
    """A verified older review is pending; altered or foreign review data remains an error."""
    if review.get('reviewer') != 'pipeline_source_review' or review.get('candidate_id') != profile['id']:
        return False
    _, jobs, _ = prepare(root, manifest, offline=True)
    expected = {job['id']: job['input_hash'] for job in jobs}
    actual = {key: value['input_hash'] for key, value in review['findings'].items()}
    if expected == actual:
        return False
    folder = Path(root) / 'normalized/model-jobs/source-review' / profile['election_id'] / profile['id'] / 'results'
    for key, finding in review['findings'].items():
        cache_key = review.get('review_provenance', {}).get('cases', {}).get(key)
        if not isinstance(cache_key, str) or len(cache_key) != 64:
            return False
        record = read_json(folder / (cache_key + '.json'))
        if not record or record['bindings'].get('candidate_id') != profile['id'] or record['bindings'].get('job_input_hash') != finding['input_hash'] or record['result'].get('result') != finding['result']:
            return False
    return True
