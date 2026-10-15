const {installSmartSelection}=require('./helpers/smart-selection.cjs');
const {readCanvasSource} = require('./helpers/canvas-source.cjs');
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const api=require('../static/js/canvas-task-results.js');
// These matrices isolate identity/scope guards. Semantic binding is exercised
// with the real protocol in classic-task-input-bindings.cjs and smart-task-input-bindings.cjs.
const scopeOnlyBinding=()=>({check(){},verify(){},prepare:async()=>({}),beginSubmission(){},remember(){},mutate:fn=>fn(),apply:(task,fn)=>fn()});
const sources=Object.fromEntries(['canvas.js','smart-canvas.js'].map(file=>[file,readCanvasSource(path.join(__dirname,'../static/js',file),'utf8').replace(/\r\n/g,'\n')]));
function install(context,file,...names){
 if(file==='canvas.js'){
  context.window.VideoDurationPolicy ||= require('../static/js/video-duration-policy.js');
  context.videoNodeDurationRange ||= ()=>({min:1,max:60,auto:false});
  context.classicTaskInputBinding ||= scopeOnlyBinding;
  context.classicPendingInputBinding ||= ()=>scopeOnlyBinding();
  context.attachClassicTaskBinding ||= pending=>pending;
  context.pauseClassicTaskInput ||= ()=>{};
 }
 if(file==='smart-canvas.js'){
  context.pauseSmartTaskInput ||= ()=>{};
  context.smartTaskInputBinding ||= scopeOnlyBinding;
  context.smartTaskUiGuard ||= ()=>()=>true;
  context.attachSmartTaskBinding ||= (task,binding)=>Object.defineProperty(task,'_inputBinding',{value:binding,enumerable:false});
 }
 if(!vm.isContext(context))vm.createContext(context);
 for(const name of names){
  const source=sources[file], match=new RegExp('(?:async )?function '+name+'\\(').exec(source);
  assert.ok(match,name);
  const start=match.index, next=source.slice(start+1).search(/\n(?:async )?function /);
  vm.runInContext(source.slice(start,next<0?undefined:start+1+next),context,{filename:file+':'+name});
 }
 return context;
}
function fixture(){
 const entry={memberId:'m',workspaceId:'w',lease:{epoch:1,generation:2,canEdit:true}};
 const w={CanvasSession:{enabled:true,context:{member:{id:'m'},workspace:{id:'w'}}},MemberCanvasEdit:{active:entry,get canEdit(){return this.active.lease.canEdit;}}};
 w.CanvasTaskResults={capture:()=>api.capture(w),guard:(targets,read)=>api.guard(targets,read,w),pending:api.pending};
 return w;
}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const clone=v=>JSON.parse(JSON.stringify(v));
const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check){for(let i=0;i<20&&!check();i++)await turn();assert.ok(check(),'request reached deferred boundary');}
function change(c,scenario,source,out){
 if(scenario==='handoff')c.window.MemberCanvasEdit.active.lease.generation++;
 if(scenario==='reentry')c.window.MemberCanvasEdit.active={...c.window.MemberCanvasEdit.active};
 if(scenario==='paused')c.window.CanvasSession.paused=true;
 if(scenario==='readonly')c.window.MemberCanvasEdit.active.lease.canEdit=false;
 if(scenario==='member')c.window.CanvasSession.context.member={id:'another-member'};
 if(scenario==='workspace')c.window.CanvasSession.context.workspace={id:'another-workspace'};
 if(scenario==='source')c.nodes=c.nodes.filter(n=>n!==source);
 if(scenario==='target')c.nodes=c.nodes.map(n=>n===out?{...clone(out),marker:'replacement'}:n);
 if(scenario==='canvas')c.canvas={id:'new'};
 if(scenario==='task')out.pendingTasks=out.pendingTasks.map(t=>({...t,marker:'replacement'}));
}
test('write guard binds source/target objects and scope, permits unrelated nodes, and stays paused',()=>{
 const w=fixture(),source={},target={},state={canvas:{},nodes:[source,target]};
 const guard=api.guard([source,target],()=>state,w);
 state.nodes.push({});assert.equal(guard.valid(),true);
 state.nodes[1]={};assert.equal(guard.valid(),false);
 assert.throws(()=>guard.check(),e=>e.resultPending===true);
 state.nodes[1]=target;assert.equal(guard.valid(),false);
 const second=api.guard([source],()=>state,w);w.CanvasSession.context={};assert.equal(second.valid(),false);
});
for(const kind of ['Image','Video'])test('classic '+kind+' polling rejects late errors and same-ID source/target replacement',async()=>{
 for(const outcome of ['success','failure'])for(const scenario of ['unchanged','source','target','task','handoff','canvas']){
  const w=fixture(),source={id:'src'},out={id:'out'},pending={run:{node:{id:'src'}}};out._pending=[pending];
  const gate=deferred();let finish=0,fail=0;
  const request=async()=>{await gate.promise;if(outcome==='failure')throw Error('upstream failed');return {ok:true,json:async()=>({status:'succeeded',canvas_edit_generation:2,result:{images:['i'],videos:['v']}})};};
  w.CanvasApi={getCanvasImageTaskRequest:request,getCanvasVideoTaskRequest:request};
  const c={window:w,nodes:[source,out],canvas:{id:'c'},activeCanvasTaskPolls:new Set(),findPendingTask:()=>({out,pending:out._pending[0]}),
   cascadeFetch:()=>{},canvasTaskPollRetryWindow:()=>0,completeCanvasImageTask:()=>finish++,completeCanvasVideoTask:()=>finish++,
   failCanvasImageTask:()=>fail++,failCanvasVideoTask:()=>fail++,videoOutputsFromResult:r=>r.videos,tr:s=>s,normalizeCanvasTaskError:e=>e.message,isCascadeAbortError:()=>false};
  install(c,'canvas.js','pollCanvas'+kind+'Task');const waiting=c['pollCanvas'+kind+'Task']('t');
  if(scenario==='task')out._pending=[{...pending}];else change(c,scenario,source,out);
  gate.resolve();const result=await waiting;
  assert.equal(result,scenario==='unchanged'&&outcome==='success'?'succeeded':'paused',outcome+scenario);
  assert.equal(finish,scenario==='unchanged'&&outcome==='success'?1:0);assert.equal(fail,0);
  assert.equal(c.activeCanvasTaskPolls.size,0);
 }
});
function classicRun(kind,stage,outcome){
 const w=fixture(),source={id:'src',type:kind==='Image'?'generator':'video'},out={id:'out',images:[]};
 const gate=deferred(),counts={render:0,save:0,log:0,finish:0,error:0},timers=[];
 let reached=false;
 const boundary=async at=>{if(at===stage){reached=true;await gate.promise;if(outcome==='failure')throw Error('upstream failed');}};
 const c={window:w,nodes:[source,out],canvas:{id:'c'},apiProviders:[],nowMs:()=>1000,uid:()=> 'pending',tr:s=>s,alert:()=>counts.error++,showErrorModal:()=>counts.error++,
   allowedImageResolutions:()=>['1k','2k','4k','custom'],allowedVideoResolutions:()=>['','480p','720p','1080p'],
   cascadeTargetIdFromOptions:()=>'',orderedSources:(n,s)=>s,generatorSources:()=>[{prompt:'hello',refs:[]}],imageRefsOnly:r=>r,videoRefsOnly:()=>[],audioRefsOnly:()=>[],
  applyUploadedUrlToRefs:r=>r,resolveImageProviderId:p=>p,resolveVideoProviderId:p=>p,canvasAvatarPlatform:()=>'',resolveImageModel:()=> 'model',generatorSizeForRun:async()=> 'auto',normalizedImageQuality:()=>'',manualVideoUrlForNode:()=>'',
  outputForNode:()=>out,runSnapshot:()=>({node:{id:'src'}}),refreshRunNodes:()=>counts.render++,scheduleSave:()=>counts.save++,saveCanvas:async()=>{},setTimeout:fn=>timers.push(fn),
  createCanvasImageTask:async()=>{await boundary('submit');return {task_id:'t'};},createCanvasVideoTask:async()=>{await boundary('submit');return {task_id:'t'};},
  makePendingForRun:(id,run,node,options,metadata)=>({id,run,...metadata}),
  activeCanvasTaskPolls:new Set(),findPendingTask:()=>out._pending?.length?{out,pending:out._pending[0]}:null,
  completeCanvasImageTask:()=>{out.images.push('result');out._pending=[];counts.finish++;},completeCanvasVideoTask:()=>{out.images.push('result');out._pending=[];counts.finish++;},
  failCanvasImageTask:()=>{},failCanvasVideoTask:()=>{},videoOutputsFromResult:r=>r.videos,cascadeFetch:()=>{},isCascadeAbortError:()=>false,canvasTaskPollRetryWindow:()=>0,
  normalizeCanvasTaskError:e=>e.message,pendingById:(o,id)=>o?._pending?.find(p=>p.id===id),collectRunMetas:()=>[{runMs:1}],collectRunMeta:()=>({runMs:1}),addGenerationLog:()=>counts.log++};
 const request=async()=>{await boundary('poll');return {ok:true,json:async()=>({status:'succeeded',canvas_edit_generation:outcome==='old-generation'?1:2,result:{images:['result'],videos:['result']}})};};
 w.CanvasApi={getCanvasImageTaskRequest:request,getCanvasVideoTaskRequest:request};
 install(c,'canvas.js','canvasTaskWriteGuard','pollCanvas'+kind+'Task',kind==='Image'?'runGenerator':'runVideoNode');
 return {c,source,out,gate,counts,timers,reached:()=>reached,start:()=>c[kind==='Image'?'runGenerator':'runVideoNode']('src')};
}
for(const kind of ['Image','Video'])test('classic '+kind+' outer generation preserves nodes on late submission/poll success and failure',async()=>{
 for(const stage of ['submit','poll'])for(const outcome of ['success','failure'])for(const scenario of ['unchanged','handoff','reentry','source','target','canvas','paused','readonly','member','workspace']){
  const f=classicRun(kind,stage,outcome),waiting=f.start();await until(f.reached);change(f.c,scenario,f.source,f.out);
  const before=clone({nodes:f.c.nodes,source:f.source,out:f.out,counts:f.counts});f.gate.resolve();await waiting;
  if(scenario==='unchanged'){
   assert.equal(f.counts.finish,outcome==='success'?1:0);
   if(outcome==='failure' && stage!=='poll')assert.ok(f.counts.error>0);
   if(outcome==='failure' && stage==='poll'){assert.equal(f.counts.error,0);assert.equal(f.out._pending.length,1);}
  }
  else {for(const timer of f.timers)timer();assert.deepEqual(clone({nodes:f.c.nodes,source:f.source,out:f.out,counts:f.counts}),before,stage+outcome+scenario);}
 }
});
for(const kind of ['Image','Video'])test('classic '+kind+' old persisted generation does not trigger outer failure cleanup',async()=>{
 const f=classicRun(kind,'poll','old-generation'),waiting=f.start();await until(f.reached);const before=clone({source:f.source,out:f.out,counts:f.counts});f.gate.resolve();await waiting;for(const timer of f.timers)timer();
 assert.deepEqual(clone({source:f.source,out:f.out,counts:f.counts}),before);
});
function smartRun(stage,outcome){
 const w=fixture(),source={id:'src',type:'smart-image',images:[{url:'original'}]},out={id:'out',images:[]};
 const gate=deferred(),counts={render:0,save:0,log:0,finish:0,error:0,restore:0};let reached=false;
 const boundary=async at=>{if(at===stage){reached=true;await gate.promise;if(outcome==='failure')throw Error('upstream failed');}};
 const c={window:w,nodes:[source],canvas:{id:'c',connections:[]},settings:{engine:'api',apiKind:'image',count:1},
  selectedId:'src',selectedNode:()=>source,isSmartCanvasLocked:()=>false,savePromptDraftForCurrent:()=>{},cloneSmartSettings:s=>({...s}),smartSettingsForNode:()=>({engine:'api',apiKind:'image',count:1}),buildPromptRequest:()=>({prompt:'hello',refs:[]}),
  snapshotRunMeta:()=>({}),smartRunSnapshot:()=>({nodeId:'src',settings:{}}),rememberRecentSmartSettings:()=>{},nowMs:()=>1000,isApiLikeEngine:e=>e==='api',smartImageUsesWorkflowInput:()=>false,
  pushUndo:()=>{},stripRunInputMeta:m=>m,undoSuppressed:false,createPendingOutputFromSource:()=>{c.nodes.push(out);return out;},coolNodeRunningState:()=>{},coolRunButton:()=>{},render:()=>counts.render++,runBtn:{},
  runApiGeneration:async()=>{await boundary('submit');return {taskIds:['t'],providerId:'p',model:'model'};},
  smartPendingTasks:n=>n.pendingTasks||[],activeSmartNodeResumes:new Map(),refreshSmartNodes:()=>counts.render++,scheduleSave:()=>counts.save++,saveCanvas:async()=>{},
  pollSmartCanvasTask:async()=>{await boundary('poll');if(outcome==='old-generation')throw api.pending();return {result:{images:['new']}};},resultMediaUrls:r=>r,
  finalizeSmartPendingTask:(n,id,outputs)=>{n.images=outputs;n.pendingTasks=[];n.pending=0;counts.finish++;},smartRecoverableImageTask:()=>null,
  restoreSourceVisualState:()=>counts.restore++,clearPromptInput:()=>{},addSmartGenerationLog:()=>counts.log++,toast:()=>counts.error++,tr:s=>s};
 installSmartSelection(c);
 install(c,'smart-canvas.js','canvasTaskWriteGuard','resumeSmartPendingNode','runGeneration');
 return {c,source,out,gate,counts,reached:()=>reached,start:()=>c.runGeneration()};
}
test('smart outer generation keeps branches and pending results after handoff, scope or node replacement',async()=>{
 for(const stage of ['submit','poll'])for(const outcome of ['success','failure'])for(const scenario of ['unchanged','handoff','reentry','source','target','canvas',...(stage==='poll'?['task']:[])]){
  const f=smartRun(stage,outcome),waiting=f.start();await until(f.reached);change(f.c,scenario,f.source,f.out);
  const before=clone({nodes:f.c.nodes,source:f.source,out:f.out,counts:f.counts});f.gate.resolve();await waiting;
  if(scenario==='unchanged'){assert.equal(f.counts.finish,outcome==='success'?1:0);if(outcome==='failure')assert.ok(f.counts.error>0);}
  else assert.deepEqual(clone({nodes:f.c.nodes,source:f.source,out:f.out,counts:f.counts}),before,stage+outcome+scenario);
  assert.equal(f.c.activeSmartNodeResumes.size,0);
 }
});
test('smart paused polling propagates through resume and does not remove the output branch',async()=>{
 const f=smartRun('poll','old-generation'),waiting=f.start();await until(f.reached);const before=clone({nodes:f.c.nodes,counts:f.counts});f.gate.resolve();await waiting;
 assert.deepEqual(clone({nodes:f.c.nodes,counts:f.counts}),before);
});

for(const kind of ['classic','smart'])test(kind+' manual recovery validates source, output and exact pending record on success/failure',async()=>{
 for(const outcome of ['success','failure'])for(const scenario of ['unchanged','handoff','source','target','task']){
  const w=fixture(),source={id:'src'},out={id:'out'},task={id:'p',taskId:'t',canvasTaskId:'t',_inputBinding:scopeOnlyBinding(),recoverTaskId:'upstream',run:{nodeId:'src',node:{id:'src'}}};out.pendingTasks=[task];out._pending=[task];
  const gate=deferred(),counts={render:0,save:0,error:0,finish:0};
  w.CanvasApi={getCanvasImageTaskRequest:async()=>{await gate.promise;if(outcome==='failure')throw Error('query failed');return {ok:true,json:async()=>({id:'t',status:'succeeded',canvas_edit_generation:2,result:{images:['result']}})};}};
  const c={window:w,nodes:[source,out],canvas:{id:'c'},findOutputByPendingId:()=>out,pendingById:(o,id)=>o._pending.find(t=>t.id===id),smartPendingTasks:n=>n.pendingTasks||[],
   providerIdForPending:()=> 'p',providerIdForSmartTask:()=> 'p',tr:s=>s,refreshNodes:()=>counts.render++,refreshSmartNodes:()=>counts.render++,scheduleSave:()=>counts.save++,showErrorModal:()=>counts.error++,toast:()=>counts.error++,
   completeRecoverPendingOutput:()=>{counts.finish++;out._pending=[];counts.save++;},finalizeSmartPendingTask:()=>{counts.finish++;out.pendingTasks=[];}};
  install(c,kind==='classic'?'canvas.js':'smart-canvas.js','canvasTaskWriteGuard',kind==='classic'?'queryRecoverPendingOutput':'querySmartImageTaskNow');
  const waiting=kind==='classic'?c.queryRecoverPendingOutput('p'):c.querySmartImageTaskNow('out','t');
  if(scenario==='task'){out._pending=[{...task}];out.pendingTasks=[{...task}];}else change(c,scenario,source,out);
  const before=clone({nodes:c.nodes,task,counts});gate.resolve();await waiting;
  if(scenario==='unchanged'){assert.equal(counts.finish,outcome==='success'?1:0);assert.ok(counts.save>0);}
  else assert.deepEqual(clone({nodes:c.nodes,task,counts}),before,outcome+scenario);
 }
});
test('smart video submission cleanup cannot remove a replacement pending record or target',async()=>{
 for(const outcome of ['success','failure'])for(const scenario of ['unchanged','handoff','target','task']){
  const w=fixture(),out={id:'out',images:[]},gate=deferred(),counts={render:0,save:0,resume:0};
  const c={window:w,nodes:[out],canvas:{id:'c'},nowMs:()=>1,cloneSmartSettings:s=>({...s}),archiveSmartOutputsBeforePending:()=>{},smartPendingTasks:n=>n.pendingTasks||[],
   render:()=>counts.render++,scheduleSave:()=>counts.save++,saveCanvas:async()=>{},resumeSmartPendingNode:async()=>{counts.resume++;out.images=[{url:'v'}];out.pendingTasks=[];},tr:s=>s};
  installSmartSelection(c);
 install(c,'smart-canvas.js','canvasTaskWriteGuard','queueAndResumeSmartApiTasks');
  const waiting=c.queueAndResumeSmartApiTasks(out,{taskIds:['t'],submission:gate.promise},{kind:'video'});await turn();
  change(c,scenario,out,out);const before=clone({nodes:c.nodes,out,counts});
  const result=waiting.then(()=>null,e=>e);if(outcome==='failure')gate.reject(Error('submit failed'));else gate.resolve();const error=await result;
  if(scenario==='unchanged'){assert.equal(counts.resume,outcome==='success'?1:0);assert.equal(Boolean(error),outcome==='failure');}
  else {assert.equal(error.resultPending,true);assert.deepEqual(clone({nodes:c.nodes,out,counts}),before);}
 }
});
function classicCascade(mode,outcome){
 const w=fixture(),source={id:'src',type:'generator'},out={id:'tail'},gate=deferred(),counts={render:0,clear:0,runs:0};let reached=false;
 const c={window:w,nodes:[source,out],canvas:{id:'c'},cascadeContexts:new Map(),cascadeRunningIds:new Set(),cascadeRunningNodeIds:new Set(),cascadeStopIds:new Set(),cascadeSerialIds:new Set(),
  nowMs:()=>1,clearTimeout:()=>{},setTimeout:()=>1,computeCascadeOrder:()=>['src'],cascadeBusyNodeId:()=>'',resolveCascadeLoop:()=>mode==='parallel'?{count:2,mode,node:{id:'tail'}}:null,
  cascadeUiNodeIds:()=>['src','tail'],refreshNodes:()=>counts.render++,cascadeParallelLimit:()=>2,
  runLimitedCascadeRounds:async(rounds,limit,runner)=>Promise.allSettled(rounds.map(runner)),
  runCascadeNodeWithLoopContext:async()=>{counts.runs++;reached=true;await gate.promise;if(outcome==='failure')throw Error('generation failed');if(outcome==='paused')throw api.pending();},
  clearCascadeNodeState:()=>counts.clear++,isCascadeAbortError:()=>false,tr:s=>s,alert:()=>{}};
 install(c,'canvas.js','canvasTaskWriteGuard','cascadeContextFor','createCascadeContext','clearCascadeCleanupTimer','beginCascade','ensureCascadeActive','abandonCascade','queueCascadeCleanup','finalizeCascade','runNodeCascade');
 return {c,source,out,gate,counts,reached:()=>reached,start:()=>c.runNodeCascade('tail')};
}
for(const mode of ['serial','parallel'])test('classic '+mode+' cascade does not turn deferred results into failed nodes or clear a newer run',async()=>{
 for(const outcome of ['success','failure','paused'])for(const scenario of ['unchanged','handoff','target','new-run']){
  const f=classicCascade(mode,outcome),waiting=f.start();await until(f.reached);
  let replacement;
  if(scenario==='new-run'){replacement={order:['new'],targetId:'tail',status:'running'};f.c.cascadeContexts.set('tail',replacement);}else change(f.c,scenario,f.source,f.out);
  const before=clone({nodes:f.c.nodes,counts:f.counts});f.gate.resolve();await waiting;
  if(scenario==='unchanged'&&outcome!=='paused')assert.equal(f.source.runStatus,outcome==='success'?'done':'failed');
  else assert.deepEqual(clone({nodes:f.c.nodes,counts:f.counts}),before,mode+outcome+scenario);
  if(replacement){assert.equal(f.c.cascadeContexts.get('tail'),replacement);assert.equal(f.c.cascadeRunningIds.has('tail'),true);}
  else assert.equal(f.c.cascadeRunningIds.size,0);
 }
});
test('classic delayed cascade cleanup rejects handoff and newer same-ID runtime',()=>{
 for(const scenario of ['unchanged','handoff','target','new-run']){
  const f=classicCascade('serial','success');let timer;
  f.c.setTimeout=fn=>{timer=fn;return 1;};
  const ctx=f.c.beginCascade('tail',['src']);f.source.runStatus='done';f.c.queueCascadeCleanup(ctx,['src']);
  let replacement;if(scenario==='new-run'){replacement={targetId:'tail'};f.c.cascadeContexts.set('tail',replacement);}else change(f.c,scenario,f.source,f.out);
  const before=clone({nodes:f.c.nodes,counts:f.counts});timer();
  if(scenario==='unchanged')assert.equal(f.counts.clear,1);else assert.deepEqual(clone({nodes:f.c.nodes,counts:f.counts}),before);
  if(replacement)assert.equal(f.c.cascadeContexts.get('tail'),replacement);
 }
});
test('smart running timer does not clear a replacement node or newer run token',()=>{
 for(const scenario of ['unchanged','handoff','target','new-run']){
  const w=fixture(),node={id:'n'},timers=[];let renders=0;
  const c={window:w,nodes:[node],canvas:{},smartRunStateToken:0,smartNodeRunTokens:new Map(),setTimeout:fn=>timers.push(fn),render:()=>renders++};
  installSmartSelection(c);
 install(c,'smart-canvas.js','canvasTaskWriteGuard','coolNodeRunningState');c.coolNodeRunningState(node);
  if(scenario==='new-run')c.smartNodeRunTokens.set('n',999);else change(c,scenario,node,node);
  const before=clone(c.nodes);timers[0]();
  if(scenario==='unchanged'){assert.equal(node.running,false);assert.equal(renders,1);}else{assert.deepEqual(clone(c.nodes),before);assert.equal(renders,0);}
  if(scenario==='new-run')assert.equal(c.smartNodeRunTokens.get('n'),999);else assert.equal(c.smartNodeRunTokens.size,0);
 }
});

test('smart cascade outer cleanup leaves another canvas and a newer run untouched',async()=>{
 for(const outcome of ['success','failure','paused'])for(const scenario of ['unchanged','handoff','target','canvas','new-run']){
  const w=fixture(),source={id:'src',type:'smart-image'},out={id:'out',type:'smart-image'},gate=deferred(),counts={render:0,save:0,error:0};let reached=false;
  const graph={path:[source,out],root:source,edges:[{key:'src->out'}],children:new Map([['src',[out]]])};
  const c={window:w,nodes:[source,out],canvas:{id:'c'},settings:{},selectedId:'out',selectedIds:[],selectedImage:{},smartComposer:{finishCascade(){},outputSelected(){}},
   smartCascadeRuns:new Map(),smartCascadeSilentSelection:false,smartLoopContext:null,smartCascadeRunPath:null,promptInput:{innerHTML:'original'},composer:{classList:{remove:()=>{}}},runBtn:{},cascadeRunBtn:{},
   isSmartCanvasLocked:()=>false,selectedNode:()=>out,canRunSmartCascade:()=>true,savePromptDraftForCurrent:()=>{},smartCascadeGraphForTail:()=>graph,
   smartCascadeAnyRunning:()=>c.smartCascadeRuns.size>0,cloneSmartSettings:s=>({...s}),syncSmartCascadeLegacyState:()=>{},pushUndo:()=>{},refreshConnectionLayer:()=>counts.render++,updateComposer:()=>counts.render++,
   isSmartImageNode:()=>true,defaultReferenceImagesFor:()=>[],
   runCascadeStepIntoNode:async()=>{reached=true;await gate.promise;if(outcome==='failure')throw Error('failed');if(outcome==='paused')throw api.pending();return [{url:'result'}];},cascadeRefsFromOutputs:r=>r,
   scheduleSave:()=>counts.save++,render:()=>counts.render++,toast:()=>counts.error++,tr:s=>s};
  installSmartSelection(c);
 install(c,'smart-canvas.js','canvasTaskWriteGuard','throwIfSmartCascadeStopRequested','runSmartCascade');
  const waiting=c.runSmartCascade(out);await until(()=>reached);
  let replacement;if(scenario==='new-run'){const key=[...c.smartCascadeRuns.keys()][0];replacement={runKey:key};c.smartCascadeRuns.set(key,replacement);change(c,'canvas',source,out);}else change(c,scenario,source,out);
  const before=clone({nodes:c.nodes,settings:c.settings,selectedId:c.smartSelection.nodeId,prompt:c.promptInput,counts});gate.resolve();await waiting;
  if(scenario==='unchanged'&&outcome!=='paused')assert.ok(counts.save>0||counts.error>0);
  else assert.deepEqual(clone({nodes:c.nodes,settings:c.settings,selectedId:c.smartSelection.nodeId,prompt:c.promptInput,counts}),before,outcome+scenario);
  if(replacement)assert.equal([...c.smartCascadeRuns.values()][0],replacement);else assert.equal(c.smartCascadeRuns.size,0);
 }
});
test('smart step guarded writeback preserves target state on late success/failure',async()=>{
 for(const outcome of ['success','failure','paused'])for(const scenario of ['unchanged','handoff','source','target','canvas']){
  const w=fixture(),source={id:'src',type:'smart-image'},out={id:'out',images:[{url:'old'}],promptDraftText:'keep'},gate=deferred(),counts={render:0,log:0,replace:0};let reached=false;
  const wait=async()=>{reached=true;await gate.promise;if(outcome==='failure')throw Error('failed');if(outcome==='paused')throw api.pending();return {urls:[{url:'result'}],kind:'image',outputs:[{url:'result'}]};};
  const c={window:w,nodes:[source,out],canvas:{id:'c'},settings:{engine:'api',apiKind:'image'},cloneSmartSettings:s=>({...s}),smartSettingsForNode:()=>({}),
   validOutpaintSize:()=>null,selfReferenceImagesForNode:()=>[],defaultReferenceImagesFor:()=>[],outputImagesForNode:()=>[],buildPromptRequestForNode:()=>({prompt:'hello',displayPrompt:'hello',refs:[]}),smartRunNeedsPrompt:()=>true,
   isApiLikeEngine:()=>true,smartRunSnapshot:()=>({settings:{}}),nowMs:()=>1,rememberRecentSmartSettings:()=>{},render:()=>counts.render++,smartCascadePathForCtx:()=>null,
   generateUrlsForCurrentSettings:wait,runApiGeneration:async()=>({taskIds:['t']}),queueAndResumeSmartApiTasks:wait,stripImageGenerationMeta:x=>x,copyMediaSizeFields:(item,x)=>x,
   replaceOutputsToNodeWithHistory:()=>counts.replace++,attachRunMeta:()=>counts.replace++,addSmartGenerationLog:()=>counts.log++,tr:s=>s};
  installSmartSelection(c);
 install(c,'smart-canvas.js','canvasTaskWriteGuard','runCascadeStepIntoNode');
  const waiting=c.runCascadeStepIntoNode(source,out,[]).then(value=>({value}),error=>({error}));
  await until(()=>reached);change(c,scenario,source,out);const before=clone({nodes:c.nodes,settings:c.settings,counts});gate.resolve();const result=await waiting;
  if(scenario==='unchanged'&&outcome!=='paused'){assert.equal(Boolean(result.error),outcome==='failure');if(outcome==='success')assert.ok(counts.replace>0);}
  else{assert.equal(result.error.resultPending,true);assert.deepEqual(clone({nodes:c.nodes,settings:c.settings,counts}),before,outcome+scenario);}
 }
});

test('classic asynchronous size preparation stops cleanly before submission when edit ownership changes',async()=>{
 const f=classicRun('Image','submit','success'),size=deferred();let reached=false,submissions=0;
 f.c.generatorSizeForRun=async()=>{reached=true;await size.promise;return 'auto';};
 f.c.createCanvasImageTask=async()=>{submissions++;return {task_id:'unexpected'};};
 const waiting=f.start();await until(()=>reached);change(f.c,'handoff',f.source,f.out);
 const before=clone({nodes:f.c.nodes,counts:f.counts});size.resolve();await waiting;
 assert.equal(submissions,0);assert.deepEqual(clone({nodes:f.c.nodes,counts:f.counts}),before);
});
test('member guard cannot become permissive when member mode or lease context disappears',()=>{
 for(const mutate of [w=>w.CanvasSession.enabled=false,w=>delete w.MemberCanvasEdit.active.lease,w=>delete w.CanvasSession.context.member]){
  const w=fixture(),guard=api.guard([],()=>({canvas:null,nodes:[]}),w);mutate(w);assert.equal(guard.valid(),false);assert.throws(()=>guard.check(),e=>e.resultPending===true);
 }
});

test('classic normal save acknowledgement can replace the canvas envelope without cancelling generation',async()=>{
 for(const kind of ['Image','Video']){
  const f=classicRun(kind,'poll','success');
  const c=f.c;
  Object.assign(c,{applyingRemoteCanvas:false,savingCanvasNow:false,saveCanvasAgain:false,localCanvasDirty:true,lastSavedCanvasSnapshot:'',viewport:{},lastCanvasUpdatedAt:0,currentCanvasTime:null,
   sanitizeConnections:()=>{},canvasSavePayload:()=>({nodes:c.nodes}),canvasSaveSnapshot:JSON.stringify,setStatus:()=>{},updateCanvasListRecord:()=>{},refreshGateViewControls:()=>{},console});
  c.window.MemberCanvasEdit.canSave=true;
  c.window.CanvasApi.saveCanvas=async()=>({ok:true,status:200,json:async()=>({canvas:{id:'c',revision:2,updated_at:1001}})});
  install(c,'canvas.js','saveCanvas');
  const waiting=f.start();await until(f.reached);
  assert.equal(c.canvas.revision,2);
  const priorEnvelope=c.canvas;f.out.note='ordinary edit during polling';await c.saveCanvas();assert.notEqual(c.canvas,priorEnvelope);
  f.gate.resolve();await waiting;
  assert.equal(f.counts.finish,1);assert.equal(f.out.images[0],'result');
 }
});
