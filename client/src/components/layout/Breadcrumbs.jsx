export function Breadcrumbs({ route, district, party }) {
    const root = (
        <li>
            {['results'].includes(route.view) ? (
                <span aria-current="page">Results</span>
            ) : (
                <a href="#/results">Results</a>
            )}
        </li>
    );

    if (route.view === 'results')
        return (
            <nav class="breadcrumbs" aria-label="Breadcrumb">
                <ol>{root}</ol>
            </nav>
        );

    if (route.view === 'missing')
        return (
            <nav class="breadcrumbs" aria-label="Breadcrumb">
                <ol>
                    {root}
                    <li>
                        <span aria-current="page">Page not found</span>
                    </li>
                </ol>
            </nav>
        );

    if (route.view === 'match')
        return (
            <nav class="breadcrumbs" aria-label="Breadcrumb">
                <ol>
                    <li>
                        <a href="#/results">Results</a>
                    </li>
                    <li>
                        <span aria-current="page">Compare your views</span>
                    </li>
                </ol>
            </nav>
        );
    if (route.view === 'cabinet')
        return (
            <nav class="breadcrumbs" aria-label="Breadcrumb">
                <ol>
                    {root}
                    <li>
                        <span aria-current="page">Cabinet</span>
                    </li>
                </ol>
            </nav>
        );
    if (route.view === 'parties')
        return (
            <nav class="breadcrumbs" aria-label="Breadcrumb">
                <ol>
                    {root}
                    <li>
                        <span aria-current="page">Parties</span>
                    </li>
                </ol>
            </nav>
        );
    if (route.view === 'platform')
        return (
            <nav class="breadcrumbs" aria-label="Breadcrumb">
                <ol>
                    {root}
                    <li>
                        <a href="#/parties">Parties</a>
                    </li>
                    <li>
                        <span aria-current="page">
                            {party?.name || 'Party'} platform
                        </span>
                    </li>
                </ol>
            </nav>
        );
    if (route.view === 'constituencies')
        return (
            <nav class="breadcrumbs" aria-label="Breadcrumb">
                <ol>
                    {root}
                    <li>
                        <span aria-current="page">Constituencies</span>
                    </li>
                </ol>
            </nav>
        );
    return (
        <nav class="breadcrumbs" aria-label="Breadcrumb">
            <ol>
                {root}
                <li>
                    {route.code ? (
                        <a href="#/constituencies">Constituencies</a>
                    ) : (
                        <span aria-current="page">Constituencies</span>
                    )}
                </li>
                {route.code && (
                    <li>
                        <span aria-current="page">
                            {district?.name || route.code}
                        </span>
                    </li>
                )}
            </ol>
        </nav>
    );
}
