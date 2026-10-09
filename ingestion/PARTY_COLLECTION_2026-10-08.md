# Deeper party collection — October 8, 2026

Command: `SSL_CERT_FILE=/etc/ssl/cert.pem python3 run_platform_collection.py --only parties --party-max-pages 60`

All ten parties on the Parties page are covered. This run collected 61 documents, compared with 35 in the initial collection. Existing snapshots were reused; uncached links were fetched. An offline rerun returned the same document counts and no errors.

| Party | Documents | PDFs | Extracted PDF pages | Extracted words | Coverage |
| --- | ---: | ---: | ---: | ---: | --- |
| BC Green Party | 8 | 3 | 47 | 25124 | collected |
| BC NDP | 2 | 0 | 0 | 8626 | collected |
| CWP | 2 | 0 | 0 | 176 | collected |
| CentreBC | 1 | 0 | 0 | 620 | collected |
| Christian Heritage Party of BC | 3 | 1 | 20 | 10549 | collected |
| Communist Party of BC | 1 | 0 | 0 | 1828 | collected |
| Conservative Party | 17 | 1 | 9 | 9637 | collected |
| Freedom Party of BC | 1 | 0 | 0 | 1628 | collected |
| Libertarian | 24 | 0 | 0 | 21850 | collected |
| OneBC | 2 | 0 | 0 | 1401 | collected |

Counts include source pages and linked documents, not distinct promises. Navigation text and duplicated material can remain. `collected` means the configured bounded crawl completed; it does not establish platform completeness.

Source texts and provenance are in `storage/published/platforms/bc-provincial-2026/parties/`; raw snapshots are under `storage/raw/`. These generated files are ignored by Git. The curated source registry and collector changes are tracked.

PDF page numbers are retained. Current platform links can point to articles originally published in earlier years; those need date checks during editorial review. CanWest publishes undated goals on an HTTP-only website; CentreBC describes a platform still in development. Neither should be presented as a detailed costed election plan.

These materials are unparsed research inputs. This run does not automatically update frontend summaries or assess whether party claims are true.
