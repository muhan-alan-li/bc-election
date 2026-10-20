export function createStaticFinder() {
    const worker = new Worker(__FINDER_WORKER_URL__, { type: 'module' });
    const pending = new Map();
    let sequence = 0;
    worker.onmessage = ({ data }) => {
        const task = pending.get(data.id);
        if (!task) return;
        if (data.error) task.reject(new Error(data.error));
        else task.resolve(data.result);
    };
    worker.onerror = (event) => {
        event.preventDefault();
        for (const task of [...pending.values()])
            task.reject(
                new Error(
                    'The constituency finder could not start. Reload the page and try again.',
                ),
            );
    };
    return {
        lookup(input, signal) {
            return new Promise((resolve, reject) => {
                const id = ++sequence;
                let timer;
                const finish = (fn, value) => {
                    clearTimeout(timer);
                    signal?.removeEventListener('abort', abort);
                    pending.delete(id);
                    fn(value);
                };
                const abort = () => {
                    worker.postMessage({ id, cancel: true });
                    finish(
                        reject,
                        new DOMException('Lookup cancelled', 'AbortError'),
                    );
                };
                if (signal?.aborted) {
                    abort();
                    return;
                }
                pending.set(id, {
                    resolve: (v) => finish(resolve, v),
                    reject: (e) => finish(reject, e),
                });
                signal?.addEventListener('abort', abort, { once: true });
                timer = setTimeout(() => {
                    worker.postMessage({ id, cancel: true });
                    finish(
                        reject,
                        new Error(
                            'The request took too long. Please try again.',
                        ),
                    );
                }, 15000);
                worker.postMessage({ id, input });
            });
        },
        dispose() {
            for (const task of [...pending.values()])
                task.reject(new DOMException('Lookup cancelled', 'AbortError'));
            worker.terminate();
        },
    };
}
