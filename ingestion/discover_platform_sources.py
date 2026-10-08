"""Discover candidate source links without overwriting curated sources."""
import argparse
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

from election.parsers import Links, name_key
from election.platforms import settings
from election.storage import SourceStore, atomic_json, read_json
from election.workflow import load_roster

def discover(store, config, storage, *, workers=4):
    election_id, _ = settings(config, storage)
    districts, rows, _ = load_roster(store, config)
    path = Path(storage) / "curated/platform-sources.json"
    registry = read_json(path, {})
    entry = registry.setdefault(election_id, {"parties": {}, "candidates": {}})
    directories = config.get("platform_directories", [])
    audit = []

    def fetch(url):
        try:
            text, _ = store.text(url)
            return url, Links(text, url).links, None
        except (ValueError, OSError) as error:
            return url, [], str(error)

    def register(row, matches):
        if len(matches) != 1:
            return 0
        sources = entry.setdefault("candidates", {}).setdefault(row["district_code"], {}).setdefault(row["name"], [])
        target = next(iter(matches))
        if target in sources:
            return 0
        sources.append(target)
        return 1

    riding_pages = {}
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for url, links, error in pool.map(fetch, directories):
            count = 0
            for row in rows:
                matches = {link["url"] for link in links
                           if (name_key(link["text"]) == name_key(row["name"])
                               or (row["party_name"] == "CentreBC" and "/candidates/" in link["url"]
                                   and urlparse(link["url"]).path.rstrip("/").split("/")[-1] ==
                                   re.sub(r"\s+", "-", name_key(row["name"]))))
                           and link["url"].startswith("https://")}
                count += register(row, matches)
            for link in links:
                if (urlparse(link["url"]).hostname == "votemate.org"
                        and re.search(r"/candidates/\?riding=\d+$", link["url"])):
                    matches = [code for code, name in districts.items()
                               if name_key(link["text"]).startswith(name_key(name) + " ")]
                    if len(matches) == 1:
                        riding_pages[link["url"]] = matches[0]
            audit.append({"directory": url, "error": error, "new_matches": count})
        for url, links, error in pool.map(fetch, sorted(riding_pages)):
            count = 0
            for row in rows:
                if row["district_code"] != riding_pages[url]:
                    continue
                matches = {link["url"] for link in links
                           if name_key(link["text"]).startswith(name_key(row["name"]) + " ")
                           and urlparse(link["url"]).hostname == "votemate.org"
                           and re.search(r"/candidates/\d+\?riding=", link["url"])}
                count += register(row, matches)
            audit.append({"directory": url, "error": error, "new_matches": count})
    atomic_json(path, registry)
    atomic_json(Path(storage) / "normalized/platform-discovery.json", audit)
    return audit


def main(argv=None):
    base = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=base / "config.json")
    parser.add_argument("--storage", type=Path, default=base / "storage")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--offline", action="store_true")
    mode.add_argument("--refresh", action="store_true")
    parser.add_argument("--workers", type=int, choices=range(1, 9), default=4)
    args = parser.parse_args(argv)
    try:
        audit = discover(SourceStore(args.storage, offline=args.offline, refresh=args.refresh),
                         read_json(args.config), args.storage, workers=args.workers)
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(f"error: {error}")
        return 1
    for item in audit:
        print(item)
    return int(any(item["error"] for item in audit))


if __name__ == "__main__":
    raise SystemExit(main())
