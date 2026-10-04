/* Only the shell /ws/stats transport; CanvasSubscription retains its scoped lease protocol. */
(() => {
    'use strict';
    function parseMessage(text) {
        try {
            const data = JSON.parse(text);
            return data && !Array.isArray(data) && typeof data === 'object' && typeof data.type === 'string' ? data : null;
        } catch(_) { return null; }
    }
    function create({window, ready, address, onOpen, onMessage, onUnavailable,
        socketFactory = url => new window.WebSocket(url),
        delay = (fn, ms) => window.setTimeout(fn, ms), cancel = id => window.clearTimeout(id)}) {
        let socket = null, connecting = null, retry = null, notice = null;
        let started = false, paused = false, destroyed = false, generation = 0, attempts = 0, hasConnected = false;
        const running = () => started && !paused && !destroyed;
        const isOpen = () => socket?.readyState === 1;
        function clearTimers() { cancel(retry); cancel(notice); retry = null; notice = null; }
        function detach(value) { if(value) value.onopen = value.onmessage = value.onerror = value.onclose = null; }
        function unavailable() {
            cancel(notice);
            const origin = generation;
            const id = delay(() => {
                if(notice !== id || origin !== generation || !running()) return;
                notice = null;
                if(!isOpen()) onUnavailable();
            }, 700);
            notice = id;
        }
        function reconnect() {
            if(!running() || retry !== null) return;
            const origin = generation;
            const id = delay(() => {
                if(retry !== id || origin !== generation || !running()) return;
                retry = null; connect();
            }, Math.min(10000, 800 * Math.pow(1.7, attempts++)));
            retry = id;
        }
        function connect() {
            if(!running()) return Promise.resolve();
            if(connecting) return connecting;
            if(socket && [0, 1].includes(socket.readyState)) return Promise.resolve();
            const origin = generation;
            const job = Promise.resolve().then(ready).then(() => {
                if(!running() || origin !== generation) return;
                const url = address(); if(!url) return;
                const value = socketFactory(url); socket = value;
                const current = () => running() && generation === origin && socket === value;
                value.onopen = () => {
                    if(!current()) return;
                    const reconnected = hasConnected; hasConnected = true; attempts = 0;
                    cancel(retry); cancel(notice); retry = null; notice = null;
                    onOpen(reconnected);
                };
                value.onmessage = event => {
                    if(!current()) return;
                    const data = parseMessage(event.data); if(data) onMessage(data);
                };
                value.onerror = () => { if(current()) {try { value.close(); } catch(_) {}} };
                value.onclose = () => {
                    if(!current()) return;
                    socket = null; detach(value); unavailable(); reconnect();
                };
            }).catch(() => {
                if(running() && origin === generation) {unavailable(); reconnect();}
            }).finally(() => {if(connecting === job) connecting = null;});
            connecting = job; return job;
        }
        function start() { if(destroyed) return Promise.resolve(); started = true; return connect(); }
        function pause() {
            if(paused || destroyed) return;
            paused = true; generation++; connecting = null; clearTimers();
            const old = socket; socket = null; detach(old); try {old?.close();} catch(_) {}
        }
        function resume() { if(!paused || destroyed) return; paused = false; if(started) connect(); }
        function hide(event) { if(event.persisted) pause(); else destroy(); }
        function show(event) { if(event.persisted) resume(); }
        function destroy() {
            if(destroyed) return;
            pause(); destroyed = true; started = false;
            window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show);
        }
        window.addEventListener('pagehide', hide); window.addEventListener('pageshow', show);
        return Object.freeze({start, isOpen, pause, resume, destroy,
            get state(){return Object.freeze({paused, destroyed, connecting:Boolean(connecting), attempts, hasConnected});}});
    }
    if(typeof module === 'object' && module.exports) module.exports = {create, parseMessage};
    else window.StudioStatsConnection = Object.freeze({create});
})();
