const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function setup(t,member=false){
    const f=await fixture(t,'classic',member),{page}=f;await page.waitForLoadState('networkidle');
    await page.evaluate(()=>{
        nodes=[{id:'prompt',type:'prompt',text:'existing text',x:10,y:10,w:380,h:300}];render();
        window.gateNode=nodesEl.firstElementChild;window.gateInput=gateNode.querySelector('textarea');
        window.gateSaveCount=0;scheduleSave=()=>gateSaveCount++;
        canvases=[{...canvas,title:'Alpha 10',folder_id:'one',updated_at:10},
            {id:'two',title:'Alpha 2',folder_id:'one',updated_at:20,pinned:true},
            {id:'three',title:'ＢＥＴＡ',folder_id:'child',updated_at:30,kind:'smart',icon:'✨',color:' red ',cover_style:'sage'},
            {id:'other',title:'Other',folder_id:'',updated_at:1}];
        deletedCanvases=[{id:'gone',title:'Removed',deleted_at:10,pinned:true,folder_id:'missing'}];
        canvasFolders=[{id:'one',name:'One'},{id:'child',name:'Child',parent_id:'one'}];
        activeFolderId='all';canvasSearchQuery='';trashMode=false;canvasSortMode='recent';sortCanvasListByUpdated();
        // Present the manager above a live workspace, without invoking the document's
        // existing close operation (which intentionally removes workspace DOM).
        Object.assign(canvasGate.style,{display:'flex',visibility:'visible',opacity:'1',pointerEvents:'auto'});
        renderCanvasList();
    });
    return f;
}
const ids=page=>page.locator('#gateCanvasList .canvas-item').evaluateAll(rows=>rows.map(r=>r.dataset.canvasId));
test('Classic one paint shares a pure model across controls, folders and cards without mutating data',async t=>{
    const {page,errors,writes}=await setup(t);const beforeWrites=writes.length;
    const result=await page.evaluate(()=>{
        const api=ClassicCanvasGateModel;let builds=0;window.ClassicCanvasGateModel={...api,build:data=>{builds++;return api.build(data);}};
        for(const item of [...canvases,...deletedCanvases,...canvasFolders])Object.freeze(item);
        const before=JSON.stringify({canvases,deletedCanvases,canvasFolders,activeFolderId,canvasSearchQuery,canvasSortMode,trashMode});
        renderCanvasList();renderCanvasList();
        return {builds,unchanged:before===JSON.stringify({canvases,deletedCanvases,canvasFolders,activeFolderId,canvasSearchQuery,canvasSortMode,trashMode}),
            sameNode:gateNode===nodesEl.firstElementChild,sameInput:gateInput===gateNode.querySelector('textarea'),saves:gateSaveCount,
            folderCount:document.querySelector('[data-folder-id="one"] .gate-folder-count').textContent,
            smartStyle:document.querySelector('[data-canvas-id="three"]').dataset.coverStyle};
    });
    assert.deepEqual(result,{builds:2,unchanged:true,sameNode:true,sameInput:true,saves:0,folderCount:'2',smartStyle:'sage'});
    assert.equal(writes.length,beforeWrites);assert.deepEqual(errors,[]);
});
test('Classic complete search, clear, folder and sort operations update only gate presentation',async t=>{
    const {page,errors}=await setup(t);
    await page.evaluate(()=>{window.gateWorkspaceRenders=0;window.commandModels=0;const api=ClassicCanvasGateModel;
        window.ClassicCanvasGateModel={...api,build:data=>{commandModels++;return api.build(data);}};
        const old=render;render=(...args)=>{gateWorkspaceRenders++;return old(...args);};searchCanvases('beta');});
    assert.deepEqual(await ids(page),['three']);assert.equal(await page.locator('#gateCountPill').innerText(),'1 个');
    await page.evaluate(()=>clearCanvasSearch(true));assert.equal(await page.locator('#gateSearchInput').evaluate(el=>el===document.activeElement),true);
    await page.evaluate(()=>setActiveFolder('one'));assert.deepEqual(await ids(page),['two','canvas-test']);
    await page.locator('#gateSearchInput').fill('missing');assert.equal(await page.locator('.gate-list-empty').innerText(),'没有找到匹配的画布');
    await page.locator('#gateSearchInput').press('Escape');assert.deepEqual(await ids(page),['two','canvas-test']);
    await page.evaluate(()=>{setActiveFolder('all');setCanvasSortMode('name');});assert.deepEqual(await ids(page),['two','canvas-test','three','other']);
    assert.equal(await page.evaluate(()=>localStorage.getItem('canvasSortMode')),'name');
    assert.deepEqual(await page.evaluate(()=>({renders:gateWorkspaceRenders,saves:gateSaveCount,sameNode:gateNode===nodesEl.firstElementChild,models:commandModels})),{renders:0,saves:0,sameNode:true,models:7});
    assert.deepEqual(errors,[]);
});
test('Classic trash source, confirmation and restore controls retain old differences',async t=>{
    const {page,errors}=await setup(t);
    await page.evaluate(()=>{trashMode=true;activeFolderId='one';pendingPurgeCanvasId=null;renderCanvasList();});
    assert.deepEqual(await ids(page),['gone']);assert.equal(await page.locator('.canvas-pin-btn').count(),0);assert.equal(await page.locator('.canvas-restore').count(),1);
    await page.evaluate(()=>{pendingPurgeCanvasId='gone';renderCanvasList();});assert.equal(await page.locator('.canvas-delete-confirm').count(),1);
    await page.evaluate(()=>searchCanvases('not found'));assert.equal(await page.locator('.gate-list-empty').innerText(),'没有找到匹配的画布');
    await page.evaluate(()=>{deletedCanvases=[];clearCanvasSearch();});assert.equal(await page.locator('.gate-list-empty').innerText(),'回收站为空');assert.deepEqual(errors,[]);
});
test('Classic card commands keep exact API writes and metadata updates without canvas saves',async t=>{
    const {page,errors}=await setup(t);
    await page.evaluate(()=>{
        window.gateRequests=[];CanvasApi.patchCanvasMeta=async(id,patch)=>{gateRequests.push({id,patch});return {canvas:{id,...patch}};};
        CanvasApi.moveCanvasToFolder=async(id,folder)=>{gateRequests.push({id,folder});return {canvas:{id,folder_id:folder}};};
    });
    await page.evaluate(()=>togglePinCanvas('three'));
    await page.waitForFunction(()=>gateRequests.length===1);
    await page.evaluate(()=>moveCanvasToFolder('three','one'));
    assert.deepEqual(await page.evaluate(()=>gateRequests),[{id:'three',patch:{pinned:true}},{id:'three',folder:'one'}]);
    assert.equal(await page.evaluate(()=>canvases.find(c=>c.id==='three').folder_id),'one');assert.equal(await page.evaluate(()=>gateSaveCount),0);assert.deepEqual(errors,[]);
});
test('Classic member gate keeps document edit permission while local list search stays available',async t=>{
    const {page,errors,writes}=await setup(t,true);await page.evaluate(()=>MemberCanvasEdit.setEditable(false));
    const before=writes.length;await page.evaluate(()=>searchCanvases('alpha'));
    assert.deepEqual(await ids(page),['two','canvas-test']);assert.equal(await page.evaluate(()=>MemberCanvasEdit.canEdit),false);
    assert.equal(writes.length,before);assert.equal(await page.evaluate(()=>gateSaveCount),0);assert.deepEqual(errors,[]);
});
