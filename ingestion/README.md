# Static publication ingestion

This package builds the generated inputs used by the static site:

- **Election publication** — catalog and compact ballots from the official
  Elections BC roster.
- **Results publication** — initial-count results by constituency and candidate,
  plus historical riding totals aggregated from the BC Data Catalogue.
- **Constituency finder dataset** — postal locations and electoral boundaries
  for the browser-based finder.

It does not run a server and does not perform candidate research, AI analysis,
platform scoring, or editorial review. Reviewed party copy, platforms, the
questionnaire, and polling snapshots live in `content/`.

`python3 ingestion/collect_polling.py` refreshes attributed 338Canada riding
projections into `content/bc-provincial-2026/polling.json`; it does not touch the
roster or finder data.

## Commands

Run from the repository root:

```sh
make data          # roster + results -> ingestion/storage/published/<election>/
make results       # rebuild results.json only
make finder-data   # build finder.json if it is missing
make refresh-finder-data  # re-download postal/boundary sources
make build         # data + finder + client bundle -> client/dist-static/
```

Individual commands:

```sh
cd ingestion
python3 -m election build
python3 -m election build-results
python3 -m election build-finder
python3 -m election list-districts
python3 -m election validate
```

Source downloads are cached under `storage/raw/`. Use `--offline` for cached
builds or `--refresh` to fetch new copies. `--ephemeral-raw` discards downloaded
bytes after extraction. All generated storage is Git-ignored.

## Stages

```text
storage/raw/                    downloaded source cache
storage/normalized/             import audit
storage/published/<election>/   catalog + ballots + results.json
storage/published/finder.json   finder source dataset
```

`build` validates the complete staged publication before replacing the previous
one. A failed roster download or invalid candidate record leaves the previous
publication intact. `build-finder` does the same for `finder.json`.

## Data sources

- **Elections BC candidate roster** — official district codes, names, ballot
  names, and affiliations. See `config.json`.
- **Elections BC results** — the 2026 event-night reporting page. Initial-count
  results only; final count is published later. Candidate shares are recomputed
  against valid votes; the reporting page expresses them against considered
  ballots.
- **BC Data Catalogue provincial voting results** — vote-area and voting-place
  tables used to aggregate historical results by constituency name for 2005,
  2009, 2013, 2017, 2020, and 2024. The 2024 boundaries match 2026; earlier
  entries are name matches and may cover different boundaries.
- **GeoNames and Statistics Canada** — postal-code location samples.
- **Elections BC Open Data** — 2023 redistribution boundaries, set 11.

See [FINDER.md](docs/FINDER.md) for source limits and finder data details.

## Tests

```sh
cd ingestion
python3 -m unittest discover -s tests
```

The tests cover roster parsing and publication validation, finder imports, and
polling source parsing. No network access is required.
