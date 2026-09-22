/* Classic canvas: Edit access, leases, remote synchronization and task write guards.
 * Browser classic script (not an ES module); loaded before canvas.js.
 * Function declarations only: initialization is explicitly invoked by the entry.
 * Uses the entry's existing shared bindings; do not duplicate permission or document state.
 */

function applyRemoteCanvasData(remote){
    if(window.CanvasSession?.enabled && !window.MemberCanvasEdit?.canRefresh) return false;
    if(!remote || !canvas || remote.id !== canvas.id) return;
    if(window.CanvasSession?.enabled && (!Number.isSafeInteger(remote.revision) || remote.revision<=Number(canvas.revision || 0))) return false;
    if(localCanvasDirty || saveTimer || savingCanvasNow || saveCanvasAgain){
        clearTimeout(remoteSyncTimer);
        remoteSyncTimer = setTimeout(syncRemoteCanvasNow, 1000);
        return;
    }
    applyingRemoteCanvas = true;
    try {
        resetCascadeRuntimeState();
        resetCanvasHistory();
        const localViewport = localViewportForCanvas(canvas.id, viewport || {x:0, y:0, scale:1});
        const localSelectedIds = new Set(selected);
        canvas = remote;
        canvas.logs = canvas.logs || [];
        nodes = canvas.nodes || [];
        connections = canvas.connections || [];
        viewport = localViewport;
        canvas.viewport = {...viewport};
        lastCanvasUpdatedAt = Number(canvas.updated_at || Date.now());
        localCanvasDirty = false;
        resetCanvasSaveSnapshot();
        resetTransientRunState(nodes);
        sanitizeConnections();
        if(!window.CanvasSession?.enabled) pruneMissingComfyWorkflows();
        refreshMissingCanvasAssets().then(() => render());
        selected = new Set([...localSelectedIds].filter(id => nodes.some(node => node.id === id)));
        renderCanvasList();
        render();
        resumeCanvasImageTasks();
        if(currentCanvasTitle) currentCanvasTitle.textContent = canvas.title || tr('canvas.untitled');
        if(currentCanvasTime) currentCanvasTime.textContent = formatCanvasTime(canvas.updated_at || canvas.created_at);
        setStatus('Synced');
    } finally {
        applyingRemoteCanvas = false;
    }
}

function resetTransientRunState(list=nodes){
    (list || []).forEach(node => {
        if(!node) return;
        if(node.running) node.running = false;
        if(node.runStatus) node.runStatus = '';
        if(node.runError) node.runError = '';
        if(node._cascadeIdx) node._cascadeIdx = '';
        if(node._cascadeFailed) node._cascadeFailed = false;
    });
}

async function syncRemoteCanvasNow(){
    if(window.CanvasSession?.enabled && !window.MemberCanvasEdit?.canRefresh) return;
    if(!canvas) return;
    const entry=window.MemberCanvasEdit?.active, epoch=entry?.lease.epoch, id=canvas.id;
    try {
        const data = await window.CanvasApi.getCanvas(id, {errorFallback:tr('canvas.openFailed')});
        if(!canvas || canvas.id!==id) return;
        if(window.CanvasSession?.enabled && (entry!==window.MemberCanvasEdit?.active || epoch!==entry?.lease.epoch || !window.MemberCanvasEdit?.canRefresh)) return;
        const remote = data.canvas;
        const newer=window.CanvasSession?.enabled ? Number(remote?.revision)>Number(canvas.revision || 0)
            : Number(remote?.updated_at || 0)>Number(lastCanvasUpdatedAt || 0);
        if(newer) applyRemoteCanvasData(remote);
    } catch(e) {
        console.error(e);
        setStatus('Sync failed');
    }
}

async function checkRemoteCanvasVersion(){
    if(!canvas || applyingRemoteCanvas || remoteSyncBusy) return;
    if(document.hidden) return;
    if(lastCanvasWsUpdatedAt && Date.now() - lastCanvasWsUpdatedAt < REMOTE_SYNC_WS_QUIET_MS) return;
    remoteSyncBusy = true;
    try {
        const meta = await window.CanvasApi.getCanvasMeta(canvas.id, null);
        if(!meta) throw new Error('meta failed');
        const remoteUpdatedAt = Number(meta.updated_at || 0);
        if(window.CanvasSession?.enabled ? Number(meta.revision)>Number(canvas?.revision || 0) : remoteUpdatedAt > Number(lastCanvasUpdatedAt || 0)){
            await syncRemoteCanvasNow();
        }
    } catch(e) {
        // 轮询失败不打扰创作；下一轮会重试。
    } finally {
        remoteSyncBusy = false;
    }
}

function startCanvasRemotePolling(){
    stopCanvasRemotePolling();
    remoteSyncInterval = setInterval(checkRemoteCanvasVersion, REMOTE_SYNC_POLL_MS);
}

function stopCanvasRemotePolling(){
    if(remoteSyncInterval){
        clearInterval(remoteSyncInterval);
        remoteSyncInterval = null;
    }
}

function handleCanvasUpdatedMessage(data){
    if(window.CanvasSession?.enabled) return;
    if(!canvas || !data || data.type !== 'canvas_updated') return;
    if(data.client_id && data.client_id === CLIENT_ID) return;
    if(data.canvas_id !== canvas.id) return;
    lastCanvasWsUpdatedAt = Date.now();
    const remoteUpdatedAt = Number(data.updated_at || 0);
    if(remoteUpdatedAt && remoteUpdatedAt <= Number(lastCanvasUpdatedAt || 0)) return;
    clearTimeout(remoteSyncTimer);
    if(localCanvasDirty || saveTimer || savingCanvasNow || saveCanvasAgain){
        remoteSyncTimer = setTimeout(syncRemoteCanvasNow, savingCanvasNow ? 1000 : 1500);
        return;
    }
    remoteSyncTimer = setTimeout(syncRemoteCanvasNow, savingCanvasNow ? 700 : 120);
    setStatus('Syncing...');
}

// ── Canvas Lock (collaborative editing) ──

function isCanvasLockedByOther(){
    if(window.CanvasSession?.enabled) return !window.MemberCanvasEdit?.canEdit;
    return canvasLockedByOther;
}

function getCanvasUserName(){
    if(window.CanvasSession?.enabled) return window.CanvasSession.context?.member.display_name || '';
    try {
        return (localStorage.getItem(CANVAS_USER_NAME_KEY) || '').trim();
    } catch(e){
        return '';
    }
}

function setCanvasUserName(name){
    const clean = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 32);
    try {
        if(clean) localStorage.setItem(CANVAS_USER_NAME_KEY, clean);
        else localStorage.removeItem(CANVAS_USER_NAME_KEY);
    } catch(e){}
    updateCanvasIdentityButton();
    return clean;
}

function canvasUserDisplayName(){
    return getCanvasUserName() || '未命名用户';
}

function canvasLockHolderName(holder){
    const username = String(holder?.username || '').trim() || '未命名用户';
    const ip = String(holder?.ip || '').trim();
    if(ip) return `${username} · ${ip}`;
    return username || holder?.client_id || '其他人';
}

function formatCanvasLockTime(ms){
    const value = Number(ms || 0);
    if(!value) return '';
    try {
        return new Date(value).toLocaleString();
    } catch(e){
        return '';
    }
}

function canvasLockHolderTitle(holder){
    if(!holder) return '';
    const lines = [
        `用户：${String(holder.username || '').trim() || '未命名用户'}`,
        `IP：${holder.ip || '未知'}`,
        `客户端：${holder.client_id || '未知'}`,
    ];
    const lockedAt = formatCanvasLockTime(holder.acquired_at);
    if(lockedAt) lines.push(`锁定时间：${lockedAt}`);
    return lines.join('\n');
}

function updateCanvasIdentityButton(){
    if(!canvasIdentityBtn || !canvasIdentityLabel) return;
    const name = canvasUserDisplayName();
    canvasIdentityLabel.textContent = name;
    canvasIdentityBtn.title = window.CanvasSession?.enabled ? `成员昵称：${name}` : `我的名称：${name}`;
    if(window.CanvasSession?.enabled) canvasIdentityBtn.setAttribute('aria-label', '成员昵称');
}

function updateCanvasLockBadge(){
    if(!canvasLockBadge || !canvasLockLabel) return;
    if(!canvas){
        canvasLockBadge.style.display = 'none';
        return;
    }
    if(canvasLockedByOther){
        canvasLockBadge.style.display = 'flex';
        canvasLockBadge.className = 'canvas-lock-badge locked-by-other';
        const name = canvasLockHolderName(canvasLockHolder);
        canvasLockLabel.textContent = `${name} 编辑中`;
        canvasLockBadge.title = `${canvasLockHolderTitle(canvasLockHolder)}\n画布正被编辑，你只能查看`;
    } else if(canvasLockHolder && canvasLockHolder.client_id === CLIENT_ID){
        canvasLockBadge.style.display = 'flex';
        canvasLockBadge.className = 'canvas-lock-badge locked-by-me';
        canvasLockLabel.textContent = '你正在编辑';
        canvasLockBadge.title = `${canvasLockHolderTitle(canvasLockHolder)}\n你持有编辑锁，其他人只能查看`;
    } else {
        canvasLockBadge.style.display = 'none';
    }
}

function showCanvasLockOverlay(msg){
    if(!canvasLockOverlay) return;
    canvasLockOverlay.style.display = 'flex';
    if(canvasLockOverlayMsg) canvasLockOverlayMsg.textContent = msg || '画布正在被其他人编辑中...';
    if(canvasLockRetryBtn) canvasLockRetryBtn.style.display = 'flex';
}

function hideCanvasLockOverlay(){
    if(!canvasLockOverlay) return;
    canvasLockOverlay.style.display = 'none';
}

function clearLocalCanvasLock(){
    canvasLockHolder = null;
    canvasLockedByOther = false;
    hideCanvasLockOverlay();
    updateCanvasLockBadge();
}

async function checkCanvasLock(){
    if(window.CanvasSession?.enabled) return window.MemberCanvasEdit?.active?.lease.refresh();
    if(!canvas) return;
    const canvasId = canvas.id;
    try {
        const data = await window.CanvasApi.checkCanvasLock(canvasId);
        if(!data) return;
        if(!canvas || canvas.id !== canvasId) return;
        canvasLockHolder = data.holder || null;
        canvasLockedByOther = !!(canvasLockHolder && canvasLockHolder.client_id !== CLIENT_ID);
        updateCanvasLockBadge();
        if(canvasLockHolder?.client_id === CLIENT_ID){
            await acquireCanvasLock();
            return;
        }
        if(canvasLockedByOther){
            const name = canvasLockHolderName(canvasLockHolder);
            showCanvasLockOverlay(`${name} 正在编辑此画布`);
        } else if(!canvasLockHolder){
            hideCanvasLockOverlay();
            if(!document.hidden) setTimeout(() => {
                if(canvas && !canvasLockHolder && !canvasLockedByOther) acquireCanvasLock();
            }, 120);
        }
    } catch(e){
        // Silently ignore — will retry on next poll
    }
}

async function acquireCanvasLock(){
    if(window.CanvasSession?.enabled) return false;
    if(!canvas) return false;
    const canvasId = canvas.id;
    try {
        const res = await window.CanvasApi.acquireCanvasLock(canvasId, {client_id: CLIENT_ID, username: getCanvasUserName()});
        if(!canvas || canvas.id !== canvasId) return false;
        if(res.ok){
            const data = await res.json();
            if(!canvas || canvas.id !== canvasId) return false;
            canvasLockHolder = data.holder || null;
            canvasLockedByOther = false;
            hideCanvasLockOverlay();
            updateCanvasLockBadge();
            return true;
        } else if(res.status === 409){
            const err = await res.json().catch(() => ({}));
            if(!canvas || canvas.id !== canvasId) return false;
            canvasLockHolder = err.detail?.holder || null;
            canvasLockedByOther = true;
            const name = canvasLockHolderName(canvasLockHolder);
            showCanvasLockOverlay(`${name} 正在编辑此画布`);
            updateCanvasLockBadge();
            return false;
        }
    } catch(e){
        console.error('acquireCanvasLock error:', e);
    }
    return false;
}

async function tryAcquireCanvasLock(){
    if(!canvas) return;
    if(canvasLockRetryBtn){
        canvasLockRetryBtn.style.display = 'none';
        const icon = canvasLockRetryBtn.querySelector('i');
        if(icon) icon.setAttribute('data-lucide', 'loader');
        if(typeof lucide !== 'undefined') lucide.createIcons();
    }
    const ok = await acquireCanvasLock();
    if(ok){
        setStatus('已获得编辑权限');
    } else {
        setStatus('画布仍在被其他人编辑中');
        if(canvasLockRetryBtn) canvasLockRetryBtn.style.display = 'flex';
        const icon = canvasLockRetryBtn?.querySelector('i');
        if(icon) icon.setAttribute('data-lucide', 'refresh-cw');
        if(typeof lucide !== 'undefined') lucide.createIcons();
    }
}

async function releaseCanvasLock(){
    if(window.CanvasSession?.enabled) return;
    if(!canvas) {
        clearLocalCanvasLock();
        return;
    }
    if(!(canvasLockHolder && canvasLockHolder.client_id === CLIENT_ID)) {
        clearLocalCanvasLock();
        return;
    }
    try {
        await window.CanvasApi.releaseCanvasLock(canvas.id, CLIENT_ID);
        clearLocalCanvasLock();
    } catch(e){
        console.error('releaseCanvasLock error:', e);
    }
}

function releaseCanvasLockOnExit(){
    if(window.CanvasSession?.enabled) return;
    if(!canvas || !(canvasLockHolder && canvasLockHolder.client_id === CLIENT_ID)) return;
    const releaseUrl = `/api/canvases/${canvas.id}/lock/release`;
    const payload = JSON.stringify({client_id: CLIENT_ID, username: getCanvasUserName()});
    let sent = false;
    try {
        if(navigator.sendBeacon){
            sent = navigator.sendBeacon(releaseUrl, new Blob([payload], {type: 'application/json'}));
        }
    } catch(e){}
    if(!sent){
        try {
            window.CanvasApi.releaseCanvasLockKeepalive(canvas.id, {client_id: CLIENT_ID, username: getCanvasUserName()});
        } catch(e){}
    }
    clearLocalCanvasLock();
}

function startCanvasLockPolling(){
    if(window.CanvasSession?.enabled) return;
    stopCanvasLockPolling();
    if(!canvas) return;
    canvasLockPollTimer = setInterval(async () => {
        if(!canvas) return;
        await checkCanvasLock();
    }, CANVAS_LOCK_POLL_MS);
}

function stopCanvasLockPolling(){
    if(canvasLockPollTimer){
        clearInterval(canvasLockPollTimer);
        canvasLockPollTimer = null;
    }
}

function handleCanvasLockedMessage(data){
    if(window.CanvasSession?.enabled) return;
    if(!canvas || !data || data.canvas_id !== canvas.id) return;
    if(data.holder?.client_id === CLIENT_ID) return; // it's us
    canvasLockHolder = data.holder || null;
    canvasLockedByOther = true;
    const name = canvasLockHolderName(canvasLockHolder);
    showCanvasLockOverlay(`${name} 正在编辑此画布`);
    updateCanvasLockBadge();
}

function handleCanvasUnlockedMessage(data){
    if(window.CanvasSession?.enabled) return;
    if(!canvas || !data || data.canvas_id !== canvas.id) return;
    if(data.released_by === CLIENT_ID) return; // we released it
    clearLocalCanvasLock();
    setStatus('画布已解锁，可以编辑了');
    setTimeout(() => {
        if(canvas && !canvasLockHolder && !canvasLockedByOther) acquireCanvasLock();
    }, 120);
}

function canvasTaskWriteGuard(...targets){
    if(window.CanvasTaskResults?.guard)return window.CanvasTaskResults.guard(targets.filter(Boolean),()=>({canvas:canvas?.id ?? canvas,nodes}));
    let paused=false;
    const valid=()=>!paused && !window.CanvasSession?.enabled;
    const pause=()=>{
        paused=true;
        const error=new Error('请刷新后继续生成，已提交任务可从生成结果列表找回。');
        error.resultPending=true;
        return error;
    };
    return {valid,pause,check(){if(!valid())throw pause();}};
}

// Called once by canvas.js, at its original initialization position.
function bindClassicSessionVisibility(){
    document.addEventListener('visibilitychange', () => {
        if(!document.hidden && canvas){
            checkCanvasLock();
        }
    });
}
