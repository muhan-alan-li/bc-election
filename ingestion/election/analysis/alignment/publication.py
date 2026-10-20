"""Source-checked review assembly and current-source public projection."""
from pathlib import Path
from ...storage import SourceStore, atomic_json, read_json
from ...pipeline import safe_id
from .preparation import prepare
from .validation import validate_result, validate_dossier
from .evidence import profile_hash

def build_reviewed(root, manifest, review, *, write=True):
    """A reviewed editorial result must cite the current sources, votes and job inputs."""
    root = Path(root)
    profile, jobs, dossier = prepare(root, manifest, offline=True)
    if review.get('candidate_id') != profile['id'] or review.get('review_status') != 'source_checked' or review.get('reviewer') not in {'codex_source_review', 'pipeline_source_review'}:
        raise ValueError('A separate source-checked editorial review is required')
    if set(review['findings']) != {job['id'] for job in jobs}:
        raise ValueError('Review must cover exactly the selected comparisons')
    automated = review['reviewer'] == 'pipeline_source_review'
    if automated:
        from .review import validate_pipeline_review
        validate_pipeline_review(root, profile, jobs, review)
    for job in jobs:
        reviewed = review['findings'][job['id']]
        if reviewed['input_hash'] != job['input_hash']:
            raise ValueError('Editorial review is stale relative to source inputs')
        validate_result(reviewed['result'], job)
        evidence = {e['id']: e for e in job['payload']['evidence']}
        result = reviewed['result']
        dossier['findings'].append({'id': job['id'], 'pillar_id': job['pillar_id'], 'topic': job['pillar_id'], 'input_hash': job['input_hash'],
            'commitment': job['payload']['commitment'], 'actions': job['payload']['actions'],
            **{k: v for k, v in result.items() if k not in {'case_id', 'citations'}},
            'citations': [{**c, 'role': evidence[c['evidence_id']]['role'], 'source': evidence[c['evidence_id']]['source']} for c in result['citations']]})
    method = ('AI draft with separate automated source-review pass; no human review recorded.' if automated
              else 'AI draft with separate Codex source review; no human review recorded.')
    dossier.update(review_status='source_checked', review_method=method,
        reviewed_at=review['reviewed_at'], takeaway=review['takeaway'])
    if automated:
        dossier['review_provenance'] = review['review_provenance']
    takeaways = review.get('pillar_takeaways', {})
    assessed = {job['pillar_id'] for job in jobs}
    if set(takeaways) != assessed or any(not isinstance(v, str) or not v.strip() for v in takeaways.values()):
        raise ValueError('Review requires a separate takeaway for every assessed pillar')
    for pillar in dossier['pillars']:
        pillar['takeaway'] = takeaways.get(pillar['id'])
    # The summaries are editorially reviewed, not model-created overall scores.
    validate_dossier(dossier, profile)
    if write:
        atomic_json(root / 'curated/datasets/alignment' / dossier['election_id'] / (dossier['id'] + '.json'), dossier)
    return dossier



def project(root, election_id, profile):
    dossier = read_json(Path(root) / 'curated/datasets/alignment' / safe_id(election_id) / (safe_id(profile['id']) + '.json'))
    if not dossier or dossier.get('profile_input_hash') != profile_hash(profile):
        return None
    # Refreshing or corrupting any research source invalidates the editorial review.
    store = SourceStore(root, offline=True)
    for source in dossier.get('source_hashes', []):
        try:
            _, meta = store.get(source['url'])
        except ValueError:
            return None
        if meta['sha256'] != source['sha256']:
            return None
    validate_dossier(dossier, profile)
    manifest_path = Path(root) / 'curated/research' / election_id / profile['id'] / 'manifest.json'
    if not manifest_path.exists():
        manifest_path = Path(__file__).parent.parent / 'research' / election_id / profile['id'] / 'manifest.json'
    if manifest_path.exists():
        try:
            _, jobs, _ = prepare(root, read_json(manifest_path), offline=True)
        except (ValueError, KeyError, TypeError, OSError):
            return None
        expected = {job['id']: job['input_hash'] for job in jobs}
        if {finding['id']: finding['input_hash'] for finding in dossier['findings']} != expected:
            return None
    return dossier
