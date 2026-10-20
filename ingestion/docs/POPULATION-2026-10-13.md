# Site population — October 13, 2026

The Docker workflows ran across the complete 355-candidate roster in 93
constituencies. Publication completed with partial coverage: missing evidence and
rejected proposals remain private. Data is served by the backend on port 8000.

Published results:

- All 355 profiles have the shared six-pillar comparison guide.
- 38 identities have source-backed attribution reviews, including the existing pilot.
- 32 profiles contain 4,562 attributed legislative voting records.
- Henry Yao retains 11 checked comparisons; Heather Maahs has one new
  automated source-checked healthcare comparison.
- Andrew Mercier's proposed comparison remains unpublished because its quotation
  failed validation in both drafting and source review.

The remaining 353 profiles have no published comparisons. Their current work
queue comprises 317 pending identity reviews, six requiring action evidence,
29 requiring comparison research, and one awaiting a valid source review.
Missing comparisons do not establish alignment or a lack of political history.

The latest workflow, `populate-shared-evidence`, used 36 model requests across
research, comparison, and source review. Its final status is `partial` (exit 3),
with no fatal errors. Earlier identity and research runs have separate audits;
the 36 requests are not the total for the population effort.

Live execution exposed and corrected JSON-mode formatting, identity-source
catalog linkage, action sampling, and research-note formatting problems.
Research now reuses primary source windows from checked dossiers, while each
candidate's actions and conclusions must independently pass validation.

Validation: 78 ingestion tests and 13 client tests passed. All 355 candidate API
responses passed guide checks. Henry Yao, Heather Maahs, Calvin Dang, Rocky
McAfee, and Andrew Weaver passed desktop/mobile browser checks with no runtime
exceptions or page overflow. Both local services responded to health checks.

Persistent audit files (Git-ignored; retain with storage backups):

- `storage/runs/populate-roster-corrected/identity-review.json`
- `storage/runs/populate-reviewed-records/publish.json`
- `storage/runs/populate-shared-evidence/pipeline.json`
- `storage/runs/populate-shared-evidence/research.json`
- `storage/runs/populate-shared-evidence/source-review.json`
- `storage/runs/populate-shared-evidence/publish.json`

Containers finish after each job; audits, attempts, evidence, and publication
files remain in storage. See the ingestion README for selecting stages and
continuing with a new run ID.
