export function PolicyDetails({ item }) {
    return (
        <ul class="policy-detail">
            {item.points.map((point) => (
                <li key={point.text}>
                    {point.text}{' '}
                    <span class="policy-citations">
                        {point.sourceIndices.map((sourceIndex) => {
                            const source = item.sources[sourceIndex];
                            return (
                                <a
                                    key={sourceIndex}
                                    href={source.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Source ${sourceIndex + 1}: ${source.label} (opens in a new tab)`}
                                    title={source.label}
                                >
                                    [{sourceIndex + 1}]
                                </a>
                            );
                        })}
                    </span>
                </li>
            ))}
        </ul>
    );
}
