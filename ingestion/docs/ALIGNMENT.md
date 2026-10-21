# Candidate research and promise comparisons

The [containerized job workflow](../README.md) automates case selection,
comparison drafting, and a separate source-review pass. Start the required jobs
instead of writing manifests and reviews manually. Low-level commands below remain
available for targeted research and existing inputs.

The Python pipeline uses the same research stages and six policy pillars for
every candidate. The client renders backend-published guides and findings;
it does not select research cases or infer alignment from topic matches.

## Pipeline modules

`election/analysis/alignment/` separates these responsibilities:

- `registry.py`: the shared pillar registry and allowed comparison statuses.
- `evidence.py`: bounded source windows, date provenance, and input fingerprints.
- `preparation.py`: candidate identity checks, reviewed action selection, evidence
  collection, private comparison jobs, and coverage screening.
- `prompts.py` and `drafting.py`: the output contract and bounded, cached drafts.
- `validation.py`: source quotations, chronology, attribution, and dossier checks.
- `publication.py`: separate source review, current-input checks, and public projection.
- `presentation.py`: backend-owned pillar cards, summaries, and unassessed states.
- `batch.py`: roster selection, research scaffolds, shared call budgets, and publication.
- `catalog.py` and `research.py`: bounded evidence catalogs and validated automated case selection.
- `review.py`: separate source checks, revisions/rejections, summaries, and provenance.

The Henry Yao manifest and review are bundled research inputs under
`election/analysis/research/<election>/<candidate>/`. They use the same pipeline
as every other candidate; there is no implicit Henry Yao command default.
The original research and source-check audit is in
[HENRY-YAO-ALIGNMENT.md](HENRY-YAO-ALIGNMENT.md).

## Run across candidates

From `ingestion/`:

```sh
# Build political profiles from previously collected records and reviewed identities.
python3 -m election --offline build-political-profiles

# Inspect coverage and create candidate-specific research checklists for the roster.
python3 -m election --offline research-candidates --stage plan
python3 -m election --offline research-candidates --stage init

# Narrow any stage by constituency or exact candidate name/candidacy ID.
python3 -m election --offline research-candidates --stage plan --district RCC

# Collect the explicit URLs and bounded windows from completed manifests.
python3 -m election research-candidates --stage collect --district RCC

# Draft privately, with one shared limit across the entire selected batch.
python3 -m election research-candidates --stage draft --max-calls 20

# Validate separate reviews, then rebuild public profiles and their shared guides.
python3 -m election --offline research-candidates --stage publish
```

The batch command defaults to `plan` and zero new model calls. `draft` reuses
cached results and accepts `--max-calls` from 0 to 10,000 for the entire run,
with at most 20 new calls per candidate per run. Provider configuration, rate
limits, and credentials follow [ANALYSIS.md](ANALYSIS.md).

Research inputs live in
`storage/curated/research/<election>/<candidate>/{manifest,review}.json`.
`--research-dir` overrides that root. Bundled research is used when no local
manifest exists; initialization copies it locally and never overwrites existing
research. Generated research inputs and reports are Git-ignored and need backup
alongside the other ingestion data. The latest selection and stage report is
`storage/normalized/research/<election>/latest-run.json`.

## Research checklist

Initialization creates an empty, candidate-specific manifest and six-pillar
checklist. It creates no promises, alignment findings, or identity approvals.
For each candidate:

1. Verify identity, source aliases, and prior offices in `storage/curated/identities.json`.
   Rebuild district and political profiles after applying those reviews.
2. Check coverage and collect the relevant voting, disclosure, and platform sources
   using the existing [collection and curation stages](PIPELINE.md). A missing index
   match does not establish a lack of political history.
3. Frame a narrow question under a shared pillar. Add a specific, dated party or
   candidate statement, its ownership, an exact quote, and source provenance.
4. Select the candidate's reviewed substantive action IDs. Add bounded operative
   bill/amendment and competing-argument evidence using
   [case.template.json](../election/analysis/alignment/case.template.json).
5. Collect evidence and draft. Check the policy effect, chronology, strongest
   counterargument, and limits against the source text.
6. Add a separate `review.json` covering each selected case's current `input_hash`,
   source-checked result, review date, and pillar takeaway. Publish the selection.

The current comparison adapter uses reviewed named legislative votes. Municipal
decisions, committee records, and other action types require source adapters and
attribution review before becoming comparison cases. Candidates without usable
records remain pending research; the pipeline does not manufacture comparisons.

## Publication and presentation

Drafts remain private. Publication requires current source hashes, candidate
identity, exact action records, evidence quotations, chronology, and a separate
source check. A valid quote alone does not establish a valid argument. Review metadata
distinguishes existing Codex checks from automated pipeline source-review passes;
neither records human editorial approval.

All selected dossiers are validated before a batch writes any of them. Validation
errors preserve previous alignment publications and appear in the run report.
Candidates without a complete research manifest or review remain pending rather
than blocking publication for separately completed candidates. Pending counts are
visible in the report; a successful run does not mean the entire roster is researched.

Every published candidate receives a `comparison_guide` with the same six pillars.
Reviewed findings supply alignment tags and source-linked details. A pillar with
no reviewed findings has no alignment verdict; a researched but inconclusive
finding is distinct from an unresearched pillar. The client uses the same cards,
dialogs, condensed voting table, and disclosures/interests table for all candidates.
The backend serves all guide text and candidate-specific findings.

The single-candidate collection, draft, and publication commands remain available
with an explicit `--manifest PATH` (`--pilot` is a compatibility alias). These
commands use the same modules as the batch workflow.
