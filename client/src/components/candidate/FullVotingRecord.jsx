import { useState } from 'preact/hooks';
import { Pagination } from '../Pagination.jsx';
import { SourceLink } from '../SourceLink.jsx';
import { dateLabel } from '../../helpers/labels.js';
import { filterActions } from '../../helpers/political.js';

export function FullVotingRecord({ actions = [] }) {
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const pageSize = 10;
    const filtered = filterActions(actions, { type: 'votes', query });
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const currentPage = Math.min(page, pages);
    const start = (currentPage - 1) * pageSize;
    const visible = filtered.slice(start, start + pageSize);
    return (
        <details class="alignment-archive">
            <summary>Full voting record</summary>
            <label for="archive-search">Find a bill or amendment</label>
            <input
                id="archive-search"
                type="search"
                placeholder="Search the voting record"
                value={query}
                onInput={(event) => {
                    setQuery(event.currentTarget.value);
                    setPage(1);
                }}
            />
            <p class="record-results" aria-live="polite">
                {filtered.length
                    ? `Showing ${start + 1}–${start + visible.length} of ${filtered.length} votes`
                    : 'No matching votes'}
            </p>
            <div
                class="table-scroll compact-table alignment-archive-table"
                role="region"
                aria-label="Full voting record"
                tabIndex={0}
            >
                <table>
                    <thead>
                        <tr>
                            <th scope="col">Date</th>
                            <th scope="col">Bill or amendment</th>
                            <th scope="col">Stage</th>
                            <th scope="col">Vote</th>
                            <th scope="col">Sources</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visible.map((action) => (
                            <tr key={action.id}>
                                <td>
                                    <time dateTime={action.date || undefined}>
                                        {dateLabel(action.date)}
                                    </time>
                                </td>
                                <td>
                                    {action.subject || 'Parliamentary action'}
                                </td>
                                <td>
                                    {{
                                        '1R': 'First reading',
                                        '2R': 'Second reading',
                                        '3R': 'Third reading',
                                    }[action.stage] ||
                                        action.stage ||
                                        'Not established'}
                                    {action.vote_capacity ===
                                        'chair_casting_vote' && (
                                        <span class="alignment-evidence-meta">
                                            Casting vote as chair
                                        </span>
                                    )}
                                </td>
                                <td>
                                    <span
                                        class={`vote-position ${action.position === 'yea' ? 'vote-yea' : action.position === 'nay' ? 'vote-nay' : ''}`}
                                    >
                                        {{ yea: 'Yea', nay: 'Nay' }[
                                            action.position
                                        ] || 'Position not established'}
                                    </span>
                                </td>
                                <td class="voting-source-cell">
                                    <div class="voting-source-links">
                                        <SourceLink
                                            href={
                                                action.transcript_url ||
                                                action.source?.url
                                            }
                                        >
                                            Transcript
                                        </SourceLink>
                                        <SourceLink href={action.source?.url}>
                                            Voting index
                                        </SourceLink>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {!filtered.length && (
                            <tr>
                                <td colSpan={5}>No votes to display.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            {filtered.length > 0 && (
                <Pagination
                    currentPage={currentPage}
                    pages={pages}
                    onPageChange={setPage}
                    label="Voting record pages"
                />
            )}
        </details>
    );
}
