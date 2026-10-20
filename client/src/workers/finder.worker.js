import { StaticFinder } from '../helpers/finder/engine.js';

const finder = new StaticFinder();
const requests = new Map();
self.onmessage = async ({ data }) => {
    if (data.cancel) {
        requests.get(data.id)?.abort();
        return;
    }
    const controller = new AbortController();
    requests.set(data.id, controller);
    try {
        const result = await finder.lookup(data.input, controller.signal);
        if (!controller.signal.aborted)
            self.postMessage({ id: data.id, result });
    } catch (error) {
        if (!controller.signal.aborted)
            self.postMessage({ id: data.id, error: error.message });
    } finally {
        requests.delete(data.id);
    }
};
