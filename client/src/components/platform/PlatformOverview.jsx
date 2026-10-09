import { SourceLink } from '../SourceLink.jsx';

export function PlatformOverview({ party }) {
    return (
        <div class="platform-overview">
            <div>
                <p class="party-label">{party.leaderNote}</p>
                <h2>
                    <SourceLink href={party.leaderSource}>
                        {party.leader}
                    </SourceLink>
                </h2>
            </div>
        </div>
    );
}
