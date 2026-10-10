import { SourceLink } from '../SourceLink.jsx';
import { PoliticalRecord } from './PoliticalRecord.jsx';
import { Interests } from './Interests.jsx';

export function CandidateRecords({ candidate, dataset, research }) {
    const hasAlignment =
        research.profile?.alignment_analysis?.review_status ===
        'source_checked';
    const person = dataset.people.find((row) => row.id === candidate.person_id);
    const coverage = dataset.coverage.find(
        (row) => row.person_id === candidate.person_id,
    );
    const interests = dataset.interests.filter(
        (row) => row.person_id === candidate.person_id,
    );
    const documents = dataset.disclosures.filter(
        (row) => row.person_id === candidate.person_id,
    );

    return (
        <article class="candidate-profile">
            {!hasAlignment && (
                <div class="candidate-profile-intro">
                    <p>
                        Examine this candidate’s political choices against their
                        campaign commitments.
                    </p>
                    <SourceLink href={candidate.source?.url}>
                        Official roster
                    </SourceLink>
                </div>
            )}
            <div class="candidate-records">
                {person?.office_history?.length > 0 && (
                    <div
                        class={`office-history${hasAlignment ? ' office-history-compact' : ''}`}
                    >
                        {!hasAlignment && <h4>Previous offices</h4>}
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
                <PoliticalRecord
                    candidate={candidate}
                    dataset={dataset}
                    research={research}
                />
                <details class="candidate-disclosures">
                    <summary>
                        Disclosures and interests ({interests.length} reviewed
                        entries)
                    </summary>
                    <Interests
                        interests={interests}
                        documents={documents}
                        coverage={coverage}
                    />
                </details>
            </div>
        </article>
    );
}
