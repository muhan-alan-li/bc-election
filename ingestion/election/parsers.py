"""Parse the official Elections BC candidate roster."""

import csv
import io
import re
import unicodedata


def name_key(value):
    value = unicodedata.normalize("NFC", value).replace("\u200b", "")
    return " ".join(value.split()).casefold()


def slug(value):
    """Return a stable, human-readable key for identifiers and storage names."""
    value = unicodedata.normalize("NFKD", value)
    value = value.encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")


def roster(text):
    reader = csv.DictReader(io.StringIO(text.lstrip("\ufeff")))
    required = {"ED Code", "Electoral District", "Candidate Ballot Name", "Affiliation"}
    if not required.issubset(reader.fieldnames or []):
        raise ValueError("Roster CSV is missing required Elections BC columns")
    districts, candidates, seen = {}, [], set()
    for row in reader:
        code, district, candidate, affiliation = [
            row[key].strip()
            for key in ("ED Code", "Electoral District", "Candidate Ballot Name", "Affiliation")
        ]
        if not code or not district or not candidate:
            raise ValueError("Roster contains a blank district code, district, or candidate")
        if code in districts and districts[code] != district:
            raise ValueError(f"Conflicting district names for {code}")
        districts[code] = district
        identity = (code, name_key(candidate))
        if identity in seen:
            raise ValueError(f"Duplicate candidacy: {district}: {candidate}")
        seen.add(identity)
        status = {
            "independent": "independent",
            "unaffiliated": "unaffiliated",
            "": "unaffiliated",
        }.get(affiliation.casefold(), "party")
        candidates.append(
            {
                "district_code": code,
                "name": candidate,
                "affiliation": status,
                "party_name": affiliation if status == "party" else None,
            }
        )
    if not districts:
        raise ValueError("Roster CSV is empty; refusing to replace an existing roster")
    return districts, candidates
