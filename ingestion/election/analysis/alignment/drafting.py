"""Bounded, resumable private drafts; never implicit publication."""
from pathlib import Path
from ...storage import atomic_json, now, read_json
from ..service import digest, provider_from_config
from .registry import PILLAR_IDS
from .preparation import prepare
from .validation import validate_result

def run(root, config, manifest, *, max_calls=4, offline=False, refresh=False, provider=None, collect_only=False, pillar=None):
    if not isinstance(max_calls, int) or not 0 <= max_calls <= 20:
        raise ValueError('Candidate max_calls must be between 0 and 20')
    root = Path(root)
    profile, jobs, dossier = prepare(root, manifest, offline=offline, refresh=refresh)
    if pillar is not None:
        if pillar not in PILLAR_IDS:
            raise ValueError('Unknown research pillar')
        jobs = [job for job in jobs if job['pillar_id'] == pillar]
    folder = root / 'normalized/alignment' / dossier['election_id'] / dossier['id']
    audit = {'model_calls': 0, 'cache_hits': 0, 'errors': [], 'prompt_tokens': 0, 'completion_tokens': 0,
        'cases': len(jobs), 'pillar_id': pillar, 'coverage': dossier['coverage']}
    if collect_only:
        atomic_json(folder / 'selection.json', dossier)
        return audit
    provider = provider or provider_from_config(config)
    for job in jobs:
        key = digest({'input_hash': job['input_hash'], 'provider': provider.identity})
        cached = read_json(folder / 'results' / (key + '.json'))
        try:
            if cached and cached.get('input_hash') == job['input_hash'] and cached.get('provider') == provider.identity:
                validate_result(cached['result'], job)
                audit['cache_hits'] += 1
            elif offline or audit['model_calls'] >= max_calls:
                continue
            else:
                audit['model_calls'] += 1
                print(f"Comparison: {profile['ballot_name']} / {job['id']}", flush=True)
                result, metadata = provider.complete(job['messages'])
                for token in ('prompt_tokens', 'completion_tokens'):
                    audit[token] += metadata.get('usage', {}).get(token, 0)
                # Retain rejected outputs privately for audit, never publish them.
                atomic_json(folder / 'attempts' / (key + '.json'), {'input_hash': job['input_hash'], 'result': result, 'metadata': metadata})
                validate_result(result, job)
                cached = {'input_hash': job['input_hash'], 'provider': provider.identity, 'result': result, 'metadata': metadata}
                atomic_json(folder / 'results' / (key + '.json'), cached)
            dossier['findings'].append({'id': job['id'], 'input_hash': job['input_hash'], 'draft': cached['result']})
        except ValueError as error:
            audit['errors'].append({'case_id': job['id'], 'message': str(error),
                                    'endpoint_failure': getattr(error, 'endpoint_failure', False)})
            if getattr(error, 'endpoint_failure', False):
                break
    atomic_json(folder / 'draft.json', dossier)
    audit['drafted_cases'] = len(dossier['findings'])
    audit['generated_at'] = now()
    atomic_json(folder / 'audit.json', audit)
    return audit
