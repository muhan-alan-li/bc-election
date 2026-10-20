import { useVoterResource } from '../../hooks/useVoterResource.js';
import { SourceLink } from '../ui/SourceLink.jsx';
import { RetryError } from '../ui/RetryError.jsx';
import { isStale } from '../../helpers/matcher.js';

export function RidingOutlook({ row, parties, methodology }) {
    const leader = parties.find((p) => p.id === row.leaderPartyID);
    return (
        <article class="riding-outlook">
            <p class="eyebrow">Constituency projection · {row.asOf}</p>
            <h3>{row.name}</h3>
            <p class="outlook-verdict">
                {row.outlook === 'toss_up'
                    ? 'Toss-up — no clear projected leader'
                    : `${leader?.name || 'Party unavailable'} · ${row.outlook}`}
            </p>
            {isStale(row.asOf) && (
                <p class="stale-data">
                    This projection is more than 14 days old. Check the source
                    for updates.
                </p>
            )}
            <p>
                This is a model estimate, not a poll of voters in this
                constituency. A projected lead is uncertain and does not predict
                every candidate’s support.
            </p>
            <p class="source-line">
                <SourceLink href={row.source.url}>
                    {row.source.label}
                </SourceLink>{' '}
                ·{' '}
                <SourceLink href={methodology.url}>
                    {methodology.label}
                </SourceLink>
            </p>
        </article>
    );
}

export function PollingContext({ code, registry, showSurveys = true }) {
    const { data, loading, error, retry } = useVoterResource('/api/polling');
    const parties = registry.data?.parties || [];
    if (registry.loading)
        return <p role="status">Loading polling party labels…</p>;
    if (registry.error)
        return <RetryError error={registry.error} onRetry={registry.retry} />;
    if (loading) return <p role="status">Loading polling context…</p>;
    if (error) return <RetryError error={error} onRetry={retry} />;
    if (!data) return null;
    const row = data.districts.find((d) => d.code === code);
    return (
        <section class="polling-context" aria-label="Polling and projections">
            {row ? (
                <RidingOutlook
                    row={row}
                    parties={parties}
                    methodology={data.methodology}
                />
            ) : (
                <p class="note">
                    {code
                        ? 'No constituency projection has been collected for this riding.'
                        : 'Choose your constituency to see its projected race.'}
                </p>
            )}
            {code && (
                <p class="coverage-note">
                    No direct constituency poll is included in this collection.
                    That does not establish that none exists.
                </p>
            )}
            {showSurveys && (
                <details class="province-polls">
                    <summary>
                        Province-wide polls · {data.surveys.length} collected
                        surveys
                    </summary>
                    <p>
                        These surveys cover BC as a whole. Their percentages do
                        not show who leads in your constituency. Parties not
                        reported separately are not assigned zero support.
                    </p>
                    {[...data.surveys]
                        .sort((a, b) =>
                            b.fieldworkEnd.localeCompare(a.fieldworkEnd),
                        )
                        .map((poll) => (
                            <article key={poll.id} class="survey">
                                <h3>
                                    {poll.pollster} · {poll.fieldworkStart} to{' '}
                                    {poll.fieldworkEnd}
                                </h3>
                                <p class="coverage-note">
                                    Published {poll.publishedOn} · {poll.method}{' '}
                                    · Total sample{' '}
                                    {poll.sampleSize.toLocaleString('en-CA')}
                                </p>
                                {isStale(poll.fieldworkEnd) && (
                                    <p class="stale-data">
                                        This survey’s fieldwork ended more than
                                        14 days ago.
                                    </p>
                                )}
                                <dl class="poll-bars">
                                    {poll.results.map((result) => {
                                        const party = parties.find(
                                            (p) => p.id === result.partyID,
                                        );
                                        return (
                                            <div
                                                key={result.partyID}
                                                class="poll-bar-row"
                                            >
                                                <dt>
                                                    {result.partyID === 'other'
                                                        ? 'Other / independent'
                                                        : party?.name ||
                                                          'Party label unavailable'}
                                                </dt>
                                                <dd>
                                                    <span
                                                        class="poll-bar"
                                                        style={{
                                                            width: `${result.share}%`,
                                                            background:
                                                                party?.color ||
                                                                'var(--ink3)',
                                                        }}
                                                        aria-hidden="true"
                                                    />
                                                    <span>{result.share}%</span>
                                                </dd>
                                            </div>
                                        );
                                    })}
                                </dl>
                                <p class="coverage-note">
                                    {poll.population}. {poll.uncertainty}
                                </p>
                                <SourceLink href={poll.source.url}>
                                    {poll.source.label}
                                </SourceLink>
                            </article>
                        ))}
                    {!data.surveys.length && (
                        <p>No province-wide surveys have been collected yet.</p>
                    )}
                </details>
            )}
            <p class="coverage-note">
                Collection checked {data.collectedAt.slice(0, 10)}. This is a
                dated collection, not a live feed.
            </p>
        </section>
    );
}
