# Client

The client is a static Preact site bundled with esbuild. It has no API server and
no runtime Go or Python dependency. A GitHub Actions workflow generates the
publication data and finder assets, builds `dist-static/`, and deploys that
directory.

## Commands

Run from `client/` (or use the root `Makefile`):

```sh
npm ci
npm run build          # data + finder + bundle -> dist-static/
npm run build:static   # alias for npm run build
npm run dev            # initial export, then watch source changes
npm run preview        # serve dist-static/ at http://localhost:8080
npm test               # unit and helper tests
npm run test:browser   # Chrome suite against a temporary static build
npm run format:check
```

`npm run build` expects generated inputs under `../ingestion/storage/published/`
and a finder source dataset at `../ingestion/storage/published/finder.json`.
Build them at the repo root with `make data finder-data`, or run `make build` to
do everything. `BC_PUBLISHED_DIR`, `BC_CONTENT_DIR`, `BC_FINDER_DATASET`,
`BC_ELECTION_ID`, and `BC_STATIC_OUTPUT` override the corresponding paths.

The build exports and validates content, results, catalog and ballots; converts the
finder source into versioned browser assets; bundles the app and Web Worker; and
only then replaces `dist-static/`. Generated files are Git-ignored.

## Routes and data

| Path                     | Content                                             |
| ------------------------ | --------------------------------------------------- |
| `#/` or `#/results`      | Legislature results, seat bar, vote share, turnout  |
| `#/constituencies`       | All constituency results with margins and filters   |
| `#/constituencies/:code` | Riding result, candidates, turnout and past results |
| `#/cabinet`              | Premier-designate and ministry status               |
| `#/parties`              | Parties that hold seats, with seats and vote share  |
| `#/parties/:id/platform` | 2026 campaign platform, kept for reference          |
| `#/match`                | Party comparison and questionnaire                  |

API-shaped paths from the older server are mapped by
`src/helpers/deployment.js` to prebuilt files:

- `/api/results` → `/data/results.json`
- `/api/cabinet` → `/data/cabinet.json`
- `/api/guide` → `/data/guide.json`
- `/api/parties` → `/data/parties.json`
- `/api/districts` → `/data/districts.json`
- `/api/districts/{code}/ballot` → `/data/districts/{code}/ballot.json`
- `/api/questionnaire` → `/data/questionnaire.json`
- `/api/polling` → `/data/polling.json`

`results.json` carries the election summary, party totals, every constituency
result, and the historical series for ridings whose names match earlier
elections. The client loads it once for the results, constituency, riding,
cabinet and party views.

Portraits are served from `/content/assets/leaders/`. The finder has its own
versioned assets under `/finder/`.

## Source layout

| Folder                     | Responsibility                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `src/routes/`              | Page composition and route-specific filtering and selection state.                            |
| `src/components/ui/`       | Reusable primitives: `Table`, `Card`, `Dialog`, `Pagination`, `SourceLink`, and `RetryError`. |
| `src/components/layout/`   | Site header/footer, page header, and breadcrumbs.                                             |
| `src/components/results/`  | Seat bar and historical riding trend.                                                         |
| `src/components/parties/`  | Party presentation shared by party lists.                                                     |
| `src/components/platform/` | Policy cards, expanded details, sources, and the policy dialog header.                        |
| `src/components/finder/`   | Constituency finder form, map, and results.                                                   |
| `src/hooks/`               | Browser state and effects: requests, routing, saved stars, and adaptive pagination.           |
| `src/helpers/`             | Data access and pure transformations, labels, pagination, and route URLs.                     |
| `src/styles/`              | Base tokens and typography, shared UI/layout styles, and feature styles.                      |
| `scripts/`                 | Build-time static data and finder exporters.                                                  |
| `tests/`                   | Behavioral checks and the dependency-free Chrome suite.                                       |

## Editorial content

Reviewed copy lives in `../content/{election-id}/`:

- `guide.json` — leaders, party metadata, policy items, and citations.
- `parties.json` — party identity, colors, and ballot aliases.
- `cabinet.json` — premier-designate, ministry status, timeline, and sources.
- `questionnaire.json` — questions and dated party positions.
- `polling.json` — attributed riding projections and provincial surveys.
- `polling-surveys.json` — source data used by the polling refresher.

The exporter validates schemas, source URLs, dates, party references, citation
indexes, result arithmetic, and portrait paths before writing a build. If
validation fails, the previous `dist-static/` is not replaced.

## Static finder

The finder opens lazily. A Web Worker reads `/finder/manifest.json`, then
downloads only the needed fixed-size postal table, ambiguity record, and
geometry. Postal matching is precomputed at build time. Coordinate matching
happens in the browser, with no location sent to an application server.

Each build hashes the finder source and public catalog into a version directory,
so HTML, manifest, postal tables and geometry cannot mix across deployments.
See [`../ingestion/docs/FINDER.md`](../ingestion/docs/FINDER.md) for source
limitations and encoding details.

## Deployment

`client/dist-static/` is the web root. `_headers` sets the Content Security
Policy, revalidation for the finder manifest, and immutable caching for versioned
finder data. Hash navigation needs no rewrite rules.

The `Static site` GitHub Actions workflow runs the roster and finder imports,
builds the site, and uploads `client/dist-static/` as an artifact. If the
repository variable `CLOUDFLARE_PAGES_PROJECT` is set, it deploys the same
artifact to Cloudflare Pages using the `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` secrets. Build artifacts are never committed.
