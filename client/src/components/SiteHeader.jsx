export function SiteHeader({ route }) {
    return (
        <header class="site-header">
            <div class="shell">
                <a class="brand" href="#/constituencies">
                    BC election guide
                </a>
                <nav class="top-nav" aria-label="Main navigation">
                    <a
                        href="#/constituencies"
                        aria-current={
                            [
                                'constituencies',
                                'district',
                                'candidate',
                            ].includes(route.view)
                                ? 'page'
                                : undefined
                        }
                    >
                        Constituencies
                    </a>
                    <a
                        href="#/parties"
                        aria-current={
                            route.view === 'parties' ? 'page' : undefined
                        }
                    >
                        Parties
                    </a>
                </nav>
            </div>
        </header>
    );
}
