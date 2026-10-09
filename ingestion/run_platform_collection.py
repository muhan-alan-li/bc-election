"""Run party and candidate collectors with bounded concurrent jobs."""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from time import monotonic

from election.platforms import collect_candidates, collect_parties, latest_attempt, settings
from election.storage import SourceStore, atomic_json, now, read_json
from election.workflow import load_roster


def run(config, storage, *, offline=False, refresh=False, workers=4,
        party_max_pages=60, candidate_max_pages=3, only="all"):
    election_id, _ = settings(config, storage)
    if not 1 <= party_max_pages <= 100 or not 1 <= candidate_max_pages <= 100:
        raise ValueError("Page limits must be between 1 and 100")
    if only not in {"all", "parties", "candidates"}:
        raise ValueError("Unknown collection selection")
    started = monotonic()
    def store():
        return SourceStore(storage, offline=offline, refresh=refresh)
    districts, rows, _ = load_roster(store(), config)
    summary = {"election_id": election_id, "generated_at": now(),
               "mode": "offline" if offline else "refresh" if refresh else "cached",
               "workers": workers, "party_max_pages": party_max_pages,
               "candidate_max_pages": candidate_max_pages}
    def party_job(name):
        return collect_parties(store(), config, storage, party=name, max_pages=party_max_pages)
    def candidate_job(code):
        return collect_candidates(store(), config, storage, district=code, max_pages=candidate_max_pages)
    for kind, job, selections in [
        ("parties", party_job, sorted({row["party_name"] for row in rows if row["party_name"]})),
        ("candidates", candidate_job, sorted(districts)),
    ]:
        if only != "all" and only != kind:
            continue
        paths, failures = [], []
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(job, selection): selection for selection in selections}
            for future in as_completed(futures):
                try:
                    paths.extend(future.result())
                except (ValueError, OSError, KeyError, TypeError) as error:
                    failures.append({"selection": futures[future], "error": str(error)})
        publications = [read_json(path) for path in sorted(paths)]
        attempts = [latest_attempt(path) for path in sorted(paths)]
        summary[kind] = {
            "count": len(publications),
            "coverage": dict(Counter(item["coverage"]["status"] for item in attempts)),
            "documents": sum(len(item["documents"]) for item in publications),
            "retained_publications": sum(item["generated_at"] != attempt["generated_at"]
                                         for item, attempt in zip(publications, attempts)),
            "errors": failures + [{"name": item.get("ballot_name", item.get("party", {}).get("name")), **error}
                                  for item in attempts for error in item["coverage"]["errors"]],
        }
    summary["elapsed_seconds"] = round(monotonic() - started, 1)
    atomic_json(Path(storage) / "normalized/platform-collection-summary.json", summary)
    return summary


def main(argv=None):
    base = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=base / "config.json")
    parser.add_argument("--storage", type=Path, default=base / "storage")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--offline", action="store_true")
    mode.add_argument("--refresh", action="store_true")
    parser.add_argument("--workers", type=int, choices=range(1, 9), default=4)
    parser.add_argument("--party-max-pages", type=int, choices=range(1, 101), default=60)
    parser.add_argument("--candidate-max-pages", type=int, choices=range(1, 101), default=3)
    parser.add_argument("--only", choices=("all", "parties", "candidates"), default="all")
    args = parser.parse_args(argv)
    try:
        summary = run(read_json(args.config), args.storage, offline=args.offline,
                      refresh=args.refresh, workers=args.workers,
                      party_max_pages=args.party_max_pages, candidate_max_pages=args.candidate_max_pages, only=args.only)
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(f"error: {error}")
        return 1
    print(summary)
    return int(any(summary[kind]["errors"] for kind in ("parties", "candidates") if kind in summary))


if __name__ == "__main__":
    raise SystemExit(main())
