const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {fixture}=require('./helpers/canvas-browser.cjs');

test('directory menus retain filtering, counts and keyboard focus without business writes',async t=>{
 const {page,writes,errors}=await fixture(t,'classic',false,{directory:true,record:{title:'Alpha'},
  extraRecords:[{id:'b',title:'Beta',kind:'smart',folder_id:'brand',updated_at:2},{id:'c',title:'Gamma',updated_at:3},{id:'d',title:'Delta',updated_at:4}],folders:[{id:'brand',name:'品牌项目'}]});
 const before=writes.length;
 assert.equal(await page.locator('#studioRecent').count(),0);
 assert.equal(await page.locator('.project-new-card').count(),1);
 await page.locator('#studioFolderTrigger').press('ArrowDown');
 assert.equal(await page.locator('.gate-folder-node.active .gate-folder-main').evaluate(el=>el===document.activeElement),true);
 await page.locator('.gate-folder-node.active .gate-folder-main').press('End');
 await page.locator('[data-folder-id="brand"] .gate-folder-main').press('Enter');
 assert.equal(await page.locator('#studioFolderLabel').textContent(),'品牌项目');
 assert.equal(await page.locator('#studioFolderMenu').isVisible(),false);
 assert.equal(await page.locator('#studioFolderTrigger').evaluate(el=>el===document.activeElement),true);
 assert.equal(await page.locator('#gateCanvasList .canvas-item').count(),1);
 assert.equal(await page.locator('#studioRecent').isVisible(),false);
 await page.locator('#studioSortTrigger').click();
 await page.locator('[data-sort="name"]').click();
 assert.equal(await page.locator('#studioSortLabel').textContent(),'名称');
 await page.locator('#studioFolderTrigger').press('ArrowDown');
 await page.locator('.gate-folder-main').first().press('Escape');
 assert.equal(await page.locator('#studioFolderMenu').isVisible(),false);
 assert.equal(writes.length,before);assert.deepEqual(errors,[]);
});

test('directory fits desktop screens and exposes failed-load recovery and reduced motion',async t=>{
 const {page,errors}=await fixture(t,'classic',false,{directory:true});
 for(const theme of ['dark'])for(const width of [1024,1280,1440]){
  await page.setViewportSize({width,height:900});

  assert.equal(await page.locator('#canvasGate').evaluate(el=>el.scrollWidth<=el.clientWidth),true,`${theme} ${width}`);
  await page.locator('#studioFolderTrigger').click();
  assert.equal(await page.locator('#studioFolderMenu').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}),true);
  await page.locator('#studioFolderTrigger').press('Escape');
 }
 await page.evaluate(()=>CanvasHome.setLoadState('error',()=>CanvasHome.setLoadState('ready')));
 assert.match(await page.locator('#studioHomeFeedback').innerText(),/加载失败/);
 await page.getByRole('button',{name:'重新加载',exact:true}).click();
 assert.equal(await page.locator('#studioHomeFeedback').isVisible(),false);
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('.project-new-card').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
 assert.deepEqual(errors,[]);
});

test('directory create waits for initialization and has no document to flush',async t=>{
 const {page,errors}=await fixture(t,'classic',false,{directory:true});
 await page.evaluate(()=>CanvasHome.beginCreate());
 assert.equal(await page.locator('#canvasNameField').isVisible(),true);
 assert.equal(await page.evaluate(()=>typeof canvas),'undefined');
 await page.getByRole('button',{name:'取消',exact:true}).click();
 assert.deepEqual(errors,[]);
});

async function shellFixture(t,stored){
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(stored=>{if(stored!==null)localStorage.setItem('studio_sidebar_pinned',stored);window.WebSocket=class extends EventTarget{close(){}};},stored);
 const root=path.resolve(__dirname,'..'),origin='http://workbench.test';
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(u.pathname.startsWith('/api/'))return route.fulfill({json:u.pathname==='/api/canvases'?{canvases:[]}:u.pathname==='/api/canvas-folders'?{folders:[]}:{}});const file=path.resolve(root,'.'+u.pathname);if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({path:file});return route.fulfill({status:404,body:''});});
 await page.goto(origin+'/static/index.html');await page.waitForFunction(()=>document.querySelector('#frame-canvas').contentWindow?.CanvasHome);
 return {page,errors};
}

test('icon rail has hover and keyboard labels, two SVG states and stable navigation',async t=>{
 const {page,errors}=await shellFixture(t,null);
 await page.emulateMedia({reducedMotion:'reduce'});
 const home=page.locator('[data-page="canvas"]'),chat=page.locator('[data-page="gpt-chat"]');
 const tooltip=page.locator('#studioRailTooltip');
 const opacity=el=>getComputedStyle(el).opacity;
 assert.equal(await home.getAttribute('aria-current'),'page');
 assert.equal(await chat.locator('.studio-rail-symbol svg').count(),2);
 assert.equal(await chat.locator('.studio-rail-outline').evaluate(opacity),'1');
 assert.equal(await chat.locator('.studio-rail-accent').evaluate(opacity),'0');
 await chat.hover();
 await tooltip.waitFor({state:'visible'});
 assert.equal(await tooltip.textContent(),'AI 对话');
 assert.equal(await chat.getAttribute('title'),null);
 assert.equal(await chat.locator('.studio-rail-accent').evaluate(opacity),'1');
 assert.equal(await chat.evaluate(el=>getComputedStyle(el).color),'rgb(76, 226, 243)');
 await tooltip.hover();
 assert.equal(await tooltip.isVisible(),true,'label remains readable while hovered');
 await page.keyboard.press('Escape');
 assert.equal(await tooltip.isVisible(),false);
 await chat.focus();
 assert.equal(await chat.getAttribute('aria-describedby'),'studioRailTooltip');
 assert.equal(await tooltip.isVisible(),true);
 await chat.press('Enter');
 await page.waitForFunction(()=>document.querySelector('[data-page="gpt-chat"]').getAttribute('aria-current')==='page');
 assert.equal(await home.getAttribute('aria-current'),null);
 assert.equal(await tooltip.isVisible(),false);
 assert.equal(await page.locator('#frame-gpt-chat').getAttribute('class'),'active');
 assert.equal(await page.locator('#studioSidebar').evaluate(el=>el.getBoundingClientRect().width),88);
 await home.click();
 await chat.hover();
 fs.mkdirSync(path.resolve('.local/commercial-kickoff'),{recursive:true});
 await page.screenshot({path:path.resolve('.local/commercial-kickoff/project-icon-rail.png')});
 await page.mouse.move(400,50);
 await tooltip.waitFor({state:'hidden'});
 await chat.focus();
 await page.setViewportSize({width:390,height:844});
 assert.equal(await tooltip.isVisible(),false);
 assert.equal(await page.locator('.app-shell').isVisible(),false);
 assert.deepEqual(errors,[]);
});

test('settings keeps the server-controlled management link in the icon rail',async t=>{
 const {page,errors}=await shellFixture(t,null);
 assert.equal(await page.locator('#management-entry').getAttribute('hidden'),'');
 await page.route('**/api/management-entry',route=>route.fulfill({json:{url:'https://manage.example.test/'}}));
 await page.reload();
 await page.waitForFunction(()=>!document.getElementById('management-entry').hidden);
 const settings=page.getByRole('button',{name:'更多设置',exact:true});
 await settings.click();
 const link=page.getByRole('link',{name:'管理平台',exact:true});
 await link.waitFor({state:'visible'});
 assert.equal(await link.getAttribute('href'),'https://manage.example.test/');
 await link.focus();
 assert.equal(await page.locator('#studioRailTooltip').textContent(),'管理平台');
 assert.equal(await page.locator('#studioSidebar').evaluate(el=>el.getBoundingClientRect().width),88);
 await settings.click();
 assert.equal(await link.isVisible(),false);
 assert.deepEqual(errors,[]);
});
test('shell ignores old expansion preferences and preserves its frame behind the narrow-screen notice',async t=>{
 const {page,errors}=await shellFixture(t,'1');
 assert.equal(await page.locator('#sidebarLogoToggle,#studioMobileMenu').count(),0);
 assert.equal(await page.locator('#studioSidebar').evaluate(el=>el.getBoundingClientRect().width),88);
 await page.reload();
 assert.equal(await page.locator('#studioSidebar.is-pinned').count(),0);
 await page.evaluate(()=>{window.homeFrameBefore=document.querySelector('#frame-canvas').contentWindow;});
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('heading',{name:'请使用桌面端访问'}).waitFor();
 assert.equal(await page.locator('.app-shell').isVisible(),false);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.setViewportSize({width:1440,height:900});
 assert.equal(await page.locator('.studio-desktop-required').isVisible(),false);
 assert.equal(await page.locator('#studioSidebar').evaluate(el=>el.getBoundingClientRect().width),88);
 assert.equal(await page.evaluate(()=>homeFrameBefore===document.querySelector('#frame-canvas').contentWindow),true);
 assert.deepEqual(errors,[]);
});
