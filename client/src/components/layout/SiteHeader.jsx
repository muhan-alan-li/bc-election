export function SiteHeader({ route }) {
    return (
        <header class="site-header">
            <div class="shell">
                <a class="brand" href="#/results">
                    BC election results
                </a>
                <nav class="top-nav" aria-label="Main navigation">
                    <a
                        href="#/results"
                        aria-current={
                            route.view === 'results' ? 'page' : undefined
                        }
                    >
                        Results
                    </a>
                    <a
                        href="#/constituencies"
                        aria-current={
                            ['constituencies', 'district'].includes(route.view)
                                ? 'page'
                                : undefined
                        }
                    >
                        Constituencies
                    </a>
                    <a
                        href="#/cabinet"
                        aria-current={
                            route.view === 'cabinet' ? 'page' : undefined
                        }
                    >
                        Cabinet
                    </a>
                    <a
                        href="#/parties"
                        aria-current={
                            ['parties', 'platform'].includes(route.view)
                                ? 'page'
                                : undefined
                        }
                    >
                        Parties
                    </a>
                </nav>
            </div>
        </header>
    );
}
