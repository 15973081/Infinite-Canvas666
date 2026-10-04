const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function session(t,{member=false}={}){
 const f=await fixture(t,'smart',member),p=f.page;
 await p.evaluate(()=>{
  nodes=[{id:'a',type:'smart-image',images:[],x:20,y:20,promptDraftHtml:'A draft',promptDraftText:'A draft',runSettings:{engine:'api',apiKind:'image',model:'gpt-image-2',count:2,ratio:'square',promptH:88}},
   {id:'b',type:'smart-image',images:[],x:420,y:20,promptDraftHtml:'B draft',promptDraftText:'B draft',runSettings:{engine:'api',apiKind:'image',model:'gpt-image-2',count:1,ratio:'wide',promptH:144}},
   {id:'prompt',type:'smart-prompt',images:[],x:700,y:20,text:'template'}];
  selectedId='a';render();window.composerSaves=0;const save=scheduleSave;scheduleSave=()=>{composerSaves++;save();};
 });
 return f;
}

test('Smart composer frozen snapshot owns no second draft; repeated refresh does not write displayed defaults into nodes',async t=>{
 const {page:p,errors}=await session(t);const before=await p.evaluate(()=>JSON.stringify(nodes));
 await p.evaluate(()=>{updateComposer();updateComposer();});assert.equal(await p.evaluate(()=>JSON.stringify(nodes)),before);
 assert.deepEqual(await p.evaluate(()=>({frozen:Object.isFrozen(smartComposer)&&Object.isFrozen(smartComposer.state),node:smartComposer.state.nodeId,valid:smartComposer.state.targetValid,legacy:[typeof activeComposerSubject,typeof lastComposerNodeId,typeof smartComposerBaseline],saves:composerSaves})),{frozen:true,node:'a',valid:true,legacy:['undefined','undefined','undefined'],saves:0});assert.deepEqual(errors,[]);
});

test('Smart composer A-B-A keeps rich draft and node settings; refreshing edits never absorbs the change baseline',async t=>{
 const {page:p,errors}=await session(t);
 const result=await p.evaluate(()=>{
  promptInput.innerHTML='<b>A edited</b> <span class="mention-image-token" data-url="/test-image.svg">图1</span>';settings.count=3;
  const html=promptInput.innerHTML;updateComposer();const changes=smartComposerChanges(nodes[0]);
  selectedId='b';updateComposer();const b={text:promptPlainText(),count:settings.count,ratio:settings.ratio};
  promptInput.textContent='B edited';settings.count=4;selectedId='a';updateComposer();
  return {html,restored:promptInput.innerHTML,count:settings.count,b,aSaved:nodes[0].promptDraftHtml,bSaved:nodes[1].promptDraftText,bCount:nodes[1].runSettings.count,changes,saves:composerSaves};
 });
 assert.equal(result.restored,result.html);assert.equal(result.aSaved,result.html);assert.equal(result.count,3);assert.equal(result.bSaved,'B edited');assert.equal(result.bCount,4);assert.deepEqual(result.b,{text:'B draft',count:1,ratio:'wide'});assert.deepEqual(result.changes,{prompt:true,settings:true});assert.equal(result.saves,0);assert.deepEqual(errors,[]);
});

test('Smart composer clears selection/non-image targets by the original close rules and preserves generation draft-once behavior',async t=>{
 const {page:p,errors}=await session(t);
 await p.evaluate(()=>{clearPromptInput({preserveDraft:true});promptInput.textContent='temporary run display';selectedId='b';updateComposer();});
 assert.equal(await p.evaluate(()=>nodes[0].promptDraftText),'A draft');assert.equal(await p.evaluate(()=>promptInput.dataset.preserveDraftOnce),undefined);
 await p.evaluate(()=>{promptInput.textContent='B edited';selectedId='prompt';updateComposer();});assert.equal(await p.evaluate(()=>smartComposer.state.open),false);assert.equal(await p.evaluate(()=>nodes[1].promptDraftText),'B edited');assert.equal(await p.evaluate(()=>promptPlainText()),'B edited');
 await p.evaluate(()=>{selectedId='';updateComposer();});assert.equal(await p.evaluate(()=>promptPlainText()),'');assert.deepEqual(errors,[]);
});

for(const change of ['node','canvas'])test(`Smart composer ${change} replacement discards the stale binding without projecting old input into the new target`,async t=>{
 const {page:p,errors}=await session(t);
 await p.evaluate(change=>{
  promptInput.textContent='old unsaved text';settings.count=7;window.oldComposerNode=nodes[0];
  nodes[0]={...nodes[0],promptDraftHtml:'replacement',promptDraftText:'replacement',runSettings:{...nodes[0].runSettings,count:5}};
  if(change==='canvas')canvas={...canvas,id:'other-canvas'};
  savePromptDraftForCurrent();updateComposer();
 },change);
 assert.deepEqual(await p.evaluate(()=>({old:oldComposerNode.promptDraftText,new:nodes[0].promptDraftText,text:promptPlainText(),count:settings.count,saves:composerSaves})),{old:'A draft',new:'replacement',text:'replacement',count:5,saves:0});assert.deepEqual(errors,[]);
});

test('Smart actual undo uses the composer document notification, restores a replaced target and keeps the original save count',async t=>{
 const {page:p,errors}=await session(t);
 await p.evaluate(()=>{pushUndo();nodes[0].promptDraftHtml='temporary persisted';nodes[0].promptDraftText='temporary persisted';promptInput.textContent='old unsaved';performUndo();});
 assert.equal(await p.evaluate(()=>promptPlainText()),'A draft');assert.equal(await p.evaluate(()=>smartComposer.state.nodeId),'a');assert.equal(await p.evaluate(()=>composerSaves),1);assert.deepEqual(errors,[]);
});

test('Smart composer cached pause keeps task input projection, resumes unsaved edits and repeated bind cleans only its own lifecycle listeners',async t=>{
 const {page:p,errors}=await session(t);
 await p.evaluate(()=>{smartComposer.bind();smartComposer.bind();window.sharedShows=0;window.addEventListener('pageshow',()=>sharedShows++);promptInput.textContent='live unsaved';});
 const before=await p.evaluate(()=>JSON.stringify(smartTaskInputDocument().nodes));
 await p.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));smartComposer.refresh();});
 assert.equal(await p.evaluate(()=>smartComposer.state.paused),true);assert.equal(await p.evaluate(()=>nodes[0].promptDraftText),'A draft');assert.equal(await p.evaluate(()=>JSON.stringify(smartTaskInputDocument().nodes)),before);
 await p.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));assert.equal(await p.evaluate(()=>promptPlainText()),'live unsaved');assert.equal(await p.evaluate(()=>sharedShows),1);assert.equal(await p.evaluate(()=>smartComposerChanges(nodes[0]).prompt),true);
 await p.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}));smartComposer.destroy();smartComposer.bind();smartComposer.refresh();smartComposer.saveDraft();smartComposer.setDraftForNode(nodes[0],'late text');window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
 assert.equal(await p.evaluate(()=>smartComposer.state.destroyed),true);assert.equal(await p.evaluate(()=>smartComposer.state.open),false);assert.equal(await p.evaluate(()=>nodes[0].promptDraftText),'A draft');assert.equal(await p.evaluate(()=>sharedShows),2);assert.deepEqual(errors,[]);
});

test('Smart composer readonly refresh/switch retains the existing projection and never schedules or submits a save',async t=>{
 const {page:p,errors,writes}=await session(t,{member:true});await p.evaluate(()=>{MemberCanvasEdit.setEditable(false);selectedId='b';updateComposer();selectedId='a';updateComposer();savePromptDraftForCurrent();});
 assert.equal(await p.evaluate(()=>composerSaves),0);assert.equal(writes.filter(w=>w.method==='PUT'&&w.path==='/api/canvases/canvas-test').length,0);assert.equal(await p.evaluate(()=>promptPlainText()),'A draft');assert.deepEqual(errors,[]);
});


test('Smart paused composer still flushes the existing background save without extra scheduling or UI reopening',async t=>{
 const {page:p,errors,writes}=await session(t);
 await p.evaluate(async()=>{promptInput.textContent='saved while cached';window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));await saveCanvas({force:true});});
 assert.equal(await p.evaluate(()=>nodes[0].promptDraftText),'saved while cached');assert.equal(await p.evaluate(()=>smartComposer.state.paused),true);assert.equal(await p.evaluate(()=>composerSaves),0);
 assert.equal(writes.filter(w=>w.method==='PUT'&&w.path==='/api/canvases/canvas-test').length,1);assert.deepEqual(errors,[]);
});
