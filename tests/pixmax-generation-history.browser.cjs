const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');
const asset=(index,kind='image')=>({id:'ast_'+index.toString(16).padStart(32,'0'),url:kind==='image'?'/test-image.svg':'/assets/history-'+kind+'.'+({video:'webm',audio:'mp3',model:'glb',file:'txt'}[kind]||'png'),name:kind+'-'+index,kind,created_at:index%2?'2026-10-14T12:00:00+08:00':'2026-10-13T23:00:00Z',task_id:'task-'+index,canvas_id:'canvas-test',model:'test'});
const card=(page,index)=>page.locator('[data-history-asset="'+asset(index).id+'"]');
async function setup(t,{items=[asset(1),asset(2,'video'),asset(3,'audio'),asset(4,'model'),asset(5,'file')],pageSize=100,holdFirst=false}={}){
    const queries=[];let release;const held=new Promise(resolve=>release=resolve);let first=true;
    const f=await fixture(t,'smart',true,{secureOrigin:true,apiHandler:async request=>{
        const url=new URL(request.url());if(url.pathname==='/api/canvas-generation-history'){
            queries.push(Object.fromEntries(url.searchParams));if(holdFirst&&first){first=false;await held;}
            const filtered=items.filter(item=>url.searchParams.get('kind')==='all'||item.kind===url.searchParams.get('kind')),offset=Number(url.searchParams.get('cursor')||0);
            return {status:200,body:{items:filtered.slice(offset,offset+pageSize),next_cursor:offset+pageSize<filtered.length?String(offset+pageSize):null}};
        }
        if(url.pathname.startsWith('/api/canvas-generation-history/'))return {status:200,body:{item:items.find(item=>item.id===url.pathname.split('/').pop()),parameters:{prompt:'雨夜故事',model:'test'}}};
    }});
    await f.page.evaluate(()=>{Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});});
    for(const [kind,filename,type] of [['video','smart-video-trim.webm','video/webm'],['audio','pixmax-generated-audio.mp3','audio/mpeg'],['model','pixmax-generated-model.glb','model/gltf-binary']])await f.page.route('**/assets/history-'+kind+'.*',route=>route.fulfill({path:path.resolve('tests/fixtures/'+filename),contentType:type}));
    return {...f,queries,release};
}
async function open(page){await page.locator('.pixmax-rail').getByRole('button',{name:'生成历史',exact:true}).click();await page.locator('.history-asset').first().waitFor();}
test('history uses native scope/type controls, UTC date groups and 88px asset cards without generation requests',async t=>{
    const {page,queries,writes,errors}=await setup(t);await open(page);assert.equal(await page.locator('.history-asset').count(),5);assert.equal(await page.locator('.history-assets video,.history-assets audio').count(),0);
    assert.deepEqual(await page.locator('.history-day header>span').allTextContents(),['2026-10-14','2026-10-13']);const box=await page.locator('.history-asset').first().boundingBox();assert.equal(box.width,88);assert.equal(box.height,88);
    await page.locator('[data-history-kind="video"]').click();await page.waitForFunction(()=>document.querySelectorAll('.history-asset').length===1);assert.equal(queries.at(-1).kind,'video');assert.equal(queries.at(-1).canvas_id,'canvas-test');
    await page.locator('[data-history-scope="all"]').click();await page.waitForFunction(()=>document.querySelectorAll('.history-asset').length===5);assert.equal(queries.at(-1).kind,'all');assert.equal(queries.at(-1).canvas_id,undefined);
    await page.screenshot({path:'.local/pixmax-generation-history.png'});assert.equal(writes.filter(item=>/canvas-.*-tasks$/.test(item.path)).length,0);assert.deepEqual(errors,[]);
});
test('single and batch insertion create separate native base nodes in the 119/20 cascade and undo preserves history',async t=>{
    const {page,errors}=await setup(t);await open(page);
    await page.locator('.history-asset').first().hover();await page.locator('.history-asset').first().locator('[data-history-insert]').click();assert.equal(await page.evaluate(()=>nodes.length),1);assert.equal(await page.evaluate(()=>nodes[0].generationKind),undefined);
    await page.locator('[data-history-select]').click();await card(page,2).click();await card(page,3).click();await card(page,4).click();await page.locator('[data-history-batch-insert]').click();
    assert.equal(await page.evaluate(()=>nodes.length),4);assert.deepEqual(await page.evaluate(()=>nodes.slice(1).map(node=>[node.x-nodes[1].x,node.y-nodes[1].y])),[[0,0],[119,20],[238,40]]);
    assert.equal(await page.evaluate(()=>nodes[3].pixmaxSourceType),'BASE_3D');assert.equal(await page.evaluate(()=>nodes.every(node=>!node.generationKind&&!node.pendingTasks)),true);
    await page.evaluate(()=>performUndo());assert.equal(await page.evaluate(()=>nodes.length),1);assert.equal(await page.locator('.history-asset').count(),5);assert.deepEqual(errors,[]);
});
test('file assets can be selected for download but cannot be inserted or dragged into the canvas',async t=>{
    const {page,errors}=await setup(t);await open(page);await page.locator('[data-history-kind="file"]').click();await page.waitForFunction(()=>document.querySelectorAll('.history-asset').length===1);
    assert.equal(await page.locator('[data-history-insert]').count(),0);assert.equal(await page.locator('.history-asset').getAttribute('draggable'),'false');await page.locator('[data-history-select]').click();await page.locator('.history-asset').click();assert.equal(await page.locator('[data-history-batch-insert]').isDisabled(),true);assert.equal(await page.locator('[data-history-batch-download]').isEnabled(),true);assert.deepEqual(errors,[]);
});
test('date group selection is limited to 100 assets across pages and filters, with deselection and clear on exit',async t=>{
    const {page,errors}=await setup(t,{items:Array.from({length:102},(_,i)=>({...asset(i+1),created_at:'2026-10-14T12:00:00Z'})),pageSize:100});await open(page);await page.locator('[data-history-select]').click();await page.locator('[data-history-group]').click();assert.match(await page.locator('[data-history-count]').textContent(),/100/);
    await page.locator('[data-history-more]').click();await page.waitForFunction(()=>document.querySelectorAll('.history-asset').length===102);await page.locator('.history-asset').last().click();assert.match(await page.locator('.pixmax-generation-history [role=status]').textContent(),/最多选择 100/);assert.match(await page.locator('[data-history-count]').textContent(),/100/);
    await page.locator('.history-asset').first().click();await page.locator('.history-asset').last().click();assert.match(await page.locator('[data-history-count]').textContent(),/100/);await page.locator('[data-history-select]').click();assert.match(await page.locator('[data-history-count]').textContent(),/0/);assert.deepEqual(errors,[]);
});
test('a late previous filter response cannot overwrite the current video filter',async t=>{
    const {page,release,errors}=await setup(t,{holdFirst:true});await page.evaluate(()=>PixmaxGenerationHistory.open());await page.locator('[data-history-kind="video"]').click();await page.waitForFunction(()=>document.querySelectorAll('.history-asset').length===1);release();await page.waitForTimeout(40);assert.equal(await page.locator('.history-asset').count(),1);assert.equal(await page.locator('.history-asset-label').textContent(),'视频');assert.deepEqual(errors,[]);
});
for(const change of ['workspace','document','session','close'])test('history pending response is retired after '+change,async t=>{
    const {page,release,errors}=await setup(t,{holdFirst:true});await page.evaluate(()=>PixmaxGenerationHistory.open());await page.evaluate(change=>{if(change==='workspace')CanvasSession.context.workspace.id='other';else if(change==='document')canvas={...canvas,id:'new-canvas'};else if(change==='session')CanvasSession.enabled=false;else PixmaxGenerationHistory.close();if(change!=='close')render();},change);release();await page.waitForFunction(()=>!PixmaxGenerationHistory.opened);assert.equal(await page.locator('.pixmax-generation-history').count(),0);assert.equal(await page.evaluate(()=>nodes.length),0);assert.deepEqual(errors,[]);
});
test('readonly history can browse and preview a real video while insertion remains blocked',async t=>{
    const {page,errors}=await setup(t);await page.evaluate(()=>MemberCanvasEdit.setEditable(false));await open(page);
    assert.equal(await page.locator('[data-history-insert]').first().isDisabled(),true);const video=card(page,2);await video.hover();await video.locator('[data-history-view]').click();await page.locator('.history-detail-preview video').waitFor();await page.waitForFunction(()=>document.querySelector('.history-detail-preview video').readyState>=2);
    assert.equal(await page.locator('[data-history-detail-insert]').isDisabled(),true);await page.getByRole('button',{name:'关闭生成素材预览'}).click();assert.equal(await page.evaluate(()=>nodes.length),0);assert.deepEqual(errors,[]);
});
test('history previews a real GLB without inserting a temporary node and closes on workspace change',async t=>{
    const {page,errors}=await setup(t);await page.evaluate(()=>MemberCanvasEdit.setEditable(false));await open(page);const model=card(page,4);await model.hover();await model.locator('[data-history-view]').click();await page.locator('[data-history-model]').click();await page.waitForFunction(()=>PixmaxModelPreview.state.triangles===12);assert.equal(await page.evaluate(()=>nodes.length),0);
    await page.evaluate(()=>{CanvasSession.context.workspace.id='other';render();});await page.waitForFunction(()=>!PixmaxModelPreview.state.opened);assert.deepEqual(errors,[]);
});
test('history drag validates the panel session and inserts at the actual world drop point',async t=>{
    const {page,errors}=await setup(t);await open(page);const id=await page.locator('.history-asset').first().getAttribute('data-history-asset');
    await page.evaluate(id=>{const transfer=new DataTransfer(),card=document.querySelector('[data-history-asset="'+id+'"]');card.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));shell.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer,clientX:300,clientY:250}));},id);
    assert.equal(await page.evaluate(()=>nodes.length),1);assert.deepEqual(await page.evaluate(()=>[nodes[0].x,nodes[0].y]),[300,250]);
    await page.evaluate(()=>{const transfer=new DataTransfer();transfer.setData('application/x-pixmax-history-asset',JSON.stringify({session:'forged',id:'ast_'+('1'.padStart(32,'0'))}));shell.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer,clientX:600,clientY:450}));});assert.equal(await page.evaluate(()=>nodes.length),1);assert.deepEqual(errors,[]);
});
test('readonly batch ZIP download preserves selected asset names and never writes a canvas',async t=>{
    const {page,writes,errors}=await setup(t);let payload;
    await page.route('**/api/canvas-assets/download',route=>{payload=route.request().postDataJSON();return route.fulfill({body:Buffer.from('isolated ZIP response'),contentType:'application/zip'});});
    await page.evaluate(()=>MemberCanvasEdit.setEditable(false));await open(page);await page.locator('[data-history-select]').click();await card(page,1).click();await card(page,5).click();
    const download=page.waitForEvent('download');await page.locator('[data-history-batch-download]').click();assert.equal((await download).suggestedFilename(),'pixmax-assets.zip');assert.deepEqual(payload.items.map(item=>item.name),['image-1','file-5']);assert.equal(writes.filter(item=>item.method==='PUT').length,0);assert.deepEqual(errors,[]);
});
test('inserting an old result saves a base node, keeps the immutable history and supports undo/reload',async t=>{
    const {page,errors}=await setup(t);await open(page);await card(page,2).hover();await card(page,2).locator('[data-history-insert]').click();
    assert.equal(await page.evaluate(()=>saveCanvas({force:true})),true);await page.reload();await page.waitForFunction(()=>nodes.length===1);assert.equal(await page.evaluate(()=>nodes[0].pixmaxSourceType),'BASE_VIDEO');assert.equal(await page.evaluate(()=>nodes[0].generationKind),undefined);
    await open(page);assert.equal(await page.locator('.history-asset').count(),5);assert.deepEqual(errors,[]);
});
test('the enabled video history action opens the video filter without modifying the source or submitting a task',async t=>{
    const {page,writes,queries,errors}=await setup(t);await page.evaluate(()=>{const node=createNode(260,250,[{url:'/assets/history-video.webm',kind:'video',name:'video'}]);smartSelection.createdNode(node.id);render();});
    const before=await page.evaluate(()=>JSON.stringify(nodes));await page.getByRole('toolbar',{name:'视频节点工具'}).getByRole('button',{name:'生成历史',exact:true}).click();await page.locator('.history-asset').waitFor();assert.equal(queries.at(-1).kind,'video');assert.equal(await page.evaluate(()=>JSON.stringify(nodes)),before);assert.equal(writes.filter(item=>/canvas-.*-tasks$/.test(item.path)).length,0);assert.deepEqual(errors,[]);
});
