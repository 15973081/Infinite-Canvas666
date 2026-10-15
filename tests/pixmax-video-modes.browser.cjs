const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function setup(t,kinds=[],{same=false,model='doubao-seedance-2-5-pro'}={}){
    const f=await fixture(t,'smart',true,{secureOrigin:true});
    await f.page.evaluate(({kinds,same,model})=>{
        apiProviders=[{id:'p',name:'视频模式验收',enabled:true,has_key:true,protocol:'volcengine',video_models:[model]}];Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});
        window.modeNode=createGenerationNodeAt({x:440,y:100},'video');Object.assign(modeNode.runSettings,{engine:'api',apiKind:'video',videoProvider:'p',videoModel:model,videoDuration:5,videoResolution:'720p',videoAspect:'16:9'});
        window.modeSources=kinds.map((kind,index)=>{const node={id:uid('reference'),type:'smart-image',pixmaxSourceType:kind==='image'?'BASE_IMAGE':kind==='video'?'BASE_VIDEO':'BASE_AUDIO',x:index*250,y:0,images:[{url:kind==='image'?'/test-image.svg'+(same?'':'?frame='+index):'/output/reference-'+kind+index+'.mp4',kind,duration:8,name:'素材'+index}]};nodes.push(node);canvas.connections.push({from:node.id,to:modeNode.id,kind:'input'});return node;});render();
    },{kinds,same,model});await f.page.getByRole('tablist',{name:'视频生成模式',exact:true}).waitFor({timeout:2500}).catch(async error=>{throw Error(error.message+'; '+JSON.stringify(await f.page.evaluate(()=>({notices:[...document.querySelectorAll('.toast,[role=status]')].map(node=>node.textContent),config:modeNode.runSettings,buttons:[...document.querySelectorAll('.pixmax-generation-controls button')].map(node=>({label:node.getAttribute('aria-label'),text:node.textContent,hidden:node.closest('[hidden]')?.outerHTML.slice(0,150)}))})))+'; '+JSON.stringify(f.errors));});return f;
}
async function choose(page,name){await page.getByRole('tablist',{name:'视频生成模式'}).getByRole('tab',{name,exact:true}).click();}
async function tasks(page){
    const calls=[],records=new Map();await page.addScriptTag({url:'/static/js/canvas-task-bindings.js'});await page.route('**/output/mode-result.mp4',route=>route.fulfill({contentType:'video/mp4',body:fs.readFileSync(path.join(__dirname,'fixtures/pixmax-audio-source.mp4'))}));
    await page.route('**/api/canvas-video-tasks**',route=>{
        if(route.request().method()==='POST'){const body=route.request().postDataJSON(),target=body.canvas_target;calls.push(body);const binding={version:3,canvas_id:body.canvas_id,canvas_kind:'smart',source_node_id:target.source_node_id,target_node_id:target.target_node_id,submitted_revision:target.base_revision,graph_sha256:target.input_sha256,request_sha256:'c'.repeat(64)},id=body.client_task_id;records.set(id,{id,status:'succeeded',canvas_edit_generation:1,canvas_binding:binding,result:{videos:['/output/mode-result.mp4']}});return route.fulfill({json:{task_id:id,status:'queued',canvas_binding:binding}});}
        return route.fulfill({json:records.get(new URL(route.request().url()).pathname.split('/').pop())});
    });return calls;
}
for(const [mode,kinds,roles] of [['文生视频',[],[]],['图生视频',['image'],['first_frame']],['首尾帧',['image','image'],['first_frame','last_frame']],['参考生视频',['image','video','audio'],['reference_image']]])test('native '+mode+' compiles distinct task inputs and preserves its selected mode',async t=>{
    const {page,errors,record}=await setup(t,kinds),calls=await tasks(page);await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('海边的摄影师');await choose(page,mode);
    if(mode==='首尾帧')await page.screenshot({path:'.local/pixmax-video-mode-frames.png'});
    await page.evaluate(()=>runGeneration());assert.equal(calls.length,1);assert.deepEqual(calls[0].images.map(image=>image.role),roles);assert.equal(calls[0].videos.length,kinds.filter(kind=>kind==='video').length);assert.equal(calls[0].audios.length,kinds.filter(kind=>kind==='audio').length);
    if(roles.includes('first_frame'))assert.equal(calls[0].aspect_ratio,'adaptive');assert.equal(await page.evaluate(()=>modeNode.images.length),1);await page.evaluate(()=>saveCanvas({force:true}));assert.ok(record.nodes.find(node=>node.generationKind==='video').runSettings.videoReferenceMode);assert.deepEqual(errors,[]);
});
test('native mode availability follows connected input types and rejects mixed frame inputs',async t=>{
    const {page,errors}=await setup(t,['image','audio']);const menu=page.getByRole('tablist',{name:'视频生成模式'});assert.equal(await menu.getByRole('tab',{name:'文生视频',exact:true}).isDisabled(),true);assert.equal(await menu.getByRole('tab',{name:'图生视频',exact:true}).isDisabled(),true);assert.equal(await menu.getByRole('tab',{name:'首尾帧',exact:true}).isDisabled(),true);assert.equal(await menu.getByRole('tab',{name:'参考生视频',exact:true}).isEnabled(),true);assert.deepEqual(errors,[]);
});
test('a disconnected tail frame prevents admission and preserves the explicit mode',async t=>{
    const {page,errors}=await setup(t,['image','image']),calls=await tasks(page);await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('首尾镜头');await choose(page,'首尾帧');await page.evaluate(()=>{canvas.connections=canvas.connections.filter(edge=>edge.from!==modeSources[1].id);render();});await page.evaluate(()=>runGeneration());assert.equal(calls.length,0);assert.equal(await page.evaluate(()=>modeNode.runSettings.videoReferenceMode),'firstAndLastFrame');assert.deepEqual(errors,[]);
});
test('first and last frames may deliberately use the same image in separate input slots',async t=>{
    const {page,errors}=await setup(t,['image','image'],{same:true}),calls=await tasks(page);await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('返回同一画面');await choose(page,'首尾帧');await page.evaluate(()=>runGeneration());assert.equal(calls.length,1);assert.equal(calls[0].images.length,2);assert.equal(calls[0].images[0].url,calls[0].images[1].url);assert.deepEqual(calls[0].images.map(image=>image.role),['first_frame','last_frame']);assert.deepEqual(errors,[]);
});
test('native frame input order follows the reference order and is visible in the actual payload',async t=>{
    const {page,errors}=await setup(t,['image','image']),calls=await tasks(page);await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('交换首尾');await page.evaluate(()=>{modeNode.mediaReferenceOrder=modeSources.slice().reverse().map(node=>smartMediaRefKey(node.images[0]));render();});await choose(page,'首尾帧');await page.evaluate(()=>runGeneration());assert.equal(calls.length,1);assert.match(calls[0].images[0].url,/frame=1/);assert.match(calls[0].images[1].url,/frame=0/);assert.deepEqual(errors,[]);
});
test('Seedance 2.0 frame mode preserves an explicitly selected aspect ratio',async t=>{
    const {page,errors}=await setup(t,['image','image'],{model:'doubao-seedance-2-0-260128'}),calls=await tasks(page);await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('首尾镜头');await choose(page,'首尾帧');await page.evaluate(()=>runGeneration());assert.equal(calls.length,1);assert.equal(calls[0].aspect_ratio,'16:9');assert.deepEqual(calls[0].images.map(image=>image.role),['first_frame','last_frame']);assert.deepEqual(errors,[]);
});

test('rerunning a frame generator keeps its original frame sources instead of treating the result as an input',async t=>{
    const {page,errors}=await setup(t,['image','image']),calls=await tasks(page);await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('首尾镜头');await choose(page,'首尾帧');await page.evaluate(()=>runGeneration());assert.equal(calls.length,1);
    await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('再次生成首尾镜头');await page.evaluate(()=>runGeneration());assert.equal(calls.length,2,JSON.stringify(await page.evaluate(()=>({notices:[...document.querySelectorAll('.toast,[role=status]')].map(node=>node.textContent),config:modeNode.runSettings}))));assert.deepEqual(calls[1].images,calls[0].images);assert.equal(calls[1].videos.length,0);assert.deepEqual(errors,[]);
});

test('frame mode reaches batch preview and rejects a reference change during review',async t=>{
    const {page,errors}=await setup(t,['image','image']),calls=await tasks(page);await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('批次首尾镜头');await choose(page,'首尾帧');
    await page.route('**/api/canvases/*/batch-preview',route=>route.fulfill({json:{prepared:route.request().postDataJSON().items.map(item=>({nodeId:item.node_id})),skipped:[],costs:{},unknownCount:0}}));
    const request=await page.evaluate(async()=>{document.activeElement?.blur();window.modeFrame=PixmaxCanvasFrames.create([modeNode.id,...modeSources.map(node=>node.id)]);window.modeBatch=await PixmaxBatchExecution.preview(modeFrame);return modeBatch.entries[0]?.request;});assert.ok(request);assert.deepEqual(request.images.map(image=>image.role),['first_frame','last_frame']);
    const error=await page.evaluate(async()=>{modeNode.mediaReferenceOrder=modeSources.slice().reverse().map(node=>smartMediaRefKey(node.images[0]));try{await PixmaxBatchExecution.submit(modeBatch);return 'unexpected';}catch(error){return error.message;}});assert.match(error,/已变化/);assert.equal(calls.length,0);assert.deepEqual(errors,[]);
});

test('copied frame workflows keep mode and remapped input roles',async t=>{
    const {page,errors}=await setup(t,['image','image']);await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('复制首尾镜头');await choose(page,'首尾帧');
    const result=await page.evaluate(async()=>{document.activeElement?.blur();smartSelection.insertedNodes([modeNode.id,...modeSources.map(node=>node.id)]);copySelectedNodes();const previous=new Set(nodes.map(node=>node.id));pasteNodes();const copy=nodes.find(node=>!previous.has(node.id)&&node.generationKind==='video'),request=buildPromptRequestForNode(copy,null),payload=await runApiVideoGeneration(request.prompt,request.refs,copy.runSettings,null,{preview:true});return {mode:copy.runSettings.videoReferenceMode,refs:payload.images,sourceIds:canvas.connections.filter(edge=>edge.to===copy.id).map(edge=>edge.from),oldIds:modeSources.map(node=>node.id)};});assert.equal(result.mode,'firstAndLastFrame');assert.deepEqual(result.refs.map(image=>image.role),['first_frame','last_frame']);assert.ok(result.sourceIds.every(id=>!result.oldIds.includes(id)));assert.deepEqual(errors,[]);
});

for(const [label,mode,duration] of [['视频编辑','edit',-1],['向后延长','extend_backward',5],['向前延长','extend_forward',5]])test('native '+label+' reaches a video task with the selected intent',async t=>{
    const {page,errors}=await setup(t,['video','image']),calls=await tasks(page);await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('调整黄昏光线');await choose(page,label);
    if(mode==='edit'){await page.getByRole('button',{name:'生成参数',exact:true}).click();assert.equal(await page.locator('[data-combo-selector-panel] input[aria-label="时长"]').isDisabled(),true);await page.keyboard.press('Escape');}
    await page.evaluate(()=>runGeneration());assert.equal(calls.length,1);assert.equal(calls[0].task_mode,mode);assert.equal(calls[0].duration,duration);assert.equal(calls[0].aspect_ratio,'adaptive');assert.equal(calls[0].videos.length,1);assert.equal(calls[0].images[0].role,'reference_image');assert.deepEqual(errors,[]);
});

test('extension preserves multiple video and audio references while native edit remains constrained',async t=>{
    const {page,errors}=await setup(t,['video','video','audio']),calls=await tasks(page);await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('延续光线');assert.equal(await page.getByRole('tablist',{name:'视频生成模式'}).getByRole('tab',{name:'视频编辑',exact:true}).isDisabled(),true);await page.getByRole('tablist',{name:'视频生成模式'}).getByRole('tab',{name:'向后延长',exact:true}).click();await page.evaluate(()=>runGeneration());assert.equal(calls.length,1);assert.equal(calls[0].videos.length,2);assert.equal(calls[0].audios.length,1);assert.deepEqual(errors,[]);
});

test('changing from video edit to Seedance 2.0 resets an unsupported saved mode',async t=>{
    const {page,errors}=await setup(t,['video']);await choose(page,'视频编辑');await page.evaluate(()=>{apiProviders[0].video_models.push('doubao-seedance-2-0-260128');PixmaxNativePrompt.sync();});await page.getByRole('button',{name:'生成模型',exact:true}).click();await page.locator('.pixmax-reshoot-model-options').getByRole('button',{name:/doubao-seedance-2-0-260128/}).click();assert.equal(await page.evaluate(()=>modeNode.runSettings.videoReferenceMode),'auto',await page.evaluate(()=>JSON.stringify({config:modeNode.runSettings,notice:document.getElementById('toast').textContent})));assert.equal(await page.evaluate(()=>modeNode.runSettings.videoTaskMode),'auto');assert.deepEqual(errors,[]);
});

test('native modes reject providers that only register Volcengine assets and proxy paths without role support',async t=>{
    const {page,errors}=await setup(t,['image']);const result=await page.evaluate(()=>{
        const config=modeNode.runSettings,provider=apiProviders[0];provider.protocol='openai';provider.avatar_registration={platform:'volcengine'};const registration=PixmaxVideoModes.supported(config);provider.protocol='volcengine';provider.base_url='https://supplier.invalid/proxy/generate';const proxy=PixmaxVideoModes.supported(config);provider.base_url='https://supplier.invalid/api/v3';const native=PixmaxVideoModes.supported(config);delete provider.protocol;delete provider.base_url;provider.video_capabilities={native_roles:true};const memberNative=PixmaxVideoModes.supported(config);provider.video_capabilities.native_roles=false;const memberProxy=PixmaxVideoModes.supported(config);return {registration,proxy,native,memberNative,memberProxy};});assert.deepEqual(result,{registration:false,proxy:false,native:true,memberNative:true,memberProxy:false});assert.deepEqual(errors,[]);
});

test('legacy video edit settings retain admission while native controls show effective automatic settings',async t=>{
    const {page,errors}=await setup(t,['video']),calls=await tasks(page);await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('调整旧视频');await page.evaluate(()=>{delete modeNode.runSettings.videoReferenceMode;modeNode.runSettings.videoTaskMode='edit';PixmaxNativePrompt.sync();});await page.getByRole('button',{name:'生成参数',exact:true}).click();const menu=page.locator('[data-combo-selector-panel]');assert.equal(await menu.locator('input[aria-label="时长"]').isDisabled(),true);const effective=await page.evaluate(()=>PixmaxGenerationParameters.data(modeNode,[]).value);assert.equal(effective.duration,'-1');assert.equal(effective.aspectRatio,'adaptive');await page.keyboard.press('Escape');await page.evaluate(()=>runGeneration());assert.equal(calls.length,1);assert.equal(calls[0].task_mode,'edit');assert.deepEqual(errors,[]);
});

for(const kinds of [[],['image'],['video']])test('automatic video reruns retain upstream inputs: '+JSON.stringify(kinds),async t=>{
    const {page,errors}=await setup(t,kinds),calls=await tasks(page);
    await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('保持原本的镜头输入');
    await page.evaluate(()=>runGeneration());assert.equal(calls.length,1);
    await page.evaluate(()=>runGeneration());assert.equal(calls.length,2);
    assert.deepEqual(calls[1].images,calls[0].images);assert.deepEqual(calls[1].videos,calls[0].videos);
    assert.equal(calls[1].videos.includes('/output/mode-result.mp4'),false);assert.deepEqual(errors,[]);
});

test('Draft uses its own mode contract and unknown suffixes never inherit full model capabilities',async t=>{
    const {page,errors}=await setup(t,['video'],{model:'doubao-seedance-2-5-draft'});
    const menu=page.getByRole('tablist',{name:'视频生成模式'});assert.equal(await menu.getByRole('tab',{name:'视频编辑',exact:true}).count(),0);assert.equal(await menu.getByRole('tab',{name:'向后延长',exact:true}).count(),0);
    const result=await page.evaluate(()=>({unknown:PixmaxVideoModes.supported({...modeNode.runSettings,videoModel:'doubao-seedance-2-5-pro-custom'}),draftError:(()=>{try{PixmaxVideoModes.choose(modeNode,modeNode.runSettings,'videoEdit');return '';}catch(error){return error.message;}})()}));
    assert.equal(result.unknown,false);assert.match(result.draftError,/不支持视频编辑/);assert.deepEqual(errors,[]);
});

test('switching from edit to a generic video model clears incompatible task intent',async t=>{
    const {page,errors}=await setup(t,['video']);await choose(page,'视频编辑');
    await page.evaluate(()=>{apiProviders[0].video_models.push('generic-video');PixmaxNativePrompt.sync();});
    await page.getByRole('button',{name:'生成模型',exact:true}).click();await page.locator('.pixmax-reshoot-model-options').getByRole('button',{name:/generic-video/}).click();
    assert.deepEqual(await page.evaluate(()=>({model:modeNode.runSettings.videoModel,mode:modeNode.runSettings.videoReferenceMode,task:modeNode.runSettings.videoTaskMode})),{model:'generic-video',mode:'auto',task:'auto'});assert.deepEqual(errors,[]);
});

test('conflicting saved native mode and task type block submission',async t=>{
    const {page,errors}=await setup(t,['video']),calls=await tasks(page);
    await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('保留参考视频');await choose(page,'参考生视频');
    await page.evaluate(()=>{modeNode.runSettings.videoTaskMode='edit';render();});await page.evaluate(()=>runGeneration());
    assert.equal(calls.length,0);assert.match(await page.locator('#toast').textContent(),/任务类型冲突/);assert.deepEqual(errors,[]);
});

test('native reference roles take precedence over an inherited legacy frame flag',async t=>{
    const {page,errors}=await setup(t,['image']);await choose(page,'参考生视频');
    const payload=await page.evaluate(async()=>{
        delete apiProviders[0].protocol;apiProviders[0].video_capabilities={native_roles:true};modeNode.runSettings.videoUseFrameRoles=true;
        const request=buildPromptRequestForNode(modeNode,null);return runApiVideoGeneration('保留图片参考',request.refs,modeNode.runSettings,null,{preview:true});
    });
    assert.deepEqual(payload.images.map(image=>image.role),['reference_image']);assert.deepEqual(errors,[]);
});

test('native video import remaps rich references, retains frame intent and saves the executable draft',async t=>{
    const {page,errors,record}=await setup(t,[]);
    const result=await page.evaluate(async()=>{
        const native={nodes:[{uuid:'head',type:'BASE_IMAGE',defaultAsset:{type:'IMAGE',webUrl:'/test-image.svg?head'}},{uuid:'tail',type:'BASE_IMAGE',defaultAsset:{type:'IMAGE',webUrl:'/test-image.svg?tail'}},{uuid:'target',type:'GENERATE_VIDEO',prevNodeUuids:['head','tail'],params:{model:'PIXDANCE_2_5',referModel:'firstAndLastFrame',aspectRatio:'16:9',resolution:'720P',duration:'5',prompt:'从 %%@[首帧][image][0](head)%% 过渡到 %%@[尾帧][image][1](tail)%%'}}]};
        insertSmartWorkflowIntoCanvas(native);const imported=nodes.find(node=>node.pixmaxSourceType==='GENERATE_VIDEO');
        Object.assign(imported.runSettings,{videoProvider:'p',videoModel:'doubao-seedance-2-5-pro',videoGenerateAudio:false});
        const request=buildPromptRequestForNode(imported,null),payload=await runApiVideoGeneration(request.prompt,request.refs,imported.runSettings,null,{preview:true});
        await saveCanvas({force:true});return {payload,prompt:imported.nativePrompt.prompt,id:imported.id,sourceIds:canvas.connections.filter(edge=>edge.to===imported.id).map(edge=>edge.from)};
    });
    assert.deepEqual(result.payload.images.map(image=>image.role),['first_frame','last_frame']);assert.equal(result.payload.aspect_ratio,'adaptive');assert.match(result.payload.prompt,/图片1.*图片2/);
    assert.ok(result.sourceIds.every(id=>result.prompt.includes('('+id+')')));assert.ok(!result.prompt.includes('(head)'));assert.ok(!result.prompt.includes('(tail)'));
    const saved=record.nodes.find(node=>node.id===result.id);assert.equal(saved.nativePrompt.prompt,result.prompt);assert.equal(saved.runSettings.videoReferenceMode,'firstAndLastFrame');assert.deepEqual(errors,[]);
});
