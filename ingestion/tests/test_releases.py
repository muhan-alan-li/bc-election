import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import test_workflow as workflow_fixture
from election.releases import publish_release, current_data, active_path, rollback
from election.storage import atomic_json, read_json
from election.workflow import run_district


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.fixture = workflow_fixture.WorkflowTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.root = self.fixture.root
        self.election = 'synthetic-2026'
        self.fixture.collect()

    def test_ballot_catalog_and_hash_manifest_share_one_generation(self):
        published = self.root / 'published'
        data = current_data(published, self.election)
        catalog = read_json(data / self.election / 'catalog.json')
        ballot = read_json(data / self.election / 'ballots/SYN.json')
        self.assertEqual(catalog['districts'][0]['candidate_count'], 3)
        self.assertEqual(len(ballot['candidacies']), 3)
        self.assertNotIn('votes', ballot)
        manifest = read_json(data.parent / 'manifest.json')
        self.assertIn(f'data/{self.election}/ballots/SYN.json', manifest['files'])

    def test_interrupted_staging_preserves_active_release(self):
        published = self.root / 'published'
        before = active_path(published, self.election).read_bytes()
        with patch('election.releases.atomic_json', side_effect=OSError('disk full')):
            with self.assertRaisesRegex(OSError, 'disk full'):
                publish_release(self.root, self.election)
        self.assertEqual(active_path(published, self.election).read_bytes(), before)
        self.assertTrue((current_data(published, self.election) / self.election / 'ballots/SYN.json').exists())

    def test_partial_publication_retains_other_ridings_and_can_roll_back(self):
        published = self.root / 'published'
        first = read_json(active_path(published, self.election))['generation']
        run_district(self.fixture.store, self.fixture.config, self.root, 'OTH')
        data = current_data(published, self.election)
        self.assertEqual({r['official_code'] for r in read_json(data / self.election / 'catalog.json')['districts']}, {'SYN', 'OTH'})
        self.assertEqual(rollback(self.root, self.election), first)
        self.assertEqual(len(read_json(current_data(published, self.election) / self.election / 'catalog.json')['districts']), 1)

    def test_invalid_editorial_snapshot_does_not_activate(self):
        before = active_path(self.root / 'published', self.election).read_bytes()
        with tempfile.TemporaryDirectory() as folder:
            content = Path(folder)
            atomic_json(content / self.election / 'guide.json', {'schema_version': 1})
            with self.assertRaisesRegex(ValueError, 'editorial'):
                publish_release(self.root, self.election, content_dir=content)
        self.assertEqual(active_path(self.root / 'published', self.election).read_bytes(), before)
