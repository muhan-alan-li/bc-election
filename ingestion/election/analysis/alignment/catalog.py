"""Bounded, provenance-bearing evidence catalogs for automated research jobs."""
from urllib.parse import urldefrag, urlparse
from datetime import datetime
from zoneinfo import ZoneInfo
import re

from ...parsers import Links
from ...platforms import extract
from ...storage import SourceStore
from ...workflow import source_ref
from ..service import digest
from .evidence import plain
from .evidence import window


def model_sources(documents):
    """Expose one selectable ID per document, keeping provenance IDs out of prompts."""
    return [{**doc, 'source': {key: value for key, value in doc['source'].items() if key != 'source_id'}} for doc in documents]


def bill_sources(actions, limit=6):
    """Official versioned bill routes are discovery leads, never evidence until fetched."""
    sources, seen = [], set()
    for action in actions:
        bill = re.search(r'\bbill\s+(\d+)\b', action.get('subject', ''), re.I)
        session = re.search(r'/Debates/(\d+)(?:st|nd|rd|th)(\d+(?:st|nd|rd|th))/', action.get('transcript_url', ''))
        if not bill or not session or action.get('stage', '').lower() not in {'2r', '3r'}:
            continue
        parliament, sitting = int(session[1]), session[2]
        reading = '3' if action['stage'].lower() == '3r' else '1'
        number = bill[1].zfill(2)
        suffix = 'th' if 10 <= parliament % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(parliament % 10, 'th')
        parliament_label = f'{parliament}{suffix}'
        if parliament >= 43:
            route = f'billscurrent/gov{number}-{reading}_{parliament_label}{sitting}'
        else:
            route = f'billsprevious/{sitting}{parliament_label}:gov{number}-{reading}'
        url = 'https://www.bclaws.gov.bc.ca/civix/document/id/bills/' + route
        if url in seen:
            continue
        seen.add(url)
        sources.append(({'url': url, 'title': action['subject'] + f' (version {reading})',
                         'publisher': "King's Printer for British Columbia"}, 'operative_bill'))
        if len(sources) == limit:
            break
    return sources


def catalog(root, profile, party=None, *, offline=False, refresh=False, extra_sources=(), hints=(), max_sources=18, max_chars=18000, shared=()):
    store = SourceStore(root, offline=offline, refresh=refresh)
    seeds = [(d['source'], 'candidate') for d in profile.get('documents', [])[:4]]
    seeds += [(d['source'], 'party') for d in (party or {}).get('documents', [])[:4]]
    seeds += [(source, 'identity') for source in extra_sources]
    shared_map = {entry['source']['url']: entry for entry in shared}
    if shared:
        seeds = [(entry['source'], entry['role']) for entry in shared] + seeds
        max_sources = max(max_sources, len(shared) + 6)
    leads = bill_sources(profile.get('actions', []))
    seeds = leads + seeds
    max_sources += len(leads)
    for action in profile.get('actions', []):
        if action.get('transcript_url') and action.get('stage', '').lower() not in {'title', '1r'}:
            seeds.append(({'url': urldefrag(action['transcript_url'])[0], 'title': 'Assembly transcript', 'publisher': 'Legislative Assembly of BC'}, 'debate'))
    documents, errors, seen = [], [], set()
    while seeds and len(documents) < max_sources:
        source, role = seeds.pop(0)
        url = urldefrag(source['url'])[0]
        if url in seen:
            continue
        seen.add(url)
        try:
            body, meta = store.get(url)
            _, pages, status = extract(body)
            if status != 'extracted' or not pages:
                raise ValueError('Source text could not be extracted')
            text = plain('\n'.join(p['text'] for p in pages))
            reusable = shared_map.get(url)
            if reusable:
                selected = list(dict.fromkeys(window(text, selector) for selector in reusable['windows']))
                text = '\n'.join(selected)
            source_hints = list(hints)
            if role == 'debate':
                related = [action for action in profile.get('actions', []) if urldefrag(action.get('transcript_url', ''))[0] == url]
                source_hints = [plain((action.get('transcript_context') or {}).get('excerpt') or '')[:160] for action in related]
                source_hints = [hint for hint in source_hints if len(hint) > 30]
                if not any(hint in text for hint in source_hints):
                    source_hints = [action.get('subject', '') for action in related]
            if source_hints:
                matches = [text.find(plain(hint)) for hint in source_hints if hint and plain(hint) in text]
                if matches:
                    start = max(0, min(matches) - (6000 if role == 'debate' else 1500))
                    text = text[start:start + max_chars]
            reference = source_ref(meta, source.get('title', 'Research source'), source.get('publisher') or urlparse(url).hostname)
            observed = datetime.fromisoformat(meta['retrieved_at']).astimezone(ZoneInfo('America/Vancouver')).date().isoformat()
            documents.append({'id': 'source-' + digest(url)[:16], 'role': role, 'source': reference, 'observed_date': observed,
                'statement_dates': reusable['statement_dates'] if reusable else [], 'text': text[:max_chars]})
            # Only primary legislative links found in supplied pages are eligible.
            if role == 'debate':
                for link in Links(body.decode('utf-8', errors='replace'), url).links:
                    host = (urlparse(link['url']).hostname or '').lower()
                    if host in {'www.bclaws.gov.bc.ca', 'bclaws.gov.bc.ca', 'www.leg.bc.ca', 'leg.bc.ca', 'api.lims.leg.bc.ca'} and any(word in link['url'].lower() for word in ('bills', 'statreg', 'bill')):
                        seeds.insert(0, ({'url': link['url'], 'title': link['text'] or 'Operative legislation', 'publisher': host}, 'operative_bill'))
        except (ValueError, OSError) as error:
            errors.append({'url': url, 'message': str(error)})
    return documents, errors
