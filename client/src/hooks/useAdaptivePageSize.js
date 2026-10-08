import { useEffect, useRef, useState } from 'preact/hooks';

export function useAdaptivePageSize(query, matchCount, page) {
    const [pageSize, setPageSize] = useState(5);
    const tableRef = useRef(null);
    const paginationRef = useRef(null);
    const rowHeight = useRef(0);
    const tableWidth = useRef(0);

    const currentPage = Math.min(
        page,
        Math.max(1, Math.ceil(matchCount / pageSize)),
    );

    useEffect(() => {
        const table = tableRef.current;
        if (!table) return;

        function fitRows() {
            const bounds = table.getBoundingClientRect();
            if (bounds.width !== tableWidth.current) {
                rowHeight.current = 0;
                tableWidth.current = bounds.width;
            }
            const heights = [...table.querySelectorAll('tbody tr')].map(
                (row) => row.getBoundingClientRect().height,
            );
            rowHeight.current = Math.max(rowHeight.current, ...heights);
            if (!rowHeight.current) return;
            const headerHeight = table
                .querySelector('thead')
                .getBoundingClientRect().height;
            const controlsHeight =
                paginationRef.current?.getBoundingClientRect().height || 40;
            const available =
                window.innerHeight -
                (bounds.top + window.scrollY) -
                headerHeight -
                controlsHeight -
                52;
            setPageSize(
                Math.max(
                    5,
                    Math.min(25, Math.floor(available / rowHeight.current)),
                ),
            );
        }
        fitRows();
        const observer = new ResizeObserver(fitRows);
        observer.observe(table);
        observer.observe(document.querySelector('.constituency-tools'));
        window.addEventListener('resize', fitRows);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', fitRows);
        };
    }, [query, matchCount, currentPage]);

    return { pageSize, tableRef, paginationRef };
}
