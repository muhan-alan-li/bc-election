export function sourceURL(value) {
    if (typeof value !== 'string') return null;
    try {
        const url = new URL(value);
        return ['https:', 'http:'].includes(url.protocol) &&
            !url.username &&
            !url.password
            ? url.href
            : null;
    } catch {
        return null;
    }
}
