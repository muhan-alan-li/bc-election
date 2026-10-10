export const topicLabels = {
    housing: 'Housing',
    healthcare: 'Health care',
    education: 'Education & childcare',
    'economy-taxation': 'Economy & taxes',
    'environment-energy': 'Environment & energy',
    'public-safety-justice': 'Public safety & justice',
    transportation: 'Transportation',
    'indigenous-relations': 'Indigenous relations',
    'government-democracy': 'Government & democracy',
    'social-policy-rights': 'Social policy & rights',
    uncategorized: 'Other topics',
};
export const topicLabel = (topic) =>
    topicLabels[topic] || topic.replaceAll('-', ' ');
export const actionLabel = (type) =>
    ({
        recorded_vote: 'Recorded vote',
        recorded_division: 'Recorded vote',
        motion: 'Motion',
        amendment_motion: 'Amendment motion',
        bill_introduction: 'Bill introduction',
    })[type] || 'Political work';
export const isVote = (action) =>
    ['recorded_vote', 'recorded_division'].includes(action.record_type);

export function visibleActions(profile, dataset, candidate) {
    if (profile)
        return (profile.actions || []).filter(
            (action) => action.attribution_status === 'reviewed',
        );
    return dataset.votes
        .filter((vote) => vote.person_id === candidate.person_id)
        .map((vote) => ({
            ...vote,
            record_type: 'recorded_vote',
            topics: ['uncategorized'],
        }));
}

export function filterActions(
    actions,
    { topic = 'all', type = 'all', query = '' } = {},
) {
    const search = query.trim().toLocaleLowerCase();
    return actions
        .filter(
            (action) =>
                (topic === 'all' || action.topics?.includes(topic)) &&
                (type === 'all' ||
                    (type === 'votes' ? isVote(action) : !isVote(action))) &&
                (!search ||
                    [
                        action.subject,
                        action.stage,
                        action.text,
                        action.transcript_context?.question,
                        action.transcript_context?.outcome,
                        action.position,
                        actionLabel(action.record_type),
                        ...(action.topics || []).map(topicLabel),
                    ]
                        .filter(Boolean)
                        .join(' ')
                        .toLocaleLowerCase()
                        .includes(search)),
        )
        .sort(
            (a, b) =>
                (b.date || '').localeCompare(a.date || '') ||
                a.id.localeCompare(b.id),
        );
}

export function filterPassages(passages, topic) {
    return passages.filter(
        (passage) => topic === 'all' || passage.topics?.includes(topic),
    );
}
