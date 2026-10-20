export function SiteHeader({ route }) {
    return (
        <header class="site-header">
            <div class="shell">
                <a class="brand" href="#/match">
                    BC election guide
                </a>
                <nav class="top-nav" aria-label="Main navigation">
                    <a
                        href="#/match"
                        aria-current={
                            route.view === 'match' ? 'page' : undefined
                        }
                    >
                        Compare your views
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
