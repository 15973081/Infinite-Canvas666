/* Smart canvas: Media previews/downloads, generation history and billing presentation.
 * Browser classic script (not an ES module); loaded before smart-canvas.js.
 * Function declarations only: initialization is explicitly invoked by the entry.
 * Uses the entry's existing shared bindings; do not duplicate permission or document state.
 */

function openSmartVideoLightbox(nodeId, imageIndex=0){
    const node = nodes.find(n => n.id === nodeId);
    const index = Math.max(0, Number(imageIndex) || 0);
    const image = node?.images?.[index];
    if(mediaKindForItem(image || {}) !== 'video') return false;
    selectedId = nodeId;
    selectedIds = [];
    selectedImage = {nodeId, index};
    hideRunTimerForNode(node);
    openImagePreview(nodeId, index);
    return true;
}

function releaseSmartAudioLightboxPlayer(){
    const audio = smartAudioLightboxHost?.querySelector('audio');
    if(audio){
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
    }
    smartAudioLightboxHost?.replaceChildren();
}

function openSmartAudioLightbox(nodeId, imageIndex=0){
    const node = nodes.find(n => n.id === nodeId);
    const index = Math.max(0, Number(imageIndex) || 0);
    const image = node?.images?.[index];
    if(mediaKindForItem(image || {}) !== 'audio' || !image?.url) return false;
    if(imageEditModal.classList.contains('open')) closeImageEditor();
    selectedId = nodeId;
    selectedIds = [];
    selectedImage = {nodeId, index};
    hideRunTimerForNode(node);
    smartAudioLightboxState = {nodeId, index};
    smartAudioLightboxTitle.textContent = image.name || fileNameFromUrl(image.url) || 'Audio';
    releaseSmartAudioLightboxPlayer();
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'metadata';
    audio.src = image.url;
    smartAudioLightboxHost.replaceChildren(audio);
    smartAudioLightbox.classList.add('open');
    refreshIcons();
    return true;
}

function closeSmartAudioLightbox(){
    smartAudioLightbox.classList.remove('open');
    releaseSmartAudioLightboxPlayer();
    smartAudioLightboxTitle.textContent = 'Audio';
    smartAudioLightboxState = {nodeId:'', index:-1};
}

function downloadSmartAudioLightbox(){
    const node = nodes.find(n => n.id === smartAudioLightboxState.nodeId);
    const image = node?.images?.[smartAudioLightboxState.index];
    if(mediaKindForItem(image || {}) === 'audio') downloadPreviewFile(image);
}

function smartRunTaskLabel(run){
    const s = run?.settings || {};
    if(run?.kind === 'video') return s.videoModel || 'Video';
    if(s.engine === 'comfy'){
        if(s.comfyMode === 'custom') return s.comfyWorkflow || 'ComfyUI';
        const labels = {text:tr('canvas.comfyModeText') || '文生图', enhance:tr('canvas.comfyModeEnhance') || '图片增强', edit:tr('canvas.comfyModeEdit') || '图片编辑'};
        return labels[s.comfyMode || 'text'] || 'ComfyUI';
    }
    if(s.engine === 'modelscope'){
        return s.msgenModel === 'custom' ? (s.msCustomModel || 'Modelscope') : (MS_GEN_MODELS[s.msgenModel]?.label || s.msgenModel || 'Modelscope');
    }
    return s.model || 'API Image';
}

function outputUrlLooksVideo(url){
    return /\.(mp4|webm|mov|m4v)(\?|$)/.test(String(url || '').toLowerCase());
}

function proxiedMediaUrl(itemOrUrl, name=''){
    const url = typeof itemOrUrl === 'string' ? itemOrUrl : (itemOrUrl?.url || '');
    if(!url || String(url).startsWith('/assets/') || String(url).startsWith('/output/') || String(url).startsWith('data:') || String(url).startsWith('blob:')) return window.MemberMediaUrl ? window.MemberMediaUrl(url) : url;
    const filename = name || (typeof itemOrUrl === 'object' ? (itemOrUrl.name || '') : '') || fileNameFromUrl(url) || 'preview';
    return `/api/download-output?inline=1&url=${encodeURIComponent(url)}&name=${encodeURIComponent(filename)}`;
}

function displayMediaUrl(itemOrUrl, name=''){
    const url = typeof itemOrUrl === 'string' ? itemOrUrl : (itemOrUrl?.url || '');
    if(/^https?:\/\//i.test(String(url || ''))) return proxiedMediaUrl(itemOrUrl, name);
    return window.MemberMediaUrl ? window.MemberMediaUrl(url) : url;
}

function bindImageProxyFallback(imgEl, itemOrUrl){
    if(!imgEl || imgEl.dataset.proxyFallbackBound === '1') return;
    imgEl.dataset.proxyFallbackBound = '1';
    imgEl.addEventListener('error', () => {
        if(imgEl.dataset.mediaPriorityPaused || imgEl.dataset.canvasMediaSrc) return;
        if(imgEl.dataset.smartGroupSrc && !imgEl.hasAttribute('src')) return;
        if(imgEl.dataset.proxyFallbackTried === '1') return;
        const fallback = proxiedMediaUrl(itemOrUrl);
        if(!fallback || fallback === imgEl.getAttribute('src')) return;
        imgEl.dataset.proxyFallbackTried = '1';
        imgEl.src = fallback;
    });
}

function safeExportFileName(name, fallback='download.zip'){
    return window.CanvasCore?.safeFileName(name, fallback) || fallback;
}

function fileNameFromUrl(url=''){
    return window.CanvasCore?.fileNameFromUrl(url) || '';
}

function extensionForMediaItem(item, fallback='.png'){
    const source = [item?.name, item?.url].map(value => String(value || '').split('?')[0].split('#')[0]).find(value => /\.[a-z0-9]{2,8}$/i.test(value));
    if(source) return source.match(/(\.[a-z0-9]{2,8})$/i)?.[1] || fallback;
    const kind = mediaKindForItem(item);
    if(kind === 'video') return '.mp4';
    if(kind === 'audio') return '.mp3';
    if(kind === 'text') return '.txt';
    return fallback;
}

function downloadNameForMediaItem(item, fallbackPrefix='canvas-output'){
    const localName = fileNameFromUrl(item?.url || '');
    const preferred = localName || item?.name || '';
    const ext = extensionForMediaItem(item);
    const randomName = `${fallbackPrefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}${ext}`;
    let name = safeExportFileName(preferred || randomName, randomName);
    if(!/\.[a-z0-9]{2,8}$/i.test(name)) name += ext;
    return name;
}

function downloadPreviewImage(){
    const node = nodes.find(n => n.id === previewNavState.nodeId);
    const image = node?.images?.[previewNavState.index];
    if(!image?.url) return;
    const name = downloadNameForMediaItem(image, 'image');
    try{if(window.MemberMediaDownload?.(image.url,name))return;}catch(error){toast(error.message || 'Download failed');return;}
    const link = document.createElement('a');
    link.href = `/api/download-output?url=${encodeURIComponent(image.url)}&name=${encodeURIComponent(name)}`;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
}

function downloadPreviewFile(item){
    if(!item?.url) return;
    const name = downloadNameForMediaItem(item, 'output');
    try{if(window.MemberMediaDownload?.(item.url,name))return;}catch(error){toast(error.message || 'Download failed');return;}
    const link = document.createElement('a');
    link.href = `/api/download-output?url=${encodeURIComponent(item.url)}&name=${encodeURIComponent(name)}`;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
}

function previewDownloadGroupItems(){
    const node = nodes.find(n => n.id === previewNavState.nodeId);
    return (node?.images || [])
        .filter(item => item?.url)
        .map((item, index) => ({...item, __index:index}))
        .sort((a, b) => {
            const ga = a.grid || {};
            const gb = b.grid || {};
            const rowDiff = Number(ga.row ?? a.__index) - Number(gb.row ?? b.__index);
            if(rowDiff) return rowDiff;
            const colDiff = Number(ga.col ?? a.__index) - Number(gb.col ?? b.__index);
            return colDiff || a.__index - b.__index;
        });
}

async function downloadPreviewGroup(){
    const node = nodes.find(n => n.id === previewNavState.nodeId);
    const items = previewDownloadGroupItems();
    if(!items.length) return;
    try {
        const filename = safeExportFileName(`${node?.title || 'image-group'}.zip`, 'image-group.zip');
        const response = await fetch('/api/canvas-assets/download', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
                filename,
                urls:items.map(item => item.url).filter(Boolean),
                items:items.map((item, index) => ({url:item.url, name:downloadNameForMediaItem(item, `image-${String(index + 1).padStart(2, '0')}`)}))
            })
        });
        if(!response.ok) throw new Error((await response.text()) || '批量下载失败');
        const blob = await response.blob();
        const href = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = href;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(href), 1200);
    } catch(e) {
        toast((e.message || '批量下载失败').slice(0, 160));
    }
}

function smartRunPlatformLabel(run){
    const s = run?.settings || {};
    if(s.engine === 'comfy') return 'ComfyUI';
    if(s.engine === 'modelscope') return 'Modelscope';
    if(run?.kind === 'video') return videoProviderById(s.videoProvider || '')?.name || s.videoProvider || 'Video';
    return apiProviderById(s.provider_id || '')?.name || s.provider_id || 'API';
}

function smartRunRequestMeta(run){
    const s = run?.settings || {};
    if(s.engine === 'comfy') return {workflow_json:s.comfyWorkflow || '', mode:s.comfyMode || 'text'};
    if(s.engine === 'modelscope') return {backend:'Modelscope', model:s.msgenModel || '', custom_model:s.msCustomModel || ''};
    if(run?.kind === 'video') return {provider_id:s.videoProvider || 'comfly', model:s.videoModel || '', duration:s.videoDuration || '', aspect_ratio:s.videoAspect || '', resolution:s.videoResolution || ''};
    return {provider_id:s.provider_id || '', model:s.model || '', size:run?.size || '', quality:s.quality || '', n:s.count || 1};
}

function smartRunSnapshot(node, prompt, refs=[], kind='image'){
    const settingsSnapshot = cloneSmartSettings(settings);
    return {
        nodeId:node?.id || '',
        nodeType:node?.type || 'smart-image',
        kind,
        settings:settingsSnapshot,
        prompt:prompt || '',
        refs:(refs || []).map(ref => ({url:ref.url || '', name:ref.name || 'image', kind:ref.kind || ''})).filter(ref => ref.url),
        size: kind === 'image' && isApiLikeEngine(settingsSnapshot.engine) ? sizeForRun(settingsSnapshot) : ''
    };
}

function smartModelPriceAt(providerId, kind, model, createdAt){
    const provider = apiProviders.find(item => item.id === providerId);
    const at = Number(createdAt || Date.now());
    return (provider?.model_prices || [])
        .filter(price => price.kind === kind && price.model === model
            && Number(price.effective_from || 0) <= at
            && (!Number(price.effective_to || 0) || at < Number(price.effective_to)))
        .sort((a, b) => Number(b.effective_from || 0) - Number(a.effective_from || 0))[0] || null;
}

function smartBillingIdentity(run={}, log={}){
    const s = run.settings || {};
    const kind = log.billingKind || run.kind || '';
    let providerId = log.providerId || log.request?.provider_id || '';
    let model = log.billingModel || log.request?.model || '';
    if(!run.settings && String(log.platform || '').toLowerCase() === 'modelscope'){
        providerId = providerId || 'modelscope';
        model = MS_GEN_MODELS[model]?.modelId || log.request?.custom_model || model;
    }
    if(!providerId && s.engine === 'modelscope') providerId = 'modelscope';
    if(!model && s.engine === 'modelscope') model = s.msgenModel === 'custom' ? s.msCustomModel : MS_GEN_MODELS[s.msgenModel]?.modelId;
    if(!providerId && kind === 'video') providerId = s.videoProvider || 'comfly';
    if(!model && kind === 'video') model = s.videoModel || '';
    if(!providerId) providerId = s.provider_id || '';
    if(!model) model = s.model || log.model || '';
    if(!providerId && log.platform) providerId = apiProviders.find(item => item.name === log.platform || item.id === log.platform)?.id || '';
    return {kind, providerId, model};
}

function historicalSmartVideoDuration(log){
    const urls = new Set((log.outputs || []).map(item => typeof item === 'string' ? item : item?.url || '').filter(Boolean));
    // ponytail: linear history scan; index by output URL only if very large canvases make this slow.
    for(const node of nodes || []) for(const item of node.images || []){
        const url = typeof item === 'string' ? item : item?.url || '';
        if(!urls.has(url)) continue;
        const duration = Number(node.runSettings?.videoDuration || node.settings?.videoDuration || 0);
        if(duration > 0) return duration;
    }
    return 0;
}

function smartVideoDurationSeconds(url){
    return new Promise(resolve => {
        if(!url) return resolve(0);
        const video = document.createElement('video');
        let settled = false;
        const done = value => { if(settled) return; settled = true; clearTimeout(timer); video.removeAttribute('src'); video.load(); resolve(value); };
        const timer = setTimeout(() => done(0), 8000);
        video.preload = 'metadata';
        video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? Math.max(1, Math.round(video.duration)) : 0);
        video.onerror = () => done(0);
        video.src = url;
    });
}

async function backfillSmartHistoricalVideoCosts(){
    if(smartVideoCostBackfillRunning || !canvas) return;
    const logs = (canvas.logs || []).filter(log => log.status !== 'failed' && smartBillingIdentity({}, log).kind === 'video' && !Number(log.durationSeconds || 0)
        && window.VolcengineVideoBilling?.costFor({}, log, smartBillingIdentity({}, log), apiProviders) === undefined);
    if(!logs.length) return;
    smartVideoCostBackfillRunning = true;
    let changed = false;
    try {
        for(const log of logs){
            const stored = Number(log.request?.duration || historicalSmartVideoDuration(log));
            const output = (log.outputs || []).map(item => typeof item === 'string' ? item : item?.url || '').find(Boolean);
            const duration = stored > 0 ? stored : await smartVideoDurationSeconds(output);
            if(duration <= 0) continue;
            log.durationSeconds = duration;
            log.cost = calculateSmartGenerationCost({log, outputs:log.outputs || [], createdAt:log.createdAt, source:'estimated'});
            changed = true;
        }
        if(changed){ scheduleSave(); renderSmartCanvasLog(); }
    } finally {
        smartVideoCostBackfillRunning = false;
    }
}

function calculateSmartGenerationCost({run={}, log={}, outputs=[], createdAt=Date.now(), source='actual'}){
    const identity = smartBillingIdentity(run, log);
    const volcCost = window.VolcengineVideoBilling?.costFor(run, log, identity, apiProviders);
    if(volcCost !== undefined) return volcCost;
    if(log.status === 'failed') return null;
    if(!identity.kind || !identity.providerId || !identity.model) return {status:'unknown', source, ...identity};
    if(apiProviders.find(p=>p.id===identity.providerId)?.billing_authority==='server') return {status:'unknown', source, ...identity, reason:'awaiting_server_ledger'};
    const price = smartModelPriceAt(identity.providerId, identity.kind, identity.model, createdAt);
    if(!price) return {status:'unknown', source, ...identity};
    let quantity = 1;
    if(price.billing_type === 'per_image') quantity = Math.max(1, outputs.length);
    if(price.billing_type === 'per_second'){
        quantity = Number(log.durationSeconds || run.settings?.videoDuration || log.request?.duration || historicalSmartVideoDuration(log));
        if(quantity <= 0) return {status:'unknown', source, ...identity};
    }
    const unitPriceMicros = Math.round(Number(price.unit_price || 0) * 1000000);
    return {status:'priced', source, ...identity, billing_type:price.billing_type, quantity, unit_price:String(price.unit_price), currency:price.currency || 'CNY', amount_micros:Math.round(unitPriceMicros * quantity), price_effective_from:Number(price.effective_from || 0)};
}

function smartGenerationLogCost(log){
    if(log?._ledger) return log._ledger_cost?.status === 'excluded' ? null : log._ledger_cost;
    const volcCost = window.VolcengineVideoBilling?.costFor({}, log, smartBillingIdentity({}, log), apiProviders);
    if(volcCost !== undefined) return volcCost;
    if(log?.status === 'failed') return null;
    if(log?.cost?.status === 'priced') return log.cost;
    return calculateSmartGenerationCost({log, outputs:log.outputs || [], createdAt:log.createdAt, source:'estimated'});
}

function formatSmartCost(value){
    return `¥${new Intl.NumberFormat('zh-CN', {minimumFractionDigits:2, maximumFractionDigits:6}).format(Number(value || 0) / 1000000)}`;
}

function smartCanvasCostTotals(logs=canvas?.logs || []){
    if(arguments.length === 0 && canvas?.id && window.CanvasLedger){
        const ledger = window.CanvasLedger.view(canvas.id);
        if(ledger.allTotals) return ledger.allTotals;
    }
    return logs.reduce((sum, log) => {
        const cost = smartGenerationLogCost(log);
        if(cost?.status === 'priced'){
            sum.total += Number(cost.amount_micros || 0);
            sum[cost.kind] = (sum[cost.kind] || 0) + Number(cost.amount_micros || 0);
            sum.calls += 1;
            if(cost.source === 'estimated') sum.estimated += Number(cost.amount_micros || 0);
        } else if(cost?.status === 'unknown') sum.unknown += 1;
        return sum;
    }, {total:0, image:0, video:0, estimated:0, unknown:0, calls:0});
}

function updateSmartCanvasCostButton(totals=smartCanvasCostTotals()){
    const label = document.getElementById('smartCostToggleLabel');
    const button = document.getElementById('smartCostToggle');
    if(label) label.textContent = `费用 ${formatSmartCost(totals.total)}`;
    if(button) button.title = totals.unknown ? `费用仪表盘 · ${totals.unknown} 笔待定价` : '费用仪表盘';
}

function addSmartGenerationLog({run, outputs=[], runMs=0, error=''}) {
    if(!canvas) return;
    canvas.logs = canvas.logs || [];
    const createdAt = Date.now();
    const identity = smartBillingIdentity(run);
    const entry = {
        id:uid('log'),
        canvas_task_id:run?.canvasTaskId || '',
        createdAt,
        status:error ? 'failed' : 'success',
        platform:smartRunPlatformLabel(run),
        nodeType:run?.nodeType || 'smart-image',
        model:smartRunTaskLabel(run),
        providerId:identity.providerId,
        billingKind:identity.kind,
        billingModel:identity.model,
        durationSeconds:Number(run?.video_info?.duration || run?.settings?.videoDuration || 0),
        request:{...smartRunRequestMeta(run), ...(run?.video_info?.task_id ? {task_id:run.video_info.task_id} : {})},
        prompt:run?.prompt || '',
        outputs:(outputs || []).filter(Boolean),
        refs:run?.refs || [],
        runMs:Number(runMs || 0),
        error:error ? String(error) : '',
        ...window.VolcengineVideoBilling?.metadata(run),
    };
    entry.cost = calculateSmartGenerationCost({run, log:entry, outputs:entry.outputs, createdAt});
    canvas.logs = [entry, ...canvas.logs].slice(0, 5000);
    window.CanvasLedger?.record(canvas.id, entry);
    updateSmartCanvasCostButton();
    scheduleSave();
}

function smartLogPreviewNode(url, kind='image'){
    const node = {id:'__smart_log_preview__', type:'smart-image', images:[{url, name:'log-preview', kind}], title:kind === 'video' ? 'Video' : 'Image'};
    const prevSelectedId = selectedId;
    const prevSelectedImage = {...selectedImage};
    detachedEditPreview = {node, index:0, image:node.images[0]};
    nodes.push(node);
    try { openImageEditor(node.id, 0); }
    finally {
        nodes = nodes.filter(n => n.id !== node.id);
        selectedId = prevSelectedId;
        selectedImage = prevSelectedImage;
    }
}

function renderSmartCanvasLog(){
    const ledger = canvas?.id ? window.CanvasLedger?.view(canvas.id) : null;
    const logs = ledger ? ledger.logs : (canvas?.logs || []);
    const totals = ledger ? ledger.totals : smartCanvasCostTotals(logs);
    updateSmartCanvasCostButton(ledger?.allTotals || totals);
    window.CanvasLedger?.mount(smartLogList, canvas?.id);
    const summary = document.getElementById('smartCostSummary');
    if(summary) summary.textContent = `总计 ${formatSmartCost(totals.total)} · 已计费 ${totals.calls} 次${totals.unknown ? ` · 待定价 ${totals.unknown} 笔` : ''}`;
    [['smartCostTotal', formatSmartCost(totals.total)], ['smartCostImage', formatSmartCost(totals.image)], ['smartCostVideo', formatSmartCost(totals.video)], ['smartCostCalls', String(totals.calls)], ['smartCostMeta', totals.estimated ? `含历史预估 ${formatSmartCost(totals.estimated)}` : '按调用时价格快照'], ['smartCostUnknown', `待定价 ${totals.unknown} 笔`]].forEach(([id, value]) => {
        const target = document.getElementById(id);
        if(target) target.textContent = ledger && !ledger.ready ? '读取中…' : value;
    });
    if(summary && ledger && !ledger.ready) summary.textContent = '正在读取全部费用流水…';
    smartLogList.innerHTML = logs.length ? logs.map(log => {
        const thumbs = (log.outputs || []).slice(0, 8).map(item => {
            const url = typeof item === 'string' ? item : (item?.url || '');
            if(!url) return '';
            const mediaItem = typeof item === 'string' ? {url} : item;
            const kind = mediaKindForItem(mediaItem || {url});
            return kind === 'video' ? smartVideoPreviewHtml(item, 256, 'data-kind="video" alt="output"') : smartPreviewImgHtml(item, 256, 'data-kind="image" alt="output"');
        }).join('');
        const date = new Date(log.createdAt || Date.now()).toLocaleString('zh-CN');
        const req = log.request || {};
        const taskId = req.task_id || req.taskId || req.prompt_id || req.promptId || '';
        const backend = req.workflow_json || req.workflow || req.provider_id || req.providerId || req.backend || '';
        const cost = smartGenerationLogCost(log);
        const costAmount = cost?.currency && cost.currency !== 'CNY'
            ? `${cost.currency} ${new Intl.NumberFormat('zh-CN', {maximumFractionDigits:6}).format(Number(cost.amount_micros || 0)/1000000)}`
            : formatSmartCost(cost?.amount_micros);
        const costChip = cost?.status === 'priced'
            ? `<span class="log-chip ${cost.source === 'estimated' ? 'cost-estimated' : ''}" title="${cost.source === 'estimated' ? '根据历史价格回算' : '调用时价格快照'}">${escapeHtml(costAmount)}${cost.source === 'estimated' ? ' 预估' : ''}</span>`
            : cost?.status === 'unknown' ? `<span class="log-chip cost-unknown">${escapeHtml(window.VolcengineVideoBilling?.pendingLabel(cost) || '待核算')}</span>` : '';
        const subParts = [
            date,
            ...(window.VolcengineVideoBilling?.details(log) || []),
            `${'输出'} ${(log.outputs || []).length}`,
            taskId ? `ID ${taskId}` : '',
            backend
        ].filter(Boolean);
        return `<div class="log-item ${log.status === 'failed' ? 'failed' : ''}">
            <div class="log-main">
                <div class="log-meta">
                    <span class="log-chip ${log.status === 'failed' ? 'status-failed' : 'status-ok'}">${escapeHtml(log.status === 'failed' ? tr('canvas.failed') : tr('canvas.success'))}</span>
                    <span class="log-chip">${escapeHtml(log.platform || '-')}</span>
                    ${log.model ? `<span class="log-chip">${escapeHtml(log.model)}</span>` : ''}
                    ${costChip}
                    <span class="log-chip">${escapeHtml(formatRunDuration(log.runMs || 0))}</span>
                </div>
                <div class="log-subline">${subParts.map(part => `<span title="${escapeAttr(part)}">${escapeHtml(part)}</span>`).join('')}</div>
                ${log.error ? `<div class="log-error" title="${escapeAttr(log.error)}">${escapeHtml(log.error)}</div>` : ''}
                <div class="log-prompt" title="${escapeAttr(log.prompt || tr('canvas.noPromptMeta'))}" data-prompt="${escapeAttr(log.prompt || '')}">${escapeHtml(log.prompt || tr('canvas.noPromptMeta'))}</div>
            </div>
            <div class="log-thumbs">${thumbs}</div>
        </div>`;
    }).join('') : `<div class="log-empty">${escapeHtml(tr('canvas.noLogs'))}</div>`;
    bindSmartPreviewImageFallbacks(smartLogList);
    smartLogList.querySelectorAll('[data-url]').forEach(el => {
        el.onclick = e => {
            e.stopPropagation();
            smartLogPreviewNode(el.dataset.url, el.dataset.kind || 'image');
        };
    });
    smartLogList.querySelectorAll('[data-prompt]').forEach(el => {
        el.onclick = e => {
            e.stopPropagation();
            const text = el.dataset.prompt || '';
            if(text) navigator.clipboard?.writeText(text).catch(() => {});
            const oldText = el.textContent;
            el.textContent = tr('canvas.copied');
            el.classList.add('copied');
            setTimeout(() => {
                el.textContent = oldText;
                el.classList.remove('copied');
            }, 900);
        };
    });
    refreshIcons();
    if(!ledger) void backfillSmartHistoricalVideoCosts();
}

function openSmartCanvasLog(mode='logs'){
    if(!canvas) return;
    document.getElementById('smartLogPanel')?.classList.toggle('cost-mode', mode === 'cost');
    const title = document.getElementById('smartLogTitle');
    if(title) title.textContent = mode === 'cost' ? '费用仪表盘' : '生成日志';
    void window.CanvasLedger?.refresh(canvas.id);
    renderSmartCanvasLog();
    smartLogModal.classList.add('open');
}

function openSmartCanvasCost(event){
    event?.preventDefault?.();
    event?.stopPropagation?.();
    openSmartCanvasLog('cost');
}

function closeSmartCanvasLog(){
    smartLogModal.classList.remove('open');
}

// Called once by smart-canvas.js, at its original initialization position.
function bindSmartLedgerUpdates(){
    window.addEventListener('canvas-ledger-updated', event => {
        if(event.detail?.canvasId !== canvas?.id) return;
        updateSmartCanvasCostButton();
        if(document.getElementById('smartLogModal')?.classList.contains('open')) renderSmartCanvasLog();
    });
}

function nowMs(){ return window.CanvasCore?.nowMs() || Date.now(); }

function formatRunDuration(ms){
    const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    const min = Math.floor(total / 60);
    const sec = total % 60;
    return min ? `${min}:${String(sec).padStart(2, '0')}` : `${sec}s`;
}

function nodeRunElapsedMs(node){
    if(!node) return 0;
    if(node.runFinishedAt && node.runStartedAt) return Number(node.runElapsedMs) || (Number(node.runFinishedAt) - Number(node.runStartedAt));
    if(node.runStartedAt) return nowMs() - Number(node.runStartedAt);
    return 0;
}

function runTimePillHtml(node){
    if(!node || node.runTimerHidden || node.type === 'smart-prompt') return '';
    if(window.CanvasSession?.enabled && smartPendingTasks(node).length)return '';
    const running = Boolean(smartNodePendingCount(node) || node.running);
    if(!running && !node.runFinishedAt) return '';
    const cls = running ? '' : ' done';
    return `<span class="run-time-pill${cls}" data-run-timer="${escapeHtml(node.id)}">${formatRunDuration(nodeRunElapsedMs(node))}</span>`;
}

function hideRunTimerForNode(node){
    if(!node || node.runTimerHidden || smartNodePendingCount(node) || node.running || !node.runFinishedAt) return false;
    node.runTimerHidden = true;
    scheduleSave();
    return true;
}

function refreshRunTimerPills(){
    const active = nodes.some(n => n.type !== 'smart-prompt' && !n.runTimerHidden && (smartNodePendingCount(n) || n.running));
    const byId = new Map(nodes.map(node => [node.id, node]));
    document.querySelectorAll('[data-run-timer]').forEach(el => {
        const node = byId.get(el.dataset.runTimer);
        if(!node || node.runTimerHidden || node.type === 'smart-prompt') {
            el.remove();
            return;
        }
        const label = formatRunDuration(nodeRunElapsedMs(node));
        if(el.textContent !== label) el.textContent = label;
        el.classList.toggle('done', Boolean(!smartNodePendingCount(node) && !node.running && node.runFinishedAt));
    });
    if(active && !runTimerInterval) runTimerInterval = setInterval(refreshRunTimerPills, 1000);
    if(!active && runTimerInterval){ clearInterval(runTimerInterval); runTimerInterval = null; }
}

function applyPreviewTransform(){
    const frame = document.getElementById('previewFrame');
    if(frame){
        frame.style.transform = panoramaState.enabled ? '' : `translate(${previewPan.x}px, ${previewPan.y}px) scale(${previewZoom})`;
    }
    updateZoomLabel();
}

function resetPreviewTransform(){
    previewZoom = 1.0;
    previewPan = {x:0, y:0};
    previewComparePos = 50;
    document.getElementById('previewStage')?.style.setProperty('--compare-pos', `${previewComparePos}%`);
    applyPreviewTransform();
}

function panoramaRatioValue(){
    const preset = PANORAMA_RATIO_PRESETS[panoramaState.ratio];
    if(preset) return preset;
    return {
        w:Math.max(1, Number(panoramaState.customW) || 16),
        h:Math.max(1, Number(panoramaState.customH) || 9)
    };
}

function panoramaResolutionValue(){
    const longSide = 1536;
    const ratio = panoramaRatioValue();
    const aspect = ratio.w / Math.max(1, ratio.h);
    if(aspect >= 1){
        return {w:longSide, h:Math.max(1, Math.round(longSide / aspect))};
    }
    return {w:Math.max(1, Math.round(longSide * aspect)), h:longSide};
}

function panoramaSource(){
    const editing = currentEditImage();
    const image = editing.image || {};
    if(mediaKindForItem(image) !== 'image') return '';
    return displayMediaUrl(image.url ? image : (image.url || ''));
}

function isLikelyPanoramaImage(node, image, naturalW=0, naturalH=0){
    if(mediaKindForItem(image || {}) !== 'image') return false;
    const text = [
        image?.name,
        image?.title,
        node?.title,
        node?.runPrompt,
        node?.runModelPrompt,
        node?.promptDraftText,
        node?.runSettings?.ratio,
        node?.runSettings?.msRatio,
        node?.runSettings?.size,
        node?.runSettings?.customSize
    ].filter(Boolean).join(' ');
    if(/(?:360|全景|环景|panorama|equirect|spherical|vr\b)/i.test(text)) return true;
    const w = Number(naturalW || image?.natural_w || image?.width || image?.w || 0);
    const h = Number(naturalH || image?.natural_h || image?.height || image?.h || 0);
    if(!(w > 0 && h > 0)) return false;
    const aspect = w / h;
    return aspect >= 1.9 && aspect <= 2.1;
}

async function ensurePanoramaRenderer(){
    const canvas = document.getElementById('panoramaCanvas');
    if(!canvas) return false;
    if(!panoramaState.three){
        const threeModulePath = '/static/vendor/js/three-0.160.0.module.js';
        const threeModuleUrl = window.FrontendVersion?.versionedUrl(threeModulePath) || threeModulePath;
        panoramaState.threeLoadPromise = panoramaState.threeLoadPromise || import(threeModuleUrl);
        try { panoramaState.three = await panoramaState.threeLoadPromise; }
        catch(error){ panoramaState.threeLoadPromise = null; throw error; }
    }
    const THREE = panoramaState.three;
    if(!panoramaState.renderer){
        panoramaState.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias:true,
            alpha:false,
            preserveDrawingBuffer:true
        });
        panoramaState.renderer.setPixelRatio(1);
        panoramaState.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    if(!panoramaState.scene){
        panoramaState.scene = new THREE.Scene();
        panoramaState.camera = new THREE.PerspectiveCamera(panoramaState.fov, 16 / 9, 1, 1200);
        const geometry = new THREE.SphereGeometry(500, 96, 64);
        geometry.scale(-1, 1, 1);
        const material = new THREE.MeshBasicMaterial({color:0xffffff});
        panoramaState.sphere = new THREE.Mesh(geometry, material);
        panoramaState.scene.add(panoramaState.sphere);
    }
    return Boolean(panoramaState.renderer && panoramaState.scene && panoramaState.camera && panoramaState.sphere);
}

function applyPanoramaTexture(img){
    const THREE = panoramaState.three;
    if(!THREE || !panoramaState.sphere || !img?.naturalWidth || !img?.naturalHeight) return false;
    if(panoramaState.texture){
        panoramaState.texture.dispose?.();
        panoramaState.texture = null;
    }
    const texture = new THREE.Texture(img);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    panoramaState.texture = texture;
    panoramaState.sphere.material.map = texture;
    panoramaState.sphere.material.needsUpdate = true;
    return true;
}

function drawPanoramaFrame(){
    const canvas = document.getElementById('panoramaCanvas');
    const img = panoramaState.image;
    const {renderer, scene, camera, sphere, three:THREE} = panoramaState;
    if(!panoramaState.enabled || !canvas || !renderer || !scene || !camera || !sphere || !THREE || !img?.naturalWidth || !img?.naturalHeight) return false;
    const width = Math.max(1, canvas.width);
    const height = Math.max(1, canvas.height);
    renderer.setSize(width, height, false);
    camera.fov = Math.max(35, Math.min(100, panoramaState.fov));
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    const pitch = Math.max(-85, Math.min(85, panoramaState.pitch));
    const phi = THREE.MathUtils.degToRad(90 - pitch);
    const theta = THREE.MathUtils.degToRad(panoramaState.yaw);
    const target = new THREE.Vector3(
        500 * Math.sin(phi) * Math.cos(theta),
        500 * Math.cos(phi),
        500 * Math.sin(phi) * Math.sin(theta)
    );
    camera.position.set(0, 0, 0);
    camera.lookAt(target);
    renderer.render(scene, camera);
    return true;
}

function renderPanoramaFrame(){
    if(!drawPanoramaFrame()) return;
    panoramaState.animationId = requestAnimationFrame(renderPanoramaFrame);
}

function startPanoramaLoop(){
    if(panoramaState.animationId) cancelAnimationFrame(panoramaState.animationId);
    panoramaState.animationId = requestAnimationFrame(renderPanoramaFrame);
}

function stopPanoramaLoop(){
    if(panoramaState.animationId) cancelAnimationFrame(panoramaState.animationId);
    panoramaState.animationId = 0;
}

function resizePanoramaViewer(){
    const stage = document.getElementById('panoramaStage');
    const frame = document.getElementById('previewFrame');
    const canvas = document.getElementById('panoramaCanvas');
    if(!stage) return;
    const ratio = panoramaRatioValue();
    const aspect = Math.max(0.08, Math.min(12, ratio.w / ratio.h));
    const maxW = Math.max(260, Math.min(1180, window.innerWidth - 116));
    const maxH = Math.max(220, Math.min(780, window.innerHeight - 220));
    let w = maxW;
    let h = w / aspect;
    if(h > maxH){
        h = maxH;
        w = h * aspect;
    }
    w = Math.max(160, Math.round(w));
    h = Math.max(160, Math.round(h));
    stage.style.width = `${w}px`;
    stage.style.height = `${h}px`;
    stage.style.aspectRatio = `${ratio.w} / ${ratio.h}`;
    if(frame){
        frame.style.width = `${w}px`;
        frame.style.height = `${h}px`;
    }
    if(canvas){
        const render = panoramaResolutionValue();
        const nextW = Math.max(1, Math.round(render.w));
        const nextH = Math.max(1, Math.round(render.h));
        if(canvas.width !== nextW) canvas.width = nextW;
        if(canvas.height !== nextH) canvas.height = nextH;
    }
}

function disposePanoramaTexture(){
    if(panoramaState.texture){
        panoramaState.texture.dispose?.();
        panoramaState.texture = null;
    }
    if(panoramaState.sphere?.material){
        panoramaState.sphere.material.map = null;
        panoramaState.sphere.material.needsUpdate = true;
    }
    panoramaState.image = null;
}

async function loadPanoramaTexture(src){
    if(!src) return;
    const token = ++panoramaState.loadToken;
    const stage = document.getElementById('panoramaStage');
    stage?.classList.remove('ready');
    try {
        const [ready, original] = await Promise.all([ensurePanoramaRenderer(), ensureSmartEditableImage()]);
        if(token !== panoramaState.loadToken || !panoramaState.enabled || !original) return;
        if(!ready) throw new Error('全景渲染器初始化失败');
        disposePanoramaTexture();
        if(!applyPanoramaTexture(original.image)) throw new Error('全景纹理加载失败');
        panoramaState.image = original.image;
        panoramaState.loadedSrc = src;
        stage?.classList.add('ready');
        resizePanoramaViewer();
        startPanoramaLoop();
    } catch(error) {
        if(token !== panoramaState.loadToken) return;
        stage?.classList.add('ready');
        toast(tr('smart.panoramaLoadFailed'));
    }
}

function refreshPanoramaControls(){
    const controls = document.getElementById('panoramaControls');
    const custom = document.getElementById('panoramaCustomRatio');
    if(controls) controls.style.display = panoramaState.enabled ? 'inline-flex' : 'none';
    if(custom) custom.style.display = panoramaState.enabled && panoramaState.ratio === 'custom' ? 'inline-flex' : 'none';
    document.querySelectorAll('[data-panorama-ratio]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.panoramaRatio === panoramaState.ratio);
    });
    const w = document.getElementById('panoramaRatioW');
    const h = document.getElementById('panoramaRatioH');
    if(w && document.activeElement !== w) w.value = panoramaState.customW;
    if(h && document.activeElement !== h) h.value = panoramaState.customH;
}

function setPanoramaEnabled(enabled){
    const next = Boolean(enabled);
    if(panoramaState.enabled === next) return;
    panoramaState.enabled = next;
    const stage = document.getElementById('previewStage');
    const pano = document.getElementById('panoramaStage');
    const currentImg = document.getElementById('previewCurrentImage');
    const compareLayer = document.getElementById('previewCompareLayer');
    const compareHandle = document.getElementById('previewCompareHandle');
    const toggle = document.getElementById('panoramaToggleBtn');
    const exportBtn = document.getElementById('panoramaExportBtn');
    const compareToggle = document.getElementById('compareToggleBtn');
    const compareThumbs = document.getElementById('compareThumbs');
    const previewTools = document.getElementById('imagePreviewTools');
    stage?.classList.toggle('panorama-on', next);
    previewTools?.classList.toggle('panorama-tools-on', next);
    if(pano) pano.style.display = next ? 'block' : 'none';
    if(currentImg) currentImg.style.display = next ? 'none' : 'block';
    if(compareLayer && next) compareLayer.style.display = 'none';
    if(compareHandle && next) compareHandle.style.display = 'none';
    if(toggle) toggle.classList.toggle('active', next);
    if(exportBtn) exportBtn.style.display = next ? 'inline-flex' : 'none';
    if(compareToggle) compareToggle.style.display = next ? 'none' : 'inline-flex';
    if(compareThumbs && next){ compareThumbs.style.display = 'none'; compareThumbs.innerHTML = ''; }
    previewCompareOn = next ? false : previewCompareOn;
    if(next){
        previewPan = {x:0, y:0};
        previewZoom = 1.0;
        applyPreviewTransform();
        resizePanoramaViewer();
        loadPanoramaTexture(panoramaSource());
        updatePreviewMetaHint(tr('smart.panoramaHint'));
    } else {
        stopPanoramaLoop();
        const frame = document.getElementById('previewFrame');
        if(frame){ frame.style.width = ''; frame.style.height = ''; }
        refreshComparePanel();
    }
    refreshPanoramaControls();
    updateZoomLabel();
}

function togglePanoramaPreview(){
    const image = currentEditImage().image || {};
    if(mediaKindForItem(image) !== 'image') return;
    setPanoramaEnabled(!panoramaState.enabled);
}

async function exportPanoramaFrame(){
    if(!panoramaState.enabled) return;
    const canvasEl = document.getElementById('panoramaCanvas');
    if(!canvasEl){ toast(tr('smart.panoramaExportFailed')); return; }
    try {
        if(!drawPanoramaFrame()) throw new Error(tr('smart.panoramaExportFailed'));
        const blob = await new Promise(resolve => canvasEl.toBlob(resolve, 'image/png'));
        if(!blob) throw new Error(tr('smart.panoramaExportFailed'));
        const editing = currentEditImage();
        const rawName = editing.image?.name || fileNameFromUrl(editing.image?.url || '') || 'panorama';
        const base = String(rawName).replace(/\.[a-z0-9]{2,8}$/i, '') || 'panorama';
        const filename = safeExportFileName(`${base}-panorama.png`, 'panorama.png');
        const uploaded = await uploadFiles([new File([blob], filename, {type:'image/png'})]);
        const frame = uploaded[0];
        if(!frame?.url) throw new Error(tr('smart.panoramaExportFailed'));
        frame.kind = 'image';
        frame.natural_w = canvasEl.width;
        frame.natural_h = canvasEl.height;
        const rect = editing.node ? nodeRect(editing.node) : null;
        const point = rect
            ? {x:rect.x + rect.width + 240, y:rect.y + rect.height / 2}
            : viewportCenter();
        pushUndo();
        const newNode = createImageNodeAt(point, [frame], {select:true, skipUndo:true});
        selectedIds = [];
        selectedImage = {nodeId:newNode.id, index:0};
        render();
        scheduleSave();
        toast(tr('smart.panoramaExportDone'));
    } catch(e) {
        toast((e.message || tr('smart.panoramaExportFailed')).slice(0, 120));
    }
}

function resetPanoramaView(){
    panoramaState.fov = 75;
    panoramaState.yaw = 0;
    panoramaState.pitch = 0;
    resizePanoramaViewer();
    updateZoomLabel();
}

function disposePanoramaPreview(){
    stopPanoramaLoop();
    disposePanoramaTexture();
    panoramaState.enabled = false;
    panoramaState.drag = null;
    panoramaState.loadedSrc = '';
    panoramaState.loadToken++;
    const stage = document.getElementById('panoramaStage');
    stage?.classList.remove('ready');
    if(stage) stage.style.display = 'none';
    document.getElementById('previewStage')?.classList.remove('panorama-on', 'panning');
    document.getElementById('imagePreviewTools')?.classList.remove('panorama-tools-on');
    document.getElementById('panoramaControls')?.style.setProperty('display', 'none');
    document.getElementById('panoramaToggleBtn')?.classList.remove('active');
    document.getElementById('panoramaExportBtn')?.style.setProperty('display', 'none');
}

function applyPanoramaRatio(value){
    panoramaState.ratio = PANORAMA_RATIO_PRESETS[value] ? value : 'custom';
    refreshPanoramaControls();
    resizePanoramaViewer();
}

function setPreviewComparePos(clientX){
    const frame = document.getElementById('previewFrame');
    const stage = document.getElementById('previewStage');
    if(!frame || !stage) return;
    const rect = frame.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / Math.max(1, rect.width)) * 100));
    previewComparePos = pct;
    stage.style.setProperty('--compare-pos', `${pct}%`);
}

function syncPreviewFrameSize(){
    const frame = document.getElementById('previewFrame');
    if(panoramaState.enabled){
        resizePanoramaViewer();
        return;
    }
    const currentImg = document.getElementById('previewCurrentImage');
    const currentVideo = document.getElementById('previewCurrentVideo');
    const compareImg = document.getElementById('previewCompareImage');
    const currentMedia = currentVideo && currentVideo.style.display !== 'none' ? currentVideo : currentImg;
    if(!frame || !currentMedia) return;
    const w = currentMedia.clientWidth || currentMedia.videoWidth || currentMedia.naturalWidth || 1;
    const h = currentMedia.clientHeight || currentMedia.videoHeight || currentMedia.naturalHeight || 1;
    frame.style.width = `${w}px`;
    frame.style.height = `${h}px`;
    if(compareImg){
        compareImg.style.width = `${w}px`;
        compareImg.style.height = `${h}px`;
    }
}

function previewResolutionText(){
    const editing = currentEditImage();
    const image = editing.image || {};
    const currentImg = document.getElementById('previewCurrentImage');
    const currentVideo = document.getElementById('previewCurrentVideo');
    const cropImg = document.getElementById('cropImage');
    const w = Number(image.natural_w || image.width || image.w || 0) || Number(currentVideo?.videoWidth || 0) || Number(currentImg?.naturalWidth || 0) || Number(cropImg?.naturalWidth || 0);
    const h = Number(image.natural_h || image.height || image.h || 0) || Number(currentVideo?.videoHeight || 0) || Number(currentImg?.naturalHeight || 0) || Number(cropImg?.naturalHeight || 0);
    if(!w || !h) return '';
    return `${tr('smart.resolution')}: ${Math.round(w)} x ${Math.round(h)}`;
}

function updatePreviewMetaHint(extraText=previewMetaExtraText){
    previewMetaExtraText = extraText || '';
    const hint = document.getElementById('previewMetaHint');
    if(!hint) return;
    hint.textContent = [previewResolutionText(), previewMetaExtraText].filter(Boolean).join(' · ');
}

function rememberPreviewImageResolution(){
    const editing = currentEditImage();
    const image = editing.image;
    if(!image) return;
    const currentImg = document.getElementById('previewCurrentImage');
    const currentVideo = document.getElementById('previewCurrentVideo');
    const cropImg = document.getElementById('cropImage');
    const w = Number(currentVideo?.videoWidth || 0) || Number(currentImg?.naturalWidth || 0) || Number(cropImg?.naturalWidth || 0);
    const h = Number(currentVideo?.videoHeight || 0) || Number(currentImg?.naturalHeight || 0) || Number(cropImg?.naturalHeight || 0);
    if(w > 0 && h > 0 && (!image.natural_w || !image.natural_h)){
        image.natural_w = w;
        image.natural_h = h;
        scheduleSave();
    }
}

function previewCompareSources(){
    const editing = currentEditImage();
    const node = editing.node;
    if(!node) return [];
    const savedRefs = Array.isArray(node.runInputRefs) ? node.runInputRefs.filter(ref => ref?.url) : [];
    const upstream = savedRefs.length ? savedRefs : inputImagesFor(node);
    const dedup = [];
    const seen = new Set();
    for(const img of upstream){
        if(!img?.url || seen.has(img.url) || mediaKindForItem(img) !== 'image') continue;
        seen.add(img.url);
        dedup.push(img);
    }
    if(dedup.length) return dedup;
    const sourceId = node.sourceNodeId;
    if(sourceId){
        const src = nodes.find(n => n.id === sourceId);
        if(src && (src.images || []).length){
            for(const img of src.images){
                if(!img?.url || seen.has(img.url) || mediaKindForItem(img) !== 'image') continue;
                seen.add(img.url);
                dedup.push(img);
            }
        }
    }
    return dedup;
}

function refreshComparePanel(){
    const stage = document.getElementById('previewStage');
    const compareImg = document.getElementById('previewCompareImage');
    const currentImg = document.getElementById('previewCurrentImage');
    const currentVideo = document.getElementById('previewCurrentVideo');
    const compareLayer = document.getElementById('previewCompareLayer');
    const compareHandle = document.getElementById('previewCompareHandle');
    const thumbsEl = document.getElementById('compareThumbs');
    const toggle = document.getElementById('compareToggleBtn');
    const panoramaToggle = document.getElementById('panoramaToggleBtn');
    const editing = currentEditImage();
    const curUrl = editing.image?.url || '';
    const isVideoPreview = mediaKindForItem(editing.image || {}) === 'video';
    const isPreviewMode = imageEditMode === 'preview';
    if(panoramaToggle){
        panoramaToggle.style.display = isPreviewMode && !isVideoPreview ? 'inline-flex' : 'none';
        panoramaToggle.classList.toggle('active', panoramaState.enabled);
    }
    if(!isPreviewMode && panoramaState.enabled) disposePanoramaPreview();
    if(panoramaState.enabled && isPreviewMode && !isVideoPreview){
        currentImg.onload = null;
        currentImg.onerror = null;
        currentImg.style.display = 'none';
        stage?.classList.remove('compare-on');
        if(compareLayer) compareLayer.style.display = 'none';
        if(compareHandle) compareHandle.style.display = 'none';
        if(thumbsEl){ thumbsEl.style.display = 'none'; thumbsEl.innerHTML = ''; }
        if(toggle) toggle.classList.remove('active');
        updatePreviewMetaHint(tr('smart.panoramaHint'));
        return;
    }
    const onCurrentLoaded = () => {
        rememberPreviewImageResolution();
        syncPreviewFrameSize();
        updatePreviewMetaHint();
    };
    if(isVideoPreview){
        currentImg.onload = null;
        currentImg.onerror = null;
        currentImg.removeAttribute('src');
        currentImg.style.display = 'none';
        if(currentVideo){
            const previewSrc = displayMediaUrl(editing.image || curUrl);
            currentVideo.style.display = 'block';
            currentVideo.onloadedmetadata = onCurrentLoaded;
            currentVideo.onloadeddata = onCurrentLoaded;
            if(currentVideo.getAttribute('src') !== previewSrc){
                window.CanvasMediaLoader?.watch(currentVideo, stage, curUrl);
                currentVideo.src = previewSrc;
                currentVideo.load?.();
            }
            if(currentVideo.readyState >= 1) requestAnimationFrame(onCurrentLoaded);
        }
        previewCompareOn = false;
        previewCompareIndex = -1;
        stage.classList.remove('compare-on');
        if(compareLayer) compareLayer.style.display = 'none';
        if(compareHandle) compareHandle.style.display = 'none';
        if(thumbsEl){ thumbsEl.style.display = 'none'; thumbsEl.innerHTML = ''; }
        if(toggle){
            toggle.disabled = true;
            toggle.style.opacity = '.45';
            toggle.classList.remove('active');
            toggle.title = tr('smart.compareEmpty');
        }
        if(panoramaToggle) panoramaToggle.style.display = 'none';
        updatePreviewMetaHint(editing.node?.runPrompt ? `${tr('smart.runPromptPrefix')}${editing.node.runPrompt.slice(0, 60)}` : '');
        return;
    }
    if(currentVideo){
        window.CanvasMediaLoader?.unwatch(currentVideo);
        currentVideo.pause?.();
        currentVideo.onloadedmetadata = null;
        currentVideo.onloadeddata = null;
        currentVideo.removeAttribute('src');
        currentVideo.load?.();
        currentVideo.style.display = 'none';
    }
    currentImg.style.display = 'block';
    currentImg.onload = onCurrentLoaded;
    currentImg.onerror = null;
    ensureSmartEditableImage().catch(() => {});
    if(currentImg.complete && currentImg.naturalWidth) requestAnimationFrame(onCurrentLoaded);
    const sources = previewCompareSources();
    const hasSource = sources.length > 0;
    if(toggle){
        toggle.disabled = !hasSource;
        toggle.style.opacity = hasSource ? '1' : '.45';
        toggle.title = hasSource ? tr('smart.compareHover') : tr('smart.compareEmpty');
        toggle.classList.toggle('active', hasSource && previewCompareOn);
    }
    if(!hasSource){
        previewCompareOn = false;
        previewCompareIndex = -1;
        stage.classList.remove('compare-on');
        if(compareLayer) compareLayer.style.display = 'none';
        if(compareHandle) compareHandle.style.display = 'none';
        thumbsEl.style.display = 'none';
        updatePreviewMetaHint(editing.node?.runPrompt ? `${tr('smart.runPromptPrefix')}${editing.node.runPrompt.slice(0, 60)}` : '');
        return;
    }
    const sliderActive = previewCompareOn && previewCompareIndex >= 0 && previewCompareIndex < sources.length;
    if(sliderActive){
        const src = sources[previewCompareIndex];
        compareImg.src = src?.url || '';
        compareImg.onload = syncPreviewFrameSize;
        syncPreviewFrameSize();
        stage.classList.add('compare-on');
        if(compareLayer) compareLayer.style.display = '';
        if(compareHandle) compareHandle.style.display = '';
    } else {
        stage.classList.remove('compare-on');
        if(compareLayer) compareLayer.style.display = 'none';
        if(compareHandle) compareHandle.style.display = 'none';
    }
    if(previewCompareOn){
        thumbsEl.style.display = 'inline-flex';
        thumbsEl.innerHTML = sources.map((s, i) => `<button type="button" class="compare-thumb ${i === previewCompareIndex ? 'active' : ''}" data-compare-idx="${i}" title="${escapeHtml(i === previewCompareIndex ? tr('smart.compareCancelTip') : tr('smart.compareUseTip'))}">${smartPreviewImgHtml(s.url, 256)}</button>`).join('');
        bindSmartPreviewImageFallbacks(thumbsEl);
        thumbsEl.querySelectorAll('[data-compare-idx]').forEach(btn => {
            btn.onclick = e => {
                e.preventDefault(); e.stopPropagation();
                const idx = Number(btn.dataset.compareIdx);
                previewCompareIndex = (previewCompareIndex === idx) ? -1 : idx;
                refreshComparePanel();
            };
        });
    } else {
        thumbsEl.style.display = 'none';
        thumbsEl.innerHTML = '';
    }
    let txt = editing.node?.runPrompt ? `${tr('smart.runPromptPrefix')}${editing.node.runPrompt.slice(0, 60)}` : '';
    if(previewCompareOn && !sliderActive) txt = (txt ? `${txt} · ` : '') + tr('smart.compareHintPick');
    updatePreviewMetaHint(txt);
}

function togglePreviewCompare(){
    const sources = previewCompareSources();
    if(!sources.length){ toast(tr('smart.compareNoSource')); return; }
    previewCompareOn = !previewCompareOn;
    if(previewCompareOn && (previewCompareIndex < 0 || previewCompareIndex >= sources.length)) previewCompareIndex = 0;
    if(!previewCompareOn) previewCompareIndex = -1;
    refreshComparePanel();
}

function currentPreviewVideo(){
    if(!imageEditModal.classList.contains('open')) return null;
    if(mediaKindForItem(currentEditImage().image || {}) !== 'video') return null;
    return document.getElementById('previewCurrentVideo');
}

function videoFrameStep(){
    const image = currentEditImage().image || {};
    const fps = Number(image.fps || image.frameRate || image.frame_rate || image.framespersecond || image.frames_per_second || 0);
    return 1 / Math.max(1, Math.min(120, Number.isFinite(fps) && fps > 0 ? fps : 30));
}

function seekPreviewVideoFrames(direction){
    const video = currentPreviewVideo();
    if(!video || video.readyState < 1) return false;
    video.pause?.();
    const step = videoFrameStep();
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const maxTime = duration ? Math.max(0, duration - step / 2) : Number.MAX_SAFE_INTEGER;
    video.currentTime = Math.max(0, Math.min(maxTime, Number(video.currentTime || 0) + direction * step));
    return true;
}

function waitForVideoEvent(video, eventName, timeout=1500){
    return new Promise(resolve => {
        let done = false;
        const finish = () => {
            if(done) return;
            done = true;
            clearTimeout(timer);
            video.removeEventListener(eventName, finish);
            resolve();
        };
        const timer = setTimeout(finish, timeout);
        video.addEventListener(eventName, finish, {once:true});
    });
}

async function seekVideoForFrame(video, time){
    if(Math.abs(Number(video.currentTime || 0) - time) <= 0.002) return;
    video.currentTime = time;
    await waitForVideoEvent(video, 'seeked', 2200);
}

async function exportVideoFrame(which='current'){
    const video = currentPreviewVideo();
    if(!video){ toast('没有可导出的视频帧'); return; }
    if(video.readyState < 2) await waitForVideoEvent(video, 'loadeddata', 2200);
    if(!video.videoWidth || !video.videoHeight){ toast('视频还没有加载完成'); return; }
    const originalTime = Number(video.currentTime || 0);
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const step = videoFrameStep();
    const target = which === 'first'
        ? 0
        : which === 'last'
            ? Math.max(0, duration - step / 2)
            : originalTime;
    const suffix = which === 'first' ? 'first-frame' : which === 'last' ? 'last-frame' : 'current-frame';
    try {
        video.pause?.();
        await seekVideoForFrame(video, target);
        const canvasEl = document.createElement('canvas');
        canvasEl.width = video.videoWidth;
        canvasEl.height = video.videoHeight;
        const ctx = canvasEl.getContext('2d');
        ctx.drawImage(video, 0, 0, canvasEl.width, canvasEl.height);
        const blob = await new Promise(resolve => canvasEl.toBlob(resolve, 'image/png'));
        if(!blob) throw new Error('导出帧失败');
        const editing = currentEditImage();
        const rawName = editing.image?.name || fileNameFromUrl(editing.image?.url || '') || 'video';
        const base = String(rawName).replace(/\.[a-z0-9]{2,8}$/i, '') || 'video';
        const filename = safeExportFileName(`${base}-${suffix}.png`, `${suffix}.png`);
        const uploaded = await uploadFiles([new File([blob], filename, {type:'image/png'})]);
        const frame = uploaded[0];
        if(!frame?.url) throw new Error('导出到画布失败');
        frame.kind = 'image';
        frame.natural_w = video.videoWidth;
        frame.natural_h = video.videoHeight;
        const rect = editing.node ? nodeRect(editing.node) : null;
        const point = rect
            ? {x:rect.x + rect.width + 240, y:rect.y + rect.height / 2}
            : viewportCenter();
        pushUndo();
        const newNode = createImageNodeAt(point, [frame], {select:true, skipUndo:true});
        selectedIds = [];
        selectedImage = {nodeId:newNode.id, index:0};
        render();
        scheduleSave();
        toast('已导出到画布');
        if(which !== 'current') await seekVideoForFrame(video, originalTime);
    } catch(e) {
        toast((e.message || '导出帧失败').slice(0, 120));
    }
}

function formatVideoTrimTime(value){
    const total = Math.max(0, Number(value || 0));
    const hundredths = Math.round(total * 100);
    const hours = Math.floor(hundredths / 360000);
    const minutes = Math.floor((hundredths % 360000) / 6000);
    const seconds = Math.floor((hundredths % 6000) / 100);
    const fraction = hundredths % 100;
    const core = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(fraction).padStart(2, '0')}`;
    return hours ? `${String(hours).padStart(2, '0')}:${core}` : core;
}

function parseVideoTrimTime(value){
    const text = String(value || '').trim();
    if(!text) return NaN;
    if(/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
    const parts = text.split(':');
    if(parts.length < 2 || parts.length > 3 || parts.some(part => !/^\d+(?:\.\d+)?$/.test(part))) return NaN;
    let total = 0;
    for(const part of parts) total = total * 60 + Number(part);
    return total;
}

function videoTrimIsFullRange(){
    return videoTrimState.duration > 0
        && videoTrimState.start <= 0.01
        && videoTrimState.end >= videoTrimState.duration - 0.01;
}

function ensureVideoTrimBindings(video){
    if(!video || video.dataset.trimEventsBound === '1') return;
    video.dataset.trimEventsBound = '1';
    video.addEventListener('timeupdate', () => {
        if(!videoTrimState.active || !videoTrimState.previewing) return;
        if(Number(video.currentTime || 0) + 0.025 < videoTrimState.end) return;
        video.pause?.();
        video.currentTime = videoTrimState.start;
        videoTrimState.previewing = false;
        syncVideoTrimUi(false);
    });
    video.addEventListener('ended', () => {
        if(!videoTrimState.active || !videoTrimState.previewing) return;
        videoTrimState.previewing = false;
        video.currentTime = videoTrimState.start;
        syncVideoTrimUi(false);
    });
}

function syncVideoTrimUi(updateInputs=true){
    const panel = document.getElementById('videoTrimPanel');
    const toggle = document.getElementById('videoTrimToggleBtn');
    if(panel) panel.hidden = !videoTrimState.active;
    toggle?.classList.toggle('active', videoTrimState.active);
    if(!videoTrimState.active) return;
    const duration = Math.max(VIDEO_TRIM_MIN_DURATION, Number(videoTrimState.duration || 0));
    const startRange = document.getElementById('videoTrimStartRange');
    const endRange = document.getElementById('videoTrimEndRange');
    const startInput = document.getElementById('videoTrimStartInput');
    const endInput = document.getElementById('videoTrimEndInput');
    [startRange, endRange].forEach(input => {
        if(!input) return;
        input.max = String(duration);
        input.disabled = videoTrimState.busy;
    });
    if(startRange){
        startRange.value = String(videoTrimState.start);
        startRange.style.zIndex = videoTrimState.start > duration * 0.9 ? '5' : '3';
    }
    if(endRange){
        endRange.value = String(videoTrimState.end);
        endRange.style.zIndex = '4';
    }
    if(updateInputs){
        if(startInput && document.activeElement !== startInput) startInput.value = formatVideoTrimTime(videoTrimState.start);
        if(endInput && document.activeElement !== endInput) endInput.value = formatVideoTrimTime(videoTrimState.end);
    }
    if(startInput) startInput.disabled = videoTrimState.busy;
    if(endInput) endInput.disabled = videoTrimState.busy;
    const startPct = Math.max(0, Math.min(100, videoTrimState.start / duration * 100));
    const endPct = Math.max(startPct, Math.min(100, videoTrimState.end / duration * 100));
    const selection = document.getElementById('videoTrimSelection');
    if(selection){ selection.style.left = `${startPct}%`; selection.style.right = `${100 - endPct}%`; }
    const selectedDuration = Math.max(0, videoTrimState.end - videoTrimState.start);
    const summary = document.getElementById('videoTrimSummary');
    if(summary) summary.textContent = videoTrimIsFullRange() ? '已选择完整视频' : `已选 ${formatVideoTrimTime(selectedDuration)}`;
    document.querySelectorAll('.video-trim-current-btn').forEach(btn => { btn.disabled = videoTrimState.busy; });
    const valid = selectedDuration >= VIDEO_TRIM_MIN_DURATION && videoTrimState.end <= duration + 0.01;
    const applyBtn = document.getElementById('videoTrimApplyBtn');
    if(applyBtn){
        applyBtn.disabled = videoTrimState.busy || !valid || videoTrimIsFullRange() || isSmartCanvasLocked();
        const label = applyBtn.querySelector('span');
        if(label) label.textContent = videoTrimState.busy ? '正在截取…' : '截取并添加到画布';
    }
    const previewBtn = document.getElementById('videoTrimPreviewBtn');
    if(previewBtn){
        previewBtn.disabled = videoTrimState.busy || !valid;
        const label = previewBtn.querySelector('span');
        if(label) label.textContent = videoTrimState.previewing ? '停止预览' : '预览片段';
    }
}

function resetVideoTrimState(){
    const video = document.getElementById('previewCurrentVideo');
    if(videoTrimState.previewing) video?.pause?.();
    videoTrimState = {active:false, start:0, end:0, duration:0, previewing:false, busy:false, sourceUrl:''};
    const panel = document.getElementById('videoTrimPanel');
    if(panel) panel.hidden = true;
    document.getElementById('videoTrimToggleBtn')?.classList.remove('active');
}

function closeVideoTrimPanel(){
    resetVideoTrimState();
}

async function toggleVideoTrimPanel(){
    if(videoTrimState.active){ closeVideoTrimPanel(); return; }
    const video = currentPreviewVideo();
    const editing = currentEditImage();
    const sourceUrl = editing.image?.url || '';
    if(!video || !sourceUrl){ toast('没有可截取的视频'); return; }
    if(!sourceUrl.startsWith('/assets/') && !sourceUrl.startsWith('/output/')){
        toast('请先将视频保存到本地素材后再截取');
        return;
    }
    if(video.readyState < 1) await waitForVideoEvent(video, 'loadedmetadata', 2200);
    const duration = Number(video.duration || 0);
    if(!Number.isFinite(duration) || duration < VIDEO_TRIM_MIN_DURATION){ toast('视频时长尚未加载完成'); return; }
    video.pause?.();
    ensureVideoTrimBindings(video);
    videoTrimState = {active:true, start:0, end:duration, duration, previewing:false, busy:false, sourceUrl};
    syncVideoTrimUi();
}

function stopVideoTrimPreview(){
    if(!videoTrimState.previewing) return;
    document.getElementById('previewCurrentVideo')?.pause?.();
    videoTrimState.previewing = false;
}

function setVideoTrimValue(which, rawValue, seek=true){
    if(!videoTrimState.active) return false;
    const value = Number(rawValue);
    if(!Number.isFinite(value)) return false;
    stopVideoTrimPreview();
    if(which === 'start'){
        videoTrimState.start = Math.max(0, Math.min(value, videoTrimState.end - VIDEO_TRIM_MIN_DURATION));
    } else {
        videoTrimState.end = Math.min(videoTrimState.duration, Math.max(value, videoTrimState.start + VIDEO_TRIM_MIN_DURATION));
    }
    const video = currentPreviewVideo();
    if(seek && video){
        video.pause?.();
        video.currentTime = which === 'start' ? videoTrimState.start : videoTrimState.end;
    }
    syncVideoTrimUi();
    return true;
}

function updateVideoTrimFromRange(which){
    const input = document.getElementById(which === 'start' ? 'videoTrimStartRange' : 'videoTrimEndRange');
    setVideoTrimValue(which, input?.value);
}

function commitVideoTrimInput(which){
    const input = document.getElementById(which === 'start' ? 'videoTrimStartInput' : 'videoTrimEndInput');
    const value = parseVideoTrimTime(input?.value);
    if(!setVideoTrimValue(which, value)){
        toast('请输入秒数或 00:00.00 格式的时间');
        syncVideoTrimUi();
    }
}

function setVideoTrimPoint(which){
    const video = currentPreviewVideo();
    if(!video) return;
    setVideoTrimValue(which, Number(video.currentTime || 0), false);
}

async function previewVideoTrim(){
    const video = currentPreviewVideo();
    if(!video || !videoTrimState.active) return;
    if(videoTrimState.previewing){
        video.pause?.();
        videoTrimState.previewing = false;
        syncVideoTrimUi(false);
        return;
    }
    try {
        await seekVideoForFrame(video, videoTrimState.start);
        videoTrimState.previewing = true;
        syncVideoTrimUi(false);
        await video.play();
    } catch(e) {
        videoTrimState.previewing = false;
        syncVideoTrimUi(false);
        toast('无法播放所选片段');
    }
}

async function applyVideoTrim(){
    if(videoTrimState.busy || !videoTrimState.active) return;
    if(isSmartCanvasLocked()){ toast('画布当前为只读状态'); return; }
    const selectedDuration = videoTrimState.end - videoTrimState.start;
    if(selectedDuration < VIDEO_TRIM_MIN_DURATION){ toast('截取片段不能短于 0.1 秒'); return; }
    if(videoTrimIsFullRange()){ toast('当前选择为完整视频'); return; }
    const editing = currentEditImage();
    const source = editing.image || {};
    if(!source.url){ toast('没有可截取的视频'); return; }
    const sourceNode = editing.node && nodes.includes(editing.node) ? editing.node : null;
    const sourceRect = sourceNode ? nodeRect(sourceNode) : null;
    const video = currentPreviewVideo();
    stopVideoTrimPreview();
    video?.pause?.();
    videoTrimState.busy = true;
    syncVideoTrimUi();
    try {
        const result = await window.CanvasApi.trimSmartCanvasVideo({
            url:source.url,
            start_seconds:videoTrimState.start,
            end_seconds:videoTrimState.end,
            name:source.name || fileNameFromUrl(source.url) || 'video.mp4'
        }, {errorFallback:'视频截取失败'});
        if(!result?.url) throw new Error('视频截取结果无效');
        const item = {
            url:result.url,
            name:result.name || fileNameFromUrl(result.url) || 'video-clip.mp4',
            kind:'video',
            generatedResult:true,
            clip_source_url:source.url,
            clip_start:Number(result.start_seconds ?? videoTrimState.start),
            clip_end:Number(result.end_seconds ?? videoTrimState.end),
            duration_seconds:Number(result.duration_seconds ?? selectedDuration)
        };
        if(video?.videoWidth && video?.videoHeight){
            item.natural_w = video.videoWidth;
            item.natural_h = video.videoHeight;
            item.layout_w = video.videoWidth;
            item.layout_h = video.videoHeight;
        }
        const point = sourceRect
            ? {x:sourceRect.x + sourceRect.width + 240, y:sourceRect.y + sourceRect.height / 2}
            : viewportCenter();
        pushUndo();
        const newNode = createImageNodeAt(point, [item], {select:true, skipUndo:true});
        selectedIds = [];
        selectedImage = {nodeId:newNode.id, index:0};
        render();
        // The trim request already produced a new file. Move the lightbox context to
        // that node immediately so playback and the top-level download button no
        // longer keep pointing at the source video.
        openImageEditor(newNode.id, 0);
        scheduleSave();
        toast(`已截取 ${formatVideoTrimTime(item.duration_seconds)}，已切换到新片段`);
    } catch(e) {
        toast((e.message || '视频截取失败').slice(0, 160));
    } finally {
        videoTrimState.busy = false;
        if(videoTrimState.active) syncVideoTrimUi();
    }
}

function updatePreviewNavButtons(){
    const node = nodes.find(n => n.id === previewNavState.nodeId);
    const count = Math.max(0, (node?.images || []).filter(img => img?.url).length);
    previewNavState.count = count;
    const show = imageEditModal.classList.contains('open') && imageEditMode === 'preview' && count > 1;
    document.getElementById('previewPrevBtn')?.classList.toggle('visible', show);
    document.getElementById('previewNextBtn')?.classList.toggle('visible', show);
}

function navigatePreviewImage(delta){
    if(!imageEditModal.classList.contains('open') || imageEditMode !== 'preview') return;
    const node = nodes.find(n => n.id === previewNavState.nodeId);
    const images = (node?.images || []).filter(img => img?.url);
    if(!node || images.length <= 1) return;
    const count = images.length;
    const next = (Number(previewNavState.index || 0) + Number(delta || 0) + count) % count;
    openImageEditor(node.id, next);
}

function openImagePreview(nodeId, imageIndex=0){
    const node = nodes.find(n => n.id === nodeId);
    const image = node?.images?.[Math.max(0, Number(imageIndex) || 0)];
    if(mediaKindForItem(image || {}) === 'audio') return openSmartAudioLightbox(nodeId, imageIndex);
    openImageEditor(nodeId, imageIndex);
    setImageEditMode('preview');
}

// Called once by smart-canvas.js, at its original initialization position.
function bindSmartPreviewPanEvents(){
    document.getElementById('previewStage').addEventListener('mousedown', event => {
        if(imageEditMode !== 'preview' || event.button !== 0) return;
        if(event.target.closest('.preview-tools-overlay, .preview-download-overlay')) return;
        if(event.target.closest('.preview-compare-handle')) return;
        if(event.target.closest('video')) return;
        event.preventDefault();
        event.stopPropagation();
        if(panoramaState.enabled){
            panoramaState.drag = {
                clientX:event.clientX,
                clientY:event.clientY,
                yaw:panoramaState.yaw,
                pitch:panoramaState.pitch
            };
            document.getElementById('previewStage')?.classList.add('panning');
            return;
        }
        previewPanDrag = {clientX:event.clientX, clientY:event.clientY, startX:previewPan.x, startY:previewPan.y};
    });
}

// Called once by smart-canvas.js, at its original initialization position.
function bindSmartPreviewCompareEvents(){
    document.getElementById('previewCompareHandle').addEventListener('mousedown', event => {
        if(imageEditMode !== 'preview' || !previewCompareOn || previewCompareIndex < 0) return;
        event.preventDefault();
        event.stopPropagation();
        previewPanDrag = null;
        previewCompareDrag = true;
        setPreviewComparePos(event.clientX);
    });
    document.getElementById('previewCompareHandle').addEventListener('pointerdown', event => {
        if(imageEditMode !== 'preview' || !previewCompareOn || previewCompareIndex < 0) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        previewPanDrag = null;
        previewCompareDrag = true;
        setPreviewComparePos(event.clientX);
    });
    document.getElementById('previewCompareHandle').addEventListener('pointermove', event => {
        if(!previewCompareDrag) return;
        event.preventDefault();
        event.stopPropagation();
        setPreviewComparePos(event.clientX);
    });
    document.getElementById('previewCompareHandle').addEventListener('pointerup', event => {
        if(previewCompareDrag){
            event.preventDefault();
            event.stopPropagation();
        }
        previewCompareDrag = false;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
    });
    document.getElementById('previewCompareHandle').addEventListener('pointercancel', event => {
        previewCompareDrag = false;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
    });
}

// Called once by smart-canvas.js, at its original initialization position.
function bindSmartPanoramaControls(){
    document.querySelectorAll('[data-panorama-ratio]').forEach(btn => {
        btn.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            applyPanoramaRatio(btn.dataset.panoramaRatio || 'wide');
        });
    });
    ['panoramaRatioW','panoramaRatioH'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
            panoramaState.ratio = 'custom';
            panoramaState.customW = Math.max(1, Math.min(999, Number(document.getElementById('panoramaRatioW')?.value || 16)));
            panoramaState.customH = Math.max(1, Math.min(999, Number(document.getElementById('panoramaRatioH')?.value || 9)));
            refreshPanoramaControls();
            resizePanoramaViewer();
        });
    });
}
