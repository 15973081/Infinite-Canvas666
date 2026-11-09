const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');
const model='doubao-seedance-2-5-260628';
async function setup(t,{asset=false,expired=false,ambiguous=false}={}){
    const calls=[],records=new Map();
    const f=await fixture(t,'smart',true,{secureOrigin:true,apiHandler:request=>{
        const path=new URL(request.url()).pathname;
        if(path==='/api/canvas-video-tasks'&&request.method()==='POST'){
            const body=request.postDataJSON();calls.push(body);
            if(ambiguous&&calls.length===1)return {status:504,body:{detail:'模拟响应中断'}};
            const target=body.canvas_target,binding={version:3,canvas_id:body.canvas_id,canvas_kind:'smart',source_node_id:target.source_node_id,target_node_id:target.target_node_id,submitted_revision:target.base_revision,graph_sha256:target.input_sha256,request_sha256:'d'.repeat(64)};
            const metadata=body.draft?{seedance_draft:{source_task_id:body.client_task_id,task_id:'upstream-sample',provider_id:body.provider_id,model:body.model,expires_at:Date.now()/1000+86400}}:{draft_source_task_id:body.draft_source_task_id};
            records.set(body.client_task_id,{id:body.client_task_id,status:'succeeded',canvas_edit_generation:1,canvas_binding:binding,result:{videos:['/output/final-'+calls.length+'.mp4'],...metadata}});
            return {status:200,body:{task_id:body.client_task_id,status:'queued',canvas_binding:binding}};
        }
        if(path.startsWith('/api/canvas-video-tasks/'))return records.has(path.split('/').pop())?{status:200,body:records.get(path.split('/').pop())}:{status:404,body:{detail:'任务不存在'}};
    }});
    await f.page.addScriptTag({url:'/static/js/canvas-task-bindings.js'});
    await f.page.evaluate(({model,asset,expired})=>{
        apiProviders=[{id:'ark',name:'火山引擎',enabled:true,has_key:true,seedance_draft:true,video_capabilities:{native_roles:true},video_models:[model]},
            {id:'proxy',name:'聚合平台',enabled:true,has_key:true,seedance_draft:false,video_models:[model]}];
        Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});
        const draft={source_task_id:'canvas_vid_original123',task_id:'upstream-original',provider_id:'ark',model,expires_at:Date.now()/1000+(expired?-10:86400)};
        window.draftNode=asset?createNode(400,180,[{url:'/output/draft.mp4',kind:'video',name:'样片',seedance_draft:draft}],{select:true}):createGenerationNodeAt({x:400,y:180},'video');
        draftNode.runSettings={engine:'api',apiKind:'video',videoProvider:'ark',videoModel:model,videoResolution:'720p',videoDuration:10,videoAspect:'16:9',videoGenerateAudio:false};render();
    },{model,asset,expired});return {...f,calls};
}
test('native draft stage works in normal and fullscreen forms and reaches the real request builder',async t=>{
    const {page,errors}=await setup(t);
    await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('玻璃杯中落入一块冰块');
    await page.getByRole('button',{name:'视频阶段',exact:true}).click();await page.locator('[data-select-option]').filter({hasText:'样片 480P'}).click();
    let value=await page.evaluate(()=>({config:draftNode.runSettings,parameters:PixmaxGenerationParameters.data(draftNode,[])}));
    assert.equal(value.config.videoDraft,true);assert.equal(value.config.videoResolution,'480p');assert.equal(value.config.videoDuration,5);assert.ok(value.parameters.disabledFieldNames.includes('resolution'));
    const request=await page.evaluate(()=>PixmaxBatchExecution.prepare(draftNode,'video'));assert.equal(request.draft,true);assert.equal(request.resolution,'480p');assert.equal(request.prompt,'玻璃杯中落入一块冰块');
    await page.screenshot({path:'.local/pixmax-seedance-stage.png'});
    await page.getByRole('button',{name:'全屏',exact:true}).click();const dialog=page.getByRole('dialog',{name:'全屏',exact:true});
    assert.equal(await dialog.getByRole('button',{name:'视频阶段',exact:true}).innerText(),'样片 480P');
    await dialog.getByRole('button',{name:'视频阶段',exact:true}).click();await page.locator('[data-select-option]').filter({hasText:'普通模式'}).click();
    assert.equal(await page.evaluate(()=>draftNode.runSettings.videoDraft),false);assert.deepEqual(errors,[]);
});
test('generated sample identity and mode survive saving and reopening the canvas',async t=>{
    const {page,calls,errors,record}=await setup(t);
    await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('饮料广告样片');
    await page.getByRole('button',{name:'视频阶段',exact:true}).click();await page.locator('[data-select-option]').filter({hasText:'样片 480P'}).click();
    await page.evaluate(()=>runGeneration());assert.equal(calls.length,1);assert.equal(calls[0].draft,true);
    await page.evaluate(()=>saveCanvas({force:true}));
    const saved=record.nodes.find(node=>node.id===calls[0].canvas_target.target_node_id);
    assert.equal(saved.images[0].seedance_draft.source_task_id,calls[0].client_task_id);assert.equal(saved.runSettings.videoDraft,true);
    await page.reload();await page.waitForFunction(()=>nodes.some(node=>node.images?.[0]?.seedance_draft));
    const restored=await page.evaluate(()=>nodes.find(node=>node.images?.[0]?.seedance_draft).images[0].seedance_draft);
    assert.equal(restored.source_task_id,calls[0].client_task_id);assert.deepEqual(errors,[]);
});
test('unsupported providers hide draft stage and clear draft intent when switching providers',async t=>{
    const {page,errors}=await setup(t);
    await page.getByRole('button',{name:'视频阶段',exact:true}).click();await page.locator('[data-select-option]').filter({hasText:'样片 480P'}).click();
    await page.getByRole('button',{name:'生成厂商',exact:true}).click();await page.locator('[data-select-option]').filter({hasText:'聚合平台'}).click();
    assert.equal(await page.getByRole('button',{name:'视频阶段',exact:true}).count(),0);assert.equal(await page.evaluate(()=>draftNode.runSettings.videoDraft),false);
    await page.getByRole('button',{name:'生成厂商',exact:true}).click();await page.locator('[data-select-option]').filter({hasText:'火山引擎'}).click();
    await page.getByRole('button',{name:'视频阶段',exact:true}).waitFor();assert.deepEqual(errors,[]);
});
for(const ambiguous of [false,true])test('sample upgrades to a nearby connected video and reuses the original task'+(ambiguous?' after lost response':''),async t=>{
    const {page,calls,errors}=await setup(t,{asset:true,ambiguous});
    await page.getByRole('button',{name:'生成成片',exact:true}).click();let dialog=page.getByRole('dialog',{name:'生成成片',exact:true});
    await dialog.getByRole('button',{name:'生成成片 · 1080P',exact:true}).click();
    if(ambiguous){await dialog.getByRole('button',{name:'查询成片任务',exact:true}).waitFor();await dialog.getByRole('button',{name:'查询成片任务',exact:true}).click();}
    await dialog.waitFor({state:'detached'});
    const state=await page.evaluate(()=>{const target=nodes.find(node=>node.seedanceUpgrade);return {source:nodeRect(draftNode),target:nodeRect(target),images:target.images,edges:canvas.connections,sourceId:draftNode.id,targetId:target.id,kind:smartGenerationKind(target),video:isSmartVideoAssetNode(target),sourceCount:draftNode.images.length};});
    assert.equal(state.target.x,state.source.x+state.source.width+60);assert.equal(state.target.y,state.source.y);assert.ok(state.edges.some(edge=>edge.from===state.sourceId&&edge.to===state.targetId));
    assert.equal(state.video,true);assert.equal(state.kind,'');assert.equal(state.sourceCount,1);assert.equal(state.images[0].draft_source_task_id,'canvas_vid_original123');
    assert.equal(calls.length,ambiguous?2:1);assert.equal(new Set(calls.map(call=>call.client_task_id)).size,1);
    const request=calls[0];assert.equal(request.resolution,'1080p');assert.equal(request.provider_id,'ark');assert.equal(request.draft_source_task_id,'canvas_vid_original123');assert.equal(request.images,undefined);assert.equal(request.draft,undefined);
    await page.evaluate(()=>PixmaxSeedanceDrafts.open(draftNode,0));assert.equal(await page.getByRole('dialog',{name:'生成成片',exact:true}).count(),0);assert.equal(calls.length,ambiguous?2:1);assert.deepEqual(errors,[]);
});
test('expired samples cannot submit an upgrade',async t=>{
    const {page,calls,errors}=await setup(t,{asset:true,expired:true});
    assert.equal(await page.getByRole('button',{name:'生成成片',exact:true}).isDisabled(),true);assert.equal(calls.length,0);assert.deepEqual(errors,[]);
});
