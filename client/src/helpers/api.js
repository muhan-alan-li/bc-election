export async function getJSON(path, signal) {
    const response = await fetch(path, { signal });
    const body = await response.json();
    if (!response.ok)
        throw new Error(body.error || 'Unable to load election data.');
    return body;
}
