const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');
const catalog=require('./helpers/pixmax-subject-library.cjs');
const fs=require('node:fs'),path=require('node:path');
async function setup(t,kind='image',options={}){
    const result=await fixture(t,'smart',true,{secureOrigin:true,permissions:['canvas.read','canvas.create','canvas.edit','asset.read','asset.manage']});
    await options.beforeCreate?.(result.page);
    await result.page.evaluate(kind=>{
        apiProviders=[{id:'p',name:'测试供应商',has_key:true,enabled:true,image_models:['gpt-image-2'],video_models:['doubao-seedance-2-5-pro'],protocol:'volcengine'}];
        Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});
        window.promptNode=createGenerationNodeAt({x:400,y:100},kind);Object.assign(promptNode.runSettings,{engine:'api',apiKind:kind,provider_id:'p',model:'gpt-image-2',videoProvider:'p',videoModel:'doubao-seedance-2-5-pro',videoTaskMode:'auto',videoAspect:'16:9',videoDuration:5,videoResolution:'720p'});render();
    },kind);
    if(options.ready!==false)await result.page.locator('.pixmax-native-prompt [data-native-prompt-host] [role=textbox]').waitFor();return result;
}
test('native floating prompt owns its editor while viewing does not persist a new prompt state',async t=>{
    const {page,errors}=await setup(t);
    assert.equal(await page.evaluate(()=>promptNode.nativePrompt),undefined);
    assert.equal(await page.getByRole('textbox',{name:'生成提示词',exact:true}).count(),1);
    await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('黄昏的城市');
    assert.equal(await page.evaluate(()=>promptNode.nativePrompt.prompt),'黄昏的城市');
    await page.evaluate(()=>saveCanvas({force:true}));assert.equal(await page.evaluate(()=>promptNode.promptDraftText),'黄昏的城市');assert.deepEqual(errors,[]);
});
test('native image prompt inserts a camera hash and sends its decoded body through the host builder',async t=>{
    const {page,errors}=await setup(t);await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('摄影棚肖像');
    await page.getByRole('button',{name:'相机',exact:true}).click();const panel=page.getByRole('dialog');await panel.waitFor();await panel.locator('header button').click();
    assert.equal(await page.locator('.pixmax-native-prompt [data-hash-type=camera]').count(),1);
    const request=await page.evaluate(()=>buildPromptRequest(promptNode));assert.match(request.prompt,/摄影棚肖像/);assert.match(request.prompt,/Canon EOS R5 Mark II/);assert.ok(!request.prompt.includes('%%#['));assert.deepEqual(errors,[]);
    await page.screenshot({path:'.local/pixmax-native-image-prompt.png'});
});
test('native video prompt applies a scoped subject and compiles all four input types',async t=>{
    const {page,errors}=await setup(t,'video'),api=await catalog(page);await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('电影中的人物');
    await page.getByRole('button',{name:'主体库',exact:true}).click();const library=page.getByRole('dialog',{name:'主体库',exact:true});await library.getByText('摄影师主体',{exact:true}).waitFor();await library.locator('[data-subject-cards] .group').hover();await library.getByRole('button',{name:'应用',exact:true}).click();await library.waitFor({state:'detached'});
    assert.equal(await page.locator('.pixmax-native-prompt [data-editor-node-type=subject-reference]').count(),1);
    const request=await page.evaluate(()=>buildPromptRequest(promptNode));assert.equal(request.refs.length,3);assert.match(request.prompt,/摄影师主体（文本1、图片1、音频1、视频1）/);assert.ok(!request.prompt.includes(api.id));assert.deepEqual(errors,[]);
    await page.screenshot({path:'.local/pixmax-native-video-prompt.png'});
});

async function tasks(page,kind){
    const calls=[],records=new Map(),endpoint='/api/canvas-'+kind+'-tasks';
    if(kind==='video')await page.route('**/output/native-result.mp4',route=>route.fulfill({contentType:'video/mp4',body:fs.readFileSync(path.join(__dirname,'fixtures/pixmax-audio-source.mp4'))}));
    await page.route('**'+endpoint+'**',route=>{
        if(route.request().method()==='POST'){
            const body=route.request().postDataJSON(),target=body.canvas_target;calls.push(body);const id=body.client_task_id||'canvas_img_'+String(calls.length),binding={version:3,canvas_id:body.canvas_id,canvas_kind:'smart',source_node_id:target.source_node_id,target_node_id:target.target_node_id,submitted_revision:target.base_revision,graph_sha256:target.input_sha256,request_sha256:'b'.repeat(64)};
            records.set(id,{id,status:'succeeded',canvas_edit_generation:1,canvas_binding:binding,result:kind==='image'?{images:['/test-image.svg']}:{videos:['/output/native-result.mp4']}});return route.fulfill({json:{task_id:id,status:'queued',canvas_binding:binding}});
        }
        return route.fulfill({json:records.get(new URL(route.request().url()).pathname.split('/').pop())});
    });return calls;
}
for(const kind of ['image','video'])test('native '+kind+' prompt admits a bound task and preserves its canonical draft',async t=>{
    const {page,errors,record}=await setup(t,kind),calls=await tasks(page,kind);
    await page.addScriptTag({url:'/static/js/canvas-task-bindings.js'});await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('夕阳中的树林');
    await page.evaluate(()=>runGeneration());await page.waitForFunction(()=>promptNode.images.length===1).catch(async error=>{throw Error(error.message+'; '+JSON.stringify({calls,diagnostic:await page.evaluate(()=>({notices:[...document.querySelectorAll('.toast,[role=status]')].map(node=>node.textContent),settings:promptNode.runSettings,pending:promptNode.pendingTasks}))}));});assert.equal(calls.length,1);assert.match(calls[0].prompt,/夕阳中的树林/);
    await page.evaluate(()=>saveCanvas({force:true}));assert.equal(record.nodes.find(node=>node.id===calls[0].canvas_target.source_node_id).nativePrompt.prompt,'夕阳中的树林');assert.deepEqual(errors,[]);
});
test('native prompt switches owners without copying drafts and survives host undo',async t=>{
    const {page,errors}=await setup(t);await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('第一节点');
    const original=await page.evaluate(()=>promptNode.id);await page.evaluate(()=>{window.secondPrompt=createGenerationNodeAt({x:800,y:100},'image');render();});await page.waitForFunction(()=>document.querySelector('.pixmax-native-prompt [role=textbox]')?.textContent.replace(/\u200B/g,'').trim()==='');
    await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('第二节点');assert.equal(await page.evaluate(()=>promptNode.nativePrompt.prompt),'第一节点');
    await page.evaluate(()=>{performUndo();});await page.waitForFunction(()=>document.querySelector('.pixmax-native-prompt [role=textbox]')?.textContent.replace(/\u200B/g,'').trim()==='');
    await page.evaluate(id=>{smartSelection.createdNode(id);render();},original);await page.waitForFunction(()=>document.querySelector('.pixmax-native-prompt [role=textbox]')?.textContent==='第一节点');assert.deepEqual(errors,[]);
});
test('native prompt is readonly after lease loss and camera closes without losing the stored hash',async t=>{
    const {page,errors}=await setup(t);await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('保存的草稿');await page.getByRole('button',{name:'相机',exact:true}).click();const panel=page.getByRole('dialog');await panel.waitFor();
    await page.evaluate(()=>MemberCanvasEdit.setEditable(false));await panel.waitFor({state:'detached'});await page.waitForFunction(()=>document.querySelector('.pixmax-native-prompt [role=textbox]')?.getAttribute('contenteditable')==='false');
    assert.equal(await page.evaluate(()=>promptNode.nativePrompt.prompt),'保存的草稿');assert.deepEqual(errors,[]);
});

test('typing into the fallback during first runtime load survives native editor mounting',async t=>{
    let entered,release;const loading=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
    const {page,errors}=await setup(t,'image',{ready:false,beforeCreate:page=>page.route('**/static/vendor/pixmax/editors.js',async route=>{entered();await gate;await route.fallback();})});
    await loading;await page.locator('#promptInput').fill('首次加载期间的输入');release();
    await page.getByRole('textbox',{name:'生成提示词',exact:true}).waitFor();
    assert.equal(await page.getByRole('textbox',{name:'生成提示词',exact:true}).innerText(),'首次加载期间的输入');
    assert.equal(await page.evaluate(()=>promptNode.nativePrompt.prompt),'首次加载期间的输入');assert.deepEqual(errors,[]);
});

test('closing the subject library without applying keeps an untouched video draft unmodified',async t=>{
    const {page,errors}=await setup(t,'video');await catalog(page);
    await page.getByRole('button',{name:'主体库',exact:true}).click();const library=page.getByRole('dialog',{name:'主体库',exact:true});await library.getByText('摄影师主体',{exact:true}).waitFor();
    await library.getByRole('button',{name:'关闭主体库',exact:true}).click();
    assert.equal(await page.evaluate(()=>promptNode.nativePrompt),undefined);assert.deepEqual(errors,[]);
});

test('native at picker connects a canvas image and a removed connection blocks task submission',async t=>{
    const {page,errors}=await setup(t),calls=await tasks(page,'image');
    await page.evaluate(()=>{const source=createNode(0,0,[{url:'/test-image.svg',kind:'image'}],{select:false,deferRender:true});source.label='画布人物';render();});
    const editor=page.getByRole('textbox',{name:'生成提示词',exact:true});await editor.click();await editor.pressSequentially('@');const picker=page.locator('[data-rich-editor-insertion-panel]');await picker.waitFor();await picker.locator('input').fill('画布人物');await picker.getByRole('button',{name:/画布人物/}).click();
    await page.waitForFunction(()=>promptNode.nativePrompt?.prompt.includes('[image]'));
    assert.equal(await page.locator('.pixmax-native-prompt [data-editor-node-type=at-mention]').count(),1);
    const request=await page.evaluate(()=>buildPromptRequest(promptNode));assert.equal(request.refs.length,1);assert.match(request.prompt,/图片1/);assert.ok(!request.prompt.includes('%%@['));
    await page.evaluate(()=>{canvas.connections=canvas.connections.filter(edge=>edge.to!==promptNode.id);render();});await page.evaluate(()=>runGeneration());assert.equal(calls.length,0);assert.ok(await page.locator('.toast').filter({hasText:'失效参考'}).count());assert.deepEqual(errors,[]);
});

test('copying a native subject prompt includes its hidden typed inputs and independent copies fail closed',async t=>{
    const {page,errors}=await setup(t,'video');await catalog(page);await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('摄影师');
    await page.getByRole('button',{name:'主体库',exact:true}).click();const library=page.getByRole('dialog',{name:'主体库',exact:true});await library.getByText('摄影师主体',{exact:true}).waitFor();await library.locator('[data-subject-cards] .group').hover();await library.getByRole('button',{name:'应用',exact:true}).click();await library.waitFor({state:'detached'});
    const result=await page.evaluate(()=>{
        document.activeElement?.blur();smartSelection.insertedNodes([promptNode.id]);copySelectedNodes();const original=new Set(nodes.map(node=>node.id));pasteNodes();
        const copy=nodes.find(node=>!original.has(node.id)&&node.nativePrompt),sources=nodes.filter(node=>!original.has(node.id)&&node.hidden),request=buildPromptRequest(copy);
        smartSelection.insertedNodes([promptNode.id]);copySelectedNodes();const connectedIds=new Set(nodes.map(node=>node.id));pasteNodes({includeConnections:false});const independent=nodes.find(node=>!connectedIds.has(node.id)&&node.nativePrompt);let rejected=false;try{buildPromptRequest(independent);}catch(error){rejected=/主体输入连接/.test(error.message);}
        return {copyId:copy.id,sourceCount:sources.length,refs:request.refs.length,prompt:request.prompt,rejected};
    });
    assert.equal(result.sourceCount,4);assert.equal(result.refs,3);assert.match(result.prompt,/摄影师主体（文本1、图片1、音频1、视频1）/);assert.equal(result.rejected,true);assert.deepEqual(errors,[]);
});

test('a subject changed after selection is refreshed before admitting an ordinary video task',async t=>{
    const {page,errors}=await setup(t,'video'),catalogApi=await catalog(page),calls=await tasks(page,'video');await page.addScriptTag({url:'/static/js/canvas-task-bindings.js'});
    await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('人物转身');await page.getByRole('button',{name:'主体库',exact:true}).click();const library=page.getByRole('dialog',{name:'主体库',exact:true});await library.getByText('摄影师主体',{exact:true}).waitFor();await library.locator('[data-subject-cards] .group').hover();await library.getByRole('button',{name:'应用',exact:true}).click();await library.waitFor({state:'detached'});
    catalogApi.change(group=>{group.name='更新摄影师';group.items[0].text='人物换上了红色外套';});await page.evaluate(()=>runGeneration());assert.equal(await page.evaluate(()=>promptNode.images.length),1,JSON.stringify({calls,details:await page.evaluate(()=>({notices:[...document.querySelectorAll('.toast,[role=status]')].map(node=>node.textContent),logs:canvas.logs,prompt:promptNode.nativePrompt.prompt}))}));
    assert.equal(calls.length,1);assert.match(calls[0].prompt,/更新摄影师/);assert.match(calls[0].prompt,/人物换上了红色外套/);assert.equal(calls[0].images.length,1);assert.equal(calls[0].audios.length,1);assert.equal(calls[0].videos.length,1);assert.deepEqual(errors,[]);
});

test('switching scope while a subject is being resolved prevents a late ordinary task',async t=>{
    const {page,errors}=await setup(t,'video'),catalogApi=await catalog(page),calls=await tasks(page,'video');await page.addScriptTag({url:'/static/js/canvas-task-bindings.js'});
    await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('人物转身');await page.getByRole('button',{name:'主体库',exact:true}).click();const library=page.getByRole('dialog',{name:'主体库',exact:true});await library.getByText('摄影师主体',{exact:true}).waitFor();await library.locator('[data-subject-cards] .group').hover();await library.getByRole('button',{name:'应用',exact:true}).click();await library.waitFor({state:'detached'});
    const pending=catalogApi.hold(),running=page.evaluate(()=>runGeneration());await pending;await page.evaluate(()=>{CanvasSession.context.workspace.id='other-space';PixmaxNativePrompt.sync();});catalogApi.release();await running;
    assert.equal(calls.length,0);assert.equal(await page.locator('.pixmax-native-prompt [data-editor-node-type=subject-reference]').count(),1);assert.deepEqual(errors,[]);
});

for(const change of ['selection','model'])test('changing '+change+' during ordinary subject resolution preserves the new owner and admits no task',async t=>{
    const {page,errors}=await setup(t,'video'),catalogApi=await catalog(page),calls=await tasks(page,'video');await page.addScriptTag({url:'/static/js/canvas-task-bindings.js'});
    await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('人物转身');await page.getByRole('button',{name:'主体库',exact:true}).click();const library=page.getByRole('dialog',{name:'主体库',exact:true});await library.getByText('摄影师主体',{exact:true}).waitFor();await library.locator('[data-subject-cards] .group').hover();await library.getByRole('button',{name:'应用',exact:true}).click();await library.waitFor({state:'detached'});
    const pending=catalogApi.hold(),running=page.evaluate(()=>runGeneration());await pending;
    await page.evaluate(change=>{if(change==='selection'){window.newOwner=createGenerationNodeAt({x:800,y:100},'image');render();}else{promptNode.runSettings.videoDuration=10;settings.videoDuration=10;}},change);
    catalogApi.release();await running;assert.equal(calls.length,0);assert.equal(await page.evaluate(()=>Boolean(promptNode.pending)),false);
    if(change==='selection')assert.equal(await page.evaluate(()=>activeComposerNode()===newOwner&&settings.apiKind==='image'),true);
    else assert.equal(await page.evaluate(()=>promptNode.runSettings.videoDuration),10);assert.deepEqual(errors,[]);
});

test('native creation entries follow image versus video and configured subject capability',async t=>{
    const {page,errors}=await setup(t);assert.equal(await page.getByRole('button',{name:'相机',exact:true}).isVisible(),true);assert.equal(await page.getByRole('button',{name:'主体库',exact:true}).count(),0);
    await page.evaluate(()=>{promptNode.generationKind='video';promptNode.runSettings.apiKind='video';settings.apiKind='video';render();});
    await page.getByRole('button',{name:'主体库',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'相机',exact:true}).count(),0);
    await page.evaluate(()=>{apiProviders[0].video_models.push('other-model');promptNode.runSettings.videoModel='other-model';settings.videoModel='other-model';PixmaxNativePrompt.sync();});assert.equal(await page.getByRole('button',{name:'主体库',exact:true}).count(),0);assert.deepEqual(errors,[]);
});

for(const changed of [false,true])test('ordinary native subject batch '+(changed?'rejects catalog changes after review':'refreshes inputs and admits one bound task'),async t=>{
    const {page,errors}=await setup(t,'video'),catalogApi=await catalog(page),calls=await tasks(page,'video');await page.addScriptTag({url:'/static/js/canvas-task-bindings.js'});
    await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('人物转身');await page.getByRole('button',{name:'主体库',exact:true}).click();const library=page.getByRole('dialog',{name:'主体库',exact:true});await library.getByText('摄影师主体',{exact:true}).waitFor();await library.locator('[data-subject-cards] .group').hover();await library.getByRole('button',{name:'应用',exact:true}).click();await library.waitFor({state:'detached'});
    await page.route('**/api/canvases/*/batch-preview',route=>route.fulfill({json:{prepared:route.request().postDataJSON().items.map(item=>({nodeId:item.node_id})),skipped:[],costs:{},unknownCount:0}}));
    catalogApi.change(group=>{group.name='批次摄影师';group.items[0].text='批次使用红色外套';});
    const request=await page.evaluate(async()=>{document.activeElement?.blur();const scene={id:uid('scene'),type:'smart-prompt',pixmaxSourceType:'BASE_TEXT',text:'分组说明',x:100,y:100,images:[]};nodes.push(scene);window.nativeFrame=PixmaxCanvasFrames.create([promptNode.id,scene.id]);window.nativeBatch=await PixmaxBatchExecution.preview(nativeFrame);return nativeBatch.entries[0]?.request;});assert.ok(request);assert.match(request.prompt,/批次摄影师/);assert.match(request.prompt,/批次使用红色外套/);assert.equal(request.images.length,1);assert.equal(request.audios.length,1);assert.equal(request.videos.length,1);
    if(changed){catalogApi.change(group=>{group.items[0].text='确认之后修改了';});const failure=await page.evaluate(async()=>{try{await PixmaxBatchExecution.submit(nativeBatch);return 'unexpected';}catch(error){return error.message;}});assert.match(failure,/主体目录已变化/);assert.equal(calls.length,0);}
    else{const result=await page.evaluate(()=>PixmaxBatchExecution.submit(nativeBatch));assert.equal(result.accepted.length,1,JSON.stringify(result));assert.equal(calls.length,1);await page.waitForFunction(()=>promptNode.images.length===1);}
    assert.deepEqual(errors,[]);
});

test('native image camera stays in a narrow viewport and Escape preserves its prompt',async t=>{
    const {page,errors}=await setup(t);await page.setViewportSize({width:390,height:844});await page.evaluate(()=>render());await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('移动屏幕草稿');
    await page.screenshot({path:'.local/pixmax-native-prompt-mobile.png'});
    await page.getByRole('button',{name:'相机',exact:true}).click();const panel=page.getByRole('dialog');await panel.waitFor();const bounds=await panel.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390);
    await panel.screenshot({path:'.local/pixmax-native-camera-mobile.png'});await page.keyboard.press('Escape');await panel.waitFor({state:'detached'});assert.equal(await page.getByRole('textbox',{name:'生成提示词',exact:true}).innerText(),'移动屏幕草稿');assert.deepEqual(errors,[]);
});
