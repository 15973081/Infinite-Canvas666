/* Smart canvas: Generation, cascade scheduling, cancellation and task recovery.
 * Browser classic script (not an ES module); loaded before smart-canvas.js.
 * Function declarations only: initialization is explicitly invoked by the entry.
 * Uses the entry's existing shared bindings; do not duplicate permission or document state.
 */

function activeSmartCascadeCount(){ return smartCascadeRuns.size; }

function syncSmartCascadeLegacyState(preferredRunId=''){
    const activeIds = [...smartCascadeRuns.keys()];
    smartCascadeRunning = activeIds.length > 0;
    smartCascadeActiveRunId = preferredRunId && smartCascadeRuns.has(preferredRunId)
        ? preferredRunId
        : (activeIds[0] || '');
    const activeRun = smartCascadeActiveRunId ? smartCascadeRuns.get(smartCascadeActiveRunId) : null;
    smartCascadeStopRequested = Boolean(activeRun?.stopRequested);
    smartCascadeRunPath = activeRun?.runPath || null;
}

function smartCascadeAnyRunning(){ return smartCascadeRunning || activeSmartCascadeCount() > 0; }

function smartCascadeEdgeState(edgeKey){
    for(const run of smartCascadeRuns.values()){
        const state = run?.runPath?.states?.[edgeKey];
        if(state) return state;
    }
    return smartCascadeRunPath?.states?.[edgeKey] || '';
}

function smartCascadePathForCtx(ctx=null){
    return ctx?.runState?.runPath || ctx?.runPath || smartCascadeRunPath;
}

function isApiLikeEngine(engine){
    return ['api', 'volcengine'].includes(String(engine || '').toLowerCase());
}

function apiErrorMessage(data, fallback='请求失败'){
    return window.CanvasCore?.apiErrorMessage(data, fallback) ?? fallback;
}

async function responseErrorMessage(response, fallback='请求失败'){
    return window.CanvasCore?.responseErrorMessage(response, fallback) ?? fallback;
}

function validOutpaintSize(node){
    const w = Math.round(Number(node?.outpaintSize?.width || 0));
    const h = Math.round(Number(node?.outpaintSize?.height || 0));
    return w > 0 && h > 0 ? {width:w, height:h} : null;
}

function parseSizePair(value){
    return window.CanvasCore?.parseSizePair(value) || null;
}

function nearestFourKSizeFor(width, height){
    const w = Math.max(1, Number(width) || 1);
    const h = Math.max(1, Number(height) || 1);
    const ratio = w / h;
    let best = null;
    Object.entries(SIZE_MAP).forEach(([key, values]) => {
        const size = parseSizePair(values?.['4k']);
        if(!size) return;
        const score = Math.abs(Math.log(ratio / (size.width / size.height)));
        if(!best || score < best.score) best = {...size, key, score};
    });
    return best;
}

function exceedsFourKStandard(width, height){
    const standard = nearestFourKSizeFor(width, height);
    if(!standard) return false;
    return Number(width) > standard.width || Number(height) > standard.height;
}

function withOutpaintDisplaySettings(node, baseSettings){
    const size = validOutpaintSize(node);
    if(!size) return baseSettings;
    const engine = ['api','volcengine','modelscope','comfy'].includes(baseSettings?.engine) ? baseSettings.engine : 'api';
    const next = {
        ...baseSettings,
        resolution:'custom',
        ratio:'',
        customWidth:size.width,
        customHeight:size.height,
        customSize:`${size.width}x${size.height}`,
        outpaintResolutionLocked:true
    };
    if(isApiLikeEngine(engine)) next.apiKind = 'image';
    if(engine === 'modelscope'){
        next.msResolution = 'custom';
        next.msRatio = '';
        next.msCustomWidth = size.width;
        next.msCustomHeight = size.height;
        next.msCustomSize = `${size.width}x${size.height}`;
    }
    if(engine === 'comfy'){
        next.width = size.width;
        next.height = size.height;
    }
    return next;
}

function stripOutpaintDisplaySettings(settingsObj, node=null){
    const clean = cloneSmartSettings(settingsObj);
    const size = validOutpaintSize(node);
    const matchesOutpaintSize = size && clean.resolution === 'custom' && String(clean.customSize || '') === `${size.width}x${size.height}`;
    if(matchesOutpaintSize){
        clean.resolution = '1k';
        clean.ratio = clean.ratio || 'square';
        clean.customWidth = '';
        clean.customHeight = '';
        clean.customSize = '';
    }
    const matchesMsOutpaintSize = size && clean.msResolution === 'custom' && String(clean.msCustomSize || '') === `${size.width}x${size.height}`;
    if(matchesMsOutpaintSize){
        clean.msResolution = '1k';
        clean.msRatio = clean.msRatio || 'square';
        clean.msCustomWidth = '';
        clean.msCustomHeight = '';
        clean.msCustomSize = '';
    }
    if(size && Number(clean.width) === size.width && Number(clean.height) === size.height){
        clean.width = 1024;
        clean.height = 1024;
    }
    delete clean.outpaintResolutionLocked;
    return clean;
}

function smartGenerationKind(node){
    return isSmartImageNode(node) && ['image','video'].includes(node.generationKind) ? node.generationKind : '';
}

function enforceSmartGenerationKind(node, source){
    const kind = smartGenerationKind(node);
    if(!kind) return source;
    return {...source, apiKind:kind, engine:isApiLikeEngine(source?.engine) ? source.engine : 'api'};
}

function smartSettingsForNode(node){
    const nodeSettings = stripOutpaintDisplaySettings(node?.runSettings || {}, node);
    const recentSettings = Object.keys(nodeSettings).length ? {} : recentSmartSettingsForMode();
    const base = {
        ...cloneSmartSettings(canvasDefaultSmartSettings || initialSmartSettings),
        ...recentSettings,
        ...nodeSettings
    };
    const resolved = enforceSmartGenerationKind(node, withOutpaintDisplaySettings(node, base));
    const kind = smartGenerationKind(node);
    if(kind){
        // New nodes and chain runs need the same model defaults as the visible
        // composer, even when that node has never been opened for editing.
        if(resolved.engine === 'volcengine') sanitizeSmartApiSelection(resolved);
        else {
            clearVolcengineSelectionOutsideVolcengine(resolved);
            const providers = kind === 'video' ? videoApiProviders() : imageProviders();
            const providerKey = kind === 'video' ? 'videoProvider' : 'provider_id';
            const modelKey = kind === 'video' ? 'videoModel' : 'model';
            if(!providers.some(provider => provider.id === resolved[providerKey])) resolved[providerKey] = providers[0]?.id || '';
            const models = kind === 'video' ? providerVideoModels(resolved[providerKey]) : providerImageModels(resolved[providerKey]);
            if(!models.includes(resolved[modelKey])) resolved[modelKey] = models[0] || '';
        }
    }
    return resolved;
}

function imageProviders(){
    return (apiProviders || []).filter(p => p.enabled !== false && p.has_key && p.id !== 'volcengine' && (p.image_models || []).length);
}

function volcengineProvider(){
    return (apiProviders || []).find(p => p.id === 'volcengine' && p.enabled !== false) || {
        id:'volcengine',
        name:'火山引擎',
        image_models:[],
        video_models:window.CanvasSession?.enabled ? [] : DEFAULT_VIDEO_MODELS,
        enabled:true
    };
}

function smartRunNeedsPrompt(sourceSettings=settings){
    sourceSettings = sourceSettings || settings;
    if(sourceSettings.engine === 'comfy' && sourceSettings.comfyMode === 'enhance') return false;
    return true;
}

function apiProviderById(providerId){
    if(providerId === 'volcengine') return volcengineProvider();
    return (apiProviders || []).find(p => p.id === providerId) || imageProviders()[0] || null;
}

// 认证素材 asset:// 是平台绑定的：返回某 provider 所属的认证平台键（与后端一致）
function videoProviderPlatform(providerId){
    const p = (apiProviders || []).find(x => x.id === providerId);
    const proto = String(p?.protocol || p?.avatar_registration?.platform || '').toLowerCase();
    if(proto === 'volcengine' || providerId === 'volcengine') return 'volcengine';
    return '';
}

function providerImageModels(providerId){
    if(providerId === 'volcengine') return volcengineProvider().image_models || [];
    return (apiProviders || []).find(p => p.id === providerId)?.image_models || [];
}

function sanitizeSmartApiSelection(target=settings){
    if(!target || typeof target !== 'object') return target;
    if(target.engine === 'volcengine'){
        if(target.apiKind === 'video'){
            target.videoProvider = 'volcengine';
            const models = volcengineVideoModels();
            if(!models.includes(target.videoModel)) target.videoModel = models[0] || '';
        } else {
            target.provider_id = 'volcengine';
            const models = providerImageModels('volcengine');
            if(!models.includes(target.model)) target.model = models[0] || '';
        }
        return target;
    }
    clearVolcengineSelectionOutsideVolcengine(target);
    if(target.provider_id){
        const models = providerImageModels(target.provider_id);
        if(models.length && !models.includes(target.model)) target.model = models[0] || '';
    }
    if(target.videoProvider){
        const models = providerVideoModels(target.videoProvider);
        if(models.length && !models.includes(target.videoModel)) target.videoModel = models[0] || '';
    }
    return target;
}

function modelscopeProvider(){
    return (apiProviders || []).find(p => p.id === 'modelscope' && p.enabled !== false) || null;
}

function modelscopeImageModels(){
    return modelscopeProvider()?.image_models || ['Tongyi-MAI/Z-Image-Turbo'];
}

function videoApiProviders(){
    const fromConfig = (apiProviders || []).filter(p => p.enabled !== false && p.has_key && p.id !== 'volcengine' && (p.video_models || []).length);
    if(fromConfig.length || window.CanvasSession?.enabled) return fromConfig;
    return [{id:'comfly', name:'Comfly', video_models:DEFAULT_VIDEO_MODELS, enabled:true}];
}

function videoProviderById(providerId){
    if(providerId === 'volcengine') return volcengineProvider();
    return videoApiProviders().find(p => p.id === providerId) || videoApiProviders()[0] || null;
}

function providerVideoModels(providerId){
    if(providerId === 'volcengine') return volcengineVideoModels();
    const provider = videoApiProviders().find(p => p.id === providerId);
    const models = provider?.video_models || (window.CanvasSession?.enabled ? [] : DEFAULT_VIDEO_MODELS);
    return [...new Set(models)];
}

function volcengineVideoModels(){
    const provider = (apiProviders || []).find(p => p.id === 'volcengine');
    return [...new Set(provider?.video_models || (window.CanvasSession?.enabled ? [] : DEFAULT_VIDEO_MODELS))];
}

function isSeedance25VideoModel(model=settings.videoModel){
    return String(model || '').toLowerCase().replaceAll('_','-').replaceAll('.','-').includes('seedance-2-5');
}

function isSeedance20VideoModel(model=settings.videoModel){
    return /(?:^|-)seedance-2-0(?:-\d{6})?$/.test(String(model || '').toLowerCase().replaceAll('_','-').replaceAll('.','-'));
}

function smartVideoDurationRange(value=settings){
    const seedance=isSeedance25VideoModel(value.videoModel);
    return window.VideoDurationPolicy.bounds((apiProviders || []).find(p=>p.id===(value.videoProvider || 'comfly')),value.videoModel,{min:seedance?4:1,max:seedance?30:60,auto:seedance});
}

function smartVideoResolutions(value=settings){
    return window.CanvasCore.modelResolutions((apiProviders || []).find(p=>p.id===value.videoProvider), 'video', value.videoModel,
        ['', '480p', '720p', '1080p', ...(isSeedance20VideoModel(value.videoModel) ? ['4k'] : [])]);
}

function normalizeSmartVideoResolution(value=settings){
    const options = smartVideoResolutions(value);
    if(!options.includes(value.videoResolution || '')) value.videoResolution = options[0] || '';
    return options;
}

function parseSizeValue(value){
    return window.CanvasCore?.parseSizeValue(value) || null;
}

function parseRatioValue(value){
    const raw = String(value || '').trim();
    const parts = raw.includes(':') ? raw.split(':') : raw.split(/[xX*]/);
    if(parts.length !== 2) return 0;
    const w = Number(parts[0]);
    const h = Number(parts[1]);
    return w > 0 && h > 0 ? w / h : 0;
}

function apiImageSize(ratioValue, resolutionValue, customRatioValue='', customSizeValue=''){
    if(resolutionValue === 'custom') return String(customSizeValue || '').trim();
    const resolutionKey = resolutionValue || '1k';
    if(ratioValue === 'custom' || ratioValue === 'source'){
        const parsed = parseRatioValue(customRatioValue);
        const longSide = RES_LONG_SIDE[resolutionKey] || 1024;
        if(parsed){
            const pixelLimit = RES_PIXEL_LIMIT[resolutionKey] || (longSide * longSide);
            return window.CanvasCore.imageSizeForRatio(parsed, longSide, pixelLimit);
        }
    }
    const ratioKey = ratioValue && SIZE_MAP[ratioValue] ? ratioValue : 'square';
    return SIZE_MAP[ratioKey]?.[resolutionKey] || SIZE_MAP.square[resolutionKey] || SIZE_MAP.square['1k'];
}

function normalizeApiSizeSettings(prefix=''){
    const ratioKey = prefix ? `${prefix}Ratio` : 'ratio';
    const resKey = prefix ? `${prefix}Resolution` : 'resolution';
}

async function ensureComfyWorkflow(name){
    return null;
}

function currentComfyFields(){
    return comfyWorkflowCache[settings.comfyWorkflow]?.config?.fields || [];
}

function comfyParamValue(field){
    settings.comfyParams = settings.comfyParams || {};
    if(settings.comfyParams[field.id] !== undefined) return settings.comfyParams[field.id];
    return field.default ?? (field.type === 'boolean' ? false : (field.type === 'number' || field.type === 'slider' ? 0 : ''));
}

function smartImageResolutions(prefix=''){
    if(prefix)return ['1k','2k','4k','custom'];
    return window.CanvasCore.modelResolutions((apiProviders || []).find(p=>p.id===settings.provider_id), 'image', settings.model, ['1k','2k','4k','custom']);
}

function normalizeSmartImageResolution(prefix=''){
    const options = smartImageResolutions(prefix), key = prefix ? `${prefix}Resolution` : 'resolution';
    // An outpaint canvas has an explicit size; model policy must not relabel it.
    if(!prefix && settings.outpaintResolutionLocked === true){
        settings.resolution = 'custom';
        settings.ratio = '';
        return options;
    }
    if(!options.includes(settings[key])) settings[key] = options[0] || '';
    const ratioKey = prefix ? `${prefix}Ratio` : 'ratio';
    if(settings[key] !== 'custom' && !settings[ratioKey]) settings[ratioKey] = 'square';
    return options;
}

function smartOutpaintResolutionError(sourceSettings=settings){
    const size = sizeForRun(sourceSettings);
    const match = /^(\d+)\s*[x×]\s*(\d+)$/.exec(size);
    if(!match || Math.min(Number(match[1]), Number(match[2])) <= 0) return '扩图尺寸无效，请重新调整扩图区域。';
    const w = Number(match[1]), h = Number(match[2]);
    // Keep tier boundaries aligned with model_commercial.image_resolution.
    const tier = Math.max(w,h) >= 3000 || w*h > 4500000 ? '4k' : Math.max(w,h) >= 1800 || w*h > 1800000 ? '2k' : '1k';
    const provider = (apiProviders || []).find(p=>p.id === sourceSettings.provider_id);
    const allowed = window.CanvasCore.modelResolutions(provider, 'image', sourceSettings.model, ['1k','2k','4k']);
    if(!allowed.length) return '当前模型暂无可用规格，请重新选择模型后扩图。';
    return allowed.includes(tier) ? '' : `扩图尺寸 ${size} 属于 ${tier.toUpperCase()}，当前模型仅开放 ${allowed.map(v=>v.toUpperCase()).join(' / ')}。请缩小扩图区域或切换模型。`;
}

function gcdInt(a, b){
    return window.CanvasCore?.gcdInt(a, b) || 1;
}

function imageSizeForRatio(img){
    const w = Math.round(Number(img?.natural_w || img?.width || img?.w || 0));
    const h = Math.round(Number(img?.natural_h || img?.height || img?.h || 0));
    return w > 0 && h > 0 ? {w, h} : null;
}

function sourceRatioImageForNode(node){
    const images = (node?.images || []).filter(img => img?.url && !isAudioMediaItem(img));
    if(!images.length) return null;
    if(smartSelection.image.nodeId === node?.id && smartSelection.image.index >= 0 && imagesForNode(node)[smartSelection.image.index]){
        const selected = imagesForNode(node)[smartSelection.image.index];
        if(imageSizeForRatio(selected)) return selected;
    }
    return images.find(img => imageSizeForRatio(img)) || images[0];
}

function reducedRatioForImage(img){
    const size = imageSizeForRatio(img);
    if(!size) return null;
    const d = gcdInt(size.w, size.h);
    return {w:Math.max(1, Math.round(size.w / d)), h:Math.max(1, Math.round(size.h / d))};
}

function sourceImageRatioLabel(prefix=''){
    const node = activeComposerNode() || selectedNode();
    const ratio = reducedRatioForImage(sourceRatioImageForNode(node));
    if(!ratio) return '';
    return `${ratio.w}:${ratio.h}`;
}

function isVideoMediaItem(img){
    if(!img) return false;
    if(img.kind === 'video') return true;
    const url = String(img.url || '').toLowerCase();
    return /\.(mp4|webm|mov|m4v)(\?|$)/.test(url);
}

function isAudioMediaItem(img){
    if(!img) return false;
    if(img.kind === 'audio') return true;
    const url = String(img.url || '').toLowerCase();
    return /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/.test(url);
}

function smartAudioFormatLabel(img){
    const clean = `${img?.name || ''} ${String(img?.url || '').split(/[?#]/)[0]}`;
    const match = clean.match(/\.([a-z0-9]{2,5})(?:\s|$)/i);
    return match ? match[1].toUpperCase() : 'AUDIO';
}

function smartAudioWaveformSvg(className='smart-audio-waveform'){
    return `<svg class="${className}" viewBox="0 0 156 32" preserveAspectRatio="none" aria-hidden="true"><path d="M3 13v6M9 9v14M15 5v22M21 11v10M27 7v18M33 3v26M39 8v16M45 12v8M51 6v20M57 2v28M63 7v18M69 11v10M75 4v24M81 8v16M87 13v6M93 6v20M99 3v26M105 9v14M111 5v22M117 11v10M123 7v18M129 4v24M135 9v14M141 12v8M147 7v18M153 11v10"/></svg>`;
}

function isTextMediaItem(img){
    if(!img) return false;
    if(img.kind === 'text') return true;
    const url = String(img.url || '').toLowerCase();
    return /\.(txt|json|csv|srt|vtt|md)(\?|$)/.test(url);
}

function isFileMediaItem(img){
    if(!img) return false;
    return img.kind === 'file';
}

function mediaKindForFile(file){
    const type = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    if(type.startsWith('video/') || /\.(mp4|webm|mov|m4v|avi|mkv)(\?|$)/.test(name)) return 'video';
    if(type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/.test(name)) return 'audio';
    if(type.startsWith('text/') || /\.(txt|json|csv|srt|vtt|md)(\?|$)/.test(name)) return 'text';
    return 'image';
}

function mediaKindForItem(img){
    if(img?.kind==='model'||/\.(glb|gltf)(?:[?#]|$)/i.test(img?.url||img?.name||''))return 'model';
    if(isFileMediaItem(img)) return 'file';
    if(isTextMediaItem(img)) return 'text';
    if(isAudioMediaItem(img)) return 'audio';
    if(isVideoMediaItem(img)) return 'video';
    return 'image';
}

function resultMediaUrls(result){
    const urls = [];
    const add = value => {
        if(!value) return;
        if(typeof value === 'string'){
            urls.push(value);
            return;
        }
        if(Array.isArray(value)){
            value.forEach(add);
            return;
        }
        if(typeof value === 'object'){
            if(value.url || value.path || value.src || value.uri){
                const url = value.url || value.path || value.src || value.uri;
                if(url){
                    const item = {url, kind:value.kind || value.type || value.mediaKind || '', name:value.name || value.filename || ''};
                    ['natural_w','natural_h','width','height','w','h','layout_w','layout_h'].forEach(key => {
                        const n = Number(value[key]);
                        if(Number.isFinite(n) && n > 0) item[key] = n;
                    });
                    urls.push(item);
                }
            }
            ['outputs','videos','images','urls','data','result'].forEach(key => add(value[key]));
            ['url','path','src','uri','output','output_url','outputUrl','video','video_url','videoUrl','mp4_url','mp4Url','download_url','downloadUrl','preview_url','previewUrl'].forEach(key => add(value[key]));
        }
    };
    if(Array.isArray(result) || typeof result==='string')add(result);
    else ['items','outputs','videos','audios','texts','files','images','urls','data','result','output','url'].forEach(key => add(result?.[key]));
    const seen = new Set();
    return urls.map(item => {
        const url = typeof item === 'string' ? item : item?.url || item?.path || '';
        if(!url) return null;
        return typeof item === 'object' ? {...item, url} : url;
    }).filter(item => {
        const url = typeof item === 'string' ? item : item?.url || '';
        return url && !seen.has(url) && seen.add(url);
    });
}

function mediaKindForUrls(urls, fallback='image'){
    const items = (urls || []).map(item => typeof item === 'string' ? {url:item} : (item || {}));
    if(fallback && fallback !== 'image') return fallback;
    if(items.some(isVideoMediaItem)) return 'video';
    if(items.some(isAudioMediaItem)) return 'audio';
    if(items.some(isTextMediaItem)) return 'text';
    return fallback;
}

function imageRefsOnly(refs){
    return (refs || []).filter(ref => ref?.url && mediaKindForItem(ref) === 'image');
}

function looksLikeImageMediaUrl(url){
    const text = String(url || '').trim().toLowerCase();
    if(!text) return false;
    if(text.startsWith('data:image/')) return true;
    if(text.startsWith('asset://')) return false;
    const path = text.split('?', 1)[0].split('#', 1)[0];
    return /\.(png|jpe?g|webp|gif|bmp|tiff)$/i.test(path);
}

function videoRefsOnly(refs){
    return (refs || []).filter(ref => ref?.url && mediaKindForItem(ref) === 'video' && !looksLikeImageMediaUrl(ref.url));
}

function isRemoteVideoReferenceUrl(url){
    return /^https?:\/\//i.test(String(url || '')) || /^asset:\/\//i.test(String(url || ''));
}

function audioRefsOnly(refs){
    return (refs || []).filter(ref => ref?.url && mediaKindForItem(ref) === 'audio');
}

function smartRecoverableImageTask(node){
    return smartPendingTasks(node).find(task => task.failed && task.recoverTaskId) || null;
}

function providerIdForSmartTask(node, task){
    return task?.providerId || node?.runSettings?.provider_id || settings.provider_id || 'comfly';
}

async function querySmartImageTaskNow(nodeId, localTaskId){
    const node = nodes.find(n => n.id === nodeId);
    if(!node) return;
    const task = localTaskId ? smartPendingTasks(node).find(item => item.taskId === localTaskId) : smartRecoverableImageTask(node);
    if(!task || task.querying) return;
    if(task.paused){
        if(window.MemberCanvasEdit?.openTaskResults)await window.MemberCanvasEdit.openTaskResults();
        else toast('请打开生成结果列表查看原任务，不需要重新生成。');
        return;
    }
    const memberMode=Boolean(window.CanvasSession?.enabled);
    const sourceId=task.run?.nodeId, source=sourceId ? nodes.find(n=>n.id===sourceId) : null;
    if(memberMode && sourceId && !source)return;
    const writeGuard=canvasTaskWriteGuard(node,source);
    const current=()=>writeGuard.valid() && smartPendingTasks(node).includes(task);
    if(!current())return;
    const taskId=memberMode ? task.taskId : task.recoverTaskId || extractUpstreamTaskId(task.error || '');
    if(!taskId){
        toast(memberMode ? '历史任务缺少本地记录，请在管理平台按原供应商核对。' : '没有任务 ID，无法查询');
        return;
    }
    const inputBinding=memberMode ? task._inputBinding : null;
    task.querying = true;
    if(!memberMode)task.recoverTaskId = taskId;
    refreshSmartNodes([node.id]);
    try {
        let data,record;
        if(memberMode){
            const response=await window.CanvasApi.getCanvasImageTaskRequest(taskId);
            if(!response.ok)throw new Error(await window.CanvasCore.responseErrorMessage(response,'查询失败'));
            record=await response.json();
            if(!current())return;
            if(record.id!==taskId)throw new Error('任务记录不匹配，请刷新后重试。');
            data={...(record.result||{}),status:record.status,error:record.error};
        } else data=await window.CanvasApi.queryImageTask({provider_id:providerIdForSmartTask(node, task), task_id:taskId});
        if(!current())return;
        if(data.status === 'succeeded'){
            const apply=()=>{
                task.failed=false;task.querying=false;
                finalizeSmartPendingTask(node,task.taskId,data.images||[],task.kind||'image',data,record);
                refreshSmartNodes([node.id]);scheduleSave();
            };
            if(memberMode){
                if(!inputBinding || record.canvas_edit_generation!==window.MemberCanvasEdit?.active?.lease?.generation){
                    if(window.MemberCanvasEdit?.openTaskResults)await window.MemberCanvasEdit.openTaskResults();
                    else toast('结果已保存，请从生成结果列表确认加入。');
                    return;
                }
                if(!(data.images||[]).length)throw new Error('任务没有可加入的图片，请在管理平台核对。');
                inputBinding.apply(record,apply,taskId);
            } else apply();
        } else {
            const message=data.status==='needs_review' ? '任务需要在管理平台核对；不会自动重新生成。' :
                data.error || data.message || ((data.status==='failed'||data.status==='cancelled') ? '生成失败' : '任务仍在生成中，请稍后再查询');
            if(!memberMode)task.error=message;
            toast(message.slice(0,160));
        }
    } catch(e){
        if(!current())return;
        if(!memberMode)task.error=e.message || '查询失败';
        if(e.resultPending && window.MemberCanvasEdit?.openTaskResults)await window.MemberCanvasEdit.openTaskResults();
        else toast((e.message || '查询失败').slice(0,160));
    } finally {
        if(current()){
            task.querying=false;
            refreshSmartNodes([node.id]);scheduleSave();
        }
    }
}

function smartTypedVideoInputs(source=settings){
    return isApiLikeEngine(source?.engine) && source?.apiKind === 'video';
}

function smartMediaRefKey(ref){
    return `${mediaKindForItem(ref)}|${ref?.originalLocalUrl || ref?.url || ''}`;
}

function smartMediaReferencePlan(node, base, parts=[], source=settings){
    const refs = [], invalid = [], aliases = new Map(), seen = new Map();
    const blocked = blockedInputRefKeys(node);
    const manual = manualSmartMediaLinks(source).map(ref => ({...ref, kind:'video', name:'手动视频网址', manual:true}));
    const add = ref => {
        if(!ref?.url || !['image','audio','video'].includes(mediaKindForItem(ref))) return;
        if(String(ref.url).startsWith('asset://') && !['image','audio','video'].includes(ref.kind)){
            invalid.push(ref);
            return;
        }
        const key = source.videoReferenceMode==='firstAndLastFrame'&&mediaKindForItem(ref)==='image'&&ref.nodeId?`${ref.nodeId}|${ref.imageIndex||0}|${ref.url}`:smartMediaRefKey(ref);
        if(seen.has(key)){
            const index = seen.get(key);
            const provider = (apiProviders || []).find(p => p.id === (source.videoProvider || 'volcengine'));
            const rank = candidate => {
                const state = smartFaceAuthState(smartCurrentFaceAuthRef(candidate),provider);
                return state.ready ? 2 : state.blocked ? 1 : 0;
            };
            if(rank(ref) > rank(refs[index])) refs[index] = {...ref,kind:mediaKindForItem(ref)};
            return;
        }
        seen.set(key,refs.length);
        refs.push({...ref, kind:mediaKindForItem(ref)});
    };
    (base || []).filter(ref => !blocked.has(inputRefKey(ref)) && !(manual.length && mediaKindForItem(ref) === 'video')).forEach(add);
    manual.forEach(add);
    parts.filter(part => part.type === 'image').forEach(part => {
        const sourceNode = part.nodeId ? nodes.find(n => n.id === part.nodeId) : null;
        const stale = part.nodeId && (!sourceNode || !(sourceNode.images || []).some(ref => ref.url === part.url || ref.originalLocalUrl === part.url));
        if(!['image','audio','video'].includes(mediaKindForItem(part)) || blocked.has(inputRefKey(part)) || stale || (manual.length && mediaKindForItem(part) === 'video' && !manual.some(ref => ref.url === part.url))){
            invalid.push(part);
        } else add(part);
    });
    const order = new Map((node?.mediaReferenceOrder || []).map((key, i) => [key, i]));
    const sorted = [];
    for(const kind of ['image','audio','video']){
        const group = refs.filter(ref => ref.kind === kind);
        // Manual links retain the exact ordering used by runApiVideoGeneration.
        if(!(kind === 'video' && manual.length)) group.sort((a,b) => (order.get(smartMediaRefKey(a)) ?? Infinity) - (order.get(smartMediaRefKey(b)) ?? Infinity));
        group.forEach((ref,i) => {
            ref.referenceLabel = `${{image:'图片',audio:'音频',video:'视频'}[kind]}${i + 1}`;
            ref.role = `reference_${kind}`;
            aliases.set(smartMediaRefKey(ref), ref.referenceLabel);
            sorted.push(ref);
        });
    }
    return {refs:sorted, aliases, invalid};
}

function sizeForRun(sourceSettings=settings){
    return apiImageSize(sourceSettings.ratio || 'square', sourceSettings.resolution || '1k', sourceSettings.customRatio || '', sourceSettings.customSize || '') || '1024x1024';
}

function expectedOutputSize(){
    if(settings.engine === 'comfy'){
        if(settings.comfyMode === 'text'){
            const w = Number(settings.width) || 1024;
            const h = Number(settings.height) || 1024;
            return {w, h};
        }
        return {w:1024, h:1024};
    }
    const sizeStr = settings.engine === 'modelscope'
        ? apiImageSize(settings.msRatio || 'square', settings.msResolution || '1k', settings.msCustomRatio || '', settings.msCustomSize || '')
        : sizeForRun();
    const parsed = parseSizeValue(sizeStr);
    if(parsed){
        return {w: Number(parsed.width) || 1024, h: Number(parsed.height) || 1024};
    }
    return {w:1024, h:1024};
}

function explicitRequestOutputSizeForPending(){
    if(isApiLikeEngine(settings.engine) && settings.apiKind !== 'video'){
        const parsed = parseSizeValue(sizeForRun());
        if(parsed) return {w:Number(parsed.width) || 1024, h:Number(parsed.height) || 1024};
    }
    if(settings.engine === 'modelscope'){
        const sizeStr = apiImageSize(settings.msRatio || 'square', settings.msResolution || '1k', settings.msCustomRatio || '', settings.msCustomSize || '');
        const parsed = parseSizeValue(sizeStr);
        if(parsed) return {w:Number(parsed.width) || 1024, h:Number(parsed.height) || 1024};
    }
    if(settings.engine === 'comfy' && settings.comfyMode === 'text'){
        const w = Number(settings.width) || 1024;
        const h = Number(settings.height) || 1024;
        return {w, h};
    }
    return null;
}

function pendingSizeFromImageRef(img){
    const w = Number(img?.natural_w || img?.width || 0);
    const h = Number(img?.natural_h || img?.height || 0);
    return w > 0 && h > 0 ? {w, h} : null;
}

function pendingSourceBoxSize(options={}){
    const sourceNode = options.sourceNode || null;
    if(sourceNode && (sourceNode.images || []).length){
        const rect = nodeRect(sourceNode);
        if(rect.width > 24 && rect.height > 24) return {w:Math.round(rect.width), h:Math.round(rect.height), display:true};
    }
    const ref = (options.refs || []).find(img => img?.url);
    const refSize = pendingSizeFromImageRef(ref);
    if(refSize) return refSize;
    const refNode = ref?.nodeId ? nodes.find(n => n.id === ref.nodeId) : null;
    if(refNode){
        const rect = nodeRect(refNode);
        if(rect.width > 24 && rect.height > 24) return {w:Math.round(rect.width), h:Math.round(rect.height), display:true};
    }
    return null;
}

function displayBoxFromNaturalSize(size){
    const layout = singleImageLayout(
        {natural_w:size?.w || size?.width || 1024, natural_h:size?.h || size?.height || 1024},
        {type:'smart-image', images:[{}]},
        MEDIA_NODE_DEFAULT_SCALE
    );
    return {w:layout.width, h:layout.height};
}

function pendingBaseBoxSize(options={}){
    const requestSize = explicitRequestOutputSizeForPending();
    if(requestSize) return displayBoxFromNaturalSize(requestSize);
    const sourceSize = pendingSourceBoxSize(options);
    if(sourceSize?.display) return {w:sourceSize.w, h:sourceSize.h};
    if(sourceSize) return displayBoxFromNaturalSize(sourceSize);
    return displayBoxFromNaturalSize(expectedOutputSize());
}

function pendingBoxSize(count, options={}){
    const base = pendingBaseBoxSize(options);
    const aspect = base.w / Math.max(1, base.h);
    const c = Math.max(1, Number(count) || 1);
    if(c <= 1){
        return {w:Math.round(base.w), h:Math.round(base.h)};
    }
    const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(c))));
    const rows = Math.ceil(c / cols);
    const cellMax = Math.max(96, Math.min(220, Math.max(base.w, base.h) * 0.42));
    let cellW, cellH;
    if(base.w >= base.h){
        cellW = cellMax;
        cellH = Math.max(40 * MEDIA_NODE_DEFAULT_SCALE, Math.round(cellMax / aspect));
    } else {
        cellH = cellMax;
        cellW = Math.max(40 * MEDIA_NODE_DEFAULT_SCALE, Math.round(cellMax * aspect));
    }
    const w = cols * (cellW + 8) + 16;
    const h = rows * (cellH + 8) + 16;
    return {w, h};
}

function snapshotRunMeta(prompt, sourceId, displayPrompt='', refs=[]){
    return {
        prompt,
        displayPrompt:displayPrompt || promptPlainText() || prompt,
        promptHtml: promptInput ? promptInput.innerHTML : '',
        promptText: promptPlainText(),
        promptRefs:(refs || []).map(ref => ({...ref})).filter(ref => ref.url),
        inputRefs:(refs || []).map(ref => ({...ref})).filter(ref => ref.url),
        sourceNodeId:sourceId,
        settings:JSON.parse(JSON.stringify(settings)),
        createdAt:Date.now()
    };
}

function attachRunMeta(targetNode, meta){
    if(!targetNode || !meta) return;
    targetNode.runPrompt = meta.displayPrompt || meta.promptText || meta.prompt;
    targetNode.runModelPrompt = meta.prompt;
    targetNode.runPromptRefs = meta.promptRefs || [];
    targetNode.runInputRefs = (meta.inputRefs || meta.promptRefs || []).map(ref => ({
        ...ref,
        url:ref.url || '',
        name:ref.name || '',
        nodeId:ref.nodeId || '',
        imageIndex:ref.imageIndex ?? '',
        kind:ref.kind || ''
    })).filter(ref => ref.url);
    targetNode.runSettings = meta.settings;
    if(meta.sourceNodeId) targetNode.sourceNodeId = meta.sourceNodeId;
    else delete targetNode.sourceNodeId;
    targetNode.runAt = meta.createdAt;
    // 保存可编辑的 @-提及表单到草稿字段，方便点输出节点时还原原始可编辑形式
    if(meta.promptHtml != null){
        const htmlHasToken = String(meta.promptHtml || '').includes('mention-image-token');
        const rebuiltHtml = htmlHasToken ? '' : promptHtmlWithMentionTokens(meta.displayPrompt || meta.promptText || '', meta.promptRefs || []);
        targetNode.promptDraftHtml = htmlHasToken ? meta.promptHtml : (rebuiltHtml || meta.promptHtml);
        targetNode.promptDraftText = meta.promptText || '';
    }
    if(targetNode.nativePrompt?.schemaVersion===1)PixmaxReshootReferences.setPrompt(targetNode,targetNode.nativePrompt.prompt);
    targetNode.images = (targetNode.images || []).map(img => stripImageGenerationMeta(img));
}

function stripRunInputMeta(meta){
    if(!meta) return meta;
    const cleanPrompt = meta.promptText || meta.displayPrompt || meta.prompt || '';
    return {
        ...meta,
        promptHtml:escapeHtml(cleanPrompt),
        promptText:cleanPrompt,
        promptRefs:[],
        inputRefs:meta.inputRefs || meta.promptRefs || [],
        sourceNodeId:''
    };
}

function upstreamNodesForKinds(node, kinds=['input']){
    if(!node) return [];
    const allowed = new Set(kinds);
    const ids = new Set();
    smartConnectionsForComputation(node.id).forEach(conn => {
        if(conn.to === node.id && allowed.has(conn.kind || 'flow')) ids.add(conn.from);
    });
    if(!canvasUsesConnections && allowed.has('input')){
        (node.inputNodeIds || []).forEach(id => ids.add(id));
    }
    return [...ids].map(id => smartNodeForComputation(id)).filter(Boolean);
}

function inputNodesFor(node){
    return upstreamNodesForKinds(node, ['input']);
}

function workflowInputNodesFor(node){
    return upstreamNodesForKinds(node, ['input', 'flow']);
}

function imagesForNode(node){
    return (node?.images || []).map((img, index) => ({...imageForDisplay(img), nodeId:node.id, imageIndex:index}));
}

function nodeHasReferenceContent(node){
    return imagesForNode(node).some(img => img?.url);
}

function isSelfReferenceForNode(node, img){
    return Boolean(node?.id && img?.nodeId === node.id);
}

function candidateInputImagesFor(node, consume=false, ctx=null){
    const inputs = (smartImageUsesWorkflowInput(node, ctx) ? workflowInputImagesFor(node, consume, ctx) : inputImagesFor(node, consume, ctx))
        .filter(img => img?.url);
    if(!inputs.length) return [];
    if(smartImageUsesWorkflowInput(node, ctx)) return inputs;
    if(nodeHasReferenceContent(node)) return [];
    return inputs;
}

function defaultInputImagesFor(node, consume=false, ctx=null){
    return candidateInputImagesFor(node, consume, ctx);
}

function outputImagesForNode(node, consume=false, ctx=null){
    return imagesForNode(node).filter(img => img?.url);
}

function selfReferenceImagesForNode(node, consume=false, ctx=null){
    return outputImagesForNode(node, consume, ctx).filter(img => img?.url);
}

function textForNode(node, ctx=null){
    if(!node) return '';
    if(node.type === 'smart-prompt') return node.text || '';
    return '';
}

function promptInputNodesFor(node){
    return inputNodesFor(node).filter(input => input?.type === 'smart-prompt');
}

function inputPromptTextFor(node, ctx=null){
    const seen = new Set();
    return promptInputNodesFor(node).map(input => textForNode(input, ctx)).filter(text => {
        const key = String(text || '').trim();
        if(!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    }).join('\n\n');
}

function inputImagesFor(node, consume=false, ctx=null){
    return inputNodesFor(node).flatMap(input => outputImagesForNode(input, consume, ctx));
}

function workflowInputImagesFor(node, consume=false, ctx=null){
    return workflowInputNodesFor(node).flatMap(input => outputImagesForNode(input, consume, ctx));
}

function inputRefKey(img){
    if(!img?.url) return '';
    const nodeId = img.nodeId || '';
    const imageIndex = Number.isFinite(Number(img.imageIndex)) ? String(Number(img.imageIndex)) : '';
    if(nodeId && imageIndex !== '') return `${nodeId}|${imageIndex}`;
    return `url|${img.url}`;
}

function blockedInputRefKeys(node){
    return new Set(Array.isArray(node?.blockedInputRefs) ? node.blockedInputRefs.filter(Boolean) : []);
}

function isInputRefBlocked(node, img){
    if(!node || !img?.url) return false;
    return blockedInputRefKeys(node).has(inputRefKey(img));
}

function activeInputImagesFor(node, consume=false, ctx=null){
    return inputImagesFor(node, consume, ctx).filter(img => img?.url && !isInputRefBlocked(node, img));
}

function toggleInputRefBlocked(node, img){
    if(!node || !img?.url) return;
    const key = inputRefKey(img);
    if(!key) return;
    pushUndo();
    const blocked = blockedInputRefKeys(node);
    if(blocked.has(key)) blocked.delete(key);
    else blocked.add(key);
    node.blockedInputRefs = [...blocked];
    if(!node.blockedInputRefs.length) delete node.blockedInputRefs;
    renderInputThumbsRow(node);
    scheduleSave();
}

function defaultReferenceImagesFor(node, consume=false, ctx=null,configuration=node?.runSettings){
    if(!node) return [];
    const slots=configuration?.videoReferenceMode==='firstAndLastFrame';
    const storyboard=window.PixmaxStoryboardMedia?.referencesFor(node);
    if(storyboard)return uniqueReferenceImages(storyboard,slots);
    const self = selfReferenceImagesForNode(node, consume, ctx).filter(img => img?.url);
    // A generator's result is an output, including in automatic mode. Reusing
    // it here changes text/image-to-video into video-to-video on the second run.
    const videoGenerator=smartGenerationKind(node)==='video';
    const upstream = videoGenerator?(smartImageUsesWorkflowInput(node,ctx)?workflowInputImagesFor(node,consume,ctx):inputImagesFor(node,consume,ctx)):defaultInputImagesFor(node, consume, ctx);
    if(videoGenerator)return uniqueReferenceImages(upstream,slots);
    if(smartImageUsesWorkflowInput(node, ctx)) return uniqueReferenceImages(upstream,slots);
    if(self.length) return uniqueReferenceImages(self,slots);
    return uniqueReferenceImages(upstream,slots);
}

function lineImagesFor(node){
    const ids = upstreamLineNodeIds(node);
    return ids.flatMap(id => {
        const source = nodes.find(n => n.id === id);
        return imagesForNode(source);
    }).filter(img => img?.url);
}

function collectMentionedImagesFromPrompt(){
    const images = [];
    collectPromptParts().forEach(part => {
        if(part.type === 'image' && part.url) images.push(part);
    });
    return images;
}

function uniqueReferenceImages(images,preserveSourceSlots=false){
    const refs = [];
    const seen = new Set();
    (images || []).forEach((img, index) => {
        const key=preserveSourceSlots&&mediaKindForItem(img)==='image'&&img.nodeId?`${img.nodeId}|${img.imageIndex||0}|${img.url}`:img?.url;
        if(!img?.url || seen.has(key)) return;
        seen.add(key);
        refs.push({
            ...img,
            name:img.name || `图${refs.length + 1}`,
            role:img.role || `image_${refs.length + 1}`,
            imageIndex:Number.isFinite(Number(img.imageIndex)) ? Number(img.imageIndex) : index
        });
    });
    return refs;
}

function visibleReferenceImagesFor(node){
    const base = defaultReferenceImagesFor(node);
    return uniqueReferenceImages([...base, ...collectMentionedImagesFromPrompt()]);
}

function inputMentionCandidateImages(node){
    const current = node ? [...(smartTypedVideoInputs() ? smartMediaReferencePlan(node, defaultReferenceImagesFor(node), collectPromptParts()).refs : []), ...lineImagesFor(node)] : [];
    const seen = new Set();
    return current.filter(img => {
        if(!smartTypedVideoInputs() && isAudioMediaItem(img)) return false;
        if(!img?.url || seen.has(img.url)) return false;
        seen.add(img.url);
        return true;
    }).map((img, index) => ({
        ...img,
        mentionId:`mention_${index}_${Math.random().toString(36).slice(2, 7)}`,
        alias:img.name || `图片${index + 1}`
    }));
}

function referenceImagesFor(node){
    return defaultReferenceImagesFor(node);
}

function collectPromptParts(){
    const parts = [];
    const walk = node => {
        if(node.nodeType === Node.TEXT_NODE){
            if(node.textContent) parts.push({type:'text', text:node.textContent});
            return;
        }
        if(node.nodeType !== Node.ELEMENT_NODE) return;
        if(node.classList?.contains('mention-image-token')){
            let assetUris = {};
            try { assetUris = JSON.parse(node.dataset.assetUris || '{}') || {}; } catch(e) { assetUris = {}; }
            const owner = nodes.find(item => item.id === node.dataset.nodeId);
            const original = owner?.images?.find(item => item.url === node.dataset.url || item.originalLocalUrl === node.dataset.url);
            parts.push({...original, type:'image', kind:original?.kind || node.dataset.kind || '', url:node.dataset.url || '', name:node.dataset.name || '图片', nodeId:node.dataset.nodeId || '', imageIndex:Number(node.dataset.imageIndex || 0), asset_uris:{...original?.asset_uris, ...assetUris}});
            return;
        }
        if(node.tagName === 'BR') parts.push({type:'text', text:'\n'});
        node.childNodes.forEach(walk);
        if(node !== promptInput && ['DIV','P'].includes(node.tagName)) parts.push({type:'text', text:'\n'});
    };
    promptInput.childNodes.forEach(walk);
    return parts;
}

function originalPromptTextFromParts(parts){
    let text = '';
    (parts || []).forEach(part => {
        if(part.type === 'text'){
            text += part.text || '';
            return;
        }
        if(part.type === 'image') text += `@${part.name || '图片'}`;
    });
    return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function buildPromptRequest(node, overrideDefaultImages=null, consumeDefault=false, ctx=null){
    if(node.nativePrompt?.schemaVersion===1){const current=PixmaxReshootReferences.plan(node,{base:overrideDefaultImages||defaultReferenceImagesFor(node,consumeDefault,ctx),ctx});return {prompt:PixmaxReshootReferences.validate(node,current),displayPrompt:node.promptDraftText,refs:current.entries.filter(entry=>entry.media).map(entry=>({...entry.media,referenceLabel:entry.alias})),mentioned:/%%@\[|%%subject-ref\(/.test(node.nativePrompt.prompt)};}
    const parts = collectPromptParts();
    if(smartTypedVideoInputs()){
        const base = Array.isArray(overrideDefaultImages) ? overrideDefaultImages : defaultReferenceImagesFor(node, consumeDefault, ctx);
        const plan = smartMediaReferencePlan(node, base, parts);
        if(plan.invalid.length) throw new Error('存在失效的素材引用，请重新选择：' + plan.invalid.map(ref => ref.name || '素材').join('、'));
        const body = parts.map(part => part.type === 'text' ? part.text : plan.aliases.get(smartMediaRefKey(part)) || '').join('');
        return {prompt:[inputPromptTextFor(node, ctx).trim(), body.trim()].filter(Boolean).join('\n\n'), displayPrompt:originalPromptTextFromParts(parts), refs:plan.refs, mentioned:parts.some(part => part.type === 'image')};
    }
    const originalPrompt = originalPromptTextFromParts(parts);
    if(parts.some(part => part.type === 'image' && isAudioMediaItem(part))){
        throw new Error('图片生成不支持音频引用，请切换视频模式或移除提示词中的音频引用。');
    }
    const blockedRefs = blockedInputRefKeys(node);
    const hasOverrideImages = Array.isArray(overrideDefaultImages);
    const filteredDefaultImages = (hasOverrideImages ? overrideDefaultImages : defaultReferenceImagesFor(node, consumeDefault, ctx))
        .filter(img => !isAudioMediaItem(img) && !blockedRefs.has(inputRefKey(img)));
    const defaultRefs = uniqueReferenceImages(filteredDefaultImages);
    const refs = defaultRefs.map((img, index) => ({...img, role:`image_${index + 1}`}));
    let hasMentionToken = false;
    const refMap = new Map();
    refs.forEach((img, index) => refMap.set(img.url, index + 1));
    let body = '';
    parts.forEach(part => {
        if(part.type === 'text'){
            body += part.text;
            return;
        }
        if(!part.url) return;
        hasMentionToken = true;
        const mentionedKey = inputRefKey(part);
        if(blockedRefs.has(mentionedKey)){
            body += `@${part.name || '图片'}`;
            return;
        }
        if(!refMap.has(part.url)){
            refMap.set(part.url, refs.length + 1);
            refs.push({...part, name:part.name || `图${refs.length + 1}`, role:`image_${refs.length + 1}`});
        }
        body += `图${refMap.get(part.url)}`;
    });
    body = body.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const inputPrompt = inputPromptTextFor(node, ctx).trim();
    if(inputPrompt) body = [inputPrompt, body].filter(Boolean).join('\n\n');
    const displayPrompt = originalPrompt || body;
    if(hasMentionToken && refs.length){
        const mapText = refs.map((img, i) => `图${i + 1}：${img.name || `图片${i + 1}`}`).join('\n');
        return {
            prompt:`下面是参考图编号：\n${mapText}\n\n用户需求：\n${body}`,
            displayPrompt,
            refs:refs.map((img, index) => ({...img, name:img.name || `图${index + 1}`, role:`image_${index + 1}`})),
            mentioned:true
        };
    }
    return {
        prompt:body,
        displayPrompt,
        refs:refs.map((img, index) => ({...img, name:img.name || `图${index + 1}`, role:`image_${index + 1}`})),
        mentioned:false
    };
}

function outgoingConnectionsFor(node, kinds=['input']){
    if(!node) return [];
    const allowed = new Set(kinds);
    return (canvas?.connections || []).filter(conn => conn.from === node.id && allowed.has(conn.kind || 'flow'));
}

function outgoingInputConnectionsFor(node){
    return outgoingConnectionsFor(node, ['input']);
}

function nextOutputPositionForSource(sourceNode, pendingBox, options={}){
    const sourceRect = nodeRect(sourceNode);
    const x = (sourceRect.x || 0) + sourceRect.width + 80;
    const gap = 28;
    const outputs = outgoingConnectionsFor(sourceNode, ['input','flow'])
        .map(conn => nodes.find(n => n.id === conn.to))
        .filter(n => isSmartImageNode(n))
        .map(n => nodeRect(n))
        .filter(rect => Math.abs((rect.x || 0) - x) < Math.max(320, (pendingBox?.w || 260) + 120))
        .sort((a, b) => (a.y || 0) - (b.y || 0));
    if(!outputs.length) return {x, y:sourceRect.y || 0};
    let y = sourceRect.y || 0;
    for(const rect of outputs){
        const bottom = (rect.y || 0) + (rect.height || 0) + gap;
        if(y < bottom) y = bottom;
    }
    return {x, y};
}

function createPendingOutputFromSource(sourceNode, expectedCount, meta, options={}){
    const pendingBox = pendingBoxSize(expectedCount, {sourceNode, refs:options.refs || meta?.promptRefs || []});
    const pos = nextOutputPositionForSource(sourceNode, pendingBox);
    const output = {
        id:uid('smart'),
        type:'smart-image',
        x:pos.x,
        y:pos.y,
        title:'Image',
        images:[],
        pending:Math.max(1, Number(expectedCount) || 1),
        runStartedAt:nowMs(),
        runTimerHidden:false,
        w:pendingBox.w,
        h:pendingBox.h,
        scale:MEDIA_NODE_DEFAULT_SCALE,
        created_at:Date.now()
    };
    output._selectAfterRunId = options.selectOutput ? output.id : sourceNode.id;
    const generationKind = smartGenerationKind(sourceNode);
    if(generationKind) output.generationKind = generationKind;
    nodes.push(output);
    if(options.connectSource === false) addConnection(sourceNode.id, output.id, 'flow');
    else connectInputNode(sourceNode.id, output.id);
    attachRunMeta(output, options.stripInputMeta ? stripRunInputMeta(meta) : meta);
    smartSelection.taskSource(sourceNode.id);
    return output;
}

function extractCurrentImagesToSource(node, meta=null){
    const imgs = (node.images || []).slice();
    if(!imgs.length) return null;
    const r = nodeRect(node);
    const newX = (node.x || 0) - Math.max(280, r.width + 60);
    const source = {
        id: uid('smart'),
        type: 'smart-image',
        x: newX,
        y: node.y || 0,
        title: imgs.length > 1 ? 'Group' : 'Image',
        // 抽出到上游源节点的图片只保留"原始素材"语义：清空 runPrompt / runSettings /
        // sourceNodeId / runAt / promptDraftHtml / promptDraftText 等"生成"相关字段，
        // 避免上游图片继承下游输出的提示词信息
        images: imgs.map(img => stripImageGenerationMeta({...img})),
        created_at: Date.now()
    };
    if(Number.isFinite(Number(node.w))) source.w = node.w;
    if(Number.isFinite(Number(node.h))) source.h = node.h;
    if(Number.isFinite(Number(node.scale))) source.scale = node.scale;
    nodes.push(source);
    connectInputNode(source.id, node.id);
    node.images = [];
    delete node.w;
    delete node.h;
    return source;
}

function finalizePendingNode(pendingNode, urls, meta, kind='image'){
    if(!pendingNode) return;
    const ext = kind === 'video' ? 'mp4' : kind === 'audio' ? 'mp3' : kind === 'text' ? 'txt' : 'png';
    const imgs = urls.map((item, i) => {
        const url = typeof item === 'string' ? item : item?.url || '';
        const itemKind = (typeof item === 'object' && item.kind) || kind;
        return copyMediaSizeFields(item, {url, name:(typeof item === 'object' && item.name) || `output-${i + 1}.${ext}`, kind:itemKind, generatedResult:true});
    }).filter(img => img.url);
    pendingNode.images = imgs;
    pendingNode.pending = 0;
    pendingNode.running = false;
    pendingNode.runFinishedAt = nowMs();
    if(!pendingNode.runStartedAt) pendingNode.runStartedAt = meta?.createdAt || pendingNode.runFinishedAt;
    pendingNode.runElapsedMs = Math.max(0, pendingNode.runFinishedAt - Number(pendingNode.runStartedAt || pendingNode.runFinishedAt));
    pendingNode.runTimerHidden = false;
    pendingNode.outputKind = kind;
    if(imgs.length > 1) pendingNode.title = kind === 'video' ? 'Videos' : kind === 'audio' ? 'Audios' : kind === 'text' ? 'Texts' : 'Group';
    else pendingNode.title = kind === 'video' ? 'Video' : kind === 'audio' ? 'Audio' : kind === 'text' ? 'Text' : kind === 'file' ? 'File' : 'Image';
    pendingNode.scale = mediaNodeDefaultScale(pendingNode);
    delete pendingNode.w;
    delete pendingNode.h;
    const metaTarget = pendingNode._runMetaTargetId ? nodes.find(n => n.id === pendingNode._runMetaTargetId) : pendingNode;
    if(metaTarget) attachRunMeta(metaTarget, meta);
    pendingNode.images = (pendingNode.images || []).map(img => stripImageGenerationMeta(img));
    const outputSelectionId = pendingNode._selectAfterRunId || pendingNode.id;
    delete pendingNode._runMetaTargetId;
    delete pendingNode._selectAfterRunId;
    smartSelection.taskOutput(outputSelectionId);
}

function restoreFromExtraction(node, extracted){
    if(!node || !extracted) return;
    node.images = extracted.images.slice();
    if(Number.isFinite(Number(extracted.w))) node.w = extracted.w;
    if(Number.isFinite(Number(extracted.h))) node.h = extracted.h;
    nodes = nodes.filter(n => n.id !== extracted.id);
    canvas.connections = (canvas.connections || []).filter(c => !(c.from === extracted.id && c.to === node.id));
    if(Array.isArray(node.inputNodeIds)){
        node.inputNodeIds = node.inputNodeIds.filter(id => id !== extracted.id);
    }
}

function restoreSourceVisualState(node, state){
    if(!node || !state) return;
    node.images = (state.images || []).map(img => ({...img}));
    node.title = state.title || (node.images.length > 1 ? 'Group' : 'Image');
    ['w','h','scale','outputKind'].forEach(key => {
        if(state[key] === undefined) delete node[key];
        else node[key] = state[key];
    });
}

function directImageInputsFor(node){
    const upstream = smartImageUsesWorkflowInput(node) ? workflowInputNodesFor(node) : inputNodesFor(node);
    return upstream
        .filter(n => isSmartImageNode(n) && !isHistoryGroupNode(n) && (n.images || []).some(img => img?.url))
        .sort((a, b) => {
            const ax = Number(a.x) || 0, bx = Number(b.x) || 0;
            if(ax !== bx) return bx - ax;
            return (Number(a.y) || 0) - (Number(b.y) || 0);
        });
}

function directImageInputsForKinds(node, kinds=['input']){
    const upstream = upstreamNodesForKinds(node, kinds);
    return upstream
        .filter(n => isSmartImageNode(n) && !isHistoryGroupNode(n) && (n.images || []).some(img => img?.url))
        .sort((a, b) => {
            const ax = Number(a.x) || 0, bx = Number(b.x) || 0;
            if(ax !== bx) return bx - ax;
            return (Number(a.y) || 0) - (Number(b.y) || 0);
        });
}

function primaryImageInputFor(node, options={}){
    return (options.includeFlow ? directImageInputsForKinds(node, ['input', 'flow']) : directImageInputsFor(node))[0] || null;
}


function isGeneratedOutputForNode(sourceNode, targetNode){
    return Boolean(sourceNode?.id && targetNode?.sourceNodeId === sourceNode.id);
}

function downstreamWorkflowImageTargetsFor(node){
    return downstreamImageTargetsFor(node).filter(target => !isGeneratedOutputForNode(node, target));
}

function hasDownstreamWorkflowImageNode(node){
    return downstreamWorkflowImageTargetsFor(node).length > 0;
}

function smartImageChainTo(nodeId, options={}){
    const tail = nodes.find(n => n.id === nodeId);
    if(!isSmartImageNode(tail) || isHistoryGroupNode(tail)) return [];
    const chain = [];
    const seen = new Set();
    let cur = tail;
    while(cur && !seen.has(cur.id)){
        seen.add(cur.id);
        chain.unshift(cur);
        cur = primaryImageInputFor(cur, options);
    }
    return chain;
}

function upstreamNodesForId(nodeId, kinds=['input']){
    const result = [];
    const seen = new Set([nodeId]);
    const walk = id => {
        upstreamNodesForKinds(nodes.find(n => n.id === id), kinds).forEach(input => {
            if(seen.has(input.id)) return;
            seen.add(input.id);
            walk(input.id);
            result.push(input);
        });
    };
    walk(nodeId);
    return result;
}

function downstreamNodesForId(nodeId){
    const result = [];
    const seen = new Set([nodeId]);
    const walk = id => {
        (canvas?.connections || [])
            .filter(conn => conn.from === id && ['input','flow'].includes(conn.kind || 'flow'))
            .map(conn => nodes.find(n => n.id === conn.to))
            .filter(Boolean)
            .forEach(next => {
                if(seen.has(next.id)) return;
                seen.add(next.id);
                result.push(next);
                walk(next.id);
            });
    };
    walk(nodeId);
    return result;
}

function downstreamImageTargetsFor(node){
    if(!node?.id) return [];
    return (canvas?.connections || [])
        .filter(conn => conn.from === node.id && ['input','flow'].includes(conn.kind || 'flow'))
        .map(conn => nodes.find(n => n.id === conn.to))
        .filter(n => isSmartImageNode(n) && !isHistoryGroupNode(n))
        .sort((a, b) => {
            const ax = Number(a.x) || 0, bx = Number(b.x) || 0;
            if(ax !== bx) return ax - bx;
            return (Number(a.y) || 0) - (Number(b.y) || 0);
        });
}




function cascadeConnectionKeys(){
    return new Set([...smartCascadeRuns.values()].flatMap(run => Object.keys(run.runPath?.states || {})));
}

function coolRunButton(ms=2000){
    if(!runBtn) return 0;
    const token = ++runBtnCooldownToken;
    runBtn.disabled = true;
    setTimeout(() => {
        if(token === runBtnCooldownToken && !smartCascadeAnyRunning()) runBtn.disabled = false;
    }, ms);
    return token;
}

function coolNodeRunningState(node, ms=2000){
    if(!node) return 0;
    const writeGuard=canvasTaskWriteGuard(node);
    if(!writeGuard.valid())return 0;
    const token = ++smartRunStateToken;
    smartNodeRunTokens.set(node.id, token);
    node.running = true;
    setTimeout(() => {
        if(smartNodeRunTokens.get(node.id) !== token) return;
        if(!writeGuard.valid()){smartNodeRunTokens.delete(node.id);return;}
        smartNodeRunTokens.delete(node.id);
        const current = nodes.find(n => n.id === node.id);
        if(current){
            current.running = false;
            render();
        }
    }, ms);
    return token;
}

function clearNodeRunningState(node){
    if(!node) return;
    smartNodeRunTokens.delete(node.id);
    node.running = false;
}

function pushRightSideNodes(sourceNode, delta){
    const shift = Math.ceil(Number(delta) || 0);
    if(!sourceNode || shift <= 0) return;
    const sourceRight = (Number(sourceNode.x) || 0) + nodeRect(sourceNode).width - shift;
    const downstreamIds = new Set(downstreamNodesForId(sourceNode.id).map(n => n.id));
    nodes.forEach(n => {
        if(!n || n.id === sourceNode.id) return;
        const r = nodeRect(n);
        const shouldShift = downstreamIds.has(n.id) || (Number(r.x) > sourceRight && Math.abs((Number(r.y) || 0) - (Number(sourceNode.y) || 0)) < 520);
        if(shouldShift) n.x = (Number(n.x) || 0) + shift;
    });
}

function cascadeOutputTitle(kind='image', count=1){
    if(Number(count) > 1) return kind === 'video' ? 'Videos' : kind === 'audio' ? 'Audios' : kind === 'text' ? 'Texts' : 'Group';
    return kind === 'video' ? 'Video' : kind === 'audio' ? 'Audio' : kind === 'text' ? 'Text' : kind === 'file' ? 'File' : 'Image';
}

function cleanHistoryImages(images=[]){
    const seen = new Set();
    return (images || [])
        .filter(img => img?.url)
        .map(img => stripImageGenerationMeta({...img}))
        .filter(img => {
            const key = `${img.kind || ''}|${img.url || ''}`;
            if(seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function hasHistoryConnection(nodeId, groupId){
    return Boolean(nodeId && groupId && (canvas?.connections || []).some(conn => conn.from === nodeId && conn.to === groupId && (conn.kind || 'flow') === 'history'));
}

function demoteHistoryGroupNode(group){
    if(!group) return;
    delete group.historyFor;
    delete group.isHistoryGroup;
    if(group.title === '历史分组'){
        const count = (group.images || []).length;
        group.title = count > 1 ? 'Group' : count === 1 ? 'Image' : '上传节点';
    }
}

function historyGroupForNode(node){
    if(!node?.id) return null;
    let matched = null;
    nodes.forEach(n => {
        if(!isHistoryGroupNode(n) || n.historyFor !== node.id) return;
        if(hasHistoryConnection(node.id, n.id)){
            if(!matched) matched = n;
        } else {
            demoteHistoryGroupNode(n);
        }
    });
    return matched;
}

function positionHistoryGroupForNode(node, group){
    if(!node || !group) return;
    const r = nodeRect(node);
    const gr = nodeRect(group);
    if(!Number.isFinite(Number(group.x))) group.x = Math.round((Number(node.x) || 0) + Math.max(0, (r.width - gr.width) / 2));
    if(!Number.isFinite(Number(group.y))) group.y = Math.round((Number(node.y) || 0) + r.height + 56);
}

function ensureHistoryGroupForNode(node){
    if(!node?.id) return null;
    let group = historyGroupForNode(node);
    if(!group){
        const r = nodeRect(node);
        group = {
            id:uid('smart'),
            type:'smart-image',
            x:Math.round(Number(node.x || 0)),
            y:Math.round(Number(node.y || 0) + r.height + 56),
            title:'历史分组',
            images:[],
            historyFor:node.id,
            isHistoryGroup:true,
            scale:MEDIA_GROUP_DEFAULT_SCALE,
            created_at:Date.now()
        };
        nodes.push(group);
    }
    group.type = 'smart-image';
    group.title = '历史分组';
    group.isHistoryGroup = true;
    group.historyFor = node.id;
    if(!Number.isFinite(Number(group.scale))) group.scale = MEDIA_GROUP_DEFAULT_SCALE;
    addConnection(node.id, group.id, 'history');
    positionHistoryGroupForNode(node, group);
    return group;
}

function replaceOutputsToNodeWithHistory(node, additions, kind='image', meta=null, options={}){
    if(!node || !additions?.length) return [];
    const beforeRight = (Number(node.x) || 0) + nodeRect(node).width;
    const existing = cleanHistoryImages(node.images || []);
    const next = cleanHistoryImages(additions);
    if(!next.length) return [];
    const history = existing.length ? ensureHistoryGroupForNode(node) : historyGroupForNode(node);
    if(history){
        const archived = cleanHistoryImages([...existing, ...(history.images || [])]);
        history.images = archived;
        history.title = '历史分组';
        history.outputKind = kind;
        history.scale = MEDIA_GROUP_DEFAULT_SCALE;
        delete history.w;
        delete history.h;
    }
    node.images = next;
    node.pending = 0;
    node.running = false;
    delete node.pendingTasks;
    node.runFinishedAt = nowMs();
    if(!node.runStartedAt) node.runStartedAt = meta?.createdAt || node.runFinishedAt;
    node.runElapsedMs = Math.max(0, node.runFinishedAt - Number(node.runStartedAt || node.runFinishedAt));
    node.runTimerHidden = false;
    node.outputKind = kind;
    node.title = cascadeOutputTitle(kind, node.images.length);
    node.scale = node.images.length > 1 ? MEDIA_GROUP_DEFAULT_SCALE : MEDIA_NODE_DEFAULT_SCALE;
    delete node.w;
    delete node.h;
    if(meta) attachRunMeta(node, meta);
    const afterRight = (Number(node.x) || 0) + nodeRect(node).width;
    const skipShift = options.skipShift;
    if(!skipShift) pushRightSideNodes(node, afterRight - beforeRight + 36);
    smartSelection.outputsReplaced();
    return next;
}

function appendOutputsToNode(node, additions, kind='image', options={}){
    if(!node || !additions?.length) return [];
    const beforeRight = (Number(node.x) || 0) + nodeRect(node).width;
    const existing = (node.images || []).filter(img => img?.url).map(img => stripImageGenerationMeta(img));
    const next = additions.map(img => stripImageGenerationMeta({...img}));
    node.images = [...existing, ...next];
    node.pending = 0;
    node.running = false;
    node.runFinishedAt = nowMs();
    if(!node.runStartedAt) node.runStartedAt = node.runFinishedAt;
    node.runElapsedMs = Math.max(0, node.runFinishedAt - Number(node.runStartedAt || node.runFinishedAt));
    node.runTimerHidden = false;
    node.outputKind = kind;
    node.title = node.images.length > 1 ? (kind === 'video' ? 'Videos' : kind === 'audio' ? 'Audios' : kind === 'text' ? 'Texts' : 'Group') : (kind === 'video' ? 'Video' : kind === 'audio' ? 'Audio' : kind === 'text' ? 'Text' : kind === 'file' ? 'File' : 'Image');
    delete node.w;
    delete node.h;
    const afterRight = (Number(node.x) || 0) + nodeRect(node).width;
    const skipShift = options.skipShift;
    if(!skipShift) pushRightSideNodes(node, afterRight - beforeRight + 36);
    return next;
}


function loadNodePromptDraftToInput(node){
    if(node?.nativePrompt?.schemaVersion===1){PixmaxReshootReferences.setPrompt(node,node.nativePrompt.prompt);promptInput.innerHTML=node.promptDraftHtml;return;}
    if(node?.promptDraftHtml) {
        const hasToken = String(node.promptDraftHtml || '').includes('mention-image-token');
        promptInput.innerHTML = hasToken
            ? node.promptDraftHtml
            : (promptHtmlWithMentionTokens(node.runPrompt || node.promptDraftText || '', node.runPromptRefs || []) || node.promptDraftHtml);
    } else {
        const draft=typeof node?.promptDraftText==='string'?node.promptDraftText:node?.runPrompt||'';
        const rebuilt = promptHtmlWithMentionTokens(draft, node?.runPromptRefs || []);
        if(rebuilt) promptInput.innerHTML = rebuilt;
        else setPromptText(draft);
    }
    if(node)window.PixmaxStoryboardMedia?.refreshPromptReferences(node,promptInput);
}

function buildPromptRequestForNode(node, defaultImages, ctx=null){
    const oldHtml = promptInput.innerHTML;
    loadNodePromptDraftToInput(node);
    try {
        return buildPromptRequest(node, defaultImages, false, ctx);
    } finally {
        promptInput.innerHTML = oldHtml;
    }
}

async function generateUrlsForCurrentSettings(node, prompt, refs, runSettings=settings, inputBinding=null){
    window.PixmaxGenerationParameters?.validate(node);
    const writeGuard=canvasTaskWriteGuard(node);
    writeGuard.check(); inputBinding?.check();
    inputBinding ||= smartTaskInputBinding(node,node,writeGuard);
    if(node.segmentReshoot?.schemaVersion===1||node.nativePrompt?.schemaVersion===1){await PixmaxSubjects.refresh(node,writeGuard.valid,{checkOnly:true});writeGuard.check();inputBinding.check();}
    await window.PixmaxGenerationParameters?.validateInputs(node,runSettings);
    writeGuard.check();inputBinding.check();
    let activeSettings = window.PixmaxSegmentReshoot?.executionSettings(node,runSettings||settings)||runSettings||settings;
    if(node.segmentReshoot?.schemaVersion===1){const request=PixmaxReshootReferences.request(node,activeSettings);prompt=request.prompt;refs=request.refs;activeSettings=request.settings;}
    if(activeSettings.engine === 'comfy') return generateComfyUrlsWithSettings(activeSettings, prompt, refs);
    if(isApiLikeEngine(activeSettings.engine) && activeSettings.apiKind === 'video'){
        const taskResult = await runApiVideoGeneration(prompt, refs, activeSettings, inputBinding);
        writeGuard.check(); inputBinding?.check();
        const pendingResult = await queueAndResumeSmartApiTasks(node, taskResult, {
            kind:'video',
            startedAt:nowMs(),
            run:smartPendingTaskRun(node, null, 'video')
        });
        writeGuard.check(); inputBinding?.check();
        return {urls:pendingResult.outputs, kind:'video'};
    }
    if(isApiLikeEngine(activeSettings.engine)){
        const taskResult = await runApiGeneration(prompt, refs, activeSettings, inputBinding);
        writeGuard.check(); inputBinding?.check();
        const taskIds = Array.isArray(taskResult?.taskIds) ? taskResult.taskIds : [];
        if(taskIds.length){
            const run = {...smartRunSnapshot(node, prompt, refs, 'image'), settings:cloneSmartSettings(activeSettings)};
            const startedAt = nowMs();
            const settled = await Promise.all(taskIds.map(async taskId => {
                const record = await pollSmartCanvasTask(taskId, 'image', {inputBinding,returnRecord:Boolean(inputBinding)});
                const result = inputBinding ? record.result : record;
                writeGuard.check(); inputBinding?.check();
                const log=()=>addSmartGenerationLog({run:{...run, canvasTaskId:taskId}, outputs:resultMediaUrls(result?.images || result), runMs:nowMs()-startedAt});
                if(inputBinding)inputBinding.apply(record,log,taskId);else log();
                return result;
            }));
            writeGuard.check(); inputBinding?.check();
            const urls = settled.flatMap(result => resultMediaUrls(result?.images || result)).filter(Boolean);
            return {urls, kind:mediaKindForUrls(urls, 'image'), logged:true};
        }
        const urls = resultMediaUrls(taskResult);
        return {urls, kind:mediaKindForUrls(urls, 'image')};
    }
    const urls = activeSettings.engine === 'modelscope'
        ? await runModelscopeGeneration(prompt, refs, activeSettings, inputBinding)
        : [];
    return {urls, kind:mediaKindForUrls(urls, 'image')};
}

async function generateComfyUrlsWithSettings(runSettings, prompt, refs){
    throw new Error("此功能已移除，历史内容保留。请新建通用 API 节点并明确选择供应商。");
}

async function runCascadeStepIntoNode(sourceNode, targetNode, inputRefs, ctx=null){
    const outputNode = targetNode || sourceNode;
    if(!sourceNode || !targetNode || !outputNode) return [];
    const requestNode = sourceNode;
    const writeGuard=canvasTaskWriteGuard(sourceNode,targetNode);
    writeGuard.check();
    const previousSettings = cloneSmartSettings(settings);
    const runSettings = {...cloneSmartSettings(settings), ...cloneSmartSettings(smartSettingsForNode(requestNode) || {})};
    settings = runSettings;
    const outpaintSize = validOutpaintSize(requestNode);
    const selfRefs = selfReferenceImagesForNode(sourceNode, false, ctx).filter(img => img?.url);
    const sourceRefs = (selfRefs.length ? selfRefs : defaultReferenceImagesFor(requestNode, false, ctx)).filter(img => img?.url);
    const refsForRequest = sourceRefs.length
        ? sourceRefs
        : (inputRefs && inputRefs.length ? inputRefs : null);
    let request;
    try { request = buildPromptRequestForNode(requestNode, refsForRequest, ctx); }
    catch(error){ settings = previousSettings; throw error; }
    const prompt = (request.prompt || '').trim();
    const displayPrompt = (request.displayPrompt || '').trim();
    if((!prompt || !displayPrompt) && smartRunNeedsPrompt(runSettings)){
        settings = previousSettings;
        throw new Error('链路节点缺少提示词');
    }
    const meta = {
        prompt,
        displayPrompt:request.displayPrompt || '',
        promptRefs:(request.refs || []).map(ref => ({...ref})).filter(ref => ref.url),
        inputRefs:(request.refs || []).map(ref => ({...ref})).filter(ref => ref.url),
        sourceNodeId:sourceNode.id,
        settings:JSON.parse(JSON.stringify(runSettings)),
        createdAt:Date.now()
    };
    if(requestNode.promptDraftHtml != null){
        meta.promptHtml = requestNode.promptDraftHtml;
        meta.promptText = requestNode.promptDraftText || request.displayPrompt || '';
    }
    const logKind = isApiLikeEngine(runSettings.engine) && runSettings.apiKind === 'video' ? 'video' : 'image';
    const runLog = smartRunSnapshot(requestNode, prompt, request.refs || [], logKind);
    const runLogStart = nowMs();
    const targetPromptState = {
        promptDraftHtml:targetNode.promptDraftHtml,
        promptDraftText:targetNode.promptDraftText,
        runPrompt:targetNode.runPrompt,
        runModelPrompt:targetNode.runModelPrompt,
        runPromptRefs:targetNode.runPromptRefs ? targetNode.runPromptRefs.map(ref => ({...ref})) : undefined,
        runInputRefs:targetNode.runInputRefs ? targetNode.runInputRefs.map(ref => ({...ref})) : undefined,
        runSettings:targetNode.runSettings ? cloneSmartSettings(targetNode.runSettings) : undefined,
        sourceNodeId:targetNode.sourceNodeId,
        runAt:targetNode.runAt
    };
    outputNode.running = true;
    outputNode.runStartedAt = nowMs();
    delete outputNode.runFinishedAt;
    delete outputNode.runElapsedMs;
    outputNode.runTimerHidden = false;
    rememberRecentSmartSettings(runSettings, requestNode);
    render();
    settings = previousSettings;
    let inputBinding=null;
    try {
        inputBinding=smartTaskInputBinding(requestNode,outputNode,writeGuard);
        const isAsyncVideo = isApiLikeEngine(runSettings.engine) && runSettings.apiKind === 'video';
        let result;
        if(isAsyncVideo){
            const taskResult = await runApiVideoGeneration(prompt, request.refs || [], runSettings, inputBinding);
            writeGuard.check(); inputBinding?.check();
            const pendingResult = await queueAndResumeSmartApiTasks(outputNode, taskResult, {
                kind:'video',
                startedAt:runLogStart,
                run:{...runLog, kind:'video', settings:cloneSmartSettings(runLog.settings)}
            });
            result = {urls:pendingResult.outputs, kind:'video'};
        } else {
            result = await generateUrlsForCurrentSettings(outputNode, prompt, request.refs || [], runSettings, inputBinding);
        }
        writeGuard.check(); inputBinding?.check();
        if(!result.urls?.length) throw new Error(result.kind === 'video' ? '没有返回视频' : '没有返回图片');
        if(outpaintSize) delete requestNode.outpaintSize;
        let additions;
        if(isAsyncVideo){
            additions = result.urls.map(item => stripImageGenerationMeta({...item})).filter(item => item?.url);
        } else {
            if(!result.logged) addSmartGenerationLog({run:{...runLog, kind:result.kind || logKind}, outputs:result.urls, runMs:nowMs() - runLogStart});
            const ext = result.kind === 'video' ? 'mp4' : result.kind === 'audio' ? 'mp3' : result.kind === 'text' ? 'txt' : 'png';
            additions = result.urls.map((item, i) => {
                const url = typeof item === 'string' ? item : item?.url || '';
                return stripImageGenerationMeta(copyMediaSizeFields(item, {url, name:(typeof item === 'object' && item.name) || `output-${i + 1}.${ext}`, kind:(typeof item === 'object' && item.kind) || result.kind, generatedResult:true}));
            }).filter(item => item.url);
            replaceOutputsToNodeWithHistory(outputNode, additions, result.kind);
        }
        outputNode.runPrompt = targetPromptState.runPrompt;
        outputNode.runModelPrompt = targetPromptState.runModelPrompt;
        outputNode.runPromptRefs = targetPromptState.runPromptRefs || [];
        outputNode.runInputRefs = targetPromptState.runInputRefs || [];
        outputNode.runSettings = targetPromptState.runSettings;
        outputNode.sourceNodeId = targetPromptState.sourceNodeId;
        outputNode.runAt = targetPromptState.runAt;
        if(targetPromptState.promptDraftHtml === undefined) delete outputNode.promptDraftHtml;
        else outputNode.promptDraftHtml = targetPromptState.promptDraftHtml;
        if(targetPromptState.promptDraftText === undefined) delete outputNode.promptDraftText;
        else outputNode.promptDraftText = targetPromptState.promptDraftText;
        ['runPrompt','runModelPrompt','runSettings','sourceNodeId','runAt'].forEach(key => {
            if(targetPromptState[key] === undefined) delete outputNode[key];
        });
        render();
        return additions;
    } catch(e) {
        try{inputBinding?.check();}catch(changed){e=changed;}
        pauseSmartTaskInput(outputNode,inputBinding,writeGuard,e);
        if(e?.resultPending || !writeGuard.valid())throw e?.inputChanged ? e : writeGuard.pause();
        outputNode.running = false;
        addSmartGenerationLog({run:runLog, outputs:[], runMs:nowMs() - runLogStart, error:e.message || String(e)});
        render();
        throw e;
    }
}








function smartTaskInputDocument(){
    const projection=canvasForStorage({...canvas,nodes});
    const subject=activeComposerNode();
    if(subject && subject.nativePrompt?.schemaVersion!==1 && promptInput?.dataset?.promptLocked!=='1' && !(promptInput?.dataset?.preserveDraftOnce==='1' && subject.promptDraftHtml)){
        const copy=projection.nodes.find(node=>node.id===subject.id);
        const changes=smartComposerChanges(subject);
        if(copy && changes.prompt){copy.promptDraftHtml=promptInput.innerHTML;copy.promptDraftText=promptPlainText();}
        if(copy && changes.settings)copy.runSettings=settingsForStorage(settings);
    }
    return projection;
}

function smartTaskInputBinding(source,target,writeGuard){
    if(!window.CanvasSession?.enabled)return null;
    if(!window.CanvasTaskBindings?.operation)throw new Error('生成校验组件尚未加载，请保存并刷新页面后重试。');
    return window.CanvasTaskBindings.operation({canvasId:canvas.id,kind:'smart',sourceId:source.id,targetId:target.id,
        read:smartTaskInputDocument,valid:writeGuard.valid,revision:()=>window.MemberCanvasEdit?.active?.lease?.revision,
        flush:()=>saveCanvas({force:true})});
}

function attachSmartTaskBinding(task,inputBinding){
    if(inputBinding)Object.defineProperty(task,'_inputBinding',{value:inputBinding,enumerable:false,configurable:true});
    return task;
}

function pauseSmartTaskInput(node,inputBinding,writeGuard,error){
    if(!error?.inputChanged || !inputBinding || !writeGuard.valid() || !nodes.includes(node))return;
    const tasks=smartPendingTasks(node);
    const owned=tasks.filter(task=>task._inputBinding===inputBinding);
    if(!owned.length)return;
    owned.forEach(task=>{task.paused=true;task.querying=false;});
    node.pending=tasks.filter(task=>!task.paused).length;
    if(!node.pending){
        node.running=false;
        node.queued=false;
        node.runTimerHidden=true;
    }
    refreshSmartNodes([node.id]);
    scheduleSave();
}

function smartTaskUiGuard(){
    const selection=smartSelection.nodeId,composer=activeComposerNode(),html=promptInput?.innerHTML;
    const config=JSON.stringify(settingsForStorage(settings));
    return ()=>smartSelection.nodeId===selection && activeComposerNode()===composer && promptInput?.innerHTML===html && JSON.stringify(settingsForStorage(settings))===config;
}

async function runGeneration(){
    if(['comfy', 'modelscope'].includes(settings.engine)) { toast("此功能已移除，历史内容保留。请新建通用 API 节点并明确选择供应商。"); return; }
    if(isSmartCanvasLocked()) return toast('画布正在被其他人编辑，无法运行');
    const node = selectedNode();
    if(!node) return;
    if(node.segmentReshoot?.schemaVersion===1)return window.PixmaxSegmentReshoot.open(node);
    savePromptDraftForCurrent();
    try{window.PixmaxGenerationParameters?.validate(node);}catch(error){return toast(error.message);}
    if(node.nativePrompt?.schemaVersion===1){
        const guard=canvasTaskWriteGuard(node),configuration=JSON.stringify(settingsForStorage(smartSettingsForNode(node)));
        const valid=()=>guard.valid()&&selectedNode()===node&&activeComposerNode()===node&&JSON.stringify(settingsForStorage(smartSettingsForNode(node)))===configuration;
        try{await PixmaxSubjects.refresh(node,valid);guard.check();if(!valid())throw Error('生成节点或参数已变化，请确认当前内容后重新生成');}catch(error){return toast(error.message);}
    }
    if(window.PixmaxGenerationParameters?.supported(node)){
        const guard=canvasTaskWriteGuard(node),signature=PixmaxReshootReferences.signature(node);
        try{await PixmaxGenerationParameters.validateInputs(node);guard.check();if(selectedNode()!==node||PixmaxReshootReferences.signature(node)!==signature)throw Error('生成节点或参考已变化，请确认当前内容后重新生成');}catch(error){return toast(error.message);}
    }
    if(window.PixmaxBatchExecution?.busy(node.id))return toast('此节点正在批量生成，请等待当前任务完成');
    const previousSettings = cloneSmartSettings(settings);
    const runSettings = smartSettingsForNode(node);
    settings = {...settings, ...cloneSmartSettings(runSettings || {})};
    let request;
    try { request = buildPromptRequest(node, null, true, null); }
    catch(error){ settings = previousSettings; toast(error.message || '素材引用无效'); return; }
    const prompt = request.prompt.trim();
    const refs = request.refs;
    if(!prompt && smartRunNeedsPrompt(settings)){
        settings = previousSettings;
        toast('请输入提示词');
        return;
    }
    const outpaintSize = node?.outpaintSize && Number(node.outpaintSize.width) > 0 && Number(node.outpaintSize.height) > 0
        ? {width:Math.round(Number(node.outpaintSize.width)), height:Math.round(Number(node.outpaintSize.height))}
        : null;
    if(outpaintSize && isApiLikeEngine(settings.engine) && settings.apiKind !== 'video'){
        settings = {
            ...settings,
            resolution:'custom',
            ratio:'',
            customWidth:outpaintSize.width,
            customHeight:outpaintSize.height,
            customSize:`${outpaintSize.width}x${outpaintSize.height}`
        };
        const error = smartOutpaintResolutionError(settings);
        if(error){ settings = previousSettings; toast(error); return; }
    }
    const meta = snapshotRunMeta(prompt, node.id, request.displayPrompt, refs);
    const logKind = isApiLikeEngine(settings.engine) && settings.apiKind === 'video' ? 'video' : 'image';
    const runLog = smartRunSnapshot(node, prompt, refs, logKind);
    rememberRecentSmartSettings(settings, node);
    const runLogStart = nowMs();
    const expectedCount = settings.apiKind === 'video' ? 1 : Math.max(1, Math.min(8, Number(settings.count || 1)));
    const apiConcurrentRun = isApiLikeEngine(settings.engine) || settings.engine === 'modelscope';
    const nodeHasImages = (node.images || []).some(img => img?.url);
    const workflowModeRun = smartImageUsesWorkflowInput(node, null);
    const sourceVisualState = nodeHasImages && !workflowModeRun ? {
        images:(node.images || []).map(img => ({...img})),
        title:node.title,
        w:node.w,
        h:node.h,
        scale:node.scale,
        outputKind:node.outputKind
    } : null;
    pushUndo();
    let extracted = null;
    let branchNode = null;
    const pendingMeta = nodeHasImages && !workflowModeRun ? stripRunInputMeta(meta) : meta;
    undoSuppressed = true;
    if(nodeHasImages && !workflowModeRun) branchNode = createPendingOutputFromSource(node, expectedCount, pendingMeta, {connectSource:false, selectOutput:true, refs});
    undoSuppressed = false;
    const pendingNode = branchNode || node;
    const writeGuard=canvasTaskWriteGuard(node,pendingNode);
    if(!writeGuard.valid())return;
    if(extracted) pendingNode._runMetaTargetId = extracted.id;
    if(!branchNode){
        pendingNode.pending = Math.max(1, Number(expectedCount) || 1);
        pendingNode.runStartedAt = nowMs();
        delete pendingNode.runFinishedAt;
        delete pendingNode.runElapsedMs;
        pendingNode.runTimerHidden = false;
        const pendingBox = pendingBoxSize(pendingNode.pending, {sourceNode:node, refs});
        pendingNode.w = pendingBox.w;
        pendingNode.h = pendingBox.h;
        attachRunMeta(pendingNode, pendingMeta);
    }
    if(apiConcurrentRun){
        coolNodeRunningState(pendingNode, 2000);
        coolRunButton(2000);
    } else {
        pendingNode.running = true;
        runBtn.disabled = true;
    }
    render();
    const generationSettings=cloneSmartSettings(settings);
    const ownsUi=smartTaskUiGuard();
    const restoreUi=(clear=false)=>{if(ownsUi()){if(clear)clearPromptInput({preserveDraft:true});settings=previousSettings;}};
    let inputBinding=null;
    try {
        inputBinding=smartTaskInputBinding(node,pendingNode,writeGuard);
        if(generationSettings.engine === 'comfy'){
            await runComfyGeneration(pendingNode, prompt, refs, pendingNode, pendingMeta);
            if(sourceVisualState) restoreSourceVisualState(node, sourceVisualState);
            addSmartGenerationLog({run:runLog, outputs:(pendingNode.images || []).map(img => img.url).filter(Boolean), runMs:nowMs() - runLogStart});
            restoreUi();
            return;
        }
        if(isApiLikeEngine(generationSettings.engine) && generationSettings.apiKind === 'video'){
            const taskResult = await runApiVideoGeneration(prompt, refs, generationSettings, inputBinding);
            writeGuard.check(); inputBinding?.check();
            const pendingResult = await queueAndResumeSmartApiTasks(pendingNode, taskResult, {
                kind:'video',
                startedAt:runLogStart,
                run:{...runLog, kind:'video', settings:cloneSmartSettings(runLog.settings)},
                archiveExisting:false
            });
            writeGuard.check(); inputBinding?.check();
            if(!pendingResult.outputs.length) throw new Error('没有返回视频');
            if(sourceVisualState) restoreSourceVisualState(node, sourceVisualState);
            restoreUi(true);
            scheduleSave();
            return;
        }
        const outImages = generationSettings.engine === 'modelscope'
            ? await runModelscopeGeneration(prompt, refs)
            : await runApiGeneration(prompt, refs, generationSettings, inputBinding);
        writeGuard.check(); inputBinding?.check();
        if(isApiLikeEngine(generationSettings.engine)){
            const taskIds = Array.isArray(outImages?.taskIds) ? outImages.taskIds : [];
            if(!taskIds.length) throw new Error('生成失败');
            pendingNode.pendingTasks = taskIds.map(taskId => attachSmartTaskBinding({
                taskId,
                kind:'image',
                providerId:outImages.providerId,
                model:outImages.model,
                startedAt:runLogStart,
                run:{...runLog, kind:'image', settings:cloneSmartSettings(runLog.settings)}
            }, inputBinding));
            pendingNode.pending = taskIds.length;
            pendingNode.runStartedAt = nowMs();
            pendingNode.runTimerHidden = false;
            pendingNode.running = false;
            render();
            scheduleSave();
            await saveCanvas();
            writeGuard.check(); inputBinding?.check();
            await resumeSmartPendingNode(pendingNode);
            writeGuard.check(); inputBinding?.check();
            if(smartRecoverableImageTask(pendingNode)){
                if(sourceVisualState) restoreSourceVisualState(node, sourceVisualState);
                restoreUi(true);
                scheduleSave();
                return;
            }
            if(!(pendingNode.images || []).length) throw new Error('没有返回图片');
            if(outpaintSize) delete node.outpaintSize;
            if(sourceVisualState) restoreSourceVisualState(node, sourceVisualState);
            restoreUi(true);
            scheduleSave();
            return;
        }
        if(!outImages.length) throw new Error('没有返回图片');
        if(outpaintSize) delete node.outpaintSize;
        finalizePendingNode(pendingNode, outImages, pendingMeta);
        if(sourceVisualState) restoreSourceVisualState(node, sourceVisualState);
        addSmartGenerationLog({run:runLog, outputs:outImages, runMs:nowMs() - runLogStart});
        restoreUi(true);
        scheduleSave();
    } catch(e) {
        try{inputBinding?.check();}catch(changed){e=changed;}
        if(e?.inputChanged && writeGuard.valid()){pauseSmartTaskInput(pendingNode,inputBinding,writeGuard,e);toast(e.message);}
        if(e?.resultPending || !writeGuard.valid()){writeGuard.pause();return;}
        restoreUi();
        pendingNode.pending = 0;
        if(branchNode){
            nodes = nodes.filter(n => n.id !== branchNode.id);
            canvas.connections = (canvas.connections || []).filter(c => c.from !== branchNode.id && c.to !== branchNode.id);
            if(ownsUi())smartSelection.taskFailed(node.id);
        } else {
            pendingNode.pending = 0;
            pendingNode.running = false;
            if(!(pendingNode.images || []).length){
                delete pendingNode.w;
                delete pendingNode.h;
            }
        }
        if(extracted) restoreFromExtraction(node, extracted);
        delete pendingNode._runMetaTargetId;
        addSmartGenerationLog({run:runLog, outputs:[], runMs:nowMs() - runLogStart, error:e.message || String(e)});
        toast((e.message || '生成失败').slice(0, 160));
    } finally {
        if(writeGuard.valid()){
            if(!apiConcurrentRun){
                clearNodeRunningState(pendingNode);
                runBtn.disabled = false;
            }
            render();
        }
    }
}

function comfyFieldKind(field){
    if(['image','video','audio'].includes(field?.type)) return field.type;
    const key = `${field?.input || ''} ${field?.name || ''}`.toLowerCase();
    if(field?.type === 'textarea' || /prompt|text|提示词|正向|负向/.test(key)) return 'prompt';
    return 'setting';
}

async function runApiGeneration(prompt, refs, runSettings=settings,inputBinding=null,imageTool=null,options={}){
    if(!runSettings.provider_id || !runSettings.model) throw new Error('请先选择可用的 API 生图模型');
    if(runSettings.outpaintResolutionLocked === true){
        const error = smartOutpaintResolutionError(runSettings);
        if(error) throw new Error(error);
    }
    const count = Math.max(1, Math.min(8, Number(runSettings.count || 1)));
    const payload = {prompt, provider_id:runSettings.provider_id, model:runSettings.model, size:sizeForRun(runSettings), quality:runSettings.quality || 'auto', n:1, reference_images:imageRefsOnly(refs)};
    if(imageTool){payload.image_tool=imageTool.kind;payload.image_tool_revision=imageTool.revision;}
    if(options.preview)return {...payload,n:count};
    if(inputBinding){payload.canvas_target=await inputBinding.prepare();inputBinding.beginSubmission();}
    const submitted = await Promise.allSettled(Array.from({length:count}, () => (window.CanvasApi?.createCanvasImageTaskRequest
        ? window.CanvasApi.createCanvasImageTaskRequest({...payload,canvas_id:canvasId})
        : fetch('/api/canvas-image-tasks', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...payload, canvas_id:canvasId})})).then(async r => {
        if(!r.ok) throw new Error(await r.text());
        const task=await r.json();inputBinding?.remember(task);return task;
    })));
    const tasks=submitted.filter(item=>item.status==='fulfilled').map(item=>item.value);
    if(!tasks.length)throw submitted.find(item=>item.status==='rejected').reason;
    if(tasks.length<count)console.warn('部分生成请求未提交；已接受的任务继续处理。');
    return {taskIds:tasks.map(task => task.task_id).filter(Boolean), count:tasks.length, providerId:payload.provider_id, model:payload.model,inputBinding};
}

async function runApiVideoGeneration(prompt, refs, runSettings=settings,inputBinding=null,options={}){
    if(!runSettings.videoModel) throw new Error('请先选择视频模型');
    if(!smartVideoResolutions(runSettings).includes(runSettings.videoResolution || '')) throw new Error('视频规格已变化，请重新选择模型和分辨率后生成。');
    try {
        const targetPlatform = videoProviderPlatform(runSettings.videoProvider || 'comfly');
        const targetProvider = targetPlatform === 'volcengine'
            ? (apiProviders || []).find(p => p.id === runSettings.videoProvider) || {id:runSettings.videoProvider || 'volcengine'} : null;
        const currentRefs = targetPlatform === 'volcengine' ? (refs || []).map(smartCurrentFaceAuthRef) : refs;
        const uploadedRefs = applyUploadedUrlsToSmartRefs(currentRefs, runSettings);
        const effUrl = ref => {
            if(targetPlatform !== 'volcengine') return ref?.url;
            return smartVolcengineAssetUrisForRef(ref,targetProvider).volcengine || ref?.url;
        };
        const unreadyVolcengineAsset = targetPlatform === 'volcengine' && uploadedRefs
            .map(ref => smartFaceAuthState(ref,targetProvider)).find(state => state.blocked);
        if(unreadyVolcengineAsset) throw new Error(window.CanvasAssetAuth.error(unreadyVolcengineAsset.status));
        const nativeRoles=window.PixmaxVideoModes&&runSettings.videoReferenceMode&&runSettings.videoReferenceMode!=='auto'?window.PixmaxVideoModes.roles(runSettings,uploadedRefs):null;
        const useFrameRoles = targetPlatform !== 'volcengine' && runSettings.videoUseFrameRoles;
        const refImages = imageRefsOnly(uploadedRefs).map((ref, i) => {
            const item = {url:effUrl(ref), name:ref.name || `图${i + 1}`};
            if(nativeRoles)item.role=nativeRoles[i];
            if(useFrameRoles&&!nativeRoles){
                if(i === 0) item.role = 'first_frame';
                else if(i === 1) item.role = 'last_frame';
            }
            return item;
        });
        const manualVideo = manualSmartVideoLink(runSettings)?.url || '';
        const refVideos = manualVideo ? manualSmartMediaLinks(runSettings).map(item => item.url).filter(Boolean) : videoRefsOnly(uploadedRefs).map(ref => effUrl(ref)).filter(Boolean);
        const refAudios = audioRefsOnly(uploadedRefs).map(ref => effUrl(ref)).filter(Boolean);
        const usesTrustedVolcengineAssets = [...refImages.map(item => item.url), ...refVideos, ...refAudios]
            .some(url => String(url || '').startsWith('asset://'));
        const payload = {
            prompt,
            provider_id: runSettings.videoProvider || 'comfly',
            model: runSettings.videoModel || 'veo3-fast',
            duration: window.VideoDurationPolicy.clamp(runSettings.videoDuration,smartVideoDurationRange(runSettings)),
            aspect_ratio: runSettings.videoAspect || '16:9',
            resolution: runSettings.videoResolution || '',
            images: refImages,
            videos: refVideos,
            audios: refAudios,
            enhance_prompt: Boolean(runSettings.videoEnhancePrompt),
            enable_upsample: Boolean(runSettings.videoEnableUpsample),
            watermark: Boolean(runSettings.videoWatermark),
            camerafixed: Boolean(runSettings.videoCameraFixed),
            generate_audio: Boolean(runSettings.videoGenerateAudio),
            multimodal: Boolean(runSettings.videoMultimodal),
            trusted_asset: usesTrustedVolcengineAssets,
            task_mode: runSettings.videoTaskMode || 'auto'
        };
        if(runSettings.videoOutputFormat)payload.output_format=runSettings.videoOutputFormat;
        if(options.preview)return payload;
        if(inputBinding){payload.canvas_target=await inputBinding.prepare();inputBinding.beginSubmission();}
        const taskId = options.taskId || uid('canvas_vid');
        const submission = (window.CanvasApi?.createCanvasVideoTaskRequest
            ? window.CanvasApi.createCanvasVideoTaskRequest({...payload,client_task_id:taskId,canvas_id:canvasId})
            : fetch('/api/canvas-video-tasks', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({...payload, client_task_id:taskId, canvas_id:canvasId})
        })).then(async r => {
            if(!r.ok){const error=new Error(await smartResponseErrorMessage(r, '生成失败'));error.status=r.status;throw error;}
            const task = await r.json();
            if(task?.task_id !== taskId) throw new Error('生成失败');
            inputBinding?.remember(task);return task;
        });
        // The request is already in flight, while the client-generated ID can be
        // persisted synchronously before the user has a chance to leave the canvas.
        submission.catch(() => {});
        return {taskIds:[taskId], count:1, providerId:payload.provider_id, model:payload.model, submission,inputBinding};
    } finally {
        if(!options.preview)transientSmartCloudLinks = [];
    }
}

async function runModelscopeGeneration(prompt, refs, runSettings=settings){
    throw new Error("此功能已移除，历史内容保留。请新建通用 API 节点并明确选择供应商。");
}

async function urlToBase64(url){
    const res = await fetch(url);
    if(!res.ok) throw new Error('图片读取失败');
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }

async function runComfyGeneration(node, prompt, refs, pendingNode, meta){
    throw new Error("此功能已移除，历史内容保留。请新建通用 API 节点并明确选择供应商。");
}

async function runComfyText(node, prompt, pendingNode, meta){
    throw new Error("此功能已移除，历史内容保留。请新建通用 API 节点并明确选择供应商。");
}

async function runComfyEnhance(node, refs, pendingNode, meta){
    throw new Error("此功能已移除，历史内容保留。请新建通用 API 节点并明确选择供应商。");
}

async function runComfyEdit(node, prompt, refs, pendingNode, meta){
    throw new Error("此功能已移除，历史内容保留。请新建通用 API 节点并明确选择供应商。");
}

async function comfyNameForRef(ref){
    throw new Error("此功能已移除，历史内容保留。请新建通用 API 节点并明确选择供应商。");
}

function smartPendingTasks(node){
    if(!node || !Array.isArray(node.pendingTasks)) return [];
    return node.pendingTasks.filter(task => task && task.taskId);
}

function smartNodePendingCount(node){
    return Math.max(0, Number(node?.pending || 0), smartPendingTasks(node).filter(task=>!task.paused).length);
}

function archiveSmartOutputsBeforePending(node){
    const existing = cleanHistoryImages(node?.images || []);
    if(!node || !existing.length) return;
    const history = ensureHistoryGroupForNode(node);
    history.images = cleanHistoryImages([...existing, ...(history.images || [])]);
    history.title = '历史分组';
    history.outputKind = mediaKindForUrls(existing, existing.some(isVideoMediaItem) ? 'video' : 'image');
    history.scale = MEDIA_GROUP_DEFAULT_SCALE;
    delete history.w;
    delete history.h;
    node.images = [];
}

async function queueAndResumeSmartApiTasks(node, taskResult, options={}){
    const kind = options.kind === 'video' ? 'video' : 'image';
    const taskIds = Array.isArray(taskResult?.taskIds) ? taskResult.taskIds.filter(Boolean) : [];
    if(!node || !taskIds.length) throw new Error('生成失败');
    const writeGuard=canvasTaskWriteGuard(node);
    writeGuard.check();
    const inputBinding=taskResult?.inputBinding;
    inputBinding?.check();
    const preparePending=()=>{
    if(options.archiveExisting !== false) archiveSmartOutputsBeforePending(node);
    node.pendingTasks = taskIds.map(taskId => attachSmartTaskBinding({
        taskId,
        kind,
        providerId:taskResult.providerId,
        model:taskResult.model,
        startedAt:Number(options.startedAt || nowMs()),
        run:options.run ? {...options.run, kind, settings:cloneSmartSettings(options.run.settings)} : null
    },inputBinding));
    node.pending = taskIds.length;
    node.runStartedAt = Number(node.runStartedAt || options.startedAt || nowMs());
    node.runTimerHidden = false;
    node.running = false;
    render();
    };
    if(inputBinding)inputBinding.mutate(preparePending);else preparePending();
    const submittedTasks=node.pendingTasks.slice();
    const current=()=>writeGuard.valid() && submittedTasks.every(task=>smartPendingTasks(node).includes(task));
    scheduleSave();
    await saveCanvas();
    inputBinding?.check();
    if(!current())throw writeGuard.pause();
    if(taskResult?.submission){
        try {
            await taskResult.submission;
        } catch(error) {
            inputBinding?.check();
            if(error?.resultPending || !current())throw writeGuard.pause();
            const rejected = new Set(taskIds);
            node.pendingTasks = smartPendingTasks(node).filter(task => !rejected.has(task.taskId));
            node.pending = smartPendingTasks(node).length;
            if(!node.pending) delete node.pendingTasks;
            node.running = false;
            render();
            scheduleSave();
            await saveCanvas();
            throw error;
        }
    }
    if(!current())throw writeGuard.pause();
    inputBinding?.check();
    await resumeSmartPendingNode(node);
    inputBinding?.check();
    writeGuard.check();
    return {
        outputs:(node.images || []).map(img => img?.url ? img : null).filter(Boolean),
        recoverable:kind === 'image' && Boolean(smartRecoverableImageTask(node))
    };
}

function smartPendingTaskRun(node, task, kind='image'){
    if(task?.run) return task.run;
    if(!node?.runSettings) return null;
    return {
        nodeId:node.id || '',
        nodeType:node.type || 'smart-image',
        kind:task?.kind || kind,
        settings:cloneSmartSettings(node.runSettings),
        prompt:node.runModelPrompt || node.runPrompt || '',
        refs:(node.runInputRefs || node.runPromptRefs || []).map(ref => ({...ref}))
    };
}

function extractUpstreamTaskId(text){
    const match = String(text || '').match(/(?:task_id|taskId|task id)\s*[=:：]\s*([A-Za-z0-9_.:-]+)/i);
    return match ? match[1] : '';
}

function smartTaskPollRetryWindow(status=0, err=null){
    const code = Number(status || 0);
    if(code === 404) return 60 * 1000;
    if([408, 425, 429, 500, 502, 503, 504].includes(code)) return 30 * 60 * 1000;
    const text = err?.message || String(err || '');
    if(/Failed to fetch|NetworkError|Load failed|ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|fetch failed/i.test(text)){
        return 30 * 60 * 1000;
    }
    return 0;
}

async function pollSmartCanvasTask(taskId, kind='image',options={}){
    const validResult=window.CanvasTaskResults?.capture() || (()=>!window.CanvasSession?.enabled);
    if(!taskId) throw new Error('生成失败');
    const taskKind = ['video','audio','model'].includes(kind) ? kind : 'image';
    const pollKey = `${taskKind}:${taskId}`;
    const accept=task=>{options.inputBinding?.verify(task,taskId);return options.returnRecord ? task : task.result||{};};
    if(activeSmartTaskPolls.has(pollKey)) return accept(await activeSmartTaskPolls.get(pollKey));
    const promise = (async () => {
        let unavailableSince = 0;
        for(let i = 0; i < 900; i++){
            if(!validResult())throw window.CanvasTaskResults.pending();
            options.inputBinding?.check();
            await new Promise(resolve => setTimeout(resolve, 2000));
            if(!validResult())throw window.CanvasTaskResults.pending();
            options.inputBinding?.check();
            let response;
            try {
                const getTask=taskKind==='video' ? window.CanvasApi?.getCanvasVideoTaskRequest : taskKind==='audio' ? window.CanvasApi?.getCanvasAudioTaskRequest : taskKind==='model' ? window.CanvasApi?.getCanvasModelTaskRequest : window.CanvasApi?.getCanvasImageTaskRequest;
                response = await (getTask ? getTask(taskId) : fetch(`/api/canvas-${taskKind}-tasks/${encodeURIComponent(taskId)}`));
            } catch(error) {
                options.inputBinding?.check();
                const retryWindow = smartTaskPollRetryWindow(0, error);
                if(retryWindow){
                    unavailableSince ||= nowMs();
                    if(nowMs() - unavailableSince < retryWindow) continue;
                }
                error.resultPending=true; // A failed GET cannot declare the paid task failed.
                throw error;
            }
            if(!response.ok){
                const retryWindow = smartTaskPollRetryWindow(response.status);
                if(retryWindow){
                    unavailableSince ||= nowMs();
                    if(nowMs() - unavailableSince < retryWindow) continue;
                }
                const error=new Error(await response.text());error.resultPending=true;throw error;
            }
            unavailableSince = 0;
            let task;
            try {task=await response.json();}
            catch(error){error.resultPending=true;throw error;}
            if(!validResult() || (window.CanvasSession?.enabled && task.canvas_edit_generation!==window.MemberCanvasEdit.active?.lease.generation)){
                const error=new Error('结果将保留在生成结果列表，由当前编辑者加入。');error.resultPending=true;throw error;
            }
            options.inputBinding?.verify(task,taskId);
            if(task.status === 'succeeded') return task;
            if((task.status === 'failed' || task.status === 'needs_review' || task.status === 'cancelled')){
                const recoverTaskId = task.upstream_task_id || extractUpstreamTaskId(task.error || '');
                if(taskKind === 'image' && recoverTaskId){
                    const error=new ImageTaskRecoverSignal({taskId,recoverTaskId,providerId:task.provider_id,kind:'image',message:task.error||'生成失败'});
                    error.canvasTaskRecord=task;throw error;
                }
                const error = new Error(task.error || '生成失败');
                error.videoResult = taskKind === 'video' ? task.result : null;
                error.canvasTaskRecord=task;
                throw error;
            }
        }
        const error=new Error('生成超时');error.resultPending=true;throw error;
    })();
    activeSmartTaskPolls.set(pollKey, promise);
    try {
        return accept(await promise);
    } finally {
        if(activeSmartTaskPolls.get(pollKey)===promise)activeSmartTaskPolls.delete(pollKey);
    }
}

function finalizeSmartPendingTask(node, taskId, images, kind='image', result={}, record=null){
    if(window.CanvasSession?.enabled && (!window.MemberCanvasEdit?.canEdit || !nodes.includes(node))) return;
    if(!node || !taskId) return;
    const task = smartPendingTasks(node).find(item => item.taskId === taskId) || null;
    if(kind === 'video' && !task) return;
    const runMs=window.CanvasSession?.enabled && record ? window.CanvasTaskResults?.elapsed?.(record) ?? null : nowMs() - Number(task?.startedAt || node.runStartedAt || nowMs());
    node.pendingTasks = smartPendingTasks(node).filter(task => task.taskId !== taskId);
    node.pending = Math.max(0, Number(node.pending || 0) - 1);
    const ext = kind === 'video' ? 'mp4' : kind === 'audio' ? 'mp3' : kind === 'model' ? 'glb' : kind === 'text' ? 'txt' : 'png';
    const additions = (images || []).map((item, i) => {
        const url = typeof item === 'string' ? item : item?.url || '';
        const itemKind = (typeof item === 'object' && item.kind) || kind;
        return stripImageGenerationMeta(copyMediaSizeFields(item, {url, name:(typeof item === 'object' && item.name) || `output-${i + 1}.${ext}`, kind:itemKind, generatedResult:true, ...window.VolcengineVideoBilling?.metadata(result)}));
    }).filter(item => item.url);
    node.images = [...(node.images || []).map(img => stripImageGenerationMeta(img)), ...additions];
    const pendingRun = smartPendingTaskRun(node, task, kind);
    if(additions.length && pendingRun && !((['audio','model'].includes(kind)||kind==='image'&&node.storyboardAssetBinding) && window.CanvasSession?.enabled)){
        const runSettings = cloneSmartSettings(pendingRun.settings || {});
        if(task?.providerId) runSettings.provider_id = task.providerId;
        if(task?.model) runSettings.model = task.model;
        addSmartGenerationLog({
            run:{...pendingRun, canvasTaskId:taskId, kind:task?.kind || kind, settings:runSettings, ...window.VolcengineVideoBilling?.metadata(result)},
            outputs:additions,
            runMs
        });
    }
    if(additions.length) node.outputKind = kind;
    if(!node.pending && smartPendingTasks(node).length === 0){
        delete node.pendingTasks;
        node.runFinishedAt = nowMs();
        if(!node.runStartedAt) node.runStartedAt = node.runFinishedAt;
        node.runElapsedMs = runMs;
        node.runTimerHidden = false;
        node.running = false;
        if(!['smart-audio','smart-model'].includes(node.type)){
            node.title = node.images.length > 1 ? (kind === 'video' ? 'Videos' : kind === 'audio' ? 'Audios' : kind === 'text' ? 'Texts' : 'Group') : (kind === 'video' ? 'Video' : kind === 'audio' ? 'Audio' : kind === 'text' ? 'Text' : 'Image');
            node.scale = mediaNodeDefaultScale(node);
            delete node.w;
            delete node.h;
        }
    }
}

async function resumeSmartPendingNode(node){
    if(!node) return;
    const validResult=window.CanvasTaskResults?.capture() || (()=>!window.CanvasSession?.enabled);
    const originCanvas=canvas;
    const writeGuard=canvasTaskWriteGuard(node);
    if(!validResult() || !writeGuard.valid())throw writeGuard.pause();
    const existing = activeSmartNodeResumes.get(node);
    if(existing) return existing;
    const promise = (async () => {
        const tasks = smartPendingTasks(node).filter(task=>!task.paused);
        if(!tasks.length) return;
        if(window.CanvasSession?.enabled && !tasks.some(task=>typeof task._inputBinding?.check==='function'))throw writeGuard.pause();
        node.pending = tasks.length;
        node.running = false;
        refreshSmartNodes([node.id]);
        const failures = [];
        let deferred=false, deferredError=null;
        await Promise.all(tasks.map(async task => {
            if(task.failed && task.recoverTaskId) return;
            const inputBinding=task._inputBinding;
            if(window.CanvasSession?.enabled && !inputBinding){deferred=true;return;}
            const sourceId=task.run?.nodeId, source=sourceId ? nodes.find(n=>n.id===sourceId) : null;
            const targetStillCurrent=()=>!window.CanvasSession?.enabled || (!sourceId || Boolean(source && nodes.includes(source)));
            if(!targetStillCurrent()){deferred=true;return;}
            try {
                const kind = task.kind || 'image';
                inputBinding?.check();
                const record = await pollSmartCanvasTask(task.taskId,kind,{inputBinding,returnRecord:Boolean(inputBinding)});
                const result=inputBinding ? record.result||{} : record;
                if(!targetStillCurrent() || canvas!==originCanvas || !validResult() || !nodes.includes(node) || !smartPendingTasks(node).includes(task)){deferred=true;return;}
                const outputs = kind === 'video' ? resultMediaUrls(result) : resultMediaUrls(kind==='audio' ? result?.audios : kind==='model' ? result?.models : result?.images || result);
                if(inputBinding&&(['audio','model'].includes(kind)||kind==='image'&&node.storyboardAssetBinding)){
                    await commitSmartStudioTaskResult(node,record,kind,inputBinding,{valid:()=>targetStillCurrent()&&canvas===originCanvas&&validResult()&&smartPendingTasks(node).includes(task)});return;
                }
                const apply=()=>{finalizeSmartPendingTask(node,task.taskId,outputs,kind,result,inputBinding?record:null);refreshSmartNodes([node.id]);scheduleSave();};
                if(inputBinding)inputBinding.apply(record,apply,task.taskId);else apply();
            } catch(e) {
                if(inputBinding){try{inputBinding.check();if(e.canvasTaskRecord)inputBinding.verify(e.canvasTaskRecord,task.taskId);}catch(changed){e=changed;}}
                if(e?.inputChanged){deferredError=e;
                    if(targetStillCurrent() && canvas===originCanvas && validResult() && smartPendingTasks(node).includes(task))pauseSmartTaskInput(node,inputBinding,writeGuard,e);
                }
                if(e?.resultPending || !targetStillCurrent() || canvas!==originCanvas || !validResult() || !nodes.includes(node) || !smartPendingTasks(node).includes(task)){deferred=true;return;}
                const handleFailure=()=>{
                if(e && e.imageTaskRecover && e.recoverTaskId){
                    task.failed = true;
                    task.querying = false;
                    task.recoverTaskId = e.recoverTaskId;
                    task.providerId = e.providerId || task.providerId || providerIdForSmartTask(node, task);
                    task.error = e.message || '生成失败';
                    node.running = false;
                    node.pending = Math.max(1, smartPendingTasks(node).length);
                    toast('任务未丢失，可稍后手动查询结果');
                    refreshSmartNodes([node.id]);
                    scheduleSave();
                    return;
                }
                if(task.kind === 'video' && e.videoResult?.cost?.billing_source === 'volcengine_usage'){
                    const pendingRun = smartPendingTaskRun(node, task, 'video');
                    addSmartGenerationLog({run:{...pendingRun, canvasTaskId:task.taskId, kind:'video', ...window.VolcengineVideoBilling.metadata(e.videoResult)},
                        outputs:[], runMs:nowMs() - Number(task.startedAt || nowMs()), error:e.message});
                }
                node.pendingTasks = smartPendingTasks(node).filter(item => item.taskId !== task.taskId);
                node.pending = Math.max(0, Number(node.pending || 0) - 1);
                if(!node.pending && smartPendingTasks(node).length === 0){
                    delete node.pendingTasks;
                    node.running = false;
                    if(!(node.images || []).length){
                        delete node.w;
                        delete node.h;
                    }
                }
                failures.push(e);
                toast((e.message || '生成失败').slice(0, 160));
                refreshSmartNodes([node.id]);
                scheduleSave();
                };
                if(inputBinding){
                    inputBinding.mutate(handleFailure);
                } else handleFailure();
            }
        }));
        if(deferred || !writeGuard.valid())throw deferredError || writeGuard.pause();
        if(failures.length && !(node.images || []).length){
            throw failures[0];
        }
    })();
    activeSmartNodeResumes.set(node, promise);
    try {
        return await promise;
    } finally {
        if(activeSmartNodeResumes.get(node) === promise) activeSmartNodeResumes.delete(node);
    }
}

function smartTaskResultState(){
    const current=smartTaskResultState.current;
    if(current?.canvas===canvas)return current;
    return smartTaskResultState.current={canvas,busy:new Set()};
}

async function commitSmartStudioTaskResult(node,record,kind,binding,{recovered=false,valid=()=>true,prepareResult,applyResult}={}){
    const origin=canvas,state=smartTaskResultState(),guard=canvasTaskWriteGuard(node),taskId=record.id;
    const outputs=kind==='llm'?(typeof record.result?.text==='string'&&record.result.text?[record.result.text]:[]):resultMediaUrls(record.result?.[kind==='audio'?'audios':kind==='image'?'images':kind==='video'?'videos':'models']||[]);
    if(record.status!=='succeeded'||!['audio','model','llm','image','video'].includes(kind)||!outputs.length||kind==='llm'&&!applyResult)throw window.CanvasTaskResults.pending();
    if(state.busy.has(taskId))throw window.CanvasTaskResults.pending();
    state.busy.add(taskId);
    try{
        if(!valid()||!guard.valid())throw window.CanvasTaskResults.pending();
        const response=await window.CanvasApi.getCanvasTaskDeliveriesRequest(origin.id,origin.task_result_version||0);
        if(!response.ok)throw new Error('生成结果交付暂未确认，请稍后查询原任务');
        const data=await response.json();
        if(canvas!==origin||!valid()||!guard.valid())throw window.CanvasTaskResults.pending();
        window.CanvasTaskResults.validateDeliveries({id:origin.id,task_result_version:origin.task_result_version||0},data);
        const write=()=>{
            // First adopt every other observed delivery. The result being
            // accepted here gets its own undo step; the cursor acknowledges the
            // entire observed prefix, including those other deliveries.
            const document={id:origin.id,nodes,task_result_version:origin.task_result_version||0};
            window.CanvasTaskResults.mergeDeliveries(document,{...data,deliveries:data.deliveries.filter(entry=>entry.task_id!==taskId&&!window.PixmaxBatchExecution?.ownsTask(entry.task_id))});
            prepareResult?.();
            const completed=[taskId,...data.deliveries.map(entry=>entry.task_id)];
            pushSmartTaskResultUndo(completed);
            if(applyResult)applyResult();else finalizeSmartPendingTask(node,taskId,outputs,kind,record.result,record);
            origin.task_result_version=document.task_result_version;
        };
        if(recovered)binding.apply(write);else binding.apply(record,write,taskId);
        render();scheduleSave();
    }catch(error){error.resultPending=true;error.taskId=taskId;throw error;}
    finally{state.busy.delete(taskId);}
}

function smartTaskRecovery(){
    return {
        deliveryVersion:()=>canvas.task_result_version || 0,
        deliveryBusy:()=>activeSmartTaskPolls.size>0 || smartTaskResultState().busy.size>0 || window.PixmaxAudioCreation?.busy() || window.PixmaxModelCreation?.busy() || window.PixmaxBatchExecution?.busy() || window.PixmaxVideoParse?.busy() || window.PixmaxStoryboardAssets?.busy() || canvasSyncInFlight,
        mergeDeliveries:response=>{
            window.CanvasTaskResults.validateDeliveries({id:canvas.id,task_result_version:canvas.task_result_version||0},response);
            response=window.PixmaxVideoParse?.deliveryPrefix(response)||response;
            const document={id:canvas.id,nodes,task_result_version:canvas.task_result_version || 0};
            const affected=window.CanvasTaskResults.mergeDeliveries(document,response);
            canvas.task_result_version=document.task_result_version;
            forgetSmartCompletedTaskProgress(response.deliveries.map(entry=>entry.task_id));
            refreshSmartNodes(affected);
        },
        list:()=>[...nodes.flatMap(node=>smartPendingTasks(node).filter(task=>['image','video','audio','model'].includes(task.kind || 'image')||task.kind==='llm'&&task.batchFrameId)
            .map(task=>({id:task.taskId,canvasId:canvas.id,kind:task.kind || 'image',task,node}))),...(window.PixmaxVideoParse?.pending()||[])],
        changed:item=>refreshSmartNodes(item ? [item.node.id] : nodes.filter(node=>smartPendingTasks(node).length).map(node=>node.id)),
        apply:async(item,record,current)=>{
            if(item.kind==='llm'&&item.node.videoAnalysis)return window.PixmaxVideoParse.recover(item.node,record,{valid:current});
            if(item.kind==='llm'&&item.task.batchFrameId)return window.PixmaxBatchExecution?.recover(item,record,current);
            const source=nodes.find(node=>node.id===item.task.run?.nodeId),writeGuard=canvasTaskWriteGuard(source,item.node);
            const valid=()=>current() && Boolean(source) && writeGuard.valid() && smartPendingTasks(item.node).includes(item.task);
            if(!valid() || activeSmartTaskPolls.has(item.kind+':'+item.id) || item.kind==='audio' && window.PixmaxAudioCreation?.busy() || item.kind==='model' && window.PixmaxModelCreation?.busy())return;
            const binding=await window.CanvasTaskBindings.recover({task:record,taskId:item.id,canvasId:canvas.id,kind:'smart',
                sourceId:source.id,targetId:item.node.id,read:smartTaskInputDocument,valid});
            const result=record.result || {},outputs=item.kind==='video' ? resultMediaUrls(result) : resultMediaUrls(item.kind==='audio' ? result.audios : item.kind==='model' ? result.models : result.images || result);
            if(!outputs.length)return;
            if(item.kind==='image'&&item.node.storyboardAssetBinding)return commitSmartStudioTaskResult(item.node,record,'image',binding,{recovered:true,valid});
            if(['audio','model'].includes(item.kind))return commitSmartStudioTaskResult(item.node,record,item.kind,binding,{recovered:true,valid});
            binding.apply(()=>{finalizeSmartPendingTask(item.node,item.id,outputs,item.kind,result,record);refreshSmartNodes([item.node.id]);scheduleSave();});
        }
    };
}

function resumeSmartPendingTasks(){
    nodes.filter(node => smartPendingTasks(node).some(task=>!task.paused)).forEach(node => {
        resumeSmartPendingNode(node).catch(() => {}); // Each task reports its failure; deferred results remain available.
    });
}
