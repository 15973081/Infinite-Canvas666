const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');
const folders=[{id:'brand',name:'品牌项目',parent_id:''},{id:'child',name:'宣传片',parent_id:'brand'},{id:'empty',name:'空文件夹',parent_id:''}];
const open=(page,id)=>page.locator(`[data-folder-card="${id}"] .project-folder-open`);
const back=page=>page.locator('#projectFolderPath').getByRole('button',{name:'全部画布',exact:true}).click();

test('folder cards group projects, preserve search and return position, and never load full video or graphs',async t=>{
 const {page,errors,writes,requests}=await fixture(t,'classic',false,{directory:true,folders,
  extraRecords:[{id:'inside',title:'品牌图片',folder_id:'brand',cover_media:{kind:'image',url:'/test-image.svg'}},{id:'movie',title:'视频草稿',folder_id:'brand',cover_media:{kind:'video',url:'https://media.example.test/original.mp4'}},{id:'nested',title:'子目录画布',folder_id:'child'}]});
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('.project-folder-card').count(),2);
 assert.equal(await page.locator('.canvas-item').count(),1,'filed projects are represented by their folder');
 assert.match(await page.locator('[data-folder-card="brand"] .project-folder-meta').innerText(),/2 个画布 · 1 个子文件夹/);
 assert.equal(await page.locator('[data-folder-card="brand"] .project-folder-mosaic>.studio-canvas-cover').count(),2);
 const before=writes.length;
 const shots=path.resolve('.local/commercial-kickoff');fs.mkdirSync(shots,{recursive:true});
 await page.setViewportSize({width:1440,height:900});await page.screenshot({path:path.join(shots,'project-folders-root.png')});
 await open(page,'brand').press('Enter');
 assert.equal(await page.locator('#gateTitleText').innerText(),'品牌项目');
 assert.equal(await page.locator('.canvas-item').count(),2);
 assert.equal(await page.locator('.project-folder-card').count(),1);
 await page.screenshot({path:path.join(shots,'project-folders-inside.png')});
 await open(page,'child').click();
 assert.equal(await page.locator('.canvas-card-title').innerText(),'子目录画布');
 assert.equal(await page.locator('#projectFolderPath button').count(),3);
 await page.locator('#projectFolderPath').getByRole('button',{name:'品牌项目',exact:true}).click();
 await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='打开文件夹 宣传片');
 await back(page);await open(page,'empty').click();
 assert.equal(await page.locator('.canvas-item,.project-folder-card').count(),0);
 assert.equal(await page.locator('.gate-list-empty').isVisible(),true);
 await back(page);
 await page.getByRole('searchbox').fill('品牌');
 assert.equal(await page.locator('.project-folder-card').count(),1);
 assert.equal(await page.locator('.canvas-card-title').innerText(),'品牌图片','search includes filed canvases');
 await open(page,'brand').click();assert.equal(await page.getByRole('searchbox').inputValue(),'');
 await back(page);assert.equal(await page.getByRole('searchbox').inputValue(),'品牌');
 assert.equal(writes.length,before,'browsing is read only');
 assert.equal(requests.some(url=>url.includes('original.mp4')),false);
 assert.equal(requests.some(url=>/^\/api\/canvases\/(inside|movie|nested)$/.test(url)),false);
 assert.deepEqual(errors,[]);
});

test('returning from a folder restores root scroll across reload and stale folders fall back to root',async t=>{
 const many=Array.from({length:24},(_,i)=>({id:'f'+i,name:'项目 '+i,parent_id:''}));
 const {page,errors}=await fixture(t,'classic',false,{directory:true,folders:many});
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.locator('#canvasGate').evaluate(el=>el.scrollTop=320);
 const scroll=await page.locator('#canvasGate').evaluate(el=>el.scrollTop);assert.ok(scroll>0);
 await open(page,'f12').evaluate(el=>el.click());
 await page.waitForFunction(()=>document.getElementById('canvasGate').scrollTop===0);
 await page.reload();await page.waitForFunction(()=>document.getElementById('gateTitleText').textContent==='项目 12');
 await back(page);await page.waitForFunction(scroll=>document.getElementById('canvasGate').scrollTop===scroll,scroll);
 await open(page,'f12').evaluate(el=>el.click());
 await page.route('**/api/canvas-folders',route=>route.fulfill({json:{folders:[]}}));
 await page.getByRole('button',{name:'刷新列表',exact:true}).click();
 await page.waitForFunction(()=>document.getElementById('gateTitleText').textContent==='全部画布');
 assert.equal(await page.locator('#projectFolderPath').isVisible(),false);
 assert.deepEqual(errors,[]);
});

test('folder menu rename, child creation, canvas creation and deletion reuse existing scoped operations',async t=>{
 const state=folders.map(folder=>({...folder}));const calls=[];
 const {page,errors}=await fixture(t,'classic',false,{directory:true,folders:state});
 await page.route('**/api/canvas-folders/**',async route=>{
  const request=route.request(),id=new URL(request.url()).pathname.split('/').at(-1);calls.push({id,method:request.method()});
  if(request.method()==='PATCH'){Object.assign(state.find(f=>f.id===id),request.postDataJSON());return route.fulfill({json:{folders:state}});}
  if(request.method()==='DELETE'){const index=state.findIndex(f=>f.id===id),parent=state[index].parent_id;state.splice(index,1);state.filter(f=>f.parent_id===id).forEach(f=>f.parent_id=parent);return route.fulfill({json:{folders:state}});}
  return route.fallback();
 });
 await page.route('**/api/canvas-folders',route=>{
  if(route.request().method()!=='POST')return route.fulfill({json:{folders:state}});
  const body=route.request().postDataJSON();calls.push(body);const folder={id:'new-child',...body};state.push(folder);return route.fulfill({json:{folder,folders:state}});
 });
 const menu=page.locator('[data-folder-card="brand"] details');
 await menu.locator('summary').click();await menu.getByRole('button',{name:'重命名',exact:true}).click();
 await page.locator('#canvasNameField').fill('新品牌');await page.getByRole('button',{name:'保存',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await open(page,'brand').getAttribute('aria-label'),'打开文件夹 新品牌');
 await menu.locator('summary').click();await menu.getByRole('button',{name:'新建子文件夹',exact:true}).click();
 await page.locator('#canvasNameField').fill('本周');await page.getByRole('button',{name:'创建',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.locator('#gateTitleText').innerText(),'本周');
 assert.deepEqual(calls.at(-1),{name:'本周',parent_id:'brand'});
 let creation;
 await page.route('**/api/canvases',route=>{if(route.request().method()!=='POST')return route.fallback();creation=route.request().postDataJSON();return route.fulfill({json:{canvas:{id:'created'}}});});
 await page.evaluate(()=>{CanvasNavigation={...CanvasNavigation,go:async()=>true};});
 await page.locator('.project-new-card').click();await page.locator('#canvasNameField').fill('本周画布');await page.getByRole('button',{name:'创建画布',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(creation.folder_id,'new-child');
 await back(page);await menu.locator('summary').click();page.once('dialog',dialog=>dialog.accept());
 await menu.getByRole('button',{name:'删除文件夹',exact:true}).click();
 await open(page,'brand').waitFor({state:'detached'});
 assert.equal(await open(page,'child').isVisible(),true,'existing deletion reparents children instead of deleting contents');
 assert.equal(await open(page,'new-child').isVisible(),true);
 assert.deepEqual(errors,[]);
});

test('dropping a canvas on a folder moves it once, while denied moves restore the root card',async t=>{
 const {page,errors,record}=await fixture(t,'classic',false,{directory:true,folders});
 let denied=true;const moves=[];
 await page.route('**/api/canvases/canvas-test/folder',route=>{
  const body=route.request().postDataJSON();moves.push(body);
  if(denied)return route.fulfill({status:403,json:{detail:'没有移动权限'}});
  record.folder_id=body.folder_id;return route.fulfill({json:{canvas:record}});
 });
 async function drop(){await page.locator('[data-folder-card="brand"]').evaluate(el=>{const data=new DataTransfer();data.setData('text/canvas-id','canvas-test');el.dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true}));});}
 await drop();await page.getByText('没有移动权限',{exact:true}).last().waitFor();
 assert.equal(await page.locator('.canvas-item').count(),1);
 denied=false;await drop();await page.waitForFunction(()=>!document.querySelector('.canvas-item'));
 await open(page,'brand').click();assert.equal(await page.locator('.canvas-item').count(),1);
 assert.deepEqual(moves,[{folder_id:'brand'},{folder_id:'brand'}]);
 assert.deepEqual(errors,[]);
});
