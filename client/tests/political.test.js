import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadComponents, walk as walkComponent } from './helpers/components.js';
import {
    filterActions,
    visibleActions,
    filterPassages,
} from '../src/helpers/political.js';
import { preparePoliticalAssets } from '../build/political-assets.js';

const pillars = JSON.parse(
    await readFile(
        new URL(
            '../../ingestion/election/analysis/pillars.json',
            import.meta.url,
        ),
        'utf8',
    ),
);

const actions = [
    {
        id: 'v1',
        record_type: 'recorded_vote',
        subject: 'Housing Act',
        stage: '2R',
        date: '2021-01-01',
        position: 'yea',
        topics: ['housing'],
        attribution_status: 'reviewed',
    },
    {
        id: 'v2',
        record_type: 'recorded_vote',
        subject: 'Health Act',
        date: '2024-01-01',
        position: 'nay',
        topics: ['healthcare'],
        attribution_status: 'reviewed',
    },
    {
        id: 'm1',
        record_type: 'amendment_motion',
        subject: 'Housing amendment',
        date: '2024-02-01',
        topics: ['housing'],
        attribution_status: 'reviewed',
    },
    {
        id: 'unreviewed',
        record_type: 'recorded_vote',
        topics: ['housing'],
        attribution_status: 'suggested',
    },
];

test('filters records by topic, type and search without losing chronology', () => {
    assert.deepEqual(
        filterActions(actions.slice(0, 3)).map((a) => a.id),
        ['m1', 'v2', 'v1'],
    );
    assert.deepEqual(
        filterActions(actions, {
            topic: 'housing',
            type: 'votes',
            query: 'Act',
        }).map((a) => a.id),
        ['v1'],
    );
    assert.deepEqual(
        filterActions(actions, { type: 'work' }).map((a) => a.id),
        ['m1'],
    );
    assert.equal(
        filterActions(actions, { query: 'unknown decision' }).length,
        0,
    );
    assert.deepEqual(
        filterPassages(
            [{ topics: ['housing'] }, { topics: ['healthcare'] }],
            'housing',
        ),
        [{ topics: ['housing'] }],
    );
});

test('only attributed actions display; missing profiles fall back to the district votes', () => {
    assert.equal(visibleActions({ actions }, {}, {}).length, 3);
    const fallback = visibleActions(
        null,
        {
            votes: [
                { id: 'a', person_id: 'p' },
                { id: 'b', person_id: 'other' },
            ],
        },
        { person_id: 'p' },
    );
    assert.equal(fallback.length, 1);
    assert.equal(fallback[0].record_type, 'recorded_vote');
    assert.deepEqual(fallback[0].topics, ['uncategorized']);
});

test('build packages polished records as separate versioned assets and rejects attribution leads', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'bc-political-assets-'));
    try {
        const input = join(folder, 'input'),
            output = join(folder, 'output');
        await mkdir(join(input, 'election/candidates'), { recursive: true });
        const record = {
            schema_version: 1,
            kind: 'candidate_political_profile',
            id: 'candidate-1',
            election_id: 'election',
            actions: [actions[0]],
            documents: [],
        };
        const file = join(input, 'election/candidates/candidate-1.json');
        await writeFile(file, JSON.stringify(record));
        const catalog = await preparePoliticalAssets(input, output, 'election');
        const url = catalog.candidates['candidate-1'];
        assert.deepEqual(
            JSON.parse(await readFile(join(output, url), 'utf8')),
            record,
        );
        assert.deepEqual(
            await preparePoliticalAssets(input, output, 'election'),
            catalog,
        );
        await writeFile(file, JSON.stringify({ ...record, actions: [] }));
        const revised = await preparePoliticalAssets(input, output, 'election');
        assert.notEqual(revised.candidates['candidate-1'], url);
        await assert.rejects(readFile(join(output, url)), { code: 'ENOENT' });
        await writeFile(
            file,
            JSON.stringify({ ...record, actions: [actions[3]] }),
        );
        await assert.rejects(
            preparePoliticalAssets(input, output, 'election'),
            /Unreviewed candidate attribution/,
        );
        await writeFile(
            file,
            JSON.stringify({ ...record, documents: [{ pages: [] }] }),
        );
        await assert.rejects(
            preparePoliticalAssets(input, output, 'election'),
            /Raw research/,
        );
        const analysis = {
            id: record.id,
            election_id: record.election_id,
            coverage: { scope: 'includes_unconfirmed_attribution_leads' },
            review_status: 'machine_generated_needs_review',
            issue_findings: [],
        };
        await writeFile(
            file,
            JSON.stringify({ ...record, issue_analysis: analysis }),
        );
        await assert.rejects(
            preparePoliticalAssets(input, output, 'election'),
            /Invalid public issue analysis/,
        );
        analysis.coverage.scope = 'reviewed_attributions';
        analysis.issue_findings = [
            {
                evidence: [
                    {
                        action_id: 'unavailable',
                        attribution_status: 'reviewed',
                    },
                ],
            },
        ];
        await writeFile(
            file,
            JSON.stringify({ ...record, issue_analysis: analysis }),
        );
        await assert.rejects(
            preparePoliticalAssets(input, output, 'election'),
            /Invalid public issue analysis/,
        );
        const absent = await preparePoliticalAssets(
            join(folder, 'missing'),
            output,
            'election',
        );
        assert.deepEqual(absent.candidates, {});
    } finally {
        await rm(folder, { recursive: true, force: true });
    }
});

const {
    ActionRecord,
    IssuePatterns,
    PlatformAlignment,
    PillarPanel,
    pillarAlignmentTag,
} = await loadComponents(`
        export { ActionRecord } from './src/components/candidate/ActionRecord.jsx';
        export { IssuePatterns } from './src/components/candidate/IssuePatterns.jsx';
        export { PlatformAlignment, PillarPanel, pillarAlignmentTag } from './src/components/candidate/PlatformAlignment.jsx';
    `);

function walk(node, text, links) {
    walkComponent(
        node,
        (element) => {
            if (typeof element === 'string' || typeof element === 'number')
                text.push(String(element));
            else if (element.type === 'a') links.push(element.props.href);
        },
        ['FullVotingRecord', 'PillarGuide'],
    );
}

test('vote presentation preserves position, stage, citations and unresolved questions', () => {
    const text = [],
        links = [];
    walk(
        ActionRecord({
            action: {
                ...actions[0],
                transcript_url: 'https://example.org/transcript#vote',
                source: { url: 'https://example.org/index' },
                member_label: 'Example, Alex',
                transcript_context: {
                    status: 'ambiguous_needs_review',
                    question: null,
                    outcome: null,
                },
            },
        }),
        text,
        links,
    );
    assert.ok(text.includes('Yea'));
    assert.ok(text.includes('Second reading'));
    assert.ok(text.includes('The exact question still needs source review.'));
    assert.deepEqual(links, [
        'https://example.org/transcript#vote',
        'https://example.org/index',
    ]);
    const unknown = [];
    walk(
        ActionRecord({ action: { ...actions[0], position: null } }),
        unknown,
        [],
    );
    assert.ok(unknown.includes('Position not established'));
    assert.ok(!unknown.includes('Nay'));
});

test('commitment comparisons lead with specific conclusions and preserve ownership, time and sources', () => {
    const finding = {
        id: 'housing',
        pillar_id: 'housing',
        status: 'consistent_with_later_position',
        headline: 'Backed a principal-residence requirement',
        commitment: {
            owner: 'BC NDP',
            kind: 'position',
            date: '2026-09-25',
            summary: 'Defend short-term rental rules.',
        },
        actions: [
            {
                ...actions[0],
                position: 'nay',
                stage: 'amdt. to cl. 14',
                transcript_url: 'https://example.org/vote',
            },
        ],
        policy_effect: 'Rejected a proposed additional investment property.',
        assessment:
            'Consistent with the later position, not delivery of a later promise.',
        counterargument: 'Small owners could face different burdens.',
        limits: 'No causal inference about rents.',
        citations: [
            {
                role: 'platform',
                quote: 'Defend the rules.',
                source: {
                    url: 'https://example.org/platform',
                    title: 'Campaign source',
                },
            },
        ],
    };
    const profile = {
        ballot_name: 'Alex',
        actions: [],
        alignment_analysis: {
            review_status: 'source_checked',
            takeaway: 'A specific choice, not an overall score.',
            scope: 'Housing only.',
            coverage: {
                selected_votes: 1,
                indexed_votes: 100,
                distinct_legislation: 1,
            },
            findings: [finding],
            unassessed_commitments: [],
        },
    };
    const text = [],
        links = [];
    walk(PlatformAlignment({ profile }), text, links);
    const content = text.join(' ');
    assert.ok(content.includes('Promises and actions'));
    walk(
        PillarPanel({
            analysis: profile.alignment_analysis,
            pillar: {
                id: 'housing',
                question: 'Housing question',
                description: 'Housing focus',
            },
        }),
        text,
        links,
    );
    const panel = text.join(' ');
    assert.ok(panel.includes('Consistent with later position'));
    assert.ok(panel.includes('Voted against'));
    const empty = [];
    walk(
        PillarPanel({
            analysis: profile.alignment_analysis,
            pillar: {
                id: 'healthcare',
                question: 'Healthcare question',
                description: 'Care focus',
            },
        }),
        empty,
        [],
    );
    assert.ok(empty.includes('No published comparisons yet'));
    assert.ok(!empty.includes(finding.headline));
    assert.ok(!content.includes('How these comparisons were selected'));
    assert.ok(!content.includes('Candidate-source passages'));
    assert.deepEqual(links, [
        'https://example.org/platform',
        'https://example.org/vote',
        'https://example.org/platform',
    ]);
    profile.alignment_analysis.unassessed_commitments = [
        {
            id: 'undated',
            pillar_id: 'housing',
            owner: 'Party',
            summary: 'An undated position',
            reason: 'Not established by the record.',
            date: '2026-10-09',
            date_status: 'observed_at_capture',
            source: { url: 'https://example.org/undated' },
        },
    ];
    const observed = [];
    walk(
        PillarPanel({
            analysis: profile.alignment_analysis,
            pillar: { id: 'housing' },
        }),
        observed,
        [],
    );
    assert.ok(!observed.join(' ').includes('An undated position'));
    assert.ok(
        !observed.join(' ').includes('What the record cannot answer yet'),
    );
    profile.alignment_analysis.review_status = 'draft';
    assert.equal(PlatformAlignment({ profile }), null);
});

test('asset publication rejects draft comparisons and altered vote positions', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'bc-alignment-assets-'));
    try {
        const source = join(folder, 'sources'),
            dist = join(folder, 'dist');
        await mkdir(join(source, 'e', 'candidates'), { recursive: true });
        const record = {
            schema_version: 1,
            kind: 'candidate_political_profile',
            id: 'c',
            person_id: 'p',
            election_id: 'e',
            actions: [actions[0]],
            alignment_analysis: {
                schema_version: 1,
                kind: 'candidate_alignment_analysis',
                id: 'c',
                person_id: 'p',
                election_id: 'e',
                review_status: 'source_checked',
                pillars: pillars.map((pillar) => ({
                    ...pillar,
                    takeaway:
                        pillar.id === 'housing' ? 'Housing finding.' : null,
                })),
                findings: [
                    {
                        pillar_id: 'housing',
                        actions: [{ ...actions[0] }],
                        citations: [
                            {
                                quote: 'Evidence.',
                                source: {
                                    sha256: 'hash',
                                    url: 'https://example.org/source',
                                },
                            },
                        ],
                    },
                ],
            },
        };
        const path = join(source, 'e', 'candidates', 'c.json');
        await writeFile(path, JSON.stringify(record));
        await preparePoliticalAssets(source, dist, 'e');
        record.alignment_analysis.review_status = 'draft';
        await writeFile(path, JSON.stringify(record));
        await assert.rejects(
            preparePoliticalAssets(source, dist, 'e'),
            /Invalid public platform alignment/,
        );
        record.alignment_analysis.review_status = 'source_checked';
        record.alignment_analysis.findings[0].pillar_id = 'invented';
        await writeFile(path, JSON.stringify(record));
        await assert.rejects(
            preparePoliticalAssets(source, dist, 'e'),
            /Invalid public platform alignment/,
        );
        record.alignment_analysis.findings[0].pillar_id = 'housing';
        record.alignment_analysis.findings[0].actions[0].position = 'nay';
        await writeFile(path, JSON.stringify(record));
        await assert.rejects(
            preparePoliticalAssets(source, dist, 'e'),
            /Invalid public platform alignment/,
        );
    } finally {
        await rm(folder, { recursive: true, force: true });
    }
});

test('issue patterns retain inconclusive counts, actual votes, sources and alignment limits', () => {
    const profile = {
        actions: [actions[0]],
        issue_analysis: {
            coverage: {
                scope: 'reviewed_attributions',
                interpreted_actions: 1,
                eligible_actions: 2,
                pending_actions: 1,
            },
            issue_findings: [
                {
                    id: 'finding-1',
                    topic: 'housing',
                    proposition: 'Strengthen tenant protections.',
                    status: 'insufficient_evidence',
                    informative_event_groups: 0,
                    counts: { supports: 0, opposes: 0, mixed: 0, unclear: 1 },
                    date_range: { from: '2021-01-01', to: '2021-01-01' },
                    evidence: [
                        {
                            action_id: 'v1',
                            date: '2021-01-01',
                            direction: 'unclear',
                            evidence_strength: 'limited',
                            explanation:
                                'The proposal lacks sufficient detail.',
                            citations: [
                                {
                                    quote: 'Source quotation.',
                                    source: {
                                        url: 'https://example.org/evidence',
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    };
    const text = [],
        links = [];
    walk(IssuePatterns({ profile }), text, links);
    assert.ok(text.includes('Insufficient evidence'));
    assert.ok(text.join(' ').includes('AI interpretation'));
    assert.ok(text.join(' ').includes('Recorded vote: YEA'));
    assert.ok(text.includes('Source quotation.'));
    assert.ok(text.includes('Platform alignment has not been assessed.'));
    assert.deepEqual(links, ['https://example.org/evidence']);
    const filtered = [];
    walk(IssuePatterns({ profile, topic: 'healthcare' }), filtered, []);
    assert.ok(!filtered.includes('Strengthen tenant protections.'));
    assert.ok(
        filtered.includes(
            'No supported issue interpretations in this topic yet.',
        ),
    );
    profile.issue_analysis.coverage.scope =
        'includes_unconfirmed_attribution_leads';
    const privateText = [];
    walk(IssuePatterns({ profile }), privateText, []);
    assert.ok(!privateText.includes('Strengthen tenant protections.'));
});

test('pillar tags summarize reviewed findings and leave mixed or missing evidence inconclusive', () => {
    const tag = (...statuses) =>
        pillarAlignmentTag(
            {
                findings: statuses.map((status) => ({
                    pillar_id: 'housing',
                    status,
                })),
            },
            'housing',
        );
    assert.equal(
        tag('supports_commitment', 'consistent_with_later_position'),
        'aligned',
    );
    assert.equal(tag('potential_tension'), 'against');
    assert.equal(
        tag('supports_commitment', 'potential_tension'),
        'inconclusive',
    );
    assert.equal(tag('supports_commitment', 'inconclusive'), 'inconclusive');
    assert.equal(tag(), 'inconclusive');
});
