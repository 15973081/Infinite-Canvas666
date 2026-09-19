const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('static/js/smart-canvas.js','utf8').replace(/\r\n/g,'\n');
function fn(name){const start=source.indexOf(`function ${name}(`);assert.ok(start>=0);return (source.slice(start-6,start)==='async '?'async ':'')+source.slice(start,source.indexOf('\n}',start)+2);}
function fixture({enabled=true,wait=false}={}){
 const calls=[],notes=[],node={id:'source',type:'smart-image',images:[{url:'/assets/one.png'},{url:'/assets/two.png'}]},buttons=[{},{}];
 const config={enabled,provider_id:'admin-provider',model:'admin-model',size:'2048x1024',quality:'high',prompt:'admin prompt',unavailable_reason:'请在管理平台启用'};
 let release;const gate=wait?new Promise(r=>release=r):Promise.resolve();
 const binding={prepare:async()=>({source_node_id:'source',target_node_id:'output',base_revision:12}),beginSubmission(){},remember(){},check(){}};
 const ctx={console,Promise,Math,Number,Array,Object,Error,JSON,Date,canvasId:'canvas-a',settings:{model:'ordinary-model'},cropState:{},
  window:{CanvasSession:{enabled:true},CanvasApi:{createCanvasImageTaskRequest:async payload=>{calls.push({payload});return {ok:true,json:async()=>({task_id:'task-a'})};}}},
  document:{getElementById:id=>buttons[id.includes('Depth')?1:0]},
  currentEditImage:()=>({node,image:node.images[1]}),mediaKindForItem:()=> 'image',canvasTaskWriteGuard:()=>({valid:()=>true,check(){}}),isSmartCanvasLocked:()=>false,
  fetch:async()=>{calls.push({fetch:true});await gate;return {ok:true,json:async()=>({revision:4,tools:{panorama:config,depth:config}})};},
  toast:message=>notes.push(message),nowMs:()=>1,pushUndo(){},createPendingOutputFromSource:(source,n,meta,opts)=>{calls.push({source,n,meta,opts});return {id:'output',images:[]};},
  smartTaskInputBinding:()=>binding,closeImageEditor(){},render(){},scheduleSave(){},sizeForRun:s=>s.customSize,imageRefsOnly:r=>r,
  queueAndResumeSmartApiTasks:async(output,result,opts)=>calls.push({output,result,opts}),smartPendingTasks:()=>[],pauseSmartTaskInput(){},
 };
 vm.createContext(ctx);vm.runInContext('let smartImageToolBusy=false;'+fn('runManagedImageTool')+fn('runApiGeneration'),ctx);
 return {ctx,calls,notes,node,release};
}
test('selected image transforms use administrator settings and existing task bindings without changing the source',async()=>{
 const f=fixture(),before=JSON.stringify(f.node);
 await f.ctx.runManagedImageTool('depth');
 const payload=f.calls.find(c=>c.payload).payload;
 assert.equal(payload.image_tool,'depth');assert.equal(payload.image_tool_revision,4);
 assert.equal(payload.provider_id,'admin-provider');assert.equal(payload.model,'admin-model');assert.equal(payload.size,'2048x1024');assert.equal(payload.n,1);
 assert.equal(payload.prompt,'admin prompt');assert.equal(payload.reference_images.length,1);assert.equal(payload.reference_images[0].url,'/assets/two.png');
 assert.equal(payload.canvas_target.source_node_id,'source');assert.equal(payload.canvas_target.target_node_id,'output');
 assert.equal(f.calls.find(c=>c.result).result.taskIds[0],'task-a');
 assert.equal(JSON.stringify(f.node),before);assert.equal(f.ctx.settings.model,'ordinary-model');
});
test('disabled tools never create an output or submit a paid task',async()=>{
 const f=fixture({enabled:false});await f.ctx.runManagedImageTool('panorama');
 assert.equal(f.calls.length,1);assert.match(f.notes[0],/管理平台/);
});
test('double clicks submit once; changing the selected editor while loading cancels submission',async()=>{
 const f=fixture({wait:true});const first=f.ctx.runManagedImageTool('panorama');
 await f.ctx.runManagedImageTool('panorama');f.release();await first;
 assert.equal(f.calls.filter(c=>c.payload).length,1);
 const changed=fixture({wait:true});const pending=changed.ctx.runManagedImageTool('depth');changed.ctx.cropState={};changed.release();await pending;
 assert.equal(changed.calls.length,1);
});
