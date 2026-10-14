const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');
const asset=(index,kind='image')=>({id:'ast_'+index.toString(16).padStart(32,'0'),url:kind==='image'?'/test-image.svg':'/assets/history-'+kind+'.'+({video:'webm',audio:'mp3',model:'glb',file:'txt'}[kind]||'png'),name:kind+'-'+index,kind,created_at:index%2?'2026-10-14T12:00:00+08:00':'2026-10-13T23:00:00Z',task_id:'task-'+index,canvas_id:'canvas-test',model:'test'});
const card=(page,index)=>page.locator('[data-history-asset="'+asset(index).id+'"]');
async function setup(t,{items=[asset(1),asset(2,'video'),asset(3,'audio'),asset(4,'model'),asset(5,'file')],pageSize=100,holdFirst=false}={}){
    const queries=[];let release;const held=new Promise(resolve=>release=resolve);let first=true;
    const f=await fixture(t,'smart',true,{secureOrigin:true,apiHandler:async request=>{
        const url=new URL(request.url());if(url.pathname==='/api/canvas-generation-history'){
            queries.push(Object.fromEntries(url.searchParams));if(holdFirst&&first){first=false;await held;}
            const filtered=items.filter(item=>(url.searchParams.get('kind')==='all'||item.kind===url.searchParams.get('kind'))&&(!url.searchParams.get('node_id')||!item.node_id||item.node_id===url.searchParams.get('node_id'))),offset=Number(url.searchParams.get('cursor')||0),size=Math.min(pageSize,Number(url.searchParams.get('limit')||100));
            return {status:200,body:{items:filtered.slice(offset,offset+size),next_cursor:offset+size<filtered.length?String(offset+size):null}};
        }
        if(url.pathname.startsWith('/api/canvas-generation-history/'))return {status:200,body:{item:items.find(item=>item.id===url.pathname.split('/').pop()),parameters:{prompt:'雨夜故事',model:'test'}}};
    }});
    await f.page.evaluate(()=>{Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});});
    for(const [kind,filename,type] of [['video','smart-video-trim.webm','video/webm'],['audio','pixmax-generated-audio.mp3','audio/mpeg'],['model','pixmax-generated-model.glb','model/gltf-binary']])await f.page.route('**/assets/history-'+kind+'.*',route=>route.fulfill({path:path.resolve('tests/fixtures/'+filename),contentType:type}));
    return {...f,queries,release};
}
async function open(page){await page.locator('.pixmax-rail').getByRole('button',{name:'生成历史',exact:true}).click();await page.locator('[data-history-expand]').click();await page.locator('.history-asset').first().waitFor();}
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
    const {page,writes,queries,errors}=await setup(t);const id=await page.evaluate(()=>{const node=createNode(260,250,[{url:'/assets/history-video.webm',kind:'video',name:'video'}]);smartSelection.createdNode(node.id);render();return node.id;});
    const before=await page.evaluate(()=>JSON.stringify(nodes));await page.getByRole('toolbar',{name:'视频节点工具'}).getByRole('button',{name:'生成历史',exact:true}).click();await page.locator('.history-asset').waitFor();assert.equal(queries.at(-1).kind,'video');assert.equal(queries.at(-1).node_id,id);assert.equal(queries.at(-1).limit,'15');assert.equal(await page.evaluate(()=>JSON.stringify(nodes)),before);assert.equal(writes.filter(item=>/canvas-.*-tasks$/.test(item.path)).length,0);assert.deepEqual(errors,[]);
});
test('native rail opens a nonmodal 436 by 500 popup and pages by 30 assets at the 80px scroll threshold',async t=>{
    const {page,queries,errors}=await setup(t,{items:Array.from({length:65},(_,i)=>asset(i+1))});await page.locator('.pixmax-rail').getByRole('button',{name:'生成历史',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.history-asset').length===30);
    const root=page.getByRole('dialog',{name:'生成历史小弹层'}),box=await root.locator('.history-panel').boundingBox(),rail=await page.locator('.pixmax-rail').boundingBox();assert.equal(await root.getAttribute('aria-modal'),'false');assert.equal(box.width,436);assert.equal(box.height,500);assert.equal(box.x,rail.x+rail.width+8);assert.equal(queries.at(-1).limit,'30');assert.equal(await page.locator('[data-history-select]').isVisible(),false);
    await page.evaluate(()=>{const scroll=document.querySelector('.history-scroll');scroll.scrollTop=scroll.scrollHeight;scroll.dispatchEvent(new Event('scroll'));});await page.waitForFunction(()=>document.querySelectorAll('.history-asset').length===60);assert.equal(queries.at(-1).cursor,'30');await page.locator('[data-history-more]').click();await page.waitForFunction(()=>document.querySelectorAll('.history-asset').length===65);assert.equal(await page.locator('[data-history-more]').isVisible(),false);
    await page.screenshot({path:'.local/pixmax-generation-history-compact.png'});assert.deepEqual(errors,[]);
});
test('expanding the compact native popup starts the full current-project all-media history at 100 per page',async t=>{
    const {page,queries,errors}=await setup(t);await page.locator('.pixmax-rail').getByRole('button',{name:'生成历史',exact:true}).click();await page.locator('.history-asset').first().waitFor();await page.locator('[data-history-scope="all"]').click();await page.locator('[data-history-kind="video"]').click();await page.waitForFunction(()=>document.querySelectorAll('.history-asset').length===1);
    await page.locator('[data-history-expand]').click();await page.waitForFunction(()=>document.querySelectorAll('.history-asset').length===5);assert.deepEqual(queries.at(-1),{kind:'all',limit:'100',canvas_id:'canvas-test'});assert.equal(await page.getByRole('dialog',{name:'历史记录',exact:true}).getAttribute('aria-modal'),'true');assert.equal(await page.locator('[data-history-select]').isVisible(),true);assert.deepEqual(errors,[]);
});
test('compact popup toggles on its trigger, closes outside or on Escape and fits a small viewport after resize',async t=>{
    const {page,errors}=await setup(t),trigger=page.locator('.pixmax-rail').getByRole('button',{name:'生成历史',exact:true});
    await trigger.click();await page.locator('.history-asset').first().waitFor();await trigger.click();assert.equal(await page.evaluate(()=>PixmaxGenerationHistory.opened),false);
    await trigger.click();await page.locator('.history-asset').first().waitFor();await page.mouse.click(800,200);assert.equal(await page.evaluate(()=>PixmaxGenerationHistory.opened),false);
    await trigger.click();await page.locator('.history-asset').first().waitFor();await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>PixmaxGenerationHistory.opened),false);
    await trigger.click();await page.setViewportSize({width:420,height:480});const panel=page.locator('.history-panel');await page.waitForFunction(()=>document.querySelector('.history-panel').getBoundingClientRect().right<=innerWidth);const box=await panel.boundingBox();assert.ok(box.x>=12&&box.y>=12&&box.x+box.width<=420&&box.y+box.height<=480);assert.deepEqual(errors,[]);
});
test('a compact media preview suspends outside dismissal and closing its player leaves the history open',async t=>{
    const {page,errors}=await setup(t);await page.locator('.pixmax-rail').getByRole('button',{name:'生成历史',exact:true}).click();await card(page,2).hover();await card(page,2).locator('[data-history-view]').click();await page.waitForFunction(()=>document.querySelector('.history-detail-preview video')?.readyState>=2);
    await page.evaluate(()=>document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})));assert.equal(await page.evaluate(()=>PixmaxGenerationHistory.opened),true);await page.getByRole('button',{name:'关闭生成素材预览'}).click();assert.equal(await page.locator('.history-detail-preview video').count(),0);assert.equal(await page.evaluate(()=>PixmaxGenerationHistory.opened),true);await page.mouse.click(800,200);assert.equal(await page.evaluate(()=>PixmaxGenerationHistory.opened),false);assert.deepEqual(errors,[]);
});
test('expansion retires the compact request so a delayed 30-item response cannot replace the full history',async t=>{
    const {page,release,queries,errors}=await setup(t,{holdFirst:true});await page.locator('.pixmax-rail').getByRole('button',{name:'生成历史',exact:true}).click();await page.locator('[data-history-expand]').click();await page.locator('.history-asset').first().waitFor();release();await page.waitForTimeout(40);assert.equal(await page.locator('.history-compact').count(),0);assert.equal(queries.at(-1).limit,'100');assert.equal(await page.locator('.history-asset').count(),5);assert.deepEqual(errors,[]);
});
test('compact history dragging makes the popup transparent to the real canvas drop target',async t=>{
    const {page,errors}=await setup(t);await page.locator('.pixmax-rail').getByRole('button',{name:'生成历史',exact:true}).click();await card(page,1).waitFor();
    const result=await page.evaluate(id=>{const transfer=new DataTransfer(),asset=document.querySelector('[data-history-asset="'+id+'"]');asset.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));const rect=document.querySelector('.history-panel').getBoundingClientRect(),point={x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2)},target=document.elementFromPoint(point.x,point.y);target.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer,clientX:point.x,clientY:point.y}));return {canvasTarget:!!target.closest('#shell'),point,position:[nodes[0]?.x,nodes[0]?.y]};},asset(1).id);
    assert.equal(result.canvasTarget,true);assert.deepEqual(result.position,[result.point.x,result.point.y]);assert.deepEqual(errors,[]);
});
test('node history uses a 310 by 400 grid, 15-item pages and arrows only for this node’s media list',async t=>{
    const items=[...Array.from({length:17},(_,i)=>({...asset(i+1),node_id:'current'})),{...asset(200),node_id:'unrelated'}],{page,queries,errors}=await setup(t,{items});
    await page.evaluate(()=>{nodes=[{id:'current',type:'smart-image',generationKind:'image',x:250,y:250,images:[{url:'/test-image.svg',kind:'image'}]}];render();PixmaxGenerationHistory.openNode(nodes[0],document.querySelector('.pixmax-rail'));});
    await page.waitForFunction(()=>document.querySelectorAll('.history-asset').length===15);const box=await page.locator('.history-node .history-panel').boundingBox();assert.equal(box.width,310);assert.equal(box.height,400);assert.equal(await page.locator('.history-node .history-day header').isVisible(),false);assert.equal(queries.at(-1).node_id,'current');assert.equal(queries.at(-1).limit,'15');
    await page.locator('[data-history-more]').click();await page.waitForFunction(()=>document.querySelectorAll('.history-asset').length===17);await card(page,2).hover();await card(page,2).locator('[data-history-view]').click();await page.locator('[data-history-prev]').waitFor({state:'visible'});assert.equal(await page.locator('[data-history-next]').isVisible(),true);assert.equal(await card(page,2).locator('[data-history-last-viewed]').textContent(),'上次查看');
    await page.locator('[data-history-next]').click();await page.waitForFunction(()=>document.querySelector('.pixmax-history-detail .pixmax-creation-content>p')?.textContent==='image-3');await page.keyboard.press('ArrowLeft');await page.waitForFunction(()=>document.querySelector('.pixmax-history-detail .pixmax-creation-content>p')?.textContent==='image-2');assert.deepEqual(errors,[]);
});
test('node history insertion closes the popup, and replacing the current node closes a stale popup',async t=>{
    const {page,errors}=await setup(t,{items:[asset(1)]});await page.evaluate(()=>{nodes=[{id:'current',type:'smart-image',generationKind:'image',x:250,y:250,images:[{url:'/test-image.svg',kind:'image'}]}];render();PixmaxGenerationHistory.openNode(nodes[0],document.querySelector('.pixmax-rail'));});await card(page,1).hover();await card(page,1).locator('[data-history-insert]').click();assert.equal(await page.evaluate(()=>nodes.length),2);assert.equal(await page.evaluate(()=>PixmaxGenerationHistory.opened),false);
    await page.evaluate(()=>PixmaxGenerationHistory.openNode(nodes[0],document.querySelector('.pixmax-rail')));await card(page,1).waitFor();await page.evaluate(()=>{nodes[0]={...nodes[0]};render();});await page.waitForFunction(()=>!PixmaxGenerationHistory.opened);assert.deepEqual(errors,[]);
});
test('readonly image detail uses native cursor-centred zoom, panning, bounds and double-click reset without editing the graph',async t=>{
    const {page,errors}=await setup(t);await page.evaluate(()=>MemberCanvasEdit.setEditable(false));await open(page);await card(page,1).hover();await card(page,1).locator('[data-history-view]').click();await page.locator('.history-image-view img').waitFor();assert.equal(await page.locator('[data-history-prev]').isVisible(),false);assert.equal(await page.locator('[data-history-next]').isVisible(),false);
    const before=await page.evaluate(()=>JSON.stringify([nodes,viewport])),view=page.locator('.history-image-view'),box=await view.boundingBox();await page.mouse.move(Math.round(box.x+box.width/2+50),Math.round(box.y+box.height/2));await page.mouse.wheel(0,-100);await page.waitForFunction(()=>Number(document.querySelector('.history-image-view').dataset.imageScale)>1);assert.ok(Math.abs(Number(await view.getAttribute('data-image-scale'))-1.15)<1e-6);assert.ok(Number(await view.getAttribute('data-image-x'))<0);
    await page.mouse.move(box.x+box.width/2,box.y+50);await page.mouse.down();await page.mouse.move(box.x+box.width/2+40,box.y+70,{steps:5});await page.mouse.up();assert.ok(Number(await view.getAttribute('data-image-x'))>20);await page.mouse.dblclick(box.x+box.width/2,box.y+60);assert.equal(await view.getAttribute('data-image-scale'),'1');assert.equal(await view.getAttribute('data-image-x'),'0');
    await page.evaluate(()=>{const pane=document.querySelector('.history-image-view');for(let i=0;i<50;i++)pane.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:-100}));});assert.equal(await view.getAttribute('data-image-scale'),'5');assert.equal(await page.getByRole('button',{name:'放大图片'}).isDisabled(),true);
    await page.evaluate(()=>{const pane=document.querySelector('.history-image-view');for(let i=0;i<50;i++)pane.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:100}));});assert.equal(await view.getAttribute('data-image-scale'),'0.5');assert.equal(await page.getByRole('button',{name:'缩小图片'}).isDisabled(),true);assert.equal(await page.evaluate(()=>JSON.stringify([nodes,viewport])),before);assert.deepEqual(errors,[]);
});

for(const readonly of [false,true])test(`image generation toolbar opens only its node history ${readonly?'for a viewer':'while editing'}`,async t=>{
    const items=[{...asset(1),node_id:'image-current'},{...asset(2),node_id:'other-image'}],{page,queries,writes,errors}=await setup(t,{items});
    await page.evaluate(()=>{nodes=[{id:'image-current',type:'smart-image',generationKind:'image',x:300,y:180,images:[{url:'/test-image.svg',kind:'image'}]},{id:'image-base',type:'smart-image',pixmaxSourceType:'BASE_IMAGE',x:750,y:300,images:[{url:'/test-image.svg',kind:'image'}]}];smartSelection.createdNode('image-current');render();});
    if(readonly)await page.evaluate(()=>MemberCanvasEdit.setEditable(false));
    assert.equal(await page.locator('[data-id="image-base"] [data-smart-node-action="image-history"]').count(),0);
    const before=await page.evaluate(()=>JSON.stringify([nodes,canvas.connections]));await page.locator('[data-smart-node-action="image-history"]').click();await card(page,1).waitFor();
    assert.equal(await page.locator('.history-asset').count(),1);assert.equal(queries.at(-1).node_id,'image-current');assert.equal(queries.at(-1).kind,'image');assert.equal(queries.at(-1).limit,'15');
    await card(page,1).hover();await card(page,1).locator('[data-history-view]').click();await page.locator('.history-image-view img').waitFor();assert.equal(await page.locator('[data-history-detail-insert]').isDisabled(),readonly);assert.equal(await page.locator('[data-history-prev]').isVisible(),false);assert.equal(await page.locator('[data-history-next]').isVisible(),false);
    assert.equal(await page.evaluate(()=>JSON.stringify([nodes,canvas.connections])),before);assert.equal(writes.filter(item=>/canvas-.*-tasks$/.test(item.path)).length,0);assert.deepEqual(errors,[]);
});

for(const readonly of [false,true])test(`model generation launcher opens scoped history and a real readonly GLB ${readonly?'for a viewer':'while editing'}`,async t=>{
    const items=[{...asset(4,'model'),node_id:'model-current'},{...asset(5,'model'),node_id:'other-model'}],{page,queries,writes,errors}=await setup(t,{items});
    await page.evaluate(()=>{nodes=[{id:'model-current',type:'smart-model',x:400,y:150,w:340,h:300,images:[{url:'/assets/history-model.glb',kind:'model',name:'当前模型'}]}];smartSelection.createdNode('model-current');render();});
    if(readonly)await page.evaluate(()=>MemberCanvasEdit.setEditable(false));
    const before=await page.evaluate(()=>JSON.stringify([nodes,canvas.connections]));await page.locator('[data-studio-history]').click();await card(page,4).waitFor();
    assert.equal(await page.locator('.history-asset').count(),1);assert.equal(queries.at(-1).node_id,'model-current');assert.equal(queries.at(-1).kind,'model');assert.equal(queries.at(-1).limit,'15');
    await card(page,4).hover();await card(page,4).locator('[data-history-view]').click();await page.locator('[data-history-model]').click();await page.waitForFunction(()=>PixmaxModelPreview.state.triangles===12);
    await page.locator('.pixmax-model-preview').click({position:{x:10,y:10}});assert.equal(await page.evaluate(()=>PixmaxGenerationHistory.opened),true);
    await page.keyboard.press('Escape');await page.locator('.pixmax-model-preview').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>PixmaxGenerationHistory.opened),true);
    assert.equal(await page.locator('[data-history-detail-insert]').isDisabled(),readonly);assert.equal(await page.locator('[data-history-prev]').isVisible(),false);assert.equal(await page.locator('[data-history-next]').isVisible(),false);assert.equal(await page.evaluate(()=>JSON.stringify([nodes,canvas.connections])),before);assert.equal(writes.filter(item=>/canvas-.*-tasks$/.test(item.path)).length,0);assert.deepEqual(errors,[]);
});

test('base models and model generation nodes without a result have no native history launcher',async t=>{
    const {page,errors}=await setup(t);await page.evaluate(()=>{nodes=[{id:'base-model',type:'smart-model',pixmaxSourceType:'BASE_3D',x:200,y:180,images:[{url:'/assets/history-model.glb',kind:'model'}]},{id:'empty-model',type:'smart-model',x:650,y:180,images:[]}];render();});
    assert.equal(await page.locator('[data-studio-history]').count(),0);assert.deepEqual(errors,[]);
});
