import { useLayoutEffect, useRef } from 'preact/hooks';

export function Dialog({
    titleId,
    onClose,
    children,
    class: className = '',
    ...props
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
            {...props}
            class={`dialog${className ? ` ${className}` : ''}`}
            ref={dialog}
            aria-labelledby={titleId}
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
            {children}
        </dialog>
    );
}
