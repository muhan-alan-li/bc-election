import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadComponents, walk } from './helpers/components.js';

const { PolicyDetails, PolicySources, PolicyCard } = await loadComponents(`
        export { PolicyDetails } from './src/components/platform/PolicyDetails.jsx';
        export { PolicySources } from './src/components/platform/PolicySources.jsx';
        export { PolicyCard } from './src/components/platform/PolicyCard.jsx';
    `);

const guide = JSON.parse(
    await readFile(
        new URL(
            '../../content-server/content/bc-provincial-2026/guide.json',
            import.meta.url,
        ),
        'utf8',
    ),
);
const items = [...guide.parties, ...guide.otherParties].flatMap(
    (party) => party.items,
);

test('every expanded policy renders bullet text and the correct numbered citations', () => {
    assert.ok(items.length > 0);
    for (const item of items) {
        const tree = PolicyDetails({ item });
        const text = [],
            links = [];
        walk(tree, (node) => {
            if (typeof node === 'string') text.push(node);
            if (node.type === 'a') links.push(node.props);
        });
        for (const point of item.points)
            assert.ok(text.includes(point.text), item.topic);
        const expected = item.points.flatMap((point) =>
            point.sourceIndices.map((index) => item.sources[index].url),
        );
        assert.deepEqual(
            links.map((link) => link.href),
            expected,
            item.topic,
        );
        assert.ok(
            links.every((link) => link['aria-label'].startsWith('Source ')),
        );
        const sources = PolicySources({ sources: item.sources });
        assert.equal(sources.props.children[1].type, 'ol');
        walk(sources, () => {});
    }
});

test('selecting a policy card passes its complete summary to the dialog', () => {
    const item = items[0];
    let selected;
    const card = PolicyCard({
        item,
        onSelect: (value) => {
            selected = value;
        },
    });
    card.props.onClick();
    assert.equal(selected, item);
    assert.ok(selected.points[0].text);
});
