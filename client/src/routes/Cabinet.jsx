import { Table } from '../components/ui/Table.jsx';
import { SourceLink } from '../components/ui/SourceLink.jsx';
import { formatDate, partyLookup } from '../helpers/results.js';

const columns = [
    { label: 'Portfolio' },
    { label: 'Minister' },
    { label: 'Party' },
    { label: 'Constituency' },
];

export function Cabinet({ cabinet, parties }) {
    const partyById = partyLookup(parties);
    const premierParty = partyById.get(cabinet.premier.partyID);
    const pending = cabinet.ministers.length === 0;

    return (
        <article class="cabinet-page">
            <p class="eyebrow">Government formation</p>
            <h2 class="cabinet-status">{cabinet.statusLabel}</h2>
            <p class="results-standfirst">{cabinet.summary}</p>

            <section
                class="premier-card"
                style={{
                    '--party-color': premierParty?.color || '#8a8f98',
                }}
                aria-label={`${cabinet.premier.title} ${cabinet.premier.name}`}
            >
                <p class="eyebrow">{cabinet.premier.title}</p>
                <h2 class="premier-name">{cabinet.premier.name}</h2>
                <p class="party-cell">
                    <span
                        class="party-swatch"
                        style={{
                            background: premierParty?.color || '#8a8f98',
                        }}
                        aria-hidden="true"
                    />
                    {premierParty?.name || 'Unknown party'}
                    {cabinet.premier.riding
                        ? ` · ${cabinet.premier.riding}`
                        : ''}
                </p>
                {cabinet.premier.note && (
                    <p class="note">{cabinet.premier.note}</p>
                )}
            </section>

            <section aria-labelledby="ministers-title">
                <h2 id="ministers-title">Ministers</h2>
                {pending ? (
                    <p class="empty">
                        No ministers have been appointed yet. This page will
                        list portfolios, ministers and constituencies once the
                        ministry is sworn in.
                    </p>
                ) : (
                    <Table
                        label="Cabinet ministers"
                        columns={columns}
                        tableClass="cabinet-table"
                    >
                        {cabinet.ministers.map((minister) => (
                            <tr key={minister.portfolio}>
                                <th scope="row">{minister.portfolio}</th>
                                <td data-label="Minister">{minister.name}</td>
                                <td data-label="Party">
                                    {partyById.get(minister.partyID)?.name ||
                                        'Unknown party'}
                                </td>
                                <td data-label="Constituency">
                                    {minister.riding || '—'}
                                </td>
                            </tr>
                        ))}
                    </Table>
                )}
            </section>

            <section aria-labelledby="cabinet-timeline-title">
                <h2 id="cabinet-timeline-title">Timeline</h2>
                <ol class="timeline">
                    {cabinet.timeline.map((item) => (
                        <li key={item.label}>
                            <span class="timeline-date">
                                {item.date
                                    ? formatDate(item.date)
                                    : 'Not yet scheduled'}
                            </span>
                            <span>{item.label}</span>
                        </li>
                    ))}
                </ol>
            </section>

            <p class="note">
                Cabinet coverage will be updated when appointments are
                announced. Sources:{' '}
                {cabinet.sources.map((source, index) => (
                    <span key={source.url}>
                        {index > 0 ? ' · ' : ''}
                        <SourceLink href={source.url}>
                            {source.label}
                        </SourceLink>
                    </span>
                ))}
            </p>
        </article>
    );
}
