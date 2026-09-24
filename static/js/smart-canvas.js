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
const minimap = document.getElementById('minimap');
const minimapContent = document.getElementById('minimapContent');
const imageEditModal = document.getElementById('imageEditModal');
const smartAudioLightbox = document.getElementById('smartAudioLightbox');
const smartAudioLightboxTitle = document.getElementById('smartAudioLightboxTitle');
const smartAudioLightboxHost = document.getElementById('smartAudioLightboxHost');
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
const assetToggle = document.getElementById('assetToggle');
const assetPanel = document.getElementById('assetPanel');
const assetCloseBtn = document.getElementById('assetCloseBtn');
const assetLibrarySelect = document.getElementById('assetLibrarySelect');
const assetCategorySelect = document.getElementById('assetCategorySelect');
const assetGrid = document.getElementById('assetGrid');
const assetNameSearch = document.getElementById('assetNameSearch');
const assetDropZone = document.getElementById('assetDropZone');
const workflowEmpty = document.getElementById('workflowEmpty');
const assetImageControls = document.getElementById('assetImageControls');
const assetAddCategoryBtn = document.getElementById('assetAddCategoryBtn');
const assetRenameCategoryBtn = document.getElementById('assetRenameCategoryBtn');
const assetDialogBackdrop = document.getElementById('assetDialogBackdrop');
const assetDialogTitle = document.getElementById('assetDialogTitle');
const assetDialogInput = document.getElementById('assetDialogInput');
const assetDialogTarget = document.getElementById('assetDialogTarget');
const assetDialogCancel = document.getElementById('assetDialogCancel');
const assetDialogOk = document.getElementById('assetDialogOk');
const assetHoverPreview = document.getElementById('assetHoverPreview');
const promptPresetPanel = document.getElementById('promptPresetPanel');
const promptPresetClose = document.getElementById('promptPresetClose');
const promptPresetStatus = document.getElementById('promptPresetStatus');
const promptPresetSelect = document.getElementById('promptPresetSelect');
const promptPresetName = document.getElementById('promptPresetName');
const promptPresetText = document.getElementById('promptPresetText');
const promptPresetApply = document.getElementById('promptPresetApply');
const promptPresetDelete = document.getElementById('promptPresetDelete');
const promptPresetNew = document.getElementById('promptPresetNew');
const promptPresetSave = document.getElementById('promptPresetSave');
const promptTemplatePanel = document.getElementById('promptTemplatePanel');
const promptTemplateClose = document.getElementById('promptTemplateClose');
const promptTemplateSearch = document.getElementById('promptTemplateSearch');
const promptTemplateLibrarySelect = document.getElementById('promptTemplateLibrarySelect');
const promptTemplateCats = document.getElementById('promptTemplateCats');
const promptTemplateBody = document.getElementById('promptTemplateBody');
const composerTemplateBtn = document.getElementById('composerTemplateBtn');
let minimapViewport = document.getElementById('minimapViewport');
let canvas = null;
let canvasUsesConnections = true;
let nodes = [];
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
let assetLibraryOpen = false;
let assetTab = 'image';
let activeAssetCategoryId = '';
let activeAssetLibraryId = '';
let activeWorkflowAssetCategoryId = '';
let assetNameSearchQuery = '';
const ASSET_SIDEBAR_BATCH_SIZE = 60;
let assetSidebarRenderKey = '';
let assetSidebarRenderedCount = ASSET_SIDEBAR_BATCH_SIZE;
let assetSidebarFilteredCount = 0;
const LOCAL_ASSET_LIBRARY_ID = '__local_assets__';
let localAssetLibrary = {items:[], tree:null};
let activeLocalAssetFolderId = '__root__';
let mentionSource = 'input';
let mentionAssetCategoryId = '';
let assetLibraryUpdatedAt = 0;
let assetLibraryRefreshTimer = null;
const PROMPT_PRESETS_KEY = 'smart_canvas_prompt_presets_v1';
const PROMPT_TEMPLATE_GROUPS_KEY = 'smart_canvas_prompt_template_groups_v1';
const PROMPT_TEMPLATE_OVERRIDES_KEY = 'smart_canvas_prompt_template_overrides_v1';
let promptPresets = [];
let builtinPromptTemplates = [];
let promptLibraries = [];
let activePromptLibraryId = 'system';
let promptTemplateGroups = [];
let promptTemplateOverrides = {hiddenBuiltinIds:[], editedBuiltins:{}};
let promptTemplateCategory = 'all';
let promptTemplateSelectedId = '';
let promptTemplateEditing = false;
let promptTemplateGroupEditMode = false;
let promptPresetDeleteArmed = false;
let createMenuPoint = {x:0, y:0};
let nodeClipboard = null;
let imageClickTimer = null;
let suppressImageClickUntil = 0;
let lastMouseWorld = null;
let lastConfigRefreshAt = 0;
let smartMinimapState = null;
let smartMinimapDrag = false;
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
let cropState = null;
let cropDrag = null;
let imageEditMode = 'crop';
let imageEditModeTouched = false;
let editDrawState = null;
let editTextItems = [];
let editTextSelectedId = '';
let editTextDrag = null;
let editTextDirty = false;
let editTextInlineEditor = null;
let editDrawUndoStack = [];
let editDrawRedoStack = [];
const EDIT_DRAW_HISTORY_MAX = 40;
let brushTool = 'free';
let brushLabelCounter = 1;
let gridCustomMode = false;
let gridCustomLines = [];
let gridCustomOrientation = 'h';
let gridCustomHistory = [];
let gridCustomDrag = null;
let gridOperationMode = 'split';
let gridJoinLayout = null;
let gridJoinDrag = null;
let gridJoinImageCache = new Map();
let gridJoinUserMoved = false;
let gridJoinOutputSize = 2048;
let imageEditZoom = 1.0;
let imageEditBaseW = 0;
let imageEditBaseH = 0;
let previewZoom = 1.0;
let previewPan = {x:0, y:0};
let previewPanDrag = null;
let previewCompareDrag = false;
let previewComparePos = 50;
let imageEditPanDrag = null;
let previewNavState = {nodeId:'', index:0, count:0};
let detachedEditPreview = null;
const VIDEO_TRIM_MIN_DURATION = 0.1;
let videoTrimState = {active:false, start:0, end:0, duration:0, previewing:false, busy:false, sourceUrl:''};
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
const LOCAL_I18N = {
    "common.apiSettings": "API 设置",
    "common.comfyuiSettings": "工作流设置",
    "common.darkMode": "黑夜模式",
    "common.language": "中文",
    "common.cancel": "取消",
    "common.confirm": "确定",
    "common.save": "保存",
    "common.delete": "删除",
    "common.edit": "编辑",
    "common.run": "运行",
    "common.running": "运行中",
    "common.custom": "自定义",
    "common.close": "关闭",
    "common.loading": "加载中...",
    "common.project": "项目主页",
    "common.moreSettings": "更多设置",
    "studio.ready": "系统就绪",
    "studio.unifiedConsole": "统一创作控制台",
    "studio.describeVision": "描述你想生成的画面...",
    "studio.engineSource": "引擎来源",
    "studio.local": "本地",
    "studio.dimensions": "尺寸",
    "studio.renderArt": "开始生成",
    "studio.renderLocal": "本地生成",
    "studio.renderCloud": "云端生成",
    "studio.loadMore": "加载更多归档",
    "studio.loadingArchives": "正在加载归档...",
    "studio.errorHistory": "历史加载失败",
    "studio.promptExecution": "提示词记录",
    "studio.replicate": "复用",
    "studio.modelscopeTokenRequired": "需要 ModelScope Token，请在侧边栏 API Token 中设置。",
    "studio.processing": "处理中...",
    "studio.uploading": "上传中...",
    "studio.uploadFailed": "上传失败",
    "studio.localModel": "本地",
    "studio.cloudProcessing": "云端处理中...",
    "studio.submittingModelscope": "正在提交到 ModelScope...",
    "studio.canvasReady": "画布就绪",
    "studio.archives": "归档",
    "studio.inputSource": "输入图片",
    "studio.dropImage": "拖放图片到这里",
    "studio.change": "更换",
    "studio.parameters": "参数",
    "studio.engine": "引擎",
    "studio.refinementStrength": "细节强度",
    "studio.superResolution": "超分辨率",
    "studio.doublePixels": "像素加倍 (4K)",
    "studio.kleinDetailEnhance": "Klein 细节增强",
    "studio.enhancementStrength": "增强强度",
    "studio.promptOptional": "提示词（可选）",
    "studio.beginRemaster": "开始增强",
    "studio.computingPixels": "正在计算像素...",
    "studio.inputPrompt": "输入提示词",
    "studio.referenceLayers": "参考图层",
    "studio.cloudUsesMain": "云端使用主图",
    "studio.connecting": "连接中...",
    "studio.detailLora": "细节增强 LoRA",
    "studio.loraStrength": "LoRA 强度",
    "studio.executeSynthesis": "开始合成",
    "studio.synthesizing": "合成中",
    "studio.cameraPerspective": "相机与视角控制",
    "studio.cameraControl": "相机控制",
    "studio.rotation": "旋转",
    "studio.pitch": "俯仰",
    "studio.distance": "距离",
    "studio.reset": "重置",
    "studio.resultPreview": "结果预览",
    "studio.generateAngle": "生成新角度",
    "studio.generatedCommand": "生成指令",
    "studio.copy": "复制",
    "canvas.noApiProviders": "暂无 API 平台",
    "canvas.noApiProvidersHint": "暂无 API 平台，请到 API 设置添加",
    "canvas.noImageModelsHint": "暂无生图模型，请到 API 设置添加",
    "canvas.noModelsHint": "暂无模型，请到 API 设置添加",
    "canvas.title": "shadox",
    "canvas.backToManager": "返回画布管理",
    "canvas.untitled": "未命名画布",
    "canvas.chooseFirst": "请选择或新建画布",
    "canvas.image": "上传",
    "canvas.uploadCard": "上传卡片",
    "canvas.prompt": "提示词",
    "canvas.promptTemplateLibrary": "提示词模板库",
    "canvas.promptTemplateShort": "模板库",
    "canvas.promptTemplateSystem": "系统提示词",
    "canvas.promptTemplateSearch": "搜索模板",
    "canvas.promptTemplateAll": "全部",
    "canvas.promptTemplateView": "视角",
    "canvas.promptTemplateStoryboard": "分镜",
    "canvas.promptTemplateCharacter": "角色",
    "canvas.promptTemplateProduct": "产品",
    "canvas.promptTemplateLighting": "光影",
    "canvas.promptTemplateEmpty": "没有匹配的模板",
    "canvas.promptTemplatePick": "选择一个模板",
    "canvas.promptTemplatePositive": "正向提示词",
    "canvas.promptTemplateNegative": "负向提示词",
    "canvas.promptTemplateParams": "参数建议",
    "canvas.promptTemplateApplyPositive": "正向",
    "canvas.promptTemplateApplyFull": "完整应用",
    "canvas.loop": "循环",
    "canvas.loopNode": "循环节点",
    "canvas.loopCount": "次数",
    "canvas.loopStart": "起始",
    "canvas.loopSerial": "循环",
    "canvas.loopParallel": "并发",
    "canvas.loopHint": "控制一键运行轮数",
    "canvas.loopPromptToggle": "提示词",
    "canvas.loopImageToggle": "图片",
    "canvas.loopImageStart": "起始计数",
    "canvas.loopBatchSize": "批次",
    "canvas.loopImageWillOutput": "当前会输出 {n} 张图片",
    "canvas.loopImageEmpty": "把图片或图片组连接到左侧输入口",
    "canvas.loopImageLabel": "循环图片 {n}",
    "canvas.loopVideoToggle": "视频",
    "canvas.loopVideoWillOutput": "当前会输出 {n} 个视频",
    "canvas.loopVideoEmpty": "把视频或视频组连接到左侧输入口",
    "canvas.loopVideoLabel": "循环视频 {n}",
    "canvas.outputConvertToInputGroup": "转为输入组",
    "canvas.outputCopyToInputGroup": "复制为新的输入组",
    "canvas.outputGroupActions": "分组",
    "canvas.outputFileActions": "文件",
    "canvas.outputDownloadAllImages": "下载全部图片",
    "canvas.outputDownloadEmpty": "没有可下载的本地图片",
    "canvas.loopVariablePrompt": "可变提示词",
    "canvas.loopVariablePlaceholder": "例如：现在生成第[计数]个卖点",
    "canvas.loopFixedPrompt": "固定提示词",
    "canvas.loopFixedPlaceholder": "每一轮都会附加的文本",
    "canvas.insertCounter": "插入计数",
    "canvas.insertTotal": "插入总数",
    "canvas.insertProgress": "插入进度",
    "canvas.counterToken": "计数",
    "canvas.totalToken": "总数",
    "canvas.progressToken": "进度",
    "canvas.loopRounds": "轮",
    "canvas.loopRound": "第",
    "canvas.apiGenerate": "API生成",
    "canvas.msGenerate": "Modelscope生成",
    "canvas.videoGenerate": "视频生成",
    "canvas.group": "分组",
    "canvas.logs": "日志",
    "canvas.generationLogs": "生成日志",
    "canvas.noLogs": "还没有生成日志",
    "canvas.success": "成功",
    "canvas.failed": "失败",
    "canvas.selectCanvas": "选择画布",
    "canvas.trash": "回收站",
    "canvas.backToList": "返回画布列表",
    "canvas.subtitle": "打开已有画布，或新建一个开始创作。",
    "canvas.trashSubtitle": "已删除画布可恢复，30 天后自动清理。",
    "canvas.refresh": "刷新列表",
    "canvas.openTrash": "打开回收站",
    "canvas.newCanvas": "新建画布",
    "canvas.newSmartCanvas": "新建智能画布",
    "canvas.folders": "文件夹",
    "canvas.folder": "文件夹",
    "canvas.allCanvases": "全部画布",
    "canvas.uncategorized": "未分类",
    "canvas.newSubfolder": "新建子文件夹",
    "canvas.deleteFolder": "删除文件夹",
    "canvas.folderNamePrompt": "文件夹名称",
    "canvas.deleteFolderConfirm": "删除该文件夹？其中的画布和子文件夹会移动到上一级。",
    "canvas.folderCreateFailed": "新建文件夹失败",
    "canvas.folderRenameFailed": "重命名文件夹失败",
    "canvas.folderDeleteFailed": "删除文件夹失败",
    "canvas.moveToFolder": "移动到文件夹",
    "canvas.moveFolderFailed": "移动画布失败",
    "canvas.smartCanvas": "智能画布",
    "canvas.smartCanvasShort": "智能",
    "canvas.newSmartCanvasPlaceholder": "智能画布名称（可留空使用默认）",
    "canvas.newCanvasPlaceholder": "新画布名称（可留空使用默认）",
    "canvas.trashNote": "回收站中的画布会在 30 天后自动清理。",
    "canvas.dropImage": "拖放素材到画布",
    "canvas.imageCard": "上传节点",
    "canvas.imageCardHint": "支持图片/音频/视频/批量上传",
    "canvas.llmNode": "LLM 节点",
    "canvas.modelscopeGenerate": "Modelscope生成",
    "canvas.comfyGenerate": "ComfyUI 生成",
    "canvas.videoGenerateNode": "视频生成",
    "canvas.hint": "拖拽画布移动，Ctrl 框选多选，拖动选中节点可一起移动。上传/提示词节点右下端口拖线到生成节点。",
    "canvas.cropImage": "裁剪图片",
    "canvas.cropHint": "拖动裁剪框移动，拖右下角调整大小",
    "canvas.editImage": "编辑图片",
    "canvas.editImageSub": "选择裁剪、遮罩或画笔模式",
    "canvas.modeCrop": "裁剪",
    "canvas.modeOutpaint": "扩图",
    "canvas.modeMask": "遮罩",
    "canvas.modeBrush": "画笔",
    "canvas.modeGrid": "宫格切分",
    "canvas.brushSize": "笔刷",
    "canvas.clear": "清空",
    "canvas.maskHint": "白色区域为要编辑的遮罩",
    "canvas.maskHint2": "在要重绘的位置涂白，保存后会生成遮罩图片节点",
    "canvas.color": "颜色",
    "canvas.textContent": "文字",
    "canvas.textSize": "字号",
    "canvas.brushHint": "直接在图片上绘制标记或草图",
    "canvas.maskEdit": "遮罩编辑",
    "canvas.brushEdit": "画笔编辑",
    "canvas.applyMask": "生成遮罩节点",
    "canvas.applyBrush": "应用画笔",
    "canvas.applyOutpaint": "应用扩图",
    "canvas.outpaintImage": "扩图",
    "canvas.outpaintHint": "拖动红框调整画布范围，最大不超过 4K 尺寸，确认后空白区域填充白色",
    "canvas.applyGrid": "切分到 Output",
    "canvas.gridHint": "按切分线分割图片，间隔会从线两侧扣除",
    "canvas.gridCustom": "自定义",
    "canvas.gridCustomTitle": "自由放置切割线",
    "canvas.gridHLines": "横向线",
    "canvas.gridVLines": "竖向线",
    "canvas.gridOrientH": "水平",
    "canvas.gridOrientHTitle": "点击图片放置水平线",
    "canvas.gridOrientV": "垂直",
    "canvas.gridOrientVTitle": "点击图片放置竖直线",
    "canvas.gridUndo": "撤销上一条线",
    "canvas.gridClearLines": "清除所有自定义线",
    "canvas.gridGap": "间隔(px)",
    "canvas.gridPresets": "预设",
    "canvas.gridWillOutput": "将输出 {n} 张",
    "canvas.copyPrompt": "复制提示词",
    "canvas.copied": "已复制",
    "canvas.rerun": "再次运行",
    "canvas.noPromptMeta": "没有记录提示词",
    "canvas.reset": "重置",
    "canvas.applyCrop": "应用裁剪",
    "canvas.manageModels": "管理模型",
    "canvas.manageModelsSub": "拖动调整顺序，删除不需要的模型，也可以输入新模型名称。",
    "canvas.apiProvider": "API 平台",
    "canvas.provider": "平台",
    "canvas.displayName": "显示名称",
    "canvas.providerId": "平台 ID",
    "canvas.keepKey": "留空则保持当前 Key",
    "canvas.modelInputPlaceholder": "粘贴或输入模型名称",
    "canvas.add": "添加",
    "canvas.manageModelList": "管理模型列表...",
    "canvas.manageApiProviders": "管理 API 平台...",
    "canvas.countSuffix": "个",
    "canvas.noCanvas": "暂无画布",
    "canvas.startWithNewCanvas": "点击右上方「新建画布」开始创作",
    "canvas.trashEmpty": "回收站为空",
    "canvas.deletedCanvas": "已删除画布",
    "canvas.changeIcon": "修改画布图标",
    "canvas.modePreview": "预览",
    "canvas.previewImage": "预览图片",
    "canvas.previewHint": "查看大图，可切换到裁剪 / 扩图 / 遮罩等模式",
    "canvas.sortRecent": "最近编辑",
    "canvas.sortName": "名称",
    "canvas.ownerLabel": "负责人 / 项目",
    "canvas.ownerPlaceholder": "输入负责人或项目",
    "canvas.colorLabel": "颜色标记",
    "canvas.colorNone": "无",
    "canvas.pin": "置顶",
    "canvas.unpin": "取消置顶",
    "canvas.editMeta": "编辑图标 / 颜色 / 负责人",
    "canvas.pinned": "已置顶",
    "canvas.metaSaveFailed": "保存失败",
    "canvas.deletedAt": "删除于",
    "canvas.purgeConfirm": "清理画布？素材仍保留在画布资产中",
    "canvas.moveToTrashConfirm": "画布移入回收站？素材仍保留",
    "canvas.restoreCanvas": "恢复画布",
    "canvas.purgeCanvas": "彻底删除",
    "canvas.rename": "重命名",
    "canvas.moveToTrash": "移入回收站",
    "canvas.loadingCanvases": "正在加载画布列表...",
    "canvas.needCanvas": "请先新建或选择画布",
    "canvas.enterCanvasName": "输入画布名称后确认",
    "canvas.noCanvasCreateFirst": "暂无画布，请先新建画布",
    "canvas.canvasListFailed": "画布列表加载失败",
    "canvas.trashLoadFailed": "回收站加载失败",
    "canvas.movedToTrash": "已移入回收站",
    "canvas.moveToTrashFailed": "移入回收站失败",
    "canvas.purged": "已彻底删除",
    "canvas.clickDragPasteImage": "点击/拖拽上传素材，或在空节点粘贴图片",
    "canvas.promptPlaceholder": "输入提示词...",
    "canvas.groupEmpty": "拖入图片或提示词到此",
    "canvas.grouped": "已成组",
    "canvas.imageCount": "张图片",
    "canvas.promptCount": "个提示词",
    "canvas.connectHere": "连接到这里",
    "canvas.dragConnect": "拖线连接",
    "canvas.resize": "调整大小",
    "canvas.nodeMode": "节点",
    "canvas.chatMode": "聊天",
    "canvas.systemPrompt": "系统提示词...",
    "canvas.llmInputEmpty": "把 Prompt 连到 LLM 输入点",
    "canvas.llmOutputEmpty": "运行后会输出文本，可连到生成卡片",
    "canvas.resizePanes": "拖动调整输入/输出高度",
    "canvas.running": "运行中",
    "canvas.startChat": "开始一段聊天...",
    "canvas.chatInput": "输入消息...",
    "canvas.sending": "发送中",
    "canvas.images": "Images",
    "canvas.custom": "自定义",
    "canvas.fitImageSize": "适配图片",
    "canvas.adaptiveRatio": "适配比例",
    "canvas.inputImagesEmpty": "把图片或图片组连到这里",
    "canvas.enableLora": "启用 LoRA",
    "canvas.loraStrength": "LoRA 强度",
    "canvas.noLoraForModel": "当前模型暂无绑定 LoRA，可在 API 设置 · Modelscope · LoRA 管理中添加。",
    "canvas.noLoraBoundError": "当前模型没有可用 LoRA，请先到 API 设置绑定",
    "canvas.imageReadFailed": "无法读取参考图尺寸",
    "canvas.msFailed": "Modelscope 生成失败",
    "canvas.generationFailed": "生成失败",
    "canvas.apiFailed": "API 生成失败",
    "canvas.emptyRatio": "比例空",
    "canvas.decrease": "减少",
    "canvas.decreaseCount": "减少生成数量",
    "canvas.increase": "增加",
    "canvas.increaseCount": "增加生成数量",
    "canvas.ratioWidth": "比例宽",
    "canvas.ratioHeight": "比例高",
    "canvas.width": "宽度",
    "canvas.height": "高度",
    "canvas.generating": "生成中",
    "canvas.needPrompt": "请先连接提示词",
    "canvas.needPromptOrImage": "请先连接提示词或图片",
    "canvas.needImage": "请先连接图片",
    "canvas.videoNeedsPrompt": "请先连接提示词",
    "canvas.needPromptToLLM": "请先连接 Prompt 到 LLM",
    "canvas.createFailed": "新建画布失败",
    "canvas.openFailed": "打开画布失败",
    "canvas.restored": "画布已恢复",
    "canvas.restoreFailed": "恢复画布失败",
    "canvas.purgeFailed": "彻底删除失败",
    "canvas.defaultProviderNoDelete": "默认平台不能删除，可以修改名称、地址和模型。",
    "canvas.noModelsAddFirst": "暂无模型，输入名称后添加",
    "canvas.manageLlmModelsTitle": "管理 LLM 模型",
    "canvas.manageLlmModelsSub": "这些模型会出现在 LLM 节点下拉框里。拖动排序，删除或新增后保存。",
    "canvas.manageApiTitle": "管理 API 平台",
    "canvas.manageApiSub": "选择平台后维护 Base URL、Key 和这个平台下的生成模型。Key 会写入 API/.env，页面只显示脱敏状态。",
    "canvas.manageVideoModelsTitle": "管理视频模型",
    "canvas.manageVideoModelsSub": "这些模型会出现在视频生成节点下拉框里。选择平台后维护该平台的视频模型。",
    "canvas.keepCurrentKey": "保持当前",
    "canvas.enterApiKey": "输入 API Key",
    "canvas.deleteModel": "删除模型",
    "canvas.deleteLink": "删除连线",
    "canvas.download": "下载",
    "canvas.comfyModeText": "文生图",
    "canvas.comfyModeEnhance": "细节增强",
    "canvas.comfyModeEdit": "图片编辑",
    "canvas.comfyModeCustom": "自定义",
    "canvas.comfyText": "文生图",
    "canvas.comfyEnhance": "细节增强",
    "canvas.comfyEdit": "图片编辑",
    "canvas.comfyCustom": "自定义",
    "canvas.comfyRunning": "处理中",
    "canvas.comfyRun": "Run ComfyUI",
    "canvas.comfyNeedImages": "需要",
    "canvas.comfyNoWorkflow": "请先在 ComfyUI 设置中保存工作流。",
    "canvas.comfyLoadingWorkflow": "正在读取工作流参数...",
    "canvas.comfyNoExtraParams": "这个工作流只有图片/提示词输入，没有额外参数。",
    "canvas.ltxDirector": "LTX Director",
    "canvas.ltxDurationSec": "秒数",
    "canvas.ltxDurationFrames": "帧数",
    "canvas.ltxFps": "帧率",
    "canvas.ltxLinkedImages": "已连接图片",
    "canvas.ltxRun": "运行 LTX",
    "canvas.ltxRunning": "LTX 运行中",
    "canvas.ltxFailed": "LTX 生成失败",
    "canvas.ltxNoOutput": "LTX 没有返回产物",
    "canvas.ltxImageSegNeedRef": "LTX 图片段缺少参考图",
    "canvas.ltxTimelineLoadFailed": "LTX 时间线 UI 加载失败，请查看控制台。",
    "canvas.ltxTimelineScriptMissing": "LTX 时间线脚本未加载。",
    "canvas.videoModel": "视频模型",
    "canvas.videoDuration": "时长",
    "canvas.videoAspect": "比例",
    "canvas.videoResolution": "分辨率",
    "canvas.videoUpsample": "提升到 1080p",
    "canvas.videoEnhancePrompt": "优化提示词",
    "canvas.videoWatermark": "水印",
    "canvas.videoCameraFixed": "固定镜头",
    "canvas.videoGenerateAudio": "生成音频",
    "canvas.videoMultimodal": "智能多参",
    "canvas.videoFirstLastFrames": "首尾帧",
    "canvas.videoRoleReference": "参考",
    "canvas.videoRoleFirstFrame": "首帧",
    "canvas.videoRoleLastFrame": "尾帧",
    "canvas.videoFailed": "视频生成失败",
    "smart.title": "智能画布",
    "smart.engineApi": "API生成",
    "smart.engineVolcengine": "火山引擎",
    "smart.engineMs": "Modelscope生成",
    "smart.engineComfy": "ComfyUI生成",
    "smart.kindImage": "图片",
    "smart.kindVideo": "视频",
    "smart.promptPlaceholder": "描述你想生成或编辑的图片...",
    "smart.promptTemplateLibrary": "模板库",
    "smart.tplAll": "全部",
    "smart.tplCatView": "视角",
    "smart.tplCatStoryboard": "分镜",
    "smart.tplCatCharacter": "角色",
    "smart.tplCatProduct": "产品",
    "smart.tplCatLighting": "光影",
    "smart.tplCatMine": "我的",
    "smart.tplBuiltin": "内置",
    "smart.tplMine": "我的",
    "smart.tplBuiltinTemplate": "内置模板",
    "smart.tplMineTemplate": "我的模板",
    "smart.tplManageGroups": "管理分组",
    "smart.tplGroupManage": "分组管理",
    "smart.tplGroupHint": "这里只调整上方分类，不影响模板内容",
    "smart.tplAdd": "新增",
    "smart.tplDone": "完成",
    "smart.tplRename": "重命名",
    "smart.tplSaveCurrent": "存当前",
    "smart.tplNewTemplate": "新模板",
    "smart.tplNewTemplateName": "新模板",
    "smart.tplNoMatches": "没有匹配的模板",
    "smart.tplEditTemplate": "修改模板",
    "smart.tplDeleteTemplate": "删除模板",
    "smart.tplName": "模板名称",
    "smart.tplGroup": "所属分组",
    "smart.tplContent": "模板内容",
    "smart.tplPositive": "正向提示词",
    "smart.tplNegative": "负向提示词",
    "smart.tplParams": "参数建议",
    "smart.tplApplyPositive": "正向",
    "smart.tplApplyFull": "完整应用",
    "smart.tplPickOrCreate": "选择或新建一个模板",
    "smart.tplRequired": "模板名称和内容不能为空",
    "smart.tplNewGroupPrompt": "新分组名称",
    "smart.tplNewGroupDefault": "新分组",
    "smart.tplGroupNamePrompt": "分组名称",
    "smart.tplDeleteGroupConfirm": "删除分组？该分组里的我的模板会移动到“我的”。",
    "smart.promptResize": "拖拽调整文本框高度",
    "smart.run": "运行",
    "smart.modePreview": "预览",
    "smart.previewImage": "预览图片",
    "smart.previewHint": "滚轮缩放，拖动查看，右下角可拉动对比原图",
    "smart.panorama360": "360全景",
    "smart.panoramaRatio": "视窗比例",
    "smart.panoramaExport": "导出画面",
    "smart.panoramaHint": "360全景：拖动转动，滚轮缩放，可调整视窗比例",
    "smart.panoramaLoading": "加载中...",
    "smart.panoramaLoadFailed": "360全景加载失败",
    "smart.panoramaExportDone": "已导出到画布",
    "smart.panoramaExportFailed": "导出全景失败",
    "smart.compareSource": "对比原图",
    "smart.compareNoSource": "该图片没有原图可对比",
    "smart.compareHover": "点击查看输入端缩略图",
    "smart.compareEmpty": "无原图可对比",
    "smart.compareHintPick": "点缩略图开始对比",
    "smart.compareCancelTip": "点击取消对比",
    "smart.compareUseTip": "点击与该图对比",
    "smart.compareDrag": "拖动对比",
    "smart.uploadHint": "点击上传 / 拖入素材",
    "smart.createImportNode": "上传节点",
    "smart.createImportNodeSub": "支持图片/音频/视频/批量上传",
    "smart.createExportNode": "导出节点",
    "smart.createExportNodeSub": "接收多种格式并一键导出",
    "smart.createPromptSub": "手写或用 LLM 生成文本",
    "smart.createLoopSub": "控制一键运行轮数和批次",
    "smart.kindAudio": "音频",
    "smart.kindText": "文本",
    "smart.exportNodeReady": "选择文件夹后一键导出",
    "smart.exportNodeEmpty": "连接节点后收集图片、视频、音频和文本",
    "smart.exportChooseFolder": "选择文件夹并导出",
    "smart.exportNodeNote": "浏览器会弹出本机文件夹选择器",
    "smart.exportNodeHint": "连接内容后可一键导出",
    "smart.exportEmpty": "导出节点里还没有可导出的内容",
    "smart.exportFailed": "导出失败",
    "smart.exportDone": "已导出 {n} 个文件",
    "smart.exportPickerUnsupported": "当前浏览器不支持选择文件夹，已使用默认导出路径",
    "smart.hintEmpty": "支持图片 / 视频 / 音频，也可直接文生图",
    "smart.hintMulti": "多图会作为同一组参考图发送",
    "smart.hintSingle": "点击后在下方输入编辑需求",
    "smart.hintPending": "正在生成…",
    "smart.deleteNode": "删除节点",
    "smart.deleteImage": "删除",
    "smart.platform": "平台",
    "smart.model": "模型",
    "smart.size": "尺寸",
    "smart.ratio": "比例",
    "smart.resolution": "分辨率",
    "smart.quality": "质量",
    "smart.count": "生成数量",
    "smart.qualityAuto": "自动",
    "smart.qualityLow": "低",
    "smart.qualityMid": "中",
    "smart.qualityHigh": "高",
    "smart.countUnit": "张",
    "smart.imageRatio": "图片比例",
    "smart.custom": "自定义",
    "smart.apiPlatform": "API 平台",
    "smart.imageModel": "生图模型",
    "smart.noApiPlatform": "暂无 API 平台",
    "smart.noImageModel": "暂无生图模型",
    "smart.noMsModel": "暂无 Modelscope 模型",
    "smart.msFunction": "Modelscope 生成功能",
    "smart.msCustomModel": "自定义 Modelscope 模型",
    "smart.customModel": "自定义模型",
    "smart.videoPlatform": "视频平台",
    "smart.videoModel": "视频模型",
    "smart.noVideoPlatform": "暂无视频平台",
    "smart.noVideoModel": "暂无视频模型",
    "smart.videoDuration": "时长",
    "smart.videoDurationTip": "时长（秒）",
    "smart.videoAspect": "画面比例",
    "smart.videoResolution": "视频分辨率",
    "smart.videoEnhancePrompt": "提示词增强",
    "smart.videoUpsample": "高清",
    "smart.videoGenerateAudio": "生成音频",
    "smart.videoMultimodal": "智能多参",
    "smart.videoCameraFixed": "镜头固定",
    "smart.videoWatermark": "水印",
    "smart.videoUseFrameRoles": "首尾帧",
    "smart.videoTrustedAsset": "可信素材模式",
    "smart.videoAspectKeep": "原图比例",
    "smart.videoAspectAdaptive": "自适应",
    "smart.videoResAuto": "自动",
    "smart.comfyMode": "ComfyUI 模式",
    "smart.upscaleTarget": "超分目标",
    "smart.workflow": "工作流",
    "smart.noWorkflow": "暂无 ComfyUI 工作流",
    "smart.noOption": "无选项",
    "smart.width": "宽",
    "smart.height": "高",
    "smart.widthFull": "宽度",
    "smart.heightFull": "高度",
    "smart.ratioW": "比例宽",
    "smart.ratioH": "比例高",
    "smart.strength": "强度",
    "smart.superResolution": "超分",
    "smart.diceOn": "随机已开启，点击关闭",
    "smart.diceOff": "随机已关闭，点击开启",
    "smart.inputThumbs": "输入图",
    "smart.inputCount": "{n} 输入图",
    "smart.inputNum": "输入 {n}",
    "smart.inputBlocked": "已屏蔽",
    "smart.inputClickBlock": "点击屏蔽输入",
    "smart.inputClickEnable": "点击启用输入",
    "smart.inputSelf": "自身，默认参与编辑",
    "smart.inputUpstream": "上游输入",
    "smart.inputUpstreamWorkflow": "工作流上游输入",
    "smart.imageModeTitle": "图片模式",
    "smart.imageModeEdit": "编辑",
    "smart.imageModeWorkflow": "工作流",
    "smart.imageModeEditHint": "默认优先编辑这张卡自己的图片；只有空卡片时才会承接上游。",
    "smart.imageModeWorkflowHint": "始终承接上游图片作为编辑源，适合图1 -> 图2 -> 图3这类链路。",
    "smart.imageModeWorkflowNeedInput": "工作流模式会忽略这张卡自身结果，请先接入上游图片。",
    "smart.promptPreset": "预设",
    "smart.promptPresetDefault": "提示词预设",
    "smart.promptPresetUnnamed": "未命名预设",
    "smart.promptPresetNone": "暂无预设",
    "smart.promptPresetEmpty": "提示词为空",
    "smart.promptPresetSavedNew": "已存为新预设",
    "smart.promptPresetPanelHint": "选择预设后可直接修改名称和内容。",
    "smart.promptPresetPanelEmpty": "当前还没有预设，可以先把当前提示词存为新预设。",
    "smart.promptPresetEditing": "编辑完成后点击保存修改。",
    "smart.promptPresetRequired": "名称和内容都不能为空。",
    "smart.promptPresetSaved": "修改已保存",
    "smart.promptPresetDeleteAgain": "再次点击删除",
    "smart.promptPresetDeleteConfirm": "将删除“{name}”，再次点击确认。",
    "smart.promptPresetDeleted": "预设已删除",
    "smart.promptPlaceholderNode": "输入提示词...",
    "smart.promptLlmInstructionPlaceholder": "输入给 LLM 的文本，运行后会写入上方提示词",
    "smart.promptLlmSystemPlaceholder": "系统提示词开启后会随请求一起发送",
    "smart.promptLlmEnableSystem": "启用系统提示词",
    "smart.promptLlmDisableSystem": "关闭系统提示词",
    "smart.promptLlmNeedText": "请先输入给 LLM 的文本",
    "smart.promptLlmFailed": "LLM 运行失败",
    "smart.loopPromptHintFound": "识别到 {n} 条提示词，按计数轮流输出",
    "smart.loopPromptHintVariable": "可使用 [计数] 作为变量",
    "smart.loopParallelTip": "智能画布会按轮落盘，避免覆盖同一目标节点",
    "smart.loopDefaultPrompt": "现在生成第《计数》张卖点图片",
    "smart.loopRunAll": "一键运行",
    "smart.loopNoChain": "没有可一键运行的上游链路",
    "smart.loopRunDone": "一键运行完成",
    "smart.loopRunRoundsDone": "循环运行完成：{n} 轮",
    "smart.loopParallelRoundsDone": "并发运行完成：{n} 轮",
    "smart.mentionInput": "输入图",
    "smart.mentionAssets": "资产库",
    "smart.mentionEmpty": "没有可引用的图片",
    "smart.toastNoUndo": "没有可撤销的操作",
    "smart.toastUndone": "已撤销",
    "smart.toastNeedPrompt": "请输入提示词",
    "smart.toastNeedGroup": "请先按住 Ctrl 框选至少两个图片节点",
    "smart.toastUploadFail": "素材上传失败",
    "smart.toastApiSettingsFail": "API 设置加载失败",
    "smart.toastCanvasFail": "智能画布加载失败",
    "smart.errNoApiModel": "请先选择可用的 API 生图模型",
    "smart.errNoVideoModel": "请先选择视频模型",
    "smart.errNoOutImages": "没有返回图片",
    "smart.errNoOutVideos": "没有返回视频",
    "smart.errMsNeedRefs": "该 Modelscope 模型需要参考图",
    "smart.errImageRead": "图片读取失败",
    "smart.errNeedWorkflow": "请先在 ComfyUI 设置中添加工作流",
    "smart.errComfyNoImages": "ComfyUI 没有返回图片",
    "smart.errComfyEmpty": "ComfyUI 返回图片为空",
    "smart.errEnhanceNeedRefs": "图片增强需要参考图",
    "smart.errEditNeedRefs": "图片编辑需要参考图",
    "smart.errRunFailed": "生成失败",
    "smart.errRunTimeout": "生成超时",
    "smart.refMapHeader": "下面是参考图编号：",
    "smart.refUserNeed": "用户需求：",
    "smart.runPromptPrefix": "提示词：",
    "smart.assetLibrary": "资产库",
    "smart.assetImages": "图片资产",
    "smart.assetWorkflows": "工作流",
    "smart.assetNewFolder": "新建文件夹",
    "smart.assetRenameFolder": "重命名文件夹",
    "smart.assetFolder": "新文件夹",
    "smart.assetDropHint": "把画布图片拖到这里保存到当前文件夹",
    "smart.assetEmpty": "这个文件夹还没有图片。把画布里的图片拖进来保存。",
    "smart.assetWorkflowEmpty": "工作流资产先预留在这里，后续接入。",
    "smart.assetRename": "重命名",
    "smart.assetDeleteConfirm": "确定删除这个资产吗？",
    "smart.assetNoFolder": "请先新建一个图片文件夹",
    "smart.assetLoadFail": "资产库加载失败",
    "smart.assetAddFail": "保存资产失败",
    "smart.assetSaved": "已保存到资产库",
    "smart.mediaBrowser": "浏览器",
    "smart.mediaBrowserCollapse": "收起浏览器",
    "smart.mediaBrowserOpen": "打开",
    "smart.mediaBrowserExtract": "提取媒体",
    "smart.mediaBrowserReady": "输入网址后打开，或直接提取页面媒体。",
    "smart.mediaBrowserLoading": "正在打开网页...",
    "smart.mediaBrowserExtracting": "正在提取媒体...",
    "smart.mediaBrowserNoUrl": "请先输入网址",
    "smart.mediaBrowserNoMedia": "没有提取到可用媒体",
    "smart.mediaBrowserExtracted": "已加入临时抽屉 {n} 个媒体",
    "smart.mediaBrowserBlocked": "部分网站不允许内嵌显示，但仍可尝试提取媒体。",
    "smart.mediaDrawer": "临时抽屉",
    "smart.mediaDrawerClear": "清空抽屉",
    "smart.mediaDrawerEmpty": "提取图片或视频后会放在这里，可拖入画布。",
    "smart.mediaDrawerAdd": "放入画布",
    "smart.mediaDrawerSave": "存资产",
    "smart.shortcuts": "快捷键",
    "smart.shortcutBoxSelect": "按住并拖拽框选节点",
    "smart.shortcutGroup": "合并选中的图片为组",
    "smart.shortcutUngroup": "释放选中的分组",
    "smart.shortcutUndo": "撤销上一步操作",
    "smart.shortcutCopy": "复制选中的节点",
    "smart.shortcutPaste": "粘贴节点或剪贴板图片",
    "smart.shortcutAssets": "打开/关闭资源库",
    "smart.shortcutOverview": "缩小画布视图",
    "smart.shortcutCreateMenu": "打开快捷菜单",
    "smart.shortcutPan": "拖动画布",
    "smart.shortcutZoom": "缩放画布或预览图片",
    "smart.shortcutDelete": "删除选中节点"
};
function tr(key){
    try {
        return LOCAL_I18N[key] || key;
    } catch (err) {
        if(err instanceof ReferenceError) return key;
        throw err;
    }
}
function trf(key, values={}){
    return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), tr(key));
}
function refreshIcons(){ if(window.lucide) lucide.createIcons(); }
function uid(prefix){ return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`; }
function escapeHtml(str){ return window.CanvasCore?.escapeHtml(str) || ''; }
const escapeAttr = escapeHtml;

let smartAudioLightboxState = {nodeId:'', index:-1};

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

let smartMinimapFrame = null;
let smartMinimapViewportOnly = true;

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
        toast(tr('smart.toastApiSettingsFail'));
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
        document.title = canvas.title || tr('canvas.smartCanvas');
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
    } catch(e) { toast(e?.message || tr('smart.toastCanvasFail')); }
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

let previewCompareOn = false;
let previewCompareIndex = -1;
let previewMetaExtraText = '';

const MASK_BRUSH_ALPHA = 115;
const MASK_BRUSH_COLOR = `rgba(255,255,255,${MASK_BRUSH_ALPHA / 255})`;

let smartEditableResource = null;
let smartEditableJob = null;
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
    if(event.data?.type === 'studio-lang') {
        renderDynamicParams();
        renderInputThumbsRow(selectedNode());
        renderAssetLibrary();
        if(document.getElementById('imageEditModal')?.classList.contains('open')) setImageEditMode(imageEditMode);
        if(promptTemplatePanel?.classList?.contains('open')) renderPromptTemplatePanel();
        render();
    }
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
window.addEventListener('pagehide', () => {
    if(smartAudioLightbox?.classList.contains('open')) closeSmartAudioLightbox();
    else releaseSmartAudioLightboxPlayer();
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
