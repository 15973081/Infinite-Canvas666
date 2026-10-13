const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,origin}=require('./helpers/canvas-browser.cjs');
const batch={timestamp:123,prompt:'城市夜景，薄雾与灯光',images:['/test-image.svg','/test-image.svg?second=1']};
async function online(t){
 const f=await fixture(t,'classic',false),records=new Map([['canvas-test',f.record]]),calls=[];
 await f.page.addInitScript(()=>{window.CanvasSession={enabled:true,ready:Promise.resolve(),paused:false,context:{member:{id:'m'},workspace:{id:'w',permissions:['canvas.read','canvas.create','canvas.edit','asset.read','asset.manage']}},url:path=>path+'?workspace=w'};});
 let blocked=false,failList=false;
 await f.page.route('**/api/canvases**',async route=>{
  const request=route.request(),url=new URL(request.url()),method=request.method(),body=request.postDataJSON();calls.push({path:url.pathname,method,body,headers:request.headers()});
  if(url.pathname==='/api/canvases'){
   if(failList)return route.fulfill({status:503,json:{detail:'暂时无法加载画布'}});
   if(method==='POST'){const canvas={...f.record,...body,id:'new-'+records.size,nodes:[],connections:[],revision:1};records.set(canvas.id,canvas);return route.fulfill({json:{canvas}});}
   return route.fulfill({json:{canvases:[...records.values()]}});
  }
  const id=url.pathname.split('/')[3],canvas=records.get(id);
  if(url.pathname.endsWith('/acquire')){
   if(blocked)return route.fulfill({status:409,json:{detail:{code:'canvas_locked'}}});
   return route.fulfill({json:{edit_token:'secret',generation:1,revision:canvas.revision,holder:{is_self:true},server_time:new Date().toISOString(),expires_at:new Date(Date.now()+60000).toISOString()}});
  }
  if(url.pathname.endsWith('/release'))return route.fulfill({json:{released:true,revision:canvas.revision}});
  if(method==='PUT'){assert.equal(request.headers()['x-canvas-edit-token'],'secret');assert.equal(body.base_revision,canvas.revision);Object.assign(canvas,body,{revision:canvas.revision+1});}
  return route.fulfill({json:{canvas}});
 });
 await f.page.route('**/api/asset-library**',async route=>{
  const request=route.request();calls.push({path:new URL(request.url()).pathname,method:request.method(),body:request.postDataJSON()});
  return route.fulfill({json:request.method()==='POST'?{items:request.postDataJSON().items}:{library:{libraries:[{id:'lib',name:'团队作品',categories:[{id:'cat',name:'精选图片',type:'image'},{id:'wf',name:'工作流',type:'workflow'}]}]}}});
 });
 await f.page.goto(origin+'/static/online.html');
 await f.page.addScriptTag({url:origin+'/static/js/canvas-edit-lease.js'});
 await f.page.evaluate(batch=>{renderImageCard(batch);currentResult=batch;document.getElementById('resultActions').hidden=false;},batch);
 return {...f,records,calls,setBlocked:value=>blocked=value,setFailList:value=>failList=value};
}
test('online result, archive and preview import a whole batch into both kinds and existing canvas',async t=>{
 const f=await online(t),{page}=f;
 await page.locator('#resultActions [data-online-import="canvas"]').click();
 const dialog=page.getByRole('dialog');await dialog.locator('#onlineImportCanvas').selectOption('new:classic');
 await dialog.getByRole('button',{name:'导入',exact:true}).click();await dialog.getByRole('link',{name:'打开画布'}).waitFor();
 assert.equal(f.records.get('new-1').nodes.length,3);assert.equal(f.records.get('new-1').kind,'classic');
 assert.match(await dialog.getByRole('link').getAttribute('href'),/workspace=w/);
 await dialog.getByRole('button',{name:'关闭'}).click();
 await page.locator('.masonry-item [data-online-import="canvas"]').click();
 assert.equal(await page.locator('#lightbox').isVisible(),false,'archive action does not open the preview');
 await dialog.locator('#onlineImportCanvas').selectOption('new:smart');
 await dialog.getByRole('button',{name:'导入',exact:true}).click();await dialog.getByRole('link',{name:'打开画布'}).waitFor();
 assert.equal(f.records.get('new-2').nodes.filter(n=>n.type==='smart-image').length,2);
 await dialog.getByRole('button',{name:'关闭'}).click();
 await page.evaluate(batch=>openLightbox(batch),batch);
 await page.locator('#lightboxCard [data-online-import="canvas"]').click();
 await dialog.locator('#onlineImportCanvas').selectOption('canvas-test');await dialog.locator('#onlineImportPrompt').uncheck();
 await dialog.getByRole('button',{name:'导入',exact:true}).click();await dialog.getByRole('link',{name:'打开画布'}).waitFor();
 assert.equal(f.record.nodes.length,2);assert.ok(f.record.nodes.every(n=>n.type==='image'));
 assert.equal(f.calls.filter(c=>c.method==='PUT').length,3);assert.equal(f.calls.filter(c=>c.path.endsWith('/release')).length,3);
 assert.ok(!f.calls.some(c=>/canvas-image-tasks|ai\/upload/.test(c.path)),'no generation or upload is repeated');assert.deepEqual(f.errors,[]);
 await page.goto(origin+'/static/smart-canvas.html?id=new-2');
 await page.waitForFunction(()=>typeof canvas!=='undefined'&&canvas?.id==='new-2');
 await page.waitForFunction(()=>document.querySelectorAll('.image-node:not(.prompt-smart-node) img').length>=2);
 assert.equal(await page.locator('.prompt-smart-node textarea').inputValue(),batch.prompt,'imported prompt renders in the real smart editor');
 assert.deepEqual(f.errors,[]);
});
test('library import uses the chosen real group and successful repeats do not duplicate assets',async t=>{
 const f=await online(t),{page}=f;
 for(let repeat=0;repeat<2;repeat++){
  await page.locator('.masonry-item [data-online-import="library"]').click();const dialog=page.getByRole('dialog');
  await dialog.locator('#onlineImportCategory').selectOption('cat');assert.equal(await dialog.locator('#onlineImportCategory option').count(),1);
  await dialog.getByRole('button',{name:'导入',exact:true}).click();await dialog.getByRole('link',{name:'打开素材库'}).waitFor();
  assert.match(await dialog.locator('[role=status]').textContent(),/已保存 2/);await dialog.getByRole('button',{name:'关闭'}).click();
 }
 const saves=f.calls.filter(c=>c.method==='POST');assert.equal(saves.length,1);assert.equal(saves[0].body.library_id,'lib');assert.equal(saves[0].body.category_id,'cat');assert.equal(saves[0].body.items.length,2);assert.deepEqual(f.errors,[]);
});
test('loading retry and locked canvas failure preserve the selected target',async t=>{
 const f=await online(t),{page}=f;f.setFailList(true);
 await page.locator('#resultActions [data-online-import="canvas"]').click();const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:'重新加载目标'}).waitFor();f.setFailList(false);await dialog.getByRole('button',{name:'重新加载目标'}).click();
 await dialog.locator('#onlineImportCanvas').selectOption('canvas-test');f.setBlocked(true);
 await dialog.getByRole('button',{name:'导入',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#onlineImportDialog .online-import-message').textContent.includes('已有成员'));
 assert.equal(f.calls.filter(c=>c.method==='PUT').length,0);assert.equal(await dialog.locator('#onlineImportCanvas').inputValue(),'canvas-test');
 f.setBlocked(false);await dialog.getByRole('button',{name:'导入',exact:true}).click();await dialog.getByRole('link',{name:'打开画布'}).waitFor();assert.equal(f.record.nodes.length,3);assert.deepEqual(f.errors,[]);
});
test('import dialog fits mobile and both themes, with keyboard dismissal and restored focus',async t=>{
 const f=await online(t),{page}=f;
 for(const theme of ['dark'])for(const width of [1280,768,390]){
  await page.setViewportSize({width,height:844});
  const opener=page.locator('.masonry-item [data-online-import="canvas"]');await opener.click();
  if(width===390)assert.ok(await opener.evaluate(el=>el.getBoundingClientRect().height)>=44,'mobile actions retain a touch-sized hit area');
  const dialog=page.getByRole('dialog');await dialog.locator('#onlineImportCanvas').waitFor();
  const geometry=await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,overflow:el.scrollWidth>el.clientWidth};});
  assert.ok(geometry.left>=0&&geometry.right<=width&&geometry.top>=0&&geometry.bottom<=844&&!geometry.overflow,JSON.stringify(geometry));
  const contrast=await dialog.locator('.online-import-submit').evaluate(el=>{
   const rgb=s=>s.match(/[\d.]+/g).map(Number),lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0),css=getComputedStyle(el),a=lum(rgb(css.color)),b=lum(rgb(css.backgroundColor));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  });assert.ok(contrast>=4.5);
  if(width===1280){fs.mkdirSync(path.resolve(__dirname,'../.local/online-imports'),{recursive:true});await page.screenshot({path:path.resolve(__dirname,'../.local/online-imports/dialog-'+theme+'.png')});}
  await dialog.locator('#onlineImportCanvas').press('Escape');assert.equal(await dialog.isVisible(),false);assert.equal(await opener.evaluate(el=>document.activeElement===el),true);
 }
 assert.equal(f.calls.filter(c=>c.method!=='GET').length,0);assert.deepEqual(f.errors,[]);
});
test('multi-selection imports selected records, retaining prompts and existing selection after dismissal',async t=>{
 const f=await online(t),{page}=f,other={timestamp:456,prompt:'另一条作品的提示词',images:['/test-image.svg?third=1']};
 await page.evaluate(other=>renderImageCard(other),other);
 await page.getByRole('button',{name:'管理',exact:true}).click();
 const canvasAction=page.locator('[data-hbm-action="online-canvas"]'),libraryAction=page.locator('[data-hbm-action="online-library"]');
 assert.equal(await canvasAction.isEnabled(),false);assert.equal(await libraryAction.isEnabled(),false);
 await page.locator('[data-history-ts="123"]').click();await page.locator('[data-history-ts="456"]').click();
 assert.equal(await canvasAction.isEnabled(),true);assert.equal(await page.locator('.hbm-count').textContent(),'已选 2 张');
 await canvasAction.press('Enter');const dialog=page.getByRole('dialog');
 assert.match(await dialog.locator('.online-import-summary').textContent(),/2 条作品， 3 张图片/);
 await dialog.locator('#onlineImportCanvas').selectOption('new:smart');await dialog.getByRole('button',{name:'导入',exact:true}).click();await dialog.getByRole('link',{name:'打开画布'}).waitFor();
 const canvas=f.records.get('new-1');assert.equal(canvas.nodes.length,5);assert.deepEqual(canvas.nodes.filter(n=>n.type==='smart-prompt').map(n=>n.text),[batch.prompt,other.prompt]);
 await dialog.getByRole('button',{name:'关闭'}).click();assert.equal(await page.locator('.hbm-selected').count(),2);
 await libraryAction.click();await dialog.locator('#onlineImportCategory').selectOption('cat');await dialog.getByRole('button',{name:'导入',exact:true}).click();await dialog.getByRole('link',{name:'打开素材库'}).waitFor();
 assert.equal(f.calls.filter(c=>c.path.endsWith('/items/batch'))[0].body.items.length,3);
 await dialog.getByRole('button',{name:'关闭'}).click();await page.getByRole('button',{name:'取消全选',exact:true}).click();assert.equal(await canvasAction.isEnabled(),false);
 for(const theme of ['dark']){
  await page.setViewportSize({width:390,height:844});
  const geometry=await page.locator('.hbm-toolbar').evaluate(el=>({width:el.scrollWidth,client:el.clientWidth,heights:[...el.querySelectorAll('button:not(.hbm-hide)')].map(b=>b.getBoundingClientRect().height)}));
  assert.ok(geometry.width<=geometry.client);assert.ok(geometry.heights.every(h=>h>=44));
 }
 await page.getByRole('button',{name:'全选',exact:true}).click();await canvasAction.click();await dialog.locator('#onlineImportCanvas').waitFor();
 await dialog.locator('#onlineImportCanvas').press('Escape');assert.equal(await page.locator('.hbm-selected').count(),2,'cancel retains the selection');
 await page.getByRole('button',{name:'完成',exact:true}).click();assert.equal(await canvasAction.isVisible(),false);assert.equal(await page.locator('.hbm-selected').count(),0);
 assert.equal(f.calls.filter(c=>c.path==='/api/history/delete').length,0);assert.deepEqual(f.errors,[]);
});
for(const mode of ['single','bulk'])test(mode+' import searches many canvases locally and writes only to the explicitly chosen match',async t=>{
 const f=await online(t),{page}=f;
 for(let i=0;i<150;i++)f.records.set('project-'+i,{...f.record,id:'project-'+i,title:i===149?'品牌项目 Alpha <安全>':'项目 '+i,kind:i===149?'smart':'classic',nodes:[],connections:[]});
 if(mode==='bulk'){
  await page.evaluate(()=>renderImageCard({timestamp:456,prompt:'另一条提示词',images:['/test-image.svg?other=1']}));
  await page.getByRole('button',{name:'管理',exact:true}).click();await page.getByRole('button',{name:'全选',exact:true}).click();await page.locator('[data-hbm-action="online-canvas"]').click();
 }else await page.locator('#resultActions [data-online-import="canvas"]').click();
 const dialog=page.getByRole('dialog'),search=dialog.getByRole('searchbox',{name:'搜索已有画布'}),select=dialog.locator('#onlineImportCanvas'),submit=dialog.getByRole('button',{name:'导入',exact:true});
 await select.waitFor();assert.equal(await select.locator('optgroup[label="已有画布"] option').count(),151);
 const calls=f.calls.length;
 await search.fill('ＡＬＰＨＡ');assert.equal(await select.locator('optgroup[label="匹配的已有画布"] option').count(),1);
 assert.equal(await select.inputValue(),'');assert.equal(await submit.isEnabled(),false,'search cannot silently retain the default new canvas');
 assert.match(await dialog.locator('#onlineImportCanvasMatches').textContent(),/找到 1/);
 await search.press('Enter');assert.equal(await select.evaluate(el=>document.activeElement===el),true);assert.equal(f.calls.length,calls,'typing and Enter neither fetch nor save');
 await select.selectOption('project-149');assert.equal(await submit.isEnabled(),true);
 await search.fill('alpha');assert.equal(await select.inputValue(),'project-149','a still-matching explicit selection survives filtering');
 await search.fill('不存在的项目');assert.equal(await select.inputValue(),'');assert.equal(await submit.isEnabled(),false);assert.match(await dialog.locator('#onlineImportCanvasMatches').textContent(),/没有匹配/);
 assert.equal(await select.locator('optgroup[label="新建画布"] option').count(),2,'new creation choices remain reachable');
 await select.selectOption('new:classic');assert.equal(await submit.isEnabled(),true);
 await search.fill('');assert.equal(await select.locator('optgroup[label="已有画布"] option').count(),151);
 await search.fill('alpha');await select.selectOption('project-149');
 await submit.click();await dialog.getByRole('link',{name:'打开画布'}).waitFor();
 const writes=f.calls.filter(c=>c.method==='PUT');assert.equal(writes.length,1);assert.equal(writes[0].path,'/api/canvases/project-149');assert.equal(f.records.get('project-149').nodes.length,mode==='bulk'?5:3);
 assert.equal(f.calls.filter(c=>c.path==='/api/canvases'&&c.method==='POST').length,0);assert.deepEqual(f.errors,[]);
});
test('empty search results without create permission cannot submit',async t=>{
 const f=await online(t),{page}=f;
 await page.evaluate(()=>CanvasSession.context.workspace.permissions=['canvas.read','canvas.edit']);
 await page.locator('#resultActions [data-online-import="canvas"]').click();const dialog=page.getByRole('dialog');
 await dialog.getByRole('searchbox',{name:'搜索已有画布'}).fill('不存在');
 assert.equal(await dialog.locator('#onlineImportCanvas').inputValue(),'');assert.equal(await dialog.getByRole('button',{name:'导入',exact:true}).isEnabled(),false);
 assert.equal(await dialog.locator('optgroup').count(),0);assert.match(await dialog.locator('#onlineImportCanvasMatches').textContent(),/更换关键词。/);
 assert.equal(f.calls.filter(c=>c.method!=='GET').length,0);assert.deepEqual(f.errors,[]);
});
