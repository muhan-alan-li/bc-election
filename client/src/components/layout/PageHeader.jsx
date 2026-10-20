import { useEffect } from 'preact/hooks';
import { Breadcrumbs } from './Breadcrumbs.jsx';

export function PageHeader({ route, dataset, party }) {
    let title = 'Constituencies';

    if (route.view === 'match') {
        title = 'Where do you stand?';
    } else if (route.view === 'parties') {
        title = 'Parties';
    } else if (route.view === 'platform') {
        title = `${party?.name || 'Party'} platform`;
    } else if (route.view === 'district') {
        title = dataset?.district.name || route.code;
    } else if (route.view === 'missing') {
        title = 'Page not found';
    }

    const routeKey = JSON.stringify(route);
    useEffect(() => {
        const previous = history.scrollRestoration;
        history.scrollRestoration = 'manual';
        return () => {
            history.scrollRestoration = previous;
        };
    }, []);
    useEffect(() => {
        document.title = `${title} · BC Election Guide`;
    }, [title]);
    useEffect(() => {
        const heading = document.getElementById('page-title');
        const position = history.state?.scrollY;
        heading?.focus({ preventScroll: true });
        window.scrollTo(0, typeof position === 'number' ? position : 0);
        const remember = () =>
            history.replaceState(
                { ...history.state, scrollY: window.scrollY },
                '',
            );
        window.addEventListener('scroll', remember, { passive: true });
        return () => window.removeEventListener('scroll', remember);
    }, [routeKey]);
    return (
        <header class="page-header">
            <Breadcrumbs route={route} dataset={dataset} party={party} />
            <h1 class="page-header-title" id="page-title" tabIndex="-1">
                {title}
            </h1>
        </header>
    );
}
