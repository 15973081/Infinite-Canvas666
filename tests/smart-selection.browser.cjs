const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function selection(t,{member=false,finished=false}={}){
 const f=await fixture(t,'smart',member),p=f.page;
 await p.waitForLoadState('networkidle');
 await p.evaluate(finished=>{
  const item=name=>({url:'/test-image.svg',name,kind:'image',natural_w:320,natural_h:240});
  nodes=[{id:'a',type:'smart-image',x:180,y:180,images:[item('one')],promptDraftHtml:'A draft',promptDraftText:'A draft'},
   {id:'g',type:'smart-image',x:600,y:180,images:[item('two'),item('three')],promptDraftHtml:'Group draft',promptDraftText:'Group draft',...(finished?{runFinishedAt:100}:{})}];
  canvas.nodes=nodes;viewport.x=0;viewport.y=0;viewport.scale=1;applyViewport();render();
  window.selectionSaves=0;window.selectionRenders=0;window.selectionComposerCalls=0;
  const save=scheduleSave,paint=render,refresh=updateComposer;
  scheduleSave=()=>{selectionSaves++;save();};render=(...args)=>{selectionRenders++;return paint(...args);};
  updateComposer=(...args)=>{selectionComposerCalls++;return refresh(...args);};
 },finished);
 return f;
}
const state=p=>p.evaluate(()=>({...smartSelection.state,saves:selectionSaves,renders:selectionRenders}));
test('Smart node click switches drafts completely, keeps DOM and scroll and never adds a save',async t=>{
 const {page:p,errors}=await selection(t);
 await p.evaluate(()=>{
  document.querySelector('.image-node[data-id="a"]').click();promptInput.innerHTML='<b>A changed</b>';
  window.retainedNode=document.querySelector('.image-node[data-id="a"]');
  window.retainedGroup=document.querySelector('.image-node[data-id="g"]');
  const scroller=retainedGroup.querySelector('[data-thumb-scroll]');scroller.scrollTop=15;window.selectionScroll=scroller.scrollTop;
  document.querySelector('.image-node[data-id="g"]').click();
 });
 assert.deepEqual(await p.evaluate(()=>({node:smartSelection.nodeId,ids:smartSelection.ids,image:smartSelection.image,composer:smartComposer.state.nodeId,text:promptPlainText(),saved:nodes[0].promptDraftHtml,
  same:retainedNode===document.querySelector('.image-node[data-id="a"]')&&retainedGroup===document.querySelector('.image-node[data-id="g"]'),scroll:retainedGroup.querySelector('[data-thumb-scroll]').scrollTop===selectionScroll,saves:selectionSaves,renders:selectionRenders})),
 {node:'g',ids:[],image:{nodeId:'',index:-1},composer:'g',text:'Group draft',saved:'<b>A changed</b>',same:true,scroll:true,saves:0,renders:0});assert.deepEqual(errors,[]);
});
test('Smart actual image clicks keep group composer and single-node drag/view save differences without repaint',async t=>{
 const {page:p,errors}=await selection(t,{finished:true});
 await p.locator('.image-node[data-id="g"] [data-image-index="1"]').first().click();
 await p.waitForFunction(()=>smartSelection.nodeId==='g');
 assert.deepEqual(await state(p),{selectedId:'g',selectedIds:[],selectedImage:{nodeId:'',index:-1},saves:1,renders:0});
 assert.equal(await p.evaluate(()=>promptPlainText()),'Group draft');
 await p.locator('.image-node[data-id="a"] .image-wrap').click();await p.waitForFunction(()=>smartSelection.nodeId==='a');
 assert.deepEqual(await state(p),{selectedId:'a',selectedIds:[],selectedImage:{nodeId:'',index:-1},saves:2,renders:0});assert.deepEqual(errors,[]);
});
test('Smart native double click clears multiselect for preview and Escape closes without a delayed selection',async t=>{
 const {page:p,errors}=await selection(t);
 await p.evaluate(()=>{smartSelection.boxSelection(['a','g']);syncSelectionUi();});
 await p.locator('.image-node[data-id="g"] [data-image-index="1"]').first().dblclick();
 await p.waitForFunction(()=>smartImageEditor.state.open&&smartImageEditor.state.imageIndex===1);
 assert.equal(await p.evaluate(()=>smartSelection.nodeId),'g');assert.deepEqual(await p.evaluate(()=>smartSelection.ids),[]);
 await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>smartImageEditor.state.open),false);
 await p.waitForTimeout(280);assert.equal(await p.evaluate(()=>smartSelection.image.index),1);assert.deepEqual(errors,[]);
});
test('Smart actual box gesture and Delete/Undo retain batch selection and original save counts',async t=>{
 const {page:p,errors}=await selection(t);
 const bounds=await p.evaluate(()=>{
  const boxes=[...world.querySelectorAll('.image-node')].map(el=>el.getBoundingClientRect());
  return {x:Math.min(...boxes.map(r=>r.left))-18,y:Math.min(...boxes.map(r=>r.top))-18,
   right:Math.max(...boxes.map(r=>r.right))+18,bottom:Math.max(...boxes.map(r=>r.bottom))+18};
 });
 await p.keyboard.down('Control');await p.mouse.move(bounds.x,bounds.y);await p.mouse.down();await p.mouse.move(bounds.right,bounds.bottom,{steps:5});await p.mouse.up();await p.keyboard.up('Control');
 assert.deepEqual(await p.evaluate(()=>smartSelection.ids),['a','g']);assert.equal(await p.evaluate(()=>smartSelection.nodeId),'');
 await p.keyboard.press('Delete');assert.deepEqual(await p.evaluate(()=>nodes.map(n=>n.id)),[]);assert.equal(await p.evaluate(()=>selectionSaves),1);
 await p.keyboard.press('Control+z');assert.deepEqual(await p.evaluate(()=>nodes.map(n=>n.id)),['a','g']);assert.deepEqual(await p.evaluate(()=>smartSelection.ids),['a','g']);assert.equal(await p.evaluate(()=>selectionSaves),2);assert.deepEqual(errors,[]);
});
for(const replacement of ['node','canvas','image'])test('Smart pending native image click ignores '+replacement+' replacement',async t=>{
 const {page:p,errors}=await selection(t);
 await p.locator('.image-node[data-id="g"] [data-image-index="1"]').first().click();
 await p.evaluate(replacement=>{
  if(replacement==='node')nodes[1]={...nodes[1]};
  if(replacement==='canvas')canvas={...canvas,id:'other-canvas'};
  if(replacement==='image')nodes[1].images[1]={...nodes[1].images[1],url:'/other.svg'};
 },replacement);
 await p.waitForTimeout(280);assert.equal(await p.evaluate(()=>smartSelection.nodeId),'');assert.equal(await p.evaluate(()=>selectionComposerCalls),0);assert.equal(await p.evaluate(()=>selectionSaves),0);assert.deepEqual(errors,[]);
});
test('Smart repeated lifecycle binding cancels pending click on cached exit and does not replay it on return',async t=>{
 const {page:p,errors}=await selection(t);
 await p.evaluate(()=>{smartSelection.bind();smartSelection.bind();window.sharedSelectionShow=0;window.addEventListener('pageshow',()=>sharedSelectionShow++);});
 await p.locator('.image-node[data-id="g"] [data-image-index="1"]').first().click();
 await p.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
 await p.waitForTimeout(280);assert.equal(await p.evaluate(()=>smartSelection.nodeId),'');
 await p.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));assert.equal(await p.evaluate(()=>smartSelection.nodeId),'');
 await p.locator('.image-node[data-id="g"] [data-image-index="1"]').first().click();await p.waitForFunction(()=>smartSelection.nodeId==='g');
 assert.equal(await p.evaluate(()=>sharedSelectionShow),1);assert.equal(await p.evaluate(()=>selectionSaves),0);
 await p.evaluate(()=>{smartSelection.destroy();smartSelection.bind();smartSelection.destroy();window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
 assert.equal(await p.evaluate(()=>sharedSelectionShow),2);assert.deepEqual(errors,[]);
});
test('Smart selection remains usable in readonly view while real Delete preserves permission and save guards',async t=>{
 const {page:p,errors,writes}=await selection(t,{member:true});
 await p.evaluate(()=>{MemberCanvasEdit.setEditable(false);document.querySelector('.image-node[data-id="a"]').click();});
 assert.equal(await p.evaluate(()=>smartSelection.nodeId),'a');await p.keyboard.press('Delete');
 assert.deepEqual(await p.evaluate(()=>nodes.map(n=>n.id)),['a','g']);assert.equal(await p.evaluate(()=>selectionSaves),0);
 assert.equal(writes.filter(w=>w.path==='/api/canvases/canvas-test'&&w.method==='PUT').length,0);assert.deepEqual(errors,[]);
});
