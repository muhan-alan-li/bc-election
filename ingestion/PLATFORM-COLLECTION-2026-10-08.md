# First platform-source collection — October 8, 2026

Ran both Python collectors for election `bc-provincial-2026`, using the cached
official roster of 355 candidates across 93 constituencies and 10 parties.
The roster itself was not refreshed during this run.

## Results

| Collector | Records | Documents retained | Coverage |
| --- | ---: | ---: | --- |
| Party platforms | 10 | 35 | 7 collected, 2 partial, 1 failed |
| Candidate platforms | 355 | 634 | 292 collected, 63 partial |

All candidates have registered source URLs. Candidate fetching reported no
errors. Coverage describes the bounded collection, not verified commitments or
complete platform coverage. Documents include biographies, empty questionnaire
profiles, policy pages and platform PDFs; commitments and comparisons remain
unparsed.

The Green and Libertarian party collections reached the 12-page limit. CWP's
registered site `https://www.canada2.net/` failed its HTTPS connection. That
failure remains visible in the party publication. No TLS verification was disabled.

330 candidate records contain a VoteMate page explicitly saying the candidate
has not added promises there. This is an observation about that source, not
evidence that those candidates have no personal commitments elsewhere.

Candidate discovery used exact names in official directories, candidate-name
slugs in CentreBC's published directory and individual VoteMate profile links.
Three official-directory name variants were resolved explicitly: A'aliya Warbus,
Matt/Matthew Liang and Francoise/Françoise Raunet. The NDP directory uses dynamic
rendering, so it supplied no directly matched profile links in this pass; most
NDP candidate records rely on VoteMate. Henry Yao also has a verified primary
campaign source. Broader candidate-owned source discovery remains incomplete.

## Richmond Centre example

| Candidate | Collected sources |
| --- | --- |
| Henry Yao | Official campaign website and VoteMate profile |
| Sacha Peter | Official party candidate page, personal campaign website and VoteMate profile |
| Calvin Dang | Official Green candidate page and VoteMate profile |
| Lawrence Chen | VoteMate profile; shared CWP platform collection failed |

## Resources and reproduction

The initial collection took 85 seconds using four concurrent jobs, following
source discovery and initial caching. Cached correction runs took approximately
6–7 seconds. These timings exclude source research, approvals and directory
discovery. No LLM calls or paid inference were used.

Run from `ingestion/` on this macOS installation:

```sh
SSL_CERT_FILE=/etc/ssl/cert.pem python3 discover_platform_sources.py
SSL_CERT_FILE=/etc/ssl/cert.pem python3 run_platform_collection.py
```

The certificate setting corrects this Python installation's missing CA setup.
The batch runner uses the same independently callable collector functions as
the CLI, with four concurrent jobs, 12 pages per party and 3 per candidate.
Discovery merges registered sources; registered URLs can be edited directly.
Administrative privacy, cookie, terms, donation and membership pages are excluded
from automatic platform-link discovery.

Publications: `storage/published/platforms/bc-provincial-2026/{parties,candidates}/`.
Machine-readable summary: `storage/normalized/platform-collection-summary.json`.
Raw snapshots remain in `storage/raw/`. These generated artifacts are local and
ignored by Git, and are not yet exposed through the Go API or frontend.

All 21 Python tests passed after the collection-related crawler correction.
