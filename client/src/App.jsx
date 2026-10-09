import { RetryError } from './components/RetryError.jsx';
import { useState } from 'preact/hooks';
import { useElectionData } from './hooks/useElectionData.js';
import { districtHref } from './helpers/routes.js';
import { PageHeader } from './components/PageHeader.jsx';
import { SiteHeader } from './components/SiteHeader.jsx';
import { SiteFooter } from './components/SiteFooter.jsx';
import { Finder } from './components/finder/Finder.jsx';
import { Constituencies } from './routes/Constituencies.jsx';
import { District } from './routes/District.jsx';
import { Candidate } from './routes/Candidate.jsx';
import { Platform } from './routes/Platform.jsx';
import { parties, otherParties } from './data/parties.js';
import { Parties } from './routes/Parties.jsx';
import { NotFound } from './routes/NotFound.jsx';

export function App() {
    const [finderOpen, setFinderOpen] = useState(false);
    const {
        route,
        districts,
        dataset,
        catalogLoading,
        loading,
        catalogError,
        error,
        retry,
    } = useElectionData();
    const party = [...parties, ...otherParties].find(
        (row) => row.id === route.partyID,
    );
    const displayRoute =
        route.view === 'platform' && !party ? { view: 'missing' } : route;
    const candidate = dataset?.candidacies.find(
        (row) => row.id === route.candidateID,
    );

    return (
        <>
            <SiteHeader route={displayRoute} />
            <main class="shell">
                <PageHeader
                    route={displayRoute}
                    dataset={dataset}
                    candidate={candidate}
                    party={party}
                />
                {route.view === 'constituencies' && (
                    <>
                        {catalogLoading ? (
                            <p role="status">Loading constituencies…</p>
                        ) : catalogError ? (
                            <RetryError error={catalogError} onRetry={retry} />
                        ) : (
                            <Constituencies
                                districts={districts}
                                onFind={() => setFinderOpen(true)}
                            />
                        )}
                    </>
                )}
                {route.code && (
                    <>
                        {loading || (!dataset && !error) ? (
                            <p role="status">Loading candidates…</p>
                        ) : error ? (
                            <RetryError error={error} onRetry={retry} />
                        ) : route.view === 'district' ? (
                            <District key={route.code} dataset={dataset} />
                        ) : candidate ? (
                            <Candidate
                                key={candidate.id}
                                candidate={candidate}
                                dataset={dataset}
                            />
                        ) : (
                            <p role="alert">
                                Candidate not found in this constituency.{' '}
                                <a href={districtHref(route.code)}>
                                    View its candidates
                                </a>
                                .
                            </p>
                        )}
                    </>
                )}
                {route.view === 'parties' && <Parties />}
                {route.view === 'platform' && party && (
                    <Platform key={party.id} party={party} />
                )}
                {displayRoute.view === 'missing' && <NotFound />}
            </main>
            {finderOpen && <Finder onClose={() => setFinderOpen(false)} />}
            <SiteFooter />
        </>
    );
}
