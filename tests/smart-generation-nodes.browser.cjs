const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');

async function generationCanvas(t){
    const f=await fixture(t,'smart',false);
    await f.page.evaluate(()=>{
        apiProviders=[{id:'test',name:'Test provider',enabled:true,has_key:true,image_models:['image-model'],video_models:['video-model']}];
        window.imageGenerator=createGenerationNodeAt({x:360,y:250},'image');
        window.videoGenerator=createGenerationNodeAt({x:780,y:250},'video');
    });
    return f;
}

test('separate image/video nodes show their own composer and retain independent rich prompts and parameters',async t=>{
    const {page,errors}=await generationCanvas(t);
    assert.equal(await page.locator('.generation-node-placeholder').count(),2);
    assert.equal(await page.locator('.node-drop').count(),0);
    const image=await page.locator('.generation-node').first().boundingBox(),video=await page.locator('.generation-node').last().boundingBox();
    assert.equal(image.width,240);assert.equal(image.height,240);assert.equal(video.width,320);assert.equal(video.height,180);
    assert.equal(await page.locator('.generation-node').first().evaluate(el=>getComputedStyle(el).borderStyle),'solid');
    await page.mouse.move(image.x+18,image.y+image.height/2);await page.mouse.down();
    await page.mouse.move(image.x+68,image.y+image.height/2+25,{steps:5});await page.mouse.up();
    assert.deepEqual(await page.evaluate(()=>({x:imageGenerator.x,y:imageGenerator.y})),{x:290,y:155});
    await page.getByRole('button',{name:'编辑图片生成提示词'}).click();
    assert.equal(await page.locator('#composerHeading').textContent(),'图片生成');
    assert.equal(await page.locator('#apiKindToggle').isVisible(),false);
    assert.equal(await page.locator('.duration-control').count(),0);
    await page.evaluate(()=>{promptInput.innerHTML='<b>图片提示词</b>';settings.count=3;settings.ratio='wide';});
    await page.getByRole('button',{name:'编辑视频生成提示词'}).click();
    assert.equal(await page.locator('#composerHeading').textContent(),'视频生成');
    assert.equal(await page.locator('#apiKindToggle').isVisible(),false);
    assert.equal(await page.locator('.duration-control').count(),1);
    assert.equal(await page.locator('#promptInput').textContent(),'');
    assert.equal(await page.evaluate(()=>settings.apiKind),'video');
    await page.evaluate(()=>{promptInput.textContent='视频提示词';settings.videoDuration=10;});
    await page.getByRole('button',{name:'编辑图片生成提示词'}).click();
    assert.equal(await page.locator('#promptInput').innerHTML(),'<b>图片提示词</b>');
    assert.deepEqual(await page.evaluate(()=>({kind:settings.apiKind,count:settings.count,ratio:settings.ratio,videoText:videoGenerator.promptDraftText,duration:videoGenerator.runSettings.videoDuration})),{kind:'image',count:3,ratio:'wide',videoText:'视频提示词',duration:10});
    await page.evaluate(()=>apiKindToggle.querySelector('[data-kind="video"]').click());
    assert.equal(await page.evaluate(()=>settings.apiKind),'image');
    assert.deepEqual(errors,[]);
});

test('generation identity, prompt settings and connections survive save/reload and workflow import; legacy nodes remain flexible',async t=>{
    const {page,errors,record}=await generationCanvas(t);
    const expected=await page.evaluate(async()=>{
        smartComposer.setDraftForNode(imageGenerator,'图片草稿');
        smartComposer.setDraftForNode(videoGenerator,'视频草稿');
        connectInputNode(imageGenerator.id,videoGenerator.id);
        clearSelection();render();
        await saveCanvas({force:true});
        return {ids:nodes.map(n=>n.id),connections:canvas.connections};
    });
    assert.deepEqual(record.nodes.map(n=>n.generationKind),['image','video']);
    assert.deepEqual(record.nodes.map(n=>n.promptDraftText),['图片草稿','视频草稿']);
    await page.reload();await page.waitForFunction(()=>canvas?.id==='canvas-test' && nodes.length===2);
    assert.deepEqual(await page.evaluate(()=>nodes.map(n=>n.generationKind)),['image','video']);
    assert.deepEqual(await page.evaluate(()=>canvas.connections),expected.connections);
    const imported=await page.evaluate(()=>{
        const payload=normalizeImportedSmartWorkflow({nodes:nodes.map(serializableSmartNode),connections:canvas.connections});
        insertSmartWorkflowIntoCanvas(payload);
        const added=nodes.filter(n=>!payload.nodes.some(original=>original.id===n.id));
        return {count:nodes.length,kinds:added.map(n=>n.generationKind),drafts:added.map(n=>n.promptDraftText),settings:added.map(n=>n.runSettings.apiKind),connections:canvas.connections.length};
    });
    assert.deepEqual(imported,{count:4,kinds:['image','video'],drafts:['图片草稿','视频草稿'],settings:['image','video'],connections:2});
    await page.evaluate(()=>{window.legacy=createNode(1000,600);});
    assert.equal(await page.locator('#apiKindToggle').isVisible(),true);
    await page.locator('#apiKindToggle [data-kind="video"]').click();
    assert.equal(await page.evaluate(()=>settings.apiKind),'video');
    assert.equal(await page.evaluate(()=>legacy.generationKind),undefined);
    assert.deepEqual(errors,[]);
});

test('actual generation dispatch respects fixed node kind even when imported settings disagree',async t=>{
    const {page,errors,writes}=await generationCanvas(t);
    const requests=await page.evaluate(async()=>{
        window.generationRequests=[];
        runApiGeneration=async(prompt,refs,config)=>{generationRequests.push({kind:'image',apiKind:config.apiKind,model:config.model,prompt});throw new Error('Mock provider stopped');};
        runApiVideoGeneration=async(prompt,refs,config)=>{generationRequests.push({kind:'video',apiKind:config.apiKind,model:config.videoModel,prompt});throw new Error('Mock provider stopped');};
        for(const node of [imageGenerator,videoGenerator]){
            node.runSettings.apiKind=node.generationKind==='image'?'video':'image';
            smartSelection.createdNode(node.id);render();
            promptInput.textContent=node.generationKind+' request';savePromptDraftForCurrent();
            await runGeneration();
        }
        // Chain execution must use the same fixed kind as manual generation.
        const target=createNode(1000,600,[],{select:false});
        videoGenerator.runSettings.apiKind='image';
        try{await runCascadeStepIntoNode(videoGenerator,target,[]);}catch(error){if(error.message!=='Mock provider stopped')throw error;}
        return generationRequests;
    });
    assert.deepEqual(requests,[
        {kind:'image',apiKind:'image',model:'image-model',prompt:'image request'},
        {kind:'video',apiKind:'video',model:'video-model',prompt:'video request'},
        {kind:'video',apiKind:'video',model:'video-model',prompt:'video request'}
    ]);
    assert.equal(writes.filter(w=>w.path.includes('/image-tasks')||w.path.includes('/video-tasks')).length,0);
    assert.deepEqual(errors,[]);
});
