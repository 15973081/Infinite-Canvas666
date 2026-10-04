const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {functionSource}=require('./helpers/canvas-source.cjs');
const {installWorkspaceView}=require('./helpers/workspace-view.cjs');
function fixture(kind){
 const frames=new Map(),timers=new Map(),handlers=new Map(),draws=[],node={id:'a'};let seq=0;
 const c=vm.createContext({canvas:{id:'doc',connections:[]},nodes:[node],
  requestAnimationFrame:fn=>{frames.set(++seq,fn);return seq;},cancelAnimationFrame:id=>frames.delete(id),
  setTimeout:fn=>{timers.set(++seq,fn);return seq;},clearTimeout:id=>timers.delete(id),
  refreshGeometry:ids=>draws.push(ids===null?null:[...ids]),refreshConnectionLayer:ids=>draws.push(ids===null?null:[...ids]),
  renderOffscreenPlaceholders:()=>draws.push('viewport'),renderSmartOffscreenPlaceholders:()=>draws.push('viewport'),refreshCanvasMediaVisibility(){},scheduleMinimapRender(){},
  scheduleGeometryRefresh:(...args)=>c.classicWorkspaceView.scheduleGeometry(...args),scheduleViewportRefresh:(...args)=>c.classicWorkspaceView.scheduleViewport(...args),
  scheduleSmartGeometryRefresh:(...args)=>c.smartWorkspaceView.scheduleGeometry(...args),scheduleSmartViewportRefresh:(...args)=>c.smartWorkspaceView.scheduleViewport(...args),
  window:{addEventListener(type,fn){if(!handlers.has(type))handlers.set(type,new Set());handlers.get(type).add(fn);},removeEventListener(type,fn){handlers.get(type)?.delete(fn);}}});
 const owner=installWorkspaceView(c,kind);
 const schedule=()=>kind==='classic'?owner.scheduleGeometry(2,['a']):owner.scheduleGeometry(['a'],2);
 const tick=()=>{const batch=[...frames];frames.clear();batch.forEach(([,fn])=>fn());};
 return {c,node,owner,frames,timers,draws,handlers,schedule,tick};
}
for(const kind of ['classic','smart']){
 test(kind+' caches and queues have no external aliases and construction is DOM-free',()=>{
  const entry=fs.readFileSync('static/js/'+(kind==='classic'?'canvas.js':'smart-canvas.js'),'utf8');
  const source=fs.readFileSync('static/js/canvas/'+kind+'/'+(kind==='classic'?'canvas-workspace.js':'smart-workspace.js'),'utf8');
  const fields=kind==='classic'?['renderedCanvasLinks','canvasInputViewCache','geometryRefreshFrame','geometryRefreshPasses','geometryRefreshAll','geometryRefreshNodes','pendingViewportRefresh']:
   ['smartComputationContext','smartViewportScrolls','smartRenderedNodes','smartRenderedConnectionStates','smartGeometryFrame','smartGeometryPasses','smartGeometryAll','smartGeometryNodes','pendingSmartViewportRefresh'];
  const factory='create'+(kind==='classic'?'Classic':'Smart')+'WorkspaceView',body=functionSource(source,factory),outside=source.replace(body,'');
  for(const field of fields){assert.doesNotMatch(entry,new RegExp('\\b'+field+'\\b'));assert.doesNotMatch(outside,new RegExp('\\b'+field+'\\b'));}
  assert.doesNotMatch(fs.readFileSync('static/js/canvas/smart/smart-execution.js','utf8'),/smartComputationContext/);
  const {owner}=fixture(kind);assert.ok(Object.isFrozen(owner)&&Object.isFrozen(owner.state));assert.deepEqual(Object.keys(owner.state),['paused','destroyed','pendingGeometry','pendingViewport']);
 });
 for(const change of ['canvas','nodes','reset'])test(kind+' old queues cannot draw after '+change,()=>{
  const f=fixture(kind);f.schedule();f.owner.scheduleViewport();const old=[...f.frames.values(),...f.timers.values()];
  if(change==='canvas')f.c.canvas={id:'new'};if(change==='nodes')f.c.nodes=[{id:'a'}];if(change==='reset')f.owner.reset();
  old.forEach(fn=>fn());assert.deepEqual(f.draws,[]);assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);
  f.schedule();f.tick();assert.deepEqual(f.draws,[['a']]);
 });
 test(kind+' reset retires callbacks without canceling a newly queued correction',()=>{
  const f=fixture(kind);f.schedule();f.owner.scheduleViewport();const old=[...f.frames.values(),...f.timers.values()];f.owner.reset();
  f.schedule();f.owner.scheduleViewport();old.forEach(fn=>fn());assert.equal(f.frames.size,1);assert.equal(f.timers.size,1);assert.deepEqual(f.draws,[]);
  f.tick();assert.deepEqual(f.draws,[['a']]);
 });
 test(kind+' repeated binding owns only its handlers; cached pause cancels and resume never saves',()=>{
  const f=fixture(kind),other=()=>{};f.c.window.addEventListener('pagehide',other);
  f.owner.bind();f.owner.bind();assert.equal(f.handlers.get('pagehide').size,2);f.schedule();f.owner.scheduleViewport();
  f.handlers.get('pagehide').forEach(fn=>fn({persisted:true}));assert.equal(f.owner.state.paused,true);assert.equal(f.frames.size+f.timers.size,0);
  f.schedule();assert.equal(f.frames.size,0);f.handlers.get('pageshow').forEach(fn=>fn({persisted:true}));f.tick();assert.deepEqual(f.draws,[null]);
  f.owner.destroy();f.owner.destroy();f.owner.reset();f.owner.bind();f.schedule();f.owner.scheduleViewport();
  assert.equal(f.frames.size+f.timers.size,0);assert.equal(f.handlers.get('pagehide').size,1);assert.equal(f.owner.state.destroyed,true);
 });
}
test('Classic input view keeps surviving nodes across array edits and invalidates on target replacement/reset',()=>{
 const {c,node,owner}=fixture('classic'),element={};owner.rememberInput(element,node,'same');assert.equal(owner.inputCurrent(element,node,'same'),true);
 c.canvas={...c.canvas,revision:2};assert.equal(owner.inputCurrent(element,node,'same'),true);
 c.nodes=c.nodes.slice();assert.equal(owner.inputCurrent(element,node,'same'),true);c.nodes[0]={...node};assert.equal(owner.inputCurrent(element,c.nodes[0],'same'),false);
 owner.rememberInput(element,c.nodes[0],'same');owner.reset();assert.equal(owner.inputCurrent(element,c.nodes[0],'same'),false);
});
test('Smart computation remains available after view destruction, nests synchronously and releases after exceptions',()=>{
 const {c,owner}=fixture('smart');c.canvas.connections=[{from:'a',to:'b',kind:'input'}];c.nodes.push({id:'b'});
 owner.withComputation(()=>{assert.equal(owner.nodeForComputation('a'),c.nodes[0]);owner.withComputation(()=>assert.equal(owner.connectionsForComputation('b').length,1));});
 assert.throws(()=>owner.withComputation(()=>{throw Error('failure');}));c.canvas.connections=[];assert.deepEqual([...owner.connectionsForComputation('b')],[]);
 owner.destroy();c.nodes[0]={id:'a',current:true};assert.equal(owner.nodeForComputation('a').current,true);assert.equal(owner.withComputation(()=>owner.nodeForComputation('a').current),true);
});
test('Smart focused refresh ignores replaced targets, cancels own listeners and retires timers on destroy',()=>{
 const f=fixture('smart');let leave,focused=true,replacements=0;
 const current={contains:()=>focused,addEventListener:(_type,fn)=>leave=fn,removeEventListener:(_type,fn)=>{if(fn===leave)leave=null;},isConnected:true,querySelector:()=>null,replaceWith:()=>replacements++};
 Object.assign(f.c,{smartAudioPreview:{dataChanged(){}},smartAffectedNodeIds:ids=>new Set(ids),CSS:{escape:s=>s},world:{querySelector:()=>current},document:{activeElement:{},createElement:()=>({content:{firstElementChild:{querySelector:()=>null}}})},
  refreshSmartNodes:(...args)=>f.owner.refreshNodes(...args),isSmartNodeInViewport:()=>true,renderSmartNodeHtml:()=>'',releaseSmartGroupPreviews(){},transplantSmartMediaElements(){},bindNodeEvents(){},bindSmartPreviewImageFallbacks(){},measureSmartNodeImages(){},smartSelection:{nodeId:''},scheduleSmartMinimapRender(){},refreshRunTimerPills(){},refreshIcons(){}});
 f.owner.refreshNodes(['a']);const oldLeave=leave;f.c.nodes[0]={id:'a'};focused=false;oldLeave();const batch=[...f.timers.values()];f.timers.clear();batch.forEach(fn=>fn());assert.equal(replacements,0);
 focused=true;f.owner.refreshNodes(['a']);assert.equal(typeof leave,'function');leave();assert.equal(f.timers.size,1);
 f.owner.destroy();assert.equal(leave,null);assert.equal(current._smartRefreshPending,false);assert.equal(f.timers.size,0);
});
