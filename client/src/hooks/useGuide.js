import { useVoterResource } from './useVoterResource.js';

export function useGuide(enabled = true) {
    const resource = useVoterResource(enabled ? '/api/guide' : null);
    return { ...resource, guide: resource.data };
}
