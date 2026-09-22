const {readCanvasSource} = require('./helpers/canvas-source.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const bindings=require('../static/js/canvas-task-bindings.js'),guards=require('../static/js/canvas-task-results.js');
const clone=v=>JSON.parse(JSON.stringify(v));
function install(c,file,...names){const source=readCanvasSource('static/js/'+file,'utf8').replace(/\r\n/g,'\n');if(!vm.isContext(c))vm.createContext(c);for(const name of names){const start=source.search(new RegExp('(?:async )?function '+name+'\\('));assert.ok(start>=0,name);const next=source.slice(start+1).search(/\n(?:async )?function /);vm.runInContext(source.slice(start,next<0?undefined:start+1+next),c);}}
async function fixture(kind){
 const prompt={id:'prompt',type:'prompt',text:'original'},source={id:'src',type:'generator'},out={id:'out',type:'output',images:[]};
 const pending={id:'pending',canvasTaskId:'local-task',taskId:'local-task',failed:true,recoverTaskId:'upstream-task',run:{node:{id:'src'},nodeId:'src'}};
 if(kind==='classic')out._pending=[pending];else out.pendingTasks=[pending];
 const lease={epoch:1,generation:2,canEdit:true,revision:1},entry={memberId:'member',workspaceId:'space',lease};
 const win={CanvasCore:{responseErrorMessage:async()=> '查询失败'},CanvasSession:{enabled:true,context:{member:{id:'member'},workspace:{id:'space'}}},MemberCanvasEdit:{active:entry,get canEdit(){return lease.canEdit;}}};
 win.CanvasTaskResults={capture:()=>guards.capture(win),guard:(targets,read)=>guards.guard(targets,read,win)};
 const messages=[],calls=[],counts={complete:0,save:0,failed:0};let release,reject;const gate=new Promise((r,j)=>{release=r;reject=j;});
 const c={window:win,canvas:{id:'canvas'},nodes:[prompt,source,out],connections:[{from:'prompt',to:'src'},{from:'src',to:'out'}],activeCanvasTaskPolls:new Set(),activeSmartNodeResumes:new Map(),
  pendingById:(node,id)=>node?._pending?.find(t=>t.id===id),findOutputByPendingId:()=>c.nodes.find(n=>n._pending?.includes(pending)),findPendingTask:()=>out._pending?.includes(pending)?{out,pending}:null,
  smartPendingTasks:n=>n.pendingTasks||[],smartRecoverableImageTask:()=>pending,providerIdForPending:()=> 'changed-provider',providerIdForSmartTask:()=> 'changed-provider',
  refreshNodes(){},refreshRunNodes(){},refreshSmartNodes(){},scheduleSave:()=>counts.save++,tr:s=>s,toast:s=>messages.push(s),setStatus:s=>messages.push(s),showErrorModal:s=>messages.push(s),
  responseErrorMessage:async()=> 'unavailable',normalizeCanvasTaskError:e=>e.message,isCascadeAbortError:()=>false,nowMs:()=>1000,cascadeFetch(){},
  completeRecoverPendingOutput:(_o,_p,result)=>{counts.complete++;out.images.push(...result.images);out._pending=[];},
  finalizeSmartPendingTask:(_n,_id,images,_kind,result)=>{assert.equal(result.cost?.amount,12);counts.complete++;out.images.push(...images);out.pendingTasks=[];},
  failCanvasImageTask:(_id,error)=>{counts.failed++;pending.failed=true;pending.error=error;},
  resultMediaUrls:v=>v,smartPendingTaskRun:()=>null};
 const file=kind==='classic'?'canvas.js':'smart-canvas.js';install(c,file,'canvasTaskWriteGuard',kind==='classic'?'queryRecoverPendingOutput':'querySmartImageTaskNow');
 const guard=c.canvasTaskWriteGuard(source,out);
 const binding=bindings.operation({canvasId:'canvas',kind,sourceId:'src',targetId:'out',valid:guard.valid,
  read:()=>clone({nodes:c.nodes,connections:c.connections}),flush:async()=>true,revision:()=>lease.revision});
 const target=await binding.prepare();binding.beginSubmission();
 const record={id:'local-task',status:'succeeded',canvas_edit_generation:2,result:{images:['original-result'],cost:{amount:12}},
  canvas_binding:{version:3,canvas_id:'canvas',canvas_kind:kind,source_node_id:'src',target_node_id:'out',submitted_revision:1,graph_sha256:target.input_sha256,request_sha256:'a'.repeat(64)}};
 binding.remember(record);Object.defineProperty(pending,'_inputBinding',{value:binding,configurable:true});
 win.CanvasApi={getCanvasImageTaskRequest:async id=>{calls.push(id);await gate;return {ok:true,json:async()=>clone(record)};},queryImageTask:()=>{throw Error('member query must not contact legacy upstream');}};
 return {c,source,out,prompt,pending,record,binding,lease,counts,calls,messages,release,reject,file,start:()=>kind==='classic'?c.queryRecoverPendingOutput('pending'):c.querySmartImageTaskNow('out','local-task')};
}
for(const kind of ['classic','smart']){
 test(kind+' manual result uses durable local ID and consumes the bound result once',async()=>{
  const f=await fixture(kind),waiting=f.start();assert.deepEqual(f.calls,['local-task']);f.release();await waiting;assert.equal(f.counts.complete,1);assert.deepEqual(f.out.images,['original-result']);
  assert.throws(()=>f.binding.apply(f.record,()=>f.counts.complete++),e=>e.resultPending);assert.equal(f.counts.complete,1);
 });
 for(const scenario of ['prompt','model','connection','handoff','member','space','source','target','pending','receipt','task-id'])test(kind+' manual result preserves newer '+scenario,async()=>{
  const f=await fixture(kind),waiting=f.start();
  if(scenario==='prompt')f.prompt.text='keep new prompt';if(scenario==='model')f.source.model='new-model';
  if(scenario==='connection')f.c.connections=[];if(scenario==='handoff')f.lease.generation++;
  if(scenario==='member')f.c.window.CanvasSession.context.member.id='other';if(scenario==='space')f.c.window.CanvasSession.context.workspace.id='other';
  if(scenario==='source')f.c.nodes=f.c.nodes.map(n=>n===f.source?{...n}:n);if(scenario==='target')f.c.nodes=f.c.nodes.map(n=>n===f.out?clone(n):n);
  if(scenario==='pending'){if(kind==='classic')f.out._pending=[clone(f.pending)];else f.out.pendingTasks=[clone(f.pending)];}
  if(scenario==='receipt')f.record.canvas_binding.request_sha256='b'.repeat(64);if(scenario==='task-id')f.record.id='other-task';
  const before=clone(f.c.nodes);f.release();await waiting;assert.equal(f.counts.complete,0);assert.deepEqual(f.out.images,[]);
  // The querying spinner may clear only while the same member still owns this exact pending card.
  const clean=nodes=>nodes.map(n=>{for(const key of ['_pending','pendingTasks'])for(const p of n[key]||[])delete p.querying;return n;});
  assert.deepEqual(clean(clone(f.c.nodes)),clean(before));
 });
 test(kind+' persisted pending has no in-memory receipt and directs manual joining',async()=>{
  const f=await fixture(kind);delete f.pending._inputBinding;const waiting=f.start();f.release();await waiting;
  assert.equal(f.counts.complete,0);assert.ok(f.messages.some(m=>m.includes('生成结果列表确认加入')));assert.equal(f.pending.recoverTaskId,'upstream-task');
 });
 test(kind+' needs-review and network failure do not rewrite pending inputs or submit again',async()=>{
  for(const failure of [false,true]){const f=await fixture(kind);f.record.status='needs_review';const waiting=f.start();if(failure)f.reject(Error('network failed'));else f.release();await waiting;
   assert.equal(f.counts.complete,0);assert.equal(f.pending.error,undefined);assert.equal(f.pending.querying,false);assert.deepEqual(f.calls,['local-task']);
   f.binding.verify({...f.record,status:'succeeded'},'local-task');
  }
 });
 test(kind+' polling failure retains receipt for later manual completion',async()=>{
  const f=await fixture(kind);f.pending.failed=false;
  if(kind==='classic'){
   f.c.window.CanvasApi.getCanvasImageTaskRequest=async()=>({ok:true,json:async()=>({...clone(f.record),status:'needs_review',upstream_task_id:'upstream-task',error:'review'})});
   install(f.c,f.file,'classicPendingInputBinding','pollCanvasImageTask');assert.equal(await f.c.pollCanvasImageTask('local-task'),'failed');
  }else{
   f.c.pollSmartCanvasTask=async()=>{const e=Error('review');e.imageTaskRecover=true;e.recoverTaskId='upstream-task';e.canvasTaskRecord={...clone(f.record),status:'needs_review'};throw e;};
   install(f.c,f.file,'resumeSmartPendingNode');await f.c.resumeSmartPendingNode(f.out);assert.equal(f.pending.failed,true);
  }
  f.binding.verify(f.record,'local-task');f.c.window.CanvasApi.getCanvasImageTaskRequest=async()=>({ok:true,json:async()=>clone(f.record)});await f.start();assert.equal(f.counts.complete,1);
 });
 test(kind+' legacy query remains available outside member mode',async()=>{
  const f=await fixture(kind);f.c.window.CanvasSession.enabled=false;
  f.c.window.CanvasApi.queryImageTask=async payload=>{assert.equal(payload.task_id,'upstream-task');return {status:'succeeded',images:['legacy'],cost:{amount:12}};};
  await f.start();assert.equal(f.counts.complete,1);assert.deepEqual(f.out.images,['legacy']);assert.deepEqual(f.calls,[]);
 });
}

for(const kind of ['classic','smart'])for(const reason of ['reloaded','changed'])test(kind+' '+reason+' result opens confirmation without automatic joining',async()=>{
 const f=await fixture(kind);let opened=0;f.c.window.MemberCanvasEdit.openTaskResults=async()=>opened++;
 if(reason==='reloaded')delete f.pending._inputBinding;
 const waiting=f.start();if(reason==='changed')f.prompt.text='new prompt';f.release();await waiting;
 assert.equal(opened,1);assert.equal(f.counts.complete,0);assert.equal(f.pending.querying,false);
});

for(const kind of ['classic','smart']){
 test(kind+' missing local identity never falls back to arbitrary upstream queries',async()=>{
  const f=await fixture(kind);delete f.pending.canvasTaskId;delete f.pending.taskId;
  if(kind==='classic')await f.start();else await f.c.querySmartImageTaskNow('out','');
  assert.deepEqual(f.calls,[]);assert.equal(f.counts.complete,0);assert.ok(f.messages.some(m=>m.includes('缺少本地记录')));
 });
 test(kind+' unavailable local task cannot trigger upstream retry or result writes',async()=>{
  const f=await fixture(kind);f.c.window.CanvasApi.getCanvasImageTaskRequest=async()=>({ok:false,status:404});await f.start();
  assert.equal(f.counts.complete,0);assert.equal(f.pending.querying,false);assert.equal(f.pending.error,undefined);assert.ok(f.messages.length);
 });
}
test('smart stale task button cannot silently query a different recoverable task',async()=>{
 const f=await fixture('smart');await f.c.querySmartImageTaskNow('out','removed-task');assert.deepEqual(f.calls,[]);assert.equal(f.counts.complete,0);
});
