(() => {
    'use strict';
    if (window.CanvasSession?.enabled) return;
    if (location.pathname === '/login' || location.pathname === '/static/login.html') return;
    const nativeFetch = window.fetch.bind(window);
    let expired = false;
    function showExpired() {
        if (expired) return;
        expired = true;
        const banner = document.createElement('div');
        banner.setAttribute('role', 'alert');
        banner.style.cssText = 'position:fixed;z-index:2147483647;bottom:22px;left:50%;transform:translateX(-50%);padding:14px 18px;border-radius:12px;background:#283f31;color:white;box-shadow:0 8px 30px #0003;font:13px/1.6 system-ui;max-width:90vw';
        const text = document.createElement('span');
        text.textContent = '登录已过期。重新登录后可继续保存当前编辑。 ';
        const link = document.createElement('a');
        link.href = '/login?next=' + encodeURIComponent(location.pathname + location.search);
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = '重新登录 ↗';
        link.style.color = '#d9ecc4';
        banner.append(text, link);
        document.body.append(banner);
        window.addEventListener('focus', async () => {
            try {
                const status = await nativeFetch('/api/auth/status', {cache: 'no-store'}).then(r => r.json());
                if (status.authenticated) { banner.remove(); expired = false; }
            } catch (_) {}
        });
    }
    window.fetch = async (...args) => {
        const response = await nativeFetch(...args);
        const requestUrl = args[0] instanceof Request ? args[0].url : String(args[0]);
        if (response.status === 401 && new URL(requestUrl, location.href).origin === location.origin) showExpired();
        return response;
    };
    async function saveBeforeLogout() {
        const pending = [];
        for (const win of [window, ...Array.from(document.querySelectorAll('iframe'), frame => frame.contentWindow)]) {
            try {
                win.dispatchEvent(new CustomEvent('frontend:before-reload', {detail: {waitUntil: value => pending.push(Promise.resolve(value))}}));
            } catch (_) {}
        }
        const results = await Promise.allSettled(pending);
        return results.every(result => result.status === 'fulfilled' && result.value !== false);
    }
    document.addEventListener('DOMContentLoaded', () => {
        const actions = document.querySelector('.side-actions');
        if (!actions) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'side-pill';
        button.title = '保存并退出登录';
        button.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M9 4H4v16h5M14 8l4 4-4 4M8 12h10"/></svg><span class="side-pill-text">退出登录</span>';
        button.addEventListener('click', async () => {
            button.disabled = true;
            try {
                if (!await saveBeforeLogout()) throw new Error('画布保存未完成，请重试后再退出。');
                const response = await nativeFetch('/api/auth/logout', {method: 'POST'});
                if (!response.ok && response.status !== 401) throw new Error('退出失败，请检查网络后重试。');
                location.assign('/login');
            } catch (error) {
                button.disabled = false;
                window.alert(error.message);
            }
        });
        actions.append(button);
    });
})();
