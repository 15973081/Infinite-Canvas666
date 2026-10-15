 const root = document.getElementById('assetManagerRoot');
const statusEl = document.getElementById('assetStatus');
const refreshBtn = document.getElementById('refreshBtn');
const uploadInput = document.getElementById('assetUploadInput');

let activeTab = 'assets';
let assetLibrary = {libraries:[], categories:[]};
let promptLibrary = {libraries:[]};
let apiProviders = [];
let avatarRegisterProvider = '';
let avatarBusyId = '';
const avatarSubmittingItems = new Map();
const avatarCancelRequested = new Set();
const avatarPollTimers = new Map();
const avatarPollAttempts = new Map();
const avatarPollQueue = [];
const avatarPollQueued = new Set();
const avatarPollInFlight = new Set();
const AVATAR_POLL_CONCURRENCY = 6;
let avatarPollActive = 0;
const avatarStatusDirtyIds = new Set();
let avatarStatusRefreshFrame = 0;
let activeAssetLibraryId = '';
let activeAssetCategoryId = '';
let activeWorkflowLibraryId = '';
let activeWorkflowCategoryId = '';
let activePromptLibraryId = '';
let activePromptCategory = 'all';
let assetTreeFocus = 'category';
const ASSET_TREE_COLLAPSED_STORAGE_KEY = 'asset_manager_collapsed_libraries_v1';
const ASSET_VIEW_SESSION_STORAGE_KEY = 'asset_manager_image_view_v1';
function loadCollapsedAssetLibraryIds(){
    try {
        const ids = JSON.parse(localStorage.getItem(ASSET_TREE_COLLAPSED_STORAGE_KEY) || '[]');
        return new Set(Array.isArray(ids) ? ids.map(String).filter(Boolean) : []);
    } catch(_) {
        return new Set();
    }
}
function saveCollapsedAssetLibraryIds(){
    try {
        localStorage.setItem(ASSET_TREE_COLLAPSED_STORAGE_KEY, JSON.stringify([...collapsedAssetLibraryIds]));
    } catch(_) {}
}
let collapsedAssetLibraryIds = loadCollapsedAssetLibraryIds();
function loadAssetViewSession(){
    try {
        const saved = JSON.parse(sessionStorage.getItem(ASSET_VIEW_SESSION_STORAGE_KEY) || '{}');
        return saved && typeof saved === 'object'
            ? {...saved, views:saved.views && typeof saved.views === 'object' ? saved.views : {}}
            : {views:{}};
    } catch(_) {
        return {views:{}};
    }
}
let assetViewSession = loadAssetViewSession();
let assetViewSaveTimer = 0;
let assetViewRestoreToken = 0;
let promptTreeFocus = 'category';
let selectedAssetId = '';
let selectedWorkflowId = '';
let selectedPromptId = '';
let selectedAssetIds = new Set();
let selectedWorkflowIds = new Set();
let selectedPromptIds = new Set();
let assetQuery = '';
let workflowQuery = '';
let promptQuery = '';
let assetManageMode = false;
let workflowManageMode = false;
let promptManageMode = false;
let assetMoveTarget = '';
let assetClipboard = null;
let assetEditMode = false;
let promptEditMode = false;
let promptCreateMode = false;
let pendingDeleteAssetId = '';
let pendingDeletePromptId = '';
let pendingBatchDelete = '';
let assetTreeEdit = null;
let workflowTreeEdit = null;
let promptTreeEdit = null;
let pendingTreeDelete = '';
let marqueeState = null;
let suppressClickAfterMarquee = false;
let sharedFolders = [];
let activeSharedFolderId = '';
let activeSharedFolderName = '';
let localFolders = [];
let localFolderMap = new Map();
let localItemMap = new Map();
let activeLocalFolderId = '';
let selectedLocalId = '';
let selectedLocalIds = new Set();
let localQuery = '';
let localManageMode = false;
let localClipboard = null;
let localCaptionBusy = false;
let localCaptionProvider = '';
let localCaptionModel = '';
let localCaptionPrompt = '描述图片';
let localAssets = [];
let localAssetsLoaded = false;
let localUploadTree = null;
let activeLocalUploadFolder = '';
let selectedLocalUploadId = '';
let selectedLocalUploadIds = new Set();
let localUploadQuery = '';
let localUploadManageMode = false;
let lightboxPanState = null;
let canvasAssetsData = {categories:[], canvases:[], items:[]};
let activeCanvasAssetCategory = 'smart';
let activeCanvasAssetCanvasId = '';
let selectedCanvasAssetId = '';
let selectedCanvasAssetIds = new Set();
let canvasAssetQuery = '';
let canvasAssetSort = 'canvas_asc';
let canvasAssetManageMode = false;
let searchRenderTimer = 0;
let assetGridKey = '';
let assetRenderedCount = 0;
let marqueeRenderFrame = 0;
let assetVirtualRenderFrame = 0;
let assetVirtualRangeKey = '';
let managerTabSwitchToken = 0;

const managerDataLoaded = {
    assets:false,
    prompts:false,
    'canvas-assets':false,
    providers:false
};
const managerLoadPromises = new Map();
const MANAGER_VIEW_STORAGE_KEY = 'asset_manager_views_v1';
let managerViews = loadManagerViews();
let managerRestoreToken = 0;
const managerItemCache = new Map();
let managerVirtualModel = null;
let managerDeleteConfirmation = '';
let managerDeleteBusy = false;

function managerTabLabel(tab){
    return {assets:'图片资产',workflows:'工作流',prompts:'提示词','canvas-assets':'画布资产'}[tab] || '素材';
}
function showManagerLoadState(tab,error=''){
    ++assetViewRestoreToken; ++managerRestoreToken;
    delete root.dataset.managerView;
    root.innerHTML=`<section class="asset-panel manager-load-state" role="status"><p>${escapeHtml(error ? `${managerTabLabel(tab)}加载失败：${error}` : `正在加载${managerTabLabel(tab)}…`)}</p>${error ? '<button class="asset-btn" type="button" data-manager-retry>重试</button>' : ''}</section>`;
}
function managerEmptyState(query,emptyText){
    return `<div class="empty-state">${query.trim() ? '没有匹配的结果，请更换关键词或清空搜索。<button class="asset-btn" type="button" data-manager-clear-search>清空搜索</button>' : escapeHtml(emptyText)}</div>`;
}
function cancelManagerDelete(){
    managerDeleteConfirmation=''; pendingBatchDelete='';
    root.querySelector('[data-manager-cancel-delete]')?.remove();
    const button=root.querySelector('.manage-tools [data-manager-delete-pending]');
    if(button){button.removeAttribute('data-manager-delete-pending');button.classList.remove('detail-confirm');button.querySelector('span').textContent='删除所选';}
}
async function confirmManagerBatchDelete(kind,ids,action){
    if(!ids.length || managerDeleteBusy) return;
    const key=JSON.stringify([kind,managerViewKey(managerViewDescriptor()),[...ids].sort()]);
    if(managerDeleteConfirmation!==key){
        cancelManagerDelete(); managerDeleteConfirmation=key;
        const name={assets:'asset-delete-selected',workflows:'workflow-delete-selected',prompts:'prompt-delete-selected',local:'localup-delete-selected'}[kind];
        const button=root.querySelector(`[data-${name}]`);
        if(button){
            button.dataset.managerDeletePending='';button.classList.add('detail-confirm');button.querySelector('span').textContent=`确认删除 ${ids.length} 项`;
            const cancel=document.createElement('button');cancel.type='button';cancel.className='asset-btn';cancel.dataset.managerCancelDelete='';cancel.textContent='取消删除';button.after(cancel);
        }
        setStatus(`再次点击确认删除 ${ids.length} 项${managerTabLabel(kind)}，也可取消。`);
        return;
    }
    managerDeleteBusy=true;
    try { await action(); }
    finally { managerDeleteBusy=false; cancelManagerDelete(); }
}

function cachedManagerItems(name, source, key, compute){
    const cached=managerItemCache.get(name);
    if(cached?.source===source && cached.key===key) return cached.items;
    const items=compute();
    managerItemCache.set(name,{source,key,items});
    return items;
}
function patchVirtualGrid(grid, cells, topHeight, bottomHeight){
    const desired=[];
    if(topHeight>0) desired.push({key:'__top__',html:`<div class="asset-virtual-spacer" style="height:${topHeight}px"></div>`,item:topHeight});
    desired.push(...cells);
    if(bottomHeight>0) desired.push({key:'__bottom__',html:`<div class="asset-virtual-spacer" style="height:${bottomHeight}px"></div>`,item:bottomHeight});
    const existing=new Map([...grid.children].map(node=>[node.dataset.managerCellKey,node]));
    const retained=new Set();
    let cursor=grid.firstElementChild;
    for(const cell of desired){
        let node=existing.get(cell.key);
        if(!node || node.managerItem!==cell.item){
            const template=document.createElement('template');
            template.innerHTML=cell.html;
            const replacement=template.content.firstElementChild;
            replacement.dataset.managerCellKey=cell.key;
            replacement.managerItem=cell.item;
            if(node){ if(cursor===node) cursor=node.nextElementSibling; node.remove(); }
            node=replacement;
        }
        if(node!==cursor) grid.insertBefore(node,cursor);
        else cursor=cursor.nextElementSibling;
        retained.add(node);
    }
    for(const node of [...grid.children]) if(!retained.has(node)) node.remove();
}
function renderManagerVirtualGrid(groups, renderCard, upload=''){
    managerVirtualModel={groups,renderCard,upload,layout:null};
    return '<div class="asset-grid" data-manager-virtual-grid></div>';
}
function buildManagerVirtualRows(groups, columns, cardHeight, gap, upload=''){
    const rows=[], offsets=new Map();
    let top=0;
    const add=(cells,height)=>{ rows.push({top,height,cells}); for(const cell of cells) if(cell.id) offsets.set(cell.id,top); top+=height+gap; };
    groups.forEach((group,index)=>{
        if(group.title) add([{key:`header:${group.key}`,group}],64);
        const cells=group.items.map(item=>({key:`card:${group.key}:${item.id}`,id:item.id,item}));
        if(index===0 && upload) cells.unshift({key:'upload',html:upload,item:upload});
        for(let i=0;i<cells.length;i+=columns) add(cells.slice(i,i+columns),cardHeight);
    });
    return {rows,offsets,height:Math.max(0,top-gap)};
}
function managerVisibleRows(rows, top, height, overscan){
    let low=0, high=rows.length;
    while(low<high){ const mid=(low+high)>>1; if(rows[mid].top+rows[mid].height<top-overscan) low=mid+1; else high=mid; }
    const start=low;
    while(low<rows.length && rows[low].top<top+height+overscan) low++;
    return [start,low];
}
function renderManagerVirtualWindow(snapshot=null){
    const grid=root.querySelector('[data-manager-virtual-grid]');
    const context=managerScrollContext();
    const model=managerVirtualModel;
    if(!grid || !context || !model || !grid.clientWidth) return;
    const metrics=assetVirtualMetrics(grid,context);
    const {columns,cardHeight,rowStride,gap,gridTop}=metrics;
    const layoutKey=`${columns}:${cardHeight}`;
    if(model.layoutKey!==layoutKey){ model.layout=buildManagerVirtualRows(model.groups,columns,cardHeight,gap,model.upload); model.layoutKey=layoutKey; }
    const layout=model.layout;
    grid.style.setProperty('--asset-virtual-card-height',`${cardHeight}px`);
    grid.style.minHeight=`${layout.height}px`;
    if(snapshot){
        const offset=layout.offsets.get(snapshot.anchorId);
        setAssetScrollPosition(context,offset===undefined ? snapshot.top || 0 : gridTop+offset-Number(snapshot.anchorOffset || 0));
    }
    const current=managerScrollContext();
    const [start,end]=managerVisibleRows(layout.rows,Math.max(0,current.top-gridTop),current.viewportHeight,rowStride*3);
    const cells=layout.rows.slice(start,end).flatMap(row=>row.cells).map(cell=>{
        if(cell.group) return {...cell,item:cell.group,html:`<div class="canvas-asset-group-head manager-group-heading"><div><strong>${escapeHtml(cell.group.title)}</strong><span>${escapeHtml(cell.group.subtitle || '')}</span></div><small>${cell.group.items.length} 个资产</small></div>`};
        return {...cell,html:cell.html || model.renderCard(cell.item)};
    });
    const topHeight=start ? layout.rows[start]?.top-gap || 0 : 0;
    const last=layout.rows[end-1];
    const bottomHeight=last && end<layout.rows.length ? layout.height-last.top-last.height-gap : 0;
    patchVirtualGrid(grid,cells,topHeight,bottomHeight);
    if(grid.querySelector('[data-lucide]')) refreshIcons();
}

function loadManagerViews(){
    try {
        const value = JSON.parse(sessionStorage.getItem(MANAGER_VIEW_STORAGE_KEY) || '{}');
        return {tabs:{...(value?.tabs || {})}, views:{...(value?.views || {})}, libraries:{...(value?.libraries || {})}, collapsed:{...(value?.collapsed || {})}, activeTab:value?.activeTab};
    } catch(_) { return {tabs:{}, views:{}, libraries:{}, collapsed:{}}; }
}
function managerViewDescriptor(){
    if(activeTab === 'workflows') return {tab:activeTab, libraryId:activeWorkflowLibraryId, categoryId:activeWorkflowCategoryId, query:workflowQuery, selectedId:selectedWorkflowId};
    if(activeTab === 'prompts') return {tab:activeTab, libraryId:activePromptLibraryId, categoryId:activePromptCategory, query:promptQuery, selectedId:selectedPromptId};
    if(activeTab === 'local') return {tab:activeTab, libraryId:'uploads', categoryId:activeLocalUploadFolder, query:localUploadQuery, selectedId:selectedLocalUploadId};
    if(activeTab === 'canvas-assets') return {tab:activeTab, libraryId:activeCanvasAssetCategory, categoryId:activeCanvasAssetCanvasId, query:canvasAssetQuery, sort:canvasAssetSort, selectedId:selectedCanvasAssetId};
    return {tab:'assets', libraryId:activeAssetLibraryId, categoryId:activeAssetCategoryId, query:assetQuery, selectedId:selectedAssetId};
}
function managerViewKey(view){
    return JSON.stringify([view.tab, view.libraryId || '', view.categoryId || '', String(view.query || '').trim().toLowerCase(), view.sort || '']);
}
function managerSelectionContext(){
    const common = (prefix, key, ids, items, mode, selectedId, select, detail, readonly=false) => ({prefix,key,ids,items,mode,selectedId,select,detail,readonly,
        cardSelector:`[data-${prefix}-${key==='promptRow' ? 'row' : 'card'}]`,checkSelector:`[data-${prefix}-check]`,
        checkKey:prefix==='canvas-asset' ? 'canvasAssetCheck' : prefix==='localup' ? 'localupCheck' : `${prefix}Check`});
    if(activeTab==='assets') return common('asset','assetCard',selectedAssetIds,currentAssetItems(),assetManageMode,selectedAssetId,id=>selectedAssetId=id,()=>renderAssetDetail(selectedAsset()));
    if(activeTab==='workflows') return common('workflow','workflowCard',selectedWorkflowIds,currentWorkflowItems(),workflowManageMode,selectedWorkflowId,id=>selectedWorkflowId=id,()=>renderWorkflowDetail(selectedWorkflow()));
    if(activeTab==='prompts') return common('prompt','promptRow',selectedPromptIds,currentPromptItems(),promptManageMode,selectedPromptId,id=>{selectedPromptId=id;promptEditMode=false;promptCreateMode=false;},()=>renderPromptDetail(selectedPrompt(),Boolean(activePromptLibrary()?.readonly)),Boolean(activePromptLibrary()?.readonly));
    if(activeTab==='local') return common('localup','localupCard',selectedLocalUploadIds,localUploadItems(),localUploadManageMode,selectedLocalUploadId,id=>selectedLocalUploadId=id,()=>renderLocalUploadDetail(findLocalUpload(selectedLocalUploadId)));
    return common('canvas-asset','canvasAssetCard',selectedCanvasAssetIds,currentCanvasAssetItems(),canvasAssetManageMode,selectedCanvasAssetId,id=>selectedCanvasAssetId=id,()=>renderCanvasAssetDetail(selectedCanvasAsset()));
}
function pruneManagerSelection(selection=managerSelectionContext()){
    const visible=new Set(selection.readonly ? [] : selection.items.map(item=>item.id));
    for(const id of selection.ids) if(!visible.has(id)) selection.ids.delete(id);
}
function refreshManagerSelection({detail=false}={}){
    cancelManagerDelete();
    const selection=managerSelectionContext();
    pruneManagerSelection(selection);
    root.querySelectorAll(selection.cardSelector).forEach(card=>card.classList.toggle('active',card.dataset[selection.key]===selection.selectedId));
    root.querySelectorAll(selection.checkSelector).forEach(input=>input.checked=selection.ids.has(input.dataset[selection.checkKey]));
    const tools=root.querySelector('.asset-content .manage-tools');
    const count=selection.ids.size;
    const summary=tools?.querySelector(':scope > span');
    if(summary) summary.textContent=`已选择 ${count} 项（当前筛选结果共 ${selection.items.length} 项）${activeTab==='local' ? `，其中 ${selectedLocalUploadImageItems().length} 张图片` : ''}。`;
    const selectors={assets:['asset-clear-selection','asset-cut-selected','asset-copy-selected','asset-download-selected','asset-copy-to-canvas','asset-delete-selected'],workflows:['workflow-clear-selection','workflow-export-selected','workflow-delete-selected'],prompts:['prompt-clear-selection','prompt-delete-selected'],local:['localup-clear','localup-delete-selected'],'canvas-assets':['canvas-asset-clear-selection','canvas-asset-download-selected']}[activeTab];
    for(const name of selectors){ const button=tools?.querySelector(`[data-${name}]`); if(button) button.disabled=!count || selection.readonly; }
    const avatar=tools?.querySelector('[data-avatar-register-selected]');
    if(avatar) avatar.disabled=!count || Boolean(avatarBusyId);
    const caption=tools?.querySelector('[data-local-caption-run]');
    if(caption) caption.disabled=!selectedLocalUploadImageItems().length || !localCaptionProviders().length || !localCaptionModel || localCaptionBusy;
    if(detail){ const panel=root.querySelector('.asset-detail'); if(panel){panel.innerHTML=selection.detail();refreshIcons();} }
    root.dataset.managerView=JSON.stringify(managerViewDescriptor());
    scheduleAssetViewSave();
}
function handleManagerSelectionClick(target){
    const selection=managerSelectionContext();
    if(target.closest?.(selection.checkSelector)) return true; // native change is the single checkbox update path
    const all=target.closest?.(`[data-${selection.prefix}-select-all]`);
    const clear=target.closest?.(`[data-${selection.prefix}-${activeTab==='local' ? 'clear' : 'clear-selection'}]`);
    if(all || clear){
        selection.ids.clear();
        if(all && !selection.readonly) selection.items.forEach(item=>selection.ids.add(item.id));
        pendingBatchDelete=''; refreshManagerSelection(); return true;
    }
    const card=target.closest?.(selection.cardSelector);
    if(!card || target.closest?.('button,input,textarea,select,a')) return false;
    const id=card.dataset[selection.key];
    if(selection.mode){
        if(!selection.readonly){ if(selection.ids.has(id)) selection.ids.delete(id); else selection.ids.add(id); }
    } else selection.select(id);
    pendingBatchDelete=''; pendingDeleteAssetId=''; pendingDeletePromptId='';
    refreshManagerSelection({detail:!selection.mode && id!==selection.selectedId});
    return true;
}
function restoreManagerDescriptor(view){
    if(!view) return;
    const library = String(view.libraryId || ''), category = String(view.categoryId || ''), query = String(view.query || ''), selected = String(view.selectedId || '');
    if(view.tab === 'assets'){ activeAssetLibraryId=library; activeAssetCategoryId=category; assetQuery=query; selectedAssetId=selected; }
    if(view.tab === 'workflows'){ activeWorkflowLibraryId=library; activeWorkflowCategoryId=category; workflowQuery=query; selectedWorkflowId=selected; }
    if(view.tab === 'prompts'){ activePromptLibraryId=library; activePromptCategory=category; promptQuery=query; selectedPromptId=selected; }
    if(view.tab === 'local'){ activeLocalUploadFolder=category; localUploadQuery=query; selectedLocalUploadId=selected; }
    if(view.tab === 'canvas-assets'){ activeCanvasAssetCategory=library; activeCanvasAssetCanvasId=category; canvasAssetQuery=query; canvasAssetSort=String(view.sort || 'canvas_asc'); selectedCanvasAssetId=selected; }
}
function managerScrollContext(element=root.querySelector('.asset-content .content-scroll')){
    if(!element) return null;
    const usesWindow = getComputedStyle(document.body).overflowY !== 'hidden';
    const scrollingElement = document.scrollingElement || document.documentElement;
    return usesWindow
        ? {kind:'window', element, top:window.scrollY || scrollingElement.scrollTop || 0, left:window.scrollX || 0, viewportTop:0, viewportHeight:window.innerHeight}
        : {kind:'element', element, top:element.scrollTop, left:element.scrollLeft, viewportTop:element.getBoundingClientRect().top, viewportHeight:element.clientHeight};
}
function captureManagerView(){
    if(!root.dataset.managerView) return null;
    const descriptor = JSON.parse(root.dataset.managerView);
    const context = managerScrollContext();
    if(!context) return null;
    const card = [...context.element.querySelectorAll('[data-asset-card],[data-workflow-card],[data-prompt-row],[data-localup-card],[data-canvas-asset-card]')].find(el => el.getBoundingClientRect().bottom > context.viewportTop + 1);
    return {...descriptor, top:context.top, left:context.left,
        anchorId:card ? (card.dataset.assetCard || card.dataset.workflowCard || card.dataset.promptRow || card.dataset.localupCard || card.dataset.canvasAssetCard) : '',
        anchorOffset:card ? card.getBoundingClientRect().top - context.viewportTop : 0,
        navTop:root.querySelector('.nav-scroll')?.scrollTop || 0, detailTop:root.querySelector('.detail-scroll')?.scrollTop || 0, savedAt:Date.now()};
}
function rememberManagerView(snapshot=null){
    if(snapshot){
        managerViews.views[managerViewKey(snapshot)] = snapshot;
        const entries = Object.entries(managerViews.views).sort((a,b) => b[1].savedAt-a[1].savedAt);
        managerViews.views = Object.fromEntries(entries.slice(0,80));
    }
    const view = managerViewDescriptor();
    managerViews.tabs[view.tab] = view;
    managerViews.activeTab = activeTab;
    managerViews.libraries[JSON.stringify([view.tab,view.libraryId])] = view.categoryId;
    try { sessionStorage.setItem(MANAGER_VIEW_STORAGE_KEY, JSON.stringify(managerViews)); } catch(_) {}
}
function restoreManagerView(snapshot, resetScroll=false){
    const expectedKey = managerViewKey(managerViewDescriptor());
    const token = ++managerRestoreToken;
    const matches = () => token === managerRestoreToken && expectedKey === managerViewKey(managerViewDescriptor());
    if(activeTab === 'assets'){
        restoreAssetViewState(resetScroll || !snapshot ? {...managerViewDescriptor(),top:0,navTop:snapshot?.navTop || 0} : snapshot);
        return;
    }
    requestAnimationFrame(() => {
        if(!matches()) return;
        const context = managerScrollContext();
        if(!context) return;
        setAssetScrollPosition(context, resetScroll ? 0 : snapshot?.top || 0);
        renderManagerVirtualWindow(resetScroll ? {top:0} : snapshot);
        root.querySelector('.nav-scroll')?.scrollTo({top:snapshot?.navTop || 0});
        root.querySelector('.detail-scroll')?.scrollTo({top:resetScroll ? 0 : snapshot?.detailTop || 0});
        if(!resetScroll && snapshot?.anchorId){
            const card = [...context.element.querySelectorAll('[data-workflow-card],[data-prompt-row],[data-localup-card],[data-canvas-asset-card]')].find(el => Object.values(el.dataset).includes(snapshot.anchorId));
            if(card) setAssetScrollPosition(managerScrollContext(), (managerScrollContext()?.top || 0) + card.getBoundingClientRect().top-context.viewportTop-snapshot.anchorOffset);
        }
        scheduleAssetViewSave();
    });
}
function decorateManagerNavigation(){
    if(activeTab === 'assets') return;
    root.querySelectorAll('.asset-nav .tree-branch').forEach(branch => {
        const row=branch.querySelector(':scope > .tree-row'), children=branch.querySelector(':scope > .tree-children');
        if(!row || !children) return;
        const key=JSON.stringify([activeTab,row.dataset]);
        const expanded=!managerViews.collapsed[key];
        const heading=document.createElement('div');
        heading.className='manager-tree-heading';
        const toggle=document.createElement('button');
        toggle.type='button'; toggle.className='manager-tree-toggle'; toggle.dataset.managerToggle=key;
        toggle.innerHTML=`<i data-lucide="${expanded ? 'chevron-down' : 'chevron-right'}" aria-hidden="true"></i>`; toggle.setAttribute('aria-expanded',String(expanded));
        toggle.setAttribute('aria-label',`${expanded ? '折叠' : '展开'}${row.textContent.trim()}`);
        branch.insertBefore(heading,row); heading.append(toggle,row);
        children.hidden=!expanded;
    });
}

const LOCAL_MEDIA_EXTS = /\.(png|jpe?g|jfif|webp|gif|bmp|avif|svg|mp4|webm|mov|m4v|mp3|wav|flac|ogg|m4a|aac)(\?|#|$)/i;
const ASSET_BATCH_SIZE = 32;
const ASSET_VIRTUAL_OVERSCAN_ROWS = 3;

function refreshIcons(){ if(window.lucide) lucide.createIcons(); }
function setStatus(text='准备就绪'){ if(statusEl) statusEl.textContent = text || '准备就绪'; }
function assetViewKey(libraryId=activeAssetLibraryId, categoryId=activeAssetCategoryId, query=assetQuery){
    return JSON.stringify([String(libraryId || ''), String(categoryId || ''), String(query || '').trim().toLowerCase()]);
}
function assetContentScrollContext(){
    const element = root.querySelector('.asset-content .content-scroll[data-asset-view-library]');
    return element ? managerScrollContext(element) : null;
}
function captureAssetViewState(){
    const context = assetContentScrollContext();
    if(!context) return null;
    const libraryId = context.element.dataset.assetViewLibrary || '';
    const categoryId = context.element.dataset.assetViewCategory || '';
    const query = context.element.dataset.assetViewQuery || '';
    const cards = [...root.querySelectorAll('[data-asset-card]')];
    const anchor = cards.find(card => card.getBoundingClientRect().bottom > context.viewportTop + 1) || null;
    const nav = root.querySelector('.asset-nav .nav-scroll');
    const detail = root.querySelector('.asset-detail .detail-scroll');
    return {
        libraryId,
        categoryId,
        query,
        top:context.top,
        left:context.left,
        scrollKind:context.kind,
        anchorId:anchor?.dataset.assetCard || '',
        anchorOffset:anchor ? anchor.getBoundingClientRect().top - context.viewportTop : 0,
        navTop:nav?.scrollTop || 0,
        detailTop:detail?.scrollTop || 0,
        savedAt:Date.now()
    };
}
function persistAssetViewSession(snapshot=null){
    if(snapshot?.libraryId && snapshot?.categoryId){
        assetViewSession.views[assetViewKey(snapshot.libraryId, snapshot.categoryId, snapshot.query)] = snapshot;
        const entries = Object.entries(assetViewSession.views);
        if(entries.length > 40){
            entries.sort((a, b) => Number(b[1]?.savedAt || 0) - Number(a[1]?.savedAt || 0));
            assetViewSession.views = Object.fromEntries(entries.slice(0, 40));
        }
    }
    assetViewSession.activeLibraryId = activeAssetLibraryId;
    assetViewSession.activeCategoryId = activeAssetCategoryId;
    assetViewSession.query = assetQuery;
    try { sessionStorage.setItem(ASSET_VIEW_SESSION_STORAGE_KEY, JSON.stringify(assetViewSession)); } catch(_) {}
}
function scheduleAssetViewSave(){
    clearTimeout(assetViewSaveTimer);
    assetViewSaveTimer = setTimeout(() => {
        rememberManagerView(captureManagerView());
        const snapshot = captureAssetViewState();
        if(snapshot) persistAssetViewSession(snapshot);
    }, 120);
}
function savedAssetViewForCurrentState(preferred=null){
    const key = assetViewKey();
    if(preferred && assetViewKey(preferred.libraryId, preferred.categoryId, preferred.query) === key) return preferred;
    return assetViewSession.views[key] || null;
}
function setAssetScrollPosition(context, top, left=0){
    if(context.kind === 'window') window.scrollTo({top:Math.max(0, top || 0), left:Math.max(0, left || 0), behavior:'auto'});
    else {
        context.element.scrollTop = Math.max(0, top || 0);
        context.element.scrollLeft = Math.max(0, left || 0);
    }
}
function alignAssetScrollAnchor(snapshot){
    if(!snapshot?.anchorId) return false;
    const context = assetContentScrollContext();
    if(!context) return false;
    const anchor = [...root.querySelectorAll('[data-asset-card]')].find(card => card.dataset.assetCard === snapshot.anchorId);
    if(!anchor) return false;
    const delta = anchor.getBoundingClientRect().top - context.viewportTop - Number(snapshot.anchorOffset || 0);
    if(Math.abs(delta) < 1) return true;
    if(context.kind === 'window') window.scrollBy({top:delta, left:0, behavior:'auto'});
    else context.element.scrollTop += delta;
    return true;
}
function assetVirtualMetrics(grid, context){
    const style = getComputedStyle(grid);
    const columns = Math.max(1, style.gridTemplateColumns.split(' ').filter(Boolean).length);
    const gap = Number.parseFloat(style.rowGap) || 10;
    const columnGap = Number.parseFloat(style.columnGap) || 10;
    const cardHeight = (grid.clientWidth - (columns - 1) * columnGap) / columns + 48;
    return {columns, gap, cardHeight, rowStride:cardHeight + gap,
        gridTop:context.kind === 'window'
            ? grid.getBoundingClientRect().top + context.top
            : grid.getBoundingClientRect().top - context.viewportTop + context.top};
}
function assetAnchorScrollTop(snapshot, items, metrics){
    const index = items.findIndex(item => item.id === snapshot.anchorId);
    return index < 0 ? Number(snapshot.top || 0)
        : metrics.gridTop + Math.floor((index + 1) / metrics.columns) * metrics.rowStride - Number(snapshot.anchorOffset || 0);
}
function restoreAssetViewState(snapshot){
    if(!snapshot) return;
    const expectedKey = assetViewKey();
    if(assetViewKey(snapshot.libraryId, snapshot.categoryId, snapshot.query) !== expectedKey) return;
    const token = ++assetViewRestoreToken;
    requestAnimationFrame(() => {
        if(token !== assetViewRestoreToken || activeTab !== 'assets') return;
        const context = assetContentScrollContext();
        if(!context) return;
        root.querySelector('.asset-nav .nav-scroll')?.scrollTo({top:Number(snapshot.navTop || 0), behavior:'auto'});
        root.querySelector('.asset-detail .detail-scroll')?.scrollTo({top:Number(snapshot.detailTop || 0), behavior:'auto'});
        const grid = root.querySelector('[data-asset-virtual-grid]');
        const top = grid ? assetAnchorScrollTop(snapshot, currentAssetItems(), assetVirtualMetrics(grid, context)) : Number(snapshot.top || 0);
        setAssetScrollPosition(context, top, Number(snapshot.left || 0));
        renderAssetVirtualWindow();
        requestAnimationFrame(() => {
            if(token !== assetViewRestoreToken || activeTab !== 'assets') return;
            alignAssetScrollAnchor(snapshot);
            renderAssetVirtualWindow();
            requestAnimationFrame(() => {
                if(token !== assetViewRestoreToken || activeTab !== 'assets') return;
                alignAssetScrollAnchor(snapshot);
                scheduleAssetViewSave();
            });
        });
    });
}
function renderPreservingScroll(selectors=['.nav-scroll']){
    const scrollState = Object.fromEntries(selectors.map(selector => {
        const el = root.querySelector(selector);
        return [selector, {top:el?.scrollTop || 0, left:el?.scrollLeft || 0}];
    }));
    render();
    const token = managerRestoreToken;
    const restore = () => Object.entries(scrollState).forEach(([selector, position]) => {
        if(token !== managerRestoreToken) return;
        const el = root.querySelector(selector);
        if(el){ el.scrollTop = position.top; el.scrollLeft = position.left; }
    });
    requestAnimationFrame(() => {
        restore();
        requestAnimationFrame(restore);
    });
}
function scheduleSearchRender(inputId, position){
    clearTimeout(searchRenderTimer);
    searchRenderTimer = setTimeout(() => {
        const restoreFocus = document.activeElement?.id === inputId;
        render({resetScroll:true});
        if(!restoreFocus) return;
        requestAnimationFrame(() => {
            const input = document.getElementById(inputId);
            input?.focus();
            input?.setSelectionRange?.(position, position);
        });
    }, 160);
}
function escapeHtml(value=''){
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function escapeAttr(value=''){ return escapeHtml(value); }
async function copyTextToClipboard(text){
    const value = String(text || '');
    if(!value) return false;
    try {
        if(navigator.clipboard?.writeText){ await navigator.clipboard.writeText(value); return true; }
    } catch(_) {}
    try {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
    } catch(_) { return false; }
}
function assetErrorText(data, fallback='操作失败'){
    if(typeof data?.detail === 'string') return data.detail;
    if(typeof data?.detail?.message === 'string') return data.detail.message;
    if(typeof data?.message === 'string') return data.message;
    return window.CanvasSession?.errorText(data) || fallback;
}
async function apiJson(url, options={}){
    const uploading=options.body instanceof FormData && options.body.has('files');
    const state=uploading ? window.StudioTransferStatus?.begin({name:options.body.getAll('files').length+' 个素材'}) : null;
    try {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if(!res.ok){
        const error = new Error(assetErrorText(data));
        error.status = res.status;
        throw error;
    }
    state?.finish();
    return data;
    } catch(error) {state?.fail(error);throw error;}
}
function formatDate(value){
    const num = Number(value || 0);
    if(!num) return '未知';
    try { return new Date(num).toLocaleString('zh-CN', {hour12:false}); }
    catch(e) { return '未知'; }
}
function formatFileSize(bytes=0){
    const size = Number(bytes || 0);
    if(!size) return '0 B';
    const units = ['B','KB','MB','GB','TB'];
    const idx = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)));
    return `${(size / Math.pow(1024, idx)).toFixed(idx ? 1 : 0)} ${units[idx]}`;
}
function assetLibraries(){
    return Array.isArray(assetLibrary.libraries) && assetLibrary.libraries.length
        ? assetLibrary.libraries
        : [{id:'default', name:'默认资产库', categories:assetLibrary.categories || []}];
}
function activeAssetLibrary(){
    const libs = assetLibraries();
    return libs.find(lib => lib.id === activeAssetLibraryId) || libs[0] || null;
}
function activeWorkflowLibrary(){
    const libs = assetLibraries();
    return libs.find(lib => lib.id === activeWorkflowLibraryId) || libs[0] || null;
}
function assetCategories(){
    return (activeAssetLibrary()?.categories || []).filter(cat => (cat.type || 'image') === 'image');
}
function workflowCategories(){
    const cats = [];
    assetLibraries().forEach(lib => {
        (lib.categories || []).filter(cat => (cat.type || '') === 'workflow').forEach(cat => {
            cats.push({...cat, __libraryId:lib.id, __libraryName:lib.name || '资产库'});
        });
    });
    return cats;
}
function activeAssetCategory(){
    const cats = assetCategories();
    return cats.find(cat => cat.id === activeAssetCategoryId) || cats[0] || null;
}
function activeWorkflowCategory(){
    const cats = workflowCategories();
    return cats.find(cat => cat.id === activeWorkflowCategoryId && cat.__libraryId === activeWorkflowLibraryId)
        || cats.find(cat => cat.id === activeWorkflowCategoryId)
        || cats[0]
        || null;
}
function workflowCount(){
    return workflowCategories().reduce((sum, cat) => sum + ((cat.items || []).length), 0);
}
function assetCountForLibrary(lib){
    return (lib?.categories || [])
        .filter(cat => (cat.type || 'image') === 'image')
        .reduce((sum, cat) => sum + ((cat.items || []).length), 0);
}
function promptLibraries(){
    const libs = Array.isArray(promptLibrary.libraries) ? promptLibrary.libraries.filter(Boolean) : [];
    if(!libs.length) return [{id:'system', name:'系统提示词库', system:true, items:[], categories:[]}];
    const system = libs.filter(lib => lib.id === 'system');
    const others = libs.filter(lib => lib.id !== 'system');
    return [...system, ...others];
}
function isSystemPromptLibrary(lib){
    return !lib || lib.id === 'system';
}
function activePromptLibrary(){
    const libs = promptLibraries();
    return libs.find(lib => lib.id === activePromptLibraryId) || libs[0] || null;
}
// 按“某个库自身”解析分类：库有自己的分类就用它；只有系统库在完全为空时才补默认内置分类。
// 新建的普通库分类为空 → 返回 []，不能借用当前激活库/系统库的分类（否则树里会错显系统分类）。
function promptCategoriesFor(lib){
    const fromLib = Array.isArray(lib?.categories) ? lib.categories.filter(c => c?.id) : [];
    if(fromLib.length) return fromLib;
    if(!isSystemPromptLibrary(lib)) return [];
    return [
        {id:'view', name:'视角'},
        {id:'storyboard', name:'分镜'},
        {id:'character', name:'角色'},
        {id:'product', name:'产品'},
        {id:'lighting', name:'光影'},
        {id:'custom', name:'我的'}
    ];
}
function activePromptCategories(){
    return promptCategoriesFor(activePromptLibrary());
}
const PROMPT_BUILTIN_CATEGORY_IDS = new Set(['view','storyboard','character','product','lighting','custom']);
function promptCategoryLabel(category='custom'){
    const found = activePromptCategories().find(cat => cat.id === category);
    if(found?.name) return found.name;
    const map = {view:'视角', storyboard:'分镜', character:'角色', product:'产品', lighting:'光影', mine:'我的', custom:'我的'};
    return map[category] || category || '自定义';
}
function promptCountForCategory(category, lib=activePromptLibrary()){
    const items = lib?.items || [];
    if(category === 'all') return items.length;
    return items.filter(item => (item.category || 'custom') === category).length;
}
function assetKind(item){
    const url = String(item?.url || '').toLowerCase();
    const kind = String(item?.kind || item?.mediaKind || item?.type || item?.mime_type || item?.mime || '').toLowerCase();
    if(kind.includes('video') || /\.(mp4|webm|mov|m4v)(\?|#|$)/.test(url)) return 'video';
    if(kind.includes('audio') || /\.(mp3|wav|flac|ogg|m4a|aac)(\?|#|$)/.test(url)) return 'audio';
    if(kind.includes('text') || /\.(txt|json|csv|srt|vtt|md)(\?|#|$)/.test(url)) return 'text';
    if(kind === 'file' || /\.(pdf|docx?|xlsx?|bin|zip)(\?|#|$)/.test(url)) return 'file';
    return 'image';
}
function workflowKindLabel(item){
    const format = String(item?.format || '').toLowerCase();
    const url = String(item?.url || '').toLowerCase();
    if(format === 'json' || url.endsWith('.json')) return 'JSON 工作流';
    return 'ZIP 工作流包';
}
function assetKindLabel(item){
    const kind = assetKind(item);
    if(kind === 'video') return '视频';
    if(kind === 'audio') return '音频';
    if(kind === 'text') return '文本';
    if(kind === 'file') return '文件';
    return '图片';
}
function assetDisplayMediaUrl(url){
    return window.MemberMediaUrl ? window.MemberMediaUrl(url) : url;
}
function openAssetUrl(url){
    const display = assetDisplayMediaUrl(url);
    if(display) window.open(display, '_blank', 'noopener');
}
function assetMediaPreviewUrl(url, size=384){
    const raw = String(url || '');
    if(!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return assetDisplayMediaUrl(raw);
    if(!raw.startsWith('/output/') && !raw.startsWith('/assets/')) return assetDisplayMediaUrl(raw);
    if(!/\.(png|jpe?g|jfif|webp|gif|bmp|avif|tiff?|mp4|webm|mov|m4v)(\?|#|$)/i.test(raw)) return assetDisplayMediaUrl(raw);
    const width = Math.max(64, Math.min(2048, Math.round(Number(size) || 384)));
    return assetDisplayMediaUrl(`/api/media-preview?w=${width}&url=${encodeURIComponent(raw)}`);
}
function assetThumb(item){
    const kind = assetKind(item);
    const original = String(item?.url || '');
    const preview = assetMediaPreviewUrl(original, 384);
    if(kind === 'video' && preview !== assetDisplayMediaUrl(original)) return `<img src="${escapeAttr(preview)}" data-original-src="${escapeAttr(original)}" alt="${escapeAttr(item.name || 'video')}" loading="lazy" decoding="async" fetchpriority="low">`;
    if(kind === 'video') return `<video src="${escapeAttr(assetDisplayMediaUrl(original))}" muted preload="none" playsinline></video>`;
    if(kind === 'audio') return `<div class="asset-file-icon"><i data-lucide="file-audio"></i><span>音频</span></div>`;
    if(kind === 'text') return `<div class="asset-file-icon"><i data-lucide="file-text"></i><span>文本</span></div>`;
    if(kind === 'file') return `<div class="asset-file-icon"><i data-lucide="file"></i><span>文件</span></div>`;
    return `<img src="${escapeAttr(preview)}" data-original-src="${escapeAttr(original)}" alt="${escapeAttr(item.name || 'asset')}" loading="lazy" decoding="async" fetchpriority="low">`;
}
function assetAudioDetailHtml(item, source='asset'){
    const extension = String(item.file || item.url || item.name || '').split(/[?#]/)[0].match(/\.(mp3|wav|flac|ogg|m4a|aac)$/i)?.[1]?.toUpperCase() || 'AUDIO';
    return `<div class="detail-media asset-audio-detail"><div class="asset-audio-heading"><span class="asset-audio-symbol"><i data-lucide="file-audio"></i></span><div><strong>音频素材</strong><span>${extension}</span></div></div><p>试听后可作为画布的音频参考素材。</p><button class="asset-btn" type="button" data-${source}-preview="${escapeAttr(item.id)}"><i data-lucide="play"></i><span>试听音频</span></button></div>`;
}
function workflowThumb(item){
    return `<div class="asset-file-icon workflow-file-icon"><i data-lucide="workflow"></i><span>${escapeHtml(workflowKindLabel(item))}</span></div>`;
}
function isLocalMediaFile(file){
    if(!file) return false;
    const type = String(file.type || '').toLowerCase();
    if(type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/')) return true;
    return LOCAL_MEDIA_EXTS.test(file.name || '');
}
function localItemKind(item){
    // 共享文件夹的 item 已带 kind；兜底按名称判断
    if(item && item.kind) return item.kind;
    const name = String(item?.name || '').toLowerCase();
    if(/\.(mp4|webm|mov|m4v|mkv)(\?|#|$)/i.test(name)) return 'video';
    if(/\.(mp3|wav|flac|ogg|m4a|aac)(\?|#|$)/i.test(name)) return 'audio';
    return 'image';
}
function localObjectUrl(item){
    // 共享文件夹素材直接走后端 URL（局域网也可访问），不再用 createObjectURL
    return item?.url || '';
}
function localAssetThumb(item){
    return assetThumb({url:localObjectUrl(item), name:item?.name || 'local', kind:item?.kind || localItemKind(item)});
}
function activeLocalFolder(){
    return localFolderMap.get(activeLocalFolderId) || localFolders[0] || null;
}
function localItemsForFolder(folderId=activeLocalFolderId){
    const query = localQuery.trim().toLowerCase();
    const folder = localFolderMap.get(folderId) || activeLocalFolder();
    const items = folder?.items || [];
    return items.filter(item => {
        if(!query) return true;
        return [item.name, item.relativePath, assetKindLabel(item)].join(' ').toLowerCase().includes(query);
    });
}
function localCaptionProviders(){
    return (apiProviders || []).filter(p => p && p.enabled !== false && Array.isArray(p.chat_models) && p.chat_models.length);
}
function normalizeLocalCaptionSettings(){
    const providers = localCaptionProviders();
    if(!providers.length){
        localCaptionProvider = '';
        localCaptionModel = '';
        return;
    }
    let provider = providers.find(p => p.id === localCaptionProvider) || providers[0];
    localCaptionProvider = provider.id || '';
    const models = (provider.chat_models || []).filter(Boolean);
    if(!models.includes(localCaptionModel)) localCaptionModel = models[0] || '';
}
function localCaptionModels(){
    normalizeLocalCaptionSettings();
    const provider = localCaptionProviders().find(p => p.id === localCaptionProvider);
    return (provider?.chat_models || []).filter(Boolean);
}
function renderLocalCaptionTools(imageCount){
    normalizeLocalCaptionSettings();
    const providers = localCaptionProviders();
    const models = localCaptionModels();
    const disabled = !imageCount || !providers.length || !localCaptionModel || localCaptionBusy;
    return `
        <div class="local-caption-tools">
            <select id="localCaptionProvider" class="manage-select" title="反推平台" ${providers.length ? '' : 'disabled'}>
                ${providers.length ? providers.map(p => `<option value="${escapeAttr(p.id)}" ${p.id === localCaptionProvider ? 'selected' : ''}>${escapeHtml(p.name || p.id)}</option>`).join('') : '<option value="">暂无聊天平台</option>'}
            </select>
            <select id="localCaptionModel" class="manage-select" title="反推模型" ${models.length ? '' : 'disabled'}>
                ${models.length ? models.map(m => `<option value="${escapeAttr(m)}" ${m === localCaptionModel ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('') : '<option value="">暂无模型</option>'}
            </select>
            <input id="localCaptionPrompt" class="local-caption-prompt-input" type="text" value="${escapeAttr(localCaptionPrompt || '描述图片')}" placeholder="描述图片">
            <button class="asset-btn primary" type="button" data-local-caption-run ${disabled ? 'disabled' : ''}><i data-lucide="${localCaptionBusy ? 'loader-2' : 'wand-sparkles'}"></i><span>${localCaptionBusy ? '反推中' : '提示词反推'}</span></button>
        </div>
    `;
}
function findLocalItem(id){
    return localItemMap.get(id) || null;
}
function normalizeLocalState(){
    if(!activeLocalFolderId || !localFolderMap.has(activeLocalFolderId)) activeLocalFolderId = localFolders[0]?.id || '';
    const items = localItemsForFolder();
    if(selectedLocalId && !localItemMap.has(selectedLocalId)) selectedLocalId = '';
    if(!selectedLocalId && items.length) selectedLocalId = items[0].id;
    selectedLocalIds = new Set([...selectedLocalIds].filter(id => localItemMap.has(id)));
}
function localFolderTotal(folder){
    if(!folder) return 0;
    return (folder.items || []).length + (folder.children || []).reduce((sum, child) => sum + localFolderTotal(child), 0);
}
function localFolderId(path=''){
    return path || '__root__';
}
function localChildPath(parentPath='', name=''){
    return parentPath ? `${parentPath}/${name}` : name;
}
// ---------------- 共享文件夹（服务端登记 + 只读浏览/引用，局域网可用） ----------------
async function loadSharedFolders(){
    try {
        const data = await apiJson('/api/shared-folders');
        sharedFolders = Array.isArray(data.folders) ? data.folders : [];
    } catch(err) {
        sharedFolders = [];
    }
    return sharedFolders;
}
async function loadLocalAssets(){
    const data = await apiJson('/api/local-assets');
    localAssets = Array.isArray(data.items) ? data.items : [];
    localUploadTree = data.tree || {id:'__root__', path:'', name:'全部上传', count:localAssets.length, items:[], children:[]};
    if(activeLocalUploadFolder && !localUploadFolderExists(activeLocalUploadFolder)) activeLocalUploadFolder = '';
    selectedLocalUploadIds = new Set([...selectedLocalUploadIds].filter(id => localAssets.some(item => item.id === id)));
    localAssetsLoaded = true;
    return localAssets;
}
async function registerSharedFolder(){
    const tip = '请输入要登记的共享文件夹路径（必须位于项目目录内，例如 assets\\library 或 output）：';
    const path = window.prompt(tip, '');
    if(!String(path || '').trim()) return;
    try {
        setStatus('正在登记共享文件夹...');
        const data = await apiJson('/api/shared-folders', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({path})
        });
        await loadSharedFolders();
        const folder = data.folder;
        if(folder?.id) await openSharedFolder(folder.id);
        else render();
        setStatus(`已登记「${folder?.name || '共享文件夹'}」`);
    } catch(err) {
        setStatus(err.message || '登记共享文件夹失败');
    }
}
async function unregisterSharedFolder(folderId){
    if(!folderId) return;
    try {
        await apiJson(`/api/shared-folders/${encodeURIComponent(folderId)}`, {method:'DELETE'});
        if(activeSharedFolderId === folderId){
            activeSharedFolderId = '';
            activeSharedFolderName = '';
            localFolders = [];
            localFolderMap = new Map();
            localItemMap = new Map();
            activeLocalFolderId = '';
            selectedLocalId = '';
            selectedLocalIds.clear();
            localClipboard = null;
        }
        await loadSharedFolders();
        render();
        setStatus('已移除共享文件夹登记（不会删除磁盘文件）');
    } catch(err) {
        setStatus(err.message || '移除共享文件夹失败');
    }
}
function indexSharedTree(node){
    if(!node) return;
    localFolderMap.set(node.id, node);
    (node.items || []).forEach(item => localItemMap.set(item.id, item));
    (node.children || []).forEach(child => indexSharedTree(child));
}
async function openSharedFolder(folderId){
    if(!folderId) return;
    try {
        setStatus('正在读取共享文件夹...');
        const data = await apiJson(`/api/shared-folders/${encodeURIComponent(folderId)}/tree`);
        const tree = data.tree;
        localFolders = tree ? [tree] : [];
        localFolderMap = new Map();
        localItemMap = new Map();
        if(tree) indexSharedTree(tree);
        activeSharedFolderId = folderId;
        activeSharedFolderName = data.folder?.name || tree?.name || '共享文件夹';
        activeLocalFolderId = tree?.id || '';
        selectedLocalId = '';
        selectedLocalIds.clear();
        localClipboard = null;
        normalizeLocalState();
        render();
        setStatus(`已读取「${activeSharedFolderName}」`);
    } catch(err) {
        setStatus(err.message || '读取共享文件夹失败');
    }
}
function currentAssetItems(){
    return cachedManagerItems('assets',assetLibrary,assetViewKey(),computeAssetItems);
}
function computeAssetItems(){
    const query = assetQuery.trim().toLowerCase();
    return (activeAssetCategory()?.items || []).filter(item => {
        if(!query) return true;
        return [item.name, item.url, assetKindLabel(item)].join(' ').toLowerCase().includes(query);
    });
}
function currentWorkflowItems(){
    return cachedManagerItems('workflows',assetLibrary,JSON.stringify([activeWorkflowLibraryId,activeWorkflowCategoryId,workflowQuery]),computeWorkflowItems);
}
function computeWorkflowItems(){
    const query = workflowQuery.trim().toLowerCase();
    return (activeWorkflowCategory()?.items || []).filter(item => {
        if(!query) return true;
        return [item.name, item.url, workflowKindLabel(item)].join(' ').toLowerCase().includes(query);
    });
}
function canvasAssetCategories(){
    const cats = Array.isArray(canvasAssetsData.categories) && canvasAssetsData.categories.length
        ? canvasAssetsData.categories.filter(cat => ['smart','classic'].includes(cat.id))
        : [
            {id:'smart', name:'智能画布', count:(canvasAssetsData.items || []).filter(item => item.canvas_kind === 'smart').length, canvas_count:(canvasAssetsData.canvases || []).filter(item => item.kind === 'smart').length},
            {id:'classic', name:'普通画布', count:(canvasAssetsData.items || []).filter(item => item.canvas_kind !== 'smart').length, canvas_count:(canvasAssetsData.canvases || []).filter(item => item.kind !== 'smart').length}
        ];
    return cats;
}
function activeCanvasAssetCategoryInfo(){
    return canvasAssetCategories().find(cat => cat.id === activeCanvasAssetCategory) || canvasAssetCategories()[0] || {id:'smart', name:'智能画布', count:0, canvas_count:0};
}
function defaultCanvasAssetCategory(){
    const cats = canvasAssetCategories();
    return cats.find(cat => Number(cat.count || 0) > 0)?.id || cats[0]?.id || 'smart';
}
function uniqueCanvasAssets(items){
    const seen = new Set();
    const result = [];
    (items || []).forEach(item => {
        const key = `${item.canvas_id || ''}::${item.url || ''}`;
        if(!item?.url || seen.has(key)) return;
        seen.add(key);
        result.push(item);
    });
    return result;
}
function canvasAssetCountForCanvas(canvasId){
    if(canvasAssetsData.limit) return Number(canvasAssetsData.canvases?.find(c => c.id === canvasId)?.asset_count || 0);
    return uniqueCanvasAssets(canvasAssetsData.items || []).filter(item => item.canvas_id === canvasId).length;
}
function canvasAssetsForCategory(categoryId=activeCanvasAssetCategory){
    let list = Array.isArray(canvasAssetsData.canvases) ? canvasAssetsData.canvases.slice() : [];
    list = list.filter(canvas => (canvas.kind || 'classic') === categoryId);
    return list.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hans-CN', {numeric:true, sensitivity:'base'}));
}
function activeCanvasAssetCanvas(){
    if(!activeCanvasAssetCanvasId) return null;
    return (canvasAssetsData.canvases || []).find(canvas => canvas.id === activeCanvasAssetCanvasId) || null;
}
function canvasAssetViewTitle(){
    return activeCanvasAssetCanvas()?.title || activeCanvasAssetCategoryInfo().name || '画布资产';
}
function canvasAssetViewSubtitle(items){
    const count = canvasAssetsData.limit ? Number(canvasAssetsData.total || 0) : items.length;
    const canvas = activeCanvasAssetCanvas();
    if(canvas) return `${canvasKindLabel(canvas.kind)} / ${canvasSourceStateLabel(canvas.asset_source_state)} / ${count} 个资产 / ${escapeHtml(canvasAssetSortLabel())}`;
    const activeCat = activeCanvasAssetCategoryInfo();
    return `${Number(activeCat.canvas_count || 0)} 个画布 / ${count} 个资产 / ${escapeHtml(canvasAssetSortLabel())}`;
}
function canvasAssetKindLabel(item){
    const kind = assetKind(item);
    if(kind === 'video') return '视频';
    if(kind === 'audio') return '音频';
    if(String(item?.kind || '').toLowerCase() === 'text') return '文本';
    return '图片';
}
function canvasKindLabel(kind){
    return kind === 'smart' ? '智能画布' : '普通画布';
}
function canvasAssetSortLabel(){
    const map = {canvas_asc:'画布名称', updated_desc:'最近更新', updated_asc:'最早更新', name_asc:'名称 A-Z', kind:'类型'};
    return map[canvasAssetSort] || map.canvas_asc;
}
function currentCanvasAssetItems(){
    return cachedManagerItems('canvas-assets',canvasAssetsData,JSON.stringify([activeCanvasAssetCategory,activeCanvasAssetCanvasId,canvasAssetQuery,canvasAssetSort]),computeCanvasAssetItems);
}
let canvasAssetTrashMode = false;
let canvasAssetSourceState = 'active';
function canvasSourceStateLabel(state){ return state === 'purged' ? '来源画布已清理' : state === 'deleted' ? '画布已回收' : '使用中'; }
function computeCanvasAssetItems(){
    if(canvasAssetsData.limit) return canvasAssetsData.items || [];
    const q = String(canvasAssetQuery || '').trim().toLowerCase();
    let list = uniqueCanvasAssets(canvasAssetsData.items || []).filter(item => {
        if((item.canvas_kind || 'classic') !== activeCanvasAssetCategory) return false;
        if(activeCanvasAssetCanvasId && item.canvas_id !== activeCanvasAssetCanvasId) return false;
        if(!q) return true;
        return [
            item.name,
            item.url,
            item.canvas_title,
            item.node_title,
            item.node_type, item.category, ...(item.tags || []),
            canvasAssetKindLabel(item),
            canvasKindLabel(item.canvas_kind)
        ].join(' ').toLowerCase().includes(q);
    });
    list = list.slice();
    const byTime = item => Number(item.canvas_updated_at || item.created_at || 0);
    const byCanvasName = (a, b) => String(a.canvas_title || '').localeCompare(String(b.canvas_title || ''), 'zh-Hans-CN', {numeric:true, sensitivity:'base'})
        || String(a.canvas_id || '').localeCompare(String(b.canvas_id || ''), 'zh-Hans-CN')
        || byTime(b) - byTime(a);
    if(canvasAssetSort === 'canvas_asc') list.sort(byCanvasName);
    else if(canvasAssetSort === 'updated_asc') list.sort((a, b) => byTime(a) - byTime(b));
    else if(canvasAssetSort === 'name_asc') list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN', {numeric:true, sensitivity:'base'}));
    else if(canvasAssetSort === 'kind') list.sort((a, b) => canvasAssetKindLabel(a).localeCompare(canvasAssetKindLabel(b), 'zh-Hans-CN') || byTime(b) - byTime(a));
    else list.sort((a, b) => byTime(b) - byTime(a));
    return list;
}
function groupCanvasAssetItems(items){
    if(canvasAssetSort !== 'canvas_asc') return [{key:'__all__', title:'', subtitle:'', items}];
    const groups = [];
    const map = new Map();
    (items || []).forEach(item => {
        const key = item.canvas_id || item.canvas_title || '__unknown__';
        if(!map.has(key)){
            const group = {
                key,
                title:item.canvas_title || '未命名画布',
                subtitle:`${canvasKindLabel(item.canvas_kind)} / ${formatDate(item.canvas_updated_at || item.created_at)}`,
                items:[]
            };
            map.set(key, group);
            groups.push(group);
        }
        map.get(key).items.push(item);
    });
    return groups;
}
function assetMoveTargets(){
    const currentKey = `${activeAssetLibraryId}::${activeAssetCategoryId}`;
    const targets = [];
    assetLibraries().forEach(lib => {
        (lib.categories || []).filter(cat => (cat.type || 'image') === 'image').forEach(cat => {
            const key = `${lib.id}::${cat.id}`;
            if(key !== currentKey) targets.push({key, libraryId:lib.id, categoryId:cat.id, label:`${lib.name || '资产库'} / ${cat.name || '分组'}`});
        });
    });
    return targets;
}
function normalizeAssetMoveTarget(){
    const targets = assetMoveTargets();
    if(!targets.some(item => item.key === assetMoveTarget)) assetMoveTarget = targets[0]?.key || '';
    return targets;
}
function currentPromptItems(){
    return cachedManagerItems('prompts',promptLibrary,JSON.stringify([activePromptLibraryId,activePromptCategory,promptQuery]),computePromptItems);
}
function computePromptItems(){
    const lib = activePromptLibrary();
    const query = promptQuery.trim().toLowerCase();
    return (lib?.items || []).filter(item => {
        if(activePromptCategory !== 'all' && (item.category || 'custom') !== activePromptCategory) return false;
        if(!query) return true;
        return [item.name, item.scene, item.positive, item.negative, item.category].join(' ').toLowerCase().includes(query);
    });
}
// 当前素材库开放的认证平台
const AVATAR_SUPPORTED_PLATFORMS = ['volcengine'];
const AVATAR_PLATFORM_LABELS = {apimart:'APIMart', volcengine:'火山引擎'};
function providerAvatarPlatform(p){
    if(p?.avatar_registration) return String(p.avatar_registration.platform || '');
    const proto = String(p?.protocol || '').toLowerCase();
    const base = String(p?.base_url || '').toLowerCase();
    if(proto === 'apimart' || base.includes('apimart.ai')) return 'apimart';
    if(proto === 'volcengine') return 'volcengine';
    return '';
}
function providerAvatarSupported(p){
    if(p?.avatar_registration) return p.avatar_registration.supported === true && AVATAR_SUPPORTED_PLATFORMS.includes(providerAvatarPlatform(p));
    return AVATAR_SUPPORTED_PLATFORMS.includes(providerAvatarPlatform(p));
}
function providerAvatarCredentialMessage(p){
    const volcengine = providerAvatarPlatform(p) === 'volcengine';
    const missing = p?.avatar_registration
        ? p.avatar_registration.credentials_configured !== true
        : volcengine ? p?.has_volcengine_access_key === false || p?.has_volcengine_secret_key === false : p?.has_key === false;
    if(!missing) return '';
    return volcengine
        ? '该平台尚未配齐资产认证所需的 AK/SK，请在 API 平台管理中填写 Access Key ID 和 Secret Access Key。'
        : '该平台尚未配置 API Key，请在 API 平台管理中填写。';
}
function avatarPlatformLabel(platform){
    return AVATAR_PLATFORM_LABELS[String(platform || '')] || String(platform || '平台');
}
// 素材认证仅提供火山引擎；其他供应商仍可用于普通生成。
function avatarCandidateProviders(){
    return (apiProviders || []).filter(p => p && p.enabled !== false && providerAvatarPlatform(p) === 'volcengine');
}
function activeAvatarProvider(){
    const list = avatarCandidateProviders();
    if(!list.length) return null;
    return list.find(p => p.id === avatarRegisterProvider)
        || list.find(p => providerAvatarSupported(p))
        || list[0];
}
function avatarProviderOptionLabel(p){
    const name = p.name || p.id;
    const platform = providerAvatarPlatform(p);
    if(!platform) return `${name}（暂不支持，待接入）`;
    if(!providerAvatarSupported(p)) return `${name}（${avatarPlatformLabel(platform)}·待接入）`;
    return `${name}（${avatarPlatformLabel(platform)}）`;
}
// 找出某平台当前可用的 provider_id（优先注册时记录的，其次同平台任一启用 provider）
function avatarProviderIdForPlatform(platform, preferredId=''){
    const list = avatarCandidateProviders();
    if(preferredId && list.some(p => p.id === preferredId)) return preferredId;
    const match = list.find(p => providerAvatarPlatform(p) === platform);
    return match ? match.id : '';
}
function findAssetItem(id){
    for(const lib of assetLibraries()) for(const cat of lib.categories || []) for(const item of cat.items || []) if(item.id === id) return item;
    return null;
}
function findWorkflowItem(id){
    for(const lib of assetLibraries()) for(const cat of lib.categories || []) {
        if((cat.type || '') !== 'workflow') continue;
        for(const item of cat.items || []) if(item.id === id) return item;
    }
    return null;
}
function findPromptItem(id){
    for(const lib of promptLibraries()) for(const item of lib.items || []) if(item.id === id) return item;
    return null;
}
function findCanvasAssetItem(id){
    return (canvasAssetsData.items || []).find(item => item.id === id) || null;
}
function selectedAsset(){
    const items = currentAssetItems();
    return items.find(item => item.id === selectedAssetId) || items[0] || null;
}
function selectedWorkflow(){
    const items = currentWorkflowItems();
    return items.find(item => item.id === selectedWorkflowId) || items[0] || null;
}
function selectedPrompt(){
    const items = currentPromptItems();
    return items.find(item => item.id === selectedPromptId) || items[0] || null;
}
function selectedCanvasAsset(){
    const items = currentCanvasAssetItems();
    return items.find(item => item.id === selectedCanvasAssetId) || items[0] || null;
}
function normalizeAssetState(){
    const libs = assetLibraries();
    if(!activeAssetLibraryId || !libs.some(lib => lib.id === activeAssetLibraryId)) activeAssetLibraryId = assetLibrary.active_library_id || libs[0]?.id || '';
    const cats = assetCategories();
    if(!activeAssetCategoryId || !cats.some(cat => cat.id === activeAssetCategoryId)) activeAssetCategoryId = cats[0]?.id || '';
    const items = currentAssetItems();
    if(selectedAssetId && !items.some(item => item.id === selectedAssetId)) selectedAssetId = '';
    if(!selectedAssetId && items.length) selectedAssetId = items[0].id;
    selectedAssetIds = new Set([...selectedAssetIds].filter(id => findAssetItem(id)));
}
function normalizeWorkflowState(){
    const libs = assetLibraries();
    if(!activeWorkflowLibraryId || !libs.some(lib => lib.id === activeWorkflowLibraryId)) activeWorkflowLibraryId = assetLibrary.active_library_id || libs[0]?.id || '';
    const cats = workflowCategories();
    if(
        !activeWorkflowCategoryId
        || !cats.some(cat => cat.id === activeWorkflowCategoryId && cat.__libraryId === activeWorkflowLibraryId)
    ){
        activeWorkflowCategoryId = cats[0]?.id || '';
        activeWorkflowLibraryId = cats[0]?.__libraryId || activeWorkflowLibraryId;
    }
    const activeCat = cats.find(cat => cat.id === activeWorkflowCategoryId && cat.__libraryId === activeWorkflowLibraryId) || null;
    if(activeCat?.__libraryId) activeWorkflowLibraryId = activeCat.__libraryId;
    const items = currentWorkflowItems();
    if(selectedWorkflowId && !items.some(item => item.id === selectedWorkflowId)) selectedWorkflowId = '';
    if(!selectedWorkflowId && items.length) selectedWorkflowId = items[0].id;
    selectedWorkflowIds = new Set([...selectedWorkflowIds].filter(id => findWorkflowItem(id)));
}
function normalizePromptState(){
    const libs = promptLibraries();
    if(!activePromptLibraryId || !libs.some(lib => lib.id === activePromptLibraryId)) activePromptLibraryId = promptLibrary.active_library_id || libs[0]?.id || '';
    const cats = activePromptCategories();
    if(activePromptCategory !== 'all' && !cats.some(cat => cat.id === activePromptCategory)) activePromptCategory = 'all';
    const items = currentPromptItems();
    if(selectedPromptId && !items.some(item => item.id === selectedPromptId)) selectedPromptId = '';
    if(!selectedPromptId && items.length) selectedPromptId = items[0].id;
    selectedPromptIds = new Set([...selectedPromptIds].filter(id => findPromptItem(id)));
}
function normalizeCanvasAssetState(){
    const cats = canvasAssetCategories();
    if(!cats.some(cat => cat.id === activeCanvasAssetCategory)) activeCanvasAssetCategory = defaultCanvasAssetCategory();
    const activeCanvas = activeCanvasAssetCanvas();
    if(
        activeCanvasAssetCanvasId
        && (
            !activeCanvas
            || (activeCanvas.kind || 'classic') !== activeCanvasAssetCategory
        )
    ) activeCanvasAssetCanvasId = '';
    const items = currentCanvasAssetItems();
    if(selectedCanvasAssetId && !items.some(item => item.id === selectedCanvasAssetId)) selectedCanvasAssetId = '';
    if(!selectedCanvasAssetId && items.length) selectedCanvasAssetId = items[0].id;
    selectedCanvasAssetIds = new Set([...selectedCanvasAssetIds].filter(id => findCanvasAssetItem(id)));
}
function applyAssetLibraryData(data, {reset=false}={}){
    assetLibrary = data?.library || {libraries:[], categories:[]};
    const validAssetLibraryIds = new Set(assetLibraries().map(lib => String(lib.id || '')).filter(Boolean));
    const restoredCollapsedIds = new Set([...collapsedAssetLibraryIds].filter(id => validAssetLibraryIds.has(id)));
    if(restoredCollapsedIds.size !== collapsedAssetLibraryIds.size){
        collapsedAssetLibraryIds = restoredCollapsedIds;
        saveCollapsedAssetLibraryIds();
    }
    if(reset){
        const libs = assetLibraries();
        const savedAssetLibrary = libs.find(lib => lib.id === assetViewSession.activeLibraryId);
        activeAssetLibraryId = (savedAssetLibrary || libs.find(lib => lib.id === 'default') || libs[0])?.id || '';
        assetQuery = typeof assetViewSession.query === 'string' ? assetViewSession.query : '';
        const savedAssetCategoryId = String(assetViewSession.activeCategoryId || '');
        activeAssetCategoryId = assetCategories().some(cat => cat.id === savedAssetCategoryId) ? savedAssetCategoryId : '';
        activeWorkflowLibraryId = (libs.find(lib => lib.id === 'default') || libs[0])?.id || '';
        activeWorkflowCategoryId = '';
        selectedAssetId = '';
        selectedWorkflowId = '';
        selectedAssetIds.clear();
        selectedWorkflowIds.clear();
        selectedPromptIds.clear();
        selectedCanvasAssetIds.clear();
    }
    assetGridKey = '';
    assetRenderedCount = 0;
    assetVirtualRangeKey = '';
}
function managerDataKey(tab){
    return tab === 'workflows' ? 'assets' : tab;
}
async function loadManagerData(tab, {refresh=false, reset=false}={}){
    const key = managerDataKey(tab);
    if(managerLoadPromises.has(key)) return managerLoadPromises.get(key);
    if(!refresh && managerDataLoaded[key]) return;
    const promise = (async () => {
        if(key === 'assets'){
            const data = await apiJson('/api/asset-library');
            applyAssetLibraryData(data, {reset});
        } else if(key === 'canvas-assets') {
            await loadCanvasAssetPage(0); // /api/canvas-assets, bounded server query
        } else if(key === 'providers') {
            const data = await apiJson('/api/providers');
            apiProviders = Array.isArray(data.providers) ? data.providers : [];
        }
        managerDataLoaded[key] = true;
    })();
    managerLoadPromises.set(key, promise);
    try {
        await promise;
    } finally {
        managerLoadPromises.delete(key);
    }
}
async function ensureProvidersLoaded(){
    await loadManagerData('providers');
    return apiProviders;
}
async function loadInitialAssetManager(){
    const token=++managerTabSwitchToken;
    showManagerLoadState('assets');
    setStatus('正在加载图片素材…');
    try {
    await loadManagerData('assets', {reset:true});
    if(token!==managerTabSwitchToken) return;
    Object.values(managerViews.tabs).forEach(restoreManagerDescriptor);
    if(['assets','workflows','canvas-assets'].includes(managerViews.activeTab)) activeTab=managerViews.activeTab;
    await loadManagerData(activeTab);
    if(token!==managerTabSwitchToken) return;
    render();
    setStatus('准备就绪');
    loadManagerData('providers').then(() => {
        if(selectedAssetId) scheduleAssetAvatarStatusRefresh(selectedAssetId);
        resumeAvatarPolls();
    }).catch(() => {});
    } catch(err){ if(token===managerTabSwitchToken){showManagerLoadState(activeTab,err.message || '请求失败');setStatus('加载失败，请重试');} }
}
async function switchManagerTab(tab){
    rememberManagerView(captureManagerView());
    clearTimeout(searchRenderTimer);
    const nextTab = ['assets','workflows','canvas-assets'].includes(tab) ? tab : 'assets';
    const token = ++managerTabSwitchToken;
    activeTab = nextTab;
    selectedAssetIds.clear();
    selectedWorkflowIds.clear();
    selectedPromptIds.clear();
    selectedLocalIds.clear();
    selectedLocalUploadIds.clear();
    selectedCanvasAssetIds.clear();
    document.querySelectorAll('[data-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === activeTab));
    const key = managerDataKey(nextTab);
    if(refreshBtn) refreshBtn.disabled=false;
    if(!managerDataLoaded[key]){setStatus(`正在加载${managerTabLabel(nextTab)}…`);showManagerLoadState(nextTab);}
    try {
        await loadManagerData(nextTab);
        if(token !== managerTabSwitchToken || activeTab !== nextTab) return;
        render(); setStatus('准备就绪');
        if(nextTab==='assets' && !managerDataLoaded.providers) loadManagerData('providers').then(()=>scheduleAssetAvatarStatusRefresh(selectedAssetId)).catch(()=>{});
    } catch(err){
        if(token!==managerTabSwitchToken || activeTab!==nextTab) return;
        showManagerLoadState(nextTab,err.message || '请求失败');setStatus(`${managerTabLabel(nextTab)}加载失败，请重试`);
    }
}
async function refreshAssetLibrary(){
    return refreshCurrentManager();
}
async function refreshCurrentManager(){
    const tab=activeTab, token=++managerTabSwitchToken;
    setStatus(`正在刷新${managerTabLabel(tab)}…`);
    if(refreshBtn) refreshBtn.disabled=true;
    try {
        await loadManagerData(tab, {refresh:true});
        if(token!==managerTabSwitchToken || tab!==activeTab) return;
        render();
        if(tab==='assets') resumeAvatarPolls();
        setStatus(`${managerTabLabel(tab)}已刷新`);
    } catch(err){
        if(token!==managerTabSwitchToken || tab!==activeTab) return;
        setStatus(`${managerTabLabel(tab)}刷新失败：${err.message || '请求失败'}，点击刷新重试`);
        if(!root.dataset.managerView) showManagerLoadState(tab,err.message || '请求失败');
    } finally { if(token===managerTabSwitchToken && refreshBtn) refreshBtn.disabled=false; }
}
function render({resetScroll=false}={}){
    cancelManagerDelete();
    managerItemCache.clear();
    managerVirtualModel=null;
    const previousView = captureManagerView();
    rememberManagerView(previousView);
    const targetView=managerViewDescriptor();
    const remembered=managerViews.views[managerViewKey(targetView)];
    if(!resetScroll && remembered && (!previousView || managerViewKey(previousView)!==managerViewKey(targetView))){
        restoreManagerDescriptor({...targetView,selectedId:remembered.selectedId});
    }
    pruneManagerSelection();
    const previousAssetView = captureAssetViewState();
    if(previousAssetView) persistAssetViewSession(previousAssetView);
    document.querySelectorAll('[data-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === activeTab));
    if(activeTab === 'workflows') renderWorkflowManager();
    else if(activeTab === 'canvas-assets') renderCanvasAssetsManager();
    else {
        renderAssetManager();
        persistAssetViewSession();
    }
    const descriptor=managerViewDescriptor();
    root.dataset.managerView=JSON.stringify(descriptor);
    let saved=managerViews.views[managerViewKey(descriptor)] || (activeTab === 'assets' ? savedAssetViewForCurrentState(previousAssetView) : null);
    if(previousView?.tab===activeTab) saved={...descriptor,...saved,navTop:previousView.navTop};
    decorateManagerNavigation();
    renderManagerVirtualWindow();
    restoreManagerView(saved,resetScroll);
    rememberManagerView();
    refreshManagerSelection();
    refreshIcons();
}
function renderCanvasAssetsManager(){
    normalizeCanvasAssetState();
    const items = currentCanvasAssetItems();
    const groups = groupCanvasAssetItems(items);
    const total = canvasAssetsData.limit ? (canvasAssetsData.categories || []).find(c => c.id === 'all')?.count || 0 : (canvasAssetsData.items || []).length;
    const detail = selectedCanvasAsset();
    root.innerHTML = `
        <aside class="asset-panel asset-nav">
            <div class="panel-head"><div class="panel-title"><strong>画布分类</strong><span>从所有画布拉取资产</span></div></div>
            <div class="nav-scroll">
                <div class="nav-tree canvas-asset-tree">
                    ${canvasAssetCategories().map(cat => renderCanvasAssetTreeBranch(cat)).join('')}
                </div>
                <div class="nav-hint">共 ${canvasAssetsData.canvases?.length || 0} 个画布，${total} 个可下载资产。</div>
            </div>
        </aside>
        <section class="asset-panel asset-content ${canvasAssetManageMode ? 'manage-on' : ''}">
            <div class="content-toolbar">
                <div class="content-heading">
                    <strong>${escapeHtml(canvasAssetViewTitle())}</strong>
                    <span>${canvasAssetViewSubtitle(items)}</span>
                </div>
                <div class="asset-tools">
                    <div class="canvas-source-filters" role="group" aria-label="来源画布状态">
                        <button type="button" class="asset-btn ${canvasAssetSourceState === 'active' ? 'primary' : ''}" data-canvas-source="active" aria-pressed="${canvasAssetSourceState === 'active'}">使用中的画布</button>
                        <button type="button" class="asset-btn ${canvasAssetSourceState === 'deleted' ? 'primary' : ''}" data-canvas-source="deleted" aria-pressed="${canvasAssetSourceState === 'deleted'}">已删除画布</button>
                        <button type="button" class="asset-btn ${canvasAssetSourceState === 'all' ? 'primary' : ''}" data-canvas-source="all" aria-pressed="${canvasAssetSourceState === 'all'}">全部画布</button>
                    </div>
                    ${canvasAssetsData.catalog_enabled ? `<button class="asset-btn ${canvasAssetTrashMode ? 'primary' : ''}" type="button" data-catalog-toggle>${canvasAssetTrashMode ? '返回资产' : '回收站 (' + Number(canvasAssetsData.trash_count || 0) + ')'}</button>` : ''}
                    <label class="asset-search-wrap"><i data-lucide="search"></i><input id="canvasAssetSearch" class="asset-search" type="search" value="${escapeAttr(canvasAssetQuery)}" placeholder="搜索画布名称或素材"></label>
                    <select id="canvasAssetSort" class="manage-select canvas-sort-select" title="排序方法">
                        <option value="canvas_asc" ${canvasAssetSort === 'canvas_asc' ? 'selected' : ''}>画布名称</option>
                        <option value="updated_desc" ${canvasAssetSort === 'updated_desc' ? 'selected' : ''}>最近更新</option>
                        <option value="updated_asc" ${canvasAssetSort === 'updated_asc' ? 'selected' : ''}>最早更新</option>
                        <option value="name_asc" ${canvasAssetSort === 'name_asc' ? 'selected' : ''}>资产名称</option>
                        <option value="kind" ${canvasAssetSort === 'kind' ? 'selected' : ''}>类型</option>
                    </select>
                    <button class="asset-btn ${canvasAssetManageMode ? 'primary' : ''}" type="button" data-canvas-asset-manage ${total ? '' : 'disabled'}><i data-lucide="list-checks"></i><span>${canvasAssetManageMode ? '完成管理' : '批量管理'}</span></button>
                </div>
            </div>
            <div class="manage-tools">
                <span>已选择 ${selectedCanvasAssetIds.size} 个画布资产，支持拖拽框选或逐个勾选。</span>
                <div class="asset-tools">
                    <button class="asset-btn" type="button" data-canvas-asset-select-all ${items.length ? '' : 'disabled'}><i data-lucide="check-square"></i><span>本页全选</span></button>
                    <button class="asset-btn" type="button" data-canvas-asset-clear-selection ${selectedCanvasAssetIds.size ? '' : 'disabled'}><i data-lucide="square"></i><span>清空</span></button>
                    ${canvasAssetsData.can_manage ? `<button class="asset-btn" type="button" data-catalog-batch="edit">批量分类 / 标签</button><button class="asset-btn" type="button" data-catalog-batch="${canvasAssetTrashMode ? 'restore' : 'trash'}">${canvasAssetTrashMode ? '恢复所选' : '移入回收站'}</button>${canvasAssetTrashMode ? '<button class="asset-btn" type="button" data-catalog-batch="purge">批量彻底删除</button>' : ''}` : ''}
                    <button class="asset-btn primary" type="button" data-canvas-asset-download-selected ${selectedCanvasAssetIds.size ? '' : 'disabled'}><i data-lucide="download"></i><span>下载所选</span></button>
                </div>
            </div>
            <div class="content-scroll">
                ${items.length ? renderManagerVirtualGrid(groups,renderCanvasAssetCard) : managerEmptyState(canvasAssetQuery,canvasAssetTrashMode ? '当前分类的回收站为空。回收的素材可在这里恢复。' : '当前分类没有可下载的画布资产。可以切换分类，或在画布中生成、导入素材。')}
            </div>
            ${canvasAssetsData.limit ? `<nav class="content-toolbar" aria-label="素材分页">
                <button class="asset-btn" data-canvas-page="${Math.max(0,canvasAssetsData.offset-canvasAssetsData.limit)}" ${canvasAssetsData.offset ? '' : 'disabled'}>上一页</button>
                <span>第 ${Math.floor(canvasAssetsData.offset/canvasAssetsData.limit)+1} / ${Math.max(1,Math.ceil(canvasAssetsData.total/canvasAssetsData.limit))} 页 · 共 ${canvasAssetsData.total} 个</span>
                <button class="asset-btn" data-canvas-page="${canvasAssetsData.offset+canvasAssetsData.limit}" ${canvasAssetsData.has_more ? '' : 'disabled'}>下一页</button>
                <button class="asset-btn" data-canvas-page="${canvasAssetsData.offset}">刷新</button>
            </nav>` : ''}
        </section>
        <aside class="asset-panel asset-detail">
            ${renderCanvasAssetDetail(detail)}
        </aside>
    `;
}
function renderCanvasAssetTreeBranch(cat){
    const canvases = canvasAssetsForCategory(cat.id);
    const activeParent = cat.id === activeCanvasAssetCategory && !activeCanvasAssetCanvasId;
    const containsActive = cat.id === activeCanvasAssetCategory && !!activeCanvasAssetCanvasId;
    return `<div class="tree-branch ${cat.id === activeCanvasAssetCategory ? 'expanded' : ''}">
        <button class="tree-row tree-parent ${activeParent ? 'active' : ''} ${containsActive ? 'contains-active' : ''}" type="button" data-canvas-asset-cat="${escapeAttr(cat.id)}">
            <span class="tree-row-icon"><i data-lucide="${cat.id === 'smart' ? 'sparkles' : cat.id === 'classic' ? 'layout-grid' : 'layout-dashboard'}"></i></span>
            <span class="tree-row-name">${escapeHtml(cat.name || '画布')}</span>
            <span class="tree-row-count">${Number(cat.count || 0)}</span>
        </button>
        <div class="tree-children">
            ${canvases.length ? canvases.map(canvas => {
                const active = canvas.id === activeCanvasAssetCanvasId && cat.id === activeCanvasAssetCategory;
                const count = canvasAssetCountForCanvas(canvas.id);
                return `<button class="tree-row tree-child ${active ? 'active' : ''}" type="button" data-canvas-asset-canvas="${escapeAttr(canvas.id)}" data-canvas-asset-canvas-cat="${escapeAttr(cat.id)}">
                    <span class="tree-elbow"></span>
                    <span class="tree-row-icon"><i data-lucide="${canvas.kind === 'smart' ? 'sparkles' : 'layout-dashboard'}"></i></span>
                    <span class="tree-row-name" title="${escapeAttr(canvas.title || '未命名画布')}">${escapeHtml(canvas.title || '未命名画布')}${canvas.asset_source_state && canvas.asset_source_state !== 'active' ? '<small class="canvas-source-status">'+canvasSourceStateLabel(canvas.asset_source_state)+'</small>' : ''}</span>
                    <span class="tree-row-count">${count}</span>
                </button>`;
            }).join('') : '<div class="tree-empty">暂无画布</div>'}
        </div>
    </div>`;
}
function renderCanvasAssetGroup(group){
    if(!group?.title) return (group?.items || []).map(item => renderCanvasAssetCard(item)).join('');
    return `<section class="canvas-asset-group">
        <div class="canvas-asset-group-head">
            <div>
                <strong title="${escapeAttr(group.title)}">${escapeHtml(group.title)}</strong>
                <span>${escapeHtml(group.subtitle || '')}</span>
            </div>
            <small>${(group.items || []).length} 个资产</small>
        </div>
        <div class="canvas-asset-group-grid">
            ${(group.items || []).map(item => renderCanvasAssetCard(item)).join('')}
        </div>
    </section>`;
}
function renderCanvasAssetCard(item){
    return `<article class="asset-card canvas-asset-card ${item.id === selectedCanvasAssetId ? 'active' : ''}" data-canvas-asset-card="${escapeAttr(item.id)}">
        <input class="asset-card-check" type="checkbox" data-canvas-asset-check="${escapeAttr(item.id)}" ${selectedCanvasAssetIds.has(item.id) ? 'checked' : ''}>
        <div class="asset-thumb canvas-asset-thumb">${assetThumb(item)}${renderCanvasAssetKindBadge(item)}</div>
        <div class="asset-card-body">
            <div class="asset-card-name" title="${escapeAttr(item.name || '')}">${escapeHtml(item.name || 'canvas asset')}</div>
            <div class="asset-card-meta">${escapeHtml(canvasAssetKindLabel(item))} · ${escapeHtml(item.canvas_title || '未命名画布')}</div>
        </div>
    </article>`;
}
function renderCanvasAssetKindBadge(item){
    const kind = assetKind(item);
    const icon = kind === 'video' ? 'play' : kind === 'audio' ? 'file-audio' : kind === 'text' ? 'file-text' : 'image';
    return `<span class="asset-kind-badge ${escapeAttr(kind)}" title="${escapeAttr(canvasAssetKindLabel(item))}"><i data-lucide="${icon}"></i></span>`;
}
let canvasAssetRequest = null;
let canvasAssetRequestToken = 0;
function canvasAssetPageUrl(offset=0){
    return '/api/canvas-assets?' + new URLSearchParams({trash:canvasAssetTrashMode,source_state:canvasAssetSourceState,
        category:activeCanvasAssetCategory,canvas_id:activeCanvasAssetCanvasId,query:canvasAssetQuery,
        sort:canvasAssetSort,offset,limit:60});
}
async function loadCanvasAssetPage(offset=0){
    canvasAssetRequest?.abort();
    const controller = new AbortController();
    canvasAssetRequest = controller;
    const token = ++canvasAssetRequestToken, url = canvasAssetPageUrl(offset);
    let timedOut = false;
    const timeout = setTimeout(() => {timedOut=true;controller.abort();},20000);
    try {
        const data = await apiJson(url,{signal:controller.signal});
        if(token !== canvasAssetRequestToken || url !== canvasAssetPageUrl(offset)) return false;
        if(timedOut) throw new Error('请求超时');
        if(controller.signal.aborted) return false;
        canvasAssetsData = {...data,items:data.items || [],canvases:data.canvases || [],categories:data.categories || []};
        if(activeCanvasAssetCanvasId && !canvasAssetsData.canvases.some(c => c.id === activeCanvasAssetCanvasId)){
            activeCanvasAssetCanvasId='';
            return loadCanvasAssetPage(0);
        }
        return true;
    } catch(err){
        if(token !== canvasAssetRequestToken || url !== canvasAssetPageUrl(offset)) return false;
        if(timedOut) throw new Error('请求超时');
        if(controller.signal.aborted) return false;
        throw err;
    } finally {clearTimeout(timeout);}
}
async function reloadCanvasCatalog(offset=0){
    clearTimeout(searchRenderTimer);
    selectedCanvasAssetIds.clear();selectedCanvasAssetId='';
    root.querySelectorAll('.content-scroll,.asset-detail,.manage-tools').forEach(el => el.inert=true);
    setStatus('正在加载画布素材…');
    try {
        if(!await loadCanvasAssetPage(offset)) return;
        if(canvasAssetsData.offset && !canvasAssetsData.items.length && canvasAssetsData.total){
            return reloadCanvasCatalog(Math.floor((canvasAssetsData.total-1)/60)*60);
        }
        if(activeTab !== 'canvas-assets') return;
        const focus = document.activeElement?.id === 'canvasAssetSearch';
        const position = document.activeElement?.selectionStart;
        render({resetScroll:true});
        if(focus){ const input=document.getElementById('canvasAssetSearch');input?.focus();input?.setSelectionRange?.(position,position); }
        setStatus('准备就绪');
    } catch(err){
        if(activeTab !== 'canvas-assets') return;
        canvasAssetsData={...canvasAssetsData,items:[],total:0,offset:0,limit:60,has_more:false};
        render();setStatus('加载失败：'+err.message+'，请点击刷新重试');
    }
}
function canvasCatalogMutationMessage(action, result){
    if(action !== 'purge') return '素材整理已保存';
    const parts = [`已完成彻底删除 ${result.changed || 0} 项`];
    if(result.pending?.length) parts.push(`正式文件已删除，暂存清理待完成 ${result.pending.length} 项`);
    if(result.failures?.length) parts.push(`文件清理失败 ${result.failures.length} 项：${result.failures[0].message}`);
    return parts.join('；');
}
async function openCanvasCatalog(action,ids){
    const unique=new Map();
    ids.map(findCanvasAssetItem).filter(Boolean).forEach(i=>{if(i.asset_key)unique.set(i.asset_key,i);});
    const items=[...unique.values()];
    if(!items.length){setStatus('请先选择素材');return;}
    if(items.length>200){setStatus('每次最多操作 200 个素材');return;}
    const references=[];
    if(action==='references' || action==='trash'){
        const r=await apiJson('/api/canvas-assets/references',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keys:items.map(i=>i.asset_key)})});
        references.push(...r.references);
    }
    const dialog=document.createElement('dialog');dialog.className='catalog-dialog';
    const form=document.createElement('form');const title=document.createElement('h2');title.textContent={references:'素材引用',edit:'编辑素材信息',trash:'移入素材回收站',restore:'恢复素材',purge:'彻底删除'}[action];form.append(title);
    const note=document.createElement('p');note.textContent=action==='edit' ? '修改当前空间中该素材的展示信息，不更改画布节点或原文件。批量编辑会统一设置所选素材的分类和标签。' : action==='trash' ? '从资产列表移入回收站，可随时恢复。画布中的引用和原文件继续保留，不会立即释放存储空间。' : action==='purge' ? '将永久删除所选素材及其派生预览文件，操作无法恢复。上传暂存须等待凭证和安全宽限期结束后清理，待完成项会保留在回收站。仍被画布、素材库、任务或备份引用的素材会被阻止删除。' : action==='restore' ? '将所选素材恢复到资产列表。' : '以下为当前空间的画布节点引用，包含回收站内的画布；不代表全部历史任务和备份引用。';form.append(note);
    let permanentConfirmed=false;
    if(action==='purge'){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.required=true;input.onchange=()=>{permanentConfirmed=input.checked;};label.append(input,document.createTextNode('我确认永久删除所选 '+items.length+' 个素材，删除后无法恢复'));form.append(label);}
    const fields={};
    if(action==='edit'){
        const definitions=items.length===1 ? [['name','素材名称',items[0].name],['category','分类',items[0].category || ''],['tags','标签（用逗号分隔）',(items[0].tags || []).join(', ')]] : [['category','分类',''],['tags','标签（用逗号分隔）','']];
        for(const [name,label,value] of definitions){const l=document.createElement('label'),input=document.createElement('input');l.textContent=label;input.value=value;input.required=name==='name';input.maxLength=name==='name' ? 240 : name==='category' ? 80 : 820;l.append(input);form.append(l);fields[name]=input;}
    }
    if(action==='references' || action==='trash'){
        const summary=document.createElement('p');summary.textContent='涉及 '+new Set(references.map(r=>r.canvas_id)).size+' 个画布，'+references.length+' 个节点';form.append(summary);
        const list=document.createElement('ul');list.className='catalog-references';for(const r of references){const li=document.createElement('li');li.textContent=r.canvas_title+' / '+r.node_title+(r.canvas_trashed ? '（画布已回收）':'');list.append(li);}form.append(list);
    }
    const error=document.createElement('p');error.setAttribute('role','alert');error.className='catalog-error';form.append(error);
    const footer=document.createElement('div');footer.className='catalog-detail-actions';const cancel=document.createElement('button');cancel.className='asset-btn';cancel.type='button';cancel.textContent=action==='references' ? '关闭':'取消';cancel.onclick=()=>dialog.close();footer.append(cancel);
    if(action!=='references'){const submit=document.createElement('button');submit.type='submit';submit.className='asset-btn primary';submit.textContent={edit:'保存信息',trash:'移入回收站',restore:'恢复素材',purge:'彻底删除'}[action];footer.append(submit);form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;error.textContent='';try{const metadata={};for(const [name,input] of Object.entries(fields))metadata[name]=name==='tags' ? input.value.split(/[,，]/).map(t=>t.trim()).filter(Boolean) : input.value;const result=await apiJson('/api/canvas-assets/catalog',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,confirm_permanent:action==='purge' && permanentConfirmed,items:items.map(i=>({key:i.asset_key,version:i.catalog_version})),metadata})});await reloadCanvasCatalog();const message=canvasCatalogMutationMessage(action,result);if(result.failures?.length || result.pending?.length){error.textContent=message;setStatus(message);}else{dialog.close();setStatus(message);}}catch(e){error.textContent=e.message;}finally{submit.disabled=false;}};}else form.onsubmit=e=>e.preventDefault();
    form.append(footer);dialog.append(form);dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
}
function renderCanvasAssetDetail(item){
    if(!item) return `<div class="panel-head"><div class="panel-title"><strong>画布资产详情</strong><span>选择一个画布资产查看详情</span></div></div><div class="detail-scroll"><div class="detail-empty"><i data-lucide="layout-dashboard"></i><span>暂无画布资产</span></div></div>`;
    const kind = assetKind(item);
    const canPreview = ['image','video'].includes(kind);
    return `
        <div class="panel-head">
            <div class="panel-title"><strong>画布资产详情</strong><span>${escapeHtml(canvasAssetKindLabel(item))}</span></div>
            <div class="panel-actions">
                ${canPreview ? `<button class="asset-icon-btn" type="button" data-canvas-asset-preview="${escapeAttr(item.id)}" title="${kind === 'video' ? '预览视频' : '放大预览'}"><i data-lucide="${kind === 'video' ? 'play' : 'maximize-2'}"></i></button>` : ''}
                <button class="asset-icon-btn" type="button" data-canvas-asset-open="${escapeAttr(item.id)}" title="打开链接"><i data-lucide="external-link"></i></button>
                <button class="asset-icon-btn" type="button" data-canvas-asset-copy="${escapeAttr(item.id)}" title="复制链接"><i data-lucide="copy"></i></button>
                <button class="asset-btn primary" type="button" data-canvas-asset-download="${escapeAttr(item.id)}"><i data-lucide="download"></i><span>下载</span></button>
            </div>
        </div>
        <div class="detail-scroll">
            ${kind === 'audio' ? assetAudioDetailHtml(item,'canvas-asset') : `<div class="detail-media">
                ${canPreview
                    ? `<button class="detail-media-frame detail-media-zoomable" type="button" data-canvas-asset-preview="${escapeAttr(item.id)}" title="${kind === 'video' ? '点击预览视频' : '点击放大预览'}">${assetThumb(item)}</button>`
                    : `<div class="detail-media-frame">${assetThumb(item)}</div>`}
            </div>`}
            <div class="detail-body">
                <div class="detail-name">${escapeHtml(item.name || '画布资产')}</div>
                ${canvasAssetsData.catalog_enabled ? `<div class="catalog-detail-actions">${item.staging_pending ? `<p role="status">${escapeHtml(item.storage_status)}${item.cleanup_failed ? '（上次清理失败，可重试）' : ''}</p>` : ''}<button class="asset-btn" data-catalog-action="references" data-catalog-id="${escapeAttr(item.id)}">查看引用</button>${canvasAssetsData.can_manage ? `<button class="asset-btn" data-catalog-action="edit" ${item.staging_pending ? 'disabled' : ''} data-catalog-id="${escapeAttr(item.id)}">编辑信息</button><button class="asset-btn" data-catalog-action="${item.trashed ? 'restore' : 'trash'}" ${item.staging_pending ? 'disabled' : ''} data-catalog-id="${escapeAttr(item.id)}">${item.trashed ? '恢复素材' : '移入回收站'}</button>${item.trashed ? `<button class="asset-btn" data-catalog-action="purge" data-catalog-id="${escapeAttr(item.id)}">${item.deleting ? '重试彻底删除' : '彻底删除'}</button>` : ''}` : ''}</div><p>${escapeHtml(item.category || '未分类')} · ${escapeHtml((item.tags || []).join('、') || '无标签')}</p>` : ''}
                <div class="detail-meta-grid">
                    <div class="detail-meta"><span>类型</span><strong>${escapeHtml(canvasAssetKindLabel(item))}</strong></div>
                    <div class="detail-meta"><span>画布分类</span><strong>${escapeHtml(canvasKindLabel(item.canvas_kind))}</strong></div>
                    <div class="detail-meta"><span>来源状态</span><strong>${escapeHtml(canvasSourceStateLabel(item.canvas_state))}</strong></div>
                    <div class="detail-meta"><span>来源画布</span><strong title="${escapeAttr(item.canvas_title || '')}">${escapeHtml(item.canvas_title || '未命名画布')}</strong></div>
                    <div class="detail-meta"><span>更新时间</span><strong>${escapeHtml(formatDate(item.canvas_updated_at || item.created_at))}</strong></div>
                    <div class="detail-meta"><span>来源节点</span><strong title="${escapeAttr(item.node_title || item.node_type || '')}">${escapeHtml(item.node_title || item.node_type || '节点')}</strong></div>
                    <div class="detail-meta"><span>节点类型</span><strong>${escapeHtml(item.node_type || '-')}</strong></div>
                </div>
                <div class="detail-url">${escapeHtml(item.url || '')}</div>
            </div>
        </div>
    `;
}
function refreshCanvasAssetSelectionOnly({detail=true}={}){
    document.querySelectorAll('[data-canvas-asset-card]').forEach(card => {
        card.classList.toggle('active', card.dataset.canvasAssetCard === selectedCanvasAssetId);
    });
    document.querySelectorAll('[data-canvas-asset-check]').forEach(input => {
        input.checked = selectedCanvasAssetIds.has(input.dataset.canvasAssetCheck);
    });
    const tools = root.querySelector('.asset-content .manage-tools');
    const count = selectedCanvasAssetIds.size;
    const summary = tools?.querySelector(':scope > span');
    if(summary) summary.textContent = `已选择 ${count} 个画布资产，支持拖拽框选或逐个勾选。`;
    for(const selector of ['[data-canvas-asset-clear-selection]', '[data-canvas-asset-download-selected]']){
        const button = tools?.querySelector(selector);
        if(button) button.disabled = !count;
    }
    const panel = detail && root.querySelector('.asset-detail');
    if(panel){
        panel.innerHTML = renderCanvasAssetDetail(selectedCanvasAsset());
        refreshIcons();
    }
}
function renderHeadTreeInlineEdit(edit, inputId, saveAttr, cancelAttr){
    if(!edit || edit.placement !== 'head') return '';
    const label = edit.label || '名称';
    return `<div class="head-inline-edit">
        <input id="${escapeAttr(inputId)}" type="text" value="${escapeAttr(edit.value || '')}" placeholder="${escapeAttr(label)}">
        <button type="button" class="primary" ${saveAttr} title="保存"><i data-lucide="check"></i><span>保存</span></button>
        <button type="button" ${cancelAttr} title="取消"><i data-lucide="x"></i><span>取消</span></button>
    </div>`;
}
function focusTreeEditInput(id){
    requestAnimationFrame(() => {
        const input = document.getElementById(id);
        input?.focus();
        input?.select?.();
    });
}
function localUploadItems(){
    return cachedManagerItems('local',localAssets,JSON.stringify([activeLocalUploadFolder,localUploadQuery]),computeLocalUploadItems);
}
function computeLocalUploadItems(){
    const q = String(localUploadQuery || '').trim().toLowerCase();
    let list = Array.isArray(localAssets) ? localAssets.slice() : [];
    if(activeLocalUploadFolder) list = list.filter(it => String(it.folder || '') === activeLocalUploadFolder);
    if(q) list = list.filter(it => [it.name, it.file, assetKindLabel(it)].join(' ').toLowerCase().includes(q));
    return list;
}
function findLocalUpload(id){
    return (localAssets || []).find(it => it.id === id) || null;
}
function localUploadFolderExists(path=''){
    const target = String(path || '');
    let found = !target;
    function walk(node){
        if(!node || found) return;
        if(String(node.path || '') === target){ found = true; return; }
        (node.children || []).forEach(walk);
    }
    walk(localUploadTree);
    return found;
}
function localUploadFolderByPath(path=''){
    const target = String(path || '');
    let match = null;
    function walk(node){
        if(!node || match) return;
        if(String(node.path || '') === target){ match = node; return; }
        (node.children || []).forEach(walk);
    }
    walk(localUploadTree);
    return match;
}
function localUploadFolderTitle(){
    if(!activeLocalUploadFolder) return '本地上传';
    return localUploadFolderByPath(activeLocalUploadFolder)?.name || activeLocalUploadFolder.split('/').pop() || '本地上传';
}
function renderLocalUploadFolderBranch(folder, depth=0){
    if(!folder) return '';
    const path = folder.path || '';
    const active = path === activeLocalUploadFolder;
    const contains = !active && (folder.children || []).some(child => localUploadFolderContainsActive(child));
    return `<div class="tree-branch">
        <button class="tree-row ${depth ? 'tree-child' : 'tree-parent'} ${active ? 'active' : ''} ${contains ? 'contains-active' : ''}" type="button" data-localup-folder="${escapeAttr(path)}">
            ${depth ? '<span class="tree-elbow"></span>' : ''}
            <span class="tree-row-icon"><i data-lucide="${active ? 'folder-open' : (depth ? 'folder' : 'upload-cloud')}"></i></span>
            <span class="tree-row-name">${escapeHtml(folder.name || '文件夹')}</span>
            <span class="tree-row-count">${Number(folder.count || 0)}</span>
        </button>
        ${(folder.children || []).length ? `<div class="tree-children">${folder.children.map(child => renderLocalUploadFolderBranch(child, depth + 1)).join('')}</div>` : ''}
    </div>`;
}
function localUploadFolderContainsActive(folder){
    if(!folder) return false;
    if(String(folder.path || '') === activeLocalUploadFolder) return true;
    return (folder.children || []).some(child => localUploadFolderContainsActive(child));
}
function selectedLocalUploadImageItems(){
    return [...selectedLocalUploadIds].map(id => findLocalUpload(id)).filter(item => item && assetKind(item) === 'image');
}
function renderLocalManager(){
    normalizeLocalCaptionSettings();
    const items = localUploadItems();
    if(selectedLocalUploadId && !items.some(item => item.id === selectedLocalUploadId)) selectedLocalUploadId = '';
    if(!selectedLocalUploadId && items.length) selectedLocalUploadId = items[0].id;
    const detail = findLocalUpload(selectedLocalUploadId);
    const total = (localAssets || []).length;
    const imageCount = selectedLocalUploadImageItems().length;
    const folderTitle = localUploadFolderTitle();
    root.innerHTML = `
        <aside class="asset-panel asset-nav">
            <div class="panel-head">
                <div class="panel-title"><strong>本地上传</strong><span>批量上传到 assets/uploads</span></div>
                <div class="panel-actions compact-actions">
                    <button class="asset-icon-btn" type="button" data-localup-folder-new title="新建文件夹"><i data-lucide="folder-plus"></i></button>
                    <button class="asset-icon-btn" type="button" data-localup-folder-rename title="重命名文件夹" ${activeLocalUploadFolder ? '' : 'disabled'}><i data-lucide="pencil"></i></button>
                </div>
            </div>
            <div class="nav-scroll">
                <div class="nav-tree">
                    ${renderLocalUploadFolderBranch(localUploadTree || {path:'', name:'全部上传', count:total, children:[]})}
                </div>
                <div class="nav-hint" style="padding:10px 12px;font-size:12px;opacity:.7;">选择图片/视频/音频文件即可上传，文件保存在项目 assets/uploads 目录。</div>
            </div>
        </aside>
        <section class="asset-panel asset-content ${localUploadManageMode ? 'manage-on' : ''}">
            <div class="content-toolbar">
                <div class="content-heading">
                    <strong>${escapeHtml(folderTitle)}</strong>
                    <span>${items.length} / ${total} 个素材</span>
                </div>
                <div class="asset-tools">
                    <label class="asset-search-wrap"><i data-lucide="search"></i><input id="localUploadSearch" class="asset-search" type="search" value="${escapeAttr(localUploadQuery)}" placeholder="搜索本地上传"></label>
                    <button class="asset-btn primary" type="button" data-localup-upload><i data-lucide="upload"></i><span>上传文件</span></button>
                    <button class="asset-btn ${localUploadManageMode ? 'primary' : ''}" type="button" data-localup-manage ${total ? '' : 'disabled'}><i data-lucide="list-checks"></i><span>${localUploadManageMode ? '完成管理' : '批量管理'}</span></button>
                </div>
            </div>
            <div class="manage-tools local-manage-tools">
                <span>已选择 ${selectedLocalUploadIds.size} 个素材，其中 ${imageCount} 张图片。</span>
                <div class="asset-tools local-manage-actions">
                    <button class="asset-btn" type="button" data-localup-select-all ${items.length ? '' : 'disabled'}><i data-lucide="check-square"></i><span>全选</span></button>
                    <button class="asset-btn" type="button" data-localup-clear ${selectedLocalUploadIds.size ? '' : 'disabled'}><i data-lucide="square"></i><span>清空</span></button>
                    <button class="asset-btn danger" type="button" data-localup-delete-selected ${selectedLocalUploadIds.size ? '' : 'disabled'}><i data-lucide="trash-2"></i><span>删除</span></button>
                    ${renderLocalCaptionTools(imageCount)}
                </div>
            </div>
            <div class="content-scroll">
                ${renderManagerVirtualGrid([{key:'uploads',items}],renderLocalUploadCard,renderLocalUploadAddCard())}
                ${items.length ? '' : managerEmptyState(localUploadQuery,'当前文件夹还没有素材，可以上传图片、视频或音频。')}
            </div>
        </section>
        <aside class="asset-panel asset-detail">
            ${renderLocalUploadDetail(detail)}
        </aside>
    `;
}
function renderLocalUploadAddCard(){
    return `<button id="localUploadDrop" class="upload-grid-card" type="button" data-localup-upload>
        <span class="upload-thumb"><i data-lucide="upload-cloud"></i></span>
        <span class="upload-body">
            <strong>上传本地素材</strong>
            <small>拖入文件或点击上传</small>
        </span>
    </button>`;
}
function renderLocalUploadCard(item){
    const hasCaption = assetKind(item) === 'image' && String(item.caption || '').trim();
    return `<article class="asset-card ${item.id === selectedLocalUploadId ? 'active' : ''}" data-localup-card="${escapeAttr(item.id)}">
        <input class="asset-card-check" type="checkbox" data-localup-check="${escapeAttr(item.id)}" ${selectedLocalUploadIds.has(item.id) ? 'checked' : ''}>
        <div class="asset-thumb">${assetThumb(item)}</div>
        <div class="asset-card-body">
            <div class="asset-card-name" title="${escapeAttr(item.name || '')}">${escapeHtml(item.name || '本地素材')}</div>
            <div class="asset-card-meta">${escapeHtml(assetKindLabel(item))} · ${escapeHtml(formatFileSize(item.size))}${hasCaption ? ' · 有提示词' : ''}</div>
        </div>
    </article>`;
}
function renderLocalUploadDetail(item){
    if(!item) return `<div class="panel-head"><div class="panel-title"><strong>素材预览</strong><span>选择一个素材查看详情</span></div></div><div class="detail-scroll"><div class="detail-empty"><i data-lucide="image"></i><span>暂无可预览素材</span></div></div>`;
    const isImage = assetKind(item) === 'image';
    return `
        <div class="panel-head">
            <div class="panel-title"><strong>素材预览</strong><span>${escapeHtml(assetKindLabel(item))}</span></div>
            <div class="panel-actions">
                <button class="asset-icon-btn" type="button" data-localup-open="${escapeAttr(item.id)}" title="新窗口打开"><i data-lucide="external-link"></i></button>
                <button class="asset-icon-btn" type="button" data-localup-copy="${escapeAttr(item.id)}" title="复制链接"><i data-lucide="link"></i></button>
                <button class="asset-icon-btn danger" type="button" data-localup-delete-one="${escapeAttr(item.id)}" title="删除"><i data-lucide="trash-2"></i></button>
            </div>
        </div>
        <div class="detail-scroll">
            ${assetKind(item) === 'audio' ? assetAudioDetailHtml(item,'localup') : `<div class="detail-media"><button class="detail-media-frame detail-media-zoomable" type="button" data-localup-preview="${escapeAttr(item.id)}" title="点击放大预览">${assetThumb(item)}</button></div>`}
            <div class="detail-body">
                <div class="detail-name">${escapeHtml(item.name || '本地素材')}</div>
                <div class="detail-meta-grid">
                    <div class="detail-meta"><span>类型</span><strong>${escapeHtml(assetKindLabel(item))}</strong></div>
                    <div class="detail-meta"><span>大小</span><strong>${escapeHtml(formatFileSize(item.size))}</strong></div>
                    <div class="detail-meta"><span>上传时间</span><strong>${escapeHtml(formatDate((item.created_at||0)*1000))}</strong></div>
                    <div class="detail-meta"><span>来源</span><strong>本地上传</strong></div>
                </div>
                <div class="detail-url">${escapeHtml(item.url || '')}</div>
                ${isImage ? `
                    <div class="detail-caption-card">
                        <div class="detail-caption-head">
                            <strong>反推提示词</strong>
                            <button class="asset-btn primary" type="button" data-localup-caption-save="${escapeAttr(item.id)}"><i data-lucide="save"></i><span>保存</span></button>
                        </div>
                        <textarea id="localUploadCaptionEdit" class="detail-caption-textarea" placeholder="暂无反推提示词，可以批量反推后自动写入，也可以在这里手动编辑。">${escapeHtml(item.caption || '')}</textarea>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}
function renderLocalFolderBranch(folder, depth=0){
    const active = folder.id === activeLocalFolderId;
    const contains = !active && (folder.children || []).some(child => child.id === activeLocalFolderId || folderContainsLocalActive(child));
    return `<div class="tree-branch">
        <button class="tree-row ${depth ? 'tree-child' : 'tree-parent'} ${active ? 'active' : ''} ${contains ? 'contains-active' : ''}" type="button" data-local-folder="${escapeAttr(folder.id)}">
            ${depth ? '<span class="tree-elbow"></span>' : ''}
            <span class="tree-row-icon"><i data-lucide="${active ? 'folder-open' : 'folder'}"></i></span>
            <span class="tree-row-name">${escapeHtml(folder.name || '文件夹')}</span>
            <span class="tree-row-count">${localFolderTotal(folder)}</span>
        </button>
        ${(folder.children || []).length ? `<div class="tree-children">${folder.children.map(child => renderLocalFolderBranch(child, depth + 1)).join('')}</div>` : ''}
    </div>`;
}
function folderContainsLocalActive(folder){
    if(!folder) return false;
    if(folder.id === activeLocalFolderId) return true;
    return (folder.children || []).some(child => folderContainsLocalActive(child));
}
function renderLocalCard(item){
    const hasCaption = localItemKind(item) === 'image' && String(item.caption || '').trim();
    return `<article class="asset-card ${item.id === selectedLocalId ? 'active' : ''}" data-local-card="${escapeAttr(item.id)}">
        <input class="asset-card-check" type="checkbox" data-local-check="${escapeAttr(item.id)}" ${selectedLocalIds.has(item.id) ? 'checked' : ''}>
        <div class="asset-thumb">${localAssetThumb(item)}</div>
        <div class="asset-card-body">
            <div class="asset-card-name" title="${escapeAttr(item.relativePath || item.name || '')}">${escapeHtml(item.name || 'local')}</div>
            <div class="asset-card-meta">${escapeHtml(assetKindLabel(item))} · ${escapeHtml(formatFileSize(item.size))}${hasCaption ? ' · 有提示词' : ''}</div>
        </div>
    </article>`;
}
function renderLocalClipboardBar(){
    if(!localClipboard?.items?.length) return '';
    const modeLabel = localClipboard.mode === 'cut' ? '剪切' : '复制';
    const target = activeAssetCategory();
    return `<div class="asset-clipboard-bar">
        <div class="asset-clipboard-info"><i data-lucide="clipboard"></i><span>${escapeHtml(modeLabel)}了 ${localClipboard.items.length} 个本地素材，目标：${escapeHtml(activeAssetLibrary()?.name || '图片资产')} / ${escapeHtml(target?.name || '未选择分组')}</span></div>
        <div class="asset-tools">
            <button class="asset-btn primary" type="button" data-local-import-clipboard ${target ? '' : 'disabled'}><i data-lucide="clipboard-paste"></i><span>导入到图片资产</span></button>
            <button class="asset-icon-btn" type="button" data-local-clear-clipboard title="清空本地剪贴板"><i data-lucide="x"></i></button>
        </div>
    </div>`;
}
function renderLocalDetail(item){
    if(!item) return `<div class="panel-head"><div class="panel-title"><strong>本地预览</strong><span>选择一个本地素材查看详情</span></div></div><div class="detail-scroll"><div class="detail-empty"><i data-lucide="folder-open"></i><span>暂无可预览素材</span></div></div>`;
    return `
        <div class="panel-head">
            <div class="panel-title"><strong>本地预览</strong><span>${escapeHtml(assetKindLabel(item))}</span></div>
            <div class="panel-actions">
                <button class="asset-icon-btn" type="button" data-local-open="${escapeAttr(item.id)}" title="打开预览"><i data-lucide="external-link"></i></button>
                <button class="asset-btn primary" type="button" data-local-import-one="${escapeAttr(item.id)}"><i data-lucide="download"></i><span>导入</span></button>
            </div>
        </div>
        <div class="detail-scroll">
            ${assetKind(item) === 'audio' ? assetAudioDetailHtml(item,'local') : `<div class="detail-media"><button class="detail-media-frame detail-media-zoomable" type="button" data-local-preview="${escapeAttr(item.id)}" title="点击放大预览">${localAssetThumb(item)}</button></div>`}
            <div class="detail-body">
                <div class="detail-name">${escapeHtml(item.name || '本地素材')}</div>
                <div class="detail-meta-grid">
                    <div class="detail-meta"><span>类型</span><strong>${escapeHtml(assetKindLabel(item))}</strong></div>
                    <div class="detail-meta"><span>大小</span><strong>${escapeHtml(formatFileSize(item.size))}</strong></div>
                    <div class="detail-meta"><span>修改时间</span><strong>${escapeHtml(formatDate(item.lastModified))}</strong></div>
                    <div class="detail-meta"><span>来源</span><strong>${escapeHtml(activeSharedFolderName || '共享文件夹')}</strong></div>
                </div>
                <div class="detail-url">${escapeHtml(item.relativePath || item.name || '')}</div>
            </div>
        </div>
    `;
}
function currentAssetGridKey(){
    return `${activeAssetLibraryId}\u0000${activeAssetCategoryId}\u0000${assetQuery.trim().toLowerCase()}`;
}
function prepareAssetRenderWindow(items){
    const key = currentAssetGridKey();
    if(key !== assetGridKey){
        assetGridKey = key;
        assetRenderedCount = Math.min(ASSET_BATCH_SIZE, items.length);
    } else if(!assetRenderedCount && items.length) {
        assetRenderedCount = Math.min(ASSET_BATCH_SIZE, items.length);
    }
    assetRenderedCount = Math.min(assetRenderedCount, items.length);
    return items.slice(0, assetRenderedCount);
}
function renderAssetLoadMore(total){
    return '';
}
function appendNextAssetBatch(){
    scheduleAssetVirtualRender();
}
function scheduleAssetVirtualRender(){
    if(assetVirtualRenderFrame) return;
    assetVirtualRenderFrame = requestAnimationFrame(() => {
        assetVirtualRenderFrame = 0;
        if(activeTab==='assets') renderAssetVirtualWindow();
        else renderManagerVirtualWindow();
    });
}
function renderAssetVirtualWindow(){
    const grid = root.querySelector('[data-asset-virtual-grid]');
    const context = assetContentScrollContext();
    const scroller = context?.element;
    const items = currentAssetItems();
    if(!grid || !scroller || !context || !items.length) return;
    if(grid.clientWidth <= 0) return;
    const {columns, gap, cardHeight, rowStride, gridTop} = assetVirtualMetrics(grid, context);
    grid.style.setProperty('--asset-virtual-card-height', `${cardHeight}px`);
    const scrollTop = context.kind === 'window'
        ? Math.max(0, context.top - gridTop)
        : Math.max(0, scroller.scrollTop - gridTop);
    const total = items.length + 1; // 上传卡也占一个网格位置
    const totalRows = Math.ceil(total / columns);
    const visibleRows = Math.ceil(context.viewportHeight / rowStride);
    const startRow = Math.min(
        Math.max(0, Math.floor(scrollTop / rowStride) - ASSET_VIRTUAL_OVERSCAN_ROWS),
        Math.max(0, totalRows - 1)
    );
    const endRow = Math.min(totalRows, startRow + visibleRows + ASSET_VIRTUAL_OVERSCAN_ROWS * 2);
    const start = startRow * columns;
    const end = Math.min(total, endRow * columns);
    const rangeKey = `${columns}:${rowStride}:${start}:${end}:${items.length}:${currentAssetGridKey()}`;
    if(rangeKey === assetVirtualRangeKey) return;
    assetVirtualRangeKey = rangeKey;
    const topHeight = startRow ? Math.max(0, startRow * rowStride - gap) : 0;
    const trailingRows = totalRows - endRow;
    const bottomHeight = trailingRows ? Math.max(0, trailingRows * rowStride - gap) : 0;
    const cells = [];
    for(let index = start; index < end; index++){
        const item=index===0 ? activeAssetCategory() : items[index-1];
        cells.push({key:index===0 ? 'upload' : `card:${item.id}`,item,html:index===0 ? renderUploadCard(item) : renderAssetCard(item)});
    }
    patchVirtualGrid(grid,cells,topHeight,bottomHeight);
    if(grid.querySelector('[data-lucide]')) refreshIcons();
}
function renderAssetManager(){
    normalizeAssetState();
    const libs = assetLibraries();
    const cats = assetCategories();
    const lib = activeAssetLibrary();
    const cat = activeAssetCategory();
    const items = currentAssetItems();
    const visibleItems = prepareAssetRenderWindow(items);
    const detail = selectedAsset();
    assetVirtualRangeKey = '';
    root.innerHTML = `
        <aside class="asset-panel asset-nav">
            <div class="panel-head">
                <div class="panel-title"><strong>资产层级</strong><span>先选库，再选分组</span></div>
                <div class="panel-actions compact-actions">
                    ${assetTreeEdit?.placement === 'head' ? '' : '<button class="asset-icon-btn" type="button" data-asset-lib-new title="新建资产库"><i data-lucide="plus"></i></button>'}
                    ${renderHeadTreeInlineEdit(assetTreeEdit, 'assetTreeEditInput', 'data-asset-tree-edit-save', 'data-asset-tree-edit-cancel')}
                </div>
            </div>
            <div class="nav-scroll">
                <div class="nav-tree asset-library-tree">
                    ${libs.map(item => renderAssetTreeBranch(item)).join('')}
                </div>
            </div>
        </aside>
        <section class="asset-panel asset-content ${assetManageMode ? 'manage-on' : ''}">
            <div class="content-toolbar">
                <div class="content-heading">
                    <strong>${escapeHtml(cat?.name || '图片资产')}</strong>
                    <span>${escapeHtml(lib?.name || '资产库')} / ${items.length} 个素材</span>
                </div>
                <div class="asset-tools">
                    <label class="asset-search-wrap"><i data-lucide="search"></i><input id="assetSearch" class="asset-search" type="search" value="${escapeAttr(assetQuery)}" placeholder="搜索素材"></label>
                    <button class="asset-btn ${assetManageMode ? 'primary' : ''}" type="button" data-asset-manage><i data-lucide="list-checks"></i><span>${assetManageMode ? '完成管理' : '批量管理'}</span></button>
                </div>
            </div>
            ${renderAssetClipboardBar()}
            ${renderLocalClipboardBar()}
            <div class="manage-tools">
                <span>已选择 ${selectedAssetIds.size} 个素材，支持拖拽框选或逐个勾选。</span>
                <div class="asset-tools">
                    <button class="asset-btn" type="button" data-asset-select-all ${items.length ? '' : 'disabled'}><i data-lucide="check-square"></i><span>全选</span></button>
                    <button class="asset-btn" type="button" data-asset-clear-selection ${selectedAssetIds.size ? '' : 'disabled'}><i data-lucide="square"></i><span>清空</span></button>
                    <button class="asset-btn" type="button" data-asset-cut-selected ${selectedAssetIds.size ? '' : 'disabled'}><i data-lucide="scissors"></i><span>剪切</span></button>
                    <button class="asset-btn" type="button" data-asset-copy-selected ${selectedAssetIds.size ? '' : 'disabled'}><i data-lucide="copy"></i><span>复制</span></button>
                    <button class="asset-btn" type="button" data-asset-download-selected ${selectedAssetIds.size ? '' : 'disabled'}><i data-lucide="download"></i><span>下载所选</span></button>
                    <button class="asset-btn" type="button" data-asset-copy-to-canvas ${selectedAssetIds.size ? '' : 'disabled'}><i data-lucide="clipboard-paste"></i><span>复制到画布</span></button>
                    <button class="asset-btn" type="button" data-avatar-register-selected ${selectedAssetIds.size && !avatarBusyId ? '' : 'disabled'}><i data-lucide="user-round-plus"></i><span>批量认证</span></button>
                    <button class="asset-btn danger" type="button" data-asset-delete-selected ${selectedAssetIds.size ? '' : 'disabled'}><i data-lucide="trash-2"></i><span>删除所选</span></button>
                </div>
            </div>
            <div class="content-scroll" data-asset-view-library="${escapeAttr(activeAssetLibraryId)}" data-asset-view-category="${escapeAttr(activeAssetCategoryId)}" data-asset-view-query="${escapeAttr(assetQuery)}">
                <div class="asset-grid" data-asset-virtual-grid>
                    ${renderUploadCard(cat)}
                    ${visibleItems.map(item => renderAssetCard(item)).join('')}
                    ${renderAssetLoadMore(items.length)}
                    ${items.length ? '' : managerEmptyState(assetQuery,'当前分组还没有素材，可以上传，或从智能画布输出保存到素材库。')}
                </div>
            </div>
        </section>
        <aside class="asset-panel asset-detail">
            ${renderAssetDetail(detail)}
        </aside>
    `;
    scheduleAssetVirtualRender();
}
function renderWorkflowManager(){
    normalizeWorkflowState();
    const cats = workflowCategories();
    const cat = activeWorkflowCategory();
    const items = currentWorkflowItems();
    const detail = selectedWorkflow();
    root.innerHTML = `
        <aside class="asset-panel asset-nav">
            <div class="panel-head">
                <div class="panel-title"><strong>工作流层级</strong><span>独立管理工作流分组</span></div>
                <div class="panel-actions compact-actions">
                    ${workflowTreeEdit?.placement === 'head' ? '' : '<button class="asset-icon-btn" type="button" data-workflow-cat-new title="新建工作流分组"><i data-lucide="folder-plus"></i></button>'}
                    ${renderHeadTreeInlineEdit(workflowTreeEdit, 'workflowTreeEditInput', 'data-workflow-tree-edit-save', 'data-workflow-tree-edit-cancel')}
                </div>
            </div>
            <div class="nav-scroll">
                <div class="nav-tree">
                    <div class="tree-branch expanded">
                        <button class="tree-row tree-parent contains-active" type="button" data-workflow-root>
                            <span class="tree-row-icon"><i data-lucide="folder-open"></i></span>
                            <span class="tree-row-name">工作流库</span>
                            <span class="tree-row-count">${workflowCount()}</span>
                        </button>
                        <div class="tree-children">
                            ${cats.length ? cats.map(c => {
                                const active = c.id === activeWorkflowCategoryId && c.__libraryId === activeWorkflowLibraryId;
                                return `<button class="tree-row tree-child ${active ? 'active' : ''}" type="button" data-workflow-cat="${escapeAttr(c.id)}" data-workflow-cat-lib="${escapeAttr(c.__libraryId || '')}">
                                <span class="tree-elbow"></span>
                                <span class="tree-row-icon"><i data-lucide="workflow"></i></span>
                                <span class="tree-row-name">${escapeHtml(c.name || '工作流')}</span>
                                <span class="tree-row-count">${(c.items || []).length}</span>
                            </button>${active ? renderWorkflowTreeActionBar() : ''}`;
                            }).join('') : '<div class="tree-empty">暂无工作流分组</div>'}
                        </div>
                    </div>
                </div>
            </div>
        </aside>
        <section class="asset-panel asset-content ${workflowManageMode ? 'manage-on' : ''}">
            <div class="content-toolbar">
                <div class="content-heading">
                    <strong>${escapeHtml(cat?.name || '工作流管理')}</strong>
                    <span>工作流库 / ${items.length} 个工作流</span>
                </div>
                <div class="asset-tools">
                    <label class="asset-search-wrap"><i data-lucide="search"></i><input id="workflowSearch" class="asset-search" type="search" value="${escapeAttr(workflowQuery)}" placeholder="搜索工作流"></label>
                    <button class="asset-btn ${workflowManageMode ? 'primary' : ''}" type="button" data-workflow-manage><i data-lucide="list-checks"></i><span>${workflowManageMode ? '完成管理' : '批量管理'}</span></button>
                </div>
            </div>
            <div class="manage-tools">
                <span>已选择 ${selectedWorkflowIds.size} 个工作流。</span>
                <div class="asset-tools">
                    <button class="asset-btn" type="button" data-workflow-select-all ${items.length ? '' : 'disabled'}><i data-lucide="check-square"></i><span>全选</span></button>
                    <button class="asset-btn" type="button" data-workflow-clear-selection ${selectedWorkflowIds.size ? '' : 'disabled'}><i data-lucide="square"></i><span>清空</span></button>
                    <button class="asset-btn" type="button" data-workflow-export-selected ${selectedWorkflowIds.size ? '' : 'disabled'}><i data-lucide="download"></i><span>导出所选</span></button>
                    <button class="asset-btn danger" type="button" data-workflow-delete-selected ${selectedWorkflowIds.size ? '' : 'disabled'}><i data-lucide="trash-2"></i><span>删除所选</span></button>
                </div>
            </div>
            <div class="content-scroll">
                ${renderManagerVirtualGrid([{key:'workflows',items}],renderWorkflowCard,renderWorkflowUploadCard(cat))}
                ${items.length ? '' : managerEmptyState(workflowQuery,'当前分组还没有工作流，可以上传 JSON / ZIP，或从传统画布导出到资产库。')}
            </div>
        </section>
        <aside class="asset-panel asset-detail">
            ${renderWorkflowDetail(detail)}
        </aside>
    `;
}
function renderWorkflowUploadCard(cat){
    return `<button id="workflowDrop" class="upload-grid-card" type="button" data-workflow-upload ${!cat ? 'disabled' : ''}>
        <span class="upload-thumb"><i data-lucide="upload-cloud"></i></span>
        <span class="upload-body">
            <strong>上传工作流</strong>
            <small>支持 JSON / ZIP</small>
        </span>
    </button>`;
}
function renderWorkflowTreeActionBar(){
    const editHtml = renderWorkflowTreeInlineEdit();
    if(editHtml) return editHtml;
    const deleteKey = `workflow-cat:${activeWorkflowLibraryId}:${activeWorkflowCategoryId}`;
    return `<div class="tree-action-bar child-actions">
        <button type="button" data-workflow-cat-rename><i data-lucide="pencil"></i><span>重命名</span></button>
        <button type="button" class="danger ${pendingTreeDelete === deleteKey ? 'detail-confirm' : ''}" data-workflow-cat-delete><i data-lucide="trash-2"></i><span>${pendingTreeDelete === deleteKey ? '确认删除' : '删除'}</span></button>
    </div>`;
}
function renderWorkflowTreeInlineEdit(){
    if(!workflowTreeEdit || workflowTreeEdit.placement === 'head') return '';
    if(workflowTreeEdit.kind !== 'category-rename') return '';
    const label = workflowTreeEdit.label || '名称';
    return `<div class="tree-inline-edit child-actions">
        <input id="workflowTreeEditInput" type="text" value="${escapeAttr(workflowTreeEdit.value || '')}" placeholder="${escapeAttr(label)}">
        <button type="button" class="primary" data-workflow-tree-edit-save><i data-lucide="check"></i><span>保存</span></button>
        <button type="button" data-workflow-tree-edit-cancel><i data-lucide="x"></i><span>取消</span></button>
    </div>`;
}
function renderWorkflowCard(item){
    return `<article class="asset-card workflow-card ${item.id === selectedWorkflowId ? 'active' : ''}" data-workflow-card="${escapeAttr(item.id)}">
        <input class="asset-card-check" type="checkbox" data-workflow-check="${escapeAttr(item.id)}" ${selectedWorkflowIds.has(item.id) ? 'checked' : ''}>
        <div class="asset-thumb">${workflowThumb(item)}</div>
        <div class="asset-card-body">
            <div class="asset-card-name" title="${escapeAttr(item.name || '')}">${escapeHtml(item.name || 'workflow')}</div>
            <div class="asset-card-meta">${escapeHtml(workflowKindLabel(item))} · ${escapeHtml(formatDate(item.created_at))}</div>
        </div>
    </article>`;
}
function renderWorkflowDetail(item){
    if(!item) return `<div class="panel-head"><div class="panel-title"><strong>工作流详情</strong><span>选择一个工作流查看详情</span></div></div><div class="detail-scroll"><div class="detail-empty"><i data-lucide="workflow"></i><span>暂无工作流</span></div></div>`;
    return `
        <div class="panel-head">
            <div class="panel-title"><strong>工作流详情</strong><span>${escapeHtml(workflowKindLabel(item))}</span></div>
            <div class="panel-actions">
                <button class="asset-icon-btn" type="button" data-workflow-download="${escapeAttr(item.id)}" title="导出工作流"><i data-lucide="download"></i></button>
                <button class="asset-icon-btn" type="button" data-workflow-rename="${escapeAttr(item.id)}" title="重命名"><i data-lucide="pencil"></i></button>
                <button class="asset-icon-btn danger ${pendingDeleteAssetId === item.id ? 'detail-confirm' : ''}" type="button" data-workflow-delete="${escapeAttr(item.id)}" title="${pendingDeleteAssetId === item.id ? '再次点击确认删除' : '删除'}"><i data-lucide="trash-2"></i></button>
            </div>
        </div>
        <div class="detail-scroll">
            <div class="detail-media"><div class="detail-media-frame">${workflowThumb(item)}</div></div>
            <div class="detail-body">
                <input class="detail-name-input" data-workflow-inline-name="${escapeAttr(item.id)}" type="text" value="${escapeAttr(item.name || 'workflow')}" title="直接修改名称">
                <div class="detail-meta-grid">
                    <div class="detail-meta"><span>类型</span><strong>${escapeHtml(workflowKindLabel(item))}</strong></div>
                    <div class="detail-meta"><span>创建时间</span><strong>${escapeHtml(formatDate(item.created_at))}</strong></div>
                    <div class="detail-meta"><span>位置</span><strong>工作流库</strong></div>
                    <div class="detail-meta"><span>分组</span><strong>${escapeHtml(activeWorkflowCategory()?.name || '工作流')}</strong></div>
                </div>
                <div class="detail-url">${escapeHtml(item.url || '')}</div>
            </div>
        </div>
    `;
}
function renderUploadCard(cat){
    return `<button id="assetDrop" class="upload-grid-card" type="button" data-asset-upload ${!cat ? 'disabled' : ''}>
        <span class="upload-thumb"><i data-lucide="upload-cloud"></i></span>
        <span class="upload-body">
            <strong>上传到当前分组</strong>
            <small>拖入文件或点击上传</small>
        </span>
    </button>`;
}
function renderAssetClipboardBar(){
    if(!assetClipboard?.ids?.length) return '';
    const modeLabel = assetClipboard.mode === 'cut' ? '剪切' : '复制';
    const sameTarget = assetClipboard.sourceLibraryId === activeAssetLibraryId && assetClipboard.sourceCategoryId === activeAssetCategoryId;
    const pasteText = sameTarget && assetClipboard.mode === 'cut' ? '选择其他分组后粘贴' : '粘贴到当前分组';
    return `<div class="asset-clipboard-bar">
        <div class="asset-clipboard-info"><i data-lucide="clipboard"></i><span>${escapeHtml(modeLabel)}了 ${assetClipboard.ids.length} 个素材</span></div>
        <div class="asset-tools">
            <button class="asset-btn primary" type="button" data-asset-paste-clipboard ${sameTarget && assetClipboard.mode === 'cut' ? 'disabled' : ''}><i data-lucide="clipboard-paste"></i><span>${escapeHtml(pasteText)}</span></button>
            <button class="asset-icon-btn" type="button" data-asset-clear-clipboard title="清空剪贴板"><i data-lucide="x"></i></button>
        </div>
    </div>`;
}
function renderAssetTreeBranch(lib){
    const isActiveLib = lib.id === activeAssetLibraryId;
    const isExpanded = !collapsedAssetLibraryIds.has(lib.id);
    const cats = (lib.categories || []).filter(cat => (cat.type || 'image') === 'image');
    const showLibActions = isActiveLib && isExpanded && assetTreeFocus === 'library';
    return `<div class="tree-branch ${isExpanded ? 'expanded' : ''}">
        <button class="tree-row tree-parent ${isActiveLib ? 'contains-active' : ''} ${showLibActions ? 'active' : ''}" type="button" data-asset-lib="${escapeAttr(lib.id)}" aria-expanded="${isExpanded}">
            <span class="tree-toggle"><i data-lucide="chevron-right"></i></span>
            <span class="tree-row-icon"><i data-lucide="${isExpanded ? 'folder-open' : 'folder'}"></i></span>
            <span class="tree-row-name">${escapeHtml(lib.name || '资产库')}</span>
            <span class="tree-row-count">${assetCountForLibrary(lib)}</span>
        </button>
        ${showLibActions ? renderAssetTreeActionBar('library') : ''}
        <div class="tree-children">
            ${cats.length ? cats.map(cat => `<button class="tree-row tree-child ${isActiveLib && cat.id === activeAssetCategoryId && assetTreeFocus === 'category' ? 'active' : ''}" type="button" data-asset-cat="${escapeAttr(cat.id)}" data-asset-cat-lib="${escapeAttr(lib.id)}">
                <span class="tree-elbow"></span>
                <span class="tree-row-icon"><i data-lucide="image"></i></span>
                <span class="tree-row-name">${escapeHtml(cat.name || '分组')}</span>
                <span class="tree-row-count">${(cat.items || []).length}</span>
            </button>${isActiveLib && cat.id === activeAssetCategoryId && assetTreeFocus === 'category' ? renderAssetTreeActionBar('category') : ''}`).join('') : '<div class="tree-empty">暂无分组</div>'}
        </div>
    </div>`;
}
function renderAssetTreeActionBar(kind){
    const editHtml = renderAssetTreeInlineEdit(kind);
    if(editHtml) return editHtml;
    const deleteKey = kind === 'library' ? `asset-lib:${activeAssetLibraryId}` : `asset-cat:${activeAssetCategoryId}`;
    if(kind === 'library'){
        return `<div class="tree-action-bar library-actions">
            <button type="button" data-asset-cat-new><i data-lucide="folder-plus"></i><span>新分组</span></button>
            <button type="button" data-asset-lib-rename><i data-lucide="pencil"></i><span>重命名</span></button>
            <button type="button" class="danger ${pendingTreeDelete === deleteKey ? 'detail-confirm' : ''}" data-asset-lib-delete><i data-lucide="trash-2"></i><span>${pendingTreeDelete === deleteKey ? '确认删除' : '删除库'}</span></button>
        </div>`;
    }
    return `<div class="tree-action-bar child-actions">
        <button type="button" data-asset-cat-new><i data-lucide="folder-plus"></i><span>新分组</span></button>
        <button type="button" data-asset-cat-rename><i data-lucide="pencil"></i><span>重命名</span></button>
        <button type="button" class="danger ${pendingTreeDelete === deleteKey ? 'detail-confirm' : ''}" data-asset-cat-delete><i data-lucide="trash-2"></i><span>${pendingTreeDelete === deleteKey ? '确认删除' : '删除'}</span></button>
    </div>`;
}
function renderAssetTreeInlineEdit(kind){
    if(!assetTreeEdit) return '';
    if(assetTreeEdit.placement === 'head') return '';
    const expectedKinds = kind === 'library'
        ? ['library-new', 'library-rename', 'category-new']
        : ['category-new', 'category-rename'];
    if(!expectedKinds.includes(assetTreeEdit.kind)) return '';
    const label = assetTreeEdit.label || '名称';
    return `<div class="tree-inline-edit ${kind === 'category' ? 'child-actions' : 'library-actions'}">
        <input id="assetTreeEditInput" type="text" value="${escapeAttr(assetTreeEdit.value || '')}" placeholder="${escapeAttr(label)}">
        <button type="button" class="primary" data-asset-tree-edit-save><i data-lucide="check"></i><span>保存</span></button>
        <button type="button" data-asset-tree-edit-cancel><i data-lucide="x"></i><span>取消</span></button>
    </div>`;
}
function renderAssetCard(item){
    return `<article class="asset-card ${item.id === selectedAssetId ? 'active' : ''}" data-asset-card="${escapeAttr(item.id)}">
        <input class="asset-card-check" type="checkbox" data-asset-check="${escapeAttr(item.id)}" ${selectedAssetIds.has(item.id) ? 'checked' : ''}>
        <div class="asset-thumb">${assetThumb(item)}</div>
        <div class="asset-card-body">
            <div class="asset-card-name" title="${escapeAttr(item.name || '')}">${escapeHtml(item.name || 'asset')}</div>
            <div class="asset-card-meta">${escapeHtml(assetKindLabel(item))} · ${escapeHtml(formatDate(item.created_at))}</div>
        </div>
    </article>`;
}
function renderAvatarRegistrationCard(item, platform, reg, busy){
    const status = String(reg.status || '');
    const tag = `<span class="avatar-platform-tag">${escapeHtml(avatarPlatformLabel(platform))}</span>`;
    const providerId = avatarProviderIdForPlatform(platform, reg.provider_id || '');
    const provAttr = `data-avatar-prov="${escapeAttr(providerId)}"`;
    if(status === 'Active' && reg.asset_uri){
        return `<div class="avatar-card registered">
            <div class="avatar-head"><i data-lucide="badge-check"></i><span>已认证可用</span>${tag}</div>
            <div class="avatar-uri" title="只能在 ${escapeAttr(avatarPlatformLabel(platform))} 平台的视频生成中通过 @ 调用">${escapeHtml(reg.asset_uri)}</div>
            <div class="asset-tools">
                <button class="asset-btn" type="button" data-avatar-copy="${escapeAttr(reg.asset_uri)}"><i data-lucide="copy"></i><span>复制 asset:// 地址</span></button>
                <button class="asset-btn" type="button" data-avatar-check="${escapeAttr(item.id)}" ${provAttr} ${busy ? 'disabled' : ''}><i data-lucide="refresh-cw"></i><span>${busy ? '查询中…' : '刷新审核状态'}</span></button>
            </div>
        </div>`;
    }
    if(['Queued','Uploading','Processing'].includes(status)){
        const statusLabel = status === 'Queued' ? '排队中' : status === 'Uploading' ? '上传提交中' : '审核中';
        return `<div class="avatar-card processing">
            <div class="avatar-head"><i data-lucide="loader"></i><span>${statusLabel}</span>${tag}</div>
            <div class="avatar-hint">${status === 'Processing' ? `已提交审核（任务 ${escapeHtml(reg.task_id || '')}），通过后会自动生成 asset:// 地址。` : escapeHtml(reg.detail || statusLabel)}</div>
            <div class="asset-tools">
                ${status === 'Processing' ? `<button class="asset-btn primary" type="button" data-avatar-check="${escapeAttr(item.id)}" ${provAttr} ${busy ? 'disabled' : ''}><i data-lucide="refresh-cw"></i><span>${busy ? '查询中…' : '刷新审核状态'}</span></button>` : ''}
                <button class="asset-btn danger" type="button" data-avatar-cancel="${escapeAttr(item.id)}" ${provAttr}><i data-lucide="x"></i><span>取消认证</span></button>
            </div>
        </div>`;
    }
    if(status === 'Cancelled'){
        return `<div class="avatar-card failed"><div class="avatar-head"><i data-lucide="circle-slash"></i><span>已取消</span>${tag}</div><div class="avatar-hint">${escapeHtml(reg.detail || '已停止本地认证和审核跟踪')}</div></div>`;
    }
    return `<div class="avatar-card failed">
        <div class="avatar-head"><i data-lucide="x-circle"></i><span>审核未通过</span>${tag}</div>
        <div class="avatar-hint warn">${escapeHtml(reg.detail || '审核未通过，请更换素材后重试。')}</div>
        <div class="asset-tools">
            <button class="asset-btn" type="button" data-avatar-register="${escapeAttr(item.id)}" ${provAttr} ${busy ? 'disabled' : ''}><i data-lucide="refresh-cw"></i><span>${busy ? '处理中…' : '重新提交'}</span></button>
        </div>
    </div>`;
}
function renderAvatarSection(item){
    const busy = avatarBusyId === item.id || avatarBusyId === '__batch__';
    const regs = (item.registrations && typeof item.registrations === 'object') ? item.registrations : {};
    const cards = Object.keys(regs)
        .filter(platform => platform === 'volcengine' && regs[platform] && (regs[platform].task_id || ['Queued','Uploading','Cancelled'].includes(regs[platform].status)))
        .map(platform => renderAvatarRegistrationCard(item, platform, regs[platform], busy))
        .join('');
    const submitting = avatarSubmittingItems.get(item.id);
    const submittingCard = submitting && !Object.values(regs).some(reg => ['Queued','Uploading','Processing'].includes(reg?.status))
        ? `<div class="avatar-card processing"><div class="avatar-head"><i data-lucide="loader"></i><span>排队或提交中</span></div><div class="asset-tools"><button class="asset-btn danger" type="button" data-avatar-cancel="${escapeAttr(item.id)}" data-avatar-prov="${escapeAttr(submitting.providerId)}"><i data-lucide="x"></i><span>取消认证</span></button></div></div>`
        : '';
    if(!managerDataLoaded.providers){
        return `<div class="avatar-section" data-avatar-status-region="${escapeAttr(item.id)}">
            ${submittingCard}${cards}
            <div class="avatar-head"><i data-lucide="loader"></i><span>正在加载认证平台…</span></div>
        </div>`;
    }
    const providers = avatarCandidateProviders();
    if(!providers.length){
        return `<div class="avatar-section" data-avatar-status-region="${escapeAttr(item.id)}">
            ${cards}
            <div class="avatar-head"><i data-lucide="user-round-cog"></i><span>注册为真人/数字人</span></div>
            <div class="avatar-hint">当前空间尚未分配可用的火山引擎。请在「API 平台管理」中启用并分配火山引擎，填写认证所需的 AK/SK。</div>
        </div>`;
    }
    const selected = activeAvatarProvider();
    const selPlatform = providerAvatarPlatform(selected);
    const supported = providerAvatarSupported(selected);
    const credentialMessage = providerAvatarCredentialMessage(selected);
    const noKey = !!credentialMessage;
    const registration = supported ? regs[selPlatform] : null;
    const refreshOnly = registration?.task_id && ['Active','Processing'].includes(registration.status);
    const submittingNow = ['Queued','Uploading'].includes(registration?.status);
    const scopeMismatch = registration && ((registration.provider_id || 'volcengine') !== selected?.id
        || (registration.project_name || 'default') !== (selected?.volcengine_project_name || 'default'));
    const select = `<select class="avatar-provider-select" data-avatar-provider>${providers.map(p => `<option value="${escapeAttr(p.id)}" ${p.id === selected?.id ? 'selected' : ''}>${escapeHtml(avatarProviderOptionLabel(p))}</option>`).join('')}</select>`;
    let registerUI;
    if(!supported){
        registerUI = `<div class="avatar-hint">认证是跨平台功能，但「${escapeHtml(selPlatform ? avatarPlatformLabel(selPlatform) : (selected?.name || selected?.id || '该平台'))}」的资产认证 API 尚未接入（待接入）。请选择已支持的平台，或继续使用官方控制台认证。</div>${select}`;
    } else {
        registerUI = `
            <div class="avatar-hint">提交到 ${escapeHtml(avatarPlatformLabel(selPlatform))} 私域素材审核，通过后生成 asset:// 地址，可在该平台的视频生成中通过 @ 直接调用。</div>
            ${select}
            ${noKey ? `<div class="avatar-hint warn">${escapeHtml(credentialMessage)}</div>` : ''}
            ${scopeMismatch ? '<div class="avatar-hint warn">该素材已绑定其他账号或项目，请切回原配置；如需在目标项目认证，请新建素材。</div>' : refreshOnly ? '<div class="avatar-hint">该素材已提交认证，可刷新审核状态，无需重复注册。</div>' : ''}
            <button class="asset-btn primary" type="button" data-avatar-${refreshOnly ? 'check' : 'register'}="${escapeAttr(item.id)}" data-avatar-prov="${escapeAttr(selected?.id || '')}" ${busy || noKey || submittingNow || scopeMismatch ? 'disabled' : ''}><i data-lucide="${refreshOnly ? 'refresh-cw' : 'user-round-plus'}"></i><span>${busy || submittingNow ? '处理中，请稍候…' : refreshOnly ? '刷新审核状态' : registration ? '重新提交审核' : '注册并等待审核'}</span></button>`;
    }
    return `<div class="avatar-section" data-avatar-status-region="${escapeAttr(item.id)}">
        ${submittingCard}${cards}
        <div class="avatar-head"><i data-lucide="user-round-cog"></i><span>注册到平台</span></div>
        ${registerUI}
    </div>`;
}
function refreshAssetAvatarToolbar(){
    const button = root.querySelector('.asset-content [data-avatar-register-selected]');
    if(button) button.disabled = !selectedAssetIds.size || Boolean(avatarBusyId);
}
function flushAssetAvatarStatusRefresh(){
    avatarStatusRefreshFrame = 0;
    if(activeTab !== 'assets'){
        avatarStatusDirtyIds.clear();
        return;
    }
    const dirtyIds = new Set(avatarStatusDirtyIds);
    avatarStatusDirtyIds.clear();
    let changed = false;
    root.querySelectorAll('[data-avatar-status-region]').forEach(region => {
        const id = region.dataset.avatarStatusRegion || '';
        if(!dirtyIds.has(id)) return;
        const item = findAssetItem(id);
        if(!item) return;
        region.outerHTML = renderAvatarSection(item);
        changed = true;
    });
    refreshAssetAvatarToolbar();
    if(changed) refreshIcons();
}
function scheduleAssetAvatarStatusRefresh(ids){
    if(activeTab !== 'assets') return;
    const values = Array.isArray(ids) || ids instanceof Set ? ids : [ids];
    values.forEach(id => { if(id) avatarStatusDirtyIds.add(String(id)); });
    if(avatarStatusRefreshFrame) return;
    avatarStatusRefreshFrame = requestAnimationFrame(flushAssetAvatarStatusRefresh);
}
function renderAssetDetail(item){
    if(!item) return `<div class="panel-head"><div class="panel-title"><strong>素材预览</strong><span>选择一个素材查看详情</span></div></div><div class="detail-scroll"><div class="detail-empty"><i data-lucide="image"></i><span>暂无可预览素材</span></div></div>`;
    if(assetEditMode && item.id === selectedAssetId){
        return `
            <div class="panel-head">
                <div class="panel-title"><strong>编辑素材</strong><span>当前分组内直接保存</span></div>
                <div class="panel-actions">
                    <button class="asset-btn primary" type="button" data-asset-edit-save="${escapeAttr(item.id)}"><i data-lucide="check"></i><span>保存</span></button>
                    <button class="asset-icon-btn" type="button" data-asset-edit-cancel title="取消"><i data-lucide="x"></i></button>
                </div>
            </div>
            <div class="detail-scroll">
                ${assetKind(item) === 'audio' ? assetAudioDetailHtml(item) : `<div class="detail-media"><button class="detail-media-frame detail-media-zoomable" type="button" data-asset-preview="${escapeAttr(item.id)}" title="点击放大预览">${assetThumb(item)}</button></div>`}
                <div class="inline-edit-form">
                    <label class="inline-edit-field"><span>素材名称</span><input id="assetEditName" type="text" value="${escapeAttr(item.name || '')}" placeholder="素材名称"></label>
                    <div class="detail-meta-grid">
                        <div class="detail-meta"><span>类型</span><strong>${escapeHtml(assetKindLabel(item))}</strong></div>
                        <div class="detail-meta"><span>创建时间</span><strong>${escapeHtml(formatDate(item.created_at))}</strong></div>
                    </div>
                    <div class="detail-url">${escapeHtml(item.url || '')}</div>
                </div>
            </div>
        `;
    }
    return `
        <div class="panel-head">
            <div class="panel-title"><strong>素材预览</strong><span>${escapeHtml(assetKindLabel(item))}</span></div>
            <div class="panel-actions">
                <button class="asset-icon-btn" type="button" data-asset-download="${escapeAttr(item.id)}" title="下载素材"><i data-lucide="download"></i></button>
                <button class="asset-icon-btn" type="button" data-asset-edit-start="${escapeAttr(item.id)}" title="编辑"><i data-lucide="pencil"></i></button>
                <button class="asset-icon-btn danger ${pendingDeleteAssetId === item.id ? 'detail-confirm' : ''}" type="button" data-asset-delete="${escapeAttr(item.id)}" title="${pendingDeleteAssetId === item.id ? '再次点击确认删除' : '删除'}"><i data-lucide="trash-2"></i></button>
            </div>
        </div>
        <div class="detail-scroll">
            ${assetKind(item) === 'audio' ? assetAudioDetailHtml(item) : `<div class="detail-media"><button class="detail-media-frame detail-media-zoomable" type="button" data-asset-preview="${escapeAttr(item.id)}" title="点击放大预览">${assetThumb(item)}</button></div>`}
            <div class="detail-body">
                <input class="detail-name-input" data-asset-inline-name="${escapeAttr(item.id)}" type="text" value="${escapeAttr(item.name || 'asset')}" title="直接修改名称">
                <div class="detail-meta-grid">
                    <div class="detail-meta"><span>类型</span><strong>${escapeHtml(assetKindLabel(item))}</strong></div>
                    <div class="detail-meta"><span>创建时间</span><strong>${escapeHtml(formatDate(item.created_at))}</strong></div>
                    <div class="detail-meta"><span>资产库</span><strong>${escapeHtml(activeAssetLibrary()?.name || '资产库')}</strong></div>
                    <div class="detail-meta"><span>分组</span><strong>${escapeHtml(activeAssetCategory()?.name || '分组')}</strong></div>
                </div>
                <div class="detail-url">${escapeHtml(item.url || '')}</div>
                ${renderAvatarSection(item)}
            </div>
        </div>
    `;
}
function refreshAssetSelectionOnly({detail=true}={}){
    root.querySelectorAll('[data-asset-card]').forEach(card => {
        card.classList.toggle('active', card.dataset.assetCard === selectedAssetId);
    });
    root.querySelectorAll('[data-asset-check]').forEach(input => {
        input.checked = selectedAssetIds.has(input.dataset.assetCheck);
    });
    const manageTools = root.querySelector('.asset-content .manage-tools');
    const count = selectedAssetIds.size;
    const summary = manageTools?.querySelector(':scope > span');
    if(summary) summary.textContent = `已选择 ${count} 个素材，支持拖拽框选或逐个勾选。`;
    const needsSelection = [
        '[data-asset-clear-selection]', '[data-asset-cut-selected]', '[data-asset-copy-selected]',
        '[data-asset-download-selected]', '[data-asset-copy-to-canvas]', '[data-asset-delete-selected]'
    ];
    needsSelection.forEach(selector => {
        const button = manageTools?.querySelector(selector);
        if(button) button.disabled = !count;
    });
    const avatarButton = manageTools?.querySelector('[data-avatar-register-selected]');
    if(avatarButton) avatarButton.disabled = !count || Boolean(avatarBusyId);
    if(detail){
        const detailPanel = root.querySelector('.asset-detail');
        if(detailPanel){
            detailPanel.innerHTML = renderAssetDetail(selectedAsset());
            refreshIcons();
        }
    }
}
function renderPromptManager(){
    normalizePromptState();
    const libs = promptLibraries();
    const lib = activePromptLibrary();
    const readonly = Boolean(lib?.readonly);
    const cats = activePromptCategories();
    const items = currentPromptItems();
    const detail = promptCreateMode ? null : selectedPrompt();
    const promptEmptyText = (lib?.items || []).length
        ? '当前条件下没有提示词。可以切换分类或清空搜索条件。'
        : `${lib?.name || '当前提示词库'} 暂无提示词，点击「新增」添加。`;
    root.innerHTML = `
        <aside class="asset-panel asset-nav">
            <div class="panel-head">
                <div class="panel-title"><strong>提示词库</strong><span>可创建多个词库</span></div>
                <div class="panel-actions compact-actions">
                    ${promptTreeEdit?.placement === 'head' ? '' : '<button class="asset-icon-btn" type="button" data-prompt-lib-new title="新建提示词库"><i data-lucide="plus"></i></button>'}
                    ${renderHeadTreeInlineEdit(promptTreeEdit, 'promptTreeEditInput', 'data-prompt-tree-edit-save', 'data-prompt-tree-edit-cancel')}
                </div>
            </div>
            <div class="nav-scroll">
                <div class="nav-tree">
                    ${libs.map(item => renderPromptTreeBranch(item)).join('')}
                </div>
            </div>
        </aside>
        <section class="asset-panel asset-content ${promptManageMode ? 'manage-on' : ''}">
            <div class="content-toolbar">
                <div class="content-heading">
                    <strong>${escapeHtml(lib?.name || '提示词库')}</strong>
                    <span>共 ${items.length} 条提示词</span>
                </div>
                <div class="asset-tools">
                    <label class="asset-search-wrap"><i data-lucide="search"></i><input id="promptSearch" class="asset-search" type="search" value="${escapeAttr(promptQuery)}" placeholder="搜索名称、说明或正文"></label>
                    <button class="asset-btn primary" type="button" data-prompt-new ${readonly ? 'disabled' : ''}><i data-lucide="file-plus-2"></i><span>新增</span></button>
                    <button class="asset-btn ${promptManageMode ? 'primary' : ''}" type="button" data-prompt-manage><i data-lucide="list-checks"></i><span>${promptManageMode ? '完成管理' : '批量管理'}</span></button>
                </div>
            </div>
            <div class="manage-tools">
                <span>已选择 ${selectedPromptIds.size} 条提示词，支持拖拽框选或逐个勾选。</span>
                <div class="asset-tools">
                    <button class="asset-btn" type="button" data-prompt-select-all ${items.length && !readonly ? '' : 'disabled'}><i data-lucide="check-square"></i><span>全选</span></button>
                    <button class="asset-btn" type="button" data-prompt-clear-selection ${selectedPromptIds.size ? '' : 'disabled'}><i data-lucide="square"></i><span>清空</span></button>
                    <button class="asset-btn danger ${pendingBatchDelete === 'prompt' ? 'detail-confirm' : ''}" type="button" data-prompt-delete-selected ${readonly || !selectedPromptIds.size ? 'disabled' : ''}><i data-lucide="trash-2"></i><span>${pendingBatchDelete === 'prompt' ? '确认删除' : '删除所选'}</span></button>
                </div>
            </div>
            <div class="content-scroll">
                ${items.length ? `<div class="prompt-list">${items.map(item => renderPromptRow(item, readonly)).join('')}</div>` : managerEmptyState(promptQuery,promptEmptyText)}
            </div>
        </section>
        <aside class="asset-panel asset-detail">
            ${renderPromptDetail(detail, readonly)}
        </aside>
    `;
}
function renderPromptTreeBranch(lib){
    const isActiveLib = lib.id === activePromptLibraryId;
    // 每个库渲染自己的分类，不再回退到激活库/系统库的分类（修复新库错显系统分类）。
    const cats = promptCategoriesFor(lib);
    const libId = escapeAttr(lib.id);
    const readonly = Boolean(lib.readonly);
    const showLibActions = isActiveLib && promptTreeFocus === 'library';
    return `<div class="tree-branch ${isActiveLib ? 'expanded' : ''}">
        <button class="tree-row tree-parent ${isActiveLib ? 'contains-active' : ''} ${showLibActions ? 'active' : ''}" type="button" data-prompt-lib="${libId}">
            <span class="tree-row-icon"><i data-lucide="${lib.id === 'system' ? 'sparkles' : 'book-open'}"></i></span>
            <span class="tree-row-name">${escapeHtml(lib.name || '提示词库')}</span>
            <span class="tree-row-count">${(lib.items || []).length}</span>
        </button>
        ${showLibActions ? renderPromptTreeActionBar('library') : ''}
        <div class="tree-children">
            <button class="tree-row tree-child ${isActiveLib && activePromptCategory === 'all' && promptTreeFocus === 'category' ? 'active' : ''}" type="button" data-prompt-cat="all" data-prompt-cat-lib="${libId}">
                <span class="tree-elbow"></span>
                <span class="tree-row-icon"><i data-lucide="layout-list"></i></span>
                <span class="tree-row-name">全部提示词</span>
                <span class="tree-row-count">${promptCountForCategory('all', lib)}</span>
            </button>
            ${cats.map(cat => {
                const active = isActiveLib && cat.id === activePromptCategory && promptTreeFocus === 'category';
                return `<button class="tree-row tree-child ${active ? 'active' : ''}" type="button" data-prompt-cat="${escapeAttr(cat.id)}" data-prompt-cat-lib="${libId}">
                <span class="tree-elbow"></span>
                <span class="tree-row-icon"><i data-lucide="tag"></i></span>
                <span class="tree-row-name">${escapeHtml(cat.name || promptCategoryLabel(cat.id))}</span>
                <span class="tree-row-count">${promptCountForCategory(cat.id, lib)}</span>
            </button>${active ? renderPromptTreeActionBar('category') : ''}`;
            }).join('')}
        </div>
    </div>`;
}
function renderPromptTreeActionBar(kind){
    const editHtml = renderPromptTreeInlineEdit(kind);
    if(editHtml) return editHtml;
    if(kind === 'library'){
        const lib = activePromptLibrary();
        const isSystem = isSystemPromptLibrary(lib);
        const deleteKey = `prompt-lib:${lib?.id || ''}`;
        return `<div class="tree-action-bar library-actions">
            <button type="button" data-prompt-cat-new><i data-lucide="folder-plus"></i><span>新分组</span></button>
            <button type="button" data-prompt-lib-rename><i data-lucide="pencil"></i><span>重命名</span></button>
            ${isSystem ? '' : `<button type="button" class="danger ${pendingTreeDelete === deleteKey ? 'detail-confirm' : ''}" data-prompt-lib-delete><i data-lucide="trash-2"></i><span>${pendingTreeDelete === deleteKey ? '确认删除' : '删除库'}</span></button>`}
        </div>`;
    }
    if(activePromptCategory === 'all'){
        return `<div class="tree-action-bar child-actions muted-actions"><span><i data-lucide="lock"></i>请选择具体分组后编辑</span></div>`;
    }
    const deleteKey = `prompt-cat:${activePromptCategory}`;
    return `<div class="tree-action-bar child-actions">
        <button type="button" data-prompt-cat-rename><i data-lucide="pencil"></i><span>重命名</span></button>
        <button type="button" class="danger ${pendingTreeDelete === deleteKey ? 'detail-confirm' : ''}" data-prompt-cat-delete><i data-lucide="trash-2"></i><span>${pendingTreeDelete === deleteKey ? '确认删除' : '删除'}</span></button>
    </div>`;
}
function renderPromptTreeInlineEdit(kind){
    if(!promptTreeEdit) return '';
    if(promptTreeEdit.placement === 'head') return '';
    const expectedKinds = kind === 'library' ? ['library-new', 'library-rename', 'category-new'] : ['category-new', 'category-rename'];
    if(!expectedKinds.includes(promptTreeEdit.kind)) return '';
    const label = promptTreeEdit.label || '名称';
    return `<div class="tree-inline-edit ${kind === 'category' ? 'child-actions' : 'library-actions'}">
        <input id="promptTreeEditInput" type="text" value="${escapeAttr(promptTreeEdit.value || '')}" placeholder="${escapeAttr(label)}">
        <button type="button" class="primary" data-prompt-tree-edit-save><i data-lucide="check"></i><span>保存</span></button>
        <button type="button" data-prompt-tree-edit-cancel><i data-lucide="x"></i><span>取消</span></button>
    </div>`;
}
function renderPromptRow(item, readonly){
    return `<article class="prompt-row ${item.id === selectedPromptId ? 'active' : ''}" data-prompt-row="${escapeAttr(item.id)}">
        <input class="prompt-row-check" type="checkbox" data-prompt-check="${escapeAttr(item.id)}" ${selectedPromptIds.has(item.id) ? 'checked' : ''} ${readonly ? 'disabled' : ''}>
        <div class="prompt-row-main">
            <div class="prompt-row-title"><strong>${escapeHtml(item.name || '提示词')}</strong><span class="prompt-tag">${escapeHtml(promptCategoryLabel(item.category || 'custom'))}</span></div>
            <div class="prompt-row-scene">${escapeHtml(item.scene || '未填写用途说明')}</div>
            <div class="prompt-row-text">${escapeHtml(item.positive || '')}</div>
        </div>
    </article>`;
}
function renderPromptDetail(item, readonly){
    if(promptCreateMode && !readonly){
        return `
            <div class="panel-head">
                <div class="panel-title"><strong>新增提示词</strong><span>保存到当前提示词库</span></div>
                <div class="panel-actions">
                    <button class="asset-btn primary" type="button" data-prompt-create-save><i data-lucide="check"></i><span>保存</span></button>
                    <button class="asset-icon-btn" type="button" data-prompt-edit-cancel title="取消"><i data-lucide="x"></i></button>
                </div>
            </div>
            <div class="detail-scroll">
                <div class="inline-edit-form">
                    <label class="inline-edit-field"><span>名称</span><input id="promptEditName" type="text" value="" placeholder="提示词名称"></label>
                    <label class="inline-edit-field"><span>用途说明</span><textarea id="promptEditScene" placeholder="用途说明"></textarea></label>
                    <label class="inline-edit-field"><span>正向提示词</span><textarea id="promptEditPositive" placeholder="正向提示词"></textarea></label>
                    <label class="inline-edit-field"><span>负向提示词</span><textarea id="promptEditNegative" placeholder="负向提示词"></textarea></label>
                </div>
            </div>
        `;
    }
    if(!item) return `<div class="panel-head"><div class="panel-title"><strong>提示词预览</strong><span>选择一条提示词查看全文</span></div></div><div class="detail-scroll"><div class="detail-empty"><i data-lucide="text-cursor-input"></i><span>暂无可预览提示词</span></div></div>`;
    if(promptEditMode && item.id === selectedPromptId && !readonly){
        return `
            <div class="panel-head">
                <div class="panel-title"><strong>编辑提示词</strong><span>在当前库内保存</span></div>
                <div class="panel-actions">
                    <button class="asset-btn primary" type="button" data-prompt-edit-save="${escapeAttr(item.id)}"><i data-lucide="check"></i><span>保存</span></button>
                    <button class="asset-icon-btn" type="button" data-prompt-edit-cancel title="取消"><i data-lucide="x"></i></button>
                </div>
            </div>
            <div class="detail-scroll">
                <div class="inline-edit-form">
                    <label class="inline-edit-field"><span>名称</span><input id="promptEditName" type="text" value="${escapeAttr(item.name || '')}" placeholder="提示词名称"></label>
                    <label class="inline-edit-field"><span>用途说明</span><textarea id="promptEditScene" placeholder="用途说明">${escapeHtml(item.scene || '')}</textarea></label>
                    <label class="inline-edit-field"><span>正向提示词</span><textarea id="promptEditPositive" placeholder="正向提示词">${escapeHtml(item.positive || '')}</textarea></label>
                    <label class="inline-edit-field"><span>负向提示词</span><textarea id="promptEditNegative" placeholder="负向提示词">${escapeHtml(item.negative || '')}</textarea></label>
                </div>
            </div>
        `;
    }
    const params = item.params && typeof item.params === 'object' ? Object.entries(item.params) : [];
    return `
        <div class="panel-head">
            <div class="panel-title"><strong>提示词预览</strong><span>${escapeHtml(promptCategoryLabel(item.category || 'custom'))}</span></div>
            <div class="panel-actions">
                <button class="asset-icon-btn" type="button" data-prompt-edit-start="${escapeAttr(item.id)}" ${readonly ? 'disabled' : ''} title="编辑"><i data-lucide="pencil"></i></button>
                <button class="asset-icon-btn danger ${pendingDeletePromptId === item.id ? 'detail-confirm' : ''}" type="button" data-prompt-delete="${escapeAttr(item.id)}" ${readonly ? 'disabled' : ''} title="${pendingDeletePromptId === item.id ? '再次点击确认删除' : '删除'}"><i data-lucide="trash-2"></i></button>
            </div>
        </div>
        <div class="detail-scroll">
            <div class="prompt-detail-head">
                <div class="prompt-detail-title">${escapeHtml(item.name || '提示词')}</div>
                <div class="prompt-detail-scene">${escapeHtml(item.scene || '未填写用途说明')}</div>
            </div>
            <section class="prompt-block">
                <div class="prompt-block-head"><span>正向提示词</span><span>${String(item.positive || '').length} 字符</span></div>
                <div class="prompt-block-body">${escapeHtml(item.positive || '未填写')}</div>
            </section>
            <section class="prompt-block">
                <div class="prompt-block-head"><span>负向提示词</span><span>${String(item.negative || '').length} 字符</span></div>
                <div class="prompt-block-body negative">${escapeHtml(item.negative || '未填写')}</div>
            </section>
            ${params.length ? `<div class="params-list">${params.map(([key, value]) => `<div class="param-row"><strong>${escapeHtml(key)}</strong><span>${escapeHtml(value)}</span></div>`).join('')}</div>` : ''}
        </div>
    `;
}
async function uploadFiles(files){
    const cat = activeAssetCategory();
    if(!cat) throw new Error('请先创建图片分组');
    const libraryId=activeAssetLibraryId,categoryId=activeAssetCategoryId;
    const form = new FormData();
    [...files].forEach(file => form.append('files', file));
    const uploaded = await apiJson('/api/ai/upload', {method:'POST', body:form});
    const items = (uploaded.files || []).filter(file => file?.url).map(file => ({
        library_id:libraryId,
        category_id:categoryId,
        url:file.url,
        name:file.name || 'asset'
    }));
    if(!items.length) throw new Error('没有可保存的素材');
    const data = await apiJson('/api/asset-library/items/batch', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({library_id:libraryId, category_id:categoryId, items})
    });
    assetLibrary = data.library || assetLibrary;
    selectedAssetIds.clear();
    selectedAssetId = data.items?.[0]?.id || selectedAssetId;
    render();
    setStatus(`已上传 ${items.length} 个素材`);
    return {count:items.length, items:data.items || []};
}
async function uploadWorkflowFiles(files){
    const cat = activeWorkflowCategory();
    if(!cat) throw new Error('请先创建工作流分组');
    const list = [...files].filter(file => /\.(json|zip)$/i.test(file.name || '') || ['application/json','application/zip','application/x-zip-compressed'].includes(String(file.type || '').toLowerCase()));
    if(!list.length) throw new Error('没有可上传的工作流文件');
    const form = new FormData();
    form.append('library_id', activeWorkflowLibraryId || '');
    form.append('category_id', activeWorkflowCategoryId || '');
    list.forEach(file => form.append('files', file));
    const data = await apiJson('/api/asset-library/workflows/upload', {method:'POST', body:form});
    assetLibrary = data.library || assetLibrary;
    selectedWorkflowIds.clear();
    selectedWorkflowId = data.items?.[0]?.id || selectedWorkflowId;
    render();
    setStatus(`已上传 ${data.items?.length || 0} 个工作流`);
}
function downloadUrl(url, filename='download'){
    try{if(window.MemberMediaDownload?.(url,filename))return;}catch(error){setStatus(error.message || 'Download failed');return;}
    url = assetDisplayMediaUrl(url);
    if(!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || '';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    link.remove();
}
async function exportWorkflowItems(ids){
    const items = (ids || []).map(id => findWorkflowItem(id)).filter(item => item?.url);
    if(!items.length) return;
    if(items.length === 1){
        const item = items[0];
        const ext = String(item.url || '').toLowerCase().split('?')[0].endsWith('.json') ? '.json' : '.zip';
        downloadUrl(item.url, `${item.name || 'workflow'}${ext}`);
        setStatus('已导出工作流');
        return;
    }
    const res = await fetch('/api/canvas-assets/download', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({filename:'workflows.zip', items:items.map(item => ({url:item.url, name:item.name || 'workflow'}))})
    });
    if(!res.ok) throw new Error(assetErrorText(await res.json().catch(() => ({})), '导出工作流失败'));
    const blob = await res.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'workflows.zip';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1200);
    setStatus(`已导出 ${items.length} 个工作流`);
}
async function downloadCanvasAssetItems(ids){
    const items = (ids || []).map(id => findCanvasAssetItem(id)).filter(item => item?.url);
    if(!items.length){
        setStatus('没有可下载的画布资产');
        return;
    }
    if(items.length === 1){
        const item = items[0];
        downloadUrl(item.url, item.name || 'canvas-asset');
        setStatus('已下载画布资产');
        return;
    }
    setStatus(items.length === 1 ? '正在下载画布资产...' : `正在打包 ${items.length} 个画布资产...`);
    const res = await fetch('/api/canvas-assets/download', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({filename:'canvas-assets.zip', items:items.map(item => ({url:item.url, name:item.name || 'canvas-asset'}))})
    });
    if(!res.ok) throw new Error(assetErrorText(await res.json().catch(() => ({})), '下载画布资产失败'));
    const blob = await res.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = items.length === 1 ? (items[0].name || 'canvas-asset') : 'canvas-assets.zip';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1200);
    setStatus(`已下载 ${items.length} 个画布资产`);
}
function assetDownloadName(item){
    let name = String(item?.name || 'asset');
    const urlPath = String(item?.url || '').split('?')[0];
    const dot = urlPath.lastIndexOf('.');
    const ext = dot > urlPath.lastIndexOf('/') ? urlPath.slice(dot) : '';
    if(ext && !name.toLowerCase().endsWith(ext.toLowerCase())) name += ext;
    return name;
}
function downloadAssetItem(id){
    const item = findAssetItem(id);
    if(!item || !item.url){ setStatus('没有可下载的素材'); return; }
    const name = assetDownloadName(item);
    try{
        if(window.MemberMediaDownload?.(item.url,name)){setStatus('已开始下载');return;}
    }catch(error){setStatus(error.message || '下载失败');return;}

    // 走 /api/download-output 强制以附件形式下载（带正确文件名/后缀），而不是在浏览器里打开预览。
    downloadUrl(`/api/download-output?url=${encodeURIComponent(item.url)}&name=${encodeURIComponent(name)}`, name);
    setStatus('已开始下载');
}
const SMART_CANVAS_ASSET_INBOX_KEY = 'smart_canvas_asset_inbox';
function copySelectedAssetsToCanvas(){
    const items = [...selectedAssetIds]
        .map(id => findAssetItem(id))
        .filter(it => it?.url)
        .map(it => ({url: it.url, name: it.name || '素材', kind: it.kind || ''}));
    if(!items.length){ setStatus('没有可复制的素材'); return; }
    try {
        // 写入跨页剪贴板，画布页按 Ctrl+V 读取并批量粘贴
        const key = window.CanvasSession?.enabled ? window.CanvasSession.storageKey(SMART_CANVAS_ASSET_INBOX_KEY) : SMART_CANVAS_ASSET_INBOX_KEY;
        localStorage.setItem(key, JSON.stringify({items, ts: Date.now()}));
    } catch(err){
        setStatus('复制失败：' + (err?.message || err));
        return;
    }
    setStatus(`已复制 ${items.length} 个素材，去智能画布按 Ctrl+V 粘贴`);
}
async function downloadSelectedAssets(){
    const items = [...selectedAssetIds].map(id => findAssetItem(id)).filter(it => it?.url);
    if(!items.length){ setStatus('没有可下载的素材'); return; }
    if(items.length === 1){ downloadAssetItem(items[0].id); return; }
    setStatus(`正在打包 ${items.length} 个素材...`);
    try {
        const res = await fetch('/api/canvas-assets/download', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({filename:'assets.zip', items:items.map(it => ({url:it.url, name:assetDownloadName(it)}))})
        });
        if(!res.ok) throw new Error(assetErrorText(await res.json().catch(() => ({})), '下载失败'));
        const blob = await res.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'assets.zip';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1200);
        setStatus(`已下载 ${items.length} 个素材`);
    } catch(err){
        setStatus(err.message || '下载失败');
    }
}
async function renameWorkflowItem(id){
    const item = findWorkflowItem(id);
    const name = window.prompt('工作流名称', item?.name || '');
    if(!item || !String(name || '').trim()) return;
    const data = await apiJson(`/api/asset-library/items/${encodeURIComponent(id)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})});
    assetLibrary = data.library || assetLibrary;
    render();
    setStatus('已重命名工作流');
}
async function deleteWorkflowItem(id){
    const item = findWorkflowItem(id);
    if(!item) return;
    if(pendingDeleteAssetId !== id){
        pendingDeleteAssetId = id;
        render();
        setStatus('再次点击确认删除工作流');
        return;
    }
    const data = await apiJson(`/api/asset-library/items/${encodeURIComponent(id)}`, {method:'DELETE'});
    assetLibrary = data.library || assetLibrary;
    selectedWorkflowIds.delete(id);
    selectedWorkflowId = '';
    pendingDeleteAssetId = '';
    render();
    setStatus('已删除工作流');
}
async function deleteSelectedWorkflows(confirmed=false){
    const ids = [...selectedWorkflowIds];
    if(!ids.length) return;
    if(!confirmed) return confirmManagerBatchDelete('workflows',ids,()=>deleteSelectedWorkflows(true));
    const data = await apiJson('/api/asset-library/items/delete', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({library_id:activeWorkflowLibraryId, ids})});
    assetLibrary = data.library || assetLibrary;
    selectedWorkflowIds.clear();
    selectedWorkflowId = '';
    render();
    setStatus(`已删除 ${data.removed || 0} 个工作流`);
}
async function uploadLocalAssets(files){
    const list = [...files].filter(f => isLocalMediaFile(f));
    if(!list.length){ setStatus('没有可上传的图片/视频/音频文件'); return; }
    const form = new FormData();
    form.append('folder', activeLocalUploadFolder || '');
    list.forEach(file => form.append('files', file));
    setStatus('正在上传...');
    try {
        const data = await apiJson('/api/local-assets/upload', {method:'POST', body:form});
        const uploaded = Array.isArray(data.files) ? data.files : [];
        await loadLocalAssets();
        selectedLocalUploadId = uploaded[0]?.id || selectedLocalUploadId;
        render();
        setStatus(`已上传 ${uploaded.length} 个素材`);
    } catch(err) {
        setStatus(err.message || '上传失败');
    }
}
async function deleteLocalAssets(ids){
    const names = (ids || []).map(id => findLocalUpload(id)?.file).filter(Boolean);
    if(!names.length) return;
    setStatus('正在删除...');
    try {
        await apiJson('/api/local-assets/delete', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({names})
        });
        await loadLocalAssets();
        selectedLocalUploadIds.clear();
        if(selectedLocalUploadId && !findLocalUpload(selectedLocalUploadId)) selectedLocalUploadId = '';
        render();
        setStatus(`已删除 ${names.length} 个素材`);
    } catch(err) {
        setStatus(err.message || '删除失败');
    }
}
async function createLocalUploadFolder(){
    const name = window.prompt('新建文件夹名称', '新文件夹');
    if(!String(name || '').trim()) return;
    try {
        const data = await apiJson('/api/local-assets/folders', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({parent:activeLocalUploadFolder || '', name})
        });
        localAssets = Array.isArray(data.items) ? data.items : localAssets;
        localUploadTree = data.tree || localUploadTree;
        activeLocalUploadFolder = data.folder?.path || activeLocalUploadFolder;
        selectedLocalUploadId = '';
        selectedLocalUploadIds.clear();
        render();
        setStatus('已新建本地素材文件夹');
    } catch(err) {
        setStatus(err.message || '新建文件夹失败');
    }
}
async function renameLocalUploadFolder(){
    if(!activeLocalUploadFolder){
        setStatus('根目录不能重命名');
        return;
    }
    const current = localUploadFolderTitle();
    const name = window.prompt('重命名文件夹', current);
    if(!String(name || '').trim() || name === current) return;
    try {
        const data = await apiJson('/api/local-assets/folders', {
            method:'PATCH',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({path:activeLocalUploadFolder, name})
        });
        localAssets = Array.isArray(data.items) ? data.items : localAssets;
        localUploadTree = data.tree || localUploadTree;
        activeLocalUploadFolder = data.folder?.path || activeLocalUploadFolder;
        selectedLocalUploadId = '';
        selectedLocalUploadIds.clear();
        render();
        setStatus('已重命名本地素材文件夹');
    } catch(err) {
        setStatus(err.message || '重命名文件夹失败');
    }
}
async function runLocalUploadCaptionSelected(){
    const images = selectedLocalUploadImageItems();
    if(!images.length || localCaptionBusy) return;
    normalizeLocalCaptionSettings();
    if(!localCaptionProvider || !localCaptionModel){
        setStatus('请先在 API 设置中配置可用的聊天/视觉模型');
        return;
    }
    localCaptionBusy = true;
    render();
    setStatus(`正在反推 ${images.length} 张本地图片的提示词...`);
    try {
        const data = await apiJson('/api/local-assets/caption', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
                names:images.map(item => item.file || item.id),
                provider:localCaptionProvider,
                model:localCaptionModel,
                prompt:(localCaptionPrompt || '描述图片').trim() || '描述图片'
            })
        });
        await loadLocalAssets();
        selectedLocalUploadIds.clear();
        if(images[0]?.id) selectedLocalUploadId = images[0].id;
        render();
        const failed = (data.items || []).filter(item => !item.ok);
        setStatus(failed.length ? `已完成 ${data.count || 0} 张，${failed.length} 张失败：${failed[0].error || '反推失败'}` : `已反推并保存 ${data.count || images.length} 张图片提示词`);
    } catch(err) {
        setStatus(err.message || '提示词反推失败');
    } finally {
        localCaptionBusy = false;
        render();
    }
}
async function saveLocalUploadCaption(id){
    const item = findLocalUpload(id);
    if(!item || assetKind(item) !== 'image') return;
    const textarea = document.getElementById('localUploadCaptionEdit');
    const caption = textarea ? textarea.value : (item.caption || '');
    try {
        const data = await apiJson('/api/local-assets/caption', {
            method:'PATCH',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({name:item.file || item.id, caption})
        });
        item.caption = data.caption || '';
        item.caption_file = data.caption_file || item.caption_file || '';
        render();
        setStatus('已保存反推提示词');
    } catch(err) {
        setStatus(err.message || '保存提示词失败');
    }
}
function openManagerUpload(kind){
    if(!uploadInput) return;
    uploadInput.accept = kind === 'workflow'
        ? '.json,.zip,application/json,application/zip,application/x-zip-compressed'
        : 'image/*,video/*,audio/*';
    uploadInput.click();
}
async function handleClick(event){
    if(suppressClickAfterMarquee){
        suppressClickAfterMarquee = false;
        return;
    }
    const target = event.target;
    if(target.closest?.('[data-manager-retry]')){ await switchManagerTab(activeTab); return; }
    if(target.closest?.('[data-manager-cancel-delete]')){ cancelManagerDelete();setStatus('已取消删除');return; }
    if(target.closest?.('[data-manager-clear-search]')){
        restoreManagerDescriptor({...managerViewDescriptor(),query:'',selectedId:''});
        if(activeTab === 'canvas-assets') await reloadCanvasCatalog();
        else render({resetScroll:true});
        return;
    }
    const navToggle=target.closest?.('[data-manager-toggle]');
    if(navToggle){
        const key=navToggle.dataset.managerToggle;
        const collapsed=!managerViews.collapsed[key];
        managerViews.collapsed[key]=collapsed;
        navToggle.setAttribute('aria-expanded',String(!collapsed));
        navToggle.innerHTML=`<i data-lucide="${collapsed ? 'chevron-right' : 'chevron-down'}" aria-hidden="true"></i>`;
        window.lucide?.createIcons({root:navToggle});
        navToggle.setAttribute('aria-label',`${collapsed ? '展开' : '折叠'}${navToggle.nextElementSibling.textContent.trim()}`);
        navToggle.closest('.tree-branch').querySelector(':scope > .tree-children').hidden=collapsed;
        rememberManagerView(captureManagerView());
        return;
    }
    if(handleManagerSelectionClick(target)) return;
    const tabBtn = target.closest?.('[data-tab]');
    if(tabBtn){ switchManagerTab(tabBtn.dataset.tab || 'assets'); return; }
    if(target.closest?.('#refreshBtn')){ await refreshCurrentManager(); return; }
    const assetPreview = target.closest?.('[data-asset-preview]');
    if(assetPreview){ showDetailPreview('asset', assetPreview.dataset.assetPreview || ''); return; }
    const canvasAssetPreview = target.closest?.('[data-canvas-asset-preview]');
    if(canvasAssetPreview){ showDetailPreview('canvas-asset', canvasAssetPreview.dataset.canvasAssetPreview || ''); return; }
    const localPreview = target.closest?.('[data-local-preview]');
    if(localPreview){ showDetailPreview('local', localPreview.dataset.localPreview || ''); return; }
    const localUpPreview = target.closest?.('[data-localup-preview]');
    if(localUpPreview){ showDetailPreview('localup', localUpPreview.dataset.localupPreview || ''); return; }
    if(target.closest?.('[data-localup-upload]')){ openManagerUpload('media'); return; }
    if(target.closest?.('[data-localup-folder-new]')){ await createLocalUploadFolder(); return; }
    if(target.closest?.('[data-localup-folder-rename]')){ await renameLocalUploadFolder(); return; }
    const localUpFolder = target.closest?.('[data-localup-folder]');
    if(localUpFolder){
        activeLocalUploadFolder = localUpFolder.dataset.localupFolder || '';
        selectedLocalUploadId = '';
        selectedLocalUploadIds.clear();
        pendingBatchDelete = '';
        render();
        return;
    }
    if(target.closest?.('[data-localup-manage]')){
        localUploadManageMode = !localUploadManageMode;
        if(!localUploadManageMode) selectedLocalUploadIds.clear();
        render();
        return;
    }
    if(target.closest?.('[data-localup-select-all]')){ localUploadItems().forEach(item => selectedLocalUploadIds.add(item.id)); render(); return; }
    if(target.closest?.('[data-localup-clear]')){ selectedLocalUploadIds.clear(); render(); return; }
    if(target.closest?.('[data-localup-delete-selected]')){ const ids=[...selectedLocalUploadIds];await confirmManagerBatchDelete('local',ids,()=>deleteLocalAssets(ids)); return; }
    if(target.closest?.('[data-local-caption-run]')){ await runLocalUploadCaptionSelected(); return; }
    const localUpCaptionSave = target.closest?.('[data-localup-caption-save]');
    if(localUpCaptionSave){ await saveLocalUploadCaption(localUpCaptionSave.dataset.localupCaptionSave || ''); return; }
    const localUpDeleteOne = target.closest?.('[data-localup-delete-one]');
    if(localUpDeleteOne){ await deleteLocalAssets([localUpDeleteOne.dataset.localupDeleteOne || '']); return; }
    const localUpCheck = target.closest?.('[data-localup-check]');
    if(localUpCheck){
        const id = localUpCheck.dataset.localupCheck || '';
        if(selectedLocalUploadIds.has(id)) selectedLocalUploadIds.delete(id); else selectedLocalUploadIds.add(id);
        render();
        return;
    }
    const localUpOpen = target.closest?.('[data-localup-open]');
    if(localUpOpen){ const it = findLocalUpload(localUpOpen.dataset.localupOpen || ''); if(it?.url) openAssetUrl(it.url); return; }
    const localUpCopy = target.closest?.('[data-localup-copy]');
    if(localUpCopy){ const it = findLocalUpload(localUpCopy.dataset.localupCopy || ''); const ok = await copyTextToClipboard(it?.url || ''); setStatus(ok ? '已复制链接' : '复制失败'); return; }
    const localUpCard = target.closest?.('[data-localup-card]');
    if(localUpCard){
        if(localUploadManageMode){
            const id = localUpCard.dataset.localupCard || '';
            if(selectedLocalUploadIds.has(id)) selectedLocalUploadIds.delete(id); else selectedLocalUploadIds.add(id);
        } else {
            selectedLocalUploadId = localUpCard.dataset.localupCard || '';
        }
        render();
        return;
    }
    if(target.closest?.('[data-local-pick-folder]')){ await registerSharedFolder(); return; }
    const canvasAssetCat = target.closest?.('[data-canvas-asset-cat]');
    if(canvasAssetCat){
        activeCanvasAssetCategory = canvasAssetCat.dataset.canvasAssetCat || defaultCanvasAssetCategory();
        activeCanvasAssetCanvasId = '';
        selectedCanvasAssetId = '';
        selectedCanvasAssetIds.clear();
        await reloadCanvasCatalog();
        return;
    }
    const canvasAssetCanvas = target.closest?.('[data-canvas-asset-canvas]');
    if(canvasAssetCanvas){
        activeCanvasAssetCategory = canvasAssetCanvas.dataset.canvasAssetCanvasCat || activeCanvasAssetCategory || 'all';
        activeCanvasAssetCanvasId = canvasAssetCanvas.dataset.canvasAssetCanvas || '';
        selectedCanvasAssetId = '';
        selectedCanvasAssetIds.clear();
        await reloadCanvasCatalog();
        return;
    }
    const pageButton=target.closest?.('[data-canvas-page]');
    if(pageButton){await reloadCanvasCatalog(Number(pageButton.dataset.canvasPage));return;}
    const sourceFilter=target.closest?.('[data-canvas-source]');
    if(sourceFilter){canvasAssetSourceState=sourceFilter.dataset.canvasSource;activeCanvasAssetCanvasId='';selectedCanvasAssetId='';selectedCanvasAssetIds.clear();await reloadCanvasCatalog();return;}
    if(target.closest?.('[data-catalog-toggle]')){ canvasAssetTrashMode=!canvasAssetTrashMode;activeCanvasAssetCanvasId='';selectedCanvasAssetIds.clear();await reloadCanvasCatalog();return; }
    const catalogAction=target.closest?.('[data-catalog-action]');
    if(catalogAction){await openCanvasCatalog(catalogAction.dataset.catalogAction,[catalogAction.dataset.catalogId]);return;}
    const catalogBatch=target.closest?.('[data-catalog-batch]');
    if(catalogBatch){await openCanvasCatalog(catalogBatch.dataset.catalogBatch,[...selectedCanvasAssetIds]);return;}
    if(target.closest?.('[data-canvas-asset-manage]')){
        canvasAssetManageMode = !canvasAssetManageMode;
        if(!canvasAssetManageMode) selectedCanvasAssetIds.clear();
        render();
        return;
    }
    if(target.closest?.('[data-canvas-asset-select-all]')){ currentCanvasAssetItems().forEach(item => selectedCanvasAssetIds.add(item.id)); refreshCanvasAssetSelectionOnly({detail:false}); return; }
    if(target.closest?.('[data-canvas-asset-clear-selection]')){ selectedCanvasAssetIds.clear(); refreshCanvasAssetSelectionOnly({detail:false}); return; }
    if(target.closest?.('[data-canvas-asset-download-selected]')){ await downloadCanvasAssetItems([...selectedCanvasAssetIds]); return; }
    const canvasAssetDownload = target.closest?.('[data-canvas-asset-download]');
    if(canvasAssetDownload){ await downloadCanvasAssetItems([canvasAssetDownload.dataset.canvasAssetDownload || '']); return; }
    const canvasAssetOpen = target.closest?.('[data-canvas-asset-open]');
    if(canvasAssetOpen){ const it = findCanvasAssetItem(canvasAssetOpen.dataset.canvasAssetOpen || ''); if(it?.url) openAssetUrl(it.url); return; }
    const canvasAssetCopy = target.closest?.('[data-canvas-asset-copy]');
    if(canvasAssetCopy){ const it = findCanvasAssetItem(canvasAssetCopy.dataset.canvasAssetCopy || ''); const ok = await copyTextToClipboard(it?.url || ''); setStatus(ok ? '已复制画布资产链接' : '复制失败'); return; }
    if(target.closest?.('[data-canvas-asset-check]')) return;
    const canvasAssetCard = target.closest?.('[data-canvas-asset-card]');
    if(canvasAssetCard){
        const id = canvasAssetCard.dataset.canvasAssetCard || '';
        selectedCanvasAssetId = id;
        if(canvasAssetManageMode){
            if(selectedCanvasAssetIds.has(id)) selectedCanvasAssetIds.delete(id); else selectedCanvasAssetIds.add(id);
        }
        refreshCanvasAssetSelectionOnly();
        return;
    }
    const sharedRemove = target.closest?.('[data-shared-remove]');
    if(sharedRemove){ event.stopPropagation(); await unregisterSharedFolder(sharedRemove.dataset.sharedRemove || ''); return; }
    const sharedOpen = target.closest?.('[data-shared-open]');
    if(sharedOpen){ await openSharedFolder(sharedOpen.dataset.sharedOpen || ''); return; }
    if(target.closest?.('[data-local-manage]')){
        localManageMode = !localManageMode;
        pendingBatchDelete = '';
        if(!localManageMode) selectedLocalIds.clear();
        render();
        return;
    }
    if(target.closest?.('[data-local-select-all]')){ localItemsForFolder().forEach(item => selectedLocalIds.add(item.id)); pendingBatchDelete = ''; render(); return; }
    if(target.closest?.('[data-local-clear-selection]')){ selectedLocalIds.clear(); pendingBatchDelete = ''; render(); return; }
    if(target.closest?.('[data-local-copy-selected]')){ setLocalClipboard('copy'); return; }
    if(target.closest?.('[data-local-import-clipboard]')){ await pasteLocalClipboardToAssets(); return; }
    if(target.closest?.('[data-local-clear-clipboard]')){ localClipboard = null; render(); return; }
    const localImportOne = target.closest?.('[data-local-import-one]');
    if(localImportOne){ setLocalClipboard('copy', [localImportOne.dataset.localImportOne || '']); await pasteLocalClipboardToAssets(); return; }
    const localOpen = target.closest?.('[data-local-open]');
    if(localOpen){ openLocalItem(localOpen.dataset.localOpen || ''); return; }
    const localFolder = target.closest?.('[data-local-folder]');
    if(localFolder){ activeLocalFolderId = localFolder.dataset.localFolder || ''; selectedLocalId = ''; selectedLocalIds.clear(); pendingBatchDelete = ''; render(); return; }
    if(target.closest?.('[data-local-check]')) return;
    const localCard = target.closest?.('[data-local-card]');
    if(localCard){
        const id = localCard.dataset.localCard || '';
        selectedLocalId = id;
        if(localManageMode){
            if(selectedLocalIds.has(id)) selectedLocalIds.delete(id); else selectedLocalIds.add(id);
        }
        render();
        return;
    }
    if(target.closest?.('[data-workflow-manage]')){
        workflowManageMode = !workflowManageMode;
        if(!workflowManageMode) selectedWorkflowIds.clear();
        pendingDeleteAssetId = '';
        render();
        return;
    }
    if(target.closest?.('[data-workflow-select-all]')){ currentWorkflowItems().forEach(item => selectedWorkflowIds.add(item.id)); render(); return; }
    if(target.closest?.('[data-workflow-clear-selection]')){ selectedWorkflowIds.clear(); render(); return; }
    if(target.closest?.('[data-workflow-export-selected]')){ await exportWorkflowItems([...selectedWorkflowIds]); return; }
    if(target.closest?.('[data-workflow-delete-selected]')){ await deleteSelectedWorkflows(); return; }
    if(target.closest?.('[data-workflow-upload]')){
        openManagerUpload('workflow');
        return;
    }
    const workflowDownload = target.closest?.('[data-workflow-download]');
    if(workflowDownload){ await exportWorkflowItems([workflowDownload.dataset.workflowDownload || '']); return; }
    const workflowRename = target.closest?.('[data-workflow-rename]');
    if(workflowRename){ await renameWorkflowItem(workflowRename.dataset.workflowRename || ''); return; }
    const workflowDelete = target.closest?.('[data-workflow-delete]');
    if(workflowDelete){ await deleteWorkflowItem(workflowDelete.dataset.workflowDelete || ''); return; }
    if(target.closest?.('[data-workflow-cat-new]')){
        workflowTreeEdit = {kind:'category-new', placement:'head', value:'新工作流分组', label:'工作流分组名称'};
        pendingTreeDelete = '';
        render();
        focusTreeEditInput('workflowTreeEditInput');
        return;
    }
    if(target.closest?.('[data-workflow-cat-rename]')){
        const cat = activeWorkflowCategory();
        if(!cat) return;
        workflowTreeEdit = {kind:'category-rename', value:cat.name || '', label:'工作流分组名称', categoryId:cat.id};
        pendingTreeDelete = '';
        render();
        focusTreeEditInput('workflowTreeEditInput');
        return;
    }
    if(target.closest?.('[data-workflow-cat-delete]')){ await deleteWorkflowCategory(); return; }
    const workflowLib = target.closest?.('[data-workflow-lib]');
    if(workflowLib){ activeWorkflowLibraryId = workflowLib.dataset.workflowLib || ''; activeWorkflowCategoryId = ''; selectedWorkflowId = ''; selectedWorkflowIds.clear(); render(); return; }
    const workflowCat = target.closest?.('[data-workflow-cat]');
    if(workflowCat){ activeWorkflowLibraryId = workflowCat.dataset.workflowCatLib || activeWorkflowLibraryId; activeWorkflowCategoryId = workflowCat.dataset.workflowCat || ''; selectedWorkflowId = ''; selectedWorkflowIds.clear(); render(); return; }
    const workflowCard = target.closest?.('[data-workflow-card]');
    if(workflowCard){
        const id = workflowCard.dataset.workflowCard || '';
        selectedWorkflowId = id;
        if(workflowManageMode){
            if(selectedWorkflowIds.has(id)) selectedWorkflowIds.delete(id); else selectedWorkflowIds.add(id);
        }
        pendingDeleteAssetId = '';
        render();
        return;
    }
    if(target.closest?.('[data-asset-tree-edit-save]')){ await saveAssetTreeEdit(); return; }
    if(target.closest?.('[data-asset-tree-edit-cancel]')){ assetTreeEdit = null; render(); return; }
    if(target.closest?.('[data-workflow-tree-edit-save]')){ await saveWorkflowTreeEdit(); return; }
    if(target.closest?.('[data-workflow-tree-edit-cancel]')){ workflowTreeEdit = null; render(); return; }
    if(target.closest?.('[data-prompt-tree-edit-save]')){ await savePromptTreeEdit(); return; }
    if(target.closest?.('[data-prompt-tree-edit-cancel]')){ promptTreeEdit = null; render(); return; }
    const assetEditSave = target.closest?.('[data-asset-edit-save]');
    if(assetEditSave){ await saveAssetEdit(assetEditSave.dataset.assetEditSave || ''); return; }
    if(target.closest?.('[data-asset-edit-cancel]')){ assetEditMode = false; render(); return; }
    const assetEditStart = target.closest?.('[data-asset-edit-start]');
    if(assetEditStart){ selectedAssetId = assetEditStart.dataset.assetEditStart || selectedAssetId; assetEditMode = true; pendingDeleteAssetId = ''; render(); return; }
    if(target.closest?.('[data-asset-manage]')){
        assetManageMode = !assetManageMode;
        pendingBatchDelete = '';
        if(!assetManageMode) selectedAssetIds.clear();
        render();
        return;
    }
    if(target.closest?.('[data-asset-select-all]')){ currentAssetItems().forEach(item => selectedAssetIds.add(item.id)); pendingBatchDelete = ''; refreshAssetSelectionOnly({detail:false}); return; }
    if(target.closest?.('[data-asset-clear-selection]')){ selectedAssetIds.clear(); pendingBatchDelete = ''; refreshAssetSelectionOnly({detail:false}); return; }
    if(target.closest?.('[data-asset-cut-selected]')){ setAssetClipboard('cut'); return; }
    if(target.closest?.('[data-asset-copy-selected]')){ setAssetClipboard('copy'); return; }
    if(target.closest?.('[data-asset-paste-clipboard]')){ await pasteAssetClipboard(); return; }
    if(target.closest?.('[data-asset-clear-clipboard]')){ assetClipboard = null; render(); return; }
    const assetRename = target.closest?.('[data-asset-rename]');
    if(assetRename){ await renameAssetItem(assetRename.dataset.assetRename || ''); return; }
    const assetDelete = target.closest?.('[data-asset-delete]');
    if(assetDelete){ await deleteAssetItem(assetDelete.dataset.assetDelete || ''); return; }
    const assetDownload = target.closest?.('[data-asset-download]');
    if(assetDownload){ downloadAssetItem(assetDownload.dataset.assetDownload || ''); return; }
    const assetOpen = target.closest?.('[data-asset-open]');
    if(assetOpen){ openAssetItem(assetOpen.dataset.assetOpen || ''); return; }
    const avatarCopy = target.closest?.('[data-avatar-copy]');
    if(avatarCopy){
        const uri = avatarCopy.dataset.avatarCopy || '';
        const ok = await copyTextToClipboard(uri);
        setStatus(ok ? '已复制 asset:// 地址' : `复制失败，请手动复制：${uri}`);
        return;
    }
    const avatarRegisterSelected = target.closest?.('[data-avatar-register-selected]');
    if(avatarRegisterSelected){ await registerSelectedAssetAvatars(); return; }
    const avatarCancel = target.closest?.('[data-avatar-cancel]');
    if(avatarCancel){ await cancelAssetAvatar(avatarCancel.dataset.avatarCancel || '', avatarCancel.dataset.avatarProv || ''); return; }
    const avatarRegister = target.closest?.('[data-avatar-register]');
    if(avatarRegister){ await registerAssetAvatar(avatarRegister.dataset.avatarRegister || '', avatarRegister.dataset.avatarProv || ''); return; }
    const avatarCheck = target.closest?.('[data-avatar-check]');
    if(avatarCheck){ await checkAssetAvatarStatus(avatarCheck.dataset.avatarCheck || '', false, avatarCheck.dataset.avatarProv || ''); return; }
    if(target.closest?.('[data-asset-download-selected]')){ await downloadSelectedAssets(); return; }
    if(target.closest?.('[data-asset-copy-to-canvas]')){ copySelectedAssetsToCanvas(); return; }
    if(target.closest?.('[data-asset-delete-selected]')){ await deleteSelectedAssets(); return; }
    if(target.closest?.('[data-asset-upload]')){
        openManagerUpload('media');
        return;
    }
    if(target.closest?.('[data-asset-lib-new]')){ assetTreeFocus = 'library'; assetTreeEdit = {kind:'library-new', placement:'head', value:'新资产库', label:'资产库名称'}; render(); focusTreeEditInput('assetTreeEditInput'); return; }
    if(target.closest?.('[data-asset-lib-rename]')){
        const row = target.closest('[data-asset-lib]');
        if(row) activeAssetLibraryId = row.dataset.assetLib || activeAssetLibraryId;
        assetTreeFocus = 'library';
        assetTreeEdit = {kind:'library-rename', value:activeAssetLibrary()?.name || '', label:'资产库名称'};
        pendingTreeDelete = '';
        render(); return;
    }
    if(target.closest?.('[data-asset-lib-delete]')){
        const row = target.closest('[data-asset-lib]');
        if(row) activeAssetLibraryId = row.dataset.assetLib || activeAssetLibraryId;
        await deleteAssetLibrary(); return;
    }
    if(target.closest?.('[data-asset-cat-new]')){
        const row = target.closest('[data-asset-lib]');
        const catRow = target.closest('[data-asset-cat]');
        if(row) activeAssetLibraryId = row.dataset.assetLib || activeAssetLibraryId;
        if(catRow) activeAssetLibraryId = catRow.dataset.assetCatLib || activeAssetLibraryId;
        assetTreeEdit = {kind:'category-new', value:'新分组', label:'分组名称'};
        pendingTreeDelete = '';
        render(); return;
    }
    if(target.closest?.('[data-asset-cat-rename]')){
        const row = target.closest('[data-asset-cat]');
        if(row){ activeAssetLibraryId = row.dataset.assetCatLib || activeAssetLibraryId; activeAssetCategoryId = row.dataset.assetCat || activeAssetCategoryId; }
        assetTreeFocus = 'category';
        assetTreeEdit = {kind:'category-rename', value:activeAssetCategory()?.name || '', label:'分组名称'};
        pendingTreeDelete = '';
        render(); return;
    }
    if(target.closest?.('[data-asset-cat-delete]')){
        const row = target.closest('[data-asset-cat]');
        if(row){ activeAssetLibraryId = row.dataset.assetCatLib || activeAssetLibraryId; activeAssetCategoryId = row.dataset.assetCat || activeAssetCategoryId; }
        await deleteAssetCategory(); return;
    }
    const assetLib = target.closest?.('[data-asset-lib]');
    if(assetLib){
        const libraryId = assetLib.dataset.assetLib || '';
        if(libraryId === activeAssetLibraryId){
            if(collapsedAssetLibraryIds.has(libraryId)) collapsedAssetLibraryIds.delete(libraryId); else collapsedAssetLibraryIds.add(libraryId);
            saveCollapsedAssetLibraryIds();
            assetTreeFocus='library';
            const tree=root.querySelector('.asset-library-tree');
            if(tree){ tree.innerHTML=assetLibraries().map(renderAssetTreeBranch).join(''); refreshIcons(); }
            scheduleAssetViewSave();
            return;
        } else {
            activeAssetLibraryId = libraryId;
            collapsedAssetLibraryIds.delete(libraryId);
            const remembered=managerViews.libraries[JSON.stringify(['assets',libraryId])];
            activeAssetCategoryId = assetCategories().some(cat=>cat.id===remembered) ? remembered : assetCategories()[0]?.id || '';
            selectedAssetId = '';
            selectedAssetIds.clear();
        }
        saveCollapsedAssetLibraryIds();
        assetTreeFocus = 'library';
        renderPreservingScroll();
        return;
    }
    const assetCat = target.closest?.('[data-asset-cat]');
    if(assetCat){ activeAssetLibraryId = assetCat.dataset.assetCatLib || activeAssetLibraryId; collapsedAssetLibraryIds.delete(activeAssetLibraryId); saveCollapsedAssetLibraryIds(); activeAssetCategoryId = assetCat.dataset.assetCat || ''; assetTreeFocus = 'category'; selectedAssetId = ''; selectedAssetIds.clear(); renderPreservingScroll(); return; }
    if(target.closest?.('[data-asset-load-more]')){ appendNextAssetBatch(); return; }
    const assetCard = target.closest?.('[data-asset-card]');
    if(assetCard && !target.closest?.('[data-asset-check]')){
        const id = assetCard.dataset.assetCard || '';
        selectedAssetId = id;
        assetEditMode = false;
        pendingDeleteAssetId = '';
        if(assetManageMode){
            if(selectedAssetIds.has(id)) selectedAssetIds.delete(id); else selectedAssetIds.add(id);
            pendingBatchDelete = '';
        }
        refreshAssetSelectionOnly();
        return;
    }

    const promptEditSave = target.closest?.('[data-prompt-edit-save]');
    if(promptEditSave){ await savePromptEdit(promptEditSave.dataset.promptEditSave || ''); return; }
    if(target.closest?.('[data-prompt-create-save]')){ await savePromptCreate(); return; }
    if(target.closest?.('[data-prompt-edit-cancel]')){ promptEditMode = false; promptCreateMode = false; render(); return; }
    const promptEditStart = target.closest?.('[data-prompt-edit-start]');
    if(promptEditStart){ selectedPromptId = promptEditStart.dataset.promptEditStart || selectedPromptId; promptEditMode = true; promptCreateMode = false; pendingDeletePromptId = ''; render(); return; }
    if(target.closest?.('[data-prompt-manage]')){
        promptManageMode = !promptManageMode;
        pendingBatchDelete = '';
        if(!promptManageMode) selectedPromptIds.clear();
        render();
        return;
    }
    if(target.closest?.('[data-prompt-select-all]')){ currentPromptItems().forEach(item => selectedPromptIds.add(item.id)); pendingBatchDelete = ''; render(); return; }
    if(target.closest?.('[data-prompt-clear-selection]')){ selectedPromptIds.clear(); pendingBatchDelete = ''; render(); return; }
    const promptEdit = target.closest?.('[data-prompt-edit]');
    if(promptEdit){ await editPromptItem(promptEdit.dataset.promptEdit || ''); return; }
    const promptDelete = target.closest?.('[data-prompt-delete]');
    if(promptDelete){ await deletePromptItem(promptDelete.dataset.promptDelete || ''); return; }
    if(target.closest?.('[data-prompt-delete-selected]')){ await deleteSelectedPrompts(); return; }
    const promptNewBtn = target.closest?.('[data-prompt-new]');
    if(promptNewBtn){
        const libId = promptNewBtn.dataset.libId || target.closest('[data-prompt-lib]')?.dataset.promptLib;
        const catRow = target.closest('[data-prompt-cat]');
        if(libId){ activePromptLibraryId = libId; activePromptCategory = 'all'; }
        if(catRow){ activePromptLibraryId = catRow.dataset.promptCatLib || activePromptLibraryId; activePromptCategory = catRow.dataset.promptCat || activePromptCategory; }
        promptCreateMode = true; promptEditMode = false; pendingDeletePromptId = ''; render(); return;
    }
    if(target.closest?.('[data-prompt-lib-new]')){ promptTreeFocus = 'library'; promptTreeEdit = {kind:'library-new', placement:'head', value:'新提示词库', label:'提示词库名称'}; render(); focusTreeEditInput('promptTreeEditInput'); return; }
    if(target.closest?.('[data-prompt-cat-new]')){
        const libRow = target.closest('[data-prompt-lib]');
        if(libRow) activePromptLibraryId = libRow.dataset.promptLib || activePromptLibraryId;
        promptTreeFocus = 'library';
        promptTreeEdit = {kind:'category-new', value:'新分组', label:'分组名称'};
        pendingTreeDelete = '';
        render(); return;
    }
    if(target.closest?.('[data-prompt-cat-rename]')){
        promptTreeFocus = 'category';
        const cat = activePromptCategories().find(c => c.id === activePromptCategory);
        promptTreeEdit = {kind:'category-rename', value:cat?.name || '', label:'分组名称'};
        pendingTreeDelete = '';
        render(); return;
    }
    if(target.closest?.('[data-prompt-cat-delete]')){ await deletePromptCategory(); return; }
    const promptLibRenameBtn = target.closest?.('[data-prompt-lib-rename]');
    if(promptLibRenameBtn){
        const libRow = target.closest('[data-prompt-lib]');
        if(promptLibRenameBtn.dataset.libId) activePromptLibraryId = promptLibRenameBtn.dataset.libId;
        if(libRow) activePromptLibraryId = libRow.dataset.promptLib || activePromptLibraryId;
        promptTreeFocus = 'library';
        promptTreeEdit = {kind:'library-rename', value:activePromptLibrary()?.name || '', label:'提示词库名称'};
        render(); return;
    }
    const promptLibDeleteBtn = target.closest?.('[data-prompt-lib-delete]');
    if(promptLibDeleteBtn){
        if(promptLibDeleteBtn.dataset.libId) activePromptLibraryId = promptLibDeleteBtn.dataset.libId;
        await deletePromptLibrary(); return;
    }
    const promptLib = target.closest?.('[data-prompt-lib]');
    if(promptLib){ activePromptLibraryId = promptLib.dataset.promptLib || ''; activePromptCategory = managerViews.libraries[JSON.stringify(['prompts',activePromptLibraryId])] || 'all'; promptTreeFocus = 'library'; selectedPromptId = ''; promptCreateMode = false; promptEditMode = false; selectedPromptIds.clear(); renderPreservingScroll(); return; }
    const promptCat = target.closest?.('[data-prompt-cat]');
    if(promptCat){ activePromptLibraryId = promptCat.dataset.promptCatLib || activePromptLibraryId; activePromptCategory = promptCat.dataset.promptCat || 'all'; promptTreeFocus = 'category'; selectedPromptId = ''; promptCreateMode = false; promptEditMode = false; selectedPromptIds.clear(); render(); return; }
    const promptRow = target.closest?.('[data-prompt-row]');
    if(promptRow){
        const id = promptRow.dataset.promptRow || '';
        selectedPromptId = id;
        promptEditMode = false;
        promptCreateMode = false;
        pendingDeletePromptId = '';
        if(promptManageMode){
            if(selectedPromptIds.has(id)) selectedPromptIds.delete(id); else selectedPromptIds.add(id);
            pendingBatchDelete = '';
        }
        render();
        return;
    }
}
function mergeAssetItem(updated){
    const current = updated?.id ? findAssetItem(updated.id) : null;
    if(current) Object.assign(current, updated);
}
function openAssetItem(id){
    const item = findAssetItem(id);
    if(item?.url) openAssetUrl(item.url);
}
function showDetailPreview(source, id){
    const item = source === 'local'
        ? findLocalItem(id)
        : source === 'localup'
            ? findLocalUpload(id)
            : source === 'canvas-asset'
                ? findCanvasAssetItem(id)
                : findAssetItem(id);
    if(!item) return;
    const kind = source === 'local' ? (item.kind || localItemKind(item)) : assetKind(item);
    if(!['image','video','audio'].includes(kind)){
        setStatus('此文件类型暂不支持预览');
        return;
    }
    const url = assetDisplayMediaUrl(source === 'local' ? localObjectUrl(item) : item.url);
    if(!url) return;
    closeDetailPreview();
    if(kind === 'audio'){ openAssetAudioPreview(item,url); return; }
    const overlay = document.createElement('div');
    overlay.className = 'asset-lightbox';
    overlay.dataset.scale = '1';
    overlay.dataset.x = '0';
    overlay.dataset.y = '0';
    overlay.innerHTML = `
        <div class="asset-lightbox-inner" role="dialog" aria-modal="true" aria-label="${kind === 'video' ? '视频预览' : '图片预览'}">
            ${kind === 'video'
                ? `<video class="asset-lightbox-video" src="${escapeAttr(url)}" controls autoplay playsinline preload="metadata"></video>`
                : `<img class="asset-lightbox-image" src="${escapeAttr(url)}" alt="${escapeAttr(item.name || 'preview')}" draggable="false">`}
        </div>
    `;
    document.body.appendChild(overlay);
    document.body.classList.add('asset-lightbox-open');
}
function openAssetAudioPreview(item,url){
    const dialog = document.createElement('dialog');
    dialog.className = 'asset-audio-dialog';
    dialog.setAttribute('aria-label','音频预览');
    dialog.innerHTML = `<div class="asset-audio-dialog-head"><strong>音频预览</strong><button class="asset-icon-btn" type="button" aria-label="关闭音频预览"><i data-lucide="x"></i></button></div><span class="asset-audio-symbol"><i data-lucide="file-audio"></i></span><h2></h2><audio controls preload="none"></audio><p role="status"></p>`;
    dialog.querySelector('h2').textContent = item.name || '音频素材';
    const audio = dialog.querySelector('audio');
    audio.src = url;
    audio.onerror = () => { dialog.querySelector('[role=status]').textContent = '音频加载失败，请确认素材仍可访问。'; };
    dialog.querySelector('button').onclick = () => dialog.close();
    dialog.addEventListener('click',event=>{if(event.target === dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom)dialog.close();}});
    dialog.addEventListener('close',()=>{audio.onerror=null;audio.pause();audio.removeAttribute('src');audio.load();dialog.remove();},{once:true});
    document.body.append(dialog);
    refreshIcons();
    dialog.showModal();
}
function closeDetailPreview(){
    document.querySelector('.asset-audio-dialog[open]')?.close();
    const overlay = document.querySelector('.asset-lightbox');
    overlay?.querySelectorAll('video,audio').forEach(media=>{media.pause();media.removeAttribute('src');media.load();});
    overlay?.remove();
    document.body.classList.remove('asset-lightbox-open');
    lightboxPanState = null;
}
function applyLightboxTransform(overlay){
    const image = overlay?.querySelector?.('.asset-lightbox-image');
    if(!image) return;
    const scale = Number(overlay.dataset.scale || 1);
    const x = Number(overlay.dataset.x || 0);
    const y = Number(overlay.dataset.y || 0);
    image.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    overlay.classList.toggle('zoomed', scale > 1.01);
}
function zoomDetailPreview(event){
    const overlay = event.target.closest?.('.asset-lightbox');
    const image = event.target.closest?.('.asset-lightbox-image');
    if(!overlay || !image) return;
    event.preventDefault();
    const current = Number(overlay.dataset.scale || 1);
    const next = Math.max(0.25, Math.min(8, current * (event.deltaY < 0 ? 1.15 : 0.87)));
    const rect = overlay.getBoundingClientRect();
    const anchorX = event.clientX - (rect.left + rect.width / 2);
    const anchorY = event.clientY - (rect.top + rect.height / 2);
    const currentX = Number(overlay.dataset.x || 0);
    const currentY = Number(overlay.dataset.y || 0);
    const ratio = next / current;
    overlay.dataset.scale = String(next);
    if(next <= 1.01){
        overlay.dataset.x = '0';
        overlay.dataset.y = '0';
    } else {
        overlay.dataset.x = String(anchorX - ratio * (anchorX - currentX));
        overlay.dataset.y = String(anchorY - ratio * (anchorY - currentY));
    }
    applyLightboxTransform(overlay);
}
function beginLightboxPan(event){
    const image = event.target.closest?.('.asset-lightbox-image');
    const overlay = event.target.closest?.('.asset-lightbox');
    if(!image || !overlay) return;
    const scale = Number(overlay.dataset.scale || 1);
    if(scale <= 1.01) return;
    event.preventDefault();
    lightboxPanState = {
        overlay,
        pointerId:event.pointerId,
        startX:event.clientX,
        startY:event.clientY,
        originX:Number(overlay.dataset.x || 0),
        originY:Number(overlay.dataset.y || 0)
    };
    image.setPointerCapture?.(event.pointerId);
    overlay.classList.add('dragging');
}
function updateLightboxPan(event){
    if(!lightboxPanState || event.pointerId !== lightboxPanState.pointerId) return;
    const {overlay, startX, startY, originX, originY} = lightboxPanState;
    overlay.dataset.x = String(originX + event.clientX - startX);
    overlay.dataset.y = String(originY + event.clientY - startY);
    applyLightboxTransform(overlay);
}
function endLightboxPan(event){
    if(!lightboxPanState || event.pointerId !== lightboxPanState.pointerId) return;
    lightboxPanState.overlay?.classList.remove('dragging');
    lightboxPanState = null;
}
function rectsIntersect(a, b){
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
function marqueeTargetSelector(){
    const selection=managerSelectionContext();
    return selection.mode && !selection.readonly ? selection.cardSelector : '';
}
function beginMarqueeSelection(event){
    const selector = marqueeTargetSelector();
    if(!selector) return;
    if(event.button !== 0) return;
    if(event.target.closest?.('button,input,textarea,select,.side-upload-card,.upload-grid-card,.asset-search-wrap')) return;
    const area = event.target.closest?.('.content-scroll');
    if(!area) return;
    event.preventDefault();
    const box = document.createElement('div');
    box.className = 'selection-marquee';
    area.appendChild(box);
    marqueeState = {
        startX:event.clientX,
        startY:event.clientY,
        area,
        box,
        active:false,
        selector,
        baseSelection:new Set(managerSelectionContext().ids)
    };
}
function updateMarqueeSelection(event){
    if(!marqueeState) return;
    marqueeState.pointer = {clientX:event.clientX, clientY:event.clientY};
    if(marqueeRenderFrame) return;
    marqueeRenderFrame = requestAnimationFrame(() => {
        marqueeRenderFrame = 0;
        const point = marqueeState?.pointer;
        if(point) performMarqueeSelection(point.clientX, point.clientY);
    });
}
function performMarqueeSelection(clientX, clientY){
    if(!marqueeState) return;
    if(!marqueeState.active){
        const dx = Math.abs(clientX - marqueeState.startX);
        const dy = Math.abs(clientY - marqueeState.startY);
        if(Math.max(dx, dy) < 4) return;
        marqueeState.active = true;
        marqueeState.targets = [...document.querySelectorAll(marqueeState.selector)].map(el => ({
            el,
            rect:el.getBoundingClientRect()
        }));
    }
    const left = Math.min(marqueeState.startX, clientX);
    const top = Math.min(marqueeState.startY, clientY);
    const right = Math.max(marqueeState.startX, clientX);
    const bottom = Math.max(marqueeState.startY, clientY);
    const areaRect = marqueeState.area.getBoundingClientRect();
    const boxLeft = left - areaRect.left + marqueeState.area.scrollLeft;
    const boxTop = top - areaRect.top + marqueeState.area.scrollTop;
    Object.assign(marqueeState.box.style, {
        left:`${boxLeft}px`,
        top:`${boxTop}px`,
        width:`${Math.max(1, right - left)}px`,
        height:`${Math.max(1, bottom - top)}px`
    });
    const rect = {left, top, right, bottom};
    const selection=managerSelectionContext();
    selection.ids.clear();
    marqueeState.baseSelection.forEach(id=>selection.ids.add(id));
    root.querySelectorAll(selection.cardSelector).forEach(el=>{
        if(rectsIntersect(rect,el.getBoundingClientRect())) selection.ids.add(el.dataset[selection.key]);
    });
    refreshManagerSelection();
}
function endMarqueeSelection(){
    if(!marqueeState) return;
    if(marqueeRenderFrame){
        cancelAnimationFrame(marqueeRenderFrame);
        marqueeRenderFrame = 0;
        const point = marqueeState.pointer;
        if(point) performMarqueeSelection(point.clientX, point.clientY);
    }
    const shouldRender = marqueeState.active;
    marqueeState.box.remove();
    marqueeState = null;
    pendingBatchDelete = '';
    if(shouldRender){
        suppressClickAfterMarquee = true;
        refreshManagerSelection();
    }
}
async function createAssetLibrary(){
    const name = window.prompt('资产库名称', '新资产库');
    if(!String(name || '').trim()) return;
    const data = await apiJson('/api/asset-library/libraries', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})});
    assetLibrary = data.library || assetLibrary;
    activeAssetLibraryId = data.asset_library?.id || activeAssetLibraryId;
    activeAssetCategoryId = '';
    selectedAssetId = '';
    render();
}
async function saveAssetTreeEdit(){
    if(!assetTreeEdit) return;
    const name = document.getElementById('assetTreeEditInput')?.value || '';
    if(!String(name || '').trim()){
        setStatus('名称不能为空');
        return;
    }
    let data = null;
    if(assetTreeEdit.kind === 'library-new'){
        data = await apiJson('/api/asset-library/libraries', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})});
        assetLibrary = data.library || assetLibrary;
        activeAssetLibraryId = data.asset_library?.id || activeAssetLibraryId;
        assetTreeFocus = 'library';
    } else if(assetTreeEdit.kind === 'library-rename'){
        const lib = activeAssetLibrary();
        if(!lib) return;
        data = await apiJson(`/api/asset-library/libraries/${encodeURIComponent(lib.id)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})});
        assetLibrary = data.library || assetLibrary;
        assetTreeFocus = 'library';
    } else if(assetTreeEdit.kind === 'category-new'){
        data = await apiJson('/api/asset-library/categories', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({library_id:activeAssetLibraryId, name, type:'image'})});
        assetLibrary = data.library || assetLibrary;
        activeAssetCategoryId = data.category?.id || activeAssetCategoryId;
        assetTreeFocus = 'category';
    } else if(assetTreeEdit.kind === 'category-rename'){
        const cat = activeAssetCategory();
        if(!cat) return;
        data = await apiJson(`/api/asset-library/categories/${encodeURIComponent(cat.id)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})});
        assetLibrary = data.library || assetLibrary;
        assetTreeFocus = 'category';
    }
    assetTreeEdit = null;
    pendingTreeDelete = '';
    render();
    setStatus('已保存');
}
async function saveWorkflowTreeEdit(){
    if(!workflowTreeEdit) return;
    const name = document.getElementById('workflowTreeEditInput')?.value || '';
    if(!String(name || '').trim()){
        setStatus('名称不能为空');
        return;
    }
    if(workflowTreeEdit.kind === 'category-new'){
        const lib = activeWorkflowLibrary();
        if(!lib){
            setStatus('请先选择资产库');
            return;
        }
        activeWorkflowLibraryId = lib.id || activeWorkflowLibraryId;
        const data = await apiJson('/api/asset-library/categories', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({library_id:activeWorkflowLibraryId, name, type:'workflow'})
        });
        assetLibrary = data.library || assetLibrary;
        activeWorkflowCategoryId = data.category?.id || activeWorkflowCategoryId;
    } else if(workflowTreeEdit.kind === 'category-rename'){
        const cat = activeWorkflowCategory();
        const categoryId = workflowTreeEdit.categoryId || cat?.id || activeWorkflowCategoryId;
        if(!categoryId) return;
        const data = await apiJson(`/api/asset-library/categories/${encodeURIComponent(categoryId)}`, {
            method:'PATCH',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({name, library_id:activeWorkflowLibraryId})
        });
        assetLibrary = data.library || assetLibrary;
        activeWorkflowCategoryId = categoryId;
    }
    workflowTreeEdit = null;
    pendingTreeDelete = '';
    render();
    setStatus('已保存');
}
async function deleteWorkflowCategory(){
    const cat = activeWorkflowCategory();
    if(!cat) return;
    const libraryId = cat.__libraryId || activeWorkflowLibraryId;
    const key = `workflow-cat:${libraryId}:${cat.id}`;
    if(pendingTreeDelete !== key){
        pendingTreeDelete = key;
        workflowTreeEdit = null;
        render();
        setStatus('再次点击确认删除工作流分组');
        return;
    }
    const data = await apiJson(`/api/asset-library/categories/${encodeURIComponent(cat.id)}?library_id=${encodeURIComponent(libraryId)}`, {method:'DELETE'});
    assetLibrary = data.library || assetLibrary;
    activeWorkflowCategoryId = '';
    selectedWorkflowId = '';
    selectedWorkflowIds.clear();
    pendingTreeDelete = '';
    render();
    setStatus('工作流分组已删除');
}
async function renameAssetLibrary(){
    const lib = activeAssetLibrary();
    const name = window.prompt('资产库名称', lib?.name || '');
    if(!lib || !String(name || '').trim()) return;
    const data = await apiJson(`/api/asset-library/libraries/${encodeURIComponent(lib.id)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})});
    assetLibrary = data.library || assetLibrary;
    render();
}
async function deleteAssetLibrary(){
    const lib = activeAssetLibrary();
    if(!lib) return;
    const key = `asset-lib:${lib.id}`;
    if(pendingTreeDelete !== key){
        pendingTreeDelete = key;
        assetTreeEdit = null;
        render();
        setStatus('再次点击确认删除资产库');
        return;
    }
    const data = await apiJson(`/api/asset-library/libraries/${encodeURIComponent(lib.id)}`, {method:'DELETE'});
    assetLibrary = data.library || assetLibrary;
    activeAssetLibraryId = assetLibrary.active_library_id || assetLibraries()[0]?.id || '';
    activeAssetCategoryId = '';
    selectedAssetId = '';
    selectedAssetIds.clear();
    pendingTreeDelete = '';
    render();
}
async function createAssetCategory(){
    const name = window.prompt('分组名称', '新分组');
    if(!String(name || '').trim()) return;
    const data = await apiJson('/api/asset-library/categories', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({library_id:activeAssetLibraryId, name, type:'image'})});
    assetLibrary = data.library || assetLibrary;
    activeAssetCategoryId = data.category?.id || activeAssetCategoryId;
    selectedAssetId = '';
    render();
}
async function renameAssetCategory(){
    const cat = activeAssetCategory();
    const name = window.prompt('分组名称', cat?.name || '');
    if(!cat || !String(name || '').trim()) return;
    const data = await apiJson(`/api/asset-library/categories/${encodeURIComponent(cat.id)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})});
    assetLibrary = data.library || assetLibrary;
    render();
}
async function deleteAssetCategory(){
    const cat = activeAssetCategory();
    if(!cat) return;
    const key = `asset-cat:${cat.id}`;
    if(pendingTreeDelete !== key){
        pendingTreeDelete = key;
        assetTreeEdit = null;
        render();
        setStatus('再次点击确认删除分组');
        return;
    }
    const data = await apiJson(`/api/asset-library/categories/${encodeURIComponent(cat.id)}`, {method:'DELETE'});
    assetLibrary = data.library || assetLibrary;
    activeAssetCategoryId = '';
    selectedAssetId = '';
    selectedAssetIds.clear();
    pendingTreeDelete = '';
    render();
}
async function renameAssetItem(id){
    const item = findAssetItem(id);
    const name = window.prompt('素材名称', item?.name || '');
    if(!item || !String(name || '').trim()) return;
    const data = await apiJson(`/api/asset-library/items/${encodeURIComponent(id)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})});
    assetLibrary = data.library || assetLibrary;
    selectedAssetId = id;
    render();
}
async function saveAssetEdit(id){
    const item = findAssetItem(id);
    const name = document.getElementById('assetEditName')?.value || '';
    if(!item || !String(name || '').trim()) {
        setStatus('素材名称不能为空');
        return;
    }
    const data = await apiJson(`/api/asset-library/items/${encodeURIComponent(id)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})});
    assetLibrary = data.library || assetLibrary;
    selectedAssetId = id;
    assetEditMode = false;
    render();
    setStatus('素材已保存');
}
async function saveAssetInlineName(id, name){
    const item = findAssetItem(id);
    if(!item || !String(name || '').trim()) return;
    if(String(item.name || '') === String(name || '')) return;
    const data = await apiJson(`/api/asset-library/items/${encodeURIComponent(id)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})});
    assetLibrary = data.library || assetLibrary;
    selectedAssetId = id;
    render();
    setStatus('素材名称已保存');
}
async function registerSelectedAssetAvatars(providerId=''){
    await ensureProvidersLoaded();
    const selectedItems = [...selectedAssetIds].map(id => findAssetItem(id)).filter(Boolean);
    const ids = selectedItems.filter(item => ['image','video','audio'].includes(assetKind(item))).map(item => item.id);
    const unsupported = selectedItems.length - ids.length;
    if(!ids.length){ setStatus('所选素材中没有可认证的图片、视频或音频'); return; }
    const provider = (providerId && (apiProviders || []).find(p => p.id === providerId)) || activeAvatarProvider();
    if(!provider){ setStatus('请先在 API 平台管理中添加并启用 API 平台'); return; }
    if(!providerAvatarSupported(provider)){ setStatus(`「${avatarPlatformLabel(providerAvatarPlatform(provider))}」的资产认证 API 尚未接入`); return; }
    const credentialMessage = providerAvatarCredentialMessage(provider);
    if(credentialMessage){ setStatus(credentialMessage); return; }
    if(avatarBusyId) return;
    const batchLibraryId = activeAssetLibraryId;
    ids.forEach(id => avatarSubmittingItems.set(id, {providerId:provider.id, libraryId:batchLibraryId}));
    avatarBusyId = '__batch__';
    scheduleAssetAvatarStatusRefresh(ids);
    setStatus(`正在批量提交 ${ids.length} 个素材到 ${avatarPlatformLabel(providerAvatarPlatform(provider))} 审核…`);
    try {
        let ok = 0;
        let skipped = 0;
        let recovered = 0;
        let uncertain = 0;
        let cancelled = 0;
        let failed = unsupported;
        let completed = 0;
        let nextIndex = 0;
        const submitOne = async (id, index) => {
            const cancelKey = `${provider.id}:${id}`;
            try {
                if(avatarCancelRequested.has(cancelKey)){
                    cancelled += 1;
                    avatarCancelRequested.delete(cancelKey);
                    return;
                }
                const data = await apiJson(`/api/asset-library/items/${encodeURIComponent(id)}/register-avatar`, {
                    method:'POST', headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({library_id:batchLibraryId, provider_id:provider.id})
                });
                if(avatarCancelRequested.has(cancelKey)){
                    cancelled += 1;
                    avatarCancelRequested.delete(cancelKey);
                    return;
                }
                if(data.item) mergeAssetItem(data.item);
                if(data.cancelled || data.status === 'Cancelled'){
                    cancelled += 1;
                    return;
                }
                if(data.skipped) skipped += 1;
                else ok += 1;
                if(data.status !== 'Active') scheduleAvatarPoll(id, provider.id, true, batchLibraryId, index * 100);
            } catch(err) {
                if(avatarCancelRequested.has(cancelKey)){
                    cancelled += 1;
                    avatarCancelRequested.delete(cancelKey);
                } else {
                    const confirmed = await reconcileAvatarBatch([id], provider, batchLibraryId);
                    if(confirmed) recovered += 1;
                    else if(Number(err?.status) >= 400 && Number(err?.status) < 500) failed += 1;
                    else uncertain += 1;
                }
            } finally {
                avatarSubmittingItems.delete(id);
                scheduleAssetAvatarStatusRefresh(id);
                completed += 1;
                setStatus(`姝ｅ湪鎵归噺鎻愪氦 ${completed}/${ids.length}锛堝苟鍙?8锛夆€?`);
            }
        };
        const worker = async () => {
            while(nextIndex < ids.length){
                const index = nextIndex++;
                await submitOne(ids[index], index);
            }
        };
        await Promise.all(Array.from({length:Math.min(8, ids.length)}, () => worker()));
        const parts = [`已提交 ${ok} 个`];
        if(skipped) parts.push(`跳过 ${skipped} 个`);
        if(recovered) parts.push(`恢复确认 ${recovered} 个`);
        if(uncertain) parts.push(`${uncertain} 个状态待确认`);
        if(cancelled) parts.push(`取消 ${cancelled} 个`);
        if(failed) parts.push(`${failed} 个失败`);
        setStatus(`${parts.join('，')}${ok || recovered ? '，正在等待审核…' : ''}`);
    } catch(err) {
        setStatus(err.message || '批量认证提交失败');
    } finally {
        ids.forEach(id => avatarSubmittingItems.delete(id));
        avatarBusyId = '';
        scheduleAssetAvatarStatusRefresh(ids);
    }
}
async function reconcileAvatarBatch(ids, provider, libraryId){
    const platform = providerAvatarPlatform(provider);
    const confirmedIds = new Set();
    for(const delay of [500, 1500, 3000]){
        try {
            await new Promise(resolve => setTimeout(resolve, delay));
            const data = await apiJson('/api/asset-library');
            assetLibrary = data.library || assetLibrary;
            ids.forEach((id, index) => {
                const item = findAssetItem(id);
                const reg = avatarRegistrationOf(item, platform);
                if(!reg || !['Processing','Active'].includes(reg.status)) return;
                if(!confirmedIds.has(id) && reg.status === 'Processing' && reg.task_id) scheduleAvatarPoll(id, provider.id, true, libraryId, index * 250);
                confirmedIds.add(id);
            });
            if(confirmedIds.size === ids.length) break;
        } catch(_) {}
    }
    return confirmedIds.size;
}
async function registerAssetAvatar(id, providerId=''){
    await ensureProvidersLoaded();
    const item = findAssetItem(id);
    if(!item) return;
    const provider = (providerId && (apiProviders || []).find(p => p.id === providerId)) || activeAvatarProvider();
    if(!provider){ setStatus('请先在 API 平台管理中添加并启用 API 平台'); return; }
    if(!providerAvatarSupported(provider)){ setStatus(`「${avatarPlatformLabel(providerAvatarPlatform(provider))}」的资产认证 API 尚未接入`); return; }
    const credentialMessage = providerAvatarCredentialMessage(provider);
    if(credentialMessage){ setStatus(credentialMessage); return; }
    if(avatarBusyId) return;
    const cancelKey = `${provider.id}:${id}`;
    avatarSubmittingItems.set(id, {providerId:provider.id, libraryId:activeAssetLibraryId});
    avatarBusyId = id;
    selectedAssetId = id;
    refreshAssetSelectionOnly({detail:false});
    scheduleAssetAvatarStatusRefresh(id);
    setStatus(`正在上传素材并提交 ${avatarPlatformLabel(providerAvatarPlatform(provider))} 审核…`);
    try {
        const data = await apiJson(`/api/asset-library/items/${encodeURIComponent(id)}/register-avatar`, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({library_id:activeAssetLibraryId, provider_id:provider.id})
        });
        if(avatarCancelRequested.has(cancelKey)){
            avatarCancelRequested.delete(cancelKey);
            setStatus('认证已取消');
            return;
        }
        assetLibrary = data.library || assetLibrary;
        if(data.cancelled || data.status === 'Cancelled'){
            setStatus('认证已取消');
            return;
        }
        if(data.skipped){
            setStatus(data.status === 'Active' ? '该素材已经审核通过，无需重复提交' : '该素材已在审核中，无需重复提交');
        } else {
            setStatus(`已提交审核，正在等待 ${avatarPlatformLabel(providerAvatarPlatform(provider))} 通过…`);
        }
        if(data.status !== 'Active') scheduleAvatarPoll(id, provider.id, true);
    } catch(err) {
        setStatus(avatarCancelRequested.has(cancelKey) ? '认证已取消' : (err.message || '数字人提交失败'));
        avatarCancelRequested.delete(cancelKey);
    } finally {
        avatarSubmittingItems.delete(id);
        avatarBusyId = '';
        scheduleAssetAvatarStatusRefresh(id);
    }
}
async function cancelAssetAvatar(id, providerId=''){
    await ensureProvidersLoaded();
    const item = findAssetItem(id);
    const submitting = avatarSubmittingItems.get(id);
    const provider = (providerId && (apiProviders || []).find(p => p.id === providerId))
        || (submitting?.providerId && (apiProviders || []).find(p => p.id === submitting.providerId))
        || activeAvatarProvider();
    if(!item || !provider) return;
    const libraryId = submitting?.libraryId || activeAssetLibraryId;
    avatarCancelRequested.add(`${provider.id}:${id}`);
    clearAvatarPoll(id, provider.id);
    setStatus('正在取消认证…');
    try {
        const data = await apiJson(`/api/asset-library/items/${encodeURIComponent(id)}/cancel-avatar`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body:JSON.stringify({library_id:libraryId, provider_id:provider.id})
        });
        if(data.item) mergeAssetItem(data.item);
        setStatus(data.cancelled ? '认证已取消，队列将继续处理其他素材' : '已认证完成，无法取消');
    } catch(err) {
        setStatus(err.message || '取消认证失败');
    } finally {
        if(!avatarSubmittingItems.has(id)) avatarCancelRequested.delete(`${provider.id}:${id}`);
        scheduleAssetAvatarStatusRefresh(id);
    }
}
function avatarRegistrationOf(item, platform){
    const regs = (item && item.registrations && typeof item.registrations === 'object') ? item.registrations : {};
    return regs[platform] || null;
}
async function checkAssetAvatarStatus(id, silent=false, providerId='', libraryId=''){
    await ensureProvidersLoaded();
    const item = findAssetItem(id);
    if(!item) return;
    const provider = (providerId && (apiProviders || []).find(p => p.id === providerId)) || activeAvatarProvider();
    if(!provider) return;
    const platform = providerAvatarPlatform(provider);
    const reg = avatarRegistrationOf(item, platform);
    if(!reg || !reg.task_id) return;
    if(!silent){ avatarBusyId = id; scheduleAssetAvatarStatusRefresh(id); setStatus('正在查询审核状态…'); }
    try {
        const data = await apiJson(`/api/asset-library/items/${encodeURIComponent(id)}/avatar-status`, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({library_id:libraryId || activeAssetLibraryId, provider_id:provider.id})
        });
        mergeAssetItem(data.item);
        const newReg = (data.item?.registrations && data.item.registrations[platform]) || {};
        const status = newReg.status || '';
        if(status === 'Active'){
            clearAvatarPoll(id, provider.id);
            if(!silent) setStatus('审核通过，已生成 asset:// 地址，可在视频生成中通过 @ 调用');
        } else if(status === 'Failed') {
            clearAvatarPoll(id, provider.id);
            if(!silent) setStatus(newReg.detail || '审核未通过');
        } else {
            if(!silent) setStatus('仍在审核中，稍后会自动刷新…');
            scheduleAvatarPoll(id, provider.id, false, libraryId);
        }
    } catch(err) {
        if(!silent) setStatus(err.message || '查询审核状态失败，稍后自动重试');
        scheduleAvatarPoll(id, provider.id, false, libraryId);
    } finally {
        if(!silent) avatarBusyId = '';
        scheduleAssetAvatarStatusRefresh(id);
    }
}
function clearAvatarPoll(id, providerId){
    const key = `${providerId}:${id}`;
    clearTimeout(avatarPollTimers.get(key));
    avatarPollTimers.delete(key);
    avatarPollAttempts.delete(key);
    avatarPollQueued.delete(key);
    // Remove queued copies backwards so removing one cannot skip the next.
    for(let i = avatarPollQueue.length - 1; i >= 0; i--){
        if(avatarPollQueue[i].key === key) avatarPollQueue.splice(i, 1);
    }
}
function drainAvatarPollQueue(){
    while(avatarPollActive < AVATAR_POLL_CONCURRENCY && avatarPollQueue.length){
        const job = avatarPollQueue.shift();
        avatarPollQueued.delete(job.key);
        const item = findAssetItem(job.id);
        const provider = (apiProviders || []).find(p => p.id === job.providerId);
        const registration = provider ? avatarRegistrationOf(item, providerAvatarPlatform(provider)) : null;
        // A queued item may have been deleted or finished before its turn.
        if(!item || !provider || !registration?.task_id || registration.status !== 'Processing') continue;
        avatarPollActive += 1;
        avatarPollInFlight.add(job.key);
        Promise.resolve(checkAssetAvatarStatus(job.id, true, job.providerId, job.libraryId)).finally(() => {
            // Success and failure both release the slot before draining again.
            avatarPollActive = Math.max(0, avatarPollActive - 1);
            avatarPollInFlight.delete(job.key);
            drainAvatarPollQueue();
        });
    }
}
function enqueueAvatarPoll(id, providerId, libraryId=''){
    const key = `${providerId}:${id}`;
    if(avatarPollQueued.has(key) || avatarPollInFlight.has(key)) return;
    avatarPollQueued.add(key);
    avatarPollQueue.push({key, id, providerId, libraryId});
    drainAvatarPollQueue();
}
function scheduleAvatarPoll(id, providerId, reset=false, libraryId='', initialDelay=6000){
    const key = `${providerId}:${id}`;
    if(reset) clearAvatarPoll(id, providerId);
    const attempt = (avatarPollAttempts.get(key) || 0) + 1;
    if(attempt > 100){
        clearAvatarPoll(id, providerId);
        return;
    }
    avatarPollAttempts.set(key, attempt);
    clearTimeout(avatarPollTimers.get(key));
    avatarPollTimers.set(key, setTimeout(() => {
        avatarPollTimers.delete(key);
        enqueueAvatarPoll(id, providerId, libraryId);
    }, Math.max(250, Number.isFinite(Number(initialDelay)) ? Number(initialDelay) : 6000)));
}
function resumeAvatarPolls(){
    let delay = 500;
    // Stagger recovery in library/category/item order instead of polling every
    // saved registration at once. Only scheduled registrations advance delay.
    assetLibraries().forEach(library =>
        (library.categories || []).forEach(category =>
            (category.items || []).forEach(item => {
                const registrations = item?.registrations && typeof item.registrations === 'object'
                    ? item.registrations
                    : {};
                Object.entries(registrations).forEach(([platform, registration]) => {
                    if(!registration || registration.status !== 'Processing' || !registration.task_id) return;
                    const providerId = avatarProviderIdForPlatform(platform, registration.provider_id || '');
                    if(!providerId) return;
                    scheduleAvatarPoll(item.id, providerId, true, library.id || '', delay);
                    delay += 250;
                });
            })
        )
    );
}
async function deleteAssetItem(id){
    const item = findAssetItem(id);
    if(!item) return;
    const data = await apiJson(`/api/asset-library/items/${encodeURIComponent(id)}`, {method:'DELETE'});
    assetLibrary = data.library || assetLibrary;
    selectedAssetIds.delete(id);
    if(selectedAssetId === id) selectedAssetId = '';
    pendingDeleteAssetId = '';
    render();
    setStatus('素材已删除');
}
async function deleteSelectedAssets(confirmed=false){
    if(!selectedAssetIds.size) return;
    const ids = [...selectedAssetIds];
    if(!confirmed) return confirmManagerBatchDelete('assets',ids,()=>deleteSelectedAssets(true));
    const data = await apiJson('/api/asset-library/items/delete', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({library_id:activeAssetLibraryId, ids})});
    assetLibrary = data.library || assetLibrary;
    if(ids.includes(selectedAssetId)) selectedAssetId = '';
    selectedAssetIds.clear();
    pendingBatchDelete = '';
    render();
    setStatus(`已删除 ${data.removed || ids.length} 个素材`);
}
function setAssetClipboard(mode){
    if(!selectedAssetIds.size) return;
    assetClipboard = {
        mode,
        ids:[...selectedAssetIds],
        sourceLibraryId:activeAssetLibraryId,
        sourceCategoryId:activeAssetCategoryId,
        items:[...selectedAssetIds].map(id => findAssetItem(id)).filter(Boolean)
    };
    selectedAssetIds.clear();
    pendingBatchDelete = '';
    render();
    const label = mode === 'cut' ? '剪切' : '复制';
    setStatus(`${label}了 ${assetClipboard.ids.length} 个素材，切换分组后粘贴`);
}
async function pasteAssetClipboard(){
    if(!assetClipboard?.ids?.length) return;
    if(assetClipboard.mode === 'cut'){
        if(assetClipboard.sourceLibraryId === activeAssetLibraryId && assetClipboard.sourceCategoryId === activeAssetCategoryId) return;
        const data = await apiJson('/api/asset-library/items/move', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({library_id:assetClipboard.sourceLibraryId, target_library_id:activeAssetLibraryId, target_category_id:activeAssetCategoryId, ids:assetClipboard.ids})
        });
        assetLibrary = data.library || assetLibrary;
        setStatus(`已移动 ${data.moved || 0} 个素材`);
    } else {
        const items = (assetClipboard.items || []).map(item => ({url:item.url, name:item.name || 'asset'})).filter(item => item.url);
        const data = await apiJson('/api/asset-library/items/batch', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({library_id:activeAssetLibraryId, category_id:activeAssetCategoryId, items})
        });
        assetLibrary = data.library || assetLibrary;
        setStatus(`已复制 ${data.items?.length || 0} 个素材`);
    }
    assetClipboard = null;
    selectedAssetIds.clear();
    selectedAssetId = '';
    render();
}
function setLocalClipboard(mode, ids=null){
    // 共享文件夹只读，仅支持「复制」（引用导入），不支持剪切删除源文件
    const sourceIds = Array.isArray(ids) ? ids.filter(Boolean) : [...selectedLocalIds];
    if(!sourceIds.length) return;
    const items = sourceIds.map(id => findLocalItem(id)).filter(Boolean);
    if(!items.length) return;
    localClipboard = {
        mode:'copy',
        ids:items.map(item => item.id),
        items,
        sourceRootName:activeSharedFolderName || '共享文件夹'
    };
    selectedLocalIds.clear();
    pendingBatchDelete = '';
    render();
    setStatus(`复制了 ${items.length} 个共享素材，导入后会拷贝到图片资产分组（共享文件夹原文件保留）`);
}
async function pasteLocalClipboardToAssets(){
    if(!localClipboard?.items?.length) return;
    if(!activeAssetCategory()){
        setStatus('请先在图片资产中创建或选择分组');
        return;
    }
    const clip = localClipboard;
    // 按所属共享文件夹分组，调用后端按路径导入（复制到素材库，无需走浏览器文件对象）
    const groups = new Map();
    clip.items.forEach(item => {
        if(!item || !item.folderId || !item.relativePath) return;
        if(!groups.has(item.folderId)) groups.set(item.folderId, []);
        groups.get(item.folderId).push(item.relativePath);
    });
    if(!groups.size) return;
    setStatus('正在导入共享素材...');
    let imported = 0;
    try {
        for(const [folderId, paths] of groups){
            const data = await apiJson('/api/shared-folders/import', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({library_id:activeAssetLibraryId, category_id:activeAssetCategoryId, folder_id:folderId, paths})
            });
            assetLibrary = data.library || assetLibrary;
            imported += (data.items?.length || 0);
        }
    } catch(err) {
        setStatus(err.message || '导入共享素材失败');
        return;
    }
    localClipboard = null;
    selectedLocalIds.clear();
    selectedLocalId = '';
    render();
    setStatus(`已导入 ${imported} 个素材到图片资产`);
}
async function moveSelectedAssets(){
    if(!selectedAssetIds.size || !assetMoveTarget) return;
    const [targetLibraryId, targetCategoryId] = assetMoveTarget.split('::');
    if(!targetLibraryId || !targetCategoryId) return;
    const ids = [...selectedAssetIds];
    const data = await apiJson('/api/asset-library/items/move', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({library_id:activeAssetLibraryId, target_library_id:targetLibraryId, target_category_id:targetCategoryId, ids})
    });
    assetLibrary = data.library || assetLibrary;
    selectedAssetIds.clear();
    if(ids.includes(selectedAssetId)) selectedAssetId = '';
    render();
    setStatus(`已移动 ${data.moved || 0} 个素材`);
}
function openLocalItem(id){
    const item = findLocalItem(id);
    if(!item) return;
    const url = localObjectUrl(item);
    if(url) openAssetUrl(url);
}
async function createPromptLibrary(){
    const name = window.prompt('提示词库名称', '新提示词库');
    if(!String(name || '').trim()) return;
    const data = await apiJson('/api/prompt-libraries', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})});
    promptLibrary = data.library || promptLibrary;
    activePromptLibraryId = data.prompt_library?.id || activePromptLibraryId;
    activePromptCategory = 'all';
    selectedPromptId = '';
    render();
}
async function savePromptTreeEdit(){
    if(!promptTreeEdit) return;
    const name = document.getElementById('promptTreeEditInput')?.value || '';
    if(!String(name || '').trim()){
        setStatus('名称不能为空');
        return;
    }
    let data = null;
    if(promptTreeEdit.kind === 'library-new'){
        data = await apiJson('/api/prompt-libraries', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})});
        promptLibrary = data.library || promptLibrary;
        activePromptLibraryId = data.prompt_library?.id || activePromptLibraryId;
        activePromptCategory = 'all';
        promptTreeFocus = 'library';
    } else if(promptTreeEdit.kind === 'library-rename'){
        const lib = activePromptLibrary();
        if(!lib) return;
        data = await apiJson(`/api/prompt-libraries/${encodeURIComponent(lib.id)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})});
        promptLibrary = data.library || promptLibrary;
        promptTreeFocus = 'library';
    } else if(promptTreeEdit.kind === 'category-new'){
        const lib = activePromptLibrary();
        data = await apiJson('/api/prompt-libraries/categories', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({library_id:lib?.id || 'system', name})});
        promptLibrary = data.library || promptLibrary;
        activePromptCategory = data.category?.id || activePromptCategory;
        promptTreeFocus = 'category';
    } else if(promptTreeEdit.kind === 'category-rename'){
        data = await apiJson(`/api/prompt-libraries/categories/${encodeURIComponent(activePromptCategory)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})});
        promptLibrary = data.library || promptLibrary;
        promptTreeFocus = 'category';
    }
    promptTreeEdit = null;
    pendingTreeDelete = '';
    render();
    setStatus('已保存');
}
async function deletePromptCategory(){
    if(activePromptCategory === 'all'){
        setStatus('请选择具体分组后删除');
        return;
    }
    const key = `prompt-cat:${activePromptCategory}`;
    if(pendingTreeDelete !== key){
        pendingTreeDelete = key;
        promptTreeEdit = null;
        render();
        setStatus('再次点击确认删除分组');
        return;
    }
    const data = await apiJson(`/api/prompt-libraries/categories/${encodeURIComponent(activePromptCategory)}`, {method:'DELETE'});
    promptLibrary = data.library || promptLibrary;
    activePromptCategory = 'all';
    pendingTreeDelete = '';
    render();
    setStatus('分组已删除');
}
async function renamePromptLibrary(){
    const lib = activePromptLibrary();
    const name = window.prompt('提示词库名称', lib?.name || '');
    if(!lib || !String(name || '').trim()) return;
    const data = await apiJson(`/api/prompt-libraries/${encodeURIComponent(lib.id)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})});
    promptLibrary = data.library || promptLibrary;
    render();
}
async function deletePromptLibrary(){
    const lib = activePromptLibrary();
    if(!lib) return;
    if(isSystemPromptLibrary(lib)){ setStatus('系统提示词库不能删除'); return; }
    const key = `prompt-lib:${lib.id}`;
    if(pendingTreeDelete !== key){
        pendingTreeDelete = key;
        promptTreeEdit = null;
        render();
        setStatus('再次点击确认删除提示词库');
        return;
    }
    const data = await apiJson(`/api/prompt-libraries/${encodeURIComponent(lib.id)}`, {method:'DELETE'});
    promptLibrary = data.library || promptLibrary;
    activePromptLibraryId = promptLibrary.active_library_id || promptLibraries()[0]?.id || 'system';
    activePromptCategory = 'all';
    selectedPromptId = '';
    selectedPromptIds.clear();
    pendingTreeDelete = '';
    render();
    setStatus('提示词库已删除');
}
async function createPromptItem(){
    const lib = activePromptLibrary();
    if(!lib) return;
    const name = window.prompt('提示词名称', '新提示词');
    if(!String(name || '').trim()) return;
    const scene = window.prompt('用途说明', '') || '';
    const positive = window.prompt('正向提示词内容', '');
    if(!String(positive || '').trim()) return;
    const negative = window.prompt('负向提示词内容', '') || '';
    const category = activePromptCategory === 'all' ? 'custom' : activePromptCategory;
    const data = await apiJson('/api/prompt-libraries/items', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({library_id:lib.id, name, positive, negative, category, scene})});
    promptLibrary = data.library || promptLibrary;
    selectedPromptId = data.item?.id || selectedPromptId;
    render();
}
async function savePromptCreate(){
    const lib = activePromptLibrary();
    const name = document.getElementById('promptEditName')?.value || '';
    const scene = document.getElementById('promptEditScene')?.value || '';
    const positive = document.getElementById('promptEditPositive')?.value || '';
    const negative = document.getElementById('promptEditNegative')?.value || '';
    if(!lib) return;
    if(!String(name || '').trim() || !String(positive || '').trim()){
        setStatus('名称和正向提示词不能为空');
        return;
    }
    const category = activePromptCategory === 'all' ? 'custom' : activePromptCategory;
    const data = await apiJson('/api/prompt-libraries/items', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({library_id:lib.id, name, positive, negative, category, scene})});
    promptLibrary = data.library || promptLibrary;
    selectedPromptId = data.item?.id || selectedPromptId;
    promptCreateMode = false;
    render();
    setStatus('提示词已新增');
}
async function editPromptItem(id){
    const item = findPromptItem(id);
    const lib = activePromptLibrary();
    if(!item || !lib) return;
    const name = window.prompt('提示词名称', item.name || '');
    if(!String(name || '').trim()) return;
    const scene = window.prompt('用途说明', item.scene || '') || '';
    const positive = window.prompt('正向提示词内容', item.positive || '');
    if(!String(positive || '').trim()) return;
    const negative = window.prompt('负向提示词内容', item.negative || '') || '';
    const data = await apiJson(`/api/prompt-libraries/items/${encodeURIComponent(id)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({library_id:lib.id, name, positive, negative, category:item.category || 'custom', scene})});
    promptLibrary = data.library || promptLibrary;
    selectedPromptId = id;
    render();
}
async function savePromptEdit(id){
    const item = findPromptItem(id);
    const lib = activePromptLibrary();
    const name = document.getElementById('promptEditName')?.value || '';
    const scene = document.getElementById('promptEditScene')?.value || '';
    const positive = document.getElementById('promptEditPositive')?.value || '';
    const negative = document.getElementById('promptEditNegative')?.value || '';
    if(!item || !lib) return;
    if(!String(name || '').trim() || !String(positive || '').trim()){
        setStatus('名称和正向提示词不能为空');
        return;
    }
    const data = await apiJson(`/api/prompt-libraries/items/${encodeURIComponent(id)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({library_id:lib.id, name, positive, negative, category:item.category || 'custom', scene})});
    promptLibrary = data.library || promptLibrary;
    selectedPromptId = id;
    promptEditMode = false;
    render();
    setStatus('提示词已保存');
}
async function deletePromptItem(id){
    const item = findPromptItem(id);
    if(!item) return;
    const data = await apiJson(`/api/prompt-libraries/items/${encodeURIComponent(id)}`, {method:'DELETE'});
    promptLibrary = data.library || promptLibrary;
    selectedPromptIds.delete(id);
    if(selectedPromptId === id) selectedPromptId = '';
    pendingDeletePromptId = '';
    render();
    setStatus('提示词已删除');
}
async function deleteSelectedPrompts(confirmed=false){
    if(!selectedPromptIds.size) return;
    const ids = [...selectedPromptIds];
    if(!confirmed) return confirmManagerBatchDelete('prompts',ids,()=>deleteSelectedPrompts(true));
    const data = await apiJson('/api/prompt-libraries/items/delete', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ids})});
    promptLibrary = data.library || promptLibrary;
    if(ids.includes(selectedPromptId)) selectedPromptId = '';
    selectedPromptIds.clear();
    pendingBatchDelete = '';
    render();
}
root.addEventListener('click', event => {
    handleClick(event).catch(err => setStatus(err.message || '操作失败'));
});
document.addEventListener('click', event => {
    if(event.target.closest?.('.asset-lightbox') && !event.target.closest?.('.asset-lightbox-image,.asset-lightbox-video')) closeDetailPreview();
});
document.addEventListener('keydown', event => {
    if(event.key === 'Escape') closeDetailPreview();
    if(event.target?.id === 'assetTreeEditInput'){
        if(event.key === 'Enter'){ event.preventDefault(); saveAssetTreeEdit().catch(err => setStatus(err.message || '保存失败')); }
        if(event.key === 'Escape'){ event.preventDefault(); assetTreeEdit = null; render(); }
    }
    if(event.target?.id === 'workflowTreeEditInput'){
        if(event.key === 'Enter'){ event.preventDefault(); saveWorkflowTreeEdit().catch(err => setStatus(err.message || '保存失败')); }
        if(event.key === 'Escape'){ event.preventDefault(); workflowTreeEdit = null; render(); }
    }
    if(event.target?.id === 'promptTreeEditInput'){
        if(event.key === 'Enter'){ event.preventDefault(); savePromptTreeEdit().catch(err => setStatus(err.message || '保存失败')); }
        if(event.key === 'Escape'){ event.preventDefault(); promptTreeEdit = null; render(); }
    }
});
document.addEventListener('wheel', zoomDetailPreview, {passive:false});
document.addEventListener('pointerdown', beginLightboxPan);
document.addEventListener('pointermove', updateLightboxPan);
document.addEventListener('pointerup', endLightboxPan);
document.addEventListener('pointercancel', endLightboxPan);
root.addEventListener('pointerdown', beginMarqueeSelection);
document.addEventListener('pointermove', event => updateMarqueeSelection(event));
document.addEventListener('pointerup', endMarqueeSelection);
root.addEventListener('scroll', event => {
    if(event.target?.classList?.contains('content-scroll')) scheduleAssetVirtualRender();
    scheduleAssetViewSave();
}, true);
window.addEventListener('scroll', () => {
    scheduleAssetVirtualRender();
    scheduleAssetViewSave();
}, {passive:true});
window.addEventListener('resize', () => {
    scheduleAssetVirtualRender();
    restoreManagerView(managerViews.views[managerViewKey(managerViewDescriptor())]);
});
window.addEventListener('pagehide', () => {
    rememberManagerView(captureManagerView());
    const snapshot = captureAssetViewState();
    if(snapshot) persistAssetViewSession(snapshot);
});
root.addEventListener('error', event => {
    const img = event.target;
    if(!(img instanceof HTMLImageElement)) return;
    const original = img.dataset.originalSrc || '';
    if(!original || img.src.endsWith(original)) return;
    delete img.dataset.originalSrc;
    img.src = assetDisplayMediaUrl(original);
}, true);
root.addEventListener('input', event => {
    if(event.target?.id === 'assetSearch'){
        const pos = event.target.selectionStart || 0;
        assetQuery = event.target.value || '';
        selectedAssetId = '';
        scheduleSearchRender('assetSearch', pos);
    }
    if(event.target?.id === 'workflowSearch'){
        const pos = event.target.selectionStart || 0;
        workflowQuery = event.target.value || '';
        selectedWorkflowId = '';
        scheduleSearchRender('workflowSearch', pos);
    }
    if(event.target?.id === 'promptSearch'){
        const pos = event.target.selectionStart || 0;
        promptQuery = event.target.value || '';
        selectedPromptId = '';
        scheduleSearchRender('promptSearch', pos);
    }
    if(event.target?.id === 'localSearch'){
        const pos = event.target.selectionStart || 0;
        localQuery = event.target.value || '';
        selectedLocalId = '';
        scheduleSearchRender('localSearch', pos);
    }
    if(event.target?.id === 'localUploadSearch'){
        const pos = event.target.selectionStart || 0;
        localUploadQuery = event.target.value || '';
        selectedLocalUploadId = '';
        scheduleSearchRender('localUploadSearch', pos);
    }
    if(event.target?.id === 'canvasAssetSearch'){
        const pos = event.target.selectionStart || 0;
        canvasAssetQuery = event.target.value || '';
        selectedCanvasAssetId = '';
        canvasAssetRequest?.abort();
        clearTimeout(searchRenderTimer);
        searchRenderTimer=setTimeout(() => reloadCanvasCatalog(),250);
    }
    if(event.target?.id === 'localCaptionPrompt'){
        localCaptionPrompt = event.target.value || '';
    }
});
root.addEventListener('change', event => {
    const selection=managerSelectionContext();
    const selectionCheck=event.target.closest?.(selection.checkSelector);
    if(selectionCheck){
        if(!selection.mode || selection.readonly) return;
        const id=selectionCheck.dataset[selection.checkKey];
        if(selectionCheck.checked) selection.ids.add(id); else selection.ids.delete(id);
        pendingBatchDelete='';
        refreshManagerSelection();
        return;
    }
    const inlineAssetName = event.target.closest?.('[data-asset-inline-name]');
    if(inlineAssetName){
        saveAssetInlineName(inlineAssetName.dataset.assetInlineName || '', inlineAssetName.value || '').catch(err => setStatus(err.message || '保存失败'));
        return;
    }
    const inlineWorkflowName = event.target.closest?.('[data-workflow-inline-name]');
    if(inlineWorkflowName){
        apiJson(`/api/asset-library/items/${encodeURIComponent(inlineWorkflowName.dataset.workflowInlineName || '')}`, {
            method:'PATCH',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({name:inlineWorkflowName.value || ''})
        }).then(data => {
            assetLibrary = data.library || assetLibrary;
            render();
            setStatus('已保存工作流名称');
        }).catch(err => setStatus(err.message || '保存失败'));
        return;
    }
    const assetCheck = event.target.closest?.('[data-asset-check]');
    if(assetCheck){
        if(!assetManageMode) return;
        if(assetCheck.checked) {
            selectedAssetIds.add(assetCheck.dataset.assetCheck);
            selectedAssetId = assetCheck.dataset.assetCheck;
        } else selectedAssetIds.delete(assetCheck.dataset.assetCheck);
        refreshAssetSelectionOnly();
        return;
    }
    const workflowCheck = event.target.closest?.('[data-workflow-check]');
    if(workflowCheck){
        if(!workflowManageMode) return;
        if(workflowCheck.checked) {
            selectedWorkflowIds.add(workflowCheck.dataset.workflowCheck);
            selectedWorkflowId = workflowCheck.dataset.workflowCheck;
        } else selectedWorkflowIds.delete(workflowCheck.dataset.workflowCheck);
        render();
    }
    const promptCheck = event.target.closest?.('[data-prompt-check]');
    if(promptCheck){
        if(!promptManageMode) return;
        if(promptCheck.checked) {
            selectedPromptIds.add(promptCheck.dataset.promptCheck);
            selectedPromptId = promptCheck.dataset.promptCheck;
        } else selectedPromptIds.delete(promptCheck.dataset.promptCheck);
        render();
    }
    const localCheck = event.target.closest?.('[data-local-check]');
    if(localCheck){
        if(!localManageMode) return;
        if(localCheck.checked) {
            selectedLocalIds.add(localCheck.dataset.localCheck);
            selectedLocalId = localCheck.dataset.localCheck;
        } else selectedLocalIds.delete(localCheck.dataset.localCheck);
        render();
    }
    const canvasAssetCheck = event.target.closest?.('[data-canvas-asset-check]');
    if(canvasAssetCheck){
        if(!canvasAssetManageMode) return;
        if(canvasAssetCheck.checked) {
            selectedCanvasAssetIds.add(canvasAssetCheck.dataset.canvasAssetCheck);
            selectedCanvasAssetId = canvasAssetCheck.dataset.canvasAssetCheck;
        } else selectedCanvasAssetIds.delete(canvasAssetCheck.dataset.canvasAssetCheck);
        refreshCanvasAssetSelectionOnly();
    }
    if(event.target?.id === 'canvasAssetSort'){
        canvasAssetSort = event.target.value || 'canvas_asc';
        selectedCanvasAssetId = '';
        reloadCanvasCatalog();
    }
    if(event.target?.id === 'assetMoveTarget'){
        assetMoveTarget = event.target.value || '';
        pendingBatchDelete = '';
        render();
    }
    if(event.target?.id === 'localCaptionProvider'){
        localCaptionProvider = event.target.value || '';
        localCaptionModel = '';
        render();
    }
    if(event.target?.id === 'localCaptionModel'){
        localCaptionModel = event.target.value || '';
        render();
    }
    const avatarProvider = event.target.closest?.('[data-avatar-provider]');
    if(avatarProvider){
        avatarRegisterProvider = avatarProvider.value || '';
        scheduleAssetAvatarStatusRefresh(selectedAssetId);
    }
});
root.addEventListener('dragover', event => {
    const drop = event.target.closest?.('#assetDrop, #localUploadDrop, #workflowDrop');
    if(!drop) return;
    event.preventDefault();
    drop.classList.add('drag-over');
});
root.addEventListener('dragleave', event => {
    event.target.closest?.('#assetDrop, #localUploadDrop, #workflowDrop')?.classList.remove('drag-over');
});
root.addEventListener('drop', event => {
    const drop = event.target.closest?.('#assetDrop, #localUploadDrop, #workflowDrop');
    if(!drop) return;
    event.preventDefault();
    drop.classList.remove('drag-over');
    if(drop.id === 'localUploadDrop') uploadLocalAssets(event.dataTransfer.files);
    else if(drop.id === 'workflowDrop') uploadWorkflowFiles(event.dataTransfer.files).catch(err => setStatus(err.message || '上传失败'));
    else uploadFiles(event.dataTransfer.files).catch(err => setStatus(err.message || '上传失败'));
});
uploadInput?.addEventListener('change', event => {
    const files = event.target.files;
    if(files?.length){
        if(activeTab === 'local') uploadLocalAssets(files);
        else if(activeTab === 'workflows') uploadWorkflowFiles(files).catch(err => setStatus(err.message || '上传失败'));
        else uploadFiles(files).catch(err => setStatus(err.message || '上传失败'));
    }
    event.target.value = '';
});
document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
        switchManagerTab(btn.dataset.tab || 'assets').catch(err => setStatus(err.message || '加载失败'));
    });
});
refreshBtn?.addEventListener('click', () => refreshCurrentManager().catch(err => setStatus(err.message || '加载失败')));
document.addEventListener('DOMContentLoaded', () => loadInitialAssetManager().catch(err => setStatus(err.message || '加载失败')));
