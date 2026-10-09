# Platform collectors

Two independently runnable Python collection jobs produce source material, without
LLM inference, promise extraction or uniqueness comparisons. Neither requires the
history workflow. Each uses Elections BC's roster for names and affiliations.

## Source registry

Edit `storage/curated/platform-sources.json`. Keys are the configured election ID,
exact official party names, district codes and exact candidate ballot names:

```json
{
  "bc-provincial-2026": {
    "parties": {
      "Example Party": ["https://party.example/platform"]
    },
    "candidates": {
      "RCC": {
        "Example Candidate": ["https://candidate.example/priorities"]
      }
    }
  }
}
```

These URLs are illustrative. The checked-in registry includes the sources found
in the first province-wide collection. Explicit seeds can include questionnaires
on other hosts. Both collectors discover platform, priority, policy, commitment, manifesto and PDF links within seeded hosts. Party collection additionally follows plan and announcement pages, full-news-release links, and issue-page “Read More” links from policy indexes. It excludes older platform archives but retains older articles linked by a current platform. They do
not search the whole web, execute JavaScript or transcribe videos.

## Commands

Run from `ingestion/`:

```sh
python3 -m election collect-party-platforms
python3 -m election collect-party-platforms --party 'Example Party'
python3 -m election collect-candidate-platforms
python3 -m election collect-candidate-platforms --district RCC
python3 -m election collect-candidate-platforms --district RCC --candidate 'Example Candidate'
python3 -m election --offline collect-candidate-platforms --district RCC
python3 -m election --refresh collect-party-platforms
```

`--max-pages` controls attempted URLs (party default 60, candidate default 12, maximum 100). Seed URLs count toward that limit. Sources are cached by default;
use `--refresh` to check for changes and `--offline` to prohibit network access.
Optional Poppler `pdftotext` extracts PDF text, retaining page numbers. Without it,
PDF bytes are still cached and coverage reports unavailable extraction.

## Publications

Outputs live under `storage/published/platforms/<election-id>/parties/` and
`candidates/`. These are separate from constituency datasets and are not yet
exposed by the Go API or frontend. A party platform is stored once per party and
election. Candidate records reference its stable ID even before it is collected.
Independent and unaffiliated candidates have no party-platform reference.

Documents retain source URL, retrieval time, content hash, raw snapshot reference
through the cache, extracted text, PDF page numbers and extraction status.
Commitments remain empty with `parsing_status: not_run`; party comparisons are
also pending. Collected page text must not be treated as verified commitments.

Coverage distinguishes `not_configured`, `failed`, `partial` and `collected`, with
checked URLs, errors and queued URLs omitted by the page limit. `collected` means
the bounded crawl succeeded, not that every campaign commitment was found.
Publication writes are atomic. A total collection failure preserves a previous
publication containing documents and saves diagnostics in `.attempt.json` beside
it. Partial runs publish their explicit coverage and errors.

Future parsers can consume these documents independently, extract evidence-backed
commitments, and compare candidate statements with the shared party version.

## Repeatable discovery and batch runs

The checked-in curated registry includes party URLs, candidate URLs and reviewed
name variants. Discovery only appends unambiguous links; it preserves existing
party and candidate URLs. Questionnaire links are matched within their district.
Configure directory URLs with `platform_directories` in the election config.
Dynamic directories and spelling variants can still require curated entries.

```sh
python3 discover_platform_sources.py --offline
python3 run_platform_collection.py --offline
python3 discover_platform_sources.py --refresh
python3 run_platform_collection.py --refresh --workers 4 --party-max-pages 12 --candidate-max-pages 3
```

Both scripts support `--config`, `--storage`, mutually exclusive `--offline` and
`--refresh`, and 1–8 workers. They can run from any working directory and do not
execute on import. Cached collection reuses the latest downloaded snapshots;
offline mode performs no network calls, while refresh reports fetch failures.
The roster is cached under the same rules.

Batch summaries include election, mode, page limits, current-attempt errors and
retained publications. A failed attempt returns exit code 1, including when an
older useful publication was preserved. Partial coverage caused only by page
limits does not fail the command. Successful publication clears stale failed
attempt metadata. Discovery errors also return exit code 1 after saving its audit.
Outputs have stable record/document IDs; generation times and run durations change.

On the macOS Python installation used for the first run, set
`SSL_CERT_FILE=/etc/ssl/cert.pem` to use the system CA bundle. Keep certificate
verification enabled. Fresh checkouts include the source registry but not cached
snapshots or generated publications: run online once before using offline mode.

## Deeper party-only collection

```sh
SSL_CERT_FILE=/etc/ssl/cert.pem python3 run_platform_collection.py --only parties --party-max-pages 60
python3 run_platform_collection.py --only parties --offline
```

`--only parties` skips all candidate jobs; `--only candidates` skips party jobs.
The batch party limit now defaults to 60. Hosts with and without `www` are treated
as the same discovery scope. External documents require an explicit curated seed.
HTTP remains rejected by default. Party collection allows HTTP only for hosts
explicitly configured with an HTTP seed (currently CanWest); it never retries an
HTTPS failure over HTTP or disables certificate checks.

See [the deeper collection report](PARTY_COLLECTION_2026-10-08.md) for counts,
PDF extraction and limitations. The frontend's editorial summaries remain separate.
