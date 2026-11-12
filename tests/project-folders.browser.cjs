const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');
const folders=[{id:'brand',name:'品牌项目',parent_id:''},{id:'child',name:'宣传片',parent_id:'brand'},{id:'empty',name:'空文件夹',parent_id:''}];
const open=(page,id)=>page.locator(`[data-folder-card="${id}"] .project-folder-open`);
const back=page=>page.locator('#projectFolderPath').getByRole('button',{name:'全部画布',exact:true}).click();

test('folder and canvas cards align and use the same hover and keyboard focus treatment',async t=>{
 const {page}=await fixture(t,'classic',false,{directory:true,folders:[folders[0]],
  extraRecords:[{id:'smart',title:'智能画布',kind:'smart'},{id:'inside',title:'品牌图片',folder_id:'brand',cover_media:{kind:'image',url:'/test-image.svg'}}]});
 await page.emulateMedia({reducedMotion:'reduce'});
 const cards=page.locator('.gate-list > :is(.project-folder-card,.canvas-item)');
 for(const width of [1024,1440,1920]){
  await page.setViewportSize({width,height:900});
  const metrics=await cards.evaluateAll(items=>items.map(card=>{
   const {top,width,height}=card.getBoundingClientRect();
   const footer=card.querySelector('.project-folder-info,.canvas-card-info');
   return {top,width,height,radius:getComputedStyle(card).borderRadius,footer:footer?.getBoundingClientRect().height};
  }));
  assert.equal(metrics.length,3);
  for(const card of metrics){
   assert.ok(Math.abs(card.height-((card.width-2)*10/16+72+2))<1,JSON.stringify(card));
   assert.ok(Math.abs(card.height-metrics[0].height)<1,JSON.stringify(metrics));
   assert.equal(card.top,metrics[0].top);
   assert.equal(card.radius,'12px');
  }
  assert.deepEqual(metrics.map(card=>card.footer),[72,72,72]);
 }
 const folder=page.locator('.project-folder-card');
 const canvas=page.locator('.canvas-item').first();
 const appearance=card=>card.evaluate(el=>{
  const overlay=getComputedStyle(el.querySelector('.project-folder-enter,.project-card-enter'));
  return [overlay.opacity,overlay.color,overlay.backgroundColor,getComputedStyle(el).borderTopColor];
 });
 const before=await folder.boundingBox();
 await folder.hover();
 const active=['1','rgb(244, 244, 245)','rgba(24, 24, 28, 0.9)','rgba(255, 255, 255, 0.16)'];
 assert.deepEqual(await appearance(folder),active);
 assert.deepEqual(await folder.boundingBox(),before);
 await page.mouse.move(0,0);
 await page.keyboard.press('Tab');
 await canvas.locator('.canvas-open').focus();
 assert.deepEqual(await appearance(canvas),active);
 const surface=await canvas.locator('.studio-canvas-cover').evaluate(el=>{
  const cover=getComputedStyle(el),base=getComputedStyle(el,'::before'),icon=getComputedStyle(el,'::after');
  return {background:cover.backgroundColor,glow:cover.backgroundImage,base:[base.width,base.height,base.borderRadius],icon:[icon.width,icon.height,icon.backgroundColor]};
 });
 assert.equal(surface.background,'rgb(24, 24, 28)');assert.match(surface.glow,/radial-gradient/);
 assert.deepEqual(surface.base,['40px','40px','12px']);assert.deepEqual(surface.icon,['18px','18px','rgb(113, 113, 122)']);
 const mosaic=await folder.locator('.project-folder-mosaic').evaluate(el=>{
  const tiles=[...el.children].filter(child=>!child.classList.contains('project-folder-enter')).map(child=>child.getBoundingClientRect());
  const overlay=getComputedStyle(el,'::before');
  return {sizes:tiles.map(r=>[r.width,r.height]),overlay:overlay.backgroundColor,blur:overlay.backdropFilter,fourth:getComputedStyle(el,'::after').content};
 });
 assert.equal(mosaic.sizes.length,3);
 for(const size of mosaic.sizes)assert.ok(size.every((value,index)=>Math.abs(value-mosaic.sizes[0][index])<1),'mosaic cells have equal dimensions');
 assert.equal(mosaic.fourth,'""');assert.equal(mosaic.overlay,'rgba(0, 0, 0, 0.35)');assert.equal(mosaic.blur,'blur(2px)');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await folder.hover();await page.waitForFunction(()=>getComputedStyle(document.querySelector('.project-folder-card')).top==='-2px');
 await folder.locator('summary').click();
 await page.waitForFunction(()=>document.querySelector('.project-folder-menu[open] .project-folder-actions')?.style.left);
 const menu=await folder.locator('.project-folder-actions').boundingBox();
 const trigger=await folder.locator('summary').boundingBox();
 assert.ok(Math.abs(menu.x+menu.width-trigger.x-trigger.width)<1,'folder menu stays anchored after the hover lift');
 assert.ok(Math.abs(menu.y-trigger.y-trigger.height-6)<1,'folder menu uses viewport coordinates');
});

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
 await page.locator('#gateCreateBtn').click();await page.locator('#canvasNameField').fill('本周画布');await page.getByRole('button',{name:'创建画布',exact:true}).click();
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
