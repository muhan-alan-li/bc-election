import argparse
import json
import sys
import tempfile
from pathlib import Path

from .finder import build_finder
from .roster import load_roster, publish_roster
from .storage import SourceStore, read_json
from .validate import validate_publication


def main():
    base = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description="Build the BC election guide's static publication")
    parser.add_argument("--config", type=Path, default=base / "config.json")
    parser.add_argument("--storage", type=Path, default=base / "storage")
    parser.add_argument("--offline", action="store_true", help="Use cached source snapshots only")
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Fetch fresh sources; never silently fall back to stale data",
    )
    parser.add_argument(
        "--ephemeral-raw",
        action="store_true",
        help="Download into temporary storage and discard raw bytes after this command",
    )
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("build", help="Fetch the official roster and publish compact ballots")
    commands.add_parser("build-finder", help="Import BC postal locations and official boundaries")
    commands.add_parser("list-districts", help="Read constituency names/codes from the official roster")
    commands.add_parser("validate", help="Validate the current compact publication")
    seed = commands.add_parser("import-source", help="Cache a source downloaded separately")
    seed.add_argument("--url", required=True)
    seed.add_argument("--file", type=Path, required=True)
    args = parser.parse_args()

    if args.offline and args.refresh:
        parser.error("--offline and --refresh cannot be combined")
    if args.ephemeral_raw and args.offline:
        parser.error("--ephemeral-raw cannot be used with --offline")

    if args.command == "validate":
        config = read_json(args.config)
        validate_publication(args.storage / "published" / config["election"]["id"],
                             config["election"]["id"])
        print("Valid publication")
        return 0

    temporary = tempfile.TemporaryDirectory() if args.ephemeral_raw else None
    store = SourceStore(
        args.storage,
        offline=args.offline,
        refresh=args.refresh,
        raw_root=temporary.name if temporary else None,
    )
    try:
        if args.command == "import-source":
            _, meta = store.import_file(args.url, args.file)
            print(json.dumps(meta, indent=2))
            return 0

        config = read_json(args.config)
        if args.command == "build-finder":
            path, audit = build_finder(store, args.storage)
            print(json.dumps(audit, indent=2))
            print(path)
            return 0

        districts, candidates, meta = load_roster(store, config)
        if args.command == "list-districts":
            for code, name in sorted(districts.items(), key=lambda item: item[1]):
                print(f"{code}\t{name}")
            return 0

        path, count = publish_roster(args.storage, config, districts, candidates, meta)
        print(f"Published {len(districts)} constituencies and {len(candidates)} candidates")
        print(path)
        return 0
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    finally:
        if temporary:
            temporary.cleanup()


if __name__ == "__main__":
    raise SystemExit(main())
