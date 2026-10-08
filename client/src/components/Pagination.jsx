export function Pagination({
    currentPage,
    pages,
    onPageChange,
    paginationRef,
    label,
}) {
    return (
        <nav ref={paginationRef} class="pagination" aria-label={label}>
            <button
                class="secondary"
                disabled={currentPage === 1}
                onClick={() => onPageChange(currentPage - 1)}
            >
                Previous
            </button>
            <span>
                Page {currentPage} of {pages}
            </span>
            <button
                class="secondary"
                disabled={currentPage === pages}
                onClick={() => onPageChange(currentPage + 1)}
            >
                Next
            </button>
        </nav>
    );
}
