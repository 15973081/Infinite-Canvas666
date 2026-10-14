const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');
const results=require('../static/js/canvas-task-results.js'),clone=value=>JSON.parse(JSON.stringify(value));
async function setup(t,{reject,uncertain,completed=false}={}){
    const tasks=new Map(),submissions=[],deliveries=[];let document,version=0;
    const result=await fixture(t,'smart',true,{secureOrigin:true,apiHandler:request=>{
        const path=new URL(request.url()).pathname;
        if(completed&&path==='/api/canvases/canvas-test'&&request.method()==='PUT'&&document){
            const body=request.postDataJSON(),revision=document.revision;Object.assign(document,clone(body),{revision:revision+1});document.updated_at++;
            results.mergeDeliveries(document,{canvas_id:document.id,result_version:version,deliveries:clone(deliveries.filter(item=>item.version>(body.task_result_version||0)))});
            return {status:200,body:{canvas:document}};
        }
        if(completed&&path.endsWith('/task-results'))return {status:200,body:{canvas_id:document.id,result_version:version,deliveries:clone(deliveries.filter(item=>item.version>Number(new URL(request.url()).searchParams.get('delivered_after')||0)))}};
        if(path.endsWith('/batch-preview')){
            const body=request.postDataJSON();return {status:200,body:{prepared:body.items.map(item=>({nodeId:item.node_id,kind:item.kind,cost:{status:'unknown'}})),skipped:[],costs:{CNY:{amount_micros:200000,base_amount_micros:300000}},unknownCount:2}};
        }
        if(/^\/api\/canvas-(image|video|llm|audio|model)-tasks$/.test(path)&&request.method()==='POST'){
            const body=request.postDataJSON();submissions.push(body);
            if(path.includes(reject+'-tasks'))return {status:422,body:{detail:'Invalid fixture parameters'}};
            const binding={version:3,canvas_id:body.canvas_id,canvas_kind:'smart',source_node_id:body.canvas_target.source_node_id,target_node_id:body.canvas_target.target_node_id,
                submitted_revision:body.canvas_target.base_revision,graph_sha256:body.canvas_target.input_sha256,request_sha256:'b'.repeat(64)};
            tasks.set(body.client_task_id,{id:body.client_task_id,status:'queued',canvas_binding:binding});
            if(path.includes(uncertain+'-tasks'))return {status:503,body:{detail:'Uncertain fixture response'}};
            return {status:200,body:{task_id:body.client_task_id,status:'queued',canvas_binding:binding}};
        }
        if(/^\/api\/canvas-(image|video|llm|audio|model)-tasks\//.test(path)){
            const task=tasks.get(path.split('/').pop());
            if(completed&&task.status==='queued'){
                const kind=path.match(/canvas-(\w+)-tasks/)[1],url='/output/generated-'+kind+'.'+({image:'png',video:'mp4',audio:'mp3',model:'glb'}[kind]||'txt');
                task.status='succeeded';task.canvas_edit_generation=1;task.result=kind==='llm'?{text:'新生成的文本'}:{[{image:'images',video:'videos',audio:'audios',model:'models'}[kind]]:[url]};
                const node=kind==='llm'?{id:'result_'+task.id,type:'smart-prompt',text:task.result.text}:{id:'result_'+task.id,type:kind==='image'||kind==='video'?'smart-image':'smart-'+kind,images:[{url,kind}]};
                deliveries.push({task_id:task.id,version:++version,target_id:task.canvas_binding.target_node_id,node});
                results.mergeDeliveries(document,{canvas_id:document.id,result_version:version,deliveries:clone(deliveries)});
            }
            return {status:200,body:task};
        }
    }});
    document=result.record;
    await result.page.addScriptTag({url:'/static/js/canvas-task-bindings.js'});
    await result.page.evaluate(()=>{
        Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});
        apiProviders=[{id:'p',name:'测试供应商',has_key:true,image_models:['test'],video_models:['test-video'],chat_models:['test'],audio_models:['speech-2.8-hd'],model_models:['3.0'],model_policies:{'video:test-video':{resolutions:['720p'],duration_min:1,duration_max:15}}}];
        nodes=[{id:'text',type:'smart-prompt',text:'旧文本',textGeneration:{providerId:'p',model:'test',input:'写故事'}},
            {id:'image',type:'smart-image',generationKind:'image',promptDraftText:'雨夜',runSettings:{engine:'api',apiKind:'image',provider_id:'p',model:'test',resolution:'1k',ratio:'square',count:1}},
            {id:'video',type:'smart-image',generationKind:'video',promptDraftText:'雨夜镜头',runSettings:{engine:'api',apiKind:'video',videoProvider:'p',videoModel:'test-video',videoResolution:'720p',videoDuration:5,videoAspect:'16:9'}},
            {id:'audio',type:'smart-audio',audioGeneration:{provider_id:'p',model:'speech-2.8-hd',mode:'speech',prompt:'你好',timbre_id:'male-qn-qingse'}},
            {id:'model',type:'smart-model',modelGeneration:{provider_id:'p',model:'3.0',mode:'text',prompt:'陶瓷猫',generate_type:'Normal',face_count:300000}}];
        nodes.forEach((node,index)=>Object.assign(node,{x:260+(index%3)*260,y:200+Math.floor(index/3)*280,images:[]}));canvas.connections=[];
        window.batchFrame=PixmaxCanvasFrames.create(nodes.map(node=>node.id));
    });
    return {...result,tasks,submissions};
}
test('native planner excludes downstream generators through selected non-generator nodes, cycles and busy nodes',async t=>{
    const {page,errors}=await setup(t);
    const plan=await page.evaluate(()=>{
        nodes=[{id:'a',type:'smart-image',generationKind:'image'},{id:'bridge',type:'smart-prompt',pixmaxSourceType:'BASE_TEXT'},{id:'b',type:'smart-image',generationKind:'video'},
            {id:'busy',type:'smart-audio',pending:1},{id:'cycle-a',type:'smart-model'},{id:'cycle-b',type:'smart-prompt'}];
        canvas.connections=[{from:'a',to:'bridge'},{from:'bridge',to:'b'},{from:'cycle-a',to:'cycle-b'},{from:'cycle-b',to:'cycle-a'}];return PixmaxBatchExecution.plan(nodes.map(node=>node.id));
    });
    assert.deepEqual(plan.candidates,[{nodeId:'a',kind:'image'}]);assert.deepEqual(plan.excludedDownstreamIds,['b']);
    assert.deepEqual(plan.skipped.map(item=>item.reason),['downstream-in-selection','busy','cyclic-selection','cyclic-selection']);assert.deepEqual(errors,[]);
});
test('frame toolbar previews five generation types, server estimate and unknown fees; cancelling admits no tasks',async t=>{
    const {page,submissions,errors}=await setup(t);
    const diagnostic=await page.evaluate(async()=>{const data=await PixmaxBatchExecution.preview(batchFrame);return {count:data.entries.length,skipped:data.skipped};});assert.equal(diagnostic.count,5,JSON.stringify(diagnostic));await page.locator('[data-frame-run]').click();
    await page.locator('[data-batch-confirm]').waitFor();const dialog=page.getByRole('dialog',{name:'批量执行'});
    for(const label of ['图像生成','视频生成','文本生成','音频生成','3D 生成'])assert.match(await dialog.textContent(),new RegExp(label));
    assert.match(await dialog.textContent(),/预计费用：CNY 0.2/);assert.match(await dialog.textContent(),/2 个节点的费用待核算/);
    await page.screenshot({path:'.local/pixmax-batch-preview.png'});await page.locator('[data-batch-cancel]').click();assert.equal(submissions.length,0);assert.deepEqual(errors,[]);
});
test('confirmation admits each mixed generation exactly once and saves recoverable original task IDs',async t=>{
    const {page,submissions,errors}=await setup(t);await page.locator('[data-frame-run]').click();await page.locator('[data-batch-confirm]').click();
    await page.waitForFunction(()=>document.querySelector('.pixmax-creation-status')?.textContent.includes('已提交 5 个任务'));
    assert.equal(submissions.length,5);assert.equal(new Set(submissions.map(body=>body.client_task_id)).size,5);
    assert.deepEqual(await page.evaluate(()=>nodes.filter(node=>!PixmaxCanvasFrames.isFrame(node)).map(node=>smartPendingTasks(node).length)),[1,1,1,1,1]);
    assert.equal(await page.evaluate(()=>smartTaskRecovery().list().length),5);assert.deepEqual(errors,[]);
});
test('changing a prompt after preview prevents every admission',async t=>{
    const {page,submissions,errors}=await setup(t);await page.locator('[data-frame-run]').click();await page.locator('[data-batch-confirm]').waitFor();
    await page.evaluate(()=>nodes.find(node=>node.id==='image').promptDraftText='新的提示词');await page.locator('[data-batch-confirm]').click();
    await page.waitForFunction(()=>document.querySelector('.pixmax-creation-status')?.textContent.includes('已变化'));assert.equal(submissions.length,0);assert.deepEqual(errors,[]);
});
test('five mixed completions have separate undo steps and acknowledged results stay removed after reload',async t=>{
    const {page,submissions,errors}=await setup(t,{completed:true});
    await page.evaluate(async()=>PixmaxBatchExecution.submit(await PixmaxBatchExecution.preview(batchFrame)));
    await page.waitForFunction(()=>!PixmaxBatchExecution.busy()&&nodes.find(node=>node.id==='text').text==='新生成的文本'&&nodes.filter(node=>['image','video','audio','model'].includes(node.id)).every(node=>node.images.length===1));
    assert.equal(await page.evaluate(()=>canvas.task_result_version),5);
    const counts=await page.evaluate(()=>{const count=()=>nodes.reduce((sum,node)=>sum+(node.images?.length||0)+(node.id==='text'&&node.text==='新生成的文本'?1:0),0),values=[count()];for(let i=0;i<5;i++){performUndo();values.push(count());}return values;});
    assert.deepEqual(counts,[5,4,3,2,1,0]);assert.equal(await page.evaluate(()=>nodes.every(node=>smartPendingTasks(node).length===0)),true);
    assert.equal(await page.evaluate(()=>saveCanvas({force:true})),true);await page.reload();await page.waitForFunction(()=>canvas?.id==='canvas-test');
    assert.equal(await page.evaluate(()=>nodes.every(node=>!node.images?.length&&!smartPendingTasks(node).length)),true);assert.equal(await page.evaluate(()=>nodes.find(node=>node.id==='text').text),'旧文本');assert.equal(submissions.length,5);assert.deepEqual(errors,[]);
});
test('simultaneous confirmations reserve the whole batch before the first async save',async t=>{
    const {page,submissions,errors}=await setup(t);
    const statuses=await page.evaluate(async()=>{const preview=await PixmaxBatchExecution.preview(batchFrame);return (await Promise.allSettled([PixmaxBatchExecution.submit(preview),PixmaxBatchExecution.submit(preview)])).map(item=>item.status);});
    assert.deepEqual(statuses,['fulfilled','rejected']);assert.equal(submissions.length,5);assert.deepEqual(errors,[]);
});
test('one preview flushes the document once regardless of the number of prepared nodes',async t=>{
    const {page,writes,submissions,errors}=await setup(t),before=writes.filter(item=>item.method==='PUT').length;
    const count=await page.evaluate(async()=>(await PixmaxBatchExecution.preview(batchFrame)).entries.length);
    assert.equal(count,5);assert.equal(writes.filter(item=>item.method==='PUT').length-before,1);assert.equal(submissions.length,0);assert.deepEqual(errors,[]);
});
for(const [uncertain,kind,nodeId] of [[false,'audio','audio'],[true,'audio','audio'],[true,'llm','text']])test('partial '+kind+' '+(uncertain?'uncertain':'rejected')+' admission preserves sibling receipts and never automatically resubmits',async t=>{
    const {page,submissions,errors}=await setup(t,uncertain?{uncertain:kind}:{reject:kind});
    const result=await page.evaluate(async()=>PixmaxBatchExecution.submit(await PixmaxBatchExecution.preview(batchFrame)));
    assert.equal(result.accepted.length,4);assert.equal(result.failed.length,1);assert.equal(submissions.length,5);
    assert.equal(await page.evaluate(id=>smartPendingTasks(nodes.find(node=>node.id===id)).length,nodeId),uncertain?1:0);
    if(uncertain){assert.equal(await page.evaluate(id=>smartPendingTasks(nodes.find(node=>node.id===id))[0].paused,nodeId),true);assert.match(await page.evaluate(id=>smartPendingTasks(nodes.find(node=>node.id===id))[0].taskId,nodeId),new RegExp('^canvas_'+kind+'_'));assert.equal(await page.evaluate(()=>smartTaskRecovery().list().length),5);}
    assert.equal(submissions.length,5);assert.deepEqual(errors,[]);
});
for(const change of ['lease','workspace','membership'])test(change+' changing after preview prevents task admission',async t=>{
    const {page,submissions,errors}=await setup(t);
    const message=await page.evaluate(async change=>{const snapshot=await PixmaxBatchExecution.preview(batchFrame);if(change==='lease')MemberCanvasEdit.setEditable(false);else if(change==='workspace')CanvasSession.context.workspace.id='other';else delete nodes.find(node=>node.id==='image').frameId;try{await PixmaxBatchExecution.submit(snapshot);return 'unexpected';}catch(error){return error.message;}},change);
    assert.match(message,/已变化/);assert.equal(submissions.length,0);assert.deepEqual(errors,[]);
});
