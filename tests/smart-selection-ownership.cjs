const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {functionSource}=require('./helpers/canvas-source.cjs');
const source=fs.readFileSync('static/js/canvas/smart/smart-workspace.js','utf8');
const plain=v=>JSON.parse(JSON.stringify(v));
function fixture(){
 const calls=[],timers=new Map(),listeners=new Map();let timerId=0;
 const node={id:'a',images:[{url:'one'}]},group={id:'g',images:[{url:'one'},{url:'two'}]};
 const c=vm.createContext({nodes:[node,group],canvas:{id:'canvas'},pendingGroupUploadPoint:{x:1},uploadTargetId:'',
  savePromptDraftForCurrent:()=>calls.push('draft'),hideRunTimerForNode:n=>calls.push('view:'+n.id),
  smartCascadeAnyRunning:()=>true,smartCascadeSilentSelection:true,
  syncSelectionUi:()=>calls.push('selection'),updateComposer:()=>calls.push('composer'),
  refreshRunTimerPills:()=>calls.push('timers'),refreshSmartNodes:ids=>calls.push('refresh:'+ids),
  pickMediaForSmartNode:id=>calls.push('upload:'+id),
  smartComposer:{outputSelected:()=>calls.push('output'),finishCascade:()=>calls.push('finish')},
  setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),
  window:{addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeEventListener:(type,fn)=>listeners.get(type)?.delete(fn)}});
 vm.runInContext(functionSource(source,'createSmartSelection'),c);
 const owner=c.smartSelection=c.createSmartSelection();
 const seed=()=>owner.restoreDocument({selectedId:'g',selectedIds:['a','g'],selectedImage:{nodeId:'g',index:1}});
 return {c,node,group,owner,seed,calls,timers,listeners};
}
test('Smart selection is lazy, deeply frozen, stable between commands and owns no node data',()=>{
 const c=vm.createContext({});vm.runInContext(functionSource(source,'createSmartSelection'),c);const owner=c.createSmartSelection();
 const state=owner.state;assert.ok([owner,state,state.selectedIds,state.selectedImage].every(Object.isFrozen));assert.equal(state,owner.state);
 assert.throws(()=>state.selectedIds.push('x'),{name:'TypeError'});state.selectedImage.index=9;state.selectedId='x';assert.equal(owner.nodeId,'');assert.equal(owner.image.index,-1);
 const incoming={selectedId:'a',selectedIds:['a'],selectedImage:{nodeId:'a',index:2}};owner.restoreDocument(incoming);incoming.selectedIds.push('b');incoming.selectedImage.index=0;
 assert.deepEqual(plain(owner.state),{selectedId:'a',selectedIds:['a'],selectedImage:{nodeId:'a',index:2}});
});
test('Smart entry and callers have no writable selection aliases; undo retains its JSON keys',()=>{
 const owner=functionSource(source,'createSmartSelection');
 for(const file of ['static/js/smart-canvas.js',...['workspace','document','execution','results','media-editor','library','session'].map(n=>'static/js/canvas/smart/smart-'+n+'.js')]){
  let text=fs.readFileSync(file,'utf8').replace(owner,'');
  if(file.endsWith('smart-workspace.js'))text=text.replace(functionSource(source,'chatProviderOptions'),'');
  assert.doesNotMatch(text,/(?<![.\w])(?:selectedId|selectedIds|selectedImage|imageClickTimer)\b(?!\s*:)/,file);
  assert.doesNotMatch(text,/\b(?:let|var)\s+(?:selectedId|selectedIds|selectedImage|imageClickTimer)\b/,file);
  assert.doesNotMatch(text,/\bsmartSelection\.(?:nodeId|ids|image|state)\s*=(?!=)/,file);
  assert.doesNotMatch(text,/\bsmartSelection\.(?:ids|image)(?:\.\w+|\[[^\]]+\])\s*=(?!=)|smartSelection\.ids\.(?:push|splice|pop|sort)\(/,file);
 }
 const document=fs.readFileSync('static/js/canvas/smart/smart-document.js','utf8');
 assert.match(functionSource(document,'snapshotForUndo'),/selectedId: smartSelection.nodeId/);
 assert.doesNotMatch(owner,/pushUndo\(|scheduleSave\(|nodes\s*=/);
});
test('node click and upload are complete UI commands, keeping viewed timer and refresh ordering',()=>{
 const f=fixture();f.seed();f.owner.clickNode('a',{classList:{contains:()=>true}});
 assert.deepEqual(f.calls,['view:a','refresh:a','selection','timers','composer']);assert.equal(f.c.smartCascadeSilentSelection,false);
 assert.deepEqual(plain(f.owner.state),{selectedId:'a',selectedIds:[],selectedImage:{nodeId:'',index:-1}});
 f.calls.length=0;f.owner.uploadTarget('g');assert.deepEqual(f.calls,['view:g','selection','composer','upload:g']);assert.equal(f.c.uploadTargetId,'g');assert.equal(f.c.pendingGroupUploadPoint,null);
});
test('box and inserted selection keep their original single-item and empty-list rules',()=>{
 const f=fixture();f.owner.boxSelection(['a']);assert.deepEqual(plain(f.owner.ids),['a']);assert.equal(f.owner.nodeId,'a');
 f.owner.insertedNodes(['a']);assert.deepEqual(plain(f.owner.ids),[]);assert.equal(f.owner.nodeId,'a');
 f.owner.boxSelection(['a','g']);assert.equal(f.owner.nodeId,'');assert.deepEqual(plain(f.owner.ids),['a','g']);
 f.owner.insertedNodes([]);assert.equal(f.owner.nodeId,'');assert.equal(f.owner.image.index,-1);assert.deepEqual(f.calls,[]);
});
test('created nodes and editor targets retain multiselect; document restore does not flush drafts',()=>{
 const f=fixture();f.seed();const ids=f.owner.ids,image=f.owner.image;f.owner.createdNode('new');assert.equal(f.owner.ids,ids);assert.equal(f.owner.image,image);
 f.owner.editorTarget('a',0);assert.equal(f.owner.ids,ids);assert.deepEqual(plain(f.owner.image),{nodeId:'a',index:0});
 f.owner.documentRestoring();assert.equal(f.owner.nodeId,'');assert.deepEqual(plain(f.owner.ids),[]);assert.deepEqual(plain(f.owner.image),{nodeId:'a',index:0});assert.deepEqual(f.calls,[]);
});
test('task notifications retain batching, multiselect and source/output UI semantics',()=>{
 const f=fixture();f.seed();const ids=f.owner.ids;f.owner.taskSource('a');assert.equal(f.owner.ids,ids);assert.equal(f.owner.image.index,-1);
 f.owner.editorTarget('a',0);f.owner.taskFailed('g');assert.equal(f.owner.image.nodeId,'a');assert.equal(f.owner.ids,ids);
 f.owner.taskOutput('a');assert.equal(f.owner.nodeId,'a');assert.equal(f.owner.ids,ids);assert.equal(f.owner.image.index,-1);assert.deepEqual(f.calls,['output']);
 f.owner.taskFinished();assert.equal(f.owner.nodeId,'');assert.deepEqual(plain(f.owner.ids),[]);assert.deepEqual(f.calls,['output','finish']);
});
test('delete and media notifications filter selection and clamp child indices without selecting another item',()=>{
 const f=fixture();f.seed();f.owner.nodesRemoved(['a']);assert.equal(f.owner.nodeId,'g');assert.deepEqual(plain(f.owner.ids),['g']);
 f.owner.imagesChanged('g',1);assert.equal(f.owner.image.index,0);f.owner.imagesChanged('g',0);assert.equal(f.owner.image.nodeId,'');
 f.seed();f.owner.mediaCleared('a');assert.equal(f.owner.nodeId,'a');assert.equal(f.owner.image.nodeId,'g');
 f.owner.nodesRemoved(['g']);assert.equal(f.owner.image.index,-1);assert.deepEqual(f.calls,[]);
});
test('temporary reference preview restores exact readonly references even on throw; log retains legacy copied image',()=>{
 const f=fixture();f.seed();const original=f.owner.state;
 assert.throws(()=>f.owner.withReferencePreview(()=>{f.owner.previewTarget('a',0);throw Error('preview');}),/preview/);
 assert.equal(f.owner.state,original);assert.equal(f.owner.ids,original.selectedIds);assert.equal(f.owner.image,original.selectedImage);
 f.owner.withLogPreview(()=>f.owner.editorTarget('temporary',0));assert.equal(f.owner.nodeId,'g');assert.equal(f.owner.ids,original.selectedIds);
 assert.notEqual(f.owner.image,original.selectedImage);assert.deepEqual(plain(f.owner.image),plain(original.selectedImage));assert.deepEqual(f.calls,[]);
});
for(const change of ['canvas','node','image','reset','pause','destroy','other-choice'])test('deferred image click cannot apply after '+change,()=>{
 const f=fixture();f.owner.deferImageClick(f.node,0);const late=[...f.timers.values()][0];
 if(change==='canvas')f.c.canvas={id:'other'};
 if(change==='node')f.c.nodes[0]={...f.node};
 if(change==='image')f.node.images[0]={url:'other'};
 if(change==='reset')f.owner.documentReplacing();
 if(change==='pause')f.owner.pause();
 if(change==='destroy')f.owner.destroy();
 if(change==='other-choice')f.owner.panelTarget('g');
 late();assert.equal(f.owner.nodeId,change==='other-choice'?'g':'');assert.deepEqual(f.calls,[]);
});
test('single-image and group click differ, only the most recent timer acts and cancellation is idempotent',()=>{
 const f=fixture();f.owner.deferImageClick(f.node,0);const old=[...f.timers.values()][0];f.owner.deferImageClick(f.group,1);old();assert.equal(f.owner.nodeId,'');
 [...f.timers.values()].at(-1)();assert.equal(f.owner.nodeId,'g');assert.equal(f.owner.image.index,-1);assert.deepEqual(f.calls,['view:g','selection','composer']);
 f.calls.length=0;f.owner.deferImageClick(f.node,0);[...f.timers.values()].at(-1)();assert.equal(f.owner.image.index,0);assert.deepEqual(f.calls,['view:a','selection','composer']);
 f.owner.cancelImageClick();f.owner.cancelImageClick();
});
test('same-source metadata copies made by saving do not discard an otherwise valid pending click',()=>{
 const f=fixture();f.owner.deferImageClick(f.node,0);const late=[...f.timers.values()][0];
 f.node.images[0]={...f.node.images[0],natural_w:320};late();assert.equal(f.owner.nodeId,'a');assert.equal(f.owner.image.index,0);
});
test('repeat lifecycle binding leaves one listener, pauses user interaction and allows existing task notifications',()=>{
 const f=fixture();const shared=()=>{};f.c.window.addEventListener('pagehide',shared);f.owner.bind();f.owner.bind();
 assert.equal(f.listeners.get('pagehide').size,2);assert.equal(f.listeners.get('pageshow').size,1);
 f.owner.pause();f.owner.clickNode('a',{classList:{contains:()=>false}});f.owner.editorTarget('a',0);assert.equal(f.owner.nodeId,'');assert.deepEqual(f.calls,[]);
 f.owner.taskSource('a');assert.equal(f.owner.nodeId,'a');f.owner.resume();f.owner.clear();assert.deepEqual(f.calls,['draft']);
 f.owner.destroy();f.owner.destroy();f.owner.bind();const final=f.owner.state;f.owner.taskSource('g');f.owner.clear();f.owner.withReferencePreview(()=>{throw Error('destroyed action');});
 assert.equal(f.owner.state,final);assert.equal(f.listeners.get('pagehide').size,1);assert.equal(f.listeners.get('pageshow').size,0);
});
