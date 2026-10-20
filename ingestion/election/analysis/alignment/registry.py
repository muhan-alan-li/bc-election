"""Shared research pillars and comparison statuses."""
import json
from pathlib import Path

VERSION = 'commitment-comparison-v1'
PILLARS = json.loads((Path(__file__).parent.parent / 'pillars.json').read_text())
PILLAR_IDS = {pillar['id'] for pillar in PILLARS}

STATUSES = {'supports_commitment', 'consistent_with_later_position', 'potential_tension', 'inconclusive'}

def pillar_id(item):
    value = item.get('pillar_id')
    if value not in PILLAR_IDS:
        raise ValueError('Comparison requires a recognized pillar_id')
    return value
