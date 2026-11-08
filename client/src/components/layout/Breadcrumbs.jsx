export function Breadcrumbs({ route, district, party }) {
    // Breadcrumbs mark a page that sits under a parent. Routes that the site
    // header already marks need no trail.
    if (route.view === 'district')
        return (
            <nav class="breadcrumbs" aria-label="Breadcrumb">
                <ol>
                    <li>
                        <a href="#/constituencies">Constituencies</a>
                    </li>
                    <li>
                        <span aria-current="page">
                            {district?.name || route.code}
                        </span>
                    </li>
                </ol>
            </nav>
        );

    if (route.view !== 'platform') return null;

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
}
