/* Loaded synchronously before workbench scripts in member mode. */
(() => {
    'use strict';
    const nativeFetch = window.fetch.bind(window);
    const domReady = document.readyState === 'loading'
        ? new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, {once:true})) : Promise.resolve();
    document.documentElement.classList.add('member-session-pending');
    let context = null, blocked = false, panel = null, bar = null, maintenanceBanner = null, maintenanceTime = 0, maintenance = null;
    const accountPaths = new Set(['/api/management-entry', '/api/auth/status', '/api/auth/login', '/api/auth/activate', '/api/auth/workspaces', '/api/auth/logout', '/api/auth/profile', '/api/frontend/version']);
    const element = (tag, text, className) => {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (className) node.className = className;
        return node;
    };
    const button = (label, action) => {
        const node = element('button', label); node.type = 'button'; node.addEventListener('click', action); return node;
    };
    const errorText = data => ({
        authentication_required:'登录已失效，请重新登录。', member_identity_changed:'登录账号已改变，请先保留当前内容，再重新打开工作台。',
        workspace_forbidden:'你已失去这个空间的访问权限。', workspace_unavailable:'这个空间当前不可用。',
        permission_denied:'当前角色没有操作权限。', password_length:'密码需为 12–256 位。'
    }[data?.detail?.code] || (typeof data?.detail === 'string' ? data.detail : '请求未完成，请重试。'));
    async function json(path, init={}) {
        const response = await nativeFetch(path, {credentials:'same-origin', cache:'no-store', ...init, signal:AbortSignal.timeout(15000)});
        const data = await response.json();
        if (!response.ok) throw new Error(errorText(data));
        return data;
    }
    async function showPanel(title, description) {
        await domReady;
        panel?.remove();
        panel = element('section', undefined, 'member-session-panel'); panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', title);
        const card = element('div', undefined, 'member-session-card');
        card.append(element('div', '无限画布 · 成员空间', 'member-session-eyebrow'), element('h1', title), element('p', description));
        panel.append(card); document.body.append(panel);
        return card;
    }
    async function pause(message) {
        if (blocked) return;
        blocked = true;
        window.dispatchEvent(new CustomEvent('member-session:paused', {detail:{message}}));
        await domReady;
        const banner = element('section', undefined, 'member-session-banner'); banner.setAttribute('role', 'alert');
        const login = element('a', '重新登录'); login.href = '/login'; login.target = '_blank'; login.rel = 'noopener';
        banner.append(element('span', message + ' 当前页面内容尚未被清除。'), login,
            button('重新检查登录', async () => {
                try {
                    const status = await json('/api/auth/status');
                    if (!status.authenticated || status.member?.id !== context?.member.id) throw new Error('请先以原账号登录；切换账号须重新打开工作台。');
                    banner.replaceChildren(element('span', '身份已确认。请先保留草稿，再重新打开页面领取编辑资格。'), button('重新打开', () => location.reload()));
                } catch (error) { banner.append(element('p', error.message)); }
            }));
        document.body.append(banner);
    }
    function scopedUrl(value, workspace=context?.workspace.id) {
        const url = new URL(value, location.href);
        if (url.origin !== location.origin || !workspace) return url.href;
        if (url.searchParams.has('workspace') && url.searchParams.get('workspace') !== workspace) throw new Error('请求空间与当前页面不一致。');
        url.searchParams.set('workspace', workspace);
        return url.href;
    }
    async function flushPages() {
        if(window.FrontendVersion?.flushPages) {
            try { return await window.FrontendVersion.flushPages(); } catch (_) { return false; }
        }
        const pending = [];
        for (const win of [window, ...Array.from(document.querySelectorAll('iframe'), frame => frame.contentWindow)]) {
            try { win.dispatchEvent(new CustomEvent('frontend:before-reload', {detail:{waitUntil:value => pending.push(Promise.resolve(value))}})); }
            catch (_) { return false; }
        }
        const results = await Promise.allSettled(pending);
        return results.every(result => result.status === 'fulfilled' && result.value !== false);
    }
    async function logout() {
        if (!await flushPages()) throw new Error('画布保存尚未完成。请先保留草稿或完成保存，再退出。');
        await json('/api/auth/logout', {method:'POST', headers:{'X-Member-ID':context.member.id}});
        location.assign('/login');
    }
    async function choose(member, spaces, initial=false) {
        const card = await showPanel(initial ? '选择工作空间' : '切换工作空间', `${member.display_name}，请选择管理员分配给你的空间。`);
        const message = element('p', '', 'member-session-error'); message.setAttribute('role', 'alert');
        card.append(message);
        if (!spaces.length) card.append(element('p', '暂未分配任何空间，请联系管理员。'));
        return new Promise(resolve => {
            for (const space of spaces) {
                const item = button(space.name, async () => {
                    item.disabled = true;
                    try {
                        if (!initial && !await flushPages()) throw new Error('当前画布保存尚未完成，请处理后再切换空间。');
                        try { sessionStorage.setItem('canvas:workspace:' + member.id, space.id); } catch (_) {}
                        if (initial) { panel.remove(); panel = null; resolve(space); }
                        else {
                            const target = new URL(location.href); target.searchParams.set('workspace', space.id);
                            // A canvas identifier from the old space must not follow the switch.
                            target.searchParams.delete('id'); target.searchParams.delete('canvas_id');
                            location.assign(target.pathname + target.search);
                        }
                    } catch (error) { message.textContent = error.message; item.disabled = false; }
                });
                item.className = 'member-space-choice';
                item.append(element('small', space.description || (space.permissions.includes('canvas.edit') ? '可编辑' : '查看空间')));
                card.append(item);
            }
            card.append(button('刷新空间列表', () => location.reload()));
            if (!initial) card.append(button('取消', () => { panel.remove(); panel = null; resolve(null); }));
            card.append(button('退出登录', async () => {
                try { if (initial) { await json('/api/auth/logout', {method:'POST', headers:{'X-Member-ID':member.id}}); location.assign('/login'); } else await logout(); }
                catch (error) { message.textContent = error.message; }
            }));
        });
    }
    async function profile() {
        const card = await showPanel('成员资料', '昵称与头像会用于画布协作；账号标识保持不变。');
        const form = element('form'), nameLabel = element('label', '昵称'), name = element('input');
        name.value = context.member.display_name; name.required = true; name.maxLength = 80; nameLabel.append(name);
        const avatarLabel = element('label', '头像颜色'), avatar = element('select');
        for (const [value, text] of [['','默认'],['blue','蓝色'],['green','绿色'],['purple','紫色'],['orange','橙色'],['pink','粉色']]) {
            const option = element('option', text); option.value = value; avatar.append(option);
        }
        avatar.value = context.member.avatar; avatarLabel.append(avatar);
        const message = element('p', '', 'member-session-error'); message.setAttribute('role', 'alert');
        const submit = element('button', '保存资料'); submit.type = 'submit';
        form.append(nameLabel, avatarLabel, message, submit, button('取消', () => { panel.remove(); panel = null; })); card.append(form);
        form.addEventListener('submit', async event => {
            event.preventDefault(); submit.disabled = true;
            try {
                const data = await json('/api/auth/profile', {method:'PATCH', headers:{'Content-Type':'application/json','X-Member-ID':context.member.id}, body:JSON.stringify({display_name:name.value,avatar:avatar.value})});
                context = Object.freeze({...context, member:Object.freeze(data.member)});
                panel.remove(); panel = null; renderBar(); window.dispatchEvent(new CustomEvent('member-session:profile', {detail:context.member}));
            } catch (error) { message.textContent = error.message; submit.disabled = false; }
        });
    }
    function renderBar() {
        bar?.remove();
        if (window.parent !== window && window.parent.CanvasSession?.enabled) return;
        bar = element('nav', undefined, 'member-session-bar'); bar.setAttribute('aria-label', '成员与空间');
        bar.append(button(context.workspace.name + ' ▾', async () => {
            try { await choose(context.member, (await json('/api/auth/workspaces', {headers:{'X-Member-ID':context.member.id}})).workspaces); }
            catch (error) { await pause(error.message); }
        }), button(context.member.display_name, profile), button('退出登录', async () => {
            try { await logout(); } catch (error) { window.alert(error.message); }
        }));
        document.body.append(bar);
    }
    async function initialize() {
        try {
            let inherited = null;
            if (window.parent !== window && window.parent.CanvasSession?.enabled) inherited = await window.parent.CanvasSession.ready;
            const status = await json('/api/auth/status');
            if (!status.authenticated) { location.replace('/login?next=' + encodeURIComponent(location.pathname + location.search)); throw new Error('请登录成员账号。'); }
            if (status.mode !== 'members') throw new Error('服务模式已改变，请重新打开工作台。');
            if (inherited && inherited.member.id !== status.member.id) throw new Error('登录账号已改变，请重新打开工作台。');
            const spaces = (await json('/api/auth/workspaces', {headers:{'X-Member-ID':status.member.id}})).workspaces;
            const requested = new URL(location.href).searchParams.get('workspace');
            if (inherited && requested && requested !== inherited.workspace.id) throw new Error('嵌入页面的空间与工作台不一致。');
            let saved = '';
            try { saved = sessionStorage.getItem('canvas:workspace:' + status.member.id) || ''; } catch (_) {}
            const selected = inherited?.workspace.id || requested || saved;
            let workspace = spaces.find(space => space.id === selected);
            if (requested && !workspace) throw new Error('你未被分配到链接指定的空间。请返回工作台选择可用空间。');
            if (!workspace) workspace = await choose(status.member, spaces, true);
            context = Object.freeze({member:Object.freeze(status.member), workspace:Object.freeze(workspace)});
            await domReady;
            document.documentElement.classList.remove('member-session-pending'); renderBar();
            window.dispatchEvent(new CustomEvent('member-session:ready', {detail:context}));
            return context;
        } catch (error) {
            const card = await showPanel('暂时无法进入工作台', error.message);
            card.append(button('重试', () => location.reload()), button('返回工作台', () => location.assign('/')));
            throw error;
        }
    }
    const session = {enabled:true, get context(){return context;}, get paused(){return blocked;}, get maintenance(){return maintenance;}, url:scopedUrl,
        socketUrl(value) {
            if (!context) throw new Error('尚未选择空间。');
            const url = new URL(value, location.href);
            if (url.host !== location.host || !['ws:','wss:'].includes(url.protocol)) throw new Error('无效的实时连接地址。');
            url.searchParams.set('workspace', context.workspace.id); url.searchParams.set('member', context.member.id);
            url.searchParams.delete('client_id'); return url.href;
        },
        storageKey(key) { if (!context) throw new Error('尚未选择空间。'); return ['canvas-member',context.member.id,context.workspace.id,key].join(':'); },
        async observeStatus(snapshot) {
            if (!context || snapshot.workspace_id !== context.workspace.id || snapshot.member?.id !== context.member.id) return;
            const state = snapshot.maintenance;
            const timestamp = Date.parse(state?.server_time);
            if (!state || !Number.isFinite(timestamp) || timestamp < maintenanceTime) return;
            maintenanceTime = timestamp;
            maintenance = state;
            window.dispatchEvent(new CustomEvent('member-session:maintenance', {detail:state}));
            for(const frame of document.querySelectorAll('iframe')) {
                try { frame.contentWindow.dispatchEvent(new CustomEvent('member-session:maintenance', {detail:state})); } catch(_) {}
            }
            await domReady;
            maintenanceBanner?.remove(); maintenanceBanner = null;
            if (state.mode === 'normal') return;
            const descriptions = {scheduled:'已安排维护',draining:'正在准备维护，请保存当前编辑',read_only:'空间暂为只读',offline:'空间维护中，暂停访问',recovering:'正在检查恢复状态'};
            maintenanceBanner = element('section', undefined, 'member-session-maintenance'); maintenanceBanner.setAttribute('role','status');
            const planned = state.mode === 'scheduled' && state.planned_at ? ' · ' + new Date(state.planned_at).toLocaleString() : '';
            maintenanceBanner.append(element('strong', (descriptions[state.mode] || '维护状态已改变') + planned), element('span', state.message || '请保留未保存内容，等待管理员完成维护。'));
            document.body.append(maintenanceBanner);
        },
        flushPages, pause, errorText};
    window.CanvasSession = session;
    session.ready = initialize(); session.ready.catch(() => {});
    window.fetch = async (input, init={}) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        if (url.origin !== location.origin || !(url.pathname.startsWith('/api/') || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/output/')) || accountPaths.has(url.pathname)) return nativeFetch(input, init);
        const bound = await session.ready;
        if (blocked) throw new Error('页面会话已暂停，请先保留内容并重新确认身份。');
        const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
        const selected = headers.get('X-Workspace-ID') || url.searchParams.get('workspace');
        if (selected && selected !== bound.workspace.id) throw new Error('请求空间与当前页面不一致。');
        headers.set('X-Workspace-ID', bound.workspace.id); headers.set('X-Member-ID', bound.member.id);
        const response = await nativeFetch(input, {...init, headers, credentials:'same-origin'});
        if (response.status === 401) await pause('登录已失效，已暂停后续请求。');
        if ([403,409].includes(response.status)) {
            try {
                const data = await response.clone().json();
                if (['member_identity_changed','workspace_forbidden','workspace_unavailable'].includes(data?.detail?.code)) await pause(errorText(data));
            } catch (_) {}
        }
        return response;
    };
    window.addEventListener('focus', async () => {
        if (!context || blocked) return;
        try {
            const status = await json('/api/auth/status');
            if (!status.authenticated || status.member?.id !== context.member.id) await pause('登录身份已变化，已暂停当前页面。');
        } catch (_) {} // Network errors do not authorize a new identity.
    });
})();
