export const districtHref = (code) =>
    `#/constituencies/${encodeURIComponent(code)}`;

export const candidateHref = (code, id) =>
    `${districtHref(code)}/candidates/${encodeURIComponent(id)}`;

export function parseRoute() {
    try {
        const parts = window.location.hash
            .replace(/^#\/?/, '')
            .split('/')
            .map(decodeURIComponent);
        if (parts[0] === 'parties' && parts.length === 1)
            return { view: 'parties' };
        if (!parts[0] || (parts[0] === 'constituencies' && parts.length === 1))
            return { view: 'constituencies' };
        if (parts[0] === 'constituencies' && parts[1] && parts.length === 2)
            return { view: 'district', code: parts[1] };
        if (
            parts[0] === 'constituencies' &&
            parts[1] &&
            parts[2] === 'candidates' &&
            parts[3] &&
            parts.length === 4
        )
            return { view: 'candidate', code: parts[1], candidateID: parts[3] };
    } catch {}
    return { view: 'missing' };
}
