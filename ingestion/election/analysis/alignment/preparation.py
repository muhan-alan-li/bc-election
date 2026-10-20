"""Prepare bounded evidence and candidate-specific comparison jobs."""
from collections import Counter
from pathlib import Path
import json
import re
from ...platforms import extract
from ...storage import SourceStore, atomic_json, read_json
from ...pipeline import safe_id
from ...workflow import source_ref
from ..service import digest, event_group
from .registry import PILLARS, VERSION, pillar_id
from .prompts import SYSTEM, SCHEMA
from .evidence import plain, window, profile_hash, validate_commitment_date


def validate_bill_sources(actions, evidence):
    """BC bill identifiers must match the voted bill and parliamentary session."""
    operative = [row for row in evidence if row['role'] in {'operative_bill', 'operative_amendment'}]
    if not any('bclaws.gov.bc.ca/' in row['source']['url'] for row in operative):
        return
    for action in actions:
        bill = re.search(r'\bbill\s+(M|Pr)?\s*(\d+)\b', action.get('subject', ''), re.I)
        session = re.search(r'/Debates/(\d+(?:st|nd|rd|th))(\d+(?:st|nd|rd|th))/', action.get('transcript_url') or '')
        if not bill or not session:
            continue
        prefix = 'mem' if (bill[1] or '').lower() == 'm' else 'pr' if bill[1] else 'gov'
        number = int(bill[2])
        matched = False
        for row in operative:
            url = row['source']['url']
            current = re.search(r'/(gov|mem|pr)(\d+)-\d+_' + re.escape(session[1] + session[2]) + r'(?:[?#]|$)', url)
            previous = re.search(re.escape(session[2] + session[1]) + r':(gov|mem|pr)(\d+)-\d+(?:[?#]|$)', url)
            document = current or previous
            if document and document[1] == prefix and int(document[2]) == number:
                matched = True
            if row['role'] == 'operative_amendment' and session[0] in url and re.search(re.escape(bill[0]) + r'\b', row['text'], re.I):
                matched = True
        if not matched:
            raise ValueError('Operative evidence does not match the voted bill and parliamentary session: ' + action['subject'])

def prepare(root, manifest, *, offline=False, refresh=False):
    root = Path(root)
    eid, cid = safe_id(manifest['election_id']), safe_id(manifest['candidate_id'])
    profile = read_json(root / 'curated/datasets/political' / eid / 'candidates' / (cid + '.json'))
    if not profile or profile['person_id'] != manifest['person_id'] or profile['party_name'] != manifest['party_name']:
        raise ValueError('Research identity or party does not match reviewed profile')
    if not manifest.get('cases'):
        raise ValueError('Research manifest needs at least one sourced comparison case')
    case_ids = [case['id'] for case in manifest['cases']]
    source_ids = [source['id'] for source in manifest['sources']]
    if len(case_ids) != len(set(case_ids)) or len(source_ids) != len(set(source_ids)):
        raise ValueError('Research case and source IDs must be unique')
    for value in case_ids + source_ids:
        safe_id(value)
    actions = {a['id']: a for a in profile['actions']}
    store = SourceStore(root, offline=offline, refresh=refresh)
    sources = {}
    for spec in manifest['sources']:
        body, meta = store.get(spec['url'])
        _, pages, status = extract(body)
        if status != 'extracted' or not pages:
            raise ValueError('Source cannot be extracted')
        sources[spec['id']] = {'text': plain('\n'.join(p['text'] for p in pages)),
            'source': source_ref(meta, spec['title'], spec['publisher'])}
    jobs = []
    for case in manifest['cases']:
        topic = pillar_id(case)
        selected = []
        for aid in case['action_ids']:
            action = actions.get(aid)
            if not action or action.get('attribution_status') != 'reviewed' or action['position'] not in {'yea', 'nay'}:
                raise ValueError('Comparison requires available, reviewed named votes')
            selected.append({k: action.get(k) for k in ('id', 'date', 'subject', 'stage', 'position', 'source', 'transcript_url')})
        evidence = []
        for spec in case['evidence']:
            doc = sources[spec['source_id']]
            evidence.append({'id': spec['id'], 'role': spec['role'], 'text': window(doc['text'], spec),
                'source': {**doc['source'], 'url': doc['source']['url'] + spec.get('fragment', '')}})
        validate_bill_sources(selected, evidence)
        commitment = case['commitment']
        if commitment['scope'] not in {'party', 'candidate'} or commitment['evidence_id'] not in {e['id'] for e in evidence}:
            raise ValueError('Commitment requires dated source evidence and explicit ownership')
        platform_spec = next(e for e in case['evidence'] if e['id'] == commitment['evidence_id'])
        platform_doc = sources[platform_spec['source_id']]
        validate_commitment_date(commitment, platform_doc)
        quote = plain(commitment['quote'])
        if quote not in window(platform_doc['text'], platform_spec) or not quote or len(quote.split()) > 25:
            raise ValueError('Commitment quotation is not grounded in its source window')
        if not selected:
            raise ValueError('Finding requires a substantive action')
        payload = {'case_id': case['id'], 'question': case['question'], 'candidate': profile['ballot_name'],
            'commitment': commitment, 'actions': selected, 'evidence': evidence, 'output_schema': SCHEMA}
        if case.get('research_template_actor'):
            payload['research_template_actor'] = case['research_template_actor']
            payload['actor_rule'] = 'The template actor is a different person; assess only the supplied candidate and their own indexed votes.'
        messages = [{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': json.dumps(payload, ensure_ascii=False)}]
        job = {'id': case['id'], 'pillar_id': topic, 'payload': payload, 'messages': messages,
            'input_hash': digest({'version': VERSION, 'pillar_id': topic, 'messages': messages})}
        jobs.append(job)
        atomic_json(root / 'normalized/alignment' / eid / cid / 'jobs' / (safe_id(case['id']) + '.json'), job)
    selected_ids = {aid for c in manifest['cases'] for aid in c['action_ids']}
    screening = []
    for action in profile['actions']:
        stage, subject = action['stage'].lower(), action['subject'].lower()
        if action['id'] in selected_ids:
            category, reason = 'selected', 'Exact vote paired with substantive text and a sourced platform comparison.'
        elif stage in {'title', '1r'} or re.search(r'committee rise|sitting hours|business schedule|adjourn', stage + ' ' + subject):
            category, reason = 'procedural', 'Does not isolate a substantive policy choice.'
        elif subject == 'budget' or 'supply act' in subject or 'speech from the throne' in subject:
            category, reason = 'bundled', 'Package-wide approval cannot resolve an individual commitment.'
        else:
            category, reason = 'not_assessed', 'Outside the selected comparisons; not evidence for or against alignment.'
        screening.append({'action_id': action['id'], 'category': category, 'reason': reason})
    dossier = {'schema_version': 1, 'kind': 'candidate_alignment_analysis', 'analysis_version': VERSION,
        'id': cid, 'person_id': profile['person_id'], 'election_id': eid, 'ballot_name': profile['ballot_name'],
        'profile_input_hash': profile_hash(profile), 'scope': manifest['scope'],
        'source_hashes': [{'url': row['source']['url'], 'sha256': row['source']['sha256']} for row in sources.values()],
        'pillars': [dict(pillar) for pillar in PILLARS], 'review_status': 'draft', 'coverage': {'indexed_votes': len(profile['actions']),
            'selected_votes': len(selected_ids), 'distinct_legislation': len({event_group(actions[aid]) for aid in selected_ids}),
            'screening_counts': dict(Counter(row['category'] for row in screening)),
            'vote_date_range': {'from': min(a['date'] for a in profile['actions']), 'to': max(a['date'] for a in profile['actions'])}},
        'screening': screening, 'findings': [], 'unassessed_commitments': []}
    for item in manifest.get('unassessed_commitments', []):
        pillar_id(item)
        doc = sources[item['source_id']]
        quote = plain(item['quote'])
        if quote not in doc['text'] or len(quote.split()) > 25:
            raise ValueError('Unassessed commitment quote is not grounded')
        validate_commitment_date(item, doc)
        dossier['unassessed_commitments'].append({k: v for k, v in item.items() if k != 'source_id'} | {'source': doc['source']})
    return profile, jobs, dossier
