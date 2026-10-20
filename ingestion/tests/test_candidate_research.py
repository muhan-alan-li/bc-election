import copy
from pathlib import Path
import unittest

import test_alignment as fixtures
from election.analysis.alignment.batch import research_candidates
from election.analysis.alignment.presentation import comparison_guide
from election.storage import atomic_json, read_json


class CandidateResearchTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.AlignmentTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.root = self.fixture.root
        self.config = {'election': {'id': 'e'}}
        self.profile = copy.deepcopy(self.fixture.profile)
        self.profile.update(district_code='AAA', coverage={'identity_status': 'reviewed', 'voting': {'count': 1}})
        atomic_json(self.fixture.path, self.profile)
        self.inputs = self.root / 'curated/research/e/c'
        atomic_json(self.inputs / 'manifest.json', self.fixture.manifest)

    def second_candidate(self):
        profile = copy.deepcopy(self.profile)
        profile.update(id='d', person_id='q', ballot_name='Blair', district_code='BBB')
        atomic_json(self.fixture.path.with_name('d.json'), profile)
        manifest = copy.deepcopy(self.fixture.manifest)
        manifest.update(candidate_id='d', person_id='q')
        atomic_json(self.inputs.with_name('d') / 'manifest.json', manifest)
        return profile, manifest

    def test_initialization_covers_roster_without_overwriting_research(self):
        profile, _ = self.second_candidate()
        path = self.inputs.with_name('d') / 'manifest.json'
        path.unlink()
        report = research_candidates(self.root, self.config, stage='init')
        self.assertEqual(len(report['candidates']), 2)
        scaffold = read_json(path)
        self.assertEqual(scaffold['candidate_id'], profile['id'])
        self.assertEqual(len(scaffold['pillar_checklist']), 6)
        self.assertEqual(scaffold['cases'], [])
        self.assertEqual(read_json(self.inputs / 'manifest.json'), self.fixture.manifest)
        report = research_candidates(self.root, self.config, district='bbb')
        self.assertEqual([r['candidate_id'] for r in report['candidates']], ['d'])
        self.assertEqual(report['candidates'][0]['status'], 'needs_comparison_research')
        with self.assertRaisesRegex(ValueError, 'No candidate profiles'):
            research_candidates(self.root, self.config, candidate='missing')

    def test_drafting_budget_is_shared_and_cache_resumes_across_candidates(self):
        self.second_candidate()
        provider = fixtures.FakeProvider()
        report = research_candidates(self.root, self.config, stage='draft', max_calls=1, provider=provider)
        self.assertEqual(report['model_calls'], 1)
        self.assertEqual(provider.calls, 1)
        self.assertEqual(report['errors'], [])
        self.assertFalse((self.root / 'curated/datasets/alignment/e/c.json').exists())
        report = research_candidates(self.root, self.config, stage='draft', max_calls=1, provider=provider)
        self.assertEqual(report['cache_hits'], 1)
        self.assertEqual(report['model_calls'], 1)
        self.assertEqual(provider.calls, 2)

    def test_unreviewed_identity_remains_pending_without_model_calls(self):
        self.profile['coverage']['identity_status'] = 'needs_review'
        atomic_json(self.fixture.path, self.profile)
        provider = fixtures.FakeProvider()
        report = research_candidates(self.root, self.config, stage='draft', max_calls=2, provider=provider)
        self.assertEqual(report['candidates'][0]['result'], 'pending_research')
        self.assertEqual(provider.calls, 0)

    def test_parallel_drafting_respects_shared_budget_and_resumes_cached_candidates(self):
        self.second_candidate()
        provider = fixtures.FakeProvider()
        first = research_candidates(self.root, self.config, stage='draft', max_calls=1, provider=provider, workers=2)
        self.assertEqual(first['model_calls'], 1)
        self.assertEqual(provider.calls, 1)
        resumed = research_candidates(self.root, self.config, stage='draft', max_calls=1, provider=provider, workers=2)
        self.assertEqual(resumed['cache_hits'], 1)
        self.assertEqual(resumed['model_calls'], 1)
        self.assertEqual(provider.calls, 2)

    def test_invalid_review_preserves_every_candidate_publication(self):
        self.second_candidate()
        review = self.fixture.review()
        atomic_json(self.inputs / 'review.json', review)
        invalid = copy.deepcopy(review)
        invalid['candidate_id'] = 'd'
        atomic_json(self.inputs.with_name('d') / 'review.json', invalid)
        destination = self.root / 'curated/datasets/alignment/e/c.json'
        atomic_json(destination, {'previous': 'keep'})
        report = research_candidates(self.root, self.config, stage='publish', offline=True)
        self.assertTrue(report['errors'])
        self.assertEqual(read_json(destination), {'previous': 'keep'})
        self.assertFalse(destination.with_name('d.json').exists())

    def test_candidate_identity_cannot_be_reused_for_another_manifest(self):
        self.second_candidate()
        atomic_json(self.inputs.with_name('d') / 'manifest.json', self.fixture.manifest)
        report = research_candidates(self.root, self.config)
        self.assertEqual(len(report['errors']), 1)
        self.assertEqual(report['errors'][0]['candidate_id'], 'd')

    def test_empty_pillars_are_unassessed_rather_than_inconclusive(self):
        guide = comparison_guide(self.profile)
        self.assertEqual(len(guide['pillars']), 6)
        self.assertTrue(all(p['alignment_status'] is None and p['comparison_count'] == 0 for p in guide['pillars']))
        profile = copy.deepcopy(self.profile)
        profile['alignment_analysis'] = {'review_status': 'source_checked',
            'findings': [{'pillar_id': 'housing', 'status': 'supports_commitment'}],
            'pillars': [{'id': 'housing', 'takeaway': 'Supported this specific measure.'}]}
        guide = comparison_guide(profile)
        self.assertEqual(guide['pillars'][0]['alignment_status'], 'aligned')
        self.assertEqual(guide['pillars'][0]['alignment_note'], 'Supported this specific measure.')
        profile['alignment_analysis']['review_status'] = 'draft'
        self.assertIsNone(comparison_guide(profile)['pillars'][0]['alignment_status'])


if __name__ == '__main__':
    unittest.main()
