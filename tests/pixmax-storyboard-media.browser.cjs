const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs'),nativeStoryboard=require('./helpers/pixmax-storyboard-native.cjs');
async function setup(t){
    const result=await fixture(t,'smart',true,{secureOrigin:true});for(const file of ['canvas-task-bindings.js','canvas-llm-tasks.js'])await result.page.addScriptTag({url:'/static/js/'+file});
    await result.page.route('**/assets/voice.mp3',route=>route.fulfill({path:path.resolve('tests/fixtures/pixmax-generated-audio.mp3'),contentType:'audio/mpeg'}));
    await result.page.evaluate(source=>{
        apiProviders=[{id:'image',name:'图像服务',has_key:true,image_models:['test-image'],model_policies:{'image:test-image':{resolutions:['2k']}}},{id:'video',name:'视频服务',has_key:true,video_models:['test-video'],model_policies:{'video:test-video':{resolutions:['720p'],duration_min:2,duration_max:10}}},{id:'writer',name:'文本服务',has_key:true,chat_models:['writer']}];
        Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});
        insertSmartWorkflowIntoCanvas(source);window.board=nodes.find(node=>node.type==='smart-storyboard');
        window.previewNodeRequest=node=>{const previous=settings;settings=smartSettingsForNode(node);try{return buildPromptRequestForNode(node);}finally{settings=previous;}};
    },nativeStoryboard());return result;
}
async function open(page,kind){await page.evaluate(kind=>PixmaxStoryboardMedia.open(board,kind),kind);await page.getByRole('dialog',{name:kind==='image'?'批量生成镜头图像':'批量生成镜头视频',exact:true}).waitFor();}
test('native image bulk entry creates a usable generation node with both asset references, preserves policies and supports undo/reload',async t=>{
    const {page,errors,record,writes}=await setup(t);await page.evaluate(()=>openSmartStoryboard(board));await page.locator('[data-story-step="2"]').click();await page.getByRole('button',{name:'生成镜头图像',exact:true}).click();
    assert.equal(await page.getByRole('checkbox',{name:'选择镜头 2'}).isDisabled(),true);assert.deepEqual(await page.getByRole('combobox',{name:'镜头生成分辨率'}).locator('option').allTextContents(),['2k']);
    await page.screenshot({path:'.local/pixmax-storyboard-media.png'});await page.getByRole('button',{name:'创建生成节点',exact:true}).click();await page.waitForFunction(()=>nodes.length===5&&!document.querySelector('.pixmax-story-media-modal'));
    const result=await page.evaluate(()=>{const node=nodes[4],request=previewNodeRequest(node);return {settings:node.runSettings,inputs:node.inputNodeIds,refs:request.refs.map(ref=>ref.nodeId),prompt:request.prompt,binding:node.storyboardShotBinding};});
    assert.equal(result.settings.resolution,'2k');assert.equal(result.settings.apiKind,'image');assert.equal(result.inputs.length,2);assert.deepEqual(new Set(result.inputs),new Set(result.refs));assert.match(result.prompt,/旅人/);assert.equal(result.binding.shotNo,'1');assert.equal(writes.some(write=>write.path==='/api/canvas-image-tasks'),false);
    assert.equal(record.nodes[4].storyboardShotBinding.ownerId,record.nodes[3].id);await page.evaluate(()=>performUndo());assert.equal(await page.evaluate(()=>nodes.length),4);await page.evaluate(()=>redoSmartCanvas());assert.equal(await page.evaluate(()=>nodes.length),5);
    await page.evaluate(()=>saveCanvas({force:true}));await page.reload();await page.waitForFunction(()=>nodes.length===5);assert.equal(await page.evaluate(()=>buildPromptRequestForNode(nodes[4]).refs.length),2);assert.deepEqual(errors,[]);
});
test('video bulk entry maps duration/audio settings and native voice mentions, and connects a video editor',async t=>{
    const {page,errors,writes}=await setup(t);await open(page,'video');await page.getByRole('checkbox',{name:'生成声音'}).check();await page.getByRole('spinbutton',{name:'镜头 1 视频时长'}).fill('7');await page.getByRole('button',{name:'创建生成节点'}).click();await page.waitForFunction(()=>nodes.length===6&&!document.querySelector('.pixmax-story-media-modal'));
    const result=await page.evaluate(()=>{const node=nodes[4],request=previewNodeRequest(node);return {kind:node.generationKind,config:node.runSettings,media:request.refs.map(ref=>mediaKindForItem(ref)),binding:node.storyboardShotBinding,editor:nodes[5].type,connected:canvas.connections.some(edge=>edge.from===node.id&&edge.to===nodes[5].id)};});
    assert.equal(result.kind,'video');assert.equal(result.config.videoDuration,7);assert.equal(result.config.videoResolution,'720p');assert.equal(result.config.videoGenerateAudio,true);assert.deepEqual(result.media.sort(),['audio','image']);assert.equal(result.binding.audioNodeIds.length,1);assert.equal(result.editor,'smart-editor');assert.equal(result.connected,true);assert.equal(writes.some(write=>write.path==='/api/canvas-video-tasks'),false);assert.deepEqual(errors,[]);
});
test('unsupported duration is rejected before any nodes are inserted',async t=>{
    const {page,errors}=await setup(t);await open(page,'video');await page.getByRole('spinbutton',{name:'镜头 1 视频时长'}).fill('11');await page.getByRole('button',{name:'创建生成节点'}).click();
    assert.equal(await page.evaluate(()=>nodes.length),4);assert.match(await page.locator('.pixmax-creation-status').textContent(),/2 到 10/);assert.deepEqual(errors,[]);
});
test('multi-shot selection creates one undoable batch and clearing selection submits nothing',async t=>{
    const {page,errors}=await setup(t);await page.evaluate(()=>board.shots[1].prompt='旅人回头');await open(page,'image');await page.getByRole('button',{name:'清空选择'}).click();await page.getByRole('button',{name:'创建生成节点'}).click();
    assert.equal(await page.evaluate(()=>nodes.length),4);assert.match(await page.locator('.pixmax-creation-status').textContent(),/请选择/);await page.getByRole('button',{name:'选择全部'}).click();await page.getByRole('button',{name:'创建生成节点'}).click();await page.waitForFunction(()=>nodes.length===6);
    assert.deepEqual(await page.evaluate(()=>nodes.slice(4).map(node=>node.storyboardShotBinding.shotNo)),['1','2']);await page.evaluate(()=>performUndo());assert.equal(await page.evaluate(()=>nodes.length),4);assert.deepEqual(errors,[]);
});
test('imported canvas image remains available and regeneration creates a separate asset node',async t=>{
    const {page,errors}=await setup(t);await page.evaluate(()=>PixmaxStoryboardAssets.open(board,'person'));await page.getByRole('textbox',{name:'旅人 图像提示词'}).fill('灰衣旅人');
    await page.route('**/api/canvas-image-tasks',route=>route.fulfill({status:422,json:{detail:'隔离测试拒绝付费提交'}}));await page.getByRole('button',{name:'生成图像',exact:true}).click();await page.waitForFunction(()=>!PixmaxStoryboardAssets.busy());
    assert.equal(await page.evaluate(()=>nodes.length),5);assert.equal(await page.evaluate(()=>nodes[0].images[0].url),'/test-image.svg');assert.equal(await page.evaluate(()=>board.storyboardAssets[0].imageNodeId===nodes[4].id&&nodes[4].storyboardAssetBinding.ownerId===board.id),true);assert.deepEqual(errors,[]);
});
for(const change of ['source','policy','lease','workspace'])test('bulk admission refuses changed '+change,async t=>{
    const {page,errors}=await setup(t);await open(page,'image');await page.evaluate(change=>{
        if(change==='source')board.shots[0].prompt='新的画面';if(change==='policy')apiProviders[0].model_policies['image:test-image'].enabled=false;
        if(change==='lease')MemberCanvasEdit.setEditable(false);if(change==='workspace')CanvasSession.context.workspace.id='other';
    },change);await page.getByRole('button',{name:'创建生成节点'}).click();assert.equal(await page.evaluate(()=>nodes.length),4);assert.deepEqual(errors,[]);
});
test('save retry retains one batch and readonly users cannot create a batch',async t=>{
    const {page,errors}=await setup(t);await open(page,'image');let reject=true;await page.route('**/api/canvases/canvas-test*',route=>route.request().method()==='PUT'&&reject?route.fulfill({status:503,json:{detail:'保存失败'}}):route.fallback());
    await page.getByRole('button',{name:'创建生成节点'}).click();await page.getByRole('button',{name:'重试保存'}).waitFor();assert.equal(await page.evaluate(()=>nodes.length),5);reject=false;
    await page.getByRole('button',{name:'重试保存'}).click();await page.waitForFunction(()=>!document.querySelector('.pixmax-story-media-modal'));assert.equal(await page.evaluate(()=>nodes.length),5);
    await page.evaluate(()=>{MemberCanvasEdit.setEditable(false);PixmaxStoryboardMedia.open(board,'image');});assert.equal(await page.getByRole('dialog',{name:'批量生成镜头图像'}).count(),0);assert.deepEqual(errors,[]);
});
test('clipboard, Alt duplication and workflow import remap both image/audio chips and source associations',async t=>{
    const {page,errors}=await setup(t);await open(page,'video');await page.getByRole('button',{name:'创建生成节点'}).click();await page.waitForFunction(()=>nodes.length===6);
    const result=await page.evaluate(()=>{
        const original=nodes.slice();smartSelection.insertedNodes(original.map(node=>node.id));const payload=selectedSmartWorkflowPayload();copySelectedNodes();pasteNodes({includeConnections:true});
        function valid(list){const media=list.find(node=>node.storyboardShotBinding),bound=media.storyboardShotBinding;return list.some(node=>node.id===bound.ownerId)&&[...bound.imageNodeIds,...bound.audioNodeIds].every(id=>list.some(node=>node.id===id))&&previewNodeRequest(media).refs.length===2&&!original.some(node=>media.promptDraftHtml.includes('data-node-id="'+node.id+'"'));}
        const copied=valid(nodes.slice(6));insertSmartWorkflowIntoCanvas(payload);const imported=valid(nodes.slice(12));smartSelection.insertedNodes(original.map(node=>node.id));duplicateForAltDrag(original[0]);const alt=valid(nodes.slice(18));
        smartSelection.insertedNodes([original[4].id]);copySelectedNodes();pasteNodes({includeConnections:true});const alone=nodes.at(-1);return {copied,imported,alt,alone:!alone.storyboardShotBinding.ownerId&&previewNodeRequest(alone).refs.length===0&&!alone.promptDraftHtml.includes('mention-image-token')};
    });assert.deepEqual(result,{copied:true,imported:true,alt:true,alone:true});assert.deepEqual(errors,[]);
});
test('generation references choose the latest connected asset and never the shot’s own prior result',async t=>{
    const {page,errors}=await setup(t);await open(page,'image');await page.getByRole('button',{name:'创建生成节点'}).click();await page.waitForFunction(()=>nodes.length===5);
    const refs=await page.evaluate(()=>{nodes[0].images.push({url:'/test-image.svg?latest',kind:'image'});nodes[4].images.push({url:'/test-image.svg?shot',kind:'image'});return previewNodeRequest(nodes[4]).refs.map(ref=>ref.url);});
    assert.deepEqual(refs,['/test-image.svg?latest','/test-image.svg?scene']);assert.deepEqual(errors,[]);
});
async function textService(page,reply,{held=false}={}){
    const calls=[],records=new Map();let release,seen;const gate=new Promise(resolve=>release=resolve),polling=new Promise(resolve=>seen=resolve);
    await page.route('**/api/canvas-llm-tasks**',async route=>{
        if(route.request().method()==='POST'){
            const body=route.request().postDataJSON(),target=body.canvas_target;calls.push(body);
            const record={id:body.client_task_id,status:'succeeded',result:{text:JSON.stringify(reply)},canvas_binding:{version:3,canvas_id:body.canvas_id,canvas_kind:'smart',source_node_id:target.source_node_id,target_node_id:target.target_node_id,submitted_revision:target.base_revision,graph_sha256:target.input_sha256,request_sha256:'a'.repeat(64)}};records.set(record.id,record);return route.fulfill({json:{...record,task_id:record.id}});
        }seen();if(held)await gate;return route.fulfill({json:records.get(new URL(route.request().url()).pathname.split('/').pop())});
    });return {calls,polling,release};
}
for(const kind of ['image','video','both'])test('storyboard '+kind+' prompt generation preserves the other prompt and asset associations',async t=>{
    const {page,errors}=await setup(t),api=await textService(page,{shots:[{duration:3,description:'旅人',prompt:'新图像 <旅人@person>',videoPrompt:'新运动 <旅人@person@voice-person>'}]});
    await page.evaluate(()=>{board.shots=[{...board.shots[0],prompt:'旧图像',videoPrompt:'旧运动'}];openSmartStoryboard(board);});await page.locator('[data-story-step="2"]').click();await page.getByRole('combobox',{name:'镜头提示词类型'}).selectOption(kind);await page.getByRole('button',{name:'生成镜头提示词',exact:true}).click();await page.waitForFunction(()=>board.creationResults?.length===1);
    const shot=await page.evaluate(()=>board.shots[0]);assert.equal(shot.prompt,kind==='video'?'旧图像':'新图像 <旅人@person>');assert.equal(shot.videoPrompt,kind==='image'?'旧运动':'新运动 <旅人@person@voice-person>');assert.deepEqual(shot.assetIds,['person','street']);assert.equal(api.calls.length,1);assert.match(api.calls[0].message,/<资产名称@资产id>/);assert.deepEqual(errors,[]);
});
test('missing motion prompt leaves both manually edited fields intact',async t=>{
    const {page,errors}=await setup(t),api=await textService(page,{shots:[{duration:3,description:'旅人',prompt:'只返回图像'}]});
    await page.evaluate(()=>{board.shots=[{...board.shots[0],prompt:'手工图像',videoPrompt:'手工运动'}];openSmartStoryboard(board);});await page.locator('[data-story-step="2"]').click();await page.getByRole('combobox',{name:'镜头提示词类型'}).selectOption('both');await page.getByRole('button',{name:'生成镜头提示词',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.pixmax-storyboard-modal [role=status]').textContent.includes('缺少'));
    assert.deepEqual(await page.evaluate(()=>[board.shots[0].prompt,board.shots[0].videoPrompt]),['手工图像','手工运动']);assert.equal(api.calls.length,1);assert.deepEqual(errors,[]);
});
test('changing prompt type rejects a delayed response',async t=>{
    const {page,errors}=await setup(t),api=await textService(page,{shots:[{duration:3,description:'旅人',prompt:'新图像',videoPrompt:'新运动'}]},{held:true});
    await page.evaluate(()=>{board.shots=[{...board.shots[0],prompt:'旧图像',videoPrompt:'旧运动'}];openSmartStoryboard(board);});await page.locator('[data-story-step="2"]').click();await page.getByRole('button',{name:'生成镜头提示词',exact:true}).click();await api.polling;
    await page.getByRole('combobox',{name:'镜头提示词类型'}).selectOption('video');api.release();await page.waitForFunction(()=>!document.querySelector('[data-story-generate]').disabled);
    assert.deepEqual(await page.evaluate(()=>[board.shots[0].prompt,board.shots[0].videoPrompt]),['旧图像','旧运动']);assert.equal(api.calls.length,1);assert.deepEqual(errors,[]);
});
