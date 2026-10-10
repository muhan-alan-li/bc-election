import { SourceLink } from '../SourceLink.jsx';
import { topicLabel } from '../../helpers/political.js';

export const patternLabels = {
    insufficient_evidence: 'Insufficient evidence',
    evidence_suggests_support: 'Record suggests support',
    evidence_suggests_opposition: 'Record suggests opposition',
    mixed_record: 'Mixed record',
    inconclusive: 'Inconclusive',
};

export function IssuePatterns({ profile, topic = 'all' }) {
    const analysis = profile?.issue_analysis;
    if (!analysis || analysis.coverage?.scope !== 'reviewed_attributions') {
        return (
            <section
                class="issue-patterns"
                aria-label="Patterns across the record"
            >
                <h2>Patterns across the record</h2>
                <p class="record-review">
                    Issue analysis is not yet available for this candidate.
                </p>
            </section>
        );
    }
    const coverage = analysis.coverage;
    const actions = new Map(
        profile.actions.map((action) => [action.id, action]),
    );
    const findings = analysis.issue_findings
        .filter((finding) => topic === 'all' || finding.topic === topic)
        .sort(
            (a, b) =>
                b.informative_event_groups - a.informative_event_groups ||
                a.proposition.localeCompare(b.proposition),
        );
    return (
        <section class="issue-patterns" aria-label="Patterns across the record">
            <div class="issue-heading">
                <h2>Patterns across the record</h2>
                <span class="analysis-label">
                    AI interpretation · Needs review
                </span>
            </div>
            <p class="record-review">
                {coverage.interpreted_actions} of {coverage.eligible_actions}{' '}
                published records analyzed
                {coverage.pending_actions > 0 &&
                    ` · ${coverage.pending_actions} without usable interpretations`}
                . Repeated votes on one bill count as one event. A suggested
                stance requires at least three informative events. Missing or
                unclear evidence does not establish a position.
            </p>
            {findings.length ? (
                <div class="issue-grid">
                    {findings.map((finding) => (
                        <article class="issue-card" key={finding.id}>
                            <div class="issue-heading">
                                <span class="issue-topic">
                                    {topicLabel(finding.topic)}
                                </span>
                                <strong
                                    class={`issue-status status-${finding.status}`}
                                >
                                    {patternLabels[finding.status] ||
                                        'Inconclusive'}
                                </strong>
                            </div>
                            <h3>{finding.proposition}</h3>
                            <dl class="issue-counts">
                                <div>
                                    <dt>Supporting</dt>
                                    <dd>{finding.counts.supports}</dd>
                                </div>
                                <div>
                                    <dt>Opposing</dt>
                                    <dd>{finding.counts.opposes}</dd>
                                </div>
                                <div>
                                    <dt>Mixed</dt>
                                    <dd>{finding.counts.mixed}</dd>
                                </div>
                                <div>
                                    <dt>Unclear</dt>
                                    <dd>{finding.counts.unclear}</dd>
                                </div>
                            </dl>
                            <p class="issue-date">
                                Distinct voting events
                                {finding.date_range.from &&
                                    ` · ${finding.date_range.from} to ${finding.date_range.to}`}
                            </p>
                            <details class="issue-evidence">
                                <summary>
                                    Inspect evidence ({finding.evidence.length}{' '}
                                    {finding.evidence.length === 1
                                        ? 'record'
                                        : 'records'}
                                    )
                                </summary>
                                {finding.evidence.map((entry) => {
                                    const action = actions.get(entry.action_id);
                                    return (
                                        <div
                                            class="issue-evidence-entry"
                                            key={entry.action_id}
                                        >
                                            <p>
                                                <strong>
                                                    {action?.subject ||
                                                        'Political action'}
                                                </strong>
                                            </p>
                                            <p class="issue-date">
                                                {entry.date} ·{' '}
                                                {action?.stage ||
                                                    action?.record_type}
                                                {action?.position &&
                                                    ` · Recorded vote: ${action.position.toUpperCase()}`}
                                            </p>
                                            <p class="issue-date">
                                                {entry.direction === 'supports'
                                                    ? 'Supporting evidence'
                                                    : entry.direction ===
                                                        'opposes'
                                                      ? 'Opposing evidence'
                                                      : 'Does not establish a direction'}{' '}
                                                · {entry.evidence_strength}{' '}
                                                source evidence
                                            </p>
                                            <p>{entry.explanation}</p>
                                            {entry.citations.map(
                                                (citation, index) => (
                                                    <div key={index}>
                                                        <blockquote class="source-excerpt">
                                                            {citation.quote}
                                                        </blockquote>
                                                        <SourceLink
                                                            href={
                                                                citation.source
                                                                    ?.url
                                                            }
                                                        >
                                                            Source transcript
                                                        </SourceLink>
                                                    </div>
                                                ),
                                            )}
                                        </div>
                                    );
                                })}
                            </details>
                        </article>
                    ))}
                </div>
            ) : (
                <p class="issue-empty">
                    {coverage.eligible_actions === 0
                        ? 'No candidate-attributed records are ready for issue analysis. Attribution review is still needed; this does not imply a lack of political experience.'
                        : topic !== 'all'
                          ? 'No supported issue interpretations in this topic yet.'
                          : 'The analyzed records do not yet provide supported issue interpretations.'}
                </p>
            )}
            <p class="issue-alignment">
                <strong>Platform alignment has not been assessed.</strong> These
                patterns describe collected actions. Comparing them with
                promises requires verified commitments and their dates.
            </p>
        </section>
    );
}
