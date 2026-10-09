import { platformHref } from '../helpers/routes.js';
import { parties, otherParties, partyRosterSource } from '../data/parties.js';
import { SourceLink } from '../components/SourceLink.jsx';

function PartyCard({ party, compact = false }) {
    return (
        <a
            key={party.id}
            class={`party-card${compact ? ' party-card-compact' : ''}`}
            style={{ '--party-color': party.color }}
            href={platformHref(party.id)}
            aria-label={`View ${party.name} promises, led by ${party.leader}`}
        >
            <span class="party-card-name">{party.name}</span>
            {party.portrait && (
                <img
                    class="party-portrait"
                    src={party.portrait}
                    alt={`Portrait of ${party.leader}`}
                    style={{ objectPosition: party.portraitPosition }}
                    width="400"
                    height="360"
                    loading={compact ? 'lazy' : 'eager'}
                />
            )}
            <span class="party-card-body">
                <span class="party-label">{party.leaderNote}</span>
                <span class="party-card-leader">{party.leader}</span>
                <span class="party-card-action">
                    {party.promises.length
                        ? 'Explore promises'
                        : 'View party details'}{' '}
                    <span aria-hidden="true">→</span>
                </span>
            </span>
        </a>
    );
}

export function Parties() {
    return (
        <>
            <div class="parties-grid">
                {parties.map((party) => (
                    <PartyCard party={party} />
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
            <p class="note">
                The premier leads a government that has the confidence of the
                legislature. Other registered parties and independent candidates
                also run in BC.{' '}
                <a href="#/constituencies">
                    Explore candidates in your constituency
                </a>
                .
            </p>
        </>
    );
}
