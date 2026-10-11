import { parties, otherParties, partyRosterSource } from '../data/parties.js';
import { PartyCard } from '../components/parties/PartyCard.jsx';
import { SourceLink } from '../components/ui/SourceLink.jsx';

export function Parties() {
    return (
        <>
            <div class="parties-grid">
                {parties.map((party) => (
                    <PartyCard key={party.id} party={party} />
                ))}
            </div>
            <details class="other-parties">
                <summary>
                    Other parties running{' '}
                    <span class="count">{otherParties.length}</span>
                </summary>
                <div class="parties-grid other-parties-grid">
                    {otherParties.map((party) => (
                        <PartyCard
                            key={party.id}
                            party={party}

                            compact
                        />
                    ))}
                </div>
                <p class="note">
                    <SourceLink href={partyRosterSource}>
                        Elections BC: final candidate list
                    </SourceLink>{' '}
                    ·{' '}
                    <SourceLink href="https://elections.bc.ca/candidates-parties/political-parties/">
                        Registered parties
                    </SourceLink>
                </p>
            </details>
        </>
    );
}
