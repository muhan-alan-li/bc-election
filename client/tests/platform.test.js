import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundled = await build({
    stdin: {
        contents: `
            export { PolicyDetails } from './src/components/platform/PolicyDetails.jsx';
            export { PolicySources } from './src/components/platform/PolicySources.jsx';
            export { PolicyCard } from './src/components/platform/PolicyCard.jsx';
            export { parties, otherParties } from './src/data/parties.js';
            export { getPlatformItems } from './src/data/platform-details.js';
        `,
        resolveDir: fileURLToPath(new URL('../', import.meta.url)),
    },
    bundle: true,
    write: false,
    format: 'esm',
    jsx: 'automatic',
    jsxImportSource: 'preact',
    loader: { '.jpg': 'empty' },
});
const { PolicyDetails, PolicySources, PolicyCard, parties, otherParties, getPlatformItems } =
    await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

// Walk rendered Preact children, rejecting data objects that cannot be displayed.
function walk(node, visitor) {
    if (node == null || typeof node === 'boolean') return;
    if (Array.isArray(node)) return node.forEach(child => walk(child, visitor));
    if (typeof node === 'string' || typeof node === 'number') return visitor(node);
    assert.ok(node.type && node.props, 'Plain objects must not be rendered as JSX children');
    if (typeof node.type === 'function') return walk(node.type(node.props), visitor);
    visitor(node);
    walk(node.props.children, visitor);
}

const items = [...parties, ...otherParties].flatMap(getPlatformItems);

test('every expanded policy renders bullet text and the correct numbered citations', () => {
    assert.equal(items.length, 53);
    for (const item of items) {
        const tree = PolicyDetails({ item });
        const text = [], links = [];
        walk(tree, node => {
            if (typeof node === 'string') text.push(node);
            if (node.type === 'a') links.push(node.props);
        });
        for (const point of item.points) assert.ok(text.includes(point.text), item.topic);
        const expected = item.points.flatMap(point => point.sourceIndices.map(index => item.sources[index].url));
        assert.deepEqual(links.map(link => link.href), expected, item.topic);
        assert.ok(links.every(link => link['aria-label'].startsWith('Source ')));
        const sources = PolicySources({ sources: item.sources });
        assert.equal(sources.props.children[1].type, 'ol');
        walk(sources, () => {});
    }
});

test('selecting a policy card passes its complete summary to the dialog', () => {
    const item = items[0];
    let selected;
    const card = PolicyCard({ item, onSelect: value => { selected = value; } });
    card.props.onClick();
    assert.equal(selected, item);
    assert.ok(selected.points[0].text);
});
