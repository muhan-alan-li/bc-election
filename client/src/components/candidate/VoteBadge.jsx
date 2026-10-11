import { votePositionLabel } from '../../helpers/political.js';

export function VoteBadge({ position }) {
    return (
        <span
            class={`vote-position ${position === 'yea' ? 'vote-yea' : position === 'nay' ? 'vote-nay' : ''}`}
        >
            {votePositionLabel(position)}
        </span>
    );
}
