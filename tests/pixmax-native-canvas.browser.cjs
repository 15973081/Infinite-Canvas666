const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');

test('native canvas matches source geometry, SVGs, menus and node names through reload',async t=>{
 const {page:p,errors,record}=await fixture(t,'smart',true);
 await p.evaluate(()=>Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}}));
 await p.getByRole('button',{name:'添加节点',exact:true}).click();
 const menu=await p.locator('#createMenu').boundingBox();assert.equal(menu.width,300);assert.equal(menu.height,470);
 assert.equal(await p.locator('.create-card-icon svg').count(),8);
 await p.getByRole('menuitem',{name:'图像节点',exact:true}).click();
 assert.deepEqual(await p.evaluate(()=>{const n=nodes[0],b=nodeRect(n),e=document.querySelector('.node-body');return {w:b.width,h:b.height,background:getComputedStyle(e).backgroundColor,radius:getComputedStyle(e).borderRadius};}),{w:200,h:200,background:'rgb(20, 20, 22)',radius:'12px'});
 const name=p.getByRole('textbox',{name:'节点名称'});await name.fill('镜头一 · 主画面');await name.press('Enter');
 await p.evaluate(async()=>saveCanvas({force:true}));assert.equal(record.nodes[0].label,'镜头一 · 主画面');
 await p.reload();await p.waitForFunction(()=>nodes.length===1);assert.equal(await name.inputValue(),'镜头一 · 主画面');
 assert.equal(await p.locator('.node-port').first().evaluate(el=>getComputedStyle(el).width),'56px');
 assert.deepEqual(errors,[]);
});

test('native viewport controls zoom around the center, move canvas and snap node positions',async t=>{
 const {page:p,errors}=await fixture(t,'smart',true);
 await p.evaluate(()=>Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}}));
 await p.evaluate(()=>{createNode(200,140,[],{select:false});clearSelection();render();});
 await p.getByRole('button',{name:'放大',exact:true}).click();assert.equal(await p.locator('#pixmaxZoomLabel').textContent(),'120%');
 assert.deepEqual(await p.evaluate(()=>({s:viewport.scale,x:viewport.x,y:viewport.y,gap:document.getElementById('pixmaxGridPattern').getAttribute('width')})),{s:1.2,x:-128,y:-90,gap:'24'});
 await p.getByRole('button',{name:'缩小',exact:true}).click();
 await p.getByRole('button',{name:'切换预览模式',exact:true}).click();
 await p.mouse.move(650,140);await p.mouse.down();await p.mouse.move(715,170,{steps:4});await p.mouse.up();
 assert.deepEqual(await p.evaluate(()=>({x:viewport.x,y:viewport.y,node:[nodes[0].x,nodes[0].y]})),{x:65,y:30,node:[200,140]});
 await p.getByRole('button',{name:'切换预览模式',exact:true}).click();await p.getByRole('button',{name:'吸附网格',exact:true}).click();
 const b=await p.locator('.image-node').boundingBox();await p.mouse.move(b.x+60,b.y+60);await p.mouse.down();await p.mouse.move(b.x+93,b.y+87,{steps:4});await p.mouse.up();
 assert.deepEqual(await p.evaluate(()=>[nodes[0].x,nodes[0].y]),[240,160]);
 await p.evaluate(async()=>saveCanvas({force:true}));await p.reload();await p.waitForFunction(()=>nodes.length===1);
 assert.deepEqual(await p.evaluate(()=>({x:viewport.x,y:viewport.y,s:viewport.scale})),{x:65,y:30,s:1});assert.deepEqual(errors,[]);
});

test('native context distinguishes plain paste from paste with links and undo restores the graph',async t=>{
 const {page:p,errors}=await fixture(t,'smart',true);
 await p.evaluate(()=>{const a=createPromptNode(100,150),b=createGenerationNodeAt({x:650,y:250},'image');connectInputNode(a.id,b.id);smartSelection.boxSelection([a.id,b.id]);syncSelectionUi();updateComposer();});
 await p.keyboard.press('Control+c');
 for(const [action,count] of [['paste',1],['paste-links',2]]){
  await p.mouse.click(1100,300,{button:'right'});await p.locator('[data-context-action="'+action+'"]').click();
  assert.equal(await p.evaluate(()=>nodes.length),4);assert.equal(await p.evaluate(()=>canvas.connections.length),count);
  assert.equal(await p.evaluate(()=>nodes[3].inputNodeIds.length),count-1);
  await p.getByRole('button',{name:'撤销',exact:true}).click();
  assert.equal(await p.evaluate(()=>nodes.length),2);assert.equal(await p.evaluate(()=>canvas.connections.length),1);
 }
 assert.deepEqual(errors,[]);
});

test('native connection plus opens the source-compatible menu and creates a connected director as one undo step',async t=>{
 const {page:p,errors}=await fixture(t,'smart',true);
 await p.evaluate(()=>createNode(180,150,[],{select:false}));
 const before=await p.evaluate(()=>undoStack.length);
 await p.locator('.node-port[data-port=out]').click();
 assert.equal(await p.locator('#createMenu [role=menuitem]:visible').count(),6);
 await p.getByRole('menuitem',{name:/^导演台/}).click();
 assert.deepEqual(await p.evaluate(()=>({type:nodes[1].type,links:canvas.connections.length,undo:undoStack.length})),{type:'smart-director',links:1,undo:before+1});
 await p.getByRole('button',{name:'撤销',exact:true}).click();assert.equal(await p.evaluate(()=>nodes.length),1);assert.deepEqual(errors,[]);
});

test('original video controls play, seek, survive redraw and capture a real connected frame',async t=>{
 const {page:p,errors}=await fixture(t,'smart',false);
 await p.route('**/native.webm',r=>r.fulfill({contentType:'video/webm',path:path.resolve('tests/fixtures/smart-preview.webm')}));
 await p.evaluate(()=>{window.filesCaptured=[];uploadFiles=async files=>{filesCaptured.push(...files.map(f=>({type:f.type,size:f.size})));return files.map(f=>({url:'/test-image.svg',kind:'image',name:f.name}));};createNode(160,140,[{url:'/native.webm',kind:'video',natural_w:320,natural_h:240}],{select:false});clearSelection();render();});
 const video=p.locator('.pixmax-inline-video');await p.waitForFunction(()=>document.querySelector('.pixmax-inline-video')?.readyState>=2);
 await p.locator('.pixmax-player-mount .play-toggle').click();await p.waitForFunction(()=>!document.querySelector('.pixmax-inline-video').paused);
 await p.evaluate(()=>{window.retainedVideo=document.querySelector('.pixmax-inline-video');render();});
 assert.equal(await video.evaluate(v=>v===retainedVideo),true);
 await p.locator('.pixmax-player-mount .play-toggle').click();
 await p.locator('.pixmax-player-mount [role=slider]').press('ArrowRight');
 await p.locator('.pixmax-player-mount .capture-trigger').hover();
 await p.getByText('截取当前帧',{exact:true}).click();await p.waitForFunction(()=>nodes.length===2);
 const result=await p.evaluate(()=>({files:filesCaptured,links:canvas.connections,nodes:nodes.map(n=>n.id)}));
 assert.equal(result.files[0].type,'image/png');assert.ok(result.files[0].size>100);
 assert.deepEqual(result.links,[{from:result.nodes[0],to:result.nodes[1],kind:'input'}]);
 await p.evaluate(()=>performUndo());assert.equal(await p.evaluate(()=>nodes.length),1);assert.deepEqual(errors,[]);
});

test('source gestures pan on wheel, zoom on Ctrl wheel, pan over cards with Space and never auto-merge overlapping cards',async t=>{
 const {page:p,errors}=await fixture(t,'smart',true);
 await p.evaluate(()=>{createNode(100,160,[],{select:false});createNode(500,160,[],{select:false});clearSelection();render();});
 await p.mouse.move(1000,350);await p.mouse.wheel(40,80);
 await p.waitForFunction(()=>viewport.y===-40);
 assert.deepEqual(await p.evaluate(()=>({x:viewport.x,y:viewport.y,s:viewport.scale})),{x:-20,y:-40,s:1});
 await p.keyboard.down('Control');await p.mouse.wheel(0,100);await p.keyboard.up('Control');
 await p.waitForFunction(()=>viewport.scale!==1);
 assert.ok(Math.abs(await p.evaluate(()=>viewport.scale)-2**(-.2))<.000001);
 await p.evaluate(()=>{viewport={x:0,y:0,scale:1};applyViewport();});
 await p.keyboard.down('Space');await p.mouse.move(160,210);await p.mouse.down();await p.mouse.move(200,250,{steps:4});await p.mouse.up();await p.keyboard.up('Space');
 assert.deepEqual(await p.evaluate(()=>({x:viewport.x,y:viewport.y,nodeX:nodes[0].x})),{x:40,y:40,nodeX:100});
 await p.mouse.move(180,250);await p.mouse.down();await p.mouse.move(580,250,{steps:8});await p.mouse.up();
 assert.deepEqual(await p.evaluate(()=>({n:nodes.length,links:canvas.connections.length,x:nodes[0].x})),{n:2,links:0,x:500});
 assert.equal(await p.locator('.floating-node-actions:visible').count(),0);assert.deepEqual(errors,[]);
});

test('source tidy lays connected nodes in layers, undo restores positions and persisted keyboard paste retains links only with Shift',async t=>{
 const {page:p,errors}=await fixture(t,'smart',true);
 await p.evaluate(()=>{const a=createPromptNode(100,160),b=createGenerationNodeAt({x:600,y:600},'image');connectInputNode(a.id,b.id);smartSelection.boxSelection([a.id,b.id]);render();});
 const old=await p.evaluate(()=>nodes.map(n=>[n.x,n.y]));
 await p.getByRole('button',{name:'整理画布',exact:true}).click();
 assert.ok(await p.evaluate(()=>nodes[1].x-nodes[0].x>=400));
 await p.getByRole('button',{name:'撤销',exact:true}).click();assert.deepEqual(await p.evaluate(()=>nodes.map(n=>[n.x,n.y])),old);
 await p.evaluate(()=>{smartSelection.boxSelection(nodes.map(n=>n.id));syncSelectionUi();});
 await p.keyboard.press('Control+c');await p.keyboard.press('Control+Shift+v');await p.waitForFunction(()=>nodes.length===4);
 assert.equal(await p.evaluate(()=>canvas.connections.length),2);
 await p.getByRole('button',{name:'撤销',exact:true}).click();await p.keyboard.press('Control+v');await p.waitForFunction(()=>nodes.length===4);
 assert.equal(await p.evaluate(()=>canvas.connections.length),1);assert.deepEqual(errors,[]);
});
