const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function setup(t,kind='image'){
    const result=await fixture(t,'smart',true,{secureOrigin:true});
    await result.page.evaluate(kind=>{
        apiProviders=[{id:'p',name:'第一供应商',has_key:true,enabled:true,image_models:['gpt-image-2'],video_models:['doubao-seedance-2-5-pro'],protocol:'volcengine'},{id:'second',name:'第二供应商',has_key:true,enabled:true,image_models:['gpt-image-2'],video_models:['doubao-seedance-2-5-pro'],protocol:'volcengine',model_policies:{'video:doubao-seedance-2-5-pro':{resolutions:['480p'],duration_min:4,duration_max:8}}}];
        Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});
        window.generationNode=createGenerationNodeAt({x:440,y:100},kind);Object.assign(generationNode.runSettings,{engine:'api',apiKind:kind,provider_id:'p',model:'gpt-image-2',videoProvider:'p',videoModel:'doubao-seedance-2-5-pro',videoDuration:5,videoAspect:'16:9',videoResolution:'720p'});render();
    },kind);
    await result.page.getByRole('button',{name:'生成模型',exact:true}).waitFor();return result;
}
async function tasks(page,kind){
    const calls=[],records=new Map(),endpoint='/api/canvas-'+kind+'-tasks';
    await page.addScriptTag({url:'/static/js/canvas-task-bindings.js'});
    if(kind==='video')await page.route('**/output/native-result.mp4',route=>route.fulfill({contentType:'video/mp4',body:fs.readFileSync(path.join(__dirname,'fixtures/pixmax-audio-source.mp4'))}));
    await page.route('**'+endpoint+'**',route=>{
        if(route.request().method()==='POST'){
            const body=route.request().postDataJSON(),target=body.canvas_target;calls.push(body);const id=body.client_task_id||'canvas_img_'+calls.length,binding={version:3,canvas_id:body.canvas_id,canvas_kind:'smart',source_node_id:target.source_node_id,target_node_id:target.target_node_id,submitted_revision:target.base_revision,graph_sha256:target.input_sha256,request_sha256:'b'.repeat(64)};
            records.set(id,{id,status:'succeeded',canvas_edit_generation:1,canvas_binding:binding,result:kind==='image'?{images:['/test-image.svg']}:{videos:['/output/native-result.mp4']}});return route.fulfill({json:{task_id:id,status:'queued',canvas_binding:binding}});
        }
        return route.fulfill({json:records.get(new URL(route.request().url()).pathname.split('/').pop())});
    });return calls;
}
async function panel(page){await page.getByRole('button',{name:'生成参数',exact:true}).click();const panel=page.locator('[data-combo-selector-panel]');await panel.waitFor();return panel;}
test('native model selector distinguishes identical models by provider and preserves typed prompt',async t=>{
    const {page,errors,record}=await setup(t);await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('海边的陶瓷猫');await page.getByRole('button',{name:'生成模型',exact:true}).click();
    await page.locator('.pixmax-reshoot-model-options').getByRole('button',{name:/第二供应商 · gpt-image-2/}).click();
    assert.equal(await page.evaluate(()=>generationNode.runSettings.provider_id),'second');assert.equal(await page.getByRole('textbox',{name:'生成提示词',exact:true}).innerText(),'海边的陶瓷猫');
    await page.evaluate(()=>saveCanvas({force:true}));assert.equal(record.nodes.find(node=>node.id===record.nodes[0].id).runSettings.provider_id,'second');assert.deepEqual(errors,[]);
});
test('native image resolution quality and count reach the task payload and saved settings',async t=>{
    const {page,errors,record}=await setup(t),calls=await tasks(page,'image');await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('摄影棚陶瓷猫');const menu=await panel(page);
    await menu.getByRole('button',{name:'2K',exact:true}).click();await menu.getByRole('button',{name:'高',exact:true}).click();await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'生成数量',exact:true}).click();await page.locator('.pixmax-reshoot-model-options').getByRole('button',{name:'4张',exact:true}).click();
    await page.screenshot({path:'.local/pixmax-native-generation-image.png'});await page.evaluate(()=>runGeneration());assert.equal(calls.length,4);assert.ok(calls.every(call=>call.size==='2048x2048'&&call.quality==='high'&&call.n===1));
    await page.evaluate(()=>saveCanvas({force:true}));assert.equal(record.nodes.find(node=>node.id===record.nodes[0].id).runSettings.count,4);assert.deepEqual(errors,[]);
});
test('native video resolution sound and MOV reach an ordinary generation task',async t=>{
    const {page,errors}=await setup(t,'video'),calls=await tasks(page,'video');await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('海边的摄影师');const menu=await panel(page);
    await menu.getByRole('button',{name:'1080P',exact:true}).click();await menu.getByRole('button',{name:'Audio On',exact:true}).click();await menu.getByRole('button',{name:'MOV',exact:true}).click();await page.keyboard.press('Escape');
    await page.screenshot({path:'.local/pixmax-native-generation-video.png'});await page.evaluate(()=>runGeneration());assert.equal(calls.length,1);assert.equal(calls[0].resolution,'1080p');assert.equal(calls[0].generate_audio,true);assert.equal(calls[0].output_format,'mov');assert.deepEqual(errors,[]);
});
test('changing native video model applies the selected providers resolution and duration policy',async t=>{
    const {page,errors}=await setup(t,'video');await page.evaluate(()=>{generationNode.runSettings.videoDuration=15;settings.videoDuration=15;PixmaxNativePrompt.sync();});await page.getByRole('button',{name:'生成模型',exact:true}).click();await page.locator('.pixmax-reshoot-model-options').getByRole('button',{name:/第二供应商 · doubao/}).click();
    const config=await page.evaluate(()=>generationNode.runSettings);assert.equal(config.videoProvider,'second');assert.equal(config.videoResolution,'480p');assert.equal(config.videoDuration,8);const menu=await panel(page);assert.equal(await menu.getByRole('button',{name:'1080P',exact:true}).count(),0);assert.equal(await menu.getByRole('button',{name:'480P',exact:true}).count(),1);assert.deepEqual(errors,[]);
});
test('removing the selected provider never silently submits through a different provider',async t=>{
    const {page,errors}=await setup(t),calls=await tasks(page,'image');await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('保存的提示词');await page.evaluate(()=>{applySmartModelConfig({api_providers:apiProviders.filter(provider=>provider.id!=='p')});});await page.evaluate(()=>runGeneration());
    assert.equal(calls.length,0);assert.equal(await page.evaluate(()=>generationNode.runSettings.provider_id),'p');assert.equal(await page.getByRole('textbox',{name:'生成提示词',exact:true}).innerText(),'保存的提示词');assert.deepEqual(errors,[]);
});
test('native model options exclude hidden models and disable missing keys and stopped policies',async t=>{
    const {page,errors}=await setup(t);await page.evaluate(()=>{apiProviders.push({id:'hidden',name:'隐藏模型',enabled:true,has_key:true,image_models:['gpt-image-2'],model_policies:{'image:gpt-image-2':{visible:false}}},{id:'nokey',name:'未配置密钥',enabled:true,has_key:false,image_models:['gpt-image-2']},{id:'stopped',name:'停用模型',enabled:true,has_key:true,image_models:['gpt-image-2'],model_policies:{'image:gpt-image-2':{enabled:false}}});PixmaxNativePrompt.sync();});await page.getByRole('button',{name:'生成模型',exact:true}).click();const menu=page.locator('.pixmax-reshoot-model-options');assert.equal(await menu.getByRole('button',{name:/隐藏模型/}).count(),0);assert.equal(await menu.getByRole('button',{name:/未配置密钥/}).isDisabled(),true);assert.equal(await menu.getByRole('button',{name:/停用模型/}).isDisabled(),true);assert.deepEqual(errors,[]);
});
test('native parameter portal closes on edit ownership loss and cannot write a stale draft',async t=>{
    const {page,errors}=await setup(t);const before=await page.evaluate(()=>generationNode.runSettings.resolution),menu=await panel(page);await page.evaluate(()=>MemberCanvasEdit.setEditable(false));await menu.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>generationNode.runSettings.resolution),before);assert.equal(await page.getByRole('button',{name:'生成模型',exact:true}).isDisabled(),true);assert.deepEqual(errors,[]);
});
test('native generation controls fit a narrow viewport and Escape preserves the selected node',async t=>{
    const {page,errors}=await setup(t);const selected=await page.evaluate(()=>generationNode.id);await page.setViewportSize({width:390,height:844});await page.evaluate(()=>render());const menu=await panel(page),box=await menu.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390&&box.y>=0&&box.y+box.height<=844);await menu.screenshot({path:'.local/pixmax-native-generation-mobile.png'});await page.keyboard.press('Escape');await menu.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>smartSelection.nodeId),selected);assert.deepEqual(errors,[]);
});

test('native custom image dimensions reach the request without dropping the prompt',async t=>{
    const {page,errors}=await setup(t),calls=await tasks(page,'image');await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('自定义画幅');const menu=await panel(page);await menu.getByRole('button',{name:'自定义',exact:true}).click();
    await menu.locator('input[aria-label="宽度"]').fill('1536');await menu.locator('input[aria-label="宽度"]').press('Enter');await menu.locator('input[aria-label="高度"]').fill('1024');await menu.locator('input[aria-label="高度"]').press('Enter');await page.keyboard.press('Escape');await menu.waitFor({state:'detached'});
    await page.evaluate(()=>runGeneration());assert.equal(calls.length,1);assert.equal(calls[0].size,'1536x1024');assert.match(calls[0].prompt,/自定义画幅/);assert.deepEqual(errors,[]);
});

test('native duration input accepts a custom in-range value and sends it to the task',async t=>{
    const {page,errors}=await setup(t,'video'),calls=await tasks(page,'video');await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('长镜头');const menu=await panel(page);await menu.locator('input[aria-label="时长"]').fill('12');await menu.locator('input[aria-label="时长"]').press('Enter');await page.keyboard.press('Escape');await menu.waitFor({state:'detached'});
    await page.evaluate(()=>runGeneration());assert.equal(calls.length,1);assert.equal(calls[0].duration,12);assert.deepEqual(errors,[]);
});

test('a late schema load mounts controls only for the current composer owner',async t=>{
    const {page,errors}=await fixture(t,'smart',true,{secureOrigin:true});let release,entered;const gate=new Promise(resolve=>release=resolve),pending=new Promise(resolve=>entered=resolve);
    await page.route('**/static/vendor/pixmax/generation-schema.json',async route=>{entered();await gate;await route.fallback();});
    await page.evaluate(()=>{apiProviders=[{id:'p',name:'当前供应商',enabled:true,has_key:true,image_models:['gpt-image-2']}];window.first=createGenerationNodeAt({x:300,y:100},'image');});await pending;
    await page.locator('#promptInput').fill('第一份草稿');await page.evaluate(()=>{window.second=createGenerationNodeAt({x:600,y:100},'image');});release();await page.getByRole('button',{name:'生成模型',exact:true}).waitFor();
    assert.equal(await page.locator('.pixmax-native-generation-form').count(),1);assert.equal(await page.evaluate(()=>activeComposerNode()===second&&getComputedStyle(composer.querySelector('.composer-card')).display==='none'),true);assert.equal(await page.evaluate(()=>first.nativePrompt.prompt),'第一份草稿');assert.deepEqual(errors,[]);
});

test('native advanced video options retain the host watermark flag in the real request',async t=>{
    const {page,errors}=await setup(t,'video'),calls=await tasks(page,'video');await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('摄影师转身');await page.getByText('高级选项',{exact:true}).click();await page.locator('.pixmax-native-generation-form').getByRole('switch',{name:'水印',exact:true}).click();
    await page.evaluate(()=>runGeneration());assert.equal(calls.length,1);assert.equal(calls[0].watermark,true);assert.equal(await page.evaluate(()=>generationNode.runSettings.videoWatermark),true);assert.deepEqual(errors,[]);
});

test('a model with only custom image sizes initializes dimensions and remains usable',async t=>{
    const {page,errors}=await setup(t),calls=await tasks(page,'image');await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('方形陶瓷猫');await page.evaluate(()=>{apiProviders[1].model_policies['image:gpt-image-2']={resolutions:['custom']};PixmaxNativePrompt.sync();});await page.getByRole('button',{name:'生成模型',exact:true}).click();await page.locator('.pixmax-reshoot-model-options').getByRole('button',{name:/第二供应商 · gpt-image-2/}).click();
    assert.equal(await page.evaluate(()=>generationNode.runSettings.resolution),'custom');await page.evaluate(()=>runGeneration());assert.equal(calls.length,1);assert.equal(calls[0].provider_id,'second');assert.equal(calls[0].size,'1024x1024');assert.deepEqual(errors,[]);
});
