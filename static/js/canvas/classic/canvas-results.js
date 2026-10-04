/* Classic canvas: Media previews/downloads, generation history and billing presentation.
 * Browser classic script (not an ES module); loaded before canvas.js.
 * Function declarations only: initialization is explicitly invoked by the entry.
 * Uses the entry's existing shared bindings; do not duplicate permission or document state.
 */

function showErrorModal(message, title='生成失败'){
    if(!errorModal || !errorMessage){
        console.error(message || title);
        return;
    }
    errorTitle.textContent = title || '生成失败';
    const raw = String(message || title || '');
    errorMessage.textContent = raw;
    const summary = document.getElementById('errorSummary');
    let brief = raw;
    const jsonStart = raw.indexOf('{');
    if(jsonStart >= 0){
        try {
            const data = JSON.parse(raw.slice(jsonStart));
            brief = data.error?.message || data.message || raw.slice(0,jsonStart).trim() || title;
        } catch(e) { brief = raw.slice(0,jsonStart).trim() || title; }
    }
    if(/image area must be at most/i.test(raw)) brief = '图片尺寸超出接口限制，请减小宽高后重试。';
    if(summary) summary.textContent = brief.length > 140 ? brief.slice(0,140) + '…' : brief;
    const details = errorModal.querySelector('.error-details');
    if(details) details.open = false;
    errorModal.classList.add('open');
    refreshIcons();
}

function closeErrorModal(){
    if(errorModal) errorModal.classList.remove('open');
}

async function copyErrorMessage(){
    const text = errorMessage?.textContent || '';
    if(!text) return;
    try {
        await navigator.clipboard.writeText(text);
    } catch(e) {
        const range = document.createRange();
        range.selectNodeContents(errorMessage);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }
}

function refreshOutputTimer(){
    const hasPending = nodes.some(n => n.type === 'output' && (n._pending || []).length);
    if(hasPending && !outputTimer){
        outputTimer = setInterval(() => {
            const pendingById = new Map();
            nodes.filter(n => n.type === 'output').forEach(node => {
                (node._pending || []).forEach(p => pendingById.set(p.id, p));
            });
            if(pendingById.size){
                document.querySelectorAll('.output-time-pill.running').forEach(pill => {
                    const pendingId = pill.closest('[data-pending-id]')?.dataset.pendingId;
                    const pending = pendingById.get(pendingId);
                    if(pending) pill.textContent = formatRunDuration(nowMs() - Number(pending.startedAt || nowMs()));
                });
            } else {
                clearInterval(outputTimer);
                outputTimer = null;
            }
        }, 1000);
    } else if(!hasPending && outputTimer){
        clearInterval(outputTimer);
        outputTimer = null;
    }
}

function outputImageUrls(node){
    return (node?.images || []).filter(item => mediaKindForOutputItem(item) === 'image').map(outputUrlValue).filter(Boolean);
}

function outputDownloadableImageUrls(node){
    return (node?.images || []).map(outputUrlValue).filter(url => url && !isMissingAssetUrl(url) && (url.startsWith('/output/') || url.startsWith('/assets/')));
}

function groupImageItems(group){
    if(!group || group.type !== 'group') return [];
    return (group.items || [])
        .map(id => nodes.find(n => n.id === id))
        .filter(n => n?.type === 'image' && n.url && mediaKindForNode(n) === 'image' && !isMissingAssetUrl(n.url))
        .map((n, index) => ({url:n.url, name:n.name || outputImageName(n.url) || `image-${index + 1}.png`, kind:'image', nodeId:n.id, __index:index}));
}

function extensionFromNameOrUrl(name='', url=''){
    return window.CanvasCore?.extensionFromNameOrUrl(name, url, '.png') || '.png';
}

function safeDownloadFileName(name, fallback='image.png'){
    return window.CanvasCore?.safeFileName(name, fallback) || fallback;
}

function downloadNameForGroupImage(item, index=0){
    const fallback = `image-${String(index + 1).padStart(2, '0')}${extensionFromNameOrUrl(item?.name, item?.url)}`;
    let name = safeDownloadFileName(item?.name || outputImageName(item?.url || '') || fallback, fallback);
    if(!/\.[a-z0-9]{2,8}$/i.test(name)) name += extensionFromNameOrUrl(name, item?.url);
    return name;
}

async function downloadOutputNodeImages(nodeId){
    const node = nodes.find(n => n.id === nodeId);
    const urls = outputDownloadableImageUrls(node);
    if(!node || !urls.length){
        alert('没有可下载的本地文件');
        return;
    }
    try {
        const res = await fetch('/api/canvas-assets/download', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
                urls,
                filename:`${(canvas?.title || 'canvas-output').slice(0, 48)}-${node.id}.zip`
            })
        });
        if(!res.ok) throw new Error(await responseErrorMessage(res, '没有可下载的本地文件'));
        const blob = await res.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${(canvas?.title || 'canvas-output').slice(0, 48)}-${node.id}.zip`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch(err) {
        alert(err.message || '没有可下载的本地文件');
    }
}

async function downloadGroupNodeImages(groupId){
    const group = nodes.find(n => n.id === groupId);
    const items = groupImageItems(group);
    if(!group || !items.length){
        alert('没有可下载的本地文件');
        return;
    }
    const filename = safeDownloadFileName(`${canvas?.title || 'canvas-group'}-${group.id}.zip`, 'canvas-group.zip');
    try {
        const res = await fetch('/api/canvas-assets/download', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
                filename,
                urls:items.map(item => item.url).filter(Boolean),
                items:items.map((item, index) => ({url:item.url, name:downloadNameForGroupImage(item, index)}))
            })
        });
        if(!res.ok) throw new Error(await responseErrorMessage(res, '没有可下载的本地文件'));
        const blob = await res.blob();
        const href = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = href;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(href), 1200);
    } catch(err) {
        alert(err.message || '没有可下载的本地文件');
    }
}

function outputDownloadName(url){
    const clean = (url || '').split('?')[0];
    const ext = clean.includes('.') ? clean.split('.').pop() : 'png';
    return `canvas-output-${Date.now()}.${ext || 'png'}`;
}

function isVideoUrl(url){
    const clean = (url || '').split('?')[0].toLowerCase();
    return /\.(mp4|webm|mov|m4v)$/.test(clean);
}

function mediaKindForOutputItem(item){
    const explicit = String(item?.kind || item?.mediaKind || '').toLowerCase();
    if(['image','video','audio','text','file'].includes(explicit)) return explicit;
    const url = outputUrlValue(item);
    if(isVideoUrl(url)) return 'video';
    if(isAudioUrl(url)) return 'audio';
    if(isTextUrl(url)) return 'text';
    return 'image';
}

function formatRunDuration(ms){
    const total = Math.max(0, Math.round(Number(ms || 0) / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

function nowMs(){ return window.CanvasCore?.nowMs() || Date.now(); }

function outputUrlValue(item){
    return typeof item === 'string' ? item : item?.url || '';
}

function isMissingAssetUrl(url){
    return Boolean(url && missingAssetUrls.has(url));
}

function missingAssetHtml(url, compact=false){
    return `<div class="missing-asset ${compact ? 'compact' : ''}" title="${escapeAttr(url || '')}"><i data-lucide="image-off" class="${compact ? 'w-4 h-4' : 'w-6 h-6'}"></i><span>文件缺失</span></div>`;
}

function outputMetaFor(url, out){
    const item = (out?.images || []).find(x => outputUrlValue(x) === url);
    return item && typeof item === 'object' ? item : {};
}

function runSnapshot(node, prompt, refs=[]){
    const clone = JSON.parse(JSON.stringify(node || {}));
    delete clone.running;
    delete clone.runStatus;
    delete clone.runError;
    delete clone.inputs;
    return {
        nodeType: node?.type || '',
        node: clone,
        prompt: prompt || '',
        refs: (refs || []).map(ref => ({url:ref.url, name:ref.name || 'image'})).filter(ref => ref.url),
    };
}

function comfyRunLabel(node){
    const mode = node?.mode || 'text';
    if(mode === 'text') return '文生图';
    if(mode === 'enhance') return '细节增强';
    if(mode === 'edit') return '图片编辑';
    if(mode === 'custom') return node?.comfyWorkflow || '自定义';
    return 'ComfyUI';
}

function runTaskLabel(run){
    const node = run?.node || {};
    if(run?.taskLabel) return run.taskLabel;
    if(run?.nodeType === 'comfy') return comfyRunLabel(node);
    if(run?.nodeType === 'ltxDirector') return 'LTX Director';
    if(run?.nodeType === 'generator') return node.model || 'API Image';
    if(run?.nodeType === 'video') return node.model || 'Video';
    if(run?.nodeType === 'msgen') return node.msCustomModel || node.msgenModel || 'Modelscope';
    return run?.nodeType || 'Generate';
}

function requestMetaFromResult(result={}){
    return {
        task_id: result.task_id || result.raw?.task_id || result.raw?.data?.task_id || (Array.isArray(result.raw?.data) ? result.raw.data[0]?.task_id : '') || '',
        request_id: result.request_id || result.id || result.raw?.id || '',
        provider_id: result.provider_id || result.params?.provider_id || '',
        backend: result.backend || '',
        prompt_id: result.prompt_id || '',
        workflow_json: result.workflow_json || '',
        seed: result.seed || '',
    };
}

function runPlatformLabel(run){
    const node = run?.node || {};
    if(run?.nodeType === 'generator') return providerById(node.apiProvider || 'comfly')?.name || node.apiProvider || 'API';
    if(run?.nodeType === 'msgen') return 'Modelscope';
    if(run?.nodeType === 'video') return providerById(node.apiProvider || 'comfly')?.name || node.apiProvider || 'Video';
    if(run?.nodeType === 'comfy') return 'ComfyUI';
    if(run?.nodeType === 'ltxDirector') return 'ComfyUI';
    return run?.nodeType || 'Generate';
}

function comfyLabelFromWorkflow(workflow){
    const name = String(workflow || '').toLowerCase();
    if(!name) return '';
    if(name === 'z-image.json') return '文生图';
    if(name === 'z-image-enhance.json' || name === 'upscale.json') return '细节增强';
    if(name === 'flux2-klein.json') return '图片编辑';
    return workflow;
}

function logTaskLabel(log){
    const req = log?.request || {};
    if(log?.platform === 'ComfyUI'){
        const byWorkflow = comfyLabelFromWorkflow(req.workflow_json || req.workflow);
        if(byWorkflow) return byWorkflow;
    }
    return log?.model || '-';
}

function modelPriceAt(providerId, kind, model, createdAt){
    const provider = apiProviders.find(item => item.id === providerId);
    const at = Number(createdAt || Date.now());
    return (provider?.model_prices || [])
        .filter(price => price.kind === kind && price.model === model
            && Number(price.effective_from || 0) <= at
            && (!Number(price.effective_to || 0) || at < Number(price.effective_to)))
        .sort((a, b) => Number(b.effective_from || 0) - Number(a.effective_from || 0))[0] || null;
}

function billingIdentity(run, log={}){
    const node = run?.node || {};
    const nodeType = run?.nodeType || log.nodeType || '';
    const kind = log.billingKind || (['generator','msgen'].includes(nodeType) ? 'image' : nodeType === 'video' ? 'video' : '');
    let providerId = log.providerId || run?.providerId || node.apiProvider || run?.request?.provider_id || log.request?.provider_id || '';
    if(!providerId && nodeType === 'msgen') providerId = 'modelscope';
    if(!providerId && log.platform) providerId = apiProviders.find(item => item.name === log.platform || item.id === log.platform)?.id || '';
    let model = log.billingModel || run?.billingModel || node.model || log.model || '';
    if(nodeType === 'msgen') model = run?.billingModel || log.billingModel || node.msCustomModel || MS_GEN_MODELS[node.msgenModel]?.modelId || model;
    return {kind, providerId, model};
}

function historicalVideoDuration(log){
    const urls = new Set((log.outputs || []).map(outputUrlValue).filter(Boolean));
    // ponytail: linear history scan; index by output URL only if very large canvases make this slow.
    for(const node of nodes || []) for(const item of node.images || []){
        if(!urls.has(outputUrlValue(item))) continue;
        const duration = Number(item.run?.node?.duration || item.run?.request?.duration || 0);
        if(duration > 0) return duration;
    }
    return 0;
}

function videoDurationSeconds(url){
    return new Promise(resolve => {
        if(!url) return resolve(0);
        const video = document.createElement('video');
        let settled = false;
        const done = value => { if(settled) return; settled = true; clearTimeout(timer); video.removeAttribute('src'); video.load(); resolve(value); };
        const timer = setTimeout(() => done(0), 8000);
        video.preload = 'metadata';
        video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? Math.max(1, Math.round(video.duration)) : 0);
        video.onerror = () => done(0);
        video.src = canvasDisplayMediaUrl(url);
    });
}

async function backfillHistoricalVideoCosts(){
    if(videoCostBackfillRunning || !canvas) return;
    const logs = (canvas.logs || []).filter(log => log.status !== 'failed' && billingIdentity({}, log).kind === 'video' && !Number(log.durationSeconds || 0)
        && window.VolcengineVideoBilling?.costFor({}, log, billingIdentity({}, log), apiProviders) === undefined);
    if(!logs.length) return;
    videoCostBackfillRunning = true;
    let changed = false;
    try {
        for(const log of logs){
            const stored = Number(log.request?.duration || historicalVideoDuration(log));
            const duration = stored > 0 ? stored : await videoDurationSeconds((log.outputs || []).map(outputUrlValue).find(Boolean));
            if(duration <= 0) continue;
            log.durationSeconds = duration;
            log.cost = calculateGenerationCost({log, outputs:log.outputs || [], createdAt:log.createdAt, source:'estimated'});
            changed = true;
        }
        if(changed){ scheduleSave(); renderCanvasLog(); }
    } finally {
        videoCostBackfillRunning = false;
    }
}

function calculateGenerationCost({run={}, log={}, outputs=[], createdAt=Date.now(), source='actual'}){
    const identity = billingIdentity(run, log);
    const volcCost = window.VolcengineVideoBilling?.costFor(run, log, identity, apiProviders);
    if(volcCost !== undefined) return volcCost;
    if(log.status === 'failed') return null;
    if(!identity.kind || !identity.providerId || !identity.model) return {status:'unknown', source, ...identity};
    if(apiProviders.find(p=>p.id===identity.providerId)?.billing_authority==='server') return {status:'unknown', source, ...identity, reason:'awaiting_server_ledger'};
    const price = modelPriceAt(identity.providerId, identity.kind, identity.model, createdAt);
    if(!price) return {status:'unknown', source, ...identity};
    let quantity = 1;
    if(price.billing_type === 'per_image') quantity = Math.max(1, (outputs || []).length);
    if(price.billing_type === 'per_second'){
        quantity = Number(log.durationSeconds || run?.node?.duration || run?.request?.duration || log.request?.duration || historicalVideoDuration(log));
        if(quantity <= 0) return {status:'unknown', source, ...identity};
    }
    const unitPriceMicros = Math.round(Number(price.unit_price || 0) * 1000000);
    return {
        status:'priced',
        source,
        ...identity,
        billing_type:price.billing_type,
        quantity,
        unit_price:String(price.unit_price),
        currency:price.currency || 'CNY',
        amount_micros:Math.round(unitPriceMicros * quantity),
        price_effective_from:Number(price.effective_from || 0),
    };
}

function generationLogCost(log){
    if(log?._ledger) return log._ledger_cost?.status === 'excluded' ? null : log._ledger_cost;
    const volcCost = window.VolcengineVideoBilling?.costFor({}, log, billingIdentity({}, log), apiProviders);
    if(volcCost !== undefined) return volcCost;
    if(log?.status === 'failed') return null;
    if(log?.cost?.status === 'priced') return log.cost;
    return calculateGenerationCost({log, outputs:log.outputs || [], createdAt:log.createdAt, source:'estimated'});
}

function formatCostMicros(value){
    return window.CanvasCore.formatCostAmount(value);
}

function canvasCostTotals(logs=canvas?.logs || []){
    if(arguments.length === 0 && canvas?.id && window.CanvasLedger){
        const ledger = window.CanvasLedger.view(canvas.id);
        if(ledger.allTotals) return ledger.allTotals;
    }
    return logs.reduce((sum, log) => {
        const cost = generationLogCost(log);
        if(cost?.status === 'priced'){
            sum.total += Number(cost.amount_micros || 0);
            sum[cost.kind] = (sum[cost.kind] || 0) + Number(cost.amount_micros || 0);
            sum.calls += 1;
            if(cost.source === 'estimated') sum.estimated += Number(cost.amount_micros || 0);
        } else if(cost?.status === 'unknown') sum.unknown += 1;
        return sum;
    }, {total:0, image:0, video:0, estimated:0, unknown:0, calls:0});
}

function updateCanvasCostButton(totals=canvasCostTotals()){
    if(canvasCostToggleLabel) canvasCostToggleLabel.textContent = `费用 ${formatCostMicros(totals.total)}`;
    if(canvasCostToggle) canvasCostToggle.title = totals.unknown ? `费用仪表盘 · ${totals.unknown} 笔待定价` : '费用仪表盘';
}

function addGenerationLog({run, outputs=[], runMs=0, error=''}) {
    if(!canvas) return;
    canvas.logs = canvas.logs || [];
    const createdAt = Date.now();
    const identity = billingIdentity(run);
    const entry = {
        id:uid('log'),
        canvas_task_id:run?.canvasTaskId || run?.request?.canvas_task_id || '',
        createdAt,
        status:error ? 'failed' : 'success',
        platform:runPlatformLabel(run),
        nodeType:run?.nodeType || '',
        model:run?.taskLabel || runTaskLabel(run),
        providerId:identity.providerId,
        billingKind:identity.kind,
        billingModel:identity.model,
        durationSeconds:Number(run?.video_info?.duration || run?.node?.duration || 0),
        request:run?.request || {},
        prompt:run?.prompt || '',
        outputs:(outputs || []).filter(Boolean),
        refs:run?.refs || [],
        runMs:typeof runMs==='number' && Number.isFinite(runMs) && runMs>0 ? runMs : null,
        error:error ? String(error) : '',
        ...window.VolcengineVideoBilling?.metadata(run),
    };
    entry.cost = calculateGenerationCost({run, log:entry, outputs:entry.outputs, createdAt});
    canvas.logs = [entry, ...canvas.logs].slice(0, 5000);
    window.CanvasLedger?.record(canvas.id, entry);
    updateCanvasCostButton();
}

function renderCanvasLog(){
    const list = document.getElementById('logList') || (typeof logList !== 'undefined' ? logList : null);
    const ledger = canvas?.id ? window.CanvasLedger?.view(canvas.id) : null;
    const logs = ledger ? ledger.logs : ((typeof canvas !== 'undefined' && Array.isArray(canvas?.logs)) ? canvas.logs : []);
    if(!list) return;
    const totals = ledger ? ledger.totals : canvasCostTotals(logs);
    updateCanvasCostButton(ledger?.allTotals || totals);
    window.CanvasLedger?.mount(list, canvas?.id);
    const summary = document.getElementById('canvasCostSummary');
    if(summary) summary.textContent = [
        `总计 ${formatCostMicros(totals.total)}`,
        `图片 ${formatCostMicros(totals.image)}`,
        `视频 ${formatCostMicros(totals.video)}`,
        totals.estimated ? `含预估 ${formatCostMicros(totals.estimated)}` : '',
        totals.unknown ? `${totals.unknown} 笔待定价` : '',
    ].filter(Boolean).join(' · ');
    const dashboardValues = {
        costDashboardTotal:formatCostMicros(totals.total),
        costDashboardImage:formatCostMicros(totals.image),
        costDashboardVideo:formatCostMicros(totals.video),
        costDashboardCalls:String(totals.calls),
        costDashboardMeta:totals.estimated ? `含历史预估 ${formatCostMicros(totals.estimated)}` : (totals.calls ? '按调用时价格统计' : '暂无计费调用'),
        costDashboardUnknown:totals.unknown ? `${totals.unknown} 笔待定价` : '',
    };
    Object.entries(dashboardValues).forEach(([id, value]) => {
        const target = document.getElementById(id);
        if(target) target.textContent = ledger && !ledger.ready ? '读取中…' : value;
    });
    if(summary && ledger && !ledger.ready) summary.textContent = '正在读取全部费用流水…';
    list.innerHTML = logs.length ? logs.map((log,index) => {
        const thumbs = (log.outputs || []).slice(0, 8).map(item => {
            const url = outputUrlValue(item);
            if(!url) return '';
            const safe = escapeAttr(url);
            if(isMissingAssetUrl(url)) return `<div class="missing-asset compact" data-url="${safe}"><i data-lucide="image-off" class="w-4 h-4"></i></div>`;
            const kind = mediaKindForOutputItem(item);
            return kind === 'video' ? canvasVideoPreviewHtml(url, 256, 'alt="output"') : canvasPreviewImgHtml(url, 256, 'alt="output"');
        }).join('');
        const date = new Date(log.createdAt || Date.now()).toLocaleString('zh-CN');
        const req = log.request || {};
        const taskId = req.task_id || req.taskId || req.prompt_id || req.promptId || '';
        const requestId = req.request_id || req.requestId || req.id || '';
        const backend = req.backend || req.provider_id || req.providerId || '';
        const workflow = req.workflow_json || req.workflow || '';
        const taskLabel = logTaskLabel(log);
        const cost = generationLogCost(log);
        const costAmount = window.CanvasCore.formatCostAmount(cost?.amount_micros, cost?.currency);
        const costChip = cost?.status === 'priced'
            ? `<span class="log-chip ${cost.source === 'estimated' ? 'cost-estimated' : ''}" title="${cost.source === 'estimated' ? '根据历史价格回算' : '调用时价格快照'}">${escapeHtml(costAmount)}${cost.source === 'estimated' ? ' 预估' : ''}</span>`
            : cost?.status === 'unknown' ? `<span class="log-chip cost-unknown">${escapeHtml(window.VolcengineVideoBilling?.pendingLabel(cost) || '待核算')}</span>` : '';
        const idText = taskId || requestId || '';
        const backendText = workflow || backend || '';
        const subParts = [
            ...(window.VolcengineVideoBilling?.details(log) || []),
            `输出 ${(log.outputs || []).length}`,
            idText ? `ID ${idText}` : '',
            backendText && backendText!==log.platform ? backendText : '',
        ].filter(Boolean);
        return `<article class="log-item ${log.status === 'failed' ? 'failed' : ''}" data-log-index="${index}">
            <div class="log-main">
                <div class="log-entry-head"><span class="log-chip ${log.status === 'failed' ? 'status-failed' : 'status-ok'}">${escapeHtml(log.status === 'failed' ? '失败' : '成功')}</span>
                    <time class="log-entry-date">${escapeHtml(date)}</time><span class="log-entry-cost">${costChip}</span></div>
                <div class="log-meta">
                    <span class="log-chip">${escapeHtml(log.platform || '-')}</span>
                    ${taskLabel ? `<span class="log-chip">${escapeHtml(taskLabel)}</span>` : ''}
                    <span class="log-chip">${escapeHtml(window.CanvasLedger.durationLabel(log.runMs,formatRunDuration,'耗时未知'))}</span>
                </div>
                <div class="log-subline">${subParts.map(part => `<span title="${escapeAttr(part)}">${escapeHtml(part)}</span>`).join('')}</div>
                ${log.error ? `<div class="log-error" title="${escapeAttr(log.error)}">${escapeHtml(log.error)}</div>` : ''}
                ${window.CanvasLedger.promptMarkup(log.prompt,escapeHtml)}
            </div>
            <div class="log-thumbs">${thumbs}</div>
        </article>`;
    }).join('') : `<div class="log-empty">还没有生成日志</div>`;
    bindCanvasPreviewImageFallbacks(list);
    list.querySelectorAll('[data-url]').forEach(el => {
        el.onclick = e => {
            e.stopPropagation();
            openOutputLightbox(el.dataset.url, null);
        };
    });
    window.CanvasLedger.bindLogPrompts(list,logs,formatRunDuration);
    refreshIcons();
    if(!ledger) void backfillHistoricalVideoCosts();
}

// Called once by canvas.js, at its original initialization position.
function bindClassicLedgerUpdates(){
    window.addEventListener('canvas-ledger-updated', event => {
        if(event.detail?.canvasId !== canvas?.id) return;
        updateCanvasCostButton();
        if(document.getElementById('logModal')?.classList.contains('open')) renderCanvasLog();
    });
}

function openCanvasLog(event, mode='logs'){
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
    const modal = document.getElementById('logModal') || (typeof logModal !== 'undefined' ? logModal : null);
    const list = document.getElementById('logList') || (typeof logList !== 'undefined' ? logList : null);
    modal?.querySelector('.log-panel')?.classList.toggle('cost-mode', mode === 'cost');
    const title = document.getElementById('canvasLogTitle');
    if(title) title.textContent = mode === 'cost' ? '费用仪表盘' : '生成日志';
    modal?.classList.add('open');
    if(canvas?.id)void window.CanvasLedger?.refresh(canvas.id);
    if(list && !list.innerHTML) list.innerHTML = `<div class="log-empty">还没有生成日志</div>`;
    try {
        renderCanvasLog();
    } catch(err) {
        console.error('renderCanvasLog failed', err);
        if(list) list.innerHTML = `<div class="log-empty">${escapeHtml(err?.message || String(err))}</div>`;
    }
}

function openCanvasCost(event){ openCanvasLog(event, 'cost'); }

function closeCanvasLog(){
    const modal = document.getElementById('logModal') || (typeof logModal !== 'undefined' ? logModal : null);
    modal?.classList.remove('open');
}

function outputImageName(url){
    const clean = (url || '').split('?')[0];
    const name = clean.split('/').filter(Boolean).pop();
    return name ? decodeURIComponent(name) : 'output image';
}

function setOutputDragPreview(event, img){
    if(!event.dataTransfer || !img) return;
    const wrap = document.createElement('div');
    wrap.className = 'output-drag-preview';
    const clone = img.cloneNode();
    clone.removeAttribute('id');
    wrap.appendChild(clone);
    document.body.appendChild(wrap);
    const rect = img.getBoundingClientRect();
    event.dataTransfer.setDragImage(wrap, Math.min(rect.width / 2, 120), Math.min(rect.height / 2, 120));
    setTimeout(() => wrap.remove(), 0);
}

function outputCompareUrlFor(url, out){
    const source = out?.imageComparisons?.[url];
    if(typeof source === 'string' && source) return source;
    if(source?.url) return source.url;
    const meta = outputMetaFor(url, out);
    return meta?.run?.refs?.find(ref => ref?.url)?.url || '';
}

function markOutputViewed(out, url){
    if(!out || !url || !(out.images || []).length) return;
    let changed = false;
    out.images = out.images.map(item => {
        if(typeof item === 'string') return item;
        if(item?.url === url && !item.viewed){
            changed = true;
            return {...item, viewed:true};
        }
        return item;
    });
    if(changed){
        render();
        scheduleSave();
    }
}

function outputLightboxItems(out=null){
    const normalize = (item, sourceOut=null) => {
        const url = outputUrlValue(item);
        const kind = mediaKindForOutputItem(item);
        if(!url || !['image','video'].includes(kind)) return null;
        return {url, outId:sourceOut?.id || ''};
    };
    const sourceOut = out?.id ? nodes.find(n => n.id === out.id) || out : null;
    if(sourceOut){
        if(sourceOut.type === 'group') return groupImageItems(sourceOut).map(item => normalize(item, sourceOut)).filter(Boolean);
        if(sourceOut.type === 'image' && sourceOut.url) return [normalize({url:sourceOut.url, kind:mediaKindForNode(sourceOut)}, sourceOut)].filter(Boolean);
        return (sourceOut.images || []).map(item => normalize(item, sourceOut)).filter(Boolean);
    }
    const outputNodeItems = nodes
        .filter(n => n.type === 'output')
        .flatMap(n => (n.images || []).map(item => normalize(item, n)).filter(Boolean));
    if(outputNodeItems.length) return outputNodeItems;
    return (canvas?.logs || [])
        .flatMap(log => (log.outputs || []).map(url => normalize(url, null)).filter(Boolean));
}

function openGroupLightbox(groupId, index=0){
    const group = nodes.find(n => n.id === groupId);
    const items = groupImageItems(group);
    if(!items.length) return;
    const item = items[Math.max(0, Math.min(items.length - 1, index))] || items[0];
    openOutputLightbox(item.url, group);
}

// This owner covers the shared preview window, not all results or document state.
function createClassicOutputPreview(){
    let outputCompareDrag=false, outputPreviewZoom=1, outputPreviewPan={x:0,y:0}, outputPreviewPanDrag=null;
    let currentOutputCompareUrl='',currentOutputMeta=null,currentOutputLightboxOutId='',currentOutputLightboxUrl='';
    let outputTrimState=null,outputTrimFrame=null;
    // A submitted trim belongs to its request, not the lifetime of this window.
    let outputTrimJob=null;
    let openState=false,viewKind='',compareOn=false,comparePosition=50,paused=false,destroyed=false,revision=0,copyTimer=null,copyLabel='复制提示词';
    let targetCheck=()=>false;
    const dom=new Map(),listeners=new Map(),imageIds=['outputLightboxImg','outputCompareResult','outputCompareOriginal'];
    function element(id){if(destroyed)return null;if(!dom.has(id))dom.set(id,document.getElementById(id));return dom.get(id);}
    function targetValid(){return !destroyed && !paused && targetCheck();}
    function captureTarget(url,out){
        const canvasId=canvas?.id;
        if(!out?.id)return ()=>canvas?.id===canvasId;
        const child=out.type==='group'?nodes.find(node=>out.items?.includes(node.id) && node.url===url):null;
        // Preserve the existing URL-based audio/video fallback even for legacy image metadata.
        const sourceKind=out.type==='image'?mediaKindForNode(out):mediaKindForOutputItem((out.images||[]).find(item=>outputUrlValue(item)===url));
        return ()=>{
            if(canvas?.id!==canvasId || !nodes.includes(out))return false;
            if(out.type==='group')return Boolean(child && nodes.includes(child) && out.items?.includes(child.id) && child.url===url && mediaKindForNode(child)==='image');
            if(out.type==='image')return out.url===url && mediaKindForNode(out)===sourceKind;
            return (out.images||[]).some(item=>outputUrlValue(item)===url && mediaKindForOutputItem(item)===sourceKind);
        };
    }
    function guard(fn){const origin=revision;return (...args)=>{if(openState && origin===revision && targetValid())return fn(...args);};}
    function clearListeners(scope){for(const dispose of listeners.get(scope)||[])dispose();listeners.delete(scope);}
    function listen(scope,el,type,fn,options){
        if(!el)return;
        const handler=event=>{if(!destroyed && (scope==='lifecycle' || !paused))fn(event);};
        el.addEventListener(type,handler,options);
        if(!listeners.has(scope))listeners.set(scope,[]);listeners.get(scope).push(()=>el.removeEventListener(type,handler,options));
    }
    function clearCopyFeedback(){
        clearTimeout(copyTimer);copyTimer=null;
        const button=element('outputCopyPromptBtn');button?.classList.remove('copied');
        const span=button?.querySelector('span');if(span)span.textContent=copyLabel;
    }
    function copyPrompt(){
        if(!openState || !targetValid())return;
        const prompt=currentOutputMeta?.run?.prompt;if(!prompt)return;
        copyTextToClipboard(prompt);clearCopyFeedback();
        const button=element('outputCopyPromptBtn'),span=button.querySelector('span');
        copyLabel=span?.textContent||'复制提示词';button.classList.add('copied');if(span)span.textContent='已复制';
        copyTimer=setTimeout(guard(clearCopyFeedback),1200);
    }
    function download(){if(openState && targetValid())return downloadUrl(currentOutputLightboxUrl,outputDownloadName(currentOutputLightboxUrl)).catch(err=>alert(err.message||'下载失败'));}
    function downloadAll(){if(openState && targetValid() && currentOutputLightboxOutId)return downloadGroupNodeImages(currentOutputLightboxOutId);}
    function rerun(){if(openState && targetValid())return rerunFromOutputMeta(currentOutputMeta);}
    function setTrimPoint(which){if(openState && targetValid())setOutputTrimValue(which,element('outputLightboxVideo').currentTime);}
    function bind(){
        if(destroyed || paused)return;
        clearListeners('controls');clearListeners('lifecycle');
        const modal=element('outputLightbox');
        listen('controls',modal,'click',closeOutputLightbox);
        listen('controls',element('outputLightboxShell'),'click',event=>event.stopPropagation());
        listen('controls',modal?.querySelector('[data-output-close]'),'click',closeOutputLightbox);
        listen('controls',element('outputDownloadBtn'),'click',event=>{event.stopPropagation();download();});
        listen('controls',element('outputDownloadAllBtn'),'click',event=>{event.stopPropagation();downloadAll();});
        listen('controls',element('outputCopyPromptBtn'),'click',event=>{event.stopPropagation();copyPrompt();});
        listen('controls',element('outputRerunBtn'),'click',event=>{event.stopPropagation();rerun();});
        listen('controls',element('outputPreview'),'dblclick',event=>{event.stopPropagation();if(currentOutputCompareUrl)setOutputCompareMode(!compareOn);});
        listen('controls',element('outputTrimToggle'),'click',toggleOutputVideoTrim);
        for(const which of ['start','end']){
            const suffix=which==='start'?'Start':'End';
            listen('controls',element('outputTrim'+suffix),'input',()=>setOutputTrimInput(which,false));
            listen('controls',element('outputTrim'+suffix),'change',()=>setOutputTrimInput(which));
            listen('controls',element('outputTrim'+suffix+'Range'),'input',event=>setOutputTrimValue(which,event.currentTarget.value));
            listen('controls',modal?.querySelector('[data-output-trim-point="'+which+'"]'),'click',()=>setTrimPoint(which));
        }
        listen('controls',element('outputTrimPreview'),'click',previewOutputVideoTrim);
        listen('controls',modal?.querySelector('[data-output-trim-close]'),'click',resetOutputVideoTrim);
        listen('controls',element('outputTrimApply'),'click',applyOutputVideoTrim);
        listen('lifecycle',window,'pagehide',event=>{if(event.persisted)pause();else destroy();});
        listen('lifecycle',window,'pageshow',event=>{if(event.persisted)resume();});
        initOutputCompareEvents();initOutputPreviewZoomEvents();
    }
    function isPreviewingNode(node){return Boolean(openState && targetValid() && (currentOutputLightboxOutId===node?.id || currentOutputLightboxUrl===node?.url));}
    // Virtualization validates the target once per pass, not once for every node.
    function previewedNodeIds(){
        if(!openState || !targetValid())return Object.freeze([]);
        return Object.freeze(nodes.filter(node=>currentOutputLightboxOutId===node.id || currentOutputLightboxUrl===node.url).map(node=>node.id));
    }
    function dataChanged(){if(openState && !targetValid())closeOutputLightbox();}
    function pause(){if(destroyed || paused)return;closeOutputLightbox();for(const scope of [...listeners.keys()])if(scope!=='lifecycle')clearListeners(scope);paused=true;}
    function resume(){if(destroyed || !paused)return;paused=false;bind();}
    function destroy(){if(destroyed)return;closeOutputLightbox();for(const scope of [...listeners.keys()])clearListeners(scope);dom.clear();destroyed=true;}
    function navigateOutputLightbox(direction){
        if(!openState || !targetValid() || !currentOutputLightboxUrl) return false;
        const out = currentOutputLightboxOutId ? nodes.find(n => n.id === currentOutputLightboxOutId) : null;
        const items = outputLightboxItems(out);
        if(items.length < 2) return false;
        let idx = items.findIndex(item => item.url === currentOutputLightboxUrl);
        if(idx < 0) idx = 0;
        const next = items[(idx + direction + items.length) % items.length];
        const nextOut = next.outId ? nodes.find(n => n.id === next.outId) : null;
        openOutputLightbox(next.url, nextOut);
        return true;
    }

    function setOutputCompareMode(active){
        if(destroyed)return;
        compareOn=Boolean(active && openState && targetValid() && viewKind==='image' && currentOutputCompareUrl);active=compareOn;
        if(active)comparePosition=50;
        element('outputPreview').classList.toggle('compare-mode', active);
        if(active){
            element('outputCompareOriginalWrap').style.clipPath = 'inset(0 50% 0 0)';
            element('outputCompareSlider').style.left = '50%';
        }
    }

    function outputResolutionText(text, meta=null){
        if(destroyed)return;
        const parts = [text || '--'];
        if(meta?.runMs) parts.push(`<span>${formatRunDuration(meta.runMs)}</span>`);
        element('outputResolution').innerHTML = parts.join('<span style="opacity:.38">|</span>');
    }

    function setupOutputPromptPanel(meta){
        if(destroyed)return;
        currentOutputMeta = meta || null;
        const prompt = meta?.run?.prompt || '';
        element('outputPromptPanel').classList.toggle('open', !!prompt || !!meta?.run);
        element('outputPromptText').textContent = prompt || '没有记录提示词';
    }

    function updateOutputCompareSlider(clientX){
        if(!openState || !targetValid() || !compareOn)return;
        const rect = element('outputCompareContainer').getBoundingClientRect();
        if(!rect.width) return;
        const percent = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
        comparePosition=percent;
        element('outputCompareOriginalWrap').style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
        element('outputCompareSlider').style.left = `${percent}%`;
    }

    function applyOutputPreviewZoom(){
        if(destroyed)return;
        const transform = `translate(${outputPreviewPan.x}px, ${outputPreviewPan.y}px) scale(${outputPreviewZoom})`;
        [element('outputLightboxImg'), element('outputCompareResult'), element('outputCompareOriginal')].forEach(img => {
            img.style.transform = transform;
            img.style.transformOrigin = '0 0';
        });
        element('outputPreview').classList.toggle('zoomed', outputPreviewZoom > 1.001);
    }

    function resetOutputPreviewZoom(){
        if(destroyed)return;
        outputPreviewZoom = 1;
        outputPreviewPan = {x: 0, y: 0};
        outputPreviewPanDrag = null;
        element('outputPreview').classList.remove('panning');
        applyOutputPreviewZoom();
    }

    function initOutputPreviewZoomEvents(){
        if(destroyed || paused)return;clearListeners('zoom');
        listen('zoom', element('outputPreview'), 'wheel', e => {
            if(!openState || !targetValid())return;
            if(element('outputLightboxVideo').style.display === 'block' || element('outputLightboxAudio').style.display === 'flex') return;
            e.preventDefault();
            e.stopPropagation();
            const rect = element('outputPreview').getBoundingClientRect();
            const localX = e.clientX - rect.left;
            const localY = e.clientY - rect.top;
            const before = {
                x:(localX - outputPreviewPan.x) / outputPreviewZoom,
                y:(localY - outputPreviewPan.y) / outputPreviewZoom
            };
            const factor = e.deltaY > 0 ? .9 : 1.1;
            const nextZoom = Math.max(1, Math.min(6, outputPreviewZoom * factor));
            outputPreviewZoom = nextZoom;
            outputPreviewPan = nextZoom <= 1.001 ? {x: 0, y: 0} : {
                x:localX - before.x * nextZoom,
                y:localY - before.y * nextZoom
            };
            applyOutputPreviewZoom();
        }, {passive:false});
        listen('zoom', element('outputPreview'), 'mousedown', e => {
            if(!openState || !targetValid())return;
            if(element('outputLightboxVideo').style.display === 'block' || element('outputLightboxAudio').style.display === 'flex') return;
            if(e.button !== 0 || outputPreviewZoom <= 1.001) return;
            if(e.target.closest('.output-preview-actions, .output-resolution, .output-compare-slider')) return;
            outputPreviewPanDrag = {
                sx:e.clientX,
                sy:e.clientY,
                ox:outputPreviewPan.x,
                oy:outputPreviewPan.y
            };
            element('outputPreview').classList.add('panning');
            e.preventDefault();
            e.stopPropagation();
        });
        listen('zoom', window, 'mousemove', e => {
            if(!outputPreviewPanDrag || !openState || !targetValid()) return;
            outputPreviewPan = {
                x:outputPreviewPanDrag.ox + e.clientX - outputPreviewPanDrag.sx,
                y:outputPreviewPanDrag.oy + e.clientY - outputPreviewPanDrag.sy
            };
            applyOutputPreviewZoom();
        });
        listen('zoom', window, 'mouseup', () => {
            outputPreviewPanDrag = null;
            element('outputPreview').classList.remove('panning');
        });
    }

    function initOutputCompareEvents(){
        if(destroyed || paused)return;clearListeners('compare');
        listen('compare', element('outputCompareContainer'), 'mousedown', e => {
            if(!openState || !targetValid() || !compareOn)return;
            outputCompareDrag = true;
            updateOutputCompareSlider(e.clientX);
            e.preventDefault();
            e.stopPropagation();
        });
        listen('compare', element('outputCompareSlider'), 'mousedown', e => {
            if(!openState || !targetValid() || !compareOn)return;
            outputCompareDrag = true;
            e.preventDefault();
            e.stopPropagation();
        });
        listen('compare', window, 'mousemove', e => {
            if(outputCompareDrag) updateOutputCompareSlider(e.clientX);
        });
        listen('compare', window, 'mouseup', () => { outputCompareDrag = false; });
        listen('compare', element('outputCompareContainer'), 'touchstart', e => {
            if(!openState || !targetValid() || !compareOn)return;
            outputCompareDrag = true;
            updateOutputCompareSlider(e.touches[0].clientX);
            e.preventDefault();
            e.stopPropagation();
        }, {passive:false});
        listen('compare', window, 'touchmove', e => {
            if(outputCompareDrag) {
                updateOutputCompareSlider(e.touches[0].clientX);
                e.preventDefault();
            }
        }, {passive:false});
        listen('compare', window, 'touchend', () => { outputCompareDrag = false; });
    }

    function stopOutputTrimPreview(){
        if(destroyed)return;
        if(outputTrimFrame !== null) cancelAnimationFrame(outputTrimFrame);
        outputTrimFrame = null;
        if(outputTrimState?.previewing) element('outputLightboxVideo').pause();
        if(outputTrimState) outputTrimState.previewing = false;
    }

    function resetOutputVideoTrim(){
        if(destroyed)return;
        stopOutputTrimPreview();
        outputTrimState = null;
        syncOutputTrimUi();
    }

    function syncOutputTrimUi(){
        if(destroyed || paused)return;
        const state = outputTrimState, active = Boolean(state), busy = Boolean(outputTrimJob);
        element('outputTrimPanel').hidden = !active;
        element('outputTrimToggle').setAttribute('aria-expanded', String(active));
        element('outputLightbox').classList.toggle('trim-open', active);
        if(!state) return;
        for(const which of ['start', 'end']){
            const suffix = which === 'start' ? 'Start' : 'End';
            const input = element(`outputTrim${suffix}`);
            const range = element(`outputTrim${suffix}Range`);
            if(document.activeElement !== input && !state.invalidFields?.[which]) input.value = outputTrimTime(state[which]);
            range.max = String(state.duration);
            range.value = String(state[which]);
            range.style.zIndex = which === 'start' && state.start > state.duration * .9 ? '5' : (which === 'end' ? '4' : '3');
        }
        element('outputTrimPanel').querySelectorAll('input, button').forEach(el => { el.disabled = busy; });
        const full = state.start <= .001 && state.end >= state.duration - .001;
        const invalid = Object.values(state.invalidFields || {}).some(Boolean);
        element('outputTrimApply').disabled = busy || invalid || full || !canvas || isCanvasLockedByOther();
        element('outputTrimPreview').disabled = busy || invalid;
        element('outputTrimApply').textContent = busy ? '正在截取…' : '另存为新节点';
        element('outputTrimPreview').textContent = state.previewing ? '停止预览' : '预览片段';
        element('outputTrimSummary').textContent = state.error || (full ? '已选择完整视频' : `已选 ${outputTrimTime(state.end - state.start)}`);
        const selection = element('outputTrimSelection');
        selection.style.left = `${state.start / state.duration * 100}%`;
        selection.style.right = `${100 - state.end / state.duration * 100}%`;
    }

    function toggleOutputVideoTrim(){
        if(!openState || !targetValid() || destroyed || paused)return;
        if(outputTrimState){ resetOutputVideoTrim(); return; }
        if(element('outputLightboxVideo').style.display !== 'block' || !currentOutputLightboxUrl) return;
        if(!/^\/(assets|output)\//.test(currentOutputLightboxUrl)){
            showErrorModal('请先将视频保存到本地素材后再截取。', '截取片段'); return;
        }
        const duration = Number(element('outputLightboxVideo').duration);
        if(element('outputLightboxVideo').readyState < 1 || !Number.isFinite(duration) || duration < .1){
            showErrorModal('视频时长尚未加载完成，或视频不足 0.1 秒。', '截取片段'); return;
        }
        element('outputLightboxVideo').pause();
        outputTrimState = {url:currentOutputLightboxUrl, start:0, end:duration, duration, previewing:false, error:'', invalidFields:{}};
        syncOutputTrimUi();
    }

    function setOutputTrimValue(which, raw, seek=true){
        if(!openState || !targetValid() || destroyed || paused)return;
        const state = outputTrimState, value = Number(raw);
        if(!state || outputTrimJob || !['start','end'].includes(which)) return;
        stopOutputTrimPreview();
        state.invalidFields[which] = !Number.isFinite(value);
        state.error = Object.values(state.invalidFields).some(Boolean) ? '请输入秒数或 00:00.00 格式的时间' : '';
        if(!Number.isFinite(value)) { syncOutputTrimUi(); return; }
        else {
            state[which] = which === 'start' ? Math.max(0, Math.min(value, state.end - .1)) : Math.min(state.duration, Math.max(value, state.start + .1));
            if(seek){
                element('outputLightboxVideo').pause();
                element('outputLightboxVideo').currentTime = state[which];
            }
        }
        syncOutputTrimUi();
    }

    function setOutputTrimInput(which, seek=true){
        if(!openState || !targetValid() || destroyed || paused)return;
        const input = element(which === 'start' ? 'outputTrimStart' : 'outputTrimEnd');
        setOutputTrimValue(which, parseOutputTrimTime(input.value), seek);
    }

    function tickOutputTrimPreview(){
        outputTrimFrame = null;
        const state = outputTrimState;
        if(!state?.previewing || !openState || !targetValid() || paused || destroyed) return;
        if(element('outputLightboxVideo').currentTime >= state.end - .01 || element('outputLightboxVideo').ended || element('outputLightboxVideo').paused){
            stopOutputTrimPreview();
            element('outputLightboxVideo').currentTime = state.start;
            syncOutputTrimUi();
        } else outputTrimFrame = requestAnimationFrame(guard(tickOutputTrimPreview));
    }

    async function previewOutputVideoTrim(){
        if(!openState || !targetValid() || destroyed || paused)return;
        const state = outputTrimState;
        if(!state || outputTrimJob || Object.values(state.invalidFields || {}).some(Boolean)) return;
        if(state.previewing){ stopOutputTrimPreview(); syncOutputTrimUi(); return; }
        state.previewing = true;
        element('outputLightboxVideo').currentTime = state.start;
        syncOutputTrimUi();
        try {
            const playback = element('outputLightboxVideo').play();
            tickOutputTrimPreview();
            await playback;
        }
        catch(e){
            if(outputTrimState !== state) return;
            stopOutputTrimPreview(); state.error = '无法播放所选片段'; syncOutputTrimUi();
        }
    }

    async function applyOutputVideoTrim(){
        if(!openState || !targetValid() || destroyed || paused)return;
        const state = outputTrimState;
        if(!state || outputTrimJob || !canvas || isCanvasLockedByOther() || Object.values(state.invalidFields || {}).some(Boolean)) return;
        if(state.end - state.start < .1 - 1e-9 || (state.start <= .001 && state.end >= state.duration - .001)) return;
        const canvasId = canvas.id, source = nodes.find(n => n.id === currentOutputLightboxOutId);
        const rect = source ? nodeRect(source) : null, point = rect ? {x:rect.x + rect.w + 60, y:rect.y} : defaultPoint();
        const payload = {url:state.url, start_seconds:state.start, end_seconds:state.end, name:source?.name || outputImageName(state.url) || 'video.mp4'};
        const natural = {natural_w:element('outputLightboxVideo').videoWidth, natural_h:element('outputLightboxVideo').videoHeight};
        stopOutputTrimPreview();
        outputTrimJob = {canvasId}; state.error = ''; syncOutputTrimUi();
        try {
            const result = await window.CanvasApi.trimSmartCanvasVideo(payload, {errorFallback:'视频截取失败'});
            if(!result?.url) throw new Error('视频截取结果无效');
            if(canvas?.id !== canvasId || isCanvasLockedByOther()){
                showErrorModal(`片段已保存，但画布已切换或变为只读，未添加节点。文件：${result.url}`, '截取片段'); return;
            }
            const node = {id:uid('img'), type:'image', mediaKind:'video', x:point.x, y:point.y, ...natural,
                url:result.url, name:result.name || 'video-clip.mp4', clip_source_url:state.url,
                clip_start:result.start_seconds ?? state.start, clip_end:result.end_seconds ?? state.end,
                duration_seconds:result.duration_seconds ?? state.end - state.start};
            pushUndo(); nodes.push(node);
            const el = isNodeInCanvasViewport(node, 400) ? renderNode(node) : renderNodePlaceholder(node);
            nodesEl.appendChild(el);
            bindCanvasPreviewImageFallbacks(el); refreshIcons(); refreshGeometryAfterLayout(); scheduleSave();
            if(outputTrimState === state && openState && targetValid() && !paused && !destroyed) openOutputLightbox(node.url, node);
            setStatus('已截取片段并另存为新节点');
        } catch(e){
            if(outputTrimState === state) state.error = e.message || '视频截取失败';
            else setStatus(e.message || '视频截取失败');
        } finally { outputTrimJob = null; syncOutputTrimUi(); }
    }

    function releaseOutputLightboxVideo(){
        if(destroyed)return;
        window.CanvasMediaLoader?.unwatch(element('outputLightboxVideo'));
        element('outputLightboxVideo').onloadedmetadata = null;
        element('outputLightboxVideo').pause();
        element('outputLightboxVideo').removeAttribute('src');
        element('outputLightboxVideo').load();
    }

    function releaseOutputLightboxAudio(){
        if(destroyed)return;
        const audio = element('outputLightboxAudioHost')?.querySelector('audio');
        if(audio){
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
        }
        element('outputLightboxAudioHost')?.replaceChildren();
    }

    function openOutputLightbox(url, out){
        if(!url || destroyed || paused) return;
        clearOutputPreview(true);bind();
        window.CanvasMediaLoader?.begin('output-lightbox');
        currentOutputLightboxOutId = out?.id || '';
        currentOutputLightboxUrl = url;
        const meta = outputMetaFor(url, out);
        markOutputViewed(out, url);
        const mediaKind = out?.type === 'image' ? mediaKindForNode(out) : mediaKindForOutputItem(meta);
        const audioMode = isAudioUrl(url) || mediaKind === 'audio';
        const videoMode = !audioMode && (isVideoUrl(url) || mediaKind === 'video');
        viewKind=audioMode?'audio':videoMode?'video':'image';
        targetCheck=captureTarget(url,out);openState=true;
        setupOutputPromptPanel(meta);
        outputResolutionText('--', meta);
        currentOutputCompareUrl = outputCompareUrlFor(url, out);
        setOutputCompareMode(false);
        const groupDownloadItems = out?.type === 'group' ? groupImageItems(out) : [];
        if(element('outputDownloadAllBtn')){
            element('outputDownloadAllBtn').style.display = groupDownloadItems.length > 1 ? 'flex' : 'none';
        }
        element('outputTrimToggle').hidden = !videoMode;
        element('outputLightbox').classList.toggle('audio-mode', audioMode);
        element('outputPreview').classList.toggle('audio-mode', audioMode);
        element('outputLightboxImg').style.display = videoMode || audioMode ? 'none' : 'block';
        element('outputLightboxVideo').style.display = videoMode ? 'block' : 'none';
        element('outputLightboxAudio').style.display = audioMode ? 'flex' : 'none';
        element('outputCompareResult').style.display = videoMode || audioMode ? 'none' : 'block';
        element('outputCompareOriginal').style.display = videoMode || audioMode ? 'none' : 'block';
        if(audioMode){
            element('outputLightboxImg').removeAttribute('src');
            element('outputCompareResult').removeAttribute('src');
            element('outputCompareOriginal').removeAttribute('src');
            element('outputLightboxAudioTitle').textContent = out?.name || meta?.name || outputImageName(url) || 'Audio';
            const audio = document.createElement('audio');
            audio.controls = true;
            audio.preload = 'metadata';
            audio.src = canvasDisplayMediaUrl(url);
            element('outputLightboxAudioHost').replaceChildren(audio);
            outputResolutionText('Audio', meta);
            element('outputLightbox').classList.add('open');
            refreshIcons();
            return;
        }
        if(videoMode){
            element('outputLightboxImg').removeAttribute('src');
            element('outputCompareResult').removeAttribute('src');
            element('outputCompareOriginal').removeAttribute('src');
            element('outputLightboxVideo').onloadedmetadata = guard(() => {
                outputResolutionText(element('outputLightboxVideo').videoWidth && element('outputLightboxVideo').videoHeight
                    ? `${element('outputLightboxVideo').videoWidth} x ${element('outputLightboxVideo').videoHeight}`
                    : 'Video', meta);
            });
            window.CanvasMediaLoader?.watch(element('outputLightboxVideo'), element('outputPreview'), url);
            element('outputLightboxVideo').src = canvasDisplayMediaUrl(url);
            element('outputLightbox').classList.add('open');
            refreshIcons();
            return;
        }
        element('outputLightboxImg').draggable = false;
        element('outputCompareResult').draggable = false;
        element('outputCompareOriginal').draggable = false;
        element('outputLightboxImg').onload = guard(() => {
            outputResolutionText(`${element('outputLightboxImg').naturalWidth} x ${element('outputLightboxImg').naturalHeight}`, meta);
        });
        window.CanvasMediaLoader?.watch(element('outputLightboxImg'));
        element('outputLightboxImg').src = canvasDisplayMediaUrl(url);
        element('outputCompareResult').src = canvasDisplayMediaUrl(url);
        if(currentOutputCompareUrl)element('outputCompareOriginal').src = canvasDisplayMediaUrl(currentOutputCompareUrl);
        else element('outputCompareOriginal').removeAttribute('src');
        element('outputLightbox').classList.add('open');
        refreshIcons();
    }

    function clearOutputPreview(keepMediaPriority=false){
        if(destroyed)return;
        revision++;openState=false;targetCheck=()=>false;viewKind='';
        outputCompareDrag=false;clearCopyFeedback();
        for(const id of imageIds){const image=element(id);window.CanvasMediaLoader?.unwatch(image);image.onload=null;image.onerror=null;image.removeAttribute('src');}
        // Switching the open window must not briefly restart the background thumbnail queue.
        if(!keepMediaPriority)window.CanvasMediaLoader?.end('output-lightbox');
        resetOutputVideoTrim();
        element('outputTrimToggle').hidden = true;
        element('outputLightbox').classList.remove('open');
        element('outputLightbox').classList.remove('audio-mode');
        element('outputPreview').classList.remove('audio-mode');
        setOutputCompareMode(false);
        element('outputLightboxImg').removeAttribute('src');
        releaseOutputLightboxVideo();
        releaseOutputLightboxAudio();
        element('outputLightboxVideo').style.display = 'none';
        element('outputLightboxAudio').style.display = 'none';
        element('outputLightboxImg').style.display = 'block';
        element('outputCompareResult').style.display = 'block';
        element('outputCompareOriginal').style.display = 'block';
        element('outputCompareResult').removeAttribute('src');
        element('outputCompareOriginal').removeAttribute('src');
        if(element('outputDownloadAllBtn')){
            element('outputDownloadAllBtn').style.display = 'none';
        }
        resetOutputPreviewZoom();
        currentOutputCompareUrl = '';
        currentOutputMeta = null;
        currentOutputLightboxOutId = '';
        currentOutputLightboxUrl = '';
        element('outputLightboxAudioTitle').textContent = 'Audio';
        setupOutputPromptPanel(null);
    }
    function closeOutputLightbox(){clearOutputPreview();}
    return Object.freeze({get state(){return Object.freeze({open:openState,targetValid:openState && targetValid(),nodeId:currentOutputLightboxOutId,url:currentOutputLightboxUrl,kind:viewKind,compareOn,comparePosition,zoom:outputPreviewZoom,pan:Object.freeze({...outputPreviewPan}),dragging:Boolean(outputCompareDrag||outputPreviewPanDrag),prompt:currentOutputMeta?.run?.prompt||'',trimActive:Boolean(outputTrimState),trimStart:outputTrimState?.start??0,trimEnd:outputTrimState?.end??0,trimPreviewing:Boolean(outputTrimState?.previewing),trimBusy:Boolean(outputTrimJob),paused,destroyed});},
        open:openOutputLightbox,close:closeOutputLightbox,reset:closeOutputLightbox,navigate:navigateOutputLightbox,isPreviewingNode,previewedNodeIds,dataChanged,download,downloadAll,copyPrompt,rerun,bind,pause,resume,destroy,setTrimPoint,
        setOutputCompareMode,outputResolutionText,setupOutputPromptPanel,updateOutputCompareSlider,applyOutputPreviewZoom,resetOutputPreviewZoom,initOutputPreviewZoomEvents,initOutputCompareEvents,stopOutputTrimPreview,resetOutputVideoTrim,syncOutputTrimUi,toggleOutputVideoTrim,setOutputTrimValue,setOutputTrimInput,tickOutputTrimPreview,previewOutputVideoTrim,applyOutputVideoTrim,releaseOutputLightboxVideo,releaseOutputLightboxAudio
    });
}

function navigateOutputLightbox(direction){return classicOutputPreview.navigate(direction);}

function createImageCardFromOutput(url, point){
    if(!ensureCanvas() || !url) return;
    const mediaKind = mediaKindForRef(url);
    if(!['image','video'].includes(mediaKind)) return;
    const p = point || defaultPoint(0, 0);
    nodes.push({id:uid('img'), type:'image', x:p.x, y:p.y, url, name:outputImageName(url), mediaKind});
    render();
    scheduleSave();
}

async function downloadUrl(url, filename){
    if(window.MemberMediaDownload?.(url,filename))return;
    const res = await fetch(url);
    if(!res.ok) throw new Error('下载失败');
    const blob = await res.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function setOutputCompareMode(...args){return classicOutputPreview.setOutputCompareMode(...args);}

function outputResolutionText(...args){return classicOutputPreview.outputResolutionText(...args);}

function setupOutputPromptPanel(...args){return classicOutputPreview.setupOutputPromptPanel(...args);}

// Called once by canvas.js, at its original initialization position.
function bindClassicLogToggle(){
    canvasLogToggle?.addEventListener('click', event => {
        event.preventDefault();
        openCanvasLog();
    });
}

function updateOutputCompareSlider(...args){return classicOutputPreview.updateOutputCompareSlider(...args);}

function applyOutputPreviewZoom(...args){return classicOutputPreview.applyOutputPreviewZoom(...args);}

function resetOutputPreviewZoom(...args){return classicOutputPreview.resetOutputPreviewZoom(...args);}

function initOutputPreviewZoomEvents(...args){return classicOutputPreview.initOutputPreviewZoomEvents(...args);}

function initOutputCompareEvents(...args){return classicOutputPreview.initOutputCompareEvents(...args);}

function outputTrimTime(value){
    const cs = Math.max(0, Math.round(Number(value || 0) * 100));
    return `${String(Math.floor(cs / 6000)).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

function parseOutputTrimTime(value){
    const text = String(value).trim();
    if(!/^\d+(?:\.\d+)?$/.test(text) && !/^\d+(?::\d{1,2}){1,2}(?:\.\d+)?$/.test(text)) return NaN;
    return text.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}

function stopOutputTrimPreview(...args){return classicOutputPreview.stopOutputTrimPreview(...args);}

function resetOutputVideoTrim(...args){return classicOutputPreview.resetOutputVideoTrim(...args);}

function syncOutputTrimUi(...args){return classicOutputPreview.syncOutputTrimUi(...args);}

function toggleOutputVideoTrim(...args){return classicOutputPreview.toggleOutputVideoTrim(...args);}

function setOutputTrimValue(...args){return classicOutputPreview.setOutputTrimValue(...args);}

function setOutputTrimInput(...args){return classicOutputPreview.setOutputTrimInput(...args);}

function tickOutputTrimPreview(...args){return classicOutputPreview.tickOutputTrimPreview(...args);}

function previewOutputVideoTrim(...args){return classicOutputPreview.previewOutputVideoTrim(...args);}

function applyOutputVideoTrim(...args){return classicOutputPreview.applyOutputVideoTrim(...args);}

function releaseOutputLightboxVideo(...args){return classicOutputPreview.releaseOutputLightboxVideo(...args);}

function releaseOutputLightboxAudio(...args){return classicOutputPreview.releaseOutputLightboxAudio(...args);}

function openOutputLightbox(url, out){return classicOutputPreview.open(url,out);}

function closeOutputLightbox(...args){return classicOutputPreview.close(...args);}
