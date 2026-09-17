const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const classic = fs.readFileSync('static/js/canvas.js', 'utf8').replace(/\r/g, '');
const smart = fs.readFileSync('static/js/smart-canvas.js', 'utf8').replace(/\r/g, '');
const assets = fs.readFileSync('static/js/asset-manager.js', 'utf8').replace(/\r/g, '');
const coreContext = {window:{}};
vm.runInNewContext(fs.readFileSync('static/js/canvas-core.js', 'utf8'), coreContext);
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
        fitSizeBtn:{},referenceImages:[],normalizeApiNodeSizeChoice(){},syncQualityControls(){},updateSourceRatioFromFirstRef(){},tr:x=>x};
    const c = context(classic,['allowedImageResolutions'],{...controls,apiProviders:providers(),resolveImageModel:x=>x,
        node:{apiProvider:'p',model:'limited',resolution:'1k',ratio:'square'},modelSelect:{},providerSelect:{},
        providerImageModels:id=>providers().find(p=>p.id===id).image_models,imageModelOptions:()=>'',scheduleSave(){}});
    const body = classic.slice(classic.indexOf('function renderGeneratorBody('));
    const start = body.indexOf('    const syncSizeControls = () => {');
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
    for(const source of [classic,smart]){
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
