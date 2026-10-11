# Client structure

The client uses Preact, hash-based routes, and esbuild. Run commands from this directory:

- `npm run build` rebuilds JavaScript, CSS, and versioned political profile assets in `dist/`.
- `npm run dev` watches frontend source and published political profiles. The Go content server serves the built files; refresh the browser after changes.
- `npm test` runs component, helper, and political asset-publication checks.
- `npm run format:check` checks source, styles, and tests.

## Where code belongs

| Folder                      | Responsibility                                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/routes/`               | Page composition and route-specific filtering and selection state.                                                                       |
| `src/components/ui/`        | Reusable primitives: `Table`, `Card`, `Dialog`, `Pagination`, `SourceLink`, and `RetryError`. No election data or feature-specific copy. |
| `src/components/layout/`    | Site header/footer, page header, and breadcrumbs.                                                                                        |
| `src/components/candidate/` | Candidate records, voting, disclosures, and promise comparisons.                                                                         |
| `src/components/parties/`   | Party presentation shared by party lists.                                                                                                |
| `src/components/platform/`  | Platform policy cards, expanded details, sources, and the policy dialog header.                                                          |
| `src/components/finder/`    | Constituency finder form, map, and results.                                                                                              |
| `src/hooks/`                | Browser state and effects: requests, routing, saved stars, and adaptive pagination sizing.                                               |
| `src/helpers/`              | Data access and pure transformations, labels, pagination, and route URLs.                                                                |
| `src/content/`              | Candidate editorial notes and finding copy.                                                                                              |
| `src/data/`                 | Local party and policy modules; currently gitignored. Restore these inputs before building a fresh checkout.                             |
| `build/`                    | Validation and packaging of published political profiles.                                                                                |
| `src/styles/`               | Base tokens and typography, shared UI/layout styles, and feature-specific styles. `src/styles.css` defines import order.                 |
| `tests/`                    | Behavioral checks; `tests/helpers/` contains shared component loading and traversal.                                                     |
| `dist/`                     | Generated output. Rebuild it after source changes; do not edit it directly.                                                              |

## Shared components

`Table` owns the scrolling region, accessible label, column headers, and optional empty row. Features supply explicit `<tr>` children so row headers and domain-specific cells remain clear. Use `compact` for dense record tables, `tableClass` for table geometry, and `tableRef` when measuring rows. Use `paginate` with `Pagination` for page slicing and navigation.

`Card` renders an anchor when given `href`, a button when given `onClick`, and an article for passive content. Features own card contents and styles. `PolicyCard` and `PartyCard` build on this shell.

`Dialog` owns native modal behavior, backdrop and Escape handling, body scroll locking, and focus restoration. Its children supply the title and close button; connect the title using `titleId`. `PolicyDialog` adds the policy-specific header and appearance, while the finder uses `Dialog` directly.

`SourceLink` centralizes external-link behavior and the new-tab indicator. Set `showIcon={false}` for numbered citations or attribution links, and pass accessible citation labels through its normal anchor props.

Keep domain labels and components within their feature unless they have multiple consumers. Add shared components for recurring behavior or presentation; simple page-specific markup can stay in the route.
