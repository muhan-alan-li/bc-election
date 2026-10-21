# BC election guide

A static, source-linked guide to the 2026 BC provincial election. The site
includes party and policy comparisons, a constituency directory, ballots, dated
polling context, and a browser-only constituency finder.

There is no application server. GitHub Actions builds the publication data and
finder assets from official sources, bundles the client, and uploads the static
output from `client/dist-static/` as a workflow artifact. If the
`CLOUDFLARE_PAGES_PROJECT` repository variable is configured, it also deploys
the artifact to Cloudflare Pages.

## Layout

| Path | Purpose |
| --- | --- |
| `client/` | Preact single-page app, build scripts, and tests. |
| `content/` | Reviewed editorial content: party guide, questionnaire, polling, and portraits. |
| `ingestion/` | Roster and finder data importers plus the polling refresher. |
| `ingestion/storage/` | Git-ignored downloaded sources and generated publications. |
| `client/dist-static/` | Git-ignored static build output. |

## Local build

Requirements: Node 22.12+, Python 3.12+, and `make`.

```sh
make setup       # install client dependencies
make build       # roster + finder data + static bundle
make preview     # serve client/dist-static at http://localhost:8080
```

The first finder build downloads public GeoNames, Statistics Canada, and
Elections BC datasets. Later builds reuse the cached source snapshots in
`ingestion/storage/raw/`. Use `make data` to refresh the roster and
`make refresh-finder-data` to re-download postal and boundary sources.
`make test` runs the Python and client unit tests; `make test-browser` runs the
Chrome regression suite.

`ingestion/storage/` and `client/dist-static/` are generated and ignored by Git.
Static artifacts are produced by the `Static site` workflow, which uploads them
rather than committing them.

## Data responsibilities

- **Elections BC roster** — constituency codes and names, ballot names, and
  affiliations. `ingestion/election/roster.py` writes one compact catalog and one
  ballot per constituency.
- **Reviewed content** — leaders, policy summaries, citations, questionnaire
  positions, and polling. These files are committed under `content/` and are
  validated during every build.
- **Finder sources** — postal locations and 2023 redistribution boundaries.
  `ingestion/election/finder.py` imports them; `client/scripts/export-finder.mjs`
  creates versioned postal tables and geometry for the browser.

The constituency finder runs entirely in the browser. Postal matching is
precomputed at build time; coordinate matching and map interaction happen in a
Web Worker. No coordinates are sent to an application server.

See [`client/README.md`](client/README.md) and
[`ingestion/README.md`](ingestion/README.md) for details.
