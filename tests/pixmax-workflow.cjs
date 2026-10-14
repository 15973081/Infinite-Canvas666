const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({window:{},URL});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/js/pixmax-workflow.js'),'utf8'),context);
const convert=value=>JSON.parse(JSON.stringify(context.window.PixmaxWorkflow.convert(value)));
const nativeStoryboard=require('./helpers/pixmax-storyboard-native.cjs');
const nativeReshoot=require('./helpers/pixmax-reshoot-native.cjs');

test('native reshoot imports source ownership, range and prompt without displaying the source as generated output',()=>{
    const source=nativeReshoot(),result=convert(source),target=result.nodes[1];
    assert.equal(target.segmentReshoot.schemaVersion,1);assert.equal(target.segmentReshoot.source.nodeId,'native-video');assert.equal(target.segmentReshoot.source.url,'/assets/reshoot-source.mp4');assert.equal(target.segmentReshoot.source.duration,8);
    assert.equal(target.segmentReshoot.startSec,1);assert.equal(target.segmentReshoot.endSec,6);assert.equal(target.segmentReshoot.prompt,'把头发改成红色');assert.deepEqual(target.images,[]);
    assert.equal(target.runSettings.videoTaskMode,'edit');assert.equal(target.runSettings.videoModel,'PIXDANCE_2_5');assert.equal(target.runSettings.videoProvider,undefined);assert.equal(target.segmentReshoot.taskId,undefined);assert.equal(JSON.stringify(result).includes('foreign-task'),false);assert.deepEqual(result.warnings,[]);
    assert.equal(source.nodes[1].defaultAsset.assetsUuid,'native-source');
    Object.assign(source.nodes[1].params,{reshootStartSec:'0.1',reshootEndSec:'4.1'});assert.equal(convert(source).nodes[1].segmentReshoot.importError,undefined);
});

test('reshoot resolves complete native cache IDs to typed media URLs and rejects stale or incomplete cache',()=>{
    const source=nativeReshoot({cache:true}),target=convert(source).nodes[1];
    assert.equal(target.segmentReshoot.cache.reshootSourceAssetUuid,'/assets/reshoot-source.mp4');assert.equal(target.segmentReshoot.cache.clipAssetUuid,'/assets/native-clip.mp4');assert.deepEqual(target.segmentReshoot.preparedMedia.map(item=>item.kind),['video','image','image']);assert.deepEqual(target.runSettings.videoTempShLinks,[{manual:true,url:'/assets/native-clip.mp4'}]);
    source.nodes.pop();const result=convert(source);assert.equal(result.nodes[1].segmentReshoot.cache,undefined);assert.match(result.warnings[0],/缓存不完整/);
    const changed=nativeReshoot({cache:true});changed.nodes[1].params.reshootEndSec='7.0';assert.equal(convert(changed).nodes[1].segmentReshoot.cache,undefined);
});

test('completed reshoot output remains distinct from its source; standalone imports keep the resolved source',()=>{
    const source=nativeReshoot();source.nodes[1].defaultAsset={assetsUuid:'native-result',type:'VIDEO',webUrl:'/assets/result.mp4'};
    const target=convert(source).nodes[1];assert.equal(target.images[0].url,'/assets/result.mp4');assert.equal(target.segmentReshoot.source.url,'/assets/reshoot-source.mp4');
    const standalone=nativeReshoot();standalone.nodes.shift();const detached=convert(standalone).nodes[0];assert.equal(detached.segmentReshoot.source.nodeId,'');assert.equal(detached.segmentReshoot.source.media.kind,'video');assert.deepEqual(detached.images,[]);
});

test('missing reshoot sources and malformed native ranges remain explicit blocked imports',()=>{
    const missing=nativeReshoot();missing.nodes[1].params.reshootSourceAssetUuid='missing';const result=convert(missing);assert.match(result.nodes[1].segmentReshoot.importError,/源视频/);assert.match(result.warnings[0],/源视频/);assert.equal(result.nodes[1].segmentReshoot.source.url,'');
    for(const [start,end] of [['','6'],['NaN','6'],['-1','6'],['2','5'],['0','31'],['1','9']]){const document=nativeReshoot();Object.assign(document.nodes[1].params,{reshootStartSec:start,reshootEndSec:end});assert.match(convert(document).nodes[1].segmentReshoot.importError,/范围无效/);}
    const tooLong=nativeReshoot({duration:601});assert.match(convert(tooLong).nodes[1].segmentReshoot.importError,/10 分钟/);
});
test('native storage paths use the asset origin while absolute and receiving-app paths keep their identity',()=>{
    const result=convert({nodes:[{uuid:'image',type:'BASE_IMAGE',defaultAsset:{type:'IMAGE',webUrl:'/static/img/original.png',thumbnailWebUrl:'/static/img/thumbnail.webp',ossDomain:'https://media.example.test/'},nodeAssets:[{type:'IMAGE',webUrl:'https://original.example.test/photo.png',thumbnailWebUrl:'javascript:alert(1)'},{type:'IMAGE',webUrl:'/test-image.svg'}]},
        {uuid:'video',type:'BASE_VIDEO',prevNodeUuids:['image'],defaultAsset:{type:'VIDEO',webUrl:'/static/video/movie.mp4',thumbnailVideoWebUrl:'/static/img/movie.jpg',ossDomain:'javascript:alert(1)'}}]});
    assert.equal(result.nodes[0].images[0].url,'https://media.example.test/static/img/original.png');
    assert.equal(result.nodes[0].images[0].thumbnailUrl,'https://media.example.test/static/img/thumbnail.webp');
    assert.equal(result.nodes[0].images[1].url,'https://original.example.test/photo.png');assert.equal(result.nodes[0].images[1].thumbnailUrl,undefined);
    assert.equal(result.nodes[0].images[2].url,'/test-image.svg');assert.equal(result.nodes[1].images[0].kind,'video');
    assert.equal(result.nodes[1].images[0].url,'https://pixmax-prod.oss-accelerate.aliyuncs.com/static/video/movie.mp4');
    assert.equal(result.nodes[1].images[0].poster,'https://pixmax-prod.oss-accelerate.aliyuncs.com/static/img/movie.jpg');
    assert.deepEqual(result.connections,[{from:'image',to:'video',kind:'input'}]);
});
test('conversion preserves geometry and available media while ignoring foreign tasks and invalid links',()=>{
    const result=convert({data:{uuid:'foreign-canvas',revision:99,nodes:[{uuid:'text',type:'GENERATE_TEXT',nodeText:'用户剧本',generatingTask:{id:'foreign-task'},prevNodeUuids:'malformed',metaData:'{"position":{"x":-40,"y":80},"width":240,"height":320,"data":{"label":"故事"}}'},
        {uuid:'result',type:'GENERATE_IMAGE',prevNodeUuids:['text','text','missing','result'],params:{prompt:'电影画面',aspectRatio:'16:9',resolution:'2K'},defaultAsset:{type:'IMAGE',webUrl:'javascript:alert(1)',previewWebUrl:'/static/img/fallback.png',width:1024,height:576},generationTask:{id:'foreign-result'}},
        {uuid:'unsupported',type:'UNKNOWN'}]}});
    assert.equal(result.nodes[0].x,-40);assert.equal(result.nodes[0].label,'故事');assert.equal(result.nodes[0].h,320);assert.equal(result.nodes[0].generatingTask,undefined);
    assert.equal(result.nodes[1].images[0].url,'https://pixmax-prod.oss-accelerate.aliyuncs.com/static/img/fallback.png');
    assert.equal(result.nodes[1].images[0].natural_w,1024);assert.equal(result.nodes[1].runSettings.ratio,'wide');assert.equal(result.nodes[1].runSettings.resolution,'2k');assert.equal(result.nodes[1].generationTask,undefined);
    assert.deepEqual(result.connections,[{from:'text',to:'result',kind:'input'}]);assert.deepEqual(result.nodes[1].inputNodeIds,['text']);assert.deepEqual(result.warnings,['未导入节点类型：UNKNOWN']);
    assert.throws(()=>convert({nodes:[{uuid:'duplicate',type:'BASE_IMAGE'},{uuid:'duplicate',type:'BASE_VIDEO'}]}),/重复/);
});

test('video thumbnails retain a playable preview stream and an image poster as separate resources',()=>{
    const result=convert({nodes:[{uuid:'clip',type:'BASE_VIDEO',defaultAsset:{fileType:'VIDEO',webUrl:'/static/video/original.mp4',previewWebUrl:'/static/video/preview.jpg',thumbnailWebUrl:'/static/video/poster.jpg',thumbnailVideoWebUrl:'/static/video/small.mp4'}}]});
    const media=result.nodes[0].images[0];assert.match(media.url,/original.mp4$/);assert.match(media.poster,/poster.jpg$/);assert.match(media.previewVideoUrl,/small.mp4$/);assert.equal(media.kind,'video');
});
test('native storyboard source, both prompt fields and available visual/audio bindings survive conversion without foreign task IDs',()=>{
    const result=convert(nativeStoryboard()),board=result.nodes[3];assert.equal(board.shots.length,2);assert.equal(board.shots[0].cameraAngle,'平视');assert.equal(board.shots[0].sound,'脚步声');
    assert.deepEqual(board.shots[0].assetIds,['person','street']);assert.match(board.shots[0].prompt,/@person/);assert.match(board.shots[0].videoPrompt,/@voice-person/);
    assert.deepEqual(board.storyboardAssets.map(asset=>asset.imageNodeId),['person-image','street-image']);assert.equal(board.storyboardAudioAssets[0].nodeId,'voice');assert.equal(JSON.stringify(result).includes('foreign-'),false);
});
test('native queued prompt imports as interrupted; missing bound nodes are cleared',()=>{
    const source=nativeStoryboard(),info=JSON.parse(source.nodes[3].metaData);info.data.shotScriptClientState.shotClientByNo['1'].promptStatus='queue';source.nodes[3].metaData=JSON.stringify(info);source.nodes.splice(0,1);
    const board=convert(source).nodes[2];assert.equal(board.shots[0].promptStatus,'interrupted');assert.equal(board.storyboardAssets[0].imageNodeId,undefined);
});
test('native parentId and groupTitle reconstruct visual frames without offsetting absolute node coordinates',()=>{
    const result=convert({nodes:[{uuid:'a',type:'GENERATE_IMAGE',metaData:JSON.stringify({position:{x:200,y:100},parentId:'native-frame',groupTitle:'分镜图像'})},{uuid:'b',type:'GENERATE_VIDEO',metaData:JSON.stringify({position:{x:600,y:100},parentId:'native-frame',groupTitle:'分镜图像'})}]});
    assert.equal(result.nodes.length,3);assert.deepEqual(result.nodes.slice(0,2).map(node=>[node.x,node.y,node.frameId]),[[200,100,'native-frame'],[600,100,'native-frame']]);assert.equal(result.nodes[2].type,'smart-frame');assert.equal(result.nodes[2].label,'分镜图像');assert.deepEqual(result.connections,[]);
});
