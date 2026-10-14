const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {fixture}=require('./helpers/canvas-browser.cjs');
const nativeReshoot=require('./helpers/pixmax-reshoot-native.cjs');
async function setup(t){
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pixmax-reshoot-ui-'));t.after(()=>{assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(directory).startsWith('pixmax-reshoot-ui-'));fs.rmSync(directory,{recursive:true,force:true});});
    const filename=path.join(directory,'source.mp4');execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc=size=160x90:rate=24','-t','8','-c:v','libx264','-pix_fmt','yuv420p','-y',filename]);
    const sourceBytes=fs.readFileSync(filename),f=await fixture(t,'smart',true,{secureOrigin:true});await f.page.route('**/assets/reshoot-source.mp4',route=>route.fulfill({body:sourceBytes,contentType:'video/mp4'}));
    for(const file of ['canvas-task-bindings.js','canvas-task-results.js'])await f.page.addScriptTag({url:'/static/js/'+file});
    await f.page.evaluate(()=>{apiProviders=[{id:'volcengine',name:'火山测试',enabled:true,has_key:true,platform:'volcengine',video_models:['doubao-seedance-2-5-pro']}];Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});const source=createNode(600,140,[{url:'/assets/reshoot-source.mp4',name:'源视频.mp4',kind:'video',duration:8,natural_w:160,natural_h:90}],{select:false});window.reshootSourceId=source.id;window.CanvasApi={...CanvasApi,uploadAi:async form=>(await fetch('/api/ai/upload',{method:'POST',body:form})).json()};});
    return {...f,directory};
}
async function uploads(page,{hold=false,failHead=false}={}){
    const calls=[],files=new Map();let release,seen;const gate=new Promise(resolve=>release=resolve),requested=new Promise(resolve=>seen=resolve);
    await page.route('**/api/ai/upload',async route=>{const request=route.request(),form=await new Request('http://upload.test',{method:'POST',headers:request.headers(),body:request.postDataBuffer()}).formData(),file=form.get('files'),bytes=Buffer.from(await file.arrayBuffer());calls.push(file.name);seen();if(hold)await gate;
        if(failHead&&file.name==='reshoot-head.jpg'){failHead=false;return route.fulfill({json:{files:[]}});}
        const url='/assets/reshoot-upload-'+calls.length+(file.type.startsWith('video/')?'.mp4':'.jpg');files.set(url,{name:file.name,type:file.type,bytes});return route.fulfill({json:{files:[{url,name:file.name,kind:file.type.startsWith('video/')?'video':'image'}]}});
    });
    await page.route('**/assets/reshoot-upload-*',route=>{const file=files.get(new URL(route.request().url()).pathname);return file?route.fulfill({body:file.bytes,contentType:file.type}):route.fulfill({status:404,body:'missing'});});
    return {calls,files,release,requested};
}
async function open(page){await page.evaluate(()=>PixmaxSegmentReshoot.create(reshootSourceId,0));await page.getByRole('dialog',{name:'片段重拍',exact:true}).waitFor();}
async function prepared(page){await page.locator('.pixmax-segment-reshoot-modal [role=status]').filter({hasText:'已准备并保存'}).waitFor();}
async function tasks(page,{unknown=false}={}){
    const calls=[],records=new Map();await page.route('**/api/canvas-video-tasks**',route=>{const request=route.request();if(request.method()==='POST'){const body=request.postDataJSON(),target=body.canvas_target;calls.push(body);const record={id:body.client_task_id,status:'succeeded',canvas_edit_generation:1,result:{videos:[body.videos[0]]},canvas_binding:{version:3,canvas_id:body.canvas_id,canvas_kind:'smart',source_node_id:target.source_node_id,target_node_id:target.target_node_id,submitted_revision:target.base_revision,graph_sha256:target.input_sha256,request_sha256:'a'.repeat(64)}};records.set(record.id,record);return route.fulfill(unknown?{status:502,json:{detail:'回执未知'}}:{json:{task_id:record.id,status:'queued',canvas_binding:record.canvas_binding}});}return route.fulfill({json:records.get(new URL(request.url()).pathname.split('/').pop())});});return {calls,records};
}

test('native toolbar creates one connected reshoot node and prepares three saved files with a reusable cache',async t=>{
    const {page,errors,record,directory}=await setup(t),api=await uploads(page);await page.locator('.image-node .node-body').click();await page.getByRole('toolbar',{name:'视频节点工具'}).getByRole('button',{name:'片段重拍',exact:true}).dblclick();await page.getByRole('dialog',{name:'片段重拍',exact:true}).waitFor();assert.equal(await page.evaluate(()=>nodes.length),2);assert.equal(await page.evaluate(()=>nodes[1].segmentReshoot.endSec),4);await page.getByRole('button',{name:'准备片段',exact:true}).click();await prepared(page);assert.equal(api.calls.length,3);assert.equal(record.nodes[1].runSettings.videoTaskMode,'edit');assert.equal(record.connections[0].from,record.nodes[0].id);assert.ok(record.nodes[1].segmentReshoot.cache.tailFrameAssetUuid);await page.getByRole('button',{name:'准备片段',exact:true}).click();await prepared(page);assert.equal(api.calls.length,3);await page.screenshot({path:'.local/pixmax-segment-reshoot.png'});for(const [url,file] of api.files){const filename=path.join(directory,path.basename(url));fs.writeFileSync(filename,file.bytes);if(file.type.startsWith('video/'))assert.ok(Math.abs(Number(JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','json',filename],{encoding:'utf8'})).format.duration)-4)<.15);}assert.deepEqual(errors,[]);
});

test('changing the chosen range invalidates cached files and prepares the new segment',async t=>{
    const {page,errors}=await setup(t),api=await uploads(page);await open(page);await page.getByRole('button',{name:'准备片段',exact:true}).click();await prepared(page);await page.getByRole('slider',{name:'重拍结束时间'}).fill('6');assert.equal(await page.evaluate(()=>nodes[1].segmentReshoot.cache),undefined);await page.getByRole('button',{name:'准备片段',exact:true}).click();await prepared(page);assert.equal(api.calls.length,6);assert.equal(await page.evaluate(()=>nodes[1].segmentReshoot.cache.reshootEndSec),'6.0');assert.deepEqual(errors,[]);
});

test('an upload retry retains native files and does not repeat successful sibling uploads',async t=>{
    const {page,errors}=await setup(t),api=await uploads(page,{failHead:true});await open(page);await page.getByRole('button',{name:'准备片段',exact:true}).click();await page.locator('.pixmax-segment-reshoot-modal [role=status]').filter({hasText:'上传失败'}).waitFor();await page.getByRole('button',{name:'准备片段',exact:true}).click();await prepared(page);assert.equal(api.calls.length,4);assert.equal(api.calls.filter(name=>name==='reshoot-clip.mp4').length,1);assert.equal(api.calls.filter(name=>name==='reshoot-tail.jpg').length,1);assert.deepEqual(errors,[]);
});

test('prepared reshoot submits one bound edit task with the cropped source and saves the playable result',async t=>{
    const {page,errors,record}=await setup(t),media=await uploads(page),api=await tasks(page);await open(page);await page.getByRole('textbox',{name:'重拍要求'}).fill('把人物衣服改成红色');await page.getByRole('button',{name:'生成重拍视频',exact:true}).click();await page.waitForFunction(()=>nodes[1].images.length===1);assert.equal(api.calls.length,1);assert.equal(media.calls.length,3);assert.equal(api.calls[0].task_mode,'edit');assert.match(api.calls[0].prompt,/衣服改成红色/);assert.equal(api.calls[0].videos[0],await page.evaluate(()=>nodes[1].segmentReshoot.cache.clipAssetUuid));await page.evaluate(()=>saveCanvas({force:true}));assert.equal(record.nodes[1].images.length,1);assert.deepEqual(errors,[]);
});

test('an uncertain reshoot submission retains its task ID and queries it without another paid submission',async t=>{
    const {page,errors}=await setup(t),media=await uploads(page),api=await tasks(page,{unknown:true});await open(page);await page.getByRole('button',{name:'生成重拍视频',exact:true}).click();await page.getByRole('button',{name:'查询原重拍任务',exact:true}).waitFor();assert.equal(api.calls.length,1);const id=await page.evaluate(()=>nodes[1].segmentReshoot.taskId);assert.ok(id);await page.getByRole('button',{name:'查询原重拍任务',exact:true}).click();await page.waitForFunction(()=>nodes[1].images.length===1);assert.equal(api.calls.length,1);assert.equal(media.calls.length,3);assert.deepEqual(errors,[]);
});

for(const change of ['source','lease','close','scope'])test('late segment preparation cannot write after '+change,async t=>{
    const {page,errors}=await setup(t),api=await uploads(page,{hold:true});await open(page);await page.getByRole('button',{name:'准备片段',exact:true}).click();await api.requested;if(change==='source')await page.evaluate(()=>nodes[0].images[0].url='/assets/changed.mp4');if(change==='lease')await page.evaluate(()=>MemberCanvasEdit.setEditable(false));if(change==='close')await page.getByRole('button',{name:'关闭片段重拍',exact:true}).click();if(change==='scope')await page.evaluate(()=>CanvasSession.context.workspace.id='other-workspace');api.release();if(change!=='close')await page.locator('.pixmax-segment-reshoot-modal [role=status]').filter({hasText:'已变化'}).waitFor();else await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>nodes[1].segmentReshoot.cache),undefined);assert.equal(await page.evaluate(()=>nodes[1].segmentReshoot.taskId),undefined);assert.deepEqual(errors,[]);
});

test('clipboard and workflow transfers remap the source, discard foreign task IDs and invalidate prepared cache',async t=>{
    const {page,errors}=await setup(t);await uploads(page);await open(page);await page.getByRole('button',{name:'准备片段',exact:true}).click();await prepared(page);await page.getByRole('button',{name:'关闭片段重拍',exact:true}).click();
    const copied=await page.evaluate(()=>{nodes[1].segmentReshoot.taskId='canvas_vid_foreign';nodes[1].segmentReshoot.completedTaskId='canvas_vid_foreign';smartSelection.insertedNodes(nodes.map(node=>node.id));copySelectedNodes();pasteNodes();const [source,target]=nodes.slice(2);return {source:source.id,reference:target.segmentReshoot.source.nodeId,task:target.segmentReshoot.taskId,cache:target.segmentReshoot.cache,links:target.runSettings.videoTempShLinks};});assert.equal(copied.source,copied.reference);assert.equal(copied.task,undefined);assert.equal(copied.cache,undefined);assert.deepEqual(copied.links,[]);
    const imported=await page.evaluate(()=>{const document={nodes:JSON.parse(JSON.stringify(nodes.slice(0,2))),connections:JSON.parse(JSON.stringify(canvas.connections.slice(0,1)))};document.nodes[0].images[0].url='/assets/relocated-source.mp4';insertSmartWorkflowIntoCanvas(document);const [source,target]=nodes.slice(-2);return {source:source.id,reference:target.segmentReshoot.source.nodeId,url:target.segmentReshoot.source.url,identity:target.segmentReshoot.source.identity,task:target.segmentReshoot.taskId};});assert.equal(imported.source,imported.reference);assert.equal(imported.url,'/assets/relocated-source.mp4');assert.equal(imported.identity,imported.url);assert.equal(imported.task,undefined);assert.deepEqual(errors,[]);
});

test('a standalone copied reshoot retains its media source and can prepare a fresh owned clip',async t=>{
    const {page,errors}=await setup(t),api=await uploads(page);await open(page);await page.getByRole('button',{name:'关闭片段重拍',exact:true}).click();await page.evaluate(()=>{smartSelection.insertedNodes([nodes[1].id]);copySelectedNodes();pasteNodes({includeConnections:false});});assert.equal(await page.evaluate(()=>nodes[2].segmentReshoot.source.nodeId),'');await page.evaluate(()=>PixmaxSegmentReshoot.open(nodes[2]));await page.getByRole('button',{name:'准备片段',exact:true}).click();await prepared(page);assert.equal(api.calls.length,3);assert.deepEqual(errors,[]);
});

test('batch preview refuses an unprepared reshoot and uses only its prepared crop once ready',async t=>{
    const {page,errors}=await setup(t);await uploads(page);await open(page);assert.match(await page.evaluate(()=>{try{PixmaxSegmentReshoot.executionSettings(nodes[1],nodes[1].runSettings);}catch(error){return error.message;}}),/先准备/);await page.getByRole('button',{name:'准备片段',exact:true}).click();await prepared(page);const payload=await page.evaluate(async()=>{const config=PixmaxSegmentReshoot.executionSettings(nodes[1],nodes[1].runSettings);return runApiVideoGeneration('重拍',[],config,null,{preview:true});});assert.equal(payload.task_mode,'edit');assert.deepEqual(payload.videos,[await page.evaluate(()=>nodes[1].segmentReshoot.cache.clipAssetUuid)]);assert.deepEqual(errors,[]);
});

async function importNative(page,document){
    await page.evaluate(document=>insertSmartWorkflowIntoCanvas(document),document);
    return page.evaluate(()=>nodes.findLast(node=>node.segmentReshoot)?.id);
}
async function chooseModel(page){await page.getByRole('combobox',{name:'重拍模型'}).selectOption(JSON.stringify(['volcengine','doubao-seedance-2-5-pro']));}

test('raw native reshoot import requires a local model choice then crops its original range and submits once',async t=>{
    const {page,errors,record}=await setup(t),media=await uploads(page),api=await tasks(page),id=await importNative(page,nativeReshoot());
    const state=await page.evaluate(id=>{const node=nodes.find(node=>node.id===id);return {state:node.segmentReshoot,images:node.images,source:nodes.find(item=>item.id===node.segmentReshoot.source.nodeId)?.id};},id);
    assert.equal(state.state.source.nodeId,state.source);assert.notEqual(state.source,'native-video');assert.deepEqual(state.images,[]);assert.equal(state.state.startSec,1);assert.equal(state.state.endSec,6);
    await page.evaluate(id=>PixmaxSegmentReshoot.open(nodes.find(node=>node.id===id)),id);assert.equal(await page.getByRole('combobox',{name:'重拍模型'}).inputValue(),'');
    await page.getByRole('textbox',{name:'重拍要求'}).fill('把头发改成蓝色');assert.equal(await page.evaluate(id=>nodes.find(node=>node.id===id).runSettings.videoProvider,id),undefined);
    await chooseModel(page);await page.getByRole('button',{name:'生成重拍视频',exact:true}).click();await page.waitForFunction(id=>nodes.find(node=>node.id===id).images.length===1,id);
    assert.equal(api.calls.length,1);assert.equal(media.calls.length,3);assert.equal(api.calls[0].task_mode,'edit');assert.match(api.calls[0].prompt,/蓝色/);await page.evaluate(()=>saveCanvas({force:true}));assert.equal(record.nodes.find(node=>node.id===id).segmentReshoot.cache.reshootStartSec,'1.0');assert.deepEqual(errors,[]);
});

test('complete native cache survives import and save, with no redundant crop or uploads before generation',async t=>{
    const {page,errors,record,directory}=await setup(t),media=await uploads(page),api=await tasks(page);
    const clipFile=path.join(directory,'native-clip.mp4');execFileSync('ffmpeg',['-v','error','-i',path.join(directory,'source.mp4'),'-t','5','-c','copy','-y',clipFile]);const clipBytes=fs.readFileSync(clipFile);await page.route('**/assets/native-clip.mp4',route=>route.fulfill({body:clipBytes,contentType:'video/mp4'}));
    const id=await importNative(page,nativeReshoot({cache:true}));assert.equal(await page.evaluate(id=>nodes.find(node=>node.id===id).segmentReshoot.cache.clipAssetUuid,id),'/assets/native-clip.mp4');
    await page.evaluate(()=>saveCanvas({force:true}));assert.equal(record.nodes.find(node=>node.id===id).segmentReshoot.preparedMedia.length,3);
    await page.evaluate(id=>PixmaxSegmentReshoot.open(nodes.find(node=>node.id===id)),id);await chooseModel(page);await page.getByRole('button',{name:'生成重拍视频',exact:true}).click();await page.waitForFunction(id=>nodes.find(node=>node.id===id).images.length===1,id);
    assert.equal(media.calls.length,0);assert.equal(api.calls.length,1);assert.deepEqual(api.calls[0].videos,['/assets/native-clip.mp4']);assert.deepEqual(errors,[]);
});

test('standalone native import probes missing video duration and remains able to prepare',async t=>{
    const {page,errors}=await setup(t),media=await uploads(page),document=nativeReshoot({duration:null});document.nodes.shift();Object.assign(document.nodes[0].params,{reshootStartSec:'0.1',reshootEndSec:'4.1'});const id=await importNative(page,document);
    assert.equal(await page.evaluate(id=>nodes.find(node=>node.id===id).segmentReshoot.source.nodeId,id),'');await page.evaluate(id=>PixmaxSegmentReshoot.open(nodes.find(node=>node.id===id)),id);
    assert.ok(Math.abs(await page.evaluate(id=>nodes.find(node=>node.id===id).segmentReshoot.source.duration,id)-8)<.1);await page.getByRole('button',{name:'准备片段',exact:true}).click();await prepared(page);assert.equal(media.calls.length,3);assert.deepEqual(errors,[]);
});

test('unresolved native source cannot open or submit as a generic generation node',async t=>{
    const {page,errors}=await setup(t),api=await tasks(page),document=nativeReshoot();document.nodes[1].params.reshootSourceAssetUuid='unknown-asset';const id=await importNative(page,document);
    await page.evaluate(id=>PixmaxSegmentReshoot.open(nodes.find(node=>node.id===id)),id);await page.locator('#toast').filter({hasText:'无法解析'}).waitFor();assert.equal(await page.getByRole('dialog',{name:'片段重拍',exact:true}).count(),0);assert.equal(api.calls.length,0);assert.deepEqual(errors,[]);
});

test('source media reorder preserves the chosen video during workflow remapping; relocated cache is invalidated',async t=>{
    const {page,errors}=await setup(t);const id=await importNative(page,nativeReshoot({cache:true}));
    const result=await page.evaluate(id=>{const target=nodes.find(node=>node.id===id),source=nodes.find(node=>node.id===target.segmentReshoot.source.nodeId);source.images.unshift({kind:'video',url:'/assets/unrelated.mp4'});PixmaxSegmentReshoot.remapReferences(target,new Map([[source.id,source.id]]),{referenceNodes:[source],preservePrepared:true});const original=target.segmentReshoot.source.url;source.images[1].url='/assets/relocated.mp4';target.segmentReshoot.source.media.url=source.images[1].url;PixmaxSegmentReshoot.remapReferences(target,new Map([[source.id,source.id]]),{referenceNodes:[source],preservePrepared:true});return {original,url:target.segmentReshoot.source.url,cache:target.segmentReshoot.cache};},id);
    assert.equal(result.original,'/assets/reshoot-source.mp4');assert.equal(result.url,'/assets/relocated.mp4');assert.equal(result.cache,undefined);assert.deepEqual(errors,[]);
});
