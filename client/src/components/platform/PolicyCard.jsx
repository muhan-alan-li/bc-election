export function PolicyCard({ item, onSelect }) {
    return (
        <button
            type="button"
            class="policy-card"
            aria-haspopup="dialog"
            onClick={() => onSelect(item)}
        >
            <span class="policy-card-topic">{item.topic}</span>
            <span class="policy-card-summary">{item.summary}</span>
            <span class="policy-card-action">
                Explore the plan <span aria-hidden="true">↗</span>
            </span>
        </button>
    );
}
