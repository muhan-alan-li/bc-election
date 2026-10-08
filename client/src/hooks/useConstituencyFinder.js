import { useEffect, useRef, useState } from 'preact/hooks';

export function useConstituencyFinder() {
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const request = useRef(null);
    const sequence = useRef(0);

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
        },
        [],
    );

    return { result, error, busy, lookup, useLocation };
}
