"""Build a compact, static election publication from the official roster."""

import shutil
import tempfile
import uuid
from pathlib import Path

from .parsers import roster, slug
from .storage import atomic_json, now
from .validate import validate_publication


def stable_id(kind, *parts):
    return f"{kind}-{uuid.uuid5(uuid.NAMESPACE_URL, '|'.join(parts))}"


def source_ref(meta, *, title, publisher, locator=None):
    return {
        "source_id": meta["id"],
        "url": meta["url"],
        "title": title,
        "publisher": publisher,
        "retrieved_at": meta["retrieved_at"],
        "sha256": meta["sha256"],
        "locator": locator,
    }


def load_roster(store, config):
    data, meta = store.get(config["roster_url"])
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        # Elections BC's downloadable CSV currently uses Windows-1252.
        text = data.decode("cp1252")
    districts, candidates = roster(text)
    return districts, candidates, meta


def publish_roster(storage, config, districts, candidates, roster_meta):
    """Write the catalog and one compact ballot per constituency.

    The previous publication is replaced only after the complete staging folder
    validates, so a failed import cannot leave a half-written dataset behind.
    """
    published = Path(storage) / "published"
    election = config["election"]
    election_id = election["id"]
    generated_at = now()
    source = source_ref(roster_meta, title="Official candidate list", publisher="Elections BC")

    party_ids = {}
    for candidate in candidates:
        if candidate["affiliation"] == "party" and candidate["party_name"] not in party_ids:
            party_ids[candidate["party_name"]] = stable_id(
                "party", election_id, candidate["party_name"]
            )

    catalog_districts = []
    ballots = {}
    for code, name in sorted(districts.items(), key=lambda item: item[1]):
        district_id = stable_id("district", election_id, code)
        rows = [row for row in candidates if row["district_code"] == code]
        parties = []
        candidacies = []
        for row in sorted(rows, key=lambda item: slug(item["name"])):
            party_id = party_ids.get(row["party_name"]) if row["affiliation"] == "party" else None
            if party_id and not any(party["id"] == party_id for party in parties):
                parties.append({"id": party_id, "name": row["party_name"]})
            candidacies.append(
                {
                    "id": stable_id("candidacy", election_id, code, row["name"]),
                    "person_id": stable_id("person", election_id, code, row["name"]),
                    "election_id": election_id,
                    "district_id": district_id,
                    "ballot_name": row["name"],
                    "party_id": party_id,
                    "affiliation": row["affiliation"],
                    "status": "listed",
                    "source": source,
                }
            )
        district = {
            "id": district_id,
            "official_code": code,
            "name": name,
            "roster_status": election.get("status") or "final_roster",
            "candidate_count": len(candidacies),
        }
        catalog_districts.append(district)
        ballots[code] = {
            "schema_version": 1,
            "election_id": election_id,
            "generated_at": generated_at,
            "district": district,
            "parties": sorted(parties, key=lambda item: item["name"]),
            "candidacies": candidacies,
        }

    catalog = {
        "schema_version": 1,
        "election_id": election_id,
        "generated_at": generated_at,
        "election": {
            "id": election_id,
            "title": election["title"],
            "voting_date": election.get("voting_date"),
            "boundary_version": election.get("boundary_version"),
            "status": election.get("status"),
            "source_url": election.get("source_url"),
        },
        "districts": catalog_districts,
    }

    published.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".build-", dir=published))
    try:
        atomic_json(staging / "catalog.json", catalog)
        for code, ballot in ballots.items():
            atomic_json(staging / "ballots" / f"{code}.json", ballot, compact=True)
        validate_publication(staging, election_id)
        target = published / election_id
        if target.exists():
            shutil.rmtree(target)
        staging.rename(target)
    finally:
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
    return target / "catalog.json", len(ballots)
