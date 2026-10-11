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
                                <SourceLink
                                    key={sourceIndex}
                                    href={source.url}
                                    showIcon={false}
                                    aria-label={`Source ${sourceIndex + 1}: ${source.label} (opens in a new tab)`}
                                    title={source.label}
                                >
                                    [{sourceIndex + 1}]
                                </SourceLink>
                            );
                        })}
                    </span>
                </li>
            ))}
        </ul>
    );
}
import { SourceLink } from '../ui/SourceLink.jsx';
