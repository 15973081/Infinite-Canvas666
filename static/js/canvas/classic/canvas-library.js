/* Classic canvas: Asset libraries, prompt templates and their permission-aware actions.
 * Browser classic script (not an ES module); loaded before canvas.js.
 * Function declarations only: initialization is explicitly invoked by the entry.
 * Uses the entry's existing shared bindings; do not duplicate permission or document state.
 */

function createClassicAssetPanel(){
    let width = CANVAS_ASSET_PANEL_DEFAULT_WIDTH;
    try {
        const stored = Number(localStorage.getItem(CANVAS_ASSET_PANEL_WIDTH_KEY));
        if(Number.isFinite(stored) && stored > 0) width = stored;
    } catch(e) {}
    return window.CanvasCore.createAssetPanelController({
        batchSize:CANVAS_ASSET_BATCH_SIZE, width,
        normalizeSelection:normalizeClassicAssetSelection,
        selectionChanged:classicAssetSelectionChanged,
        onDestroy(){
            finishCanvasAssetPanelResize();
            canvasAssetHover.destroy();
        },
        ids:['canvasAssetToggle', 'canvasAssetPanel', 'canvasAssetResizeHandle', 'canvasAssetCloseBtn', 'canvasAssetLibrarySelect', 'canvasAssetCategorySelect', 'canvasAssetAddCategoryBtn', 'canvasAssetSearch', 'canvasAssetDropZone', 'canvasAssetGrid', 'canvasAssetHoverPreview']
    });
}

function normalizeClassicAssetSelection(next, action){
    const source = action.source || 'panel';
    const libs = canvasAssetSourceLibraries();
    if(!libs.some(lib=>lib.id === next.libraryId)) next.libraryId = libs.find(lib=>lib.id === canvasAssetLibrary.active_library_id)?.id || libs[0]?.id || '';
    const cats = (libs.find(lib=>lib.id === next.libraryId)?.categories || canvasAssetLibrary.categories || []).filter(cat=>['image','media','workflow'].includes(String(cat.type || 'image').toLowerCase()));
    const media = cats.filter(cat=>String(cat.type || 'image').toLowerCase() !== 'workflow');
    const workflows = cats.filter(cat=>String(cat.type || '').toLowerCase() === 'workflow');
    if(action.type === 'library'){
        if(source === 'manager-workflows') next.workflowCategoryId = '';
        else next.categoryId = '';
    }
    if(action.type === 'category'){
        if(source === 'manager-workflows') next.workflowCategoryId = action.id;
        else next.categoryId = action.id;
    }
    const choices = source === 'manager-assets' ? media : cats;
    if(!choices.some(cat=>cat.id === next.categoryId)) next.categoryId = choices[0]?.id || '';
    if(!workflows.some(cat=>cat.id === next.workflowCategoryId)) next.workflowCategoryId = workflows[0]?.id || '';
    return next;
}

function classicAssetSelectionChanged(state, action){
    if(['library','category'].includes(action.type)){
        classicLibraryManager.selectionChanged(action.source);
    }
    if(action.render === false) return;
    renderCanvasAssetLibrary({preserveScroll:!!action.preserveScroll});
    if(classicLibraryManager.state.open) renderAssetManager();
}

function updateAssetManager(...args){return classicLibraryManager.dataChanged(...args);}

function selectClassicAssetManagerTab(...args){return classicLibraryManager.selectTab(...args);}

function setCanvasAssetLibraryFromResponse(data, options={}){
    if(classicAssetPanel.destroyed) return false;
    const readToken = options.readToken ?? classicAssetPanel.responseReadToken(data);
    if(readToken !== undefined){
        if(!classicAssetPanel.acceptsRead(readToken)) return false;
    } else classicAssetPanel.invalidateReads();
    canvasAssetLibrary = data.library || canvasAssetLibrary;
    classicAssetPanel.reconcile({render:options.render !== false,
        source:classicLibraryManager.state.open ? 'manager-' + classicLibraryManager.state.tab : 'panel'});
    return true;
}

function completeClassicAssetWrite(data, origin, target){
    setCanvasAssetLibraryFromResponse(data, {render:false});
    if(target && classicAssetPanel.isSelectionCurrent(origin)) classicAssetPanel.selectTarget(target, {expected:origin});
    else classicAssetPanel.reconcile();
}

function bindClassicAssetPanelLifecycle(){
    const events = classicAssetPanel.events('lifecycle');
    events.on(window, 'pagehide', event => {
        classicAssetPanel.suspendReads();
        if(event.persisted){
            hideCanvasAssetHoverPreview();
            finishCanvasAssetPanelResize();
        } else classicAssetPanel.destroy();
    });
    events.on(window, 'pageshow', event => {
        if(!event.persisted) return;
        classicAssetPanel.resumeReads();
        if(classicAssetPanel.state.open || classicLibraryManager.state.open) loadCanvasAssetLibrary();
    });
}

function revealCanvasAssetControls(){
    classicLibraryManager.reveal();
    [classicAssetPanel.elements.canvasAssetToggle, classicAssetPanel.elements.canvasAssetPanel].forEach(el => {
        if(!el) return;
        el.hidden = false;
        if(el.style?.display === 'none') el.style.display = '';
    });
}

function canvasAssetLibraries(){
    return Array.isArray(canvasAssetLibrary.libraries) && canvasAssetLibrary.libraries.length ? canvasAssetLibrary.libraries : [{id:'default', name:'默认资产库', categories:canvasAssetLibrary.categories || []}];
}

function localCanvasAssetFolderCategories(){
    const result = [];
    const walk = node => {
        if(!node) return;
        const isRoot = (node.id || node.path || '__root__') === '__root__';
        result.push({
            id: node.id || (node.path ? node.path : '__root__'),
            name: node.name || (node.path ? node.path.split('/').pop() : '全部上传'),
            type: 'media',
            items: (isRoot ? (localCanvasAssetLibrary.items || []) : (node.items || []))
                .filter(item => ['image','video','audio'].includes(canvasAssetItemKind(item))),
            readonly: true,
            source: 'local',
        });
        (node.children || []).forEach(walk);
    };
    walk(localCanvasAssetLibrary.tree || {id:'__root__', name:'全部上传', items:localCanvasAssetLibrary.items || [], children:[]});
    return result.filter(cat => cat.id === '__root__' || cat.items.length || (localCanvasAssetLibrary.tree?.children || []).length);
}

function canvasAssetLibraryIsLocal(){
    return classicAssetPanel.state.libraryId === LOCAL_CANVAS_ASSET_LIBRARY_ID;
}

function canvasAssetSourceLibraries(){
    return [
        ...canvasAssetLibraries(),
        {id:LOCAL_CANVAS_ASSET_LIBRARY_ID, name:'本地素材', categories:localCanvasAssetFolderCategories(), readonly:true, source:'local'}
    ];
}

function activeCanvasAssetLibrary(){
    if(canvasAssetLibraryIsLocal()) return canvasAssetSourceLibraries().find(lib => lib.id === LOCAL_CANVAS_ASSET_LIBRARY_ID);
    const libs = canvasAssetLibraries();
    return libs.find(lib => lib.id === classicAssetPanel.state.libraryId) || libs[0] || null;
}

function canvasAssetCategories(){
    return (activeCanvasAssetLibrary()?.categories || canvasAssetLibrary.categories || []).filter(cat => {
        const type = String(cat.type || 'image').toLowerCase();
        return type === 'image' || type === 'media' || type === 'workflow';
    });
}

function canvasMediaCategories(){
    return (activeCanvasAssetLibrary()?.categories || canvasAssetLibrary.categories || []).filter(cat => {
        const type = String(cat.type || 'image').toLowerCase();
        return type === 'image' || type === 'media';
    });
}

function activeCanvasAssetCategory(){
    const cats = canvasAssetCategories();
    return cats.find(cat => cat.id === classicAssetPanel.state.categoryId) || cats[0] || null;
}

function activeCanvasMediaCategory(){
    const cats = canvasMediaCategories();
    return cats.find(cat => cat.id === classicAssetPanel.state.categoryId) || cats[0] || null;
}

function canvasWorkflowCategories(){
    return (activeCanvasAssetLibrary()?.categories || canvasAssetLibrary.categories || []).filter(cat => String(cat.type || '').toLowerCase() === 'workflow');
}

function activeCanvasWorkflowCategory(){
    const cats = canvasWorkflowCategories();
    return cats.find(cat => cat.id === classicAssetPanel.state.workflowCategoryId) || cats[0] || null;
}

function currentCanvasAssetItem(itemId){
    return (activeCanvasAssetCategory()?.items || []).find(item => item.id === itemId)
        || (activeCanvasWorkflowCategory()?.items || []).find(item => item.id === itemId)
        || null;
}

function canvasAssetRegisteredUris(item){
    return window.CanvasAssetAuth.resolve({},item).uris;
}

function canvasAssetUrisFaceVerified(assetUris){
    return String(assetUris?.volcengine || '').startsWith('asset://');
}

function canvasAssetFaceVerified(item){
    const provider = (apiProviders || []).find(p => p.id === 'volcengine');
    return window.CanvasAssetAuth.resolve({},item,provider).ready;
}

function canvasNodeAssetDragPayload(node){
    if(!node || node.type !== 'image' || !node.url || isMissingAssetUrl(node.url)) return null;
    const kind = mediaKindForNode(node);
    if(!['image','video'].includes(kind)) return null;
    return {
        url: node.url,
        name: node.name || outputImageName(node.url),
        kind,
        asset_uris: canvasAssetUrisForNode(node)
    };
}

function hasCanvasNodeAssetDrag(dataTransfer){
    return [...(dataTransfer?.types || [])].includes(CANVAS_NODE_ASSET_DRAG_TYPE);
}

function readCanvasNodeAssetDrag(dataTransfer){
    try {
        const payload = JSON.parse(dataTransfer?.getData?.(CANVAS_NODE_ASSET_DRAG_TYPE) || '{}');
        return payload && payload.url ? payload : null;
    } catch(_) {
        return null;
    }
}

function canvasAssetUrisForUrl(url){
    const target = String(url || '');
    if(!target) return {};
    for(const lib of canvasAssetLibraries()){
        for(const cat of (lib.categories || [])){
            for(const item of (cat.items || [])){
                const uris = item?.url === target ? canvasAssetRegisteredUris(item) : {};
                if(uris.volcengine) return uris;
            }
        }
    }
    return {};
}

function canvasAssetUrisForNode(node){
    return canvasFaceAuthState(node).uris;
}

function canvasFaceAuthState(ref, provider=null){
    provider ||= (apiProviders || []).find(p => p.id === 'volcengine');
    return window.CanvasAssetAuth.resolve(ref,window.CanvasAssetAuth.findItem(canvasAssetLibraries(),ref),provider);
}

function canvasAssetItemKind(item){
    const explicit = String(item?.kind || item?.mediaKind || '').toLowerCase();
    if(['image','video','audio','text','file','workflow'].includes(explicit)) return explicit;
    if(String(item?.type || '').toLowerCase() === 'workflow') return 'workflow';
    const url = String(item?.url || item || '');
    if(/\.(json|zip)(\?|#|$)/i.test(url)) return 'workflow';
    if(isVideoUrl(url)) return 'video';
    if(isAudioUrl(url)) return 'audio';
    return 'image';
}

function canvasAssetThumbHtml(item){
    const kind = canvasAssetItemKind(item);
    const url = escapeAttr(item?.url || '');
    const thumbUrl = item?.thumbnail || item?.url || '';
    const faceBadge = canvasAssetFaceVerified(item) ? `<span class="canvas-face-verified-badge" title="素材已就绪" aria-label="素材已就绪"><i data-lucide="shield-check"></i></span>` : '';
    if(kind === 'video'){
        return `<div class="canvas-asset-thumb-wrap">${canvasVideoPreviewHtml(item?.url || '', 512, 'class="canvas-asset-thumb" alt=""')}<div class="canvas-asset-video-badge"><i data-lucide="play"></i><span>VIDEO</span></div>${faceBadge}</div>`;
    }
    if(kind === 'audio'){
        return `<div class="canvas-asset-thumb-wrap canvas-asset-file-thumb"><i data-lucide="file-audio" class="w-6 h-6"></i><span>${escapeHtml(item?.name || 'audio')}</span>${faceBadge}</div>`;
    }
    if(kind === 'workflow'){
        return `<div class="canvas-asset-thumb-wrap canvas-asset-file-thumb workflow-thumb"><i data-lucide="workflow" class="w-6 h-6"></i><span>${escapeHtml(item?.name || 'workflow')}</span></div>`;
    }
    return `<div class="canvas-asset-thumb-wrap">${canvasPreviewImgHtml(thumbUrl, 512, 'class="canvas-asset-thumb" alt=""')}${faceBadge}</div>`;
}

function positionCanvasAssetHoverPreview(event){ canvasAssetHover.move(event); }

function showCanvasAssetHoverPreview(event, item){ canvasAssetHover.enter(event, item); }

function hideCanvasAssetHoverPreview(){ canvasAssetHover.hide(); }

function positionCanvasAssetHoverPreviewNow(event){
    if(!classicAssetPanel.elements.canvasAssetHoverPreview || classicAssetPanel.elements.canvasAssetHoverPreview.hidden || classicAssetPanel.elements.canvasAssetHoverPreview.style.display === 'none') return;
    const pad = 14;
    const w = classicAssetPanel.elements.canvasAssetHoverPreview.offsetWidth || 280;
    const h = classicAssetPanel.elements.canvasAssetHoverPreview.offsetHeight || 330;
    let left = event.clientX - w - 16;
    if(left < pad) left = event.clientX + 16;
    left = Math.max(pad, Math.min(window.innerWidth - w - pad, left));
    const top = Math.max(pad, Math.min(window.innerHeight - h - pad, event.clientY + 12));
    classicAssetPanel.elements.canvasAssetHoverPreview.style.left = `${left}px`;
    classicAssetPanel.elements.canvasAssetHoverPreview.style.top = `${top}px`;
}

function showCanvasAssetHoverPreviewNow(event, item){
    if(!classicAssetPanel.elements.canvasAssetHoverPreview || !item?.url) return;
    if(canvasAssetItemKind(item) === 'workflow') return;
    const img = classicAssetPanel.elements.canvasAssetHoverPreview.querySelector('img');
    const video = classicAssetPanel.elements.canvasAssetHoverPreview.querySelector('video');
    const isVideo = canvasAssetItemKind(item) === 'video';
    const name = classicAssetPanel.elements.canvasAssetHoverPreview.querySelector('.canvas-asset-hover-name');
    if(img){
        img.style.display = 'block';
        img.src = item.previewUrl || canvasMediaPreviewUrl(isVideo ? item.url : (item.thumbnail || item.url || ''), 512);
        img.dataset.previewSrc = img.src || '';
        img.dataset.originalSrc = item.url || item.thumbnail || '';
        img.dataset.url = item.url || item.thumbnail || '';
        img.dataset.previewKind = isVideo ? 'video' : '';
        img.alt = item.name || 'asset preview';
    }
    if(video){
        video.style.display = 'none';
        video.removeAttribute('src');
    }
    bindCanvasPreviewImageFallbacks(classicAssetPanel.elements.canvasAssetHoverPreview);
    if(name) name.textContent = item.name || 'asset';
    classicAssetPanel.elements.canvasAssetHoverPreview.hidden = false;
    classicAssetPanel.elements.canvasAssetHoverPreview.style.display = 'block';
    positionCanvasAssetHoverPreview(event);
}

function hideCanvasAssetHoverPreviewNow(){
    if(!classicAssetPanel.elements.canvasAssetHoverPreview) return;
    classicAssetPanel.elements.canvasAssetHoverPreview.style.display = 'none';
    classicAssetPanel.elements.canvasAssetHoverPreview.hidden = true;
    const img = classicAssetPanel.elements.canvasAssetHoverPreview.querySelector('img');
    if(img) img.removeAttribute('src');
    const video = classicAssetPanel.elements.canvasAssetHoverPreview.querySelector('video');
    if(video) {
        video.pause?.();
        video.removeAttribute('src');
    }
}

async function renameCanvasAssetItem(itemId){
    const item = currentCanvasAssetItem(itemId);
    const name = window.prompt('资产名称', item?.name || '');
    if(!item || !String(name || '').trim()) return;
    const data = await classicAssetPanel.mutate(() => window.CanvasApi.updateAssetItem(item.id, {name:String(name).trim()}));
    setCanvasAssetLibraryFromResponse(data, {render:false});
    renderCanvasAssetLibrary();
    if(classicLibraryManager.state.open) updateAssetManager();
}

async function deleteCanvasAssetItem(itemId){
    const item = currentCanvasAssetItem(itemId);
    if(!item || !window.confirm(`删除资产「${item.name || 'asset'}」？`)) return;
    const data = await classicAssetPanel.mutate(() => window.CanvasApi.deleteAssetItem(item.id));
    setCanvasAssetLibraryFromResponse(data, {render:false});
    classicLibraryManager.itemsRemoved(item.id);
    hideCanvasAssetHoverPreview();
    renderCanvasAssetLibrary();
    if(classicLibraryManager.state.open) updateAssetManager();
}

async function loadCanvasAssetLibrary({renderPanel=true}={}){
    if(classicAssetPanel.destroyed) return null;
    const readToken = classicAssetPanel.beginRead();
    try {
        const [data, localData] = await window.CanvasApi.getAssetLibraries();
        if(!classicAssetPanel.acceptsRead(readToken)) return null;
        const before = new Map(nodes.filter(node => node.type === 'image').map(node => [node.id,JSON.stringify(canvasFaceAuthState(node))]));
        localCanvasAssetLibrary = {items:Array.isArray(localData.items) ? localData.items : [], tree:localData.tree || null};
        setCanvasAssetLibraryFromResponse(data, {readToken, render:false});
        const changed = nodes.filter(node => node.type === 'image' && before.get(node.id) !== JSON.stringify(canvasFaceAuthState(node))).map(node => node.id);
        if(changed.length) refreshNodes(changed);
        if(renderPanel) classicAssetSelectionChanged(classicAssetPanel.state, {type:'reconcile'});
        return data;
    } catch(e) {
        if(classicAssetPanel.acceptsRead(readToken)) setStatus('资产库加载失败');
        return null;
    }
}

function renderCanvasAssetLibrary({preserveScroll=false}={}){
    if(classicAssetPanel.destroyed) return;
    const events = classicAssetPanel.events('cards');
    if(!classicAssetPanel.elements.canvasAssetPanel || !classicAssetPanel.elements.canvasAssetGrid) return;
    const scrollTop = preserveScroll ? classicAssetPanel.elements.canvasAssetGrid.scrollTop : 0;
    hideCanvasAssetHoverPreview();
    const libs = canvasAssetSourceLibraries();
    if(classicAssetPanel.elements.canvasAssetLibrarySelect){
        classicAssetPanel.elements.canvasAssetLibrarySelect.innerHTML = libs.map(lib => `<option value="${escapeAttr(lib.id)}" ${lib.id === classicAssetPanel.state.libraryId ? 'selected' : ''}>${escapeHtml(lib.name || '资产库')}</option>`).join('');
    }
    const cats = canvasAssetCategories();
    if(classicAssetPanel.elements.canvasAssetCategorySelect){
        classicAssetPanel.elements.canvasAssetCategorySelect.innerHTML = cats.map(cat => {
            const type = String(cat.type || 'image').toLowerCase();
            const prefix = type === 'workflow' ? '工作流 / ' : '';
            return `<option value="${escapeAttr(cat.id)}" ${cat.id === classicAssetPanel.state.categoryId ? 'selected' : ''}>${escapeHtml(prefix + (cat.name || '默认分组'))}</option>`;
        }).join('');
    }
    const cat = activeCanvasAssetCategory();
    const catType = String(cat?.type || 'image').toLowerCase();
    const localMode = canvasAssetLibraryIsLocal();
    if(classicAssetPanel.elements.canvasAssetAddCategoryBtn) classicAssetPanel.elements.canvasAssetAddCategoryBtn.disabled = localMode;
    if(classicAssetPanel.elements.canvasAssetDropZone) {
        classicAssetPanel.elements.canvasAssetDropZone.style.display = localMode ? 'none' : 'flex';
        classicAssetPanel.elements.canvasAssetDropZone.textContent = catType === 'workflow' ? '工作流分组支持上传/导出工作流，双击卡片导入画布' : '拖入图片或输出保存到当前分组';
    }
    const query = classicAssetPanel.state.query.trim().toLowerCase();
    const allItems = cat?.items || [];
    const items = query ? allItems.filter(item => String(item?.name || '').toLowerCase().includes(query)) : allItems;
    const renderKey = `${classicAssetPanel.state.libraryId}\u0000${classicAssetPanel.state.categoryId}\u0000${query}`;
    const visibleItems = classicAssetPanel.page(items, renderKey);
    classicAssetPanel.elements.canvasAssetGrid.innerHTML = visibleItems.length ? visibleItems.map(item => `
        <div class="canvas-asset-item" draggable="true" data-asset-id="${escapeAttr(item.id || '')}" data-url="${escapeAttr(item.url)}" data-name="${escapeAttr(item.name || 'asset')}" data-kind="${escapeAttr(canvasAssetItemKind(item))}" data-asset-uris="${escapeAttr(JSON.stringify(canvasAssetRegisteredUris(item)))}">
            ${canvasAssetThumbHtml(item)}
            <div class="canvas-asset-meta">
                <span class="canvas-asset-name" title="${escapeAttr(item.name || '')}">${escapeHtml(item.name || 'asset')}</span>
                ${localMode
                    ? `<span class="canvas-asset-local-tag">本地</span>`
                    : `<button class="canvas-asset-action" type="button" data-canvas-asset-rename="${escapeAttr(item.id || '')}" title="重命名" aria-label="重命名"><i data-lucide="pencil" class="w-4 h-4"></i></button>
                       <button class="canvas-asset-action danger" type="button" data-canvas-asset-delete="${escapeAttr(item.id || '')}" title="删除" aria-label="删除"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`}
            </div>
        </div>
    `).join('') + (visibleItems.length < items.length ? '<div class="canvas-asset-more">继续向下滚动加载更多</div>' : '') : `<div class="canvas-asset-empty">${escapeHtml(query && allItems.length ? '没有找到匹配名称的素材' : (localMode ? '暂无本地素材，请在素材库管理中上传' : '当前分组还没有资产'))}</div>`;
    bindCanvasPreviewImageFallbacks(classicAssetPanel.elements.canvasAssetGrid);
    classicAssetPanel.elements.canvasAssetGrid.querySelectorAll('.canvas-asset-item').forEach(card => {
        events.on(card, 'dragstart', event => {
            event.dataTransfer.effectAllowed = 'copy';
            let assetUris = {};
            try { assetUris = JSON.parse(card.dataset.assetUris || '{}') || {}; } catch(e) { assetUris = {}; }
            event.dataTransfer.setData('application/x-canvas-asset', JSON.stringify({url:card.dataset.url, name:card.dataset.name, kind:card.dataset.kind || '', asset_uris:assetUris, asset_item_id:card.dataset.assetId, asset_library_id:classicAssetPanel.state.libraryId}));
            event.dataTransfer.setData('text/plain', card.dataset.url || '');
        });
        events.on(card, 'dblclick', () => {
            if(card.dataset.kind === 'workflow') importWorkflowAssetUrl(card.dataset.url, card.dataset.name || 'workflow');
            else {
                let assetUris = {};
                try { assetUris = JSON.parse(card.dataset.assetUris || '{}') || {}; } catch(e) { assetUris = {}; }
                createImageCardFromUrl(card.dataset.url, defaultPoint(0, 0), card.dataset.name || 'asset', {kind:card.dataset.kind || '', asset_uris:assetUris, asset_item_id:card.dataset.assetId, asset_library_id:classicAssetPanel.state.libraryId});
            }
        });
        const item = visibleItems.find(entry => entry.id === card.dataset.assetId);
        events.on(card, 'mouseenter', event => showCanvasAssetHoverPreview(event, {...item, previewUrl:card.querySelector('img')?.currentSrc}));
        events.on(card, 'mousemove', positionCanvasAssetHoverPreview);
        events.on(card, 'mouseleave', hideCanvasAssetHoverPreview);
        card.querySelectorAll('.canvas-asset-action').forEach(btn => {
            events.on(btn, 'pointerdown', event => event.stopPropagation());
            events.on(btn, 'dblclick', event => event.stopPropagation());
        });
        events.on(card.querySelector('[data-canvas-asset-rename]'), 'click', async event => {
            event.preventDefault();
            event.stopPropagation();
            hideCanvasAssetHoverPreview();
            await renameCanvasAssetItem(event.currentTarget.dataset.canvasAssetRename || '');
        });
        events.on(card.querySelector('[data-canvas-asset-delete]'), 'click', async event => {
            event.preventDefault();
            event.stopPropagation();
            await deleteCanvasAssetItem(event.currentTarget.dataset.canvasAssetDelete || '');
        });
    });
    classicAssetPanel.elements.canvasAssetGrid.scrollTop = preserveScroll ? scrollTop : 0;
    refreshIcons();
}

function toggleCanvasAssetLibrary(open=!classicAssetPanel.state.open){
    if(classicAssetPanel.destroyed) return;
    classicAssetPanel.setOpen(!!open);
    if(classicAssetPanel.state.open && workflowTransferModal?.classList.contains('open')) closeWorkflowTransferModal();
    if(!classicAssetPanel.state.open) hideCanvasAssetHoverPreview();
    if(classicAssetPanel.state.open) loadCanvasAssetLibrary();
}

function canvasAssetPanelMaxWidth(){
    const horizontalMargin = window.innerWidth <= 760 ? 28 : 48;
    return Math.max(0, window.innerWidth - horizontalMargin);
}

function clampCanvasAssetPanelWidth(width){
    const maxWidth = canvasAssetPanelMaxWidth();
    const minWidth = Math.min(CANVAS_ASSET_PANEL_MIN_WIDTH, maxWidth);
    const value = Number.isFinite(Number(width)) ? Number(width) : CANVAS_ASSET_PANEL_DEFAULT_WIDTH;
    return Math.round(Math.min(Math.max(value, minWidth), maxWidth));
}

function applyCanvasAssetPanelWidth(width, {persist=false, updatePreferred=true}={}){
    if(!classicAssetPanel.elements.canvasAssetPanel) return;
    const nextWidth = clampCanvasAssetPanelWidth(width);
    classicAssetPanel.elements.canvasAssetPanel.style.width = `${nextWidth}px`;
    if(updatePreferred) classicAssetPanel.setWidth(nextWidth);
    classicAssetPanel.elements.canvasAssetResizeHandle?.setAttribute('aria-valuenow', String(nextWidth));
    classicAssetPanel.elements.canvasAssetResizeHandle?.setAttribute('aria-valuemax', String(canvasAssetPanelMaxWidth()));
    if(persist){
        try { localStorage.setItem(CANVAS_ASSET_PANEL_WIDTH_KEY, String(classicAssetPanel.state.width)); } catch(e) {}
    }
}

function finishCanvasAssetPanelResize(){
    classicAssetPanel.clearEvents('resize');
    if(!classicAssetPanel.state.resize) return;
    classicAssetPanel.setResize(null);
    classicAssetPanel.elements.canvasAssetPanel?.classList.remove('resizing');
    document.body.classList.remove('canvas-asset-panel-resizing');
    applyCanvasAssetPanelWidth(classicAssetPanel.state.width, {persist:true});
}

async function addUrlToCanvasAssetLibrary(url, name='', target=classicAssetPanel.captureSelection()){
    if(target.libraryId === LOCAL_CANVAS_ASSET_LIBRARY_ID){ setStatus('本地素材请在素材库管理中上传'); return; }
    const cat = (canvasAssetLibraries().find(lib=>lib.id === target.libraryId)?.categories || []).find(cat=>cat.id === target.categoryId);
    if(!cat){ setStatus('请先创建资产分组'); return; }
    if(String(cat.type || 'image').toLowerCase() === 'workflow'){ setStatus('当前是工作流分组，请切换到图片分组保存媒体'); return; }
    const data = await classicAssetPanel.mutate(() => window.CanvasApi.createAssetItem({library_id:target.libraryId, category_id:cat.id, url, name}, {errorFallback:'保存失败'}));
    setCanvasAssetLibraryFromResponse(data, {render:false});
    renderCanvasAssetLibrary();
    setStatus('已保存到资产库');
    return data;
}

function canvasAssetItemLocation(itemId){
    for(const library of canvasAssetLibraries()) for(const category of library.categories || []) {
        const item = (category.items || []).find(entry => entry.id === itemId);
        if(item) return {item, libraryId:library.id, categoryId:category.id};
    }
    return null;
}

async function ensureImageNodeAsset(node, target=null){
    const origin = classicAssetPanel.captureSelection();
    const initialCategoryId = activeCanvasMediaCategory()?.id;
    const sourceUrl = node.url;
    if(!canvasAssetLibraries().length || !activeCanvasAssetCategory()) await loadCanvasAssetLibrary({renderPanel:false});
    if(!nodes.includes(node) || node.url !== sourceUrl) throw new Error('图片已更改，请重新认证。');
    const linked = node.asset_item_id && canvasAssetItemLocation(node.asset_item_id);
    if(linked && (!target || (linked.libraryId === target.libraryId && linked.categoryId === target.categoryId))) {
        classicAssetPanel.selectTarget({libraryId:linked.libraryId, categoryId:linked.categoryId}, {expected:origin});
        return linked;
    }
    const libraryId = target?.libraryId || origin.libraryId || classicAssetPanel.state.libraryId;
    const categoryId = target?.categoryId || initialCategoryId || activeCanvasMediaCategory()?.id;
    if(!libraryId || !categoryId || libraryId === LOCAL_CANVAS_ASSET_LIBRARY_ID) throw new Error('请选择可编辑的素材库图片分组');
    const data = await classicAssetPanel.mutate(() => window.CanvasApi.createAssetItem({library_id:libraryId, category_id:categoryId, url:node.url, name:node.name || outputImageName(node.url)}, {errorFallback:'上传素材库失败'}));
    setCanvasAssetLibraryFromResponse(data, {render:false});
    if(!nodes.includes(node) || node.url !== sourceUrl) throw new Error('图片已更改，请重新认证。');
    classicAssetPanel.selectTarget({libraryId, categoryId}, {expected:origin, render:false});
    node.asset_item_id = data.item?.id || '';
    node.asset_library_id = libraryId;
    node.asset_uris = canvasAssetRegisteredUris(data.item);
    node.face_auth_status = '';
    renderCanvasAssetLibrary();
    scheduleSave();
    return {item:data.item, libraryId, categoryId};
}

async function saveImageNodeToAssetLibrary(nodeId, target=null){
    const node = nodes.find(entry => entry.id === nodeId);
    if(!node?.url || !['image','video'].includes(mediaKindForNode(node))) return;
    try {
        const location = node.asset_item_id && canvasAssetItemLocation(node.asset_item_id);
        const linked = Boolean(location && (!target || (location.libraryId === target.libraryId && location.categoryId === target.categoryId)));
        await ensureImageNodeAsset(node, target);
        setStatus(linked ? '该素材已在素材库中' : '已上传到素材库');
    } catch(err) {
        showErrorModal(err.message || '上传素材库失败', '上传素材库');
    }
}

function canvasAvatarPlatform(provider){
    return window.CanvasAssetAuth.registrationPlatform(provider);
}

function quickCanvasAvatarProvider(){
    return window.CanvasAssetAuth.registrationProvider(apiProviders);
}

async function canvasAvatarRequest(path, libraryId, providerId){
    const request = async () => {
        const response = await fetch(path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({library_id:libraryId, provider_id:providerId})});
        if(!response.ok) throw new Error(await responseErrorMessage(response, '素材认证失败'));
        return response.json();
    };
    // Guard only the library snapshot; the caller still processes the item receipt.
    return path.endsWith('/avatar-status') ? classicAssetPanel.readResponse(request) : classicAssetPanel.mutate(request);
}

function pollImageNodeFaceAuth(nodeId, itemId, libraryId, provider, attempt=0){
    if(attempt >= 100) return;
    const source = nodes.find(entry => entry.id === nodeId);
    const sourceUrl = source?.url;
    const isCurrent = () => nodes.includes(source) && source.url === sourceUrl
        && source.asset_item_id === itemId && source.asset_library_id === libraryId;
    setTimeout(async () => {
        const node = nodes.find(entry => entry.id === nodeId);
        if(!isCurrent()) return;
        try {
            const data = await canvasAvatarRequest(`/api/asset-library/items/${encodeURIComponent(itemId)}/avatar-status`, libraryId, provider.id);
            setCanvasAssetLibraryFromResponse(data, {render:false});
            if(!isCurrent()) return;
            const registration = data.item?.registrations?.[canvasAvatarPlatform(provider)] || {};
            if(registration.status === 'Active') {
                node.face_auth_status = 'Active';
                node.asset_uris = canvasAssetRegisteredUris(data.item);
                refreshNodes([node.id]);
                scheduleSave();
                if(classicAssetPanel.state.open) renderCanvasAssetLibrary();
                setStatus('素材认证已通过');
            } else if(registration.status === 'Failed') {
                node.face_auth_status = 'Failed';
                node.asset_uris = {};
                refreshNodes([node.id]);
                scheduleSave();
                setStatus(registration.detail || '素材认证未通过');
            } else pollImageNodeFaceAuth(nodeId, itemId, libraryId, provider, attempt + 1);
        } catch(err) {
            if(!isCurrent()) return;
            if(attempt < 2) pollImageNodeFaceAuth(nodeId, itemId, libraryId, provider, attempt + 1);
            else setStatus(err.message || '认证状态查询失败');
        }
    }, 6000);
}

async function quickFaceAuthImageNode(nodeId, target=null){
    const node = nodes.find(entry => entry.id === nodeId);
    if(!node?.url || !['image','video'].includes(mediaKindForNode(node))) return;
    const sourceUrl = node.url;
    const provider = quickCanvasAvatarProvider();
    if(!provider){ showErrorModal('请先在 API 平台管理中启用并配置火山引擎。', '快速素材认证'); return; }
    if(!window.CanvasAssetAuth.registrationReady(provider)){ showErrorModal('火山引擎素材认证需要 AK/SK，请在管理平台补齐 Access Key ID 和 Secret Access Key。', '快速素材认证'); return; }
    try {
        setStatus('正在上传素材并提交素材认证…');
        const {item, libraryId} = await ensureImageNodeAsset(node, target);
        if(!nodes.includes(node) || node.url !== sourceUrl) return;
        const platform = canvasAvatarPlatform(provider);
        const registration = item?.registrations?.[platform] || {};
        const auth = window.CanvasAssetAuth.resolve({},item,provider);
        if(auth.status === 'ScopeMismatch'){ showErrorModal(window.CanvasAssetAuth.error(auth.status),'素材认证'); return; }
        if(registration.status === 'Active') {
            node.face_auth_status = 'Active';
            node.asset_uris = canvasAssetRegisteredUris(item);
            render();
            scheduleSave();
            setStatus('该素材已通过素材认证');
            return;
        }
        if(registration.status === 'Processing') {
            node.face_auth_status = 'Processing';
            node.asset_uris = {};
            render();
            scheduleSave();
            setStatus('该素材正在审核，稍后自动更新');
            pollImageNodeFaceAuth(nodeId, item.id, libraryId, provider);
            return;
        }
        node.face_auth_status = 'Processing';
        node.asset_uris = {};
        render();
        scheduleSave();
        const data = await canvasAvatarRequest(`/api/asset-library/items/${encodeURIComponent(item.id)}/register-avatar`, libraryId, provider.id);
        setCanvasAssetLibraryFromResponse(data, {render:false});
        setStatus(`已提交 ${provider.name || provider.id} 审核，稍后自动更新`);
        pollImageNodeFaceAuth(nodeId, item.id, libraryId, provider);
    } catch(err) {
        if(!nodes.includes(node) || node.url !== sourceUrl) return;
        node.face_auth_status = 'Failed';
        node.asset_uris = {};
        render();
        scheduleSave();
        showErrorModal(err.message || '素材认证提交失败', '快速素材认证');
    }
}

async function uploadFilesToLibrary(files, libraryId, categoryId){
    const form = new FormData();
    [...files].forEach(file => form.append('files', file));
    const uploaded = await window.CanvasApi.uploadAi(form);
    const items = (uploaded.files || []).filter(file => file?.url).map(file => ({library_id:libraryId, category_id:categoryId, url:file.url, name:file.name || 'asset'}));
    if(!items.length) return null;
    return classicAssetPanel.mutate(() => window.CanvasApi.createAssetItemsBatch({library_id:libraryId, category_id:categoryId, items}));
}

function openAssetManager(...args){return classicLibraryManager.open(...args);}

function closeAssetManager(...args){return classicLibraryManager.close(...args);}

function renderAssetManager(...args){return classicLibraryManager.render(...args);}

function renderImageAssetManager(...args){return classicLibraryManager.renderImages(...args);}

function workflowAssetThumbHtml(item){
    return `<div class="asset-manager-card-text workflow-manager-thumb"><i data-lucide="workflow" class="w-6 h-6"></i><span>${escapeHtml(item?.format === 'json' ? 'JSON 工作流' : 'ZIP 工作流包')}</span></div>`;
}

function renderWorkflowAssetManager(...args){return classicLibraryManager.renderWorkflows(...args);}

function renderPromptAssetManager(...args){return classicLibraryManager.renderPrompts(...args);}

function createClassicPromptPanel(){
    let promptTemplateNodeId = '';
    let promptTemplateCategory = 'all';
    let promptTemplateSelectedId = '';
    let promptTemplateQuery = '';
    let promptTemplateEditing = false;
    let activePromptLibraryId = 'system';
    let promptTemplateGroupEditMode = false;
    let promptTemplateModal = document.getElementById('promptTemplateModal');
    let promptTemplatePanel = document.getElementById('promptTemplatePanel') || promptTemplateModal?.querySelector('.prompt-template-panel');
    let promptTemplateClose = document.getElementById('promptTemplateClose');
    let promptTemplateSearch = document.getElementById('promptTemplateSearch');
    let promptTemplateLibrarySelect = document.getElementById('promptTemplateLibrarySelect');
    let promptTemplateCats = document.getElementById('promptTemplateCats');
    let promptTemplateBody = document.getElementById('promptTemplateBody');
    // Only this closure owns UI choices, targets, DOM and cancellable work. Content remains in the entry.
    let templateOpen = false, opening = false, templateVersion = 0, targetCanvasId = '';
    let suspended = false, destroyed = false, scrollFrame = null, pendingOpen = null;
    const bindings = [];

    function alive(){ return !destroyed && !suspended; }
    function captureTemplate(){ return Object.freeze({version:templateVersion,canvasId:canvas?.id || '',libraryId:activePromptLibraryId}); }
    function current(origin){ return alive() && origin.version === templateVersion && origin.canvasId === (canvas?.id || ''); }
    function validNodeTarget(){ return targetCanvasId === canvas?.id && Boolean(nodes.find(n => n.id === promptTemplateNodeId && n.type === 'prompt')); }
    function acceptChoice(origin,patch){
        if(!current(origin)) return;
        if('libraryId' in patch) activePromptLibraryId = patch.libraryId;
        if('categoryId' in patch) promptTemplateCategory = patch.categoryId;
        if('itemId' in patch) promptTemplateSelectedId = patch.itemId;
        if('editing' in patch) promptTemplateEditing = patch.editing;
    }
    function normalize(){
        if(!alive()) return;
        const libs = canvasPromptLibraries;
        if(!libs.some(lib => lib.id === activePromptLibraryId)) activePromptLibraryId = libs.some(lib => lib.id === 'system') ? 'system' : (libs[0]?.id || 'system');
        canvasPromptTemplates = implActiveCanvasPromptLibraryItems();
        const groups = implActiveCanvasPromptTemplateGroups();
        if(promptTemplateCategory !== 'all' && !groups.some(group => group.id === promptTemplateCategory)) promptTemplateCategory = 'all';
        const query = String(promptTemplateQuery || '').trim().toLowerCase();
        const items = implActiveCanvasPromptLibraryItems().filter(item => (promptTemplateCategory === 'all' || item.category === promptTemplateCategory) && (!query || implCanvasPromptTemplateSearchText(item).includes(query)));
        if(!items.some(item => item.id === promptTemplateSelectedId)){
            promptTemplateSelectedId = items[0]?.id || ''; promptTemplateEditing = false;
        }
        if(!promptTemplateSelectedId) promptTemplateEditing = false;
    }
    function refreshTemplate(options={}){
        if(!alive()) return;
        normalize();
        if(templateOpen) implRenderPromptTemplateModal(options);
        else implRenderCanvasPromptLibrarySelect();
    }
    function dataChanged(options={}){
        const previousItem = promptTemplateSelectedId;
        if(!alive()) return;
        normalize();
        if(options.render !== false && templateOpen && !(options.preserveDraft && promptTemplateEditing && previousItem === promptTemplateSelectedId)) implRenderPromptTemplateModal();
        else if(options.render !== false) implRenderCanvasPromptLibrarySelect();

    }
    function refreshFromReceipt(origin,options={}){
        if(current(origin)) refreshTemplate(options);
        else dataChanged({preserveDraft:true});
    }
    function selectCategory(id){
        if(!alive()) return;
        templateVersion++;
        promptTemplateCategory = id || 'all'; promptTemplateSelectedId = ''; promptTemplateEditing = false;
        refreshTemplate({});
    }
    function selectTemplate(id){
        if(!alive()) return;
        templateVersion++; promptTemplateSelectedId = id || ''; promptTemplateEditing = false;
        refreshTemplate();
    }
    function setQuery(query){
        if(!alive()) return;
        templateVersion++; promptTemplateQuery = String(query || '');
        if(promptTemplateSearch) promptTemplateSearch.value = promptTemplateQuery;
        refreshTemplate({});
    }
    function setEditing(value){
        if(!alive()) return;
        templateVersion++; promptTemplateEditing = Boolean(value); refreshTemplate();
    }
    function toggleGroups(){
        if(!alive()) return;
        templateVersion++; promptTemplateGroupEditMode = !promptTemplateGroupEditMode;
        refreshTemplate({});
    }
    function selectLibrary(id,options={}){
        if(!alive()) return;
        templateVersion++; activePromptLibraryId = id || 'system';
        promptTemplateSelectedId = ''; promptTemplateEditing = false;

        if(options.source === "manager") classicLibraryManager.promptLibraryChanged();

        refreshTemplate({});
        if(classicLibraryManager.state.open) updateAssetManager();
    }
    function listen(target,type,handler,options){
        if(!target) return;
        target.addEventListener(type,handler,options);
        bindings.push(() => target.removeEventListener(type,handler,options));
    }
    function clearBindings(){ bindings.splice(0).forEach(remove => remove()); }
    function cancelScroll(){ if(scrollFrame !== null) cancelAnimationFrame(scrollFrame); scrollFrame = null; }

    async function implLoadCanvasPromptTemplates(){
        if(!alive()) return;
        if(canvasPromptTemplatesLoaded) return canvasPromptTemplates;
        const origin = captureTemplate();
        try {
            implLoadCanvasPromptTemplateGroups();
            implLoadCanvasPromptTemplateOverrides();
            const data = await window.CanvasApi.getPromptLibraries();
            canvasPromptLibraries = Array.isArray(data.library?.libraries) ? data.library.libraries : [];

            canvasPromptTemplates = implActiveCanvasPromptLibraryItems();
        } catch(e) {
            canvasPromptTemplates = [];
            canvasPromptLibraries = [];
        }
        canvasPromptTemplatesLoaded = true;
        if(current(origin)) normalize();
        return canvasPromptTemplates;
    }

    function implActiveCanvasPromptLibrary(){
        return canvasPromptLibraries.find(lib => lib.id === activePromptLibraryId) || canvasPromptLibraries[0] || {id:'system', name:'系统提示词库', readonly:true, items:[]};
    }

    function implDefaultCanvasPromptTemplateGroups(){
        return [
            {id:'view', name:'视角'},
            {id:'storyboard', name:'分镜'},
            {id:'character', name:'角色'},
            {id:'product', name:'产品'},
            {id:'lighting', name:'光影'},
            {id:'mine', name:'我的'}
        ];
    }

    function implLoadCanvasPromptTemplateGroups(){
        if(!alive()) return;
        try {
            const list = JSON.parse(localStorage.getItem(CANVAS_PROMPT_TEMPLATE_GROUPS_KEY) || '[]');
            const valid = Array.isArray(list) ? list.filter(g => g?.id && g?.name) : [];
            const defaults = implDefaultCanvasPromptTemplateGroups();
            promptTemplateGroups = defaults.map(group => valid.find(g => g.id === group.id) || group);
            valid.filter(g => !promptTemplateGroups.some(x => x.id === g.id)).forEach(g => promptTemplateGroups.push(g));
        } catch(e) {
            promptTemplateGroups = implDefaultCanvasPromptTemplateGroups();
        }
    }

    function implSaveCanvasPromptTemplateGroups(){
        if(!alive()) return;
        localStorage.setItem(CANVAS_PROMPT_TEMPLATE_GROUPS_KEY, JSON.stringify(promptTemplateGroups));
    }

    function implLoadCanvasPromptTemplateOverrides(){
        if(!alive()) return;
        try {
            const data = JSON.parse(localStorage.getItem(CANVAS_PROMPT_TEMPLATE_OVERRIDES_KEY) || '{}');
            canvasPromptTemplateOverrides = {
                hiddenBuiltinIds:Array.isArray(data.hiddenBuiltinIds) ? data.hiddenBuiltinIds : [],
                editedBuiltins:data.editedBuiltins && typeof data.editedBuiltins === 'object' ? data.editedBuiltins : {}
            };
        } catch(e) {
            canvasPromptTemplateOverrides = {hiddenBuiltinIds:[], editedBuiltins:{}};
        }
    }

    function implSaveCanvasPromptTemplateOverrides(){
        if(!alive()) return;
        localStorage.setItem(CANVAS_PROMPT_TEMPLATE_OVERRIDES_KEY, JSON.stringify(canvasPromptTemplateOverrides));
    }

    function implActiveCanvasPromptLibraryItems(){
        const lib = implActiveCanvasPromptLibrary();
        const hidden = new Set(canvasPromptTemplateOverrides.hiddenBuiltinIds || []);
        if(lib.id !== 'system'){
            return (lib.items || []).filter(t => t?.id && t?.positive).map(t => ({
                ...t,
                sourceId:t.id,
                remote:true,
                libraryId:lib.id,
                libraryName:lib.name || '提示词库',
                builtin:false,
            }));
        }
        const system = canvasPromptLibraries.find(item => item.id === 'system') || lib;
        const builtins = (system.items || [])
            .filter(t => t?.id && t?.positive && !hidden.has(t.id))
            .map(t => ({
                ...t,
                ...(canvasPromptTemplateOverrides.editedBuiltins?.[t.id] || {}),
                sourceId:t.id,
                builtin:true,
                remote:false,
                libraryId:'system',
                libraryName:'系统提示词库',
            }));
        const remotes = canvasPromptLibraries
            .filter(item => item.id !== 'system')
            .flatMap(item => (item.items || [])
                .filter(t => t?.id && t?.positive)
                .map(t => ({
                    ...t,
                    sourceId:t.id,
                    remote:true,
                    builtin:false,
                    libraryId:item.id,
                    libraryName:item.name || '提示词库',
                })));
        return [...builtins, ...remotes];
    }

    function implRefreshCanvasPromptTemplatesFromLibraries(options={}){
        canvasPromptTemplatesLoaded = true;
        dataChanged({preserveDraft:true,...options});
    }

    function implRenderCanvasPromptLibrarySelect(){
        if(!alive()) return;
        if(!promptTemplateLibrarySelect) return;
        promptTemplateLibrarySelect.innerHTML = canvasPromptLibraries.map(lib => `<option value="${escapeAttr(lib.id)}" ${lib.id === activePromptLibraryId ? 'selected' : ''}>${escapeHtml(lib.name || '提示词库')}</option>`).join('');
    }

    function implActiveCanvasPromptTemplateGroups(){
        const lib = implActiveCanvasPromptLibrary();
        if(!lib || lib.id === 'system') return promptTemplateGroups;
        return Array.isArray(lib.categories) ? lib.categories.filter(c => c?.id && c?.name) : [];
    }

    function implCanvasPromptTemplateCategoryLabel(category){
        if(category === 'all') return '全部';
        const lib = implActiveCanvasPromptLibrary();
        if(lib && lib.id !== 'system'){
            return implActiveCanvasPromptTemplateGroups().find(g => g.id === category)?.name || category || '';
        }
        const builtin = {
            view:'视角',
            storyboard:'分镜',
            character:'角色',
            product:'产品',
            lighting:'光影',
            mine:'我的'
        };
        return builtin[category] || promptTemplateGroups.find(g => g.id === category)?.name || category || '';
    }

    function implCanvasPromptTemplateName(template){

        return template?.name || '';
    }

    function implCanvasPromptTemplateScene(template){

        return template?.scene || '';
    }

    function implCanvasPromptTemplateText(template, mode='positive'){
        const positive = String(template?.positive || '').trim();
        if(mode === 'positive') return positive;
        const negative = String(template?.negative || '').trim();
        const params = Object.entries(template?.params || {})
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');
        return [positive, negative ? `Negative prompt:\n${negative}` : '', params ? `Params:\n${params}` : ''].filter(Boolean).join('\n\n');
    }

    function implCanvasPromptTemplateSearchText(template){
        return [
            template?.name,
            template?.name_en,
            template?.scene,
            template?.scene_en,
            template?.positive,
            template?.negative,
            template?.libraryName
        ].join(' ').toLowerCase();
    }

    function implCanvasPromptTemplateVisibleItems(){
        const query = String(promptTemplateQuery || '').trim().toLowerCase();
        return canvasPromptTemplates.filter(item => {
            if(promptTemplateCategory !== 'all' && item.category !== promptTemplateCategory) return false;
            if(!query) return true;
            return implCanvasPromptTemplateSearchText(item).includes(query);
        });
    }

    function implCurrentCanvasPromptTemplateLibraryEditable(){
        const lib = implActiveCanvasPromptLibrary();
        return Boolean(lib && lib.id !== 'system' && !lib.readonly);
    }

    function implCurrentCanvasPromptTemplateNodeText(){
        const node = nodes.find(n => n.id === promptTemplateNodeId && n.type === 'prompt');
        return String(node?.text || '').trim();
    }

    function implSyncCanvasPromptTemplateButtons(){
        if(!alive()) return;
        const activeId = templateOpen ? promptTemplateNodeId : '';
        document.querySelectorAll('[data-prompt-template-open]').forEach(btn => {
            const active = Boolean(activeId && btn.dataset.promptTemplateNodeId === activeId);
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    function implCanvasPromptTemplateDefaultName(text){
        return (String(text || '').trim().split(/\r?\n/)[0] || '新提示词').slice(0, 28);
    }

    function implSelectedCanvasPromptTemplate(){
        return canvasPromptTemplates.find(item => item.id === promptTemplateSelectedId) || null;
    }

    function implSyncCanvasPromptTemplateMutation(data, fallbackSelectedId='', origin=captureTemplate()){
        canvasPromptLibraries = data.library?.libraries || canvasPromptLibraries;
        const id = data.item?.id || fallbackSelectedId || promptTemplateSelectedId;
        const selected = implActiveCanvasPromptLibraryItems().find(item => item.id === id);
        acceptChoice(origin, {itemId:id, categoryId:selected?.category || promptTemplateCategory || 'all'});
        implRefreshCanvasPromptTemplatesFromLibraries({render:false});
    }

    async function implSaveCurrentCanvasPromptAsTemplate(){
        if(!alive()) return;
        const origin = captureTemplate();
        const lib = implActiveCanvasPromptLibrary();
        if(!implCurrentCanvasPromptTemplateLibraryEditable()){ setStatus('请选择可编辑的提示词库'); return; }
        const text = implCurrentCanvasPromptTemplateNodeText();
        if(!text){ setStatus('当前提示词为空'); return; }
        try {
            const data = await window.CanvasApi.createPromptItem({
                library_id:lib.id,
                name:implCanvasPromptTemplateDefaultName(text),
                category:promptTemplateCategory === 'all' ? 'mine' : promptTemplateCategory,
                positive:text,
                scene:'我的提示词预设'
            }, {errorFallback:'保存失败'});
            acceptChoice(origin, {libraryId:lib.id});
            implSyncCanvasPromptTemplateMutation(data, data.item?.id || '', origin);
            acceptChoice(origin, {editing:true});
            refreshFromReceipt(origin);
        } catch(err) {
            setStatus(err.message || '保存失败');
        }
    }

    async function implCreateBlankCanvasPromptTemplate(){
        if(!alive()) return;
        const origin = captureTemplate();
        const lib = implActiveCanvasPromptLibrary();
        if(!implCurrentCanvasPromptTemplateLibraryEditable()){ setStatus('请选择可编辑的提示词库'); return; }
        const category = promptTemplateCategory && promptTemplateCategory !== 'all' ? promptTemplateCategory : 'mine';
        try {
            const data = await window.CanvasApi.createPromptItem({library_id:lib.id, name:'新模板', category, positive:'新提示词', scene:'我的提示词预设'}, {errorFallback:'创建失败'});
            acceptChoice(origin, {libraryId:lib.id});
            acceptChoice(origin, {categoryId:category});
            implSyncCanvasPromptTemplateMutation(data, data.item?.id || '', origin);
            acceptChoice(origin, {editing:true});
            refreshFromReceipt(origin);
        } catch(err) {
            setStatus(err.message || '创建失败');
        }
    }

    async function implSaveCanvasPromptTemplateEdit(){
        if(!alive()) return;
        const origin = captureTemplate();
        const lib = implActiveCanvasPromptLibrary();
        const item = implSelectedCanvasPromptTemplate();
        if(!item) return;
        const name = promptTemplatePanel.querySelector('[data-template-edit-name]')?.value?.trim() || '';
        const positive = promptTemplatePanel.querySelector('[data-template-edit-text]')?.value?.trim() || '';
        const category = promptTemplatePanel.querySelector('[data-template-edit-category]')?.value || 'mine';
        if(!name || !positive){ setStatus('模板名称和内容不能为空'); return; }
        try {
            if(item.builtin){
                canvasPromptTemplateOverrides.editedBuiltins = canvasPromptTemplateOverrides.editedBuiltins || {};
                canvasPromptTemplateOverrides.editedBuiltins[item.sourceId || item.id] = {
                    ...(canvasPromptTemplateOverrides.editedBuiltins[item.sourceId || item.id] || {}),
                    name,
                    category,
                    positive
                };
                implSaveCanvasPromptTemplateOverrides();
                acceptChoice(origin, {editing:false});
                implRefreshCanvasPromptTemplatesFromLibraries({render:false});
                refreshFromReceipt(origin);
                return;
            }
            const data = await window.CanvasApi.updatePromptItem(item.id, {library_id:item.libraryId || lib.id, name, category, scene:item.scene || '', positive, negative:item.negative || ''}, {errorFallback:'保存失败'});
            implSyncCanvasPromptTemplateMutation(data, item.id, origin);
            acceptChoice(origin, {editing:false});
            refreshFromReceipt(origin);
        } catch(err) {
            setStatus(err.message || '保存失败');
        }
    }

    async function implDeleteCanvasPromptTemplate(){
        if(!alive()) return;
        const origin = captureTemplate();
        const item = implSelectedCanvasPromptTemplate();
        if(!item) return;
        if(!window.confirm(`删除提示词「${implCanvasPromptTemplateName(item) || '提示词'}」？`)) return;
        try {
            if(item.builtin){
                canvasPromptTemplateOverrides.hiddenBuiltinIds = [...new Set([...(canvasPromptTemplateOverrides.hiddenBuiltinIds || []), item.sourceId || item.id])];
                implSaveCanvasPromptTemplateOverrides();
                acceptChoice(origin, {itemId:''});
                acceptChoice(origin, {editing:false});
                implRefreshCanvasPromptTemplatesFromLibraries({render:false});
                refreshFromReceipt(origin);
                return;
            }
            const data = await window.CanvasApi.deletePromptItem(item.id, {errorFallback:'删除失败'});
            canvasPromptLibraries = data.library?.libraries || canvasPromptLibraries;
            implRefreshCanvasPromptTemplatesFromLibraries({render:false});
            acceptChoice(origin, {itemId:''});
            acceptChoice(origin, {editing:false});
            refreshFromReceipt(origin);
        } catch(err) {
            setStatus(err.message || '删除失败');
        }
    }

    function implPromptTemplateScrollSnapshot(){
        if(!promptTemplatePanel) return null;
        return {
            panelTop:promptTemplatePanel.scrollTop || 0,
            tabLeft:promptTemplatePanel.querySelector('.prompt-template-tabs')?.scrollLeft || 0,
            listTop:promptTemplatePanel.querySelector('.prompt-template-list')?.scrollTop || 0,
            detailTop:promptTemplatePanel.querySelector('.prompt-template-preview-content')?.scrollTop || 0
        };
    }

    function implRestorePromptTemplateScroll(snapshot){
        if(!alive() || !snapshot || !promptTemplatePanel) return;
        cancelScroll();
        const version = templateVersion;
        scrollFrame = requestAnimationFrame(() => {
            scrollFrame = null;
            if(!alive() || version !== templateVersion || !templateOpen) return;
            promptTemplatePanel.scrollTop = snapshot.panelTop || 0;
            const tabs = promptTemplatePanel.querySelector('.prompt-template-tabs');
            const list = promptTemplatePanel.querySelector('.prompt-template-list');
            const detail = promptTemplatePanel.querySelector('.prompt-template-preview-content');
            if(tabs) tabs.scrollLeft = snapshot.tabLeft || 0;
            if(list) list.scrollTop = snapshot.listTop || 0;
            if(detail) detail.scrollTop = snapshot.detailTop || 0;
        });
    }

    async function implCreateCanvasPromptTemplateGroup(){
        if(!alive()) return;
        const origin = captureTemplate();
        const name = window.prompt('新分组名称', '新分组');
        if(!String(name || '').trim()) return;
        const lib = implActiveCanvasPromptLibrary();
        if(lib && lib.id !== 'system'){
            try {
                const data = await window.CanvasApi.createPromptCategory({name:String(name).trim().slice(0, 24), library_id:lib.id}, {errorFallback:'新增分组失败'});
                canvasPromptLibraries = data.library?.libraries || canvasPromptLibraries;
                acceptChoice(origin, {categoryId:data.category?.id || promptTemplateCategory});
                implRefreshCanvasPromptTemplatesFromLibraries({render:false});
                refreshFromReceipt(origin);
            } catch(err){ setStatus(err.message || '新增分组失败'); }
            return;
        }
        const group = {id:uid('tpl_group'), name:String(name).trim().slice(0, 24)};
        promptTemplateGroups.push(group);
        implSaveCanvasPromptTemplateGroups();
        acceptChoice(origin, {categoryId:group.id});
        refreshFromReceipt(origin);
    }

    async function implRenameCanvasPromptTemplateGroup(groupId){
        if(!alive()) return;
        const origin = captureTemplate();
        const lib = implActiveCanvasPromptLibrary();
        const group = implActiveCanvasPromptTemplateGroups().find(g => g.id === groupId);
        if(!group) return;
        const name = window.prompt('分组名称', group.name || '');
        if(!String(name || '').trim()) return;
        if(lib && lib.id !== 'system'){
            try {
                const data = await window.CanvasApi.updatePromptCategory(groupId, {name:String(name).trim().slice(0, 24), library_id:lib.id}, {errorFallback:'重命名失败'});
                canvasPromptLibraries = data.library?.libraries || canvasPromptLibraries;
                implRefreshCanvasPromptTemplatesFromLibraries({render:false});
                refreshFromReceipt(origin);
            } catch(err){ setStatus(err.message || '重命名失败'); }
            return;
        }
        group.name = String(name).trim().slice(0, 24);
        implSaveCanvasPromptTemplateGroups();
        refreshFromReceipt(origin);
    }

    async function implDeleteCanvasPromptTemplateGroup(groupId){
        if(!alive()) return;
        const origin = captureTemplate();
        const lib = implActiveCanvasPromptLibrary();
        if(lib && lib.id !== 'system'){
            if(!window.confirm('删除分组？该分组里的我的模板会移动到“我的”。')) return;
            try {
                const data = await window.CanvasApi.deletePromptCategory(groupId, {errorFallback:'删除失败'});
                canvasPromptLibraries = data.library?.libraries || canvasPromptLibraries;
                if(promptTemplateCategory === groupId) acceptChoice(origin, {categoryId:'all'});
                implRefreshCanvasPromptTemplatesFromLibraries({render:false});
                refreshFromReceipt(origin);
            } catch(err){ setStatus(err.message || '删除失败'); }
            return;
        }
        if(['view','storyboard','character','product','lighting','mine'].includes(groupId)){
            implRenameCanvasPromptTemplateGroup(groupId);
            return;
        }
        if(!window.confirm('删除分组？该分组里的我的模板会移动到“我的”。')) return;
        promptTemplateGroups = promptTemplateGroups.filter(g => g.id !== groupId);
        Object.entries(canvasPromptTemplateOverrides.editedBuiltins || {}).forEach(([id, item]) => {
            if(item?.category === groupId) canvasPromptTemplateOverrides.editedBuiltins[id] = {...item, category:'mine'};
        });
        canvasPromptLibraries = canvasPromptLibraries.map(lib => ({
            ...lib,
            items:(lib.items || []).map(item => item.category === groupId ? {...item, category:'mine'} : item)
        }));
        if(promptTemplateCategory === groupId) acceptChoice(origin, {categoryId:'all'});
        implSaveCanvasPromptTemplateGroups();
        implSaveCanvasPromptTemplateOverrides();
        implRefreshCanvasPromptTemplatesFromLibraries({render:false});
        refreshFromReceipt(origin);
    }

    function implRenderPromptTemplateModal(){
        if(!alive()) return;
        if(promptTemplateSearch) promptTemplateSearch.value = promptTemplateQuery;
        if(!promptTemplateModal || !promptTemplatePanel || !promptTemplateCats || !promptTemplateBody) return;
        implRenderCanvasPromptLibrarySelect();
        const scrollSnapshot = implPromptTemplateScrollSnapshot();
        const activeGroups = implActiveCanvasPromptTemplateGroups();
        const categories = [{id:'all', name:'全部'}, ...activeGroups.map(group => ({...group, name:implCanvasPromptTemplateCategoryLabel(group.id)}))];
        const counts = canvasPromptTemplates.reduce((map, item) => {
            const category = item.category || 'mine';
            map[category] = (map[category] || 0) + 1;
            map.all += 1;
            return map;
        }, {all:0});
        promptTemplateCats.innerHTML = promptTemplateGroupEditMode ? `
            <div class="prompt-template-group-panel">
                <div class="prompt-template-group-title">
                    <div>
                        <strong>${escapeHtml('分组管理')}</strong>
                        <span>${escapeHtml('这里只调整上方分类，不影响模板内容')}</span>
                    </div>
                    <div class="prompt-template-group-tools">
                        <button type="button" data-template-cat-new><i data-lucide="plus"></i><span>${escapeHtml('新增')}</span></button>
                        <button type="button" class="primary" data-template-group-edit><i data-lucide="check"></i><span>${escapeHtml('完成')}</span></button>
                    </div>
                </div>
                <div class="prompt-template-group-list">
                    ${activeGroups.map(group => `
                        <div class="prompt-template-group-row ${['view','storyboard','character','product','lighting','mine'].includes(group.id) ? '' : 'has-delete'}">
                            <button type="button" class="group-name ${group.id === promptTemplateCategory ? 'active' : ''}" data-template-cat="${escapeAttr(group.id)}">
                                <span>${escapeHtml(implCanvasPromptTemplateCategoryLabel(group.id))}</span>
                                <small>${counts[group.id] || 0}</small>
                            </button>
                            <button type="button" class="group-tool" data-template-cat-edit="${escapeAttr(group.id)}" title="${escapeAttr('重命名')}"><i data-lucide="pencil"></i></button>
                            ${['view','storyboard','character','product','lighting','mine'].includes(group.id) ? '' : `<button type="button" class="group-tool danger" data-template-cat-delete="${escapeAttr(group.id)}" title="${escapeAttr('删除')}"><i data-lucide="trash-2"></i></button>`}
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : `
            <div class="prompt-template-nav">
                <div class="prompt-template-tabs">
                    ${categories.map(cat => `
                        <button type="button" class="${cat.id === promptTemplateCategory ? 'active' : ''}" data-template-cat="${escapeAttr(cat.id)}">
                            <span>${escapeHtml(cat.name)}</span>
                            <small>${counts[cat.id] || 0}</small>
                        </button>
                    `).join('')}
                </div>
                <button type="button" class="prompt-template-manage-groups" data-template-group-edit><i data-lucide="settings-2"></i><span>${escapeHtml('管理分组')}</span></button>
            </div>
        `;
        const items = implCanvasPromptTemplateVisibleItems();
        const selected = items.find(item => item.id === promptTemplateSelectedId) || null;
        const canCreateCurrentLibrary = implCurrentCanvasPromptTemplateLibraryEditable();
        const editMode = Boolean(promptTemplateEditing && selected);
        promptTemplateBody.innerHTML = `
            <div class="prompt-template-list">
                <div class="prompt-template-list-tools">
                    <button type="button" ${canCreateCurrentLibrary ? '' : 'disabled'} data-template-save-current><i data-lucide="bookmark-plus"></i><span>${escapeHtml('存当前')}</span></button>
                    <button type="button" ${canCreateCurrentLibrary ? '' : 'disabled'} data-template-new><i data-lucide="file-plus-2"></i><span>${escapeHtml('新模板')}</span></button>
                </div>
                ${items.length ? items.map(item => `<button type="button" class="prompt-template-card ${item.id === selected?.id ? 'active' : ''}" data-template-id="${escapeAttr(item.id)}">
                    <span class="prompt-template-card-top">
                        <span class="prompt-template-name">${escapeHtml(implCanvasPromptTemplateName(item))}</span>
                        <span class="prompt-template-source">${escapeHtml(item.builtin ? '内置' : '我的')}</span>
                    </span>
                    <span class="prompt-template-scene">${escapeHtml(implCanvasPromptTemplateScene(item) || item.positive || '')}</span>
                    <span class="prompt-template-tag">${escapeHtml(implCanvasPromptTemplateCategoryLabel(item.category || 'mine'))}</span>
                </button>`).join('') : `<div class="prompt-template-list-empty">${escapeHtml('没有匹配的模板')}</div>`}
            </div>
            <div class="prompt-template-detail">
                ${selected ? `
                    <div class="prompt-template-detail-head">
                        <div>
                            <strong>${escapeHtml(implCanvasPromptTemplateName(selected) || '')}</strong>
                            <span>${escapeHtml(implCanvasPromptTemplateCategoryLabel(selected.category || ''))} · ${escapeHtml(selected.builtin ? '内置模板' : '我的模板')}</span>
                        </div>
                        ${editMode ? '' : `
                            <div class="prompt-template-icon-actions">
                                <button type="button" data-template-edit title="${escapeAttr('修改模板')}"><i data-lucide="pencil"></i><span>${escapeHtml('编辑')}</span></button>
                                <button type="button" class="danger" data-template-delete title="${escapeAttr('删除模板')}"><i data-lucide="trash-2"></i><span>${escapeHtml('删除')}</span></button>
                            </div>
                        `}
                    </div>
                ${editMode ? `
                    <div class="prompt-template-edit-fields">
                        <label>${escapeHtml('模板名称')}</label>
                        <input data-template-edit-name value="${escapeAttr(implCanvasPromptTemplateName(selected) || '')}" placeholder="${escapeAttr('模板名称')}">
                        <label>${escapeHtml('所属分组')}</label>
                        <select data-template-edit-category>
                            ${promptTemplateGroups.map(group => `<option value="${escapeAttr(group.id)}" ${group.id === (selected.category || 'mine') ? 'selected' : ''}>${escapeHtml(implCanvasPromptTemplateCategoryLabel(group.id))}</option>`).join('')}
                        </select>
                        <label>${escapeHtml('模板内容')}</label>
                        <textarea data-template-edit-text placeholder="${escapeAttr('模板内容')}">${escapeHtml(selected.positive || '')}</textarea>
                    </div>
                ` : `
                    <div class="prompt-template-preview-content">
                        <div class="prompt-template-section">
                            <label>${escapeHtml('正向提示词')}</label>
                            <p>${escapeHtml(selected.positive || '')}</p>
                        </div>
                        ${selected.negative ? `<div class="prompt-template-section"><label>${escapeHtml('负向提示词')}</label><p>${escapeHtml(selected.negative)}</p></div>` : ''}
                        ${Object.keys(selected.params || {}).length ? `<div class="prompt-template-section"><label>${escapeHtml('参数建议')}</label><p>${escapeHtml(Object.entries(selected.params).map(([k,v]) => `${k}: ${v}`).join('\n'))}</p></div>` : ''}
                    </div>
                `}
                <div class="prompt-template-actions">
                    ${editMode ? `
                        <button type="button" data-template-edit-cancel><i data-lucide="x"></i><span>${escapeHtml('取消')}</span></button>
                        <button type="button" class="danger" data-template-delete><i data-lucide="trash-2"></i><span>${escapeHtml('删除')}</span></button>
                        <button type="button" class="primary" data-template-edit-save><i data-lucide="save"></i><span>${escapeHtml('保存')}</span></button>
                    ` : `
                        <button type="button" data-template-apply="positive"><i data-lucide="corner-down-left"></i><span>${escapeHtml('正向')}</span></button>
                        <button type="button" class="primary" data-template-apply="full"><i data-lucide="wand-sparkles"></i><span>${escapeHtml('完整应用')}</span></button>
                    `}
                </div>
                ` : `<div class="prompt-template-empty">${escapeHtml('选择或新建一个模板')}</div>`}
            </div>
        `;
        refreshIcons();
        implRestorePromptTemplateScroll(scrollSnapshot);
    }

    async function implOpenPromptTemplateModal(nodeId){
        if(!alive()) return;
        templateVersion++; opening = true;
        targetCanvasId = canvas?.id || '';
        promptTemplateNodeId = nodeId || '';
        promptTemplateQuery = '';
        promptTemplateEditing = false;
        if(promptTemplateSearch) promptTemplateSearch.value = '';
        const origin = captureTemplate();
        pendingOpen = origin;
        await implLoadCanvasPromptTemplates();
        if(pendingOpen === origin && alive()){ opening = false; pendingOpen = null; }
        if(!current(origin) || !validNodeTarget()){ if(current(origin)) implClosePromptTemplateModal(); return; }
        templateOpen = true;
        opening = false;
        refreshTemplate();
        promptTemplateModal?.classList.add('open');
        implSyncCanvasPromptTemplateButtons();
        promptTemplateSearch?.focus();
    }

    function implClosePromptTemplateModal(){
        if(destroyed) return;
        templateVersion++;
        cancelScroll();
        templateOpen = false; opening = false; pendingOpen = null;
        promptTemplateModal?.classList.remove('open');
        promptTemplateNodeId = '';
        targetCanvasId = '';
        promptTemplateEditing = false;
        implSyncCanvasPromptTemplateButtons();
    }

    function implApplyPromptTemplateToPromptNode(mode='positive'){
        if(!alive() || !templateOpen || !validNodeTarget()) return;
        const template = canvasPromptTemplates.find(item => item.id === promptTemplateSelectedId);
        if(!template) return;
        const target = {canvasId:targetCanvasId,nodeId:promptTemplateNodeId};
        const text = implCanvasPromptTemplateText(template, mode);
        applyClassicPromptPanelText(target, text, implClosePromptTemplateModal);
    }

    function implBindPromptControls(){
        if(!alive()) return;
        clearBindings();
        listen(promptTemplateSearch, 'input', event => {
            setQuery(event.target.value || '');
        });
        listen(promptTemplateLibrarySelect, 'change', () => selectLibrary(promptTemplateLibrarySelect.value || 'system'));
        listen(promptTemplateClose, 'click', implClosePromptTemplateModal);
        listen(promptTemplatePanel, 'pointerdown', e => e.stopPropagation());
        listen(promptTemplatePanel, 'mousedown', e => e.stopPropagation());
        listen(promptTemplatePanel, 'wheel', e => e.stopPropagation(), {passive:false});
        listen(promptTemplatePanel, 'click', event => {
            event.stopPropagation();
            const apply = event.target.closest('[data-template-apply],[data-prompt-template-apply]');
            if(apply){
                implApplyPromptTemplateToPromptNode(apply.dataset.templateApply || apply.dataset.promptTemplateApply || 'positive');
                return;
            }
            if(event.target.closest('[data-template-save-current],[data-prompt-template-save-current]')){ implSaveCurrentCanvasPromptAsTemplate(); return; }
            if(event.target.closest('[data-template-new],[data-prompt-template-new]')){ implCreateBlankCanvasPromptTemplate(); return; }
            if(event.target.closest('[data-template-edit],[data-prompt-template-edit]')){
                setEditing(true);
                return;
            }
            if(event.target.closest('[data-template-edit-cancel],[data-prompt-template-edit-cancel]')){ setEditing(false); return; }
            if(event.target.closest('[data-template-edit-save],[data-prompt-template-edit-save]')){ implSaveCanvasPromptTemplateEdit(); return; }
            if(event.target.closest('[data-template-delete],[data-prompt-template-delete]')){
                implDeleteCanvasPromptTemplate();
                return;
            }
            const cat = event.target.closest('[data-template-cat],[data-prompt-template-cat]');
            if(cat){
                selectCategory(cat.dataset.templateCat || cat.dataset.promptTemplateCat || 'all');
                return;
            }
            const catEdit = event.target.closest('[data-template-cat-edit]');
            if(catEdit){
                implRenameCanvasPromptTemplateGroup(catEdit.dataset.templateCatEdit || '');
                return;
            }
            const catDelete = event.target.closest('[data-template-cat-delete]');
            if(catDelete){
                implDeleteCanvasPromptTemplateGroup(catDelete.dataset.templateCatDelete || '');
                return;
            }
            if(event.target.closest('[data-template-group-edit]')){
                toggleGroups();
                return;
            }
            if(event.target.closest('[data-template-cat-new]')){ implCreateCanvasPromptTemplateGroup(); return; }
            const item = event.target.closest('[data-template-id],[data-prompt-template-id]');
            if(item){
                selectTemplate(item.dataset.templateId || item.dataset.promptTemplateId || '');
                return;
            }
        });
    }

    function reset(){
        implClosePromptTemplateModal();
    }
    function pageHide(event){
        if(!event.persisted){ destroy(); return; }
        suspended = true; templateVersion++; cancelScroll(); clearBindings();
    }
    function pageShow(event){
        if(!event.persisted || destroyed) return;
        suspended = false; bind();
        if(promptTemplateSearch) promptTemplateSearch.value = promptTemplateQuery;
        if((templateOpen || opening) && !validNodeTarget()){ reset(); return; }
        if(opening){ implOpenPromptTemplateModal(promptTemplateNodeId); return; }
        if(templateOpen) dataChanged({preserveDraft:true});
        implSyncCanvasPromptTemplateButtons();
    }

    function bind(){
        if(!alive()) return;
        implBindPromptControls();
    }
    function destroy(){
        if(destroyed) return;
        reset(); suspended = true; destroyed = true; cancelScroll(); clearBindings();
        window.removeEventListener('pagehide',pageHide); window.removeEventListener('pageshow',pageShow);
        promptTemplateModal = promptTemplatePanel = promptTemplateClose = promptTemplateSearch = promptTemplateLibrarySelect = promptTemplateCats = promptTemplateBody = null;
    }
    // Lifecycle registration is explicit and remains at the existing initialization position.
    function bindLifecycle(){
        if(destroyed) return;
        window.removeEventListener('pagehide',pageHide); window.removeEventListener('pageshow',pageShow);
        window.addEventListener('pagehide',pageHide); window.addEventListener('pageshow',pageShow);
    }
    return Object.freeze({
        get state(){ return Object.freeze({open:templateOpen,opening,nodeId:promptTemplateNodeId,canvasId:targetCanvasId,
            libraryId:activePromptLibraryId,categoryId:promptTemplateCategory,itemId:promptTemplateSelectedId,
            query:promptTemplateQuery,editing:promptTemplateEditing,groupEditing:promptTemplateGroupEditMode}); },
        get destroyed(){ return destroyed; },
        selectLibrary,selectCategory,selectTemplate,setQuery,setEditing,toggleGroups,dataChanged,capture:captureTemplate,
        reset,destroy,bind,bindLifecycle,
        startEditing:()=>setEditing(true), cancelEditing:()=>setEditing(false),
        open:implOpenPromptTemplateModal, close:implClosePromptTemplateModal,
        loadCanvasPromptTemplates:implLoadCanvasPromptTemplates,
        activeCanvasPromptLibrary:implActiveCanvasPromptLibrary,
        defaultCanvasPromptTemplateGroups:implDefaultCanvasPromptTemplateGroups,
        loadCanvasPromptTemplateGroups:implLoadCanvasPromptTemplateGroups,
        saveCanvasPromptTemplateGroups:implSaveCanvasPromptTemplateGroups,
        loadCanvasPromptTemplateOverrides:implLoadCanvasPromptTemplateOverrides,
        saveCanvasPromptTemplateOverrides:implSaveCanvasPromptTemplateOverrides,
        activeCanvasPromptLibraryItems:implActiveCanvasPromptLibraryItems,
        refreshCanvasPromptTemplatesFromLibraries:implRefreshCanvasPromptTemplatesFromLibraries,
        renderCanvasPromptLibrarySelect:implRenderCanvasPromptLibrarySelect,
        activeCanvasPromptTemplateGroups:implActiveCanvasPromptTemplateGroups,
        canvasPromptTemplateCategoryLabel:implCanvasPromptTemplateCategoryLabel,
        canvasPromptTemplateName:implCanvasPromptTemplateName,
        canvasPromptTemplateScene:implCanvasPromptTemplateScene,
        canvasPromptTemplateText:implCanvasPromptTemplateText,
        canvasPromptTemplateSearchText:implCanvasPromptTemplateSearchText,
        canvasPromptTemplateVisibleItems:implCanvasPromptTemplateVisibleItems,
        currentCanvasPromptTemplateLibraryEditable:implCurrentCanvasPromptTemplateLibraryEditable,
        currentCanvasPromptTemplateNodeText:implCurrentCanvasPromptTemplateNodeText,
        syncCanvasPromptTemplateButtons:implSyncCanvasPromptTemplateButtons,
        canvasPromptTemplateDefaultName:implCanvasPromptTemplateDefaultName,
        selectedCanvasPromptTemplate:implSelectedCanvasPromptTemplate,
        syncCanvasPromptTemplateMutation:implSyncCanvasPromptTemplateMutation,
        saveCurrentCanvasPromptAsTemplate:implSaveCurrentCanvasPromptAsTemplate,
        createBlankCanvasPromptTemplate:implCreateBlankCanvasPromptTemplate,
        saveCanvasPromptTemplateEdit:implSaveCanvasPromptTemplateEdit,
        deleteCanvasPromptTemplate:implDeleteCanvasPromptTemplate,
        promptTemplateScrollSnapshot:implPromptTemplateScrollSnapshot,
        restorePromptTemplateScroll:implRestorePromptTemplateScroll,
        createCanvasPromptTemplateGroup:implCreateCanvasPromptTemplateGroup,
        renameCanvasPromptTemplateGroup:implRenameCanvasPromptTemplateGroup,
        deleteCanvasPromptTemplateGroup:implDeleteCanvasPromptTemplateGroup,
        renderPromptTemplateModal:implRenderPromptTemplateModal,
        openPromptTemplateModal:implOpenPromptTemplateModal,
        closePromptTemplateModal:implClosePromptTemplateModal,
        applyPromptTemplateToPromptNode:implApplyPromptTemplateToPromptNode
    });
}

function loadCanvasPromptTemplates(...args){
    return classicPromptPanel.loadCanvasPromptTemplates(...args);
}

function activeCanvasPromptLibrary(...args){
    return classicPromptPanel.activeCanvasPromptLibrary(...args);
}

function defaultCanvasPromptTemplateGroups(...args){
    return classicPromptPanel.defaultCanvasPromptTemplateGroups(...args);
}

function loadCanvasPromptTemplateGroups(...args){
    return classicPromptPanel.loadCanvasPromptTemplateGroups(...args);
}

function saveCanvasPromptTemplateGroups(...args){
    return classicPromptPanel.saveCanvasPromptTemplateGroups(...args);
}

function loadCanvasPromptTemplateOverrides(...args){
    return classicPromptPanel.loadCanvasPromptTemplateOverrides(...args);
}

function saveCanvasPromptTemplateOverrides(...args){
    return classicPromptPanel.saveCanvasPromptTemplateOverrides(...args);
}

function activeCanvasPromptLibraryItems(...args){
    return classicPromptPanel.activeCanvasPromptLibraryItems(...args);
}

function refreshCanvasPromptTemplatesFromLibraries(...args){
    return classicPromptPanel.refreshCanvasPromptTemplatesFromLibraries(...args);
}

function renderCanvasPromptLibrarySelect(...args){
    return classicPromptPanel.renderCanvasPromptLibrarySelect(...args);
}

function activeCanvasPromptTemplateGroups(...args){
    return classicPromptPanel.activeCanvasPromptTemplateGroups(...args);
}

function canvasPromptTemplateCategoryLabel(...args){
    return classicPromptPanel.canvasPromptTemplateCategoryLabel(...args);
}

function canvasPromptTemplateName(...args){
    return classicPromptPanel.canvasPromptTemplateName(...args);
}

function canvasPromptTemplateScene(...args){
    return classicPromptPanel.canvasPromptTemplateScene(...args);
}

function canvasPromptTemplateText(...args){
    return classicPromptPanel.canvasPromptTemplateText(...args);
}

function canvasPromptTemplateSearchText(...args){
    return classicPromptPanel.canvasPromptTemplateSearchText(...args);
}

function canvasPromptTemplateVisibleItems(...args){
    return classicPromptPanel.canvasPromptTemplateVisibleItems(...args);
}

function currentCanvasPromptTemplateLibraryEditable(...args){
    return classicPromptPanel.currentCanvasPromptTemplateLibraryEditable(...args);
}

function currentCanvasPromptTemplateNodeText(...args){
    return classicPromptPanel.currentCanvasPromptTemplateNodeText(...args);
}

function syncCanvasPromptTemplateButtons(...args){
    return classicPromptPanel.syncCanvasPromptTemplateButtons(...args);
}

function canvasPromptTemplateDefaultName(...args){
    return classicPromptPanel.canvasPromptTemplateDefaultName(...args);
}

function selectedCanvasPromptTemplate(...args){
    return classicPromptPanel.selectedCanvasPromptTemplate(...args);
}

function syncCanvasPromptTemplateMutation(...args){
    return classicPromptPanel.syncCanvasPromptTemplateMutation(...args);
}

function saveCurrentCanvasPromptAsTemplate(...args){
    return classicPromptPanel.saveCurrentCanvasPromptAsTemplate(...args);
}

function createBlankCanvasPromptTemplate(...args){
    return classicPromptPanel.createBlankCanvasPromptTemplate(...args);
}

function saveCanvasPromptTemplateEdit(...args){
    return classicPromptPanel.saveCanvasPromptTemplateEdit(...args);
}

function deleteCanvasPromptTemplate(...args){
    return classicPromptPanel.deleteCanvasPromptTemplate(...args);
}

function promptTemplateScrollSnapshot(...args){
    return classicPromptPanel.promptTemplateScrollSnapshot(...args);
}

function restorePromptTemplateScroll(...args){
    return classicPromptPanel.restorePromptTemplateScroll(...args);
}

function createCanvasPromptTemplateGroup(...args){
    return classicPromptPanel.createCanvasPromptTemplateGroup(...args);
}

function renameCanvasPromptTemplateGroup(...args){
    return classicPromptPanel.renameCanvasPromptTemplateGroup(...args);
}

function deleteCanvasPromptTemplateGroup(...args){
    return classicPromptPanel.deleteCanvasPromptTemplateGroup(...args);
}

function renderPromptTemplateModal(...args){
    return classicPromptPanel.renderPromptTemplateModal(...args);
}

function openPromptTemplateModal(...args){
    return classicPromptPanel.openPromptTemplateModal(...args);
}

function closePromptTemplateModal(...args){
    return classicPromptPanel.closePromptTemplateModal(...args);
}

function applyPromptTemplateToPromptNode(...args){
    return classicPromptPanel.applyPromptTemplateToPromptNode(...args);
}

// Called once by canvas.js, at its original initialization position.
function bindClassicLibraryControls(){
    classicPromptPanel.bindLifecycle();
    classicPromptPanel.bind();
    bindClassicAssetPanelControls();
}

// Called once by canvas.js, at its original initialization position.
function bindClassicLibraryNavigation(){
    if(classicAssetPanel.destroyed) return;
    const events = classicAssetPanel.events('navigation');
    events.on(classicAssetPanel.elements.canvasAssetCloseBtn, 'click', () => toggleCanvasAssetLibrary(false));
    events.on(classicAssetPanel.elements.canvasAssetLibrarySelect, 'change', () => {
        classicAssetPanel.selectLibrary(classicAssetPanel.elements.canvasAssetLibrarySelect.value || '');

    });
    events.on(classicAssetPanel.elements.canvasAssetCategorySelect, 'change', () => {
        classicAssetPanel.selectCategory(classicAssetPanel.elements.canvasAssetCategorySelect.value || '');
    });
    events.on(classicAssetPanel.elements.canvasAssetSearch, 'input', () => {
        classicAssetPanel.setQuery(classicAssetPanel.elements.canvasAssetSearch.value || '');
    });
    events.on(classicAssetPanel.elements.canvasAssetAddCategoryBtn, 'click', async () => {
        const origin = classicAssetPanel.captureSelection();
        if(canvasAssetLibraryIsLocal()){ setStatus('本地素材请在素材库管理中管理文件夹'); return; }
        const name = window.prompt('新分组名称', '新分组');
        if(!String(name || '').trim()) return;
        const data = await classicAssetPanel.mutate(() => window.CanvasApi.createAssetCategory({library_id:origin.libraryId, name:String(name).trim(), type:'image'}));
        completeClassicAssetWrite(data, origin, {libraryId:origin.libraryId, categoryId:data.category?.id || origin.categoryId});
    });
    events.on(classicAssetPanel.elements.canvasAssetPanel, 'wheel', event => {
        event.stopPropagation();
        const scroller = event.target.closest?.('.canvas-asset-grid') || classicAssetPanel.elements.canvasAssetGrid;
        if(!scroller || getComputedStyle(scroller).display === 'none') return;
        const canScroll = scroller.scrollHeight > scroller.clientHeight || scroller.scrollWidth > scroller.clientWidth;
        if(!canScroll) return;
        event.preventDefault();
        scroller.scrollTop += event.deltaY;
        scroller.scrollLeft += event.deltaX;
    }, {passive:false, capture:true});
    events.on(classicAssetPanel.elements.canvasAssetGrid, 'scroll', () => {
        if(classicAssetPanel.state.renderedCount >= classicAssetPanel.state.filteredCount) return;
        if(classicAssetPanel.elements.canvasAssetGrid.scrollHeight - classicAssetPanel.elements.canvasAssetGrid.scrollTop - classicAssetPanel.elements.canvasAssetGrid.clientHeight > 180) return;
        classicAssetPanel.loadMore();
    });
}

function hasCanvasAssetSaveDrop(dataTransfer){
    return hasCanvasNodeAssetDrag(dataTransfer) || hasOutputImageDrag(dataTransfer) || hasImageDropData(dataTransfer);
}

// Called once by canvas.js, at its original initialization position.
function bindClassicAssetManagerEvents(){bindClassicAssetPanelDropEvents();classicLibraryManager.bind();}

function findCanvasAssetCategoryForItem(itemId){
    for(const lib of canvasAssetLibraries()){
        for(const cat of lib.categories || []){
            if((cat.items || []).some(item => item.id === itemId)) return cat;
        }
    }
    return null;
}

function bindClassicAssetPanelControls(){
    if(classicAssetPanel.destroyed) return;
    const events = classicAssetPanel.events('controls');
    events.on(classicAssetPanel.elements.canvasAssetToggle, 'click', () => toggleCanvasAssetLibrary());
    applyCanvasAssetPanelWidth(classicAssetPanel.state.width, {updatePreferred:false});
    events.on(classicAssetPanel.elements.canvasAssetResizeHandle, 'mousedown', event => {
        if(event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        classicAssetPanel.setResize({
            startX:event.clientX,
            startWidth:classicAssetPanel.elements.canvasAssetPanel.getBoundingClientRect().width,
        });
        classicAssetPanel.elements.canvasAssetPanel.classList.add('resizing');
        document.body.classList.add('canvas-asset-panel-resizing');
        const resizeEvents = classicAssetPanel.events('resize');
        resizeEvents.on(window, 'mousemove', moveEvent => {
            if(!classicAssetPanel.state.resize) return;
            moveEvent.preventDefault();
            applyCanvasAssetPanelWidth(classicAssetPanel.state.resize.startWidth + classicAssetPanel.state.resize.startX - moveEvent.clientX);
        });
        resizeEvents.on(window, 'mouseup', finishCanvasAssetPanelResize, {once:true});
    });
    events.on(classicAssetPanel.elements.canvasAssetResizeHandle, 'dblclick', event => {
        event.preventDefault();
        event.stopPropagation();
        applyCanvasAssetPanelWidth(CANVAS_ASSET_PANEL_DEFAULT_WIDTH, {persist:true});
    });
    events.on(classicAssetPanel.elements.canvasAssetResizeHandle, 'keydown', event => {
        if(!['ArrowLeft','ArrowRight','Home'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        if(event.key === 'Home') applyCanvasAssetPanelWidth(CANVAS_ASSET_PANEL_DEFAULT_WIDTH, {persist:true});
        else {
            const step = event.shiftKey ? 64 : 24;
            applyCanvasAssetPanelWidth(classicAssetPanel.state.width + (event.key === 'ArrowLeft' ? step : -step), {persist:true});
        }
    });
    events.on(window, 'resize', () => {
        if(!classicAssetPanel.state.resize) applyCanvasAssetPanelWidth(classicAssetPanel.state.width, {updatePreferred:false});
    });
}

function bindClassicAssetPanelDropEvents(){
    if(classicAssetPanel.destroyed) return;
    const events = classicAssetPanel.events('drop');
    events.on(classicAssetPanel.elements.canvasAssetDropZone, 'dragover', event => {
        if(!hasCanvasAssetSaveDrop(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        classicAssetPanel.elements.canvasAssetDropZone.classList.add('drag-over');
    });
    events.on(classicAssetPanel.elements.canvasAssetDropZone, 'dragleave', () => classicAssetPanel.elements.canvasAssetDropZone.classList.remove('drag-over'));
    events.on(classicAssetPanel.elements.canvasAssetDropZone, 'drop', async event => {
        if(!hasCanvasAssetSaveDrop(event.dataTransfer)) return;
        const target = classicAssetPanel.captureSelection();
        event.preventDefault();
        event.stopPropagation();
        classicAssetPanel.elements.canvasAssetDropZone.classList.remove('drag-over');
        try {
            if(hasCanvasNodeAssetDrag(event.dataTransfer)){
                const dragged = readCanvasNodeAssetDrag(event.dataTransfer);
                if(dragged?.url) await addUrlToCanvasAssetLibrary(dragged.url, dragged.name || outputImageName(dragged.url), target);
                return;
            }
            if(hasOutputImageDrag(event.dataTransfer)){
                await addUrlToCanvasAssetLibrary(event.dataTransfer.getData('application/x-canvas-output-image'), 'output', target);
                return;
            }
            const payload = await resolveImageDropPayload(event.dataTransfer);
            if(payload.type === 'files'){
                const cat = (canvasAssetLibraries().find(lib=>lib.id === target.libraryId)?.categories || []).find(cat=>cat.id === target.categoryId);
                const data = cat ? await uploadFilesToLibrary(payload.files, target.libraryId, cat.id) : null;
                if(data?.library) {
                    setCanvasAssetLibraryFromResponse(data, {render:false});
                    renderCanvasAssetLibrary();
                    setStatus('已保存到资产库');
                }
            } else if(payload.type === 'url') {
                await addUrlToCanvasAssetLibrary(payload.url, outputImageName(payload.url), target);
            }
        } catch(err) {
            showErrorModal(err.message || '保存资产失败', '保存资产失败');
        }
    });

}


// The management window owns only its UI; libraries and committed writes keep their existing owners.
function createClassicLibraryManager(){
    let assetManagerTab='assets',managerSelectedAssetIds=new Set(),managerSelectedWorkflowIds=new Set(),managerSelectedPromptIds=new Set();
    let assetManagerModal=null,assetManagerBody=null,open=false,paused=false,destroyed=false,version=0,openVersion=0;
    const bindings=[],renderBindings=[],lifecycle=[];
    function alive(){return !paused&&!destroyed;}
    function ensureElements(){if(destroyed)return;assetManagerModal ||= document.getElementById('assetManagerModal');assetManagerBody ||= document.getElementById('assetManagerBody');}
    function clear(records){records.splice(0).forEach(remove=>remove());}
    function listen(target,type,handler,options,records=bindings){if(!target)return;const fn=(...args)=>{if(alive())return handler(...args);};target.addEventListener(type,fn,options);records.push(()=>target.removeEventListener(type,fn,options));}
    function capture(){return version;}
    function accept(origin){return alive()&&version===origin;}
    function reveal(){if(!alive())return;ensureElements();if(assetManagerModal){assetManagerModal.hidden=false;if(assetManagerModal.style?.display==='none')assetManagerModal.style.display='';}}
    function paint(work){if(!alive())return;ensureElements();if(!assetManagerBody)return;clear(renderBindings);return work();}
    function selectionChanged(source){if(destroyed)return;version++;if(source==='manager-assets')managerSelectedAssetIds.clear();if(source==='manager-workflows')managerSelectedWorkflowIds.clear();}
    function promptLibraryChanged(){if(destroyed)return;version++;managerSelectedPromptIds.clear();}
    function itemsRemoved(id){if(destroyed)return;managerSelectedAssetIds.delete(id);managerSelectedWorkflowIds.delete(id);}
    function bind(){
        if(!alive())return;bindClassicAssetManagerEventsImpl();clear(lifecycle);
        for(const [type,fn]of [['pagehide',event=>event.persisted?pause():destroy()],['pageshow',event=>{if(event.persisted)resume();}]]){
            window.addEventListener(type,fn);lifecycle.push(()=>window.removeEventListener(type,fn));
        }
    }
    function pause(){if(destroyed||paused)return;version++;openVersion++;paused=true;clear(bindings);clear(renderBindings);}
    function resume(){if(destroyed||!paused)return;paused=false;bind();if(open)updateAssetManager();}
    function destroy(){if(destroyed)return;closeAssetManagerImpl();clear(bindings);clear(renderBindings);clear(lifecycle);managerSelectedAssetIds.clear();managerSelectedWorkflowIds.clear();managerSelectedPromptIds.clear();assetManagerModal=assetManagerBody=null;destroyed=true;paused=false;}
    function openAssetManagerImpl(){
        if(!alive())return;ensureElements();version++;open=true;
        const origin=++openVersion;
        assetManagerModal?.classList.add('open');
        managerSelectedAssetIds.clear();
        managerSelectedPromptIds.clear();
        canvasPromptTemplatesLoaded = false;
        Promise.all([loadCanvasAssetLibrary({renderPanel:false}), loadCanvasPromptTemplates()]).then(()=>{if(alive()&&open&&origin===openVersion)updateAssetManager();});
    }

    function closeAssetManagerImpl(){
        version++;openVersion++;open=false;clear(renderBindings);
        assetManagerModal?.classList.remove('open');
    }

    function renderAssetManagerImpl(){
        if(!alive())return;ensureElements();if(!assetManagerBody)return;clear(renderBindings);
        document.querySelectorAll('[data-manager-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.managerTab === assetManagerTab));
        if(assetManagerTab === 'prompts') renderPromptAssetManager();
        else if(assetManagerTab === 'workflows') renderWorkflowAssetManager();
        else renderImageAssetManager();
        refreshIcons();
    }

    function renderImageAssetManagerImpl(){
        const libs = canvasAssetLibraries();
        const library = activeCanvasAssetLibrary();
        const cats = canvasMediaCategories();
        const cat = activeCanvasMediaCategory();
        const items = cat?.items || [];
        const canEditLibrary = !!library;
        const canEditCategory = !!cat;
        assetManagerBody.innerHTML = `
            <div class="asset-manager-side">
                <div class="asset-manager-tools">
                    <button type="button" class="primary" data-manager-asset-lib-new><i data-lucide="plus" class="w-4 h-4"></i><span>新资产库</span></button>
                    <button type="button" ${!canEditLibrary ? 'disabled' : ''} data-manager-asset-lib-rename><i data-lucide="pencil" class="w-4 h-4"></i><span>重命名</span></button>
                    <button type="button" class="danger" ${libs.length <= 1 ? 'disabled' : ''} data-manager-asset-lib-delete><i data-lucide="trash-2" class="w-4 h-4"></i><span>删除库</span></button>
                </div>
                <div class="asset-manager-list">
                    ${libs.map(lib => `<button type="button" class="${lib.id === classicAssetPanel.state.libraryId ? 'active' : ''}" data-manager-asset-lib="${escapeAttr(lib.id)}"><span>${escapeHtml(lib.name || '资产库')}</span><small>${(lib.categories || []).reduce((n,c)=>n+(c.items || []).length,0)}</small></button>`).join('')}
                </div>
                <div class="asset-manager-tools">
                    <button type="button" class="primary" data-manager-asset-cat-new><i data-lucide="folder-plus" class="w-4 h-4"></i><span>新分组</span></button>
                    <button type="button" ${!canEditCategory ? 'disabled' : ''} data-manager-asset-cat-rename><i data-lucide="pencil" class="w-4 h-4"></i><span>重命名</span></button>
                    <button type="button" class="danger" ${!canEditCategory ? 'disabled' : ''} data-manager-asset-cat-delete><i data-lucide="trash-2" class="w-4 h-4"></i><span>删除组</span></button>
                </div>
                <div class="asset-manager-list">
                    ${cats.map(item => `<button type="button" class="${item.id === classicAssetPanel.state.categoryId ? 'active' : ''}" data-manager-asset-cat="${escapeAttr(item.id)}"><span>${escapeHtml(item.name || '分组')}</span><small>${(item.items || []).length}</small></button>`).join('')}
                </div>
            </div>
            <div class="asset-manager-main">
                <div class="asset-manager-tools">
                    <label class="${!cat ? 'disabled' : ''}"><i data-lucide="upload" class="w-4 h-4"></i><span>批量上传</span><input id="managerAssetUpload" type="file" multiple accept="image/*" ${!cat ? 'disabled' : ''}></label>
                    <button type="button" class="danger" ${managerSelectedAssetIds.size ? '' : 'disabled'} data-manager-asset-delete><i data-lucide="trash-2" class="w-4 h-4"></i><span>删除所选 ${managerSelectedAssetIds.size ? managerSelectedAssetIds.size : ''}</span></button>
                </div>
                <div class="asset-manager-grid">
                    ${items.length ? items.map(item => `<div class="asset-manager-card">
                        <input type="checkbox" data-manager-asset-check="${escapeAttr(item.id)}" ${managerSelectedAssetIds.has(item.id) ? 'checked' : ''}>
                        ${canvasPreviewImgHtml(item.thumbnail || item.url || '', 512, 'alt=""')}
                        <span class="asset-manager-card-name" title="${escapeAttr(item.name || '')}">${escapeHtml(item.name || 'asset')}</span>
                        <div class="asset-manager-card-actions">
                            <button type="button" data-manager-asset-rename="${escapeAttr(item.id)}"><i data-lucide="pencil" class="w-3.5 h-3.5"></i><span>重命名</span></button>
                            <button type="button" class="danger" data-manager-asset-remove="${escapeAttr(item.id)}"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i><span>删除</span></button>
                        </div>
                    </div>`).join('') : `<div class="canvas-asset-empty">当前分组为空</div>`}
                </div>
            </div>
        `;
        bindCanvasPreviewImageFallbacks(assetManagerBody);
        const upload = document.getElementById('managerAssetUpload');
        listen(upload,'change', async () => {
            const uiOrigin=capture();
            if(!upload.files?.length || !cat) return;
            const data = await uploadFilesToLibrary(upload.files, library.id, cat.id);
            if(data?.library) setCanvasAssetLibraryFromResponse(data, {render:false});
            if(accept(uiOrigin))managerSelectedAssetIds.clear();
            updateAssetManager();
            renderCanvasAssetLibrary();
        },undefined,renderBindings);
    }

    function renderWorkflowAssetManagerImpl(){
        const libs = canvasAssetLibraries();
        const library = activeCanvasAssetLibrary();
        const cats = canvasWorkflowCategories();
        const cat = activeCanvasWorkflowCategory();
        const items = cat?.items || [];
        assetManagerBody.innerHTML = `
            <div class="asset-manager-side">
                <div class="asset-manager-tools">
                    <button type="button" class="primary" data-manager-workflow-cat-new><i data-lucide="folder-plus" class="w-4 h-4"></i><span>新分组</span></button>
                </div>
                <div class="asset-manager-list">
                    ${libs.map(lib => `<button type="button" class="${lib.id === classicAssetPanel.state.libraryId ? 'active' : ''}" data-manager-workflow-lib="${escapeAttr(lib.id)}"><span>${escapeHtml(lib.name || '资产库')}</span><small>${(lib.categories || []).filter(c => String(c.type || '') === 'workflow').reduce((n,c)=>n+(c.items || []).length,0)}</small></button>`).join('')}
                </div>
                <div class="asset-manager-list">
                    ${cats.map(item => `<button type="button" class="${item.id === classicAssetPanel.state.workflowCategoryId ? 'active' : ''}" data-manager-workflow-cat="${escapeAttr(item.id)}"><span>${escapeHtml(item.name || '工作流')}</span><small>${(item.items || []).length}</small></button>`).join('') || '<div class="canvas-asset-empty">暂无工作流分组</div>'}
                </div>
            </div>
            <div class="asset-manager-main">
                <div class="asset-manager-tools">
                    <label class="${!cat ? 'disabled' : ''}"><i data-lucide="upload" class="w-4 h-4"></i><span>上传工作流</span><input id="managerWorkflowUpload" type="file" multiple accept=".json,.zip,application/json,application/zip" ${!cat ? 'disabled' : ''}></label>
                    <button type="button" ${!managerSelectedWorkflowIds.size ? 'disabled' : ''} data-manager-workflow-export><i data-lucide="download" class="w-4 h-4"></i><span>导出所选 ${managerSelectedWorkflowIds.size ? managerSelectedWorkflowIds.size : ''}</span></button>
                    <button type="button" class="danger" ${managerSelectedWorkflowIds.size ? '' : 'disabled'} data-manager-workflow-delete><i data-lucide="trash-2" class="w-4 h-4"></i><span>删除所选 ${managerSelectedWorkflowIds.size ? managerSelectedWorkflowIds.size : ''}</span></button>
                </div>
                <div class="asset-manager-grid">
                    ${items.length ? items.map(item => `<div class="asset-manager-card">
                        <input type="checkbox" data-manager-workflow-check="${escapeAttr(item.id)}" ${managerSelectedWorkflowIds.has(item.id) ? 'checked' : ''}>
                        ${workflowAssetThumbHtml(item)}
                        <span class="asset-manager-card-name" title="${escapeAttr(item.name || '')}">${escapeHtml(item.name || 'workflow')}</span>
                        <div class="asset-manager-card-actions">
                            <button type="button" data-manager-workflow-rename="${escapeAttr(item.id)}"><i data-lucide="pencil" class="w-3.5 h-3.5"></i><span>重命名</span></button>
                            <button type="button" class="danger" data-manager-workflow-remove="${escapeAttr(item.id)}"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i><span>删除</span></button>
                        </div>
                    </div>`).join('') : `<div class="canvas-asset-empty">当前分组为空</div>`}
                </div>
            </div>
        `;
        const upload = document.getElementById('managerWorkflowUpload');
        listen(upload,'change', async () => {
            const uiOrigin=capture();
            if(!upload.files?.length || !cat) return;
            const form = new FormData();
            form.append('library_id', library?.id || '');
            form.append('category_id', cat.id || '');
            [...upload.files].forEach(file => form.append('files', file));
            const data = await classicAssetPanel.mutate(() => window.CanvasApi.uploadAssetWorkflows(form));
            setCanvasAssetLibraryFromResponse(data, {render:false});
            if(accept(uiOrigin))managerSelectedWorkflowIds.clear();
            updateAssetManager();
            renderCanvasAssetLibrary();
        },undefined,renderBindings);
    }

    function renderPromptAssetManagerImpl(){
        const libs = canvasPromptLibraries.filter(lib => lib.id !== 'system');
        const lib = canvasPromptLibraries.find(item => item.id === classicPromptPanel.state.libraryId) || libs[0] || null;
        const items = lib?.items || [];
        const canEditLibrary = !!lib && !lib.readonly;
        assetManagerBody.innerHTML = `
            <div class="asset-manager-side">
                <div class="asset-manager-tools">
                    <button type="button" class="primary" data-manager-prompt-lib-new><i data-lucide="plus" class="w-4 h-4"></i><span>新提示词库</span></button>
                    <button type="button" ${!canEditLibrary ? 'disabled' : ''} data-manager-prompt-lib-rename><i data-lucide="pencil" class="w-4 h-4"></i><span>重命名</span></button>
                    <button type="button" class="danger" ${!canEditLibrary || canvasPromptLibraries.length <= 1 ? 'disabled' : ''} data-manager-prompt-lib-delete><i data-lucide="trash-2" class="w-4 h-4"></i><span>删除库</span></button>
                </div>
                <div class="asset-manager-list">
                    ${canvasPromptLibraries.map(library => `<button type="button" class="${library.id === classicPromptPanel.state.libraryId ? 'active' : ''}" data-manager-prompt-lib="${escapeAttr(library.id)}"><span>${escapeHtml(library.name || '提示词库')}</span><small>${(library.items || []).length}</small></button>`).join('')}
                </div>
            </div>
            <div class="asset-manager-main">
                <div class="asset-manager-tools">
                    <button type="button" class="primary" ${!lib || lib.readonly ? 'disabled' : ''} data-manager-prompt-new><i data-lucide="file-plus-2" class="w-4 h-4"></i><span>新增提示词</span></button>
                    <button type="button" class="danger" ${!lib || lib.readonly || !managerSelectedPromptIds.size ? 'disabled' : ''} data-manager-prompt-delete><i data-lucide="trash-2" class="w-4 h-4"></i><span>删除所选 ${managerSelectedPromptIds.size ? managerSelectedPromptIds.size : ''}</span></button>
                </div>
                <div class="asset-manager-grid">
                    ${items.length ? items.map(item => `<div class="asset-manager-card">
                        <input type="checkbox" data-manager-prompt-check="${escapeAttr(item.id)}" ${managerSelectedPromptIds.has(item.id) ? 'checked' : ''} ${lib?.readonly ? 'disabled' : ''}>
                        <div class="asset-manager-card-text">${escapeHtml(item.positive || '')}</div>
                        <span class="asset-manager-card-name" title="${escapeAttr(item.name || '')}">${escapeHtml(item.name || '提示词')}</span>
                        <div class="asset-manager-card-actions">
                            <button type="button" ${lib?.readonly ? 'disabled' : ''} data-manager-prompt-edit="${escapeAttr(item.id)}"><i data-lucide="pencil" class="w-3.5 h-3.5"></i><span>编辑</span></button>
                            <button type="button" class="danger" ${lib?.readonly ? 'disabled' : ''} data-manager-prompt-remove="${escapeAttr(item.id)}"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i><span>删除</span></button>
                        </div>
                    </div>`).join('') : `<div class="canvas-asset-empty">当前提示词库为空</div>`}
                </div>
            </div>
        `;
    }

    function selectClassicAssetManagerTabImpl(tab){
        if(!alive())return;version++;
        assetManagerTab = tab || 'assets';
        classicAssetPanel.selectTarget({}, {source:'manager-' + assetManagerTab});
        if(!assetManagerModal?.classList.contains('open')) renderAssetManager();
    }

    function updateAssetManagerImpl(){
        if(!alive()||classicAssetPanel.destroyed) return;
        classicAssetPanel.reconcile({source:'manager-' + assetManagerTab, render:false});
        if(open)renderAssetManager();
    }

    function bindClassicAssetManagerEventsImpl(){
        if(destroyed||paused)return;ensureElements();clear(bindings);
        listen(gateAssetManagerBtn,'click',openAssetManager);
        document.querySelectorAll('[data-manager-tab]').forEach(btn => {
            listen(btn,'click', () => {
                selectClassicAssetManagerTab(btn.dataset.managerTab);
            });
        });
        listen(assetManagerModal,'change', event => {
            version++;
            let shouldRender = false;
            const assetCheck = event.target.closest?.('[data-manager-asset-check]');
            if(assetCheck){
                if(assetCheck.checked) managerSelectedAssetIds.add(assetCheck.dataset.managerAssetCheck);
                else managerSelectedAssetIds.delete(assetCheck.dataset.managerAssetCheck);
                shouldRender = true;
            }
            const promptCheck = event.target.closest?.('[data-manager-prompt-check]');
            if(promptCheck){
                if(promptCheck.checked) managerSelectedPromptIds.add(promptCheck.dataset.managerPromptCheck);
                else managerSelectedPromptIds.delete(promptCheck.dataset.managerPromptCheck);
                shouldRender = true;
            }
            const workflowCheck = event.target.closest?.('[data-manager-workflow-check]');
            if(workflowCheck){
                if(workflowCheck.checked) managerSelectedWorkflowIds.add(workflowCheck.dataset.managerWorkflowCheck);
                else managerSelectedWorkflowIds.delete(workflowCheck.dataset.managerWorkflowCheck);
                shouldRender = true;
            }
            if(shouldRender) updateAssetManager();
        });
        listen(assetManagerModal,'click', async event => {
            const uiOrigin=capture();
            const origin = classicAssetPanel.captureSelection();
            const promptOrigin = classicPromptPanel.capture();
            const assetLib = event.target.closest?.('[data-manager-asset-lib]');
            if(assetLib){ classicAssetPanel.selectLibrary(assetLib.dataset.managerAssetLib || '', {source:'manager-assets'}); return; }
            const assetCat = event.target.closest?.('[data-manager-asset-cat]');
            if(assetCat){ classicAssetPanel.selectCategory(assetCat.dataset.managerAssetCat || '', {source:'manager-assets'}); return; }
            const workflowLib = event.target.closest?.('[data-manager-workflow-lib]');
            if(workflowLib){ classicAssetPanel.selectLibrary(workflowLib.dataset.managerWorkflowLib || '', {source:'manager-workflows'}); return; }
            const workflowCat = event.target.closest?.('[data-manager-workflow-cat]');
            if(workflowCat){ classicAssetPanel.selectCategory(workflowCat.dataset.managerWorkflowCat || '', {source:'manager-workflows'}); return; }
            const promptLib = event.target.closest?.('[data-manager-prompt-lib]');
            if(promptLib){ classicPromptPanel.selectLibrary(promptLib.dataset.managerPromptLib || 'system',{source:'manager'}); return; }
            const workflowRename = event.target.closest?.('[data-manager-workflow-rename]');
            if(workflowRename){
                const itemId = workflowRename.dataset.managerWorkflowRename || '';
                const item = (activeCanvasWorkflowCategory()?.items || []).find(entry => entry.id === itemId);
                const name = window.prompt('工作流名称', item?.name || '');
                if(!item || !String(name || '').trim()) return;
                const data = await classicAssetPanel.mutate(() => window.CanvasApi.updateAssetItem(item.id, {name}));
                setCanvasAssetLibraryFromResponse(data, {render:false});
                updateAssetManager(); renderCanvasAssetLibrary(); return;
            }
            const workflowRemove = event.target.closest?.('[data-manager-workflow-remove]');
            if(workflowRemove){
                const itemId = workflowRemove.dataset.managerWorkflowRemove || '';
                const item = (activeCanvasWorkflowCategory()?.items || []).find(entry => entry.id === itemId);
                if(!item || !window.confirm(`删除工作流「${item.name || 'workflow'}」？`)) return;
                const data = await classicAssetPanel.mutate(() => window.CanvasApi.deleteAssetItem(item.id));
                setCanvasAssetLibraryFromResponse(data, {render:false});
                if(accept(uiOrigin))managerSelectedWorkflowIds.delete(item.id);
                updateAssetManager(); renderCanvasAssetLibrary(); return;
            }
            const assetRename = event.target.closest?.('[data-manager-asset-rename]');
            if(assetRename){
                const itemId = assetRename.dataset.managerAssetRename || '';
                const item = (activeCanvasMediaCategory()?.items || []).find(entry => entry.id === itemId);
                const name = window.prompt('资产名称', item?.name || '');
                if(!item || !String(name || '').trim()) return;
                const data = await classicAssetPanel.mutate(() => window.CanvasApi.updateAssetItem(item.id, {name}));
                setCanvasAssetLibraryFromResponse(data, {render:false});
                updateAssetManager(); renderCanvasAssetLibrary(); return;
            }
            const assetRemove = event.target.closest?.('[data-manager-asset-remove]');
            if(assetRemove){
                const itemId = assetRemove.dataset.managerAssetRemove || '';
                const item = (activeCanvasMediaCategory()?.items || []).find(entry => entry.id === itemId);
                if(!item || !window.confirm(`删除资产「${item.name || 'asset'}」？`)) return;
                const data = await classicAssetPanel.mutate(() => window.CanvasApi.deleteAssetItem(item.id));
                setCanvasAssetLibraryFromResponse(data, {render:false});
                if(accept(uiOrigin))managerSelectedAssetIds.delete(item.id);
                updateAssetManager(); renderCanvasAssetLibrary(); return;
            }
            const promptEdit = event.target.closest?.('[data-manager-prompt-edit]');
            if(promptEdit){
                const lib = activeCanvasPromptLibrary();
                if(!lib || lib.readonly) return;
                const itemId = promptEdit.dataset.managerPromptEdit || '';
                const item = (lib.items || []).find(entry => entry.id === itemId);
                if(!item) return;
                const name = window.prompt('提示词名称', item.name || '提示词');
                if(!String(name || '').trim()) return;
                const positive = window.prompt('提示词内容', item.positive || '');
                if(!String(positive || '').trim()) return;
                const data = await window.CanvasApi.updatePromptItem(item.id, {library_id:lib.id, name, positive, negative:item.negative || '', category:item.category || 'mine', scene:item.scene || ''});
                canvasPromptLibraries = data.library?.libraries || canvasPromptLibraries;
                refreshCanvasPromptTemplatesFromLibraries();
                updateAssetManager(); return;
            }
            const promptRemove = event.target.closest?.('[data-manager-prompt-remove]');
            if(promptRemove){
                const lib = activeCanvasPromptLibrary();
                if(!lib || lib.readonly) return;
                const itemId = promptRemove.dataset.managerPromptRemove || '';
                const item = (lib.items || []).find(entry => entry.id === itemId);
                if(!item || !window.confirm(`删除提示词「${item.name || '提示词'}」？`)) return;
                const data = await window.CanvasApi.deletePromptItem(item.id);
                canvasPromptLibraries = data.library?.libraries || canvasPromptLibraries;
                if(accept(uiOrigin))managerSelectedPromptIds.delete(item.id);
                refreshCanvasPromptTemplatesFromLibraries();
                updateAssetManager(); return;
            }
            if(event.target.closest?.('[data-manager-asset-lib-new]')){
                const name = window.prompt('资产库名称', '新资产库');
                if(!String(name || '').trim()) return;
                const data = await classicAssetPanel.mutate(() => window.CanvasApi.createAssetLibrary({name}));
                completeClassicAssetWrite(data, origin, {libraryId:data.asset_library?.id || origin.libraryId, categoryId:''}); return;
            }
            if(event.target.closest?.('[data-manager-asset-lib-rename]')){
                const lib = activeCanvasAssetLibrary();
                const name = window.prompt('资产库名称', lib?.name || '');
                if(!lib || !String(name || '').trim()) return;
                const data = await classicAssetPanel.mutate(() => window.CanvasApi.updateAssetLibrary(lib.id, {name}));
                setCanvasAssetLibraryFromResponse(data, {render:false});
                updateAssetManager(); renderCanvasAssetLibrary(); return;
            }
            if(event.target.closest?.('[data-manager-asset-lib-delete]')){
                const lib = activeCanvasAssetLibrary();
                if(!lib || !window.confirm(`删除资产库「${lib.name || '资产库'}」？`)) return;
                const data = await classicAssetPanel.mutate(() => window.CanvasApi.deleteAssetLibrary(lib.id));
                setCanvasAssetLibraryFromResponse(data, {render:false});
                updateAssetManager(); renderCanvasAssetLibrary(); return;
            }
            if(event.target.closest?.('[data-manager-asset-cat-new]')){
                const name = window.prompt('分组名称', '新分组');
                if(!String(name || '').trim()) return;
                const data = await classicAssetPanel.mutate(() => window.CanvasApi.createAssetCategory({library_id:classicAssetPanel.state.libraryId, name, type:'image'}));
                setCanvasAssetLibraryFromResponse(data, {render:false});
                classicAssetPanel.selectTarget({libraryId:origin.libraryId, categoryId:data.category?.id || origin.categoryId}, {expected:origin,render:false});
                updateAssetManager(); renderCanvasAssetLibrary(); return;
            }
            if(event.target.closest?.('[data-manager-asset-cat-rename]')){
                const cat = activeCanvasMediaCategory();
                const name = window.prompt('分组名称', cat?.name || '');
                if(!cat || !String(name || '').trim()) return;
                const data = await classicAssetPanel.mutate(() => window.CanvasApi.updateAssetCategory(cat.id, {name}));
                setCanvasAssetLibraryFromResponse(data, {render:false});
                updateAssetManager(); renderCanvasAssetLibrary(); return;
            }
            if(event.target.closest?.('[data-manager-asset-cat-delete]')){
                const cat = activeCanvasMediaCategory();
                if(!cat || !window.confirm(`删除分组「${cat.name || '分组'}」？`)) return;
                const data = await classicAssetPanel.mutate(() => window.CanvasApi.deleteAssetCategory(cat.id));
                setCanvasAssetLibraryFromResponse(data, {render:false});
                updateAssetManager(); renderCanvasAssetLibrary(); return;
            }
            if(event.target.closest?.('[data-manager-asset-delete]')){
                if(!managerSelectedAssetIds.size) return;
                const data = await classicAssetPanel.mutate(() => window.CanvasApi.deleteAssetItems({library_id:classicAssetPanel.state.libraryId, ids:[...managerSelectedAssetIds]}));
                setCanvasAssetLibraryFromResponse(data, {render:false});
                if(accept(uiOrigin))managerSelectedAssetIds.clear();
                updateAssetManager(); renderCanvasAssetLibrary(); return;
            }
            if(event.target.closest?.('[data-manager-workflow-export]')){
                const items = (activeCanvasWorkflowCategory()?.items || []).filter(item => managerSelectedWorkflowIds.has(item.id));
                if(items.length === 1) {
                    const item = items[0];
                    downloadUrl(item.url, `${item.name || 'workflow'}${String(item.url).toLowerCase().endsWith('.json') ? '.json' : '.zip'}`);
                } else if(items.length > 1) {
                    const res = await fetch('/api/canvas-assets/download', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({filename:'workflows.zip', items:items.map(item => ({url:item.url, name:item.name || 'workflow'}))})});
                    if(res.ok) downloadBlob(await res.blob(), 'workflows.zip');
                }
                return;
            }
            if(event.target.closest?.('[data-manager-workflow-delete]')){
                if(!managerSelectedWorkflowIds.size) return;
                const data = await classicAssetPanel.mutate(() => window.CanvasApi.deleteAssetItems({library_id:classicAssetPanel.state.libraryId, ids:[...managerSelectedWorkflowIds]}));
                setCanvasAssetLibraryFromResponse(data, {render:false});
                if(accept(uiOrigin))managerSelectedWorkflowIds.clear();
                updateAssetManager(); renderCanvasAssetLibrary(); return;
            }
            if(event.target.closest?.('[data-manager-workflow-cat-new]')){
                const name = window.prompt('工作流分组名称', '工作流');
                if(!String(name || '').trim()) return;
                const data = await classicAssetPanel.mutate(() => window.CanvasApi.createAssetCategory({library_id:classicAssetPanel.state.libraryId, name, type:'workflow'}));
                setCanvasAssetLibraryFromResponse(data, {render:false});
                classicAssetPanel.selectTarget({libraryId:origin.libraryId, workflowCategoryId:data.category?.id || origin.workflowCategoryId}, {expected:origin,render:false});
                updateAssetManager(); renderCanvasAssetLibrary(); return;
            }
            if(event.target.closest?.('[data-manager-prompt-lib-new]')){
                const name = window.prompt('提示词库名称', '新提示词库');
                if(!String(name || '').trim()) return;
                const data = await window.CanvasApi.createPromptLibrary({name});
                canvasPromptLibraries = data.library?.libraries || canvasPromptLibraries;
                if(classicPromptPanel.capture().version === promptOrigin.version) classicPromptPanel.selectLibrary(data.prompt_library?.id || classicPromptPanel.state.libraryId,{source:'manager'});
                refreshCanvasPromptTemplatesFromLibraries();
                updateAssetManager(); return;
            }
            if(event.target.closest?.('[data-manager-prompt-lib-rename]')){
                const lib = activeCanvasPromptLibrary();
                if(!lib || lib.readonly) return;
                const name = window.prompt('提示词库名称', lib.name || '');
                if(!String(name || '').trim()) return;
                const data = await window.CanvasApi.updatePromptLibrary(lib.id, {name});
                canvasPromptLibraries = data.library?.libraries || canvasPromptLibraries;
                refreshCanvasPromptTemplatesFromLibraries();
                updateAssetManager(); return;
            }
            if(event.target.closest?.('[data-manager-prompt-lib-delete]')){
                const lib = activeCanvasPromptLibrary();
                if(!lib || lib.readonly || !window.confirm(`删除提示词库「${lib.name || '提示词库'}」？`)) return;
                const data = await window.CanvasApi.deletePromptLibrary(lib.id);
                canvasPromptLibraries = data.library?.libraries || canvasPromptLibraries;
                if(classicPromptPanel.capture().version === promptOrigin.version) classicPromptPanel.selectLibrary(data.library?.active_library_id || canvasPromptLibraries.find(item => item.id !== 'system')?.id || 'system',{source:'manager'});
                refreshCanvasPromptTemplatesFromLibraries();
                updateAssetManager(); return;
            }
            if(event.target.closest?.('[data-manager-prompt-new]')){
                const lib = activeCanvasPromptLibrary();
                if(!lib || lib.readonly) return;
                const name = window.prompt('提示词名称', '新提示词');
                if(!String(name || '').trim()) return;
                const positive = window.prompt('提示词内容', '');
                if(!String(positive || '').trim()) return;
                const data = await window.CanvasApi.createPromptItem({library_id:lib.id, name, positive, category:'mine'});
                canvasPromptLibraries = data.library?.libraries || canvasPromptLibraries;
                refreshCanvasPromptTemplatesFromLibraries();
                updateAssetManager(); return;
            }
            if(event.target.closest?.('[data-manager-prompt-delete]')){
                if(!managerSelectedPromptIds.size) return;
                const data = await window.CanvasApi.deletePromptItems({ids:[...managerSelectedPromptIds]});
                canvasPromptLibraries = data.library?.libraries || canvasPromptLibraries;
                if(accept(uiOrigin))managerSelectedPromptIds.clear();
                refreshCanvasPromptTemplatesFromLibraries();
                updateAssetManager(); return;
            }
        }, true);
    }
    return Object.freeze({
        get state(){return Object.freeze({open:open&&!destroyed,tab:assetManagerTab,assetIds:Object.freeze([...managerSelectedAssetIds]),workflowIds:Object.freeze([...managerSelectedWorkflowIds]),promptIds:Object.freeze([...managerSelectedPromptIds]),paused,destroyed});},
        open:openAssetManagerImpl,close:()=>{if(!destroyed)closeAssetManagerImpl();},selectTab:selectClassicAssetManagerTabImpl,
        render:renderAssetManagerImpl,renderImages:()=>paint(renderImageAssetManagerImpl),renderWorkflows:()=>paint(renderWorkflowAssetManagerImpl),renderPrompts:()=>paint(renderPromptAssetManagerImpl),
        dataChanged:updateAssetManagerImpl,selectionChanged,promptLibraryChanged,itemsRemoved,reveal,bind,pause,resume,destroy
    });
}
