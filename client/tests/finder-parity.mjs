// Invoked by the Go suite with its original matcher as the oracle.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { StaticFinder } from '../src/helpers/finder/engine.js';
import { decodeGeometry } from '../src/helpers/finder/geometry.js';

const root = path.resolve(process.argv[2]);
const oracle = JSON.parse(await readFile(process.argv[3], 'utf8'));
const requests = [];
const engine = new StaticFinder(async (url, { signal }) => {
    signal?.throwIfAborted();
    requests.push(url);
    try {
        const body = await readFile(path.join(root, url));
        return new Response(body, {
            headers: {
                'Content-Type': url.endsWith('.json')
                    ? 'application/json'
                    : 'application/octet-stream',
            },
        });
    } catch {
        return new Response('', { status: 404 });
    }
});
const manifest = await engine.index();
for (const [code, expected] of Object.entries(oracle.geometry)) {
    const body = await readFile(
        path.join(root, manifest.base, 'detailed', `${code}.bin`),
    );
    const g = decodeGeometry(
        body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    );
    assert.deepEqual(
        {
            type: g.type,
            coordinates: g.type === 'Polygon' ? g.polygons[0] : g.polygons,
        },
        expected,
        `Detailed geometry is lossless: ${code}`,
    );
}
const started = performance.now();
for (const c of oracle.cases) {
    const actual = await engine.lookup(c.input);
    assert.deepEqual(
        actual.districts.map((d) => d.official_code).sort(),
        c.codes,
        JSON.stringify(c.input),
    );
}
if (oracle.synthetic) {
    await assert.rejects(engine.lookup({ postal_code: 'V6Y 1N0' }), /missing/);
    await assert.rejects(
        engine.lookup({ postal_code: 'M5V 1N9' }),
        /British Columbia/,
    );
    await assert.rejects(
        engine.lookup({ latitude: 49, longitude: -123, accuracy_m: 100001 }),
        /accuracy/,
    );
    await assert.rejects(
        engine.lookup({ latitude: 49, longitude: NaN }),
        /invalid/,
    );
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(
        engine.lookup({ postal_code: 'V6Y1N9' }, abort.signal),
        { name: 'AbortError' },
    );
    assert.ok(requests.some((url) => url.includes('/ambiguities/')));
    assert.ok(requests.some((url) => url.includes('/detailed/')));
    const postalOnly = new StaticFinder(engine.fetcher);
    requests.length = 0;
    const result = await postalOnly.lookup({ postal_code: 'v6y 1n9' });
    assert.equal(result.location_is_view, true);
    assert.equal(result.districts[0].published, true);
    assert.ok(
        !requests.some(
            (url) =>
                url.includes('/detailed/') || url.includes('/ambiguities/'),
        ),
    );
}
console.log(
    `PASS ${oracle.cases.length} Go/JavaScript matches; ${Object.keys(oracle.geometry).length} lossless boundary round trips; ${Math.round(performance.now() - started)} ms`,
);
