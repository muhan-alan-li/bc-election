import { useEffect, useState } from 'preact/hooks';
import { parseRoute } from '../helpers/routes.js';
import { useVoterResource } from './useVoterResource.js';

export function useElectionData() {
    const [route, setRoute] = useState(parseRoute);
    useEffect(() => {
        const navigate = () => setRoute(parseRoute());
        window.addEventListener('hashchange', navigate);
        return () => window.removeEventListener('hashchange', navigate);
    }, []);
    const catalog = useVoterResource(
        route.view === 'constituencies' ? '/api/districts' : null,
    );
    const ballot = useVoterResource(
        route.code
            ? `/api/districts/${encodeURIComponent(route.code)}/ballot`
            : null,
    );
    return {
        route,
        districts: catalog.data?.districts || [],
        dataset: ballot.data,
        catalogLoading: catalog.loading,
        loading: ballot.loading,
        catalogError: catalog.error,
        error: ballot.error,
        retryCatalog: catalog.retry,
        retryBallot: ballot.retry,
    };
}
