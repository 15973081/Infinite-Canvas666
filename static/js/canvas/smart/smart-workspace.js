/* Smart canvas: Node/connection rendering, viewport, gestures and input controls.
 * Browser classic script (not an ES module); loaded before smart-canvas.js.
 * Function declarations only: initialization is explicitly invoked by the entry.
 * Uses the entry's existing shared bindings; do not duplicate permission or document state.
 */

function smartMediaPreviewUrl(itemOrUrl, size=512){
    const url = typeof itemOrUrl === 'string' ? itemOrUrl : (itemOrUrl?.url || '');
    const displayUrl = displayMediaUrl(itemOrUrl);
    const raw = String(url || '');
    if(!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return displayUrl;
    if(!raw.startsWith('/output/') && !raw.startsWith('/assets/')) return displayUrl;
    if(!/\.(png|jpe?g|webp|gif|bmp|avif|tiff?|mp4|webm|mov|m4v)(\?|#|$)/i.test(raw)) return displayUrl;
    const width = Math.max(64, Math.min(2048, Math.round(Number(size) || 512)));
    return window.MemberMediaUrl ? window.MemberMediaUrl(`/api/media-preview?w=${width}&url=${encodeURIComponent(raw)}`) : `/api/media-preview?w=${width}&url=${encodeURIComponent(raw)}`;
}

function smartPreviewImgHtml(itemOrUrl, size=512, attrs=''){
    const original = typeof itemOrUrl === 'string' ? itemOrUrl : (itemOrUrl?.url || '');
    const preview = smartMediaPreviewUrl(itemOrUrl, size);
    const source = window.CanvasMediaLoader?.imageAttributes(preview) || `src="${escapeHtml(preview)}"`;
    return `<img ${source} data-preview-src="${escapeAttr(preview)}" data-original-src="${escapeAttr(original)}" data-url="${escapeAttr(original)}" loading="lazy"${attrs ? ` ${attrs}` : ''}>`;
}

function smartVideoPreviewHtml(itemOrUrl, size=512, attrs=''){
    const original = typeof itemOrUrl === 'string' ? itemOrUrl : (itemOrUrl?.url || '');
    const preview = smartMediaPreviewUrl(itemOrUrl, size);
    const source = window.CanvasMediaLoader?.imageAttributes(preview) || `src="${escapeHtml(preview)}"`;
    return `<img ${source} data-preview-src="${escapeAttr(preview)}" data-original-src="${escapeAttr(original)}" data-url="${escapeAttr(original)}" data-preview-kind="video" loading="lazy"${attrs ? ` ${attrs}` : ''}>`;
}

function smartVideoFallbackHtml(url, attrs=''){
    const safe = escapeHtml(url || '');
    return `<div class="smart-video-fallback" data-url="${safe}"${attrs ? ` ${attrs}` : ''}><span>VIDEO</span></div>`;
}

function isSmartPreviewImage(img){
    return img?.tagName?.toLowerCase?.() === 'img'
        && img.dataset?.previewSrc
        && img.dataset?.originalSrc
        && img.dataset.previewSrc !== img.dataset.originalSrc
        && img.getAttribute('src') !== img.dataset.originalSrc;
}

function bindSmartPreviewImageFallbacks(root=document){
    root.querySelectorAll?.('img[data-preview-src][data-original-src]:not([data-preview-fallback-bound])').forEach(img => {
        img.dataset.previewFallbackBound = '1';
        img.addEventListener('error', () => {
            if(img.dataset.mediaPriorityPaused || img.dataset.canvasMediaSrc) return;
            if(img.dataset.smartGroupSrc && !img.hasAttribute('src')) return;
            const original = img.dataset.originalSrc || '';
            if(img.dataset.previewKind === 'video'){
                const tpl = document.createElement('template');
                tpl.innerHTML = smartVideoFallbackHtml(original, img.dataset.videoFallbackAttrs || '');
                const fallback = tpl.content.firstElementChild;
                img.replaceWith(fallback);
                return;
            }
            if(original && img.getAttribute('src') !== original) img.src = window.MemberMediaUrl ? window.MemberMediaUrl(original) : original;
        });
    });
    manageSmartGroupPreviews(root);
}

function manageSmartGroupPreviews(root){
    root.querySelectorAll?.('.thumb-grid').forEach(grid => {
        if(grid._smartPreviewObserver) return;
        const items = [...grid.querySelectorAll('.thumb-item')].filter(item => item.querySelector('img[data-smart-group-src]'));
        if(!items.length) return;
        if(typeof IntersectionObserver === 'undefined'){
            items.forEach(item => { const img=item.querySelector('img[data-smart-group-src]'); img.src=img.dataset.smartGroupSrc; });
            return;
        }
        grid._smartPreviewObserver = new IntersectionObserver(entries => {
            if(!grid.isConnected) return;
            entries.forEach(entry => {
                const img = entry.target.querySelector('img[data-smart-group-src]');
                if(!img) return;
                if(entry.isIntersecting){
                    if(!img.hasAttribute('src')) img.src = img.dataset.smartGroupSrc;
                } else if(img.hasAttribute('src')){
                    img.dataset.smartGroupSrc = img.getAttribute('src');
                    img.removeAttribute('src');
                }
            });
        }, {root:grid, rootMargin:'200px 0px'});
        items.forEach(item => grid._smartPreviewObserver.observe(item));
    });
}

function releaseSmartGroupPreviews(root){
    root.querySelectorAll?.('.thumb-grid').forEach(grid => {
        grid._smartPreviewObserver?.disconnect();
        delete grid._smartPreviewObserver;
    });
}

function smartSettingsModeKey(source=settings){
    const engine = ['api','volcengine','modelscope','comfy'].includes(source?.engine) ? source.engine : 'api';
    if(engine === 'api') return `api:${source?.apiKind === 'video' ? 'video' : 'image'}`;
    if(engine === 'volcengine') return `volcengine:${source?.apiKind === 'video' ? 'video' : 'image'}`;
    if(engine === 'comfy') return `comfy:${['text','enhance','edit','custom'].includes(source?.comfyMode) ? source.comfyMode : 'text'}`;
    return 'modelscope';
}

function applyRecentSmartSettingsForCurrentMode(){
    const requestedEngine = ['api','volcengine','modelscope','comfy'].includes(settings.engine) ? settings.engine : 'api';
    const requestedApiKind = settings.apiKind === 'video' ? 'video' : 'image';
    const key = smartSettingsModeKey(settings);
    const saved = recentSmartSettingsForMode(key);
    if(!Object.keys(saved).length){
        settings.engine = requestedEngine;
        if(isApiLikeEngine(requestedEngine)) settings.apiKind = requestedApiKind;
        clearVolcengineSelectionOutsideVolcengine(settings);
        sanitizeSmartApiSelection(settings);
        return;
    }
    settings = {...settings, ...saved, engine:requestedEngine};
    if(isApiLikeEngine(requestedEngine)) settings.apiKind = requestedApiKind;
    clearVolcengineSelectionOutsideVolcengine(settings);
    sanitizeSmartApiSelection(settings);
}

function clearVolcengineSelectionOutsideVolcengine(target=settings){
    if(!target || typeof target !== 'object' || target.engine === 'volcengine') return target;
    if(target.provider_id === 'volcengine') target.provider_id = '';
    if(target.videoProvider === 'volcengine') target.videoProvider = '';
    return target;
}

function isSmartImageNode(node){
    return Boolean(node && (node.type === 'smart-image' || !node.type));
}

function isHistoryGroupNode(node){
    return Boolean(isSmartImageNode(node) && (node.isHistoryGroup || node.historyFor));
}

function normalizeSmartImageMode(mode){
    return 'self';
}

function smartImageMode(node){
    return 'self';
}

function setSmartImageMode(node, mode){
    if(!isSmartImageNode(node)) return;
    delete node.imageMode;
}

function smartImageUsesWorkflowInput(node, ctx=smartLoopContext){
    return Boolean(isSmartImageNode(node) && ctx?.forceWorkflow);
}

function promptPlainText(){
    return promptInput.innerText.replace(/\u00a0/g, ' ').trim();
}

function setPromptInputLocked(locked){
    promptInput.dataset.promptLocked = locked ? '1' : '0';
    promptInput.setAttribute('contenteditable', locked ? 'false' : 'true');
    promptInput.classList.toggle('prompt-input-locked', Boolean(locked));
    if(locked) closeMentionPicker();
}

function setPromptText(text){
    promptInput.textContent = text || '';
}

function selectedNode(){ return nodes.find(n => n.id === smartSelection.nodeId) || null; }

function clearSelection(){return smartSelection.clear();}

function clearImageClickTimer(){return smartSelection.cancelImageClick();}

// Selection contains IDs only. Document/task commands deliberately do not render,
// save drafts or schedule saves: their callers already own those batch operations.
function createSmartSelection(){
    const emptyImage = Object.freeze({nodeId:'', index:-1});
    const emptyIds = Object.freeze([]);
    let snapshot = Object.freeze({selectedId:'', selectedIds:emptyIds, selectedImage:emptyImage});
    let imageClickTimer=null, generation=0, paused=false, destroyed=false;
    const listeners=[];
    function cancelImageClick(){
        generation++;
        if(imageClickTimer!==null)clearTimeout(imageClickTimer);
        imageClickTimer=null;
    }
    function commit(id, ids, image){
        if(destroyed)return;
        cancelImageClick();
        snapshot=Object.freeze({selectedId:id,
            selectedIds:Object.isFrozen(ids)?ids:Object.freeze([...ids]),
            selectedImage:Object.isFrozen(image)?image:Object.freeze({...image})});
    }
    function nodeTarget(id){commit(id,emptyIds,emptyImage);}
    function imageTarget(id,index){commit(id,emptyIds,{nodeId:id,index});}
    function clear(){if(paused || destroyed)return;savePromptDraftForCurrent();nodeTarget('');}
    function clickNode(id,element){
        if(paused || destroyed)return;
        const node=nodes.find(n=>n.id===id);
        if(!node)return;
        hideRunTimerForNode(node);nodeTarget(id);
        if(smartCascadeAnyRunning())smartCascadeSilentSelection=false;
        if(element.classList.contains('image-node-placeholder'))refreshSmartNodes([id]);
        syncSelectionUi();refreshRunTimerPills();updateComposer();
    }
    function uploadTarget(id){
        if(paused || destroyed)return;
        hideRunTimerForNode(nodes.find(n=>n.id===id));nodeTarget(id);
        pendingGroupUploadPoint=null;uploadTargetId=id;
        syncSelectionUi();updateComposer();pickMediaForSmartNode(id);
    }
    function deferImageClick(node,index){
        cancelImageClick();
        if(paused || destroyed || !node)return;
        const epoch=generation, documentId=canvas?.id, imageUrl=node.images?.[index]?.url;
        imageClickTimer=setTimeout(()=>{
            imageClickTimer=null;
            if(paused || destroyed || epoch!==generation || canvas?.id!==documentId ||
                !nodes.includes(node) || node.images?.[index]?.url!==imageUrl)return;
            hideRunTimerForNode(node);
            commit(node.id,emptyIds,(node.images || []).length>1?emptyImage:{nodeId:node.id,index});
            if(smartCascadeAnyRunning())smartCascadeSilentSelection=false;
            syncSelectionUi();updateComposer();
        },220);
    }
    function audioTarget(node,index){
        if(paused || destroyed)return;
        imageTarget(node.id,index);hideRunTimerForNode(node);
    }
    function insertedNodes(ids){commit(ids.length===1?ids[0]:'',ids.length>1?ids:emptyIds,emptyImage);}
    function boxSelection(ids){commit(ids.length===1?ids[0]:'',ids,emptyImage);}
    function documentReplacing(){cancelImageClick();}
    function documentRestoring(){commit('',emptyIds,snapshot.selectedImage);}
    function restoreDocument(value){
        // Undo JSON keeps its original shape. Copy incoming collections so callers
        // cannot retain a writable alias to the live selection.
        commit(value.selectedId,[...value.selectedIds],{...value.selectedImage});
    }
    function nodesRemoved(ids){
        const removed=new Set(ids);
        commit(removed.has(snapshot.selectedId)?'':snapshot.selectedId,
            snapshot.selectedIds.filter(id=>!removed.has(id)),
            removed.has(snapshot.selectedImage.nodeId)?emptyImage:snapshot.selectedImage);
    }
    function mediaCleared(id){commit(id,emptyIds,snapshot.selectedImage.nodeId===id?emptyImage:snapshot.selectedImage);}
    function imagesChanged(id,count){
        const image=snapshot.selectedImage.nodeId===id
            ? {nodeId:id,index:Math.min(snapshot.selectedImage.index,count-1)} : snapshot.selectedImage;
        commit(snapshot.selectedId,snapshot.selectedIds,image.index<0?emptyImage:image);
    }
    function withReferencePreview(action){
        if(paused || destroyed)return;
        const previous=snapshot;
        try{return action();}finally{if(!destroyed)snapshot=previous;}
    }
    function withLogPreview(action){
        if(paused || destroyed)return;
        const previous=snapshot;
        try{return action();}finally{commit(previous.selectedId,snapshot.selectedIds,{...previous.selectedImage});}
    }
    function taskSource(id){commit(id,snapshot.selectedIds,emptyImage);}
    function taskOutput(id){
        if(destroyed)return;
        commit(id,snapshot.selectedIds,snapshot.selectedImage);
        smartComposer.outputSelected();
        commit(id,snapshot.selectedIds,emptyImage);
    }
    function taskFinished(){if(destroyed)return;nodeTarget('');smartComposer.finishCascade();}
    function clearListeners(){for(const [type,fn] of listeners)window.removeEventListener(type,fn);listeners.length=0;}
    function bind(){
        if(destroyed)return;clearListeners();
        for(const [type,fn] of [['pagehide',event=>event.persisted?pause():destroy()],['pageshow',event=>{if(event.persisted)resume();}]]){
            window.addEventListener(type,fn);listeners.push([type,fn]);
        }
    }
    function pause(){if(destroyed)return;paused=true;cancelImageClick();}
    function resume(){if(!destroyed)paused=false;}
    function destroy(){if(destroyed)return;cancelImageClick();clearListeners();destroyed=true;paused=false;}
    return Object.freeze({
        get state(){return snapshot;},get nodeId(){return snapshot.selectedId;},
        get ids(){return snapshot.selectedIds;},get image(){return snapshot.selectedImage;},
        bind,pause,resume,destroy,cancelImageClick,clear,clickNode,uploadTarget,deferImageClick,audioTarget,
        documentReplacing,documentRestoring,restoreDocument,insertedNodes,boxSelection,nodesRemoved,mediaCleared,imagesChanged,
        withReferencePreview,withLogPreview,taskSource,taskOutput,taskFinished,
        createdNode:id=>commit(id,snapshot.selectedIds,snapshot.selectedImage),
        createdMedia:id=>imageTarget(id,0),grouped:nodeTarget,duplicating:()=>nodeTarget(''),
        toolbarImage:(id,index)=>{if(!paused)imageTarget(id,index);},
        previewTarget:(id,index)=>{if(!paused)imageTarget(id,index);},
        panelTarget:id=>{if(!paused)nodeTarget(id);},
        editorTarget:(id,index)=>{if(!paused)commit(id,snapshot.selectedIds,{nodeId:id,index});},
        taskFailed:id=>commit(id,snapshot.selectedIds,snapshot.selectedImage),taskTail:nodeTarget,
        outputsReplaced:()=>commit(snapshot.selectedId,snapshot.selectedIds,emptyImage),
        primaryReleased:id=>{if(snapshot.selectedId===id)commit('',snapshot.selectedIds,snapshot.selectedImage);},
        thumbDetached:()=>commit('',snapshot.selectedIds,emptyImage)
    });
}

function syncSelectionUi(){
    world.classList.toggle('smart-multi-selected', selectedNodeIds().length > 1);
    world.querySelectorAll('.image-node').forEach(el => {
        const id = el.dataset.id || '';
        el.classList.toggle('selected', isNodeSelected(id));
        el.querySelectorAll('.thumb-item,.image-wrap').forEach(item => {
            const index = Number(item.dataset.imageIndex || 0);
            item.classList.toggle('image-selected', smartSelection.image.nodeId === id && smartSelection.image.index === index);
        });
    });
    positionPixmaxVideoToolbars();
}

function isNodeSelected(id){
    return smartSelection.nodeId === id || smartSelection.ids.includes(id);
}

function selectedNodeIds(){
    return smartSelection.ids.length ? smartSelection.ids.slice() : (smartSelection.nodeId ? [smartSelection.nodeId] : []);
}

function isEditableTarget(target){
    const el = target || document.activeElement;
    return !!el?.closest?.('input, textarea, select, option, [contenteditable="true"], .prompt-node-control, .prompt-input');
}

function safeScale(value){
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 1;
}

function nodeScale(node){
    const v = Number(node?.scale);
    if((node?.images || []).length > 1 && v === MEDIA_GROUP_PREVIOUS_DEFAULT_SCALE) return MEDIA_GROUP_DEFAULT_SCALE;
    return Number.isFinite(v) && v > 0 ? v : 1;
}

function mediaNodeDefaultScale(node){
    if((node?.images || []).length > 1 && !Number.isFinite(Number(node?.scale))) return MEDIA_GROUP_DEFAULT_SCALE;
    return Number.isFinite(Number(node?.scale)) && Number(node.scale) > 0 ? Number(node.scale) : MEDIA_NODE_DEFAULT_SCALE;
}

function mediaLayoutSize(img){
    const width = Number(img?.natural_w || img?.width || img?.w || img?.layout_w || img?.preview_w || 0);
    const height = Number(img?.natural_h || img?.height || img?.h || img?.layout_h || img?.preview_h || 0);
    return width > 0 && height > 0 ? {width, height} : {width:0, height:0};
}

function copyMediaSizeFields(source, target={}){
    if(!source || typeof source !== 'object') return target;
    ['natural_w','natural_h','width','height','w','h','layout_w','layout_h'].forEach(key => {
        const n = Number(source[key]);
        if(Number.isFinite(n) && n > 0) target[key] = n;
    });
    return target;
}

function singleImageLayout(image, node, scale){
    const explicitW = Number(node?.w);
    const explicitH = Number(node?.h);
    const layoutSize = mediaLayoutSize(image);
    // Older auto measurements persisted the previous default bounds. Recognize
    // that exact pair while keeping custom sizes and explicit scale preferences.
    const oldFit = layoutSize.width > 0 && layoutSize.height > 0 ? Math.min(260 * scale / layoutSize.width,220 * scale / layoutSize.height) : 0;
    const legacyWidth = oldFit ? Math.max(72,Math.round(layoutSize.width * oldFit)) : Math.round(260 * scale);
    const legacyHeight = oldFit ? Math.max(72,Math.round(layoutSize.height * oldFit)) : Math.round(180 * scale);
    const previousFit=layoutSize.width>0&&layoutSize.height>0?320/Math.max(layoutSize.width,layoutSize.height):0;
    const previousAutoSize=scale===MEDIA_NODE_DEFAULT_SCALE&&previousFit&&explicitW===Math.max(72,Math.round(layoutSize.width*previousFit))&&explicitH===Math.max(72,Math.round(layoutSize.height*previousFit));
    const legacyAutoSize = !isAudioMediaItem(image) && (previousAutoSize || scale === MEDIA_NODE_DEFAULT_SCALE && explicitW === legacyWidth && explicitH === legacyHeight);
    if(!legacyAutoSize && Number.isFinite(explicitW) && explicitW > 24 && Number.isFinite(explicitH) && explicitH > 24){
        return {cols:1, rows:1, width:Math.round(explicitW), height:Math.round(explicitH), thumb:Math.round(96 * scale), single:true};
    }
    if(isAudioMediaItem(image)){
        return {
            cols:1,
            rows:1,
            width:280,
            height:120,
            thumb:Math.round(96 * scale),
            single:true
        };
    }
    const naturalW = layoutSize.width;
    const naturalH = layoutSize.height;
    if(naturalW > 0 && naturalH > 0){
        const maxW = MEDIA_NODE_DEFAULT_SIZE * scale / MEDIA_NODE_DEFAULT_SCALE;
        const maxH = maxW;
        const fit = maxW / Math.min(naturalW,naturalH);
        return {
            cols:1,
            rows:1,
            width:Math.max(72, Math.round(naturalW * fit)),
            height:Math.max(72, Math.round(naturalH * fit)),
            thumb:Math.round(96 * scale),
            single:true
        };
    }
    const width=MEDIA_NODE_DEFAULT_SIZE * scale / MEDIA_NODE_DEFAULT_SCALE;
    return {cols:1, rows:1, width:Math.round(isVideoMediaItem(image)?width*1.5:width), height:Math.round(width), thumb:Math.round(96*scale), single:true};
}

function groupImageGridLayout(count, explicitW, explicitH, maxThumb, pad=32, gap=8, maxVisibleRows=MEDIA_GROUP_MAX_VISIBLE_ROWS){
    let best = null;
    for(let cols = 1; cols <= count; cols++){
        const rows = Math.ceil(count / cols);
        const visibleRows = Math.min(Math.max(1, maxVisibleRows), rows);
        const availableW = explicitW - pad - (cols - 1) * gap;
        const availableH = explicitH - pad - (visibleRows - 1) * gap;
        if(availableW <= 0 || availableH <= 0) continue;
        const rawThumb = Math.floor(Math.min(availableW / cols, availableH / visibleRows));
        const fittedThumb = Math.max(28, Math.min(maxThumb, rawThumb));
        const fits = rawThumb >= 28;
        const usedW = cols * fittedThumb + (cols - 1) * gap + pad;
        const usedH = visibleRows * fittedThumb + (visibleRows - 1) * gap + pad;
        const spareW = Math.max(0, explicitW - usedW);
        const spareH = Math.max(0, explicitH - usedH);
        const atMax = fittedThumb >= maxThumb;
        const score = [
            fits ? 1 : 0,
            fittedThumb,
            atMax ? cols : 0,
            -(spareW + spareH * 0.35),
            -rows
        ];
        let better = !best;
        if(best){
            for(let i = 0; i < score.length; i++){
                if(score[i] === best.score[i]) continue;
                better = score[i] > best.score[i];
                break;
            }
        }
        if(better){
            best = {cols, rows, visibleRows, thumb:fittedThumb, score};
        }
    }
    const fallbackCols = Math.min(count, 2);
    const fallbackRows = Math.ceil(count / fallbackCols);
    return best || {cols:fallbackCols, rows:fallbackRows, visibleRows:Math.min(MEDIA_GROUP_MAX_VISIBLE_ROWS, fallbackRows), thumb:28};
}

function smartNodeInputThumbRows(count){
    return count ? Math.ceil(Math.min(10, count) / 5) : 0;
}

function smartNodeInputThumbsHeight(images){
    const rows = smartNodeInputThumbRows((images || []).length);
    return rows ? rows * 44 + (rows - 1) * 6 + 8 : 0;
}

function smartNodeInputThumbsHtml(images, opts={}){
    const refs = (images || []).filter(img => img?.url);
    if(!refs.length) return '';
    const limit = Math.min(10, refs.length);
    const items = refs.slice(0, limit).map((img, index) => {
        const label = opts.labelPrefix ? `${opts.labelPrefix}${index + 1}` : (`图${index + 1}`);
        const media = isAudioMediaItem(img)
            ? `<div class="media-thumb audio-thumb"><i data-lucide="file-audio"></i><span>${escapeHtml(img.name || 'Audio')}</span></div>`
            : isVideoMediaItem(img)
            ? smartVideoPreviewHtml(img, 256, 'alt=""')
            : smartPreviewImgHtml(img, 256, 'alt=""');
        return `<div class="smart-node-input-thumb" title="${escapeHtml(label)}">${media}<span class="smart-node-input-badge">${escapeHtml(label)}</span></div>`;
    }).join('');
    const more = refs.length > limit ? `<div class="smart-node-input-thumb smart-node-input-more">+${refs.length - limit}</div>` : '';
    return `<div class="smart-node-input-thumbs">${items}${more}</div>`;
}

function promptNodeLayoutSize(node){
    return {
        width:Math.round(Math.max(160, Number(node?.w)===316&&Number(node?.h)===260?240:Number(node?.w) || 240)),
        height:Math.round(Math.max(120, Number(node?.w)===316&&Number(node?.h)===260?240:Number(node?.h) || 240))
    };
}

function imageLayout(images, scale=1, node=null){
    if(isSmartStudioNode(node)){
        const [w,h]=window.PixmaxCanvasAssets.sizes[node.type.slice(6)];
        const oldDefault=node.w===320&&node.h===320;
        return {cols:1,rows:1,width:oldDefault?w:Number(node.w)||w,height:oldDefault?h:Number(node.h)||h,thumb:96,single:true};
    }
    if(node?.type === 'smart-prompt') return {cols:1, rows:1, ...promptNodeLayoutSize(node), thumb:96, single:true};
    if(node?.type === 'smart-loop') return {cols:1, rows:1, width:Math.round(Number(node.w) || smartLoopWidth(node)), height:Math.round(Math.max(Number(node.h) || 0, smartLoopHeight(node))), thumb:96, single:true};
    const count = (images || []).length;
    const s = node?.type === 'smart-image' || !node?.type ? mediaNodeDefaultScale(node) : (Number.isFinite(scale) && scale > 0 ? scale : 1);
    if(count === 0){
        const explicitW = Number(node?.w);
        const explicitH = Number(node?.h);
        const generationKind = smartGenerationKind(node);
        const fallbackW = generationKind==='video'?300:generationKind ? MEDIA_NODE_DEFAULT_SIZE : EMPTY_UPLOAD_NODE_WIDTH;
        const fallbackH = generationKind === 'image' ? MEDIA_NODE_DEFAULT_SIZE : generationKind === 'video' ? MEDIA_NODE_VIDEO_HEIGHT : EMPTY_UPLOAD_NODE_HEIGHT;
        return {
            cols:1,
            rows:1,
            width:Math.round(Number.isFinite(explicitW) && explicitW > 24 ? explicitW : fallbackW),
            height:Math.round(Number.isFinite(explicitH) && explicitH > 24 ? explicitH : fallbackH),
            thumb:Math.round(96*s),
            single:true
        };
    }
    if(count === 1) return singleImageLayout(images[0], node, s);
    const thumb = Math.round(MEDIA_GROUP_THUMB_BASE * s);
    const cell = thumb + 8;
    const PAD = 32; // group-node has 16px padding on each side
    const grid = images.find(img => img?.grid?.type === 'grid-split')?.grid;
    const explicitW = Number(node?.w);
    const explicitH = Number(node?.h);
    if(grid){
        const cols = Math.max(1, Number(grid.cols || 1));
        const rows = Math.max(1, Number(grid.rows || 1));
        const visibleRows = Math.min(MEDIA_GROUP_MAX_VISIBLE_ROWS, rows);
        if(Number.isFinite(explicitW) && explicitW > 40 && Number.isFinite(explicitH) && explicitH > 40){
            const fittedThumb = Math.max(28, Math.floor(Math.min((explicitW - PAD - (cols - 1) * 8) / cols, (explicitH - PAD - (visibleRows - 1) * 8) / visibleRows)));
            return {cols, rows, visibleRows, width:Math.round(explicitW), height:visibleRows * (fittedThumb + 8) - 8 + PAD, thumb:fittedThumb};
        }
        return {cols, rows, visibleRows, width:Math.max(Math.round(226*s), cols * cell + PAD), height:visibleRows * cell - 8 + PAD, thumb};
    }
    const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(count))));
    const rows = Math.ceil(count / cols);
    const visibleRows = Math.min(MEDIA_GROUP_MAX_VISIBLE_ROWS, rows);
    if(Number.isFinite(explicitW) && explicitW > 40 && Number.isFinite(explicitH) && explicitH > 40){
        const fitted = groupImageGridLayout(count, explicitW, explicitH, thumb, PAD, 8);
        return {cols:fitted.cols, rows:fitted.rows, visibleRows:fitted.visibleRows, width:Math.round(explicitW), height:fitted.visibleRows * (fitted.thumb + 8) - 8 + PAD, thumb:fitted.thumb};
    }
    const width = Math.max(Math.round(226*s), cols * cell + PAD);
    const height = visibleRows * cell - 8 + PAD;
    return {cols, rows, visibleRows, width, height, thumb};
}

function smartLoopCount(node){
    return Math.max(1, Math.min(100, Number(node?.count || 1) || 1));
}

function smartLoopWidth(node){
    return 340;
}

function smartLoopHeight(node){
    let h = 168;
    if(node?.imageInput) h += 72;
    if(node?.showPrompt) {
        const promptCount = Math.max(1, smartLoopPromptFieldValues(node).length);
        h += 94 + promptCount * 58 + smartLoopUpstreamPromptPreviewHeight(node);
    }
    h += smartNodeInputThumbsHeight(smartLoopPreviewImages(node));
    return h;
}

function fitSmartLoopNode(node){
    if(!node || node.type !== 'smart-loop') return;
    node.w = smartLoopWidth(node);
    node.h = smartLoopHeight(node);
}

function withSmartComputation(...args){return smartWorkspaceView.withComputation(...args);}

function nodeRect(...args){return smartWorkspaceView.nodeRect(...args);}

function applyViewport(){
    world.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
    // world 被 transform:scale 缩放后，其内部带 backdrop-filter 的卡片（参数设置/合成卡等）
    // 会被部分浏览器（Chrome/Edge 等 Blink 内核）当作独立合成层先按 1x 栅格化、再整体缩放，
    // 缩小时位图被降采样 → 组件发虚。缩放态下关闭这些 backdrop-filter（底色本身已接近不透明，
    // 观感几乎无差），让卡片随矢量重新栅格化，保持清晰。
    world.classList.toggle('canvas-scaled', Math.abs(viewport.scale - 1) > 0.001);
    const pattern=document.getElementById('pixmaxGridPattern');
    if(pattern){const gap=20*viewport.scale;pattern.setAttribute('width',gap);pattern.setAttribute('height',gap);pattern.setAttribute('x',viewport.x%gap);pattern.setAttribute('y',viewport.y%gap);const dot=pattern.querySelector('circle');dot.setAttribute('r',.5*viewport.scale);dot.setAttribute('cx',.5*viewport.scale);dot.setAttribute('cy',.5*viewport.scale);}
    const zoomLabel=document.getElementById('pixmaxZoomLabel');if(zoomLabel)zoomLabel.textContent=Math.round(viewport.scale*100)+'%';
    syncPixmaxSaveStatus();
    positionPixmaxVideoToolbars();
    scheduleSmartMinimapRender(true);
    scheduleSmartViewportRefresh();
}

// 视野裁剪：判断节点是否在智能画布可见区域内
function isSmartNodeInViewport(node, margin=400){
    if(!shell) return true;
    const vw = shell.clientWidth;
    const vh = shell.clientHeight;
    if(!vw || !vh) return true;
    const vx = -viewport.x / viewport.scale;
    const vy = -viewport.y / viewport.scale;
    const vwWorld = vw / viewport.scale;
    const vhWorld = vh / viewport.scale;
    const m = margin / viewport.scale;
    const layout = imageLayout(node.images || [], nodeScale(node), node);
    const nx = Number(node.x || 0);
    const ny = Number(node.y || 0);
    const nw = Number(layout.width || 260);
    const nh = Number(layout.height || 200);
    return !(nx + nw < vx - m || nx > vx + vwWorld + m || ny + nh < vy - m || ny > vy + vhWorld + m);
}

function scheduleSmartViewportRefresh(...args){return smartWorkspaceView.scheduleViewport(...args);}

function canRecycleSmartMediaNode(node, el){
    if(!node || (node.type && node.type !== 'smart-image') || !(node.images || []).length) return false;
    if(node.running || node.queued || smartNodePendingCount(node) || isNodeSelected(node.id)) return false;
    if(dragState || resizeState || thumbDragState || portDragState || selectionState || smartCascadeAnyRunning()) return false;
    if(el?.contains(document.activeElement) || el?.querySelector('video,audio')) return false;
    if(smartImageEditor.isEditingNode(node.id)) return false;
    if(smartAudioPreview.isPreviewingNode(node.id)) return false;
    return true;
}

function restoreSmartNodeScroll(...args){return smartWorkspaceView.restoreScroll(...args);}

function renderSmartOffscreenPlaceholders(...args){return smartWorkspaceView.recycle(...args);}

function renderSmartNodeHtml(node){
    if(isSmartStudioNode(node)) return renderSmartStudioNode(node);
    const imgs = node.images || [];
    const scale = nodeScale(node);
    const layout = imageLayout(imgs, scale, node);
    const isPrompt = node.type === 'smart-prompt';
    const isLoop = node.type === 'smart-loop';
    const isImageNode = node.type === 'smart-image' || !node.type;
    const generationKind = smartGenerationKind(node);
    const generationTitle = generationKind === 'video' ? '视频生成节点' : '图像生成节点';
    const pendingCount = smartNodePendingCount(node);
    const recoveryOnly = Boolean(isImageNode && imgs.length === 0 && window.CanvasSession?.enabled && smartPendingTasks(node).length);
    const isQueued = Boolean(node.queued && imgs.length === 0 && !pendingCount);
    const isEmpty = isImageNode && imgs.length === 0 && !pendingCount && !isQueued && !recoveryOnly && !node.localDepth;
    const isHistory = isHistoryGroupNode(node);
    const isGroup = isImageNode && imgs.length > 1;
    const faceVerified = isImageNode && imgs.length > 0 && imgs.every(img => smartFaceAuthState(img).ready);
    const faceVerifying = isImageNode && !faceVerified && imgs.some(img => ['Queued','Uploading','Processing'].includes(smartFaceAuthState(img).status));
    const isPending = ((pendingCount || isQueued) && imgs.length === 0);
    const singleMediaKind = imgs.length === 1 ? mediaKindForItem(imgs[0]) : '';
    const singleMediaTitle = singleMediaKind === 'video' ? 'Video' : singleMediaKind === 'audio' ? 'Audio' : singleMediaKind === 'text' ? 'Text' : singleMediaKind === 'file' ? 'File' : 'Image';
    const title = node.localDepth ? '深度视频' : generationKind ? generationTitle : isPending ? escapeHtml('生成中') : (node.type === 'smart-prompt' ? 'Prompt' : node.type === 'smart-loop' ? 'Loop' : (imgs.length > 1 ? 'Group' : imgs.length ? singleMediaTitle : escapeHtml('上传节点')));
    const body = nodeBodyHtml(node, layout);
    const deleteBtn = isGroup ? '' : `<button class="mini-x node-delete" type="button" title="${escapeHtml('删除节点')}"><i data-lucide="trash-2"></i></button>`;
    const hint = node.localDepth ? '深度视频 · 本地生成' : isPending ? escapeHtml('正在生成…') : (imgs.length > 1 ? escapeHtml('多图会作为同一组参考图发送') : imgs.length ? escapeHtml('点击后在下方输入编辑需求') : escapeHtml('支持图片 / 视频 / 音频，也可直接文生图'));
    return `<div class="image-node ${isEmpty ? 'empty-node' : ''} ${generationKind ? 'generation-node' : ''} ${recoveryOnly ? 'task-recovery-node' : ''} ${isGroup ? 'group-node' : ''} ${isHistory ? 'history-group-node' : ''} ${isPrompt ? 'prompt-smart-node' : ''} ${isLoop ? 'loop-smart-node' : ''} ${faceVerified ? 'face-verified' : ''} ${faceVerifying ? 'face-verifying' : ''} ${isNodeSelected(node.id) ? 'selected' : ''} ${(dragState?.groupIds?.includes(node.id) || dragState?.id === node.id) ? 'dragging' : ''} ${node.running ? 'node-running' : ''} ${isPending ? 'node-pending' : ''}" data-id="${escapeHtml(node.id)}" style="left:${node.x || 0}px;top:${node.y || 0}px;width:${layout.width}px;height:${layout.height}px">
        ${!isPrompt && !isLoop ? pixmaxNodeCaption(node,singleMediaKind==='audio'?'audio':generationKind==='video'||singleMediaKind==='video'?'video':'image',node.localDepth?'视频生成节点-深度':generationKind?generationTitle:singleMediaKind==='video'?'视频节点':singleMediaKind==='audio'?'音频节点':'图像节点') : ''}
        ${isPrompt ? pixmaxNodeCaption(node,'text','文本生成节点') : ''}
        <div class="node-head"><div class="node-title">${title}</div><div class="node-actions">${deleteBtn}</div></div>
        ${!isEmpty && !isGroup ? `<div class="floating-node-actions"><button class="mini-x node-delete" type="button" title="${escapeHtml('删除节点')}"><i data-lucide="trash-2"></i></button></div>` : ''}
        ${smartNodeToolbarHtml(node)}
        ${runTimePillHtml(node)}
        <div class="node-body">${body}</div>
        ${recoveryOnly ? '' : `<div class="node-hint">${hint}</div>`}
        ${imgs.length || pendingCount || isQueued || recoveryOnly || isPrompt || isLoop ? '<div class="node-resize-handle" data-resize="1"></div>' : ''}
        ${pixmaxNodePorts()}
    </div>`;
}

function bindSmartNodeEvents(el, node){
    if(!el || !node) return;
    bindNodeEvents([el]);
}

function screenToWorld(event){
    const rect = shell.getBoundingClientRect();
    return {
        x:(event.clientX - rect.left - viewport.x) / viewport.scale,
        y:(event.clientY - rect.top - viewport.y) / viewport.scale
    };
}

function viewportCenter(){
    return {
        x:(shell.clientWidth / 2 - viewport.x) / viewport.scale,
        y:(shell.clientHeight / 2 - viewport.y) / viewport.scale
    };
}

// Owns minimap resources only; nodes, selection and viewport remain workspace state.
function createSmartMinimap(){
    let minimap = document.getElementById('minimap');
    let minimapContent = document.getElementById('minimapContent');
    let minimapViewport = document.getElementById('minimapViewport');
    let minimapState = null;
    let viewportOnlyPending = true;
    let frame = null, generation = 0, dragTarget = null;
    let bound = false, suspended = false, destroyed = false;

    function available(){ return !destroyed && !suspended && Boolean(canvas); }
    function dragging(){ return Boolean(dragTarget && dragTarget.id === canvas?.id && dragTarget.nodes === nodes && available()); }
    function cancelFrame(){
        if(frame !== null) cancelAnimationFrame(frame);
        frame = null;
        generation++;
    }
    function schedule(viewportOnly){
        if(!available()) return;
        if(!viewportOnly) viewportOnlyPending = false;
        if(frame !== null) return;
        const token = generation, canvasId = canvas.id;
        frame = requestAnimationFrame(() => {
            if(token !== generation) return;
            frame = null;
            if(!available() || canvas?.id !== canvasId) return;
            paint({viewportOnly:viewportOnlyPending});
        });
    }

    function paint({viewportOnly=false}={}){
        if(!available()) return;
        const reuseLayout = viewportOnly && viewportOnlyPending && minimapState
            && minimapState.sourceNodes === nodes && minimapState.canvas === canvas
            && minimapState.rects.length === nodes.length;
        cancelFrame();
        viewportOnlyPending = true;
        if(!minimapContent || !minimapViewport) return;
        const width = minimapContent.clientWidth || 170;
        const height = minimapContent.clientHeight || 108;
        const viewW = shell.clientWidth / viewport.scale;
        const viewH = shell.clientHeight / viewport.scale;
        const viewX = -viewport.x / viewport.scale;
        const viewY = -viewport.y / viewport.scale;
        const nodeRects = reuseLayout ? minimapState.rects : withSmartComputation(() => nodes.map(node => ({id:node.id, ...nodeRect(node)})));
        const rects = [...nodeRects, {x:viewX, y:viewY, width:viewW, height:viewH}];
        const minX = Math.min(...rects.map(r => r.x), -200);
        const minY = Math.min(...rects.map(r => r.y), -200);
        const maxX = Math.max(...rects.map(r => r.x + r.width), viewX + viewW + 200);
        const maxY = Math.max(...rects.map(r => r.y + r.height), viewY + viewH + 200);
        const scale = Math.min(width / Math.max(1, maxX - minX), height / Math.max(1, maxY - minY));
        const offsetX = (width - (maxX - minX) * scale) / 2;
        const offsetY = (height - (maxY - minY) * scale) / 2;
        const previous = minimapState;
        minimapState = {minX, minY, scale, offsetX, offsetY, width, height, rects:nodeRects, sourceNodes:nodes, canvas};
        const project = r => ({
            left:offsetX + (r.x - minX) * scale,
            top:offsetY + (r.y - minY) * scale,
            width:Math.max(4, r.width * scale),
            height:Math.max(4, r.height * scale)
        });
        const paint = (el, r) => {
            const p = project(r);
            el.style.left = `${p.left}px`; el.style.top = `${p.top}px`;
            el.style.width = `${p.width}px`; el.style.height = `${p.height}px`;
        };
        const sameProjection = reuseLayout && ['minX','minY','scale','offsetX','offsetY','width','height']
            .every(key => previous[key] === minimapState[key]);
        if(!sameProjection){
            const existing = new Map([...minimapContent.querySelectorAll('.minimap-node')].map(el => [el.dataset.nodeId, el]));
            nodeRects.forEach(r => {
                let el = existing.get(r.id);
                if(!el){
                    el = document.createElement('div');
                    el.className = 'minimap-node'; el.dataset.nodeId = r.id;
                    minimapContent.appendChild(el);
                }
                paint(el, r);
                existing.delete(r.id);
            });
            existing.forEach(el => el.remove());
        }
        const view = project({x:viewX, y:viewY, width:viewW, height:viewH});
        minimapViewport.style.left = `${view.left}px`; minimapViewport.style.top = `${view.top}px`;
        minimapViewport.style.width = `${view.width}px`; minimapViewport.style.height = `${view.height}px`;
    }

    function eventToWorld(event){
        if(!available() || !minimapContent) return null;
        if(!minimapState) paint();
        const state = minimapState;
        if(!state) return viewportCenter();
        const rect = minimapContent.getBoundingClientRect();
        const mx = event.clientX - rect.left;
        const my = event.clientY - rect.top;
        return {
            x:state.minX + (mx - state.offsetX) / Math.max(0.0001, state.scale),
            y:state.minY + (my - state.offsetY) / Math.max(0.0001, state.scale)
        };
    }

    function stopDrag(){
        dragTarget = null;
    }
    function move(event){
        if(!dragging()){ stopDrag(); return false; }
        event.preventDefault();
        const point = eventToWorld(event);
        if(point) centerViewportOnWorldPoint(point);
        return true;
    }
    function finishDrag(){
        const active = dragging();
        stopDrag();
        return active;
    }
    function startDrag(event){
        if(!available() || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        stopDrag();
        dragTarget = {id:canvas.id, nodes};
        const point = eventToWorld(event);
        if(point) centerViewportOnWorldPoint(point);
    }
    function reset(){
        cancelFrame();
        stopDrag();
        minimapState = null;
        viewportOnlyPending = true;
    }
    function onPageHide(event){
        if(!event.persisted){ destroy(); return; }
        suspended = true;
        reset();
    }
    function onPageShow(event){
        if(!event.persisted || destroyed) return;
        suspended = false;
        schedule(false);
    }
    function bind(){
        if(bound || destroyed) return;
        bound = true;
        minimap?.addEventListener('mousedown', startDrag);
        window.addEventListener('pagehide', onPageHide);
        window.addEventListener('pageshow', onPageShow);
    }
    function destroy(){
        if(destroyed) return;
        reset();
        destroyed = true;
        minimap?.removeEventListener('mousedown', startDrag);
        window.removeEventListener('pagehide', onPageHide);
        window.removeEventListener('pageshow', onPageShow);
        minimap = minimapContent = minimapViewport = null;
    }
    return Object.freeze({
        layoutChanged:() => schedule(false), viewportChanged:() => schedule(true),
        render:paint, eventToWorld:eventToWorld,
        get dragging(){ return dragging(); }, move, endDrag:finishDrag, reset, bind, destroy
    });
}

function scheduleSmartMinimapRender(viewportOnly=false){
    if(viewportOnly) smartMinimap.viewportChanged();
    else smartMinimap.layoutChanged();
}

function renderMinimap(options={}){
    smartMinimap.render(options);
}

function minimapEventToWorld(event){
    return smartMinimap.eventToWorld(event);
}

function centerViewportOnWorldPoint(point){
    viewport.x = shell.clientWidth / 2 - point.x * viewport.scale;
    viewport.y = shell.clientHeight / 2 - point.y * viewport.scale;
    applyViewport();
    scheduleSave();
}

function fitAllNodesViewport(){
    if(!nodes.length){
        viewport.scale = 0.45;
        viewport.x = shell.clientWidth / 2;
        viewport.y = shell.clientHeight / 2;
        applyViewport();
        scheduleSave();
        return;
    }
    const rects = nodes.map(nodeRect);
    const minX = Math.min(...rects.map(r => r.x));
    const minY = Math.min(...rects.map(r => r.y));
    const maxX = Math.max(...rects.map(r => r.x + r.width));
    const maxY = Math.max(...rects.map(r => r.y + r.height));
    const pad = 160;
    const width = Math.max(1, maxX - minX + pad * 2);
    const height = Math.max(1, maxY - minY + pad * 2);
    const nextScale = Math.max(0.06, Math.min(0.82, (shell.clientWidth - 80) / width, (shell.clientHeight - 80) / height));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    viewport.scale = nextScale;
    viewport.x = shell.clientWidth / 2 - cx * viewport.scale;
    viewport.y = shell.clientHeight / 2 - cy * viewport.scale;
    applyViewport();
    scheduleSave();
}

function enterZoomPreview(){
    if(zoomPreviewState) return;
    zoomPreviewState = {...viewport};
    shell.classList.add('zoom-preview');
    closeCreateMenu();
    fitAllNodesViewport();
}

function exitZoomPreview(point=null){
    if(!zoomPreviewState) return false;
    const prev = zoomPreviewState;
    zoomPreviewState = null;
    shell.classList.remove('zoom-preview');
    viewport.scale = prev.scale;
    if(point){
        viewport.x = shell.clientWidth / 2 - point.x * viewport.scale;
        viewport.y = shell.clientHeight / 2 - point.y * viewport.scale;
    } else {
        viewport.x = prev.x;
        viewport.y = prev.y;
    }
    applyViewport();
    scheduleSave();
    return true;
}

function exitZoomPreviewToNode(nodeId){
    if(!zoomPreviewState) return false;
    const node = nodes.find(n => n.id === nodeId);
    if(!node) return exitZoomPreview();
    const prev = zoomPreviewState;
    const rect = nodeRect(node);
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const fitScale = Math.min(
        1.15,
        (shell.clientWidth - 160) / Math.max(1, rect.width),
        (shell.clientHeight - 160) / Math.max(1, rect.height)
    );
    const readableScale = Math.min(1.15, Math.max(0.72, fitScale));
    zoomPreviewState = null;
    shell.classList.remove('zoom-preview');
    viewport.scale = Math.max(safeScale(prev.scale), readableScale);
    viewport.x = shell.clientWidth / 2 - cx * viewport.scale;
    viewport.y = shell.clientHeight / 2 - cy * viewport.scale;
    applyViewport();
    scheduleSave();
    return true;
}

function toggleZoomPreview(){
    if(zoomPreviewState) exitZoomPreview();
    else enterZoomPreview();
}

function renderVideoProviderControl(providers){
    const current = (providers || []).find(p => p.id === settings.videoProvider) || videoProviderById(settings.videoProvider);
    return `<div class="smart-control provider-control">
        <button class="smart-pill" type="button"><i data-lucide="plug-zap"></i><span class="sub">${escapeHtml(current?.name || settings.videoProvider || '平台')}</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml('视频平台')}</div>
            <div class="model-list">
                ${providers.map(p => `<button type="button" class="direct-option ${p.id === settings.videoProvider ? 'active' : ''}" data-smart-param="videoProvider" data-smart-value="${escapeHtml(p.id)}"><span>${escapeHtml(p.name || p.id)}</span></button>`).join('') || `<div class="muted-note">${escapeHtml('暂无视频平台')}</div>`}
            </div>
        </div>
    </div>`;
}

function renderVideoModelControl(models){
    return `<div class="smart-control model-control">
        <button class="smart-pill" type="button"><i data-lucide="film"></i><span class="sub">${escapeHtml(settings.videoModel || '模型')}</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml('视频模型')}</div>
            <div class="model-list">
                ${models.map(m => `<button type="button" class="direct-option ${m === settings.videoModel ? 'active' : ''}" data-smart-param="videoModel" data-smart-value="${escapeHtml(m)}"><span>${escapeHtml(m)}</span></button>`).join('') || `<div class="muted-note">${escapeHtml('暂无视频模型')}</div>`}
            </div>
        </div>
    </div>`;
}

function renderSeedance25TaskModeControl(){
    if(!isSeedance25VideoModel()) return '';
    const options = [['auto','自动判断'], ['edit','视频编辑'], ['extend_backward','向后延长'], ['extend_forward','向前延长']];
    const value = settings.videoTaskMode || 'auto';
    return `<div class="smart-control model-control">
        <button class="smart-pill" type="button"><i data-lucide="route"></i><span class="sub">${escapeHtml(Object.fromEntries(options)[value] || '自动判断')}</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">任务类型</div>
            <div class="model-list">${options.map(([v,l]) => `<button type="button" class="direct-option ${v === value ? 'active' : ''}" data-smart-param="videoTaskMode" data-smart-value="${v}"><span>${l}</span></button>`).join('')}</div>
        </div>
    </div>`;
}

function renderVideoDurationControl(){
    const seedance25 = isSeedance25VideoModel();
    const range = smartVideoDurationRange();
    const {min,max} = range;
    const v = window.VideoDurationPolicy.clamp(settings.videoDuration,range);
    const quick = window.VideoDurationPolicy.choices(range,seedance25 ? [-1,4,5,6,8,10,12,15,20,30] : [3,4,5,6,8,10,12,15]);
    return `<div class="smart-control duration-control" title="${escapeHtml('时长（秒）')}">
        <button class="smart-pill" type="button"><i data-lucide="timer"></i><span>${v === -1 ? '自动' : `${v}s`}</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml('时长')} · ${min}–${max} 秒</div>
            <div class="duration-grid">
                ${quick.map(n => `<button type="button" class="duration-option ${n === v ? 'active' : ''}" data-smart-param="videoDuration" data-smart-value="${n}">${n === -1 ? '自动' : `${n}s`}</button>`).join('')}
            </div>
            <label class="duration-custom">
                <span>${escapeHtml('自定义')}</span>
                <input type="number" min="${range.auto ? -1 : min}" max="${max}" step="1" data-param="videoDuration" value="${v}">
            </label>
        </div>
    </div>`;
}

function renderVideoAspectControl(){
    let options = [
        ['16:9','16:9'], ['9:16','9:16'], ['1:1','1:1'], ['4:3','4:3'], ['3:4','3:4'],
        ['21:9','21:9'], ['9:21','9:21'], ['keep_ratio', '原图比例'], ['adaptive', '自适应']
    ];
    if(isSeedance25VideoModel()) options = options.filter(([v]) => !['9:21','keep_ratio'].includes(v));
    const value = settings.videoAspect || '16:9';
    const labelMap = Object.fromEntries(options);
    return `<div class="smart-control aspect-control">
        <button class="smart-pill" type="button"><i data-lucide="scan"></i><span>${escapeHtml(labelMap[value] || value)}</span></button>
        <div class="smart-popover">
            <div class="smart-popover-title">${escapeHtml('画面比例')}</div>
            <div class="ratio-grid">
                ${options.map(([v,l]) => `<button type="button" class="ratio-option ${v === value ? 'active' : ''}" data-smart-param="videoAspect" data-smart-value="${escapeHtml(v)}"><span class="ratio-icon ${videoAspectIconClass(v)}"></span><span>${escapeHtml(l)}</span></button>`).join('')}
            </div>
        </div>
    </div>`;
}

function renderVideoResolutionControl(){
    const options = normalizeSmartVideoResolution().map(value => [value, value ? value.toUpperCase() : '自动']);
    const value = settings.videoResolution || '';
    const labelMap = Object.fromEntries(options);
    return `<div class="smart-control resolution-control">
        <button class="smart-pill" type="button" ${options.length ? '' : 'disabled'}><i data-lucide="monitor"></i><span>${escapeHtml(options.length ? (labelMap[value] || value || '自动') : '暂无可用规格')}</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml('视频分辨率')}</div>
            <div class="model-list">
                ${options.map(([v,l]) => `<button type="button" class="direct-option ${v === value ? 'active' : ''}" data-smart-param="videoResolution" data-smart-value="${escapeHtml(v)}"><span>${escapeHtml(l)}</span></button>`).join('')}
            </div>
        </div>
    </div>`;
}

function renderVideoToggleControl(key, label){
    const on = !!settings[key];
    return `<button type="button" class="composer-option ${on ? 'active' : ''}" role="switch" aria-checked="${on}" data-toggle-param="${escapeHtml(key)}"><span>${escapeHtml(label)}</span><span class="composer-option-switch" aria-hidden="true"></span></button>`;
}

function renderVideoAdvancedControl(includeFrameRoles=false){
    const options=[
        ['videoEnhancePrompt','提示词增强'],['videoEnableUpsample','高清'],
        ['videoGenerateAudio','生成音频'],['videoCameraFixed','镜头固定'],
        ['videoWatermark','水印'],['videoMultimodal','智能多参'],
        ...(includeFrameRoles ? [['videoUseFrameRoles','首尾帧']] : [])
    ];
    const enabled=options.filter(([key])=>settings[key]).length + Number(!!settings.videoTrustedAsset);
    return `<details class="smart-control composer-advanced">
        <summary><i data-lucide="sliders-horizontal"></i><span>更多设置</span>${enabled ? `<span class="composer-option-count">${enabled}</span>` : ''}</summary>
        <div class="composer-advanced-panel">
            <div class="composer-advanced-heading">视频设置<span>按需调整生成效果</span></div>
            ${options.map(([key,label])=>renderVideoToggleControl(key,label)).join('')}
            <div class="composer-trusted-options">${renderVideoTrustedAssetControl()}</div>
        </div>
    </details>`;
}

function renderTempShUploadControl(){
    return `<button type="button" class="smart-pill cloud-upload-pill" data-temp-sh-upload-video title="上传当前输入图片或视频到云端直链"><i data-lucide="upload-cloud"></i><span>上传云端</span></button>`;
}

function renderManualVideoUrlControl(){
    return `<button type="button" class="smart-pill manual-video-url-pill" data-manual-video-url title="手动输入媒体 URL"><i data-lucide="link"></i><span>输入网址</span></button>`;
}

// 可信素材模式：打开后可选择素材来源——素材库认证链接 / 自行上传云端 / 自行输入网址。
function renderVideoTrustedAssetControl(){
    const on = !!settings.videoTrustedAsset;
    let html = renderVideoToggleControl('videoTrustedAsset', '可信素材模式');
    if(!on) return html;
    const src = ['library','cloud','manual'].includes(settings.videoTrustedSource) ? settings.videoTrustedSource : 'library';
    html += `<div class="trusted-source-row">
        <button type="button" class="smart-pill trusted-src-pill ${src === 'library' ? 'active' : ''}" data-trusted-source="library" title="使用素材库中已注册的认证素材链接（asset://）"><i data-lucide="library"></i><span>素材库链接</span></button>
        <button type="button" class="smart-pill trusted-src-pill ${src === 'cloud' ? 'active' : ''}" data-trusted-source="cloud" title="把当前输入图片/视频上传到云端直链"><i data-lucide="upload-cloud"></i><span>上传云端</span></button>
        <button type="button" class="smart-pill trusted-src-pill ${src === 'manual' ? 'active' : ''}" data-trusted-source="manual" title="手动输入媒体 URL 或 asset:// 地址"><i data-lucide="link"></i><span>输入网址</span></button>
    </div>`;
    return html;
}

function optionHtml(value, label, selected){
    return `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escapeHtml(label ?? value)}</option>`;
}

// Selection may normalize visible controls; it must not rewrite a task-bound node.
function updateProviderModels(){ renderDynamicParams(false); }

function renderDynamicParams(persist=true){
    if(!dynamicParams) return;
    const advancedOpen=!!dynamicParams.querySelector('.composer-advanced')?.open;
    settings.engine = ['api','volcengine','modelscope','comfy'].includes(settings.engine) ? settings.engine : 'api';
    settings.apiKind = settings.apiKind === 'video' ? 'video' : 'image';
    settings = enforceSmartGenerationKind(selectedNode(), settings);
    clearVolcengineSelectionOutsideVolcengine(settings);
    engineSelect.value = settings.engine;
    syncApiKindToggleVisibility();
    if(settings.engine === 'api'){
        if(settings.apiKind === 'video') renderApiVideoParams();
        else renderApiParams();
    }
    else if(settings.engine === 'volcengine'){
        if(settings.apiKind === 'video') renderVolcengineVideoParams();
        else renderVolcengineParams();
    }
    else if(settings.engine === 'modelscope') renderMsParams();
    else renderComfyParams();
    const advanced=dynamicParams.querySelector('.composer-advanced');
    if(advanced) advanced.open=advancedOpen;
    bindDynamicParams();
    updatePromptPlaceholder();
    if(persist) persistActiveSmartSettings();
    if(composer?.classList.contains('open')) renderInputThumbsRow(selectedNode());
    if(window.lucide) lucide.createIcons();
}

function renderApiParams(){
    const providers = imageProviders();
    if(!settings.provider_id || !providers.some(p => p.id === settings.provider_id)) settings.provider_id = providers[0]?.id || '';
    const models = providerImageModels(settings.provider_id);
    if(!settings.model || !models.includes(settings.model)) settings.model = models[0] || '';
    normalizeApiSizeSettings('');
    const outpaintLocked = settings.outpaintResolutionLocked === true;
    dynamicParams.innerHTML = `
        ${renderProviderControl(providers)}
        ${renderModelControl(models)}
        ${renderResolutionControl('')}
        ${outpaintLocked ? '' : renderRatioControl('', true)}
        ${outpaintLocked ? '' : renderInlineCustomSizeFields('')}
        ${outpaintLocked ? '' : renderInlineCustomRatioFields('')}
        ${renderQualityControl()}
        ${renderCountVisualControl()}
    `;
}

function renderApiVideoParams(){
    const providers = videoApiProviders();
    if(!settings.videoProvider || !providers.some(p => p.id === settings.videoProvider)) settings.videoProvider = providers[0]?.id || '';
    const models = providerVideoModels(settings.videoProvider);
    if(!settings.videoModel || !models.includes(settings.videoModel)) settings.videoModel = models[0] || '';
    dynamicParams.innerHTML = `
        ${renderVideoProviderControl(providers)}
        ${renderVideoModelControl(models)}
        ${renderSeedance25TaskModeControl()}
        ${renderVideoResolutionControl()}
        ${renderVideoAspectControl()}
        ${renderVideoDurationControl()}
        ${renderVideoAdvancedControl(true)}
    `;
}

function renderVolcengineParams(){
    const provider = volcengineProvider();
    const providers = [provider];
    const models = providerImageModels('volcengine');
    settings.provider_id = 'volcengine';
    if(!settings.model || !models.includes(settings.model)) settings.model = models[0] || '';
    normalizeApiSizeSettings('');
    const outpaintLocked = settings.outpaintResolutionLocked === true;
    dynamicParams.innerHTML = `
        ${renderProviderControl(providers)}
        ${renderModelControl(models)}
        ${renderResolutionControl('')}
        ${outpaintLocked ? '' : renderRatioControl('', true)}
        ${outpaintLocked ? '' : renderInlineCustomSizeFields('')}
        ${outpaintLocked ? '' : renderInlineCustomRatioFields('')}
        ${renderQualityControl()}
        ${renderCountVisualControl()}
    `;
}

function renderVolcengineVideoParams(){
    const provider = volcengineProvider();
    const providers = [provider];
    const models = volcengineVideoModels();
    settings.videoProvider = 'volcengine';
    settings.videoUseFrameRoles = false;
    if(!settings.videoModel || !models.includes(settings.videoModel)) settings.videoModel = models[0] || '';
    dynamicParams.innerHTML = `
        ${renderVideoProviderControl(providers)}
        ${renderVideoModelControl(models)}
        ${renderSeedance25TaskModeControl()}
        ${renderVideoResolutionControl()}
        ${renderVideoAspectControl()}
        ${renderVideoDurationControl()}
        ${renderVideoAdvancedControl()}
    `;
}

function renderMsParams(){
    dynamicParams.textContent = "此功能已移除，历史内容保留。请新建通用 API 节点并明确选择供应商。";
}

function renderComfyParams(){
    dynamicParams.textContent = "此功能已移除，历史内容保留。请新建通用 API 节点并明确选择供应商。";
}

function renderUpscalePill(paramKey, current){
    const opts = [2048, 4096];
    const labels = {2048:'2X / 2048', 4096:'4X / 4096'};
    return `<div class="smart-control upscale-control">
        <button class="smart-pill" type="button"><i data-lucide="maximize-2"></i><span>${escapeHtml(labels[current] || `${current}px`)}</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml('超分目标')}</div>
            <div class="model-list">
                ${opts.map(v => `<button type="button" class="direct-option ${v === current ? 'active' : ''}" data-smart-param="${escapeHtml(paramKey)}" data-smart-value="${v}"><span>${escapeHtml(labels[v])}</span></button>`).join('')}
            </div>
        </div>
    </div>`;
}

function renderComfyWorkflowControl(){
    if(!comfyWorkflows.length) return `<div class="muted-note">${escapeHtml('暂无 ComfyUI 工作流')}</div>`;
    const current = comfyWorkflows.find(w => w.name === settings.comfyWorkflow) || comfyWorkflows[0];
    const label = current?.title || (current?.name || '').replace('.json','') || '工作流';
    return `<div class="smart-control workflow-control">
        <button class="smart-pill" type="button"><i data-lucide="layers"></i><span class="sub">${escapeHtml(label)}</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml('工作流')}</div>
            <div class="model-list">
                ${comfyWorkflows.map(w => `<button type="button" class="direct-option ${w.name === settings.comfyWorkflow ? 'active' : ''}" data-smart-param="comfyWorkflow" data-smart-value="${escapeHtml(w.name)}"><span>${escapeHtml(w.title || w.name.replace('.json',''))}</span></button>`).join('')}
            </div>
        </div>
    </div>`;
}

function renderSizeControls(prefix='', includeSource=false){
    const resolutions = normalizeSmartImageResolution(prefix);
    const ratioKey = prefix ? `${prefix}Ratio` : 'ratio';
    const resKey = prefix ? `${prefix}Resolution` : 'resolution';
    const ratios = [
        ['square','1:1'], ['portrait','2:3'], ['landscape','3:2'], ['portrait43','3:4'], ['landscape43','4:3'], ['story','9:16'], ['wide','16:9'], ['ultrawide','21:9'], ['ultratall','9:21'],
        ...(includeSource ? [['source', '适配比例']] : []),
        ['custom', '自定义']
    ];
    return `<select data-param="${resKey}">
            ${resolutions.map(v => optionHtml(v, v === 'custom' ? ('自定义') : v.toUpperCase(), settings[resKey] || '1k')).join('')}
        </select>
        <select data-param="${ratioKey}" ${settings[resKey] === 'custom' ? 'disabled' : ''}>
            ${ratios.map(([v,l]) => `<option value="${escapeHtml(v)}" ${v === (settings[ratioKey] || 'square') ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}
        </select>`;
}

function ratioLabel(prefix=''){
    const ratioKey = prefix ? `${prefix}Ratio` : 'ratio';
    const customKey = prefix ? `${prefix}CustomRatio` : 'customRatio';
    const sourceLabel = sourceImageRatioLabel(prefix) || '图片比例';
    const map = {square:'1:1', portrait:'2:3', landscape:'3:2', portrait43:'3:4', landscape43:'4:3', story:'9:16', wide:'16:9', ultrawide:'21:9', ultratall:'9:21', source:sourceLabel, custom:settings[customKey] || '自定义'};
    return map[settings[ratioKey] || 'square'] || '1:1';
}

function applySourceRatioToSettings(prefix=''){
    const ratioKey = prefix ? `${prefix}Ratio` : 'ratio';
    if(settings[ratioKey] !== 'source') return;
    const ratio = reducedRatioForImage(sourceRatioImageForNode(activeComposerNode() || selectedNode()));
    if(!ratio) return;
    const customKey = prefix ? `${prefix}CustomRatio` : 'customRatio';
    const wKey = prefix ? `${prefix}CustomRatioWidth` : 'customRatioWidth';
    const hKey = prefix ? `${prefix}CustomRatioHeight` : 'customRatioHeight';
    settings[wKey] = ratio.w;
    settings[hKey] = ratio.h;
    settings[customKey] = `${ratio.w}:${ratio.h}`;
}

function resolutionLabel(prefix=''){
    const resKey = prefix ? `${prefix}Resolution` : 'resolution';
    const sizeKey = prefix ? `${prefix}CustomSize` : 'customSize';
    const value = settings[resKey] || '1k';
    return value === 'custom' ? (settings[sizeKey] || '自定义') : value.toUpperCase();
}

function ratioIconClass(value){
    if(value === 'portrait') return 'r-portrait';
    if(value === 'portrait43') return 'r-portrait43';
    if(value === 'landscape') return 'r-landscape';
    if(value === 'landscape43') return 'r-landscape43';
    if(value === 'wide' || value === 'ultrawide') return 'r-wide';
    if(value === 'story' || value === 'ultratall') return 'r-story';
    if(value === 'source') return 'r-source';
    if(value === 'custom') return 'r-custom';
    return '';
}

function videoAspectIconClass(value){
    if(value === '16:9' || value === '21:9') return 'r-wide';
    if(value === '9:16' || value === '9:21') return 'r-story';
    if(value === '4:3') return 'r-landscape43';
    if(value === '3:4') return 'r-portrait43';
    if(value === 'keep_ratio' || value === 'adaptive') return 'r-source';
    return '';
}

function renderProviderControl(providers){
    const current = (providers || []).find(p => p.id === settings.provider_id) || apiProviderById(settings.provider_id);
    return `<div class="smart-control provider-control">
        <button class="smart-pill" type="button"><i data-lucide="plug-zap"></i><span class="sub">${escapeHtml(current?.name || settings.provider_id || '平台')}</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml('API 平台')}</div>
            <div class="model-list">
                ${providers.map(p => `<button type="button" class="direct-option ${p.id === settings.provider_id ? 'active' : ''}" data-smart-param="provider_id" data-smart-value="${escapeHtml(p.id)}"><span>${escapeHtml(p.name || p.id)}</span></button>`).join('') || `<div class="muted-note">${escapeHtml('暂无 API 平台')}</div>`}
            </div>
        </div>
    </div>`;
}

function renderModelControl(models){
    return `<div class="smart-control model-control">
        <button class="smart-pill" type="button"><i data-lucide="sparkles"></i><span class="sub">${escapeHtml(settings.model || '模型')}</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml('生图模型')}</div>
            <div class="model-list">
                ${models.map(m => `<button type="button" class="direct-option ${m === settings.model ? 'active' : ''}" data-smart-param="model" data-smart-value="${escapeHtml(m)}"><span>${escapeHtml(m)}</span></button>`).join('') || `<div class="muted-note">${escapeHtml('暂无生图模型')}</div>`}
            </div>
        </div>
    </div>`;
}

function msModelLabel(key){
    if(key === 'custom') return '自定义';
    return MS_GEN_MODELS[key]?.label || key;
}

function renderMsFunctionControl(){
    return `<div class="smart-control provider-control">
        <button class="smart-pill" type="button"><i data-lucide="sparkles"></i><span class="sub">${escapeHtml(msModelLabel(settings.msgenModel) || 'Modelscope')}</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml('Modelscope 生成功能')}</div>
            <div class="model-list">
                ${Object.entries(MS_GEN_MODELS).map(([key]) => `<button type="button" class="direct-option ${key === settings.msgenModel ? 'active' : ''}" data-smart-param="msgenModel" data-smart-value="${escapeHtml(key)}"><span>${escapeHtml(msModelLabel(key))}</span></button>`).join('')}
            </div>
        </div>
    </div>`;
}

function renderMsCustomModelPill(){
    if(settings.msgenModel !== 'custom') return '';
    const models = modelscopeImageModels();
    const label = settings.msCustomModel || '自定义模型';
    return `<div class="smart-control model-control">
        <button class="smart-pill" type="button"><i data-lucide="boxes"></i><span class="sub">${escapeHtml(label)}</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml('自定义 Modelscope 模型')}</div>
            <div class="model-list">
                ${models.map(m => `<button type="button" class="direct-option ${m === settings.msCustomModel ? 'active' : ''}" data-smart-param="msCustomModel" data-smart-value="${escapeHtml(m)}"><span>${escapeHtml(m)}</span></button>`).join('') || `<div class="muted-note">${escapeHtml('暂无 Modelscope 模型')}</div>`}
            </div>
        </div>
    </div>`;
}

function renderRatioControl(prefix='', includeSource=false){
    const ratioKey = prefix ? `${prefix}Ratio` : 'ratio';
    const resKey = prefix ? `${prefix}Resolution` : 'resolution';
    const ratios = [
        ['square','1:1'], ['portrait','2:3'], ['landscape','3:2'], ['portrait43','3:4'], ['landscape43','4:3'],
        ['story','9:16'], ['wide','16:9'], ['ultrawide','21:9'], ['ultratall','9:21'],
        ...(includeSource ? [['source', '图片比例']] : []),
        ['custom', '自定义']
    ];
    return `<div class="smart-control ratio-control">
        <button class="smart-pill" type="button"><i data-lucide="scan"></i><span>${escapeHtml(ratioLabel(prefix))}</span></button>
        <div class="smart-popover">
            <div class="smart-popover-title">${escapeHtml('比例')}</div>
            <div class="ratio-grid">
                ${ratios.map(([value, label]) => `<button type="button" class="ratio-option ${value === (settings[ratioKey] || 'square') ? 'active' : ''}" data-smart-param="${ratioKey}" data-smart-value="${escapeHtml(value)}"><span class="ratio-icon ${ratioIconClass(value)}"></span><span>${escapeHtml(label)}</span></button>`).join('')}
            </div>
        </div>
    </div>`;
}

function renderResolutionControl(prefix=''){
    const resKey = prefix ? `${prefix}Resolution` : 'resolution';
    const resolutions = normalizeSmartImageResolution(prefix);
    const outpaint = !prefix && settings.outpaintResolutionLocked === true;
    const error = outpaint ? smartOutpaintResolutionError() : '';
    return `<div class="smart-control resolution-control">
        <button class="smart-pill" type="button" ${resolutions.length ? '' : 'disabled'}><i data-lucide="monitor"></i><span>${escapeHtml(outpaint || resolutions.length ? resolutionLabel(prefix) : '暂无可用规格')}</span></button>
        ${error ? `<div class="smart-ref-error" role="status" style="max-width:240px;white-space:normal">${escapeHtml(error)}</div>` : ''}
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml('分辨率')}</div>
            <div class="seg-row">
                ${resolutions.map(value => `<button type="button" class="${value === (settings[resKey] || '1k') ? 'active' : ''}" data-smart-param="${resKey}" data-smart-value="${value}">${value === 'custom' ? escapeHtml('自定义') : value.toUpperCase()}</button>`).join('')}
            </div>
        </div>
    </div>`;
}

function renderInlineCustomRatioFields(prefix=''){
    const ratioKey = prefix ? `${prefix}Ratio` : 'ratio';
    if(settings[ratioKey] === 'source') return '';
    if(settings[ratioKey] !== 'custom') return '';
    const wKey = prefix ? `${prefix}CustomRatioWidth` : 'customRatioWidth';
    const hKey = prefix ? `${prefix}CustomRatioHeight` : 'customRatioHeight';
    return `<div class="inline-fields">
        <span class="inline-label">${escapeHtml('比例')}</span>
        <input type="number" data-param="${wKey}" value="${escapeHtml(settings[wKey] || '')}" placeholder="W">
        <span class="inline-divider">:</span>
        <input type="number" data-param="${hKey}" value="${escapeHtml(settings[hKey] || '')}" placeholder="H">
    </div>`;
}

function renderInlineCustomSizeFields(prefix=''){
    const resKey = prefix ? `${prefix}Resolution` : 'resolution';
    if(settings[resKey] !== 'custom') return '';
    const wKey = prefix ? `${prefix}CustomWidth` : 'customWidth';
    const hKey = prefix ? `${prefix}CustomHeight` : 'customHeight';
    return `<div class="inline-fields">
        <span class="inline-label">${escapeHtml('尺寸')}</span>
        <input type="number" data-param="${wKey}" value="${escapeHtml(settings[wKey] || '')}" placeholder="${escapeHtml('宽')}">
        <span class="inline-divider">×</span>
        <input type="number" data-param="${hKey}" value="${escapeHtml(settings[hKey] || '')}" placeholder="${escapeHtml('高')}">
    </div>`;
}

function renderQualityControl(){
    const value = settings.quality || 'auto';
    const labels = {auto:'自动', low:'低', medium:'中', high:'高'};
    return `<div class="smart-control quality-control">
        <button class="smart-pill" type="button"><i data-lucide="sliders-horizontal"></i><span>${escapeHtml(labels[value] || value)}</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml('质量')}</div>
            <div class="seg-row">
                ${Object.entries(labels).map(([k, l]) => `<button type="button" class="${k === value ? 'active' : ''}" data-smart-param="quality" data-smart-value="${escapeHtml(k)}">${escapeHtml(l)}</button>`).join('')}
            </div>
        </div>
    </div>`;
}

function renderCountVisualControl(){
    const value = Number(settings.count || 1);
    return `<div class="smart-control count-control">
        <button class="smart-pill" type="button"><i data-lucide="copy"></i><span>${value}${'张' ? ' ' + escapeHtml('张') : ''}</span></button>
        <div class="smart-popover compact-popover" style="min-width:170px">
            <div class="smart-popover-title">${escapeHtml('生成数量')}</div>
            <div class="count-grid">
                ${[1,2,3,4,5,6,7,8].map(n => `<button type="button" class="count-cell ${n === value ? 'active' : ''}" data-smart-param="count" data-smart-value="${n}">${n}</button>`).join('')}
            </div>
        </div>
    </div>`;
}

function renderCountControl(){
    return `<select data-param="count">${[1,2,3,4,5,6,7,8].map(n => optionHtml(n, `${n} 张`, Number(settings.count || 1))).join('')}</select>`;
}

function renderCustomRatioControls(prefix=''){
    const ratioKey = prefix ? `${prefix}Ratio` : 'ratio';
    if(settings[ratioKey] !== 'custom' && settings[ratioKey] !== 'source') return '';
    const wKey = prefix ? `${prefix}CustomRatioWidth` : 'customRatioWidth';
    const hKey = prefix ? `${prefix}CustomRatioHeight` : 'customRatioHeight';
    const disabled = settings[ratioKey] === 'source' ? 'disabled' : '';
    return `<input type="number" data-param="${wKey}" value="${escapeHtml(settings[wKey] || '')}" placeholder="比例宽" ${disabled}>
            <input type="number" data-param="${hKey}" value="${escapeHtml(settings[hKey] || '')}" placeholder="比例高" ${disabled}>`;
}

function renderCustomSizeControls(prefix=''){
    const resKey = prefix ? `${prefix}Resolution` : 'resolution';
    if(settings[resKey] !== 'custom') return '';
    const wKey = prefix ? `${prefix}CustomWidth` : 'customWidth';
    const hKey = prefix ? `${prefix}CustomHeight` : 'customHeight';
    return `<input type="number" data-param="${wKey}" value="${escapeHtml(settings[wKey] || '')}" placeholder="宽度">
            <input type="number" data-param="${hKey}" value="${escapeHtml(settings[hKey] || '')}" placeholder="高度">`;
}

function renderComfySettingField(field){
    const value = comfyParamValue(field);
    const label = field.name || field.input || field.id;
    if(field.type === 'boolean') return `<button type="button" class="setting-check ${value ? 'active' : ''}" data-comfy-bool="${escapeHtml(field.id)}"><span class="check-box"></span><span>${escapeHtml(label)}</span></button>`;
    if(field.type === 'dropdown'){
        const opts = field.options || [];
        const curLabel = String(value || opts[0] || label);
        return `<div class="smart-control comfy-dropdown-control" title="${escapeHtml(label)}">
            <button class="smart-pill" type="button"><span class="sub">${escapeHtml(curLabel)}</span></button>
            <div class="smart-popover compact-popover">
                <div class="smart-popover-title">${escapeHtml(label)}</div>
                <div class="model-list">
                    ${opts.map(o => `<button type="button" class="direct-option ${String(o) === String(value) ? 'active' : ''}" data-comfy-pick="${escapeHtml(field.id)}" data-comfy-value="${escapeHtml(o)}"><span>${escapeHtml(o)}</span></button>`).join('') || `<div class="muted-note">${escapeHtml('无选项')}</div>`}
                </div>
            </div>
        </div>`;
    }
    if(field.type === 'textarea') return `<textarea class="wide" data-comfy-param="${escapeHtml(field.id)}" placeholder="${escapeHtml(label)}" style="width:160px">${escapeHtml(value)}</textarea>`;
    const type = (field.type === 'number' || field.type === 'slider') ? 'number' : 'text';
    const min = field.min !== undefined ? ` min="${escapeHtml(field.min)}"` : '';
    const max = field.max !== undefined ? ` max="${escapeHtml(field.max)}"` : '';
    const step = field.step !== undefined ? ` step="${escapeHtml(field.step)}"` : '';
    const isNumeric = type === 'number';
    const inputHtml = `<input type="${type}" data-comfy-param="${escapeHtml(field.id)}" value="${escapeHtml(value)}"${min}${max}${step}>`;
    if(isNumeric && comfyRandomEnabledField(field)){
        const active = smartComfyRandomActive(field.id);
        return `<div class="num-with-dice" title="${escapeHtml(label)}">
            <span class="num-label">${escapeHtml(label)}</span>
            ${inputHtml}
            <button type="button" class="dice-btn ${active ? 'active' : ''}" data-comfy-random="${escapeHtml(field.id)}" title="${escapeHtml(active ? '随机已开启，点击关闭' : '随机已关闭，点击开启')}"><i data-lucide="dice-5"></i></button>
        </div>`;
    }
    if(isNumeric){
        return `<div class="num-compact" title="${escapeHtml(label)}"><span class="num-label">${escapeHtml(label)}</span>${inputHtml}</div>`;
    }
    return `<div class="num-compact" title="${escapeHtml(label)}"><span class="num-label">${escapeHtml(label)}</span>${inputHtml}</div>`;
}

function updatePromptPlaceholder(){
    if(!promptInput) return;
    promptInput.dataset.placeholder = '描述你想生成或编辑的图片...';
}

function comfyRandomEnabledField(field){ return field?.type === 'number' && field.random_enabled === true; }

function smartComfyRandomActive(fieldId){
    return smartComfyRandomActiveFor(settings, fieldId);
}

function smartComfyRandomActiveFor(source, fieldId){
    const active = source?.comfyRandomActive || {};
    return active[fieldId] !== false;
}

function toggleSmartComfyRandom(fieldId){
    settings.comfyRandomActive = settings.comfyRandomActive || {};
    settings.comfyRandomActive[fieldId] = !smartComfyRandomActive(fieldId);
    persistActiveSmartSettings();
    renderDynamicParams();
    scheduleSave();
}

function smartComfyRandomValue(field){
    const isFloat = Number(field.step) > 0 && Number(field.step) < 1;
    let min = Number.isFinite(Number(field.min)) ? Number(field.min) : null;
    let max = Number.isFinite(Number(field.max)) ? Number(field.max) : null;
    const name = `${field.input || ''} ${field.name || ''}`.toLowerCase();
    const looksSeed = name.includes('seed') || name.includes('noise') || name.includes('随机') || name.includes('噪');
    if(min === null) min = looksSeed ? 1 : 0;
    if(max === null || max <= min) max = looksSeed ? 1000000000000000 : 999999;
    const value = min + Math.random() * (max - min);
    if(isFloat){
        const precision = Math.min(8, Math.max(1, String(field.step).split('.')[1]?.length || 2));
        return Number(value.toFixed(precision));
    }
    return Math.floor(value);
}

function setDynamicSetting(key, value){
    const numericKeys = new Set(['count','width','height','videoDuration','enhanceStrength','enhanceUpscaleRes','editUpscaleRes','customRatioWidth','customRatioHeight','customWidth','customHeight','msCustomRatioWidth','msCustomRatioHeight','msCustomWidth','msCustomHeight']);
    const layoutKeys = new Set(['provider_id','model','resolution','ratio','msgenModel','msCustomModel','msResolution','msRatio','videoProvider','videoModel','videoTaskMode','videoAspect','videoResolution','comfyMode','comfyWorkflow','quality','count','enhanceUpscaleRes','editUpscaleRes']);
    settings[key] = numericKeys.has(key) && value !== '' ? Number(value) : value;
    if(key === 'provider_id') settings.model = '';
    if(key === 'videoProvider') settings.videoModel = '';
    if(key === 'videoModel' && isSeedance25VideoModel()){

        if(!['', '480p', '720p', '1080p'].includes(settings.videoResolution)) settings.videoResolution = '';
        if(['9:21', 'keep_ratio'].includes(settings.videoAspect)) settings.videoAspect = 'adaptive';
    }
    if(key === 'videoTaskMode' && settings.videoTaskMode !== 'auto'){
        settings.videoAspect = 'adaptive';
        if(settings.videoTaskMode === 'edit') settings.videoDuration = -1;
    }
    if(['videoDuration','videoModel','videoProvider','videoTaskMode'].includes(key)) settings.videoDuration=window.VideoDurationPolicy.clamp(settings.videoDuration,smartVideoDurationRange());
    if(key === 'videoMultimodal' && settings.videoMultimodal) settings.videoUseFrameRoles = false;
    if(key === 'videoUseFrameRoles' && settings.videoUseFrameRoles) settings.videoMultimodal = false;
    if(key === 'comfyMode') applyRecentSmartSettingsForCurrentMode();
    if(key === 'resolution'){
        if(settings.resolution === 'custom') settings.ratio = '';
        else if(!settings.ratio) settings.ratio = 'square';
    }
    if(key === 'ratio') applySourceRatioToSettings('');
    if(key === 'msResolution'){
        if(settings.msResolution === 'custom') settings.msRatio = '';
        else if(!settings.msRatio) settings.msRatio = 'square';
    }
    if(key === 'msRatio') applySourceRatioToSettings('ms');
    if(key === 'customRatioWidth' || key === 'customRatioHeight') settings.customRatio = settings.customRatioWidth && settings.customRatioHeight ? `${settings.customRatioWidth}:${settings.customRatioHeight}` : '';
    if(key === 'msCustomRatioWidth' || key === 'msCustomRatioHeight') settings.msCustomRatio = settings.msCustomRatioWidth && settings.msCustomRatioHeight ? `${settings.msCustomRatioWidth}:${settings.msCustomRatioHeight}` : '';
    if(key === 'customWidth' || key === 'customHeight') settings.customSize = settings.customWidth && settings.customHeight ? `${settings.customWidth}x${settings.customHeight}` : '';
    if(key === 'msCustomWidth' || key === 'msCustomHeight') settings.msCustomSize = settings.msCustomWidth && settings.msCustomHeight ? `${settings.msCustomWidth}x${settings.msCustomHeight}` : '';
    const sizeKeys = new Set(['resolution','ratio','customRatio','customRatioWidth','customRatioHeight','customWidth','customHeight','customSize']);
    const unlockOutpaintSize = settings.outpaintResolutionLocked && sizeKeys.has(key);
    if(unlockOutpaintSize){
        delete settings.outpaintResolutionLocked;
        const subject = activeSettingsSubject();
        if(subject) delete subject.outpaintSize;
    }
    if(key === 'comfyWorkflow') {
        settings.comfyParams = {};
        ensureComfyWorkflow(settings.comfyWorkflow).then(renderDynamicParams);
    }
    persistActiveSmartSettings();
    rememberRecentSmartSettings(settings, activeSettingsSubject());
    if(layoutKeys.has(key)) renderDynamicParams();
    scheduleSave();
}

function closeAllSmartPopovers(){
    document.querySelectorAll('.smart-control.pinned').forEach(c => c.classList.remove('pinned'));
    document.querySelectorAll('.composer-advanced[open]').forEach(c => {c.open=false;});
}

function bindDynamicParams(){
    dynamicParams.querySelectorAll('.smart-control > .smart-pill').forEach(pill => {
        pill.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            const ctrl = pill.parentElement;
            const wasPinned = ctrl.classList.contains('pinned');
            closeAllSmartPopovers();
            if(!wasPinned) ctrl.classList.add('pinned');
        };
    });
    dynamicParams.querySelectorAll('[data-smart-param]').forEach(btn => {
        btn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            setDynamicSetting(btn.dataset.smartParam, btn.dataset.smartValue);
            if(btn.dataset.smartParam === 'videoDuration') renderDynamicParams();
        };
    });
    dynamicParams.querySelectorAll('[data-param]').forEach(input => {
        input.onclick = event => event.stopPropagation();
        input.oninput = input.onchange = event => {
            event?.stopPropagation?.();
            setDynamicSetting(input.dataset.param, input.value);
            if(input.dataset.param === 'videoDuration' && event?.type === 'change') renderDynamicParams();
        };
    });
    dynamicParams.querySelectorAll('[data-toggle-param]').forEach(btn => {
        btn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            settings[btn.dataset.toggleParam] = !settings[btn.dataset.toggleParam];
            if(btn.dataset.toggleParam === 'videoMultimodal' && settings.videoMultimodal) settings.videoUseFrameRoles = false;
            if(btn.dataset.toggleParam === 'videoUseFrameRoles' && settings.videoUseFrameRoles) settings.videoMultimodal = false;
            persistActiveSmartSettings();
            renderDynamicParams();
            dynamicParams.querySelector(`[data-toggle-param="${btn.dataset.toggleParam}"]`)?.focus({preventScroll:true});
            scheduleSave();
        };
    });
    dynamicParams.querySelectorAll('[data-trusted-source]').forEach(btn => {
        btn.onclick = async event => {
            event.preventDefault();
            event.stopPropagation();
            const src = btn.dataset.trustedSource;
            settings.videoTrustedSource = ['library','cloud','manual'].includes(src) ? src : 'library';
            persistActiveSmartSettings();
            renderDynamicParams();
            scheduleSave();
            try {
                if(src === 'cloud') await uploadCurrentSmartVideosToCloud();
                else if(src === 'manual') await setCurrentSmartManualVideoUrl();
            } catch(e) {
                toast((e.message || '操作失败').slice(0, 180));
            }
        };
    });
    dynamicParams.querySelectorAll('[data-comfy-bool]').forEach(btn => {
        btn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            settings.comfyParams = settings.comfyParams || {};
            const id = btn.dataset.comfyBool;
            const field = currentComfyFields().find(f => f.id === id);
            settings.comfyParams[id] = !Boolean(settings.comfyParams[id] ?? field?.default ?? false);
            persistActiveSmartSettings();
            renderDynamicParams();
            scheduleSave();
        };
    });
    dynamicParams.querySelectorAll('[data-comfy-param]').forEach(input => {
        input.onclick = event => event.stopPropagation();
        input.oninput = input.onchange = event => {
            event?.stopPropagation?.();
            settings.comfyParams = settings.comfyParams || {};
            const field = currentComfyFields().find(f => f.id === input.dataset.comfyParam);
            if(field?.type === 'number' || field?.type === 'slider') settings.comfyParams[input.dataset.comfyParam] = Number(input.value) || 0;
            else settings.comfyParams[input.dataset.comfyParam] = input.value;
            persistActiveSmartSettings();
            scheduleSave();
        };
    });
    dynamicParams.querySelectorAll('[data-comfy-pick]').forEach(btn => {
        btn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            settings.comfyParams = settings.comfyParams || {};
            const fieldId = btn.dataset.comfyPick;
            const value = btn.dataset.comfyValue;
            settings.comfyParams[fieldId] = value;
            const popover = btn.closest('.smart-popover');
            const control = btn.closest('.smart-control');
            const pillSub = control?.querySelector('.smart-pill .sub');
            if(pillSub) pillSub.textContent = value;
            if(popover){
                popover.querySelectorAll(`[data-comfy-pick="${fieldId}"]`).forEach(b => b.classList.toggle('active', b.dataset.comfyValue === value));
            }
            closeAllSmartPopovers();
            persistActiveSmartSettings();
            scheduleSave();
        };
    });
    dynamicParams.querySelectorAll('[data-comfy-random]').forEach(btn => {
        btn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            toggleSmartComfyRandom(btn.dataset.comfyRandom);
        };
    });
}

function shellPoint(event){
    const rect = shell.getBoundingClientRect();
    return {x:event.clientX - rect.left, y:event.clientY - rect.top};
}

function renderConnections(nodeIds=null){
    return withSmartComputation(() => renderSmartConnectionPaths(nodeIds));
}

function renderSmartConnectionPaths(...args){return smartWorkspaceView.connectionPaths(...args);}

function smartConnectionTopology(){
    return JSON.stringify([nodes.map(n => n.id), (canvas?.connections || []).map(c => [c.from,c.to,c.kind || 'flow'])]);
}

function patchSmartConnectionGroup(current, fresh){
    [...current.attributes].forEach(attr => {
        if(!fresh.hasAttribute(attr.name)) current.removeAttribute(attr.name);
    });
    [...fresh.attributes].forEach(attr => {
        if(current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
    });
    [...fresh.children].forEach((child, index) => {
        const old = current.children[index];
        if(old && old.tagName === child.tagName) patchSmartConnectionGroup(old, child);
        else if(old) old.replaceWith(child.cloneNode(true));
        else current.appendChild(child.cloneNode(true));
    });
    while(current.children.length > fresh.children.length) current.lastElementChild.remove();
}

function scheduleSmartGeometryRefresh(...args){return smartWorkspaceView.scheduleGeometry(...args);}

function cancelSmartGeometryRefresh(...args){return smartWorkspaceView.cancelGeometry(...args);}

function refreshConnectionLayer(...args){return smartWorkspaceView.refreshConnections(...args);}

function moveNodeElementsDuringDrag(){
    if(!dragState) return;
    const groupItems = dragState.group || [{id:dragState.id}];
    groupItems.map(item => item.id).forEach(id => {
        const n = nodes.find(x => x.id === id);
        const el = world.querySelector(`.image-node[data-id="${CSS.escape(id)}"]`);
        if(n && el){
            el.style.left = `${n.x || 0}px`;
            el.style.top = `${n.y || 0}px`;
        }
    });
    const active = selectedNode();
    if(active && (dragState.group || [{id:dragState.id}]).some(item => item.id === active.id)){
        positionComposerForNode(active);
    }
    scheduleSmartGeometryRefresh(groupItems.map(item => item.id));
    scheduleSmartMinimapRender();
}

function updateNodeElementDuringResize(node){
    if(!node) return;
    const el = world.querySelector(`.image-node[data-id="${CSS.escape(node.id)}"]`);
    if(!el){
        render();
        return;
    }
    const imgs = node.images || [];
    const layout = imageLayout(imgs, nodeScale(node), node);
    el.style.width = `${layout.width}px`;
    el.style.height = `${layout.height}px`;
    const body = el.querySelector('.node-body');
    if(body){
        const loadingSingle = body.querySelector('.loading-cell.single');
        if(loadingSingle){
            loadingSingle.style.width = `${layout.width}px`;
            loadingSingle.style.height = `${layout.height}px`;
        }
        const loadingGrid = body.querySelector('.loading-skeleton');
        if(loadingGrid){
            const count = Math.max(1, Number(node.pending) || 1);
            const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(count))));
            const rows = Math.ceil(count / cols);
            loadingGrid.style.width = `${layout.width}px`;
            loadingGrid.style.height = `${layout.height}px`;
            loadingGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
            loadingGrid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
        }
        const grid = body.querySelector('.thumb-grid');
        if(grid){
            grid.style.setProperty('--thumb-cols', layout.cols);
            grid.style.setProperty('--thumb-size', `${layout.thumb}px`);
            const visibleRows = Math.max(1, Math.min(MEDIA_GROUP_MAX_VISIBLE_ROWS, Number(layout.visibleRows || layout.rows || 1)));
            const maxHeight = visibleRows * Number(layout.thumb || 96) + Math.max(0, visibleRows - 1) * 8;
            grid.style.setProperty('--thumb-max-height', `${maxHeight}px`);
            grid.querySelectorAll('.thumb-item').forEach((itemEl, index) => {
                applyThumbDisplaySizeToElement(itemEl, imgs[index], layout.thumb);
            });
        }
        const wrap = body.querySelector('.image-wrap');
        if(wrap){
            wrap.style.setProperty('--node-img-w', `${layout.width}px`);
            wrap.style.setProperty('--node-img-h', `${layout.height}px`);
        }
        const media = body.querySelector('.node-img');
        if(media){
            media.style.width = `${layout.width}px`;
            media.style.height = `${layout.height}px`;
        }
    }
    const active = selectedNode();
    if(active?.id === node.id) positionComposerForNode(active);
    scheduleSmartGeometryRefresh([node.id], 2);
    scheduleSmartMinimapRender();
}

function localDisplayUrlForMediaItem(img){
    if(!img) return '';
    // Trimmed videos own a new playable file in `url`. Older trim nodes stored
    // their provenance in `source_url`, which normally means "preferred local
    // display URL" elsewhere in the canvas. Keep those existing nodes usable by
    // explicitly preferring the clip URL whenever trim metadata is present.
    if(mediaKindForItem(img) === 'video' && img.url && img.clip_start != null && img.clip_end != null){
        return img.url;
    }
    const candidates = [
        img.originalLocalUrl,
        img.localUrl,
        img.sourceUrl,
        img.local_url,
        img.source_url,
        img.url
    ];
    const local = candidates.find(url => url && !/^https?:\/\//i.test(String(url)));
    return local || img.url || '';
}

function imageForDisplay(img){
    if(!img || typeof img !== 'object') return img;
    const localUrl = localDisplayUrlForMediaItem(img);
    if(!localUrl || localUrl === img.url) return img;
    return {
        ...img,
        url:localUrl,
        originalLocalUrl:img.originalLocalUrl || localUrl
    };
}

function thumbMediaHtml(img, deferPreview=false){
    // Preserve cells, indexes and controls; only defer heavyweight preview resources.
    if(deferPreview) return thumbMediaHtml(img).replace(/<img src=/g, '<img data-smart-group-src=');
    if(isFileMediaItem(img) || isTextMediaItem(img)) return `<div class="media-thumb file-thumb" data-media-url="${escapeAttr(img.url || '')}" data-media-kind="${escapeAttr(mediaKindForItem(img))}"><i data-lucide="${isTextMediaItem(img) ? 'file-text' : 'file'}"></i><span>${escapeHtml(img.name || (isTextMediaItem(img) ? 'Text' : 'File'))}</span></div>`;
    if(isAudioMediaItem(img)) return `<div class="media-thumb audio-thumb" data-media-url="${escapeAttr(img.url || '')}" data-media-kind="audio"><i data-lucide="audio-lines"></i><span>${escapeHtml(img.name || 'Audio')}</span><button class="smart-audio-open thumb-audio-open" type="button" title="打开音频播放器" aria-label="打开音频播放器"><i data-lucide="play"></i></button></div>`;
    if(isVideoMediaItem(img)) return `<div class="media-thumb video-thumb">${smartVideoPreviewHtml(img, 512, 'alt=""')}<button class="smart-video-play thumb-video-play" type="button" title="播放"><i data-lucide="play"></i></button></div>`;
    return smartPreviewImgHtml(img, 512, 'draggable="false"');
}

function imageResolutionLabel(img){
    const w = Number(img?.natural_w || img?.width || img?.w || 0);
    const h = Number(img?.natural_h || img?.height || img?.h || 0);
    return w > 0 && h > 0 ? `${Math.round(w)} x ${Math.round(h)}` : '';
}

function imageResolutionBadgeHtml(img){
    const label = imageResolutionLabel(img);
    return label ? `<span class="image-resolution-badge">${escapeHtml(label)}</span>` : '';
}

function thumbDisplaySize(img, maxSize){
    const limit = Math.max(28, Math.round(Number(maxSize) || 96));
    const size = mediaLayoutSize(img);
    const w = size.width;
    const h = size.height;
    if(!(w > 0 && h > 0)) return {width:limit, height:limit};
    const fit = Math.min(limit / w, limit / h);
    return {
        width:Math.max(28, Math.round(w * fit)),
        height:Math.max(28, Math.round(h * fit))
    };
}

function thumbItemStyle(img, maxSize){
    const size = thumbDisplaySize(img, maxSize);
    return `--thumb-w:${size.width}px;--thumb-h:${size.height}px`;
}

function applyThumbDisplaySizeToElement(itemEl, img, maxSize=0){
    if(!itemEl?.classList?.contains('thumb-item')) return;
    const limit = Math.max(
        28,
        Math.round(
            Number(maxSize || 0)
            || Number(itemEl.style.getPropertyValue('--thumb-size').replace('px', ''))
            || Math.max(itemEl.clientWidth || 0, itemEl.clientHeight || 0)
            || 96
        )
    );
    const size = thumbDisplaySize(img, limit);
    itemEl.style.setProperty('--thumb-w', `${size.width}px`);
    itemEl.style.setProperty('--thumb-h', `${size.height}px`);
}

function updateImageResolutionBadgeElement(itemEl, img){
    if(!itemEl) return;
    const label = imageResolutionLabel(img);
    let badge = itemEl.querySelector('.image-resolution-badge');
    if(!label){
        badge?.remove();
        return;
    }
    if(!badge){
        badge = document.createElement('span');
        badge.className = 'image-resolution-badge';
        itemEl.appendChild(badge);
    }
    badge.textContent = label;
}

function singleMediaHtml(img, w, h){
    if(isFileMediaItem(img) || isTextMediaItem(img)) return `<div class="node-img media-card media-file-card" style="width:${w}px;height:${h}px"><div class="media-card-icon"><i data-lucide="${isTextMediaItem(img) ? 'file-text' : 'file'}"></i></div><div class="media-card-title">${escapeHtml(img.name || (isTextMediaItem(img) ? 'Text' : 'File'))}</div><div class="media-card-sub">${isTextMediaItem(img) ? 'TEXT' : 'FILE'}</div></div>`;
    if(isAudioMediaItem(img)) return `<div class="node-img media-card media-audio-card" style="width:${w}px;height:${h}px"><div class="smart-audio-copy"><div class="smart-audio-title" title="${escapeAttr(img.name || 'Audio')}">${escapeHtml(img.name || 'Audio')}</div><div class="smart-audio-meta">${escapeHtml(smartAudioFormatLabel(img))} · 音频素材</div></div><div class="smart-audio-player"><button class="smart-audio-open" type="button" title="打开音频播放器" aria-label="打开音频播放器"><i data-lucide="play"></i></button>${smartAudioWaveformSvg()}</div></div>`;
    if(isVideoMediaItem(img)){
        const preview=smartMediaPreviewUrl(img,768),source=displayMediaUrl(img);
        const poster=img.poster || img.thumbnailUrl || (preview!==source?preview:'');
        return `<div class="node-img media-card media-video-card" style="width:${w}px;height:${h}px"><div class="pixmax-player-mount" data-src="${escapeAttr(source)}" data-url="${escapeAttr(img.url)}" data-poster="${escapeAttr(poster)}" data-duration="${Number(img.duration)||0}"></div><button class="smart-video-play" type="button" title="放大视频" aria-label="打开视频预览"><i data-lucide="maximize-2"></i></button></div>`;
    }
    return smartPreviewImgHtml(img, 768, `class="node-img" draggable="false" style="width:${w}px;height:${h}px"`);
}

function smartNodeHasLiveMedia(node){
    return Boolean(!node?.pending && (node?.images || []).some(img => img?.url));
}

function isPixmaxPlayerControlEvent(event){
    // The original player's play/pause icon changes during its click handler.
    // composedPath retains the button ancestry even when that SVG is removed.
    return event.composedPath().some(element=>element instanceof Element &&
        element.matches('button,[role=slider]') && element.closest('.pixmax-player-mount'));
}

function mediaSignaturePartFromElement(itemEl){
    if(itemEl?.dataset?.mediaSignature) return itemEl.dataset.mediaSignature;
    const media = itemEl?.querySelector?.('video,audio,img');
    if(media){
        const tag = media.tagName.toLowerCase();
        const kind = tag === 'video' ? 'video' : tag === 'audio' ? 'audio' : 'image';
        const url = media.dataset?.url || media.dataset?.originalSrc || media.getAttribute('src') || '';
        return `${kind}:${url}`;
    }
    const audioThumb = itemEl?.querySelector?.('.audio-thumb[data-media-url]');
    if(audioThumb) return `audio:${audioThumb.dataset.mediaUrl || ''}`;
    return '';
}

function captureMediaPlaybackState(media){
    if(!media) return null;
    return {
        currentTime:Number.isFinite(media.currentTime) ? media.currentTime : 0,
        paused:Boolean(media.paused),
        playbackRate:Number.isFinite(media.playbackRate) ? media.playbackRate : 1,
        muted:Boolean(media.muted),
        volume:Number.isFinite(media.volume) ? media.volume : 1
    };
}

function restoreMediaPlaybackState(media, state){
    if(!media || !state) return;
    try { media.playbackRate = state.playbackRate || 1; } catch(e) {}
    try { media.muted = state.muted; } catch(e) {}
    try { media.volume = state.volume; } catch(e) {}
    const applyTime = () => {
        if(Number.isFinite(state.currentTime) && state.currentTime > 0 && Math.abs((media.currentTime || 0) - state.currentTime) > 0.2){
            try { media.currentTime = state.currentTime; } catch(e) {}
        }
        if(!state.paused && typeof media.play === 'function'){
            const playPromise = media.play();
            if(playPromise?.catch) playPromise.catch(() => {});
        }
    };
    if(media.readyState >= 1) applyTime();
    else media.addEventListener('loadedmetadata', applyTime, {once:true});
}

function transplantSmartMediaElements(oldNodeEl, newNodeEl){
    const oldItems = [...(oldNodeEl?.querySelectorAll?.('.thumb-item,.image-wrap') || [])];
    const newItems = [...(newNodeEl?.querySelectorAll?.('.thumb-item,.image-wrap') || [])];
    oldItems.forEach((oldItem, index) => {
        const player=oldItem.querySelector('.pixmax-player-mount');
        const nextPlayer=newItems.find(item=>item.dataset.mediaSignature===oldItem.dataset.mediaSignature)?.querySelector('.pixmax-player-mount');
        if(player&&nextPlayer&&player.dataset.url===nextPlayer.dataset.url){nextPlayer.replaceWith(player);return;}
        const oldMedia = oldItem.querySelector('video,audio,img.node-img,.thumb-item > img,.media-thumb img');
        if(!oldMedia) return;
        const selector = oldMedia.tagName.toLowerCase();
        const oldUrl = oldMedia.dataset?.url || oldMedia.dataset?.originalSrc || oldMedia.getAttribute('src') || '';
        const oldSignature = oldItem.dataset?.mediaSignature || `${selector}:${oldUrl}`;
        const newItem = newItems.find(item => item.dataset?.mediaSignature === oldSignature)
            || newItems.find(item => item.querySelector?.(selector)?.dataset?.url === oldUrl)
            || newItems.find(item => item.querySelector?.(selector)?.dataset?.originalSrc === oldUrl)
            || newItems.find(item => item.querySelector?.(selector)?.getAttribute?.('src') === oldMedia.getAttribute('src'))
            || newItems[index];
        const newMedia = newItem?.querySelector?.(selector);
        const newUrl = newMedia?.dataset?.url || newMedia?.dataset?.originalSrc || newMedia?.getAttribute?.('src') || '';
        if(!newMedia || oldUrl !== newUrl) return;
        if(selector === 'img'){
            oldMedia.className = newMedia.className;
            oldMedia.draggable = false;
            oldMedia.alt = newMedia.getAttribute('alt') || oldMedia.getAttribute('alt') || '';
            oldMedia.style.cssText = newMedia.style.cssText;
            oldMedia.dataset.originalSrc = newMedia.dataset?.originalSrc || oldMedia.dataset?.originalSrc || '';
            if(newMedia.dataset.smartGroupSrc){
                oldMedia.dataset.smartGroupSrc = oldMedia.dataset.smartGroupSrc || newMedia.dataset.smartGroupSrc;
            } else {
                delete oldMedia.dataset.smartGroupSrc;
                if(!oldMedia.hasAttribute('src') && newMedia.hasAttribute('src')) oldMedia.src = newMedia.getAttribute('src');
            }
            newMedia.replaceWith(oldMedia);
            return;
        }
        const state = captureMediaPlaybackState(oldMedia);
        newMedia.replaceWith(oldMedia);
        restoreMediaPlaybackState(oldMedia, state);
        requestAnimationFrame(() => restoreMediaPlaybackState(oldMedia, state));
    });
}

function captureMediaPlaybackStates(){
    const states = new Map();
    world.querySelectorAll('video[data-url], audio[data-url]').forEach(media => {
        const tag = media.tagName.toLowerCase();
        const url = media.dataset.url || media.getAttribute('src') || '';
        if(url) states.set(`${tag}:${url}`, captureMediaPlaybackState(media));
    });
    return states;
}

function restoreMediaPlaybackStates(states){
    if(!states?.size) return;
    world.querySelectorAll('video[data-url], audio[data-url]').forEach(media => {
        const tag = media.tagName.toLowerCase();
        const url = media.dataset.url || media.getAttribute('src') || '';
        restoreMediaPlaybackState(media, states.get(`${tag}:${url}`));
    });
}

function promptNodeBodyHtml(node){
    return `<div class="prompt-node-card">
        <div class="pixmax-text-view ${node.text?.trim()?'':'empty'}" role="presentation">${escapeHtml(node.text || '双击开始输入...')}</div>
        <textarea class="prompt-node-text prompt-node-control" aria-label="节点文本" hidden readonly placeholder="在此输入文本...">${escapeHtml(node.text || '')}</textarea>
    </div>`;
}

function loopNumberControlHtml({label, value, key, min=1, max=100, quick=[1,2,3,4,5,6,8,10]}){
    const v = Math.max(min, Math.min(max, Number(value) || min));
    return `<div class="loop-number-control">
        <button class="loop-smart-control loop-number-trigger" type="button"><span>${escapeHtml(label)}</span><strong>${v}</strong></button>
        <div class="loop-number-popover">
            <div class="loop-number-grid">
                ${quick.map(n => `<button type="button" class="loop-smart-control loop-number-cell ${n === v ? 'active' : ''}" data-loop-number="${escapeHtml(key)}" data-loop-value="${n}">${n}</button>`).join('')}
            </div>
            <label class="loop-number-custom">
                <span>${escapeHtml('自定义')}</span>
                <input class="loop-smart-control loop-number-input" type="number" min="${min}" max="${max}" step="1" data-loop-number-input="${escapeHtml(key)}" value="${v}">
            </label>
        </div>
    </div>`;
}

function smartLoopTokenLabel(token){
    if(token === '《计数》' || token === '[计数]') return '计数';
    return token;
}

function smartLoopTokenChipHtml(token){
    return `<span class="loop-smart-token-chip" contenteditable="false" data-token="${escapeHtml(token)}"><span>${escapeHtml(smartLoopTokenLabel(token))}</span><button type="button" aria-label="${escapeHtml('删除')}" title="${escapeHtml('删除')}">×</button></span>`;
}

function smartLoopVariableHtml(text){
    return String(text || '').split(/(《计数》|\[计数\])/g).map(part => {
        if(part === '《计数》' || part === '[计数]') return smartLoopTokenChipHtml('《计数》');
        return escapeHtml(part);
    }).join('');
}

function smartLoopEditorText(editor){
    const walk = node => {
        if(node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
        if(node.nodeType !== Node.ELEMENT_NODE) return '';
        if(node.classList?.contains('loop-smart-token-chip')) return node.dataset.token || '';
        if(node.tagName === 'BR') return '\n';
        return [...node.childNodes].map(walk).join('');
    };
    return [...(editor?.childNodes || [])].map(walk).join('').replace(/\u00a0/g, ' ');
}

function insertSmartLoopToken(editor, token){
    if(!editor) return;
    editor.focus();
    const chipWrap = document.createElement('span');
    chipWrap.innerHTML = smartLoopTokenChipHtml(token);
    const chip = chipWrap.firstElementChild;
    const spacer = document.createTextNode(' ');
    const sel = window.getSelection();
    if(sel && sel.rangeCount && editor.contains(sel.anchorNode)){
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(spacer);
        range.insertNode(chip);
        range.setStartAfter(spacer);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    } else {
        editor.appendChild(chip);
        editor.appendChild(spacer);
    }
}

function smartLoopBodyHtml(node){
    node.count = smartLoopCount(node);
    node.mode = node.mode === 'parallel' ? 'parallel' : 'serial';
    node.loopStart = Math.max(1, Number(node.loopStart) || 1);
    node.imageBatchSize = Math.max(1, Math.min(100, Number(node.imageBatchSize) || 1));
    node.showPrompt = Boolean(node.showPrompt);
    node.imageInput = Boolean(node.imageInput);
    const imageCount = smartLoopInputImages(node, {index:node.loopStart}).length;
    const loopThumbs = smartNodeInputThumbsHtml(smartLoopPreviewImages(node));
    const promptItems = smartLoopInputPromptItems(node);
    const promptFields = smartLoopPromptFieldValues(node);
    const visiblePromptFields = promptFields.length ? promptFields : [''];
    const promptHint = promptItems.length
        ? `识别到 ${promptItems.length} 条提示词，按计数轮流输出`
        : '可使用 [计数] 作为变量';
    const currentUpstreamPrompt = smartLoopSelectedInputPrompt(node, {index:node.loopStart});
    const defaultPrompt = '现在生成第《计数》张卖点图片';
    const loopRunState = smartCascadeRunForLoop(node.id);
    const loopRunning = Boolean(loopRunState);
    const loopStopping = Boolean(loopRunState?.stopRequested);
    return `<div class="loop-smart-card ${node.imageInput ? 'has-image' : ''} ${node.showPrompt ? 'has-prompt' : ''}">
        <div class="loop-smart-row loop-smart-top">
            <div class="loop-smart-seg">
                <button type="button" class="loop-smart-control ${node.mode !== 'parallel' ? 'active' : ''}" data-loop-mode="serial">${escapeHtml('循环')}</button>
                <button type="button" class="loop-smart-control ${node.mode === 'parallel' ? 'active' : ''}" data-loop-mode="parallel" title="${escapeHtml('智能画布会按轮落盘，避免覆盖同一目标节点')}">${escapeHtml('并发')}</button>
            </div>
        </div>
        <div class="loop-smart-row">
            <button class="loop-smart-control loop-smart-toggle ${node.imageInput ? 'active' : ''}" type="button" data-loop-toggle="image"><i data-lucide="image"></i><span>${escapeHtml('图片')}</span></button>
            <button class="loop-smart-control loop-smart-toggle ${node.showPrompt ? 'active' : ''}" type="button" data-loop-toggle="prompt"><i data-lucide="text-cursor-input"></i><span>${escapeHtml('提示词')}</span></button>
        </div>
        ${node.imageInput ? `<div class="loop-smart-panel">
            ${loopThumbs}
            <div class="loop-smart-mini">
                ${loopNumberControlHtml({label:'批次', value:node.imageBatchSize, key:'imageBatchSize', max:100, quick:[1,2,3,4,5,6,8,10]})}
            </div>
            <div class="loop-smart-note">${imageCount ? escapeHtml(`当前会输出 ${imageCount} 张图片`) : escapeHtml('把图片或图片组连接到左侧输入口')}</div>
        </div>` : ''}
        ${node.showPrompt ? `<div class="loop-smart-panel prompt-panel">
            ${currentUpstreamPrompt ? `<div class="loop-smart-upstream">
                <div class="loop-smart-upstream-label">${escapeHtml(promptHint)}</div>
                <div class="loop-smart-upstream-text">${escapeHtml(currentUpstreamPrompt)}</div>
            </div>` : ''}
            <div class="loop-smart-prompt-list">
                ${visiblePromptFields.map((value, index) => `<div class="loop-smart-prompt-item">
                    <div class="loop-smart-prompt-index">${index + 1}</div>
                    <div class="loop-smart-control loop-smart-text" contenteditable="true" data-loop-prompt-index="${index}" data-placeholder="${escapeHtml('例如：现在生成第[计数]个卖点')}">${smartLoopVariableHtml(value || (index === 0 && !promptFields.length ? defaultPrompt : ''))}</div>
                    <button class="loop-smart-control loop-smart-icon-btn" type="button" data-loop-prompt-delete="${index}" ${visiblePromptFields.length <= 1 ? 'disabled' : ''} title="${escapeHtml('删除')}" aria-label="${escapeHtml('删除')}">×</button>
                </div>`).join('')}
            </div>
            <div class="loop-smart-row loop-smart-prompt-actions">
                <button class="loop-smart-control loop-smart-token loop-smart-counter-token" type="button" data-loop-token="《计数》">${escapeHtml('计数')}</button>
                <span class="loop-smart-note">${escapeHtml(promptHint)}</span>
                <button class="loop-smart-control loop-smart-add-prompt" type="button" data-loop-prompt-add="1" title="新增" aria-label="新增"><i data-lucide="plus"></i></button>
            </div>
        </div>` : ''}
        <div class="loop-smart-footer">
            ${loopNumberControlHtml({label:'起始计数', value:node.loopStart, key:'loopStart', max:9999, quick:[1,2,3,4,5,6,8,10]})}
            ${loopNumberControlHtml({label:'次数', value:node.count, key:'count', max:100, quick:[1,2,3,4,5,6,8,10]})}
            <button class="loop-smart-control loop-smart-run ${loopRunning ? 'is-stop' : ''}" type="button" data-loop-run="${escapeHtml(node.id)}" ${loopStopping ? 'disabled' : ''}><i data-lucide="${loopRunning ? 'square' : 'workflow'}"></i><span>${escapeHtml(loopRunning ? smartCascadeStopText(loopStopping) : '一键运行')}</span></button>
        </div>
    </div>`;
}

function nodeBodyHtml(node, layout){
    if(node.localDepth && !(node.images || []).length)return smartLocalDepthBodyHtml(node);
    const tasks=window.CanvasSession?.enabled ? smartPendingTasks(node) : [];
    const body=smartNodeMediaBodyHtml(node,layout);
    if(!tasks.length)return body;
    const recoveryOnly=!((node.images || []).length);
    return body+tasks.map(task=>{
        const state=window.MemberCanvasEdit?.taskState?.(task) || {status:'checking',label:'正在核对后台任务'};
        const active=state.status==='checking' || state.status==='running';
        return `<div class="image-task-pending-cell task-recovery-status ${active?'task-recovery-active':''}" data-task-recovery="${state.status}" ${recoveryOnly?'':`style="width:${layout.width}px;min-height:120px"`}>
            ${active?'<span class="task-recovery-ring" aria-hidden="true"></span>':''}
            <div class="image-task-pending-text">${escapeHtml(state.label)}</div>
            <div class="image-task-pending-sub">${state.status==='succeeded'?'结果已保存，可从生成结果加入；无需重新生成。':'查询不会重新生成或产生费用。'}</div>
            <button class="image-task-pending-query" type="button" data-task-recovery="${state.status}" data-image-task-query="${escapeAttr(node.id)}" data-task-id="${escapeAttr(task.taskId)}">${state.status==='succeeded'?'查看生成结果':'刷新状态'}</button>
        </div>`;
    }).join('');
}

function smartNodeMediaBodyHtml(node, layout){
    if(node.type === 'smart-prompt') return promptNodeBodyHtml(node);
    if(node.type === 'smart-loop') return smartLoopBodyHtml(node);
    const imgs = (node.images || []).map(imageForDisplay);
    if(window.CanvasSession?.enabled && smartPendingTasks(node).length && !imgs.length)return '';
    const pendingCount = smartNodePendingCount(node);
    const recoverTask = smartRecoverableImageTask(node);
    if(recoverTask && imgs.length === 0){
        return imageTaskRecoverBodyHtml(node, recoverTask, layout);
    }
    const pausedTask=smartPendingTasks(node).find(task=>task.paused);
    if(pausedTask && imgs.length === 0 && !pendingCount)return imageTaskRecoverBodyHtml(node,pausedTask,layout);
    if(node.queued && imgs.length === 0 && !pendingCount){
        return `<div class="loading-cell single queued" style="width:${layout.width}px;height:${layout.height}px"></div>`;
    }
    if(pendingCount && imgs.length === 0){
        const count = Math.max(1, pendingCount);
        if(count <= 1) return `<div class="loading-cell single" style="width:${layout.width}px;height:${layout.height}px"></div>`;
        const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(count))));
        const rows = Math.ceil(count / cols);
        return `<div class="loading-skeleton" style="grid-template-columns:repeat(${cols}, 1fr);grid-template-rows:repeat(${rows}, 1fr);width:${layout.width}px;height:${layout.height}px;padding:8px;box-sizing:border-box">${Array.from({length:count}).map(() => `<div class="loading-cell"></div>`).join('')}</div>`;
    }
    if(imgs.length > 1){
        const visibleRows = Math.max(1, Math.min(MEDIA_GROUP_MAX_VISIBLE_ROWS, Number(layout.visibleRows || layout.rows || 1)));
        const maxHeight = visibleRows * Number(layout.thumb || 96) + Math.max(0, visibleRows - 1) * 8;
        return `<div class="thumb-grid" data-thumb-scroll="1" style="--thumb-cols:${layout.cols}; --thumb-size:${layout.thumb}px; --thumb-max-height:${maxHeight}px">${imgs.map((img, i) => `<div class="thumb-item ${smartVolcengineFaceVerified(img?.asset_uris, img) ? 'face-verified' : ''} ${img?.face_auth_status === 'Processing' ? 'face-verifying' : ''} ${smartSelection.image.nodeId === node.id && smartSelection.image.index === i ? 'image-selected' : ''}" data-image-index="${i}" data-media-signature="${escapeAttr(`${mediaKindForItem(img)}:${img?.url || ''}`)}">${thumbMediaHtml(img, imgs.length > 48)}${imageResolutionBadgeHtml(img)}${smartFaceVerifiedBadgeHtml(img?.asset_uris, true, img)}<button class="mini-x image-delete" type="button" data-image-index="${i}" title="${escapeHtml('删除')}"><i data-lucide="trash-2"></i></button></div>`).join('')}</div>`;
    }
    if(imgs[0]) return `<div class="image-wrap ${smartVolcengineFaceVerified(imgs[0]?.asset_uris, imgs[0]) ? 'face-verified' : ''} ${imgs[0]?.face_auth_status === 'Processing' ? 'face-verifying' : ''} ${smartSelection.image.nodeId === node.id && smartSelection.image.index === 0 ? 'image-selected' : ''}" data-image-index="0" data-media-signature="${escapeAttr(`${mediaKindForItem(imgs[0])}:${imgs[0]?.url || ''}`)}" style="--node-img-w:${layout.width}px;--node-img-h:${layout.height}px">${singleMediaHtml(imgs[0], layout.width, layout.height)}${imageResolutionBadgeHtml(imgs[0])}${smartFaceVerifiedBadgeHtml(imgs[0]?.asset_uris, true, imgs[0])}<button class="mini-x image-delete" type="button" data-image-index="0" title="${escapeHtml('删除')}"><i data-lucide="trash-2"></i></button></div>`;
    const generationKind = smartGenerationKind(node);
    if(generationKind) return `<button class="generation-node-placeholder" type="button" aria-label="编辑${generationKind === 'video' ? '视频' : '图片'}生成提示词">
        ${pixmaxSvg(generationKind==='video'?'video-fill':'image-fill')}
        <span>点击输入提示词</span>
    </button><button class="media-node-upload" type="button" data-node-upload aria-label="上传${generationKind === 'video' ? '视频' : '图片'}" title="上传${generationKind === 'video' ? '视频' : '图片'}，也可直接拖入"><i data-lucide="upload" aria-hidden="true"></i></button>`;
    return `<button class="node-drop" type="button" data-upload-action="files" aria-label="上传图片、视频或音频">${pixmaxSvg('image-fill')}</button>`;
}

function imageTaskRecoverBodyHtml(node, task, layout){
    if(task.paused)return `<div class="image-task-pending-cell" style="width:${layout.width}px;height:${layout.height}px">
        <div class="image-task-pending-overlay">
            <div class="image-task-pending-text">自动回填已暂停</div>
            <div class="image-task-pending-sub">输入已变化。后台任务不会因此取消，请到生成结果查看进度并确认加入。</div>
            <button class="image-task-pending-query" type="button" data-image-task-query="${escapeAttr(node.id)}" data-task-id="${escapeAttr(task.taskId)}">查看生成结果</button>
        </div></div>`;
    const querying = Boolean(task.querying);
    const failedCount = smartPendingTasks(node).filter(item => item.failed && item.recoverTaskId).length;
    const title = querying ? '查询中' : '任务未丢失';
    const sub = failedCount > 1 ? `还有 ${failedCount} 个任务可查询` : `任务 ID：${task.recoverTaskId || ''}`;
    return `<div class="image-task-pending-cell loading-cell single" style="width:${layout.width}px;height:${layout.height}px">
        <div class="image-task-pending-overlay">
            <div class="image-task-pending-spinner"><i data-lucide="${querying ? 'loader-2' : 'refresh-cw'}"></i></div>
            <div class="image-task-pending-text">${escapeHtml(title)}</div>
            <div class="image-task-pending-sub">${escapeHtml(sub)}</div>
            <button class="image-task-pending-query" type="button" data-image-task-query="${escapeAttr(node.id)}" data-task-id="${escapeAttr(task.taskId)}" ${querying ? 'disabled' : ''}><i data-lucide="${querying ? 'loader-2' : 'refresh-cw'}"></i><span>${querying ? '查询中…' : '查询结果'}</span></button>
        </div>
    </div>`;
}

function smartNodeToolbarImageIndex(node){
    const images = node?.images || [];
    if(smartSelection.image.nodeId === node?.id){
        const index = Number(smartSelection.image.index);
        if(Number.isFinite(index) && index >= 0 && index < images.length) return index;
    }
    return 0;
}

function runSmartNodeToolbarAction(nodeId, action){
    const node = nodes.find(n => n.id === nodeId);
    if(!node) return;
    const index = smartNodeToolbarImageIndex(node);
    const item = imageForDisplay(node.images?.[index]);
    if(!item?.url) return;
    const kind = mediaKindForItem(item);
    if(PIXMAX_VIDEO_DEFERRED.has(action))return;
    if(['trim','auth','asset','depth-video'].includes(action)&&isSmartCanvasLocked()){toast('请先开始编辑画布。');return;}
    smartSelection.toolbarImage(nodeId, index);
    if(action==='trim'&&kind==='video'){
        openImageEditor(nodeId,index);
        return toggleVideoTrimPanel();
    }
    if(action === 'download'){
        downloadPreviewFile(node.images?.[index] || item);
        return;
    }
    if(action === 'canvas'){
        duplicateSmartNodeMediaToCanvas(node, index);
        return;
    }
    if(action === 'asset'){
        saveSmartImageToAssetLibrary(nodeId, index);
        return;
    }
    if(action === 'auth'){
        quickFaceAuthSmartImage(nodeId, index);
        return;
    }
    if(action === 'depth-video' && kind === 'video'){
        return openPixmaxVideoDepthMenu(nodeId,index);
    }
    if(action === 'depth-local' && kind === 'image'){
        return openSmartLocalDepthImage(nodeId, index);
    }
    if(kind !== 'image' && action !== 'preview'){
        toast('当前素材不支持该操作');
        return;
    }
    if(action === 'preview'){
        openImagePreview(nodeId, index);
        return;
    }
    if(action === 'panorama' || action === 'depth'){
        return runManagedImageTool(action, nodeId, index);
    }
    const modeMap = {crop:'crop', outpaint:'outpaint', brush:'brush', 'grid-join':'grid'};
    if(!modeMap[action]) return;
    if(action === 'grid-join' && (node.images || []).filter(img => img?.url && mediaKindForItem(imageForDisplay(img)) === 'image').length < 2) return;
    openImageEditor(nodeId, index);
    setImageEditMode(modeMap[action], true);
}

function smartChangedConnectionNodes(...args){return smartWorkspaceView.changedConnections(...args);}

function render(...args){return smartWorkspaceView.render(...args);}

function smartAffectedNodeIds(ids){
    const affected = new Set(ids.filter(Boolean)), outgoing = new Map();
    (canvas?.connections || []).forEach(conn => {
        if(!outgoing.has(conn.from)) outgoing.set(conn.from, []);
        outgoing.get(conn.from).push(conn.to);
    });
    if(!canvasUsesConnections) nodes.forEach(node => (node.inputNodeIds || []).forEach(from => {
        if(!outgoing.has(from)) outgoing.set(from, []);
        outgoing.get(from).push(node.id);
    }));
    const queue = [...affected];
    for(let i=0; i<queue.length; i++){
        (outgoing.get(queue[i]) || []).forEach(id => {
            if(!affected.has(id)){ affected.add(id); queue.push(id); }
        });
    }
    return affected;
}

function refreshSmartNodes(...args){return smartWorkspaceView.refreshNodes(...args);}

function measureSmartNodeImages(root=world){
    root.querySelectorAll('.image-node img,.image-node video').forEach(imgEl => {
        const nodeEl = imgEl.closest('.image-node');
        const itemEl = imgEl.closest('[data-image-index]');
        const node = nodes.find(n => n.id === nodeEl?.dataset.id);
        const index = Number(itemEl?.dataset.imageIndex ?? 0);
        const image = node?.images?.[index];
        if(imgEl.tagName?.toLowerCase() === 'img' && image?.url) bindImageProxyFallback(imgEl, image);
        if(!node || !image || image.natural_w || image.natural_h) return;
        const isPreview = isSmartPreviewImage(imgEl);
        if(isPreview && image.layout_w && image.layout_h) return;
        const entry=window.MemberCanvasEdit?.active, epoch=entry?.lease.epoch;
        const startedEditable=Boolean(window.MemberCanvasEdit?.canEdit);
        const apply = () => {
            if(!nodes.includes(node) || node.images?.[index]!==image || imgEl.isConnected===false) return;
            // Viewer measurements are display metadata, not a document edit.
            // A late load may not save through a different editing session.
            const writable=!window.CanvasSession?.enabled || (startedEditable && window.MemberCanvasEdit?.canEdit && entry===window.MemberCanvasEdit.active && epoch===entry?.lease.epoch);
            const measuredImage=writable ? image : {...image};
            const measuredNode=writable ? node : {...node,images:node.images.map((value,i)=>i===index ? measuredImage : value)};
            const w = imgEl.naturalWidth || imgEl.videoWidth || 0;
            const h = imgEl.naturalHeight || imgEl.videoHeight || 0;
            if(w <= 0 || h <= 0 || measuredImage.natural_w || measuredImage.natural_h) return;
            const prevW = Number(measuredImage.layout_w || 0);
            const prevH = Number(measuredImage.layout_h || 0);
            if(isPreview){
                if(prevW === w && prevH === h) return;
                measuredImage.layout_w = w;
                measuredImage.layout_h = h;
            } else {
                measuredImage.natural_w = w;
                measuredImage.natural_h = h;
                delete measuredImage.layout_w;
                delete measuredImage.layout_h;
            }
            applyThumbDisplaySizeToElement(itemEl, measuredImage, Math.max(itemEl?.clientWidth || 0, itemEl?.clientHeight || 0));
            updateImageResolutionBadgeElement(itemEl, measuredImage);
            if((measuredNode.images || []).length === 1 && !measuredNode.w && !measuredNode.h){
                const layout = singleImageLayout(measuredImage, measuredNode, mediaNodeDefaultScale(measuredNode));
                measuredNode.w = layout.width;
                measuredNode.h = layout.height;
            }
            updateNodeElementDuringResize(measuredNode);
            if(isNodeSelected(measuredNode.id)) updateComposer();
            if(writable) scheduleSave();
        };
        const isVideo = imgEl.tagName?.toLowerCase() === 'video';
        if(!isVideo && imgEl.complete && imgEl.naturalWidth) apply();
        else imgEl.addEventListener('load', apply, {once:true});
        imgEl.addEventListener('loadedmetadata', apply, {once:true});
    });
}

function bindConnectionEvents(root=world){
    root.querySelectorAll('[data-conn-index]').forEach(el => {
        if(el._smartConnectionBound) return;
        el._smartConnectionBound = true;
        if(el.classList.contains('conn-hit')){
            el.addEventListener('dblclick', e => {
                e.preventDefault(); e.stopPropagation();
                disconnectConnection(Number(el.dataset.connIndex));
            });
            return;
        }
        el.addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            const index = Number(el.dataset.connIndex);
            disconnectConnection(index);
        });
    });
}

function ensurePortDragPathElement(){
    const svg = world.querySelector('svg.connection-layer');
    if(!svg) return null;
    let path = svg.querySelector('path.port-drag-temp');
    if(!path){
        path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'port-drag-temp conn-pending');
        path.setAttribute('stroke', 'rgba(100,116,139,0.92)');
        path.setAttribute('stroke-width', '1.9');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-linecap', 'round');
        svg.appendChild(path);
    }
    return path;
}

function clearPortDragVisual(){
    world.querySelector('path.port-drag-temp')?.remove();
    world.querySelectorAll('.node-port.is-active').forEach(el => el.classList.remove('is-active'));
    world.querySelectorAll('.image-node.port-hover').forEach(el => el.classList.remove('port-hover'));
}

function bindPromptNodeControls(el, node){
    const textEl = el.querySelector('.prompt-node-text');
    if(!textEl) return;
    const view=el.querySelector('.pixmax-text-view');
    let changed=false;
    view.addEventListener('dblclick',event=>{
        event.stopPropagation();
        if(isSmartCanvasLocked()||pixmaxCanvasMode!=='normal')return;
        const scrollTop=view.scrollTop;
        const caret=window.PixmaxTextCaret(view,event.clientX,event.clientY,node.text||'')??0;
        view.hidden=true;textEl.hidden=false;textEl.readOnly=false;textEl.placeholder='在此输入文本...';
        textEl.focus({preventScroll:true});textEl.setSelectionRange(caret,caret);textEl.scrollTop=scrollTop;
    });
    view.addEventListener('wheel',event=>{if(isNodeSelected(node.id))event.stopPropagation();},{passive:true});
    bindScrollableText(textEl);
    textEl.addEventListener('click', event => event.stopPropagation());
    textEl.addEventListener('dblclick', event => event.stopPropagation());
    textEl.oninput = event => {
        if(isSmartCanvasLocked()){textEl.value = node.text || ''; return;}
        if(!changed){pushUndo();changed=true;}
        node.text = event.target.value;
        scheduleSave();
    };
    textEl.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape')textEl.blur();});
    textEl.addEventListener('blur',()=>{view.textContent=node.text||'双击开始输入...';view.classList.toggle('empty',!node.text?.trim());view.scrollTop=textEl.scrollTop;view.hidden=false;textEl.hidden=true;textEl.readOnly=true;changed=false;});
}

function bindLoopNodeControls(el, node){
    el.querySelectorAll('.loop-smart-control').forEach(control => {
        control.addEventListener('mousedown', e => e.stopPropagation());
        control.addEventListener('click', e => e.stopPropagation());
        control.addEventListener('dblclick', e => e.stopPropagation());
    });
    const loopNumberBounds = key => {
        if(key === 'loopStart') return {min:1, max:9999};
        if(key === 'imageBatchSize') return {min:1, max:100};
        return {min:1, max:100};
    };
    const normalizeLoopNumber = (key, rawValue) => {
        const bounds = loopNumberBounds(key);
        return Math.max(bounds.min, Math.min(bounds.max, Number(rawValue) || bounds.min));
    };
    const syncLoopNumberUi = (source, key, value) => {
        const control = source?.closest?.('.loop-number-control');
        if(!control) return;
        const display = control.querySelector('.loop-number-trigger strong');
        if(display) display.textContent = value;
        control.querySelectorAll('[data-loop-value]').forEach(cell => {
            cell.classList.toggle('active', Number(cell.dataset.loopValue) === value);
        });
    };
    const setLoopNumber = (key, rawValue, rerender=true, source=null) => {
        const value = normalizeLoopNumber(key, rawValue);
        if(key === 'count') node.count = smartLoopCount({count:value});
        if(key === 'loopStart') node.loopStart = value;
        if(key === 'imageBatchSize') node.imageBatchSize = value;
        scheduleSave();
        if(rerender) refreshSmartNodes([node.id], {forceIds:[node.id]});
        else syncLoopNumberUi(source, key, value);
    };
    el.querySelectorAll('[data-loop-number]').forEach(btn => {
        btn.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            setLoopNumber(btn.dataset.loopNumber, btn.dataset.loopValue, true);
        };
    });
    el.querySelectorAll('[data-loop-number-input]').forEach(input => {
        input.oninput = e => {
            e.stopPropagation();
            setLoopNumber(input.dataset.loopNumberInput, input.value, false, input);
        };
        input.onchange = e => {
            e.stopPropagation();
            setLoopNumber(input.dataset.loopNumberInput, input.value, true);
        };
    });
    el.querySelectorAll('[data-loop-mode]').forEach(btn => {
        btn.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            const previousMode = node.mode === 'parallel' ? 'parallel' : 'serial';
            node.mode = btn.dataset.loopMode === 'parallel' ? 'parallel' : 'serial';
            refreshSmartNodes([node.id], {forceIds:[node.id]});
            if(previousMode !== node.mode && !window.matchMedia('(prefers-reduced-motion: reduce)').matches){
                const segment = world.querySelector('.image-node[data-id="' + CSS.escape(node.id) + '"] .loop-smart-seg');
                if(segment){
                    segment.classList.add('studio-switch-motion');
                    segment.addEventListener('animationend',()=>segment.classList.remove('studio-switch-motion'),{once:true});
                }
            }
            scheduleSave();
        };
    });
    el.querySelectorAll('[data-loop-toggle]').forEach(btn => {
        btn.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            if(btn.dataset.loopToggle === 'image') node.imageInput = !node.imageInput;
            if(btn.dataset.loopToggle === 'prompt') {
                node.showPrompt = !node.showPrompt;
                if(node.showPrompt && !smartLoopActivePromptFieldValues(node).length) setSmartLoopPromptFieldValues(node, ['现在生成第《计数》张卖点图片']);
            }
            fitSmartLoopNode(node);
            refreshSmartNodes([node.id], {forceIds:[node.id]});
            scheduleSave();
        };
    });
    const syncPromptFieldsFromDom = () => {
        const values = [...el.querySelectorAll('[data-loop-prompt-index]')]
            .sort((a, b) => Number(a.dataset.loopPromptIndex) - Number(b.dataset.loopPromptIndex))
            .map(input => smartLoopEditorText(input));
        setSmartLoopPromptFieldValues(node, values);
    };
    let activePromptEditor = null;
    el.querySelectorAll('.loop-smart-text').forEach(text => {
        bindScrollableText(text);
        text.onfocus = () => { activePromptEditor = text; };
        text.oninput = () => { syncPromptFieldsFromDom(); scheduleSave(); };
        text.addEventListener('click', e => {
            const remove = e.target.closest?.('.loop-smart-token-chip button');
            if(!remove) return;
            e.preventDefault();
            e.stopPropagation();
            remove.closest('.loop-smart-token-chip')?.remove();
            syncPromptFieldsFromDom();
            scheduleSave();
        });
    });
    el.querySelectorAll('[data-loop-prompt-add]').forEach(btn => {
        btn.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            syncPromptFieldsFromDom();
            const values = smartLoopPromptFieldValues(node);
            setSmartLoopPromptFieldValues(node, [...values, '']);
            fitSmartLoopNode(node);
            refreshSmartNodes([node.id], {forceIds:[node.id]});
            scheduleSave();
        };
    });
    el.querySelectorAll('[data-loop-prompt-delete]').forEach(btn => {
        btn.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            syncPromptFieldsFromDom();
            const removeIndex = Number(btn.dataset.loopPromptDelete);
            const values = smartLoopPromptFieldValues(node);
            if(values.length <= 1) return;
            values.splice(removeIndex, 1);
            setSmartLoopPromptFieldValues(node, values);
            fitSmartLoopNode(node);
            refreshSmartNodes([node.id], {forceIds:[node.id]});
            scheduleSave();
        };
    });
    const firstText = el.querySelector('.loop-smart-text');
    const targetPromptEditor = () => activePromptEditor && el.contains(activePromptEditor) ? activePromptEditor : firstText;
    el.querySelectorAll('[data-loop-token]').forEach(btn => {
        btn.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            const text = targetPromptEditor();
            if(!text) return;
            const token = btn.dataset.loopToken || '《计数》';
            insertSmartLoopToken(text, token);
            syncPromptFieldsFromDom();
            scheduleSave();
        };
    });
    el.querySelectorAll('[data-loop-run]').forEach(btn => {
        btn.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            const loopId = btn.dataset.loopRun || node.id;
            if(smartCascadeIsLoopRunning(loopId)){
                requestSmartCascadeStop(loopId);
                return;
            }
            runSmartCascadeFromLoop(loopId);
        };
    });
}

function bindScrollableText(el){
    if(!el || el.dataset.scrollBound === '1') return;
    el.dataset.scrollBound = '1';
    const stop = e => e.stopPropagation();
    const beginSelection = e => {
        e.stopPropagation();
        textSelectionGuard = {
            el,
            scrollTop:el.scrollTop || 0,
            scrollLeft:el.scrollLeft || 0,
            clientY:e.clientY,
            wheelUntil:0,
            active:true
        };
    };
    el.addEventListener('mousedown', beginSelection);
    el.addEventListener('mousemove', e => {
        e.stopPropagation();
        if(textSelectionGuard?.el === el) textSelectionGuard.clientY = e.clientY;
    });
    el.addEventListener('mouseup', e => {
        e.stopPropagation();
        if(textSelectionGuard?.el === el) textSelectionGuard.active = false;
    });
    el.addEventListener('mouseleave', e => {
        e.stopPropagation();
        if(textSelectionGuard?.el === el) {
            el.scrollTop = textSelectionGuard.scrollTop;
            el.scrollLeft = textSelectionGuard.scrollLeft;
        }
    });
    el.addEventListener('scroll', () => {
        const guard = textSelectionGuard;
        if(!guard || guard.el !== el || !guard.active || Date.now() < guard.wheelUntil) {
            if(guard?.el === el) {
                guard.scrollTop = el.scrollTop || 0;
                guard.scrollLeft = el.scrollLeft || 0;
            }
            return;
        }
        const nextTop = el.scrollTop || 0;
        const prevTop = guard.scrollTop || 0;
        const rect = el.getBoundingClientRect();
        const pointerBelow = Number.isFinite(guard.clientY) && guard.clientY > rect.bottom - 10;
        const pointerAbove = Number.isFinite(guard.clientY) && guard.clientY < rect.top + 10;
        const jumpedToTop = prevTop > Math.max(80, el.clientHeight * 0.45) && nextTop < 4 && !pointerAbove;
        const wrongDirectionJump = pointerBelow && nextTop < prevTop - Math.max(40, el.clientHeight * 0.25);
        if(jumpedToTop || wrongDirectionJump) {
            requestAnimationFrame(() => {
                if(textSelectionGuard?.el === el && textSelectionGuard.active) {
                    el.scrollTop = prevTop;
                    el.scrollLeft = guard.scrollLeft || 0;
                }
            });
            return;
        }
        guard.scrollTop = nextTop;
        guard.scrollLeft = el.scrollLeft || 0;
    }, {passive:true});
    el.addEventListener('click', stop);
    el.addEventListener('dblclick', stop);
    el.addEventListener('wheel', e => {
        e.stopPropagation();
        if(textSelectionGuard?.el === el) textSelectionGuard.wheelUntil = Date.now() + 180;
    }, {passive:true});
}

function updatePortDragVisual(){
    if(!portDragState) return;
    const fromNode = nodes.find(n => n.id === portDragState.fromId);
    if(!fromNode) return;
    const fr = nodeRect(fromNode);
    const isOut = portDragState.fromPort === 'out';
    const fx = isOut ? fr.x + fr.width : fr.x;
    const fy = fr.y + fr.height / 2;
    const tx = portDragState.currentWorld.x;
    const ty = portDragState.currentWorld.y;
    const dx = Math.max(50, Math.abs(tx - fx) * 0.45);
    const sign = isOut ? 1 : -1;
    const path = ensurePortDragPathElement();
    if(path) path.setAttribute('d', `M${fx} ${fy} C ${fx + dx * sign} ${fy}, ${tx - dx * sign} ${ty}, ${tx} ${ty}`);
    world.querySelectorAll('.node-port.is-active').forEach(el => el.classList.remove('is-active'));
    world.querySelectorAll('.image-node.port-hover').forEach(el => el.classList.remove('port-hover'));
    if(portDragState.hoverTargetId){
        const targetNodeEl = world.querySelector(`.image-node[data-id="${portDragState.hoverTargetId}"]`);
        targetNodeEl?.classList.add('port-hover');
        targetNodeEl?.querySelector(`.node-port[data-port="${portDragState.hoverPort}"]`)?.classList.add('is-active');
    }
}

function handlePortDrop(drag, e){
    if(isSmartCanvasLocked()){ discardPendingUndo(); return; }
    const {targetId, targetPort, hit} = (() => {
        const hitEl = document.elementFromPoint(e.clientX, e.clientY);
        const portEl = hitEl?.closest?.('.node-port');
        const nodeEl = portEl?.closest?.('.image-node') || hitEl?.closest?.('.image-node');
        let id = '', port = '';
        if(nodeEl && nodeEl.dataset.id && nodeEl.dataset.id !== drag.fromId){
            id = nodeEl.dataset.id;
            if(portEl){
                port = portEl.dataset.port;
            } else {
                const rect = nodeEl.getBoundingClientRect();
                port = (e.clientX - rect.left) < rect.width / 2 ? 'in' : 'out';
            }
        }
        return {targetId:id, targetPort:port, hit:hitEl};
    })();
    if(targetId){
        const compatible = (drag.fromPort === 'out' && targetPort === 'in') || (drag.fromPort === 'in' && targetPort === 'out');
        if(!compatible){ discardPendingUndo(); render(); return; }
        const fromId = drag.fromPort === 'out' ? drag.fromId : targetId;
        const toId = drag.fromPort === 'out' ? targetId : drag.fromId;
        if(pixmaxCanConnect(nodes.find(node=>node.id===fromId),nodes.find(node=>node.id===toId))&&connectInputNode(fromId, toId)){
            commitPendingUndo();
            render();
            scheduleSave();
        } else {
            discardPendingUndo();
            render();
        }
        return;
    }
    if(!drag.moved){
        discardPendingUndo();render();
        const source=nodes.find(node=>node.id===drag.fromId);if(!source)return;
        const rect=nodeRect(source);
        openCreateMenu(e,{connection:{fromId:drag.fromId,fromPort:drag.fromPort,fullMenu:true}});
        createMenuPoint={x:drag.fromPort==='out'?rect.x+rect.width+200:rect.x-200,y:rect.y+rect.height/2};
        return;
    }
    if(hit?.closest?.('.composer,.smart-nav,.asset-panel,.asset-toggle,.smart-backup-toggle,.smart-log-toggle,.smart-cost-toggle,.smart-shortcut-toggle,.smart-workflow-toggle,.log-modal,.shortcut-modal,.image-edit-modal,.smart-audio-lightbox,.smart-minimap')){
        discardPendingUndo(); render(); return;
    }
    discardPendingUndo();
    render();
    openCreateMenu(e, {connection:{fromId:drag.fromId, fromPort:drag.fromPort,fullMenu:true}});
}

function bindNodeEvents(elements=null){
    requestAnimationFrame(positionPixmaxVideoToolbars);
    (elements || world.querySelectorAll('.image-node')).forEach(el => {
        const id = el.dataset.id;
        const nodeForControls = nodes.find(n => n.id === id);
        if(!isSmartStudioNode(nodeForControls))bindPixmaxNodeName(el,nodeForControls);
        if(isSmartStudioNode(nodeForControls)) bindSmartStudioNode(el,nodeForControls);
        if(nodeForControls?.type === 'smart-prompt') bindPromptNodeControls(el, nodeForControls);
        if(nodeForControls?.type === 'smart-loop') bindLoopNodeControls(el, nodeForControls);
        el.onclick = e => {
            e.stopPropagation();
            if(Date.now() < suppressNodeClickUntil) return;
            smartSelection.clickNode(id, el);
        };
        el.ondblclick = e => e.stopPropagation();
        const generationPlaceholder = el.querySelector('.generation-node-placeholder');
        generationPlaceholder?.addEventListener('mousedown', e => {
            if(e.button !== 0) return;
            if(shell.dataset.tool==='pan'||pixmaxSpacePanning)return;
            generationPlaceholder._press={x:e.clientX,y:e.clientY};
            e.preventDefault(); e.stopPropagation();
            el.onmousedown?.(e);
        }, true);
        generationPlaceholder?.addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            const press=generationPlaceholder._press;
            if(didPan || press && Math.abs(e.clientX-press.x)+Math.abs(e.clientY-press.y)>3)return;
            if(isSmartCanvasLocked()) return;
            smartSelection.createdNode(id);
            render();
            promptInput.focus({preventScroll:true});
        });
        const nodeDrop = el.querySelector('.node-drop, [data-node-upload]');
        nodeDrop?.addEventListener('mousedown', e => {
            if(e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
        }, true);
        nodeDrop?.addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            smartSelection.uploadTarget(id);
        });
        el.querySelectorAll('.node-delete').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault(); e.stopPropagation();
                deleteNodeFromButton(id);
            });
        });
        el.querySelectorAll('[data-local-depth-action]').forEach(btn=>{
            btn.addEventListener('mousedown',event=>{event.preventDefault();event.stopPropagation();},true);
            btn.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();runSmartLocalDepthAction(id,btn.dataset.localDepthAction);});
        });
        el.querySelectorAll('[data-smart-node-action]').forEach(btn => {
            btn.addEventListener('mousedown', e => {
                e.preventDefault();
                e.stopPropagation();
            }, true);
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                runSmartNodeToolbarAction(btn.dataset.nodeId || id, btn.dataset.smartNodeAction);
            });
        });
        el.querySelectorAll('[data-image-task-query]').forEach(btn => {
            btn.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); }, true);
            btn.addEventListener('click', e => {
                e.preventDefault(); e.stopPropagation();
                if(btn.dataset.taskRecovery){
                    if(btn.dataset.taskRecovery==='succeeded')window.MemberCanvasEdit?.openTaskResults();
                    else window.MemberCanvasEdit?.refreshTasks();
                    return;
                }
                querySmartImageTaskNow(btn.dataset.imageTaskQuery, btn.dataset.taskId);
            });
        });
        el.querySelectorAll('[data-thumb-scroll]').forEach(scroller => {
            scroller.addEventListener('wheel', e => {
                e.stopPropagation();
            }, {passive:false});
        });
        el.querySelectorAll('.image-delete').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault(); e.stopPropagation();
                deleteImage(id, Number(btn.dataset.imageIndex));
            });
        });
        el.querySelectorAll('.smart-video-play').forEach(btn => {
            btn.addEventListener('mousedown', e => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            }, true);
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const item = btn.closest('[data-image-index]');
                const imageIndex = Number(item?.dataset.imageIndex || 0);
                const owner = nodes.find(n => n.id === id);
                if(mediaKindForItem(owner?.images?.[imageIndex] || {}) !== 'video') return;
                clearImageClickTimer();
                suppressImageClickUntil = Date.now() + 260;
                openSmartVideoLightbox(id, imageIndex);
            }, true);
        });
        el.querySelectorAll('.pixmax-inline-video').forEach(video=>{
            ['mousedown','click','dblclick','wheel'].forEach(type=>video.addEventListener(type,event=>event.stopPropagation()));
        });
        el.querySelectorAll('.smart-audio-open').forEach(btn => {
            btn.addEventListener('mousedown', e => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            }, true);
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const item = btn.closest('[data-image-index]');
                const imageIndex = Number(item?.dataset.imageIndex || 0);
                const owner = nodes.find(n => n.id === id);
                if(mediaKindForItem(owner?.images?.[imageIndex] || {}) !== 'audio') return;
                clearImageClickTimer();
                suppressImageClickUntil = Date.now() + 260;
                openSmartAudioLightbox(id, imageIndex);
            }, true);
        });
        el.querySelectorAll('.thumb-item,.image-wrap').forEach(item => {
            item.setAttribute('draggable', 'false');
            item.addEventListener('dragstart', e => {
                e.preventDefault();
            });
            item.addEventListener('mousedown', e => {
                if(isPixmaxPlayerControlEvent(e) || e.target.closest('video,audio')) return;
                if(e.button !== 0 || e.target.closest('.image-delete')) return;
                if(e.detail < 2) return;
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                clearImageClickTimer();
                suppressImageClickUntil = Date.now() + 260;
                const imageIndex = Number(item.dataset.imageIndex || 0);
                const owner = nodes.find(n => n.id === id);
                if(mediaKindForItem(owner?.images?.[imageIndex] || {}) === 'video'){
                    openSmartVideoLightbox(id, imageIndex);
                    return;
                }
                smartSelection.previewTarget(id, imageIndex);
                openImagePreview(id, imageIndex);
            }, true);
            item.addEventListener('click', e => {
                if(isPixmaxPlayerControlEvent(e) || e.target.closest('video,audio')) return;
                if(e.target.closest('.image-delete')) return;
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                if(Date.now() < suppressImageClickUntil) return;
                const imageIndex = Number(item.dataset.imageIndex || 0);
                const owner = nodes.find(n => n.id === id);
                if(mediaKindForItem(owner?.images?.[imageIndex] || {}) === 'video'){
                    clearImageClickTimer();
                    suppressImageClickUntil = Date.now() + 260;
                    openSmartVideoLightbox(id, imageIndex);
                    return;
                }
                if(e.detail >= 2){
                    clearImageClickTimer();
                    suppressImageClickUntil = Date.now() + 260;
                    smartSelection.previewTarget(id, imageIndex);
                    openImagePreview(id, imageIndex);
                    return;
                }
                smartSelection.deferImageClick(owner, imageIndex);
            });
        item.addEventListener('dblclick', e => {
            if(isPixmaxPlayerControlEvent(e) || e.target.closest('video,audio')) return;
            if(e.target.closest('.image-delete')) return;
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            clearImageClickTimer();
            suppressImageClickUntil = Date.now() + 260;
            const imageIndex = Number(item.dataset.imageIndex || 0);
            const owner = nodes.find(n => n.id === id);
            if(mediaKindForItem(owner?.images?.[imageIndex] || {}) === 'video'){
                openSmartVideoLightbox(id, imageIndex);
                return;
            }
            smartSelection.previewTarget(id, imageIndex);
            openImagePreview(id, imageIndex);
        }, true);
        });
        el.querySelectorAll('.thumb-item').forEach(item => {
            item.addEventListener('mousedown', e => {
                if(isSmartCanvasLocked()) return;
                if(isPixmaxPlayerControlEvent(e) || e.target.closest('video,audio')) return;
                if(e.button !== 0 || e.target.closest('.mini-x')) return;
                if(e.detail >= 2) return;
                const node = nodes.find(n => n.id === id);
                if(!node || (node.images || []).length <= 1) return;
                e.preventDefault(); e.stopPropagation();
                thumbDragState = {nodeId:id, imgIndex:Number(item.dataset.imageIndex || 0), startX:e.clientX, startY:e.clientY, detached:false};
                capturePendingUndo();
            });
        });
        el.querySelector('.node-resize-handle')?.addEventListener('mousedown', e => {
            if(isSmartCanvasLocked()) return;
            if(e.button !== 0) return;
            e.preventDefault(); e.stopPropagation();
            const node = nodes.find(n => n.id === id);
            if(!node) return;
            const rect = nodeRect(node);
            resizeState = {id, startX:e.clientX, startY:e.clientY, startW:rect.width, startH:rect.height};
            document.body.classList.add('smart-node-resize');
            capturePendingUndo();
        });
        const beginNodeDrag = e => {
            if(shell.dataset.tool === 'pan'||pixmaxSpacePanning) return;
            if(isSmartCanvasLocked()) return;
            if(e.button !== 0 || e.target.closest('.mini-x, .smart-node-floating-menu, .node-resize-handle, .thumb-item, .node-port, select, input')) return;
            if(e.target.closest('button') && !e.target.closest('.generation-node-placeholder,.pixmax-studio-open'))return;
            if(e.target.closest('.prompt-node-pill, textarea')) return;
            e.preventDefault(); e.stopPropagation();
            window.getSelection?.()?.removeAllRanges?.();
            if(document.activeElement?.blur) document.activeElement.blur();
            let node = nodes.find(n => n.id === id);
            if(!node) return;
            if(e.altKey) node = duplicateForAltDrag(node);
            const dragIds = smartSelection.ids.includes(node.id) ? smartSelection.ids.slice() : [node.id];
            const group = dragIds.map(dragId => {
                const n = nodes.find(x => x.id === dragId);
                return n ? {id:n.id, ox:Number(n.x) || 0, oy:Number(n.y) || 0} : null;
            }).filter(Boolean);
            dragState = {id:node.id, startX:e.clientX, startY:e.clientY, ox:node.x || 0, oy:node.y || 0, group, groupIds:group.map(item => item.id), ctrlGroup:Boolean(e.ctrlKey)};
            document.body.classList.add('smart-node-drag');
            capturePendingUndo();
        };
        el.querySelectorAll('.node-port').forEach(port => {
            port.addEventListener('mousedown', e => {
                if(isSmartCanvasLocked()) return;
                if(e.button !== 0) return;
                e.preventDefault(); e.stopPropagation();
                const portType = port.dataset.port;
                const p = screenToWorld(e);
                portDragState = {
                    fromId:id,
                    fromPort:portType,
                    currentWorld:p,
                    hoverTargetId:'',
                    hoverPort:'',
                    moved:false
                };
                shell.classList.add('port-dragging');
                capturePendingUndo();
                ensurePortDragPathElement();
                updatePortDragVisual();
            });
            port.addEventListener('click', e => { e.stopPropagation(); });
            port.addEventListener('dblclick', e => { e.stopPropagation(); });
        });
        el.onmousedown = beginNodeDrag;
        el.ondragover = e => setSmartDropCopyEffect(e);
        el.ondrop = async e => {
            e.preventDefault();
            e.stopPropagation();
            if(isSmartCanvasLocked()) return;
            const payload = await resolveSmartImageDropPayload(e.dataTransfer);
            if(isSmartCanvasLocked()) return;
            if(payload.type === 'none') return;
            await handleSmartImageDropPayload(payload, id);
        };
    });
}

function rectOverlapNode(draggedId, x, y, w, h, excludeIds=[]){
    const cx = x + w/2, cy = y + h/2;
    const excluded = new Set([draggedId, ...(excludeIds || [])]);
    for(const n of nodes){
        if(excluded.has(n.id)) continue;
        const r = nodeRect(n);
        if(cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height) return n;
    }
    return null;
}

function dragConnectTargetFor(sourceNode, point=lastMouseWorld){
    if(!sourceNode || (dragState?.group || []).length > 1) return null;
    if(['smart-prompt', 'smart-loop'].includes(sourceNode.type) && point){
        return rectOverlapNode(sourceNode.id, point.x - 1, point.y - 1, 2, 2, dragState?.groupIds || []);
    }
    const r = nodeRect(sourceNode);
    return rectOverlapNode(sourceNode.id, r.x, r.y, r.width, r.height, dragState?.groupIds || []);
}

function canAutoConnectDraggedNode(sourceNode, targetNode){
    if(!sourceNode || !targetNode || sourceNode.id === targetNode.id) return false;
    if(isHistoryGroupNode(sourceNode) || isHistoryGroupNode(targetNode)) return false;
    if(isSmartStudioNode(sourceNode) || isSmartStudioNode(targetNode))return true;
    if(isSmartImageNode(sourceNode)) return isSmartImageNode(targetNode) || targetNode.type === 'smart-loop' || targetNode.type === 'smart-prompt';
    if(sourceNode.type === 'smart-prompt') return isSmartImageNode(targetNode) || targetNode.type === 'smart-loop';
    if(sourceNode.type === 'smart-loop') return isSmartImageNode(targetNode);
    return false;
}

function restoreDraggedNodePosition(){
    if(!dragState) return;
    (dragState.group || [{id:dragState.id, ox:dragState.ox, oy:dragState.oy}]).forEach(item => {
        const n = nodes.find(x => x.id === item.id);
        if(n){
            n.x = item.ox;
            n.y = item.oy;
        }
    });
}

function clearDropHighlight(){
    world.querySelectorAll('.image-node.drop-target').forEach(el => el.classList.remove('drop-target'));
}

function setDropHighlight(targetId){
    clearDropHighlight();
    if(!targetId) return;
    const el = world.querySelector(`.image-node[data-id="${targetId}"]`);
    if(el) el.classList.add('drop-target');
}

function connectionMidpoint(conn){
    const fromNode = nodes.find(n => n.id === conn?.from);
    const toNode = nodes.find(n => n.id === conn?.to);
    if(!fromNode || !toNode) return null;
    const fr = nodeRect(fromNode), tr = nodeRect(toNode);
    if((conn.kind || 'flow') === 'history'){
        return {x:(fr.x + fr.width / 2 + tr.x + tr.width / 2) / 2, y:(fr.y + fr.height + tr.y) / 2};
    }
    return {x:(fr.x + fr.width + tr.x) / 2, y:(fr.y + fr.height / 2 + tr.y + tr.height / 2) / 2};
}

function insertionConnectionForNode(node){
    if(!node || node.type !== 'smart-loop' || !canvas?.connections?.length) return null;
    const r = nodeRect(node);
    const cx = (Number(r.x) || 0) + (Number(r.width) || 0) / 2;
    const cy = (Number(r.y) || 0) + (Number(r.height) || 0) / 2;
    let best = null;
    (canvas.connections || []).forEach((conn, index) => {
        const kind = conn.kind || 'flow';
        if(!['input','flow'].includes(kind)) return;
        if(conn.from === node.id || conn.to === node.id) return;
        const fromNode = nodes.find(n => n.id === conn.from);
        const toNode = nodes.find(n => n.id === conn.to);
        if(!fromNode || !toNode || isHistoryGroupNode(fromNode) || isHistoryGroupNode(toNode)) return;
        const mid = connectionMidpoint(conn);
        if(!mid) return;
        const score = Math.hypot(cx - mid.x, cy - mid.y);
        if(score > 96) return;
        if(!best || score < best.score) best = {conn, index, score};
    });
    return best;
}

function updateLoopInsertPreview(){
    const node = dragState ? nodes.find(n => n.id === dragState.id) : null;
    const next = node?.type === 'smart-loop' && dragState.ctrlGroup && (dragState.group || []).length <= 1
        ? insertionConnectionForNode(node)
        : null;
    const nextPreview = next ? {index:next.index} : null;
    const changed = (loopInsertPreview?.index ?? -1) !== (nextPreview?.index ?? -1);
    loopInsertPreview = nextPreview;
    if(changed) refreshConnectionLayer();
    return next;
}

function currentComposerSubject(){
    return selectedNode();
}

function loadPromptDraft(subject){
    if(subject?.promptDraftHtml){
        const hasToken = String(subject.promptDraftHtml || '').includes('mention-image-token');
        promptInput.innerHTML = hasToken
            ? subject.promptDraftHtml
            : (promptHtmlWithMentionTokens(subject.runPrompt || subject.promptDraftText || '', subject.runPromptRefs || []) || subject.promptDraftHtml);
    } else if(typeof subject?.runPrompt === 'string'){
        const rebuilt = promptHtmlWithMentionTokens(subject.runPrompt, subject.runPromptRefs || []);
        if(rebuilt) promptInput.innerHTML = rebuilt;
        else setPromptText(subject.runPrompt);
    } else {
        setPromptText('');
    }
}

function positionComposerForNode(node){
    if(!node) return;
    const rect = nodeRect(node);
    const gap = 16;
    const scale=safeScale(viewport.scale),minX=(16-viewport.x)/scale;
    const available=Math.max(240,(shell.clientWidth-32)/scale);
    const cardW = Math.min(720,available);
    composer.style.width = `${cardW}px`;
    composer.style.left = `${Math.max(minX,Math.min(rect.x+rect.width/2-cardW/2,minX+available-cardW))}px`;
    const minY=(16-viewport.y)/scale,maxY=(shell.clientHeight-16-viewport.y)/scale-composer.offsetHeight;
    composer.style.top = `${Math.max(minY,Math.min(rect.y+rect.height+gap,Math.max(minY,maxY)))}px`;
}

function renderInputPromptPreview(node){
    if(!inputPromptPreview) return;
    const text = node ? inputPromptTextFor(node).trim() : '';
    inputPromptPreview.classList.toggle('has-text', Boolean(text));
    inputPromptPreview.innerHTML = text
        ? `<div class="input-prompt-preview-label">${escapeHtml('上游输入')}</div><div class="input-prompt-preview-text">${escapeHtml(text)}</div>`
        : '';
}

function smartReferencePreviewHtml(ref){
    const kind = mediaKindForItem(ref);
    if(kind === 'audio') return '<span class="smart-ref-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v4m4-7v10m4-13v16m4-13v10m4-7v4"/></svg></span>';
    if(String(ref.url || '').startsWith('asset://')) return '<span class="smart-ref-symbol" aria-hidden="true">▧</span>';
    return kind === 'video' ? smartVideoPreviewHtml(ref, 256, 'alt=""') : smartPreviewImgHtml(ref, 256, 'alt=""');
}

function reorderSmartMediaReference(node, refs, from, to){
    if(!node || from === to || !refs[from] || !refs[to] || refs[from].kind !== refs[to].kind || refs[from].manual || refs[to].manual) return;
    pushUndo();
    const keys = refs.map(smartMediaRefKey);
    keys.splice(to, 0, keys.splice(from, 1)[0]);
    node.mediaReferenceOrder = keys;
    renderInputThumbsRow(node);
    savePromptDraftForCurrent();
    scheduleSave();
}

// Keep the existing node-selection/viewed-timer effects in workspace. Reference
// previews still restore these selection fields in their own try/finally.
function activateSmartAudioPreviewTarget(node,index){
    smartSelection.audioTarget(node, index);
}

function previewSmartReference(ref){
    const owner = nodes.find(n => n.id === ref.nodeId);
    const index = owner?.images?.findIndex(img => img.url === ref.url || img.originalLocalUrl === ref.url) ?? -1;
    if(index >= 0){
        return smartSelection.withReferencePreview(() => openImagePreview(owner.id, index));
    }
    if(String(ref.url || '').startsWith('asset://')) return toast('该资产没有可直接播放的预览地址');
    if(ref.kind === 'audio'){
        return smartAudioPreview.openExternal(ref);
    }
    smartLogPreviewNode(ref.url, ref.kind);
    setImageEditMode('preview');
}

function renderSmartMediaGroups(node){
    const parts = collectPromptParts();
    const plan = smartMediaReferencePlan(node, node ? defaultReferenceImagesFor(node) : [], parts);
    const refs = plan.refs;
    inputThumbsRow.classList.toggle('has-items', refs.length > 0 || plan.invalid.length > 0);
    const html = ['image','audio','video'].map(kind => {
        const group = refs.filter(ref => ref.kind === kind);
        if(!group.length) return '';
        const title = {image:'图片',audio:'音频',video:'视频'}[kind];
        return `<section class="smart-ref-group"><div class="smart-ref-heading">${title}<span>${group.length}</span></div><div class="smart-ref-list smart-ref-list-${kind}">${group.map(ref => {
            const i = refs.indexOf(ref);
            const preview = `<button type="button" class="smart-ref-preview" data-ref-preview="${i}" aria-label="预览${escapeAttr(ref.referenceLabel)}">${kind === 'audio' ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"/></svg>' : smartReferencePreviewHtml(ref)}${kind === 'video' ? '<span class="smart-ref-play">▷</span>' : ''}</button>`;
            const alias = `<button type="button" class="smart-ref-alias" data-ref-insert="${i}" title="插入引用">${escapeHtml(ref.referenceLabel)}</button>`;
            const content = kind === 'audio' ? `${preview}<div class="smart-ref-audio-copy">${alias}<span class="smart-ref-name" title="${escapeAttr(ref.name || ref.url)}">${escapeHtml(ref.name || fileNameFromUrl(ref.url))}</span></div>` : preview + alias;
            return `<div class="input-thumb smart-ref-item smart-ref-${kind}" data-thumb-index="${i}" data-kind="${kind}" data-url="${escapeAttr(ref.url)}" data-source-url="${escapeAttr(ref.originalLocalUrl || ref.url)}" data-node-id="${escapeAttr(ref.nodeId || '')}" data-image-index="${ref.imageIndex ?? ''}" draggable="${!ref.manual}">${content}</div>`;
        }).join('')}</div></section>`;
    }).join('') + (plan.invalid.length ? '<div class="smart-ref-error">存在失效引用，请在提示词中重新选择素材。</div>' : '');
    // Include source metadata: equal markup alone does not imply equal insert/preview targets.
    const renderKey = JSON.stringify([node?.id, refs, html]);
    if(inputThumbsRow._smartRefRenderKey !== renderKey){
        inputThumbsRow.innerHTML = html;
        inputThumbsRow._smartRefRenderKey = renderKey;
        inputThumbsRow.querySelectorAll('[data-ref-insert]').forEach(btn => {
            btn.onmousedown = event => { event.preventDefault(); event.stopPropagation(); saveMentionRange(); };
            btn.onclick = event => { event.stopPropagation(); insertMentionToken(refs[Number(btn.dataset.refInsert)]); savePromptDraftForCurrent(); scheduleSave(); };
        });
        inputThumbsRow.querySelectorAll('[data-ref-preview]').forEach(btn => {
            btn.onclick = event => { event.stopPropagation(); previewSmartReference(refs[Number(btn.dataset.refPreview)]); };
        });
        let dragged = -1;
        inputThumbsRow.querySelectorAll('.smart-ref-item').forEach(el => {
            const target = Number(el.dataset.thumbIndex);
            el.ondragstart = event => { dragged = target; event.stopPropagation(); event.dataTransfer.setData('application/x-smart-input-thumb', String(target)); };
            el.ondragover = event => { if(dragged >= 0 && refs[dragged].kind === refs[target].kind && !refs[target].manual){ event.preventDefault(); event.stopPropagation(); } };
            el.ondrop = event => { event.preventDefault(); event.stopPropagation(); reorderSmartMediaReference(node, refs, dragged, target); dragged = -1; };
            el.ondragend = () => { dragged = -1; };
        });
        bindSmartPreviewImageFallbacks(inputThumbsRow);
    }
    // Tokens may have changed even when the material list did not.
    promptInput.querySelectorAll('.mention-image-token').forEach(token => {
        const ref = parts.find(part => part.type === 'image' && part.url === token.dataset.url) || {url:token.dataset.url, kind:token.dataset.kind};
        token.dataset.kind = mediaKindForItem(ref);
        const invalid = plan.invalid.some(item => smartMediaRefKey(item) === smartMediaRefKey(ref));
        const label = invalid ? '引用失效' : plan.aliases.get(smartMediaRefKey(ref));
        token.classList.toggle('smart-ref-invalid', invalid);
        const text = token.querySelector('span:last-child');
        if(label && text) text.textContent = `@${label}`;
    });
}

function syncSmartAudioReferenceTokens(){
    const parts = collectPromptParts();
    promptInput.querySelectorAll('.mention-image-token').forEach(token => {
        const ref = parts.find(part => part.type === 'image' && part.url === token.dataset.url);
        if(!ref || mediaKindForItem(ref) !== 'audio') return;
        token.dataset.kind = 'audio';
        const oldLabel = token.querySelector('span:last-child')?.textContent || ref.name || '音频';
        const label = /^@?(?:图片|图)\d*$/.test(oldLabel.trim()) ? '@音频' : oldLabel;
        // Legacy rich drafts can contain an image preview for an audio URL.
        if(label !== oldLabel || token.querySelector('img,video') || !token.querySelector('.smart-ref-symbol svg')){
            token.innerHTML = `${smartReferencePreviewHtml(ref)}<span>${escapeHtml(label)}</span>`;
        }
        token.classList.toggle('smart-ref-unsupported', !smartTypedVideoInputs());
        token.title = smartTypedVideoInputs() ? (ref.name || '音频素材') : '音频仅用于视频生成，请切换到视频模式';
    });
}

function renderInputThumbsRow(node){
    if(!inputThumbsRow) return;
    syncSmartAudioReferenceTokens();
    inputThumbsRow.classList.toggle('typed-media-inputs', smartTypedVideoInputs());
    if(smartTypedVideoInputs()) return renderSmartMediaGroups(node);
    delete inputThumbsRow._smartRefRenderKey;
    const allRefs = node ? visibleReferenceImagesFor(node) : [];
    const audioRefs = allRefs.filter(isAudioMediaItem);
    const dedup = allRefs.filter(ref => !isAudioMediaItem(ref));
    inputThumbsRow.classList.toggle('has-items', allRefs.length > 0);
    if(!allRefs.length){ inputThumbsRow.innerHTML = ''; return; }
    const thumbsHtml = dedup.map((img, i) => {
        const isVid = isVideoMediaItem(img);
        const isSelf = node ? isSelfReferenceForNode(node, img) : false;
        const title = isSelf
            ? '自身，默认参与编辑'
            : (smartImageMode(node) === 'workflow' ? '工作流上游输入' : '上游输入');
        const inner = isVid ? smartVideoPreviewHtml(img, 256, 'draggable="false" alt=""') : smartPreviewImgHtml(img, 256, 'draggable="false"');
        const label = `图${i + 1}`;
        const sourceUrl = img.originalLocalUrl || img.url || '';
        return `<div class="input-thumb ${isSelf ? 'input-self' : ''}" draggable="false" data-thumb-index="${i}" data-node-id="${escapeHtml(img.nodeId || '')}" data-image-index="${img.imageIndex ?? ''}" data-url="${escapeHtml(img.url || '')}" data-source-url="${escapeHtml(sourceUrl)}" title="${escapeHtml(`${img.name || '输入 {n}'.replace('{n}', String(i + 1))} · ${title}`)}">${inner}<span class="input-thumb-label">${escapeHtml(label)}</span></div>`;
    }).join('');
    const audioHtml = audioRefs.length ? `<div class="smart-audio-input-note">${smartReferencePreviewHtml(audioRefs[0])}<span>音频素材仅用于视频生成，图片生成不会使用。</span></div>` : '';
    inputThumbsRow.innerHTML = `${dedup.length ? `<div class="input-thumb-list">${thumbsHtml}${dedup.length > 1 ? `<span class="input-thumb-count">${escapeHtml('{n} 输入图'.replace('{n}', String(dedup.length)))}</span>` : ''}</div>` : ''}${audioHtml}`;
    bindSmartPreviewImageFallbacks(inputThumbsRow);
    bindInputThumbsDrag(node, dedup);
}

function bindInputThumbsDrag(node, items){
    if(!inputThumbsRow) return;
    let thumbDragIndex = -1;
    inputThumbsRow.querySelectorAll('.input-thumb').forEach(el => {
        const index = Number(el.dataset.thumbIndex || -1);
        const canReorder = items.length > 1 && Boolean(items[index]?.nodeId);
        el.draggable = canReorder;
        el.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
        });
        if(!canReorder) return;
        el.addEventListener('dragstart', e => {
            e.stopPropagation();
            thumbDragIndex = index;
            el.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('application/x-smart-input-thumb', String(index));
        });
        el.addEventListener('dragend', e => {
            e.stopPropagation();
            thumbDragIndex = -1;
            clearInputThumbDropMarkers();
            el.classList.remove('dragging');
        });
        el.addEventListener('dragover', e => {
            const rawFrom = e.dataTransfer.getData('application/x-smart-input-thumb');
            const from = rawFrom === '' ? thumbDragIndex : Number(rawFrom);
            if(!Number.isFinite(from) || from < 0 || from === index || !items[index]?.nodeId) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            clearInputThumbDropMarkers();
            const placement = inputThumbDropPlacement(el, e);
            el.dataset.dropPlacement = placement;
            el.classList.add(placement === 'before' ? 'drop-before' : 'drop-after');
        });
        el.addEventListener('dragleave', e => {
            if(el.contains(e.relatedTarget)) return;
            delete el.dataset.dropPlacement;
            el.classList.remove('drop-before', 'drop-after');
        });
        el.addEventListener('drop', e => {
            const rawFrom = e.dataTransfer.getData('application/x-smart-input-thumb');
            const from = rawFrom === '' ? thumbDragIndex : Number(rawFrom);
            if(!Number.isFinite(from) || from < 0 || from === index || !items[index]?.nodeId) return;
            e.preventDefault();
            e.stopPropagation();
            const placement = inputThumbDropPlacement(el, e);
            clearInputThumbDropMarkers();
            reorderInputThumb(node, items, from, index, placement);
        });
    });
}

function inputThumbDropPlacement(el, event){
    const rect = el.getBoundingClientRect();
    return event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
}

function clearInputThumbDropMarkers(){
    inputThumbsRow?.querySelectorAll('.input-thumb.drop-before,.input-thumb.drop-after,.input-thumb.dragging')
        .forEach(el => {
            delete el.dataset.dropPlacement;
            el.classList.remove('drop-before', 'drop-after', 'dragging');
        });
}

function bindInputThumbVideoActions(){
    inputThumbsRow?.querySelectorAll('[data-manual-video-url]').forEach(btn => {
        btn.onclick = async event => {
            event.preventDefault();
            event.stopPropagation();
            try {
                await setCurrentSmartManualVideoUrl();
            } catch(e) {
                toast((e.message || '设置视频网址失败').slice(0, 180));
            }
        };
    });
    inputThumbsRow?.querySelectorAll('[data-temp-sh-upload-video]').forEach(btn => {
        btn.onclick = async event => {
            event.preventDefault();
            event.stopPropagation();
            try {
                await uploadCurrentSmartVideosToCloud();
            } catch(e) {
                toast((e.message || '云端上传失败').slice(0, 180));
            }
        };
    });
}

function movedBeforeAfterIds(ids, movedId, targetId, placement='before'){
    const list = (ids || []).filter(Boolean);
    const from = list.indexOf(movedId);
    const target = list.indexOf(targetId);
    if(from < 0 || target < 0 || movedId === targetId) return list;
    const [moved] = list.splice(from, 1);
    let insertAt = list.indexOf(targetId);
    if(insertAt < 0) return ids || [];
    if(placement === 'after') insertAt += 1;
    list.splice(insertAt, 0, moved);
    return list;
}

function sameOrderedIds(a, b){
    if((a || []).length !== (b || []).length) return false;
    return (a || []).every((id, index) => id === b[index]);
}

function reorderInputSourceNodes(currentNode, movedId, targetId, placement='before'){
    if(!currentNode || !movedId || !targetId || movedId === targetId) return false;
    const sourceNodes = smartImageUsesWorkflowInput(currentNode, smartLoopContext)
        ? workflowInputNodesFor(currentNode)
        : inputNodesFor(currentNode);
    const sourceIds = sourceNodes.map(n => n.id).filter(Boolean);
    if(!sourceIds.includes(movedId) || !sourceIds.includes(targetId)) return false;
    const nextIds = movedBeforeAfterIds(sourceIds, movedId, targetId, placement);
    if(sameOrderedIds(sourceIds, nextIds)) return false;
    const oldExplicitIds = Array.isArray(currentNode.inputNodeIds) ? currentNode.inputNodeIds.filter(Boolean) : [];
    currentNode.inputNodeIds = [
        ...nextIds.filter(id => oldExplicitIds.includes(id)),
        ...oldExplicitIds.filter(id => !nextIds.includes(id))
    ];
    if(canvas && Array.isArray(canvas.connections)){
        const order = new Map(nextIds.map((id, index) => [id, index]));
        const relevantSlots = new Set();
        const relevant = [];
        canvas.connections.forEach((conn, index) => {
            const kind = conn?.kind || 'flow';
            if(conn?.to === currentNode.id && ['input', 'flow'].includes(kind) && order.has(conn.from)){
                relevantSlots.add(index);
                relevant.push({conn, index});
            }
        });
        if(relevant.length){
            relevant.sort((a, b) => (order.get(a.conn.from) - order.get(b.conn.from)) || (a.index - b.index));
            let cursor = 0;
            canvas.connections = canvas.connections.map((conn, index) => relevantSlots.has(index) ? relevant[cursor++].conn : conn);
        }
    }
    return true;
}

function reorderInputThumb(currentNode, items, from, to, placement='before'){
    // items are already sourced from inputImagesFor → multiple source nodes possible.
    // Reorder within a source group's images first; separate input nodes use the
    // current node's input order, with a visual-position swap as a final fallback.
    if(from < 0 || to < 0 || from >= items.length || to >= items.length) return;
    const fromImg = items[from];
    const toImg = items[to];
    if(!fromImg || !toImg) return;
    if(fromImg.nodeId === toImg.nodeId){
        const src = nodes.find(n => n.id === fromImg.nodeId);
        if(!src) return;
        pushUndo();
        const fi = Number(fromImg.imageIndex);
        const ti = Number(toImg.imageIndex);
        if(Number.isFinite(fi) && Number.isFinite(ti) && (src.images || [])[fi]){
            const arr = src.images;
            let insertAt = Math.max(0, Math.min(arr.length, ti + (placement === 'after' ? 1 : 0)));
            const item = arr.splice(fi, 1)[0];
            if(fi < insertAt) insertAt -= 1;
            arr.splice(Math.max(0, Math.min(arr.length, insertAt)), 0, item);
        }
        render();
        scheduleSave();
        return;
    }
    const canReorderSources = currentNode && fromImg.nodeId && toImg.nodeId;
    const a = nodes.find(n => n.id === fromImg.nodeId);
    const b = nodes.find(n => n.id === toImg.nodeId);
    if(!canReorderSources || !a || !b) return;
    pushUndo();
    if(reorderInputSourceNodes(currentNode, fromImg.nodeId, toImg.nodeId, placement)){
        render();
        scheduleSave();
        return;
    }
    // Cross-node fallback: swap X positions of source nodes
    const ax = a.x, ay = a.y;
    a.x = b.x; a.y = b.y;
    b.x = ax; b.y = ay;
    render();
    scheduleSave();
}

function mentionTokenHtml(img){
    if(!img?.url) return '';
    const name = img.alias || img.name || '图片';
    const kind = mediaKindForItem(img);
    const media = smartReferencePreviewHtml(img);
    return `<span class="mention-image-token" contenteditable="false" data-url="${escapeHtml(img.url)}" data-kind="${escapeHtml(kind)}" data-name="${escapeHtml(name)}" data-asset-uris="${escapeAttr(JSON.stringify(img.asset_uris || {}))}" data-node-id="${escapeHtml(img.nodeId || '')}" data-image-index="${escapeHtml(img.imageIndex ?? '')}">${media}<span>${escapeHtml(img.referenceLabel || name)}</span></span>`;
}

function promptHtmlWithMentionTokens(text, refs=[]){
    const value = String(text || '');
    const items = (refs || []).filter(ref => ref?.url && ref?.name).sort((a, b) => String(b.name || '').length - String(a.name || '').length);
    if(!value || !items.length || !value.includes('@')) return '';
    let html = '';
    let index = 0;
    while(index < value.length){
        if(value[index] === '@'){
            const hit = items.find(ref => value.slice(index + 1, index + 1 + String(ref.name || '').length) === String(ref.name || ''));
            if(hit){
                html += mentionTokenHtml(hit);
                index += 1 + String(hit.name || '').length;
                continue;
            }
        }
        html += escapeHtml(value[index]);
        index += 1;
    }
    return html;
}

function mentionCandidateImages(node, source=mentionSource){
    return source === 'asset' ? assetMentionCandidateImages(mentionAssetCategoryId) : inputMentionCandidateImages(node);
}

function closeMentionPicker(){
    mentionPicker.classList.remove('open');
    mentionPicker.innerHTML = '';
}

function saveMentionRange(){
    const sel = window.getSelection();
    if(sel && sel.rangeCount && promptInput.contains(sel.anchorNode)){
        mentionRange = sel.getRangeAt(0).cloneRange();
    }
}

function textBeforeCaret(){
    const sel = window.getSelection();
    if(!sel || !sel.rangeCount || !promptInput.contains(sel.anchorNode)) return '';
    const range = sel.getRangeAt(0).cloneRange();
    range.selectNodeContents(promptInput);
    range.setEnd(sel.anchorNode, sel.anchorOffset);
    return range.toString();
}

function updateMentionPicker(source){
    const before = smartAssetPanel.state;
    const hasInput = inputMentionCandidateImages(selectedNode()).length > 0;
    const hasAssets = prepareSmartMentionSelection(source, hasInput);
    if(!hasInput && !hasAssets){ closeMentionPicker(); return; }
    if(before.libraryId !== smartAssetPanel.state.libraryId || before.categoryId !== smartAssetPanel.state.categoryId) renderAssetLibrary();
    renderMentionPicker({hasInput, hasAssets});
}

function renderMentionPicker({hasInput, hasAssets}){
    const node = selectedNode();
    const inputItems = inputMentionCandidateImages(node);
    const assetLibs = assetLibraries();
    const nextAssetCats = assetCategories('image');
    const currentAssetCat = assetCategoryForMention();
    const assetItems = assetMentionCandidateImages(currentAssetCat?.id || '');
    const available = mentionSource === 'asset' ? assetItems : inputItems;
    const candidates = smartTypedVideoInputs()
        ? ['image','audio','video'].flatMap(kind => available.filter(ref => mediaKindForItem(ref) === kind).slice(0, 36))
        : available.slice(0, 36);
    const labels = smartTypedVideoInputs() ? smartMediaReferencePlan(node, defaultReferenceImagesFor(node), collectPromptParts()).aliases : new Map();
    const optionHtml = (img, i) => `
            <button class="mention-option" type="button" data-mention-index="${i}">
                ${smartReferencePreviewHtml(img)}
                <span title="${escapeAttr(img.name || '')}">${escapeHtml(labels.get(smartMediaRefKey(img)) || img.alias)}</span>
            </button>`;
    const body = !candidates.length ? `<div class="mention-empty">${escapeHtml('没有可引用的图片')}</div>` : smartTypedVideoInputs()
        ? ['image','audio','video'].map(kind => {
            const items = candidates.map((img,i) => ({img,i})).filter(({img}) => mediaKindForItem(img) === kind);
            return items.length ? `<section class="mention-media-group mention-media-group-${kind}"><div class="smart-ref-heading">${{image:'图片',audio:'音频',video:'视频'}[kind]}</div><div class="mention-option-grid">${items.map(({img,i}) => optionHtml(img,i)).join('')}</div></section>` : '';
        }).join('') : `<div class="mention-option-grid">${candidates.map(optionHtml).join('')}</div>`;
    const librarySelect = (mentionSource === 'asset' && assetLibs.length)
        ? `<label class="mention-library-row"><span>${escapeHtml('资产库')}</span><select class="mention-library-select" data-mention-library>${assetLibs.map(lib => `<option value="${escapeHtml(lib.id)}" ${lib.id === smartAssetPanel.state.libraryId ? 'selected' : ''}>${escapeHtml(lib.name || '资产库')}</option>`).join('')}</select></label>`
        : '';
    const folderChips = (mentionSource === 'asset' && nextAssetCats.length)
        ? nextAssetCats.map(cat => {
            const label = cat.name || '新文件夹';
            return `<button class="mention-folder-chip ${cat.id === mentionAssetCategoryId ? 'active' : ''}" type="button" data-mention-folder="${escapeHtml(cat.id)}" title="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
          }).join('')
        : '';
    mentionPicker.innerHTML = `
        <div class="mention-picker-shell">
            <div class="mention-source-tabs">
                <button class="mention-source-tab ${mentionSource === 'input' ? 'active' : ''}" type="button" data-mention-source="input" title="${escapeHtml('输入图')}" ${hasInput ? '' : 'disabled'}>
                    <i data-lucide="image"></i><span>${escapeHtml('输入图')}</span>
                </button>
                <button class="mention-source-tab ${mentionSource === 'asset' ? 'active' : ''}" type="button" data-mention-source="asset" title="${escapeHtml('资产库')}" ${hasAssets ? '' : 'disabled'}>
                    <i data-lucide="library"></i><span>${escapeHtml('资产库')}</span>
                </button>
            </div>
            ${librarySelect}
            <div class="mention-folder-chips ${folderChips ? '' : 'hidden'}">
                ${folderChips}
            </div>
            <div class="mention-content">
                ${body}
            </div>
        </div>
    `;
    mentionPicker._items = candidates;
    bindSmartPreviewImageFallbacks(mentionPicker);
    positionMentionPickerAtCaret();
    mentionPicker.classList.add('open');
    mentionPicker.querySelectorAll('[data-mention-source]').forEach(btn => {
        btn.addEventListener('mousedown', e => {
            e.preventDefault(); e.stopPropagation();
            if(btn.disabled) return;
            updateMentionPicker(btn.dataset.mentionSource);
        });
    });
    mentionPicker.querySelectorAll('[data-mention-library]').forEach(select => {
        select.addEventListener('mousedown', e => e.stopPropagation());
        select.addEventListener('change', e => {
            smartAssetPanel.selectLibrary(e.target.value || '', {source:'mention'});
        });
    });
    mentionPicker.querySelectorAll('[data-mention-folder]').forEach(btn => {
        btn.addEventListener('mousedown', e => {
            e.preventDefault(); e.stopPropagation();
            selectSmartMentionCategory(btn.dataset.mentionFolder || '');
        });
    });
    mentionPicker.querySelectorAll('[data-mention-index]').forEach(btn => {
        btn.addEventListener('mousedown', e => {
            e.preventDefault(); e.stopPropagation();
            insertMentionToken(mentionPicker._items[Number(btn.dataset.mentionIndex)]);
        });
    });
    refreshIcons();
}

function showMentionPicker(){
    const node = selectedNode();
    const hasInput = inputMentionCandidateImages(node).length > 0;
    mentionSource = hasInput ? 'input' : 'asset';
    updateMentionPicker(mentionSource);
}

function positionMentionPickerAtCaret(){
    const row = promptInput.closest('.prompt-row');
    const rowRect = row.getBoundingClientRect();
    let caretRect = null;
    const sel = window.getSelection();
    if(sel && sel.rangeCount){
        const range = sel.getRangeAt(0).cloneRange();
        caretRect = range.getClientRects()[0] || range.getBoundingClientRect();
    }
    const inputRect = promptInput.getBoundingClientRect();
    // composer 在 world 里被 viewport.scale 缩放过，getBoundingClientRect 返回的是缩放后的屏幕像素，
    // 而 style.left/top 是逻辑像素 → 需要除以 scale 才能正确还原 caret 的逻辑坐标
    const scale = (typeof viewport !== 'undefined' && Number(viewport?.scale)) || 1;
    const safeScale = scale > 0 ? scale : 1;
    const rowLogicalWidth = rowRect.width / safeScale;
    const pickerWidth = mentionPicker.offsetWidth || 340;
    const maxLeft = Math.max(4, rowLogicalWidth - pickerWidth - 4);
    const rawLeft = ((caretRect?.left || inputRect.left) - rowRect.left) / safeScale - 6;
    const rawTop = ((caretRect?.bottom || inputRect.top + 24) - rowRect.top) / safeScale + 2;
    const left = Math.max(4, Math.min(rawLeft, maxLeft));
    const top = Math.max(2, rawTop);
    mentionPicker.style.left = `${left}px`;
    mentionPicker.style.top = `${top}px`;
}

function maybeOpenMentionPicker(){
    saveMentionRange();
    const before = textBeforeCaret();
    if(/@$/.test(before)) showMentionPicker();
    else closeMentionPicker();
}

function insertMentionToken(img){
    if(!img?.url) return;
    promptInput.focus();
    const sel = window.getSelection();
    if(mentionRange && promptInput.contains(mentionRange.commonAncestorContainer)){
        sel.removeAllRanges();
        sel.addRange(mentionRange);
    }
    const range = sel.rangeCount && promptInput.contains(sel.getRangeAt(0).commonAncestorContainer) ? sel.getRangeAt(0) : document.createRange();
    if(!promptInput.contains(range.commonAncestorContainer)){
        range.selectNodeContents(promptInput);
        range.collapse(false);
    }
    let removedAt = false;
    if(range.startContainer?.nodeType === Node.TEXT_NODE && range.startOffset > 0){
        const text = range.startContainer.textContent || '';
        if(text[range.startOffset - 1] === '@'){
            range.setStart(range.startContainer, range.startOffset - 1);
            range.deleteContents();
            removedAt = true;
        }
    }
    if(!removedAt) {
        const walker = document.createTreeWalker(promptInput, NodeFilter.SHOW_TEXT);
        let lastText = null;
        while(walker.nextNode()) lastText = walker.currentNode;
        if(lastText && /@$/.test(lastText.textContent || '')) {
            lastText.textContent = lastText.textContent.slice(0, -1);
            range.selectNodeContents(promptInput);
            range.collapse(false);
        }
    }
    const token = document.createElement('span');
    token.className = 'mention-image-token';
    token.contentEditable = 'false';
    token.dataset.url = img.url;
    token.dataset.name = img.alias || img.name || '图片';
    token.dataset.kind = mediaKindForItem(img);
    token.dataset.nodeId = img.nodeId || '';
    token.dataset.imageIndex = String(img.imageIndex ?? '');
    token.dataset.assetUris = JSON.stringify(img.asset_uris || {});
    token.innerHTML = `${smartReferencePreviewHtml(img)}<span>${escapeHtml(img.referenceLabel || token.dataset.name)}</span>`;
    range.insertNode(token);
    bindSmartPreviewImageFallbacks(token);
    const spacer = document.createTextNode(' ');
    token.after(spacer);
    range.setStartAfter(spacer);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    closeMentionPicker();
    promptInput.focus();
    renderInputThumbsRow(selectedNode());
}

function updateSelectionBox(event){
    if(!selectionState) return;
    const sx = selectionState.startScreen.x, sy = selectionState.startScreen.y;
    const x = Math.min(sx, event.clientX), y = Math.min(sy, event.clientY);
    selectionBox.style.display = 'block';
    selectionBox.style.left = `${x}px`;
    selectionBox.style.top = `${y}px`;
    selectionBox.style.width = `${Math.abs(event.clientX - sx)}px`;
    selectionBox.style.height = `${Math.abs(event.clientY - sy)}px`;
}

function finishSelection(event){
    if(!selectionState) return;
    const a = selectionState.startWorld;
    const b = screenToWorld(event);
    const minX = Math.min(a.x, b.x), minY = Math.min(a.y, b.y);
    const maxX = Math.max(a.x, b.x), maxY = Math.max(a.y, b.y);
    const ids = nodes.filter(node => {
        const r = nodeRect(node);
        return r.x < maxX && r.x + r.width > minX && r.y < maxY && r.y + r.height > minY;
    }).map(n => n.id);
    smartSelection.boxSelection(ids);
    selectionState = null;
    selectionJustFinished = true;
    selectionBox.style.display = 'none';
    render();
    setTimeout(() => { selectionJustFinished = false; }, 0);
}

function closeCreateMenu({restoreFocus=false}={}){
    createMenu?.classList.remove('open');
    if(createMenu) createMenu._connection = null;
    if(restoreFocus && createMenu?._previousFocus?.isConnected)createMenu._previousFocus.focus();
}

function openCreateMenu(event, {connection=null}={}){
    if(!createMenu || !canvas || isSmartCanvasLocked()) return;
    createMenuPoint = screenToWorld(event);
    createMenu._connection = connection;
    const allowed=connection?pixmaxConnectionMenuTypes(nodes.find(node=>node.id===connection.fromId),connection.fromPort):null;
    createMenu.setAttribute('aria-label', connection ? '连接生成节点' : '新建节点');
    createMenu.querySelectorAll('[data-create-type]').forEach(item => {
        const kind = item.dataset.createType;
        item.hidden = Boolean(allowed&&!allowed.has(kind));
        if(kind === 'generate-image' || kind === 'generate-video'){
            item.querySelector('.create-card-title').textContent = kind === 'generate-image'
                ? '图像节点' : '视频节点';
        }
    });
    if(!createMenu.classList.contains('open'))createMenu._previousFocus=document.activeElement;
    createMenu.classList.add('open');
    refreshIcons();
    const {width:w,height:h}=createMenu.getBoundingClientRect();
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, event.clientX + 4));
    const top = Math.max(12, Math.min(window.innerHeight - h - 12, event.clientY + 4));
    createMenu.style.left = `${left}px`;
    createMenu.style.top = `${top}px`;
    createMenu.querySelector('[role="menuitem"]:not([hidden])')?.focus({preventScroll:true});
}

function createNodeFromMenu(type){
    if(isSmartCanvasLocked()){ closeCreateMenu(); return; }
    const point = createMenuPoint || viewportCenter();
    const connection = createMenu?._connection;
    // Native menus place the top-left corner at the clicked flow position.
    // A dangling connection keeps the original 240px by 120px handle offsets.
    const origin={x:point.x-(connection?.fromPort==='in'?240:0),y:point.y-(connection?120:0)};
    const kind={prompt:'text','generate-image':'image','generate-video':'video'}[type]||type;
    const [width,height]=window.PixmaxCanvasAssets.sizes[kind]||[200,200];
    const p={x:origin.x+width/2,y:origin.y+height/2};
    closeCreateMenu();
    closeSmartCanvasContext();
    if(connection){
        const owner=nodes.find(node=>node.id===connection.fromId);
        if(!owner||!pixmaxConnectionMenuTypes(owner,connection.fromPort).has(type))return;
        pushUndo();
        const options={select:false,skipUndo:true};
        const node = type==='prompt' ? createPromptNode(origin.x,origin.y,options)
            : ['director','editor','storyboard','audio','model'].includes(type) ? createSmartStudioNode(type,p,options)
            : createGenerationNodeAt(p,type==='generate-video'?'video':'image',options);
        const fromId = connection.fromPort === 'out' ? connection.fromId : node.id;
        const toId = connection.fromPort === 'out' ? node.id : connection.fromId;
        connectInputNode(fromId, toId);
        smartSelection.createdNode(node.id);
        render();
        scheduleSave();
        if(node.type==='smart-image')promptInput.focus({preventScroll:true});
        return node;
    }
    if(type === 'prompt') return createPromptNode(origin.x, origin.y);
    if(type === 'loop') return createLoopNode(p.x - 135, p.y - 95);
    if(type === 'generate-image') return createGenerationNodeAt(p, 'image');
    if(type === 'generate-video') return createGenerationNodeAt(p, 'video');
    if(['director','editor','storyboard','audio','model'].includes(type)) return createSmartStudioNode(type,p);
    return createImageNodeAt(p);
}

// Permission changes must cancel mouse sessions too: the mouseup may arrive
// after viewing starts, or even after a new editing lease has been obtained.
function cancelSmartNodeGestures(){
    if(isSmartCanvasLocked() && smartStudioSession)closeSmartStudio();
    const active = Boolean(portDragState || dragState || resizeState || thumbDragState);
    if(!active){ closeCreateMenu(); return; }
    restoreDraggedNodePosition();
    const resize = resizeState;
    if(resize){
        const node = nodes.find(n => n.id === resize.id);
        const original = pendingUndoSnapshot?.nodes.find(n => n.id === resize.id);
        if(node && original){
            for(const key of ['w','h','scale']){
                if(Object.prototype.hasOwnProperty.call(original,key)) node[key] = original[key];
                else delete node[key];
            }
        }
    }
    portDragState = dragState = resizeState = thumbDragState = null;
    discardPendingUndo();
    document.body.classList.remove('smart-node-drag','smart-node-resize');
    shell.classList.remove('port-dragging');
    clearPortDragVisual(); clearDropHighlight(); setAssetDragOver(false);
    closeCreateMenu(); render();
}

// Called once by smart-canvas.js, at its original initialization position.
function bindSmartWorkspaceGestures(){
    shell.addEventListener('mousedown', e => {
        if(!zoomPreviewState) return;
        if(e.button !== 0) return;
        if(e.target.closest('.composer,.smart-nav,.asset-panel,.asset-toggle,.smart-backup-toggle,.smart-log-toggle,.smart-cost-toggle,.smart-shortcut-toggle,.smart-workflow-toggle,.log-modal,.shortcut-modal,.image-edit-modal,.smart-audio-lightbox,.create-menu,.smart-minimap')) return;
        e.preventDefault();
        e.stopPropagation();
    }, true);
    shell.addEventListener('click', e => {
        if(!zoomPreviewState) return;
        if(e.button !== 0) return;
        if(e.target.closest('.composer,.smart-nav,.asset-panel,.asset-toggle,.smart-backup-toggle,.smart-log-toggle,.smart-cost-toggle,.smart-shortcut-toggle,.smart-workflow-toggle,.log-modal,.shortcut-modal,.image-edit-modal,.smart-audio-lightbox,.create-menu,.smart-minimap')) return;
        e.preventDefault();
        e.stopPropagation();
        const nodeEl = e.target.closest('.image-node');
        if(nodeEl?.dataset?.id) exitZoomPreviewToNode(nodeEl.dataset.id);
        else exitZoomPreview(screenToWorld(e));
    }, true);
    shell.onmousedown = e => {
        if(zoomPreviewState && e.button === 0 && !e.target.closest('.composer,.smart-nav,.asset-panel,.asset-toggle,.smart-backup-toggle,.smart-log-toggle,.smart-cost-toggle,.smart-shortcut-toggle,.smart-workflow-toggle,.log-modal,.shortcut-modal,.image-edit-modal,.smart-audio-lightbox,.create-menu,.smart-minimap')) return;
        if(e.target.closest('.composer,.smart-nav,.smart-top-tools,.asset-panel,.asset-toggle,.smart-backup-toggle,.smart-log-toggle,.smart-cost-toggle,.smart-shortcut-toggle,.smart-workflow-toggle,.log-modal,.shortcut-modal,.smart-audio-lightbox,.create-menu,.smart-minimap,.pixmax-context-menu')) return;
        if(e.target.closest('.image-node') && shell.dataset.tool !== 'pan'&&!pixmaxSpacePanning)return;
        closeCreateMenu();
        if(e.button === 0 && isRKeyDown){
            e.preventDefault();
            didPan = false;
            selectionState = {startScreen:{x:e.clientX, y:e.clientY}, startWorld:screenToWorld(e)};
            updateSelectionBox(e);
            return;
        }
        if(e.button === 0 && (e.ctrlKey || e.metaKey)){
            e.preventDefault();
            didPan = false;
            selectionState = {startScreen:{x:e.clientX, y:e.clientY}, startWorld:screenToWorld(e)};
            updateSelectionBox(e);
            return;
        }
        if(e.button !== 0 && e.button !== 1) return;
        if(e.button===0 && shell.dataset.tool!=='pan' && !pixmaxSpacePanning && !e.altKey && !isSmartCanvasLocked()){
            e.preventDefault();didPan=false;
            selectionState={startScreen:{x:e.clientX,y:e.clientY},startWorld:screenToWorld(e)};
            updateSelectionBox(e);return;
        }
        e.preventDefault();
        didPan = false;
        panState = {button:e.button, startX:e.clientX, startY:e.clientY, ox:viewport.x, oy:viewport.y};
        shell.classList.add('panning');
    };
    shell.oncontextmenu = e => {
        if((e.ctrlKey || e.metaKey) || isRKeyDown){
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        if(e.target.closest('.composer,.smart-nav,.smart-top-tools,.asset-panel,.create-menu,.pixmax-context-menu,.smart-minimap,textarea,input'))return;
        e.preventDefault();openSmartCanvasContext(e,nodes.find(node=>node.id===e.target.closest('.image-node')?.dataset.id));
    };
    shell.ondblclick = e => {
        if(didPan || e.ctrlKey || e.metaKey || e.shiftKey || isRKeyDown) return;
        if(e.target.closest('.image-node,.composer,.smart-nav,.smart-top-tools,.asset-panel,.asset-toggle,.smart-backup-toggle,.smart-log-toggle,.smart-cost-toggle,.smart-shortcut-toggle,.smart-workflow-toggle,.log-modal,.shortcut-modal,.image-edit-modal,.smart-audio-lightbox,.create-menu,.smart-minimap,.local-depth-backdrop'))return;
        if(smartImageEditor.state.open) return;
        e.preventDefault();
        e.stopPropagation();
        if(zoomPreviewState || isSmartCanvasLocked()){closeCreateMenu();return;}
        openCreateMenu(e);
    };
    shell.onclick = e => {
        if(e.target.closest('.pixmax-context-menu'))return;
        // Releasing a dragged port also emits a click on the blank canvas.
        // Later pointerdowns dismiss the menu before reaching this handler.
        if(createMenu?._connection) return;
        if(selectionJustFinished) return;
        if(didPan || e.target.closest('.image-node,.composer,.smart-nav,.smart-top-tools,.asset-panel,.asset-toggle,.smart-backup-toggle,.smart-log-toggle,.smart-cost-toggle,.smart-shortcut-toggle,.smart-workflow-toggle,.log-modal,.shortcut-modal,.image-edit-modal,.smart-audio-lightbox,.create-menu,.smart-minimap')) return;
        if(smartImageEditor.state.open) return;
        closeCreateMenu();
        clearSelection();
        render();
    };
    smartMinimap.bind();
    window.onmousemove = e => {
        lastMouseWorld = screenToWorld(e);
        if(isSmartCanvasLocked()) cancelSmartNodeGestures();
        if(smartMinimap.move(e)) return;
        if(portDragState){
            e.preventDefault();
            const p = screenToWorld(e);
            portDragState.currentWorld = p;
            portDragState.moved = true;
            const hitEl = document.elementFromPoint(e.clientX, e.clientY);
            const portEl = hitEl?.closest?.('.node-port');
            const nodeEl = portEl?.closest?.('.image-node') || hitEl?.closest?.('.image-node');
            let targetId = '', targetPort = '';
            if(nodeEl && nodeEl.dataset.id && nodeEl.dataset.id !== portDragState.fromId){
                targetId = nodeEl.dataset.id;
                if(portEl){
                    targetPort = portEl.dataset.port;
                } else {
                    const rect = nodeEl.getBoundingClientRect();
                    targetPort = (e.clientX - rect.left) < rect.width / 2 ? 'in' : 'out';
                }
                const compatible = (portDragState.fromPort === 'out' && targetPort === 'in') || (portDragState.fromPort === 'in' && targetPort === 'out');
                if(!compatible){ targetId = ''; targetPort = ''; }
            }
            portDragState.hoverTargetId = targetId;
            portDragState.hoverPort = targetPort;
            updatePortDragVisual();
            return;
        }
        if(promptResizeState){
            e.preventDefault();
            const dy = e.clientY - promptResizeState.startY;
            settings.promptH = Math.max(60, Math.min(380, promptResizeState.startH + dy));
            promptInput.style.setProperty('--prompt-h', `${settings.promptH}px`);
            persistActiveSmartSettings();
            return;
        }
        if(selectionState){
            e.preventDefault();
            updateSelectionBox(e);
            return;
        }
        if(smartPreviewGestures.moveCompare(e)) return;
        if(smartPanoramaPreview.moveDrag(e))return;
        if(smartPreviewGestures.movePan(e)) return;
        if(smartImageEditor.moveWindowGesture(e)) return;
        if(resizeState){
            const node = nodes.find(n => n.id === resizeState.id);
            if(!node) return;
            const dx = (e.clientX - resizeState.startX) / viewport.scale;
            const dy = (e.clientY - resizeState.startY) / viewport.scale;
            const minW = node.type === 'smart-prompt' ? 240 : node.type === 'smart-loop' ? 252 : 48;
            const minH = node.type === 'smart-prompt' ? 240 : node.type === 'smart-loop' ? 132 : 48;
            node.w = Math.max(minW, Math.round(resizeState.startW + dx));
            node.h = Math.max(minH, Math.round(resizeState.startH + dy));
            node.scale = 1;
            updateNodeElementDuringResize(node);
            return;
        }
        if(thumbDragState){
            const dx = e.clientX - thumbDragState.startX;
            const dy = e.clientY - thumbDragState.startY;
            const source = nodes.find(n => n.id === thumbDragState.nodeId);
            if(!thumbDragState.detached && Math.abs(dx) + Math.abs(dy) > 6){
                if(source && (source.images || []).length > 1){
                    const img = source.images[thumbDragState.imgIndex];
                    if(img){
                        commitPendingUndo();
                        undoSuppressed = true;
                        applyNodeMetaToImage(img, source);
                        source.images.splice(thumbDragState.imgIndex, 1);
                        if(source.images.length <= 1){
                            source.title = 'Image';
                            delete source.w; delete source.h;
                            inheritNodeMetaFromImage(source);
                        }
                        const point = screenToWorld(e);
                        smartSelection.thumbDetached();
                        const newNode = createImageNodeAt(point, [img], {select:false, skipUndo:true});
                        undoSuppressed = false;
                        dragState = {id:newNode.id, startX:e.clientX, startY:e.clientY, ox:newNode.x, oy:newNode.y, thumbDetached:true};
                        thumbDragState.detached = true;
                        render();
                    }
                }
            }
            if(thumbDragState.detached) thumbDragState = null;
            else return;
        }
        if(panState){
            const dx = e.clientX - panState.startX;
            const dy = e.clientY - panState.startY;
            if(Math.abs(dx) + Math.abs(dy) > 3) didPan = true;
            viewport.x = panState.ox + dx;
            viewport.y = panState.oy + dy;
            applyViewport();
            return;
        }
        if(!dragState) return;
        const node = nodes.find(n => n.id === dragState.id);
        if(!node) return;
        const moveDx = (e.clientX - dragState.startX) / viewport.scale;
        const moveDy = (e.clientY - dragState.startY) / viewport.scale;
        (dragState.group || [{id:dragState.id, ox:dragState.ox, oy:dragState.oy}]).forEach(item => {
            const n = nodes.find(x => x.id === item.id);
            if(!n) return;
            const snap = typeof pixmaxSnapToGrid !== 'undefined' && pixmaxSnapToGrid;
            const dx=snap ? Math.round((dragState.ox+moveDx)/20)*20-dragState.ox : moveDx;
            const dy=snap ? Math.round((dragState.oy+moveDy)/20)*20-dragState.oy : moveDy;
            n.x = item.ox + dx;
            n.y = item.oy + dy;
        });
        if(smartAssetPanel.state.open){
            const hit = document.elementFromPoint(e.clientX, e.clientY);
            if(hit && smartAssetPanel.contains(hit)){
                setAssetDragOver(true);
                clearDropHighlight();
                setAssetDragOver(true);
                return;
            }
            setAssetDragOver(false);
        }
        const draggedRect = nodeRect(node);
        const target = (dragState.ctrlGroup || ['smart-image','smart-prompt','smart-loop'].includes(node.type))
            ? (['smart-prompt','smart-loop'].includes(node.type)
                ? dragConnectTargetFor(node, screenToWorld(e))
                : rectOverlapNode(node.id, draggedRect.x, draggedRect.y, draggedRect.width, draggedRect.height, dragState.groupIds))
            : null;
        setDropHighlight(target?.id || '');
        moveNodeElementsDuringDrag();
        updateLoopInsertPreview();
        if(target) setDropHighlight(target.id);
    };
    window.onmouseup = e => {
        if(isSmartCanvasLocked()) cancelSmartNodeGestures();
        document.body.classList.remove('smart-node-drag');
        document.body.classList.remove('smart-node-resize');
        if(portDragState){
            const drag = portDragState;
            portDragState = null;
            shell.classList.remove('port-dragging');
            clearPortDragVisual();
            handlePortDrop(drag, e);
            return;
        }
        if(promptResizeState){ promptResizeState = null; scheduleSave(); }
        if(selectionState) finishSelection(e);
        smartPreviewGestures.endCompare();
        smartPanoramaPreview.endDrag();
        smartPreviewGestures.endPan();
        smartImageEditor.endWindowGesture();
        if(resizeState){
            const node = nodes.find(n => n.id === resizeState.id);
            const rect = node ? nodeRect(node) : null;
            const changed = rect && (Math.abs(rect.width - resizeState.startW) > 1 || Math.abs(rect.height - resizeState.startH) > 1);
            if(changed){
                commitPendingUndo();
            } else { discardPendingUndo(); }
            resizeState = null;
            if(changed) render();
            scheduleSave();
        }
        if(thumbDragState){
            if(!thumbDragState.detached) discardPendingUndo();
            thumbDragState = null;
        }
        if(panState) {
            panState = null;
            shell.classList.remove('panning');
            scheduleSave();
            setTimeout(() => { didPan = false; }, 0);
        }
        smartMinimap.endDrag();
        if(dragState){
            const draggedNode = nodes.find(n => n.id === dragState.id);
            if(!dragState.thumbDetached && Math.abs(e.clientX-dragState.startX)+Math.abs(e.clientY-dragState.startY)<=3){
                dragState=null;discardPendingUndo();clearDropHighlight();scheduleSave();return;
            }
            let stateChanged = false;
            const hit = document.elementFromPoint(e.clientX, e.clientY);
            const droppedOnAssetPanel = smartAssetPanel.state.open && hit && smartAssetPanel.contains(hit);
            if(droppedOnAssetPanel && draggedNode && (draggedNode.images || []).length){
                const imagesToSave = (draggedNode.images || []).filter(img => img?.url);
                imagesToSave.forEach(img => addUrlToAssetLibrary(img.url, img.name || draggedNode.title || 'image'));
                (dragState.group || [{id:dragState.id, ox:dragState.ox, oy:dragState.oy}]).forEach(item => {
                    const n = nodes.find(x => x.id === item.id);
                    if(n){ n.x = item.ox; n.y = item.oy; }
                });
                setAssetDragOver(false);
                discardPendingUndo();
                clearDropHighlight();
                dragState = null;
                document.body.classList.remove('smart-node-drag');
                render();
                scheduleSave();
                return;
            }
            const autoTarget = draggedNode ? dragConnectTargetFor(draggedNode, screenToWorld(e)) : null;
            // Original canvas overlaps only move cards. Connections are made through handles.
            if(draggedNode?.type!=='smart-loop'){
                commitPendingUndo();clearDropHighlight();dragState=null;
                suppressNodeClickUntil=Date.now()+180;render();scheduleSave();return;
            }
            const insertHit = draggedNode?.type === 'smart-loop' && dragState.ctrlGroup && (dragState.group || []).length <= 1
                ? insertionConnectionForNode(draggedNode)
                : null;
            const draggedRect = draggedNode ? nodeRect(draggedNode) : null;
            const groupTarget = draggedNode && (draggedNode.images || []).length && (dragState.group || []).length <= 1 && draggedRect
                ? rectOverlapNode(draggedNode.id, draggedRect.x, draggedRect.y, draggedRect.width, draggedRect.height, dragState.groupIds)
                : null;
            if(
                insertHit &&
                insertLoopNodeIntoConnection(draggedNode, insertHit)
            ){
                stateChanged = true;
                render();
            } else if(
                groupTarget &&
                (groupTarget.images || []).length > 1 &&
                mergeImageNodesIntoGroup(draggedNode.id, groupTarget.id)
            ){
                stateChanged = true;
                render();
            } else if(
                draggedNode &&
                autoTarget &&
                !dragState.ctrlGroup &&
                (dragState.group || []).length <= 1 &&
                canAutoConnectDraggedNode(draggedNode, autoTarget) &&
                connectInputNode(draggedNode.id, autoTarget.id)
            ){
                stateChanged = true;
                restoreDraggedNodePosition();
                smartSelection.primaryReleased(draggedNode.id);
                render();
            } else if(draggedNode && (draggedNode.images || []).length && (dragState.ctrlGroup || (dragState.group || []).length <= 1)){
                const r = nodeRect(draggedNode);
                const target = rectOverlapNode(draggedNode.id, r.x, r.y, r.width, r.height, dragState.groupIds);
                if(target && (target.images || []).length && (dragState.ctrlGroup || (target.images || []).length > 1)){
                    stateChanged = true;
                    mergeImageNodesIntoGroup(draggedNode.id, target.id);
                    render();
                } else if(target && !dragState.ctrlGroup && (dragState.group || []).length <= 1){
                    stateChanged = true;
                    connectInputNode(draggedNode.id, target.id);
                    if(!dragState.thumbDetached) restoreDraggedNodePosition();
                    smartSelection.primaryReleased(draggedNode.id);
                    render();
                } else if((dragState.group || []).some(item => {
                    const n = nodes.find(x => x.id === item.id);
                    return n && (Math.abs((Number(n.x) || 0) - item.ox) > 1 || Math.abs((Number(n.y) || 0) - item.oy) > 1);
                })){
                    stateChanged = true;
                }
            } else if((dragState.group || []).some(item => {
                const n = nodes.find(x => x.id === item.id);
                return n && (Math.abs((Number(n.x) || 0) - item.ox) > 1 || Math.abs((Number(n.y) || 0) - item.oy) > 1);
            }) || (draggedNode && (Math.abs((draggedNode.x || 0) - dragState.ox) > 1 || Math.abs((draggedNode.y || 0) - dragState.oy) > 1))){
                stateChanged = true;
            }
            if(dragState.thumbDetached) stateChanged = true;
            if(stateChanged) commitPendingUndo();
            else discardPendingUndo();
            if(stateChanged || dragState.thumbDetached) suppressNodeClickUntil = Date.now() + 180;
            clearDropHighlight();
            loopInsertPreview = null;
            dragState = null;
            scheduleSave();
            refreshConnectionLayer();
        }
    };
    shell.addEventListener('wheel', e => {
        if(e.target.closest('.composer,.smart-nav,.smart-top-tools,.pixmax-context-menu,.create-menu,.image-edit-modal,.smart-audio-lightbox,.asset-panel,.asset-toggle,.smart-backup-toggle,.smart-log-toggle,.smart-cost-toggle,.smart-shortcut-toggle,.smart-workflow-toggle,.workflow-transfer-panel,.log-modal,.shortcut-modal,[data-thumb-scroll]')) return;
        e.preventDefault();
        if(!e.ctrlKey&&!e.metaKey){
            const unit=e.deltaMode===1?20:1;
            viewport.x-=(e.shiftKey?e.deltaY:e.deltaX)*unit*.5;
            viewport.y-=e.shiftKey?0:e.deltaY*unit*.5;
            applyViewport();scheduleSave();return;
        }
        const rect = shell.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const before = {x:(sx - viewport.x) / viewport.scale, y:(sy - viewport.y) / viewport.scale};
        const factor = 2 ** (-e.deltaY*(e.deltaMode===1 ? .05 : e.deltaMode ? 1 : .002)*(e.ctrlKey&&/Mac/.test(navigator.platform)?10:1));
        viewport.scale = Math.min(2,Math.max(.1,safeScale(viewport.scale * factor)));
        viewport.x = sx - before.x * viewport.scale;
        viewport.y = sy - before.y * viewport.scale;
        applyViewport();
        scheduleSave();
    }, {passive:false});
    shell.ondragover = e => setSmartDropCopyEffect(e, true);
    shell.ondrop = async e => {
        e.preventDefault();
        if(isSmartCanvasLocked()) return toast('画布正在被其他人编辑，无法操作');
        if(e.target.closest('.image-node')) return;
        const p = screenToWorld(e);
        const payload = await resolveSmartImageDropPayload(e.dataTransfer);
        if(payload.type === 'none') return;
        await handleSmartImageDropPayload(payload, '', {point:p, forceNew:true});
    };
    window.addEventListener('paste', e => {
        if(isSmartCanvasLocked()) return;
        const files = [...(e.clipboardData?.files || [])].filter(isSupportedUploadFile);
        if(files.length){
            lastImagePasteAt = Date.now();
            handleFiles(files, smartSelection.nodeId);
            return;
        }
        // 素材库管理页「复制到画布」过来的素材：Ctrl+V 批量粘贴成图片节点
        if(!isEditableTarget(e.target) && pasteAssetsFromInbox()){
            e.preventDefault();
            return;
        }
        if(nodeClipboard?.nodes?.length && !isEditableTarget(e.target)){
            e.preventDefault();
            pasteNodes({includeConnections:pixmaxPasteWithLinks});pixmaxPasteWithLinks=false;
        }
    });
    window.addEventListener('keydown', e => {
        const key = String(e.key || '').toLowerCase();
        if(e.isComposing||smartStudioSession||document.querySelector('.pixmax-storyboard-modal'))return;
        if((e.ctrlKey||e.metaKey)&&key==='v')pixmaxPasteWithLinks=e.shiftKey;
        if(!isEditableTarget(e.target)){
            if(e.code==='Space'){e.preventDefault();pixmaxSpacePanning=true;shell.classList.add('pixmax-space-pan');return;}
            if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&['v','h'].includes(key)){e.preventDefault();setPixmaxCanvasTool(key==='v'?'select':'pan');return;}
            if((e.ctrlKey||e.metaKey)&&['+','=','-','s'].includes(key)){
                e.preventDefault();if(key==='s')saveCanvas({force:true});else zoomPixmaxCanvas(key==='-'?1/1.2:1.2);return;
            }
        }
        if(isSmartCanvasLocked() && (((e.ctrlKey || e.metaKey) && ['v','z','g'].includes(key)) || ['delete','backspace'].includes(key))) return;
        if(key === 'r' && !isEditableTarget(e.target)) isRKeyDown = true;
        if(smartImageEditor.state.open && smartImageEditor.state.mode === 'preview' && !isEditableTarget(e.target)){
            if(e.key === 'ArrowLeft' || e.key === 'ArrowRight'){
                e.preventDefault();
                if(!seekPreviewVideoFrames(e.key === 'ArrowLeft' ? -1 : 1)){
                    navigatePreviewImage(e.key === 'ArrowLeft' ? -1 : 1);
                }
                return;
            }
        }
        if(!e.ctrlKey && !e.metaKey && !e.altKey && !isEditableTarget(e.target)){
            if(key === 'z'){
                if(e.repeat) return;
                e.preventDefault();
                toggleZoomPreview();
                return;
            }
            if(key === 'a'){
                if(e.repeat) return;
                e.preventDefault();
                toggleAssetLibrary();
                return;
            }
        }
        if((e.ctrlKey || e.metaKey) && key === 'c' && !isEditableTarget(e.target)){
            const selectionText = window.getSelection?.().toString() || '';
            if(selectionText) return;
            e.preventDefault();
            copySelectedNodes();
            return;
        }
        if((e.ctrlKey || e.metaKey) && key === 'v' && !isEditableTarget(e.target) && nodeClipboard?.nodes?.length){
            const requestedAt = Date.now();
            setTimeout(() => {
                if(lastImagePasteAt >= requestedAt) return;
                if(lastNodePasteAt >= requestedAt) return;
                pasteNodes({includeConnections:e.shiftKey});
            }, 90);
        }
        if(e.key === 'Escape' && smartAudioPreview.state.open){
            closeSmartAudioLightbox();
            return;
        }
        if(e.key === 'Escape' && smartImageEditor.state.open){
            closeImageEditor();
            return;
        }
        if((e.ctrlKey || e.metaKey) && key === 'z' && !isEditableTarget(e.target)){
            e.preventDefault();
            if(e.shiftKey)redoSmartCanvas();else performUndo();
            return;
        }
        if((e.ctrlKey || e.metaKey) && key === 'y' && !isEditableTarget(e.target)){
            e.preventDefault();redoSmartCanvas();return;
        }
        if((e.key === 'Delete' || e.key === 'Backspace') && (smartSelection.nodeId || smartSelection.ids.length) && !isEditableTarget(e.target)){
            e.preventDefault();
            const ids = smartSelection.ids.length ? smartSelection.ids.slice() : [smartSelection.nodeId];
            deleteSmartNodes(ids);
        }
        if((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'g' && !isEditableTarget(e.target)){
            e.preventDefault();
            const ids = smartSelection.ids.length ? smartSelection.ids.slice() : (smartSelection.nodeId ? [smartSelection.nodeId] : []);
            const ok = ids.map(id => ungroupNode(id)).some(Boolean);
            if(ok) return;
        }
        if((e.ctrlKey || e.metaKey) && key === 'g' && !e.shiftKey && !isEditableTarget(e.target)){
            e.preventDefault();
            groupSelectedNodes();
        }
    });
    window.addEventListener('keyup', e => {
        if(e.code==='Space'){pixmaxSpacePanning=false;shell.classList.remove('pixmax-space-pan');}
        if(String(e.key || '').toLowerCase() === 'r') isRKeyDown = false;
    });
    window.addEventListener('blur', () => {
        pixmaxSpacePanning=false;shell.classList.remove('pixmax-space-pan');
        isRKeyDown = false;
    });
    engineSelect.onchange = () => {
        settings.engine = engineSelect.value;
        applyRecentSmartSettingsForCurrentMode();
        syncApiKindToggleVisibility();
        renderDynamicParams();
        persistActiveSmartSettings();
        scheduleSave();
    };
}

function syncApiKindToggleVisibility(){
    if(!apiKindToggle) return;
    const kind = smartGenerationKind(selectedNode());
    const heading = document.getElementById('composerHeading');
    if(heading) heading.textContent = kind === 'video' ? '视频生成' : kind === 'image' ? '图片生成' : '生成';
    promptInput?.setAttribute('aria-label', kind === 'video' ? '视频生成提示词' : kind === 'image' ? '图片生成提示词' : '生成提示词');
    apiKindToggle.style.display = !kind && isApiLikeEngine(settings.engine) ? 'inline-flex' : 'none';
    apiKindToggle.querySelectorAll('[data-kind]').forEach(btn => btn.classList.toggle('active', btn.dataset.kind === (settings.apiKind || 'image')));
}

// Called once by smart-canvas.js, at its original initialization position.
function bindSmartComposerInputEvents(){
    document.addEventListener('pointerdown',event=>{if(createMenu?.classList.contains('open') && !createMenu.contains(event.target))closeCreateMenu();},true);
    shell.addEventListener('wheel',()=>closeCreateMenu(),{passive:true});
    createMenu?.addEventListener('keydown',event=>{
        const items=[...createMenu.querySelectorAll('[role="menuitem"]:not([hidden])')];
        const index=items.indexOf(document.activeElement);
        if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
            event.preventDefault();event.stopPropagation();
            const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
            items[next]?.focus();
        }else if(event.key==='Escape' || event.key==='Tab'){
            if(event.key==='Escape')event.preventDefault();
            event.stopPropagation();closeCreateMenu({restoreFocus:true});
        }
    });
    createMenu?.addEventListener('mousedown', event => event.stopPropagation());
    createMenu?.addEventListener('click', event => {
        event.stopPropagation();
        const card = event.target.closest('[data-create-type]');
        if(card) createNodeFromMenu(card.dataset.createType || 'image');
    });
    composer.addEventListener('pointerdown', event => event.stopPropagation());
    composer.addEventListener('mousedown', event => event.stopPropagation());
    composer.addEventListener('click', event => {
        if(!event.target.closest('.smart-control')) closeAllSmartPopovers();
        event.stopPropagation();
    });
    promptInput.addEventListener('input', maybeOpenMentionPicker);
    promptInput.addEventListener('input', () => {
        delete promptInput.dataset.preserveDraftOnce;
        savePromptDraftForCurrent();
        renderInputThumbsRow(selectedNode());
        scheduleSave();
    });
    promptInput.addEventListener('keyup', maybeOpenMentionPicker);
    promptInput.addEventListener('mouseup', saveMentionRange);
    promptInput.addEventListener('focus', saveMentionRange);
    promptInput.addEventListener('keydown', event => {
        if(event.key === 'Escape') closeMentionPicker();
    });
    promptInput.addEventListener('mouseover', event => {
        const token = event.target.closest?.('.mention-image-token');
        if(!token) return;
        // Reference chips never create hover video/audio decoders. Play in the lightbox.
        if(smartTypedVideoInputs() || token.dataset.kind === 'audio' || String(token.dataset.url || '').startsWith('asset://')) return;
        let media = mentionPreview.querySelector('img,video');
        const isVideo = token.dataset.kind === 'video' || isVideoMediaItem({url:token.dataset.url, kind:token.dataset.kind});
        if(isVideo && media?.tagName?.toLowerCase() !== 'video'){
            media?.replaceWith(document.createElement('video'));
            media = mentionPreview.querySelector('video');
        } else if(!isVideo && media?.tagName?.toLowerCase() !== 'img'){
            media?.replaceWith(document.createElement('img'));
            media = mentionPreview.querySelector('img');
        }
        if(isVideo){
            media.muted = true;
            media.loop = true;
            media.playsInline = true;
            media.preload = 'metadata';
            media.disablePictureInPicture = true;
            media.setAttribute('disablepictureinpicture', '');
            media.setAttribute('controlslist', 'nodownload noplaybackrate noremoteplayback');
            media.src = token.dataset.url || '';
            media.play?.().catch(() => {});
        } else {
            media.src = token.dataset.url || '';
            media.alt = 'preview';
        }
        const rect = token.getBoundingClientRect();
        mentionPreview.style.left = `${Math.min(window.innerWidth - 236, rect.left)}px`;
        mentionPreview.style.top = `${Math.min(window.innerHeight - 236, rect.bottom + 8)}px`;
        mentionPreview.style.display = 'block';
    });
    promptInput.addEventListener('mouseout', event => {
        if(event.target.closest?.('.mention-image-token')){
            mentionPreview.style.display = 'none';
            const media = mentionPreview.querySelector('img,video');
            media?.pause?.();
            media?.removeAttribute('src');
            media?.load?.();
        }
    });
    mentionPicker.addEventListener('mousedown', event => event.stopPropagation());
    document.addEventListener('click', event => {
        if(!event.target.closest('.smart-control')) closeAllSmartPopovers();
        if(!event.target.closest('.mention-picker') && !event.target.closest('#promptInput')) closeMentionPicker();
    });
    document.addEventListener('keydown', event => {
        if(event.key === 'Escape') { closeAllSmartPopovers(); closeCreateMenu(); closeSmartCanvasLog(); closeSmartCanvasShortcuts(); }
    });
}

function renderSmartNodePlaceholderHtml(node){
    const layout = imageLayout(node.images || [], nodeScale(node), node);
    const kind = mediaKindForItem(node.images?.[0] || {});
    const title = node.type === 'smart-prompt' ? 'Prompt' : node.type === 'smart-loop' ? 'Loop' : ((node.images || []).length > 1 ? 'Group' : kind === 'video' ? 'Video' : kind === 'audio' ? 'Audio' : 'Image');
    return `<div class="image-node image-node-placeholder ${isNodeSelected(node.id) ? 'selected' : ''}" data-id="${escapeHtml(node.id)}" style="left:${node.x || 0}px;top:${node.y || 0}px;width:${layout.width}px;height:${layout.height}px">
        <div class="node-head"><div class="node-title">${escapeHtml(title)}</div></div>
        <div class="node-port port-in" data-port="in" title="input"></div>
        <div class="node-port port-out" data-port="out" title="output"></div>
    </div>`;
}

function smartNodeGenerationToolEnabled(action){
    return !isSmartCanvasLocked() && (action === 'depth-video' || !smartImageToolBusy);
}

function updateSmartNodeToolbarAccess(){
    if(isSmartCanvasLocked())closePixmaxVideoDepthMenu();
    // Lease changes update existing controls without interrupting media playback.
    world.querySelectorAll('[data-smart-node-action="depth-video"],[data-smart-node-action="depth"],[data-smart-node-action="panorama"]').forEach(button => {
        button.disabled = !smartNodeGenerationToolEnabled(button.dataset.smartNodeAction);
    });
    world.querySelectorAll('.pixmax-video-toolbar [data-smart-node-action]').forEach(button=>{
        const node=nodes.find(node=>node.id===button.dataset.nodeId);
        const action=pixmaxVideoToolbarActions(node).find(action=>action.key===button.dataset.smartNodeAction);
        if(action){button.disabled=!action.enabled;button.title=action.hint||action.label;}
    });
}

function smartNodeToolbarHtml(node){
    const isImageNode = node?.type === 'smart-image' || !node?.type;
    const images = node?.images || [];
    if(!isImageNode || !images.some(img => img?.url)) return '';
    const item = imageForDisplay(images[smartNodeToolbarImageIndex(node)] || images.find(img => img?.url));
    if(!item?.url) return '';
    const kind = mediaKindForItem(item);
    if(kind==='video')return pixmaxVideoToolbarHtml(node);
    const canEditImage = kind === 'image';
    const imageCount = images.filter(img => mediaKindForItem(imageForDisplay(img)) === 'image' && imageForDisplay(img)?.url).length;
    const actions = [
        {key:'preview', icon:'eye', label:'预览', enabled:kind === 'image' || kind === 'video'},
        {key:'crop', icon:'crop', label:'裁剪', enabled:canEditImage},
        {key:'outpaint', icon:'expand', label:'扩图', enabled:canEditImage},
        {key:'brush', icon:'paintbrush', label:'画笔', enabled:canEditImage},
        ...(canEditImage && imageCount > 1 ? [{key:'grid-join', icon:'grid-3x3', label:'宫格拼接', enabled:true}] : []),
        ...(canEditImage && window.CanvasSession?.enabled ? [
            {key:'panorama', icon:'globe', label:'全景图', enabled:smartNodeGenerationToolEnabled('panorama')},
            {key:'depth', icon:'layers', label:'深度图', enabled:smartNodeGenerationToolEnabled('depth')}
        ] : []),
        ...(canEditImage ? [{key:'depth-local', icon:'layers', label:'深度图（本地）', enabled:true}] : []),
        ...(kind === 'video' ? [{key:'depth-video', icon:'layers', label:'生成深度视频', enabled:smartNodeGenerationToolEnabled('depth-video')}] : []),
        {key:'asset', icon:'library-big', label:'素材库', enabled:kind === 'image' || kind === 'video'},
        {key:'auth', icon:'shield-check', label:'认证', enabled:kind === 'image' || kind === 'video'},
        {key:'download', icon:'download', label:'下载', enabled:true}
    ];
    return `<div class="smart-node-floating-menu" data-smart-node-menu="1">${actions.map(action => `
        <button type="button" data-smart-node-action="${escapeAttr(action.key)}" data-node-id="${escapeAttr(node.id)}" ${action.enabled ? '' : 'disabled'} title="${escapeAttr(action.label)}">
            <i data-lucide="${escapeAttr(action.icon)}"></i><span>${escapeHtml(action.label)}</span>
        </button>`).join('')}</div>`;
}


function selectSmartImageEditorTarget(nodeId,index){return smartSelection.editorTarget(nodeId,index);}

// The panorama supplies a captured frame/position; workspace retains document writes.
function applySmartPanoramaExport(frame, point){
    pushUndo();
    const newNode=createImageNodeAt(point,[frame],{select:true,skipUndo:true});
    smartSelection.createdMedia(newNode.id);render();scheduleSave();
    return newNode;
}

function activeSettingsSubject(...args){return smartComposer.settingsSubject(...args);}
function activeComposerNode(...args){return smartComposer.activeNode(...args);}
function persistActiveSmartSettings(...args){return smartComposer.persistSettings(...args);}
function clearPromptInput(...args){return smartComposer.clearInput(...args);}
function smartComposerChanges(...args){return smartComposer.changes(...args);}
function savePromptDraftForCurrent(...args){return smartComposer.saveDraft(...args);}
function setPromptDraftForNode(...args){return smartComposer.setDraftForNode(...args);}
function applySmartOutpaintComposer(...args){return smartComposer.applyOutpaint(...args);}
function updateComposer(...args){return smartComposer.refresh(...args);}

// Composer owns its input-target session; selection, settings and node drafts
// remain the existing shared business data, never copied into another store.
function createSmartComposer(){
    let lastComposerNodeId='',activeComposerSubject=null,smartComposerBaseline=null,targetCanvasId='';
    let paused=false,destroyed=false,inputVersion=0;
    const listeners=[];
    function clearListeners(){for(const [type,fn] of listeners)window.removeEventListener(type,fn);listeners.length=0;}
    function bind(){
        if(destroyed)return;clearListeners();
        for(const [type,fn] of [['pagehide',event=>event.persisted?pause():destroy()],['pageshow',event=>{if(event.persisted)resume();}]]){
            window.addEventListener(type,fn);listeners.push([type,fn]);
        }
    }
    function documentReplaced(){if(destroyed)return;inputVersion++;activeComposerSubject=null;lastComposerNodeId='';targetCanvasId='';}
    function documentImported(){if(!destroyed){inputVersion++;activeComposerSubject=null;}}
    function outputSelected(){if(!destroyed && activeComposerSubject?.id && smartSelection.nodeId===activeComposerSubject.id)lastComposerNodeId=smartSelection.nodeId+':node';}
    function finishCascade(){if(destroyed)return;documentReplaced();composer.classList.remove('open');}
    function close({saveDraft=true,clearInput=false}={}){
        if(destroyed)return;if(saveDraft && !paused)savePromptDraftForCurrent();
        documentReplaced();smartComposerBaseline=null;composer.classList.remove('open');
        if(cascadeRunBtn)cascadeRunBtn.style.display='none';setPromptInputLocked(false);
        if(clearInput)setPromptText('');
    }
    function pause(){if(!destroyed){inputVersion++;paused=true;}}
    function resume(){if(!destroyed && paused){paused=false;updateComposer();}}
    function destroy(){if(destroyed)return;documentReplaced();smartComposerBaseline=null;clearListeners();if(typeof composer!=='undefined')composer?.classList.remove('open');destroyed=true;paused=false;}
    function activeSettingsSubject(){
        const active = canvas?.id===targetCanvasId && activeComposerSubject && nodes.includes(activeComposerSubject)
            ? activeComposerSubject : selectedNode();
        return isSmartImageNode(active) ? active : null;
    }

    function activeComposerNode(){
        if(!lastComposerNodeId || canvas?.id!==targetCanvasId) return null;
        const id = String(lastComposerNodeId).split(':')[0] || '';
        const node = nodes.find(n => n.id === id);
        return isSmartImageNode(node) && (!activeComposerSubject || activeComposerSubject===node) ? node : null;
    }

    function persistActiveSmartSettings(){
        if(!composer?.classList?.contains('open')) return;
        const subject = activeComposerNode();
        if(!subject) return;
        settings = enforceSmartGenerationKind(subject, settings);
        subject.runSettings = settingsForStorage(settings);
        if(smartComposerBaseline?.nodeId === subject.id) smartComposerBaseline.settings = JSON.stringify(settingsForStorage(settings));
        rememberRecentSmartSettings(settings, subject);
    }

    function clearPromptInput(options={}){
        if(options.preserveDraft){
            promptInput.dataset.preserveDraftOnce = '1';
            closeMentionPicker();
            return;
        }
        promptInput.textContent = '';
        closeMentionPicker();
        const subject=activeComposerNode();
        if(subject){subject.promptDraftHtml='';subject.promptDraftText='';}
    }

    function smartComposerChanges(subject){
        const baseline = smartComposerBaseline;
        if(!subject) return {prompt:false,settings:false};
        // Before a composer baseline exists, keep projecting live input edits.
        if(baseline?.nodeId !== subject.id) return {prompt:true,settings:true};
        return {
            prompt:promptInput.innerHTML !== baseline.html || promptPlainText() !== baseline.text,
            settings:JSON.stringify(settingsForStorage(settings)) !== baseline.settings
        };
    }

    function savePromptDraftForCurrent(){
        if(promptInput?.dataset?.promptLocked === '1') return;
        const subject = activeComposerNode();
        if(!subject) return;
        if(promptInput?.dataset?.preserveDraftOnce === '1' && subject.promptDraftHtml){
            delete promptInput.dataset.preserveDraftOnce;
            return;
        }
        // The baseline contains the displayed values, including UI defaults. Only
        // edits made after that baseline should change the node's generation input.
        const changes = smartComposerChanges(subject);
        if(changes.prompt){
            subject.promptDraftHtml = promptInput.innerHTML;
            subject.promptDraftText = promptPlainText();
            if(smartComposerBaseline?.nodeId === subject.id){
                smartComposerBaseline.html = subject.promptDraftHtml;
                smartComposerBaseline.text = subject.promptDraftText;
            }
        }
        if(changes.settings){
            subject.runSettings = cloneSmartSettings(enforceSmartGenerationKind(subject, settings));
            if(smartComposerBaseline?.nodeId === subject.id){
                smartComposerBaseline.settings = JSON.stringify(settingsForStorage(settings));
            }
        }
    }

    function setPromptDraftForNode(node, text){
        if(!isSmartImageNode(node)) return;
        const value = String(text || '');
        node.promptDraftHtml = escapeHtml(value);
        node.promptDraftText = value;
        node.promptDraftTouched = true;
        if(activeSettingsSubject()?.id === node.id && promptInput){
            promptInput.textContent = value;
            delete promptInput.dataset.preserveDraftOnce;
        }
    }

    function clearManualSmartVideoUrl(){
        settings.videoTempShLinks = (settings.videoTempShLinks || []).filter(item => item?.manual !== true);
    }

    function applyManualVideoUrlToSmartRef(ref, manualUrl){
        if(!manualUrl) return;
        const sourceUrl = mediaRefSourceUrl(ref) || manualUrl;
        settings.videoTempShLinks = [
            ...(settings.videoTempShLinks || []).filter(item => item?.source !== sourceUrl),
            {source:sourceUrl, url:manualUrl, manual:true}
        ];
    }

    async function setManualMediaUrls(){
        if(paused || destroyed)return '';
        const node = activeSettingsSubject();
        if(!node) return '';
        savePromptDraftForCurrent();
        const refs = currentUploadMediaRefs(node);
        const version=++inputVersion, documentId=canvas?.id;
        const sources=JSON.stringify(refs.map(mediaRefSourceUrl));
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
        if(value === null || paused || destroyed || version!==inputVersion || canvas?.id!==documentId ||
            !nodes.includes(node) || activeSettingsSubject()!==node ||
            JSON.stringify(currentUploadMediaRefs(node).map(mediaRefSourceUrl))!==sources) return '';
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

    function applyOutpaintSizeToSmartParams(width, height, subject){
        const w = Math.max(1, Math.round(Number(width) || 0));
        const h = Math.max(1, Math.round(Number(height) || 0));
        if(!w || !h) return;
        if(!subject || !isSmartImageNode(subject)) return;
        subject.outpaintSize = {width:w, height:h};
        subject.runSettings = withOutpaintDisplaySettings(subject, cloneSmartSettings(subject.runSettings || settings));
        if(activeSettingsSubject()?.id === subject.id){
            settings = smartSettingsForNode(subject);
            renderDynamicParams();
        }
    }

    function applyOutpaint(width, height, subject){
        if(paused || destroyed || !nodes.includes(subject) || !isSmartImageNode(subject))return false;
        applyOutpaintSizeToSmartParams(width,height,subject);
        setPromptDraftForNode(subject,'Remove white area and fill the scene');
        promptInput.dataset.preserveDraftOnce='1';
        return true;
    }

    function updateComposer(){
        const node = selectedNode();
        if(node?.localDepth){close();return;}
        if(lastComposerNodeId && (canvas?.id!==targetCanvasId || (activeComposerSubject && !nodes.includes(activeComposerSubject))))documentReplaced();
        if(smartCascadeSilentSelection && !activeComposerSubject){
            composer.classList.remove('open');
            if(cascadeRunBtn) cascadeRunBtn.style.display = 'none';
            activeComposerSubject = null;
            lastComposerNodeId = '';
            return;
        }
        composer.classList.toggle('open', !!node);
        if(!isSmartImageNode(node)){close({clearInput:!node});return;}
        // composer 只绑定节点本身：图片只是素材/结果，不携带提示词或参数状态。
        const subject = node;
        const composerKey = `${node.id}:node`;
        const switchedNode = lastComposerNodeId !== composerKey;
        // Save the previous node's draft before changing the composer owner.
        if(switchedNode){inputVersion++;savePromptDraftForCurrent();}
        lastComposerNodeId = composerKey;
        activeComposerSubject = subject;
        targetCanvasId=canvas?.id || '';
        const hasPromptInput = promptInputNodesFor(node).length > 0;
        if(switchedNode){
            settings = smartSettingsForNode(subject);
            loadPromptDraft(subject);
        }
        setPromptInputLocked(false);
        syncCascadeRunButton(node);
        positionComposerForNode(node);
        const promptHeight = Math.max(60, Math.min(380, Number(settings.promptH) || 124));
        promptInput.style.setProperty('--prompt-h', `${promptHeight}px`);
        renderInputPromptPreview(node);
        syncCascadeRunButton(node);
        // Model controls may normalize displayed values. Capture a fresh baseline
        // only when that would not absorb an existing, unsaved user edit.
        const hasUnsavedComposerChanges = !switchedNode && smartComposerBaseline?.nodeId === node.id
            && Object.values(smartComposerChanges(node)).some(Boolean);
        updateProviderModels();
        if(!hasUnsavedComposerChanges){
            smartComposerBaseline = {
                nodeId:node.id,
                html:promptInput.innerHTML,
                text:promptPlainText(),
                settings:JSON.stringify(settingsForStorage(settings))
            };
        }
    }
    return Object.freeze({
        get state(){return Object.freeze({open:Boolean(!destroyed && typeof composer!=='undefined' && composer?.classList.contains('open')),nodeId:activeComposerNode()?.id||'',targetValid:Boolean(activeComposerNode()),canvasId:targetCanvasId,paused,destroyed});},
        activeNode:activeComposerNode,settingsSubject:activeSettingsSubject,changes:smartComposerChanges,applyOutpaint,setManualMediaUrls,
        bind,pause,resume,destroy,close,documentReplaced,documentImported,outputSelected,finishCascade,
        refresh:(...args)=>{if(!paused && !destroyed)return updateComposer(...args);},
        // Existing background saves must still flush the paused page's input.
        saveDraft:(...args)=>{if(!destroyed)return savePromptDraftForCurrent(...args);},
        persistSettings:(...args)=>{if(!paused && !destroyed)return persistActiveSmartSettings(...args);},
        clearInput:(...args)=>{if(!paused && !destroyed)return clearPromptInput(...args);},
        setDraftForNode:(...args)=>{if(!paused && !destroyed)return setPromptDraftForNode(...args);}
    });
}


// Workspaces own derived render caches and their queues; document and task data stay shared.
function createSmartWorkspaceView(){
    let smartComputationContext=null,pendingSmartViewportRefresh=null;
    let smartViewportScrolls=new WeakMap(),smartRenderedNodes=new WeakMap(),smartRenderedConnectionStates=new Map();
    let smartGeometryFrame=null,smartGeometryPasses=0,smartGeometryAll=false;
    const smartGeometryNodes=new Set();

    let paused=false,destroyed=false,documentId,documentNodes,frameVersion=0,viewportVersion=0;
    const listeners=[];
    const focusedRefreshes=new Map(),pausedRefreshes=new Set();
    function current(){return {id:typeof canvas==='undefined'?null:canvas?.id,nodes:typeof nodes==='undefined'?null:nodes};}
    function cancelGeometry(){
        frameVersion++;
        if(smartGeometryFrame!==null)cancelAnimationFrame(smartGeometryFrame);
        smartGeometryFrame=null;smartGeometryPasses=0;smartGeometryAll=false;smartGeometryNodes.clear();
    }
    function cancelViewport(){viewportVersion++;if(pendingSmartViewportRefresh!==null)clearTimeout(pendingSmartViewportRefresh);pendingSmartViewportRefresh=null;}
    function reset(){
        if(destroyed)return;
        cancelGeometry();cancelViewport();
        clearFocusedRefreshes();
        smartRenderedNodes=new WeakMap();smartRenderedConnectionStates=new Map();smartViewportScrolls=new WeakMap();
        const now=current();documentId=now.id;documentNodes=now.nodes;
    }
    function checkDocument(){
        const id=typeof canvas==='undefined'?null:canvas?.id,data=typeof nodes==='undefined'?null:nodes;
        if(id!==documentId)reset();
        else if(data!==documentNodes){cancelGeometry();cancelViewport();clearFocusedRefreshes();documentNodes=data;}
    }
    function accept(origin){
        const now=current();
        if(now.id!==origin.id||now.nodes!==origin.nodes){checkDocument();return false;}
        return !paused&&!destroyed;
    }
    function view(work,args){if(paused||destroyed)return;checkDocument();return work(...args);}
    function pause(){if(destroyed)return;paused=true;cancelGeometry();cancelViewport();clearFocusedRefreshes(true);}
    function resume(){
        if(destroyed||!paused)return;paused=false;checkDocument();
        const ids=[...pausedRefreshes].filter(node=>nodes.includes(node)).map(node=>node.id);pausedRefreshes.clear();
        if(ids.length)refreshSmartNodes(ids);
        scheduleSmartGeometryRefresh(null,2);scheduleSmartViewportRefresh(0);
    }
    function bind(){
        if(destroyed)return;
        for(const [type,fn]of listeners)window.removeEventListener(type,fn);listeners.length=0;
        for(const [type,fn]of [['pagehide',event=>event.persisted?pause():destroy()],['pageshow',event=>{if(event.persisted)resume();}]]){
            window.addEventListener(type,fn);listeners.push([type,fn]);
        }
    }
    function destroy(){if(destroyed)return;reset();destroyed=true;paused=false;documentNodes=null;documentId=null;for(const [type,fn]of listeners)window.removeEventListener(type,fn);listeners.length=0;}

    function clearFocusedRefreshes(keep=false){
        if(!keep)pausedRefreshes.clear();
        for(const [element,pending]of focusedRefreshes){
            element.removeEventListener('focusout',pending.leave);
            if(pending.timer!==null)clearTimeout(pending.timer);
            element._smartRefreshPending=false;
            if(keep)pausedRefreshes.add(pending.node);
        }
        focusedRefreshes.clear();
    }

    function deferFocusedRefresh(element,node){
        if(focusedRefreshes.has(element))return;
        const origin=current(),pending={node,timer:null,leave:null};
        element._smartRefreshPending=true;
        pending.leave=()=>{
            pending.timer=setTimeout(()=>{
                if(focusedRefreshes.get(element)!==pending)return;
                focusedRefreshes.delete(element);element._smartRefreshPending=false;
                if(accept(origin)&&nodes.includes(node)&&element.isConnected!==false)refreshSmartNodes([node.id]);
            },0);
        };
        focusedRefreshes.set(element,pending);
        element.addEventListener('focusout',pending.leave,{once:true});
    }

    function withSmartComputationImpl(work){
        if(smartComputationContext) return work();
        const incoming = new Map();
        (canvas?.connections || []).forEach(conn => {
            if(!incoming.has(conn.to)) incoming.set(conn.to, []);
            incoming.get(conn.to).push(conn);
        });
        smartComputationContext = {byId:new Map(nodes.map(node => [node.id, node])), incoming, rects:new Map()};
        try { return work(); } finally { smartComputationContext = null; }
    }

    function nodeRectImpl(node){
        const cached = smartComputationContext?.rects.get(node);
        if(cached) return cached;
        const layout = imageLayout(node.images || [], nodeScale(node), node);
        const rect = {x:node.x || 0, y:node.y || 0, width:layout.width, height:layout.height};
        smartComputationContext?.rects.set(node, rect);
        return rect;
    }

    function scheduleSmartViewportRefreshImpl(delay=200){
        clearTimeout(pendingSmartViewportRefresh);
        const origin=current(),version=++viewportVersion;
        pendingSmartViewportRefresh = setTimeout(() => {
            if(version!==viewportVersion||!accept(origin))return;
            pendingSmartViewportRefresh = null;
            renderSmartOffscreenPlaceholders();
        }, delay);
    }

    function restoreSmartNodeScrollImpl(el, node){
        const scroll = smartViewportScrolls.get(node);
        const scroller = el.querySelector('[data-thumb-scroll]');
        if(scroll !== undefined && scroller) scroller.scrollTop = scroll;
    }

    function renderSmartOffscreenPlaceholdersImpl(){
        if(!world) return;
        const byId = new Map(nodes.map(node => [node.id, node]));
        const restored = [];
        world.querySelectorAll('.image-node').forEach(el => {
            const id = el.dataset.id;
            if(!id) return;
            const node = byId.get(id);
            if(!node){ el.remove(); return; }
            const placeholder = el.classList.contains('image-node-placeholder');
            const visible = isSmartNodeInViewport(node, placeholder ? 400 : 700);
            if(placeholder ? !visible : visible || !canRecycleSmartMediaNode(node, el)) return;
            if(!placeholder){
                const scroller = el.querySelector('[data-thumb-scroll]');
                if(scroller) smartViewportScrolls.set(node, scroller.scrollTop);
            }
            const freshHtml = placeholder ? renderSmartNodeHtml(node) : renderSmartNodePlaceholderHtml(node);
            const tpl = document.createElement('template');
            tpl.innerHTML = freshHtml;
            const fresh = tpl.content.firstElementChild;
            if(fresh){
                releaseSmartGroupPreviews(el);
                el.replaceWith(fresh);
                bindSmartNodeEvents(fresh, node);
                if(placeholder){
                    restoreSmartNodeScroll(fresh, node);
                    bindSmartPreviewImageFallbacks(fresh);
                    measureSmartNodeImages(fresh);
                    restored.push(node.id);
                }
            }
        });
        if(restored.length){
            refreshIcons();
            scheduleSmartGeometryRefresh(restored, 2);
        }
    }

    function renderSmartConnectionPathsImpl(nodeIds=null){
        const byId = smartComputationContext.byId;
        const scope = nodeIds === null ? null : new Set(nodeIds);
        const conns = (canvas?.connections || []).map((conn, index) => ({...conn, index}))
            .filter(c => byId.has(c.from) && byId.has(c.to) && (!scope || scope.has(c.from) || scope.has(c.to)));
        const cascadeKeys = cascadeConnectionKeys();
        const paths = conns.map(conn => {
            const fromNode = byId.get(conn.from);
            const toNode = byId.get(conn.to);
            const fr = nodeRect(fromNode), tr = nodeRect(toNode);
            const kind = conn.kind || 'flow';
            const isHistory = kind === 'history';
            const isInsertPreview = loopInsertPreview?.index === conn.index;
            const edgeKey = `${conn.from}->${conn.to}`;
            const cascadeState = smartCascadeEdgeState(edgeKey);
            const isCascade = !isHistory && (cascadeKeys.has(edgeKey) || Boolean(cascadeState) || isInsertPreview);
            const isPendingLine = Boolean(toNode.pending && !isCascade);
            const fx = isHistory ? fr.x + fr.width / 2 : fr.x + fr.width;
            const fy = isHistory ? fr.y + fr.height : fr.y + fr.height / 2;
            const tx = isHistory ? tr.x + tr.width / 2 : tr.x;
            const ty = isHistory ? tr.y : tr.y + tr.height / 2;
            const dx = Math.max(50, Math.abs(tx - fx) * 0.45);
            const dy = Math.max(36, Math.abs(ty - fy) * 0.45);
            const curve = isHistory
                ? `M${fx} ${fy} C ${fx} ${fy+dy}, ${tx} ${ty-dy}, ${tx} ${ty}`
                : `M${fx} ${fy} C ${fx+dx} ${fy}, ${tx-dx} ${ty}, ${tx} ${ty}`;
            const mx = (fx + tx) / 2, my = (fy + ty) / 2;
            const cls = [
                isPendingLine ? 'conn-pending' : '',
                isCascade ? 'conn-cascade' : '',
                isCascade && cascadeState === 'done' ? 'conn-cascade-done' : '',
                isCascade && Boolean(cascadeState) && cascadeState !== 'done' ? 'conn-cascade-wait' : '',
                isCascade && cascadeState === 'active' ? 'conn-cascade-active' : '',
                isHistory ? 'conn-history' : ''
            ].filter(Boolean).join(' ');
            const color = isCascade ? '#16a34a' : isHistory ? 'rgba(100,116,139,0.46)' : kind === 'input' ? 'rgba(100,116,139,0.62)' : 'rgba(148,163,184,0.62)';
            const opacity = isPendingLine ? '.82' : '1';
            const width = kind === 'input' ? '1.9' : '1.6';
            return `<g class="smart-connection" data-conn-key="${conn.index}"><path class="${cls}" d="${curve}" stroke="${color}" stroke-width="${width}" fill="none" opacity="${opacity}"></path><path class="conn-hit" data-conn-index="${conn.index}" d="${curve}" stroke="transparent" stroke-width="14" fill="none"></path><circle cx="${tx}" cy="${ty}" r="3.5" fill="${color}" opacity=".66"></circle><g class="conn-cut" data-conn-index="${conn.index}" transform="translate(${mx} ${my})"><circle r="8" fill="var(--card)" stroke="${color}" stroke-width="1.4"></circle><path d="M-3 -3 L3 3 M3 -3 L-3 3" stroke="${color}" stroke-width="1.5" stroke-linecap="round"></path></g></g>`;
        }).join('');
        return `<svg class="connection-layer" data-topology="${escapeHtml(smartConnectionTopology())}" width="6000" height="4000" viewBox="0 0 6000 4000" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
    }

    function scheduleSmartGeometryRefreshImpl(nodeIds=null, passes=1){
        if(nodeIds === null) smartGeometryAll = true;
        else nodeIds.forEach(id => smartGeometryNodes.add(id));
        smartGeometryPasses = Math.max(smartGeometryPasses, passes);
        if(smartGeometryFrame !== null) return;
        const origin=current(),version=frameVersion;
        smartGeometryFrame = requestAnimationFrame(() => {
            if(version!==frameVersion||!accept(origin))return;
            smartGeometryFrame = null;
            const ids = smartGeometryAll ? null : [...smartGeometryNodes];
            const remaining = smartGeometryPasses - 1;
            smartGeometryPasses = 0;
            smartGeometryAll = false;
            smartGeometryNodes.clear();
            refreshConnectionLayer(ids);
            if(remaining > 0) scheduleSmartGeometryRefresh(ids, remaining);
        });
    }

    function cancelSmartGeometryRefreshImpl(){cancelGeometry();}

    function refreshConnectionLayerImpl(nodeIds=null){
        cancelSmartGeometryRefresh();
        const oldSvg = world.querySelector('svg.connection-layer');
        if(!oldSvg) return;
        if(oldSvg.dataset.topology !== smartConnectionTopology()) nodeIds = null;
        const tpl = document.createElement('template');
        tpl.innerHTML = renderConnections(nodeIds).trim();
        const nextSvg = tpl.content.firstElementChild;
        if(!nextSvg) return;
        const existing = new Map([...oldSvg.querySelectorAll('.smart-connection')].map(el => [el.dataset.connKey, el]));
        [...nextSvg.children].forEach(fresh => {
            const current = existing.get(fresh.dataset.connKey);
            if(current) patchSmartConnectionGroup(current, fresh);
            else { oldSvg.appendChild(fresh); bindConnectionEvents(fresh); }
            existing.delete(fresh.dataset.connKey);
        });
        if(nodeIds === null) existing.forEach(el => el.remove());
        oldSvg.dataset.topology = nextSvg.dataset.topology;
    }

    function smartChangedConnectionNodesImpl(){
        const next = new Map(), changed = new Set(), cascadeKeys = cascadeConnectionKeys();
        const byId = new Map(nodes.map(n => [n.id,n]));
        (canvas?.connections || []).forEach((conn,index) => {
            const key = `${conn.from}->${conn.to}`;
            const state = JSON.stringify([conn.from,conn.to,conn.kind,cascadeKeys.has(key),
                smartCascadeEdgeState(key),loopInsertPreview?.index === index,Boolean(byId.get(conn.to)?.pending)]);
            next.set(index,state);
            if(smartRenderedConnectionStates.get(index) !== state){changed.add(conn.from);changed.add(conn.to);}
        });
        smartRenderedConnectionStates = next;
        return [...changed];
    }

    function renderImpl(){
        smartAudioPreview.dataChanged();
        cancelSmartGeometryRefresh();
        if(smartWorkflowTransferModal?.classList.contains('open')) updateSmartWorkflowTransferMeta();
        world.classList.toggle('smart-multi-selected', selectedNodeIds().length > 1);
        const existing = new Map([...world.querySelectorAll('.image-node')].map(el => [el.dataset.id, el]));
        const changed = smartChangedConnectionNodes();
        withSmartComputation(() => nodes.forEach(node => {
            const html = isSmartNodeInViewport(node, 400) ? renderSmartNodeHtml(node) : renderSmartNodePlaceholderHtml(node);
            const current = existing.get(node.id);
            existing.delete(node.id);
            const previous = current && smartRenderedNodes.get(current);
            // Object identity also matters: controls close over their node object.
            if(previous?.node === node && previous.html === html) return;
            const tpl = document.createElement('template');
            tpl.innerHTML = html;
            const fresh = tpl.content.firstElementChild;
            if(!fresh) return;
            if(current){
                const scroll = current.querySelector('[data-thumb-scroll]');
                if(scroll) smartViewportScrolls.set(node, scroll.scrollTop);
                releaseSmartGroupPreviews(current);
                transplantSmartMediaElements(current, fresh);
                current.replaceWith(fresh);
            } else world.appendChild(fresh);
            smartRenderedNodes.set(fresh, {node,html});
            bindNodeEvents([fresh]);
            restoreSmartNodeScroll(fresh, node);
            bindSmartPreviewImageFallbacks(fresh);
            measureSmartNodeImages(fresh);
            changed.push(node.id);
        }));
        existing.forEach((el,id) => {releaseSmartGroupPreviews(el);el.remove();changed.push(id);});
        if(!world.querySelector('svg.connection-layer')){
            world.insertAdjacentHTML('afterbegin', renderConnections());
            bindConnectionEvents();
        } else refreshConnectionLayer(changed);
        if(!portDragState) world.querySelector('path.port-drag-temp')?.remove();
        if(changed.length) scheduleSmartGeometryRefresh(changed,2);
        updateComposer();
        scheduleSmartMinimapRender();
        refreshIcons();
        refreshRunTimerPills();
    }

    function refreshSmartNodesImpl(ids, {forceIds=[]}={}){
        smartAudioPreview.dataChanged();
        const affected = smartAffectedNodeIds(ids);
        const byId = new Map(nodes.map(node => [node.id, node]));
        affected.forEach(id => {
            const node = byId.get(id);
            const current = world.querySelector(`.image-node[data-id="${CSS.escape(id)}"]`);
            if(!node) return;
            if(!current){
                const tpl=document.createElement('template');
                tpl.innerHTML=isSmartNodeInViewport(node,400) ? renderSmartNodeHtml(node) : renderSmartNodePlaceholderHtml(node);
                const fresh=tpl.content.firstElementChild;
                if(fresh){world.appendChild(fresh);bindNodeEvents([fresh]);bindSmartPreviewImageFallbacks(fresh);measureSmartNodeImages(fresh);}
                return;
            }
            if(current.contains(document.activeElement) && !forceIds.includes(id)){
                deferFocusedRefresh(current,node);
                return;
            }
            const scroll = current.querySelector('[data-thumb-scroll]')?.scrollTop ?? smartViewportScrolls.get(node) ?? 0;
            const tpl = document.createElement('template');
            tpl.innerHTML = isSmartNodeInViewport(node, 400) ? renderSmartNodeHtml(node) : renderSmartNodePlaceholderHtml(node);
            const fresh = tpl.content.firstElementChild;
            if(!fresh) return;
            releaseSmartGroupPreviews(current);
            transplantSmartMediaElements(current, fresh);
            current.replaceWith(fresh);
            bindNodeEvents([fresh]);
            const scroller = fresh.querySelector('[data-thumb-scroll]');
            if(scroller) scroller.scrollTop = scroll;
            bindSmartPreviewImageFallbacks(fresh);
            measureSmartNodeImages(fresh);
        });
        if(affected.has(smartSelection.nodeId)) updateComposer();
        scheduleSmartGeometryRefresh([...affected], 2);
        scheduleSmartMinimapRender();
        refreshRunTimerPills();
        refreshIcons();
    }
    function nodeForComputation(id){return smartComputationContext?smartComputationContext.byId.get(id):nodes.find(node=>node.id===id);}
    function connectionsForComputation(id){return smartComputationContext?smartComputationContext.incoming.get(id)||[]:canvas?.connections||[];}
    return Object.freeze({
        get state(){return Object.freeze({paused,destroyed,pendingGeometry:smartGeometryFrame!==null,pendingViewport:pendingSmartViewportRefresh!==null});},
        reset,bind,pause,resume,destroy,
        withComputation:withSmartComputationImpl,nodeRect:nodeRectImpl,nodeForComputation,connectionsForComputation,
        scheduleViewport:(...args)=>view(scheduleSmartViewportRefreshImpl,args),scheduleGeometry:(...args)=>view(scheduleSmartGeometryRefreshImpl,args),
        cancelGeometry,restoreScroll:(...args)=>view(restoreSmartNodeScrollImpl,args),recycle:(...args)=>view(renderSmartOffscreenPlaceholdersImpl,args),
        connectionPaths:(...args)=>view(renderSmartConnectionPathsImpl,args),refreshConnections:(...args)=>view(refreshConnectionLayerImpl,args),
        changedConnections:(...args)=>view(smartChangedConnectionNodesImpl,args)||[],render:(...args)=>view(renderImpl,args),refreshNodes:(...args)=>view(refreshSmartNodesImpl,args)
    });
}

function smartNodeForComputation(id){return smartWorkspaceView.nodeForComputation(id);}
function smartConnectionsForComputation(id){return smartWorkspaceView.connectionsForComputation(id);}
