import assert from 'node:assert/strict';
import test from 'node:test';
import { getJSON } from '../src/helpers/api.js';
import {
    aggregateCandidates,
    formatDate,
    formatDateRange,
    formatNumber,
    formatPercent,
    historyRows,
    resultHeadline,
    seatHolders,
    shareParts,
} from '../src/helpers/results.js';

const parties = [
    {
        id: 'ndp',
        name: 'BC NDP',
        short_name: 'NDP',
        color: '#c85316',
        seats: 2,
        votes: 1200,
        vote_share: 60,
        role: 'Government',
    },
    {
        id: 'green',
        name: 'BC Green Party',
        short_name: 'Green',
        color: '#38634b',
        seats: 0,
        votes: 800,
        vote_share: 40,
        role: null,
    },
];

const results = {
    election: { seats: 3, majority: 2 },
    parties,
};

const district = {
    name: 'Example',
    winner: {
        name: 'Alex Example',
        party_id: 'ndp',
        votes: 1200,
        vote_share: 60,
    },
    candidates: [
        { name: 'Alex Example', party_id: 'ndp', votes: 1200, vote_share: 60 },
        { name: 'Sam Sample', party_id: 'green', votes: 800, vote_share: 40 },
    ],
    history: [
        {
            year: 2024,
            boundary: '2023 redistribution boundaries',
            winner: {
                name: 'Older Winner',
                party_id: 'green',
                vote_share: 52,
            },
            parties: [
                { party_id: 'green', vote_share: 52, votes: 1000 },
                { party_id: 'ndp', vote_share: 40, votes: 770 },
                { party_id: 'other', vote_share: 8, votes: 150 },
            ],
        },
    ],
};

test('formats counts, shares and dates for results pages', () => {
    assert.equal(formatNumber(862688), '862,688');
    assert.equal(formatPercent(48.06), '48.1%');
    assert.equal(formatPercent(48.06, 2), '48.06%');
    assert.equal(formatDate('2026-11-06'), 'November 6, 2026');
    assert.equal(formatDate(null), '');
    assert.equal(
        formatDateRange('2026-11-06', '2026-11-10'),
        'November 6–10, 2026',
    );
    assert.equal(
        formatDateRange('2026-11-28', '2026-12-02'),
        'November 28 to December 2, 2026',
    );
    assert.equal(formatDateRange('2026-11-06', null), 'November 6, 2026');
});

test('seat summary and headline describe the largest party', () => {
    assert.deepEqual(
        seatHolders(parties).map((party) => party.id),
        ['ndp'],
    );
    assert.equal(resultHeadline(results), 'BC NDP wins a majority');
});

test('history starts with the current count and keeps earlier boundaries', () => {
    const rows = historyRows(district, new Map(parties.map((p) => [p.id, p])));
    assert.equal(rows.length, 2);
    assert.equal(rows[0].year, 2026);
    assert.equal(rows[0].current, true);
    assert.equal(rows[0].winnerParty?.name, 'BC NDP');
    assert.equal(rows[1].winnerParty?.name, 'BC Green Party');
    assert.equal(rows[1].boundary, '2023 redistribution boundaries');
});

test('aggregateCandidates groups votes by party and totals valid votes', () => {
    const rows = aggregateCandidates([
        { party_id: 'ndp', votes: 100 },
        { party_id: 'ndp', votes: 50 },
        { party_id: 'green', votes: 50 },
    ]);
    assert.deepEqual(
        rows.map((row) => [row.party_id, row.votes, row.vote_share]),
        [
            ['ndp', 150, 75],
            ['green', 50, 25],
        ],
    );
});

test('shareParts folds smaller parties into an other segment', () => {
    const parts = shareParts(
        {
            parties: [
                { party_id: 'a', vote_share: 40 },
                { party_id: 'b', vote_share: 30 },
                { party_id: 'c', vote_share: 20 },
                { party_id: 'd', vote_share: 6 },
                { party_id: 'e', vote_share: 4 },
            ],
        },
        new Map(),
        3,
    );
    assert.equal(parts.length, 4);
    assert.equal(parts[3].name, 'Other');
    assert.equal(parts[3].vote_share, 10);
});

test('results and cabinet responses are validated before rendering', async () => {
    const originalFetch = globalThis.fetch;
    try {
        globalThis.fetch = async () =>
            Response.json({
                election: { seats: 1 },
                parties: [],
                districts: {},
            });
        await assert.rejects(
            getJSON('/api/results'),
            /could not be displayed/i,
        );

        globalThis.fetch = async () => Response.json({ ministers: [] });
        await assert.rejects(
            getJSON('/api/cabinet'),
            /could not be displayed/i,
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
});
