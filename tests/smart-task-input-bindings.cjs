const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const bindings=require('../static/js/canvas-task-bindings.js');
const guards=require('../static/js/canvas-task-results.js');
const source=fs.readFileSync(path.join(__dirname,'../static/js/smart-canvas.js'),'utf8');
const clone=v=>JSON.parse(JSON.stringify(v));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function until(check){const deadline=Date.now()+5000;while(!check()&&Date.now()<deadline)await new Promise(r=>setTimeout(r,5));assert.ok(check(),'reached async boundary');}
function install(c,...names){vm.createContext(c);for(const name of names){const start=new RegExp('(?:async )?function '+name+'\\(').exec(source).index;const next=source.slice(start+1).search(/[\r\n](?:async )?function /);vm.runInContext(source.slice(start,next<0?undefined:start+1+next),c,{filename:name});}}
function fixture(kind='image',{stage='poll',branch=false,count=2,entry='main',status='succeeded'}={}){
 const gate=deferred(),lease={epoch:1,generation:2,revision:1,canEdit:true,state:'editing'};
 const config={engine:'api',apiKind:kind,provider_id:'p',model:'m',videoProvider:'p',videoModel:'v',count,videoTempShLinks:[]};
 const src={id:'src',type:'smart-image',images:branch?[{url:'/assets/cloud/ast_original/original.png',runPrompt:'old metadata'}]:[],promptDraftHtml:'original',promptDraftText:'original',runSettings:clone(config)};
 const target={id:'out',type:'smart-image',images:[]};
 const loop={id:'loop',type:'smart-loop',images:[],prompt:'loop input',loopStart:1};
 const win={CanvasSession:{enabled:true,context:{member:{id:'m'},workspace:{id:'w'}}},MemberCanvasEdit:{active:{memberId:'m',workspaceId:'w',lease},get canSave(){return lease.canEdit;},get canEdit(){return lease.canEdit;},markDirty(){}}};
 win.VideoDurationPolicy=require('../static/js/video-duration-policy.js');win.CanvasTaskBindings=bindings;win.CanvasTaskResults={guard:(targets,read)=>guards.guard(targets,read,win),capture:()=>guards.capture(win),pending:guards.pending};
 const requests=[],records=new Map(),counts={save:0,submit:0},timers=[];
 let reached=false,serverDocument=null;
 const boundary=async where=>{if(stage===where){reached=true;await gate.promise;}};
 const c={window:win,canvasId:'c',canvas:{id:'c',kind:'smart',title:'test',logs:[],connections:entry==='main'?[]:[{from:'src',to:'out'},...(entry==='loop'?[{from:'loop',to:'src'}]:[])]},
  nodes:entry==='main'?[src]:[loop,src,target],selectedId:'src',selectedImage:{},settings:clone(config),canvasDefaultSmartSettings:clone(config),initialSmartSettings:clone(config),
  promptInput:{innerHTML:'original',dataset:{}},activeComposerNode:()=>c.nodes.find(n=>n.id===c.selectedId),selectedNode:()=>c.nodes.find(n=>n.id===c.selectedId),promptPlainText:()=>c.promptInput.innerHTML,
  smartClientId:'page',smartSaveInFlight:null,smartSaveAgain:false,smartCanvasDirty:false,smartSaveErrorNotified:false,canvasSyncInFlight:false,saveTimer:null,viewport:{x:0,y:0,scale:1},
  smartServerNodeIds:new Set(),smartServerConnectionKeys:new Set(),smartLoopContext:null,activeSmartTaskPolls:new Map(),activeSmartNodeResumes:new Map(),transientSmartCloudLinks:[],
  setTimeout:(fn,ms)=>{if(ms===2000)queueMicrotask(fn);else timers.push(fn);return 1;},clearTimeout(){},Date,JSON,Object,console,
  isSmartCanvasLocked:()=>!lease.canEdit,cloneSmartSettings:s=>clone(s||{}),updateSmartCanvasNav(){},responseErrorMessage:async()=> 'save failed',
  tr:s=>s,toast:s=>c.message=s,nowMs:()=>1000,render(){},refreshSmartNodes(){},refreshConnectionLayer(){},pushUndo(){},undoSuppressed:false,
  smartSettingsForNode:n=>n.runSettings||c.settings,buildPromptRequest:()=>({prompt:c.promptInput.innerHTML,displayPrompt:c.promptInput.innerHTML,refs:[]}),
  buildPromptRequestForNode:n=>({prompt:n.promptDraftText,displayPrompt:n.promptDraftText,refs:[]}),smartRunNeedsPrompt:()=>true,
  snapshotRunMeta:()=>({}),smartRunSnapshot:n=>({nodeId:n.id,settings:clone(c.settings)}),rememberRecentSmartSettings(){},isApiLikeEngine:e=>e==='api',smartImageUsesWorkflowInput:()=>false,
  stripRunInputMeta:m=>m,attachRunMeta(){},pendingBoxSize:()=>({w:200,h:200}),coolNodeRunningState(){},coolRunButton(){},runBtn:{},
  createPendingOutputFromSource:()=>{c.nodes.push(target);return target;},restoreSourceVisualState:(n,s)=>Object.assign(n,s),clearPromptInput:()=>{c.promptInput.innerHTML='';},
  smartVideoDurationRange:()=>({min:1,max:60,auto:false}),sizeForRun:()=> '1024x1024',imageRefsOnly:r=>r,videoRefsOnly:()=>[],audioRefsOnly:()=>[],applyUploadedUrlsToSmartRefs:r=>r,videoProviderPlatform:()=> 'p',manualSmartVideoLink:()=>null,isSeedance25VideoModel:()=>false,
  uid:()=> 'video-'+(requests.length+1),smartResponseErrorMessage:async()=> 'submission failed',smartTaskPollRetryWindow:()=>0,extractUpstreamTaskId:()=>'',
  smartPendingTasks:n=>n.pendingTasks||[],smartRecoverableImageTask:()=>null,smartPendingTaskRun:(n,t)=>t?.run||{nodeId:n.id,settings:config},
  resultMediaUrls:r=>Array.isArray(r)?r:r.images||r.videos||[],copyMediaSizeFields:(item,base)=>base,mediaNodeDefaultScale:()=>1,
  addSmartGenerationLog:log=>c.canvas.logs.push(log),archiveSmartOutputsBeforePending:n=>{if(n.images.length){c.nodes.push({id:'history',type:'smart-image',images:n.images});n.images=[];}},
  mediaKindForUrls:(urls,kind)=>kind,validOutpaintSize:()=>null,selfReferenceImagesForNode:()=>[],defaultReferenceImagesFor:()=>[],outputImagesForNode:()=>[],smartCascadePathForCtx:()=>({states:{}}),
  replaceOutputsToNodeWithHistory:(n,images,kind)=>{n.images=images;n.outputKind=kind;n.running=false;},
 };
 win.CanvasApi={saveCanvas:async(id,payload)=>{const sent=clone(payload);await boundary('save');counts.save++;lease.revision++;serverDocument=sent;return {ok:true,json:async()=>({canvas:{...clone(sent),id,revision:lease.revision,updated_at:lease.revision}})};}};
 const saveRequest=win.CanvasApi.saveCanvas;
 win.MemberCanvasEdit.send=(url,options,transport)=>transport(url,{...options,headers:{...options.headers,'X-Canvas-Edit-Proof':'fixture-proof'}});
 c.fetch=async(url,options)=>{
  assert.equal(options?.headers?.['X-Canvas-Edit-Proof'],'fixture-proof','actual CanvasApi transport must attach editing proof');
  if(options?.method==='PUT')return saveRequest('c',JSON.parse(options.body));
  if(options?.method==='POST'){
   const sent=JSON.parse(options.body);requests.push(sent);counts.submit++;const id=sent.client_task_id||'task-'+requests.length;
   assert.equal(sent.canvas_target.base_revision,lease.revision);assert.equal(sent.canvas_id,'c');assert.ok(serverDocument);
   assert.equal(sent.canvas_target.input_sha256,await bindings.graphFingerprint(serverDocument,sent.canvas_target.source_node_id,sent.canvas_target.target_node_id));
   const record={id,status,canvas_edit_generation:2,result:kind==='video'?{videos:['/assets/cloud/ast_'+id+'/video.mp4']}:{images:['/assets/cloud/ast_'+id+'/image.png']},canvas_binding:{version:3,canvas_id:'c',canvas_kind:'smart',source_node_id:sent.canvas_target.source_node_id,target_node_id:sent.canvas_target.target_node_id,submitted_revision:sent.canvas_target.base_revision,graph_sha256:sent.canvas_target.input_sha256,request_sha256:'a'.repeat(64)}};
   records.set(id,record);await boundary('submit');return {ok:true,json:async()=>({task_id:id,canvas_binding:clone(record.canvas_binding)})};
  }
  await boundary('poll');return {ok:true,json:async()=>clone(records.get(url.split('/').at(-1)))};
 };
 install(c,'resultMediaUrls','canvasTaskWriteGuard','smartTaskInputDocument','smartTaskInputBinding','attachSmartTaskBinding','smartTaskUiGuard','pauseSmartTaskInput','canvasForStorage','settingsForStorage','mediaItemForStorage','stripImageGenerationMeta',
  'savePromptDraftForCurrent','saveCanvas','scheduleSave','runApiGeneration','runApiVideoGeneration','pollSmartCanvasTask','queueAndResumeSmartApiTasks','resumeSmartPendingNode','finalizeSmartPendingTask','runGeneration','generateUrlsForCurrentSettings','runCascadeStepIntoNode','runLoopRoundIntoSlot');
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/js/canvas-api.js'),'utf8'),c);
 return {c,src,target,loop,lease,requests,records,counts,gate,timers,reached:()=>reached,get out(){return entry!=='main'||branch?target:src;},start:()=>entry==='step'?c.runCascadeStepIntoNode(src,target,[]):entry==='loop'?c.runLoopRoundIntoSlot(loop,src,target,1,{}):c.runGeneration()};
}
for(const kind of ['image','video'])for(const entry of ['main','step','loop']){
 test('smart '+entry+' '+kind+' binds saved input through real POST, poll and result write',async()=>{
  const f=fixture(kind,{entry}),waiting=f.start();await until(f.reached);f.gate.resolve();await waiting;
  assert.equal(f.out.images.length,kind==='image'?2:1);assert.ok(f.counts.save>=1);assert.equal(f.c.message,undefined);
  if(entry!=='step'||kind==='video'){assert.equal(f.out.pending,0);assert.equal(f.out.running,false);assert.equal(f.out.pendingTasks,undefined);}
  assert.ok(f.requests.every(r=>r.canvas_target.source_node_id==='src'&&r.canvas_target.target_node_id===f.out.id));
 });
 for(const stage of ['save','submit','poll'])for(const edit of ['prompt','model','handoff','target'])test('smart '+entry+' '+kind+' preserves '+edit+' during '+stage,async()=>{
  const f=fixture(kind,{entry,stage}),waiting=f.start().catch(e=>e);await until(f.reached);
  if(edit==='prompt'){f.c.promptInput.innerHTML='new input';f.src.promptDraftText='new input';}
  if(edit==='model')f.c.settings.model='new model';
  if(edit==='handoff')f.lease.generation++;
  if(edit==='target')f.c.nodes=f.c.nodes.map(n=>n===f.out?{...clone(n),marker:'replacement'}:n);
  f.gate.resolve();await waiting;assert.equal(f.out.images.length,0);
  if(stage==='save')assert.equal(f.counts.submit,0);
  if(edit==='prompt')assert.equal(f.c.promptInput.innerHTML,'new input');
  if(edit==='model')assert.equal(f.c.settings.model,'new model');
 });
}
for(const kind of ['image','video'])test('smart '+kind+' result branch keeps original images and verifies projection after metadata stripping',async()=>{
 const f=fixture(kind,{branch:true}),waiting=f.start();await until(f.reached);f.gate.resolve();await waiting;
 assert.equal(f.src.images[0].url,'/assets/cloud/ast_original/original.png');assert.equal(f.out.images.length,kind==='image'?2:1);assert.equal(f.c.message,undefined);
});
test('smart completion on a different selected node preserves its prompt and settings',async()=>{
 const f=fixture('image',{branch:true}),waiting=f.start();await until(f.reached);
 const other={id:'other',type:'smart-image',images:[],promptDraftHtml:'other',promptDraftText:'other',runSettings:{engine:'api',model:'other',videoTempShLinks:[]}};f.c.nodes.push(other);f.c.selectedId='other';f.c.settings=clone(other.runSettings);f.c.promptInput.innerHTML='other';
 f.gate.resolve();await waiting;assert.equal(f.out.images.length,2);assert.equal(f.c.selectedId,'other');assert.equal(f.c.settings.model,'other');assert.equal(f.c.promptInput.innerHTML,'other');
});
test('smart persisted pending cannot revive an unverified operation after refresh',async()=>{
 const f=fixture('image'),waiting=f.start();await until(f.reached);const pending=clone(f.out.pendingTasks);assert.equal(pending[0]._inputBinding,undefined);f.out.pendingTasks=pending;f.gate.resolve();await waiting;
 await assert.rejects(f.c.resumeSmartPendingNode(f.out),e=>e.resultPending);assert.equal(f.out.images.length,0);
});
test('smart failed task with edited input keeps pending state instead of failure cleanup',async()=>{
 const f=fixture('image',{status:'failed'}),waiting=f.start();await until(f.reached);f.c.promptInput.innerHTML='keep';f.gate.resolve();await waiting;assert.equal(f.out.images.length,0);assert.equal(f.out.pendingTasks.length,2);assert.equal(f.c.promptInput.innerHTML,'keep');
});
test('smart mismatching terminal receipt does not write outputs',async()=>{
 const f=fixture(),waiting=f.start();await until(f.reached);for(const task of f.records.values())task.canvas_binding.graph_sha256='0'.repeat(64);f.gate.resolve();await waiting;assert.equal(f.out.images.length,0);assert.equal(f.out.pendingTasks.length,2);
});

for(const kind of ['image','video'])test('smart '+kind+' failed preflight save never submits',async()=>{
 const f=fixture(kind);f.c.window.CanvasApi.saveCanvas=async()=>({ok:false,status:409});await f.start();assert.equal(f.requests.length,0);assert.equal(f.out.images.length,0);
});
test('smart video archive during in-flight POST advances its own baseline',async()=>{
 const f=fixture('video',{entry:'loop',stage:'submit'});f.target.images=[{url:'/assets/cloud/ast_old/old.png'}];const waiting=f.start();await until(f.reached);await until(()=>f.c.nodes.some(n=>n.id==='history'));
 assert.equal(f.target.images.length,0);assert.equal(f.c.nodes.find(n=>n.id==='history').images[0].url,'/assets/cloud/ast_old/old.png');
 f.gate.resolve();await waiting;assert.equal(f.target.images.length,1);assert.equal(f.target.pendingTasks,undefined);
});
test('smart result can be saved and generated again without reloading',async()=>{
 const f=fixture('image',{count:1}),waiting=f.start();await until(f.reached);f.gate.resolve();await waiting;
 f.c.promptInput.innerHTML='again';f.src.images=[];await f.c.saveCanvas({force:true});await f.start();assert.equal(f.requests.length,2);assert.equal(f.src.images.length,1);assert.equal(f.c.message,undefined);
});
test('smart cache shares full task records but each caller still validates its receipt',async()=>{
 const f=fixture('image',{count:1}),waiting=f.start();await until(f.reached);const pending=f.out.pendingTasks[0];
 const extra=f.c.pollSmartCanvasTask(pending.taskId,'image',{inputBinding:pending._inputBinding,returnRecord:true});
 const invalid=f.c.pollSmartCanvasTask(pending.taskId,'image',{inputBinding:{verify(){throw guards.pending();}}}).catch(e=>e);
 f.gate.resolve();const record=await extra;await waiting;assert.equal(record.id,pending.taskId);assert.equal((await invalid).resultPending,true);assert.equal(f.out.images.length,1);
});

test('smart media parser accepts the image array handed off by task polling',()=>{
 const f=fixture();assert.deepEqual(clone(f.c.resultMediaUrls(['one','two','one'])),['one','two']);
 assert.deepEqual(clone(f.c.resultMediaUrls('one')),['one']);
 assert.deepEqual(clone(f.c.resultMediaUrls({videos:['video']})),['video']);
 assert.equal(f.c.resultMediaUrls([{url:'image',width:480,height:270}])[0].width,480);
});

for(const kind of ['image','video'])test('smart '+kind+' edited model settles visual state and retains original tasks',async()=>{
 const f=fixture(kind),waiting=f.start();await until(f.reached);
 f.c.settings.model='new model';f.gate.resolve();await waiting;
 assert.equal(f.out.pending,0);assert.equal(f.out.running,false);assert.equal(f.out.runTimerHidden,true);
 assert.ok(f.out.pendingTasks.length);assert.ok(f.out.pendingTasks.every(t=>t.paused && !t.failed && t.taskId));
 const submitted=f.counts.submit;
 await f.c.resumeSmartPendingNode(f.out);
 assert.equal(f.counts.submit,submitted);assert.equal(f.out.images.length,0);
});
test('smart paused placeholder is static and opens saved results without another task request',async()=>{
 let opened=0;const task={taskId:'t',paused:true},node={id:'n',pendingTasks:[task]};
 const c={nodes:[node],smartPendingTasks:n=>n.pendingTasks,escapeAttr:String,
 window:{MemberCanvasEdit:{openTaskResults:async()=>opened++}}};
 install(c,'imageTaskRecoverBodyHtml','querySmartImageTaskNow');
 const html=c.imageTaskRecoverBodyHtml(node,task,{width:200,height:200});
 assert.match(html,/查看生成结果/);assert.doesNotMatch(html,/loading-cell|spinner|失败/);
 await c.querySmartImageTaskNow('n','t');assert.equal(opened,1);
});
test('smart pause does not settle another batch or mutate a replacement node',()=>{
 const binding={},other={},task={taskId:'t',_inputBinding:binding},newer={taskId:'n',_inputBinding:other};
 const node={id:'n',running:true,pendingTasks:[task,newer]};
 const c={nodes:[node],smartPendingTasks:n=>n.pendingTasks,refreshSmartNodes(){},scheduleSave(){}};
 install(c,'pauseSmartTaskInput');
 c.pauseSmartTaskInput(node,binding,{valid:()=>false},{inputChanged:true});assert.equal(task.paused,undefined);
 c.pauseSmartTaskInput(node,binding,{valid:()=>true},{inputChanged:true});
 assert.equal(task.paused,true);assert.equal(newer.paused,undefined);assert.equal(node.pending,1);assert.equal(node.running,true);
});
