"""Shared, bounded collection of platform source material; no inferred promises."""

import re
import shutil
import subprocess
import tempfile
from collections import deque
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urldefrag, urlparse

from .parsers import Links, name_key
from .storage import SourceError, atomic_json, now, read_json
from .workflow import load_roster, source_ref, stable_id


class PageText(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.hidden = 0
        self.parts = []
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "noscript", "template"}:
            self.hidden += 1
        if tag in {"p", "div", "section", "li", "br", "h1", "h2", "h3"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style", "noscript", "template"}:
            self.hidden = max(0, self.hidden - 1)
        if tag in {"p", "div", "section", "li", "h1", "h2", "h3"}:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)

    def text(self):
        return "\n".join(line for part in "".join(self.parts).splitlines()
                         if (line := " ".join(part.split())))


def extract(data):
    if data.startswith(b"%PDF-"):
        if not shutil.which("pdftotext"):
            return "pdf", [], "extractor_unavailable"
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "source.pdf"
            path.write_bytes(data)
            result = subprocess.run(["pdftotext", "-layout", str(path), "-"],
                                    capture_output=True, timeout=60, check=True)
        pages = result.stdout.decode("utf-8").split("\f")
        return "pdf", [{"page": i + 1, "text": text.strip()}
                        for i, text in enumerate(pages) if text.strip()], "extracted"
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = data.decode("cp1252")
    if not re.search(r"<(?:html|body|head|p|div|article|!doctype)\b", text, re.I):
        raise ValueError("Unsupported source format; expected HTML or PDF")
    return "html", [{"page": None, "text": PageText(text).text()}], "extracted"


def platform_link(url, text, hosts, *, detailed=False, policy_index=False):
    parsed = urlparse(url)
    host = (parsed.hostname or "").removeprefix("www.")
    if parsed.scheme not in {"https", "http"} or host not in hosts:
        return False
    if re.search(r"privacy|cookie|terms|donat|membership|constitution|bylaws|financial|nomination", parsed.path, re.I):
        return False
    if detailed and re.search(r"/(?:2020|2024)-platform|/category/[^?]*(?:platform2020|platform2024)", parsed.path, re.I):
        return False
    if detailed and re.search(r"\b(?:2020|2024) platform\b", text, re.I):
        return False
    if detailed and policy_index and re.fullmatch(r"read more|read|learn more", text.strip(), re.I):
        return True
    pattern = r"platform|priorit|polic|commitment|manifesto|\.pdf(?:$|\?)"
    if detailed:
        pattern += r"|/plan(?:/|$)|/priorities(?:/|$)|/releases/|/announcements/|full (?:plan|news release)|economic vision|mission\.htm"
    return bool(re.search(pattern, parsed.path + " " + text, re.I))


def collect_material(store, seeds, *, max_pages=12, detailed=False):
    if not isinstance(max_pages, int) or not 1 <= max_pages <= 100:
        raise ValueError("max_pages must be between 1 and 100")
    if not isinstance(seeds, list) or any(not isinstance(url, str) for url in seeds):
        raise ValueError("Platform sources must be a list of source URLs")
    for url in seeds:
        store._check_url(url)
    queue = deque(dict.fromkeys(urldefrag(url)[0] for url in seeds))
    hosts = {(urlparse(url).hostname or "").removeprefix("www.") for url in seeds}
    seen, documents, errors = set(), [], []
    while queue and len(seen) < max_pages:
        url = queue.popleft()
        if url in seen:
            continue
        seen.add(url)
        try:
            data, meta = store.get(url)
            kind, pages, status = extract(data)
            documents.append({"id": stable_id("platform-document", url, meta["sha256"]),
                              "source": source_ref(meta, "Platform source material", urlparse(url).hostname),
                              "format": kind, "extraction_status": status, "pages": pages,
                              "review_status": "unparsed"})
            if kind == "html":
                for link in Links(data.decode("utf-8-sig", errors="replace"), url).links:
                    target = urldefrag(link["url"])[0]
                    if (target not in seen and target not in queue
                            and platform_link(target, link["text"], hosts, detailed=detailed,
                                              policy_index=bool(re.search(r"platform|/plan|priorit|polic", urlparse(url).path, re.I)))):
                        queue.append(target)
        except (SourceError, ValueError, OSError, UnicodeError, subprocess.SubprocessError) as error:
            errors.append({"url": url, "error": str(error)})
    incomplete = errors or queue or any(doc["extraction_status"] != "extracted"
                                       or not any(page["text"] for page in doc["pages"])
                                       for doc in documents)
    status = "not_configured" if not seeds else ("failed" if not documents else
             "partial" if incomplete else "collected")
    return {"documents": documents, "commitments": [], "parsing_status": "not_run",
            "coverage": {"status": status, "sources_checked": sorted(seen), "errors": errors,
                         "pending_urls": list(queue), "max_pages": max_pages, "discovery_mode": "party_detail" if detailed else "standard",
                         "limitation": "Configured sources and selected same-host links only; collected text is not a verified platform or a completeness finding."}}


def settings(config, root):
    election_id = config["election"]["id"]
    if not re.fullmatch(r"[a-zA-Z0-9_-]+", election_id):
        raise ValueError("Election ID must contain only letters, numbers, underscores or hyphens")
    registry = read_json(Path(root) / "curated" / "platform-sources.json", {})
    registry = registry.get(election_id, {"parties": {}, "candidates": {}})
    return election_id, registry


def publish(path, output):
    """Keep an earlier useful publication when every configured source fails."""
    previous = read_json(path)
    if output["coverage"]["status"] == "failed" and previous and previous.get("documents"):
        atomic_json(path.with_suffix(".attempt.json"), output)
        return
    atomic_json(path, output)
    path.with_suffix(".attempt.json").unlink(missing_ok=True)


def latest_attempt(path):
    publication = read_json(path)
    attempt = read_json(path.with_suffix(".attempt.json"))
    if attempt and attempt["generated_at"] > publication["generated_at"]:
        return attempt
    return publication


def collect_parties(store, config, root, *, party=None, max_pages=60):
    election_id, registry = settings(config, root)
    _, rows, roster_meta = load_roster(store, config)
    names = sorted({row["party_name"] for row in rows if row["party_name"]}, key=name_key)
    if party:
        names = [name for name in names if name_key(name) == name_key(party)]
        if not names:
            raise ValueError(f"Unknown party: {party}")
    # Permit HTTP only for explicitly curated party hosts, without HTTPS fallback.
    store.http_hosts.update(urlparse(url).hostname for name in names
                            for url in registry.get("parties", {}).get(name, [])
                            if urlparse(url).scheme == "http")
    paths = []
    for name in names:
        party_id = stable_id("party", name)
        output = {"schema_version": 1, "kind": "party_platform", "election_id": election_id,
                  "id": stable_id("party-platform", election_id, party_id),
                  "party": {"id": party_id, "name": name}, "generated_at": now(),
                  "roster_source": source_ref(roster_meta, "Official candidate list", "Elections BC"),
                  **collect_material(store, registry.get("parties", {}).get(name, []), max_pages=max_pages, detailed=True)}
        path = Path(root) / "published" / "platforms" / election_id / "parties" / f"{party_id}.json"
        publish(path, output)
        paths.append(path)
    return paths


def collect_candidates(store, config, root, *, district=None, candidate=None, max_pages=12):
    election_id, registry = settings(config, root)
    districts, rows, roster_meta = load_roster(store, config)
    if district:
        codes = [code for code, name in districts.items() if name_key(district) in {name_key(code), name_key(name)}]
        if len(codes) != 1:
            raise ValueError(f"Unknown or ambiguous constituency: {district}")
        rows = [row for row in rows if row["district_code"] == codes[0]]
    if candidate:
        rows = [row for row in rows if name_key(row["name"]) == name_key(candidate)]
        if len(rows) != 1:
            raise ValueError(f"Unknown or ambiguous candidate: {candidate}; specify --district")
    paths = []
    for row in rows:
        party_id = stable_id("party", row["party_name"]) if row["party_name"] else None
        entry = registry.get("candidates", {}).get(row["district_code"], {}).get(row["name"], [])
        candidate_id = stable_id("candidate-platform", election_id, row["district_code"], row["name"])
        output = {"schema_version": 1, "kind": "candidate_platform", "election_id": election_id,
                  "id": candidate_id, "generated_at": now(), "ballot_name": row["name"],
                  "district_code": row["district_code"], "affiliation": row["affiliation"],
                  "party_id": party_id,
                  "party_platform_id": stable_id("party-platform", election_id, party_id) if party_id else None,
                  "comparison_status": "not_run" if party_id else "not_applicable",
                  "roster_source": source_ref(roster_meta, "Official candidate list", "Elections BC"),
                  **collect_material(store, entry, max_pages=max_pages)}
        path = Path(root) / "published" / "platforms" / election_id / "candidates" / f"{candidate_id}.json"
        publish(path, output)
        paths.append(path)
    return paths
