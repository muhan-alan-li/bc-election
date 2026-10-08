import argparse
import json
import sys
from pathlib import Path

from .storage import SourceStore, read_json
from .finder import build_finder
from .workflow import load_roster, run_district, validate


def main():
    base = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description="Repeatable BC constituency research workflow")
    parser.add_argument("--config", type=Path, default=base / "config.json")
    parser.add_argument("--storage", type=Path, default=base / "storage")
    parser.add_argument("--offline", action="store_true", help="Use cached snapshots only")
    parser.add_argument("--refresh", action="store_true", help="Fetch fresh sources; never silently fall back to stale data")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("build-finder", help="Import free BC postal locations and official boundaries")
    commands.add_parser("list-districts", help="Read constituency names/codes from the official roster")
    run = commands.add_parser("run", help="Collect and publish one constituency")
    run.add_argument("--district", required=True, help="Exact official name or ED code")
    run.add_argument("--download-documents", action="store_true", help="Save disclosure PDFs and extract page text with pdftotext")
    seed = commands.add_parser("import-source", help="Cache a source downloaded separately")
    seed.add_argument("--url", required=True)
    seed.add_argument("--file", type=Path, required=True)
    check = commands.add_parser("validate", help="Validate a generated constituency dataset")
    check.add_argument("file", type=Path)
    args = parser.parse_args()
    if args.offline and args.refresh:
        parser.error("--offline and --refresh cannot be combined")
    store = SourceStore(args.storage, offline=args.offline, refresh=args.refresh)
    try:
        if args.command == "import-source":
            _, meta = store.import_file(args.url, args.file)
            print(json.dumps(meta, indent=2))
        elif args.command == "build-finder":
            path, audit = build_finder(store, args.storage)
            print(json.dumps(audit, indent=2))
            print(path)
        elif args.command == "validate":
            validate(read_json(args.file))
            print("Valid constituency dataset")
        else:
            config = read_json(args.config)
            if args.command == "list-districts":
                districts, _, _ = load_roster(store, config)
                for code, name in sorted(districts.items(), key=lambda item: item[1]):
                    print(f"{code}\t{name}")
            else:
                dataset, path = run_district(store, config, args.storage, args.district,
                                            download_documents=args.download_documents)
                print(f"Published {dataset['district']['name']}: {len(dataset['candidacies'])} candidates, "
                      f"{len(dataset['votes'])} indexed votes, {len(dataset['disclosures'])} disclosure documents")
                print(path)
                parties = {party["id"]: party["name"] for party in dataset["parties"]}
                for candidate in dataset["candidacies"]:
                    coverage = next(row for row in dataset["coverage"] if row["person_id"] == candidate["person_id"])
                    affiliation = parties.get(candidate["party_id"], candidate["affiliation"])
                    print(f"  {candidate['ballot_name']}: {affiliation}; "
                          f"votes {coverage['voting']['count']} ({coverage['voting']['status']}); "
                          f"interests {coverage['interests']['reviewed_entry_count']} ({coverage['interests']['status']})")
                print(f"Research tasks: {len(dataset['tasks'])}; see coverage in the dataset")
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
