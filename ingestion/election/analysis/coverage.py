"""Report analysis coverage from published profiles, including every skipped candidate."""
from collections import Counter
import csv
from pathlib import Path

from ..storage import atomic_json, read_json, now


def build_report(root, election_id, output):
    root, output = Path(root), Path(output)
    rows = []
    for path in sorted((root / 'published/political' / election_id / 'candidates').glob('*.json')):
        profile = read_json(path)
        coverage = profile.get('coverage', {})
        collected = coverage.get('voting', {}).get('count', 0)
        published = sum(action.get('record_type') == 'recorded_vote' for action in profile.get('actions', []))
        analysis = profile.get('alignment_analysis') or {}
        findings = len(analysis.get('findings', [])) if analysis.get('review_status') == 'source_checked' else 0
        status = ('analyzed' if findings else 'skipped_no_collected_votes' if not collected else
                  'pending_identity' if coverage.get('identity_status') != 'reviewed' else 'pending_analysis')
        rows.append({'candidate_id': profile['id'], 'candidate': profile['ballot_name'],
                     'constituency': profile['district_code'], 'party': profile['party_name'],
                     'collected_votes': collected, 'published_votes': published,
                     'published_comparisons': findings, 'status': status})
    if not rows:
        raise ValueError('No published candidates available for coverage reporting')
    rows.sort(key=lambda row: (row['candidate'].casefold(), row['constituency']))
    report = {'generated_at': now(), 'election_id': election_id, 'candidates': rows,
              'counts': dict(Counter(row['status'] for row in rows)),
              'complete_for_candidates_with_votes': all(row['status'] == 'analyzed' for row in rows if row['collected_votes'])}
    output.mkdir(parents=True, exist_ok=True)
    atomic_json(output / 'analysis-coverage.json', report)
    with (output / 'analysis-coverage.csv').open('w', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    lines = ['# Published candidate analysis coverage', '', f"Generated: {report['generated_at']}", '',
             'This report checks published comparisons, not the presence of a layout or a private draft.', '',
             'No collected votes means no records in the current collection; it does not establish no political experience.', '']
    for title, selected in [('Candidates with voting records still awaiting analysis', [r for r in rows if r['collected_votes'] and r['status'] != 'analyzed']),
                            ('Analyzed candidates', [r for r in rows if r['status'] == 'analyzed']),
                            ('Skipped candidates: no collected voting record', [r for r in rows if r['status'] == 'skipped_no_collected_votes'])]:
        lines += [f'## {title} ({len(selected)})', '', '| Candidate | Constituency | Collected votes | Published comparisons | Status |',
                  '| --- | --- | ---: | ---: | --- |']
        lines += [f"| {r['candidate']} | {r['constituency']} | {r['collected_votes']} | {r['published_comparisons']} | {r['status']} |" for r in selected]
        lines += ['']
    (output / 'analysis-coverage.md').write_text('\n'.join(lines))
    return report
