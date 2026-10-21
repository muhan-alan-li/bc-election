# Political decision analysis

For the Henry Yao pilot, the client now prioritizes selective, dated commitment
comparisons over these broad issue patterns. See [ALIGNMENT.md](ALIGNMENT.md)
for the substantive-source collection, separate source check and publication
workflow. The original issue analysis remains available in research storage.

The analysis service lives in `election/analysis/`. It interprets each shared
political decision once with an LLM, then derives candidate issue patterns using
local, descriptive counts. It does not make a separate model call for each
candidate's vote or generate a numeric ideology/alignment score.

## Configure and run

The default provider is DeepSeek's OpenAI-compatible chat endpoint:
`https://api.deepseek.com/v1`, model `deepseek-flash`. Settings are in
`config.json` under `political_analysis`. The repository-root `.env` may contain
`DEEPSEEK_API_KEY`; it is loaded only for live analysis. Existing environment
variables take precedence. Secrets are neither printed nor saved in research
artifacts. `.env` files are Git-ignored.

Run from `ingestion/`:

```sh
# No network calls or credentials required; prepare jobs and estimate all usage.
python3 -m election estimate-political-analysis
python3 -m election estimate-political-analysis --district RCC

# Bounded pilot, then resume. Each command defaults to at most 20 new calls.
SSL_CERT_FILE=/etc/ssl/cert.pem python3 -m election analyze-political-records --district RCC --max-calls 12

# Full roster, at most 100 additional calls in this invocation.
SSL_CERT_FILE=/etc/ssl/cert.pem python3 -m election analyze-political-records --max-calls 100

# Recompute summaries from validated cached model outputs, without API calls.
python3 -m election --offline analyze-political-records
```

A partial run is useful and explicitly reports pending actions. Resume the same
command to process uncached decisions. `--max-calls 0` also makes no model calls.
The HTTP adapter retries transient 429/5xx responses with bounded backoff and
stops on credentials, network, or other endpoint failures. Timeouts are not
blindly retried because a provider may have billed the request. A failed model
output never becomes a conclusion; previously validated responses remain cached.
`workers` bounds simultaneous requests (1–8). Workers share a primary-request
rate limit through `requests_per_minute` (1–120); provider retries are additional.
The current full-batch configuration uses eight workers and 120 primary requests
per minute. Endpoint failures stop queued work while in-flight requests finish
and their reported usage is recorded.

To use OpenRouter, set `base_url` to `https://openrouter.ai/api/v1`, `model` to a
specific available model ID, `api_key_env` to `OPENROUTER_API_KEY`, and adjust
`extra_body` to the selected model/provider (an empty object is valid). Specify
that key in the root `.env`. The adapter uses standard chat messages,
`response_format: {"type":"json_object"}`, and local validation rather than
assuming every endpoint supports JSON Schema. Select a fixed model rather than
a random free-model router for comparable analysis. All-time free-tier quotas
are managed by the provider, not bypassed by this service. Configure call limits
and requests per minute to fit the account's quota.

Provider references, checked October 9, 2026:
[DeepSeek chat API](https://api-docs.deepseek.com/api/create-chat-completion/),
[DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/),
[OpenRouter limits](https://openrouter.ai/docs/api_reference/limits).

## Interpretation and evidence

`issues.json` contains canonical, directional policy propositions such as
"Strengthen legal protections for residential tenants." These are narrower than
the initial keyword topic buckets. The taxonomy is versioned with the prompt;
changing the prompt, taxonomy, input evidence, model endpoint, model or output
settings changes the cache key.

Each model response identifies the decision type and any supported policy issue.
It explains the effects of YEA and NAY separately: rejection of an amendment is
not automatically opposition to the underlying bill or support for the inverse
policy. It cites exact quotes from the supplied transcript and can return no
issue interpretations. Source text is treated as untrusted data in the prompt.

Responses are rejected for incorrect decision IDs, invented issue IDs, invalid
effects, missing explanations, and quotes not present in the supplied source.
Truncation, refusal and invalid JSON are explicit failures. Exact quotations
validate evidence presence, not whether the model reasoned correctly; semantic
findings remain `machine_generated_needs_review`. The model cannot approve a
candidate identity match or invent a platform comparison.

A source review can quarantine an interpretation by writing
`reviews/<cache-key>.json` alongside `results/`, containing `cache_key`,
`status: "rejected"`, and a nonempty `reason`. The original response is preserved.
Rejected outputs are excluded from summaries and are not automatically retried
with identical inputs. Recompute offline after reviewing; a changed prompt,
source or model creates a new cache key requiring a fresh assessment.

## Candidate patterns

- Candidate votes use the model's effect for the actual recorded position.
- Policy/amendment interpretations require clear evidence to count directionally.
  Procedural votes, first readings, omnibus decisions, and limited or unclear
  interpretations remain non-directional, even when a model suggests otherwise.
- Repeated stages of a bill in the same parliamentary session count as one event.
  Contradictory directions within an event are mixed. Bill numbers are scoped to
  sessions; explicit motions without a bill number group by exact subject.
- Fewer than three informative distinct events give `insufficient_evidence`.
  Three consistently supporting/opposing events can give a suggested stance;
  conflicting events give a mixed record. Counts and dates always accompany the
  finding. This threshold is a transparent product heuristic, not calibrated
  statistical confidence.
- Other-action interpretations are retained as context but do not count as
  candidate votes or establish a voting stance.
- Records are correlated through bills, party discipline and political context.
  No binomial significance claims, ideology scores or personal-motivation claims
  are produced. Dates are preserved so a later view can show changes over time.
- Platform alignment remains `not_assessed`: it requires separately verified,
  dated commitments, with party commitments distinguished from personal ones.

Normalized research can include unconfirmed attribution leads and labels that
scope explicitly. The curated/public projection uses only reviewed candidate
attributions. Revoked identity attribution or changed input records invalidate
embedded findings on the next profile build. All source quotes and action IDs
remain available for inspection. Profiles carry an optional `issue_analysis`
object. Candidate pages display issue patterns, distinct voting-event counts,
coverage and expandable source evidence, marked as AI interpretations requiring
review. The policy-topic filter applies to both issue findings and the record
list. Platform alignment remains explicitly unassessed.

## Storage and usage

- `storage/normalized/analysis/<election-id>/jobs/`: reproducible model inputs.
- `results/`: validated, hashed interpretations and model/usage provenance.
- `attempts/`: failures without secrets or raw provider error bodies.
- `reviews/`: explicit source-review rejections keyed to the exact interpretation.
- `candidates/`: candidate findings including unconfirmed research leads.
- `runs/` and `latest-run.json`: selection, call counts, cache hits, errors and usage.
- `storage/curated/datasets/analysis/<election-id>/candidates/`: public-scope analyses.
- Existing polished political profiles embed current, validated public analyses.

All generated artifacts are local and Git-ignored; back them up with evidence.
Polished summaries do not require a model API or raw HTML at runtime. Ordinary
`build-data` rebuilds profiles without calling any model and includes current
analysis snapshots.

The estimate uses a character-based input-token range and the configured maximum
output tokens. It is a planning estimate, not a guaranteed spend ceiling. Actual
provider usage is recorded separately, including usage on rejected responses when
reported. Configured prices default to Flash peak cache-miss rates ($0.30 input,
$1.20 output per million tokens, checked October 9, 2026); cache discounts and
peak/off-peak changes can make actual bills lower. Unreported failed requests and
HTTP retries can make actual bills differ. Rate-limit settings and output caps
are explicit. Thinking is disabled in the default DeepSeek pilot to bound usage;
quality must be checked before deciding whether to enable it.

The offline test suite covers shared-decision caching, candidate-attribution
filtering, repeated bill stages, minimum evidence, procedural/omnibus exclusions,
invented citations, stale sources, call limits and endpoint response handling.
Those tests establish pipeline behavior, not model accuracy. A manually assessed
sample of real decisions is still required before treating suggested stances as
reliable judgments.

## Initial pilot — October 9, 2026

The collected roster has 784 shared analysis jobs: 327 voting decisions and 457
other-action excerpts. Two 12-call Richmond Centre trials each returned 12
schema-valid, source-quoted responses without endpoint errors. Together they used
45,812 reported input tokens and 5,808 output tokens, approximately $0.021 at the
configured conservative rates. Actual provider charges may differ.

Source inspection found an overclaim: changing issuance of a zero-emission
vehicle credit from sale to registration does not by itself establish stronger
climate policy. A more explicit prompt still produced this inference. The current
interpretation was therefore quarantined with a rejection review. The remaining
pilot issue evidence is insufficient for any suggested candidate stance.
Cached outputs were then applied across the roster offline. This is a partial
pilot, not completed analysis of all collected records. A full uncached pass has
a planning estimate of approximately $3.2 with the default output cap; accuracy
review and better operative policy evidence are more pressing than token cost.

## Full roster run — October 9, 2026

All 784 shared jobs were processed. There are 780 usable cached interpretations
and four source-review rejections: one administrative vehicle-credit change and
three bill-title-only direction claims. Seven invalid model outputs were retried;
none remain outstanding. Rejected interpretations are preserved for audit and
excluded from summaries.

The full run beyond the earlier pilots made 779 calls, including retries, and
reported 1,389,316 input tokens and 178,514 output tokens. At the configured
conservative rates this is approximately $0.631, excluding the earlier $0.021
pilots. Provider billing may differ. Usage includes the 35 successful calls saved
before the sequential run was interrupted, recovered from their result metadata.

Analyses were rebuilt for all 355 candidates. The normalized research projection
contains 1,125 issue findings, including unconfirmed candidate-attribution leads.
Only Henry Yao currently has reviewed action attributions in the public dataset.
His 105 published votes produce 101 usable record interpretations and 13 issue
categories, all `insufficient_evidence`; four votes correspond to quarantined
interpretations. Other candidates' possible matches remain excluded until
attribution review. These coverage limits are displayed on candidate pages.

The client view shows event counts and expandable quoted evidence, with topic
filtering and explicit AI-review and platform-alignment labels. Local tests and
desktop/mobile browser checks cover rendering, attribution gates, source details,
filters, pagination, loading failure and retry.
