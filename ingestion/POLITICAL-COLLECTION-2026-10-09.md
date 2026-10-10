# Political evidence collection — October 9, 2026

Built topic-organized profiles for the full retained roster of 355 candidates
across 93 constituencies, plus shared policy records for 10 parties. Existing
candidate voting indexes and extracted campaign/party documents were reused with
their original retrieval metadata. The roster was not refreshed in this run.

Downloaded and normalized all 170 distinct Assembly sitting-day transcripts
referenced by the candidate voting indexes, without collection errors. The
collector supports both modern and older Assembly HTML and committee-of-the-whole
transcripts. An initial parser pass rejected older-format pages; after adding
support, cached snapshots were reprocessed successfully.

| Evidence | Count | Status |
| --- | ---: | --- |
| Voting-index entries | 11,220 for 81 candidates | All have nearby transcript excerpts |
| Suggested voting questions | 4,221 | Need source review |
| Suggested outcomes | 5,513 | Need source review |
| Other unresolved voting contexts | 5,707 | Ambiguous; no question/outcome assigned |
| Motion leads | 333 | Short speaker labels need attribution review |
| Amendment-motion leads | 64 | Short speaker labels need attribution review |
| Bill-introduction leads | 60 | Short speaker labels need attribution review |
| Candidates with other action leads | 53 | Limited to collected sitting days |
| Candidate-source policy passages | 4,295 | Verbatim, unreviewed; authorship/date not established |
| Party-source policy passages | 1,607 | Verbatim, unreviewed; authorship/date not established |
| Reviewed personal commitments | 0 | Extraction has not approved any promises |

Ten shared policy topics and an uncategorized fallback group action IDs with
candidate-source and party-source passage IDs. Keyword matches and review status
are retained. Comparisons are empty: matching topics alone cannot establish
whether an action aligns with a promise.

Only Henry Yao's identity has an existing reviewed member-alias mapping. His 105
votes appear in the new public profile. All other voting attributions and all
short-label motion attributions remain in normalized research. Public profiles
exist for every candidate and expose the review/coverage gaps. The existing site
presentation is unchanged; these new profiles have no API endpoint yet.

Municipal/council decisions, separate committee records, prior-office discovery
and sitting days outside the indexed votes still require additional collection.
Candidates with no index match have explicit coverage gaps rather than a claim
that they have no political history. Historical source pages and third-party
biographical text can produce policy leads; these need review before treatment
as current candidate commitments.

Machine-readable outputs:

- `storage/normalized/political/bc-provincial-2026/summary.json`
- `storage/normalized/political/bc-provincial-2026/transcript-audit.json`
- `storage/normalized/political/bc-provincial-2026/{candidates,parties,transcripts}/`
- `storage/curated/datasets/political/bc-provincial-2026/{candidates,parties}/`
- `storage/published/political/bc-provincial-2026/{candidates,parties}/`

These generated artifacts are Git-ignored and must be backed up separately.

Validation: 39 Python tests pass, including ambiguous decisions, legacy HTML,
repeated timestamps, adjacent bill boundaries, attribution revocation, failed
refresh retention and offline rebuilding. A repeated build produced identical
bytes for all 365 political profiles. The ordinary `build-data` command also
successfully rebuilt 823 existing and new published datasets.
