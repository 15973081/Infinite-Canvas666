/* Classic canvas application entry (1 of 8 task modules).
 * Owns startup order, shared legacy bindings and page lifecycle.
 * Task functions and event registration live in /static/js/canvas/classic/.
 * Keep shared state initialization here during this compatibility migration:
 * moving its initialization can change permission, save and async task behavior.
 * See docs/canvas-eight-module-refactor.md for boundaries and follow-up rules.
 */
function refreshIcons(){ if(window.lucide) lucide.createIcons(); }
refreshIcons();

async function refreshCanvasConfigFromSettings(){
    await loadConfig();
    pruneMissingComfyWorkflows();
    (nodes || []).forEach(node => {
        sanitizeImageNodeProviderModel(node);
        sanitizeVideoNodeProviderModel(node);
    });
    if(typeof render === 'function') render();
}
window.StudioFrameMessages.subscribe(['canvas_updated','canvas_locked','canvas_unlocked','providers-changed','workflows-changed','comfy-instances-changed','canvas-focus'], event => {

    if(event.data?.type === 'canvas_updated') handleCanvasUpdatedMessage(event.data);
    if(event.data?.type === 'canvas_locked') handleCanvasLockedMessage(event.data);
    if(event.data?.type === 'canvas_unlocked') handleCanvasUnlockedMessage(event.data);
    if(event.data?.type === 'providers-changed' || event.data?.type === 'workflows-changed' || event.data?.type === 'comfy-instances-changed'){
        refreshCanvasConfigFromSettings();
    }
    if(event.data?.type === 'canvas-focus'){
        // 从其他标签页切换回画布时，重新拉取工作流列表并刷新节点
        refreshCanvasConfigFromSettings();
        if(canvas) syncRemoteCanvasNow();
    }
});

const shell = document.getElementById('shell');
const canvasGate = document.getElementById('canvasGate');
const board = document.getElementById('board');
const world = document.getElementById('world');
const nodesEl = document.getElementById('nodes');
const linksEl = document.getElementById('links');
const linkControlsEl = document.getElementById('linkControls');
const dropOverlay = document.getElementById('dropOverlay');
const createMenu = document.getElementById('createMenu');
const linkCreateMenu = document.getElementById('linkCreateMenu');
const nodeInputMenu = document.getElementById('nodeInputMenu');
const nodeOutputMenu = document.getElementById('nodeOutputMenu');
const imageNodeMenu = document.getElementById('imageNodeMenu');
const selectionBox = document.getElementById('selectionBox');
const selectionHub = document.getElementById('selectionHub');
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
const backToManagerBtn = document.getElementById('backToManagerBtn');
const canvasLockBadge = document.getElementById('canvasLockBadge');
const canvasLockLabel = document.getElementById('canvasLockLabel');
const canvasIdentityBtn = document.getElementById('canvasIdentityBtn');
const canvasIdentityLabel = document.getElementById('canvasIdentityLabel');
const canvasLockOverlay = document.getElementById('canvasLockOverlay');
const canvasLockOverlayMsg = document.getElementById('canvasLockOverlayMsg');
const canvasLockRetryBtn = document.getElementById('canvasLockRetryBtn');
const currentCanvasTitle = document.getElementById('currentCanvasTitle');
const currentCanvasTime = document.getElementById('currentCanvasTime');
const workflowTransferToggle = document.getElementById('workflowTransferToggle');
const canvasCostToggle = document.getElementById('canvasCostToggle');
const canvasCostToggleLabel = document.getElementById('canvasCostToggleLabel');
const canvasLogToggle = document.getElementById('canvasLogToggle');
const workflowTransferModal = document.getElementById('workflowTransferModal');
const workflowTransferSub = document.getElementById('workflowTransferSub');
const workflowExportMeta = document.getElementById('workflowExportMeta');
const workflowImportInput = document.getElementById('workflowImportInput');
const workflowImportDropZone = document.getElementById('workflowImportDropZone');
const workflowExportLibraryBtn = document.getElementById('workflowExportLibraryBtn');
const classicLibraryManager = createClassicLibraryManager();

const logModal = document.getElementById('logModal');
const logList = document.getElementById('logList');
const errorModal = document.getElementById('errorModal');
const errorTitle = document.getElementById('errorTitle');
const errorMessage = document.getElementById('errorMessage');
let canvases = [];
let deletedCanvases = [];
let canvasFolders = [];
let activeFolderId = 'all';
let canvasSearchQuery = '';
let canvas = null;
let nodes = [];
const classicWorkspaceView = createClassicWorkspaceView();
const classicMinimap = createClassicMinimap();
const classicOutputPreview = createClassicOutputPreview();
let connections = [];
let viewport = {x: -1800, y: -1000, scale: 1};
let dragNode = null;
let dragBoard = null;
let resizeNode = null;
let llmPaneDrag = null;
let tempLink = null;
let knifeActive = false;
let knifePoint = null;
let knifeTrail = [];
let knifeChanged = false;
let knifeNeedsRender = false;
let selectDrag = null;
let isRKeyDown = false;
let menuPoint = null;
let linkCreateState = null;
let internalDrag = false;
let selected = new Set();
let saveTimer = null;
let windowPointerSession = null;

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
let localCanvasDirty = false;
let savingCanvasNow = false;
let saveCanvasAgain = false;
let applyingRemoteCanvas = false;
let remoteSyncTimer = null;
let remoteSyncInterval = null;
let remoteSyncBusy = false;
let lastCanvasWsUpdatedAt = 0;
const REMOTE_SYNC_POLL_MS = 10000;
const REMOTE_SYNC_WS_QUIET_MS = 30000;
let lastCanvasUpdatedAt = 0;
let lastSavedCanvasSnapshot = '';
let openCanvasRequestSeq = 0;
let models = {gpt:'gpt-image-2', nano:'nano-banana-pro'};
let imageModels = ['gpt-image-2', 'nano-banana-pro'];
let chatModels = ['gpt-4o-mini'];
let videoModels = [];
let msChatModels = [];
let apiProviders = [];
let comfyBackendCount = 1;
let comfyWorkflows = [];
let comfyWorkflowCache = {};
let managedProviderId = 'comfly';
let localImageModels = [];
let localChatModels = [];
const MS_GEN_MODELS = {
    zimage:    { label: 'ZImage',     modelId: 'Tongyi-MAI/Z-Image-Turbo',            supportsImage: false, endpoint: '/generate'            },
    qwen_edit: { label: 'Qwen Edit',  modelId: 'Qwen/Qwen-Image-Edit-2511',            supportsImage: true,  endpoint: '/api/angle/generate'  },
    klein_edit:{ label: 'Klein',      modelId: 'black-forest-labs/FLUX.2-klein-9B',   supportsImage: true,  endpoint: '/api/ms/generate'     },
    custom:    { label: '自定义', modelId: '',                acceptsImage: true,   endpoint: '/api/ms/generate'     }
};
let hasManagedImageModels = false;
let hasManagedChatModels = false;
const missingAssetUrls = new Set();
let outputTimer = null;
let clipboard = null;
let lastImagePasteAt = 0;
let canvasPromptTemplates = [];
let canvasPromptTemplatesLoaded = false;
let canvasPromptLibraries = [];
const CANVAS_PROMPT_TEMPLATE_GROUPS_KEY = 'canvas_prompt_template_groups_v1';
const CANVAS_PROMPT_TEMPLATE_OVERRIDES_KEY = 'canvas_prompt_template_overrides';
let promptTemplateGroups = [];
let canvasPromptTemplateOverrides = {hiddenBuiltinIds:[], editedBuiltins:{}};
const classicPromptPanel = createClassicPromptPanel();
let canvasAssetLibrary = {categories:[]};
const CANVAS_ASSET_BATCH_SIZE = 60;
const CANVAS_ASSET_PANEL_WIDTH_KEY = 'canvas_asset_panel_width_v1';
const CANVAS_ASSET_PANEL_DEFAULT_WIDTH = 320;
const CANVAS_ASSET_PANEL_MIN_WIDTH = 320;
const classicAssetPanel = createClassicAssetPanel();
revealCanvasAssetControls();
const LOCAL_CANVAS_ASSET_LIBRARY_ID = '__local_assets__';
let localCanvasAssetLibrary = {items:[], tree:null};
const activeCanvasTaskPolls = new Set();
let hoveredConnectionId = '';
let connectionHoverFrame = null;
let pendingConnectionHover = null;
const suspendedCanvasPreviewImages = new WeakMap();
let lastMouseBoard = {x: 0, y: 0};
let undoStack = [];
let redoStack = [];
const UNDO_MAX = 30;
const cascadeRunningIds = new Set();
const cascadeRunningNodeIds = new Set();
const cascadeStopIds = new Set();
const cascadeSerialIds = new Set(); // 记录以串行循环模式启动的运行，用于停止按钮
const cascadeContexts = new Map();
const classicImageEditor = createClassicImageEditor();
let textSelectionGuard = null;
const PROMPT_TEXT_MAX_LENGTH = 50000;
const CLIENT_ID = (() => {
    const key = 'canvasClientId';
    try {
        const existing = sessionStorage.getItem(key);
        if(existing) return existing;
        const created = 'canvas_' + Math.random().toString(36).slice(2);
        sessionStorage.setItem(key, created);
        return created;
    } catch(e){
        return 'canvas_' + Math.random().toString(36).slice(2);
    }
})();
const CANVAS_USER_NAME_KEY = 'canvasUserName';
const CANVAS_LOCK_POLL_MS = 5000;
let canvasLockHolder = null; // {client_id, username, ip, acquired_at} | null (null = no lock)
let canvasLockPollTimer = null;
let canvasLockedByOther = false;
const LTX_DIRECTOR_WORKFLOW = 'LTXDirectorv2-API.json';
const LTX_DIRECTOR_WF_NODE = '46';
const LTX_DIRECTOR_SEED_NODE = '94:28';
const LTX_SEGMENT_COLORS = ['#e07b3a', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#f59e0b'];
const CANVAS_EMOJIS = ['layers','sparkles','image','palette','wand-2','star','heart','rocket','flame','moon','cloud','leaf','gem','compass','pin','flag','bookmark','crown'];

const SIZE_MAP = {
    square: { '1k':'1024x1024', '2k':'2048x2048', '4k':'4096x4096' },
    portrait: { '1k':'1024x1536', '2k':'1360x2048', '4k':'2352x3520' },
    portrait43: { '1k':'1008x1344', '2k':'1536x2048', '4k':'2448x3264' },
    landscape43: { '1k':'1344x1008', '2k':'2048x1536', '4k':'3264x2448' },
    landscape: { '1k':'1536x1024', '2k':'2048x1360', '4k':'3520x2352' },
    story: { '1k':'720x1280', '2k':'1152x2048', '4k':'2160x3840' },
    wide: { '1k':'1280x720', '2k':'2048x1152', '4k':'3840x2160' },
    ultrawide: { '1k':'1280x544', '2k':'2048x880', '4k':'3840x1648' },
    ultratall: { '1k':'544x1280', '2k':'880x2048', '4k':'1648x3840' }
};
const RES_LONG_SIDE = { '1k':1536, '2k':2048, '4k':3840 };
const RES_PIXEL_LIMIT = { '1k':1572864, '2k':4194304, '4k':8294400 };
const CUSTOM_IMAGE_MODELS_KEY = 'canvas_custom_image_models';
const MANAGED_IMAGE_MODELS_KEY = 'canvas_image_models_ordered';
const MANAGED_CHAT_MODELS_KEY = 'canvas_chat_models_ordered';
const CANVAS_THEME_KEY = 'canvas_theme';
const QUICK_TOOLBAR_COLLAPSED_KEY = 'canvas_quick_toolbar_collapsed';
const CANVAS_SESSION_VIEWPORTS_KEY = 'canvas_session_viewports_v1';
let canvasSessionViewportFallback = {};
const DEFAULT_VIDEO_MODELS = [
    // Veo
    'veo2', 'veo2-fast', 'veo2-pro',
    'veo3', 'veo3-fast', 'veo3-pro',
    'veo3.1', 'veo3.1-fast', 'veo3.1-quality', 'veo3.1-lite',
    // Sora
    'sora-2', 'sora-2-pro',
    // 通义万相
    'wan2.6-t2v', 'wan2.6-i2v',
    'wan2.5-t2v-preview', 'wan2.5-i2v-preview',
    'wan2.2-t2v-plus', 'wan2.2-i2v-plus', 'wan2.2-i2v-flash',
    // Seedance
    'doubao-seedance-2-0-260128',
    'doubao-seedance-2-0-fast-260128',
    'doubao-seedance-1-5-pro-251215',
    'doubao-seedance-1-0-pro-250528',
    'doubao-seedance-1-0-lite-t2v-250428',
    'doubao-seedance-1-0-lite-i2v-250428',
    // Agnes
    'agnes-video-v2.0'
];

function uid(prefix='n'){ return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`; }


async function copyTextToClipboard(text){
    const value = String(text || '');
    if(!value) return false;
    try {
        if(navigator.clipboard?.writeText){
            await navigator.clipboard.writeText(value);
            return true;
        }
    } catch(_) {}
    try {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
    } catch(_) {
        return false;
    }
}

function formatCanvasTime(value){
    if(!value) return '--';
    const raw = Number(value);
    const time = raw < 10000000000 ? raw * 1000 : raw;
    const date = new Date(time);
    if(Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
}
function setStatus(text){
    document.getElementById('saveState').textContent = text;
    if(gateStatus) gateStatus.textContent = text;
}
function normalizeCanvasFolderId(value){
    return window.ClassicCanvasGateModel.normalizeFolderId(value);
}
function canvasGateModel(){
    return window.ClassicCanvasGateModel.build({canvases, deletedCanvases, folders:canvasFolders,
        trashMode, folderId:activeFolderId, query:canvasSearchQuery, canvasId:canvas?.id});
}
function canvasFolderLabel(folderId){
    return window.ClassicCanvasGateModel.folderLabel(canvasFolders, folderId);
}
function canvasFolderChildren(parentId=''){
    return window.ClassicCanvasGateModel.folderChildren(canvasFolders, parentId);
}
function canvasFolderDepth(folderId){
    return window.ClassicCanvasGateModel.folderDepth(canvasFolders, folderId);
}
function countCanvasesInFolder(folderId){
    return window.ClassicCanvasGateModel.countInFolder(canvases, folderId);
}
function visibleCanvasItems(){
    return window.ClassicCanvasGateModel.visibleItems({canvases, deletedCanvases,
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
async function loadCanvasFolders(){
    try {
        const data = await window.CanvasApi.listCanvasFolders();
        canvasFolders = data.folders || [];
        if(activeFolderId !== 'all' && activeFolderId && !canvasFolders.some(folder => folder.id === activeFolderId)){
            activeFolderId = '';
        }
        renderFolderTree();
    } catch(e) {
        console.error(e);
        canvasFolders = [];
        renderFolderTree();
    }
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
        const data = await window.CanvasApi.createCanvasFolder({name, parent_id:normalizeCanvasFolderId(parentId)});
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
        const data = await window.CanvasApi.updateCanvasFolder(folderId, {name});
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
        const data = await window.CanvasApi.deleteCanvasFolder(folderId);
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
    if(canvas?.id === id) canvas.folder_id = target;
    movingCanvasId = null;
    renderFolderTree();
    renderCanvasList();
    refreshGateViewControls();
    try {
        const data = await window.CanvasApi.moveCanvasToFolder(id, target);
        if(data.canvas) updateCanvasListRecord(data.canvas);
    } catch(e) {
        if(item) item.folder_id = prev;
        if(canvas?.id === id) canvas.folder_id = prev;
        setStatus(e?.message || '移动画布失败');
        console.error(e);
        await loadCanvasList(false);
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
function setCanvasMode(open){
    shell.classList.toggle('no-canvas', !open);
    if(!open){
        classicWorkspaceView.reset();
        classicMinimap.reset();
        classicPromptPanel.reset();
        classicImageEditor.reset();
        classicOutputPreview.reset();
        clearConnectionHover();
        clearLocalCanvasLock();
        nodesEl.innerHTML = '';
        linksEl.innerHTML = '';
        linkControlsEl.innerHTML = '';
        selectionHub.classList.remove('open');
    } else if(currentCanvasTitle) {
        currentCanvasTitle.textContent = canvas?.title || '未命名画布';
        currentCanvasTime.textContent = formatCanvasTime(canvas?.updated_at || canvas?.created_at);
    }
    refreshIcons();
}
function ensureCanvas(){
    if(canvas) return true;
    setStatus('请先新建或选择画布');
    return false;
}
function setCreateMode(active, kind='classic'){
    creatingCanvas = active;
    createCanvasKind = active && kind === 'smart' ? 'smart' : 'classic';
    refreshGateViewControls();
    if(active) window.CanvasNameDialog.open({title:kind === 'smart' ? '新建智能画布' : '新建画布', label:'画布名称', placeholder:'例如：秋季视觉探索', confirm:'创建画布', allowEmpty:true, onSubmit:name => createCanvas(name)});
}


async function loadConfig(){
    loadLocalModelLists();
    try {
        const cfg = await window.CanvasApi.getConfig();
        imageModels = cfg.image_models?.length ? cfg.image_models : imageModels;
        chatModels = cfg.chat_models?.length ? cfg.chat_models : chatModels;
        videoModels = cfg.video_models?.length ? cfg.video_models : DEFAULT_VIDEO_MODELS;
        apiProviders = window.CanvasCore.availableModelProviders(Array.isArray(cfg.api_providers) ? cfg.api_providers : defaultApiProviders());
        models.nano = imageModels.find(m => m.toLowerCase().includes('nano')) || 'nano-banana-pro';
        models.gpt = imageModels.find(m => !m.toLowerCase().includes('nano')) || cfg.image_model || 'gpt-image-2';
    } catch(e) {
        apiProviders = defaultApiProviders();
    }
}

// 监听 API 设置页面的变更广播，实时刷新画布的模型/平台下拉
window.StudioFrameMessages.subscribeApi(async e => {
    if(e.data?.type === 'providers-changed' || e.data?.type === 'workflows-changed' || e.data?.type === 'comfy-instances-changed'){
        await refreshCanvasConfigFromSettings();
    }
});
async function loadCanvasList(openFirst=true, options={}){
    try {
        window.CanvasHome?.setLoadState('loading', ()=>loadCanvasList(false,{refreshFolders:true}));
        const refreshFolders = options.refreshFolders === true;
        const canvasPromise = window.CanvasApi.listCanvases();
        if(refreshFolders) await loadCanvasFolders();
        const data = await canvasPromise;
        canvases = data.canvases || [];
        window.CanvasHome?.setLoadState('ready');
        sortCanvasListByUpdated();
        refreshGateViewControls();
        renderCanvasList();
        refreshTrashCount();
        if(openFirst && canvases[0]) await openCanvas(canvases[0].id);
        else if(!canvas) {
            setCanvasMode(false);
            setStatus(trashMode ? (deletedCanvases.length ? '回收站' : '回收站为空') : (canvases.length ? '请选择或新建画布' : '暂无画布，请先新建画布'));
        }
    } catch(e) {
        setStatus('画布列表加载失败');
        window.CanvasHome?.setLoadState('error', ()=>loadCanvasList(false,{refreshFolders:true}));
        console.error(e);
    } finally {
        if(canvasGate.classList.contains('gate-loading')){
            canvasGate.classList.remove('gate-loading');
            canvasGate.classList.add('gate-ready');
        }
    }
}
async function loadTrashList(){
    try {
        window.CanvasHome?.setLoadState('loading', ()=>loadTrashList());
        const data = await window.CanvasApi.listTrashCanvases();
        deletedCanvases = data.canvases || [];
        window.CanvasHome?.setLoadState('ready');
        refreshGateViewControls();
        renderCanvasList();
        setStatus(deletedCanvases.length ? '回收站' : '回收站为空');
    } catch(e) {
        setStatus('回收站加载失败');
        window.CanvasHome?.setLoadState('error', ()=>loadTrashList());
        console.error(e);
    }
}
async function refreshTrashCount(){
    if(trashMode) return;
    try {
        const data = await window.CanvasApi.listTrashCanvases({canvases:[]});
        deletedCanvases = data.canvases || [];
        refreshGateViewControls();
    } catch(e) {}
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
    window.CanvasHome?.renderRecent({items:canvases, trashMode, folderId:activeFolderId, query:canvasSearchQuery, open:openCanvas, formatTime:formatCanvasTime});
    if(!visible || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const after = panel.getBoundingClientRect().height;
    if(Math.abs(after - before) > 1){
        panel._gateResize = panel.animate([{height:before+'px'},{height:after+'px'}],{duration:200,easing:'ease-out'});
    }
    gateCanvasList._gateFade?.cancel();
    gateCanvasList._gateFade = gateCanvasList.animate([{opacity:.5},{opacity:1}],{duration:180,easing:'ease-out'});
}
function compareCanvasRecords(a, b){
    return window.ClassicCanvasGateModel.compareRecords(a, b, canvasSortMode);
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
    if(canvas?.id === id) Object.assign(canvas, patch);
    sortCanvasListByUpdated();
    renderCanvasList();
    try {
        const data = await window.CanvasApi.patchCanvasMeta(id, patch);
        if(data.canvas) updateCanvasListRecord(data.canvas);
    } catch(e){
        setStatus('保存失败');
        console.error(e);
        await loadCanvasList(false);
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
async function touchCanvasOpened(id){
    if(!id) return null;
    try {
        const data = await window.CanvasApi.touchCanvas(id, null);
        if(!data) return null;
        if(data.canvas) updateCanvasListRecord(data.canvas);
        return data.canvas || data;
    } catch(e) {
        console.warn('touch canvas failed', e);
        return null;
    }
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
            <div class="canvas-open" role="button" tabindex="${trashMode ? '-1' : '0'}">
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
            </div>
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
        if(!trashMode) row.querySelector('.canvas-open').onclick = () => openCanvas(item.id);
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
                    const rect = summary.getBoundingClientRect();
                    actions.style.position = 'fixed'; actions.style.right = 'auto';
                    actions.style.left = Math.max(12, Math.min(rect.right - 200, window.innerWidth - 212)) + 'px';
                    actions.style.top = Math.max(12, rect.bottom + actions.offsetHeight + 8 > window.innerHeight ? rect.top - actions.offsetHeight - 6 : rect.bottom + 6) + 'px';
                }
            });
            menu.addEventListener('keydown', e => {if(e.key === 'Escape'){menu.open=false;summary.focus();e.stopPropagation();}});
            row.appendChild(menu);
            row.querySelector('.canvas-open').addEventListener('keydown', e => {
                if(e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')){e.preventDefault();openCanvas(item.id);}
            });
        }
        list.appendChild(row);
    });
    refreshIcons();
    renderCanvasMetaPopover();
    window.CanvasCover?.bind(list);
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
    openCanvasRequestSeq++;

    const isSmart = createCanvasKind === 'smart';
    const titleBase = isSmart ? '新建智能画布' : '新建画布';
    const title = customTitle || `${titleBase} ${new Date().toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'})}`;
    trashMode = false;
    refreshGateViewControls();
    setStatus('Creating...');
    try {
        const data = await window.CanvasApi.createCanvas({title, icon:isSmart ? 'sparkles' : '🧩', kind:isSmart ? 'smart' : 'classic', folder_id:folderTargetForCreate()});
        if(isSmart){
            setCreateMode(false);
            await loadCanvasList(false);
            openSmartCanvasPage(data.canvas?.id);
            return;
        }
        if(window.CanvasSession?.enabled){
            setCreateMode(false);
            await loadCanvasList(false);
            await openCanvas(data.canvas.id);
            return;
        }
        resetCascadeRuntimeState();
        classicWorkspaceView.reset();
        classicMinimap.reset();
        classicPromptPanel.reset();
        classicImageEditor.reset();
        classicOutputPreview.reset();
        canvas = data.canvas;
        canvas.logs = canvas.logs || [];
        nodes = canvas.nodes || [];
        connections = canvas.connections || [];
        viewport = localViewportForCanvas(canvas.id, {x:0, y:0, scale:1});
        canvas.viewport = {...viewport};
        resetTransientRunState(nodes);
        sanitizeConnections();
        selected.clear();
        setCanvasMode(true);
        render();
        setStatus('Saved');
        setCreateMode(false);
        await loadCanvasList(false);
        renderCanvasList();
    } catch(e) {
        setStatus('新建画布失败');
        console.error(e);
        throw e;
    }
}
async function createSmartCanvas(){
    setCreateMode(true, 'smart');
}
async function openSmartCanvasPage(id, editCover=false){
    if(!id) return;
    await window.FrontendVersion?.checkForUpdate?.();
    const path = `/static/smart-canvas.html?id=${encodeURIComponent(id)}${editCover ? '&cover=1':''}`;
    const target = window.CanvasSession?.enabled ? window.CanvasSession.url(path) : path;
    window.location.href = window.FrontendVersion?.versionedUrl(target) || target;
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
    if(canvas?.id === id) canvas.icon = nextIcon;
    closeCanvasMetaPopover();
    renderCanvasList();
    try {
        const data = await window.CanvasApi.patchCanvasMeta(id, {icon:nextIcon});
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
        const data = await window.CanvasApi.patchCanvasMeta(id, {title});
        if(data.canvas) updateCanvasListRecord(data.canvas);
        if(canvas?.id === id) { canvas.title = title; if(currentCanvasTitle) currentCanvasTitle.textContent = title; }
        renderCanvasList();
    }});
}
async function openCanvas(id){
    if(window.MemberCanvasEdit?.active && window.MemberCanvasEdit.active.id !== id){
        if(!await window.MemberCanvasEdit.leave()) return;
    }
    const openSeq = ++openCanvasRequestSeq;
    setStatus('Opening...');
    try {
        const data = await window.CanvasApi.getCanvas(id, {errorFallback:'打开画布失败'});
        if(openSeq !== openCanvasRequestSeq) return;
        resetCascadeRuntimeState();
        const nextCanvas = data.canvas;
        const touched = await touchCanvasOpened(nextCanvas.id);
        if(openSeq !== openCanvasRequestSeq) return;
        if(touched?.updated_at) nextCanvas.updated_at = Number(touched.updated_at);
        if((nextCanvas.kind || 'classic') === 'smart'){
            openSmartCanvasPage(nextCanvas.id);
            return;
        }
        classicWorkspaceView.reset();
        classicMinimap.reset();
        classicPromptPanel.reset();
        classicImageEditor.reset();
        classicOutputPreview.reset();
        canvas = nextCanvas;
        resetCanvasHistory();
        canvas.logs = canvas.logs || [];
        nodes = canvas.nodes || [];
        connections = canvas.connections || [];
        viewport = localViewportForCanvas(canvas.id, {x:0, y:0, scale:1});
        canvas.viewport = {...viewport};
        lastCanvasUpdatedAt = Number(canvas.updated_at || 0);
        localCanvasDirty = false;
        resetCanvasSaveSnapshot();
        resetTransientRunState(nodes);
        sanitizeConnections();
        if(!window.CanvasSession?.enabled) pruneMissingComfyWorkflows();
        await refreshMissingCanvasAssets();
        selected.clear();
        setCanvasMode(true);
        renderCanvasList();
        render();
        resumeCanvasImageTasks();
        startCanvasRemotePolling();
        setStatus('Ready');
        if(window.CanvasSession?.enabled){
            await window.MemberCanvasEdit.mount({id:canvas.id, dirty:() => localCanvasDirty || savingCanvasNow || saveCanvasAgain,
                taskRecovery:classicTaskRecovery(),
                snapshot:() => ({...canvas, ...canvasSavePayload()}), flush:flushClassicCanvasBeforeFrontendReload,
                refresh:syncRemoteCanvasNow, restore:restoreClassicMemberDraft, busy:() => savingCanvasNow || saveCanvasAgain || cascadeRunningIds.size>0 || nodes.some(n => n.running || (n._pending || []).some(task => !task.failed && !task.paused)),
                openCopy:async copy => {await loadCanvasList(false);await openCanvas(copy.id);},
                reload:async () => { const loaded=await openCanvas(id); if(!loaded) throw new Error('画布重载失败，请重试'); return loaded; },
                changed:lease => { if(!lease.canEdit){ clearTimeout(saveTimer); saveTimer=null; } else resumeCanvasImageTasks(); }
            });
        } else checkCanvasLock().then(() => {
            if(!canvasLockedByOther && !canvasLockHolder){
                acquireCanvasLock();
            }
            startCanvasLockPolling();
        });
        return canvas;
    } catch(e) {
        setStatus('打开画布失败');
        console.error(e);
    }
}

async function returnToCanvasManager(){
    if(window.MemberCanvasEdit && !await window.MemberCanvasEdit.leave()) return;
    openCanvasRequestSeq++;
    clearTimeout(saveTimer);
    clearTimeout(remoteSyncTimer);
    remoteSyncTimer = null;
    if(canvas && localCanvasDirty) await saveCanvas();
    stopCanvasRemotePolling();
    stopCanvasLockPolling();
    await releaseCanvasLock();
    classicOutputPreview.reset();
    canvas = null;
    nodes = [];
    connections = [];
    selected.clear();
    viewport = {x: -1800, y: -1000, scale: 1};
    setCanvasMode(false);
    trashMode = false;
    pendingPurgeCanvasId = null;
    refreshGateViewControls();
    await loadCanvasList(false);
    setCreateMode(false);
}

window.addEventListener('frontend:before-reload', event => {
    if(typeof event.detail?.waitUntil === 'function'){
        if(window.CanvasSession?.enabled){
            event.detail.waitUntil(window.MemberCanvasEdit.prepareReload());
            return;
        }
        event.detail.waitUntil(flushClassicCanvasBeforeFrontendReload());
    }
});

// beforeunload — protect unsaved work and release lock on tab close
window.addEventListener('beforeunload', event => {
    if(localCanvasDirty || savingCanvasNow || saveCanvasAgain || saveTimer){
        event.preventDefault();
        event.returnValue = '';
    }
    releaseCanvasLockOnExit();
});

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
    setStatus('Moving to trash...');
    try {
        const res = await window.CanvasApi.deleteCanvas(id);
        if(!res.ok) throw new Error('移入回收站失败');
        const deletingCurrent = canvas?.id === id;
        pendingDeleteCanvasId = null;
        canvases = canvases.filter(item => item.id !== id);
        if(deletingCurrent){
            canvas = null;
            nodes = [];
            connections = [];
            selected.clear();
            viewport = {x: -1800, y: -1000, scale: 1};
            setCanvasMode(false);
        }
        renderCanvasList();
        setStatus(canvases.length ? '已移入回收站' : '暂无画布，请先新建画布');
        await loadCanvasList(false);
    } catch(e) {
        setStatus('移入回收站失败');
        console.error(e);
    }
}
async function restoreCanvas(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    setStatus('Restoring...');
    try {
        const res = await window.CanvasApi.restoreCanvas(id);
        if(!res.ok) throw new Error('恢复画布失败');
        pendingPurgeCanvasId = null;
        deletedCanvases = deletedCanvases.filter(item => item.id !== id);
        await loadCanvasList(false);
        await loadTrashList();
        setStatus('画布已恢复');
    } catch(e) {
        setStatus('恢复画布失败');
        console.error(e);
    }
}
async function purgeCanvas(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    setStatus('Deleting...');
    try {
        const res = await window.CanvasApi.purgeCanvas(id);
        if(!res.ok) throw new Error('彻底删除失败');
        pendingPurgeCanvasId = null;
        deletedCanvases = deletedCanvases.filter(item => item.id !== id);
        renderCanvasList();
        setStatus(deletedCanvases.length ? '已彻底删除' : '回收站为空');
        await loadTrashList();
    } catch(e) {
        setStatus('彻底删除失败');
        console.error(e);
    }
}
window.createCanvas = createCanvas;
window.createSmartCanvas = createSmartCanvas;
window.loadCanvasList = loadCanvasList;
window.openCanvas = openCanvas;
window.deleteCanvas = deleteCanvas;
window.returnToCanvasManager = returnToCanvasManager;
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
gateCanvasList?.addEventListener('scroll', () => requestAnimationFrame(positionCanvasMetaPopover), {passive:true});
window.addEventListener('resize', () => requestAnimationFrame(positionCanvasMetaPopover));
window.addEventListener('studio-theme-change', event => applyTheme(event.detail?.theme || 'light'));
bindClassicImageEditorControls();
window.addEventListener('resize', () => {
    classicImageEditor.syncImageEditOverflow();
    scheduleMinimapRender();
});
backToManagerBtn.addEventListener('click', returnToCanvasManager);

const CANVAS_NODE_ASSET_DRAG_TYPE = 'application/x-canvas-node-asset';
const IMAGE_DROP_EXT_RE = /\.(png|jpe?g|webp|gif)$/i;
const IMAGE_DROP_TEXT_TYPES = [
    'text/uri-list',
    'text/plain',
    'text/html',
    'DownloadURL',
    'text/x-moz-url',
    'text/x-file-url',
    'public.file-url',
    'public.url',
    'UniformResourceLocator',
    'FileName',
    'FileNameW'
];
const IMAGE_DROP_TYPE_HINT_RE = /^(?:files?|image\/.+|text\/(?:uri-list|html|plain|x-moz-url|x-file-url)|downloadurl|public\.(?:file-url|url)|uniformresourcelocator|filenamew?)$|application\/x-qt-(?:windows-mime|image)|application\/x-moz-file|com\.eagle/i;


bindClassicCropDragEvents();

const loopPromptVisiting = new Set();

const canvasAssetHover = window.CanvasCore.createAssetHoverController(showCanvasAssetHoverPreviewNow, hideCanvasAssetHoverPreviewNow, positionCanvasAssetHoverPreviewNow);
bindClassicAssetPanelLifecycle();

window.closeAssetManager = closeAssetManager;

const generationSettingsOpen = new WeakMap();


const CANVAS_GENERATOR_TYPES = ['generator','msgen','comfy','ltxDirector','video'];
const CANVAS_IMAGE_OUTPUT_TYPES = ['generator','msgen','comfy','ltxDirector'];
const CANVAS_MEDIA_OUTPUT_TYPES = ['generator','msgen','comfy','ltxDirector','video'];

let videoCostBackfillRunning = false;

bindClassicLedgerUpdates();

window.openCanvasLog = openCanvasLog;
window.openCanvasCost = openCanvasCost;
window.closeCanvasLog = closeCanvasLog;

window.createCanvasBackup = createCanvasBackup;
window.showBackupList = showBackupList;
window.closeBackupModal = closeBackupModal;

bindClassicLibraryControls();
bindClassicWorkflowToggle();
bindClassicLogToggle();
bindClassicWorkflowFileInput();
bindClassicLibraryNavigation();
bindClassicWorkflowDropEvents();

bindClassicAssetManagerEvents();

classicWorkspaceView.bind();
bindClassicMinimapEvents();

bindClassicBoardEvents();
bindClassicMediaImportEvents();
// 使用捕获阶段，避免节点内控件 stopPropagation 后让画布快捷键偶发失效。
bindClassicKeyboardEvents();
bindClassicSessionVisibility();
bindClassicSelectionBlur();

function escapeHtml(str){ return window.CanvasCore?.escapeHtml(str) || ''; }
function escapeAttr(str){ return escapeHtml(str); }

window.onload = async () => {
    if(window.CanvasSession) await window.CanvasSession.ready;
    applyTheme(localStorage.getItem('studio_theme') || localStorage.getItem(CANVAS_THEME_KEY) || 'light');
    applyQuickToolbarState();
    updateCanvasIdentityButton();

    document.title = 'shadox';
    classicOutputPreview.bind();
    applyViewport();
    await loadConfig();
    pruneMissingComfyWorkflows();
    await loadCanvasList(false, {refreshFolders:true});
    setCanvasMode(false);
};

bindClassicCardMenuDismissal();

async function openCanvasCoverStyle(item){
    if(item.kind === 'smart') return openSmartCanvasPage(item.id, true);
    await openCanvas(item.id);
    if(canvas?.id === item.id) window.editCanvasCover();
}

// Apply availability and policies together; never rebuild a field while it is being edited.
function refreshCanvasModelControls(){
    if(!canvas) return;
    const ids = [];
    for(const node of nodes){
        if(!['generator','video','llm'].includes(node.type)) continue;
        const element = nodesEl.querySelector(`.node[data-id="${CSS.escape(node.id)}"]`);
        if(!element) continue;
        const active = document.activeElement;
        if(element.contains(active) && active?.matches('input,textarea,select,[contenteditable="true"]')){
            if(!element.dataset.modelRefreshPending){
                element.dataset.modelRefreshPending = 'true';
                element.addEventListener('focusout', () => {
                    delete element.dataset.modelRefreshPending;
                    setTimeout(refreshCanvasModelControls, 0);
                }, {once:true});
            }
        } else ids.push(node.id);
    }
    refreshNodes(ids);
}
function applyCanvasModelConfig(cfg){
    if(!Array.isArray(cfg.api_providers)) return;
    const providers = window.CanvasCore.availableModelProviders(cfg.api_providers);
    if(JSON.stringify(providers) === JSON.stringify(apiProviders)) return;
    apiProviders = providers;
    refreshCanvasModelControls();
}
window.VideoDurationPolicy.watch({read:()=>window.CanvasApi.getConfig(),apply:applyCanvasModelConfig});
