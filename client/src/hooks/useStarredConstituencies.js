import { useEffect, useState } from 'preact/hooks';

const storageKey = 'bc-election-starred-constituencies';

function parseStars(value) {
    const saved = JSON.parse(value || '[]');
    return Array.isArray(saved)
        ? saved.filter((code) => typeof code === 'string')
        : [];
}

export function useStarredConstituencies() {
    const [starred, setStarred] = useState(() => {
        try {
            return parseStars(localStorage.getItem(storageKey));
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
            localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
            /* Stars still work when browser storage is unavailable. */
        }
    }

    useEffect(() => {
        function syncStars(event) {
            if (event.key !== storageKey && event.key !== null) return;
            try {
                setStarred(parseStars(event.newValue));
            } catch {
                /* Ignore malformed storage updates. */
            }
        }
        window.addEventListener('storage', syncStars);

        return () => window.removeEventListener('storage', syncStars);
    }, []);

    return { starred, toggleStar };
}
