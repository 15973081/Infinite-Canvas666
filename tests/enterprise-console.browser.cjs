const {chromium}=require('playwright');const assert=require('assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const tenants=[{id:'acme',name:'星河设计',status:'active',role:'admin',version:1},{id:'beta',name:'远山科技',status:'active',role:'admin',version:1}];
await page.route('**/api/**',async r=>{const p=new URL(r.request().url()).pathname;let data;
if(p==='/api/me')data={member:{id:'admin',display_name:'企业管理员'},console_mode:'enterprise',permissions:[],workspaces:[],tenants};
else if(p==='/api/tenants')data={tenants:tenants.map(t=>({...t,members:1,spaces:1})),can_create:false,delivery_configured:false};
else if(p.endsWith('/models'))data={catalog:[],grants:[],space_grants:[],can_grant:false,legacy:false};
else if(p.endsWith('/billing'))data={totals:[],accounts:[],entries:[],records:0,page:1,pages:1};
else if(p==='/api/account/email')data={email:null,delivery_configured:false};
else if(p.startsWith('/api/tenants/'))data={tenant:tenants.find(t=>p.endsWith(t.id)),members:[{id:'admin',display_name:'企业管理员',username:'admin',status:'active',role:'admin'}],spaces:[{id:'studio',name:'设计空间',status:'active'}],invitations:[],can_suspend:false};
else throw Error('Unexpected platform request '+p);
await r.fulfill({json:data});});
await page.goto('http://127.0.0.1:8770/');await page.getByRole('heading',{name:'企业概览',exact:true}).waitFor();
assert.equal(await page.getByRole('button',{name:'供应商与分配',exact:true}).count(),0);
await page.screenshot({path:'.local/enterprise-console.png',fullPage:true});
for(const name of ['成员管理','空间管理','可用模型','企业费用','企业设置']){await page.getByRole('button',{name,exact:true}).click();await page.waitForFunction(()=>document.querySelector('#content').getAttribute('aria-busy')==='false');assert.ok(!(await page.locator('#content').innerText()).includes('加载失败'));}
await page.locator('#scope').selectOption('beta');await page.waitForFunction(()=>document.querySelector('#content').innerText.includes('远山科技'));
await page.getByRole('searchbox').fill('供应商');assert.equal(await page.locator('#admin-navigation [data-view]:visible').count(),0);await page.getByRole('searchbox').fill('');
await page.getByRole('button',{name:'邮箱与登录',exact:true}).click();await page.getByRole('heading',{name:'邮箱与登录',exact:true}).last().waitFor();
assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);console.log('PASS: enterprise landing, six sections, tenant switching, restricted search, account page');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
