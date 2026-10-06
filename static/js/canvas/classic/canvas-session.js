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
        if(currentCanvasTitle) currentCanvasTitle.textContent = canvas.title || '未命名画布';
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
        const data = await window.CanvasApi.getCanvas(id, {errorFallback:'打开画布失败'});
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

// Business modules share the workspace lease; missing permission UI stays read-only.
function isCanvasLockedByOther(){
    return !window.MemberCanvasEdit?.canEdit;
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
            window.MemberCanvasEdit?.active?.lease.refresh().catch(() => {});
        }
    });
}
