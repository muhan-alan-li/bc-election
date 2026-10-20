import { RetryError } from './components/ui/RetryError.jsx';
import { useState } from 'preact/hooks';
import { lazy, Suspense } from 'preact/compat';
import { useVoterResource } from './hooks/useVoterResource.js';
import { useElectionData } from './hooks/useElectionData.js';
import { PageHeader } from './components/layout/PageHeader.jsx';
import { SiteHeader } from './components/layout/SiteHeader.jsx';
import { SiteFooter } from './components/layout/SiteFooter.jsx';
import { Constituencies } from './routes/Constituencies.jsx';
import { District } from './routes/District.jsx';
import { Match } from './routes/Match.jsx';
import { Platform } from './routes/Platform.jsx';
import { useGuide } from './hooks/useGuide.js';
import { Parties } from './routes/Parties.jsx';
import { NotFound } from './routes/NotFound.jsx';

const Finder = lazy(() =>
    import('./components/finder/Finder.jsx').then((module) => ({
        default: module.Finder,
    })),
);

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
        retryCatalog,
        retryBallot,
    } = useElectionData();
    const {
        guide,
        loading: guideLoading,
        error: guideError,
        retry: retryGuide,
    } = useGuide(['parties', 'platform'].includes(route.view));
    const registry = useVoterResource(
        ['match', 'district'].includes(route.view) ? '/api/parties' : null,
    );
    const guideParties = [
        ...(guide?.parties || []),
        ...(guide?.otherParties || []),
    ];
    const party = guideParties.find((row) => row.id === route.partyID);
    const displayRoute =
        route.view === 'platform' && guide && !party
            ? { view: 'missing' }
            : route;

    return (
        <>
            <SiteHeader route={displayRoute} />
            <main class="shell" id="main-content" tabIndex="-1">
                <PageHeader
                    route={displayRoute}
                    dataset={dataset}
                    party={party}
                />
                {route.view === 'constituencies' && (
                    <>
                        {catalogLoading ? (
                            <p role="status">Loading constituencies…</p>
                        ) : catalogError ? (
                            <RetryError
                                error={catalogError}
                                onRetry={retryCatalog}
                            />
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
                            <RetryError error={error} onRetry={retryBallot} />
                        ) : (
                            <District
                                key={route.code}
                                dataset={dataset}
                                registry={registry}
                            />
                        )}
                    </>
                )}
                {['parties', 'platform'].includes(route.view) &&
                    (guideLoading ? (
                        <p role="status">Loading party content…</p>
                    ) : guideError ? (
                        <RetryError error={guideError} onRetry={retryGuide} />
                    ) : null)}
                {route.view === 'match' && <Match registry={registry} />}
                {route.view === 'parties' && guide && <Parties {...guide} />}
                {route.view === 'platform' && party && (
                    <Platform
                        key={party.id}
                        party={party}
                        reviewedOn={guide.reviewedOn}
                    />
                )}
                {displayRoute.view === 'missing' && <NotFound />}
            </main>
            {finderOpen && (
                <Suspense
                    fallback={
                        <p role="status" class="shell">
                            Loading constituency finder…
                        </p>
                    }
                >
                    <Finder onClose={() => setFinderOpen(false)} />
                </Suspense>
            )}
            <SiteFooter />
        </>
    );
}
