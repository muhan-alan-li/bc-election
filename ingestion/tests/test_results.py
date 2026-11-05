import unittest

from election.history import aggregate, display_name, finish
from election.results import (
    attach_codes,
    parse_results,
    party_id,
    validate_results,
)

HTML = """
<div class="main-line">INITIAL COUNT</div>
<div class="icon tick-mark"><i class="fas fa-circle"></i></div>
</div>
<div class="small-line">Complete</div>
<div class="main-line">50.0%</div>
</div>
<div class="small-line">Preliminary Voter Turnout</div>
<div class="main-line">1,510</div>
</div>
<div class="small-line">Total Votes Considered</div>
<div class="main-line">3,020</div>
</div>
<div class="small-line">Registered voters as of October 14, 2026</div>
<div class="main-line">100%</div>
</div>
<div class="small-line">Of ballot boxes reporting</div>
<p>As of October 26, 2026 10:34 PST</p>
<p>Mail-in ballots will be counted at final count, scheduled for November 6 to 10, 2026.</p>
<table id="tblReport"><tbody>
<tr data-ed="Alpha" data-index=1>
  <td><b>Alpha</b></td><td data-canname="A">A</td><td>BC NDP</td>
  <td>600</td><td>59.4%</td>
</tr>
<tr data-ed="Alpha" data-index=2>
  <td></td><td data-canname="B">B</td><td>Conservative Party</td>
  <td>400</td><td>39.6%</td>
</tr>
<tr data-ed="Alpha" data-index=3>
  <td></td><td>Total Valid Votes</td><td></td><td>1,000</td><td>99.0%</td>
</tr>
<tr data-ed="Alpha" data-index=3>
  <td></td><td>Rejected Ballots*</td><td></td><td>10</td><td>1.0%</td>
</tr>
<tr data-ed="Alpha" data-index=3>
  <td></td><td>Total Considered Votes</td><td></td><td>1,010</td><td>100%</td>
</tr>
<tr data-ed="Beta" data-index=4>
  <td><b>Beta</b></td><td data-canname="C">C</td><td>BC Green Party</td>
  <td>300</td><td>60%</td>
</tr>
<tr data-ed="Beta" data-index=5>
  <td></td><td data-canname="D">D</td><td></td>
  <td>200</td><td>40%</td>
</tr>
<tr data-ed="Beta" data-index=6>
  <td></td><td>Total Valid Votes</td><td></td><td>500</td><td>100%</td>
</tr>
<tr data-ed="Beta" data-index=6>
  <td></td><td>Rejected Ballots*</td><td></td><td>0</td><td>0%</td>
</tr>
<tr data-ed="Beta" data-index=6>
  <td></td><td>Total Considered Votes</td><td></td><td>500</td><td>100%</td>
</tr>
</tbody></table>
"""

CONFIG = {
    "election": {
        "id": "test-election",
        "title": "Test Election",
        "voting_date": "2026-10-24",
        "parliament": "Test Parliament",
        "seats": 2,
        "status": "initial_count",
    }
}

CATALOG = {
    "districts": [
        {"name": "Alpha", "official_code": "AAA"},
        {"name": "Beta", "official_code": "BBB"},
    ]
}

SOURCE = {
    "source_id": "source-results",
    "url": "https://example.org/results",
    "label": "Results",
    "sha256": "0" * 64,
    "retrieved_at": "2026-10-26T00:00:00+00:00",
}


class ResultParsingTests(unittest.TestCase):
    def setUp(self):
        self.results = parse_results(HTML, CONFIG, SOURCE)

    def test_reads_summary_and_recomputes_valid_vote_shares(self):
        election = self.results["election"]
        self.assertEqual(election["seats"], 2)
        self.assertEqual(election["majority"], 2)
        self.assertEqual(election["status_label"], "Initial count complete")
        self.assertEqual(election["turnout"]["percent"], 50.0)
        self.assertEqual(election["turnout"]["registered_voters"], 3020)
        self.assertEqual(
            election["final_count"], {"start": "2026-11-06", "end": "2026-11-10"}
        )
        alpha = self.results["districts"]["Alpha"]
        self.assertEqual(alpha["winner"]["name"], "A")
        self.assertEqual(alpha["winner"]["vote_share"], 60.0)
        self.assertEqual(alpha["margin"], {"votes": 200, "points": 20.0})
        self.assertEqual(alpha["valid_votes"], 1000)
        self.assertEqual(alpha["rejected_votes"], 10)
        self.assertEqual(alpha["considered_votes"], 1010)

    def test_blank_affiliation_is_independent(self):
        beta = self.results["districts"]["Beta"]
        self.assertEqual(beta["candidates"][1]["party_id"], "independent")

    def test_codes_come_from_the_official_catalog(self):
        results = attach_codes(self.results, CATALOG)
        self.assertEqual(sorted(results["districts"]), ["AAA", "BBB"])
        self.assertEqual(results["districts"]["AAA"]["name"], "Alpha")

    def test_unknown_or_missing_roster_names_are_rejected(self):
        with self.assertRaises(ValueError):
            attach_codes(
                self.results,
                {"districts": [{"name": "Alpha", "official_code": "AAA"}]},
            )
        with self.assertRaises(ValueError):
            attach_codes(
                self.results,
                {
                    "districts": [
                        {"name": "Alpha", "official_code": "AAA"},
                        {"name": "Beta", "official_code": "BBB"},
                        {"name": "Gamma", "official_code": "CCC"},
                    ]
                },
            )


class ResultValidationTests(unittest.TestCase):
    def setUp(self):
        results = attach_codes(parse_results(HTML, CONFIG, SOURCE), CATALOG)
        results["parties"] = [
            {"id": "ndp", "name": "BC NDP", "color": "#c85316", "seats": 1, "votes": 600, "vote_share": 40.0},
            {"id": "conservative", "name": "Conservative Party of BC", "color": "#245b8a", "seats": 1, "votes": 400, "vote_share": 26.67},
            {"id": "green", "name": "BC Green Party", "color": "#38634b", "seats": 0, "votes": 300, "vote_share": 20.0},
            {"id": "independent", "name": "Independent", "color": "#6b7280", "seats": 0, "votes": 200, "vote_share": 13.33},
        ]
        self.results = results

    def test_accepts_consistent_party_totals(self):
        validate_results(self.results, "test-election")

    def test_rejects_seat_totals_that_do_not_match(self):
        self.results["parties"][0]["seats"] = 2
        with self.assertRaises(ValueError):
            validate_results(self.results, "test-election")


class HistoryTests(unittest.TestCase):
    CSV = (
        "EVENT_NAME,EVENT_YEAR,ED_ABBREVIATION,ED_NAME,VA_CODE,EDVA_CODE,"
        "VOTING_LOCATION,ADDRESS_STANDARD_ID,VOTING_OPPORTUNITY,CANDIDATE,"
        "ELECTED,AFFILIATION,VOTES_CONSIDERED,VOTE_CATEGORY,COMBINED_INDICATOR,"
        "RESULTS_REPORTED_UNDER\n"
        '2020 General Election,2020,ALP,Alpha,001,001,Hall,1,Advance,"Smith, Jane",Y,'
        "BC Liberal Party,60,Valid,N,\n"
        '2020 General Election,2020,ALP,Alpha,001,001,Hall,1,Advance,"Doe, John",N,'
        "BC NDP,40,Valid,N,\n"
        '2020 General Election,2020,ALP,Alpha,001,001,Hall,1,Advance,,N,,5,Rejected,N,\n'
        '2024 Provincial General Election,2024,ALP,Alpha,,,Hall,1,Advance,"Doe, John",Y,'
        "BC NDP,70,Valid,N,\n"
        '2024 Provincial General Election,2024,ALP,Alpha,,,Hall,1,Advance,"Roe, Ann",N,'
        "BC Green Party,30,Valid,N,\n"
    )

    def test_aggregates_valid_votes_only(self):
        per_year = aggregate(self.CSV, [2020, 2024])
        self.assertEqual(per_year[2020]["Alpha"]["candidates"][("Smith, Jane", "BC Liberal Party")]["votes"], 60)
        self.assertEqual(len(per_year[2020]["Alpha"]["candidates"]), 2)

    def test_maps_parties_and_names(self):
        completed = finish(aggregate(self.CSV, [2020, 2024]))
        alpha = completed["Alpha"]
        self.assertEqual(alpha[2020]["winner"]["name"], "Jane Smith")
        self.assertEqual(alpha[2020]["winner"]["party_id"], "liberal")
        self.assertEqual(alpha[2024]["winner"]["name"], "John Doe")
        self.assertAlmostEqual(alpha[2024]["winner"]["vote_share"], 70.0)
        self.assertTrue(alpha[2024]["comparable"])
        self.assertFalse(alpha[2020]["comparable"])

    def test_display_name_leaves_plain_names_alone(self):
        self.assertEqual(display_name("Jane Smith"), "Jane Smith")
        self.assertEqual(display_name("Smith, Jane"), "Jane Smith")

    def test_party_aliases(self):
        self.assertEqual(party_id("BC NDP"), "ndp")
        self.assertEqual(party_id("Conservative"), "conservative")
        self.assertEqual(party_id("BC Green Party"), "green")
        self.assertEqual(party_id("Christian Heritage Party of B.C."), "chp")
        self.assertEqual(party_id(""), "independent")
        self.assertEqual(party_id("Some Local Group"), "other")


if __name__ == "__main__":
    unittest.main()
