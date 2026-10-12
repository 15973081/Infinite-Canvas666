const {readCanvasSource} = require('./helpers/canvas-source.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const classic = readCanvasSource('static/js/canvas.js', 'utf8').replace(/\r/g, '');
const smart = readCanvasSource('static/js/smart-canvas.js', 'utf8').replace(/\r/g, '');
const assets = readCanvasSource('static/js/asset-manager.js', 'utf8').replace(/\r/g, '');
const coreContext = {window:{}};
vm.runInNewContext(readCanvasSource('static/js/canvas-core.js', 'utf8'), coreContext);
const core = coreContext.window.CanvasCore;
function sourceFunction(source, name){
    const start = source.indexOf('function ' + name + '(');
    assert.ok(start >= 0, name);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
function context(source, names, values={}){
    const result = {window:{CanvasCore:core}, ...values};
    vm.createContext(result);
    vm.runInContext(names.map(name=>sourceFunction(source,name)).join('\n'), result);
    return result;
}
const providers = () => [{id:'p',enabled:true,has_key:true,image_models:['limited','open'],video_models:['seedance-2.0','generic','limited-video'],
    model_policies:{'image:limited':{resolutions:['1k']},'video:limited-video':{resolutions:['720p']}}},
    {id:'other',enabled:true,has_key:true,image_models:['open'],video_models:[],model_policies:{}}];
const array = value => Array.from(value);

function outpaintContext(size,allowed=['1k']){
    const catalog=providers();catalog[0].model_policies['image:limited']={resolutions:allowed};
    const c=context(smart,['validOutpaintSize','withOutpaintDisplaySettings','smartImageResolutions','normalizeSmartImageResolution',
        'smartOutpaintResolutionError','resolutionLabel','renderResolutionControl','sizeForRun','apiImageSize'],{
        apiProviders:catalog,settings:{},escapeHtml:x=>x,tr:x=>x,isApiLikeEngine:e=>e==='api',
        imageRefsOnly:x=>x,canvasId:'canvas',submitted:[],SIZE_MAP:{square:{'1k':'1024x1024'}},
    });
    c.settings=c.withOutpaintDisplaySettings({outpaintSize:size},{engine:'api',provider_id:'p',model:'limited'});
    c.window.CanvasApi={createCanvasImageTaskRequest:async payload=>{c.submitted.push(payload);return {ok:true,json:async()=>({task_id:'task'})};}};
    vm.runInContext('async '+sourceFunction(smart,'runApiGeneration'),c);
    return c;
}

test('restricted outpaint keeps its real size visible and blocks before binding or POST',async()=>{
    const c=outpaintContext({width:4096,height:4096});
    const html=c.renderResolutionControl();
    assert.match(html,/<span>4096x4096<\/span>/);
    assert.match(html,/属于 4K，当前模型仅开放 1K/);
    assert.equal(c.settings.resolution,'custom');assert.equal(c.settings.ratio,'');
    const binding={prepare(){assert.fail('invalid outpaint must not save/prepare a task');}};
    await assert.rejects(c.runApiGeneration('expand',[],c.settings,binding),/属于 4K/);
    assert.equal(c.submitted.length,0);
});

test('the generate button rejects incompatible outpaint before creating output nodes',async()=>{
    const c=outpaintContext({width:4096,height:4096});
    const node={id:'source',outpaintSize:{width:4096,height:4096}};
    const previous=c.settings;
    Object.assign(c,{nodes:[node],selectedNode:()=>node,isSmartCanvasLocked:()=>false,cloneSmartSettings:x=>({...x}),
        smartSettingsForNode:n=>c.withOutpaintDisplaySettings(n,c.settings),smartLoopContext:null,
        buildPromptRequest:()=>({prompt:'expand',refs:[]}),smartRunNeedsPrompt:()=>true,toast:message=>{c.message=message;},
        snapshotRunMeta(){assert.fail('rejected outpaint must stop before creating run metadata or outputs');}});
    vm.runInContext('async '+sourceFunction(smart,'runGeneration'),c);
    await c.runGeneration();
    assert.match(c.message,/属于 4K/);assert.equal(c.nodes.length,1);
    assert.deepEqual({...c.settings},{...previous});assert.equal(c.submitted.length,0);
});

test('explicitly choosing an allowed tier exits locked outpaint and submits that size',async()=>{
    const c=outpaintContext({width:4096,height:4096});
    const node={outpaintSize:{width:4096,height:4096}};
    Object.assign(c,{activeSettingsSubject:()=>node,persistActiveSmartSettings(){},rememberRecentSmartSettings(){},
        renderDynamicParams:()=>c.renderResolutionControl(),scheduleSave(){}});
    vm.runInContext(sourceFunction(smart,'setDynamicSetting'),c);
    c.setDynamicSetting('resolution','1k');
    assert.equal(node.outpaintSize,undefined);assert.equal(c.settings.outpaintResolutionLocked,undefined);
    assert.match(c.renderResolutionControl(),/<span>1K<\/span>/);
    await c.runApiGeneration('expand',[]);assert.equal(c.submitted[0].size,'1024x1024');
});

for(const [size,tier] of [[1024,'1k'],[2048,'2k'],[4096,'4k']])test(`allowed ${tier} outpaint submits the exact displayed dimensions`,async()=>{
    const c=outpaintContext({width:size,height:size},[tier]);
    assert.match(c.renderResolutionControl(),new RegExp(`<span>${size}x${size}</span>`));
    assert.equal(c.smartOutpaintResolutionError(),'');
    await c.runApiGeneration('expand',[]);
    assert.equal(c.submitted[0].size,`${size}x${size}`);
});

test('outpaint respects area-based tiers and recovers when switching to an unrestricted model',async()=>{
    const c=outpaintContext({width:1500,height:1500});
    assert.match(c.smartOutpaintResolutionError(),/属于 2K/);
    c.settings.model='open';assert.equal(c.smartOutpaintResolutionError(),'');
    assert.match(c.renderResolutionControl(),/<span>1500x1500<\/span>/);
    await c.runApiGeneration('expand',[]);assert.equal(c.submitted[0].size,'1500x1500');
});

test('revoked outpaint model retains dimensions but cannot submit',async()=>{
    const c=outpaintContext({width:1024,height:1024});
    c.apiProviders[0].model_policies['image:limited'].enabled=false;
    assert.match(c.renderResolutionControl(),/<span>1024x1024<\/span>/);
    await assert.rejects(c.runApiGeneration('expand',[]),/暂无可用规格/);
    assert.equal(c.submitted.length,0);
});

test('policies are scoped to exact provider/model and unconfigured models regain all resolutions',()=>{
    const [p,other] = providers();
    assert.deepEqual(array(core.modelResolutions(p,'image','limited',['1k','2k','4k','custom'])),['1k']);
    assert.deepEqual(array(core.modelResolutions(p,'image','open',['1k','2k','4k','custom'])),['1k','2k','4k','custom']);
    assert.deepEqual(array(core.modelResolutions(other,'image','open',['1k','2k','4k','custom'])),['1k','2k','4k','custom']);
    assert.deepEqual(array(core.modelResolutions(p,'video','limited-video',['','480p','720p','1080p'])),['720p']);
    assert.deepEqual(array(core.modelResolutions(null,'image','open',['1k'])),[]);
    assert.deepEqual(array(core.modelResolutions(p,'image','missing',['1k'])),[]);
});

test('classic model and provider change events rebuild size choices without resetting valid selections',()=>{
    const controls = {resolutionSelect:{},ratioSelect:{querySelector:()=>null,options:[{value:'square'}]},
        customRatioRow:{style:{}},customSizeRow:{style:{}},customRatioWInput:{},customRatioHInput:{},customWInput:{},customHInput:{},
        fitSizeBtn:{},referenceImages:[],normalizeApiNodeSizeChoice(){},syncQualityControls(){},updateSourceRatioFromFirstRef(){},parseSizeValue:()=>null,tr:x=>x};
    const c = context(classic,['allowedImageResolutions'],{...controls,apiProviders:providers(),resolveImageModel:x=>x,
        node:{apiProvider:'p',model:'limited',resolution:'1k',ratio:'square'},modelSelect:{},providerSelect:{},
        providerImageModels:id=>providers().find(p=>p.id===id).image_models,imageModelOptions:()=>'',scheduleSave(){}});
    const body = classic.slice(classic.indexOf('function renderGeneratorBody('));
    const start = body.indexOf('    const syncSizeControls = (persist=true) => {');
    vm.runInContext(body.slice(start,body.indexOf('\n    };',start)+7),c);
    for(const name of ['modelSelect','providerSelect']){
        const from = body.indexOf(name+'.onchange = e => {');
        vm.runInContext(body.slice(from,body.indexOf('\n    };',from)+7),c);
    }
    vm.runInContext('syncSizeControls()',c);
    assert.doesNotMatch(c.resolutionSelect.innerHTML,/value="2k"/);
    c.modelSelect.onchange({target:{value:'open'},stopPropagation(){}});
    assert.match(c.resolutionSelect.innerHTML,/value="2k"/);
    assert.match(c.resolutionSelect.innerHTML,/value="4k"/);
    assert.equal(c.node.resolution,'1k');
    c.node.resolution='4k';
    c.modelSelect.onchange({target:{value:'limited'},stopPropagation(){}});
    assert.equal(c.node.resolution,'1k');
    assert.doesNotMatch(c.resolutionSelect.innerHTML,/value="4k"/);
    c.providerSelect.onchange({target:{value:'other'},stopPropagation(){}});
    assert.equal(c.node.model,'open');
    assert.match(c.resolutionSelect.innerHTML,/value="4k"/);
});

test('smart image label, selected option and stored value agree after a restriction change',()=>{
    const c = context(smart,['smartImageResolutions','normalizeSmartImageResolution','resolutionLabel','renderResolutionControl'],
        {apiProviders:providers(),settings:{provider_id:'p',model:'limited',resolution:'4k',ratio:''},escapeHtml:x=>x,tr:x=>x});
    const html = c.renderResolutionControl();
    assert.match(html,/<span>1K<\/span>/);
    assert.match(html,/class="active" data-smart-param="resolution" data-smart-value="1k"/);
    assert.equal(c.settings.resolution,'1k');
    assert.equal(c.settings.ratio,'square');
    c.settings.model='open';
    assert.match(c.renderResolutionControl(),/data-smart-value="4k"/);
    c.settings.resolution='4k';
    assert.match(c.renderResolutionControl(),/<span>4K<\/span>/);
    assert.equal(c.settings.resolution,'4k');
});

test('both video editors filter restricted specs and remove stale 4K on model change',()=>{
    const c = context(classic,['isSeedance20VideoModel','allowedVideoResolutions','normalizeVideoNodeSelection'],{
        apiProviders:providers(),isVolcengineSeedance25VideoNode:()=>false,videoNodeDurationRange:()=>({min:1,max:60,auto:false}),
        window:{CanvasCore:core,VideoDurationPolicy:require('../static/js/video-duration-policy.js')}});
    const node={apiProvider:'p',model:'seedance-2.0',resolution:'4k',duration:5};
    c.normalizeVideoNodeSelection(node);assert.equal(node.resolution,'4k');
    node.model='generic';c.normalizeVideoNodeSelection(node);assert.equal(node.resolution,'');
    node.model='limited-video';c.normalizeVideoNodeSelection(node);assert.equal(node.resolution,'720p');
    assert.deepEqual(array(c.allowedVideoResolutions(node)),['720p']);
    const s=context(smart,['isSeedance20VideoModel','smartVideoResolutions','normalizeSmartVideoResolution','renderVideoResolutionControl'],{
        apiProviders:providers(),settings:{videoProvider:'p',videoModel:'limited-video',videoResolution:'1080p'},escapeHtml:x=>x,tr:x=>x});
    const html=s.renderVideoResolutionControl();
    assert.equal(s.settings.videoResolution,'720p');
    assert.match(html,/data-smart-value="720p"/);assert.doesNotMatch(html,/data-smart-value="1080p"/);
    s.settings.videoModel='seedance-2.0';s.settings.videoResolution='4k';s.renderVideoResolutionControl();
    assert.equal(s.settings.videoResolution,'4k');
    s.settings.videoModel='generic';s.renderVideoResolutionControl();assert.equal(s.settings.videoResolution,'');
});

test('config refresh removes revoked models and providers in both editors, including an empty catalog',()=>{
    for(const [source,apply,refresh] of [[classic,'applyCanvasModelConfig','refreshCanvasModelControls'],[smart,'applySmartModelConfig','refreshSmartModelControls']]){
        let renders=0;
        const c=context(source,[apply],{apiProviders:providers(),[refresh]:()=>renders++});
        const next=providers().slice(0,1);next[0].model_policies['image:open']={enabled:false};
        c[apply]({api_providers:next});
        assert.deepEqual(array(c.apiProviders[0].image_models),['limited']);
        assert.equal(c.apiProviders.length,1);assert.equal(renders,1);
        c[apply]({api_providers:next});assert.equal(renders,1);
        c[apply]({api_providers:[]});assert.equal(c.apiProviders.length,0);assert.equal(renders,2);
    }
});

test('member mode does not resurrect fallback video providers after access is removed',()=>{
    const window={CanvasSession:{enabled:true}};
    const c=context(classic,['defaultApiProviders','videoApiProviders'],{window,apiProviders:[]});
    assert.deepEqual(array(c.videoApiProviders()),[]);
    const s=context(smart,['videoApiProviders','providerVideoModels','volcengineVideoModels'],{window,apiProviders:[]});
    assert.deepEqual(array(s.videoApiProviders()),[]);
    assert.deepEqual(array(s.providerVideoModels('removed')),[]);
    assert.deepEqual(array(s.volcengineVideoModels()),[]);
});

test('recent generation settings and asset inbox are isolated by member and workspace, without legacy fallback',()=>{
    const store=new Map(),session={enabled:true,member:'alice',space:'a',storageKey(key){return ['canvas-member',this.member,this.space,key].join(':');}};
    const localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
    const recent='smart_canvas_recent_run_settings_v1',inbox='smart_canvas_asset_inbox';
    const c=context(smart,['smartScopedStorageKey','loadRecentSmartSettings','saveRecentSmartSettings','readAssetInbox'],{
        window:{CanvasSession:session},localStorage,RECENT_SMART_SETTINGS_KEY:recent,SMART_CANVAS_ASSET_INBOX_KEY:inbox,
        recentSmartSettingsByMode:{'api:image':{model:'limited',resolution:'1k'}},Date});
    store.set(recent,JSON.stringify({oldAccount:'ignored'}));
    store.set(inbox,JSON.stringify({items:[{url:'legacy'}],ts:Date.now()}));
    c.saveRecentSmartSettings();
    const writer=context(assets,['copySelectedAssetsToCanvas'],{window:{CanvasSession:session},localStorage,SMART_CANVAS_ASSET_INBOX_KEY:inbox,
        selectedAssetIds:new Set(['one']),findAssetItem:()=>({url:'space-a-asset',name:'A'}),setStatus(){},Date});
    writer.copySelectedAssetsToCanvas();
    assert.equal(c.readAssetInbox()[0].url,'space-a-asset');
    session.space='b';c.loadRecentSmartSettings();assert.equal(Object.keys(c.recentSmartSettingsByMode).length,0);assert.equal(c.readAssetInbox(),null);
    session.space='a';session.member='bob';c.loadRecentSmartSettings();assert.equal(Object.keys(c.recentSmartSettingsByMode).length,0);assert.equal(c.readAssetInbox(),null);
    session.member='alice';c.loadRecentSmartSettings();assert.equal(c.recentSmartSettingsByMode['api:image'].model,'limited');
    assert.equal(c.readAssetInbox()[0].url,'space-a-asset');
    session.enabled=false;c.loadRecentSmartSettings();assert.equal(c.recentSmartSettingsByMode.oldAccount,'ignored');
    assert.equal(c.readAssetInbox()[0].url,'legacy');
});

test('smart refresh waits for active parameter editing to finish',()=>{
    let refreshes=0,handler;
    const active={matches:()=>true},document={activeElement:active};
    const dynamicParams={dataset:{},contains:target=>target===active,addEventListener:(event,fn)=>{assert.equal(event,'focusout');handler=fn;}};
    const c=context(smart,['refreshSmartModelControls'],{document,dynamicParams,nodes:[],refreshSmartNodes(){},renderDynamicParams:()=>refreshes++,setTimeout:fn=>fn()});
    c.refreshSmartModelControls();c.refreshSmartModelControls();assert.equal(refreshes,0);
    document.activeElement=null;handler();assert.equal(refreshes,1);
});

test('a revoked chat model is not restored through a member-mode fallback',()=>{
    // Smart canvas no longer has a text-chat node or resolveChatModel.
    for(const source of [classic]){
        const c=context(source,['resolveChatModel'],{window:{CanvasSession:{enabled:true}},providerChatModels:()=>[],resolveChatProviderId:x=>x});
        assert.equal(c.resolveChatModel('removed','p'),'');
    }
});

test('an incompatible video policy presents no usable choices rather than sending a hidden spec',()=>{
    const p=providers();p[0].model_policies['video:generic']={resolutions:['4k']};
    const c=context(smart,['isSeedance20VideoModel','smartVideoResolutions','normalizeSmartVideoResolution','renderVideoResolutionControl'],{
        apiProviders:p,settings:{videoProvider:'p',videoModel:'generic',videoResolution:'4k'},escapeHtml:x=>x,tr:x=>x});
    const html=c.renderVideoResolutionControl();
    assert.match(html,/disabled/);assert.match(html,/暂无可用规格/);assert.doesNotMatch(html,/data-smart-value=/);
});

test('stale background generation fails before creating outputs or submitting requests',async()=>{
    for(const [name,allowed] of [['runGenerator','allowedImageResolutions'],['runVideoNode','allowedVideoResolutions']]){
        const node={id:'n',resolution:'4k'};
        const c={window:{},nodes:[node],[allowed]:()=>['1k'],showErrorModal:message=>c.message=message};
        vm.createContext(c);vm.runInContext('async '+sourceFunction(classic,name),c);
        await c[name]('n');assert.match(c.message,/规格已变化/);
        assert.deepEqual(node,{id:'n',resolution:'4k'});
        await assert.rejects(c[name]('n',{cascade:true}),/规格已变化/);
    }
    const c={smartVideoResolutions:()=>['720p']};
    vm.createContext(c);vm.runInContext('async '+sourceFunction(smart,'runApiVideoGeneration'),c);
    await assert.rejects(c.runApiVideoGeneration('prompt',[],{videoModel:'v',videoResolution:'4k'}),/规格已变化/);
});

test('classic config refresh defers focused fields and leaves unrelated nodes alone',()=>{
    const handlers=[],refreshed=[],active={matches:()=>true};
    const editing={dataset:{},contains:value=>value===active,addEventListener:(_,fn)=>handlers.push(fn)};
    const idle={dataset:{},contains:()=>false};
    const c=context(classic,['refreshCanvasModelControls'],{
        canvas:{id:'c'},nodes:[{id:'a',type:'generator'},{id:'b',type:'video'},{id:'c',type:'prompt'}],
        CSS:{escape:x=>x},document:{activeElement:active},nodesEl:{querySelector:selector=>selector.includes('"a"')?editing:idle},
        refreshNodes:ids=>refreshed.push(array(ids)),setTimeout:fn=>fn()});
    c.refreshCanvasModelControls();assert.deepEqual(refreshed,[['b']]);assert.equal(handlers.length,1);
    c.document.activeElement=null;handlers[0]();assert.deepEqual(refreshed[1],['a','b']);
});
