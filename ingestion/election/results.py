"""Build the 2026 general election result publication.

The source is Elections BC's event-night reporting page. Results are parsed
from the published candidate table and cross-checked against the electorate
totals printed on the same page. The publication is written atomically and
validated before the previous file is replaced.
"""

import re
from datetime import datetime
from html import unescape
from pathlib import Path

from .storage import atomic_json, now, read_json
from .validate import require

TOTAL_LABELS = {
    "Total Valid Votes": "valid_votes",
    "Rejected Ballots*": "rejected_votes",
    "Total Considered Votes": "considered_votes",
}

# Elections BC party labels, normalised to the site's stable party IDs.
PARTY_ALIASES = {
    "": "independent",
    "bc ndp": "ndp",
    "new democratic party": "ndp",
    "ndp": "ndp",
    "conservative": "conservative",
    "conservative party": "conservative",
    "bc conservative party": "conservative",
    "conservative party of bc": "conservative",
    "bc green party": "green",
    "green party": "green",
    "green party of bc": "green",
    "centrebc": "centre",
    "centre bc": "centre",
    "onebc": "onebc",
    "independent": "independent",
    "libertarian": "libertarian",
    "communist party of bc": "communist",
    "christian heritage party of bc": "chp",
    "cwp": "canwest",
    "canwest party": "canwest",
    "canwest": "canwest",
    "freedom party of bc": "freedom",
    "bc liberal party": "liberal",
    "bc liberal": "liberal",
    "bc united": "liberal",
    "other": "other",
}

DEFAULT_PARTIES = {
    "ndp": ("BC NDP", "#c85316"),
    "conservative": ("Conservative Party of BC", "#245b8a"),
    "green": ("BC Green Party", "#38634b"),
    "centre": ("CentreBC", "#65518b"),
    "chp": ("Christian Heritage Party of BC", "#315580"),
    "communist": ("Communist Party of BC", "#a33333"),
    "canwest": ("CanWest Party", "#536473"),
    "freedom": ("Freedom Party of BC", "#766126"),
    "libertarian": ("Libertarian", "#806822"),
    "onebc": ("OneBC", "#773a44"),
    "independent": ("Independent", "#6b7280"),
    "liberal": ("BC Liberal Party", "#d71920"),
    "other": ("Other", "#8a8f98"),
}


def party_key(name):
    if name is None:
        return ""
    value = name.lower().replace("&", "and").replace(".", "")
    value = re.sub(r"[^a-z0-9 ]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def party_id(name):
    return PARTY_ALIASES.get(party_key(name), "other")


def clean_text(value):
    """Strip markup and the double escaping used by the reporting page."""
    value = re.sub(r"<[^>]+>", "", value or "")
    return unescape(unescape(value)).strip()


def number(value):
    digits = re.sub(r"[^0-9]", "", value or "")
    return int(digits) if digits else 0


def decimal(value):
    match = re.search(r"-?\d+(?:\.\d+)?", value or "")
    return float(match.group(0)) if match else 0.0


def parse_summary(html):
    summary = {}
    boxes = re.findall(
        r'<div class="main-line">(.*?)</div>.*?<div class="small-line">(.*?)</div>',
        html,
        re.S,
    )
    for value, label in boxes:
        value = clean_text(value)
        label = clean_text(label)
        if value == "INITIAL COUNT" and label == "Complete":
            summary["complete"] = True
        if label == "Preliminary Voter Turnout":
            summary["turnout_percent"] = decimal(value)
        elif label == "Total Votes Considered":
            summary["votes_considered"] = number(value)
        elif label.startswith("Registered voters as of"):
            summary["registered_voters"] = number(value)
            summary["registered_as_of"] = label[len("Registered voters as of "):]
        elif label == "Of ballot boxes reporting":
            summary["reporting"] = f"{value} of ballot boxes reporting"
    as_of = re.search(r"As of ([A-Z][a-z]+ \d{1,2}, \d{4} \d{1,2}:\d{2} [A-Z]{2,4})", html)
    summary["as_of_text"] = as_of.group(1) if as_of else None
    final = re.search(
        r"final count, scheduled for ([A-Z][a-z]+ \d{1,2}) to (\d{1,2}), (\d{4})",
        html,
    )
    if final:
        summary["final_count"] = {
            "start": iso_date(f"{final.group(1)}, {final.group(3)}"),
            "end": iso_date(
                f"{final.group(1).split()[0]} {final.group(2)}, {final.group(3)}"
            ),
        }
    summary["complete"] = summary.get("complete", False)
    return summary


def iso_date(text):
    text = re.sub(r"\s+", " ", text).strip()
    for order in ("%B %d, %Y", "%b %d, %Y"):
        try:
            return datetime.strptime(text, order).date().isoformat()
        except ValueError:
            continue
    raise ValueError(f"Unrecognised date: {text}")


def parse_candidates(html):
    districts = {}
    rows = re.findall(r'<tr[^>]*data-ed="([^"]+)"[^>]*>(.*?)</tr>', html, re.S)
    for name, body in rows:
        cells = [clean_text(cell) for cell in re.findall(r"<td[^>]*>(.*?)</td>", body, re.S)]
        if len(cells) < 5:
            continue
        district = districts.setdefault(
            name,
            {
                "name": name,
                "candidates": [],
                "valid_votes": None,
                "rejected_votes": None,
                "considered_votes": None,
            },
        )
        label = cells[1]
        if label in TOTAL_LABELS:
            district[TOTAL_LABELS[label]] = number(cells[3])
        elif label:
            district["candidates"].append(
                {
                    "name": label,
                    "party_id": party_id(cells[2]),
                    "party_name": cells[2] or "Independent",
                    "votes": number(cells[3]),
                    "vote_share": decimal(cells[4]),
                }
            )
    return districts


def finish_district(district):
    candidates = sorted(
        district["candidates"],
        key=lambda row: (-row["votes"], row["name"]),
    )
    valid = district["valid_votes"]
    if valid is None:
        valid = sum(row["votes"] for row in candidates)
    # The reporting page expresses candidate percentages against considered
    # ballots (valid plus rejected). Recompute against valid votes so candidate
    # shares add to 100 and match the party-level totals.
    for row in candidates:
        row["vote_share"] = round(row["votes"] / valid * 100, 2) if valid else 0.0
    for position, row in enumerate(candidates):
        row["elected"] = position == 0
        row["rank"] = position + 1
    winner = candidates[0]
    runner_up = candidates[1] if len(candidates) > 1 else None
    return {
        **district,
        "candidates": candidates,
        "winner": {
            "name": winner["name"],
            "party_id": winner["party_id"],
            "votes": winner["votes"],
            "vote_share": winner["vote_share"],
        },
        "margin": {
            "votes": winner["votes"] - (runner_up["votes"] if runner_up else 0),
            "points": round(
                winner["vote_share"] - (runner_up["vote_share"] if runner_up else 0),
                2,
            ),
        },
    }


def build_parties(districts, registry):
    totals = {}
    seats = {}
    for district in districts.values():
        for candidate in district["candidates"]:
            pid = candidate["party_id"]
            totals[pid] = totals.get(pid, 0) + candidate["votes"]
            if candidate["elected"]:
                seats[pid] = seats.get(pid, 0) + 1
    valid = sum(totals.values())
    names = {}
    colors = {}
    for party in registry.get("parties", []):
        names[party["id"]] = party["name"]
        colors[party["id"]] = party["color"]
    parties = []
    for pid in set(totals) | set(seats) | {"liberal", "other"}:
        default_name, default_color = DEFAULT_PARTIES.get(pid, (pid.title(), "#8a8f98"))
        votes = totals.get(pid, 0)
        parties.append(
            {
                "id": pid,
                "name": names.get(pid, default_name),
                "color": colors.get(pid, default_color),
                "seats": seats.get(pid, 0),
                "votes": votes,
                "vote_share": round(votes / valid * 100, 2) if valid else 0.0,
                "historical": pid not in totals and pid not in seats,
            }
        )
    parties.sort(key=lambda row: (-row["seats"], -row["votes"], row["name"]))
    return parties


def parse_results(html, config, source):
    election = config["election"]
    summary = parse_summary(html)
    districts = {name: finish_district(row) for name, row in parse_candidates(html).items()}
    if not districts:
        raise ValueError("No constituency results found in the reporting page")
    seats = election.get("seats") or len(districts)
    return {
        "schema_version": 1,
        "election_id": election["id"],
        "generated_at": now(),
        "election": {
            "id": election["id"],
            "title": election["title"],
            "voting_date": election.get("voting_date"),
            "parliament": election.get("parliament"),
            "seats": seats,
            "majority": seats // 2 + 1,
            "status": election.get("results_status", "initial_count"),
            "status_label": (
                "Initial count complete"
                if summary.get("complete")
                else "Results reported"
            ),
            "as_of": summary.get("as_of_text"),
            "final_count": summary.get("final_count"),
            "reporting": summary.get("reporting"),
            "turnout": {
                "percent": summary.get("turnout_percent"),
                "votes_considered": summary.get("votes_considered"),
                "registered_voters": summary.get("registered_voters"),
                "registered_as_of": summary.get("registered_as_of"),
            },
            "source": source,
        },
        "districts": districts,
    }


def attach_codes(results, catalog):
    """Match the reporting page's constituency names to official roster codes."""
    codes = {district["name"]: district["official_code"] for district in catalog["districts"]}
    districts = {}
    for name, district in results["districts"].items():
        code = codes.get(name)
        if not code:
            raise ValueError(f"Result constituency is not in the roster: {name}")
        districts[code] = {**district, "code": code}
    missing = set(codes.values()) - set(districts)
    if missing:
        raise ValueError(f"Roster constituencies without results: {sorted(missing)}")
    results["districts"] = districts
    return results


def build_results(store, config, registry, catalog):
    """Fetch and parse the reporting page, then attach historical results."""
    from .history import build_history

    url = config["results_url"]
    html, meta = store.text(url)
    source = {
        "source_id": meta["id"],
        "url": meta["url"],
        "title": "2026 Provincial General Election results",
        "label": "Elections BC: 2026 provincial general election results",
        "publisher": "Elections BC",
        "retrieved_at": meta["retrieved_at"],
        "sha256": meta["sha256"],
    }
    results = attach_codes(parse_results(html, config, source), catalog)
    history = build_history(store, config)
    by_name = history["by_name"]
    years = history["years"]
    for district in results["districts"].values():
        entries = by_name.get(district["name"], {})
        district["history"] = [entries[year] for year in years if year in entries]
    coverage = {
        str(year): sum(
            1
            for district in results["districts"].values()
            if any(entry["year"] == year for entry in district["history"])
        )
        for year in years
    }
    results["history"] = {
        "years": years,
        "coverage": coverage,
        "source": history["source"],
    }
    results["parties"] = build_parties(results["districts"], registry)
    return results


def validate_results(results, election_id):
    require(results.get("schema_version") == 1, "Unsupported results schema version")
    require(results.get("election_id") == election_id, "Results election mismatch")
    election = results.get("election") or {}
    districts = results.get("districts")
    require(isinstance(districts, dict) and districts, "Results have no districts")
    require(election.get("seats") == len(districts), "Seat total does not match districts")
    require(election.get("majority") == election["seats"] // 2 + 1, "Invalid majority threshold")
    require(election["majority"] > 0, "Invalid majority threshold")

    seats = 0
    for code, district in districts.items():
        require(re.fullmatch(r"[A-Z0-9]{2,4}", code or ""), "Invalid district code")
        require(bool(district.get("name")), "Missing district name")
        candidates = district.get("candidates")
        require(isinstance(candidates, list) and len(candidates) >= 2, "Too few candidates")
        valid = district.get("valid_votes")
        require(isinstance(valid, int) and valid > 0, "Invalid valid-vote total")
        require(sum(row["votes"] for row in candidates) == valid, "Votes do not add up")
        require(
            abs(sum(row["vote_share"] for row in candidates) - 100) <= 0.5,
            "Vote shares do not add up",
        )
        require(
            district["winner"]["name"] == candidates[0]["name"]
            and candidates[0]["elected"],
            "Winner is not the leading candidate",
        )
        require(sum(1 for row in candidates if row["elected"]) == 1, "Invalid elected count")
        seats += 1

    parties = results.get("parties")
    require(isinstance(parties, list) and parties, "Results have no parties")
    require(sum(party["seats"] for party in parties) == seats, "Party seats do not add up")
    require(
        abs(sum(party["votes"] for party in parties) -
            sum(d["valid_votes"] for d in districts.values())) == 0,
        "Party votes do not add up",
    )
    for party in parties:
        require(bool(party.get("name")) and bool(party.get("color")), "Invalid party result")
        require(party["color"].startswith("#") and len(party["color"]) == 7, "Invalid party colour")
    return results


def publish_results(storage, results):
    path = Path(storage) / "published" / results["election_id"] / "results.json"
    validate_results(results, results["election_id"])
    atomic_json(path, results, compact=True)
    return path


def load_registry(content_dir, election_id):
    path = Path(content_dir) / election_id / "parties.json"
    return read_json(path)
