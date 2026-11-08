import { RetryError } from './components/ui/RetryError.jsx';
import { useRef, useState } from 'preact/hooks';
import { lazy, Suspense } from 'preact/compat';
import { useVoterResource } from './hooks/useVoterResource.js';
import { useElectionData } from './hooks/useElectionData.js';
import { PageHeader } from './components/layout/PageHeader.jsx';
import { SiteHeader } from './components/layout/SiteHeader.jsx';
import { SiteFooter } from './components/layout/SiteFooter.jsx';
import { Constituencies } from './routes/Constituencies.jsx';
import { District } from './routes/District.jsx';
import { Results } from './routes/Results.jsx';
import { Cabinet } from './routes/Cabinet.jsx';
import { Match } from './routes/Match.jsx';
import { Platform } from './routes/Platform.jsx';
import { useGuide } from './hooks/useGuide.js';
import { resultHeadline } from './helpers/results.js';
import { Parties } from './routes/Parties.jsx';
import { NotFound } from './routes/NotFound.jsx';

const Finder = lazy(() =>
    import('./components/finder/Finder.jsx').then((module) => ({
        default: module.Finder,
    })),
);

export function App() {
    const [finderOpen, setFinderOpen] = useState(false);
    const finderButton = useRef(null);
    const closeFinder = () => {
        setFinderOpen(false);
        requestAnimationFrame(() => finderButton.current?.focus());
    };
    const {
        route,
        results,
        resultsLoading,
        resultsError,
        retryResults,
        cabinet,
        cabinetLoading,
        cabinetError,
        retryCabinet,
    } = useElectionData();
    const {
        guide,
        loading: guideLoading,
        error: guideError,
        retry: retryGuide,
    } = useGuide(['parties', 'platform'].includes(route.view));
    const registry = useVoterResource(
        route.view === 'match' ? '/api/parties' : null,
    );
    const guideParties = [
        ...(guide?.parties || []),
        ...(guide?.otherParties || []),
    ];
    const party = guideParties.find((row) => row.id === route.partyID);
    const district =
        route.code && results ? results.districts[route.code] : null;
    const displayRoute =
        (route.code && results && !district) ||
        (route.view === 'platform' && guide && !party)
            ? { view: 'missing' }
            : route;
    const resultsHeadline =
        route.view === 'results' && results
            ? resultHeadline(results)
            : undefined;

    return (
        <>
            <a
                class="skip-link"
                href="#main-content"
                onClick={(event) => {
                    event.preventDefault();
                    document.getElementById('main-content').focus();
                }}
            >
                Skip to main content
            </a>
            <SiteHeader route={displayRoute} />
            <main class="shell" id="main-content" tabIndex="-1">
                <PageHeader
                    route={displayRoute}
                    district={district}
                    party={party}
                    title={resultsHeadline}
                />

                {route.view === 'results' &&
                    (resultsLoading ? (
                        <p role="status">Loading results…</p>
                    ) : resultsError ? (
                        <RetryError
                            error={resultsError}
                            onRetry={retryResults}
                        />
                    ) : (
                        results && <Results results={results} />
                    ))}

                {route.view === 'constituencies' &&
                    (resultsLoading ? (
                        <p role="status">Loading constituency results…</p>
                    ) : resultsError ? (
                        <RetryError
                            error={resultsError}
                            onRetry={retryResults}
                        />
                    ) : (
                        results && (
                            <Constituencies
                                results={results}
                                onFind={() => setFinderOpen(true)}
                                finderButtonRef={finderButton}
                            />
                        )
                    ))}

                {route.code &&
                    (resultsLoading ? (
                        <p role="status">Loading constituency results…</p>
                    ) : resultsError ? (
                        <RetryError
                            error={resultsError}
                            onRetry={retryResults}
                        />
                    ) : (
                        district && (
                            <District
                                key={route.code}
                                district={district}
                                parties={results.parties}
                            />
                        )
                    ))}

                {route.view === 'cabinet' &&
                    (cabinetLoading ? (
                        <p role="status">Loading cabinet…</p>
                    ) : cabinetError ? (
                        <RetryError
                            error={cabinetError}
                            onRetry={retryCabinet}
                        />
                    ) : (
                        cabinet &&
                        results && (
                            <Cabinet
                                cabinet={cabinet}
                                parties={results.parties}
                            />
                        )
                    ))}

                {route.view === 'parties' &&
                    (guideLoading || resultsLoading ? (
                        <p role="status">Loading party results…</p>
                    ) : guideError ? (
                        <RetryError error={guideError} onRetry={retryGuide} />
                    ) : resultsError ? (
                        <RetryError
                            error={resultsError}
                            onRetry={retryResults}
                        />
                    ) : (
                        guide &&
                        results && <Parties {...guide} results={results} />
                    ))}

                {route.view === 'platform' &&
                    (guideLoading ? (
                        <p role="status">Loading party content…</p>
                    ) : guideError ? (
                        <RetryError error={guideError} onRetry={retryGuide} />
                    ) : null)}
                {route.view === 'match' && <Match registry={registry} />}
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
                    <Finder onClose={closeFinder} />
                </Suspense>
            )}
            <SiteFooter />
        </>
    );
}
