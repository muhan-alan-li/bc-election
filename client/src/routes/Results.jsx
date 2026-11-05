import { Table } from '../components/ui/Table.jsx';
import { SourceLink } from '../components/ui/SourceLink.jsx';
import { SeatBar } from '../components/results/SeatBar.jsx';
import {
    formatDate,
    formatNumber,
    formatPercent,
    governmentParty,
    resultHeadline,
    resultStandfirst,
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
    const government = governmentParty(results);
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
            <p class="eyebrow">
                {election.title}
                {election.status_label ? ` · ${election.status_label}` : ''}
            </p>
            <h2 class="results-headline">{resultHeadline(results)}</h2>
            <p class="results-standfirst">{resultStandfirst(results)}</p>

            <SeatBar
                parties={held}
                seats={election.seats}
                majority={election.majority}
            />

            <div class="stat-grid">
                <div class="stat">
                    <strong>{election.seats}</strong>
                    <span>seats in the legislature</span>
                </div>
                <div class="stat">
                    <strong>{election.majority}</strong>
                    <span>seats for a majority</span>
                </div>
                <div class="stat">
                    <strong>{formatPercent(turnout.percent)}</strong>
                    <span>preliminary turnout</span>
                </div>
                <div class="stat">
                    <strong>{formatNumber(turnout.votes_considered)}</strong>
                    <span>votes counted</span>
                </div>
            </div>

            <section aria-labelledby="party-results-title">
                <h2 id="party-results-title">Seats and vote share</h2>
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
                            <td data-label="Leader">
                                <span>
                                    {party.leader || '—'}
                                    {party.leaderNote && (
                                        <span class="muted">
                                            {' '}
                                            · {party.leaderNote}
                                        </span>
                                    )}
                                </span>
                            </td>
                            <td data-label="Seats">{party.seats}</td>
                            <td data-label="Vote share">
                                {formatPercent(party.vote_share)}
                            </td>
                            <td data-label="Votes">
                                {formatNumber(party.votes)}
                            </td>
                        </tr>
                    ))}
                    {others.length > 0 && (
                        <tr class="party-results-other">
                            <th scope="row">
                                Other parties
                                <span class="role-tag">No seats</span>
                            </th>
                            <td data-label="Leader">—</td>
                            <td data-label="Seats">0</td>
                            <td data-label="Vote share">
                                {formatPercent(otherShare)}
                            </td>
                            <td data-label="Votes">
                                {formatNumber(otherVotes)}
                            </td>
                        </tr>
                    )}
                </Table>
            </section>

            <section class="results-notes" aria-label="About these results">
                <p class="note">
                    These are initial-count results published by Elections BC
                    {election.as_of ? `, current as of ${election.as_of}` : ''}.
                    {finalCount
                        ? ` Final count for mail-in and absentee ballots runs ${formatDate(finalCount.start)} to ${formatDate(finalCount.end)}, so close results may change.`
                        : ' Final count may change close results.'}
                </p>
                <p class="note subtle">
                    {turnout.registered_voters
                        ? `${formatNumber(turnout.registered_voters)} voters were registered${turnout.registered_as_of ? ` as of ${turnout.registered_as_of}` : ''}. `
                        : ''}
                    {turnout.votes_considered
                        ? `${formatNumber(turnout.votes_considered)} ballots were counted, including rejected ballots.`
                        : ''}{' '}
                    {source && (
                        <SourceLink href={source.url}>
                            Elections BC results
                        </SourceLink>
                    )}
                </p>
            </section>

            <nav class="next-links" aria-label="Results sections">
                <a class="link-card" href="#/constituencies">
                    <strong>Constituency results</strong>
                    <span>
                        All {election.seats} races, with vote counts and margins
                    </span>
                    <span class="card-action">
                        Browse results <span aria-hidden="true">→</span>
                    </span>
                </a>
                <a class="link-card" href="#/cabinet">
                    <strong>Cabinet</strong>
                    <span>Premier-designate and ministry status</span>
                    <span class="card-action">
                        View cabinet <span aria-hidden="true">→</span>
                    </span>
                </a>
                <a class="link-card" href="#/parties">
                    <strong>Parties</strong>
                    <span>
                        Seat counts, leaders and vote share for the parties that
                        won seats
                    </span>
                    <span class="card-action">
                        View parties <span aria-hidden="true">→</span>
                    </span>
                </a>
            </nav>
        </article>
    );
}
