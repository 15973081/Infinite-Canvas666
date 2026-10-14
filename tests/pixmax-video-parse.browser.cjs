const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');
const parsed={assets:[{id:'person',type:'character',name:'旅人',description:'穿着灰色外套',prompt:'灰衣旅人'},{id:'street',type:'scene',name:'雨夜街道',description:'蓝色灯光',prompt:'夜晚街道'}],shots:[
    {start_seconds:0,end_seconds:.6,duration:.6,description:'旅人走进街道',size:'全景',assetIds:['person','street'],prompt:'雨夜旅人'},
    {start_seconds:.6,end_seconds:1.2,duration:.6,description:'旅人回头',size:'近景',assetIds:['person'],prompt:'人物回头'}]};
async function setup(t){
    const result=await fixture(t,'smart',true,{secureOrigin:true});
    for(const file of ['canvas-task-bindings.js','canvas-llm-tasks.js'])await result.page.addScriptTag({url:'/static/js/'+file});
    await result.page.evaluate(()=>{
        apiProviders=[{id:'writer',name:'解析模型',has_key:true,chat_models:['vision']}];
        Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});
        Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});
        createNode(120,160,[{url:'/assets/parse-source.mp4',name:'源视频.mp4',kind:'video',natural_w:160,natural_h:90}],{select:false});
    });
    await result.page.route('**/assets/parse-source.mp4',route=>route.fulfill({path:path.resolve('tests/fixtures/pixmax-audio-source.mp4'),contentType:'video/mp4'}));
    return result;
}
async function service(page,{held=false,status=200,reply=parsed}={}){
    const calls=[],records=new Map();let release,seen;const gate=new Promise(resolve=>release=resolve),polling=new Promise(resolve=>seen=resolve);
    await page.route('**/api/canvas-llm-tasks**',async route=>{
        if(route.request().method()==='POST'){
            const body=route.request().postDataJSON(),target=body.canvas_target;calls.push(body);
            const task={id:body.client_task_id,status:'succeeded',result:{text:JSON.stringify(reply)},canvas_binding:{version:3,canvas_id:body.canvas_id,canvas_kind:'smart',source_node_id:target.source_node_id,target_node_id:target.target_node_id,
                submitted_revision:target.base_revision,graph_sha256:target.input_sha256,request_sha256:'a'.repeat(64)}};records.set(task.id,task);
            return route.fulfill({status,json:status===200?{task_id:task.id,status:'queued',canvas_binding:task.canvas_binding}:{detail:'未确认'}});
        }
        seen();if(held)await gate;return route.fulfill({json:records.get(new URL(route.request().url()).pathname.split('/').pop())});
    });
    return {calls,records,polling,release};
}
async function open(page){await page.evaluate(()=>runSmartNodeToolbarAction(nodes[0].id,'parse'));await page.getByRole('dialog',{name:'视频解析',exact:true}).waitFor();}
async function finish(page){await page.waitForFunction(()=>nodes[1].shots?.length===2&&!PixmaxVideoParse.busy());}

test('video toolbar creates a connected storyboard, submits full-video parameters and saves editable assets/shots',async t=>{
    const {page,errors,record}=await setup(t),api=await service(page);await page.locator('.node-body').click();
    await page.getByRole('toolbar',{name:'视频节点工具'}).getByRole('button',{name:'解析',exact:true}).click();
    assert.equal(await page.evaluate(()=>nodes.length),2);assert.equal(await page.evaluate(()=>canvas.connections[0].from===nodes[0].id&&canvas.connections[0].to===nodes[1].id),true);
    await page.getByRole('combobox',{name:'采样画面上限'}).selectOption('24');await page.getByRole('textbox',{name:'视频解析补充文本'}).fill('旁白：继续前行');
    await page.locator('[data-video-parse-run]').click();await finish(page);
    assert.equal(api.calls.length,1);assert.equal(api.calls[0].video_sampling,'uniform');assert.equal(api.calls[0].video_frames,24);assert.deepEqual(api.calls[0].videos,['/assets/parse-source.mp4']);
    assert.match(api.calls[0].message,/继续前行/);assert.equal(api.calls[0].client_task_id,await page.evaluate(()=>nodes[1].videoAnalysis.taskId));
    await page.evaluate(()=>saveCanvas({force:true}));assert.equal(record.nodes[1].storyboardAssets[0].name,'旅人');assert.equal(record.nodes[1].shots[1].start_seconds,.6);
    await page.getByRole('button',{name:'打开分镜脚本',exact:true}).click();await page.getByRole('dialog',{name:'分镜脚本',exact:true}).waitFor();
    assert.equal(await page.getByRole('textbox',{name:'镜头 2 画面描述'}).inputValue(),'旅人回头');assert.deepEqual(errors,[]);
    await page.locator('[data-story-step="1"]').click();await page.getByRole('textbox',{name:'资产 1 外观描述'}).fill('旅人穿着红色外套');
    await page.screenshot({path:'.local/pixmax-video-storyboard-assets.png'});
    await page.locator('[data-story-step="2"]').click();await page.getByRole('button',{name:'生成镜头提示词',exact:true}).click();
    await page.waitForFunction(()=>nodes[1].creationResults.length===2);assert.match(api.calls[1].message,/旅人穿着红色外套/);
    await page.getByRole('button',{name:'保存并关闭',exact:true}).click();await page.evaluate(()=>saveCanvas({force:true}));assert.equal(record.nodes[1].storyboardAssets[0].description,'旅人穿着红色外套');
});

for(const mutation of ['input','source','lease','workspace','close'])test('parse refuses a delayed reply after '+mutation+' while preserving the original task',async t=>{
    const {page,errors}=await setup(t),api=await service(page,{held:true});await open(page);await page.locator('[data-video-parse-run]').click();await api.polling;
    if(mutation==='input')await page.getByRole('textbox',{name:'视频解析补充文本'}).fill('修改后的要求');
    if(mutation==='source')await page.evaluate(()=>nodes[0].images[0].url='/assets/other.mp4');
    if(mutation==='lease')await page.evaluate(()=>MemberCanvasEdit.setEditable(false));
    if(mutation==='workspace')await page.evaluate(()=>CanvasSession.context.workspace.id='other-space');
    if(mutation==='close')await page.getByRole('button',{name:'关闭视频解析',exact:true}).click();
    api.release();await page.waitForFunction(()=>!PixmaxVideoParse.busy());assert.equal(await page.evaluate(()=>nodes[1].shots.length),0);
    assert.equal(await page.evaluate(()=>nodes[1].videoAnalysis.taskId),api.calls[0].client_task_id);assert.equal(api.calls.length,1);assert.deepEqual(errors,[]);
});

test('ambiguous submission reopens the same storyboard and queries its task without paying again',async t=>{
    const {page,errors}=await setup(t),api=await service(page,{status:503});await open(page);await page.locator('[data-video-parse-run]').click();await page.waitForFunction(()=>!PixmaxVideoParse.busy());
    await page.getByRole('button',{name:'关闭视频解析',exact:true}).click();await open(page);assert.equal(await page.evaluate(()=>nodes.length),2);
    await page.locator('[data-video-parse-run]').click();await finish(page);assert.equal(api.calls.length,1);assert.deepEqual(errors,[]);
});

test('explicit admission rejection clears the unsubmitted task pointer',async t=>{
    const {page,errors}=await setup(t),api=await service(page,{status:422});await open(page);await page.locator('[data-video-parse-run]').click();await page.waitForFunction(()=>!PixmaxVideoParse.busy());
    assert.equal(await page.evaluate(()=>nodes[1].videoAnalysis.taskId),undefined);assert.equal(await page.evaluate(()=>PixmaxVideoParse.pending().length),0);assert.equal(api.calls.length,1);assert.deepEqual(errors,[]);
});

test('fresh-page recovery keeps typed shots and assets and clears terminal progress from undo',async t=>{
    const {page,errors}=await setup(t),api=await service(page,{status:503});await open(page);await page.locator('[data-video-parse-run]').click();await page.waitForFunction(()=>!PixmaxVideoParse.busy());
    await page.evaluate(()=>saveCanvas({force:true}));await page.reload();await page.waitForFunction(()=>nodes.length===2);
    for(const file of ['canvas-task-bindings.js','canvas-llm-tasks.js'])await page.addScriptTag({url:'/static/js/'+file});
    await page.evaluate(()=>Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}}));
    await page.evaluate(async task=>{const recovery=smartTaskRecovery();const item=recovery.list().find(item=>item.kind==='llm');await recovery.apply(item,task,()=>true);},[...api.records.values()][0]);
    await finish(page);await page.evaluate(()=>performUndo());assert.equal(await page.evaluate(()=>nodes[1].shots.length),0);assert.equal(await page.evaluate(()=>PixmaxVideoParse.pending().length),0);
    await page.evaluate(()=>redoSmartCanvas());assert.equal(await page.evaluate(()=>nodes[1].shots.length),2);assert.equal(api.calls.length,1);assert.deepEqual(errors,[]);
});

test('recovery adopts an already delivered raw reply without keeping a duplicate unconnected text card',async t=>{
    const {page,errors}=await setup(t),api=await service(page,{status:503});await open(page);await page.locator('[data-video-parse-run]').click();await page.waitForFunction(()=>!PixmaxVideoParse.busy());
    const task=[...api.records.values()][0];await page.getByRole('button',{name:'关闭视频解析',exact:true}).click();
    await page.evaluate(task=>{nodes.push({id:'raw',type:'smart-prompt',x:900,y:400,text:task.result.text,title:'生成结果',result_task_id:task.id,images:[]});canvas.task_result_version=1;},task);
    await page.route('**/api/canvases/canvas-test/task-results**',route=>route.fulfill({json:{canvas_id:'canvas-test',result_version:1,deliveries:[]}}));
    await page.evaluate(task=>PixmaxVideoParse.recover(nodes[1],task),task);await finish(page);
    assert.equal(await page.evaluate(()=>nodes.length),2);assert.equal(api.calls.length,1);assert.deepEqual(errors,[]);
});

for(const bad of [{...parsed,assets:[...parsed.assets,parsed.assets[0]]},{...parsed,shots:[{...parsed.shots[0],assetIds:['missing']}]},{...parsed,shots:[{...parsed.shots[0],end_seconds:2}]}])test('invalid parsed structure preserves manual shots and the supplier reply',async t=>{
    const {page,errors}=await setup(t),api=await service(page,{reply:bad});await open(page);
    await page.evaluate(()=>nodes[1].shots=[{duration:3,description:'手工镜头'}]);await page.locator('[data-video-parse-run]').click();await page.waitForFunction(()=>!PixmaxVideoParse.busy());
    assert.equal(await page.evaluate(()=>nodes[1].shots[0].description),'手工镜头');assert.equal(api.calls.length,1);assert.match(await page.locator('.pixmax-creation-status').innerText(),/资产|时长/);assert.deepEqual(errors,[]);
});

test('workflow and clipboard transfer omit foreign task pointers while retaining parsed assets and view configuration',async t=>{
    const {page,errors}=await setup(t);await open(page);
    const result=await page.evaluate(()=>{
        const node=nodes[1];node.videoAnalysis.taskId='canvas_llm_foreign_task';node.pendingTasks=[{taskId:'canvas_llm_foreign_task',kind:'llm'}];node.storyboardAssets=[{id:'person',type:'character',name:'旅人'}];
        smartSelection.insertedNodes(nodes.map(node=>node.id));const payload=selectedSmartWorkflowPayload();copySelectedNodes();pasteNodes({includeConnections:true});
        return {payload,pasted:nodes[3]};
    });
    assert.equal(result.payload.nodes[1].videoAnalysis.taskId,undefined);assert.equal(result.pasted.videoAnalysis.taskId,undefined);assert.equal(result.pasted.pendingTasks,undefined);assert.equal(result.pasted.storyboardAssets[0].name,'旅人');assert.deepEqual(errors,[]);
});

test('background delivery waits at the unresolved parsing prefix and readonly users cannot create parsing nodes',async t=>{
    const {page,errors}=await setup(t);await open(page);
    const result=await page.evaluate(()=>{
        nodes[1].videoAnalysis.taskId='canvas_llm_original_task';
        const response={canvas_id:canvas.id,result_version:3,deliveries:[{task_id:'before',version:1,node:{id:'a',text:'before'}},{task_id:'canvas_llm_original_task',version:2,node:{id:'b',text:'JSON'}},{task_id:'after',version:3,node:{id:'c',text:'after'}}]};
        return PixmaxVideoParse.deliveryPrefix(response);
    });
    assert.equal(result.result_version,1);assert.deepEqual(result.deliveries.map(item=>item.task_id),['before']);
    await page.getByRole('button',{name:'关闭视频解析',exact:true}).click();await page.evaluate(()=>{MemberCanvasEdit.setEditable(false);PixmaxVideoParse.create(nodes[0].id,0);});
    assert.equal(await page.evaluate(()=>nodes.length),2);assert.equal(await page.getByRole('dialog',{name:'视频解析',exact:true}).count(),0);assert.deepEqual(errors,[]);
});
