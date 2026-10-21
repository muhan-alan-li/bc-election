// The client is a static site. API-shaped paths map to prebuilt JSON files.
export function resourceURL(path) {
    return path.startsWith('/api/')
        ? `/data/${path.slice('/api/'.length)}.json`
        : path;
}
