import { render } from 'preact';
import { ErrorBoundary } from './components/ui/ErrorBoundary.jsx';
import { App } from './App.jsx';
import './styles.css';

render(
    <ErrorBoundary>
        <App />
    </ErrorBoundary>,
    document.getElementById('app'),
);
