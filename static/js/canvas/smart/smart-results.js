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
    smartSelection.previewTarget(nodeId, index);
    hideRunTimerForNode(node);
    openImagePreview(nodeId, index);
    return true;
}

// Audio has its own source (including references without a node). It does not
// borrow or copy the image editor's target or the ordinary preview's player.
function createSmartAudioPreview(){
    let open=false, target=null, player=null, revision=0, paused=false, destroyed=false;
    const dom=new Map(), controls=[], mediaListeners=[], lifecycle=[];
    function element(id){
        if(destroyed)return null;
        if(!dom.has(id))dom.set(id,document.getElementById(id));
        return dom.get(id);
    }
    function targetValid(){
        if(!target || paused || destroyed || canvas?.id!==target.canvasId)return false;
        if(target.source==='external')return true;
        // Saving deliberately copies media metadata. That is still the same
        // audio source; node replacement, index movement or a new URL is not.
        const item=target.node.images?.[target.index];
        return nodes.includes(target.node) && item?.url===target.url && mediaKindForItem(item||{})==='audio';
    }
    function clear(records){for(const dispose of records.splice(0))dispose();}
    function listen(records,el,type,handler){
        if(!el)return;
        el.addEventListener(type,handler);records.push(()=>el.removeEventListener(type,handler));
    }
    function releasePlayer(){
        clear(mediaListeners);
        if(player){player.pause();player.removeAttribute('src');player.load();player=null;}
        element('smartAudioLightboxHost')?.replaceChildren();
    }
    function close(){
        if(destroyed)return;
        revision++;open=false;target=null;
        element('smartAudioLightbox')?.classList.remove('open');
        releasePlayer();
        const title=element('smartAudioLightboxTitle');if(title)title.textContent='Audio';
    }
    function bind(){
        if(destroyed || paused)return;
        clear(controls);clear(lifecycle);
        const modal=element('smartAudioLightbox');
        listen(controls,modal,'click',event=>{if(event.target===modal)close();});
        listen(controls,modal?.querySelector('.smart-audio-lightbox-card'),'click',event=>event.stopPropagation());
        listen(controls,modal?.querySelector('[data-audio-close]'),'click',close);
        listen(controls,modal?.querySelector('[data-audio-download]'),'click',download);
        listen(lifecycle,window,'pagehide',event=>{if(event.persisted)pause();else destroy();});
        listen(lifecycle,window,'pageshow',event=>{if(event.persisted)resume();});
    }
    function present(next){
        close();bind();target=next;open=true;
        element('smartAudioLightboxTitle').textContent=target.title;
        const audio=document.createElement('audio');player=audio;
        audio.controls=true;audio.preload='metadata';audio.src=target.url;
        const origin=revision;
        const verify=()=>{
            if(origin!==revision || player!==audio || !open || paused || destroyed)return;
            // A replaced node/item must never turn a native media event into an
            // operation on a new target. Close remains independent of validity.
            if(!targetValid())close();
        };
        for(const type of ['loadedmetadata','play','timeupdate'])listen(mediaListeners,audio,type,verify);
        element('smartAudioLightboxHost').replaceChildren(audio);
        element('smartAudioLightbox').classList.add('open');
    }
    function available(){return !destroyed && !paused && Boolean(element('smartAudioLightbox') && element('smartAudioLightboxHost') && element('smartAudioLightboxTitle'));}
    function openNode(nodeId,imageIndex=0){
        if(!available())return false;
        const node=nodes.find(n=>n.id===nodeId),index=Math.max(0,Number(imageIndex)||0),item=node?.images?.[index];
        if(mediaKindForItem(item||{})!=='audio' || !item?.url)return false;
        const next={source:'node',canvasId:canvas?.id,node,index,url:item.url,title:item.name||fileNameFromUrl(item.url)||'Audio'};
        if(smartImageEditor.state.open)closeImageEditor();
        activateSmartAudioPreviewTarget(node,index);
        present(next);refreshIcons();return true;
    }
    function openExternal({url,name}={}){
        if(!available() || !url)return false;
        if(smartImageEditor.state.open)closeImageEditor();
        present({source:'external',canvasId:canvas?.id,url,title:name||'音频'});
        return true;
    }
    function download(){
        if(!open || !targetValid() || target.source!=='node')return;
        return downloadPreviewFile(target.node.images[target.index]);
    }
    function isPreviewingNode(id){return Boolean(open && target?.source==='node' && target.node.id===id && targetValid());}
    function closeForNodes(ids){if(open && target?.source==='node' && new Set(ids).has(target.node.id))close();}
    function dataChanged(){if(open && !targetValid())close();}
    function pause(){if(destroyed || paused)return;close();clear(controls);paused=true;}
    function resume(){if(destroyed || !paused)return;paused=false;bind();}
    function destroy(){if(destroyed)return;close();clear(controls);clear(lifecycle);dom.clear();destroyed=true;}
    return Object.freeze({get state(){return Object.freeze({open,targetValid:open && targetValid(),source:target?.source||'',nodeId:target?.node?.id||'',index:target?.index??-1,paused,destroyed});},
        openNode,openExternal,close,download,isPreviewingNode,closeForNodes,dataChanged,reset:close,bind,pause,resume,destroy});
}
function releaseSmartAudioLightboxPlayer(){return smartAudioPreview.reset();}
function openSmartAudioLightbox(...args){return smartAudioPreview.openNode(...args);}
function closeSmartAudioLightbox(){return smartAudioPreview.close();}
function downloadSmartAudioLightbox(){return smartAudioPreview.download();}

function smartRunTaskLabel(run){
    const s = run?.settings || {};
    if(run?.kind === 'video') return s.videoModel || 'Video';
    if(s.engine === 'comfy'){
        if(s.comfyMode === 'custom') return s.comfyWorkflow || 'ComfyUI';
        const labels = {text:'文生图', enhance:'细节增强', edit:'图片编辑'};
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
    if(kind === 'model') return '.glb';
    if(kind === 'text') return '.txt';
    return fallback;
}

function downloadNameForMediaItem(item, fallbackPrefix='canvas-output'){
    const localName = fileNameFromUrl(item?.url || '');
    const preferred = mediaKindForItem(item)==='model' ? item?.name || localName : localName || item?.name || '';
    const ext = extensionForMediaItem(item);
    const randomName = `${fallbackPrefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}${ext}`;
    let name = safeExportFileName(preferred || randomName, randomName);
    if(!/\.[a-z0-9]{2,8}$/i.test(name)) name += ext;
    return name;
}

function downloadPreviewImage(){
    const node = nodes.find(n => n.id === smartImageEditor.state.nodeId);
    const image = node?.images?.[smartImageEditor.state.imageIndex];
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
    const node = nodes.find(n => n.id === smartImageEditor.state.nodeId);
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
    const node = nodes.find(n => n.id === smartImageEditor.state.nodeId);
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
    return window.CanvasCore.formatCostAmount(value);
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
        runMs:typeof runMs==='number' && Number.isFinite(runMs) && runMs>0 ? runMs : null,
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
    if(kind==='image')return window.PixmaxImagePreview.open({item:{url,name:fileNameFromUrl(url)||'图片',kind:'image'}});
    const node = {id:'__smart_log_preview__', type:'smart-image', images:[{url, name:'log-preview', kind}], title:kind === 'video' ? 'Video' : 'Image'};
    smartSelection.withLogPreview(() => {
        nodes.push(node);
        try { smartImageEditor.openDetached(node, 0); }
        finally { nodes = nodes.filter(n => n.id !== node.id); }
    });
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
    const costMode = smartLogList.closest('.log-panel')?.classList.contains('cost-mode');
    const logMarkup = logs.length ? logs.map((log,index) => {
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
        const costAmount = window.CanvasCore.formatCostAmount(cost?.amount_micros, cost?.currency);
        const costChip = cost?.status === 'priced'
            ? `<span class="log-chip ${cost.source === 'estimated' ? 'cost-estimated' : ''}" title="${cost.source === 'estimated' ? '根据历史价格回算' : '调用时价格快照'}">${escapeHtml(costAmount)}${cost.source === 'estimated' ? ' 预估' : ''}</span>`
            : cost?.status === 'unknown' ? `<span class="log-chip cost-unknown">${escapeHtml(window.VolcengineVideoBilling?.pendingLabel(cost) || '待核算')}</span>` : '';
        const subParts = [
            ...(window.VolcengineVideoBilling?.details(log) || []),
            `输出 ${(log.outputs || []).length}`,
            taskId ? `ID ${taskId}` : '',
            backend && backend!==log.platform ? backend : ''
        ].filter(Boolean);
        const detail = `<article class="log-item ${log.status === 'failed' ? 'failed' : ''}" data-log-index="${index}">
            <div class="log-main">
                <div class="log-entry-head"><span class="log-chip ${log.status === 'failed' ? 'status-failed' : 'status-ok'}">${escapeHtml(log.status === 'failed' ? '失败' : '成功')}</span>
                    <time class="log-entry-date">${escapeHtml(date)}</time><span class="log-entry-cost">${costChip}</span></div>
                <div class="log-meta">
                    <span class="log-chip">${escapeHtml(log.platform || '-')}</span>
                    ${log.model ? `<span class="log-chip">${escapeHtml(log.model)}</span>` : ''}
                    <span class="log-chip">${escapeHtml(window.CanvasLedger.durationLabel(log.runMs,formatRunDuration))}</span>
                </div>
                <div class="log-subline">${subParts.map(part => `<span title="${escapeAttr(part)}">${escapeHtml(part)}</span>`).join('')}</div>
                ${log.error ? `<div class="log-error" title="${escapeAttr(log.error)}">${escapeHtml(log.error)}</div>` : ''}
                ${window.CanvasLedger.promptMarkup(log.prompt,escapeHtml)}
            </div>
            <div class="log-thumbs">${thumbs}</div>
        </article>`;
        return costMode ? window.CanvasLedger.costRow(log,index,{escape:escapeHtml,date,model:log.model,cost:costChip,thumbs,detail}) : detail;
    }).join('') : `<div class="log-empty">${escapeHtml('还没有生成日志')}</div>`;
    smartLogList.innerHTML=costMode && logs.length ? window.CanvasLedger.costTable(logMarkup) : logMarkup;
    window.CanvasLedger.bindCostDetails(smartLogList);
    bindSmartPreviewImageFallbacks(smartLogList);
    smartLogList.querySelectorAll('[data-url]').forEach(el => {
        el.onclick = e => {
            e.stopPropagation();
            smartLogPreviewNode(el.dataset.url, el.dataset.kind || 'image');
        };
    });
    window.CanvasLedger.bindLogPrompts(smartLogList,logs,formatRunDuration);
    refreshIcons();
    if(!ledger) void backfillSmartHistoricalVideoCosts();
}

function openSmartCanvasLog(mode='logs'){
    if(!canvas) return;
    document.getElementById('smartLogPanel')?.classList.toggle('cost-mode', mode === 'cost');
    const title = document.getElementById('smartLogTitle');
    if(title) title.textContent = mode === 'cost' ? '费用中心' : '生成日志';
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
    if(node.runFinishedAt && node.runElapsedMs===null)return null;
    if(node.runFinishedAt && node.runStartedAt) return Number(node.runElapsedMs) || (Number(node.runFinishedAt) - Number(node.runStartedAt));
    if(node.runStartedAt) return nowMs() - Number(node.runStartedAt);
    return 0;
}

function hideRunTimerForNode(node){
    if(!node || node.runTimerHidden || smartNodePendingCount(node) || node.running || !node.runFinishedAt) return false;
    node.runTimerHidden = true;
    scheduleSave();
    return true;
}

function refreshRunTimerPills(){
    if(!document.querySelector('[data-run-timer]')){
        if(runTimerInterval){clearInterval(runTimerInterval);runTimerInterval=null;}
        return;
    }
    const active = nodes.some(n => n.type !== 'smart-prompt' && !n.runTimerHidden && (smartNodePendingCount(n) || n.running));
    const byId = new Map(nodes.map(node => [node.id, node]));
    document.querySelectorAll('[data-run-timer]').forEach(el => {
        const node = byId.get(el.dataset.runTimer);
        if(!node || node.runTimerHidden || node.type === 'smart-prompt') {
            el.remove();
            return;
        }
        const elapsed=nodeRunElapsedMs(node),label=elapsed===null?'耗时未知':formatRunDuration(elapsed);
        if(el.textContent !== label) el.textContent = label;
        el.classList.toggle('done', Boolean(!smartNodePendingCount(node) && !node.running && node.runFinishedAt));
    });
    if(active && !runTimerInterval) runTimerInterval = setInterval(refreshRunTimerPills, 1000);
    if(!active && runTimerInterval){ clearInterval(runTimerInterval); runTimerInterval = null; }
}

function applyPreviewTransform(...args){return smartPreviewGestures.applyPreviewTransform(...args);}

function resetPreviewTransform(...args){return smartPreviewGestures.resetPreviewTransform(...args);}

// Panorama owns its session and GPU cache; submitted exports outlive the UI.
function createSmartPanoramaPreview(){
    const PANORAMA_RATIO_PRESETS = {
        square:{w:1, h:1},
        portrait:{w:2, h:3},
        landscape:{w:3, h:2},
        portrait43:{w:3, h:4},
        landscape43:{w:4, h:3},
        story:{w:9, h:16},
        wide:{w:16, h:9},
        ultrawide:{w:21, h:9},
        ultratall:{w:9, h:21}
    };
    const panoramaState = {
        enabled:false,
        ratio:'wide',
        customW:16,
        customH:9,
        fov:75,
        yaw:0,
        pitch:0,
        drag:null,
        three:null,
        renderer:null,
        scene:null,
        camera:null,
        sphere:null,
        texture:null,
        threeLoadPromise:null,
        image:null,
        animationId:0,
        loadedSrc:'',
        loadToken:0
    };

    let paused=false,destroyed=false,exportsPending=0;
    const dom=new Map(),listeners=new Map();
    function element(id){if(destroyed)return null;if(!dom.has(id))dom.set(id,document.getElementById(id));return dom.get(id);}
    function usable(){return panoramaState.enabled && !destroyed && !paused && smartImageEditor.isPanoramaPreviewing();}
    function clearListeners(){for(const [el,type,fn,options] of listeners.values())el.removeEventListener(type,fn,options);listeners.clear();}
    function listen(el,type,fn,options){if(!el)return;const handler=event=>{if(!destroyed && !paused)fn(event);};el.addEventListener(type,handler,options);listeners.set(handler,[el,type,handler,options]);}
    function endDrag(){panoramaState.drag=null;element('previewStage')?.classList.remove('panning');}
    function beginDrag(event){
        if(!usable() || event.button!==0 || event.target.closest('.preview-tools-overlay, .preview-download-overlay, .preview-compare-handle, video'))return false;
        event.preventDefault();event.stopPropagation();panoramaState.drag={clientX:event.clientX,clientY:event.clientY,yaw:panoramaState.yaw,pitch:panoramaState.pitch};
        element('previewStage')?.classList.add('panning');return true;
    }
    function moveDrag(event){
        if(!panoramaState.drag)return false;if(!usable()){endDrag();return false;}
        event.preventDefault();const dx=event.clientX-panoramaState.drag.clientX,dy=event.clientY-panoramaState.drag.clientY;
        panoramaState.yaw=panoramaState.drag.yaw-dx*.18;panoramaState.pitch=Math.max(-85,Math.min(85,panoramaState.drag.pitch+dy*.18));
        element('previewStage')?.classList.add('panning');return true;
    }
    function zoom(event){if(!usable())return false;const factor=event.deltaY<0?.92:1/.92;panoramaState.fov=Math.max(35,Math.min(100,panoramaState.fov*factor));updateZoomLabel();return true;}
    function setCustomRatio(){if(destroyed || paused)return;panoramaState.ratio='custom';panoramaState.customW=Math.max(1,Math.min(999,Number(element('panoramaRatioW')?.value||16)));panoramaState.customH=Math.max(1,Math.min(999,Number(element('panoramaRatioH')?.value||9)));refreshPanoramaControls();resizePanoramaViewer();}
    function refreshAvailability(){
        if(destroyed || paused)return;const preview=smartImageEditor.state.open && smartImageEditor.state.mode==='preview';
        const image=smartImageEditor.panoramaTarget().image || currentEditImage().image;
        const available=preview && mediaKindForItem(image||{})!=='video';
        if(!available && panoramaState.enabled)disposePanoramaPreview();
        element('panoramaToggleBtn')?.style.setProperty('display',available?'inline-flex':'none');
        element('panoramaExportBtn')?.style.setProperty('display',available && panoramaState.enabled?'inline-flex':'none');
    }
    function bind(){
        if(destroyed || paused)return;clearListeners();
        for(const button of element('panoramaControls')?.querySelectorAll('[data-panorama-ratio]')||[])listen(button,'click',event=>{event.preventDefault();event.stopPropagation();applyPanoramaRatio(button.dataset.panoramaRatio||'wide');});
        for(const id of ['panoramaRatioW','panoramaRatioH'])listen(element(id),'input',setCustomRatio);
        listen(element('panoramaToggleBtn'),'click',togglePanoramaPreview);listen(element('panoramaExportBtn'),'click',exportPanoramaFrame);
        listen(element('previewStage'),'mousedown',beginDrag,true);
        listen(element('previewStage'),'wheel',event=>{if(!usable())return;event.preventDefault();event.stopPropagation();zoom(event);},{passive:false,capture:true});
        listen(window,'resize',()=>{if(usable())resizePanoramaViewer();});
    }
    function releaseRenderer(replaceCanvas=false){
        stopPanoramaLoop();disposePanoramaTexture();
        const sphere=panoramaState.sphere,renderer=panoramaState.renderer;
        panoramaState.sphere=null;panoramaState.scene=null;panoramaState.camera=null;panoramaState.renderer=null;
        sphere?.geometry.dispose();sphere?.material.dispose();renderer?.dispose();renderer?.forceContextLoss();
        // A lost WebGL context cannot be reused on a cached-page return.
        if(renderer && replaceCanvas){const old=element('panoramaCanvas');if(old){const next=old.cloneNode(false);old.replaceWith(next);dom.set('panoramaCanvas',next);}}
    }
    function pause(){if(paused || destroyed)return;disposePanoramaPreview();clearListeners();releaseRenderer(true);paused=true;}
    function resume(){if(!paused || destroyed)return;paused=false;bind();refreshAvailability();}
    function destroy(){if(destroyed)return;paused=false;disposePanoramaPreview();clearListeners();releaseRenderer();dom.clear();destroyed=true;}

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
    function panoramaSource(){if(destroyed || paused)return '';const image=smartImageEditor.panoramaTarget().image;return image?displayMediaUrl(image):'';}
    async function ensurePanoramaRenderer(current=()=>usable()){
        const canvas=element('panoramaCanvas');if(!canvas || !current())return false;
        if(!panoramaState.three){
            const threeModulePath='/static/vendor/js/three-0.160.0.module.js',threeModuleUrl=window.FrontendVersion?.versionedUrl(threeModulePath)||threeModulePath;
            const promise=panoramaState.threeLoadPromise ||= import(threeModuleUrl);
            try {const THREE=await promise;if(!current() || destroyed || paused)return false;panoramaState.three=THREE;}
            catch(error){if(panoramaState.threeLoadPromise===promise)panoramaState.threeLoadPromise=null;throw error;}
        }
        if(!current() || destroyed || paused)return false;
        const THREE=panoramaState.three;
        try {
            if(!panoramaState.renderer){
                panoramaState.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true});
                panoramaState.renderer.setPixelRatio(1);panoramaState.renderer.outputColorSpace=THREE.SRGBColorSpace;
            }
            if(!panoramaState.scene){
                panoramaState.scene=new THREE.Scene();panoramaState.camera=new THREE.PerspectiveCamera(panoramaState.fov,16/9,1,1200);
                const geometry=new THREE.SphereGeometry(500,96,64);geometry.scale(-1,1,1);
                const material=new THREE.MeshBasicMaterial({color:0xffffff});panoramaState.sphere=new THREE.Mesh(geometry,material);panoramaState.scene.add(panoramaState.sphere);
            }
        } catch(error){releaseRenderer(true);throw error;}
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
        if(!usable())return false;
        const canvas = element('panoramaCanvas');
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
    function renderPanoramaFrame(){if(drawPanoramaFrame())startPanoramaLoop();}
    function startPanoramaLoop(){
        stopPanoramaLoop();if(!usable() || !panoramaState.image)return;
        const token=panoramaState.loadToken;
        const id=requestAnimationFrame(()=>{if(panoramaState.animationId!==id || token!==panoramaState.loadToken)return;panoramaState.animationId=0;if(!usable()){disposePanoramaPreview();return;}renderPanoramaFrame();});
        panoramaState.animationId=id;
    }
    function stopPanoramaLoop(){
        if(panoramaState.animationId) cancelAnimationFrame(panoramaState.animationId);
        panoramaState.animationId = 0;
    }
    function resizePanoramaViewer(){
        if(destroyed || paused)return;
        const stage = element('panoramaStage');
        const frame = element('previewFrame');
        const canvas = element('panoramaCanvas');
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
    async function loadPanoramaTexture(src=panoramaSource()){
        if(!usable() || !src || src!==panoramaSource())return;
        const token=++panoramaState.loadToken,targetCurrent=smartImageEditor.guardPanoramaCallback(()=>true);
        const current=()=>token===panoramaState.loadToken && usable() && Boolean(targetCurrent());
        const stage=element('panoramaStage');stage?.classList.remove('ready');stopPanoramaLoop();disposePanoramaTexture();panoramaState.loadedSrc='';
        try {
            const [ready,original]=await Promise.all([ensurePanoramaRenderer(current),smartImageEditor.ensurePanoramaImage()]);
            if(!current() || !original)return;
            if(!ready)throw new Error('全景渲染器初始化失败');
            if(!applyPanoramaTexture(original.image))throw new Error('全景纹理加载失败');
            panoramaState.image=original.image;panoramaState.loadedSrc=src;stage?.classList.add('ready');resizePanoramaViewer();startPanoramaLoop();
        } catch(error){if(!current())return;stage?.classList.add('ready');toast('360全景加载失败');}
    }
    function refreshPanoramaControls(){
        if(destroyed || paused)return;
        const controls = element('panoramaControls');
        const custom = element('panoramaCustomRatio');
        if(controls) controls.style.display = panoramaState.enabled ? 'inline-flex' : 'none';
        if(custom) custom.style.display = panoramaState.enabled && panoramaState.ratio === 'custom' ? 'inline-flex' : 'none';
        (element('panoramaControls')?.querySelectorAll('[data-panorama-ratio]')||[]).forEach(btn => {
            btn.classList.toggle('active', btn.dataset.panoramaRatio === panoramaState.ratio);
        });
        const w = element('panoramaRatioW');
        const h = element('panoramaRatioH');
        if(w && document.activeElement !== w) w.value = panoramaState.customW;
        if(h && document.activeElement !== h) h.value = panoramaState.customH;
    }
    function setPanoramaEnabled(enabled){
        if(destroyed || paused)return;
        const next=Boolean(enabled);if(next && (!smartImageEditor.isPanoramaPreviewing() || !panoramaSource()))return;
        if(panoramaState.enabled===next)return;
        if(!next){disposePanoramaPreview();refreshComparePanel();updateZoomLabel();return;}
        panoramaState.enabled=true;
        element('previewStage')?.classList.add('panorama-on');element('imagePreviewTools')?.classList.add('panorama-tools-on');
        element('panoramaStage')?.style.setProperty('display','block');element('panoramaToggleBtn')?.classList.add('active');
        element('panoramaExportBtn')?.style.setProperty('display','inline-flex');
        smartPreviewGestures.setPanoramaPresentation(true);smartPreviewGestures.resetPose();applyPreviewTransform();
        resizePanoramaViewer();loadPanoramaTexture(panoramaSource());updatePreviewMetaHint('360全景：拖动转动，滚轮缩放，可调整视窗比例');
        refreshPanoramaControls();updateZoomLabel();
    }
    function togglePanoramaPreview(){setPanoramaEnabled(!panoramaState.enabled);}
    async function exportPanoramaFrame(){
        if(!usable() || !canvas || isSmartCanvasLocked())return;
        const canvasEl=element('panoramaCanvas');if(!canvasEl){toast('导出全景失败');return;}
        // The encoded frame and its writeback context belong to the submitted task.
        const editing=smartImageEditor.panoramaTarget(),rect=editing.node?nodeRect(editing.node):null;
        const rawName=editing.image?.name || fileNameFromUrl(editing.image?.url||'') || 'panorama';
        const base=String(rawName).replace(/\.[a-z0-9]{2,8}$/i,'')||'panorama';
        const task=Object.freeze({canvasId:canvas.id,width:canvasEl.width,height:canvasEl.height,
            filename:safeExportFileName(base+'-panorama.png','panorama.png'),point:Object.freeze(rect?{x:rect.x+rect.width+240,y:rect.y+rect.height/2}:viewportCenter())});
        exportsPending++;
        try {
            if(!drawPanoramaFrame())throw new Error('导出全景失败');
            const blob=await new Promise(resolve=>canvasEl.toBlob(resolve,'image/png'));if(!blob)throw new Error('导出全景失败');
            const uploaded=await uploadFiles([new File([blob],task.filename,{type:'image/png'})]);
            if(!uploaded[0]?.url)throw new Error('导出全景失败');
            const frame={...uploaded[0],kind:'image',natural_w:task.width,natural_h:task.height};
            if(canvas?.id!==task.canvasId || isSmartCanvasLocked()){toast('全景画面已上传，但画布已切换或变为只读，未添加节点。文件：'+frame.url);return;}
            applySmartPanoramaExport(frame,task.point);toast('已导出到画布');
        } catch(error){toast((error.message||'导出全景失败').slice(0,120));}
        finally {exportsPending--;}
    }
    function resetPanoramaView(){
        if(destroyed || paused)return;
        panoramaState.fov = 75;
        panoramaState.yaw = 0;
        panoramaState.pitch = 0;
        resizePanoramaViewer();
        updateZoomLabel();
    }
    function disposePanoramaPreview(){
        if(destroyed)return;
        stopPanoramaLoop();disposePanoramaTexture();endDrag();panoramaState.enabled=false;panoramaState.loadedSrc='';panoramaState.loadToken++;
        element('panoramaStage')?.classList.remove('ready');element('panoramaStage')?.style.setProperty('display','none');
        element('previewStage')?.classList.remove('panorama-on','panning');element('imagePreviewTools')?.classList.remove('panorama-tools-on');
        element('panoramaControls')?.style.setProperty('display','none');element('panoramaCustomRatio')?.style.setProperty('display','none');
        element('panoramaToggleBtn')?.classList.remove('active');element('panoramaExportBtn')?.style.setProperty('display','none');
        const frame=element('previewFrame');if(frame){frame.style.width='';frame.style.height='';}
        smartPreviewGestures.setPanoramaPresentation(false);
    }
    function applyPanoramaRatio(value){
        if(destroyed || paused)return;
        panoramaState.ratio = PANORAMA_RATIO_PRESETS[value] ? value : 'custom';
        refreshPanoramaControls();
        resizePanoramaViewer();
    }
    return Object.freeze({get state(){return Object.freeze({enabled:panoramaState.enabled,targetValid:Boolean(panoramaState.enabled && !destroyed && !paused && smartImageEditor.isPanoramaPreviewing()),ratio:panoramaState.ratio,customW:panoramaState.customW,customH:panoramaState.customH,fov:panoramaState.fov,yaw:panoramaState.yaw,pitch:panoramaState.pitch,dragging:Boolean(panoramaState.drag),ready:Boolean(panoramaState.image && panoramaState.texture),initialized:Boolean(panoramaState.renderer),framePending:Boolean(panoramaState.animationId),loadedSrc:panoramaState.loadedSrc,exportsPending,paused,destroyed});},
        setEnabled:setPanoramaEnabled,toggle:togglePanoramaPreview,close:()=>setPanoramaEnabled(false),reset:disposePanoramaPreview,
        ratioValue:()=>Object.freeze({...panoramaRatioValue()}),resolutionValue:()=>Object.freeze(panoramaResolutionValue()),source:panoramaSource,setRatio:applyPanoramaRatio,setCustomRatio,resetView:resetPanoramaView,resize:resizePanoramaViewer,
        exportFrame:exportPanoramaFrame,retry:loadPanoramaTexture,refreshControls:refreshPanoramaControls,refreshAvailability,beginDrag,moveDrag,endDrag,zoom,bind,pause,resume,destroy
    });
}
function panoramaRatioValue(...args){return smartPanoramaPreview.ratioValue(...args);}
function panoramaResolutionValue(...args){return smartPanoramaPreview.resolutionValue(...args);}
function panoramaSource(...args){return smartPanoramaPreview.source(...args);}
function resizePanoramaViewer(...args){return smartPanoramaPreview.resize(...args);}
function loadPanoramaTexture(...args){return smartPanoramaPreview.retry(...args);}
function refreshPanoramaControls(...args){return smartPanoramaPreview.refreshControls(...args);}
function setPanoramaEnabled(...args){return smartPanoramaPreview.setEnabled(...args);}
function togglePanoramaPreview(...args){return smartPanoramaPreview.toggle(...args);}
function exportPanoramaFrame(...args){return smartPanoramaPreview.exportFrame(...args);}
function resetPanoramaView(...args){return smartPanoramaPreview.resetView(...args);}
function disposePanoramaPreview(...args){return smartPanoramaPreview.reset(...args);}
function applyPanoramaRatio(...args){return smartPanoramaPreview.setRatio(...args);}
function bindSmartPanoramaControls(...args){return smartPanoramaPreview.bind(...args);}

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

function setPreviewComparePos(clientX){return smartPreviewGestures.setComparePositionAt(clientX);}
function syncPreviewFrameSize(){return smartPreviewGestures.syncFrameSize();}
function updatePreviewMetaHint(...args){return smartPreviewGestures.updateMetadata(...args);}
function refreshComparePanel(){return smartPreviewGestures.refresh();}
function togglePreviewCompare(){return smartPreviewGestures.toggleComparison();}

function currentPreviewVideo(){
    if(!smartImageEditor.state.open) return null;
    if(mediaKindForItem(currentEditImage().image || {}) !== 'video') return null;
    return smartPreviewGestures.video();
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

function updatePreviewNavButtons(){
    const node = nodes.find(n => n.id === smartImageEditor.state.nodeId);
    const count = Math.max(0, (node?.images || []).filter(img => img?.url).length);
    const show = smartImageEditor.state.open && smartImageEditor.state.mode === 'preview' && count > 1;
    document.getElementById('previewPrevBtn')?.classList.toggle('visible', show);
    document.getElementById('previewNextBtn')?.classList.toggle('visible', show);
}

function navigatePreviewImage(delta){return smartImageEditor.navigate(delta);}

function openImagePreview(nodeId, imageIndex=0){
    const node = nodes.find(n => n.id === nodeId);
    const image = node?.images?.[Math.max(0, Number(imageIndex) || 0)];
    if(!node||!image?.url)return;
    if(mediaKindForItem(image || {}) === 'audio') return openSmartAudioLightbox(nodeId, imageIndex);
    if(['image','video'].includes(mediaKindForItem(image || {})))return window.PixmaxImagePreview.openNode(node,Math.max(0,Number(imageIndex)||0));
    openImageEditor(nodeId, imageIndex);
    setImageEditMode('preview');
}

// Called once by smart-canvas.js, at its original initialization position.
function bindSmartPreviewPanEvents(...args){return smartPreviewGestures.bindSmartPreviewPanEvents(...args);}

// Called once by smart-canvas.js, at its original initialization position.
function bindSmartPreviewCompareEvents(...args){return smartPreviewGestures.bindSmartPreviewCompareEvents(...args);}

// The existing preview owner also owns ordinary comparison, metadata and media
// presentation. The editor remains the sole owner of the target and navigation.
function createSmartPreviewGestures(){
    let previewZoom = 1.0;
    let previewPan = {x:0, y:0};
    let previewPanDrag = null;
    let previewCompareDrag = false;
    let previewComparePos = 50;

    let paused=false,destroyed=false,captured=null;
    let previewCompareOn = false;
    let previewCompareIndex = -1;
    let previewMetaExtraText = '';

    let active=false, viewRevision=0, comparisonCount=0;
    const dom=new Map(), mediaIds=['previewCurrentImage','previewCompareImage','previewCurrentVideo'];
    const frames=new Set(), thumbnailCleanup=[];
    const element=id=>{if(destroyed)return null;if(!dom.has(id))dom.set(id,document.getElementById(id));return dom.get(id);};
    // Invalidate callbacks both when this view changes and when the editor target
    // or mode changes. Do not keep a second copy of the current image target.
    function guard(fn){const revision=viewRevision;return smartImageEditor.guardPreviewCallback((...args)=>{if(!destroyed && !paused && active && revision===viewRevision)return fn(...args);});}
    function queueFrame(fn){if(destroyed || paused || !active)return;const callback=guard(fn);const id=requestAnimationFrame(()=>{frames.delete(id);callback();});frames.add(id);}
    function clearFrames(){for(const id of frames)cancelAnimationFrame(id);frames.clear();}
    function clearThumbnails(){
        for(const dispose of thumbnailCleanup.splice(0))dispose();
        const host=element('compareThumbs');
        host?.querySelectorAll('img').forEach(img=>{window.CanvasMediaLoader?.unwatch(img);img.onload=null;img.onerror=null;img.removeAttribute('src');img.removeAttribute('data-canvas-media-src');});
        if(host){host.innerHTML='';host.style.display='none';}
    }
    function invalidateView(){
        viewRevision++;clearFrames();clearThumbnails();
        for(const id of mediaIds){const media=element(id);if(media){media.onload=null;media.onerror=null;media.onloadedmetadata=null;media.onloadeddata=null;}}
    }
    function resetComparison(){previewCompareOn=false;previewCompareIndex=-1;comparisonCount=0;}
    function hideComparison({clearSource=true}={}){
        endCompare();clearThumbnails();
        element('previewStage')?.classList.remove('compare-on');
        for(const id of ['previewCompareLayer','previewCompareHandle']){const el=element(id);if(el)el.style.display='none';}
        element('compareToggleBtn')?.classList.remove('active');
        if(clearSource){const image=element('previewCompareImage');if(image){image.onload=null;image.onerror=null;window.CanvasMediaLoader?.unwatch(image);image.removeAttribute('src');}}
    }
    function renderMetadata(){
        const hint=element('previewMetaHint');if(hint)hint.textContent=[previewResolutionText(),previewMetaExtraText].filter(Boolean).join(' · ');
    }
    // Repair associated control state once at the command boundary; the presenter
    // below only reads that choice. Existing dimension discovery/save is retained.
    function refresh(){
        if(destroyed || paused || !active || !smartImageEditor.isPreviewing())return;
        invalidateView();
        const editing=currentEditImage(),kind=mediaKindForItem(editing.image||{});
        const sources=kind==='image'?previewCompareSources():[];
        comparisonCount=sources.length;
        if(kind!=='image' || !sources.length){resetComparison();hideComparison();}
        else if(previewCompareIndex>=sources.length)previewCompareIndex=-1;
        const prompt=editing.node?.runPrompt?`提示词：${editing.node.runPrompt.slice(0,60)}`:'';
        previewMetaExtraText=smartPanoramaPreview.state.enabled?'360全景：拖动转动，滚轮缩放，可调整视窗比例':prompt;
        if(!smartPanoramaPreview.state.enabled && previewCompareOn && previewCompareIndex<0)previewMetaExtraText+=(prompt?' · ':'')+'点缩略图开始对比';
        element('previewStage').style.display='inline-flex';
        element('compareToggleBtn').style.display=kind==='image'?'inline-flex':'none';
        renderPreview(editing,sources);
    }
    function selectComparison(index){
        if(!usable() || smartPanoramaPreview.state.enabled || mediaKindForItem(currentEditImage().image||{})!=='image')return;
        const sources=previewCompareSources(),next=Number(index);
        if(!previewCompareOn || !Number.isInteger(next) || next<0 || next>=sources.length){refresh();return;}
        previewCompareIndex=previewCompareIndex===next?-1:next;refresh();
    }
    function bindThumbnailFallbacks(host){
        host.querySelectorAll('img[data-preview-src][data-original-src]').forEach(img=>{
            const handler=guard(()=>{
                if(!img.isConnected || img.dataset.mediaPriorityPaused || img.dataset.canvasMediaSrc)return;
                if(img.dataset.smartGroupSrc && !img.hasAttribute('src'))return;
                const original=img.dataset.originalSrc||'';
                if(original && img.getAttribute('src')!==original)img.src=window.MemberMediaUrl?window.MemberMediaUrl(original):original;
            });
            img.dataset.previewFallbackBound='1';img.addEventListener('error',handler);
            thumbnailCleanup.push(()=>img.removeEventListener('error',handler));
        });
    }
    function clearImage(){
        if(destroyed)return;
        invalidateView();const image=element('previewCurrentImage');
        if(image){window.CanvasMediaLoader?.unwatch(image);image.removeAttribute('src');}
    }
    function setImageSource(url){if(destroyed || paused || !active || !currentEditImage().image)return;const image=element('previewCurrentImage');if(image){image.crossOrigin='anonymous';image.src=url;}}
    function prepare(){
        if(destroyed)return;active=true;invalidateView();resetComparison();previewMetaExtraText='';
        hideComparison();const hint=element('previewMetaHint');if(hint)hint.textContent='';cancel();resetPreviewTransform();
    }
    function leave(){
        if(destroyed)return;invalidateView();cancel();hideComparison();
        const stage=element('previewStage');if(stage)stage.style.display='none';
        const toggle=element('compareToggleBtn');if(toggle)toggle.style.display='none';
    }
    // Closing releases per-view work. Scoped controls remain reusable until pause
    // or destroy; neither operation touches workspace listeners.
    function release(){
        if(destroyed)return;invalidateView();cancel();resetPreviewTransform();resetComparison();previewMetaExtraText='';hideComparison();
        for(const id of mediaIds){const media=element(id);if(!media)continue;window.CanvasMediaLoader?.unwatch(media);media.pause?.();media.removeAttribute('src');if(id==='previewCurrentVideo'){media.load?.();media.style.display='none';}}
        const hint=element('previewMetaHint');if(hint)hint.textContent='';
        const frame=element('previewFrame');if(frame){frame.style.width='';frame.style.height='';}
        active=false;
    }
    function pausePresentation(){
        invalidateView();
        for(const id of mediaIds){const media=element(id);if(media){window.CanvasMediaLoader?.unwatch(media);media.pause?.();}}
    }
    function setPanoramaPresentation(next){
        if(destroyed)return;
        const image=element('previewCurrentImage');if(image)image.style.display=next?'none':'block';
        const toggle=element('compareToggleBtn');if(toggle)toggle.style.display=next?'none':'inline-flex';
        if(next){previewCompareOn=false;invalidateView();hideComparison();}
    }
    function setPreviewComparePos(clientX){
        const frame = element('previewFrame');
        const stage = element('previewStage');
        if(!frame || !stage) return;
        const rect = frame.getBoundingClientRect();
        const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / Math.max(1, rect.width)) * 100));
        previewComparePos=pct;
        stage.style.setProperty('--compare-pos', `${pct}%`);
    }

    function syncPreviewFrameSize(){
        const frame = element('previewFrame');
        if(smartPanoramaPreview.state.enabled){
            resizePanoramaViewer();
            return;
        }
        const currentImg = element('previewCurrentImage');
        const currentVideo = element('previewCurrentVideo');
        const compareImg = element('previewCompareImage');
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
        const currentImg = element('previewCurrentImage');
        const currentVideo = element('previewCurrentVideo');
        const originalSize=smartImageEditor.imageResolution();
        const w = Number(image.natural_w || image.width || image.w || 0) || Number(currentVideo?.videoWidth || 0) || Number(currentImg?.naturalWidth || 0) || originalSize.width;
        const h = Number(image.natural_h || image.height || image.h || 0) || Number(currentVideo?.videoHeight || 0) || Number(currentImg?.naturalHeight || 0) || originalSize.height;
        if(!w || !h) return '';
        return `分辨率: ${Math.round(w)} x ${Math.round(h)}`;
    }

    function updatePreviewMetaHint(extraText=previewMetaExtraText){
        if(destroyed || paused || !active || !currentEditImage().image)return;
        previewMetaExtraText = extraText || '';
        const hint = element('previewMetaHint');
        if(!hint) return;
        hint.textContent = [previewResolutionText(), previewMetaExtraText].filter(Boolean).join(' · ');
    }

    function rememberPreviewImageResolution(){
        const editing = currentEditImage();
        const image = editing.image;
        if(!image) return;
        const currentImg = element('previewCurrentImage');
        const currentVideo = element('previewCurrentVideo');
        const originalSize=smartImageEditor.imageResolution();
        const w = Number(currentVideo?.videoWidth || 0) || Number(currentImg?.naturalWidth || 0) || originalSize.width;
        const h = Number(currentVideo?.videoHeight || 0) || Number(currentImg?.naturalHeight || 0) || originalSize.height;
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

    function renderPreview(editing,sources){
        const stage = element('previewStage');
        const compareImg = element('previewCompareImage');
        const currentImg = element('previewCurrentImage');
        const currentVideo = element('previewCurrentVideo');
        const compareLayer = element('previewCompareLayer');
        const compareHandle = element('previewCompareHandle');
        const thumbsEl = element('compareThumbs');
        const toggle = element('compareToggleBtn');
        const curUrl = editing.image?.url || '';
        const isVideoPreview = mediaKindForItem(editing.image || {}) === 'video';
        const isPreviewMode = smartImageEditor.state.mode === 'preview';
        smartPanoramaPreview.refreshAvailability();
        if(!isPreviewMode && smartPanoramaPreview.state.enabled) disposePanoramaPreview();
        if(smartPanoramaPreview.state.enabled && isPreviewMode && !isVideoPreview){
            currentImg.onload = null;
            currentImg.onerror = null;
            currentImg.style.display = 'none';
            stage?.classList.remove('compare-on');
            if(compareLayer) compareLayer.style.display = 'none';
            if(compareHandle) compareHandle.style.display = 'none';
            if(thumbsEl){ thumbsEl.style.display = 'none'; thumbsEl.innerHTML = ''; }
            if(toggle) toggle.classList.remove('active');
            renderMetadata();
            return;
        }
        const onCurrentLoaded = guard(() => {
            rememberPreviewImageResolution();
            syncPreviewFrameSize();
            renderMetadata();
        });
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
                if(currentVideo.readyState >= 1) queueFrame(onCurrentLoaded);
            }
            stage.classList.remove('compare-on');
            if(compareLayer) compareLayer.style.display = 'none';
            if(compareHandle) compareHandle.style.display = 'none';
            if(thumbsEl){ thumbsEl.style.display = 'none'; thumbsEl.innerHTML = ''; }
            if(toggle){
                toggle.disabled = true;
                toggle.style.opacity = '.45';
                toggle.classList.remove('active');
                toggle.title = '无原图可对比';
            }
            renderMetadata();
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
        if(currentImg.complete && currentImg.naturalWidth) queueFrame(onCurrentLoaded);
        const hasSource = sources.length > 0;
        if(toggle){
            toggle.disabled = !hasSource;
            toggle.style.opacity = hasSource ? '1' : '.45';
            toggle.title = hasSource ? '点击查看输入端缩略图' : '无原图可对比';
            toggle.classList.toggle('active', hasSource && previewCompareOn);
        }
        if(!hasSource){
            stage.classList.remove('compare-on');
            if(compareLayer) compareLayer.style.display = 'none';
            if(compareHandle) compareHandle.style.display = 'none';
            thumbsEl.style.display = 'none';
            renderMetadata();
            return;
        }
        const sliderActive = previewCompareOn && previewCompareIndex >= 0 && previewCompareIndex < sources.length;
        if(sliderActive){
            const src = sources[previewCompareIndex];
            compareImg.onload = guard(syncPreviewFrameSize);
            compareImg.src = src?.url || '';
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
            thumbsEl.innerHTML = sources.map((s, i) => `<button type="button" class="compare-thumb ${i === previewCompareIndex ? 'active' : ''}" data-compare-idx="${i}" title="${escapeHtml(i === previewCompareIndex ? '点击取消对比' : '点击与该图对比')}">${smartPreviewImgHtml(s.url, 256)}</button>`).join('');
            bindThumbnailFallbacks(thumbsEl);
        } else {
            thumbsEl.style.display = 'none';
            thumbsEl.innerHTML = '';
        }
        renderMetadata();
    }

    function togglePreviewCompare(){
        if(!usable() || smartPanoramaPreview.state.enabled || mediaKindForItem(currentEditImage().image||{})!=='image')return;
        const sources=previewCompareSources();
        if(!sources.length){resetComparison();refresh();toast('该图片没有原图可对比');return;}
        previewCompareOn=!previewCompareOn;
        if(previewCompareOn && (previewCompareIndex<0 || previewCompareIndex>=sources.length))previewCompareIndex=0;
        if(!previewCompareOn)previewCompareIndex=-1;
        refresh();
    }


    const records=new Map();
    function clear(scope){for(const [el,type,fn,options] of records.get(scope)||[])el.removeEventListener(type,fn,options);records.delete(scope);}
    function usable(){return active && !destroyed && !paused && smartImageEditor.isPreviewing();}
    function listen(scope,el,type,fn,options){if(!el)return;const handler=e=>{if(usable())fn(e);};el.addEventListener(type,handler,options);if(!records.has(scope))records.set(scope,[]);records.get(scope).push([el,type,handler,options]);}
    function endCompare(){previewCompareDrag=false;if(captured){try{if(captured.el.hasPointerCapture?.(captured.id))captured.el.releasePointerCapture(captured.id);}catch{}}captured=null;}
    function endPan(){if(previewPanDrag)element('previewStage')?.classList.remove('panning');previewPanDrag=null;}
    function cancel(){endCompare();endPan();}
    function pause(){if(destroyed || paused)return;pausePresentation();cancel();for(const scope of [...records.keys()])clear(scope);paused=true;}
    function resume(){if(destroyed)return;paused=false;bindSmartPreviewPanEvents();bindSmartPreviewCompareEvents();}
    function destroy(){if(destroyed)return;release();for(const dispose of [...videoSubscriptions])dispose();for(const scope of [...records.keys()])clear(scope);dom.clear();destroyed=true;}
    function moveCompare(event){if(!previewCompareDrag)return false;if(!usable()){cancel();return false;}event.preventDefault();setPreviewComparePos(event.clientX);return true;}
    function movePan(event){if(!previewPanDrag)return false;if(!usable()){cancel();return false;}
        if(previewPanDrag){
            const stage = element('previewStage');
            previewPan = {
                x:previewPanDrag.startX + (event.clientX - previewPanDrag.clientX),
                y:previewPanDrag.startY + (event.clientY - previewPanDrag.clientY)
            };
            stage?.classList.add('panning');
            applyPreviewTransform();
            return true;
        }

        return false;
    }
    function zoom(event){if(!usable())return;

        if(seekPreviewVideoFrames(event.deltaY > 0 ? 1 : -1)) return;
        if(smartPanoramaPreview.zoom(event))return;
        const oldZoom = previewZoom;
        const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
        previewZoom = Math.max(0.05, previewZoom * factor);
        const frame = element('previewFrame');
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
    function bindSmartPreviewPanEvents(){
        if(paused || destroyed)return;
        clear('bindSmartPreviewPanEvents');
        listen('bindSmartPreviewPanEvents', element('previewStage'), 'mousedown', event => {
            if(smartImageEditor.state.mode !== 'preview' || event.button !== 0) return;
            if(event.target.closest('.preview-tools-overlay, .preview-download-overlay')) return;
            if(event.target.closest('.preview-compare-handle')) return;
            if(event.target.closest('video')) return;
            event.preventDefault();
            event.stopPropagation();
            if(smartPanoramaPreview.beginDrag(event))return;
            previewPanDrag = {clientX:event.clientX, clientY:event.clientY, startX:previewPan.x, startY:previewPan.y};
        });
    }
    function bindSmartPreviewCompareEvents(){
        if(paused || destroyed)return;
        clear('bindSmartPreviewCompareEvents');
        listen('bindSmartPreviewCompareEvents',element('compareThumbs'),'click',event=>{const button=event.target.closest('[data-compare-idx]');if(!button)return;event.preventDefault();event.stopPropagation();selectComparison(button.dataset.compareIdx);});
        listen('bindSmartPreviewCompareEvents', element('previewCompareHandle'), 'mousedown', event => {
            if(smartImageEditor.state.mode !== 'preview' || !previewCompareOn || previewCompareIndex < 0) return;
            event.preventDefault();
            event.stopPropagation();
            previewPanDrag = null;
            previewCompareDrag = true;
            setPreviewComparePos(event.clientX);
        });
        listen('bindSmartPreviewCompareEvents', element('previewCompareHandle'), 'pointerdown', event => {
            if(smartImageEditor.state.mode !== 'preview' || !previewCompareOn || previewCompareIndex < 0) return;
            event.preventDefault();
            event.stopPropagation();
            captured={el:event.currentTarget,id:event.pointerId};
            event.currentTarget.setPointerCapture?.(event.pointerId);
            previewPanDrag = null;
            previewCompareDrag = true;
            setPreviewComparePos(event.clientX);
        });
        listen('bindSmartPreviewCompareEvents', element('previewCompareHandle'), 'pointermove', event => {
            if(!previewCompareDrag) return;
            event.preventDefault();
            event.stopPropagation();
            setPreviewComparePos(event.clientX);
        });
        listen('bindSmartPreviewCompareEvents', element('previewCompareHandle'), 'pointerup', event => {
            if(previewCompareDrag){
                event.preventDefault();
                event.stopPropagation();
            }
            previewCompareDrag = false;
            endCompare();
        });
        listen('bindSmartPreviewCompareEvents', element('previewCompareHandle'), 'pointercancel', event => {
            previewCompareDrag = false;
            endCompare();
        });
    }
    const videoSubscriptions=new Set();
    function videoState(){
        const video=element('previewCurrentVideo');
        return Object.freeze({readyState:Number(video?.readyState||0),currentTime:Number(video?.currentTime||0),
            duration:Number(video?.duration||0),width:Number(video?.videoWidth||0),height:Number(video?.videoHeight||0)});
    }
    function onVideo(type,fn){
        const video=element('previewCurrentVideo');if(!video)return ()=>{};
        const handler=()=>fn(videoState());
        const dispose=()=>{video.removeEventListener(type,handler);videoSubscriptions.delete(dispose);};
        video.addEventListener(type,handler);videoSubscriptions.add(dispose);return dispose;
    }
    function applyPreviewTransform(){
        if(destroyed)return;
        const frame = element('previewFrame');
        if(frame){
            frame.style.transform = smartPanoramaPreview.state.enabled ? '' : `translate(${previewPan.x}px, ${previewPan.y}px) scale(${previewZoom})`;
        }
        updateZoomLabel();
    }
    function resetPreviewTransform(){
        if(destroyed)return;
        previewZoom = 1.0;
        previewPan = {x:0, y:0};
        previewComparePos = 50;
        element('previewStage')?.style.setProperty('--compare-pos', `${previewComparePos}%`);
        applyPreviewTransform();
    }
    return Object.freeze({get state(){return Object.freeze({active,paused,compareOn:previewCompareOn,compareIndex:previewCompareIndex,compareActive:Boolean(active && !paused && previewCompareOn && previewCompareIndex>=0 && previewCompareIndex<comparisonCount && smartImageEditor.isPreviewing() && !smartPanoramaPreview.state.enabled),extraText:previewMetaExtraText,zoom:previewZoom,pan:Object.freeze({...previewPan}),comparePos:previewComparePos,dragging:Boolean(previewPanDrag||previewCompareDrag)});},
        refresh,toggleComparison:togglePreviewCompare,selectComparison,updateMetadata:updatePreviewMetaHint,prepare,leave,release,clearImage,setImageSource,setPanoramaPresentation,
        // Video trim still borrows the same player through this results-only bridge.
        videoState,onVideo,seekVideo:time=>{if(usable())element('previewCurrentVideo').currentTime=time;},playVideo:()=>usable()?element('previewCurrentVideo').play():Promise.reject(new Error('Preview unavailable')),
        syncFrameSize:syncPreviewFrameSize,setComparePositionAt:setPreviewComparePos,video:()=>element('previewCurrentVideo'),pauseVideo:()=>element('previewCurrentVideo')?.pause?.(),
        bindSmartPreviewPanEvents,bindSmartPreviewCompareEvents,applyPreviewTransform,resetPreviewTransform,moveCompare,movePan,endCompare,endPan,cancel,pause,resume,destroy,zoom,
        resetPose(){if(!destroyed){previewZoom=1;previewPan={x:0,y:0};}}});
}
function smartEditorPreviewState(){return Object.freeze({panoramaEnabled:smartPanoramaPreview.state.enabled,fov:smartPanoramaPreview.state.fov,dragging:Boolean(smartPanoramaPreview.state.dragging||smartPreviewGestures.state.dragging)});}
function prepareSmartEditorPreview(){
    smartAudioPreview.close();
    disposePanoramaPreview();smartPreviewGestures.prepare();
}
function leaveSmartEditorPreview(){smartPreviewGestures.leave();if(smartPanoramaPreview.state.enabled)disposePanoramaPreview();}
function clearSmartEditorPreviewImage(){return smartPreviewGestures.clearImage();}
function setSmartEditorPreviewSource(url){return smartPreviewGestures.setImageSource(url);}
function releaseSmartEditorPreview(){disposePanoramaPreview();smartPreviewGestures.release();}
function zoomSmartEditorPreview(event){return smartPreviewGestures.zoom(event);}
function resizeSmartEditorPreview(){if(smartPanoramaPreview.state.enabled)resizePanoramaViewer();}
function retrySmartEditorPreview(source){if(smartPanoramaPreview.state.enabled)loadPanoramaTexture(source);}

function pauseSmartEditorPreview(){smartPanoramaPreview.pause();smartPreviewGestures.pause();}

function resumeSmartEditorPreview(){smartPreviewGestures.resume();smartPanoramaPreview.resume();}
function destroySmartEditorPreview(){smartPanoramaPreview.destroy();smartPreviewGestures.destroy();}
