"""Historical general election results, aggregated to the constituency level.

Elections BC publishes voting results as vote-area or voting-place rows. This
module sums valid candidate votes per electoral district for each general
election, then keys the result by district name so the 2026 publication can
attach a trend line where a constituency name is comparable. Boundary changes
mean older entries describe the same name, not necessarily the same voters;
the publication labels each year with its boundary note.
"""

import csv
import io

from .results import party_id
from .storage import now

GENERAL_ELECTIONS = {
    2005: {"event": "2005 General Election", "boundary": "Earlier boundaries", "comparable": False},
    2009: {"event": "2009 General Election", "boundary": "Earlier boundaries", "comparable": False},
    2013: {"event": "2013 General Election", "boundary": "Earlier boundaries", "comparable": False},
    2017: {"event": "2017 General Election", "boundary": "Earlier boundaries", "comparable": False},
    2020: {"event": "2020 General Election", "boundary": "Earlier boundaries", "comparable": False},
    2024: {
        "event": "2024 Provincial General Election",
        "boundary": "2023 redistribution boundaries",
        "comparable": True,
    },
}


def decode(data):
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("cp1252")


def aggregate(text, years):
    """Sum valid votes per district and candidate for the requested years."""
    per_year = {
        year: {} for year in years
    }
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        year = int(row["EVENT_YEAR"]) if row.get("EVENT_YEAR", "").isdigit() else None
        if year not in per_year or row.get("VOTE_CATEGORY") != "Valid":
            continue
        name = (row.get("ED_NAME") or "").strip()
        candidate = (row.get("CANDIDATE") or "").strip()
        if not name or not candidate:
            continue
        votes = int(row["VOTES_CONSIDERED"]) if row.get("VOTES_CONSIDERED", "").isdigit() else 0
        district = per_year[year].setdefault(
            name,
            {"code": row.get("ED_ABBREVIATION") or "", "candidates": {}},
        )
        key = (candidate, row.get("AFFILIATION") or "")
        entry = district["candidates"].setdefault(
            key,
            {"name": candidate, "party_name": row.get("AFFILIATION") or "", "votes": 0},
        )
        entry["votes"] += votes
    return per_year


def display_name(value):
    """Turn the source's "Last, First" candidate values into "First Last"."""
    parts = [part.strip() for part in value.split(",")]
    if len(parts) == 2 and all(parts):
        return f"{parts[1]} {parts[0]}"
    return value.strip()


def finish(per_year):
    by_name = {}
    for year, districts in per_year.items():
        meta = GENERAL_ELECTIONS[year]
        for name, district in districts.items():
            candidates = [
                {
                    "name": display_name(row["name"]),
                    "party_id": party_id(row["party_name"]),
                    "party_name": row["party_name"] or "Independent",
                    "votes": row["votes"],
                }
                for row in district["candidates"].values()
            ]
            valid = sum(row["votes"] for row in candidates)
            if not valid:
                continue
            for row in candidates:
                row["vote_share"] = round(row["votes"] / valid * 100, 2)
            candidates.sort(key=lambda row: (-row["votes"], row["name"]))
            winner = candidates[0]
            parties = {}
            for row in candidates:
                bucket = parties.setdefault(
                    row["party_id"], {"party_id": row["party_id"], "votes": 0}
                )
                bucket["votes"] += row["votes"]
            party_rows = [
                {
                    "party_id": pid,
                    "votes": row["votes"],
                    "vote_share": round(row["votes"] / valid * 100, 2),
                }
                for pid, row in parties.items()
            ]
            party_rows.sort(key=lambda row: (-row["votes"], row["party_id"]))
            by_name.setdefault(name, {})[year] = {
                "year": year,
                "event": meta["event"],
                "boundary": meta["boundary"],
                "comparable": meta["comparable"],
                "code": district["code"],
                "valid_votes": valid,
                "winner": {
                    "name": winner["name"],
                    "party_id": winner["party_id"],
                    "party_name": winner["party_name"],
                    "votes": winner["votes"],
                    "vote_share": winner["vote_share"],
                },
                "parties": party_rows,
            }
    return by_name


def build_history(store, config):
    urls = config["history_urls"]
    years = sorted(GENERAL_ELECTIONS)
    per_year = {}
    sources = []
    for key, years_for_file in (
        ("by_voting_area", [year for year in years if year < 2021]),
        ("by_voting_place", [year for year in years if year >= 2021]),
    ):
        data, meta = store.get(urls[key])
        partial = aggregate(decode(data), years_for_file)
        for year, districts in partial.items():
            per_year.setdefault(year, {}).update(districts)
        sources.append(
            {
                "url": meta["url"],
                "retrieved_at": meta["retrieved_at"],
                "sha256": meta["sha256"],
                "label": "Elections BC provincial voting results (BC Data Catalogue)",
            }
        )
    by_name = finish(per_year)
    coverage = {
        str(year): len(per_year.get(year, {})) for year in years
    }
    return {
        "generated_at": now(),
        "years": years,
        "by_name": by_name,
        "coverage": coverage,
        "source": sources,
    }
