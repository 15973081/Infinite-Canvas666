const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function setup(t,model='qwen-image-edit-plus',kind='image'){
    const f=await fixture(t,'smart',true,{secureOrigin:true});
    await f.page.evaluate(({model,kind})=>{
        apiProviders=[{id:'contract',name:'模型约束',enabled:true,has_key:true,image_models:kind==='image'?[model]:[],video_models:kind==='video'?[model]:[]}];
        Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});
        window.contractNode=createGenerationNodeAt({x:400,y:100},kind);Object.assign(contractNode.runSettings,{engine:'api',apiKind:kind,provider_id:'contract',model,videoProvider:'contract',videoModel:model,videoDuration:5,videoAspect:'16:9',videoResolution:'720p'});render();
    },{model,kind});
    await f.page.locator('.pixmax-native-generation-form [role=textbox]').waitFor();await f.page.addScriptTag({url:'/static/js/canvas-task-bindings.js'});return f;
}
async function add(page,kinds){
    await page.evaluate(kinds=>{
        window.contractSources=kinds.map((kind,index)=>{
            const source={id:uid('source'),type:kind==='text'?'smart-prompt':'smart-image',x:index*260,y:500,label:'参考'+index,text:kind==='text'?'剧情':undefined,images:kind==='text'?[]:[{kind,url:kind==='image'?'/test-image.svg?ref='+index:'/output/contract-'+index+'.'+(kind==='video'?'mp4':'mp3'),name:'参考'+index,duration:5}]};
            nodes.push(source);canvas.connections.push({from:source.id,to:contractNode.id,kind:'input'});return source;
        });render();
    },kinds);
}
const submit=page=>page.locator('.pixmax-native-generation-form [data-native-generation-submit]');

test('Qwen edit requires an image, recovers through a connected image, and admits the actual image task',async t=>{
    const {page,errors,record}=await setup(t);await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('让陶瓷猫戴上帽子');
    assert.equal(await submit(page).isDisabled(),true);
    await assert.rejects(page.evaluate(()=>PixmaxBatchExecution.prepare(contractNode,'image')),/图片参考数量为 0/);
    await add(page,['image']);
    await page.waitForFunction(()=>!document.querySelector('.pixmax-native-generation-form [data-native-generation-submit]').disabled);
    const calls=[],records=new Map();
    await page.route('**/api/canvas-image-tasks**',route=>{
        if(route.request().method()==='POST'){
            const body=route.request().postDataJSON(),target=body.canvas_target,id='canvas_img_contract';calls.push(body);
            const binding={version:3,canvas_id:body.canvas_id,canvas_kind:'smart',source_node_id:target.source_node_id,target_node_id:target.target_node_id,submitted_revision:target.base_revision,graph_sha256:target.input_sha256,request_sha256:'b'.repeat(64)};
            records.set(id,{id,status:'succeeded',canvas_edit_generation:1,canvas_binding:binding,result:{images:['/test-image.svg']}});return route.fulfill({json:{task_id:id,status:'queued',canvas_binding:binding}});
        }
        return route.fulfill({json:records.get(new URL(route.request().url()).pathname.split('/').pop())});
    });
    await page.evaluate(()=>runGeneration());assert.equal(calls.length,1);assert.equal(calls[0].model,'qwen-image-edit-plus');assert.equal(calls[0].reference_images.length,1);assert.match(calls[0].prompt,/戴上帽子/);
    await page.evaluate(()=>saveCanvas({force:true}));assert.ok(record.nodes.some(node=>node.nativePrompt?.prompt.includes('戴上帽子')));assert.deepEqual(errors,[]);
});
test('MiniMax text-only image generation refuses a connected image in normal, batch and cascading admission',async t=>{
    const {page,errors,writes}=await setup(t,'minimax-image-01');await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('陶瓷猫');await add(page,['image']);
    assert.equal(await submit(page).isDisabled(),true);const before=await page.evaluate(()=>nodes.length);await page.evaluate(()=>runGeneration());assert.equal(await page.evaluate(()=>nodes.length),before);
    await assert.rejects(page.evaluate(()=>PixmaxBatchExecution.prepare(contractNode,'image')),/图片参考数量为 1/);
    await assert.rejects(page.evaluate(()=>{const request=buildPromptRequest(contractNode);return generateUrlsForCurrentSettings(contractNode,request.prompt,request.refs,smartSettingsForNode(contractNode));}),/图片参考数量为 1/);
    assert.equal(writes.filter(write=>write.path.includes('/canvas-image-tasks')).length,0);
    const card=page.locator('.pixmax-native-generation-references [data-source-node-order-item]').first();await card.hover();await card.getByRole('button',{name:'断开参考连接',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('.pixmax-native-generation-form [data-native-generation-submit]').disabled);
    const preview=await page.evaluate(()=>PixmaxBatchExecution.prepare(contractNode,'image'));assert.equal(preview.reference_images.length,0);assert.deepEqual(errors,[]);
});
test('Wan 2.6 rejects a combined image/video overflow and accepts the same graph after removing one reference',async t=>{
    const {page,errors}=await setup(t,'Wan 2.6','video');await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('海边的摄影师');await add(page,['image','image','image','video','video','video']);
    assert.equal(await submit(page).isDisabled(),true);await assert.rejects(page.evaluate(()=>PixmaxBatchExecution.prepare(contractNode,'video')),/允许 0–5 份/);
    const issues=await page.evaluate(()=>PixmaxGenerationParameters.inputIssues(contractNode));assert.equal(issues.length,1);assert.equal(issues[0].sourceIds.length,6);
    const card=page.locator('.pixmax-native-generation-references [data-source-node-order-item]').last();await card.hover();await card.getByRole('button',{name:'断开参考连接',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('.pixmax-native-generation-form [data-native-generation-submit]').disabled);
    const preview=await page.evaluate(()=>PixmaxBatchExecution.prepare(contractNode,'video'));assert.equal(preview.images.length,3);assert.equal(preview.videos.length,2);assert.deepEqual(errors,[]);
    await page.screenshot({path:'.local/pixmax-model-contract-wan.png'});
});
test('invalid references stay editable so the user can select a compatible model and save the repaired draft',async t=>{
    const {page,errors,record}=await setup(t,'minimax-image-01');await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('保留人物姿态');await add(page,['image']);assert.equal(await submit(page).isDisabled(),true);
    await page.evaluate(()=>{apiProviders[0].image_models.push('qwen-image-edit-plus');PixmaxNativePrompt.sync();});await page.getByRole('button',{name:'生成模型',exact:true}).click();await page.locator('.pixmax-reshoot-model-options').getByRole('button',{name:/qwen-image-edit-plus/}).click();
    await page.waitForFunction(()=>!document.querySelector('.pixmax-native-generation-form [data-native-generation-submit]').disabled);await page.evaluate(()=>saveCanvas({force:true}));
    const saved=record.nodes.find(node=>node.id===record.nodes[0].id);assert.equal(saved.runSettings.model,'qwen-image-edit-plus');assert.equal(saved.nativePrompt.prompt,'保留人物姿态');assert.deepEqual(errors,[]);
});

test('losing edit ownership while the public contract loads cannot admit a late ordinary task',async t=>{
    const {page,errors,writes}=await fixture(t,'smart',true,{secureOrigin:true});let release,entered;
    const gate=new Promise(resolve=>release=resolve),pending=new Promise(resolve=>entered=resolve);
    await page.route('**/static/vendor/pixmax/generation-schema.json',async route=>{entered();await gate;await route.fallback();});
    await page.evaluate(()=>{
        apiProviders=[{id:'contract',name:'模型约束',enabled:true,has_key:true,image_models:['minimax-image-01']}];
        Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});
        window.contractNode=createGenerationNodeAt({x:400,y:100},'image');Object.assign(contractNode.runSettings,{engine:'api',apiKind:'image',provider_id:'contract',model:'minimax-image-01'});render();
    });
    await pending;await page.locator('#promptInput').fill('等待模型约束时的草稿');const running=page.evaluate(()=>runGeneration());
    await page.evaluate(()=>MemberCanvasEdit.setEditable(false));release();await running;
    assert.equal(writes.filter(write=>write.path.includes('/canvas-image-tasks')).length,0);
    assert.equal(await page.evaluate(()=>contractNode.nativePrompt.prompt),'等待模型约束时的草稿');assert.deepEqual(errors,[]);
});

test('reference error details tolerate imported source IDs that are object property names',async t=>{
    const {page,errors}=await setup(t,'minimax-image-01');await add(page,['image']);
    await page.evaluate(()=>{const previous=contractSources[0].id;contractSources[0].id='__proto__';canvas.connections.find(edge=>edge.from===previous).from='__proto__';render();});
    await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('纯文本图像生成');assert.equal(await submit(page).isDisabled(),true);
    assert.equal(await page.locator('.pixmax-native-generation-references [data-source-node-order-item]').count(),1);
    await page.screenshot({path:'.local/pixmax-model-contract-invalid.png'});assert.deepEqual(errors,[]);
});
