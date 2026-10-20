"""Evidence windows, source dates, and candidate input fingerprints."""
from datetime import date, datetime
import re
from zoneinfo import ZoneInfo
from ..service import digest

def plain(text):
    return ' '.join(text.replace('\u00ad', '').split())



def window(text, selector):
    """Explicit source windows fail closed when markers disappear or become ambiguous."""
    text, start, end = plain(text), plain(selector['start']), plain(selector['end'])
    positions = [m.start() for m in re.finditer(re.escape(start), text)]
    if len(positions) != 1:
        raise ValueError(f'Source start marker is missing or ambiguous: {start[:80]}')
    begin = positions[0]
    stop = text.find(end, begin)
    while stop >= 0 and stop + len(end) < begin + len(start):
        stop = text.find(end, stop + 1)
    if stop < 0:
        raise ValueError(f'Source end marker is missing: {end[:80]}')
    selected = text[begin:stop + len(end)]
    if len(selected) > 24000:
        raise ValueError('Evidence window exceeds bound; choose a narrower operative section')
    return selected



def profile_hash(profile):
    return digest({k: profile.get(k) for k in ('id', 'person_id', 'election_id', 'party_name', 'actions')})



def validate_commitment_date(commitment, document):
    dated = date.fromisoformat(commitment['date'])
    if commitment.get('date_status') == 'published':
        marker = f"{dated.strftime('%B')} {dated.day}, {dated.year}"
        if marker not in document['text']:
            raise ValueError('Published commitment date is not present in the source')
    elif commitment.get('date_status') == 'observed_at_capture':
        observed = datetime.fromisoformat(document['source']['retrieved_at']).astimezone(ZoneInfo('America/Vancouver')).date()
        if dated != observed:
            raise ValueError('Observed commitment date must match the source capture in Vancouver')
    else:
        raise ValueError('Commitment date provenance is required')
