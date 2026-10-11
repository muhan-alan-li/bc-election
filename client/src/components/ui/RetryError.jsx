export function RetryError({ error, onRetry }) {
    return (
        <p role="alert">
            {error}{' '}
            <button class="secondary" onClick={onRetry}>
                Try again
            </button>
        </p>
    );
}
