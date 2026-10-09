import { useState } from 'preact/hooks';
import { ExpandedPolicy } from '../components/platform/ExpandedPolicy.jsx';
import { PolicyCard } from '../components/platform/PolicyCard.jsx';
import { PlatformOverview } from '../components/platform/PlatformOverview.jsx';
import { reviewedOn } from '../data/parties.js';
import { getPlatformItems } from '../data/platform-details.js';

export function Platform({ party }) {
    const [selected, setSelected] = useState(null);
    const items = getPlatformItems(party);
    return (
        <section
            class="party-platform"
            style={{ '--party-color': party.color }}
            aria-label={`${party.name} policies`}
        >
            <PlatformOverview party={party} />
            {items.length ? (
                <div class="policy-grid">
                    {items.map((item) => (
                        <PolicyCard
                            key={item.topic}
                            item={item}
                            onSelect={setSelected}
                        />
                    ))}
                </div>
            ) : (
                <p class="empty">{party.status}</p>
            )}
            {party.note && <p class="note">{party.note}</p>}
            <p class="note">
                Selected commitments · Reviewed {reviewedOn}. These summaries
                describe campaign proposals.
            </p>
            {selected && (
                <ExpandedPolicy
                    party={party}
                    item={selected}
                    onClose={() => setSelected(null)}
                />
            )}
        </section>
    );
}
