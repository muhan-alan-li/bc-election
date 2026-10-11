export function paginate(items, page, pageSize) {
    const pages = Math.max(1, Math.ceil(items.length / pageSize));
    const currentPage = Math.max(1, Math.min(page, pages));
    const start = (currentPage - 1) * pageSize;
    return {
        pages,
        currentPage,
        start,
        rows: items.slice(start, start + pageSize),
    };
}
