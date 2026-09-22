/* Classic canvas: Node/connection rendering, viewport, gestures and input controls.
 * Browser classic script (not an ES module); loaded before canvas.js.
 * Function declarations only: initialization is explicitly invoked by the entry.
 * Uses the entry's existing shared bindings; do not duplicate permission or document state.
 */

function canvasDisplayMediaUrl(url){ return window.MemberMediaUrl ? window.MemberMediaUrl(url) : url; }

function canvasMediaPreviewUrl(url, size=512){
    const raw = String(url || '');
    if(!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return canvasDisplayMediaUrl(raw);
    if(!raw.startsWith('/output/') && !raw.startsWith('/assets/')) return canvasDisplayMediaUrl(raw);
    if(!/\.(png|jpe?g|webp|gif|bmp|avif|tiff?|mp4|webm|mov|m4v)(\?|#|$)/i.test(raw)) return canvasDisplayMediaUrl(raw);
    const width = Math.max(64, Math.min(2048, Math.round(Number(size) || 512)));
    return canvasDisplayMediaUrl(`/api/media-preview?w=${width}&url=${encodeURIComponent(raw)}`);
}

function canvasPreviewImgHtml(url, size=512, attrs=''){
    const original = String(url || '');
    const preview = canvasMediaPreviewUrl(original, size);
    const source = window.CanvasMediaLoader?.imageAttributes(preview) || `src="${escapeAttr(preview)}"`;
    return `<img ${source} data-preview-src="${escapeAttr(preview)}" data-original-src="${escapeAttr(original)}" data-url="${escapeAttr(original)}" loading="lazy"${attrs ? ` ${attrs}` : ''}>`;
}

function canvasVideoPreviewHtml(url, size=512, attrs=''){
    const original = String(url || '');
    const preview = canvasMediaPreviewUrl(original, size);
    const source = window.CanvasMediaLoader?.imageAttributes(preview) || `src="${escapeAttr(preview)}"`;
    return `<img ${source} data-preview-src="${escapeAttr(preview)}" data-original-src="${escapeAttr(original)}" data-url="${escapeAttr(original)}" data-preview-kind="video" loading="lazy"${attrs ? ` ${attrs}` : ''}>`;
}

function canvasVideoFallbackHtml(url){
    const safe = escapeAttr(url || '');
    return `<button type="button" class="canvas-video-fallback" data-url="${safe}" aria-label="打开视频灯箱"><i data-lucide="play"></i><span>VIDEO</span><small>点击打开灯箱</small></button>`;
}

function isCanvasPreviewImage(img){
    if(img?.dataset?.canvasMediaSuspended) return true;
    return img?.tagName?.toLowerCase?.() === 'img'
        && img.dataset?.previewSrc
        && img.dataset?.originalSrc
        && img.dataset.previewSrc !== img.dataset.originalSrc
        && img.getAttribute('src') !== img.dataset.originalSrc;
}

function bindCanvasPreviewImageFallbacks(root=document){
    root.querySelectorAll?.('img[data-preview-src][data-original-src]:not([data-preview-fallback-bound])').forEach(img => {
        img.dataset.previewFallbackBound = '1';
        img.addEventListener('error', () => {
            if(img.dataset.mediaPriorityPaused || img.dataset.canvasMediaSrc) return;
            // Removing an offscreen source must not fetch the original or replace its poster.
            if(img.dataset.canvasMediaSuspended) return;
            const original = img.dataset.originalSrc || img.dataset.url || '';
            if(img.dataset.previewKind === 'video'){
                const outputWrap = img.closest('.output-img-wrap');
                if(outputWrap){
                    const placeholder = document.createElement('button');
                    placeholder.type = 'button';
                    placeholder.className = 'output-video-fallback';
                    placeholder.dataset.outputVideoFallback = original;
                    placeholder.innerHTML = '<i data-lucide="video"></i><span>VIDEO</span><small>点击播放</small>';
                    placeholder.onclick = event => {
                        event.preventDefault();
                        event.stopPropagation();
                        const nodeId = outputWrap.closest('.output-node')?.dataset.id || '';
                        const out = nodes.find(node => node.id === nodeId) || null;
                        openOutputLightbox(original, out);
                    };
                    img.replaceWith(placeholder);
                    refreshIcons();
                    return;
                }
                const template = document.createElement('template');
                template.innerHTML = canvasVideoFallbackHtml(original);
                const fallback = template.content.firstElementChild;
                fallback.onmousedown = event => event.stopPropagation();
                fallback.onclick = event => {
                    event.preventDefault();
                    event.stopPropagation();
                    const nodeId = fallback.closest('.node')?.dataset.id || '';
                    const owner = nodes.find(node => node.id === nodeId);
                    openOutputLightbox(original, owner || {type:'image', url:original, mediaKind:'video'});
                };
                img.replaceWith(fallback);
                refreshIcons();
                return;
            }
            if(original && img.getAttribute('src') !== original) img.src = canvasDisplayMediaUrl(original);
        });
    });
}

function endWindowPointerSession(session=windowPointerSession){
    if(session !== windowPointerSession) return;
    session?.abort();
    windowPointerSession = null;
}

function startWindowPointerSession(onMove, onUp){
    endWindowPointerSession();
    const session = new AbortController();
    windowPointerSession = session;
    window.addEventListener('mousemove', onMove, {signal:session.signal});
    window.addEventListener('mouseup', e => {
        try { onUp?.(e); }
        finally { endWindowPointerSession(session); }
    }, {signal:session.signal, once:true});
}

function renderCanvasIcon(icon, size = 14) {
    // 旧的默认 emoji 或空值都映射为 layers
    if(!icon || icon === '🧩') return `<i data-lucide="layers" style="width:${size}px;height:${size}px"></i>`;
    // 含非 ASCII 字符（用户旧选过的 emoji）继续按文本渲染
    if(/[^\x00-\x7F]/.test(icon)) return escapeHtml(icon);
    return `<i data-lucide="${escapeHtml(icon)}" style="width:${size}px;height:${size}px"></i>`;
}

function loadLocalViewportMap(){
    try {
        const data = JSON.parse(sessionStorage.getItem(CANVAS_SESSION_VIEWPORTS_KEY) || '{}');
        return data && typeof data === 'object' ? data : {};
    } catch(e) {
        return canvasSessionViewportFallback;
    }
}

function localViewportForCanvas(canvasId, fallback={x:0, y:0, scale:1}){
    const item = loadLocalViewportMap()[canvasId || ''];
    if(!item || typeof item !== 'object') return {...fallback};
    return {
        x:Number.isFinite(Number(item.x)) ? Number(item.x) : Number(fallback.x || 0),
        y:Number.isFinite(Number(item.y)) ? Number(item.y) : Number(fallback.y || 0),
        scale:Number.isFinite(Number(item.scale)) ? Math.max(.12, Math.min(8, Number(item.scale))) : Number(fallback.scale || 1)
    };
}

function saveLocalViewport(){
    if(!canvas?.id) return;
    const map = loadLocalViewportMap();
    map[canvas.id] = {
        x:Number(viewport.x || 0),
        y:Number(viewport.y || 0),
        scale:Number(viewport.scale || 1),
        updatedAt:Date.now()
    };
    canvasSessionViewportFallback = map;
    try {
        sessionStorage.setItem(CANVAS_SESSION_VIEWPORTS_KEY, JSON.stringify(map));
    } catch(e) {}
}

// 视野裁剪：判断节点是否在画布可见区域内（含缓冲 margin，世界坐标像素）
function isNodeInCanvasViewport(node, margin=400){
    if(!shell) return true;
    const vw = shell.clientWidth;
    const vh = shell.clientHeight;
    if(!vw || !vh) return true;
    const vx = -viewport.x / viewport.scale;
    const vy = -viewport.y / viewport.scale;
    const vwWorld = vw / viewport.scale;
    const vhWorld = vh / viewport.scale;
    const m = margin / viewport.scale;
    const nx = Number(node.x || 0);
    const ny = Number(node.y || 0);
    const nw = Number(node.w || 300);
    const nh = Number(node.h || 200);
    return !(nx + nw < vx - m || nx > vx + vwWorld + m || ny + nh < vy - m || ny > vy + vhWorld + m);
}

function scheduleViewportRefresh(delay=200){
    clearTimeout(pendingViewportRefresh);
    pendingViewportRefresh = setTimeout(() => {
        pendingViewportRefresh = null;
        // 只刷新视野外变视野内的节点内容，不触发全量 render
        renderOffscreenPlaceholders();
        refreshCanvasMediaVisibility();
        // Reconcile dynamic node sizes once navigation settles, not on every wheel event.
        scheduleMinimapRender();
    }, delay);
}

function applyTheme(theme){
    const dark = theme === 'dark';
    document.documentElement.classList.toggle('studio-theme-dark', dark);
    document.documentElement.classList.toggle('theme-dark', dark);
    document.body.classList.toggle('studio-theme-dark', dark);
    document.body.classList.toggle('theme-dark', dark);
    shell.classList.toggle('theme-dark', dark);
}

function applyQuickToolbarState(){
    const toolbar = document.getElementById('quickToolbar');
    if(!toolbar) return;
    const collapsed = localStorage.getItem(QUICK_TOOLBAR_COLLAPSED_KEY) === '1';
    toolbar.classList.toggle('collapsed', collapsed);
    const btn = toolbar.querySelector('.toolbar-toggle');
    if(btn){
        btn.title = collapsed ? '展开快捷菜单' : '折叠快捷菜单';
        btn.setAttribute('aria-label', btn.title);
    }
    refreshIcons();
}

function toggleQuickToolbar(){
    const toolbar = document.getElementById('quickToolbar');
    const next = !toolbar?.classList.contains('collapsed');
    localStorage.setItem(QUICK_TOOLBAR_COLLAPSED_KEY, next ? '1' : '0');
    applyQuickToolbarState();
}

function imageModelOptions(selectedModel, providerId){
    if(!imageApiProviders().length){
        return `<option value="" disabled selected>${tr('canvas.noApiProvidersHint') || '暂无 API 平台，请到 API 设置添加'}</option>`;
    }
    const models = allImageModels(providerId);
    if(!models.length){
        return `<option value="" disabled selected>${tr('canvas.noImageModelsHint') || '暂无生图模型，请到 API 设置添加'}</option>`;
    }
    const selectedValue = resolveImageModel(selectedModel);
    const options = models.map(model => `<option value="${escapeHtml(model)}" ${model === selectedValue ? 'selected' : ''}>${escapeHtml(model)}</option>`).join('');
    const hasSelected = models.includes(selectedValue);
    return `${hasSelected || !selectedValue ? '' : `<option value="${escapeHtml(selectedValue)}" selected>${escapeHtml(selectedValue)}</option>`}${options}`;
}

function chatModelOptions(selectedModel, providerId=''){
    const models = providerId ? providerChatModels(providerId) : allChatModels();
    if(!models.length){
        return `<option value="" disabled selected>${tr('canvas.noModelsHint') || '暂无模型，请到 API 设置添加'}</option>`;
    }
    const selectedValue = resolveChatModel(selectedModel, providerId);
    const options = models.map(model => `<option value="${escapeHtml(model)}" ${model === selectedValue ? 'selected' : ''}>${escapeHtml(model)}</option>`).join('');
    const hasSelected = models.includes(selectedValue);
    return `${hasSelected || !selectedValue ? '' : `<option value="${escapeHtml(selectedValue)}" selected>${escapeHtml(selectedValue)}</option>`}${options}`;
}

function screenToWorld(clientX, clientY){
    const rect = board.getBoundingClientRect();
    return { x:(clientX - rect.left - viewport.x) / viewport.scale, y:(clientY - rect.top - viewport.y) / viewport.scale };
}

function applyViewport({viewportOnly=false}={}){
    world.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
    scheduleMinimapRender({viewportOnly});
}

function estimatedNodeRect(n){
    const el = nodesEl?.querySelector?.(`.node[data-id="${CSS.escape(n.id)}"]`);
    const size = defaultNodeSize(n.type);
    const w = el?.offsetWidth || n.w || size.w || 260;
    const h = el?.offsetHeight || n.h || size.h || 160;
    return {x:n.x || 0, y:n.y || 0, w, h};
}

function currentWorldViewRect(){
    const rect = board.getBoundingClientRect();
    const scale = viewport.scale || 1;
    return {
        x:-viewport.x / scale,
        y:-viewport.y / scale,
        w:rect.width / scale,
        h:rect.height / scale
    };
}

function minimapNodeBounds(rects){
    if(!rects.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    rects.forEach(r => {
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.w);
        maxY = Math.max(maxY, r.y + r.h);
    });
    return {x:minX, y:minY, w:maxX - minX, h:maxY - minY};
}

function minimapBounds(nodeBounds, view){
    const minX = Math.min(nodeBounds?.x ?? view.x, view.x);
    const minY = Math.min(nodeBounds?.y ?? view.y, view.y);
    const maxX = Math.max(nodeBounds ? nodeBounds.x + nodeBounds.w : view.x + view.w, view.x + view.w);
    const maxY = Math.max(nodeBounds ? nodeBounds.y + nodeBounds.h : view.y + view.h, view.y + view.h);
    const pad = Math.max(240, Math.max(maxX - minX, maxY - minY) * 0.08);
    return {x:minX - pad, y:minY - pad, w:Math.max(1, maxX - minX + pad * 2), h:Math.max(1, maxY - minY + pad * 2)};
}

function scheduleMinimapRender({viewportOnly=false}={}){
    // A viewport request must never override an already queued layout invalidation.
    if(!viewportOnly) minimapLayoutDirty = true;
    if(minimapRenderQueued) return;
    minimapRenderQueued = true;
    requestAnimationFrame(() => {
        minimapRenderQueued = false;
        renderMinimap({viewportOnly:!minimapLayoutDirty});
    });
}

function renderMinimap({viewportOnly=false}={}){
    if(!minimapContent || !minimapViewport) return;
    const previous = minimapState;
    const reuseLayout = viewportOnly && !minimapLayoutDirty && previous
        && previous.canvasId === canvas?.id && previous.sourceNodes === nodes
        && previous.rects.length === nodes.length;
    const rects = reuseLayout ? previous.rects : (nodes || []).map(n => ({id:n.id, ...estimatedNodeRect(n)}));
    const nodeBounds = reuseLayout ? previous.nodeBounds : minimapNodeBounds(rects);
    const view = currentWorldViewRect();
    const bounds = minimapBounds(nodeBounds, view);
    const cw = minimapContent.clientWidth || 172;
    const ch = minimapContent.clientHeight || 110;
    if(reuseLayout && previous.cw === cw && previous.ch === ch
        && ['x','y','w','h'].every(key => previous.bounds[key] === bounds[key])){
        updateMinimapViewport(view);
        return;
    }
    const scale = Math.min(cw / bounds.w, ch / bounds.h);
    const mapW = bounds.w * scale;
    const mapH = bounds.h * scale;
    const ox = (cw - mapW) / 2;
    const oy = (ch - mapH) / 2;
    minimapState = {bounds, scale, ox, oy, cw, ch, rects, nodeBounds, canvasId:canvas?.id, sourceNodes:nodes};
    minimapLayoutDirty = false;
    const nodeHtml = rects.map(r => {
        return `<div class="minimap-node ${selected.has(r.id) ? 'selected' : ''}" style="left:${ox + (r.x - bounds.x) * scale}px;top:${oy + (r.y - bounds.y) * scale}px;width:${Math.max(3, r.w * scale)}px;height:${Math.max(3, r.h * scale)}px"></div>`;
    }).join('');
    minimapContent.innerHTML = `${nodeHtml}${nodes?.length ? '' : '<div class="minimap-empty">EMPTY</div>'}<div id="minimapViewport" class="minimap-viewport"></div>`;
    minimapViewport = document.getElementById('minimapViewport');
    updateMinimapViewport(view);
}

function updateMinimapViewport(r=currentWorldViewRect()){
    if(!minimapViewport || !minimapState) return;
    const {bounds, scale, ox, oy} = minimapState;
    minimapViewport.style.left = `${ox + (r.x - bounds.x) * scale}px`;
    minimapViewport.style.top = `${oy + (r.y - bounds.y) * scale}px`;
    minimapViewport.style.width = `${Math.max(8, r.w * scale)}px`;
    minimapViewport.style.height = `${Math.max(8, r.h * scale)}px`;
}

function minimapEventToWorld(e){
    if(!minimapState) renderMinimap();
    const state = minimapState;
    const rect = minimapContent.getBoundingClientRect();
    const x = (e.clientX - rect.left - state.ox) / state.scale + state.bounds.x;
    const y = (e.clientY - rect.top - state.oy) / state.scale + state.bounds.y;
    return {x, y};
}

function centerViewportOnWorldPoint(point){
    const rect = board.getBoundingClientRect();
    viewport.x = rect.width / 2 - point.x * viewport.scale;
    viewport.y = rect.height / 2 - point.y * viewport.scale;
    applyViewport({viewportOnly:true});
    renderLinks();
    renderSelectionHub();
}

function refreshGeometry(nodeIds=null){
    renderLinks(nodeIds);
    renderSelectionHub();
}

function scheduleGeometryRefresh(passes=1, nodeIds=null){
    if(nodeIds === null) geometryRefreshAll = true;
    else for(const id of nodeIds) geometryRefreshNodes.add(id);
    geometryRefreshPasses = Math.max(geometryRefreshPasses, passes);
    if(geometryRefreshFrame !== null) return;
    geometryRefreshFrame = requestAnimationFrame(() => {
        geometryRefreshFrame = null;
        geometryRefreshPasses--;
        refreshGeometry(geometryRefreshAll ? null : geometryRefreshNodes);
        if(geometryRefreshPasses > 0) scheduleGeometryRefresh(geometryRefreshPasses, geometryRefreshAll ? null : geometryRefreshNodes);
        else { geometryRefreshAll = false; geometryRefreshNodes.clear(); }
    });
}

function flushScheduledGeometryRefresh(){
    if(geometryRefreshFrame === null) return;
    cancelAnimationFrame(geometryRefreshFrame);
    geometryRefreshFrame = null;
    geometryRefreshPasses--;
    refreshGeometry(geometryRefreshAll ? null : geometryRefreshNodes);
    if(geometryRefreshPasses > 0) scheduleGeometryRefresh(geometryRefreshPasses, geometryRefreshAll ? null : geometryRefreshNodes);
    else { geometryRefreshAll = false; geometryRefreshNodes.clear(); }
}

function refreshGeometryAfterLayout(nodeIds=null){
    // Coalesce image/node layout notifications, retaining the second-frame correction.
    scheduleGeometryRefresh(2, nodeIds);
    scheduleMinimapRender();
}

function scheduleViewportSave(){
    saveLocalViewport();
    scheduleViewportRefresh();
}

function renderMsGenBody(node){
    const note = document.createElement('div');
    note.className = 'muted-note';
    note.textContent = "此功能已移除，历史内容保留。请新建通用 API 节点并明确选择供应商。";
    return note;
}

function openCreateMenu(clientX, clientY){
    menuPoint = screenToWorld(clientX, clientY);
    closeLinkCreateMenu();
    createMenu.style.left = `${clientX}px`;
    createMenu.style.top = `${clientY}px`;
    createMenu.classList.add('open');
    refreshIcons();
}

function closeCreateMenu(){
    createMenu.classList.remove('open');
    closeLinkCreateMenu();
    closeImageNodeMenu();
}

function linkCreateOptions(state){
    const node = nodes.find(n => n.id === state?.originId);
    if(!node) return [];
    if(state.originKind === 'out'){
        if(['image','prompt','loop','group','promptGroup','llm','output'].includes(node.type)){
            return [
                {type:'generator', label:tr('canvas.apiGenerate'), icon:'wand-sparkles'},
                {type:'video', label:tr('canvas.videoGenerateNode'), icon:'clapperboard'},
                ...(node.type === 'output' ? [] : [{type:'llm', label:'LLM', icon:'message-square-text'}])
            ];
        }
        return [];
    }
    if(CANVAS_GENERATOR_TYPES.includes(node.type) || node.type === 'llm'){
        return [
            {type:'image', label:tr('canvas.imageCard'), icon:'image-plus'},
            {type:'prompt', label:tr('canvas.prompt'), icon:'text-cursor-input'},
            {type:'loop', label:tr('canvas.loopNode'), icon:'repeat-2'},
            {type:'group', label:tr('canvas.group'), icon:'group'},
            {type:'llm', label:'LLM', icon:'message-square-text'}
        ];
    }
    return [];
}

function openLinkCreateMenu(originId, originKind, clientX, clientY){
    const state = {originId, originKind, point:screenToWorld(clientX, clientY)};
    const options = linkCreateOptions(state);
    if(!options.length) return false;
    linkCreateState = state;
    createMenu.classList.remove('open');
    linkCreateMenu.innerHTML = options.map(opt => `<button class="menu-btn" data-link-create="${escapeAttr(opt.type)}"><i data-lucide="${escapeAttr(opt.icon)}" class="w-4 h-4"></i><span>${escapeHtml(opt.label)}</span></button>`).join('');
    linkCreateMenu.style.left = `${clientX}px`;
    linkCreateMenu.style.top = `${clientY}px`;
    linkCreateMenu.classList.add('open');
    linkCreateMenu.querySelectorAll('[data-link-create]').forEach(btn => {
        btn.onclick = e => {
            e.stopPropagation();
            createLinkedNode(btn.dataset.linkCreate);
        };
    });
    refreshIcons();
    return true;
}

function openGeneratorNodeMenu(nodeId, clientX, clientY){
    const node = nodes.find(n => n.id === nodeId);
    if(!node || !CANVAS_GENERATOR_TYPES.includes(node.type)) return false;
    const el = nodesEl.querySelector(`.node[data-id="${CSS.escape(nodeId)}"]`);
    const rect = el?.getBoundingClientRect();
    const point = screenToWorld(clientX, clientY);
    const inputOptions = linkCreateOptions({originId:nodeId, originKind:'in', point});
    const outputOptions = [
        {type:'output', label:'Output', icon:'circle-dot'},
        ...(CANVAS_IMAGE_OUTPUT_TYPES.includes(node.type) ? [
            {type:'generator', label:tr('canvas.apiGenerate'), icon:'wand-sparkles'},
            {type:'video', label:tr('canvas.videoGenerateNode'), icon:'clapperboard'}
        ] : [])
    ];
    const buttonsHtml = (options, kind) => `<div class="node-port-menu-grid">${options.map(opt => `<button class="menu-btn" data-link-create="${escapeAttr(opt.type)}" data-link-kind="${kind}" title="${escapeAttr(opt.label)}"><i data-lucide="${escapeAttr(opt.icon)}"></i><span>${escapeHtml(opt.label.replace('生成', ''))}</span></button>`).join('')}</div>`;
    linkCreateState = {originId:nodeId, originKind:'in', point};
    createMenu.classList.remove('open');
    linkCreateMenu.classList.remove('open');
    nodeInputMenu.classList.add('node-port-menu');
    nodeOutputMenu.classList.add('node-port-menu');
    nodeInputMenu.innerHTML = `<div class="menu-section-title">添加输入</div>${buttonsHtml(inputOptions, 'in')}`;
    nodeOutputMenu.innerHTML = `<div class="menu-section-title">添加输出</div>${buttonsHtml(outputOptions, 'out')}`;
    const inputLeft = Math.max(10, (rect?.left || clientX) - 158);
    const outputLeft = Math.min(window.innerWidth - 158, (rect?.right || clientX) + 10);
    const menuTop = Math.max(10, Math.min(window.innerHeight - 260, (rect?.top || clientY) + 36));
    nodeInputMenu.style.left = `${inputLeft}px`;
    nodeInputMenu.style.top = `${menuTop}px`;
    nodeOutputMenu.style.left = `${outputLeft}px`;
    nodeOutputMenu.style.top = `${menuTop}px`;
    nodeInputMenu.classList.add('open');
    nodeOutputMenu.classList.add('open');
    [nodeInputMenu, nodeOutputMenu].forEach(menu => menu.querySelectorAll('[data-link-create]').forEach(btn => {
        btn.onclick = e => {
            e.stopPropagation();
            linkCreateState = {originId:nodeId, originKind:btn.dataset.linkKind || 'in', point};
            createLinkedNode(btn.dataset.linkCreate);
        };
    }));
    refreshIcons();
    return true;
}

function closeLinkCreateMenu(){
    linkCreateMenu.classList.remove('open');
    linkCreateMenu.innerHTML = '';
    nodeInputMenu.classList.remove('open');
    nodeOutputMenu.classList.remove('open');
    nodeInputMenu.classList.remove('node-port-menu');
    nodeOutputMenu.classList.remove('node-port-menu');
    nodeInputMenu.innerHTML = '';
    nodeOutputMenu.innerHTML = '';
    linkCreateState = null;
}

function openImageNodeMenu(nodeId, clientX, clientY){
    const node = nodes.find(n => n.id === nodeId);
    if(!node || node.type !== 'image') return;
    closeCreateMenu();
    const kind = mediaKindForNode(node);
    const canPreview = node.url && !isMissingAssetUrl(node.url) && ['image','video'].includes(kind);
    const canEdit = node.url && !isMissingAssetUrl(node.url) && kind === 'image';
    const canUseAssetLibrary = node.url && !isMissingAssetUrl(node.url) && ['image','video'].includes(kind);
    imageNodeMenu.innerHTML = `
        ${canPreview ? `<button class="menu-btn" data-image-preview="${escapeAttr(nodeId)}"><i data-lucide="eye" class="w-4 h-4"></i><span>预览</span></button>` : ''}
        ${canEdit ? `<button class="menu-btn" data-image-edit="${escapeAttr(nodeId)}"><i data-lucide="pencil" class="w-4 h-4"></i><span>编辑</span></button>` : ''}
        <button class="menu-btn" data-image-replace="${escapeAttr(nodeId)}"><i data-lucide="image-plus" class="w-4 h-4"></i><span>替换</span></button>
        ${canUseAssetLibrary ? `<div class="menu-divider"></div><button class="menu-btn" data-image-save-asset="${escapeAttr(nodeId)}"><i data-lucide="library-big" class="w-4 h-4"></i><span>上传素材库</span></button>` : ''}
        ${canUseAssetLibrary ? `<button class="menu-btn" data-image-face-auth="${escapeAttr(nodeId)}"><i data-lucide="shield-check" class="w-4 h-4"></i><span>快速素材认证</span></button>` : ''}
    `;
    imageNodeMenu.style.left = `${clientX}px`;
    imageNodeMenu.style.top = `${clientY}px`;
    imageNodeMenu.classList.add('open');
    positionImageNodeMenu(clientX, clientY);
    const previewBtn = imageNodeMenu.querySelector('[data-image-preview]');
    if(previewBtn){
        previewBtn.onclick = e => {
            e.stopPropagation();
            closeImageNodeMenu();
            openImageNodePreview(nodeId);
        };
    }
    const editBtn = imageNodeMenu.querySelector('[data-image-edit]');
    if(editBtn){
        editBtn.onclick = e => {
            e.stopPropagation();
            closeImageNodeMenu();
            openImageEditor(nodeId);
        };
    }
    imageNodeMenu.querySelector('[data-image-replace]').onclick = e => {
        e.stopPropagation();
        closeImageNodeMenu();
        pickImageForNode(nodeId);
    };
    imageNodeMenu.querySelector('[data-image-save-asset]')?.addEventListener('click', e => {
        e.stopPropagation();
        openImageNodeAssetTargetMenu(nodeId, clientX, clientY);
    });
    imageNodeMenu.querySelector('[data-image-face-auth]')?.addEventListener('click', e => {
        e.stopPropagation();
        openImageNodeAssetTargetMenu(nodeId, clientX, clientY);
    });
    refreshIcons();
}

function positionImageNodeMenu(clientX, clientY){
    const menuRect = imageNodeMenu.getBoundingClientRect();
    imageNodeMenu.style.left = `${Math.max(10, Math.min(window.innerWidth - menuRect.width - 10, clientX))}px`;
    imageNodeMenu.style.top = `${Math.max(10, Math.min(window.innerHeight - menuRect.height - 10, clientY))}px`;
}

async function openImageNodeAssetTargetMenu(nodeId, clientX, clientY){
    await loadCanvasAssetLibrary({renderPanel:false});
    const targets = canvasAssetLibraries().flatMap(library => (library.readonly ? [] : (library.categories || [])
        .filter(category => ['image','media'].includes(String(category.type || 'image').toLowerCase()) && !category.readonly)
        .map(category => ({libraryId:library.id, categoryId:category.id, label:`${library.name || '素材库'} / ${category.name || '分组'}`}))));
    if(!targets.length){ closeImageNodeMenu(); showErrorModal('请先创建可编辑的素材库和图片分组。', '上传素材库'); return; }
    const selectedIndex = Math.max(0, targets.findIndex(target => target.libraryId === activeCanvasAssetLibraryId && target.categoryId === activeCanvasAssetCategoryId));
    imageNodeMenu.classList.add('asset-target-menu');
    imageNodeMenu.innerHTML = `
        <div class="menu-section-title">选择素材库 / 分组</div>
        <select class="asset-target-select" data-image-asset-target aria-label="上传目标">
            ${targets.map((target, index) => `<option value="${index}" ${index === selectedIndex ? 'selected' : ''}>${escapeHtml(target.label)}</option>`).join('')}
        </select>
        <div class="asset-target-actions">
            <button class="menu-btn" type="button" data-image-asset-upload><i data-lucide="upload" class="w-4 h-4"></i><span>仅上传</span></button>
            <button class="menu-btn primary" type="button" data-image-asset-auth><i data-lucide="shield-check" class="w-4 h-4"></i><span>上传并认证</span></button>
        </div>`;
    positionImageNodeMenu(clientX, clientY);
    const selectedTarget = () => targets[Number(imageNodeMenu.querySelector('[data-image-asset-target]')?.value || 0)] || targets[0];
    imageNodeMenu.querySelector('[data-image-asset-target]')?.addEventListener('click', e => e.stopPropagation());
    imageNodeMenu.querySelector('[data-image-asset-upload]')?.addEventListener('click', e => {
        e.stopPropagation();
        const target = selectedTarget();
        closeImageNodeMenu();
        saveImageNodeToAssetLibrary(nodeId, target);
    });
    imageNodeMenu.querySelector('[data-image-asset-auth]')?.addEventListener('click', e => {
        e.stopPropagation();
        const target = selectedTarget();
        closeImageNodeMenu();
        quickFaceAuthImageNode(nodeId, target);
    });
    refreshIcons();
}

function openImageNodePreview(nodeId){
    const node = nodes.find(n => n.id === nodeId);
    if(!node?.url || isMissingAssetUrl(node.url)) return;
    const kind = mediaKindForNode(node);
    if(!['image','video','audio'].includes(kind)) return;
    openOutputLightbox(node.url, node);
}

function openOutputNodeMenu(nodeId, clientX, clientY){
    const node = nodes.find(n => n.id === nodeId);
    if(!node || node.type !== 'output') return;
    closeCreateMenu();
    const imageCount = outputImageUrls(node).length;
    const downloadableCount = outputDownloadableImageUrls(node).length;
    imageNodeMenu.classList.add('output-node-menu');
    imageNodeMenu.innerHTML = `
        <div class="menu-section-title">${tr('canvas.outputGroupActions')}</div>
        <button class="menu-btn" data-output-convert="${escapeAttr(nodeId)}" ${imageCount ? '' : 'disabled'}><i data-lucide="replace" class="w-4 h-4"></i><span>${tr('canvas.outputConvertToInputGroup')}</span></button>
        <button class="menu-btn" data-output-copy="${escapeAttr(nodeId)}" ${imageCount ? '' : 'disabled'}><i data-lucide="copy-plus" class="w-4 h-4"></i><span>${tr('canvas.outputCopyToInputGroup')}</span></button>
        <div class="menu-divider"></div>
        <div class="menu-section-title">${tr('canvas.outputFileActions')}</div>
        <button class="menu-btn" data-output-download="${escapeAttr(nodeId)}" ${downloadableCount ? '' : 'disabled'}><i data-lucide="download" class="w-4 h-4"></i><span>${tr('canvas.outputDownloadAllImages')}</span></button>
    `;
    const menuWidth = 260;
    imageNodeMenu.style.left = `${Math.max(10, Math.min(window.innerWidth - menuWidth - 10, clientX))}px`;
    imageNodeMenu.style.top = `${clientY}px`;
    imageNodeMenu.classList.add('open');
    const convertBtn = imageNodeMenu.querySelector('[data-output-convert]');
    if(convertBtn){
        convertBtn.onclick = e => {
            e.stopPropagation();
            convertOutputNodeToInputGroup(nodeId);
            closeImageNodeMenu();
        };
    }
    imageNodeMenu.querySelector('[data-output-copy]').onclick = e => {
        e.stopPropagation();
        copyOutputNodeToInputGroup(nodeId);
        closeImageNodeMenu();
    };
    const downloadBtn = imageNodeMenu.querySelector('[data-output-download]');
    if(downloadBtn){
        downloadBtn.onclick = e => {
            e.stopPropagation();
            downloadOutputNodeImages(nodeId);
            closeImageNodeMenu();
        };
    }
    refreshIcons();
}

function closeImageNodeMenu(){
    imageNodeMenu.classList.remove('open');
    imageNodeMenu.classList.remove('output-node-menu');
    imageNodeMenu.classList.remove('asset-target-menu');
    imageNodeMenu.innerHTML = '';
}

function menuAdd(type){
    closeCreateMenu();
    if(type === 'image') addImageNode(menuPoint);
    if(type === 'prompt') addPromptNode(menuPoint);
    if(type === 'loop') addLoopNode(menuPoint);
    if(type === 'llm') addLLMNode(menuPoint);
    if(type === 'generator') addGeneratorNode(menuPoint);
    if(type === 'msgen') addMsGenNode(menuPoint);
    if(type === 'video') addVideoNode(menuPoint);
    if(type === 'comfy') addComfyNode(menuPoint);
    if(type === 'ltxDirector') addLTXDirectorNode(menuPoint);
    if(type === 'output') addOutputNode(menuPoint);
}

function nodeHasLiveMedia(node){
    return node?.type === 'image' && node.url && mediaKindForNode(node) === 'video';
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
            const promise = media.play();
            if(promise?.catch) promise.catch(() => {});
        }
    };
    if(media.readyState >= 1) applyTime();
    else media.addEventListener('loadedmetadata', applyTime, {once:true});
}

function mediaSignatureFromElement(el){
    const media = el?.querySelector?.('video,audio');
    if(!media) return '';
    const tag = media.tagName.toLowerCase();
    const url = media.dataset?.url || media.getAttribute('src') || '';
    return url ? `${tag}:${url}` : '';
}

function transplantNodeMediaElement(oldNodeEl, newNodeEl){
    const oldMedia = oldNodeEl?.querySelector?.('video,audio');
    const newMedia = newNodeEl?.querySelector?.('video,audio');
    if(!oldMedia || !newMedia) return;
    const oldSignature = mediaSignatureFromElement(oldNodeEl);
    const newSignature = mediaSignatureFromElement(newNodeEl);
    if(!oldSignature || oldSignature !== newSignature) return;
    const state = captureMediaPlaybackState(oldMedia);
    newMedia.replaceWith(oldMedia);
    restoreMediaPlaybackState(oldMedia, state);
    requestAnimationFrame(() => restoreMediaPlaybackState(oldMedia, state));
}

function captureMediaPlaybackStates(){
    const states = new Map();
    nodesEl.querySelectorAll('video[data-url], audio[data-url]').forEach(media => {
        const tag = media.tagName.toLowerCase();
        const url = media.dataset.url || media.getAttribute('src') || '';
        if(url) states.set(`${tag}:${url}`, captureMediaPlaybackState(media));
    });
    return states;
}

function restoreMediaPlaybackStates(states){
    if(!states?.size) return;
    nodesEl.querySelectorAll('video[data-url], audio[data-url]').forEach(media => {
        const tag = media.tagName.toLowerCase();
        const url = media.dataset.url || media.getAttribute('src') || '';
        restoreMediaPlaybackState(media, states.get(`${tag}:${url}`));
    });
}

// 轻量占位节点 —— 视野外只渲染壳子，不生成图片 innerHTML，避免触发缩略图请求
function renderNodePlaceholder(node){
    const size = defaultNodeSize(node.type);
    const el = document.createElement('div');
    el.className = `node ${node.type}-node node-placeholder ${selected.has(node.id) ? 'selected' : ''}`;
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.style.width = `${node.w || size.w}px`;
    if(node.h || size.h) el.style.height = `${node.h || size.h}px`;
    el.dataset.id = node.id;
    el.onclick = (e) => {
        e.stopPropagation();
        if(isNodeControl(e.target)) return;
        if(e.ctrlKey || e.metaKey) selected.has(node.id) ? selected.delete(node.id) : selected.add(node.id);
        else if(!selected.has(node.id)) { selected.clear(); selected.add(node.id); }
        refreshSelectionVisuals();
    };
    el.innerHTML = `<div class="node-head"><span class="node-title">${escapeHtml(node.title || nodeTypeLabel(node) || 'Node')}</span></div>`;
    return el;
}

function nodeTypeLabel(node){
    if(!node) return '';
    const t = node.type;
    if(t === 'image') return 'Image';
    if(t === 'prompt') return 'Prompt';
    if(t === 'loop') return tr('canvas.loopNode');
    if(t === 'output') return 'Output';
    if(t === 'llm') return 'LLM';
    if(t === 'comfy') return 'ComfyUI';
    if(t === 'video') return tr('canvas.videoGenerateNode');
    if(t === 'msgen') return tr('canvas.modelscopeGenerate');
    if(t === 'ltxDirector') return tr('canvas.ltxDirector');
    return t || 'Node';
}

function renderOffscreenPlaceholders(){
    if(!nodesEl) return;
    const placeholders = nodesEl.querySelectorAll('.node-placeholder');
    if(!placeholders.length) return;
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    let changed = false;
    placeholders.forEach(el => {
        const id = el.dataset.id;
        if(!id) return;
        const node = nodeById.get(id);
        if(!node || !isNodeInCanvasViewport(node, 400)){
            // 仍在视野外或节点已删除，保持/移除占位
            if(!node){ el.remove(); changed = true; }
            return;
        }
        // 进入视野：替换为完整节点
        const fresh = renderNode(node);
        el.replaceWith(fresh);
        changed = true;
        bindCanvasPreviewImageFallbacks(fresh);
    });
    if(!changed) return;
    refreshIcons();
    refreshGeometry();
    refreshGeometryAfterLayout();
}

function suspendCanvasPreviewImage(img){
    if(suspendedCanvasPreviewImages.has(img)) return false;
    const src = img.getAttribute('src');
    // Do not interrupt pending/failed requests or their normal fallback handling.
    if(!src || !img.complete || !img.naturalWidth) return false;
    const width = img.offsetWidth, height = img.offsetHeight;
    if(!width || !height) return false;
    const state = {src, srcset:img.getAttribute('srcset'), width:img.style.width, height:img.style.height, visibility:img.style.visibility};
    suspendedCanvasPreviewImages.set(img, state);
    img.style.width = `${width}px`;
    img.style.height = `${height}px`;
    img.style.visibility = 'hidden';
    img.dataset.canvasMediaSuspended = '1';
    img.removeAttribute('srcset');
    img.removeAttribute('src');
    return true;
}

function restoreCanvasPreviewImage(img){
    const state = suspendedCanvasPreviewImages.get(img);
    if(!state) return false;
    suspendedCanvasPreviewImages.delete(img);
    delete img.dataset.canvasMediaSuspended;
    img.style.width = state.width;
    img.style.height = state.height;
    img.style.visibility = state.visibility;
    if(state.srcset !== null) img.setAttribute('srcset', state.srcset);
    img.setAttribute('src', state.src);
    return true;
}

function refreshCanvasMediaVisibility(){
    if(!canvas || !nodesEl) return;
    // Navigation/interaction must settle before releasing anything.
    if(dragNode || resizeNode || dragBoard || minimapDrag || selectDrag || tempLink || knifeActive || internalDrag) return;
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const protectedIds = new Set(selected);
    for(const id of selected){
        const node = nodeById.get(id);
        if(node?.type === 'group') (node.items || []).forEach(childId => protectedIds.add(childId));
    }
    let restored = false;
    nodesEl.querySelectorAll('.image-node:not(.node-placeholder)').forEach(el => {
        const node = nodeById.get(el.dataset.id);
        if(!node || node.type !== 'image' || !['image','video'].includes(mediaKindForNode(node))) return;
        const protectedNode = protectedIds.has(node.id) || node.running || node._pending?.length
            || cascadeRunningNodeIds.has(node.id) || ['running','queued'].includes(node.runStatus)
            || el.contains(document.activeElement) || el.querySelector('video, audio, [data-dragging]')
            || cropState?.nodeId === node.id || currentOutputLightboxOutId === node.id
            || (currentOutputLightboxUrl && currentOutputLightboxUrl === node.url);
        const enter = protectedNode || isNodeInCanvasViewport(node, 400);
        const release = !enter && !isNodeInCanvasViewport(node, 800);
        if(!enter && !release) return;
        el.querySelectorAll('.image-preview-wrap img').forEach(img => {
            if(enter) restored = restoreCanvasPreviewImage(img) || restored;
            else suspendCanvasPreviewImage(img);
        });
    });
    if(restored) refreshGeometryAfterLayout();
}

function render(){
    const outputScrolls = captureOutputScrolls();
    const mediaStates = captureMediaPlaybackStates();
    const reusableMediaNodes = new Map();
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    nodesEl.querySelectorAll('.node').forEach(el => {
        const node = nodeById.get(el.dataset.id);
        if(nodeHasLiveMedia(node)) reusableMediaNodes.set(node.id, el);
    });
    applyViewport();
    [...nodesEl.children].forEach(child => {
        if(!reusableMediaNodes.has(child.dataset?.id)) child.remove();
    });
    nodes.forEach(node => {
        const inViewport = isNodeInCanvasViewport(node, 400);
        const fresh = inViewport ? renderNode(node) : renderNodePlaceholder(node);
        const old = reusableMediaNodes.get(node.id);
        nodesEl.appendChild(fresh);
        if(old){
            transplantNodeMediaElement(old, fresh);
            if(old !== fresh) old.remove();
        }
    });
    restoreMediaPlaybackStates(mediaStates);
    restoreOutputScrolls(outputScrolls);
    refreshGeometry();
    refreshGeometryAfterLayout();
    refreshIcons();
    bindCanvasPreviewImageFallbacks(nodesEl);
    refreshOutputTimer();
    updateCanvasCostButton();
}

function refreshNodes(ids=[], {rebuildOutputs=false}={}){
    const uniqueIds = [...new Set((ids || []).filter(Boolean))];
    if(!uniqueIds.length) return;
    const outputScrolls = captureOutputScrolls();
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    applyViewport();
    for(const id of uniqueIds){
        const node = nodeById.get(id);
        if(!node) continue;
        if(!rebuildOutputs && node.type === 'output' && refreshOutputNodeContent(node)) continue;
        const current = nodesEl.querySelector(`.node[data-id="${CSS.escape(id)}"]`);
        const fresh = !current && !isNodeInCanvasViewport(node,400) ? renderNodePlaceholder(node) : renderNode(node);
        if(current && nodeHasLiveMedia(node)) transplantNodeMediaElement(current, fresh);
        if(current) current.replaceWith(fresh);
        else nodesEl.appendChild(fresh);
    }
    restoreOutputScrolls(outputScrolls);
    refreshGeometry(uniqueIds);
    refreshGeometryAfterLayout(uniqueIds);
    refreshIcons();
    bindCanvasPreviewImageFallbacks(nodesEl);
    refreshOutputTimer();
}

function refreshRunNodes(node, out=null){
    refreshNodes([node?.id, out?.id]);
}

function normalizedPendingPreviewSize(size){
    const w = Number(size?.w ?? size?.width ?? 0);
    const h = Number(size?.h ?? size?.height ?? 0);
    if(w > 0 && h > 0) return {w:Math.round(w), h:Math.round(h)};
    return null;
}

function pendingPreviewSizeFromSizeString(sizeStr){
    const parsed = parseSizeValue(sizeStr);
    return parsed ? normalizedPendingPreviewSize(parsed) : null;
}

function pendingPreviewSizeFromNode(node){
    if(!node) return null;
    const natural = normalizedPendingPreviewSize({w:node.natural_w || node.width, h:node.natural_h || node.height});
    if(natural) return natural;
    if(node.type === 'image'){
        const img = nodesEl?.querySelector?.(`.image-node[data-id="${CSS.escape(node.id)}"] img`);
        if(isCanvasPreviewImage(img)) return null;
        const domSize = normalizedPendingPreviewSize({w:img?.naturalWidth, h:img?.naturalHeight});
        if(domSize) return domSize;
    }
    if(node.type === 'output'){
        const item = [...(node.images || [])].reverse().find(outputUrlValue);
        const meta = item && typeof item === 'object' ? item : {};
        return normalizedPendingPreviewSize(meta);
    }
    return null;
}

function pendingPreviewSizeFromRefs(refs=[]){
    for(const ref of refs || []){
        const direct = normalizedPendingPreviewSize(ref);
        if(direct) return direct;
        const url = ref?.url;
        if(!url) continue;
        const node = nodes.find(n =>
            (n.type === 'image' && n.url === url) ||
            (n.type === 'output' && (n.images || []).some(item => outputUrlValue(item) === url))
        );
        const nodeSize = pendingPreviewSizeFromNode(node);
        if(nodeSize) return nodeSize;
        const media = nodesEl?.querySelector?.(`[data-url="${CSS.escape(url)}"], [data-output-url="${CSS.escape(url)}"] img, img[src="${CSS.escape(url)}"]`);
        if(isCanvasPreviewImage(media)) continue;
        const domSize = normalizedPendingPreviewSize({w:media?.naturalWidth || media?.videoWidth, h:media?.naturalHeight || media?.videoHeight});
        if(domSize) return domSize;
    }
    return null;
}

function pendingPreviewSizeForRun(node, options={}){
    const requestSize = normalizedPendingPreviewSize(options.requestSize) || pendingPreviewSizeFromSizeString(options.requestSize);
    if(requestSize) return requestSize;
    if(node?.type === 'comfy' && (node.mode || 'text') === 'text'){
        return normalizedPendingPreviewSize({w:Number(node.width || 1024), h:Number(node.height || 1024)});
    }
    return pendingPreviewSizeFromRefs(options.refs || []);
}

function pendingOutputStyle(pending){
    const size = normalizedPendingPreviewSize(pending?.previewSize);
    if(!size) return '';
    return ` style="aspect-ratio:${Math.max(1, size.w)}/${Math.max(1, size.h)}"`;
}

function renderPendingOutput(pending){
    if(window.CanvasSession?.enabled && pending?.canvasTaskId){
        const state=window.MemberCanvasEdit?.taskState?.(pending) || {status:'checking',label:'正在核对后台任务'};
        return `<div class="output-img-wrap loading-wrap recoverable" data-pending-id="${escapeAttr(pending.id)}" data-task-recovery="${state.status}"${pendingOutputStyle(pending)}>
            <div class="output-recover-state">
                <i data-lucide="${state.status==='running'?'loader-2':'info'}" class="${state.status==='running'?'spinning':''}"></i>
                <div class="output-recover-title">${escapeHtml(state.label)}</div>
                <div class="output-recover-sub">${state.status==='succeeded'?'结果已保存；开始编辑后核对回填，或从生成结果加入新节点。':'查询不会重新生成或产生费用。'}</div>
                <button class="output-recover-query" type="button">${state.status==='succeeded'?'查看生成结果':'刷新状态'}</button>
            </div><button class="output-del" title="${tr('common.delete')}">×</button></div>`;
    }
    if(pending?.paused){
        return `<div class="output-img-wrap loading-wrap recoverable" data-pending-id="${escapeAttr(pending.id)}"${pendingOutputStyle(pending)}>
            <span class="output-time-pill">已暂停回填</span>
            <div class="output-recover-state">
                <i data-lucide="pause"></i>
                <div class="output-recover-title">自动回填已暂停</div>
                <div class="output-recover-sub">输入已变化。后台任务不会因此取消，请到生成结果查看进度并确认加入。</div>
                <button class="output-recover-query" type="button">查看生成结果</button>
            </div>
            <button class="output-del" title="${tr('common.delete')}">×</button>
        </div>`;
    }
    if(pending?.failed){
        const taskId = pending.recoverTaskId || '';
        const querying = Boolean(pending.querying);
        const msg = pending.error || tr('canvas.generationFailed');
        const sub = taskId ? `任务 ID：${escapeHtml(taskId)}` : '没有任务 ID，无法查询';
        return `<div class="output-img-wrap loading-wrap recoverable" data-pending-id="${escapeAttr(pending.id)}"${pendingOutputStyle(pending)}>
            <span class="output-time-pill failed">失败</span>
            <div class="output-recover-state">
                <i data-lucide="refresh-cw" class="${querying ? 'spinning' : ''}"></i>
                <div class="output-recover-title">${querying ? '查询中' : '任务未丢失'}</div>
                <div class="output-recover-sub" title="${escapeAttr(msg)}">${sub}</div>
                <button class="output-recover-query" type="button" ${taskId && !querying ? '' : 'disabled'}>${querying ? '查询中...' : '查询结果'}</button>
            </div>
            <button class="output-del" title="${tr('common.delete')}">×</button>
        </div>`;
    }
    return `<div class="output-img-wrap loading-wrap" data-pending-id="${escapeAttr(pending.id)}"${pendingOutputStyle(pending)}><span class="output-time-pill running">${formatRunDuration(nowMs() - Number(pending.startedAt || nowMs()))}</span><div class="output-spinner"></div><button class="output-del" title="${tr('common.delete')}">×</button></div>`;
}

function captureOutputScrolls(){
    const state = new Map();
    // output 节点滚动位置
    nodesEl.querySelectorAll('.output-node').forEach(el => {
        const body = el.querySelector('.node-body');
        if(body) state.set('out:' + el.dataset.id, { top:body.scrollTop, left:body.scrollLeft });
    });
    // LLM 聊天日志滚动位置（记录是否在底部，以便恢复时保持底部）
    nodesEl.querySelectorAll('.llm-node').forEach(el => {
        const log = el.querySelector('.llm-chat-log');
        if(!log) return;
        const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 12;
        state.set('llm:' + el.dataset.id, { top:log.scrollTop, atBottom });
    });
    return state;
}

function restoreOutputScrolls(state){
    requestAnimationFrame(() => {
        state.forEach((pos, key) => {
            if(key.startsWith('out:')){
                const id = key.slice(4);
                const body = nodesEl.querySelector(`.output-node[data-id="${CSS.escape(id)}"] .node-body`);
                if(body){ body.scrollTop = pos.top || 0; body.scrollLeft = pos.left || 0; }
            } else if(key.startsWith('llm:')){
                const id = key.slice(4);
                const log = nodesEl.querySelector(`.llm-node[data-id="${CSS.escape(id)}"] .llm-chat-log`);
                if(log){
                    // 之前在底部 → 保持底部（显示最新消息）；否则恢复原位
                    log.scrollTop = pos.atBottom ? log.scrollHeight : (pos.top || 0);
                }
            }
        });
    });
}

function isNodeControl(target){
    return !!target.closest('textarea, input, select, option, button, summary, audio, video, [contenteditable="true"], .seg, .gen-btn, .comfy-run, .input-item, .blank-image, .mode-tabs, .ms-model-tabs, .llm-provider, .llm-output, .llm-chat-log, .llm-bubble, .llm-pane-resizer, .loop-preview, .ltx-director-timeline-host, .pr-wrapper, .pr-toolbar, .pr-viewport, .pr-canvas, .pr-player-controls, .pr-prompt-area');
}

function destroyLTXEditor(node){
    if(!node?._ltxEditor) return;
    try { node._ltxEditor.destroy?.(); } catch(e) {}
    node._ltxEditor = null;
}

function isNodeDragSurface(target){
    return !isNodeControl(target) && !target.closest('.port, .resize-handle, .output-img-wrap');
}

function bindCanvasNodeAssetDrag(img, node){
    const payload = canvasNodeAssetDragPayload(node);
    if(!img || !payload) return;
    img.draggable = true;
    img.title = img.title || '拖到画布或资产库侧栏';
    img.addEventListener('mousedown', event => {
        if(event.button !== 0) return;
        event.stopPropagation();
    }, true);
    img.addEventListener('dragstart', event => {
        event.stopPropagation();
        img.dataset.dragging = '1';
        setOutputDragPreview(event, img);
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData(CANVAS_NODE_ASSET_DRAG_TYPE, JSON.stringify(payload));
        event.dataTransfer.setData('text/uri-list', payload.url);
        event.dataTransfer.setData('text/plain', payload.url);
    }, true);
    img.addEventListener('dragend', () => setTimeout(() => { delete img.dataset.dragging; }, 0), true);
}

function renderNode(node){
    normalizeApiNodeLayout(node);
    const el = document.createElement('div');
    const nodeMediaKind = node.type === 'image' && node.url ? mediaKindForNode(node) : '';
    const size = nodeMediaKind === 'audio' ? {w:280, h:204}
        : nodeMediaKind === 'image' && !node.h ? {w:260, h:0} : defaultNodeSize(node.type);
    const hasFixedSize = Boolean(node.h || size.h);
    const faceAuth = node.type === 'image' ? canvasFaceAuthState(node) : {};
    const faceVerified = Boolean(faceAuth.ready);
    const faceVerifying = ['Queued','Uploading','Processing'].includes(faceAuth.status);
    el.className = `node ${node.type}-node ${nodeMediaKind === 'audio' ? 'audio-node' : ''} ${node.url ? 'has-image' : ''} ${faceVerified ? 'face-verified' : ''} ${faceVerifying ? 'face-verifying' : ''} ${hasFixedSize ? 'sized' : ''} ${selected.has(node.id) ? 'selected' : ''}`;
    if(faceVerifying) el.title = '素材认证审核中';
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.style.width = `${node.w || size.w}px`;
    if(node.h || size.h) el.style.height = `${node.h || size.h}px`;
    el.dataset.id = node.id;
    el.onclick = (e) => {
        e.stopPropagation();
        if(isNodeControl(e.target)) return;
        if(e.ctrlKey || e.metaKey) selected.has(node.id) ? selected.delete(node.id) : selected.add(node.id);
        else if(!selected.has(node.id)) { selected.clear(); selected.add(node.id); }
        refreshSelectionVisuals();
    };
    el.oncontextmenu = e => {
    if(!CANVAS_GENERATOR_TYPES.includes(node.type) && node.type !== 'output') return;
        e.preventDefault();
        e.stopPropagation();
        if(node.type === 'output') openOutputNodeMenu(node.id, e.clientX, e.clientY);
        else openGeneratorNodeMenu(node.id, e.clientX, e.clientY);
    };
    const title = node.type === 'image' ? 'Image' : node.type === 'prompt' ? (langIsEn() ? 'Prompt' : '提示词') : node.type === 'loop' ? tr('canvas.loopNode') : node.type === 'promptGroup' ? 'Prompts' : node.type === 'group' ? 'Group' : node.type === 'output' ? 'Output' : node.type === 'llm' ? 'LLM' : node.type === 'comfy' ? 'ComfyUI' : node.type === 'ltxDirector' ? tr('canvas.ltxDirector') : node.type === 'msgen' ? tr('canvas.modelscopeGenerate') : node.type === 'video' ? tr('canvas.videoGenerateNode') : tr('canvas.apiGenerate');
    const displayTitle = node.type === 'image' && node.url ? nodeTitleForMedia(node) : title;
    // 失败徽章只在一键运行模式中显示，单节点失败已通过 alert 提示
    const showStatus = ['generator','msgen','comfy','ltxDirector','llm','video'].includes(node.type) && node.runStatus
        && (node.runStatus !== 'failed' || node._cascadeFailed);
    const statusHtml = showStatus ? (() => {
        const label = { queued:'排队中', running:'运行中', done:'完成', failed:'失败' }[node.runStatus] || '';
        return `<span class="node-run-status ${node.runStatus}"><span class="dot"></span>${escapeHtml(label)}${node._cascadeIdx?' '+node._cascadeIdx:''}</span>`;
    })() : '';
    el.innerHTML = `<div class="node-head"><span class="node-title">${displayTitle}</span><div class="node-head-actions">${statusHtml}<button type="button" title="${langIsEn() ? 'Delete node' : '删除节点'}" aria-label="${langIsEn() ? 'Delete node' : '删除节点'}" onclick="deleteNodeFromButton('${node.id}', event)" class="node-delete-btn text-gray-300 hover:text-red-500"><i data-lucide="x" class="w-4 h-4"></i></button></div></div>`;
    const body = document.createElement('div');
    body.className = 'node-body';
    if(node.type === 'image') {
        if(node.url) {
            const missing = isMissingAssetUrl(node.url);
            const mediaKind = nodeMediaKind;
            const isEditableImage = mediaKind === 'image' && !missing;
            body.innerHTML = `<div class="image-preview-wrap">${missing ? missingAssetHtml(node.url) : canvasPreviewImgHtml(node.url, 768, 'draggable="true"')}</div><div class="image-caption text-[11px] text-gray-400 truncate" title="${escapeAttr(node.name || nodeTitleForMedia(node))}">${escapeHtml(node.name || 'image')}${missing ? ` · ${langIsEn() ? 'missing' : '文件缺失'}` : ''}</div>`;
            if(!missing && mediaKind !== 'image'){
                const mediaHtml = mediaKind === 'video'
                    ? `<div class="media-card video-card">${canvasVideoPreviewHtml(node.url, 768, 'draggable="false"')}<button class="canvas-video-play" type="button" title="打开视频灯箱" aria-label="打开视频灯箱"><i data-lucide="play"></i></button></div>`
                    : `<div class="media-card audio-card"><div class="audio-card-copy"><div class="audio-title" title="${escapeAttr(node.name || 'Audio')}">${escapeHtml(node.name || 'Audio')}</div><div class="audio-meta">${escapeHtml(audioFormatLabel(node.name, node.url))} · 音频素材</div></div><div class="audio-player-row"><button class="audio-card-open" type="button" title="打开音频播放器" aria-label="打开音频播放器"><i data-lucide="play"></i></button>${audioWaveformSvg()}</div></div>`;
                body.innerHTML = mediaKind === 'audio'
                    ? `<div class="image-preview-wrap">${mediaHtml}</div>`
                    : `<div class="image-preview-wrap">${mediaHtml}</div><div class="image-caption text-[11px] text-gray-400 truncate" title="${escapeAttr(node.name || nodeTitleForMedia(node))}">${escapeHtml(node.name || nodeTitleForMedia(node))}</div>`;
            }
            const previewWrap = body.querySelector('.image-preview-wrap');
            const loadedImg = body.querySelector('img');
            const videoPlayBtn = body.querySelector('.canvas-video-play');
            const audioOpenBtn = body.querySelector('.audio-card-open');
            const openPreview = e => {
                if(!node.url || missing) return;
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                if(isEditableImage) openImageEditor(node.id, (e.shiftKey || e.altKey) ? 'crop' : 'preview');
                else openImageNodePreview(node.id);
            };
            body.onmousedown = e => {
                if(e.detail >= 2){
                    openPreview(e);
                    return;
                }
                startNodeDrag(e, node);
            };
            body.ondragover = e => allowImageNodeDropEvent(e, previewWrap);
            body.ondragleave = e => {
                e.stopPropagation();
                previewWrap.classList.remove('drag-over');
            };
            body.ondrop = e => handleImageNodeDropEvent(e, node.id, previewWrap);
            body.oncontextmenu = e => {
                e.preventDefault();
                e.stopPropagation();
                openImageNodeMenu(node.id, e.clientX, e.clientY);
            };
            bindCanvasNodeAssetDrag(loadedImg, node);
            if(loadedImg && isEditableImage){
                loadedImg.addEventListener('mousedown', e => {
                    if(e.detail >= 2) openPreview(e);
                }, true);
                loadedImg.addEventListener('dblclick', openPreview, true);
            }
            if(loadedImg && mediaKind === 'video'){
                loadedImg.addEventListener('mousedown', e => {
                    if(e.button !== 0) return;
                    e.stopPropagation();
                }, true);
                loadedImg.addEventListener('click', openPreview, true);
            }
            if(videoPlayBtn && loadedImg && mediaKind === 'video'){
                videoPlayBtn.addEventListener('mousedown', e => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                }, true);
                videoPlayBtn.addEventListener('click', openPreview, true);
            }
            if(audioOpenBtn){
                audioOpenBtn.addEventListener('click', openPreview, true);
            }
            body.addEventListener('dblclick', openPreview, true);
            if(loadedImg && loadedImg.complete && loadedImg.naturalHeight > 0){
                scheduleGeometryRefresh();
            }
            if(loadedImg) {
                loadedImg.onload = () => {
                    if(loadedImg.dataset.canvasMediaSuspended) return;
                    refreshGeometryAfterLayout();
                    scheduleViewportRefresh();
                };
            }
        } else {
        body.innerHTML = `<div class="blank-image"><i data-lucide="image-plus" class="w-7 h-7"></i><div class="text-[11px] font-bold">${tr('canvas.clickDragPasteImage')}</div></div>`;
            const blank = body.querySelector('.blank-image');
            blank.onclick = () => pickImageForNode(node.id);
            blank.ondragover = e => allowImageNodeDropEvent(e, blank);
            blank.ondragleave = e => { e.stopPropagation(); blank.classList.remove('drag-over'); };
            blank.ondrop = e => handleImageNodeDropEvent(e, node.id, blank);
        }
    }
    if(node.type === 'prompt') {
        const templateActive = promptTemplateModal?.classList.contains('open') && promptTemplateNodeId === node.id;
        el.querySelector('.node-head-actions').insertAdjacentHTML('afterbegin', `<button class="prompt-template-btn ${templateActive ? 'active' : ''}" type="button" data-prompt-template-open data-prompt-template-node-id="${escapeAttr(node.id)}" aria-pressed="${templateActive ? 'true' : 'false'}" title="${escapeAttr(tr('canvas.promptTemplateLibrary'))}"><i data-lucide="library"></i><span>${escapeHtml(tr('canvas.promptTemplateShort'))}</span></button>`);
        body.innerHTML = `<div class="prompt-editor"><textarea aria-label="${langIsEn() ? 'Prompt' : '提示词'}" placeholder="${tr('canvas.promptPlaceholder')}">${escapeHtml(node.text || '')}</textarea>${promptCounterHtml(node.text || '')}</div>`;
        const textarea = body.querySelector('textarea');
        const templateBtn = el.querySelector('[data-prompt-template-open]');
        templateBtn.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            openPromptTemplateModal(node.id);
        };
        bindScrollableText(textarea);
        textarea.oninput = e => {
            node.text = e.target.value;
            refreshPromptCounter(body, node.text);
            scheduleSave();
            refreshPromptDependents(node.id);
        };
    }
    if(node.type === 'loop') body.appendChild(renderLoopBody(node));
    if(node.type === 'group') {
        const items = (node.items || []).map(id => nodes.find(n => n.id === id)).filter(Boolean);
        const imgCount = items.filter(n => n.type === 'image').length;
        const promptCount = items.filter(n => n.type === 'prompt').length;
        const parts = [];
        if(imgCount) parts.push(`${imgCount} ${tr('canvas.imageCount')}`);
        if(promptCount) parts.push(`${promptCount} ${tr('canvas.promptCount')}`);
        const text = parts.length ? `${parts.join(' · ')} ${tr('canvas.grouped')}` : tr('canvas.groupEmpty');
        body.innerHTML = `<div class="text-[11px] text-gray-400">${text}</div>`;
        const previewItems = groupImageItems(node);
        if(previewItems.length){
            const openGroupPreview = e => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation?.();
                openGroupLightbox(node.id);
            };
            body.style.cursor = 'zoom-in';
            body.onmousedown = e => {
                if(e.button !== 0) return;
                if(e.detail >= 2){
                    openGroupPreview(e);
                    return;
                }
                startNodeDrag(e, node);
            };
            body.ondblclick = openGroupPreview;
        }
    }
    if(node.type === 'promptGroup') {
        const promptNodes = (node.items || []).map(id => nodes.find(n => n.id === id)).filter(Boolean);
        body.innerHTML = `<div class="text-[11px] text-gray-400">${promptNodes.length} ${tr('canvas.promptCount')} ${tr('canvas.grouped')}</div>`;
    }
    if(node.type === 'llm') body.appendChild(renderLLMBody(node));
    if(node.type === 'generator') body.appendChild(renderGeneratorBody(node));
    if(node.type === 'msgen') body.appendChild(renderMsGenBody(node));
    if(node.type === 'video') body.appendChild(renderVideoBody(node));
    if(node.type === 'comfy') body.appendChild(renderComfyBody(node));
    if(node.type === 'ltxDirector') body.appendChild(renderLTXDirectorBody(node));
    if(node.type === 'output') {
        const pendingHtml = (node._pending || []).map(p =>
            renderPendingOutput(p)
        ).join('');
        body.innerHTML = renderOutputGrid(node, pendingHtml);
        body.onwheel = e => {
            e.stopPropagation();
        };
        body.querySelectorAll('.output-img-wrap').forEach(wrap => bindOutputWrap(wrap, node));
    }
    el.appendChild(body);
    el.querySelectorAll('button, select, textarea, input').forEach(control => {
        control.addEventListener('mousedown', e => e.stopPropagation(), true);
        control.addEventListener('click', e => e.stopPropagation());
    });
    el.onmousedown = e => {
        if(e.button !== 0 || !isNodeDragSurface(e.target)) return;
        startNodeDrag(e, node);
    };
    const canInput = ['generator','comfy','ltxDirector','output','llm','msgen','video'].includes(node.type) || (node.type === 'loop' && (node.imageInput || node.showPrompt));
    const canOutput = ['image','prompt','loop','group','promptGroup','generator','comfy','ltxDirector','llm','msgen','video','output'].includes(node.type);
    if(canInput) el.insertAdjacentHTML('beforeend', `<div class="port in" title="${tr('canvas.connectHere')}"></div>`);
    if(canOutput) el.insertAdjacentHTML('beforeend', `<div class="port out" title="${tr('canvas.dragConnect')}"></div>`);
    el.insertAdjacentHTML('beforeend', `<div class="resize-handle" title="${tr('canvas.resize')}"></div>`);
    el.querySelector('.node-head').onmousedown = e => {
        if(e.button !== 0) return;
        if(isNodeControl(e.target)) return;
        if(node.type === 'group' && e.detail >= 2 && groupImageItems(node).length){
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation?.();
            openGroupLightbox(node.id);
            return;
        }
        startNodeDrag(e, node);
    };
    el.querySelector('.resize-handle').onmousedown = e => { if(e.button === 0 && !e.shiftKey) startNodeResize(e, node); };
    el.ondragstart = e => { e.preventDefault(); e.stopPropagation(); };
    const out = el.querySelector('.port.out');
    if(out) out.onmousedown = e => { if(e.button === 0 && !e.shiftKey) startLink(e, node.id, 'out'); };
    const inp = el.querySelector('.port.in');
    if(inp) inp.onmousedown = e => { if(e.button === 0 && !e.shiftKey) startLink(e, node.id, 'in'); };
    return el;
}

function bindOutputWrap(wrap, node){
    const img = wrap.querySelector('img');
    const video = wrap.querySelector('video');
    const audioCard = wrap.querySelector('.output-audio-card');
    const fileCard = wrap.querySelector('.output-file-card');
    const playBtn = wrap.querySelector('.canvas-video-play');
    const download = wrap.querySelector('.output-download');
    const del = wrap.querySelector('.output-del');
    const recoverQuery = wrap.querySelector('.output-recover-query');
    if(img){
        img.draggable = true;
        img.ondragstart = e => {
            e.stopPropagation();
            img.dataset.dragging = '1';
            setOutputDragPreview(e, img);
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('application/x-canvas-output-image', img.dataset.url);
            e.dataTransfer.setData('text/uri-list', img.dataset.url);
        };
        img.ondragend = () => setTimeout(() => { delete img.dataset.dragging; }, 0);
        img.onclick = e => {
            e.stopPropagation();
            if(img.dataset.dragging) return;
            if(img.dataset.previewKind === 'video'){
                openOutputLightbox(img.dataset.url || wrap.dataset.outputUrl || '', node);
                return;
            }
            openOutputLightbox(img.dataset.url, node);
        };
    }
    if(video){
        video.onclick = e => {
            e.stopPropagation();
        };
        video.ondblclick = e => {
            e.stopPropagation();
            openOutputLightbox(video.dataset.url, node);
        };
    }
    if(playBtn){
        playBtn.onmousedown = e => {
            e.preventDefault();
            e.stopPropagation();
        };
        playBtn.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            const url = wrap.querySelector('[data-output-video-fallback]')?.dataset.outputVideoFallback
                || wrap.querySelector('img[data-preview-kind="video"]')?.dataset.url
                || wrap.querySelector('video[data-url]')?.dataset.url
                || wrap.dataset.outputUrl
                || '';
            if(url) openOutputLightbox(url, node);
        };
    }
    if(audioCard){
        audioCard.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            const url = wrap.dataset.outputUrl || '';
            if(url) openOutputLightbox(url, node);
        };
    }
    if(fileCard){
        fileCard.onclick = e => {
            e.stopPropagation();
            const url = wrap.dataset.outputUrl;
            if(url) downloadUrl(url, outputDownloadName(url)).catch(err => alert(err.message || '下载失败'));
        };
    }
    if(download){
        download.onmousedown = e => e.stopPropagation();
        download.onclick = e => {
            e.stopPropagation();
            const url = wrap.dataset.outputUrl;
            const name = outputDownloadName(url);
            if(url) downloadUrl(`/api/download-output?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`, name);
        };
    }
    if(del){
        del.onmousedown = e => e.stopPropagation();
        del.onclick = e => {
            e.stopPropagation();
            if(isCanvasLockedByOther())return;
            pushUndo();
            const graph=canvasInputGraph();
            const pid = wrap.dataset.pendingId;
            if(pid){
                node._pending = (node._pending || []).filter(p => p.id !== pid);
            } else {
                const url = img?.dataset.url || video?.dataset.url || audio?.dataset.url || wrap.dataset.outputUrl || wrap.dataset.missingUrl || '';
                node.images = (node.images || []).filter(item => outputUrlValue(item) !== url);
                if(node.imageComparisons) delete node.imageComparisons[url];
            }
            refreshCanvasMutation([node.id],graph);
            scheduleSave();
        };
    }
    if(recoverQuery){
        recoverQuery.onmousedown = e => e.stopPropagation();
        recoverQuery.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            const pid = wrap.dataset.pendingId;
            if(wrap.dataset.taskRecovery){
                if(wrap.dataset.taskRecovery==='succeeded')window.MemberCanvasEdit?.openTaskResults();
                else window.MemberCanvasEdit?.refreshTasks();
                return;
            }
            if(pid) queryRecoverPendingOutput(pid);
        };
    }
}

function outputDomKeyForItem(item){
    return `url:${outputUrlValue(item)}`;
}

function outputDomKeyForPending(pending){
    return `pending:${pending?.id || ''}`;
}

function refreshOutputNodeContent(node){
    const el = nodesEl.querySelector(`.output-node[data-id="${CSS.escape(node.id)}"]`);
    const body = el?.querySelector('.node-body');
    const grid = body?.querySelector('.output-grid');
    if(!body || !grid) return false;
    body.onwheel = e => { e.stopPropagation(); };
    const layout = outputGridLayout(node);
    grid.classList.toggle('grid-layout', !!layout);
    if(layout) grid.style.setProperty('--grid-cols', String(Math.max(1, Number(layout.cols || 1))));
    else grid.style.removeProperty('--grid-cols');
    const items = [
        ...(node.images || []).map(item => ({
            key:outputDomKeyForItem(item),
            html:renderOutputMedia(item, !!layout)
        })),
        ...(node._pending || []).map(p => ({
            key:outputDomKeyForPending(p),
            html:renderPendingOutput(p)
        }))
    ];
    const wanted = new Set(items.map(item => item.key));
    [...grid.children].forEach(child => {
        const key = child.dataset.pendingId ? outputDomKeyForPending({id:child.dataset.pendingId}) : `url:${child.dataset.outputUrl || child.dataset.missingUrl || child.querySelector('img,video,audio')?.dataset.url || ''}`;
        if(!wanted.has(key)) child.remove();
        else child.dataset.outputKey = key;
    });
    items.forEach((item,index) => {
        let child = [...grid.children].find(el => el.dataset.outputKey === item.key);
        if(!child){
            grid.insertAdjacentHTML('beforeend', item.html);
            child = grid.lastElementChild;
            child.dataset.outputKey = item.key;
            child.dataset.outputHtml = item.html;
        } else if(item.key.startsWith('pending:') && child.dataset.outputHtml !== item.html){
            const tpl = document.createElement('template');
            tpl.innerHTML = item.html.trim();
            const fresh = tpl.content.firstElementChild;
            if(fresh){
                fresh.dataset.outputKey = item.key;
                fresh.dataset.outputHtml = item.html;
                child.replaceWith(fresh);
                child = fresh;
            }
        }
        // Undo may replace the data object while retaining the media element.
        // Refresh handlers against that object without remounting its siblings.
        bindOutputWrap(child, node);
        if(grid.children[index]!==child)grid.insertBefore(child,grid.children[index] || null);
    });
    refreshOutputTimer();
    return true;
}

function defaultNodeSize(type){
    if(type === 'image') return {w:260, h:336};
    if(type === 'prompt') return {w:310, h:0};
    if(type === 'loop') return {w:336, h:0};
    if(type === 'llm') return {w:420, h:590};
    if(type === 'generator') return {w:380, h:0};
    if(type === 'msgen') return {w:380, h:0};
    if(type === 'video') return {w:400, h:0};
    if(type === 'comfy') return {w:420, h:460};
    if(type === 'ltxDirector') return {w:1000, h:800};
    if(type === 'output') return {w:300, h:0};
    return {w:260, h:0};
}

function renderLoopPrompt(node, ctx=null, graph=null){
    if(!node?.showPrompt) return '';
    const variable = String(node?.variablePrompt || '').trim();
    const count = loopCount(node);
    const index = Math.max(1, Number(ctx?.index || 1) || 1);
    const total = Math.max(1, Number(ctx?.total || count) || count);
    const replaceVars = text => String(text || '')
        .replaceAll('《计数》', String(index))
        .replaceAll('《总数》', String(total))
        .replaceAll('《进度》', `${index}/${total}`)
        .replaceAll(`[${tr('canvas.counterToken')}]`, String(index))
        .replaceAll(`[${tr('canvas.totalToken')}]`, String(total))
        .replaceAll(`[${tr('canvas.progressToken')}]`, `${index}/${total}`);
    const selected = loopInputPrompt(node, ctx, graph);
    if(selected) return replaceVars(selected);
    return replaceVars(variable);
}

function autoSizeLoopNode(node, opening){
    if(!node) return;
    if(opening){
        node.w = Math.max(Number(node.w || 0), 336);
        node.h = Math.max(Number(node.h || 0), 360);
    } else {
        node.w = Math.min(Number(node.w || 336), 336);
        delete node.h;
    }
}

function autoSizeLoopForPanels(node){
    if(!node) return;
    node.w = Math.max(Number(node.w || 0), 336);
    const panels = (node.showPrompt ? 1 : 0) + (node.imageInput ? 1 : 0);
    if(panels === 0) { delete node.h; return; }
    if(panels === 1) node.h = node.showPrompt ? 330 : 320;
    else if(panels === 2) node.h = (node.showPrompt && node.imageInput) ? 390 : 380;
    else node.h = 460;
}

function loopTokenChipHtml(token){
    return `<span class="loop-token-chip" contenteditable="false" data-token="${escapeAttr(token)}"><span>${escapeHtml(loopTokenLabel(token))}</span><button type="button" aria-label="${tr('common.delete')}" title="${tr('common.delete')}">×</button></span>`;
}

function loopVariableHtml(text){
    const token = '《计数》';
    return String(text || '').split(token).map((part, i) => `${i ? loopTokenChipHtml(token) : ''}${escapeHtml(part)}`).join('');
}

function loopEditorText(editor){
    const walk = node => {
        if(node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
        if(node.nodeType !== Node.ELEMENT_NODE) return '';
        if(node.classList?.contains('loop-token-chip')) return node.dataset.token || '';
        if(node.tagName === 'BR') return '\n';
        return [...node.childNodes].map(walk).join('');
    };
    return [...(editor?.childNodes || [])].map(walk).join('').replace(/\u00a0/g, ' ');
}

function insertLoopToken(editor, token){
    if(!editor) return;
    editor.focus();
    const chipWrap = document.createElement('span');
    chipWrap.innerHTML = loopTokenChipHtml(token);
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

function promptTextLength(text){
    return Array.from(String(text || '')).length;
}

function refreshPromptCounter(container, text){
    const counter = container?.querySelector('.prompt-counter');
    if(!counter) return;
    const count = promptTextLength(text);
    counter.classList.toggle('over', count > PROMPT_TEXT_MAX_LENGTH);
    counter.classList.toggle('near-limit', count >= PROMPT_TEXT_MAX_LENGTH * 0.9);
    counter.innerHTML = `<span>${count.toLocaleString()}</span><span>/ ${PROMPT_TEXT_MAX_LENGTH.toLocaleString()}</span>`;
}

function renderLoopBody(node){
    const wrap = document.createElement('div');
    wrap.className = 'loop-body';
    node.count = loopCount(node);
    node.loopStart = Math.max(1, Number(node.loopStart) || 1);
    node.imageBatchSize = Math.max(1, Math.min(100, Number(node.imageBatchSize) || 1));
    node.mode = node.mode === 'parallel' ? 'parallel' : 'serial';
    node.showPrompt = Boolean(node.showPrompt);
    node.imageInput = Boolean(node.imageInput);
    node.videoInput = false;
    const imageInputCount = loopInputImageRefs(node, {index:node.loopStart}).length;
    const promptItemCount = node.showPrompt ? loopInputPromptItems(node).length : 0;
    const hasUpstreamPrompt = promptItemCount > 0;
    const loopTargetId = findLoopCascadeTarget(node.id);
    const loopTargetOrder = loopTargetId ? computeCascadeOrder(loopTargetId) : [];
    const loopRunHtml = loopTargetId ? (isCascadeActive(loopTargetId)
        ? `<div class="gen-run-row"><button class="gen-cascade-btn gen-cascade-stop" type="button" data-loop-cascade-stop="${loopTargetId}" ${isCascadeStopping(loopTargetId) ? 'disabled' : ''}><i data-lucide="square" class="w-4 h-4"></i><span>${isCascadeStopping(loopTargetId) ? '停止中…' : '停止运行'}</span></button></div>`
        : `<div class="gen-run-row"><button class="gen-cascade-btn" type="button" data-loop-cascade="${loopTargetId}" title="从当前循环节点启动整条工作流"><i data-lucide="play-circle" class="w-4 h-4"></i><span>开始 ${loopTargetOrder.length || 1} 个节点 × ${node.count} ${tr('canvas.loopRounds')}</span></button></div>`)
        : '';
    wrap.innerHTML = `
        <div class="loop-count-row">
            <div class="loop-run-row">
                <div class="loop-count-group">
                    <span class="loop-count-label">${tr('canvas.loopCount')}</span>
                    <input class="loop-count-input" type="number" min="1" max="100" step="1" value="${node.count}">
                </div>
                <div class="seg loop-mode">
                    <button type="button" data-loop-mode="serial" class="${node.mode !== 'parallel' ? 'active' : ''}">${tr('canvas.loopSerial')}</button>
                    <button type="button" data-loop-mode="parallel" class="${node.mode === 'parallel' ? 'active' : ''}">${tr('canvas.loopParallel')}</button>
                </div>
            </div>
            <div class="loop-toggle-row">
                <button class="loop-toggle loop-image-toggle ${node.imageInput ? 'active' : ''}" type="button"><i data-lucide="image" class="w-3.5 h-3.5"></i>${tr('canvas.loopImageToggle')}</button>
                <button class="loop-toggle loop-prompt-toggle ${node.showPrompt ? 'active' : ''}" type="button"><i data-lucide="text-cursor-input" class="w-3.5 h-3.5"></i>${tr('canvas.loopPromptToggle')}</button>
            </div>
        </div>
        ${node.imageInput ? `<div class="loop-image-panel">
            <div class="loop-image-row">
                <span class="loop-count-label">${tr('canvas.loopImageStart')}</span>
                <input class="loop-count-input loop-image-start-input" type="number" min="1" max="9999" step="1" value="${node.loopStart}">
                <span class="loop-count-label">${tr('canvas.loopBatchSize')}</span>
                <input class="loop-count-input loop-batch-input" type="number" min="1" max="100" step="1" value="${node.imageBatchSize}">
            </div>
            <div class="loop-image-hint loop-image-hint-only">${imageInputCount ? trf('canvas.loopImageWillOutput', {n:imageInputCount}) : tr('canvas.loopImageEmpty')}</div>
        </div>` : ''}
        ${node.showPrompt ? `<div class="loop-prompt-panel ${hasUpstreamPrompt ? 'has-upstream' : ''}">
            <div class="loop-field">
                <div class="loop-variable-editor ${hasUpstreamPrompt ? 'is-disabled' : ''}" contenteditable="${hasUpstreamPrompt ? 'false' : 'true'}" data-placeholder="${escapeAttr(tr('canvas.loopVariablePlaceholder'))}">${loopVariableHtml(node.variablePrompt || '')}</div>
            </div>
            ${hasUpstreamPrompt ? `<div class="loop-prompt-hint">已识别 ${promptItemCount} 条提示词，按计数轮流输出</div>` : ''}
            <div class="loop-start-row">
                <button class="loop-token-btn loop-counter-token-btn" type="button" data-token="《计数》">${tr('canvas.counterToken')}</button>
                <span class="loop-count-label">${tr('canvas.loopStart')}</span>
                <input class="loop-count-input loop-start-input" type="number" min="1" max="9999" step="1" value="${node.loopStart}">
            </div>
        </div>` : ''}
        ${loopRunHtml}
    `;
    const countInput = wrap.querySelector('.loop-count-input');
    const variable = wrap.querySelector('.loop-variable-editor');
    const toggle = wrap.querySelector('.loop-prompt-toggle');
    const imageToggle = wrap.querySelector('.loop-image-toggle');
    if(variable) {
        variable.onmousedown = e => e.stopPropagation();
        variable.onclick = e => e.stopPropagation();
        variable.onwheel = e => e.stopPropagation();
    }
    const refreshPreview = () => {
        const preview = wrap.querySelector('.loop-preview:last-child');
        if(preview) preview.textContent = renderLoopPrompt(node, {index:1, total:loopCount(node)}) || tr('canvas.noPromptMeta');
    };
    const refreshImageHint = () => {
        const hint = wrap.querySelector('.loop-image-hint-only');
        if(!hint) return;
        const count = loopInputImageRefs(node, {index:node.loopStart}).length;
        hint.textContent = count ? trf('canvas.loopImageWillOutput', {n:count}) : tr('canvas.loopImageEmpty');
    };
    const syncStartInputs = source => {
        wrap.querySelectorAll('.loop-image-start-input, .loop-start-input').forEach(input => {
            if(input !== source && input.value !== String(node.loopStart)) input.value = node.loopStart;
        });
    };
    countInput.oninput = e => {
        node.count = loopCount({count:e.target.value});
        e.target.value = node.count;
        refreshPreview();
        /* 同步底部级联按钮上的轮数文字，避免输入循环次数后下游"× N 轮"残留旧值
           不直接 refreshNodes([node.id]) 是为了不破坏当前正在输入的 input 焦点 */
        const loopCascadeBtn = wrap.querySelector('[data-loop-cascade]');
        if(loopCascadeBtn){
            const span = loopCascadeBtn.querySelector('span');
            if(span) span.textContent = `开始 ${loopTargetOrder.length || 1} 个节点 × ${node.count} ${tr('canvas.loopRounds')}`;
        }
        if(loopTargetId){
            const targetEl = document.querySelector(`.node[data-id="${loopTargetId}"]`);
            const targetCascadeBtn = targetEl?.querySelector('[data-cascade]');
            if(targetCascadeBtn){
                const span = targetCascadeBtn.querySelector('span');
                if(span){
                    const targetOrder = computeCascadeOrder(loopTargetId);
                    span.textContent = `一键运行 ${targetOrder.length} 个节点 × ${node.count} ${tr('canvas.loopRounds')}`;
                }
            }
        }
        scheduleSave();
    };
    const startInput = wrap.querySelector('.loop-start-input');
    if(startInput){
        startInput.onmousedown = e => e.stopPropagation();
        startInput.onclick = e => e.stopPropagation();
        startInput.oninput = e => {
            node.loopStart = Math.max(1, Number(e.target.value) || 1);
            refreshImageHint();
            syncStartInputs(e.target);
            scheduleSave();
            syncGeneratorInputs();
            refreshGeneratorInputViews();
        };
    }
    const imageStartInput = wrap.querySelector('.loop-image-start-input');
    if(imageStartInput){
        imageStartInput.onmousedown = e => e.stopPropagation();
        imageStartInput.onclick = e => e.stopPropagation();
        imageStartInput.oninput = e => {
            node.loopStart = Math.max(1, Number(e.target.value) || 1);
            refreshImageHint();
            syncStartInputs(e.target);
            scheduleSave();
            syncGeneratorInputs();
            refreshGeneratorInputViews();
        };
    }
    const batchInput = wrap.querySelector('.loop-batch-input');
    if(batchInput){
        batchInput.onmousedown = e => e.stopPropagation();
        batchInput.onclick = e => e.stopPropagation();
        batchInput.oninput = e => {
            node.imageBatchSize = Math.max(1, Math.min(100, Number(e.target.value) || 1));
            e.target.value = node.imageBatchSize;
            refreshImageHint();
            scheduleSave();
            syncGeneratorInputs();
            refreshGeneratorInputViews();
        };
    }
    wrap.querySelectorAll('[data-loop-mode]').forEach(btn => {
        btn.onclick = e => {
            e.stopPropagation();
            const previousMode = node.mode;
            node.mode = btn.dataset.loopMode === 'parallel' ? 'parallel' : 'serial';
            refreshNodes([node.id]);
            if(previousMode !== node.mode) animateNodeModeSwitch(node.id, '.loop-mode');
            scheduleSave();
        };
    });
    toggle.onclick = e => {
        e.stopPropagation();
        const opening = !node.showPrompt;
        node.showPrompt = opening;
        autoSizeLoopNode(node, opening);
        autoSizeLoopForPanels(node);
        if(!opening){
            connections = connections.filter(c => c.to !== node.id || canConnect(c.from, node.id));
        }
        refreshNodes([node.id]);
        scheduleSave();
        syncGeneratorInputs();
        refreshGeneratorInputViews();
    };
    if(variable) {
        variable.oninput = e => {
            node.variablePrompt = loopEditorText(variable);
            refreshPreview();
            scheduleSave();
            syncGeneratorInputs();
            refreshGeneratorInputViews();
        };
        variable.addEventListener('click', e => {
            const btn = e.target.closest('.loop-token-chip button');
            if(!btn) return;
            e.preventDefault();
            e.stopPropagation();
            btn.closest('.loop-token-chip')?.remove();
            node.variablePrompt = loopEditorText(variable);
            refreshPreview();
            scheduleSave();
            syncGeneratorInputs();
            refreshGeneratorInputViews();
        });
    }
    wrap.querySelectorAll('[data-token]').forEach(btn => {
        btn.onclick = e => {
            e.stopPropagation();
            const token = btn.dataset.token || '';
            if(!variable) return;
            insertLoopToken(variable, token);
            node.variablePrompt = loopEditorText(variable);
            variable.focus();
            refreshPreview();
            scheduleSave();
            syncGeneratorInputs();
            refreshGeneratorInputViews();
        };
    });
    if(imageToggle){
        imageToggle.onclick = e => {
            e.stopPropagation();
            node.imageInput = !node.imageInput;
            if(node.imageInput){
                node.loopStart = Math.max(1, Number(node.loopStart) || 1);
                node.imageBatchSize = Math.max(1, Math.min(100, Number(node.imageBatchSize) || 1));
            } else {
                connections = connections.filter(c => c.to !== node.id || canConnect(c.from, node.id));
            }
            autoSizeLoopForPanels(node);
            refreshNodes([node.id]);
            scheduleSave();
            syncGeneratorInputs();
            refreshGeneratorInputViews();
        };
    }
    wrap.querySelectorAll('[data-loop-cascade]').forEach(btn => {
        btn.onmousedown = e => e.stopPropagation();
        btn.onclick = e => {
            e.stopPropagation();
            runNodeCascade(btn.dataset.loopCascade);
        };
    });
    wrap.querySelectorAll('[data-loop-cascade-stop]').forEach(btn => {
        btn.onmousedown = e => e.stopPropagation();
        btn.onclick = e => {
            e.stopPropagation();
            requestCascadeStop(btn.dataset.loopCascadeStop);
        };
    });
    return wrap;
}

function renderLLMBody(node){
    const wrap = document.createElement('div');
    wrap.className = 'llm-body';
    const mode = node.mode || 'node';
    node.llmProvider = resolveChatProviderId(node.llmProvider || 'comfly');
    const llmProv = node.llmProvider;
    if(!providerChatModels(llmProv).includes(node.model)) node.model = providerChatModels(llmProv)[0] || (window.CanvasSession?.enabled ? '' : node.model);
    const modelOpts = chatModelOptions(node.model, llmProv);
    const imgs = llmInputImages(node);
    const videos = llmInputVideos(node);
    const mediaBadgeText = [
        imgs.length ? `${imgs.length} 张图片` : '',
        videos.length ? `${videos.length} 个视频` : ''
    ].filter(Boolean).join(' · ');
    const imgBadge = mediaBadgeText ? `<div style="display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:8px;background:rgba(16,185,129,.12);color:#047857;font-size:10.5px;font-weight:700;width:fit-content;line-height:1.4"><i data-lucide="${videos.length && !imgs.length ? 'video' : 'image'}" class="w-3 h-3"></i>已连接 ${mediaBadgeText} · 需选支持视觉/视频的模型</div>` : '';
    node.showSystem = Boolean(node.showSystem);
    wrap.innerHTML = `
        <div class="llm-row">
            <select class="select-lite llm-provider-select" style="flex:1">${chatProviderOptions(llmProv)}</select>
            <select class="select-lite llm-model">${modelOpts}</select>
            <div class="llm-mode"><button data-mode="node">${tr('canvas.nodeMode')}</button><button data-mode="chat">${tr('canvas.chatMode')}</button></div>
            <button class="llm-sys-toggle ${node.showSystem ? 'active' : ''}" type="button">System</button>
        </div>
        ${imgBadge}
        ${node.showSystem ? `<textarea class="llm-system" placeholder="${tr('canvas.systemPrompt')}">${escapeHtml(node.systemPrompt || '')}</textarea>` : ''}
        <div class="llm-node-pane"></div>
        <div class="llm-chat-pane"></div>
    `;
    const providerSelect = wrap.querySelector('.llm-provider-select');
    const modelSelect = wrap.querySelector('.llm-model');
    providerSelect.value = llmProv;
    modelSelect.value = resolveChatModel(node.model, llmProv);
    [providerSelect, modelSelect].forEach(input => {
        input.onmousedown = e => e.stopPropagation();
        input.onclick = e => e.stopPropagation();
    });
    providerSelect.onchange = e => {
        e.stopPropagation();
        node.llmProvider = e.target.value;
        const models = providerChatModels(node.llmProvider);
        node.model = models[0] || '';
        refreshNodes([node.id]);
        scheduleSave();
    };
    modelSelect.onchange = e => {
        e.stopPropagation();
        node.model = e.target.value;
        scheduleSave();
    };
    wrap.querySelector('.llm-sys-toggle').onclick = e => { e.stopPropagation(); node.showSystem = !node.showSystem; refreshNodes([node.id]); scheduleSave(); };
    const sysEl = wrap.querySelector('.llm-system');
    if(sysEl){ sysEl.oninput = e => { node.systemPrompt = e.target.value; scheduleSave(); }; bindScrollableText(sysEl); }
    wrap.querySelectorAll('[data-mode]').forEach(btn => {
        btn.classList.toggle('active', mode === btn.dataset.mode);
        btn.onclick = e => { e.stopPropagation(); const previousMode = node.mode; node.mode = btn.dataset.mode; refreshNodes([node.id]); if(previousMode !== node.mode) animateNodeModeSwitch(node.id, '.llm-mode'); scheduleSave(); };
    });
    const nodePane = wrap.querySelector('.llm-node-pane');
    const chatPane = wrap.querySelector('.llm-chat-pane');
    if(mode === 'chat'){
        nodePane.style.display = 'none';
        renderLLMChatPane(chatPane, node);
    } else {
        chatPane.style.display = 'none';
        renderLLMNodePane(nodePane, node);
    }
    return wrap;
}

function animateNodeModeSwitch(id, selector){
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const segment = nodesEl.querySelector('[data-id="' + CSS.escape(id) + '"] ' + selector);
    if(!segment) return;
    segment.classList.add('studio-switch-motion');
    segment.addEventListener('animationend', () => segment.classList.remove('studio-switch-motion'), {once:true});
}

function renderLLMNodePane(container, node){
    const connectedInput = llmInputText(node);
    const isReadonly = connectedInput.length > 0;
    const inputValue = connectedInput || node.userInput || '';
    const inputHeight = Math.max(70, node.llmInputHeight || 110);
    const outputHeight = Math.max(70, node.llmOutputHeight || 150);
    const inputPlaceholder = langIsEn() ? 'Type input, or connect a Prompt node…' : '直接输入，或连接提示词节点…';
    container.innerHTML = `
        <div class="llm-pane-label">Input${isReadonly ? ' <span style="font-size:9px;opacity:.5;font-weight:600;text-transform:none;letter-spacing:0">(来自连接)</span>' : ''}</div>
        <textarea class="llm-input-area llm-input-output" style="height:${inputHeight}px; flex:0 0 ${inputHeight}px;" ${isReadonly ? 'readonly' : ''} placeholder="${inputPlaceholder}">${escapeHtml(inputValue)}</textarea>
        <div class="llm-pane-resizer" title="${tr('canvas.resizePanes')}"></div>
        <div class="llm-pane-label">Output</div>
        <div class="llm-output-wrap" style="height:${outputHeight}px; flex:0 0 ${outputHeight}px;">
            <button class="llm-copy-btn llm-output-copy" type="button" title="复制"><i data-lucide="copy" class="w-3.5 h-3.5"></i></button>
            <div class="llm-output llm-result-output">${escapeHtml(node.outputText || tr('canvas.llmOutputEmpty'))}</div>
        </div>
        <div class="gen-run-row mt-2">
            <button class="llm-run ${node.running ? 'running' : ''}" ${node.running ? 'disabled' : ''}><i data-lucide="play" class="w-4 h-4"></i>${node.running ? tr('canvas.running') : 'Run LLM'}</button>
            ${cascadeBtnHtml(node)}
        </div>
        ${retryBarHtml(node)}
    `;
    const inputEl = container.querySelector('.llm-input-output');
    bindScrollableText(inputEl);
    if(!isReadonly){
        inputEl.oninput = e => { node.userInput = e.target.value; };
    }
    bindScrollableText(container.querySelector('.llm-result-output'));
    container.querySelector('.llm-pane-resizer').onmousedown = e => startLLMPaneResize(e, node);
    container.querySelector('.llm-run').onclick = e => { e.stopPropagation(); runLLMNode(node.id); };
    bindCascadeButtons(container, node.id);
    const copyBtn = container.querySelector('.llm-output-copy');
    if(copyBtn){
        copyBtn.onmousedown = e => e.stopPropagation();
        copyBtn.onclick = async e => {
            e.stopPropagation();
            const text = node.outputText || '';
            if(!text) return;
            if(await copyTextToClipboard(text)){
                copyBtn.classList.add('copied');
                setTimeout(() => copyBtn.classList.remove('copied'), 1500);
            }
        };
    }
}

function renderLLMChatPane(container, node){
    const messages = node.messages || [];
    container.innerHTML = `
        <div class="llm-chat-log">${messages.length ? messages.map((msg, mi) => `<div class="llm-bubble ${msg.role === 'user' ? 'user' : 'assistant'}" data-msg-idx="${mi}">${escapeHtml(msg.content || '')}${msg.role === 'assistant' ? `<button class="llm-bubble-copy" type="button" title="复制"><i data-lucide="copy" style="width:11px;height:11px;display:inline-block;vertical-align:middle"></i></button>` : ''}</div>`).join('') : `<div class="text-[11px] text-gray-300">${tr('canvas.startChat')}</div>`}</div>
        <textarea class="llm-chat-input mt-2" rows="2" placeholder="${tr('canvas.chatInput')}">${escapeHtml(node.chatInput || '')}</textarea>
        <button class="llm-run mt-2" ${node.running ? 'disabled' : ''}><i data-lucide="send" class="w-4 h-4"></i>${node.running ? tr('canvas.sending') : 'Send'}</button>
    `;
    bindScrollableText(container.querySelector('.llm-chat-log'));
    bindScrollableText(container.querySelector('.llm-chat-input'));
    const chatInputEl = container.querySelector('.llm-chat-input');
    chatInputEl.oninput = e => { node.chatInput = e.target.value; scheduleSave(); };
    chatInputEl.onkeydown = e => {
        if(e.key === 'Enter' && !e.shiftKey && !e.isComposing){
            e.preventDefault();
            e.stopPropagation();
            runLLMChat(node.id);
        }
    };
    container.querySelector('.llm-run').onclick = e => { e.stopPropagation(); runLLMChat(node.id); };
    container.querySelectorAll('.llm-bubble-copy').forEach(btn => {
        btn.onmousedown = e => e.stopPropagation();
        btn.onclick = async e => {
            e.stopPropagation();
            const bubble = btn.closest('.llm-bubble');
            const idx = Number(bubble?.dataset.msgIdx);
            const msg = (node.messages || [])[idx];
            if(!msg) return;
            if(await copyTextToClipboard(msg.content || '')){
                btn.classList.add('copied');
                setTimeout(() => btn.classList.remove('copied'), 1500);
            }
        };
    });
}

function bindScrollableText(el){
    if(!el) return;
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

function startLLMPaneResize(e, node){
    e.preventDefault();
    e.stopPropagation();
    llmPaneDrag = {
        node,
        sy:e.clientY,
        inputStart:Math.max(70, node.llmInputHeight || 110),
        outputStart:Math.max(70, node.llmOutputHeight || 150)
    };
    startWindowPointerSession(onLLMPaneResize, endDrag);
}

function onLLMPaneResize(e){
    if(!llmPaneDrag) return;
    const total = llmPaneDrag.inputStart + llmPaneDrag.outputStart;
    const delta = (e.clientY - llmPaneDrag.sy) / viewport.scale;
    const minPane = 70;
    const nextInput = Math.max(minPane, Math.min(total - minPane, llmPaneDrag.inputStart + delta));
    const nextOutput = Math.max(minPane, total - nextInput);
    llmPaneDrag.node.llmInputHeight = Math.round(nextInput);
    llmPaneDrag.node.llmOutputHeight = Math.round(nextOutput);
    const el = nodesEl.querySelector(`.node[data-id="${llmPaneDrag.node.id}"]`);
    if(el){
        const inputEl = el.querySelector('.llm-input-output');
        const outputEl = el.querySelector('.llm-result-output');
        if(inputEl){
            inputEl.style.height = `${llmPaneDrag.node.llmInputHeight}px`;
            inputEl.style.flexBasis = `${llmPaneDrag.node.llmInputHeight}px`;
        }
        if(outputEl){
            outputEl.style.height = `${llmPaneDrag.node.llmOutputHeight}px`;
            outputEl.style.flexBasis = `${llmPaneDrag.node.llmOutputHeight}px`;
        }
    }
}

function labelGenerationControls(wrap){
    const fields=[['.provider-select,.video-provider','供应商'],['.model-select,.video-model','模型'],
        ['.video-task-mode','生成方式'],['.resolution','清晰度'],['.ratio','画面比例'],
        ['.quality-select','生成质量'],['.gen-count-row','生成数量']];
    fields.forEach(([selector,title]) => {
        const control=wrap.querySelector(selector);
        if(!control) return;
        const label=document.createElement('label'); label.className='generation-field';
        const caption=document.createElement('span'); caption.className='setting-title'; caption.textContent=title;
        control.replaceWith(label); label.append(caption,control);
        const input=control.matches('select,input') ? control : control.querySelector('input');
        input?.setAttribute('aria-label',title);
        if(input?.tagName==='SELECT'){
            const updateTitle=() => { input.title=input.selectedOptions[0]?.textContent || title; };
            updateTitle(); input.addEventListener('change',updateTitle);
        }
    });
}

function generationSettingsSummary(wrap){
    const label = selector => {
        const control = wrap.querySelector(selector);
        if(!control) return '';
        return control.tagName === 'SELECT' ? (control.selectedOptions[0]?.textContent || '').trim()
            : String(control.value ?? '').trim();
    };
    const model = label('.video-model,.model-select');
    const provider = label('.video-provider,.provider-select');
    const values = [];
    const duration = label('.video-duration');
    if(duration) values.push(duration === '-1' ? '自动时长' : duration + ' 秒');
    let aspect = label('.video-aspect,.ratio');
    if(wrap.querySelector('.ratio')?.value === 'custom'){
        const width = label('.custom-ratio-w-input'), height = label('.custom-ratio-h-input');
        if(width && height) aspect = width + ':' + height;
    }
    if(aspect) values.push(aspect);
    let resolution = label('.video-resolution,.resolution');
    if(wrap.querySelector('.resolution')?.value === 'custom'){
        const width = label('.custom-w-input'), height = label('.custom-h-input');
        if(width && height) resolution = width + ' × ' + height;
    }
    if(resolution) values.push(resolution);
    const quality = label('.quality-select');
    if(quality) values.push('质量 ' + quality);
    const count = label('.gen-count-input');
    if(count) values.push(count + ' 张');
    const mode = label('.video-task-mode');
    if(mode) values.push(mode);
    // Reflect the controls as they are; a summary never assigns generation defaults.
    return {title:[model, provider].filter(Boolean).join(' · ') || '选择模型与供应商',
        detail:values.join(' · ')};
}

function attachGenerationSettingsDisclosure(wrap, node){
    const settings = wrap.querySelector('.gen-settings');
    if(!settings) return;
    const details = document.createElement('details');
    details.className = 'generation-settings-disclosure';
    details.open = generationSettingsOpen.get(node) === true;
    const summary = document.createElement('summary');
    summary.innerHTML = '<span class="generation-settings-copy"><span class="generation-settings-caption">生成设置</span><span class="generation-settings-model"></span><span class="generation-settings-meta"></span></span><span class="generation-settings-chevron" aria-hidden="true"></span>';
    settings.replaceWith(details);
    details.append(summary, settings);
    const refresh = () => {
        const current = generationSettingsSummary(settings);
        summary.querySelector('.generation-settings-model').textContent = current.title;
        summary.querySelector('.generation-settings-meta').textContent = current.detail;
        summary.title = [current.title, current.detail, '点击展开或收起设置'].filter(Boolean).join(' · ');
    };
    settings.querySelectorAll('input,select,button').forEach(control => {
        control.addEventListener('input', refresh);
        control.addEventListener('change', refresh);
        control.addEventListener('click', refresh);
        control.addEventListener('blur', refresh);
    });
    summary.onmousedown = event => event.stopPropagation();
    summary.onclick = event => event.stopPropagation();
    details.ontoggle = () => {
        generationSettingsOpen.set(node, details.open);
        scheduleGeometryRefresh();
        scheduleMinimapRender();
    };
    refresh();
}

function renderGeneratorBody(node){
    const wrap = document.createElement('div');
    wrap.className = 'generator-body generation-node-body';
    const inputSources = generatorSources(node);
    const ordered = orderedSources(node, inputSources);
    const imageInputs = ordered.filter(src => src.refs?.length);
    const promptInputs = ordered.filter(src => src.prompt && !src.refs?.length);
    sanitizeImageNodeProviderModel(node);
    wrap.innerHTML = `
        <div class="generation-section-title">提示词</div>
        <div class="prompt-list mb-3"></div>
        <div class="generation-section-title">输入素材</div>
        <div class="input-list"></div>
        <div class="gen-settings">
            <div class="gen-settings-row">
                <select class="select-lite provider-select">${providerOptions(node.apiProvider)}</select>
                <select class="select-lite model-select">${imageModelOptions(node.model, node.apiProvider)}</select>
            </div>
            <div class="gen-settings-row api-size-row">
                <select class="select-lite resolution compact-select" data-field="resolution">
                    ${allowedImageResolutions(node).map(s=>`<option value="${s}">${s==='custom'?tr('canvas.custom'):s.toUpperCase()}</option>`).join('')}
                </select>
                <select class="select-lite ratio compact-select" data-field="ratio">
                    <option value="square">1:1</option>
                    <option value="portrait">2:3</option>
                    <option value="landscape">3:2</option>
                    <option value="portrait43">3:4</option>
                    <option value="landscape43">4:3</option>
                    <option value="story">9:16</option>
                    <option value="wide">16:9</option>
                    <option value="ultrawide">21:9</option>
                    <option value="ultratall">9:21</option>
                    <option value="source">${tr('canvas.adaptiveRatio')}</option>
                    <option value="custom">${tr('canvas.custom')}</option>
                </select>
                <select class="select-lite quality-select">
                    <option value="auto">自动</option>
                    <option value="low">低</option>
                    <option value="medium">中</option>
                    <option value="high">高</option>
                </select>
                <div class="gen-count-row">
                    <div class="gen-stepper">
                        <button class="gen-step-btn" data-step="-1" type="button" title="${tr('canvas.decrease')}" aria-label="${tr('canvas.decreaseCount')}"><i data-lucide="chevron-left" class="w-3.5 h-3.5"></i></button>
                        <input class="gen-count-input" type="text" inputmode="numeric" pattern="[0-9]*" value="${Math.max(1, Math.min(8, Number(node.count || 1)))}">
                        <button class="gen-step-btn" data-step="1" type="button" title="${tr('canvas.increase')}" aria-label="${tr('canvas.increaseCount')}"><i data-lucide="chevron-right" class="w-3.5 h-3.5"></i></button>
                    </div>
                </div>
            </div>
            <div class="gen-settings-row custom-ratio-row" style="display:none">
                <label class="field">
                    <div class="setting-title">${tr('canvas.ratioWidth')}</div>
                    <input class="setting-input custom-ratio-w-input" type="number" min="1" step="1" value="${escapeHtml(node.customRatioWidth || '')}" placeholder="4">
                </label>
                <label class="field">
                    <div class="setting-title">${tr('canvas.ratioHeight')}</div>
                    <input class="setting-input custom-ratio-h-input" type="number" min="1" step="1" value="${escapeHtml(node.customRatioHeight || '')}" placeholder="3">
                </label>
            </div>
            <div class="gen-settings-row custom-size-row" style="display:none">
                <label class="field">
                    <div class="setting-title">${tr('canvas.width')}</div>
                    <input class="setting-input custom-w-input" type="number" min="64" step="64" value="${escapeHtml(node.customWidth || '')}" placeholder="Auto">
                </label>
                <label class="field">
                    <div class="setting-title">${tr('canvas.height')}</div>
                    <input class="setting-input custom-h-input" type="number" min="64" step="64" value="${escapeHtml(node.customHeight || '')}" placeholder="Auto">
                </label>
                <button class="secondary-btn fit-size-btn" type="button" style="height:32px;align-self:flex-end;padding:0 10px;font-size:11px">${tr('canvas.fitImageSize')}</button>
            </div>
        </div>
        <div class="gen-run-row">
            <button class="gen-btn ${node.running ? 'running' : ''}" ${node.running ? 'disabled' : ''}><i data-lucide="zap" class="w-4 h-4"></i>${node.running ? tr('canvas.generating') : tr('canvas.apiGenerate')}</button>
            ${cascadeBtnHtml(node)}
        </div>
        ${retryBarHtml(node)}
    `;
    const providerSelect = wrap.querySelector('.provider-select');
    const modelSelect = wrap.querySelector('.model-select');
    providerSelect.onmousedown = e => e.stopPropagation();
    providerSelect.onclick = e => e.stopPropagation();
    providerSelect.onchange = e => {
        e.stopPropagation();
        node.apiProvider = e.target.value;
        const providerModels = providerImageModels(node.apiProvider);
        if(!providerModels.includes(resolveImageModel(node.model))) node.model = providerModels[0] || '';
        modelSelect.innerHTML = imageModelOptions(node.model, node.apiProvider);
        syncSizeControls();
        scheduleSave();
    };
    modelSelect.onmousedown = e => e.stopPropagation();
    modelSelect.onclick = e => e.stopPropagation();
    modelSelect.onchange = e => {
        e.stopPropagation();
        node.model = e.target.value;
        syncSizeControls();
        scheduleSave();
    };
    const ratioSelect = wrap.querySelector('.ratio');
    const resolutionSelect = wrap.querySelector('.resolution');
    const qualitySelect = wrap.querySelector('.quality-select');
    const customRatioRow = wrap.querySelector('.custom-ratio-row');
    const customSizeRow = wrap.querySelector('.custom-size-row');
    const customRatioWInput = wrap.querySelector('.custom-ratio-w-input');
    const customRatioHInput = wrap.querySelector('.custom-ratio-h-input');
    const customWInput = wrap.querySelector('.custom-w-input');
    const customHInput = wrap.querySelector('.custom-h-input');
    const fitSizeBtn = wrap.querySelector('.fit-size-btn');
    const referenceImages = ordered.flatMap(src => src.refs || []);
    const syncQualityControls = () => {
        qualitySelect.disabled = false;
        if(!['auto','low','medium','high'].includes(String(node.quality || 'auto'))) node.quality = 'auto';
        qualitySelect.value = node.quality || 'auto';
    };
    const hydrateCustomParts = () => {
        if((!node.customRatioWidth || !node.customRatioHeight) && node.customRatio) {
            const raw = String(node.customRatio || '');
            if(raw.includes(':')){
                const [w,h] = raw.split(':');
                node.customRatioWidth = node.customRatioWidth || w;
                node.customRatioHeight = node.customRatioHeight || h;
            }
        }
        if((!node.customWidth || !node.customHeight) && node.customSize) {
            const parsed = parseSizeValue(node.customSize);
            node.customWidth = node.customWidth || parsed?.width || '';
            node.customHeight = node.customHeight || parsed?.height || '';
        }
    };
    hydrateCustomParts();
    let sourceRatioRequest = 0;
    const updateSourceRatioFromFirstRef = async () => {
        if(node.ratio !== 'source') return;
        const ref = referenceImages.find(item => item.url);
        const requestId = ++sourceRatioRequest;
        if(!ref){
            node.customRatio = '';
            node.customRatioWidth = '';
            node.customRatioHeight = '';
            customRatioWInput.value = '';
            customRatioHInput.value = '';
            return;
        }
        try {
            const dims = await getImageDimensions(ref.url);
            if(requestId !== sourceRatioRequest || node.ratio !== 'source') return;
            const parts = ratioPartsFromDimensions(dims.width, dims.height);
            node.customRatioWidth = String(parts.width);
            node.customRatioHeight = String(parts.height);
            node.customRatio = `${parts.width}:${parts.height}`;
            customRatioWInput.value = node.customRatioWidth;
            customRatioHInput.value = node.customRatioHeight;
            scheduleSave();
        } catch(_) {}
    };
    const syncSizeControls = () => {
        const sizes = allowedImageResolutions(node);
        if(!sizes.includes(node.resolution)) node.resolution = sizes[0] || '';
        resolutionSelect.innerHTML = sizes.map(value => `<option value="${value}">${value === 'custom' ? tr('canvas.custom') : value.toUpperCase()}</option>`).join('');
        resolutionSelect.disabled = !sizes.length;
        if(node.resolution !== 'custom' && !node.ratio) node.ratio = 'square';
        normalizeApiNodeSizeChoice(node);
        const squareOption = ratioSelect.querySelector('option[value="square"]');
        if(squareOption){
            squareOption.disabled = false;
            squareOption.title = '';
        }
        const ratioValue = node.ratio && [...ratioSelect.options].some(opt => opt.value === node.ratio) ? node.ratio : 'square';
        ratioSelect.value = ratioValue;
        resolutionSelect.value = node.resolution || '1k';
        ratioSelect.disabled = node.resolution === 'custom';
        customRatioRow.style.display = (node.ratio === 'custom' || node.ratio === 'source') ? 'flex' : 'none';
        customSizeRow.style.display = node.resolution === 'custom' ? 'flex' : 'none';
        customRatioWInput.disabled = node.ratio === 'source';
        customRatioHInput.disabled = node.ratio === 'source';
        customRatioWInput.value = node.customRatioWidth || '';
        customRatioHInput.value = node.customRatioHeight || '';
        customWInput.value = node.customWidth || '';
        customHInput.value = node.customHeight || '';
        if(fitSizeBtn) fitSizeBtn.disabled = !referenceImages.some(ref => ref.url);
        syncQualityControls();
        if(node.ratio === 'source') updateSourceRatioFromFirstRef();
    };
    qualitySelect.onmousedown = e => e.stopPropagation();
    qualitySelect.onclick = e => e.stopPropagation();
    qualitySelect.onchange = e => {
        e.stopPropagation();
        node.quality = e.target.value;
        scheduleSave();
    };
    ratioSelect.onmousedown = e => e.stopPropagation();
    ratioSelect.onclick = e => e.stopPropagation();
    ratioSelect.onchange = e => {
        e.stopPropagation();
        node.ratio = e.target.value;
        normalizeApiNodeSizeChoice(node);
        if(node.ratio !== 'custom' && node.ratio !== 'source') {
            node.customRatio = '';
            node.customRatioWidth = '';
            node.customRatioHeight = '';
        } else if(node.ratio === 'source') {
            node.customRatio = '';
            node.customRatioWidth = '';
            node.customRatioHeight = '';
        }
        syncSizeControls();
        scheduleSave();
    };
    resolutionSelect.onmousedown = e => e.stopPropagation();
    resolutionSelect.onclick = e => e.stopPropagation();
    resolutionSelect.onchange = e => {
        e.stopPropagation();
        node.resolution = e.target.value;
        if(node.resolution === 'custom') {
            node.ratio = '';
        } else if(!node.ratio) {
            node.ratio = 'square';
            node.customSize = '';
            node.customWidth = '';
            node.customHeight = '';
        } else {
            node.customSize = '';
            node.customWidth = '';
            node.customHeight = '';
        }
        normalizeApiNodeSizeChoice(node);
        syncSizeControls();
        scheduleSave();
    };
    [customRatioWInput, customRatioHInput].forEach(input => {
        input.onmousedown = e => e.stopPropagation();
        input.onclick = e => e.stopPropagation();
        input.oninput = e => {
            node.customRatioWidth = customRatioWInput.value;
            node.customRatioHeight = customRatioHInput.value;
            node.customRatio = node.customRatioWidth && node.customRatioHeight ? `${node.customRatioWidth}:${node.customRatioHeight}` : '';
            node.ratio = 'custom';
            syncSizeControls();
            scheduleSave();
        };
    });
    [customWInput, customHInput].forEach(input => {
        input.onmousedown = e => e.stopPropagation();
        input.onclick = e => e.stopPropagation();
        input.oninput = e => {
            node.customWidth = customWInput.value;
            node.customHeight = customHInput.value;
            node.customSize = node.customWidth && node.customHeight ? `${node.customWidth}x${node.customHeight}` : '';
            node.resolution = 'custom';
            node.ratio = '';
            syncSizeControls();
            scheduleSave();
        };
    });
    if(fitSizeBtn){
        fitSizeBtn.onmousedown = e => e.stopPropagation();
        fitSizeBtn.onclick = async e => {
            e.stopPropagation();
            const ref = referenceImages.find(item => item.url);
            if(!ref) return;
            try {
                const dims = await getImageDimensions(ref.url);
                node.customWidth = dims.width;
                node.customHeight = dims.height;
                node.customSize = `${dims.width}x${dims.height}`;
                node.resolution = 'custom';
                node.ratio = '';
                syncSizeControls();
                scheduleSave();
            } catch(err) {
                    showErrorModal(tr('canvas.imageReadFailed'));
            }
        };
    }
    syncSizeControls();
    const countInput = wrap.querySelector('.gen-count-input');
    countInput.onmousedown = e => e.stopPropagation();
    countInput.onclick = e => e.stopPropagation();
    countInput.oninput = e => {
        const value = Math.max(1, Math.min(8, Number(e.target.value) || 1));
        node.count = value;
        scheduleSave();
    };
    countInput.onblur = e => { e.target.value = String(Math.max(1, Math.min(8, Number(node.count || 1)))); };
    wrap.querySelectorAll('[data-step]').forEach(btn => {
        btn.onclick = e => {
            e.stopPropagation();
            const next = Math.max(1, Math.min(8, Number(node.count || 1) + Number(btn.dataset.step || 0)));
            node.count = next;
            countInput.value = String(next);
            scheduleSave();
        };
    });
    const list = wrap.querySelector('.input-list');
    renderImageInputList(list, node, imageInputs);
    renderPromptPreview(wrap.querySelector('.prompt-list'), promptInputs);
    wrap.querySelector('.gen-btn').onclick = e => { e.stopPropagation(); runCanvasGenerate(node.id); };
    bindCascadeButtons(wrap, node.id);
    labelGenerationControls(wrap);
    attachGenerationSettingsDisclosure(wrap, node);
    return wrap;
}

function renderVideoBody(node){
    const wrap = document.createElement('div');
    wrap.className = 'generator-body generation-node-body';
    const inputSources = generatorSources(node);
    const ordered = orderedSources(node, inputSources);
    const imageInputs = ordered.filter(src => src.refs?.length);
    const promptInputs = ordered.filter(src => src.prompt && !src.refs?.length);
    sanitizeVideoNodeProviderModel(node);
    normalizeVideoNodeSelection(node);
    const isVolcengineVideoNode = resolveVideoProviderId(node.apiProvider || 'comfly') === 'volcengine';
    const isSeedance25 = isVolcengineSeedance25VideoNode(node);
    const durationRange = videoNodeDurationRange(node);
    if(isVolcengineVideoNode) node.useFrameRoles = false;
    if(!node.model && !window.CanvasSession?.enabled) node.model = 'veo3-fast';
    wrap.innerHTML = `
        <div class="generation-section-title">提示词</div>
        <div class="prompt-list mb-3"></div>
        <div class="generation-section-title">输入素材</div>
        <div class="input-list video-img-list"></div>
        <div class="gen-settings">
            <div class="gen-settings-row">
                <select class="select-lite video-provider" style="flex:1">${videoProviderOptions(node.apiProvider)}</select>
                <select class="select-lite video-model" style="flex:2">${videoModelOptions(node.model, node.apiProvider)}</select>
                ${isSeedance25 ? `<select class="select-lite video-task-mode" style="flex:1">
                    <option value="auto">自动判断</option><option value="edit">视频编辑</option>
                    <option value="extend_backward">向后延长</option><option value="extend_forward">向前延长</option>
                </select>` : ''}
            </div>
            <div class="gen-settings-row">
                <label class="field" style="flex:1">
                    <div class="setting-title">${tr('canvas.videoDuration')} · ${durationRange.min}–${durationRange.max} 秒</div>
                    <input class="setting-input video-duration" type="number" min="${durationRange.auto ? -1 : durationRange.min}" max="${durationRange.max}" title="${durationRange.min}–${durationRange.max} 秒" step="1" value="${Number(node.duration ?? 5)}">
                </label>
                <label class="field" style="flex:1">
                    <div class="setting-title">${tr('canvas.videoAspect')}</div>
                    <select class="select-lite video-aspect compact-select">
                        <option value="16:9">16:9</option>
                        <option value="9:16">9:16</option>
                        <option value="1:1">1:1</option>
                        <option value="4:3">4:3</option>
                        <option value="3:4">3:4</option>
                        <option value="21:9">21:9</option>
                        ${isSeedance25 ? '' : '<option value="9:21">9:21</option><option value="keep_ratio">keep</option>'}
                        <option value="adaptive">adapt</option>
                    </select>
                </label>
                <label class="field" style="flex:1">
                    <div class="setting-title">${tr('canvas.videoResolution')}</div>
                    <select class="select-lite video-resolution compact-select">
                        ${allowedVideoResolutions(node).map(value => `<option value="${value}">${value ? value.toUpperCase() : 'Auto'}</option>`).join('')}
                    </select>
                </label>
            </div>
        </div>
        <div class="gen-run-row">
            <button class="gen-btn ${node.running ? 'running' : ''}" ${node.running ? 'disabled' : ''}><i data-lucide="clapperboard" class="w-4 h-4"></i>${node.running ? tr('canvas.generating') : tr('canvas.videoGenerate')}</button>
            ${cascadeBtnHtml(node)}
        </div>
        ${retryBarHtml(node)}
    `;
    const providerSelect = wrap.querySelector('.video-provider');
    const modelSelect = wrap.querySelector('.video-model');
    const durationSelect = wrap.querySelector('.video-duration');
    const aspectSelect = wrap.querySelector('.video-aspect');
    const resolutionSelect = wrap.querySelector('.video-resolution');
    const taskModeSelect = wrap.querySelector('.video-task-mode');
    providerSelect.value = node.apiProvider;
    durationSelect.value = String(node.duration || 5);
    aspectSelect.value = node.aspectRatio || '16:9';
    resolutionSelect.value = node.resolution || '';
    resolutionSelect.disabled = !allowedVideoResolutions(node).length;
    if(taskModeSelect) taskModeSelect.value = node.taskMode || 'auto';
    [providerSelect, modelSelect, durationSelect, aspectSelect, resolutionSelect, taskModeSelect].filter(Boolean).forEach(input => {
        input.onmousedown = e => e.stopPropagation();
        input.onclick = e => e.stopPropagation();
    });
    providerSelect.onchange = e => {
        e.stopPropagation();
        node.apiProvider = e.target.value;
        const models = providerVideoModels(node.apiProvider);
        if(!models.includes(node.model)) node.model = models[0] || '';
        normalizeVideoNodeSelection(node);
        refreshNodes([node.id]);
        scheduleSave();
    };
    modelSelect.onchange = e => {
        e.stopPropagation();
        node.model = e.target.value;
        normalizeVideoNodeSelection(node);
        refreshNodes([node.id]);
        scheduleSave();
    };
    durationSelect.onchange = e => { e.stopPropagation(); node.duration=window.VideoDurationPolicy.clamp(e.target.value,videoNodeDurationRange(node)); e.target.value=String(node.duration); scheduleSave(); };
    durationSelect.onblur = e => { e.target.value = String(node.duration || 5); };
    aspectSelect.onchange = e => { e.stopPropagation(); node.aspectRatio = e.target.value; scheduleSave(); };
    resolutionSelect.onchange = e => { e.stopPropagation(); node.resolution = e.target.value; scheduleSave(); };
    if(taskModeSelect) taskModeSelect.onchange = e => {
        e.stopPropagation();
        node.taskMode = e.target.value;
        if(node.taskMode !== 'auto') node.aspectRatio = 'adaptive';
        if(node.taskMode === 'edit') node.duration = -1;
        refreshNodes([node.id]);
        scheduleSave();
    };
    wrap.querySelectorAll('[data-video-toggle]').forEach(btn => {
        btn.onmousedown = e => e.stopPropagation();
        btn.onclick = e => {
            e.stopPropagation();
            const field = btn.dataset.videoToggle;
            node[field] = !node[field];
            if(field === 'multimodal' && node.multimodal) node.useFrameRoles = false;
            if(field === 'useFrameRoles' && node.useFrameRoles) node.multimodal = false;
            refreshNodes([node.id]);
            scheduleSave();
        };
    });
    const list = wrap.querySelector('.video-img-list');
    renderVideoImageInputs(list, node, imageInputs);
    renderPromptPreview(wrap.querySelector('.prompt-list'), promptInputs);
    wrap.querySelector('.gen-btn').onclick = e => { e.stopPropagation(); runCanvasGenerate(node.id); };
    bindCascadeButtons(wrap, node.id);
    labelGenerationControls(wrap);
    attachGenerationSettingsDisclosure(wrap, node);
    return wrap;
}

function isCanvasInputViewCurrent(container, node, signature){
    const cached = canvasInputViewCache.get(container);
    return cached?.node === node && cached?.signature === signature;
}

function rememberCanvasInputView(container, node, signature){
    // Cache only after rendering succeeds; detached lists can be garbage-collected.
    canvasInputViewCache.set(container, {node, signature});
}

function renderPromptPreview(container, promptInputs){
    if(!container) return;
    const html = promptInputs.length ? `<div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Prompts</div>${promptInputs.map(src => `<div class="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 line-clamp-2">${escapeHtml(src.label)}</div>`).join('')}` : '';
    if(isCanvasInputViewCurrent(container, null, html)) return;
    container.innerHTML = html;
    rememberCanvasInputView(container, null, html);
}

function bindCanvasInputReorder(item, list, node, sourceId, kind='image'){
    // Keep sorting inside the canvas; native OS drag sessions can retain the source
    // while a refreshed input list removes it from the document.
    item.draggable = false;
    item.ondragstart = event => { event.preventDefault(); event.stopPropagation(); };
    item.onmousedown = event => {
        event.stopPropagation();
        if(event.button !== 0 || !sourceId || event.target.closest('button,input,select,textarea') || isCanvasLockedByOther()) return;
        event.preventDefault();
        const startX = event.clientX, startY = event.clientY;
        let moving = false, target = null;
        const findTarget = event => {
            const candidate = document.elementFromPoint(event.clientX, event.clientY)?.closest('.input-item');
            return candidate && candidate !== item && list.contains(candidate)
                && (candidate.dataset.mediaKind || 'image') === kind
                && candidate.dataset.sourceId && candidate.dataset.sourceId !== sourceId ? candidate : null;
        };
        const move = event => {
            if(!moving && Math.hypot(event.clientX-startX, event.clientY-startY) < 5) return;
            moving = true; internalDrag = true;
            item.classList.add('input-reordering');
            const next = findTarget(event);
            if(next !== target){
                target?.classList.remove('input-reorder-target');
                target = next; target?.classList.add('input-reorder-target');
            }
        };
        const cleanup = () => {
            internalDrag = false;
            item.classList.remove('input-reordering');
            target?.classList.remove('input-reorder-target');
            window.removeEventListener('mousemove', move, true);
            window.removeEventListener('mouseup', finish, true);
            window.removeEventListener('blur', cleanup);
            window.removeEventListener('keydown', cancel, true);
        };
        const finish = event => {
            const destination = moving ? findTarget(event) : null;
            cleanup();
            if(destination && !isCanvasLockedByOther()){
                reorderInput(node, sourceId, destination.dataset.sourceId);
                setStatus('素材顺序已更新，请检查提示词中的同类编号');
            }
        };
        const cancel = event => { if(event.key === 'Escape') cleanup(); };
        window.addEventListener('mousemove', move, true);
        window.addEventListener('mouseup', finish, true);
        window.addEventListener('blur', cleanup);
        window.addEventListener('keydown', cancel, true);
    };
}

function renderImageInputList(list, node, imageInputs, emptyText=null){
    if(!list) return;
    const signature = JSON.stringify(['images', emptyText || tr('canvas.inputImagesEmpty'), imageInputs.map(src => [
        src.id, src.label, src.preview, mediaKindForRef(src.refs?.[0] || src.preview), isMissingAssetUrl(src.preview)
    ])]);
    if(isCanvasInputViewCurrent(list, node, signature)) return;
    list.innerHTML = imageInputs.length ? '' : `<div class="text-[11px] text-gray-300 py-2">${escapeHtml(emptyText || tr('canvas.inputImagesEmpty'))}</div>`;
    imageInputs.forEach((src, i) => {
        const item = document.createElement('div');
        item.className = 'input-item';
        item.draggable = false;
        item.dataset.sourceId = src.id;
        const mediaKind = mediaKindForRef(src.refs?.[0] || src.preview);
        const previewHtml = src.preview && !isMissingAssetUrl(src.preview)
            ? (mediaKind === 'video' ? canvasVideoPreviewHtml(src.preview, 256) : canvasPreviewImgHtml(src.preview, 256))
            : (src.preview ? missingAssetHtml(src.preview, true) : '<i data-lucide="image" class="w-6 h-6 text-slate-400"></i>');
        item.innerHTML = `<span class="input-index">${i + 1}</span>${previewHtml}<span class="input-label">${escapeHtml(src.label)}</span>`;
        bindCanvasInputReorder(item, list, node, src.id);
        list.appendChild(item);
    });
    refreshIcons();
    rememberCanvasInputView(list, node, signature);
}

function renderVideoImageInputs(list, node, imageInputs){
    if(!list) return;
    const groups = videoInputMediaGroups(node, imageInputs);
    const signature = JSON.stringify(['video', Boolean(node.useFrameRoles), manualVideoUrlForNode(node),
        tr('canvas.videoRoleFirstFrame'), tr('canvas.videoRoleLastFrame'),
        groups.map(group => [group.kind, group.items.map(entry => [
            entry.sourceId, entry.label, entry.referenceLabel, entry.ref.url, isMissingAssetUrl(entry.ref.url)
        ])])]);
    if(isCanvasInputViewCurrent(list, node, signature)) return;
    list.classList.add('media-input-groups');
    list.onwheel = e => e.stopPropagation();
    list.innerHTML = '';
    if(!groups.length){
        list.innerHTML = '<div class="media-input-empty">连接图片、音频或视频作为参考素材</div>';
        rememberCanvasInputView(list, node, signature);
        return;
    }
    for(const group of groups){
        const section = document.createElement('section');
        section.className = `media-input-group media-input-group-${group.kind}`;
        section.dataset.mediaKind = group.kind;
        section.setAttribute('aria-label', `${group.title}输入`);
        section.innerHTML = `<div class="media-input-group-head">${group.title}<span>${group.items.length}</span></div><div class="media-input-items"></div>`;
        const row = section.querySelector('.media-input-items');
        for(const entry of group.items){
            const {ref, sourceId, label, referenceLabel, index, kind} = entry;
            const item = document.createElement('div');
            item.className = `input-item media-reference-item media-reference-${kind}`;
            item.dataset.sourceId = sourceId;
            item.dataset.mediaKind = kind;
            item.dataset.referenceLabel = referenceLabel;
            item.draggable = false;
            const unavailable = isMissingAssetUrl(ref.url) || String(ref.url).startsWith('asset://');
            const referenceButton = `<button type="button" class="media-reference-label" title="复制提示词引用：${referenceLabel}；拖动素材可调整同类顺序" aria-label="复制${referenceLabel}">${referenceLabel}</button>`;
            const name = `<span class="media-reference-name" title="${escapeAttr(label)}">${escapeHtml(label)}</span>`;
            const previewButton = `<button type="button" class="media-reference-preview" title="${unavailable ? '该素材暂不支持预览' : `预览${referenceLabel}`}" aria-label="预览${referenceLabel}" ${unavailable ? 'disabled' : ''}><i data-lucide="${kind === 'image' ? 'maximize-2' : 'play'}"></i></button>`;
            if(kind === 'audio'){
                item.innerHTML = `${previewButton}${referenceButton}${name}`;
            } else {
                const preview = unavailable
                    ? `<div class="media-reference-placeholder"><i data-lucide="${kind === 'video' ? 'clapperboard' : 'image'}"></i></div>`
                    : kind === 'video' ? canvasVideoPreviewHtml(ref.url, 256, 'draggable="false"') : canvasPreviewImgHtml(ref.url, 256, 'draggable="false"');
                const frameLabel = kind === 'image' && node.useFrameRoles && index <= 2
                    ? (index === 1 ? tr('canvas.videoRoleFirstFrame') : tr('canvas.videoRoleLastFrame')) : '';
                item.innerHTML = `<div class="media-reference-thumb">${preview}${referenceButton}${previewButton}</div>${name}${frameLabel ? `<span class="video-frame-label">${frameLabel}</span>` : ''}`;
            }
            const previous = group.items[index - 2];
            if(sourceId && previous?.sourceId && previous.sourceId !== sourceId){
                const move = document.createElement('button');
                move.type = 'button';
                move.className = 'media-reference-move';
                move.title = `将${referenceLabel}前移`;
                move.setAttribute('aria-label', move.title);
                move.innerHTML = `<i data-lucide="${kind === 'audio' ? 'arrow-up' : 'arrow-left'}"></i>`;
                move.onclick = e => {
                    e.stopPropagation();
                    reorderInput(node, sourceId, previous.sourceId);
                    setStatus('素材顺序已更新，请检查提示词中的同类编号');
                };
                item.appendChild(move);
            }
            item.onmousedown = e => e.stopPropagation();
            item.onclick = e => e.stopPropagation();
            item.querySelector('.media-reference-label').onclick = async e => {
                e.stopPropagation();
                try { const copied = await copyTextToClipboard(referenceLabel); setStatus(copied ? `已复制 ${referenceLabel}，可粘贴到提示词` : `复制失败，请在提示词中输入 ${referenceLabel}`); }
                catch(err) { setStatus(`复制失败，请在提示词中输入 ${referenceLabel}`); }
            };
            item.querySelector('.media-reference-preview').onclick = e => {
                e.stopPropagation();
                if(!unavailable) openOutputLightbox(ref.url, {type:'image', url:ref.url, mediaKind:kind, name:label});
            };
            bindCanvasInputReorder(item, list, node, sourceId, kind);
            row.appendChild(item);
        }
        list.appendChild(section);
    }
    const hint = document.createElement('div');
    hint.className = 'media-input-hint';
    hint.textContent = manualVideoUrlForNode(node)
        ? '手动网址作为视频1，替代连入的视频。点击编号复制引用。'
        : '各类独立编号 · 点击编号复制 · 拖动调整同类顺序';
    list.title = hint.textContent;
    // A manually supplied URL changes the input meaning, so retain that status.
    if(manualVideoUrlForNode(node)) list.appendChild(hint);
    refreshIcons();
    rememberCanvasInputView(list, node, signature);
}

function toggleComfyRandom(nodeId, fieldId){
    const node = nodes.find(n => n.id === nodeId);
    if(!node) return;
    const field = comfyFields(node).find(f => f.id === fieldId);
    if(!comfyRandomEnabled(field)) return;
    node.comfyRandomActive = node.comfyRandomActive || {};
    node.comfyRandomActive[fieldId] = !comfyRandomActive(node, fieldId);
    refreshNodes([node.id]);
    scheduleSave();
}

function renderComfyBody(node){
    const note = document.createElement('div');
    note.className = 'muted-note';
    note.textContent = "此功能已移除，历史内容保留。请新建通用 API 节点并明确选择供应商。";
    return note;
}

function renderComfyImages(list, node, imageInputs){
    if(!list) return;
    const signature = JSON.stringify(['comfy', tr('canvas.groupEmpty'), tr('canvas.image'), imageInputs.map(src => {
        const kind = mediaKindForRef(src.refs?.[0] || src.preview);
        return [src.id, src.preview, kind, nodeTitleForMedia({mediaKind:kind}), isMissingAssetUrl(src.preview)];
    })]);
    if(isCanvasInputViewCurrent(list, node, signature)) return;
    list.innerHTML = imageInputs.length ? '' : `<div class="text-[11px] text-gray-300 py-2">${tr('canvas.groupEmpty')}</div>`;
    imageInputs.forEach((src, i) => {
        const item = document.createElement('div');
        item.className = 'input-item';
        item.draggable = true;
        item.dataset.sourceId = src.id;
        const firstRef = (src.refs || [])[0];
        const kind = mediaKindForRef(firstRef || src.preview);
        const icon = kind === 'video' ? 'file-video' : kind === 'audio' ? 'file-audio' : 'image';
        const label = kind === 'image' ? `${tr('canvas.image')} ${i + 1}` : `${nodeTitleForMedia({mediaKind:kind})} ${i + 1}`;
        const previewHtml = kind === 'video' && src.preview && !isMissingAssetUrl(src.preview)
            ? canvasVideoPreviewHtml(src.preview, 256)
            : kind === 'audio'
                ? `<i data-lucide="${icon}" class="w-6 h-6 text-slate-400"></i>`
                : (src.preview && !isMissingAssetUrl(src.preview) ? canvasPreviewImgHtml(src.preview, 256) : (src.preview ? missingAssetHtml(src.preview, true) : `<i data-lucide="${icon}" class="w-6 h-6 text-slate-400"></i>`));
        item.innerHTML = `<span class="input-index">${i + 1}</span>${previewHtml}<span class="input-label">${escapeHtml(label)}</span>`;
        item.ondragstart = e => {
            e.stopPropagation();
            internalDrag = true;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('application/x-canvas-input', src.id);
        };
        item.ondragend = () => { internalDrag = false; };
        item.ondragover = e => { e.preventDefault(); e.stopPropagation(); };
        item.ondrop = e => {
            e.preventDefault();
            e.stopPropagation();
            reorderInput(node, e.dataTransfer.getData('application/x-canvas-input'), src.id);
            internalDrag = false;
        };
        list.appendChild(item);
    });
    rememberCanvasInputView(list, node, signature);
}

function renderComfySettings(container, node){
    const mode = node.mode || 'text';
    if(mode === 'text'){
        container.innerHTML = `
            <div class="gen-settings-row">
                <label class="field"><div class="setting-title">${tr('canvas.width')}</div><input class="setting-input" data-field="width" type="number" min="64" step="64" value="${Number(node.width || 1024)}"></label>
                <label class="field"><div class="setting-title">${tr('canvas.height')}</div><input class="setting-input" data-field="height" type="number" min="64" step="64" value="${Number(node.height || 1024)}"></label>
            </div>
        `;
    } else if(mode === 'enhance'){
        const strength = Number(node.enhanceStrength ?? 0.5);
        container.innerHTML = `
            <div class="gen-settings-row">
                <label class="field" style="flex:1">
                    <div class="setting-title" style="display:flex;justify-content:space-between">
                        <span>${tr('studio.enhancementStrength')}</span><span class="enhance-strength-val">${strength.toFixed(2)}</span>
                    </div>
                    <input type="range" class="canvas-range enhance-strength-slider" data-field="enhanceStrength" min="0.1" max="1.0" step="0.05" value="${strength}">
                </label>
            </div>
            <div class="gen-settings-row">
                <button type="button" class="setting-check ${node.enhanceUpscale ? 'active' : ''}" data-toggle-field="enhanceUpscale"><span class="check-dot"></span>${tr('studio.superResolution')}</button>
                <select class="select-lite ${node.enhanceUpscale ? '' : 'opacity-40 cursor-not-allowed'}" data-field="enhanceUpscaleRes" ${node.enhanceUpscale ? '' : 'disabled'}><option value="2048">2X (2048)</option><option value="4096">4X (4096)</option></select>
            </div>
        `;
        container.querySelector('[data-field="enhanceUpscaleRes"]').value = String(node.enhanceUpscaleRes || 2048);
    } else if(mode === 'edit'){
        container.innerHTML = `
            <div class="gen-settings-row">
                <button type="button" class="setting-check ${node.editUpscale ? 'active' : ''}" data-toggle-field="editUpscale"><span class="check-dot"></span>${tr('studio.superResolution')}</button>
                <select class="select-lite ${node.editUpscale ? '' : 'opacity-40 cursor-not-allowed'}" data-field="editUpscaleRes" ${node.editUpscale ? '' : 'disabled'}><option value="2048">2X (2048)</option><option value="4096">4X (4096)</option></select>
            </div>
        `;
        container.querySelector('[data-field="editUpscaleRes"]').value = String(node.editUpscaleRes || 2048);
    } else if(mode === 'custom'){
        const selected = validComfyWorkflowName(node.comfyWorkflow || comfyWorkflows[0]?.name || '');
        if(node.comfyWorkflow && node.comfyWorkflow !== selected) node.comfyWorkflow = selected;
        const data = currentComfyWorkflow(node);
        const fields = data?.config?.fields || [];
        const settingFields = fields.filter(f => comfyFieldKind(f) === 'setting');
        container.innerHTML = `
            <div class="gen-settings-row">
                <select class="select-lite comfy-workflow-select" data-field="comfyWorkflow" style="width:100%">${comfyWorkflowOptions(selected)}</select>
            </div>
            ${!selected ? `<div class="text-[11px] text-slate-400">${tr('canvas.comfyNoWorkflow')}</div>` : (!data ? `<div class="text-[11px] text-slate-400">${tr('canvas.comfyLoadingWorkflow')}</div>` : '')}
            ${data ? settingFields.map(f => renderComfyCustomField(node, f)).join('') || `<div class="text-[11px] text-slate-400">${tr('canvas.comfyNoExtraParams')}</div>` : ''}
        `;
        if(selected && !data) ensureComfyWorkflow(selected).then(() => refreshNodes([node.id]));
    } else {
        container.innerHTML = '';
    }
    container.querySelectorAll('[data-toggle-field]').forEach(btn => {
        btn.onmousedown = e => e.stopPropagation();
        btn.onclick = e => {
            e.stopPropagation();
            const field = btn.dataset.toggleField;
            node[field] = !node[field];
            refreshNodes([node.id]);
            scheduleSave();
        };
    });
    container.querySelectorAll('button[data-comfy-param]').forEach(btn => {
        btn.onmousedown = e => e.stopPropagation();
        btn.onclick = e => updateComfyField(node, btn, e);
    });
    container.querySelectorAll('button[data-comfy-random]').forEach(btn => {
        btn.onmousedown = e => e.stopPropagation();
        btn.onclick = e => {
            e.stopPropagation();
            toggleComfyRandom(node.id, btn.dataset.comfyRandom);
        };
    });
    container.querySelectorAll('input, select, textarea').forEach(input => {
        input.onmousedown = e => e.stopPropagation();
        input.onclick = e => e.stopPropagation();
        if(input.classList.contains('model-select')) return;
        input.onchange = e => updateComfyField(node, input, e);
        input.oninput = e => updateComfyField(node, input, e);
    });
}

function renderComfyCustomField(node, f){
    const value = comfyParamValue(node, f);
    const label = escapeHtml(f.name || f.input);
    if(f.type === 'boolean'){
        return `<div class="gen-settings-row">
            <button type="button" class="setting-check ${value ? 'active' : ''}" data-comfy-param="${escapeHtml(f.id)}" data-comfy-type="boolean"><span class="check-dot"></span>${label}</button>
        </div>`;
    }
    if(f.type === 'slider'){
        const min = f.min ?? 0, max = f.max ?? 10, step = f.step ?? 1;
        return `<div class="gen-settings-row">
            <label class="field" style="flex:1">
                <div class="setting-title" style="display:flex;justify-content:space-between"><span>${label}</span><span class="comfy-param-val">${escapeHtml(value)}</span></div>
                <input type="range" class="canvas-range" data-comfy-param="${escapeHtml(f.id)}" data-comfy-type="slider" min="${min}" max="${max}" step="${step}" value="${escapeHtml(value)}">
            </label>
        </div>`;
    }
    if(f.type === 'dropdown'){
        const opts = (f.options || []).map(o => `<option value="${escapeHtml(o)}" ${String(value) === String(o) ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('');
        return `<div class="gen-settings-row">
            <label class="field" style="flex:1"><div class="setting-title">${label}</div><select class="select-lite" data-comfy-param="${escapeHtml(f.id)}" data-comfy-type="dropdown" style="width:100%">${opts || '<option value="">(无选项)</option>'}</select></label>
        </div>`;
    }
    if(f.type === 'textarea'){
        return `<div class="gen-settings-row">
            <label class="field" style="flex:1"><div class="setting-title">${label}</div><textarea class="setting-input" data-comfy-param="${escapeHtml(f.id)}" data-comfy-type="textarea" style="height:66px;padding-top:8px;resize:vertical">${escapeHtml(value)}</textarea></label>
        </div>`;
    }
    const type = f.type === 'number' ? 'number' : 'text';
    if(comfyRandomEnabled(f)){
        const active = comfyRandomActive(node, f.id);
        return `<div class="gen-settings-row">
            <div class="comfy-random-field">
                <label class="field"><div class="setting-title">${label}</div><input class="setting-input" type="number" data-comfy-param="${escapeHtml(f.id)}" data-comfy-type="number" value="${escapeHtml(value)}"></label>
                <button class="tool-btn comfy-random-btn ${active ? 'active' : ''}" type="button" data-comfy-random="${escapeHtml(f.id)}" title="${active ? '随机已开启，点击关闭' : '随机已关闭，点击开启'}" aria-label="${active ? '随机已开启，点击关闭' : '随机已关闭，点击开启'}"><i data-lucide="dice-5" class="w-4 h-4"></i></button>
            </div>
        </div>`;
    }
    return `<div class="gen-settings-row">
        <label class="field" style="flex:1"><div class="setting-title">${label}</div><input class="setting-input" type="${type}" data-comfy-param="${escapeHtml(f.id)}" data-comfy-type="${escapeHtml(f.type || 'text')}" value="${escapeHtml(value)}"></label>
    </div>`;
}

function updateComfyField(node, input, event){
    event?.stopPropagation();
    const paramId = input.dataset.comfyParam;
    if(paramId){
        node.comfyParams = node.comfyParams || {};
        const field = comfyFields(node).find(f => f.id === paramId);
        const type = input.dataset.comfyType || field?.type || 'text';
        if(type === 'boolean') node.comfyParams[paramId] = !Boolean(node.comfyParams[paramId] ?? field?.default ?? false);
        else if(type === 'number' || type === 'slider') node.comfyParams[paramId] = Number(input.value) || 0;
        else node.comfyParams[paramId] = input.value;
        const val = input.closest('.field')?.querySelector('.comfy-param-val');
        if(val) val.textContent = node.comfyParams[paramId];
        if(type === 'boolean') refreshNodes([node.id]);
        scheduleSave();
        return;
    }
    const field = input.dataset.field;
    if(!field) return;
    if(field === 'comfyWorkflow'){
        node.comfyWorkflow = validComfyWorkflowName(input.value);
        node.comfyParams = {};
        ensureComfyWorkflow(node.comfyWorkflow).then(() => refreshNodes([node.id]));
        scheduleSave();
        return;
    }
    if(input.type === 'checkbox') {
        node[field] = input.checked;
        if(field === 'enhanceUpscale') refreshNodes([node.id]);
    }
    else if(field === 'enhanceStrength') {
        node[field] = Number(input.value) || 0.5;
        const val = input.closest('.field')?.querySelector('.enhance-strength-val');
        if(val) val.textContent = node[field].toFixed(2);
    }
    else if(['width','height','enhanceUpscaleRes','editUpscaleRes','count'].includes(field)) node[field] = Number(input.value) || 1;
    else node[field] = input.value;
    scheduleSave();
}

function syncGeneratorInputs(){
    nodes.filter(n => CANVAS_GENERATOR_TYPES.includes(n.type)).forEach(gen => {
        orderedSources(gen, generatorSources(gen));
        if(gen.type === 'ltxDirector') ltxSyncConnectedImagesToTimeline(gen);
    });
}

function refreshPromptDependents(nodeId){
    // Ephemeral indexes: editing, undo and topology changes always see the current graph.
    const graph = canvasInputGraph(), visited = new Set(), affected = new Set(), queue = [nodeId];
    for(let i = 0; i < queue.length; i++){
        const id = queue[i];
        if(visited.has(id)) continue;
        visited.add(id);
        queue.push(...(graph.parents.get(id) || []));
        for(const to of graph.outgoing.get(id) || []){
            const target = graph.nodeById.get(to);
            if(!target) continue;
            if(CANVAS_GENERATOR_TYPES.includes(target.type)) affected.add(to);
            if(target.type === 'loop') queue.push(to);
        }
    }
    const prepared = new Map();
    for(const id of affected){
        const gen = graph.nodeById.get(id);
        prepared.set(id, orderedSources(gen, generatorSources(gen, null, graph)));
        if(gen.type === 'ltxDirector') ltxSyncConnectedImagesToTimeline(gen);
    }
    refreshGeneratorInputViews(affected, prepared, graph.nodeById);
}

function refreshGeneratorInputViews(ids=null, prepared=null, nodeById=null){
    const scope = ids === null ? null : new Set(ids);
    const candidates = scope && nodeById ? [...scope].map(id => nodeById.get(id)).filter(Boolean) : nodes;
    candidates.filter(n => CANVAS_GENERATOR_TYPES.includes(n.type) && (!scope || scope.has(n.id))).forEach(gen => {
        const el = nodesEl.querySelector(`.node[data-id="${gen.id}"]`);
        if(!el || el.classList.contains('node-placeholder')) return;
        const sources = prepared?.get(gen.id) || orderedSources(gen, generatorSources(gen));
        const imageInputs = sources
            .map(src => ({...src, refs:gen.type === 'video' ? videoNodeMediaRefs(src.refs || []) : imageRefsOnly(src.refs || [])}))
            .filter(src => src.refs?.length);
        renderPromptPreview(el.querySelector('.prompt-list'), sources.filter(src => src.prompt && !src.refs?.length));
        if(gen.type === 'generator') renderImageInputList(el.querySelector('.input-list'), gen, imageInputs);
        if(gen.type === 'msgen') renderImageInputList(el.querySelector('.ms-img-list'), gen, imageInputs);
        if(gen.type === 'comfy'){
            const mediaInputs = gen.mode === 'custom' ? sources.filter(src => src.refs?.length) : imageInputs;
            renderComfyImages(el.querySelector('.input-list'), gen, mediaInputs);
        }
        if(gen.type === 'ltxDirector'){
            if(!prepared?.has(gen.id)) ltxSyncConnectedImagesToTimeline(gen);
            renderComfyImages(el.querySelector('.input-list'), gen, imageInputs);
        }
        if(gen.type === 'video') renderVideoImageInputs(el.querySelector('.video-img-list'), gen, imageInputs);
    });
}

function ltxDirectorSyncSeconds(node){
    const fps = Math.max(1, Number(node?.frameRate) || 24);
    node.durationSeconds = Math.round((Number(node.durationFrames) || 120) / fps * 1000) / 1000;
}

function ltxParseTimeline(node){
    try {
        const t = JSON.parse(node?.ltxTimelineData || '{}');
        return {
            segments: Array.isArray(t.segments) ? t.segments : [],
            audioSegments: Array.isArray(t.audioSegments) ? t.audioSegments : []
        };
    } catch(e) {
        return {segments: [], audioSegments: []};
    }
}

function ltxRefreshTimelineEditor(node){
    if(!node?._ltxEditor || typeof window.LTXParseInitial !== 'function') return;
    node._ltxEditor.timeline = window.LTXParseInitial(node.ltxTimelineData || '{}');
    node._ltxEditor.loadImages?.();
    node._ltxEditor.commitChanges?.(true);
    node._ltxEditor.render?.();
}

function ltxSyncConnectedImagesToTimeline(node){
    if(!node || node.type !== 'ltxDirector') return;
    const hadTimeline = Boolean(node.ltxTimelineData);
    const sources = orderedSources(node, generatorSources(node));
    const imageInputs = sources.filter(src => imageRefsOnly(src.refs || []).length);
    const timeline = ltxParseTimeline(node);
    const fps = Math.max(1, Number(node.frameRate) || 24);
    const defaultLen = Math.max(6, fps);
    const manual = (timeline.segments || []).filter(s => !s.canvasSourceId);
    const existingAuto = new Map((timeline.segments || []).filter(s => s.canvasSourceId).map(s => [s.canvasSourceId, s]));
    const autoSegs = [];
    let cursor = 0;
    for(const src of imageInputs){
        const ref = imageRefsOnly(src.refs || [])[0];
        const url = ref?.url;
        if(!url) continue;
        let seg = existingAuto.get(src.id);
        if(seg){
            if(seg.imageB64 !== url){
                seg.imageB64 = url;
                seg.imageFile = null;
                delete seg.imgObj;
            }
            if(!seg.length || seg.length < 1) seg.length = defaultLen;
        } else {
            seg = {
                id:uid('ltxseg'),
                start:cursor,
                length:defaultLen,
                prompt:src.prompt || '',
                type:'image',
                imageB64:url,
                canvasSourceId:src.id,
                guideStrength:1
            };
        }
        seg.start = cursor;
        cursor += Math.max(1, Number(seg.length) || defaultLen);
        autoSegs.push(seg);
    }
    let nextStart = cursor;
    const reflowedManual = [...manual].sort((a, b) => (Number(a.start) || 0) - (Number(b.start) || 0));
    for(const seg of reflowedManual){
        seg.start = nextStart;
        nextStart += Math.max(1, Number(seg.length) || defaultLen);
    }
    const allSegs = [...autoSegs, ...reflowedManual];
    const maxEnd = allSegs.reduce((m, s) => Math.max(m, (Number(s.start) || 0) + (Number(s.length) || 0)), 0);
    if(maxEnd > (Number(node.durationFrames) || 0)){
        node.durationFrames = Math.ceil(maxEnd);
        ltxDirectorSyncSeconds(node);
    }
    const prevTimeline = node.ltxTimelineData;
    node.ltxTimelineData = JSON.stringify({segments: allSegs, audioSegments: timeline.audioSegments || []});
    ltxRefreshTimelineEditor(node);
    if(hadTimeline && node.ltxTimelineData !== prevTimeline) scheduleSave();
}

function bindLTXParamsRow(container, node){
    const row = container.querySelector('[data-ltx-params]');
    if(!row) return;
    const fps = () => Math.max(1, Number(node.frameRate) || 24);
    const bindNum = (sel, apply) => {
        const inp = row.querySelector(sel);
        if(!inp) return;
        inp.onmousedown = e => e.stopPropagation();
        inp.onclick = e => e.stopPropagation();
        inp.onchange = () => {
            apply(inp);
            ltxDirectorSyncSeconds(node);
            if(node._ltxEditor){
                node._ltxEditor.commitChanges?.(true);
                node._ltxEditor.render?.();
            }
            scheduleSave();
        };
    };
    const sec = row.querySelector('[data-ltx-duration-seconds]');
    const frames = row.querySelector('[data-ltx-duration-frames]');
    const rate = row.querySelector('[data-ltx-frame-rate]');
    const width = row.querySelector('[data-ltx-width]');
    const height = row.querySelector('[data-ltx-height]');
    if(sec) sec.value = Number(node.durationSeconds) || 5;
    if(frames) frames.value = Number(node.durationFrames) || 120;
    if(rate) rate.value = Number(node.frameRate) || 24;
    if(width) width.value = Number(node.customWidth) || 0;
    if(height) height.value = Number(node.customHeight) || 0;
    bindNum('[data-ltx-duration-seconds]', inp => {
        const v = Math.max(0.1, Math.min(1000, parseFloat(inp.value) || node.durationSeconds || 5));
        node.durationSeconds = Math.round(v * 1000) / 1000;
        node.durationFrames = Math.max(1, Math.round(node.durationSeconds * fps()));
        inp.value = node.durationSeconds;
        if(frames) frames.value = node.durationFrames;
    });
    bindNum('[data-ltx-duration-frames]', inp => {
        node.durationFrames = Math.max(1, Math.min(10000, parseInt(inp.value, 10) || 120));
        if(sec) sec.value = Math.round((node.durationFrames / fps()) * 1000) / 1000;
        inp.value = node.durationFrames;
    });
    bindNum('[data-ltx-frame-rate]', inp => {
        node.frameRate = Math.max(1, Math.min(240, parseInt(inp.value, 10) || 24));
        if(sec) sec.value = Math.round((node.durationFrames / fps()) * 1000) / 1000;
    });
    bindNum('[data-ltx-width]', inp => {
        node.customWidth = Math.max(0, Math.min(8192, parseInt(inp.value, 10) || 0));
        inp.value = node.customWidth;
    });
    bindNum('[data-ltx-height]', inp => {
        node.customHeight = Math.max(0, Math.min(8192, parseInt(inp.value, 10) || 0));
        inp.value = node.customHeight;
    });
}

function ltxFlushTimelineToNode(node){
    if(!node || node.type !== 'ltxDirector') return;
    if(node._ltxEditor && typeof node._ltxEditor.commitChanges === 'function'){
        node._ltxEditor.commitChanges(true);
    }
}

function updateLTXNodeElementSize(node){
    const el = document.querySelector(`.node[data-id="${CSS.escape(node.id)}"]`);
    if(!el) return;
    if(node.w) el.style.width = `${node.w}px`;
    if(node.h) el.style.height = `${node.h}px`;
    refreshGeometryAfterLayout();
}

function renderLTXDirectorBody(node){
    const note = document.createElement('div');
    note.className = 'muted-note';
    note.textContent = "此功能已移除，历史内容保留。请新建通用 API 节点并明确选择供应商。";
    return note;
}

function cascadeBtnHtml(node){
    // 仅链尾节点显示一键运行
    if(!isTerminalGenerator(node.id)) return '';
    // 也要求至少有上游生成节点，否则没意义
    const order = computeCascadeOrder(node.id);
    const loop = resolveCascadeLoop(node.id);
    if(order.length <= 1 && !loop) return '';
    const suffix = loop ? ` × ${loop.count} ${tr('canvas.loopRounds')}` : '';
    if(isCascadeActive(node.id)){
        const stopping = isCascadeStopping(node.id);
        return `<button class="gen-cascade-btn gen-cascade-stop" type="button" data-cascade-stop="${node.id}" ${stopping ? 'disabled' : ''}><i data-lucide="square" class="w-4 h-4"></i><span>${stopping ? '停止中…' : '停止运行'}</span></button>`;
    }
    return `<button class="gen-cascade-btn" type="button" data-cascade="${node.id}" title="一键运行整条工作流（追溯所有上游生成节点）"><i data-lucide="play-circle" class="w-4 h-4"></i><span>一键运行 ${order.length} 个节点${suffix}</span></button>`;
}

function bindCascadeButtons(wrap, nodeId){
    wrap.querySelectorAll(`[data-cascade="${nodeId}"]`).forEach(b => {
        b.onmousedown = e => e.stopPropagation();
        b.onclick = e => { e.stopPropagation(); runNodeCascade(nodeId); };
    });
    wrap.querySelectorAll(`[data-cascade-stop="${nodeId}"]`).forEach(b => {
        b.onmousedown = e => e.stopPropagation();
        b.onclick = e => { e.stopPropagation(); requestCascadeStop(nodeId); };
    });
    wrap.querySelectorAll(`[data-retry="${nodeId}"]`).forEach(b => {
        b.onmousedown = e => e.stopPropagation();
        b.onclick = e => { e.stopPropagation(); retryNodeAndDownstream(nodeId); };
    });
    wrap.querySelectorAll(`[data-stop="${nodeId}"]`).forEach(b => {
        b.onmousedown = e => e.stopPropagation();
        b.onclick = e => { e.stopPropagation(); cancelCascade(nodeId); };
    });
}

function renderOutputMedia(item, useGridLayout=false){
    const url = outputUrlValue(item);
    const safe = escapeAttr(url);
    const meta = item && typeof item === 'object' ? item : {};
    const kind = mediaKindForOutputItem(item);
    const grid = useGridLayout ? (meta.grid || null) : null;
    const gridStyle = grid ? ` style="grid-row:${Number(grid.row || 0) + 1};grid-column:${Number(grid.col || 0) + 1};aspect-ratio:${Math.max(1, Number(grid.w || 1))}/${Math.max(1, Number(grid.h || 1))}"` : '';
    const timePill = meta.runMs && !meta.viewed ? `<span class="output-time-pill">${formatRunDuration(meta.runMs)}</span>` : '';
    if(isMissingAssetUrl(url)){
        return `<div class="output-img-wrap" data-output-url="${safe}" data-missing-url="${safe}"${gridStyle}>${missingAssetHtml(url, true)}${timePill}<button class="output-del" title="${tr('common.delete')}">×</button></div>`;
    }
    if(kind === 'video'){
        return `<div class="output-img-wrap" data-output-url="${safe}"${gridStyle}>${canvasVideoPreviewHtml(url, useGridLayout ? 512 : 768, 'alt="video output"')}${timePill}<button class="canvas-video-play output-video-play" type="button" title="播放"><i data-lucide="play"></i></button><div class="output-video-badge"><i data-lucide="play" class="w-3 h-3"></i>VIDEO</div><button class="output-download" type="button" title="${tr('canvas.download')}"><i data-lucide="download"></i></button><button class="output-del" title="${tr('common.delete')}">×</button></div>`;
    }
    if(kind === 'audio'){
        return `<div class="output-img-wrap output-audio-wrap" data-output-url="${safe}"${gridStyle}><div class="output-audio-card"><i data-lucide="file-audio" class="w-7 h-7"></i><span>${escapeHtml(meta.name || outputImageName(url))}</span><small><i data-lucide="play"></i>打开播放器</small></div>${timePill}<button class="output-del" title="${tr('common.delete')}">×</button></div>`;
    }
    if(kind === 'text' || kind === 'file'){
        const icon = kind === 'text' ? 'file-text' : 'file';
        const label = kind === 'text' ? 'TEXT' : 'FILE';
        return `<div class="output-img-wrap output-file-wrap" data-output-url="${safe}"${gridStyle}><div class="output-file-card"><i data-lucide="${icon}" class="w-7 h-7"></i><span>${escapeHtml(meta.name || outputImageName(url))}</span><small>${label}</small></div>${timePill}<button class="output-del" title="${tr('common.delete')}">×</button></div>`;
    }
    return `<div class="output-img-wrap" data-output-url="${safe}"${gridStyle}>${canvasPreviewImgHtml(url, useGridLayout ? 512 : 768, 'alt="generated output"')}${timePill}<button class="output-del" title="${tr('common.delete')}">×</button></div>`;
}

function outputGridLayout(node){
    const images = node?.images || [];
    if(!images.length || node?._pending?.length) return null;
    const layout = node.outputLayout;
    if(!layout || layout.type !== 'grid-split' || !layout.groupId) return null;
    const allMatch = images.every(item => item && typeof item === 'object' && item.grid?.groupId === layout.groupId);
    return allMatch ? layout : null;
}

function renderOutputGrid(node, pendingHtml=''){
    const layout = outputGridLayout(node);
    const gridClass = layout ? 'output-grid grid-layout' : 'output-grid';
    const style = layout ? ` style="--grid-cols:${Math.max(1, Number(layout.cols || 1))}"` : '';
    return `<div class="${gridClass}"${style}>${(node.images || []).map(item => renderOutputMedia(item, !!layout)).join('')}${pendingHtml}</div>`;
}

function nodeBounds(ids){
    const rects = ids.map(id => {
        const n = nodes.find(item => item.id === id);
        const el = nodesEl.querySelector(`.node[data-id="${id}"]`);
        if(!n) return null;
        return {x:n.x, y:n.y, w:el?.offsetWidth || n.w || 260, h:el?.offsetHeight || n.h || 220};
    }).filter(Boolean);
    const x1 = Math.min(...rects.map(r => r.x));
    const y1 = Math.min(...rects.map(r => r.y));
    const x2 = Math.max(...rects.map(r => r.x + r.w));
    const y2 = Math.max(...rects.map(r => r.y + r.h));
    return {x:x1, y:y1, w:x2 - x1, h:y2 - y1};
}

function startSelection(e){
    e.preventDefault();
    e.stopPropagation();
    if(document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    selectDrag = {sx:e.clientX, sy:e.clientY, x:e.clientX, y:e.clientY};
    document.body.classList.add('canvas-selecting');
    selectionBox.style.display = 'block';
    updateSelectionBox(e.clientX, e.clientY);
    startWindowPointerSession(e2 => updateSelectionBox(e2.clientX, e2.clientY), finishSelection);
}

function updateSelectionBox(x, y){
    if(!selectDrag) return;
    selectDrag.x = x; selectDrag.y = y;
    const left = Math.min(selectDrag.sx, x);
    const top = Math.min(selectDrag.sy, y);
    selectionBox.style.left = `${left}px`;
    selectionBox.style.top = `${top}px`;
    selectionBox.style.width = `${Math.abs(x - selectDrag.sx)}px`;
    selectionBox.style.height = `${Math.abs(y - selectDrag.sy)}px`;
}

function finishSelection(){
    if(!selectDrag) return;
    const rect = selectionBox.getBoundingClientRect();
    selectionBox.style.display = 'none';
    selected.clear();
    nodesEl.querySelectorAll('.node').forEach(el => {
        const r = el.getBoundingClientRect();
        const overlaps = r.left < rect.right && r.right > rect.left && r.top < rect.bottom && r.bottom > rect.top;
        if(overlaps) selected.add(el.dataset.id);
    });
    selectDrag = null;
    document.body.classList.remove('canvas-selecting');
    endWindowPointerSession();
    render();
    if(workflowTransferModal?.classList.contains('open')) updateWorkflowTransferMeta();
}

function renderSelectionHub(){
    selectionHub.innerHTML = '';
    selectionHub.classList.remove('open');
}

function startSelectionLink(e, kind){
    e.preventDefault();
    e.stopPropagation();
    const p = screenToWorld(e.clientX, e.clientY);
    tempLink = {from:`selection:${kind}`, x1:p.x, y1:p.y, x2:p.x, y2:p.y};
    startWindowPointerSession(e2 => { const next = screenToWorld(e2.clientX, e2.clientY); tempLink.x2 = next.x; tempLink.y2 = next.y; renderLinks(); }, e2 => {
        const targetPort = nearestPort(e2.clientX, e2.clientY, 'in');
        const target = targetPort?.closest('.generator-node');
        if(target) connectSelectionToGenerator(kind, target.dataset.id);
        tempLink = null;
        render();
        scheduleSave();
    });
}

function startNodeDrag(e, node){
    if(e.button !== 0) return;
    if(startKnifeDrag(e)) return;
    if(isCanvasLockedByOther()){
        setStatus('画布正被其他人编辑中，无法操作');
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    let dragTarget = node;
    if(e.altKey){
        const copy = cloneNode(node, 0, 0);
        const isGroup = node.type === 'group' || node.type === 'promptGroup';
        if(isGroup && node.items?.length){
            const idMap = new Map();
            const childCopies = node.items
                .map(id => nodes.find(n => n.id === id)).filter(Boolean)
                .map(child => { const cc = cloneNode(child, 0, 0); idMap.set(child.id, cc.id); return cc; });
            copy.items = copy.items.map(id => idMap.get(id) || id);
            nodes.push(...childCopies, copy);
        } else {
            nodes.push(copy);
        }
        selected.clear();
        selected.add(copy.id);
        dragTarget = copy;
        render();
    }
    const isGroup = dragTarget.type === 'group' || dragTarget.type === 'promptGroup';
    const collected = new Map();
    const collect = n => {
        if(!n || collected.has(n.id) || n.id === dragTarget.id) return;
        collected.set(n.id, {node:n, ox:n.x, oy:n.y});
        if(n.type === 'group' || n.type === 'promptGroup'){
            (n.items || []).map(id => nodes.find(x => x.id === id)).forEach(collect);
        }
    };
    if(isGroup){
        (dragTarget.items || []).map(id => nodes.find(n => n.id === id)).forEach(collect);
    }
    // 如果被拖节点在多选里，所有其他选中节点（含其组成员）一起移动
    if(selected.has(dragTarget.id) && selected.size > 1){
        [...selected].forEach(id => collect(nodes.find(n => n.id === id)));
    }
    const children = [...collected.values()];
    dragNode = {node: dragTarget, children, sx:e.clientX, sy:e.clientY, ox:dragTarget.x, oy:dragTarget.y};
    document.body.classList.add('canvas-node-drag');
    startWindowPointerSession(onNodeDrag, endDrag);
}

function onNodeDrag(e){
    if(!dragNode) return;
    const dx = (e.clientX - dragNode.sx) / viewport.scale;
    const dy = (e.clientY - dragNode.sy) / viewport.scale;
    dragNode.node.x = dragNode.ox + dx;
    dragNode.node.y = dragNode.oy + dy;
    const el = nodesEl.querySelector(`.node[data-id="${dragNode.node.id}"]`);
    if(el){
        el.style.left = `${dragNode.node.x}px`;
        el.style.top = `${dragNode.node.y}px`;
    }
    (dragNode.children || []).forEach(childDrag => {
        childDrag.node.x = childDrag.ox + dx;
        childDrag.node.y = childDrag.oy + dy;
        const childEl = nodesEl.querySelector(`.node[data-id="${childDrag.node.id}"]`);
        if(childEl){
            childEl.style.left = `${childDrag.node.x}px`;
            childEl.style.top = `${childDrag.node.y}px`;
        }
    });
    // Keep model coordinates synchronous; only defer the expensive shared drawing.
    scheduleGeometryRefresh(1, [dragNode.node.id, ...(dragNode.children || []).map(child => child.node.id)]);
    if(workflowTransferModal?.classList.contains('open')) updateWorkflowTransferMeta();
    scheduleMinimapRender();
}

function startNodeResize(e, node){
    if(isCanvasLockedByOther()){
        setStatus('画布正被其他人编辑中，无法操作');
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    const el = nodesEl.querySelector(`.node[data-id="${node.id}"]`);
    const rect = el?.getBoundingClientRect();
    resizeNode = {
        node,
        sx:e.clientX,
        sy:e.clientY,
        sw:(rect?.width ? rect.width / viewport.scale : node.w || defaultNodeSize(node.type).w),
        sh:(rect?.height ? rect.height / viewport.scale : node.h || defaultNodeSize(node.type).h || 160)
    };
    document.body.classList.add('canvas-node-resize');
    startWindowPointerSession(onNodeResize, endDrag);
}

function onNodeResize(e){
    if(!resizeNode) return;
    const min = defaultNodeSize(resizeNode.node.type);
    const nextW = Math.max(Math.min(min.w, 220), resizeNode.sw + (e.clientX - resizeNode.sx) / viewport.scale);
    const nextH = Math.max(96, resizeNode.sh + (e.clientY - resizeNode.sy) / viewport.scale);
    resizeNode.node.w = Math.round(nextW);
    resizeNode.node.h = Math.round(nextH);
    const el = nodesEl.querySelector(`.node[data-id="${resizeNode.node.id}"]`);
    if(el){
        el.classList.add('sized');
        el.style.width = `${resizeNode.node.w}px`;
        el.style.height = `${resizeNode.node.h}px`;
    }
    scheduleGeometryRefresh(1, [resizeNode.node.id]);
    scheduleMinimapRender();
}

function startLink(e, originId, originKind){
    e.stopPropagation();
    if(isCanvasLockedByOther()){
        setStatus('画布正被其他人编辑中，无法连线');
        return;
    }
    originKind = originKind || 'out';
    const src = portPoint(originId, originKind);
    const source = nodes.find(n => n.id === originId);
    tempLink = {from:originId, originKind, x1:src.x, y1:src.y, x2:src.x, y2:src.y};
    startWindowPointerSession(e2 => {
        const p = screenToWorld(e2.clientX, e2.clientY);
        tempLink.x2 = p.x;
        tempLink.y2 = p.y;
        renderLinks();
    }, e2 => {
        if(isCanvasLockedByOther()){ tempLink = null; renderLinks(); return; }
        const targetKind = originKind === 'out' ? 'in' : 'out';
        const targetPort = nearestPort(e2.clientX, e2.clientY, targetKind);
        const target = targetPort?.closest('.node');
        if(target){
            const targetId = target.dataset.id;
            const fromId = originKind === 'out' ? originId : targetId;
            const toId = originKind === 'out' ? targetId : originId;
            if(canConnect(fromId, toId)){
                if(!connections.some(c => c.from === fromId && c.to === toId)){
                    pushUndo();
                    connections.push({id:uid('c'), from:fromId, to:toId});
                    syncLatestGeneratedOutputToConnection(fromId, toId);
                }
                syncGeneratorInputs();
                scheduleSave();
                render();
            }
        } else if(originKind === 'out'){
            if(source && CANVAS_GENERATOR_TYPES.includes(source.type)){
                const p = screenToWorld(e2.clientX, e2.clientY);
                pushUndo();
                const out = {id:uid('out'), type:'output', x:p.x, y:p.y - 63, images:[]};
                nodes.push(out);
                connections.push({id:uid('c'), from:source.id, to:out.id});
                syncLatestGeneratedOutputToConnection(source.id, out.id);
                syncGeneratorInputs();
                scheduleSave();
                render();
            } else {
                openLinkCreateMenu(originId, originKind, e2.clientX, e2.clientY);
            }
        } else if(originKind === 'in'){
            openLinkCreateMenu(originId, originKind, e2.clientX, e2.clientY);
        }
        tempLink = null;
        renderLinks();
    });
}

function nearestPort(clientX, clientY, kind){
    const selector = `.port.${kind}`;
    const direct = document.elementFromPoint(clientX, clientY)?.closest(selector);
    if(direct) return direct;
    let best = null;
    let bestDistance = Infinity;
    nodesEl.querySelectorAll(selector).forEach(port => {
        const r = port.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const d = Math.hypot(clientX - cx, clientY - cy);
        if(d < bestDistance){
            bestDistance = d;
            best = port;
        }
    });
    return bestDistance <= 48 ? best : null;
}

function endDrag(event=null){
    const hadContentDrag = Boolean(dragNode || resizeNode || llmPaneDrag || knifeChanged || tempLink);
    const hadViewportDrag = Boolean(dragBoard || minimapDrag);
    const hadKnifeTrail = knifeTrail.length > 1;
    if(dragNode){
        const moved = [dragNode.node, ...(dragNode.children || []).map(c => c.node)].filter(Boolean);
        // 拖动 group/promptGroup 自身时不重新评估（成员跟着一起走，包含关系不变）
        const draggedGroup = moved.some(n => n.type === 'group' || n.type === 'promptGroup');
        if(!draggedGroup) updateGroupMembership(moved);
    }
    dragNode = null;
    dragBoard = null;
    resizeNode = null;
    llmPaneDrag = null;
    knifeActive = false;
    knifePoint = null;
    knifeTrail = [];
    const shouldRenderKnife = knifeNeedsRender;
    knifeChanged = false;
    knifeNeedsRender = false;
    if(!event?.shiftKey) setKnifeMode(false);
    if(textSelectionGuard) textSelectionGuard.active = false;
    document.body.classList.remove('canvas-node-drag', 'canvas-node-resize', 'canvas-selecting', 'canvas-board-pan');
    endWindowPointerSession();
    if(shouldRenderKnife) render();
    else if(hadKnifeTrail) renderLinks();
    flushScheduledGeometryRefresh();
    scheduleMinimapRender();
    if(hadContentDrag) scheduleSave();
    else if(hadViewportDrag) scheduleViewportSave();
    if(hadContentDrag) scheduleViewportRefresh();
}

function nodeRect(n){
    const el = nodesEl.querySelector(`.node[data-id="${n.id}"]`);
    const w = el?.offsetWidth || n.w || 260;
    const h = el?.offsetHeight || n.h || 200;
    return {x:n.x, y:n.y, w, h, cx:n.x + w/2, cy:n.y + h/2};
}

function portPoint(id, kind, nodeById=null){
    const n = nodeById ? nodeById.get(id) : nodes.find(x => x.id === id);
    const el = nodesEl.querySelector(`.node[data-id="${id}"]`);
    if(!n || !el) return {x:0,y:0};
    const port = el.querySelector(`.port.${kind}`);
    if(port){
        const r = port.getBoundingClientRect();
        return screenToWorld(r.left + r.width / 2, r.top + r.height / 2);
    }
    const w = el.offsetWidth || n.w || 260, h = el.offsetHeight || n.h || 160;
    return kind === 'out' ? {x:n.x + w, y:n.y + h / 2} : {x:n.x, y:n.y + h / 2};
}

function renderLinks(nodeIds=null){
    const dirty = nodeIds === null ? null : new Set(nodeIds);
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const points = {in:new Map(), out:new Map()};
    const pointFor = (id, kind) => {
        if(!points[kind].has(id)) points[kind].set(id, portPoint(id, kind, nodeById));
        return points[kind].get(id);
    };
    const liveIds = new Set();
    connections.forEach(c => {
        liveIds.add(c.id);
        let entry = renderedCanvasLinks.get(c.id);
        if(entry && (entry.path.parentNode !== linksEl || entry.hit.parentNode !== linksEl || entry.button.parentNode !== linkControlsEl)){
            entry.path.remove(); entry.hit.remove(); entry.button.remove();
            entry = null;
        }
        if(entry && dirty && entry.from === c.from && entry.to === c.to && !dirty.has(c.from) && !dirty.has(c.to)) return;
        const a = pointFor(c.from, 'out'), b = pointFor(c.to, 'in');
        if(!entry){
            entry = {path:pathEl(a.x, a.y, b.x, b.y, 'link'), hit:linkHitEl(a.x, a.y, b.x, b.y, c.id), button:linkDeleteButton(c, a, b)};
            entry.path.dataset.connectionId = c.id;
            linksEl.appendChild(entry.path);
            linksEl.appendChild(entry.hit);
            linkControlsEl.appendChild(entry.button);
            renderedCanvasLinks.set(c.id, entry);
        } else {
            const d = connectionPathData(a.x, a.y, b.x, b.y);
            entry.path.setAttribute('d', d);
            entry.hit.setAttribute('d', d);
            entry.button.style.left = `${(a.x + b.x) / 2}px`;
            entry.button.style.top = `${(a.y + b.y) / 2}px`;
            entry.button.classList.toggle('visible', isConnectionSelected(c));
            entry.button.classList.toggle('hover', hoveredConnectionId === c.id);
        }
        entry.from = c.from;
        entry.to = c.to;
    });
    for(const [id, entry] of renderedCanvasLinks){
        if(liveIds.has(id)) continue;
        entry.path.remove(); entry.hit.remove(); entry.button.remove();
        renderedCanvasLinks.delete(id);
    }
    linksEl.querySelectorAll('.temp, .knife-trail').forEach(el => el.remove());
    if(tempLink){
        linksEl.appendChild(pathEl(tempLink.x1, tempLink.y1, tempLink.x2, tempLink.y2, 'link temp'));
    }
    renderKnifeTrail();
}

function renderKnifeTrail(){
    if(!knifeActive || knifeTrail.length < 2) return;
    const poly = document.createElementNS('http://www.w3.org/2000/svg','polyline');
    poly.setAttribute('points', knifeTrail.map(p => `${p.x},${p.y}`).join(' '));
    poly.setAttribute('class', 'link knife-trail');
    linksEl.appendChild(poly);
}

function linkDeleteButton(connection, a, b){
    const btn = document.createElement('button');
    btn.className = `link-delete ${isConnectionSelected(connection) ? 'visible' : ''} ${hoveredConnectionId === connection.id ? 'hover' : ''}`;
    btn.type = 'button';
    btn.title = tr('canvas.deleteLink');
    btn.setAttribute('aria-label', tr('canvas.deleteLink'));
    btn.dataset.connectionId = connection.id;
    btn.style.left = `${(a.x + b.x) / 2}px`;
    btn.style.top = `${(a.y + b.y) / 2}px`;
    btn.textContent = '×';
    btn.onclick = e => deleteConnection(connection.id, e);
    return btn;
}

function linkHitEl(x1,y1,x2,y2,id){
    const p = pathEl(x1, y1, x2, y2, 'link-hit');
    p.dataset.connectionId = id;
    return p;
}

function setHoveredConnection(id){
    if(hoveredConnectionId === id) return;
    const oldId = hoveredConnectionId;
    hoveredConnectionId = id || '';
    if(oldId){
        const oldBtn = linkControlsEl.querySelector(`[data-connection-id="${CSS.escape(oldId)}"]`);
        if(oldBtn) oldBtn.classList.remove('hover');
    }
    if(hoveredConnectionId){
        const btn = linkControlsEl.querySelector(`[data-connection-id="${CSS.escape(hoveredConnectionId)}"]`);
        if(btn) btn.classList.add('hover');
    }
}

function connectionDistanceToPoint(connection, point, from=portPoint(connection.from, 'out'), to=portPoint(connection.to, 'in'), maxDistance=Infinity){
    // A Bezier curve (and its sampled segments) stays inside its control-point bounds.
    // Include both control points: short/backward links can bend beyond their endpoints.
    const dx = Math.max(80, Math.abs(to.x - from.x) * .45);
    if(point.x < Math.min(from.x, from.x + dx, to.x - dx, to.x) - maxDistance
        || point.x > Math.max(from.x, from.x + dx, to.x - dx, to.x) + maxDistance
        || point.y < Math.min(from.y, to.y) - maxDistance
        || point.y > Math.max(from.y, to.y) + maxDistance) return Infinity;
    let min = Infinity;
    let prev = cubicPoint(from, to, 0);
    for(let i = 1; i <= 28; i++){
        const cur = cubicPoint(from, to, i / 28);
        min = Math.min(min, pointSegmentDistance(point, prev, cur));
        prev = cur;
    }
    return min;
}

function clearConnectionHover(){
    if(connectionHoverFrame !== null) cancelAnimationFrame(connectionHoverFrame);
    connectionHoverFrame = null;
    pendingConnectionHover = null;
    setHoveredConnection('');
}

function scheduleConnectionHover(e){
    if(!canvas || tempLink || dragNode || dragBoard || resizeNode || knifeActive){
        clearConnectionHover();
        return;
    }
    pendingConnectionHover = {clientX:e.clientX, clientY:e.clientY, canvasId:canvas.id};
    if(connectionHoverFrame !== null) return;
    connectionHoverFrame = requestAnimationFrame(() => {
        connectionHoverFrame = null;
        const latest = pendingConnectionHover;
        pendingConnectionHover = null;
        if(latest && canvas?.id === latest.canvasId) updateConnectionHoverFromMouse(latest);
        else setHoveredConnection('');
    });
}

function updateConnectionHoverFromMouse(e){
    if(!canvas || tempLink || dragNode || dragBoard || resizeNode || knifeActive){
        setHoveredConnection('');
        return;
    }
    const button = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.link-delete');
    if(button?.dataset.connectionId){
        setHoveredConnection(button.dataset.connectionId);
        return;
    }
    if(!connections.length){
        setHoveredConnection('');
        return;
    }
    const point = screenToWorld(e.clientX, e.clientY);
    const threshold = Math.max(12, 16 / viewport.scale);
    let bestId = '';
    let best = Infinity;
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const portPoints = {in:new Map(), out:new Map()};
    const pointFor = (id, kind) => {
        const cache = portPoints[kind];
        if(!cache.has(id)) cache.set(id, portPoint(id, kind, nodeById));
        return cache.get(id);
    };
    connections.forEach(c => {
        const d = connectionDistanceToPoint(c, point, pointFor(c.from, 'out'), pointFor(c.to, 'in'), threshold);
        if(d < best){ best = d; bestId = c.id; }
    });
    setHoveredConnection(best <= threshold ? bestId : '');
}

function isConnectionSelected(connection){
    return selected.has(connection.from) || selected.has(connection.to);
}

function refreshSelectionVisuals(){
    nodesEl.querySelectorAll('.node').forEach(el => {
        el.classList.toggle('selected', selected.has(el.dataset.id));
    });
    renderLinks();
    renderSelectionHub();
    if(workflowTransferModal?.classList.contains('open')) updateWorkflowTransferMeta();
    scheduleMinimapRender();
}

function connectionPathData(x1,y1,x2,y2){
    const dx = Math.max(80, Math.abs(x2 - x1) * .45);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function pathEl(x1,y1,x2,y2,cls){
    const p = document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d', connectionPathData(x1,y1,x2,y2));
    p.setAttribute('class', cls);
    return p;
}

function pointSegmentDistance(p, a, b){
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if(!len2) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

function segmentsIntersect(a, b, c, d){
    const orient = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const onSeg = (p, q, r) => Math.min(p.x, r.x) <= q.x && q.x <= Math.max(p.x, r.x) && Math.min(p.y, r.y) <= q.y && q.y <= Math.max(p.y, r.y);
    const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
    if(o1 === 0 && onSeg(a, c, b)) return true;
    if(o2 === 0 && onSeg(a, d, b)) return true;
    if(o3 === 0 && onSeg(c, a, d)) return true;
    if(o4 === 0 && onSeg(c, b, d)) return true;
    return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

function segmentIntersectsRect(a, b, r){
    if(a.x >= r.x && a.x <= r.x + r.w && a.y >= r.y && a.y <= r.y + r.h) return true;
    if(b.x >= r.x && b.x <= r.x + r.w && b.y >= r.y && b.y <= r.y + r.h) return true;
    const p1 = {x:r.x, y:r.y}, p2 = {x:r.x + r.w, y:r.y}, p3 = {x:r.x + r.w, y:r.y + r.h}, p4 = {x:r.x, y:r.y + r.h};
    return segmentsIntersect(a, b, p1, p2) || segmentsIntersect(a, b, p2, p3) || segmentsIntersect(a, b, p3, p4) || segmentsIntersect(a, b, p4, p1);
}

function cubicPoint(a, b, t){
    const dx = Math.max(80, Math.abs(b.x - a.x) * .45);
    const p1 = {x:a.x + dx, y:a.y};
    const p2 = {x:b.x - dx, y:b.y};
    const u = 1 - t;
    return {
        x:u*u*u*a.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*b.x,
        y:u*u*u*a.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*b.y
    };
}

function knifeHitsConnection(a, b, connection){
    const from = portPoint(connection.from, 'out');
    const to = portPoint(connection.to, 'in');
    const threshold = Math.max(8, 12 / viewport.scale);
    let prev = cubicPoint(from, to, 0);
    for(let i = 1; i <= 28; i++){
        const cur = cubicPoint(from, to, i / 28);
        if(segmentsIntersect(a, b, prev, cur) || pointSegmentDistance(prev, a, b) <= threshold || pointSegmentDistance(cur, a, b) <= threshold) return true;
        prev = cur;
    }
    return false;
}

function applyKnifeCut(from, to){
    if(isCanvasLockedByOther()) return;
    if(!canvas || !connections.length || !from || !to) return;
    const nodeHits = new Set();
    nodes.forEach(n => {
        const el = nodesEl.querySelector(`.node[data-id="${n.id}"]`);
        if(!el) return;
        const r = nodeRect(n);
        if(segmentIntersectsRect(from, to, r)) nodeHits.add(n.id);
    });
    const next = connections.filter(c => !nodeHits.has(c.from) && !nodeHits.has(c.to) && !knifeHitsConnection(from, to, c));
    if(next.length === connections.length) return;
    if(!knifeChanged) pushUndo();
    knifeChanged = true;
    connections = next;
    syncGeneratorInputs();
    refreshGeneratorInputViews();
    knifeNeedsRender = true;
    renderLinks();
    renderSelectionHub();
    scheduleSave();
}

function setKnifeMode(active){
    if(active && isCanvasLockedByOther()) active = false;
    const needsCleanup = knifeActive || knifePoint || knifeTrail.length
        || knifeChanged || knifeNeedsRender || document.body.classList.contains('canvas-knife');
    document.body.classList.toggle('canvas-knife', Boolean(active && canvas));
    if(!active && needsCleanup){
        knifeActive = false;
        knifePoint = null;
        knifeTrail = [];
        knifeChanged = false;
        knifeNeedsRender = false;
        renderLinks();
    }
}

function startKnifeDrag(e){
    if(isCanvasLockedByOther()) return false;
    if(!canvas || e.button !== 0 || !e.shiftKey || isEditableTarget(e.target)) return false;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
    closeCreateMenu();
    setKnifeMode(true);
    knifeActive = true;
    knifeChanged = false;
    knifeNeedsRender = false;
    knifePoint = screenToWorld(e.clientX, e.clientY);
    knifeTrail = [knifePoint];
    renderLinks();
    startWindowPointerSession(continueKnifeDrag, endDrag);
    return true;
}

function continueKnifeDrag(e){
    if(!canvas || !knifeActive) return;
    if(!e.shiftKey){
        setKnifeMode(false);
        return;
    }
    const point = screenToWorld(e.clientX, e.clientY);
    if(knifePoint) applyKnifeCut(knifePoint, point);
    knifePoint = point;
    knifeTrail.push(point);
    if(knifeTrail.length > 120) knifeTrail = knifeTrail.slice(-120);
    renderLinks();
}

function isEditableTarget(target){
    const tag = target?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable || target?.closest?.('select, option');
}

function canvasHistoryShortcutAction(event){
    if(!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return '';
    const key = String(event.key || '').toLowerCase();
    const isZ = key === 'z' || event.code === 'KeyZ';
    const isY = key === 'y' || event.code === 'KeyY';
    if(isZ) return event.shiftKey ? 'redo' : 'undo';
    if(isY) return 'redo';
    return '';
}

function handleCanvasHistoryShortcut(event){
    const action = canvasHistoryShortcutAction(event);
    if(!action || !canvas) return;
    if(isEditableTarget(event.target) || isEditableTarget(document.activeElement)) return;
    event.preventDefault();
    event.stopPropagation();
    if(isCanvasLockedByOther()){
        setStatus(`画布正被其他人编辑中，无法${action === 'undo' ? '撤销' : '重做'}`);
        return;
    }
    const changed = action === 'undo' ? performUndo() : performRedo();
    if(!changed) setStatus(action === 'undo' ? '没有可撤销的操作' : '没有可重做的操作');
}

// Called once by canvas.js, at its original initialization position.
function bindClassicMinimapEvents(){
    minimap?.addEventListener('mousedown', e => {
        if(!canvas || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        minimapDrag = true;
        centerViewportOnWorldPoint(minimapEventToWorld(e));
        startWindowPointerSession(e2 => {
            if(minimapDrag) centerViewportOnWorldPoint(minimapEventToWorld(e2));
        }, () => {
            minimapDrag = false;
            scheduleViewportSave();
        });
    });
}

function startBoardPan(e, opts={}){
    if(!canvas) return false;
    if(isEditableTarget(e.target) || e.target.closest?.('#createMenu, #linkCreateMenu, #nodeInputMenu, #nodeOutputMenu, #imageNodeMenu, .minimap')) return false;
    e.preventDefault();
    e.stopPropagation();
    closeCreateMenu();
    if(document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    dragBoard = {sx:e.clientX, sy:e.clientY, ox:viewport.x, oy:viewport.y, moved:false, clearSelectionOnClick:Boolean(opts.clearSelectionOnClick)};
    document.body.classList.add('canvas-board-pan');
    startWindowPointerSession(e2 => {
        if(Math.hypot(e2.clientX - dragBoard.sx, e2.clientY - dragBoard.sy) > 4) dragBoard.moved = true;
        viewport.x = dragBoard.ox + e2.clientX - dragBoard.sx;
        viewport.y = dragBoard.oy + e2.clientY - dragBoard.sy;
        applyViewport({viewportOnly:true});
    }, e2 => {
        const shouldClearSelection = dragBoard?.clearSelectionOnClick && !dragBoard.moved && selected.size;
        if(shouldClearSelection){
            selected.clear();
            refreshSelectionVisuals();
        }
        endDrag(e2);
    });
    return true;
}

// Called once by canvas.js, at its original initialization position.
function bindClassicBoardEvents(){
    board.onmousedown = e => {
        if(!canvas) return;
        if(e.button === 1){
            startBoardPan(e);
            return;
        }
        if(e.button !== 0) return;
        if(startKnifeDrag(e)) return;
        // Dismiss any open native select dropdown
        if(document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
        if(e.target !== board && e.target !== world && e.target !== nodesEl && e.target !== linksEl) return;
        closeCreateMenu();
        if(isRKeyDown){
            e.preventDefault();
            startSelection(e);
            return;
        }
        if(e.ctrlKey || e.metaKey){
            e.preventDefault();
            startSelection(e);
            return;
        }
        startBoardPan(e, {clearSelectionOnClick:true});
    };
    board.addEventListener('mousemove', e => {
        const point = screenToWorld(e.clientX, e.clientY);
        lastMouseBoard = point;
        scheduleConnectionHover(e);
        if(canvas && knifeActive && !isEditableTarget(e.target) && !dragNode && !dragBoard && !resizeNode && !tempLink){
            continueKnifeDrag(e);
        } else if(!e.shiftKey) {
            setKnifeMode(false);
        }
    });
    board.addEventListener('mouseleave', clearConnectionHover);
    board.ondblclick = null;
    board.oncontextmenu = e => {
        if(!canvas) return;
        if((e.ctrlKey || e.metaKey) || isRKeyDown){
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        if(e.target !== board && e.target !== world && e.target !== nodesEl && e.target !== linksEl) return;
        e.preventDefault();
        e.stopPropagation();
        if(isCanvasLockedByOther()){
            setStatus('画布正被其他人编辑中，无法操作');
            return;
        }
        openCreateMenu(e.clientX, e.clientY);
    };
    board.addEventListener('mousedown', e => {
        if(e.target.closest?.('#createMenu, #linkCreateMenu, #nodeInputMenu, #nodeOutputMenu, #imageNodeMenu')) return;
        closeCreateMenu();
    });
    board.onwheel = e => {
        if(!canvas) return;
        e.preventDefault();
        const before = screenToWorld(e.clientX, e.clientY);
        viewport.scale = viewport.scale * (e.deltaY > 0 ? .92 : 1.08);
        const rect = board.getBoundingClientRect();
        viewport.x = e.clientX - rect.left - before.x * viewport.scale;
        viewport.y = e.clientY - rect.top - before.y * viewport.scale;
        applyViewport({viewportOnly:true});
        scheduleGeometryRefresh();
        scheduleViewportSave();
    };
}

// Called once by canvas.js, at its original initialization position.
function bindClassicKeyboardEvents(){
    window.addEventListener('keydown', handleCanvasHistoryShortcut, true);
    window.addEventListener('keydown', e => {
        if(!canvas) return;
        if(String(e.key || '').toLowerCase() === 'r' && !isEditableTarget(e.target)) isRKeyDown = true;
        if(e.key === 'Shift' && !isEditableTarget(document.activeElement)) setKnifeMode(true);
        if(e.key === 'Escape' && document.getElementById('imageEditModal').classList.contains('open')) { closeImageEditor(); return; }
        if(e.key === 'Escape' && promptTemplateModal?.classList.contains('open')) { closePromptTemplateModal(); return; }
        if(outputLightbox.classList.contains('open') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')){
            if(navigateOutputLightbox(e.key === 'ArrowRight' ? 1 : -1)){
                e.preventDefault();
                e.stopPropagation();
            }
            return;
        }
        if(e.key === 'Escape' && outputLightbox.classList.contains('open')) { closeOutputLightbox(); return; }
        if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') { e.preventDefault(); groupSelectedImages(); }
        if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
            // 在输入框/可编辑元素里时，让浏览器原生 Ctrl+C 工作
            const tag = document.activeElement?.tagName;
            if(tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
            // 用户在页面任意位置选中了文本时，也不要拦截
            const sel = window.getSelection && window.getSelection();
            if(sel && sel.toString().length > 0) return;
            e.preventDefault();
            copySelectedNodes();
        }
        if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
            const tag = document.activeElement?.tagName;
            if(tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
            if(clipboardNodeCount()) {
                const pasteRequestedAt = Date.now();
                setTimeout(() => {
                    if(!canvas) return;
                    if(lastImagePasteAt >= pasteRequestedAt) return;
                    pasteNodes();
                }, 90);
            }
        }
        if(e.key === 'Delete' || e.key === 'Backspace') {
            const tag = document.activeElement?.tagName;
            if(tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
            if(selected.size === 0) return;
            e.preventDefault();
            deleteSelectedNodes();
        }
    });
    window.addEventListener('keyup', e => {
        if(String(e.key || '').toLowerCase() === 'r') isRKeyDown = false;
        if(e.key === 'Shift') setKnifeMode(false);
    });
    window.addEventListener('blur', () => { isRKeyDown = false; setKnifeMode(false); });
}

// Called once by canvas.js, at its original initialization position.
function bindClassicSelectionBlur(){
    window.addEventListener('blur', () => {
        if(selectDrag){
            selectionBox.style.display = 'none';
            selectDrag = null;
            document.body.classList.remove('canvas-selecting');
            endWindowPointerSession();
        }
    });
}

function promptCounterHtml(text){
    const count = promptTextLength(text);
    const over = count > PROMPT_TEXT_MAX_LENGTH;
    return `<div class="prompt-counter ${over ? 'over' : ''} ${count >= PROMPT_TEXT_MAX_LENGTH * 0.9 ? 'near-limit' : ''}"><span>${count.toLocaleString()}</span><span>/ ${PROMPT_TEXT_MAX_LENGTH.toLocaleString()}</span></div>`;
}

function retryBarHtml(node){
    // 只在一键运行模式中失败才显示；普通单节点失败直接弹 alert，不显示这条
    if(node.runStatus !== 'failed' || !node._cascadeFailed) return '';
    return `<div class="node-retry-bar" data-retry-bar>
        <span class="node-retry-msg" title="${escapeAttr(node.runError||'')}">${escapeHtml((node.runError||tr('canvas.generationFailed')).slice(0,60))}</span>
        <button class="node-retry-btn" type="button" data-retry="${node.id}">重试</button>
        <button class="node-stop-btn" type="button" data-stop="${node.id}">停止</button>
    </div>`;
}

// Called once by canvas.js, at its original initialization position.
function bindClassicCardMenuDismissal(){
    document.addEventListener('click', event => { if(!event.target.closest('.studio-card-menu')) document.querySelectorAll('.studio-card-menu[open]').forEach(menu => {menu.open=false;}); });

    document.addEventListener('scroll', event => { if(event.target instanceof Element && event.target.closest('.studio-card-menu-items')) return; document.querySelectorAll('.studio-card-menu[open]').forEach(menu => {menu.open=false;}); }, true);
    window.addEventListener('resize', () => document.querySelectorAll('.studio-card-menu[open]').forEach(menu => {menu.open=false;}));
}
