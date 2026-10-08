import { useEffect, useState } from 'preact/hooks';

export function useStarredConstituencies() {
    const [starred, setStarred] = useState(() => {
        try {
            const saved = JSON.parse(
                localStorage.getItem('bc-election-starred-constituencies') ||
                    '[]',
            );
            return Array.isArray(saved)
                ? saved.filter((code) => typeof code === 'string')
                : [];
        } catch {
            return [];
        }
    });

    function toggleStar(code) {
        const next = starred.includes(code)
            ? starred.filter((item) => item !== code)
            : [...starred, code];
        setStarred(next);
        try {
            localStorage.setItem(
                'bc-election-starred-constituencies',
                JSON.stringify(next),
            );
        } catch {
            /* Stars still work when browser storage is unavailable. */
        }
    }

    useEffect(() => {
        function syncStars(event) {
            if (
                event.key !== 'bc-election-starred-constituencies' &&
                event.key !== null
            )
                return;
            try {
                const saved = JSON.parse(event.newValue || '[]');
                setStarred(
                    Array.isArray(saved)
                        ? saved.filter((code) => typeof code === 'string')
                        : [],
                );
            } catch {
                /* Ignore malformed storage updates. */
            }
        }
        window.addEventListener('storage', syncStars);

        return () => window.removeEventListener('storage', syncStars);
    }, []);

    return { starred, toggleStar };
}
