import {
    decodeGeometry,
    feature,
    inBounds,
    matches,
    nearBoundary,
} from './geometry.js';

const letters = 'ABCEGHJKLMNPRSTVWXYZ';
const postalPattern = /^V\d[ABCEGHJKLMNPRSTVWXYZ]\d[ABCEGHJKLMNPRSTVWXYZ]\d$/;
const unavailable =
    'Constituency data could not be loaded. Check your connection and try again.';

export class StaticFinder {
    constructor(fetcher = globalThis.fetch.bind(globalThis)) {
        this.fetcher = fetcher;
        this.manifest = null;
        this.files = new Map();
        this.geometries = new Map();
    }

    async read(url, kind, signal) {
        signal?.throwIfAborted();
        const key = `${kind}:${url}`;
        if (this.files.has(key)) return this.files.get(key);
        let response;
        try {
            response = await this.fetcher(url, { signal });
        } catch (error) {
            if (signal?.aborted) throw error;
            throw new Error(unavailable);
        }
        if (!response.ok) throw new Error(unavailable);
        let value;
        try {
            if (kind === 'json') {
                if (
                    !response.headers
                        .get('content-type')
                        ?.includes('application/json')
                )
                    throw new Error();
                value = await response.json();
            } else value = await response.arrayBuffer();
        } catch (error) {
            if (signal?.aborted) throw error;
            throw new Error(unavailable);
        }
        // Binary geometry is cached decoded, avoiding a second retained copy.
        if (!url.includes('/boundaries/') && !url.includes('/detailed/')) {
            this.files.set(key, value);
            if (this.files.size > 32)
                this.files.delete(this.files.keys().next().value);
        }
        return value;
    }

    async index(signal) {
        if (this.manifest) return this.manifest;
        const m = await this.read('/finder/manifest.json', 'json', signal);
        if (
            m.schema_version !== 1 ||
            !/^[a-f0-9]{20}$/.test(m.version) ||
            m.base !== `/finder/${m.version}/` ||
            m.margin_m !== 25 ||
            !Array.isArray(m.prefixes) ||
            !m.prefixes.every((p) => /^V\d[ABCEGHJKLMNPRSTVWXYZ]$/.test(p)) ||
            !Array.isArray(m.districts) ||
            !m.districts.length ||
            m.districts.length > 253 ||
            !m.districts.every(
                (d) =>
                    /^[A-Za-z0-9_-]+$/.test(d.code) &&
                    typeof d.name === 'string' &&
                    d.bbox?.length === 4 &&
                    d.bbox.every(Number.isFinite),
            )
        ) {
            this.files.clear();
            throw new Error(unavailable);
        }
        this.manifest = m;
        return m;
    }

    async geometry(district, detailed, signal) {
        const key = `${detailed ? 'detailed' : 'boundaries'}/${district.code}.bin`;
        if (this.geometries.has(key)) {
            const g = this.geometries.get(key);
            this.geometries.delete(key);
            this.geometries.set(key, g);
            return g;
        }
        const buffer = await this.read(
            this.manifest.base + key,
            'binary',
            signal,
        );
        const geometry = decodeGeometry(buffer);
        this.geometries.set(key, geometry);
        let points = [...this.geometries.values()].reduce(
            (sum, g) => sum + g.pointCount,
            0,
        );
        while (
            this.geometries.size > 1 &&
            (this.geometries.size > 24 || points > 300000)
        ) {
            const first = this.geometries.keys().next().value;
            points -= this.geometries.get(first).pointCount;
            this.geometries.delete(first);
        }
        return geometry;
    }

    async lookup(input, signal) {
        signal?.throwIfAborted();
        const postal = String(input.postal_code || '')
            .replace(/\s/g, '')
            .toUpperCase();
        const accuracy = input.accuracy_m ?? 0;
        if (
            postal &&
            (input.latitude != null ||
                input.longitude != null ||
                accuracy !== 0)
        )
            throw new Error('Provide either a postal code or coordinates.');
        if (postal && !postalPattern.test(postal))
            throw new Error(
                'Enter a full British Columbia postal code, such as V6Y 1N9.',
            );
        if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100000)
            throw new Error(
                'Location accuracy must be between 0 and 100,000 metres.',
            );
        const point = [input.longitude, input.latitude];
        if (
            !postal &&
            (!point.every(Number.isFinite) ||
                Math.abs(point[0]) > 180 ||
                Math.abs(point[1]) > 90)
        )
            throw new Error('Location coordinates are invalid.');
        const m = await this.index(signal);
        let selected = [];
        if (postal) {
            const prefix = postal.slice(0, 3),
                suffix = postal.slice(3);
            if (!m.prefixes.includes(prefix))
                throw new Error(
                    'This postal code is missing from our local data. Try your location or place a pin on the map.',
                );
            const table = new Uint8Array(
                await this.read(
                    `${m.base}postal/${prefix}.bin`,
                    'binary',
                    signal,
                ),
            );
            if (table.length !== 2000) throw new Error(unavailable);
            const slot =
                Number(suffix[0]) * 200 +
                letters.indexOf(suffix[1]) * 10 +
                Number(suffix[2]);
            const id = table[slot];
            if (id === 0)
                throw new Error(
                    'This postal code is missing from our local data. Try your location or place a pin on the map.',
                );
            if (id === 254) {
                const ambiguous = await this.read(
                    `${m.base}ambiguities/${prefix}.json`,
                    'json',
                    signal,
                );
                const ids = ambiguous[suffix];
                if (
                    !Array.isArray(ids) ||
                    ids.length < 2 ||
                    !ids.every((i) => Number.isInteger(i) && m.districts[i])
                )
                    throw new Error(unavailable);
                selected = ids.map((i) => m.districts[i]);
            } else if (id !== 255) {
                if (!m.districts[id - 1]) throw new Error(unavailable);
                selected = [m.districts[id - 1]];
            }
        } else {
            // Bounded concurrency avoids flooding mobile connections for large
            // accuracy circles. Computation stays in the browser worker.
            const candidates = m.districts.filter((d) =>
                inBounds(point, d.bbox, accuracy),
            );
            for (let start = 0; start < candidates.length; start += 4) {
                const batch = await Promise.all(
                    candidates.slice(start, start + 4).map(async (district) => {
                        const simplified = await this.geometry(
                            district,
                            false,
                            signal,
                        );
                        const close = nearBoundary(
                            point,
                            simplified,
                            accuracy + m.margin_m,
                        );
                        const geometry = close
                            ? await this.geometry(district, true, signal)
                            : simplified;
                        return matches(point, geometry, accuracy)
                            ? district
                            : null;
                    }),
                );
                selected.push(...batch.filter(Boolean));
                signal?.throwIfAborted();
            }
        }
        selected.sort((a, b) => a.name.localeCompare(b.name, 'en-CA'));
        const districts = [];
        for (const d of selected) {
            const g = await this.geometry(d, false, signal);
            districts.push({
                official_code: d.code,
                name: d.name,
                published: d.published,
                feature: feature(d, g),
            });
        }
        // Postal lookup deliberately retains no individual location samples.
        // This centre is a map viewport only, never presented as a home pin.
        const bounds = selected.length
            ? [
                  Math.min(...selected.map((d) => d.bbox[0])),
                  Math.min(...selected.map((d) => d.bbox[1])),
                  Math.max(...selected.map((d) => d.bbox[2])),
                  Math.max(...selected.map((d) => d.bbox[3])),
              ]
            : [-139, 48, -114, 60];
        signal?.throwIfAborted();
        return {
            status:
                districts.length > 1
                    ? 'ambiguous'
                    : districts.length
                      ? 'approximate'
                      : 'no_match',
            method: postal ? 'postal_code' : 'geolocation',
            location: postal
                ? {
                      longitude: (bounds[0] + bounds[2]) / 2,
                      latitude: (bounds[1] + bounds[3]) / 2,
                      accuracy_m: 0,
                  }
                : {
                      longitude: point[0],
                      latitude: point[1],
                      accuracy_m: accuracy,
                  },
            location_is_view: !!postal,
            districts,
            boundary_version: m.boundary_version,
            generated_at: m.generated_at,
            approximate: true,
        };
    }
}
