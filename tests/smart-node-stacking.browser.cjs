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
