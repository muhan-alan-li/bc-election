import { partyName } from '../helpers/candidates.js';
import { CandidateRecords } from '../components/candidate/CandidateRecords.jsx';

export function Candidate({ candidate, dataset }) {
    const party = partyName(candidate, dataset);

    return (
        <>
            <div class="intro">
                <p class="eyebrow">
                    {dataset.district.name} · Candidate for MLA
                </p>
                <h1>{candidate.ballot_name}</h1>
                <p>{party}</p>
            </div>
            <CandidateRecords
                key={candidate.id}
                candidate={candidate}
                dataset={dataset}
                party={party}
            />
        </>
    );
}
