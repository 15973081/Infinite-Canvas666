const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function setup(t){
    const result=await fixture(t,'smart',true,{secureOrigin:true});await result.page.addScriptTag({url:'/static/js/canvas-task-bindings.js'});
    await result.page.evaluate(()=>{
        Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});
        nodes=[{id:'a',type:'smart-prompt',x:260,y:250,w:240,h:240,text:'故事',images:[]},{id:'b',type:'smart-image',generationKind:'image',x:580,y:250,promptDraftText:'镜头',images:[],runSettings:{engine:'api',apiKind:'image'}}];canvas.connections=[{from:'a',to:'b',kind:'input'}];render();smartSelection.insertedNodes(['a','b']);
    });return result;
}
async function group(page){await page.keyboard.press('Control+g');await page.locator('.pixmax-frame-node').waitFor();}
test('Ctrl G creates a frame around separate nodes, preserves their wire and does not change the input digest',async t=>{
    const {page,errors}=await setup(t),before=await page.evaluate(()=>CanvasTaskBindings.graphCanonical(smartTaskInputDocument(),'b','b'));await group(page);
    const result=await page.evaluate(()=>({types:nodes.map(node=>node.type),members:nodes.slice(0,2).map(node=>node.frameId),id:nodes[2].id,links:canvas.connections,digest:CanvasTaskBindings.graphCanonical(smartTaskInputDocument(),'b','b'),ports:document.querySelectorAll('.pixmax-frame-node .node-port').length,composer:composer.classList.contains('open')}));
    assert.deepEqual(result.types,['smart-prompt','smart-image','smart-frame']);assert.deepEqual(result.members,[result.id,result.id]);assert.deepEqual(result.links,[{from:'a',to:'b',kind:'input'}]);assert.equal(result.digest,before);assert.equal(result.ports,0);assert.equal(result.composer,false);assert.deepEqual(errors,[]);
    await page.screenshot({path:'.local/pixmax-canvas-frames.png'});
});
test('real frame header drag moves members and their wire together and one undo restores all coordinates',async t=>{
    const {page,errors}=await setup(t);await group(page);const before=await page.evaluate(()=>nodes.slice(0,2).map(node=>({x:node.x,y:node.y}))),pathBefore=await page.locator('.smart-connection path').first().getAttribute('d');
    const box=await page.locator('[data-frame-title]').boundingBox();await page.mouse.move(box.x+10,box.y+10);await page.mouse.down();await page.mouse.move(box.x+80,box.y+55,{steps:5});await page.mouse.up();
    assert.deepEqual(await page.evaluate(()=>nodes.slice(0,2).map(node=>({x:node.x,y:node.y}))),before.map(point=>({x:point.x+70,y:point.y+45})));assert.notEqual(await page.locator('.smart-connection path').first().getAttribute('d'),pathBefore);
    await page.keyboard.press('Control+z');assert.deepEqual(await page.evaluate(()=>nodes.slice(0,2).map(node=>({x:node.x,y:node.y}))),before);assert.equal(await page.locator('.pixmax-frame-node').count(),1);assert.deepEqual(errors,[]);
});
test('Ctrl Shift G removes only the frame; Delete removes its members and Undo restores the group',async t=>{
    const {page,errors}=await setup(t);await group(page);await page.keyboard.press('Control+Shift+g');assert.equal(await page.locator('.pixmax-frame-node').count(),0);assert.equal(await page.evaluate(()=>nodes.length),2);assert.equal(await page.evaluate(()=>canvas.connections.length),1);
    await page.keyboard.press('Control+z');await page.keyboard.press('Delete');assert.equal(await page.evaluate(()=>nodes.length),0);await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>nodes.length),3);assert.equal(await page.locator('.pixmax-frame-node').count(),1);assert.deepEqual(errors,[]);
});
test('frame name editing saves and cancels through real keyboard controls; title cannot change after losing the lease',async t=>{
    const {page,errors,record}=await setup(t);await group(page);await page.locator('[data-frame-title]').dblclick();await page.getByRole('textbox',{name:'分组名称'}).fill('镜头 A');await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>nodes[2].label),'镜头 A');
    await page.locator('[data-frame-title]').dblclick();await page.getByRole('textbox',{name:'分组名称'}).fill('取消名称');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>nodes[2].label),'镜头 A');await page.evaluate(()=>saveCanvas({force:true}));assert.equal(record.nodes[2].label,'镜头 A');
    await page.locator('[data-frame-title]').dblclick();await page.getByRole('textbox',{name:'分组名称'}).fill('过期名称');await page.evaluate(()=>MemberCanvasEdit.setEditable(false));await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>nodes[2].label),'镜头 A');assert.deepEqual(errors,[]);
});
test('copying or exporting a frame includes members and remaps membership; copying a member alone drops the original frame',async t=>{
    const {page,errors}=await setup(t);await group(page);
    const result=await page.evaluate(()=>{const original=nodes[2],payload=selectedSmartWorkflowPayload();copySelectedNodes();pasteNodes({includeConnections:true});const copied=nodes.slice(3),frame=copied.find(PixmaxCanvasFrames.isFrame),valid=copied.filter(node=>node!==frame).every(node=>node.frameId===frame.id);smartSelection.insertedNodes(['a']);copySelectedNodes();pasteNodes({includeConnections:true});const alone=!nodes.at(-1).frameId;insertSmartWorkflowIntoCanvas(payload);const imported=nodes.slice(7),other=imported.find(PixmaxCanvasFrames.isFrame);return {count:payload.nodes.length,valid,alone,imported:imported.filter(node=>node!==other).every(node=>node.frameId===other.id),wire:canvas.connections.filter(edge=>copied.some(node=>node.id===edge.from)&&copied.some(node=>node.id===edge.to)).length};});
    assert.deepEqual(result,{count:3,valid:true,alone:true,imported:true,wire:1});assert.deepEqual(errors,[]);
});
test('frame bounds follow a resized or moved member and deletion of the last members removes the empty frame',async t=>{
    const {page,errors}=await setup(t);await group(page);
    const result=await page.evaluate(()=>{const frame=nodes[2],before=nodeRect(frame);nodes[1].x+=200;nodes[1].w=400;refreshSmartNodes(['b']);const after=nodeRect(frame),el=world.querySelector('.pixmax-frame-node');const follows=Math.round(parseFloat(el.style.width))===Math.round(after.width)&&after.width>before.width;deleteSmartNodes(['a']);const remains=nodes.some(PixmaxCanvasFrames.isFrame);deleteSmartNodes(['b']);return {follows,remains,empty:nodes.length};});
    assert.deepEqual(result,{follows:true,remains:true,empty:0});assert.deepEqual(errors,[]);
});
test('grouping is unavailable in readonly mode while selecting a frame remains available',async t=>{
    const {page,errors,writes}=await setup(t);await group(page);await page.evaluate(()=>{MemberCanvasEdit.setEditable(false);smartSelection.clear();});await page.locator('[data-frame-title]').click();assert.equal(await page.evaluate(()=>PixmaxCanvasFrames.isFrame(selectedNode())),true);
    await page.keyboard.press('Delete');await page.keyboard.press('Control+Shift+g');assert.equal(await page.evaluate(()=>nodes.length),3);await page.locator('[data-frame-title]').dblclick();assert.equal(await page.getByRole('textbox',{name:'分组名称'}).count(),0);assert.deepEqual(errors,[]);
});
for(const change of ['lease','workspace','document'])test('an active frame drag cancels after '+change+' changes without moving a replacement document',async t=>{
    const {page,errors}=await setup(t);await group(page);const box=await page.locator('[data-frame-title]').boundingBox();await page.mouse.move(box.x+8,box.y+8);await page.mouse.down();await page.mouse.move(box.x+58,box.y+38,{steps:3});
    await page.evaluate(change=>{if(change==='lease')MemberCanvasEdit.setEditable(false);if(change==='workspace')CanvasSession.context.workspace.id='other';if(change==='document'){canvas={...canvas,id:'other'};nodes=[{id:'a',type:'smart-prompt',x:900,y:600,images:[]}];}},change);
    await page.mouse.move(box.x+88,box.y+58);await page.mouse.up();
    if(change==='document')assert.deepEqual(await page.evaluate(()=>[nodes[0].x,nodes[0].y]),[900,600]);else assert.deepEqual(await page.evaluate(()=>nodes.slice(0,2).map(node=>[node.x,node.y])),[[260,250],[580,250]]);
    assert.equal(await page.evaluate(()=>dragState===null),true);assert.deepEqual(errors,[]);
});
test('Alt dragging a frame duplicates its members and keeps internal wires separate',async t=>{
    const {page,errors}=await setup(t);await group(page);const original=await page.evaluate(()=>nodes.map(node=>({id:node.id,x:node.x,y:node.y}))),box=await page.locator('[data-frame-title]').boundingBox();
    await page.keyboard.down('Alt');await page.mouse.move(box.x+8,box.y+8);await page.mouse.down();await page.mouse.move(box.x+88,box.y+68,{steps:5});await page.mouse.up();await page.keyboard.up('Alt');
    const result=await page.evaluate(original=>{const ids=new Set(original.map(node=>node.id)),copies=nodes.filter(node=>!ids.has(node.id)),frame=copies.find(PixmaxCanvasFrames.isFrame);return {old:nodes.filter(node=>ids.has(node.id)).map(node=>({id:node.id,x:node.x,y:node.y})),count:copies.length,members:copies.filter(node=>!PixmaxCanvasFrames.isFrame(node)).every(node=>node.frameId===frame.id),wires:canvas.connections.filter(edge=>copies.some(node=>node.id===edge.from)&&copies.some(node=>node.id===edge.to)).length};},original);
    assert.deepEqual(result,{old:original,count:3,members:true,wires:1});assert.deepEqual(errors,[]);
});
test('stale workspace identity blocks grouping and ungrouping even while a lease still says editable',async t=>{
    const {page,errors}=await setup(t);await page.evaluate(()=>CanvasSession.context.workspace.id='other');await page.keyboard.press('Control+g');assert.equal(await page.evaluate(()=>nodes.length),2);
    await page.evaluate(()=>CanvasSession.context.workspace.id='workspace-1');await group(page);await page.evaluate(()=>CanvasSession.context.workspace.id='other');await page.keyboard.press('Control+Shift+g');assert.equal(await page.evaluate(()=>nodes.length),3);assert.deepEqual(errors,[]);
});
