/* Smart canvas: Asset libraries and their permission-aware actions.
 * Browser classic script (not an ES module); loaded before smart-canvas.js.
 * Function declarations only: initialization is explicitly invoked by the entry.
 * Uses the entry's existing shared bindings; do not duplicate permission or document state.
 */

function createSmartAssetPanel(){
    let width = SMART_ASSET_PANEL_DEFAULT_WIDTH;
    try {
        const stored = Number(localStorage.getItem(SMART_ASSET_PANEL_WIDTH_KEY));
        if(Number.isFinite(stored) && stored > 0) width = stored;
    } catch(e) {}
    return window.CanvasCore.createAssetPanelController({
        batchSize:ASSET_SIDEBAR_BATCH_SIZE, width,
        normalizeSelection:normalizeSmartAssetSelection,
        selectionChanged:smartAssetSelectionChanged,
        onDestroy(){ finishSmartAssetPanelResize(); smartAssetHover.destroy(); },
        ids:['assetToggle', 'assetPanel', 'assetResizeHandle', 'assetCloseBtn', 'assetLibrarySelect', 'assetCategorySelect', 'assetGrid', 'assetNameSearch', 'assetDropZone', 'workflowEmpty', 'assetImageControls', 'assetAddCategoryBtn', 'assetRenameCategoryBtn', 'assetHoverPreview']
    });
}

function normalizeSmartAssetSelection(next, action){
    const mention = String(action.source || '').startsWith('mention');
    const libs = mention ? assetLibraries() : currentAssetSourceLibraries();
    if(!libs.some(lib=>lib.id === next.libraryId)) next.libraryId = libs.find(lib=>lib.id === assetLibrary.active_library_id)?.id || libs[0]?.id || '';
    if(action.type === 'library'){
        next.categoryId = '';
        if(!mention) next.workflowCategoryId = '';
        if(next.libraryId === LOCAL_ASSET_LIBRARY_ID) next.tab = 'image';
    }
    if(action.type === 'tab' && next.tab === 'workflow' && next.libraryId === LOCAL_ASSET_LIBRARY_ID){
        const remote = assetLibraries();
        next.libraryId = remote.find(lib=>lib.id === assetLibrary.active_library_id)?.id || remote[0]?.id || '';
    }
    if(action.type === 'category'){
        if(next.tab === 'workflow') next.workflowCategoryId = action.id;
        else next.categoryId = action.id;
    }
    const categories = (libs.find(lib=>lib.id === next.libraryId)?.categories || assetLibrary.categories || []);
    for(const [type,field] of [['image','categoryId'],['workflow','workflowCategoryId']]){
        const cats = categories.filter(cat=>(cat.type || 'image') === type);
        if(!cats.some(cat=>cat.id === next[field])) next[field] = cats[0]?.id || '';
    }
    return next;
}

function smartAssetSelectionChanged(state, action){
    if(!['query','page'].includes(action.type)){
        const cats = assetCategories('image');
        if(action.type === 'library' || !cats.some(cat=>cat.id === mentionAssetCategoryId)) mentionAssetCategoryId = state.categoryId;
    }
    if(action.render === false) return;
    renderAssetLibrary({preserveScroll:!!action.preserveScroll});
    if(action.source === 'mention' || (action.type === 'reconcile' && mentionPicker?.classList?.contains('open') && mentionSource === 'asset')) updateMentionPicker('asset');
}

function prepareSmartMentionSelection(source, hasInput){
    const libs = assetLibraries();
    const withAssets = libs.find(lib=>(lib.categories || []).some(cat=>(cat.type || 'image') === 'image' && (cat.items || []).some(item=>item?.url)));
    smartAssetPanel.reconcile({source:'mention-prepare', render:false});
    mentionSource = source || (hasInput ? 'input' : 'asset');
    if(mentionSource === 'asset' && withAssets && !assetCategories('image').some(cat=>(cat.items || []).some(item=>item?.url))){
        smartAssetPanel.selectLibrary(withAssets.id,{source:'mention-prepare',render:false});
    }
    if(mentionSource === 'input' && !hasInput && withAssets) mentionSource = 'asset';
    if(mentionSource === 'asset' && !withAssets && hasInput) mentionSource = 'input';
    mentionAssetCategoryId = assetCategoryForMention()?.id || '';
    return !!withAssets;
}

function selectSmartMentionCategory(id){
    const cats = assetCategories('image');
    mentionAssetCategoryId = cats.some(cat=>cat.id === id) ? id : cats[0]?.id || '';
    updateMentionPicker('asset');
}

function bindSmartAssetPanelLifecycle(){
    const events = smartAssetPanel.events('lifecycle');
    events.on(window, 'pagehide', event => {
        finishSmartAssetPanelResize();
        smartAssetPanel.suspendReads();
        smartAssetPanel.cancelRefresh();
        if(event.persisted) hideAssetHoverPreview();
        else smartAssetPanel.destroy();
    });
    events.on(window, 'pageshow', event => {
        if(!event.persisted) return;
        smartAssetPanel.resumeReads();
        if(smartAssetPanel.state.open || (mentionPicker?.classList?.contains('open') && mentionSource === 'asset')) loadAssetLibrary();
    });
}

function assetCategories(type='image'){
    const library = activeAssetLibrary();
    return (library?.categories || assetLibrary.categories || []).filter(cat => (cat.type || 'image') === type);
}

function workflowAssetCategories(){
    return assetCategories('workflow');
}

function assetLibraries(){
    return Array.isArray(assetLibrary.libraries) && assetLibrary.libraries.length ? assetLibrary.libraries : [{id:'default', name:'默认资产库', categories:assetLibrary.categories || []}];
}

function localAssetFolderCategories(){
    const result = [];
    const walk = node => {
        if(!node) return;
        const isRoot = (node.id || node.path || '__root__') === '__root__';
        result.push({
            id: node.id || (node.path ? node.path : '__root__'),
            name: node.name || (node.path ? node.path.split('/').pop() : '全部上传'),
            type: 'image',
            items: (isRoot ? (localAssetLibrary.items || []) : (node.items || [])).filter(item => assetMediaKind(item) === 'image'),
            readonly: true,
            source: 'local',
        });
        (node.children || []).forEach(walk);
    };
    walk(localAssetLibrary.tree || {id:'__root__', name:'全部上传', items:localAssetLibrary.items || [], children:[]});
    return result.filter(cat => cat.id === '__root__' || cat.items.length || (localAssetLibrary.tree?.children || []).length);
}

function assetLibraryIsLocal(){
    return smartAssetPanel.state.libraryId === LOCAL_ASSET_LIBRARY_ID;
}

function currentAssetSourceLibraries(){
    return [
        ...assetLibraries(),
        {id:LOCAL_ASSET_LIBRARY_ID, name:'本地素材', categories:localAssetFolderCategories(), readonly:true, source:'local'}
    ];
}

function activeAssetLibrary(){
    if(assetLibraryIsLocal()) return currentAssetSourceLibraries().find(lib => lib.id === LOCAL_ASSET_LIBRARY_ID);
    const libs = assetLibraries();
    return libs.find(lib => lib.id === smartAssetPanel.state.libraryId) || libs[0] || null;
}

function activeAssetCategory(){
    const cats = assetCategories('image');
    if(!cats.length) return null;
    return cats.find(cat => cat.id === smartAssetPanel.state.categoryId) || cats[0];
}

function activeWorkflowAssetCategory(){
    const cats = workflowAssetCategories();
    if(!cats.length) return null;
    return cats.find(cat => cat.id === smartAssetPanel.state.workflowCategoryId) || cats[0];
}

function currentAssetTabIsWorkflow(){
    return smartAssetPanel.state.tab === 'workflow';
}

function currentAssetTabCategories(){
    return currentAssetTabIsWorkflow() ? workflowAssetCategories() : assetCategories('image');
}

function activeAssetTabCategory(){
    return currentAssetTabIsWorkflow() ? activeWorkflowAssetCategory() : activeAssetCategory();
}

async function loadAssetLibrary(){
    if(smartAssetPanel.destroyed) return;
    const readToken = smartAssetPanel.beginRead();
    try {
        const [data, localData] = await window.CanvasApi.getAssetLibraries();
        if(!smartAssetPanel.acceptsRead(readToken)) return;
        localAssetLibrary = {items:Array.isArray(localData.items) ? localData.items : [], tree:localData.tree || null};
        setAssetLibraryFromResponse(data, {readToken});
    } catch(e) {
        if(smartAssetPanel.acceptsRead(readToken)) toast('资产库加载失败');
    }
}

function refreshAssetLibrarySoon(delay=120){
    smartAssetPanel.scheduleRefresh(async () => {
        await loadAssetLibrary();
    }, delay);
}

function handleAssetLibraryUpdatedMessage(data={}){
    const remoteUpdatedAt = Number(data.updated_at || 0);
    if(remoteUpdatedAt && remoteUpdatedAt <= Number(assetLibraryUpdatedAt || 0)) return;
    refreshAssetLibrarySoon();
}

function setAssetLibraryFromResponse(data, options={}){
    if(smartAssetPanel.destroyed) return false;
    const readToken = options.readToken ?? smartAssetPanel.responseReadToken(data);
    if(readToken !== undefined){
        if(!smartAssetPanel.acceptsRead(readToken)) return false;
    } else smartAssetPanel.invalidateReads();
    const signature = node => JSON.stringify((node.images || []).map(img => smartFaceAuthState(img)));
    const before = new Map(nodes.map(node => [node.id,signature(node)]));
    assetLibrary = data.library || assetLibrary;
    const changed = nodes.filter(node => before.get(node.id) !== signature(node)).map(node => node.id);
    if(changed.length) refreshSmartNodes(changed);
    assetLibraryUpdatedAt = Number(assetLibrary.updated_at || assetLibraryUpdatedAt || 0);
    smartAssetPanel.reconcile({render:options.render !== false});
    return true;
}

function toggleAssetLibrary(open=!smartAssetPanel.state.open){
    if(open && !smartAssetPanel.destroyed)bindSmartAssetPanelEvents();
    if(!smartAssetPanel.elements.assetPanel || !smartAssetPanel.elements.assetToggle) return;
    if(!open){ finishSmartAssetPanelResize(); hideAssetHoverPreview(); }
    applySmartAssetPanelWidth(smartAssetPanel.state.width, {updatePreferred:false});
    smartAssetPanel.setOpen(!!open);
    if(smartAssetPanel.state.open) loadAssetLibrary();
    render();
}

function assetCategoryForMention(){
    const cats = assetCategories('image');
    if(!cats.length) return null;
    return cats.find(cat => cat.id === mentionAssetCategoryId)
        || cats.find(cat => cat.id === smartAssetPanel.state.categoryId)
        || cats.find(cat => (cat.items || []).length)
        || cats[0];
}

function assetMediaKind(item){
    if(!item) return 'image';
    const explicit = String(item.kind || item.mediaKind || item.type || '').toLowerCase();
    if(['image','video','audio','text','file','workflow'].includes(explicit)) return explicit;
    const mime = String(item.mime_type || item.mime || item.content_type || explicit).toLowerCase();
    if(mime.startsWith('audio/')) return 'audio';
    if(mime.startsWith('video/')) return 'video';
    if(mime.startsWith('text/')) return 'text';
    const url = String(item.url || item.thumbnail || '').toLowerCase().split(/[?#]/)[0];
    const name = String(item.name || '').toLowerCase();
    if(/\.(mp4|webm|mov|m4v|avi|mkv)$/.test(url) || /\.(mp4|webm|mov|m4v|avi|mkv)$/.test(name)) return 'video';
    if(/\.(mp3|wav|m4a|aac|ogg|flac)$/.test(url) || /\.(mp3|wav|m4a|aac|ogg|flac)$/.test(name)) return 'audio';
    if(/\.(json|zip)$/.test(url) || /\.(json|zip)$/.test(name)) return 'workflow';
    if(/\.(txt|md|csv|srt|vtt)$/.test(url) || /\.(txt|md|csv|srt|vtt)$/.test(name)) return 'text';
    if(/\.(pdf|docx?|xlsx?|bin)$/.test(url) || /\.(pdf|docx?|xlsx?|bin)$/.test(name)) return 'file';
    return 'image';
}

function smartAssetFilePreviewHtml(kind, unavailable=false){
    const label = unavailable ? '暂无法预览' : ({audio:'音频素材',video:'视频素材',text:'文本素材',workflow:'工作流',file:'文件素材'}[kind] || '图片素材');
    const icon = unavailable ? 'image-off' : ({audio:'file-audio',video:'film',text:'file-text',workflow:'workflow',file:'file'}[kind] || 'image');
    return `<div class="asset-file-preview"><span class="asset-file-symbol"><i data-lucide="${icon}"></i></span><span>${label}</span></div>`;
}

function assetThumbHtml(item){
    const url = escapeAttr(item.url || '');
    const thumb = item.thumbnail || item.thumb || item.preview || item.url || '';
    const kind = assetMediaKind(item);
    const assetUris = assetRegisteredUris(item);
    const faceBadge = smartFaceVerifiedBadgeHtml(assetUris, false, {...item, asset_item_id:item.id, asset_uris:assetUris});
    if(kind === 'video'){
        const thumbnail = item.thumbnail || item.thumb || item.preview;
        const preview = smartMediaPreviewUrl(item,512);
        const media = thumbnail ? smartPreviewImgHtml(thumbnail,512,'class="asset-thumb" alt=""')
            : preview !== displayMediaUrl(item) ? smartVideoPreviewHtml(item,512,'class="asset-thumb" alt=""')
            : smartAssetFilePreviewHtml('video');
        return `<div class="asset-thumb-wrap">${media}<span class="asset-video-badge"><i data-lucide="film"></i>VIDEO</span>${faceBadge}</div>`;
    }
    if(['audio','text','file','workflow'].includes(kind)){
        return `<div class="asset-thumb-wrap asset-thumb">${smartAssetFilePreviewHtml(kind)}${kind === 'audio' ? faceBadge : ''}</div>`;
    }
    return `<div class="asset-thumb-wrap">${smartPreviewImgHtml({...item, url:thumb}, 512, 'class="asset-thumb" alt=""')}${faceBadge}</div>`;
}

function renderAssetLibrary({preserveScroll=false}={}){
    if(smartAssetPanel.destroyed) return;
    const events = smartAssetPanel.events('cards');
    hideAssetHoverPreview();
    if(!smartAssetPanel.elements.assetPanel || !smartAssetPanel.elements.assetGrid || !smartAssetPanel.elements.assetCategorySelect) return;
    const scrollTop = preserveScroll ? smartAssetPanel.elements.assetGrid.scrollTop : 0;
    document.querySelectorAll('[data-asset-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.assetTab === smartAssetPanel.state.tab));
    const libs = currentAssetSourceLibraries();
    if(smartAssetPanel.elements.assetLibrarySelect){
        smartAssetPanel.elements.assetLibrarySelect.innerHTML = libs.map(lib => `<option value="${escapeHtml(lib.id)}" ${lib.id === smartAssetPanel.state.libraryId ? 'selected' : ''}>${escapeHtml(lib.name || '资产库')}</option>`).join('');
    }
    const imageMode = smartAssetPanel.state.tab === 'image';
    const workflowMode = smartAssetPanel.state.tab === 'workflow';
    smartAssetPanel.elements.assetImageControls.style.display = (imageMode || workflowMode) ? 'block' : 'none';
    const localMode = assetLibraryIsLocal();
    smartAssetPanel.elements.assetDropZone.style.display = (imageMode && !localMode) ? 'flex' : 'none';
    smartAssetPanel.elements.assetGrid.style.display = (imageMode || workflowMode) ? 'grid' : 'none';
    smartAssetPanel.elements.workflowEmpty.style.display = 'none';
    if(!imageMode && !workflowMode){ refreshIcons(); return; }
    const cats = workflowMode ? workflowAssetCategories() : assetCategories('image');
    smartAssetPanel.elements.assetCategorySelect.innerHTML = cats.map(cat => `<option value="${escapeHtml(cat.id)}" ${cat.id === (workflowMode ? smartAssetPanel.state.workflowCategoryId : smartAssetPanel.state.categoryId) ? 'selected' : ''}>${escapeHtml(cat.name || (workflowMode ? '工作流' : '新文件夹'))}</option>`).join('');
    const cat = workflowMode ? activeWorkflowAssetCategory() : activeAssetCategory();
    const query = smartAssetPanel.state.query.trim().toLowerCase();
    const allItems = cat?.items || [];
    const items = query ? allItems.filter(item => String(item?.name || '').toLowerCase().includes(query)) : allItems;
    const renderKey = `${smartAssetPanel.state.libraryId}\u0000${smartAssetPanel.state.tab}\u0000${cat?.id || ''}\u0000${query}`;
    const visibleItems = smartAssetPanel.page(items, renderKey);
    if(smartAssetPanel.elements.assetAddCategoryBtn) smartAssetPanel.elements.assetAddCategoryBtn.disabled = localMode;
    if(smartAssetPanel.elements.assetRenameCategoryBtn) smartAssetPanel.elements.assetRenameCategoryBtn.disabled = !cat || localMode;
    smartAssetPanel.elements.assetGrid.innerHTML = visibleItems.length ? visibleItems.map(item => `
        <div class="asset-item ${workflowMode ? 'workflow-asset-item' : ''}" draggable="${workflowMode ? 'false' : 'true'}" data-asset-id="${escapeHtml(item.id)}" data-url="${escapeHtml(item.url)}" data-name="${escapeHtml(item.name || 'asset')}" data-kind="${escapeHtml(assetMediaKind(item))}" data-asset-uris="${escapeHtml(JSON.stringify(assetRegisteredUris(item)))}">
            ${assetThumbHtml(item)}
            <div class="asset-meta">
                <span class="asset-name" title="${escapeHtml(item.name || '')}">${escapeHtml(item.name || 'asset')}</span>
                ${workflowMode
                    ? `<button class="asset-mini-btn" type="button" data-rename-workflow-asset="${escapeHtml(item.id)}" title="${escapeHtml('重命名')}"><i data-lucide="pencil"></i></button>
                       <button class="asset-mini-btn" type="button" data-delete-workflow-asset="${escapeHtml(item.id)}" title="${escapeHtml('删除')}"><i data-lucide="trash-2"></i></button>`
                    : localMode ? `<span class="asset-local-tag">本地</span>` : `<button class="asset-mini-btn" type="button" data-rename-asset="${escapeHtml(item.id)}" title="${escapeHtml('重命名')}"><i data-lucide="pencil"></i></button>
                       <button class="asset-mini-btn" type="button" data-delete-asset="${escapeHtml(item.id)}" title="${escapeHtml('删除')}"><i data-lucide="trash-2"></i></button>`}
            </div>
        </div>
    `).join('') + (visibleItems.length < items.length ? '<div class="asset-load-more">继续向下滚动加载更多</div>' : '') : `<div class="asset-empty">${escapeHtml(query && allItems.length ? '没有找到匹配名称的素材' : (localMode ? '暂无本地素材，请在素材库管理中上传' : (workflowMode ? '暂无工作流资产' : '这个文件夹还没有图片。把画布里的图片拖进来保存。')))}</div>`;
    if(workflowMode) bindWorkflowAssetItemEvents(events);
    else bindAssetItemEvents(events);
    bindSmartPreviewImageFallbacks(smartAssetPanel.elements.assetGrid);
    smartAssetPanel.elements.assetGrid.scrollTop = preserveScroll ? scrollTop : 0;
    refreshIcons();
}

function openAssetNameDialog({title='', value='', placeholder='', cancelValue='', multiline=false }={}){
    if(!assetDialogBackdrop || !assetDialogInput || !assetDialogOk || !assetDialogCancel) return Promise.resolve(cancelValue);
    return new Promise(resolve => {
        if(assetDialogTarget) assetDialogTarget.hidden = true;
        assetDialogInput.hidden = false;
        assetDialogTitle.textContent = title || '重命名';
        assetDialogInput.value = value || '';
        assetDialogInput.placeholder = placeholder || '';
        assetDialogInput.classList.toggle('is-multiline', Boolean(multiline));
        assetDialogInput.rows = multiline ? 5 : 1;
        assetDialogBackdrop.hidden = false;
        assetDialogBackdrop.classList.add('open');
        assetDialogInput.focus();
        assetDialogInput.select();
        const cleanup = result => {
            assetDialogBackdrop.classList.remove('open');
            assetDialogBackdrop.hidden = true;
            assetDialogOk.onclick = null;
            assetDialogCancel.onclick = null;
            assetDialogInput.onkeydown = null;
            assetDialogBackdrop.onmousedown = null;
            assetDialogInput.classList.remove('is-multiline');
            assetDialogInput.rows = 1;
            resolve(result);
        };
        assetDialogOk.onclick = () => cleanup(assetDialogInput.value.trim());
        assetDialogCancel.onclick = () => cleanup(cancelValue);
        assetDialogInput.onkeydown = event => {
            if(event.key === 'Enter' && !multiline) cleanup(assetDialogInput.value.trim());
            if(event.key === 'Enter' && multiline && (event.ctrlKey || event.metaKey)) cleanup(assetDialogInput.value.trim());
            if(event.key === 'Escape') cleanup(cancelValue);
        };
        assetDialogBackdrop.onmousedown = event => {
            if(event.target === assetDialogBackdrop) cleanup(cancelValue);
        };
    });
}

function positionAssetHoverPreview(event){ smartAssetHover.move(event); }

function showAssetHoverPreview(event, item){ smartAssetHover.enter(event, item); }

function hideAssetHoverPreview(){ smartAssetHover.hide(); }

function positionAssetHoverPreviewNow(event){
    if(!smartAssetPanel.elements.assetHoverPreview || smartAssetPanel.elements.assetHoverPreview.hidden || smartAssetPanel.elements.assetHoverPreview.style.display === 'none') return;
    const pad = 14;
    const w = smartAssetPanel.elements.assetHoverPreview.offsetWidth || 260;
    const h = smartAssetPanel.elements.assetHoverPreview.offsetHeight || 300;
    let left = smartAssetPanel.elements.assetPanel.getBoundingClientRect().left - w - 12;
    if(left < pad) left = event.clientX + 16;
    left = Math.max(pad, Math.min(window.innerWidth - w - pad, left));
    const top = Math.max(pad, Math.min(window.innerHeight - h - pad, event.clientY + 12));
    smartAssetPanel.elements.assetHoverPreview.style.left = `${left}px`;
    smartAssetPanel.elements.assetHoverPreview.style.top = `${top}px`;
}

function showAssetHoverPreviewNow(event, item){
    if(!smartAssetPanel.elements.assetHoverPreview || !item?.url) return;
    const preview = smartAssetPanel.elements.assetHoverPreview;
    const kind = assetMediaKind(item);
    const url = item.previewUrl || smartMediaPreviewUrl(item, 512);
    // Audio/files and unavailable thumbnails never enter the image decoder.
    const visual = !item.unavailable && (kind === 'image' || (kind === 'video' && url !== displayMediaUrl(item)));
    preview.innerHTML = `<div class="asset-hover-stage">${visual ? '<img alt="" decoding="async">' : smartAssetFilePreviewHtml(kind,item.unavailable)}</div><div class="asset-hover-name"></div>`;
    preview.querySelector('.asset-hover-name').textContent = item.name || '未命名素材';
    const media = preview.querySelector('img');
    if(media){
        media.onerror = () => {
            if(!preview.contains(media)) return;
            preview.querySelector('.asset-hover-stage').innerHTML = smartAssetFilePreviewHtml(kind,true);
            refreshIcons();
            positionAssetHoverPreviewNow(event);
        };
        media.src = url;
    }
    refreshIcons();
    smartAssetPanel.elements.assetHoverPreview.hidden = false;
    smartAssetPanel.elements.assetHoverPreview.style.display = 'block';
    positionAssetHoverPreviewNow(event);
}

function hideAssetHoverPreviewNow(){
    if(!smartAssetPanel.elements.assetHoverPreview) return;
    smartAssetPanel.elements.assetHoverPreview.style.display = 'none';
    smartAssetPanel.elements.assetHoverPreview.hidden = true;
    const media = smartAssetPanel.elements.assetHoverPreview.querySelector('img,video');
    if(media) media.onerror = null;
    media?.pause?.();
    media?.removeAttribute('src');
    media?.load?.();
}

function beginAssetInlineRename(assetId){
    const item = (activeAssetCategory()?.items || []).find(x => x.id === assetId)
        || (activeWorkflowAssetCategory()?.items || []).find(x => x.id === assetId);
    const card = [...smartAssetPanel.elements.assetGrid.querySelectorAll('.asset-item')].find(el => el.dataset.assetId === assetId);
    const nameEl = card?.querySelector('.asset-name');
    if(!item || !card || !nameEl || card.querySelector('.asset-rename-input')) return;
    hideAssetHoverPreview();
    const events = smartAssetPanel.events('cards:rename:' + assetId);
    const previousName = item.name || 'asset';
    const previousDraggable = card.draggable;
    const input = document.createElement('input');
    input.className = 'asset-rename-input';
    input.type = 'text';
    input.value = previousName;
    input.setAttribute('aria-label', '重命名');
    card.draggable = false;
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const restore = () => {
        if(input.isConnected) input.replaceWith(nameEl);
        card.draggable = previousDraggable;
    };
    const finish = async save => {
        if(done) return;
        done = true;
        smartAssetPanel.clearEvents('cards:rename:' + assetId);
        const name = input.value.trim();
        if(!save || !name || name === previousName){
            restore();
            return;
        }
        input.disabled = true;
        try {
            const data = await smartAssetPanel.mutate(() => window.CanvasApi.updateAssetItem(assetId, {name}));
            setAssetLibraryFromResponse(data);
        } catch(err){
            restore();
            toast(err.message || '保存资产失败');
        }
    };
    events.on(input, 'keydown', event => {
        event.stopPropagation();
        if(event.key === 'Enter'){
            event.preventDefault();
            finish(true);
        } else if(event.key === 'Escape'){
            event.preventDefault();
            finish(false);
        }
    });
    events.on(input, 'pointerdown', event => event.stopPropagation());
    events.on(input, 'mousedown', event => event.stopPropagation());
    events.on(input, 'click', event => event.stopPropagation());
    events.on(input, 'blur', () => finish(true));
}

function bindAssetItemEvents(events=smartAssetPanel.events('cards')){
    smartAssetPanel.elements.assetGrid.querySelectorAll('.asset-item').forEach(el => {
        const thumb = el.querySelector('.asset-thumb-wrap') || el.querySelector('.asset-thumb');
        events.on(thumb, 'mouseenter', e => {
            const image = thumb?.tagName === 'IMG' ? thumb : thumb?.querySelector('img');
            showAssetHoverPreview(e, {url:el.dataset.url, name:el.dataset.name, kind:el.dataset.kind,
                previewUrl:image?.dataset.canvasMediaSrc || image?.currentSrc,
                unavailable:el.dataset.kind === 'image' && (!image || (image.complete && !image.naturalWidth && image.hasAttribute('src')))});
        });
        events.on(thumb, 'mousemove', e => positionAssetHoverPreview(e));
        events.on(thumb, 'mouseleave', hideAssetHoverPreview);
        events.on(el, 'dragstart', e => {
            hideAssetHoverPreview();
            e.dataTransfer.effectAllowed = 'copy';
            let assetUris = {};
            try { assetUris = JSON.parse(el.dataset.assetUris || '{}') || {}; } catch(e) {}
            e.dataTransfer.setData('application/x-smart-asset', JSON.stringify({url:el.dataset.url, name:el.dataset.name, kind:el.dataset.kind, asset_uris:assetUris}));
            e.dataTransfer.setData('text/plain', el.dataset.url || '');
        });
    });
    smartAssetPanel.elements.assetGrid.querySelectorAll('[data-rename-asset]').forEach(btn => {
        events.on(btn, 'click', async e => {
            e.preventDefault(); e.stopPropagation();
            beginAssetInlineRename(btn.dataset.renameAsset);
        });
    });
    smartAssetPanel.elements.assetGrid.querySelectorAll('[data-delete-asset]').forEach(btn => {
        events.on(btn, 'click', async e => {
            e.preventDefault(); e.stopPropagation();
            btn.disabled = true;
            try {
                const data = await smartAssetPanel.mutate(() => window.CanvasApi.deleteAssetItem(btn.dataset.deleteAsset));
                setAssetLibraryFromResponse(data);
            } catch(err){
                btn.disabled = false;
                toast(err.message || '保存资产失败');
            }
        });
    });
}

function bindWorkflowAssetItemEvents(events=smartAssetPanel.events('cards')){
    smartAssetPanel.elements.assetGrid.querySelectorAll('[data-rename-workflow-asset]').forEach(btn => {
        events.on(btn, 'click', async e => {
            e.preventDefault();
            e.stopPropagation();
            beginAssetInlineRename(btn.dataset.renameWorkflowAsset);
        });
    });
    smartAssetPanel.elements.assetGrid.querySelectorAll('[data-delete-workflow-asset]').forEach(btn => {
        events.on(btn, 'click', async e => {
            e.preventDefault();
            e.stopPropagation();
            const item = (activeWorkflowAssetCategory()?.items || []).find(x => x.id === btn.dataset.deleteWorkflowAsset);
            if(!item) return;
            btn.disabled = true;
            try {
                const data = await smartAssetPanel.mutate(() => window.CanvasApi.deleteAssetItem(item.id));
                setAssetLibraryFromResponse(data);
            } catch(err){
                btn.disabled = false;
                toast(err.message || '保存资产失败');
            }
        });
    });
}

async function addUrlToAssetLibrary(url, name='', target=smartAssetPanel.captureSelection()){
    if(target.libraryId === LOCAL_ASSET_LIBRARY_ID){ toast('本地素材请在素材库管理中上传'); return; }
    const cat = (assetLibraries().find(lib=>lib.id === target.libraryId)?.categories || []).find(cat=>cat.id === target.categoryId);
    if(!cat){ toast('请先新建一个图片文件夹'); return; }
    const data = await smartAssetPanel.mutate(() => window.CanvasApi.createAssetItem({library_id:target.libraryId, category_id:cat.id, url, name}, {errorFallback:'保存资产失败'}));
    setAssetLibraryFromResponse(data);
    toast('已保存到资产库');
}

async function chooseSmartAssetTarget(){
    await loadAssetLibrary();
    const targets = assetLibraries().flatMap(library => library.readonly ? [] : (library.categories || [])
        .filter(category => ['image','media'].includes(String(category.type || 'image').toLowerCase()) && !category.readonly)
        .map(category => ({libraryId:library.id, categoryId:category.id, label:`${library.name || '素材库'} / ${category.name || '分组'}`})));
    if(!targets.length){ toast('请先创建可编辑的素材库和图片分组'); return null; }
    return new Promise(resolve => {
        assetDialogTitle.textContent = '选择素材库 / 分组';
        assetDialogInput.hidden = true;
        assetDialogTarget.hidden = false;
        assetDialogTarget.innerHTML = targets.map((target, index) => `<option value="${index}" ${target.libraryId === smartAssetPanel.state.libraryId && target.categoryId === smartAssetPanel.state.categoryId ? 'selected' : ''}>${escapeHtml(target.label)}</option>`).join('');
        assetDialogBackdrop.hidden = false;
        assetDialogBackdrop.classList.add('open');
        assetDialogTarget.focus();
        const cleanup = result => {
            assetDialogBackdrop.classList.remove('open');
            assetDialogBackdrop.hidden = true;
            assetDialogTarget.hidden = true;
            assetDialogInput.hidden = false;
            assetDialogOk.onclick = assetDialogCancel.onclick = assetDialogBackdrop.onmousedown = null;
            resolve(result);
        };
        assetDialogOk.onclick = () => cleanup(targets[Number(assetDialogTarget.value || 0)] || targets[0]);
        assetDialogCancel.onclick = () => cleanup(null);
        assetDialogBackdrop.onmousedown = event => { if(event.target === assetDialogBackdrop) cleanup(null); };
    });
}

function smartAssetItemLocation(itemId){
    for(const library of assetLibraries()) for(const category of library.categories || []) {
        const item = (category.items || []).find(entry => entry.id === itemId);
        if(item) return {item, libraryId:library.id, categoryId:category.id};
    }
    return null;
}

function smartAuthenticatedUris(item){
    return window.CanvasAssetAuth.resolve({},item).uris;
}

function smartVolcengineAssetUrisForRef(ref, provider=null){
    return smartFaceAuthState(ref,provider).uris;
}

function smartFaceAuthState(ref, provider=null){
    provider ||= (apiProviders || []).find(p => p.id === 'volcengine');
    return window.CanvasAssetAuth.resolve(ref,window.CanvasAssetAuth.findItem(assetLibraries(),ref),provider);
}

function smartCurrentFaceAuthRef(ref){
    if(!ref?.nodeId) return ref;
    const owner = nodes.find(node => node.id === ref.nodeId);
    const urls = [ref.url, ref.originalLocalUrl, ref.sourceUrl].filter(Boolean);
    const matches = image => image && [image.url, image.originalLocalUrl, localDisplayUrlForMediaItem(image)]
        .some(url => url && urls.includes(url));
    const image = (matches(owner?.images?.[ref.imageIndex]) && owner.images[ref.imageIndex])
        || owner?.images?.find(matches);
    if(!image) throw new Error('引用的素材已被替换或删除，请重新选择后生成。');
    // Mentions can predate authentication. Use the matching live image, never a stale index.
    return {...ref, asset_uris:image.asset_uris || {}, asset_item_id:image.asset_item_id || '',
        asset_library_id:image.asset_library_id || '', face_auth_status:image.face_auth_status || ''};
}

async function ensureSmartImageAsset(node, index, target){
    const image = node?.images?.[index];
    const sourceUrl = image?.url;
    const linked = image?.asset_item_id && smartAssetItemLocation(image.asset_item_id);
    if(linked && linked.libraryId === target.libraryId && linked.categoryId === target.categoryId) return linked;
    const data = await smartAssetPanel.mutate(() => window.CanvasApi.createAssetItem({library_id:target.libraryId, category_id:target.categoryId, url:image.url, name:image.name || smartImageNameFromUrl(image.url)}, {errorFallback:'上传素材库失败'}));
    setAssetLibraryFromResponse(data);
    if(!nodes.includes(node) || node.images[index] !== image || image.url !== sourceUrl) throw new Error('图片已更改，请重新认证。');
    image.asset_item_id = data.item?.id || '';
    image.asset_library_id = target.libraryId;
    image.asset_uris = smartAuthenticatedUris(data.item);
    image.face_auth_status = '';
    scheduleSave();
    return {item:data.item, libraryId:target.libraryId, categoryId:target.categoryId};
}

async function saveSmartImageToAssetLibrary(nodeId, index){
    const node = nodes.find(entry => entry.id === nodeId);
    const image = node?.images?.[index];
    if(!image?.url) return;
    const target = await chooseSmartAssetTarget();
    if(!target) return;
    try {
        const linked = image.asset_item_id && smartAssetItemLocation(image.asset_item_id);
        await ensureSmartImageAsset(node, index, target);
        toast(linked?.libraryId === target.libraryId && linked?.categoryId === target.categoryId ? '该素材已在素材库中' : '已上传到素材库');
    } catch(e) { toast(e.message || '上传素材库失败'); }
}

function smartAvatarPlatform(provider){
    return window.CanvasAssetAuth.registrationPlatform(provider);
}

function quickSmartAvatarProvider(){
    return window.CanvasAssetAuth.registrationProvider(apiProviders);
}

async function smartAvatarRequest(path, libraryId, providerId){
    const request = async () => {
        const response = await fetch(path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({library_id:libraryId, provider_id:providerId})});
        if(!response.ok) throw new Error(await responseErrorMessage(response, '素材认证失败'));
        return response.json();
    };
    // Guard only the library snapshot; the caller still processes the item receipt.
    return path.endsWith('/avatar-status') ? smartAssetPanel.readResponse(request) : smartAssetPanel.mutate(request);
}

function pollSmartImageFaceAuth(nodeId, index, itemId, libraryId, provider, attempt=0){
    if(attempt >= 100) return;
    const source = nodes.find(node => node.id === nodeId)?.images?.[index];
    const sourceUrl = source?.url;
    const isCurrent = () => source && nodes.find(node => node.id === nodeId)?.images?.[index] === source
        && source.url === sourceUrl && source.asset_item_id === itemId && source.asset_library_id === libraryId;
    setTimeout(async () => {
        const image = nodes.find(node => node.id === nodeId)?.images?.[index];
        if(!isCurrent()) return;
        try {
            const data = await smartAvatarRequest(`/api/asset-library/items/${encodeURIComponent(itemId)}/avatar-status`, libraryId, provider.id);
            setAssetLibraryFromResponse(data);
            if(!isCurrent()) return;
            const registration = data.item?.registrations?.[smartAvatarPlatform(provider)] || {};
            if(registration.status === 'Active'){
                image.face_auth_status = 'Active';
                image.asset_uris = smartAuthenticatedUris(data.item);
                render(); scheduleSave(); toast('素材认证已通过');
            } else if(registration.status === 'Failed'){
                image.face_auth_status = 'Failed';
                image.asset_uris = {};
                render(); scheduleSave(); toast(registration.detail || '素材认证未通过');
            } else pollSmartImageFaceAuth(nodeId, index, itemId, libraryId, provider, attempt + 1);
        } catch(e) {
            if(!isCurrent()) return;
            if(attempt < 2) pollSmartImageFaceAuth(nodeId, index, itemId, libraryId, provider, attempt + 1);
            else toast(e.message || '认证状态查询失败');
        }
    }, 6000);
}

async function quickFaceAuthSmartImage(nodeId, index){
    const node = nodes.find(entry => entry.id === nodeId);
    const image = node?.images?.[index];
    if(!image?.url) return;
    const sourceUrl = image.url;
    const isCurrent = () => nodes.includes(node) && node.images[index] === image && image.url === sourceUrl;
    const provider = quickSmartAvatarProvider();
    if(!provider) return toast('请先在 API 平台管理中配置火山引擎');
    if(!window.CanvasAssetAuth.registrationReady(provider)) return toast('火山引擎素材认证需要 AK/SK，请在管理平台补齐 Access Key ID 和 Secret Access Key。');
    const target = await chooseSmartAssetTarget();
    if(!target || !isCurrent()) return;
    try {
        toast('正在上传素材并提交素材认证…');
        const {item, libraryId} = await ensureSmartImageAsset(node, index, target);
        if(!isCurrent()) return;
        const registration = item?.registrations?.[smartAvatarPlatform(provider)] || {};
        const auth = window.CanvasAssetAuth.resolve({},item,provider);
        if(auth.status === 'ScopeMismatch') return toast(window.CanvasAssetAuth.error(auth.status));
        if(registration.status === 'Active'){
            image.face_auth_status = 'Active'; image.asset_uris = smartAuthenticatedUris(item); render(); scheduleSave(); return toast('该素材已通过素材认证');
        }
        image.face_auth_status = 'Processing'; image.asset_uris = {}; render(); scheduleSave();
        if(registration.status !== 'Processing') await smartAvatarRequest(`/api/asset-library/items/${encodeURIComponent(item.id)}/register-avatar`, libraryId, provider.id);
        if(!isCurrent()) return;
        toast('已提交审核，稍后自动更新');
        pollSmartImageFaceAuth(nodeId, index, item.id, libraryId, provider);
    } catch(e) {
        if(!isCurrent()) return;
        image.face_auth_status = 'Failed'; image.asset_uris = {}; render(); scheduleSave(); toast(e.message || '素材认证提交失败');
    }
}

function canvasImageDragPayload(node, index=0){
    const img = node?.images?.[index];
    if(!img?.url) return null;
    return {url:img.url, name:img.name || node.title || 'image'};
}

// SmartCanvas 只消费已通过审核的火山 asset:// 地址。
function assetRegisteredUris(item){
    return smartAuthenticatedUris(item);
}

function smartVolcengineFaceVerified(assetUris, image=null){
    return smartFaceAuthState(image || {asset_uris:assetUris}).ready;
}

function smartFaceVerifiedBadgeHtml(assetUris, onNode=false, image=null){
    return smartVolcengineFaceVerified(assetUris,image) ? `<span class="smart-face-verified-badge ${onNode ? 'node-face-badge' : ''}" title="素材已就绪" aria-label="素材已就绪"><i data-lucide="shield-check"></i></span>` : '';
}

function assetMentionCandidateImages(categoryId=''){
    const cats = assetCategories('image');
    const cat = cats.find(c => c.id === categoryId) || assetCategoryForMention();
    if(!cat) return [];
    const items = (cat.items || []).map(item => ({...item, categoryName:cat.name || '', categoryId:cat.id}));
    const seen = new Set();
    return items.filter(item => {
        if(!item?.url || seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
    }).map((item, index) => ({
        url:item.url,
        kind:assetMediaKind(item),
        name:item.name || `资产${index + 1}`,
        alias:item.name || `资产${index + 1}`,
        role:'asset',
        categoryName:item.categoryName || '',
        asset_uris:assetRegisteredUris(item),
        mentionId:`asset_${index}_${Math.random().toString(36).slice(2, 7)}`
    }));
}

// Called once by smart-canvas.js, at its original initialization position.
function bindSmartLibraryToggle(){
    if(smartAssetPanel.destroyed) return;
    const events = smartAssetPanel.events('toggle');
    events.on(smartAssetPanel.elements.assetToggle, 'click', () => toggleAssetLibrary());
    events.on(smartAssetPanel.elements.assetCloseBtn, 'click', () => toggleAssetLibrary(false));
}

// Called once by smart-canvas.js, at its original initialization position.
function bindSmartLibraryControls(){
    bindSmartAssetPanelEvents();
    assetDialogBackdrop?.addEventListener('pointerdown', e => e.stopPropagation());
    assetDialogBackdrop?.addEventListener('mousedown', e => e.stopPropagation());
    assetDialogBackdrop?.addEventListener('click', e => e.stopPropagation());
    bindSmartAssetPanelSelection();
}

function hasCanvasImageDrag(event){
    return Array.from(event.dataTransfer?.types || []).includes('application/x-smart-canvas-image');
}

function setAssetDragOver(active){
    if(!smartAssetPanel.elements.assetDropZone || !smartAssetPanel.elements.assetPanel) return;
    smartAssetPanel.elements.assetDropZone.classList.toggle('drag-over', !!active);
    smartAssetPanel.elements.assetPanel.classList.toggle('drag-over', !!active);
}

function handleAssetPanelDragOver(e){
    if(hasCanvasImageDrag(e) || hasSmartImageDropData(e.dataTransfer)){
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        setAssetDragOver(true);
    }
}

async function handleAssetPanelDrop(e){
    if(!hasCanvasImageDrag(e) && !hasSmartImageDropData(e.dataTransfer)) return;
    const target = smartAssetPanel.captureSelection();
    e.preventDefault();
    e.stopPropagation();
    setAssetDragOver(false);
    const raw = e.dataTransfer.getData('application/x-smart-canvas-image');
    if(raw){
        try {
            const payload = JSON.parse(raw);
            if(payload?.url) await addUrlToAssetLibrary(payload.url, payload.name || '', target);
            return;
        } catch(e) {
            toast('保存资产失败');
            return;
        }
    }
    try {
        const payload = await resolveSmartImageDropPayload(e.dataTransfer);
        if(payload.type === 'files') {
            const uploaded = await uploadFiles(payload.files);
            for(const file of uploaded) if(file?.url) await addUrlToAssetLibrary(file.url, file.name || '', target);
        } else if(payload.type === 'localPaths') {
            const imported = await importSmartLocalImages(payload.localPaths);
            for(const file of imported) if(file?.url) await addUrlToAssetLibrary(file.url, file.name || '', target);
        } else if(payload.type === 'url') {
            await addUrlToAssetLibrary(payload.url, smartImageNameFromUrl(payload.url), target);
        }
    } catch(err) {
        toast(err.message || '保存资产失败');
    }
}

// Called once by smart-canvas.js, at its original initialization position.
function bindSmartLibraryDropEvents(){
    if(smartAssetPanel.destroyed) return;
    const events = smartAssetPanel.events('drop');
    events.on(smartAssetPanel.elements.assetDropZone, 'dragover', e => {
        if(hasCanvasImageDrag(e) || hasSmartImageDropData(e.dataTransfer)){
            e.preventDefault();
            e.stopPropagation();
            smartAssetPanel.elements.assetDropZone?.classList.add('drag-over');
        }
    });
    events.on(smartAssetPanel.elements.assetDropZone, 'dragleave', () => smartAssetPanel.elements.assetDropZone?.classList.remove('drag-over'));
    events.on(smartAssetPanel.elements.assetDropZone, 'drop', handleAssetPanelDrop);
    events.on(smartAssetPanel.elements.assetPanel, 'dragover', handleAssetPanelDragOver);
    events.on(smartAssetPanel.elements.assetPanel, 'dragleave', e => { if(!smartAssetPanel.elements.assetPanel?.contains(e.relatedTarget)) setAssetDragOver(false); });
    events.on(smartAssetPanel.elements.assetPanel, 'drop', handleAssetPanelDrop);
}

function smartAssetPanelMetrics(){
    const panel = smartAssetPanel.elements.assetPanel;
    const style = getComputedStyle(panel);
    // Pointer coordinates are physical pixels; panel widths are CSS pixels under UI zoom.
    const scale = panel.getBoundingClientRect().width / parseFloat(style.width) || 1;
    const max = Math.max(0, window.innerWidth / scale - (parseFloat(style.right) || 0) - 22);
    return {scale, max, min:Math.min(SMART_ASSET_PANEL_DEFAULT_WIDTH, max)};
}

function applySmartAssetPanelWidth(width, {persist=false, updatePreferred=true}={}){
    const {assetPanel:panel, assetResizeHandle:handle} = smartAssetPanel.elements;
    if(!panel) return;
    const {min, max} = smartAssetPanelMetrics();
    const value = Number.isFinite(Number(width)) ? Number(width) : SMART_ASSET_PANEL_DEFAULT_WIDTH;
    const next = Math.floor(Math.min(Math.max(value, min), max));
    panel.style.maxWidth = `${max}px`;
    panel.style.width = `${next}px`;
    if(updatePreferred) smartAssetPanel.setWidth(next);
    handle?.setAttribute('aria-valuemin', String(Math.floor(min)));
    handle?.setAttribute('aria-valuemax', String(Math.floor(max)));
    handle?.setAttribute('aria-valuenow', String(next));
    if(persist){
        try { localStorage.setItem(SMART_ASSET_PANEL_WIDTH_KEY, String(smartAssetPanel.state.width)); } catch(e) {}
    }
}

function finishSmartAssetPanelResize(){
    smartAssetPanel.clearEvents('resize');
    if(!smartAssetPanel.state.resize) return;
    smartAssetPanel.setResize(null);
    smartAssetPanel.elements.assetPanel?.classList.remove('resizing');
    document.body.classList.remove('smart-asset-panel-resizing');
    applySmartAssetPanelWidth(smartAssetPanel.state.width, {persist:true});
}

function bindSmartAssetPanelResize(){
    const events = smartAssetPanel.events('resize-controls');
    const {assetPanel:panel, assetResizeHandle:handle} = smartAssetPanel.elements;
    applySmartAssetPanelWidth(smartAssetPanel.state.width, {updatePreferred:false});
    events.on(handle, 'pointerdown', event => {
        if(event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        event.stopPropagation();
        finishSmartAssetPanelResize();
        smartAssetPanel.setResize({pointerId:event.pointerId, startX:event.clientX,
            startWidth:parseFloat(getComputedStyle(panel).width), scale:smartAssetPanelMetrics().scale});
        panel.classList.add('resizing');
        document.body.classList.add('smart-asset-panel-resizing');
        const dragEvents = smartAssetPanel.events('resize');
        dragEvents.on(window, 'pointermove', move => {
            const drag = smartAssetPanel.state.resize;
            if(!drag || move.pointerId !== drag.pointerId) return;
            move.preventDefault();
            applySmartAssetPanelWidth(drag.startWidth + (drag.startX - move.clientX) / drag.scale);
        }, {passive:false});
        const end = event => {
            if(event.pointerId === smartAssetPanel.state.resize?.pointerId) finishSmartAssetPanelResize();
        };
        dragEvents.on(window, 'pointerup', end);
        dragEvents.on(window, 'pointercancel', end);
        dragEvents.on(window, 'blur', finishSmartAssetPanelResize);
    });
    events.on(handle, 'dblclick', event => {
        event.preventDefault();
        event.stopPropagation();
        applySmartAssetPanelWidth(SMART_ASSET_PANEL_DEFAULT_WIDTH, {persist:true});
    });
    events.on(handle, 'keydown', event => {
        if(!['ArrowLeft','ArrowRight','Home'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const step = event.shiftKey ? 64 : 24;
        const width = event.key === 'Home' ? SMART_ASSET_PANEL_DEFAULT_WIDTH
            : parseFloat(getComputedStyle(panel).width) + (event.key === 'ArrowLeft' ? step : -step);
        applySmartAssetPanelWidth(width, {persist:true});
    });
    const reflow = () => {
        finishSmartAssetPanelResize();
        applySmartAssetPanelWidth(smartAssetPanel.state.width, {updatePreferred:false});
    };
    events.on(window, 'resize', reflow);
    events.on(window, 'studio-ui-scale-change', reflow);
}

function bindSmartAssetPanelEvents(){
    if(smartAssetPanel.destroyed) return;
    bindSmartAssetPanelResize();
    const events = smartAssetPanel.events('controls');
    events.on(smartAssetPanel.elements.assetPanel, 'pointerdown', e => e.stopPropagation());
    events.on(smartAssetPanel.elements.assetPanel, 'mousedown', e => e.stopPropagation());
    events.on(smartAssetPanel.elements.assetPanel, 'click', e => e.stopPropagation());
    events.on(smartAssetPanel.elements.assetPanel, 'wheel', e => {
        e.stopPropagation();
        const scroller = e.target.closest?.('.asset-grid') || smartAssetPanel.elements.assetGrid;
        if(!scroller || getComputedStyle(scroller).display === 'none') return;
        const canScroll = scroller.scrollHeight > scroller.clientHeight || scroller.scrollWidth > scroller.clientWidth;
        if(!canScroll) return;
        e.preventDefault();
        scroller.scrollTop += e.deltaY;
        scroller.scrollLeft += e.deltaX;
    }, {passive:false, capture:true});
    events.on(smartAssetPanel.elements.assetGrid, 'scroll', () => {
        if(smartAssetPanel.state.renderedCount >= smartAssetPanel.state.filteredCount) return;
        if(smartAssetPanel.elements.assetGrid.scrollHeight - smartAssetPanel.elements.assetGrid.scrollTop - smartAssetPanel.elements.assetGrid.clientHeight > 180) return;
        smartAssetPanel.loadMore();
    });

}

function bindSmartAssetPanelSelection(){
    if(smartAssetPanel.destroyed) return;
    const events = smartAssetPanel.events('selection');
    document.querySelectorAll('[data-asset-tab]').forEach(btn => {
        events.on(btn, 'click', () => smartAssetPanel.selectTab(btn.dataset.assetTab));
    });
    events.on(smartAssetPanel.elements.assetLibrarySelect, 'change', () => smartAssetPanel.selectLibrary(smartAssetPanel.elements.assetLibrarySelect.value));
    events.on(smartAssetPanel.elements.assetCategorySelect, 'change', () => smartAssetPanel.selectCategory(smartAssetPanel.elements.assetCategorySelect.value));
    events.on(smartAssetPanel.elements.assetNameSearch, 'input', () => smartAssetPanel.setQuery(smartAssetPanel.elements.assetNameSearch.value));
    events.on(smartAssetPanel.elements.assetAddCategoryBtn, 'click', async () => {
        const origin = smartAssetPanel.captureSelection();
        if(assetLibraryIsLocal()){ toast('本地素材请在素材库管理中管理文件夹'); return; }
        const workflowMode = currentAssetTabIsWorkflow();
        const fallbackName = workflowMode ? '工作流' : '新文件夹';
        const name = await openAssetNameDialog({title:'新建文件夹', value:fallbackName, placeholder:fallbackName});
        if(!name) return;
        const data = await smartAssetPanel.mutate(() => window.CanvasApi.createAssetCategory({library_id:origin.libraryId, name, type:workflowMode ? 'workflow' : 'image'}));
        setAssetLibraryFromResponse(data, {render:false});
        if(smartAssetPanel.isSelectionCurrent(origin)) smartAssetPanel.selectTarget({libraryId:origin.libraryId,
            [workflowMode ? 'workflowCategoryId' : 'categoryId']:data.category?.id || ''}, {expected:origin});
        else smartAssetPanel.reconcile();
    });
    events.on(smartAssetPanel.elements.assetRenameCategoryBtn, 'click', async () => {
        if(assetLibraryIsLocal()){ toast('本地素材请在素材库管理中管理文件夹'); return; }
        const cat = activeAssetTabCategory();
        if(!cat) return;
        const name = await openAssetNameDialog({title:'重命名文件夹', value:cat.name || '', placeholder:currentAssetTabIsWorkflow() ? '工作流' : '新文件夹'});
        if(!name) return;
        const data = await smartAssetPanel.mutate(() => window.CanvasApi.updateAssetCategory(cat.id, {name}));
        setAssetLibraryFromResponse(data);
    });
}
