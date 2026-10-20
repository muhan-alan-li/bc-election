import { Dialog } from '../ui/Dialog.jsx';

export function PolicyDialog({
    title,
    eyebrow,
    color,
    textColor = color,
    onClose,
    children,
    closeLabel = 'Close expanded policy',
}) {
    return (
        <Dialog
            class="policy-dialog"
            titleId="policy-title"
            style={{
                '--party-color': color,
                '--party-text-color': textColor,
            }}
            onClose={onClose}
        >
            <div class="policy-dialog-head">
                <div>
                    <p class="eyebrow">{eyebrow}</p>
                    <h2 id="policy-title">{title}</h2>
                </div>
                <button
                    class="secondary"
                    type="button"
                    autoFocus
                    onClick={onClose}
                    aria-label={closeLabel}
                >
                    Close
                </button>
            </div>
            {children}
        </Dialog>
    );
}
