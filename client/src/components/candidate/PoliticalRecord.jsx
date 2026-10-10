import { useState } from 'preact/hooks';
import {
    filterActions,
    isVote,
    topicLabel,
    visibleActions,
} from '../../helpers/political.js';
import { ActionRecord } from './ActionRecord.jsx';
import { PlatformEvidence } from './PlatformEvidence.jsx';
import { IssuePatterns } from './IssuePatterns.jsx';
import { PlatformAlignment } from './PlatformAlignment.jsx';

export function PoliticalRecord({ candidate, dataset, research }) {
    const [topic, setTopic] = useState('all');
    const [type, setType] = useState('all');
    const [query, setQuery] = useState('');
    const [limit, setLimit] = useState(10);
    const { profile, party, loading, error, partyError, retry } = research;
    const actions = visibleActions(profile, dataset, candidate);
    const votes = actions.filter(isVote);
    const other = actions.filter((action) => !isVote(action));
    const filtered = filterActions(actions, { topic, type, query });
    const topics = [
        ...new Set([
            ...actions.flatMap((action) => action.topics || []),
            ...(profile?.issue_analysis?.issue_findings || []).map(
                (finding) => finding.topic,
            ),
            ...(profile?.policy_passages || []).flatMap(
                (passage) => passage.topics || [],
            ),
            ...(party?.policy_passages || []).flatMap(
                (passage) => passage.topics || [],
            ),
        ]),
    ].sort((a, b) => topicLabel(a).localeCompare(topicLabel(b)));
    const pendingVotes = Math.max(
        0,
        (profile?.coverage?.voting?.count || 0) - votes.length,
    );
    const pendingWork = Math.max(
        0,
        (profile?.coverage?.other_actions?.count || 0) - other.length,
    );
    function resetFilters() {
        setTopic('all');
        setType('all');
        setQuery('');
        setLimit(10);
    }
    if (profile?.alignment_analysis?.review_status === 'source_checked') {
        return <PlatformAlignment profile={profile} />;
    }
    return (
        <section
            class="political-record"
            aria-label={`Political record for ${candidate.ballot_name}`}
        >
            <div class="record-summary">
                <div>
                    <strong>{votes.length}</strong>
                    <span>Published votes</span>
                    <small>
                        {pendingVotes
                            ? `${pendingVotes} possible entries await attribution review`
                            : 'Named positions in voting indexes'}
                    </small>
                </div>
                <div>
                    <strong>{other.length}</strong>
                    <span>Published political actions</span>
                    <small>
                        {pendingWork
                            ? `${pendingWork} possible actions await attribution review`
                            : 'Motions, amendments and introductions'}
                    </small>
                </div>
                <div>
                    <strong>{profile?.policy_passages.length ?? '—'}</strong>
                    <span>Candidate-source passages</span>
                    <small>Collected policy material · Unreviewed</small>
                </div>
            </div>
            {loading && (
                <p class="record-review" role="status">
                    Loading political records and platform context…
                </p>
            )}
            {!profile && !loading && !error && (
                <p class="record-review">
                    Additional research by policy topic is not yet available for
                    this candidate. Available voting-index records are shown
                    below.
                </p>
            )}
            {error && (
                <div class="record-load-error" role="alert">
                    <p>
                        Additional political records could not be loaded.
                        Available voting-index records are shown below.
                    </p>
                    <button type="button" class="secondary" onClick={retry}>
                        Retry records
                    </button>
                </div>
            )}
            <div class="record-controls">
                <div>
                    <label for="record-topic">Policy topic</label>
                    <select
                        id="record-topic"
                        value={topic}
                        onChange={(event) => {
                            setTopic(event.currentTarget.value);
                            setLimit(10);
                        }}
                    >
                        <option value="all">All topics</option>
                        {topics.map((value) => (
                            <option key={value} value={value}>
                                {topicLabel(value)}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label for="record-type">Record type</label>
                    <select
                        id="record-type"
                        value={type}
                        onChange={(event) => {
                            setType(event.currentTarget.value);
                            setLimit(10);
                        }}
                    >
                        <option value="all">All political records</option>
                        <option value="votes">Votes</option>
                        <option value="work">Other political work</option>
                    </select>
                </div>
                <div>
                    <label for="record-search">Search records</label>
                    <input
                        id="record-search"
                        type="search"
                        placeholder="Search a bill, decision or keyword"
                        value={query}
                        onInput={(event) => {
                            setQuery(event.currentTarget.value);
                            setLimit(10);
                        }}
                    />
                </div>
            </div>
            <IssuePatterns profile={profile} topic={topic} />
            <div class="political-layout">
                <div class="record-main">
                    <div class="record-list-heading">
                        <h2>
                            {topic === 'all'
                                ? 'Political record'
                                : topicLabel(topic)}
                        </h2>
                        <span>Newest first</span>
                    </div>
                    <p class="record-review">
                        Published votes have reviewed candidate attribution.
                        Decision details and suggested topic tags still need
                        review.
                    </p>
                    <p class="record-results" aria-live="polite">
                        {filtered.length}{' '}
                        {filtered.length === 1 ? 'record' : 'records'}
                        {filtered.length
                            ? ` · Showing ${Math.min(limit, filtered.length)}`
                            : ''}
                    </p>
                    {filtered.length ? (
                        <>
                            <div class="action-list">
                                {filtered.slice(0, limit).map((action) => (
                                    <ActionRecord
                                        key={action.id}
                                        action={action}
                                    />
                                ))}
                            </div>
                            {limit < filtered.length && (
                                <button
                                    type="button"
                                    class="secondary more-records"
                                    onClick={() =>
                                        setLimit((value) => value + 10)
                                    }
                                >
                                    Show more records ({filtered.length - limit}{' '}
                                    remaining)
                                </button>
                            )}
                        </>
                    ) : (
                        <div class="record-empty-panel">
                            <h3>
                                {actions.length
                                    ? 'No records match these filters'
                                    : 'Political records are awaiting review'}
                            </h3>
                            <p>
                                {actions.length
                                    ? 'Try another topic, record type or search term.'
                                    : 'No attributed records are ready to display for this candidate. This does not establish that they have no political experience or voting history.'}
                            </p>
                            {(topic !== 'all' || type !== 'all' || query) && (
                                <button
                                    type="button"
                                    class="secondary"
                                    onClick={resetFilters}
                                >
                                    Clear filters
                                </button>
                            )}
                        </div>
                    )}
                    <details class="research-coverage">
                        <summary>Research coverage</summary>
                        <p>
                            Voting research starts in{' '}
                            {profile?.coverage?.voting?.since_year || 2020}.
                            Other actions cover the Assembly sitting days
                            referenced by collected voting indexes. Municipal
                            decisions and separate committee records are not yet
                            covered.
                        </p>
                        {(pendingVotes > 0 || pendingWork > 0) && (
                            <p>
                                {pendingVotes} possible voting entries and{' '}
                                {pendingWork} possible political actions have
                                been collected but still need candidate
                                attribution review.
                            </p>
                        )}
                        {profile?.coverage?.voting?.errors?.length > 0 && (
                            <p>
                                Some sources could not be collected; coverage is
                                incomplete.
                            </p>
                        )}
                        <p>
                            Platform passages can include historical policies,
                            biographies and third-party questionnaires. They
                            require review before being treated as current
                            promises.
                        </p>
                    </details>
                </div>
                <PlatformEvidence
                    profile={profile}
                    party={party}
                    topic={topic}
                    partyError={partyError}
                />
            </div>
        </section>
    );
}
