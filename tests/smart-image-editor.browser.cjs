const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');

async function editor(t,mode='crop',member=false){
    const f=await fixture(t,'smart',member);
    await f.page.evaluate(()=>{
        const image=name=>({url:'/test-image.svg',name,kind:'image',natural_w:320,natural_h:240});
        nodes=[{id:'a',type:'smart-image',images:[image('first.svg'),image('second.svg')],x:20,y:20},
            {id:'b',type:'smart-image',images:[image('other.svg')],x:400,y:20}];
        render();window.editSaves=0;const save=scheduleSave;scheduleSave=()=>{editSaves++;save();};
        window.editUploads=[];
        CanvasApi.uploadAi=async form=>{
            const files=[];
            for(const file of form.getAll('files')){
                const bitmap=await createImageBitmap(file),surface=document.createElement('canvas');
                surface.width=bitmap.width;surface.height=bitmap.height;
                const ctx=surface.getContext('2d');ctx.drawImage(bitmap,0,0);
                const pixels=ctx.getImageData(0,0,surface.width,surface.height).data;
                let white=0,black=0,changed=0;
                for(let i=0;i<pixels.length;i+=4){
                    if(pixels[i]===255&&pixels[i+1]===255&&pixels[i+2]===255)white++;
                    if(pixels[i]===0&&pixels[i+1]===0&&pixels[i+2]===0)black++;
                    if(pixels[i]!==131||pixels[i+1]!==150||pixels[i+2]!==108)changed++;
                }
                editUploads.push({name:file.name,w:surface.width,h:surface.height,white,black,changed});bitmap.close();
                files.push({url:'/edited-'+editUploads.length+'.png',name:file.name});
            }
            return {files};
        };
        openImageEditor('a');
    });
    await f.page.waitForFunction(()=>smartImageEditor.state.ready);
    await modeTo(f.page,mode);
    return f;
}
async function modeTo(page,mode){
    await page.evaluate(mode=>setImageEditMode(mode,true),mode);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
async function stroke(page,selector='#editDrawCanvas'){
    const b=await page.locator(selector).boundingBox();
    await page.mouse.move(b.x+b.width*.3,b.y+b.height*.4);await page.mouse.down();
    await page.mouse.move(b.x+b.width*.7,b.y+b.height*.6,{steps:8});await page.mouse.up();
}

test('Smart owns frozen UI snapshots and private state; binding replaces listeners; destroy releases resources',async t=>{
    const {page,errors}=await editor(t);
    assert.deepEqual(await page.evaluate(()=>{
        for(let i=0;i<5;i++){bindSmartImageEditorControls();bindSmartImageEditorViewport();bindSmartDrawingControls();bindSmartPreviewPanEvents();bindSmartPreviewCompareEvents();}
        document.getElementById('imageEditStage').dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true}));
        return {frozen:Object.isFrozen(smartImageEditor)&&Object.isFrozen(smartImageEditor.state)&&Object.isFrozen(smartPreviewGestures.state.pan),
            crop:typeof cropState,nav:typeof previewNavState,pan:typeof previewPan,dom:Object.hasOwn(smartImageEditor.state,'imageEditModal'),history:typeof editDrawUndoStack,helper:typeof editDrawCanvas==='function',
            zoom:smartImageEditor.state.zoom,owns:smartImageEditor.isEditingNode('a')};
    }),{frozen:true,crop:'undefined',nav:'undefined',pan:'undefined',dom:false,history:'undefined',helper:false,zoom:1.12,owns:true});
    await page.evaluate(()=>{closeImageEditor();clearEditDrawing();undoEditDrawing();applyImageEdit();});
    assert.deepEqual(await page.evaluate(()=>({open:smartImageEditor.state.open,src:document.getElementById('cropImage').getAttribute('src'),pixels:document.getElementById('editDrawCanvas').width,undo:smartImageEditor.state.undoCount,saves:editSaves})),{open:false,src:null,pixels:0,undo:0,saves:0});
    await page.evaluate(()=>{window.sharedMoves=0;window.addEventListener('mousemove',()=>sharedMoves++);smartImageEditor.destroy();smartImageEditor.destroy();bindSmartDrawingControls();openImageEditor('b');window.dispatchEvent(new MouseEvent('mousemove'));});
    assert.deepEqual(await page.evaluate(()=>({open:smartImageEditor.state.open,shared:sharedMoves})),{open:false,shared:1});
    assert.deepEqual(errors,[]);
});

test('Smart grouped crop replaces only its original index and saves once with unchanged geometry',async t=>{
    const {page,errors,writes}=await editor(t);
    await page.evaluate(()=>openImageEditor('a',1));await page.waitForFunction(()=>smartImageEditor.state.ready);await modeTo(page,'crop');
    await page.click('#imageEditApplyBtn');await page.waitForFunction(()=>!smartImageEditor.state.open&&editSaves===1);
    assert.deepEqual(await page.evaluate(()=>({upload:editUploads[0],names:nodes[0].images.map(i=>i.name),selected:smartSelection.image})),
        {upload:{name:'second_crop.png',w:269,h:202,white:0,black:0,changed:0},names:['first.svg','second_crop.png'],selected:{nodeId:'a',index:1}});
    await page.waitForFunction(()=>!smartCanvasDirty&&!smartSaveInFlight&&!smartSaveAgain);
    assert.equal(writes.filter(w=>w.method==='PUT'&&w.path==='/api/canvases/canvas-test').length,1);
    assert.deepEqual(errors,[]);
});

test('Smart outpaint keeps centered margins and parameter/prompt writeback',async t=>{
    const {page,errors}=await editor(t,'outpaint');
    await page.evaluate(()=>{window.outpaintApplications=0;const apply=applySmartOutpaintComposer;applySmartOutpaintComposer=(...args)=>{outpaintApplications++;return apply(...args);};});
    const b=await page.locator('[data-outpaint-handle="right"]').boundingBox();
    await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+30,b.y+b.height/2);await page.mouse.up();
    await page.evaluate(()=>applyImageEdit());
    assert.deepEqual(await page.evaluate(()=>({upload:editUploads[0],saves:editSaves})),{upload:{name:'first_outpaint.png',w:380,h:240,white:14400,black:0,changed:14400},saves:1});
    assert.equal(await page.evaluate(()=>nodes[0].promptDraftText),'Remove white area and fill the scene');
    assert.deepEqual(await page.evaluate(()=>nodes[0].outpaintSize),{width:380,height:240});
    assert.equal(await page.evaluate(()=>outpaintApplications),1);
    assert.deepEqual(await page.evaluate(()=>({width:nodes[0].runSettings.customWidth,height:nodes[0].runSettings.customHeight,locked:nodes[0].runSettings.outpaintResolutionLocked,text:promptPlainText()})),
        {width:380,height:240,locked:true,text:'Remove white area and fill the scene'});
    assert.deepEqual(errors,[]);
});

for(const change of ['close','reopen','canvas'])test(`Smart outpaint late receipt after ${change} cannot change drafts or input settings`,async t=>{
    const {page,errors}=await editor(t,'outpaint');
    await page.evaluate(()=>{
        const upload=CanvasApi.uploadAi;
        CanvasApi.uploadAi=async form=>{const result=await upload(form);await new Promise(resolve=>{window.outpaintRelease=resolve;});return result;};
        window.outpaintApplications=0;const apply=applySmartOutpaintComposer;
        applySmartOutpaintComposer=(...args)=>{outpaintApplications++;return apply(...args);};
        window.outpaintRequest=applyImageEdit();
    });
    await page.waitForFunction(()=>typeof outpaintRelease==='function');
    await page.evaluate(change=>{
        if(change==='close')closeImageEditor();
        if(change==='reopen')openImageEditor('b');
        if(change==='canvas')canvas={...canvas,id:'other-canvas'};
    },change);
    if(change==='reopen')await page.waitForFunction(()=>smartImageEditor.state.ready);
    const before=await page.evaluate(()=>JSON.stringify({nodes,settings,input:promptInput.innerHTML,marker:promptInput.dataset.preserveDraftOnce}));
    await page.evaluate(async()=>{outpaintRelease();await outpaintRequest;});
    assert.equal(await page.evaluate(()=>JSON.stringify({nodes,settings,input:promptInput.innerHTML,marker:promptInput.dataset.preserveDraftOnce})),before);
    assert.equal(await page.evaluate(()=>outpaintApplications),0);assert.equal(await page.evaluate(()=>editSaves),0);assert.deepEqual(errors,[]);
});

test('Smart brush undo remains separate from canvas history',async t=>{
    const {page,errors}=await editor(t,'brush');const history=await page.evaluate(()=>undoStack.length);
    await stroke(page);assert.equal(await page.evaluate(()=>smartImageEditor.state.undoCount),1);
    await page.evaluate(()=>undoEditDrawing());assert.equal(await page.evaluate(()=>smartImageEditor.state.redoCount),1);
    await page.evaluate(()=>redoEditDrawing());assert.equal(await page.evaluate(()=>undoStack.length),history);
    await page.evaluate(()=>applyImageEdit());
    const r=await page.evaluate(()=>({upload:editUploads[0],count:nodes[0].images.length,selected:smartSelection.image,saves:editSaves}));
    assert.equal(r.upload.w,320);assert.equal(r.upload.h,240);assert.ok(r.upload.changed>0);
    assert.equal(r.count,2);assert.deepEqual(r.selected,{nodeId:'a',index:0});assert.equal(r.saves,1);assert.deepEqual(errors,[]);
});

for(const tool of ['free','rect','ellipse','label','text'])test(`Smart ${tool} brush retains pixels, local history and one save`,async t=>{
    const {page,errors}=await editor(t,'brush');await page.evaluate(tool=>setBrushTool(tool),tool);
    if(tool==='text'){
        const b=await page.locator('#editTextCanvas').boundingBox();
        await page.mouse.click(b.x+b.width/2,b.y+b.height/2);await page.mouse.dblclick(b.x+b.width/2,b.y+b.height/2);
        await page.locator('.edit-text-inline').fill('Smart text');await page.locator('.edit-text-inline').press('Enter');
    }else await stroke(page);
    await page.evaluate(()=>applyImageEdit());const r=await page.evaluate(()=>({upload:editUploads[0],name:nodes[0].images[0].name,saves:editSaves}));
    assert.equal(r.upload.w,320);assert.equal(r.upload.h,240);assert.ok(r.upload.changed>0);assert.equal(r.name,'first_paint.png');assert.equal(r.saves,1);assert.deepEqual(errors,[]);
});

test('Smart grid join retains output size and separate undo behavior',async t=>{
    const {page,errors}=await editor(t,'grid');
    await page.evaluate(()=>{setGridOperationMode('join');applyGridJoinPreset(1,2);setGridJoinOutputSize(1024);});
    const history=await page.evaluate(()=>undoStack.length);await page.evaluate(()=>applyImageEdit());
    const r=await page.evaluate(()=>({upload:editUploads.at(-1),title:nodes.at(-1).title,history:undoStack.length,saves:editSaves}));
    assert.equal(r.upload.w,1024);assert.equal(r.upload.h,384);assert.equal(r.upload.changed,0);assert.equal(r.title,'Grid Join');assert.equal(r.history,history);assert.equal(r.saves,2);assert.deepEqual(errors,[]);
});

test('Smart preview navigation has one target, preserves group indices and does not save; mode transitions cancel gestures',async t=>{
    const {page,errors}=await editor(t,'preview');
    assert.equal(await page.locator('#previewNextBtn').evaluate(el=>el.classList.contains('visible')),true);
    await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>smartImageEditor.state.imageIndex===1&&smartImageEditor.state.ready);
    await page.evaluate(()=>{
        document.getElementById('previewStage').dispatchEvent(new MouseEvent('mousedown',{button:0,clientX:100,clientY:100,bubbles:true}));
        window.dispatchEvent(new MouseEvent('mousemove',{clientX:150,clientY:130}));
    });
    assert.deepEqual(await page.evaluate(()=>smartPreviewGestures.state.pan),{x:50,y:30});
    await modeTo(page,'crop');assert.equal(await page.evaluate(()=>smartPreviewGestures.state.dragging),false);
    await page.evaluate(()=>window.dispatchEvent(new MouseEvent('mousemove',{clientX:300,clientY:300})));
    assert.deepEqual(await page.evaluate(()=>smartPreviewGestures.state.pan),{x:50,y:30});
    await modeTo(page,'preview');
    await page.evaluate(()=>{for(let i=0;i<4;i++){bindSmartImageEditorViewport();bindSmartPreviewPanEvents();}document.getElementById('imageEditStage').dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true}));});
    assert.equal(await page.evaluate(()=>smartPreviewGestures.state.zoom),1.12);
    assert.equal(await page.evaluate(()=>editSaves),0);assert.deepEqual(errors,[]);
});

for(const change of ['delete','replace-image','replace-node','canvas'])test(`Smart open state remains closable after ${change} invalidates target`,async t=>{
    const {page,errors}=await editor(t);
    await page.evaluate(change=>{
        if(change==='delete')nodes=nodes.filter(n=>n.id!=='a');
        if(change==='replace-image')nodes[0].images[0]={...nodes[0].images[0]};
        if(change==='replace-node')nodes=JSON.parse(JSON.stringify(nodes));
        if(change==='canvas')canvas={...canvas,id:'other-canvas'};
    },change);
    assert.deepEqual(await page.evaluate(()=>({open:smartImageEditor.state.open,valid:smartImageEditor.state.targetValid})),{open:true,valid:false});
    await page.evaluate(()=>applyImageEdit());assert.equal(await page.evaluate(()=>editUploads.length),0);
    await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>smartImageEditor.state.open),false);
    assert.equal(await page.locator('#cropImage').getAttribute('src'),null);assert.deepEqual(errors,[]);
});

for(const change of ['close','reopen','switch-index','preview','replace-image'])test(`Smart late upload after ${change} cannot write, close a new session or save`,async t=>{
    const {page,errors}=await editor(t);
    await page.evaluate(()=>{window.originalUpload=CanvasApi.uploadAi;CanvasApi.uploadAi=form=>new Promise(resolve=>{window.releaseUpload=()=>originalUpload(form).then(resolve);});window.pendingEdit=applyImageEdit();});
    await page.waitForFunction(()=>typeof releaseUpload==='function');
    await page.evaluate(change=>{
        if(change==='close')closeImageEditor();
        if(change==='reopen')openImageEditor('b');
        if(change==='switch-index')openImageEditor('a',1);
        if(change==='preview')setImageEditMode('preview',true);
        if(change==='replace-image')nodes[0].images[0]={...nodes[0].images[0],name:'replacement.svg'};
        releaseUpload();
    },change);
    await page.evaluate(()=>pendingEdit);
    const r=await page.evaluate(()=>({names:nodes[0].images.map(x=>x.name),saves:editSaves,open:smartImageEditor.state.open,nodeId:smartImageEditor.state.nodeId,index:smartImageEditor.state.imageIndex}));
    assert.deepEqual(r.names,[change==='replace-image'?'replacement.svg':'first.svg','second.svg']);assert.equal(r.saves,0);assert.equal(r.open,change!=='close');
    if(change==='reopen')assert.equal(r.nodeId,'b');if(change==='switch-index')assert.equal(r.index,1);assert.deepEqual(errors,[]);
});

test('Smart delayed opening cannot restore an old image after close or canvas reset',async t=>{
    const {page,errors}=await editor(t);const held=[];
    await page.route('**/delayed.svg',route=>held.push(route));
    await page.evaluate(()=>{nodes[0].images[0]={url:'/delayed.svg',name:'slow.svg',kind:'image',natural_w:320,natural_h:240};openImageEditor('a');});
    await page.waitForFunction(()=>smartImageEditor.state.open&&!smartImageEditor.state.ready);await page.keyboard.press('Escape');
    await page.evaluate(()=>openImageEditor('b'));await page.waitForFunction(()=>smartImageEditor.state.ready);
    for(const route of held)await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'}).catch(()=>{});
    assert.deepEqual(await page.evaluate(()=>({id:smartImageEditor.state.nodeId,w:document.getElementById('cropImage').naturalWidth,saves:editSaves})),{id:'b',w:320,saves:0});
    await page.evaluate(()=>loadCanvas());assert.equal(await page.evaluate(()=>smartImageEditor.state.open),false);assert.deepEqual(errors,[]);
});

test('Smart cached page pauses listeners, preserves drawing on return and permanent exit releases preview/editor resources',async t=>{
    const {page,errors}=await editor(t,'brush');await stroke(page);
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
    assert.equal(await page.evaluate(()=>smartImageEditor.state.paused),true);
    const zoom=await page.evaluate(()=>smartImageEditor.state.zoom);
    await page.evaluate(()=>document.getElementById('imageEditStage').dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true})));
    assert.equal(await page.evaluate(()=>smartImageEditor.state.zoom),zoom);
    await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
    assert.equal(await page.evaluate(()=>smartImageEditor.state.undoCount),1);await page.evaluate(()=>applyImageEdit());assert.equal(await page.evaluate(()=>editSaves),1);
    await page.evaluate(()=>{openImageEditor('b');});await page.waitForFunction(()=>smartImageEditor.state.ready);
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false})));
    assert.deepEqual(await page.evaluate(()=>({open:smartImageEditor.state.open,crop:document.getElementById('cropImage').getAttribute('src'),preview:document.getElementById('previewCurrentImage').getAttribute('src'),pixels:document.getElementById('editDrawCanvas').width})),{open:false,crop:null,preview:null,pixels:0});
    assert.deepEqual(errors,[]);
});

test('Smart detached log preview remains independent of node selection and cannot become an editable canvas target',async t=>{
    const {page,errors}=await editor(t,'preview');const selected=await page.evaluate(()=>smartSelection.image);
    await page.evaluate(()=>smartLogPreviewNode('/test-image.svg'));await page.waitForFunction(()=>PixmaxImagePreview.opened);
    assert.deepEqual(await page.evaluate(()=>smartSelection.image),selected);assert.equal(await page.evaluate(()=>nodes.some(n=>n.id==='__smart_log_preview__')),false);
    await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>PixmaxImagePreview.opened||smartImageEditor.state.open),false);assert.deepEqual(errors,[]);
});

test('Smart retires mixed editor tabs, outpaint and grid toolbar entries while keeping internal legacy guards',async t=>{
    const {page,errors}=await editor(t,'preview');
    assert.equal(await page.locator('[data-smart-node-action="mask"],[data-smart-node-action="grid"],[data-image-edit-mode="mask"],#imageMaskTools,.grid-split-control,#gridSplitModeBtn').count(),0);
    assert.deepEqual(await page.evaluate(()=>[typeof applyGridPreset,typeof toggleGridCustomMode,typeof smartImageEditor.applyGridPreset]),['undefined','undefined','undefined']);
    const before=await page.evaluate(()=>JSON.stringify(nodes));
    await page.evaluate(()=>{setImageEditMode('mask',true);runSmartNodeToolbarAction('b','mask');runSmartNodeToolbarAction('b','grid');applyImageEdit();});
    assert.equal(await page.evaluate(()=>smartImageEditor.state.mode),'preview');
    assert.equal(await page.evaluate(()=>JSON.stringify(nodes)),before);assert.equal(await page.evaluate(()=>editUploads.length),0);
    await page.evaluate(()=>openImageEditor('b'));await page.waitForFunction(()=>smartImageEditor.state.ready);
    assert.equal(await page.locator('[data-image-edit-mode]').count(),0);
    assert.equal(await page.locator('[data-node-id="b"][data-smart-node-action="grid-join"]').count(),0);
    await page.evaluate(()=>setImageEditMode('grid',true));assert.equal(await page.evaluate(()=>smartImageEditor.state.mode),'preview');
    await page.evaluate(()=>{closeImageEditor();runSmartNodeToolbarAction('a','grid-join');});
    assert.equal(await page.evaluate(()=>smartImageEditor.state.open),false);
    assert.equal(await page.locator('[data-smart-node-action="grid-join"],[data-smart-node-action="outpaint"]').count(),0);
    assert.deepEqual(errors,[]);
});

test('Smart grid join pointer reorder retains indices and closing releases pointer capture',async t=>{
    const {page,errors}=await editor(t,'grid');await page.evaluate(()=>{setGridOperationMode('join');applyGridJoinPreset(1,2);});
    const first=page.locator('[data-grid-join-index="0"]'),second=page.locator('[data-grid-join-index="1"]');
    const a=await first.boundingBox(),b=await second.boundingBox();
    await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:8});await page.mouse.up();
    assert.ok(await page.evaluate(()=>Number.parseFloat(document.querySelector('[data-grid-join-index="0"]').style.left)>Number.parseFloat(document.querySelector('[data-grid-join-index="1"]').style.left)));
    const tile=await first.boundingBox();await page.mouse.move(tile.x+tile.width/2,tile.y+tile.height/2);await page.mouse.down();
    await page.evaluate(()=>{window.capturedTile=document.querySelector('[data-grid-join-index="0"]');window.releases=0;const release=capturedTile.releasePointerCapture.bind(capturedTile);capturedTile.releasePointerCapture=id=>{releases++;release(id);};closeImageEditor();});
    await page.mouse.up();assert.equal(await page.evaluate(()=>releases),1);
    assert.equal(await page.locator('.grid-join-item').count(),0);assert.deepEqual(errors,[]);
});

test('Smart preview comparison capture belongs to results and is released when entering edit mode',async t=>{
    const {page,errors}=await editor(t,'preview');await page.evaluate(()=>{nodes[0].runInputRefs=[{url:'/test-image.svg',kind:'image'}];togglePreviewCompare();});
    const b=await page.locator('#previewCompareHandle').boundingBox();
    await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();
    assert.equal(await page.evaluate(()=>smartPreviewGestures.state.dragging),true);
    await page.evaluate(()=>{window.releases=0;const handle=document.getElementById('previewCompareHandle'),release=handle.releasePointerCapture.bind(handle);handle.releasePointerCapture=id=>{releases++;release(id);};setImageEditMode('brush',true);});
    assert.equal(await page.evaluate(()=>releases),1);assert.equal(await page.evaluate(()=>smartPreviewGestures.state.dragging),false);
    await page.mouse.up();assert.deepEqual(errors,[]);
});

for(const path of ['undo','draft','no-canvas'])test(`Smart ${path} replacement retains an open but inoperable panel until real Escape`,async t=>{
    const {page,errors}=await editor(t,'brush',path==='draft');await stroke(page);
    await page.evaluate(path=>{
        if(path==='undo'){pushUndo();nodes[0].title='changed';performUndo();}
        if(path==='draft')restoreSmartMemberDraft({id:canvas.id,kind:'smart',nodes:JSON.parse(JSON.stringify(nodes)),connections:[]});
        if(path==='no-canvas')canvas=null;
    },path);
    assert.deepEqual(await page.evaluate(()=>({open:smartImageEditor.state.open,valid:smartImageEditor.state.targetValid,editing:smartImageEditor.isEditingNode('a')})),{open:true,valid:false,editing:false});
    const before=await page.evaluate(()=>({saves:editSaves,nodes:JSON.stringify(nodes)}));
    await page.evaluate(()=>applyImageEdit());await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>smartImageEditor.state.open),false);
    assert.deepEqual(await page.evaluate(()=>({saves:editSaves,nodes:JSON.stringify(nodes)})),before);assert.deepEqual(errors,[]);
});

test('Smart obsolete PNG encoding cannot start an upload or affect a reopened target',async t=>{
    const {page,errors}=await editor(t);
    await page.evaluate(()=>{
        const encode=HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob=function(callback,...args){encode.call(this,blob=>{window.finishEncoding=()=>callback(blob);},...args);};
        window.pendingEdit=applyImageEdit();
    });
    await page.waitForFunction(()=>typeof finishEncoding==='function');await page.evaluate(()=>{openImageEditor('b');finishEncoding();});
    await page.evaluate(()=>pendingEdit);assert.equal(await page.evaluate(()=>editUploads.length),0);assert.equal(await page.evaluate(()=>editSaves),0);
    assert.equal(await page.evaluate(()=>smartImageEditor.state.nodeId),'b');assert.deepEqual(errors,[]);
});

test('Smart delayed grid thumbnail and export loads cannot repopulate caches or leave unresolved work after close',async t=>{
    const {page,errors}=await editor(t,'grid');const held=[];
    let seen;const requested=new Promise(resolve=>{seen=resolve;});
    await page.route('**/join-held.svg',route=>{held.push(route);seen();});
    await page.evaluate(()=>{nodes[0].images[1]={url:'/join-held.svg',name:'slow.svg',kind:'image'};setGridOperationMode('join');});
    await requested;
    await page.evaluate(()=>{
        window.oldGridImage=document.querySelector('[data-grid-join-index="1"]');window.oldGridLoad=oldGridImage.onload;
        window.joinImages=[];const ImageClass=window.Image;window.Image=class extends ImageClass{constructor(...args){super(...args);joinImages.push(this);}};
        window.pendingJoin=applyImageEdit();
    });
    // Wait until the export has reached its own Image rather than only the thumbnail.
    await page.waitForFunction(()=>joinImages.some(img=>img.getAttribute('src')?.includes('/join-held.svg')));
    await page.evaluate(()=>{closeImageEditor();oldGridLoad();});
    await page.evaluate(()=>pendingJoin);
    assert.deepEqual(await page.evaluate(()=>({open:smartImageEditor.state.open,handler:oldGridImage.onload,items:document.querySelectorAll('.grid-join-item').length,uploads:editUploads.length,saves:editSaves})),{open:false,handler:null,items:0,uploads:0,saves:0});
    for(const route of held)await route.abort().catch(()=>{});assert.deepEqual(errors,[]);
});

test('Smart failure retry and cached return during loading cannot reactivate old callbacks',async t=>{
    const {page,errors}=await editor(t,'preview');let fail=true;
    await page.route('**/retry.svg',route=>route.fulfill(fail?{status:503,body:'failed'}:{contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="green"/></svg>'}));
    await page.evaluate(()=>{nodes[0].images[0]={url:'/retry.svg',name:'retry.svg',kind:'image',natural_w:320,natural_h:240};openImageEditor('a');});
    await page.getByText('素材加载失败，请重试').waitFor();fail=false;await page.getByRole('button',{name:'重试',exact:true}).click();
    await page.waitForFunction(()=>smartImageEditor.state.ready);assert.equal(await page.evaluate(()=>editSaves),0);
    await page.evaluate(()=>{openImageEditor('a');window.oldCropLoad=document.getElementById('cropImage').onload;window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));oldCropLoad();});
    await page.waitForFunction(()=>smartImageEditor.state.ready);assert.equal(await page.evaluate(()=>editSaves),0);assert.deepEqual(errors,[]);
});

test('Smart readonly lease preserves preview, group navigation and close without saving',async t=>{
    const {page,errors,writes}=await editor(t,'preview',true);await page.evaluate(()=>MemberCanvasEdit.setEditable(false));
    await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>smartImageEditor.state.imageIndex===1&&smartImageEditor.state.ready);
    await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>editSaves),0);
    assert.equal(writes.filter(w=>w.method==='PUT'&&w.path==='/api/canvases/canvas-test').length,0);assert.deepEqual(errors,[]);
});

test('Smart crop move/resize and editor overflow panning retain the original window gesture geometry',async t=>{
    const {page,errors}=await editor(t);
    const box=page.locator('#cropBox'),before=await box.boundingBox();
    await page.mouse.move(before.x+before.width/2,before.y+before.height/2);await page.mouse.down();
    await page.mouse.move(before.x+before.width/2+10,before.y+before.height/2+10);await page.mouse.up();
    let after=await box.boundingBox();assert.ok(Math.abs(after.x-before.x-10)<1);assert.ok(Math.abs(after.y-before.y-10)<1);
    const handle=await page.locator('#cropHandle').boundingBox();
    await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
    await page.mouse.move(handle.x+handle.width/2-20,handle.y+handle.height/2-20);await page.mouse.up();
    const resized=await box.boundingBox();assert.ok(Math.abs(resized.width-after.width+20)<1);assert.ok(Math.abs(resized.height-after.height+20)<1);
    assert.deepEqual(await page.evaluate(()=>{
        const stage=document.getElementById('imageEditStage');
        for(let i=0;i<20;i++)stage.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true,clientX:200,clientY:200}));
        stage.scrollLeft=100;stage.scrollTop=100;
        stage.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true,clientX:200,clientY:200}));
        window.dispatchEvent(new MouseEvent('mousemove',{clientX:180,clientY:180}));
        window.dispatchEvent(new MouseEvent('mouseup'));
        return {x:stage.scrollLeft,y:stage.scrollTop};
    }),{x:120,y:120});
    assert.equal(await page.evaluate(()=>editSaves),0);assert.deepEqual(errors,[]);
});

test('Smart closing inline text removes handlers and cancels its pending focus frame',async t=>{
    const {page,errors}=await editor(t,'brush');await page.evaluate(()=>setBrushTool('text'));
    const b=await page.locator('#editTextCanvas').boundingBox();await page.mouse.click(b.x+b.width/2,b.y+b.height/2);
    await page.evaluate(()=>{
        window.oldFrames=[];const raf=requestAnimationFrame;
        window.requestAnimationFrame=callback=>{oldFrames.push(callback);return raf(callback);};
        const surface=document.getElementById('editTextCanvas'),bounds=surface.getBoundingClientRect();
        surface.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,clientX:bounds.x+bounds.width/2,clientY:bounds.y+bounds.height/2}));
        window.inline=document.querySelector('.edit-text-inline');window.oldFocus=0;inline.focus=()=>oldFocus++;
        closeImageEditor();window.requestAnimationFrame=raf;
        inline.dispatchEvent(new Event('blur'));inline.dispatchEvent(new Event('input'));oldFrames.forEach(callback=>callback());
    });
    assert.deepEqual(await page.evaluate(()=>({focus:oldFocus,inline:document.querySelectorAll('.edit-text-inline').length,text:smartImageEditor.state.textCount,saves:editSaves})),{focus:0,inline:0,text:0,saves:0});assert.deepEqual(errors,[]);
});
