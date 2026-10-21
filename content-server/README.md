# Content server

This service serves the built client, published election data, reviewed guide
content, and a streaming proxy to the constituency finder. It uses only the Go
standard library.

The primary voter flow reads `/api/questionnaire` and `/api/polling` alongside
`/api/parties` and compact `/api/districts/{code}/ballot` rosters. Platform
pages alone need `/api/guide`. `voter_guide.go` validates citations, conflicting
stances, ballot aliases, projection leaders, survey scope, dates and percentages.
Invalid publications return 503. Both endpoints support ETag revalidation and
reload publication generations without a rebuild. Political endpoints remain available
for archived research; the client no longer requests individual candidate analysis.

## Organization

- `main.go`: command-line flags and HTTP server lifecycle.
- `internal/httpapi`: explicit server configuration, route composition, endpoint
  handlers, shared JSON responses and ETag revalidation, and the finder proxy.
- `internal/publication`: filesystem access, public dataset models, and publication
  validation. `Store` holds the data/content directories and election ID. Political
  validation separates reviewed actions, issue evidence, and platform alignment.
- `content`: reviewed editorial JSON and portrait assets.

Candidate profiles include Python-generated `comparison_guide` metadata for all
six policy pillars. The API verifies that card counts and verdicts match reviewed
alignment findings; an unassessed pillar cannot claim alignment.

HTTP handlers decide status codes and user-facing errors. The publication package
does not depend on HTTP. Each API request resolves the active release manifest
and uses that immutable generation for all its reads. Publish tracked editorial
changes with `python3 ingestion/publish_release.py`; polishing publishes a release
automatically. Previous generations support rollback without restarting. Domain
files group their models and loaders; political models and validation live in
separate files because of their size. Tests live beside the packages they exercise.

Run from this directory:

```sh
go test -race ./...
go vet ./...
go build -o bin/content-server .
./bin/content-server -addr 127.0.0.1:8000
```

Use `-client-dir`, `-data-dir`, `-content-dir`, `-election-id`, and `-finder-url` to
override the local defaults. The repository's `make up` supplies absolute paths.


`/health` is liveness; `/ready` checks guide, party labels, questionnaire, polling
and a nonempty catalog. The server supplies browser security headers, immutable
caching for hashed assets, request timeouts and graceful shutdown. If you override
map tiles, extend the CSP image allowlist for that deployment. Legacy datasets
remain supported until the first generation is published.

## Static export

`go run ./cmd/export-static -out ../client/dist-static` exports the public voter
resources and referenced portraits from one pinned generation. It uses the same
validators and response models as HTTP endpoints, including normalized party
colors. It excludes finder data and archived research. Prefer
`npm run build:static` from `client/` to stage and build the complete site; Go is
only a build dependency for this deployment.
