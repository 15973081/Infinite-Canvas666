/* Smart canvas: Edit access, leases, remote synchronization and task write guards.
 * Browser classic script (not an ES module); loaded before smart-canvas.js.
 * Function declarations only: initialization is explicitly invoked by the entry.
 * Uses the entry's existing shared bindings; do not duplicate permission or document state.
 */

// Business modules share the workspace lease; missing permission UI stays read-only.
function isSmartCanvasLocked(){ return Boolean(canvas?.deleted_at)||!window.MemberCanvasEdit?.canEdit; }

function updateSmartCanvasNav(){
    const title = canvas?.title || '智能画布';
    const value = Number(canvas?.updated_at || canvas?.created_at || 0);
    const date = new Date(value && value < 10000000000 ? value * 1000 : value);
    document.getElementById('smartTitle').textContent = title;
    document.getElementById('smartCanvasTime').textContent = value && !Number.isNaN(date.getTime()) ? date.toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}) : '--';
    window.PixmaxNavigator?.documentChanged();
}

function mergeSmartImageLists(localImgs, remoteImgs){
    const out = [];
    const seen = new Set();
    (localImgs || []).forEach(img => {
        const u = img && img.url;
        if(u && seen.has(u)) return;
        if(u) seen.add(u);
        out.push(img);
    });
    (remoteImgs || []).forEach(img => {
        const u = img && img.url;
        if(!u || seen.has(u)) return;
        seen.add(u);
        out.push(img);
    });
    return out;
}

function smartNodeInFlight(node){
    return Boolean(node && (node.running || node.pending || node.queued || smartPendingTasks(node).some(task=>!task.paused)));
}

function mergeSmartNode(local, remote){
    // 本地正在生成/排队的节点完全以本地为准，只把对方可能多出来的图并进来，绝不被对方旧状态冲掉
    if(smartNodeInFlight(local)){
        return {...local, images:mergeSmartImageLists(local.images, remote.images)};
    }
    // 否则以对方（最新保存方）的布局/标题/设置为基底，但图片取并集——双方生成结果都不丢
    return {...remote, images:mergeSmartImageLists(local.images, remote.images)};
}

function mergeSmartNodeLists(localNodes, remoteNodes){
    const localById = new Map((localNodes || []).map(n => [n.id, n]));
    const remoteById = new Map((remoteNodes || []).map(n => [n.id, n]));
    const order = [];
    const seen = new Set();
    (localNodes || []).forEach(n => { if(!seen.has(n.id)){ seen.add(n.id); order.push(n.id); } });
    (remoteNodes || []).forEach(n => { if(!seen.has(n.id)){ seen.add(n.id); order.push(n.id); } });
    return order.map(id => {
        const local = localById.get(id);
        const remote = remoteById.get(id);
        if(local && !remote){
            // 服务器曾经有该节点、但这次远端快照已删除：尊重远端删除。
            // 未出现在服务器基线中的节点仍视为本地新建，保留并在后续保存时上传。
            return smartServerNodeIds.has(id) ? null : local;
        }
        if(remote && !local){
            // 本地已经删除、但远端仍带着旧节点时，保留本地删除意图；
            // 仅远端新建（不在服务器基线中）的节点才加入本地。
            return smartServerNodeIds.has(id) ? null : remote;
        }
        return mergeSmartNode(local, remote);
    }).filter(Boolean);
}

function mergeSmartConnections(localConns, remoteConns, nodeIds){
    const out = [];
    const seen = new Set();
    const localKeys = new Set((localConns || []).map(c => `${c?.from}->${c?.to}:${c?.kind || 'flow'}`));
    const remoteKeys = new Set((remoteConns || []).map(c => `${c?.from}->${c?.to}:${c?.kind || 'flow'}`));
    (localConns || []).forEach(c => {
        if(!c || !nodeIds.has(c.from) || !nodeIds.has(c.to)) return;
        const key = `${c.from}->${c.to}:${c.kind || 'flow'}`;
        if(smartServerConnectionKeys.has(key) && !remoteKeys.has(key)) return;
        if(seen.has(key)) return;
        seen.add(key);
        out.push(c);
    });
    (remoteConns || []).forEach(c => {
        if(!c || !nodeIds.has(c.from) || !nodeIds.has(c.to)) return;
        const key = `${c.from}->${c.to}:${c.kind || 'flow'}`;
        if(smartServerConnectionKeys.has(key) && !localKeys.has(key)) return;
        if(seen.has(key)) return;
        seen.add(key);
        out.push(c);
    });
    return out;
}

function applyMergedServerCanvas(serverCanvas){
    if(window.CanvasSession?.enabled) return false;
    if(!serverCanvas || !canvas) return false;
    removeRetiredSmartLoopNodes(serverCanvas);
    const remoteNodes = (Array.isArray(serverCanvas.nodes) ? serverCanvas.nodes : []).map(normalizeLegacySmartNode).filter(Boolean);
    const mergedNodes = mergeSmartNodeLists(nodes, remoteNodes);
    const nodeIds = new Set(mergedNodes.map(n => n.id));
    nodes = mergedNodes;
    canvas.connections = mergeSmartConnections(canvas.connections, serverCanvas.connections, nodeIds);
    smartServerNodeIds = new Set(remoteNodes.map(n => n.id));
    smartServerConnectionKeys = new Set((Array.isArray(serverCanvas.connections) ? serverCanvas.connections : []).map(c => `${c?.from}->${c?.to}:${c?.kind || 'flow'}`));
    canvas.updated_at = Number(serverCanvas.updated_at || canvas.updated_at || 0);
    if(canvas.title !== serverCanvas.title && serverCanvas.title){
        canvas.title = serverCanvas.title;
    }
    updateSmartCanvasNav();
    render();
    if(typeof refreshConnectionLayer === 'function') refreshConnectionLayer();
    // 远端合并后，旧撤销快照可能覆盖刚合并的服务器状态。
    undoStack.length = 0;
    smartRedoStack.length = 0;
    pendingUndoSnapshot = null;
    resumeSmartPendingTasks();
    return true;
}

async function mergeReloadCanvasNow(){
    if(window.CanvasSession?.enabled){
        if(window.MemberCanvasEdit?.canRefresh) await loadCanvas({observe:true});
        return;
    }
    if(!canvasId) return;
    if(dragState || selectionState){
        // 用户正在拖拽/框选，稍后再合并，别打断操作
        scheduleCanvasMergeReload(600);
        return;
    }
    try {
        const data = await window.CanvasApi.getCanvas(canvasId, {fallback:null});
        if(!data) return;
        if(data && data.canvas) applyMergedServerCanvas(data.canvas);
    } catch(e) {}
}

function scheduleCanvasMergeReload(delay=200){
    clearTimeout(canvasSyncTimer);
    canvasSyncTimer = setTimeout(() => { mergeReloadCanvasNow(); }, delay);
}

function handleCanvasUpdatedMessage(data={}){
    if(window.CanvasSession?.enabled) return;
    if(!data || data.type !== 'canvas_updated') return;
    if(!canvasId || data.canvas_id !== canvasId) return;
    if(data.client_id && data.client_id === smartClientId) return; // 自己发的，忽略
    if(canvasSyncInFlight) return; // 我正在保存，保存完成/409 合并会处理
    const remoteUpdatedAt = Number(data.updated_at || 0);
    if(remoteUpdatedAt && remoteUpdatedAt <= Number(canvas?.updated_at || 0)) return;
    scheduleCanvasMergeReload(200);
}

function startCanvasMetaPoll(){
    // WS / iframe 转发不可靠时的兜底：定期看服务器 updated_at 是否变新，变新就合并拉取
    if(canvasMetaPollTimer) return;
    let checking=false;
    canvasMetaPollTimer = setInterval(async () => {
        if(!canvasId || !canvas) return;
        if(document.hidden || checking || (window.CanvasSession?.enabled && window.MemberCanvasEdit?.active))return;
        if(canvasSyncInFlight || dragState || selectionState) return;
        checking=true;
        try {
            const meta = await window.CanvasApi.getCanvasMeta(canvasId, null);
            if(!meta) return;
            if(window.CanvasSession?.enabled ? Number(meta.revision)>Number(canvas.revision || 0) : Number(meta.updated_at || 0)>Number(canvas.updated_at || 0)) mergeReloadCanvasNow();
        } catch(e) {} finally {checking=false;}
    }, 30000);
}

async function connectAssetLibrarySyncSocket(){
    if(window.CanvasSession) await window.CanvasSession.ready;
    if(window.parent && window.parent !== window) return;
    const host = window.location.host;
    if(!host) return;
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const clientId = smartClientId;
    let socket;
    let retryTimer = null;
    const connect = () => {
        try {
            const address = `${protocol}://${host}/ws/stats?client_id=${clientId}`;
            socket = new WebSocket(window.CanvasSession ? window.CanvasSession.socketUrl(address) : address);
        } catch(e) {
            retryTimer = setTimeout(connect, 3000);
            return;
        }
        socket.onmessage = event => {
            try {
                const data = JSON.parse(event.data);
                if(data?.type === 'asset_library_updated') handleAssetLibraryUpdatedMessage(data);
                if(data?.type === 'canvas_updated') handleCanvasUpdatedMessage(data);
            } catch(e) {}
        };
        socket.onclose = () => {
            retryTimer = setTimeout(connect, 3000);
        };
        socket.onerror = () => {
            try { socket.close(); } catch(e) {}
        };
    };
    window.addEventListener('beforeunload', () => {
        clearTimeout(retryTimer);
        try { socket?.close(); } catch(e) {}
    });
    connect();
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

// Called once by smart-canvas.js, at its original initialization position.
function bindSmartSessionVisibility(){
    document.addEventListener('visibilitychange', () => { if(!document.hidden && canvasId) window.MemberCanvasEdit?.active?.lease.refresh().catch(() => {}); });
}
