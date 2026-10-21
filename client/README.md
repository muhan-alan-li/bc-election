# Client structure

The client uses Preact, hash-based routes, and esbuild. Run commands from this directory:

- `npm run build:static` exports a validated publication and builds a backend-free site in `dist-static/`. It includes polling snapshots, portraits and a fully static constituency finder. Requires published election data, `finder.json` and Go at build time. See static deployment below.
- `npm run test:browser:static` builds synthetic public data and runs the browser suite against a file-only server, asserting that no `/api/` requests occur.
- `npm run build` writes minified, fingerprinted JavaScript/CSS with a lazy finder chunk to `dist/`. Production builds omit source maps.
- `npm run dev` watches frontend source. The Go content server serves the built files; refresh the browser after changes.
- `npm run test:browser` runs Chrome against a temporary server and synthetic ballot. Set `CHROME_BIN` for a nonstandard Chrome installation.
- `npm test` runs component, helper, API error and answer-revision checks. Backend validation runs with `go test ./...` from `content-server/`.
- `npm run format:check` checks source, styles, and tests.

## Party comparison flow

The default route and `#/match` render `routes/Match.jsx`, with compact party
cards and expandable issue comparisons. `helpers/matcher.js` compares explicit
sourced positions. Constituency pages use `components/match/PollingContext.jsx`
to keep local projections separate from provincial surveys. `useVoterResource` handles
loading, retries, aborts and stale-response protection. Session storage retains
answers and their question wording within the tab; revised questions require a fresh answer; answers are never included in API requests.

District pages show the ballot before polling context. Candidate-detail routes
and their presentation components have been retired. Archived political APIs
remain available for research.

## Where code belongs

| Folder                     | Responsibility                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/routes/`              | Page composition and route-specific filtering and selection state.                                                                       |
| `src/components/ui/`       | Reusable primitives: `Table`, `Card`, `Dialog`, `Pagination`, `SourceLink`, and `RetryError`. No election data or feature-specific copy. |
| `src/components/layout/`   | Site header/footer, page header, and breadcrumbs.                                                                                        |
| `src/components/parties/`  | Party presentation shared by party lists.                                                                                                |
| `src/components/platform/` | Platform policy cards, expanded details, sources, and the policy dialog header.                                                          |
| `src/components/finder/`   | Constituency finder form, map, and results.                                                                                              |
| `src/hooks/`               | Browser state and effects: requests, routing, saved stars, and adaptive pagination sizing.                                               |
| `src/helpers/`             | Data access and pure transformations, labels, pagination, and route URLs.                                                                |
| `src/styles/`              | Base tokens and typography, shared UI/layout styles, and feature-specific styles. `src/styles.css` defines import order.                 |
| `tests/`                   | Behavioral checks; `tests/helpers/` contains shared component loading and traversal.                                                     |
| `dist/`                    | Generated output. Rebuild it after source changes; do not edit it directly.                                                              |

## Backend content

The frontend contains presentation code, not election datasets or editorial content. It requests:

- `/api/guide` for party leaders, metadata, and normalized policy details.
- `/api/parties` for party identity labels independent of platform prose.
- `/api/districts` for the published catalog and `/api/districts/{code}/ballot` for compact ballots.
- `/api/questionnaire` for questions, dated party positions, sources and ballot aliases.
- `/api/polling` for riding projections and separately labelled province-wide surveys.
- `/content/assets/leaders/{filename}` for portraits.

Reviewed guide content and candidate copy live in `content-server/content/{election-id}/`. Political research remains in `ingestion/storage/published/political/{election-id}/`. The server validates public records and pins each request to an active publication generation, with ETags for revalidation. For the Go-served development build, run `python3 ingestion/publish_release.py` from the repository root after editorial changes; no client rebuild is needed in that mode. The Go-served frontend can build without election data, while its backend needs the published datasets. Static production builds require the publication artifact and must be rebuilt and redeployed after data changes.

The content server accepts `-content-dir`; `make up` supplies the repository’s content directory automatically. Run backend tests before publishing changes to content or research validation.

The archived candidate research is documented in [the candidate research pipeline](../ingestion/docs/ALIGNMENT.md). New voter-facing analysis belongs at party level and needs direct sources; do not restore candidate scoring to the questionnaire.

## Shared components

`Table` owns the scrolling region, accessible label, column headers, and optional empty row. Features supply explicit `<tr>` children so row headers and domain-specific cells remain clear. Use `compact` for dense record tables, `tableClass` for table geometry, and `tableRef` when measuring rows. Use `paginate` with `Pagination` for page slicing and navigation.

`Card` renders an anchor when given `href`, a button when given `onClick`, and an article for passive content. Features own card contents and styles. `PolicyCard` and `PartyCard` build on this shell.

`Dialog` owns native modal behavior, backdrop and Escape handling, body scroll locking, and focus restoration. Its children supply the title and close button; connect the title using `titleId`. `PolicyDialog` adds the policy-specific header and appearance, while the finder uses `Dialog` directly.

`SourceLink` centralizes external-link behavior and the new-tab indicator. Set `showIcon={false}` for numbered citations or attribution links, and pass accessible citation labels through its normal anchor props.

Keep domain labels and components within their feature unless they have multiple consumers. Add shared components for recurring behavior or presentation; simple page-specific markup can stay in the route.

## Static deployment

Run `npm ci` and `npm run build:static` from this directory. Deploy the complete
`dist-static/` directory as the web root. Only HTML, CSS, JavaScript, JSON, binary
data and images are deployed; Go and Python are not runtime dependencies.
For a local preview, run `python3 -m http.server 8080 --directory dist-static`.

The build expects `../ingestion/storage/published/`, including a reviewed election
publication and `finder.json`. These generated files are Git-ignored, so provide
an artifact before building from a fresh checkout. `BC_PUBLISHED_DIR` overrides
the election publication directory; `BC_FINDER_DATASET` overrides the finder
input file. Both can be absolute paths. Run `make finder-data` at the repo root
to build finder data from cached sources; data acquisition remains separate from
site builds. Static builds never download datasets or run model jobs.

Both Go exporters validate their inputs. The site is staged in a temporary
folder and replaces `dist-static/` only after all exports and bundling succeed.
Changes to publication data or finder sources require a rebuild and redeploy.

Cloudflare Pages settings: repository root `/`, build command
`cd client && npm ci && npm run build:static`, output directory
`client/dist-static`. Supply the publication artifact before this build, or build
locally/in CI and upload the directory. The included `_headers` sets security
policy, revalidation for the finder manifest and immutable caching for its
versioned data. Hash navigation requires no rewrite configuration.

## Static constituency finder

The finder opens lazily. A small JavaScript worker reads a versioned manifest
and downloads only the required files. Postal prefixes have fixed 2,000-byte
binary tables: 0 is missing, 1–253 identifies a constituency, 254 points to an
ambiguity record, and 255 is a recorded code without a boundary match. Ambiguity
records list every constituency matched by the original source locations.
Postal results show constituency bounds without inventing a home pin.

Coordinates from browser location or a map click are filtered against district
bounding boxes. Simplified outlines provide the initial classification. Any
location within its accuracy radius plus a conservative 25-metre margin of a
simplified edge loads lossless detailed geometry before matching. Holes and
separate islands are retained. Display outlines can be approximate; they do not
change precomputed postal matches. The worker bounds its decoded geometry cache
and cancels superseded downloads; closing the dialog terminates it.

BCG1 boundary files use polygon/ring counts and zig-zag variable-length coordinate
deltas. Outlines are simplified to a 20-metre planar upper bound and quantized to
six decimal places. Detailed boundaries use eight decimals only if every original
coordinate round-trips exactly; otherwise they use lossless Float64 coordinates.
Each build hashes the format, dataset and public catalog into the data directory
URL. A worker pins one manifest, avoiding mixed boundary/postal versions.

The full local dataset produces 194 prefix tables (388 KB), 276 ambiguous codes
in 21 files (3.8 KB), 93 outlines (497 KB), and 93 detailed boundaries (4.4 MB),
before HTTP compression. Individual files load on demand. JavaScript does all
runtime matching; no coordinates are posted to a lookup service. Map tiles still
come from OpenStreetMap. Browser location requires HTTPS and user permission.
The postal data's coverage and freshness limitations and official-verification
link remain visible.

`npm run test:browser:static` builds synthetic finder data and exercises postal
ambiguity, missing codes, cancellation, browser location, detailed fallback, map
clicks, closing/reopening and the rest of the site, with zero API requests.
`go test ./...` from `constituency-finder/` compares JavaScript with the Go matcher
and checks lossless geometry decoding (Node required for that cross-language test).
For optional checks against a local production build:

```sh
cd ../constituency-finder
BC_STATIC_PARITY_DIR="$PWD/../client/dist-static" go test -run TestStaticFinderLocalDataParity -v ./internal/finder
```
