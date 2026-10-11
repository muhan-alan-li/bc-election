import { useLayoutEffect, useRef } from 'preact/hooks';

export function PolicyDialog({
    title,
    eyebrow,
    color,
    onClose,
    children,
    closeLabel = 'Close expanded policy',
}) {
    const dialog = useRef(null);
    useLayoutEffect(() => {
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        const element = dialog.current;
        document.body.style.overflow = 'hidden';
        element.showModal();
        return () => {
            element.close();
            document.body.style.overflow = previousOverflow;
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, []);
    return (
        <dialog
            ref={dialog}
            class="policy-dialog"
            aria-labelledby="policy-title"
            style={{ '--party-color': color }}
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
        </dialog>
    );
}
