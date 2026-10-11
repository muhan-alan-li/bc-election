export async function getJSON(path, signal) {
    const response = await fetch(path, { signal });
    const body = await response.json();
    if (!response.ok) {
        const error = new Error(body.error || 'Unable to load election data.');
        error.status = response.status;
        throw error;
    }
    return body;
}
