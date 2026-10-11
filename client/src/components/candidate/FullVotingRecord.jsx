import { paginate } from '../../helpers/pagination.js';
import { VoteBadge } from './VoteBadge.jsx';
import { stageLabel } from '../../helpers/political.js';
import { Table } from '../ui/Table.jsx';
import { useState } from 'preact/hooks';
import { Pagination } from '../ui/Pagination.jsx';
import { SourceLink } from '../ui/SourceLink.jsx';
import { dateLabel } from '../../helpers/labels.js';
import { filterActions } from '../../helpers/political.js';

const columns = [
    { label: 'Date' },
    { label: 'Bill or amendment' },
    { label: 'Stage' },
    { label: 'Vote' },
    { label: 'Sources' },
];

export function FullVotingRecord({ actions = [] }) {
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const pageSize = 10;
    const filtered = filterActions(actions, { type: 'votes', query });
    const {
        pages,
        currentPage,
        start,
        rows: visible,
    } = paginate(filtered, page, pageSize);
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
            <Table
                label="Full voting record"
                columns={columns}
                class="alignment-archive-table"
                compact
                empty={!filtered.length}
                emptyMessage="No votes to display."
            >
                {visible.map((action) => (
                    <tr key={action.id}>
                        <td>
                            <time dateTime={action.date || undefined}>
                                {dateLabel(action.date)}
                            </time>
                        </td>
                        <td>{action.subject || 'Parliamentary action'}</td>
                        <td>
                            {stageLabel(action.stage) || 'Not established'}
                            {action.vote_capacity === 'chair_casting_vote' && (
                                <span class="alignment-evidence-meta">
                                    Casting vote as chair
                                </span>
                            )}
                        </td>
                        <td>
                            <VoteBadge position={action.position} />
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
            </Table>
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
