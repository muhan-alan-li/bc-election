export function PolicyCard({
    item,
    onSelect,
    actionLabel = 'Explore the plan',
}) {
    return (
        <button
            type="button"
            class="policy-card"
            aria-haspopup="dialog"
            onClick={() => onSelect(item)}
        >
            <span class="policy-card-topic">{item.topic}</span>
            <span class="policy-card-summary">{item.summary}</span>
            {item.alignmentTag && (
                <span
                    class={`policy-card-tag policy-card-tag-${item.alignmentTag}`}
                >
                    <strong>{item.alignmentTag}:</strong> {item.alignmentNote}
                </span>
            )}
            {actionLabel && (
                <span class="policy-card-action">
                    {actionLabel} <span aria-hidden="true">↗</span>
                </span>
            )}
        </button>
    );
}
