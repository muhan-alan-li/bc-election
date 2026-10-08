# Constituency finder data

The Python `build-finder` command imports free data into `storage/published/finder.json`. Go reads this publication once, on the first lookup, and does the constituency matching. Python does not preassign districts to postal codes. Restart the server after replacing this dataset.

## Sources

| Source | Data | Licence / freshness |
| --- | --- | --- |
| [GeoNames postal downloads](https://www.geonames.org/export/zip/) — `CA_full.csv.zip` | Full Canadian postal codes with recorded points; BC subset only | CC BY 3.0; directory timestamp March 13, 2023, not a guarantee of the underlying records' dates |
| [Statistics Canada Open Database of Addresses](https://www.statcan.gc.ca/en/lode/databases/oda) — `ODA_BC_v1.zip` | BC address points with postal codes where provided | Open Government Licence – Canada; version 1, collected January–April 2021 |
| [Elections BC boundary dataset](https://catalogue.data.gov.bc.ca/dataset/1cba4b16-263f-4d42-8d84-f5fecaa03d1a) | Official 2023 redistribution, boundary set 11, used for 2024/2026 provincial maps | Elections BC Open Data Licence; gazette date December 7, 2023 |

Boundary downloads use the BC OpenMaps WFS service with EPSG:4326 coordinates. The pipeline retains full geometry, district codes, provenance, source hashes, retrieval dates, and an audit. Downloads are snapshotted using the existing `SourceStore`. A failed import preserves the previous publication. See the URL constants in `election/finder.py` for exact download endpoints.

## Audit from the first import

Imported October 7, 2026:

- GeoNames: 122,424 BC rows; 122,334 unique postal codes.
- StatCan: 800,396 address rows; 123,487 have nonblank postal codes; 123,341 have valid BC postal codes and usable coordinates.
- StatCan supplies usable points for 8,149 postal codes, including 83 absent from GeoNames.
- Combined: 122,417 unique postal codes; 93 electoral boundaries.
- Local server checks: `V6Y 1N9` and longitude −123.14 / latitude 49.17 both match Richmond Centre.

Counts demonstrate import coverage, not completeness or verified residential accuracy. StatCan's newer web-page modification date does not make the 2021 dataset current. Neither source guarantees coverage of newer postal codes. Multiple distinct points and both sources are retained, including disagreements. No average point is invented. A single matched district means the recorded points agree; it does not prove the entire postal-code area is in that district.

## API

`POST /api/constituency-finder` accepts one of:

```json
{"postal_code":"V6Y 1N9"}
```

```json
{"latitude":49.17,"longitude":-123.14,"accuracy_m":50}
```

Coordinate inputs use latitude/longitude degrees; `accuracy_m` is optional and must be between 0 and 100,000 metres. Postal codes must be full six-character BC codes. The response contains `status` (`approximate`, `ambiguous`, or `no_match`), map location, source IDs, point sample count, matching district codes/names, published research availability, GeoJSON boundaries, and boundary version. With an accuracy radius, Go includes districts intersecting the approximate circle, using a local metre projection. This is an estimate, not a surveying calculation. Points on a shared boundary return both districts. Polygon holes and multiple polygon components are supported.

HTTP errors: 400 invalid input, 404 postal code absent from local data, 503 unavailable/invalid finder publication. No external geocoding calls are made. Responses use `Cache-Control: no-store`. The server does not persist or log submitted coordinates/postal codes; the bounded in-memory cache retains normalized postal-code keys only. The dataset itself is kept locally.

## Client behavior and limitations

The finder uses a native modal dialog styled as a right-side panel, with Escape/Close and restored focus. Users can enter a postal code, explicitly request browser location, or click the map. Browser location requires permission and HTTPS in deployment (localhost development is supported). The map displays district outlines, one recorded location point, and a location accuracy circle when available. Unpublished constituencies are identifiable without candidate links.

The result disclaimer states that matches are approximate, postal codes can span boundaries, current location can differ from home, and this tool does not determine an official voting district. [Elections BC warns against using GIS files to determine a voter's district](https://elections.bc.ca/resources/maps/gis-spatial-data/); the finder links to official verification.

Maps use Leaflet and OSM tiles. OSM receives the browser's IP and viewed tile area; precise coordinates are submitted only to our server. Attribution remains visible; tiles follow ordinary browser caching, with no bulk downloading/prefetch. Follow the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/). Set `window.BC_MAP_TILE_URL` before the client bundle to change tile providers; update attribution if changing provider/licence. Map network availability is separate from local lookup availability.

## Server memory

The server retains one decoded coordinate representation for both matching and GeoJSON responses, rather than retaining a raw GeoJSON copy alongside it. Postal-code source locations use fixed records instead of per-code maps. Boundary coordinate precision, polygon holes, and multiple components are preserved.

Measured on Apple M1 with the first local dataset: retained dataset heap fell from approximately 98.1 MB to 37.2 MB (62%). This measures live dataset allocations after garbage collection, not total process RSS or peak startup memory. Loading JSON still involves temporary allocations. Disk publication remains 29.5 MB; its schema is unchanged, so no reimport is necessary for this optimization.

Reproduce the memory measurement from `constituency-finder`:

```sh
go test -run '^$' -bench '^BenchmarkFinderLoad$' -benchtime=1x
```


## Microservice and bounded cache

The finder binds to loopback port 8001 by default. The main content server forwards POST requests to its configured `-finder-url` with a 10-second response-header timeout and no response-body cache. `GET /health` is a liveness check and does not load data. Missing/corrupt datasets produce a 503 and a five-second load retry cooldown. A mutex ensures concurrent first requests perform one successful load.

The finder retains the loaded dataset until process restart. A separate LRU cache holds at most 256 normalized postal-code results for ten minutes. Entries contain only indices into the immutable boundary collection. They do not duplicate coordinates, geometry, or serialized responses. Coordinate requests are not cached. Cancellation stops matching work. Research availability is based on a regular publication file existing and is checked fresh on each lookup; the content API validates that publication when the user opens its candidates.

Use `make up`/`down`/`status` to manage both services. The Makefile builds both binaries. Startup checks process survival and removes newly started finder processes if main-server startup fails. Existing running services are preserved. Logs live in `.run/`. Restart both services to apply code changes or replace finder data.
