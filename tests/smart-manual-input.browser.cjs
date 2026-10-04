const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function input(t){
 const f=await fixture(t,'smart',false),p=f.page;await p.waitForLoadState('networkidle');
 await p.evaluate(()=>{
  nodes=[{id:'source',type:'smart-image',x:10,y:10,images:[{url:'/test-image.svg?one',kind:'image',natural_w:320,natural_h:240},{url:'/test-image.svg?two',kind:'image',natural_w:320,natural_h:240}]},
   {id:'a',type:'smart-image',x:500,y:30,images:[],inputNodeIds:['source'],promptDraftHtml:'A draft',promptDraftText:'A draft',runSettings:{engine:'api',apiKind:'image',model:'gpt-image-2',count:1}},
   {id:'b',type:'smart-image',x:500,y:460,images:[],promptDraftHtml:'B draft',promptDraftText:'B draft',runSettings:{engine:'api',apiKind:'image',model:'gpt-image-2',count:2}}];
  canvas.nodes=nodes;canvas.connections=[{from:'source',to:'a',kind:'input'}];smartSelection.panelTarget('a');render();
  window.manualSaves=0;window.manualRenders=0;const save=scheduleSave,paint=render;
  scheduleSave=()=>{manualSaves++;save();};render=(...args)=>{manualRenders++;return paint(...args);};
 });
 return f;
}
async function open(p){await p.evaluate(()=>{window.manualRequest=setCurrentSmartManualVideoUrl();});await p.waitForFunction(()=>assetDialogBackdrop.classList.contains('open'));}
async function submit(p,value){await p.locator('#assetDialogInput').fill(value);await p.locator('#assetDialogInput').press('Control+Enter');await p.evaluate(()=>manualRequest);}
test('Smart real manual URL dialog applies ordered refs to its composer target and preserves drafts, task data and one save',async t=>{
 const {page:p,errors}=await input(t);
 const before=await p.evaluate(()=>{nodes[1].pendingTasks=[{taskId:'existing',run:{prompt:'submitted',settings:{count:1}},_inputBinding:{sha:'submitted'}}];promptInput.textContent='A actual edit';return {task:JSON.stringify(nodes[1].pendingTasks),other:JSON.stringify(nodes[2]),sources:currentUploadMediaRefs(nodes[1]).map(mediaRefSourceUrl)};});
 assert.equal(before.sources.length,2);await open(p);assert.equal(await p.locator('#assetDialogInput').getAttribute('rows'),'5');
 await submit(p,'https://example.test/one\nasset://asset-second');
 const after=await p.evaluate(()=>({links:nodes[1].runSettings.videoTempShLinks,draft:nodes[1].promptDraftText,task:JSON.stringify(nodes[1].pendingTasks),other:JSON.stringify(nodes[2]),saves:manualSaves,renders:manualRenders,input:promptPlainText()}));
 assert.deepEqual(after.links,[{source:before.sources[0],url:'https://example.test/one',manual:true},{source:before.sources[1],url:'asset://asset-second',manual:true}]);
 assert.equal(after.draft,'A actual edit');assert.equal(after.input,'A actual edit');assert.equal(after.task,before.task);assert.equal(after.other,before.other);assert.equal(after.saves,1);assert.equal(after.renders,1);assert.deepEqual(errors,[]);
});
test('Smart real manual cancel, invalid URLs and clearing retain their existing save differences',async t=>{
 const {page:p,errors}=await input(t);await open(p);await p.locator('#assetDialogInput').press('Escape');await p.evaluate(()=>manualRequest);
 assert.equal(await p.evaluate(()=>manualSaves),0);await open(p);await submit(p,'not-a-url');assert.equal(await p.evaluate(()=>manualSaves),0);
 await open(p);await submit(p,'https://example.test/one');assert.equal(await p.evaluate(()=>manualSaves),1);
 await open(p);await submit(p,'');assert.equal(await p.evaluate(()=>manualSaves),2);assert.deepEqual(await p.evaluate(()=>nodes[1].runSettings.videoTempShLinks),[]);assert.deepEqual(errors,[]);
});
for(const change of ['node','canvas','switch','aba','inputs','close','cached'])test('Smart real manual dialog cannot apply after '+change+' input/session change',async t=>{
 const {page:p,errors}=await input(t);await open(p);
 await p.evaluate(change=>{
  if(change==='node'){nodes[1]={...nodes[1]};render();}
  if(change==='canvas')canvas={...canvas,id:'other-canvas'};
  if(change==='switch'||change==='aba'){smartSelection.panelTarget('b');updateComposer();if(change==='aba'){smartSelection.panelTarget('a');updateComposer();}}
  if(change==='inputs'){nodes[0].images[0]={...nodes[0].images[0],url:'/test-image.svg?new'};render();}
  if(change==='close')smartComposer.close();
  if(change==='cached'){window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));}
 },change);
 const before=await p.evaluate(()=>JSON.stringify({nodes,settings,input:promptInput.innerHTML,saves:manualSaves,renders:manualRenders}));
 await submit(p,'https://late.test');assert.equal(await p.evaluate(()=>JSON.stringify({nodes,settings,input:promptInput.innerHTML,saves:manualSaves,renders:manualRenders})),before);assert.deepEqual(errors,[]);
});
