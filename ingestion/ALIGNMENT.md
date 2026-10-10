# Selective platform comparisons

The Henry Yao pilot answers a narrower question than an issue/ideology summary:
what do specific substantive votes reveal about alignment with a dated promise
or campaign position? The ingestion service is `election/analysis/alignment.py`.
The client renders its published output; it never makes model calls.

## Current pilot result

All six tabs are populated: 11 reviewed comparisons use 13 named votes across
10 bills. There are 43 explicit research sources and six sourced commitments
that this record cannot answer. The votes still end April 4, 2024.

| Pillar | Comparisons | What the record shows |
| --- | ---: | --- |
| Housing | 4 | Rent freeze, short-term rentals, small-scale zoning and a rejected REIT safeguard |
| Healthcare | 1 | Outside-B.C. credential rules; new training seats and wait-time promises remain unproven |
| Affordability and taxes | 2 | Paid-leave framework, rejected committee scrutiny, rejected used-car PST exemption |
| Jobs and economy | 2 | Single-step union certification and principle of platform-worker protections |
| Public safety and addictions | 1 | Public-consumption enforcement proposal; this Act never took effect |
| Climate, energy and environment | 1 | Historical 100% ZEV target versus the current 75% target |

Supporting a precise past measure is different from endorsing every newer
position. The 2025 worker-policy statement is explicitly a later party position,
not a new 2026 promise. Undated current positions display their observation date.
The affordability comparison does not manufacture a used-car exemption promise,
and the climate comparison does not infer Yao's stance on the later rollback.

## Original housing phase

Four housing findings use five named votes across three bills:

- March 2, 2021: support for the principle of the bill extending the rent freeze,
  compared with the October 12, 2020 BC NDP promise. The vote was unanimous and
  cannot distinguish Yao from other MLAs or establish final delivery by itself.
- October 25–26, 2023: reject an additional non-primary-residence short-term
  rental option, then support final passage of the principal-residence framework.
  Consistent with the party's September 25, 2026 defence of that policy.
- November 29, 2023: support final passage of provincial small-scale housing
  zoning requirements. Consistent with the later party position; permission to
  build does not establish construction or affordable prices.
- November 27, 2023: reject an amendment explicitly authorizing ministerial
  policy guidelines on REIT ownership prohibitions. A substantive choice to
  scrutinize, but not a demonstrated broken promise: the later broad campaign
  message does not specifically promise a REIT ban. The amendment was
  discretionary guideline authority, not an automatic ban.

The new September 2026 unsold condo tax promise remains unassessed. Collected
Yao votes end April 4, 2024, so they cannot establish delivery of that promise.
The pilot does not assess the whole platform. Questions across the six pillars
are selected explicitly; other substantive votes remain `not_assessed`, not low
signal. The current audit screens all 105 indexed entries: 13 selected, 14
procedural, 9 bundled budget/supply/throne decisions and 69 unassessed.

Primary sources are listed in
[`henry-yao.json`](election/analysis/pilots/henry-yao.json): dated party releases,
the candidate campaign page, official versioned bill texts and full Hansard
amendment/debate/vote passages. The candidate-page message has no established
publication date. Its observation date is derived from the source capture in
America/Vancouver, and its ownership is explicitly the party message shown on
that page. Party criticism of opponents is evidence of the party's own policy
position; its outcome and opponent claims are not independently validated facts.

## Run

From `ingestion/`:

```sh
# Fetch only the manifest's explicit URLs; existing snapshots are reused.
SSL_CERT_FILE=/etc/ssl/cert.pem python3 -m election collect-alignment-evidence

# Limit drafts to one pillar; at most two new model requests.
SSL_CERT_FILE=/etc/ssl/cert.pem python3 -m election analyze-platform-alignment --pillar affordability --max-calls 2

# Source-checked editorial findings, then rebuild public profiles, offline.
python3 -m election --offline build-platform-alignment \
  --review election/analysis/pilots/henry-yao.review.json
```

Each command supports `--pilot PATH`. The draft command supports `--max-calls`
0–20 and offline cached runs. Collection supports refresh through the global
`--refresh` flag. The service does not crawl new links or bulk-expand the roster.
Publishing remains a separate ingestion operation using a review file bound to
the exact input hashes. This is a data validity gate, not a request for user
approval. Current review metadata says `codex_source_review`: it is an
AI-assisted source check, not a human editorial approval.

The first live pilot made four DeepSeek requests (12,930 input and 2,402 output
tokens). At the existing configured rates that is approximately $0.0068, not a
billing receipt. Two drafts failed quotation validation (invented ellipses and
excessive quote length). All four draft attempts were retained privately. Codex
checked the bill/amendment text, dates, indexed positions and arguments, then
corrected the published editorial findings. It also added the Bill 44 final-vote
transcript to the reviewed evidence. No failed draft was automatically promoted.

## Evidence and publication rules

- Explicit start/end source windows must be uniquely locatable and bounded.
  Source bytes are cached with SHA-256 provenance. Full windows stay private.
- Both a platform quotation and operative bill/amendment quotation are required.
  Quotes must exist in supplied evidence and are limited to 25 words per source
  per comparison. The current published pilot also stays within that limit
  across findings sharing a source.
- Publication dates must be present in the captured source; undated statements
  use a checked capture date. A later statement cannot be classified as a
  promise fulfilled by an earlier vote.
- Candidate/person/party identity and every selected named vote must match the
  current reviewed profile. A changed profile, refreshed source content,
  corrupted snapshot or changed job input invalidates the old review.
- The model drafts comparisons privately; it does not approve its own output.
  The review file covers exactly the selected cases and includes operative
  citations, counterarguments and limits. Source presence validates a quote,
  not the correctness of the argument: human editorial review is still absent.
- Second reading, final passage and rejection of an amendment remain distinct.
  Related stages are not independent observations. There is no three-event
  threshold for a narrow factual comparison, and no overall alignment score.

Private jobs/results/attempts/selection/drafts/audits live under
`storage/normalized/alignment/<election>/<candidate>/`. Source-checked dossiers
live under `storage/curated/datasets/alignment/<election>/`; public political
profiles embed them as `alignment_analysis`. Storage and built client assets
are ignored by Git. The pilot manifest and editorial review are repository
inputs and need the corresponding cached snapshots to reproduce offline.

The pilot client groups its 11 findings into six tabs with separate takeaways,
identifies promise ownership/dates and keeps counterarguments, citations,
methodology and the complete searchable voting record expandable. It replaces
the main-view passage counts, raw platform excerpts and broad stance cards for
this candidate. Other candidates retain their existing view until separately
researched comparisons are available.

## Repeat the research by pillar

The shared registry is [`pillars.json`](election/analysis/pillars.json). Ingestion
and the client use the same six IDs: `housing`, `healthcare`, `affordability`,
`economy`, `public_safety`, and `climate`. These organize research; they do not
assert that each issue has been assessed. Education, reconciliation and
accountability can become distinct pillars when researched rather than being
forced into unrelated categories.

For each candidate and pillar:

1. **Frame a narrow question.** Find a specific, dated party or candidate promise
   or position. Record its owner, original publication date or checked capture
   date, quotation and source. A broad aspiration alone cannot prove a broken promise.
2. **Screen for substantive choices.** Inspect relevant bills, amendments and
   attributed actions. Seek both support and possible tensions. Separate routine
   procedure and bundled approvals. Omission means unassessed, not aligned.
3. **Collect operative evidence.** Capture the named vote, stage, correct bill
   version, exact amendment and arguments on both sides. Check mandatory versus
   discretionary powers, exemptions and what rejecting an amendment preserves.
4. **Add a case.** Use a unique ID and required `pillar_id`, one precise statement,
   selected action IDs and bounded source windows. Reuse sources. Give each case
   one primary pillar rather than duplicating findings across tabs. Worker
   protections, for example, are not automatically healthcare access evidence.
5. **Draft and independently check.** Check chronology, policy effects,
   counterarguments and limits. Use inconclusive for indirect matches: regulating
   health professions does not demonstrate shorter wait times. No inferred
   motives, outcome claims or overall scores.
6. **Publish a reviewed comparison.** Bind the editorial review to the exact
   inputs. Provide a `pillar_takeaways` entry for each assessed pillar, based only
   on its findings. Give sourced unassessed promises a `pillar_id` too. Rebuild
   public profiles and client assets. Empty tabs explicitly say no comparisons
   have been published; this is different from an inconclusive reviewed finding.

Use [`case.template.json`](election/analysis/pilots/case.template.json) as a
case-writing checklist; placeholders must be replaced with verified evidence.
Append cases and sources to the candidate-wide manifest so existing housing
findings are retained. Collection fetches only the explicit source URLs. Drafting
can be limited to one pillar:

```sh
python3 -m election analyze-platform-alignment \
  --pilot election/analysis/pilots/henry-yao.json \
  --pillar healthcare --max-calls 4
```

Publication still requires a current review covering every selected case.
Changing a case's pillar invalidates its review hash. The six tabs share the
methodology and searchable vote archive. All six pillars now have published comparisons for Henry Yao. The method also
supports explicit empty states for candidates and pillars not yet researched.


## Six-pillar expansion audit

The expansion made seven DeepSeek requests, using 25,019 input tokens and 5,697
output tokens: approximately $0.0143 at configured prices, not a billing receipt.
All seven drafts failed one or more publication validations (quotation fidelity,
quote quota, unexpected envelope fields, length or chronology). Their analyses
and rejected outputs were retained privately. Codex separately checked and
rewrote the seven published editorial results. No model draft was automatically
published, and no human editorial review is recorded.

Source review corrected the union draft's chronology label and the used-car
PST draft's overgenerous alignment label. It also checked the original sick-leave
amendment rather than treating a deferred-vote announcement as its wording.
The public-consumption evidence was expanded to include the full 77–4 tally,
correcting an erroneous count in the initial research question after drafting;
its editorial review is bound to the corrected input. The minister's December
19, 2024 statement and the captured current ZEV Act prevent obsolete policies
from being described as still operating.

An initially plausible recovery-benefit lead was excluded: the selected finance
bill did not enact that benefit. `research_notes` in the manifest retain this
and other selection limits. The combined private run audit is
`storage/normalized/alignment/<election>/<candidate>/pillar-run-summary.json`.
All published quotations stay within 25 words per shared source across the
entire dossier, with a current maximum of 20.
