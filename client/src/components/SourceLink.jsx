export function SourceLink({ href, children }) {
    return href ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
            {children} <span aria-label="opens in a new tab">↗</span>
        </a>
    ) : null;
}
