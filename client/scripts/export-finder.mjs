import { createHash } from 'node:crypto';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const suffixLetters = 'ABCEGHJKLMNPRSTVWXYZ';
const postalPattern = /^V\d[ABCEGHJKLMNPRSTVWXYZ]\d[ABCEGHJKLMNPRSTVWXYZ]\d$/;
const simplificationMetres = 20;
const format = 'static-finder-v1/20m/25m/';

function validLocation(point) {
    return (
        Array.isArray(point) &&
        point.length === 2 &&
        point.every(Number.isFinite) &&
        Math.abs(point[0]) <= 180 &&
        Math.abs(point[1]) <= 90
    );
}

function polygons(geometry) {
    if (!geometry || !Array.isArray(geometry.coordinates))
        throw new Error('Invalid boundary geometry');
    if (geometry.type === 'Polygon') return [geometry.coordinates];
    if (geometry.type === 'MultiPolygon') return geometry.coordinates;
    throw new Error('Unsupported boundary geometry');
}

function bboxOf(ring) {
    const [first] = ring;
    const box = [first[0], first[1], first[0], first[1]];
    for (const point of ring) {
        box[0] = Math.min(box[0], point[0]);
        box[1] = Math.min(box[1], point[1]);
        box[2] = Math.max(box[2], point[0]);
        box[3] = Math.max(box[3], point[1]);
    }
    return box;
}

function segmentDistance(point, a, b) {
    const scaleX = 111320 * Math.cos((point[1] * Math.PI) / 180);
    const ax = (a[0] - point[0]) * scaleX;
    const ay = (a[1] - point[1]) * 111320;
    const bx = (b[0] - point[0]) * scaleX;
    const by = (b[1] - point[1]) * 111320;
    const dx = bx - ax;
    const dy = by - ay;
    const length = dx * dx + dy * dy;
    const t =
        length > 0
            ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length))
            : 0;
    return Math.hypot(ax + t * dx, ay + t * dy);
}

function indexRing(ring) {
    const bbox = bboxOf(ring);
    const count = Math.max(
        1,
        Math.min(2048, Math.ceil((bbox[3] - bbox[1]) / 0.005)),
    );
    const step = Math.max(1e-12, (bbox[3] - bbox[1]) / count);
    const bins = Array.from({ length: count }, () => []);
    const bin = (y) =>
        Math.max(0, Math.min(count - 1, Math.floor((y - bbox[1]) / step)));
    for (let i = 1; i < ring.length; i++) {
        const low = bin(Math.min(ring[i - 1][1], ring[i][1]));
        const high = bin(Math.max(ring[i - 1][1], ring[i][1]));
        for (let b = low; b <= high; b++) bins[b].push(i);
    }
    return { ring, bbox, step, bins, bin };
}

function contains(ringIndex, point) {
    const { ring, bbox, bins } = ringIndex;
    const dx =
        0.010001 / (111320 * Math.abs(Math.cos((point[1] * Math.PI) / 180)));
    const dy = 0.010001 / 111320;
    if (
        point[0] < bbox[0] - dx ||
        point[0] > bbox[2] + dx ||
        point[1] < bbox[1] - dy ||
        point[1] > bbox[3] + dy
    )
        return [false, false];
    let inside = false;
    const primary = ringIndex.bin(point[1]);
    for (
        let b = ringIndex.bin(point[1] - dy);
        b <= ringIndex.bin(point[1] + dy);
        b++
    ) {
        for (const i of bins[b]) {
            const a = ring[i - 1];
            const c = ring[i];
            if (
                point[0] >= Math.min(a[0], c[0]) - dx &&
                point[0] <= Math.max(a[0], c[0]) + dx &&
                segmentDistance(point, a, c) < 0.01
            )
                return [true, true];
            if (
                b === primary &&
                a[1] > point[1] !== c[1] > point[1] &&
                point[0] <
                    ((c[0] - a[0]) * (point[1] - a[1])) / (c[1] - a[1]) + a[0]
            )
                inside = !inside;
        }
    }
    return [inside, false];
}

function indexFeature(feature) {
    const box = feature.bbox;
    if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite))
        throw new Error('Invalid boundary bbox');
    const rings = polygons(feature.geometry).map((polygon) =>
        polygon.map((ring) => {
            if (
                !Array.isArray(ring) ||
                ring.length < 4 ||
                !ring.every(validLocation) ||
                ring[0][0] !== ring.at(-1)[0] ||
                ring[0][1] !== ring.at(-1)[1]
            )
                throw new Error('Invalid boundary ring');
            return indexRing(ring);
        }),
    );
    return {
        box,
        rings,
        matches(point) {
            if (
                point[0] < box[0] ||
                point[0] > box[2] ||
                point[1] < box[1] ||
                point[1] > box[3]
            )
                return false;
            for (const polygon of rings) {
                let [inside, edge] = contains(polygon[0], point);
                if (edge) return true;
                if (inside) {
                    for (const hole of polygon.slice(1)) {
                        const [inHole, onEdge] = contains(hole, point);
                        if (onEdge) return true;
                        if (inHole) {
                            inside = false;
                            break;
                        }
                    }
                    if (inside) return true;
                }
            }
            return false;
        },
    };
}

function pushUvarint(out, value) {
    while (value >= 128) {
        out.push((value % 128) | 128);
        value = Math.floor(value / 128);
    }
    out.push(value);
}

function pushVarint(out, value) {
    pushUvarint(out, value >= 0 ? value * 2 : -value * 2 - 1);
}

function pushFloat64(out, value) {
    const buffer = Buffer.allocUnsafe(8);
    buffer.writeDoubleLE(value, 0);
    for (const byte of buffer) out.push(byte);
}

export function encodeGeometry(geometry, simplified) {
    const shape = polygons(geometry);
    let exponent = simplified ? 6 : 8;
    const scale = 10 ** exponent;
    if (!simplified) {
        for (const polygon of shape) {
            for (const ring of polygon) {
                for (const point of ring) {
                    for (const value of point) {
                        if (Math.round(value * scale) / scale !== value)
                            exponent = 0;
                    }
                }
            }
        }
    }
    const out = [66, 67, 71, 49, geometry.type === 'Polygon' ? 1 : 2, exponent];
    pushUvarint(out, shape.length);
    for (const polygon of shape) {
        pushUvarint(out, polygon.length);
        for (const ring of polygon) {
            pushUvarint(out, ring.length);
            const previous = [0, 0];
            for (const point of ring) {
                for (let axis = 0; axis < 2; axis++) {
                    if (exponent === 0) {
                        pushFloat64(out, point[axis]);
                    } else {
                        const n = Math.round(point[axis] * scale);
                        pushVarint(out, n - previous[axis]);
                        previous[axis] = n;
                    }
                }
            }
        }
    }
    return Buffer.from(out);
}

function simplifyRing(ring) {
    const keep = new Array(ring.length).fill(false);
    keep[0] = true;
    keep[ring.length - 1] = true;
    const stack = [[0, ring.length - 1]];
    const tolerance = simplificationMetres / 111320;
    while (stack.length) {
        const [start, end] = stack.pop();
        const a = ring[start];
        const b = ring[end];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        let maximum = tolerance * tolerance;
        let index = -1;
        for (let i = start + 1; i < end; i++) {
            const point = ring[i];
            const length = dx * dx + dy * dy;
            const t =
                length > 0
                    ? Math.max(
                          0,
                          Math.min(
                              1,
                              ((point[0] - a[0]) * dx +
                                  (point[1] - a[1]) * dy) /
                                  length,
                          ),
                      )
                    : 0;
            const x = point[0] - a[0] - t * dx;
            const y = point[1] - a[1] - t * dy;
            const distance = x * x + y * y;
            if (distance > maximum) {
                maximum = distance;
                index = i;
            }
        }
        if (index >= 0) {
            keep[index] = true;
            stack.push([start, index], [index, end]);
        }
    }
    const result = ring.filter((_, index) => keep[index]);
    return result.length < 4 ? ring : result;
}

function simplifyGeometry(geometry) {
    const simplified = polygons(geometry).map((polygon) =>
        polygon.map(simplifyRing),
    );
    return geometry.type === 'Polygon'
        ? { type: 'Polygon', coordinates: simplified[0] }
        : { type: 'MultiPolygon', coordinates: simplified };
}

async function json(file, label) {
    try {
        return JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
        throw new Error(`${label} cannot be read (${file}): ${error.message}`);
    }
}

export async function exportFinder({ dataset, catalog, output }) {
    const source = await readFile(dataset);
    let data;
    try {
        data = JSON.parse(source);
    } catch (error) {
        throw new Error(`Finder dataset is invalid: ${error.message}`);
    }
    if (
        data.schema_version !== 1 ||
        data.boundary_version !== 'bc-2023-redistribution-set-11' ||
        !Array.isArray(data.boundaries?.features) ||
        !data.boundaries.features.length ||
        !data.postal_codes ||
        typeof data.postal_codes !== 'object'
    )
        throw new Error('Finder dataset is invalid');
    if (data.boundaries.features.length > 253)
        throw new Error('Too many districts for postal encoding');

    const catalogData = await json(catalog, 'catalog');
    if (!Array.isArray(catalogData.districts) || !catalogData.districts.length)
        throw new Error('Invalid public catalog');
    const published = new Set(
        catalogData.districts.map((district) => district.official_code),
    );

    const digest = createHash('sha256')
        .update(format)
        .update(source)
        .update(await readFile(catalog))
        .digest('hex')
        .slice(0, 20);
    const root = path.join(output, 'finder', digest);
    const write = async (name, body) => {
        const file = path.join(root, name);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, body);
    };
    const writeJSON = (name, value) => write(name, JSON.stringify(value));

    const districts = [];
    const indexed = [];
    for (const feature of data.boundaries.features) {
        const code = feature.properties?.official_code;
        const name = feature.properties?.name;
        if (
            typeof code !== 'string' ||
            !/^[A-Za-z0-9_-]+$/.test(code) ||
            typeof name !== 'string' ||
            !name ||
            districts.some((district) => district.code === code)
        )
            throw new Error('Invalid boundary identity');
        districts.push({
            code,
            name,
            bbox: feature.bbox,
            published: published.has(code),
        });
        indexed.push(indexFeature(feature));
        await write(
            `detailed/${code}.bin`,
            encodeGeometry(feature.geometry, false),
        );
        await write(
            `boundaries/${code}.bin`,
            encodeGeometry(simplifyGeometry(feature.geometry), true),
        );
    }

    const tables = new Map();
    const ambiguities = new Map();
    const codes = Object.keys(data.postal_codes).sort();
    const pointMatches = new Map();
    let ambiguousCount = 0;
    let noMatchCount = 0;
    for (const code of codes) {
        if (!postalPattern.test(code))
            throw new Error(`Invalid postal record: ${code}`);
        const record = data.postal_codes[code];
        const points = [...(record.geonames ?? []), ...(record.statcan ?? [])];
        if (!points.length) throw new Error(`Invalid postal record: ${code}`);
        if (!points.every(validLocation))
            throw new Error(`Invalid postal coordinate: ${code}`);
        const prefix = code.slice(0, 3);
        if (!tables.has(prefix)) tables.set(prefix, Buffer.alloc(2000));
        const table = tables.get(prefix);
        const seen = new Set();
        for (const point of points) {
            const key = `${point[0]},${point[1]}`;
            let matches = pointMatches.get(key);
            if (!matches) {
                matches = [];
                for (let i = 0; i < indexed.length; i++)
                    if (indexed[i].matches(point)) matches.push(i);
                pointMatches.set(key, matches);
            }
            for (const index of matches) seen.add(index);
        }
        const matched = [...seen].sort((a, b) => a - b);
        const slot =
            Number(code[3]) * 200 +
            suffixLetters.indexOf(code[4]) * 10 +
            Number(code[5]);
        if (matched.length === 0) {
            table[slot] = 255;
            noMatchCount++;
        } else if (matched.length === 1) {
            table[slot] = matched[0] + 1;
        } else {
            table[slot] = 254;
            if (!ambiguities.has(prefix)) ambiguities.set(prefix, {});
            ambiguities.get(prefix)[code.slice(3)] = matched;
            ambiguousCount++;
        }
    }

    const prefixes = [...tables.keys()].sort();
    for (const prefix of prefixes) {
        await write(`postal/${prefix}.bin`, tables.get(prefix));
        if (ambiguities.has(prefix))
            await writeJSON(
                `ambiguities/${prefix}.json`,
                ambiguities.get(prefix),
            );
    }

    const raw = JSON.parse(source);
    const sources = (raw.sources ?? []).map((entry) => {
        const clean = { ...entry };
        delete clean.blob;
        return clean;
    });
    const manifest = {
        schema_version: 1,
        version: digest,
        base: `/finder/${digest}/`,
        boundary_version: data.boundary_version,
        generated_at: data.generated_at,
        margin_m: 25,
        districts,
        prefixes,
        sources,
        postal_count: codes.length,
        ambiguous_count: ambiguousCount,
        no_match_count: noMatchCount,
    };
    await writeJSON('index.json', manifest);
    await mkdir(path.join(output, 'finder'), { recursive: true });
    await writeFile(
        path.join(output, 'finder', 'manifest.json'),
        JSON.stringify(manifest),
    );
    return {
        version: digest,
        prefixes: prefixes.length,
        postal: codes.length,
        ambiguous: ambiguousCount,
        unmatched: noMatchCount,
        boundaries: districts.length,
    };
}
