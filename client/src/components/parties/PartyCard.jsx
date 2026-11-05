import { platformHref } from '../../helpers/routes.js';
import { formatPercent } from '../../helpers/results.js';
import { Card } from '../ui/Card.jsx';

export function PartyCard({ party, compact = false }) {
    return (
        <Card
            class={`party-card${compact ? ' party-card-compact' : ''}`}
            style={{
                '--party-color': party.color,
                '--party-text-color': party.textColor,
            }}
            href={platformHref(party.id)}
            aria-label={`View ${party.name} campaign platform, led by ${party.leader}`}
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
                {typeof party.seats === 'number' && (
                    <span class="party-card-stats">
                        <span>
                            <strong>{party.seats}</strong>{' '}
                            {party.seats === 1 ? 'seat' : 'seats'}
                        </span>
                        <span>
                            <strong>{formatPercent(party.voteShare)}</strong>{' '}
                            vote
                        </span>
                        {party.role && (
                            <span class="role-tag">{party.role}</span>
                        )}
                    </span>
                )}
                <span class="card-action party-card-action">
                    Campaign platform
                    <span aria-hidden="true">→</span>
                </span>
            </span>
        </Card>
    );
}
