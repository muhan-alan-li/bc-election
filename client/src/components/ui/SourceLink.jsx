export function SourceLink({ href, children, showIcon = true, ...props }) {
    return href ? (
        <a {...props} href={href} target="_blank" rel="noopener noreferrer">
            {children}
            {showIcon && (
                <>
                    {' '}
                    <span aria-label="opens in a new tab">↗</span>
                </>
            )}
        </a>
    ) : null;
}
