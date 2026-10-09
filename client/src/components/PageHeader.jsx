import { Breadcrumbs } from './Breadcrumbs.jsx';
import { partyName } from '../helpers/candidates.js';

export function PageHeader({ route, dataset, candidate, party }) {
    let title = 'Constituencies';
    let context = 'BC election guide';
    let description =
        'Find your constituency and explore the candidates running to represent you as an MLA.';

    if (route.view === 'parties') {
        title = 'Parties';
        context = '2026 BC provincial election';
        description =
            'Meet the party leaders and compare their main campaign promises.';
    } else if (route.view === 'platform') {
        title = `${party.name} platform`;
        context = '2026 BC provincial election';
        description =
            'Explore the party’s commitments. Select a policy for its proposed plan of action.';
    } else if (route.view === 'district') {
        title = dataset?.district.name || route.code;
        context = dataset?.election.title || 'BC election guide';
        description = 'Candidates for MLA · Listed alphabetically.';
    } else if (route.view === 'candidate') {
        title = candidate?.ballot_name || 'Candidate';
        context = `${dataset?.district.name || route.code} · Candidate for MLA`;
        description = candidate
            ? partyName(candidate, dataset)
            : 'Candidate details';
    } else if (route.view === 'missing') {
        title = 'Page not found';
        description =
            'Browse constituencies to find candidates and their records.';
    }

    return (
        <header class="page-header">
            <Breadcrumbs
                route={route}
                dataset={dataset}
                candidate={candidate}
                party={party}
            />
            <p class="page-header-context" title={context}>
                {context}
            </p>
            <h1 class="page-header-title">{title}</h1>
            <p class="page-header-description">{description}</p>
        </header>
    );
}
