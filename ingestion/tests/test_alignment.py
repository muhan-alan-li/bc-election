import copy
import json
from pathlib import Path
import tempfile
import unittest

from election.analysis.alignment import (
    build_reviewed, prepare, profile_hash, project, run, validate_dossier,
    validate_result, window,
)
from election.storage import SourceStore, atomic_json, read_json


class FakeProvider:
    identity = {'model': 'test', 'endpoint': 'https://example.com/chat'}

    def __init__(self):
        self.calls = 0

    def complete(self, messages):
        self.calls += 1
        payload = json.loads(messages[1]['content'])
        return answer(payload['case_id']), {'usage': {'prompt_tokens': 20, 'completion_tokens': 10}}


def answer(cid='case'):
    return {'case_id': cid, 'status': 'supports_commitment', 'headline': 'Supported rent freeze',
        'policy_effect': 'Invalidates annual increase notices until 2022.',
        'assessment': 'Supports the previously promised freeze.',
        'counterargument': 'Does not cover every tenancy.', 'limits': 'No inference about motives.',
        'citations': [{'evidence_id': 'promise', 'quote': 'Freeze rents through 2021.'},
                      {'evidence_id': 'bill', 'quote': 'No increase before January 1, 2022.'}]}


class AlignmentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.profile = {'id': 'c', 'person_id': 'p', 'election_id': 'e', 'party_name': 'Party', 'ballot_name': 'Alex',
            'actions': [{'id': 'a', 'date': '2021-03-02', 'subject': 'Tenancy Bill 7', 'stage': '2R',
                'position': 'yea', 'record_type': 'recorded_vote', 'attribution_status': 'reviewed',
                'source': {'url': 'https://example.com/index'},
                'transcript_url': 'https://example.com/Debates/42nd1st/vote#1'}]}
        self.path = self.root / 'curated/datasets/political/e/candidates/c.json'
        atomic_json(self.path, self.profile)
        self.manifest = {'candidate_id': 'c', 'person_id': 'p', 'party_name': 'Party', 'election_id': 'e',
            'scope': 'Housing pilot.', 'sources': [{'id': 's', 'url': 'https://example.com/source', 'title': 'Source', 'publisher': 'Party'}],
            'cases': [{'id': 'case', 'pillar_id': 'housing', 'question': 'Did they support the freeze?', 'action_ids': ['a'],
                'commitment': {'date': '2020-10-12', 'date_status': 'published', 'quote': 'Freeze rents through 2021.', 'scope': 'party', 'evidence_id': 'promise'},
                'evidence': [{'id': 'promise', 'source_id': 's', 'role': 'platform', 'start': 'Freeze rents', 'end': 'through 2021.'},
                    {'id': 'bill', 'source_id': 's', 'role': 'operative_bill', 'start': 'No increase', 'end': 'January 1, 2022.'}]}]}
        self.store = SourceStore(self.root, offline=True)
        self.store._save('https://example.com/source', b'<html><p>October 12, 2020</p><p>Freeze rents through 2021.</p><p>No increase before January 1, 2022.</p></html>')

    def job(self):
        return prepare(self.root, self.manifest, offline=True)[1][0]

    def review(self):
        job = self.job()
        return {'candidate_id': 'c', 'review_status': 'source_checked', 'reviewer': 'codex_source_review',
            'reviewed_at': '2026-10-09', 'takeaway': 'Supported a specific rental measure.',
            'pillar_takeaways': {'housing': 'Supported a specific rental measure.'},
            'findings': {'case': {'input_hash': job['input_hash'], 'result': answer()}}}

    def test_pillars_are_explicit_and_bound_to_review(self):
        review = self.review()
        original = self.job()['input_hash']
        self.manifest['cases'][0]['pillar_id'] = 'healthcare'
        self.assertNotEqual(self.job()['input_hash'], original)
        with self.assertRaisesRegex(ValueError, 'stale'):
            build_reviewed(self.root, self.manifest, review)
        self.manifest['cases'][0]['pillar_id'] = 'invented'
        with self.assertRaisesRegex(ValueError, 'pillar_id'):
            self.job()

    def test_repeating_a_case_cannot_overwrite_an_existing_finding(self):
        self.manifest['cases'].append(copy.deepcopy(self.manifest['cases'][0]))
        with self.assertRaisesRegex(ValueError, 'must be unique'):
            self.job()

    def test_filtered_run_does_not_draft_other_pillars(self):
        second = copy.deepcopy(self.manifest['cases'][0])
        second.update(id='health', pillar_id='healthcare')
        self.manifest['cases'].append(second)
        provider = FakeProvider()
        audit = run(self.root, {}, self.manifest, pillar='healthcare', provider=provider, max_calls=2)
        self.assertEqual(audit['model_calls'], 1)
        draft = read_json(self.root / 'normalized/alignment/e/c/draft.json')
        self.assertEqual([f['id'] for f in draft['findings']], ['health'])
        with self.assertRaisesRegex(ValueError, 'Unknown research pillar'):
            run(self.root, {}, self.manifest, pillar='unknown')

    def test_pillar_takeaways_cannot_be_reused_across_issues(self):
        review = self.review()
        review['pillar_takeaways'] = {'healthcare': 'Unreviewed claim'}
        with self.assertRaisesRegex(ValueError, 'separate takeaway'):
            build_reviewed(self.root, self.manifest, review)
        dossier = build_reviewed(self.root, self.manifest, self.review())
        self.assertEqual(dossier['findings'][0]['pillar_id'], 'housing')
        self.assertIsNone(next(p for p in dossier['pillars'] if p['id'] == 'healthcare')['takeaway'])

    def test_exact_window_fails_on_ambiguous_missing_or_oversized_markers(self):
        self.assertEqual(window('A text. End.', {'start': 'A text.', 'end': 'End.'}), 'A text. End.')
        for text in ['A text. A text. End.', 'Missing End.', 'A text. no ending']:
            with self.assertRaises(ValueError): window(text, {'start': 'A text.', 'end': 'End.'})
        with self.assertRaises(ValueError): window('Start ' + 'x' * 25000 + ' End', {'start': 'Start', 'end': 'End'})

    def test_named_identity_revocation_and_stale_source_reject_publication(self):
        dossier = build_reviewed(self.root, self.manifest, self.review())
        self.assertEqual(project(self.root, 'e', self.profile)['findings'][0]['status'], 'supports_commitment')
        changed = copy.deepcopy(self.profile); changed['actions'][0]['attribution_status'] = 'suggested'
        self.assertIsNone(project(self.root, 'e', changed))
        with self.assertRaises(ValueError): validate_dossier(dossier, changed)
        self.store._save('https://example.com/source', b'<html><p>Changed source.</p></html>')
        self.assertIsNone(project(self.root, 'e', self.profile))

    def test_drafts_are_cached_bounded_and_never_implicitly_published(self):
        provider = FakeProvider(); config = {'election': {'id': 'e'}}
        audit = run(self.root, config, self.manifest, offline=False, max_calls=1, provider=provider)
        self.assertEqual(audit['model_calls'], 1); self.assertEqual(audit['prompt_tokens'], 20)
        self.assertIsNone(project(self.root, 'e', self.profile))
        again = run(self.root, config, self.manifest, offline=True, provider=provider)
        self.assertEqual(again['cache_hits'], 1); self.assertEqual(provider.calls, 1)
        for bound in [-1, 21]:
            with self.assertRaises(ValueError): run(self.root, config, self.manifest, max_calls=bound)

    def test_quotes_roles_and_chronology_are_not_model_discretion(self):
        job = self.job(); validate_result(answer(), job)
        bad = answer(); bad['citations'][1]['quote'] = 'An invented legislative provision.'
        with self.assertRaisesRegex(ValueError, 'not present'): validate_result(bad, job)
        bad = answer(); bad['citations'] = bad['citations'][:1]
        with self.assertRaisesRegex(ValueError, 'operative'): validate_result(bad, job)
        job['payload']['commitment']['date'] = '2026-09-25'
        with self.assertRaisesRegex(ValueError, 'Earlier action'): validate_result(answer(), job)
        bad = answer(); bad['status'] = 'consistent_with_later_position'; validate_result(bad, job)

    def test_separate_review_is_invalidated_by_policy_or_prompt_change(self):
        review = self.review(); review['findings']['case']['input_hash'] = 'old'
        with self.assertRaisesRegex(ValueError, 'stale'): build_reviewed(self.root, self.manifest, review)
        review = self.review(); review['review_status'] = 'draft'
        with self.assertRaisesRegex(ValueError, 'separate'): build_reviewed(self.root, self.manifest, review)
        self.manifest['person_id'] = 'other'
        with self.assertRaisesRegex(ValueError, 'identity'): self.job()

    def test_commitment_date_and_quote_provenance_are_required(self):
        self.manifest['cases'][0]['commitment']['date'] = '2020-10-13'
        with self.assertRaisesRegex(ValueError, 'date is not present'): self.job()
        self.manifest['cases'][0]['commitment']['date'] = '2020-10-12'
        self.manifest['cases'][0]['commitment']['quote'] = 'Invented campaign promise'
        with self.assertRaisesRegex(ValueError, 'quotation'): self.job()


if __name__ == '__main__': unittest.main()
