import { Table } from '../components/ui/Table.jsx';
import { History } from '../components/results/History.jsx';
import {
    formatNumber,
    formatPercent,
    partyLookup,
} from '../helpers/results.js';

const columns = [
    { label: 'Candidate' },
    { label: 'Party' },
    { label: 'Votes' },
    { label: 'Vote share' },
    { label: 'Result' },
];

export function District({ district, parties }) {
    const partyById = partyLookup(parties);
    const winnerParty = partyById.get(district.winner.party_id);

    return (
        <article class="district-page">
            <section
                class="winner-card"
                style={{ '--party-color': winnerParty?.color || '#8a8f98' }}
                aria-label={`Elected member for ${district.name}`}
            >
                <p class="eyebrow">Elected in {district.name}</p>
                <h2 class="winner-name">{district.winner.name}</h2>
                <p class="winner-party">
                    <span
                        class="party-swatch"
                        style={{ background: winnerParty?.color || '#8a8f98' }}
                        aria-hidden="true"
                    />
                    {winnerParty?.name || 'Unknown party'}
                </p>
                <dl class="winner-stats">
                    <div>
                        <dt>Votes</dt>
                        <dd>{formatNumber(district.winner.votes)}</dd>
                    </div>
                    <div>
                        <dt>Vote share</dt>
                        <dd>{formatPercent(district.winner.vote_share)}</dd>
                    </div>
                    <div>
                        <dt>Margin</dt>
                        <dd>
                            {formatNumber(district.margin.votes)}
                            <span class="muted">
                                {' '}
                                ({formatPercent(district.margin.points)} pts)
                            </span>
                        </dd>
                    </div>
                </dl>
            </section>

            <section aria-labelledby="district-results-title">
                <h2 id="district-results-title">Full results</h2>
                <p class="result-count">
                    {district.candidates.length} candidates ·{' '}
                    {formatNumber(district.valid_votes)} valid votes
                </p>
                <Table
                    label={`Results for ${district.name}`}
                    columns={columns}
                    tableClass="candidate-table"
                >
                    {district.candidates.map((candidate) => {
                        const party = partyById.get(candidate.party_id);
                        return (
                            <tr key={`${candidate.name}-${candidate.party_id}`}>
                                <th scope="row">{candidate.name}</th>
                                <td data-label="Party">
                                    <span class="party-cell">
                                        <span
                                            class="party-swatch"
                                            style={{
                                                background:
                                                    party?.color || '#8a8f98',
                                            }}
                                            aria-hidden="true"
                                        />
                                        {party?.name || 'Unknown party'}
                                    </span>
                                </td>
                                <td data-label="Votes">
                                    {formatNumber(candidate.votes)}
                                </td>
                                <td data-label="Vote share">
                                    {formatPercent(candidate.vote_share)}
                                </td>
                                <td data-label="Result">
                                    {candidate.elected ? (
                                        <strong>Elected</strong>
                                    ) : (
                                        <span class="muted">
                                            #{candidate.rank}
                                        </span>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </Table>
                <dl class="turnout-row">
                    <div>
                        <dt>Valid votes</dt>
                        <dd>{formatNumber(district.valid_votes)}</dd>
                    </div>
                    <div>
                        <dt>Rejected ballots</dt>
                        <dd>{formatNumber(district.rejected_votes)}</dd>
                    </div>
                    <div>
                        <dt>Total considered</dt>
                        <dd>{formatNumber(district.considered_votes)}</dd>
                    </div>
                </dl>
            </section>

            <History district={district} parties={parties} />

            <p class="back-link">
                <a href="#/constituencies">← All constituency results</a>
            </p>
        </article>
    );
}
