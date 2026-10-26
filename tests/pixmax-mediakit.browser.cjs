const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');

async function setup(t,{configured=true,ambiguous=false}={}){
 const calls=[];
 const f=await fixture(t,'smart',true,{secureOrigin:true,apiHandler:request=>{
  const url=new URL(request.url());
  if(url.pathname==='/api/canvas-mediakit-tasks'){
   const body=request.postDataJSON();calls.push(body);
   if(ambiguous)return {status:504,body:{detail:'模拟响应中断'}};
   return {status:200,body:{task_id:body.client_task_id,status:'queued',canvas_binding:{version:3,canvas_id:body.canvas_id,canvas_kind:'smart',
    source_node_id:body.canvas_target.source_node_id,target_node_id:body.canvas_target.target_node_id,
    submitted_revision:body.canvas_target.base_revision,graph_sha256:body.canvas_target.input_sha256,request_sha256:'a'.repeat(64)}}};
  }
  if(url.pathname.startsWith('/api/canvas-mediakit-tasks/'))return {status:200,body:{id:url.pathname.split('/').pop(),status:'succeeded'}};
 }});
 await f.page.addScriptTag({url:'/static/js/canvas-task-bindings.js'});
 await f.page.evaluate(configured=>{
  MemberCanvasEdit.canSave=true;
  apiProviders=configured?[{id:'media',name:'火山 MediaKit',enabled:true,has_key:true,mediakit_tools:['enhance-video','erase-video-subtitle','video-understand-router']}]:[];
  const source=createNode(400,250,[{url:'/tests/fixtures/pixmax-audio-source.mp4',kind:'video',name:'视频.mp4'}],{select:true});
  window.mediaSource=source;render();
  const original=saveCanvas;
  saveCanvas=async(...args)=>{const result=await original(...args);MemberCanvasEdit.active.lease.revision=canvas.revision;return result;};
 },configured);
 return {...f,calls};
}

for(const [action,label] of [['upscale','视频超分'],['erase','字幕擦除'],['understand','视频理解']])test('MediaKit '+label+' submits once with the chosen parameters',async t=>{
 const {page,errors,calls}=await setup(t);
 await page.evaluate(action=>runSmartNodeToolbarAction(mediaSource.id,action),action);
 const dialog=page.getByRole('dialog',{name:label});await dialog.waitFor();
 assert.equal(await dialog.getByLabel('MediaKit 厂商').inputValue(),'media');
 if(action==='upscale')await dialog.getByLabel('超分分辨率').selectOption('4k');
 if(action==='understand'){await dialog.getByLabel('视频理解要求').fill('描述主要动作');await dialog.getByLabel('分析档位').selectOption('Quality');}
 await dialog.getByRole('button',{name:'开始'+label,exact:true}).click();
 await dialog.getByRole('button',{name:'已完成',exact:true}).waitFor().catch(async error=>{throw Error(error.message+'; dialog: '+await dialog.innerText()+'; errors: '+errors.join('; '));});
 assert.equal(calls.length,1);const body=calls[0];
 assert.equal(body.provider_id,'media');assert.equal(body.videos[0],'/tests/fixtures/pixmax-audio-source.mp4');
 assert.match(body.canvas_target.input_sha256,/^[a-f0-9]{64}$/);
 if(action==='upscale'){assert.equal(body.resolution,'4k');assert.equal(body.tool_version,'standard');}
 if(action==='understand'){assert.equal(body.prompt,'描述主要动作');assert.equal(body.level,'Quality');assert.equal(body.canvas_target.target_node_id,body.canvas_target.source_node_id);}
 else assert.notEqual(body.canvas_target.target_node_id,body.canvas_target.source_node_id);
 assert.deepEqual(errors,[]);
});

test('MediaKit missing configuration and lost edit permission cannot submit',async t=>{
 const {page,calls,errors}=await setup(t,{configured:false});
 await page.evaluate(()=>PixmaxMediaKit.open(mediaSource.id,0,'erase'));
 const dialog=page.getByRole('dialog',{name:'字幕擦除'});
 assert.equal(await dialog.getByRole('button',{name:'开始字幕擦除'}).isDisabled(),true);
 assert.match(await dialog.innerText(),/配置 API Key 并分配到当前空间/);
 await dialog.getByRole('button',{name:'关闭字幕擦除'}).click();
 await page.evaluate(()=>{MemberCanvasEdit.setEditable(false);PixmaxMediaKit.open(mediaSource.id,0,'erase');});
 assert.equal(await page.getByRole('dialog',{name:'字幕擦除'}).count(),0);
 assert.equal(calls.length,0);assert.deepEqual(errors,[]);
});

test('MediaKit uncertain POST reopens by querying the original task without another submission',async t=>{
 const {page,calls,errors}=await setup(t,{ambiguous:true});
 await page.evaluate(()=>PixmaxMediaKit.open(mediaSource.id,0,'upscale'));
 let dialog=page.getByRole('dialog',{name:'视频超分'});
 await dialog.getByRole('button',{name:'开始视频超分'}).click();
 await dialog.getByRole('button',{name:'查询原任务'}).waitFor();
 const before=await page.evaluate(()=>nodes.length);
 await dialog.getByRole('button',{name:'关闭视频超分'}).click();
 await page.evaluate(()=>PixmaxMediaKit.open(mediaSource.id,0,'upscale'));
 dialog=page.getByRole('dialog',{name:'视频超分'});
 await dialog.getByRole('button',{name:'查询原任务'}).click();
 await dialog.getByRole('button',{name:'已完成'}).waitFor();
 assert.equal(calls.length,1);assert.equal(await page.evaluate(()=>nodes.length),before);assert.deepEqual(errors,[]);
});
