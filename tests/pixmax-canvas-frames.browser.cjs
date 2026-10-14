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
test('frame geometry shares one membership index per computation and sees later membership changes',async t=>{
    const {page,errors}=await setup(t);
    const result=await page.evaluate(()=>{
        nodes=[];canvas.connections=[];let reads=0;const members=[];
        for(let i=0;i<30;i++){
            const frame={id:'frame-'+i,type:'smart-frame',images:[]};nodes.push(frame);
            for(let j=0;j<2;j++){const node={id:'member-'+i+'-'+j,type:'smart-image',x:i*500+j*250,y:250,images:[]};let parent=frame.id;Object.defineProperty(node,'frameId',{enumerable:true,configurable:true,get(){reads++;return parent;},set(value){parent=value;}});nodes.push(node);members.push(node);}
        }
        const frames=nodes.filter(PixmaxCanvasFrames.isFrame);const boxes=withSmartComputation(()=>frames.map(nodeRect)),firstReads=reads;
        members[0].frameId='frame-1';const changed=withSmartComputation(()=>nodeRect(frames[0]));
        return {firstReads,members:members.length,boxes:boxes.length,changed:changed.x!==boxes[0].x};
    });
    assert.ok(result.firstReads<=result.members*6,JSON.stringify(result));assert.equal(result.boxes,30);assert.equal(result.changed,true);assert.deepEqual(errors,[]);
});
test('native grouping skips individually selected grouped members and regroups a selected whole frame',async t=>{
    const {page,errors}=await setup(t);await group(page);
    const oldId=await page.evaluate(()=>nodes.find(PixmaxCanvasFrames.isFrame).id);
    await page.evaluate(()=>{nodes.push({id:'c',type:'smart-image',x:850,y:290,w:180,h:100,images:[]});});
    assert.equal(await page.evaluate(()=>PixmaxCanvasFrames.create(['a','c'])),null);
    assert.equal(await page.evaluate(()=>nodes.find(node=>node.id==='a').frameId),oldId);
    await page.evaluate(id=>PixmaxCanvasFrames.create([id,'c']),oldId);
    assert.equal(await page.evaluate(()=>nodes.filter(PixmaxCanvasFrames.isFrame).length),1);
    assert.equal(await page.evaluate(()=>{const frame=nodes.find(PixmaxCanvasFrames.isFrame);return nodes.filter(node=>!PixmaxCanvasFrames.isFrame(node)).every(node=>node.frameId===frame.id);}),true);
    assert.notEqual(await page.evaluate(()=>nodes.find(PixmaxCanvasFrames.isFrame).id),oldId);assert.deepEqual(errors,[]);
});
test('dragging all members outside keeps an empty native frame at its last bounds and undo restores membership',async t=>{
    const {page,errors}=await setup(t);await group(page);
    const before=await page.evaluate(()=>nodeRect(nodes.find(PixmaxCanvasFrames.isFrame)));
    await page.evaluate(()=>smartSelection.insertedNodes(['a','b']));await dragNode(page,'a',700,0);
    assert.equal(await page.evaluate(()=>nodes.filter(PixmaxCanvasFrames.isFrame).length),1);
    assert.deepEqual(await page.evaluate(()=>nodeRect(nodes.find(PixmaxCanvasFrames.isFrame))),before);
    assert.equal(await page.evaluate(()=>nodes.filter(node=>!PixmaxCanvasFrames.isFrame(node)).every(node=>!node.frameId)),true);
    await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>nodes.filter(node=>!PixmaxCanvasFrames.isFrame(node)).every(node=>!!node.frameId)),true);assert.deepEqual(errors,[]);
});
async function dragNode(page,id,dx,dy,{release=true}={}){
    const box=await page.locator(`.image-node[data-id="${id}"] .node-body`).boundingBox();assert.ok(box,'visible node body');
    await page.mouse.move(box.x+10,box.y+35);await page.mouse.down();await page.mouse.move(box.x+10+dx,box.y+35+dy,{steps:5});if(release)await page.mouse.up();
}
test('dropping a root node fully inside a frame joins it, preserves its wire and supports undo/reload',async t=>{
    const {page,errors}=await setup(t);await group(page);await page.evaluate(()=>{nodes.push({id:'c',type:'smart-image',generationKind:'image',x:850,y:290,w:180,h:100,images:[],promptDraftText:'新的镜头'});connectInputNode('a','c');render();});
    const before=await page.evaluate(()=>CanvasTaskBindings.graphCanonical(smartTaskInputDocument(),'c','c'));await dragNode(page,'c',-340,0,{release:false});assert.equal(await page.locator('.frame-drop-target').count(),1);await page.mouse.up();
    assert.equal(await page.evaluate(()=>nodes.find(node=>node.id==='c').frameId===nodes.find(PixmaxCanvasFrames.isFrame).id),true);assert.equal(await page.evaluate(()=>CanvasTaskBindings.graphCanonical(smartTaskInputDocument(),'c','c')),before);assert.equal(await page.evaluate(()=>canvas.connections.length),2);
    await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>nodes.find(node=>node.id==='c').frameId),undefined);assert.equal(await page.evaluate(()=>nodes.find(node=>node.id==='c').x),850);await page.evaluate(()=>redoSmartCanvas());await page.evaluate(()=>saveCanvas({force:true}));await page.reload();await page.waitForFunction(()=>nodes.length===4);assert.equal(await page.evaluate(()=>nodes.find(node=>node.id==='c').frameId===nodes.find(PixmaxCanvasFrames.isFrame).id),true);assert.deepEqual(errors,[]);
});
test('root partial overlap does not join a frame; an existing member keeps its group while partly overlapping',async t=>{
    const {page,errors}=await setup(t);await group(page);await page.evaluate(()=>{nodes.push({id:'c',type:'smart-image',generationKind:'image',x:920,y:300,w:180,h:100,images:[]});render();});
    await dragNode(page,'c',-200,0);assert.equal(await page.evaluate(()=>nodes.find(node=>node.id==='c').frameId),undefined);
    await dragNode(page,'b',180,0,{release:false});const frozen=await page.evaluate(()=>nodeRect(nodes.find(PixmaxCanvasFrames.isFrame)).x+nodeRect(nodes.find(PixmaxCanvasFrames.isFrame)).width);assert.equal(frozen,800);await page.mouse.up();
    assert.equal(await page.evaluate(()=>nodes.find(node=>node.id==='b').frameId===nodes.find(PixmaxCanvasFrames.isFrame).id),true);assert.equal(await page.evaluate(()=>nodeRect(nodes.find(PixmaxCanvasFrames.isFrame)).x+nodeRect(nodes.find(PixmaxCanvasFrames.isFrame)).width),980);assert.deepEqual(errors,[]);
});
test('a member fully outside its old frame detaches and refits the remaining group as one undo step',async t=>{
    const {page,errors}=await setup(t);await group(page);await dragNode(page,'b',500,0,{release:false});assert.equal(await page.evaluate(()=>nodeRect(nodes.find(PixmaxCanvasFrames.isFrame)).width),560);await page.mouse.up();
    assert.equal(await page.evaluate(()=>nodes.find(node=>node.id==='b').frameId),undefined);assert.equal(await page.evaluate(()=>nodeRect(nodes.find(PixmaxCanvasFrames.isFrame)).width),280);
    await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>nodes.find(node=>node.id==='b').frameId===nodes.find(PixmaxCanvasFrames.isFrame).id),true);assert.equal(await page.evaluate(()=>nodes.find(node=>node.id==='b').x),580);assert.deepEqual(errors,[]);
});
test('moving into another frame transfers membership; moving a whole frame does not nest its members',async t=>{
    const {page,errors}=await setup(t);await group(page);await page.evaluate(()=>{window.firstFrame=nodes.find(PixmaxCanvasFrames.isFrame).id;nodes.push({id:'d',type:'smart-image',generationKind:'image',x:880,y:250,w:140,h:240,images:[]},{id:'e',type:'smart-image',generationKind:'image',x:1080,y:250,w:140,h:240,images:[]});window.secondFrame=PixmaxCanvasFrames.create(['d','e']).id;});
    await dragNode(page,'b',320,0);assert.equal(await page.evaluate(()=>nodes.find(node=>node.id==='b').frameId),await page.evaluate(()=>secondFrame));assert.equal(await page.evaluate(()=>nodeRect(nodes.find(node=>node.id===firstFrame)).width),280);
    await page.keyboard.press('Control+z');await page.evaluate(()=>smartSelection.insertedNodes([firstFrame]));const title=await page.locator(`.pixmax-frame-node`).first().locator('[data-frame-title]').boundingBox();await page.mouse.move(title.x+8,title.y+8);await page.mouse.down();await page.mouse.move(title.x+648,title.y+8,{steps:5});await page.mouse.up();
    assert.equal(await page.evaluate(()=>nodes.find(node=>node.id==='a').frameId),await page.evaluate(()=>firstFrame));assert.equal(await page.evaluate(()=>nodes.find(node=>node.id===firstFrame).frameId),undefined);assert.deepEqual(errors,[]);
});
test('frame body drags the group while the wire remains clickable above its background',async t=>{
    const {page,errors}=await setup(t);await page.evaluate(()=>{nodes[1].x=700;render();});await group(page);const frame=await page.locator('.pixmax-frame-node').boundingBox();
    assert.equal(await page.evaluate(point=>document.elementFromPoint(point.x,point.y).classList.contains('pixmax-frame-node'),{x:frame.x+frame.width/2,y:frame.y+frame.height-8}),true);
    await page.mouse.move(frame.x+frame.width/2,frame.y+frame.height-8);await page.mouse.down();await page.mouse.move(frame.x+frame.width/2+50,frame.y+frame.height+22,{steps:4});await page.mouse.up();assert.deepEqual(await page.evaluate(()=>nodes.slice(0,2).map(node=>[node.x,node.y])),[[310,280],[750,280]]);
    const hit=await page.evaluate(()=>{const path=world.querySelector('.conn-hit'),point=path.getPointAtLength(path.getTotalLength()/2).matrixTransform(path.getScreenCTM()),element=document.elementFromPoint(point.x,point.y);return {connected:!!element?.closest('.smart-connection'),tag:element?.tagName,class:element?.getAttribute('class'),point:{x:point.x,y:point.y}};});assert.equal(hit.connected,true,JSON.stringify(hit));assert.deepEqual(errors,[]);
});
for(const change of ['lease','workspace','document'])test('a membership drag cancelled after '+change+' does not attach or move replacement nodes',async t=>{
    const {page,errors}=await setup(t);await group(page);await dragNode(page,'b',500,0,{release:false});await page.evaluate(change=>{if(change==='lease')MemberCanvasEdit.setEditable(false);if(change==='workspace')CanvasSession.context.workspace.id='other';if(change==='document'){canvas={...canvas,id:'new-document'};nodes=[{id:'b',type:'smart-image',x:950,y:600,images:[]}];}},change);await page.mouse.up();
    if(change==='document')assert.deepEqual(await page.evaluate(()=>[nodes[0].x,nodes[0].y,nodes[0].frameId]),[950,600,undefined]);else assert.deepEqual(await page.evaluate(()=>[nodes[1].x,nodes[1].y,!!nodes[1].frameId]),[580,250,true]);assert.deepEqual(errors,[]);
});
