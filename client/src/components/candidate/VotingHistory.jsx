import { useState } from 'preact/hooks';
import { dateLabel } from '../../helpers/labels.js';
import { SourceLink } from '../SourceLink.jsx';

export function VotingHistory({ votes, coverage, candidateName }) {
    const [voteLimit, setVoteLimit] = useState(10);

    return (
        <section class="records-section">
            <h4>
                Voting history{' '}
                {votes.length > 0 && (
                    <span class="count">{votes.length} indexed votes</span>
                )}
            </h4>
            <p class="note">
                {votes.length
                    ? 'These member-index entries show named positions. Exact questions and outcomes await transcript review. Different stages of a bill are separate entries.'
                    : 'Voting history has not yet been established for this candidate. This does not mean they have no voting record.'}
            </p>
            {votes.length > 0 && (
                <>
                    <div
                        class="table-scroll"
                        role="region"
                        aria-label={`Voting history for ${candidateName}`}
                        tabIndex="0"
                    >
                        <table>
                            <thead>
                                <tr>
                                    <th scope="col">Date</th>
                                    <th scope="col">Subject and stage</th>
                                    <th scope="col">Position</th>
                                    <th scope="col">Source</th>
                                </tr>
                            </thead>
                            <tbody>
                                {votes.slice(0, voteLimit).map((vote) => (
                                    <tr key={vote.id}>
                                        <td class="date">
                                            {dateLabel(vote.date)}
                                        </td>
                                        <td>
                                            {vote.subject}
                                            <small>
                                                {vote.stage} ·{' '}
                                                {vote.member_label}
                                            </small>
                                        </td>
                                        <td>
                                            {vote.position === 'yea'
                                                ? 'Yea'
                                                : 'Nay'}
                                        </td>
                                        <td>
                                            <SourceLink
                                                href={vote.transcript_url}
                                            >
                                                Transcript
                                            </SourceLink>
                                            <br />
                                            <SourceLink href={vote.source?.url}>
                                                Index
                                            </SourceLink>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {voteLimit < votes.length && (
                        <button
                            class="secondary"
                            onClick={() => setVoteLimit((limit) => limit + 20)}
                        >
                            Show more votes ({votes.length - voteLimit}{' '}
                            remaining)
                        </button>
                    )}
                </>
            )}
            {coverage?.voting?.errors?.length > 0 && (
                <p class="note">
                    Some voting sources could not be collected. Coverage is
                    incomplete.
                </p>
            )}
        </section>
    );
}
