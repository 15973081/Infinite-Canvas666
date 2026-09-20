const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const coreSource=fs.readFileSync('static/js/canvas-core.js','utf8');
function fn(source,name){const a=source.indexOf(`function ${name}(`);assert.ok(a>=0);return source.slice(a,source.indexOf('\n}',a)+2);}
const ctx={window:{}};vm.runInNewContext(coreSource,ctx);const core=ctx.window.CanvasCore;
function tier(size){const [w,h]=size.split('x').map(Number);return Math.max(w,h)>=3000||w*h>4500000?'4k':Math.max(w,h)>=1800||w*h>1800000?'2k':'1k';}
for(const file of ['canvas','smart-canvas'])test(file+' source/custom ratios preserve the selected tier and aspect',()=>{
 const s=fs.readFileSync('static/js/'+file+'.js','utf8').replace(/\r/g,'');
 const c={window:{CanvasCore:core},parseRatioValue:r=>{const [w,h]=r.split(':').map(Number);return w/h;}};
 vm.createContext(c);for(const name of ['SIZE_MAP','RES_LONG_SIDE','RES_PIXEL_LIMIT'])vm.runInContext(s.match(new RegExp(`const ${name} = [\\s\\S]*?;`))[0],c);
 vm.runInContext(fn(s,'apiImageSize'),c);
 for(const resolution of ['1k','2k','4k'])for(const ratio of ['1:1','4:5','5:4','3:2','2:3','16:9','9:16','21:9','9:21'])for(const mode of ['source','custom']){
  const size=c.apiImageSize(mode,resolution,ratio),[w,h]=size.split('x').map(Number),[rw,rh]=ratio.split(':').map(Number);
  assert.equal(tier(size),resolution,`${mode} ${ratio} ${size}`);assert.ok(Math.abs(w/h-rw/rh)/(rw/rh)<.03,`${ratio} ${size}`);
 }
 assert.equal(c.apiImageSize('square','1k'),'1024x1024');assert.equal(c.apiImageSize('custom','custom','1:1','4096x4096'),'4096x4096');
});
test('library hover delays loading, coalesces movement, and never reopens during a drag',()=>{
 let next=0;const timers=new Map(),frames=new Map(),events={},winEvents={},shown=[],positions=[];
 const c={window:{addEventListener:(n,f)=>winEvents[n]=f},document:{addEventListener:(n,f)=>events[n]=f},
  setTimeout:f=>{timers.set(++next,f);return next;},clearTimeout:id=>timers.delete(id),
  requestAnimationFrame:f=>{frames.set(++next,f);return next;},cancelAnimationFrame:id=>frames.delete(id)};
 vm.runInNewContext(coreSource,c);const hover=c.window.CanvasCore.createAssetHoverController((p,i)=>shown.push(i),()=>{},p=>positions.push(p));
 const e=(x,buttons=0)=>({clientX:x,clientY:5,buttons}),flush=map=>{const all=[...map.values()];map.clear();all.forEach(f=>f());};
 hover.enter(e(1),{id:1});hover.hide();flush(timers);assert.equal(shown.length,0);
 hover.enter(e(1),{id:2});flush(timers);assert.equal(shown.length,1);
 for(let x=0;x<50;x++)hover.move(e(x));assert.equal(frames.size,1);flush(frames);assert.equal(positions[0].clientX,49);
 hover.enter(e(3),{id:3});events.dragstart();flush(timers);hover.enter(e(4),{id:4});assert.equal(timers.size,0);
 events.dragend();hover.enter(e(5,1),{id:5});assert.equal(timers.size,0);
 hover.enter(e(6),{id:6});events.pointerdown();flush(timers);assert.equal(shown.length,1);
 hover.enter(e(7),{id:7});flush(timers);assert.equal(shown[1].id,7);
});
test('a classic library drop mounts only its new node and retains original references',()=>{
 const source=fs.readFileSync('static/js/canvas.js','utf8').replace(/\r/g,'');let renders=0,saves=0;const mounted=[];
 const existing={id:'existing',type:'image'},c={nodes:[existing],ensureCanvas:()=>true,uid:()=> 'new',
  isVideoUrl:()=>false,isAudioUrl:()=>false,isNodeInCanvasViewport:()=>true,renderNode:n=>{renders++;return n;},
  nodesEl:{appendChild:n=>mounted.push(n)},refreshGeometry:()=>{},refreshGeometryAfterLayout:()=>{},refreshIcons:()=>{},bindCanvasPreviewImageFallbacks:()=>{},scheduleSave:()=>saves++,
  render:()=>{throw Error('must not rebuild the whole canvas');}};
 vm.createContext(c);vm.runInContext(fn(source,'createImageCardFromUrl'),c);
 c.createImageCardFromUrl('/original',{x:5,y:6},'asset',{asset_uris:{volcengine:'asset://test'},asset_item_id:'asset',asset_library_id:'lib'});
 assert.equal(c.nodes[0],existing);assert.equal(renders,1);assert.equal(saves,1);assert.equal(mounted[0].url,'/original');assert.equal(mounted[0].asset_uris.volcengine,'asset://test');
});

for(const revoke of [false,true])test('generation rejection exits running and reports an error, revoke='+revoke,async()=>{
 const source=fs.readFileSync('static/js/canvas.js','utf8').replace(/\r/g,'');let valid=true,saves=0;const messages=[];
 const gen={id:'g',type:'generator',resolution:'1k'},out={id:'o',type:'output'};
 const guard={valid:()=>valid,check:()=>{},pause:()=>Object.assign(new Error('保留草稿'),{resultPending:true})};
 const c={nodes:[gen,out],window:{CanvasSession:{enabled:true},MemberCanvasEdit:{canEdit:true}},
  allowedImageResolutions:()=>['1k'],cascadeTargetIdFromOptions:()=>'',orderedSources:()=>[{prompt:'test'}],generatorSources:()=>[],imageRefsOnly:()=>[],
  outputForNode:()=>out,canvasTaskWriteGuard:()=>guard,classicTaskInputBinding:()=>null,runSnapshot:()=>({}),resolveImageProviderId:()=> 'p',resolveImageModel:()=> 'm',
  normalizedImageQuality:()=>'',nowMs:()=>1,refreshRunNodes:()=>{},setTimeout:()=>{},generatorSizeForRun:async()=> '1024x1024',
  createCanvasImageTask:async()=>{if(revoke)valid=false;throw new Error('模型规格不允许');},pauseClassicTaskInput:()=>{},
  isCascadeAbortError:()=>false,scheduleSave:()=>saves++,showErrorModal:m=>messages.push(m),tr:x=>x};
 vm.createContext(c);vm.runInContext('async '+fn(source,'runGenerator'),c);
 await c.runGenerator('g');assert.equal(gen.running,false);assert.equal(messages[0],'模型规格不允许');
 assert.equal(saves,revoke?0:1);assert.equal(out._pending,undefined);
});
