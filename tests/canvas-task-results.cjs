const {readCanvasSource} = require('./helpers/canvas-source.cjs');
const test=require('node:test');
const assert=require('node:assert/strict');
const {capture,pending:pendingError}=require('../static/js/canvas-task-results.js');
const {mergeDeliveries}=require('../static/js/canvas-task-results.js');

for(const type of ['output','smart-image'])test(type+' server delivery preserves drafts, siblings and deleted targets without duplicates',()=>{
 const make=(id,version)=>({task_id:id,version,target_id:'out',node:{id:'result_'+id,type,images:[{media_asset_id:'ast_'+id,url:'/api/media/ast_'+id+'/original'}],result_task_id:id}});
 const document={id:'c',nodes:[{id:'out',type,promptDraftText:'unsaved prompt',images:[],_pending:[{canvasTaskId:'a'},{canvasTaskId:'b'}],pendingTasks:[{taskId:'a'},{taskId:'b'}]}]};
 const original=document.nodes[0];
 const first={canvas_id:'c',result_version:1,deliveries:[make('a',1)]};
 assert.deepEqual(mergeDeliveries(document,first),['out']);
 assert.equal(document.nodes[0],original);assert.equal(original.promptDraftText,'unsaved prompt');
 assert.equal(original.images.length,1);assert.deepEqual(original._pending,[{canvasTaskId:'b'}]);
 assert.deepEqual(mergeDeliveries(document,first),[]);
 document.nodes=[];
 mergeDeliveries(document,{canvas_id:'c',result_version:2,deliveries:[make('b',2)]});
 assert.equal(document.nodes[0].id,'result_b');assert.equal(document.nodes[0].images.length,1);
 const snapshot=JSON.stringify(document);
 assert.throws(()=>mergeDeliveries(document,{...first,canvas_id:'other'}));assert.equal(JSON.stringify(document),snapshot);
});

test('existing live result and server delivery are one output, even after smart metadata stripping',()=>{
 const image={media_asset_id:'ast_a',url:'/api/media/ast_a/original'};
 const document={id:'c',nodes:[{id:'out',type:'smart-image',images:[image],pendingTasks:[{taskId:'a'}]}]};
 mergeDeliveries(document,{canvas_id:'c',result_version:1,deliveries:[{version:1,task_id:'a',target_id:'out',node:{id:'result_a',images:[image]}}]});
 assert.equal(document.nodes.length,1);assert.equal(document.nodes[0].images.length,1);assert.equal(document.nodes[0].pending,0);
});
function fixture(){const entry={memberId:'m',workspaceId:'w',lease:{epoch:1,generation:2,canEdit:true}};return {CanvasSession:{enabled:true,context:{member:{id:'m'},workspace:{id:'w'}}},MemberCanvasEdit:{active:entry}};}
test('late task result is rejected after transfer, pause, same-user reentry, or scope switch',()=>{
 for(const change of [w=>w.MemberCanvasEdit.active.lease.epoch++,w=>w.MemberCanvasEdit.active.lease.generation++,w=>w.MemberCanvasEdit.active.lease.canEdit=false,w=>w.CanvasSession.paused=true,w=>w.CanvasSession.context.member.id='other',w=>w.CanvasSession.context.workspace.id='other',w=>w.MemberCanvasEdit.active={...w.MemberCanvasEdit.active}]){
  const w=fixture(),valid=capture(w);assert.equal(valid(),true);change(w);assert.equal(valid(),false);
 }
});
test('view mode response cannot acquire permission from a later edit start',()=>{const w=fixture();w.MemberCanvasEdit.active.lease.canEdit=false;const valid=capture(w);w.MemberCanvasEdit.active.lease.canEdit=true;assert.equal(valid(),false);});
test('legacy task behavior remains available without member mode',()=>assert.equal(capture({})(),true));

const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function sourceFunction(file,name){
 const source=readCanvasSource(path.join(__dirname,'../static/js/',file),'utf8');
 const start=source.indexOf('async function '+name+'(');
 assert.ok(start>=0);
 const next=source.slice(start+1).search(/\n(?:async )?function /);
 return source.slice(start,next<0?undefined:start+1+next);
}
for(const kind of ['Image','Video']) {
 test('classic '+kind+' actual polling rejects handoff, deleted target and changed persisted generation',async()=>{
  for(const scenario of ['unchanged','handoff','deleted','generation','canvas']) {
   const w=fixture();w.CanvasTaskResults={capture:()=>capture(w),pending:pendingError};
   let pending={},finish=0,fail=0,release;
   const response={status:'succeeded',canvas_edit_generation:2,result:{images:['image'],videos:['video']}};
   const arrived=new Promise(resolve=>release=resolve);
   const request=async()=>{await arrived;return {ok:true,json:async()=>response};};
   w.CanvasApi={getCanvasImageTaskRequest:request,getCanvasVideoTaskRequest:request};
   const context={window:w,classicPendingInputBinding:()=>({check(){},verify(){},apply:(task,fn)=>fn()}),canvas:{id:'c'},activeCanvasTaskPolls:new Set(),findPendingTask:()=>pending?{pending}:null,
    cascadeFetch:()=>{},completeCanvasImageTask:()=>finish++,completeCanvasVideoTask:()=>finish++,
    failCanvasImageTask:()=>fail++,failCanvasVideoTask:()=>fail++,videoOutputsFromResult:r=>r.videos,
    tr:s=>s,normalizeCanvasTaskError:e=>e.message,isCascadeAbortError:()=>false};
   vm.createContext(context);vm.runInContext(sourceFunction('canvas.js','pollCanvas'+kind+'Task'),context);
   const waiting=context['pollCanvas'+kind+'Task']('task');
   if(scenario==='handoff')w.MemberCanvasEdit.active.lease.generation++;
   if(scenario==='deleted')pending=null;
   if(scenario==='generation')response.canvas_edit_generation=1;
   if(scenario==='canvas')context.canvas={id:'another'};
   release();
   assert.equal(await waiting,scenario==='unchanged'?'succeeded':'paused',scenario);
   assert.equal(finish,scenario==='unchanged'?1:0,scenario);assert.equal(fail,0,scenario);
   assert.equal(context.activeCanvasTaskPolls.size,0);
  }
 });
}
test('smart actual task polling leaves old generation and lost edit responses pending',async()=>{
 for(const scenario of ['unchanged','handoff','generation']) {
  const w=fixture();w.CanvasTaskResults={capture:()=>capture(w),pending:pendingError};
  let release;const arrived=new Promise(resolve=>release=resolve);
  const response={status:'succeeded',canvas_edit_generation:2,result:{images:['image']}};
  const context={window:w,activeSmartTaskPolls:new Map(),setTimeout:fn=>{queueMicrotask(fn);return 1;},
   fetch:async()=>{await arrived;return {ok:true,json:async()=>response};}};
  vm.createContext(context);vm.runInContext(sourceFunction('smart-canvas.js','pollSmartCanvasTask'),context);
  const waiting=context.pollSmartCanvasTask('task');
  if(scenario==='handoff')w.MemberCanvasEdit.active.lease.canEdit=false;
  if(scenario==='generation')response.canvas_edit_generation=1;
  release();
  if(scenario==='unchanged')assert.deepEqual(await waiting,response.result);
  else await assert.rejects(waiting,e=>e.resultPending===true);
  assert.equal(context.activeSmartTaskPolls.size,0);
 }
});
