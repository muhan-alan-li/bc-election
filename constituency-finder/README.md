# Constituency finder

This separate service performs local postal-code lookup and boundary matching.
The content server proxies requests to it at `/api/constituency-finder`.

## Organization

- `main.go`: command-line flags and HTTP server lifecycle.
- `internal/httpapi`: route setup, bounded JSON request decoding, HTTP status
  mapping, and response encoding.
- `internal/finder`: input normalization, dataset loading and validation, GeoJSON
  encoding, polygon matching, lookup results, and the lookup service. Lazy loading
  and the bounded postal-code cache have their own files.

The finder package does not depend on HTTP. Its service owns the loader and cache;
matching caches retain only boundary indices, and publication availability is
checked on every lookup. The health endpoint does not load the dataset. Tests and
benchmarks live beside the packages they exercise.

Run from this directory:

```sh
go test -race ./...
go vet ./...
go build -o bin/constituency-finder .
./bin/constituency-finder -addr 127.0.0.1:8001
```

Use `-data-dir` and `-election-id` to override the local publication defaults.

## Static build exporter

The `cmd/export-static` command uses this same matcher at build time. It creates
compact per-prefix postal tables, separate ambiguity records, simplified binary
outlines and lossless detailed geometry. Latitude bins accelerate exact postal
matching without changing the source polygons. The main static build invokes it
after exporting the public ballot catalog, so published-result links match the
site being deployed.

Run `npm run build:static` in `client/` to build the whole site. Runtime matching
then happens in a JavaScript browser worker; this Go service is not needed.
See `client/README.md` for the format, deployment and verification instructions.
