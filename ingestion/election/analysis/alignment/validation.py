"""Validate quotations, chronology, attribution, and published dossiers."""
from collections import Counter
import re
from .registry import STATUSES, PILLARS, VERSION, pillar_id
from .prompts import SCHEMA
from .evidence import plain, profile_hash

def validate_result(result, job):
    if not isinstance(result, dict) or set(result) != set(SCHEMA) or result['case_id'] != job['id'] or result['status'] not in STATUSES:
        raise ValueError('Invalid comparison envelope')
    for key, maximum in {'headline': 140, 'policy_effect': 700, 'assessment': 900, 'counterargument': 700, 'limits': 700}.items():
        if not isinstance(result[key], str) or not 1 <= len(result[key]) <= maximum:
            raise ValueError(f'Invalid comparison {key}')
    actor = job['payload'].get('research_template_actor')
    candidate = job['payload']['candidate']
    if actor and actor != candidate:
        foreign = actor.split()[-1]
        own = candidate.split()[-1]
        if foreign != own and re.search(r'\b' + re.escape(foreign) + r'\b', result['headline'], re.I) and not re.search(r'\b' + re.escape(own) + r'\b', result['headline'], re.I):
            raise ValueError('Comparison headline attributes the vote to the template actor instead of the supplied candidate')
    citations = result['citations']
    if not isinstance(citations, list) or not citations:
        raise ValueError('Comparison needs source citations')
    evidence = {e['id']: e for e in job['payload']['evidence']}
    words = Counter()
    for citation in citations:
        if not isinstance(citation, dict) or set(citation) != {'evidence_id', 'quote'}:
            raise ValueError('Invalid citation')
        row = evidence.get(citation['evidence_id'])
        quote = plain(citation['quote']) if isinstance(citation['quote'], str) else ''
        if not row or len(quote) < 8 or quote not in plain(row['text']):
            raise ValueError('Comparison quote is not present in evidence')
        words[row['source']['source_id']] += len(quote.split())
    if any(count > 25 for count in words.values()):
        raise ValueError('Comparison quotes exceed 25 words per source')
    roles = {evidence[c['evidence_id']]['role'] for c in citations}
    if 'platform' not in roles or not roles & {'operative_bill', 'operative_amendment'}:
        raise ValueError('Comparison needs platform and operative policy citations')
    commitment = job['payload']['commitment']
    earliest = min(a['date'] for a in job['payload']['actions'])
    if result['status'] == 'supports_commitment' and earliest < commitment['date']:
        raise ValueError('Earlier action cannot fulfill a later commitment')
    if result['status'] == 'consistent_with_later_position' and earliest >= commitment['date']:
        raise ValueError('Later-position comparison has incorrect chronology')



def validate_dossier(dossier, profile):
    if dossier.get('schema_version') != 1 or dossier.get('kind') != 'candidate_alignment_analysis' or dossier.get('analysis_version') != VERSION:
        raise ValueError('Invalid alignment dossier')
    if any(dossier.get(k) != profile.get(k) for k in ('id', 'person_id', 'election_id')) or dossier.get('profile_input_hash') != profile_hash(profile):
        raise ValueError('Alignment dossier is stale or belongs to another candidate')
    if dossier.get('review_status') != 'source_checked' or not dossier.get('findings'):
        raise ValueError('Only source-checked comparisons can be published')
    pillars = dossier.get('pillars', [])
    if [p.get('id') for p in pillars] != [p['id'] for p in PILLARS]:
        raise ValueError('Published dossier requires the shared pillar registry')
    assessed = {pillar_id(f) for f in dossier['findings']}
    for pillar in pillars:
        takeaway = pillar.get('takeaway')
        if (pillar['id'] in assessed and (not isinstance(takeaway, str) or not takeaway.strip())) or (pillar['id'] not in assessed and takeaway is not None):
            raise ValueError('Pillar takeaway must correspond to assessed findings')
    for commitment in dossier.get('unassessed_commitments', []):
        pillar_id(commitment)
    actions = {a['id']: a for a in profile['actions']}
    for finding in dossier['findings']:
        pillar_id(finding)
        if finding['status'] not in STATUSES or not finding.get('citations'):
            raise ValueError('Invalid published comparison')
        for action in finding['actions']:
            current = actions.get(action['id'])
            if not current or current.get('attribution_status') != 'reviewed' or any(action[k] != current.get(k) for k in action):
                raise ValueError('Comparison references unavailable or changed votes')
        for citation in finding['citations']:
            if not citation.get('quote') or not citation.get('source', {}).get('sha256'):
                raise ValueError('Comparison citation needs source provenance')
