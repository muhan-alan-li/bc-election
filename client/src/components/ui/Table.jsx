// Keep row markup at the call site so domain-specific cells and row headers
// remain explicit. This component owns the accessible scrolling container.
export function Table({
    label,
    columns,
    children,
    compact = false,
    class: className = '',
    tableClass = '',
    tableRef,
    empty = false,
    emptyMessage = 'No entries to display.',
}) {
    return (
        <div
            class={`table-scroll${compact ? ' compact-table' : ''}${className ? ` ${className}` : ''}`}
            role="region"
            aria-label={label}
            tabIndex={0}
        >
            <table ref={tableRef} class={tableClass || undefined}>
                <thead>
                    <tr>
                        {columns.map((column) => (
                            <th
                                key={column.label}
                                scope="col"
                                class={column.class}
                            >
                                {column.visuallyHidden ? (
                                    <span class="visually-hidden">
                                        {column.label}
                                    </span>
                                ) : (
                                    column.label
                                )}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {empty ? (
                        <tr>
                            <td colSpan={columns.length}>{emptyMessage}</td>
                        </tr>
                    ) : (
                        children
                    )}
                </tbody>
            </table>
        </div>
    );
}
