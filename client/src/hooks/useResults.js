import { useVoterResource } from './useVoterResource.js';

export function useResults(enabled = true) {
    const resource = useVoterResource(enabled ? '/api/results' : null);
    return {
        results: resource.data,
        loading: resource.loading,
        error: resource.error,
        retry: resource.retry,
    };
}

export function useCabinet(enabled = true) {
    const resource = useVoterResource(enabled ? '/api/cabinet' : null);
    return {
        cabinet: resource.data,
        loading: resource.loading,
        error: resource.error,
        retry: resource.retry,
    };
}
