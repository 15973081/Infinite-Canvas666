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

    function createUpdateBanner(){
        if(updateBanner) return updateBanner;
        const banner = document.createElement('div');
        banner.id = 'frontendUpdateBanner';
        banner.setAttribute('role', 'alert');
        banner.style.cssText = [
            'position:fixed', 'left:50%', 'bottom:24px', 'z-index:2147483647',
            'transform:translateX(-50%)', 'display:flex', 'align-items:center', 'gap:12px',
            'max-width:min(560px,calc(100vw - 32px))', 'padding:12px 14px',
            'border:1px solid rgba(255,255,255,.22)', 'border-radius:12px',
            'background:rgba(15,23,42,.96)', 'box-shadow:0 18px 54px rgba(15,23,42,.34)',
            'color:#fff', 'font:600 13px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
        ].join(';');
        banner.innerHTML = '<span style="flex:1;min-width:0">检测到前端已更新。请刷新以避免继续使用旧界面。</span>'
            + '<button type="button" style="flex:0 0 auto;border:0;border-radius:8px;padding:8px 12px;background:#fff;color:#0f172a;font:800 12px system-ui;cursor:pointer">保存并刷新</button>';
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
        const detail = {
            loadedBuildId,
            latestBuildId,
            waitUntil(value){ pending.push(Promise.resolve(value)); }
        };
        window.dispatchEvent(new CustomEvent('frontend:before-reload', {detail}));
        if(!pending.length) return true;
        const results = await Promise.allSettled(pending);
        return results.every(result => result.status === 'fulfilled' && result.value !== false);
    }

    async function refreshToLatestBuild(){
        const button = updateBanner?.querySelector('button');
        if(button){
            button.disabled = true;
            button.textContent = '正在保存…';
        }
        const canReload = await runReloadGuards();
        if(!canReload){
            if(button){
                button.disabled = false;
                button.textContent = '保存失败，重试';
            }
            return;
        }
        const url = new URL(window.location.href);
        url.searchParams.set('__frontend_build', latestBuildId);
        window.location.replace(url.toString());
    }

    function versionedUrl(value, buildId=latestBuildId){
        const url = new URL(value, window.location.href);
        url.searchParams.delete('v');
        url.searchParams.set('__frontend_build', buildId || latestBuildId || loadedBuildId);
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
        versionedUrl
    });
})();
