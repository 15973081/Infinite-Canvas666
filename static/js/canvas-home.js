/* Independent canvas directory: owns catalog state and UI, never an editor document. */
(() => {
'use strict';
const canvasGate = document.getElementById('canvasGate');
const gateStatus = document.getElementById('gateStatus');
const gateCreateBtn = document.getElementById('gateCreateBtn');
const gateCreateSmartBtn = document.getElementById('gateCreateSmartBtn');
const gateRefreshBtn = document.getElementById('gateRefreshBtn');
const gateBackBtn = document.getElementById('gateBackBtn');
const gateTrashBtn = document.getElementById('gateTrashBtn');
const gateAssetManagerBtn = document.getElementById('gateAssetManagerBtn');
const gateTrashCount = document.getElementById('gateTrashCount');
const gateTitleText = document.getElementById('gateTitleText');
const gateSubtitle = document.getElementById('gateSubtitle');
const gateCanvasList = document.getElementById('gateCanvasList');
const gateSearch = document.getElementById('gateSearch');
const gateSearchInput = document.getElementById('gateSearchInput');
const gateSearchClear = document.getElementById('gateSearchClear');
const gateFolderTree = document.getElementById('gateFolderTree');
const gateFolderBar = document.getElementById('gateFolderBar');
const gateNewFolderBtn = document.getElementById('gateNewFolderBtn');
let canvases = [];
let deletedCanvases = [];
let canvasFolders = [];
let activeFolderId = 'all';
let canvasSearchQuery = '';
let creatingCanvas = false;
let createCanvasKind = 'classic';
let trashMode = false;
let pendingDeleteCanvasId = null;
let pendingPurgeCanvasId = null;
let movingCanvasId = null;
let emojiPickerCanvasId = null;
let canvasMetaAnchorId = '';
let canvasSortMode = (() => { try { return localStorage.getItem('canvasSortMode') || 'recent'; } catch(e){ return 'recent'; } })();
const CANVAS_COLOR_OPTIONS = ['red','orange','amber','green','teal','blue','violet','pink','slate'];
const CANVAS_EMOJIS = ['layers','sparkles','image','palette','wand-2','star','heart','rocket','flame','moon','cloud','leaf','gem','compass','pin','flag','bookmark','crown'];

function refreshIcons(){window.lucide?.createIcons();}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const escapeAttr=escapeHtml;
function setStatus(message){gateStatus.textContent=message;const feedback=document.getElementById('studioHomeFeedback');feedback.textContent=message;feedback.hidden=!message;}
function formatCanvasTime(value){
    if(!value) return '--';
    const raw = Number(value);
    const time = raw < 10000000000 ? raw * 1000 : raw;
    const date = new Date(time);
    if(Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
}
function renderCanvasIcon(icon, size = 14) {
    // 旧的默认 emoji 或空值都映射为 layers
    if(!icon || icon === '🧩') return `<i data-lucide="layers" style="width:${size}px;height:${size}px"></i>`;
    // 含非 ASCII 字符（用户旧选过的 emoji）继续按文本渲染
    if(/[^\x00-\x7F]/.test(icon)) return escapeHtml(icon);
    return `<i data-lucide="${escapeHtml(icon)}" style="width:${size}px;height:${size}px"></i>`;
}
function normalizeCanvasFolderId(value){
    return window.CanvasDirectoryModel.normalizeFolderId(value);
}

function canvasGateModel(){
    return window.CanvasDirectoryModel.build({canvases, deletedCanvases, folders:canvasFolders,
        trashMode, folderId:activeFolderId, query:canvasSearchQuery});
}

function canvasFolderLabel(folderId){
    return window.CanvasDirectoryModel.folderLabel(canvasFolders, folderId);
}

function canvasFolderChildren(parentId=''){
    return window.CanvasDirectoryModel.folderChildren(canvasFolders, parentId);
}

function canvasFolderDepth(folderId){
    return window.CanvasDirectoryModel.folderDepth(canvasFolders, folderId);
}

function countCanvasesInFolder(folderId){
    return window.CanvasDirectoryModel.countInFolder(canvases, folderId);
}

function visibleCanvasItems(){
    return window.CanvasDirectoryModel.visibleItems({canvases, deletedCanvases,
        trashMode, folderId:activeFolderId, query:canvasSearchQuery});
}

function folderTargetForCreate(){
    return activeFolderId && activeFolderId !== 'all' ? normalizeCanvasFolderId(activeFolderId) : '';
}

function renderFolderNode(folder, depth=0, model=canvasGateModel()){
    const count = model.count(folder.id);
    const row = document.createElement('div');
    row.className = `gate-folder-node ${activeFolderId === folder.id ? 'active' : ''}`;
    row.dataset.folderId = folder.id;
    row.style.setProperty('--depth', depth);
    row.innerHTML = `
        <button class="gate-folder-main" type="button" title="${escapeAttr(folder.name)}">
            <i data-lucide="folder" class="w-3.5 h-3.5"></i>
            <span class="gate-folder-name">${escapeHtml(folder.name)}</span>
            <span class="gate-folder-count">${count}</span>
        </button>
        <div class="gate-folder-actions">
            <button class="gate-folder-action" type="button" data-folder-action="child" title="新建子文件夹"><i data-lucide="folder-plus" class="w-3 h-3"></i></button>
            <button class="gate-folder-action" type="button" data-folder-action="rename" title="重命名"><i data-lucide="pencil" class="w-3 h-3"></i></button>
            <button class="gate-folder-action" type="button" data-folder-action="delete" title="删除文件夹"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
        </div>
    `;
    row.querySelector('.gate-folder-main').onclick = () => setActiveFolder(folder.id);
    row.querySelector('[data-folder-action="child"]').onclick = e => { e.stopPropagation(); createCanvasFolder(folder.id); };
    row.querySelector('[data-folder-action="rename"]').onclick = e => { e.stopPropagation(); renameCanvasFolder(folder.id); };
    row.querySelector('[data-folder-action="delete"]').onclick = e => { e.stopPropagation(); deleteCanvasFolder(folder.id); };
    row.addEventListener('dragover', e => {
        if(!Array.from(e.dataTransfer?.types || []).includes('text/canvas-id')) return;
        e.preventDefault();
        row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', e => {
        const canvasId = e.dataTransfer?.getData('text/canvas-id');
        row.classList.remove('drag-over');
        if(canvasId) moveCanvasToFolder(canvasId, folder.id);
    });
    const wrap = document.createDocumentFragment();
    wrap.appendChild(row);
    model.children(folder.id).forEach(child => wrap.appendChild(renderFolderNode(child, depth + 1, model)));
    return wrap;
}

function renderFolderTree(model=canvasGateModel()){
    if(!gateFolderTree) return;
    gateFolderTree.innerHTML = '';
    const special = [
        {id:'all', name:'全部画布', icon:'layout-grid', count:model.count('all')},
        {id:'', name:'未分类', icon:'inbox', count:model.count('')},
    ];
    special.forEach(item => {
        const row = document.createElement('div');
        row.className = `gate-folder-node gate-folder-special ${activeFolderId === item.id ? 'active' : ''}`;
        row.dataset.folderId = item.id;
        row.innerHTML = `
            <button class="gate-folder-main" type="button">
                <i data-lucide="${item.icon}" class="w-3.5 h-3.5"></i>
                <span class="gate-folder-name">${escapeHtml(item.name)}</span>
                <span class="gate-folder-count">${item.count}</span>
            </button>
        `;
        row.querySelector('.gate-folder-main').onclick = () => setActiveFolder(item.id);
        row.addEventListener('dragover', e => {
            if(!Array.from(e.dataTransfer?.types || []).includes('text/canvas-id')) return;
            e.preventDefault();
            row.classList.add('drag-over');
        });
        row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
        row.addEventListener('drop', e => {
            const canvasId = e.dataTransfer?.getData('text/canvas-id');
            row.classList.remove('drag-over');
            if(canvasId) moveCanvasToFolder(canvasId, item.id === 'all' ? '' : item.id);
        });
        gateFolderTree.appendChild(row);
    });
    const sep = document.createElement('div');
    sep.className = 'gate-folder-separator';
    gateFolderTree.appendChild(sep);
    model.children('').forEach(folder => gateFolderTree.appendChild(renderFolderNode(folder, 0, model)));
    if(gateFolderBar){
        gateFolderBar.innerHTML = `
            <div class="gate-folder-current">
                <i data-lucide="${activeFolderId === 'all' ? 'layout-grid' : (activeFolderId ? 'folder' : 'inbox')}" class="w-3.5 h-3.5"></i>
                <span>${escapeHtml(model.folderLabel(activeFolderId))}</span>
            </div>
            <span class="gate-folder-current-count">${model.items.length}</span>
        `;
    }
    refreshIcons();
}

function setActiveFolder(folderId){
    activeFolderId = folderId === 'all' ? 'all' : normalizeCanvasFolderId(folderId);
    movingCanvasId = null;
    closeCanvasMetaPopover();
    const model = canvasGateModel();
    renderFolderTree(model);
    renderCanvasList(model);
    refreshGateViewControls(model);
}

function createCanvasFolder(parentId=''){
    window.CanvasNameDialog.open({title:'新建文件夹', label:'文件夹名称', placeholder:'例如：品牌设计', confirm:'创建', description:'将相关画布收纳在一起，方便查找。', onSubmit:async name => {
        const data = await window.CanvasDirectoryApi.createCanvasFolder({name, parent_id:normalizeCanvasFolderId(parentId)});
        canvasFolders = data.folders || canvasFolders;
        activeFolderId = data.folder?.id || activeFolderId;
        renderFolderTree(); renderCanvasList(); refreshGateViewControls();
    }});
}

function renameCanvasFolder(folderId){
    const folder = canvasFolders.find(item => item.id === folderId);
    if(!folder) return;
    window.CanvasNameDialog.open({title:'重命名文件夹', label:'文件夹名称', value:folder.name, description:'修改名称不会影响文件夹中的画布。', onSubmit:async name => {
        if(name === folder.name) return;
        const data = await window.CanvasDirectoryApi.updateCanvasFolder(folderId, {name});
        canvasFolders = data.folders || canvasFolders;
        renderFolderTree();
    }});
}

async function deleteCanvasFolder(folderId){
    const folder = canvasFolders.find(item => item.id === folderId);
    if(!folder) return;
    if(!confirm('删除该文件夹？其中的画布和子文件夹会移动到上一级。')) return;
    try {
        const parentId = normalizeCanvasFolderId(folder.parent_id);
        const data = await window.CanvasDirectoryApi.deleteCanvasFolder(folderId);
        canvasFolders = data.folders || canvasFolders.filter(item => item.id !== folderId);
        canvases.forEach(item => {
            if(normalizeCanvasFolderId(item.folder_id) === folderId) item.folder_id = parentId;
        });
        if(activeFolderId === folderId) activeFolderId = parentId || '';
        renderFolderTree();
        renderCanvasList();
        refreshGateViewControls();
    } catch(e) {
        setStatus('删除文件夹失败');
        console.error(e);
    }
}

function toggleMoveCanvasMenu(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    movingCanvasId = movingCanvasId === id ? null : id;
    closeCanvasMetaPopover();
    renderCanvasList();
}

function canvasMoveMenuHtml(item){
    if(movingCanvasId !== item.id || trashMode) return '';
    const entries = [
        {id:'', name:'未分类', depth:0, icon:'inbox'},
        ...canvasFolders.map(folder => ({id:folder.id, name:folder.name, depth:canvasFolderDepth(folder.id), icon:'folder'})),
    ];
    return `
        <div class="canvas-folder-menu">
            ${entries.map(entry => `
                <button type="button" data-move-folder="${escapeAttr(entry.id)}" class="${normalizeCanvasFolderId(item.folder_id) === entry.id ? 'active' : ''}" style="--depth:${entry.depth || 0}">
                    <i data-lucide="${entry.icon}" class="w-3 h-3"></i>
                    <span>${escapeHtml(entry.name)}</span>
                </button>
            `).join('')}
        </div>
    `;
}

async function moveCanvasToFolder(id, folderId){
    const target = normalizeCanvasFolderId(folderId);
    const item = canvases.find(entry => entry.id === id);
    const prev = item ? normalizeCanvasFolderId(item.folder_id) : '';
    if(item) item.folder_id = target;
    movingCanvasId = null;
    renderFolderTree();
    renderCanvasList();
    refreshGateViewControls();
    try {
        const data = await window.CanvasDirectoryApi.moveCanvasToFolder(id, target);
        if(data.canvas) updateCanvasListRecord(data.canvas);
    } catch(e) {
        if(item) item.folder_id = prev;
        console.error(e);
        await loadCanvasList(false);
        setStatus(e?.message || '移动画布失败');
    }
}

function refreshGateViewControls(model=canvasGateModel()){
    canvasGate.classList.toggle('trash-mode', trashMode);
    if(gateTitleText) gateTitleText.textContent = trashMode ? '回收站' : '全部画布';
    if(gateSubtitle) gateSubtitle.textContent = trashMode ? '已删除画布可恢复，30 天后自动清理。' : '打开已有画布，或新建一个开始创作。';
    const trashCount = deletedCanvases.length;
    if(gateTrashCount){
        gateTrashCount.textContent = String(trashCount);
        gateTrashCount.classList.toggle('visible', trashCount > 0);
    }
    const countPill = document.getElementById('gateCountPill');
    if(countPill){
        const items = model.items;
        const suffix = '个';
        countPill.textContent = suffix ? `${items.length} ${suffix}` : String(items.length);
    }
    const sortSwitch = document.getElementById('gateSortSwitch');
    if(sortSwitch){
        sortSwitch.classList.toggle('hidden', trashMode);
        sortSwitch.querySelectorAll('[data-sort]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sort === canvasSortMode);
            btn.setAttribute('aria-pressed', String(btn.dataset.sort === canvasSortMode));
        });
    }
    if(gateSearchInput){
        if(gateSearchInput.value !== canvasSearchQuery) gateSearchInput.value = canvasSearchQuery;
        gateSearchInput.placeholder = '搜索画布名称';
        gateSearchInput.setAttribute('aria-label', '搜索画布名称');
    }
    if(gateSearch) gateSearch.classList.toggle('has-value', Boolean(String(canvasSearchQuery || '').trim()));
    if(gateSearchClear){
        gateSearchClear.title = '清空搜索';
        gateSearchClear.setAttribute('aria-label', '清空搜索');
    }
    renderFolderTree(model);
    window.CanvasHome?.syncControls();
}

function setCreateMode(active, kind='classic'){
    creatingCanvas = active;
    createCanvasKind = active && kind === 'smart' ? 'smart' : 'classic';
    refreshGateViewControls();
    if(active) window.CanvasNameDialog.open({title:kind === 'smart' ? '新建智能画布' : '新建画布', label:'画布名称', placeholder:'例如：秋季视觉探索', confirm:'创建画布', allowEmpty:true, onSubmit:name => createCanvas(name)});
}

// Reads belong to one directory view and one mutation epoch. Late reads must
// never resurrect a renamed/deleted record or replace the current trash view.
let readSequence=0;
async function loadDirectory(trash,refreshFolders=false){
    const sequence=++readSequence,epoch=window.CanvasDirectoryApi.epoch;
    window.CanvasHome.setLoadState('loading',()=>loadDirectory(trashMode,true));
    try{
        const [data,folders]=await Promise.all([
            trash?window.CanvasDirectoryApi.listTrashCanvases():window.CanvasDirectoryApi.listCanvases(),
            refreshFolders?window.CanvasDirectoryApi.listCanvasFolders():null
        ]);
        if(sequence!==readSequence)return;
        if(epoch!==window.CanvasDirectoryApi.epoch){await window.CanvasDirectoryApi.flush();return loadDirectory(trashMode,refreshFolders);}
        if(folders){
            canvasFolders=folders.folders||[];
            if(activeFolderId!=='all'&&activeFolderId&&!canvasFolders.some(folder=>folder.id===activeFolderId))activeFolderId='';
        }
        if(trash)deletedCanvases=data.canvases||[];
        else{canvases=data.canvases||[];sortCanvasListByUpdated();}
        window.CanvasHome.setLoadState('ready');renderCanvasList();
        if(!trash)void refreshTrashCount(sequence);
        return true;
    }catch(error){
        if(sequence!==readSequence)return;
        setStatus(error.message);window.CanvasHome.setLoadState('error',()=>loadDirectory(trashMode,true));
        return false;
    }finally{
        if(sequence===readSequence){canvasGate.classList.remove('gate-loading');canvasGate.classList.add('gate-ready');}
    }
}
function loadCanvasList(_openFirst=false,options={}){return loadDirectory(false,options.refreshFolders===true);}
function loadTrashList(){return loadDirectory(true);}
async function refreshTrashCount(sequence=readSequence){
    const epoch=window.CanvasDirectoryApi.epoch;
    try{
        const data=await window.CanvasDirectoryApi.listTrashCanvases();
        if(sequence!==readSequence||trashMode||epoch!==window.CanvasDirectoryApi.epoch)return;
        deletedCanvases=data.canvases||[];refreshGateViewControls();
    }catch(_){}
}

async function setTrashMode(active){
    trashMode = active;
    creatingCanvas = false;
    pendingDeleteCanvasId = null;
    pendingPurgeCanvasId = null;
    closeCanvasMetaPopover();
    canvasGate.classList.toggle('creating', false);
    refreshGateViewControls();
    if(trashMode) await loadTrashList();
    else await loadCanvasList(false);
    refreshIcons();
}

function renderCanvasList(model=canvasGateModel()){
    const panel = canvasGate.querySelector('.gate-panel');
    const visible = panel && panel.getClientRects().length && !canvasGate.classList.contains('gate-loading');
    const before = visible ? panel.getBoundingClientRect().height : 0;
    panel?._gateResize?.cancel();
    renderCanvasListInto(gateCanvasList, model);
    window.CanvasHome?.renderRecent({items:canvases, trashMode, folderId:activeFolderId, query:canvasSearchQuery, formatTime:formatCanvasTime});
    if(!visible || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const after = panel.getBoundingClientRect().height;
    if(Math.abs(after - before) > 1){
        panel._gateResize = panel.animate([{height:before+'px'},{height:after+'px'}],{duration:200,easing:'ease-out'});
    }
    gateCanvasList._gateFade?.cancel();
    gateCanvasList._gateFade = gateCanvasList.animate([{opacity:.5},{opacity:1}],{duration:180,easing:'ease-out'});
}

function compareCanvasRecords(a, b){
    return window.CanvasDirectoryModel.compareRecords(a, b, canvasSortMode);
}

function sortCanvasListByUpdated(){
    canvases.sort(compareCanvasRecords);
}

function setCanvasSortMode(mode){
    const next = mode === 'name' ? 'name' : 'recent';
    if(next === canvasSortMode) { refreshGateViewControls(); return; }
    canvasSortMode = next;
    try { localStorage.setItem('canvasSortMode', canvasSortMode); } catch(e){}
    sortCanvasListByUpdated();
    const model = canvasGateModel();
    renderCanvasList(model);
    refreshGateViewControls(model);
}

async function patchCanvasMeta(id, patch){
    const item = canvases.find(c => c.id === id);
    if(item) Object.assign(item, patch);
    sortCanvasListByUpdated();
    renderCanvasList();
    try {
        const data = await window.CanvasDirectoryApi.patchCanvasMeta(id, patch);
        if(data.canvas) updateCanvasListRecord(data.canvas);
    } catch(e){
        console.error(e);
        await loadCanvasList(false);
        setStatus(e.message||'保存失败');
    }
}

function togglePinCanvas(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    const item = canvases.find(c => c.id === id);
    closeCanvasMetaPopover();
    patchCanvasMeta(id, {pinned: !(item && item.pinned)});
}

function setCanvasColorValue(id, color, event){
    event?.preventDefault();
    event?.stopPropagation();
    patchCanvasMeta(id, {color: color || ''});
}

function commitCanvasOwner(id, value){
    const owner = String(value || '').trim().slice(0, 40);
    const item = canvases.find(c => c.id === id);
    if((item?.owner || '') === owner) return;
    patchCanvasMeta(id, {owner});
}

function updateCanvasListRecord(record){
    if(!record?.id) return;
    const index = canvases.findIndex(item => item.id === record.id);
    if(index >= 0) canvases[index] = {...canvases[index], ...record};
    else canvases.unshift(record);
    sortCanvasListByUpdated();
    renderCanvasList();
}

function renderCanvasListInto(list, model=canvasGateModel()){
    if(!list) return;
    refreshGateViewControls(model);
    const items = model.items;
    list.innerHTML = '';
    if(!items.length){
        const empty = document.createElement('div');
        empty.className = 'gate-list-empty';
        empty.innerHTML = model.emptyKind === 'search'
            ? `<div class="gate-list-empty-icon"><i data-lucide="search-x" class="w-6 h-6"></i></div>没有找到匹配的画布`
            : (model.emptyKind === 'trash'
                ? `<div class="gate-list-empty-icon"><i data-lucide="trash-2" class="w-6 h-6"></i></div>回收站为空`
                : `<div class="gate-list-empty-icon"><i data-lucide="layout-grid" class="w-6 h-6"></i></div>暂无画布<br>选择上方经典画布或智能画布，开始第一份创作`);
        list.appendChild(empty);
        refreshIcons();
        return;
    }
    model.rows.forEach(view => {
        const {item, isSmartCanvas, color, owner, pinned} = view;
        const row = document.createElement('div');
        row.className = `canvas-item ${isSmartCanvas ? 'smart-canvas' : ''} ${view.active ? 'active' : ''} ${pinned ? 'pinned' : ''} ${color ? 'has-color' : ''}`;
        row.dataset.canvasId = item.id;
        row.dataset.coverStyle = view.coverStyle;
        const ownerChip = owner
            ? `<span class="canvas-owner-chip" role="button" tabindex="0" title="${escapeAttr(owner)}"><i data-lucide="user-round" class="w-3 h-3"></i><span class="canvas-owner-text">${escapeHtml(owner)}</span></span>`
            : '';
        row.innerHTML = `
            <a class="canvas-open" ${trashMode ? 'tabindex="-1" aria-disabled="true"' : ''}>
                ${window.CanvasHome.coverMarkup(item, escapeHtml)}<div class="studio-card-type">${isSmartCanvas ? '智能画布' : '经典画布'}${pinned ? ' · 已置顶' : ''}</div>
                <div class="canvas-card-icon-row">
                    <span class="canvas-preview-mark ${color ? `icon-has-color cc-${escapeAttr(color)}` : ''}" role="button" tabindex="0" title="${trashMode ? '已删除画布' : ('编辑图标 / 颜色 / 负责人')}">${renderCanvasIcon(view.icon, 16)}</span>
                    ${isSmartCanvas ? `<span class="canvas-kind-chip">智能</span>` : ''}
                </div>
                <div class="canvas-card-title">${escapeHtml(item.title)}</div>

                <div class="canvas-card-meta">
                    <span class="canvas-card-meta-dot"></span>
                    <div class="canvas-card-time">${trashMode ? `删除于 ${formatCanvasTime(item.deleted_at)}` : formatCanvasTime(item.updated_at || item.created_at)}</div>
                </div>
            </a>
            ${trashMode ? (pendingPurgeCanvasId === item.id ? `
                <div class="canvas-delete-confirm">
                    <div class="canvas-delete-box">
                        <div class="canvas-delete-title">清理画布？素材仍保留在画布资产中</div>
                        <div class="canvas-delete-actions">
                            <button class="canvas-confirm-btn" type="button">确定</button>
                            <button class="canvas-cancel-btn" type="button">取消</button>
                        </div>
                    </div>
                </div>
            ` : `
                <button class="canvas-delete canvas-restore" type="button" title="恢复画布" aria-label="恢复画布 ${escapeHtml(item.title)}" style="right:42px">
                    <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
                </button>
                <button class="canvas-delete canvas-purge" type="button" title="彻底删除" aria-label="彻底删除 ${escapeHtml(item.title)}">
                    <i data-lucide="x" class="w-3.5 h-3.5"></i>
                </button>
            `) : (pendingDeleteCanvasId === item.id ? `
                <div class="canvas-delete-confirm">
                    <div class="canvas-delete-box">
                        <div class="canvas-delete-title">画布移入回收站？素材仍保留</div>
                        <div class="canvas-delete-actions">
                            <button class="canvas-confirm-btn" type="button">确定</button>
                            <button class="canvas-cancel-btn" type="button">取消</button>
                        </div>
                    </div>
                </div>
            ` : `
                <button class="canvas-pin-btn ${pinned ? 'active' : ''}" type="button" title="${pinned ? ('取消置顶') : ('置顶')}" aria-label="${pinned ? ('取消置顶') : ('置顶')}">
                    <i data-lucide="pin" class="w-3.5 h-3.5"></i>
                </button>
                <button class="canvas-card-edit" type="button" title="重命名" aria-label="重命名 ${escapeHtml(item.title)}">
                    <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                </button>
                <button class="canvas-folder-btn" type="button" title="移动到文件夹" aria-label="移动到文件夹 ${escapeHtml(item.title)}">
                    <i data-lucide="folder-input" class="w-3.5 h-3.5"></i>
                </button>
                <button class="canvas-delete" type="button" title="移入回收站" aria-label="移入回收站 ${escapeHtml(item.title)}">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
                ${canvasMoveMenuHtml(item)}
            `)}
        `;
        if(!trashMode) {
            row.draggable = true;
            row.addEventListener('dragstart', e => {
                e.dataTransfer?.setData('text/canvas-id', item.id);
                e.dataTransfer?.setData('text/plain', item.id);
                e.dataTransfer.effectAllowed = 'move';
                row.classList.add('dragging');
            });
            row.addEventListener('dragend', () => row.classList.remove('dragging'));
        }
        if(!trashMode) window.CanvasNavigation.bindLink(row.querySelector('.canvas-open'),item.id);
        const titleEl = row.querySelector('.canvas-card-title');
        const editBtn = row.querySelector('.canvas-card-edit');
        if(editBtn && titleEl && !trashMode) {
            editBtn.onmousedown = e => e.stopPropagation();
            editBtn.onclick = e => { e.stopPropagation(); startTitleEdit(item.id, titleEl); };
        }
        const iconBtn = row.querySelector('.canvas-preview-mark');
        if(iconBtn && !trashMode) {
            iconBtn.onclick = e => toggleEmojiPicker(item.id, e);
            iconBtn.onkeydown = e => {
                if(e.key === 'Enter' || e.key === ' ') toggleEmojiPicker(item.id, e);
            };
        }
        row.querySelectorAll('.emoji-option').forEach(btn => {
            btn.onclick = e => setCanvasIcon(item.id, btn.dataset.icon, e);
        });
        const pinBtn = row.querySelector('.canvas-pin-btn');
        if(pinBtn){
            pinBtn.onmousedown = e => e.stopPropagation();
            pinBtn.onclick = e => togglePinCanvas(item.id, e);
        }
        const folderBtn = row.querySelector('.canvas-folder-btn');
        if(folderBtn){
            folderBtn.onmousedown = e => e.stopPropagation();
            folderBtn.onclick = e => toggleMoveCanvasMenu(item.id, e);
        }
        row.querySelectorAll('[data-move-folder]').forEach(btn => {
            btn.onmousedown = e => e.stopPropagation();
            btn.onclick = e => {
                e.stopPropagation();
                moveCanvasToFolder(item.id, btn.dataset.moveFolder || '');
            };
        });
        const ownerChipEl = row.querySelector('.canvas-owner-chip');
        if(ownerChipEl && !trashMode){
            ownerChipEl.onmousedown = e => e.stopPropagation();
            ownerChipEl.onclick = e => { e.stopPropagation(); toggleEmojiPicker(item.id, e); };
        }
        const deleteBtn = row.querySelector('.canvas-delete');
        if(deleteBtn) deleteBtn.onclick = e => requestDeleteCanvas(item.id, e);
        const confirmBtn = row.querySelector('.canvas-confirm-btn');
        if(confirmBtn) confirmBtn.onclick = e => trashMode ? purgeCanvas(item.id, e) : deleteCanvas(item.id, e);
        const cancelBtn = row.querySelector('.canvas-cancel-btn');
        if(cancelBtn) cancelBtn.onclick = e => cancelDeleteCanvas(e);
        const restoreBtn = row.querySelector('.canvas-restore');
        if(restoreBtn) restoreBtn.onclick = e => restoreCanvas(item.id, e);
        const purgeBtn = row.querySelector('.canvas-purge');
        if(purgeBtn) purgeBtn.onclick = e => requestPurgeCanvas(item.id, e);
        if(!trashMode){
            const menu = document.createElement('details');
            menu.className = 'studio-card-menu';
            const summary = document.createElement('summary');
            summary.setAttribute('aria-label', '画布操作：' + item.title);
            summary.title = '更多操作';
            summary.innerHTML = '<i data-lucide="ellipsis"></i>';
            menu.appendChild(summary);
            const actions = document.createElement('div');
            actions.className = 'studio-card-menu-items';
            for(const [selector, label] of [['.canvas-card-edit','重命名'],['.canvas-folder-btn','移动到文件夹'],['.canvas-preview-mark','编辑封面'],['.canvas-pin-btn',pinned ? '取消置顶' : '置顶'],['.canvas-delete','移入回收站']]){
                const control = row.querySelector(selector);
                if(!control) continue;
                if(control.tagName !== 'BUTTON') {
                    const button = document.createElement('button');
                    button.type = 'button'; button.className = 'studio-card-meta-action';
                    button.innerHTML = '<i data-lucide="panels-top-left"></i>';
                    button.onclick = e => {e.stopPropagation(); menu.open=false; openCanvasCoverStyle(item);};
                    actions.appendChild(button);
                    button.appendChild(document.createTextNode(label));
                    control.remove();
                } else {
                    control.appendChild(document.createTextNode(label));
                    actions.appendChild(control);
                }
            }
            menu.appendChild(actions);
            menu.addEventListener('click', e => {e.stopPropagation();if(e.target.closest('button'))menu.open=false;});
            menu.addEventListener('pointerdown', e => e.stopPropagation());
            menu.addEventListener('dragstart', e => e.preventDefault());
            menu.addEventListener('toggle', () => {
                if(menu.open) {
                    document.querySelectorAll('.studio-card-menu[open]').forEach(other => {if(other !== menu) other.open = false;});
                    positionOpenCardMenus();
                }
            });
            menu.addEventListener('keydown', e => {if(e.key === 'Escape'){menu.open=false;summary.focus();e.stopPropagation();}});
            row.appendChild(menu);
            row.querySelector('.canvas-open').addEventListener('keydown', e => {
                if(e.target === e.currentTarget && e.key === ' '){e.preventDefault();e.currentTarget.click();}
            });
        }
        list.appendChild(row);
    });
    refreshIcons();
    renderCanvasMetaPopover();
    window.CanvasCoverPreview?.bind(list);
}

function positionOpenCardMenus(){
    document.querySelectorAll('.studio-card-menu[open]').forEach(menu=>{
        const rect=menu.querySelector('summary').getBoundingClientRect();
        const actions=menu.querySelector('.studio-card-menu-items');
        actions.style.position='fixed';actions.style.right='auto';
        actions.style.left=Math.max(12,Math.min(rect.right-200,window.innerWidth-212))+'px';
        actions.style.top=Math.max(12,rect.bottom+actions.offsetHeight+8>window.innerHeight?rect.top-actions.offsetHeight-6:rect.bottom+6)+'px';
    });
}

function closeCanvasMetaPopover(){
    emojiPickerCanvasId = null;
    canvasMetaAnchorId = '';
    document.querySelector('.canvas-meta-pop')?.remove();
}

function renderCanvasMetaPopover(){
    document.querySelector('.canvas-meta-pop')?.remove();
    if(trashMode || !emojiPickerCanvasId) return;
    const item = canvases.find(entry => entry.id === emojiPickerCanvasId);
    if(!item) return;
    const color = String(item.color || '').trim();
    const owner = String(item.owner || '').trim();
    const pop = document.createElement('div');
    pop.className = 'canvas-meta-pop';
    pop.dataset.canvasMetaPop = item.id;
    pop.innerHTML = `
        <div class="canvas-meta-section">
            <div class="canvas-meta-label">${'负责人 / 项目'}</div>
            <input class="canvas-owner-input" type="text" maxlength="40" value="${escapeAttr(owner)}" placeholder="${escapeAttr('输入负责人或项目')}">
        </div>
        <div class="canvas-meta-section">
            <div class="canvas-meta-label">${'颜色标记'}</div>
            <div class="canvas-color-row">
                <button class="canvas-color-swatch cc-none ${!color ? 'active' : ''}" type="button" data-color="" title="${'无'}"><i data-lucide="ban" class="w-3 h-3"></i></button>
                ${CANVAS_COLOR_OPTIONS.map(c => `<button class="canvas-color-swatch cc-${c} ${color === c ? 'active' : ''}" type="button" data-color="${c}" aria-label="${c}"></button>`).join('')}
            </div>
        </div>
        <div class="canvas-meta-section">
            <div class="canvas-meta-label">修改画布图标</div>
            <div class="emoji-picker-grid">
                ${CANVAS_EMOJIS.map(icon => `<button class="emoji-option" type="button" data-icon="${escapeHtml(icon)}">${renderCanvasIcon(icon, 14)}</button>`).join('')}
            </div>
        </div>
    `;
    document.body.appendChild(pop);
    pop.querySelectorAll('.emoji-option').forEach(btn => {
        btn.onclick = e => setCanvasIcon(item.id, btn.dataset.icon, e);
    });
    pop.querySelectorAll('.canvas-color-swatch').forEach(btn => {
        btn.onmousedown = e => e.stopPropagation();
        btn.onclick = e => setCanvasColorValue(item.id, btn.dataset.color || '', e);
    });
    const ownerInput = pop.querySelector('.canvas-owner-input');
    if(ownerInput){
        ownerInput.onmousedown = e => e.stopPropagation();
        ownerInput.onclick = e => e.stopPropagation();
        ownerInput.onkeydown = e => {
            e.stopPropagation();
            if(e.key === 'Enter'){ e.preventDefault(); ownerInput.blur(); }
            if(e.key === 'Escape'){ e.preventDefault(); closeCanvasMetaPopover(); renderCanvasList(); }
        };
        ownerInput.onblur = () => commitCanvasOwner(item.id, ownerInput.value);
    }
    refreshIcons();
    requestAnimationFrame(positionCanvasMetaPopover);
}

function positionCanvasMetaPopover(){
    if(!emojiPickerCanvasId) return;
    const pop = document.querySelector('.canvas-meta-pop');
    const anchorId = canvasMetaAnchorId || emojiPickerCanvasId;
    const row = document.querySelector(`.canvas-item[data-canvas-id="${CSS.escape(anchorId)}"]`);
    const icon = row?.querySelector('.studio-card-menu summary') || row?.querySelector('.canvas-preview-mark') || row?.querySelector('.canvas-owner-chip');
    if(!pop || !icon) return;
    const iconRect = icon.getBoundingClientRect();
    const width = pop.offsetWidth || 212;
    const height = pop.offsetHeight || 260;
    const margin = 12;
    let left = Math.min(Math.max(iconRect.left, margin), window.innerWidth - width - margin);
    let top = iconRect.bottom + 8;
    if(top + height > window.innerHeight - margin) top = iconRect.top - height - 8;
    if(top < margin) top = margin;
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
}

async function createCanvas(customTitle = ''){
    const isSmart=createCanvasKind==='smart';
    const title=customTitle || (isSmart?'新建智能画布':'新建画布');
    setStatus('正在新建画布…');
    const data=await window.CanvasDirectoryApi.createCanvas({title,icon:isSmart?'sparkles':'layers',kind:isSmart?'smart':'classic',folder_id:folderTargetForCreate()});
    setCreateMode(false);
    await window.CanvasNavigation.go(window.CanvasNavigation.canvasUrl(data.canvas.id));
}

async function createSmartCanvas(){
    setCreateMode(true, 'smart');
}

function toggleEmojiPicker(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    pendingDeleteCanvasId = null;
    const opening = emojiPickerCanvasId !== id;
    emojiPickerCanvasId = opening ? id : null;
    canvasMetaAnchorId = opening ? id : '';
    renderCanvasList();
}

async function setCanvasIcon(id, icon, event){
    event?.preventDefault();
    event?.stopPropagation();
    const item = canvases.find(c => c.id === id);
    const nextIcon = icon || 'layers';
    if(item) item.icon = nextIcon;
    closeCanvasMetaPopover();
    renderCanvasList();
    try {
        const data = await window.CanvasDirectoryApi.patchCanvasMeta(id, {icon:nextIcon});
        if(data.canvas) updateCanvasListRecord(data.canvas);
    } catch(e) {
        setStatus('图标保存失败');
        console.error(e);
        await loadCanvasList(false);
    }
}

function startTitleEdit(id, titleEl){
    const item = canvases.find(c => c.id === id);
    if(!item) return;
    window.CanvasNameDialog.open({title:'重命名画布', label:'画布名称', value:item.title || '', description:'修改名称不会影响画布内容和连接。', onSubmit:async title => {
        if(title === item.title) return;
        const data = await window.CanvasDirectoryApi.patchCanvasMeta(id, {title});
        if(data.canvas) updateCanvasListRecord(data.canvas);
        renderCanvasList();
    }});
}

function requestDeleteCanvas(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    closeCanvasMetaPopover();
    pendingPurgeCanvasId = null;
    pendingDeleteCanvasId = id;
    renderCanvasList();
}

function requestPurgeCanvas(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    closeCanvasMetaPopover();
    pendingDeleteCanvasId = null;
    pendingPurgeCanvasId = id;
    renderCanvasList();
}

function cancelDeleteCanvas(event){
    event?.preventDefault();
    event?.stopPropagation();
    pendingDeleteCanvasId = null;
    pendingPurgeCanvasId = null;
    renderCanvasList();
}

async function deleteCanvas(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    setStatus('正在移入回收站…');
    try {
        const res = await window.CanvasDirectoryApi.deleteCanvas(id);
        if(!res.ok) throw new Error('移入回收站失败');
        pendingDeleteCanvasId = null;
        canvases = canvases.filter(item => item.id !== id);
        renderCanvasList();
        setStatus(canvases.length ? '已移入回收站' : '暂无画布，请先新建画布');
        await loadCanvasList(false);
    } catch(e) {
        setStatus(e.message||'移入回收站失败');
        console.error(e);
    }
}

async function restoreCanvas(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    const button = event?.currentTarget;
    if(button?.disabled) return;
    if(button){button.disabled=true;button.setAttribute('aria-busy','true');}
    const report = message => {
        setStatus(message);
        const feedback = document.getElementById('studioHomeFeedback');
        if(feedback){feedback.textContent=message;feedback.hidden=false;}
    };
    report('正在恢复画布…');
    try {
        const res = await window.CanvasDirectoryApi.restoreCanvas(id);
        if(!res.ok){
            const data = await res.clone().json().catch(()=>({}));
            throw new Error(data.detail?.message || ({permission_denied:'你没有恢复画布的权限。',canvas_revision_conflict:'画布状态已改变，请刷新回收站后重试。',canvas_not_found:'画布已被清理或当前不可访问。'}[data.detail?.code]) || (typeof data.detail==='string' ? data.detail : '恢复画布失败，请稍后重试。'));
        }
        pendingPurgeCanvasId = null;
        deletedCanvases = deletedCanvases.filter(item => item.id !== id);
        await loadCanvasList(false);
        await loadTrashList();
        report('画布已恢复，可返回画布列表打开。');
    } catch(e) {
        report(e?.message || '恢复画布失败，请稍后重试。');
        console.error(e);
    } finally {
        if(button){button.disabled=false;button.removeAttribute('aria-busy');}
    }
}

async function purgeCanvas(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    setStatus('正在清理画布…');
    try {
        const res = await window.CanvasDirectoryApi.purgeCanvas(id);
        if(!res.ok) throw new Error('彻底删除失败');
        pendingPurgeCanvasId = null;
        deletedCanvases = deletedCanvases.filter(item => item.id !== id);
        renderCanvasList();
        setStatus(deletedCanvases.length ? '已彻底删除' : '回收站为空');
        await loadTrashList();
    } catch(e) {
        setStatus(e.message||'彻底删除失败');
        console.error(e);
    }
}

function searchCanvases(query){
    canvasSearchQuery = query || '';
    closeCanvasMetaPopover();
    renderCanvasList();
}

function clearCanvasSearch(focus=false){
    canvasSearchQuery = '';
    renderCanvasList();
    if(focus) gateSearchInput?.focus();
}

async function openCanvasCoverStyle(item){
    return window.CanvasNavigation.go(window.CanvasNavigation.canvasUrl(item.id,{cover:true}));
}
(() => {
 'use strict';
 const byId=id=>document.getElementById(id);let retry;
 let requestedCreate=new URLSearchParams(window.location.search).get('create')==='classic';
 const closePick=(pick,restore=false)=>{const trigger=pick.querySelector('.studio-pick-trigger');pick.querySelector('.studio-pick-menu').hidden=true;trigger.setAttribute('aria-expanded','false');if(restore)trigger.focus();};
 const choices=pick=>Array.from(pick.querySelectorAll('.gate-folder-main,[data-sort]')).filter(el=>!el.disabled);
 document.querySelectorAll('.studio-pick').forEach(pick=>{
  const trigger=pick.querySelector('.studio-pick-trigger'),menu=pick.querySelector('.studio-pick-menu');
  const open=focus=>{
   document.querySelectorAll('.studio-pick').forEach(other=>{if(other!==pick)closePick(other);});
   menu.hidden=false;trigger.setAttribute('aria-expanded','true');
   const rect=trigger.getBoundingClientRect(),below=window.innerHeight-rect.bottom-16;
   const above=below<160&&rect.top>below;
   menu.style.top=above?'auto':'calc(100% + 6px)';menu.style.bottom=above?'calc(100% + 6px)':'auto';
   menu.style.maxHeight=Math.min(420,Math.max(120,above?rect.top-16:below))+'px';
   if(focus)(menu.querySelector('.active .gate-folder-main,[data-sort].active')||choices(pick)[0])?.focus();
  };
  trigger.addEventListener('click',()=>menu.hidden?open(false):closePick(pick));
  trigger.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();open(true);}});
  menu.addEventListener('click',e=>{if(e.target.closest('.gate-folder-main,[data-sort]'))closePick(pick,true);});
  pick.addEventListener('keydown',e=>{
   if(e.defaultPrevented)return;
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closePick(pick,true);return;}
   if(menu.hidden)return;
   if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){const list=choices(pick),index=list.indexOf(document.activeElement);let next=index;if(e.key==='Home')next=0;else if(e.key==='End')next=list.length-1;else next=(index+(e.key==='ArrowDown'?1:-1)+list.length)%list.length;e.preventDefault();list[next]?.focus();}
  });
  pick.addEventListener('focusout',e=>{if(e.relatedTarget&&!pick.contains(e.relatedTarget))closePick(pick);});
 });
 document.addEventListener('pointerdown',e=>{document.querySelectorAll('.studio-pick').forEach(pick=>{if(!pick.contains(e.target))closePick(pick);});document.querySelectorAll('.studio-card-menu[open]').forEach(menu=>{if(!menu.contains(e.target))menu.open=false;});});
 window.addEventListener('resize',positionOpenCardMenus);
 window.CanvasHome={
  remember(){
   try {sessionStorage.setItem(window.CanvasSession?.storageKey('canvas-home')||'canvas-home:local',JSON.stringify({folder:activeFolderId,query:canvasSearchQuery,sort:canvasSortMode,scroll:byId('canvasGate').scrollTop}));}catch(_){}
  },
  restore(){
   try {
    const saved=JSON.parse(sessionStorage.getItem(window.CanvasSession?.storageKey('canvas-home')||'canvas-home:local')||'null');if(!saved)return;
    activeFolderId=saved.folder==='all'||saved.folder===''||canvasFolders.some(folder=>folder.id===saved.folder)?saved.folder:'all';
    canvasSearchQuery=typeof saved.query==='string'?saved.query:'';canvasSortMode=saved.sort==='name'?'name':'recent';
    sortCanvasListByUpdated();renderCanvasList();refreshGateViewControls();
    requestAnimationFrame(()=>{byId('canvasGate').scrollTop=Number(saved.scroll)||0;});
   }catch(_){}
  },
  syncControls(){const folder=byId('gateFolderTree')?.querySelector('.active .gate-folder-name');if(byId('studioFolderLabel'))byId('studioFolderLabel').textContent=folder?.textContent==='全部画布'?'全部文件夹':folder?.textContent||'全部文件夹';if(byId('studioSortLabel'))byId('studioSortLabel').textContent=byId('gateSortSwitch')?.querySelector('.active')?.textContent||'最近编辑';},
  renderRecent({items,trashMode,folderId,query,open,formatTime}){
   const section=byId('studioRecent'),list=byId('studioRecentList');
   section.hidden=trashMode||folderId!=='all'||Boolean(String(query||'').trim())||items.length<4;
   if(section.hidden){list.replaceChildren();return;}
   const stamp=value=>typeof value==='number'?value:Date.parse(value)||0;
   const recent=[...items].sort((a,b)=>stamp(b.updated_at||b.created_at)-stamp(a.updated_at||a.created_at)).slice(0,3),fragment=document.createDocumentFragment();
   for(const item of recent){const button=document.createElement('a');button.className='studio-recent-item';button.title=item.title||'未命名画布';const type=document.createElement('span');type.className='studio-recent-type';type.textContent=item.kind==='smart'?'智能':'经典';const info=document.createElement('span');info.className='studio-recent-info';const title=document.createElement('strong');title.textContent=item.title||'未命名画布';const time=document.createElement('small');time.textContent=formatTime(item.updated_at||item.created_at);info.append(title,time);button.append(type,info);window.CanvasNavigation.bindLink(button,item.id);fragment.append(button);}
   list.replaceChildren(fragment);
  },
  coverMarkup(item){return window.CanvasCoverPreview.markup(item);},
  setLoadState(state,onRetry){
   retry=onRetry||retry;const feedback=byId('studioHomeFeedback');feedback.replaceChildren();feedback.hidden=state==='ready';byId('canvasGate').setAttribute('aria-busy',String(state==='loading'));
   if(state==='ready'){
    if(requestedCreate){requestedCreate=false;const url=new URL(window.location.href);url.searchParams.delete('create');history.replaceState(history.state,'',url);queueMicrotask(()=>window.CanvasHome.beginCreate());}
    return;
   }
   const message=document.createElement('span');message.textContent=state==='loading'?'正在加载画布…':'画布列表加载失败，请重试。';feedback.append(message);
   if(state==='error'){const button=document.createElement('button');button.type='button';button.textContent='重新加载';button.onclick=()=>retry?.();feedback.append(button);}
  },
  async beginCreate(){
   await ready;
   if(trashMode)await setTrashMode(false);
   setCreateMode(true);return true;
  }
 };
 window.addEventListener('pagehide',()=>window.CanvasHome.remember());
})();

gateCreateBtn.addEventListener('click', () => setCreateMode(true));
gateCreateSmartBtn?.addEventListener('click', createSmartCanvas);
gateNewFolderBtn?.addEventListener('click', () => createCanvasFolder(''));
gateBackBtn.addEventListener('click', () => setTrashMode(false));
gateTrashBtn.addEventListener('click', () => setTrashMode(true));
gateRefreshBtn.addEventListener('click', () => trashMode ? loadTrashList() : loadCanvasList(false, {refreshFolders:true}));
document.getElementById('gateSortSwitch')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-sort]');
    if(btn) setCanvasSortMode(btn.dataset.sort);
});


gateSearchInput?.addEventListener('input', event => searchCanvases(event.target.value));
gateSearchInput?.addEventListener('keydown', event => {
    if(event.key !== 'Escape' || !canvasSearchQuery) return;
    event.preventDefault();
    clearCanvasSearch();
});
gateSearchClear?.addEventListener('click', () => clearCanvasSearch(true));

document.addEventListener('mousedown', e => {
    if(movingCanvasId && !e.target.closest('.canvas-folder-menu') && !e.target.closest('.canvas-folder-btn')){
        movingCanvasId = null;
        renderCanvasList();
    }
    if(emojiPickerCanvasId === null) return;
    if(e.target.closest('.canvas-meta-pop') || e.target.closest('.canvas-preview-mark') || e.target.closest('.canvas-owner-chip')) return;
    closeCanvasMetaPopover();
    renderCanvasList();
});
canvasGate.addEventListener('scroll',positionOpenCardMenus,{passive:true});
gateCanvasList?.addEventListener('scroll', () => requestAnimationFrame(positionCanvasMetaPopover), {passive:true});
window.addEventListener('resize', () => requestAnimationFrame(positionCanvasMetaPopover));


window.CanvasNavigation.setLeaveGuard(async()=>{window.CanvasHome.remember();return window.CanvasDirectoryApi.flush();});
window.addEventListener('frontend:before-reload',event=>event.detail?.waitUntil?.(window.CanvasDirectoryApi.flush()));
window.addEventListener('beforeunload',event=>{if(window.CanvasDirectoryApi.busy){event.preventDefault();event.returnValue='';}});
window.StudioFrameMessages.subscribe(['canvas-focus','canvas_updated'],event=>{
    if(!document.hidden&&!window.CanvasDirectoryApi.busy)void refreshDirectory();
});
async function refreshDirectory(){
    await ready;
    if(!await window.CanvasDirectoryApi.flush())return false;
    return loadDirectory(trashMode,true);
}
let lastFocusRefresh=0;
function refreshVisibleDirectory(){
    if(document.hidden||document.querySelector('dialog[open]')||window.CanvasDirectoryApi.busy||Date.now()-lastFocusRefresh<30000)return;
    lastFocusRefresh=Date.now();void refreshDirectory();
}
window.addEventListener('focus',refreshVisibleDirectory);
document.addEventListener('visibilitychange',refreshVisibleDirectory);
let resolveReady;
const ready=new Promise(resolve=>{resolveReady=resolve;});
window.CanvasHome.ready=ready;
window.CanvasHome.refresh=refreshDirectory;
window.addEventListener('pageshow',event=>{if(event.persisted)void refreshDirectory();});
(async()=>{
    if(window.CanvasSession)await window.CanvasSession.ready;
    await loadCanvasList(false,{refreshFolders:true});
    lastFocusRefresh=Date.now();
    window.CanvasHome.restore();
    refreshIcons();resolveReady();
})().catch(error=>{setStatus(error.message);window.CanvasHome.setLoadState('error',()=>location.reload());resolveReady();});
})();
