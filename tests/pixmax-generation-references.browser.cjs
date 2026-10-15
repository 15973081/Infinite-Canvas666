const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');
const subjects=require('./helpers/pixmax-subject-library.cjs');
async function setup(t,kinds=['text','image','audio','video'],options={}){
    const f=await fixture(t,'smart',true,{secureOrigin:true,permissions:['canvas.read','canvas.create','canvas.edit','asset.read','asset.manage']});
    await f.page.route('**/output/native-reference-video*.mp4',route=>route.fulfill({contentType:'video/mp4',body:fs.readFileSync(path.join(__dirname,'fixtures/pixmax-audio-source.mp4'))}));
    await f.page.route('**/output/native-reference-audio*.mp3',route=>route.fulfill({contentType:'audio/mpeg',body:fs.readFileSync(path.join(__dirname,'fixtures/pixmax-generated-audio.mp3'))}));
    await options.beforeCreate?.(f.page);
    await f.page.evaluate(({kinds,same})=>{
        apiProviders=[{id:'p',name:'原生输入验收',enabled:true,has_key:true,protocol:'volcengine',image_models:['gpt-image-2'],video_models:['doubao-seedance-2-5-pro']}];
        Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});
        window.referenceTarget=createGenerationNodeAt({x:500,y:100},'video');Object.assign(referenceTarget.runSettings,{engine:'api',apiKind:'video',videoProvider:'p',videoModel:'doubao-seedance-2-5-pro',videoResolution:'720p',videoDuration:5,videoAspect:'16:9',videoReferenceMode:'referToVideo',videoTaskMode:'auto'});
        window.referenceSources=kinds.map((kind,index)=>{const source={id:uid('source'),type:kind==='text'?'smart-prompt':'smart-image',pixmaxSourceType:kind==='text'?'BASE_TEXT':kind==='image'?'BASE_IMAGE':kind==='audio'?'BASE_AUDIO':'BASE_VIDEO',label:'素材'+index,x:index*230,y:0,text:kind==='text'?'剧情'+index:undefined,images:kind==='text'?[]:[{url:kind==='image'?'/test-image.svg'+(same?'':'?ref='+index):'/output/native-reference-'+kind+index+(kind==='video'?'.mp4':'.mp3'),kind,name:'素材'+index,duration:8}]};nodes.push(source);canvas.connections.push({from:source.id,to:referenceTarget.id,kind:'input'});return source;});render();
    },{kinds,same:!!options.same});
    if(options.ready!==false)await f.page.locator('#composer.pixmax-native-form-active').waitFor();return f;
}
const area=page=>page.locator('.pixmax-native-generation-references');
const cards=page=>area(page).locator('[data-source-node-order-item]');

test('native source cards show all four input types and insert a stable typed mention',async t=>{
    const {page,errors}=await setup(t);assert.equal(await cards(page).count(),4);assert.equal(await page.locator('#inputThumbsRow').isVisible(),false);assert.equal(await page.locator('#inputPromptPreview').isVisible(),false);
    await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('黄昏');await area(page).getByRole('button',{name:/引用 图片1/}).click();await page.waitForFunction(()=>referenceTarget.nativePrompt.prompt.includes('%%@['),null,{timeout:2500}).catch(async error=>{throw Error(error.message+'; '+JSON.stringify(await page.evaluate(()=>({prompt:referenceTarget.nativePrompt,buttons:[...document.querySelectorAll('.pixmax-native-generation-references button')].map(button=>button.getAttribute('aria-label')),text:document.querySelector('.pixmax-native-prompt [role=textbox]').innerHTML}))));});
    const result=await page.evaluate(()=>({prompt:referenceTarget.nativePrompt.prompt,request:buildPromptRequest(referenceTarget)}));assert.match(result.prompt,/\[image\]\[0\]/);assert.match(result.request.prompt,/图片1/);assert.equal(result.request.refs.length,3);assert.deepEqual(errors,[]);await page.screenshot({path:'.local/pixmax-native-reference-cards.png'});
});

test('native disconnect removes one source from generation while retaining its canvas media',async t=>{
    const {page,errors}=await setup(t,['image','image']);const id=await page.evaluate(()=>referenceSources[0].id);await area(page).locator('[data-source-node-id="'+id+'"]').hover();await area(page).locator('[data-source-node-id="'+id+'"]').getByRole('button',{name:'断开参考连接',exact:true}).click();assert.equal(await cards(page).count(),1);
    const result=await page.evaluate(()=>({refs:buildPromptRequest(referenceTarget).refs.length,source:nodes.find(node=>node.id===referenceSources[0].id).images.length,blocked:referenceTarget.blockedInputRefs.length}));assert.deepEqual(result,{refs:1,source:1,blocked:1});assert.deepEqual(errors,[]);
});

test('native first and last frame labels retain two independent slots for an identical image',async t=>{
    const {page,errors}=await setup(t,['image','image'],{same:true});await page.getByRole('button',{name:'视频生成模式',exact:true}).click();await page.locator('.pixmax-reshoot-model-options').getByRole('button',{name:'首尾帧',exact:true}).click();assert.equal(await cards(page).count(),2);assert.equal(await area(page).getByRole('button',{name:/引用 首帧/}).count(),1);assert.equal(await area(page).getByRole('button',{name:/引用 尾帧/}).count(),1);assert.equal(await area(page).getByText('图片',{exact:true}).count(),2);assert.deepEqual(errors,[]);
});

test('native inputs disable editing and disconnect actions after edit ownership is lost',async t=>{
    const {page,errors}=await setup(t,['image']);await page.evaluate(()=>MemberCanvasEdit.setEditable(false));await page.waitForFunction(()=>[...document.querySelectorAll('.pixmax-native-generation-references button')].every(button=>button.disabled));assert.equal(await page.evaluate(()=>referenceTarget.blockedInputRefs),undefined);assert.deepEqual(errors,[]);
});

test('native cards disconnect a text input and invalidate its existing rich mention',async t=>{
    const {page,errors}=await setup(t,['text','image']);await area(page).getByRole('button',{name:/引用 文本1/}).click();await page.waitForFunction(()=>referenceTarget.nativePrompt?.prompt.includes('[text]'));const id=await page.evaluate(()=>referenceSources[0].id);await area(page).locator('[data-source-node-id="'+id+'"]').hover();await area(page).locator('[data-source-node-id="'+id+'"]').getByRole('button',{name:'断开参考连接',exact:true}).click();assert.equal(await cards(page).count(),1);
    const result=await page.evaluate(()=>{try{buildPromptRequest(referenceTarget);return 'unexpected';}catch(error){return error.message;}});assert.match(result,/失效参考/);assert.equal(await page.evaluate(()=>nodes.some(node=>node.id===referenceSources[0].id)),true);assert.deepEqual(errors,[]);
});

test('native cards from a subject disconnect the complete subject and its hidden input nodes',async t=>{
    const {page,errors}=await setup(t,[]),catalog=await subjects(page);await page.getByRole('button',{name:'主体库',exact:true}).click();const library=page.getByRole('dialog',{name:'主体库',exact:true});await library.getByText('摄影师主体',{exact:true}).waitFor();await library.locator('[data-subject-cards] .group').hover();await library.getByRole('button',{name:'应用',exact:true}).click();await library.waitFor({state:'detached'});assert.equal(await cards(page).count(),4);await cards(page).first().hover();await cards(page).first().getByRole('button',{name:'断开参考连接',exact:true}).click();assert.equal(await cards(page).count(),0);assert.equal(await page.evaluate(()=>nodes.filter(node=>node.subjectReference).length),0);assert.equal(await page.evaluate(()=>referenceTarget.nativePrompt.subjects.length),0);assert.ok(catalog.id);assert.deepEqual(errors,[]);
});

test('native reference cards release the old composer on selection and restore the legacy area on close',async t=>{
    const {page,errors}=await setup(t,['image']);await page.evaluate(()=>{window.otherReferenceTarget=createGenerationNodeAt({x:900,y:100},'image');});await page.waitForFunction(()=>activeComposerNode()===otherReferenceTarget&&document.querySelectorAll('.pixmax-native-generation-form').length===1);assert.equal(await cards(page).count(),0);await page.evaluate(()=>{smartSelection.clear();render();});await page.waitForFunction(()=>!document.querySelector('.pixmax-native-generation-references'));assert.equal(await page.evaluate(()=>composer.classList.contains('pixmax-native-form-active')),false);assert.deepEqual(errors,[]);
});

async function moveFirstRight(page){
    const item=cards(page).first().locator('xpath=ancestor-or-self::*[@tabindex][1]');await item.focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowRight');await page.keyboard.press('Space');
}
test('native keyboard sorting changes frame roles while the rich mention keeps its original source',async t=>{
    const {page,errors}=await setup(t,['image','image']);await page.getByRole('button',{name:'视频生成模式',exact:true}).click();await page.locator('.pixmax-reshoot-model-options').getByRole('button',{name:'首尾帧',exact:true}).click();await area(page).getByRole('button',{name:/引用 首帧/}).click();await moveFirstRight(page);
    await page.waitForFunction(()=>PixmaxReshootReferences.plan(referenceTarget).entries[0].nodeId===referenceSources[1].id,null,{timeout:2500});
    const result=await page.evaluate(async()=>{const request=buildPromptRequest(referenceTarget);return {prompt:referenceTarget.nativePrompt.prompt,source:referenceSources[0].id,payload:await runApiVideoGeneration(request.prompt,request.refs,referenceTarget.runSettings,null,{preview:true})};});assert.ok(result.prompt.includes(result.source));assert.match(result.payload.images[0].url,/ref=1/);assert.deepEqual(result.payload.images.map(image=>image.role),['first_frame','last_frame']);assert.deepEqual(errors,[]);
});

test('native text sorting updates the actual prompt order and keeps a typed mention bound to its source',async t=>{
    const {page,errors}=await setup(t,['text','text','image']);await area(page).getByRole('button',{name:/引用 文本1/}).click();await moveFirstRight(page);await page.waitForFunction(()=>PixmaxReshootReferences.plan(referenceTarget).entries[0].nodeId===referenceSources[1].id,null,{timeout:2500});
    const result=await page.evaluate(()=>({prompt:referenceTarget.nativePrompt.prompt,source:referenceSources[0].id,body:buildPromptRequest(referenceTarget).prompt}));assert.ok(result.prompt.includes(result.source));assert.match(result.body,/文本1：剧情1/);assert.match(result.body,/文本2：剧情0/);assert.deepEqual(errors,[]);
});

test('native video hover previews use the original player and release it with the composer',async t=>{
    const {page,errors}=await setup(t,['video']);await area(page).getByRole('button',{name:/引用 视频1/}).hover();await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(video=>!video.closest('#world')&&video.src.includes('native-reference-video0.mp4')&&video.readyState>=1));
    const preview=await page.evaluate(()=>{const video=[...document.querySelectorAll('video')].find(video=>!video.closest('#world')&&video.src.includes('native-reference-video0.mp4'));return video.src;});assert.match(preview,/native-reference-video0\.mp4/);
    await page.evaluate(()=>{smartSelection.clear();render();});await page.waitForFunction(()=>![...document.querySelectorAll('video')].some(video=>!video.closest('#world')&&video.src.includes('native-reference-video0.mp4')));assert.deepEqual(errors,[]);
});

test('opaque registered assets retain reference cards without opening an unsupported media preview',async t=>{
    const {page,errors}=await setup(t,['image']),before=await page.locator('video').count();await page.evaluate(()=>{referenceSources[0].images[0].url='asset://native-opaque-image';referenceSources[0].images[0].originalLocalUrl='/test-image.svg';render();});await area(page).getByRole('button',{name:/引用 图片1/}).hover();assert.equal(await cards(page).count(),1);assert.equal(await page.locator('video').count(),before);assert.deepEqual(errors,[]);
});

test('a delayed native reference mount cannot attach an old composer after selection changes',async t=>{
    const {page,errors}=await setup(t,['image'],{ready:false,beforeCreate:page=>page.evaluate(async()=>{
        const {canvasSegmentReshoot:api}=await import('/static/vendor/pixmax/editors.js'),original=api.mountGenerationForm;let release;const gate=new Promise(resolve=>release=resolve);window.releaseNativeReferences=release;window.nativeReferencesEntered=0;api.mountGenerationForm=async(...args)=>{nativeReferencesEntered++;await gate;return original(...args);};
    })});await page.waitForFunction(()=>nativeReferencesEntered===1);await page.evaluate(()=>{window.lateReferenceOwner=createGenerationNodeAt({x:900,y:100},'image');});await page.waitForFunction(()=>nativeReferencesEntered===2);await page.evaluate(()=>releaseNativeReferences());await page.locator('#composer.pixmax-native-form-active').waitFor();assert.equal(await page.locator('.pixmax-native-generation-references').count(),0);assert.equal(await cards(page).count(),0);assert.equal(await page.evaluate(()=>activeComposerNode()===lateReferenceOwner),true);assert.deepEqual(errors,[]);
});

test('many native inputs scroll in a narrow viewport while the editor and generate controls stay reachable',async t=>{
    const {page,errors}=await setup(t,Array(30).fill('image'));await page.setViewportSize({width:390,height:844});await page.evaluate(()=>render());const box=await area(page).boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390&&box.height<=240);const scroll=await area(page).evaluate(root=>({height:root.clientHeight,scrollHeight:root.scrollHeight}));assert.ok(scroll.scrollHeight>scroll.height);await area(page).evaluate(root=>root.scrollTop=root.scrollHeight);assert.equal(await cards(page).count(),30);await page.getByRole('button',{name:'生成',exact:true}).scrollIntoViewIfNeeded();const reachable=await page.evaluate(()=>{const button=document.querySelector('[data-native-generation-submit]'),box=button.getBoundingClientRect();return document.elementFromPoint(box.x+box.width/2,box.y+box.height/2)?.closest('[data-native-generation-submit]')===button;});assert.equal(reachable,true);await page.screenshot({path:'.local/pixmax-native-reference-mobile.png'});assert.deepEqual(errors,[]);
});

test('native mouse dragging changes the actual image reference order without moving source nodes',async t=>{
    const {page,errors}=await setup(t,['image','image']);const before=await page.evaluate(()=>referenceSources.map(source=>({id:source.id,x:source.x,y:source.y}))),first=await cards(page).first().boundingBox(),second=await cards(page).nth(1).boundingBox();await page.mouse.move(first.x+first.width/2,first.y+first.height/2);await page.mouse.down();await page.mouse.move(second.x+second.width/2,second.y+second.height/2,{steps:12});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.mouse.up();await page.waitForFunction(()=>PixmaxReshootReferences.plan(referenceTarget).entries[0].nodeId===referenceSources[1].id,null,{timeout:2500});assert.deepEqual(await page.evaluate(()=>referenceSources.map(source=>({id:source.id,x:source.x,y:source.y}))),before);assert.deepEqual(errors,[]);
});

test('a stale native finalize event cannot reintroduce a disconnected reference',async t=>{
    const {page,errors}=await setup(t,['image','image']);await page.evaluate(()=>window.staleReferenceCards=PixmaxReshootReferences.plan(referenceTarget).resources.map(entry=>({id:entry.id,type:entry.kind,data:{url:entry.media.url}})));await cards(page).first().hover();await cards(page).first().getByRole('button',{name:'断开参考连接',exact:true}).click();await cards(page).first().locator('xpath=ancestor-or-self::*[@role="list"][1]').evaluate(zone=>zone.dispatchEvent(new CustomEvent('finalize',{detail:{items:staleReferenceCards},bubbles:true})));await page.waitForFunction(()=>document.querySelectorAll('.pixmax-native-generation-references [data-source-node-order-item]').length===1);assert.equal(await page.evaluate(()=>PixmaxReshootReferences.plan(referenceTarget).resources.length),1);assert.equal(await page.evaluate(()=>referenceTarget.mediaReferenceOrder),undefined);assert.deepEqual(errors,[]);
});

test('native hover preview follows a canvas pan without rebuilding reference cards',async t=>{
    const {page,errors}=await setup(t,['video']);await area(page).getByRole('button',{name:/引用 视频1/}).hover();await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(video=>!video.closest('#world')&&video.src.includes('native-reference-video0.mp4')));const before=await page.evaluate(()=>{
        const video=[...document.querySelectorAll('video')].find(video=>!video.closest('#world')&&video.src.includes('native-reference-video0.mp4'));let popup=video;while(popup&&getComputedStyle(popup).position!=='fixed')popup=popup.parentElement;window.nativePanPopup=popup;window.nativePanCard=document.querySelector('.pixmax-native-generation-references [data-source-node-order-item]');return popup.getBoundingClientRect().x;
    });await page.evaluate(()=>{viewport.x+=12;applyViewport();});await page.waitForFunction(x=>Math.abs(nativePanPopup.getBoundingClientRect().x-x-12)<1,before,{timeout:2500});assert.equal(await page.evaluate(()=>document.querySelector('.pixmax-native-generation-references [data-source-node-order-item]')===nativePanCard),true);assert.deepEqual(errors,[]);
});


test('native prompt input fingerprints survive reference label refresh and repeated saves',async t=>{
    const {page,errors}=await setup(t,['image']);await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('画面人物');await area(page).getByRole('button',{name:/引用 图片1/}).click();await page.addScriptTag({url:'/static/js/canvas-task-bindings.js'});const result=await page.evaluate(async()=>{savePromptDraftForCurrent();const read=()=>CanvasTaskBindings.graphCanonical(smartTaskInputDocument(),referenceTarget.id,referenceTarget.id),before=read();renderInputThumbsRow(referenceTarget);const afterLabels=read();await saveCanvas({force:true});return {before,afterLabels,afterSave:read(),prompt:referenceTarget.nativePrompt.prompt};});assert.equal(result.afterLabels,result.before);assert.equal(result.afterSave,result.before);assert.match(result.prompt,/%%@\[/);assert.deepEqual(errors,[]);
});
