import { PartyCard } from '../components/parties/PartyCard.jsx';
import { SourceLink } from '../components/ui/SourceLink.jsx';

export function Parties({ parties, otherParties, partyRosterSource, results }) {
    const held = results.parties.filter((party) => party.seats > 0);
    const byID = new Map(
        [...parties, ...otherParties].map((party) => [party.id, party]),
    );
    return (
        <>
            <p class="results-standfirst">
                Three parties won seats in the 2026 election. Each card shows
                the party's seat count, vote share and leader; links lead to the
                campaign platform it took to voters.
            </p>
            <div class="parties-grid">
                {held.map((result) => {
                    const party = byID.get(result.id);
                    if (!party) return null;
                    return (
                        <PartyCard
                            key={result.id}
                            party={{
                                ...party,
                                seats: result.seats,
                                voteShare: result.vote_share,
                                role: result.role,
                            }}
                        />
                    );
                })}
            </div>
            <p class="note">
                Only parties that hold a seat are shown. CentreBC, OneBC and the
                other parties that ran did not win a seat in 2026.{' '}
                <SourceLink href={partyRosterSource}>
                    Elections BC: candidate list
                </SourceLink>
            </p>
        </>
    );
}
