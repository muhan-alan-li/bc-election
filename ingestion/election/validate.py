"""Validate the compact roster publication used by the static site."""

from datetime import date
from pathlib import Path
from urllib.parse import urlparse

from .storage import read_json


def require(condition, message):
    if not condition:
        raise ValueError(message)


def valid_id(value):
    return isinstance(value, str) and value and all(c.isalnum() or c in "_-" for c in value)


def valid_source(source):
    if not isinstance(source, dict):
        return False
    url = urlparse(source.get("url") or "")
    return (
        url.scheme in ("http", "https")
        and bool(url.netloc)
        and not url.username
        and not url.password
        and bool(source.get("source_id"))
        and bool(source.get("sha256"))
        and bool(source.get("retrieved_at"))
    )


def validate_catalog(catalog, election_id):
    require(isinstance(catalog, dict), "Catalog must be an object")
    require(catalog.get("schema_version") == 1, "Unsupported catalog schema version")
    require(catalog.get("election_id") == election_id, "Catalog election mismatch")
    districts = catalog.get("districts")
    require(isinstance(districts, list) and districts, "Catalog has no districts")
    seen = set()
    for district in districts:
        require(valid_id(district.get("id")), "Invalid district ID")
        require(valid_id(district.get("official_code")), "Invalid district code")
        require(bool(district.get("name")), "Missing district name")
        require(district["official_code"] not in seen, "Duplicate district code")
        require(isinstance(district.get("candidate_count"), int) and district["candidate_count"] >= 0,
                "Invalid candidate count")
        seen.add(district["official_code"])
    return districts


def validate_ballot(ballot, election_id, district):
    require(isinstance(ballot, dict), "Ballot must be an object")
    require(ballot.get("schema_version") == 1, "Unsupported ballot schema version")
    require(ballot.get("election_id") == election_id, "Ballot election mismatch")
    require(ballot.get("district", {}).get("official_code") == district["official_code"],
            "Ballot belongs to another district")
    require(ballot.get("district", {}).get("id") == district["id"], "Ballot district ID mismatch")
    parties = ballot.get("parties")
    candidacies = ballot.get("candidacies")
    require(isinstance(parties, list), "Missing ballot parties")
    require(isinstance(candidacies, list), "Missing ballot candidacies")
    require(len(candidacies) == district["candidate_count"], "Candidate count differs from catalog")
    party_ids = set()
    for party in parties:
        require(valid_id(party.get("id")) and bool(party.get("name")), "Invalid ballot party")
        require(party["id"] not in party_ids, "Duplicate ballot party")
        party_ids.add(party["id"])
    seen = set()
    for candidacy in candidacies:
        require(valid_id(candidacy.get("id")), "Invalid candidacy ID")
        require(candidacy["id"] not in seen, "Duplicate candidacy ID")
        seen.add(candidacy["id"])
        require(bool(candidacy.get("ballot_name")), "Missing candidate name")
        require(candidacy.get("election_id") == election_id, "Candidacy election mismatch")
        require(candidacy.get("district_id") == district["id"], "Candidacy district mismatch")
        require(candidacy.get("affiliation") in {"party", "independent", "unaffiliated"},
                "Invalid affiliation")
        if candidacy["affiliation"] == "party":
            require(candidacy.get("party_id") in party_ids, "Invalid party reference")
        else:
            require(candidacy.get("party_id") is None, "Unexpected party reference")
        require(valid_source(candidacy.get("source")), "Invalid candidacy source")
    return ballot


def validate_publication(folder, election_id):
    folder = Path(folder)
    catalog = read_json(folder / "catalog.json")
    districts = validate_catalog(catalog, election_id)
    ballot_files = sorted((folder / "ballots").glob("*.json"))
    require(len(ballot_files) == len(districts), "Ballot count differs from catalog")
    expected = {district["official_code"] for district in districts}
    found = {path.stem for path in ballot_files}
    require(found == expected, "Ballot files differ from catalog")
    for district in districts:
        ballot = read_json(folder / "ballots" / f"{district['official_code']}.json")
        validate_ballot(ballot, election_id, district)
        generated = ballot.get("generated_at", "")[:10]
        date.fromisoformat(generated)
    return catalog
