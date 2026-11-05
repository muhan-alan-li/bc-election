import { formatPercent, shortPartyName } from '../../helpers/results.js';

export function SeatBar({ parties, seats, majority }) {
    const label = `Seat totals: ${parties
        .map((party) => `${shortPartyName(party)} ${party.seats}`)
        .join(', ')}. ${majority} of ${seats} seats are needed for a majority.`;
    return (
        <figure class="seat-chart">
            <div class="seat-chart-plot">
                <div class="seat-chart-track" role="img" aria-label={label}>
                    {parties.map((party) => (
                        <span
                            key={party.id}
                            class="seat-chart-segment"
                            style={{
                                width: `${(party.seats / seats) * 100}%`,
                                background: party.color,
                            }}
                        />
                    ))}
                </div>
                <div
                    class="seat-chart-majority"
                    style={{ left: `${(majority / seats) * 100}%` }}
                    aria-hidden="true"
                >
                    <span class="seat-chart-majority-label">
                        {majority} to govern
                    </span>
                </div>
            </div>
            <figcaption class="seat-chart-legend">
                {parties.map((party) => (
                    <span class="seat-chart-key" key={party.id}>
                        <span
                            class="party-swatch"
                            style={{ background: party.color }}
                            aria-hidden="true"
                        />
                        <span>{party.name}</span>
                        <strong>{party.seats}</strong>
                        <span class="seat-chart-share">
                            {formatPercent(party.vote_share)}
                        </span>
                    </span>
                ))}
            </figcaption>
        </figure>
    );
}
