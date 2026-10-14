const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');
const assets=[{id:'person',type:'character',name:'旅人',prompt:'穿灰衣的旅人'},{id:'street',type:'scene',name:'街道',prompt:'雨夜街道'}];
async function setup(t){
    const result=await fixture(t,'smart',true,{secureOrigin:true});await result.page.addScriptTag({url:'/static/js/canvas-task-bindings.js'});
    await result.page.evaluate(assets=>{
        apiProviders=[{id:'image',name:'图像供应商',has_key:true,image_models:['test']}];
        Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});
        Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});
        createNode(120,160,[],{select:false});nodes[0].type='smart-storyboard';nodes[0].storyboardAssets=assets;nodes[0].shots=[{duration:3,description:'旅人走进雨夜街道',prompt:'旅人走入',assetIds:['person','street']},{duration:2,prompt:'旅人回头',assetIds:['person']}];render();
    },assets);return result;
}
async function service(page,{held=false,status=200,queued=false}={}){
    const calls=[],records=new Map();let release,seen;const gate=new Promise(resolve=>release=resolve),polling=new Promise(resolve=>seen=resolve);
    await page.route('**/api/canvas-image-tasks**',async route=>{
        if(route.request().method()==='POST'){
            const body=route.request().postDataJSON(),target=body.canvas_target;calls.push(body);
            const task={id:body.client_task_id,canvas_edit_generation:1,status:queued?'queued':'succeeded',result:{images:['/test-image.svg']},canvas_binding:{version:3,canvas_id:body.canvas_id,canvas_kind:'smart',source_node_id:target.source_node_id,target_node_id:target.target_node_id,submitted_revision:target.base_revision,graph_sha256:target.input_sha256,request_sha256:'a'.repeat(64)}};records.set(task.id,task);
            return route.fulfill({status,json:status===200?{task_id:task.id,status:'queued',canvas_binding:task.canvas_binding}:{detail:'任务未确认'}});
        }
        seen();if(held)await gate;return route.fulfill({json:records.get(new URL(route.request().url()).pathname.split('/').pop())});
    });return {calls,records,polling,release};
}
async function open(page,id){await page.evaluate(id=>PixmaxStoryboardAssets.open(nodes[0],id),id);await page.getByRole('dialog',{name:'分镜资产图像',exact:true}).waitFor();}
async function idle(page){await page.waitForFunction(()=>!PixmaxStoryboardAssets.busy());}
test('batch image tasks preserve sibling bindings, save asset associations and link only each shot’s assets',async t=>{
    const {page,errors,record}=await setup(t),api=await service(page,{held:true});
    await page.evaluate(()=>openSmartStoryboard(nodes[0]));await page.locator('[data-story-step="1"]').click();await page.locator('[data-story-asset-images=""]').click();
    await page.getByRole('combobox',{name:'资产图像画幅'}).selectOption('portrait');await page.locator('[data-story-image-all]').click();await api.polling;
    assert.equal(await page.evaluate(()=>{const frame=nodes.find(PixmaxCanvasFrames.isFrame);return !!frame&&nodeRect(frame).x+nodeRect(frame).width<nodes[0].x;}),true);api.release();await idle(page);
    assert.equal(api.calls.length,2,await page.locator('[role=status]').last().textContent()+'; '+JSON.stringify(await page.evaluate(()=>({assets:nodes[0].storyboardAssets,nodes:nodes.map(node=>({id:node.id,type:node.type,images:node.images,pending:node.pendingTasks})),config:nodes[0].storyboardImageConfig,fields:[...document.querySelectorAll('[data-story-image-provider],[data-story-image-model],[data-story-image-resolution],[data-story-image-ratio]')].map(el=>el.value)}))));assert.match(api.calls[0].client_task_id,/^canvas_img_/);
    assert.equal(await page.evaluate(()=>nodes.filter(node=>node.storyboardAssetBinding).length===2&&nodes.filter(node=>node.storyboardAssetBinding).every(node=>node.images.length===1&&!smartPendingTasks(node).length)),true);
    assert.equal(await page.evaluate(()=>{const frame=nodes.find(PixmaxCanvasFrames.isFrame);return !!frame&&nodes.filter(node=>node.storyboardAssetBinding).every(node=>node.frameId===frame.id);}),true);
    assert.equal(await page.evaluate(()=>nodes[0].images.length),0);assert.equal(api.calls[0].reference_images.length,0);assert.notEqual(api.calls[0].size,'1024x1024');
    await page.evaluate(()=>saveCanvas({force:true}));assert.equal(record.nodes[0].storyboardAssets[0].imageNodeId,record.nodes[1].id);
    await page.screenshot({path:'.local/pixmax-storyboard-assets.png'});
    await page.evaluate(()=>{document.querySelector('.pixmax-creation-modal').remove();openSmartStoryboard(nodes[0]);});await page.locator('[data-story-export]').click();
    const contexts=await page.evaluate(()=>nodes.filter(node=>node.type==='smart-prompt').map(node=>({images:pixmaxTextContext(node).images,inputs:node.inputNodeIds})));
    assert.equal(contexts[0].images.length,2);assert.equal(contexts[1].images.length,1);assert.equal(contexts[0].inputs.length,3);assert.equal(contexts[1].inputs.length,2);assert.deepEqual(errors,[]);
});
for(const mutation of ['prompt','owner','lease','workspace','close'])test('asset image late result is refused after '+mutation,async t=>{
    const {page,errors}=await setup(t),api=await service(page,{held:true});await open(page,'person');await page.locator('[data-story-image-run]').click();await api.polling;
    if(mutation==='prompt')await page.getByRole('textbox',{name:'旅人 图像提示词'}).fill('改成红衣旅人');
    if(mutation==='owner')await page.evaluate(()=>nodes[0].shots[0].prompt='修改镜头');
    if(mutation==='lease')await page.evaluate(()=>MemberCanvasEdit.setEditable(false));
    if(mutation==='workspace')await page.evaluate(()=>CanvasSession.context.workspace.id='other-space');
    if(mutation==='close')await page.getByRole('button',{name:'关闭分镜资产图像',exact:true}).click();
    api.release();await idle(page);assert.equal(await page.evaluate(()=>nodes[1].images.length),0);assert.equal(api.calls.length,1);assert.equal(await page.evaluate(()=>smartPendingTasks(nodes[1])[0].taskId),api.calls[0].client_task_id);assert.deepEqual(errors,[]);
});
test('ambiguous image submission queries the original task even without an available provider',async t=>{
    const {page,errors}=await setup(t),api=await service(page,{status:503});await open(page,'person');await page.locator('[data-story-image-run]').click();await idle(page);
    await page.getByRole('button',{name:'关闭分镜资产图像',exact:true}).click();await page.evaluate(()=>apiProviders=[]);await open(page,'person');await page.getByRole('button',{name:'查询原图像任务',exact:true}).click();await idle(page);
    assert.equal(api.calls.length,1);assert.equal(await page.evaluate(()=>nodes[1].images.length),1,await page.locator('.pixmax-creation-status').textContent());assert.deepEqual(errors,[]);
});
test('fresh recovery and undo remove completed progress while preserving asset node mappings',async t=>{
    const {page,errors}=await setup(t),api=await service(page,{status:503});await open(page,'person');await page.locator('[data-story-image-run]').click();await idle(page);await page.evaluate(()=>saveCanvas({force:true}));await page.reload();await page.waitForFunction(()=>nodes.length===2);
    await page.addScriptTag({url:'/static/js/canvas-task-bindings.js'});await page.evaluate(()=>Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}}));
    await page.evaluate(async task=>{const recovery=smartTaskRecovery(),item=recovery.list().find(item=>item.kind==='image');await recovery.apply(item,task,()=>true);},[...api.records.values()][0]);
    assert.equal(await page.evaluate(()=>nodes[1].images.length),1);await page.evaluate(()=>performUndo());assert.equal(await page.evaluate(()=>nodes[1].images.length),0);assert.equal(await page.evaluate(()=>smartPendingTasks(nodes[1]).length),0);assert.equal(await page.evaluate(()=>nodes[0].storyboardAssets[0].imageNodeId===nodes[1].id),true);assert.deepEqual(errors,[]);
});
test('copy and workflow import remap asset nodes; copying a board alone drops external associations',async t=>{
    const {page,errors}=await setup(t),api=await service(page);await open(page,'person');await page.locator('[data-story-image-run]').click();await idle(page);
    const result=await page.evaluate(()=>{
        smartSelection.insertedNodes([nodes[0].id,nodes[1].id]);const payload=selectedSmartWorkflowPayload();copySelectedNodes();pasteNodes({includeConnections:true});
        const connected=nodes[2].storyboardAssets[0].imageNodeId===nodes[3].id&&nodes[3].storyboardAssetBinding.ownerId===nodes[2].id;
        smartSelection.insertedNodes([nodes[0].id]);copySelectedNodes();pasteNodes({includeConnections:true});
        const detached=nodes[4].storyboardAssets[0].imageNodeId===undefined;insertSmartWorkflowIntoCanvas(payload);
        const imported=nodes[5].storyboardAssets[0].imageNodeId===nodes[6].id&&nodes[6].storyboardAssetBinding.ownerId===nodes[5].id;
        smartSelection.insertedNodes([nodes[0].id,nodes[1].id]);duplicateForAltDrag(nodes[0]);
        const alt=nodes[7].storyboardAssets[0].imageNodeId===nodes[8].id&&nodes[8].storyboardAssetBinding.ownerId===nodes[7].id;
        return {connected,detached,imported,alt};
    });assert.deepEqual(result,{connected:true,detached:true,imported:true,alt:true});assert.deepEqual(errors,[]);
});
test('empty batch prompts are rejected before creating nodes or paying for any asset',async t=>{
    const {page,errors}=await setup(t),api=await service(page);await open(page);await page.getByRole('textbox',{name:'街道 图像提示词'}).fill('');await page.locator('[data-story-image-all]').click();await idle(page);
    assert.equal(api.calls.length,0);assert.equal(await page.evaluate(()=>nodes.length),1);assert.match(await page.locator('.pixmax-creation-status').textContent(),/请填写/);assert.deepEqual(errors,[]);
});
test('an unfinished query retains its receipt and reports pending rather than saved',async t=>{
    const {page,errors}=await setup(t),api=await service(page,{status:503,queued:true});await open(page,'person');await page.locator('[data-story-image-run]').click();await idle(page);
    await page.getByRole('button',{name:'查询原图像任务',exact:true}).click();await idle(page);
    assert.match(await page.locator('.pixmax-creation-status').textContent(),/尚未完成/);assert.equal(api.calls.length,1);assert.equal(await page.evaluate(()=>smartPendingTasks(nodes[1]).length),1);assert.equal(await page.evaluate(()=>nodes[1].images.length),0);assert.deepEqual(errors,[]);
});
test('explicit admission rejection keeps the draft without a false pending receipt',async t=>{
    const {page,errors}=await setup(t),api=await service(page,{status:422});await open(page,'person');await page.locator('[data-story-image-run]').click();await idle(page);
    assert.equal(api.calls.length,1);assert.equal(await page.evaluate(()=>smartPendingTasks(nodes[1]).length),0);assert.equal(await page.getByRole('button',{name:'生成图像',exact:true}).count(),1);assert.deepEqual(errors,[]);
});
test('terminal failure is shown as failure and querying never submits a replacement paid task',async t=>{
    const {page,errors}=await setup(t),api=await service(page,{status:503});await open(page,'person');await page.locator('[data-story-image-run]').click();await idle(page);
    for(const task of api.records.values()){task.status='failed';task.error='供应商生成失败';}
    await page.getByRole('button',{name:'查询原图像任务',exact:true}).click();await idle(page);
    assert.equal(api.calls.length,1);assert.match(await page.locator('.pixmax-creation-status').textContent(),/供应商生成失败/);assert.equal(await page.evaluate(()=>nodes[1].images.length),0);assert.deepEqual(errors,[]);
});
test('model policy restricts resolutions and readonly users cannot open image admission',async t=>{
    const {page,errors}=await setup(t);await page.evaluate(()=>apiProviders[0].model_policies={'image:test':{resolutions:['2k']}});await open(page,'person');
    assert.deepEqual(await page.getByRole('combobox',{name:'资产图像分辨率'}).locator('option').allTextContents(),['2k']);
    await page.getByRole('button',{name:'关闭分镜资产图像',exact:true}).click();await page.evaluate(()=>{MemberCanvasEdit.setEditable(false);PixmaxStoryboardAssets.open(nodes[0]);});
    assert.equal(await page.getByRole('dialog',{name:'分镜资产图像',exact:true}).count(),0);assert.equal(await page.evaluate(()=>nodes.length),1);assert.deepEqual(errors,[]);
});
