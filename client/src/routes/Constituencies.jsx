import { useState } from 'preact/hooks';
import { districtHref } from '../helpers/routes.js';

export function Constituencies({ districts, onFind }) {
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const pageSize = 10;
    const matches = districts
        .filter((row) =>
            `${row.name} ${row.official_code}`
                .toLocaleLowerCase()
                .includes(query.trim().toLocaleLowerCase()),
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'en-CA'));
    const pages = Math.max(1, Math.ceil(matches.length / pageSize));
    const currentPage = Math.min(page, pages);
    const rows = matches.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize,
    );
    return (
        <>
            <div class="intro">
                <h1>Constituencies</h1>
                <p>
                    Find your constituency and explore the candidates running to
                    represent you as an MLA.
                </p>
            </div>
            <div class="constituency-tools">
                <div>
                    <label for="district-search">
                        Search by constituency name or code
                    </label>
                    <input
                        id="district-search"
                        type="search"
                        placeholder="For example, Richmond Centre"
                        value={query}
                        onInput={(event) => {
                            setQuery(event.currentTarget.value);
                            setPage(1);
                        }}
                    />
                </div>
                <button class="secondary" onClick={onFind}>
                    Find my constituency
                </button>
            </div>
            <p class="note">
                Only constituencies with published research appear here.
                Richmond Centre is the current pilot. Use the constituency
                finder if you’re unsure of your constituency.
            </p>
            <p class="result-count" role="status">
                {matches.length} constituencies · Alphabetical order
            </p>
            {rows.length ? (
                <div
                    class="table-scroll"
                    role="region"
                    aria-label="Constituencies"
                    tabIndex="0"
                >
                    <table class="constituency-table">
                        <thead>
                            <tr>
                                <th scope="col">Constituency</th>
                                <th scope="col">Code</th>
                                <th scope="col">Candidates</th>
                                <th scope="col">Roster</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.official_code}>
                                    <th scope="row">
                                        <a
                                            href={districtHref(
                                                row.official_code,
                                            )}
                                        >
                                            {row.name}
                                        </a>
                                    </th>
                                    <td>{row.official_code}</td>
                                    <td>{row.candidate_count}</td>
                                    <td>
                                        {row.roster_status === 'final_roster'
                                            ? 'Final candidate list'
                                            : 'Provisional candidate list'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p class="empty">
                    {districts.length
                        ? 'No published constituencies match your search.'
                        : 'No constituency research has been published yet.'}
                </p>
            )}
            <nav class="pagination" aria-label="Constituency pages">
                <button
                    class="secondary"
                    disabled={currentPage === 1}
                    onClick={() => setPage(currentPage - 1)}
                >
                    Previous
                </button>
                <span>
                    Page {currentPage} of {pages}
                </span>
                <button
                    class="secondary"
                    disabled={currentPage === pages}
                    onClick={() => setPage(currentPage + 1)}
                >
                    Next
                </button>
            </nav>
        </>
    );
}
