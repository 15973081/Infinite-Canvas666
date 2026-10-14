const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function setup(t){
    const result=await fixture(t,'smart',true,{secureOrigin:true});
    const {page}=result;
    await page.route('**/assets/annotation-source.mp4',route=>route.fulfill({path:path.resolve('tests/fixtures/pixmax-audio-source.mp4'),contentType:'video/mp4'}));
    await page.evaluate(()=>{
        Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});
        const source=createNode(500,150,[{url:'/assets/annotation-source.mp4',name:'实拍.mp4',kind:'video',natural_w:160,natural_h:90}],{select:false});window.annotationSourceId=source.id;
    });
    return result;
}
async function uploadService(page,{held=false,failFirst=false}={}){
    const files=[];let calls=0,release,seen;const gate=new Promise(resolve=>release=resolve),requested=new Promise(resolve=>seen=resolve);
    await page.route('**/api/ai/upload',async route=>{
        const request=route.request(),form=await new Request('http://upload.test',{method:'POST',headers:request.headers(),body:request.postDataBuffer()}).formData();
        const batch=[];
        for(const file of form.getAll('files')){const item={name:file.name,type:file.type,bytes:Buffer.from(await file.arrayBuffer())};files.push(item);batch.push({url:'/assets/annotation-'+(files.length-1)+'.png',name:item.name,kind:'image'});}
        calls++;seen();if(held)await gate;
        if(failFirst&&calls===1)return route.fulfill({status:503,json:{detail:'upload failed'}});
        return route.fulfill({json:{files:batch}});
    });
    await page.route('**/assets/annotation-*.png',route=>{
        const index=Number(new URL(route.request().url()).pathname.match(/annotation-(\d+)/)?.[1]),file=files[index];
        return file?route.fulfill({body:file.bytes,contentType:file.type}):route.fulfill({status:404,body:'missing'});
    });
    return {files,requested,release,calls:()=>calls};
}
async function drawMark(page){
    await page.evaluate(()=>runSmartNodeToolbarAction(annotationSourceId,'annotation'));
    const surface=page.locator('.pixmax-native-video-annotation canvas').first();await surface.waitFor();
    await page.waitForFunction(()=>document.querySelector('.pixmax-native-video-annotation video')?.readyState>=2);
    await page.getByRole('dialog',{name:'视频画面标记',exact:true}).getByRole('button',{name:'画笔颜色',exact:true}).click();
    await page.getByRole('button',{name:'#FFFFFF',exact:true}).click();
    await page.evaluate(()=>{const video=document.querySelector('.pixmax-native-video-annotation video'),base=document.createElement('canvas');base.width=video.videoWidth;base.height=video.videoHeight;const context=base.getContext('2d');context.drawImage(video,0,0);window.annotationBaseline={width:base.width,height:base.height,pixels:Array.from(context.getImageData(0,0,base.width,base.height).data)};});
    const box=await surface.boundingBox();assert.ok(box.width>50&&box.height>30);
    await page.mouse.move(box.x+box.width*.3,box.y+box.height*.4);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.6,{steps:12});await page.mouse.up();
    await page.waitForFunction(()=>PixmaxVideoAnnotation.hasUnfinishedWork());
}

test('native video drawing exports a PNG and creates a connected video editing draft with image mentions',async t=>{
    const {page,record,errors}=await setup(t),service=await uploadService(page);
    await drawMark(page);
    await page.screenshot({path:path.resolve('.local/pixmax-video-annotation.png')});
    await page.getByRole('dialog',{name:'视频画面标记',exact:true}).getByRole('button',{name:'保存',exact:true}).click();
    await page.locator('.pixmax-video-annotation-host').waitFor({state:'detached'});
    assert.equal(service.files.length,1);assert.equal(service.files[0].type,'image/png');assert.match(service.files[0].name,/^00:00-.*\.png$/);
    assert.equal(service.files[0].bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    require('fs').writeFileSync(path.resolve('.local/pixmax-annotation-result.png'),service.files[0].bytes);
    const pixels=await page.evaluate(async()=>{
        const image=await createImageBitmap(await (await fetch('/assets/annotation-0.png')).blob()),canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
        const context=canvas.getContext('2d');context.drawImage(image,0,0);const actual=context.getImageData(0,0,canvas.width,canvas.height).data;
        let painted=0;for(let y=35;y<44;y++)for(let x=48;x<59;x++){const index=(y*canvas.width+x)*4;if(actual[index+2]>annotationBaseline.pixels[index+2]+80&&actual[index]>130&&actual[index+1]>130)painted++;}
        const colorAt=(x,y)=>Array.from(actual.slice((y*canvas.width+x)*4,(y*canvas.width+x)*4+3));
        return {width:image.width,height:image.height,painted,untouched:colorAt(145,75)};
    });assert.deepEqual([pixels.width,pixels.height],[160,90]);assert.ok(pixels.painted>2,'PNG contains the drawn overlay: '+JSON.stringify(pixels));assert.ok(pixels.untouched[0]<40&&pixels.untouched[1]>180&&pixels.untouched[2]>180,'source color bars remain behind the marks');
    assert.equal(record.nodes.length,3);const image=record.nodes[1],gen=record.nodes[2];
    assert.equal(image.images[0].processingTool,'video-annotation');assert.equal(gen.generationKind,'video');assert.equal(gen.runSettings.videoTaskMode,'edit');
    assert.deepEqual(gen.annotationImageNodeIds,[image.id]);assert.equal(gen.annotationSourceNodeId,record.nodes[0].id);
    assert.match(gen.promptDraftHtml,/mention-image-token/);assert.ok(gen.promptDraftHtml.includes(image.id));assert.match(gen.pixmaxAnnotationPrompt,/%%@/);
    assert.deepEqual(record.connections.map(edge=>[edge.from,edge.to]),[[record.nodes[0].id,gen.id],[image.id,gen.id]]);
    const references=await page.evaluate(()=>collectPromptParts().filter(part=>part.type==='image').map(part=>({id:part.nodeId,url:part.url})));
    assert.deepEqual(references,[{id:image.id,url:image.images[0].url}]);
    await page.evaluate(()=>performUndo());assert.equal(await page.evaluate(()=>nodes.length),1);assert.equal(await page.evaluate(()=>canvas.connections.length),0);assert.deepEqual(errors,[]);
});

test('annotation workflow import and clipboard copies remap graph metadata, mentions and relocated media',async t=>{
    const {page,errors}=await setup(t),service=await uploadService(page);await drawMark(page);
    await page.getByRole('dialog',{name:'视频画面标记',exact:true}).getByRole('button',{name:'保存',exact:true}).click();await page.locator('.pixmax-video-annotation-host').waitFor({state:'detached'});
    const imported=await page.evaluate(()=>{
        const workflow={nodes:JSON.parse(JSON.stringify(nodes)),connections:JSON.parse(JSON.stringify(canvas.connections))};
        workflow.nodes[1].images[0].url='/assets/relocated.png';insertSmartWorkflowIntoCanvas(workflow);
        const [source,image,gen]=nodes.slice(3);return {sourceId:source.id,imageId:image.id,annotationSource:gen.annotationSourceNodeId,imageIds:gen.annotationImageNodeIds,html:gen.promptDraftHtml,native:gen.pixmaxAnnotationPrompt};
    });
    assert.equal(imported.annotationSource,imported.sourceId);assert.deepEqual(imported.imageIds,[imported.imageId]);assert.ok(imported.html.includes(imported.imageId)&&imported.html.includes('/assets/relocated.png'));assert.ok(imported.native.includes(imported.imageId));
    const pasted=await page.evaluate(()=>{copySelectedNodes();pasteNodes();const [source,image,gen]=nodes.slice(6);return {sourceId:source.id,imageId:image.id,annotationSource:gen.annotationSourceNodeId,imageIds:gen.annotationImageNodeIds,html:gen.promptDraftHtml};});
    assert.equal(pasted.annotationSource,pasted.sourceId);assert.deepEqual(pasted.imageIds,[pasted.imageId]);assert.ok(pasted.html.includes(pasted.imageId));
    const alt=await page.evaluate(()=>{duplicateForAltDrag(nodes[8]);const [source,image,gen]=nodes.slice(9);return {sourceId:source.id,imageId:image.id,annotationSource:gen.annotationSourceNodeId,imageIds:gen.annotationImageNodeIds,html:gen.promptDraftHtml};});
    assert.equal(alt.annotationSource,alt.sourceId);assert.deepEqual(alt.imageIds,[alt.imageId]);assert.ok(alt.html.includes(alt.imageId));
    const detached=await page.evaluate(()=>{smartSelection.insertedNodes([nodes[11].id]);copySelectedNodes();pasteNodes({includeConnections:false});return {source:nodes[12].annotationSourceNodeId,images:nodes[12].annotationImageNodeIds,html:nodes[12].promptDraftHtml};});
    assert.equal(detached.source,'');assert.deepEqual(detached.images,[]);assert.ok(detached.html.includes('data-node-id=""'));assert.equal(service.calls(),1);assert.deepEqual(errors,[]);
});

test('failed document save retries without uploading or inserting the same annotation twice',async t=>{
    const {page,errors}=await setup(t),service=await uploadService(page);let fail=true;
    await page.route('**/api/canvases/canvas-test',route=>route.request().method()==='PUT'&&fail?route.fulfill({status:503,json:{detail:'save failed'}}):route.fallback());
    await drawMark(page);const save=page.getByRole('dialog',{name:'视频画面标记',exact:true}).getByRole('button',{name:'保存',exact:true});await save.click();
    await page.locator('.pixmax-annotation-feedback [role=status]').filter({hasText:'尚未保存'}).waitFor();assert.equal(await page.evaluate(()=>nodes.length),3);assert.equal(service.calls(),1);
    fail=false;await save.click();await page.locator('.pixmax-video-annotation-host').waitFor({state:'detached'});
    assert.equal(service.calls(),1);assert.equal(await page.evaluate(()=>nodes.length),3);assert.equal(await page.evaluate(()=>PixmaxVideoAnnotation.hasUnfinishedWork()),false);assert.deepEqual(errors,[]);
});

test('ordinary canvas save acknowledges retained PNGs and later edits become unfinished again',async t=>{
    const {page,errors}=await setup(t);await uploadService(page);let fail=true;
    await page.route('**/api/canvases/canvas-test',route=>route.request().method()==='PUT'&&fail?route.fulfill({status:503,json:{detail:'save failed'}}):route.fallback());
    await drawMark(page);await page.getByRole('dialog',{name:'视频画面标记',exact:true}).getByRole('button',{name:'保存',exact:true}).click();
    await page.locator('.pixmax-annotation-feedback [role=status]').filter({hasText:'尚未保存'}).waitFor();fail=false;await page.evaluate(()=>saveCanvas({force:true}));
    assert.equal(await page.locator('[data-annotation-downloads] button').count(),0);assert.equal(await page.evaluate(()=>PixmaxVideoAnnotation.hasUnfinishedWork()),false);
    const box=await page.locator('.pixmax-native-video-annotation canvas').boundingBox();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.3);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.7,{steps:6});await page.mouse.up();
    assert.equal(await page.evaluate(()=>PixmaxVideoAnnotation.hasUnfinishedWork()),true);assert.deepEqual(errors,[]);
});

test('native save closes an unchanged annotation already acknowledged by ordinary saving without duplicates',async t=>{
    const {page,errors}=await setup(t),service=await uploadService(page);let fail=true;
    await page.route('**/api/canvases/canvas-test',route=>route.request().method()==='PUT'&&fail?route.fulfill({status:503,json:{detail:'save failed'}}):route.fallback());
    await drawMark(page);const save=page.getByRole('dialog',{name:'视频画面标记',exact:true}).getByRole('button',{name:'保存',exact:true});await save.click();
    await page.locator('.pixmax-annotation-feedback [role=status]').filter({hasText:'尚未保存'}).waitFor();fail=false;await page.evaluate(()=>saveCanvas({force:true}));
    await save.click();await page.locator('.pixmax-video-annotation-host').waitFor({state:'detached'});assert.equal(service.calls(),1);assert.equal(await page.evaluate(()=>nodes.length),3);assert.deepEqual(errors,[]);
});

test('upload failure retains real local PNGs for download and retry',async t=>{
    const {page,errors}=await setup(t),service=await uploadService(page,{failFirst:true});await drawMark(page);
    const save=page.getByRole('dialog',{name:'视频画面标记',exact:true}).getByRole('button',{name:'保存',exact:true});await save.click();
    const download=page.locator('[data-annotation-downloads] button');await download.waitFor();await save.waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>nodes.length),1);const event=page.waitForEvent('download');await download.click();await event;
    await save.click();await page.locator('.pixmax-video-annotation-host').waitFor({state:'detached'});assert.equal(service.calls(),2);assert.equal(await page.evaluate(()=>nodes.length),3);assert.deepEqual(errors,[]);
});

test('saving and moving the source during upload preserves semantic source identity',async t=>{
    const {page,record,errors}=await setup(t),service=await uploadService(page,{held:true});
    await page.evaluate(()=>{window.CanvasApi={...CanvasApi,uploadAi:async form=>(await fetch('/api/ai/upload',{method:'POST',body:form})).json()};});
    await drawMark(page);await page.getByRole('dialog',{name:'视频画面标记',exact:true}).getByRole('button',{name:'保存',exact:true}).click();await service.requested;
    await page.evaluate(()=>{nodes[0].x+=50;render();return saveCanvas({force:true});});service.release();await page.locator('.pixmax-video-annotation-host').waitFor({state:'detached'});
    assert.equal(record.nodes.length,3);assert.equal(record.nodes[0].x,550);assert.equal(service.calls(),1);assert.deepEqual(errors,[]);
});

for(const mutation of ['lease','source','workspace','closed'])test('annotation upload cannot write after '+mutation+' changes',async t=>{
    const {page,errors}=await setup(t),service=await uploadService(page,{held:true});
    await page.evaluate(()=>{window.CanvasApi={...CanvasApi,uploadAi:async form=>{const result=await fetch('/api/ai/upload',{method:'POST',body:form});if(!result.ok)throw Error('upload failed');return result.json();}};});
    await drawMark(page);await page.getByRole('dialog',{name:'视频画面标记',exact:true}).getByRole('button',{name:'保存',exact:true}).click();await service.requested;
    await page.evaluate(mutation=>{
        if(mutation==='lease')MemberCanvasEdit.setEditable(false);
        if(mutation==='source')nodes[0].images[0].url='/assets/changed.mp4';
        if(mutation==='workspace'){CanvasSession.context.workspace.id='another-workspace';PixmaxVideoAnnotation.documentChanged();}
        if(mutation==='closed')PixmaxVideoAnnotation.allowPageExit();
    },mutation);service.release();
    if(['lease','source'].includes(mutation))await page.locator('.pixmax-annotation-feedback [role=status]').filter({hasText:'已变化'}).waitFor();
    else await page.getByRole('dialog',{name:'视频画面标记',exact:true}).waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>nodes.length),1);assert.deepEqual(errors,[]);
});

test('readonly invocation is refused and cancelling navigation preserves unsaved drawings',async t=>{
    const {page,errors}=await setup(t);await page.evaluate(()=>{MemberCanvasEdit.setEditable(false);return PixmaxVideoAnnotation.open(annotationSourceId,0);});assert.equal(await page.locator('.pixmax-video-annotation-host').count(),0);
    await page.evaluate(()=>MemberCanvasEdit.setEditable(true));await drawMark(page);
    page.once('dialog',dialog=>dialog.dismiss());assert.equal(await page.evaluate(()=>CanvasNavigation.confirmLocalWork()),false);assert.equal(await page.evaluate(()=>PixmaxVideoAnnotation.hasUnfinishedWork()),true);
    await page.evaluate(()=>PixmaxVideoAnnotation.allowPageExit());await page.getByRole('dialog',{name:'视频画面标记',exact:true}).waitFor({state:'detached'});assert.deepEqual(errors,[]);
});

test('marks on distinct timeline frames export separate timestamped images into one generation draft',async t=>{
    const {page,record,errors}=await setup(t),service=await uploadService(page);await drawMark(page);
    await page.locator('.pixmax-native-video-annotation img.h-full.flex-1.object-cover').nth(14).click();
    await page.waitForFunction(()=>document.querySelector('.pixmax-native-video-annotation video')?.currentTime>1);
    const box=await page.locator('.pixmax-native-video-annotation canvas').boundingBox();await page.mouse.move(box.x+box.width*.4,box.y+box.height*.3);await page.mouse.down();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.7,{steps:10});await page.mouse.up();
    await page.getByRole('dialog',{name:'视频画面标记',exact:true}).getByRole('button',{name:'保存',exact:true}).click();await page.locator('.pixmax-video-annotation-host').waitFor({state:'detached'});
    assert.equal(service.files.length,2);assert.match(service.files[0].name,/^00:00-/);assert.match(service.files[1].name,/^00:01-/);assert.equal(record.nodes.length,4);
    const gen=record.nodes[3];assert.deepEqual(gen.annotationImageNodeIds,record.nodes.slice(1,3).map(node=>node.id));assert.equal(record.connections.length,3);assert.equal((gen.promptDraftHtml.match(/mention-image-token/g)||[]).length,2);
    await page.evaluate(()=>performUndo());assert.equal(await page.evaluate(()=>nodes.length),1);assert.deepEqual(errors,[]);
});
