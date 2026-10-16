const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function setup(t){
 const f=await fixture(t,'smart',true,{secureOrigin:true});
 for(const name of ['canvas-task-bindings','canvas-llm-tasks'])await f.page.addScriptTag({url:'/static/js/'+name+'.js'});
 await f.page.evaluate(()=>{
  apiProviders=[{id:'writer',name:'文本服务',enabled:true,has_key:true,chat_models:['创作模型','推理模型']}];
  Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});
  Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});
  const node=createPromptNode(420,120);node.text='原有正文';window.textId=node.id;render();
 });
 await f.page.getByRole('textbox',{name:'文本创作要求',exact:true}).waitFor();return f;
}
const editor=page=>page.getByRole('textbox',{name:'文本创作要求',exact:true});
const submit=page=>page.locator('[data-native-generation-submit]:visible');
async function service(page,{held=false,fail=false}={}){
 let release,polled;const gate=new Promise(resolve=>release=resolve),polling=new Promise(resolve=>polled=resolve),calls=[];let task;
 await page.route('**/api/canvas-llm-tasks**',async route=>{
  const request=route.request();if(request.method()==='POST'){
   const value=request.postDataJSON(),target=value.canvas_target;calls.push(value);
   task={id:value.client_task_id,status:'queued',canvas_binding:{version:3,canvas_id:value.canvas_id,canvas_kind:'smart',source_node_id:target.source_node_id,target_node_id:target.target_node_id,submitted_revision:target.base_revision,graph_sha256:target.input_sha256,request_sha256:'a'.repeat(64)}};
   if(fail)return route.fulfill({status:422,json:{detail:'invalid request'}});
   return route.fulfill({json:{...task,task_id:task.id}});
  }
  polled();if(held)await gate;
  return route.fulfill({json:{...task,status:'succeeded',result:{text:'已生成的新正文'}}});
 });return {release,polling,calls};
}

test('single selection opens the native text form; prompt, fullscreen and model persist without changing the body',async t=>{
 const {page,errors,record}=await setup(t);
 assert.equal(await page.locator('[data-text-generate],.pixmax-creation-modal').count(),0);
 assert.equal(await submit(page).innerText(),'生成');
 await editor(page).fill('很多事情');assert.equal(await page.evaluate(()=>nodes[0].text),'原有正文');
 await page.evaluate(()=>saveCanvas({force:true}));assert.equal(record.nodes[0].textGeneration.input,'很多事情');
 await page.getByRole('button',{name:'生成模型',exact:true}).click();await page.getByRole('button',{name:/推理模型/}).click();
 assert.equal(await page.evaluate(()=>nodes[0].textGeneration.model),'推理模型');
 await page.locator('.pixmax-text-generation').getByRole('button',{name:'全屏',exact:true}).click();
 const full=page.locator('[data-native-generation-surface][data-fullscreen="true"]');await full.waitFor();
 await full.getByRole('textbox',{name:'文本创作要求'}).fill('全屏编辑后的要求');await page.keyboard.press('Escape');await full.waitFor({state:'detached'});
 assert.equal(await editor(page).innerText(),'全屏编辑后的要求');
 await page.evaluate(()=>saveCanvas({force:true}));await page.reload();await page.waitForFunction(()=>nodes.length===1);
 await page.locator('.prompt-smart-node .node-body').click();await editor(page).waitFor();
 assert.equal(await editor(page).innerText(),'全屏编辑后的要求');assert.equal(await page.evaluate(()=>nodes[0].text),'原有正文');assert.deepEqual(errors,[]);
});

test('text form tracks viewport and selection, and viewing it never saves a new generation configuration',async t=>{
 const {page,errors}=await setup(t);await page.evaluate(()=>saveCanvas({force:true}));
 assert.equal(await page.evaluate(()=>nodes[0].textGeneration),undefined);
 const before=await page.locator('.pixmax-text-generation').boundingBox();await page.evaluate(()=>{viewport.scale=.75;applyViewport();});
 const after=await page.locator('.pixmax-text-generation').boundingBox();assert.ok(Math.abs(after.width/before.width-.75)<.01);
 await page.evaluate(()=>{const other=createPromptNode(900,150,{select:false});smartSelection.boxSelection([textId,other.id]);syncSelectionUi();});
 assert.equal(await page.locator('.pixmax-text-generation').count(),0);
 await page.evaluate(()=>{smartSelection.panelTarget(textId);syncSelectionUi();});await editor(page).waitFor();
 await page.evaluate(()=>{nodes=nodes.filter(node=>node.id!==textId);render();});assert.equal(await page.locator('.pixmax-text-generation').count(),0);assert.deepEqual(errors,[]);
});

test('readonly text form cannot edit or submit and becomes usable after editing permission returns',async t=>{
 const {page,errors,writes}=await setup(t);await editor(page).fill('保留要求');
 await page.evaluate(()=>MemberCanvasEdit.setEditable(false));await page.waitForFunction(()=>document.querySelector('[aria-label="文本创作要求"]')?.getAttribute('aria-readonly')==='true');
 assert.equal(await submit(page).isDisabled(),true);
 await page.evaluate(()=>{const el=document.querySelector('[aria-label="文本创作要求"]');el.textContent='越权输入';el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'越权输入'}));});
 assert.equal(await page.evaluate(()=>nodes[0].textGeneration.input),'保留要求');
 await page.evaluate(()=>MemberCanvasEdit.setEditable(true));await page.waitForFunction(()=>document.querySelector('[aria-label="文本创作要求"]')?.getAttribute('aria-readonly')!=='true');
 await editor(page).fill('重新编辑');assert.equal(await page.evaluate(()=>nodes[0].textGeneration.input),'重新编辑');
 assert.equal(writes.filter(row=>row.path.includes('canvas-llm')).length,0);assert.deepEqual(errors,[]);
});

test('queued text task survives deselection, prevents duplicates and writes only its original result node',async t=>{
 const {page,errors}=await setup(t),task=await service(page,{held:true});await editor(page).fill('写一个故事');await submit(page).click();await task.polling;
 await page.locator('.pixmax-text-task').getByText('排队中…',{exact:true}).waitFor();assert.equal(await submit(page).isDisabled(),true);
 await page.evaluate(()=>{createPromptNode(900,100);});await editor(page).waitFor();await editor(page).fill('另一个节点的要求');task.release();
 await page.waitForFunction(()=>nodes.find(node=>node.id===textId).text==='已生成的新正文');
 assert.equal(await page.evaluate(()=>nodes[1].text),'');assert.equal(task.calls.length,1);
 await page.evaluate(()=>{smartSelection.createdNode(textId);render();});await editor(page).waitFor();assert.equal(await submit(page).isDisabled(),false);assert.equal(await editor(page).innerText(),'写一个故事');assert.deepEqual(errors,[]);
});

test('failed generation preserves body and draft, shows failure on the node and allows a deliberate retry',async t=>{
 const {page,errors}=await setup(t),task=await service(page,{fail:true});await editor(page).fill('失败后保留');await submit(page).click();
 await page.locator('.pixmax-text-task').getByText(/对话任务未确认/).waitFor();assert.equal(await page.evaluate(()=>nodes[0].text),'原有正文');
 assert.equal(await editor(page).innerText(),'失败后保留');assert.equal(await submit(page).isDisabled(),false);assert.equal(task.calls.length,1);
 await page.unroute('**/api/canvas-llm-tasks**');const retry=await service(page);await submit(page).click();await page.waitForFunction(()=>nodes[0].text==='已生成的新正文');assert.equal(retry.calls.length,1);assert.deepEqual(errors,[]);
});

test('text tools expose tags and download existing body instead of generation instructions',async t=>{
 const {page,errors}=await setup(t);await editor(page).fill('不要下载此提示词');
 const toolbar=page.getByRole('toolbar',{name:'文本节点工具'});await toolbar.getByRole('button',{name:'标签',exact:true}).click();await page.getByRole('dialog',{name:'节点标签'}).waitFor();await page.getByRole('button',{name:'关闭节点标签',exact:true}).click();
 const pending=page.waitForEvent('download');await toolbar.getByRole('button',{name:'下载文本',exact:true}).click();const download=await pending;
 const file=await download.path();assert.equal(fs.readFileSync(file,'utf8'),'原有正文');assert.match(download.suggestedFilename(),/\.txt$/);assert.deepEqual(errors,[]);
});

test('native text reference picker connects canvas text and sends resolved references in the durable request',async t=>{
 const {page,errors}=await setup(t),task=await service(page);
 await page.evaluate(()=>{const source=createPromptNode(900,100,{select:false});source.label='引用角色设定';source.text='主角是一名摄影师';render();});
 await editor(page).click();await editor(page).pressSequentially('@');const picker=page.locator('[data-rich-editor-insertion-panel]');await picker.waitFor();await picker.locator('input').fill('引用角色设定');await picker.getByRole('button',{name:/引用角色设定/}).click();
 assert.equal(await page.evaluate(()=>canvas.connections.some(edge=>edge.to===textId)),true);
 await submit(page).click();await page.waitForFunction(()=>nodes[0].text==='已生成的新正文');assert.match(task.calls[0].message,/主角是一名摄影师/);assert.doesNotMatch(task.calls[0].message,/%\%@/);assert.deepEqual(errors,[]);
});

test('text panel stays within desktop and mobile viewports and captures the upgraded layout',async t=>{
 const {page,errors}=await setup(t);await editor(page).fill('很多事情');fs.mkdirSync('.local/commercial-kickoff',{recursive:true});
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>PixmaxTextGeneration.position());const box=await page.locator('.pixmax-text-generation').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=1001,JSON.stringify(box));await page.screenshot({path:'.local/commercial-kickoff/text-generation-'+width+'.png'});}
 assert.deepEqual(errors,[]);
});

test('an unavailable saved model is preserved and cannot submit until a valid model is selected',async t=>{
 const {page,errors}=await setup(t),task=await service(page);await editor(page).fill('保留原有要求');
 await page.evaluate(()=>{nodes[0].textGeneration.model='已下架模型';apiProviders[0].model_policies={'chat:创作模型':{enabled:false}};PixmaxTextGeneration.sync();});
 assert.equal(await submit(page).isDisabled(),true);assert.equal(await page.evaluate(()=>nodes[0].textGeneration.model),'已下架模型');
 await page.getByRole('button',{name:'生成模型',exact:true}).click();const menu=page.locator('.pixmax-reshoot-model-options');
 assert.equal(await menu.getByRole('button',{name:/创作模型/}).isDisabled(),true);
 await menu.getByRole('button',{name:/推理模型/}).click();assert.equal(await submit(page).isDisabled(),false);
 assert.equal(await editor(page).innerText(),'保留原有要求');assert.equal(task.calls.length,0);assert.deepEqual(errors,[]);
});

test('session pause disposes both text form surfaces without losing its persisted draft',async t=>{
 const {page,errors}=await setup(t);await editor(page).fill('暂停前的要求');
 await page.locator('.pixmax-text-generation').getByRole('button',{name:'全屏',exact:true}).click();
 await page.locator('[data-native-generation-surface][data-fullscreen="true"]').waitFor();
 await page.evaluate(()=>{CanvasSession.paused=true;window.dispatchEvent(new Event('member-session:paused'));});
 assert.equal(await page.locator('[data-native-generation-surface],.pixmax-text-generation,.pixmax-native-generation-fullscreen').count(),0);
 assert.equal(await page.evaluate(()=>nodes[0].textGeneration.input),'暂停前的要求');
 await page.evaluate(()=>{CanvasSession.paused=false;PixmaxTextGeneration.sync();});await editor(page).waitFor();
 assert.equal(await editor(page).innerText(),'暂停前的要求');assert.deepEqual(errors,[]);
});

test('readonly text with no configured model can stay expanded without repeated viewport updates',async t=>{
 const {page,errors,writes}=await setup(t);
 await page.evaluate(()=>{apiProviders=[];MemberCanvasEdit.setEditable(false);});
 await page.waitForFunction(()=>document.querySelector('[aria-label="文本创作要求"]')?.getAttribute('aria-readonly')==='true');
 const full=page.locator('[data-native-generation-surface][data-fullscreen="true"]');
 for(let cycle=0;cycle<3;cycle++){
  await page.locator('.pixmax-text-generation').getByRole('button',{name:'全屏',exact:true}).click();await full.waitFor();
  await page.evaluate(()=>{for(let i=0;i<30;i++){PixmaxTextGeneration.sync();PixmaxTextGeneration.position();}});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.waitForTimeout(350);
  assert.equal(await full.isVisible(),true);assert.equal(await full.getByRole('textbox',{name:'文本创作要求'}).isEditable(),false);
  assert.equal(await full.locator('[data-native-generation-submit]').isDisabled(),true);
  await full.getByRole('button',{name:'关闭',exact:true}).click();await full.waitFor({state:'detached'});
 }
 await page.evaluate(()=>MemberCanvasEdit.setEditable(true));await editor(page).waitFor();await editor(page).fill('权限变化前的草稿');
 await page.locator('.pixmax-text-generation').getByRole('button',{name:'全屏',exact:true}).click();await full.waitFor();
 await page.evaluate(()=>MemberCanvasEdit.setEditable(false));await full.waitFor({state:'detached'});
 assert.equal(await editor(page).innerText(),'权限变化前的草稿');assert.equal(await editor(page).isEditable(),false);
 assert.equal(await page.evaluate(()=>nodes[0].text),'原有正文');assert.equal(writes.filter(row=>row.path.includes('canvas-llm')).length,0);assert.deepEqual(errors,[]);
});

test('fullscreen native clicks switch models, collapse with draft intact and submit to the original node',async t=>{
 const {page,errors}=await setup(t),task=await service(page);
 const full=page.locator('[data-native-generation-surface][data-fullscreen="true"]');
 const expand=()=>page.locator('.pixmax-text-generation').getByRole('button',{name:'全屏',exact:true}).click();
 await expand();await full.waitFor();await full.getByRole('textbox',{name:'文本创作要求'}).fill('放大后填写的创作要求');
 await full.getByRole('button',{name:'生成模型',exact:true}).click();await page.locator('.pixmax-reshoot-model-options').getByRole('button',{name:/推理模型/}).click();
 await full.getByRole('button',{name:'关闭',exact:true}).click();await full.waitFor({state:'detached'});
 assert.equal(await editor(page).innerText(),'放大后填写的创作要求');assert.equal(await page.evaluate(()=>nodes[0].textGeneration.model),'推理模型');
 assert.deepEqual(await page.evaluate(()=>selectedNodeIds()),[await page.evaluate(()=>textId)]);
 const panel=await page.locator('.pixmax-text-generation').boundingBox(),card=await page.locator('.prompt-smart-node').boundingBox();assert.ok(panel.y>=card.y+card.height);
 await expand();await full.waitFor();await full.locator('[data-native-generation-submit]').click();
 await page.waitForFunction(()=>nodes[0].text==='已生成的新正文');await full.waitFor({state:'detached'});
 assert.equal(task.calls.length,1);assert.equal(task.calls[0].model,'推理模型');assert.equal(task.calls[0].message,'放大后填写的创作要求');assert.deepEqual(errors,[]);
});
