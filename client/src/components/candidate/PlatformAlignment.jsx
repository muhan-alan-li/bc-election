import { useState } from 'preact/hooks';
import pillars from '../../../../ingestion/election/analysis/pillars.json';
import { SourceLink } from '../SourceLink.jsx';
import { PolicyCard } from '../platform/PolicyCard.jsx';
import { PolicyDialog } from '../platform/PolicyDialog.jsx';
import { candidateAlignmentNotes } from '../../content/candidate-alignment-notes.js';
import { candidateFindingCopy } from '../../content/candidate-finding-copy.js';
import { ActionRecord } from './ActionRecord.jsx';
import { filterActions } from '../../helpers/political.js';

export const alignmentLabels = {
    supports_commitment: 'Supports the promise',
    consistent_with_later_position: 'Consistent with later position',
    potential_tension: 'Potential tension',
    inconclusive: 'Alignment inconclusive',
};

function findingAlignmentTag(status) {
    if (
        ['supports_commitment', 'consistent_with_later_position'].includes(
            status,
        )
    )
        return 'aligned';
    if (status === 'potential_tension') return 'against';
    return 'inconclusive';
}

export function pillarAlignmentTag(analysis, pillarId) {
    const statuses = analysis.findings
        .filter((finding) => finding.pillar_id === pillarId)
        .map((finding) => findingAlignmentTag(finding.status));
    return statuses.length && statuses.every((status) => status === statuses[0])
        ? statuses[0]
        : 'inconclusive';
}

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

function FindingContent({ finding, copy }) {
    const platformSource = finding.citations.find(
        (citation) => citation.role === 'platform',
    );
    return (
        <>
            <div class="alignment-promise">
                <h4>Party position</h4>
                <p>{finding.commitment.summary}</p>
                <div class="alignment-label">
                    {finding.commitment.owner} ·{' '}
                    {finding.commitment.kind === 'promise'
                        ? 'Promise'
                        : 'Position'}{' '}
                    ·{' '}
                    {finding.commitment.date_status === 'observed_at_capture'
                        ? 'Observed '
                        : ''}
                    {formatDate(finding.commitment.date)}
                    {' · '}
                    <SourceLink href={platformSource?.source.url}>
                        Campaign source
                    </SourceLink>
                </div>
            </div>
            <div class="alignment-conclusion">
                <h4>How it aligns</h4>
                <p
                    class={`alignment-verdict alignment-verdict-${finding.status}`}
                >
                    {alignmentLabels[finding.status]}
                </p>
                <p class="alignment-assessment">
                    {copy?.summary || finding.assessment}
                </p>
                {copy?.analysis && (
                    <p class="alignment-assessment">{copy.analysis}</p>
                )}
            </div>
            <FindingEvidence finding={finding} />
        </>
    );
}

function FindingEvidence({ finding }) {
    return (
        <details class="alignment-evidence">
            <summary>Votes and sources</summary>
            <div
                class="alignment-evidence-table"
                tabIndex={0}
                role="region"
                aria-label="Votes and supporting sources"
            >
                <table>
                    <thead>
                        <tr>
                            <th scope="col">Record</th>
                            <th scope="col">Evidence</th>
                            <th scope="col">Source</th>
                        </tr>
                    </thead>
                    <tbody>
                        {finding.actions.map((action) => (
                            <tr key={action.id} class="alignment-evidence-vote">
                                <td>
                                    <strong>
                                        {action.position === 'yea'
                                            ? 'Voted for'
                                            : action.position === 'nay'
                                              ? 'Voted against'
                                              : 'Not established'}
                                    </strong>
                                    <span class="alignment-evidence-meta">
                                        {formatDate(action.date)}
                                    </span>
                                </td>
                                <td>
                                    {action.subject}
                                    <span class="alignment-evidence-meta">
                                        {action.stage === '2R'
                                            ? 'Second reading'
                                            : action.stage === '3R'
                                              ? 'Final passage'
                                              : action.stage}
                                    </span>
                                </td>
                                <td>
                                    <SourceLink href={action.transcript_url}>
                                        Vote transcript
                                    </SourceLink>
                                </td>
                            </tr>
                        ))}
                        {finding.citations.map((citation, index) => (
                            <tr
                                key={`citation-${index}`}
                                class="alignment-evidence-source"
                            >
                                <td>
                                    {citation.role === 'platform'
                                        ? 'Party position'
                                        : 'Supporting source'}
                                </td>
                                <td>
                                    <blockquote>{citation.quote}</blockquote>
                                </td>
                                <td>
                                    <SourceLink href={citation.source.url}>
                                        {citation.source.title}
                                    </SourceLink>
                                    {citation.source.publisher && (
                                        <span class="alignment-evidence-meta">
                                            {citation.source.publisher}
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p class="alignment-evidence-disclaimer">
                Votes show recorded decisions; they do not by themselves
                establish implementation or outcomes.
            </p>
        </details>
    );
}

export function PillarPanel({ analysis, pillar }) {
    const findings = analysis.findings.filter(
        (finding) => finding.pillar_id === pillar.id,
    );
    return (
        <>
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
                    const copy =
                        candidateFindingCopy[analysis.id]?.[finding.id];
                    return (
                        <details class="alignment-finding" key={finding.id}>
                            <summary>
                                <span class="alignment-finding-heading">
                                    <span>{finding.headline}</span>
                                    <span
                                        class={`alignment-item-tag alignment-item-tag-${findingAlignmentTag(finding.status)}`}
                                    >
                                        {findingAlignmentTag(finding.status)}
                                    </span>
                                </span>
                            </summary>
                            <div class="alignment-finding-content">
                                <FindingContent finding={finding} copy={copy} />
                            </div>
                        </details>
                    );
                })}
            </div>
        </>
    );
}

function PillarGuide({ analysis, profile }) {
    const [selected, setSelected] = useState(null);
    const name = profile.ballot_name?.split(' ')[0] || 'The candidate';
    const fallbackNotes = {
        aligned: `${name} has voted in support of the platform.`,
        against: `${name} has voted against the platform.`,
        inconclusive: `${name}’s record does not establish clear alignment.`,
    };
    return (
        <>
            <div class="policy-grid alignment-cards">
                {pillars.map((pillar) => (
                    <PolicyCard
                        key={pillar.id}
                        item={{
                            ...pillar,
                            topic: pillar.label,
                            summary: pillar.description,
                            alignmentTag: pillarAlignmentTag(
                                analysis,
                                pillar.id,
                            ),
                            alignmentNote:
                                candidateAlignmentNotes[profile.id]?.[
                                    pillar.id
                                ] ||
                                fallbackNotes[
                                    pillarAlignmentTag(analysis, pillar.id)
                                ],
                        }}
                        actionLabel={null}
                        onSelect={setSelected}
                    />
                ))}
            </div>
            {selected && (
                <PolicyDialog
                    title={selected.label}
                    eyebrow="Promises and actions"
                    color="var(--ink)"
                    closeLabel="Close promises and actions"
                    onClose={() => setSelected(null)}
                >
                    <PillarPanel analysis={analysis} pillar={selected} />
                </PolicyDialog>
            )}
        </>
    );
}

export function PlatformAlignment({ profile }) {
    const analysis = profile?.alignment_analysis;
    if (analysis?.review_status !== 'source_checked') return null;
    return (
        <details
            class="platform-alignment"
            style={{ '--party-color': 'var(--ink)' }}
            aria-labelledby="alignment-title"
            open
        >
            <summary id="alignment-title">Promises and actions</summary>
            <p class="alignment-scope">
                Compare campaign positions with recorded political choices,
                issue by issue.
            </p>
            <PillarGuide
                key={profile.id}
                analysis={analysis}
                profile={profile}
            />
            <details class="alignment-method">
                <summary>How these comparisons were selected</summary>
                <p>{analysis.scope}</p>
                <p>
                    Party promises and positions are identified in each
                    comparison; they are not treated as personally authored
                    promises. Each finding shows the dates and limits of the
                    available record.
                </p>
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
        </details>
    );
}
