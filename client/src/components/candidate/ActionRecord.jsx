import { dateLabel } from '../../helpers/labels.js';
import { actionLabel, isVote, topicLabel } from '../../helpers/political.js';
import { SourceLink } from '../SourceLink.jsx';

const stageLabel = (stage) =>
    ({ '1R': 'First reading', '2R': 'Second reading', '3R': 'Third reading' })[
        stage
    ] || stage;

export function ActionRecord({ action }) {
    const vote = isVote(action);
    const context = action.transcript_context;
    const position =
        { yea: 'Yea', nay: 'Nay' }[action.position] ||
        'Position not established';
    return (
        <article class="action-record">
            <div class="action-meta">
                <span>{actionLabel(action.record_type)}</span>
                <time dateTime={action.date || undefined}>
                    {dateLabel(action.date)}
                </time>
                {vote && (
                    <span
                        class={`vote-position ${action.position === 'yea' ? 'vote-yea' : action.position === 'nay' ? 'vote-nay' : ''}`}
                    >
                        {position}
                    </span>
                )}
            </div>
            <h3 class="action-title">
                {action.subject || 'Parliamentary action'}
            </h3>
            {vote ? (
                <p class="action-stage">
                    {stageLabel(action.stage)}
                    {action.vote_capacity === 'chair_casting_vote' &&
                        ' · Casting vote as chair'}
                </p>
            ) : (
                <p>{action.text}</p>
            )}
            <div class="record-topics" aria-label="Suggested policy topics">
                {(action.topics || []).map((topic) => (
                    <span key={topic}>{topicLabel(topic)}</span>
                ))}
            </div>
            <div class="action-sources">
                <SourceLink href={action.transcript_url || action.source?.url}>
                    Transcript
                </SourceLink>
                {vote && (
                    <SourceLink href={action.source?.url}>
                        Voting index
                    </SourceLink>
                )}
            </div>
            <details class="action-evidence">
                <summary>Decision and source details</summary>
                {vote && (
                    <>
                        <dl>
                            <div>
                                <dt>Recorded member</dt>
                                <dd>{action.member_label}</dd>
                            </div>
                            <div>
                                <dt>Suggested question</dt>
                                <dd>
                                    {context?.question ||
                                        'The exact question still needs source review.'}
                                </dd>
                            </div>
                            <div>
                                <dt>Suggested outcome</dt>
                                <dd>
                                    {context?.outcome ||
                                        'The outcome still needs source review.'}
                                </dd>
                            </div>
                        </dl>
                        <p class="record-review">
                            Transcript details are extracted evidence awaiting
                            review. Separate bill stages and amendments are
                            separate decisions.
                        </p>
                    </>
                )}
                {context?.excerpt && (
                    <details>
                        <summary>Read the transcript excerpt</summary>
                        <blockquote class="source-excerpt">
                            {context.excerpt}
                        </blockquote>
                    </details>
                )}
                {action.transcript_source?.retrieved_at && (
                    <p class="record-review">
                        Transcript collected{' '}
                        {dateLabel(action.transcript_source.retrieved_at)}.
                    </p>
                )}
            </details>
        </article>
    );
}
