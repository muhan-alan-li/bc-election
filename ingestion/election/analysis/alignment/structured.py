"""Prepare exact source windows from collected passages; conclusions still require review."""
from datetime import datetime
import re
from urllib.parse import urldefrag
from zoneinfo import ZoneInfo

from ...storage import SourceStore
from ...platforms import extract
from ..service import digest
from .catalog import bill_sources
from .evidence import plain, window

KEYWORDS = {
    'housing': r'rent|housing|homes|tenancy|residential',
    'healthcare': r'health|doctor|hospital|medical|nurse|patient',
    'affordability': r'tax|insurance|childcare|child care|household',
    'economy': r'employment|worker|jobs|union|trade|business|labour|labor|compensation',
    'public_safety': r'police|crime|justice|addiction|drug|recovery|safety',
    'climate': r'climate|energy|forest|emission|pollution|environment|electric',
}


def policy_position(text, scope):
    if re.search(r'policy committee|develop\w* .{0,40}policy (?:pillars|platform)|foundational (?:areas|pillars)', text, re.I):
        return False
    if scope == 'candidate' and re.match(r'I (?:was|served|worked|grew|have worked)\b', text, re.I):
        return False
    if not re.search(r'\b(will|would|must|should|commit|pledge|promise|support|oppose|defend|protect|expand|reduce|increase|build|lower|raise|invest|fund|repeal|remove|keep|create|strengthen|pushing|ensure|cut|freeze|improve|implement)\w*\b', text, re.I):
        return False
    if re.match(r'they\b|(?:the )?conservatives\b|he\b|she\b', text, re.I):
        return False
    if scope == 'candidate' and not re.match(r'I\b|We\b|Will\b|Build|Keep|Lower|Oppos|Stand|Push|Defend|Protect|Expand|Reduc|Increas|Invest|Fund|Repeal|Remov|Creat|Strengthen|Ensur|Cut|Freez|Improv|Implement', text, re.I):
        return False
    return True


def bounded_selector(text, excerpt):
    """Keep a verbatim excerpt with enough surrounding text to locate it uniquely."""
    text, excerpt = plain(text), plain(excerpt)
    offset = text.find(excerpt)
    if offset < 0 or not excerpt:
        raise ValueError('Collected passage is not present in the current source')
    for margin in (0, 200, 800, 2000):
        selected = text[max(0, offset - margin):min(len(text), offset + len(excerpt) + margin)]
        if len(selected) <= 24000 and text.count(selected) == 1:
            selector = {'start': selected, 'end': selected}
            window(text, selector)
            return selector
    raise ValueError('Passage cannot be uniquely bounded')


def passage_cases(root, profile, party=None, *, offline=False, limit=2, excluded_case_ids=()):
    """Select research inputs using topic leads, never infer alignment from those leads."""
    store = SourceStore(root, offline=offline)
    passages = [(p, 'party', profile['party_name']) for p in (party or {}).get('policy_passages', [])]
    passages += [(p, 'candidate', profile['ballot_name']) for p in profile.get('policy_passages', [])]
    actions = sorted((a for a in profile['actions'] if a.get('attribution_status') == 'reviewed'
                      and a.get('stage', '').lower() in {'2r', '3r'} and a.get('position') in {'yea', 'nay'}
                      and not re.search(r'budget|supply act|miscellaneous', a['subject'], re.I)),
                     key=lambda a: (a['date'], a['id']), reverse=True)
    cases, definitions, gaps, used = [], {}, [], set()
    for action in actions:
        pillars = [key for key, pattern in KEYWORDS.items() if re.search(pattern, action['subject'], re.I)]
        leads = bill_sources([action], limit=1)
        if not pillars or not leads or all(pillar in used for pillar in pillars):
            continue
        bill, _ = leads[0]
        try:
            body, meta = store.get(bill['url'])
            bill_text = plain(' '.join(page['text'] for page in extract(body)[1]))
            # A bounded initial operative window includes the bill/version heading.
            bill_selector = bounded_selector(bill_text, bill_text[:16000])
        except (ValueError, OSError) as error:
            gaps.append({'url': bill['url'], 'reason': str(error)})
            continue
        for pillar in pillars:
            if pillar in used:
                continue
            for passage, scope, owner in passages:
                case_id = 'passage-case-' + digest([profile['id'], action['id'], passage['id']])[:16]
                if case_id in excluded_case_ids:
                    continue
                text = plain(passage.get('text', ''))
                if not owner or not 50 <= len(text) <= 900 or not re.search(KEYWORDS[pillar], text, re.I):
                    continue
                if not policy_position(text, scope):
                    continue
                url = urldefrag(passage['source']['url'])[0]
                try:
                    body, capture = store.get(url)
                    source_text = plain(' '.join(page['text'] for page in extract(body)[1]))
                    selector = bounded_selector(source_text, text)
                    quote = ' '.join(text.split()[:25])
                    if quote not in source_text:
                        continue
                except (ValueError, OSError) as error:
                    gaps.append({'url': url, 'reason': str(error)})
                    continue
                platform_id, bill_id = 'source-' + digest(url)[:16], 'source-' + digest(bill['url'])[:16]
                observed = datetime.fromisoformat(capture['retrieved_at']).astimezone(ZoneInfo('America/Vancouver')).date().isoformat()
                definitions[platform_id] = {'id': platform_id, 'url': url, 'title': passage['source']['title'], 'publisher': passage['source']['publisher']}
                definitions[bill_id] = {'id': bill_id, **bill}
                cases.append({'id': case_id,
                    'pillar_id': pillar,
                    'question': f"How does {profile['ballot_name']}'s {action['stage']} {action['position']} vote on {action['subject']} compare with this stated position?",
                    'action_ids': [action['id']],
                    'commitment': {'owner': owner, 'scope': scope, 'kind': 'position', 'date': observed,
                        'date_status': 'observed_at_capture', 'summary': quote + ('…' if quote != text else ''), 'quote': quote, 'evidence_id': 'platform'},
                    'evidence': [{'id': 'platform', 'source_id': platform_id, 'role': 'platform', **selector},
                                 {'id': 'operative', 'source_id': bill_id, 'role': 'operative_bill', **bill_selector}]})
                used.add(pillar)
                break
            if cases and cases[-1]['action_ids'] == [action['id']]:
                # One vote can mention several topics; keep its comparison in
                # one primary pillar rather than duplicate the same case ID.
                break
        if len(cases) == limit:
            return cases, list(definitions.values()), gaps
    return cases, list(definitions.values()), gaps
