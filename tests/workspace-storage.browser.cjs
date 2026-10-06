const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),origin='http://storage.test';
const data={workspace_id:'team',scope:'registered_media',bytes:3221225472,files:25,unknown_files:0,retained_bytes:0,pending_files:2,quota_bytes:null,
 by_kind:{image:{bytes:1073741824,files:20},video:{bytes:2147483648,files:5}},updated_at:'2026-10-07T00:00:00Z'};
async function fixture(t){
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],requests=[];
 let result=data,status=200;
 page.on('pageerror',error=>errors.push(error.message));
 const html='<html class="theme-dark" data-theme="dark"><head><meta charset="utf-8"><link rel="stylesheet" href="/static/css/member-session.css"><link rel="stylesheet" href="/static/css/studio-workbench.css"><script src="/static/js/member-session.js"></script></head><body class="studio-skin"><iframe src="/child" title="创作"></iframe></body></html>';
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin)return route.abort();
  if(url.pathname==='/')return route.fulfill({body:html,contentType:'text/html'});
  if(url.pathname==='/child')return route.fulfill({body:html.replace(/<iframe.*?<\/iframe>/,''),contentType:'text/html'});
  if(url.pathname==='/api/auth/status')return route.fulfill({json:{authenticated:true,mode:'members',member:{id:'member',display_name:'团队成员'}}});
  if(url.pathname==='/api/auth/workspaces')return route.fulfill({json:{workspaces:[{id:'team',name:'团队创作工作空间',permissions:['canvas.read']}]}});
  if(url.pathname==='/api/workspace/storage'){requests.push(request.headers());return route.fulfill({status,json:result});}
  const file=path.resolve(root,'.'+url.pathname);
  if(file.startsWith(root+path.sep)&&fs.existsSync(file))return route.fulfill({path:file});
  return route.fulfill({status:404,body:''});
 });
 await page.goto(origin);await page.waitForFunction(()=>document.querySelector('.member-space-usage-brief')?.textContent==='素材 3 GB');
 return {page,errors,requests,setResult:(value,code=200)=>{result=value;status=code;}};
}
test('workspace usage is scoped, cached, accessible and fits dark/light/mobile views',async t=>{
 const {page,errors,requests}=await fixture(t);
 await page.frameLocator('iframe').locator('body').waitFor();
 await page.waitForFunction(()=>document.querySelector('iframe').contentWindow.CanvasSession?.context);
 assert.equal(requests.length,1,'embedded pages must not query usage again');
 assert.equal(requests[0]['x-workspace-id'],'team');assert.equal(requests[0]['x-member-id'],'member');
 await page.locator('.member-session-space').click();
 assert.equal(await page.locator('.member-storage-total').textContent(),'3 GB');
 assert.match(await page.locator('.member-storage-status').textContent(),/25 个文件.*未设配额.*2 个上传/);
 assert.match(await page.locator('.member-storage-breakdown').innerText(),/视频\s+2 GB · 5 个/);
 assert.match(await page.locator('.member-storage-note').innerText(),/不含外链、数据库/);
 await page.locator('.member-session-space').press('Escape');
 assert.equal(await page.locator('.member-session-spaces').getAttribute('open'),null);
 assert.equal(await page.locator('.member-session-space').evaluate(el=>el===document.activeElement),true);
 for(const theme of ['dark','light'])for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:844});await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.classList.toggle('theme-dark',theme==='dark');},theme);
  await page.locator('.member-session-space').click();
  assert.equal(await page.locator('.member-space-menu').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}),true,theme+width);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,theme+width);
  if(width===390){const dir=path.join(root,'docs/design/workspace-storage');fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,'storage-'+theme+'-mobile.png')});}
  await page.locator('.member-session-space').press('Escape');
 }
 assert.equal(requests.length,1,'opening the menu within a minute reuses its snapshot');assert.deepEqual(errors,[]);
});
test('usage refresh retains previous data on failure, retries and distinguishes zero from errors',async t=>{
 const {page,setResult,requests}=await fixture(t);await page.locator('.member-session-space').click();
 setResult({detail:'offline'},503);await page.getByRole('button',{name:'刷新用量',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.member-storage-status').textContent.includes('更新失败'));
 assert.equal(await page.locator('.member-storage-total').textContent(),'3 GB');
 setResult({...data,bytes:0,files:0,pending_files:0,by_kind:{}});await page.getByRole('button',{name:'刷新用量',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.member-storage-total').textContent==='0 B');
 assert.equal(await page.locator('.member-storage-composition').isVisible(),false);assert.equal(requests.length,3);
});
