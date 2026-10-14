const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {fixture}=require('./helpers/canvas-browser.cjs');
const nativeReshoot=require('./helpers/pixmax-reshoot-native.cjs');
const chooseReshootModel=require('./helpers/pixmax-reshoot-model.cjs');
const subjectCatalog=require('./helpers/pixmax-subject-library.cjs');
function mediaResponse(route,bytes,type){
    const match=/^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range||'');
    if(!match)return route.fulfill({body:bytes,contentType:type,headers:{'accept-ranges':'bytes'}});
    const start=Number(match[1]),end=Math.min(bytes.length-1,match[2]?Number(match[2]):bytes.length-1);
    if(start>end)return route.fulfill({status:416,headers:{'content-range':'bytes */'+bytes.length}});
    return route.fulfill({status:206,body:bytes.subarray(start,end+1),contentType:type,headers:{'accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${bytes.length}`}});
}
async function setup(t,{seconds=8,permissions}={}){
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pixmax-reshoot-ui-'));t.after(()=>{assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(directory).startsWith('pixmax-reshoot-ui-'));fs.rmSync(directory,{recursive:true,force:true});});
    const filename=path.join(directory,'source.mp4');execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc=size=160x90:rate=24','-t',String(seconds),'-c:v','libx264','-pix_fmt','yuv420p','-y',filename]);
    const sourceBytes=fs.readFileSync(filename),f=await fixture(t,'smart',true,{secureOrigin:true,permissions});await f.page.route('**/assets/reshoot-source.mp4',route=>mediaResponse(route,sourceBytes,'video/mp4'));
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

async function selectSubject(page,name='摄影师主体'){
    await page.getByRole('button',{name:'添加主体',exact:true}).click();const library=page.getByRole('dialog',{name:'主体库',exact:true});
    await library.getByText(name,{exact:true}).waitFor();await library.locator('[data-subject-cards] .group').filter({hasText:name}).hover();
    await library.getByRole('button',{name:'应用',exact:true}).click();await library.waitFor({state:'detached'}).catch(async error=>{throw Error(error.message+'; status='+await library.locator('[role=status]').textContent()+'; '+JSON.stringify(await page.evaluate(()=>({prompt:nodes[1].segmentReshoot.prompt,chipCount:document.querySelectorAll('.pixmax-reshoot-rich-prompt [data-editor-node-type="subject-reference"]').length}))))});
    await page.locator('.pixmax-reshoot-rich-prompt [data-editor-node-type="subject-reference"]').first().waitFor();
}

test('subject native cards insert one real chip with four hidden inputs and submit typed resources',async t=>{
    const {page,errors,record}=await setup(t),catalog=await subjectCatalog(page),media=await uploads(page),api=await tasks(page);await open(page);
    const before=await page.evaluate(()=>undoStack.length);await selectSubject(page);
    assert.equal(await page.evaluate(()=>undoStack.length),before+1);
    const state=await page.evaluate(()=>({count:nodes.filter(node=>node.subjectReference).length,prompt:nodes[1].segmentReshoot.prompt,compiled:PixmaxReshootReferences.validate(nodes[1]),subjects:nodes[1].segmentReshoot.subjects}));
    assert.equal(state.count,4);assert.equal(state.subjects[0].memberId,'member-1');assert.match(state.prompt,/%%subject-ref\(/);assert.match(state.compiled,/年轻摄影师/);assert.match(state.compiled,/摄影师主体（文本1、图片1、音频1、视频2）/);assert.ok(!state.compiled.includes(catalog.id));
    await page.evaluate(()=>saveCanvas({force:true}));assert.equal(record.nodes.filter(node=>node.subjectReference).length,4);
    await page.screenshot({path:'.local/pixmax-subject-native-reference.png'});
    await page.getByRole('button',{name:'生成重拍视频',exact:true}).click();await page.waitForFunction(()=>nodes[1].images.length===1);
    assert.equal(api.calls.length,1);assert.equal(media.calls.length,3);assert.equal(api.calls[0].images.length,1);assert.equal(api.calls[0].audios.length,1);assert.equal(api.calls[0].videos.length,2);assert.ok(!api.calls[0].prompt.includes('%%subject-ref('));assert.ok(catalog.calls.every(call=>call.headers['x-member-id']==='member-1'&&call.headers['x-workspace-id']==='workspace-1'));assert.deepEqual(errors,[]);
});

test('subject labels survive ordinary composer capture copying and reopening the native prompt',async t=>{
    const {page,errors}=await setup(t);await subjectCatalog(page);await open(page);await selectSubject(page);
    const raw=await page.evaluate(()=>nodes[1].segmentReshoot.prompt);await page.getByRole('button',{name:'关闭片段重拍',exact:true}).click();
    await page.evaluate(()=>{smartSelection.createdNode(nodes[1].id);render();promptInput.innerHTML=nodes[1].promptDraftHtml;PixmaxReshootReferences.captureComposer(nodes[1]);});
    assert.equal(await page.evaluate(()=>nodes[1].segmentReshoot.prompt),raw);
    await page.evaluate(()=>{document.activeElement.blur();copySelectedNodes();pasteNodes();});
    const copied=await page.evaluate(()=>{const copy=nodes.filter(node=>node.segmentReshoot).at(-1);return {id:copy.id,count:PixmaxReshootReferences.plan(copy).entries.length,prompt:PixmaxReshootReferences.validate(copy)};});assert.equal(copied.count,4);assert.match(copied.prompt,/摄影师主体/);
    await page.evaluate(()=>PixmaxSegmentReshoot.open(nodes[1]));assert.equal(await page.locator('.pixmax-reshoot-rich-prompt [data-editor-node-type="subject-reference"]').count(),1);assert.deepEqual(errors,[]);
});

test('subject token removal prunes its hidden resources and keeps unrelated manual references',async t=>{
    const {page,errors}=await setup(t);await subjectCatalog(page);await open(page);await selectSubject(page);
    await page.evaluate(()=>{const source=createNode(0,0,[{url:'/test-image.svg',kind:'image',name:'手工图片'}],{select:false});PixmaxReshootReferences.connect(nodes[1],source.id);});
    await page.getByRole('textbox',{name:'重拍要求'}).fill('仅保留手工图片');
    assert.equal(await page.evaluate(()=>nodes.filter(node=>node.subjectReference).length),0);
    assert.equal(await page.evaluate(()=>PixmaxReshootReferences.plan(nodes[1]).entries.filter(entry=>entry.kind==='image').length),1);assert.deepEqual(errors,[]);
});

test('subject catalog changes refresh canonical names and text before task creation',async t=>{
    const {page,errors}=await setup(t),catalog=await subjectCatalog(page),media=await uploads(page),api=await tasks(page);await open(page);await selectSubject(page);
    const ids=await page.evaluate(()=>nodes.filter(node=>node.subjectReference).map(node=>node.id));
    catalog.change(group=>{group.name='修订后的摄影师';group.items[0].text='摄影师换上红色外套';});
    await page.getByRole('button',{name:'生成重拍视频',exact:true}).click();await page.waitForFunction(()=>nodes[1].images.length===1);
    assert.match(api.calls[0].prompt,/修订后的摄影师/);assert.match(api.calls[0].prompt,/红色外套/);assert.equal(media.calls.length,3);assert.deepEqual(await page.evaluate(()=>nodes.filter(node=>node.subjectReference).map(node=>node.id)),ids);assert.deepEqual(errors,[]);
});

test('subject changes during crop block submission and a retry reuses all three prepared files',async t=>{
    const {page,errors}=await setup(t),catalog=await subjectCatalog(page),media=await uploads(page,{hold:true}),api=await tasks(page);await open(page);await selectSubject(page);
    await page.getByRole('button',{name:'生成重拍视频',exact:true}).click();await media.requested;catalog.change(group=>{group.items[0].text='目录更新后的设定';});media.release();
    await page.locator('.pixmax-segment-reshoot-modal [role=status]').filter({hasText:'主体目录已变化'}).waitFor();assert.equal(api.calls.length,0);assert.equal(media.calls.length,3);assert.ok(await page.evaluate(()=>nodes[1].segmentReshoot.cache));
    await page.getByRole('button',{name:'生成重拍视频',exact:true}).click();await page.waitForFunction(()=>nodes[1].images.length===1);assert.match(api.calls[0].prompt,/目录更新后的设定/);assert.equal(media.calls.length,3);assert.deepEqual(errors,[]);
});

test('subject deleted or moved to another owner scope cannot upload or create a task',async t=>{
    const {page,errors}=await setup(t),catalog=await subjectCatalog(page),media=await uploads(page),api=await tasks(page);await open(page);await selectSubject(page);catalog.remove();
    await page.getByRole('button',{name:'生成重拍视频',exact:true}).click();await page.locator('.pixmax-segment-reshoot-modal [role=status]').filter({hasText:'主体'}).waitFor();assert.equal(media.calls.length,0);assert.equal(api.calls.length,0);
    await page.evaluate(()=>nodes[1].segmentReshoot.subjects[0].memberId='foreign-member');
    await page.getByRole('button',{name:'生成重拍视频',exact:true}).click();await page.locator('.pixmax-segment-reshoot-modal [role=status]').filter({hasText:'当前成员或空间'}).waitFor();assert.equal(api.calls.length,0);assert.deepEqual(errors,[]);
});

test('subject library CRUD preserves a conflicting name draft until explicit latest-version review',async t=>{
    const {page,errors}=await setup(t),catalog=await subjectCatalog(page);await open(page);await page.getByRole('button',{name:'添加主体',exact:true}).click();const library=page.getByRole('dialog',{name:'主体库',exact:true});
    await library.locator('[data-subject-cards] .group').filter({hasText:'摄影师主体'}).hover();await library.getByRole('button',{name:'查看',exact:true}).click();const edit=page.getByRole('dialog',{name:'编辑主体',exact:true});
    await edit.getByLabel('主体名称',{exact:true}).fill('我的修改草稿');catalog.change(group=>{group.name='另一窗口修改';});
    await edit.getByRole('button',{name:'保存主体',exact:true}).click();await edit.locator('[role=status]').filter({hasText:'其他窗口'}).waitFor();assert.equal(await edit.getByLabel('主体名称',{exact:true}).inputValue(),'我的修改草稿');
    await edit.getByRole('button',{name:'读取最新版本',exact:true}).click();await edit.getByText(/最新主体：另一窗口修改/).waitFor();assert.equal(await edit.getByLabel('主体名称',{exact:true}).inputValue(),'我的修改草稿');
    await edit.getByRole('button',{name:'按当前草稿保存',exact:true}).click();await edit.locator('[role=status]').filter({hasText:'已保存'}).waitFor();assert.equal(catalog.catalogs.PERSONAL.groups[0].name,'我的修改草稿');
    await edit.getByRole('button',{name:'添加文字',exact:true}).click();const text=page.getByRole('dialog',{name:'添加主体文字',exact:true});await text.getByLabel('文字正文').fill('\n  补充主体信息\n');await text.getByRole('button',{name:'保存文字',exact:true}).click();await text.waitFor({state:'detached'});assert.equal(catalog.catalogs.PERSONAL.groups[0].items.length,5);
    await edit.getByRole('button',{name:'设为封面',exact:true}).click();await edit.locator('[role=status]').filter({hasText:'已保存'}).waitFor();
    await edit.getByRole('button',{name:'删除主体',exact:true}).click();await edit.waitFor({state:'detached'});assert.equal(catalog.catalogs.PERSONAL.groups.length,0);assert.deepEqual(errors,[]);
});

test('subject picker errors can retry and readonly catalog cards still apply existing subjects',async t=>{
    const {page,errors}=await setup(t),catalog=await subjectCatalog(page,{manage:false});catalog.fail(true);await open(page);await page.getByRole('button',{name:'添加主体',exact:true}).click();const library=page.getByRole('dialog',{name:'主体库',exact:true});
    await library.locator('[role=status]').filter({hasText:'暂时失败'}).waitFor();catalog.fail(false);await library.getByRole('button',{name:'重新加载',exact:true}).click();await library.getByText('摄影师主体',{exact:true}).waitFor();assert.ok(await library.getByRole('button',{name:'新建主体',exact:true}).isDisabled());
    await library.locator('[data-subject-cards] .group').filter({hasText:'摄影师主体'}).hover();await library.getByRole('button',{name:'应用',exact:true}).click();await library.waitFor({state:'detached'});assert.equal(await page.locator('.pixmax-reshoot-rich-prompt [data-editor-node-type="subject-reference"]').count(),1);assert.equal(catalog.calls.filter(call=>call.method!=='GET').length,0);assert.deepEqual(errors,[]);
});

test('subject pending picker requests cannot write after losing the canvas lease',async t=>{
    const {page,errors}=await setup(t),catalog=await subjectCatalog(page);await open(page);const requested=catalog.hold();await page.getByRole('button',{name:'添加主体',exact:true}).click();await requested;
    await page.evaluate(()=>{MemberCanvasEdit.setEditable(false);PixmaxSegmentReshoot.documentChanged();});catalog.release();await page.getByRole('dialog',{name:'主体库',exact:true}).waitFor({state:'detached'});assert.equal(await page.evaluate(()=>nodes.filter(node=>node.subjectReference).length),0);assert.deepEqual(errors,[]);
});

test('subject native hover uses the scoped group adapter and repeated chips reuse material nodes',async t=>{
    const {page,errors}=await setup(t),catalog=await subjectCatalog(page);await open(page);await selectSubject(page);
    const chip=page.locator('.pixmax-reshoot-rich-prompt [data-editor-node-type="subject-reference"]');await chip.hover();await page.getByText('黄昏的摄影师',{exact:true}).waitFor();assert.ok(catalog.calls.filter(call=>call.method==='GET'&&call.path.endsWith(catalog.id)).length>=2);
    await page.getByRole('textbox',{name:'重拍要求'}).click();await selectSubject(page);assert.equal(await page.evaluate(()=>nodes.filter(node=>node.subjectReference).length),4);assert.equal(await page.locator('.pixmax-reshoot-rich-prompt [data-editor-node-type="subject-reference"]').count(),2);assert.deepEqual(errors,[]);
});

test('subject team creation adds a real uploaded picture preserves scope and fits a narrow viewport',async t=>{
    const {page,errors,directory}=await setup(t,{permissions:['canvas.read','canvas.create','canvas.edit','asset.read','asset.manage','asset.upload']}),catalog=await subjectCatalog(page),media=await uploads(page);await open(page);await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'添加主体',exact:true}).click();const library=page.getByRole('dialog',{name:'主体库',exact:true});await library.getByRole('tab',{name:'空间主体',exact:true}).click();await library.getByRole('button',{name:'新建主体',exact:true}).click();const editor=page.getByRole('dialog',{name:'新建主体',exact:true});
    await editor.getByLabel('主体名称',{exact:true}).fill('空间共享人物');await editor.getByLabel('主体描述',{exact:true}).fill('大家可以使用的主体');await editor.getByRole('button',{name:'保存主体',exact:true}).click();await editor.locator('[role=status]').filter({hasText:'已保存'}).waitFor();
    await editor.getByRole('button',{name:'添加素材',exact:true}).click();const picker=page.getByRole('dialog',{name:'添加主体素材',exact:true}),bytes=execFileSync('ffmpeg',['-v','error','-i',path.join(directory,'source.mp4'),'-frames:v','1','-f','image2pipe','-vcodec','png','-']);
    await picker.getByLabel('上传主体素材').setInputFiles({name:'空间人物.png',mimeType:'image/png',buffer:bytes});await picker.waitFor({state:'detached'});assert.equal(media.calls.length,1);assert.equal(catalog.catalogs.TEAM.groups[0].items[0].kind,'image');
    await page.getByRole('button',{name:'关闭新建主体',exact:true}).click();await library.getByText('空间共享人物',{exact:true}).waitFor();const box=await library.locator('section').first().boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);await library.screenshot({path:'.local/pixmax-subject-library-mobile.png'});
    await library.locator('[data-subject-cards] .group').filter({hasText:'空间共享人物'}).hover();await library.getByRole('button',{name:'应用',exact:true}).click();await library.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>nodes[1].segmentReshoot.subjects[0].ownerType),'TEAM');
    await page.evaluate(()=>{nodes[1].segmentReshoot.subjects[0].memberId='another-team-member';});assert.match(await page.evaluate(()=>PixmaxReshootReferences.validate(nodes[1])),/空间共享人物/);assert.deepEqual(errors,[]);
});

test('subject nested text conflict retains exact whitespace and requires explicit revision review',async t=>{
    const {page,errors}=await setup(t),catalog=await subjectCatalog(page);await open(page);await page.getByRole('button',{name:'添加主体',exact:true}).click();const library=page.getByRole('dialog',{name:'主体库',exact:true});await library.locator('[data-subject-cards] .group').filter({hasText:'摄影师主体'}).hover();await library.getByRole('button',{name:'查看',exact:true}).click();const editor=page.getByRole('dialog',{name:'编辑主体',exact:true});
    await editor.getByRole('button',{name:'编辑文字',exact:true}).click();const text=page.getByRole('dialog',{name:'编辑主体文字',exact:true});await text.getByLabel('文字正文').fill('\n  我的新设定\n');catalog.change(group=>{group.items[0].text='其他窗口的新设定';});
    await text.getByRole('button',{name:'保存文字',exact:true}).click();await text.locator('[role=status]').filter({hasText:'其他窗口'}).waitFor();assert.equal(await text.getByLabel('文字正文').inputValue(),'\n  我的新设定\n');
    await text.getByRole('button',{name:'读取最新版本',exact:true}).click();await text.locator('[role=status]').filter({hasText:'其他窗口的新设定'}).waitFor();await text.getByRole('button',{name:'按当前草稿保存',exact:true}).click();await text.waitFor({state:'detached'});assert.equal(catalog.catalogs.PERSONAL.groups[0].items[0].text,'\n  我的新设定\n');assert.deepEqual(errors,[]);
});

test('subject batch preview refreshes the catalog and rejects changes during the review window',async t=>{
    const {page,errors}=await setup(t),catalog=await subjectCatalog(page),media=await uploads(page),api=await tasks(page);await open(page);await selectSubject(page);
    await page.getByRole('button',{name:'准备片段',exact:true}).click();await prepared(page);await page.getByRole('button',{name:'关闭片段重拍',exact:true}).click();
    await page.route('**/api/canvases/*/batch-preview',route=>route.fulfill({json:{prepared:route.request().postDataJSON().items.map(item=>({nodeId:item.node_id})),skipped:[],costs:{},unknownCount:0}}));
    catalog.change(group=>{group.name='批次使用新名称';});const diagnostic=await page.evaluate(async()=>{nodes[0].pixmaxSourceType='BASE_VIDEO';window.subjectFrame=PixmaxCanvasFrames.create([nodes[0].id,nodes[1].id]);window.subjectBatch=await PixmaxBatchExecution.preview(subjectFrame);return {request:subjectBatch.entries[0]?.request,skipped:subjectBatch.skipped};});assert.ok(diagnostic.request,JSON.stringify(diagnostic));const request=diagnostic.request;assert.match(request.prompt,/批次使用新名称/);assert.equal(request.images.length,1);assert.equal(request.audios.length,1);assert.equal(request.videos.length,2);
    catalog.change(group=>{group.items[0].text='预览之后又修改了';});const failure=await page.evaluate(async()=>{try{await PixmaxBatchExecution.submit(subjectBatch);return 'unexpected';}catch(error){return error.message;}});assert.match(failure,/主体目录已变化/);assert.equal(api.calls.length,0);assert.equal(media.calls.length,3);assert.deepEqual(errors,[]);
});

test('subject expired reference chip is marked invalid after a failed catalog check',async t=>{
    const {page,errors}=await setup(t),catalog=await subjectCatalog(page);await uploads(page);await tasks(page);await open(page);await selectSubject(page);catalog.remove();await page.getByRole('button',{name:'生成重拍视频',exact:true}).click();await page.locator('.pixmax-reshoot-rich-prompt .subject-reference-invalid').waitFor();assert.deepEqual(errors,[]);
});

for(const change of ['blocked','extra-media'])test('subject input integrity rejects '+change+' and explicit reselection repairs it',async t=>{
    const {page,errors}=await setup(t);await subjectCatalog(page);const media=await uploads(page),api=await tasks(page);await open(page);await selectSubject(page);
    await page.evaluate(change=>{const source=nodes.find(node=>node.subjectReference&&node.images?.[0]?.kind==='image');if(change==='blocked')nodes[1].blockedInputRefs=[inputRefKey({...source.images[0],nodeId:source.id,imageIndex:0})];else source.images.push({...source.images[0],url:'/test-image.svg?extra'});},change);
    await page.getByRole('button',{name:'生成重拍视频',exact:true}).click();await page.locator('.pixmax-segment-reshoot-modal [role=status]').filter({hasText:'主体输入连接已变化'}).waitFor();assert.equal(media.calls.length,0);assert.equal(api.calls.length,0);
    await selectSubject(page);assert.equal(await page.evaluate(()=>nodes.filter(node=>node.subjectReference).length),4);assert.match(await page.evaluate(()=>PixmaxReshootReferences.validate(nodes[1])),/摄影师主体/);assert.deepEqual(errors,[]);
});

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
async function chooseModel(page){await chooseReshootModel(page,'火山测试','doubao-seedance-2-5-pro');}

test('raw native reshoot import requires a local model choice then crops its original range and submits once',async t=>{
    const {page,errors,record}=await setup(t),media=await uploads(page),api=await tasks(page),id=await importNative(page,nativeReshoot());
    const state=await page.evaluate(id=>{const node=nodes.find(node=>node.id===id);return {state:node.segmentReshoot,images:node.images,source:nodes.find(item=>item.id===node.segmentReshoot.source.nodeId)?.id};},id);
    assert.equal(state.state.source.nodeId,state.source);assert.notEqual(state.source,'native-video');assert.deepEqual(state.images,[]);assert.equal(state.state.startSec,1);assert.equal(state.state.endSec,6);
    await page.evaluate(id=>PixmaxSegmentReshoot.open(nodes.find(node=>node.id===id)),id);assert.match(await page.getByRole('button',{name:'重拍模型',exact:true}).textContent(),/请选择已配置/);
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
    const bounds=await page.getByRole('dialog',{name:'片段重拍',exact:true}).locator(':scope > section').boundingBox();assert.ok(bounds.width<=358&&bounds.x>=0&&bounds.x+bounds.width<=390);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=390),true);await page.screenshot({path:'.local/pixmax-reshoot-timeline-mobile.png'});assert.deepEqual(errors,[]);
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

async function connectedReferences(page,{group=false}={}){
    await page.evaluate(group=>{
        const image=createNode(0,0,[{url:'/test-image.svg',kind:'image',name:'人物.png'},...(group?[{url:'/test-image.svg?second',kind:'image',name:'服装.png'}]:[])],{select:false});image.label='人物参考';
        const audio=createNode(0,200,[{url:'/assets/reference.wav',kind:'audio',name:'参考声音.wav'}],{select:false});audio.label='声音参考';
        const text={id:uid('text_ref'),type:'smart-prompt',label:'剧情参考',text:'黄昏的街头，人物缓慢回头',x:0,y:400,images:[]};nodes.push(text);
        const target=nodes.findLast(node=>node.segmentReshoot);for(const source of [image,audio,text])canvas.connections.push({from:source.id,to:target.id,kind:'input'});render();scheduleSave();
    },group);
}
test('connected image audio and text references reach direct and batch payloads with the crop as video one',async t=>{
    const {page,errors,record}=await setup(t),media=await uploads(page),api=await tasks(page);await open(page);await connectedReferences(page);
    await page.getByRole('textbox',{name:'重拍要求'}).fill('参考素材改成电影画面');await page.locator('[data-reshoot-mention]').filter({hasText:'图片1'}).click();await page.locator('[data-reshoot-mention]').filter({hasText:'音频1'}).click();await page.locator('[data-reshoot-mention]').filter({hasText:'文本1'}).click();
    await page.evaluate(()=>saveCanvas({force:true}));assert.match(record.nodes[1].segmentReshoot.prompt,/%%@\[/);assert.equal(await page.locator('.pixmax-reshoot-rich-prompt [data-editor-node-type="at-mention"]').count(),3);assert.ok((await page.locator('.pixmax-reshoot-rich-prompt [data-editor-node-type="at-mention"]').first().boundingBox()).height<35);
    await page.route('**/api/canvases/*/batch-preview',route=>route.fulfill({json:{prepared:route.request().postDataJSON().items.map(item=>({nodeId:item.node_id})),skipped:[],costs:{},unknownCount:0}}));
    await page.getByRole('button',{name:'准备片段',exact:true}).click();await prepared(page);const preview=await page.evaluate(async()=>{const target=nodes[1],text=nodes.find(node=>node.label==='剧情参考');text.pixmaxSourceType='BASE_TEXT';const frame=PixmaxCanvasFrames.create([target.id,text.id]);return (await PixmaxBatchExecution.preview(frame)).entries.find(entry=>entry.nodeId===target.id).request;});assert.equal(preview.images.length,1);assert.deepEqual(preview.audios,['/assets/reference.wav']);assert.equal(preview.videos.length,1);assert.match(preview.prompt,/黄昏的街头/);assert.match(preview.prompt,/图片1/);assert.equal(preview.prompt.includes('%%@['),false);
    await page.getByRole('button',{name:'生成重拍视频',exact:true}).click();await page.waitForFunction(()=>nodes[1].images.length===1);assert.equal(api.calls.length,1);assert.deepEqual(api.calls[0].images,preview.images);assert.deepEqual(api.calls[0].audios,preview.audios);assert.deepEqual(api.calls[0].videos,preview.videos);assert.equal(api.calls[0].prompt,preview.prompt);assert.equal(media.calls.length,3);await page.screenshot({path:'.local/pixmax-reshoot-references.png'});assert.deepEqual(errors,[]);
});

test('canvas picker connects a reference and native rich mentions remain invalid after removal',async t=>{
    const {page,errors}=await setup(t),media=await uploads(page),api=await tasks(page);await open(page);await page.evaluate(()=>{const ref=createNode(0,0,[{url:'/test-image.svg',kind:'image'}],{select:false});ref.label='候选人物';});
    await page.getByRole('button',{name:'添加画布参考',exact:true}).click();await page.getByRole('dialog',{name:'添加画布参考',exact:true}).getByRole('button',{name:'候选人物',exact:true}).click();await page.locator('[data-reshoot-mention]').filter({hasText:'候选人物'}).click();await page.getByRole('button',{name:'移除参考 候选人物',exact:true}).click();await page.getByRole('button',{name:'生成重拍视频',exact:true}).click();await page.locator('.pixmax-segment-reshoot-modal [role=status]').filter({hasText:'失效参考'}).waitFor();assert.equal(api.calls.length,0);assert.equal(media.calls.length,0);assert.equal(await page.evaluate(()=>nodes[1].segmentReshoot.taskId),undefined);assert.deepEqual(errors,[]);
});

test('asset picker creates a hidden input that is saved, referenced and carried through standalone copies',async t=>{
    const {page,errors,record}=await setup(t);await uploads(page);await page.route('**/api/asset-library',route=>route.fulfill({json:{library:{libraries:[{id:'lib',categories:[{id:'photos',type:'image',items:[{id:'person-asset',name:'库中人物',kind:'image',url:'/test-image.svg'}]}]}]}}}));await open(page);
    await page.getByRole('button',{name:'添加资产参考',exact:true}).click();await page.getByRole('dialog',{name:'添加资产参考',exact:true}).getByRole('button',{name:'库中人物',exact:true}).click();await page.locator('[data-reshoot-mention]').filter({hasText:'库中人物'}).click();
    const source=await page.evaluate(()=>nodes.find(node=>node.hidden).id);assert.equal(await page.locator('.image-node[data-id="'+source+'"]').count(),0);assert.equal(await page.locator('.smart-connection').count(),1);await page.evaluate(()=>saveCanvas({force:true}));assert.equal(record.nodes.find(node=>node.id===source).hidden,true);
    await page.getByRole('button',{name:'关闭片段重拍',exact:true}).click();await page.evaluate(()=>{document.activeElement?.blur();smartSelection.insertedNodes([nodes[1].id]);copySelectedNodes();pasteNodes();});const copy=await page.evaluate(()=>{const copy=nodes.filter(node=>node.segmentReshoot).at(-1),ref=nodes.find(node=>node.hidden&&canvas.connections.some(edge=>edge.from===node.id&&edge.to===copy.id));return {id:copy.id,source:ref?.id,prompt:copy.segmentReshoot.prompt,primary:copy.segmentReshoot.source.nodeId};});assert.notEqual(copy.source,source);assert.equal(copy.primary,'');assert.ok(copy.prompt.includes('('+copy.source+')'));assert.equal(copy.prompt.includes('('+source+')'),false);assert.deepEqual(errors,[]);
});

test('group references serialize individual native mention resources without leaking resource IDs into the request',async t=>{
    const {page,errors}=await setup(t);await uploads(page);await open(page);await connectedReferences(page,{group:true});await page.locator('[data-reshoot-mention]').filter({hasText:'图片2'}).click();await page.getByRole('button',{name:'准备片段',exact:true}).click();await prepared(page);const result=await page.evaluate(()=>{const node=nodes[1],config=PixmaxSegmentReshoot.executionSettings(node,node.runSettings),request=PixmaxReshootReferences.request(node,config);return {stored:node.segmentReshoot.prompt,prompt:request.prompt,images:request.refs.filter(ref=>ref.kind==='image').length};});assert.match(result.stored,/::1\)%%/);assert.match(result.prompt,/图片2/);assert.equal(result.prompt.includes('::1'),false);assert.equal(result.images,2);assert.deepEqual(errors,[]);
});

test('reference changes during crop preparation refuse task admission and keep the reusable prepared clip',async t=>{
    const {page,errors}=await setup(t),media=await uploads(page,{hold:true}),api=await tasks(page);await open(page);await connectedReferences(page);await page.getByRole('button',{name:'生成重拍视频',exact:true}).click();await media.requested;await page.evaluate(()=>nodes.find(node=>node.label==='剧情参考').text='引用内容已经改变');media.release();await page.locator('.pixmax-segment-reshoot-modal [role=status]').filter({hasText:'参考素材已变化'}).waitFor();assert.equal(api.calls.length,0);assert.ok(await page.evaluate(()=>nodes[1].segmentReshoot.cache));assert.equal(await page.evaluate(()=>nodes[1].segmentReshoot.taskId),undefined);assert.deepEqual(errors,[]);
});

test('a late asset catalog cannot create hidden nodes or a picker after changing workspace',async t=>{
    const {page,errors}=await setup(t);await open(page);let release,seen;const gate=new Promise(resolve=>release=resolve),requested=new Promise(resolve=>seen=resolve);await page.route('**/api/asset-library',async route=>{seen();await gate;return route.fulfill({json:{library:{categories:[{items:[{id:'late',name:'迟到素材',url:'/test-image.svg',kind:'image'}]}]}}});});await page.getByRole('button',{name:'添加资产参考',exact:true}).click();await requested;await page.evaluate(()=>{CanvasSession.context.workspace.id='elsewhere';PixmaxSegmentReshoot.documentChanged();});release();await page.waitForTimeout(100);assert.equal(await page.getByRole('dialog',{name:'添加资产参考',exact:true}).count(),0);assert.equal(await page.evaluate(()=>nodes.length),2);assert.deepEqual(errors,[]);
});

test('reference ordering follows the composer order while the primary crop remains video one',async t=>{
    const {page,errors}=await setup(t);await open(page);await connectedReferences(page,{group:true});
    const result=await page.evaluate(()=>{const target=nodes[1],source=nodes.find(node=>node.label==='人物参考');target.mediaReferenceOrder=[smartMediaRefKey(source.images[1]),smartMediaRefKey(source.images[0])];render();const current=PixmaxReshootReferences.plan(target);return current.resources.map(entry=>({id:entry.id,alias:entry.alias,url:entry.media?.url}));});
    assert.equal(result[0].alias,'视频1');const images=result.filter(entry=>entry.alias.startsWith('图片'));assert.deepEqual(images.map(entry=>entry.alias),['图片1','图片2']);assert.equal(images[0].url,'/test-image.svg?second');await page.locator('[data-reshoot-mention]').filter({hasText:'图片1'}).click();assert.match(await page.evaluate(()=>nodes[1].segmentReshoot.prompt),/\[image\]\[0\].*::1\)%%/);assert.deepEqual(errors,[]);
});

test('canvas picker restores one removed group reference without adding a duplicate connection',async t=>{
    const {page,errors}=await setup(t);await open(page);await connectedReferences(page,{group:true});await page.getByRole('button',{name:'移除参考 人物参考',exact:true}).nth(1).click();assert.equal(await page.locator('[data-reshoot-mention]').filter({hasText:'图片2'}).count(),0);
    await page.getByRole('button',{name:'添加画布参考',exact:true}).click();await page.getByRole('dialog',{name:'添加画布参考',exact:true}).getByRole('button',{name:'人物参考',exact:true}).click();assert.equal(await page.locator('[data-reshoot-mention]').filter({hasText:'图片2'}).count(),1);assert.equal(await page.evaluate(()=>canvas.connections.filter(edge=>edge.from===nodes.find(node=>node.label==='人物参考').id&&edge.to===nodes[1].id).length),1);assert.deepEqual(errors,[]);
});

test('adding a removed asset reference restores its existing hidden node',async t=>{
    const {page,errors}=await setup(t);await open(page);const result=await page.evaluate(()=>{const target=nodes[1],asset={id:'restore-asset',name:'恢复人物',kind:'image',url:'/test-image.svg'},first=PixmaxReshootReferences.addAsset(target,asset);PixmaxReshootReferences.remove(target,PixmaxReshootReferences.plan(target).byId.get(first));const second=PixmaxReshootReferences.addAsset(target,asset);return {first,second,hidden:nodes.filter(node=>node.hidden).length,blocked:target.blockedInputRefs.length};});assert.equal(result.first,result.second);assert.equal(result.hidden,1);assert.equal(result.blocked,0);assert.deepEqual(errors,[]);
});

test('composer text edits preserve native image and text mentions after reopening the reshoot dialog',async t=>{
    const {page,errors}=await setup(t);await open(page);await connectedReferences(page);for(const alias of ['图片1','文本1'])await page.locator('[data-reshoot-mention]').filter({hasText:alias}).click();await page.getByRole('button',{name:'关闭片段重拍',exact:true}).click();
    await page.evaluate(()=>{smartSelection.insertedNodes([nodes[1].id]);updateComposer();promptInput.appendChild(document.createTextNode(' 补充逆光'));savePromptDraftForCurrent();});await page.evaluate(()=>PixmaxSegmentReshoot.open(nodes[1]));await page.getByRole('textbox',{name:'重拍要求'}).waitFor();assert.equal(await page.locator('.pixmax-reshoot-rich-prompt [data-editor-node-type="at-mention"]').count(),2);const prompt=await page.evaluate(()=>nodes[1].segmentReshoot.prompt);assert.match(prompt,/补充逆光/);assert.match(prompt,/\[text\]/);assert.match(prompt,/\[image\]/);assert.deepEqual(errors,[]);
});

test('typing at opens the native picker and connects a searched canvas reference',async t=>{
    const {page,errors}=await setup(t);await open(page);await page.evaluate(()=>{const ref=createNode(0,0,[{url:'/test-image.svg',kind:'image'}],{select:false});ref.label='键盘候选人物';});
    const editor=page.getByRole('textbox',{name:'重拍要求'});await editor.click();await editor.pressSequentially('@');const picker=page.locator('[data-rich-editor-insertion-panel]');try{await picker.waitFor({timeout:2000});}catch(error){throw new Error(error.message+'; '+JSON.stringify(await page.evaluate(()=>({focus:document.activeElement?.outerHTML?.slice(0,500),editor:document.querySelector('.pixmax-reshoot-rich-prompt')?.innerHTML?.slice(0,1800),panels:document.querySelectorAll('[data-rich-editor-insertion-panel]').length,selection:window.getSelection()?.anchorNode?.textContent,prompt:nodes[1].segmentReshoot.prompt})))+'; errors '+JSON.stringify(errors));}await picker.locator('input').fill('键盘候选人物');await picker.getByRole('button',{name:/键盘候选人物/}).click();await page.waitForFunction(()=>nodes[1].segmentReshoot.prompt.includes('[image]'));assert.equal(await page.locator('.pixmax-reshoot-rich-prompt [data-editor-node-type="at-mention"]').count(),1);assert.equal(await page.evaluate(()=>canvas.connections.some(edge=>edge.from===nodes.find(node=>node.label==='键盘候选人物').id&&edge.to===nodes[1].id)),true);assert.deepEqual(errors,[]);
});

test('native reshoot parameter panel submits resolution sound and MOV with range-owned duration and ratio',async t=>{
    const {page,errors,record}=await setup(t),media=await uploads(page),api=await tasks(page);await open(page);await page.getByRole('button',{name:'重拍生成参数',exact:true}).click();const panel=page.locator('[data-combo-selector-panel]');await panel.waitFor();
    await panel.getByRole('button',{name:'1080P',exact:true}).click();await panel.getByRole('button',{name:'MOV',exact:true}).click();
    const buttons=await panel.getByRole('button').allTextContents();const off=buttons.find(value=>/Audio Off|关闭声音|关闭|无声/.test(value));assert.ok(off,JSON.stringify(buttons));await panel.getByRole('button',{name:off,exact:true}).click();
    await page.getByRole('spinbutton',{name:'重拍结束时间'}).fill('6.1');await page.getByRole('button',{name:'生成重拍视频',exact:true}).click();await page.waitForFunction(()=>nodes[1].images.length===1);assert.equal(api.calls.length,1);assert.equal(api.calls[0].resolution,'1080p');assert.equal(api.calls[0].generate_audio,false);assert.equal(api.calls[0].output_format,'mov');assert.equal(api.calls[0].duration,6);assert.equal(api.calls[0].aspect_ratio,'adaptive');assert.equal(media.calls.length,3);assert.equal(record.nodes[1].runSettings.videoOutputFormat,'mov');assert.equal(record.nodes[1].runSettings.videoGenerateAudio,false);await page.screenshot({path:'.local/pixmax-reshoot-parameters.png'});assert.deepEqual(errors,[]);
});

test('invalid resolution or output format is rejected before cropping or task admission',async t=>{
    const {page,errors}=await setup(t),media=await uploads(page),api=await tasks(page);await open(page);await page.evaluate(()=>nodes[1].runSettings.videoResolution='4k');await page.getByRole('button',{name:'生成重拍视频',exact:true}).click();await page.locator('.pixmax-segment-reshoot-modal [role=status]').filter({hasText:'分辨率已失效'}).waitFor();
    await page.evaluate(()=>{nodes[1].runSettings.videoResolution='720p';nodes[1].runSettings.videoOutputFormat='avi';});await page.getByRole('button',{name:'生成重拍视频',exact:true}).click();await page.locator('.pixmax-segment-reshoot-modal [role=status]').filter({hasText:'仅支持 MP4 或 MOV'}).waitFor();assert.equal(media.calls.length,0);assert.equal(api.calls.length,0);assert.equal(await page.evaluate(()=>nodes[1].segmentReshoot.taskId),undefined);assert.deepEqual(errors,[]);
});

test('native parameters remain saved across reopen and follow configured model resolution policy',async t=>{
    const {page,errors,record}=await setup(t);await page.evaluate(()=>{apiProviders[0].video_models.push('doubao-seedance-2-5-other');apiProviders[0].model_policies={'video:doubao-seedance-2-5-other':{resolutions:['480p']}};});await open(page);await page.getByRole('button',{name:'重拍生成参数',exact:true}).click();let panel=page.locator('[data-combo-selector-panel]');await panel.getByRole('button',{name:'MOV',exact:true}).click();await panel.getByRole('button',{name:'Audio Off',exact:true}).click();await page.getByRole('button',{name:'关闭片段重拍',exact:true}).click();await page.evaluate(()=>saveCanvas({force:true}));assert.equal(record.nodes[1].runSettings.videoOutputFormat,'mov');
    await page.evaluate(()=>PixmaxSegmentReshoot.open(nodes[1]));await chooseReshootModel(page,'火山测试','doubao-seedance-2-5-other');await page.getByRole('button',{name:'重拍生成参数',exact:true}).click();panel=page.locator('[data-combo-selector-panel]');assert.equal(await panel.getByRole('button',{name:'1080P',exact:true}).count(),0);assert.equal(await panel.getByRole('button',{name:'720P',exact:true}).count(),0);assert.equal(await panel.getByRole('button',{name:'480P',exact:true}).count(),1);assert.equal(await page.evaluate(()=>nodes[1].runSettings.videoResolution),'480p');assert.equal(await page.evaluate(()=>nodes[1].runSettings.videoGenerateAudio),false);assert.equal(await page.evaluate(()=>nodes[1].runSettings.videoOutputFormat),'mov');assert.ok(await panel.locator('input:disabled').count());assert.deepEqual(errors,[]);
});

test('native parameter popup fits narrow screens and closes when editing becomes readonly',async t=>{
    const {page,errors}=await setup(t);await page.setViewportSize({width:390,height:844});await open(page);await page.getByRole('button',{name:'重拍生成参数',exact:true}).click();const panel=page.locator('[data-combo-selector-panel]');await panel.waitFor();const rect=await panel.boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=390);await page.evaluate(()=>{MemberCanvasEdit.setEditable(false);PixmaxSegmentReshoot.documentChanged();});await panel.waitFor({state:'detached'});assert.equal(await page.getByRole('button',{name:'重拍生成参数',exact:true}).isDisabled(),true);assert.deepEqual(errors,[]);
});

test('native model options distinguish provider identities and keep the crop cache across model changes',async t=>{
    const {page,errors,record}=await setup(t),media=await uploads(page),api=await tasks(page);await page.evaluate(()=>apiProviders.push({id:'studio',name:'制作供应商',enabled:true,has_key:true,protocol:'volcengine',video_models:['doubao-seedance-2-5-pro'],model_policies:{'video:doubao-seedance-2-5-pro':{resolutions:['480p']}}}));await open(page);await page.getByRole('button',{name:'准备片段',exact:true}).click();await prepared(page);
    const before=await page.evaluate(()=>({cache:JSON.stringify(nodes[1].segmentReshoot.cache),undo:undoStack.length}));await chooseReshootModel(page,'制作供应商','doubao-seedance-2-5-pro');assert.equal(await page.evaluate(()=>nodes[1].runSettings.videoProvider),'studio');assert.equal(await page.evaluate(()=>nodes[1].runSettings.videoResolution),'480p');assert.equal(await page.evaluate(()=>JSON.stringify(nodes[1].segmentReshoot.cache)),before.cache);const undo=await page.evaluate(()=>undoStack.length);await chooseReshootModel(page,'制作供应商','doubao-seedance-2-5-pro');assert.equal(await page.evaluate(()=>undoStack.length),undo);await page.getByRole('button',{name:'生成重拍视频',exact:true}).click();await page.waitForFunction(()=>nodes[1].images.length===1);assert.equal(media.calls.length,3);assert.equal(api.calls[0].provider_id,'studio');assert.equal(api.calls[0].resolution,'480p');assert.equal(record.nodes[1].runSettings.videoProvider,'studio');assert.deepEqual(errors,[]);
});

test('native model options hide unrelated and hidden models and disable missing keys or unavailable policies',async t=>{
    const {page,errors}=await setup(t);await page.evaluate(()=>{apiProviders[0].video_models.push('doubao-seedance-2-5-off','doubao-seedance-2-5-hidden','doubao-seedance-2-5-4k','kling');apiProviders[0].model_policies={'video:doubao-seedance-2-5-off':{enabled:false},'video:doubao-seedance-2-5-hidden':{visible:false},'video:doubao-seedance-2-5-4k':{resolutions:['4k']}};apiProviders.push({id:'missing',name:'未配置供应商',protocol:'volcengine',has_key:false,video_models:['doubao-seedance-2-5-missing']},{id:'other',name:'其他协议',protocol:'comfly',has_key:true,video_models:['doubao-seedance-2-5-other']});});await open(page);await page.getByRole('button',{name:'重拍模型',exact:true}).click();const menu=page.locator('.pixmax-reshoot-model-options');await menu.waitFor();for(const name of ['doubao-seedance-2-5-hidden','kling','doubao-seedance-2-5-other'])assert.equal(await menu.getByText(name,{exact:false}).count(),0);for(const name of ['doubao-seedance-2-5-off','doubao-seedance-2-5-4k','doubao-seedance-2-5-missing'])assert.equal(await menu.locator('[data-select-option]').filter({hasText:name}).isDisabled(),true);await page.screenshot({path:'.local/pixmax-reshoot-model-options.png'});assert.deepEqual(errors,[]);
});

test('configuration refresh removes an unavailable selection without silently changing the saved provider',async t=>{
    const {page,errors}=await setup(t),media=await uploads(page),api=await tasks(page);await open(page);await page.getByRole('button',{name:'重拍模型',exact:true}).click();await page.evaluate(()=>applySmartModelConfig({api_providers:[]}));await page.locator('.pixmax-reshoot-model-options').waitFor({state:'detached'});assert.equal(await page.getByRole('button',{name:'重拍模型',exact:true}).isDisabled(),true);assert.match(await page.getByRole('button',{name:'重拍模型',exact:true}).textContent(),/请选择已配置/);assert.equal(await page.evaluate(()=>nodes[1].runSettings.videoProvider),'volcengine');await page.getByRole('button',{name:'生成重拍视频',exact:true}).click();await page.locator('.pixmax-segment-reshoot-modal [role=status]').filter({hasText:'模型配置已变化'}).waitFor();assert.equal(media.calls.length,0);assert.equal(api.calls.length,0);assert.deepEqual(errors,[]);
});

test('model selection becomes readonly during preparation and lease loss closes the native popup',async t=>{
    const {page,errors}=await setup(t),media=await uploads(page,{hold:true});await open(page);await page.getByRole('button',{name:'准备片段',exact:true}).click();await media.requested;assert.equal(await page.getByRole('button',{name:'重拍模型',exact:true}).isDisabled(),true);media.release();await prepared(page);await page.getByRole('button',{name:'重拍模型',exact:true}).click();await page.evaluate(()=>{MemberCanvasEdit.setEditable(false);PixmaxSegmentReshoot.documentChanged();});await page.locator('.pixmax-reshoot-model-options').waitFor({state:'detached'});assert.equal(await page.getByRole('button',{name:'重拍模型',exact:true}).isDisabled(),true);assert.deepEqual(errors,[]);
});

test('native model selector supports keyboard activation and fits a narrow viewport',async t=>{
    const {page,errors}=await setup(t);await page.setViewportSize({width:390,height:844});await open(page);const button=page.getByRole('button',{name:'重拍模型',exact:true});await button.focus();await button.press('Enter');const menu=page.locator('.pixmax-reshoot-model-options');await menu.waitFor();const rect=await menu.boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=390);await menu.locator('[data-select-option]').first().focus();await menu.locator('[data-select-option]').first().press('Enter');await menu.waitFor({state:'detached'});assert.equal(await button.getAttribute('aria-expanded'),'false');assert.deepEqual(errors,[]);
});

test('closing or replacing a model selector disposes the portal and cannot change another document',async t=>{
    const {page,errors}=await setup(t);await open(page);await page.getByRole('button',{name:'重拍模型',exact:true}).click();await page.locator('.pixmax-reshoot-model-options').waitFor();await page.getByRole('button',{name:'关闭片段重拍',exact:true}).click();await page.locator('.pixmax-reshoot-model-options').waitFor({state:'detached'});await page.evaluate(()=>PixmaxSegmentReshoot.open(nodes[1]));await page.getByRole('button',{name:'重拍模型',exact:true}).click();await page.evaluate(()=>{CanvasSession.context.workspace.id='elsewhere';PixmaxSegmentReshoot.documentChanged();});assert.equal(await page.locator('.pixmax-segment-reshoot-modal,.pixmax-reshoot-model-options').count(),0);assert.deepEqual(errors,[]);
});

test('model popup keyboard navigation skips unavailable options and Escape preserves canvas selection',async t=>{
    const {page,errors}=await setup(t);await page.evaluate(()=>{apiProviders[0].video_models.push('doubao-seedance-2-5-off','doubao-seedance-2-5-second');apiProviders[0].model_policies={'video:doubao-seedance-2-5-off':{enabled:false}};});await open(page);const before=await page.evaluate(()=>({viewport:{...viewport},selected:selectedNodeIds(),settings:JSON.stringify(nodes[1].runSettings)}));await page.getByRole('button',{name:'重拍模型',exact:true}).click();const menu=page.locator('.pixmax-reshoot-model-options');await menu.waitFor();await menu.locator('[data-select-option]').first().focus();await page.keyboard.press('ArrowDown');assert.match(await page.evaluate(()=>document.activeElement.textContent),/doubao-seedance-2-5-second/);await page.keyboard.press('Escape');await menu.waitFor({state:'detached'});assert.equal(await page.getByRole('dialog',{name:'片段重拍',exact:true}).count(),1);assert.deepEqual(await page.evaluate(()=>({viewport:{...viewport},selected:selectedNodeIds(),settings:JSON.stringify(nodes[1].runSettings)})),before);assert.deepEqual(errors,[]);
});

async function insertCamera(page,{advance=0}={}){
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.getByRole('button',{name:'添加镜头参数',exact:true}).click();const panel=page.locator('[data-reshoot-camera] [role=dialog]');await panel.waitFor();
    for(let i=0;i<advance;i++)await panel.locator('[role=group]').first().getByRole('button').last().click();
    await panel.locator('header button').click();await panel.waitFor({state:'detached'});
}
test('native camera selectors load local artwork and expand saved hash chips into the actual request',async t=>{
    const {page,errors,record}=await setup(t),media=await uploads(page),api=await tasks(page);await open(page);await page.getByRole('button',{name:'添加镜头参数',exact:true}).click();const panel=page.locator('[data-reshoot-camera] [role=dialog]');await panel.waitFor();assert.equal(await panel.getByRole('spinbutton').count(),4);await page.waitForFunction(()=>[...document.querySelectorAll('[data-reshoot-camera] img')].every(image=>image.complete&&image.naturalWidth>0));await page.screenshot({path:'.local/pixmax-reshoot-camera-panel.png'});await panel.locator('[role=group]').first().getByRole('button').last().click();await panel.locator('header button').click();await insertCamera(page);
    assert.equal(await page.locator('.pixmax-reshoot-rich-prompt [data-hash-type="camera"]').count(),2);await page.evaluate(()=>saveCanvas({force:true}));const value=record.nodes[1].segmentReshoot.prompt;assert.equal((value.match(/%%#\[camera\]/g)||[]).length,2);assert.equal((record.nodes[1].promptDraftHtml.match(/data-pixmax-prompt-token/g)||[]).length,2);const tokens=await page.evaluate(()=>[...nodes[1].segmentReshoot.prompt.matchAll(/%%#\[([^\]]+)\]\[([^\]]*)\]\(([^)]*)\)%%/g)].map(match=>JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0))))));assert.deepEqual(tokens.map(token=>token.chipIndex),[1,2]);assert.deepEqual(tokens.map(token=>token.indices.c),[1,1]);await page.getByRole('button',{name:'生成重拍视频',exact:true}).click();await page.waitForFunction(()=>nodes[1].images.length===1);assert.match(api.calls[0].prompt,/Fujifilm GFX100 II/);assert.match(api.calls[0].prompt,/ARRI Signature/);assert.equal(api.calls[0].prompt.includes('%%#['),false);assert.equal(media.calls.length,3);assert.deepEqual(errors,[]);
});

test('camera chips survive composer edits standalone copies and reopening the native editor',async t=>{
    const {page,errors}=await setup(t);await open(page);await insertCamera(page,{advance:2});await page.getByRole('button',{name:'关闭片段重拍',exact:true}).click();await page.evaluate(()=>{smartSelection.insertedNodes([nodes[1].id]);updateComposer();promptInput.appendChild(document.createTextNode(' 黄昏逆光'));savePromptDraftForCurrent();document.activeElement?.blur();copySelectedNodes();pasteNodes();});const copy=await page.evaluate(()=>nodes.filter(node=>node.segmentReshoot).at(-1).id);await page.evaluate(id=>PixmaxSegmentReshoot.open(nodes.find(node=>node.id===id)),copy);assert.equal(await page.locator('.pixmax-reshoot-rich-prompt [data-hash-type="camera"]').count(),1);const prompt=await page.evaluate(id=>PixmaxReshootReferences.validate(nodes.find(node=>node.id===id)),copy);assert.match(prompt,/Hasselblad H6D-400c MS/);assert.match(prompt,/黄昏逆光/);assert.equal(prompt.includes('%%#['),false);assert.deepEqual(errors,[]);
});

test('invalid camera payloads and unresolved subject markers cannot upload or submit',async t=>{
    const {page,errors}=await setup(t),media=await uploads(page),api=await tasks(page);await open(page);for(const prompt of ['%%#[camera][@@](broken)%%','%%#[camera][e30=](aGVsbG8=)%%','%%subject-ref(missing|PERSONAL|人物|)%%']){await page.getByRole('textbox',{name:'重拍要求'}).fill(prompt);await page.getByRole('button',{name:'生成重拍视频',exact:true}).click();await page.locator('.pixmax-segment-reshoot-modal [role=status]').filter({hasText:/镜头标记|主体引用/}).waitFor();}assert.equal(api.calls.length,0);assert.equal(media.calls.length,0);assert.equal(await page.evaluate(()=>nodes[1].segmentReshoot.taskId),undefined);assert.deepEqual(errors,[]);
});

test('camera preferences belong to the member and workspace while corrupt preferences reset safely',async t=>{
    const {page,errors}=await setup(t);const storageMethod=fs.readFileSync(path.join(__dirname,'../static/js/member-session.js'),'utf8').match(/storageKey\(key\) \{[^\n]+\}/)[0];await page.evaluate(source=>{CanvasSession.storageKey=new Function('context','return ({'+source+'}).storageKey;')(CanvasSession.context);},storageMethod);await open(page);await insertCamera(page,{advance:3});const first=await page.evaluate(()=>JSON.parse(localStorage.getItem(CanvasSession.storageKey('pixmax-camera-preferences-v1'))));assert.equal(first.indices.camera,3);await page.getByRole('button',{name:'关闭片段重拍',exact:true}).click();const keys=await page.evaluate(()=>{const current=CanvasSession.storageKey('pixmax-camera-preferences-v1'),member=CanvasSession.context.member.id,workspace=CanvasSession.context.workspace.id;CanvasSession.context.member.id='another-member';CanvasSession.context.workspace.id='another-workspace';const other=CanvasSession.storageKey('pixmax-camera-preferences-v1');CanvasSession.context.member.id=member;CanvasSession.context.workspace.id=workspace;localStorage.setItem(other,JSON.stringify({indices:{camera:9,lens:0,focalLength:0,aperture:0}}));localStorage.setItem(current,'{}');return {current,other};});assert.notEqual(keys.current,keys.other);await page.evaluate(()=>PixmaxSegmentReshoot.open(nodes[1]));await insertCamera(page);const second=await page.evaluate(keys=>({current:JSON.parse(localStorage.getItem(keys.current)),other:JSON.parse(localStorage.getItem(keys.other))}),keys);assert.equal(second.current.indices.camera,0);assert.equal(second.other.indices.camera,9);assert.deepEqual(errors,[]);
});

test('camera panel fits narrow screens Escape keeps the modal and editing loss blocks insertion',async t=>{
    const {page,errors}=await setup(t);await page.setViewportSize({width:390,height:844});await open(page);await page.getByRole('button',{name:'添加镜头参数',exact:true}).click();const panel=page.locator('[data-reshoot-camera] [role=dialog]');await panel.waitFor();const box=await panel.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);await panel.getByRole('spinbutton').first().press('Escape');await panel.waitFor({state:'detached'});assert.equal(await page.getByRole('dialog',{name:'片段重拍',exact:true}).count(),1);await page.getByRole('button',{name:'添加镜头参数',exact:true}).click();await page.evaluate(()=>{MemberCanvasEdit.setEditable(false);PixmaxSegmentReshoot.documentChanged();});await panel.waitFor({state:'detached'});assert.equal(await page.locator('.pixmax-reshoot-rich-prompt [data-hash-type="camera"]').count(),0);assert.deepEqual(errors,[]);
});
