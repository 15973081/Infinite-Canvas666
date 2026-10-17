/* Classic canvas: Canvas data, edit history, persistence, backups and workflow transfer.
 * Browser classic script (not an ES module); loaded before canvas.js.
 * Function declarations only: initialization is explicitly invoked by the entry.
 * Uses the entry's existing shared bindings; do not duplicate permission or document state.
 */

function scheduleSave(){
    if(!canvas || applyingRemoteCanvas) return;
    // Loading/normalizing a read-only canvas is not a user edit. Keep any
    // existing dirty state after lease loss, but do not create a false draft.
    if(window.CanvasSession?.enabled && !window.MemberCanvasEdit?.canEdit) return;
    if(isCanvasLockedByOther()){
        setStatus('当前为查看模式，更改尚未保存');
        return;
    }
    // Debounce for five seconds with a thirty-second ceiling for continuous edits.
    if(!localCanvasDirty || scheduleSave.pendingSince==null || scheduleSave.canvasId!==canvas.id){
        scheduleSave.pendingSince=Date.now();scheduleSave.canvasId=canvas.id;
    }
    localCanvasDirty = true;
    window.MemberCanvasEdit?.markDirty();
    setStatus('Saving...');
    // Keep the idle deadline even when an earlier save is still in flight.
    scheduleSave.lastEditAt = Date.now();
    clearTimeout(saveTimer);
    if(savingCanvasNow){
        saveCanvasAgain = true;
        return;
    }
    saveTimer = setTimeout(saveCanvas, Math.min(5000,Math.max(0,30000-(Date.now()-scheduleSave.pendingSince))));
}

function serializableCanvasNode(node){
    const copy = {...(node || {})};
    delete copy._ltxEditor;
    delete copy.running;
    delete copy.runStatus;
    delete copy.runError;
    delete copy._cascadeIdx;
    delete copy._cascadeFailed;
    return copy;
}

function serializableCanvasNodes(list=nodes){
    return (list || []).map(serializableCanvasNode);
}

function canvasSavePayload(){
    return {
        title:canvas.title,
        icon:canvas.icon || '🧩',
        cover:canvas.cover || null,
        nodes:serializableCanvasNodes(),
        connections,
        logs:canvas.logs || [],
        task_result_version:canvas.task_result_version || 0,
        client_id:CLIENT_ID,
        base_updated_at:Number(lastCanvasUpdatedAt || canvas.updated_at || 0)
    };
}

function canvasSaveSnapshot(payload){
    if(!payload) return '';
    return JSON.stringify({
        title:payload.title || '',
        icon:payload.icon || '',
        cover:payload.cover || null,
        nodes:payload.nodes || [],
        connections:payload.connections || [],
        logs:payload.logs || [],
        task_result_version:payload.task_result_version || 0
    });
}

function resetCanvasSaveSnapshot(){
    if(!canvas) {
        lastSavedCanvasSnapshot = '';
        return;
    }
    lastSavedCanvasSnapshot = canvasSaveSnapshot(canvasSavePayload());
}

async function saveCanvas(){
    // 远端状态应用期间不回写；成员模式还需具备当前保存权限。
    if(!canvas || applyingRemoteCanvas) return;
    if(window.CanvasSession?.enabled ? !window.MemberCanvasEdit?.canSave : isCanvasLockedByOther()) return;
    if(savingCanvasNow){
        // 当前请求结束后再保存，避免两个请求同时写入同一版本。
        saveCanvasAgain = true;
        return;
    }

    scheduleSave.pendingSince=null;
    sanitizeConnections();
    const payload = canvasSavePayload();
    const submittedSnapshot = canvasSaveSnapshot(payload);
    if(submittedSnapshot && submittedSnapshot === lastSavedCanvasSnapshot){
        localCanvasDirty = false;
        saveCanvasAgain = false;
        setStatus('Saved');
        return;
    }
    savingCanvasNow = true;
    saveCanvasAgain = false;
    try {
        const response = await window.CanvasApi.saveCanvas(canvas.id, payload);
        if(response.status === 409){
            // 经典画布发生版本冲突时保留本地修改，停止自动重试。
            saveCanvasAgain = false;
            localCanvasDirty = true;
            clearTimeout(saveTimer);
            saveTimer = null;
            setStatus('Save conflict');
            showErrorModal('检测到其他人已更新此画布。为避免覆盖对方修改，当前更改尚未保存，请刷新画布后重试。', '保存冲突');
            return;
        }
        if(!response.ok) throw new Error('save failed');
        const data = await response.json().catch(() => ({}));
        const changedDuringSave = canvasSaveSnapshot(canvasSavePayload()) !== submittedSnapshot;
        const localViewport = {...viewport};
        // The response acknowledges the sent snapshot, not edits or logs added while awaiting it.
        if(data.canvas){
            const deliveredVersion = canvas.task_result_version || 0;
            canvas = changedDuringSave
                ? {...data.canvas, ...canvas, updated_at:data.canvas.updated_at, viewport:localViewport}
                : {...canvas, ...data.canvas, viewport:localViewport};
            // Only the delivery merger may acknowledge results in the live nodes.
            canvas.task_result_version = deliveredVersion;
        }
        viewport = localViewport;
        canvas.updated_at = Number(canvas.updated_at || Date.now());
        lastCanvasUpdatedAt = canvas.updated_at;
        saveCanvasAgain = saveCanvasAgain || changedDuringSave;
        localCanvasDirty = Boolean(saveCanvasAgain);
        lastSavedCanvasSnapshot = submittedSnapshot;
        if(currentCanvasTime) currentCanvasTime.textContent = formatCanvasTime(canvas.updated_at);
        setStatus(localCanvasDirty ? 'Saving...' : 'Saved');
    } catch(e) {
        setStatus('Save failed');
        console.error(e);
    } finally {
        savingCanvasNow = false;
        // 保存期间产生的新修改仍是脏数据，另起一次延迟保存。
        if(saveCanvasAgain && canvas && !applyingRemoteCanvas){
            saveCanvasAgain = false;
            localCanvasDirty = true;
            clearTimeout(saveTimer);
            saveTimer = setTimeout(saveCanvas,Math.max(0,Math.min(5000-(Date.now()-(scheduleSave.lastEditAt??Date.now())),
                30000-(Date.now()-(scheduleSave.pendingSince??Date.now())))));
        }
    }
}

function restoreClassicMemberDraft(draft){
    if(!canvas || draft.id !== canvas.id || (draft.kind || 'classic') !== 'classic'
        || !Array.isArray(draft.nodes) || !Array.isArray(draft.connections)){
        throw new Error('经典画布草稿格式不完整，请先导出保留。');
    }
    const restoredNodes = JSON.parse(JSON.stringify(draft.nodes)).map(serializableCanvasNode);
    restoredNodes.forEach(node => {delete node._pending;});
    clearTimeout(saveTimer);
    saveTimer = null;
    resetCascadeRuntimeState();
    resetCanvasHistory();
    // Retain server identity, revision and billing logs. Restoring local graph
    // content must not replay old task state or import an old billing snapshot.
    canvas.title = draft.title || canvas.title;
    canvas.icon = draft.icon || canvas.icon;
    canvas.nodes = nodes = restoredNodes;
    canvas.connections = connections = JSON.parse(JSON.stringify(draft.connections));
    resetTransientRunState(nodes);
    sanitizeConnections();
    selected.clear();
    localCanvasDirty = true;
    render();
    window.MemberCanvasEdit.markDirty();
    setStatus('草稿已恢复，请检查后保存');
}

function canvasLocalAssetUrls(){
    const urls = new Set();
    const add = value => {
        const url = outputUrlValue(value);
        if(url && (url.startsWith('/output/') || url.startsWith('/assets/'))) urls.add(url);
    };
    nodes.forEach(node => {
        if(node.url) add(node.url);
        (node.images || []).forEach(add);
        (node.generatedOutputs || []).forEach(add);
        Object.entries(node.imageComparisons || {}).forEach(([key, value]) => {
            add(key);
            add(value);
        });
    });
    (canvas?.logs || []).forEach(log => {
        (log.outputs || []).forEach(add);
        (log.refs || []).forEach(add);
        (log.run?.refs || []).forEach(add);
    });
    return [...urls];
}

async function refreshMissingCanvasAssets(){
    missingAssetUrls.clear();
    const urls = canvasLocalAssetUrls();
    if(!urls.length) return;
    try {
        const data = await fetch('/api/canvas-assets/check', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({urls})
        }).then(r => r.json());
        const exists = data.exists || {};
        Object.entries(exists).forEach(([url, ok]) => { if(!ok) missingAssetUrls.add(url); });
    } catch(e) {
        console.warn('canvas asset check failed', e);
    }
}

async function flushClassicCanvasBeforeFrontendReload(){
    if(!canvas) return true;
    const deadline = Date.now() + 10000;
    while(localCanvasDirty || savingCanvasNow || saveCanvasAgain){
        if(Date.now() >= deadline) return false;
        clearTimeout(saveTimer); saveTimer = null;
        if(savingCanvasNow){
            await new Promise(resolve => setTimeout(resolve, 80));
            continue;
        }
        if(window.CanvasSession?.enabled ? !window.MemberCanvasEdit?.canSave : isCanvasLockedByOther()) return false;
        await saveCanvas();
        // Follow actual edits made during the write immediately, without
        // waiting for a timer that the finishing UI may cancel.
        if(localCanvasDirty && !saveTimer && !saveCanvasAgain) return false;
    }
    clearTimeout(saveTimer); saveTimer = null;
    return true;
}

function addNode(node){
    if(!ensureCanvas()) return;
    pushUndo();
    nodes.push(node);
    render();
    scheduleSave();
    return node;
}

function defaultPoint(dx=0, dy=0){ return screenToWorld(window.innerWidth / 2 + dx, window.innerHeight / 2 + dy); }

function addImageNode(point){
    const p = point || defaultPoint(-120, 0);
    return addNode({id:uid('img'), type:'image', x:p.x, y:p.y, url:'', name:'空白图片'});
}

function addPromptNode(point){
    const p = point || defaultPoint(0, 0);
    return addNode({id:uid('prompt'), type:'prompt', x:p.x, y:p.y, text:''});
}

function addLoopNode(point){
    const p = point || defaultPoint(40, 0);
    return addNode({
        id:uid('loop'),
        type:'loop',
        x:p.x,
        y:p.y,
        count:3,
        mode:'serial',
        showPrompt:false,
        imageInput:false,
        videoInput:false,
        loopStart:1,
        imageBatchSize:1,
        videoBatchSize:1,
        variablePrompt:'',
        fixedPrompt:''
    });
}

function addGroupNode(point){
    const p = point || defaultPoint(40, 0);
    return addNode({id:uid('grp'), type:'group', x:p.x, y:p.y, w:300, h:220, items:[]});
}

function addLLMNode(point){
    const p = point || defaultPoint(80, 0);
    const providerId = chatApiProviders()[0]?.id || 'comfly';
    return addNode({
        id:uid('llm'),
        type:'llm',
        x:p.x,
        y:p.y,
        llmProvider:providerId,
        model:resolveChatModel('', providerId),
        mode:'node',
        systemPrompt:'You are a helpful assistant. Rewrite the input into a concise image prompt.',
        chatInput:'',
        messages:[],
        outputText:'',
        llmInputHeight:110,
        llmOutputHeight:150,
        running:false
    });
}

function addGeneratorNode(point){
    const p = point || defaultPoint(120, 0);
    const providerId = imageApiProviders()[0]?.id || '';
    return addNode({id:uid('gen'), type:'generator', x:p.x, y:p.y, apiProvider:providerId, model:allImageModels(providerId)[0] || '', ratio:'square', resolution:'1k', customRatio:'', customSize:'', customRatioWidth:'', customRatioHeight:'', customWidth:'', customHeight:'', inputs:[]});
}

function addMsGenNode(point){
    alert("此功能已移除，历史内容保留。请新建通用 API 节点并明确选择供应商。");
    return null;
}

function addVideoNode(point){
    const p = point || defaultPoint(160, 0);
    const providerId = videoApiProviders()[0]?.id || 'comfly';
    const models = providerVideoModels(providerId);
    return addNode({
        id:uid('vid'),
        type:'video',
        x:p.x,
        y:p.y,
        apiProvider:providerId,
        model:models[0] || videoModels[0] || DEFAULT_VIDEO_MODELS[0],
        duration:5,
        aspectRatio:'16:9',
        resolution:'',
        enhancePrompt:false,
        enableUpsample:false,
        watermark:false,
        cameraFixed:false,
        generateAudio:false,
        taskMode:'auto',
        useFrameRoles:false,
        multimodal:false,
        tempShLinks:[],
        inputs:[],
        running:false
    });
}

function defaultLTXSegment(start=0, length=120){
    return {
        id:uid('ltxseg'),
        type:'text',
        prompt:'',
        start,
        length,
        color:LTX_SEGMENT_COLORS[0],
        strength:1,
        imageRef:null
    };
}

function addLTXDirectorNode(point){
    alert("此功能已移除，历史内容保留。请新建通用 API 节点并明确选择供应商。");
    return null;
}

function addComfyNode(point){
    alert("此功能已移除，历史内容保留。请新建通用 API 节点并明确选择供应商。");
    return null;
}

function addOutputNode(point){
    const p = point || defaultPoint(260, 0);
    return addNode({id:uid('out'), type:'output', x:p.x, y:p.y, images:[]});
}

function createInputGroupFromOutput(node, point){
    const urls = outputImageUrls(node);
    if(!node || !urls.length) return null;
    const cols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(urls.length))));
    const cardW = 260;
    const cardH = 336;
    const gap = 24;
    const base = point || {x:Number(node.x || 0), y:Number(node.y || 0)};
    const imageNodes = urls.map((url, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const img = {
            id:uid('img'),
            type:'image',
            x:base.x + 24 + col * (cardW + gap),
            y:base.y + 58 + row * (cardH + gap),
            w:cardW,
            h:cardH,
            url,
            name:outputImageName(url)
        };
        nodes.push(img);
        return img;
    });
    const rows = Math.ceil(urls.length / cols);
    const group = {
        id:uid('grp'),
        type:'group',
        x:base.x,
        y:base.y,
        w:cols * cardW + (cols - 1) * gap + 48,
        h:rows * cardH + (rows - 1) * gap + 90,
        items:imageNodes.map(img => img.id)
    };
    nodes.push(group);
    return group;
}

function convertOutputNodeToInputGroup(nodeId){
    const node = nodes.find(n => n.id === nodeId);
    if(!node || node.type !== 'output') return;
    if(!outputImageUrls(node).length) return;
    pushUndo();
    const downstream = connections.filter(c => c.from === nodeId).map(c => c.to);
    const group = createInputGroupFromOutput(node, {x:Number(node.x || 0), y:Number(node.y || 0)});
    if(!group) return;
    nodes = nodes.filter(n => n.id !== nodeId);
    connections = connections.filter(c => c.from !== nodeId && c.to !== nodeId);
    downstream.forEach(toId => {
        if(canConnect(group.id, toId) && !connections.some(c => c.from === group.id && c.to === toId)){
            connections.push({id:uid('c'), from:group.id, to:toId});
        }
    });
    selected.clear();
    selected.add(group.id);
    syncGeneratorInputs();
    refreshGeneratorInputViews();
    render();
    scheduleSave();
}

function copyOutputNodeToInputGroup(nodeId){
    const node = nodes.find(n => n.id === nodeId);
    if(!node || node.type !== 'output') return;
    if(!outputImageUrls(node).length) return;
    pushUndo();
    const group = createInputGroupFromOutput(node, {x:Number(node.x || 0) + 36, y:Number(node.y || 0) + 36});
    if(!group) return;
    selected.clear();
    selected.add(group.id);
    syncGeneratorInputs();
    refreshGeneratorInputViews();
    render();
    scheduleSave();
}

function createLinkedNode(type){
    const state = linkCreateState;
    closeLinkCreateMenu();
    if(!state) return;
    const origin = nodes.find(n => n.id === state.originId);
    if(!origin) return;
    const created = createNodeByType(type, state.point);
    if(!created) return;
    const fromId = state.originKind === 'out' ? origin.id : created.id;
    const toId = state.originKind === 'out' ? created.id : origin.id;
    if(canConnect(fromId, toId) && !connections.some(c => c.from === fromId && c.to === toId)){
        connections.push({id:uid('c'), from:fromId, to:toId});
        syncLatestGeneratedOutputToConnection(fromId, toId);
        syncGeneratorInputs();
        scheduleSave();
        render();
    }
}

function createNodeByType(type, point){
    if(type === 'image') return addImageNode(point);
    if(type === 'prompt') return addPromptNode(point);
    if(type === 'loop') return addLoopNode(point);
    if(type === 'group') return addGroupNode(point);
    if(type === 'llm') return addLLMNode(point);
    if(type === 'generator') return addGeneratorNode(point);
    if(type === 'msgen') return addMsGenNode(point);
    if(type === 'video') return addVideoNode(point);
    if(type === 'comfy') return addComfyNode(point);
    if(type === 'ltxDirector') return addLTXDirectorNode(point);
    if(type === 'output') return addOutputNode(point);
    return null;
}

function reorderInput(gen, movedId, targetId){
    if(!movedId || movedId === targetId) return;
    const sources = generatorSources(gen);
    const imageIds = sources.filter(s => s.refs?.length).map(s => s.id);
    if(!imageIds.includes(movedId) || !imageIds.includes(targetId)) return;
    const promptIds = (gen.inputs || []).filter(id => !imageIds.includes(id));
    const ids = (gen.inputs || []).filter(id => imageIds.includes(id));
    const from = ids.indexOf(movedId), to = ids.indexOf(targetId);
    if(from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    gen.inputs = [...ids, ...promptIds];
    refreshGeneratorInputViews([gen.id]);
    refreshGeometryAfterLayout();
    scheduleSave();
}

function canvasInputGraph(){
    const graph = {nodeById:new Map(), incoming:new Map(), outgoing:new Map(), parents:new Map()};
    const add = (map, key, value) => {
        if(!map.has(key)) map.set(key, []);
        map.get(key).push(value);
    };
    for(const node of nodes){
        graph.nodeById.set(node.id, node);
        if(node.type === 'group' || node.type === 'promptGroup'){
            for(const id of node.items || []) add(graph.parents, id, node.id);
        }
    }
    for(const connection of connections){
        add(graph.incoming, connection.to, connection);
        add(graph.outgoing, connection.from, connection.to);
    }
    return graph;
}

// Use the pre-edit graph as well: deleted edges and group memberships still
// identify previews which must lose their old input.
function refreshCanvasMutation(ids, before=canvasInputGraph(), options={}){
    const current=canvasInputGraph(), redraw=new Set(ids), generators=new Set();
    for(const graph of [before,current]){
        const visited=new Set(),queue=[...ids];
        for(let i=0;i<queue.length;i++){
            const id=queue[i];if(visited.has(id))continue;visited.add(id);
            for(const parent of graph.parents.get(id) || []){redraw.add(parent);queue.push(parent);}
            for(const targetId of graph.outgoing.get(id) || []){
                const target=current.nodeById.get(targetId);if(!target)continue;
                if(CANVAS_GENERATOR_TYPES.includes(target.type))generators.add(targetId);
                else if(['loop','llm','group','promptGroup'].includes(target.type)){redraw.add(targetId);queue.push(targetId);}
            }
        }
    }
    for(const id of redraw){
        if(!current.nodeById.has(id))nodesEl.querySelector(`.node[data-id="${CSS.escape(id)}"]`)?.remove();
    }
    refreshNodes([...redraw].filter(id=>current.nodeById.has(id)),options);
    refreshGeneratorInputViews(generators);
    nodesEl.querySelectorAll('.node').forEach(el=>el.classList.toggle('selected',selected.has(el.dataset.id)));
    if(hoveredConnectionId && !connections.some(connection=>connection.id===hoveredConnectionId))hoveredConnectionId='';
    refreshGeometry();
    refreshGeometryAfterLayout();
    updateCanvasCostButton();
}

function removeCanvasNodes(ids){
    const removed=new Set(ids),before=canvasInputGraph();
    for(const node of nodes)if(removed.has(node.id))destroyLTXEditor(node);
    nodes=nodes.filter(node=>!removed.has(node.id));
    classicImageEditor.targetChanged();
    connections=connections.filter(connection=>!removed.has(connection.from) && !removed.has(connection.to));
    for(const node of nodes){
        if(['group','promptGroup'].includes(node.type) && node.items?.some(id=>removed.has(id)))node.items=node.items.filter(id=>!removed.has(id));
    }
    for(const id of removed)selected.delete(id);
    refreshCanvasMutation([...removed],before);
}

function deleteNode(id, event){
    event?.stopPropagation();
    if(isCanvasLockedByOther() || !nodes.some(node=>node.id===id))return;
    pushUndo();
    removeCanvasNodes([id]);
    scheduleSave();
}

function clearNodeContentBeforeDelete(id){
    if(isCanvasLockedByOther())return false;
    const node = nodes.find(n => n.id === id);
    if(!node) return false;
    if(node.type === 'image' && node.url){
        pushUndo();
        clearCanvasFaceAuth(node);
        node.url = '';
        classicImageEditor.targetChanged();
        node.mediaKind = 'image';
        node.name = '上传节点';
        refreshCanvasMutation([node.id]);
        scheduleSave();
        return true;
    }
    if(node.type === 'output' && ((node.images || []).length || (node._pending || []).length)){
        pushUndo();
        node.images = [];
        node._pending = [];
        node.imageComparisons = {};
        refreshCanvasMutation([node.id]);
        scheduleSave();
        return true;
    }
    return false;
}

function deleteNodeFromButton(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    if(clearNodeContentBeforeDelete(id)) return;
    deleteNode(id, event);
}

function deleteConnection(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    if(isCanvasLockedByOther()) return;
    pushUndo();
    connections = connections.filter(c => c.id !== id);
    if(hoveredConnectionId === id) hoveredConnectionId = '';
    syncGeneratorInputs();
    render();
    scheduleSave();
}

async function importWorkflowAssetUrl(url, name='workflow'){
    if(!canvas || !url) return;
    try {
        const res = await fetch(url, {cache:'no-store'});
        if(!res.ok) throw new Error('读取工作流资产失败');
        const blob = await res.blob();
        const fileName = name && /\.(json|zip)$/i.test(name) ? name : (url.split('/').pop()?.split('?')[0] || `${name || 'workflow'}.zip`);
        await importWorkflowFile(new File([blob], fileName, {type:blob.type || 'application/octet-stream'}));
    } catch(err) {
        showErrorModal(err.message || '导入工作流资产失败', '导入工作流');
    }
}

// --- 画布备份 ---

async function createCanvasBackup(){
    if(!canvas?.id) return;
    const btn = document.getElementById('canvasBackupToggle');
    if(btn) btn.disabled = true;
    try {
        const data = await window.CanvasApi.createCanvasBackup(canvas.id);
        setStatus(`备份已保存 (${new Date(data.updated_at).toLocaleTimeString()})`);
        if(document.getElementById('backupModal')) await showBackupList();
    } catch(e) {
        setStatus('备份失败');
        console.error(e);
    } finally {
        if(btn) btn.disabled = false;
    }
}

async function showBackupList(event){
    event?.preventDefault?.();
    if(!canvas?.id) return;
    // 先存一份
    const btn = document.getElementById('canvasBackupToggle');
    if(btn) btn.disabled = true;
    let backups = [];
    try {
        const data = await window.CanvasApi.listCanvasBackups(canvas.id, {backups:[]});
        backups = data.backups || [];
    } catch(e) { console.error(e); }
    if(btn) btn.disabled = false;
    renderBackupModal(backups);
}

function renderBackupModal(backups){
    let existing = document.getElementById('backupModal');
    if(existing) existing.remove();

    const rows = backups.length
        ? backups.map(b => {
            const d = new Date(b.timestamp);
            const time = d.toLocaleString();
            const size = b.size > 1024 ? `${(b.size/1024).toFixed(1)} KB` : `${b.size} B`;
            return `<div class="backup-row">
                <div class="backup-info">
                    <div class="backup-title">${escapeHtml(b.title || '—')}</div>
                    <div class="backup-meta">${time} · ${b.node_count} nodes · ${size}</div>
                </div>
                <div class="backup-actions">
                    <button class="backup-restore-btn" data-filename="${escapeAttr(b.filename)}" title="恢复"><i data-lucide="rotate-ccw"></i></button>
                    <button class="backup-delete-btn" data-filename="${escapeAttr(b.filename)}" title="删除"><i data-lucide="trash-2"></i></button>
                </div>
            </div>`;
        }).join('')
        : `<div class="backup-empty">暂无备份</div>`;

    const html = `<div id="backupModal" class="log-modal backup-modal open">
        <div class="log-modal-overlay" onclick="closeBackupModal()"></div>
        <div class="log-modal-panel">
            <div class="log-modal-head">
                <h3>画布备份</h3>
                <button class="log-modal-close" onclick="closeBackupModal()"><i data-lucide="x"></i></button>
            </div>
            <div class="log-modal-body">
                <button class="backup-create-btn" onclick="createCanvasBackup()" type="button">
                    <i data-lucide="hard-drive"></i><span>立即备份</span>
                </button>
                <div class="backup-list">${rows}</div>
            </div>
        </div>
    </div>`;
    const container = shell || document.body;
    container.insertAdjacentHTML('beforeend', html);
    if(window.lucide) lucide.createIcons();
    // bind events
    const modal = document.getElementById('backupModal');
    modal?.querySelectorAll('.backup-restore-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const fn = btn.dataset.filename;
            if(!fn) return;
            if(!confirm(`恢复此备份？当前画布将被覆盖。`)) return;
            try {
                const res = await window.CanvasApi.restoreCanvasBackup(canvas.id, fn);
                if(!res.ok) throw new Error('restore failed');
                syncRemoteCanvasNow();
                closeBackupModal();
                setStatus('备份已恢复');
            } catch(e) {
                console.error(e);
                setStatus('恢复失败');
            }
        });
    });
    modal?.querySelectorAll('.backup-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const fn = btn.dataset.filename;
            if(!fn) return;
            try {
                await window.CanvasApi.deleteCanvasBackup(canvas.id, fn);
                closeBackupModal();
                showBackupList();
            } catch(e) { console.error(e); }
        });
    });
}

function closeBackupModal(){
    const modal = document.getElementById('backupModal');
    if(modal) modal.remove();
}

// Called once by canvas.js, at its original initialization position.
function bindClassicWorkflowToggle(){
    workflowTransferToggle?.addEventListener('click', () => {
        if(workflowTransferModal?.classList.contains('open')) closeWorkflowTransferModal();
        else openWorkflowTransferModal();
    });
}

// Called once by canvas.js, at its original initialization position.
function bindClassicWorkflowFileInput(){
    workflowImportInput?.addEventListener('change', event => {
        const file = event.target.files?.[0];
        if(file) importWorkflowFile(file);
        event.target.value = '';
    });
    workflowImportDropZone?.addEventListener('click', () => workflowImportInput?.click());
    workflowImportDropZone?.addEventListener('dragenter', event => {
        event.preventDefault();
        event.stopPropagation();
        workflowImportDropZone.classList.add('drag-over');
    });
    workflowImportDropZone?.addEventListener('dragover', event => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
        workflowImportDropZone.classList.add('drag-over');
    });
    workflowImportDropZone?.addEventListener('dragleave', event => {
        event.preventDefault();
        event.stopPropagation();
        if(!workflowImportDropZone.contains(event.relatedTarget)) workflowImportDropZone.classList.remove('drag-over');
    });
    workflowImportDropZone?.addEventListener('drop', event => {
        event.preventDefault();
        event.stopPropagation();
        workflowImportDropZone.classList.remove('drag-over');
        const file = [...(event.dataTransfer?.files || [])].find(item => /\.(json|zip)$/i.test(item.name || ''));
        if(file) importWorkflowFile(file);
        else setStatus('请拖入 JSON 或 ZIP 工作流文件');
    });
}

// Called once by canvas.js, at its original initialization position.
function bindClassicWorkflowDropEvents(){
    workflowTransferModal?.addEventListener('wheel', event => {
        event.stopPropagation();
    }, {passive:true, capture:true});
    workflowTransferModal?.addEventListener('dragover', event => {
        event.preventDefault();
        event.stopPropagation();
        if(workflowImportDropZone){
            event.dataTransfer.dropEffect = 'copy';
            workflowImportDropZone.classList.add('drag-over');
        }
    });
    workflowTransferModal?.addEventListener('dragleave', event => {
        event.preventDefault();
        event.stopPropagation();
        if(!workflowTransferModal.contains(event.relatedTarget)) workflowImportDropZone?.classList.remove('drag-over');
    });
    workflowTransferModal?.addEventListener('drop', event => {
        event.preventDefault();
        event.stopPropagation();
        workflowImportDropZone?.classList.remove('drag-over');
        const file = [...(event.dataTransfer?.files || [])].find(item => /\.(json|zip)$/i.test(item.name || ''));
        if(file) importWorkflowFile(file);
        else setStatus('请拖入 JSON 或 ZIP 工作流文件');
    });
}

function groupSelectedImages(){
    if(!ensureCanvas()) return;
    const targets = [...selected].map(id => nodes.find(n => n.id === id)).filter(n => n?.type === 'image' || n?.type === 'prompt');
    let group;
    pushUndo();
    if(targets.length){
        const box = nodeBounds(targets.map(n => n.id));
        group = {id:uid('grp'), type:'group', x:box.x - 24, y:box.y - 58, w:box.w + 48, h:box.h + 90, items:targets.map(n => n.id)};
    } else {
        const p = defaultPoint(0, 0);
        group = {id:uid('grp'), type:'group', x:p.x, y:p.y, w:300, h:220, items:[]};
    }
    nodes.push(group);
    if(targets.length) handoffExistingInputsToGroup(group, targets);
    selected.clear();
    selected.add(group.id);
    syncGeneratorInputs();
    refreshGeneratorInputViews();
    render();
    scheduleSave();
}

function connectSelectionToGenerator(kind, genId){
    const ids = [...selected];
    let source = null;
    if(kind === 'images'){
        const imgs = ids.map(id => nodes.find(n => n.id === id)).filter(n => n?.type === 'image' && n.url);
        if(!imgs.length) return;
        const box = nodeBounds(imgs.map(n => n.id));
        source = {id:uid('grp'), type:'group', x:box.x - 24, y:box.y - 58, w:box.w + 48, h:box.h + 90, items:imgs.map(n => n.id)};
    } else {
        const prompts = ids.map(id => nodes.find(n => n.id === id)).filter(n => n?.type === 'prompt');
        if(!prompts.length) return;
        const box = nodeBounds(prompts.map(n => n.id));
        source = {id:uid('pg'), type:'promptGroup', x:box.x - 24, y:box.y - 58, w:box.w + 48, h:box.h + 90, items:prompts.map(n => n.id)};
    }
    nodes.push(source);
    connections.push({id:uid('c'), from:source.id, to:genId});
    selected.clear();
    selected.add(source.id);
    syncGeneratorInputs();
}

function canvasHistorySnapshot(){
    return {
        nodes:JSON.parse(JSON.stringify(serializableCanvasNodes())),
        connections:JSON.parse(JSON.stringify(connections)),
    };
}

function trimCanvasHistory(stack){
    if(stack.length > UNDO_MAX) stack.splice(0, stack.length - UNDO_MAX);
}

function resetCanvasHistory(){
    undoStack.length = 0;
    redoStack.length = 0;
}

function restoreCanvasHistoryState(state){
    if(!state) return false;
    const before=canvasInputGraph(),changed=new Set(),previous=new Map(nodes.map(node=>[node.id,node]));
    nodes = state.nodes.map(saved=>{
        const old=previous.get(saved.id);previous.delete(saved.id);
        if(old && JSON.stringify(serializableCanvasNode(old))===JSON.stringify(saved))return old;
        if(old)destroyLTXEditor(old);
        changed.add(saved.id);return saved;
    });
    for(const [id,node] of previous){changed.add(id);destroyLTXEditor(node);}
    const oldEdges=new Map(connections.map(edge=>[edge.id,JSON.stringify(edge)]));
    const nextEdges=new Map(state.connections.map(edge=>[edge.id,JSON.stringify(edge)]));
    for(const edge of [...connections,...state.connections]){
        if(oldEdges.get(edge.id)!==nextEdges.get(edge.id))changed.add(edge.from);
    }
    connections = state.connections;
    selected.clear();
    refreshCanvasMutation([...changed],before,{rebuildOutputs:true});
    scheduleSave();
    return true;
}

function pushUndo(){
    if(!canvas) return;
    undoStack.push(canvasHistorySnapshot());
    trimCanvasHistory(undoStack);
    // 发生新的编辑后，旧的重做分支已经失效。
    redoStack.length = 0;
}

function performUndo(){
    if(!canvas || !undoStack.length || isCanvasLockedByOther()) return false;
    redoStack.push(canvasHistorySnapshot());
    trimCanvasHistory(redoStack);
    return restoreCanvasHistoryState(undoStack.pop());
}

function performRedo(){
    if(!canvas || !redoStack.length || isCanvasLockedByOther()) return false;
    undoStack.push(canvasHistorySnapshot());
    trimCanvasHistory(undoStack);
    return restoreCanvasHistoryState(redoStack.pop());
}

function cloneNode(n, dx, dy){
    const copy = JSON.parse(JSON.stringify(serializableCanvasNode(n)));
    copy.id = uid(n.type);
    copy.x = n.x + dx;
    copy.y = n.y + dy;
    copy.running = false;
    return copy;
}

function copySelectedNodes(){
    if(!canvas || !selected.size) return;
    const el = document.activeElement;
    if(el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) return;
    const toCopy = [...selected].map(id => nodes.find(n => n.id === id)).filter(Boolean);
    if(!toCopy.length) return;
    const ids = new Set(toCopy.map(n => n.id));
    const pickedConnections = (connections || []).filter(c => ids.has(c.from) && ids.has(c.to)).map(c => ({...c}));
    clipboard = {
        nodes:JSON.parse(JSON.stringify(serializableCanvasNodes(toCopy))),
        connections:JSON.parse(JSON.stringify(pickedConnections))
    };
}

function clipboardNodeCount(){
    if(Array.isArray(clipboard)) return clipboard.length;
    if(Array.isArray(clipboard?.nodes)) return clipboard.nodes.length;
    return 0;
}

function pasteNodes(){
    if(!canvas || !clipboard) return;
    const clipNodes = Array.isArray(clipboard) ? clipboard : (Array.isArray(clipboard.nodes) ? clipboard.nodes : []);
    const clipConnections = Array.isArray(clipboard?.connections) ? clipboard.connections : [];
    if(!clipNodes.length) return;
    pushUndo();
    const xs = clipNodes.map(n => n.x), ys = clipNodes.map(n => n.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const dx = lastMouseBoard.x - cx;
    const dy = lastMouseBoard.y - cy;
    const idMap = new Map();
    const copies = clipNodes.map(n => { const c = cloneNode(n, dx, dy); idMap.set(n.id, c.id); return c; });
    copies.forEach(c => {
        if((c.type === 'group' || c.type === 'promptGroup') && c.items)
            c.items = c.items.map(id => idMap.get(id) || id);
    });
    const newConnections = clipConnections
        .map(c => ({...c, id:uid('c'), from:idMap.get(c.from), to:idMap.get(c.to)}))
        .filter(c => c.from && c.to);
    nodes.push(...copies);
    connections.push(...newConnections);
    selected.clear();
    copies.forEach(c => selected.add(c.id));
    sanitizeConnections();
    syncGeneratorInputs();
    render();
    scheduleSave();
}

function selectedWorkflowPayload(){
    const ids = new Set([...selected].filter(id => nodes.some(n => n.id === id)));
    const pickedNodes = [...ids].map(id => nodes.find(n => n.id === id)).filter(Boolean);
    const pickedConnections = connections.filter(c => ids.has(c.from) && ids.has(c.to)).map(c => ({...c}));
    return {
        format:'infinite-canvas-workflow',
        version:1,
        exported_at:Date.now(),
        nodes:serializableCanvasNodes(pickedNodes),
        connections:pickedConnections
    };
}

function workflowFilename(ext){
    const title = (canvas?.title || 'canvas-workflow').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 48) || 'canvas-workflow';
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
    return `${title}-${stamp}.${ext}`;
}

function downloadBlob(blob, filename){
    window.CanvasCore?.downloadBlob(blob, filename);
}

function openWorkflowTransferModal(){
    if(!canvas){ setStatus('请先新建或选择画布'); return; }
    if(classicAssetPanel.state.open) toggleCanvasAssetLibrary(false);
    updateWorkflowTransferMeta();
    workflowTransferModal?.classList.add('open');
    workflowTransferToggle?.classList.add('active');
    refreshIcons();
}

function closeWorkflowTransferModal(){
    workflowTransferModal?.classList.remove('open');
    workflowTransferToggle?.classList.remove('active');
    workflowImportDropZone?.classList.remove('drag-over');
}

function updateWorkflowTransferMeta(){
    const payload = selectedWorkflowPayload();
    const nodeCount = payload.nodes.length;
    const connCount = payload.connections.length;
    workflowExportMeta?.classList.remove('busy', 'success');
    if(workflowExportMeta) workflowExportMeta.textContent = nodeCount ? `已选择 ${nodeCount} 个节点，${connCount} 条连线` : '未选择节点，请先框选要导出的组件';
    if(workflowTransferSub) workflowTransferSub.textContent = nodeCount ? '导出当前框选内容，或把工作流导入到当前画布' : '请先框选节点再导出；导入会追加到当前画布';
}

function setWorkflowLibraryExportState(state='idle', text='导出到资产库'){
    if(!workflowExportLibraryBtn) return;
    workflowExportLibraryBtn.disabled = state === 'busy';
    workflowExportLibraryBtn.classList.toggle('busy', state === 'busy');
    workflowExportLibraryBtn.classList.toggle('success', state === 'success');
    const icon = state === 'busy' ? 'loader-2' : state === 'success' ? 'check' : 'library-big';
    workflowExportLibraryBtn.innerHTML = `<i data-lucide="${icon}" class="w-4 h-4"></i><span>${escapeHtml(text)}</span>`;
    refreshIcons();
}

async function exportSelectedWorkflow(includeResources=false){
    if(!canvas) return;
    const payload = selectedWorkflowPayload();
    if(!payload.nodes.length){
        if(workflowExportMeta) workflowExportMeta.textContent = '未选择节点，请先框选要导出的组件';
        if(workflowTransferSub) workflowTransferSub.textContent = '请先框选节点再导出；导入会追加到当前画布';
        setStatus('未选择节点，请先框选要导出的组件');
        return;
    }
    try {
        if(!includeResources){
            const filename = workflowFilename('json');
            downloadBlob(new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'}), filename);
            setStatus('已导出工作流 JSON');
            return;
        }
        const filename = workflowFilename('zip');
        const res = await window.CanvasApi.exportCanvasWorkflow({...payload, include_resources:true, filename});
        if(!res.ok) throw new Error(await responseErrorMessage(res, '导出工作流失败'));
        const blob = await res.blob();
        downloadBlob(blob, filename);
        setStatus('已导出包含资源的工作流包');
    } catch(err) {
        showErrorModal(err.message || '导出工作流失败', '导出工作流');
    }
}

function defaultWorkflowAssetTarget(preferredLibraryId=classicAssetPanel.state.libraryId){
    const libs = canvasAssetLibraries();
    let lib = canvasAssetSourceLibraries().find(lib=>lib.id === preferredLibraryId) || libs[0] || null;
    if(!lib) return {libraryId:'', categoryId:''};
    let cat = (lib.categories || []).find(item => String(item.type || '').toLowerCase() === 'workflow');
    if(!cat){
        lib = libs.find(item => (item.categories || []).some(cat => String(cat.type || '').toLowerCase() === 'workflow')) || lib;
        cat = (lib.categories || []).find(item => String(item.type || '').toLowerCase() === 'workflow');
    }
    return {libraryId:lib?.id || '', categoryId:cat?.id || ''};
}

async function exportSelectedWorkflowToLibrary(){
    if(!canvas) return;
    const payload = selectedWorkflowPayload();
    if(!payload.nodes.length){
        if(workflowExportMeta) workflowExportMeta.textContent = '未选择节点，请先框选要导出的组件';
        setStatus('未选择节点，请先框选要导出的组件');
        return;
    }
    const origin = classicAssetPanel.captureSelection();
    try {
        setWorkflowLibraryExportState('busy', '导出中...');
        if(workflowExportMeta){
            workflowExportMeta.classList.remove('success');
            workflowExportMeta.classList.add('busy');
            workflowExportMeta.textContent = '正在导出到资产库...';
        }
        if(workflowTransferSub) workflowTransferSub.textContent = '正在保存工作流到资产库';
        setStatus('正在导出工作流到资产库...');
        if(!canvasAssetLibrary?.libraries?.length) await loadCanvasAssetLibrary({renderPanel:false});
        const filename = workflowFilename('zip');
        const target = defaultWorkflowAssetTarget(origin.libraryId);
        const data = await classicAssetPanel.mutate(async () => {
            const res = await window.CanvasApi.exportCanvasWorkflowToLibrary({...payload, include_resources:true, filename, name:filename.replace(/\.zip$/i, ''), library_id:target.libraryId, category_id:target.categoryId});
            if(!res.ok) throw new Error(await responseErrorMessage(res, '导出到资产库失败'));
            return res.json();
        });
        completeClassicAssetWrite(data, origin, {libraryId:target.libraryId || origin.libraryId,
            categoryId:data.item ? (data.library?.libraries || []).flatMap(lib=>lib.categories || []).find(cat=>(cat.items || []).some(item=>item.id === data.item.id))?.id || origin.categoryId : origin.categoryId});
        const itemName = data.item?.name || '工作流';
        if(workflowExportMeta){
            workflowExportMeta.classList.remove('busy');
            workflowExportMeta.classList.add('success');
            workflowExportMeta.textContent = `已导出到资产库：${itemName}`;
        }
        if(workflowTransferSub) workflowTransferSub.textContent = '导出完成，可在资产库的工作流分组中查看';
        setWorkflowLibraryExportState('success', '已导出');
        setStatus(`已导出工作流到资产库：${itemName}`);
        setTimeout(() => {
            setWorkflowLibraryExportState('idle');
            if(workflowTransferModal?.classList.contains('open')) updateWorkflowTransferMeta();
        }, 1800);
    } catch(err) {
        setWorkflowLibraryExportState('idle');
        workflowExportMeta?.classList.remove('busy', 'success');
        showErrorModal(err.message || '导出到资产库失败', '导出工作流');
    }
}

function normalizeImportedWorkflow(data){
    if(Array.isArray(data?.nodes)) return {nodes:data.nodes, connections:Array.isArray(data.connections) ? data.connections : []};
    if(Array.isArray(data?.workflow?.nodes)) return {nodes:data.workflow.nodes, connections:Array.isArray(data.workflow.connections) ? data.workflow.connections : []};
    return {nodes:[], connections:[]};
}

function insertWorkflowIntoCanvas(imported){
    const srcNodes = (imported.nodes || []).filter(Boolean);
    const srcConnections = (imported.connections || []).filter(Boolean);
    if(!canvas || !srcNodes.length) throw new Error('工作流中没有可导入的节点');
    pushUndo();
    const minX = Math.min(...srcNodes.map(n => Number(n.x || 0)));
    const minY = Math.min(...srcNodes.map(n => Number(n.y || 0)));
    const target = lastMouseBoard && Number.isFinite(lastMouseBoard.x) ? lastMouseBoard : defaultPoint(0, 0);
    const dx = target.x - minX;
    const dy = target.y - minY;
    const idMap = new Map();
    const newNodes = srcNodes.map(n => {
        const copy = JSON.parse(JSON.stringify(serializableCanvasNode(n)));
        const oldId = copy.id || uid(copy.type || 'n');
        copy.id = uid(copy.type || 'n');
        copy.x = Number(copy.x || 0) + dx;
        copy.y = Number(copy.y || 0) + dy;
        copy.running = false;
        idMap.set(oldId, copy.id);
        return copy;
    });
    newNodes.forEach(node => {
        if((node.type === 'group' || node.type === 'promptGroup') && Array.isArray(node.items)){
            node.items = node.items.map(id => idMap.get(id) || id).filter(id => idMap.has(id) || nodes.some(n => n.id === id));
        }
    });
    const newConnections = srcConnections
        .map(c => ({...c, id:uid('c'), from:idMap.get(c.from), to:idMap.get(c.to)}))
        .filter(c => c.from && c.to);
    nodes.push(...newNodes);
    connections.push(...newConnections);
    selected.clear();
    newNodes.forEach(n => selected.add(n.id));
    sanitizeConnections();
    syncGeneratorInputs();
    render();
    scheduleSave();
    setStatus(`已导入 ${newNodes.length} 个节点`);
}

async function importWorkflowFile(file){
    if(!canvas || !file) return;
    try {
        const form = new FormData();
        form.append('file', file);
        const res = await window.CanvasApi.importCanvasWorkflow(form);
        if(!res.ok) throw new Error(await responseErrorMessage(res, '导入工作流失败'));
        const data = await res.json();
        insertWorkflowIntoCanvas(normalizeImportedWorkflow(data));
        closeWorkflowTransferModal();
    } catch(err) {
        showErrorModal(err.message || '导入工作流失败', '导入工作流');
    }
}

function wouldCreateGeneratorCycle(fromId, toId){
    const seen = new Set();
    const walk = id => {
        if(id === fromId) return true;
        if(seen.has(id)) return false;
        seen.add(id);
        for(const c of connections.filter(x => x.from === id)){
            if(walk(c.to)) return true;
            const next = nodes.find(n => n.id === c.to);
            if(next?.type === 'output'){
                for(const cc of connections.filter(x => x.from === next.id)){
                    if(walk(cc.to)) return true;
                }
            }
        }
        return false;
    };
    return walk(toId);
}

function canConnect(fromId, toId){
    if(!fromId || !toId || fromId === toId) return false;
    const from = nodes.find(n => n.id === fromId);
    const to = nodes.find(n => n.id === toId);
    if(!from || !to) return false;
    if(CANVAS_GENERATOR_TYPES.includes(from.type)){
        if(to.type === 'output') return !wouldCreateGeneratorCycle(fromId, toId);
        if(CANVAS_MEDIA_OUTPUT_TYPES.includes(from.type) && CANVAS_GENERATOR_TYPES.includes(to.type)){
            return !wouldCreateGeneratorCycle(fromId, toId);
        }
        return false;
    }
    if(to.type === 'loop'){
        const allowImage = Boolean(to.imageInput) && ['image','group','output'].includes(from.type);
        const allowPrompt = Boolean(to.showPrompt) && ['prompt','promptGroup','loop','llm'].includes(from.type);
        return allowImage || allowPrompt;
    }
    if(to.type === 'llm') return ['prompt','loop','promptGroup','llm','image','group','output'].includes(from.type);
    if(from.type === 'llm') return CANVAS_GENERATOR_TYPES.includes(to.type);
    const allowed = CANVAS_GENERATOR_TYPES.includes(to.type) && ['image','prompt','loop','group','promptGroup','output','llm'].includes(from.type);
    return allowed && (from.type !== 'output' || !wouldCreateGeneratorCycle(fromId, toId));
}

function sanitizeConnections(){
    connections = (connections || []).filter(c => canConnect(c.from, c.to));
}

function handoffExistingInputsToGroup(group, children){
    if(!group || group.type !== 'group') return false;
    const childIds = new Set((children || []).filter(n => ['image','prompt'].includes(n?.type)).map(n => n.id));
    if(!childIds.size) return false;
    const targetIds = new Set();
    connections.forEach(c => {
        if(!childIds.has(c.from)) return;
        const target = nodes.find(n => n.id === c.to);
        if(target && CANVAS_GENERATOR_TYPES.includes(target.type)) targetIds.add(target.id);
    });
    if(!targetIds.size) return false;
    connections = connections.filter(c => !(childIds.has(c.from) && targetIds.has(c.to)));
    targetIds.forEach(targetId => {
        if(!connections.some(c => c.from === group.id && c.to === targetId) && canConnect(group.id, targetId)){
            connections.push({id:uid('c'), from:group.id, to:targetId});
        }
    });
    return true;
}

function updateGroupMembership(movedNodes){
    const pairs = [
        {childType:'image', groupType:'group'},
        {childType:'prompt', groupType:'group'},
        {childType:'prompt', groupType:'promptGroup'}
    ];
    let changed = false;
    const handoffGroupConnections = (group, child) => {
        if(!group || group.type !== 'group' || !['image','prompt'].includes(child?.type)) return;
        const directTargets = connections
            .filter(c => c.from === child.id)
            .map(c => nodes.find(n => n.id === c.to))
            .filter(n => n && CANVAS_GENERATOR_TYPES.includes(n.type));
        const groupTargets = connections
            .filter(c => c.from === group.id)
            .map(c => nodes.find(n => n.id === c.to))
            .filter(n => n && CANVAS_GENERATOR_TYPES.includes(n.type));
        const targets = new Map([...directTargets, ...groupTargets].map(n => [n.id, n]));
        targets.forEach(target => {
            const before = connections.length;
            connections = connections.filter(c => !(c.from === child.id && c.to === target.id));
            if(connections.length !== before) changed = true;
            if(!connections.some(c => c.from === group.id && c.to === target.id) && canConnect(group.id, target.id)){
                connections.push({id:uid('c'), from:group.id, to:target.id});
                changed = true;
            }
        });
    };
    pairs.forEach(({childType, groupType}) => {
        const groups = nodes.filter(n => n.type === groupType);
        const children = movedNodes.filter(n => n?.type === childType);
        if(!children.length || !groups.length) return;
        children.forEach(child => {
            const cr = nodeRect(child);
            const containing = groups.find(g => {
                const gr = nodeRect(g);
                return cr.cx >= gr.x && cr.cx <= gr.x + gr.w && cr.cy >= gr.y && cr.cy <= gr.y + gr.h;
            });
            groups.forEach(g => {
                if(g === containing) return;
                const idx = (g.items || []).indexOf(child.id);
                if(idx >= 0){ g.items.splice(idx, 1); changed = true; }
            });
            if(containing){
                containing.items = containing.items || [];
                if(!containing.items.includes(child.id)){ containing.items.push(child.id); changed = true; }
                handoffGroupConnections(containing, child);
            }
        });
    });
    if(changed){
        syncGeneratorInputs();
        refreshGeneratorInputViews();
        render();
        scheduleSave();
    }
}

function deleteSelectedNodes(){
    if(!canvas || selected.size === 0) return;
    if(isCanvasLockedByOther()){
        setStatus('画布正被其他人编辑中，无法删除');
        return;
    }
    pushUndo();
    // 收集所有需要删除的 id（含 group 的 items 一并删除）
    const toDelete = new Set();
    const collect = id => {
        if(toDelete.has(id)) return;
        toDelete.add(id);
        const n = nodes.find(x => x.id === id);
        if(n && (n.type === 'group' || n.type === 'promptGroup')){
            (n.items || []).forEach(collect);
        }
    };
    selected.forEach(collect);
    removeCanvasNodes(toDelete);
    scheduleSave();
}
