import { useEffect, useState } from 'preact/hooks';
import catalog from 'political-profile-catalog';
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
        const path =
            catalog.electionID === electionID &&
            catalog.candidates[candidate.id];
        if (!path) {
            setLoading(false);
            return () => controller.abort();
        }
        setLoading(true);
        getJSON(path, controller.signal)
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
                const partyPath = catalog.parties[profile.party_platform_id];
                if (partyPath) {
                    try {
                        const party = await getJSON(
                            partyPath,
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
                        if (!controller.signal.aborted)
                            setPartyError(cause.message);
                    }
                }
            })
            .catch((cause) => {
                if (!controller.signal.aborted) setError(cause.message);
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
