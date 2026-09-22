/* Classic canvas: Generation, cascade/loop scheduling, cancellation and task recovery.
 * Browser classic script (not an ES module); loaded before canvas.js.
 * Function declarations only: initialization is explicitly invoked by the entry.
 * Uses the entry's existing shared bindings; do not duplicate permission or document state.
 */

function loadLocalModelLists(){
    try {
        const managedRaw = localStorage.getItem(MANAGED_IMAGE_MODELS_KEY);
        const raw = JSON.parse(managedRaw || localStorage.getItem(CUSTOM_IMAGE_MODELS_KEY) || '[]');
        localImageModels = Array.isArray(raw) ? raw.filter(Boolean) : [];
        hasManagedImageModels = Boolean(managedRaw);
    } catch(e) {
        localImageModels = [];
        hasManagedImageModels = false;
    }
    try {
        const managedRaw = localStorage.getItem(MANAGED_CHAT_MODELS_KEY);
        const raw = JSON.parse(managedRaw || '[]');
        localChatModels = Array.isArray(raw) ? raw.filter(Boolean) : [];
        hasManagedChatModels = Boolean(managedRaw);
    } catch(e) {
        localChatModels = [];
        hasManagedChatModels = false;
    }
}

function uniqueModels(list){
    const seen = new Set();
    return list.map(item => String(item || '').trim()).filter(item => {
        if(!item || seen.has(item)) return false;
        seen.add(item);
        return true;
    });
}

function defaultApiProviders(){
    if(window.CanvasSession?.enabled) return [];
    return [{id:'comfly', name:'Comfly', base_url:'', enabled:true, image_models:imageModels, chat_models:chatModels, video_models:videoModels.length ? videoModels : DEFAULT_VIDEO_MODELS, has_key:false, key_preview:''}];
}

function normalizeProviderId(value){
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 40);
}

function imageApiProviders(){
    const providers = (apiProviders.length ? apiProviders : defaultApiProviders())
        .filter(p => p.id !== 'modelscope' && p.enabled !== false && (p.image_models || []).length);
    return providers;
}

function providerById(id){
    return (apiProviders.length ? apiProviders : defaultApiProviders()).find(p => p.id === id) || imageApiProviders()[0] || defaultApiProviders()[0];
}

function resolveProviderId(id){
    return providerById(id)?.id || 'comfly';
}

function chatApiProviders(){
    const providers = (apiProviders.length ? apiProviders : defaultApiProviders())
        .filter(p => p.enabled !== false && (p.chat_models || []).length);
    return providers.length ? providers : defaultApiProviders();
}

function resolveChatProviderId(id){
    const providers = chatApiProviders();
    return providers.find(p => p.id === id)?.id || providers[0]?.id || 'comfly';
}

function chatProviderOptions(selectedId){
    const selected = resolveChatProviderId(selectedId);
    return chatApiProviders().map(provider => `<option value="${escapeHtml(provider.id)}" ${provider.id === selected ? 'selected' : ''}>${escapeHtml(provider.name || provider.id)}</option>`).join('');
}

function providerChatModels(providerId){
    const provider = apiProviders.find(p => p.id === providerId);
    return uniqueModels(provider?.chat_models || []);
}

function resolveImageProviderId(id){
    const providers = imageApiProviders();
    return providers.find(p => p.id === id)?.id || providers[0]?.id || '';
}

function providerOptions(selectedId){
    const selected = resolveImageProviderId(selectedId);
    const providers = imageApiProviders();
    if(!providers.length) return `<option value="" disabled selected>${tr('canvas.noApiProviders') || '暂无 API 平台'}</option>`;
    return providers.map(provider => `<option value="${escapeHtml(provider.id)}" ${provider.id === selected ? 'selected' : ''}>${escapeHtml(provider.name || provider.id)}</option>`).join('');
}

function providerImageModels(providerId){
    // 不走 providerById（会 fallback 到第一个 provider，造成串台），直接查精确匹配
    const provider = apiProviders.find(p => p.id === providerId);
    return uniqueModels(provider?.image_models || []);
}

function allowedImageResolutions(node){
    return window.CanvasCore.modelResolutions(apiProviders.find(p=>p.id===node.apiProvider), 'image', resolveImageModel(node.model), ['1k','2k','4k','custom']);
}

function sanitizeImageNodeProviderModel(node){
    if(!node || node.type !== 'generator') return;
    node.apiProvider = resolveImageProviderId(node.apiProvider || '');
    const models = providerImageModels(node.apiProvider);
    if(!models.length) node.model = '';
    else if(!models.includes(resolveImageModel(node.model))) node.model = models[0] || '';
    const sizes=allowedImageResolutions(node);if(!sizes.includes(node.resolution))node.resolution=sizes[0] || '';
}

function videoApiProviders(){
    const providers = (apiProviders.length ? apiProviders : defaultApiProviders())
        .filter(p => p.id !== 'modelscope' && p.enabled !== false && (p.video_models || []).length);
    return providers.length ? providers : defaultApiProviders();
}

function resolveVideoProviderId(id){
    const providers = videoApiProviders();
    return providers.find(p => p.id === id)?.id || providers[0]?.id || 'comfly';
}

function videoProviderOptions(selectedId){
    const selected = resolveVideoProviderId(selectedId);
    return videoApiProviders().map(provider => `<option value="${escapeHtml(provider.id)}" ${provider.id === selected ? 'selected' : ''}>${escapeHtml(provider.name || provider.id)}</option>`).join('');
}

function providerVideoModels(providerId){
    // 不走 providerById（会 fallback 到第一个 provider，造成串台），直接查精确匹配
    const provider = apiProviders.find(p => p.id === providerId);
    return uniqueModels(provider?.video_models || []);
}

function sanitizeVideoNodeProviderModel(node){
    if(!node || node.type !== 'video') return;
    node.apiProvider = resolveVideoProviderId(node.apiProvider || 'comfly');
    const models = providerVideoModels(node.apiProvider);
    if(!models.length) node.model = '';
    else if(!models.includes(node.model)) node.model = models[0] || '';
}

function videoModelOptions(selectedModel, providerId){
    const models = providerVideoModels(providerId);
    if(!models.length){
        return `<option value="" disabled selected>${tr('canvas.noModelsHint') || '暂无模型，请到 API 设置添加'}</option>`;
    }
    const selected = selectedModel || models[0];
    return uniqueModels([selected, ...models]).filter(Boolean).map(model => `<option value="${escapeHtml(model)}" ${model === selected ? 'selected' : ''}>${escapeHtml(model)}</option>`).join('');
}

function allImageModels(providerId){
    const providerModels = providerImageModels(providerId || managedProviderId);
    return uniqueModels(providerModels);
}

function modelscopeImageModels(selected = ''){
    const provider = (apiProviders.length ? apiProviders : []).find(p => p.id === 'modelscope');
    return uniqueModels([
        selected,
        ...((provider?.image_models || []).length ? provider.image_models : []),
        'Tongyi-MAI/Z-Image-Turbo',
        'black-forest-labs/FLUX.2-klein-9B'
    ]);
}

function modelscopeImageModelOptions(selectedModel){
    const selectedValue = selectedModel || modelscopeImageModels()[0] || 'Tongyi-MAI/Z-Image-Turbo';
    return modelscopeImageModels(selectedValue).map(model => `<option value="${escapeHtml(model)}" ${model === selectedValue ? 'selected' : ''}>${escapeHtml(model)}</option>`).join('');
}

function currentMsModelId(modelKey, node){
    if(modelKey === 'custom') return node.msCustomModel || modelscopeImageModels()[0] || 'Tongyi-MAI/Z-Image-Turbo';
    return (MS_GEN_MODELS[modelKey] || MS_GEN_MODELS.zimage).modelId;
}

function modelscopeLorasForModel(modelId){
    const provider = (apiProviders.length ? apiProviders : []).find(p => p.id === 'modelscope');
    const list = Array.isArray(provider?.ms_loras) ? provider.ms_loras : [];
    return list.filter(lora =>
        lora && lora.enabled !== false &&
        String(lora.id || '').trim() &&
        String(lora.target_model || lora.model || '').trim() === String(modelId || '').trim()
    );
}

function modelscopeLoraOptions(loras, selectedId){
    return loras.map(lora => {
        const id = String(lora.id || '').trim();
        const label = String(lora.name || id).trim();
        return `<option value="${escapeHtml(id)}" ${id === selectedId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
}

function allChatModels(){
    const providerModels = chatApiProviders().flatMap(p => p.chat_models || []);
    return uniqueModels(hasManagedChatModels ? localChatModels : [...providerModels, ...chatModels, ...localChatModels]);
}

function resolveImageModel(value){
    if(value === 'gpt') return models.gpt;
    if(value === 'nano') return models.nano;
    return value || allImageModels(managedProviderId)[0] || models.gpt;
}

function normalizedImageQuality(value){
    const quality = String(value || 'auto').trim().toLowerCase();
    return ['low','medium','high'].includes(quality) ? quality : '';
}

function resolveChatModel(value, providerId=''){
    const providerModels = providerId ? providerChatModels(providerId) : [];
    if(window.CanvasSession?.enabled) return providerModels.includes(value) ? value : providerModels[0] || '';
    return value || providerModels[0] || allChatModels()[0] || chatModels[0] || 'gpt-4o-mini';
}

function apiErrorMessage(data, fallback='请求失败'){
    return window.CanvasCore?.apiErrorMessage(data, fallback) ?? fallback;
}

async function responseErrorMessage(response, fallback='请求失败'){
    return window.CanvasCore?.responseErrorMessage(response, fallback) ?? fallback;
}

function parseRatioValue(value){
    const raw = String(value || '').trim();
    if(!raw) return null;
    if(raw.includes(':')){
        const [w,h] = raw.split(':').map(Number);
        if(w > 0 && h > 0) return w / h;
    }
    const n = Number(raw);
    return n > 0 ? n : null;
}

function parseSizeValue(value){
    return window.CanvasCore?.parseSizeValue(value) || null;
}

function gcdInt(a, b){
    return window.CanvasCore?.gcdInt(a, b) || 1;
}

function ratioPartsFromDimensions(width, height){
    const w = Math.max(1, Math.round(Number(width) || 1));
    const h = Math.max(1, Math.round(Number(height) || 1));
    const target = w / h;
    let best = {width:1, height:1, score:Infinity};
    const maxPart = 21;
    for(let rw = 1; rw <= maxPart; rw++){
        for(let rh = 1; rh <= maxPart; rh++){
            const ratio = rw / rh;
            const relativeError = Math.abs(ratio - target) / target;
            const complexityPenalty = Math.max(rw, rh) * 0.0008;
            const score = relativeError + complexityPenalty;
            if(score < best.score) best = {width:rw, height:rh, score};
        }
    }
    const g = gcdInt(best.width, best.height);
    return {width:best.width / g, height:best.height / g};
}

function apiImageSize(ratioValue, resolutionValue, customRatioValue = '', customSizeValue = ''){
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

function normalizeApiNodeSizeChoice(node){
    if(!node) return;
}

async function generatorSizeForRun(gen, refs){
    if((gen.ratio || 'square') === 'source'){
        const ref = refs?.[0];
        if(ref?.url){
            try {
                const dims = await getImageDimensions(ref.url);
                const parts = ratioPartsFromDimensions(dims.width, dims.height);
                gen.customRatioWidth = String(parts.width);
                gen.customRatioHeight = String(parts.height);
                gen.customRatio = `${parts.width}:${parts.height}`;
            } catch(_) {}
        }
    }
    const ratio = (gen.ratio === 'source' && !gen.customRatio)
        ? 'square'
        : (gen.ratio ?? 'square');
    return apiImageSize(ratio, gen.resolution || '1k', gen.customRatio || '', gen.customSize || '');
}

function normalizeApiNodeLayout(node){
    if(!node || node.type !== 'generator') return;
    if(Number(node.w || 0) === 418) node.w = 380;
}

async function runMsGenNode(nodeId, opts={}){
    throw new Error("此功能已移除，历史内容保留。请新建通用 API 节点并明确选择供应商。");
}

function isAudioUrl(url){
    return /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(String(url || ''));
}

function audioFormatLabel(name='', url=''){
    const clean = `${name || ''} ${String(url || '').split(/[?#]/)[0]}`;
    const match = clean.match(/\.([a-z0-9]{2,5})(?:\s|$)/i);
    return match ? match[1].toUpperCase() : 'AUDIO';
}

function audioWaveformSvg(className='audio-card-waveform'){
    return `<svg class="${className}" viewBox="0 0 156 32" preserveAspectRatio="none" aria-hidden="true"><path d="M3 13v6M9 9v14M15 5v22M21 11v10M27 7v18M33 3v26M39 8v16M45 12v8M51 6v20M57 2v28M63 7v18M69 11v10M75 4v24M81 8v16M87 13v6M93 6v20M99 3v26M105 9v14M111 5v22M117 11v10M123 7v18M129 4v24M135 9v14M141 12v8M147 7v18M153 11v10"/></svg>`;
}

function isTextUrl(url){
    return /\.(txt|json|csv|srt|vtt|md)(\?|$)/i.test(String(url || ''));
}

function mediaKindForRef(ref){
    const kind = String(ref?.kind || ref?.mediaKind || '').toLowerCase();
    if(['video','audio','image','text','file'].includes(kind)) return kind;
    const url = String(ref?.url || ref || '');
    if(isVideoUrl(url)) return 'video';
    if(isAudioUrl(url)) return 'audio';
    if(isTextUrl(url)) return 'text';
    return 'image';
}

function imageRefsOnly(refs){
    return (refs || []).filter(ref => ref?.url && mediaKindForRef(ref) === 'image');
}

function videoRefsOnly(refs){
    return (refs || []).filter(ref => ref?.url && mediaKindForRef(ref) === 'video');
}

function isSeedance25VideoModel(model){
    return String(model || '').toLowerCase().replaceAll('_','-').replaceAll('.','-').includes('seedance-2-5');
}

function isSeedance20VideoModel(model){
    return /(?:^|-)seedance-2-0(?:-\d{6})?$/.test(String(model || '').toLowerCase().replaceAll('_','-').replaceAll('.','-'));
}

function isVolcengineSeedance25VideoNode(node){
    return resolveVideoProviderId(node?.apiProvider || 'comfly') === 'volcengine' && isSeedance25VideoModel(node?.model);
}

function videoNodeDurationRange(node){
    const seedance=isVolcengineSeedance25VideoNode(node);
    return window.VideoDurationPolicy.bounds(apiProviders.find(p=>p.id===resolveVideoProviderId(node.apiProvider || 'comfly')),node.model,{min:seedance?4:1,max:seedance?30:60,auto:seedance});
}

function normalizeVideoNodeSelection(node){
    if(!node) return;
    node.duration = window.VideoDurationPolicy.clamp(node.duration,videoNodeDurationRange(node));
    const resolutions = allowedVideoResolutions(node);
    if(!resolutions.includes(node.resolution || '')) node.resolution = resolutions[0] || '';
    if(isVolcengineSeedance25VideoNode(node)){

        if(!['', '480p', '720p', '1080p'].includes(node.resolution)) node.resolution = '';
        if(['9:21', 'keep_ratio'].includes(node.aspectRatio)) node.aspectRatio = 'adaptive';
        return;
    }
    node.taskMode = 'auto';
    if(Number(node.duration) === -1) node.duration = 5;
}

function allowedVideoResolutions(node){
    const defaults = ['', '480p', '720p', '1080p', ...(isSeedance20VideoModel(node.model) ? ['4k'] : []),
        ...(isVolcengineSeedance25VideoNode(node) ? [] : ['780P'])];
    return window.CanvasCore.modelResolutions(apiProviders.find(p=>p.id===node.apiProvider), 'video', node.model, defaults);
}

function videoNodeMediaRefs(refs){
    return (refs || []).filter(ref => ref?.url && ['image','video','audio'].includes(mediaKindForRef(ref)));
}

function loopCount(node){
    return Math.max(1, Math.min(100, Number(node?.count || 1) || 1));
}

function splitPromptIntoItems(text){
    const trimmed = String(text || '').trim();
    if(!trimmed) return [];
    const numbered = trimmed.split(/\s*(?:^|\s)\d+\s*[.、)）．]\s+/).map(s => s.trim()).filter(Boolean);
    if(numbered.length >= 2) return numbered;
    const lines = trimmed.split(/\r?\n+/).map(s => s.trim()).filter(Boolean);
    if(lines.length >= 2) return lines;
    return [trimmed];
}

function loopInputPromptItems(node, ctx=null, graph=null){
    if(!node?.showPrompt) return [];
    if(loopPromptVisiting.has(node.id)) return [];
    loopPromptVisiting.add(node.id);
    try {
        const items = [];
        (graph ? graph.incoming.get(node.id) || [] : connections.filter(c => c.to === node.id))
            .map(c => graph ? graph.nodeById.get(c.from) : nodes.find(n => n.id === c.from))
            .filter(Boolean)
            .forEach(n => {
                let text = '';
                if(n.type === 'prompt') {
                    if((n.text || '').trim()) items.push((n.text || '').trim());
                    return;
                }
                else if(n.type === 'promptGroup') {
                    const parts = (n.items || []).map(id => graph ? graph.nodeById.get(id) : nodes.find(x => x.id === id)).filter(Boolean).map(p => p.text || '').filter(Boolean);
                    parts.forEach(part => {
                        const text = String(part || '').trim();
                        if(text) items.push(text);
                    });
                    return;
                }
                else if(n.type === 'loop') text = renderLoopPrompt(n, ctx, graph);
                else if(n.type === 'llm') text = n.outputText || '';
                if(String(text || '').trim()) items.push(String(text || '').trim());
            });
        return items;
    } finally {
        loopPromptVisiting.delete(node.id);
    }
}

function loopInputPrompt(node, ctx=null, graph=null){
    const items = loopInputPromptItems(node, ctx, graph);
    if(!items.length) return '';
    const startBase = Math.max(1, Number(node?.loopStart) || 1);
    const currentIndex = Math.max(1, Number(ctx?.index || startBase) || startBase);
    return items[(currentIndex - 1) % items.length];
}

function imageRefsFromNode(node){
    if(!node) return [];
    if(node.type === 'image' && node.url && mediaKindForNode(node) === 'image') return [{url:node.url, name:node.name || 'image', role:node.role || '', kind:'image', asset_uris:canvasAssetUrisForNode(node), asset_item_id:node.asset_item_id || '', asset_library_id:node.asset_library_id || '', face_auth_status:node.face_auth_status || ''}];
    if(node.type === 'group'){
        return (node.items || [])
            .map(id => nodes.find(x => x.id === id))
            .filter(x => x?.type === 'image' && x?.url && mediaKindForNode(x) === 'image')
            .map(img => ({url:img.url, name:img.name || 'image', role:img.role || '', kind:'image', asset_uris:canvasAssetUrisForNode(img), asset_item_id:img.asset_item_id || '', asset_library_id:img.asset_library_id || '', face_auth_status:img.face_auth_status || ''}));
    }
    if(node.type === 'output'){
        return (node.images || [])
            .map(outputUrlValue)
            .filter(url => url && !isVideoUrl(url) && !isAudioUrl(url))
            .map((url, i) => ({url, name:outputImageName(url) || `output-${i + 1}.png`, kind:'image'}));
    }
    if(CANVAS_IMAGE_OUTPUT_TYPES.includes(node.type)) return generatedImageRefs(node).filter(ref => ref.kind === 'image');
    return [];
}

function loopInputImageRefs(node, ctx=null){
    if(!node?.imageInput) return [];
    const allRefs = connections
        .filter(c => c.to === node.id)
        .flatMap(c => imageRefsFromNode(nodes.find(n => n.id === c.from)))
        .filter(ref => ref?.url);
    if(!allRefs.length) return [];
    const startBase = Math.max(1, Number(node.loopStart) || 1);
    const batchSize = Math.max(1, Math.min(100, Number(node.imageBatchSize) || 1));
    const currentIndex = Math.max(1, Number(ctx?.index || startBase) || startBase);
    const start = Math.max(0, currentIndex - 1);
    return allRefs.slice(start, start + batchSize);
}

function videoRefsFromNode(node){
    if(!node) return [];
    if(node.type === 'image' || node.type === 'group') return mediaRefsFromNode(node).filter(ref => ref.kind === 'video');
    if(node.type === 'output'){
        return (node.images || [])
            .map((item, i) => ({item, i}))
            .filter(({item}) => mediaKindForOutputItem(item) === 'video')
            .map(({item, i}) => {
                const url = outputUrlValue(item);
                if(!url) return null;
                return {url, name:outputImageName(url) || `output-${i + 1}.mp4`, kind:'video', nodeId:node.id, outputIndex:i};
            })
            .filter(Boolean);
    }
    if(CANVAS_MEDIA_OUTPUT_TYPES.includes(node.type)) return generatedImageRefs(node).filter(ref => ref.kind === 'video');
    return [];
}

function loopInputVideoRefs(node, ctx=null){
    if(!node?.videoInput) return [];
    const allRefs = connections
        .filter(c => c.to === node.id)
        .flatMap(c => videoRefsFromNode(nodes.find(n => n.id === c.from)))
        .filter(ref => ref?.url);
    if(!allRefs.length) return [];
    const startBase = Math.max(1, Number(node.loopStart) || 1);
    const batchSize = Math.max(1, Math.min(100, Number(node.videoBatchSize) || 1));
    const currentIndex = Math.max(1, Number(ctx?.index || startBase) || startBase);
    const start = Math.max(0, currentIndex - 1);
    return allRefs.slice(start, start + batchSize);
}

function loopTokenLabel(token){
    if(token === '《计数》') return tr('canvas.counterToken');
    if(token === '《总数》') return tr('canvas.totalToken');
    if(token === '《进度》') return tr('canvas.progressToken');
    return token;
}

function llmInputText(node, ctx=null){
    return connections.filter(c => c.to === node.id).map(c => nodes.find(n => n.id === c.from)).filter(Boolean).map(n => {
        if(n.type === 'prompt') return n.text || '';
        if(n.type === 'loop') return renderLoopPrompt(n, ctx);
        if(n.type === 'promptGroup') return (n.items || []).map(id => nodes.find(x => x.id === id)).filter(Boolean).map(p => p.text || '').filter(Boolean).join('\n\n');
        if(n.type === 'llm') return n.outputText || '';
        return '';
    }).filter(Boolean).join('\n\n');
}

function llmInputImages(node){
    const urls = [];
    connections.filter(c => c.to === node.id).map(c => nodes.find(n => n.id === c.from)).filter(Boolean).forEach(n => {
        if(n.type === 'image' && n.url && mediaKindForNode(n) === 'image') urls.push(n.url);
        if(n.type === 'output' && (n.images||[]).length){
            const last = [...n.images].reverse().map(outputUrlValue).find(url => url && !isVideoUrl(url) && !isAudioUrl(url));
            if(last) urls.push(last);
        }
        if(n.type === 'group'){
            (n.items || []).map(id => nodes.find(x => x.id === id)).filter(x => x?.type === 'image' && x?.url && mediaKindForNode(x) === 'image').forEach(img => urls.push(img.url));
        }
    });
    return urls;
}

function llmInputVideos(node){
    const urls = [];
    connections.filter(c => c.to === node.id).map(c => nodes.find(n => n.id === c.from)).filter(Boolean).forEach(n => {
        if(n.type === 'image' && n.url && mediaKindForNode(n) === 'video') urls.push(n.url);
        if(n.type === 'output' && (n.images||[]).length){
            const last = [...n.images].reverse().map(outputUrlValue).find(url => url && isVideoUrl(url));
            if(last) urls.push(last);
        }
        if(n.type === 'group'){
            (n.items || []).map(id => nodes.find(x => x.id === id)).filter(x => x?.type === 'image' && x?.url && mediaKindForNode(x) === 'video').forEach(video => urls.push(video.url));
        }
    });
    return urls;
}

function videoInputMediaGroups(node, sources){
    // Keep each type in request order; grouping only changes the visual layout.
    const groups = ['image','audio','video'].map(kind => ({kind, title:{image:'图片', audio:'音频', video:'视频'}[kind], items:[]}));
    for(const source of sources || []){
        for(const ref of source.refs || []){
            if(!ref?.url) continue;
            const kind = mediaKindForRef(ref);
            const group = groups.find(group => group.kind === kind);
            if(!group) continue;
            group.items.push({ref, sourceId:source.id, label:ref.name || source.label || group.title, kind});
        }
    }
    const manualUrl = manualVideoUrlForNode(node);
    if(manualUrl){
        groups.find(group => group.kind === 'video').items = [{ref:{url:manualUrl, kind:'video'}, sourceId:'', label:'手动视频网址', kind:'video'}];
    }
    return groups.filter(group => group.items.length).map(group => ({...group, items:group.items.map((entry, i) => ({...entry, index:i + 1, referenceLabel:`${group.title}${i + 1}`}))}));
}

function comfyWorkflowOptions(selected){
    const opts = comfyWorkflows.map(w => `<option value="${escapeHtml(w.name)}" ${w.name === selected ? 'selected' : ''}>${escapeHtml(w.title || w.name.replace('.json',''))}</option>`).join('');
    return opts || `<option value="">${tr('canvas.comfyNoWorkflow')}</option>`;
}

function hasComfyWorkflow(name){
    return !!name && comfyWorkflows.some(w => w.name === name);
}

function validComfyWorkflowName(name){
    return hasComfyWorkflow(name) ? name : (comfyWorkflows[0]?.name || '');
}

function pruneMissingComfyWorkflows(){
    // Retired workflow identifiers are preserved for historical canvases.
}

function currentComfyWorkflow(node){
    const selected = validComfyWorkflowName(node.comfyWorkflow || comfyWorkflows[0]?.name || '');
    return comfyWorkflowCache[selected] || null;
}

async function ensureComfyWorkflow(name){
    return null;
}

function comfyFieldKind(f){
    if(['image','video','audio'].includes(f?.type)) return f.type;
    const key = `${f.input || ''} ${f.name || ''}`.toLowerCase();
    if(f.type === 'textarea' || /prompt|text|提示词|正向|负向/.test(key)) return 'prompt';
    return 'setting';
}

function comfyFields(node, kind='all'){
    const data = currentComfyWorkflow(node);
    const fields = data?.config?.fields || [];
    return kind === 'all' ? fields : fields.filter(f => comfyFieldKind(f) === kind);
}

function comfyParamValue(node, field){
    node.comfyParams = node.comfyParams || {};
    if(node.comfyParams[field.id] !== undefined) return node.comfyParams[field.id];
    return field.default ?? (field.type === 'boolean' ? false : (field.type === 'number' || field.type === 'slider' ? 0 : ''));
}

function comfyRandomEnabled(field){
    return field?.type === 'number' && field.random_enabled === true;
}

function comfyRandomActive(node, fieldId){
    node.comfyRandomActive = node.comfyRandomActive || {};
    return node.comfyRandomActive[fieldId] !== false;
}

function comfyRandomValue(field){
    const isFloat = Number(field.step) > 0 && Number(field.step) < 1;
    let min = Number.isFinite(Number(field.min)) ? Number(field.min) : null;
    let max = Number.isFinite(Number(field.max)) ? Number(field.max) : null;
    const name = `${field.input || ''} ${field.name || ''}`.toLowerCase();
    const looksSeed = name.includes('seed') || name.includes('noise') || name.includes('随机') || name.includes('噪');
    if(min === null) min = looksSeed ? 1 : 0;
    if(max === null || max <= min) max = looksSeed ? 1000000000000000 : 999999;
    let value = min + Math.random() * (max - min);
    if(isFloat){
        const precision = Math.min(8, Math.max(1, String(field.step).split('.')[1]?.length || 2));
        return Number(value.toFixed(precision));
    }
    return Math.floor(value);
}

function hasExplicitOutputConnection(nodeId){
    return connections.some(c => {
        if(c.from !== nodeId) return false;
        const to = nodes.find(n => n.id === c.to);
        return to?.type === 'output';
    });
}

function hasDownstreamGenerator(nodeId){
    return connections.some(c => {
        if(c.from !== nodeId) return false;
        const to = nodes.find(n => n.id === c.to);
        if(!to) return false;
        if(CANVAS_GENERATOR_TYPES.includes(to.type)) return true;
        if(to.type !== 'output') return false;
        return connections.some(cc => {
            if(cc.from !== to.id) return false;
            const next = nodes.find(n => n.id === cc.to);
            return next && CANVAS_GENERATOR_TYPES.includes(next.type);
        });
    });
}

function shouldCreateOutputForNode(node){
    if(!node) return false;
    if(hasExplicitOutputConnection(node.id)) return true;
    return !hasDownstreamGenerator(node.id);
}

function outputForNode(node, dx=460){
    if(!node || !shouldCreateOutputForNode(node)) return null;
    let out = connections
        .filter(c => c.from === node.id)
        .map(c => nodes.find(n => n.id === c.to))
        .find(n => n?.type === 'output');
    if(!out){
        out = {id:uid('out'), type:'output', x:node.x + dx, y:node.y, images:[]};
        nodes.push(out);
        connections.push({id:uid('c'), from:node.id, to:out.id});
    }
    return out;
}

function outputNodesForSource(nodeId){
    return connections
        .filter(c => c.from === nodeId)
        .map(c => nodes.find(n => n.id === c.to))
        .filter(n => n?.type === 'output');
}

function latestGeneratedOutputItem(node){
    return [...(node?.generatedOutputs || [])].reverse().find(item => outputUrlValue(item));
}

function outputHasUrl(out, url){
    return Boolean(url && (out?.images || []).some(item => outputUrlValue(item) === url));
}

function appendOutputImagesWithoutDuplicates(out, images, compareRef=null, metas=[], layout=null){
    const unique = (images || []).filter(item => {
        const url = outputUrlValue(item);
        return url && !outputHasUrl(out, url);
    });
    appendOutputImages(out, unique, compareRef, metas, layout);
    return unique.length;
}

function syncLatestGeneratedOutputToConnection(fromId, toId){
    const source = nodes.find(n => n.id === fromId);
    const out = nodes.find(n => n.id === toId);
    if(!source || !out || out.type !== 'output' || !CANVAS_MEDIA_OUTPUT_TYPES.includes(source.type)) return false;
    const latest = latestGeneratedOutputItem(source);
    if(!latest) return false;
    return appendOutputImagesWithoutDuplicates(out, [latest]) > 0;
}

function syncConnectedOutputsFromGenerated(node, outputs){
    if(!node || !CANVAS_MEDIA_OUTPUT_TYPES.includes(node.type)) return;
    const list = (outputs || []).filter(item => outputUrlValue(item));
    if(!list.length) return;
    outputNodesForSource(node.id).forEach(out => appendOutputImagesWithoutDuplicates(out, list));
}

function generatedImageRefs(node){
    const keepGeneratedMedia = ['ltxDirector','video'].includes(node?.type);
    return (node?.generatedOutputs || [])
        .map((item, i) => {
            const url = outputUrlValue(item);
            if(!url) return null;
            const kind = mediaKindForOutputItem(item);
            return {url, name:outputImageName(url) || `${node.type || 'generated'}-${i + 1}`, kind, index:i};
        })
        .filter(Boolean)
        .filter(ref => keepGeneratedMedia || ref.kind === 'image')
        .map(ref => {
            const {index, ...clean} = ref;
            return clean;
        });
}

function mediaRefsFromNode(node){
    if(!node) return [];
    if(node.type === 'image' && node.url){
        const kind = mediaKindForNode(node);
        return [{url:node.url, name:node.name || kind, role:node.role || '', kind,
            asset_uris:canvasAssetUrisForNode(node), asset_item_id:node.asset_item_id || '',
            asset_library_id:node.asset_library_id || '', face_auth_status:node.face_auth_status || ''}];
    }
    if(node.type === 'group'){
        return (node.items || [])
            .map(id => nodes.find(x => x.id === id))
            .filter(x => x?.type === 'image' && x?.url)
            .flatMap(mediaRefsFromNode);
    }
    if(node.type === 'output'){
        return (node.images || []).map((item, i) => {
            const url = outputUrlValue(item);
            if(!url) return null;
            const kind = mediaKindForOutputItem(item);
            return {url, name:outputImageName(url) || `output-${i + 1}`, kind, nodeId:node.id, outputIndex:i};
        }).filter(Boolean);
    }
    if(CANVAS_MEDIA_OUTPUT_TYPES.includes(node.type)) return generatedImageRefs(node);
    return [];
}

function generatorSources(gen, loopCtx=null, graph=null){
    const findNode = id => graph ? graph.nodeById.get(id) : nodes.find(n => n.id === id);
    return (graph ? graph.incoming.get(gen.id) || [] : connections.filter(c => c.to === gen.id)).map(c => findNode(c.from)).filter(Boolean).map(n => {
        if(n.type === 'output' && (n.images||[]).length){
            // 从 output 节点取最新一张图当作 reference 给下游
            const reversed = [...n.images].map((item, index) => ({item, index})).reverse();
            const found = reversed.find(entry => outputUrlValue(entry.item));
            if(found){
                const last = outputUrlValue(found.item);
                const kind = mediaKindForOutputItem(found.item);
                return {id:n.id, type:'outputImage', label:'上游输出', preview:last, refs:[{url:last, name:'output.png', kind, nodeId:n.id, outputIndex:found.index}], prompt:''};
            }
        }
        if(CANVAS_MEDIA_OUTPUT_TYPES.includes(n.type)){
            const refs = generatedImageRefs(n);
            if(refs.length){
                return refs.map((ref, i) => ({
                    id:`${n.id}:generated:${i}:${ref.url}`,
                    type:'generatedImage',
                    label:`上游生成 ${i + 1}`,
                    preview:ref.url,
                    refs:[ref],
                    prompt:''
                }));
            }
        }
        if(n.type === 'image' && n.url) {
            const kind = mediaKindForNode(n);
            const refs = mediaRefsFromNode(n);
            return {id:n.id, type:kind, label:n.name || kind, preview:n.url, refs, prompt:''};
        }
        if(n.type === 'group') {
            const items = (n.items || []).map(findNode).filter(Boolean);
            const sources = items.filter(x => x.type === 'image' && x.url).map(img => ({
                id:`${n.id}:${img.id}`,
                type:`group-${mediaKindForNode(img)}`,
                groupId:n.id,
                imageId:img.id,
                label:img.name || mediaKindForNode(img),
                preview:img.url,
                refs:mediaRefsFromNode(img),
                prompt:''
            }));
            const prompts = items.filter(x => x.type === 'prompt').map(p => p.text || '').filter(Boolean);
            if(prompts.length){
                const combined = prompts.join('\n\n');
                sources.push({
                    id:`${n.id}:prompts`,
                    type:'groupPrompt',
                    groupId:n.id,
                    label:combined.slice(0, 32),
                    refs:[],
                    prompt:combined
                });
            }
            return sources;
        }
        if(n.type === 'prompt') return {id:n.id, type:'prompt', label:(n.text || '提示词').slice(0, 32), refs:[], prompt:n.text || ''};
        if(n.type === 'loop') {
            const ctx = loopCtx;
            const prompt = renderLoopPrompt(n, ctx, graph);
            const imageRefs = loopInputImageRefs(n, ctx);
            const out = [];
            if(imageRefs.length){
                const currentIndex = Math.max(1, Number(ctx?.index || n.loopStart || 1) || 1);
                imageRefs.forEach((ref, i) => {
                    out.push({
                        id:`${n.id}:image:${currentIndex + i}:${ref.url}`,
                        type:'loopImage',
                        label:trf('canvas.loopImageLabel', {n:currentIndex + i}),
                        preview:ref.url,
                        refs:[ref],
                        prompt:i === 0 && !out.length ? prompt : ''
                    });
                });
            }
            if(out.length) return out;
            return {id:n.id, type:'loop', label:`${tr('canvas.loopNode')} ${loopCount(n)}x`, refs:[], prompt};
        }
        if(n.type === 'promptGroup') {
            const prompts = (n.items || []).map(findNode).filter(Boolean).map(p => p.text || '').filter(Boolean);
            return {id:n.id, type:'promptGroup', label:`提示词 ${prompts.length} 个`, refs:[], prompt:prompts.join('\n\n')};
        }
        if(n.type === 'llm' && (n.mode || 'node') === 'node' && n.outputText) return {id:n.id, type:'llm', label:(n.outputText || 'LLM').slice(0, 32), refs:[], prompt:n.outputText || ''};
        return null;
    }).flat().filter(Boolean);
}

function orderedSources(gen, sources){
    gen.inputs = (gen.inputs || []).filter(id => sources.some(s => s.id === id));
    sources.forEach(s => { if(!gen.inputs.includes(s.id)) gen.inputs.push(s.id); });
    return gen.inputs.map(id => sources.find(s => s.id === id)).filter(Boolean);
}

function classicTaskInputBinding(source,target,writeGuard){
    if(!window.CanvasSession?.enabled)return null;
    if(!window.CanvasTaskBindings?.operation)throw new Error('生成校验组件尚未加载，请保存并刷新页面后重试。');
    return window.CanvasTaskBindings.operation({canvasId:canvas.id,kind:'classic',sourceId:source.id,targetId:target.id,
        read:()=>JSON.parse(JSON.stringify(canvasSavePayload())),valid:writeGuard.valid,
        revision:()=>window.MemberCanvasEdit?.active?.lease?.revision,
        flush:async()=>{scheduleSave();return flushClassicCanvasBeforeFrontendReload();}});
}

function attachClassicTaskBinding(pending,inputBinding){
    if(inputBinding)Object.defineProperty(pending,'_inputBinding',{value:inputBinding,configurable:true});
    return pending;
}

function pauseClassicTaskInput(node,out,writeGuard,error,runToken,inputBinding){
    if(!error?.inputChanged || !writeGuard.valid() || node._taskRunToken!==runToken)return;
    // Only settle placeholders owned by this operation. Keep task IDs for manual
    // recovery; this is not a backend failure and must not create a failure log.
    for(const pending of out?._pending || []){
        if(!inputBinding || pending._inputBinding!==inputBinding)continue;
        pending.paused=true;
        pending.querying=false;
    }
    node.running=false;
    node.runStatus='paused';
    node.runError=error.message;
    scheduleSave();
    refreshRunNodes(node,out);
    setStatus(error.message);
}

function classicPendingInputBinding(found,options){
    const binding=options?.inputBinding || found?.pending?._inputBinding;
    if(window.CanvasSession?.enabled && (!binding || typeof binding.check!=='function' || typeof binding.apply!=='function'))return null;
    return binding;
}

async function runGenerator(genId, opts={}){
    const gen = nodes.find(n => n.id === genId);
    if(!gen || (gen.running && !opts.cascade)) return;
    if(window.CanvasSession?.enabled && !window.MemberCanvasEdit?.canEdit){showErrorModal('当前编辑已暂停，请先保留草稿并恢复编辑后再生成。');return;}
    if(!allowedImageResolutions(gen).includes(gen.resolution || '1k')){
        const error = new Error('图片规格已变化，请重新选择模型和分辨率后生成。');
        if(opts.cascade) throw error;
        showErrorModal(error.message); return;
    }
    const cascadeTargetId = cascadeTargetIdFromOptions(opts);
    const sources = orderedSources(gen, generatorSources(gen, opts.loopContext));
    const prompt = sources.map(s => s.prompt).filter(Boolean).join('\n\n');
    const refs = imageRefsOnly(sources.flatMap(s => s.refs || []));
    if(!prompt && !refs.length){ alert(tr('canvas.needPromptOrImage')); return; }
    const count = Math.max(1, Math.min(8, Number(gen.count || 1)));
    let out = outputForNode(gen, 460);
    const writeGuard=canvasTaskWriteGuard(gen,out);
    const runToken={};
    Object.defineProperty(gen,'_taskRunToken',{value:runToken,writable:true,configurable:true});
    let inputBinding;
    try {inputBinding=classicTaskInputBinding(gen,out||gen,writeGuard);}
    catch(error){showErrorModal(error.message);if(opts.cascade)throw error;return;}
    const run = runSnapshot(gen, prompt || 'Edit the reference images.', refs);
    const payload = {
        prompt: prompt || 'Edit the reference images.',
        provider_id:resolveImageProviderId(gen.apiProvider || 'comfly'),
        model:resolveImageModel(gen.model),
        size:'',
        reference_images:refs
    };
    if(!writeGuard.valid()){if(opts.cascade)throw writeGuard.pause();return;}
    run.providerId = payload.provider_id;
    run.billingModel = payload.model;
    const quality = normalizedImageQuality(gen.quality);
    if(quality) payload.quality = quality;
    let pendingIds = [];
    const startedAt = nowMs();
    if(!opts.cascade){
        gen.running = true;
        refreshRunNodes(gen, out);
        // API 支持并发：2s 后即可再次点击，任务仍由 pending 卡片继续追踪
        setTimeout(() => { if(!writeGuard.valid() || gen._taskRunToken!==runToken)return; gen.running = false; refreshRunNodes(gen, out); }, 2000);
    }
    try {
        payload.size=await generatorSizeForRun(gen,refs);
        writeGuard.check();inputBinding?.check();
        if(inputBinding){payload.canvas_target=await inputBinding.prepare();inputBinding.beginSubmission();}
        const taskInfos = await Promise.all(Array.from({length:count}, async () => {
            const task=await createCanvasImageTask(payload,{cascadeTargetId});
            inputBinding?.remember(task);return task;
        }));
        writeGuard.check();inputBinding?.check();
        if(!out){
            let outputs = [];
            for(const task of taskInfos){
                const record = await waitCanvasImageTaskResult(task.task_id, {cascadeTargetId,inputBinding,returnRecord:Boolean(inputBinding)});
                const result=inputBinding ? record.result||{} : record;
                writeGuard.check();inputBinding?.check();
                const accept=()=>{
                    outputs.push(...(result.images || []));
                    run.request = requestMetaFromResult(result);
                    addGenerationLog({run:{...run, canvasTaskId:task.task_id}, outputs:result.images || [], runMs:nowMs() - startedAt});
                };
                if(inputBinding)inputBinding.apply(record,accept,task.task_id);else accept();
            }
            if(!outputs.length) throw new Error(tr('canvas.generationFailed'));
            if(inputBinding)inputBinding.mutate(()=>mergeGeneratedOutputs(gen,outputs,Boolean(opts.cascade)));
            else mergeGeneratedOutputs(gen, outputs, Boolean(opts.cascade));
            gen.runStatus = 'done';
            gen.runError = '';
            gen.running = false;
            refreshRunNodes(gen, out);
            scheduleSave();
            return;
        }
        pendingIds = taskInfos.map(() => uid('p'));
        if(out) out._pending = [
            ...(out._pending || []),
            ...taskInfos.map((task, index) => attachClassicTaskBinding(makePendingForRun(pendingIds[index], run, gen, {refs, requestSize:payload.size, cascadeTargetId}, {
                canvasTaskId:task.task_id,
                canvasTaskType:'online-image',
                providerId:payload.provider_id,
                model:payload.model,
                appendGenerated:Boolean(opts.cascade)
            }),inputBinding))
        ];
        refreshRunNodes(gen, out);
        scheduleSave();
        await saveCanvas();
        writeGuard.check();inputBinding?.check();
        const statuses = await Promise.all(taskInfos.map(task => pollCanvasImageTask(task.task_id, {cascadeTargetId,inputBinding})));
        writeGuard.check();inputBinding?.check();
        if(statuses.includes('paused'))throw writeGuard.pause();
        if(statuses.includes('aborted')) throw cascadeAbortError(cascadeStopMessage());
        if(statuses.includes('failed')) throw new Error(gen.runError || tr('canvas.generationFailed'));
    } catch(err) {
        if(inputBinding){try {inputBinding.check();}catch(changed){err=changed;}}
        pauseClassicTaskInput(gen,out,writeGuard,err,runToken,inputBinding);
        if(err?.resultPending || !writeGuard.valid()){
            const paused=writeGuard.pause();
            if(nodes.includes(gen) && gen._taskRunToken===runToken){
                gen.running=false;refreshRunNodes(gen,out);
                showErrorModal(err.message || paused.message);
            }
            if(opts.cascade)throw paused;return;
        }
        const remainingPending = pendingIds.map(id => pendingById(out, id)).filter(Boolean);
        if(isCascadeAbortError(err)){
            remainingPending.forEach(resumePendingAfterCascadeStop);
            gen.running = false;
            refreshRunNodes(gen, out);
            scheduleSave();
            throw err;
        }
        const removableIds = remainingPending.filter(p => !(p.failed && p.recoverTaskId)).map(p => p.id);
        if(removableIds.length){
            const metas = collectRunMetas(out, removableIds);
            addGenerationLog({run, outputs:[], runMs:Math.max(...metas.map(m => m.runMs || 0), 0), error:err.message || String(err)});
            if(out) out._pending = (out._pending||[]).filter(p => !removableIds.includes(p.id));
        }
        gen.runStatus = 'failed'; gen.runError = err.message || String(err);
        gen.running = false;
        refreshRunNodes(gen, out);
        scheduleSave();
        if(opts.cascade) throw err;
        if(remainingPending.some(p => p.failed && p.recoverTaskId) && !removableIds.length) return;
        showErrorModal(err.message || tr('canvas.generationFailed'), tr('canvas.apiFailed'));
    }
}

async function runGeneratorLegacy(genId, opts={}){
    const gen = nodes.find(n => n.id === genId);
    if(!gen || (gen.running && !opts.cascade)) return;
    const sources = orderedSources(gen, generatorSources(gen, opts.loopContext));
    const prompt = sources.map(s => s.prompt).filter(Boolean).join('\n\n');
    const refs = imageRefsOnly(sources.flatMap(s => s.refs || []));
    if(!prompt && !refs.length){ alert(tr('canvas.needPromptOrImage')); return; }
    const count = Math.max(1, Math.min(8, Number(gen.count || 1)));
    let out = outputForNode(gen, 460);
    const pendingIds = Array.from({length:count}, () => uid('p'));
    const run = runSnapshot(gen, prompt || 'Edit the reference images.', refs);
    const requestSize = await generatorSizeForRun(gen, refs);
    if(out) out._pending = [...(out._pending||[]), ...pendingIds.map(id => makePendingForRun(id, run, gen, {refs, requestSize}))];
    if(!opts.cascade){
        gen.running = true;
        refreshRunNodes(gen, out);
        setTimeout(() => { gen.running = false; refreshRunNodes(gen, out); }, 2000);
    }
    else refreshRunNodes(gen, out);
    try {
        const payload = {
            prompt: prompt || 'Edit the reference images.',
            provider_id:resolveImageProviderId(gen.apiProvider || 'comfly'),
            model:resolveImageModel(gen.model),
            size:requestSize,
            reference_images:refs
        };
        run.providerId = payload.provider_id;
        run.billingModel = payload.model;
        const quality = normalizedImageQuality(gen.quality);
        if(quality) payload.quality = quality;
        const results = await Promise.all(Array.from({length:count}, () => window.CanvasApi.onlineImage(payload, {errorFallback:tr('canvas.generationFailed')})));
        const images = results.flatMap(result => result.images || []);
        const metas = collectRunMetas(out, pendingIds);
        run.request = results[0] ? requestMetaFromResult(results[0]) : {};
        if(out) out._pending = (out._pending||[]).filter(p => !pendingIds.includes(p.id));
        appendOutputImages(out, images, refs[0], metas);
        mergeGeneratedOutputs(gen, images, Boolean(opts.cascade));
        addGenerationLog({run, outputs:images, runMs:Math.max(...metas.map(m => m.runMs || 0), 0)});
        gen.runStatus = 'done'; gen.runError = '';
        refreshRunNodes(gen, out);
        scheduleSave();
    } catch(err) {
        const metas = collectRunMetas(out, pendingIds);
        addGenerationLog({run, outputs:[], runMs:Math.max(...metas.map(m => m.runMs || 0), 0), error:err.message || String(err)});
        if(out) out._pending = (out._pending||[]).filter(p => !pendingIds.includes(p.id));
        gen.runStatus = 'failed'; gen.runError = err.message || String(err);
        refreshRunNodes(gen, out);
        if(opts.cascade) throw err;
        showErrorModal(err.message || tr('canvas.generationFailed'), tr('canvas.apiFailed'));
    }
}

async function runVideoNode(nodeId, opts={}){
    const node = nodes.find(n => n.id === nodeId);
    if(!node || (node.running && !opts.cascade)) return;
    if(window.CanvasSession?.enabled && !window.MemberCanvasEdit?.canEdit)return;
    if(!allowedVideoResolutions(node).includes(node.resolution || '')){
        const error = new Error('视频规格已变化，请重新选择模型和分辨率后生成。');
        if(opts.cascade) throw error;
        showErrorModal(error.message); return;
    }
    const cascadeTargetId = cascadeTargetIdFromOptions(opts);
    const sources = orderedSources(node, generatorSources(node, opts.loopContext));
    const prompt = sources.map(s => s.prompt).filter(Boolean).join('\n\n');
    const allRefs = sources.flatMap(s => s.refs || []);
    const providerId = resolveVideoProviderId(node.apiProvider || 'comfly');
    const isVolcengineVideo = canvasAvatarPlatform(apiProviders.find(provider => provider.id === providerId)) === 'volcengine';
    const mediaRefs = applyUploadedUrlToRefs(allRefs, node).map(ref => {
        if(!isVolcengineVideo) return ref;
        const auth = canvasFaceAuthState(ref,apiProviders.find(provider => provider.id === providerId));
        return {...ref, asset_uris:auth.uris, face_auth_status:auth.status,
            url:auth.uris.volcengine || ref.url, originalLocalUrl:ref.originalLocalUrl || ref.url};
    });
    const unreadyVolcengineAsset = isVolcengineVideo && mediaRefs.find(ref => ref.face_auth_status && ref.face_auth_status !== 'Active');
    if(unreadyVolcengineAsset){
        showErrorModal(window.CanvasAssetAuth.error(unreadyVolcengineAsset.face_auth_status), '素材认证');
        return;
    }
    const refs = imageRefsOnly(mediaRefs);
    const videoRefs = videoRefsOnly(mediaRefs);
    const audioRefs = audioRefsOnly(mediaRefs);
    const usesTrustedVolcengineAssets = isVolcengineVideo && [...refs, ...videoRefs, ...audioRefs]
        .some(ref => String(ref?.url || '').trim().startsWith('asset://'));
    if(!isVolcengineVideo && node.useFrameRoles && refs[0]) refs[0] = {...refs[0], role:'first_frame'};
    if(!isVolcengineVideo && node.useFrameRoles && refs[1]) refs[1] = {...refs[1], role:'last_frame'};
    if(!prompt){ alert(tr('canvas.videoNeedsPrompt')); return; }
    let out = outputForNode(node, 460);
    const writeGuard=canvasTaskWriteGuard(node,out);
    writeGuard.check();
    const runToken={};
    Object.defineProperty(node,'_taskRunToken',{value:runToken,writable:true,configurable:true});
    let inputBinding;
    try {inputBinding=classicTaskInputBinding(node,out||node,writeGuard);}
    catch(error){showErrorModal(error.message);if(opts.cascade)throw error;return;}
    const run = runSnapshot(node, prompt, refs);
    const payload = {
        prompt,
        provider_id:providerId,
        model:node.model || 'veo3-fast',
        duration:window.VideoDurationPolicy.clamp(node.duration,videoNodeDurationRange(node)),
        aspect_ratio:node.aspectRatio || '16:9',
        resolution:node.resolution || '',
        images:refs,
        videos:manualVideoUrlForNode(node)
            ? [manualVideoUrlForNode(node)]
            : videoRefs.map(ref => tempShUploadedUrlForNode(node, ref.url)),
        audios:audioRefs.map(ref => tempShUploadedUrlForNode(node, ref.url)),
        enhance_prompt:Boolean(node.enhancePrompt),
        enable_upsample:Boolean(node.enableUpsample),
        watermark:Boolean(node.watermark),
        camerafixed:Boolean(node.cameraFixed),
        generate_audio:Boolean(node.generateAudio),
        multimodal:Boolean(node.multimodal),
        trusted_asset:usesTrustedVolcengineAssets,
        task_mode:node.taskMode || 'auto'
    };
    run.providerId = payload.provider_id;
    run.billingModel = payload.model;
    if(!opts.cascade){ node.running = true; refreshRunNodes(node, out); }
    else refreshRunNodes(node, out);
    let handledTaskFailure = false;
    let pendingId = '';
    try {
        if(inputBinding){payload.canvas_target=await inputBinding.prepare();inputBinding.beginSubmission();}
        const task = await createCanvasVideoTask(payload, {cascadeTargetId});
        inputBinding?.remember(task);
        writeGuard.check();inputBinding?.check();
        if(!out){
            const record = await waitCanvasVideoTaskResult(task.task_id, {cascadeTargetId,inputBinding,returnRecord:Boolean(inputBinding)});
            const result=inputBinding ? record.result||{} : record;
            writeGuard.check();inputBinding?.check();
            const outputUrls = videoOutputsFromResult(result);
            if(!outputUrls.length) throw new Error(tr('canvas.videoFailed'));
            run.request = requestMetaFromResult(result);
            run.canvasTaskId = task.task_id;
            Object.assign(run, window.VolcengineVideoBilling?.metadata(result));
            if(inputBinding)inputBinding.apply(record,()=>mergeGeneratedOutputs(node,outputUrls,Boolean(opts.cascade)),task.task_id);
            else mergeGeneratedOutputs(node, outputUrls, Boolean(opts.cascade));
            addGenerationLog({run, outputs:outputUrls, runMs:0});
            node.runStatus = 'done';
            node.runError = '';
            node.running = false;
            refreshRunNodes(node, out);
            scheduleSave();
            return;
        }
        pendingId = uid('p');
        out._pending = [...(out._pending || []), attachClassicTaskBinding(makePendingForRun(pendingId, run, node, {refs, cascadeTargetId}, {
            canvasTaskId:task.task_id,
            canvasTaskType:'video',
            providerId,
            model:payload.model,
            appendGenerated:Boolean(opts.cascade)
        }),inputBinding)];
        refreshRunNodes(node, out);
        scheduleSave();
        await saveCanvas();
        writeGuard.check();inputBinding?.check();
        const status = await pollCanvasVideoTask(task.task_id, {cascadeTargetId,inputBinding});
        writeGuard.check();inputBinding?.check();
        if(status==='paused')throw writeGuard.pause();
        if(status === 'aborted') throw cascadeAbortError(cascadeStopMessage());
        if(status === 'failed'){
            handledTaskFailure = true;
            throw new Error(node.runError || tr('canvas.videoFailed'));
        }
    } catch(err) {
        if(inputBinding){try {inputBinding.check();}catch(changed){err=changed;}}
        pauseClassicTaskInput(node,out,writeGuard,err,runToken,inputBinding);
        if(err?.resultPending || !writeGuard.valid()){const paused=writeGuard.pause();if(opts.cascade)throw paused;return;}
        const currentNode = nodes.find(n => n.id === nodeId) || node;
        const currentOut = out?.id ? nodes.find(n => n.id === out.id) || out : out;
        const pendingForRun = (currentOut?._pending || []).find(p => p.id === pendingId);
        const meta = pendingForRun ? collectRunMeta(currentOut, pendingForRun.id) : {runMs:0};
        if(isCascadeAbortError(err)){
            if(pendingForRun) resumePendingAfterCascadeStop(pendingForRun);
            scheduleSave();
            if(opts.cascade) throw err;
            return;
        }
        if(currentOut && pendingForRun && !handledTaskFailure) currentOut._pending = (currentOut._pending || []).filter(p => p.id !== pendingForRun.id);
        Object.assign(run, window.VolcengineVideoBilling?.metadata(err.videoResult || {}));
        if(!handledTaskFailure) addGenerationLog({run, outputs:[], runMs:meta.runMs || 0, error:err.message || String(err)});
        currentNode.runStatus = 'failed'; currentNode.runError = err.message || String(err);
        refreshRunNodes(currentNode, currentOut);
        scheduleSave();
        if(opts.cascade) throw err;
        alert(err.message || tr('canvas.videoFailed'));
    } finally {
        if(writeGuard.valid() && node._taskRunToken===runToken){
            node.running = false;
            refreshRunNodes(node, out);
        }
    }
}

async function uploadCanvasUrlToComfy(url){
    throw new Error("此功能已移除，历史内容保留。请新建通用 API 节点并明确选择供应商。");
}

async function comfyNameForRef(ref){
    throw new Error("此功能已移除，历史内容保留。请新建通用 API 节点并明确选择供应商。");
}

async function runComfyUpscale(imageUrl, resolution){
    throw new Error("此功能已移除，历史内容保留。请新建通用 API 节点并明确选择供应商。");
}

function comfyResultOutputs(result){
    return resultMediaUrls(result);
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
                if(url) urls.push({url, kind:value.kind || value.type || value.mediaKind || '', name:value.name || value.filename || ''});
            }
            ['outputs','videos','images','urls','data','result'].forEach(key => add(value[key]));
            ['url','path','src','uri','output','output_url','outputUrl','video','video_url','videoUrl','mp4_url','mp4Url','download_url','downloadUrl','preview_url','previewUrl'].forEach(key => add(value[key]));
        }
    };
    ['items','outputs','videos','audios','texts','files','images','urls','data','result','output','url'].forEach(key => add(result?.[key]));
    const seen = new Set();
    return urls.map(item => {
        const url = outputUrlValue(item);
        if(!url) return null;
        return typeof item === 'object' ? item : url;
    }).filter(item => {
        const url = outputUrlValue(item);
        return url && !seen.has(url) && seen.add(url);
    });
}

function ltxBuildContiguousRelay(node, globalPromptFallback=''){
    ltxFlushTimelineToNode(node);
    const durationFrames = Math.max(1, Number(node.durationFrames) || 120);
    const fallback = (globalPromptFallback || node.globalPrompt || '').trim() || '.';
    let sortedSegments = [];
    try {
        const t = JSON.parse(node.ltxTimelineData || '{}');
        sortedSegments = [...(t.segments || [])].sort((a, b) => (Number(a.start) || 0) - (Number(b.start) || 0));
    } catch(e) {}
    const contiguousLengths = [];
    const contiguousPrompts = [];
    let currentCursor = 0;
    let pendingGap = 0;
    for(const seg of sortedSegments){
        const start = Number(seg.start) || 0;
        const length = Math.max(1, Number(seg.length) || 1);
        if(start >= durationFrames) break;
        if(start > currentCursor){
            const gapLength = Math.min(start, durationFrames) - currentCursor;
            if(contiguousLengths.length > 0) contiguousLengths[contiguousLengths.length - 1] += gapLength;
            else pendingGap += gapLength;
        }
        const clippedEnd = Math.min(start + length, durationFrames);
        const clippedLength = clippedEnd - start;
        contiguousLengths.push(clippedLength + pendingGap);
        const prompt = (seg.prompt || '').trim();
        contiguousPrompts.push(prompt || fallback);
        if(!prompt) seg.prompt = fallback;
        pendingGap = 0;
        currentCursor = start + length;
    }
    const clampedCursor = Math.min(currentCursor, durationFrames);
    if(contiguousLengths.length > 0 && clampedCursor < durationFrames){
        contiguousLengths[contiguousLengths.length - 1] += durationFrames - clampedCursor;
    }
    if(!contiguousLengths.length){
        contiguousLengths.push(durationFrames);
        contiguousPrompts.push(fallback);
    }
    const guideStrength = sortedSegments
        .filter(s => s.type !== 'text')
        .map(s => (s.guideStrength !== undefined ? s.guideStrength : 1.0).toFixed(2))
        .join(',');
    return {
        local_prompts:contiguousPrompts.join(' | '),
        segment_lengths:contiguousLengths.join(','),
        guide_strength:guideStrength,
        sortedSegments
    };
}

async function ltxDirectorBuildTimelinePayload(node, globalPromptFallback=''){
    ltxDirectorSyncSeconds(node);
    let timeline = {segments: [], audioSegments: []};
    try { timeline = JSON.parse(node.ltxTimelineData || '{}'); } catch(e) {}
    const relay = ltxBuildContiguousRelay(node, globalPromptFallback);
    const segments = [...relay.sortedSegments];
    for(const seg of segments){
        if(seg.type === 'image' && !seg.imageFile){
            const url = seg.imageB64 || '';
            if(url){
                const fullUrl = url.startsWith('http') ? url : (location.origin + (url.startsWith('/') ? url : '/' + url));
                seg.imageFile = await uploadCanvasUrlToComfy(fullUrl);
            }
        }
        if(seg.imgObj) delete seg.imgObj;
    }
    const timelineJson = JSON.stringify({segments, audioSegments: timeline.audioSegments || []});
    node.ltxLocalPrompts = relay.local_prompts;
    node.ltxSegmentLengths = relay.segment_lengths;
    node.ltxGuideStrength = relay.guide_strength;
    node.ltxTimelineData = timelineJson;
    return {
        global_prompt:(globalPromptFallback || node.globalPrompt || '').trim(),
        duration_frames:Number(node.durationFrames) || 120,
        duration_seconds:Number(node.durationSeconds) || 5,
        timeline_data:timelineJson,
        local_prompts:relay.local_prompts,
        segment_lengths:relay.segment_lengths,
        guide_strength:relay.guide_strength,
        epsilon:Number(node.epsilon) || 0.001,
        frame_rate:Number(node.frameRate) || 24,
        use_custom_audio:Boolean(node.useCustomAudio),
        display_mode:node.displayMode || 'seconds',
        custom_width:Math.max(0, Number(node.customWidth) || 0),
        custom_height:Math.max(0, Number(node.customHeight) || 0),
        resize_method:'maintain aspect ratio',
        divisible_by:Math.max(1, Number(node.divisibleBy) || 32),
        img_compression:Number(node.imgCompression) ?? 18,
        timeline_ui:''
    };
}

function ltxDirectorTimelineSegments(node){
    ltxFlushTimelineToNode(node);
    if(node?._ltxEditor?.timeline?.segments) return node._ltxEditor.timeline.segments;
    try {
        const t = JSON.parse(node.ltxTimelineData || '{}');
        return t.segments || [];
    } catch(e) {
        return [];
    }
}

function clearStuckGeneratorRunning(node){
    if(!node || !node.running) return;
    if(cascadeRunningNodeIds.has(node.id) || cascadeSerialIds.has(node.id)) return;
    node.running = false;
}

function resetCascadeRuntimeState(){
    cascadeRunningIds.clear();
    cascadeRunningNodeIds.clear();
    cascadeStopIds.clear();
    cascadeSerialIds.clear();
    cascadeContexts.forEach(ctx => clearCascadeCleanupTimer(ctx));
    cascadeContexts.clear();
}

function cascadeContextFor(targetId){
    return targetId ? cascadeContexts.get(targetId) || null : null;
}

function isCascadeActive(targetId){
    const ctx = cascadeContextFor(targetId);
    return Boolean(ctx && (ctx.status === 'running' || ctx.status === 'stopping'));
}

function cascadeBusyNodeId(order=[]){
    return order.find(id => cascadeRunningNodeIds.has(id) || nodes.find(node => node.id === id)?.running) || '';
}

function isCascadeStopping(targetId){
    return cascadeContextFor(targetId)?.status === 'stopping';
}

function cascadeAbortError(message='已停止一键运行'){
    const err = new Error(message);
    err.name = 'CascadeAbortError';
    err.isCascadeAbort = true;
    return err;
}

function isCascadeAbortError(err){
    return Boolean(err?.isCascadeAbort || err?.name === 'CascadeAbortError');
}

function cascadeStopMessage(reason=''){
    if(reason) return reason;
    return langIsEn() ? 'One-click run stopped' : '已停止一键运行';
}

function cascadeBackendRestartMessage(){
    return langIsEn() ? 'Backend restarted and task status was lost. This one-click run has been stopped.' : '后端已重启，任务状态已丢失，本次一键运行已停止';
}

function normalizeCanvasTaskError(err, fallback=''){
    const raw = err?.message || String(err || '');
    const text = String(raw || '').trim();
    if(!text) return fallback || tr('canvas.generationFailed');
    if(/backend restarted and task status was lost/i.test(text)) return cascadeBackendRestartMessage();
    if(/(404|not found|missing)/i.test(text) && /canvas-image-task/i.test(text)) return cascadeBackendRestartMessage();
    if(/Failed to fetch|NetworkError|Load failed|ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET/i.test(text)) return cascadeBackendRestartMessage();
    return text;
}

function canvasTaskPollRetryWindow(status=0, err=null){
    const code = Number(status || 0);
    if(code === 404) return 60 * 1000;
    if([408, 425, 429, 500, 502, 503, 504].includes(code)) return 30 * 60 * 1000;
    const text = err?.message || String(err || '');
    if(/Failed to fetch|NetworkError|Load failed|ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|fetch failed/i.test(text)){
        return 30 * 60 * 1000;
    }
    return 0;
}

function clearCascadeNodeState(node, options={}){
    if(!node) return;
    const keepError = Boolean(options.keepError);
    if(node.runStatus) node.runStatus = '';
    if(node._cascadeIdx) node._cascadeIdx = '';
    if(!keepError){
        node.runError = '';
        node._cascadeFailed = false;
    }
}

function createCascadeContext(targetId, order, options={}){
    const ctx = {
        targetId,
        order:[...(order || [])],
        status:'running',
        startedAt:nowMs(),
        abortRequested:false,
        message:'',
        currentNodeId:'',
        currentRoundLabel:'',
        mode:options.mode || 'serial',
        cleanupTimer:null,
        controllers:new Set()
    };
    cascadeContexts.set(targetId, ctx);
    return ctx;
}

function clearCascadeCleanupTimer(ctx){
    if(!ctx?.cleanupTimer) return;
    clearTimeout(ctx.cleanupTimer);
    ctx.cleanupTimer = null;
}

function beginCascade(targetId, order, options={}){
    const writeGuard=canvasTaskWriteGuard(...[targetId,...order].map(id=>nodes.find(n=>n.id===id)));
    writeGuard.check();
    const existing = cascadeContextFor(targetId);
    if(existing){
        clearCascadeCleanupTimer(existing);
        cascadeContexts.delete(targetId);
    }
    const ctx = createCascadeContext(targetId, order, options);
    ctx.writeGuard=writeGuard;
    cascadeRunningIds.add(targetId);
    ctx.order.forEach(id => cascadeRunningNodeIds.add(id));
    if(options.serial) cascadeSerialIds.add(targetId);
    if(options.mode) ctx.mode = options.mode;
    return ctx;
}

function abandonCascade(ctx){
    if(!ctx)return;
    ctx.writeGuard?.pause();
    clearCascadeCleanupTimer(ctx);
    if(cascadeContexts.get(ctx.targetId)!==ctx)return;
    cascadeContexts.delete(ctx.targetId);
    cascadeRunningIds.delete(ctx.targetId);
    ctx.order.forEach(id=>cascadeRunningNodeIds.delete(id));
    cascadeStopIds.delete(ctx.targetId);
    cascadeSerialIds.delete(ctx.targetId);
}

function queueCascadeCleanup(ctx, ids){
    if(!ctx) return;
    clearCascadeCleanupTimer(ctx);
    ctx.cleanupTimer = setTimeout(() => {
        if(cascadeContexts.get(ctx.targetId)!==ctx || (ctx.writeGuard && !ctx.writeGuard.valid())){abandonCascade(ctx);return;}
        const uniqueIds = [...new Set((ids || []).filter(Boolean))];
        uniqueIds.forEach(id => {
            const node = nodes.find(n => n.id === id);
            if(node && node.runStatus === 'done') clearCascadeNodeState(node, {keepError:false});
        });
        refreshNodes(uniqueIds);
        if(cascadeContexts.get(ctx.targetId) === ctx) cascadeContexts.delete(ctx.targetId);
        ctx.cleanupTimer = null;
    }, 3000);
}

function requestCascadeStop(targetId, reason=''){
    if(!targetId) return;
    cascadeStopIds.add(targetId);
    const ctx = cascadeContextFor(targetId);
    if(ctx){
        ctx.abortRequested = true;
        ctx.status = 'stopping';
        if(reason) ctx.message = reason;
        [...(ctx.controllers || [])].forEach(controller => {
            try { controller.abort(); } catch(_) {}
        });
    }
    refreshNodes(cascadeUiNodeIds(targetId));
}

function ensureCascadeActive(targetId, reason='', expected=null){
    const ctx = cascadeContextFor(targetId);
    if(expected && ctx!==expected)throw expected.writeGuard.pause();
    if(!ctx) return null;
    ctx.writeGuard?.check();
    if(ctx.abortRequested || ctx.status === 'stopping') throw cascadeAbortError(cascadeStopMessage(reason || ctx.message));
    return ctx;
}

function finalizeCascade(targetId, state, options={}){
    const ctx = cascadeContextFor(targetId);
    if(options.ctx && options.ctx!==ctx)return;
    if(ctx?.writeGuard && !ctx.writeGuard.valid()){abandonCascade(ctx);return;}
    const order = options.order || ctx?.order || computeCascadeOrder(targetId);
    const uiIds = cascadeUiNodeIds(targetId, order);
    clearCascadeCleanupTimer(ctx);
    cascadeRunningIds.delete(targetId);
    (ctx?.order || order || []).forEach(id => cascadeRunningNodeIds.delete(id));
    cascadeStopIds.delete(targetId);
    cascadeSerialIds.delete(targetId);
    if(ctx) ctx.status = state;
    if(state === 'done'){
        queueCascadeCleanup(ctx, uiIds);
        refreshNodes(uiIds);
        return;
    }
    if(state === 'stopped'){
        (order || []).forEach(id => {
            const node = nodes.find(n => n.id === id);
            if(node && !node._cascadeFailed) clearCascadeNodeState(node);
        });
    }
    refreshNodes(uiIds);
    cascadeContexts.delete(targetId);
}

function cascadeTargetIdFromOptions(options={}){
    return String(options?.cascadeTargetId || options?.targetId || '');
}

function cascadeContextFromOptions(options={}){
    return cascadeContextFor(cascadeTargetIdFromOptions(options));
}

async function cascadeFetch(input, init={}, options={}){
    const ctx = cascadeContextFromOptions(options);
    if(!ctx) return fetch(input, init);
    ensureCascadeActive(ctx.targetId, ctx.message);
    const controller = new AbortController();
    ctx.controllers.add(controller);
    try {
        return await fetch(input, {...init, signal:controller.signal});
    } catch(err) {
        if(controller.signal.aborted || err?.name === 'AbortError'){
            throw cascadeAbortError(cascadeStopMessage(ctx.message));
        }
        throw err;
    } finally {
        ctx.controllers.delete(controller);
    }
}

async function runLTXDirectorNode(nodeId, opts={}){
    throw new Error("此功能已移除，历史内容保留。请新建通用 API 节点并明确选择供应商。");
}

async function runComfyNode(nodeId, opts={}){
    throw new Error("此功能已移除，历史内容保留。请新建通用 API 节点并明确选择供应商。");
}

async function callCanvasLLM(node, message, messages=[], options={}){
    const llmProv = resolveChatProviderId(node.llmProvider || 'comfly');
    const model = resolveChatModel(node.model || node.llmMsModel, llmProv);
    const images = llmInputImages(node);
    const videos = llmInputVideos(node);
    if(window.CanvasSession?.enabled){
        if(!window.CanvasLLMTasks)throw new Error('对话组件已更新，请保存并刷新页面。');
        return window.CanvasLLMTasks.run({message,model,provider_id:llmProv,
            system_prompt:node.systemPrompt || 'You are a helpful assistant.',messages:messages.slice(-100),images:images.slice(0,8),videos:videos.slice(0,3)},
            {binding:options.inputBinding,canvasId:canvas.id,transport:(path,init)=>cascadeFetch(path,init,options)});
    }
    const result = await window.CanvasApi.canvasLLMRequest({
        message,
        model,
        provider: llmProv,
        system_prompt:node.systemPrompt || 'You are a helpful assistant.',
        messages,
        images,
        videos,
    }, {transport:cascadeFetch, transportOptions:options}).then(async r => {
        if(!r.ok){
            throw new Error(await responseErrorMessage(r, 'LLM 运行失败'));
        }
        return r.json();
    });
    return {result:{text:result.text || ''}};
}

async function runLLMNode(nodeId, opts={}){
    const node=nodes.find(n=>n.id===nodeId);
    if(!node || (node.running && !opts.cascade))return;
    if(window.CanvasSession?.enabled && !window.MemberCanvasEdit?.canEdit)return;
    const input=llmInputText(node, opts.loopContext)||node.userInput||'';
    if(!input){if(opts.cascade)throw new Error('LLM 缺少提示词输入');alert(tr('canvas.needPromptToLLM'));return;}
    const writeGuard=canvasTaskWriteGuard(node);
    const inputBinding=classicTaskInputBinding(node,node,writeGuard);
    if(!opts.cascade){node.running=true;refreshNodes([node.id]);}
    try {
        const task=await callCanvasLLM(node,input,[],{cascadeTargetId:cascadeTargetIdFromOptions(opts),inputBinding});
        const apply=()=>{node.outputText=task.result.text;if(task.id)node.result_task_id=task.id;
            if(!opts.cascade)node.running=false;node.runStatus='done';node.runError='';};
        if(inputBinding)inputBinding.apply(task,apply,task.id);else {writeGuard.check();apply();}
        refreshNodes([node.id]);scheduleSave();
    } catch(error){
        if(writeGuard.valid()){if(!opts.cascade)node.running=false;refreshNodes([node.id]);}
        if(opts.cascade)throw error;
        if(writeGuard.valid())showErrorModal(error.message || 'LLM 运行失败','对话生成');
    }
}

// 判断是不是「链尾」节点：没有下游生成节点（直接相连或经 Output 中转都算）
function isTerminalGenerator(nodeId){
    const GEN_TYPES = canvasRunTypes();
    for(const c of connections.filter(c => c.from === nodeId)){
        const t = nodes.find(n => n.id === c.to);
        if(!t) continue;
        if(GEN_TYPES.includes(t.type)) return false;
        if(t.type === 'output'){
            for(const c2 of connections.filter(cc => cc.from === t.id)){
                const t2 = nodes.find(n => n.id === c2.to);
                if(t2 && GEN_TYPES.includes(t2.type)) return false;
            }
        }
    }
    return true;
}

function findLoopCascadeTarget(loopId){
    const runTypes = canvasRunTypes();
    const seen = new Set();
    const candidates = [];
    const walk = (id, depth=0) => {
        if(seen.has(id)) return;
        seen.add(id);
        connections.filter(c => c.from === id).forEach(c => {
            const next = nodes.find(n => n.id === c.to);
            if(!next) return;
            if(runTypes.includes(next.type)){
                candidates.push({id:next.id, depth:depth + 1, terminal:isTerminalGenerator(next.id)});
            }
            walk(next.id, depth + 1);
        });
    };
    walk(loopId);
    const terminal = candidates.filter(c => c.terminal).sort((a, b) => b.depth - a.depth)[0];
    return (terminal || candidates.sort((a, b) => b.depth - a.depth)[0])?.id || '';
}

// —— 一键运行：从目标节点反向追溯到所有上游生成节点，按拓扑顺序串行执行 ——
function runCascadeNodeByType(node, opts={}){
    if(isCanvasLockedByOther()){
        setStatus('画布正被其他人编辑中，无法执行');
        return Promise.resolve();
    }
    const runOpts = {cascade:true, ...opts};
    if(node.type === 'generator') return runGenerator(node.id, runOpts);
    if(node.type === 'msgen') return runMsGenNode(node.id, runOpts);
    if(node.type === 'comfy') return runComfyNode(node.id, runOpts);
    if(node.type === 'ltxDirector') return runLTXDirectorNode(node.id, runOpts);
    if(node.type === 'llm') return runLLMNode(node.id, runOpts);
    if(node.type === 'video') return runVideoNode(node.id, runOpts);
    return Promise.resolve();
}

function runCascadeNodeWithLoopContext(node, ctx, opts={}){
    return runCascadeNodeByType(node, {...opts, loopContext:ctx || null});
}

function cascadeParallelLimit(order, totalRounds){
    const hasComfy = order.some(id => nodes.find(n => n.id === id)?.type === 'comfy');
    if(hasComfy) return Math.max(1, Math.min(totalRounds, comfyBackendCount || 1));
    return Math.max(1, Math.min(totalRounds, 6));
}

async function runLimitedCascadeRounds(rounds, limit, runner){
    let next = 0;
    let failed = false;
    const workers = Array.from({length:Math.max(1, Math.min(limit, rounds.length))}, async () => {
        while(!failed && next < rounds.length){
            const round = rounds[next++];
            try {
                await runner(round);
            } catch(err) {
                failed = true;
                throw err;
            }
        }
    });
    return Promise.allSettled(workers);
}

function canvasRunTypes(){
    return ['generator','msgen','comfy','ltxDirector','llm','video'];
}

async function runCanvasGenerate(nodeId){
    const node = nodes.find(n => n.id === nodeId);
    if(!node || node.running || cascadeRunningNodeIds.has(nodeId)) return;
    return runCascadeNodeByType(node, {cascade:false});
}

function computeCascadeOrder(targetId){
    const visited = new Set();
    const order = [];
    const GEN_TYPES = canvasRunTypes();
    function dfs(id){
        if(visited.has(id)) return;
        visited.add(id);
        const node = nodes.find(n => n.id === id);
        if(!node) return;
        // 找该节点的上游
        connections.filter(c => c.to === id).forEach(c => {
            const from = nodes.find(n => n.id === c.from);
            if(!from) return;
            if(GEN_TYPES.includes(from.type)){
                dfs(from.id);
            } else if(from.type === 'output'){
                // output 节点的上游是生成器
                connections.filter(cc => cc.to === from.id).forEach(cc => {
                    const ff = nodes.find(n => n.id === cc.from);
                    if(ff && GEN_TYPES.includes(ff.type)) dfs(ff.id);
                });
            }
        });
        if(GEN_TYPES.includes(node.type)) order.push(id);
    }
    dfs(targetId);
    return order;
}

function computeRetryCascadeOrder(nodeId){
    const runTypes = canvasRunTypes();
    const visited = new Set();
    const downstream = new Set();
    const walk = id => {
        if(visited.has(id)) return;
        visited.add(id);
        const node = nodes.find(n => n.id === id);
        if(!node) return;
        if(runTypes.includes(node.type)) downstream.add(id);
        connections.filter(c => c.from === id).forEach(c => {
            const next = nodes.find(n => n.id === c.to);
            if(next && (runTypes.includes(next.type) || next.type === 'output')) walk(next.id);
        });
    };
    walk(nodeId);
    const order = [];
    const added = new Set();
    downstream.forEach(id => computeCascadeOrder(id).forEach(candidate => {
        if(downstream.has(candidate) && !added.has(candidate)){
            added.add(candidate);
            order.push(candidate);
        }
    }));
    return order;
}

function upstreamNodeIds(targetId){
    const found = new Set();
    const walk = id => {
        connections.filter(c => c.to === id).forEach(c => {
            if(found.has(c.from)) return;
            found.add(c.from);
            walk(c.from);
        });
    };
    walk(targetId);
    return found;
}

function resolveCascadeLoop(targetId){
    const upstream = upstreamNodeIds(targetId);
    const loops = nodes.filter(n => n.type === 'loop' && upstream.has(n.id));
    if(!loops.length) return null;
    const loop = loops[loops.length - 1];
    return {node:loop, count:loopCount(loop), mode:loop.mode === 'parallel' ? 'parallel' : 'serial'};
}

function cascadeUiNodeIds(targetId, order=null){
    const ids = new Set([targetId, ...(order || computeCascadeOrder(targetId))]);
    const loop = resolveCascadeLoop(targetId);
    if(loop?.node?.id) ids.add(loop.node.id);
    return [...ids].filter(Boolean);
}

async function runNodeCascade(nodeId){
    const target = nodes.find(n => n.id === nodeId);
    if(!target || (window.CanvasSession?.enabled && !window.MemberCanvasEdit?.canEdit)) return;
    if(target.running){ alert('当前节点正在运行'); return; }
    const order = computeCascadeOrder(nodeId);
    if(!order.length){ alert('没有可运行的生成节点'); return; }
    if(cascadeBusyNodeId(order)){ alert('工作流中的节点正在运行'); return; }
    const loop = resolveCascadeLoop(nodeId);
    const totalRounds = loop?.count || 1;
    const startIdx = Math.max(1, Number(loop?.node?.loopStart) || 1);
    const loopImageStride = loop?.node?.imageInput ? Math.max(1, Math.min(100, Number(loop?.node?.imageBatchSize) || 1)) : 0;
    const loopBatchSize = Math.max(1, loopImageStride);
    const endIdx = startIdx + (totalRounds - 1) * loopBatchSize;
    const ctx = beginCascade(nodeId, order, {serial:true, mode:loop?.mode || 'serial'});
    refreshNodes(cascadeUiNodeIds(nodeId, order));
    order.forEach(id => {
        const n = nodes.find(x => x.id === id);
        if(n) n.generatedOutputs = [];
    });
    if(loop?.mode === 'parallel' && totalRounds > 1){
        order.forEach(id => {
            const n = nodes.find(x => x.id === id);
            if(n){ n.runStatus = 'queued'; n.runError = ''; n._cascadeFailed = false; n._cascadeIdx = `0/${totalRounds}`; }
        });
        refreshNodes(cascadeUiNodeIds(nodeId, order));
        let done = 0;
        const rounds = Array.from({length:totalRounds}, (_, idx) => ({idx, index:startIdx + idx * loopBatchSize}));
        const limit = cascadeParallelLimit(order, totalRounds);
        const results = await runLimitedCascadeRounds(rounds, limit, async ({index}) => {
            ensureCascadeActive(nodeId, ctx.message, ctx);
            const loopCtx = {index, total:endIdx, nodeId:loop.node.id};
            for(let i = 0; i < order.length; i++){
                ensureCascadeActive(nodeId, ctx.message, ctx);
                const id = order[i];
                const node = nodes.find(n => n.id === id);
                if(!node) continue;
                ctx.currentNodeId = id;
                ctx.currentRoundLabel = `${index}/${endIdx}`;
                node.runStatus = 'running';
                node._cascadeIdx = `${order.indexOf(id)+1}/${order.length} · ${index}/${endIdx}`;
                refreshNodes([id]);
                await runCascadeNodeWithLoopContext(node, loopCtx, {cascadeTargetId:nodeId});
                ensureCascadeActive(nodeId, ctx.message, ctx);
                node.runStatus = 'done';
                refreshNodes([id]);
            }
            done += 1;
            order.forEach(id => {
                const n = nodes.find(x => x.id === id);
                if(n) n._cascadeIdx = `${done}/${totalRounds}`;
            });
            refreshNodes(order);
        });
        if(!ctx.writeGuard.valid() || cascadeContextFor(nodeId)!==ctx){abandonCascade(ctx);return;}
        const failed = results.find(r => r.status === 'rejected');
        if(failed){
            const err = failed.reason || new Error('parallel loop failed');
            if(err?.resultPending){abandonCascade(ctx);return;}
            if(isCascadeAbortError(err)){
                finalizeCascade(nodeId, 'stopped', {order,ctx});
                return;
            }
            const node = nodes.find(n => n.id === ctx.currentNodeId) || nodes.find(n => n.id === nodeId) || target;
            node.runStatus = 'failed';
            node.runError = err.message || String(err);
            node._cascadeFailed = true;
            finalizeCascade(nodeId, 'failed', {order,ctx});
            return;
        }
        finalizeCascade(nodeId, 'done', {order,ctx});
        return;
    }
    refreshNodes(cascadeUiNodeIds(nodeId, order));
    for(let round = 1; round <= totalRounds; round++){
        ensureCascadeActive(nodeId, ctx.message, ctx);
        const loopIndex = startIdx + (round - 1) * loopBatchSize;
        const loopCtx = loop ? {index:loopIndex, total:endIdx, nodeId:loop.node.id} : null;
        order.forEach(id => {
            const n = nodes.find(x => x.id === id);
            if(n){ n.runStatus = 'queued'; n.runError = ''; n._cascadeFailed = false; n._cascadeIdx = `${order.indexOf(id)+1}/${order.length}${totalRounds > 1 ? ` · ${loopIndex}/${endIdx}` : ''}`; }
        });
        refreshNodes(cascadeUiNodeIds(nodeId, order));
        for(let i = 0; i < order.length; i++){
            const id = order[i];
            const node = nodes.find(n => n.id === id);
            if(!node) continue;
            ctx.currentNodeId = id;
            ctx.currentRoundLabel = totalRounds > 1 ? `${loopIndex}/${endIdx}` : '';
            node.runStatus = 'running';
            refreshNodes([id]);
            try {
                await runCascadeNodeWithLoopContext(node, loopCtx, {cascadeTargetId:nodeId});
                ensureCascadeActive(nodeId, ctx.message, ctx);
                node.runStatus = 'done';
                refreshNodes([id]);
            } catch(err){
                if(err?.resultPending || !ctx.writeGuard.valid() || cascadeContextFor(nodeId)!==ctx){abandonCascade(ctx);return;}
                if(isCascadeAbortError(err)){
                    finalizeCascade(nodeId, 'stopped', {order,ctx});
                    return;
                }
                node.runStatus = 'failed';
                node.runError = `${totalRounds > 1 ? `${tr('canvas.loopRound')} ${round}/${totalRounds}: ` : ''}${err.message || String(err)}`;
                node._cascadeFailed = true;
                for(let j = i + 1; j < order.length; j++){
                    const n2 = nodes.find(x => x.id === order[j]);
                    if(n2){ n2.runStatus = ''; n2._cascadeIdx = ''; }
                }
                finalizeCascade(nodeId, 'failed', {order,ctx});
                return;
            }
        }
    }
    finalizeCascade(nodeId, 'done', {order,ctx});
}

async function runOneCascadePass(order, options={}){
    const targetId = cascadeTargetIdFromOptions(options);
    const writeGuard=canvasTaskWriteGuard(...order.map(id=>nodes.find(n=>n.id===id)));
    writeGuard.check();
    order.forEach(id => {
        const n = nodes.find(x => x.id === id);
        if(n){ n.runStatus = 'queued'; n.runError = ''; n._cascadeFailed = false; n._cascadeIdx = ''; }
    });
    refreshNodes(order);
    for(let i = 0; i < order.length; i++){
        if(targetId) ensureCascadeActive(targetId);
        const id = order[i];
        const node = nodes.find(n => n.id === id);
        if(!node) continue;
        const ctx = cascadeContextFor(targetId);
        if(ctx) ctx.currentNodeId = id;
        node.runStatus = 'running';
        refreshNodes([id]);
        try {
            if(node.type === 'generator') await runGenerator(id, {cascade:true, cascadeTargetId:targetId});
            else if(node.type === 'msgen') await runMsGenNode(id, {cascade:true, cascadeTargetId:targetId});
            else if(node.type === 'comfy') await runComfyNode(id, {cascade:true, cascadeTargetId:targetId});
            else if(node.type === 'ltxDirector') await runLTXDirectorNode(id, {cascade:true, cascadeTargetId:targetId});
            else if(node.type === 'llm') await runLLMNode(id, {cascade:true, cascadeTargetId:targetId});
            else if(node.type === 'video') await runVideoNode(id, {cascade:true, cascadeTargetId:targetId});
            writeGuard.check();
            if(targetId) ensureCascadeActive(targetId);
            node.runStatus = 'done';
            refreshNodes([id]);
        } catch(err) {
            if(err?.resultPending || !writeGuard.valid())throw writeGuard.pause();
            node.runStatus = 'failed';
            node.runError = err.message || String(err);
            node._cascadeFailed = true;
            throw err;
        }
    }
}

// 失败重试：从该节点继续往下游跑
async function retryNodeAndDownstream(nodeId){
    const target = nodes.find(n => n.id === nodeId);
    if(!target || (window.CanvasSession?.enabled && !window.MemberCanvasEdit?.canEdit)) return;
    if(isCascadeActive(nodeId)) return;
    const remain = computeRetryCascadeOrder(nodeId);
    if(!remain.length) return;
    if(cascadeBusyNodeId(remain)) return;
    const ctx=beginCascade(nodeId, remain, {serial:true, mode:'retry'});
    try {
        await runOneCascadePass(remain, {cascadeTargetId:nodeId});
        finalizeCascade(nodeId, 'done', {order:remain,ctx});
    } catch(err) {
        if(err?.resultPending || !ctx.writeGuard.valid() || cascadeContextFor(nodeId)!==ctx){abandonCascade(ctx);return;}
        if(isCascadeAbortError(err)){
            finalizeCascade(nodeId, 'stopped', {order:remain,ctx});
            return;
        }
        finalizeCascade(nodeId, 'failed', {order:remain,ctx});
        refreshNodes(remain);
    }
}

function cancelCascade(nodeId){
    requestCascadeStop(nodeId);
}

async function runLLMChat(nodeId){
    const node=nodes.find(n=>n.id===nodeId);
    if(!node || node.running)return;
    if(window.CanvasSession?.enabled && !window.MemberCanvasEdit?.canEdit)return;
    const message=(node.chatInput||'').trim();if(!message)return;
    const writeGuard=canvasTaskWriteGuard(node);
    node.messages=node.messages||[];
    const history=node.messages.slice();
    node.messages.push({role:'user',content:message});node.chatInput='';node.running=true;
    refreshNodes([node.id]);
    try {
        const inputBinding=classicTaskInputBinding(node,node,writeGuard);
        const task=await callCanvasLLM(node,message,history,{inputBinding});
        const apply=()=>{node.messages.push({role:'assistant',content:task.result.text});
            node.outputText=task.result.text;if(task.id)node.result_task_id=task.id;node.running=false;};
        if(inputBinding)inputBinding.apply(task,apply,task.id);else {writeGuard.check();apply();}
        refreshNodes([node.id]);scheduleSave();
    } catch(error){
        if(writeGuard.valid()){node.running=false;refreshNodes([node.id]);showErrorModal(error.message || 'LLM 运行失败','对话生成');}
    }
}

function makePending(id, run, task={}){
    return {id, startedAt:nowMs(), run, ...task};
}

function makePendingForRun(id, run, node, options={}, task={}){
    const pending = makePending(id, run, task);
    const previewSize = pendingPreviewSizeForRun(node, options);
    if(previewSize) pending.previewSize = previewSize;
    if(options?.cascadeTargetId) pending.cascadeTargetId = String(options.cascadeTargetId);
    return pending;
}

function mergeGeneratedOutputs(node, outputs, append=false){
    if(!node) return;
    const keepGeneratedMedia = ['ltxDirector','video'].includes(node.type);
    const clean = (outputs || []).map(item => {
        const url = outputUrlValue(item);
        if(!url) return null;
        const kind = node.type === 'video'
            ? 'video'
            : node.type === 'ltxDirector' && isVideoUrl(url)
                ? 'video'
                : mediaKindForOutputItem(item);
        if(!keepGeneratedMedia && kind !== 'image') return null;
        return kind === 'image' ? url : {url, kind};
    }).filter(Boolean);
    if(!append){
        node.generatedOutputs = clean;
        syncConnectedOutputsFromGenerated(node, clean);
        return;
    }
    const seen = new Set((node.generatedOutputs || []).map(outputUrlValue).filter(Boolean));
    const added = clean.filter(item => {
        const url = outputUrlValue(item);
        return url && !seen.has(url) && seen.add(url);
    });
    node.generatedOutputs = [...(node.generatedOutputs || []), ...added];
    syncConnectedOutputsFromGenerated(node, added);
}

function pendingById(out, id){
    return (out?._pending || []).find(p => p.id === id) || null;
}

function collectRunMetas(out, ids){
    return (ids || []).map(id => pendingById(out, id)).filter(Boolean).map(p => ({
        runMs: nowMs() - Number(p.startedAt || nowMs()),
        run: p.run || {},
    }));
}

function collectRunMeta(out, id){
    return collectRunMetas(out, [id])[0] || {runMs:0, run:{}};
}

function findOutputByPendingId(pendingId){
    return nodes.find(n => n.type === 'output' && (n._pending || []).some(p => p.id === pendingId));
}

function findPendingTask(taskId){
    for(const out of nodes.filter(n => n.type === 'output')){
        const pending = (out._pending || []).find(p => p.canvasTaskId === taskId);
        if(pending) return {out, pending};
    }
    return null;
}

async function createCanvasImageTask(payload, options={}){
    payload = {...payload, canvas_id:canvas?.id || ''};
    const res = await window.CanvasApi.createCanvasImageTaskRequest(payload, {transport:cascadeFetch, transportOptions:options});
    if(!res.ok) throw new Error(await responseErrorMessage(res, tr('canvas.generationFailed')));
    return res.json();
}

async function createCanvasVideoTask(payload, options={}){
    payload = {...payload, canvas_id:canvas?.id || ''};
    const res = await window.CanvasApi.createCanvasVideoTaskRequest(payload, {transport:cascadeFetch, transportOptions:options});
    if(!res.ok) throw new Error(await responseErrorMessage(res, tr('canvas.videoFailed')));
    return res.json();
}

function extractUpstreamTaskId(text){
    const match = String(text || '').match(/(?:task_id|taskId|task id)\s*[=:：]\s*([A-Za-z0-9_.:-]+)/i);
    return match ? match[1] : '';
}

function providerIdForPending(pending){
    return pending?.providerId
        || pending?.run?.request?.provider_id
        || pending?.run?.node?.apiProvider
        || pending?.run?.node?.provider_id
        || 'comfly';
}

function completeRecoverPendingOutput(out, pending, result){
    if(!out || !pending || !result) return;
    pending.run = {...pending.run, canvasTaskId:pending.canvasTaskId};
    const images = result.images || [];
    if(!images.length) return;
    const meta = {
        runMs: nowMs() - Number(pending.startedAt || nowMs()),
        run: pending.run || {},
    };
    meta.run.request = requestMetaFromResult(result);
    out._pending = (out._pending || []).filter(p => p.id !== pending.id);
    appendOutputImages(out, images, meta.run?.refs?.[0], [meta]);
    const gen = nodes.find(n => n.id === meta.run?.node?.id);
    if(gen){
        mergeGeneratedOutputs(gen, images, Boolean(pending.appendGenerated));
        gen.runStatus = 'done';
        gen.runError = '';
        gen.running = false;
    }
    addGenerationLog({run:meta.run, outputs:images, runMs:meta.runMs || 0});
    refreshRunNodes(gen, out);
    scheduleSave();
}

async function queryRecoverPendingOutput(pendingId){
    const out = findOutputByPendingId(pendingId);
    const pending = pendingById(out, pendingId);
    if(!out || !pending || pending.querying) return;
    if(pending.paused){
        if(window.MemberCanvasEdit?.openTaskResults)await window.MemberCanvasEdit.openTaskResults();
        else setStatus('请打开生成结果列表查看原任务，不需要重新生成。');
        return;
    }
    const memberMode=Boolean(window.CanvasSession?.enabled);
    const sourceId=pending.run?.node?.id, source=sourceId ? nodes.find(n=>n.id===sourceId) : null;
    if(memberMode && sourceId && !source)return;
    const writeGuard=canvasTaskWriteGuard(out,source);
    const current=()=>writeGuard.valid() && pendingById(out,pendingId)===pending;
    if(!current())return;
    // Member recovery reads the original durable task. An upstream ID alone
    // cannot select a provider account or authorize a new paid submission.
    const taskId = memberMode ? pending.canvasTaskId : pending.recoverTaskId || extractUpstreamTaskId(pending.error || '');
    if(!taskId){
        showErrorModal(memberMode ? '历史任务缺少本地记录，请在管理平台按原供应商核对。' : '没有任务 ID，无法查询结果', tr('canvas.apiFailed'));
        return;
    }
    const inputBinding=memberMode ? pending._inputBinding : null;
    pending.querying = true;
    if(!memberMode)pending.recoverTaskId = taskId;
    refreshNodes([out.id]);
    try {
        let data,record;
        if(memberMode){
            const response=await window.CanvasApi.getCanvasImageTaskRequest(taskId);
            if(!response.ok)throw new Error(await responseErrorMessage(response,'查询失败'));
            record=await response.json();
            if(!current())return;
            if(record.id!==taskId)throw new Error('任务记录不匹配，请刷新后重试。');
            data={...(record.result||{}),status:record.status,error:record.error};
        } else data=await window.CanvasApi.queryImageTask({provider_id:providerIdForPending(pending), task_id:taskId}, {errorFallback:'查询失败'});
        if(!current())return;
        if(data.status === 'succeeded'){
            if(memberMode){
                if(!inputBinding || record.canvas_edit_generation!==window.MemberCanvasEdit?.active?.lease?.generation){
                    if(window.MemberCanvasEdit?.openTaskResults)await window.MemberCanvasEdit.openTaskResults();
                    else showErrorModal('结果已保存，请从生成结果列表确认加入。','生成结果');
                    return;
                }
                if(!(data.images||[]).length)throw new Error('任务没有可加入的图片，请在管理平台核对。');
                inputBinding.apply(record,()=>completeRecoverPendingOutput(out,pending,data),taskId);
            } else completeRecoverPendingOutput(out,pending,data);
            return;
        }
        const message=data.status==='needs_review' ? '任务需要在管理平台核对；不会自动重新生成。' :
            data.error || data.message || ((data.status==='failed'||data.status==='cancelled') ? tr('canvas.generationFailed') : '任务仍在生成中，请稍后再查询');
        // A status refresh must not consume the input receipt needed by a later result.
        if(!memberMode)pending.error=message;
        setStatus(message);
    } catch(err) {
        if(!current())return;
        if(!memberMode)pending.error=err.message || '查询失败';
        if(err.resultPending && window.MemberCanvasEdit?.openTaskResults)await window.MemberCanvasEdit.openTaskResults();
        else showErrorModal(err.message || '查询失败', tr('canvas.apiFailed'));
    } finally {
        if(current()){
            pending.querying = false;
            refreshNodes([out.id]);
            scheduleSave();
        }
    }
}

function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }

async function pollCanvasImageTask(taskId, options={}){
    if(!taskId) return 'failed';
    const originCanvas=canvas?.id, validResult=window.CanvasTaskResults?.capture() || (()=>!window.CanvasSession?.enabled);
    if(!validResult()) return 'paused';
    const found=findPendingTask(taskId);
    if(!found)return 'missing';
    const inputBinding=classicPendingInputBinding(found,options);
    if(window.CanvasSession?.enabled && !inputBinding)return 'paused';
    const sourceId=found.pending.run?.node?.id, source=sourceId ? nodes.find(n=>n.id===sourceId) : null;
    const targetsCurrent=()=>canvas?.id===originCanvas && validResult() && findPendingTask(taskId)?.pending===found.pending &&
        (!window.CanvasSession?.enabled || ((!found.out || nodes.includes(found.out)) && (!sourceId || Boolean(source && nodes.includes(source)))));
    if(activeCanvasTaskPolls.has(taskId)) return 'running';
    activeCanvasTaskPolls.add(taskId);
    try {
        while(true){
            if(!targetsCurrent())return 'paused';
            inputBinding?.check();
            const cascadeTargetId = String(options?.cascadeTargetId || found?.pending?.cascadeTargetId || '');
            if(cascadeTargetId) ensureCascadeActive(cascadeTargetId);
            const res = await window.CanvasApi.getCanvasImageTaskRequest(taskId, {transport:cascadeFetch, transportOptions:{cascadeTargetId}});
            if(!res.ok){
                if(res.status === 404) throw new Error(cascadeBackendRestartMessage());
                throw new Error(await responseErrorMessage(res, tr('canvas.generationFailed')));
            }
            const data = await res.json();
            if(!targetsCurrent() ||
                (window.CanvasSession?.enabled && data.canvas_edit_generation!==window.MemberCanvasEdit.active.lease.generation)) return 'paused';
            inputBinding?.verify(data,taskId);
            if(data.status === 'succeeded'){
                if(inputBinding)inputBinding.apply(data,()=>completeCanvasImageTask(taskId,data.result||{}),taskId);
                else completeCanvasImageTask(taskId, data.result || {});
                return 'succeeded';
            }
            if((data.status === 'failed' || data.status === 'needs_review' || data.status === 'cancelled')){
                const fail=()=>failCanvasImageTask(taskId,data.error||tr('canvas.generationFailed'),data);
                if(inputBinding)inputBinding.mutate(fail);else fail();
                return 'failed';
            }
            await sleep(1800);
        }
    } catch(err) {
        if(inputBinding){try{inputBinding.check();}catch(_){return 'paused';}}
        if(err?.resultPending || !targetsCurrent()) return 'paused';
        const message = normalizeCanvasTaskError(err, tr('canvas.generationFailed'));
        if(isCascadeAbortError(err)) return 'aborted';
        failCanvasImageTask(taskId, message);
        return 'failed';
    } finally {
        activeCanvasTaskPolls.delete(taskId);
    }
}

async function waitCanvasImageTaskResult(taskId, options={}){
    if(!taskId) throw new Error(tr('canvas.generationFailed'));
    while(true){
        options.inputBinding?.check();
        const cascadeTargetId = cascadeTargetIdFromOptions(options);
        if(cascadeTargetId) ensureCascadeActive(cascadeTargetId);
        const res = await window.CanvasApi.getCanvasImageTaskRequest(taskId, {transport:cascadeFetch, transportOptions:{cascadeTargetId}});
        if(!res.ok){
            if(res.status === 404) throw new Error(cascadeBackendRestartMessage());
            throw new Error(await responseErrorMessage(res, tr('canvas.generationFailed')));
        }
        const data = await res.json();
        options.inputBinding?.verify(data,taskId);
        if(options.inputBinding && data.canvas_edit_generation!==window.MemberCanvasEdit?.active?.lease?.generation)throw options.inputBinding.pause();
        if(data.status === 'succeeded') return options.returnRecord ? data : data.result || {};
        if((data.status === 'failed' || data.status === 'needs_review' || data.status === 'cancelled')) throw new Error(data.error || tr('canvas.generationFailed'));
        await sleep(1800);
    }
}

function completeCanvasImageTask(taskId, result){
    if(window.CanvasSession?.enabled && !window.MemberCanvasEdit?.canEdit) return;
    const found = findPendingTask(taskId);
    if(!found) return;
    const {out, pending} = found;
    pending.run = {...pending.run, canvasTaskId:taskId};
    const meta = {
        runMs: nowMs() - Number(pending.startedAt || nowMs()),
        run: pending.run || {},
    };
    meta.run.request = requestMetaFromResult(result);
    const images = result.images || [];
    out._pending = (out._pending || []).filter(p => p.id !== pending.id);
    appendOutputImages(out, images, meta.run?.refs?.[0], [meta]);
    const gen = nodes.find(n => n.id === meta.run?.node?.id);
    if(gen){
        mergeGeneratedOutputs(gen, images, Boolean(pending.appendGenerated));
        gen.runStatus = 'done';
        gen.runError = '';
        gen.running = false;
    }
    addGenerationLog({run:meta.run, outputs:images, runMs:meta.runMs || 0});
    refreshRunNodes(gen, out);
    scheduleSave();
}

function failCanvasImageTask(taskId, message, taskData={}){
    if(window.CanvasSession?.enabled && !window.MemberCanvasEdit?.canEdit) return;
    const found = findPendingTask(taskId);
    if(!found) return;
    const {out, pending} = found;
    pending.run = {...pending.run, canvasTaskId:taskId};
    const run = pending.run || {};
    const runMs = nowMs() - Number(pending.startedAt || nowMs());
    const recoverTaskId = taskData?.upstream_task_id || taskData?.task_id || extractUpstreamTaskId(message);
    const gen = nodes.find(n => n.id === run?.node?.id);
    if(recoverTaskId){
        pending.failed = true;
        pending.querying = false;
        pending.error = message || tr('canvas.generationFailed');
        pending.recoverTaskId = recoverTaskId;
        pending.providerId = taskData?.provider_id || pending.providerId || providerIdForPending(pending);
        pending.canvasTaskStatus = 'failed';
        if(gen){
            gen.runStatus = 'failed';
            gen.runError = pending.error;
            if(pending?.cascadeTargetId) gen._cascadeFailed = true;
            gen.running = false;
        }
        addGenerationLog({run, outputs:[], runMs, error:pending.error});
        refreshRunNodes(gen, out);
        scheduleSave();
        return;
    }
    out._pending = (out._pending || []).filter(p => p.id !== pending.id);
    if(gen){
        gen.runStatus = 'failed';
        gen.runError = message || tr('canvas.generationFailed');
        if(pending?.cascadeTargetId) gen._cascadeFailed = true;
        gen.running = false;
    }
    addGenerationLog({run, outputs:[], runMs, error:message || tr('canvas.generationFailed')});
    refreshRunNodes(gen, out);
    scheduleSave();
}

function videoOutputsFromResult(result){
    return resultMediaUrls(result).map(item => {
        const url = outputUrlValue(item);
        const media = item && typeof item === 'object' ? {...item, url, kind:item.kind || 'video'} : {url, kind:'video'};
        return {...media, ...window.VolcengineVideoBilling?.metadata(result)};
    }).filter(item => item.url);
}

function completeCanvasVideoTask(taskId, result){
    if(window.CanvasSession?.enabled && !window.MemberCanvasEdit?.canEdit) return;
    const found = findPendingTask(taskId);
    if(!found) return;
    const {out, pending} = found;
    pending.run = {...pending.run, canvasTaskId:taskId};
    const meta = {
        runMs: nowMs() - Number(pending.startedAt || nowMs()),
        run: pending.run || {},
        kind: 'video',
    };
    meta.run.request = requestMetaFromResult(result);
    Object.assign(meta.run, window.VolcengineVideoBilling?.metadata(result));
    const outputs = videoOutputsFromResult(result);
    out._pending = (out._pending || []).filter(p => p.id !== pending.id);
    appendOutputImages(out, outputs, meta.run?.refs?.[0], [meta]);
    const gen = nodes.find(n => n.id === meta.run?.node?.id);
    if(gen){
        mergeGeneratedOutputs(gen, outputs, Boolean(pending.appendGenerated));
        gen.runStatus = outputs.length ? 'done' : 'failed';
        gen.runError = outputs.length ? '' : tr('canvas.videoFailed');
        gen.running = false;
    }
    addGenerationLog({run:meta.run, outputs, runMs:meta.runMs || 0, error:outputs.length ? '' : tr('canvas.videoFailed')});
    refreshRunNodes(gen, out);
    scheduleSave();
}

function failCanvasVideoTask(taskId, message, taskData={}){
    if(window.CanvasSession?.enabled && !window.MemberCanvasEdit?.canEdit) return;
    const found = findPendingTask(taskId);
    if(!found) return;
    const {out, pending} = found;
    pending.run = {...pending.run, canvasTaskId:taskId};
    const run = pending.run || {};
    Object.assign(run, window.VolcengineVideoBilling?.metadata(taskData.result || {}));
    if(taskData.result) run.request = requestMetaFromResult(taskData.result);
    const runMs = nowMs() - Number(pending.startedAt || nowMs());
    const gen = nodes.find(n => n.id === run?.node?.id);
    out._pending = (out._pending || []).filter(p => p.id !== pending.id);
    if(gen){
        gen.runStatus = 'failed';
        gen.runError = message || tr('canvas.videoFailed');
        if(pending?.cascadeTargetId) gen._cascadeFailed = true;
        gen.running = false;
    }
    addGenerationLog({run, outputs:[], runMs, error:message || tr('canvas.videoFailed')});
    refreshRunNodes(gen, out);
    scheduleSave();
}

async function pollCanvasVideoTask(taskId, options={}){
    if(!taskId) return 'failed';
    const originCanvas=canvas?.id, validResult=window.CanvasTaskResults?.capture() || (()=>!window.CanvasSession?.enabled);
    if(!validResult()) return 'paused';
    const found=findPendingTask(taskId);
    if(!found)return 'missing';
    const inputBinding=classicPendingInputBinding(found,options);
    if(window.CanvasSession?.enabled && !inputBinding)return 'paused';
    const sourceId=found.pending.run?.node?.id, source=sourceId ? nodes.find(n=>n.id===sourceId) : null;
    const targetsCurrent=()=>canvas?.id===originCanvas && validResult() && findPendingTask(taskId)?.pending===found.pending &&
        (!window.CanvasSession?.enabled || ((!found.out || nodes.includes(found.out)) && (!sourceId || Boolean(source && nodes.includes(source)))));
    const pollKey = `video:${taskId}`;
    if(activeCanvasTaskPolls.has(pollKey)) return 'running';
    activeCanvasTaskPolls.add(pollKey);
    let unavailableSince = 0;
    try {
        while(true){
            if(!targetsCurrent())return 'paused';
            inputBinding?.check();
            const cascadeTargetId = String(options?.cascadeTargetId || found?.pending?.cascadeTargetId || '');
            if(cascadeTargetId) ensureCascadeActive(cascadeTargetId);
            let res;
            try {
                res = await window.CanvasApi.getCanvasVideoTaskRequest(taskId, {transport:cascadeFetch, transportOptions:{cascadeTargetId}});
            } catch(error) {
                if(error?.resultPending || !targetsCurrent())return 'paused';
                inputBinding?.check();
                if(isCascadeAbortError(error)) throw error;
                const retryWindow = canvasTaskPollRetryWindow(0, error);
                if(retryWindow){
                    unavailableSince ||= nowMs();
                    if(nowMs() - unavailableSince < retryWindow){
                        await sleep(2500);
                        continue;
                    }
                }
                throw error;
            }
            if(!targetsCurrent())return 'paused';
            if(!res.ok){
                const retryWindow = canvasTaskPollRetryWindow(res.status);
                if(retryWindow){
                    unavailableSince ||= nowMs();
                    if(nowMs() - unavailableSince < retryWindow){
                        await sleep(2500);
                        continue;
                    }
                }
                if(res.status === 404) throw new Error(cascadeBackendRestartMessage());
                throw new Error(await responseErrorMessage(res, tr('canvas.videoFailed')));
            }
            unavailableSince = 0;
            const data = await res.json();
            if(!targetsCurrent() ||
                (window.CanvasSession?.enabled && data.canvas_edit_generation!==window.MemberCanvasEdit.active.lease.generation)) return 'paused';
            inputBinding?.verify(data,taskId);
            if(data.status === 'succeeded'){
                const result = data.result || {};
                if(!videoOutputsFromResult(result).length){
                    if(inputBinding)inputBinding.apply(data,()=>failCanvasVideoTask(taskId,tr('canvas.videoFailed'),data),taskId);
                    else failCanvasVideoTask(taskId, tr('canvas.videoFailed'), data);
                    return 'failed';
                }
                if(inputBinding)inputBinding.apply(data,()=>completeCanvasVideoTask(taskId,result),taskId);
                else completeCanvasVideoTask(taskId, result);
                return 'succeeded';
            }
            if((data.status === 'failed' || data.status === 'needs_review' || data.status === 'cancelled')){
                const fail=()=>failCanvasVideoTask(taskId,data.error||tr('canvas.videoFailed'),data);
                if(inputBinding)inputBinding.mutate(fail);else fail();
                return 'failed';
            }
            await sleep(2500);
        }
    } catch(err) {
        if(inputBinding){try{inputBinding.check();}catch(_){return 'paused';}}
        if(err?.resultPending || !targetsCurrent()) return 'paused';
        if(isCascadeAbortError(err)) return 'aborted';
        failCanvasVideoTask(taskId, normalizeCanvasTaskError(err, tr('canvas.videoFailed')));
        return 'failed';
    } finally {
        activeCanvasTaskPolls.delete(pollKey);
    }
}

async function waitCanvasVideoTaskResult(taskId, options={}){
    if(!taskId) throw new Error(tr('canvas.videoFailed'));
    let unavailableSince = 0;
    while(true){
        options.inputBinding?.check();
        const cascadeTargetId = cascadeTargetIdFromOptions(options);
        if(cascadeTargetId) ensureCascadeActive(cascadeTargetId);
        let res;
        try {
            res = await window.CanvasApi.getCanvasVideoTaskRequest(taskId, {transport:cascadeFetch, transportOptions:{cascadeTargetId}});
        } catch(error) {
            options.inputBinding?.check();
            if(isCascadeAbortError(error)) throw error;
            const retryWindow = canvasTaskPollRetryWindow(0, error);
            if(retryWindow){
                unavailableSince ||= nowMs();
                if(nowMs() - unavailableSince < retryWindow){
                    await sleep(2500);
                    continue;
                }
            }
            throw error;
        }
        if(!res.ok){
            const retryWindow = canvasTaskPollRetryWindow(res.status);
            if(retryWindow){
                unavailableSince ||= nowMs();
                if(nowMs() - unavailableSince < retryWindow){
                    await sleep(2500);
                    continue;
                }
            }
            if(res.status === 404) throw new Error(cascadeBackendRestartMessage());
            throw new Error(await responseErrorMessage(res, tr('canvas.videoFailed')));
        }
        unavailableSince = 0;
        const data = await res.json();
        options.inputBinding?.verify(data,taskId);
        if(options.inputBinding && data.canvas_edit_generation!==window.MemberCanvasEdit?.active?.lease?.generation)throw options.inputBinding.pause();
        if(data.status === 'succeeded') return options.returnRecord ? data : data.result || {};
        if((data.status === 'failed' || data.status === 'needs_review' || data.status === 'cancelled')){
            const error = new Error(data.error || tr('canvas.videoFailed'));
            error.videoResult = data.result;
            throw error;
        }
        await sleep(2500);
    }
}

function resumeCanvasImageTasks(){
    nodes.filter(n => n.type === 'output').forEach(out => {
        (out._pending || []).forEach(p => {
            if(p.canvasTaskType === 'online-image' && p.canvasTaskId && !p.failed && !p.paused) pollCanvasImageTask(p.canvasTaskId, {cascadeTargetId:p.cascadeTargetId || ''});
            if(p.canvasTaskType === 'video' && p.canvasTaskId && !p.failed && !p.paused) pollCanvasVideoTask(p.canvasTaskId, {cascadeTargetId:p.cascadeTargetId || ''});
        });
    });
}

function resumePendingAfterCascadeStop(pending){
    if(!pending?.canvasTaskId) return;
    pending.cascadeTargetId = '';
    if(pending.canvasTaskType === 'online-image') pollCanvasImageTask(pending.canvasTaskId);
    if(pending.canvasTaskType === 'video') pollCanvasVideoTask(pending.canvasTaskId);
}

function appendOutputImages(out, images, compareRef, metas=[], layout=null){
    const list = (images || []).filter(Boolean);
    if(!out || !list.length) return;
    if(layout?.type === 'grid-split'){
        out.images = [];
        out.outputLayout = layout;
    } else if(out.outputLayout) {
        delete out.outputLayout;
    }
    out.images = [...(out.images || []), ...list.map((url, i) => {
        const meta = metas[i] || metas[0] || {};
        const source = url && typeof url === 'object' ? url : {};
        const item = {url:outputUrlValue(url), viewed:false, runMs:meta.runMs || 0, run:meta.run || null};
        if(source.name) item.name = source.name;
        if(source.kind || source.mediaKind) item.kind = source.kind || source.mediaKind;
        if(meta.kind) item.kind = meta.kind;
        if(meta.grid) item.grid = meta.grid;
        return item;
    })];
    if(compareRef?.url){
        out.imageComparisons = out.imageComparisons || {};
        list.forEach(url => {
            out.imageComparisons[url] = {url:compareRef.url, name:compareRef.name || 'input image'};
        });
    }
}

function rerunFromOutputMeta(meta){
    if(!ensureCanvas() || !meta?.run?.nodeType) return;
    const base = JSON.parse(JSON.stringify(meta.run.node || {}));
    const p = defaultPoint(180, 40);
    const node = {...base, id:uid(base.type || meta.run.nodeType), type:meta.run.nodeType, x:p.x, y:p.y, inputs:[], running:false};
    nodes.push(node);
    const prompt = meta.run.prompt || '';
    if(prompt){
        const promptNode = {id:uid('pr'), type:'prompt', x:p.x - 340, y:p.y, text:prompt};
        nodes.push(promptNode);
        connections.push({id:uid('c'), from:promptNode.id, to:node.id});
    }
    (meta.run.refs || []).slice(0, 8).forEach((ref, i) => {
        const imgNode = {id:uid('img'), type:'image', x:p.x - 340, y:p.y + 110 + i * 86, url:ref.url, name:ref.name || 'image'};
        nodes.push(imgNode);
        connections.push({id:uid('c'), from:imgNode.id, to:node.id});
    });
    closeOutputLightbox();
    render();
    scheduleSave();
}
