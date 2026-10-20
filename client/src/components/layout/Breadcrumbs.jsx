export function Breadcrumbs({ route, dataset, party }) {
    if (route.view === 'match')
        return (
            <nav class="breadcrumbs" aria-label="Breadcrumb">
                <ol>
                    <li>
                        <span aria-current="page">Compare your views</span>
                    </li>
                </ol>
            </nav>
        );
    if (route.view === 'platform')
        return (
            <nav class="breadcrumbs" aria-label="Breadcrumb">
                <ol>
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
    if (route.view === 'parties')
        return (
            <nav class="breadcrumbs" aria-label="Breadcrumb">
                <ol>
                    <li>
                        <span aria-current="page">Parties</span>
                    </li>
                </ol>
            </nav>
        );
    return (
        <nav class="breadcrumbs" aria-label="Breadcrumb">
            <ol>
                <li>
                    {route.view === 'constituencies' ? (
                        <span aria-current="page">Constituencies</span>
                    ) : (
                        <a href="#/constituencies">Constituencies</a>
                    )}
                </li>
                {route.code && (
                    <li>
                        <span aria-current="page">
                            {dataset?.district.name || route.code}
                        </span>
                    </li>
                )}
            </ol>
        </nav>
    );
}
