# Constituency finder data

`python3 -m election build-finder` imports public location sources into
`storage/published/finder.json`. The static client build then converts that
source dataset into compact, versioned browser assets.

## Sources

| Source | Data | Licence / freshness |
| --- | --- | --- |
| [GeoNames postal downloads](https://www.geonames.org/export/zip/) — `CA_full.csv.zip` | Canadian postal codes with recorded points; BC subset only | CC BY 3.0; directory timestamp March 13, 2023, not a guarantee of record dates |
| [Statistics Canada Open Database of Addresses](https://www.statcan.gc.ca/en/lode/databases/oda) — `ODA_BC_v1.zip` | BC address points with postal codes where provided | Open Government Licence – Canada; version 1, collected January–April 2021 |
| [Elections BC boundary dataset](https://catalogue.data.gov.bc.ca/dataset/1cba4b16-263f-4d42-8d84-f5fecaa03d1a) | Official 2023 redistribution, boundary set 11 | Elections BC Open Data Licence; gazette date December 7, 2023 |

The importer retains full geometry, district codes, provenance, source hashes,
retrieval dates, and an audit. Downloads are snapshotted in `storage/raw/`.
A failed import preserves the previous `finder.json`.

Neither postal source guarantees current coverage. Multiple points and source
disagreements are retained; the build does not invent an average point. Postal
matches are approximate and do not determine an official voting district.

## Static build

The client build converts the source dataset into:

- 2,000-byte fixed postal tables per `V##` prefix;
- ambiguity records for postal codes that sample multiple constituencies;
- simplified boundary outlines for fast display and classification;
- lossless detailed boundaries for locations near an edge;
- a manifest whose version is a hash of the source data and public catalog.

Postal matching is precomputed at build time. Coordinate matching runs in a
browser Web Worker, so no location data is sent to an application server. Map
tiles still come from OpenStreetMap.

The finder opens lazily. The worker downloads only the required prefix table and
geometry files, caches decoded geometry within a bound, and cancels superseded
downloads. Browser location requires HTTPS and permission.

## Limitations

- Postal codes can span constituencies and change over time.
- Browser location can differ from a voter's home.
- Simplified outlines are approximate; edge cases load exact geometry.
- The map is an aid, not an official district lookup. Link to Elections BC for
  authoritative verification.

See `client/README.md` for build and deployment details.
