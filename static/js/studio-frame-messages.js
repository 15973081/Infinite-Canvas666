/* The shell's fixed iframe protocol. This does not own connections or business tasks. */
(() => {
    'use strict';
    const apiTypes = ['providers-changed', 'workflows-changed', 'comfy-instances-changed'];
    const currentTypes = ['cloud_status', 'canvas_updated'];
    const allTypes = ['canvas_locked', 'canvas_unlocked', 'asset_library_updated'];
    const types = new Set([...apiTypes, ...currentTypes, ...allTypes,
        'studio-theme', 'studio-lang', 'studio-ui-scale', 'canvas-focus', 'maintenance_changed']);

    function create(window) {
        const document = window.document;
        const subscriptions = new Map(), apiSubscriptions = new Set(), loadSubscriptions = new Set();
        const loads = new Map();
        let paused = false, destroyed = false, channel = null, generation = 0;
        const frames = () => [...document.querySelectorAll('iframe')];
        const known = data => data && typeof data === 'object' && types.has(data.type);
        function notify(callback, value) {
            try { callback(value); }
            catch(error) {
                if(typeof window.reportError === 'function') window.reportError(error);
                else window.setTimeout(() => {throw error;}, 0);
            }
        }
        function trusted(event) {
            if(event.origin !== window.location.origin) return false;
            return window.parent !== window ? event.source === window.parent :
                frames().some(frame => frame.contentWindow === event.source);
        }
        function receive(event) {
            if(paused || destroyed || !known(event.data) || !trusted(event)) return;
            for(const [callback, accepted] of subscriptions) {
                if(accepted.has(event.data.type)) notify(callback, event);
            }
        }
        function send(frame, data) {
            if(paused || destroyed || !known(data) || !frames().includes(frame)) return false;
            try {
                if(!frame.contentWindow) return false;
                frame.contentWindow.postMessage(data, window.location.origin);
                return true;
            } catch(_) { return false; }
        }
        function broadcast(data) { for(const frame of frames()) send(frame, data); }
        function forwardUpdate(data) {
            if(!known(data)) return;
            if(currentTypes.includes(data.type)) send(document.querySelector('iframe.active'), data);
            else if(allTypes.includes(data.type)) broadcast(data);
        }
        function subscribe(accepted, callback) {
            if(destroyed) return () => {};
            if(!accepted.every(type => types.has(type))) throw new TypeError('Unknown iframe message type');
            subscriptions.set(callback, new Set(accepted));
            return () => subscriptions.delete(callback);
        }
        function connectApi() {
            if(channel || paused || destroyed || !apiSubscriptions.size) return;
            try {
                const origin = generation;
                const next = new window.BroadcastChannel('studio-api');
                channel = next;
                next.onmessage = event => {
                    if(paused || destroyed || generation !== origin || channel !== next) return;
                    // The existing channel has its own payload rules; consumers retain them.
                    for(const callback of apiSubscriptions) notify(callback, event);
                };
            } catch(_) {}
        }
        function closeApi() { if(channel) { channel.onmessage = null; channel.close(); channel = null; } }
        function subscribeApi(callback) {
            if(destroyed) return () => {};
            apiSubscriptions.add(callback); connectApi();
            return () => {apiSubscriptions.delete(callback); if(!apiSubscriptions.size) closeApi();};
        }
        function clearLoads() { for(const [frame, callback] of loads) frame.removeEventListener('load', callback); loads.clear(); }
        function bindLoads() {
            clearLoads();
            if(paused || destroyed || !loadSubscriptions.size) return;
            for(const frame of frames()) {
                const origin = generation;
                const callback = () => {
                    if(paused || destroyed || origin !== generation || !frames().includes(frame)) return;
                    for(const fn of loadSubscriptions) notify(fn, frame);
                };
                loads.set(frame, callback); frame.addEventListener('load', callback);
            }
        }
        function watchFrameLoads(callback) {
            if(destroyed) return () => {};
            loadSubscriptions.add(callback); bindLoads();
            return () => {loadSubscriptions.delete(callback); bindLoads();};
        }
        function pause() {
            if(paused || destroyed) return;
            paused = true; generation++;
            window.removeEventListener('message', receive); closeApi(); clearLoads();
        }
        function resume() {
            if(!paused || destroyed) return;
            paused = false; window.addEventListener('message', receive); connectApi(); bindLoads();
        }
        function hide(event) { if(event.persisted) pause(); else destroy(); }
        function show(event) { if(event.persisted) resume(); }
        function destroy() {
            if(destroyed) return;
            pause(); destroyed = true;
            window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show);
            subscriptions.clear(); apiSubscriptions.clear(); loadSubscriptions.clear();
        }
        window.addEventListener('message', receive);
        window.addEventListener('pagehide', hide); window.addEventListener('pageshow', show);
        return Object.freeze({send, broadcast, forwardUpdate, subscribe, subscribeApi, watchFrameLoads,
            pause, resume, destroy, get state(){return Object.freeze({paused, destroyed});}});
    }
    if(typeof module === 'object' && module.exports) module.exports = {create};
    else if(!window.StudioFrameMessages) window.StudioFrameMessages = create(window);
})();
