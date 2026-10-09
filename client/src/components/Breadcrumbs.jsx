import { districtHref } from '../helpers/routes.js';

export function Breadcrumbs({ route, dataset, candidate, party }) {
    if (route.view === 'platform')
        return (
            <nav class="breadcrumbs" aria-label="Breadcrumb">
                <ol>
                    <li>
                        <a href="#/parties">Parties</a>
                    </li>
                    <li>
                        <span aria-current="page">{party.name} platform</span>
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
        <nav class="breadcrumbs" aria-label="Breadcrumb" tabIndex="0">
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
                        {route.view === 'candidate' ? (
                            <a href={districtHref(route.code)}>
                                {dataset?.district.name || route.code}
                            </a>
                        ) : (
                            <span aria-current="page">
                                {dataset?.district.name || route.code}
                            </span>
                        )}
                    </li>
                )}
                {route.view === 'candidate' && (
                    <li>
                        <span aria-current="page">
                            {candidate?.ballot_name || 'Candidate'}
                        </span>
                    </li>
                )}
            </ol>
        </nav>
    );
}
