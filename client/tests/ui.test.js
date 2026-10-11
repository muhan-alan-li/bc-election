import assert from 'node:assert/strict';
import test from 'node:test';
import { paginate } from '../src/helpers/pagination.js';
import { loadComponents, walk } from './helpers/components.js';

const { Table, Card, Pagination, SourceLink } = await loadComponents(`
    export { Table } from './src/components/ui/Table.jsx';
    export { Card } from './src/components/ui/Card.jsx';
    export { Pagination } from './src/components/ui/Pagination.jsx';
    export { SourceLink } from './src/components/ui/SourceLink.jsx';
`);

test('tables keep accessible headers, row content, scrolling and measurement refs', () => {
    const tableRef = { current: null };
    const row = {
        type: 'tr',
        props: { children: { type: 'td', props: { children: 'Bill A' } } },
    };
    const table = Table({
        label: 'Votes',
        columns: [{ label: 'Bill' }, { label: 'Vote', class: 'vote-column' }],
        children: row,
        compact: true,
        tableClass: 'votes',
        tableRef,
    });
    assert.equal(table.props.role, 'region');
    assert.equal(table.props['aria-label'], 'Votes');
    assert.equal(table.props.tabIndex, 0);
    assert.ok(table.props.class.includes('compact-table'));
    const nodes = [];
    walk(table, (node) => nodes.push(node));
    const element = nodes.find((node) => node.type === 'table');
    assert.equal(element.ref, tableRef);
    assert.equal(element.props.class, 'votes');
    assert.deepEqual(
        nodes
            .filter((node) => node.type === 'th')
            .map((node) => node.props.scope),
        ['col', 'col'],
    );
    assert.ok(nodes.includes(row));
    const empty = [];
    walk(
        Table({
            label: 'Votes',
            columns: [{ label: 'Bill' }, { label: 'Vote' }],
            empty: true,
            emptyMessage: 'No votes.',
        }),
        (node) => empty.push(node),
    );
    assert.equal(empty.find((node) => node.type === 'td').props.colSpan, 2);
    assert.ok(empty.includes('No votes.'));
});

test('cards preserve link, button and passive content semantics', () => {
    const link = Card({
        href: '#/parties',
        children: 'Parties',
        'aria-label': 'View parties',
    });
    assert.equal(link.type, 'a');
    assert.equal(link.props.href, '#/parties');
    assert.equal(link.props['aria-label'], 'View parties');
    let clicks = 0;
    const action = Card({ onClick: () => clicks++, 'aria-haspopup': 'dialog' });
    assert.equal(action.type, 'button');
    assert.equal(action.props.type, 'button');
    assert.equal(action.props['aria-haspopup'], 'dialog');
    action.props.onClick();
    assert.equal(clicks, 1);
    assert.equal(Card({ children: 'Evidence' }).type, 'article');
});

test('pagination handles last pages, smaller filtered lists and no results', () => {
    const rows = Array.from({ length: 23 }, (_, index) => index);
    assert.deepEqual(paginate(rows, 2, 10), {
        pages: 3,
        currentPage: 2,
        start: 10,
        rows: rows.slice(10, 20),
    });
    assert.deepEqual(paginate(rows, 3, 10).rows, [20, 21, 22]);
    assert.equal(paginate(rows.slice(0, 2), 3, 10).currentPage, 1);
    assert.deepEqual(paginate([], 3, 10), {
        pages: 1,
        currentPage: 1,
        start: 0,
        rows: [],
    });
    const nodes = [];
    let selected;
    walk(
        Pagination({
            currentPage: 1,
            pages: 3,
            onPageChange: (page) => (selected = page),
            label: 'Vote pages',
        }),
        (node) => nodes.push(node),
    );
    const buttons = nodes.filter((node) => node.type === 'button');
    assert.equal(buttons[0].props.disabled, true);
    assert.equal(buttons[1].props.disabled, false);
    buttons[1].props.onClick();
    assert.equal(selected, 2);
    const final = [];
    walk(
        Pagination({
            currentPage: 3,
            pages: 3,
            onPageChange: () => {},
            label: 'Vote pages',
        }),
        (node) => final.push(node),
    );
    assert.equal(
        final.filter((node) => node.type === 'button')[1].props.disabled,
        true,
    );
});

test('source links retain citation labels and safely open external evidence', () => {
    const link = SourceLink({
        href: 'https://example.org',
        children: '[1]',
        showIcon: false,
        'aria-label': 'Source 1',
        title: 'Evidence',
    });
    assert.equal(link.props.target, '_blank');
    assert.equal(link.props.rel, 'noopener noreferrer');
    assert.equal(link.props['aria-label'], 'Source 1');
    assert.equal(link.props.title, 'Evidence');
    const text = [];
    walk(link, (node) => {
        if (typeof node === 'string') text.push(node);
    });
    assert.deepEqual(text, ['[1]']);
    assert.equal(SourceLink({ children: 'Missing source' }), null);
});
