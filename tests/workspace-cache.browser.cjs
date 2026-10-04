const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function setup(t,kind){
 const f=await fixture(t,kind);await f.page.waitForLoadState('networkidle');
 await f.page.evaluate(kind=>{
  nodes=kind==='classic'?[{id:'a',type:'prompt',text:'A',x:20,y:20},{id:'b',type:'generator',inputs:['a'],x:430,y:20,model:'gpt-image-2'}]:
   [{id:'a',type:'smart-image',images:[],x:20,y:20},{id:'b',type:'smart-image',images:[],x:430,y:20}];
  const edges=[{id:'edge',from:'a',to:'b',kind:'input'}];if(kind==='classic')connections=edges;else canvas.connections=edges;
  render();window.cacheSaves=0;const save=scheduleSave;scheduleSave=(...args)=>{cacheSaves++;return save(...args);};
 },kind);
 await f.page.waitForTimeout(100);return f;
}
for(const kind of ['classic','smart']){
 test(kind+' real node/link DOM, coordinates and input scroll survive repeated partial cache use',async t=>{
  const {page,errors}=await setup(t,kind);
  const result=await page.evaluate(kind=>{
   const node=kind==='classic'?nodesEl.querySelector('.node[data-id="a"]'):world.querySelector('.image-node[data-id="a"]');
   const edge=kind==='classic'?linksEl.querySelector('.link[data-connection-id="edge"]'):world.querySelector('.smart-connection');
   const path=kind==='classic'?edge:edge.querySelector('path');const before=path.getAttribute('d');
   const textarea=node.querySelector('textarea');if(textarea){textarea.value='edited locally';textarea.scrollTop=35;}
   const scroll=textarea?.scrollTop;
   for(let i=0;i<120;i++){if(kind==='classic')renderLinks(['a']);else refreshConnectionLayer(['a']);}
   nodes[0].x+=30;node.style.left=nodes[0].x+'px';if(kind==='classic')renderLinks(['a']);else refreshConnectionLayer(['a']);
   const sameEdge=kind==='classic'?linksEl.querySelector('.link[data-connection-id="edge"]')===edge:world.querySelector('.smart-connection')===edge;
   if(kind==='smart'){render();render();}
   return {sameEdge,nodeSame:(kind==='classic'?nodesEl:world).querySelector(kind==='classic'?'.node[data-id="a"]':'.image-node[data-id="a"]')===node,
    changed:path.getAttribute('d')!==before,text:textarea?.value??null,scrollSame:textarea?.scrollTop===scroll,saves:cacheSaves};
  },kind);
  assert.equal(result.sameEdge,true);assert.equal(result.changed,true);assert.equal(result.saves,0);assert.equal(result.scrollSame,true);
  if(kind==='classic'){assert.equal(result.nodeSame,true);assert.equal(result.text,'edited locally');}
  else assert.equal(await page.evaluate(()=>{const ref=world.querySelector('.image-node[data-id="a"]');render();return world.querySelector('.image-node[data-id="a"]')===ref;}),true);
  assert.deepEqual(errors,[]);
 });
 test(kind+' real document replacement retires captured frame/timer without affecting a newly queued frame',async t=>{
  const {page,errors}=await setup(t,kind);
  const result=await page.evaluate(kind=>{
   const owner=kind==='classic'?classicWorkspaceView:smartWorkspaceView;owner.reset();
   window.cacheFrames=[];const raf=requestAnimationFrame,caf=cancelAnimationFrame;
   requestAnimationFrame=fn=>{cacheFrames.push(fn);return -cacheFrames.length;};cancelAnimationFrame=id=>{if(id>=0)caf(id);};
   const timeout=setTimeout;let oldTimer;setTimeout=(fn,ms,...args)=>{if(ms===54321)oldTimer=fn;return timeout(fn,ms,...args);};
   const paint=kind==='classic'?refreshGeometry:refreshConnectionLayer;let draws=0;
   if(kind==='classic')refreshGeometry=(...args)=>{draws++;return paint(...args);};else refreshConnectionLayer=(...args)=>{draws++;return paint(...args);};
   const schedule=()=>kind==='classic'?owner.scheduleGeometry(2,['a']):owner.scheduleGeometry(['a'],2);
   schedule();owner.scheduleViewport(54321);const old=cacheFrames[0];
   nodes=nodes.map(node=>({...node}));schedule();const fresh=cacheFrames[1];old();oldTimer();
   const afterOld={draws,pending:owner.state.pendingGeometry};fresh();
   owner.reset();requestAnimationFrame=raf;cancelAnimationFrame=caf;setTimeout=timeout;
   return {afterOld,draws,saves:cacheSaves};
  },kind);
  assert.deepEqual(result,{afterOld:{draws:0,pending:true},draws:1,saves:0});assert.deepEqual(errors,[]);
 });
 test(kind+' cached return resumes native corrections and permanent exit removes only owned lifecycle handlers',async t=>{
  const {page,errors}=await setup(t,kind);
  await page.evaluate(kind=>{
   const owner=kind==='classic'?classicWorkspaceView:smartWorkspaceView;owner.bind();owner.bind();window.sharedCacheShows=0;window.addEventListener('pageshow',()=>sharedCacheShows++);
   owner.scheduleViewport(54321);if(kind==='classic')owner.scheduleGeometry(2,['a']);else owner.scheduleGeometry(['a'],2);
   window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
  },kind);
  await page.waitForTimeout(40);
  assert.deepEqual(await page.evaluate(kind=>{const s=(kind==='classic'?classicWorkspaceView:smartWorkspaceView).state;return {paused:s.paused,geometry:s.pendingGeometry,viewport:s.pendingViewport,saves:cacheSaves};},kind),{paused:true,geometry:false,viewport:false,saves:0});
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await page.waitForTimeout(100);
  assert.equal(await page.evaluate(kind=>(kind==='classic'?classicWorkspaceView:smartWorkspaceView).state.paused,kind),false);
  await page.evaluate(kind=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}));const owner=kind==='classic'?classicWorkspaceView:smartWorkspaceView;owner.destroy();owner.bind();owner.reset();owner.scheduleViewport();window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));},kind);
  assert.deepEqual(await page.evaluate(kind=>{const s=(kind==='classic'?classicWorkspaceView:smartWorkspaceView).state;return {destroyed:s.destroyed,geometry:s.pendingGeometry,viewport:s.pendingViewport,other:sharedCacheShows,saves:cacheSaves};},kind),{destroyed:true,geometry:false,viewport:false,other:2,saves:0});
  assert.deepEqual(errors,[]);
 });
}

test('Smart actual focused refresh cannot redraw an identically named replacement node after blur',async t=>{
 const {page,errors}=await setup(t,'smart');
 const result=await page.evaluate(()=>{
  nodes[0]={...nodes[0],type:'smart-prompt',text:'editable'};smartSelection.createdNode('a');render();const element=world.querySelector('.image-node[data-id="a"]');
  const input=element.querySelector('input,textarea,[contenteditable]');input.focus();refreshSmartNodes(['a']);
  let replacementCalls=0;const original=refreshSmartNodes;refreshSmartNodes=(...args)=>{replacementCalls++;return original(...args);};
  nodes[0]={...nodes[0]};input.blur();return new Promise(resolve=>setTimeout(()=>resolve({calls:replacementCalls,pending:element._smartRefreshPending,saves:cacheSaves}),10));
 });
 assert.deepEqual(result,{calls:0,pending:false,saves:0});assert.deepEqual(errors,[]);
});
