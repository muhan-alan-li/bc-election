import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from election.platforms import collect_candidates, collect_material, collect_parties, publish
from election.storage import SourceStore, atomic_json, read_json
from discover_platform_sources import discover
from run_platform_collection import run
from election.pipeline import curate, polish


class PlatformTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.store = SourceStore(self.root, offline=True)
        self.config = {"election": {"id": "test-election"}, "roster_url": "https://example.org/roster.csv"}
        self.store.import_file(self.config["roster_url"], Path(__file__).parent / "fixtures/roster.csv")
        self.url = "https://campaign.example/"
        self.store._save(self.url, b'<html><script>hidden promise</script><p>Local priorities</p>'
                         b'<a href="/platform">Platform</a><a href="/privacy-policy">Privacy policy</a>'
                         b'<a href="https://other.example/platform">Other</a></html>')
        self.store._save(self.url + "platform", b'<html><p>More buses.</p><a href="/">Home</a></html>')
        atomic_json(self.root / "curated/platform-sources.json", {"test-election": {
            "parties": {"Example Party": [self.url]},
            "candidates": {"SYN": {"Alex Example": [self.url]}}}})

    def test_jobs_independent_shared_party_reference_and_independents(self):
        with patch("election.storage.urlopen", side_effect=AssertionError("Network called")):
            candidates = [read_json(path) for path in collect_candidates(self.store, self.config, self.root, district="SYN")]
            parties = [read_json(path) for path in collect_parties(self.store, self.config, self.root)]
        alex = next(row for row in candidates if row["ballot_name"] == "Alex Example")
        self.assertEqual(alex["party_platform_id"], parties[0]["id"])
        self.assertEqual(len(alex["documents"]), 2)
        self.assertEqual(alex["commitments"], [])
        for row in candidates:
            if row["affiliation"] != "party":
                self.assertIsNone(row["party_platform_id"])
                self.assertEqual(row["coverage"]["status"], "not_configured")
        self.assertNotIn("hidden promise", alex["documents"][0]["pages"][0]["text"])

    def test_party_detail_follows_issue_pages_but_not_candidate_or_external_links(self):
        index = self.url + "2026-platform/"
        self.store._save(index, b'<html><a href="/2024/08/health-care">Read More</a>'
                         b'<a href="/plan/energy">Energy</a><a href="/2024-platform">Old platform</a>'
                         b'<a href="https://unrelated.example/plan/energy">Plan</a></html>')
        self.store._save(self.url + "2024/08/health-care", b'<html><p>Fund rural care.</p></html>')
        self.store._save(self.url + "plan/energy", b'<html><p>Build power.</p></html>')
        output = collect_material(self.store, [index], detailed=True)
        self.assertEqual(len(output["documents"]), 3)
        self.assertEqual(output["coverage"]["status"], "collected")
        candidate = collect_material(self.store, [index])
        self.assertNotIn(self.url + "2024/08/health-care", candidate["coverage"]["sources_checked"])

    def test_http_requires_explicit_host(self):
        with self.assertRaises(ValueError):
            self.store._check_url("http://campaign.example/")
        self.store.http_hosts.add("campaign.example")
        self.store._check_url("http://campaign.example/")
        with self.assertRaises(ValueError):
            self.store._check_url("http://unrelated.example/")

    def test_party_only_batch_skips_candidate_collector(self):
        with patch("run_platform_collection.collect_candidates", side_effect=AssertionError("Candidate job ran")):
            summary = run(self.config, self.root, offline=True, only="parties")
        self.assertIn("parties", summary)
        self.assertNotIn("candidates", summary)

    def test_bounds_errors_and_unsupported_formats_visible(self):
        bounded = collect_material(self.store, [self.url], max_pages=1)
        self.assertEqual(bounded["coverage"]["status"], "partial")
        self.assertEqual(bounded["coverage"]["pending_urls"], [self.url + "platform"])
        failed = collect_material(self.store, ["https://missing.example/"])
        self.assertEqual(failed["coverage"]["status"], "failed")
        self.store._save("https://example.org/image", b'PNG binary')
        unsupported = collect_material(self.store, ["https://example.org/image"])
        self.assertTrue(unsupported["coverage"]["errors"])

    def test_pdf_missing_extractor_and_stable_ids(self):
        self.store._save("https://example.org/platform.pdf", b'%PDF-synthetic')
        with patch("election.platforms.shutil.which", return_value=None):
            output = collect_material(self.store, ["https://example.org/platform.pdf"])
        self.assertEqual(output["documents"][0]["extraction_status"], "extractor_unavailable")
        self.assertEqual(output["coverage"]["status"], "partial")
        first = collect_candidates(self.store, self.config, self.root, candidate="Alex Example", district="SYN")
        second = collect_candidates(self.store, self.config, self.root, candidate="Alex Example", district="SYN")
        self.assertEqual(first, second)

    def test_invalid_input_preserves_publication(self):
        path = collect_parties(self.store, self.config, self.root, party="Example Party")[0]
        previous = path.read_bytes()
        with self.assertRaises(ValueError):
            collect_parties(self.store, self.config, self.root, max_pages=0)
        self.assertEqual(path.read_bytes(), previous)
        self.config["election"]["id"] = "../bad"
        with self.assertRaisesRegex(ValueError, "Election ID"):
            collect_candidates(self.store, self.config, self.root)

    def test_failed_refresh_retains_documents_and_records_attempt(self):
        path = collect_parties(self.store, self.config, self.root, party="Example Party")[0]
        previous = path.read_bytes()
        failed = {"generated_at": "2099-01-01", **collect_material(self.store, ["https://missing.example/"])}
        publish(path, failed)
        self.assertEqual(path.read_bytes(), previous)
        self.assertEqual(read_json(path.with_suffix(".attempt.json"))["coverage"]["status"], "failed")
        recovered = read_json(path)
        publish(path, recovered)
        self.assertFalse(path.with_suffix(".attempt.json").exists())

    def test_batch_repeat_offline_and_failure_summary(self):
        with patch("election.storage.urlopen", side_effect=AssertionError("Network called")):
            first = run(self.config, self.root, offline=True)
            second = run(self.config, self.root, offline=True)
        self.assertEqual(first["candidates"], second["candidates"])
        registry = read_json(self.root / "curated/platform-sources.json")
        registry["test-election"]["parties"]["Example Party"] = ["https://missing.example/"]
        atomic_json(self.root / "curated/platform-sources.json", registry)
        failed = run(self.config, self.root, offline=True)
        self.assertEqual(failed["parties"]["coverage"]["failed"], 1)
        self.assertEqual(failed["parties"]["retained_publications"], 1)
        self.assertTrue(failed["parties"]["errors"])

    def test_discovery_repeat_preserves_curated_sources_and_district_matching(self):
        url = "https://votemate.org/bc2026provincial/candidates/"
        riding = url + "?riding=1"
        self.store._save(url, f'<a href="{riding}">Synthetic Constituency Alex Example Example Party</a>'.encode())
        self.store._save(riding, b'<a href="/bc2026provincial/candidates/123?riding=1">Alex Example Example Party</a>')
        self.config["platform_directories"] = [url]
        with patch("election.storage.urlopen", side_effect=AssertionError("Network called")):
            discover(self.store, self.config, self.root)
            path = self.root / "curated/platform-sources.json"
            first = path.read_bytes()
            discover(self.store, self.config, self.root)
        self.assertEqual(first, path.read_bytes())
        registry = read_json(path)["test-election"]
        self.assertEqual(registry["parties"]["Example Party"], [self.url])
        self.assertIn(self.url, registry["candidates"]["SYN"]["Alex Example"])
        self.assertEqual(len(registry["candidates"]["SYN"]["Alex Example"]), 2)
        self.assertNotIn("OTH", registry["candidates"])

    def test_review_gate_and_polish_without_raw_or_review_registry(self):
        normalized = collect_parties(self.store, self.config, self.root)[0]
        self.assertIn('normalized', normalized.parts)
        material = read_json(normalized)
        claim = {'id': 'claim-example', 'text': 'More buses.', 'reviewed_at': '2026-10-08',
                 'document_id': material['documents'][1]['id'], 'locator': 'Platform: first paragraph'}
        atomic_json(self.root / 'curated/platform-commitments.json', {material['id']: [claim]})
        curate(self.root, 'test-election')
        self.store.root.rename(self.root / 'unused-cache')
        (self.root / 'curated/platform-commitments.json').unlink()
        with patch('election.storage.urlopen', side_effect=AssertionError('Network called')):
            paths = polish(self.root, 'test-election')
        output = read_json(paths[0])
        self.assertEqual(output['commitments'], [claim])
        self.assertTrue(all('pages' not in doc for doc in output['documents']))
        previous = paths[0].read_bytes()
        snapshot = self.root / 'curated/datasets/platforms/test-election/parties' / normalized.name
        broken = read_json(snapshot)
        broken['commitments'][0]['document_id'] = 'unknown'
        atomic_json(snapshot, broken)
        with self.assertRaisesRegex(ValueError, 'document reference'):
            polish(self.root, 'test-election')
        self.assertEqual(paths[0].read_bytes(), previous)

    def test_temporary_raw_cache_retains_normalized_text(self):
        with tempfile.TemporaryDirectory() as folder:
            temporary_store = SourceStore(self.root, offline=True, raw_root=folder)
            for url in (self.config['roster_url'], self.url, self.url + 'platform'):
                data, _ = self.store.get(url)
                temporary_store._save(url, data)
            path = collect_parties(temporary_store, self.config, self.root)[0]
        self.assertFalse(Path(folder).exists())
        output = read_json(path)
        self.assertIn('More buses.', output['documents'][1]['pages'][0]['text'])


if __name__ == "__main__":
    unittest.main()
