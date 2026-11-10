const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');

async function setup(t,{configured=true,ambiguous=false,missing=false,deliverText=false,hold=false}={}){
 const calls=[],control={hold};
 const f=await fixture(t,'smart',true,{secureOrigin:true,apiHandler:request=>{
  const url=new URL(request.url());
  if(url.pathname==='/api/canvas-mediakit-tasks'){
   const body=request.postDataJSON();calls.push(body);
   if(ambiguous&&calls.length===1)return {status:504,body:{detail:'模拟响应中断'}};
   return {status:200,body:{task_id:body.client_task_id,status:'queued',canvas_binding:{version:3,canvas_id:body.canvas_id,canvas_kind:'smart',
    source_node_id:body.canvas_target.source_node_id,target_node_id:body.canvas_target.target_node_id,
    submitted_revision:body.canvas_target.base_revision,graph_sha256:body.canvas_target.input_sha256,request_sha256:'a'.repeat(64)}}};
  }
  if(url.pathname.startsWith('/api/canvas-mediakit-tasks/'))return missing&&calls.length<2?{status:404,body:{detail:'MediaKit 任务不存在'}}:{status:200,body:{id:url.pathname.split('/').pop(),status:control.hold?'polling':'succeeded'}};
  if(deliverText&&!control.hold&&calls.length&&url.pathname.endsWith('/task-results'))return {status:200,body:{canvas_id:'canvas-test',result_version:1,deliveries:[{
   task_id:calls[0].client_task_id,version:1,target_id:calls[0].canvas_target.target_node_id,
   node:{id:'understanding-result',type:'smart-prompt',text:'人物沿街行走',title:'视频理解结果',label:'视频理解结果',x:1000,y:250,w:400,h:280,result_task_id:calls[0].client_task_id,mediakitTaskId:calls[0].client_task_id}
  }]}};
 }});
 await f.page.addScriptTag({url:'/static/js/canvas-task-bindings.js'});
 await f.page.evaluate(configured=>{
  MemberCanvasEdit.canSave=true;
  apiProviders=configured?[{id:'media',name:'火山 MediaKit',enabled:true,has_key:true,mediakit_tools:['enhance-video','erase-video-subtitle','erase-video-subtitle-pro','video-understand-router']}]:[];
  const source=createNode(400,250,[{url:'/tests/fixtures/pixmax-audio-source.mp4',kind:'video',name:'视频.mp4'}],{select:true});
  window.mediaSource=source;render();
  const original=saveCanvas;
  saveCanvas=async(...args)=>{const result=await original(...args);MemberCanvasEdit.active.lease.revision=canvas.revision;return result;};
 },configured);
 return {...f,calls,control};
}

for(const [action,label] of [['upscale','视频超分'],['erase','字幕擦除'],['understand','视频理解']])test('MediaKit '+label+' submits once with the chosen parameters',async t=>{
 const {page,errors,calls}=await setup(t);
 await page.evaluate(action=>runSmartNodeToolbarAction(mediaSource.id,action),action);
 const dialog=page.getByRole('dialog',{name:label});await dialog.waitFor();
 assert.equal(await dialog.getByLabel('MediaKit 厂商').inputValue(),'media');
 if(action==='upscale')await dialog.getByLabel('超分分辨率').selectOption('4k');
 if(action==='understand'){
  await dialog.getByLabel('视频理解要求').fill('描述主要动作');
  await dialog.getByLabel('分析档位').click();
  await dialog.getByRole('option',{name:'高质量',exact:true}).click();
 }
 await dialog.getByRole('button',{name:'开始'+label,exact:true}).click();
 await dialog.getByRole('button',{name:/^再次/,exact:true}).waitFor().catch(async error=>{throw Error(error.message+'; dialog: '+await dialog.innerText()+'; errors: '+errors.join('; '));});
 assert.equal(calls.length,1);const body=calls[0];
 assert.equal(body.provider_id,'media');assert.equal(body.videos[0],'/tests/fixtures/pixmax-audio-source.mp4');
 assert.match(body.canvas_target.input_sha256,/^[a-f0-9]{64}$/);
 if(action==='upscale'){assert.equal(body.resolution,'4k');assert.equal(body.tool_version,'standard');}
 if(action==='understand'){assert.equal(body.prompt,'描述主要动作');assert.equal(body.level,'Quality');assert.notEqual(body.canvas_target.target_node_id,body.canvas_target.source_node_id);}
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
 const {page,calls,errors,control}=await setup(t,{ambiguous:true,hold:true});
 await page.evaluate(()=>PixmaxMediaKit.open(mediaSource.id,0,'upscale'));
 let dialog=page.getByRole('dialog',{name:'视频超分'});
 await dialog.getByRole('button',{name:'开始视频超分'}).click();
 await dialog.getByRole('button',{name:'查询原任务'}).waitFor();
 const before=await page.evaluate(()=>nodes.length);
 await dialog.getByRole('button',{name:'关闭视频超分'}).click();
 control.hold=false;
 await page.evaluate(()=>PixmaxMediaKit.open(mediaSource.id,0,'upscale'));
 dialog=page.getByRole('dialog',{name:'视频超分'});
 await dialog.getByRole('button',{name:/^再次/}).waitFor();
 assert.equal(calls.length,1);assert.equal(await page.evaluate(()=>nodes.length),before);assert.deepEqual(errors,[]);
});

test('MediaKit completed background task restores editable analysis level and starts a distinct task',async t=>{
 const {page,calls,control,errors}=await setup(t,{hold:true});
 await page.evaluate(()=>PixmaxMediaKit.open(mediaSource.id,0,'understand'));
 let dialog=page.getByRole('dialog',{name:'视频理解'});
 await dialog.getByLabel('分析档位').selectOption('Quality');
 await dialog.getByLabel('视频理解要求').fill('描述动作与镜头');
 await dialog.getByRole('button',{name:'开始视频理解',exact:true}).click();
 await page.waitForFunction(()=>mediaSource.mediakitJobs?.understand?.settings?.level==='Quality');
 assert.equal(await dialog.getByLabel('分析档位').isDisabled(),true);
 await dialog.getByRole('button',{name:'关闭视频理解'}).click();
 await page.evaluate(()=>PixmaxMediaKit.open(mediaSource.id,0,'understand'));
 dialog=page.getByRole('dialog',{name:'视频理解'});
 await page.waitForFunction(()=>document.querySelector('.pixmax-creation-status')?.textContent.includes('原任务仍在处理中'));
 assert.equal(await dialog.getByLabel('分析档位').inputValue(),'Quality');
 assert.equal(await dialog.getByLabel('分析档位').isDisabled(),true);
 await dialog.getByRole('button',{name:'关闭视频理解'}).click();
 control.hold=false;
 await page.evaluate(()=>PixmaxMediaKit.open(mediaSource.id,0,'understand'));
 dialog=page.getByRole('dialog',{name:'视频理解'});
 await dialog.getByRole('button',{name:'再次视频理解',exact:true}).waitFor();
 assert.equal(await dialog.getByLabel('分析档位').isEnabled(),true);
 assert.equal(await dialog.getByLabel('视频理解要求').inputValue(),'描述动作与镜头');
 await dialog.getByLabel('分析档位').selectOption('Balanced');
 await dialog.getByRole('button',{name:'再次视频理解',exact:true}).click();
 await page.waitForFunction(()=>mediaSource.mediakitJobs?.understand?.status==='succeeded');
 assert.equal(calls.length,2);assert.equal(calls[1].level,'Balanced');
 assert.notEqual(calls[0].client_task_id,calls[1].client_task_id);
 assert.deepEqual(errors,[]);
});

test('MediaKit erasure tiers select their actual endpoints and remain editable after completion',async t=>{
 const {page,calls,errors}=await setup(t);
 await page.evaluate(()=>PixmaxMediaKit.open(mediaSource.id,0,'erase'));
 const dialog=page.getByRole('dialog',{name:'字幕擦除'});
 await dialog.getByLabel('擦除档位').click();
 await dialog.getByRole('option',{name:'精细化版',exact:true}).click();
 await dialog.getByRole('button',{name:'开始字幕擦除',exact:true}).click();
 await dialog.getByRole('button',{name:'再次字幕擦除',exact:true}).waitFor();
 assert.equal(calls[0].model,'erase-video-subtitle-pro');
 assert.equal(await dialog.getByLabel('擦除档位').isEnabled(),true);
 await dialog.getByLabel('擦除档位').selectOption('erase-video-subtitle');
 await dialog.getByRole('button',{name:'再次字幕擦除',exact:true}).click();
 await page.waitForFunction(()=>mediaSource.mediakitJobs?.erase?.status==='succeeded');
 assert.equal(calls.length,2);assert.equal(calls[1].model,'erase-video-subtitle');
 assert.notEqual(calls[0].client_task_id,calls[1].client_task_id);
 assert.deepEqual(errors,[]);
});

test('MediaKit erasure only enables tiers assigned to the selected provider',async t=>{
 const {page,calls}=await setup(t);
 await page.evaluate(()=>{apiProviders[0].mediakit_tools=['erase-video-subtitle-pro'];PixmaxMediaKit.open(mediaSource.id,0,'erase');});
 const dialog=page.getByRole('dialog',{name:'字幕擦除'});
 assert.equal(await dialog.getByLabel('擦除档位').inputValue(),'erase-video-subtitle-pro');
 assert.equal(await dialog.locator('option[value="erase-video-subtitle"]').evaluate(option=>option.disabled),true);
 assert.match(await dialog.innerText(),/管理平台/);
 assert.equal(calls.length,0);
});

test('MediaKit missing task unlocks explicit retry using the same ID and output node',async t=>{
 const {page,calls,errors}=await setup(t,{ambiguous:true,missing:true});
 await page.evaluate(()=>PixmaxMediaKit.open(mediaSource.id,0,'upscale'));
 let dialog=page.getByRole('dialog',{name:'视频超分'});
 await dialog.getByRole('button',{name:'开始视频超分'}).click();
 await dialog.getByRole('button',{name:'查询原任务'}).click();
 await dialog.getByRole('button',{name:'重新提交'}).waitFor();
 assert.match(await dialog.innerText(),/上次提交未完成/);
 assert.equal(await dialog.getByLabel('超分分辨率').isEnabled(),true);
 assert.equal(calls.length,1,'404 never automatically submits a paid job');
 const count=await page.evaluate(()=>nodes.length);
 await dialog.getByRole('button',{name:'关闭视频超分'}).click();
 await page.evaluate(()=>PixmaxMediaKit.open(mediaSource.id,0,'upscale'));
 dialog=page.getByRole('dialog',{name:'视频超分'});
 await dialog.getByRole('button',{name:'重新提交'}).click();
 await dialog.getByRole('button',{name:/^再次/}).waitFor();
 assert.equal(calls.length,2);
 assert.equal(calls[1].client_task_id,calls[0].client_task_id);
 assert.equal(calls[1].canvas_target.target_node_id,calls[0].canvas_target.target_node_id);
 assert.equal(await page.evaluate(()=>nodes.length),count);
 assert.deepEqual(errors,[]);
});

test('MediaKit view result selects and centers the delivered text, also after reopening',async t=>{
 const {page,errors,calls}=await setup(t,{deliverText:true});
 await page.evaluate(()=>PixmaxMediaKit.open(mediaSource.id,0,'understand'));
 let dialog=page.getByRole('dialog',{name:'视频理解'});
 await dialog.getByRole('button',{name:'开始视频理解'}).click();
 await dialog.getByRole('button',{name:/^再次/}).waitFor();
 await dialog.getByRole('button',{name:'查看结果',exact:true}).click();
 assert.equal(await dialog.count(),0);
 const targetId=calls[0].canvas_target.target_node_id;
 assert.equal(await page.evaluate(()=>smartSelection.nodeId),targetId);
 let rect=await page.locator(`.image-node[data-id="${targetId}"]`).boundingBox();
 assert.ok(rect.x>=0&&rect.x+rect.width<=1280&&rect.y>=0&&rect.y+rect.height<=900);
 await page.evaluate(id=>{const result=nodes.find(node=>node.id===id);result.x=9000;render();PixmaxMediaKit.open(mediaSource.id,0,'understand');},targetId);
 dialog=page.getByRole('dialog',{name:'视频理解'});
 await dialog.getByRole('button',{name:'查看结果',exact:true}).click();
 rect=await page.locator(`.image-node[data-id="${targetId}"]`).boundingBox();
 assert.ok(rect.x>=0&&rect.x+rect.width<=1280);
 assert.equal(calls.length,1,'finding an existing result does not generate again');
 assert.deepEqual(errors,[]);
});

test('MediaKit creates a connected nearby text placeholder, polls after closing and fills it in place',async t=>{
 const {page,calls,control,errors}=await setup(t,{deliverText:true,hold:true});
 await page.evaluate(()=>{
  const rect=nodeRect(mediaSource);window.sourceRect=rect;
  createNode(rect.x+rect.width+60,rect.y,[],{select:false}); // Occupied slot must not push the result far down.
  PixmaxMediaKit.open(mediaSource.id,0,'understand');
 });
 const dialog=page.getByRole('dialog',{name:'视频理解'});
 await dialog.getByRole('button',{name:'开始视频理解'}).click();
 await page.waitForFunction(()=>nodes.some(node=>node.mediakitTaskId&&node.type==='smart-prompt'));
 await page.waitForFunction(()=>document.querySelector('.prompt-smart-node [role=status]')?.textContent.includes('正在理解视频'));
 const targetId=calls[0].canvas_target.target_node_id;
 const before=await page.evaluate(id=>{const node=nodes.find(n=>n.id===id);return {x:node.x,y:node.y,expectedX:sourceRect.x+sourceRect.width+60,expectedY:sourceRect.y,connected:canvas.connections.some(e=>e.from===mediaSource.id&&e.to===id),count:nodes.length};},targetId);
 assert.equal(before.x,before.expectedX);assert.equal(before.y,before.expectedY);assert.equal(before.connected,true);
 await dialog.getByRole('button',{name:'关闭视频理解'}).click();
 await page.evaluate(id=>{const node=nodes.find(n=>n.id===id);node.x+=20;node.y+=30;render();},targetId);
 await page.evaluate(()=>saveCanvas({force:true}));
 await page.reload();
 await page.waitForFunction(()=>document.querySelector('.prompt-smart-node [role=status]')?.textContent.includes('正在理解视频'));
 control.hold=false;
 await page.waitForFunction(id=>nodes.find(node=>node.id===id)?.text==='人物沿街行走',targetId);
 const after=await page.evaluate(id=>{const n=nodes.find(n=>n.id===id);return {x:n.x,y:n.y,pending:n.pendingTasks.length,count:nodes.length};},targetId);
 assert.deepEqual(after,{x:before.x+20,y:before.y+30,pending:0,count:before.count});
 assert.equal(calls.length,1);assert.deepEqual(errors,[]);
});

test('MediaKit video output and legacy placeholders are video assets with no composer; explicit generators keep theirs',async t=>{
 const {page,calls,errors}=await setup(t);
 await page.evaluate(()=>PixmaxMediaKit.open(mediaSource.id,0,'upscale'));
 const dialog=page.getByRole('dialog',{name:'视频超分'});
 await dialog.getByRole('button',{name:'开始视频超分'}).click();
 await dialog.getByRole('button',{name:/^再次/}).waitFor();
 await dialog.getByRole('button',{name:'关闭视频超分'}).click();
 const id=calls[0].canvas_target.target_node_id;
 for(const legacy of [false,true]){
  const state=await page.evaluate(({id,legacy})=>{
   const target=nodes.find(node=>node.id===id);
   if(legacy){target.generationKind='image';delete target.mediaRole;}
   smartSelection.createdNode(id);render();
   const root=world.querySelector(`[data-id="${id}"]`);
   return {kind:pixmaxNativeNodeType(target),composer:composer.classList.contains('open'),upload:root.querySelector('.node-drop')?.getAttribute('aria-label'),icon:root.querySelector('.generation-node-caption')?.innerHTML.includes(pixmaxSvg('video'))};
  },{id,legacy});
  assert.deepEqual(state,{kind:'BaseVideo',composer:false,upload:undefined,icon:true});
 }
 await page.evaluate(id=>{
  const target=nodes.find(node=>node.id===id);target.images=[{url:'/tests/fixtures/pixmax-audio-source.mp4',kind:'video'}];render();
 },id);
 assert.equal(await page.evaluate(()=>composer.classList.contains('open')),false);
 await page.evaluate(()=>{
  apiProviders=[{id:'p',name:'厂商',enabled:true,has_key:true,video_models:['doubao-seedance-2-5-pro']}];
  window.explicitVideoGenerator=createGenerationNodeAt({x:100,y:100},'video');
  explicitVideoGenerator.images=[{url:'/tests/fixtures/pixmax-audio-source.mp4',kind:'video'}];render();
 });
 assert.equal(await page.evaluate(()=>composer.classList.contains('open')),true);
 assert.equal(await page.evaluate(()=>pixmaxNativeNodeType(explicitVideoGenerator)),'GenerateVideo');
 assert.deepEqual(errors,[]);
});
