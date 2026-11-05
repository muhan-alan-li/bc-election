import { resourceURL } from './deployment.js';

const unavailable = 'Unable to load this content. Please try again.';

export function getJSON(path, signal, options = {}) {
    return requestJSON(path, { ...options, signal });
}

export async function requestJSON(
    path,
    { signal, timeout = 15000, ...options } = {},
) {
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(
        () =>
            controller.abort(
                new DOMException('Request timed out', 'TimeoutError'),
            ),
        timeout,
    );
    try {
        const response = await fetch(resourceURL(path), {
            ...options,
            signal: controller.signal,
            headers: { ...options.headers, Accept: 'application/json' },
        });
        if (!response.headers.get('content-type')?.includes('application/json'))
            throw new Error(unavailable);
        let body;
        try {
            body = await response.json();
        } catch {
            throw new Error(unavailable);
        }
        if (!response.ok) {
            const error = new Error(
                typeof body?.error === 'string' ? body.error : unavailable,
            );
            error.status = response.status;
            throw error;
        }
        if (!body || typeof body !== 'object' || Array.isArray(body))
            throw new Error(unavailable);
        validateResource(path, body);
        return body;
    } catch (error) {
        if (signal?.aborted) throw error;
        if (controller.signal.aborted)
            throw new Error('The request took too long. Please try again.');
        if (error instanceof TypeError)
            throw new Error(
                'Unable to connect. Check your connection and try again.',
            );
        throw error;
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
    }
}

function validateResource(path, body) {
    let valid = true;
    if (path === '/api/districts') valid = Array.isArray(body.districts);
    else if (path === '/api/results')
        valid =
            !!body.election?.seats &&
            Array.isArray(body.parties) &&
            body.parties.length > 0 &&
            body.districts &&
            typeof body.districts === 'object' &&
            !Array.isArray(body.districts) &&
            Object.keys(body.districts).length === body.election.seats &&
            Object.values(body.districts).every(
                (district) =>
                    district.name &&
                    Array.isArray(district.candidates) &&
                    district.winner?.name,
            );
    else if (path === '/api/cabinet')
        valid =
            !!body.premier?.name &&
            Array.isArray(body.ministers) &&
            Array.isArray(body.sources);
    else if (path.endsWith('/ballot'))
        valid =
            !!body.district?.name &&
            Array.isArray(body.candidacies) &&
            Array.isArray(body.parties);
    else if (path === '/api/parties')
        valid =
            Array.isArray(body.parties) &&
            body.parties.every((p) => p.id && p.name && p.color);
    else if (path === '/api/guide')
        valid =
            Array.isArray(body.parties) &&
            Array.isArray(body.otherParties) &&
            [...body.parties, ...body.otherParties].every(
                (p) =>
                    Array.isArray(p.items) &&
                    p.items.every(
                        (i) =>
                            Array.isArray(i.points) && Array.isArray(i.sources),
                    ),
            );
    else if (path === '/api/questionnaire')
        valid =
            typeof body.methodology === 'string' &&
            typeof body.reviewedOn === 'string' &&
            Array.isArray(body.questions) &&
            body.questions.length > 0 &&
            body.questions.every(
                (q) => q.id && q.prompt && Array.isArray(q.stances),
            );
    else if (path === '/api/polling')
        valid =
            Array.isArray(body.districts) &&
            Array.isArray(body.surveys) &&
            !!body.methodology &&
            typeof body.collectedAt === 'string' &&
            body.surveys.every((p) => Array.isArray(p.results));
    if (!valid)
        throw new Error(
            'This content could not be displayed. Please try again.',
        );
}
