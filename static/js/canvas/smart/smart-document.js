/* Smart canvas: Canvas data, edit history, persistence, backups and workflow transfer.
 * Browser classic script (not an ES module); loaded before smart-canvas.js.
 * Function declarations only: initialization is explicitly invoked by the entry.
 * Uses the entry's existing shared bindings; do not duplicate permission or document state.
 */

function capturePendingUndo(){ pendingUndoSnapshot = snapshotForUndo(); }

function commitPendingUndo(){
    if(pendingUndoSnapshot){
        undoStack.push(pendingUndoSnapshot);
        if(undoStack.length > UNDO_LIMIT) undoStack.shift();
        pendingUndoSnapshot = null;
    }
}

function discardPendingUndo(){ pendingUndoSnapshot = null; }

function snapshotForUndo(){
    return {
        nodes: JSON.parse(JSON.stringify(nodes)),
        connections: JSON.parse(JSON.stringify(canvas?.connections || [])),
        selectedId,
        selectedIds: selectedIds.slice(),
        selectedImage: {...selectedImage}
    };
}

function pushUndo(){
    if(undoSuppressed) return;
    if(!canvas) return;
    undoStack.push(snapshotForUndo());
    if(undoStack.length > UNDO_LIMIT) undoStack.shift();
}

function performUndo(){
    if(!undoStack.length){ toast(tr('smart.toastNoUndo')); return; }
    const snap = undoStack.pop();
    undoSuppressed = true;
    nodes = snap.nodes;
    if(canvas) canvas.connections = snap.connections;
    selectedId = snap.selectedId;
    selectedIds = snap.selectedIds;
    selectedImage = snap.selectedImage;
    activeComposerSubject = null;
    lastComposerNodeId = '';
    render();
    scheduleSave();
    undoSuppressed = false;
    toast(tr('smart.toastUndone'));
}

function cloneSmartSettings(source=settings){
    try {
        return JSON.parse(JSON.stringify(source || {}));
    } catch(e) {
        return {...(source || {})};
    }
}

function settingsForStorage(source=settings){
    const clean = cloneSmartSettings(source);
    clean.videoTempShLinks = (clean.videoTempShLinks || []).filter(item => item?.manual === true);
    return clean;
}

function mediaItemForStorage(item){
    if(!item || typeof item !== 'object') return item;
    const clean = {...item};
    delete clean.cloudUrl;
    delete clean.uploadedUrl;
    delete clean.originalRemoteUrl;
    delete clean.tempCloudUrl;
    delete clean._inlineVideoActive;
    return clean;
}

function canvasForStorage(source=canvas){
    const clean = JSON.parse(JSON.stringify(source || {}));
    clean.settings = settingsForStorage(canvasDefaultSmartSettings || initialSmartSettings);
    (clean.nodes || []).forEach(node => {
        if(node.type==='smart-prompt')delete node.running;
        node.images = (node.images || []).map(img=>mediaItemForStorage(stripImageGenerationMeta(img)));
        if(node.runSettings) node.runSettings = settingsForStorage(node.runSettings);
    });
    return clean;
}

function downloadBlob(blob, filename){
    window.CanvasCore?.downloadBlob(blob, filename || 'smart-canvas-workflow.json');
}

function smartWorkflowFilename(ext='json'){
    const title = (canvas?.title || document.getElementById('smartTitle')?.textContent || 'smart-canvas').trim();
    const safe = title.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '-').slice(0, 48) || 'smart-canvas';
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
    return `${safe}-workflow-${stamp}.${ext}`;
}

function serializableSmartNode(node){
    const base = JSON.parse(JSON.stringify(node || {}));
    const copy = normalizeLegacySmartNode(base) || {};
    if(Array.isArray(copy.images)) copy.images = copy.images.map(img => mediaItemForStorage(stripImageGenerationMeta(img))).filter(Boolean);
    if(copy.runSettings) copy.runSettings = settingsForStorage(copy.runSettings);
    copy.running = false;
    copy.pending = 0;
    copy.queued = false;
    delete copy.pendingTasks;
    delete copy._dom;
    return copy;
}

function selectedSmartWorkflowPayload(){
    const ids = selectedNodeIds();
    const idSet = new Set(ids);
    const selectedNodes = nodes.filter(node => idSet.has(node.id)).map(serializableSmartNode);
    const selectedSet = new Set(selectedNodes.map(node => node.id));
    const selectedConnections = (canvas?.connections || [])
        .filter(conn => selectedSet.has(conn.from) && selectedSet.has(conn.to))
        .map(conn => JSON.parse(JSON.stringify(conn)));
    return {
        format:'infinite-smart-canvas-workflow',
        version:1,
        canvas_type:'smart',
        exported_at:Date.now(),
        nodes:selectedNodes,
        connections:selectedConnections
    };
}

function normalizeImportedSmartWorkflow(data){
    if(Array.isArray(data)) return {nodes:data, connections:[]};
    if(Array.isArray(data?.nodes)) return {nodes:data.nodes, connections:Array.isArray(data.connections) ? data.connections : []};
    if(Array.isArray(data?.workflow?.nodes)) return {nodes:data.workflow.nodes, connections:Array.isArray(data.workflow.connections) ? data.workflow.connections : []};
    return {nodes:[], connections:[]};
}

function openSmartWorkflowTransferModal(){
    if(!canvas){ toast('请先打开画布'); return; }
    toggleAssetLibrary(false);
    updateSmartWorkflowTransferMeta();
    smartWorkflowTransferModal?.classList.add('open');
    smartWorkflowToggle?.classList.add('active');
    refreshIcons();
}

function closeSmartWorkflowTransferModal(){
    smartWorkflowTransferModal?.classList.remove('open');
    smartWorkflowToggle?.classList.remove('active');
    smartWorkflowImportDropZone?.classList.remove('drag-over');
}

function updateSmartWorkflowTransferMeta(){
    const payload = selectedSmartWorkflowPayload();
    const nodeCount = payload.nodes.length;
    const connCount = payload.connections.length;
    smartWorkflowExportMeta?.classList.remove('busy', 'success');
    if(smartWorkflowExportMeta) smartWorkflowExportMeta.textContent = nodeCount ? `已选择 ${nodeCount} 个节点，${connCount} 条连线` : '未选择节点，请先选中要导出的组件';
    if(smartWorkflowTransferSub) smartWorkflowTransferSub.textContent = nodeCount ? '导出当前选中内容，或把工作流导入到当前画布' : '请先选中节点再导出；导入会追加到当前画布';
}

async function exportSelectedSmartWorkflow(includeResources=false){
    if(!canvas) return;
    const payload = selectedSmartWorkflowPayload();
    if(!payload.nodes.length){
        updateSmartWorkflowTransferMeta();
        toast('未选择节点，请先选中要导出的组件');
        return;
    }
    try {
        if(!includeResources){
            downloadBlob(new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'}), smartWorkflowFilename('json'));
            toast('已导出智能画布工作流 JSON');
            return;
        }
        if(smartWorkflowExportMeta){
            smartWorkflowExportMeta.classList.add('busy');
            smartWorkflowExportMeta.textContent = '正在打包资源...';
        }
        const filename = smartWorkflowFilename('zip');
        const res = await window.CanvasApi.exportCanvasWorkflow({...payload, include_resources:true, filename});
        if(!res.ok) throw new Error(await responseErrorMessage(res, '导出工作流失败'));
        downloadBlob(await res.blob(), filename);
        if(smartWorkflowExportMeta){
            smartWorkflowExportMeta.classList.remove('busy');
            smartWorkflowExportMeta.classList.add('success');
            smartWorkflowExportMeta.textContent = `已导出 ${payload.nodes.length} 个节点，包含可找到的本地资源`;
        }
        toast('已导出包含资源的智能画布工作流包');
        setTimeout(() => {
            if(smartWorkflowTransferModal?.classList.contains('open')) updateSmartWorkflowTransferMeta();
        }, 1600);
    } catch(err) {
        smartWorkflowExportMeta?.classList.remove('busy', 'success');
        toast(err.message || '导出工作流失败');
    }
}

function insertSmartWorkflowIntoCanvas(imported){
    const srcNodes = (imported.nodes || []).filter(Boolean);
    const srcConnections = (imported.connections || []).filter(Boolean);
    if(!canvas || !srcNodes.length) throw new Error('工作流中没有可导入的节点');
    pushUndo();
    const minX = Math.min(...srcNodes.map(n => Number(n.x || 0)));
    const minY = Math.min(...srcNodes.map(n => Number(n.y || 0)));
    const target = viewportCenter();
    const dx = target.x - minX;
    const dy = target.y - minY;
    const idMap = new Map();
    const newNodes = srcNodes.map(source => {
        const copy = serializableSmartNode(source);
        const oldId = copy.id || uid(copy.type || 'smart');
        copy.id = uid(copy.type || 'smart');
        copy.x = Number(copy.x || 0) + dx;
        copy.y = Number(copy.y || 0) + dy;
        copy.created_at = copy.created_at || Date.now();
        idMap.set(oldId, copy.id);
        return normalizeLegacySmartNode(copy);
    }).filter(Boolean);
    const newConnections = srcConnections
        .map(conn => ({...JSON.parse(JSON.stringify(conn)), from:idMap.get(conn.from), to:idMap.get(conn.to)}))
        .filter(conn => conn.from && conn.to);
    nodes.push(...newNodes);
    canvas.connections = [...(canvas.connections || []), ...newConnections];
    selectedIds = newNodes.length > 1 ? newNodes.map(node => node.id) : [];
    selectedId = newNodes.length === 1 ? newNodes[0].id : '';
    selectedImage = {nodeId:'', index:-1};
    activeComposerSubject = null;
    render();
    scheduleSave();
    toast(`已导入 ${newNodes.length} 个节点`);
}

async function importSmartWorkflowFile(file){
    if(!canvas || !file) return;
    try {
        if(smartWorkflowTransferSub) smartWorkflowTransferSub.textContent = '正在导入工作流...';
        const form = new FormData();
        form.append('file', file);
        const res = await window.CanvasApi.importCanvasWorkflow(form);
        if(!res.ok) throw new Error(await responseErrorMessage(res, '导入工作流失败'));
        const data = await res.json();
        insertSmartWorkflowIntoCanvas(normalizeImportedSmartWorkflow(data));
        closeSmartWorkflowTransferModal();
    } catch(err) {
        if(smartWorkflowTransferModal?.classList.contains('open')) updateSmartWorkflowTransferMeta();
        toast(err.message || '导入工作流失败');
    }
}

function smartScopedStorageKey(key){
    return window.CanvasSession?.enabled ? window.CanvasSession.storageKey(key) : key;
}

function loadRecentSmartSettings(){
    try {
        const data = JSON.parse(localStorage.getItem(smartScopedStorageKey(RECENT_SMART_SETTINGS_KEY)) || '{}');
        recentSmartSettingsByMode = data && typeof data === 'object' ? data : {};
    } catch(e) {
        recentSmartSettingsByMode = {};
    }
}

function saveRecentSmartSettings(){
    localStorage.setItem(smartScopedStorageKey(RECENT_SMART_SETTINGS_KEY), JSON.stringify(recentSmartSettingsByMode));
}

function recentSmartSettingsForMode(modeKey=''){
    const key = modeKey || recentSmartSettingsByMode.__lastKey || smartSettingsModeKey(settings);
    const saved = recentSmartSettingsByMode[key];
    return saved && typeof saved === 'object' ? cloneSmartSettings(saved) : {};
}

function rememberRecentSmartSettings(source=settings, node=null){
    const clean = stripOutpaintDisplaySettings(settingsForStorage(source), node);
    sanitizeSmartApiSelection(clean);
    if(clean.outpaintResolutionLocked === true && clean.resolution === 'custom'){
        clean.resolution = '1k';
        clean.ratio = clean.ratio || 'square';
        clean.customWidth = '';
        clean.customHeight = '';
        clean.customSize = '';
    }
    delete clean.outpaintResolutionLocked;
    const key = smartSettingsModeKey(clean);
    recentSmartSettingsByMode[key] = settingsForStorage(clean);
    recentSmartSettingsByMode.__lastKey = key;
    saveRecentSmartSettings();
}

function normalizeLegacySmartNode(node){
    if(!node || typeof node !== 'object') return node;
    if(node.type==='smart-prompt')delete node.running;
    if(node.type === 'smart-container'){
        const fallbackImage = node.inputImage?.url ? stripImageGenerationMeta({
            url:node.inputImage.url,
            name:node.inputImage.name || 'image',
            kind:node.inputImage.kind || mediaKindForItem(node.inputImage),
            natural_w:Number(node.inputImage.natural_w || 0),
            natural_h:Number(node.inputImage.natural_h || 0)
        }) : null;
        const images = Array.isArray(node.images) && node.images.length
            ? node.images
            : (fallbackImage ? [fallbackImage] : []);
        const normalized = {
            ...node,
            type:'smart-image',
            title:images.length > 1 ? 'Group' : (images.length ? 'Image' : tr('smart.createImportNode')),
            images
        };
        delete normalized.imageMode;
        delete normalized.inputImage;
        delete normalized.steps;
        delete normalized.resultGrouping;
        return normalized;
    }
    if(!node.type) node.type = 'smart-image';
    if(node.type === 'smart-image') delete node.imageMode;
    if(node.type === 'smart-image' && node.historyFor) node.isHistoryGroup = true;
    return node;
}

function createImageNodeAt(point, images=[], options={}){
    const layout = imageLayout(images || [], mediaNodeDefaultScale({type:'smart-image', images:images || []}), {type:'smart-image', images:images || []});
    return createNode((point?.x || 0) - Math.round(layout.width / 2), (point?.y || 0) - Math.round(layout.height / 2), images, options);
}

function restoreSmartMemberDraft(draft){
    if(!canvas || draft.id!==canvas.id || draft.kind!=='smart' || !Array.isArray(draft.nodes) || !Array.isArray(draft.connections)) throw new Error('智能画布草稿格式不完整，请先导出保留。');
    const restoredNodes=JSON.parse(JSON.stringify(draft.nodes)).map(serializableSmartNode);
    clearTimeout(saveTimer); saveTimer=null;
    undoStack.length=0; pendingUndoSnapshot=null;
    canvas.title=draft.title || canvas.title;
    canvas.icon=draft.icon || canvas.icon;
    canvas.nodes=nodes=restoredNodes;
    canvas.connections=JSON.parse(JSON.stringify(draft.connections));
    canvasUsesConnections=true;
    if(draft.settings){
        canvasDefaultSmartSettings=settingsForStorage(draft.settings);
        settings=cloneSmartSettings(canvasDefaultSmartSettings);
        canvas.settings=canvasDefaultSmartSettings;
    }
    selectedId=''; selectedIds=[];
    smartCanvasDirty=true; smartSaveErrorNotified=false;
    updateProviderModels(); updateSmartCanvasNav(); render();
    window.MemberCanvasEdit.markDirty();
}

async function createSmartCanvasBackup(){
    if(!canvasId) return;
    const button = document.getElementById('smartBackupToggle');
    if(button) button.disabled = true;
    try {
        const data = await window.CanvasApi.createCanvasBackup(canvasId);
        toast(`备份已保存 (${new Date(data.updated_at).toLocaleTimeString()})`);
        if(document.getElementById('smartBackupModal')) await showSmartCanvasBackups();
    } catch(e) {
        toast(e.message || '备份失败');
    } finally {
        if(button) button.disabled = false;
    }
}

async function showSmartCanvasBackups(){
    if(!canvasId) return;
    const button = document.getElementById('smartBackupToggle');
    if(button) button.disabled = true;
    try {
        const data = await window.CanvasApi.listCanvasBackups(canvasId, {backups:[]});
        renderSmartCanvasBackups(data.backups || []);
    } catch(e) {
        toast(e.message || '读取备份失败');
    } finally {
        if(button) button.disabled = false;
    }
}

function renderSmartCanvasBackups(backups){
    closeSmartCanvasBackups();
    const rows = backups.length ? backups.map(backup => `<div class="log-item">
        <div class="log-main">
            <div class="log-meta"><span class="log-chip">${escapeHtml(backup.title || '未命名画布')}</span></div>
            <div class="log-subline"><span>${new Date(backup.timestamp).toLocaleString()}</span><span>${backup.node_count || 0} 个节点</span><span>${backup.size > 1024 ? `${(backup.size / 1024).toFixed(1)} KB` : `${backup.size || 0} B`}</span></div>
        </div>
        <div class="backup-row-actions">
            <button class="preview-icon-btn" type="button" data-backup-restore="${escapeAttr(backup.filename)}" title="恢复"><i data-lucide="rotate-ccw"></i></button>
            <button class="preview-icon-btn" type="button" data-backup-delete="${escapeAttr(backup.filename)}" title="删除"><i data-lucide="trash-2"></i></button>
        </div>
    </div>`).join('') : '<div class="log-empty">暂无备份</div>';
    shell.insertAdjacentHTML('beforeend', `<div id="smartBackupModal" class="log-modal open" onclick="if(event.target===this) closeSmartCanvasBackups()">
        <div class="log-panel backup-panel">
            <div class="log-head"><div class="log-title">画布备份</div><button class="preview-icon-btn" type="button" onclick="closeSmartCanvasBackups()" title="关闭"><i data-lucide="x"></i></button></div>
            <button class="run-btn backup-create" type="button" onclick="createSmartCanvasBackup()"><i data-lucide="hard-drive"></i><span>立即备份</span></button>
            <div class="log-list">${rows}</div>
        </div>
    </div>`);
    const modal = document.getElementById('smartBackupModal');
    modal.querySelectorAll('[data-backup-restore]').forEach(button => button.onclick = async () => {
        if(isSmartCanvasLocked()) return toast('画布正在被其他人编辑，无法恢复备份');
        if(!confirm('恢复此备份？当前画布将被覆盖。')) return;
        try {
            // 先让已经发出的保存请求结束，避免旧请求在恢复后又把当前状态写回服务器。
            if(smartSaveInFlight) await smartSaveInFlight;
            clearTimeout(saveTimer);
            saveTimer = null;
            smartSaveAgain = false;
            const response = await window.CanvasApi.restoreCanvasBackup(canvasId, button.dataset.backupRestore);
            if(!response.ok){
                if(smartCanvasDirty) scheduleSave();
                return toast('恢复失败');
            }
            smartCanvasDirty = false;
            closeSmartCanvasBackups();
            selectedId = '';
            selectedIds = [];
            await loadCanvas();
            toast('备份已恢复');
        } catch(e) { toast(e.message || '恢复失败'); }
    });
    modal.querySelectorAll('[data-backup-delete]').forEach(button => button.onclick = async () => {
        try {
            const response = await window.CanvasApi.deleteCanvasBackup(canvasId, button.dataset.backupDelete);
            if(!response.ok) return toast('删除失败');
            await showSmartCanvasBackups();
        } catch(e) { toast(e.message || '删除失败'); }
    });
    refreshIcons();
}

function closeSmartCanvasBackups(){ document.getElementById('smartBackupModal')?.remove(); }

function scheduleSave(){
    // Loading/normalizing a read-only canvas is not a user edit. Keep any
    // existing dirty state after lease loss, but do not create a false draft.
    if(window.CanvasSession?.enabled && !window.MemberCanvasEdit?.canEdit) return;
    if(isSmartCanvasLocked()) return;
    smartCanvasDirty = true;
    window.MemberCanvasEdit?.markDirty();
    clearTimeout(saveTimer);
    if(smartSaveInFlight){
        smartSaveAgain = true;
        return;
    }
    saveTimer = setTimeout(() => {
        saveTimer = null;
        saveCanvas();
    }, 450);
}

async function saveCanvas(options={}){
    const force = options.force === true;
    // 成员模式检查保存权限，旧模式检查画布锁；强制保存也不能跳过此检查。
    if(!canvasId || !canvas || (window.CanvasSession?.enabled ? !window.MemberCanvasEdit?.canSave : isSmartCanvasLocked())){
        return false;
    }
    if(smartSaveInFlight){
        // 复用当前请求。强制保存需在它结束后继续检查是否还有未保存修改。
        smartSaveAgain = true;
        const result = await smartSaveInFlight;
        if(force && smartCanvasDirty && !isSmartCanvasLocked()) return saveCanvas(options);
        return result;
    }
    if(!force && !smartCanvasDirty) return true;

    const operation = (async () => {
        // 先将编辑面板草稿写回节点，再制作本次提交的数据和节点/连线集合。
        savePromptDraftForCurrent();
        nodes.forEach(node => {
            node.images = (node.images || []).map(img => mediaItemForStorage(stripImageGenerationMeta(img)));
            if(node.runSettings) node.runSettings = settingsForStorage(node.runSettings);
        });
        canvas.nodes = nodes;
        canvas.settings = settingsForStorage(canvasDefaultSmartSettings || initialSmartSettings);
        canvas.viewport = {...viewport};
        const storageCanvas = canvasForStorage();
        const savedNodeIds = new Set((storageCanvas.nodes || []).map(node => node?.id).filter(Boolean));
        const savedConnectionKeys = new Set((storageCanvas.connections || []).map(connection => `${connection?.from}->${connection?.to}:${connection?.kind || 'flow'}`));
        canvasSyncInFlight = true;
        try {
            const response = await window.CanvasApi.saveCanvas(canvasId, {
                title:storageCanvas.title || tr('smart.title'),
                icon:storageCanvas.icon || 'sparkles',
                nodes:storageCanvas.nodes || [],
                connections:storageCanvas.connections || [],
                viewport:storageCanvas.viewport || {x:0,y:0,scale:1},
                logs:storageCanvas.logs || [],
                task_result_version:canvas.task_result_version || 0,
                settings:storageCanvas.settings,
                base_updated_at:storageCanvas.updated_at || canvas.updated_at || 0,
                client_id:smartClientId
            });
            if(response.ok){
                const data = await response.json().catch(() => ({}));
                if(data.canvas && data.canvas.updated_at){
                    canvas.updated_at = data.canvas.updated_at;
                    if(window.CanvasSession?.enabled) canvas.revision = data.canvas.revision;
                    updateSmartCanvasNav();
                }
                // 响应只确认本次提交；请求期间若又编辑过，不能清除脏标记。
                if(!smartSaveAgain){
                    smartCanvasDirty = false;
                    smartServerNodeIds = savedNodeIds;
                    smartServerConnectionKeys = savedConnectionKeys;
                } else {
                    smartCanvasDirty = true;
                }
                smartSaveErrorNotified = false;
                return true;
            }
            if(window.CanvasSession?.enabled){
                // 成员模式保留未保存内容，不进入下方旧模式的冲突合并分支。
                smartCanvasDirty = true;
                smartSaveAgain = false;
                return false;
            }
            if(response.status === 409) {
                // 冲突：别人先保存了。合并对方的状态，再以最新 updated_at 重试。
                const data = await response.json().catch(() => ({}));
                const serverCanvas = data.detail?.canvas;
                if(serverCanvas){
                    applyMergedServerCanvas(serverCanvas);
                    nodes.forEach(node => {
                        node.images = (node.images || []).map(img => mediaItemForStorage(stripImageGenerationMeta(img)));
                        if(node.runSettings) node.runSettings = settingsForStorage(node.runSettings);
                    });
                    canvas.nodes = nodes;
                } else if(data.detail?.updated_at) {
                    canvas.updated_at = data.detail.updated_at;
                }
                smartCanvasDirty = true;
                smartSaveAgain = true;
                return false;
            }
            throw new Error(await responseErrorMessage(response, '画布保存失败'));
        } catch(e) {
            smartCanvasDirty = true;
            smartSaveAgain = true;
            if(!smartSaveErrorNotified){
                smartSaveErrorNotified = true;
                toast(e?.message || '画布保存失败，将自动重试');
            }
            return false;
        } finally {
            canvasSyncInFlight = false;
        }
    })();
    smartSaveInFlight = operation;
    try {
        return await operation;
    } finally {
        if(smartSaveInFlight === operation) smartSaveInFlight = null;
        // 请求结束后统一安排后续保存，每次执行仍会重新检查权限和锁。
        if((smartSaveAgain || smartCanvasDirty) && !isSmartCanvasLocked()){
            clearTimeout(saveTimer);
            smartSaveAgain = false;
            saveTimer = setTimeout(() => {
                saveTimer = null;
                saveCanvas();
            }, 300);
        }
    }
}

function imageMetaFromNode(node){
    return {};
}

function applyNodeMetaToImage(image, node){
    return stripImageGenerationMeta(image);
}

function inheritNodeMetaFromImage(node){
    if(!node) return;
    node.images = (node.images || []).map(img => stripImageGenerationMeta(img));
}

function createNode(x, y, images=[], options={}){
    if(!options.skipUndo) pushUndo();
    const nodeImages = (images || []).map(img => ({...img}));
    const node = {id:uid('smart'), type:'smart-image', x, y, title:nodeImages.length > 1 ? 'Group' : nodeImages.length ? 'Image' : tr('smart.createImportNode'), images:nodeImages, created_at:Date.now()};
    node.scale = nodeImages.length > 1 ? MEDIA_GROUP_DEFAULT_SCALE : mediaNodeDefaultScale(node);
    inheritNodeMetaFromImage(node);
    nodes.push(node);
    if(options.select !== false) selectedId = node.id;
    render();
    scheduleSave();
    return node;
}

function createPromptNode(x, y, options={}){
    if(!options.skipUndo) pushUndo();
    const providerId = resolveChatProviderId();
    const node = {
        id:uid('prompt'),
        type:'smart-prompt',
        x,
        y,
        w:316,
        h:194,
        title:'Prompt',
        text:'',
        llmEnabled:false,
        llmProvider:providerId,
        llmModel:resolveChatModel('', providerId),
        llmSystemEnabled:false,
        llmSystemPrompt:'You are a helpful prompt assistant.',
        llmInstruction:'',
        created_at:Date.now()
    };
    nodes.push(node);
    if(options.select !== false) selectedId = node.id;
    render();
    scheduleSave();
    return node;
}

function createLoopNode(x, y, options={}){
    if(!options.skipUndo) pushUndo();
    const node = {id:uid('loop'), type:'smart-loop', x, y, w:340, h:168, title:'Loop', count:1, mode:'serial', showPrompt:false, imageInput:false, loopStart:1, imageBatchSize:1, variablePrompt:'', created_at:Date.now()};
    nodes.push(node);
    if(options.select !== false) selectedId = node.id;
    render();
    scheduleSave();
    return node;
}

function cloneSmartNode(node, dx=0, dy=0){
    const copy = JSON.parse(JSON.stringify(node));
    copy.id = uid(
        node.type === 'smart-prompt'
            ? 'prompt'
            : node.type === 'smart-loop'
            ? 'loop'
            : 'smart'
    );
    copy.x = (Number(node.x) || 0) + dx;
    copy.y = (Number(node.y) || 0) + dy;
    copy.running = false;
    copy.pending = 0;
    delete copy.runStartedAt;
    delete copy.runFinishedAt;
    delete copy.runElapsedMs;
    delete copy.runTimerHidden;
    return copy;
}

function copySelectedNodes(){
    if(!canvas || isEditableTarget(document.activeElement)) return;
    const ids = selectedNodeIds();
    const copiedNodes = ids.map(id => nodes.find(n => n.id === id)).filter(Boolean);
    if(!copiedNodes.length) return;
    const idSet = new Set(copiedNodes.map(n => n.id));
    const copiedConnections = (canvas.connections || []).filter(c => idSet.has(c.from) && idSet.has(c.to));
    nodeClipboard = {
        nodes:JSON.parse(JSON.stringify(copiedNodes)),
        connections:JSON.parse(JSON.stringify(copiedConnections))
    };
    toast(`已复制 ${copiedNodes.length} 个节点`);
}

function pasteNodes(){
    if(!canvas || !nodeClipboard?.nodes?.length || isEditableTarget(document.activeElement)) return;
    lastNodePasteAt = Date.now();
    pushUndo();
    const sourceNodes = nodeClipboard.nodes;
    const xs = sourceNodes.map(n => Number(n.x) || 0);
    const ys = sourceNodes.map(n => Number(n.y) || 0);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const p = lastMouseWorld || viewportCenter();
    const dx = p.x - cx;
    const dy = p.y - cy;
    const idMap = new Map();
    const copies = sourceNodes.map(n => {
        const copy = cloneSmartNode(n, dx, dy);
        idMap.set(n.id, copy.id);
        return copy;
    });
    copies.forEach(copy => {
        if(Array.isArray(copy.inputNodeIds)){
            copy.inputNodeIds = copy.inputNodeIds.map(id => idMap.get(id)).filter(Boolean);
        }
        if(copy.sourceNodeId) copy.sourceNodeId = idMap.get(copy.sourceNodeId) || '';
    });
    const newConnections = (nodeClipboard.connections || []).map(conn => ({
        ...conn,
        from:idMap.get(conn.from),
        to:idMap.get(conn.to)
    })).filter(conn => conn.from && conn.to && conn.from !== conn.to);
    canvas.connections = [...(canvas.connections || []), ...newConnections];
    nodes.push(...copies);
    selectedId = copies.length === 1 ? copies[0].id : '';
    selectedIds = copies.length > 1 ? copies.map(n => n.id) : [];
    selectedImage = {nodeId:'', index:-1};
    render();
    scheduleSave();
}

function duplicateForAltDrag(node){
    const ids = (isNodeSelected(node.id) ? selectedNodeIds() : [node.id]);
    const sourceNodes = ids.map(id => nodes.find(n => n.id === id)).filter(Boolean);
    if(!sourceNodes.length) return node;
    pushUndo();
    const idMap = new Map();
    const copies = sourceNodes.map(n => {
        const copy = cloneSmartNode(n, 0, 0);
        idMap.set(n.id, copy.id);
        return copy;
    });
    copies.forEach(copy => {
        if(Array.isArray(copy.inputNodeIds)) copy.inputNodeIds = copy.inputNodeIds.map(id => idMap.get(id)).filter(Boolean);
        if(copy.sourceNodeId) copy.sourceNodeId = idMap.get(copy.sourceNodeId) || '';
    });
    const idSet = new Set(sourceNodes.map(n => n.id));
    const copiedConnections = (canvas.connections || []).filter(c => idSet.has(c.from) && idSet.has(c.to));
    const newConnections = copiedConnections.map(conn => ({...conn, from:idMap.get(conn.from), to:idMap.get(conn.to)})).filter(conn => conn.from && conn.to && conn.from !== conn.to);
    canvas.connections = [...(canvas.connections || []), ...newConnections];
    nodes.push(...copies);
    selectedId = '';
    selectedIds = [];
    selectedImage = {nodeId:'', index:-1};
    const dragCopy = copies.find(c => c.id === idMap.get(node.id)) || copies[0];
    render();
    scheduleSave();
    return dragCopy;
}

function duplicateSmartNodeMediaToCanvas(node, imageIndex){
    const source = node?.images?.[imageIndex];
    const item = imageForDisplay(source);
    if(!node || !item?.url){ toast('没有可导出到画布的素材'); return; }
    pushUndo();
    const rect = nodeRect(node);
    const point = {x:rect.x + rect.width + 220, y:rect.y + rect.height / 2};
    const copy = {...item};
    const newNode = createImageNodeAt(point, [copy], {select:true, skipUndo:true});
    selectedIds = [];
    selectedImage = {nodeId:newNode.id, index:0};
    render();
    scheduleSave();
    toast('已添加到画布');
}

function deleteNode(id){
    deleteSmartNodes([id]);
}

function deleteSmartNodes(ids){
    const requested = new Set(ids.filter(Boolean));
    const deleteIds = new Set(nodes.filter(node => requested.has(node.id)).map(node => node.id));
    if(!deleteIds.size) return;
    pushUndo();
    nodes.forEach(node => {
        if(isHistoryGroupNode(node) && requested.has(node.historyFor)) deleteIds.add(node.id);
    });
    // Capture dependants BEFORE removing the edges that identify them.
    const affected = smartAffectedNodeIds([...deleteIds]);
    nodes = nodes.filter(node => !deleteIds.has(node.id));
    if(canvas) canvas.connections = (canvas.connections || []).filter(c => !deleteIds.has(c.from) && !deleteIds.has(c.to));
    nodes.forEach(node => {
        if(Array.isArray(node.inputNodeIds) && node.inputNodeIds.some(inputId => deleteIds.has(inputId))){
            node.inputNodeIds = node.inputNodeIds.filter(inputId => !deleteIds.has(inputId));
            affected.add(node.id);
        }
    });
    if(deleteIds.has(selectedId)) selectedId = '';
    selectedIds = selectedIds.filter(selected => !deleteIds.has(selected));
    if(deleteIds.has(selectedImage.nodeId)) selectedImage = {nodeId:'', index:-1};
    finishSmartNodeRemoval(deleteIds, affected);
    scheduleSave();
}

function finishSmartNodeRemoval(deleteIds, affected, forceIds=[]){
    deleteIds.forEach(id => {
        const el = world.querySelector(`.image-node[data-id="${CSS.escape(id)}"]`);
        if(!el) return;
        releaseSmartGroupPreviews(el);
        el.querySelectorAll('video,audio').forEach(media => {
            media.pause(); media.removeAttribute('src'); media.load();
        });
        el.remove();
    });
    if(deleteIds.has(previewNavState?.nodeId) && imageEditModal.classList.contains('open')) closeImageEditor();
    if(deleteIds.has(smartAudioLightboxState?.nodeId) && smartAudioLightbox.classList.contains('open')) closeSmartAudioLightbox();
    const remaining = [...affected].filter(id => !deleteIds.has(id));
    refreshSmartNodes(remaining, {forceIds});
    // A disconnected explicit mention can live outside the graph's downstream scope.
    if(!smartAffectedNodeIds(remaining).has(selectedId)) updateComposer();
    syncSelectionUi();
    refreshConnectionLayer();
    // The immediate topology sync must not discard the layout correction for refreshed nodes.
    if(remaining.length) scheduleSmartGeometryRefresh(remaining, 2);
    if(smartWorkflowTransferModal?.classList.contains('open')) updateSmartWorkflowTransferMeta();
}

function clearNodeMediaBeforeDelete(id){
    const node = nodes.find(n => n.id === id);
    if(!node || (node.type && node.type !== 'smart-image')) return false;
    const hadMedia = Boolean((node.images || []).length || node.pending);
    if(!hadMedia) return false;
    pushUndo();
    const historyIds = nodes.filter(n => isHistoryGroupNode(n) && n.historyFor === id).map(n => n.id);
    const affected = smartAffectedNodeIds([id, ...historyIds]);
    const deleteIds = new Set();
    node.images = [];
    node.pending = 0;
    node.running = false;
    node.title = tr('smart.createImportNode');
    delete node.w;
    delete node.h;
    const history = historyGroupForNode(node);
    if(history){
        deleteIds.add(history.id);
        nodes = nodes.filter(n => n.id !== history.id);
        if(canvas) canvas.connections = (canvas.connections || []).filter(c => c.from !== history.id && c.to !== history.id);
        nodes.forEach(n => {
            if(Array.isArray(n.inputNodeIds) && n.inputNodeIds.includes(history.id)){
                n.inputNodeIds = n.inputNodeIds.filter(inputId => inputId !== history.id);
                affected.add(n.id);
            }
        });
    }
    if(selectedImage.nodeId === id) selectedImage = {nodeId:'', index:-1};
    selectedId = id;
    selectedIds = [];
    // Clearing the source also invalidates any open preview of its former media.
    if(previewNavState?.nodeId === id && imageEditModal.classList.contains('open')) closeImageEditor();
    if(smartAudioLightboxState?.nodeId === id && smartAudioLightbox.classList.contains('open')) closeSmartAudioLightbox();
    finishSmartNodeRemoval(deleteIds, affected, [id]);
    scheduleSave();
    return true;
}

function deleteNodeFromButton(id){
    if(clearNodeMediaBeforeDelete(id)) return;
    deleteNode(id);
}

function disconnectConnection(index){
    if(isSmartCanvasLocked()) return;
    if(!canvas || !Array.isArray(canvas.connections)) return;
    const conn = canvas.connections[index];
    if(!conn) return;
    pushUndo();
    canvas.connections.splice(index, 1);
    const toNode = nodes.find(n => n.id === conn.to);
    if(toNode && Array.isArray(toNode.inputNodeIds)){
        toNode.inputNodeIds = toNode.inputNodeIds.filter(id => id !== conn.from);
    }
    if(toNode && ['input','flow'].includes(conn.kind || 'flow')) clearDetachedRunInputRefs(toNode);
    if((conn.kind || 'flow') === 'history'){
        const group = nodes.find(n => n.id === conn.to && isHistoryGroupNode(n) && n.historyFor === conn.from);
        demoteHistoryGroupNode(group);
    }
    render();
    scheduleSave();
}

function insertLoopNodeIntoConnection(loopNode, hit){
    if(!loopNode || loopNode.type !== 'smart-loop' || !hit?.conn) return false;
    const conn = hit.conn;
    const kind = conn.kind || 'flow';
    canvas.connections = (canvas.connections || []).filter((c, index) => index !== hit.index);
    nodes.forEach(n => {
        if(Array.isArray(n.inputNodeIds)) n.inputNodeIds = n.inputNodeIds.filter(id => !(n.id === conn.to && id === conn.from));
    });
    addConnection(conn.from, loopNode.id, kind === 'flow' ? 'flow' : 'input');
    connectInputNode(loopNode.id, conn.to);
    return true;
}

function deleteImage(id, imageIndex){
    const node = nodes.find(n => n.id === id);
    if(!node || imageIndex < 0) return;
    pushUndo();
    node.images = (node.images || []).filter((_, index) => index !== imageIndex);
    if(node.images.length <= 1) node.title = 'Image';
    if(selectedImage.nodeId === id) selectedImage = {nodeId:id, index:Math.min(selectedImage.index, node.images.length - 1)};
    if(selectedImage.index < 0) selectedImage = {nodeId:'', index:-1};
    render();
    scheduleSave();
}

function stripImageGenerationMeta(img){
    if(!img) return img;
    delete img.runPrompt;
    delete img.runModelPrompt;
    delete img.runSettings;
    delete img.sourceNodeId;
    delete img.runAt;
    delete img.promptDraftHtml;
    delete img.promptDraftText;
    return img;
}

function addConnection(fromId, toId, kind='flow'){
    if(!fromId || !toId || fromId === toId) return;
    canvas.connections = canvas.connections || [];
    if(canvas.connections.some(c => c.from === fromId && c.to === toId && (c.kind || 'flow') === kind)) return;
    canvas.connections.push({from:fromId, to:toId, kind});
}

function connectInputNode(fromId, toId){
    const from = nodes.find(n => n.id === fromId);
    const to = nodes.find(n => n.id === toId);
    if(!from || !to || from.id === to.id) return false;
    if(to.type === 'smart-loop'){
        const looksImage = isSmartImageNode(from) || (from.type === 'smart-loop' && from.imageInput);
        const looksPrompt = from.type === 'smart-prompt' || (from.type === 'smart-loop' && from.showPrompt);
        if(looksImage && !to.imageInput) to.imageInput = true;
        if(looksPrompt && !to.showPrompt) to.showPrompt = true;
        if(looksImage || looksPrompt) fitSmartLoopNode(to);
        const canImage = Boolean(to.imageInput) && looksImage;
        const canPrompt = Boolean(to.showPrompt) && looksPrompt;
        if(!canImage && !canPrompt) return false;
    }
    to.inputNodeIds = Array.from(new Set([...(to.inputNodeIds || []), from.id]));
    addConnection(from.id, to.id, 'input');
    return true;
}

function clearDetachedRunInputRefs(node){
    if(!node) return;
    const hasUpstream = Boolean((canvas?.connections || []).some(conn => conn.to === node.id && ['input','flow'].includes(conn.kind || 'flow')));
    if(hasUpstream || (!canvasUsesConnections && Array.isArray(node.inputNodeIds) && node.inputNodeIds.some(id => nodes.some(n => n.id === id)))) return;
    delete node.runInputRefs;
    delete node.runPromptRefs;
    delete node.sourceNodeId;
}

function cleanupDetachedRunInputRefs(){
    if(!canvasUsesConnections) return false;
    let changed = false;
    nodes.forEach(node => {
        const hadRefs = Array.isArray(node?.runInputRefs) && node.runInputRefs.length;
        const hadPromptRefs = Array.isArray(node?.runPromptRefs) && node.runPromptRefs.length;
        const hadSource = Boolean(node?.sourceNodeId);
        clearDetachedRunInputRefs(node);
        if(hadRefs !== (Array.isArray(node?.runInputRefs) && node.runInputRefs.length)
            || hadPromptRefs !== (Array.isArray(node?.runPromptRefs) && node.runPromptRefs.length)
            || hadSource !== Boolean(node?.sourceNodeId)){
            changed = true;
        }
    });
    return changed;
}

function lineConnectionsFor(node){
    if(!node) return [];
    return (canvas?.connections || []).filter(conn => {
        if(!conn?.from || !conn?.to || conn.from === conn.to) return false;
        return ['input', 'flow'].includes(conn.kind || 'flow');
    });
}

function connectedLineNodeIds(node){
    if(!node) return [];
    const conns = lineConnectionsFor(node);
    const upstream = [];
    const downstream = [];
    const seenUp = new Set([node.id]);
    const seenDown = new Set([node.id]);
    const walkUp = id => {
        conns.filter(conn => conn.to === id).forEach(conn => {
            if(seenUp.has(conn.from)) return;
            seenUp.add(conn.from);
            walkUp(conn.from);
            upstream.push(conn.from);
        });
    };
    const walkDown = id => {
        conns.filter(conn => conn.from === id).forEach(conn => {
            if(seenDown.has(conn.to)) return;
            seenDown.add(conn.to);
            downstream.push(conn.to);
            walkDown(conn.to);
        });
    };
    walkUp(node.id);
    walkDown(node.id);
    return [...upstream, node.id, ...downstream];
}

function upstreamLineNodeIds(node){
    if(!node) return [];
    const conns = lineConnectionsFor(node);
    const upstream = [];
    const seen = new Set([node.id]);
    const walk = id => {
        conns.filter(conn => conn.to === id).forEach(conn => {
            if(seen.has(conn.from)) return;
            seen.add(conn.from);
            walk(conn.from);
            upstream.push(conn.from);
        });
    };
    walk(node.id);
    return [...upstream, node.id];
}

function groupSelectedNodes(){
    const ids = selectedIds.length ? selectedIds.slice() : (selectedId ? [selectedId] : []);
    const selected = ids.map(id => nodes.find(n => n.id === id)).filter(n => n && (n.images || []).length);
    if(selected.length < 2){ toast(tr('smart.toastNeedGroup')); return; }
    pushUndo();
    const rects = selected.map(nodeRect);
    const x = Math.min(...rects.map(r => r.x));
    const y = Math.min(...rects.map(r => r.y));
    const images = selected.flatMap(node => (node.images || []).map(img => applyNodeMetaToImage({...img}, node)));
    const group = {id:uid('smart'), type:'smart-image', x, y, title:'Group', images, scale:MEDIA_GROUP_DEFAULT_SCALE, created_at:Date.now()};
    nodes = nodes.filter(n => !ids.includes(n.id));
    nodes.push(group);
    canvas.connections = (canvas.connections || []).map(conn => ({
        ...conn,
        from:ids.includes(conn.from) ? group.id : conn.from,
        to:ids.includes(conn.to) ? group.id : conn.to
    })).filter((conn, index, arr) => conn.from !== conn.to && arr.findIndex(c => c.from === conn.from && c.to === conn.to && (c.kind || 'flow') === (conn.kind || 'flow')) === index);
    selectedIds = [];
    selectedId = group.id;
    selectedImage = {nodeId:'', index:-1};
    render();
    scheduleSave();
}

function ungroupNode(groupId){
    const group = nodes.find(n => n.id === groupId);
    if(!group || !Array.isArray(group.images) || group.images.length < 2) return false;
    pushUndo();
    const layout = imageLayout(group.images || [], nodeScale(group), group);
    const pad = 16;
    const gap = 8;
    const cell = Math.max(28, Math.round(layout.thumb || 96));
    const created = (group.images || []).map((img, index) => {
        const col = index % Math.max(1, layout.cols || 1);
        const row = Math.floor(index / Math.max(1, layout.cols || 1));
        const size = thumbDisplaySize(img, cell);
        const x = Math.round(Number(group.x || 0) + pad + col * (cell + gap) + Math.max(0, (cell - size.width) / 2));
        const y = Math.round(Number(group.y || 0) + pad + row * (cell + gap) + Math.max(0, (cell - size.height) / 2));
        const node = {
            id:uid('smart'),
            type:'smart-image',
            x,
            y,
            w:size.width,
            h:size.height,
            title:'Image',
            images:[stripImageGenerationMeta({...img})],
            scale:MEDIA_NODE_DEFAULT_SCALE,
            created_at:Date.now()
        };
        inheritNodeMetaFromImage(node);
        clearDetachedRunInputRefs(node);
        return node;
    });
    nodes = nodes.filter(n => n.id !== groupId);
    nodes.push(...created);
    if(canvas) canvas.connections = (canvas.connections || []).filter(c => c.from !== groupId && c.to !== groupId);
    nodes.forEach(node => {
        if(Array.isArray(node.inputNodeIds)){
            node.inputNodeIds = node.inputNodeIds.filter(inputId => inputId !== groupId);
        }
    });
    selectedIds = created.map(node => node.id);
    selectedId = selectedIds.length === 1 ? selectedIds[0] : '';
    selectedImage = {nodeId:'', index:-1};
    render();
    scheduleSave();
    return true;
}

function mergeImageNodesIntoGroup(sourceId, targetId){
    const source = nodes.find(n => n.id === sourceId);
    const target = nodes.find(n => n.id === targetId);
    if(!source || !target || source.id === target.id) return false;
    if(!(source.images || []).length || !(target.images || []).length) return false;
    const sourceImages = (source.images || []).map(img => stripImageGenerationMeta({...img}));
    target.images = [...(target.images || []).map(img => stripImageGenerationMeta(img)), ...sourceImages];
    target.title = 'Group';
    if(!Number.isFinite(Number(target.scale)) || Number(target.scale) === MEDIA_NODE_DEFAULT_SCALE) target.scale = MEDIA_GROUP_DEFAULT_SCALE;
    delete target.w;
    delete target.h;
    canvas.connections = (canvas.connections || []).map(c => {
        if(c.from === source.id) return {...c, from:target.id};
        if(c.to === source.id) return {...c, to:target.id};
        return c;
    }).filter((c, index, arr) => c.from !== c.to && arr.findIndex(x => x.from === c.from && x.to === c.to && (x.kind || 'flow') === (c.kind || 'flow')) === index);
    nodes.forEach(node => {
        if(Array.isArray(node.inputNodeIds)){
            node.inputNodeIds = Array.from(new Set(node.inputNodeIds.map(id => id === source.id ? target.id : id).filter(id => id !== node.id)));
        }
    });
    nodes = nodes.filter(n => n.id !== source.id);
    selectedIds = [];
    selectedId = target.id;
    selectedImage = {nodeId:'', index:-1};
    return true;
}

// Called once by smart-canvas.js, at its original initialization position.
function bindSmartWorkflowTransferEvents(){
    if(smartWorkflowToggle) smartWorkflowToggle.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        if(smartWorkflowTransferModal?.classList.contains('open')) closeSmartWorkflowTransferModal();
        else openSmartWorkflowTransferModal();
    };
    smartWorkflowImportInput?.addEventListener('change', event => {
        const file = event.target.files?.[0];
        if(file) importSmartWorkflowFile(file);
        event.target.value = '';
    });
    smartWorkflowImportDropZone?.addEventListener('click', () => smartWorkflowImportInput?.click());
    smartWorkflowImportDropZone?.addEventListener('dragenter', event => {
        event.preventDefault();
        event.stopPropagation();
        smartWorkflowImportDropZone.classList.add('drag-over');
    });
    smartWorkflowImportDropZone?.addEventListener('dragover', event => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
        smartWorkflowImportDropZone.classList.add('drag-over');
    });
    smartWorkflowImportDropZone?.addEventListener('dragleave', event => {
        event.preventDefault();
        event.stopPropagation();
        if(!smartWorkflowImportDropZone.contains(event.relatedTarget)) smartWorkflowImportDropZone.classList.remove('drag-over');
    });
    smartWorkflowImportDropZone?.addEventListener('drop', event => {
        event.preventDefault();
        event.stopPropagation();
        smartWorkflowImportDropZone.classList.remove('drag-over');
        const file = [...(event.dataTransfer?.files || [])].find(item => /\.(json|zip)$/i.test(item.name || ''));
        if(file) importSmartWorkflowFile(file);
        else toast('请拖入 JSON 或 ZIP 工作流文件');
    });
    smartWorkflowTransferModal?.addEventListener('pointerdown', e => e.stopPropagation());
    smartWorkflowTransferModal?.addEventListener('mousedown', e => e.stopPropagation());
    smartWorkflowTransferModal?.addEventListener('click', e => e.stopPropagation());
    smartWorkflowTransferModal?.addEventListener('wheel', event => {
        event.stopPropagation();
    }, {passive:true, capture:true});
    smartWorkflowTransferModal?.addEventListener('dragover', event => {
        event.preventDefault();
        event.stopPropagation();
        if(smartWorkflowImportDropZone){
            event.dataTransfer.dropEffect = 'copy';
            smartWorkflowImportDropZone.classList.add('drag-over');
        }
    });
    smartWorkflowTransferModal?.addEventListener('dragleave', event => {
        event.preventDefault();
        event.stopPropagation();
        if(!smartWorkflowTransferModal.contains(event.relatedTarget)) smartWorkflowImportDropZone?.classList.remove('drag-over');
    });
    smartWorkflowTransferModal?.addEventListener('drop', event => {
        event.preventDefault();
        event.stopPropagation();
        smartWorkflowImportDropZone?.classList.remove('drag-over');
        const file = [...(event.dataTransfer?.files || [])].find(item => /\.(json|zip)$/i.test(item.name || ''));
        if(file) importSmartWorkflowFile(file);
        else toast('请拖入 JSON 或 ZIP 工作流文件');
    });
}
