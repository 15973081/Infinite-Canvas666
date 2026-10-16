(function(){
    'use strict';

    const meta = document.querySelector('meta[name="frontend-build-id"]');
    const loadedBuildId = String(meta?.content || '').trim();
    if(!loadedBuildId || loadedBuildId === '__FRONTEND_BUILD_ID__') return;
    meta.dataset.runtimeLoaded = 'true';

    const CHECK_INTERVAL_MS = 300000;
    let lastAutomaticCheck = 0;
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
            'position:fixed', 'left:50%', 'top:max(16px,env(safe-area-inset-top,0px))', 'z-index:2147483647',
            'transform:translateX(-50%)', 'display:flex', 'align-items:center', 'gap:16px',
            'width:480px', 'max-width:calc(100vw - 32px)', 'min-height:60px', 'box-sizing:border-box', 'padding:12px 24px',
            'border:1px solid #303035', 'border-radius:12px',
            'background:#141416', 'box-shadow:0 25px 50px -12px rgba(0,0,0,.25)',
            'color:#fafafa', 'font:400 12px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
        ].join(';');
        banner.innerHTML = '<style>#frontendUpdateBanner button:hover:not(:disabled){background:#252529!important}#frontendUpdateBanner button:focus-visible{outline:2px solid #aeb0bd;outline-offset:3px}#frontendUpdateBanner button:disabled{opacity:.5;cursor:wait!important}</style>'
            + '<div style="flex:1;min-width:0;overflow-wrap:anywhere"><strong style="display:block;font-size:12px;line-height:1.25;font-weight:500;margin-bottom:2px">发现新版本</strong><span style="display:block;color:#aeb0bd;font-size:12px;line-height:1.375">点击刷新页面以体验最新功能</span></div>'
            + '<button type="button" style="flex:0 0 auto;box-sizing:border-box;min-width:70px;min-height:34px;border:1px solid #303035;border-radius:8px;padding:6px 16px;background:transparent;color:#fafafa;font:400 14px/1.5 system-ui;cursor:pointer">更新</button>';
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
            // Only authorize local job disposal once every save guard succeeded.
            const notify = win => {
                win.dispatchEvent(new win.CustomEvent('frontend:will-reload'));
                for(const frame of win.document.querySelectorAll('iframe'))notify(frame.contentWindow);
            };
            notify(window);
            window.location.replace(url.toString());
            return true;
        } catch(error) {
            const message = updateBanner?.querySelector('span');
            if(message) message.textContent = error.message || '无法确认页面已保存，请保留草稿后重试。';
            return false;
        } finally {
            if(button){
                button.disabled = false;
                button.textContent = '更新';
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
        if(parentVersionController()) return;
        checkTimer = window.setInterval(automaticCheck, CHECK_INTERVAL_MS);
    }

    function automaticCheck(){
        if(document.hidden || parentVersionController() || Date.now()-lastAutomaticCheck<30000)return;
        lastAutomaticCheck=Date.now();
        return checkForUpdate();
    }

    window.addEventListener('focus', automaticCheck);
    window.addEventListener('pageshow', event => {
        if(event.persisted) automaticCheck();
    });
    document.addEventListener('visibilitychange', () => {
        if(!document.hidden) automaticCheck();
    });
    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', () => {
            automaticCheck();
            scheduleChecks();
        }, {once:true});
    } else {
        automaticCheck();
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
