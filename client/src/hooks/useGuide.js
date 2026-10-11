import { useEffect, useState } from 'preact/hooks';
import { getJSON } from '../helpers/api.js';

export function useGuide() {
    const [guide, setGuide] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError('');
        getJSON('/api/guide', controller.signal)
            .then((data) => {
                if (!controller.signal.aborted) setGuide(data);
            })
            .catch((cause) => {
                if (!controller.signal.aborted) setError(cause.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [attempt]);
    return {
        guide,
        loading,
        error,
        retry: () => setAttempt((value) => value + 1),
    };
}
