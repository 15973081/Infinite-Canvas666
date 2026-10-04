const {readCanvasSource,functionSource} = require('./helpers/canvas-source.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(file, context, names) {
    context.window ||= {};
    context.window.CanvasAssetAuth = require('../static/js/asset-auth.js');
    context.apiProviders ||= [];
    // Extracted functions still use the production UI owner, without mounting a view.
    const owner = file === 'canvas.js' ? 'classicAssetPanel' : 'smartAssetPanel';
    if(!context[owner]){
        context.document ||= {getElementById:()=>null};
        vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/js/canvas-core.js'),'utf8'),context);
        context[owner] = context.window.CanvasCore.createAssetPanelController({ids:[]});
        context[owner].selectLibrary(context.panelLibraryId || '');
    }
    if(file==='canvas.js'&&!context.classicLibraryManager){
        const library=fs.readFileSync(path.join(__dirname,'../static/js/canvas/classic/canvas-library.js'),'utf8');
        vm.runInContext(functionSource(library,'createClassicLibraryManager'),context);context.classicLibraryManager=context.createClassicLibraryManager();
    }
    names = [...names, ...(file === 'canvas.js' ? ['setCanvasAssetLibraryFromResponse','canvasFaceAuthState'] : ['smartFaceAuthState'])];
    const source = readCanvasSource(path.join(__dirname, '../static/js', file), 'utf8').replace(/\r\n/g, '\n');
    for (const name of names) {
        vm.runInContext(functionSource(source,name), context);
    }
}
const verified = () => ({url:'/output/original.png', name:'person', kind:'image',
    face_auth_status:'Active', asset_item_id:'item', asset_library_id:'library',
    asset_uris:{volcengine:'asset://verified'}});
const libraryItem = () => ({id:'item', url:'/assets/library/copied.png',
    registrations:{volcengine:{status:'Active', asset_uri:'asset://verified'}}});

for(const mode of ['classic','smart']) for(const ready of [true,false]) test(`${mode}: quick certification uses AK/SK capability, ready=${ready}`,async()=>{
    const image={id:'source',type:'image',url:'/original.png'},owner=mode==='classic'?image:{id:'source',images:[image]};
    const provider={id:'custom-volc',enabled:true,has_key:!ready,avatar_registration:{platform:'volcengine',supported:true,credentials_configured:ready}};
    let uploads=0,polls=0;const messages=[];
    const item={id:'item',registrations:{volcengine:{status:'Processing',task_id:'remote',provider_id:provider.id,project_name:'default'}}};
    const context=vm.createContext({nodes:[owner],apiProviders:[{id:'apimart',enabled:true,has_key:true},provider],
        mediaKindForNode:()=> 'image',setStatus:m=>messages.push(m),toast:m=>messages.push(m),showErrorModal:m=>messages.push(m),
        render(){},scheduleSave(){},chooseSmartAssetTarget:async()=>({libraryId:'lib',categoryId:'images'}),
        ensureImageNodeAsset:async()=>{uploads++;return {item,libraryId:'lib'};},
        ensureSmartImageAsset:async()=>{uploads++;return {item,libraryId:'lib'};},
        pollImageNodeFaceAuth:()=>polls++,pollSmartImageFaceAuth:()=>polls++});
    load(mode==='classic'?'canvas.js':'smart-canvas.js',context,mode==='classic'
        ? ['canvasAvatarPlatform','quickCanvasAvatarProvider','quickFaceAuthImageNode']
        : ['smartAvatarPlatform','quickSmartAvatarProvider','quickFaceAuthSmartImage']);
    if(mode==='classic')await context.quickFaceAuthImageNode('source');else await context.quickFaceAuthSmartImage('source',0);
    assert.equal(uploads,ready?1:0);assert.equal(polls,ready?1:0);
    if(!ready)assert.match(messages[0],/AK\/SK/);
});

function classic({grouped=false, loop=false, provider='volcengine', kind='image'}={}) {
    const image = {...verified(), id:'image', type:'image', kind};
    const video = {id:'video', type:'video', apiProvider:provider, model:'doubao-seedance-2-5-260628',
        tempShLinks:[{source:image.url, url:'https://example.invalid/uploaded.png'}]};
    let payload;
    const messages = [];
    const context = vm.createContext({
        nodes:[image, video, {id:'group', type:'group', items:['image']},
            {id:'loop', type:'loop', imageInput:true}, {id:'prompt', type:'prompt', text:'test'}],
        connections:[{from:loop?'loop':grouped?'group':'image', to:'video'},
            {from:'image',to:'loop'}, {from:'prompt', to:'video'}],
        apiProviders:[{id:provider, protocol:provider, video_models:[video.model]}],
        CANVAS_MEDIA_OUTPUT_TYPES:[], CANVAS_IMAGE_OUTPUT_TYPES:[],
        mediaKindForNode:n=>n.kind || 'image', mediaKindForRef:r=>r.kind || 'image',
        canvasAssetLibraries:()=>[{id:'library',categories:[{items:[libraryItem()]}]}],
        cascadeTargetIdFromOptions:()=>'', outputForNode:()=>null, runSnapshot:()=>({}),
        allowedVideoResolutions:()=>[''], renderLoopPrompt:()=>'', trf:x=>x, loopCount:()=>1,
        refreshRunNodes(){}, scheduleSave(){}, isCascadeAbortError:()=>false,
        window:{VideoDurationPolicy:{clamp:()=>5}}, videoNodeDurationRange:()=>({}),
        canvasTaskWriteGuard:()=>({check(){},valid:()=>true}), classicTaskInputBinding:()=>null,
        pauseClassicTaskInput(){}, addGenerationLog(){}, alert(){}, tr:x=>x,
        showErrorModal:message=>messages.push(message),
        createCanvasVideoTask:async p=>{payload=p; throw Error('mock stop: no API called');},
    });
    load('canvas.js', context, ['canvasAssetUrisFaceVerified','canvasAssetRegisteredUris',
        'canvasAssetItemLocation','canvasAssetUrisForUrl','canvasAssetUrisForNode',
        'mediaRefsFromNode','imageRefsFromNode','videoRefsFromNode','loopInputImageRefs',
        'generatorSources','orderedSources','videoApiProviders','resolveVideoProviderId',
        'canvasAvatarPlatform','tempShUploadedUrlForNode','applyUploadedUrlToRefs',
        'imageRefsOnly','videoRefsOnly','audioRefsOnly','manualVideoUrlForNode','runVideoNode']);
    return {context,image,video,messages,payload:()=>payload, run:()=>context.runVideoNode('video')};
}

for (const connection of ['direct','group','loop']) test(`classic ${connection}: certified image survives copied library and uploaded URL`, async()=>{
    const c = classic({grouped:connection==='group', loop:connection==='loop'});
    await c.run();
    assert.equal(c.payload().images[0].url,'asset://verified');
    assert.equal(c.payload().images[0].asset_item_id,'item');
    assert.equal(c.payload().trusted_asset,true);
    assert.equal(c.image.url,'/output/original.png');
});
test('classic: certified video also preserves its binding', async()=>{
    const c = classic({kind:'video'}); await c.run();
    assert.equal(c.payload().videos[0],'asset://verified');
    assert.equal(c.context.videoRefsFromNode(c.image)[0].asset_uris.volcengine,'asset://verified');
});
for(const status of ['Processing','Failed']) test(`classic: ${status} blocks even with stale cached URI`,async()=>{
    const c=classic(); c.image.face_auth_status=status;
    await c.run(); assert.equal(c.payload(),undefined); assert.equal(c.messages.length,1);
});
test('classic: library drag and ordinary unauthenticated image remain supported',async()=>{
    const c=classic(); delete c.image.asset_uris; delete c.image.face_auth_status;
    await c.run(); assert.equal(c.payload().images[0].url,'asset://verified');
    delete c.image.asset_item_id;
    await c.run(); assert.equal(c.payload().images[0].url,'https://example.invalid/uploaded.png');
    assert.equal(c.payload().trusted_asset,false);
});
test('classic: other providers keep the original media transport',async()=>{
    const c=classic({provider:'comfly'}); await c.run();
    assert.equal(c.payload().images[0].url,'https://example.invalid/uploaded.png');
    assert.equal(c.payload().trusted_asset,false);
});

function smart() {
    let payload;
    const image=verified(), owner={id:'source',images:[image]};
    const context=vm.createContext({
        nodes:[owner], settings:{videoModel:'doubao-seedance-2-5-260628',videoProvider:'volcengine'},
        smartVideoResolutions:()=>[''], videoProviderPlatform:p=>p,
        localDisplayUrlForMediaItem:i=>i.originalLocalUrl || i.url,
        applyUploadedUrlsToSmartRefs:refs=>refs.map(ref=>({...ref,originalLocalUrl:ref.url,url:'https://example.invalid/upload.png'})),
        assetLibraries:()=>[{id:'library',categories:[{items:[libraryItem()]}]}],
        imageRefsOnly:refs=>refs.filter(r=>r.kind==='image'), videoRefsOnly:refs=>refs.filter(r=>r.kind==='video'),
        audioRefsOnly:refs=>refs.filter(r=>r.kind==='audio'), manualSmartVideoLink:()=>null,
        uid:()=> 'task', canvasId:'canvas', smartVideoDurationRange:()=>({}),
        window:{VideoDurationPolicy:{clamp:()=>5},CanvasApi:{createCanvasVideoTaskRequest:async p=>{
            payload=p; return {ok:true,json:async()=>({task_id:'task'})};
        }}},
    });
    load('smart-canvas.js',context,['smartAssetItemLocation','smartAuthenticatedUris',
        'smartCurrentFaceAuthRef','smartVolcengineAssetUrisForRef','runApiVideoGeneration']);
    return {context,owner,image,payload:()=>payload,run:async(refs,settings)=>{
        const task=await context.runApiVideoGeneration('test',refs,settings); await task.submission;
    }};
}
test('smart: mention created before quick authentication uses the current binding',async()=>{
    const s=smart(); const stale={url:s.image.url,kind:'image',nodeId:'source',imageIndex:0,asset_uris:{},face_auth_status:'Processing'};
    await s.run([stale]);
    assert.equal(s.payload().images[0].url,'asset://verified'); assert.equal(s.payload().trusted_asset,true);
    assert.equal(stale.face_auth_status,'Processing','does not mutate prompt snapshots');
});
test('smart: reordered images resolve by media identity, not the old array index',async()=>{
    const s=smart(); s.owner.images.unshift({...verified(),url:'/other.png',asset_uris:{volcengine:'asset://other'}});
    await s.run([{url:s.image.url,kind:'image',nodeId:'source',imageIndex:0}]);
    assert.equal(s.payload().images[0].url,'asset://verified');
});
test('smart: replaced or deleted source never submits the stale authenticated reference',async()=>{
    const s=smart(); const ref={...s.image,nodeId:'source',imageIndex:0};
    s.owner.images=[{url:'/replacement.png'}];
    await assert.rejects(s.run([ref]),/替换或删除/); assert.equal(s.payload(),undefined);
});
for(const status of ['Processing','Failed']) test(`smart: current ${status} overrides old green mention`,async()=>{
    const s=smart(); const ref={...s.image,nodeId:'source',imageIndex:0}; s.image.face_auth_status=status;
    await assert.rejects(s.run([ref]),/认证/); assert.equal(s.payload(),undefined);
});
test('smart: standalone library drag and registered video still route to asset URIs',async()=>{
    const s=smart(); await s.run([verified(),{...verified(),kind:'video'}]);
    assert.equal(s.payload().images[0].url,'asset://verified');
    assert.equal(s.payload().videos[0],'asset://verified');
});
test('smart: other providers do not receive Volcengine asset URIs',async()=>{
    const s=smart(); await s.run([verified()],{videoModel:'seedance',videoProvider:'comfly'});
    assert.equal(s.payload().images[0].url,'https://example.invalid/upload.png');
    assert.equal(s.payload().trusted_asset,false);
});

for(const mode of ['classic','smart']) {
    for(const timing of ['before request','during request','unchanged']) test(`${mode}: authentication callback ${timing}`,async()=>{
        const image={...verified(),id:'image',type:'image',asset_uris:{},face_auth_status:'Processing'};
        const owner=mode==='classic'?image:{id:'image',images:[image]};
        let tick,resolve,calls=0;
        const context=vm.createContext({nodes:[owner],setTimeout:fn=>{tick=fn;},
            canvasAssetLibrary:null,
            canvasAvatarRequest:()=>{calls++;return new Promise(r=>resolve=r);},
            smartAvatarRequest:()=>{calls++;return new Promise(r=>resolve=r);},
            setAssetLibraryFromResponse(){},render(){},refreshNodes(){},scheduleSave(){},setStatus(){},toast(){}});
        const file=mode==='classic'?'canvas.js':'smart-canvas.js';
        load(file,context,mode==='classic'?['canvasAvatarPlatform','canvasAssetRegisteredUris','pollImageNodeFaceAuth']:
            ['smartAvatarPlatform','smartAuthenticatedUris','pollSmartImageFaceAuth']);
        if(mode==='classic') context.pollImageNodeFaceAuth('image','item','library',{id:'volcengine'});
        else context.pollSmartImageFaceAuth('image',0,'item','library',{id:'volcengine'});
        const replace=()=>{if(mode==='classic') image.url='/replacement.png';else owner.images[0]={url:'/replacement.png'};};
        if(timing==='before request') replace();
        const pending=tick();
        if(timing==='during request') replace();
        if(resolve) resolve({item:libraryItem()});
        await pending;
        assert.equal(calls,timing==='before request'?0:1);
        assert.equal(image.face_auth_status,timing==='unchanged'?'Active':'Processing');
        const current=mode==='classic'?image:owner.images[0];
        assert.equal(current.asset_uris?.volcengine,timing==='unchanged'?'asset://verified':undefined);
    });
}
test('classic: replacing an authenticated image clears the binding and green marker',()=>{
    const c=classic(); Object.assign(c.context,{pushUndo(){},render(){},outputImageName:()=>'',isVideoUrl:()=>false,isAudioUrl:()=>false});
    load('canvas.js',c.context,['clearCanvasFaceAuth','setImageNodeFromOutput']);
    c.context.setImageNodeFromOutput('image','/new.png');
    assert.equal(c.image.asset_uris,undefined); assert.equal(c.image.asset_item_id,undefined);
    assert.equal(c.image.face_auth_status,undefined);
});
test('smart: editing an authenticated image clears its binding',()=>{
    const s=smart(); Object.assign(s.context,{currentEditImage:()=>({node:s.owner,index:0}),mediaKindForItem:()=> 'image',selectSmartImageEditorTarget(){}});
    load('smart-canvas.js',s.context,['replaceEditedImage']);
    s.context.replaceEditedImage({url:'/edited.png',name:'edited'});
    assert.equal(s.owner.images[0].asset_uris.volcengine,undefined);
    assert.equal(s.owner.images[0].asset_item_id,'');
    assert.equal(s.owner.images[0].face_auth_status,'');
});
for(const mode of ['classic','smart']) test(`${mode}: replacing the image during library upload cannot bind its copy`,async()=>{
    const image={url:'/original.png',id:'image',type:'image'}, owner=mode==='classic'?image:{id:'image',images:[image]};
    let finish;
    const context=vm.createContext({nodes:[owner],canvasAssetLibrary:null,
        canvasAssetLibraries:()=>[{}], activeCanvasAssetCategory:()=>({}), canvasAssetItemLocation:()=>null,
        panelLibraryId:'library', activeCanvasMediaCategory:()=>({id:'category'}),
        LOCAL_CANVAS_ASSET_LIBRARY_ID:'local', outputImageName:()=>'',smartImageNameFromUrl:()=>'',
        smartAssetItemLocation:()=>null,setAssetLibraryFromResponse(){},
        window:{CanvasApi:{createAssetItem:()=>new Promise(resolve=>finish=resolve)}},
    });
    load(mode==='classic'?'canvas.js':'smart-canvas.js',context,[mode==='classic'?'ensureImageNodeAsset':'ensureSmartImageAsset']);
    const pending=mode==='classic'?context.ensureImageNodeAsset(image):context.ensureSmartImageAsset(owner,0,{libraryId:'library',categoryId:'category'});
    image.url='/replacement.png'; finish({item:libraryItem()});
    await assert.rejects(pending,/图片已更改/);
    assert.equal(image.asset_item_id,undefined); assert.equal(image.asset_uris,undefined);
});
test('classic: quick authentication of a copied library item feeds the next video request',async()=>{
    const c=classic(); for(const key of ['asset_uris','asset_item_id','asset_library_id','face_auth_status']) delete c.image[key];
    Object.assign(c.context,{canvasAssetLibrary:null,activeCanvasAssetCategory:()=>({}),
        activeCanvasMediaCategory:()=>({id:'category'}),
        LOCAL_CANVAS_ASSET_LIBRARY_ID:'local',renderCanvasAssetLibrary(){},render(){},setStatus(){}});
    c.context.window.CanvasApi={createAssetItem:async()=>({item:libraryItem()})};
    c.context.classicAssetPanel.selectLibrary('library');
    load('canvas.js',c.context,['ensureImageNodeAsset','quickCanvasAvatarProvider','quickFaceAuthImageNode']);
    await c.context.quickFaceAuthImageNode('image');
    assert.equal(c.context.canvasAssetUrisFaceVerified(c.image.asset_uris),true);
    await c.run(); assert.equal(c.payload().images[0].url,'asset://verified');
});
test('smart: quick authentication updates a mention created before upload',async()=>{
    const s=smart(); for(const key of ['asset_uris','asset_item_id','asset_library_id','face_auth_status']) delete s.image[key];
    const mention={...s.image,nodeId:'source',imageIndex:0};
    Object.assign(s.context,{apiProviders:[{id:'volcengine'}],chooseSmartAssetTarget:async()=>({libraryId:'library',categoryId:'category'}),
        setAssetLibraryFromResponse(){},scheduleSave(){},render(){},toast(){}});
    s.context.window.CanvasApi.createAssetItem=async()=>({item:libraryItem()});
    load('smart-canvas.js',s.context,['ensureSmartImageAsset','smartAvatarPlatform','quickSmartAvatarProvider','quickFaceAuthSmartImage']);
    await s.context.quickFaceAuthSmartImage('source',0);
    assert.equal(s.image.asset_uris.volcengine,'asset://verified');
    await s.run([mention]); assert.equal(s.payload().images[0].url,'asset://verified');
});
for(const mode of ['classic','smart']) test(`${mode}: current library failure overrides cached green binding`,async()=>{
    const s=mode==='classic'?classic():smart();
    const libraries=[{categories:[{items:[{...libraryItem(),registrations:{volcengine:{status:'Failed',asset_id:'verified'}}}]}]}];
    s.context[mode==='classic'?'canvasAssetLibraries':'assetLibraries']=()=>libraries;
    const state=s.context[mode==='classic'?'canvasFaceAuthState':'smartFaceAuthState'](s.image);
    assert.equal(state.ready,false); assert.equal(state.status,'Failed');
    if(mode==='classic') await s.run(); else await assert.rejects(s.run([s.image]),/认证/);
    assert.equal(s.payload(),undefined);
});
for(const mode of ['classic','smart']) test(`${mode}: changing the configured project blocks an old binding`,async()=>{
    const s=mode==='classic'?classic():smart();
    s.context.apiProviders=[{id:'volcengine',protocol:'volcengine',volcengine_project_name:'different-project',video_models:['seedance']}];
    const state=s.context[mode==='classic'?'canvasFaceAuthState':'smartFaceAuthState'](s.image);
    assert.equal(state.ready,false); assert.equal(state.status,'ScopeMismatch');
    if(mode==='classic') await s.run(); else await assert.rejects(s.run([s.image]),/供应商或项目/);
    assert.equal(s.payload(),undefined);
});
test('smart: dedupe upgrades the original slot to the authenticated source without changing numbering',async()=>{
    const s=smart(),other={id:'other',images:[{url:s.image.url,kind:'image'}]};
    s.context.nodes.push(other);
    Object.assign(s.context,{mediaKindForItem:r=>r.kind||'image',blockedInputRefKeys:()=>new Set(),inputRefKey:r=>r.url,manualSmartMediaLinks:()=>[]});
    load('smart-canvas.js',s.context,['smartMediaRefKey','smartMediaReferencePlan']);
    const plan=s.context.smartMediaReferencePlan({},[{url:s.image.url,kind:'image',nodeId:'other',imageIndex:0},{url:'/second.png',kind:'image'}],
        [{...s.image,type:'image',nodeId:'source',imageIndex:0}]);
    assert.equal(plan.refs.length,2); assert.equal(plan.refs[0].nodeId,'source');
    assert.equal(plan.refs[0].referenceLabel,'图片1'); assert.equal(plan.refs[1].referenceLabel,'图片2');
    await s.run(plan.refs); assert.equal(s.payload().images[0].url,'asset://verified');
});
test('smart: multi-image outer frame requires every image to be ready',()=>{
    const s=smart();
    const source=readCanvasSource(path.join(__dirname,'../static/js/smart-canvas.js'),'utf8');
    const statement=source.match(/const faceVerified = isImageNode[^\n]+/)[0];
    const evaluate=images=>{s.context.imgs=images;s.context.isImageNode=true;return vm.runInContext(`(()=>{${statement};return faceVerified;})()`,s.context);};
    assert.equal(evaluate([verified(),{url:'/pending.png',face_auth_status:'Processing'}]),false);
    assert.equal(evaluate([verified(),verified()]),true);
    assert.equal(evaluate([]),false);
});
test('classic: a literal asset URL cannot bypass a failed state',async()=>{
    const s=classic(); s.image.url='asset://verified'; s.image.face_auth_status='Failed';
    await s.run(); assert.equal(s.payload(),undefined); assert.equal(s.messages.length,1);
});
test('shared policy keeps live registration objects behind its lookup index',()=>{
    const auth=require('../static/js/asset-auth.js'),item=libraryItem(),libraries=[{categories:[{items:[item]}]}];
    assert.equal(auth.resolve(verified(),auth.findItem(libraries,verified())).ready,true);
    item.registrations.volcengine.status='Cancelled';
    assert.equal(auth.resolve(verified(),auth.findItem(libraries,verified())).ready,false);
});
test('smart: library updates refresh only nodes whose readiness changed',()=>{
    const s=smart(),changed=[];
    const active={libraries:[{id:'library',categories:[{items:[libraryItem()]}]}]};
    Object.assign(s.context,{assetLibrary:active,assetLibraryUpdatedAt:0,LOCAL_ASSET_LIBRARY_ID:'local',
        mentionAssetCategoryId:'',assetCategories:()=>[],
        activeAssetCategory:()=>null,workflowAssetCategories:()=>[],activeWorkflowAssetCategory:()=>null,
        assetLibraries:()=>s.context.assetLibrary.libraries,refreshSmartNodes:ids=>changed.push([...ids])});
    load('smart-canvas.js',s.context,['setAssetLibraryFromResponse','smartVolcengineFaceVerified','smartFaceVerifiedBadgeHtml']);
    const updated=JSON.parse(JSON.stringify(active));updated.libraries[0].categories[0].items[0].registrations.volcengine.status='Failed';
    s.context.setAssetLibraryFromResponse({library:updated},{render:false});
    assert.deepEqual(changed,[['source']]);
    assert.equal(s.context.smartFaceVerifiedBadgeHtml(s.image.asset_uris,true,s.image),'');
    s.context.setAssetLibraryFromResponse({library:updated},{render:false});
    assert.equal(changed.length,1);
});
