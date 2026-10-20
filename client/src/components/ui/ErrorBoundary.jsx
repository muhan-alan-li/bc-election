import { Component } from 'preact';

export class ErrorBoundary extends Component {
    state = { failed: false };
    static getDerivedStateFromError() {
        return { failed: true };
    }
    render() {
        if (this.state.failed)
            return (
                <main class="shell" id="main-content" tabIndex="-1">
                    <h1>Something went wrong</h1>
                    <p>This page could not be displayed.</p>
                    <button
                        class="secondary"
                        onClick={() => window.location.reload()}
                    >
                        Reload page
                    </button>
                </main>
            );
        return this.props.children;
    }
}
