export const platformHref = (id) =>
    `#/parties/${encodeURIComponent(id)}/platform`;

export const districtHref = (code) =>
    `#/constituencies/${encodeURIComponent(code)}`;

export const resultsHref = '#/results';
export const cabinetHref = '#/cabinet';

export function parseRoute() {
    try {
        const parts = window.location.hash
            .replace(/^#\/?/, '')
            .split('/')
            .map(decodeURIComponent);
        if (
            (!parts[0] && parts.length === 1) ||
            (parts[0] === 'results' && parts.length === 1)
        )
            return { view: 'results' };
        if (parts[0] === 'cabinet' && parts.length === 1)
            return { view: 'cabinet' };
        if (parts[0] === 'match' && parts.length === 1)
            return { view: 'match' };
        if (parts[0] === 'parties' && parts.length === 1)
            return { view: 'parties' };
        if (
            parts[0] === 'parties' &&
            parts[1] &&
            parts[2] === 'platform' &&
            parts.length === 3
        )
            return { view: 'platform', partyID: parts[1] };
        if (parts[0] === 'constituencies' && parts.length === 1)
            return { view: 'constituencies' };
        if (parts[0] === 'constituencies' && parts[1] && parts.length === 2)
            return { view: 'district', code: parts[1] };
    } catch {}
    return { view: 'missing' };
}
