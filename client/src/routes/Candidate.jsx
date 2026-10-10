import { CandidateRecords } from '../components/candidate/CandidateRecords.jsx';
import { usePoliticalProfile } from '../hooks/usePoliticalProfile.js';

export function Candidate({ candidate, dataset }) {
    const research = usePoliticalProfile(candidate, dataset);

    return (
        <>
            <CandidateRecords
                key={candidate.id}
                candidate={candidate}
                dataset={dataset}
                research={research}
            />
        </>
    );
}
