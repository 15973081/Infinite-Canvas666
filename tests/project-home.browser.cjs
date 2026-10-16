const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');
const root=path.resolve(__dirname,'..');

test('unified creation keeps kind and folder through a failed submission and sends one retry',async t=>{
 const {page,errors}=await fixture(t,'classic',true,{directory:true,folders:[{id:'brand',name:'品牌项目'}]});
 const posts=[];let fail=true;
 await page.route('**/api/canvases',route=>{
  if(route.request().method()!=='POST')return route.fallback();
  posts.push(route.request().postDataJSON());return route.fulfill({status:fail?409:200,json:fail?{detail:'暂时无法创建'}:{canvas:{id:'created'}}});
 });
 await page.evaluate(()=>{window.CanvasNavigation={...CanvasNavigation,go:async url=>{window.createdDestination=url;return true;}};});
 await page.locator('#studioFolderTrigger').click();await page.locator('[data-folder-id="brand"] .gate-folder-main').click();
 await page.locator('.project-new-card').click();
 assert.equal(await page.getByRole('radio',{name:/智能画布/}).isChecked(),true);
 await page.locator('#canvasNameField').fill('品牌视觉');
 await page.getByRole('radio',{name:/经典画布/}).check();
 await page.getByRole('button',{name:'创建画布',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'暂时无法创建'}).waitFor();
 assert.equal(await page.getByRole('radio',{name:/经典画布/}).isChecked(),true);
 assert.equal(await page.locator('#canvasNameField').inputValue(),'品牌视觉');
 assert.equal(posts.length,1);assert.equal(posts[0].kind,'classic');assert.equal(posts[0].folder_id,'brand');
 fail=false;await page.getByRole('button',{name:'创建画布',exact:true}).click();
 await page.waitForFunction(()=>window.createdDestination);
 assert.equal(posts.length,2);assert.deepEqual(posts[1],posts[0]);
 assert.match(await page.evaluate(()=>window.createdDestination),/canvases\/created/);
 await page.locator('#gateCreateBtn').click();await page.getByRole('button',{name:'取消',exact:true}).click();
 assert.equal(posts.length,2);assert.deepEqual(errors,[]);
});

test('smart creation, search and trash use the existing catalog without original media fetches',async t=>{
 const {page,errors,requests}=await fixture(t,'classic',true,{directory:true,record:{title:'影片',cover_media:{kind:'video',url:'/output/movie.mp4'}},extraRecords:[{id:'second',title:'图片计划',kind:'smart'}]});
 let payload;
 await page.route('**/api/canvases',route=>{if(route.request().method()!=='POST')return route.fallback();payload=route.request().postDataJSON();return route.fulfill({json:{canvas:{id:'smart-created'}}});});
 await page.evaluate(()=>{window.CanvasNavigation={...CanvasNavigation,go:async()=>true};});
 await page.locator('#gateCreateBtn').click();await page.locator('#canvasNameField').fill('智能项目');await page.getByRole('button',{name:'创建画布',exact:true}).click();
 await page.locator('dialog').waitFor({state:'hidden'});assert.equal(payload.kind,'smart');
 await page.getByRole('searchbox').fill('图片');assert.equal(await page.locator('.canvas-item').count(),1);assert.equal(await page.locator('.project-new-card').count(),0);
 await page.getByRole('searchbox').fill('');await page.locator('#gateTrashBtn').click();
 await page.getByText('回收站为空',{exact:true}).waitFor();assert.equal(await page.locator('.project-new-card').count(),0);assert.equal(await page.locator('#gateCreateBtn').isVisible(),false);
 await page.locator('#gateBackBtn').click();await page.locator('.project-new-card').waitFor();
 assert.equal(requests.some(url=>url==='/output/movie.mp4'),false);assert.equal(requests.some(url=>/\/api\/canvases\/(canvas-test|second)$/.test(url)),false);assert.deepEqual(errors,[]);
});

test('member homepage rail, wallet and catalog remain usable across desktop sizes',async t=>{
 const {page,errors}=await fixture(t,'classic',false,{home:true,startPath:'/static/index.html',record:{title:'智能画布',kind:'smart',cover_media:{kind:'image',url:'/test-image.svg'}},extraRecords:[{id:'b',title:'Pixmax 原版交互验收',kind:'smart'},{id:'c',title:'深度视频',kind:'smart'},{id:'d',title:'经典画布',kind:'classic'}]});
 await page.route('**/static/index.html',route=>route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'static/index.html'),'utf8').replace('</head>','<link rel="stylesheet" href="/static/css/member-session.css"><script src="/static/js/member-session.js"></script></head>')}));
 await page.route('**/api/**',route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/auth/status')return route.fulfill({json:{authenticated:true,mode:'members',member:{id:'member-1',display_name:'创作成员'}}});
  if(url.pathname==='/api/auth/workspaces')return route.fulfill({json:{workspaces:[{id:'workspace-1',name:'共享创作工作区',permissions:['canvas.read','canvas.create','canvas.edit']}]}});
  if(url.pathname==='/api/workspace/storage')return route.fulfill({json:{workspace_id:'workspace-1',bytes:167772160,files:12,unknown_files:0,pending_files:0,retained_bytes:0,quota_bytes:null,by_kind:{},updated_at:'2026-10-16T09:37:00Z'}});
  if(url.pathname==='/api/canvases')return route.fulfill({json:{canvases:[
   {id:'canvas-test',title:'智能画布',kind:'smart',updated_at:1792143420,cover_media:{kind:'image',url:'/test-image.svg'}},
   {id:'b',title:'Pixmax 原版交互验收',kind:'smart',updated_at:1792122480},
   {id:'c',title:'深度视频',kind:'smart',updated_at:1792121580},
   {id:'d',title:'经典画布',kind:'classic',updated_at:1791762360}
  ]}});
  if(url.pathname==='/api/account/credits')return route.fulfill({json:{wallet:{total_balance:'142',recharge_balance:'100',gift_balance:'42'},entries:[],page:1,pages:0,records:0}});
  return route.fallback();
 });
 await page.reload();await page.locator('.member-home-wallet').waitFor();
 await page.emulateMedia({reducedMotion:'reduce'});
 const home=page.frameLocator('#frame-canvas');await home.locator('.project-new-card').waitFor();
 assert.equal(await page.locator('#sidebarLogoToggle').getAttribute('aria-expanded'),'false');
 const shots=path.join(root,'.local/commercial-kickoff');fs.mkdirSync(shots,{recursive:true});
 for(const width of [1920,1440,1024]){
  await page.setViewportSize({width,height:1000});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'shell '+width);
  assert.equal(await home.locator('#canvasGate').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'catalog '+width);
  const wallet=await page.locator('.member-home-wallet').boundingBox(),account=await page.locator('.member-session-account').boundingBox();
  assert.ok(wallet.x>=0&&wallet.y>=0&&account.x+account.width<=width+1&&wallet.x+wallet.width<=account.x+1,'account controls '+width);
  if([1440,1920].includes(width))await page.screenshot({path:path.join(shots,'project-home-'+width+'.png')});
 }
 await home.getByRole('searchbox').fill('深度视频');
 for(const width of [867,390,320]){
  await page.setViewportSize({width,height:844});
  await page.getByRole('heading',{name:'请使用桌面端访问'}).waitFor();
  assert.equal(await page.locator('.app-shell').isVisible(),false);
  assert.equal(await page.locator('.member-session-bar').isVisible(),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(width===867)await page.screenshot({path:path.join(shots,'project-home-desktop-required.png')});
 }
 await page.setViewportSize({width:1440,height:1000});
 assert.equal(await home.getByRole('searchbox').inputValue(),'深度视频');
 await home.getByRole('searchbox').fill('');
 await page.locator('.member-home-wallet').click();await page.getByRole('dialog',{name:'账户管理'}).waitFor();
 await page.getByRole('button',{name:'关闭账户管理'}).click();
 await home.locator('#gateCreateBtn').click();await home.locator('.name-dialog-choices').waitFor();
 await page.screenshot({path:path.join(shots,'project-home-create.png')});
 await home.getByRole('button',{name:'取消',exact:true}).click();
 assert.deepEqual(errors,[]);
});
