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

    return (
        <article class="cabinet-page">
            <p class="cabinet-status">{cabinet.statusLabel}</p>

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
                    <span>
                        {premierParty?.name || 'Unknown party'}
                        {cabinet.premier.riding
                            ? ` · ${cabinet.premier.riding}`
                            : ''}
                        {cabinet.premier.note && (
                            <span class="muted"> · {cabinet.premier.note}</span>
                        )}
                    </span>
                </p>
            </section>

            {cabinet.ministers.length > 0 && (
                <section aria-labelledby="ministers-title">
                    <h2 id="ministers-title">Ministers</h2>
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
                </section>
            )}

            <section aria-labelledby="cabinet-timeline-title">
                <h2 id="cabinet-timeline-title" class="section-heading">
                    Formation timeline
                </h2>
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

            <p class="results-meta">
                Sources:{' '}
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
