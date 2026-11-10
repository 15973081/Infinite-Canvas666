const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');

test('overlapping nodes keep captions and resolution badges inside their own layer',async t=>{
 const {page,errors}=await fixture(t,'smart',true,{secureOrigin:true});
 await page.evaluate(()=>{
  window.backNode=createNode(320,320,[{url:'/tests/fixtures/pixmax-audio-source.mp4',kind:'video',width:1280,height:720}],{select:false});
  window.frontNode=createPromptNode(250,250,{select:false});frontNode.w=360;frontNode.h=260;frontNode.text='前景节点';render();
 });
 const sample=()=>page.evaluate(()=>{
  const back=world.querySelector(`[data-id="${backNode.id}"]`);
  return ['.generation-node-caption','.image-resolution-badge'].map(selector=>{
   const element=back.querySelector(selector);element.style.pointerEvents='auto';element.style.opacity='1';
   const rect=element.getBoundingClientRect();
   return document.elementFromPoint(rect.left+12,rect.top+rect.height/2)?.closest('.image-node')?.dataset.id;
  });
 });
 const frontId=await page.evaluate(()=>frontNode.id);
 assert.deepEqual(await sample(),[frontId,frontId]);
 await page.evaluate(()=>{smartSelection.createdNode(backNode.id);render();});
 const backId=await page.evaluate(()=>backNode.id);
 assert.deepEqual(await sample(),[backId,backId]);
 assert.deepEqual(errors,[]);
});

async function overlappingCards(t){
 const f=await fixture(t,'smart',true,{secureOrigin:true});
 await f.page.evaluate(()=>{
  window.textCard=createPromptNode(200,250,{select:false});textCard.w=320;textCard.h=260;textCard.text='当前正在操作的文本卡片';
  window.videoCard=createNode(350,300,[{url:'/tests/fixtures/pixmax-audio-source.mp4',kind:'video',width:1280,height:720}],{select:true});
  render();
 });
 return f;
}
const activeAtOverlap=page=>page.evaluate(()=>document.elementFromPoint(400,365)?.closest('.image-node')?.dataset.id);

for(const multiple of [false,true])test('dragging an overlapped card focuses it immediately and keeps it above '+(multiple?'other selected cards':'the previous selection'),async t=>{
 const {page,errors}=await overlappingCards(t);
 if(multiple)await page.evaluate(()=>{smartSelection.boxSelection([textCard.id,videoCard.id]);syncSelectionUi();});
 await page.mouse.move(220,400);await page.mouse.down();
 const textId=await page.evaluate(()=>textCard.id);
 assert.equal(await activeAtOverlap(page),textId,'pointer down must raise the active card');
 await page.mouse.move(240,410,{steps:4});await page.mouse.up();
 assert.equal(await page.evaluate(()=>smartSelection.nodeId),textId);
 assert.equal(await activeAtOverlap(page),textId,'the card stays on top after releasing the drag');
 if(multiple)assert.equal(await page.evaluate(()=>smartSelection.ids.length),2);
 await page.evaluate(()=>render());assert.equal(await activeAtOverlap(page),textId);
 await page.mouse.click(600,430);
 assert.equal(await activeAtOverlap(page),await page.evaluate(()=>videoCard.id),'clicking the exposed video transfers focus');
 assert.deepEqual(errors,[]);
});

test('focusing a covered card title raises its content without moving or editing it',async t=>{
 const {page,errors}=await overlappingCards(t);
 await page.locator('.prompt-smart-node .pixmax-node-name').click();
 assert.equal(await activeAtOverlap(page),await page.evaluate(()=>textCard.id));
 assert.deepEqual(await page.evaluate(()=>({x:textCard.x,y:textCard.y,text:textCard.text})),{x:200,y:250,text:'当前正在操作的文本卡片'});
 assert.deepEqual(errors,[]);
});

test('deselection and editing another card retain the recent layer order, including after reload',async t=>{
 const {page,errors,record,writes}=await overlappingCards(t);
 await page.evaluate(async()=>{
  window.otherCard=createPromptNode(900,250,{select:false});otherCard.text='其他卡片';render();
  MemberCanvasEdit.canSave=true;await saveCanvas({force:true});
 });
 const ids=await page.evaluate(()=>({text:textCard.id,video:videoCard.id,other:otherCard.id}));
 const saved=JSON.stringify(record.nodes),before=writes.length;
 await page.mouse.click(220,400);
 await page.mouse.click(800,180);
 assert.equal(await page.locator('.image-node.active-node,.image-node.selected').count(),0);
 assert.equal(await activeAtOverlap(page),ids.text);
 await page.mouse.click(940,380);
 assert.equal(await activeAtOverlap(page),ids.text,'an unrelated selection must not restore the old overlap');
 await page.evaluate(()=>render());assert.equal(await activeAtOverlap(page),ids.text);
 assert.equal(JSON.stringify(record.nodes),saved);assert.equal(writes.length,before,'layer attention is local view state');
 await page.reload();await page.waitForFunction(()=>nodes.length===3);
 assert.equal(await activeAtOverlap(page),ids.text,'refresh preserves the recent order');
 await page.mouse.click(600,430);await page.mouse.click(800,180);
 assert.equal(await activeAtOverlap(page),ids.video);
 await page.evaluate(()=>{MemberCanvasEdit.setEditable(false);});
 const readonlyWrites=writes.length;
 await page.mouse.click(220,400);await page.mouse.click(800,180);
 assert.equal(await activeAtOverlap(page),ids.text,'read-only viewing can retain local focus order');
 assert.equal(writes.length,readonlyWrites);assert.deepEqual(errors,[]);
});
