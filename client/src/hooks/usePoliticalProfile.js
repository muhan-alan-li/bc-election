import { useEffect, useState } from 'preact/hooks';
import { getJSON } from '../helpers/api.js';

export function usePoliticalProfile(candidate, dataset) {
    const [loaded, setLoaded] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [partyError, setPartyError] = useState('');
    const [attempt, setAttempt] = useState(0);
    const electionID = dataset.election.id;
    useEffect(() => {
        const controller = new AbortController();
        setLoaded(null);
        setError('');
        setPartyError('');
        setLoading(true);
        getJSON(
            `/api/political/candidates/${encodeURIComponent(candidate.id)}`,
            controller.signal,
        )
            .then(async (profile) => {
                if (
                    profile.id !== candidate.id ||
                    profile.person_id !== candidate.person_id ||
                    profile.election_id !== electionID ||
                    !Array.isArray(profile.actions) ||
                    !Array.isArray(profile.policy_passages)
                ) {
                    throw new Error(
                        'The political profile does not match this candidate.',
                    );
                }
                if (controller.signal.aborted) return;
                setLoaded({ id: candidate.id, profile, party: null });
                if (profile.party_platform_id) {
                    try {
                        const party = await getJSON(
                            `/api/political/parties/${encodeURIComponent(profile.party_platform_id)}`,
                            controller.signal,
                        );
                        if (
                            party.id !== profile.party_platform_id ||
                            party.election_id !== electionID ||
                            !Array.isArray(party.policy_passages)
                        )
                            throw new Error(
                                'The party record does not match this candidate.',
                            );
                        if (!controller.signal.aborted)
                            setLoaded({ id: candidate.id, profile, party });
                    } catch (cause) {
                        if (!controller.signal.aborted && cause.status !== 404)
                            setPartyError(cause.message);
                    }
                }
            })
            .catch((cause) => {
                if (!controller.signal.aborted && cause.status !== 404)
                    setError(cause.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [candidate.id, candidate.person_id, electionID, attempt]);
    const current = loaded?.id === candidate.id ? loaded : null;
    return {
        profile: current?.profile,
        party: current?.party,
        loading,
        error,
        partyError,
        retry: () => setAttempt((value) => value + 1),
    };
}
