import { useEffect, useRef, useState } from 'preact/hooks';
import {
    parties,
    reviewedOn,
    otherParties,
    partyRosterSource,
} from '../data/parties.js';
import { SourceLink } from '../components/SourceLink.jsx';

function PartyCard({ party, onSelect, compact = false }) {
    return (
        <button
            key={party.id}
            type="button"
            class={`party-card${compact ? ' party-card-compact' : ''}`}
            style={{ '--party-color': party.color }}
            onClick={() => onSelect(party)}
            aria-haspopup="dialog"
            aria-label={`View ${party.name} promises, led by ${party.leader}`}
        >
            <span class="party-card-name">{party.name}</span>
            {party.portrait && (
                <img
                    class="party-portrait"
                    src={party.portrait}
                    alt={`Portrait of ${party.leader}`}
                    style={{ objectPosition: party.portraitPosition }}
                    width="400"
                    height="360"
                    loading={compact ? 'lazy' : 'eager'}
                />
            )}
            <span class="party-card-body">
                <span class="party-label">{party.leaderNote}</span>
                <span class="party-card-leader">{party.leader}</span>
                <span class="party-card-action">
                    {party.promises.length
                        ? 'Explore promises'
                        : 'View party details'}{' '}
                    <span aria-hidden="true">→</span>
                </span>
            </span>
        </button>
    );
}

function PartyPromises({ party, onClose }) {
    const dialog = useRef(null);
    useEffect(() => {
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        dialog.current.showModal();
        return () => {
            document.body.style.overflow = previousOverflow;
            previousFocus?.focus();
        };
    }, []);

    return (
        <dialog
            ref={dialog}
            class="party-panel"
            style={{ '--party-color': party.color }}
            aria-labelledby="party-panel-title"
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
            onClick={(event) => {
                if (event.target !== dialog.current) return;
                const bounds = dialog.current.getBoundingClientRect();
                if (
                    event.clientX < bounds.left ||
                    event.clientX > bounds.right ||
                    event.clientY < bounds.top ||
                    event.clientY > bounds.bottom
                )
                    onClose();
            }}
        >
            <div class="party-panel-head">
                <div>
                    <p class="party-label">Party platform</p>
                    <h2 id="party-panel-title">{party.name}</h2>
                </div>
                <button
                    type="button"
                    class="secondary"
                    onClick={onClose}
                    aria-label="Close party promises"
                    autoFocus
                >
                    Close
                </button>
            </div>
            <div class="party-panel-leader">
                {party.portrait && (
                    <img
                        src={party.portrait}
                        alt={`Portrait of ${party.leader}`}
                        style={{ objectPosition: party.portraitPosition }}
                    />
                )}
                <div>
                    <p class="party-label">{party.leaderNote}</p>
                    <h3>
                        <SourceLink href={party.leaderSource}>
                            {party.leader}
                        </SourceLink>
                    </h3>
                </div>
            </div>
            <h3 class="party-promises-heading">Main promises</h3>
            <ul class="party-promises">
                {party.promises.map(([topic, text]) => (
                    <li key={topic}>
                        <strong>{topic}</strong>
                        <p>{text}</p>
                    </li>
                ))}
            </ul>
            <div class="party-sources">
                <p class="note">{party.status}</p>
                {party.platform ? (
                    <p>
                        <SourceLink href={party.platform}>
                            Read the party’s plan / website
                        </SourceLink>
                    </p>
                ) : (
                    <p class="note">Platform source unavailable.</p>
                )}
                {party.note && <p class="note">{party.note}</p>}
            </div>
        </dialog>
    );
}

export function Parties() {
    const [selected, setSelected] = useState(null);
    return (
        <>
            <div class="parties-grid">
                {parties.map((party) => (
                    <PartyCard party={party} onSelect={setSelected} />
                ))}
            </div>
            <details class="other-parties">
                <summary>
                    Other parties running{' '}
                    <span class="count">{otherParties.length}</span>
                </summary>
                <p class="note">
                    Ten parties have candidates in the final 2026 roster. These
                    seven are shown in addition to the parties above. Platform
                    summaries for these parties have not yet been reviewed.
                </p>
                <div class="parties-grid other-parties-grid">
                    {otherParties.map((party) => (
                        <PartyCard
                            key={party.id}
                            party={party}
                            onSelect={setSelected}
                            compact
                        />
                    ))}
                </div>
                <p class="note">
                    <SourceLink href={partyRosterSource}>
                        Elections BC: final candidate list
                    </SourceLink>{' '}
                    ·{' '}
                    <SourceLink href="https://elections.bc.ca/candidates-parties/political-parties/">
                        Registered parties
                    </SourceLink>
                </p>
            </details>
            <p class="note">
                The premier leads a government that has the confidence of the
                legislature. Other registered parties and independent candidates
                also run in BC.{' '}
                <a href="#/constituencies">
                    Explore candidates in your constituency
                </a>
                .
            </p>
            {selected && (
                <PartyPromises
                    key={selected.id}
                    party={selected}
                    onClose={() => setSelected(null)}
                />
            )}
        </>
    );
}
