import { useEffect, useRef, useState } from 'preact/hooks';
import { useVoterResource } from '../hooks/useVoterResource.js';
import {
    comparisonFor,
    restoreAnswers,
    serializeAnswers,
} from '../helpers/matcher.js';
import { platformHref } from '../helpers/routes.js';
import { SourceLink } from '../components/ui/SourceLink.jsx';
import { RetryError } from '../components/ui/RetryError.jsx';

const answerKey = 'bc-party-answers-v2';
function readAnswers() {
    try {
        return JSON.parse(sessionStorage.getItem(answerKey)) || {};
    } catch {
        return {};
    }
}
const relationLabel = {
    agree: 'Agrees with you',
    disagree: 'Differs from you',
    unknown: 'Position not verified',
};

export function Match({ registry }) {
    const resource = useVoterResource('/api/questionnaire');
    if (registry.loading) return <p role="status">Loading parties…</p>;
    if (registry.error)
        return <RetryError error={registry.error} onRetry={registry.retry} />;
    if (resource.loading) return <p role="status">Loading party questions…</p>;
    if (resource.error)
        return <RetryError error={resource.error} onRetry={resource.retry} />;
    if (!resource.data) return null;
    if (!registry.data) return null;
    return (
        <PartyQuestions
            questionnaire={resource.data}
            parties={registry.data.parties}
        />
    );
}

function PartyQuestions({ questionnaire, parties: registryParties }) {
    const { questions } = questionnaire;
    const parties = [...registryParties].sort((a, b) =>
        a.name.localeCompare(b.name, 'en-CA'),
    );
    const [answers, setAnswers] = useState(() =>
        restoreAnswers(readAnswers(), questions),
    );
    const [step, setStep] = useState(0);
    const viewport = useRef(null);
    const reviewHeading = useRef(null);
    const firstRender = useRef(true);
    useEffect(() => {
        try {
            sessionStorage.setItem(
                answerKey,
                JSON.stringify(serializeAnswers(answers, questions)),
            );
        } catch {}
    }, [answers, questions]);
    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        if (step >= questions.length) {
            reviewHeading.current?.focus();
            return;
        }
        viewport.current?.querySelector('.quiz-panel.is-active h2')?.focus();
    }, [step]);
    const reviewing = step >= questions.length;
    const answered = Object.keys(answers).length;
    function choose(id, side) {
        setAnswers((prev) => {
            const next = { ...prev };
            if (side) next[id] = side;
            else delete next[id];
            return next;
        });
    }
    return (
        <>
            <section class="party-quiz" aria-label="Your policy choices">
                <div class="quiz-topline">
                    <p class="eyebrow">
                        {reviewing
                            ? 'Review your answers'
                            : `Question ${step + 1} of ${questions.length}`}{' '}
                        · {answered} answered
                    </p>
                    <button
                        class="text-button"
                        onClick={() =>
                            setStep(reviewing ? 0 : questions.length)
                        }
                    >
                        {reviewing ? 'Back to questions' : 'Review answers'}
                    </button>
                </div>
                <progress
                    value={reviewing ? questions.length : step + 1}
                    max={questions.length}
                    aria-label="Question progress"
                />
                {reviewing ? (
                    <div>
                        <h2 tabIndex="-1" ref={reviewHeading}>
                            Your answers
                        </h2>
                        <ol class="answer-review">
                            {questions.map((q, index) => (
                                <li key={q.id}>
                                    <button onClick={() => setStep(index)}>
                                        <span>{q.prompt}</span>
                                        <strong>
                                            {answers[q.id] === 'yes'
                                                ? 'Yes'
                                                : answers[q.id] === 'no'
                                                  ? 'No'
                                                  : 'Skipped'}{' '}
                                            →
                                        </strong>
                                    </button>
                                </li>
                            ))}
                        </ol>
                        <button
                            class="secondary"
                            onClick={() => {
                                setAnswers({});
                                setStep(0);
                            }}
                        >
                            Clear all answers
                        </button>
                    </div>
                ) : (
                    <div class="quiz-viewport" ref={viewport}>
                        {questions.map((q, index) => (
                            <div
                                key={q.id}
                                class={`quiz-panel${index === step ? ' is-active' : ''}`}
                                aria-hidden={
                                    index !== step ? 'true' : undefined
                                }
                            >
                                <h2 tabIndex="-1" id={`question-title-${q.id}`}>
                                    {q.prompt}
                                </h2>
                                <fieldset
                                    class="quiz-options"
                                    aria-labelledby={`question-title-${q.id}`}
                                >
                                    <legend class="visually-hidden">
                                        Choose a position or leave this question
                                        blank
                                    </legend>
                                    {['yes', 'no'].map((side) => (
                                        <label
                                            key={side}
                                            class={`quiz-choice ${answers[q.id] === side ? 'is-selected' : ''}`}
                                        >
                                            <span class="choice-heading">
                                                <input
                                                    type="radio"
                                                    name={q.id}
                                                    value={side}
                                                    checked={
                                                        answers[q.id] === side
                                                    }
                                                    onChange={() =>
                                                        choose(q.id, side)
                                                    }
                                                />
                                                <strong>
                                                    {side === 'yes'
                                                        ? 'Yes'
                                                        : 'No'}
                                                </strong>
                                            </span>
                                            <span>{q[side]}</span>
                                        </label>
                                    ))}
                                </fieldset>
                                <p class="question-note">{q.note}</p>
                                <div class="quiz-controls">
                                    <button
                                        class="secondary"
                                        disabled={index === 0}
                                        onClick={() => setStep(index - 1)}
                                    >
                                        ← Back
                                    </button>
                                    <div class="quiz-actions">
                                        <button
                                            class="secondary"
                                            aria-label="Clear this answer"
                                            disabled={!answers[q.id]}
                                            onClick={() => choose(q.id, null)}
                                        >
                                            <span class="quiz-label-full">
                                                Clear answer
                                            </span>
                                            <span
                                                class="quiz-label-short"
                                                aria-hidden="true"
                                            >
                                                Clear
                                            </span>
                                        </button>
                                        <button
                                            class="primary-button"
                                            aria-label={
                                                index === questions.length - 1
                                                    ? 'Review answers'
                                                    : answers[q.id]
                                                      ? 'Next question'
                                                      : 'Skip question'
                                            }
                                            onClick={() => setStep(index + 1)}
                                        >
                                            <span class="quiz-label-full">
                                                {index === questions.length - 1
                                                    ? 'Review answers →'
                                                    : answers[q.id]
                                                      ? 'Next question →'
                                                      : 'Skip question →'}
                                            </span>
                                            <span
                                                class="quiz-label-short"
                                                aria-hidden="true"
                                            >
                                                {index === questions.length - 1
                                                    ? 'Review →'
                                                    : answers[q.id]
                                                      ? 'Next →'
                                                      : 'Skip →'}
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
            <section
                aria-labelledby="comparison-title"
                class="party-comparisons"
            >
                <h2 id="comparison-title">
                    Compare your answers with the parties
                </h2>
                {!answered && (
                    <p class="coverage-note">
                        Answer a question to see comparisons. You can browse
                        every party’s platform below.
                    </p>
                )}
                <div class="match-party-list">
                    {parties.map((party) => {
                        const lines = comparisonFor(
                            party.id,
                            questions,
                            answers,
                        );
                        const counts = { agree: 0, disagree: 0, unknown: 0 };
                        lines.forEach((line) => counts[line.relation]++);
                        return (
                            <article
                                key={party.id}
                                class="match-party"
                                style={{ '--party-color': party.color }}
                            >
                                <div class="match-party-heading">
                                    <h3>
                                        <a href={platformHref(party.id)}>
                                            {party.name}
                                        </a>
                                    </h3>
                                    <a href={platformHref(party.id)}>
                                        Platform →
                                    </a>
                                </div>
                                <p class="coverage-note">
                                    Verified positions:{' '}
                                    {
                                        questions.filter((q) =>
                                            q.stances.some(
                                                (s) => s.partyID === party.id,
                                            ),
                                        ).length
                                    }{' '}
                                    of {questions.length} questions
                                </p>
                                {lines.length ? (
                                    <>
                                        <p
                                            class="party-comparison-counts"
                                            aria-label="Comparison counts"
                                        >
                                            <span class="match-tag agree">
                                                {counts.agree} agree
                                            </span>
                                            <span class="match-tag disagree">
                                                {counts.disagree} differ
                                            </span>
                                            <span class="match-tag unknown">
                                                {counts.unknown} unknown
                                            </span>
                                        </p>
                                        <details class="party-comparison-details">
                                            <summary>View comparisons</summary>
                                            <ul class="party-issue-lines">
                                                {lines.map(
                                                    ({
                                                        question,
                                                        answer,
                                                        stance,
                                                        relation,
                                                    }) => (
                                                        <li key={question.id}>
                                                            <details>
                                                                <summary>
                                                                    <span
                                                                        class={`match-tag ${relation}`}
                                                                    >
                                                                        {
                                                                            relationLabel[
                                                                                relation
                                                                            ]
                                                                        }
                                                                    </span>{' '}
                                                                    {
                                                                        question.topic
                                                                    }
                                                                </summary>
                                                                <p>
                                                                    {
                                                                        question.prompt
                                                                    }{' '}
                                                                    <strong>
                                                                        Your
                                                                        answer:{' '}
                                                                        {answer ===
                                                                        'yes'
                                                                            ? 'Yes'
                                                                            : 'No'}
                                                                        .
                                                                    </strong>
                                                                </p>
                                                                {stance ? (
                                                                    <p>
                                                                        {
                                                                            stance.summary
                                                                        }{' '}
                                                                        <SourceLink
                                                                            href={
                                                                                stance
                                                                                    .source
                                                                                    .url
                                                                            }
                                                                        >
                                                                            {
                                                                                stance
                                                                                    .source
                                                                                    .label
                                                                            }
                                                                        </SourceLink>{' '}
                                                                        <span class="coverage-note">
                                                                            Checked{' '}
                                                                            {
                                                                                stance.checkedOn
                                                                            }
                                                                        </span>
                                                                    </p>
                                                                ) : (
                                                                    <p>
                                                                        No
                                                                        verified
                                                                        position
                                                                        from
                                                                        this
                                                                        party.
                                                                    </p>
                                                                )}
                                                            </details>
                                                        </li>
                                                    ),
                                                )}
                                            </ul>
                                        </details>
                                    </>
                                ) : null}
                            </article>
                        );
                    })}
                </div>
            </section>
        </>
    );
}
