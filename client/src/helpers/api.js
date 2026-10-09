export async function getJSON(path, signal) {
    const response = await fetch(path, { signal });
    const body = await response.json();
    if (!response.ok)
        throw new Error(body.error || 'Unable to load election data.');
    return body;
}

export async function getPartyPlatforms(signal) {
    const body = await getJSON('/api/platforms/parties', signal);
    return body.platforms;
}

export async function getCandidatePlatforms(districtCode, signal) {
    const query = districtCode
        ? `?district=${encodeURIComponent(districtCode)}`
        : '';
    const body = await getJSON(`/api/platforms/candidates${query}`, signal);
    return body.platforms;
}
