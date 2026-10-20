"""Backend-owned pillar presentation, including explicit unresearched states."""
from .registry import PILLARS


def comparison_guide(profile):
    analysis = profile.get('alignment_analysis') or {}
    findings = analysis.get('findings', []) if analysis.get('review_status') == 'source_checked' else []
    reviewed_pillars = {p['id']: p for p in analysis.get('pillars', [])}
    pillars = []
    for definition in PILLARS:
        selected = [finding for finding in findings if finding['pillar_id'] == definition['id']]
        tones = {finding_tone(finding['status']) for finding in selected}
        tone = next(iter(tones)) if len(tones) == 1 else 'inconclusive' if tones else None
        takeaway = reviewed_pillars.get(definition['id'], {}).get('takeaway') if selected else None
        pillars.append({**definition, 'takeaway': takeaway,
            'comparison_count': len(selected), 'alignment_status': tone,
            'alignment_note': takeaway or 'No source-checked comparisons have been published for this topic yet.'})
    return {'schema_version': 1, 'scope': 'Compare campaign positions with recorded political choices, issue by issue.',
        'pillars': pillars}


def finding_tone(status):
    if status in {'supports_commitment', 'consistent_with_later_position'}:
        return 'aligned'
    if status == 'potential_tension':
        return 'against'
    return 'inconclusive'
