import { paginate } from '../helpers/pagination.js';
import { Table } from '../components/ui/Table.jsx';
import { Pagination } from '../components/ui/Pagination.jsx';
import { useState } from 'preact/hooks';
import { districtHref } from '../helpers/routes.js';
import { useStarredConstituencies } from '../hooks/useStarredConstituencies.js';
import { useAdaptivePageSize } from '../hooks/useAdaptivePageSize.js';

const columns = [
    { label: 'Star', class: 'star-column' },
    { label: 'Constituency' },
    { label: 'Code' },
    { label: 'Candidates' },
    { label: 'Roster' },
];

export function Constituencies({ districts, onFind }) {
    const [query, setQuery] = useState('');
    const [starredOnly, setStarredOnly] = useState(false);
    const [page, setPage] = useState(1);
    const { starred, toggleStar } = useStarredConstituencies();

    const matches = districts
        .filter(
            (row) =>
                (!starredOnly || starred.includes(row.official_code)) &&
                `${row.name} ${row.official_code}`
                    .toLocaleLowerCase()
                    .includes(query.trim().toLocaleLowerCase()),
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'en-CA'));
    const { pageSize, tableRef, paginationRef, controlsRef } =
        useAdaptivePageSize(query, matches.length, page);

    const { pages, currentPage, rows } = paginate(matches, page, pageSize);

    return (
        <>
            <div ref={controlsRef} class="constituency-tools">
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
                <button
                    type="button"
                    class="secondary starred-filter"
                    aria-pressed={starredOnly}
                    onClick={() => {
                        setStarredOnly((value) => !value);
                        setPage(1);
                    }}
                >
                    <span aria-hidden="true">★</span> Starred only
                </button>
                <button class="secondary" onClick={onFind}>
                    Find my constituency
                </button>
            </div>
            <p class="result-count" role="status">
                {matches.length} constituencies · Alphabetical order
            </p>
            {rows.length ? (
                <Table
                    label="Constituencies"
                    columns={columns}
                    tableClass="constituency-table"
                    tableRef={tableRef}
                >
                    {rows.map((row) => (
                        <tr key={row.official_code}>
                            <td class="star-column">
                                <button
                                    type="button"
                                    class="star-button"
                                    aria-pressed={starred.includes(
                                        row.official_code,
                                    )}
                                    aria-label={`${starred.includes(row.official_code) ? 'Unstar' : 'Star'} ${row.name}`}
                                    onClick={() =>
                                        toggleStar(row.official_code)
                                    }
                                >
                                    {starred.includes(row.official_code)
                                        ? '★'
                                        : '☆'}
                                </button>
                            </td>
                            <th scope="row">
                                <a href={districtHref(row.official_code)}>
                                    {row.name}
                                </a>
                            </th>
                            <td data-label="Code">{row.official_code}</td>
                            <td data-label="Candidates">
                                {row.candidate_count}
                            </td>
                            <td data-label="Roster">
                                {row.roster_status === 'final_roster'
                                    ? 'Final candidate list'
                                    : 'Provisional candidate list'}
                            </td>
                        </tr>
                    ))}
                </Table>
            ) : (
                <p class="empty">
                    {!districts.length
                        ? 'No constituencies have been published yet.'
                        : starredOnly
                          ? query.trim()
                              ? 'No starred constituencies match your search.'
                              : 'No starred constituencies to show. Star a constituency in the full list to save it here.'
                          : 'No published constituencies match your search.'}
                </p>
            )}
            <Pagination
                currentPage={currentPage}
                pages={pages}
                onPageChange={setPage}
                paginationRef={paginationRef}
                label="Constituency pages"
            />
        </>
    );
}
