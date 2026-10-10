import { useState } from 'preact/hooks';
import pillars from '../../../../ingestion/election/analysis/pillars.json';
import { SourceLink } from '../SourceLink.jsx';
import { ActionRecord } from './ActionRecord.jsx';
import { filterActions } from '../../helpers/political.js';

export const alignmentLabels = {
    supports_commitment: 'Supports the promise',
    consistent_with_later_position: 'Consistent with later position',
    potential_tension: 'Potential tension',
    inconclusive: 'Alignment inconclusive',
};

function formatDate(value) {
    return new Date(`${value}T12:00:00`).toLocaleDateString('en-CA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

function VoteArchive({ actions }) {
    const [query, setQuery] = useState('');
    const [limit, setLimit] = useState(10);
    const filtered = filterActions(actions, { query });
    return (
        <details class="alignment-archive">
            <summary>Browse the voting record ({actions.length} votes)</summary>
            <label for="archive-search">Find a bill or amendment</label>
            <input
                id="archive-search"
                type="search"
                placeholder="Search the voting record"
                value={query}
                onInput={(event) => {
                    setQuery(event.currentTarget.value);
                    setLimit(10);
                }}
            />
            <p class="record-results" aria-live="polite">
                {filtered.length} matching votes
            </p>
            <div class="action-list">
                {filtered.slice(0, limit).map((action) => (
                    <ActionRecord key={action.id} action={action} />
                ))}
            </div>
            {limit < filtered.length && (
                <button
                    type="button"
                    class="secondary more-records"
                    onClick={() => setLimit((value) => value + 10)}
                >
                    Show more votes
                </button>
            )}
        </details>
    );
}

export function PillarPanel({ analysis, pillar }) {
    const findings = analysis.findings.filter(
        (finding) => finding.pillar_id === pillar.id,
    );
    const unassessed = analysis.unassessed_commitments.filter(
        (item) => item.pillar_id === pillar.id,
    );
    const published = analysis.pillars?.find((item) => item.id === pillar.id);
    return (
        <>
            <header class="alignment-pillar-intro">
                <h3>{pillar.question}</h3>
                <p>{pillar.description}</p>
                {published?.takeaway && (
                    <p class="alignment-takeaway">{published.takeaway}</p>
                )}
            </header>
            {!findings.length && (
                <div class="alignment-empty">
                    <h3>No published comparisons yet</h3>
                    <p>
                        No reviewed action-to-platform comparisons are available
                        here yet. We need a specific platform statement and a
                        substantive action, checked against the bill or
                        amendment text, before drawing a conclusion.
                    </p>
                </div>
            )}
            <div class="alignment-findings">
                {findings.map((finding) => {
                    const platformSource = finding.citations.find(
                        (citation) => citation.role === 'platform',
                    );
                    return (
                        <article class="alignment-finding" key={finding.id}>
                            <div class="alignment-finding-heading">
                                <span
                                    class={`alignment-status alignment-status-${finding.status}`}
                                >
                                    {alignmentLabels[finding.status]}
                                </span>
                                <h3>{finding.headline}</h3>
                            </div>
                            <div class="alignment-promise">
                                <span class="alignment-label">
                                    {finding.commitment.owner} ·{' '}
                                    {finding.commitment.kind === 'promise'
                                        ? 'Promise'
                                        : 'Position'}{' '}
                                    ·{' '}
                                    {finding.commitment.date_status ===
                                    'observed_at_capture'
                                        ? 'Observed '
                                        : ''}
                                    {formatDate(finding.commitment.date)}
                                </span>
                                <p>{finding.commitment.summary}</p>
                                <SourceLink href={platformSource?.source.url}>
                                    Campaign source
                                </SourceLink>
                            </div>
                            <ul class="alignment-actions">
                                {finding.actions.map((action) => (
                                    <li key={action.id}>
                                        <strong>
                                            {action.position === 'yea'
                                                ? 'Voted for'
                                                : 'Voted against'}
                                        </strong>{' '}
                                        {action.stage === '2R'
                                            ? 'second reading'
                                            : action.stage === '3R'
                                              ? 'final passage'
                                              : action.stage}
                                        <span>
                                            {formatDate(action.date)} ·{' '}
                                            {action.subject}
                                        </span>
                                        <SourceLink
                                            href={action.transcript_url}
                                        >
                                            Vote transcript
                                        </SourceLink>
                                    </li>
                                ))}
                            </ul>
                            <p class="alignment-effect">
                                {finding.policy_effect}
                            </p>
                            <p class="alignment-assessment">
                                {finding.assessment}
                            </p>
                            <details class="alignment-context">
                                <summary>
                                    Trade-offs and supporting sources
                                </summary>
                                <p>
                                    <strong>Other side of the decision:</strong>{' '}
                                    {finding.counterargument}
                                </p>
                                <p>
                                    <strong>
                                        What this does not establish:
                                    </strong>{' '}
                                    {finding.limits}
                                </p>
                                {finding.citations.map((citation, index) => (
                                    <figure key={index}>
                                        <blockquote>
                                            {citation.quote}
                                        </blockquote>
                                        <figcaption>
                                            <SourceLink
                                                href={citation.source.url}
                                            >
                                                {citation.source.title}
                                            </SourceLink>
                                        </figcaption>
                                    </figure>
                                ))}
                            </details>
                        </article>
                    );
                })}
            </div>
            {unassessed.length > 0 && (
                <aside class="alignment-unassessed">
                    <h3>What the record cannot answer yet</h3>
                    {unassessed.map((commitment) => (
                        <p key={commitment.id}>
                            <strong>{commitment.summary}</strong>{' '}
                            {commitment.reason}{' '}
                            <SourceLink href={commitment.source.url}>
                                {commitment.owner} ·{' '}
                                {commitment.date_status ===
                                'observed_at_capture'
                                    ? 'Observed '
                                    : ''}
                                {formatDate(commitment.date)}
                            </SourceLink>
                        </p>
                    ))}
                </aside>
            )}
        </>
    );
}

function PillarGuide({ analysis }) {
    const [active, setActive] = useState(
        () =>
            pillars.find((pillar) =>
                analysis.findings.some(
                    (finding) => finding.pillar_id === pillar.id,
                ),
            )?.id || pillars[0].id,
    );
    const pillar = pillars.find((item) => item.id === active);
    const prefix = `alignment-${analysis.id}`;
    return (
        <>
            <div
                class="alignment-tabs"
                role="tablist"
                aria-label="Election pillars"
                onKeyDown={(event) => {
                    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
                    if (!keys.includes(event.key)) return;
                    event.preventDefault();
                    const index = pillars.findIndex(
                        (item) => item.id === active,
                    );
                    const next =
                        event.key === 'Home'
                            ? 0
                            : event.key === 'End'
                              ? pillars.length - 1
                              : (index +
                                    (event.key === 'ArrowRight' ? 1 : -1) +
                                    pillars.length) %
                                pillars.length;
                    setActive(pillars[next].id);
                    event.currentTarget
                        .querySelectorAll('[role="tab"]')
                        [next].focus();
                }}
            >
                {pillars.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        role="tab"
                        id={`${prefix}-tab-${item.id}`}
                        aria-controls={`${prefix}-panel-${item.id}`}
                        aria-selected={item.id === active}
                        tabIndex={item.id === active ? 0 : -1}
                        onClick={() => setActive(item.id)}
                    >
                        {item.label}
                    </button>
                ))}
            </div>
            {pillars.map((item) => (
                <div
                    key={item.id}
                    role="tabpanel"
                    id={`${prefix}-panel-${item.id}`}
                    aria-labelledby={`${prefix}-tab-${item.id}`}
                    hidden={item.id !== active}
                    tabIndex={0}
                >
                    {item.id === active && (
                        <PillarPanel analysis={analysis} pillar={pillar} />
                    )}
                </div>
            ))}
        </>
    );
}

export function PlatformAlignment({ profile }) {
    const analysis = profile?.alignment_analysis;
    if (analysis?.review_status !== 'source_checked') return null;
    return (
        <section class="platform-alignment" aria-labelledby="alignment-title">
            <header class="alignment-intro">
                <p class="alignment-eyebrow">
                    {profile.ballot_name} · Platform and record
                </p>
                <h2 id="alignment-title">
                    Do their actions match the platform?
                </h2>
                <p class="alignment-scope">
                    Explore specific promises and political choices by issue.
                    Party promises and positions are identified below; they are
                    not treated as personally authored promises. Each finding
                    shows the dates and limits of the available record.
                </p>
            </header>
            <PillarGuide key={profile.id} analysis={analysis} />
            <details class="alignment-method">
                <summary>How these comparisons were selected</summary>
                <p>{analysis.scope}</p>
                <p>
                    {analysis.coverage.selected_votes} named votes were selected
                    from {analysis.coverage.indexed_votes} indexed votes, across{' '}
                    {analysis.coverage.distinct_legislation} bills. Selection
                    pairs a specific action with bill or amendment provisions
                    and a sourced campaign position. Supporting evidence and
                    possible tensions are both included.
                </p>
                <p>
                    Routine procedure and package-wide budget approvals do not
                    establish alignment with individual promises. Other
                    substantive votes remain unassessed outside the selected
                    comparisons; their omission is not evidence of alignment.
                </p>
                <p>
                    An earlier action can be consistent with a later position;
                    it cannot deliver a later promise. Votes on the same bill
                    are related decisions, not independent proof of a recurring
                    stance. These findings describe choices, not motives or
                    predictions of future performance.
                </p>
                <p>
                    AI assisted the comparisons; a separate AI-assisted source
                    check corrected and selected the published text. Human
                    editorial review has not been recorded.
                </p>
            </details>
            <VoteArchive actions={profile.actions} />
        </section>
    );
}
