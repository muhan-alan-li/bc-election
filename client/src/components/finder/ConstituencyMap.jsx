import { useEffect, useRef } from 'preact/hooks';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export function ConstituencyMap({ result, onLookup }) {
    const mapNode = useRef(null);
    const map = useRef(null);
    const layers = useRef(null);
    const lookupRef = useRef(onLookup);

    lookupRef.current = onLookup;

    useEffect(() => {
        const instance = L.map(mapNode.current, {
            zoomAnimation: false,
        }).setView([53.5, -125.5], 5);
        map.current = instance;
        L.tileLayer(
            window.BC_MAP_TILE_URL ||
                'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            {
                maxZoom: 19,
                attribution:
                    '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
            },
        ).addTo(instance);
        layers.current = L.featureGroup().addTo(instance);
        instance.on('click', (event) =>
            lookupRef.current({
                latitude: event.latlng.lat,
                longitude: event.latlng.lng,
            }),
        );
        const frame = requestAnimationFrame(() => instance.invalidateSize());

        return () => {
            cancelAnimationFrame(frame);
            instance.stop();
            instance.remove();
            map.current = null;
            layers.current = null;
        };
    }, []);

    useEffect(() => {
        if (!layers.current) return;
        layers.current.clearLayers();
        if (!result) return;
        const { latitude, longitude, accuracy_m } = result.location;
        for (const district of result.districts)
            L.geoJSON(district.feature, {
                style: { color: '#304e6b', weight: 2, fillOpacity: 0.08 },
            }).addTo(layers.current);
        if (result.location_is_view) {
            if (result.districts.length)
                map.current.fitBounds(layers.current.getBounds().pad(0.08), {
                    animate: false,
                });
            else map.current.setView([53.5, -125.5], 5, { animate: false });
            return;
        }
        L.circleMarker([latitude, longitude], {
            radius: 7,
            color: '#245b8a',
            fillOpacity: 1,
        }).addTo(layers.current);
        if (accuracy_m > 0)
            L.circle([latitude, longitude], {
                radius: accuracy_m,
                color: '#245b8a',
                weight: 1,
                fillOpacity: 0.06,
            }).addTo(layers.current);
        map.current.setView(
            [latitude, longitude],
            accuracy_m > 10000 ? 8 : 13,
            { animate: false },
        );
    }, [result]);

    return (
        <div
            ref={mapNode}
            class="finder-map"
            role="region"
            aria-label="Constituency map. Click to place a location pin."
        />
    );
}
