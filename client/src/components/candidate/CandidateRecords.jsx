import { statusLabel } from '../../helpers/labels.js';
import { SourceLink } from '../SourceLink.jsx';
import { VotingHistory } from './VotingHistory.jsx';
import { Interests } from './Interests.jsx';

export function CandidateRecords({ candidate, dataset, party }) {
    const person = dataset.people.find((row) => row.id === candidate.person_id);
    const coverage = dataset.coverage.find(
        (row) => row.person_id === candidate.person_id,
    );
    const votes = dataset.votes
        .filter((row) => row.person_id === candidate.person_id)
        .sort((a, b) => b.date.localeCompare(a.date));
    const interests = dataset.interests.filter(
        (row) => row.person_id === candidate.person_id,
    );
    const documents = dataset.disclosures.filter(
        (row) => row.person_id === candidate.person_id,
    );

    return (
        <article class="candidate">
            <div class="candidate-heading">
                <div>
                    <h3>{candidate.ballot_name}</h3>
                    <p class="affiliation">{party}</p>
                </div>
                <SourceLink href={candidate.source?.url}>
                    Official roster
                </SourceLink>
            </div>
            <div class="coverage-summary">
                <span>
                    Voting history: {statusLabel(coverage?.voting?.status)}
                </span>
                <span>
                    Interests: {statusLabel(coverage?.interests?.status)}
                </span>
            </div>
            <div class="candidate-records">
                {person?.office_history?.length > 0 && (
                    <div class="office-history">
                        <h4>Previous offices</h4>
                        {person.office_history.map((office, index) => (
                            <p key={index}>
                                {office.office} · {office.district_name} ·{' '}
                                {office.term_years}{' '}
                                <SourceLink href={office.source_url}>
                                    Source
                                </SourceLink>
                            </p>
                        ))}
                    </div>
                )}
                <VotingHistory
                    votes={votes}
                    coverage={coverage}
                    candidateName={candidate.ballot_name}
                />
                <Interests
                    interests={interests}
                    documents={documents}
                    coverage={coverage}
                />
            </div>
        </article>
    );
}
