import { Table } from '../components/ui/Table.jsx';
import { useState } from 'preact/hooks';
import { PollingContext } from '../components/match/PollingContext.jsx';
import { partyName } from '../helpers/candidates.js';

const columns = [{ label: 'Candidate' }, { label: 'Party or affiliation' }];

export function District({ dataset, registry }) {
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
            <p>
                <a href="#/match">Compare your views with the parties →</a>
            </p>
            {dataset.candidacies.length > 8 && (
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
                            onInput={(event) =>
                                setQuery(event.currentTarget.value)
                            }
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
            )}
            <p class="result-count" role="status">
                {candidates.length} of {dataset.candidacies.length} candidates ·
                Alphabetical order
            </p>
            {candidates.length ? (
                <Table
                    label="Candidates"
                    columns={columns}
                    tableClass="candidate-table"
                >
                    {candidates.map((candidate) => {
                        return (
                            <tr key={candidate.id}>
                                <th scope="row">{candidate.ballot_name}</th>
                                <td>{affiliation(candidate)}</td>
                            </tr>
                        );
                    })}
                </Table>
            ) : (
                <p class="empty">
                    {dataset.candidacies.length
                        ? 'No candidates match these filters.'
                        : 'No candidates are listed in this published roster yet.'}
                </p>
            )}
            <PollingContext
                code={dataset.district.official_code}
                registry={registry}
            />
        </>
    );
}
