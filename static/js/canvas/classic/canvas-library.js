/* Classic canvas: Asset libraries, prompt templates and their permission-aware actions.
 * Browser classic script (not an ES module); loaded before canvas.js.
 * Function declarations only: initialization is explicitly invoked by the entry.
 * Uses the entry's existing shared bindings; do not duplicate permission or document state.
 */

function revealCanvasAssetControls(){
    [canvasAssetToggle, canvasAssetPanel, assetManagerModal].forEach(el => {
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
    return activeCanvasAssetLibraryId === LOCAL_CANVAS_ASSET_LIBRARY_ID;
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
    return libs.find(lib => lib.id === activeCanvasAssetLibraryId) || libs[0] || null;
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
    return cats.find(cat => cat.id === activeCanvasAssetCategoryId) || cats[0] || null;
}

function activeCanvasMediaCategory(){
    const cats = canvasMediaCategories();
    return cats.find(cat => cat.id === activeCanvasAssetCategoryId) || cats[0] || null;
}

function canvasWorkflowCategories(){
    return (activeCanvasAssetLibrary()?.categories || canvasAssetLibrary.categories || []).filter(cat => String(cat.type || '').toLowerCase() === 'workflow');
}

function activeCanvasWorkflowCategory(){
    const cats = canvasWorkflowCategories();
    return cats.find(cat => cat.id === activeCanvasWorkflowCategoryId) || cats[0] || null;
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
    return canvasAssetUrisFaceVerified(canvasAssetRegisteredUris(item));
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
        return `<div class="canvas-asset-thumb-wrap canvas-asset-file-thumb"><i data-lucide="file-audio" class="w-6 h-6"></i><span>${escapeHtml(item?.name || 'audio')}</span></div>`;
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
    if(!canvasAssetHoverPreview || canvasAssetHoverPreview.hidden || canvasAssetHoverPreview.style.display === 'none') return;
    const pad = 14;
    const w = canvasAssetHoverPreview.offsetWidth || 280;
    const h = canvasAssetHoverPreview.offsetHeight || 330;
    let left = event.clientX - w - 16;
    if(left < pad) left = event.clientX + 16;
    left = Math.max(pad, Math.min(window.innerWidth - w - pad, left));
    const top = Math.max(pad, Math.min(window.innerHeight - h - pad, event.clientY + 12));
    canvasAssetHoverPreview.style.left = `${left}px`;
    canvasAssetHoverPreview.style.top = `${top}px`;
}

function showCanvasAssetHoverPreviewNow(event, item){
    if(!canvasAssetHoverPreview || !item?.url) return;
    if(canvasAssetItemKind(item) === 'workflow') return;
    const img = canvasAssetHoverPreview.querySelector('img');
    const video = canvasAssetHoverPreview.querySelector('video');
    const isVideo = canvasAssetItemKind(item) === 'video';
    const name = canvasAssetHoverPreview.querySelector('.canvas-asset-hover-name');
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
    bindCanvasPreviewImageFallbacks(canvasAssetHoverPreview);
    if(name) name.textContent = item.name || 'asset';
    canvasAssetHoverPreview.hidden = false;
    canvasAssetHoverPreview.style.display = 'block';
    positionCanvasAssetHoverPreview(event);
}

function hideCanvasAssetHoverPreviewNow(){
    if(!canvasAssetHoverPreview) return;
    canvasAssetHoverPreview.style.display = 'none';
    canvasAssetHoverPreview.hidden = true;
    const img = canvasAssetHoverPreview.querySelector('img');
    if(img) img.removeAttribute('src');
    const video = canvasAssetHoverPreview.querySelector('video');
    if(video) {
        video.pause?.();
        video.removeAttribute('src');
    }
}

async function renameCanvasAssetItem(itemId){
    const item = currentCanvasAssetItem(itemId);
    const name = window.prompt('资产名称', item?.name || '');
    if(!item || !String(name || '').trim()) return;
    const data = await window.CanvasApi.updateAssetItem(item.id, {name:String(name).trim()});
    canvasAssetLibrary = data.library || canvasAssetLibrary;
    renderCanvasAssetLibrary();
    if(assetManagerModal?.classList.contains('open')) renderAssetManager();
}

async function deleteCanvasAssetItem(itemId){
    const item = currentCanvasAssetItem(itemId);
    if(!item || !window.confirm(`删除资产「${item.name || 'asset'}」？`)) return;
    const data = await window.CanvasApi.deleteAssetItem(item.id);
    canvasAssetLibrary = data.library || canvasAssetLibrary;
    managerSelectedAssetIds.delete(item.id);
    managerSelectedWorkflowIds.delete(item.id);
    hideCanvasAssetHoverPreview();
    renderCanvasAssetLibrary();
    if(assetManagerModal?.classList.contains('open')) renderAssetManager();
}

async function loadCanvasAssetLibrary({renderPanel=true}={}){
    try {
        const [data, localData] = await window.CanvasApi.getAssetLibraries();
        const before = new Map(nodes.filter(node => node.type === 'image').map(node => [node.id,JSON.stringify(canvasFaceAuthState(node))]));
        canvasAssetLibrary = data.library || canvasAssetLibrary;
        const changed = nodes.filter(node => node.type === 'image' && before.get(node.id) !== JSON.stringify(canvasFaceAuthState(node))).map(node => node.id);
        if(changed.length) refreshNodes(changed);
        localCanvasAssetLibrary = {items:Array.isArray(localData.items) ? localData.items : [], tree:localData.tree || null};
        const libs = canvasAssetLibraries();
        if(!activeCanvasAssetLibraryId) activeCanvasAssetLibraryId = canvasAssetLibrary.active_library_id || libs[0]?.id || '';
        if(activeCanvasAssetLibraryId !== LOCAL_CANVAS_ASSET_LIBRARY_ID && !libs.some(lib => lib.id === activeCanvasAssetLibraryId)) activeCanvasAssetLibraryId = libs[0]?.id || '';
        const cats = canvasAssetCategories();
        if(!cats.some(cat => cat.id === activeCanvasAssetCategoryId)) activeCanvasAssetCategoryId = cats[0]?.id || '';
        if(renderPanel) renderCanvasAssetLibrary();
        return data;
    } catch(e) {
        setStatus('资产库加载失败');
        return null;
    }
}

function renderCanvasAssetLibrary({preserveScroll=false}={}){
    if(!canvasAssetPanel || !canvasAssetGrid) return;
    const scrollTop = preserveScroll ? canvasAssetGrid.scrollTop : 0;
    hideCanvasAssetHoverPreview();
    const libs = canvasAssetSourceLibraries();
    if(!activeCanvasAssetLibraryId || !libs.some(lib => lib.id === activeCanvasAssetLibraryId)) activeCanvasAssetLibraryId = canvasAssetLibrary.active_library_id || canvasAssetLibraries()[0]?.id || LOCAL_CANVAS_ASSET_LIBRARY_ID;
    if(canvasAssetLibrarySelect){
        canvasAssetLibrarySelect.innerHTML = libs.map(lib => `<option value="${escapeAttr(lib.id)}" ${lib.id === activeCanvasAssetLibraryId ? 'selected' : ''}>${escapeHtml(lib.name || '资产库')}</option>`).join('');
    }
    const cats = canvasAssetCategories();
    if(!cats.some(cat => cat.id === activeCanvasAssetCategoryId)) activeCanvasAssetCategoryId = cats[0]?.id || '';
    if(canvasAssetCategorySelect){
        canvasAssetCategorySelect.innerHTML = cats.map(cat => {
            const type = String(cat.type || 'image').toLowerCase();
            const prefix = type === 'workflow' ? '工作流 / ' : '';
            return `<option value="${escapeAttr(cat.id)}" ${cat.id === activeCanvasAssetCategoryId ? 'selected' : ''}>${escapeHtml(prefix + (cat.name || '默认分组'))}</option>`;
        }).join('');
    }
    const cat = activeCanvasAssetCategory();
    const catType = String(cat?.type || 'image').toLowerCase();
    const localMode = canvasAssetLibraryIsLocal();
    if(canvasAssetAddCategoryBtn) canvasAssetAddCategoryBtn.disabled = localMode;
    if(canvasAssetDropZone) {
        canvasAssetDropZone.style.display = localMode ? 'none' : 'flex';
        canvasAssetDropZone.textContent = catType === 'workflow' ? '工作流分组支持上传/导出工作流，双击卡片导入画布' : '拖入图片或输出保存到当前分组';
    }
    const query = canvasAssetSearchQuery.trim().toLowerCase();
    const allItems = cat?.items || [];
    const items = query ? allItems.filter(item => String(item?.name || '').toLowerCase().includes(query)) : allItems;
    const renderKey = `${activeCanvasAssetLibraryId}\u0000${activeCanvasAssetCategoryId}\u0000${query}`;
    if(renderKey !== canvasAssetRenderKey){
        canvasAssetRenderKey = renderKey;
        canvasAssetRenderedCount = CANVAS_ASSET_BATCH_SIZE;
    }
    canvasAssetFilteredCount = items.length;
    canvasAssetRenderedCount = Math.min(Math.max(CANVAS_ASSET_BATCH_SIZE, canvasAssetRenderedCount), items.length);
    const visibleItems = items.slice(0, canvasAssetRenderedCount);
    canvasAssetGrid.innerHTML = visibleItems.length ? visibleItems.map(item => `
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
    bindCanvasPreviewImageFallbacks(canvasAssetGrid);
    canvasAssetGrid.querySelectorAll('.canvas-asset-item').forEach(card => {
        card.addEventListener('dragstart', event => {
            event.dataTransfer.effectAllowed = 'copy';
            let assetUris = {};
            try { assetUris = JSON.parse(card.dataset.assetUris || '{}') || {}; } catch(e) { assetUris = {}; }
            event.dataTransfer.setData('application/x-canvas-asset', JSON.stringify({url:card.dataset.url, name:card.dataset.name, kind:card.dataset.kind || '', asset_uris:assetUris, asset_item_id:card.dataset.assetId, asset_library_id:activeCanvasAssetLibraryId}));
            event.dataTransfer.setData('text/plain', card.dataset.url || '');
        });
        card.addEventListener('dblclick', () => {
            if(card.dataset.kind === 'workflow') importWorkflowAssetUrl(card.dataset.url, card.dataset.name || 'workflow');
            else {
                let assetUris = {};
                try { assetUris = JSON.parse(card.dataset.assetUris || '{}') || {}; } catch(e) { assetUris = {}; }
                createImageCardFromUrl(card.dataset.url, defaultPoint(0, 0), card.dataset.name || 'asset', {kind:card.dataset.kind || '', asset_uris:assetUris, asset_item_id:card.dataset.assetId, asset_library_id:activeCanvasAssetLibraryId});
            }
        });
        const item = visibleItems.find(entry => entry.id === card.dataset.assetId);
        card.addEventListener('mouseenter', event => showCanvasAssetHoverPreview(event, {...item, previewUrl:card.querySelector('img')?.currentSrc}));
        card.addEventListener('mousemove', positionCanvasAssetHoverPreview);
        card.addEventListener('mouseleave', hideCanvasAssetHoverPreview);
        card.querySelectorAll('.canvas-asset-action').forEach(btn => {
            btn.addEventListener('pointerdown', event => event.stopPropagation());
            btn.addEventListener('dblclick', event => event.stopPropagation());
        });
        card.querySelector('[data-canvas-asset-rename]')?.addEventListener('click', async event => {
            event.preventDefault();
            event.stopPropagation();
            hideCanvasAssetHoverPreview();
            await renameCanvasAssetItem(event.currentTarget.dataset.canvasAssetRename || '');
        });
        card.querySelector('[data-canvas-asset-delete]')?.addEventListener('click', async event => {
            event.preventDefault();
            event.stopPropagation();
            await deleteCanvasAssetItem(event.currentTarget.dataset.canvasAssetDelete || '');
        });
    });
    canvasAssetGrid.scrollTop = preserveScroll ? scrollTop : 0;
    refreshIcons();
}

function toggleCanvasAssetLibrary(open=!canvasAssetLibraryOpen){
    canvasAssetLibraryOpen = !!open;
    if(canvasAssetLibraryOpen && workflowTransferModal?.classList.contains('open')) closeWorkflowTransferModal();
    canvasAssetPanel?.classList.toggle('open', canvasAssetLibraryOpen);
    canvasAssetToggle?.classList.toggle('active', canvasAssetLibraryOpen);
    if(!canvasAssetLibraryOpen) hideCanvasAssetHoverPreview();
    if(canvasAssetLibraryOpen) loadCanvasAssetLibrary();
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
    if(!canvasAssetPanel) return;
    const nextWidth = clampCanvasAssetPanelWidth(width);
    canvasAssetPanel.style.width = `${nextWidth}px`;
    if(updatePreferred) canvasAssetPanelWidth = nextWidth;
    canvasAssetResizeHandle?.setAttribute('aria-valuenow', String(nextWidth));
    canvasAssetResizeHandle?.setAttribute('aria-valuemax', String(canvasAssetPanelMaxWidth()));
    if(persist){
        try { localStorage.setItem(CANVAS_ASSET_PANEL_WIDTH_KEY, String(canvasAssetPanelWidth)); } catch(e) {}
    }
}

function finishCanvasAssetPanelResize(){
    if(!canvasAssetPanelResize) return;
    canvasAssetPanelResize = null;
    canvasAssetPanel?.classList.remove('resizing');
    document.body.classList.remove('canvas-asset-panel-resizing');
    applyCanvasAssetPanelWidth(canvasAssetPanelWidth, {persist:true});
}

async function addUrlToCanvasAssetLibrary(url, name=''){
    if(canvasAssetLibraryIsLocal()){ setStatus('本地素材请在素材库管理中上传'); return; }
    const cat = activeCanvasAssetCategory();
    if(!cat){ setStatus('请先创建资产分组'); return; }
    if(String(cat.type || 'image').toLowerCase() === 'workflow'){ setStatus('当前是工作流分组，请切换到图片分组保存媒体'); return; }
    const data = await window.CanvasApi.createAssetItem({library_id:activeCanvasAssetLibraryId, category_id:cat.id, url, name}, {errorFallback:'保存失败'});
    canvasAssetLibrary = data.library || canvasAssetLibrary;
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
    const sourceUrl = node.url;
    if(!canvasAssetLibraries().length || !activeCanvasAssetCategory()) await loadCanvasAssetLibrary({renderPanel:false});
    if(!nodes.includes(node) || node.url !== sourceUrl) throw new Error('图片已更改，请重新认证。');
    const linked = node.asset_item_id && canvasAssetItemLocation(node.asset_item_id);
    if(linked && (!target || (linked.libraryId === target.libraryId && linked.categoryId === target.categoryId))) {
        activeCanvasAssetLibraryId = linked.libraryId;
        activeCanvasAssetCategoryId = linked.categoryId;
        return linked;
    }
    const libraryId = target?.libraryId || activeCanvasAssetLibraryId;
    const categoryId = target?.categoryId || activeCanvasMediaCategory()?.id;
    if(!libraryId || !categoryId || libraryId === LOCAL_CANVAS_ASSET_LIBRARY_ID) throw new Error('请选择可编辑的素材库图片分组');
    const data = await window.CanvasApi.createAssetItem({library_id:libraryId, category_id:categoryId, url:node.url, name:node.name || outputImageName(node.url)}, {errorFallback:'上传素材库失败'});
    canvasAssetLibrary = data.library || canvasAssetLibrary;
    if(!nodes.includes(node) || node.url !== sourceUrl) throw new Error('图片已更改，请重新认证。');
    activeCanvasAssetLibraryId = libraryId;
    activeCanvasAssetCategoryId = categoryId;
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
    const response = await fetch(path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({library_id:libraryId, provider_id:providerId})});
    if(!response.ok) throw new Error(await responseErrorMessage(response, '素材认证失败'));
    return response.json();
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
            canvasAssetLibrary = data.library || canvasAssetLibrary;
            if(!isCurrent()) return;
            const registration = data.item?.registrations?.[canvasAvatarPlatform(provider)] || {};
            if(registration.status === 'Active') {
                node.face_auth_status = 'Active';
                node.asset_uris = canvasAssetRegisteredUris(data.item);
                refreshNodes([node.id]);
                scheduleSave();
                if(canvasAssetLibraryOpen) renderCanvasAssetLibrary();
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
        canvasAssetLibrary = data.library || canvasAssetLibrary;
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
    return window.CanvasApi.createAssetItemsBatch({library_id:libraryId, category_id:categoryId, items});
}

function openAssetManager(){
    assetManagerModal?.classList.add('open');
    managerSelectedAssetIds.clear();
    managerSelectedPromptIds.clear();
    canvasPromptTemplatesLoaded = false;
    Promise.all([loadCanvasAssetLibrary({renderPanel:false}), loadCanvasPromptTemplates()]).then(renderAssetManager);
}

function closeAssetManager(){
    assetManagerModal?.classList.remove('open');
}

function renderAssetManager(){
    if(!assetManagerBody) return;
    document.querySelectorAll('[data-manager-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.managerTab === assetManagerTab));
    if(assetManagerTab === 'prompts') renderPromptAssetManager();
    else if(assetManagerTab === 'workflows') renderWorkflowAssetManager();
    else renderImageAssetManager();
    refreshIcons();
}

function renderImageAssetManager(){
    const libs = canvasAssetLibraries();
    const library = activeCanvasAssetLibrary();
    const cats = canvasMediaCategories();
    if(!cats.some(cat => cat.id === activeCanvasAssetCategoryId)) activeCanvasAssetCategoryId = cats[0]?.id || '';
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
                ${libs.map(lib => `<button type="button" class="${lib.id === activeCanvasAssetLibraryId ? 'active' : ''}" data-manager-asset-lib="${escapeAttr(lib.id)}"><span>${escapeHtml(lib.name || '资产库')}</span><small>${(lib.categories || []).reduce((n,c)=>n+(c.items || []).length,0)}</small></button>`).join('')}
            </div>
            <div class="asset-manager-tools">
                <button type="button" class="primary" data-manager-asset-cat-new><i data-lucide="folder-plus" class="w-4 h-4"></i><span>新分组</span></button>
                <button type="button" ${!canEditCategory ? 'disabled' : ''} data-manager-asset-cat-rename><i data-lucide="pencil" class="w-4 h-4"></i><span>重命名</span></button>
                <button type="button" class="danger" ${!canEditCategory ? 'disabled' : ''} data-manager-asset-cat-delete><i data-lucide="trash-2" class="w-4 h-4"></i><span>删除组</span></button>
            </div>
            <div class="asset-manager-list">
                ${cats.map(item => `<button type="button" class="${item.id === activeCanvasAssetCategoryId ? 'active' : ''}" data-manager-asset-cat="${escapeAttr(item.id)}"><span>${escapeHtml(item.name || '分组')}</span><small>${(item.items || []).length}</small></button>`).join('')}
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
    upload?.addEventListener('change', async () => {
        if(!upload.files?.length || !cat) return;
        const data = await uploadFilesToLibrary(upload.files, library.id, cat.id);
        if(data?.library) canvasAssetLibrary = data.library;
        managerSelectedAssetIds.clear();
        renderAssetManager();
        renderCanvasAssetLibrary();
    });
}

function workflowAssetThumbHtml(item){
    return `<div class="asset-manager-card-text workflow-manager-thumb"><i data-lucide="workflow" class="w-6 h-6"></i><span>${escapeHtml(item?.format === 'json' ? 'JSON 工作流' : 'ZIP 工作流包')}</span></div>`;
}

function renderWorkflowAssetManager(){
    const libs = canvasAssetLibraries();
    const library = activeCanvasAssetLibrary();
    const cats = canvasWorkflowCategories();
    if(!cats.some(cat => cat.id === activeCanvasWorkflowCategoryId)) activeCanvasWorkflowCategoryId = cats[0]?.id || '';
    const cat = activeCanvasWorkflowCategory();
    const items = cat?.items || [];
    assetManagerBody.innerHTML = `
        <div class="asset-manager-side">
            <div class="asset-manager-tools">
                <button type="button" class="primary" data-manager-workflow-cat-new><i data-lucide="folder-plus" class="w-4 h-4"></i><span>新分组</span></button>
            </div>
            <div class="asset-manager-list">
                ${libs.map(lib => `<button type="button" class="${lib.id === activeCanvasAssetLibraryId ? 'active' : ''}" data-manager-workflow-lib="${escapeAttr(lib.id)}"><span>${escapeHtml(lib.name || '资产库')}</span><small>${(lib.categories || []).filter(c => String(c.type || '') === 'workflow').reduce((n,c)=>n+(c.items || []).length,0)}</small></button>`).join('')}
            </div>
            <div class="asset-manager-list">
                ${cats.map(item => `<button type="button" class="${item.id === activeCanvasWorkflowCategoryId ? 'active' : ''}" data-manager-workflow-cat="${escapeAttr(item.id)}"><span>${escapeHtml(item.name || '工作流')}</span><small>${(item.items || []).length}</small></button>`).join('') || '<div class="canvas-asset-empty">暂无工作流分组</div>'}
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
    upload?.addEventListener('change', async () => {
        if(!upload.files?.length || !cat) return;
        const form = new FormData();
        form.append('library_id', library?.id || '');
        form.append('category_id', cat.id || '');
        [...upload.files].forEach(file => form.append('files', file));
        const data = await window.CanvasApi.uploadAssetWorkflows(form);
        canvasAssetLibrary = data.library || canvasAssetLibrary;
        managerSelectedWorkflowIds.clear();
        renderAssetManager();
        renderCanvasAssetLibrary();
    });
}

function renderPromptAssetManager(){
    const libs = canvasPromptLibraries.filter(lib => lib.id !== 'system');
    if(!canvasPromptLibraries.some(lib => lib.id === activePromptLibraryId)) activePromptLibraryId = libs[0]?.id || canvasPromptLibraries[0]?.id || 'system';
    const lib = canvasPromptLibraries.find(item => item.id === activePromptLibraryId) || libs[0] || null;
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
                ${canvasPromptLibraries.map(library => `<button type="button" class="${library.id === activePromptLibraryId ? 'active' : ''}" data-manager-prompt-lib="${escapeAttr(library.id)}"><span>${escapeHtml(library.name || '提示词库')}</span><small>${(library.items || []).length}</small></button>`).join('')}
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

async function loadCanvasPromptTemplates(){
    if(canvasPromptTemplatesLoaded) return canvasPromptTemplates;
    try {
        loadCanvasPromptTemplateGroups();
        loadCanvasPromptTemplateOverrides();
        const data = await window.CanvasApi.getPromptLibraries();
        canvasPromptLibraries = Array.isArray(data.library?.libraries) ? data.library.libraries : [];
        if(!canvasPromptLibraries.some(lib => lib.id === activePromptLibraryId)) {
            activePromptLibraryId = canvasPromptLibraries.some(lib => lib.id === 'system') ? 'system' : (canvasPromptLibraries[0]?.id || 'system');
        }
        canvasPromptTemplates = activeCanvasPromptLibraryItems();
    } catch(e) {
        canvasPromptTemplates = [];
        canvasPromptLibraries = [];
    }
    canvasPromptTemplatesLoaded = true;
    return canvasPromptTemplates;
}

function activeCanvasPromptLibrary(){
    return canvasPromptLibraries.find(lib => lib.id === activePromptLibraryId) || canvasPromptLibraries[0] || {id:'system', name:'系统提示词库', readonly:true, items:[]};
}

function defaultCanvasPromptTemplateGroups(){
    return [
        {id:'view', name:tr('smart.tplCatView')},
        {id:'storyboard', name:tr('smart.tplCatStoryboard')},
        {id:'character', name:tr('smart.tplCatCharacter')},
        {id:'product', name:tr('smart.tplCatProduct')},
        {id:'lighting', name:tr('smart.tplCatLighting')},
        {id:'mine', name:tr('smart.tplCatMine')}
    ];
}

function loadCanvasPromptTemplateGroups(){
    try {
        const list = JSON.parse(localStorage.getItem(CANVAS_PROMPT_TEMPLATE_GROUPS_KEY) || '[]');
        const valid = Array.isArray(list) ? list.filter(g => g?.id && g?.name) : [];
        const defaults = defaultCanvasPromptTemplateGroups();
        promptTemplateGroups = defaults.map(group => valid.find(g => g.id === group.id) || group);
        valid.filter(g => !promptTemplateGroups.some(x => x.id === g.id)).forEach(g => promptTemplateGroups.push(g));
    } catch(e) {
        promptTemplateGroups = defaultCanvasPromptTemplateGroups();
    }
}

function saveCanvasPromptTemplateGroups(){
    localStorage.setItem(CANVAS_PROMPT_TEMPLATE_GROUPS_KEY, JSON.stringify(promptTemplateGroups));
}

function loadCanvasPromptTemplateOverrides(){
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

function saveCanvasPromptTemplateOverrides(){
    localStorage.setItem(CANVAS_PROMPT_TEMPLATE_OVERRIDES_KEY, JSON.stringify(canvasPromptTemplateOverrides));
}

function activeCanvasPromptLibraryItems(){
    const lib = activeCanvasPromptLibrary();
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

function refreshCanvasPromptTemplatesFromLibraries(){
    canvasPromptTemplatesLoaded = true;
    canvasPromptTemplates = activeCanvasPromptLibraryItems();
    renderCanvasPromptLibrarySelect();
}

function renderCanvasPromptLibrarySelect(){
    if(!promptTemplateLibrarySelect) return;
    promptTemplateLibrarySelect.innerHTML = canvasPromptLibraries.map(lib => `<option value="${escapeAttr(lib.id)}" ${lib.id === activePromptLibraryId ? 'selected' : ''}>${escapeHtml(lib.name || '提示词库')}</option>`).join('');
}

function activeCanvasPromptTemplateGroups(){
    const lib = activeCanvasPromptLibrary();
    if(!lib || lib.id === 'system') return promptTemplateGroups;
    return Array.isArray(lib.categories) ? lib.categories.filter(c => c?.id && c?.name) : [];
}

function canvasPromptTemplateCategoryLabel(category){
    if(category === 'all') return tr('smart.tplAll');
    const lib = activeCanvasPromptLibrary();
    if(lib && lib.id !== 'system'){
        return activeCanvasPromptTemplateGroups().find(g => g.id === category)?.name || category || '';
    }
    const builtin = {
        view:tr('smart.tplCatView'),
        storyboard:tr('smart.tplCatStoryboard'),
        character:tr('smart.tplCatCharacter'),
        product:tr('smart.tplCatProduct'),
        lighting:tr('smart.tplCatLighting'),
        mine:tr('smart.tplCatMine')
    };
    return builtin[category] || promptTemplateGroups.find(g => g.id === category)?.name || category || '';
}

function canvasPromptTemplateName(template){
    if(langIsEn() && template?.name_en) return template.name_en;
    return template?.name || '';
}

function canvasPromptTemplateScene(template){
    if(langIsEn() && template?.scene_en) return template.scene_en;
    return template?.scene || '';
}

function canvasPromptTemplateText(template, mode='positive'){
    const positive = String(template?.positive || '').trim();
    if(mode === 'positive') return positive;
    const negative = String(template?.negative || '').trim();
    const params = Object.entries(template?.params || {})
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
    return [positive, negative ? `Negative prompt:\n${negative}` : '', params ? `Params:\n${params}` : ''].filter(Boolean).join('\n\n');
}

function canvasPromptTemplateSearchText(template){
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

function canvasPromptTemplateVisibleItems(){
    const query = String(promptTemplateSearch?.value || promptTemplateQuery || '').trim().toLowerCase();
    return canvasPromptTemplates.filter(item => {
        if(promptTemplateCategory !== 'all' && item.category !== promptTemplateCategory) return false;
        if(!query) return true;
        return canvasPromptTemplateSearchText(item).includes(query);
    });
}

function currentCanvasPromptTemplateLibraryEditable(){
    const lib = activeCanvasPromptLibrary();
    return Boolean(lib && lib.id !== 'system' && !lib.readonly);
}

function currentCanvasPromptTemplateNodeText(){
    const node = nodes.find(n => n.id === promptTemplateNodeId && n.type === 'prompt');
    return String(node?.text || '').trim();
}

function syncCanvasPromptTemplateButtons(){
    const activeId = promptTemplateModal?.classList.contains('open') ? promptTemplateNodeId : '';
    document.querySelectorAll('[data-prompt-template-open]').forEach(btn => {
        const active = Boolean(activeId && btn.dataset.promptTemplateNodeId === activeId);
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function canvasPromptTemplateDefaultName(text){
    return (String(text || '').trim().split(/\r?\n/)[0] || '新提示词').slice(0, 28);
}

function selectedCanvasPromptTemplate(){
    return canvasPromptTemplates.find(item => item.id === promptTemplateSelectedId) || canvasPromptTemplates[0] || null;
}

function syncCanvasPromptTemplateMutation(data, fallbackSelectedId=''){
    canvasPromptLibraries = data.library?.libraries || canvasPromptLibraries;
    refreshCanvasPromptTemplatesFromLibraries();
    promptTemplateSelectedId = data.item?.id || fallbackSelectedId || promptTemplateSelectedId;
    const selected = selectedCanvasPromptTemplate();
    promptTemplateCategory = selected?.category || promptTemplateCategory || 'all';
}

async function saveCurrentCanvasPromptAsTemplate(){
    const lib = activeCanvasPromptLibrary();
    if(!currentCanvasPromptTemplateLibraryEditable()){ setStatus('请选择可编辑的提示词库'); return; }
    const text = currentCanvasPromptTemplateNodeText();
    if(!text){ setStatus('当前提示词为空'); return; }
    try {
        const data = await window.CanvasApi.createPromptItem({
            library_id:lib.id,
            name:canvasPromptTemplateDefaultName(text),
            category:promptTemplateCategory === 'all' ? 'mine' : promptTemplateCategory,
            positive:text,
            scene:'我的提示词预设'
        }, {errorFallback:'保存失败'});
        activePromptLibraryId = lib.id;
        syncCanvasPromptTemplateMutation(data, data.item?.id || '');
        promptTemplateEditing = true;
        renderPromptTemplateModal();
    } catch(err) {
        setStatus(err.message || '保存失败');
    }
}

async function createBlankCanvasPromptTemplate(){
    const lib = activeCanvasPromptLibrary();
    if(!currentCanvasPromptTemplateLibraryEditable()){ setStatus('请选择可编辑的提示词库'); return; }
    const category = promptTemplateCategory && promptTemplateCategory !== 'all' ? promptTemplateCategory : 'mine';
    try {
        const data = await window.CanvasApi.createPromptItem({library_id:lib.id, name:'新模板', category, positive:'新提示词', scene:'我的提示词预设'}, {errorFallback:'创建失败'});
        activePromptLibraryId = lib.id;
        promptTemplateCategory = category;
        syncCanvasPromptTemplateMutation(data, data.item?.id || '');
        promptTemplateEditing = true;
        renderPromptTemplateModal();
    } catch(err) {
        setStatus(err.message || '创建失败');
    }
}

async function saveCanvasPromptTemplateEdit(){
    const lib = activeCanvasPromptLibrary();
    const item = selectedCanvasPromptTemplate();
    if(!item) return;
    const name = promptTemplatePanel.querySelector('[data-template-edit-name]')?.value?.trim() || '';
    const positive = promptTemplatePanel.querySelector('[data-template-edit-text]')?.value?.trim() || '';
    const category = promptTemplatePanel.querySelector('[data-template-edit-category]')?.value || 'mine';
    if(!name || !positive){ setStatus(tr('smart.tplRequired')); return; }
    try {
        if(item.builtin){
            canvasPromptTemplateOverrides.editedBuiltins = canvasPromptTemplateOverrides.editedBuiltins || {};
            canvasPromptTemplateOverrides.editedBuiltins[item.sourceId || item.id] = {
                ...(canvasPromptTemplateOverrides.editedBuiltins[item.sourceId || item.id] || {}),
                name,
                category,
                positive
            };
            saveCanvasPromptTemplateOverrides();
            promptTemplateEditing = false;
            refreshCanvasPromptTemplatesFromLibraries();
            renderPromptTemplateModal();
            return;
        }
        const data = await window.CanvasApi.updatePromptItem(item.id, {library_id:item.libraryId || lib.id, name, category, scene:item.scene || '', positive, negative:item.negative || ''}, {errorFallback:'保存失败'});
        syncCanvasPromptTemplateMutation(data, item.id);
        promptTemplateEditing = false;
        renderPromptTemplateModal();
    } catch(err) {
        setStatus(err.message || '保存失败');
    }
}

async function deleteCanvasPromptTemplate(){
    const item = selectedCanvasPromptTemplate();
    if(!item) return;
    if(!window.confirm(`删除提示词「${canvasPromptTemplateName(item) || '提示词'}」？`)) return;
    try {
        if(item.builtin){
            canvasPromptTemplateOverrides.hiddenBuiltinIds = [...new Set([...(canvasPromptTemplateOverrides.hiddenBuiltinIds || []), item.sourceId || item.id])];
            saveCanvasPromptTemplateOverrides();
            promptTemplateSelectedId = '';
            promptTemplateEditing = false;
            refreshCanvasPromptTemplatesFromLibraries();
            renderPromptTemplateModal();
            return;
        }
        const data = await window.CanvasApi.deletePromptItem(item.id, {errorFallback:'删除失败'});
        canvasPromptLibraries = data.library?.libraries || canvasPromptLibraries;
        refreshCanvasPromptTemplatesFromLibraries();
        promptTemplateSelectedId = '';
        promptTemplateEditing = false;
        renderPromptTemplateModal();
    } catch(err) {
        setStatus(err.message || '删除失败');
    }
}

function promptTemplateScrollSnapshot(){
    if(!promptTemplatePanel) return null;
    return {
        panelTop:promptTemplatePanel.scrollTop || 0,
        tabLeft:promptTemplatePanel.querySelector('.prompt-template-tabs')?.scrollLeft || 0,
        listTop:promptTemplatePanel.querySelector('.prompt-template-list')?.scrollTop || 0,
        detailTop:promptTemplatePanel.querySelector('.prompt-template-preview-content')?.scrollTop || 0
    };
}

function restorePromptTemplateScroll(snapshot){
    if(!snapshot || !promptTemplatePanel) return;
    requestAnimationFrame(() => {
        promptTemplatePanel.scrollTop = snapshot.panelTop || 0;
        const tabs = promptTemplatePanel.querySelector('.prompt-template-tabs');
        const list = promptTemplatePanel.querySelector('.prompt-template-list');
        const detail = promptTemplatePanel.querySelector('.prompt-template-preview-content');
        if(tabs) tabs.scrollLeft = snapshot.tabLeft || 0;
        if(list) list.scrollTop = snapshot.listTop || 0;
        if(detail) detail.scrollTop = snapshot.detailTop || 0;
    });
}

async function createCanvasPromptTemplateGroup(){
    const name = window.prompt(tr('smart.tplNewGroupPrompt'), tr('smart.tplNewGroupDefault'));
    if(!String(name || '').trim()) return;
    const lib = activeCanvasPromptLibrary();
    if(lib && lib.id !== 'system'){
        try {
            const data = await window.CanvasApi.createPromptCategory({name:String(name).trim().slice(0, 24), library_id:lib.id}, {errorFallback:'新增分组失败'});
            canvasPromptLibraries = data.library?.libraries || canvasPromptLibraries;
            promptTemplateCategory = data.category?.id || promptTemplateCategory;
            refreshCanvasPromptTemplatesFromLibraries();
            renderPromptTemplateModal();
        } catch(err){ setStatus(err.message || '新增分组失败'); }
        return;
    }
    const group = {id:uid('tpl_group'), name:String(name).trim().slice(0, 24)};
    promptTemplateGroups.push(group);
    saveCanvasPromptTemplateGroups();
    promptTemplateCategory = group.id;
    renderPromptTemplateModal();
}

async function renameCanvasPromptTemplateGroup(groupId){
    const lib = activeCanvasPromptLibrary();
    const group = activeCanvasPromptTemplateGroups().find(g => g.id === groupId);
    if(!group) return;
    const name = window.prompt(tr('smart.tplGroupNamePrompt'), group.name || '');
    if(!String(name || '').trim()) return;
    if(lib && lib.id !== 'system'){
        try {
            const data = await window.CanvasApi.updatePromptCategory(groupId, {name:String(name).trim().slice(0, 24), library_id:lib.id}, {errorFallback:'重命名失败'});
            canvasPromptLibraries = data.library?.libraries || canvasPromptLibraries;
            refreshCanvasPromptTemplatesFromLibraries();
            renderPromptTemplateModal();
        } catch(err){ setStatus(err.message || '重命名失败'); }
        return;
    }
    group.name = String(name).trim().slice(0, 24);
    saveCanvasPromptTemplateGroups();
    renderPromptTemplateModal();
}

async function deleteCanvasPromptTemplateGroup(groupId){
    const lib = activeCanvasPromptLibrary();
    if(lib && lib.id !== 'system'){
        if(!window.confirm(tr('smart.tplDeleteGroupConfirm'))) return;
        try {
            const data = await window.CanvasApi.deletePromptCategory(groupId, {errorFallback:'删除失败'});
            canvasPromptLibraries = data.library?.libraries || canvasPromptLibraries;
            if(promptTemplateCategory === groupId) promptTemplateCategory = 'all';
            refreshCanvasPromptTemplatesFromLibraries();
            renderPromptTemplateModal();
        } catch(err){ setStatus(err.message || '删除失败'); }
        return;
    }
    if(['view','storyboard','character','product','lighting','mine'].includes(groupId)){
        renameCanvasPromptTemplateGroup(groupId);
        return;
    }
    if(!window.confirm(tr('smart.tplDeleteGroupConfirm'))) return;
    promptTemplateGroups = promptTemplateGroups.filter(g => g.id !== groupId);
    Object.entries(canvasPromptTemplateOverrides.editedBuiltins || {}).forEach(([id, item]) => {
        if(item?.category === groupId) canvasPromptTemplateOverrides.editedBuiltins[id] = {...item, category:'mine'};
    });
    canvasPromptLibraries = canvasPromptLibraries.map(lib => ({
        ...lib,
        items:(lib.items || []).map(item => item.category === groupId ? {...item, category:'mine'} : item)
    }));
    if(promptTemplateCategory === groupId) promptTemplateCategory = 'all';
    saveCanvasPromptTemplateGroups();
    saveCanvasPromptTemplateOverrides();
    refreshCanvasPromptTemplatesFromLibraries();
    renderPromptTemplateModal();
}

function renderPromptTemplateModal(){
    if(!promptTemplateModal || !promptTemplatePanel || !promptTemplateCats || !promptTemplateBody) return;
    canvasPromptTemplates = activeCanvasPromptLibraryItems();
    renderCanvasPromptLibrarySelect();
    const scrollSnapshot = promptTemplateScrollSnapshot();
    const activeGroups = activeCanvasPromptTemplateGroups();
    const categories = [{id:'all', name:tr('smart.tplAll')}, ...activeGroups.map(group => ({...group, name:canvasPromptTemplateCategoryLabel(group.id)}))];
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
                    <strong>${escapeHtml(tr('smart.tplGroupManage'))}</strong>
                    <span>${escapeHtml(tr('smart.tplGroupHint'))}</span>
                </div>
                <div class="prompt-template-group-tools">
                    <button type="button" data-template-cat-new><i data-lucide="plus"></i><span>${escapeHtml(tr('smart.tplAdd'))}</span></button>
                    <button type="button" class="primary" data-template-group-edit><i data-lucide="check"></i><span>${escapeHtml(tr('smart.tplDone'))}</span></button>
                </div>
            </div>
            <div class="prompt-template-group-list">
                ${activeGroups.map(group => `
                    <div class="prompt-template-group-row ${['view','storyboard','character','product','lighting','mine'].includes(group.id) ? '' : 'has-delete'}">
                        <button type="button" class="group-name ${group.id === promptTemplateCategory ? 'active' : ''}" data-template-cat="${escapeAttr(group.id)}">
                            <span>${escapeHtml(canvasPromptTemplateCategoryLabel(group.id))}</span>
                            <small>${counts[group.id] || 0}</small>
                        </button>
                        <button type="button" class="group-tool" data-template-cat-edit="${escapeAttr(group.id)}" title="${escapeAttr(tr('smart.tplRename'))}"><i data-lucide="pencil"></i></button>
                        ${['view','storyboard','character','product','lighting','mine'].includes(group.id) ? '' : `<button type="button" class="group-tool danger" data-template-cat-delete="${escapeAttr(group.id)}" title="${escapeAttr(tr('common.delete'))}"><i data-lucide="trash-2"></i></button>`}
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
            <button type="button" class="prompt-template-manage-groups" data-template-group-edit><i data-lucide="settings-2"></i><span>${escapeHtml(tr('smart.tplManageGroups'))}</span></button>
        </div>
    `;
    const items = canvasPromptTemplateVisibleItems();
    if(items.length && !items.some(item => item.id === promptTemplateSelectedId)) promptTemplateSelectedId = items[0].id;
    const selected = items.find(item => item.id === promptTemplateSelectedId) || items[0] || null;
    const canCreateCurrentLibrary = currentCanvasPromptTemplateLibraryEditable();
    const editMode = Boolean(promptTemplateEditing && selected);
    promptTemplateBody.innerHTML = `
        <div class="prompt-template-list">
            <div class="prompt-template-list-tools">
                <button type="button" ${canCreateCurrentLibrary ? '' : 'disabled'} data-template-save-current><i data-lucide="bookmark-plus"></i><span>${escapeHtml(tr('smart.tplSaveCurrent'))}</span></button>
                <button type="button" ${canCreateCurrentLibrary ? '' : 'disabled'} data-template-new><i data-lucide="file-plus-2"></i><span>${escapeHtml(tr('smart.tplNewTemplate'))}</span></button>
            </div>
            ${items.length ? items.map(item => `<button type="button" class="prompt-template-card ${item.id === selected?.id ? 'active' : ''}" data-template-id="${escapeAttr(item.id)}">
                <span class="prompt-template-card-top">
                    <span class="prompt-template-name">${escapeHtml(canvasPromptTemplateName(item))}</span>
                    <span class="prompt-template-source">${escapeHtml(item.builtin ? tr('smart.tplBuiltin') : tr('smart.tplMine'))}</span>
                </span>
                <span class="prompt-template-scene">${escapeHtml(canvasPromptTemplateScene(item) || item.positive || '')}</span>
                <span class="prompt-template-tag">${escapeHtml(canvasPromptTemplateCategoryLabel(item.category || 'mine'))}</span>
            </button>`).join('') : `<div class="prompt-template-list-empty">${escapeHtml(tr('smart.tplNoMatches'))}</div>`}
        </div>
        <div class="prompt-template-detail">
            ${selected ? `
                <div class="prompt-template-detail-head">
                    <div>
                        <strong>${escapeHtml(canvasPromptTemplateName(selected) || '')}</strong>
                        <span>${escapeHtml(canvasPromptTemplateCategoryLabel(selected.category || ''))} · ${escapeHtml(selected.builtin ? tr('smart.tplBuiltinTemplate') : tr('smart.tplMineTemplate'))}</span>
                    </div>
                    ${editMode ? '' : `
                        <div class="prompt-template-icon-actions">
                            <button type="button" data-template-edit title="${escapeAttr(tr('smart.tplEditTemplate'))}"><i data-lucide="pencil"></i><span>${escapeHtml(tr('common.edit'))}</span></button>
                            <button type="button" class="danger" data-template-delete title="${escapeAttr(tr('smart.tplDeleteTemplate'))}"><i data-lucide="trash-2"></i><span>${escapeHtml(tr('common.delete'))}</span></button>
                        </div>
                    `}
                </div>
            ${editMode ? `
                <div class="prompt-template-edit-fields">
                    <label>${escapeHtml(tr('smart.tplName'))}</label>
                    <input data-template-edit-name value="${escapeAttr(canvasPromptTemplateName(selected) || '')}" placeholder="${escapeAttr(tr('smart.tplName'))}">
                    <label>${escapeHtml(tr('smart.tplGroup'))}</label>
                    <select data-template-edit-category>
                        ${promptTemplateGroups.map(group => `<option value="${escapeAttr(group.id)}" ${group.id === (selected.category || 'mine') ? 'selected' : ''}>${escapeHtml(canvasPromptTemplateCategoryLabel(group.id))}</option>`).join('')}
                    </select>
                    <label>${escapeHtml(tr('smart.tplContent'))}</label>
                    <textarea data-template-edit-text placeholder="${escapeAttr(tr('smart.tplContent'))}">${escapeHtml(selected.positive || '')}</textarea>
                </div>
            ` : `
                <div class="prompt-template-preview-content">
                    <div class="prompt-template-section">
                        <label>${escapeHtml(tr('smart.tplPositive'))}</label>
                        <p>${escapeHtml(selected.positive || '')}</p>
                    </div>
                    ${selected.negative ? `<div class="prompt-template-section"><label>${escapeHtml(tr('smart.tplNegative'))}</label><p>${escapeHtml(selected.negative)}</p></div>` : ''}
                    ${Object.keys(selected.params || {}).length ? `<div class="prompt-template-section"><label>${escapeHtml(tr('smart.tplParams'))}</label><p>${escapeHtml(Object.entries(selected.params).map(([k,v]) => `${k}: ${v}`).join('\n'))}</p></div>` : ''}
                </div>
            `}
            <div class="prompt-template-actions">
                ${editMode ? `
                    <button type="button" data-template-edit-cancel><i data-lucide="x"></i><span>${escapeHtml(tr('common.cancel'))}</span></button>
                    <button type="button" class="danger" data-template-delete><i data-lucide="trash-2"></i><span>${escapeHtml(tr('common.delete'))}</span></button>
                    <button type="button" class="primary" data-template-edit-save><i data-lucide="save"></i><span>${escapeHtml(tr('common.save'))}</span></button>
                ` : `
                    <button type="button" data-template-apply="positive"><i data-lucide="corner-down-left"></i><span>${escapeHtml(tr('smart.tplApplyPositive'))}</span></button>
                    <button type="button" class="primary" data-template-apply="full"><i data-lucide="wand-sparkles"></i><span>${escapeHtml(tr('smart.tplApplyFull'))}</span></button>
                `}
            </div>
            ` : `<div class="prompt-template-empty">${escapeHtml(tr('smart.tplPickOrCreate'))}</div>`}
        </div>
    `;
    refreshIcons();
    restorePromptTemplateScroll(scrollSnapshot);
}

async function openPromptTemplateModal(nodeId){
    promptTemplateNodeId = nodeId || '';
    promptTemplateQuery = '';
    promptTemplateEditing = false;
    if(promptTemplateSearch) promptTemplateSearch.value = '';
    await loadCanvasPromptTemplates();
    if(!promptTemplateCategory) promptTemplateCategory = 'all';
    if(!promptTemplateSelectedId) promptTemplateSelectedId = canvasPromptTemplates[0]?.id || '';
    renderPromptTemplateModal();
    promptTemplateModal?.classList.add('open');
    syncCanvasPromptTemplateButtons();
    promptTemplateSearch?.focus();
}

function closePromptTemplateModal(){
    promptTemplateModal?.classList.remove('open');
    promptTemplateNodeId = '';
    promptTemplateEditing = false;
    syncCanvasPromptTemplateButtons();
}

function applyPromptTemplateToPromptNode(mode='positive'){
    const template = canvasPromptTemplates.find(item => item.id === promptTemplateSelectedId);
    const node = nodes.find(n => n.id === promptTemplateNodeId && n.type === 'prompt');
    if(!template || !node) return;
    node.text = canvasPromptTemplateText(template, mode);
    closePromptTemplateModal();
    scheduleSave();
    const body = nodesEl.querySelector(`.node[data-id="${CSS.escape(node.id)}"] .node-body`);
    const textarea = body?.querySelector('textarea');
    if(textarea) textarea.value = node.text;
    if(body) refreshPromptCounter(body, node.text);
    refreshPromptDependents(node.id);
    refreshGeometryAfterLayout();
}

// Called once by canvas.js, at its original initialization position.
function bindClassicLibraryControls(){
    promptTemplateSearch?.addEventListener('input', event => {
        promptTemplateQuery = event.target.value || '';
        renderPromptTemplateModal();
    });
    promptTemplateLibrarySelect?.addEventListener('change', () => {
        activePromptLibraryId = promptTemplateLibrarySelect.value || 'system';
        canvasPromptTemplates = activeCanvasPromptLibraryItems();
        promptTemplateSelectedId = '';
        promptTemplateEditing = false;
        renderPromptTemplateModal();
    });
    if(promptTemplateClose) promptTemplateClose.onclick = closePromptTemplateModal;
    promptTemplatePanel?.addEventListener('pointerdown', e => e.stopPropagation());
    promptTemplatePanel?.addEventListener('mousedown', e => e.stopPropagation());
    promptTemplatePanel?.addEventListener('wheel', e => e.stopPropagation(), {passive:false});
    promptTemplatePanel?.addEventListener('click', event => {
        event.stopPropagation();
        const apply = event.target.closest('[data-template-apply],[data-prompt-template-apply]');
        if(apply){
            applyPromptTemplateToPromptNode(apply.dataset.templateApply || apply.dataset.promptTemplateApply || 'positive');
            return;
        }
        if(event.target.closest('[data-template-save-current],[data-prompt-template-save-current]')){ saveCurrentCanvasPromptAsTemplate(); return; }
        if(event.target.closest('[data-template-new],[data-prompt-template-new]')){ createBlankCanvasPromptTemplate(); return; }
        if(event.target.closest('[data-template-edit],[data-prompt-template-edit]')){
            promptTemplateEditing = true;
            renderPromptTemplateModal();
            return;
        }
        if(event.target.closest('[data-template-edit-cancel],[data-prompt-template-edit-cancel]')){ promptTemplateEditing = false; renderPromptTemplateModal(); return; }
        if(event.target.closest('[data-template-edit-save],[data-prompt-template-edit-save]')){ saveCanvasPromptTemplateEdit(); return; }
        if(event.target.closest('[data-template-delete],[data-prompt-template-delete]')){
            deleteCanvasPromptTemplate();
            return;
        }
        const cat = event.target.closest('[data-template-cat],[data-prompt-template-cat]');
        if(cat){
            promptTemplateCategory = cat.dataset.templateCat || cat.dataset.promptTemplateCat || 'all';
            promptTemplateSelectedId = '';
            promptTemplateEditing = false;
            renderPromptTemplateModal();
            return;
        }
        const catEdit = event.target.closest('[data-template-cat-edit]');
        if(catEdit){
            renameCanvasPromptTemplateGroup(catEdit.dataset.templateCatEdit || '');
            return;
        }
        const catDelete = event.target.closest('[data-template-cat-delete]');
        if(catDelete){
            deleteCanvasPromptTemplateGroup(catDelete.dataset.templateCatDelete || '');
            return;
        }
        if(event.target.closest('[data-template-group-edit]')){
            promptTemplateGroupEditMode = !promptTemplateGroupEditMode;
            renderPromptTemplateModal();
            return;
        }
        if(event.target.closest('[data-template-cat-new]')){ createCanvasPromptTemplateGroup(); return; }
        const item = event.target.closest('[data-template-id],[data-prompt-template-id]');
        if(item){
            promptTemplateSelectedId = item.dataset.templateId || item.dataset.promptTemplateId || '';
            promptTemplateEditing = false;
            renderPromptTemplateModal();
            return;
        }
    });
    canvasAssetToggle?.addEventListener('click', () => toggleCanvasAssetLibrary());
    applyCanvasAssetPanelWidth(canvasAssetPanelWidth, {updatePreferred:false});
    canvasAssetResizeHandle?.addEventListener('mousedown', event => {
        if(event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        canvasAssetPanelResize = {
            startX:event.clientX,
            startWidth:canvasAssetPanel.getBoundingClientRect().width,
        };
        canvasAssetPanel.classList.add('resizing');
        document.body.classList.add('canvas-asset-panel-resizing');
        startWindowPointerSession(moveEvent => {
            if(!canvasAssetPanelResize) return;
            moveEvent.preventDefault();
            applyCanvasAssetPanelWidth(canvasAssetPanelResize.startWidth + canvasAssetPanelResize.startX - moveEvent.clientX);
        }, finishCanvasAssetPanelResize);
    });
    canvasAssetResizeHandle?.addEventListener('dblclick', event => {
        event.preventDefault();
        event.stopPropagation();
        applyCanvasAssetPanelWidth(CANVAS_ASSET_PANEL_DEFAULT_WIDTH, {persist:true});
    });
    canvasAssetResizeHandle?.addEventListener('keydown', event => {
        if(!['ArrowLeft','ArrowRight','Home'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        if(event.key === 'Home') applyCanvasAssetPanelWidth(CANVAS_ASSET_PANEL_DEFAULT_WIDTH, {persist:true});
        else {
            const step = event.shiftKey ? 64 : 24;
            applyCanvasAssetPanelWidth(canvasAssetPanelWidth + (event.key === 'ArrowLeft' ? step : -step), {persist:true});
        }
    });
    window.addEventListener('resize', () => {
        if(!canvasAssetPanelResize) applyCanvasAssetPanelWidth(canvasAssetPanelWidth, {updatePreferred:false});
    });
}

// Called once by canvas.js, at its original initialization position.
function bindClassicLibraryNavigation(){
    canvasAssetCloseBtn?.addEventListener('click', () => toggleCanvasAssetLibrary(false));
    canvasAssetLibrarySelect?.addEventListener('change', () => {
        activeCanvasAssetLibraryId = canvasAssetLibrarySelect.value || '';
        activeCanvasAssetCategoryId = '';
        renderCanvasAssetLibrary();
    });
    canvasAssetCategorySelect?.addEventListener('change', () => {
        activeCanvasAssetCategoryId = canvasAssetCategorySelect.value || '';
        renderCanvasAssetLibrary();
    });
    canvasAssetSearch?.addEventListener('input', () => {
        canvasAssetSearchQuery = canvasAssetSearch.value || '';
        renderCanvasAssetLibrary();
    });
    canvasAssetAddCategoryBtn?.addEventListener('click', async () => {
        if(canvasAssetLibraryIsLocal()){ setStatus('本地素材请在素材库管理中管理文件夹'); return; }
        const name = window.prompt('新分组名称', '新分组');
        if(!String(name || '').trim()) return;
        const data = await window.CanvasApi.createAssetCategory({library_id:activeCanvasAssetLibraryId, name:String(name).trim(), type:'image'});
        canvasAssetLibrary = data.library || canvasAssetLibrary;
        activeCanvasAssetCategoryId = data.category?.id || activeCanvasAssetCategoryId;
        renderCanvasAssetLibrary();
    });
    canvasAssetPanel?.addEventListener('wheel', event => {
        event.stopPropagation();
        const scroller = event.target.closest?.('.canvas-asset-grid') || canvasAssetGrid;
        if(!scroller || getComputedStyle(scroller).display === 'none') return;
        const canScroll = scroller.scrollHeight > scroller.clientHeight || scroller.scrollWidth > scroller.clientWidth;
        if(!canScroll) return;
        event.preventDefault();
        scroller.scrollTop += event.deltaY;
        scroller.scrollLeft += event.deltaX;
    }, {passive:false, capture:true});
    canvasAssetGrid?.addEventListener('scroll', () => {
        if(canvasAssetRenderedCount >= canvasAssetFilteredCount) return;
        if(canvasAssetGrid.scrollHeight - canvasAssetGrid.scrollTop - canvasAssetGrid.clientHeight > 180) return;
        canvasAssetRenderedCount += CANVAS_ASSET_BATCH_SIZE;
        renderCanvasAssetLibrary({preserveScroll:true});
    });
}

function hasCanvasAssetSaveDrop(dataTransfer){
    return hasCanvasNodeAssetDrag(dataTransfer) || hasOutputImageDrag(dataTransfer) || hasImageDropData(dataTransfer);
}

// Called once by canvas.js, at its original initialization position.
function bindClassicAssetManagerEvents(){
    canvasAssetDropZone?.addEventListener('dragover', event => {
        if(!hasCanvasAssetSaveDrop(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        canvasAssetDropZone.classList.add('drag-over');
    });
    canvasAssetDropZone?.addEventListener('dragleave', () => canvasAssetDropZone.classList.remove('drag-over'));
    canvasAssetDropZone?.addEventListener('drop', async event => {
        if(!hasCanvasAssetSaveDrop(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        canvasAssetDropZone.classList.remove('drag-over');
        try {
            if(hasCanvasNodeAssetDrag(event.dataTransfer)){
                const dragged = readCanvasNodeAssetDrag(event.dataTransfer);
                if(dragged?.url) await addUrlToCanvasAssetLibrary(dragged.url, dragged.name || outputImageName(dragged.url));
                return;
            }
            if(hasOutputImageDrag(event.dataTransfer)){
                await addUrlToCanvasAssetLibrary(event.dataTransfer.getData('application/x-canvas-output-image'), 'output');
                return;
            }
            const payload = await resolveImageDropPayload(event.dataTransfer);
            if(payload.type === 'files'){
                const cat = activeCanvasAssetCategory();
                const data = cat ? await uploadFilesToLibrary(payload.files, activeCanvasAssetLibraryId, cat.id) : null;
                if(data?.library) {
                    canvasAssetLibrary = data.library;
                    renderCanvasAssetLibrary();
                    setStatus('已保存到资产库');
                }
            } else if(payload.type === 'url') {
                await addUrlToCanvasAssetLibrary(payload.url, outputImageName(payload.url));
            }
        } catch(err) {
            showErrorModal(err.message || '保存资产失败', '保存资产失败');
        }
    });
    gateAssetManagerBtn?.addEventListener('click', openAssetManager);
    document.querySelectorAll('[data-manager-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            assetManagerTab = btn.dataset.managerTab || 'assets';
            renderAssetManager();
        });
    });
    assetManagerModal?.addEventListener('change', event => {
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
        if(shouldRender) renderAssetManager();
    });
    assetManagerModal?.addEventListener('click', async event => {
        const assetLib = event.target.closest?.('[data-manager-asset-lib]');
        if(assetLib){ activeCanvasAssetLibraryId = assetLib.dataset.managerAssetLib || ''; activeCanvasAssetCategoryId = ''; managerSelectedAssetIds.clear(); renderAssetManager(); return; }
        const assetCat = event.target.closest?.('[data-manager-asset-cat]');
        if(assetCat){ activeCanvasAssetCategoryId = assetCat.dataset.managerAssetCat || ''; managerSelectedAssetIds.clear(); renderAssetManager(); return; }
        const workflowLib = event.target.closest?.('[data-manager-workflow-lib]');
        if(workflowLib){ activeCanvasAssetLibraryId = workflowLib.dataset.managerWorkflowLib || ''; activeCanvasWorkflowCategoryId = ''; managerSelectedWorkflowIds.clear(); renderAssetManager(); return; }
        const workflowCat = event.target.closest?.('[data-manager-workflow-cat]');
        if(workflowCat){ activeCanvasWorkflowCategoryId = workflowCat.dataset.managerWorkflowCat || ''; managerSelectedWorkflowIds.clear(); renderAssetManager(); return; }
        const promptLib = event.target.closest?.('[data-manager-prompt-lib]');
        if(promptLib){ activePromptLibraryId = promptLib.dataset.managerPromptLib || 'system'; managerSelectedPromptIds.clear(); renderAssetManager(); return; }
        const workflowRename = event.target.closest?.('[data-manager-workflow-rename]');
        if(workflowRename){
            const itemId = workflowRename.dataset.managerWorkflowRename || '';
            const item = (activeCanvasWorkflowCategory()?.items || []).find(entry => entry.id === itemId);
            const name = window.prompt('工作流名称', item?.name || '');
            if(!item || !String(name || '').trim()) return;
            const data = await window.CanvasApi.updateAssetItem(item.id, {name});
            canvasAssetLibrary = data.library || canvasAssetLibrary;
            renderAssetManager(); renderCanvasAssetLibrary(); return;
        }
        const workflowRemove = event.target.closest?.('[data-manager-workflow-remove]');
        if(workflowRemove){
            const itemId = workflowRemove.dataset.managerWorkflowRemove || '';
            const item = (activeCanvasWorkflowCategory()?.items || []).find(entry => entry.id === itemId);
            if(!item || !window.confirm(`删除工作流「${item.name || 'workflow'}」？`)) return;
            const data = await window.CanvasApi.deleteAssetItem(item.id);
            canvasAssetLibrary = data.library || canvasAssetLibrary;
            managerSelectedWorkflowIds.delete(item.id);
            renderAssetManager(); renderCanvasAssetLibrary(); return;
        }
        const assetRename = event.target.closest?.('[data-manager-asset-rename]');
        if(assetRename){
            const itemId = assetRename.dataset.managerAssetRename || '';
            const item = (activeCanvasMediaCategory()?.items || []).find(entry => entry.id === itemId);
            const name = window.prompt('资产名称', item?.name || '');
            if(!item || !String(name || '').trim()) return;
            const data = await window.CanvasApi.updateAssetItem(item.id, {name});
            canvasAssetLibrary = data.library || canvasAssetLibrary;
            renderAssetManager(); renderCanvasAssetLibrary(); return;
        }
        const assetRemove = event.target.closest?.('[data-manager-asset-remove]');
        if(assetRemove){
            const itemId = assetRemove.dataset.managerAssetRemove || '';
            const item = (activeCanvasMediaCategory()?.items || []).find(entry => entry.id === itemId);
            if(!item || !window.confirm(`删除资产「${item.name || 'asset'}」？`)) return;
            const data = await window.CanvasApi.deleteAssetItem(item.id);
            canvasAssetLibrary = data.library || canvasAssetLibrary;
            managerSelectedAssetIds.delete(item.id);
            renderAssetManager(); renderCanvasAssetLibrary(); return;
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
            renderAssetManager(); return;
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
            managerSelectedPromptIds.delete(item.id);
            refreshCanvasPromptTemplatesFromLibraries();
            renderAssetManager(); return;
        }
        if(event.target.closest?.('[data-manager-asset-lib-new]')){
            const name = window.prompt('资产库名称', '新资产库');
            if(!String(name || '').trim()) return;
            const data = await window.CanvasApi.createAssetLibrary({name});
            canvasAssetLibrary = data.library || canvasAssetLibrary;
            activeCanvasAssetLibraryId = data.asset_library?.id || activeCanvasAssetLibraryId;
            activeCanvasAssetCategoryId = '';
            renderAssetManager(); renderCanvasAssetLibrary(); return;
        }
        if(event.target.closest?.('[data-manager-asset-lib-rename]')){
            const lib = activeCanvasAssetLibrary();
            const name = window.prompt('资产库名称', lib?.name || '');
            if(!lib || !String(name || '').trim()) return;
            const data = await window.CanvasApi.updateAssetLibrary(lib.id, {name});
            canvasAssetLibrary = data.library || canvasAssetLibrary;
            renderAssetManager(); renderCanvasAssetLibrary(); return;
        }
        if(event.target.closest?.('[data-manager-asset-lib-delete]')){
            const lib = activeCanvasAssetLibrary();
            if(!lib || !window.confirm(`删除资产库「${lib.name || '资产库'}」？`)) return;
            const data = await window.CanvasApi.deleteAssetLibrary(lib.id);
            canvasAssetLibrary = data.library || canvasAssetLibrary;
            activeCanvasAssetLibraryId = canvasAssetLibrary.active_library_id || canvasAssetLibraries()[0]?.id || '';
            activeCanvasAssetCategoryId = '';
            renderAssetManager(); renderCanvasAssetLibrary(); return;
        }
        if(event.target.closest?.('[data-manager-asset-cat-new]')){
            const name = window.prompt('分组名称', '新分组');
            if(!String(name || '').trim()) return;
            const data = await window.CanvasApi.createAssetCategory({library_id:activeCanvasAssetLibraryId, name, type:'image'});
            canvasAssetLibrary = data.library || canvasAssetLibrary;
            activeCanvasAssetCategoryId = data.category?.id || activeCanvasAssetCategoryId;
            renderAssetManager(); renderCanvasAssetLibrary(); return;
        }
        if(event.target.closest?.('[data-manager-asset-cat-rename]')){
            const cat = activeCanvasMediaCategory();
            const name = window.prompt('分组名称', cat?.name || '');
            if(!cat || !String(name || '').trim()) return;
            const data = await window.CanvasApi.updateAssetCategory(cat.id, {name});
            canvasAssetLibrary = data.library || canvasAssetLibrary;
            renderAssetManager(); renderCanvasAssetLibrary(); return;
        }
        if(event.target.closest?.('[data-manager-asset-cat-delete]')){
            const cat = activeCanvasMediaCategory();
            if(!cat || !window.confirm(`删除分组「${cat.name || '分组'}」？`)) return;
            const data = await window.CanvasApi.deleteAssetCategory(cat.id);
            canvasAssetLibrary = data.library || canvasAssetLibrary;
            activeCanvasAssetCategoryId = canvasMediaCategories()[0]?.id || '';
            renderAssetManager(); renderCanvasAssetLibrary(); return;
        }
        if(event.target.closest?.('[data-manager-asset-delete]')){
            if(!managerSelectedAssetIds.size) return;
            const data = await window.CanvasApi.deleteAssetItems({library_id:activeCanvasAssetLibraryId, ids:[...managerSelectedAssetIds]});
            canvasAssetLibrary = data.library || canvasAssetLibrary;
            managerSelectedAssetIds.clear();
            renderAssetManager(); renderCanvasAssetLibrary(); return;
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
            const data = await window.CanvasApi.deleteAssetItems({library_id:activeCanvasAssetLibraryId, ids:[...managerSelectedWorkflowIds]});
            canvasAssetLibrary = data.library || canvasAssetLibrary;
            managerSelectedWorkflowIds.clear();
            renderAssetManager(); renderCanvasAssetLibrary(); return;
        }
        if(event.target.closest?.('[data-manager-workflow-cat-new]')){
            const name = window.prompt('工作流分组名称', '工作流');
            if(!String(name || '').trim()) return;
            const data = await window.CanvasApi.createAssetCategory({library_id:activeCanvasAssetLibraryId, name, type:'workflow'});
            canvasAssetLibrary = data.library || canvasAssetLibrary;
            activeCanvasWorkflowCategoryId = data.category?.id || activeCanvasWorkflowCategoryId;
            renderAssetManager(); renderCanvasAssetLibrary(); return;
        }
        if(event.target.closest?.('[data-manager-prompt-lib-new]')){
            const name = window.prompt('提示词库名称', '新提示词库');
            if(!String(name || '').trim()) return;
            const data = await window.CanvasApi.createPromptLibrary({name});
            canvasPromptLibraries = data.library?.libraries || canvasPromptLibraries;
            activePromptLibraryId = data.prompt_library?.id || activePromptLibraryId;
            refreshCanvasPromptTemplatesFromLibraries();
            renderAssetManager(); return;
        }
        if(event.target.closest?.('[data-manager-prompt-lib-rename]')){
            const lib = activeCanvasPromptLibrary();
            if(!lib || lib.readonly) return;
            const name = window.prompt('提示词库名称', lib.name || '');
            if(!String(name || '').trim()) return;
            const data = await window.CanvasApi.updatePromptLibrary(lib.id, {name});
            canvasPromptLibraries = data.library?.libraries || canvasPromptLibraries;
            refreshCanvasPromptTemplatesFromLibraries();
            renderAssetManager(); return;
        }
        if(event.target.closest?.('[data-manager-prompt-lib-delete]')){
            const lib = activeCanvasPromptLibrary();
            if(!lib || lib.readonly || !window.confirm(`删除提示词库「${lib.name || '提示词库'}」？`)) return;
            const data = await window.CanvasApi.deletePromptLibrary(lib.id);
            canvasPromptLibraries = data.library?.libraries || canvasPromptLibraries;
            activePromptLibraryId = data.library?.active_library_id || canvasPromptLibraries.find(item => item.id !== 'system')?.id || 'system';
            refreshCanvasPromptTemplatesFromLibraries();
            renderAssetManager(); return;
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
            renderAssetManager(); return;
        }
        if(event.target.closest?.('[data-manager-prompt-delete]')){
            if(!managerSelectedPromptIds.size) return;
            const data = await window.CanvasApi.deletePromptItems({ids:[...managerSelectedPromptIds]});
            canvasPromptLibraries = data.library?.libraries || canvasPromptLibraries;
            managerSelectedPromptIds.clear();
            refreshCanvasPromptTemplatesFromLibraries();
            renderAssetManager(); return;
        }
    }, true);
}

function findCanvasAssetCategoryForItem(itemId){
    for(const lib of canvasAssetLibraries()){
        for(const cat of lib.categories || []){
            if((cat.items || []).some(item => item.id === itemId)) return cat;
        }
    }
    return null;
}
