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
                            route.view !== 'missing' ? 'page' : undefined
                        }
                    >
                        Constituencies
                    </a>
                </nav>
            </div>
        </header>
    );
}
