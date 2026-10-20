import { Card } from '../ui/Card.jsx';

export function PolicyCard({
    item,
    onSelect,
    actionLabel = 'Explore the plan',
}) {
    return (
        <Card
            class="policy-card"
            aria-haspopup="dialog"
            onClick={() => onSelect(item)}
        >
            <span class="policy-card-topic">{item.topic}</span>
            <span class="policy-card-summary">{item.summary}</span>
            {item.alignmentTag && (
                <span
                    class="comparison-tag policy-card-tag"
                    data-tone={item.alignmentTag}
                >
                    <strong>{item.alignmentTag}:</strong> {item.alignmentNote}
                </span>
            )}
            {!item.alignmentTag && item.alignmentNote && (
                <span class="policy-card-note">{item.alignmentNote}</span>
            )}
            {actionLabel && (
                <span class="card-action policy-card-action">
                    {actionLabel} <span aria-hidden="true">↗</span>
                </span>
            )}
        </Card>
    );
}
