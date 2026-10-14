const {test}=require('node:test');
const assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function setup(t,member=false){
 const f=await fixture(t,'smart',member);
 await f.page.route('**/assets/toolbar.webm',route=>route.fulfill({contentType:'video/webm',path:path.resolve('tests/fixtures/smart-video-trim.webm')}));
 await f.page.evaluate(()=>{
  const source=createNode(50,160,[{url:'/assets/toolbar.webm',name:'实拍视频.webm',kind:'video',natural_w:160,natural_h:90}],{select:false});
  window.toolbarSourceId=source.id;clearSelection();render();
 });
 return f;
}
test('video toolbar is selected-only, uses native actions, remains readable on zoom and fits the screen',async t=>{
 const {page,errors}=await setup(t);
 const toolbar=page.getByRole('toolbar',{name:'视频节点工具'});
 assert.equal(await toolbar.isVisible(),false);
 await page.locator('.image-node .node-body').click();
 await toolbar.waitFor({state:'visible'});
 assert.equal(await toolbar.getByRole('button',{name:'剪辑',exact:true}).isEnabled(),true);
 assert.equal(await toolbar.getByRole('button',{name:'裁剪',exact:true}).count(),0);
 assert.equal(await toolbar.getByRole('button',{name:'音频分离',exact:true}).isEnabled(),true);
 assert.equal(await toolbar.getByRole('button',{name:'标签',exact:true}).isEnabled(),true);
 assert.equal(await toolbar.getByRole('button',{name:'标记',exact:true}).isEnabled(),true);
 for(const name of ['合规检测','智能续写','字幕擦除','超分']){
  const button=toolbar.getByRole('button',{name,exact:true});assert.equal(await button.isDisabled(),true);assert.match(await button.getAttribute('title'),/后续接入/);
 }
 assert.equal(await toolbar.getByRole('button',{name:'片段重拍',exact:true}).isDisabled(),true);assert.match(await toolbar.getByRole('button',{name:'片段重拍',exact:true}).getAttribute('title'),/Seedance 2.5/);
 assert.equal(await toolbar.getByRole('button',{name:'生成历史',exact:true}).isDisabled(),true);assert.match(await toolbar.getByRole('button',{name:'生成历史',exact:true}).getAttribute('title'),/成员画布/);
 assert.equal(await toolbar.getByRole('button',{name:'解析',exact:true}).isDisabled(),true);assert.match(await toolbar.getByRole('button',{name:'解析',exact:true}).getAttribute('title'),/成员画布/);
 const first=await toolbar.boundingBox();assert.ok(first.x>=0&&first.x+first.width<=1280);
 await page.evaluate(()=>{viewport.scale=.5;applyViewport();});
 const second=await toolbar.boundingBox();assert.ok(Math.abs(first.width-second.width)<1);
 await page.evaluate(()=>{viewport.x=1100;applyViewport();});
 const last=await toolbar.boundingBox();assert.ok(last.x>=0&&last.x+last.width<=1280);
 assert.deepEqual(errors,[]);
});
test('one click on video scissors opens the existing trim pipeline for the selected source',async t=>{
 const {page,errors}=await setup(t);
 await page.locator('.image-node .node-body').click();
 await page.getByRole('toolbar',{name:'视频节点工具'}).getByRole('button',{name:'剪辑',exact:true}).click();
 await page.waitForFunction(()=>smartVideoTrimPanel.state.active);
 assert.equal(await page.evaluate(()=>smartImageEditor.state.nodeId),await page.evaluate(()=>toolbarSourceId));
 assert.equal(await page.evaluate(()=>smartVideoTrimPanel.state.duration),2);
 await page.waitForFunction(()=>document.getElementById('previewCurrentVideo')?.readyState>=1);
 await page.locator('#videoTrimStartInput').fill('0.4');await page.locator('#videoTrimStartInput').press('Tab');
 await page.locator('#videoTrimEndInput').fill('1.4');await page.locator('#videoTrimEndInput').press('Tab');
 await page.route('**/api/smart-canvas/video-trim',route=>{
  assert.deepEqual(route.request().postDataJSON(),{url:'/assets/toolbar.webm',name:'实拍视频.webm',start_seconds:.4,end_seconds:1.4});
  return route.fulfill({json:{url:'/assets/toolbar-result.webm',name:'片段.webm'}});
 });
 await page.locator('#videoTrimApplyBtn').click();await page.waitForFunction(()=>nodes.length===2);
 assert.equal(await page.evaluate(()=>nodes[1].images[0].clip_source_url),'/assets/toolbar.webm');assert.deepEqual(errors,[]);
});

test('native video picture selects and drags the card while playback controls keep their own gestures',async t=>{
 const {page,errors}=await setup(t);
 const video=page.locator('.pixmax-inline-video');await video.waitFor();
 await page.waitForFunction(()=>document.querySelector('.pixmax-inline-video').readyState>=2);
 await video.click();await page.getByRole('toolbar',{name:'视频节点工具'}).waitFor({state:'visible'});
 assert.equal(await page.evaluate(()=>smartSelection.nodeId),await page.evaluate(()=>toolbarSourceId));
 const first=await video.boundingBox(),before=await page.evaluate(()=>({x:nodes[0].x,y:nodes[0].y}));
 await page.mouse.move(first.x+first.width/2,first.y+first.height/2);await page.mouse.down();
 await page.mouse.move(first.x+first.width/2+80,first.y+first.height/2+40,{steps:5});await page.mouse.up();
 assert.deepEqual(await page.evaluate(()=>({x:nodes[0].x,y:nodes[0].y})),{x:before.x+80,y:before.y+40});
 await page.locator('.pixmax-player-mount .play-toggle').click();
 await page.waitForFunction(()=>!document.querySelector('.pixmax-inline-video').paused);
 assert.deepEqual(await page.evaluate(()=>({x:nodes[0].x,y:nodes[0].y})),{x:before.x+80,y:before.y+40});
 await page.locator('.pixmax-player-mount .play-toggle').click();
 await video.dblclick();await page.locator('#imageEditModal').waitFor({state:'visible'});
 assert.deepEqual(errors,[]);
});
test('depth action confirms existing settings before starting, and stale dialogs cannot write into the canvas',async t=>{
 const {page,errors}=await setup(t,true);
 await page.locator('.image-node .node-body').click();
 const action=page.getByRole('toolbar',{name:'视频节点工具'}).getByRole('button',{name:'深度视频',exact:true});
 await action.click();const dialog=page.getByRole('dialog',{name:'深度视频参数'});
 await dialog.waitFor();assert.match(await dialog.innerText(),/V2 Small.*fp16/);assert.match(await dialog.innerText(),/960px/);
 assert.equal(await page.evaluate(()=>nodes.length),1);
 await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);
 await action.click();await page.evaluate(()=>{window.startedDepth=0;LocalDepthVideo.generate=opts=>{startedDepth++;window.depthSourceUrl=opts.url;return {close(){}};};});
 await dialog.getByRole('button',{name:'开始提取',exact:true}).click();assert.equal(await dialog.count(),0);
 assert.equal(await page.evaluate(()=>startedDepth),1);assert.equal(await page.evaluate(()=>nodes.length),2);
 await page.evaluate(()=>{smartSelection.createdNode(toolbarSourceId);syncSelectionUi();});
 await action.click();await page.evaluate(()=>MemberCanvasEdit.setEditable(false));
 assert.equal(await dialog.count(),0);
 assert.equal(await action.isDisabled(),true);assert.deepEqual(errors,[]);
});

test('viewer can preview and download but cannot trim, authenticate, save assets or invoke pending features',async t=>{
 const {page,errors}=await setup(t,true);
 await page.evaluate(()=>MemberCanvasEdit.setEditable(false));
 await page.locator('.image-node .node-body').click();
 const toolbar=page.getByRole('toolbar',{name:'视频节点工具'});
 for(const name of ['剪辑','深度视频','素材认证','保存到资产库','标记'])assert.equal(await toolbar.getByRole('button',{name,exact:true}).isDisabled(),true);
 await page.evaluate(()=>{window.downloaded=0;window.authenticated=0;downloadPreviewFile=()=>downloaded++;quickFaceAuthSmartImage=()=>authenticated++;});
 await toolbar.getByRole('button',{name:'下载',exact:true}).click();assert.equal(await page.evaluate(()=>downloaded),1);
 await toolbar.getByRole('button',{name:'放大预览',exact:true}).click();await page.locator('#imageEditModal').waitFor({state:'visible'});
 await page.evaluate(()=>{closeImageEditor();runSmartNodeToolbarAction(toolbarSourceId,'auth');runSmartNodeToolbarAction(toolbarSourceId,'reshoot');});
 assert.equal(await page.evaluate(()=>authenticated),0);assert.equal(await page.evaluate(()=>nodes.length),1);assert.deepEqual(errors,[]);
});
