const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {fixture}=require('./helpers/canvas-browser.cjs');

test('directory menus retain filtering, counts and keyboard focus without business writes',async t=>{
 const {page,writes,errors}=await fixture(t,'classic',false,{directory:true,record:{title:'Alpha'},
  extraRecords:[{id:'b',title:'Beta',kind:'smart',folder_id:'brand',updated_at:2},{id:'c',title:'Gamma',updated_at:3},{id:'d',title:'Delta',updated_at:4}],folders:[{id:'brand',name:'品牌项目'}]});
 const before=writes.length;
 assert.equal(await page.locator('#studioRecentList a').count(),3);
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

test('directory fits small screens and exposes failed-load recovery and reduced motion',async t=>{
 const {page,errors}=await fixture(t,'classic',false,{directory:true});
 for(const theme of ['dark'])for(const width of [320,390,768,1440]){
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
 assert.equal(await page.locator('.studio-start-card').first().evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
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
test('shell defaults expanded, persists collapse and traps/restores mobile navigation focus',async t=>{
 const {page,errors}=await shellFixture(t,null);
 assert.equal(await page.locator('#sidebarLogoToggle').getAttribute('aria-expanded'),'true');
 await page.locator('#sidebarLogoToggle').click();await page.reload();
 assert.equal(await page.locator('#sidebarLogoToggle').getAttribute('aria-expanded'),'false');
 await page.setViewportSize({width:390,height:844});
 await page.locator('#studioMobileMenu').click();
 assert.equal(await page.locator('.stage').evaluate(el=>el.inert),true);
 assert.equal(await page.locator('#studioNewCanvas').evaluate(el=>el===document.activeElement),true);
 await page.locator('#studioNewCanvas').press('Shift+Tab');
 assert.equal(await page.locator('#settings-fold-toggle').evaluate(el=>el===document.activeElement),true);
 await page.locator('#settings-fold-toggle').press('Escape');
 assert.equal(await page.locator('.stage').evaluate(el=>el.inert),false);
 assert.equal(await page.locator('#studioMobileMenu').evaluate(el=>el===document.activeElement),true);
 await page.locator('#studioMobileMenu').click();await page.getByRole('button',{name:'画布首页',exact:true}).click();
 assert.equal(await page.locator('#studioMobileMenu').getAttribute('aria-expanded'),'false');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);
});
