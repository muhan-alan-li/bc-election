"""One district at a time: collect, reconcile identities, enrich, validate, publish."""

import re
import shutil
import subprocess
import tempfile
import uuid
from datetime import date
from pathlib import Path
from urllib.parse import urldefrag

from .parsers import Disclosures, Links, VoteIndex, member_name, name_key, natural_name, roster
from .storage import SourceError, atomic_json, now, read_json


def stable_id(kind, *parts):
    return f"{kind}-{uuid.uuid5(uuid.NAMESPACE_URL, '|'.join(parts))}"


def source_ref(meta, title, publisher, locator=None):
    return {"source_id": meta["id"], "url": meta["url"], "title": title,
            "publisher": publisher, "retrieved_at": meta["retrieved_at"],
            "sha256": meta["sha256"], "locator": locator}


def load_roster(store, config):
    data, meta = store.get(config["roster_url"])
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        # Elections BC's downloadable CSV currently uses Windows-1252.
        text = data.decode("cp1252")
    districts, candidates = roster(text)
    return districts, candidates, meta


def voting_indexes(store, config):
    archive, meta = store.text(config["voting_archive_url"])
    indexes = []
    for link in Links(archive, config["voting_archive_url"]).links:
        match = re.search(r"/Index/[^/]+/(\d{4})[^/]*votesmhds\.htm", link["url"], re.I)
        if match and int(match[1]) >= config["voting_since"]:
            if link["url"] not in indexes:
                indexes.append(link["url"])
    if not indexes:
        raise ValueError("No voting indexes found in the configured archive; source may have changed")
    return indexes, meta


def document_html(store, url):
    """Assembly public URLs wrap real documents in an iframe."""
    seen = set()
    for _ in range(4):
        if url in seen:
            raise ValueError(f"Document iframe loop: {url}")
        seen.add(url)
        text, meta = store.text(url)
        frames = Links(text, url).frames
        if not frames:
            return text, meta
        url = frames[0]
    raise ValueError("Too many document iframe wrappers")


def collect_votes(store, index_urls, aliases):
    records, checks, errors = [], [], []
    keys = {name_key(alias) for alias in aliases}
    for url in index_urls:
        try:
            text, meta = document_html(store, url)
            links = Links(text, meta["url"]).links
            members = [link for link in links if "#mh" in link["url"]
                       and name_key(member_name(link["text"])) in keys]
            checks.append(source_ref(meta, "Voting records by member", "Legislative Assembly of BC"))
            # Some index versions contain records directly; others link to letter pages.
            pages = {urldefrag(link["url"])[0] for link in members}
            if not pages and not re.search(r"standing votes by Members", text, re.I):
                raise ValueError("Expected member voting index marker missing")
            if not pages:
                pages = {meta["url"]}
            for page in sorted(pages):
                body, page_meta = (text, meta) if page == meta["url"] else document_html(store, page)
                parsed = VoteIndex(body, page_meta["url"], aliases).records
                for record in parsed:
                    record["source"] = source_ref(page_meta, "Voting records by member",
                                                  "Legislative Assembly of BC", record["locator"])
                    records.append(record)
        except (SourceError, ValueError, UnicodeError) as error:
            errors.append({"url": url, "error": str(error)})
    unique = {}
    for record in records:
        key = (record["transcript_url"], record["subject"], record["stage"])
        if key in unique and unique[key]["position"] != record["position"]:
            raise ValueError(f"Conflicting vote positions: {key}")
        unique[key] = record
    return sorted(unique.values(), key=lambda row: (row["date"], row["transcript_url"])), checks, errors


def collect_disclosure_catalog(store, urls):
    documents, checks, errors = [], [], []
    for url in urls:
        try:
            text, meta = store.text(url)
            if "Public Disclosure Statement" not in text:
                raise ValueError("Expected disclosure index marker missing")
            parsed = Disclosures(text, url).records
            if not parsed:
                raise ValueError("No disclosure documents parsed; source may have changed")
            ref = source_ref(meta, "Members' public disclosure statements", "Legislative Assembly of BC")
            checks.append(ref)
            documents.extend({**item, "index_source": ref} for item in parsed)
        except (SourceError, ValueError, UnicodeError) as error:
            errors.append({"url": url, "error": str(error)})
    documents = list({(name_key(doc["member_name"]), doc["url"]): doc for doc in documents}.values())
    return documents, checks, errors


def disclosure_document(store, document, download):
    result = {**document, "extraction_status": "not_downloaded", "pages": []}
    if not download:
        return result
    try:
        data, meta = store.get(document["url"])
        if not data.startswith(b"%PDF-"):
            text = data.decode("utf-8-sig")
            frames = Links(text, document["url"]).frames
            if not frames:
                raise ValueError("Disclosure URL returned neither PDF nor document iframe")
            data, meta = store.get(frames[0])
        if not data.startswith(b"%PDF-"):
            raise ValueError("Disclosure document is not a PDF")
        result["source"] = source_ref(meta, document["title"], "Legislative Assembly of BC")
        if not shutil.which("pdftotext"):
            result["extraction_status"] = "pdf_saved_text_tool_unavailable"
            return result
        with tempfile.TemporaryDirectory() as folder:
            pdf = Path(folder) / "document.pdf"
            pdf.write_bytes(data)
            extracted = subprocess.run(["pdftotext", "-layout", str(pdf), "-"],
                                       capture_output=True, check=True, timeout=30)
        pages = extracted.stdout.decode("utf-8").split("\f")
        result["pages"] = [{"page": i, "text": text.strip()} for i, text in enumerate(pages, 1) if text.strip()]
        result["extraction_status"] = "extracted_unreviewed" if result["pages"] else "needs_ocr"
    except (SourceError, ValueError, OSError, subprocess.SubprocessError) as error:
        result["extraction_status"] = "error"
        result["error"] = str(error)
    return result


def identity_registry(root, election_id, district_code, candidates):
    path = Path(root) / "curated" / "identities.json"
    registry = read_json(path, {"people": [], "candidacies": []})
    for candidate in candidates:
        matches = [row for row in registry["candidacies"] if row["election_id"] == election_id
                   and row["district_code"] == district_code and row["ballot_name"] == candidate["name"]]
        if len(matches) > 1:
            raise ValueError(f"Duplicate identity mappings: {candidate['name']}")
        if not matches:
            person_id = f"person-{uuid.uuid4()}"
            registry["people"].append({"id": person_id, "name": candidate["name"],
                                       "reviewed_at": None, "identity_sources": [],
                                       "legislative_aliases": [], "disclosure_aliases": [],
                                       "office_history": []})
            registry["candidacies"].append({"id": stable_id("candidacy", election_id, district_code, candidate["name"]),
                                          "election_id": election_id, "district_code": district_code,
                                          "ballot_name": candidate["name"], "person_id": person_id})
    atomic_json(path, registry)
    return registry


def validate(dataset, *, client=False):
    """Reject broken identity/source references before replacing a publication."""
    def require(condition, message):
        if not condition:
            raise ValueError(message)

    def ids(items):
        result = [row["id"] for row in items]
        require(len(result) == len(set(result)), "Duplicate IDs")
        return set(result)

    require(dataset["schema_version"] == 2, "Unsupported schema version")
    people = ids(dataset["people"])
    parties = ids(dataset["parties"])
    sources = ids(dataset["sources"]) if not client else set()
    if client:
        def citations(value):
            if isinstance(value, dict):
                if 'source_id' in value:
                    require(bool(value.get('url')) and bool(value.get('sha256')) and bool(value.get('retrieved_at')),
                            'Client citation requires URL, hash, and retrieval date')
                    sources.add(value['source_id'])
                for item in value.values():
                    citations(item)
            elif isinstance(value, list):
                for item in value:
                    citations(item)
        citations(dataset)
    ids(dataset["candidacies"])
    ids(dataset["votes"])
    ids(dataset["interests"])
    ids(dataset["disclosures"])
    require(bool(dataset["district"]["id"]), "Missing district ID")
    date.fromisoformat(dataset["generated_at"][:10])
    if dataset["election"].get("voting_date"):
        date.fromisoformat(dataset["election"]["voting_date"])
    for person in dataset["people"]:
        if person.get("reviewed_at"):
            date.fromisoformat(person["reviewed_at"])
            if not client:
                require(bool(person["identity_sources"]), "Reviewed identity requires sources")
        else:
            require(not person.get("legislative_aliases") and not person.get("disclosure_aliases"),
                    "Source aliases require a reviewed identity")
    for candidate in dataset["candidacies"]:
        require(candidate["person_id"] in people, "Broken person reference")
        require(candidate["district_id"] == dataset["district"]["id"], "Wrong district reference")
        require(candidate["election_id"] == dataset["election"]["id"], "Wrong election reference")
        require(candidate["affiliation"] in {"party", "independent", "unaffiliated"}, "Invalid affiliation")
        require((candidate["affiliation"] == "party" and candidate["party_id"] in parties)
                or (candidate["affiliation"] != "party" and candidate["party_id"] is None), "Invalid party reference")
        require(candidate["source"]["source_id"] in sources, "Missing roster source")
    for record in dataset["votes"]:
        require(record["person_id"] in people, "Vote attributed to an unknown person")
        date.fromisoformat(record["date"])
        require(record["position"] in {"yea", "nay"}, "Invalid vote position")
        require(bool(record["subject"]) and bool(record["stage"]), "Missing vote context")
        require(record["source"]["source_id"] in sources, "Missing vote source")
    for interest in dataset["interests"]:
        require(interest["person_id"] in people, "Interest attributed to an unknown person")
        require(interest["document_id"] in {doc["id"] for doc in dataset["disclosures"]}, "Missing disclosure document")
        require(interest["category"] in {"asset", "liability", "income", "business", "other"}, "Invalid interest category")
        require(interest["holder"] in {"member", "spouse", "dependent", "controlled_corporation", "joint", "unspecified"}, "Invalid interest holder")
        require(isinstance(interest["page"], int) and interest["page"] > 0, "Missing disclosure page")
        require(bool(interest["description"]), "Missing interest description")
        date.fromisoformat(interest["reviewed_at"])
        document = next(doc for doc in dataset["disclosures"] if doc["id"] == interest["document_id"])
        require(document["person_id"] == interest["person_id"], "Interest belongs to another person's disclosure")
        require(document["document_type"] in {"public_disclosure", "material_change"}, "Gift filings are not holdings inventories")
        require(bool(interest["as_of"]), "Missing interest as-of date")
        date.fromisoformat(interest["as_of"])
    for document in dataset["disclosures"]:
        require(document["person_id"] in people, "Unknown disclosure owner")
        require(document["index_source"]["source_id"] in sources, "Missing disclosure index source")
        if "source" in document:
            require(document["source"]["source_id"] in sources, "Missing disclosure source")
    require({row["person_id"] for row in dataset["coverage"]} == people, "Missing candidate coverage")


def run_district(store, config, root, selection, *, download_documents=False, publish=True):
    root = Path(root)
    if not re.fullmatch(r"[a-zA-Z0-9_-]+", config["election"]["id"]):
        raise ValueError("Election ID must contain only letters, numbers, underscores or hyphens")
    districts, roster_rows, roster_meta = load_roster(store, config)
    matches = [code for code, name in districts.items()
               if name_key(selection) in {name_key(code), name_key(name)}]
    if len(matches) != 1:
        raise ValueError(f"Unknown or ambiguous constituency: {selection}. Use list-districts.")
    code = matches[0]
    if not re.fullmatch(r"[a-zA-Z0-9_-]+", code):
        raise ValueError("Unsupported official district code")
    rows = sorted([row for row in roster_rows if row["district_code"] == code], key=lambda row: name_key(row["name"]))
    election = config["election"]
    district_id = stable_id("district", election["id"], code)
    registry = identity_registry(root, election["id"], code, rows)
    documents, disclosure_checks, disclosure_errors = collect_disclosure_catalog(store, config["disclosure_urls"])
    try:
        indexes, _ = voting_indexes(store, config)
        vote_errors = []
    except (SourceError, ValueError) as error:
        indexes, vote_errors = [], [{"error": str(error)}]
    member_catalog = []
    for index in indexes:
        try:
            body, meta = document_html(store, index)
            members = [link for link in Links(body, meta["url"]).links if "#mh" in link["url"]]
            member_catalog.extend({**link, "alias": member_name(link["text"])} for link in members)
        except (SourceError, ValueError, UnicodeError) as error:
            vote_errors.append({"url": index, "error": str(error)})
    output = {"schema_version": 2, "generated_at": now(), "election": election,
              "district": {"id": district_id, "official_code": code, "name": districts[code],
                           "boundary_version": election["boundary_version"], "roster_status": election["status"]},
              "people": [], "parties": [], "candidacies": [], "votes": [], "disclosures": [],
              "interests": [], "coverage": [], "identity_leads": [], "tasks": [], "sources": []}
    for row in rows:
        mapping = next(item for item in registry["candidacies"] if item["election_id"] == election["id"]
                       and item["district_code"] == code and item["ballot_name"] == row["name"])
        persons = [item for item in registry["people"] if item["id"] == mapping["person_id"]]
        if len(persons) != 1:
            raise ValueError(f"Missing or duplicate person identity: {row['name']}")
        person = persons[0]
        output["people"].append(person)
        party_id = stable_id("party", row["party_name"]) if row["party_name"] else None
        if party_id and not any(party["id"] == party_id for party in output["parties"]):
            output["parties"].append({"id": party_id, "name": row["party_name"]})
        output["candidacies"].append({"id": mapping["id"], "person_id": person["id"],
            "election_id": election["id"], "district_id": district_id, "ballot_name": row["name"],
            "party_id": party_id, "affiliation": row["affiliation"], "status": "listed",
            "source": source_ref(roster_meta, "Official candidate list", "Elections BC")})
        reviewed = bool(person["reviewed_at"])
        output["identity_leads"].append({"person_id": person["id"], "status": "unreviewed_suggestions",
            "voting_members": [link for link in member_catalog if natural_name(link["text"]) == name_key(row["name"])],
            "disclosure_members": sorted({doc["member_name"] for doc in documents
                                           if natural_name(doc["member_name"]) == name_key(row["name"])})})
        votes, vote_checks, errors = collect_votes(store, indexes, person["legislative_aliases"]) if reviewed and person["legislative_aliases"] else ([], [], [])
        for vote in votes:
            vote["person_id"] = person["id"]
            vote["id"] = stable_id("vote", person["id"], vote["transcript_url"], vote["subject"], vote["stage"])
            output["votes"].append(vote)
        aliases = {name_key(alias) for alias in person["disclosure_aliases"]} if reviewed else set()
        selected_docs = [doc for doc in documents if name_key(doc["member_name"]) in aliases]
        candidate_docs = []
        for doc in selected_docs:
            doc = disclosure_document(store, doc, download_documents)
            doc["id"] = stable_id("disclosure", person["id"], doc["url"])
            doc["person_id"] = person["id"]
            candidate_docs.append(doc)
        output["disclosures"].extend(candidate_docs)
        coverage = {"person_id": person["id"], "identity_status": "reviewed" if reviewed else "needs_review",
            "voting": {"status": "partial" if votes else "not_reviewed", "since_year": config["voting_since"],
                       "count": len(votes), "sources_checked": vote_checks, "errors": vote_errors + errors,
                       "limitation": "Member index entries only. Exact questions and outcomes need transcript review; missing entries do not establish absence or abstention. Prior-office records are not collected by this adapter."},
            "interests": {"status": "documents_found" if candidate_docs else "not_reviewed",
                          "count": len(candidate_docs), "sources_checked": disclosure_checks,
                          "errors": disclosure_errors + [{"url": doc["url"], "error": doc["error"]}
                                                          for doc in candidate_docs if "error" in doc],
                          "limitation": "Public member disclosures only, including archived statements. Documents and extracted text are not a complete holdings inventory or current ownership finding. Campaign finance is separate."}}
        output["coverage"].append(coverage)
        if not reviewed:
            output["tasks"].append({"person_id": person["id"], "kind": "review_identity_and_office_history",
                "instruction": "Confirm this person's source aliases and prior offices in curated/identities.json. Do not match on surname alone."})
        output["tasks"].append({"person_id": person["id"], "kind": "review_voting_scope",
            "instruction": "Review index entries against transcripts; check uncovered sessions and any prior offices.", "errors": vote_errors + errors})
        output["tasks"].append({"person_id": person["id"], "kind": "review_disclosures",
            "instruction": "Review document pages and material changes. Record dated, source-linked interests in curated/interests.json; do not infer no interests from missing documents.", "errors": disclosure_errors})
    reviewed_interests = read_json(root / "curated" / "interests.json", [])
    person_ids = {person["id"] for person in output["people"]}
    output["interests"] = [row for row in reviewed_interests if row["person_id"] in person_ids]
    for coverage in output["coverage"]:
        coverage["interests"]["reviewed_entry_count"] = sum(item["person_id"] == coverage["person_id"] for item in output["interests"])
        if coverage["interests"]["reviewed_entry_count"]:
            coverage["interests"]["status"] = "partial_review"
    output["sources"] = list(store.used.values())
    validate(output)
    relative = Path(election["id"]) / f"{code}.json"
    atomic_json(root / "normalized" / relative, output)
    if not publish:
        return output, root / 'normalized' / relative
    from .pipeline import curate, polish
    curate(root, election['id'], code)
    polish(root, election['id'], code)
    return output, root / "published" / relative
