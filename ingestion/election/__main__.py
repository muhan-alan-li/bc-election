import argparse
import json
import sys
import tempfile
from pathlib import Path

from .storage import SourceStore, read_json
from .finder import build_finder
from .platforms import collect_parties, collect_candidates, latest_attempt
from .workflow import load_roster, run_district, validate
from .pipeline import curate, polish, migrate_evidence


def main():
    base = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description="Repeatable BC constituency research workflow")
    parser.add_argument("--config", type=Path, default=base / "config.json")
    parser.add_argument("--storage", type=Path, default=base / "storage")
    parser.add_argument("--offline", action="store_true", help="Use cached snapshots only")
    parser.add_argument("--refresh", action="store_true", help="Fetch fresh sources; never silently fall back to stale data")
    parser.add_argument("--ephemeral-raw", action="store_true", help="Download into temporary storage; keep extracted evidence, discard raw bytes after this command")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("build-finder", help="Import free BC postal locations and official boundaries")
    commands.add_parser("list-districts", help="Read constituency names/codes from the official roster")
    commands.add_parser('migrate-evidence', help='Copy legacy published platform research into normalized storage')
    for name in ('curate', 'polish', 'build-data'):
        stage = commands.add_parser(name, help={'curate': 'Apply reviewed registries to normalized evidence, offline',
                                   'polish': 'Build compact client files from curated snapshots, offline',
                                   'build-data': 'Curate and polish existing evidence without downloads'}[name])
        stage.add_argument('--district', help='District code; defaults to all available datasets')
    normalize = commands.add_parser('normalize', help='Collect constituency evidence without client publication')
    normalize.add_argument('--district', help='Official name or code; defaults to all districts')
    normalize.add_argument('--download-documents', action='store_true')
    parties = commands.add_parser("collect-party-platforms", help="Collect shared party platform source material")
    parties.add_argument("--party", help="Exact official party name; defaults to all parties")
    parties.add_argument("--max-pages", type=int, default=60)
    candidates = commands.add_parser("collect-candidate-platforms", help="Collect individual candidate platform source material")
    candidates.add_argument("--district", help="Official constituency name or code; defaults to all")
    candidates.add_argument("--candidate", help="Exact ballot name")
    candidates.add_argument("--max-pages", type=int, default=12)
    run = commands.add_parser("run", help="Collect and publish one constituency")
    run.add_argument("--district", required=True, help="Exact official name or ED code")
    run.add_argument("--download-documents", action="store_true", help="Save disclosure PDFs and extract page text with pdftotext")
    seed = commands.add_parser("import-source", help="Cache a source downloaded separately")
    seed.add_argument("--url", required=True)
    seed.add_argument("--file", type=Path, required=True)
    check = commands.add_parser("validate", help="Validate a generated constituency dataset")
    check.add_argument("file", type=Path)
    check.add_argument('--client', action='store_true', help='Validate a polished client file')
    args = parser.parse_args()
    if args.offline and args.refresh:
        parser.error("--offline and --refresh cannot be combined")
    if args.ephemeral_raw and args.offline:
        parser.error('--ephemeral-raw cannot be used with --offline (temporary cache starts empty)')
    temporary = tempfile.TemporaryDirectory() if args.ephemeral_raw else None
    store = SourceStore(args.storage, offline=args.offline, refresh=args.refresh,
                        raw_root=temporary.name if temporary else None)
    try:
        if args.command == "import-source":
            _, meta = store.import_file(args.url, args.file)
            print(json.dumps(meta, indent=2))
        elif args.command == "build-finder":
            path, audit = build_finder(store, args.storage)
            print(json.dumps(audit, indent=2))
            print(path)
        elif args.command == "validate":
            validate(read_json(args.file), client=args.client)
            print("Valid constituency dataset")
        else:
            config = read_json(args.config)
            if args.command == 'migrate-evidence':
                paths = migrate_evidence(args.storage, config['election']['id'])
                print(f'Migrated {len(paths)} legacy research files')
            elif args.command in {'curate', 'polish', 'build-data'}:
                election_id = config['election']['id']
                if args.command in {'curate', 'build-data'}:
                    paths = curate(args.storage, election_id, args.district)
                    print(f'Curated {len(paths)} datasets')
                if args.command in {'polish', 'build-data'}:
                    paths = polish(args.storage, election_id, args.district)
                    print(f'Polished {len(paths)} client datasets in {args.storage / "published"}')
            elif args.command in {"collect-party-platforms", "collect-candidate-platforms"}:
                if args.command == "collect-party-platforms":
                    paths = collect_parties(store, config, args.storage, party=args.party, max_pages=args.max_pages)
                else:
                    paths = collect_candidates(store, config, args.storage, district=args.district,
                                               candidate=args.candidate, max_pages=args.max_pages)
                for path in paths:
                    output = read_json(path)
                    print(f"{output['coverage']['status']}: {path}")
                    attempt = path.with_suffix(".attempt.json")
                    if attempt.exists() and read_json(attempt)["generated_at"] > output["generated_at"]:
                        print(f"  Failed collection; previous publication retained. See {attempt}")
                return int(any(latest_attempt(path)["coverage"]["errors"] for path in paths))
            elif args.command == "list-districts":
                districts, _, _ = load_roster(store, config)
                for code, name in sorted(districts.items(), key=lambda item: item[1]):
                    print(f"{code}\t{name}")
            elif args.command == 'normalize':
                selections = [args.district] if args.district else sorted(load_roster(store, config)[0])
                for selection in selections:
                    dataset, path = run_district(store, config, args.storage, selection,
                                                download_documents=args.download_documents, publish=False)
                    print(f"Normalized {dataset['district']['name']}: {len(dataset['candidacies'])} candidates; {path}")
            else:
                dataset, path = run_district(store, config, args.storage, args.district,
                                            download_documents=args.download_documents, publish=args.command == 'run')
                print(f"{'Published' if args.command == 'run' else 'Normalized'} {dataset['district']['name']}: {len(dataset['candidacies'])} candidates, "
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
    finally:
        if temporary:
            temporary.cleanup()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
