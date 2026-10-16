const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
async function setup(t){
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1600,height:1050}}),errors=[],calls=[];page.setDefaultTimeout(5000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.pathname==='/')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<html lang="zh-CN"><head><meta charset="utf-8"></head><body><button id="open">账户</button><script src="/static/js/account-panel.js"></script></body></html>'});
  if(url.pathname.startsWith('/static/'))return route.fulfill({path:path.resolve('.'+url.pathname)});
  calls.push({path:url.pathname,method:req.method(),headers:req.headers(),query:Object.fromEntries(url.searchParams)});
  if(url.pathname==='/api/account/credits')return route.fulfill({json:{wallet:{total_balance:'9007199254740993',recharge_balance:'0',gift_balance:'9007199254740993'},page:1,pages:1,records:1,entries:[{type:'ADD',amount:'125',balance_after:'9007199254740993',remaining_amount:'125',category:'gift',source:'PLATFORM_GIFT',validity:'PERMANENT',created_at:1792000000000,note:'<img src=x onerror=alert(1)>'}]}});
  if(url.pathname==='/api/account/tasks')return route.fulfill({json:{page:Number(url.searchParams.get('page')||1),pages:2,records:26,entries:[{id:'task-'+(url.searchParams.get('page')||1),kind:'image',model:'test',status:url.searchParams.get('status')||'succeeded',created_at:1792000000000}]}});
  if(url.pathname==='/api/account/billing')return route.fulfill({json:{page:1,pages:1,records:0,totals:[],entries:[],workspaces:[]}});
  return route.fulfill({json:{}});
 });
 await page.goto('http://localhost:8770/');
 await page.evaluate(()=>{
  window.saved=[];window.CanvasSession={enabled:true,paused:false,context:{member:{id:'member-a',username:'test-account',display_name:'测试成员',avatar:''}},async updateProfile(data){saved.push(data);this.context.member={...this.context.member,...data};window.dispatchEvent(new Event('member-session:profile'));}};
  document.querySelector('#open').onclick=()=>CanvasAccountPanel.show();
 });
 await page.click('#open');
 return {page,errors,calls};
}

test('account panels share navigation, precise real balance and persistent profile editing',async t=>{
 const {page,errors,calls}=await setup(t);const dialog=page.getByRole('dialog',{name:'账户管理',exact:true});
 for(const name of ['个人资料','积分充值','账单发票','积分明细','任务明细','企业认证'])assert.equal(await dialog.getByRole('button',{name,exact:true}).count(),1,name+' '+JSON.stringify(errors));
 await dialog.getByText('积分余额： 9,007,199,254,740,993',{exact:true}).waitFor();
 await dialog.getByLabel('昵称',{exact:true}).fill('修改后昵称');await dialog.getByRole('button',{name:'保存资料',exact:true}).click();
 await dialog.getByText('资料已保存',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>saved[0].display_name),'修改后昵称');
 assert.equal(await dialog.locator('.account-identity strong').textContent(),'修改后昵称');
 await dialog.getByRole('button',{name:'积分明细',exact:true}).click();await dialog.getByText('赠送积分 / 平台赠送',{exact:true}).waitFor();
 assert.equal(await dialog.locator('img').count(),0);assert.ok(calls.every(c=>c.headers['x-member-id']==='member-a'));
 assert.deepEqual(errors,[]);
});

test('topup matches reference tiers without payment writes or fabricated first-purchase eligibility',async t=>{
 const {page,errors,calls}=await setup(t);await page.getByRole('button',{name:'积分充值',exact:true}).click();
 const summary=page.locator('.account-topup-summary');
 assert.match(await summary.textContent(),/1,035/);assert.match(await summary.textContent(),/155/);assert.match(await summary.textContent(),/1,190/);
 await page.getByRole('button',{name:'399 元充值方案',exact:true}).click();assert.match(await summary.textContent(),/7,780/);
 await page.getByLabel('其他金额',{exact:true}).fill('4999');assert.match(await summary.textContent(),/127,474/);
 await page.getByLabel('其他金额',{exact:true}).fill('1.5');assert.match(await summary.textContent(),/整数/);
 assert.equal(calls.some(c=>c.method!=='GET'),false);assert.equal(await page.locator('img').count(),0);assert.deepEqual(errors,[]);
});

test('tasks filter and page without inventing credit consumption, and usage costs remain accessible',async t=>{
 const {page,calls,errors}=await setup(t);await page.getByRole('button',{name:'任务明细',exact:true}).click();await page.getByText('task-1',{exact:true}).waitFor();
 await page.getByRole('button',{name:'下一页',exact:true}).click();await page.getByText('task-2',{exact:true}).waitFor();
 await page.getByLabel('任务状态',{exact:true}).selectOption('failed');await page.getByText('task-1',{exact:true}).waitFor();
 assert.equal(calls.filter(c=>c.path==='/api/account/tasks').at(-1).query.status,'failed');
 assert.equal(await page.getByText('未接入积分结算',{exact:true}).count(),1);
 await page.getByRole('button',{name:'查看使用费用',exact:true}).click();await page.getByText('暂无费用记录',{exact:true}).waitFor();assert.deepEqual(errors,[]);
});

test('account session pause clears all private data and prevents late wallet rendering',async t=>{
 const {page,errors}=await setup(t);let release;
 await page.route('**/api/account/credits?category=*',async route=>{await new Promise(r=>release=r);try{await route.fulfill({json:{wallet:{total_balance:'777',recharge_balance:'777',gift_balance:'0'},entries:[],page:1,pages:1,records:0}});}catch{}});
 const sent=page.waitForRequest(r=>r.url().includes('category='));await page.getByRole('button',{name:'积分明细',exact:true}).click();await sent;
 await page.evaluate(()=>{CanvasSession.paused=true;window.dispatchEvent(new Event('member-session:paused'));});release();
 await page.getByText('登录状态已变化，请关闭后重新确认登录。',{exact:true}).waitFor();
 assert.equal(await page.locator('.account-identity').textContent(),'');assert.equal(await page.locator('.account-panel').getByText('测试成员',{exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'个人资料',exact:true}).isDisabled(),true);assert.deepEqual(errors,[]);
});

test('account panels fit desktop and phone with six reachable tabs',async t=>{
 const {page,errors}=await setup(t);fs.mkdirSync('.local/commercial-kickoff',{recursive:true});
 for(const width of [1600,390]){
  await page.setViewportSize({width,height:1050});await page.getByRole('button',{name:'积分充值',exact:true}).click();
  const bounds=await page.locator('.account-panel').evaluate(n=>({w:n.getBoundingClientRect().width,scroll:n.scrollWidth,client:n.clientWidth,viewport:innerWidth}));assert.ok(bounds.w<=width&&bounds.scroll<=bounds.client,JSON.stringify(bounds));
  await page.screenshot({path:'.local/commercial-kickoff/account-topup-'+width+'.png',fullPage:true});
  await page.getByRole('button',{name:'企业认证',exact:true}).click();await page.getByText('企业认证服务尚未开放，暂不收集营业执照或认证材料。',{exact:true}).waitFor();
 }
 assert.deepEqual(errors,[]);
});
