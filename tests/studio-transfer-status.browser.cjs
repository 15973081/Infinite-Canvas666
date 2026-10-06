const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');
const {origin}=require('./helpers/canvas-browser.cjs');
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="#6b8c56"/></svg>';
const shots=path.resolve(__dirname,'../docs/design/transfer-states');
for(const kind of ['classic','smart']){
 test(kind+': opening a canvas reports node loading until the document is ready',async t=>{
  const {page,record}=await fixture(t,kind,false);let waiting;
  await page.route('**/api/canvases/canvas-test',route=>{if(route.request().method()==='GET')waiting=route;else return route.fallback();});
  await page.evaluate(kind=>{window.documentLoad=kind==='classic'?openCanvas('canvas-test'):loadCanvas();},kind);
  await page.getByText('画布节点加载中',{exact:true}).waitFor();
  while(!waiting)await new Promise(resolve=>setTimeout(resolve,10));
  await waiting.fulfill({json:{canvas:record}});await page.evaluate(()=>window.documentLoad);
  assert.equal(await page.locator('.studio-transfer-card').count(),0);
 });
 test(kind+': node media shows queued/loading/failure/retry without fetching original video',async t=>{
  const {page,errors}=await fixture(t,kind,false);const pending=[],requests=[];let fail=true;
  await page.route('**/api/media-preview?*',route=>{requests.push(route.request().url());pending.push(route);});
  await page.route('**/node-failure.svg',route=>route.fulfill({status:fail?404:200,contentType:fail?'text/plain':'image/svg+xml',body:fail?'missing':svg}));
  await page.evaluate(kind=>{
   nodes=kind==='classic'?[{id:'media',type:'image',url:'/assets/slow.png',x:40,y:40},{id:'video',type:'image',mediaKind:'video',url:'/output/slow.mp4',x:440,y:40},{id:'failure',type:'image',url:'/node-failure.svg',x:40,y:380}]:
    [{id:'media',type:'image',images:[{url:'/assets/slow.png',width:320,height:240}],x:40,y:40},{id:'video',type:'image',images:[{url:'/output/slow.mp4',kind:'video',width:320,height:240}],x:440,y:40},{id:'failure',type:'image',images:[{url:'/node-failure.svg',width:320,height:240}],x:40,y:380}];render();
  },kind);
  await page.locator('.canvas-node-media-state').filter({hasText:'素材加载中'}).first().waitFor();
  await page.locator('.canvas-node-media-state.failed').waitFor();
  assert.equal(await page.locator('.node video,.image-node video').count(),0);
  fail=false;await page.locator('.canvas-node-media-state.failed button').press('Enter');
  await page.waitForFunction(()=>!document.querySelector('.canvas-node-media-state.failed'));
  for(const theme of ['dark','light']){
   await page.evaluate(theme=>StudioTheme.apply(theme),theme);fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,kind+'-loading-'+theme+'.png')});
  }
  for(const route of pending.splice(0))await route.fulfill({contentType:'image/svg+xml',body:svg});
  await page.waitForFunction(()=>[...document.querySelectorAll('.canvas-node-media-state')].every(el=>el.hidden));
  assert.equal(requests.length,2);assert.deepEqual(errors,[]);
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.canvas-node-media-state').first().evaluate(el=>getComputedStyle(el,'::before').animationName),'none');
 });
 test(kind+': upload stays pending until acknowledgement and cannot append to another canvas',async t=>{
  const {page,errors}=await fixture(t,kind,false);let waiting;
  await page.route('**/api/ai/upload',route=>{waiting=route;});
  await page.evaluate(kind=>{
   const file=new File(['test'],'upload.png',{type:'image/png'});
   window.uploadAttempt=(kind==='classic'?uploadMediaFiles([file],{x:100,y:100}):handleFiles([file])).catch(error=>{window.uploadError=error.message;});
  },kind);
  await page.getByText('当前素材上传中',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>nodes.length),0);
  for(const width of [390,1280]){await page.setViewportSize({width,height:900});assert.equal(await page.locator('.studio-transfer-card').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}),true);}
  fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,kind+'-upload.png')});
  while(!waiting)await new Promise(resolve=>setTimeout(resolve,10));
  await waiting.fulfill({json:{files:[{url:'/test-image.svg',name:'upload',kind:'image'}]}});await page.evaluate(()=>window.uploadAttempt);
  assert.equal(await page.evaluate(()=>nodes.length),1);assert.equal(await page.locator('.studio-transfer-card').count(),0);
  waiting=null;await page.evaluate(kind=>{
   const file=new File(['other'],'other.png',{type:'image/png'}),id=nodes[0].id;window.uploadAttempt=(kind==='classic'?fillImageNode(id,[file]):handleFiles([file],id)).catch(error=>{window.uploadError=error.message;});
  },kind);
  await page.locator('.studio-node-transfer').waitFor();await page.evaluate(()=>render());await page.locator('.studio-node-transfer').waitFor();
  await page.evaluate(()=>canvas={...canvas,id:'other-canvas'});
  while(!waiting)await new Promise(resolve=>setTimeout(resolve,10));
  await waiting.fulfill({json:{files:[{url:'/test-image.svg',name:'other',kind:'image'}]}});await page.evaluate(()=>window.uploadAttempt);
  assert.equal(await page.evaluate(()=>nodes.length),1);assert.deepEqual(errors,[]);
  assert.equal(await page.locator('.studio-node-transfer').count(),0);
 });
}
test('upload failures retain clear status and progress never claims completion before confirmation',async t=>{
 const {page}=await fixture(t,'classic',false);
 await page.evaluate(()=>{window.testTransfer=StudioTransferStatus.begin({name:'movie.mp4'});testTransfer.progress({loaded:100,total:100});});
 assert.equal(await page.locator('.studio-transfer-card progress').getAttribute('value'),'99');
 assert.match(await page.locator('.studio-transfer-card').innerText(),/等待服务器确认/);
 await page.evaluate(()=>testTransfer.fail(new Error('上传连接中断，请重新选择文件续传')));
 assert.match(await page.locator('.studio-transfer-card.failed').innerText(),/素材上传失败.*上传连接中断/s);
 await page.getByRole('button',{name:'关闭',exact:true}).click();assert.equal(await page.locator('.studio-transfer-card').count(),0);
});
test('asset library upload stays visible and preserves the destination selected before uploading',async t=>{
 const {page,errors}=await fixture(t,'classic',false);let waiting,posted;
 await page.route('**/api/ai/upload',route=>{waiting=route;});
 await page.route('**/api/asset-library/items/batch',route=>{posted=route.request().postDataJSON();return route.fulfill({json:{items:[{id:'item',url:'/test-image.svg'}]}});});
 await page.goto(origin+'/static/asset-manager.html');await page.waitForFunction(()=>typeof uploadFiles==='function'&&typeof render==='function');
 await page.evaluate(()=>{
  assetLibrary={libraries:[{id:'lib',name:'Test',categories:[{id:'one',name:'One',items:[]},{id:'two',name:'Two',items:[]}]}],categories:[]};activeAssetLibraryId='lib';activeAssetCategoryId='one';render();
  window.libraryUpload=uploadFiles([new File(['x'],'x.png',{type:'image/png'})]);
 });
 await page.getByText('当前素材上传中',{exact:true}).waitFor();await page.evaluate(()=>{activeAssetCategoryId='two';});
 while(!waiting)await new Promise(resolve=>setTimeout(resolve,10));
 await waiting.fulfill({json:{files:[{url:'/test-image.svg',name:'x'}]}});await page.evaluate(()=>window.libraryUpload);
 assert.equal(posted.library_id,'lib');assert.equal(posted.category_id,'one');assert.equal(await page.locator('.studio-transfer-card').count(),0);
 assert.deepEqual(errors,[]);
});
test('online references remain uploading, block generation and ignore an obsolete upload result',async t=>{
 const {page,errors}=await fixture(t,'classic',false);const pending=[];let generations=0;
 await page.route('**/api/ai/upload',route=>{pending.push(route);});
 page.on('request',request=>{if(/\/api\/(?:generate|image|canvas-image-tasks)/.test(request.url()))generations++;});
 await page.goto(origin+'/static/online.html');await page.waitForFunction(()=>typeof handleFile==='function');
 await page.evaluate(()=>{window.firstUpload=handleFile(new File(['a'],'a.png',{type:'image/png'}),1);});
 await page.locator('.studio-reference-upload').waitFor();assert.equal(await page.evaluate(()=>refs[1]),null);
 let dialogMessage='';page.once('dialog',async dialog=>{dialogMessage=dialog.message();await dialog.accept();});
 await page.locator('#genBtn').click();assert.match(dialogMessage,/当前素材上传中/);assert.equal(generations,0);
 await page.evaluate(()=>{window.secondUpload=handleFile(new File(['b'],'b.png',{type:'image/png'}),1);});
 while(pending.length<2)await new Promise(resolve=>setTimeout(resolve,10));
 await pending[1].fulfill({json:{files:[{url:'/new.png',name:'new'}]}});await page.evaluate(()=>window.secondUpload);
 await pending[0].fulfill({json:{files:[{url:'/old.png',name:'old'}]}});await page.evaluate(()=>window.firstUpload);
 assert.equal(await page.evaluate(()=>refs[1].url),'/new.png');assert.equal(await page.locator('.studio-reference-upload').count(),0);
 assert.deepEqual(errors,[]);
});
