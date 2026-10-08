import { SourceLink } from '../components/SourceLink.jsx';
import { useState } from 'preact/hooks';
import { dateLabel, statusLabel } from '../helpers/labels.js';
import { candidateHref } from '../helpers/routes.js';
import { partyName } from '../helpers/candidates.js';

export function District({ dataset }) {
    const [query, setQuery] = useState('');
    const [partyFilter, setPartyFilter] = useState('');
    const affiliation = (candidate) => partyName(candidate, dataset);
    const candidates = dataset.candidacies
        .filter(
            (candidate) =>
                `${candidate.ballot_name} ${affiliation(candidate)}`
                    .toLocaleLowerCase()
                    .includes(query.trim().toLocaleLowerCase()) &&
                (!partyFilter || affiliation(candidate) === partyFilter),
        )
        .sort((a, b) => a.ballot_name.localeCompare(b.ballot_name, 'en-CA'));
    const parties = [...new Set(dataset.candidacies.map(affiliation))].sort();

    return (
        <>
            <div class="intro">
                <p class="eyebrow">{dataset.election.title}</p>
                <h1>{dataset.district.name}</h1>
                <p>Candidates for MLA · Listed alphabetically.</p>
            </div>
            <p class="note">
                Roster:{' '}
                {dataset.district.roster_status === 'final_roster'
                    ? 'Final candidate list'
                    : 'Provisional candidate list'}{' '}
                · Research assembled {dateLabel(dataset.generated_at)}. Records
                may cover earlier dates.{' '}
                <SourceLink href={dataset.election.source_url}>
                    Elections BC
                </SourceLink>
            </p>
            <div class="filters">
                <div>
                    <label for="candidate-search">
                        Search candidates or parties
                    </label>
                    <input
                        id="candidate-search"
                        type="search"
                        placeholder="Name or party"
                        value={query}
                        onInput={(event) => setQuery(event.currentTarget.value)}
                    />
                </div>
                <div>
                    <label for="party-filter">Party or affiliation</label>
                    <select
                        id="party-filter"
                        value={partyFilter}
                        onChange={(event) =>
                            setPartyFilter(event.currentTarget.value)
                        }
                    >
                        <option value="">All affiliations</option>
                        {parties.map((party) => (
                            <option key={party}>{party}</option>
                        ))}
                    </select>
                </div>
            </div>
            <p class="result-count" role="status">
                {candidates.length} of {dataset.candidacies.length} candidates ·
                Alphabetical order
            </p>
            {candidates.length ? (
                <div
                    class="table-scroll"
                    role="region"
                    aria-label="Candidates"
                    tabIndex="0"
                >
                    <table class="candidate-table">
                        <thead>
                            <tr>
                                <th scope="col">Candidate</th>
                                <th scope="col">Party or affiliation</th>
                                <th scope="col">Voting history</th>
                                <th scope="col">Interests</th>
                            </tr>
                        </thead>
                        <tbody>
                            {candidates.map((candidate) => {
                                const coverage = dataset.coverage.find(
                                    (row) =>
                                        row.person_id === candidate.person_id,
                                );

                                return (
                                    <tr key={candidate.id}>
                                        <th scope="row">
                                            <a
                                                href={candidateHref(
                                                    dataset.district
                                                        .official_code,
                                                    candidate.id,
                                                )}
                                            >
                                                {candidate.ballot_name}
                                            </a>
                                        </th>
                                        <td>{affiliation(candidate)}</td>
                                        <td>
                                            {statusLabel(
                                                coverage?.voting?.status,
                                            )}
                                        </td>
                                        <td>
                                            {statusLabel(
                                                coverage?.interests?.status,
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p class="empty">
                    {dataset.candidacies.length
                        ? 'No candidates match these filters.'
                        : 'No candidates are listed in this published roster yet.'}
                </p>
            )}
        </>
    );
}
