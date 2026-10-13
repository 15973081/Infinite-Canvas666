const {test}=require('node:test');
const assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');

test('completed video has one card surface and keeps preview, context deletion and undo without corner overlays',async t=>{
 const {page,errors}=await fixture(t,'smart',true);
 await page.route('**/assets/clean.webm',route=>route.fulfill({contentType:'video/webm',path:path.resolve('tests/fixtures/smart-video-trim.webm')}));
 await page.evaluate(()=>{
  const n=createNode(180,160,[{url:'/assets/clean.webm',kind:'video',name:'完成的视频.webm',natural_w:160,natural_h:90}],{select:false});
  n.runStartedAt=Date.now()-28000;n.runFinishedAt=Date.now();render();
 });
 const card=page.locator('.image-node'),video=card.locator('video');await video.waitFor();
 await video.hover();await video.click();
 assert.equal(await card.locator('.node-head,.node-hint,.floating-node-actions,.node-delete,.image-delete,.run-time-pill,.media-video-card>.smart-video-play').count(),0);
 assert.equal(await card.locator('.generation-node-caption').count(),1);
 await page.getByRole('toolbar',{name:'视频节点工具'}).getByRole('button',{name:'放大预览',exact:true}).click();
 await page.locator('#imageEditModal').waitFor({state:'visible'});await page.evaluate(()=>closeImageEditor());
 await video.click({button:'right'});await page.locator('[data-context-action="delete"]').click();
 assert.equal(await page.evaluate(()=>nodes.length),0);
 await page.getByRole('button',{name:'撤销',exact:true}).click();assert.equal(await page.evaluate(()=>nodes.length),1);
 assert.deepEqual(errors,[]);
});

test('late depth CSS cannot revive old header or border and progress keeps the focused cancel control mounted',async t=>{
 const {page,errors}=await fixture(t,'smart',true);
 await page.addStyleTag({path:path.resolve('static/css/local-depth-video.css')});
 await page.evaluate(()=>{
  createNode(70,160,[{url:'/assets/clean.webm',kind:'video',natural_w:160,natural_h:90}],{select:false});
  LocalDepthVideo.generate=options=>{window.depthOptions=options;return {close(){},cancel(){options.onError(new DOMException('cancel','AbortError'));options.onFinally();}};};
  window.depthTarget=startSmartLocalDepthVideo(nodes[0].id,0);
  window.depthCard=document.querySelector(`[data-id="${depthTarget.id}"]`);
  window.retainedCancel=depthCard.querySelector('[data-local-depth-action="cancel"]');
 });
 const card=page.locator('.image-node').last();
 assert.deepEqual(await card.evaluate(e=>({
  caption:e.querySelectorAll('.generation-node-caption').length,old:e.querySelectorAll('.node-head,.run-time-pill,.floating-node-actions').length,
  outerBorder:getComputedStyle(e).borderTopWidth,shadow:getComputedStyle(e).boxShadow,
  bodyHeight:e.querySelector('.node-body').getBoundingClientRect().height,cardHeight:e.getBoundingClientRect().height,
  iconBackground:getComputedStyle(e.querySelector('.local-depth-node-icon')).backgroundColor
 })),{caption:1,old:0,outerBorder:'0px',shadow:'none',bodyHeight:260,cardHeight:260,iconBackground:'rgba(0, 0, 0, 0)'});
 await card.locator('[data-local-depth-action="cancel"]').focus();
 await page.evaluate(()=>{smartLocalDepthState().jobs.get(depthTarget.id).lastPaint=0;depthOptions.onProgress({text:'提取 4 / 100 帧',progress:4});});
 assert.equal(await card.locator('.local-depth-node-sub').innerText(),'本地处理 · 4%');
 assert.equal(await page.evaluate(()=>document.activeElement===retainedCancel&&retainedCancel.isConnected),true);
 await card.locator('[data-local-depth-action="cancel"]').click();
 assert.equal(await card.locator('.local-depth-node strong').innerText(),'已取消');
 assert.equal(await card.locator('[data-local-depth-action="retry"]').isEnabled(),true);
 assert.equal(await card.locator('.node-head,.run-time-pill').count(),0);assert.deepEqual(errors,[]);
});
