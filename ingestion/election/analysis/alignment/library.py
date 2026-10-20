"""Reuse primary evidence from current reviewed dossiers, never their conclusions."""
from pathlib import Path
from copy import deepcopy
from urllib.parse import urldefrag

from ...storage import read_json
from .publication import project


def reviewed_cases(root, profile):
    root = Path(root)
    eid = profile['election_id']
    manifests = list((Path(__file__).parent.parent / 'research' / eid).glob('*/manifest.json'))
    manifests += list((root / 'curated/research' / eid).glob('*/manifest.json'))
    seen = set()
    for path in manifests:
        manifest = read_json(path)
        cid = manifest['candidate_id']
        if cid in seen:
            continue
        seen.add(cid)
        owner = read_json(root / 'curated/datasets/political' / eid / 'candidates' / (cid + '.json'))
        if not owner:
            continue
        dossier = project(root, eid, owner)
        if not dossier:
            continue
        definitions = {source['id']: source for source in manifest['sources']}
        findings = {finding['id']: finding for finding in dossier['findings']}
        for case in manifest['cases']:
            finding = findings.get(case['id'])
            if finding:
                yield manifest, owner, case, finding, definitions


def shared_evidence(root, profile, library=None):
    sources, events = {}, set()
    for manifest, owner, case, finding, definitions in (reviewed_cases(root, profile) if library is None else library):
        same_party = bool(profile.get('party_name')) and manifest['party_name'] == profile['party_name']
        events.update((action['date'], action['subject']) for action in finding['actions'])
        for evidence in case['evidence']:
            if evidence['role'] == 'platform' and (not same_party or case['commitment']['scope'] != 'party'):
                continue
            definition = definitions[evidence['source_id']]
            url = definition['url']
            entry = sources.setdefault(url, {'source': definition,
                'role': 'party' if evidence['role'] == 'platform' else evidence['role'], 'windows': [], 'statement_dates': []})
            entry['windows'].append({'start': evidence['start'], 'end': evidence['end']})
            if evidence['id'] == case['commitment']['evidence_id']:
                entry['statement_dates'].append({key: case['commitment'][key] for key in ('date', 'date_status', 'scope', 'owner')})
    return list(sources.values()), events


def reusable_cases(root, profile, library=None):
    """Reuse research questions only for the same party and exact independently attributed votes."""
    def event(action):
        return (action['date'], action['subject'], action['stage'], urldefrag(action.get('transcript_url') or '')[0])
    actions = {event(action): action for action in profile['actions'] if action.get('attribution_status') == 'reviewed'}
    cases, sources, pillars = [], {}, set()
    for manifest, owner, case, finding, definitions in (reviewed_cases(root, profile) if library is None else library):
        if manifest['candidate_id'] == profile['id'] or manifest['party_name'] != profile['party_name'] or case['commitment']['scope'] != 'party' or case['pillar_id'] in pillars:
            continue
        if case['id'] in {selected['id'] for selected in cases}:
            continue
        counterparts = [actions.get(event(action)) for action in finding['actions']]
        if not counterparts or any(action is None for action in counterparts):
            continue
        needed = {e['source_id']: definitions[e['source_id']] for e in case['evidence']}
        if any(key in sources and sources[key] != value for key, value in needed.items()):
            continue
        selected = deepcopy(case)
        selected['research_template_actor'] = case.get('research_template_actor', owner['ballot_name'])
        selected['action_ids'] = [action['id'] for action in counterparts]
        selected['question'] = candidate_question(profile, selected, counterparts)
        cases.append(selected)
        sources.update(needed)
        pillars.add(case['pillar_id'])
    return cases, list(sources.values())


def candidate_question(profile, case, actions):
    subjects = '; '.join(dict.fromkeys(action['subject'] for action in actions))
    return (f"How do {profile['ballot_name']}'s recorded votes on {subjects} compare with "
            f"{case['commitment']['owner']}'s stated position: {case['commitment']['summary']}?")


def template_actor(case, library):
    if case.get('research_template_actor'):
        return case['research_template_actor']
    selectors = case['evidence']
    for manifest, owner, original, finding, definitions in library:
        if original['id'] == case['id'] and original['evidence'] == selectors:
            return original.get('research_template_actor', owner['ballot_name'])
    return None
