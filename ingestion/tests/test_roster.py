import hashlib
import tempfile
import unittest
from pathlib import Path

from election.roster import load_roster, publish_roster
from election.storage import read_json
from election.validate import validate_publication

FIXTURES = Path(__file__).parent / "fixtures"


class FakeStore:
    def __init__(self, body):
        self.body = body
        self.meta = {
            "id": "source-roster",
            "url": "https://example.org/roster.csv",
            "retrieved_at": "2026-10-01T00:00:00+00:00",
            "sha256": hashlib.sha256(body).hexdigest(),
        }

    def get(self, _url):
        return self.body, self.meta


class RosterPublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.storage = Path(self.temp.name)
        self.config = {
            "election": {
                "id": "test-election",
                "title": "Test Election",
                "voting_date": None,
                "boundary_version": "test-boundaries",
                "status": "final_roster",
                "source_url": "https://example.org/election",
            },
            "roster_url": "https://example.org/roster.csv",
        }

    def publish(self):
        body = (FIXTURES / "roster.csv").read_bytes()
        store = FakeStore(body)
        districts, candidates, meta = load_roster(store, self.config)
        path, count = publish_roster(self.storage, self.config, districts, candidates, meta)
        return path, count, districts

    def test_publishes_affiliations_aliases_and_stable_ids(self):
        path, count, districts = self.publish()
        self.assertEqual(count, len(districts))
        catalog = read_json(path)
        self.assertEqual(catalog["election"]["boundary_version"], "test-boundaries")
        self.assertEqual(len(catalog["districts"]), 2)
        ballot = read_json(path.parent / "ballots" / "SYN.json")
        self.assertEqual(len(ballot["candidacies"]), 3)
        self.assertEqual(
            [row["affiliation"] for row in ballot["candidacies"]],
            ["party", "independent", "unaffiliated"],
        )
        self.assertEqual(ballot["candidacies"][1]["ballot_name"], "Élodie Example")
        self.assertEqual(len({row["id"] for row in ballot["candidacies"]}), 3)
        validate_publication(path.parent, "test-election")

    def test_rebuild_replaces_the_previous_publication(self):
        self.publish()
        path, _, _ = self.publish()
        self.assertTrue(path.exists())
        self.assertEqual(len(list(path.parent.glob("ballots/*.json"))), 2)

    def test_duplicate_candidacy_is_rejected(self):
        body = (
            b"ED Code,Electoral District,Candidate Ballot Name,Affiliation\n"
            b"ONE,One,Alex Example,Party\n"
            b"ONE,One,alex example,Party\n"
        )
        store = FakeStore(body)
        with self.assertRaisesRegex(ValueError, "Duplicate candidacy"):
            load_roster(store, self.config)


if __name__ == "__main__":
    unittest.main()
