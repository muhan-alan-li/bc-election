import { SourceLink } from '../ui/SourceLink.jsx';
import { useState } from 'preact/hooks';
import { Dialog } from '../ui/Dialog.jsx';
import { useConstituencyFinder } from '../../hooks/useConstituencyFinder.js';
import { ConstituencyMap } from './ConstituencyMap.jsx';
import { FinderResult } from './FinderResult.jsx';
import { staticSite } from '../../helpers/deployment.js';

export function Finder({ onClose }) {
    const [postal, setPostal] = useState('');
    const { result, error, busy, lookup, useLocation } =
        useConstituencyFinder();

    return (
        <Dialog class="finder-panel" titleId="finder-title" onClose={onClose}>
            <div class="finder-head">
                <h2 id="finder-title">Find my constituency</h2>
                <button
                    class="secondary"
                    aria-label="Close constituency finder"
                    onClick={onClose}
                >
                    Close
                </button>
            </div>
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    lookup({ postal_code: postal });
                }}
            >
                <label for="finder-postal">BC postal code</label>
                <div class="finder-input">
                    <button
                        type="button"
                        class="secondary location-button"
                        disabled={busy}
                        onClick={useLocation}
                        aria-label="Use my location"
                        title="Use my location"
                    >
                        <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            aria-hidden="true"
                        >
                            <circle cx="12" cy="12" r="7" />
                            <circle cx="12" cy="12" r="2" />
                            <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
                        </svg>
                    </button>
                    <input
                        id="finder-postal"
                        autoComplete="postal-code"
                        placeholder="V6Y 1N9"
                        maxLength="7"
                        required
                        value={postal}
                        onInput={(event) =>
                            setPostal(event.currentTarget.value)
                        }
                    />
                    <button class="secondary" disabled={busy}>
                        Find
                    </button>
                </div>
            </form>
            <div aria-live="polite">
                {busy && <p role="status">Finding your constituency…</p>}
                {error && <p role="alert">{error}</p>}
            </div>
            <ConstituencyMap result={result} onLookup={lookup} />
            <FinderResult result={result} onClose={onClose} />
            <p class="note">
                <strong>Approximate results.</strong> Postal codes can span
                boundaries, location readings can be imprecise, and your current
                location may differ from your home address. This finder does not
                determine your official electoral district.{' '}
                <SourceLink href="https://elections.bc.ca/resources/maps/find-your-district/">
                    Confirm with Elections BC
                </SourceLink>
                .
            </p>
            <p class="finder-sources">
                Postal locations:{' '}
                <SourceLink
                    href="https://www.geonames.org/export/zip/"
                    showIcon={false}
                >
                    GeoNames (CC BY 3.0, 2023 download)
                </SourceLink>{' '}
                and{' '}
                <SourceLink
                    href="https://www.statcan.gc.ca/en/lode/databases/oda"
                    showIcon={false}
                >
                    Statistics Canada ODA (2021, Open Government Licence –
                    Canada)
                </SourceLink>
                . Boundaries:{' '}
                <SourceLink
                    href="https://elections.bc.ca/resources/maps/gis-spatial-data/"
                    showIcon={false}
                >
                    Elections BC, 2023 redistribution
                </SourceLink>
                .
            </p>
            <p class="finder-sources">
                {staticSite
                    ? 'Lookups are calculated in your browser. Your precise coordinates are not sent to a lookup server. '
                    : 'Locations are processed by this app’s server. '}
                Map tiles load from OpenStreetMap, which receives your IP and
                the map area you view. We do not save your location.
            </p>
        </Dialog>
    );
}
