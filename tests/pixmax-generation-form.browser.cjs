const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function host(t,{priced=false}={}){
    const f=await fixture(t,'smart',true,{secureOrigin:true});const quotes=[];await f.page.route('**/api/canvases/*/generation-preview**',route=>{quotes.push(route.request().postDataJSON());return route.fulfill({json:{cost:priced?{status:'estimated',currency:'CNY',amount_micros:150000,base_amount_micros:200000}:{status:'unknown'}}});});
    await f.page.evaluate(()=>{apiProviders=[{id:'p',name:'原生表单',has_key:true,enabled:true,image_models:['gpt-image-2']}];Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});window.formHost=createGenerationNodeAt({x:400,y:100},'image');Object.assign(formHost.runSettings,{engine:'api',apiKind:'image',provider_id:'p',model:'gpt-image-2'});render();});await f.page.locator('.pixmax-native-generation-form [role=textbox]').waitFor();return {...f,quotes};
}

for(const generator of [false,true])test(`standalone ${generator?'generation':'media'} video uses native mode tabs and reference cards instead of the legacy composer`,async t=>{
    const {page,errors,writes}=await fixture(t,'smart',false,{secureOrigin:true});
    await page.evaluate(generator=>{
        apiProviders=[{id:'p',name:'视频平台',enabled:true,has_key:true,protocol:'volcengine',video_models:['doubao-seedance-2-5-pro']}];
        window.videoFormNode=generator?createGenerationNodeAt({x:400,y:80},'video'):createNode(400,80,[{url:'/output/old-result.mp4',kind:'video',poster:'/test-image.svg'}],{select:true});
        videoFormNode.runSettings||={};
        Object.assign(videoFormNode.runSettings,{engine:'api',apiKind:'video',videoProvider:'p',videoModel:'doubao-seedance-2-5-pro',videoResolution:'720p',videoGenerateAudio:true});
        const source={id:'video-reference',type:'smart-image',x:40,y:80,images:[{url:'/output/reference.mp4',poster:'/test-image.svg',kind:'video',name:'参考视频',duration:8}]};
        nodes.push(source);canvas.connections.push({from:source.id,to:videoFormNode.id,kind:'input'});render();
    },generator);
    const modes=page.getByRole('tablist',{name:'视频生成模式'});
    await modes.waitFor({timeout:2500}).catch(async error=>{throw Error(error.message+'; '+JSON.stringify(await page.evaluate(()=>({selected:smartSelection.nodeId,config:videoFormNode.runSettings,resolved:smartSettingsForNode(videoFormNode),composer:composer.className,notices:document.getElementById('toast').textContent})))+'; '+JSON.stringify(errors));});assert.equal(await page.locator('#composer > .composer-card').isVisible(),false);
    assert.equal(await modes.getByRole('tab',{name:'文生视频',exact:true}).isDisabled(),true);
    await modes.getByRole('tab',{name:'参考生视频',exact:true}).click();
    assert.equal(await modes.getByRole('tab',{name:'参考生视频',exact:true}).getAttribute('aria-selected'),'true');
    await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('保持原视频人物和镜头');
    assert.equal(await page.evaluate(()=>videoFormNode.nativePrompt.prompt),'保持原视频人物和镜头');
    const request=await page.evaluate(()=>PixmaxBatchExecution.prepare(videoFormNode,'video'));
    assert.equal(request.prompt,'保持原视频人物和镜头');assert.deepEqual(request.videos,['/output/reference.mp4']);
    assert.equal(await page.locator('.pixmax-native-generation-references').getByRole('button',{name:/引用 视频1/}).count(),1);
    await page.getByRole('button',{name:'全屏',exact:true}).click();
    const modal=page.getByRole('dialog',{name:'全屏',exact:true});await modal.waitFor();
    assert.equal(await modal.getByRole('tab',{name:'参考生视频',exact:true}).getAttribute('aria-selected'),'true');
    await page.keyboard.press('Escape');await modal.waitFor({state:'detached'});
    if(generator)await page.screenshot({path:'.local/pixmax-video-native-tabs.png'});
    assert.equal(writes.filter(write=>/generation-preview|canvas-video-tasks|register-avatar/.test(write.path)).length,0);
    assert.deepEqual(errors,[]);
});
test('native fullscreen keeps a canonical prompt draft and restores it on closing',async t=>{
    const {page,errors}=await host(t);await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('开始的草稿');await page.getByRole('button',{name:'全屏',exact:true}).click();const modal=page.getByRole('dialog',{name:'全屏',exact:true});await modal.getByRole('textbox',{name:'生成提示词',exact:true}).waitFor({timeout:2000}).catch(async error=>{throw Error(error.message+'; '+JSON.stringify(errors)+'; '+JSON.stringify(await page.evaluate(()=>({notice:document.getElementById('toast').textContent,active:activeComposerNode()?.id,full:document.querySelector('[role=dialog]')?.outerHTML.slice(0,800)}))));});await modal.getByRole('textbox',{name:'生成提示词',exact:true}).fill('全屏继续编辑');await page.keyboard.press('Escape');await modal.waitFor({state:'detached'});assert.equal(await page.getByRole('textbox',{name:'生成提示词',exact:true}).innerText(),'全屏继续编辑');assert.equal(await page.evaluate(()=>formHost.nativePrompt.prompt),'全屏继续编辑');assert.deepEqual(errors,[]);await page.screenshot({path:'.local/pixmax-native-fullscreen-closed.png'});
});
test('native generate label shows a server estimate without submitting a task',async t=>{
    const {page,errors,quotes,writes}=await host(t,{priced:true});await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('估算草稿');await page.getByRole('button',{name:/生成 · 预计.*0\.15/}).waitFor();assert.ok(quotes.length>=1);assert.equal(quotes.at(-1).request.provider_id,'p');assert.equal(writes.filter(write=>/canvas-image-tasks/.test(write.path)).length,0);assert.deepEqual(errors,[]);
});
test('native fullscreen closes on edit ownership loss and cannot mutate the saved draft',async t=>{
    const {page,errors}=await host(t);await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('锁定前草稿');await page.getByRole('button',{name:'全屏',exact:true}).click();await page.getByRole('dialog',{name:'全屏',exact:true}).waitFor();await page.evaluate(()=>MemberCanvasEdit.setEditable(false));await page.getByRole('dialog',{name:'全屏',exact:true}).waitFor({state:'detached'});assert.equal(await page.evaluate(()=>formHost.nativePrompt.prompt),'锁定前草稿');assert.equal(await page.getByRole('button',{name:'生成模型',exact:true}).isDisabled(),true);assert.deepEqual(errors,[]);
});
test('native camera dialog can insert its hash into the full host form',async t=>{
    const {page,errors}=await host(t);await page.getByRole('button',{name:'相机',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();const info=await dialog.evaluate(root=>({tag:root.tagName,cls:root.className,z:getComputedStyle(root).zIndex,parent:root.parentElement.className,ancestors:[...function*(x){while(x){yield x;x=x.parentElement;}}(root)].slice(0,5).map(x=>({cls:x.className,z:getComputedStyle(x).zIndex,pos:getComputedStyle(x).position}))}));await dialog.locator('header button').click({timeout:2000}).catch(error=>{throw Error(error.message+'; '+JSON.stringify(info));});await page.waitForFunction(()=>formHost.nativePrompt?.prompt.includes('%%#[camera]'));assert.deepEqual(errors,[]);
});
test('host ordinary generation mounts the full native form and saves its typed prompt',async t=>{
    const {page,errors,record}=await fixture(t,'smart',true,{secureOrigin:true});await page.evaluate(()=>{apiProviders=[{id:'p',name:'测试供应商',has_key:true,enabled:true,image_models:['gpt-image-2']}];Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});window.fullFormNode=createGenerationNodeAt({x:400,y:100},'image');Object.assign(fullFormNode.runSettings,{engine:'api',apiKind:'image',provider_id:'p',model:'gpt-image-2'});render();});
    await page.locator('.pixmax-native-generation-form [role=textbox]').waitFor({timeout:2500}).catch(async error=>{throw Error(error.message+'; '+JSON.stringify(await page.evaluate(()=>({notices:document.getElementById('toast').textContent,html:composer.innerHTML.slice(-1400)})))+'; '+JSON.stringify(errors));});await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('黄昏的城市');assert.equal(await page.evaluate(()=>fullFormNode.nativePrompt.prompt),'黄昏的城市');await page.evaluate(()=>saveCanvas({force:true}));assert.equal(record.nodes.find(node=>node.id===record.nodes[0].id).nativePrompt.prompt,'黄昏的城市');assert.deepEqual(errors,[]);await page.screenshot({path:'.local/pixmax-full-native-form.png'});
});
test('native N1 form owns its model parameters prompt fullscreen and submit controls',async t=>{
    const {page,errors}=await fixture(t,'smart',true,{secureOrigin:true});await page.evaluate(async()=>{
        const {canvasSegmentReshoot:api}=await import('/static/vendor/pixmax/editors.js');const target=document.createElement('div');target.dataset.nativeFormTest='';target.style.cssText='position:absolute;top:120px;left:180px;width:720px;z-index:100';document.body.append(target);
        const select=(name,values)=>({name,type:'select',default:values[0],options:values.map(value=>({name:value,value}))});
        window.nativeFormData={schema:[{modelCode:'p:model',modelName:'测试供应商 · 模型',filedConfig:[{name:'prompt',type:'text',default:'',max:10000},select('resolution',['720p','1080p']),select('aspectRatio',['16:9','9:16']),select('count',['1','2'])],connectConstraint:[]}],value:{model:'p:model',prompt:'',resolution:'720p',aspectRatio:'16:9',count:'1'},modelOptions:[{value:'p:model',text:'测试供应商 · 模型'}],graph:{nodes:[{id:'target',type:'video-gen',data:{params:{model:'p:model'}}}],edges:[]},validation:{invalid:false,sourceDetails:{},summary:[],groups:[]},disabledFieldNames:[],referenceNames:{}};
        window.nativeFormSubmitted=0;window.nativeForm=await api.mountGenerationForm(target,{data:nativeFormData,nodeId:'target',formVariant:'video-gen',viewport:{x:0,y:0,scale:1},subjectApi:{},graphActions:{},onOpenAssets(){},onOpenSubjects(){},onOpenCamerawork(){},enabledProtocols:['at-mention','hash-rich','subject-reference'],onNotice:toast,onChange:next=>{nativeFormData={...nativeFormData,value:next};nativeForm.setData(nativeFormData);},onSubmit:async()=>nativeFormSubmitted++});
    });
    await page.locator('[data-native-form-test] .prompt-editor').fill('黄昏的城市');assert.equal(await page.evaluate(()=>nativeFormData.value.prompt),'黄昏的城市');
    await page.locator('[data-native-form-test]').getByRole('button',{name:'全屏',exact:true}).click();await page.getByRole('dialog',{name:'全屏',exact:true}).waitFor();
    await page.getByRole('dialog',{name:'全屏',exact:true}).getByRole('button',{name:'生成',exact:true}).click();await page.waitForFunction(()=>nativeFormSubmitted===1,null,{timeout:2000}).catch(error=>{throw Error(error.message+'; '+JSON.stringify(errors));});await page.getByRole('dialog',{name:'全屏',exact:true}).waitFor({state:'detached'});assert.deepEqual(errors,[]);
});


test('a late price estimate cannot overwrite the newly selected generation quantity',async t=>{
    const {page,errors}=await host(t);let release,entered,completed;const gate=new Promise(resolve=>release=resolve),pending=new Promise(resolve=>entered=resolve),settled=new Promise(resolve=>completed=resolve);t.after(()=>release());
    await page.route('**/api/canvases/*/generation-preview**',async route=>{const request=route.request().postDataJSON();if(request.request.n===1){entered();await gate;await route.fulfill({json:{cost:{status:'estimated',currency:'CNY',amount_micros:990000}}});completed();}else await route.fulfill({json:{cost:{status:'estimated',currency:'CNY',amount_micros:300000}}});});
    await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('切换数量的估算');await pending;await page.getByRole('button',{name:'生成数量',exact:true}).click();await page.locator('.pixmax-reshoot-model-options').getByRole('button',{name:'2张',exact:true}).click();await page.getByRole('button',{name:/生成 · 预计.*0\.30/}).waitFor();release();await settled;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await page.getByRole('button',{name:/生成 · 预计.*0\.30/}).count(),1);assert.equal(await page.evaluate(()=>formHost.runSettings.count),2);assert.deepEqual(errors,[]);
});

test('fullscreen camera uses scoped valid preferences and leaves the fullscreen draft open',async t=>{
    const {page,errors}=await host(t);await page.evaluate(()=>localStorage.setItem(CanvasSession.storageKey('pixmax-camera-preferences-v1'),JSON.stringify({indices:{camera:'invalid',lens:-1}})));await page.getByRole('button',{name:'全屏',exact:true}).click();const modal=page.getByRole('dialog',{name:'全屏',exact:true});await modal.getByRole('button',{name:'相机',exact:true}).click();const camera=page.locator('[data-native-camera]');await camera.locator('header button').click();await camera.waitFor({state:'detached'});assert.equal(await modal.isVisible(),true);assert.equal(await modal.locator('[data-hash-type=camera]').count(),1);await page.keyboard.press('Escape');await modal.waitFor({state:'detached'});assert.match(await page.evaluate(()=>formHost.nativePrompt.prompt),/%%#\[camera\]/);assert.deepEqual(errors,[]);
});


test('typing in the native form preserves unrelated node DOM and avoids whole canvas renders',async t=>{
    const {page,errors}=await host(t);await page.evaluate(()=>{for(let i=0;i<60;i++)nodes.push({id:uid('text'),type:'smart-prompt',text:'保持的文本'+i,x:i*250,y:900,images:[]});render();window.unrelatedNativeNode=document.querySelector('.image-node[data-id="'+nodes.at(-1).id+'"]');window.nativeTypingRenders=0;const original=render;window.render=(...args)=>{nativeTypingRenders++;return original(...args);};});await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('连续编辑原生提示词');assert.equal(await page.evaluate(()=>nativeTypingRenders),0);assert.equal(await page.evaluate(()=>unrelatedNativeNode===document.querySelector('.image-node[data-id="'+nodes.at(-1).id+'"]')),true);assert.equal(await page.evaluate(()=>formHost.nativePrompt.prompt),'连续编辑原生提示词');assert.deepEqual(errors,[]);
});
