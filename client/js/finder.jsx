import { useEffect, useRef, useState } from 'preact/hooks';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export function Finder({ onClose }) {
    const [postal, setPostal] = useState('');
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const mapNode = useRef(null);
    const map = useRef(null);
    const layers = useRef(null);
    const request = useRef(null);
    const sequence = useRef(0);
    const dialog = useRef(null);
    const lookupRef = useRef(null);

    async function lookup(input) {
        const id = ++sequence.current;
        request.current?.abort();
        request.current = new AbortController();
        setBusy(true);
        setError('');
        setResult(null);
        try {
            const response = await fetch('/api/constituency-finder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
                signal: request.current.signal,
            });
            const body = await response.json();
            if (!response.ok)
                throw new Error(body.error || 'Unable to find a constituency.');
            if (id === sequence.current) setResult(body);
        } catch (error) {
            if (id === sequence.current && error.name !== 'AbortError')
                setError(error.message);
        } finally {
            if (id === sequence.current) setBusy(false);
        }
    }

    lookupRef.current = lookup;

    function useLocation() {
        if (!navigator.geolocation) {
            setError(
                'Location is unavailable in this browser. Enter a postal code or click the map.',
            );
            return;
        }
        const id = ++sequence.current;
        request.current?.abort();
        setBusy(true);
        setError('');
        setResult(null);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                if (id === sequence.current)
                    lookup({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy_m: position.coords.accuracy,
                    });
            },
            (error) => {
                if (id !== sequence.current) return;
                setBusy(false);
                setError(
                    error.code === 1
                        ? 'Location permission was denied. Enter a postal code or click the map.'
                        : 'Your location could not be determined. Enter a postal code or click the map.',
                );
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
        );
    }

    useEffect(() => {
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        dialog.current.showModal();
        const instance = L.map(mapNode.current).setView([53.5, -125.5], 5);
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
        instance.invalidateSize();
        return () => {
            sequence.current++;
            request.current?.abort();
            instance.remove();
            document.body.style.overflow = previousOverflow;
            previousFocus?.focus();
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
        map.current.setView([latitude, longitude], accuracy_m > 10000 ? 8 : 13);
    }, [result]);

    return (
        <dialog
            ref={dialog}
            class="finder-panel"
            aria-labelledby="finder-title"
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
        >
            <div class="finder-head">
                <h2 id="finder-title">Find my constituency</h2>
                <button
                    class="secondary"
                    aria-label="Close constituency finder"
                    onClick={onClose}
                >
                    Close
                </button>
            </div>
            <p>
                Enter your home postal code, use your current location, or click
                the map to place a pin.
            </p>
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    lookup({ postal_code: postal });
                }}
            >
                <label for="finder-postal">BC postal code</label>
                <div class="finder-input">
                    <input
                        id="finder-postal"
                        autoComplete="postal-code"
                        placeholder="V6Y 1N9"
                        maxLength="7"
                        required
                        value={postal}
                        onInput={(event) =>
                            setPostal(event.currentTarget.value)
                        }
                    />
                    <button class="secondary" disabled={busy}>
                        Find
                    </button>
                </div>
            </form>
            <button
                class="secondary location-button"
                disabled={busy}
                onClick={useLocation}
            >
                Use my location
            </button>
            <div aria-live="polite">
                {busy && <p role="status">Finding your constituency…</p>}
                {error && <p role="alert">{error}</p>}
            </div>
            <div
                ref={mapNode}
                class="finder-map"
                role="region"
                aria-label="Constituency map. Click to place a location pin."
            />
            {result && (
                <section
                    class="finder-result"
                    aria-labelledby="finder-result-title"
                >
                    <h3 id="finder-result-title">
                        {result.status === 'ambiguous'
                            ? 'Possible constituencies'
                            : result.status === 'no_match'
                              ? 'No constituency match'
                              : 'Approximate constituency'}
                    </h3>
                    <p>
                        {result.method === 'postal_code'
                            ? 'Based on recorded postal-code locations. The pin shows one recorded point; these locations may not cover the entire postal-code area.'
                            : 'Based on your selected location. Your current location may differ from your home.'}
                    </p>
                    {result.districts.map((district) => (
                        <div
                            key={district.official_code}
                            class="finder-district"
                        >
                            <strong>{district.name}</strong>
                            {district.published ? (
                                <a
                                    href={`#/constituencies/${encodeURIComponent(district.official_code)}`}
                                    onClick={onClose}
                                >
                                    View candidates →
                                </a>
                            ) : (
                                <span>
                                    Candidate research is not yet published.
                                </span>
                            )}
                        </div>
                    ))}
                    {!result.districts.length && (
                        <p>
                            Try a point on land in British Columbia, or verify
                            with Elections BC.
                        </p>
                    )}
                </section>
            )}
            <p class="note">
                <strong>Approximate results.</strong> Postal codes can span
                boundaries, location readings can be imprecise, and your current
                location may differ from your home address. This finder does not
                determine your official electoral district.{' '}
                <a
                    href="https://elections.bc.ca/resources/maps/find-your-district/"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Confirm with Elections BC ↗
                </a>
                .
            </p>
            <p class="finder-sources">
                Postal locations:{' '}
                <a
                    href="https://www.geonames.org/export/zip/"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    GeoNames (CC BY 3.0, 2023 download)
                </a>{' '}
                and{' '}
                <a
                    href="https://www.statcan.gc.ca/en/lode/databases/oda"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Statistics Canada ODA (2021, Open Government Licence –
                    Canada)
                </a>
                . Boundaries:{' '}
                <a
                    href="https://elections.bc.ca/resources/maps/gis-spatial-data/"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Elections BC, 2023 redistribution
                </a>
                .
            </p>
            <p class="finder-sources">
                Locations are processed by this app’s server. Map tiles load
                from OpenStreetMap, which receives your IP and the map area you
                view. We do not save your location.
            </p>
        </dialog>
    );
}
