"""Narrow parsers for Elections BC CSV and Assembly member indexes.

Voting indexes are irregular legacy HTML, including unclosed list items.
Use their explicit div title attribution rather than reconstructing a DOM.
"""

import csv
import io
import re
import unicodedata
from html.parser import HTMLParser
from urllib.parse import urljoin


def name_key(value):
    value = unicodedata.normalize("NFC", value).replace("\u200b", "")
    return " ".join(value.split()).casefold()


def natural_name(label):
    label = member_name(label)
    if "," in label:
        surname, given = label.split(",", 1)
        given = re.sub(r"^\s*(?:Hon\.|K\.C\.)\s*", "", given)
        label = f"{given.strip()} {surname.strip()}"
    return name_key(label)


def roster(text):
    reader = csv.DictReader(io.StringIO(text.lstrip("\ufeff")))
    required = {"ED Code", "Electoral District", "Candidate Ballot Name", "Affiliation"}
    if not required.issubset(reader.fieldnames or []):
        raise ValueError("Roster CSV is missing required Elections BC columns")
    districts, candidates, seen = {}, [], set()
    for row in reader:
        code, district, candidate, affiliation = [row[key].strip() for key in
            ("ED Code", "Electoral District", "Candidate Ballot Name", "Affiliation")]
        if not code or not district or not candidate:
            raise ValueError("Roster contains a blank district code, district, or candidate")
        if code in districts and districts[code] != district:
            raise ValueError(f"Conflicting district names for {code}")
        districts[code] = district
        identity = (code, name_key(candidate))
        if identity in seen:
            raise ValueError(f"Duplicate candidacy: {district}: {candidate}")
        seen.add(identity)
        status = {"independent": "independent", "unaffiliated": "unaffiliated",
                  "": "unaffiliated"}.get(affiliation.casefold(), "party")
        candidates.append({"district_code": code, "name": candidate,
                           "affiliation": status, "party_name": affiliation if status == "party" else None})
    if not districts:
        raise ValueError("Roster CSV is empty; refusing to replace an existing roster")
    return districts, candidates


class Links(HTMLParser):
    def __init__(self, text, base):
        super().__init__(convert_charrefs=True)
        self.base, self.links, self.frames = base, [], []
        self.anchor = None
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "iframe" and attrs.get("src"):
            self.frames.append(urljoin(self.base, attrs["src"]))
        if tag == "a" and attrs.get("href"):
            self.anchor = {"url": urljoin(self.base, attrs["href"]), "text": ""}

    def handle_data(self, data):
        if self.anchor is not None:
            self.anchor["text"] += data

    def handle_endtag(self, tag):
        if tag == "a" and self.anchor is not None:
            self.anchor["text"] = " ".join(self.anchor["text"].split())
            self.links.append(self.anchor)
            self.anchor = None


def member_name(label):
    """Preserve exact member aliases; strip only the trailing constituency."""
    return re.sub(r"\s*\([^()]*\)\s*$", "", label).strip()


class VoteIndex(HTMLParser):
    def __init__(self, text, base, aliases):
        super().__init__(convert_charrefs=True)
        self.base = base
        self.aliases = {name_key(alias) for alias in aliases}
        self.titles, self.parts, self.records = [], [], []
        self.anchor = None
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "div":
            self.titles.append(attrs.get("title"))
        if tag == "li":
            self.parts = []
        if tag == "a" and attrs.get("href") and "/debates/" in attrs["href"].casefold():
            title = next((title for title in reversed(self.titles) if title), "")
            path = title.split("; ")
            if name_key(member_name(path[0])) not in self.aliases:
                return
            label = " ".join("".join(self.parts).split()).rstrip(" ,;")
            position = re.search(r"\b(Yea|Nay)\s*$", label, re.I)
            if not position:
                raise ValueError(f"Unrecognized vote position in index: {label}")
            url = urljoin(self.base, attrs["href"])
            date = re.search(r"/(\d{4})(\d{2})(\d{2})[^/]*-Hansard", url, re.I)
            if not date:
                raise ValueError(f"Vote link lacks a date: {url}")
            self.anchor = {
                "member_label": path[0], "subject": "; ".join(path[1:]),
                "stage": label[:position.start()].rstrip(" ,"),
                "position": "yea" if position[1].casefold() == "yea" else "nay",
                "date": "-".join(date.groups()), "transcript_url": url,
                "locator": "", "question": None, "outcome": None,
                "jurisdiction": "British Columbia Legislative Assembly",
                "record_type": "recorded_division", "review_status": "index_only",
            }

    def handle_data(self, data):
        if self.anchor is not None:
            self.anchor["locator"] += data
        else:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag == "div" and self.titles:
            self.titles.pop()
        if tag == "a" and self.anchor is not None:
            self.anchor["locator"] = self.anchor["locator"].strip()
            self.records.append(self.anchor)
            self.anchor = None


class Disclosures(HTMLParser):
    def __init__(self, text, base):
        super().__init__(convert_charrefs=True)
        self.base, self.records, self.block = base, [], None
        self.owner = None
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in {"p", "li"}:
            self.block = {"tag": tag, "text": "", "links": []}
        if tag == "a" and self.block is not None and attrs.get("href"):
            self.block["links"].append(urljoin(self.base, attrs["href"]))

    def handle_data(self, data):
        if self.block is not None:
            self.block["text"] += data

    def handle_endtag(self, tag):
        if self.block is None or tag != self.block["tag"]:
            return
        text = " ".join(self.block["text"].split())
        match = re.match(r"(.+?)\s+-\s+Public Disclosure Statement", text)
        if tag == "p":
            self.owner = match[1] if match else None
        owner = self.owner
        if tag == "li" and not owner:
            dated_entry = re.match(r"(.+?)\s*\[", text)
            if dated_entry and "," in dated_entry[1]:
                owner = dated_entry[1].strip()
        if owner:
            kind = "public_disclosure" if match else ("material_change" if "Material" in text else "gift")
            for url in self.block["links"]:
                if "material" in url.casefold():
                    kind = "material_change"
                self.records.append({"member_name": owner, "document_type": kind,
                                     "title": text, "url": url})
        self.block = None
