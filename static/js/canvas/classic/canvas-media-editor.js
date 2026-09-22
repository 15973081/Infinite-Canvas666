/* Classic canvas: Media import/upload, crop, draw, text and grid editing.
 * Browser classic script (not an ES module); loaded before canvas.js.
 * Function declarations only: initialization is explicitly invoked by the entry.
 * Uses the entry's existing shared bindings; do not duplicate permission or document state.
 */

// Called once by canvas.js, at its original initialization position.
function bindClassicImageEditorControls(){
    document.getElementById('cropBox').addEventListener('mousedown', event => beginCropDrag(event, 'move'));
    document.getElementById('cropHandle').addEventListener('mousedown', event => beginCropDrag(event, 'resize'));
    document.getElementById('outpaintFrame')?.addEventListener('mousedown', event => {
        if(event.target.closest('[data-outpaint-handle]')) return;
        document.getElementById('cropCanvas')?.classList.add('dragging-image');
        beginCropDrag(event, 'image');
    });
    document.querySelectorAll('[data-outpaint-handle]').forEach(handle => {
        handle.addEventListener('mousedown', event => beginCropDrag(event, `outpaint-${handle.dataset.outpaintHandle || 'corner'}`));
    });
    document.getElementById('cropImage')?.addEventListener('mousedown', event => {
        if(imageEditMode !== 'outpaint' || !cropState) return;
        document.getElementById('cropCanvas')?.classList.add('dragging-image');
        beginCropDrag(event, 'image');
    });
    document.querySelectorAll('[data-image-edit-mode]').forEach(btn => {
        btn.addEventListener('click', event => {
            event.stopPropagation();
            setImageEditMode(btn.dataset.imageEditMode || 'crop', true);
        });
    });
    document.getElementById('editDrawCanvas').addEventListener('pointerdown', beginEditDraw);
    document.getElementById('editDrawCanvas').addEventListener('pointermove', moveEditDraw);
    document.getElementById('editDrawCanvas').addEventListener('pointerup', endEditDraw);
    document.getElementById('editDrawCanvas').addEventListener('pointercancel', endEditDraw);
    document.getElementById('editDrawCanvas').addEventListener('pointerleave', endEditDraw);
    document.getElementById('editTextCanvas')?.addEventListener('pointerdown', beginEditText);
    document.getElementById('editTextCanvas')?.addEventListener('pointermove', moveEditText);
    document.getElementById('editTextCanvas')?.addEventListener('pointerup', endEditText);
    document.getElementById('editTextCanvas')?.addEventListener('pointercancel', endEditText);
    document.getElementById('editTextCanvas')?.addEventListener('pointerleave', endEditText);
    document.getElementById('editTextCanvas')?.addEventListener('dblclick', event => {
        if(imageEditMode !== 'brush' || brushTool !== 'text') return;
        event.preventDefault();
        event.stopPropagation();
        const hit = hitEditTextItem(editTextPoint(event));
        if(hit){
            setSelectedEditTextItem(hit.id);
            beginEditTextInline(hit);
        }
    });
    ['paintBrushSize','paintBrushColor'].forEach(id => {
        const control = document.getElementById(id);
        if(!control) return;
        control.addEventListener('input', syncSelectedEditTextStyleFromBrush);
        control.addEventListener('change', () => { editTextDirty = false; });
    });
    ['gridHorizontalLines','gridVerticalLines','gridGapSize'].forEach(id => {
        document.getElementById(id).addEventListener('input', () => {
            syncGridGapValue();
            refreshGridSplitPreview();
        });
    });
    // 图片编辑区滚轮缩放
    document.getElementById('imageEditStage').addEventListener('wheel', event => {
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
        applyImageEditZoom();
        const scale = imageEditZoom / oldZoom;
        stage.scrollLeft = contentX * scale - mx;
        stage.scrollTop = contentY * scale - my;
    }, {passive: false});
}

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
    if(!response.ok) throw new Error(await responseErrorMessage(response, langIsEn() ? 'Local image import failed' : '导入本地图片失败'));
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
    setStatus(langIsEn() ? 'Importing images...' : '导入图片...');
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
        showErrorModal(err.message || (langIsEn() ? 'Image import failed' : '导入图片失败'), langIsEn() ? 'Image import failed' : '导入图片失败');
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

function cropBounds(){
    const img = document.getElementById('cropImage');
    return {w:img.clientWidth || 1, h:img.clientHeight || 1};
}

function editDrawCanvas(){
    return document.getElementById('editDrawCanvas');
}

function editTextCanvas(){
    return document.getElementById('editTextCanvas');
}

function editTextContext(){
    return editTextCanvas()?.getContext('2d') || null;
}

function selectedEditTextItem(){
    return editTextItems.find(item => item.id === editTextSelectedId) || null;
}

function defaultEditTextText(){
    return langIsEn() ? 'Double-click to edit' : '双击编辑';
}

function editTextSizeFromBrush(){
    return Math.max(14, Math.min(120, Math.round(editBrushSize() * 2)));
}

function createEditTextItem(text, point, preset={}){
    const size = Math.max(10, Math.min(120, Number(preset.size) || editTextSizeFromBrush()));
    return {
        id: uid('txt'),
        text: String(text || defaultEditTextText()).trim(),
        x: Number(point?.x || 0),
        y: Number(point?.y || 0),
        color: preset.color || brushColor(),
        size,
    };
}

function textItemFont(item){
    const size = Math.max(10, Math.min(120, Number(item?.size) || 28));
    return `900 ${size}px Arial, sans-serif`;
}

function measureEditTextItem(item, ctx=editTextContext()){
    if(!item || !ctx) return {x:0, y:0, w:0, h:0};
    const size = Math.max(10, Math.min(120, Number(item.size) || 28));
    ctx.save();
    ctx.font = textItemFont(item);
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

function hitEditTextItem(point){
    const ctx = editTextContext();
    if(!ctx) return null;
    for(let i = editTextItems.length - 1; i >= 0; i--){
        const item = editTextItems[i];
        const box = measureEditTextItem(item, ctx);
        if(point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h) return item;
    }
    return null;
}

function renderEditTextCanvas(){
    const canvasEl = editTextCanvas();
    const ctx = editTextContext();
    if(!canvasEl || !ctx) return;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    editTextItems.forEach(item => {
        if(!item?.text) return;
        const selected = item.id === editTextSelectedId;
        const box = measureEditTextItem(item, ctx);
        ctx.save();
        ctx.font = textItemFont(item);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = item.color || brushColor();
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
    positionEditTextInlineEditor();
}

function syncTextToolState(force=false){
    const selected = selectedEditTextItem();
    const cropCanvasEl = document.getElementById('cropCanvas');
    cropCanvasEl?.classList.toggle('text-mode', imageEditMode === 'brush' && brushTool === 'text');
}

function syncSelectedEditTextStyleFromBrush(){
    if(imageEditMode !== 'brush' || brushTool !== 'text' || editTextInlineEditor) return;
    const item = selectedEditTextItem();
    if(!item) return;
    const nextSize = editTextSizeFromBrush();
    const nextColor = brushColor();
    if(item.size === nextSize && item.color === nextColor) return;
    beginTextEditChange();
    item.size = nextSize;
    item.color = nextColor;
    renderEditTextCanvas();
    syncTextToolState(true);
}

function beginTextEditChange(){
    if(editTextDirty) return;
    pushEditDrawHistory();
    editTextDirty = true;
}

function setSelectedEditTextItem(id){
    editTextSelectedId = id || '';
    renderEditTextCanvas();
    syncTextToolState(true);
}

function confirmSelectedEditTextItem(){
    const selected = selectedEditTextItem();
    if(!selected) return false;
    if(!String(selected.text || '').trim()){
        editTextItems = editTextItems.filter(item => item.id !== selected.id);
    }
    editTextSelectedId = '';
    editTextDrag = null;
    editTextDirty = false;
    renderEditTextCanvas();
    syncTextToolState(true);
    return true;
}

function editTextCanvasScale(){
    const canvasEl = editTextCanvas();
    const rect = canvasEl?.getBoundingClientRect?.();
    return {
        x:(rect?.width || canvasEl?.width || 1) / Math.max(1, canvasEl?.width || 1),
        y:(rect?.height || canvasEl?.height || 1) / Math.max(1, canvasEl?.height || 1),
        rect
    };
}

function selectInlineEditorText(el){
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

function inlineEditorText(){
    return String(editTextInlineEditor?.el?.innerText || editTextInlineEditor?.el?.textContent || '').replace(/\u00a0/g, ' ');
}

function autosizeEditTextInlineEditor(){
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

function positionEditTextInlineEditor(){
    const editor = editTextInlineEditor;
    if(!editor?.el) return;
    const item = editTextItems.find(x => x.id === editor.itemId);
    const canvasEl = editTextCanvas();
    const cropCanvasEl = document.getElementById('cropCanvas');
    if(!item || !canvasEl || !cropCanvasEl) return;
    const ctx = editTextContext();
    const box = measureEditTextItem(item, ctx);
    const scale = editTextCanvasScale();
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
    editor.el.style.color = item.color || brushColor();
    autosizeEditTextInlineEditor();
}

function removeEditTextInlineEditor(commit=true){
    const editor = editTextInlineEditor;
    if(!editor) return;
    const item = editTextItems.find(x => x.id === editor.itemId);
    const next = inlineEditorText().trim();
    editTextInlineEditor = null;
    editor.el.remove();
    if(!item) return;
    if(commit){
        if(next !== String(editor.before || '')){
            beginTextEditChange();
            if(next){
                item.text = next;
            } else {
                editTextItems = editTextItems.filter(x => x.id !== item.id);
                editTextSelectedId = '';
            }
        }
    } else {
        item.text = editor.before || item.text || defaultEditTextText();
    }
    editTextDirty = false;
    renderEditTextCanvas();
    syncTextToolState(true);
}

function beginEditTextInline(item){
    if(!item) return;
    removeEditTextInlineEditor(true);
    editTextSelectedId = item.id;
    const host = document.getElementById('cropCanvas');
    if(!host) return;
    const el = document.createElement('div');
    el.className = 'edit-text-inline';
    el.contentEditable = 'true';
    el.spellcheck = false;
    el.textContent = item.text || defaultEditTextText();
    host.appendChild(el);
    editTextInlineEditor = {el, itemId:item.id, before:item.text || ''};
    positionEditTextInlineEditor();
    el.addEventListener('input', autosizeEditTextInlineEditor);
    el.addEventListener('keydown', event => {
        if(event.key === 'Enter' && !event.shiftKey){
            event.preventDefault();
            removeEditTextInlineEditor(true);
        } else if(event.key === 'Escape'){
            event.preventDefault();
            removeEditTextInlineEditor(false);
        }
    });
    el.addEventListener('blur', () => removeEditTextInlineEditor(true));
    requestAnimationFrame(() => {
        el.focus();
        selectInlineEditorText(el);
    });
    renderEditTextCanvas();
    syncTextToolState(true);
}

function editTextPoint(event){
    return editDrawPoint(event);
}

function beginEditText(event){
    if(imageEditMode !== 'brush' || brushTool !== 'text') return;
    event.preventDefault();
    event.stopPropagation();
    removeEditTextInlineEditor(true);
    const canvasEl = editTextCanvas();
    const point = editTextPoint(event);
    const hit = hitEditTextItem(point);
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
        syncTextToolState(true);
        renderEditTextCanvas();
        return;
    }
    if(selectedEditTextItem()){
        confirmSelectedEditTextItem();
        return;
    }
    beginTextEditChange();
    const item = createEditTextItem(defaultEditTextText(), point, {color:brushColor(), size:editTextSizeFromBrush()});
    editTextItems.push(item);
    editTextSelectedId = item.id;
    canvasEl.style.cursor = 'text';
    renderEditTextCanvas();
    syncTextToolState(true);
}

function updateEditTextCursor(event){
    const canvasEl = editTextCanvas();
    if(!canvasEl || imageEditMode !== 'brush' || brushTool !== 'text') return;
    const hit = hitEditTextItem(editTextPoint(event));
    canvasEl.style.cursor = hit ? 'move' : 'text';
}

function moveEditText(event){
    if(!editTextDrag){
        updateEditTextCursor(event);
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
        beginTextEditChange();
        editTextDrag.hasHistory = true;
    }
    const canvasEl = editTextCanvas();
    const rect = canvasEl?.getBoundingClientRect?.();
    const scaleX = canvasEl ? canvasEl.width / Math.max(1, rect?.width || canvasEl.width) : 1;
    const scaleY = canvasEl ? canvasEl.height / Math.max(1, rect?.height || canvasEl.height) : 1;
    item.x = editTextDrag.startX + dx * scaleX;
    item.y = editTextDrag.startY + dy * scaleY;
    renderEditTextCanvas();
}

function endEditText(event){
    if(editTextDrag && event?.pointerId != null) editTextCanvas()?.releasePointerCapture?.(event.pointerId);
    editTextDrag = null;
    editTextDirty = false;
    renderEditTextCanvas();
    syncTextToolState(true);
    if(event) updateEditTextCursor(event);
}

function editTextHasContent(){
    return editTextItems.some(item => String(item?.text || '').trim().length > 0);
}

function resizeEditTextCanvas(){
    const img = document.getElementById('cropImage');
    const canvasEl = editTextCanvas();
    if(!img || !canvasEl) return;
    const w = Math.max(1, img.naturalWidth || img.clientWidth || 1);
    const h = Math.max(1, img.naturalHeight || img.clientHeight || 1);
    if(canvasEl.width !== w) canvasEl.width = w;
    if(canvasEl.height !== h) canvasEl.height = h;
    canvasEl.style.width = `${img.clientWidth || 1}px`;
    canvasEl.style.height = `${img.clientHeight || 1}px`;
    renderEditTextCanvas();
}

function resizeEditDrawCanvas(){
    const img = document.getElementById('cropImage');
    const canvasEl = editDrawCanvas();
    const w = Math.max(1, img.naturalWidth || img.clientWidth || 1);
    const h = Math.max(1, img.naturalHeight || img.clientHeight || 1);
    if(canvasEl.width !== w || canvasEl.height !== h){
        canvasEl.width = w;
        canvasEl.height = h;
    }
    canvasEl.style.width = `${img.clientWidth || 1}px`;
    canvasEl.style.height = `${img.clientHeight || 1}px`;
    resizeEditTextCanvas();
    if(imageEditMode === 'grid') refreshGridSplitPreview();
}

function setImageEditMode(mode, userTouched=false){
    if(userTouched) imageEditModeTouched = true;
    const prevImageEditMode = imageEditMode;
    if(mode !== 'brush') removeEditTextInlineEditor(true);
    imageEditMode = ['preview','crop','outpaint','mask','brush','grid'].includes(mode) ? mode : 'crop';
    const isPreview = imageEditMode === 'preview';
    const cropCanvasEl = document.getElementById('cropCanvas');
    cropCanvasEl.classList.toggle('preview-mode', isPreview);
    cropCanvasEl.classList.toggle('mask-mode', imageEditMode === 'mask');
    cropCanvasEl.classList.toggle('brush-mode', imageEditMode === 'brush');
    cropCanvasEl.classList.toggle('grid-mode', imageEditMode === 'grid');
    cropCanvasEl.classList.toggle('outpaint-mode', imageEditMode === 'outpaint');
    _syncGridCustomCursor();
    document.querySelectorAll('[data-image-edit-mode]').forEach(btn => btn.classList.toggle('active', btn.dataset.imageEditMode === imageEditMode));
    document.getElementById('imageMaskTools').classList.toggle('active', imageEditMode === 'mask');
    document.getElementById('imageBrushTools').classList.toggle('active', imageEditMode === 'brush');
    document.getElementById('imageGridTools').classList.toggle('active', imageEditMode === 'grid');
    syncGridGapValue();
    const title = document.getElementById('imageEditTitle');
    const sub = document.getElementById('imageEditSub');
    const apply = document.getElementById('imageEditApplyBtn');
    if(isPreview){
        apply.style.display = 'none';
        title.textContent = tr('canvas.previewImage');
        sub.textContent = tr('canvas.previewHint');
    } else {
        apply.style.display = '';
        const icon = imageEditMode === 'crop' ? 'crop' : imageEditMode === 'outpaint' ? 'expand' : imageEditMode === 'mask' ? 'brush' : imageEditMode === 'brush' ? 'paintbrush' : 'grid-3x3';
        const labelKey = imageEditMode === 'crop' ? 'canvas.applyCrop' : imageEditMode === 'outpaint' ? 'canvas.applyOutpaint' : imageEditMode === 'mask' ? 'canvas.applyMask' : imageEditMode === 'brush' ? 'canvas.applyBrush' : 'canvas.applyGrid';
        const titleKey = imageEditMode === 'crop' ? 'canvas.cropImage' : imageEditMode === 'outpaint' ? 'canvas.outpaintImage' : imageEditMode === 'mask' ? 'canvas.maskEdit' : imageEditMode === 'brush' ? 'canvas.brushEdit' : 'canvas.modeGrid';
        const subKey = imageEditMode === 'crop' ? 'canvas.cropHint' : imageEditMode === 'outpaint' ? 'canvas.outpaintHint' : imageEditMode === 'mask' ? 'canvas.maskHint2' : imageEditMode === 'brush' ? 'canvas.brushHint' : 'canvas.gridHint';
        title.textContent = tr(titleKey);
        sub.textContent = tr(subKey);
        apply.innerHTML = `<i data-lucide="${icon}" class="w-4 h-4"></i><span>${tr(labelKey)}</span>`;
    }
    resizeEditDrawCanvas();
    if(isPreview) clearEditDrawing(true);
    else if(imageEditMode === 'grid') refreshGridSplitPreview();
    else if(imageEditMode === 'outpaint') resetOutpaintBox();
    else if(imageEditMode === 'crop') clearEditDrawing(true);
    else if(prevImageEditMode === 'grid') clearEditDrawing(true); // 离开 grid 时主动清掉画布上残留的分割线预览
    syncEditDrawingHistoryButtons();
    syncBrushToolButtons();
    syncTextToolState(true);
    refreshIcons();
}

function editDrawSnapshot(){
    const canvasEl = editDrawCanvas();
    return {
        imageData: canvasEl.getContext('2d').getImageData(0, 0, canvasEl.width, canvasEl.height),
        labelCounter: brushLabelCounter,
        textItems: editTextItems.map(item => ({...item})),
        textSelectedId: editTextSelectedId || '',
    };
}

function restoreEditDrawSnapshot(snapshot){
    if(!snapshot) return;
    removeEditTextInlineEditor(false);
    const canvasEl = editDrawCanvas();
    const imageData = snapshot.imageData || snapshot;
    canvasEl.getContext('2d').putImageData(imageData, 0, 0);
    if(snapshot.labelCounter) brushLabelCounter = snapshot.labelCounter;
    editTextItems = (snapshot.textItems || []).map(item => ({...item}));
    editTextSelectedId = snapshot.textSelectedId || '';
    renderEditTextCanvas();
    syncTextToolState(true);
}

function pushEditDrawHistory(){
    editDrawUndoStack.push(editDrawSnapshot());
    if(editDrawUndoStack.length > EDIT_DRAW_HISTORY_MAX) editDrawUndoStack.shift();
    editDrawRedoStack = [];
    syncEditDrawingHistoryButtons();
}

function syncEditDrawingHistoryButtons(){
    ['maskUndoBtn','brushUndoBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if(btn){ btn.disabled = !editDrawUndoStack.length; btn.style.opacity = editDrawUndoStack.length ? '1' : '.42'; }
    });
    ['maskRedoBtn','brushRedoBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if(btn){ btn.disabled = !editDrawRedoStack.length; btn.style.opacity = editDrawRedoStack.length ? '1' : '.42'; }
    });
}

function undoEditDrawing(){
    if(!editDrawUndoStack.length) return;
    editDrawRedoStack.push(editDrawSnapshot());
    restoreEditDrawSnapshot(editDrawUndoStack.pop());
    syncEditDrawingHistoryButtons();
}

function redoEditDrawing(){
    if(!editDrawRedoStack.length) return;
    editDrawUndoStack.push(editDrawSnapshot());
    restoreEditDrawSnapshot(editDrawRedoStack.pop());
    syncEditDrawingHistoryButtons();
}

function clearEditDrawing(silent=false){
    removeEditTextInlineEditor(false);
    const canvasEl = editDrawCanvas();
    if(!silent && editCanvasHasPixels()) pushEditDrawHistory();
    canvasEl.getContext('2d').clearRect(0, 0, canvasEl.width, canvasEl.height);
    const textCanvasEl = editTextCanvas();
    textCanvasEl?.getContext('2d')?.clearRect(0, 0, textCanvasEl.width, textCanvasEl.height);
    editTextItems = [];
    editTextSelectedId = '';
    editTextDrag = null;
    editTextDirty = false;
    brushLabelCounter = 1;
    syncTextToolState(true);
    syncEditDrawingHistoryButtons();
}

function resetEditDrawingHistory(){
    removeEditTextInlineEditor(false);
    editDrawUndoStack = [];
    editDrawRedoStack = [];
    brushLabelCounter = 1;
    editTextItems = [];
    editTextSelectedId = '';
    editTextDrag = null;
    editTextDirty = false;
    renderEditTextCanvas();
    syncTextToolState(true);
    syncEditDrawingHistoryButtons();
}

function setBrushTool(tool){
    if(tool !== 'text') removeEditTextInlineEditor(true);
    brushTool = ['free','rect','ellipse','label','text'].includes(tool) ? tool : 'free';
    syncBrushToolButtons();
    syncTextToolState(true);
}

function syncBrushToolButtons(){
    document.querySelectorAll('[data-brush-tool]').forEach(btn => {
        const active = btn.dataset.brushTool === brushTool;
        btn.classList.toggle('primary', active);
        btn.classList.toggle('secondary', !active);
    });
    const cropCanvasEl = document.getElementById('cropCanvas');
    cropCanvasEl?.classList.toggle('text-mode', imageEditMode === 'brush' && brushTool === 'text');
}

function editDrawPoint(event){
    const canvasEl = editDrawCanvas();
    const rect = canvasEl.getBoundingClientRect();
    return {
        x:(event.clientX - rect.left) * canvasEl.width / Math.max(1, rect.width),
        y:(event.clientY - rect.top) * canvasEl.height / Math.max(1, rect.height),
    };
}

function gridCustomLineHit(point){
    if(!gridCustomLines.length) return -1;
    const canvasEl = editDrawCanvas();
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

function setGridCustomLinePos(index, point){
    const canvasEl = editDrawCanvas();
    const line = gridCustomLines[index];
    if(!line) return;
    line.pos = line.type === 'h'
        ? Math.max(0.001, Math.min(0.999, point.y / Math.max(1, canvasEl.height)))
        : Math.max(0.001, Math.min(0.999, point.x / Math.max(1, canvasEl.width)));
}

function editBrushSize(){
    const id = imageEditMode === 'mask' ? 'maskBrushSize' : 'paintBrushSize';
    return Number(document.getElementById(id)?.value || 20);
}

function brushColor(){
    return document.getElementById('paintBrushColor')?.value || '#ff2d55';
}

function setupDrawStyle(ctx){
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = editBrushSize();
    ctx.strokeStyle = imageEditMode === 'mask' ? MASK_BRUSH_COLOR : brushColor();
    ctx.fillStyle = imageEditMode === 'mask' ? MASK_BRUSH_COLOR : brushColor();
    ctx.globalCompositeOperation = 'source-over';
}

function normalizeMaskPreviewCanvas(canvasEl=editDrawCanvas()){
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

function circledNumber(n){
    if(n >= 1 && n <= 20) return String.fromCharCode(0x2460 + n - 1);
    return String(n);
}

function drawBrushShape(ctx, start, end, preview=false){
    setupDrawStyle(ctx);
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

function drawNumberLabel(point){
    const canvasEl = editDrawCanvas();
    const ctx = canvasEl.getContext('2d');
    const size = Math.max(18, editBrushSize() * 2.2);
    const text = circledNumber(brushLabelCounter++);
    setupDrawStyle(ctx);
    ctx.save();
    ctx.font = `900 ${size}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size / 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeText(text, point.x, point.y);
    ctx.fillStyle = brushColor();
    ctx.fillText(text, point.x, point.y);
    ctx.restore();
}

function beginEditDraw(event){
    if(imageEditMode === 'crop') return;
    if(imageEditMode === 'grid'){
        if(!gridCustomMode) return;
        // 自定义模式：拖动已有线，或点击空白处放置新线
        event.preventDefault();
        event.stopPropagation();
        const canvasEl = editDrawCanvas();
        canvasEl.setPointerCapture?.(event.pointerId);
        const point = editDrawPoint(event);
        const hitIndex = gridCustomLineHit(point);
        gridCustomHistory.push([...gridCustomLines.map(line => ({...line}))]);
        if(hitIndex >= 0){
            gridCustomDrag = {index: hitIndex, pointerId: event.pointerId};
            setGridCustomLinePos(hitIndex, point);
            refreshGridSplitPreview();
            _syncGridCustomUndoBtn();
            return;
        }
        const rect = canvasEl.getBoundingClientRect();
        const fracX = Math.max(0.001, Math.min(0.999, (event.clientX - rect.left) / rect.width));
        const fracY = Math.max(0.001, Math.min(0.999, (event.clientY - rect.top) / rect.height));
        gridCustomLines.push({type: gridCustomOrientation, pos: gridCustomOrientation === 'h' ? fracY : fracX});
        gridCustomDrag = {index: gridCustomLines.length - 1, pointerId: event.pointerId};
        _syncGridCustomUndoBtn();
        refreshGridSplitPreview();
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    const canvasEl = editDrawCanvas();
    canvasEl.setPointerCapture?.(event.pointerId);
    const ctx = canvasEl.getContext('2d');
    const p = editDrawPoint(event);
    pushEditDrawHistory();
    if(imageEditMode === 'brush' && brushTool === 'label'){
        drawNumberLabel(p);
        editDrawState = null;
        canvasEl.releasePointerCapture?.(event.pointerId);
        syncEditDrawingHistoryButtons();
        return;
    }
    editDrawState = {x:p.x, y:p.y, sx:p.x, sy:p.y, pointerId:event.pointerId, snapshot:(imageEditMode === 'brush' && brushTool !== 'free') ? editDrawSnapshot() : null};
    setupDrawStyle(ctx);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.01, p.y + 0.01);
    if(imageEditMode === 'mask' || brushTool === 'free') ctx.stroke();
    normalizeMaskPreviewCanvas(canvasEl);
}

function moveEditDraw(event){
    if(imageEditMode === 'grid' && gridCustomMode && gridCustomDrag){
        event.preventDefault();
        event.stopPropagation();
        setGridCustomLinePos(gridCustomDrag.index, editDrawPoint(event));
        refreshGridSplitPreview();
        return;
    }
    if(!editDrawState || imageEditMode === 'crop' || imageEditMode === 'grid') return;
    event.preventDefault();
    event.stopPropagation();
    const ctx = editDrawCanvas().getContext('2d');
    const p = editDrawPoint(event);
    if(imageEditMode === 'brush' && brushTool !== 'free'){
        restoreEditDrawSnapshot(editDrawState.snapshot);
        drawBrushShape(ctx, {x:editDrawState.sx, y:editDrawState.sy}, p, true);
        return;
    }
    setupDrawStyle(ctx);
    ctx.beginPath();
    ctx.moveTo(editDrawState.x, editDrawState.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    editDrawState.x = p.x;
    editDrawState.y = p.y;
    normalizeMaskPreviewCanvas();
}

function endEditDraw(event){
    if(editDrawState && event?.pointerId != null) editDrawCanvas().releasePointerCapture?.(event.pointerId);
    if(gridCustomDrag && event?.pointerId != null) editDrawCanvas().releasePointerCapture?.(event.pointerId);
    editDrawState = null;
    gridCustomDrag = null;
    syncEditDrawingHistoryButtons();
}

function editCanvasHasPixels(){
    if(editTextHasContent()) return true;
    const canvasEl = editDrawCanvas();
    const data = canvasEl.getContext('2d').getImageData(0, 0, canvasEl.width, canvasEl.height).data;
    for(let i = 3; i < data.length; i += 4) if(data[i] > 0) return true;
    return false;
}

function syncGridGapValue(){
    const input = document.getElementById('gridGapSize');
    const value = Math.max(0, Math.min(240, Number(input?.value || 0)));
    if(input) input.value = value;
    const label = document.getElementById('gridGapValue');
    if(label) label.textContent = String(value);
    return value;
}

function gridSplitSettings(){
    const hLines = Math.max(0, Math.min(20, Number(document.getElementById('gridHorizontalLines')?.value || 0)));
    const vLines = Math.max(0, Math.min(20, Number(document.getElementById('gridVerticalLines')?.value || 0)));
    const gap = syncGridGapValue();
    return {rows:hLines + 1, cols:vLines + 1, gap};
}

function gridSplitRects(width, height){
    if(gridCustomMode) return gridSplitRectsCustom(width, height);
    const {rows, cols, gap} = gridSplitSettings();
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

function gridSplitRectsCustom(width, height){
    const gap = Math.max(0, Math.min(240, Number(document.getElementById('gridGapSize')?.value || 0)));
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

function gridLayoutFromRects(rects){
    const rows = Math.max(1, ...rects.map(r => Number(r.row || 0) + 1));
    const cols = Math.max(1, ...rects.map(r => Number(r.col || 0) + 1));
    return {type:'grid-split', groupId:uid('grid'), rows, cols};
}

function applyGridPreset(rows, cols){
    gridCustomMode = false;
    gridCustomLines = [];
    gridCustomHistory = [];
    gridCustomDrag = null;
    const h = document.getElementById('gridHorizontalLines');
    const v = document.getElementById('gridVerticalLines');
    if(h){ h.disabled = false; h.value = String(Math.max(0, Number(rows || 1) - 1)); }
    if(v){ v.disabled = false; v.value = String(Math.max(0, Number(cols || 1) - 1)); }
    const toggle = document.getElementById('gridCustomToggle');
    const custom = document.getElementById('gridCustomControls');
    const regular = document.getElementById('gridRegularControls');
    if(toggle){
        toggle.classList.remove('primary');
        toggle.classList.add('secondary');
    }
    if(custom) custom.style.display = 'none';
    if(regular) regular.style.display = 'contents';
    _syncGridCustomCursor();
    _syncGridCustomUndoBtn();
    refreshGridSplitPreview();
}

// ——— 自定义宫格辅助函数 ———
function toggleGridCustomMode(){
    gridCustomMode = !gridCustomMode;
    if(gridCustomMode){ gridCustomLines = []; gridCustomHistory = []; } // 进入自定义时清空旧线及历史
    gridCustomDrag = null;
    const toggle = document.getElementById('gridCustomToggle');
    const regular = document.getElementById('gridRegularControls');
    const custom = document.getElementById('gridCustomControls');
    toggle.classList.toggle('primary', gridCustomMode);
    toggle.classList.toggle('secondary', !gridCustomMode);
    // 禁用/启用常规输入
    ['gridHorizontalLines','gridVerticalLines'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.disabled = gridCustomMode;
    });
    if(custom) custom.style.display = gridCustomMode ? 'flex' : 'none';
    _syncGridCustomCursor();
    _syncGridCustomUndoBtn();
    refreshGridSplitPreview();
}

function setGridCustomOrientation(orient){
    gridCustomOrientation = orient;
    document.getElementById('gridOrientH').classList.toggle('primary', orient === 'h');
    document.getElementById('gridOrientH').classList.toggle('secondary', orient !== 'h');
    document.getElementById('gridOrientV').classList.toggle('primary', orient === 'v');
    document.getElementById('gridOrientV').classList.toggle('secondary', orient !== 'v');
    _syncGridCustomCursor();
}

function clearGridCustomLines(){
    gridCustomHistory = [];
    gridCustomLines = [];
    gridCustomDrag = null;
    _syncGridCustomUndoBtn();
    refreshGridSplitPreview();
}

function undoGridCustomLine(){
    if(!gridCustomHistory.length) return;
    gridCustomLines = gridCustomHistory.pop();
    gridCustomDrag = null;
    _syncGridCustomUndoBtn();
    refreshGridSplitPreview();
}

function _syncGridCustomUndoBtn(){
    const btn = document.getElementById('gridUndoBtn');
    if(!btn) return;
    btn.disabled = gridCustomHistory.length === 0;
    btn.style.opacity = gridCustomHistory.length === 0 ? '0.4' : '1';
}

// ——— 图片缩放 ———
function applyImageEditZoom(){
    if(!imageEditBaseW) return;
    const img = document.getElementById('cropImage');
    const oldW = img.clientWidth;
    img.style.maxWidth = 'none';
    img.style.maxHeight = 'none';
    img.style.width = Math.round(imageEditBaseW * imageEditZoom) + 'px';
    img.style.height = Math.round(imageEditBaseH * imageEditZoom) + 'px';
    resizeEditDrawCanvas();
    // 按比例同步裁剪框位置
    if(cropState && oldW > 0){
        const scale = img.clientWidth / oldW;
        cropState.x = Math.round(cropState.x * scale);
        cropState.y = Math.round(cropState.y * scale);
        cropState.w = Math.round(cropState.w * scale);
        cropState.h = Math.round(cropState.h * scale);
        clampCrop();
        renderCropBox();
    }
    if(imageEditMode === 'grid') refreshGridSplitPreview();
    syncImageEditOverflow();
    _updateZoomLabel();
}

function syncImageEditOverflow(){
    const stage = document.getElementById('imageEditStage');
    const crop = document.getElementById('cropCanvas');
    if(!stage || !crop) return;
    const rect = crop.getBoundingClientRect();
    const pad = 36;
    const overflowX = rect.width + pad > stage.clientWidth;
    const overflowY = rect.height + pad > stage.clientHeight;
    stage.classList.toggle('overflowing', overflowX || overflowY);
    stage.classList.toggle('overflow-x', overflowX);
    stage.classList.toggle('overflow-y', overflowY);
}

function resetImageEditZoom(){
    const stage = document.getElementById('imageEditStage');
    imageEditZoom = 1.0;
    applyImageEditZoom();
    if(stage){ stage.scrollLeft = 0; stage.scrollTop = 0; }
}

function _updateZoomLabel(){
    const el = document.getElementById('imageEditZoomLabel');
    if(el) el.textContent = Math.round(imageEditZoom * 100) + '%';
}

function _syncGridCustomCursor(){
    const cropCanvasEl = document.getElementById('cropCanvas');
    cropCanvasEl.classList.toggle('grid-custom-h', imageEditMode === 'grid' && gridCustomMode && gridCustomOrientation === 'h');
    cropCanvasEl.classList.toggle('grid-custom-v', imageEditMode === 'grid' && gridCustomMode && gridCustomOrientation === 'v');
}

function refreshGridSplitPreview(){
    const canvasEl = editDrawCanvas();
    const ctx = canvasEl.getContext('2d');
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    if(imageEditMode !== 'grid') return;
    const countEl = document.getElementById('gridSplitCount');
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
        const gap = Math.max(0, Math.min(240, Number(document.getElementById('gridGapSize')?.value || 0)));
        const hLines = gridCustomLines.filter(l => l.type === 'h');
        const vLines = gridCustomLines.filter(l => l.type === 'v');
        if(countEl) countEl.textContent = tr('canvas.gridWillOutput').replace('{n}', (hLines.length + 1) * (vLines.length + 1));
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
    const {rows, cols, gap} = gridSplitSettings();
    if(countEl) countEl.textContent = tr('canvas.gridWillOutput').replace('{n}', rows * cols);
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

function imageEditorOutputPoint(node, offsetY=0){
    return {x:(node.x || 0) + Number(node.w || 260) + 36, y:(node.y || 0) + offsetY};
}

function imageEditorOutputNode(sourceNode){
    let out = connections.filter(c => c.from === sourceNode.id)
        .map(c => nodes.find(n => n.id === c.to))
        .find(n => n?.type === 'output');
    if(!out){
        const p = imageEditorOutputPoint(sourceNode, 0);
        out = {id:uid('out'), type:'output', x:p.x, y:p.y, images:[]};
        nodes.push(out);
    }
    return out;
}

function addGeneratedImageNode(file, sourceNode, suffix, offsetY=0, extra={}){
    const p = imageEditorOutputPoint(sourceNode, offsetY);
    const next = {id:uid('img'), type:'image', x:p.x, y:p.y, url:file.url, name:file.name || suffix, ...extra};
    nodes.push(next);
    selected.clear();
    selected.add(next.id);
    return next;
}

function renderCropBox(){
    if(!cropState) return;
    const cropCanvasEl = document.getElementById('cropCanvas');
    const img = document.getElementById('cropImage');
    const draw = editDrawCanvas();
    const textCanvas = editTextCanvas();
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
        updateOutpaintResolutionLabel();
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
    const box = document.getElementById('cropBox');
    box.style.left = `${boxX}px`;
    box.style.top = `${boxY}px`;
    box.style.width = `${cropState.w}px`;
    box.style.height = `${cropState.h}px`;
    const outpaintFrame = document.getElementById('outpaintFrame');
    if(outpaintFrame){
        outpaintFrame.style.left = imageEditMode === 'outpaint' ? '0px' : `${boxX}px`;
        outpaintFrame.style.top = imageEditMode === 'outpaint' ? '0px' : `${boxY}px`;
        outpaintFrame.style.width = `${cropState.w}px`;
        outpaintFrame.style.height = `${cropState.h}px`;
    }
}

function outpaintNaturalSize(){
    const img = document.getElementById('cropImage');
    if(!img || !cropState) return {w:1, h:1};
    const scaleX = Math.max(1, Number(img.naturalWidth || 1)) / Math.max(1, Number(img.clientWidth || 1));
    const scaleY = Math.max(1, Number(img.naturalHeight || 1)) / Math.max(1, Number(img.clientHeight || 1));
    return {
        w:Math.max(1, Math.round((cropState.w || 1) * scaleX)),
        h:Math.max(1, Math.round((cropState.h || 1) * scaleY))
    };
}

function updateOutpaintResolutionLabel(){
    const label = document.getElementById('outpaintResolution');
    const cropCanvasEl = document.getElementById('cropCanvas');
    if(!label || !cropState) return;
    const size = outpaintNaturalSize();
    cropCanvasEl?.classList.toggle('outpaint-warning', exceedsFourKStandard(size.w, size.h));
    label.textContent = `${Math.round(size.w)} x ${Math.round(size.h)}`;
}

function clampOutpaint(){
    if(!cropState) return;
    const {w, h} = cropBounds();
    cropState.w = Math.max(w, cropState.w);
    cropState.h = Math.max(h, cropState.h);
    cropState.x = Math.min(cropState.w - w, Math.max(0, cropState.x));
    cropState.y = Math.min(cropState.h - h, Math.max(0, cropState.y));
}

function resetOutpaintBox(){
    if(!cropState) return;
    const {w, h} = cropBounds();
    cropState.x = 0;
    cropState.y = 0;
    cropState.w = w;
    cropState.h = h;
    renderCropBox();
}

function resetCropBox(){
    if(!cropState) return;
    if(imageEditMode === 'outpaint') return resetOutpaintBox();
    const {w, h} = cropBounds();
    cropState.x = Math.round(w * 0.08);
    cropState.y = Math.round(h * 0.08);
    cropState.w = Math.round(w * 0.84);
    cropState.h = Math.round(h * 0.84);
    renderCropBox();
}

function openImageEditor(nodeId, initialMode='crop'){
    const node = nodes.find(n => n.id === nodeId);
    if(!node?.url) return;
    if(mediaKindForNode(node) !== 'image') return;
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
    const toggle = document.getElementById('gridCustomToggle');
    if(toggle){ toggle.classList.add('secondary'); toggle.classList.remove('primary'); }
    const custom = document.getElementById('gridCustomControls');
    if(custom) custom.style.display = 'none';
    ['gridHorizontalLines','gridVerticalLines'].forEach(id => { const el = document.getElementById(id); if(el) el.disabled = false; });
    const orientH = document.getElementById('gridOrientH');
    const orientV = document.getElementById('gridOrientV');
    if(orientH){ orientH.classList.add('primary'); orientH.classList.remove('secondary'); }
    if(orientV){ orientV.classList.add('secondary'); orientV.classList.remove('primary'); }
    _syncGridCustomUndoBtn();
    _updateZoomLabel();
    const modal = document.getElementById('imageEditModal');
    const img = document.getElementById('cropImage');
    img.style.width = '';
    img.style.height = '';
    img.style.maxWidth = '';
    img.style.maxHeight = '';
    modal.classList.add('open');
    img.onload = () => {
        // 记录 zoom=1 时的基础显示尺寸
        imageEditBaseW = img.clientWidth;
        imageEditBaseH = img.clientHeight;
        _updateZoomLabel();
        resizeEditDrawCanvas();
        resetEditDrawingHistory();
        clearEditDrawing(true);
        resetCropBox();
        if(!imageEditModeTouched) setImageEditMode(initialMode);
        syncImageEditOverflow();
        refreshIcons();
    };
    img.crossOrigin = 'anonymous';
    window.CanvasMediaLoader?.watch(img);
    img.src = canvasDisplayMediaUrl(node.url);
    setImageEditMode(initialMode);
    refreshIcons();
}

function closeImageEditor(){
    window.CanvasMediaLoader?.end('image-editor');
    document.getElementById('imageEditModal').classList.remove('open');
    const img = document.getElementById('cropImage');
    img.onload = null;
    img.removeAttribute('src');
    img.style.width = '';
    img.style.height = '';
    img.style.maxWidth = '';
    img.style.maxHeight = '';
    clearEditDrawing(true);
    cropState = null;
    cropDrag = null;
    editDrawState = null;
    resetEditDrawingHistory();
    gridCustomDrag = null;
    imageEditZoom = 1.0;
    imageEditBaseW = 0;
    imageEditBaseH = 0;
    imageEditModeTouched = false;
    document.getElementById('imageEditStage')?.classList.remove('overflowing', 'overflow-x', 'overflow-y');
    const cropCanvasEl = document.getElementById('cropCanvas');
    cropCanvasEl.classList.remove('grid-custom-h', 'grid-custom-v', 'outpaint-mode', 'outpaint-warning', 'dragging-image', 'text-mode');
    cropCanvasEl.style.width = '';
    cropCanvasEl.style.height = '';
    const textCanvas = editTextCanvas();
    if(textCanvas){
        textCanvas.style.left = '';
        textCanvas.style.top = '';
    }
}

function clampCrop(){
    if(!cropState) return;
    if(imageEditMode === 'outpaint') return clampOutpaint();
    const {w, h} = cropBounds();
    cropState.w = Math.max(24, Math.min(cropState.w, w));
    cropState.h = Math.max(24, Math.min(cropState.h, h));
    cropState.x = Math.max(0, Math.min(cropState.x, w - cropState.w));
    cropState.y = Math.max(0, Math.min(cropState.y, h - cropState.h));
}

function beginCropDrag(event, mode){
    if(!cropState) return;
    event.preventDefault();
    event.stopPropagation();
    if(imageEditMode === 'outpaint' && mode === 'move') return;
    cropDrag = {mode, sx:event.clientX, sy:event.clientY, start:{...cropState}};
}

function resizeOutpaintFromDrag(dx, dy){
    const start = cropDrag?.start;
    if(!start) return;
    let growX = 0, growY = 0;
    if(cropDrag.mode === 'outpaint-left') growX = -dx;
    else if(cropDrag.mode === 'outpaint-right') growX = dx;
    else if(cropDrag.mode === 'outpaint-top') growY = -dy;
    else if(cropDrag.mode === 'outpaint-bottom') growY = dy;
    else if(cropDrag.mode === 'outpaint-corner'){ growX = dx; growY = dy; }
    const {w, h} = cropBounds();
    const nextW = Math.max(w, start.w + growX * 2);
    const nextH = Math.max(h, start.h + growY * 2);
    cropState.w = nextW;
    cropState.h = nextH;
    cropState.x = start.x + Math.round((nextW - start.w) / 2);
    cropState.y = start.y + Math.round((nextH - start.h) / 2);
    clampOutpaint();
}

// Called once by canvas.js, at its original initialization position.
function bindClassicCropDragEvents(){
    window.addEventListener('mousemove', event => {
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
            resizeOutpaintFromDrag(dx, dy);
        } else {
            cropState.w = cropDrag.start.w + dx;
            cropState.h = cropDrag.start.h + dy;
        }
        clampCrop();
        renderCropBox();
    });
    window.addEventListener('mouseup', () => { cropDrag = null; document.getElementById('cropCanvas')?.classList.remove('dragging-image'); });
}

async function uploadCroppedBlob(blob, name){
    const form = new FormData();
    form.append('files', blob, name);
    const data = await window.CanvasApi.uploadAi(form);
    return data.files?.[0];
}

async function uploadImageBlobs(blobs){
    const form = new FormData();
    blobs.forEach(item => form.append('files', item.blob, item.name));
    const data = await window.CanvasApi.uploadAi(form);
    return data.files || [];
}

async function applyImageCrop(){
    if(!cropState) return;
    const node = nodes.find(n => n.id === cropState.nodeId);
    const img = document.getElementById('cropImage');
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
    if(!blob) return;
    const base = (node.name || 'image').replace(/\.[^.]+$/, '');
    const file = await uploadCroppedBlob(blob, `${base}_crop.png`);
    if(file){
        clearCanvasFaceAuth(node);
        node.url = file.url;
        node.name = file.name;
        closeImageEditor();
        render();
        scheduleSave();
    }
}

async function applyImageOutpaint(){
    if(!cropState) return;
    const node = nodes.find(n => n.id === cropState.nodeId);
    const img = document.getElementById('cropImage');
    if(!node || !img.naturalWidth || !img.naturalHeight) return;
    clampOutpaint();
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
    if(!blob) return;
    const base = (node.name || 'image').replace(/\.[^.]+$/, '');
    const file = await uploadCroppedBlob(blob, `${base}_outpaint.png`);
    if(file){
        clearCanvasFaceAuth(node);
        node.url = file.url;
        node.name = file.name;
        node.mediaKind = 'image';
        node.natural_w = outW;
        node.natural_h = outH;
        closeImageEditor();
        render();
        scheduleSave();
    }
}

async function applyImageMask(){
    if(!cropState) return;
    const node = nodes.find(n => n.id === cropState.nodeId);
    if(!node || !editCanvasHasPixels()) return;
    const mask = maskCanvasFromDrawCanvas(editDrawCanvas());
    const blob = await new Promise(resolve => mask.toBlob(resolve, 'image/png'));
    if(!blob) return;
    const base = (node.name || 'image').replace(/\.[^.]+$/, '');
    const file = await uploadCroppedBlob(blob, `${base}_mask.png`);
    if(file){
        addGeneratedImageNode(file, node, 'mask', 28, {role:'mask'});
        closeImageEditor();
        render();
        scheduleSave();
    }
}

function maskCanvasFromDrawCanvas(src){
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

async function applyImageBrush(){
    if(!cropState) return;
    removeEditTextInlineEditor(true);
    const node = nodes.find(n => n.id === cropState.nodeId);
    const img = document.getElementById('cropImage');
    if(!node || !img.naturalWidth || !img.naturalHeight || !editCanvasHasPixels()) return;
    const canvasEl = document.createElement('canvas');
    canvasEl.width = img.naturalWidth;
    canvasEl.height = img.naturalHeight;
    const ctx = canvasEl.getContext('2d');
    ctx.drawImage(img, 0, 0, canvasEl.width, canvasEl.height);
    ctx.drawImage(editDrawCanvas(), 0, 0);
    ctx.drawImage(editTextCanvas(), 0, 0);
    const blob = await new Promise(resolve => canvasEl.toBlob(resolve, 'image/png'));
    if(!blob) return;
    const base = (node.name || 'image').replace(/\.[^.]+$/, '');
    const file = await uploadCroppedBlob(blob, `${base}_paint.png`);
    if(file){
        clearCanvasFaceAuth(node);
        node.url = file.url;
        node.name = file.name;
        closeImageEditor();
        render();
        scheduleSave();
    }
}

async function applyImageGridSplit(){
    if(!cropState) return;
    const node = nodes.find(n => n.id === cropState.nodeId);
    const img = document.getElementById('cropImage');
    if(!node || !img.naturalWidth || !img.naturalHeight) return;
    const rects = gridSplitRects(img.naturalWidth, img.naturalHeight);
    if(!rects.length) return;
    const base = (node.name || 'image').replace(/\.[^.]+$/, '');
    const blobs = [];
    for(const rect of rects){
        const canvasEl = document.createElement('canvas');
        canvasEl.width = rect.w;
        canvasEl.height = rect.h;
        canvasEl.getContext('2d').drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
        const blob = await new Promise(resolve => canvasEl.toBlob(resolve, 'image/png'));
        if(blob) blobs.push({blob, name:`${base}_r${rect.row + 1}_c${rect.col + 1}.png`});
    }
    if(!blobs.length) return;
    const files = await uploadImageBlobs(blobs);
    if(files.length){
        const out = imageEditorOutputNode(node);
        const urls = files.map(file => file.url).filter(Boolean);
        const layout = gridLayoutFromRects(rects);
        appendOutputImages(out, urls, {url:node.url, name:node.name || 'source image'}, urls.map((url, i) => ({
            runMs:0,
            run:{prompt:'宫格切分', refs:[{url:node.url, name:node.name || 'source image'}]},
            grid:{...layout, row:rects[i]?.row || 0, col:rects[i]?.col || 0, w:rects[i]?.w || 1, h:rects[i]?.h || 1}
        })), layout);
        closeImageEditor();
        render();
        scheduleSave();
    }
}

function applyImageEdit(){
    if(imageEditMode === 'outpaint') return applyImageOutpaint();
    if(imageEditMode === 'mask') return applyImageMask();
    if(imageEditMode === 'brush') return applyImageBrush();
    if(imageEditMode === 'grid') return applyImageGridSplit();
    return applyImageCrop();
}

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
            showErrorModal(err.message || (langIsEn() ? 'Image import failed' : '导入图片失败'), langIsEn() ? 'Image import failed' : '导入图片失败');
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
