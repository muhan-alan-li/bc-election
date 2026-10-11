import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

export async function loadComponents(contents) {
    const bundled = await build({
        stdin: {
            contents,
            resolveDir: fileURLToPath(new URL('../../', import.meta.url)),
        },
        bundle: true,
        write: false,
        format: 'esm',
        jsx: 'automatic',
        jsxImportSource: 'preact',
        loader: { '.jpg': 'empty' },
    });
    return import(
        `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
    );
}

// Walk pure components without a browser, rejecting objects that cannot render.
// Stateful components need browser coverage and can be skipped by name.
export function walk(node, visitor, skip = []) {
    if (node == null || typeof node === 'boolean') return;
    if (Array.isArray(node))
        return node.forEach((child) => walk(child, visitor, skip));
    if (typeof node === 'string' || typeof node === 'number')
        return visitor(node);
    assert.ok(
        node.type && node.props,
        'Plain objects must not be rendered as JSX children',
    );
    if (typeof node.type === 'function') {
        if (skip.includes(node.type.name)) return;
        return walk(node.type(node.props), visitor, skip);
    }
    visitor(node);
    walk(node.props.children, visitor, skip);
}
