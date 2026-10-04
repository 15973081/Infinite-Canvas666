/* Smart canvas application entry (1 of 8 task modules).
 * Owns startup order, shared legacy bindings and page lifecycle.
 * Task functions and event registration live in /static/js/canvas/smart/.
 * Keep shared state initialization here during this compatibility migration:
 * moving its initialization can change permission, save and async task behavior.
 * See docs/canvas-eight-module-refactor.md for boundaries and follow-up rules.
 */
const params = new URLSearchParams(location.search);
const canvasId = params.get('id') || '';
const shell = document.getElementById('shell');
const world = document.getElementById('world');
const composer = document.getElementById('composer');
const createMenu = document.getElementById('createMenu');
const promptInput = document.getElementById('promptInput');
const mentionPicker = document.getElementById('mentionPicker');
const mentionPreview = document.getElementById('mentionPreview');
const engineSelect = document.getElementById('engineSelect');
const dynamicParams = document.getElementById('dynamicParams');
const runBtn = document.getElementById('runBtn');
const cascadeRunBtn = document.getElementById('cascadeRunBtn');
const fileInput = document.getElementById('fileInput');
const apiKindToggle = document.getElementById('apiKindToggle');
const inputThumbsRow = document.getElementById('inputThumbsRow');
const inputPromptPreview = document.getElementById('inputPromptPreview');
const smartLogModal = document.getElementById('smartLogModal');
const smartLogList = document.getElementById('smartLogList');
const smartShortcutModal = document.getElementById('smartShortcutModal');
const smartWorkflowToggle = document.getElementById('smartWorkflowToggle');
const smartWorkflowTransferModal = document.getElementById('smartWorkflowTransferModal');
const smartWorkflowTransferSub = document.getElementById('smartWorkflowTransferSub');
const smartWorkflowExportMeta = document.getElementById('smartWorkflowExportMeta');
const smartWorkflowImportInput = document.getElementById('smartWorkflowImportInput');
const smartWorkflowImportDropZone = document.getElementById('smartWorkflowImportDropZone');
const selectionBox = document.getElementById('selectionBox');
const assetDialogBackdrop = document.getElementById('assetDialogBackdrop');
const assetDialogTitle = document.getElementById('assetDialogTitle');
const assetDialogInput = document.getElementById('assetDialogInput');
const assetDialogTarget = document.getElementById('assetDialogTarget');
const assetDialogCancel = document.getElementById('assetDialogCancel');
const assetDialogOk = document.getElementById('assetDialogOk');
let canvas = null;
let canvasUsesConnections = true;
let nodes = [];
const smartMinimap = createSmartMinimap();
let selectedId = '';
let selectedIds = [];
let selectedImage = {nodeId:'', index:-1};
let lastComposerNodeId = '';
let activeComposerSubject = null;
let smartComposerBaseline = null;
let dragState = null;
let loopInsertPreview = null;
let selectionState = null;
let isRKeyDown = false;
let selectionJustFinished = false;
let resizeState = null;
let llmInstructionResizeState = null;
let thumbDragState = null;
let uploadTargetId = '';
let pendingGroupUploadPoint = null;
let mentionRange = null;
let panState = null;
let didPan = false;
let portDragState = null;
let saveTimer = null;
let smartSaveInFlight = null;
let smartSaveAgain = false;
let smartCanvasDirty = false;
let smartSaveErrorNotified = false;
let apiProviders = [];
let comfyWorkflows = [];
let comfyInstanceCount = 1;
let assetLibrary = {categories:[]};
const ASSET_SIDEBAR_BATCH_SIZE = 60;
const smartAssetPanel = createSmartAssetPanel();
const LOCAL_ASSET_LIBRARY_ID = '__local_assets__';
let localAssetLibrary = {items:[], tree:null};
let mentionSource = 'input';
let mentionAssetCategoryId = '';
let assetLibraryUpdatedAt = 0;
const PROMPT_PRESETS_KEY = 'smart_canvas_prompt_presets_v1';
const PROMPT_TEMPLATE_GROUPS_KEY = 'smart_canvas_prompt_template_groups_v1';
const PROMPT_TEMPLATE_OVERRIDES_KEY = 'smart_canvas_prompt_template_overrides_v1';
let promptPresets = [];
let builtinPromptTemplates = [];
let promptLibraries = [];
let promptTemplateGroups = [];
let promptTemplateOverrides = {hiddenBuiltinIds:[], editedBuiltins:{}};
const smartPromptPanels = createSmartPromptPanels();
let createMenuPoint = {x:0, y:0};
let nodeClipboard = null;
let imageClickTimer = null;
let suppressImageClickUntil = 0;
let lastMouseWorld = null;
let lastConfigRefreshAt = 0;
let zoomPreviewState = null;
let runTimerInterval = null;
let smartCascadeRunning = false;
let smartCascadeActiveLoopId = '';
let smartCascadeStopRequested = false;
let smartCascadeSilentSelection = false;
let smartCascadeRunPath = null;
const smartCascadeRuns = new Map();
let smartLoopContext = null;
let transientSmartCloudLinks = [];
let runBtnCooldownToken = 0;
let smartRunStateToken = 0;
const activeSmartTaskPolls = new Map();
const activeSmartNodeResumes = new WeakMap();
const smartNodeRunTokens = new Map();
let lastImagePasteAt = 0;
let lastNodePasteAt = 0;
let suppressNodeClickUntil = 0;
let textSelectionGuard = null;
const UNDO_LIMIT = 40;
const undoStack = [];
let undoSuppressed = false;
let pendingUndoSnapshot = null;

let comfyWorkflowCache = {};
const smartImageEditor = createSmartImageEditor();
const smartPreviewGestures = createSmartPreviewGestures();
const smartVideoTrimPanel = createSmartVideoTrimPanel();
const smartAudioPreview = createSmartAudioPreview();
const PANORAMA_RATIO_PRESETS = {
    square:{w:1, h:1},
    portrait:{w:2, h:3},
    landscape:{w:3, h:2},
    portrait43:{w:3, h:4},
    landscape43:{w:4, h:3},
    story:{w:9, h:16},
    wide:{w:16, h:9},
    ultrawide:{w:21, h:9},
    ultratall:{w:9, h:21}
};
let panoramaState = {
    enabled:false,
    ratio:'wide',
    customW:16,
    customH:9,
    fov:75,
    yaw:0,
    pitch:0,
    drag:null,
    three:null,
    renderer:null,
    scene:null,
    camera:null,
    sphere:null,
    texture:null,
    threeLoadPromise:null,
    image:null,
    ctx:null,
    animationId:0,
    loadedSrc:'',
    loadToken:0
};
window.__smartCanvasPanoramaState = panoramaState;
let viewport = {x:0, y:0, scale:1};
let settings = {
    engine:'api',
    apiKind:'image',
    provider_id:'',
    model:'',
    ratio:'square',
    resolution:'1k',
    customRatio:'',
    customRatioWidth:'',
    customRatioHeight:'',
    customSize:'',
    customWidth:'',
    customHeight:'',
    quality:'auto',
    count:1,
    videoProvider:'',
    videoModel:'',
    videoDuration:5,
    videoAspect:'16:9',
    videoResolution:'',
    videoEnhancePrompt:false,
    videoEnableUpsample:false,
    videoWatermark:false,
    videoCameraFixed:false,
    videoGenerateAudio:false,
    videoMultimodal:false,
    videoTaskMode:'auto',
    videoUseFrameRoles:false,
    videoTrustedAsset:false,
    videoTrustedSource:'library',
    videoTempShLinks:[],
    msgenModel:'zimage',
    msCustomModel:'',
    msRatio:'square',
    msResolution:'1k',
    msCustomRatio:'',
    msCustomRatioWidth:'',
    msCustomRatioHeight:'',
    msCustomSize:'',
    msCustomWidth:'',
    msCustomHeight:'',
    comfyMode:'text',
    comfyWorkflow:'',
    comfyParams:{},
    width:1024,
    height:1024,
    enhanceStrength:0.5,
    enhanceUpscale:false,
    enhanceUpscaleRes:2048,
    editUpscale:false,
    editUpscaleRes:2048,
    promptH:124
};
const MS_GEN_MODELS = {
    zimage: { label:'ZImage', modelId:'Tongyi-MAI/Z-Image-Turbo', supportsImage:false, endpoint:'/generate' },
    qwen_edit: { label:'Qwen Edit', modelId:'Qwen/Qwen-Image-Edit-2511', supportsImage:true, endpoint:'/api/angle/generate' },
    klein_edit: { label:'Klein', modelId:'black-forest-labs/FLUX.2-klein-9B', supportsImage:true, endpoint:'/api/ms/generate' },
    custom: { label:'Custom', modelId:'', acceptsImage:true, endpoint:'/api/ms/generate' }
};
const SIZE_MAP = {
    square: {'1k':'1024x1024','2k':'2048x2048','4k':'4096x4096'},
    landscape: {'1k':'1536x1024','2k':'2048x1360','4k':'3520x2336'},
    portrait: {'1k':'1024x1536','2k':'1360x2048','4k':'2336x3520'},
    landscape43: {'1k':'1024x768','2k':'2048x1536','4k':'3312x2480'},
    portrait43: {'1k':'768x1024','2k':'1536x2048','4k':'2480x3312'},
    wide: {'1k':'1536x864','2k':'2048x1152','4k':'3840x2160'},
    story: {'1k':'864x1536','2k':'1152x2048','4k':'2160x3840'},
    ultrawide: {'1k':'1536x656','2k':'2048x880','4k':'3840x1648'},
    ultratall: {'1k':'656x1536','2k':'880x2048','4k':'1648x3840'}
};
const RES_LONG_SIDE = { '1k':1024, '2k':2048, '4k':3840 };
const RES_PIXEL_LIMIT = { '1k':2359296, '2k':4194304, '4k':8294400 };

function refreshIcons(){ if(window.lucide) lucide.createIcons(); }
function uid(prefix){ return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`; }
function escapeHtml(str){ return window.CanvasCore?.escapeHtml(str) || ''; }
const escapeAttr = escapeHtml;


const RECENT_SMART_SETTINGS_KEY = 'smart_canvas_recent_run_settings_v1';

const initialSmartSettings = cloneSmartSettings(settings);
let canvasDefaultSmartSettings = cloneSmartSettings(settings);
let recentSmartSettingsByMode = {};

async function backToCanvasList(){
    if(window.MemberCanvasEdit && !await window.MemberCanvasEdit.leave()) return;
    savePromptDraftForCurrent();
    clearTimeout(saveTimer);
    saveTimer = null;
    if(canvas && !isSmartCanvasLocked()){
        smartCanvasDirty = true;
        const saved = await saveCanvas({force:true});
        if(!saved && smartCanvasDirty){
            toast('画布保存失败，请稍后重试');
            return;
        }
    }
    releaseSmartCanvasLockOnExit();
    await window.FrontendVersion?.checkForUpdate?.();
    const target = window.CanvasSession?.enabled ? window.CanvasSession.url('/static/canvas.html') : '/static/canvas.html';
    window.location.replace(window.FrontendVersion?.versionedUrl(target) || target);
}

function applyTheme(theme){
    const dark = theme === 'dark';
    document.documentElement.classList.toggle('theme-dark', dark);
    document.documentElement.classList.toggle('studio-theme-dark', dark);
    document.body?.classList.toggle('theme-dark', dark);
    document.body?.classList.toggle('studio-theme-dark', dark);
}
function toast(text){
    const el = document.getElementById('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => el.classList.remove('show'), 1800);
}

const MEDIA_NODE_DEFAULT_SCALE = 2;
const MEDIA_GROUP_PREVIOUS_DEFAULT_SCALE = 1.6;
const MEDIA_GROUP_DEFAULT_SCALE = 0.8;
const MEDIA_GROUP_THUMB_BASE = 224;
const MEDIA_GROUP_MAX_VISIBLE_ROWS = 3;
const EMPTY_UPLOAD_NODE_WIDTH = 316;
const EMPTY_UPLOAD_NODE_HEIGHT = 194;

const PROMPT_LLM_INSTRUCTION_DEFAULT_H = 58;
const PROMPT_LLM_INSTRUCTION_MIN_H = 40;
const PROMPT_LLM_INSTRUCTION_MAX_H = 400;

let smartComputationContext = null;

let pendingSmartViewportRefresh = null;

const smartViewportScrolls = new WeakMap();


const DEFAULT_VIDEO_MODELS = ['veo3-fast','veo3','sora','runway','kling','pika','minimax-video','wan-v2','seedance-1.0-pro'];

async function loadConfig(){
    try {
        const cfg = await window.CanvasApi.getConfig();
        apiProviders = window.CanvasCore.availableModelProviders(Array.isArray(cfg.api_providers) ? cfg.api_providers : []);
        updateSmartCanvasCostButton();
        sanitizeSmartApiSelection(settings);
        refreshSmartModelControls();
        lastConfigRefreshAt = Date.now();
    } catch(e) {
        toast('API 设置加载失败');
    }
}
async function refreshSmartConfigFromSettings(){
    await loadConfig();
    updateSmartCanvasCostButton();
    refreshSmartModelControls();
    const node = selectedNode();
    if(node?.type === 'smart-prompt') {
        applySettingsToNode(node);
        render();
    }
}

// 多人协作同步：一个稳定的客户端 id，既用于 WS 连接，也随 saveCanvas 上报，
// 服务器广播 canvas_updated 时带回 client_id，自己发的就忽略，避免自我刷新。
const smartClientId = `canvas_smart_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
let canvasSyncInFlight = false;
let canvasSyncTimer = null;
let canvasMetaPollTimer = null;
let smartServerNodeIds = new Set();
let smartServerConnectionKeys = new Set();
let smartCanvasLockHolder = null;
let smartCanvasLockPollTimer = null;

const smartAssetHover = window.CanvasCore.createAssetHoverController(showAssetHoverPreviewNow, hideAssetHoverPreviewNow, positionAssetHoverPreviewNow);
bindSmartAssetPanelLifecycle();

async function loadCanvas(options={}){
    if(!canvasId) return;
    const requestedId=canvasId, entry=window.MemberCanvasEdit?.active, epoch=entry?.lease.epoch;
    if(options.observe && !window.MemberCanvasEdit?.canRefresh) return;
    try {
        const data = await window.CanvasApi.getCanvas(canvasId, {errorFallback:'读取画布失败'});
        if(!data?.canvas) throw new Error('画布数据为空');
        if(canvasId!==requestedId || data.canvas.id!==requestedId) return;
        if(options.observe && (entry!==window.MemberCanvasEdit?.active || epoch!==entry?.lease.epoch || !window.MemberCanvasEdit?.canRefresh ||
            !Number.isSafeInteger(data.canvas.revision) || data.canvas.revision<=Number(canvas?.revision || 0))) return canvas;
        smartMinimap.reset();
        smartAudioPreview.reset();
        if(!options.observe || canvas?.id !== data.canvas.id){
            smartPromptPanels.reset();
            smartImageEditor.reset();
        }
        canvas = data.canvas;
        smartServerNodeIds = new Set((Array.isArray(canvas.nodes) ? canvas.nodes : []).map(node => node?.id).filter(Boolean));
        smartServerConnectionKeys = new Set((Array.isArray(canvas.connections) ? canvas.connections : []).map(c => `${c?.from}->${c?.to}:${c?.kind || 'flow'}`));
        smartCanvasDirty = false;
        smartSaveAgain = false;
        smartSaveErrorNotified = false;
        clearTimeout(saveTimer);
        saveTimer = null;
        undoStack.length = 0;
        pendingUndoSnapshot = null;
        canvasUsesConnections = Object.prototype.hasOwnProperty.call(canvas || {}, 'connections');
        document.title = canvas.title || '智能画布';
        updateSmartCanvasNav();
        updateSmartCanvasCostButton();
        nodes = (Array.isArray(canvas.nodes) ? canvas.nodes : []).map(normalizeLegacySmartNode).filter(Boolean);
        nodes.forEach(n => {
            const pendingTasks = smartPendingTasks(n);
            if(pendingTasks.length){
                n.pending = pendingTasks.filter(task=>!task.paused).length;
                n.running = false;
            } else if(n.pending){
                n.pending = 0;
            }
        });
        canvas.connections = Array.isArray(canvas.connections) ? canvas.connections : [];
        const cleanedDetachedInputs = cleanupDetachedRunInputRefs();
        /* 不从服务端合并视野 —— 每台电脑保持各自的视角 */
        /* viewport = {...viewport, ...(canvas.viewport || {})}; */
        viewport.scale = safeScale(viewport.scale);
        if(canvas.settings) settings = {...settings, ...canvas.settings};
        canvasDefaultSmartSettings = cloneSmartSettings(settings);
        loadRecentSmartSettings();
        if(settings.comfy_workflow && !settings.comfyWorkflow) settings.comfyWorkflow = settings.comfy_workflow;
        if(settings.comfy_params && !settings.comfyParams) settings.comfyParams = settings.comfy_params;
        updateProviderModels();
        applyViewport();
        render();
        if(cleanedDetachedInputs) scheduleSave();
        resumeSmartPendingTasks();
        startCanvasMetaPoll();
        if(window.CanvasSession?.enabled){
            await window.MemberCanvasEdit.mount({id:canvasId,dirty:() => smartCanvasDirty || Boolean(smartSaveInFlight) || smartSaveAgain,
                taskRecovery:smartTaskRecovery(),
                snapshot:() => ({...canvas,nodes:JSON.parse(JSON.stringify(nodes)),settings:settingsForStorage(canvasDefaultSmartSettings || initialSmartSettings)}),
                refresh:()=>loadCanvas({observe:true}),restore:restoreSmartMemberDraft,busy:() => Boolean(smartSaveInFlight) || smartSaveAgain || smartCascadeAnyRunning() || nodes.some(smartNodeInFlight),
                openCopy:async copy => {window.location.assign('/static/smart-canvas.html?id='+encodeURIComponent(copy.id)+'&workspace='+encodeURIComponent(window.CanvasSession.context.workspace.id));},
                reload:async () => { const loaded=await loadCanvas(); if(!loaded) throw new Error('画布重载失败，请重试'); return loaded; },
                flush:async () => {
                    clearTimeout(saveTimer); saveTimer=null;
                    if(smartCanvasDirty || smartSaveInFlight) await saveCanvas({force:true});
                    return !smartCanvasDirty && !smartSaveInFlight && !smartSaveAgain;
                },
                changed:lease => {
                    document.body.classList.toggle('smart-canvas-readonly',!lease.canEdit);
                    if(lease.canEdit) resumeSmartPendingTasks();
                    if(!lease.canEdit){clearTimeout(saveTimer);saveTimer=null;}
                    if(runBtn) runBtn.disabled=!lease.canEdit || smartCascadeAnyRunning();
                    if(cascadeRunBtn) cascadeRunBtn.disabled=!lease.canEdit;
                }
            });
        } else { await checkSmartCanvasLock(); startSmartCanvasLockPolling(); }
        return canvas;
    } catch(e) { toast(e?.message || '智能画布加载失败'); }
}

// 跨页"素材库 → 画布"剪贴板：素材库管理页把所选素材写进这个 localStorage key，
// 画布里按 Ctrl+V 读取并批量生成图片节点（网格平铺），用完即清空（一次性）。
const SMART_CANVAS_ASSET_INBOX_KEY = 'smart_canvas_asset_inbox';

let smartGeometryFrame = null;
let smartGeometryPasses = 0;
let smartGeometryAll = false;
const smartGeometryNodes = new Set();

let smartVideoCostBackfillRunning = false;

bindSmartLedgerUpdates();
function openSmartCanvasShortcuts(){
    smartShortcutModal?.classList.add('open');
    refreshIcons();
}
function closeSmartCanvasShortcuts(){
    smartShortcutModal?.classList.remove('open');
}

const smartRenderedNodes = new WeakMap();
let smartRenderedConnectionStates = new Map();



let smartImageToolBusy = false;

const SMART_IMAGE_DROP_EXT_RE = /\.(png|jpe?g|webp|gif)$/i;
const SMART_IMAGE_DROP_TEXT_TYPES = [
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
const SMART_IMAGE_DROP_TYPE_HINT_RE = /^(?:files?|image\/.+|text\/(?:uri-list|html|plain|x-moz-url|x-file-url)|downloadurl|public\.(?:file-url|url)|uniformresourcelocator|filenamew?)$|application\/x-qt-(?:windows-mime|image)|application\/x-moz-file|com\.eagle/i;

const smartLoopPromptVisiting = new Set();

class ImageTaskRecoverSignal extends Error {
    constructor(info){
        const data = info || {};
        super(data.message || '任务未丢失，可稍后手动查询结果');
        this.imageTaskRecover = true;
        this.taskId = data.taskId || data.task_id || '';
        this.recoverTaskId = data.recoverTaskId || data.upstream_task_id || data.task_id || '';
        this.providerId = data.providerId || data.provider_id || '';
        this.kind = data.kind || 'image';
    }
}

bindSmartWorkspaceGestures();

if(apiKindToggle){
    apiKindToggle.querySelectorAll('[data-kind]').forEach(btn => {
        btn.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            const kind = btn.dataset.kind;
            if(kind === settings.apiKind) return;
            settings.apiKind = kind;
            applyRecentSmartSettingsForCurrentMode();
            syncApiKindToggleVisibility();
            renderDynamicParams();
            persistActiveSmartSettings();
            scheduleSave();
        };
    });
}
let promptResizeState = null;
const promptResize = document.getElementById('promptResize');
if(promptResize){
    promptResize.addEventListener('mousedown', e => {
        if(e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        promptResizeState = {
            startY: e.clientY,
            startH: Number(settings.promptH) || promptInput.offsetHeight || 124
        };
    });
}
runBtn.onclick = runGeneration;
cascadeRunBtn.onclick = () => {
    const node = selectedNode();
    const loopId = resolveSmartCascadeLoop(node?.id)?.node?.id || '';
    if(loopId && smartCascadeIsLoopRunning(loopId)) {
        requestSmartCascadeStop(loopId);
        return;
    }
    runSmartCascade();
};
fileInput.onchange = () => {
    const groupPoint = pendingGroupUploadPoint;
    if(!fileInput.files?.length){
        pendingGroupUploadPoint = null;
        uploadTargetId = '';
        return;
    }
    const targetId = groupPoint ? '' : (uploadTargetId || selectedId);
    handleFiles(fileInput.files, targetId, groupPoint ? {point:groupPoint} : {});
    pendingGroupUploadPoint = null;
    uploadTargetId = '';
    fileInput.value = '';
};
bindSmartLibraryToggle();
bindSmartWorkflowTransferEvents();
bindSmartLibraryControls();

bindSmartLibraryDropEvents();
bindSmartComposerInputEvents();
bindSmartImageEditorControls();
bindSmartPreviewPanEvents();
bindSmartImageEditorPanEvents();
bindSmartPreviewCompareEvents();
smartVideoTrimPanel.bind();
smartAudioPreview.bind();
bindSmartDrawingControls();
bindSmartPanoramaControls();
bindSmartImageEditorViewport();
window.addEventListener('studio-theme-change', event => applyTheme(event.detail?.theme || 'light'));
try {
    const apiChannel = new BroadcastChannel('studio-api');
    apiChannel.onmessage = async event => {
        if(event.data?.type === 'providers-changed' || event.data?.type === 'workflows-changed' || event.data?.type === 'comfy-instances-changed'){
            await refreshSmartConfigFromSettings();
        }
        if(event.data?.type === 'asset_library_updated') handleAssetLibraryUpdatedMessage(event.data);
        if(event.data?.type === 'canvas_updated') handleCanvasUpdatedMessage(event.data);
        if(event.data?.type === 'canvas_locked') handleSmartCanvasLocked(event.data);
        if(event.data?.type === 'canvas_unlocked') handleSmartCanvasUnlocked(event.data);
    };
} catch(e) {}
// Focus refresh is shared with the policy watcher below.
window.addEventListener('message', event => {
    if(event.origin && event.origin !== location.origin) return;
    if(event.data?.type === 'studio-theme') applyTheme(event.data.theme || 'light');
    if(event.data?.type === 'providers-changed' || event.data?.type === 'workflows-changed' || event.data?.type === 'comfy-instances-changed') refreshSmartConfigFromSettings();
    if(event.data?.type === 'asset_library_updated') handleAssetLibraryUpdatedMessage(event.data);
    if(event.data?.type === 'canvas_updated') handleCanvasUpdatedMessage(event.data);
    if(event.data?.type === 'canvas_locked') handleSmartCanvasLocked(event.data);
    if(event.data?.type === 'canvas_unlocked') handleSmartCanvasUnlocked(event.data);

});

window.onload = async () => {
    if(window.CanvasSession) await window.CanvasSession.ready;
    applyTheme(localStorage.getItem('studio_theme') || localStorage.getItem('canvas_theme') || 'light');
    loadPromptPresets();
    loadPromptTemplateGroups();
    loadPromptTemplateOverrides();
    if(window.lucide) lucide.createIcons();
    connectAssetLibrarySyncSocket();
    await loadConfig();
    await loadCanvas();
    syncApiKindToggleVisibility();
    render();
    const background = () => Promise.all([loadPromptTemplates(), loadAssetLibrary()]);
    if(window.CanvasMediaLoader) window.CanvasMediaLoader.defer(background);
    else background();
};
window.addEventListener('beforeunload', event => {
    if(smartCanvasDirty || smartSaveInFlight || saveTimer){
        event.preventDefault();
        event.returnValue = '';
    }
    releaseSmartCanvasLockOnExit();
});
window.addEventListener('frontend:before-reload', event => {
    if(typeof event.detail?.waitUntil !== 'function') return;
    if(window.CanvasSession?.enabled){
        event.detail.waitUntil(window.MemberCanvasEdit.prepareReload());
        return;
    }
    event.detail.waitUntil((async () => {
        clearTimeout(saveTimer);
        saveTimer = null;
        const saved = await saveCanvas({force:true});
        return saved !== false && !smartCanvasDirty && !smartSaveInFlight && !smartSaveAgain;
    })());
});
bindSmartSessionVisibility();

function refreshSmartModelControls(){
    const active = document.activeElement;
    const editing = dynamicParams?.contains(active) ? dynamicParams : null;
    if(editing && active?.matches('input,textarea,select,[contenteditable="true"]')){
        if(!editing.dataset.modelRefreshPending){
            editing.dataset.modelRefreshPending = 'true';
            editing.addEventListener('focusout', () => {
                delete editing.dataset.modelRefreshPending;
                setTimeout(refreshSmartModelControls, 0);
            }, {once:true});
        }
        return;
    }
    renderDynamicParams();
    refreshSmartNodes(nodes.filter(node=>node.type === 'smart-prompt').map(node=>node.id));
}
function applySmartModelConfig(cfg){
    if(!Array.isArray(cfg.api_providers)) return;
    const providers = window.CanvasCore.availableModelProviders(cfg.api_providers);
    if(JSON.stringify(providers) === JSON.stringify(apiProviders)) return;
    apiProviders = providers;
    refreshSmartModelControls();
}
window.VideoDurationPolicy.watch({read:()=>window.CanvasApi.getConfig(),apply:applySmartModelConfig});
