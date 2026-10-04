/* Classic canvas: Media import/upload, crop, draw, text and grid editing.
 * Browser classic script (not an ES module); loaded before canvas.js.
 * Function declarations only: initialization is explicitly invoked by the entry.
 * Uses the entry's existing shared bindings; do not duplicate permission or document state.
 */

// Called once by canvas.js, at its original initialization position.
function pickMediaForNode(nodeId){
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*,audio/*';
    input.multiple = true;
    input.onchange = () => {
        if(input.files?.length) fillImageNode(nodeId, input.files, {group:input.files.length > 1});
    };
    input.click();
}

async function getImageDimensions(url){
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({width: img.naturalWidth, height: img.naturalHeight});
        img.onerror = () => reject(new Error('图片加载失败'));
        img.src = canvasDisplayMediaUrl(url);
    });
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

function mediaKindForUpload(file){
    const type = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    if(type.startsWith('video/') || /\.(mp4|webm|mov|m4v|avi|mkv)(\?|$)/.test(name)) return 'video';
    if(type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/.test(name)) return 'audio';
    return 'image';
}

function isSupportedUploadFile(file){
    const type = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    return type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/')
        || /\.(png|jpe?g|webp|gif|bmp|avif|mp4|webm|mov|m4v|avi|mkv|mp3|wav|m4a|aac|ogg|flac)(\?|$)/.test(name);
}

function dataTransferItemEntry(item){
    return window.CanvasCore?.dataTransferItemEntry(item) || null;
}

async function filesFromEntry(entry){
    return window.CanvasCore?.filesFromEntry(entry) || [];
}

async function uploadFilesFromDataTransfer(dataTransfer){
    const items = [...(dataTransfer?.items || [])];
    const entries = items.map(dataTransferItemEntry).filter(Boolean);
    const raw = entries.length
        ? (await Promise.all(entries.map(filesFromEntry))).flat()
        : [...(dataTransfer?.files || [])];
    return raw.filter(isSupportedUploadFile);
}

function isRemoteVideoReferenceUrl(url){
    return /^https?:\/\//i.test(String(url || '')) || /^asset:\/\//i.test(String(url || ''));
}

function tempShUploadedUrlForNode(node, url){
    const match = (node?.tempShLinks || []).find(item => item?.source === url && item?.url);
    return match?.url || url;
}

function applyUploadedUrlToRefs(refs, node){
    return (refs || []).map(ref => {
        if(!ref?.url) return ref;
        const url = tempShUploadedUrlForNode(node, ref.url);
        return url && url !== ref.url ? {...ref, url, originalLocalUrl:ref.originalLocalUrl || ref.url} : ref;
    });
}

function manualVideoUrlForNode(node){
    return (node?.manualVideoUrls || []).find(Boolean) || '';
}

function currentCanvasMediaLinks(node){
    const refs = orderedSources(node, generatorSources(node)).flatMap(src => src.refs || [])
        .filter(ref => ref?.url && ['image','video'].includes(mediaKindForRef(ref)));
    return refs.map(ref => {
        const uploaded = tempShUploadedUrlForNode(node, ref.url);
        return uploaded && uploaded !== ref.url ? uploaded : '';
    }).filter(Boolean);
}

function clearManualVideoUrlForNode(node){
    if(!node) return;
    node.manualVideoUrls = [];
    node.tempShLinks = (node.tempShLinks || []).filter(item => item?.manual !== true);
}

function applyTempShUrlToCanvasRef(ref, uploadedUrl){
    if(!ref?.url || !uploadedUrl) return false;
    const source = nodes.find(n => n.id === ref.nodeId);
    if(!source) return false;
    const kind = mediaKindForRef(ref);
    if(source.type === 'image' && source.url === ref.url){
        source.originalLocalUrl = source.originalLocalUrl || source.url;
        source.url = uploadedUrl;
        source.mediaKind = kind;
        return true;
    }
    if(source.type === 'output' && Array.isArray(source.images)){
        const item = Number.isFinite(Number(ref.outputIndex))
            ? source.images[Number(ref.outputIndex)]
            : source.images.find(img => outputUrlValue(img) === ref.url);
        if(item && typeof item === 'object'){
            item.originalLocalUrl = item.originalLocalUrl || outputUrlValue(item);
            item.url = uploadedUrl;
            item.kind = kind;
            return true;
        }
    }
    if(Array.isArray(source.generatedOutputs)){
        const item = source.generatedOutputs.find(img => outputUrlValue(img) === ref.url);
        if(item && typeof item === 'object'){
            item.originalLocalUrl = item.originalLocalUrl || outputUrlValue(item);
            item.url = uploadedUrl;
            item.kind = kind;
            return true;
        }
    }
    return false;
}

async function uploadCanvasMediaRefToCloud(node, ref){
    const kind = mediaKindForRef(ref);
    if(!ref?.url) throw new Error('没有可上传的媒体');
    if(/^https?:\/\//i.test(ref.url)) return ref.url;
    const data = await window.CanvasApi.uploadCloudVideo({url:ref.url, service:'auto'}, {errorFallback:'云端上传失败'});
    const uploadedUrl = data.url || '';
    if(!uploadedUrl) throw new Error('云端没有返回链接');
    node.tempShLinks = [
        ...(node.tempShLinks || []).filter(item => item?.source !== ref.url),
        {source:ref.url, url:uploadedUrl, expires:data.expires || '3 days', kind}
    ];
    applyTempShUrlToCanvasRef(ref, uploadedUrl);
    return uploadedUrl;
}

async function uploadCanvasVideosToCloud(nodeId){
    const node = nodes.find(n => n.id === nodeId);
    if(!node) return [];
    const refs = orderedSources(node, generatorSources(node)).flatMap(src => src.refs || [])
        .filter(ref => ref?.url && ['image','video'].includes(mediaKindForRef(ref)));
    const localRefs = refs.filter(ref => ref?.url && !isRemoteVideoReferenceUrl(ref.url));
    if(!localRefs.length){
        showErrorModal('没有需要上传的本地图片或视频', '上传云端');
        return [];
    }
    node.tempShUploading = true;
    refreshNodes([node.id]);
    try {
        const urls = [];
        for(const ref of localRefs){
            urls.push(await uploadCanvasMediaRefToCloud(node, ref));
        }
        node.tempShUploading = false;
        refreshNodes([node.id, ...localRefs.map(ref => ref.nodeId).filter(Boolean)]);
        scheduleSave();
        await copyTextToClipboard(urls[0]);
        showErrorModal(`已上传 ${urls.length} 个媒体文件到云端，首个链接已复制。链接约 3 天有效。`, '上传云端');
        return urls;
    } catch(e) {
        node.tempShUploading = false;
        refreshNodes([node.id]);
        throw e;
    }
}

function applyManualVideoUrlToCanvasRef(node, ref, manualUrl){
    clearManualVideoUrlForNode(node);
    node.manualVideoUrls = [manualUrl];
    if(ref?.url) node.tempShLinks = [...(node.tempShLinks || []), {source:ref.url, url:manualUrl, manual:true}];
}

async function setCanvasManualVideoUrl(nodeId){
    const node = nodes.find(n => n.id === nodeId);
    if(!node) return '';
    const refs = orderedSources(node, generatorSources(node)).flatMap(src => src.refs || [])
        .filter(ref => ref?.url && ['image','video'].includes(mediaKindForRef(ref)));
    const firstLocal = refs.find(ref => ref?.url && !isRemoteVideoReferenceUrl(ref.url));
    const firstAny = firstLocal || refs[0] || null;
    const current = manualVideoUrlForNode(node) || currentCanvasMediaLinks(node)[0] || (firstAny ? tempShUploadedUrlForNode(node, firstAny.url) : '');
    const value = prompt('输入媒体网址 / 火山素材 URI', isRemoteVideoReferenceUrl(current) ? current : '');
    if(value === null) return '';
    const url = String(value || '').trim();
    if(!url){
        clearManualVideoUrlForNode(node);
        refreshGeneratorInputViews([node.id]);
        refreshGeometryAfterLayout();
        scheduleSave();
        showErrorModal('已清除手动网址。', '输入网址');
        return '';
    }
    if(!isRemoteVideoReferenceUrl(url)){
        showErrorModal('请输入 http/https 媒体网址或 asset:// 火山素材 URI', '输入网址');
        return '';
    }
    applyManualVideoUrlToCanvasRef(node, firstAny, url);
    refreshGeneratorInputViews([node.id]);
    refreshGeometryAfterLayout();
    scheduleSave();
    showErrorModal('已设置视频网址。', '输入网址');
    return url;
}

function audioRefsOnly(refs){
    return (refs || []).filter(ref => ref?.url && mediaKindForRef(ref) === 'audio');
}

function mediaKindForNode(node){
    if(node?.mediaKind) return node.mediaKind;
    if(isVideoUrl(node?.url)) return 'video';
    if(isAudioUrl(node?.url)) return 'audio';
    return 'image';
}

function nodeTitleForMedia(node){
    const kind = mediaKindForNode(node);
    if(kind === 'video') return 'Video';
    if(kind === 'audio') return 'Audio';
    return 'Image';
}

function dropDataTypes(dataTransfer){
    return [...(dataTransfer?.types || [])].map(type => String(type || ''));
}

function readDropData(dataTransfer, type){
    try { return dataTransfer?.getData?.(type) || ''; } catch(_) { return ''; }
}

function decodeDropText(value){
    const text = String(value || '').trim();
    if(!text) return '';
    try { return decodeURIComponent(text); } catch(_) { return text; }
}

function imageDropTextFragments(value){
    const text = String(value || '').trim();
    if(!text) return [];
    const fragments = [];
    if(/<img|<a\s/i.test(text)){
        const doc = new DOMParser().parseFromString(text, 'text/html');
        doc.querySelectorAll('img[src],a[href]').forEach(el => fragments.push(el.getAttribute('src') || el.getAttribute('href') || ''));
    }
    text.split(/\r?\n/).forEach(line => {
        const item = line.trim();
        if(item) fragments.push(item);
    });
    const downloadUrl = text.match(/^image\/[^\s:]+:(.+)$/i);
    if(downloadUrl) fragments.push(downloadUrl[1]);
    return fragments;
}

function uniqueValues(values){
    const seen = new Set();
    return values.filter(value => {
        const key = String(value || '').trim();
        if(!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function dropTextCandidates(dataTransfer){
    if(!dataTransfer) return [];
    const types = uniqueValues([...IMAGE_DROP_TEXT_TYPES, ...dropDataTypes(dataTransfer)]);
    const values = types.map(type => readDropData(dataTransfer, type)).filter(Boolean);
    return uniqueValues(values.flatMap(imageDropTextFragments).map(decodeDropText))
        .filter(s => s && !s.startsWith('#'));
}

function isRemoteImageDropValue(value){
    const text = String(value || '').trim();
    return /^https?:\/\/.+/i.test(text) || /^data:image\//i.test(text) || /^blob:/i.test(text);
}

function isLocalImageDropValue(value){
    const text = String(value || '').trim();
    if(!text) return false;
    let path = text;
    if(/^file:/i.test(path)){
        try {
            const url = new URL(path);
            if(url.protocol !== 'file:') return false;
            path = decodeURIComponent(url.pathname || path);
        } catch(_) {
            return false;
        }
    }
    if(/^\/[a-zA-Z]:[\\/]/.test(path)) path = path.slice(1);
    const clean = path.split(/[?#]/, 1)[0];
    const isWindowsPath = /^[a-zA-Z]:[\\/]/.test(clean);
    const isPosixPath = clean.startsWith('/');
    return (isWindowsPath || isPosixPath) && IMAGE_DROP_EXT_RE.test(clean);
}

function imageFilesFromDataTransfer(dataTransfer){
    return [...(dataTransfer?.files || [])].filter(isSupportedUploadFile);
}

function localImagePathsFromDataTransfer(dataTransfer){
    return uniqueValues(dropTextCandidates(dataTransfer).filter(isLocalImageDropValue));
}

function imageUrlFromDataTransfer(dataTransfer){
    return dropTextCandidates(dataTransfer).find(isRemoteImageDropValue) || '';
}

function imageDropPayload(dataTransfer){
    const files = imageFilesFromDataTransfer(dataTransfer);
    if(files.length) return {type:'files', files};
    const localPaths = localImagePathsFromDataTransfer(dataTransfer);
    if(localPaths.length) return {type:'localPaths', localPaths};
    const url = imageUrlFromDataTransfer(dataTransfer);
    if(url) return {type:'url', url};
    return {type:'none'};
}

async function resolveImageDropPayload(dataTransfer){
    const payload = imageDropPayload(dataTransfer);
    if(payload.type !== 'none') return payload;
    if(hasImageFiles(dataTransfer?.items)){
        const files = await uploadFilesFromDataTransfer(dataTransfer);
        if(files.length) return {type:'files', files};
    }
    return payload;
}

async function importLocalImages(paths){
    if(!paths?.length) return [];
    const response = await fetch('/api/ai/import-local-image', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({paths})
    });
    if(!response.ok) throw new Error(await responseErrorMessage(response, '导入本地图片失败'));
    const data = await response.json();
    return data.files || [];
}

function layoutUploadedMediaNodes(created, base){
    const list = [...(created || [])];
    if(!list.length) return;
    const cols = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(list.length))));
    const gapX = 280;
    const gapY = 250;
    const startX = base.x - ((cols - 1) * gapX) / 2;
    list.forEach((node, i) => {
        node.x = startX + (i % cols) * gapX;
        node.y = base.y + Math.floor(i / cols) * gapY;
    });
}

function createGroupForUploadedNodes(created, point){
    const targets = [...(created || [])].filter(n => n?.type === 'image');
    if(targets.length < 2) return null;
    render();
    const box = nodeBounds(targets.map(n => n.id));
    const fallback = point || defaultPoint(0, 0);
    const group = {
        id:uid('grp'),
        type:'group',
        x:Number.isFinite(box.x) ? box.x - 24 : fallback.x - 24,
        y:Number.isFinite(box.y) ? box.y - 58 : fallback.y - 58,
        w:Number.isFinite(box.w) ? box.w + 48 : 600,
        h:Number.isFinite(box.h) ? box.h + 90 : 420,
        items:targets.map(n => n.id)
    };
    nodes.push(group);
    selected.clear();
    selected.add(group.id);
    return group;
}

async function uploadMediaFiles(files, point, onlyImages=false, opts={}){
    if(!ensureCanvas()) return;
    const supported = [...files].filter(file => {
        const kind = mediaKindForUpload(file);
        return onlyImages ? kind === 'image' : ['image','video','audio'].includes(kind);
    });
    if(!supported.length) return [];
    const form = new FormData();
    supported.forEach(file => form.append('files', file));
        const data = await window.CanvasApi.uploadAi(form);
    const base = point || screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
    const created = [];
    (data.files || []).forEach((file, i) => {
        const kind = file.kind || mediaKindForUpload(supported[i]);
        const node = {
            id:uid('img'),
            type:'image',
            x:base.x + i * 36,
            y:base.y + i * 36,
            url:file.url,
            name:file.name,
            mediaKind:kind
        };
        nodes.push(node);
        created.push(node);
    });
    if(opts.group && created.length > 1){
        layoutUploadedMediaNodes(created, base);
        created.group = createGroupForUploadedNodes(created, base);
    }
    render();
    scheduleSave();
    return created;
}

async function uploadImages(files, point){
    return uploadMediaFiles(files, point, false);
}

async function uploadImageGroup(files, point){
    return uploadMediaFiles(files, point, false, {group:true});
}

function createImageCardFromUrl(url, point, name='image', opts={}){
    if(!ensureCanvas() || !url) return;
    const p = point || defaultPoint(0, 0);
    const explicitKind = String(opts.mediaKind || opts.kind || '').toLowerCase();
    const mediaKind = ['image','video','audio'].includes(explicitKind)
        ? explicitKind
        : isVideoUrl(url) ? 'video' : isAudioUrl(url) ? 'audio' : 'image';
    const node = {id:uid('img'), type:'image', x:p.x, y:p.y, url, name:name || outputImageName(url), mediaKind};
    if(opts.asset_uris && typeof opts.asset_uris === 'object') node.asset_uris = opts.asset_uris;
    if(opts.asset_item_id) node.asset_item_id = opts.asset_item_id;
    if(opts.asset_library_id) node.asset_library_id = opts.asset_library_id;
    nodes.push(node);
    // Library drops add one unconnected node. Keep existing editors, images
    // and video playback mounted instead of rebuilding the entire canvas.
    const element = isNodeInCanvasViewport(node, 400) ? renderNode(node) : renderNodePlaceholder(node);
    nodesEl.appendChild(element);
    refreshGeometry([node.id]);
    refreshGeometryAfterLayout([node.id]);
    refreshIcons();
    bindCanvasPreviewImageFallbacks(element);
    scheduleSave();
}

async function createImageCardsFromLocalPaths(paths, point){
    if(!ensureCanvas()) return [];
    setStatus('导入图片...');
    try {
        const files = await importLocalImages(paths);
        const base = point || screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
        const created = [];
        files.forEach((file, i) => {
            const node = {id:uid('img'), type:'image', x:base.x + i * 36, y:base.y + i * 36, url:file.url, name:file.name, mediaKind:'image'};
            nodes.push(node);
            created.push(node);
        });
        render();
        scheduleSave();
        setStatus('Ready');
        return created;
    } catch(err) {
        setStatus('Ready');
        throw err;
    }
}

async function applyImageDropPayloadToBoard(payload, point){
    if(payload.type === 'files'){
        if(payload.files.length > 1) return uploadImageGroup(payload.files, point);
        return uploadImages(payload.files, point);
    }
    if(payload.type === 'localPaths') return createImageCardsFromLocalPaths(payload.localPaths, point);
    if(payload.type === 'url') {
        createImageCardFromUrl(payload.url, point, outputImageName(payload.url));
        return [];
    }
    return [];
}

async function applyImageDropPayloadToNode(nodeId, payload){
    const node = nodes.find(n => n.id === nodeId);
    if(!node || node.type !== 'image') return;
    if(payload.type === 'files') {
        await fillImageNode(nodeId, payload.files, {group:payload.files.length > 1});
        return;
    }
    if(payload.type === 'localPaths') {
        const files = await importLocalImages(payload.localPaths);
        const file = files[0];
        if(file?.url) {
            pushUndo();
            clearCanvasFaceAuth(node);
            node.url = file.url;
            node.name = file.name || outputImageName(file.url);
            node.mediaKind = 'image';
            render();
            scheduleSave();
        }
        return;
    }
    if(payload.type === 'url' && payload.url){
        pushUndo();
        clearCanvasFaceAuth(node);
        node.url = payload.url;
        node.name = outputImageName(payload.url);
        node.mediaKind = isVideoUrl(payload.url) ? 'video' : isAudioUrl(payload.url) ? 'audio' : 'image';
        render();
        scheduleSave();
    }
}

function allowImageNodeDropEvent(e, highlightEl){
    if(hasImageDropData(e.dataTransfer) || hasOutputImageDrag(e.dataTransfer) || Array.from(e.dataTransfer?.types || []).includes('application/x-canvas-asset')){
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        highlightEl?.classList.add('drag-over');
        dropOverlay.classList.remove('active');
    }
}

function clearImageNodeDropState(e, highlightEl){
    e.preventDefault();
    e.stopPropagation();
    highlightEl?.classList.remove('drag-over');
    dropOverlay.classList.remove('active');
}

async function handleImageNodeDropEvent(e, nodeId, highlightEl){
    if(hasOutputImageDrag(e.dataTransfer)){
        clearImageNodeDropState(e, highlightEl);
        setImageNodeFromOutput(nodeId, e.dataTransfer.getData('application/x-canvas-output-image'));
        return;
    }
    const payload = await resolveImageDropPayload(e.dataTransfer);
    clearImageNodeDropState(e, highlightEl);
    if(payload.type === 'none') return;
    try {
        await applyImageDropPayloadToNode(nodeId, payload);
    } catch(err) {
        setStatus('Ready');
        showErrorModal(err.message || ('导入图片失败'), '导入图片失败');
    }
}

async function fillImageNode(nodeId, files, opts={}){
    if(!ensureCanvas()) return;
    const imgs = [...files].filter(file => ['image','video','audio'].includes(mediaKindForUpload(file)));
    if(!imgs.length) return;
    if(opts.group && imgs.length > 1){
        const source = nodes.find(n => n.id === nodeId);
        pushUndo();
        const point = source ? {x:Number(source.x || 0), y:Number(source.y || 0)} : defaultPoint(0, 0);
        const outgoing = connections.filter(c => c.from === source?.id).map(c => c.to);
        const incoming = connections.filter(c => c.to === source?.id).map(c => c.from);
        const created = await uploadImageGroup(imgs, point);
        const group = created?.group;
        if(source && created?.length > 1){
            nodes = nodes.filter(n => n.id !== source.id);
            connections = connections.filter(c => c.from !== source.id && c.to !== source.id);
            if(group){
                outgoing.forEach(toId => {
                    if(canConnect(group.id, toId) && !connections.some(c => c.from === group.id && c.to === toId)){
                        connections.push({id:uid('c'), from:group.id, to:toId});
                    }
                });
                incoming.forEach(fromId => {
                    if(canConnect(fromId, group.id) && !connections.some(c => c.from === fromId && c.to === group.id)){
                        connections.push({id:uid('c'), from:fromId, to:group.id});
                    }
                });
            }
            selected.delete(source.id);
            render();
            scheduleSave();
        }
        return;
    }
    const form = new FormData();
    form.append('files', imgs[0]);
    const data = await window.CanvasApi.uploadAi(form);
    const file = data.files?.[0];
    const node = nodes.find(n => n.id === nodeId);
    if(file && node){
        clearCanvasFaceAuth(node);
        node.url = file.url;
        node.name = file.name;
        node.mediaKind = file.kind || mediaKindForUpload(imgs[0]);
        render();
        scheduleSave();
    }
}

function setImageNodeFromOutput(nodeId, url){
    const node = nodes.find(n => n.id === nodeId);
    if(!node || node.type !== 'image' || !url || isVideoUrl(url) || isAudioUrl(url)) return;
    pushUndo();
    clearCanvasFaceAuth(node);
    node.url = url;
    node.name = outputImageName(url);
    node.mediaKind = 'image';
    render();
    scheduleSave();
}

function clearCanvasFaceAuth(node){
    delete node.asset_uris;
    delete node.asset_item_id;
    delete node.asset_library_id;
    delete node.face_auth_status;
}

function clearImageNode(nodeId, event=null){
    if(event){
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
    }
    const node = nodes.find(n => n.id === nodeId);
    if(!node || node.type !== 'image') return;
    pushUndo();
    clearCanvasFaceAuth(node);
    node.url = '';
    node.mediaKind = 'image';
    node.name = '空白图片';
    render();
    scheduleSave();
}

function pickImageForNode(nodeId){
    pickMediaForNode(nodeId);
}

function createClassicImageEditor(){
    // The entry owns nodes, viewport and canvas history; this closure owns only
    // the image-editing draft, its local history, DOM and session resources.
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
    let gridCustomLines = []; // [{type:'h'|'v', pos:0-1}] 相对图片尺寸的分数位置
    let gridCustomOrientation = 'h'; // 当前点击放置方向
    let gridCustomHistory = []; // 撤销栈：每次放线前快照
    let gridCustomDrag = null; // {index, pointerId}
    let imageEditZoom = 1.0;
    let imageEditBaseW = 0; // zoom=1 时图片显示宽度
    let imageEditBaseH = 0;
    const MASK_BRUSH_ALPHA = 115;
    const MASK_BRUSH_COLOR = `rgba(255,255,255,${MASK_BRUSH_ALPHA / 255})`;

    let target = null, generation = 0, ready = false, paused = false, destroyed = false;
    let inlineFocusFrame = null;
    const dom = new Map(), listeners = new Map();
    function modal(){ return element('imageEditModal'); }
    function element(id){
        if(destroyed) return null;
        if(!dom.has(id)) dom.set(id, document.getElementById(id));
        return dom.get(id);
    }
    function validTarget(){
        return Boolean(target && canvas?.id === target.canvasId &&
            (nodes[target.nodeIndex] === target.node || nodes.includes(target.node)) && target.node.url === target.sourceUrl);
    }
    function usable(){ return !destroyed && !paused && ready && !!cropState && validTarget(); }
    function capture(){ return {generation, canvasId:target?.canvasId, node:target?.node}; }
    function accept(origin){
        return !destroyed && !paused && origin.generation === generation && origin.canvasId === target?.canvasId && origin.node === target?.node && validTarget();
    }
    function clearListeners(scope){
        for(const [node,type,handler,options] of listeners.get(scope) || []) node.removeEventListener(type,handler,options);
        listeners.delete(scope);
    }
    function listen(scope,node,type,handler,options,allowLoading=false){
        if(!node) return;
        const guarded = scope === 'lifecycle' ? handler : event => {
            if(cropState && !validTarget()) implCloseImageEditor();
            if(usable() || (allowLoading && !destroyed && !paused && cropState && validTarget())) handler(event);
        };
        node.addEventListener(type,guarded,options);
        if(!listeners.has(scope)) listeners.set(scope,[]);
        listeners.get(scope).push([node,type,guarded,options]);
    }
    function cancelInlineFocus(){
        if(inlineFocusFrame !== null) cancelAnimationFrame(inlineFocusFrame);
        inlineFocusFrame = null;
    }
    function cancelGestures(){
        clearListeners('drag');
        cancelInlineFocus();
        for(const [el,state] of [[implEditDrawCanvas(), editDrawState || gridCustomDrag], [implEditTextCanvas(), editTextDrag]]){
            if(state?.pointerId != null && el?.hasPointerCapture?.(state.pointerId)) el.releasePointerCapture(state.pointerId);
        }
        cropDrag = editDrawState = editTextDrag = gridCustomDrag = null;
        element('cropCanvas')?.classList.remove('dragging-image');
        for(const el of [implEditDrawCanvas(), implEditTextCanvas()]) if(el) el.style.cursor = '';
    }
    function pause(){
        if(destroyed || paused) return;
        // A cached page retains the draft, but pending applications lose their session.
        generation++;
        implRemoveEditTextInlineEditor(true);
        cancelGestures();
        clearListeners('controls');
        window.CanvasMediaLoader?.unwatch(element('cropImage'));
        paused = true;
    }
    function resume(){
        if(destroyed || !paused) return;
        paused = false;
        if(cropState && !validTarget()) implCloseImageEditor();
        implBindClassicImageEditorControls();
        if(cropState && !ready){
            const id = target.node.id, mode = imageEditMode;
            implOpenImageEditor(id, mode);
        } else if(cropState){
            implSyncImageEditOverflow();
        }
    }
    function destroy(){
        if(destroyed) return;
        implCloseImageEditor();
        for(const scope of [...listeners.keys()]) clearListeners(scope);
        dom.clear();
        destroyed = true;
    }
    function bind(){
        if(destroyed || paused) return;
        implBindClassicImageEditorControls();
        clearListeners('lifecycle');
        listen('lifecycle',window,'pagehide',event => event.persisted ? pause() : destroy());
        listen('lifecycle',window,'pageshow',event => { if(event.persisted) resume(); });
    }
    function implBindClassicImageEditorControls(){
        if(destroyed || paused) return;
        clearListeners('controls');
        listen('controls', element('cropBox'), 'mousedown', event => implBeginCropDrag(event, 'move'));
        listen('controls', element('cropHandle'), 'mousedown', event => implBeginCropDrag(event, 'resize'));
        listen('controls', element('outpaintFrame'), 'mousedown', event => {
            if(event.target.closest('[data-outpaint-handle]')) return;
            element('cropCanvas')?.classList.add('dragging-image');
            implBeginCropDrag(event, 'image');
        });
        modal().querySelectorAll('[data-outpaint-handle]').forEach(handle => {
            listen('controls', handle, 'mousedown', event => implBeginCropDrag(event, `outpaint-${handle.dataset.outpaintHandle || 'corner'}`));
        });
        listen('controls', element('cropImage'), 'mousedown', event => {
            if(imageEditMode !== 'outpaint' || !cropState) return;
            element('cropCanvas')?.classList.add('dragging-image');
            implBeginCropDrag(event, 'image');
        });
        modal().querySelectorAll('[data-image-edit-mode]').forEach(btn => {
            listen('controls', btn, 'click', event => {
                event.stopPropagation();
                implSetImageEditMode(btn.dataset.imageEditMode || 'crop', true);
            }, undefined, true);
        });
        listen('controls', element('editDrawCanvas'), 'pointerdown', implBeginEditDraw);
        listen('controls', element('editDrawCanvas'), 'pointermove', implMoveEditDraw);
        listen('controls', element('editDrawCanvas'), 'pointerup', implEndEditDraw);
        listen('controls', element('editDrawCanvas'), 'pointercancel', implEndEditDraw);
        listen('controls', element('editDrawCanvas'), 'pointerleave', implEndEditDraw);
        listen('controls', element('editTextCanvas'), 'pointerdown', implBeginEditText);
        listen('controls', element('editTextCanvas'), 'pointermove', implMoveEditText);
        listen('controls', element('editTextCanvas'), 'pointerup', implEndEditText);
        listen('controls', element('editTextCanvas'), 'pointercancel', implEndEditText);
        listen('controls', element('editTextCanvas'), 'pointerleave', implEndEditText);
        listen('controls', element('editTextCanvas'), 'dblclick', event => {
            if(imageEditMode !== 'brush' || brushTool !== 'text') return;
            event.preventDefault();
            event.stopPropagation();
            const hit = implHitEditTextItem(implEditTextPoint(event));
            if(hit){
                implSetSelectedEditTextItem(hit.id);
                implBeginEditTextInline(hit);
            }
        });
        ['paintBrushSize','paintBrushColor'].forEach(id => {
            const control = element(id);
            if(!control) return;
            listen('controls', control, 'input', implSyncSelectedEditTextStyleFromBrush);
            listen('controls', control, 'change', () => { editTextDirty = false; });
        });
        ['gridHorizontalLines','gridVerticalLines','gridGapSize'].forEach(id => {
            listen('controls', element(id), 'input', () => {
                implSyncGridGapValue();
                implRefreshGridSplitPreview();
            });
        });
        // 图片编辑区滚轮缩放
        listen('controls', element('imageEditStage'), 'wheel', event => {
            if(!cropState) return;
            event.preventDefault();
            event.stopPropagation();
            const stage = event.currentTarget;
            const oldZoom = imageEditZoom;
            const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
            imageEditZoom = Math.max(0.15, Math.min(6.0, imageEditZoom * factor));
            // 焦点缩放：保持鼠标指向的图片位置不动
            const stageRect = stage.getBoundingClientRect();
            const mx = event.clientX - stageRect.left; // 鼠标在 stage 内偏移
            const my = event.clientY - stageRect.top;
            const contentX = stage.scrollLeft + mx;
            const contentY = stage.scrollTop + my;
            implApplyImageEditZoom();
            const scale = imageEditZoom / oldZoom;
            stage.scrollLeft = contentX * scale - mx;
            stage.scrollTop = contentY * scale - my;
        }, {passive: false});
    }

    function implCropBounds(){
        const img = element('cropImage');
        return {w:img.clientWidth || 1, h:img.clientHeight || 1};
    }

    function implEditDrawCanvas(){
        return element('editDrawCanvas');
    }

    function implEditTextCanvas(){
        return element('editTextCanvas');
    }

    function implEditTextContext(){
        return implEditTextCanvas()?.getContext('2d') || null;
    }

    function implSelectedEditTextItem(){
        return editTextItems.find(item => item.id === editTextSelectedId) || null;
    }

    function implDefaultEditTextText(){
        return '双击编辑';
    }

    function implEditTextSizeFromBrush(){
        return Math.max(14, Math.min(120, Math.round(implEditBrushSize() * 2)));
    }

    function implCreateEditTextItem(text, point, preset={}){
        const size = Math.max(10, Math.min(120, Number(preset.size) || implEditTextSizeFromBrush()));
        return {
            id: uid('txt'),
            text: String(text || implDefaultEditTextText()).trim(),
            x: Number(point?.x || 0),
            y: Number(point?.y || 0),
            color: preset.color || implBrushColor(),
            size,
        };
    }

    function implTextItemFont(item){
        const size = Math.max(10, Math.min(120, Number(item?.size) || 28));
        return `900 ${size}px Arial, sans-serif`;
    }

    function implMeasureEditTextItem(item, ctx=implEditTextContext()){
        if(!item || !ctx) return {x:0, y:0, w:0, h:0};
        const size = Math.max(10, Math.min(120, Number(item.size) || 28));
        ctx.save();
        ctx.font = implTextItemFont(item);
        const metrics = ctx.measureText(String(item.text || ''));
        ctx.restore();
        const width = Math.max(1, metrics.width || 1);
        const ascent = Number.isFinite(metrics.actualBoundingBoxAscent) ? metrics.actualBoundingBoxAscent : size * 0.8;
        const descent = Number.isFinite(metrics.actualBoundingBoxDescent) ? metrics.actualBoundingBoxDescent : size * 0.25;
        const pad = Math.max(4, Math.round(size * 0.18));
        return {
            x: item.x - width / 2 - pad,
            y: item.y - (ascent + descent) / 2 - pad,
            w: width + pad * 2,
            h: ascent + descent + pad * 2,
            textW: width,
            textH: ascent + descent,
            pad
        };
    }

    function implHitEditTextItem(point){
        const ctx = implEditTextContext();
        if(!ctx) return null;
        for(let i = editTextItems.length - 1; i >= 0; i--){
            const item = editTextItems[i];
            const box = implMeasureEditTextItem(item, ctx);
            if(point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h) return item;
        }
        return null;
    }

    function implRenderEditTextCanvas(){
        const canvasEl = implEditTextCanvas();
        const ctx = implEditTextContext();
        if(!canvasEl || !ctx) return;
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        editTextItems.forEach(item => {
            if(!item?.text) return;
            const selected = item.id === editTextSelectedId;
            const box = implMeasureEditTextItem(item, ctx);
            ctx.save();
            ctx.font = implTextItemFont(item);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = item.color || implBrushColor();
            ctx.strokeStyle = 'rgba(255,255,255,.92)';
            ctx.lineWidth = Math.max(2, (Number(item.size) || 28) / 8);
            ctx.strokeText(String(item.text || ''), item.x, item.y);
            ctx.fillText(String(item.text || ''), item.x, item.y);
            if(selected){
                ctx.setLineDash([7, 5]);
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = 'rgba(15,23,42,.72)';
                ctx.strokeRect(box.x, box.y, box.w, box.h);
                ctx.setLineDash([]);
                ctx.fillStyle = 'rgba(15,23,42,.92)';
                ctx.beginPath();
                ctx.arc(item.x + box.w / 2 - box.pad, item.y - box.h / 2 + box.pad, 3.5, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        });
        implPositionEditTextInlineEditor();
    }

    function implSyncTextToolState(force=false){
        const selected = implSelectedEditTextItem();
        const cropCanvasEl = element('cropCanvas');
        cropCanvasEl?.classList.toggle('text-mode', imageEditMode === 'brush' && brushTool === 'text');
    }

    function implSyncSelectedEditTextStyleFromBrush(){
        if(imageEditMode !== 'brush' || brushTool !== 'text' || editTextInlineEditor) return;
        const item = implSelectedEditTextItem();
        if(!item) return;
        const nextSize = implEditTextSizeFromBrush();
        const nextColor = implBrushColor();
        if(item.size === nextSize && item.color === nextColor) return;
        implBeginTextEditChange();
        item.size = nextSize;
        item.color = nextColor;
        implRenderEditTextCanvas();
        implSyncTextToolState(true);
    }

    function implBeginTextEditChange(){
        if(editTextDirty) return;
        implPushEditDrawHistory();
        editTextDirty = true;
    }

    function implSetSelectedEditTextItem(id){
        editTextSelectedId = id || '';
        implRenderEditTextCanvas();
        implSyncTextToolState(true);
    }

    function implConfirmSelectedEditTextItem(){
        const selected = implSelectedEditTextItem();
        if(!selected) return false;
        if(!String(selected.text || '').trim()){
            editTextItems = editTextItems.filter(item => item.id !== selected.id);
        }
        editTextSelectedId = '';
        editTextDrag = null;
        editTextDirty = false;
        implRenderEditTextCanvas();
        implSyncTextToolState(true);
        return true;
    }

    function implEditTextCanvasScale(){
        const canvasEl = implEditTextCanvas();
        const rect = canvasEl?.getBoundingClientRect?.();
        return {
            x:(rect?.width || canvasEl?.width || 1) / Math.max(1, canvasEl?.width || 1),
            y:(rect?.height || canvasEl?.height || 1) / Math.max(1, canvasEl?.height || 1),
            rect
        };
    }

    function implSelectInlineEditorText(el){
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function implInlineEditorText(){
        return String(editTextInlineEditor?.el?.innerText || editTextInlineEditor?.el?.textContent || '').replace(/\u00a0/g, ' ');
    }

    function implAutosizeEditTextInlineEditor(){
        const editor = editTextInlineEditor;
        if(!editor?.el) return;
        const el = editor.el;
        el.style.width = 'auto';
        el.style.height = 'auto';
        const minW = Number(editor.minW || 48);
        const minH = Number(editor.minH || 28);
        el.style.width = `${Math.max(minW, el.scrollWidth + 10)}px`;
        el.style.height = `${Math.max(minH, el.scrollHeight + 4)}px`;
    }

    function implPositionEditTextInlineEditor(){
        const editor = editTextInlineEditor;
        if(!editor?.el) return;
        const item = editTextItems.find(x => x.id === editor.itemId);
        const canvasEl = implEditTextCanvas();
        const cropCanvasEl = element('cropCanvas');
        if(!item || !canvasEl || !cropCanvasEl) return;
        const ctx = implEditTextContext();
        const box = implMeasureEditTextItem(item, ctx);
        const scale = implEditTextCanvasScale();
        const hostRect = cropCanvasEl.getBoundingClientRect();
        const canvasRect = scale.rect || canvasEl.getBoundingClientRect();
        const left = canvasRect.left - hostRect.left + box.x * scale.x;
        const top = canvasRect.top - hostRect.top + box.y * scale.y;
        const w = Math.max(48, box.w * scale.x);
        const h = Math.max(28, box.h * scale.y);
        editor.minW = w;
        editor.minH = h;
        editor.el.style.left = `${left}px`;
        editor.el.style.top = `${top}px`;
        editor.el.style.minWidth = `${w}px`;
        editor.el.style.minHeight = `${h}px`;
        editor.el.style.font = `900 ${Math.max(10, (Number(item.size) || 28) * scale.y)}px Arial, sans-serif`;
        editor.el.style.color = item.color || implBrushColor();
        implAutosizeEditTextInlineEditor();
    }

    function implRemoveEditTextInlineEditor(commit=true){
        const editor = editTextInlineEditor;
        if(!editor) return;
        const item = editTextItems.find(x => x.id === editor.itemId);
        const next = implInlineEditorText().trim();
        editTextInlineEditor = null;
        clearListeners('inline');
        cancelInlineFocus();
        editor.el.remove();
        if(!item) return;
        if(commit){
            if(next !== String(editor.before || '')){
                implBeginTextEditChange();
                if(next){
                    item.text = next;
                } else {
                    editTextItems = editTextItems.filter(x => x.id !== item.id);
                    editTextSelectedId = '';
                }
            }
        } else {
            item.text = editor.before || item.text || implDefaultEditTextText();
        }
        editTextDirty = false;
        implRenderEditTextCanvas();
        implSyncTextToolState(true);
    }

    function implBeginEditTextInline(item){
        if(!item) return;
        implRemoveEditTextInlineEditor(true);
        editTextSelectedId = item.id;
        const host = element('cropCanvas');
        if(!host) return;
        const el = document.createElement('div');
        el.className = 'edit-text-inline';
        el.contentEditable = 'true';
        el.spellcheck = false;
        el.textContent = item.text || implDefaultEditTextText();
        host.appendChild(el);
        editTextInlineEditor = {el, itemId:item.id, before:item.text || ''};
        implPositionEditTextInlineEditor();
        listen('inline', el, 'input', implAutosizeEditTextInlineEditor);
        listen('inline', el, 'keydown', event => {
            if(event.key === 'Enter' && !event.shiftKey){
                event.preventDefault();
                implRemoveEditTextInlineEditor(true);
            } else if(event.key === 'Escape'){
                event.preventDefault();
                implRemoveEditTextInlineEditor(false);
            }
        });
        listen('inline', el, 'blur', () => implRemoveEditTextInlineEditor(true));
        const origin = capture();
        inlineFocusFrame = requestAnimationFrame(() => {
            inlineFocusFrame = null;
            if(!accept(origin) || editTextInlineEditor?.el !== el || !el.isConnected) return;
            el.focus();
            implSelectInlineEditorText(el);
        });
        implRenderEditTextCanvas();
        implSyncTextToolState(true);
    }

    function implEditTextPoint(event){
        return implEditDrawPoint(event);
    }

    function implBeginEditText(event){
        if(imageEditMode !== 'brush' || brushTool !== 'text') return;
        event.preventDefault();
        event.stopPropagation();
        implRemoveEditTextInlineEditor(true);
        const canvasEl = implEditTextCanvas();
        const point = implEditTextPoint(event);
        const hit = implHitEditTextItem(point);
        if(hit){
            editTextSelectedId = hit.id;
            editTextDrag = {
                id: hit.id,
                pointerId: event.pointerId,
                startX: hit.x,
                startY: hit.y,
                sx: event.clientX,
                sy: event.clientY,
                moved: false,
                hasHistory: false
            };
            canvasEl.setPointerCapture?.(event.pointerId);
            canvasEl.style.cursor = 'grabbing';
            implSyncTextToolState(true);
            implRenderEditTextCanvas();
            return;
        }
        if(implSelectedEditTextItem()){
            implConfirmSelectedEditTextItem();
            return;
        }
        implBeginTextEditChange();
        const item = implCreateEditTextItem(implDefaultEditTextText(), point, {color:implBrushColor(), size:implEditTextSizeFromBrush()});
        editTextItems.push(item);
        editTextSelectedId = item.id;
        canvasEl.style.cursor = 'text';
        implRenderEditTextCanvas();
        implSyncTextToolState(true);
    }

    function implUpdateEditTextCursor(event){
        const canvasEl = implEditTextCanvas();
        if(!canvasEl || imageEditMode !== 'brush' || brushTool !== 'text') return;
        const hit = implHitEditTextItem(implEditTextPoint(event));
        canvasEl.style.cursor = hit ? 'move' : 'text';
    }

    function implMoveEditText(event){
        if(!editTextDrag){
            implUpdateEditTextCursor(event);
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const item = editTextItems.find(x => x.id === editTextDrag.id);
        if(!item) return;
        const dx = event.clientX - editTextDrag.sx;
        const dy = event.clientY - editTextDrag.sy;
        if(!editTextDrag.moved && Math.abs(dx) + Math.abs(dy) < 2) return;
        editTextDrag.moved = true;
        if(!editTextDrag.hasHistory){
            implBeginTextEditChange();
            editTextDrag.hasHistory = true;
        }
        const canvasEl = implEditTextCanvas();
        const rect = canvasEl?.getBoundingClientRect?.();
        const scaleX = canvasEl ? canvasEl.width / Math.max(1, rect?.width || canvasEl.width) : 1;
        const scaleY = canvasEl ? canvasEl.height / Math.max(1, rect?.height || canvasEl.height) : 1;
        item.x = editTextDrag.startX + dx * scaleX;
        item.y = editTextDrag.startY + dy * scaleY;
        implRenderEditTextCanvas();
    }

    function implEndEditText(event){
        if(editTextDrag && event?.pointerId != null) implEditTextCanvas()?.releasePointerCapture?.(event.pointerId);
        editTextDrag = null;
        editTextDirty = false;
        implRenderEditTextCanvas();
        implSyncTextToolState(true);
        if(event) implUpdateEditTextCursor(event);
    }

    function implEditTextHasContent(){
        return editTextItems.some(item => String(item?.text || '').trim().length > 0);
    }

    function implResizeEditTextCanvas(){
        const img = element('cropImage');
        const canvasEl = implEditTextCanvas();
        if(!img || !canvasEl) return;
        const w = Math.max(1, img.naturalWidth || img.clientWidth || 1);
        const h = Math.max(1, img.naturalHeight || img.clientHeight || 1);
        if(canvasEl.width !== w) canvasEl.width = w;
        if(canvasEl.height !== h) canvasEl.height = h;
        canvasEl.style.width = `${img.clientWidth || 1}px`;
        canvasEl.style.height = `${img.clientHeight || 1}px`;
        implRenderEditTextCanvas();
    }

    function implResizeEditDrawCanvas(){
        const img = element('cropImage');
        const canvasEl = implEditDrawCanvas();
        const w = Math.max(1, img.naturalWidth || img.clientWidth || 1);
        const h = Math.max(1, img.naturalHeight || img.clientHeight || 1);
        if(canvasEl.width !== w || canvasEl.height !== h){
            canvasEl.width = w;
            canvasEl.height = h;
        }
        canvasEl.style.width = `${img.clientWidth || 1}px`;
        canvasEl.style.height = `${img.clientHeight || 1}px`;
        implResizeEditTextCanvas();
        if(imageEditMode === 'grid') implRefreshGridSplitPreview();
    }

    function implSetImageEditMode(mode, userTouched=false){
        if(userTouched) imageEditModeTouched = true;
        const prevImageEditMode = imageEditMode;
        if(mode !== 'brush') implRemoveEditTextInlineEditor(true);
        imageEditMode = ['preview','crop','outpaint','mask','brush','grid'].includes(mode) ? mode : 'crop';
        const isPreview = imageEditMode === 'preview';
        const cropCanvasEl = element('cropCanvas');
        cropCanvasEl.classList.toggle('preview-mode', isPreview);
        cropCanvasEl.classList.toggle('mask-mode', imageEditMode === 'mask');
        cropCanvasEl.classList.toggle('brush-mode', imageEditMode === 'brush');
        cropCanvasEl.classList.toggle('grid-mode', imageEditMode === 'grid');
        cropCanvasEl.classList.toggle('outpaint-mode', imageEditMode === 'outpaint');
        impl_syncGridCustomCursor();
        modal().querySelectorAll('[data-image-edit-mode]').forEach(btn => btn.classList.toggle('active', btn.dataset.imageEditMode === imageEditMode));
        element('imageMaskTools').classList.toggle('active', imageEditMode === 'mask');
        element('imageBrushTools').classList.toggle('active', imageEditMode === 'brush');
        element('imageGridTools').classList.toggle('active', imageEditMode === 'grid');
        implSyncGridGapValue();
        const title = element('imageEditTitle');
        const sub = element('imageEditSub');
        const apply = element('imageEditApplyBtn');
        if(isPreview){
            apply.style.display = 'none';
            title.textContent = '预览图片';
            sub.textContent = '查看大图，可切换到裁剪 / 扩图 / 遮罩等模式';
        } else {
            apply.style.display = '';
            const icon = imageEditMode === 'crop' ? 'crop' : imageEditMode === 'outpaint' ? 'expand' : imageEditMode === 'mask' ? 'brush' : imageEditMode === 'brush' ? 'paintbrush' : 'grid-3x3';
            const editLabel = imageEditMode === 'crop' ? '应用裁剪' : imageEditMode === 'outpaint' ? '应用扩图' : imageEditMode === 'mask' ? '生成遮罩节点' : imageEditMode === 'brush' ? '应用画笔' : '切分到 Output';
            const editTitle = imageEditMode === 'crop' ? '裁剪图片' : imageEditMode === 'outpaint' ? '扩图' : imageEditMode === 'mask' ? '遮罩编辑' : imageEditMode === 'brush' ? '画笔编辑' : '宫格切分';
            const editHint = imageEditMode === 'crop' ? '拖动裁剪框移动，拖右下角调整大小' : imageEditMode === 'outpaint' ? '拖动红框调整画布范围，最大不超过 4K 尺寸，确认后空白区域填充白色' : imageEditMode === 'mask' ? '在要重绘的位置涂白，保存后会生成遮罩图片节点' : imageEditMode === 'brush' ? '直接在图片上绘制标记或草图' : '按切分线分割图片，间隔会从线两侧扣除';
            title.textContent = editTitle;
            sub.textContent = editHint;
            apply.innerHTML = `<i data-lucide="${icon}" class="w-4 h-4"></i><span>${editLabel}</span>`;
        }
        implResizeEditDrawCanvas();
        if(isPreview) implClearEditDrawing(true);
        else if(imageEditMode === 'grid') implRefreshGridSplitPreview();
        else if(imageEditMode === 'outpaint') implResetOutpaintBox();
        else if(imageEditMode === 'crop') implClearEditDrawing(true);
        else if(prevImageEditMode === 'grid') implClearEditDrawing(true); // 离开 grid 时主动清掉画布上残留的分割线预览
        implSyncEditDrawingHistoryButtons();
        implSyncBrushToolButtons();
        implSyncTextToolState(true);
        refreshIcons();
    }

    function implEditDrawSnapshot(){
        const canvasEl = implEditDrawCanvas();
        return {
            imageData: canvasEl.getContext('2d').getImageData(0, 0, canvasEl.width, canvasEl.height),
            labelCounter: brushLabelCounter,
            textItems: editTextItems.map(item => ({...item})),
            textSelectedId: editTextSelectedId || '',
        };
    }

    function implRestoreEditDrawSnapshot(snapshot){
        if(!snapshot) return;
        implRemoveEditTextInlineEditor(false);
        const canvasEl = implEditDrawCanvas();
        const imageData = snapshot.imageData || snapshot;
        canvasEl.getContext('2d').putImageData(imageData, 0, 0);
        if(snapshot.labelCounter) brushLabelCounter = snapshot.labelCounter;
        editTextItems = (snapshot.textItems || []).map(item => ({...item}));
        editTextSelectedId = snapshot.textSelectedId || '';
        implRenderEditTextCanvas();
        implSyncTextToolState(true);
    }

    function implPushEditDrawHistory(){
        editDrawUndoStack.push(implEditDrawSnapshot());
        if(editDrawUndoStack.length > EDIT_DRAW_HISTORY_MAX) editDrawUndoStack.shift();
        editDrawRedoStack = [];
        implSyncEditDrawingHistoryButtons();
    }

    function implSyncEditDrawingHistoryButtons(){
        ['maskUndoBtn','brushUndoBtn'].forEach(id => {
            const btn = element(id);
            if(btn){ btn.disabled = !editDrawUndoStack.length; btn.style.opacity = editDrawUndoStack.length ? '1' : '.42'; }
        });
        ['maskRedoBtn','brushRedoBtn'].forEach(id => {
            const btn = element(id);
            if(btn){ btn.disabled = !editDrawRedoStack.length; btn.style.opacity = editDrawRedoStack.length ? '1' : '.42'; }
        });
    }

    function implUndoEditDrawing(){
        if(!editDrawUndoStack.length) return;
        editDrawRedoStack.push(implEditDrawSnapshot());
        implRestoreEditDrawSnapshot(editDrawUndoStack.pop());
        implSyncEditDrawingHistoryButtons();
    }

    function implRedoEditDrawing(){
        if(!editDrawRedoStack.length) return;
        editDrawUndoStack.push(implEditDrawSnapshot());
        implRestoreEditDrawSnapshot(editDrawRedoStack.pop());
        implSyncEditDrawingHistoryButtons();
    }

    function implClearEditDrawing(silent=false){
        implRemoveEditTextInlineEditor(false);
        const canvasEl = implEditDrawCanvas();
        if(!silent && implEditCanvasHasPixels()) implPushEditDrawHistory();
        canvasEl.getContext('2d').clearRect(0, 0, canvasEl.width, canvasEl.height);
        const textCanvasEl = implEditTextCanvas();
        textCanvasEl?.getContext('2d')?.clearRect(0, 0, textCanvasEl.width, textCanvasEl.height);
        editTextItems = [];
        editTextSelectedId = '';
        editTextDrag = null;
        editTextDirty = false;
        brushLabelCounter = 1;
        implSyncTextToolState(true);
        implSyncEditDrawingHistoryButtons();
    }

    function implResetEditDrawingHistory(){
        implRemoveEditTextInlineEditor(false);
        editDrawUndoStack = [];
        editDrawRedoStack = [];
        brushLabelCounter = 1;
        editTextItems = [];
        editTextSelectedId = '';
        editTextDrag = null;
        editTextDirty = false;
        implRenderEditTextCanvas();
        implSyncTextToolState(true);
        implSyncEditDrawingHistoryButtons();
    }

    function implSetBrushTool(tool){
        if(tool !== 'text') implRemoveEditTextInlineEditor(true);
        brushTool = ['free','rect','ellipse','label','text'].includes(tool) ? tool : 'free';
        implSyncBrushToolButtons();
        implSyncTextToolState(true);
    }

    function implSyncBrushToolButtons(){
        modal().querySelectorAll('[data-brush-tool]').forEach(btn => {
            const active = btn.dataset.brushTool === brushTool;
            btn.classList.toggle('primary', active);
            btn.classList.toggle('secondary', !active);
        });
        const cropCanvasEl = element('cropCanvas');
        cropCanvasEl?.classList.toggle('text-mode', imageEditMode === 'brush' && brushTool === 'text');
    }

    function implEditDrawPoint(event){
        const canvasEl = implEditDrawCanvas();
        const rect = canvasEl.getBoundingClientRect();
        return {
            x:(event.clientX - rect.left) * canvasEl.width / Math.max(1, rect.width),
            y:(event.clientY - rect.top) * canvasEl.height / Math.max(1, rect.height),
        };
    }

    function implGridCustomLineHit(point){
        if(!gridCustomLines.length) return -1;
        const canvasEl = implEditDrawCanvas();
        const threshold = Math.max(8, Math.min(canvasEl.width, canvasEl.height) / 80);
        let best = -1;
        let bestDist = Infinity;
        gridCustomLines.forEach((line, index) => {
            const dist = line.type === 'h'
                ? Math.abs(point.y - line.pos * canvasEl.height)
                : Math.abs(point.x - line.pos * canvasEl.width);
            if(dist < bestDist && dist <= threshold){
                best = index;
                bestDist = dist;
            }
        });
        return best;
    }

    function implSetGridCustomLinePos(index, point){
        const canvasEl = implEditDrawCanvas();
        const line = gridCustomLines[index];
        if(!line) return;
        line.pos = line.type === 'h'
            ? Math.max(0.001, Math.min(0.999, point.y / Math.max(1, canvasEl.height)))
            : Math.max(0.001, Math.min(0.999, point.x / Math.max(1, canvasEl.width)));
    }

    function implEditBrushSize(){
        const id = imageEditMode === 'mask' ? 'maskBrushSize' : 'paintBrushSize';
        return Number(element(id)?.value || 20);
    }

    function implBrushColor(){
        return element('paintBrushColor')?.value || '#ff2d55';
    }

    function implSetupDrawStyle(ctx){
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = implEditBrushSize();
        ctx.strokeStyle = imageEditMode === 'mask' ? MASK_BRUSH_COLOR : implBrushColor();
        ctx.fillStyle = imageEditMode === 'mask' ? MASK_BRUSH_COLOR : implBrushColor();
        ctx.globalCompositeOperation = 'source-over';
    }

    function implNormalizeMaskPreviewCanvas(canvasEl=implEditDrawCanvas()){
        if(imageEditMode !== 'mask' || !canvasEl?.width || !canvasEl?.height) return;
        const ctx = canvasEl.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
        const data = imageData.data;
        let changed = false;
        for(let i = 0; i < data.length; i += 4){
            if(data[i + 3] <= 0) continue;
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
            if(data[i + 3] > MASK_BRUSH_ALPHA) data[i + 3] = MASK_BRUSH_ALPHA;
            changed = true;
        }
        if(changed) ctx.putImageData(imageData, 0, 0);
    }

    function implCircledNumber(n){
        if(n >= 1 && n <= 20) return String.fromCharCode(0x2460 + n - 1);
        return String(n);
    }

    function implDrawBrushShape(ctx, start, end, preview=false){
        implSetupDrawStyle(ctx);
        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const w = Math.abs(end.x - start.x);
        const h = Math.abs(end.y - start.y);
        if(brushTool === 'rect'){
            ctx.strokeRect(x, y, w, h);
        } else if(brushTool === 'ellipse'){
            ctx.beginPath();
            ctx.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    function implDrawNumberLabel(point){
        const canvasEl = implEditDrawCanvas();
        const ctx = canvasEl.getContext('2d');
        const size = Math.max(18, implEditBrushSize() * 2.2);
        const text = implCircledNumber(brushLabelCounter++);
        implSetupDrawStyle(ctx);
        ctx.save();
        ctx.font = `900 ${size}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(3, size / 8);
        ctx.strokeStyle = 'rgba(255,255,255,0.92)';
        ctx.strokeText(text, point.x, point.y);
        ctx.fillStyle = implBrushColor();
        ctx.fillText(text, point.x, point.y);
        ctx.restore();
    }

    function implBeginEditDraw(event){
        if(imageEditMode === 'crop') return;
        if(imageEditMode === 'grid'){
            if(!gridCustomMode) return;
            // 自定义模式：拖动已有线，或点击空白处放置新线
            event.preventDefault();
            event.stopPropagation();
            const canvasEl = implEditDrawCanvas();
            canvasEl.setPointerCapture?.(event.pointerId);
            const point = implEditDrawPoint(event);
            const hitIndex = implGridCustomLineHit(point);
            gridCustomHistory.push([...gridCustomLines.map(line => ({...line}))]);
            if(hitIndex >= 0){
                gridCustomDrag = {index: hitIndex, pointerId: event.pointerId};
                implSetGridCustomLinePos(hitIndex, point);
                implRefreshGridSplitPreview();
                impl_syncGridCustomUndoBtn();
                return;
            }
            const rect = canvasEl.getBoundingClientRect();
            const fracX = Math.max(0.001, Math.min(0.999, (event.clientX - rect.left) / rect.width));
            const fracY = Math.max(0.001, Math.min(0.999, (event.clientY - rect.top) / rect.height));
            gridCustomLines.push({type: gridCustomOrientation, pos: gridCustomOrientation === 'h' ? fracY : fracX});
            gridCustomDrag = {index: gridCustomLines.length - 1, pointerId: event.pointerId};
            impl_syncGridCustomUndoBtn();
            implRefreshGridSplitPreview();
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const canvasEl = implEditDrawCanvas();
        canvasEl.setPointerCapture?.(event.pointerId);
        const ctx = canvasEl.getContext('2d');
        const p = implEditDrawPoint(event);
        implPushEditDrawHistory();
        if(imageEditMode === 'brush' && brushTool === 'label'){
            implDrawNumberLabel(p);
            editDrawState = null;
            canvasEl.releasePointerCapture?.(event.pointerId);
            implSyncEditDrawingHistoryButtons();
            return;
        }
        editDrawState = {x:p.x, y:p.y, sx:p.x, sy:p.y, pointerId:event.pointerId, snapshot:(imageEditMode === 'brush' && brushTool !== 'free') ? implEditDrawSnapshot() : null};
        implSetupDrawStyle(ctx);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + 0.01, p.y + 0.01);
        if(imageEditMode === 'mask' || brushTool === 'free') ctx.stroke();
        implNormalizeMaskPreviewCanvas(canvasEl);
    }

    function implMoveEditDraw(event){
        if(imageEditMode === 'grid' && gridCustomMode && gridCustomDrag){
            event.preventDefault();
            event.stopPropagation();
            implSetGridCustomLinePos(gridCustomDrag.index, implEditDrawPoint(event));
            implRefreshGridSplitPreview();
            return;
        }
        if(!editDrawState || imageEditMode === 'crop' || imageEditMode === 'grid') return;
        event.preventDefault();
        event.stopPropagation();
        const ctx = implEditDrawCanvas().getContext('2d');
        const p = implEditDrawPoint(event);
        if(imageEditMode === 'brush' && brushTool !== 'free'){
            implRestoreEditDrawSnapshot(editDrawState.snapshot);
            implDrawBrushShape(ctx, {x:editDrawState.sx, y:editDrawState.sy}, p, true);
            return;
        }
        implSetupDrawStyle(ctx);
        ctx.beginPath();
        ctx.moveTo(editDrawState.x, editDrawState.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        editDrawState.x = p.x;
        editDrawState.y = p.y;
        implNormalizeMaskPreviewCanvas();
    }

    function implEndEditDraw(event){
        if(editDrawState && event?.pointerId != null) implEditDrawCanvas().releasePointerCapture?.(event.pointerId);
        if(gridCustomDrag && event?.pointerId != null) implEditDrawCanvas().releasePointerCapture?.(event.pointerId);
        editDrawState = null;
        gridCustomDrag = null;
        implSyncEditDrawingHistoryButtons();
    }

    function implEditCanvasHasPixels(){
        if(implEditTextHasContent()) return true;
        const canvasEl = implEditDrawCanvas();
        const data = canvasEl.getContext('2d').getImageData(0, 0, canvasEl.width, canvasEl.height).data;
        for(let i = 3; i < data.length; i += 4) if(data[i] > 0) return true;
        return false;
    }

    function implSyncGridGapValue(){
        const input = element('gridGapSize');
        const value = Math.max(0, Math.min(240, Number(input?.value || 0)));
        if(input) input.value = value;
        const label = element('gridGapValue');
        if(label) label.textContent = String(value);
        return value;
    }

    function implGridSplitSettings(){
        const hLines = Math.max(0, Math.min(20, Number(element('gridHorizontalLines')?.value || 0)));
        const vLines = Math.max(0, Math.min(20, Number(element('gridVerticalLines')?.value || 0)));
        const gap = implSyncGridGapValue();
        return {rows:hLines + 1, cols:vLines + 1, gap};
    }

    function implGridSplitRects(width, height){
        if(gridCustomMode) return implGridSplitRectsCustom(width, height);
        const {rows, cols, gap} = implGridSplitSettings();
        const halfGap = gap / 2;
        const rects = [];
        for(let row = 0; row < rows; row++){
            const topLine = row * height / rows;
            const bottomLine = (row + 1) * height / rows;
            const y1 = Math.round(row === 0 ? 0 : topLine + halfGap);
            const y2 = Math.round(row === rows - 1 ? height : bottomLine - halfGap);
            for(let col = 0; col < cols; col++){
                const leftLine = col * width / cols;
                const rightLine = (col + 1) * width / cols;
                const x1 = Math.round(col === 0 ? 0 : leftLine + halfGap);
                const x2 = Math.round(col === cols - 1 ? width : rightLine - halfGap);
                if(x2 > x1 && y2 > y1) rects.push({row, col, x:x1, y:y1, w:x2 - x1, h:y2 - y1});
            }
        }
        return rects;
    }

    function implGridSplitRectsCustom(width, height){
        const gap = Math.max(0, Math.min(240, Number(element('gridGapSize')?.value || 0)));
        const halfGap = gap / 2;
        // 按方向归类，转换为像素位置（去重并排序）
        const rawH = [...new Set(gridCustomLines.filter(l => l.type === 'h').map(l => l.pos * height))].sort((a, b) => a - b);
        const rawV = [...new Set(gridCustomLines.filter(l => l.type === 'v').map(l => l.pos * width))].sort((a, b) => a - b);
        const hCuts = [0, ...rawH, height]; // 切割边界（含图片两端）
        const vCuts = [0, ...rawV, width];
        const rects = [];
        for(let row = 0; row < hCuts.length - 1; row++){
            for(let col = 0; col < vCuts.length - 1; col++){
                const y1 = Math.round(row === 0 ? hCuts[row] : hCuts[row] + halfGap);
                const y2 = Math.round(row === hCuts.length - 2 ? hCuts[row + 1] : hCuts[row + 1] - halfGap);
                const x1 = Math.round(col === 0 ? vCuts[col] : vCuts[col] + halfGap);
                const x2 = Math.round(col === vCuts.length - 2 ? vCuts[col + 1] : vCuts[col + 1] - halfGap);
                if(x2 > x1 && y2 > y1) rects.push({row, col, x:x1, y:y1, w:x2 - x1, h:y2 - y1});
            }
        }
        return rects;
    }

    function implGridLayoutFromRects(rects){
        const rows = Math.max(1, ...rects.map(r => Number(r.row || 0) + 1));
        const cols = Math.max(1, ...rects.map(r => Number(r.col || 0) + 1));
        return {type:'grid-split', groupId:uid('grid'), rows, cols};
    }

    function implApplyGridPreset(rows, cols){
        gridCustomMode = false;
        gridCustomLines = [];
        gridCustomHistory = [];
        gridCustomDrag = null;
        const h = element('gridHorizontalLines');
        const v = element('gridVerticalLines');
        if(h){ h.disabled = false; h.value = String(Math.max(0, Number(rows || 1) - 1)); }
        if(v){ v.disabled = false; v.value = String(Math.max(0, Number(cols || 1) - 1)); }
        const toggle = element('gridCustomToggle');
        const custom = element('gridCustomControls');
        const regular = element('gridRegularControls');
        if(toggle){
            toggle.classList.remove('primary');
            toggle.classList.add('secondary');
        }
        if(custom) custom.style.display = 'none';
        if(regular) regular.style.display = 'contents';
        impl_syncGridCustomCursor();
        impl_syncGridCustomUndoBtn();
        implRefreshGridSplitPreview();
    }

    // ——— 自定义宫格辅助函数 ———
    function implToggleGridCustomMode(){
        gridCustomMode = !gridCustomMode;
        if(gridCustomMode){ gridCustomLines = []; gridCustomHistory = []; } // 进入自定义时清空旧线及历史
        gridCustomDrag = null;
        const toggle = element('gridCustomToggle');
        const regular = element('gridRegularControls');
        const custom = element('gridCustomControls');
        toggle.classList.toggle('primary', gridCustomMode);
        toggle.classList.toggle('secondary', !gridCustomMode);
        // 禁用/启用常规输入
        ['gridHorizontalLines','gridVerticalLines'].forEach(id => {
            const el = element(id);
            if(el) el.disabled = gridCustomMode;
        });
        if(custom) custom.style.display = gridCustomMode ? 'flex' : 'none';
        impl_syncGridCustomCursor();
        impl_syncGridCustomUndoBtn();
        implRefreshGridSplitPreview();
    }

    function implSetGridCustomOrientation(orient){
        gridCustomOrientation = orient;
        element('gridOrientH').classList.toggle('primary', orient === 'h');
        element('gridOrientH').classList.toggle('secondary', orient !== 'h');
        element('gridOrientV').classList.toggle('primary', orient === 'v');
        element('gridOrientV').classList.toggle('secondary', orient !== 'v');
        impl_syncGridCustomCursor();
    }

    function implClearGridCustomLines(){
        gridCustomHistory = [];
        gridCustomLines = [];
        gridCustomDrag = null;
        impl_syncGridCustomUndoBtn();
        implRefreshGridSplitPreview();
    }

    function implUndoGridCustomLine(){
        if(!gridCustomHistory.length) return;
        gridCustomLines = gridCustomHistory.pop();
        gridCustomDrag = null;
        impl_syncGridCustomUndoBtn();
        implRefreshGridSplitPreview();
    }

    function impl_syncGridCustomUndoBtn(){
        const btn = element('gridUndoBtn');
        if(!btn) return;
        btn.disabled = gridCustomHistory.length === 0;
        btn.style.opacity = gridCustomHistory.length === 0 ? '0.4' : '1';
    }

    // ——— 图片缩放 ———
    function implApplyImageEditZoom(){
        if(!imageEditBaseW) return;
        const img = element('cropImage');
        const oldW = img.clientWidth;
        img.style.maxWidth = 'none';
        img.style.maxHeight = 'none';
        img.style.width = Math.round(imageEditBaseW * imageEditZoom) + 'px';
        img.style.height = Math.round(imageEditBaseH * imageEditZoom) + 'px';
        implResizeEditDrawCanvas();
        // 按比例同步裁剪框位置
        if(cropState && oldW > 0){
            const scale = img.clientWidth / oldW;
            cropState.x = Math.round(cropState.x * scale);
            cropState.y = Math.round(cropState.y * scale);
            cropState.w = Math.round(cropState.w * scale);
            cropState.h = Math.round(cropState.h * scale);
            implClampCrop();
            implRenderCropBox();
        }
        if(imageEditMode === 'grid') implRefreshGridSplitPreview();
        implSyncImageEditOverflow();
        impl_updateZoomLabel();
    }

    function implSyncImageEditOverflow(){
        const stage = element('imageEditStage');
        const crop = element('cropCanvas');
        if(!stage || !crop) return;
        const rect = crop.getBoundingClientRect();
        const pad = 36;
        const overflowX = rect.width + pad > stage.clientWidth;
        const overflowY = rect.height + pad > stage.clientHeight;
        stage.classList.toggle('overflowing', overflowX || overflowY);
        stage.classList.toggle('overflow-x', overflowX);
        stage.classList.toggle('overflow-y', overflowY);
    }

    function implResetImageEditZoom(){
        const stage = element('imageEditStage');
        imageEditZoom = 1.0;
        implApplyImageEditZoom();
        if(stage){ stage.scrollLeft = 0; stage.scrollTop = 0; }
    }

    function impl_updateZoomLabel(){
        const el = element('imageEditZoomLabel');
        if(el) el.textContent = Math.round(imageEditZoom * 100) + '%';
    }

    function impl_syncGridCustomCursor(){
        const cropCanvasEl = element('cropCanvas');
        cropCanvasEl.classList.toggle('grid-custom-h', imageEditMode === 'grid' && gridCustomMode && gridCustomOrientation === 'h');
        cropCanvasEl.classList.toggle('grid-custom-v', imageEditMode === 'grid' && gridCustomMode && gridCustomOrientation === 'v');
    }

    function implRefreshGridSplitPreview(){
        const canvasEl = implEditDrawCanvas();
        const ctx = canvasEl.getContext('2d');
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        if(imageEditMode !== 'grid') return;
        const countEl = element('gridSplitCount');
        const lineWidth = Math.max(2, Math.round(Math.min(canvasEl.width, canvasEl.height) / 320));
        const drawGuideLine = (x1, y1, x2, y2) => {
            ctx.save();
            ctx.lineWidth = lineWidth + 2;
            ctx.strokeStyle = 'rgba(2,6,23,0.72)';
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            ctx.lineWidth = lineWidth;
            ctx.strokeStyle = 'rgba(255,255,255,0.92)';
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            ctx.restore();
        };
        if(gridCustomMode){
            // 自定义模式：按已放置线渲染（包含空心范围预览）
            const gap = Math.max(0, Math.min(240, Number(element('gridGapSize')?.value || 0)));
            const hLines = gridCustomLines.filter(l => l.type === 'h');
            const vLines = gridCustomLines.filter(l => l.type === 'v');
            if(countEl) countEl.textContent = '将输出 {n} 张'.replace('{n}', (hLines.length + 1) * (vLines.length + 1));
            ctx.save();
            hLines.forEach(l => {
                const y = l.pos * canvasEl.height;
                if(gap > 0){
                    drawGuideLine(0, y - gap / 2, canvasEl.width, y - gap / 2);
                    drawGuideLine(0, y + gap / 2, canvasEl.width, y + gap / 2);
                } else {
                    drawGuideLine(0, y, canvasEl.width, y);
                }
            });
            vLines.forEach(l => {
                const x = l.pos * canvasEl.width;
                if(gap > 0){
                    drawGuideLine(x - gap / 2, 0, x - gap / 2, canvasEl.height);
                    drawGuideLine(x + gap / 2, 0, x + gap / 2, canvasEl.height);
                } else {
                    drawGuideLine(x, 0, x, canvasEl.height);
                }
            });
            ctx.restore();
            return;
        }
        // 常规模式
        const {rows, cols, gap} = implGridSplitSettings();
        if(countEl) countEl.textContent = '将输出 {n} 张'.replace('{n}', rows * cols);
        ctx.save();
        const scaleX = canvasEl.width;
        const scaleY = canvasEl.height;
        for(let i = 1; i < cols; i++){
            const x = i * scaleX / cols;
            if(gap > 0){
                drawGuideLine(x - gap / 2, 0, x - gap / 2, scaleY);
                drawGuideLine(x + gap / 2, 0, x + gap / 2, scaleY);
            } else {
                drawGuideLine(x, 0, x, scaleY);
            }
        }
        for(let i = 1; i < rows; i++){
            const y = i * scaleY / rows;
            if(gap > 0){
                drawGuideLine(0, y - gap / 2, scaleX, y - gap / 2);
                drawGuideLine(0, y + gap / 2, scaleX, y + gap / 2);
            } else {
                drawGuideLine(0, y, scaleX, y);
            }
        }
        ctx.restore();
    }

    function implImageEditorOutputPoint(node, offsetY=0){
        return {x:(node.x || 0) + Number(node.w || 260) + 36, y:(node.y || 0) + offsetY};
    }

    function implImageEditorOutputNode(sourceNode){
        let out = connections.filter(c => c.from === sourceNode.id)
            .map(c => nodes.find(n => n.id === c.to))
            .find(n => n?.type === 'output');
        if(!out){
            const p = implImageEditorOutputPoint(sourceNode, 0);
            out = {id:uid('out'), type:'output', x:p.x, y:p.y, images:[]};
            nodes.push(out);
        }
        return out;
    }

    function implAddGeneratedImageNode(file, sourceNode, suffix, offsetY=0, extra={}){
        const p = implImageEditorOutputPoint(sourceNode, offsetY);
        const next = {id:uid('img'), type:'image', x:p.x, y:p.y, url:file.url, name:file.name || suffix, ...extra};
        nodes.push(next);
        selected.clear();
        selected.add(next.id);
        return next;
    }

    function implRenderCropBox(){
        if(!cropState) return;
        const cropCanvasEl = element('cropCanvas');
        const img = element('cropImage');
        const draw = implEditDrawCanvas();
        const textCanvas = implEditTextCanvas();
        let boxX = cropState.x;
        let boxY = cropState.y;
        if(imageEditMode === 'outpaint' && cropCanvasEl && img){
            cropCanvasEl.style.width = `${Math.round(cropState.w)}px`;
            cropCanvasEl.style.height = `${Math.round(cropState.h)}px`;
            img.style.left = `${Math.round(cropState.x)}px`;
            img.style.top = `${Math.round(cropState.y)}px`;
            boxX = 0;
            boxY = 0;
            if(draw){
                draw.style.left = img.style.left;
                draw.style.top = img.style.top;
            }
            if(textCanvas){
                textCanvas.style.left = img.style.left;
                textCanvas.style.top = img.style.top;
            }
            implUpdateOutpaintResolutionLabel();
        } else if(cropCanvasEl && img){
            cropCanvasEl.style.width = '';
            cropCanvasEl.style.height = '';
            img.style.left = '';
            img.style.top = '';
            if(draw){
                draw.style.left = '';
                draw.style.top = '';
            }
            if(textCanvas){
                textCanvas.style.left = '';
                textCanvas.style.top = '';
            }
        }
        const box = element('cropBox');
        box.style.left = `${boxX}px`;
        box.style.top = `${boxY}px`;
        box.style.width = `${cropState.w}px`;
        box.style.height = `${cropState.h}px`;
        const outpaintFrame = element('outpaintFrame');
        if(outpaintFrame){
            outpaintFrame.style.left = imageEditMode === 'outpaint' ? '0px' : `${boxX}px`;
            outpaintFrame.style.top = imageEditMode === 'outpaint' ? '0px' : `${boxY}px`;
            outpaintFrame.style.width = `${cropState.w}px`;
            outpaintFrame.style.height = `${cropState.h}px`;
        }
    }

    function implOutpaintNaturalSize(){
        const img = element('cropImage');
        if(!img || !cropState) return {w:1, h:1};
        const scaleX = Math.max(1, Number(img.naturalWidth || 1)) / Math.max(1, Number(img.clientWidth || 1));
        const scaleY = Math.max(1, Number(img.naturalHeight || 1)) / Math.max(1, Number(img.clientHeight || 1));
        return {
            w:Math.max(1, Math.round((cropState.w || 1) * scaleX)),
            h:Math.max(1, Math.round((cropState.h || 1) * scaleY))
        };
    }

    function implUpdateOutpaintResolutionLabel(){
        const label = element('outpaintResolution');
        const cropCanvasEl = element('cropCanvas');
        if(!label || !cropState) return;
        const size = implOutpaintNaturalSize();
        cropCanvasEl?.classList.toggle('outpaint-warning', exceedsFourKStandard(size.w, size.h));
        label.textContent = `${Math.round(size.w)} x ${Math.round(size.h)}`;
    }

    function implClampOutpaint(){
        if(!cropState) return;
        const {w, h} = implCropBounds();
        cropState.w = Math.max(w, cropState.w);
        cropState.h = Math.max(h, cropState.h);
        cropState.x = Math.min(cropState.w - w, Math.max(0, cropState.x));
        cropState.y = Math.min(cropState.h - h, Math.max(0, cropState.y));
    }

    function implResetOutpaintBox(){
        if(!cropState) return;
        const {w, h} = implCropBounds();
        cropState.x = 0;
        cropState.y = 0;
        cropState.w = w;
        cropState.h = h;
        implRenderCropBox();
    }

    function implResetCropBox(){
        if(!cropState) return;
        if(imageEditMode === 'outpaint') return implResetOutpaintBox();
        const {w, h} = implCropBounds();
        cropState.x = Math.round(w * 0.08);
        cropState.y = Math.round(h * 0.08);
        cropState.w = Math.round(w * 0.84);
        cropState.h = Math.round(h * 0.84);
        implRenderCropBox();
    }

    function implOpenImageEditor(nodeId, initialMode='crop'){
        if(destroyed || paused) return;
        const node = nodes.find(n => n.id === nodeId);
        if(!node?.url) return;
        if(mediaKindForNode(node) !== 'image') return;
        implCloseImageEditor(true);
        target = {canvasId:canvas?.id, node, nodeIndex:nodes.indexOf(node), sourceUrl:node.url};
        const origin = capture();
        window.CanvasMediaLoader?.begin('image-editor');
        if(!['preview','crop','outpaint','mask','brush','grid'].includes(initialMode)) initialMode = 'crop';
        cropState = {nodeId, x:0, y:0, w:0, h:0};
        // 重置自定义宫格状态
        gridCustomMode = false;
        gridCustomLines = [];
        gridCustomHistory = [];
        gridCustomDrag = null;
        gridCustomOrientation = 'h';
        imageEditZoom = 1.0;
        imageEditBaseW = 0;
        imageEditBaseH = 0;
        imageEditModeTouched = false;
        editTextItems = [];
        editTextSelectedId = '';
        editTextDrag = null;
        editTextDirty = false;
        const toggle = element('gridCustomToggle');
        if(toggle){ toggle.classList.add('secondary'); toggle.classList.remove('primary'); }
        const custom = element('gridCustomControls');
        if(custom) custom.style.display = 'none';
        ['gridHorizontalLines','gridVerticalLines'].forEach(id => { const el = element(id); if(el) el.disabled = false; });
        const orientH = element('gridOrientH');
        const orientV = element('gridOrientV');
        if(orientH){ orientH.classList.add('primary'); orientH.classList.remove('secondary'); }
        if(orientV){ orientV.classList.add('secondary'); orientV.classList.remove('primary'); }
        impl_syncGridCustomUndoBtn();
        impl_updateZoomLabel();
        const modal = element('imageEditModal');
        const img = element('cropImage');
        img.style.width = '';
        img.style.height = '';
        img.style.maxWidth = '';
        img.style.maxHeight = '';
        modal.classList.add('open');
        img.onload = () => {
            if(!accept(origin) || ready) return;
            ready = true;
            // 记录 zoom=1 时的基础显示尺寸
            imageEditBaseW = img.clientWidth;
            imageEditBaseH = img.clientHeight;
            impl_updateZoomLabel();
            implResizeEditDrawCanvas();
            implResetEditDrawingHistory();
            implClearEditDrawing(true);
            implResetCropBox();
            if(!imageEditModeTouched) implSetImageEditMode(initialMode);
            implSyncImageEditOverflow();
            refreshIcons();
        };
        img.crossOrigin = 'anonymous';
        window.CanvasMediaLoader?.watch(img);
        img.src = canvasDisplayMediaUrl(node.url);
        implSetImageEditMode(initialMode);
        refreshIcons();
    }

    function implCloseImageEditor(keepMediaOwner=false){
        if(destroyed) return;
        generation++;
        ready = false;
        target = null;
        cancelGestures();
        if(!cropState) return;
        window.CanvasMediaLoader?.unwatch(element('cropImage'));
        if(!keepMediaOwner) window.CanvasMediaLoader?.end('image-editor');
        element('imageEditModal').classList.remove('open');
        const img = element('cropImage');
        img.onload = null;
        img.onerror = null;
        img.removeAttribute('src');
        img.style.width = '';
        img.style.height = '';
        img.style.maxWidth = '';
        img.style.maxHeight = '';
        implClearEditDrawing(true);
        cropState = null;
        cropDrag = null;
        editDrawState = null;
        implResetEditDrawingHistory();
        gridCustomDrag = null;
        imageEditZoom = 1.0;
        imageEditBaseW = 0;
        imageEditBaseH = 0;
        imageEditModeTouched = false;
        element('imageEditStage')?.classList.remove('overflowing', 'overflow-x', 'overflow-y');
        const cropCanvasEl = element('cropCanvas');
        cropCanvasEl.classList.remove('grid-custom-h', 'grid-custom-v', 'outpaint-mode', 'outpaint-warning', 'dragging-image', 'text-mode');
        cropCanvasEl.style.width = '';
        cropCanvasEl.style.height = '';
        const textCanvas = implEditTextCanvas();
        if(textCanvas){
            textCanvas.style.left = '';
            textCanvas.style.top = '';
        }
        gridCustomMode = false;
        gridCustomLines = [];
        gridCustomHistory = [];
        for(const canvasEl of [implEditDrawCanvas(), implEditTextCanvas()]){
            if(canvasEl){canvasEl.width = 0; canvasEl.height = 0;}
        }
    }

    function implClampCrop(){
        if(!cropState) return;
        if(imageEditMode === 'outpaint') return implClampOutpaint();
        const {w, h} = implCropBounds();
        cropState.w = Math.max(24, Math.min(cropState.w, w));
        cropState.h = Math.max(24, Math.min(cropState.h, h));
        cropState.x = Math.max(0, Math.min(cropState.x, w - cropState.w));
        cropState.y = Math.max(0, Math.min(cropState.y, h - cropState.h));
    }

    function implBeginCropDrag(event, mode){
        if(!cropState) return;
        event.preventDefault();
        event.stopPropagation();
        if(imageEditMode === 'outpaint' && mode === 'move') return;
        cropDrag = {mode, sx:event.clientX, sy:event.clientY, start:{...cropState}};
        implBindClassicCropDragEvents();
    }

    function implResizeOutpaintFromDrag(dx, dy){
        const start = cropDrag?.start;
        if(!start) return;
        let growX = 0, growY = 0;
        if(cropDrag.mode === 'outpaint-left') growX = -dx;
        else if(cropDrag.mode === 'outpaint-right') growX = dx;
        else if(cropDrag.mode === 'outpaint-top') growY = -dy;
        else if(cropDrag.mode === 'outpaint-bottom') growY = dy;
        else if(cropDrag.mode === 'outpaint-corner'){ growX = dx; growY = dy; }
        const {w, h} = implCropBounds();
        const nextW = Math.max(w, start.w + growX * 2);
        const nextH = Math.max(h, start.h + growY * 2);
        cropState.w = nextW;
        cropState.h = nextH;
        cropState.x = start.x + Math.round((nextW - start.w) / 2);
        cropState.y = start.y + Math.round((nextH - start.h) / 2);
        implClampOutpaint();
    }

    // Called once by canvas.js, at its original initialization position.
    function implBindClassicCropDragEvents(){
        clearListeners('drag');
        if(!cropDrag || !usable()) return;
        listen('drag', window, 'mousemove', event => {
            if(!cropDrag || !cropState) return;
            const dx = event.clientX - cropDrag.sx;
            const dy = event.clientY - cropDrag.sy;
            if(cropDrag.mode === 'move'){
                cropState.x = cropDrag.start.x + dx;
                cropState.y = cropDrag.start.y + dy;
            } else if(cropDrag.mode === 'image'){
                cropState.x = cropDrag.start.x + dx;
                cropState.y = cropDrag.start.y + dy;
            } else if(String(cropDrag.mode || '').startsWith('outpaint-')){
                implResizeOutpaintFromDrag(dx, dy);
            } else {
                cropState.w = cropDrag.start.w + dx;
                cropState.h = cropDrag.start.h + dy;
            }
            implClampCrop();
            implRenderCropBox();
        });
        listen('drag', window, 'mouseup', () => { cropDrag = null; clearListeners('drag'); element('cropCanvas')?.classList.remove('dragging-image'); });
    }

    async function implUploadCroppedBlob(blob, name){
        const form = new FormData();
        form.append('files', blob, name);
        const data = await window.CanvasApi.uploadAi(form);
        return data.files?.[0];
    }

    async function implUploadImageBlobs(blobs){
        const form = new FormData();
        blobs.forEach(item => form.append('files', item.blob, item.name));
        const data = await window.CanvasApi.uploadAi(form);
        return data.files || [];
    }

    async function implApplyImageCrop(){
        if(!usable()) return;
        const origin = capture();
        const node = nodes.find(n => n.id === cropState.nodeId);
        const img = element('cropImage');
        if(!node || !img.naturalWidth || !img.naturalHeight) return;
        const scaleX = img.naturalWidth / (img.clientWidth || 1);
        const scaleY = img.naturalHeight / (img.clientHeight || 1);
        const sx = Math.max(0, Math.round(cropState.x * scaleX));
        const sy = Math.max(0, Math.round(cropState.y * scaleY));
        const sw = Math.max(1, Math.round(cropState.w * scaleX));
        const sh = Math.max(1, Math.round(cropState.h * scaleY));
        const canvasEl = document.createElement('canvas');
        canvasEl.width = sw;
        canvasEl.height = sh;
        canvasEl.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        const blob = await new Promise(resolve => canvasEl.toBlob(resolve, 'image/png'));
        if(!blob || !accept(origin)) return;
        const base = (node.name || 'image').replace(/\.[^.]+$/, '');
        const file = await implUploadCroppedBlob(blob, `${base}_crop.png`);
        if(file && accept(origin)){
            clearCanvasFaceAuth(node);
            node.url = file.url;
            node.name = file.name;
            implCloseImageEditor();
            render();
            scheduleSave();
        }
    }

    async function implApplyImageOutpaint(){
        if(!usable()) return;
        const origin = capture();
        const node = nodes.find(n => n.id === cropState.nodeId);
        const img = element('cropImage');
        if(!node || !img.naturalWidth || !img.naturalHeight) return;
        implClampOutpaint();
        const scaleX = img.naturalWidth / (img.clientWidth || 1);
        const scaleY = img.naturalHeight / (img.clientHeight || 1);
        const outW = Math.max(img.naturalWidth, Math.round(cropState.w * scaleX));
        const outH = Math.max(img.naturalHeight, Math.round(cropState.h * scaleY));
        const dx = Math.round(cropState.x * scaleX);
        const dy = Math.round(cropState.y * scaleY);
        const canvasEl = document.createElement('canvas');
        canvasEl.width = outW;
        canvasEl.height = outH;
        const ctx = canvasEl.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, outW, outH);
        ctx.drawImage(img, dx, dy, img.naturalWidth, img.naturalHeight);
        const blob = await new Promise(resolve => canvasEl.toBlob(resolve, 'image/png'));
        if(!blob || !accept(origin)) return;
        const base = (node.name || 'image').replace(/\.[^.]+$/, '');
        const file = await implUploadCroppedBlob(blob, `${base}_outpaint.png`);
        if(file && accept(origin)){
            clearCanvasFaceAuth(node);
            node.url = file.url;
            node.name = file.name;
            node.mediaKind = 'image';
            node.natural_w = outW;
            node.natural_h = outH;
            implCloseImageEditor();
            render();
            scheduleSave();
        }
    }

    async function implApplyImageMask(){
        if(!usable()) return;
        const origin = capture();
        const node = nodes.find(n => n.id === cropState.nodeId);
        if(!node || !implEditCanvasHasPixels()) return;
        const mask = implMaskCanvasFromDrawCanvas(implEditDrawCanvas());
        const blob = await new Promise(resolve => mask.toBlob(resolve, 'image/png'));
        if(!blob || !accept(origin)) return;
        const base = (node.name || 'image').replace(/\.[^.]+$/, '');
        const file = await implUploadCroppedBlob(blob, `${base}_mask.png`);
        if(file && accept(origin)){
            implAddGeneratedImageNode(file, node, 'mask', 28, {role:'mask'});
            implCloseImageEditor();
            render();
            scheduleSave();
        }
    }

    function implMaskCanvasFromDrawCanvas(src){
        const mask = document.createElement('canvas');
        mask.width = src.width;
        mask.height = src.height;
        const srcCtx = src.getContext('2d');
        const srcData = srcCtx.getImageData(0, 0, src.width, src.height);
        const ctx = mask.getContext('2d');
        const out = ctx.createImageData(mask.width, mask.height);
        for(let i = 0; i < srcData.data.length; i += 4){
            const painted = srcData.data[i + 3] > 8;
            const v = painted ? 255 : 0;
            out.data[i] = v;
            out.data[i + 1] = v;
            out.data[i + 2] = v;
            out.data[i + 3] = 255;
        }
        ctx.putImageData(out, 0, 0);
        return mask;
    }

    async function implApplyImageBrush(){
        if(!usable()) return;
        const origin = capture();
        implRemoveEditTextInlineEditor(true);
        const node = nodes.find(n => n.id === cropState.nodeId);
        const img = element('cropImage');
        if(!node || !img.naturalWidth || !img.naturalHeight || !implEditCanvasHasPixels()) return;
        const canvasEl = document.createElement('canvas');
        canvasEl.width = img.naturalWidth;
        canvasEl.height = img.naturalHeight;
        const ctx = canvasEl.getContext('2d');
        ctx.drawImage(img, 0, 0, canvasEl.width, canvasEl.height);
        ctx.drawImage(implEditDrawCanvas(), 0, 0);
        ctx.drawImage(implEditTextCanvas(), 0, 0);
        const blob = await new Promise(resolve => canvasEl.toBlob(resolve, 'image/png'));
        if(!blob || !accept(origin)) return;
        const base = (node.name || 'image').replace(/\.[^.]+$/, '');
        const file = await implUploadCroppedBlob(blob, `${base}_paint.png`);
        if(file && accept(origin)){
            clearCanvasFaceAuth(node);
            node.url = file.url;
            node.name = file.name;
            implCloseImageEditor();
            render();
            scheduleSave();
        }
    }

    async function implApplyImageGridSplit(){
        if(!usable()) return;
        const origin = capture();
        const node = nodes.find(n => n.id === cropState.nodeId);
        const img = element('cropImage');
        if(!node || !img.naturalWidth || !img.naturalHeight) return;
        const rects = implGridSplitRects(img.naturalWidth, img.naturalHeight);
        if(!rects.length) return;
        const base = (node.name || 'image').replace(/\.[^.]+$/, '');
        const blobs = [];
        for(const rect of rects){
            const canvasEl = document.createElement('canvas');
            canvasEl.width = rect.w;
            canvasEl.height = rect.h;
            canvasEl.getContext('2d').drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
            const blob = await new Promise(resolve => canvasEl.toBlob(resolve, 'image/png'));
            if(!accept(origin)) return;
            if(blob) blobs.push({blob, name:`${base}_r${rect.row + 1}_c${rect.col + 1}.png`});
        }
        if(!blobs.length) return;
        const files = await implUploadImageBlobs(blobs);
        if(files.length && accept(origin)){
            const out = implImageEditorOutputNode(node);
            const urls = files.map(file => file.url).filter(Boolean);
            const layout = implGridLayoutFromRects(rects);
            appendOutputImages(out, urls, {url:node.url, name:node.name || 'source image'}, urls.map((url, i) => ({
                runMs:0,
                run:{prompt:'宫格切分', refs:[{url:node.url, name:node.name || 'source image'}]},
                grid:{...layout, row:rects[i]?.row || 0, col:rects[i]?.col || 0, w:rects[i]?.w || 1, h:rects[i]?.h || 1}
            })), layout);
            implCloseImageEditor();
            render();
            scheduleSave();
        }
    }

    function implApplyImageEdit(){
        if(imageEditMode === 'outpaint') return implApplyImageOutpaint();
        if(imageEditMode === 'mask') return implApplyImageMask();
        if(imageEditMode === 'brush') return implApplyImageBrush();
        if(imageEditMode === 'grid') return implApplyImageGridSplit();
        return implApplyImageCrop();
    }


    return Object.freeze({
        get state(){
            // An invalid target blocks editing, but the visible session must
            // still be discoverable so Escape can close and release it.
            return Object.freeze({open:!destroyed && !!cropState, targetValid:!destroyed && validTarget(), paused, ready:usable(), nodeId:target?.node.id || '', canvasId:target?.canvasId || '', mode:imageEditMode, brushTool, zoom:imageEditZoom, undoCount:editDrawUndoStack.length, redoCount:editDrawRedoStack.length, textCount:editTextItems.length, gridLineCount:gridCustomLines.length});
        },
        isEditingNode(id){ return !destroyed && !!cropState && target?.node.id === id && validTarget(); },
        reset: () => implCloseImageEditor(),
        targetChanged(){ if(cropState && !validTarget()) implCloseImageEditor(); },
        pause, resume, destroy,
        openImageEditor: implOpenImageEditor,
        closeImageEditor: () => implCloseImageEditor(),
        setImageEditMode: (...args) => { if(!destroyed && !paused && cropState && validTarget()) return implSetImageEditMode(...args); },
        undoEditDrawing: (...args) => { if(usable()) return implUndoEditDrawing(...args); },
        redoEditDrawing: (...args) => { if(usable()) return implRedoEditDrawing(...args); },
        clearEditDrawing: (...args) => { if(usable()) return implClearEditDrawing(...args); },
        setBrushTool: (...args) => { if(usable()) return implSetBrushTool(...args); },
        toggleGridCustomMode: (...args) => { if(usable()) return implToggleGridCustomMode(...args); },
        applyGridPreset: (...args) => { if(usable()) return implApplyGridPreset(...args); },
        setGridCustomOrientation: (...args) => { if(usable()) return implSetGridCustomOrientation(...args); },
        undoGridCustomLine: (...args) => { if(usable()) return implUndoGridCustomLine(...args); },
        clearGridCustomLines: (...args) => { if(usable()) return implClearGridCustomLines(...args); },
        resetImageEditZoom: (...args) => { if(usable()) return implResetImageEditZoom(...args); },
        resetCropBox: (...args) => { if(usable()) return implResetCropBox(...args); },
        applyImageEdit: (...args) => { if(usable()) return implApplyImageEdit(...args); },
        applyImageCrop: (...args) => { if(usable()) return implApplyImageCrop(...args); },
        applyImageOutpaint: (...args) => { if(usable()) return implApplyImageOutpaint(...args); },
        applyImageMask: (...args) => { if(usable()) return implApplyImageMask(...args); },
        applyImageBrush: (...args) => { if(usable()) return implApplyImageBrush(...args); },
        applyImageGridSplit: (...args) => { if(usable()) return implApplyImageGridSplit(...args); },
        syncImageEditOverflow: (...args) => { if(usable()) return implSyncImageEditOverflow(...args); },
        bindClassicImageEditorControls: bind,
        bindClassicCropDragEvents: (...args) => { if(usable()) return implBindClassicCropDragEvents(...args); }
    });
}

function openImageEditor(...args){ return classicImageEditor.openImageEditor(...args); }
function closeImageEditor(...args){ return classicImageEditor.closeImageEditor(...args); }
function setImageEditMode(...args){ return classicImageEditor.setImageEditMode(...args); }
function undoEditDrawing(...args){ return classicImageEditor.undoEditDrawing(...args); }
function redoEditDrawing(...args){ return classicImageEditor.redoEditDrawing(...args); }
function clearEditDrawing(...args){ return classicImageEditor.clearEditDrawing(...args); }
function setBrushTool(...args){ return classicImageEditor.setBrushTool(...args); }
function toggleGridCustomMode(...args){ return classicImageEditor.toggleGridCustomMode(...args); }
function applyGridPreset(...args){ return classicImageEditor.applyGridPreset(...args); }
function setGridCustomOrientation(...args){ return classicImageEditor.setGridCustomOrientation(...args); }
function undoGridCustomLine(...args){ return classicImageEditor.undoGridCustomLine(...args); }
function clearGridCustomLines(...args){ return classicImageEditor.clearGridCustomLines(...args); }
function resetImageEditZoom(...args){ return classicImageEditor.resetImageEditZoom(...args); }
function resetCropBox(...args){ return classicImageEditor.resetCropBox(...args); }
function applyImageEdit(...args){ return classicImageEditor.applyImageEdit(...args); }
function applyImageCrop(...args){ return classicImageEditor.applyImageCrop(...args); }
function applyImageOutpaint(...args){ return classicImageEditor.applyImageOutpaint(...args); }
function applyImageMask(...args){ return classicImageEditor.applyImageMask(...args); }
function applyImageBrush(...args){ return classicImageEditor.applyImageBrush(...args); }
function applyImageGridSplit(...args){ return classicImageEditor.applyImageGridSplit(...args); }
function syncImageEditOverflow(...args){ return classicImageEditor.syncImageEditOverflow(...args); }
function bindClassicImageEditorControls(...args){ return classicImageEditor.bindClassicImageEditorControls(...args); }
function bindClassicCropDragEvents(...args){ return classicImageEditor.bindClassicCropDragEvents(...args); }

// Called once by canvas.js, at its original initialization position.
function bindClassicMediaImportEvents(){
    board.addEventListener('dragover', e => {
        if(isCanvasLockedByOther()){
            dropOverlay.classList.remove('active');
            return;
        }
        if(e.target.closest?.('.image-node')){
            dropOverlay.classList.remove('active');
            return;
        }
        if(isCanvasInputDrag(e.dataTransfer)){
            dropOverlay.classList.remove('active');
            return;
        }
        if(hasCanvasNodeAssetDrag(e.dataTransfer) || Array.from(e.dataTransfer?.types || []).includes('application/x-canvas-asset') || hasImageDropData(e.dataTransfer) || hasOutputImageDrag(e.dataTransfer)){
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            dropOverlay.classList.add('active');
        }
    });
    board.addEventListener('dragleave', e => {
        if(e.target === board || !board.contains(e.relatedTarget)) dropOverlay.classList.remove('active');
    });
    board.addEventListener('drop', async e => {
        e.preventDefault();
        dropOverlay.classList.remove('active');
        if(isCanvasLockedByOther()){
            setStatus('画布正被其他人编辑中，无法操作');
            return;
        }
        if(e.target.closest?.('.image-node')) return;
        if(hasCanvasNodeAssetDrag(e.dataTransfer)) {
            const payload = readCanvasNodeAssetDrag(e.dataTransfer);
            if(payload?.url) createImageCardFromUrl(payload.url, screenToWorld(e.clientX, e.clientY), payload.name || 'asset', {kind:payload.kind || '', asset_uris:payload.asset_uris || {}});
            return;
        }
        if(hasOutputImageDrag(e.dataTransfer)) {
            createImageCardFromOutput(e.dataTransfer.getData('application/x-canvas-output-image'), screenToWorld(e.clientX, e.clientY));
            return;
        }
        if(Array.from(e.dataTransfer?.types || []).includes('application/x-canvas-asset')){
            try {
                const payload = JSON.parse(e.dataTransfer.getData('application/x-canvas-asset') || '{}');
                if(payload?.url) {
                    if(String(payload.kind || '').toLowerCase() === 'workflow') await importWorkflowAssetUrl(payload.url, payload.name || 'workflow');
                    else createImageCardFromUrl(payload.url, screenToWorld(e.clientX, e.clientY), payload.name || 'asset', {kind:payload.kind || '', asset_uris:payload.asset_uris || {}, asset_item_id:payload.asset_item_id || '', asset_library_id:payload.asset_library_id || ''});
                }
            } catch(err) {}
            return;
        }
        if(isCanvasInputDrag(e.dataTransfer)) {
            internalDrag = false;
            return;
        }
        const payload = await resolveImageDropPayload(e.dataTransfer);
        if(payload.type === 'none') return;
        try {
            await applyImageDropPayloadToBoard(payload, screenToWorld(e.clientX, e.clientY));
        } catch(err) {
            setStatus('Ready');
            showErrorModal(err.message || ('导入图片失败'), '导入图片失败');
        }
    });
    window.addEventListener('dragend', () => dropOverlay.classList.remove('active'));
    window.addEventListener('drop', () => dropOverlay.classList.remove('active'));
    window.addEventListener('paste', e => {
        if(!canvas) return;
        if(isCanvasLockedByOther()){
            setStatus('画布正被其他人编辑中，无法操作');
            return;
        }
        const files = [...(e.clipboardData?.items || [])].filter(x => x.kind === 'file' && /^(image|video|audio)\//.test(String(x.type || ''))).map(x => x.getAsFile());
        if(!files.length) return;
        e.preventDefault();
        lastImagePasteAt = Date.now();
        const blank = [...selected].map(id => nodes.find(n => n.id === id)).find(n => n?.type === 'image' && !n.url);
        if(blank) fillImageNode(blank.id, files);
        else if(files.length > 1) uploadImageGroup(files);
        else uploadImages(files);
    });
}

function hasImageFiles(items){
    return [...(items || [])].some(item => {
        const entry = dataTransferItemEntry(item);
        return entry?.isDirectory || (item.kind === 'file' && (/^(image|video|audio)\//.test(String(item.type || '')) || isSupportedUploadFile(item.getAsFile?.())));
    });
}

function isCanvasInputDrag(dataTransfer){
    return internalDrag || [...(dataTransfer?.types || [])].includes('application/x-canvas-input');
}

function hasImageDropData(dataTransfer){
    if(!dataTransfer) return false;
    if(isCanvasInputDrag(dataTransfer)) return false;
    if(imageFilesFromDataTransfer(dataTransfer).length) return true;
    if(hasImageFiles(dataTransfer.items)) return true;
    const types = dropDataTypes(dataTransfer);
    if(types.some(type => IMAGE_DROP_TYPE_HINT_RE.test(type.toLowerCase()))) return true;
    return imageDropPayload(dataTransfer).type !== 'none';
}

function hasOutputImageDrag(dataTransfer){ return [...(dataTransfer?.types || [])].includes('application/x-canvas-output-image'); }
