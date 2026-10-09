import { SourceLink } from '../SourceLink.jsx';

export function PolicySources({ sources }) {
    return (
        <div class="party-sources">
            <p class="party-label">Official sources</p>
            <ol class="policy-source-list">
                {sources.map((source) => (
                    <li key={source.url}>
                        <SourceLink href={source.url}>
                            {source.label}
                        </SourceLink>
                    </li>
                ))}
            </ol>
        </div>
    );
}
