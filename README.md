# BC election results

A static, source-linked guide to the 2026 BC provincial general election
results. It shows the party standings and vote share, every constituency result,
each riding's recent electoral history, the status of the new cabinet, and the
parties that hold seats. A browser-only constituency finder is retained.

The election was held on October 24, 2026. The published results are Elections
BC's **initial count**, complete as of October 26; final count for mail-in and
absentee ballots runs November 6–10, so close results may change. The cabinet
page reports that the ministry has not yet been appointed.

There is no application server. GitHub Actions builds the publication data and
finder assets from official sources, bundles the client, and uploads the static
output from `client/dist-static/` as a workflow artifact. If the
`CLOUDFLARE_PAGES_PROJECT` repository variable is configured, it also deploys
the artifact to Cloudflare Pages. The workflow deploys the `results-2026`
branch.

## Layout

| Path | Purpose |
| --- | --- |
| `client/` | Preact single-page app, build scripts, and tests. |
| `content/` | Reviewed editorial content: parties, campaign platforms, questionnaire, polling, portraits, and cabinet status. |
| `ingestion/` | Roster, results, and finder importers plus historical riding totals. |
| `ingestion/storage/` | Git-ignored downloaded sources and generated publications. |
| `client/dist-static/` | Git-ignored static build output. |

## Local build

Requirements: Node 22.12+, Python 3.12+, and `make`.

```sh
make setup       # install client dependencies
make build       # roster + results + finder data + static bundle
make dev         # watch client sources and serve at http://localhost:8080
make preview     # serve the last build at http://localhost:8080
```

`make dev` needs a previous `make build`, because the watcher rebuilds client
files only. It does not re-export data. Run `make build` again after data or
content changes, or use `make preview` for a one-off look at a build.

The first results build downloads the Elections BC reporting page and the BC
Data Catalogue voting-results tables (about 32 MB). Later builds reuse the
cached source snapshots in `ingestion/storage/raw/`. Use `make data` to refresh
the roster and results, or `make results` to rebuild results alone.
`make refresh-finder-data` re-downloads postal and boundary sources.
`make test` runs the Python and client unit tests; `make test-browser` runs the
Chrome regression suite.

`ingestion/storage/` and `client/dist-static/` are generated and ignored by Git.
Static artifacts are produced by the `Static site` workflow, which uploads them
rather than committing them.

## Data responsibilities

- **Elections BC roster** — constituency codes and names, ballot names, and
  affiliations. `ingestion/election/roster.py` writes one compact catalog and one
  ballot per constituency.
- **Elections BC results** — initial-count results by constituency and
  candidate. `ingestion/election/results.py` parses the reporting page,
  recomputes candidate shares against valid votes, matches ridings to the
  official roster, and validates the seat and vote totals.
- **Historical results** — `ingestion/election/history.py` aggregates the BC
  Data Catalogue voting-results tables to constituency-level winners and party
  shares for 2005, 2009, 2013, 2017, 2020, and 2024. The 2024 election used the
  same boundaries as 2026; earlier years are matched by constituency name.
- **Reviewed content** — party identities, campaign platforms, questionnaire
  positions, polling snapshots, and cabinet status. These files are committed
  under `content/` and are validated during every build.
- **Finder sources** — postal locations and 2023 redistribution boundaries.
  `ingestion/election/finder.py` imports them; `client/scripts/export-finder.mjs`
  creates versioned postal tables and geometry for the browser.

The constituency finder runs entirely in the browser. Postal matching is
precomputed at build time; coordinate matching and map interaction happen in a
Web Worker. No coordinates are sent to an application server.

See [`client/README.md`](client/README.md) and
[`ingestion/README.md`](ingestion/README.md) for details.
