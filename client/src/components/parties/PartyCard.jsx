import { platformHref } from '../../helpers/routes.js';
import { Card } from '../ui/Card.jsx';

export function PartyCard({ party, compact = false }) {
    return (
        <Card
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
                    Learn more
                    <span aria-hidden="true">→</span>
                </span>
            </span>
        </Card>
    );
}
