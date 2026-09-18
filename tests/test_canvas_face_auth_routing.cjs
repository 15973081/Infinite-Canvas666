const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(file, context, names) {
    const source = fs.readFileSync(path.join(__dirname, '../static/js', file), 'utf8').replace(/\r\n/g, '\n');
    for (const name of names) {
        const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
        assert.ok(start >= 0, name);
        vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), context);
    }
}
const verified = () => ({url:'/output/original.png', name:'person', kind:'image',
    face_auth_status:'Active', asset_item_id:'item', asset_library_id:'library',
    asset_uris:{volcengine:'asset://verified'}});
const libraryItem = () => ({id:'item', url:'/assets/library/copied.png',
    registrations:{volcengine:{status:'Active', asset_uri:'asset://verified'}}});

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
            canvasAssetLibrary:null,canvasAssetLibraryOpen:false,
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
    const s=smart(); Object.assign(s.context,{currentEditImage:()=>({node:s.owner,index:0}),mediaKindForItem:()=> 'image'});
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
        activeCanvasAssetLibraryId:'library', activeCanvasMediaCategory:()=>({id:'category'}),
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
        activeCanvasAssetLibraryId:'library',activeCanvasMediaCategory:()=>({id:'category'}),
        LOCAL_CANVAS_ASSET_LIBRARY_ID:'local',renderCanvasAssetLibrary(){},render(){},setStatus(){}});
    c.context.window.CanvasApi={createAssetItem:async()=>({item:libraryItem()})};
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
