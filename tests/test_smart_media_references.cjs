const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../static/js/smart-canvas.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function setup(){
    let parts = [], base = [], payload;
    const node = {id:'generator'};
    const ctx = vm.createContext({
        window:{},canvasId:'smart-reference-test',
        nodes:[], settings:{engine:'volcengine', apiKind:'video', videoModel:'doubao-seedance-2-5-260628'}, smartLoopContext:null,
        isApiLikeEngine:engine=>['api','volcengine'].includes(engine),
        manualSmartMediaLinks:settings=>settings.videoTempShLinks || [],
        collectPromptParts:()=>parts, defaultReferenceImagesFor:()=>base,
        inputPromptTextFor:()=>'', pushUndo:()=>{}, renderInputThumbsRow:()=>{}, savePromptDraftForCurrent:()=>{}, scheduleSave:()=>{},
        escapeHtml:value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),
        smartVideoPreviewHtml:()=>'<img data-preview-kind="video">', smartPreviewImgHtml:()=>'<img>',
        tr:key=>key, applyUploadedUrlsToSmartRefs:refs=>refs, videoProviderPlatform:()=> 'volcengine',
        smartVolcengineAssetUrisForRef:ref=>ref.asset_uris || {}, manualSmartVideoLink:settings=>settings.videoTempShLinks?.[0],
        isSeedance25VideoModel:()=>true, uid:()=> 'canvas_vid_test', transientSmartCloudLinks:[],
        fetch:async (_url,options)=>{ payload=JSON.parse(options.body); return {ok:true,json:async()=>({task_id:'canvas_vid_test'})}; }
    });
    for(const name of ['isFileMediaItem','isTextMediaItem','isAudioMediaItem','isVideoMediaItem','mediaKindForItem','imageRefsOnly','looksLikeImageMediaUrl','videoRefsOnly','audioRefsOnly','inputRefKey','blockedInputRefKeys','smartTypedVideoInputs','smartMediaRefKey','smartMediaReferencePlan','reorderSmartMediaReference','originalPromptTextFromParts','buildPromptRequest','smartReferencePreviewHtml','mentionTokenHtml','runApiVideoGeneration','uniqueReferenceImages','snapshotRunMeta']){
        const start=source.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));
        assert.notEqual(start,-1,name);
        vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),ctx);
    }
    ctx.escapeAttr=ctx.escapeHtml;
    return {ctx,node,setBase:value=>base=value,setParts:value=>parts=value,payload:()=>payload};
}
const mixed = () => [
    {url:'/a.png',kind:'image',name:'人物'},
    {url:'asset://voice',kind:'audio',name:'人声'},
    {url:'/move.mp4',kind:'video',name:'动作'},
    {url:'asset://person',kind:'image',name:'演员'},
    {url:'/song.mp3',kind:'audio',name:'音乐'},
    {url:'asset://video',kind:'video',name:'运镜'}
];
test('mixed media, including asset URIs, are densely numbered per type',()=>{
    const {ctx,node}=setup();
    const plan=ctx.smartMediaReferencePlan(node,mixed());
    assert.deepEqual(plain(plan.refs.map(ref=>ref.referenceLabel)),['图片1','图片2','音频1','音频2','视频1','视频2']);
    assert.equal(plan.aliases.get('audio|asset://voice'),'音频1');
    assert.equal(ctx.smartMediaReferencePlan(node,[]).refs.length,0);
});
test('same-type reorder preserves source objects and stable token targets',()=>{
    const {ctx,node,setBase,setParts}=setup();
    const refs=mixed(), before=JSON.stringify(refs);
    setBase(refs); setParts([{...refs[3],type:'image'}]);
    const plan=ctx.smartMediaReferencePlan(node,refs);
    ctx.reorderSmartMediaReference(node,plan.refs,1,0);
    assert.equal(ctx.buildPromptRequest(node).prompt,'图片1');
    assert.equal(JSON.stringify(refs),before);
    const order=JSON.stringify(node.mediaReferenceOrder);
    ctx.reorderSmartMediaReference(node,plan.refs,2,0);
    assert.equal(JSON.stringify(node.mediaReferenceOrder),order,'cross-type drag rejected');
    const restored=JSON.parse(JSON.stringify(node));
    assert.equal(ctx.smartMediaReferencePlan(restored,refs).refs[0].url,'asset://person');
});
test('prompt aliases and outgoing payload agree, preserving asset metadata',async()=>{
    const {ctx,node,setBase,setParts,payload}=setup();
    const refs=mixed(); refs[0].asset_uris={volcengine:'asset://registered-image'};
    setBase(refs); setParts([{type:'text',text:'声音参考'}, {...refs[1],type:'image'}, {type:'text',text:'，动作参考'}, {...refs[5],type:'image'}]);
    const request=ctx.buildPromptRequest(node);
    assert.equal(request.prompt,'声音参考音频1，动作参考视频2');
    assert.equal(request.refs[0].asset_uris.volcengine,'asset://registered-image');
    const run=await ctx.runApiVideoGeneration(request.prompt,request.refs);
    await run.submission;
    assert.deepEqual(payload().images.map(ref=>ref.url),['asset://registered-image','asset://person']);
    assert.deepEqual(payload().audios,['asset://voice','/song.mp3']);
    assert.deepEqual(payload().videos,['/move.mp4','asset://video']);
    assert.equal(payload().prompt,request.prompt);
    assert.equal(payload().canvas_id,'smart-reference-test');
    assert.equal(payload().client_task_id,run.taskIds[0]);
});
test('manual videos replace connected videos and invalidate superseded mentions',()=>{
    const {ctx,node,setBase,setParts}=setup();
    const refs=mixed(); setBase(refs);
    ctx.settings.videoTempShLinks=[{url:'https://example.test/manual.mp4',manual:true}];
    const plan=ctx.smartMediaReferencePlan(node,refs);
    assert.deepEqual(plain(plan.refs.filter(ref=>ref.kind==='video').map(ref=>ref.url)),['https://example.test/manual.mp4']);
    setParts([{...refs[2],type:'image'}]);
    assert.throws(()=>ctx.buildPromptRequest(node),/失效/);
    setParts([{type:'image',kind:'video',url:'https://example.test/manual.mp4'}]);
    assert.equal(ctx.buildPromptRequest(node).prompt,'视频1');
});
test('blocked/deleted references fail instead of silently rebinding',()=>{
    const {ctx,node,setParts}=setup();
    setParts([{type:'image',kind:'audio',url:'/voice.mp3',nodeId:'deleted'}]);
    assert.throws(()=>ctx.buildPromptRequest(node),/失效/);
    node.blockedInputRefs=['url|/voice.mp3'];
    setParts([{type:'image',kind:'audio',url:'/voice.mp3'}]);
    assert.throws(()=>ctx.buildPromptRequest(node),/失效/);
});
test('repeated mentions deduplicate; mention ordering does not renumber existing inputs',()=>{
    const {ctx,node,setBase,setParts}=setup();
    const refs=mixed(); setBase(refs);
    setParts([{...refs[4],type:'image'}, {...refs[1],type:'image'}, {...refs[4],type:'image'}]);
    const request=ctx.buildPromptRequest(node);
    assert.equal(request.prompt,'音频2音频1音频2');
    assert.equal(request.refs.length,6);
});
test('preview and persisted mention HTML never contain audio/video elements',()=>{
    const {ctx}=setup();
    for(const ref of mixed()){
        const html=ctx.mentionTokenHtml({...ref,asset_uris:{volcengine:'asset://saved'}});
        assert.doesNotMatch(html,/<(?:video|audio)\b/);
        assert.match(html,/data-asset-uris=/);
        if(ref.kind==='audio') assert.doesNotMatch(html,/<img/);
    }
});
test('image generation keeps legacy prompt serialization',()=>{
    const {ctx,node,setBase,setParts}=setup();
    ctx.settings.apiKind='image';
    setBase([{url:'/a.png',kind:'image'}]);
    setParts([{type:'image',url:'/a.png',kind:'image'}]);
    assert.match(ctx.buildPromptRequest(node).prompt,/图1/);
});
test('asset type must be known, never guessed from opaque asset IDs',()=>{
    const {ctx,node,setBase}=setup();
    setBase([{url:'asset://unknown',name:'历史素材'}]);
    assert.throws(()=>ctx.buildPromptRequest(node),/失效/);
});
test('run snapshots preserve type and registered asset addresses',()=>{
    const {ctx}=setup();
    ctx.promptInput={innerHTML:'saved-html'};
    ctx.promptPlainText=()=> 'saved-text';
    const ref={url:'/voice',kind:'audio',asset_uris:{volcengine:'asset://voice'},nodeId:'owner'};
    const meta=ctx.snapshotRunMeta('音频1','gen','声音参考音频1',[ref]);
    for(const key of ['inputRefs','promptRefs']) assert.deepEqual(plain(meta[key][0]),ref);
});
test('legacy mention tokens recover media kind from their source on reopening',()=>{
    const {ctx}=setup();
    const start=source.indexOf('function collectPromptParts(');
    vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),ctx);
    ctx.Node={TEXT_NODE:3,ELEMENT_NODE:1};
    ctx.nodes=[{id:'source',images:[{url:'asset://voice',kind:'audio',asset_uris:{volcengine:'asset://voice'}}]}];
    const token={nodeType:1,classList:{contains:()=>true},dataset:{url:'asset://voice',nodeId:'source',name:'人声',assetUris:'{}'}};
    ctx.promptInput={childNodes:[token]};
    const parts=ctx.collectPromptParts();
    assert.equal(parts[0].kind,'audio');
    assert.equal(parts[0].asset_uris.volcengine,'asset://voice');
    assert.equal(ctx.smartMediaReferencePlan({},[],parts).refs[0].referenceLabel,'音频1');
});
test('invalid references display an error without starting generation',async()=>{
    const {ctx,node,setParts}=setup();
    const start=source.indexOf('async function runGeneration(');
    vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),ctx);
    let message='';
    ctx.isSmartCanvasLocked=()=>false;
    ctx.selectedNode=()=>node;
    ctx.cloneSmartSettings=value=>plain(value || ctx.settings);
    ctx.smartSettingsForNode=()=>ctx.settings;
    ctx.toast=value=>{message=value;};
    setParts([{type:'image',url:'asset://deleted',kind:'audio',nodeId:'deleted'}]);
    const before=plain(ctx.settings);
    await ctx.runGeneration();
    assert.match(message,/失效/);
    assert.deepEqual(plain(ctx.settings),before);
});
