/* Loaded synchronously before workbench scripts in member mode. */
(() => {
    'use strict';
    const nativeFetch = window.fetch.bind(window);
    const domReady = document.readyState === 'loading'
        ? new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, {once:true})) : Promise.resolve();
    document.documentElement.classList.add('member-session-pending');
    let context = null, blocked = false, panel = null, bar = null, maintenanceBanner = null, maintenanceTime = 0, maintenance = null;
    let workspaceRefresh = null, sessionRefresh = null;
    let storageSnapshot = null, storageUpdated = 0;
    let releaseBar = () => {};
    const accountPaths = new Set(['/api/account/billing','/api/management-entry', '/api/auth/status', '/api/auth/login', '/api/auth/activate', '/api/auth/workspaces', '/api/auth/logout', '/api/auth/profile', '/api/frontend/version']);
    accountPaths.add('/api/account/data'); accountPaths.add('/api/account/data/export');
    accountPaths.add('/api/account/data/close');
    accountPaths.add('/api/account/credits');
    accountPaths.add('/api/account/tasks');
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
        await observeResponse(response);
        const data = await response.json();
        if (!response.ok) throw new Error(errorText(data));
        if (path === '/api/auth/logout') {
            try { localStorage.setItem('canvas:member-session-change', Date.now() + ':' + Math.random()); } catch (_) {}
        }
        return data;
    }
    async function observeResponse(response) {
        if (!context) return;
        if (response.status === 401) await pause('登录已失效，已暂停后续请求。');
        if ([403,409].includes(response.status)) {
            try {
                const data = await response.clone().json();
                if (['member_identity_changed','workspace_forbidden','workspace_unavailable'].includes(data?.detail?.code)) await pause(errorText(data));
            } catch (_) {}
        }
    }
    function refreshWorkspaces() {
        if (workspaceRefresh) return workspaceRefresh;
        workspaceRefresh = (async () => {
            const data = await json('/api/auth/workspaces', {headers:{'X-Member-ID':context.member.id}});
            if (!Array.isArray(data.workspaces)) throw new Error('空间列表响应不完整，请重试。');
            const current = data.workspaces.find(space => space.id === context.workspace.id);
            if (!current) await pause('你已失去这个空间的访问权限，已暂停当前工作台。');
            else {
                if (!Array.isArray(current.permissions)) throw new Error('空间权限响应不完整，请重试。');
                const permissions = values => JSON.stringify([...new Set(values)].sort());
                if (permissions(current.permissions) !== permissions(context.workspace.permissions))
                    await pause('空间权限已改变，请先保留草稿，再重新打开工作台以使用最新权限。');
            }
            return data;
        })().finally(() => { workspaceRefresh = null; });
        return workspaceRefresh;
    }
    async function showPanel(title, description) {
        await domReady;
        panel?.remove();
        panel = element('section', undefined, 'member-session-panel'); panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', title);
        const card = element('div', undefined, 'member-session-card');
        card.append(element('div', 'shadox · 成员空间', 'member-session-eyebrow'), element('h1', title), element('p', description));
        panel.append(card); document.body.append(panel);
        return card;
    }
    async function pause(message) {
        if (blocked) return;
        blocked = true;
        window.dispatchEvent(new CustomEvent('member-session:paused', {detail:{message}}));
        // Every embedded editor shares this workbench identity. Set the guard
        // before notifying relatives so propagation cannot recurse indefinitely.
        try { if (window.parent !== window) void window.parent.CanvasSession?.pause(message).catch(() => {}); } catch (_) {}
        for (const frame of document.querySelectorAll('iframe')) {
            try { void frame.contentWindow.CanvasSession?.pause(message).catch(() => {}); } catch (_) {}
        }
        await domReady;
        const banner = element('section', undefined, 'member-session-banner'); banner.setAttribute('role', 'alert');
        const login = element('a', '重新登录'); login.href = '/login'; login.target = '_blank'; login.rel = 'noopener';
        const feedback=element('p');feedback.setAttribute('role','status');
        banner.append(element('span', message + ' 当前页面内容尚未被清除。'), login,
            button('重新检查登录', async () => {
                try {
                    const status = await json('/api/auth/status');
                    if (!status.authenticated || status.member?.id !== context?.member.id) throw new Error('请先以原账号登录；切换账号须重新打开工作台。');
                    const spaces = await json('/api/auth/workspaces', {headers:{'X-Member-ID':context.member.id}});
                    if (!spaces.workspaces?.some(space => space.id === context.workspace.id)) throw new Error('当前空间仍不可用，请先保留草稿，再返回工作台选择可用空间。');
                    feedback.textContent='';
                    const recovery=element('a','在新标签页恢复草稿');
                    recovery.href=scopedUrl(location.href);recovery.target='_blank';recovery.rel='noopener';
                    banner.replaceChildren(element('span', '身份已确认。可在新标签页打开同一空间，在画布的“自动草稿”中另存副本；本页内容继续保留。'), recovery, button('重新打开', async () => {
                        if (!await flushPages()) {feedback.textContent='当前更改尚未保存，请先在自动草稿中保留或另存副本，再重新打开。';return;}
                        location.reload();
                    }),feedback);
                } catch (error) { feedback.textContent=error.message; }
            }),feedback);
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
        try { sessionStorage.removeItem('canvas:workspace:' + context.member.id); } catch (_) {}
        location.assign('/login');
    }
    async function choose(member, spaces, initial=false) {
        const card = await showPanel(initial ? '选择工作空间' : '切换工作空间', `${member.display_name}，请选择管理员分配给你的空间。`);
        if(initial) panel.classList.add('member-space-onboarding');
        const message = element('p', '', 'member-session-error'); message.setAttribute('role', 'alert');
        const choices=element('div',undefined,'member-initial-spaces');
        const actions=element('div',undefined,'member-initial-actions');
        card.append(message,choices,actions);
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
                            const target = new URL('/workspaces/'+encodeURIComponent(space.id),location.origin);
                            // A canvas identifier from the old space must not follow the switch.
                            target.searchParams.delete('id'); target.searchParams.delete('canvas_id');
                            location.assign(target.pathname + target.search);
                        }
                    } catch (error) { message.textContent = error.message; item.disabled = false; }
                });
                item.className = 'member-space-choice';
                item.append(element('small', space.description || '你的创作工作空间'));
                item.append(element('span',space.permissions.includes('canvas.edit') ? '可编辑' : '仅查看','member-space-permission'));
                choices.append(item);
            }
            actions.append(button('刷新空间列表', () => location.reload()));
            if (!initial) card.append(button('取消', () => { panel.remove(); panel = null; resolve(null); }));
            actions.append(button('退出登录', async () => {
                try { if (initial) { await json('/api/auth/logout', {method:'POST', headers:{'X-Member-ID':member.id}}); location.assign('/login'); } else await logout(); }
                catch (error) { message.textContent = error.message; }
            }));
        });
    }
    window.addEventListener('pageshow',()=>{
        document.querySelectorAll('.member-space-transition').forEach(node=>node.remove());
    });
    function createWorkspaceStorage() {
        const brief=element('span','素材 …','member-space-usage-brief');
        const card=element('section',undefined,'member-space-storage');
        card.setAttribute('aria-label','当前工作空间素材占用');
        const heading=element('div',undefined,'member-storage-heading');
        const refresh=button('刷新用量',()=>load(true));
        heading.append(element('span','当前空间 · 素材占用'),refresh);
        const total=element('strong','正在统计…','member-storage-total');
        const status=element('p','','member-storage-status');status.setAttribute('role','status');
        const composition=element('div',undefined,'member-storage-composition');composition.setAttribute('aria-hidden','true');
        const list=element('dl',undefined,'member-storage-breakdown');
        const note=element('p','按画布已登记素材统计，含派生预览和待清理文件；AI 对话附件单独管理，不计入此用量。不含外链、数据库、备份及临时缓存。','member-storage-note');
        card.append(heading,total,status,composition,list,note);
        const bytes=value=>{
            if(value===0)return '0 B';
            const units=['B','KB','MB','GB','TB'],index=Math.min(4,Math.floor(Math.log(value)/Math.log(1024)));
            return new Intl.NumberFormat('zh-CN',{maximumFractionDigits:index ? 1 : 0}).format(value/1024**index)+' '+units[index];
        };
        function render(data){
            brief.textContent='素材 '+bytes(data.bytes);brief.title='当前空间已登记素材占用，展开查看明细';
            total.textContent=bytes(data.bytes);
            list.replaceChildren();composition.replaceChildren();
            for(const [kind,label] of [['image','图片'],['video','视频'],['audio','音频'],['workflow','工作流'],['file','其他文件']]){
                const entry=data.by_kind[kind] || {bytes:0,files:0};
                const row=element('div');row.dataset.kind=kind;
                row.append(element('dt',label),element('dd',bytes(entry.bytes)+' · '+entry.files+' 个'));list.append(row);
                if(entry.bytes>0&&data.bytes>0){const part=element('span');part.dataset.kind=kind;part.style.flexGrow=entry.bytes/data.bytes;composition.append(part);}
            }
            composition.hidden=data.bytes===0;
            if(data.online_works){
                for(const [kind,label] of [['inbox','在线未整理'],['saved','在线已保留'],['trash','在线回收站']]){
                    const row=element('div');
                    row.append(element('dt',label),element('dd',bytes(data.online_works.bytes?.[kind] || 0)+' · 原件分类'));list.append(row);
                }
            }
            const details=[data.files+' 个文件','未设配额'];
            if(data.retained_bytes)details.push('待清理 '+bytes(data.retained_bytes));
            if(data.pending_files)details.push(data.pending_files+' 个上传尚未计入');
            if(data.unknown_files)details.push(data.unknown_files+' 个文件大小待确认');
            status.textContent=details.join(' · ');
            total.title='统计时间：'+new Date(data.updated_at).toLocaleString('zh-CN');
        }
        let pending=null;
        async function load(force=false){
            if(blocked)return;
            if(pending)return pending;
            if(!force&&storageSnapshot&&Date.now()-storageUpdated<60000){render(storageSnapshot);return;}
            refresh.disabled=true;card.setAttribute('aria-busy','true');
            pending=(async()=>{
                try{
                    const response=await window.fetch('/api/workspace/storage',{cache:'no-store',signal:AbortSignal.timeout(15000)});
                    const data=await response.json();
                    if(!response.ok)throw new Error(errorText(data));
                    if(data.workspace_id!==context.workspace.id||!Number.isSafeInteger(data.bytes)||data.bytes<0||!data.by_kind)throw new Error('统计响应不完整，请重试。');
                    storageSnapshot=data;storageUpdated=Date.now();render(data);
                }catch(error){
                    if(storageSnapshot){render(storageSnapshot);status.textContent+=' · 更新失败，显示上次统计';}
                    else {brief.textContent='素材 —';total.textContent='暂时无法统计';status.textContent='用量加载失败，请点击刷新用量重试。';}
                }finally{refresh.disabled=false;card.setAttribute('aria-busy','false');pending=null;}
            })();
            return pending;
        }
        return {brief,card,load};
    }
    function createSpaceMenu() {
        const menu=element('details',undefined,'member-session-spaces');
        const summary=element('summary',undefined,'member-session-space');
        summary.title='切换工作空间'; summary.setAttribute('aria-label','切换工作空间');
        summary.append(element('span',context.workspace.name));
        const storage=createWorkspaceStorage();summary.append(storage.brief);
        const dropdown=element('div',undefined,'member-space-menu');
        const heading=element('strong','工作空间'), list=element('div',undefined,'member-space-list');
        const message=element('p','', 'member-space-message'); message.setAttribute('role','status');
        let loading=false, switching=false;
        const close=() => {menu.open=false;};
        const refresh=button('刷新空间列表',async () => load());
        async function load(){
            if(loading || switching) return;
            loading=true; refresh.disabled=true; message.textContent='正在加载…';
            try {
                const data = await refreshWorkspaces();
                list.replaceChildren();
                for(const workspace of data.workspaces){
                    const current=workspace.id===context.workspace.id;
                    const item=button('',async () => {
                        if(switching) return;
                        if(current){close();summary.focus();return;}
                        switching=true; refresh.disabled=true;
                        for(const choice of list.querySelectorAll('button')) choice.disabled=true;
                        message.textContent='正在保存，准备切换到 '+workspace.name+'…';
                        let veil=null;
                        try {
                            if(!await flushPages()) throw new Error('当前画布保存尚未完成，请处理后再切换空间。');
                            const target=new URL('/workspaces/'+encodeURIComponent(workspace.id),location.origin);
                            target.searchParams.delete('id');target.searchParams.delete('canvas_id');
                            try {sessionStorage.setItem('canvas:workspace:'+context.member.id,workspace.id);} catch(_) {}
                            veil=element('div','正在切换到 '+workspace.name+'…','member-space-transition');
                            veil.setAttribute('role','status');document.body.append(veil);
                            // Paint the handoff before navigation without adding a fixed delay.
                            if(window.requestAnimationFrame) await new Promise(resolve=>window.requestAnimationFrame(()=>window.requestAnimationFrame(resolve)));
                            location.assign(target.pathname+target.search);
                        } catch(error){
                            veil?.remove();
                            message.textContent=error.message; switching=false;refresh.disabled=false;
                            for(const choice of list.querySelectorAll('button')) choice.disabled=false;
                        }
                    });
                    item.className='member-space-option';
                    item.setAttribute('aria-current',current ? 'true' : 'false');
                    const copy=element('span',undefined,'member-space-copy');
                    copy.append(element('span',workspace.name));
                    const description=workspace.description || (workspace.permissions.includes('canvas.edit') ? '可编辑' : '查看空间');
                    const detail=element('small',description);detail.title=description;copy.append(detail);
                    item.append(copy);
                    if(current) item.append(element('span','✓','member-space-check'));
                    list.append(item);
                }
                message.textContent=data.workspaces.length ? '' : '暂未分配空间，请联系管理员。';
            } catch(error){message.textContent=error.message;}
            finally {loading=false;refresh.disabled=false;}
        }
        const outside=event => {if(!menu.contains(event.target)) close();};
        const escape=event => {if(event.key==='Escape' && menu.open){event.preventDefault();event.stopPropagation();close();summary.focus();}};
        // Keyboard dismissal must work before the deferred toggle event fires.
        menu.addEventListener('keydown',escape);
        menu.addEventListener('toggle',() => {
            if(menu.open){
                const account=bar?.querySelector('.member-session-account');
                if(!account?.contains(menu))account?.removeAttribute('open');
                void load();document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape,true);window.addEventListener('blur',close);
                void storage.load();
            } else {
                document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape,true);window.removeEventListener('blur',close);
            }
        });
        dropdown.append(storage.card,heading,list,message,refresh);menu.append(summary,dropdown);
        void storage.load();return menu;
    }
    function renderBar() {
        releaseBar();
        bar?.remove();
        if (window.parent !== window && window.parent.CanvasSession?.enabled) return;
        const canvasTopbar=document.querySelector?.('body.studio-smart-canvas .pixmax-topbar');
        bar = element('nav', undefined, 'member-session-bar'); bar.setAttribute('aria-label', '成员与空间');
        document.documentElement.classList.add('member-workspace-shell');
        if(canvasTopbar){
            document.documentElement.classList.add('member-canvas-shell');
            bar.classList.add('member-session-canvas-controls');
        } else document.documentElement.classList.remove('member-canvas-shell');
        const brand=element('span','shadox','member-session-brand');
        const space=createSpaceMenu();
        const account=element('details',undefined,'member-session-account');
        const summary=element('summary'); summary.setAttribute('aria-label','账号：'+context.member.display_name);
        summary.title=context.member.display_name+' · '+context.workspace.name;
        const avatar=element('span',Array.from(context.member.display_name || '成员')[0],'member-session-avatar');
        avatar.setAttribute('data-color',context.member.avatar||'');
        summary.append(avatar,element('span',context.member.display_name));
        const menu=element('div',undefined,'member-session-account-menu');
        menu.append(element('small','当前账号'),element('strong',context.member.display_name));
        if(canvasTopbar)menu.append(space);
        const openAccount = async tab => {
            account.open=false;
            try {await import('/static/js/account-panel.js');await window.CanvasAccountPanel.show(tab);}
            catch(error){window.alert(error.message);}
        };
        const balance = button('积分余额 · 查看明细',()=>openAccount('credits'));
        balance.className='member-account-balance';
        menu.append(balance,button('账户管理',()=>openAccount('profile')),
            button('偏好管理',async()=>{account.open=false;try{await import('/static/js/canvas-preferences.js');window.CanvasPreferences.show();}catch(error){window.alert(error.message);}}),
            button('个人数据',async()=>{account.open=false;try{await import('/static/js/account-data.js');await window.CanvasAccountData.show();}catch(error){window.alert(error.message);}}),
            button('退出登录',async()=>{account.open=false;try{await logout();}catch(error){window.alert(error.message);}}));
        account.addEventListener('toggle',async()=>{
            if(!account.open)return;
            const bound=context.member.id;
            try{const data=await json('/api/account/credits?page_size=1');
                if(!blocked&&context.member.id===bound&&balance.isConnected)balance.textContent='积分余额 '+BigInt(data.wallet.total_balance).toLocaleString('zh-CN')+' · 查看明细';
            }catch(_){if(balance.isConnected)balance.textContent='积分暂不可用 · 查看明细';}
        });
        account.append(summary,menu);
        if(canvasTopbar){
            bar.append(account);canvasTopbar.append(bar);
            const close=()=>{account.open=false;space.open=false;};
            const outside=event=>{if(!account.contains(event.target))close();};
            const escape=event=>{if(event.key==='Escape'&&account.open){event.preventDefault();event.stopPropagation();close();summary.focus();}};
            account.addEventListener('keydown',escape);
            account.addEventListener('toggle',()=>{if(!account.open)space.open=false;});
            document.addEventListener('pointerdown',outside,true);
            releaseBar=()=>{close();document.removeEventListener('pointerdown',outside,true);};
        } else {
            bar.append(brand,space,account);document.body.append(bar);releaseBar=()=>{};
        }
    }
    async function initialize() {
        try {
            let inherited = null;
            const parentSession = window.parent !== window && window.parent.CanvasSession?.enabled ? window.parent.CanvasSession : null;
            const checkActive = () => { if (blocked || parentSession?.paused) throw new Error('工作台会话已暂停，请先保留内容并重新打开工作台。'); };
            if (parentSession) inherited = await parentSession.ready;
            checkActive();
            const status = await json('/api/auth/status');
            if (!status.authenticated) { location.replace('/login?next=' + encodeURIComponent(location.pathname + location.search)); throw new Error('请登录成员账号。'); }
            if (status.mode !== 'members') throw new Error('服务模式已改变，请重新打开工作台。');
            if (inherited && inherited.member.id !== status.member.id) throw new Error('登录账号已改变，请重新打开工作台。');
            const spaces = (await json('/api/auth/workspaces', {headers:{'X-Member-ID':status.member.id}})).workspaces;
            const routeWorkspace=location.pathname.match(/^\/workspaces\/([\w-]+)(?:\/|$)/)?.[1];
            const queryWorkspace=new URL(location.href).searchParams.get('workspace');
            if(routeWorkspace && queryWorkspace && routeWorkspace!==queryWorkspace)throw new Error('链接中的空间信息不一致。');
            const requested = routeWorkspace || queryWorkspace;
            if (inherited && requested && requested !== inherited.workspace.id) throw new Error('嵌入页面的空间与工作台不一致。');
            let saved = '';
            try { saved = sessionStorage.getItem('canvas:workspace:' + status.member.id) || ''; } catch (_) {}
            const selected = inherited?.workspace.id || requested || saved;
            let workspace = spaces.find(space => space.id === selected);
            if (requested && !workspace) throw new Error('你未被分配到链接指定的空间。请返回工作台选择可用空间。');
            if (!workspace) workspace = spaces.length === 1 ? spaces[0] : await choose(status.member, spaces, true);
            context = Object.freeze({member:Object.freeze(status.member), workspace:Object.freeze({...workspace,permissions:Object.freeze([...workspace.permissions])})});
            await domReady;
            checkActive();
            document.documentElement.classList.remove('member-session-pending');
            document.documentElement.classList.add('member-session-enter'); renderBar();
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
        async updateProfile(value) {
            const bound = context?.member.id;
            if (!bound || blocked) throw new Error('请重新登录后修改资料。');
            const data = await json('/api/auth/profile', {method:'PATCH', headers:{'Content-Type':'application/json','X-Member-ID':bound},body:JSON.stringify(value)});
            if (blocked || context?.member.id !== bound) throw new Error('登录状态已变化，请重新打开账户管理。');
            context = Object.freeze({...context,member:Object.freeze(data.member)});
            renderBar();window.dispatchEvent(new CustomEvent('member-session:profile',{detail:context.member}));return data.member;
        },
        flushPages, pause, errorText};
    window.CanvasSession = session;
    session.ready = initialize(); session.ready.catch(() => {});
    window.fetch = async (input, init={}) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        if (url.origin !== location.origin || !(url.pathname.startsWith('/api/') || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/output/'))) return nativeFetch(input, init);
        if (accountPaths.has(url.pathname)) {
            const response=await nativeFetch(input,init);
            await observeResponse(response);
            return response;
        }
        const bound = await session.ready;
        if (blocked) throw new Error('页面会话已暂停，请先保留内容并重新确认身份。');
        const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
        const selected = headers.get('X-Workspace-ID') || url.searchParams.get('workspace');
        if (selected && selected !== bound.workspace.id) throw new Error('请求空间与当前页面不一致。');
        const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
        const mediaRead = ['GET','HEAD'].includes(method) && /^\/(?:assets\/|output\/|api\/media-preview$|api\/media\/ast_[a-f0-9]{32}\/(?:content|signed)$)/.test(url.pathname);
        const queryWorkspaces = url.searchParams.getAll('workspace'), queryMembers = url.searchParams.getAll('member');
        if(mediaRead && (queryWorkspaces.some(value => value !== bound.workspace.id) || queryMembers.some(value => value !== bound.member.id) ||
            queryWorkspaces.length > 1 || queryMembers.length > 1 || (headers.has('X-Member-ID') && headers.get('X-Member-ID') !== bound.member.id))) {
            throw new Error('素材请求身份或空间与当前页面不一致。');
        }
        if(mediaRead && queryWorkspaces.length === 1 && queryMembers.length === 1){
            // The same-origin gateway checks the cookie against BOTH URL selectors.
            // Do not forward application headers through its TOS redirect: those
            // headers trigger a preflight that the object store does not allow.
            headers.delete('X-Workspace-ID'); headers.delete('X-Member-ID');
        } else {
            headers.set('X-Workspace-ID', bound.workspace.id); headers.set('X-Member-ID', bound.member.id);
        }
        const response = await nativeFetch(input, {...init, headers, credentials:'same-origin'});
        await observeResponse(response);
        return response;
    };
    async function recheckSession() {
        if (!context || blocked) return;
        if (sessionRefresh) return sessionRefresh;
        sessionRefresh = (async () => {
            try {
                const status = await json('/api/auth/status');
                if (!status.authenticated || status.mode !== 'members' || status.member?.id !== context.member.id) await pause('登录身份已变化，已暂停当前页面。');
                if (!blocked) await refreshWorkspaces();
            } catch (_) {} // A failed lookup neither changes the bound context nor grants access.
        })().finally(() => { sessionRefresh = null; });
        return sessionRefresh;
    }
    window.addEventListener('focus', recheckSession);
    window.addEventListener('storage', event => {
        // A new session for the same member also invalidates this page's lease.
        // Signals may stop work, but never authorize or restore an identity.
        if (event.key === 'canvas:member-session-change' && event.newValue)
            void pause('其他标签页更新了登录状态，已暂停本页。请先保留草稿并重新确认登录。');
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void recheckSession(); });
})();
