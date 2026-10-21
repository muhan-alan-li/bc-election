import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
    comparisonFor,
    cleanAnswers,
    ballotCandidates,
    isStale,
} from '../src/helpers/matcher.js';
import { parseRoute } from '../src/helpers/routes.js';
const questionnaire = JSON.parse(
    readFileSync(
        new URL(
            '../../content/bc-provincial-2026/questionnaire.json',
            import.meta.url,
        ),
    ),
);

test('missing party evidence stays unknown, skipped answers do not compare', () => {
    const questions = [
        { id: 'housing', stances: [{ partyID: 'a', side: 'yes' }] },
        { id: 'health', stances: [] },
    ];
    assert.equal(
        comparisonFor('a', questions, { housing: 'yes' })[0].relation,
        'agree',
    );
    assert.equal(
        comparisonFor('a', questions, { housing: 'no' })[0].relation,
        'disagree',
    );
    assert.equal(
        comparisonFor('b', questions, { housing: 'no' })[0].relation,
        'unknown',
    );
    assert.deepEqual(comparisonFor('a', questions, { housing: null }), []);
    assert.deepEqual(
        cleanAnswers({ housing: 'yes', health: 'maybe', old: 'no' }, questions),
        { housing: 'yes' },
    );
    assert.deepEqual(cleanAnswers(null, questions), {});
});

test('ballot lookup uses explicit affiliations, never a name substring or incumbency', () => {
    const dataset = {
        parties: [
            { id: 'p1', name: 'Conservative Party' },
            { id: 'p2', name: 'CWP' },
        ],
        candidacies: [
            { id: 'a', party_id: 'p1' },
            { id: 'b', party_id: 'p2' },
            { id: 'ind', affiliation: 'independent' },
        ],
    };
    assert.deepEqual(
        ballotCandidates('conservative', questionnaire, dataset).map(
            (c) => c.id,
        ),
        ['a'],
    );
    assert.deepEqual(
        ballotCandidates('canwest', questionnaire, dataset).map((c) => c.id),
        ['b'],
    );
    assert.deepEqual(ballotCandidates('ndp', questionnaire, dataset), []);
    assert.deepEqual(ballotCandidates('ndp', questionnaire, null), []);
});

test('default route opens questionnaire; candidate links resolve to missing pages', () => {
    globalThis.window = { location: { hash: '' } };
    assert.deepEqual(parseRoute(), { view: 'match' });
    window.location.hash = '#/match/RCC';
    assert.deepEqual(parseRoute(), { view: 'missing' });
    window.location.hash = '#/constituencies';
    assert.deepEqual(parseRoute(), { view: 'constituencies' });
    window.location.hash = '#/constituencies/RCC';
    assert.deepEqual(parseRoute(), { view: 'district', code: 'RCC' });
    window.location.hash = '#/match/RCC/invalid';
    assert.deepEqual(parseRoute(), { view: 'missing' });
    window.location.hash = '#/constituencies/RCC/candidates/abc';
    assert.deepEqual(parseRoute(), { view: 'missing' });
    delete globalThis.window;
});

test('old and invalid polling dates cannot look current', () => {
    const now = new Date('2026-10-17T00:00:00Z');
    assert.equal(isStale('2026-10-16', now), false);
    assert.equal(isStale('2026-09-01', now), true);
    assert.equal(isStale('invalid', now), true);
});
