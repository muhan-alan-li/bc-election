import assert from 'node:assert/strict';
import test from 'node:test';
import { getJSON } from '../src/helpers/api.js';
import { sourceURL } from '../src/helpers/urls.js';
import { restoreAnswers, serializeAnswers } from '../src/helpers/matcher.js';

const originalFetch = globalThis.fetch;

test('gateway HTML, invalid JSON and incompatible data have readable errors', async () => {
    try {
        for (const response of [
            new Response('<html>Bad gateway</html>', {
                status: 502,
                headers: { 'content-type': 'text/html' },
            }),
            new Response('{', {
                headers: { 'content-type': 'application/json' },
            }),
            Response.json({ districts: null }),
        ]) {
            globalThis.fetch = async () => response;
            await assert.rejects(
                getJSON('/api/districts'),
                (error) =>
                    !error.message.includes('Unexpected') &&
                    /try again/i.test(error.message),
            );
        }
        globalThis.fetch = async () =>
            Response.json(
                { error: 'Publication unavailable.' },
                { status: 503 },
            );
        await assert.rejects(
            getJSON('/api/districts'),
            (error) =>
                error.status === 503 &&
                error.message === 'Publication unavailable.',
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('hung requests time out and caller cancellation stays distinct', async () => {
    try {
        globalThis.fetch = (_, { signal }) =>
            new Promise((resolve, reject) => {
                if (signal.aborted) reject(signal.reason);
                else
                    signal.addEventListener(
                        'abort',
                        () => reject(signal.reason),
                        { once: true },
                    );
            });
        await assert.rejects(
            getJSON('/api/districts', undefined, { timeout: 10 }),
            /took too long/,
        );
        const controller = new AbortController();
        const pending = getJSON('/api/districts', controller.signal);
        controller.abort();
        await assert.rejects(pending, { name: 'AbortError' });
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('evidence links reject executable schemes, relative URLs and embedded credentials', () => {
    for (const url of [
        'javascript:alert(1)',
        'data:text/html,x',
        '//example.org',
        '/local',
        'https://user:pass@example.org',
        null,
    ])
        assert.equal(sourceURL(url), null);
    assert.equal(
        sourceURL('https://example.org/evidence'),
        'https://example.org/evidence',
    );
});

test('saved answers survive unchanged wording and are invalidated when meaning changes', () => {
    const questions = [
        {
            id: 'a',
            prompt: 'Allow development?',
            yes: 'Allow',
            no: 'Decline',
            note: 'Context',
        },
        {
            id: 'b',
            prompt: 'Fund services?',
            yes: 'Yes',
            no: 'No',
            note: 'Context',
        },
    ];
    const saved = serializeAnswers({ a: 'yes', b: 'no' }, questions);
    assert.deepEqual(restoreAnswers(saved, questions), { a: 'yes', b: 'no' });
    assert.deepEqual(
        restoreAnswers(saved, [
            { ...questions[0], prompt: 'Ban development?' },
            questions[1],
        ]),
        { b: 'no' },
    );
    assert.deepEqual(restoreAnswers({ a: 'yes' }, questions), {});
});
