const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({window:{},URL});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/js/pixmax-workflow.js'),'utf8'),context);
const convert=value=>JSON.parse(JSON.stringify(context.window.PixmaxWorkflow.convert(value)));
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
