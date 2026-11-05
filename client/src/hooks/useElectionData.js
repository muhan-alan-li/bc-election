import { useEffect, useState } from 'preact/hooks';
import { parseRoute } from '../helpers/routes.js';
import { useCabinet, useResults } from './useResults.js';

export function useElectionData() {
    const [route, setRoute] = useState(parseRoute);
    useEffect(() => {
        const navigate = () => setRoute(parseRoute());
        window.addEventListener('hashchange', navigate);
        return () => window.removeEventListener('hashchange', navigate);
    }, []);
    const results = useResults(
        [
            'results',
            'constituencies',
            'district',
            'cabinet',
            'parties',
        ].includes(route.view),
    );
    const cabinet = useCabinet(route.view === 'cabinet');
    return {
        route,
        results: results.results,
        resultsLoading: results.loading,
        resultsError: results.error,
        retryResults: results.retry,
        cabinet: cabinet.cabinet,
        cabinetLoading: cabinet.loading,
        cabinetError: cabinet.error,
        retryCabinet: cabinet.retry,
    };
}
