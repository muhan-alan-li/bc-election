import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from election.parsers import Disclosures, VoteIndex, roster
from election.storage import SourceError, SourceStore, atomic_json, read_json
from election.workflow import load_roster, run_district, validate

FIXTURES = Path(__file__).parent / "fixtures"


class ParserTests(unittest.TestCase):
    def test_affiliations_unicode_and_same_name_in_other_district(self):
        districts, rows = roster((FIXTURES / "roster.csv").read_text())
        self.assertEqual(len(districts), 2)
        self.assertEqual([row["affiliation"] for row in rows[:3]], ["party", "independent", "unaffiliated"])
        self.assertEqual(rows[1]["name"], "Élodie Example")
        self.assertIsNone(rows[1]["party_name"])

    def test_roster_rejects_duplicates_and_changed_headers(self):
        text = (FIXTURES / "roster.csv").read_text()
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            roster(text + "SYN,Synthetic Constituency,Alex Example,Example Party\n")
        with self.assertRaisesRegex(ValueError, "columns"):
            roster("name,party\nAlex,Party\n")

    def test_votes_require_exact_alias_preserve_context_and_do_not_infer_absence(self):
        text = (FIXTURES / "votes.html").read_text()
        votes = VoteIndex(text, "https://example.org/Index/42nd5th/2024-votesa.htm", ["Example, Alex"]).records
        self.assertEqual(len(votes), 2)
        self.assertEqual([vote["position"] for vote in votes], ["yea", "nay"])
        self.assertEqual(votes[0]["date"], "2024-03-05")
        self.assertIn("Former Synthetic Constituency", votes[0]["member_label"])
        self.assertIn("amdt. to cl. 2", votes[1]["stage"])
        self.assertIsNone(votes[0]["outcome"])
        self.assertEqual(VoteIndex(text, "https://example.org/", ["Example, Unknown"]).records, [])

    def test_unknown_vote_label_fails_instead_of_guessing(self):
        text = (FIXTURES / "votes.html").read_text().replace("2R, Yea", "2R, Present")
        with self.assertRaisesRegex(ValueError, "position"):
            VoteIndex(text, "https://example.org/", ["Example, Alex"])

    def test_index_entry_can_reference_votes_on_multiple_dates(self):
        text = (FIXTURES / "votes.html").read_text().replace(
            '390B:1155</a>',
            '390B:1155</a>, <a href="../../Debates/42nd5th/20240306am-Hansard-n391.html#391B:1155">391B:1155</a>', 1)
        votes = VoteIndex(text, "https://example.org/Index/42nd5th/2024-votesa.htm", ["Example, Alex"]).records
        self.assertEqual(len(votes), 3)
        self.assertEqual(votes[1]["date"], "2024-03-06")
        self.assertEqual(votes[1]["stage"], "2R")

    def test_disclosure_owner_and_material_change_retained(self):
        docs = Disclosures((FIXTURES / "disclosures.html").read_text(), "https://example.org").records
        self.assertEqual(docs[0]["member_name"], "Example, Alex")
        self.assertEqual(docs[1]["document_type"], "material_change")
        self.assertEqual(docs[-1]["member_name"], "Example, Alex")


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.store = SourceStore(self.root, offline=True)
        self.config = {
            "election": {"id": "synthetic-2026", "title": "Synthetic election", "voting_date": None,
                         "boundary_version": "synthetic", "status": "provisional", "source_url": "https://example.org/roster.csv"},
            "roster_url": "https://example.org/roster.csv", "voting_since": 2024,
            "voting_archive_url": "https://example.org/archive", "disclosure_urls": ["https://example.org/disclosures"]}
        self.store.import_file(self.config["roster_url"], FIXTURES / "roster.csv")
        self.store.import_file(self.config["disclosure_urls"][0], FIXTURES / "disclosures.html")
        self.store._save(self.config["voting_archive_url"], b'<a href="/Index/42nd5th/2024-votesmhds.htm">Index to voting records</a>')
        self.store._save("https://example.org/Index/42nd5th/2024-votesmhds.htm",
                         b'<p>standing votes by Members</p><a href="2024-votesa.htm#mh1">Example, Alex (Former Synthetic Constituency)</a>')
        self.store.import_file("https://example.org/Index/42nd5th/2024-votesa.htm", FIXTURES / "votes.html")

    def collect(self):
        return run_district(self.store, self.config, self.root, "SYN")

    def review_alex(self):
        registry = read_json(self.root / "curated/identities.json")
        person = next(row for row in registry["people"] if row["name"] == "Alex Example")
        person.update(reviewed_at="2026-10-07", identity_sources=[{"url": "https://example.org/identity"}],
                      legislative_aliases=["Example, Alex"], disclosure_aliases=["Example, Alex"])
        atomic_json(self.root / "curated/identities.json", registry)
        return person["id"]

    def test_repeat_run_stable_ids_and_unreviewed_identity_not_attributed(self):
        first, _ = self.collect()
        second, _ = self.collect()
        self.assertEqual(first["candidacies"], second["candidacies"])
        self.assertEqual(first["people"], second["people"])
        self.assertEqual(first["votes"], [])
        self.assertTrue(first["identity_leads"][0]["voting_members"])
        self.assertTrue(all(row["interests"]["status"] == "not_reviewed" for row in first["coverage"]))

    def test_reviewed_identity_enrichment_with_prior_constituency(self):
        self.collect()
        person_id = self.review_alex()
        output, _ = self.collect()
        self.assertEqual(len(output["votes"]), 2)
        self.assertEqual(len(output["disclosures"]), 2)  # duplicate by-date entry deduplicated
        self.assertEqual({vote["person_id"] for vote in output["votes"]}, {person_id})
        self.assertEqual(output["interests"], [])
        validate(output)

    def test_invalid_review_preserves_previous_publication(self):
        self.collect()
        person_id = self.review_alex()
        _, path = self.collect()
        previous = path.read_bytes()
        atomic_json(self.root / "curated/interests.json", [{"id": "invalid", "person_id": person_id,
                    "document_id": "nonexistent", "description": "Synthetic entry"}])
        with self.assertRaisesRegex(ValueError, "Missing disclosure"):
            self.collect()
        self.assertEqual(path.read_bytes(), previous)

    def test_source_failures_visible_in_coverage(self):
        self.collect()
        self.review_alex()
        self.config["disclosure_urls"] = ["https://example.org/missing"]
        output, _ = self.collect()
        self.assertTrue(output["coverage"][0]["interests"]["errors"])
        self.assertEqual(output["coverage"][0]["interests"]["status"], "not_reviewed")

    def test_wrong_election_reference_rejected(self):
        output, _ = self.collect()
        output["candidacies"][0]["election_id"] = "another-election"
        with self.assertRaisesRegex(ValueError, "Wrong election"):
            validate(output)

    def test_csv_windows_1252_is_supported(self):
        data = (FIXTURES / "roster.csv").read_text().encode("cp1252")
        self.store._save(self.config["roster_url"], data)
        _, candidates, _ = load_roster(self.store, self.config)
        self.assertEqual(candidates[1]["name"], "Élodie Example")

    def test_source_cache_integrity_and_offline_no_network(self):
        with patch("election.storage.urlopen", side_effect=AssertionError("Network called")):
            self.collect()
        _, meta = self.store.get(self.config["roster_url"])
        (self.store.root / meta["blob"]).write_bytes(b"corrupt")
        with self.assertRaisesRegex(SourceError, "Corrupt"):
            self.store.get(self.config["roster_url"])

    def test_path_traversal_and_unknown_district_rejected(self):
        with self.assertRaisesRegex(ValueError, "Unknown"):
            run_district(self.store, self.config, self.root, "Not a constituency")
        self.config["election"]["id"] = "../outside"
        with self.assertRaisesRegex(ValueError, "Election ID"):
            self.collect()


if __name__ == "__main__":
    unittest.main()
