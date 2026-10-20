import copy
import json
from pathlib import Path
import unittest
from unittest.mock import patch

import test_alignment as fixtures
from election.analysis.alignment import build_reviewed, run
from election.analysis.alignment.batch import manifest_template
from election.analysis.alignment.review import source_review
from election.analysis.alignment.research import research_cases, research_actions
from election.analysis.identity import validate_identity
from election.analysis.model_jobs import ModelJobs
from election.analysis.alignment.catalog import bill_sources
from election.analysis.coverage import build_report
from election.analysis.alignment.library import reusable_cases
from election.analysis.alignment.evidence import window
from election.analysis.alignment.publication import project
from election.analysis.alignment.preparation import prepare, validate_bill_sources
from election.analysis.alignment.validation import validate_result
from election.analysis.alignment.structured import bounded_selector, policy_position, passage_cases
from election.analysis.alignment.batch import stale_pipeline_review
from election.storage import atomic_json, read_json


class Reviewer:
    identity = {'model': 'independent-review-test'}

    def __init__(self, decision='approve'):
        self.calls = 0
        self.decision = decision

    def complete(self, messages):
        self.calls += 1
        payload = json.loads(messages[1]['content'])
        if 'case_id' in payload:
            result = {'case_id': payload['case_id'], 'decision': self.decision,
                'result': None if self.decision == 'reject' else fixtures.answer(payload['case_id']),
                'reasons': ['Checked the operative provision and dated commitment.']}
        else:
            result = {'candidate_id': payload['candidate_id'], 'takeaway': 'Supported a specific rent measure.',
                'pillar_takeaways': {'housing': 'Supported a specific rent measure.'}}
        return result, {'usage': {'prompt_tokens': 12, 'completion_tokens': 8}}


class SourceReviewTests(unittest.TestCase):
    def test_invalid_json_retry_preserves_budget_and_schema_validation(self):
        class Provider:
            identity = {'model': 'json-repair-test'}
            calls = 0
            def complete(provider, messages):
                provider.calls += 1
                if provider.calls == 1:
                    raise ValueError('Model returned invalid JSON')
                self.assertIn('valid JSON object', messages[-1]['content'])
                return {'checked': True}, {}
        provider = Provider()
        jobs = ModelJobs(self.root, 'e', 'json-repair-test', provider, max_calls=2)
        def validate(result):
            self.assertEqual(result, {'checked': True})
        result, _ = jobs.complete_validated('c', [{'role': 'user', 'content': 'Return JSON.'}], validate, bindings={})
        self.assertEqual(result, {'checked': True})
        self.assertEqual(jobs.audit['model_calls'], 2)

    def test_vote_with_multiple_topics_has_one_primary_pillar(self):
        url = 'https://example.com/position'
        text = 'We will protect public health and the environment through stronger safeguards.'
        self.fixture.store._save(url, ('<html><p>' + text + '</p></html>').encode())
        profile = copy.deepcopy(self.profile)
        profile['actions'][0]['subject'] = 'Environmental Health Act (Bill 7)'
        party = {'policy_passages': [{'id': 'passage', 'text': text,
                 'source': {'url': url, 'title': 'Position', 'publisher': 'Party'}}]}
        bill = {'url': 'https://example.com/source', 'title': 'Bill', 'publisher': 'Legislature'}
        with patch('election.analysis.alignment.structured.bill_sources', return_value=[(bill, 'operative_bill')]):
            cases, _, _ = passage_cases(self.root, profile, party, offline=True)
            self.assertEqual(len(cases), 1)
            excluded, _, _ = passage_cases(self.root, profile, party, offline=True, excluded_case_ids=[cases[0]['id']])
            self.assertEqual(excluded, [])

    def test_policy_process_and_biography_are_not_policy_positions(self):
        self.assertFalse(policy_position('Our Policy Committee is developing policy pillars to improve healthcare.', 'party'))
        self.assertFalse(policy_position('I served as a nurse and supported patients.', 'candidate'))
        self.assertTrue(policy_position('We will expand access to primary healthcare.', 'party'))

    def test_operative_bill_must_match_candidate_vote_and_session(self):
        actions = [{'subject': 'Mental Health Amendment Act (Bill 32)', 'transcript_url': 'https://api.lims.leg.bc.ca/hdms/file/Debates/43rd1st/date.html'}]
        evidence = [{'role': 'operative_bill', 'text': 'Bill text', 'source': {'url': 'https://www.bclaws.gov.bc.ca/civix/document/id/bills/billsprevious/3rd42nd:gov36-3'}}]
        with self.assertRaisesRegex(ValueError, 'does not match'):
            validate_bill_sources(actions, evidence)
        evidence[0]['source']['url'] = 'https://www.bclaws.gov.bc.ca/civix/document/id/bills/billscurrent/gov32-3_43rd1st'
        validate_bill_sources(actions, evidence)

    def test_only_verified_unchanged_old_review_can_be_classified_as_stale(self):
        source_review(self.root, self.config, provider=Reviewer(), max_calls=2)
        review = read_json(self.folder / 'review.json')
        changed = copy.deepcopy(self.fixture.manifest)
        changed['cases'][0]['question'] = 'A corrected research question'
        self.assertTrue(stale_pipeline_review(self.root, self.profile, changed, review))
        review['findings']['case']['result']['assessment'] = 'Altered after review'
        self.assertFalse(stale_pipeline_review(self.root, self.profile, changed, review))

    def test_structured_window_uses_real_context_to_disambiguate_repeated_passages(self):
        text = 'First context. We will improve access. Second context. We will improve access.'
        selector = bounded_selector(text, 'We will improve access.')
        self.assertIn('We will improve access.', window(text, selector))
        with self.assertRaisesRegex(ValueError, 'not present'):
            bounded_selector(text, 'Invented policy')

    def test_comparison_cannot_attribute_candidate_vote_to_template_actor(self):
        _, jobs, _ = prepare(self.root, self.fixture.manifest, offline=True)
        job = jobs[0]
        job['payload']['research_template_actor'] = 'Template Person'
        result = fixtures.answer(job['id'])
        result['headline'] = 'Person voted for the rent measure'
        with self.assertRaisesRegex(ValueError, 'template actor'):
            validate_result(result, job)
        result['headline'] = 'Alex voted for the rent measure'
        validate_result(result, job)

    def test_changing_research_question_hides_previous_checked_projection(self):
        source_review(self.root, self.config, provider=Reviewer(), max_calls=2)
        build_reviewed(self.root, self.fixture.manifest, read_json(self.folder / 'review.json'))
        self.assertIsNotNone(project(self.root, 'e', self.profile))
        changed = copy.deepcopy(self.fixture.manifest)
        changed['cases'][0]['question'] = 'Corrected candidate-specific question'
        atomic_json(self.folder / 'manifest.json', changed)
        self.assertIsNone(project(self.root, 'e', self.profile))

    def test_rejected_additional_case_does_not_suppress_an_independently_checked_case(self):
        manifest = copy.deepcopy(self.fixture.manifest)
        rejected = copy.deepcopy(manifest['cases'][0])
        rejected['id'] = 'rejected-case'
        manifest['cases'].append(rejected)
        atomic_json(self.folder / 'manifest.json', manifest)
        run(self.root, self.config, manifest, provider=fixtures.FakeProvider(), max_calls=2)
        class MixedReviewer(Reviewer):
            def complete(provider, messages):
                payload = json.loads(messages[1]['content'])
                if payload.get('case_id') == 'rejected-case':
                    return {'case_id': 'rejected-case', 'decision': 'reject', 'result': None,
                            'reasons': ['Policy comparison is unsupported.']}, {}
                return super().complete(messages)
        report = source_review(self.root, self.config, provider=MixedReviewer(), max_calls=3)
        self.assertEqual(report['errors'], [])
        self.assertTrue(report['pending'])
        accepted = read_json(self.folder / 'manifest.json')
        dossier = build_reviewed(self.root, accepted, read_json(self.folder / 'review.json'), write=False)
        self.assertEqual([finding['id'] for finding in dossier['findings']], ['case'])
        excluded = read_json(self.root / 'normalized/alignment/e/c/excluded-research.json')
        self.assertEqual(len(excluded['manifest']['cases']), 2)

    def test_unique_complete_sentence_can_be_its_own_bounded_evidence_window(self):
        text = 'Intro. Freeze rents through 2021. Conclusion.'
        quote = 'Freeze rents through 2021.'
        self.assertEqual(window(text, {'start': quote, 'end': quote}), quote)
        with self.assertRaisesRegex(ValueError, 'ambiguous'):
            window(text + quote, {'start': quote, 'end': quote})

    def test_shared_cases_require_same_party_and_exact_candidate_votes_without_copying_conclusions(self):
        self.fixture.manifest['cases'][0]['commitment'].update(owner='Party', summary='Freeze rents')
        atomic_json(self.folder / 'manifest.json', self.fixture.manifest)
        run(self.root, self.config, self.fixture.manifest, provider=fixtures.FakeProvider(), max_calls=1)
        source_review(self.root, self.config, provider=Reviewer(), max_calls=2)
        build_reviewed(self.root, self.fixture.manifest, read_json(self.folder / 'review.json'))
        other = copy.deepcopy(self.profile)
        other['id'], other['person_id'] = 'other', 'other-person'
        other['ballot_name'] = 'Blair Other'
        other['actions'][0]['id'] = 'other-action'
        cases, sources = reusable_cases(self.root, other)
        self.assertEqual(cases[0]['action_ids'], ['other-action'])
        self.assertIn('Blair Other', cases[0]['question'])
        self.assertNotIn('Alex', cases[0]['question'])
        self.assertNotIn('assessment', cases[0])
        other['party_name'] = 'Different party'
        self.assertEqual(reusable_cases(self.root, other), ([], []))

    def test_bill_discovery_preserves_session_and_reading_and_excludes_procedural_votes(self):
        actions = [{'subject': 'Bill 9', 'stage': '2R', 'transcript_url': 'https://api.lims.leg.bc.ca/hdms/file/Debates/43rd2nd/date.html'},
                   {'subject': 'Bill 44', 'stage': '3R', 'transcript_url': 'https://api.lims.leg.bc.ca/hdms/file/Debates/42nd4th/date.html'},
                   {'subject': 'Bill 4', 'stage': '1R', 'transcript_url': 'https://api.lims.leg.bc.ca/hdms/file/Debates/43rd2nd/date.html'}]
        self.assertEqual([source['url'].split('/bills/')[1] for source, role in bill_sources(actions)],
                         ['billscurrent/gov09-1_43rd2nd', 'billsprevious/4th42nd:gov44-3'])

    def test_coverage_does_not_count_private_reviews_or_empty_layouts_as_analysis(self):
        profile = {**self.profile, 'ballot_name': 'Unfinished', 'party_name': 'Party',
                   'coverage': {'identity_status': 'reviewed', 'voting': {'count': 1}}}
        atomic_json(self.root / 'published/political/e/candidates/c.json', profile)
        report = build_report(self.root, 'e', self.root / 'report')
        self.assertFalse(report['complete_for_candidates_with_votes'])
        self.assertEqual(report['counts'], {'pending_analysis': 1})
        profile['alignment_analysis'] = {'review_status': 'source_checked', 'findings': [{'id': 'case'}]}
        atomic_json(self.root / 'published/political/e/candidates/c.json', profile)
        self.assertTrue(build_report(self.root, 'e', self.root / 'report')['complete_for_candidates_with_votes'])

    def test_validation_feedback_repairs_and_resumes_without_repeating_failed_requests(self):
        class Provider:
            identity = {'model': 'repair-test'}
            calls = 0
            def complete(provider, messages):
                provider.calls += 1
                if provider.calls == 1:
                    return {'quote': 'invented'}, {}
                self.assertIn('not in source', messages[-1]['content'])
                return {'quote': 'actual source'}, {}
        def validate(result):
            if result['quote'] != 'actual source':
                raise ValueError('quote not in source')
        provider = Provider()
        jobs = ModelJobs(self.root, 'e', 'repair-test', provider, max_calls=1)
        with self.assertRaisesRegex(ValueError, 'budget'):
            jobs.complete_validated('c', [], validate, bindings={'input': 'source'})
        resumed = ModelJobs(self.root, 'e', 'repair-test', provider, max_calls=1)
        result, key = resumed.complete_validated('c', [], validate, bindings={'input': 'source'})
        self.assertEqual(result['quote'], 'actual source')
        self.assertEqual(provider.calls, 2)
        cached = ModelJobs(self.root, 'e', 'repair-test', provider, offline=True)
        self.assertEqual(cached.complete_validated('c', [], validate, bindings={'input': 'source'}), (result, key))
        self.assertEqual(provider.calls, 2)

    def test_large_voting_records_return_a_bounded_research_sample(self):
        actions = [{'id': str(index), 'date': '2024-01-01',
                    'attribution_status': 'reviewed', 'stage': '3R', 'position': 'yea', 'topics': ['housing']} for index in range(100)]
        sample = research_actions(actions)
        self.assertEqual(len(sample), 36)
        self.assertEqual(len({action['id'] for action in sample}), 36)

    def setUp(self):
        self.fixture = fixtures.AlignmentTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.root = self.fixture.root
        self.profile = copy.deepcopy(self.fixture.profile)
        self.profile.update(district_code='AAA', coverage={'identity_status': 'reviewed'})
        atomic_json(self.fixture.path, self.profile)
        self.folder = self.root / 'curated/research/e/c'
        atomic_json(self.folder / 'manifest.json', self.fixture.manifest)
        self.config = {'election': {'id': 'e'}}
        run(self.root, self.config, self.fixture.manifest, provider=fixtures.FakeProvider(), max_calls=1)

    def test_independent_review_and_summary_are_required_for_publication(self):
        provider = Reviewer()
        report = source_review(self.root, self.config, provider=provider, max_calls=2)
        self.assertEqual(report['errors'], [])
        self.assertEqual(provider.calls, 2)
        review = read_json(self.folder / 'review.json')
        dossier = build_reviewed(self.root, self.fixture.manifest, review, write=False)
        self.assertIn('automated source-review', dossier['review_method'])
        self.assertIn('no human review', dossier['review_method'])
        changed = copy.deepcopy(review)
        changed['findings']['case']['result']['assessment'] = 'Altered after source review.'
        with self.assertRaisesRegex(ValueError, 'differs'):
            build_reviewed(self.root, self.fixture.manifest, changed)
        changed = copy.deepcopy(review)
        changed.pop('review_provenance')
        with self.assertRaisesRegex(ValueError, 'provenance'):
            build_reviewed(self.root, self.fixture.manifest, changed)

    def test_budget_exhaustion_can_resume_without_approving_an_incomplete_review(self):
        provider = Reviewer()
        first = source_review(self.root, self.config, provider=provider, max_calls=1)
        self.assertEqual(first['model_calls'], 1)
        self.assertTrue(first['pending'])
        self.assertFalse((self.folder / 'review.json').exists())
        second = source_review(self.root, self.config, provider=provider, max_calls=1)
        self.assertEqual(second['cache_hits'], 1)
        self.assertEqual(second['model_calls'], 1)
        self.assertEqual(provider.calls, 2)
        self.assertTrue((self.folder / 'review.json').exists())

    def test_rejected_sources_never_produce_a_publishable_review(self):
        report = source_review(self.root, self.config, provider=Reviewer('reject'), max_calls=2)
        self.assertTrue(report['pending'])
        self.assertFalse((self.folder / 'review.json').exists())

    def test_reviewer_can_correct_a_rejected_draft_but_cannot_approve_it_unchanged(self):
        path = self.root / 'normalized/alignment/e/c/draft.json'
        draft = read_json(path)
        draft['findings'][0]['draft']['citations'][0]['quote'] = 'Invented words in a draft.'
        atomic_json(path, draft)
        rejected = source_review(self.root, self.config, provider=Reviewer('approve'), max_calls=2)
        self.assertTrue(rejected['pending'])
        self.assertFalse((self.folder / 'review.json').exists())
        corrected = source_review(self.root, self.config, provider=Reviewer('revise'), max_calls=2)
        self.assertEqual(corrected['errors'], [])
        self.assertTrue((self.folder / 'review.json').exists())

    def test_research_selects_cases_without_manual_manifest_editing(self):
        atomic_json(self.folder / 'manifest.json', manifest_template(self.profile))
        source = {'id': 's', 'role': 'candidate', 'source': {'url': 'https://example.com/source', 'title': 'Source', 'publisher': 'Party'},
            'text': 'October 12, 2020 Freeze rents through 2021. No increase before January 1, 2022.'}
        class Researcher:
            identity = {'model': 'research-test'}
            def complete(_, messages):
                invalid = {**self.fixture.manifest['cases'][0], 'id': 'invalid-case', 'action_ids': ['uncollected-vote']}
                return {'cases': self.fixture.manifest['cases'] + [invalid], 'unassessed_commitments': [{'pillar_id': 'housing', 'source_id': 'missing'}], 'research_notes': ['Selected a dated commitment and operative text.']}, {}
        with patch('election.analysis.alignment.research.catalog', return_value=([source], [])):
            report = research_cases(self.root, self.config, max_calls=1, provider=Researcher())
        self.assertEqual(report['errors'], [])
        self.assertEqual(read_json(self.folder / 'manifest.json')['cases'][0]['action_ids'], ['a'])
        self.assertEqual(len(read_json(self.folder / 'manifest.json')['cases']), 1)

    def test_rejected_selection_is_quarantined_when_replacement_is_pending(self):
        previous = read_json(self.folder / 'manifest.json')
        previous['cases'][0]['action_ids'] = ['uncollected-vote']
        atomic_json(self.folder / 'manifest.json', previous)
        with patch('election.analysis.alignment.research.passage_cases', return_value=([], [], [])), \
                patch('election.analysis.alignment.research.catalog', return_value=([], [])):
            report = research_cases(self.root, self.config, max_calls=0, offline=True, provider=Reviewer())
        self.assertEqual(report['errors'], [])
        self.assertTrue(report['pending'])
        self.assertEqual(read_json(self.folder / 'manifest.json')['cases'], [])
        backup = self.root / 'normalized/research/e/c/superseded-selection.json'
        self.assertEqual(read_json(backup), previous)

    def test_identity_review_rejects_uncollected_aliases_and_unquoted_claims(self):
        profile = {'id': 'c'}
        record = {'voting_aliases': ['Example, Alex'], 'disclosure_aliases': []}
        sources = [{'id': 'bio', 'role': 'candidate', 'text': 'Alex Example served as MLA.'},
                   {'id': 'index', 'role': 'identity', 'text': 'Example, Alex voted.'}]
        result = {'candidate_id': 'c', 'decision': 'reviewed', 'legislative_aliases': ['Example, Alex'], 'disclosure_aliases': [],
            'identity_evidence': [{'source_id': 'bio', 'quote': 'Alex Example served as MLA.'}, {'source_id': 'index', 'quote': 'Example, Alex voted.'}], 'office_history': []}
        validate_identity(result, profile, record, sources)
        result['legislative_aliases'] = ['Someone, Else']
        with self.assertRaisesRegex(ValueError, 'uncollected'):
            validate_identity(result, profile, record, sources)


if __name__ == '__main__':
    unittest.main()
