const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');
const root=path.resolve(__dirname,'..');

test('approved dock, folder overlay and canvas badges render in the real workbench',async t=>{
 const {page,errors}=await fixture(t,'classic',false,{home:true,startPath:'/static/index.html',folders:[{id:'brand',name:'品牌项目'}],record:{title:'深度视频',kind:'smart',cover_media:{kind:'video',url:'/output/video.mp4',thumbnail:'/test-image.svg'}},extraRecords:Array.from({length:5},(_,i)=>({id:'canvas-'+i,title:'画布 '+i,kind:i%2?'classic':'smart',cover_media:i===0?{kind:'video',url:'/output/video.mp4',thumbnail:'/test-image.svg'}:undefined}))});
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:1440,height:1000});
 const rail=page.locator('#studioSidebar'),buttons=rail.locator('.nav-item,.settings-fold-toggle');
 assert.equal(await buttons.count(),6);assert.equal(await rail.evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(18, 18, 21, 0.9)');assert.equal(await rail.evaluate(n=>getComputedStyle(n).borderRadius),'16px');
 assert.equal(await buttons.first().evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(34, 34, 40)');assert.equal(await buttons.nth(1).evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)');
 assert.deepEqual(await buttons.locator('svg').evaluateAll(nodes=>nodes.map(n=>[getComputedStyle(n).width,getComputedStyle(n).strokeWidth,n.hasAttribute('data-tabler')])),Array.from({length:6},()=>['18px','1.65px',false]));
 await buttons.nth(1).hover();const tooltip=page.locator('#studioRailTooltip');await tooltip.waitFor();
 const tip=await tooltip.boundingBox(),dock=await rail.boundingBox();assert.equal(tip.x-dock.x-dock.width,10);assert.equal(await tooltip.evaluate(n=>getComputedStyle(n).fontSize),'11px');
 await buttons.nth(1).click();await page.mouse.move(1200,950);assert.equal(await buttons.first().evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)');assert.equal(await buttons.nth(1).evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(34, 34, 40)');
 await buttons.first().click();const home=page.frameLocator('#frame-canvas');await home.locator('.project-folder-card').waitFor();
 assert.equal(await home.locator('.project-heading-mark').isVisible(),false);assert.equal(await home.locator('.gate-title').evaluate(n=>getComputedStyle(n).fontSize),'20px');
 await home.locator('.project-folder-card').hover();
 const overlay=await home.locator('.project-folder-mosaic').evaluate(n=>{const c=getComputedStyle(n,'::before');return [c.backgroundColor,c.backdropFilter,c.opacity];});assert.deepEqual(overlay,['rgba(0, 0, 0, 0.35)','blur(2px)','1']);
 assert.equal(await home.locator('.project-folder-enter').evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(24, 24, 28, 0.9)');
 assert.equal(await home.locator('.canvas-cover-kind').count(),1);
 const badges=await home.locator('.studio-card-type,.canvas-cover-kind').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect(),p=n.closest('.canvas-open').getBoundingClientRect();return b.top>=p.top&&b.left>=p.left&&b.right<=p.right&&b.bottom<=p.bottom;}));assert.ok(badges.length>=6&&badges.every(Boolean));
 fs.mkdirSync('.local/interface-polish',{recursive:true});await page.screenshot({path:'.local/interface-polish/canvas-dock.png',fullPage:true});assert.deepEqual(errors,[]);
});

test('canvas filters keep their actions with neutral rounded dropdowns',async t=>{
 const {page,errors}=await fixture(t,'classic',true,{directory:true,folders:[{id:'brand',name:'品牌项目'}]});
 await page.locator('#studioFolderTrigger').click();const folder=page.locator('#studioFolderMenu');
 assert.equal(await folder.evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(20, 20, 24, 0.95)');
 assert.equal(await folder.evaluate(n=>getComputedStyle(n).borderRadius),'12px');
 await page.locator('[data-folder-id="brand"] .gate-folder-main').click();assert.equal(await page.locator('#studioFolderLabel').textContent(),'品牌项目');
 await page.locator('#studioSortTrigger').click();fs.mkdirSync('.local/custom-select',{recursive:true});await page.screenshot({path:'.local/custom-select/canvas-sort-open.png',fullPage:true});
 await page.locator('[data-sort="name"]').click();assert.equal(await page.locator('#studioSortLabel').textContent(),'名称');
 await page.locator('#studioSortTrigger').press('ArrowDown');await page.keyboard.press('Escape');assert.equal(await page.locator('#studioSortTrigger').getAttribute('aria-expanded'),'false');assert.deepEqual(errors,[]);
});

test('unified creation keeps kind and folder through a failed submission and sends one retry',async t=>{
 const {page,errors}=await fixture(t,'classic',true,{directory:true,folders:[{id:'brand',name:'品牌项目'}]});
 const posts=[];let fail=true;
 await page.route('**/api/canvases',route=>{
  if(route.request().method()!=='POST')return route.fallback();
  posts.push(route.request().postDataJSON());return route.fulfill({status:fail?409:200,json:fail?{detail:'暂时无法创建'}:{canvas:{id:'created'}}});
 });
 await page.evaluate(()=>{window.CanvasNavigation={...CanvasNavigation,go:async url=>{window.createdDestination=url;return true;}};});
 await page.locator('#studioFolderTrigger').click();await page.locator('[data-folder-id="brand"] .gate-folder-main').click();
 await page.locator('#gateCreateBtn').click();
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
 await page.locator('#gateBackBtn').click();await page.locator('#gateCreateBtn').waitFor();
 assert.equal(requests.some(url=>url==='/output/movie.mp4'),false);assert.equal(requests.some(url=>/\/api\/canvases\/(canvas-test|second)$/.test(url)),false);assert.deepEqual(errors,[]);
});

test('member homepage rail, wallet and catalog remain usable across desktop sizes',async t=>{
 const {page,errors}=await fixture(t,'classic',false,{home:true,startPath:'/static/index.html',record:{title:'智能画布',kind:'smart',cover_media:{kind:'image',url:'/test-image.svg'}},extraRecords:[{id:'b',title:'Pixmax 原版交互验收',kind:'smart'},{id:'c',title:'深度视频',kind:'smart'},{id:'d',title:'经典画布',kind:'classic'}]});
 await page.route('**/static/index.html',route=>route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'static/index.html'),'utf8').replace('<head>','<head><link rel="stylesheet" href="/static/css/member-session.css"><script src="/static/js/member-session.js"></script>')}));
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
 assert.equal(await page.locator('.studio-desktop-brand').evaluate(el=>getComputedStyle(el,'::after').color),'rgb(63, 63, 70)');
 await page.locator('.member-session-account>summary').click();
 const menuStyle=await page.locator('.member-session-account-menu').evaluate(el=>{
  const css=getComputedStyle(el);return [css.backgroundColor,css.borderRadius,css.backdropFilter];
 });
 assert.deepEqual(menuStyle,['rgba(18, 18, 21, 0.95)','16px','blur(24px)']);
 await page.locator('.member-session-account>summary').click();
 await page.locator('.member-session-space').click();await page.locator('.member-space-option').waitFor();
 assert.equal(await page.locator('.member-space-option[aria-current=true]').evaluate(el=>getComputedStyle(el).boxShadow),'none');
 assert.equal(await page.locator('.member-space-menu').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(18, 18, 21, 0.95)');
 await page.locator('.member-session-space').press('Escape');
 const home=page.frameLocator('#frame-canvas');await home.locator('#gateCreateBtn').waitFor();
 assert.equal(await page.locator('#sidebarLogoToggle').count(),0);
 const shots=path.join(root,'.local/commercial-kickoff');fs.mkdirSync(shots,{recursive:true});
 for(const width of [1920,1440,1024]){
  await page.setViewportSize({width,height:1000});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const rail=await page.locator('#studioSidebar').boundingBox(),frame=await page.locator('#frame-canvas').boundingBox();
  assert.ok(rail.y>=frame.y && Math.abs(rail.y+rail.height/2-500)<1,`member navigation bounds at ${width}: ${JSON.stringify(rail)}`);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'shell '+width);
  assert.equal(await home.locator('#canvasGate').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'catalog '+width);
  const metrics=await home.locator('.canvas-item').first().evaluate(el=>{
   const r=el.getBoundingClientRect(),cover=el.querySelector('.studio-canvas-cover').getBoundingClientRect();
   return {width:r.width,height:r.height,cover:cover.height,info:el.querySelector('.canvas-card-info').getBoundingClientRect().height};
  });
  // The catalog retains its desktop columns with 16:10 thumbnails and a 72px footer.
  if(width!==1024)assert.ok(Math.abs(metrics.width-(width===1920?284.8:262))<1,JSON.stringify(metrics));
  assert.ok(Math.abs(metrics.cover-(metrics.width-2)*10/16)<1,'thumbnail aspect ratio '+width);
  assert.equal(metrics.info,72);
  assert.ok(Math.abs(metrics.cover+metrics.info+2-metrics.height)<1,'cover fills remaining height');
  const header=await home.locator('.gate-head').boundingBox();
  assert.equal(header.height,96,'compact directory header');
  assert.equal(await home.getByRole('button',{name:'新建画布',exact:true}).count(),1);
  const wallet=await page.locator('.member-home-wallet').boundingBox(),account=await page.locator('.member-session-account').boundingBox();
  assert.ok(wallet.x>=0&&wallet.y>=0&&account.x+account.width<=width+1&&wallet.x+wallet.width<=account.x+1,'account controls '+width);
  if([1440,1920].includes(width))await page.screenshot({path:path.join(shots,'project-home-'+width+'.png')});
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.emulateMedia({reducedMotion:'no-preference'});
 const firstCard=home.locator('.canvas-item').first(),overlay=firstCard.locator('.project-card-enter');
 await firstCard.hover();
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('#frame-canvas').contentDocument.querySelector('.project-card-enter')).opacity==='1');
 assert.equal(await overlay.evaluate(el=>getComputedStyle(el).transitionDuration),'0.2s');
 assert.equal(await overlay.evaluate(el=>getComputedStyle(el).transitionTimingFunction),'cubic-bezier(0.4, 0, 0.2, 1)');
 await page.screenshot({path:path.join(shots,'project-home-hover-aligned.png')});
 await firstCard.locator('.studio-card-menu summary').click();
 assert.equal(await firstCard.locator('.studio-card-menu').getAttribute('open'),'');
 await firstCard.locator('.studio-card-menu summary').press('Escape');
 assert.equal(await firstCard.locator('.studio-card-menu').getAttribute('open'),null);
 await page.mouse.move(800,60);
 await firstCard.locator('.canvas-open').focus();
 assert.equal(await overlay.evaluate(el=>getComputedStyle(el).opacity),'1');
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await overlay.evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
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
