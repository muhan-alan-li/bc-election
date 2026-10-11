// Cards can be passive content, navigation links, or actions. Preserve native
// anchor and button semantics instead of adding click handlers to a container.
export function Card({
    href,
    onClick,
    class: className = '',
    children,
    ...props
}) {
    const Element = href ? 'a' : onClick ? 'button' : 'article';
    return (
        <Element
            {...props}
            class={`card${className ? ` ${className}` : ''}`}
            href={href}
            type={Element === 'button' ? 'button' : undefined}
            onClick={onClick}
        >
            {children}
        </Element>
    );
}
