import {
    formatPercent,
    historyRows,
    partyLookup,
    shareLabel,
    shareParts,
} from '../../helpers/results.js';

export function History({ district, parties }) {
    const partyById = partyLookup(parties);
    const rows = historyRows(district, partyById);
    const earlier = rows.filter((row) => !row.current);
    if (!earlier.length)
        return (
            <section aria-labelledby="history-title">
                <h2 id="history-title">Past results</h2>
                <p class="empty">
                    This constituency is new or has been renamed since the last
                    election, so no earlier results are available under this
                    name.
                </p>
            </section>
        );
    return (
        <section aria-labelledby="history-title">
            <h2 id="history-title">Past results</h2>
            <p class="note">
                Vote shares are of valid votes. The 2024 election used the same
                boundaries as 2026. Earlier years are matched by constituency
                name and may cover different boundaries, so compare them with
                care.
            </p>
            <ol class="history-list">
                {rows.map((row) => {
                    const parts = shareParts(row, partyById);
                    const party = partyById.get(row.winner.party_id);
                    return (
                        <li class="history-row" key={row.year}>
                            <div class="history-year">
                                {row.year}
                                {row.current && (
                                    <span class="history-current">
                                        initial count
                                    </span>
                                )}
                            </div>
                            <div class="history-body">
                                <p class="history-winner">
                                    <span
                                        class="party-swatch"
                                        style={{
                                            background:
                                                party?.color || '#8a8f98',
                                        }}
                                        aria-hidden="true"
                                    />
                                    <strong>{row.winner.name}</strong>
                                    <span class="muted">
                                        {party?.name || 'Unknown party'}
                                    </span>
                                </p>
                                <div
                                    class="share-bar"
                                    role="img"
                                    aria-label={shareLabel(parts, row.year)}
                                >
                                    {parts.map((part) => (
                                        <span
                                            key={part.party_id}
                                            class="share-bar-segment"
                                            style={{
                                                width: `${part.vote_share}%`,
                                                background: part.color,
                                            }}
                                        />
                                    ))}
                                </div>
                                <p class="history-meta">
                                    {formatPercent(row.winner.vote_share)} of
                                    valid votes · {row.boundary}
                                </p>
                            </div>
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}
