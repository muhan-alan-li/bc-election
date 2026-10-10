import { useEffect, useState } from 'preact/hooks';
import { filterPassages } from '../../helpers/political.js';
import { SourceLink } from '../SourceLink.jsx';

export function PlatformEvidence({ profile, party, topic, partyError }) {
    const [scope, setScope] = useState('candidate');
    const [limit, setLimit] = useState(4);
    useEffect(() => setLimit(4), [topic]);
    const personal = filterPassages(profile?.policy_passages || [], topic);
    const shared = filterPassages(party?.policy_passages || [], topic);
    const passages = [...(scope === 'candidate' ? personal : shared)].sort(
        (a, b) =>
            Number(b.record_type === 'commitment_lead') -
            Number(a.record_type === 'commitment_lead'),
    );
    const claims =
        scope === 'candidate'
            ? profile?.reviewed_commitments || []
            : party?.reviewed_commitments || [];
    return (
        <aside class="platform-evidence" aria-label="Platform source evidence">
            <h2>Platform context</h2>
            <p class="record-intro">
                Explore what campaign sources say about{' '}
                {topic === 'all' ? 'these policy areas' : 'this topic'}.
            </p>
            <div
                class="evidence-scopes"
                role="group"
                aria-label="Platform source scope"
            >
                <button
                    type="button"
                    aria-pressed={scope === 'candidate'}
                    onClick={() => {
                        setScope('candidate');
                        setLimit(4);
                    }}
                >
                    Candidate sources ({personal.length})
                </button>
                <button
                    type="button"
                    aria-pressed={scope === 'party'}
                    onClick={() => {
                        setScope('party');
                        setLimit(4);
                    }}
                >
                    Party sources ({shared.length})
                </button>
            </div>
            <p class="record-review">
                These are collected passages awaiting review. Their authorship
                and date may be unclear. Party positions are separate from a
                candidate’s personal promises.
            </p>
            {claims.length > 0 && topic === 'all' && (
                <section class="reviewed-commitments">
                    <h3>Reviewed commitments</h3>
                    {claims.map((claim) => (
                        <p key={claim.id}>{claim.text}</p>
                    ))}
                </section>
            )}
            {scope === 'party' && partyError && (
                <p role="alert">
                    Party source material could not be loaded. {partyError}
                </p>
            )}
            {passages.length ? (
                <>
                    {passages.slice(0, limit).map((passage) => (
                        <article class="policy-passage" key={passage.id}>
                            <p class="passage-kind">
                                {passage.record_type === 'commitment_lead'
                                    ? 'Possible commitment · Unreviewed'
                                    : 'Policy passage · Unreviewed'}
                            </p>
                            <blockquote>{passage.text}</blockquote>
                            <SourceLink href={passage.source?.url}>
                                {passage.source?.publisher || 'Campaign source'}
                                {passage.locator?.page
                                    ? ` · Page ${passage.locator.page}`
                                    : ''}
                            </SourceLink>
                            <details>
                                <summary>Passage context</summary>
                                <blockquote class="source-excerpt">
                                    {passage.context}
                                </blockquote>
                            </details>
                        </article>
                    ))}
                    {limit < passages.length && (
                        <button
                            type="button"
                            class="secondary"
                            onClick={() => setLimit((value) => value + 4)}
                        >
                            Show more passages ({passages.length - limit}{' '}
                            remaining)
                        </button>
                    )}
                </>
            ) : (
                <p class="record-empty">
                    {scope === 'party' && !profile?.party_platform_id
                        ? 'No affiliated party platform is linked to this candidate.'
                        : `No ${scope === 'candidate' ? 'candidate-source' : 'party-source'} passages are available${topic !== 'all' ? ' for this topic' : ''}.`}
                </p>
            )}
            <div class="alignment-status">
                <strong>Alignment not assessed</strong>
                <p>
                    A shared topic does not establish agreement or a broken
                    promise. Comparing records requires verified commitments and
                    their dates.
                </p>
            </div>
        </aside>
    );
}
