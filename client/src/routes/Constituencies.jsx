import { paginate } from '../helpers/pagination.js';
import { Table } from '../components/ui/Table.jsx';
import { Pagination } from '../components/ui/Pagination.jsx';
import { useState } from 'preact/hooks';
import { districtHref } from '../helpers/routes.js';
import { useStarredConstituencies } from '../hooks/useStarredConstituencies.js';
import { useAdaptivePageSize } from '../hooks/useAdaptivePageSize.js';
import {
    formatNumber,
    formatPercent,
    partyLookup,
    seatHolders,
    shortPartyName,
} from '../helpers/results.js';

const columns = [
    { label: 'Star', class: 'star-column', visuallyHidden: true },
    { label: 'Constituency' },
    { label: 'Elected' },
    { label: 'Party' },
    { label: 'Vote share' },
    { label: 'Margin' },
];

const sortOptions = [
    { value: 'name', label: 'Alphabetical' },
    { value: 'closest', label: 'Closest races' },
    { value: 'largest', label: 'Largest wins' },
];

export function Constituencies({ results, onFind, finderButtonRef }) {
    const [query, setQuery] = useState('');
    const [partyFilter, setPartyFilter] = useState('');
    const [sort, setSort] = useState('name');
    const [starredOnly, setStarredOnly] = useState(false);
    const [page, setPage] = useState(1);
    const { starred, toggleStar } = useStarredConstituencies();

    const districts = Object.values(results.districts);
    const partyById = partyLookup(results.parties);
    const parties = seatHolders(results.parties);
    const name = (id) => shortPartyName(partyById.get(id));

    const matches = districts
        .filter(
            (row) =>
                (!starredOnly || starred.includes(row.code)) &&
                (!partyFilter || row.winner.party_id === partyFilter) &&
                `${row.name} ${row.code} ${row.winner.name} ${name(
                    row.winner.party_id,
                )}`
                    .toLocaleLowerCase()
                    .includes(query.trim().toLocaleLowerCase()),
        )
        .sort((a, b) => {
            if (sort === 'closest') return a.margin.points - b.margin.points;
            if (sort === 'largest')
                return b.winner.vote_share - a.winner.vote_share;
            return a.name.localeCompare(b.name, 'en-CA');
        });
    const { pageSize, tableRef, paginationRef, controlsRef } =
        useAdaptivePageSize(
            `${query}${partyFilter}${sort}`,
            matches.length,
            page,
        );

    const { pages, currentPage, rows } = paginate(matches, page, pageSize);
    const reset = () => setPage(1);
    const filtered = Boolean(query.trim() || partyFilter || starredOnly);
    const count = [
        filtered
            ? `${matches.length} of ${districts.length} constituencies`
            : `${districts.length} constituencies`,
        partyFilter ? partyById.get(partyFilter)?.name : '',
        starredOnly ? 'starred' : '',
        sort === 'name'
            ? ''
            : sortOptions.find((option) => option.value === sort)?.label,
    ]
        .filter(Boolean)
        .join(' · ');

    return (
        <>
            <div ref={controlsRef} class="results-tools">
                <div class="results-search">
                    <label for="district-search">Search</label>
                    <input
                        id="district-search"
                        type="search"
                        placeholder="Constituency, member or party"
                        value={query}
                        onInput={(event) => {
                            setQuery(event.currentTarget.value);
                            reset();
                        }}
                    />
                </div>
                <div>
                    <label for="party-filter">Party</label>
                    <select
                        id="party-filter"
                        value={partyFilter}
                        onChange={(event) => {
                            setPartyFilter(event.currentTarget.value);
                            reset();
                        }}
                    >
                        <option value="">All parties</option>
                        {parties.map((party) => (
                            <option key={party.id} value={party.id}>
                                {party.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label for="result-sort">Sort</label>
                    <select
                        id="result-sort"
                        value={sort}
                        onChange={(event) => {
                            setSort(event.currentTarget.value);
                            reset();
                        }}
                    >
                        {sortOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
                <div class="results-tool-buttons">
                    <button
                        type="button"
                        class="secondary starred-filter"
                        aria-pressed={starredOnly}
                        onClick={() => {
                            setStarredOnly((value) => !value);
                            reset();
                        }}
                    >
                        <span aria-hidden="true">★</span> Starred only
                    </button>
                    <button
                        type="button"
                        class="secondary"
                        onClick={onFind}
                        ref={finderButtonRef}
                    >
                        Find my constituency
                    </button>
                </div>
            </div>
            <p class="result-count" role="status">
                {count}
            </p>
            {rows.length ? (
                <Table
                    label="Constituency results"
                    columns={columns}
                    tableClass="constituency-table"
                    tableRef={tableRef}
                >
                    {rows.map((row) => {
                        const party = partyById.get(row.winner.party_id);
                        return (
                            <tr key={row.code}>
                                <td class="star-column">
                                    <button
                                        type="button"
                                        class="star-button"
                                        aria-pressed={starred.includes(
                                            row.code,
                                        )}
                                        aria-label={`${
                                            starred.includes(row.code)
                                                ? 'Unstar'
                                                : 'Star'
                                        } ${row.name}`}
                                        onClick={() => toggleStar(row.code)}
                                    >
                                        {starred.includes(row.code) ? '★' : '☆'}
                                    </button>
                                </td>
                                <th scope="row">
                                    <a href={districtHref(row.code)}>
                                        {row.name}
                                    </a>
                                </th>
                                <td data-label="Elected">{row.winner.name}</td>
                                <td data-label="Party">
                                    <span class="party-cell">
                                        <span
                                            class="party-swatch"
                                            style={{
                                                background:
                                                    party?.color || '#8a8f98',
                                            }}
                                            aria-hidden="true"
                                        />
                                        {party?.name || 'Unknown party'}
                                    </span>
                                </td>
                                <td data-label="Vote share">
                                    {formatPercent(row.winner.vote_share)}
                                </td>
                                <td data-label="Margin">
                                    {formatNumber(row.margin.votes)} votes
                                    <span class="muted">
                                        {' · '}
                                        {row.margin.points.toFixed(1)} pts
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                </Table>
            ) : (
                <p class="empty">
                    {!districts.length
                        ? 'No constituency results have been published yet.'
                        : starredOnly
                          ? query.trim()
                              ? 'No starred constituencies match your search.'
                              : 'No starred constituencies to show. Star a constituency in the full list to save it here.'
                          : 'No constituencies match these filters.'}
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
