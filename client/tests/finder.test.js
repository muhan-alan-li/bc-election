import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { StaticFinder } from '../src/helpers/finder/engine.js';
import { decodeGeometry, matches } from '../src/helpers/finder/geometry.js';

test('coordinate matching preserves holes, islands, shared edges and accuracy circles', async () => {
    const fixture = JSON.parse(
        await readFile(
            new URL('./fixtures/static-finder.json', import.meta.url),
        ),
    );
    const [rcc, other] = fixture.boundaries.features.map((f) => ({
        polygons:
            f.geometry.type === 'Polygon'
                ? [f.geometry.coordinates]
                : f.geometry.coordinates,
    }));
    assert.equal(matches([-123.175, 49.125], rcc), false);
    assert.equal(matches([-124.0005, 50.0005], rcc), true);
    assert.equal(matches([-123.1, 49.16], rcc), true);
    assert.equal(matches([-123.1, 49.16], other), true);
    assert.equal(matches([-123.1001, 49.16], other, 50), true);
    assert.equal(matches([-123.1001, 49.16], other), false);
});

test('binary decoder rejects truncated, oversized and incompatible geometry', () => {
    for (const bytes of [
        [],
        [66, 67, 71, 49, 1, 8, 1],
        [66, 67, 71, 49, 1, 8, 255, 255, 255, 255, 255, 255, 255, 255],
        [66, 67, 71, 49, 3, 8, 1],
    ]) {
        assert.throws(
            () => decodeGeometry(new Uint8Array(bytes).buffer),
            /invalid/,
        );
    }
});

const manifest = {
    schema_version: 1,
    version: 'a'.repeat(20),
    base: `/finder/${'a'.repeat(20)}/`,
    margin_m: 25,
    prefixes: ['V6Y'],
    districts: [
        { code: 'RCC', name: 'Richmond Centre', bbox: [-124, 49, -123, 50] },
    ],
};

test('failed or invalid manifests can retry; a successful manifest stays pinned', async () => {
    let calls = 0;
    const finder = new StaticFinder(async () => {
        calls++;
        if (calls === 1)
            return new Response('<html>Bad gateway</html>', { status: 502 });
        if (calls === 2)
            return Response.json({ ...manifest, base: 'https://example.com/' });
        return Response.json(manifest);
    });
    await assert.rejects(finder.index(), /could not be loaded/);
    await assert.rejects(finder.index(), /could not be loaded/);
    assert.equal((await finder.index()).version, manifest.version);
    await finder.index();
    assert.equal(calls, 3);
    const outside = await finder.lookup({ latitude: 0, longitude: 0 });
    assert.equal(outside.status, 'no_match');
    assert.equal(
        calls,
        3,
        'Locations outside all bounding boxes do not fetch boundaries',
    );
});

test('invalid inputs never download data, and cancelled requests stay cancelled', async () => {
    let calls = 0;
    const finder = new StaticFinder(async (_, { signal }) => {
        calls++;
        return new Promise((_, reject) =>
            signal.addEventListener('abort', () => reject(signal.reason), {
                once: true,
            }),
        );
    });
    for (const input of [
        { postal_code: 'V6Y' },
        { latitude: 91, longitude: 0 },
        { latitude: 49, longitude: -123, accuracy_m: -1 },
        { postal_code: 'V6Y1N9', latitude: 49 },
    ]) {
        await assert.rejects(finder.lookup(input));
    }
    assert.equal(calls, 0);
    const controller = new AbortController();
    const lookup = finder.lookup({ postal_code: 'V6Y1N9' }, controller.signal);
    controller.abort();
    await assert.rejects(lookup, { name: 'AbortError' });
    assert.equal(calls, 1);
});
