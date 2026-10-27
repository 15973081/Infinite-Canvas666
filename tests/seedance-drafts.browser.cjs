const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');
const model='doubao-seedance-2-5-260628';
const provider={id:'draft-test',name:'火山样片测试',protocol:'volcengine',seedance_draft:true,
    base_url:'https://ark.cn-beijing.volces.com/api/v3',enabled:true,has_key:true,video_models:[model],image_models:[],chat_models:[]};
const clip=fs.readFileSync(path.join(__dirname,'fixtures/smart-video-trim.webm'));

for(const kind of ['classic','smart']) test(`${kind}: draft -> review -> upgrade, persisted identity and no automatic upgrade`,async t=>{
    const {page,errors}=await fixture(t,kind,false);
    const submitted=[],tasks=new Map();
    await page.route('**/api/config',route=>route.fulfill({json:{api_providers:[provider],video_models:[model],image_models:[],chat_models:[]}}));
    await page.route('**/output/test-*.webm',route=>route.fulfill({body:clip,contentType:'video/webm'}));
    await page.route('**/api/canvas-video-tasks**',async route=>{
        const request=route.request();
        if(request.method()==='POST'){
            const payload=request.postDataJSON();submitted.push(payload);
            const id=payload.client_task_id || `canvas_vid_test000${submitted.length}`;
            const draft={source_task_id:id,task_id:'ark-draft-1',provider_id:provider.id,model,
                created_at:Date.now()/1000,expires_at:Date.now()/1000+7*86400};
            const result={task_id:'ark-'+submitted.length,videos:[payload.draft?'/output/test-draft.webm':'/output/test-final.webm'],
                ...(payload.draft?{seedance_draft:draft}:{draft_source_task_id:payload.draft_source_task_id})};
            tasks.set(id,{id,status:'succeeded',result});
            return route.fulfill({json:{task_id:id,status:'queued'}});
        }
        return route.fulfill({json:tasks.get(new URL(request.url()).pathname.split('/').at(-1))});
    });
    await page.reload();await page.waitForFunction(()=>canvas?.id==='canvas-test' && apiProviders.some(p=>p.id==='draft-test'));
    await page.evaluate(({kind,model})=>{
        if(kind==='classic'){
            const prompt=addPromptNode({x:20,y:20});prompt.text='琥珀气泡水，冰块落入杯中，暖金色逆光，连续推进镜头。';
            window.draftGenerator=addVideoNode({x:380,y:20});
            Object.assign(draftGenerator,{apiProvider:'draft-test',model,resolution:'1080p'});
            connections.push({id:'draft-input',from:prompt.id,to:draftGenerator.id});render();
        }else{
            window.draftGenerator=createGenerationNodeAt({x:200,y:100},'video');
            draftGenerator.runSettings={...settings,engine:'api',apiKind:'video',videoProvider:'draft-test',videoModel:model,videoResolution:'1080p'};
            smartComposer.setDraftForNode(draftGenerator,'琥珀气泡水，冰块落入杯中，暖金色逆光，连续推进镜头。');
            smartSelection.createdNode(draftGenerator.id);render();updateComposer();
        }
    },{kind,model});
    if(kind==='classic')await page.locator('.video-draft').check();
    else{
        await page.getByText('样片 / 升级',{exact:true}).click();
        await page.locator('[data-smart-param="videoDraft"]').click();
    }
    await page.evaluate(async kind=>{if(kind==='classic')await runVideoNode(draftGenerator.id);else await runGeneration();},kind);
    assert.equal(submitted.length,1,'draft completion must never trigger a paid upgrade');
    assert.equal(submitted[0].draft,true);assert.equal(submitted[0].resolution,'480p');assert.equal(submitted[0].duration,5);
    await page.waitForFunction(()=>nodes.some(n=>(n.images||[]).some(i=>i.seedance_draft)));
    const sourceId=await page.evaluate(()=>nodes.flatMap(n=>n.images||[]).find(i=>i.seedance_draft).seedance_draft.source_task_id);
    await page.evaluate(()=>saveCanvas({force:true}));
    await page.reload();await page.waitForFunction(()=>nodes.some(n=>(n.images||[]).some(i=>i.seedance_draft)));
    assert.equal(await page.evaluate(()=>nodes.flatMap(n=>n.images||[]).find(i=>i.seedance_draft).seedance_draft.source_task_id),sourceId);
    await page.evaluate(kind=>{
        const output=nodes.find(n=>(n.images||[]).some(i=>i.seedance_draft));
        if(kind==='classic')refreshNodes([output.id]);
        else {
            // Server-delivered results have media identity but no composer state.
            delete output.generationKind;output.runSettings={engine:'api',apiKind:'image'};
            output.x=400;output.y=100;viewport={x:0,y:0,scale:1};applyViewport();
            smartSelection.createdNode(output.id);render();updateComposer();
        }
    },kind);
    if(kind==='smart')await page.getByText(/^(480p 样片|样片 \/ 升级)$/).first().click();
    const shots=path.resolve(__dirname,'../.local/seedance-drafts');fs.mkdirSync(shots,{recursive:true});
    await page.screenshot({path:path.join(shots,kind+'.png')});
    await page.locator(kind==='classic'?'.output-draft-upgrade':'[data-draft-upgrade]').first().click();
    await page.waitForFunction(()=>nodes.some(n=>(n.images||[]).some(i=>i.url==='/output/test-final.webm')));
    assert.equal(submitted.length,2);
    const upgrade=submitted[1];
    assert.equal(upgrade.draft_source_task_id,sourceId);assert.equal(upgrade.resolution,'1080p');assert.equal(upgrade.model,model);
    for(const key of ['draft','duration','aspect_ratio','images','videos','audios','seed','generate_audio'])assert.equal(key in upgrade,false,key+' must be inherited by Ark');
    assert.ok(await page.evaluate(()=>nodes.some(n=>(n.images||[]).some(i=>i.url==='/output/test-draft.webm'))),'original draft retained');
    await page.evaluate(kind=>{
        const output=nodes.find(n=>(n.images||[]).some(i=>i.seedance_draft));
        output.images.filter(i=>i.seedance_draft).forEach(i=>i.seedance_draft.expires_at=1);
        if(kind==='classic')refreshNodes([output.id]);
        else {smartSelection.createdNode(output.id);render();updateComposer();}
    },kind);
    if(kind==='classic')assert.equal(await page.locator('.output-draft-upgrade').first().textContent(),'查看 1080p');
    else assert.equal(await page.locator('[data-draft-upgrade]').first().isDisabled(),true);
    assert.equal(submitted.length,2,'expired draft never submits');
    assert.deepEqual(errors,[]);
});

test('classic: multiple videos upgrade by card identity, independently, with retry and no duplicate billing',async t=>{
    const {page,errors}=await fixture(t,'classic',false);
    const submitted=[],tasks=new Map();
    await page.route('**/api/media-preview**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#46544b"/></svg>'}));
    await page.route('**/output/test-*.webm',route=>route.fulfill({body:clip,contentType:'video/webm'}));
    await page.route('**/api/canvas-video-tasks**',route=>{
        const req=route.request();
        if(req.method()==='POST'){
            const payload=req.postDataJSON();submitted.push(payload);
            tasks.set(payload.client_task_id,{id:payload.client_task_id,status:'running'});
            return route.fulfill({json:{task_id:payload.client_task_id,status:'queued'}});
        }
        return route.fulfill({json:tasks.get(new URL(req.url()).pathname.split('/').at(-1))});
    });
    await page.evaluate(({provider,model})=>{
        apiProviders=[provider];
        const draft=(id,expired=false)=>({url:`/output/test-${id}.webm`,kind:'video',seedance_draft:{source_task_id:id,task_id:'ark-'+id,
            provider_id:provider.id,model,expires_at:expired?1:Date.now()/1000+86400}});
        nodes=[{id:'multi-output',type:'output',x:80,y:100,w:800,images:[draft('sample-a'),{url:'/output/test-ordinary.webm',kind:'video'},draft('sample-b'),draft('expired',true)]}];
        connections=[];render();
    },{provider,model});
    const card=id=>page.locator(`[data-output-url="/output/test-${id}.webm"] .output-draft-upgrade`);
    assert.equal(await page.locator('.output-draft-upgrade').count(),3);
    assert.equal(await card('expired').isDisabled(),true);
    assert.equal(await card('sample-a').textContent(),'升级 1080p');
    const waitSubmit=()=>page.waitForResponse(r=>r.request().method()==='POST' && r.url().includes('/api/canvas-video-tasks'));
    await Promise.all([waitSubmit(),card('sample-b').click()]);
    await page.waitForFunction(()=>nodes[0]._pending?.length===1);
    // Directly repeated calls also must not escape the guard during submission.
    await page.evaluate(()=>upgradeClassicOutputDraft('multi-output','/output/test-sample-b.webm','sample-b'));
    assert.equal(submitted.length,1);assert.equal(submitted[0].draft_source_task_id,'sample-b');
    assert.equal(await card('sample-b').isDisabled(),true);
    assert.equal(await card('sample-a').isDisabled(),false);
    await Promise.all([waitSubmit(),card('sample-a').click()]);
    await page.waitForFunction(()=>nodes[0]._pending?.length===2);
    assert.equal(submitted.length,2);assert.equal(submitted[1].draft_source_task_id,'sample-a');
    assert.equal(await page.evaluate(()=>nodes.length),1,'upgrading never creates a generator or another output');
    const first=submitted[0],second=submitted[1];
    tasks.set(first.client_task_id,{id:first.client_task_id,status:'succeeded',result:{videos:['/output/test-final-b.webm'],draft_source_task_id:'sample-b'}});
    tasks.set(second.client_task_id,{id:second.client_task_id,status:'failed',error:'模拟生成失败'});
    await page.waitForFunction(()=>!nodes[0]._pending?.length);
    assert.equal(await card('sample-b').textContent(),'查看 1080p');
    assert.equal(await card('sample-a').isDisabled(),false,'failed upgrade can be retried');
    await card('sample-b').click();
    assert.equal(await page.locator('#outputLightboxVideo').getAttribute('src'),'/output/test-final-b.webm');
    assert.equal(submitted.length,2,'viewing the finished video never resubmits');
    await page.evaluate(()=>closeOutputLightbox());
    // Reorder the output before retrying: the selected video must not depend on index.
    await page.evaluate(()=>{nodes[0].images.reverse();refreshNodes(['multi-output']);});
    await Promise.all([waitSubmit(),card('sample-a').click()]);
    await page.waitForFunction(()=>nodes[0]._pending?.length===1);
    assert.equal(submitted.length,3);assert.equal(submitted[2].draft_source_task_id,'sample-a');
    tasks.set(submitted[2].client_task_id,{id:submitted[2].client_task_id,status:'succeeded',result:{videos:['/output/test-final-a.webm'],draft_source_task_id:'sample-a'}});
    await page.waitForFunction(()=>!nodes[0]._pending?.length);
    assert.equal(await page.evaluate(()=>nodes[0].images.length),6,'four original videos plus two formal videos');
    await page.evaluate(()=>saveCanvas({force:true}));
    await page.reload();await page.waitForFunction(()=>nodes[0]?.images?.length===6);
    assert.equal(await card('sample-a').textContent(),'查看 1080p');assert.equal(await card('sample-b').textContent(),'查看 1080p');
    const shots=path.resolve(__dirname,'../.local/seedance-drafts');fs.mkdirSync(shots,{recursive:true});
    await page.locator('.output-node').screenshot({path:path.join(shots,'classic-multiple.png')});
    assert.deepEqual(errors,[]);
});
