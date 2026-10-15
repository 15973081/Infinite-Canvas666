const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
for(const change of ['reduced','revoked','equivalent','network-retry'])test(`management permission check handles ${change} without erasing forms`,async t=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage();let state='initial',writes=0,checks=0;
 await page.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname==='/')return route.fulfill({contentType:'text/html; charset=utf-8',body:fs.readFileSync('management/frontend/index.html','utf8')});
  if(url.pathname.startsWith('/static/')){
   const name=url.pathname.split('/').pop(),file=name==='billing-view.js'?'static/js/'+name:name==='billing-view.css'?'static/css/'+name:'management/frontend/'+name;
   return route.fulfill({contentType:name.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8',body:fs.readFileSync(file,'utf8')});
  }
  if(url.pathname==='/api/me'){
   checks++;
   if(state==='revoked'||state==='network')return route.fulfill({status:state==='revoked'?403:503,json:{detail:{code:state==='revoked'?'management_permission_required':'management_dependency_unavailable'}}});
   return route.fulfill({json:{member:{id:'admin-a',display_name:'Admin A'},permissions:state==='reduced'?['role.manage']:state==='equivalent'?['role.manage','member.manage']:['member.manage','role.manage'],workspaces:[]}});
  }
  if(url.pathname==='/api/members'&&request.method()==='POST'){writes++;return route.fulfill({status:403,json:{detail:{code:'permission_denied'}}});}
  if(url.pathname==='/api/members')return route.fulfill({json:{members:[],next:null}});
  return route.fulfill({json:{manageable_spaces:0,members:{total:0},tasks:{total:0},services:[],maintenance:{mode:'normal'}}});
 });
 await page.goto('http://localhost:8770/');await page.getByRole('button',{name:'成员与分配',exact:true}).click();
 await page.getByRole('button',{name:'创建成员',exact:true}).click();await page.getByLabel('登录账号',{exact:true}).fill('new-member');await page.getByLabel('显示名称',{exact:true}).fill('Keep this draft');
 const check=async()=>{const response=page.waitForResponse(url=>url.url().endsWith('/api/me'),{timeout:1500});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await response;};
 if(change==='network-retry'){state='network';await check();state='reduced';}
 else state=change;
 await check();
 if(change!=='equivalent')await page.getByText('管理权限已改变，本页已暂停操作。请保留未提交内容后刷新页面。',{exact:true}).waitFor({timeout:1500});
 await page.locator('#confirm-dialog').click();await page.locator('.dialog-error:not([hidden])').waitFor();
 assert.equal(writes,change==='equivalent'?1:0);
 assert.equal(await page.getByLabel('显示名称',{exact:true}).inputValue(),'Keep this draft');
 assert.ok(checks>=2);
});
