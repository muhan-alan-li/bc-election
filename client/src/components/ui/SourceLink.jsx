import { sourceURL } from '../../helpers/urls.js';

export function SourceLink({ href, children, showIcon = true, ...props }) {
    const safeHref = sourceURL(href);
    return safeHref ? (
        <a {...props} href={safeHref} target="_blank" rel="noopener noreferrer">
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
