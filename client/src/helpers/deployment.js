// Replaced at build time; direct module imports in tests use the API mode.
export const staticSite =
    typeof __STATIC_SITE__ !== 'undefined' && __STATIC_SITE__;

export function resourceURL(path, useStatic = staticSite) {
    if (!useStatic || path === '/api/constituency-finder') return path;
    return path.startsWith('/api/')
        ? `/data/${path.slice('/api/'.length)}.json`
        : path;
}
