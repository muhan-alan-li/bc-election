import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from election.political import Transcript, categorize, division_context, platform_passages, build_profiles, polish_profiles, collect_transcripts
from election.storage import atomic_json, read_json, SourceStore

class PoliticalTests(unittest.TestCase):
    def test_division_and_ambiguity(self):
        html = '''<p class="Subject-Heading" id="housing">Housing Act</p><p class="SpeakerBegins"><span class="Speaker-Name">A. Example</span>: I move that the bill be read a second time.</p><p class="Time-Stamp" id="1B:1000">Time</p><p>Motion carried on the following division:</p><table class="DivisionTable"><tr><th>YEAS — 40</th><th>NAYS — 30</th></tr></table><p class="Time-Stamp" id="1B:1005">Time</p>'''
        blocks = Transcript(html).blocks
        context = division_context(blocks, '1B:1000')
        self.assertIn('second time', context['question'])
        self.assertIn('carried', context['outcome'])
        self.assertEqual(blocks[1]['speaker'], 'A. Example')
        ambiguous = html.replace('<p class="Time-Stamp" id="1B:1005">', '<p>Motion negatived.</p><table class="DivisionTable">YEAS — 20 NAYS — 50</table><p class="Time-Stamp" id="1B:1005">')
        context = division_context(Transcript(ambiguous).blocks, '1B:1000')
        self.assertIsNone(context['outcome']); self.assertIsNone(context['question'])
        self.assertEqual(context['status'], 'ambiguous_needs_review')
        self.assertEqual(division_context(blocks, 'missing')['status'], 'locator_not_found')

    def test_legacy_format_duplicate_ids_and_next_subject(self):
        html = '<p class="speaker-begins"><span class="attribution">Hon. A. Example: </span>I move that the housing bill be read a second time.</p><p class="timeline"><a id="1B:1000">Time</a></p><p class="styleline">Motion approved on the following division:</p><table class="division-table">YEAS — 40 NAYS — 30</table><p class="subject-heading" id="next">Different Bill</p><p class="speaker-begins"><span class="attribution">B. Other: </span>I move that a different bill be introduced.</p><p class="styleline-time" id="1B:1000">The House adjourned.</p>'
        blocks = Transcript(html).blocks
        self.assertEqual(blocks[0]['speaker'], 'Hon. A. Example')
        context = division_context(blocks, '1B:1000')
        self.assertIn('housing', context['question'])
        self.assertNotIn('different bill', context['excerpt'])
        self.assertEqual(context['status'], 'extracted_needs_review')

    def test_topics_and_verbatim_passages(self):
        self.assertEqual(categorize('A transparent account of the parent company')['topics'], ['uncategorized'])
        self.assertEqual(categorize('Housing and health care')['topics'], ['healthcare', 'housing'])
        p = {'id': 'p', 'kind': 'candidate_platform', 'documents': [{'id': 'doc', 'source': {'url': 'https://example.org'}, 'pages': [{'page': 2, 'text': 'Privacy policy for health visitors and their data.\nWe will build affordable housing near public transit.\nWe will build affordable housing near public transit.'}]}]}
        rows = platform_passages(p)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['text'], 'We will build affordable housing near public transit.')
        self.assertEqual(rows[0]['locator'], {'page': 2, 'line': 2})
        self.assertEqual(rows[0]['review_status'], 'unreviewed'); self.assertIsNone(rows[0]['date'])

    def fixture(self, root, reviewed=True):
        person = {'id': 'person', 'name': 'Alex Example', 'reviewed_at': '2026-10-08' if reviewed else None, 'legislative_aliases': ['Example, Alex'], 'office_history': []}
        atomic_json(root / 'curated/identities.json', {'people': [person]})
        record = {'candidacy_id': 'candidacy-1', 'person_id': 'person', 'ballot_name': 'Alex Example', 'district_code': 'SYN', 'party_name': None, 'roster_source': {'url': 'https://example.org/roster'}, 'voting_aliases': ['Example, Alex'], 'vote_index_entries': [{'member_label': 'Example, Alex (Synthetic)', 'subject': 'Housing Act', 'stage': '2R', 'position': 'yea', 'record_type': 'recorded_division', 'date': '2026-01-01', 'transcript_url': 'https://example.org/20260101am-Hansard.html#1B:1000', 'source': {'url': 'https://example.org/index'}, 'review_status': 'index_only'}], 'coverage': {'voting_since': 2020, 'errors': []}}
        atomic_json(root / 'normalized/test/candidate-records/candidacy-1.json', record)
        return record

    def test_review_revocation_and_repeatable_offline_build(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); self.fixture(root)
            with patch('election.storage.urlopen', side_effect=AssertionError('Network called')):
                summary = build_profiles(root, 'test'); paths = polish_profiles(root, 'test')
                first = paths[0].read_bytes()
                build_profiles(root, 'test'); polish_profiles(root, 'test')
                self.assertEqual(first, paths[0].read_bytes())
                self.assertEqual(summary['vote_entries'], 1)
                self.assertEqual(len(read_json(paths[0])['actions']), 1)
                self.assertEqual(read_json(paths[0])['actions'][0]['record_type'], 'recorded_vote')
                self.fixture(root, reviewed=False)
                build_profiles(root, 'test'); polish_profiles(root, 'test')
                output = read_json(paths[0]); self.assertEqual(output['actions'], [])
                self.assertEqual(output['topic_groups'][0]['action_ids'], [])
                self.assertEqual(len(read_json(root / 'normalized/political/test/candidates/candidacy-1.json')['actions']), 1)

    def test_failed_refresh_preserves_evidence(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); record = self.fixture(root)
            url = record['vote_index_entries'][0]['transcript_url'].split('#')[0]
            SourceStore(root, offline=True)._save(url, b'<html><p class="Time-Stamp" id="1B:1000">Time</p><p class="SpeakerBegins">A speech</p></html>')
            first = collect_transcripts(root, 'test', offline=True)
            self.assertEqual(first['results'][0]['status'], 'collected')
            evidence = next((root / 'normalized/political/test/transcripts').glob('*.json')); previous = evidence.read_bytes()
            with patch('election.storage.urlopen', side_effect=OSError('offline server')):
                second = collect_transcripts(root, 'test', refresh=True)
            self.assertEqual(second['results'][0]['status'], 'failed'); self.assertEqual(previous, evidence.read_bytes())
            self.assertTrue(evidence.with_suffix('.attempt.json').exists())
            self.assertEqual(len(build_profiles(root, 'test')['transcript_errors']), 1)

if __name__ == '__main__':
    unittest.main()
