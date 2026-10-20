import { requestJSON } from '../helpers/api.js';
import { useEffect, useRef, useState } from 'preact/hooks';
import { staticSite } from '../helpers/deployment.js';
import { createStaticFinder } from '../helpers/finder/client.js';

export function useConstituencyFinder() {
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const request = useRef(null);
    const sequence = useRef(0);
    const staticFinder = useRef(null);

    async function lookup(input) {
        const id = ++sequence.current;
        request.current?.abort();
        request.current = new AbortController();
        setBusy(true);
        setError('');
        setResult(null);
        try {
            if (staticSite && !staticFinder.current)
                staticFinder.current = createStaticFinder();
            const body = staticSite
                ? await staticFinder.current.lookup(
                      input,
                      request.current.signal,
                  )
                : await requestJSON('/api/constituency-finder', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(input),
                      signal: request.current.signal,
                  });
            if (id === sequence.current) setResult(body);
        } catch (error) {
            if (id === sequence.current && error.name !== 'AbortError')
                setError(error.message);
        } finally {
            if (id === sequence.current) setBusy(false);
        }
    }

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

    useEffect(
        () => () => {
            sequence.current++;
            request.current?.abort();
            staticFinder.current?.dispose();
        },
        [],
    );

    return { result, error, busy, lookup, useLocation };
}
