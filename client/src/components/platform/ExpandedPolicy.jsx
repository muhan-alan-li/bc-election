import { useEffect, useRef } from 'preact/hooks';
import { PolicyDetails } from './PolicyDetails.jsx';
import { PolicySources } from './PolicySources.jsx';

export function ExpandedPolicy({ party, item, onClose }) {
    const dialog = useRef(null);
    useEffect(() => {
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        dialog.current.showModal();
        return () => {
            document.body.style.overflow = previousOverflow;
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, []);
    return (
        <dialog
            ref={dialog}
            class="policy-dialog"
            aria-labelledby="policy-title"
            style={{ '--party-color': party.color }}
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
            <div class="policy-dialog-head">
                <div>
                    <p class="eyebrow">{party.name} · Platform</p>
                    <h2 id="policy-title">{item.topic}</h2>
                </div>
                <button
                    class="secondary"
                    type="button"
                    autoFocus
                    onClick={onClose}
                    aria-label="Close expanded policy"
                >
                    Close
                </button>
            </div>
            <p class="policy-summary">{item.summary}</p>
            <h3>Plan of action</h3>
            <PolicyDetails item={item} />
            {item.note && <p class="note">{item.note}</p>}
            <PolicySources sources={item.sources} />
        </dialog>
    );
}
