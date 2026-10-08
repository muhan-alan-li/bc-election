import { partyName } from '../helpers/candidates.js';
import { CandidateRecords } from '../components/candidate/CandidateRecords.jsx';

export function Candidate({ candidate, dataset }) {
    const party = partyName(candidate, dataset);

    return (
        <>
            <CandidateRecords
                key={candidate.id}
                candidate={candidate}
                dataset={dataset}
                party={party}
            />
        </>
    );
}
