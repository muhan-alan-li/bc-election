import { useEffect, useState } from 'preact/hooks';
import { getJSON } from '../helpers/api.js';

export function useVoterResource(path) {
    const [state, setState] = useState({ path: null, data: null, error: '' });
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        if (!path) return;
        const controller = new AbortController();
        // Keep data that is already on screen while the refetch runs, so a
        // route change does not flash a loading message over loaded content.
        setState((previous) =>
            previous.path === path && previous.data
                ? previous
                : { path, data: null, error: '' },
        );
        getJSON(path, controller.signal)
            .then((data) => {
                if (!controller.signal.aborted)
                    setState({ path, data, error: '' });
            })
            .catch((error) => {
                if (!controller.signal.aborted)
                    setState({ path, data: null, error: error.message });
            });
        return () => controller.abort();
    }, [path, attempt]);
    const current = state.path === path ? state : { data: null, error: '' };
    return {
        ...current,
        loading: !!path && !current.data && !current.error,
        retry: () => setAttempt((n) => n + 1),
    };
}
