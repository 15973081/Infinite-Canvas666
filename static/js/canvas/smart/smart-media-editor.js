/* Smart canvas: Media import/upload, crop, draw, text and grid editing.
 * Browser classic script (not an ES module); loaded before smart-canvas.js.
 * Function declarations only: initialization is explicitly invoked by the entry.
 * Uses the entry's existing shared bindings; do not duplicate permission or document state.
 */

function tempShUploadedUrlFor(url, sourceSettings=settings){
    const source = String(url || '');
    const manualLinks = ((sourceSettings || settings).videoTempShLinks || []).filter(item => item?.manual === true);
    const links = [...(transientSmartCloudLinks || []), ...manualLinks];
    const match = links.find(item =>
        item?.url && (item?.source === source || item?.originalLocalUrl === source || item?.url === source)
    );
    return match?.url || url;
}

function mediaRefSourceUrl(ref){
    return localDisplayUrlForMediaItem(ref) || ref?.sourceUrl || ref?.originalLocalUrl || ref?.url || '';
}

function applyUploadedUrlsToSmartRefs(refs, sourceSettings=settings){
    return (refs || []).map(ref => {
        if(!ref?.url) return ref;
        const sourceUrl = mediaRefSourceUrl(ref);
        const url = tempShUploadedUrlFor(sourceUrl, sourceSettings);
        return url && url !== ref.url ? {...ref, url, originalLocalUrl:ref.originalLocalUrl || ref.url} : ref;
    });
}

function manualSmartVideoLink(sourceSettings=settings){
    return ((sourceSettings || settings).videoTempShLinks || []).find(item => item?.manual === true && item?.url) || null;
}

function manualSmartMediaLinks(sourceSettings=settings){
    return ((sourceSettings || settings).videoTempShLinks || []).filter(item => item?.manual === true && item?.url);
}

function renderedInputMediaRefs(){
    if(!inputThumbsRow) return [];
    return [...inputThumbsRow.querySelectorAll('.input-thumb')].map((el, index) => ({
        url:el.dataset.url || '',
        sourceUrl:el.dataset.sourceUrl || el.dataset.url || '',
        nodeId:el.dataset.nodeId || '',
        imageIndex:Number.isFinite(Number(el.dataset.imageIndex)) ? Number(el.dataset.imageIndex) : index,
        kind:el.dataset.kind || '',
        name:tr('smart.inputNum').replace('{n}', String(index + 1)),
        role:`image_${index + 1}`
    })).filter(ref => ref.url);
}

function currentSmartMediaRefs(node){
    if(!node) return [];
    const request = buildPromptRequest(node, null, true, smartLoopContext);
    return (request.refs || []).filter(ref => ref?.url && ['image','video'].includes(mediaKindForItem(ref)));
}

function currentUploadMediaRefs(node){
    const rendered = renderedInputMediaRefs();
    if(rendered.length) return rendered;
    return currentSmartMediaRefs(node);
}

function currentSmartMediaLinks(node=null){
    return currentUploadMediaRefs(node || activeSettingsSubject()).map(ref => {
        const sourceUrl = mediaRefSourceUrl(ref);
        const uploaded = tempShUploadedUrlFor(sourceUrl);
        return uploaded && uploaded !== sourceUrl ? uploaded : '';
    }).filter(Boolean);
}

function clearManualSmartVideoUrl(){
    settings.videoTempShLinks = (settings.videoTempShLinks || []).filter(item => item?.manual !== true);
}

function splitManualMediaUrls(text){
    return String(text || '')
        .split(/[\s,，]+/)
        .map(url => url.trim())
        .filter(Boolean);
}

async function uploadMediaRefToCloud(ref){
    const kind = mediaKindForItem(ref);
    const sourceUrl = mediaRefSourceUrl(ref);
    if(!sourceUrl) throw new Error('没有可上传的媒体');
    const existing = tempShUploadedUrlFor(sourceUrl);
    if(existing && existing !== sourceUrl) return existing;
    if(/^https?:\/\//i.test(sourceUrl)) return sourceUrl;
    const data = await window.CanvasApi.uploadCloudVideo({url:sourceUrl, service:'auto'});
    const uploadedUrl = data.url || '';
    if(!uploadedUrl) throw new Error('云端没有返回链接');
    transientSmartCloudLinks = [
        ...(transientSmartCloudLinks || []).filter(item => item?.source !== sourceUrl),
        {source:sourceUrl, url:uploadedUrl, expires:data.expires || '3 days', kind}
    ];
    return uploadedUrl;
}

function applyManualVideoUrlToSmartRef(ref, manualUrl){
    if(!manualUrl) return;
    const sourceUrl = mediaRefSourceUrl(ref) || manualUrl;
    settings.videoTempShLinks = [
        ...(settings.videoTempShLinks || []).filter(item => item?.source !== sourceUrl),
        {source:sourceUrl, url:manualUrl, manual:true}
    ];
}

async function setCurrentSmartManualVideoUrl(){
    const node = activeSettingsSubject();
    if(!node) return '';
    savePromptDraftForCurrent();
    const refs = currentUploadMediaRefs(node);
    const firstLocal = refs.find(ref => ref?.url && !isRemoteVideoReferenceUrl(ref.url));
    const firstAny = firstLocal || refs[0] || null;
    const linkedUrls = currentSmartMediaLinks(node);
    const currentLinks = linkedUrls.length ? linkedUrls : (firstAny ? [tempShUploadedUrlFor(mediaRefSourceUrl(firstAny))] : []);
    const value = await openAssetNameDialog({
        title:refs.length > 1 ? `输入 ${refs.length} 个媒体网址 / 火山素材 URI` : '输入媒体网址 / 火山素材 URI',
        value:currentLinks.filter(isRemoteVideoReferenceUrl).join('\n'),
        placeholder:refs.length > 1 ? '每行一个链接，按图1/图2顺序对应' : 'https://example.com/media 或 asset://asset-xxx',
        cancelValue:null,
        multiline:refs.length > 1
    });
    if(value === null) return '';
    const urls = splitManualMediaUrls(value);
    if(!urls.length){
        clearManualSmartVideoUrl();
        persistActiveSmartSettings();
        scheduleSave();
        render();
        toast('已清除手动网址');
        return '';
    }
    const invalid = urls.find(url => !isRemoteVideoReferenceUrl(url));
    if(invalid){
        toast('请输入 http/https 媒体网址或 asset:// 火山素材 URI');
        return '';
    }
    clearManualSmartVideoUrl();
    const targets = refs.length ? refs : [firstAny].filter(Boolean);
    urls.forEach((url, index) => {
        const target = targets[index] || targets[targets.length - 1] || {url};
        applyManualVideoUrlToSmartRef(target, url);
    });
    persistActiveSmartSettings();
    scheduleSave();
    render();
    toast(`已设置 ${urls.length} 个媒体网址`);
    return urls[0] || '';
}

async function uploadCurrentSmartVideosToCloud(){
    const node = activeSettingsSubject();
    if(!node) return [];
    savePromptDraftForCurrent();
    const refs = currentUploadMediaRefs(node);
    const localRefs = refs.filter(ref => {
        const sourceUrl = ref?.sourceUrl || ref?.originalLocalUrl || ref?.url || '';
        if(!sourceUrl) return false;
        const uploaded = tempShUploadedUrlFor(sourceUrl);
        return uploaded !== sourceUrl || !isRemoteVideoReferenceUrl(sourceUrl);
    });
    if(!localRefs.length){
        toast('当前输入图片或视频已是云端链接');
        return [];
    }
    const btn = dynamicParams?.querySelector('[data-trusted-source="cloud"]') || inputThumbsRow?.querySelector('[data-temp-sh-upload-video]');
    if(btn) btn.disabled = true;
    toast(`正在上传 ${localRefs.length} 个媒体文件到云端...`);
    try {
        const urls = [];
        for(const ref of localRefs){
            urls.push(await uploadMediaRefToCloud(ref));
        }
        toast(`云端上传完成：${urls.length} 个媒体文件`);
        return urls;
    } finally {
        if(btn) btn.disabled = false;
    }
}

function readAssetInbox(){
    try {
        const data = JSON.parse(localStorage.getItem(smartScopedStorageKey(SMART_CANVAS_ASSET_INBOX_KEY)) || 'null');
        const items = Array.isArray(data?.items) ? data.items.filter(it => it && it.url) : [];
        if(!items.length) return null;
        if(data.ts && (Date.now() - Number(data.ts)) > 30 * 60 * 1000) return null; // 30 分钟内有效
        return items;
    } catch(e){ return null; }
}

function pasteAssetsFromInbox(){
    const items = readAssetInbox();
    if(!items) return false;
    const center = lastMouseWorld || viewportCenter();
    const cell = 260; // 网格间距（世界坐标）
    const cols = Math.max(1, Math.min(items.length, Math.ceil(Math.sqrt(items.length))));
    const rows = Math.ceil(items.length / cols);
    const startX = center.x - (cols - 1) * cell / 2;
    const startY = center.y - (rows - 1) * cell / 2;
    pushUndo();
    const created = [];
    items.forEach((it, i) => {
        const r = Math.floor(i / cols), c = i % cols;
        const p = {x: startX + c * cell, y: startY + r * cell};
        const node = createImageNodeAt(p, [{url: it.url, name: it.name || 'asset', kind: it.kind || assetMediaKind(it)}], {skipUndo:true, select:false});
        if(node) created.push(node.id);
    });
    selectedId = created.length === 1 ? created[0] : '';
    selectedIds = created.length > 1 ? created : [];
    selectedImage = {nodeId:'', index:-1};
    lastNodePasteAt = Date.now();
    try { localStorage.removeItem(smartScopedStorageKey(SMART_CANVAS_ASSET_INBOX_KEY)); } catch(e){}
    render();
    scheduleSave();
    toast(`已粘贴 ${created.length} 个素材到画布`);
    return true;
}

function pickMediaForSmartNode(nodeId){
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*,audio/*';
    input.multiple = true;
    input.onchange = () => {
        if(input.files?.length) handleFiles(input.files, nodeId);
        input.remove();
    };
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '-9999px';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.click();
}

function currentEditImage(){
    const node = nodes.find(n => n.id === cropState?.nodeId);
    const index = Number(cropState?.imageIndex || 0);
    if(node) return {node, index, image:imageForDisplay(node.images?.[index])};
    if(detachedEditPreview?.node?.id === cropState?.nodeId){
        return {
            node:detachedEditPreview.node,
            index:detachedEditPreview.index,
            image:imageForDisplay(detachedEditPreview.image)
        };
    }
    return {node:null, index, image:null};
}

function cropImageDisplaySize(){
    const img = document.getElementById('cropImage');
    const clientW = Number(img?.clientWidth || 0);
    const clientH = Number(img?.clientHeight || 0);
    if(clientW > 2 && clientH > 2) return {w:clientW, h:clientH};
    ensureImageEditBaseSize();
    const fallbackW = Math.round((imageEditBaseW || Number(img?.naturalWidth || 0) || 1) * imageEditZoom);
    const fallbackH = Math.round((imageEditBaseH || Number(img?.naturalHeight || 0) || 1) * imageEditZoom);
    return {w:Math.max(1, fallbackW), h:Math.max(1, fallbackH)};
}

function cropBounds(){
    return cropImageDisplaySize();
}

function editDrawCanvas(){ return document.getElementById('editDrawCanvas'); }

function editTextCanvas(){ return document.getElementById('editTextCanvas'); }

function editTextContext(){ return editTextCanvas()?.getContext('2d') || null; }

function selectedEditTextItem(){ return editTextItems.find(item => item.id === editTextSelectedId) || null; }

function defaultEditTextText(){ return '双击编辑'; }

function editTextSizeFromBrush(){ return Math.max(14, Math.min(120, Math.round(editBrushSize() * 2))); }

function createEditTextItem(text, point, preset={}){
    const size = Math.max(10, Math.min(120, Number(preset.size) || editTextSizeFromBrush()));
    return {id:uid('txt'), text:String(text || defaultEditTextText()).trim(), x:Number(point?.x || 0), y:Number(point?.y || 0), color:preset.color || brushColor(), size};
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
    return {x:item.x - width / 2 - pad, y:item.y - (ascent + descent) / 2 - pad, w:width + pad * 2, h:ascent + descent + pad * 2, textW:width, textH:ascent + descent, pad};
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
    if(!String(selected.text || '').trim()) editTextItems = editTextItems.filter(item => item.id !== selected.id);
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
    return {x:(rect?.width || canvasEl?.width || 1) / Math.max(1, canvasEl?.width || 1), y:(rect?.height || canvasEl?.height || 1) / Math.max(1, canvasEl?.height || 1), rect};
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
    el.style.width = `${Math.max(Number(editor.minW || 48), el.scrollWidth + 10)}px`;
    el.style.height = `${Math.max(Number(editor.minH || 28), el.scrollHeight + 4)}px`;
}

function positionEditTextInlineEditor(){
    const editor = editTextInlineEditor;
    if(!editor?.el) return;
    const item = editTextItems.find(x => x.id === editor.itemId);
    const canvasEl = editTextCanvas();
    const cropCanvasEl = document.getElementById('cropCanvas');
    if(!item || !canvasEl || !cropCanvasEl) return;
    const box = measureEditTextItem(item, editTextContext());
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
            if(next) item.text = next;
            else {
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
        if(event.key === 'Enter' && !event.shiftKey){ event.preventDefault(); removeEditTextInlineEditor(true); }
        else if(event.key === 'Escape'){ event.preventDefault(); removeEditTextInlineEditor(false); }
    });
    el.addEventListener('blur', () => removeEditTextInlineEditor(true));
    requestAnimationFrame(() => { el.focus(); selectInlineEditorText(el); });
    renderEditTextCanvas();
    syncTextToolState(true);
}

function editTextPoint(event){ return editDrawPoint(event); }

function beginEditText(event){
    if(imageEditMode !== 'brush' || brushTool !== 'text') return;
    event.preventDefault(); event.stopPropagation();
    removeEditTextInlineEditor(true);
    const canvasEl = editTextCanvas();
    const point = editTextPoint(event);
    const hit = hitEditTextItem(point);
    if(hit){
        editTextSelectedId = hit.id;
        editTextDrag = {id:hit.id, pointerId:event.pointerId, startX:hit.x, startY:hit.y, sx:event.clientX, sy:event.clientY, moved:false, hasHistory:false};
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
    event.preventDefault(); event.stopPropagation();
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

function editTextHasContent(){ return editTextItems.some(item => String(item?.text || '').trim().length > 0); }

function resizeEditTextCanvas(){
    const img = document.getElementById('cropImage');
    const canvasEl = editTextCanvas();
    if(!img || !canvasEl) return;
    const display = cropImageDisplaySize();
    const w = Math.max(1, img.naturalWidth || img.clientWidth || 1);
    const h = Math.max(1, img.naturalHeight || img.clientHeight || 1);
    if(canvasEl.width !== w) canvasEl.width = w;
    if(canvasEl.height !== h) canvasEl.height = h;
    canvasEl.style.width = `${display.w}px`;
    canvasEl.style.height = `${display.h}px`;
    renderEditTextCanvas();
}

function resizeEditDrawCanvas(){
    const img = document.getElementById('cropImage');
    const canvasEl = editDrawCanvas();
    const display = cropImageDisplaySize();
    const w = Math.max(1, img.naturalWidth || img.clientWidth || 1);
    const h = Math.max(1, img.naturalHeight || img.clientHeight || 1);
    if(canvasEl.width !== w || canvasEl.height !== h){ canvasEl.width = w; canvasEl.height = h; }
    canvasEl.style.width = `${display.w}px`;
    canvasEl.style.height = `${display.h}px`;
    resizeEditTextCanvas();
    if(imageEditMode === 'grid') refreshGridSplitPreview();
}

function setImageEditMode(mode, userTouched=false){
    const editKind = mediaKindForItem(currentEditImage().image || {});
    const isVideoPreview = editKind === 'video';
    if(isVideoPreview && mode !== 'preview') mode = 'preview';
    if(userTouched) imageEditModeTouched = true;
    const prev = imageEditMode;
    if(mode !== 'brush') removeEditTextInlineEditor(true);
    imageEditMode = ['preview','crop','outpaint','mask','brush','grid'].includes(mode) ? mode : 'preview';
    const cropCanvasEl = document.getElementById('cropCanvas');
    const previewStageEl = document.getElementById('previewStage');
    const editStageEl = document.getElementById('imageEditStage');
    const editPanelEl = document.querySelector('.image-edit-panel');
    const previewDownloadBtn = document.getElementById('previewDownloadBtn');
    const previewDownloadAllBtn = document.getElementById('previewDownloadAllBtn');
    const modeBar = document.querySelector('.image-edit-mode');
    const videoFrameTools = document.getElementById('videoFrameTools');
    const zoomLabel = document.getElementById('imageEditZoomLabel');
    const cancelBtn = document.getElementById('imageEditCancelBtn');
    const isPreview = imageEditMode === 'preview';
    if(!isPreview && panoramaState.enabled) disposePanoramaPreview();
    cropCanvasEl.style.display = isPreview ? 'none' : '';
    previewStageEl.style.display = isPreview ? 'inline-flex' : 'none';
    editStageEl?.classList.toggle('preview-mode', isPreview);
    editPanelEl?.classList.toggle('video-preview-mode', isVideoPreview);
    if(previewDownloadBtn) previewDownloadBtn.style.display = isPreview ? 'inline-flex' : 'none';
    if(previewDownloadAllBtn) previewDownloadAllBtn.style.display = isPreview && !isVideoPreview && previewDownloadGroupItems().length > 1 ? 'inline-flex' : 'none';
    if(modeBar) modeBar.style.display = isVideoPreview ? 'none' : '';
    if(videoFrameTools) videoFrameTools.style.display = isVideoPreview && isPreview ? 'flex' : 'none';
    if(zoomLabel) zoomLabel.style.display = isVideoPreview ? 'none' : '';
    if(cancelBtn){
        cancelBtn.style.display = '';
        cancelBtn.textContent = isVideoPreview ? '关闭' : tr('common.cancel');
    }
    cropCanvasEl.classList.toggle('mask-mode', imageEditMode === 'mask');
    cropCanvasEl.classList.toggle('brush-mode', imageEditMode === 'brush');
    cropCanvasEl.classList.toggle('grid-mode', imageEditMode === 'grid');
    cropCanvasEl.classList.toggle('outpaint-mode', imageEditMode === 'outpaint');
    syncGridCustomCursor();
    document.querySelectorAll('[data-image-edit-mode]').forEach(btn => btn.classList.toggle('active', btn.dataset.imageEditMode === imageEditMode));
    document.getElementById('imagePreviewTools').classList.toggle('active', isPreview && !isVideoPreview);
    document.getElementById('imageMaskTools').classList.toggle('active', imageEditMode === 'mask');
    document.getElementById('imageBrushTools').classList.toggle('active', imageEditMode === 'brush');
    document.getElementById('imageGridTools').classList.toggle('active', imageEditMode === 'grid');
    if(imageEditMode === 'grid' && gridOperationMode === 'join' && !canGridJoinCurrentNode()) gridOperationMode = 'split';
    syncGridOperationControls();
    syncGridGapValue();
    const applyBtn = document.getElementById('imageEditApplyBtn');
    document.getElementById('compareToggleBtn').style.display = isPreview && !isVideoPreview ? 'inline-flex' : 'none';
    document.getElementById('panoramaToggleBtn').style.display = isPreview && !isVideoPreview ? 'inline-flex' : 'none';
    document.getElementById('panoramaExportBtn').style.display = isPreview && !isVideoPreview && panoramaState.enabled ? 'inline-flex' : 'none';
    document.getElementById('compareThumbs').style.display = 'none';
    if(isPreview){
        document.getElementById('imageEditTitle').textContent = isVideoPreview ? '预览视频' : tr('smart.previewImage');
        document.getElementById('imageEditSub').textContent = isVideoPreview ? '' : tr('smart.previewHint');
        applyBtn.style.display = 'none';
        refreshComparePanel();
    } else {
        ensureSmartEditableImage().catch(() => {});
        ensureImageEditBaseSize(true);
        applyImageEditZoom();
        applyBtn.style.display = '';
        const icon = imageEditMode === 'crop' ? 'crop' : imageEditMode === 'outpaint' ? 'expand' : imageEditMode === 'mask' ? 'brush' : imageEditMode === 'brush' ? 'paintbrush' : 'grid-3x3';
        const labelKey = imageEditMode === 'crop' ? 'canvas.applyCrop' : imageEditMode === 'outpaint' ? 'canvas.applyOutpaint' : imageEditMode === 'mask' ? 'canvas.applyMask' : imageEditMode === 'brush' ? 'canvas.applyBrush' : 'canvas.applyGrid';
        const titleKey = imageEditMode === 'crop' ? 'canvas.cropImage' : imageEditMode === 'outpaint' ? 'canvas.outpaintImage' : imageEditMode === 'mask' ? 'canvas.maskEdit' : imageEditMode === 'brush' ? 'canvas.brushEdit' : 'canvas.modeGrid';
        const subKey = imageEditMode === 'crop' ? 'canvas.cropHint' : imageEditMode === 'outpaint' ? 'canvas.outpaintHint' : imageEditMode === 'mask' ? 'canvas.maskHint2' : imageEditMode === 'brush' ? 'canvas.brushHint' : 'canvas.gridHint';
        document.getElementById('imageEditTitle').textContent = tr(titleKey);
        document.getElementById('imageEditSub').textContent = tr(subKey);
        const applyLabel = imageEditMode === 'grid' && gridOperationMode === 'join' ? '输出拼接' : tr(labelKey);
        applyBtn.innerHTML = `<i data-lucide="${icon}" class="w-4 h-4"></i><span>${applyLabel}</span>`;
        if(imageEditMode === 'crop'){
            requestAnimationFrame(() => {
                resetCropBox();
                syncImageEditOverflow();
            });
        } else if(imageEditMode === 'outpaint'){
            requestAnimationFrame(() => {
                resetOutpaintBox();
                syncImageEditOverflow();
            });
        }
    }
    resizeEditDrawCanvas();
    if(imageEditMode === 'grid') refreshGridSplitPreview();
    else if(imageEditMode === 'crop' || imageEditMode === 'outpaint' || prev === 'grid') clearEditDrawing(true);
    syncEditDrawingHistoryButtons();
    syncBrushToolButtons();
    syncTextToolState(true);
    updatePreviewNavButtons();
    refreshIcons();
}

function editDrawSnapshot(){
    const canvasEl = editDrawCanvas();
    return {
        imageData:canvasEl.getContext('2d').getImageData(0, 0, canvasEl.width, canvasEl.height),
        labelCounter:brushLabelCounter,
        textItems:editTextItems.map(item => ({...item})),
        textSelectedId:editTextSelectedId || ''
    };
}

function restoreEditDrawSnapshot(snapshot){
    if(!snapshot) return;
    removeEditTextInlineEditor(false);
    editDrawCanvas().getContext('2d').putImageData(snapshot.imageData || snapshot, 0, 0);
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
    ['maskUndoBtn','brushUndoBtn'].forEach(id => { const btn = document.getElementById(id); if(btn){ btn.disabled = !editDrawUndoStack.length; btn.style.opacity = editDrawUndoStack.length ? '1' : '.42'; } });
    ['maskRedoBtn','brushRedoBtn'].forEach(id => { const btn = document.getElementById(id); if(btn){ btn.disabled = !editDrawRedoStack.length; btn.style.opacity = editDrawRedoStack.length ? '1' : '.42'; } });
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

function editCanvasHasPixels(){
    if(editTextHasContent()) return true;
    const canvasEl = editDrawCanvas();
    const data = canvasEl.getContext('2d').getImageData(0, 0, canvasEl.width, canvasEl.height).data;
    for(let i = 3; i < data.length; i += 4) if(data[i] > 0) return true;
    return false;
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
    document.getElementById('cropCanvas')?.classList.toggle('text-mode', imageEditMode === 'brush' && brushTool === 'text');
}

function editDrawPoint(event){
    const canvasEl = editDrawCanvas();
    const rect = canvasEl.getBoundingClientRect();
    return {x:(event.clientX - rect.left) * canvasEl.width / Math.max(1, rect.width), y:(event.clientY - rect.top) * canvasEl.height / Math.max(1, rect.height)};
}

function gridCustomLineHit(point){
    const canvasEl = editDrawCanvas();
    const threshold = Math.max(8, Math.min(canvasEl.width, canvasEl.height) / 80);
    let best = -1, bestDist = Infinity;
    gridCustomLines.forEach((line, index) => {
        const dist = line.type === 'h' ? Math.abs(point.y - line.pos * canvasEl.height) : Math.abs(point.x - line.pos * canvasEl.width);
        if(dist < bestDist && dist <= threshold){ best = index; bestDist = dist; }
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

function editBrushSize(){ return Number(document.getElementById(imageEditMode === 'mask' ? 'maskBrushSize' : 'paintBrushSize')?.value || 20); }

function brushColor(){ return document.getElementById('paintBrushColor')?.value || '#ff2d55'; }

function setupDrawStyle(ctx){
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = editBrushSize();
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

function strokeFreeDrawPoint(point){
    if(!editDrawState) return;
    const ctx = editDrawCanvas().getContext('2d');
    setupDrawStyle(ctx);
    const dx = point.x - editDrawState.x;
    const dy = point.y - editDrawState.y;
    const dist = Math.hypot(dx, dy);
    const radius = Math.max(1, editBrushSize() / 2);
    if(dist > radius){
        const steps = Math.ceil(dist / Math.max(1, radius * 0.35));
        for(let i = 1; i <= steps; i++){
            const t = i / steps;
            const x = editDrawState.x + dx * t;
            const y = editDrawState.y + dy * t;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.beginPath();
    ctx.moveTo(editDrawState.x, editDrawState.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    editDrawState.x = point.x;
    editDrawState.y = point.y;
}

function circledNumber(n){ return n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : String(n); }

function drawBrushShape(ctx, start, end){
    setupDrawStyle(ctx);
    const x = Math.min(start.x, end.x), y = Math.min(start.y, end.y), w = Math.abs(end.x - start.x), h = Math.abs(end.y - start.y);
    if(brushTool === 'rect') ctx.strokeRect(x, y, w, h);
    else if(brushTool === 'ellipse'){ ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2); ctx.stroke(); }
}

function drawNumberLabel(point){
    const ctx = editDrawCanvas().getContext('2d');
    const size = Math.max(18, editBrushSize() * 2.2);
    const text = circledNumber(brushLabelCounter++);
    setupDrawStyle(ctx);
    ctx.save(); ctx.font = `900 ${size}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = Math.max(3, size / 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.strokeText(text, point.x, point.y); ctx.fillStyle = brushColor(); ctx.fillText(text, point.x, point.y); ctx.restore();
}

function beginEditDraw(event){
    if(imageEditMode === 'crop') return;
    event.preventDefault(); event.stopPropagation();
    const canvasEl = editDrawCanvas();
    canvasEl.setPointerCapture?.(event.pointerId);
    const p = editDrawPoint(event);
    if(imageEditMode === 'grid'){
        if(gridOperationMode === 'join') return;
        if(!gridCustomMode) return;
        const hit = gridCustomLineHit(p);
        gridCustomHistory.push([...gridCustomLines.map(line => ({...line}))]);
        if(hit >= 0){ gridCustomDrag = {index:hit, pointerId:event.pointerId}; setGridCustomLinePos(hit, p); }
        else { gridCustomLines.push({type:gridCustomOrientation, pos:gridCustomOrientation === 'h' ? p.y / canvasEl.height : p.x / canvasEl.width}); gridCustomDrag = {index:gridCustomLines.length - 1, pointerId:event.pointerId}; }
        syncGridCustomUndoBtn(); refreshGridSplitPreview(); return;
    }
    const ctx = canvasEl.getContext('2d');
    pushEditDrawHistory();
    if(imageEditMode === 'brush' && brushTool === 'label'){ drawNumberLabel(p); editDrawState = null; canvasEl.releasePointerCapture?.(event.pointerId); return; }
    editDrawState = {x:p.x, y:p.y, sx:p.x, sy:p.y, pointerId:event.pointerId, snapshot:(imageEditMode === 'brush' && brushTool !== 'free') ? editDrawSnapshot() : null};
    setupDrawStyle(ctx);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + .01, p.y + .01);
    if(imageEditMode === 'mask' || brushTool === 'free') ctx.stroke();
    normalizeMaskPreviewCanvas(canvasEl);
}

function moveEditDraw(event){
    if(imageEditMode === 'grid' && gridOperationMode === 'join') return;
    if(imageEditMode === 'grid' && gridCustomMode && gridCustomDrag){ event.preventDefault(); event.stopPropagation(); setGridCustomLinePos(gridCustomDrag.index, editDrawPoint(event)); refreshGridSplitPreview(); return; }
    if(!editDrawState || imageEditMode === 'crop' || imageEditMode === 'grid') return;
    event.preventDefault(); event.stopPropagation();
    const ctx = editDrawCanvas().getContext('2d');
    const p = editDrawPoint(event);
    if(imageEditMode === 'brush' && brushTool !== 'free'){ restoreEditDrawSnapshot(editDrawState.snapshot); drawBrushShape(ctx, {x:editDrawState.sx, y:editDrawState.sy}, p); return; }
    const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
    if(events.length){
        events.forEach(ev => strokeFreeDrawPoint(editDrawPoint(ev)));
    } else {
        strokeFreeDrawPoint(p);
    }
    normalizeMaskPreviewCanvas();
}

function endEditDraw(event){
    if(editDrawState && event?.pointerId != null) editDrawCanvas().releasePointerCapture?.(event.pointerId);
    if(gridCustomDrag && event?.pointerId != null) editDrawCanvas().releasePointerCapture?.(event.pointerId);
    editDrawState = null; gridCustomDrag = null; syncEditDrawingHistoryButtons();
}

function beginGridJoinDrag(event){
    if(imageEditMode !== 'grid' || gridOperationMode !== 'join') return;
    const itemEl = event.target?.closest?.('.grid-join-item');
    if(!itemEl) return;
    event.preventDefault();
    event.stopPropagation();
    const index = Number(itemEl.dataset.gridJoinIndex);
    const item = gridJoinLayout?.items?.find(entry => Number(entry.index) === index);
    const host = document.getElementById('gridJoinCanvas');
    if(!item || !host) return;
    itemEl.setPointerCapture?.(event.pointerId);
    gridJoinDrag = {index, pointerId:event.pointerId, sx:event.clientX, sy:event.clientY, x:item.x, y:item.y};
    itemEl.classList.add('dragging');
}

function moveGridJoinDrag(event){
    if(!gridJoinDrag || imageEditMode !== 'grid' || gridOperationMode !== 'join') return;
    event.preventDefault();
    event.stopPropagation();
    const item = gridJoinLayout?.items?.find(entry => Number(entry.index) === Number(gridJoinDrag.index));
    if(!item) return;
    const host = document.getElementById('gridJoinCanvas');
    const rect = host?.getBoundingClientRect();
    const logical = gridJoinCanvasSize();
    const scale = rect ? Math.max(0.001, rect.width / Math.max(1, logical.w)) : Math.max(0.001, imageEditZoom || 1);
    const dx = (event.clientX - gridJoinDrag.sx) / scale;
    const dy = (event.clientY - gridJoinDrag.sy) / scale;
    gridJoinDrag.dx = dx;
    gridJoinDrag.dy = dy;
    const el = host?.querySelector(`[data-grid-join-index="${CSS.escape(String(gridJoinDrag.index))}"]`);
    if(el){
        el.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`;
    }
}

function gridJoinDragTarget(){
    if(!gridJoinDrag || !gridJoinLayout) return null;
    const dragged = gridJoinLayout.items.find(entry => Number(entry.index) === Number(gridJoinDrag.index));
    if(!dragged) return null;
    const dx = gridJoinDrag.dx || 0;
    const dy = gridJoinDrag.dy || 0;
    const cx = dragged.x + dx + dragged.w / 2;
    const cy = dragged.y + dy + dragged.h / 2;
    return (gridJoinLayout.items || [])
        .filter(entry => Number(entry.index) !== Number(gridJoinDrag.index))
        .map(entry => {
            const inside = cx >= entry.x && cx <= entry.x + entry.w && cy >= entry.y && cy <= entry.y + entry.h;
            const score = Math.hypot(cx - (entry.x + entry.w / 2), cy - (entry.y + entry.h / 2));
            return {entry, inside, score};
        })
        .filter(item => item.inside || item.score < Math.max(dragged.w, dragged.h, item.entry.w, item.entry.h) * 0.55)
        .sort((a, b) => (b.inside - a.inside) || a.score - b.score)[0]?.entry || null;
}

function endGridJoinDrag(event){
    if(!gridJoinDrag) return;
    const host = document.getElementById('gridJoinCanvas');
    const draggedEl = host?.querySelector(`[data-grid-join-index="${CSS.escape(String(gridJoinDrag.index))}"]`);
    draggedEl?.classList.remove('dragging');
    if(draggedEl) draggedEl.style.transform = '';
    const dragged = gridJoinLayout?.items?.find(entry => Number(entry.index) === Number(gridJoinDrag.index));
    const target = gridJoinDragTarget();
    if(dragged && target){
        const order = gridJoinVisualOrder();
        const a = order.indexOf(Number(dragged.index));
        const b = order.indexOf(Number(target.index));
        if(a >= 0 && b >= 0) [order[a], order[b]] = [order[b], order[a]];
        setGridJoinLayoutOrder(order, gridJoinLayout.rows, gridJoinLayout.cols, gridJoinLayout.gap);
        gridJoinUserMoved = true;
        renderGridJoinPreview();
    }
    if(event?.pointerId != null) event.target?.releasePointerCapture?.(event.pointerId);
    gridJoinDrag = null;
}

function syncGridGapValue(){
    const input = document.getElementById('gridGapSize');
    const value = Math.max(0, Math.min(240, Number(input?.value || 0)));
    if(input) input.value = value;
    const label = document.getElementById('gridGapValue');
    if(label) label.textContent = String(value);
    if(gridJoinLayout && gridOperationMode === 'join'){
        const rows = gridJoinLayout.rows;
        const cols = gridJoinLayout.cols;
        const order = gridJoinVisualOrder();
        setGridJoinLayoutOrder(order, rows, cols, value);
    }
    return value;
}

function gridGapInputValue(){
    return Math.max(0, Math.min(240, Number(document.getElementById('gridGapSize')?.value || 0)));
}

function gridSplitSettings(){
    const hLines = Math.max(0, Math.min(20, Number(document.getElementById('gridHorizontalLines')?.value || 0)));
    const vLines = Math.max(0, Math.min(20, Number(document.getElementById('gridVerticalLines')?.value || 0)));
    return {rows:hLines + 1, cols:vLines + 1, gap:syncGridGapValue()};
}

function currentGridJoinItems(){
    const node = currentEditImage().node;
    return (node?.images || [])
        .map((item, index) => ({item:imageForDisplay(item), source:item, index}))
        .filter(entry => mediaKindForItem(entry.item) === 'image' && entry.item?.url);
}

function canGridJoinCurrentNode(){
    return currentGridJoinItems().length > 1;
}

function gridJoinAutoDims(count){
    const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, count))));
    return {rows:Math.max(1, Math.ceil(count / cols)), cols};
}

function gridJoinNaturalSize(entry){
    const item = entry?.item || {};
    const cached = gridJoinImageCache.get(entry?.index);
    const w = Number(item.natural_w || item.width || cached?.naturalWidth || 0);
    const h = Number(item.natural_h || item.height || cached?.naturalHeight || 0);
    return {w:Math.max(1, w || 512), h:Math.max(1, h || 512)};
}

function gridJoinBaseCellSize(items){
    const sizes = items.map(gridJoinNaturalSize);
    const maxW = Math.max(1, ...sizes.map(size => size.w));
    const maxH = Math.max(1, ...sizes.map(size => size.h));
    const scale = Math.min(1, 420 / Math.max(maxW, maxH));
    return {w:Math.max(1, Math.round(maxW * scale)), h:Math.max(1, Math.round(maxH * scale)), scale};
}

function gridJoinItemDisplaySize(entry, cell){
    return {
        w:Math.max(1, Math.round(cell.w)),
        h:Math.max(1, Math.round(cell.h))
    };
}

function ensureGridJoinLayout(rows=null, cols=null){
    const items = currentGridJoinItems();
    if(!items.length){ gridJoinLayout = null; return null; }
    const auto = gridJoinAutoDims(items.length);
    const nextRows = Math.max(1, Number(rows || gridJoinLayout?.rows || auto.rows) || auto.rows);
    const nextCols = Math.max(1, Number(cols || gridJoinLayout?.cols || auto.cols) || auto.cols);
    const byIndex = new Map(items.map(entry => [entry.index, entry]));
    const previousOrder = gridJoinVisualOrder()
        .map(index => byIndex.get(Number(index)))
        .filter(Boolean);
    const ordered = [
        ...previousOrder,
        ...items.filter(entry => !previousOrder.some(prev => Number(prev.index) === Number(entry.index)))
    ];
    const cell = gridJoinBaseCellSize(ordered);
    const gap = gridGapInputValue();
    const layoutItems = ordered.map((entry, order) => {
        const row = Math.floor(order / nextCols);
        const col = order % nextCols;
        const {w, h} = gridJoinItemDisplaySize(entry, cell);
        return {
            index:entry.index,
            x:col * (cell.w + gap),
            y:row * (cell.h + gap),
            w,
            h
        };
    });
    gridJoinLayout = {rows:nextRows, cols:nextCols, cellW:cell.w, cellH:cell.h, gap, items:layoutItems};
    return gridJoinLayout;
}

function gridJoinVisualOrder(layout=gridJoinLayout){
    return (layout?.items || [])
        .slice()
        .sort((a, b) => (Number(a.y || 0) - Number(b.y || 0)) || (Number(a.x || 0) - Number(b.x || 0)))
        .map(item => Number(item.index));
}

function setGridJoinLayoutOrder(order, rows=null, cols=null, gapOverride=null){
    const entries = currentGridJoinItems();
    if(!entries.length){ gridJoinLayout = null; return null; }
    const byIndex = new Map(entries.map(entry => [entry.index, entry]));
    const ordered = [
        ...order.map(index => byIndex.get(Number(index))).filter(Boolean),
        ...entries.filter(entry => !order.includes(entry.index))
    ];
    const auto = gridJoinAutoDims(ordered.length);
    const nextRows = Math.max(1, Number(rows || gridJoinLayout?.rows || auto.rows) || auto.rows);
    const nextCols = Math.max(1, Number(cols || gridJoinLayout?.cols || auto.cols) || auto.cols);
    const cell = gridJoinBaseCellSize(ordered);
    const gap = Math.max(0, Math.min(240, Number(gapOverride ?? document.getElementById('gridGapSize')?.value ?? 0)));
    const layoutItems = ordered.map((entry, orderIndex) => {
        const row = Math.floor(orderIndex / nextCols);
        const col = orderIndex % nextCols;
        const {w, h} = gridJoinItemDisplaySize(entry, cell);
        return {
            index:entry.index,
            x:col * (cell.w + gap),
            y:row * (cell.h + gap),
            w,
            h
        };
    });
    gridJoinLayout = {rows:nextRows, cols:nextCols, cellW:cell.w, cellH:cell.h, gap, items:layoutItems};
    return gridJoinLayout;
}

function resetGridJoinLayout(){
    gridJoinUserMoved = false;
    gridJoinLayout = null;
    ensureGridJoinLayout();
    renderGridJoinPreview();
}

function applyGridJoinPreset(rows, cols){
    gridJoinUserMoved = false;
    const order = gridJoinVisualOrder();
    if(order.length) setGridJoinLayoutOrder(order, rows, cols);
    else {
        gridJoinLayout = null;
        ensureGridJoinLayout(rows, cols);
    }
    renderGridJoinPreview();
}

function setGridJoinOutputSize(size){
    gridJoinOutputSize = Math.max(256, Math.min(8192, Number(size) || 2048));
    syncGridJoinSizeControls();
    refreshGridSplitPreview();
}

function syncGridJoinSizeControls(){
    document.querySelectorAll('[data-grid-join-size]').forEach(btn => {
        const active = Number(btn.dataset.gridJoinSize || 0) === Number(gridJoinOutputSize);
        btn.classList.toggle('active', active);
    });
}

function setGridOperationMode(mode){
    gridOperationMode = mode === 'join' && canGridJoinCurrentNode() ? 'join' : 'split';
    if(mode === 'join' && gridOperationMode !== 'join') toast('请从包含多张图片的分组打开宫格拼接');
    syncGridOperationControls();
    refreshGridSplitPreview();
}

function syncGridOperationControls(){
    const join = gridOperationMode === 'join';
    document.getElementById('gridSplitModeBtn')?.classList.toggle('primary', !join);
    document.getElementById('gridSplitModeBtn')?.classList.toggle('secondary', join);
    const joinBtn = document.getElementById('gridJoinModeBtn');
    if(joinBtn){
        joinBtn.disabled = !canGridJoinCurrentNode();
        joinBtn.classList.toggle('primary', join);
        joinBtn.classList.toggle('secondary', !join);
    }
    document.querySelectorAll('.grid-split-control').forEach(el => { el.style.display = join ? 'none' : (el.id === 'gridRegularControls' ? 'contents' : ''); });
    document.querySelectorAll('.grid-join-control').forEach(el => { el.style.display = join ? 'flex' : 'none'; });
    syncGridJoinSizeControls();
    if(!join) syncGridCustomControls();
    document.getElementById('cropCanvas')?.classList.toggle('grid-join-mode', join);
    document.getElementById('cropImage')?.classList.toggle('grid-join-hidden', join);
    if(join) ensureGridJoinLayout();
    else gridJoinDrag = null;
}

function gridSplitRects(width, height){
    if(gridCustomMode) return gridSplitRectsCustom(width, height);
    const {rows, cols, gap} = gridSplitSettings();
    const halfGap = gap / 2, rects = [];
    for(let row = 0; row < rows; row++){
        const topLine = row * height / rows, bottomLine = (row + 1) * height / rows;
        const y1 = Math.round(row === 0 ? 0 : topLine + halfGap), y2 = Math.round(row === rows - 1 ? height : bottomLine - halfGap);
        for(let col = 0; col < cols; col++){
            const leftLine = col * width / cols, rightLine = (col + 1) * width / cols;
            const x1 = Math.round(col === 0 ? 0 : leftLine + halfGap), x2 = Math.round(col === cols - 1 ? width : rightLine - halfGap);
            if(x2 > x1 && y2 > y1) rects.push({row, col, x:x1, y:y1, w:x2 - x1, h:y2 - y1});
        }
    }
    return rects;
}

function gridSplitRectsCustom(width, height){
    const gap = Math.max(0, Math.min(240, Number(document.getElementById('gridGapSize')?.value || 0)));
    const halfGap = gap / 2;
    const rawH = [...new Set(gridCustomLines.filter(l => l.type === 'h').map(l => l.pos * height))].sort((a, b) => a - b);
    const rawV = [...new Set(gridCustomLines.filter(l => l.type === 'v').map(l => l.pos * width))].sort((a, b) => a - b);
    const hCuts = [0, ...rawH, height], vCuts = [0, ...rawV, width], rects = [];
    for(let row = 0; row < hCuts.length - 1; row++) for(let col = 0; col < vCuts.length - 1; col++){
        const y1 = Math.round(row === 0 ? hCuts[row] : hCuts[row] + halfGap), y2 = Math.round(row === hCuts.length - 2 ? hCuts[row + 1] : hCuts[row + 1] - halfGap);
        const x1 = Math.round(col === 0 ? vCuts[col] : vCuts[col] + halfGap), x2 = Math.round(col === vCuts.length - 2 ? vCuts[col + 1] : vCuts[col + 1] - halfGap);
        if(x2 > x1 && y2 > y1) rects.push({row, col, x:x1, y:y1, w:x2 - x1, h:y2 - y1});
    }
    return rects;
}

function gridLayoutFromRects(rects){
    return {type:'grid-split', groupId:uid('grid'), rows:Math.max(1, ...rects.map(r => Number(r.row || 0) + 1)), cols:Math.max(1, ...rects.map(r => Number(r.col || 0) + 1))};
}

function applyGridPreset(rows, cols){
    gridCustomMode = false; gridCustomLines = []; gridCustomHistory = []; gridCustomDrag = null;
    const h = document.getElementById('gridHorizontalLines'), v = document.getElementById('gridVerticalLines');
    if(h){ h.disabled = false; h.value = String(Math.max(0, Number(rows || 1) - 1)); }
    if(v){ v.disabled = false; v.value = String(Math.max(0, Number(cols || 1) - 1)); }
    document.getElementById('gridCustomToggle')?.classList.remove('primary');
    document.getElementById('gridCustomToggle')?.classList.add('secondary');
    syncGridCustomControls();
    syncGridCustomCursor(); syncGridCustomUndoBtn(); refreshGridSplitPreview();
}

function syncGridCustomControls(){
    const join = gridOperationMode === 'join';
    const custom = document.getElementById('gridCustomControls');
    if(custom) custom.style.display = !join && gridCustomMode ? 'flex' : 'none';
    document.querySelectorAll('.grid-split-control.grid-preset-row').forEach(row => {
        row.style.display = !join && !gridCustomMode ? 'flex' : 'none';
    });
    const regular = document.getElementById('gridRegularControls');
    if(regular) regular.style.display = !join && !gridCustomMode ? 'contents' : 'none';
}

function toggleGridCustomMode(){
    gridCustomMode = !gridCustomMode;
    if(gridCustomMode){ gridCustomLines = []; gridCustomHistory = []; }
    gridCustomDrag = null;
    const toggle = document.getElementById('gridCustomToggle');
    toggle.classList.toggle('primary', gridCustomMode); toggle.classList.toggle('secondary', !gridCustomMode);
    ['gridHorizontalLines','gridVerticalLines'].forEach(id => { const el = document.getElementById(id); if(el) el.disabled = gridCustomMode; });
    syncGridCustomControls();
    syncGridCustomCursor(); syncGridCustomUndoBtn(); refreshGridSplitPreview();
}

function setGridCustomOrientation(orient){
    gridCustomOrientation = orient;
    document.getElementById('gridOrientH').classList.toggle('primary', orient === 'h');
    document.getElementById('gridOrientH').classList.toggle('secondary', orient !== 'h');
    document.getElementById('gridOrientV').classList.toggle('primary', orient === 'v');
    document.getElementById('gridOrientV').classList.toggle('secondary', orient !== 'v');
    syncGridCustomCursor();
}

function clearGridCustomLines(){ gridCustomHistory = []; gridCustomLines = []; gridCustomDrag = null; syncGridCustomUndoBtn(); refreshGridSplitPreview(); }

function undoGridCustomLine(){ if(!gridCustomHistory.length) return; gridCustomLines = gridCustomHistory.pop(); gridCustomDrag = null; syncGridCustomUndoBtn(); refreshGridSplitPreview(); }

function syncGridCustomUndoBtn(){
    const btn = document.getElementById('gridUndoBtn');
    if(!btn) return;
    btn.disabled = gridCustomHistory.length === 0;
    btn.style.opacity = gridCustomHistory.length === 0 ? '0.4' : '1';
}

function applyImageEditZoom(scaleOverride=null){
    ensureImageEditBaseSize();
    if(!imageEditBaseW) return;
    const img = document.getElementById('cropImage');
    const oldW = cropImageDisplaySize().w;
    img.style.maxWidth = 'none'; img.style.maxHeight = 'none';
    img.style.width = Math.round(imageEditBaseW * imageEditZoom) + 'px';
    img.style.height = Math.round(imageEditBaseH * imageEditZoom) + 'px';
    resizeEditDrawCanvas();
    if(cropState){
        const scale = Number(scaleOverride) || (oldW > 0 ? cropImageDisplaySize().w / oldW : 1);
        cropState.x = Math.round(cropState.x * scale); cropState.y = Math.round(cropState.y * scale);
        cropState.w = Math.round(cropState.w * scale); cropState.h = Math.round(cropState.h * scale);
        clampCrop(); renderCropBox();
    }
    if(imageEditMode === 'grid') refreshGridSplitPreview();
    syncImageEditOverflow(); updateZoomLabel();
}

function ensureImageEditBaseSize(force=false){
    if(imageEditBaseW && imageEditBaseH && !force) return;
    const img = document.getElementById('cropImage');
    const naturalW = img.naturalWidth || img.clientWidth || 0;
    const naturalH = img.naturalHeight || img.clientHeight || 0;
    if(!naturalW || !naturalH) return;
    const maxW = Math.max(1, Math.min(1300, window.innerWidth - 100));
    const maxH = Math.max(1, Math.min(840, window.innerHeight - 200));
    const fit = Math.min(1, maxW / naturalW, maxH / naturalH);
    imageEditBaseW = Math.max(1, Math.round(naturalW * fit));
    imageEditBaseH = Math.max(1, Math.round(naturalH * fit));
}

function syncImageEditOverflow(){
    const stage = document.getElementById('imageEditStage');
    const crop = document.getElementById('cropCanvas');
    if(!stage || !crop) return;
    const rect = crop.getBoundingClientRect(), pad = 36;
    stage.classList.toggle('overflow-x', rect.width + pad > stage.clientWidth);
    stage.classList.toggle('overflow-y', rect.height + pad > stage.clientHeight);
}

function resetImageEditZoom(){
    if(imageEditMode === 'preview'){
        if(panoramaState.enabled){
            resetPanoramaView();
            return;
        }
        resetPreviewTransform();
        return;
    }
    const stage = document.getElementById('imageEditStage');
    imageEditZoom = 1.0; applyImageEditZoom();
    if(stage){ stage.scrollLeft = 0; stage.scrollTop = 0; }
}

function updateZoomLabel(){
    const el = document.getElementById('imageEditZoomLabel');
    if(!el) return;
    if(imageEditMode === 'preview' && panoramaState.enabled){
        el.textContent = Math.round((75 / Math.max(1, panoramaState.fov)) * 100) + '%';
        return;
    }
    el.textContent = Math.round((imageEditMode === 'preview' ? previewZoom : imageEditZoom) * 100) + '%';
}

function syncGridCustomCursor(){
    const el = document.getElementById('cropCanvas');
    el.classList.toggle('grid-custom-h', imageEditMode === 'grid' && gridOperationMode !== 'join' && gridCustomMode && gridCustomOrientation === 'h');
    el.classList.toggle('grid-custom-v', imageEditMode === 'grid' && gridOperationMode !== 'join' && gridCustomMode && gridCustomOrientation === 'v');
}

function gridJoinCanvasSize(layout=gridJoinLayout){
    if(!layout) return {w:1, h:1};
    const gap = Math.max(0, Number(layout.gap || 0));
    const byGrid = {
        w:Math.max(1, Number(layout.cols || 1) * Number(layout.cellW || 1) + Math.max(0, Number(layout.cols || 1) - 1) * gap),
        h:Math.max(1, Number(layout.rows || 1) * Number(layout.cellH || 1) + Math.max(0, Number(layout.rows || 1) - 1) * gap)
    };
    const byItems = (layout.items || []).reduce((acc, item) => ({
        w:Math.max(acc.w, Number(item.x || 0) + Number(item.w || 0)),
        h:Math.max(acc.h, Number(item.y || 0) + Number(item.h || 0))
    }), byGrid);
    return {w:Math.ceil(byItems.w), h:Math.ceil(byItems.h)};
}

function renderGridJoinPreview(){
    const host = document.getElementById('gridJoinCanvas');
    const countEl = document.getElementById('gridSplitCount');
    const cropCanvasEl = document.getElementById('cropCanvas');
    if(!host) return;
    host.innerHTML = '';
    if(imageEditMode !== 'grid' || gridOperationMode !== 'join'){
        host.style.display = 'none';
        if(cropCanvasEl){ cropCanvasEl.style.width = ''; cropCanvasEl.style.height = ''; }
        return;
    }
    const items = currentGridJoinItems();
    if(items.length <= 1){
        host.style.display = 'none';
        if(cropCanvasEl){ cropCanvasEl.style.width = ''; cropCanvasEl.style.height = ''; }
        if(countEl) countEl.textContent = '分组需要至少 2 张图片';
        return;
    }
    const layout = ensureGridJoinLayout();
    const size = gridJoinCanvasSize(layout);
    const zoom = Math.max(0.05, Number(imageEditZoom || 1));
    const displayW = Math.max(1, Math.round(size.w * zoom));
    const displayH = Math.max(1, Math.round(size.h * zoom));
    host.style.display = 'block';
    host.style.width = `${Math.max(1, Math.round(size.w))}px`;
    host.style.height = `${Math.max(1, Math.round(size.h))}px`;
    host.style.transform = `scale(${zoom})`;
    host.style.transformOrigin = '0 0';
    if(cropCanvasEl){
        cropCanvasEl.style.width = `${displayW}px`;
        cropCanvasEl.style.height = `${displayH}px`;
    }
    const byIndex = new Map(items.map(entry => [entry.index, entry]));
    (layout.items || []).forEach(item => {
        const entry = byIndex.get(item.index);
        if(!entry) return;
        const img = document.createElement('img');
        img.className = 'grid-join-item';
        img.draggable = false;
        img.dataset.gridJoinIndex = String(item.index);
        img.style.left = `${Math.round(item.x)}px`;
        img.style.top = `${Math.round(item.y)}px`;
        img.style.width = `${Math.round(item.w)}px`;
        img.style.height = `${Math.round(item.h)}px`;
        img.alt = entry.item.name || `image-${item.index + 1}`;
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const hadNaturalSize = Boolean(entry.source.natural_w && entry.source.natural_h);
            gridJoinImageCache.set(item.index, img);
            if(!entry.source.natural_w && img.naturalWidth) entry.source.natural_w = img.naturalWidth;
            if(!entry.source.natural_h && img.naturalHeight) entry.source.natural_h = img.naturalHeight;
            if(!hadNaturalSize && img.naturalWidth && img.naturalHeight && imageEditMode === 'grid' && gridOperationMode === 'join'){
                ensureGridJoinLayout();
                renderGridJoinPreview();
            }
        };
        img.onerror = () => {
            if(img.dataset.proxyFallbackTried === '1') return;
            const fallback = proxiedMediaUrl(entry.item);
            if(!fallback || fallback === img.getAttribute('src')) return;
            img.dataset.proxyFallbackTried = '1';
            img.src = fallback;
        };
        img.src = displayMediaUrl(entry.item);
        host.appendChild(img);
    });
    if(countEl) countEl.textContent = `将拼接 ${items.length} 张图片 · 输出长边 ${Math.round(gridJoinOutputSize / 1024)}K`;
}

function refreshGridSplitPreview(){
    const canvasEl = editDrawCanvas();
    const ctx = canvasEl.getContext('2d');
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    renderGridJoinPreview();
    if(imageEditMode !== 'grid') return;
    if(gridOperationMode === 'join') return;
    const countEl = document.getElementById('gridSplitCount');
    const lineWidth = Math.max(2, Math.round(Math.min(canvasEl.width, canvasEl.height) / 320));
    const drawLine = (x1, y1, x2, y2) => {
        ctx.save(); ctx.lineWidth = lineWidth + 2; ctx.strokeStyle = 'rgba(2,6,23,0.72)'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.lineWidth = lineWidth; ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
    };
    if(gridCustomMode){
        const gap = Math.max(0, Math.min(240, Number(document.getElementById('gridGapSize')?.value || 0)));
        const hLines = gridCustomLines.filter(l => l.type === 'h'), vLines = gridCustomLines.filter(l => l.type === 'v');
        if(countEl) countEl.textContent = tr('canvas.gridWillOutput').replace('{n}', (hLines.length + 1) * (vLines.length + 1));
        hLines.forEach(l => { const y = l.pos * canvasEl.height; gap > 0 ? (drawLine(0, y - gap / 2, canvasEl.width, y - gap / 2), drawLine(0, y + gap / 2, canvasEl.width, y + gap / 2)) : drawLine(0, y, canvasEl.width, y); });
        vLines.forEach(l => { const x = l.pos * canvasEl.width; gap > 0 ? (drawLine(x - gap / 2, 0, x - gap / 2, canvasEl.height), drawLine(x + gap / 2, 0, x + gap / 2, canvasEl.height)) : drawLine(x, 0, x, canvasEl.height); });
        return;
    }
    const {rows, cols, gap} = gridSplitSettings();
    if(countEl) countEl.textContent = tr('canvas.gridWillOutput').replace('{n}', rows * cols);
    for(let i = 1; i < cols; i++){ const x = i * canvasEl.width / cols; gap > 0 ? (drawLine(x - gap / 2, 0, x - gap / 2, canvasEl.height), drawLine(x + gap / 2, 0, x + gap / 2, canvasEl.height)) : drawLine(x, 0, x, canvasEl.height); }
    for(let i = 1; i < rows; i++){ const y = i * canvasEl.height / rows; gap > 0 ? (drawLine(0, y - gap / 2, canvasEl.width, y - gap / 2), drawLine(0, y + gap / 2, canvasEl.width, y + gap / 2)) : drawLine(0, y, canvasEl.width, y); }
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
        img.style.position = 'absolute';
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
        img.style.position = '';
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
    if(box){
        box.style.left = `${boxX}px`; box.style.top = `${boxY}px`; box.style.width = `${cropState.w}px`; box.style.height = `${cropState.h}px`;
    }
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
    const display = cropImageDisplaySize();
    const scaleX = Math.max(1, Number(img.naturalWidth || 1)) / Math.max(1, Number(display.w || img.clientWidth || 1));
    const scaleY = Math.max(1, Number(img.naturalHeight || 1)) / Math.max(1, Number(display.h || img.clientHeight || 1));
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
    const warning = exceedsFourKStandard(size.w, size.h);
    cropCanvasEl?.classList.toggle('outpaint-warning', warning);
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
    ensureImageEditBaseSize(true);
    applyImageEditZoom();
    const {w, h} = cropBounds();
    cropState.w = w;
    cropState.h = h;
    cropState.x = 0;
    cropState.y = 0;
    clampOutpaint();
    renderCropBox();
}

function resetCropBox(){
    if(!cropState) return;
    if(imageEditMode === 'outpaint') return resetOutpaintBox();
    const {w, h} = cropBounds();
    cropState.x = Math.round(w * 0.08); cropState.y = Math.round(h * 0.08); cropState.w = Math.round(w * 0.84); cropState.h = Math.round(h * 0.84);
    renderCropBox();
}

async function runManagedImageTool(kind, nodeId, index){
    if(smartImageToolBusy || !['panorama','depth'].includes(kind)) return;
    const node=nodes.find(n=>n.id===nodeId);
    const source={node,image:{...imageForDisplay(node?.images?.[index])}};
    if(!source.node || !source.image?.url || mediaKindForItem(source.image)!=='image')return;
    if(!window.CanvasSession?.enabled)return toast('请在成员空间中使用管理平台配置的图片工具。');
    const sourceGuard=canvasTaskWriteGuard(source.node);
    if(!sourceGuard.valid() || isSmartCanvasLocked())return toast('请先取得此画布的编辑权限。');
    smartImageToolBusy=true;
    const toolButtons=()=>document.querySelectorAll('[data-smart-node-action="panorama"], [data-smart-node-action="depth"]');
    toolButtons().forEach(b=>{b.disabled=true;});
    let output=null,binding=null,guard=sourceGuard;
    try{
        const response=await fetch('/api/image-tools');
        const data=await response.json();
        if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:'无法读取图片工具配置，请检查权限。');
        guard.check();
        if(selectedId!==nodeId || smartNodeToolbarImageIndex(source.node)!==index || imageForDisplay(source.node.images?.[index])?.url!==source.image.url)return;
        const config=data.tools[kind];
        if(!config?.enabled)throw new Error(config?.unavailable_reason || '此工具尚未在管理平台启用。');
        const refs=[{url:source.image.url,name:source.image.name || 'reference.png',kind:'image'}];
        const [w,h]=config.size.split('x').map(Number);
        const runSettings={engine:'api',apiKind:'image',provider_id:config.provider_id,model:config.model,resolution:'custom',customWidth:w,customHeight:h,customSize:config.size,quality:config.quality,count:1};
        const label=kind==='panorama'?'生成全景图':'生成深度图',started=nowMs();
        const meta={prompt:config.prompt,displayPrompt:label,promptText:label,promptHtml:'',promptRefs:refs,inputRefs:refs,sourceNodeId:source.node.id,settings:runSettings,createdAt:Date.now()};
        pushUndo();
        output=createPendingOutputFromSource(source.node,1,meta,{connectSource:false,selectOutput:true,refs});
        guard=canvasTaskWriteGuard(source.node,output);guard.check();
        binding=smartTaskInputBinding(source.node,output,guard);
        render();scheduleSave();
        const task=await runApiGeneration(config.prompt,refs,runSettings,binding,{kind,revision:data.revision});
        guard.check();binding?.check();
        await queueAndResumeSmartApiTasks(output,task,{kind:'image',startedAt:started,archiveExisting:false,
            run:{nodeId:source.node.id,nodeType:source.node.type,kind:'image',prompt:config.prompt,refs,size:config.size,settings:runSettings}});
    }catch(error){
        if(error?.inputChanged && output)pauseSmartTaskInput(output,binding,guard,error);
        if(output && guard.valid() && !error?.resultPending && !smartPendingTasks(output).length){output.pending=0;output.running=false;output.runError=error.message;render();scheduleSave();}
        toast(error.message || '图片工具生成失败，请查看任务记录。');
    }finally{
        smartImageToolBusy=false;toolButtons().forEach(b=>{b.disabled=isSmartCanvasLocked();});
    }
}

function clearSmartEditableImage(){
    smartEditableJob = null;
    smartEditableResource?.clear();
    for(const id of ['cropImage','previewCurrentImage']){
        const img = document.getElementById(id);
        if(img){ img.onload = null; img.onerror = null; img.removeAttribute('src'); }
    }
}

function ensureSmartEditableImage({retry=false}={}){
    const editing = currentEditImage(), snapshot = cropState;
    if(!snapshot || mediaKindForItem(editing.image || {}) !== 'image') return Promise.resolve(null);
    const source = displayMediaUrl(editing.image);
    if(!retry && smartEditableJob?.snapshot === snapshot && smartEditableJob.source === source && smartEditableJob.state !== 'failed') return smartEditableJob.promise;
    if(smartEditableJob?.snapshot === snapshot && smartEditableJob.state === 'failed') retry = true;
    smartEditableResource ||= window.CanvasEditableImage.create(window);
    const job = {snapshot,source,state:'loading'};
    smartEditableJob = job;
    const crop = document.getElementById('cropImage'), preview = document.getElementById('previewCurrentImage');
    const apply = document.getElementById('imageEditApplyBtn');
    if(apply) apply.disabled = true;
    window.CanvasMediaLoader?.watch(crop, document.getElementById('imageEditStage'), '', {
        retry:() => ensureSmartEditableImage({retry:true}).then(result => {
            if(result && panoramaState.enabled) loadPanoramaTexture(source);
        }).catch(() => {})
    });
    job.promise = smartEditableResource.load(source, {retry}).then(result => {
        if(smartEditableJob !== job || cropState !== snapshot) return null;
        job.state = 'ready';
        crop.crossOrigin = preview.crossOrigin = 'anonymous';
        crop.src = preview.src = result.url;
        return result;
    }).catch(error => {
        if(smartEditableJob === job && cropState === snapshot){
            job.state = 'failed';
            crop.dispatchEvent(new Event('error'));
            updatePreviewMetaHint('原图加载失败，请重试。');
        }
        throw error;
    });
    return job.promise;
}

function openImageEditor(nodeId, imageIndex=0){
    const node = nodes.find(n => n.id === nodeId);
    const image = imageForDisplay(node?.images?.[imageIndex]);
    if(!image?.url) return;
    if(smartAudioLightbox.classList.contains('open')) closeSmartAudioLightbox();
    resetVideoTrimState();
    if(detachedEditPreview?.node?.id !== nodeId) detachedEditPreview = null;
    const kind = mediaKindForItem(image);
    if(kind !== 'image' && kind !== 'video'){
        downloadPreviewFile(image);
        return;
    }
    window.CanvasMediaLoader?.begin('image-editor');
    clearSmartEditableImage();
    selectedId = nodeId;
    selectedImage = {nodeId, index:imageIndex};
    previewNavState = {nodeId, index:imageIndex, count:(node.images || []).filter(img => img?.url).length};
    cropState = {nodeId, imageIndex, x:0, y:0, w:0, h:0};
    gridCustomMode = false; gridCustomLines = []; gridCustomHistory = []; gridCustomDrag = null; gridCustomOrientation = 'h';
    gridOperationMode = 'split'; gridJoinLayout = null; gridJoinDrag = null; gridJoinImageCache = new Map(); gridJoinUserMoved = false;
    imageEditZoom = 1.0; imageEditBaseW = 0; imageEditBaseH = 0; imageEditModeTouched = false;
    editTextItems = []; editTextSelectedId = ''; editTextDrag = null; editTextDirty = false;
    const toggle = document.getElementById('gridCustomToggle');
    if(toggle){ toggle.classList.add('secondary'); toggle.classList.remove('primary'); }
    syncGridCustomControls();
    syncGridOperationControls();
    ['gridHorizontalLines','gridVerticalLines'].forEach(id => { const el = document.getElementById(id); if(el) el.disabled = false; });
    const orientH = document.getElementById('gridOrientH'), orientV = document.getElementById('gridOrientV');
    if(orientH){ orientH.classList.add('primary'); orientH.classList.remove('secondary'); }
    if(orientV){ orientV.classList.add('secondary'); orientV.classList.remove('primary'); }
    syncGridCustomUndoBtn(); updateZoomLabel();
    const img = document.getElementById('cropImage');
    img.style.width = ''; img.style.height = ''; img.style.maxWidth = ''; img.style.maxHeight = '';
    imageEditModal.classList.add('open');
    previewCompareOn = false;
    previewCompareIndex = -1;
    disposePanoramaPreview();
    resetPreviewTransform();
    if(kind === 'video'){
        img.onload = null;
        img.onerror = null;
        img.removeAttribute('src');
        delete img.dataset.proxyFallbackTried;
        setImageEditMode('preview');
        updatePreviewNavButtons();
        refreshIcons();
        return;
    }
    img.onload = () => {
        if(!smartEditableJob || smartEditableJob.snapshot !== cropState || smartEditableJob.state !== 'ready') return;
        document.getElementById('imageEditApplyBtn').disabled = false;
        const targetImage = node.images?.[imageIndex];
        if(targetImage && img.naturalWidth && img.naturalHeight && (!targetImage.natural_w || !targetImage.natural_h)){
            targetImage.natural_w = img.naturalWidth;
            targetImage.natural_h = img.naturalHeight;
            scheduleSave();
        }
        ensureImageEditBaseSize(true);
        updateZoomLabel(); resizeEditDrawCanvas(); resetEditDrawingHistory(); clearEditDrawing(true); resetCropBox();
        if(!imageEditModeTouched) setImageEditMode('preview');
        else setImageEditMode(imageEditMode);
        if(!panoramaState.enabled) updatePreviewMetaHint();
        syncImageEditOverflow(); refreshIcons();
    };
    img.onerror = () => {
        if(smartEditableJob?.snapshot === cropState){
            smartEditableJob.state = 'failed';
            document.getElementById('imageEditApplyBtn').disabled = true;
        }
    };
    ensureSmartEditableImage().catch(() => {});
    setImageEditMode('preview');
    updatePreviewNavButtons();
    refreshIcons();
}

function closeImageEditor(){
    window.CanvasMediaLoader?.end('image-editor');
    clearSmartEditableImage();
    resetVideoTrimState();
    detachedEditPreview = null;
    imageEditModal.classList.remove('open');
    document.querySelector('.image-edit-panel')?.classList.remove('video-preview-mode');
    const img = document.getElementById('cropImage');
    const previewVideo = document.getElementById('previewCurrentVideo');
    img.onload = null; img.onerror = null; img.removeAttribute('src'); delete img.dataset.proxyFallbackTried; img.style.width = ''; img.style.height = ''; img.style.maxWidth = ''; img.style.maxHeight = '';
    img.style.position = ''; img.style.left = ''; img.style.top = '';
    if(previewVideo){
        previewVideo.pause?.();
        previewVideo.onloadedmetadata = null;
        previewVideo.onloadeddata = null;
        previewVideo.removeAttribute('src');
        previewVideo.load?.();
        previewVideo.style.display = 'none';
    }
    clearEditDrawing(true);
    cropState = null; cropDrag = null; editDrawState = null; resetEditDrawingHistory(); gridCustomDrag = null; gridJoinDrag = null; gridJoinLayout = null; gridJoinImageCache = new Map(); gridJoinUserMoved = false; gridOperationMode = 'split';
    previewNavState = {nodeId:'', index:0, count:0};
    imageEditZoom = 1.0; imageEditBaseW = 0; imageEditBaseH = 0; imageEditModeTouched = false;
    disposePanoramaPreview();
    previewPanDrag = null; previewCompareDrag = false; imageEditPanDrag = null; resetPreviewTransform();
    document.getElementById('imageEditStage')?.classList.remove('overflow-x', 'overflow-y', 'preview-mode');
    const cropCanvasEl = document.getElementById('cropCanvas');
    cropCanvasEl?.classList.remove('grid-custom-h', 'grid-custom-v', 'outpaint-mode', 'outpaint-warning', 'dragging-image', 'text-mode');
    cropCanvasEl?.classList.remove('grid-join-mode');
    document.getElementById('cropImage')?.classList.remove('grid-join-hidden');
    const joinCanvas = document.getElementById('gridJoinCanvas');
    if(joinCanvas){ joinCanvas.innerHTML = ''; joinCanvas.style.display = 'none'; joinCanvas.style.width = ''; joinCanvas.style.height = ''; }
    if(cropCanvasEl){ cropCanvasEl.style.width = ''; cropCanvasEl.style.height = ''; }
    const textCanvas = editTextCanvas();
    if(textCanvas){ textCanvas.style.left = ''; textCanvas.style.top = ''; }
    updatePreviewNavButtons();
}

function clampCrop(){
    if(!cropState) return;
    if(imageEditMode === 'outpaint') return clampOutpaint();
    const {w, h} = cropBounds();
    cropState.w = Math.max(24, Math.min(cropState.w, w)); cropState.h = Math.max(24, Math.min(cropState.h, h));
    cropState.x = Math.max(0, Math.min(cropState.x, w - cropState.w)); cropState.y = Math.max(0, Math.min(cropState.y, h - cropState.h));
}

function beginCropDrag(event, mode){
    if(!cropState) return;
    event.preventDefault(); event.stopPropagation();
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

function replaceEditedImage(file){
    const {node, index} = currentEditImage();
    if(!node || !file) return false;
    node.images[index] = {...(node.images[index] || {}), url:file.url, name:file.name, kind:file.kind || mediaKindForItem(file), natural_w:0, natural_h:0,
        asset_uris:{}, asset_item_id:'', asset_library_id:'', face_auth_status:''};
    if((node.images || []).length === 1){ delete node.w; delete node.h; }
    selectedId = node.id; selectedImage = {nodeId:node.id, index};
    return true;
}

function applyOutpaintSizeToSmartParams(width, height){
    const w = Math.max(1, Math.round(Number(width) || 0));
    const h = Math.max(1, Math.round(Number(height) || 0));
    if(!w || !h) return;
    const subject = currentEditImage().node;
    if(!subject || !isSmartImageNode(subject)) return;
    subject.outpaintSize = {width:w, height:h};
    subject.runSettings = withOutpaintDisplaySettings(subject, cloneSmartSettings(subject.runSettings || settings));
    if(activeSettingsSubject()?.id === subject.id){
        settings = smartSettingsForNode(subject);
        renderDynamicParams();
    }
}

async function applyImageCrop(){
    if(!cropState) return;
    const {node, image} = currentEditImage();
    const img = document.getElementById('cropImage');
    if(!node || !image || !img.naturalWidth || !img.naturalHeight) return;
    const scaleX = img.naturalWidth / (img.clientWidth || 1), scaleY = img.naturalHeight / (img.clientHeight || 1);
    const sx = Math.max(0, Math.round(cropState.x * scaleX)), sy = Math.max(0, Math.round(cropState.y * scaleY));
    const sw = Math.max(1, Math.round(cropState.w * scaleX)), sh = Math.max(1, Math.round(cropState.h * scaleY));
    const canvasEl = document.createElement('canvas');
    canvasEl.width = sw; canvasEl.height = sh;
    canvasEl.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const blob = await new Promise(resolve => canvasEl.toBlob(resolve, 'image/png'));
    const base = (image.name || 'image').replace(/\.[^.]+$/, '');
    const file = blob ? await uploadCroppedBlob(blob, `${base}_crop.png`) : null;
    if(file && replaceEditedImage(file)){ closeImageEditor(); render(); scheduleSave(); }
}

async function applyImageOutpaint(){
    if(!cropState) return;
    const {node, image} = currentEditImage();
    const img = document.getElementById('cropImage');
    if(!node || !image || !img.naturalWidth || !img.naturalHeight) return;
    clampOutpaint();
    const scaleX = img.naturalWidth / (img.clientWidth || 1), scaleY = img.naturalHeight / (img.clientHeight || 1);
    const outW = Math.max(img.naturalWidth, Math.round(cropState.w * scaleX));
    const outH = Math.max(img.naturalHeight, Math.round(cropState.h * scaleY));
    const dx = Math.round(cropState.x * scaleX);
    const dy = Math.round(cropState.y * scaleY);
    const canvasEl = document.createElement('canvas');
    canvasEl.width = outW; canvasEl.height = outH;
    const ctx = canvasEl.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, dx, dy, img.naturalWidth, img.naturalHeight);
    const blob = await new Promise(resolve => canvasEl.toBlob(resolve, 'image/png'));
    const base = (image.name || 'image').replace(/\.[^.]+$/, '');
    const file = blob ? await uploadCroppedBlob(blob, `${base}_outpaint.png`) : null;
    if(file && replaceEditedImage(file)){
        applyOutpaintSizeToSmartParams(outW, outH);
        setPromptDraftForNode(node, 'Remove white area and fill the scene');
        promptInput.dataset.preserveDraftOnce = '1';
        closeImageEditor();
        render();
        scheduleSave();
    }
}

async function applyImageMask(){
    if(!cropState || !editCanvasHasPixels()) return;
    const {node, image} = currentEditImage();
    if(!node || !image) return;
    const mask = maskCanvasFromDrawCanvas(editDrawCanvas());
    const blob = await new Promise(resolve => mask.toBlob(resolve, 'image/png'));
    const base = (image.name || 'image').replace(/\.[^.]+$/, '');
    const file = blob ? await uploadCroppedBlob(blob, `${base}_mask.png`) : null;
    if(file){
        node.images.push({url:file.url, name:file.name, role:'mask'});
        selectedId = node.id; selectedImage = {nodeId:node.id, index:node.images.length - 1};
        closeImageEditor(); render(); scheduleSave();
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
    if(!editCanvasHasPixels()) return;
    const {node, image} = currentEditImage();
    const img = document.getElementById('cropImage');
    if(!node || !image || !img.naturalWidth || !img.naturalHeight) return;
    const canvasEl = document.createElement('canvas');
    canvasEl.width = img.naturalWidth; canvasEl.height = img.naturalHeight;
    const ctx = canvasEl.getContext('2d');
    ctx.drawImage(img, 0, 0, canvasEl.width, canvasEl.height); ctx.drawImage(editDrawCanvas(), 0, 0); ctx.drawImage(editTextCanvas(), 0, 0);
    const blob = await new Promise(resolve => canvasEl.toBlob(resolve, 'image/png'));
    const base = (image.name || 'image').replace(/\.[^.]+$/, '');
    const file = blob ? await uploadCroppedBlob(blob, `${base}_paint.png`) : null;
    if(file && replaceEditedImage(file)){ closeImageEditor(); render(); scheduleSave(); }
}

async function applyImageGridSplit(){
    if(!cropState) return;
    if(gridOperationMode === 'join') return applyImageGridJoin();
    const {node, image} = currentEditImage();
    const img = document.getElementById('cropImage');
    if(!node || !image || !img.naturalWidth || !img.naturalHeight) return;
    const rects = gridSplitRects(img.naturalWidth, img.naturalHeight).sort((a, b) => (Number(a.row || 0) - Number(b.row || 0)) || (Number(a.col || 0) - Number(b.col || 0)));
    if(!rects.length) return;
    const base = safeExportFileName((downloadNameForMediaItem(image, 'image') || 'image').replace(/\.[^.]+$/, ''), 'image');
    const digits = String(rects.length).length;
    const blobs = [];
    for(let i = 0; i < rects.length; i++){
        const rect = rects[i];
        const canvasEl = document.createElement('canvas');
        canvasEl.width = rect.w; canvasEl.height = rect.h;
        canvasEl.getContext('2d').drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
        const blob = await new Promise(resolve => canvasEl.toBlob(resolve, 'image/png'));
        const order = String(i + 1).padStart(digits, '0');
        if(blob) blobs.push({blob, name:`${base}_${order}_r${rect.row + 1}_c${rect.col + 1}.png`});
    }
    const files = await uploadImageBlobs(blobs);
    if(files.length){
        const layout = gridLayoutFromRects(rects);
        const outputNode = createNode((node.x || 0) + imageLayout(node.images || [], nodeScale(node), node).width + 40, node.y || 0, files.map((file, i) => ({
            url:file.url,
            name:file.name,
            grid:{...layout, row:rects[i]?.row || 0, col:rects[i]?.col || 0, w:rects[i]?.w || 1, h:rects[i]?.h || 1}
        })));
        outputNode.title = 'Grid';
        closeImageEditor(); render(); scheduleSave();
    }
}

function loadGridJoinImage(entry){
    const cached = gridJoinImageCache.get(entry.index);
    if(cached?.complete && cached.naturalWidth) return Promise.resolve(cached);
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            gridJoinImageCache.set(entry.index, img);
            resolve(img);
        };
        img.onerror = () => {
            if(img.dataset.proxyFallbackTried === '1'){
                reject(new Error('图片加载失败'));
                return;
            }
            const fallback = proxiedMediaUrl(entry.item);
            if(!fallback || fallback === img.src){
                reject(new Error('图片加载失败'));
                return;
            }
            img.dataset.proxyFallbackTried = '1';
            img.src = fallback;
        };
        img.src = displayMediaUrl(entry.item);
    });
}

function drawImageCover(ctx, img, dx, dy, dw, dh){
    const sw = Math.max(1, Number(img?.naturalWidth || img?.videoWidth || img?.width || 1));
    const sh = Math.max(1, Number(img?.naturalHeight || img?.videoHeight || img?.height || 1));
    const targetW = Math.max(1, Number(dw || 1));
    const targetH = Math.max(1, Number(dh || 1));
    const scale = Math.max(targetW / sw, targetH / sh);
    const cropW = Math.max(1, targetW / scale);
    const cropH = Math.max(1, targetH / scale);
    const sx = Math.max(0, (sw - cropW) / 2);
    const sy = Math.max(0, (sh - cropH) / 2);
    ctx.drawImage(img, sx, sy, cropW, cropH, dx, dy, targetW, targetH);
}

async function applyImageGridJoin(){
    const {node, image} = currentEditImage();
    const items = currentGridJoinItems();
    if(!node || items.length <= 1){ toast('请从包含多张图片的分组打开宫格拼接'); return; }
    const layout = ensureGridJoinLayout();
    if(!layout?.items?.length) return;
    const size = gridJoinCanvasSize(layout);
    const targetLong = Math.max(256, Number(gridJoinOutputSize) || 2048);
    const outputScale = Math.max(1, targetLong / Math.max(1, Math.max(size.w, size.h)));
    const canvasEl = document.createElement('canvas');
    canvasEl.width = Math.max(1, Math.round(size.w * outputScale));
    canvasEl.height = Math.max(1, Math.round(size.h * outputScale));
    const ctx = canvasEl.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
    const byIndex = new Map(items.map(entry => [entry.index, entry]));
    for(const item of layout.items || []){
        const entry = byIndex.get(item.index);
        if(!entry) continue;
        const img = await loadGridJoinImage(entry);
        drawImageCover(ctx, img, Math.round(item.x * outputScale), Math.round(item.y * outputScale), Math.round(item.w * outputScale), Math.round(item.h * outputScale));
    }
    const blob = await new Promise(resolve => canvasEl.toBlob(resolve, 'image/png'));
    const base = safeExportFileName((downloadNameForMediaItem(image || items[0]?.item, 'image') || 'image').replace(/\.[^.]+$/, ''), 'image');
    const file = blob ? await uploadCroppedBlob(blob, `${base}_join.png`) : null;
    if(file){
        const rect = nodeRect(node);
        const outputNode = createImageNodeAt({x:rect.x + rect.width + 240, y:rect.y + rect.height / 2}, [{
            url:file.url,
            name:file.name,
            kind:'image',
            natural_w:canvasEl.width,
            natural_h:canvasEl.height
        }], {select:true, skipUndo:true});
        outputNode.title = 'Grid Join';
        closeImageEditor();
        render();
        scheduleSave();
        toast('已输出拼接图片');
    }
}

function applyImageEdit(){
    if(imageEditMode === 'preview') return;
    if(imageEditMode === 'outpaint') return applyImageOutpaint();
    if(imageEditMode === 'mask') return applyImageMask();
    if(imageEditMode === 'brush') return applyImageBrush();
    if(imageEditMode === 'grid') return applyImageGridSplit();
    return applyImageCrop();
}

function isSupportedUploadFile(file){
    const type = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    return type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/')
        || /\.(png|jpe?g|webp|gif|mp4|webm|mov|m4v|mp3|wav|m4a|aac|ogg|flac)(\?|$)/.test(name);
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

function uploadTitleForItems(items, fallback='Upload'){
    const list = [...(items || [])];
    if(!list.length) return fallback;
    const kinds = new Set(list.map(item => item instanceof File ? mediaKindForFile(item) : mediaKindForItem(item)));
    if(kinds.size > 1) return list.length > 1 ? 'Media' : fallback;
    if(kinds.has('video')) return list.length > 1 ? 'Videos' : 'Video';
    if(kinds.has('audio')) return 'Audio';
    return list.length > 1 ? 'Group' : 'Image';
}

function smartImageFilesFromDataTransfer(dataTransfer){
    return [...(dataTransfer?.files || [])].filter(isSupportedUploadFile);
}

async function smartResponseErrorMessage(response, fallback='请求失败'){
    try {
        const data = await response.clone().json();
        const detail = data.detail ?? data.error ?? data.message;
        if(typeof detail === 'string') return detail || fallback;
        if(Array.isArray(detail)) return detail.map(item => item?.msg || item?.message || String(item)).join('\n') || fallback;
    } catch(_) {}
    try {
        const text = await response.text();
        if(text) return text;
    } catch(_) {}
    return fallback;
}

function smartDropDataTypes(dataTransfer){
    return [...(dataTransfer?.types || [])].map(type => String(type || ''));
}

function readSmartDropData(dataTransfer, type){
    try { return dataTransfer?.getData?.(type) || ''; } catch(_) { return ''; }
}

function decodeSmartDropText(value){
    const text = String(value || '').trim();
    if(!text) return '';
    try { return decodeURIComponent(text); } catch(_) { return text; }
}

function smartDropTextFragments(value){
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

function uniqueSmartDropValues(values){
    const seen = new Set();
    return values.filter(value => {
        const key = String(value || '').trim();
        if(!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function smartDropTextCandidates(dataTransfer){
    if(!dataTransfer) return [];
    const types = uniqueSmartDropValues([...SMART_IMAGE_DROP_TEXT_TYPES, ...smartDropDataTypes(dataTransfer)]);
    const values = types.map(type => readSmartDropData(dataTransfer, type)).filter(Boolean);
    return uniqueSmartDropValues(values.flatMap(smartDropTextFragments).map(decodeSmartDropText))
        .filter(s => s && !s.startsWith('#'));
}

function isRemoteSmartImageDropValue(value){
    const text = String(value || '').trim();
    return /^https?:\/\/.+/i.test(text) || /^data:image\//i.test(text) || /^blob:/i.test(text);
}

function isLocalSmartImageDropValue(value){
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
    return (isWindowsPath || isPosixPath) && SMART_IMAGE_DROP_EXT_RE.test(clean);
}

function smartLocalImagePathsFromDataTransfer(dataTransfer){
    return uniqueSmartDropValues(smartDropTextCandidates(dataTransfer).filter(isLocalSmartImageDropValue));
}

function smartImageNameFromUrl(url){
    try {
        const clean = String(url || '').split('?', 1)[0].split('#', 1)[0];
        return decodeURIComponent(clean.split('/').pop() || 'image');
    } catch(_) {
        return 'image';
    }
}

function smartImageDropPayload(dataTransfer){
    const assetRaw = readSmartDropData(dataTransfer, 'application/x-smart-asset');
    if(assetRaw){
        try {
            const asset = JSON.parse(assetRaw);
            if(asset?.url) return {type:'url', ...asset, asset_uris:asset.asset_uris || {}};
        } catch(_) {}
    }
    const files = smartImageFilesFromDataTransfer(dataTransfer);
    if(files.length) return {type:'files', files};
    const localPaths = smartLocalImagePathsFromDataTransfer(dataTransfer);
    if(localPaths.length) return {type:'localPaths', localPaths};
    const url = smartDropTextCandidates(dataTransfer).find(isRemoteSmartImageDropValue) || '';
    if(url) return {type:'url', url};
    return {type:'none'};
}

async function resolveSmartImageDropPayload(dataTransfer){
    const payload = smartImageDropPayload(dataTransfer);
    if(payload.type !== 'none') return payload;
    const files = await uploadFilesFromDataTransfer(dataTransfer);
    return files.length ? {type:'files', files} : payload;
}

function hasSmartImageDropData(dataTransfer){
    if(!dataTransfer) return false;
    if(smartImageFilesFromDataTransfer(dataTransfer).length) return true;
    const types = smartDropDataTypes(dataTransfer);
    if(types.some(type => SMART_IMAGE_DROP_TYPE_HINT_RE.test(type.toLowerCase()))) return true;
    return smartImageDropPayload(dataTransfer).type !== 'none';
}

function hasSmartAssetDrag(dataTransfer){
    return smartDropDataTypes(dataTransfer).includes('application/x-smart-asset');
}

function hasMediaDrawerDrag(dataTransfer){
    return smartDropDataTypes(dataTransfer).includes('application/x-smart-asset');
}

function hasSmartInputThumbDrag(dataTransfer){
    return smartDropDataTypes(dataTransfer).includes('application/x-smart-input-thumb');
}

function setSmartDropCopyEffect(e, includeAsset=false){
    e.preventDefault();
    if(hasSmartInputThumbDrag(e.dataTransfer)) return;
    if(hasSmartImageDropData(e.dataTransfer) || (includeAsset && hasSmartAssetDrag(e.dataTransfer))){
        e.dataTransfer.dropEffect = 'copy';
    }
}

async function uploadFiles(files){
    const supported = [...(files || [])].filter(isSupportedUploadFile);
    if(!supported.length) return [];
    const form = new FormData();
    supported.forEach(file => form.append('files', file, file.name || 'media'));
    const data = await window.CanvasApi.uploadAi(form, {checkOk:true, errorFallback:tr('smart.toastUploadFail')});
    return (data.files || []).map((file, index) => ({
        ...file,
        kind:file.kind || mediaKindForFile(supported[index])
    }));
}

function appendImagesToSmartNode(uploaded, targetId='', opts={}){
    const images = [...(uploaded || [])].filter(file => file?.url);
    if(!images.length) return;
    let node = nodes.find(n => n.id === targetId) || selectedNode();
    if(node && !isSmartImageNode(node)) node = null;
    if(opts.forceNew) node = null;
    if(!node){
        const center = opts.point || viewportCenter();
        undoSuppressed = true;
        node = createImageNodeAt(center, []);
        undoSuppressed = false;
    }
    const previousCount = (node.images || []).length;
    node.images = [...(node.images || []), ...images.map(file => ({...file, kind:file.kind || mediaKindForItem(file)}))];
    if(node.images.length > 1){
        node.title = uploadTitleForItems(node.images, 'Group');
        if(previousCount <= 1 && (!Number.isFinite(Number(node.scale)) || Number(node.scale) === MEDIA_NODE_DEFAULT_SCALE || Number(node.scale) === MEDIA_GROUP_PREVIOUS_DEFAULT_SCALE)){
            node.scale = MEDIA_GROUP_DEFAULT_SCALE;
        }
        delete node.w;
        delete node.h;
    }
    if(node.images.length === 1){ node.title = uploadTitleForItems(node.images, node.title || 'Image'); delete node.w; delete node.h; }
    selectedId = node.id;
    render();
    scheduleSave();
}

async function handleFiles(files, targetId='', opts={}){
    try {
        const fileList = [...(files || [])].filter(isSupportedUploadFile);
        if(!fileList.length) return;
        const uploaded = await uploadFiles(fileList);
        if(!uploaded.length) return;
        if(!opts.skipUndo) pushUndo();
        appendImagesToSmartNode(uploaded.map((file, index) => ({...file, kind:file.kind || mediaKindForFile(fileList[index])})), targetId, opts);
    } catch(e) { toast(e.message || tr('smart.toastUploadFail')); }
}

async function importSmartLocalImages(paths){
    if(!paths?.length) return [];
    const response = await fetch('/api/ai/import-local-image', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({paths})
    });
    if(!response.ok) throw new Error(await smartResponseErrorMessage(response, tr('smart.toastUploadFail')));
    const data = await response.json();
    return data.files || [];
}

async function handleSmartImageDropPayload(payload, targetId='', opts={}){
    try {
        if(payload.type === 'files') await handleFiles(payload.files, targetId, opts);
        else if(payload.type === 'localPaths') {
            if(!opts.skipUndo) pushUndo();
            appendImagesToSmartNode(await importSmartLocalImages(payload.localPaths), targetId, opts);
        } else if(payload.type === 'url') {
            if(!opts.skipUndo) pushUndo();
            appendImagesToSmartNode([{url:payload.url, name:payload.name || smartImageNameFromUrl(payload.url), kind:payload.kind || 'image', asset_uris:payload.asset_uris || {}}], targetId, opts);
        }
    } catch(e) {
        toast(e.message || tr('smart.toastUploadFail'));
    }
}

// Called once by smart-canvas.js, at its original initialization position.
function bindSmartImageEditorControls(){
    document.getElementById('cropBox').addEventListener('mousedown', event => beginCropDrag(event, 'move'));
    document.getElementById('cropHandle').addEventListener('mousedown', event => beginCropDrag(event, 'resize'));
    document.getElementById('outpaintFrame').addEventListener('mousedown', event => {
        if(event.target.closest('[data-outpaint-handle]')) return;
        beginCropDrag(event, 'image');
    });
    document.querySelectorAll('[data-outpaint-handle]').forEach(handle => {
        handle.addEventListener('mousedown', event => beginCropDrag(event, `outpaint-${handle.dataset.outpaintHandle || 'corner'}`));
    });
    document.getElementById('cropImage').addEventListener('mousedown', event => {
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
    imageEditModal.addEventListener('pointerdown', event => {
        event.stopPropagation();
    });
    imageEditModal.addEventListener('mousedown', event => {
        event.stopPropagation();
    });
    imageEditModal.addEventListener('mousemove', event => {
        if(previewPanDrag || previewCompareDrag || panoramaState.drag || imageEditPanDrag || cropDrag) return;
        event.stopPropagation();
    });
    imageEditModal.addEventListener('click', event => {
        event.stopPropagation();
        if(event.target === imageEditModal) closeImageEditor();
    });
    imageEditModal.addEventListener('wheel', event => {
        event.stopPropagation();
    }, {passive:false});
}

// Called once by smart-canvas.js, at its original initialization position.
function bindSmartImageEditorPanEvents(){
    document.getElementById('imageEditStage').addEventListener('mousedown', event => {
        if(imageEditMode === 'preview' || event.button !== 0) return;
        if(event.target.closest('.image-edit-actions, .preview-tools-overlay, .preview-download-overlay, .crop-box, .crop-handle')) return;
        if(event.target.closest('#editDrawCanvas, #editTextCanvas, .edit-text-inline') && imageEditMode !== 'crop') return;
        const stage = event.currentTarget;
        if(stage.scrollWidth <= stage.clientWidth && stage.scrollHeight <= stage.clientHeight) return;
        event.preventDefault();
        event.stopPropagation();
        imageEditPanDrag = {
            clientX:event.clientX,
            clientY:event.clientY,
            scrollLeft:stage.scrollLeft,
            scrollTop:stage.scrollTop
        };
    });
}

// Called once by smart-canvas.js, at its original initialization position.
function bindSmartDrawingControls(){
    document.getElementById('editDrawCanvas').addEventListener('pointerdown', beginEditDraw);
    document.getElementById('editDrawCanvas').addEventListener('pointermove', moveEditDraw);
    document.getElementById('editDrawCanvas').addEventListener('pointerup', endEditDraw);
    document.getElementById('editDrawCanvas').addEventListener('pointercancel', endEditDraw);
    document.getElementById('editDrawCanvas').addEventListener('pointerleave', endEditDraw);
    document.getElementById('gridJoinCanvas')?.addEventListener('pointerdown', beginGridJoinDrag);
    document.getElementById('gridJoinCanvas')?.addEventListener('pointermove', moveGridJoinDrag);
    document.getElementById('gridJoinCanvas')?.addEventListener('pointerup', endGridJoinDrag);
    document.getElementById('gridJoinCanvas')?.addEventListener('pointercancel', endGridJoinDrag);
    document.getElementById('gridJoinCanvas')?.addEventListener('pointerleave', endGridJoinDrag);
    document.getElementById('editTextCanvas')?.addEventListener('pointerdown', beginEditText);
    document.getElementById('editTextCanvas')?.addEventListener('pointermove', moveEditText);
    document.getElementById('editTextCanvas')?.addEventListener('pointerup', endEditText);
    document.getElementById('editTextCanvas')?.addEventListener('pointercancel', endEditText);
    document.getElementById('editTextCanvas')?.addEventListener('pointerleave', endEditText);
    document.getElementById('editTextCanvas')?.addEventListener('dblclick', event => {
        if(imageEditMode !== 'brush' || brushTool !== 'text') return;
        event.preventDefault(); event.stopPropagation();
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
}

// Called once by smart-canvas.js, at its original initialization position.
function bindSmartImageEditorViewport(){
    document.getElementById('imageEditStage').addEventListener('wheel', event => {
        if(!cropState) return;
        event.preventDefault();
        event.stopPropagation();
        if(imageEditMode === 'preview'){
            if(seekPreviewVideoFrames(event.deltaY > 0 ? 1 : -1)) return;
            if(panoramaState.enabled){
                const factor = event.deltaY < 0 ? 0.92 : 1 / 0.92;
                panoramaState.fov = Math.max(35, Math.min(100, panoramaState.fov * factor));
                updateZoomLabel();
                return;
            }
            const oldZoom = previewZoom;
            const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
            previewZoom = Math.max(0.05, previewZoom * factor);
            const frame = document.getElementById('previewFrame');
            const rect = frame?.getBoundingClientRect();
            if(rect){
                const originX = event.clientX - rect.left - rect.width / 2;
                const originY = event.clientY - rect.top - rect.height / 2;
                const ratio = previewZoom / oldZoom;
                previewPan.x -= originX * (ratio - 1);
                previewPan.y -= originY * (ratio - 1);
            }
            applyPreviewTransform();
            return;
        }
        if(imageEditMode === 'grid' && gridOperationMode === 'join'){
            const stage = event.currentTarget;
            const oldZoom = imageEditZoom;
            const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
            imageEditZoom = Math.max(0.15, Math.min(6.0, imageEditZoom * factor));
            const stageRect = stage.getBoundingClientRect();
            const mx = event.clientX - stageRect.left;
            const my = event.clientY - stageRect.top;
            const contentX = stage.scrollLeft + mx;
            const contentY = stage.scrollTop + my;
            const scale = imageEditZoom / oldZoom;
            refreshGridSplitPreview();
            syncImageEditOverflow();
            updateZoomLabel();
            stage.scrollLeft = contentX * scale - mx;
            stage.scrollTop = contentY * scale - my;
            return;
        }
        const stage = event.currentTarget;
        const oldZoom = imageEditZoom;
        const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
        imageEditZoom = Math.max(0.15, Math.min(6.0, imageEditZoom * factor));
        const stageRect = stage.getBoundingClientRect();
        const mx = event.clientX - stageRect.left;
        const my = event.clientY - stageRect.top;
        const contentX = stage.scrollLeft + mx;
        const scale = imageEditZoom / oldZoom;
        const contentY = stage.scrollTop + my;
        applyImageEditZoom(scale);
        stage.scrollLeft = contentX * scale - mx;
        stage.scrollTop = contentY * scale - my;
    }, {passive:false});
    window.addEventListener('resize', () => {
        if(cropState) syncImageEditOverflow();
        if(panoramaState.enabled) resizePanoramaViewer();
    });
}
