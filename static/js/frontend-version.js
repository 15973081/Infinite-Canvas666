(function(){
    'use strict';

    const meta = document.querySelector('meta[name="frontend-build-id"]');
    const loadedBuildId = String(meta?.content || '').trim();
    if(!loadedBuildId || loadedBuildId === '__FRONTEND_BUILD_ID__') return;
    meta.dataset.runtimeLoaded = 'true';

    const CHECK_INTERVAL_MS = 30000;
    let latestBuildId = loadedBuildId;
    let checkRequest = null;
    let checkTimer = null;
    let updateBanner = null;
    let reloadRequest = null;

    function createUpdateBanner(){
        if(updateBanner) return updateBanner;
        const banner = document.createElement('div');
        banner.id = 'frontendUpdateBanner';
        banner.setAttribute('role', 'status');
        banner.setAttribute('aria-live', 'polite');
        banner.style.cssText = [
            'position:fixed', 'left:50%', 'bottom:112px', 'z-index:2147483647',
            'transform:translateX(-50%)', 'display:flex', 'align-items:center', 'gap:12px',
            'width:max-content', 'max-width:min(560px,calc(100vw - 32px))', 'box-sizing:border-box', 'padding:14px 16px',
            'border:1px solid var(--st-line,#d9dcd2)', 'border-radius:14px',
            'background:var(--st-panel,#faf9f5)', 'box-shadow:0 8px 28px rgba(0,0,0,.12)',
            'color:var(--st-text,#242724)', 'font:400 13px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
        ].join(';');
        banner.innerHTML = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto;color:var(--st-muted,#70756d)"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17"/></svg>'
            + '<div style="flex:1;min-width:0"><strong style="display:block;font-size:13px;font-weight:600;margin-bottom:3px">有新版本可用</strong><span style="display:block;color:var(--st-muted,#70756d);font-size:12px">保存当前内容后，刷新体验最新界面。</span></div>'
            + '<button type="button" style="flex:0 0 auto;border:1px solid var(--st-accent,#d2e5b5);border-radius:8px;padding:9px 14px;background:var(--st-accent,#d2e5b5);color:var(--st-ink,#152017);font:600 12px/1.5 system-ui;cursor:pointer">保存并刷新</button>';
        banner.querySelector('button').addEventListener('click', refreshToLatestBuild);
        document.body.appendChild(banner);
        updateBanner = banner;
        return banner;
    }

    function announceUpdate(buildId){
        if(!buildId || buildId === loadedBuildId) return;
        latestBuildId = buildId;
        createUpdateBanner();
        window.dispatchEvent(new CustomEvent('frontend:update-available', {
            detail:{loadedBuildId, latestBuildId}
        }));
    }

    function parentVersionController(){
        try {
            if(window.parent !== window && window.parent.FrontendVersion){
                return window.parent.FrontendVersion;
            }
        } catch(_error) {}
        return null;
    }

    async function checkForUpdate(){
        const parentController = parentVersionController();
        if(parentController?.checkForUpdate){
            const buildId = await parentController.checkForUpdate();
            if(buildId) latestBuildId = buildId;
            return buildId || null;
        }
        if(checkRequest) return checkRequest;
        checkRequest = (async () => {
            try {
                const response = await fetch('/api/frontend/version', {
                    cache:'no-store',
                    headers:{'Cache-Control':'no-cache'}
                });
                if(!response.ok) return null;
                const data = await response.json();
                const buildId = String(data?.build_id || '').trim();
                if(buildId && buildId !== loadedBuildId) announceUpdate(buildId);
                return buildId || null;
            } catch(_error) {
                return null;
            } finally {
                checkRequest = null;
            }
        })();
        return checkRequest;
    }

    async function runReloadGuards(){
        const pending = [];
        const visited = new Set();
        const detail = {
            loadedBuildId,
            latestBuildId,
            waitUntil(value){
                const promise=Promise.resolve(value);
                promise.catch(() => {}); // Also handled if collecting a later frame fails.
                pending.push(promise);
            }
        };
        function collect(win){
            if(!win || visited.has(win)) return;
            visited.add(win);
            win.dispatchEvent(new win.CustomEvent('frontend:before-reload', {detail}));
            for(const frame of win.document.querySelectorAll('iframe')) collect(frame.contentWindow);
        }
        let timer;
        try {
            collect(window);
            const result = Promise.allSettled(pending).then(results => results.every(result => result.status === 'fulfilled' && result.value !== false));
            return await Promise.race([result, new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('保存等待超时。页面尚未刷新，请检查画布状态并保留草稿后重试。')), 45000);
            })]);
        } finally { clearTimeout(timer); }
    }

    function refreshToLatestBuild(){
        if(reloadRequest) return reloadRequest;
        reloadRequest = performRefresh().finally(() => { reloadRequest = null; });
        return reloadRequest;
    }
    async function performRefresh(){
        const button = updateBanner?.querySelector('button');
        if(button){
            button.disabled = true;
            button.textContent = '正在保存…';
        }
        try {
            if(!await runReloadGuards()) throw new Error('保存尚未完成。页面尚未刷新，请检查画布状态并保留草稿后重试。');
            const url = new URL(window.location.href);
            url.searchParams.set('__frontend_build', latestBuildId);
            window.location.replace(url.toString());
            return true;
        } catch(error) {
            const message = updateBanner?.querySelector('span');
            if(message) message.textContent = error.message || '无法确认页面已保存，请保留草稿后重试。';
            return false;
        } finally {
            if(button){
                button.disabled = false;
                button.textContent = '保存并刷新';
            }
        }
    }

    function versionedUrl(value, buildId=latestBuildId){
        const url = new URL(value, window.location.href);
        url.searchParams.delete('v');
        if(url.pathname.startsWith('/static/') && !url.pathname.endsWith('.html')){
            // The server resolves lazy assets to their own content-addressed URL.
            url.searchParams.delete('__frontend_build');
        } else {
            url.searchParams.set('__frontend_build', buildId || latestBuildId || loadedBuildId);
        }
        return url.toString();
    }

    function scheduleChecks(){
        clearInterval(checkTimer);
        checkTimer = window.setInterval(checkForUpdate, CHECK_INTERVAL_MS);
    }

    window.addEventListener('focus', checkForUpdate);
    window.addEventListener('pageshow', event => {
        if(event.persisted) checkForUpdate();
    });
    document.addEventListener('visibilitychange', () => {
        if(!document.hidden) checkForUpdate();
    });
    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', () => {
            checkForUpdate();
            scheduleChecks();
        }, {once:true});
    } else {
        checkForUpdate();
        scheduleChecks();
    }

    window.FrontendVersion = Object.freeze({
        loadedBuildId,
        checkForUpdate,
        refreshToLatestBuild,
        flushPages:runReloadGuards,
        versionedUrl
    });
})();
