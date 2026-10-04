const test = require('node:test');
const assert = require('node:assert/strict');
const {fixture} = require('./helpers/canvas-browser.cjs');

async function editor(t, mode='crop', member=false){
    const f = await fixture(t,'classic',member);
    await f.page.evaluate(mode => {
        nodes=[{id:'image-a',type:'image',url:'/test-image.svg',name:'source.svg',x:20,y:20},
            {id:'image-b',type:'image',url:'/test-image.svg',name:'other.svg',x:350,y:20}];
        render();
        window.editSaves=0;
        const original=scheduleSave;
        scheduleSave=()=>{window.editSaves++;original();};
        window.editUploads=[];
        CanvasApi.uploadAi=async form=>{
            const files=[];
            for(const file of form.getAll('files')){
                const bitmap=await createImageBitmap(file),c=document.createElement('canvas');
                c.width=bitmap.width;c.height=bitmap.height;
                const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);
                const data=ctx.getImageData(0,0,c.width,c.height).data;
                let white=0,black=0,changed=0;
                for(let i=0;i<data.length;i+=4){
                    if(data[i]===255&&data[i+1]===255&&data[i+2]===255)white++;
                    if(data[i]===0&&data[i+1]===0&&data[i+2]===0)black++;
                    if(data[i]!==131||data[i+1]!==150||data[i+2]!==108)changed++;
                }
                window.editUploads.push({name:file.name,w:c.width,h:c.height,white,black,changed});
                bitmap.close();
                files.push({url:'/edited-'+files.length+'.png',name:file.name});
            }
            return {files};
        };
        openImageEditor('image-a',mode);
    },mode);
    await f.page.waitForFunction(()=>classicImageEditor.state.ready);
    return f;
}

async function stroke(page, selector='#editDrawCanvas'){
    const b=await page.locator(selector).boundingBox();
    await page.mouse.move(b.x+b.width*.3,b.y+b.height*.4);
    await page.mouse.down();
    await page.mouse.move(b.x+b.width*.7,b.y+b.height*.6,{steps:8});
    await page.mouse.up();
}

test('Classic editor state is frozen; repeated binding keeps one wheel change; close and destroy release resources',async t=>{
    const {page,errors}=await editor(t);
    assert.deepEqual(await page.evaluate(()=>{
        const state=classicImageEditor.state;
        for(let i=0;i<5;i++)bindClassicImageEditorControls();
        document.getElementById('imageEditStage').dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true}));
        return {frozen:Object.isFrozen(state)&&Object.isFrozen(classicImageEditor),crop:typeof cropState,draw:typeof editDrawCanvas === 'function',
            zoom:classicImageEditor.state.zoom,owns:classicImageEditor.isEditingNode('image-a')};
    }),{frozen:true,crop:'undefined',draw:false,zoom:1.12,owns:true});
    await page.evaluate(()=>{closeImageEditor();clearEditDrawing();undoEditDrawing();applyImageEdit();});
    assert.deepEqual(await page.evaluate(()=>({open:classicImageEditor.state.open,undo:classicImageEditor.state.undoCount,
        src:document.getElementById('cropImage').getAttribute('src'),pixels:document.getElementById('editDrawCanvas').width,saves:editSaves})),
    {open:false,undo:0,src:null,pixels:0,saves:0});
    await page.evaluate(()=>{
        classicImageEditor.destroy();classicImageEditor.destroy();bindClassicImageEditorControls();
        openImageEditor('image-b');window.dispatchEvent(new MouseEvent('mousemove'));window.dispatchEvent(new MouseEvent('mouseup'));
    });
    assert.equal(await page.evaluate(()=>classicImageEditor.state.open),false);
    assert.deepEqual(errors,[]);
});

test('Classic crop retains the 8%/84% rectangle, source pixels, one writeback and one save',async t=>{
    const {page,errors,writes}=await editor(t);
    await page.click('#imageEditApplyBtn');
    await page.waitForFunction(()=>!classicImageEditor.state.open&&editSaves===1);
    assert.deepEqual(await page.evaluate(()=>({uploads:editUploads,node:nodes[0].name})),
        {uploads:[{name:'source_crop.png',w:269,h:202,white:0,black:0,changed:0}],node:'source_crop.png'});
    await page.waitForFunction(()=>!localCanvasDirty&&!savingCanvasNow);
    assert.equal(writes.filter(w=>w.method==='PUT'&&w.path==='/api/canvases/canvas-test').length,1);
    assert.deepEqual(errors,[]);
});

test('Classic outpaint retains centered expansion, white margins and natural dimensions',async t=>{
    const {page,errors}=await editor(t,'outpaint');
    const b=await page.locator('[data-outpaint-handle="right"]').boundingBox();
    await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();
    await page.mouse.move(b.x+b.width/2+30,b.y+b.height/2);await page.mouse.up();
    await page.evaluate(()=>applyImageEdit());
    assert.deepEqual(await page.evaluate(()=>({upload:editUploads[0],w:nodes[0].natural_w,h:nodes[0].natural_h,saves:editSaves})),
        {upload:{name:'source_outpaint.png',w:380,h:240,white:14400,black:0,changed:14400},w:380,h:240,saves:1});
    assert.deepEqual(errors,[]);
});

test('Classic mask keeps black/white output, new mask node and editor history separate from canvas undo',async t=>{
    const {page,errors}=await editor(t,'mask');
    const history=await page.evaluate(()=>undoStack.length);
    await stroke(page);
    assert.equal(await page.evaluate(()=>classicImageEditor.state.undoCount),1);
    await page.evaluate(()=>undoEditDrawing());
    assert.equal(await page.evaluate(()=>classicImageEditor.state.redoCount),1);
    await page.evaluate(()=>redoEditDrawing());
    assert.equal(await page.evaluate(()=>undoStack.length),history);
    await page.evaluate(()=>applyImageEdit());
    const result=await page.evaluate(()=>({upload:editUploads[0],role:nodes.at(-1).role,selected:[...selected],id:nodes.at(-1).id,saves:editSaves}));
    assert.equal(result.upload.w,320);assert.equal(result.upload.h,240);
    assert.ok(result.upload.white>0&&result.upload.black>0);
    assert.equal(result.upload.white+result.upload.black,320*240);
    assert.equal(result.role,'mask');assert.deepEqual(result.selected,[result.id]);assert.equal(result.saves,1);
    assert.deepEqual(errors,[]);
});

for(const tool of ['free','rect','ellipse','label','text'])test(`Classic ${tool} brush preserves visible output and save count`,async t=>{
    const {page,errors}=await editor(t,'brush');
    await page.evaluate(tool=>setBrushTool(tool),tool);
    if(tool==='text'){
        const b=await page.locator('#editTextCanvas').boundingBox();
        await page.mouse.click(b.x+b.width/2,b.y+b.height/2);
        await page.mouse.dblclick(b.x+b.width/2,b.y+b.height/2);
        await page.locator('.edit-text-inline').fill('Canvas test');
        await page.locator('.edit-text-inline').press('Enter');
        assert.equal(await page.evaluate(()=>classicImageEditor.state.textCount),1);
    }else await stroke(page);
    await page.evaluate(()=>applyImageEdit());
    assert.equal(await page.evaluate(()=>editUploads[0].w),320);
    assert.equal(await page.evaluate(()=>editUploads[0].h),240);
    assert.ok(await page.evaluate(()=>editUploads[0].changed>0));
    assert.equal(await page.evaluate(()=>editSaves),1);
    assert.deepEqual(errors,[]);
});

test('Classic grid preset and custom placement retain geometry, local undo and grouped output',async t=>{
    const {page,errors}=await editor(t,'grid');
    await page.evaluate(()=>{applyGridPreset(2,2);toggleGridCustomMode();});
    const b=await page.locator('#editDrawCanvas').boundingBox();
    await page.locator('#editDrawCanvas').click({position:{x:b.width/2,y:b.height/2}});
    assert.equal(await page.evaluate(()=>classicImageEditor.state.gridLineCount),1);
    await page.evaluate(()=>undoGridCustomLine());
    assert.equal(await page.evaluate(()=>classicImageEditor.state.gridLineCount),0);
    await page.evaluate(()=>applyGridPreset(2,2));
    await page.evaluate(()=>applyImageEdit());
    assert.deepEqual(await page.evaluate(()=>editUploads.map(({w,h})=>({w,h}))),Array.from({length:4},()=>({w:160,h:120})));
    assert.equal(await page.evaluate(()=>nodes.find(n=>n.type==='output').images.length),4);
    assert.equal(await page.evaluate(()=>editSaves),1);
    assert.deepEqual(errors,[]);
});

test('Classic temporary text focus and drag do not survive reopen, close or target deletion',async t=>{
    const {page,errors}=await editor(t,'brush');
    await page.evaluate(()=>setBrushTool('text'));
    const b=await page.locator('#editTextCanvas').boundingBox();
    await page.mouse.click(b.x+b.width/2,b.y+b.height/2);
    await page.mouse.dblclick(b.x+b.width/2,b.y+b.height/2);
    assert.equal(await page.locator('.edit-text-inline').count(),1);
    await page.evaluate(()=>openImageEditor('image-b','crop'));
    await page.waitForFunction(()=>classicImageEditor.state.ready);
    assert.equal(await page.locator('.edit-text-inline').count(),0);
    assert.equal(await page.evaluate(()=>classicImageEditor.state.textCount),0);
    const crop=await page.locator('#cropBox').boundingBox();
    await page.mouse.move(crop.x+20,crop.y+20);await page.mouse.down();
    await page.evaluate(()=>deleteNode('image-b'));
    await page.mouse.move(crop.x+100,crop.y+100);await page.mouse.up();
    assert.equal(await page.evaluate(()=>classicImageEditor.state.open),false);
    assert.equal(await page.evaluate(()=>document.getElementById('cropImage').getAttribute('src')),null);
    assert.deepEqual(errors,[]);
});

for(const action of ['close','reopen','switch','delete','pause'])test(`Classic stale image load cannot affect a session after ${action}`,async t=>{
    const {page,errors}=await editor(t);
    await page.route('**/delayed.svg',()=>new Promise(()=>{}));
    await page.evaluate(()=>{nodes[0].url='/delayed.svg';openImageEditor('image-a');window.oldImageLoad=document.getElementById('cropImage').onload;});
    await page.evaluate(action=>{
        if(action==='close')closeImageEditor();
        if(action==='reopen')openImageEditor('image-b','grid');
        if(action==='switch')setCanvasMode(false);
        if(action==='delete')deleteNode('image-a');
        if(action==='pause')window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
    },action);
    if(action==='reopen')await page.waitForFunction(()=>classicImageEditor.state.ready);
    const before=await page.evaluate(()=>classicImageEditor.state);
    await page.evaluate(()=>oldImageLoad());
    assert.deepEqual(await page.evaluate(()=>classicImageEditor.state),before);
    assert.equal(await page.evaluate(()=>editSaves),action==='delete'?1:0);
    assert.deepEqual(errors,[]);
});

for(const action of ['close','reopen','switch','delete','pause'])test(`Classic uploaded receipt does not write or save an obsolete target after ${action}`,async t=>{
    const {page,errors}=await editor(t);
    await page.evaluate(()=>{
        CanvasApi.uploadAi=()=>new Promise(resolve=>{window.finishEditUpload=resolve;});
        window.pendingEdit=applyImageEdit();
    });
    await page.waitForFunction(()=>typeof finishEditUpload==='function');
    await page.evaluate(action=>{
        if(action==='close')closeImageEditor();
        if(action==='reopen')openImageEditor('image-b','grid');
        if(action==='switch')setCanvasMode(false);
        if(action==='delete')deleteNode('image-a');
        if(action==='pause')window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
    },action);
    if(action==='reopen')await page.waitForFunction(()=>classicImageEditor.state.ready);
    const before=await page.evaluate(()=>({state:classicImageEditor.state,nodes:JSON.stringify(nodes),saves:editSaves}));
    await page.evaluate(async()=>{finishEditUpload({files:[{url:'/late.png',name:'late.png'}]});await pendingEdit;});
    assert.deepEqual(await page.evaluate(()=>({state:classicImageEditor.state,nodes:JSON.stringify(nodes),saves:editSaves})),before);
    assert.deepEqual(errors,[]);
});

test('Classic cached page return retains draft and restores one listener; permanent leave destroys editor only',async t=>{
    const {page,errors}=await editor(t,'brush');
    await stroke(page);
    await page.evaluate(()=>document.getElementById('cropCanvas').classList.add('dragging-image'));
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
    assert.equal(await page.evaluate(()=>classicImageEditor.state.paused),true);
    assert.equal(await page.evaluate(()=>document.getElementById('cropCanvas').classList.contains('dragging-image')),false);
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
    assert.equal(await page.evaluate(()=>classicImageEditor.state.undoCount),1);
    await page.evaluate(()=>document.getElementById('imageEditStage').dispatchEvent(new WheelEvent('wheel',{deltaY:-1})));
    assert.equal(await page.evaluate(()=>classicImageEditor.state.zoom),1.12);
    await page.evaluate(()=>{
        window.sharedEditorMove=0;window.addEventListener('mousemove',()=>sharedEditorMove++);
        window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}));
        window.dispatchEvent(new MouseEvent('mousemove'));
        openImageEditor('image-b');
    });
    assert.equal(await page.evaluate(()=>sharedEditorMove),1);
    assert.equal(await page.evaluate(()=>classicImageEditor.state.open),false);
    assert.equal(await page.locator('.canvas-media-status').count(),0);
    assert.deepEqual(errors,[]);
});

test('Classic custom grid splits at the placed fractions and regular gaps retain edge geometry',async t=>{
    const {page,errors}=await editor(t,'grid');
    await page.evaluate(()=>toggleGridCustomMode());
    const b=await page.locator('#editDrawCanvas').boundingBox();
    await page.locator('#editDrawCanvas').click({position:{x:b.width*.25,y:b.height*.5}});
    await page.evaluate(()=>setGridCustomOrientation('v'));
    await page.locator('#editDrawCanvas').click({position:{x:b.width*.25,y:b.height*.25}});
    await page.evaluate(()=>applyImageEdit());
    assert.deepEqual(await page.evaluate(()=>editUploads.map(({w,h})=>({w,h}))),
        [{w:80,h:120},{w:240,h:120},{w:80,h:120},{w:240,h:120}]);
    await page.evaluate(()=>{openImageEditor('image-b','grid');editUploads=[];});
    await page.waitForFunction(()=>classicImageEditor.state.ready);
    await page.evaluate(()=>{applyGridPreset(2,2);const gap=document.getElementById('gridGapSize');gap.value='40';gap.dispatchEvent(new Event('input'));});
    await page.evaluate(()=>applyImageEdit());
    assert.deepEqual(await page.evaluate(()=>editUploads.map(({w,h})=>({w,h}))),Array.from({length:4},()=>({w:140,h:100})));
    assert.equal(await page.evaluate(()=>editSaves),2);
    assert.deepEqual(errors,[]);
});

test('Classic stale PNG encoding stops before upload and replacement canvas cannot reuse the same node id',async t=>{
    const {page,errors}=await editor(t);
    await page.evaluate(()=>{
        const original=HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob=function(callback,...args){
            original.call(this,blob=>{window.finishEditEncoding=()=>callback(blob);},...args);
        };
        window.pendingEdit=applyImageEdit();
    });
    await page.waitForFunction(()=>typeof finishEditEncoding==='function');
    await page.evaluate(()=>{canvas={...canvas,id:'replacement'};nodes=nodes.map(n=>({...n}));openImageEditor('image-a','grid');});
    await page.waitForFunction(()=>classicImageEditor.state.ready);
    await page.evaluate(async()=>{finishEditEncoding();await pendingEdit;});
    assert.equal(await page.evaluate(()=>editUploads.length),0);
    assert.equal(await page.evaluate(()=>editSaves),0);
    assert.equal(await page.evaluate(()=>classicImageEditor.state.mode),'grid');
    assert.deepEqual(errors,[]);
});

test('Classic failed upload can retry without losing the draft or issuing duplicate saves',async t=>{
    const {page,errors}=await editor(t);
    await page.evaluate(async()=>{
        const original=CanvasApi.uploadAi;
        CanvasApi.uploadAi=async()=>{throw new Error('test upload failure');};
        await applyImageEdit().catch(error=>{window.editFailure=error.message;});
        CanvasApi.uploadAi=original;
    });
    assert.equal(await page.evaluate(()=>editFailure),'test upload failure');
    assert.equal(await page.evaluate(()=>classicImageEditor.state.ready),true);
    assert.equal(await page.evaluate(()=>editSaves),0);
    await page.evaluate(()=>applyImageEdit());
    assert.equal(await page.evaluate(()=>editSaves),1);
    assert.deepEqual(errors,[]);
});

test('Classic cancelled inline focus cannot focus a detached editor after close',async t=>{
    const {page,errors}=await editor(t,'brush');
    await page.evaluate(()=>setBrushTool('text'));
    const b=await page.locator('#editTextCanvas').boundingBox();
    await page.mouse.click(b.x+b.width/2,b.y+b.height/2);
    assert.deepEqual(await page.evaluate(()=>{
        const request=window.requestAnimationFrame,cancel=window.cancelAnimationFrame;
        let callback,focused=0,cancelled=0;
        window.requestAnimationFrame=fn=>{callback=fn;return 789;};
        window.cancelAnimationFrame=id=>{if(id===789)cancelled++;else cancel(id);};
        const canvasEl=document.getElementById('editTextCanvas'),b=canvasEl.getBoundingClientRect();
        canvasEl.dispatchEvent(new MouseEvent('dblclick',{clientX:b.x+b.width/2,clientY:b.y+b.height/2,bubbles:true}));
        document.querySelector('.edit-text-inline').focus=()=>{focused++;};
        closeImageEditor();
        window.requestAnimationFrame=request;window.cancelAnimationFrame=cancel;
        callback();
        return {focused,cancelled,inline:document.querySelectorAll('.edit-text-inline').length};
    }),{focused:0,cancelled:1,inline:0});
    assert.deepEqual(errors,[]);
});

test('Classic read-only lease keeps editor close and view navigation from saving',async t=>{
    const {page,errors,writes}=await editor(t,'crop',true);
    await page.evaluate(()=>MemberCanvasEdit.setEditable(false));
    await page.evaluate(()=>{resetCropBox();resetImageEditZoom();setImageEditMode('preview');closeImageEditor();});
    assert.equal(await page.evaluate(()=>editSaves),0);
    assert.equal(writes.filter(w=>w.method==='PUT'&&w.path==='/api/canvases/canvas-test').length,0);
    assert.deepEqual(errors,[]);
});
