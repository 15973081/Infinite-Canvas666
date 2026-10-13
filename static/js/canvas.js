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
window.StudioFrameMessages.subscribe(['canvas_updated','providers-changed','workflows-changed','comfy-instances-changed','canvas-focus'], event => {

    if(event.data?.type === 'canvas_updated') handleCanvasUpdatedMessage(event.data);
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
const backToManagerBtn = document.getElementById('backToManagerBtn');
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
const LTX_DIRECTOR_WORKFLOW = 'LTXDirectorv2-API.json';
const LTX_DIRECTOR_WF_NODE = '46';
const LTX_DIRECTOR_SEED_NODE = '94:28';
const LTX_SEGMENT_COLORS = ['#e07b3a', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#f59e0b'];

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

async function touchCanvasOpened(id){
    if(!id) return null;
    try {
        const data = await window.CanvasApi.touchCanvas(id, null);
        if(!data) return null;
        return data.canvas || data;
    } catch(e) {
        console.warn('touch canvas failed', e);
        return null;
    }
}

async function openSmartCanvasPage(id, editCover=false){
    if(!id) return;
    if(window.CanvasNavigation)return window.CanvasNavigation.go(window.CanvasNavigation.canvasUrl(id,{cover:editCover}));
    await window.FrontendVersion?.checkForUpdate?.();
    const path = `/static/smart-canvas.html?id=${encodeURIComponent(id)}${editCover ? '&cover=1':''}`;
    const target = window.CanvasSession?.enabled ? window.CanvasSession.url(path) : path;
    window.location.href = window.FrontendVersion?.versionedUrl(target) || target;
}

async function openCanvas(id){
    if(window.CanvasNavigation && id !== window.CanvasNavigation.canvasId){
        return window.CanvasNavigation.go(window.CanvasNavigation.canvasUrl(id));
    }
    if(window.MemberCanvasEdit?.active && window.MemberCanvasEdit.active.id !== id){
        if(!await window.MemberCanvasEdit.leave()) return;
    }
    const openSeq = ++openCanvasRequestSeq;
    const loadingState=window.StudioTransferStatus?.begin({kind:'canvas'});
    setStatus('画布节点加载中…');
    try {
        const data = await window.CanvasApi.getCanvas(id, {errorFallback:'打开画布失败'});
        if(openSeq !== openCanvasRequestSeq) return;
        resetCascadeRuntimeState();
        const nextCanvas = data.canvas;
        loadingState?.phase('正在准备 '+(nextCanvas.nodes?.length||0)+' 个节点…');
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
        document.title = (canvas.title || '经典画布') + ' · shadox';
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
        render();
        resumeCanvasImageTasks();
        startCanvasRemotePolling();
        setStatus('Ready');
        if(window.CanvasSession?.enabled){
            await window.MemberCanvasEdit.mount({id:canvas.id, dirty:() => localCanvasDirty || savingCanvasNow || saveCanvasAgain,
                taskRecovery:classicTaskRecovery(),
                snapshot:() => ({...canvas, ...canvasSavePayload()}), flush:flushClassicCanvasBeforeFrontendReload,
                refresh:syncRemoteCanvasNow, restore:restoreClassicMemberDraft, busy:() => savingCanvasNow || saveCanvasAgain || cascadeRunningIds.size>0 || nodes.some(n => n.running || (n._pending || []).some(task => !task.failed && !task.paused)),
                openCopy:async copy => window.CanvasNavigation.go(window.CanvasNavigation.canvasUrl(copy.id)),
                reload:async () => { const loaded=await openCanvas(id); if(!loaded) throw new Error('画布重载失败，请重试'); return loaded; },
                changed:lease => { if(!lease.canEdit){ clearTimeout(saveTimer); saveTimer=null; } else resumeCanvasImageTasks(); }
            });
        }
        return canvas;
    } catch(e) {
        setStatus('打开画布失败');
        loadingState?.fail(e);
        console.error(e);
    } finally {loadingState?.finish();}
}

async function returnToCanvasManager(){
    return window.CanvasNavigation.go(window.CanvasNavigation.homeUrl());
}

window.addEventListener('frontend:before-reload', event => {
    if(typeof event.detail?.waitUntil === 'function'){
        event.detail.waitUntil(window.CanvasNavigation.prepareReload(()=>window.CanvasSession?.enabled ? window.MemberCanvasEdit.prepareReload() : flushClassicCanvasBeforeFrontendReload()));
    }
});

// beforeunload — protect unsaved work; MemberCanvasEdit owns lease release.
window.addEventListener('beforeunload', event => {
    if(localCanvasDirty || savingCanvasNow || saveCanvasAgain || saveTimer){
        event.preventDefault();
        event.returnValue = '';
    }
});

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
    applyQuickToolbarState();

    document.title = 'shadox';
    classicOutputPreview.bind();
    applyViewport();
    await loadConfig();
    pruneMissingComfyWorkflows();
    const requested=window.CanvasNavigation?.canvasId;
    if(requested){
        window.CanvasNavigation.adopt(requested);
        const loaded=await openCanvas(requested);
        if(!loaded)window.CanvasNavigation.failure();
        else window.CanvasCover?.openRequested();
    } else {
        const create=new URLSearchParams(location.search).get('create')==='classic';
        window.top.location.replace(window.CanvasNavigation.homeUrl()+(create?'?create=classic':''));
    }
};

window.CanvasNavigation?.setLeaveGuard(async()=>{
    if(!window.CanvasNavigation.confirmLocalWork())return false;
    if(window.CanvasSession?.enabled)return await window.MemberCanvasEdit.leave();
    return await flushClassicCanvasBeforeFrontendReload();
});

bindClassicCardMenuDismissal();

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
