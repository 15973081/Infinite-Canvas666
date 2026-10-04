// Pure protocol parsing; no window, DOM, storage or transport dependencies.
export function parseMessage(text) {
    try {
        const data = JSON.parse(text);
        return data && !Array.isArray(data) && typeof data === 'object' && typeof data.type === 'string' ? data : null;
    } catch(_) { return null; }
}
