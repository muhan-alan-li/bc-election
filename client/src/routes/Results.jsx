import { Table } from '../components/ui/Table.jsx';
import { SourceLink } from '../components/ui/SourceLink.jsx';
import { SeatBar } from '../components/results/SeatBar.jsx';
import {
    formatDateRange,
    formatNumber,
    formatPercent,
    seatHolders,
} from '../helpers/results.js';

const columns = [
    { label: 'Party' },
    { label: 'Leader' },
    { label: 'Seats' },
    { label: 'Vote share' },
    { label: 'Votes' },
];

export function Results({ results }) {
    const { election, parties } = results;
    const held = seatHolders(parties);
    const others = parties.filter(
        (party) => party.seats === 0 && party.votes > 0,
    );
    const otherVotes = others.reduce((sum, party) => sum + party.votes, 0);
    const otherShare = others.reduce((sum, party) => sum + party.vote_share, 0);
    const turnout = election.turnout || {};
    const finalCount = election.final_count;
    const source = election.source;

    return (
        <article class="results-page">
            <SeatBar
                parties={held}
                seats={election.seats}
                majority={election.majority}
            />

            {turnout.percent > 0 && (
                <p class="results-caption">
                    Turnout {formatPercent(turnout.percent)}
                    {turnout.votes_considered
                        ? ` · ${formatNumber(turnout.votes_considered)} ballots counted`
                        : ''}
                    {turnout.registered_voters
                        ? ` from ${formatNumber(turnout.registered_voters)} registered voters`
                        : ''}
                    .
                </p>
            )}

            <Table
                label="Party results"
                columns={columns}
                tableClass="party-results-table"
            >
                {held.map((party) => (
                    <tr key={party.id}>
                        <th scope="row">
                            <span
                                class="party-swatch"
                                style={{ background: party.color }}
                                aria-hidden="true"
                            />
                            {party.name}
                            {party.role && (
                                <span class="role-tag">{party.role}</span>
                            )}
                        </th>
                        <td data-label="Leader">{party.leader || '—'}</td>
                        <td data-label="Seats">{party.seats}</td>
                        <td data-label="Vote share">
                            {formatPercent(party.vote_share)}
                        </td>
                        <td data-label="Votes">{formatNumber(party.votes)}</td>
                    </tr>
                ))}
                {others.length > 0 && (
                    <tr class="party-results-other">
                        <th scope="row">Other parties</th>
                        <td data-label="Leader">—</td>
                        <td data-label="Seats">0</td>
                        <td data-label="Vote share">
                            {formatPercent(otherShare)}
                        </td>
                        <td data-label="Votes">{formatNumber(otherVotes)}</td>
                    </tr>
                )}
            </Table>

            <p class="results-meta">
                {election.status_label || 'Initial count'}
                {election.as_of ? `, current as of ${election.as_of}` : ''}.
                {finalCount
                    ? ` Final count runs ${formatDateRange(finalCount.start, finalCount.end)}.`
                    : ''}{' '}
                {source && (
                    <SourceLink href={source.url}>
                        Elections BC results
                    </SourceLink>
                )}
            </p>
        </article>
    );
}
