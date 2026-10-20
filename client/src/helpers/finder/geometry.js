// Geometry calculations mirror the Go matcher, including holes, shared edges
// and the local metre projection used for browser location accuracy circles.
export function segmentDistance(p, a, b) {
    const sx = 111320 * Math.cos((p[1] * Math.PI) / 180);
    const ax = (a[0] - p[0]) * sx,
        ay = (a[1] - p[1]) * 111320;
    const bx = (b[0] - p[0]) * sx,
        by = (b[1] - p[1]) * 111320;
    const dx = bx - ax,
        dy = by - ay;
    const t =
        dx * dx + dy * dy > 0
            ? Math.max(
                  0,
                  Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy)),
              )
            : 0;
    return Math.hypot(ax + t * dx, ay + t * dy);
}

function ringContains(point, ring) {
    let inside = false;
    for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1],
            b = ring[i];
        if (segmentDistance(point, a, b) < 0.01) return [true, true];
        if (
            a[1] > point[1] !== b[1] > point[1] &&
            point[0] <
                ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
        )
            inside = !inside;
    }
    return [inside, false];
}

export function inBounds(point, bbox, accuracy = 0) {
    const dy = accuracy / 111320;
    const dx =
        accuracy /
        (111320 * Math.max(0.01, Math.cos((point[1] * Math.PI) / 180)));
    return (
        point[0] >= bbox[0] - dx &&
        point[0] <= bbox[2] + dx &&
        point[1] >= bbox[1] - dy &&
        point[1] <= bbox[3] + dy
    );
}

export function nearBoundary(point, geometry, distance) {
    return geometry.polygons.some((polygon) =>
        polygon.some((ring) => {
            for (let i = 1; i < ring.length; i++) {
                if (segmentDistance(point, ring[i - 1], ring[i]) <= distance)
                    return true;
            }
            return false;
        }),
    );
}

export function matches(point, geometry, accuracy = 0) {
    for (const polygon of geometry.polygons) {
        let [inside, edge] = ringContains(point, polygon[0]);
        if (edge) return true;
        if (inside) {
            for (const hole of polygon.slice(1)) {
                const [inHole, onEdge] = ringContains(point, hole);
                if (onEdge) return true;
                if (inHole) {
                    inside = false;
                    break;
                }
            }
            if (inside) return true;
        }
        if (
            accuracy > 0 &&
            nearBoundary(point, { polygons: [polygon] }, accuracy)
        )
            return true;
    }
    return false;
}

export function decodeGeometry(buffer) {
    const bytes = new Uint8Array(buffer),
        view = new DataView(buffer);
    let offset = 6;
    const invalid = () => {
        throw new Error('The constituency boundary file is invalid.');
    };
    if (
        bytes.length < 7 ||
        String.fromCharCode(...bytes.slice(0, 4)) !== 'BCG1' ||
        ![1, 2].includes(bytes[4]) ||
        ![0, 6, 8].includes(bytes[5])
    )
        invalid();
    function uint() {
        let n = 0,
            factor = 1;
        for (let i = 0; i < 8; i++) {
            if (offset >= bytes.length) invalid();
            const b = bytes[offset++];
            n += (b & 127) * factor;
            if (!Number.isSafeInteger(n)) invalid();
            if (b < 128) return n;
            factor *= 128;
        }
        invalid();
    }
    const polygons = [],
        scale = 10 ** bytes[5];
    let pointCount = 0;
    const polygonCount = uint();
    if (
        !polygonCount ||
        polygonCount > bytes.length ||
        (bytes[4] === 1 && polygonCount !== 1)
    )
        invalid();
    for (let p = 0; p < polygonCount; p++) {
        const polygon = [],
            ringCount = uint();
        if (!ringCount || ringCount > bytes.length) invalid();
        for (let r = 0; r < ringCount; r++) {
            const ring = [],
                count = uint(),
                previous = [0, 0];
            if (
                count < 4 ||
                count > bytes.length ||
                pointCount + count > 2000000
            )
                invalid();
            pointCount += count;
            for (let i = 0; i < count; i++) {
                const point = [];
                for (let axis = 0; axis < 2; axis++) {
                    if (bytes[5] === 0) {
                        if (offset + 8 > bytes.length) invalid();
                        point.push(view.getFloat64(offset, true));
                        offset += 8;
                    } else {
                        const n = uint();
                        previous[axis] += n % 2 ? -(n + 1) / 2 : n / 2;
                        point.push(previous[axis] / scale);
                    }
                }
                if (
                    !point.every(Number.isFinite) ||
                    Math.abs(point[0]) > 180 ||
                    Math.abs(point[1]) > 90
                )
                    invalid();
                ring.push(point);
            }
            if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])
                invalid();
            polygon.push(ring);
        }
        polygons.push(polygon);
    }
    if (offset !== bytes.length) invalid();
    return {
        type: bytes[4] === 1 ? 'Polygon' : 'MultiPolygon',
        polygons,
        pointCount,
    };
}

export function feature(district, geometry) {
    return {
        type: 'Feature',
        properties: { official_code: district.code, name: district.name },
        bbox: district.bbox,
        geometry: {
            type: geometry.type,
            coordinates:
                geometry.type === 'Polygon'
                    ? geometry.polygons[0]
                    : geometry.polygons,
        },
    };
}
