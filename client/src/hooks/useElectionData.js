import { useEffect, useState } from 'preact/hooks';
import { getJSON } from '../helpers/api.js';
import { parseRoute } from '../helpers/routes.js';

export function useElectionData() {
    const [route, setRoute] = useState(parseRoute);
    const [districts, setDistricts] = useState([]);
    const [loaded, setLoaded] = useState(null);
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [loading, setLoading] = useState(false);
    const [catalogError, setCatalogError] = useState('');
    const [error, setError] = useState('');
    const [retry, setRetry] = useState(0);

    useEffect(() => {
        const navigate = () => setRoute(parseRoute());
        window.addEventListener('hashchange', navigate);

        return () => window.removeEventListener('hashchange', navigate);
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        setCatalogLoading(true);
        setCatalogError('');
        getJSON('/api/districts', controller.signal)
            .then((body) => setDistricts(body.districts))
            .catch((error) => {
                if (!controller.signal.aborted) setCatalogError(error.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) setCatalogLoading(false);
            });

        return () => controller.abort();
    }, [retry]);

    useEffect(() => {
        setError('');
        setLoaded(null);
        if (!route.code) {
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        setLoading(true);
        getJSON(
            `/api/districts/${encodeURIComponent(route.code)}`,
            controller.signal,
        )
            .then((data) => {
                if (!controller.signal.aborted)
                    setLoaded({ code: route.code, data });
            })
            .catch((error) => {
                if (!controller.signal.aborted) setError(error.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });

        return () => controller.abort();
    }, [route.code, retry]);

    const dataset = loaded && loaded.code === route.code ? loaded.data : null;

    return {
        route,
        districts,
        dataset,
        catalogLoading,
        loading,
        catalogError,
        error,
        retry: () => setRetry((value) => value + 1),
    };
}
