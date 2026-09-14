const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const bindings=require('../static/js/canvas-task-bindings.js'),guards=require('../static/js/canvas-task-results.js');
const clone=x=>JSON.parse(JSON.stringify(x));
function install(c,file,...names){const source=fs.readFileSync('static/js/'+file,'utf8').replace(/\r\n/g,'\n');for(const name of names){const start=source.search(new RegExp('(?:async )?function '+name+'\\('));assert.ok(start>=0,name);const next=source.slice(start+1).search(/\n(?:async )?function /);vm.runInContext(source.slice(start,next<0?undefined:start+1+next),c);}}
function fixture(entry){
 const kind=entry==='smart'?'smart':'classic',node={id:'source',type:entry==='smart'?'smart-prompt':'llm',userInput:'original',text:'original',chatInput:'question',messages:[],model:'test',llmModel:'test'},upstream={id:'upstream',type:'prompt',text:'reference'};
 const lease={epoch:1,generation:2,canEdit:true,revision:1},active={memberId:'member',workspaceId:'space',lease};
 const win={CanvasSession:{enabled:true,context:{member:{id:'member'},workspace:{id:'space'}}},MemberCanvasEdit:{active,send:(path,init,transport)=>transport(path,{...init,headers:{...init.headers,'X-Canvas-Edit-Token':'proof'}}),get canEdit(){return lease.canEdit;}}};
 win.CanvasTaskBindings=bindings;win.CanvasTaskResults={capture:()=>guards.capture(win),guard:(targets,read)=>guards.guard(targets,read,win)};
 const calls=[],messages=[];let release,polled,failFlush=false;const gate=new Promise(r=>release=r),atPoll=new Promise(r=>polled=r);let record;
 const c={window:win,crypto:require('node:crypto').webcrypto,AbortSignal,console,setTimeout,canvas:{id:'canvas'},nodes:[node,upstream],connections:[{from:'upstream',to:'source'}],
  canvasSavePayload:()=>clone({nodes:c.nodes,connections:c.connections}),smartTaskInputDocument:()=>clone({nodes:c.nodes,connections:c.connections}),
  flushClassicCanvasBeforeFrontendReload:async()=>!failFlush,saveCanvas:async()=>!failFlush,
  scheduleSave(){},refreshNodes(){},render(){},tr:s=>s,alert:s=>messages.push(s),showErrorModal:s=>messages.push(s),toast:s=>messages.push(s),
  llmInputText:n=>n.userInput,llmInputImages:()=>[],llmInputVideos:()=>[],cascadeTargetIdFromOptions:()=>'',
  resolveChatProviderId:()=> 'comfly',resolveChatModel:()=> 'test',promptNodeInputMediaForLLM:()=>[],imageRefsOnly:()=>[],videoRefsOnly:()=>[],
  fetch:async(path,init)=>{calls.push({path,init});if(init.method==='POST'){
   assert.equal(init.headers['X-Canvas-Edit-Token'],'proof');
   const payload=JSON.parse(init.body),target=payload.canvas_target;
   record={id:payload.client_task_id,status:'succeeded',canvas_edit_generation:2,result:{text:'saved reply'},canvas_binding:{version:3,canvas_id:'canvas',canvas_kind:kind,source_node_id:'source',target_node_id:'source',submitted_revision:target.base_revision,graph_sha256:target.input_sha256,request_sha256:'a'.repeat(64)}};
   return {ok:true,json:async()=>({...clone(record),task_id:record.id})};
  }polled();await gate;return {ok:true,json:async()=>clone(record)};}};
 c.cascadeFetch=(...args)=>c.fetch(...args);win.fetch=(...args)=>c.fetch(...args);
 vm.createContext(c);vm.runInContext(fs.readFileSync('static/js/canvas-llm-tasks.js','utf8'),c);
 install(c,kind==='smart'?'smart-canvas.js':'canvas.js','canvasTaskWriteGuard',kind==='smart'?'smartTaskInputBinding':'classicTaskInputBinding');
 if(entry==='smart')install(c,'smart-canvas.js','runPromptLLMNode');else install(c,'canvas.js','callCanvasLLM',entry==='chat'?'runLLMChat':'runLLMNode');
 return {c,node,upstream,lease,calls,messages,atPoll,release,record:()=>record,flushFail:()=>failFlush=true,start:()=>entry==='smart'?c.runPromptLLMNode(node.id):entry==='chat'?c.runLLMChat(node.id):c.runLLMNode(node.id)};
}
for(const entry of ['node','chat','smart']){
 test(entry+' persists once and applies text through the real input receipt',async()=>{
  const f=fixture(entry),waiting=f.start();await f.atPoll;f.release();await waiting;
  assert.equal(f.node[entry==='smart'?'text':'outputText'],'saved reply');assert.equal(f.node.result_task_id,f.record().id);
  assert.equal(f.calls.filter(x=>x.init.method==='POST').length,1);assert.equal(f.messages.length,0);
  if(entry==='chat')assert.deepEqual(clone(f.node.messages),[{role:'user',content:'question'},{role:'assistant',content:'saved reply'}]);
 });
 for(const change of ['input','model','upstream','connection','handoff','member','space','node-replaced','receipt','task-id'])test(entry+' refuses late text after '+change,async()=>{
  const f=fixture(entry),waiting=f.start();await f.atPoll;
  if(change==='input'){f.node.text='new input';f.node.userInput='new input';}
  if(change==='model')f.node.model='new model';if(change==='upstream')f.upstream.text='new reference';if(change==='connection')f.c.connections=[];
  if(change==='handoff')f.lease.generation++;if(change==='member')f.c.window.CanvasSession.context.member.id='other';if(change==='space')f.c.window.CanvasSession.context.workspace.id='other';
  if(change==='node-replaced')f.c.nodes=f.c.nodes.map(n=>n===f.node?clone(n):n);
  if(change==='receipt')f.record().canvas_binding.request_sha256='b'.repeat(64);if(change==='task-id')f.record().id='other-task';
  const before=clone(f.c.nodes);f.release();await waiting;
  const clean=nodes=>nodes.map(n=>{delete n.running;return n;});assert.deepEqual(clean(clone(f.c.nodes)),clean(before));
  assert.equal(f.calls.filter(x=>x.init.method==='POST').length,1);
 });
 test(entry+' failed save does not submit',async()=>{const f=fixture(entry);f.flushFail();await f.start();assert.equal(f.calls.length,0);assert.ok(f.messages.length);});
 test(entry+' repeated button click cannot create a second task while waiting',async()=>{const f=fixture(entry),waiting=f.start();await f.atPoll;await f.start();f.release();await waiting;assert.equal(f.calls.filter(x=>x.init.method==='POST').length,1);});
 test(entry+' network loss preserves content and does not repeat POST',async()=>{const f=fixture(entry);f.c.fetch=async()=>{f.calls.push({init:{method:'POST'}});throw Error('offline');};await f.start();assert.equal(f.calls.length,1);assert.equal(f.node.outputText,undefined);assert.ok(f.messages.some(x=>x.includes('canvas_llm_')));});
}

test('smart prompt busy state is transient across save and result joining',()=>{
 const c={canvasDefaultSmartSettings:{},initialSmartSettings:{},settingsForStorage:x=>x,mediaItemForStorage:x=>x,stripImageGenerationMeta:x=>x};vm.createContext(c);install(c,'smart-canvas.js','canvasForStorage');
 const original={nodes:[{id:'prompt',type:'smart-prompt',running:true,text:'keep'},{id:'image',type:'smart-image',running:true,pendingTasks:[{taskId:'other'}]}]};
 const saved=c.canvasForStorage(original);assert.equal(saved.nodes[0].running,undefined);assert.equal(saved.nodes[0].text,'keep');
 assert.equal(original.nodes[0].running,true);assert.equal(saved.nodes[1].running,true);assert.equal(saved.nodes[1].pendingTasks[0].taskId,'other');
});
test('classic chat retains full local history and sends bounded history/media',async()=>{
 const f=fixture('chat');f.node.messages=Array.from({length:110},(_,i)=>({role:i%2?'assistant':'user',content:'message '+i}));
 f.c.llmInputImages=()=>Array.from({length:10},(_,i)=>'https://local.test/img'+i);f.c.llmInputVideos=()=>Array.from({length:5},(_,i)=>'https://local.test/video'+i);
 const waiting=f.start();await f.atPoll;const payload=JSON.parse(f.calls[0].init.body);
 assert.equal(payload.messages.length,100);assert.equal(payload.images.length,8);assert.equal(payload.videos.length,3);f.release();await waiting;assert.equal(f.node.messages.length,112);
});

test('reloading a saved LLM prompt never restores a stale running spinner',()=>{
 const c={};vm.createContext(c);install(c,'smart-canvas.js','normalizeLegacySmartNode');
 const node=c.normalizeLegacySmartNode({id:'old',type:'smart-prompt',running:true,text:'persisted',result_task_id:'completed'});
 assert.equal(node.running,undefined);assert.equal(node.text,'persisted');assert.equal(node.result_task_id,'completed');
});
