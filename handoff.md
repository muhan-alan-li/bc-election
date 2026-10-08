# Handoff: BC provincial election guide

Prepared 7 October 2026. This document describes the Richmond project as it exists and proposes an adaptation in a **new, separate repository**. Creating that repository and implementing the provincial guide are the next task; this handoff does not change the Richmond application.

## Goal

Build a neutral, source-linked guide to a British Columbia provincial election. Help voters find their electoral district, compare its candidates, understand party platforms, and examine how campaign claims relate to attributable public records. Preserve alphabetical presentation, transparent evidence, and personal browser-only shortlists. Do not introduce endorsements, candidate rankings, or an overall political score.

The core question remains: **What is being promised, what does the public record establish, and what remains unknown?** At the provincial level, distinguish candidate promises, party promises, individual MLA decisions, and government outcomes.

The target election must be explicit configuration. As checked on 7 October 2026, Elections BC has a [2026 provincial election page](https://elections.bc.ca/2026-provincial-election/) and a [writ announcement for the 44th provincial general election](https://elections.bc.ca/news/writs-issued-for-british-columbias-44th-provincial-general-election/). Recheck official dates, nomination status, district boundaries, and candidate lists when starting the new project. Do not assume the next election is in 2028 or copy the Richmond election date.

## What this project currently does

This is a Richmond 2026 municipal and school election research site, organized around Mayor, Councillor, and School trustee. Its configured seat counts are 1, 8, and 7 respectively. The roster collector expects 7 mayoral, 55 council, and 28 trustee candidates; these are snapshot-specific assertions, not reusable election rules.

The home page introduces the election and links to each office. Office pages offer alphabetical candidate tables, text and elector-organization filters, policy-pattern filters, pagination, and personal choice filters. Users can mark candidates as shortlisted or not interested and reset their choices. Choices persist in local storage; there are no user accounts.

Candidate pages show:

- Office, elector organization, incumbency/current-office labels, and nomination links.
- Campaign claims, linked candidate statements and questionnaires, and reviewed policy patterns.
- Dated public actions and selected votes, grouped by topic, with source links and outcomes.
- Reviewed holdings and declared interests, where available.

Public-record coverage is deliberately qualified. The council collector and publisher focus on dissent and declared conflicts because the reviewed Richmond minutes do not reliably name every affirmative voter. Consent bundles do not establish individual votes. This limitation is specific to the source and must not become the default interpretation of legislative records.

The curated data contains more narrative fields than the current candidate page displays. Reuse the actual interface and data contract deliberately rather than assuming every research field is a visible feature.

## Architecture and working workflow

| Area | Current implementation | Provincial reuse |
| --- | --- | --- |
| `client/` | Preact/JSX, esbuild, plain CSS, hash routing, Atkinson Hyperlegible | Keep the stack, visual foundation, accessible tables, sources, filters, and personal choices; replace navigation and municipal copy. |
| `content-server/` | Go standard-library HTTP service | Keep static serving, `/api/election`, ETag revalidation, and `/health`; update dataset validation. |
| `ingestion/` | Offline Python collectors, local assembly, validation, atomic publication | Keep the pipeline structure; replace source adapters and election-specific joins. |
| `ingestion/research/` | Source notes and coverage documentation | Start fresh provincial research notes and document scope and review dates. |
| `ingestion/storage/` | Raw → normalized → curated → published data | Preserve the separation between collected facts and reviewed assessments. |

The server serves `client/dist/` and reads `ingestion/storage/published/election.json`. Publication uses local inputs only, validates before atomic replacement, and preserves the previous dataset on validation failure. The server reads the dataset on each request, so a published update becomes visible without restarting. Collection is independent of HTTP serving.

Reviewed inputs and research notes are version-controlled. Generated publication, downloaded HTML/PDF caches, and search logs are local artifacts. Search collectors support Brave and Firecrawl; their results are discovery leads, not evidence by themselves. API keys belong in environment variables or a local `.env`, never in the new repository.

Current prerequisites are Node.js 22.12+, Python 3.12+, and Go 1.24+. Root commands:

```sh
make setup
make up                 # Background development, localhost:8000
make status
make down
make dev                # Foreground alternative
make collect SOURCE=roster
make publish            # Local validation and publication only
make build              # Publish and compile frontend/server
make start              # Serve production
make check              # Lint, formatting, and unit tests
make test-browser       # Chrome or Playwright Chromium required
```

Development rebuilds client/data edits automatically; Go changes require restarting. Production needs the Go binary, compiled client, and published dataset; Python and Node are build/ingestion dependencies. Keep this simple deployment model initially.

## Provincial election model

| Richmond concept | Provincial replacement |
| --- | --- |
| Three office groups | Electoral districts (ridings), each contesting an MLA seat |
| City-wide multi-seat council/trustee lists | A voter's district candidate list |
| Elector organization | Political party affiliation, with explicit independent/no-affiliation states |
| Municipal voter-guide PDF | Candidate campaign material and separately stored party platform documents |
| Council/school-board minutes | Legislative divisions, bills, Hansard, committees, and attributable prior-office records |
| Local interests disclosures | Applicable provincial member disclosures and separately identified campaign-finance filings |

Load the district list and boundary version from official Elections BC materials rather than hardcoding a district count. A party leader can have both a province-wide leadership role and a candidacy in one district. Explain the voter's local MLA choice without presenting the premier as a separate province-wide ballot selection.

Party affiliation and office history must be dated. A returning MLA may contest a different district or party; distinguish “currently an MLA,” “incumbent for this district,” “former MLA,” and “previous municipal office.” Historical records retain the affiliation and jurisdiction at the time of the action.

## Proposed user experience

1. **Home:** configurable election title/date/status, district search or selector, an official “find your electoral district” link, and access to parties and methodology.
2. **District page:** its candidate list, party and policy filters, shortlist controls, roster freshness, and an explicit empty/provisional state when nominations are incomplete.
3. **Candidate page:** district, current affiliation, candidacy status, office history, personal commitments, linked party commitments, public records, reviewed patterns, and sources.
4. **Party page:** platform by issue, leadership information where sourced, dated platform versions, and party/government records clearly identified by actor.
5. **Methodology/coverage:** evidence rules, time windows, review dates, incomplete research, and correction instructions.

Suggested routes are `#/district/:id`, `#/candidate/:id`, and `#/party/:id`. Keep manual district selection for the first release. Address/geospatial lookup and a province map can come later; link to Elections BC for authoritative district identification meanwhile.

Preserve readable typography, keyboard controls, mobile layouts, source links, and alphabetical defaults. Shortlisting several candidates remains a comparison aid; it must not look like a ballot submission. Namespace storage by provincial election ID so choices cannot collide with Richmond or another election cycle.

## Proposed data contract

Use a new schema version, updating Python, Go, and the browser together. The current schema is version 1 and assumes exactly three offices; changing only the frontend will fail validation.

Recommended entities:

- **Election:** stable ID, jurisdiction/type, title, nullable voting date until verified, status, official source URL, boundary version, generated timestamp, and separate source/review freshness.
- **District:** stable official ID where available, name, boundary reference/version, seat count, and roster status/coverage.
- **Party:** stable ID, official name, optional sourced abbreviation, platform versions, claims, sources, and separately reviewed party assessments.
- **Person:** stable identity, display name, aliases, and dated office/affiliation history.
- **Candidacy:** election/person/district IDs, nullable party ID, explicit affiliation/candidacy status, status source and date, incumbency information, and campaign links.
- **Claim:** stable ID, candidate or party owner, issue tags, text, source, date, and optional explicit candidate adoption of a party claim.
- **Record:** stable ID, actor and jurisdiction, date, record type, bill/motion ID and stage where applicable, position, outcome, source locator, and attribution limits.
- **Assessment:** claim ID, assessed actor/scope, stance, explanation, reviewed date, and references to supporting/opposing/context records.

Start with flat arrays in one published JSON file; a database is not required. Reference party claims rather than duplicating the platform into every candidate. Use explicit unknown/not-reviewed states instead of making absent data look like a negative finding.

The existing pipeline joins nearly everything by candidate display name and generates ASCII name slugs. Replace these with stable IDs and reviewed alias mappings: names can collide, change, or contain characters the current slugifier removes. Keep person identity distinct from a candidacy in a particular election/district.

Validation should reject duplicate IDs, broken references, wrong-election district assignments, unsupported statuses, invalid dates, and unsupported assessments. Permit legitimately empty district rosters and candidates with no reviewed public record. Do not infer provincial party affiliations from similarly named municipal elector organizations.

## Provincial evidence and interpretation

Use [Elections BC](https://elections.bc.ca/2026-provincial-election/) for official election metadata, candidates, parties, district lookup/maps, results, and provincial finance resources. Follow the applicable election's official roster rather than treating a party announcement as confirmed ballot status.

Use the [Legislative Assembly's parliamentary business resources](https://www.leg.bc.ca/index.php/parliamentary-business) for bills, Votes and Proceedings, debate transcripts, and committees. Its [Hansard indexes](https://www.leg.bc.ca/parliamentary-business/indexes-to-debate-transcripts) include member and voting-record indexes. Build a new legislative collector from those sources; do not adapt the Richmond dissent-only parser by changing URLs.

For every legislative vote, preserve the exact question, bill/motion stage, date, named position, and outcome. Distinguish recorded divisions from voice votes and unrecorded positions. Missing from a vote list is not automatically an abstention or absence. Several stages of one bill should not automatically count as separate substantive policy decisions.

Hansard speeches and questions show what someone said, not necessarily what they voted for or delivered. Sponsoring a bill is distinct from its passage; passage is distinct from implementation and outcomes. Party-aligned votes are attributable votes but do not alone establish personal authorship or independent initiative. Government outcomes need evidence and an explicitly identified responsible actor.

Use official budgets, legislation, and government publications for policy actions; candidate/party publications for their own claims; original questionnaires for answers; and credible reporting for context or corroboration. Preserve source URL, title, publisher, publication/retrieval dates, and page/section or transcript locator where possible.

Keep finance filings separate from holdings/interests disclosures. Identify the filing type, covered period, filer, and limitations. Do not carry over the municipal disclosure explanation or imply that a reported holding/donation establishes misconduct. Locate and verify the relevant provincial disclosure source before implementing that section.

The current pattern system has four stances: `consistent`, `mixed`, `inconsistent`, and `insufficient`. Its validator requires directional evidence on at least two distinct dates for a non-insufficient result; consistent needs repeated support without opposing evidence, mixed needs both directions, and inconsistent needs repeated opposition without supporting evidence. Retain the cautious approach and add substantive-decision deduplication and actor/scope checks. Keyword topic grouping can help browsing but cannot determine a stance.

Assess a party claim at party level unless there is evidence the candidate adopted it and relevant personal evidence to assess. A newcomer does not inherit their party's historical assessment. Prior municipal records can be useful but retain their original jurisdiction. Missing evidence describes the research coverage, not character, competence, or suitability.

## Code that needs deliberate adaptation

| Files/area | Required changes |
| --- | --- |
| `client/js/pages/home.jsx`, `office.jsx`, `candidate.jsx`; `app.jsx`, `router.js`, navigation/cards | Replace office navigation with district navigation; introduce party pages; update candidate context and links. |
| `client/js/domain/choices.js`, `patterns.js`; choice hook and candidate table | Election-specific storage keys, stable candidacy IDs, party filters, and scoped assessments. |
| `client/js/components/campaign.jsx`, `records.jsx`, `interests.jsx`; record display/categories | Separate party/candidate claims; show provincial vote stages/types; replace council disclaimers and municipal disclosure copy; broaden issue taxonomy. |
| `client/js/data/load.js`, `client/templates/index.html` | New schema version, provincial branding, and metadata. |
| `ingestion/election/processing/assembly.py`, `repository.py`, `validation.py`, `config.py` | Remove office/seat constants, per-office files, name-keyed joins, sitting-label special cases, and municipal source notes. |
| `ingestion/election/collection/` and CLI | New provincial roster, district, party/platform, legislative, and finance adapters; re-scope search queries. Retain useful HTTP/cache infrastructure. |
| `content-server/internal/storage/dataset.go` | Replace version-1/three-office envelope constraints and allow valid partial coverage. |
| Python, client, Go, and browser tests | Replace municipal fixtures and assumptions; verify the new contract and user journeys. |

## New-project implementation sequence

1. Create a separate repository, carrying over reusable application/tooling code and this handoff. Exclude `.git`, dependencies, builds, local caches/logs, credentials, and Richmond candidate/research datasets. Use clearly labelled synthetic fixtures until provincial inputs are verified.
2. Confirm election scope and official sources. Make dates, boundary version, election ID, and freshness configurable. Target province-wide roster coverage, with deeper research initially limited to a clearly disclosed pilot set of districts.
3. Define the provincial schema and validators first. Update server/client contracts together and prove local atomic publication with a small fixture including different party statuses and incomplete research.
4. Build home → district → candidate navigation, party pages, and personal choices. Remove Richmond-specific copy and source assumptions.
5. Collect and reconcile the official roster; add sourced platforms. Then collect legislative records for incumbent/former MLAs and reviewed histories for newcomers. Maintain an explicit coverage checklist.
6. Review claims and evidence under the scoped methodology. Publish only attributable records and explained assessments; leave unsupported conclusions as insufficient evidence.
7. Run adapted unit and browser checks, build the deployment artifacts, and document refresh/correction procedures before publishing.

First-release acceptance: a voter can select a district, see a sourced candidate roster, open profiles, distinguish personal and party promises, inspect evidence and coverage dates, and persist/reset choices. Partial or empty research renders honestly. Invalid publication preserves the previous dataset. Tests cover ID/reference integrity, schema agreement, assessment scope, incomplete rosters, filtering/routes, storage isolation, and mobile/keyboard use.

Default scope is an English-language informational guide with no accounts, live results, polling forecasts, automatic political scoring, or address lookup. Those features, broader translations, hosting choice, and the depth of province-wide research can be decided when creating the new project.
