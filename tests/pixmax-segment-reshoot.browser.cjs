const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {fixture}=require('./helpers/canvas-browser.cjs');
const nativeReshoot=require('./helpers/pixmax-reshoot-native.cjs');
function mediaResponse(route,bytes,type){
    const match=/^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range||'');
    if(!match)return route.fulfill({body:bytes,contentType:type,headers:{'accept-ranges':'bytes'}});
    const start=Number(match[1]),end=Math.min(bytes.length-1,match[2]?Number(match[2]):bytes.length-1);
    if(start>end)return route.fulfill({status:416,headers:{'content-range':'bytes */'+bytes.length}});
    return route.fulfill({status:206,body:bytes.subarray(start,end+1),contentType:type,headers:{'accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${bytes.length}`}});
}
async function setup(t,{seconds=8}={}){
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pixmax-reshoot-ui-'));t.after(()=>{assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(directory).startsWith('pixmax-reshoot-ui-'));fs.rmSync(directory,{recursive:true,force:true});});
    const filename=path.join(directory,'source.mp4');execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc=size=160x90:rate=24','-t',String(seconds),'-c:v','libx264','-pix_fmt','yuv420p','-y',filename]);
    const sourceBytes=fs.readFileSync(filename),f=await fixture(t,'smart',true,{secureOrigin:true});await f.page.route('**/assets/reshoot-source.mp4',route=>mediaResponse(route,sourceBytes,'video/mp4'));
    for(const file of ['canvas-task-bindings.js','canvas-task-results.js'])await f.page.addScriptTag({url:'/static/js/'+file});
    await f.page.evaluate(seconds=>{apiProviders=[{id:'volcengine',name:'火山测试',enabled:true,has_key:true,platform:'volcengine',video_models:['doubao-seedance-2-5-pro']}];Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});const source=createNode(600,140,[{url:'/assets/reshoot-source.mp4',name:'源视频.mp4',kind:'video',duration:seconds,natural_w:160,natural_h:90}],{select:false});window.reshootSourceId=source.id;window.CanvasApi={...CanvasApi,uploadAi:async form=>(await fetch('/api/ai/upload',{method:'POST',body:form})).json()};},seconds);
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
    const {page,errors}=await setup(t),api=await uploads(page);await open(page);await page.getByRole('button',{name:'准备片段',exact:true}).click();await prepared(page);await page.getByRole('spinbutton',{name:'重拍结束时间'}).fill('6');assert.equal(await page.evaluate(()=>nodes[1].segmentReshoot.cache),undefined);await page.getByRole('button',{name:'准备片段',exact:true}).click();await prepared(page);assert.equal(api.calls.length,6);assert.equal(await page.evaluate(()=>nodes[1].segmentReshoot.cache.reshootEndSec),'6.0');assert.deepEqual(errors,[]);
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

async function nativeTimeline(page){
    const timeline=page.locator('[data-reshoot-timeline]');await timeline.locator('img').first().waitFor();
    await page.waitForFunction(()=>[...document.querySelectorAll('[data-reshoot-timeline] img')].every(image=>image.complete&&image.naturalWidth>0));
    await page.waitForFunction(()=>document.querySelector('.pixmax-segment-reshoot-modal video').readyState>=2);
    return timeline;
}
async function dragTimeline(page,element,delta){const box=await element.boundingBox();assert.ok(box&&box.width>0);await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+delta,box.y+box.height/2,{steps:8});await page.mouse.up();}

test('native timeline decodes thumbnails and dragging boundaries or the whole segment saves the chosen range',async t=>{
    const {page,errors,record}=await setup(t);await open(page);const timeline=await nativeTimeline(page),strip=await timeline.getByRole('slider').first().boundingBox();
    assert.ok(await timeline.locator('img').count()>=8);assert.deepEqual(await timeline.locator('img').first().evaluate(image=>[image.naturalWidth,image.naturalHeight]),[72,56]);
    await dragTimeline(page,timeline.locator('button').nth(2),strip.width/4);await page.waitForFunction(()=>nodes[1].segmentReshoot.endSec===6);
    await dragTimeline(page,timeline.locator('button').nth(1),strip.width/8);await page.waitForFunction(()=>nodes[1].segmentReshoot.startSec===1);
    await dragTimeline(page,timeline.getByRole('slider').nth(1),strip.width/8);await page.waitForFunction(()=>nodes[1].segmentReshoot.startSec===2&&nodes[1].segmentReshoot.endSec===7);
    assert.equal(await page.getByRole('spinbutton',{name:'重拍开始时间'}).inputValue(),'2');assert.equal(await page.getByRole('spinbutton',{name:'重拍结束时间'}).inputValue(),'7');await page.evaluate(()=>saveCanvas({force:true}));assert.equal(record.nodes[1].segmentReshoot.startSec,2);assert.equal(record.nodes[1].segmentReshoot.endSec,7);assert.deepEqual(errors,[]);
});

test('native range dragging enforces the four-second minimum and invalidates prepared files',async t=>{
    const {page,errors}=await setup(t),api=await uploads(page);await open(page);await page.getByRole('button',{name:'准备片段',exact:true}).click();await prepared(page);
    const timeline=await nativeTimeline(page),strip=await timeline.getByRole('slider').first().boundingBox();await dragTimeline(page,timeline.locator('button').nth(2),strip.width/4);await page.waitForFunction(()=>nodes[1].segmentReshoot.endSec===6);assert.equal(await page.evaluate(()=>nodes[1].segmentReshoot.cache),undefined);assert.deepEqual(await page.evaluate(()=>nodes[1].runSettings.videoTempShLinks),[]);
    await dragTimeline(page,timeline.locator('button').nth(1),strip.width*.7);await page.waitForFunction(()=>nodes[1].segmentReshoot.endSec-nodes[1].segmentReshoot.startSec===4);assert.equal(api.calls.length,3);assert.deepEqual(errors,[]);
});

test('native timeline constrains a real long source to at most thirty seconds',async t=>{
    const {page,errors}=await setup(t,{seconds:45});await open(page);const timeline=await nativeTimeline(page),strip=await timeline.getByRole('slider').first().boundingBox(),handle=await timeline.locator('button').nth(2).boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2+strip.width*.8,handle.y+handle.height/2,{steps:8});
    const limit=page.locator('[data-pixmax-reshoot-range-limit]');await limit.filter({hasText:'片段最长 30 秒'}).waitFor();assert.ok(await limit.evaluate(element=>{const box=element.getBoundingClientRect(),original=element.style.pointerEvents;element.style.pointerEvents='auto';try{return element.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2))&&Number(getComputedStyle(element).zIndex)>100110;}finally{element.style.pointerEvents=original;}}));await page.screenshot({path:'.local/pixmax-reshoot-range-limit.png'});await page.mouse.up();await page.waitForFunction(()=>nodes[1].segmentReshoot.endSec-nodes[1].segmentReshoot.startSec===30);assert.deepEqual(errors,[]);
});

test('timeline seek and playback share a playhead and playback stops at the selected end',async t=>{
    const {page,errors}=await setup(t);await open(page);const timeline=await nativeTimeline(page),strip=await timeline.getByRole('slider').first().boundingBox();await page.mouse.click(strip.x+strip.width*.8,strip.y+strip.height-3);
    await page.waitForFunction(()=>Math.abs(document.querySelector('.pixmax-segment-reshoot-modal video').currentTime-6.4)<.15);
    await page.evaluate(async()=>{const video=document.querySelector('.pixmax-segment-reshoot-modal video');video.muted=true;await video.play();});await page.waitForFunction(()=>document.querySelector('.pixmax-segment-reshoot-modal video').currentTime<1);
    await page.evaluate(()=>document.querySelector('.pixmax-segment-reshoot-modal video').currentTime=4.1);await page.waitForFunction(()=>{const video=document.querySelector('.pixmax-segment-reshoot-modal video');return video.paused&&Math.abs(video.currentTime-4)<.1;});assert.deepEqual(errors,[]);
});

test('busy preparation and lost edit ownership disable timeline mutations',async t=>{
    const {page,errors}=await setup(t),api=await uploads(page,{hold:true});await open(page);const timeline=await nativeTimeline(page),strip=await timeline.getByRole('slider').first().boundingBox();await page.getByRole('button',{name:'准备片段',exact:true}).click();await api.requested;
    assert.equal(await timeline.evaluate(element=>element.inert),true);await page.mouse.move(strip.x+strip.width/2,strip.y+strip.height/2);await page.mouse.down();await page.mouse.move(strip.x+strip.width*.8,strip.y+strip.height/2,{steps:5});await page.mouse.up();assert.equal(await page.evaluate(()=>nodes[1].segmentReshoot.endSec),4);
    await page.evaluate(()=>MemberCanvasEdit.setEditable(false));api.release();await page.locator('.pixmax-segment-reshoot-modal [role=status]').filter({hasText:'已变化'}).waitFor();assert.equal(await timeline.evaluate(element=>element.inert),true);assert.equal(await page.getByRole('spinbutton',{name:'重拍结束时间'}).isDisabled(),true);assert.equal(await page.evaluate(()=>nodes[1].segmentReshoot.cache),undefined);assert.deepEqual(errors,[]);
});

test('closing or replacing a reshoot dialog destroys the native timeline and releases its player',async t=>{
    const {page,errors}=await setup(t);await page.evaluate(async()=>{window.__timelineDestroyed=0;const api=(await import('/static/vendor/pixmax/editors.js')).canvasSegmentReshoot,original=api.mountTimeline;api.mountTimeline=async(...args)=>{const handle=await original(...args),destroy=handle.destroy;handle.destroy=()=>{window.__timelineDestroyed++;return destroy();};return handle;};});await open(page);await nativeTimeline(page);
    await page.evaluate(()=>window.__reshootPreview=document.querySelector('.pixmax-segment-reshoot-modal video'));await page.getByRole('button',{name:'关闭片段重拍',exact:true}).click();await page.waitForFunction(()=>__timelineDestroyed===1);assert.equal(await page.evaluate(()=>__reshootPreview.getAttribute('src')),null);assert.equal(await page.evaluate(()=>__reshootPreview.paused),true);
    await page.evaluate(()=>PixmaxSegmentReshoot.open(nodes[1]));await nativeTimeline(page);await page.evaluate(()=>PixmaxSegmentReshoot.open(nodes[1]));await page.waitForFunction(()=>__timelineDestroyed===2);assert.equal(await page.getByRole('dialog',{name:'片段重拍',exact:true}).count(),1);await page.getByRole('button',{name:'关闭片段重拍',exact:true}).click();await page.waitForFunction(()=>__timelineDestroyed===3);assert.deepEqual(errors,[]);
});

test('closing during native thumbnail loading cannot recreate the dialog or write preparation state',async t=>{
    const {page,errors,directory}=await setup(t),bytes=fs.readFileSync(path.join(directory,'source.mp4'));let release,seen;const gate=new Promise(resolve=>release=resolve),requested=new Promise(resolve=>seen=resolve);
    await page.route('**/assets/late-native.mp4',async route=>{if(route.request().resourceType()==='fetch'){seen();await gate;}return mediaResponse(route,bytes,'video/mp4');});await page.evaluate(()=>nodes[0].images[0].url='/assets/late-native.mp4');await open(page);await requested;
    await page.getByRole('button',{name:'关闭片段重拍',exact:true}).click();release();await page.waitForTimeout(150);assert.equal(await page.getByRole('dialog',{name:'片段重拍',exact:true}).count(),0);assert.equal(await page.locator('[data-pixmax-reshoot-range-limit]').count(),0);assert.equal(await page.evaluate(()=>nodes[1].segmentReshoot.cache),undefined);assert.equal(await page.evaluate(()=>nodes[1].segmentReshoot.preparedMedia),undefined);assert.deepEqual(errors,[]);
});

test('native timeline fits a narrow screen and remains draggable without horizontal document overflow',async t=>{
    const {page,errors}=await setup(t);await page.setViewportSize({width:390,height:760});await open(page);const timeline=await nativeTimeline(page);await timeline.scrollIntoViewIfNeeded();const strip=await timeline.getByRole('slider').first().boundingBox();await dragTimeline(page,timeline.locator('button').nth(2),strip.width/4);await page.waitForFunction(()=>nodes[1].segmentReshoot.endSec===6);
    const bounds=await page.getByRole('dialog',{name:'片段重拍',exact:true}).locator('section').boundingBox();assert.ok(bounds.width<=358&&bounds.x>=0&&bounds.x+bounds.width<=390);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=390),true);await page.screenshot({path:'.local/pixmax-reshoot-timeline-mobile.png'});assert.deepEqual(errors,[]);
});

async function sourceCard(page){
    await open(page);await page.getByRole('button',{name:'关闭片段重拍',exact:true}).click();
    const id=await page.evaluate(()=>{nodes[1].x=180;nodes[1].y=240;smartSelection.clear();render();return nodes[1].id;});
    const card=page.locator('.image-node[data-id="'+id+'"]');await card.locator('[data-reshoot-source-player] video').waitFor();
    await page.waitForFunction(id=>document.querySelector('.image-node[data-id="'+id+'"] video')?.readyState>=2,id);
    return card;
}
test('source card previews the original without adding a result and preserves its native player through redraws',async t=>{
    const {page,errors,record}=await setup(t),card=await sourceCard(page),player=card.locator('[data-reshoot-source-player]');
    assert.deepEqual(await page.evaluate(()=>nodes[1].images),[]);assert.equal(await player.getAttribute('data-url'),'/assets/reshoot-source.mp4');assert.equal(await card.locator('.node-resize-handle').count(),1);
    await player.getByRole('slider').press('ArrowRight');await page.waitForFunction(()=>Math.abs(document.querySelector('[data-reshoot-source-player] video').currentTime-5)<.1);
    const picture=await player.locator('video').evaluate(video=>{const image=document.createElement('canvas');image.width=video.videoWidth;image.height=video.videoHeight;const ctx=image.getContext('2d');ctx.drawImage(video,0,0);const data=ctx.getImageData(0,0,image.width,image.height).data;return {w:image.width,h:image.height,color:[...data].some((value,index)=>index%4!==3&&value>100)};});assert.deepEqual(picture,{w:160,h:90,color:true});
    await page.evaluate(()=>{window.__sourcePlayerVideo=document.querySelector('[data-reshoot-source-player] video');render();refreshSmartNodes([nodes[1].id]);});assert.equal(await player.locator('video').evaluate(video=>video===__sourcePlayerVideo),true);assert.ok(Math.abs(await player.locator('video').evaluate(video=>video.currentTime)-5)<.1);
    const geometry=await page.evaluate(()=>({rect:nodeRect(nodes[1]),layout:imageLayout(nodes[1].images,nodeScale(nodes[1]),nodes[1])}));assert.equal(geometry.rect.width,geometry.layout.width);assert.equal(geometry.rect.height,geometry.layout.height);
    await page.evaluate(()=>saveCanvas({force:true}));assert.deepEqual(record.nodes[1].images,[]);await page.screenshot({path:'.local/pixmax-reshoot-source-card.png'});assert.deepEqual(errors,[]);
});

test('native dialog playback, mute and seek do not create canvas edits or undo entries',async t=>{
    const {page,errors}=await setup(t);await open(page);await nativeTimeline(page);const player=page.locator('.pixmax-segment-reshoot-modal [data-reshoot-player]');
    const before=await page.evaluate(()=>({undo:undoStack.length,state:JSON.stringify(nodes[1].segmentReshoot),config:JSON.stringify(nodes[1].runSettings)}));await player.locator('.play-toggle').click();await page.waitForFunction(()=>!document.querySelector('.pixmax-segment-reshoot-modal video').paused);await player.locator('.play-toggle').click();await player.locator('button').nth(1).click();assert.equal(await player.locator('video').evaluate(video=>video.muted),true);await player.getByRole('slider').press('ArrowRight');
    assert.deepEqual(await page.evaluate(()=>({undo:undoStack.length,state:JSON.stringify(nodes[1].segmentReshoot),config:JSON.stringify(nodes[1].runSettings)})),before);assert.deepEqual(errors,[]);
});

test('readonly source card opens a native preview while screenshot and generation remain unavailable',async t=>{
    const {page,errors}=await setup(t),media=await uploads(page),api=await tasks(page),card=await sourceCard(page);await page.evaluate(()=>MemberCanvasEdit.setEditable(false));await card.locator('[data-reshoot-source-player] .capture-trigger').waitFor({state:'detached'});
    await card.locator('video').dblclick();const dialog=page.getByRole('dialog',{name:'源视频预览',exact:true});await dialog.waitFor();await page.waitForFunction(()=>document.querySelector('.pixmax-reshoot-preview-modal video')?.readyState>=2);await dialog.locator('.play-toggle').click();await page.waitForFunction(()=>!document.querySelector('.pixmax-reshoot-preview-modal video').paused);
    assert.equal(await dialog.locator('[data-reshoot-run],[data-reshoot-prepare],.capture-trigger').count(),0);assert.equal(media.calls.length,0);assert.equal(api.calls.length,0);assert.deepEqual(await page.evaluate(()=>nodes[1].images),[]);
    await page.evaluate(()=>{CanvasSession.context.workspace.id='another';PixmaxSegmentReshoot.documentChanged();});assert.equal(await dialog.count(),0);assert.deepEqual(errors,[]);
});

test('native source screenshot creates one real PNG connected to the source and keeps the reshoot result empty',async t=>{
    const {page,errors,directory,record}=await setup(t),api=await uploads(page),card=await sourceCard(page);await card.locator('.capture-trigger').hover();await page.getByText('截取当前帧',{exact:true}).click();await page.waitForFunction(()=>nodes.length===3);
    assert.equal(api.calls.length,1);assert.deepEqual(await page.evaluate(()=>nodes[1].images),[]);assert.equal(await page.evaluate(()=>canvas.connections.some(edge=>edge.from===nodes[0].id&&edge.to===nodes[2].id)),true);const file=[...api.files.values()][0];assert.equal(file.type,'image/png');const filename=path.join(directory,'source-frame.png');fs.writeFileSync(filename,file.bytes);const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=width,height','-of','json',filename],{encoding:'utf8'}));assert.deepEqual([probe.streams[0].width,probe.streams[0].height],[160,90]);const pixels=execFileSync('ffmpeg',['-v','error','-i',filename,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);assert.ok(pixels.some(value=>value>100));await page.evaluate(()=>saveCanvas({force:true}));assert.equal(record.nodes[2].images[0].kind,'image');assert.deepEqual(errors,[]);
});

for(const change of ['source','lease'])test('late source screenshot cannot insert after '+change+' changes',async t=>{
    const {page,errors}=await setup(t),api=await uploads(page,{hold:true}),card=await sourceCard(page);await card.locator('.capture-trigger').hover();await page.getByText('截取当前帧',{exact:true}).click();await api.requested;if(change==='source')await page.evaluate(()=>nodes[0].images[0].url='/assets/changed.mp4');else await page.evaluate(()=>MemberCanvasEdit.setEditable(false));api.release();
    await page.waitForFunction(()=>!document.querySelector('[data-reshoot-source-player] .capture-trigger')?.disabled);assert.equal(await page.evaluate(()=>nodes.length),2);assert.deepEqual(await page.evaluate(()=>nodes[1].images),[]);assert.deepEqual(errors,[]);
});

test('generation replaces the source preview with a result player and does not retain source gestures',async t=>{
    const {page,errors}=await setup(t),media=await uploads(page),api=await tasks(page),card=await sourceCard(page);await page.evaluate(()=>window.__oldSourceVideo=document.querySelector('[data-reshoot-source-player] video'));await card.locator('[data-reshoot-open]').click();await page.getByRole('button',{name:'生成重拍视频',exact:true}).click();await page.waitForFunction(()=>nodes[1].images.length===1);await page.getByRole('button',{name:'关闭片段重拍',exact:true}).click();
    assert.equal(await card.locator('.pixmax-reshoot-source,[data-reshoot-source-player]').count(),0);assert.equal(await card.locator('.image-wrap .pixmax-player-mount').count(),1);await page.waitForFunction(()=>__oldSourceVideo.getAttribute('src')===null);assert.equal(media.calls.length,3);assert.equal(api.calls.length,1);assert.deepEqual(errors,[]);
});

test('paused offscreen source preview releases its player and restores the saved playback position',async t=>{
    const {page,errors}=await setup(t),card=await sourceCard(page);await card.getByRole('slider').press('ArrowRight');await page.waitForFunction(()=>Math.abs(document.querySelector('[data-reshoot-source-player] video').currentTime-5)<.1);
    await page.evaluate(()=>{window.__recycledSourceVideo=document.querySelector('[data-reshoot-source-player] video');document.activeElement?.blur();smartSelection.clear();viewport.x=-5000;renderSmartOffscreenPlaceholders();});await card.locator('[data-reshoot-source-player]').waitFor({state:'detached'});await page.waitForFunction(()=>__recycledSourceVideo.getAttribute('src')===null);
    await page.evaluate(()=>{viewport.x=0;renderSmartOffscreenPlaceholders();});await card.locator('[data-reshoot-source-player] video').waitFor();await page.waitForFunction(()=>Math.abs(document.querySelector('[data-reshoot-source-player] video').currentTime-5)<.1);assert.deepEqual(await page.evaluate(()=>nodes[1].images),[]);assert.deepEqual(errors,[]);
});
