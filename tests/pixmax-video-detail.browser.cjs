const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture}=require('./helpers/canvas-browser.cjs');

test('readonly video double click opens gallery; editing opens Pixmax detail',async t=>{
 const {page,errors,writes}=await fixture(t,'smart',true,{permissions:['canvas.read','asset.read','canvas.export'],record:{nodes:[{id:'video',type:'smart-image',x:100,y:100,images:[{url:'/clip.webm',name:'片段.webm',kind:'video'}]}]}});
 await page.route('**/clip.webm',route=>route.fulfill({contentType:'video/webm',body:fs.readFileSync('tests/fixtures/smart-video-trim.webm')}));
 await page.addScriptTag({url:'/static/js/member-media-preview.js'});
 await page.evaluate(()=>{
   MemberMediaUrl=url=>new URL(url,location.href).href;
   MemberCanvasEdit.active.options=MemberCanvasEdit.options;
   MemberCanvasEdit.active.mediaPreview=MemberMediaPreview.create({entry:MemberCanvasEdit.active,valid:()=>true});
   MemberCanvasEdit.setEditable(false);
 });
 const player=page.locator('.image-node[data-id="video"] .pixmax-player-mount');await player.locator('video').waitFor();
 await player.dblclick({position:{x:60,y:30}});
 const gallery=page.getByRole('dialog',{name:'画布素材预览',exact:true});await gallery.waitFor();
 assert.equal(await page.locator('.pixmax-image-preview').count(),0);
 assert.equal(await gallery.locator('.member-preview-counter').innerText(),'1 / 1');
 await gallery.getByRole('link',{name:'下载原件',exact:true}).waitFor();
 await page.keyboard.press('Escape');
 await page.evaluate(()=>MemberCanvasEdit.setEditable(true));
 await player.dblclick({position:{x:60,y:30}});
 await page.getByRole('dialog',{name:'视频预览',exact:true}).waitFor();
 assert.equal(await gallery.isVisible(),false);
 assert.equal(writes.length,0);assert.deepEqual(errors,[]);
});

test('video preview reuses Pixmax player and detail panel and releases playback on close',async t=>{
 const {page,errors,writes}=await fixture(t,'smart',true,{record:{nodes:[{id:'video',type:'smart-image',x:100,y:100,images:[{url:'/clip.webm',name:'片段.webm',kind:'video',size_bytes:10240}]}]}});
 await page.route('**/clip.webm',route=>route.fulfill({contentType:'video/webm',body:fs.readFileSync('tests/fixtures/smart-video-trim.webm')}));
 await page.evaluate(()=>{MemberCanvasEdit.setEditable(false);openSmartVideoLightbox('video');});
 const modal=page.getByRole('dialog',{name:'视频预览',exact:true});await modal.waitFor();
 await page.waitForFunction(()=>document.querySelector('.pixmax-detail-video video')?.readyState>=2);
 assert.equal(await page.evaluate(()=>smartImageEditor.state.open),false);
 assert.equal(await page.locator('#videoFrameTools').count(),0);
 assert.equal(await modal.locator('video').evaluate(v=>v.controls),false,'uses original custom controls');
 await modal.getByText('片段.webm',{exact:true}).waitFor();await modal.getByText('10.0 KB',{exact:true}).waitFor();
 await modal.getByText('开始时间',{exact:true}).waitFor();
 await page.evaluate(async()=>{window.detailVideo=document.querySelector('.pixmax-detail-video video');detailVideo.muted=true;await detailVideo.play();});
 fs.mkdirSync('.local/commercial-kickoff',{recursive:true});await page.screenshot({path:'.local/commercial-kickoff/video-detail-preview.png'});
 await modal.getByRole('button',{name:'关闭视频预览',exact:true}).click();
 assert.equal(await modal.count(),0);
 assert.equal(await page.evaluate(()=>detailVideo.paused),true);
 await page.evaluate(()=>openImageEditor('video',0));await modal.waitFor();
 await page.keyboard.press('Escape');assert.equal(await modal.count(),0);
 assert.equal(writes.length,0);assert.deepEqual(errors,[]);
});

test('video failure retries and session pause disposes the player without writes',async t=>{
 const {page,errors,writes}=await fixture(t,'smart',true,{record:{nodes:[{id:'video',type:'smart-image',x:100,y:100,images:[{url:'/retry.webm',kind:'video'}]}]}});
 let failed=true;
 await page.route('**/retry.webm',route=>failed?route.fulfill({status:404,body:'Missing'}):route.fulfill({contentType:'video/webm',body:fs.readFileSync('tests/fixtures/smart-video-trim.webm')}));
 await page.evaluate(()=>openSmartVideoLightbox('video'));
 const modal=page.getByRole('dialog',{name:'视频预览',exact:true});
 await modal.getByRole('button',{name:'重试视频',exact:true}).waitFor();failed=false;
 await modal.getByRole('button',{name:'重试视频',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.pixmax-detail-video video')?.readyState>=2);
 await page.evaluate(()=>{window.pausedVideo=document.querySelector('.pixmax-detail-video video');window.dispatchEvent(new Event('member-session:paused'));});
 assert.equal(await modal.count(),0);assert.equal(await page.evaluate(()=>pausedVideo.paused),true);
 assert.equal(writes.length,0);assert.deepEqual(errors,[]);
});
