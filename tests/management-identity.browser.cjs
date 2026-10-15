const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');

for(const changed of [true,false])test(`admin ${changed?'identity switch':'ordinary permission denial'} preserves pending form safely`,async t=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage(),requests=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname==='/')return route.fulfill({contentType:'text/html; charset=utf-8',body:fs.readFileSync('management/frontend/index.html','utf8')});
  if(url.pathname.startsWith('/static/')){
   const name=url.pathname.split('/').pop(),file=name==='billing-view.js'?'static/js/'+name:name==='billing-view.css'?'static/css/'+name:'management/frontend/'+name;
   return route.fulfill({contentType:name.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8',body:fs.readFileSync(file,'utf8')});
  }
  requests.push({path:url.pathname,method:request.method(),member:request.headers()['x-member-id']});
  if(url.pathname==='/api/me')return route.fulfill({json:{member:{id:'admin-a',display_name:'Admin A'},permissions:['member.manage'],workspaces:[]}});
  if(url.pathname==='/api/members'&&request.method()==='POST')return route.fulfill({status:changed?409:403,json:{detail:{code:changed?'member_identity_changed':'permission_denied'}}});
  if(url.pathname==='/api/members')return route.fulfill({json:{members:[],next:null}});
  return route.fulfill({json:{manageable_spaces:0,members:{total:0},tasks:{total:0},services:[],maintenance:{mode:'normal'}}});
 });
 await page.goto('http://localhost:8770/');
 await page.getByRole('button',{name:'成员与分配',exact:true}).click();
 await page.getByRole('button',{name:'创建成员',exact:true}).click();
 await page.getByLabel('登录账号',{exact:true}).fill('new-member');await page.getByLabel('显示名称',{exact:true}).fill('Unsubmitted name');
 await page.locator('#confirm-dialog').click();await page.locator('.dialog-error:not([hidden])').waitFor();
 assert.equal(await page.getByLabel('显示名称',{exact:true}).inputValue(),'Unsubmitted name');
 assert.equal(await page.locator('#dialog').evaluate(node=>node.open),true);
 const before=requests.filter(row=>row.method==='POST').length;
 await page.locator('#confirm-dialog').click();await page.waitForFunction(()=>!document.querySelector('#confirm-dialog').disabled);
 assert.equal(requests.filter(row=>row.method==='POST').length,before+(changed?0:1));
 assert.ok(requests.filter(row=>row.path!=='/api/me').every(row=>row.member==='admin-a'));
 if(changed)assert.match(await page.locator('#message').textContent(),/登录账号已改变/);
 assert.deepEqual(errors,[]);
});
