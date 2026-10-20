export function questionRevision(question) {
    return JSON.stringify([
        question.prompt,
        question.yes,
        question.no,
        question.note,
    ]);
}

export function restoreAnswers(saved, questions) {
    if (
        !saved ||
        saved.version !== 2 ||
        !saved.answers ||
        typeof saved.answers !== 'object'
    )
        return {};
    return cleanAnswers(
        Object.fromEntries(
            questions
                .filter(
                    (q) =>
                        saved.answers[q.id]?.revision === questionRevision(q),
                )
                .map((q) => [q.id, saved.answers[q.id].side]),
        ),
        questions,
    );
}

export function serializeAnswers(answers, questions) {
    return {
        version: 2,
        answers: Object.fromEntries(
            questions
                .filter((q) => answers[q.id])
                .map((q) => [
                    q.id,
                    { side: answers[q.id], revision: questionRevision(q) },
                ]),
        ),
    };
}

// Only explicit sourced positions participate. Missing evidence is never opposition.
export function comparisonFor(partyID, questions, answers) {
    return questions
        .filter((q) => ['yes', 'no'].includes(answers[q.id]))
        .map((question) => {
            const stance = question.stances.find((s) => s.partyID === partyID);
            return {
                question,
                answer: answers[question.id],
                stance,
                relation: !stance
                    ? 'unknown'
                    : stance.side === answers[question.id]
                      ? 'agree'
                      : 'disagree',
            };
        });
}

export function cleanAnswers(value, questions) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
        questions
            .filter((q) => ['yes', 'no'].includes(value[q.id]))
            .map((q) => [q.id, value[q.id]]),
    );
}

export function ballotCandidates(partyID, questionnaire, dataset) {
    if (!dataset) return [];
    const names =
        questionnaire.parties.find((p) => p.id === partyID)?.ballotNames || [];
    const ids = new Set(
        dataset.parties.filter((p) => names.includes(p.name)).map((p) => p.id),
    );
    return dataset.candidacies.filter((c) => ids.has(c.party_id));
}

export function isStale(asOf, now = new Date()) {
    const stamp = Date.parse(`${asOf}T00:00:00Z`);
    return !Number.isFinite(stamp) || now.getTime() - stamp > 14 * 86400000;
}
