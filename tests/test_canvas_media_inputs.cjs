const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../static/js/canvas.js'), 'utf8');
function loadFunctions(names, globals={}){
    const context = vm.createContext(globals);
    for(const name of names){
        const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
        assert.notEqual(start, -1, `Missing function ${name}`);
        const end = source.indexOf('\n}', start) + 2;
        vm.runInContext(source.slice(start, end), context);
    }
    return context;
}
const functions = ['isAudioUrl', 'isTextUrl', 'mediaKindForRef', 'imageRefsOnly', 'videoRefsOnly', 'audioRefsOnly', 'videoNodeMediaRefs', 'manualVideoUrlForNode', 'videoInputMediaGroups', 'orderedSources', 'reorderInput', 'canvasTaskWriteGuard', 'classicTaskInputBinding', 'pauseClassicTaskInput', 'runVideoNode'];
function setup(){
    const sources = [
        {id:'a', refs:[{url:'/a.png', kind:'image', name:'人物'}]},
        {id:'b', refs:[{url:'/voice', kind:'audio', name:'对白'}]},
        {id:'c', refs:[{url:'/motion.mp4', kind:'video'}]},
        {id:'d', refs:[{url:'/b.png', kind:'image'}, {url:'/music.mp3', kind:'audio'}]},
        {id:'e', refs:[{url:'/camera.mp4', kind:'video'}]},
        {id:'ignored', refs:[{url:'/notes.txt', kind:'text'}, {url:'', kind:'audio'}]}
    ];
    const node = {id:'gen', type:'video', apiProvider:'volcengine'};
    let payload;
    const noop = () => {};
    const ctx = loadFunctions(functions, {
        window:{}, // Optional billing integration is absent in this fixture.
        allowedVideoResolutions:()=>['','480p','720p','1080p'],
        nodes:[node], generatorSources:() => sources, isVideoUrl:url => /\.mp4$/.test(url),
        render:noop, refreshGeneratorInputViews:noop, refreshGeometryAfterLayout:noop, scheduleSave:noop, cascadeTargetIdFromOptions:()=>'',
        resolveVideoProviderId:id=>id, apiProviders:[], canvasAvatarPlatform:()=> 'volcengine',
        applyUploadedUrlToRefs:refs=>refs, tempShUploadedUrlForNode:(_node,url)=>url,
        outputForNode:()=>null, runSnapshot:()=>({}), refreshRunNodes:noop,
        createCanvasVideoTask:async value=>{payload=value; return {task_id:'test'};},
        waitCanvasVideoTaskResult:async()=>({outputs:['/result.mp4']}),
        videoOutputsFromResult:result=>result.outputs, requestMetaFromResult:()=>({}),
        mergeGeneratedOutputs:noop, addGenerationLog:noop,
        alert:message=>{throw new Error(message);}, tr:key=>key,
        showErrorModal:message=>{throw new Error(message);},
        isCascadeAbortError:()=>false
    });
    sources.push({id:'prompt', refs:[], prompt:'使用图片1的人物，参考视频2，声音参考音频1'});
    return {ctx, node, sources, payload:()=>payload};
}
function plain(value){ return JSON.parse(JSON.stringify(value)); }

test('mixed and multi-output sources have independent, dense type numbering', () => {
    const {ctx,node,sources} = setup();
    const groups = ctx.videoInputMediaGroups(node, sources);
    assert.deepEqual(plain(groups.map(g=>[g.kind,g.items.map(i=>i.referenceLabel)])), [
        ['image',['图片1','图片2']], ['audio',['音频1','音频2']], ['video',['视频1','视频2']]
    ]);
    assert.equal(groups[1].items[0].ref.url, '/voice');
    assert.equal(groups[1].items[1].sourceId, 'd');
    assert.equal(ctx.videoNodeMediaRefs(sources.flatMap(s=>s.refs)).length, 6);
    assert.equal(ctx.videoInputMediaGroups(node, []).length, 0);
});

test('displayed references match the actual video request after same-type reorder', async () => {
    const {ctx,node,sources,payload} = setup();
    ctx.orderedSources(node, sources);
    ctx.reorderInput(node, 'e', 'c');
    const ordered = ctx.orderedSources(node, sources);
    const before = JSON.stringify(node.inputs);
    const groups = ctx.videoInputMediaGroups(node, ordered);
    assert.equal(JSON.stringify(node.inputs), before, 'Grouping must not mutate request order');
    await ctx.runVideoNode(node.id);
    for(const [kind,key] of [['image','images'],['audio','audios'],['video','videos']]){
        const expected = plain(groups.find(g=>g.kind===kind).items.map(i=>i.ref.url));
        assert.deepEqual(plain(payload()[key].map(ref=>typeof ref==='string'?ref:ref.url)), expected);
    }
    assert.equal(groups[2].items[0].referenceLabel, '视频1');
    assert.equal(groups[2].items[0].ref.url, '/camera.mp4');
    assert.equal(payload().prompt, sources.at(-1).prompt);
});

test('manual video override is the only numbered video, including without connections', async () => {
    const {ctx,node,sources,payload} = setup();
    node.manualVideoUrls = ['https://example.com/manual.mp4'];
    const video = ctx.videoInputMediaGroups(node, sources).find(g=>g.kind==='video');
    assert.equal(video.items.length, 1);
    assert.equal(video.items[0].referenceLabel, '视频1');
    assert.equal(video.items[0].sourceId, '');
    await ctx.runVideoNode(node.id);
    assert.deepEqual(plain(payload().videos), [video.items[0].ref.url]);
    assert.equal(ctx.videoInputMediaGroups(node, []).length, 1);
});

test('removing an audio closes its numbering gap without renumbering images or videos', () => {
    const {ctx,node,sources} = setup();
    const groups = ctx.videoInputMediaGroups(node, sources.filter(s=>s.id!=='b'));
    assert.deepEqual(plain(groups[1].items.map(i=>[i.referenceLabel,i.ref.url])), [['音频1','/music.mp3']]);
    assert.deepEqual(plain(groups[2].items.map(i=>i.referenceLabel)), ['视频1','视频2']);
});
