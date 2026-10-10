# BC election guide

Based on [handoff.md](handoff.md). Search published constituencies and filter their candidates by name or affiliation. Expand a candidate to see sourced voting-index entries, dated holdings/interests, and disclosure documents. Richmond Centre is the current research pilot; coverage is partial.

Requires Go 1.24+ and Node.js 22.12+.

From the project root:

```sh
make up       # Build and restart in the background at http://localhost:8000
make status   # Check the tracked server process
make down     # Stop both services started by make up
```

Use `make up PORT=8080` for a different port. Logs are saved to `.run/server.log`. `make up` rebuilds and restarts both services so updated client code cannot reach an older server without the finder endpoint. Published research updates appear without restarting. `make setup` installs client dependencies explicitly; `make up` installs them if missing.

## Client

JavaScript and Preact, bundled with esbuild. Frontend source lives in `client/src`:

- `main.jsx` mounts the app; `App.jsx` connects the routes and page layout.
- `routes/` contains the constituency list, district candidates, candidate detail, and not-found pages.
- `components/` contains shared UI and the candidate-record and finder components.
- `hooks/` manages data loading, finder requests, persistent stars, and adaptive pagination.
- `helpers/` contains API, routing, label, and candidate-affiliation helpers.

Use `npm run format` to apply Prettier and `npm run format:check` to check the four-space JavaScript/JSX formatting.

Candidate pages show a topic-filtered political record, expandable voting
decisions and source excerpts, and candidate/party platform passages alongside
the records. Disclosures remain available in a secondary expandable section.
Unreviewed identity matches are shown as pending research counts rather than
attributed actions; platform passages and topic tags retain review labels.

The client build packages only polished political profiles from
`ingestion/storage/published/political/` as separate versioned JSON assets in
`client/dist/data/political/`. Profiles load on demand on candidate pages; no
server endpoint change is required. Rebuild the client after research updates
(`npm run dev` watches the profile files). Use `ELECTION_ID=<id> npm run build`
when serving an election other than `bc-provincial-2026`. Deploy the entire client
`dist` directory, including its `data` folder. When profiles are unavailable,
candidate pages fall back to their existing district voting-index records.

```sh
cd client
npm install
npm run build
```

Run the Go server below and open http://localhost:8000. For development, run `npm run dev` in another terminal; it rebuilds JavaScript/CSS while Go serves the page and APIs from the same origin. Refresh the browser after edits. Restart the watcher after editing `index.html`.

## Server

Build the client, then run the Go standard-library HTTP server:

```sh
cd client
npm run build
cd ../content-server
go run .
```

Open http://localhost:8000. Run from `content-server/`, or override the paths with `-client-dir` and `-data-dir`. Change the listen address with `-addr` and election with `-election-id` (default `bc-provincial-2026`).

The API reads `ingestion/storage/published/<election-id>/<district-code>.json` on every request, so newly published data appears without restarting the server. Generated files are local artifacts and must be copied with the server and client build for deployment.

- `GET /api/districts?q=richmond`: search constituencies with published research.
- `GET /api/districts/RCC`: public Richmond Centre dataset, including candidates, affiliations, voting records, disclosures, interests, and coverage.
- `GET /health`: server liveness.
- `GET /api/platforms/parties`: polished party source records, commitments and coverage.
- `GET /api/platforms/candidates?district=RCC`: polished candidate source records for a district; omit the query for all candidates.
- `GET /api/platforms/{parties|candidates}/{id}`: one record by its platform ID.

The client data hook loads party and candidate platforms alongside district data,
without changing their presentation. All endpoints read polished files only and
support ETag revalidation.

API responses support ETag revalidation. Invalid published data returns an error rather than being displayed. The constituency search does not imply province-wide coverage.

## Python workflow

Research follows **raw → normalized → curated → polished**. See
[pipeline stages, review rules and retention](ingestion/PIPELINE.md).
`storage/published/` contains the polished client files. Rebuild them without raw
downloads using `make data-build`; deploy only that directory with the app.
Use `--ephemeral-raw` during collection to discard HTML/PDF bytes after extracting
the evidence needed for review.

All `ingestion/storage/` data and `client/src/data/` content modules are local and
ignored by Git, including reviewed inputs. Existing tracked files have been
removed from the index while kept on disk. Fresh checkouts need these local
inputs restored from a backup before rebuilding research or the current client.
The configuration, collector code, and synthetic test fixtures remain in Git.

Python 3.12+, with no Python dependencies. Optional Poppler `pdftotext` extracts disclosure page text.

```sh
cd ingestion
python3 -m election run --district 'Richmond Centre' --download-documents
```

Use `--offline` before `run` to reuse cached source snapshots without network access, or `--refresh` to fetch fresh sources. Reviewed identities and interests live in `storage/curated/`; new candidates require identity and prior-office review before records can be attributed. Publications include explicit coverage limitations and research tasks. Failed validation preserves the previous published file.

## Checks

Party and candidate platform collectors are separate Python jobs. They share the
source snapshot cache but do not invoke the voting-history workflow or each other.
See [platform collection configuration and coverage](ingestion/PLATFORMS.md).

```sh
cd ingestion
python3 -m election collect-party-platforms
python3 -m election collect-candidate-platforms --district 'Richmond Centre'
```

The curated registry includes first-pass campaign source URLs. Unconfigured entries are published with
explicit `not_configured` coverage, rather than inferred platforms.

Candidate voting and political-work evidence can now be collected and grouped
with candidate and party policy passages under shared topics:

```sh
cd ingestion
python3 -m election collect-political-records --workers 4
python3 -m election build-political-profiles # rebuild retained evidence offline
```

This adds `storage/published/political/<election-id>/` profiles for site
presentation. Unreviewed identity matches remain in normalized research;
extracted passages, transcript context and topic tags retain review status.
General alignment judgments remain unassessed; Henry Yao has a selective six-pillar
pilot using dated positions and operative bill/amendment text. See
[selective comparisons and the pilot workflow](ingestion/ALIGNMENT.md), and the political-profile section of
[the pipeline guide](ingestion/PIPELINE.md) for coverage and collection limits.

```sh
cd content-server
go test ./...
cd ../ingestion
python3 -m unittest discover -s tests
```

To compile the server from `content-server/`:

```sh
go build -o bin/content-server .
```


The constituency finder opens from **Find my constituency** on the constituency table. It accepts a full BC postal code, browser location, or a map click. Python downloads and validates free source data; Go performs all postal-code lookup and polygon matching locally. The client renders an OpenStreetMap map with district outlines and an approximate-result disclaimer. Candidate links appear when the matched district has published research.

Run `make finder-data` once before starting the finder. This reuses cached source snapshots. To download updated snapshots, run `cd ingestion && python3 -m election --refresh build-finder`. To rebuild without network access, use `python3 -m election --offline build-finder` from `ingestion`. Restart the finder service after rebuilding: finder data is loaded into memory on its first lookup. Generated data is ignored by Git and must be imported on each new deployment.

See [finder sources, audit and API](ingestion/FINDER.md) for coverage limits and source attribution.

Political record interpretation runs in ingestion using DeepSeek's OpenAI-compatible endpoint.
Put `DEEPSEEK_API_KEY` in the repository-root `.env`; endpoint, model, rate limit and pricing
are configured in `ingestion/config.json`. From `ingestion`, run
`python3 -m election estimate-political-analysis` to preview usage, then
`python3 -m election analyze-political-records --max-calls 20` for a bounded, resumable batch.
It reuses interpretations of shared decisions across candidates and produces cited issue
findings with explicit evidence gaps. See [analysis configuration and safeguards](ingestion/ANALYSIS.md).

Henry Yao’s pilot view groups 11 specific platform comparisons into six issue
tabs, with explicit limits and unanswered commitments. Run `collect-alignment-evidence` to
fetch the targeted primary sources and `analyze-platform-alignment --pillar affordability --max-calls 2`
to draft comparisons. `build-platform-alignment --review
election/analysis/pilots/henry-yao.review.json` validates the separate source check
and publishes the findings. See [ALIGNMENT.md](ingestion/ALIGNMENT.md) for scope,
limits and exact commands. The complete voting record remains expandable.


The finder runs as a separate Go service in `constituency-finder`, listening on `127.0.0.1:8001` by default. The content server proxies `/api/constituency-finder` to it, streaming the response; the client uses the same public URL as before. `make up`, `make down`, and `make status` manage both services. Override ports with `make up PORT=8080 FINDER_PORT=8081`. Logs are `.run/server.log` and `.run/finder.log`.

The finder lazily loads its dataset once and retains approximately 37 MB of dataset heap. It has a 256-entry postal-code LRU cache with a 10-minute TTL containing only district indices. Coordinates, geometry, and full responses are not cached. Publication availability is checked separately on every request. Failed dataset loads can retry after five seconds, so a missing publication does not require a service restart once imported. Successfully loaded data stays in memory until the finder restarts; there is no idle eviction.

To run separately:

```sh
cd constituency-finder
go run . -addr 127.0.0.1:8001 -data-dir ../ingestion/storage/published
```

Then run the content server with `-finder-url http://127.0.0.1:8001`. Only the content server needs public exposure. Finder service outages return a readable 503 error while the rest of the app remains available.

Checks:

```sh
cd content-server && go test -race ./...
cd ../constituency-finder && go test -race ./...
```

Run `make test` for the API routing regression and the focused finder suite (18 named cases, including the optional local-data smoke test). The finder unit tests use a tiny synthetic dataset and do not require downloads or listening ports.
