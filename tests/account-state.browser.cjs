const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('playwright');
async function setup(t){
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.setDefaultTimeout(5000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html style="overflow:auto"><head><link rel="stylesheet" href="/static/css/member-session.css"><script src="/static/js/member-session.js"></script></head><body class="studio-home" style="overflow:auto;margin:0"><main style="height:2400px"><button id="outside">页面内容</button></main></body></html>'});
  if(url.pathname.startsWith('/static/'))return route.fulfill({path:path.resolve('.'+url.pathname)});
  if(url.pathname==='/api/auth/status')return route.fulfill({json:{authenticated:true,mode:'members',member:{id:'member-a',display_name:'成员'}}});
  if(url.pathname==='/api/auth/workspaces')return route.fulfill({json:{workspaces:[{id:'w',name:'工作空间',permissions:['canvas.read']}]}});
  if(url.pathname==='/api/workspace/storage')return route.fulfill({json:{workspace_id:'w',bytes:0,files:0,by_kind:{},updated_at:'2026-11-13T00:00:00Z'}});
  return route.fulfill({json:{}});
 });
 await page.goto('http://account-state.test/');assert.deepEqual(errors,[]);await page.evaluate(()=>CanvasSession.ready);await page.locator('.member-session-account>summary').waitFor();
 await page.evaluate(()=>{
  window.reads=[];const transport=window.fetch;
  window.fetch=(url,options)=>String(url).startsWith('/api/account/credits')?new Promise(resolve=>reads.push({url,options,resolve})):transport(url,options);
  window.completeRead=(index,total)=>reads[index].resolve({ok:true,json:async()=>({wallet:{total_balance:String(total),recharge_balance:String(total),gift_balance:'0'},entries:[],page:1,pages:1,records:0})});
 });
 return {page,errors};
}
test('menu, account header and ledger share ordered wallet snapshots and release subscriptions',async t=>{
 const {page,errors}=await setup(t),trigger=page.locator('.member-session-account>summary');
 await trigger.click();await page.waitForFunction(()=>reads.length===1);
 await trigger.click();await trigger.click();await page.waitForFunction(()=>reads.length===2);
 assert.equal(await page.evaluate(()=>reads[0].options.signal.aborted),true);
 await page.evaluate(()=>completeRead(1,200));await page.getByText('积分余额 200 · 查看明细',{exact:true}).waitFor();
 await page.evaluate(()=>completeRead(0,100));assert.equal(await page.locator('.member-account-balance').textContent(),'积分余额 200 · 查看明细');
 await page.getByRole('button',{name:'账户管理',exact:true}).click();await page.waitForFunction(()=>reads.length===3);
 await page.evaluate(()=>completeRead(2,300));await page.getByText('积分余额： 300',{exact:true}).waitFor();
 await page.getByRole('button',{name:'积分明细',exact:true}).click();await page.waitForFunction(()=>reads.length===4);
 await page.evaluate(()=>completeRead(3,400));await page.waitForFunction(()=>document.querySelector('.billing-total strong')?.textContent==='400');
 assert.equal(await page.locator('.account-balance').textContent(),'积分余额： 400');
 assert.equal(await page.locator('.member-account-balance').textContent(),'积分余额 400 · 查看明细');
 // A later menu/header refresh wins over an older report, without losing report rows.
 await page.locator('.credit-wallet').getByRole('button',{name:'刷新',exact:true}).click();await page.waitForFunction(()=>reads.length===5);
 await page.evaluate(()=>{void CanvasCreditBalance.refresh();});await page.waitForFunction(()=>reads.length===6);
 await page.evaluate(()=>completeRead(5,600));await page.evaluate(()=>completeRead(4,500));
 await page.waitForFunction(()=>document.querySelector('.billing-total strong')?.textContent==='600');
 assert.equal(await page.locator('.account-balance').textContent(),'积分余额： 600');
 await page.evaluate(()=>{window.closedBalance=document.querySelector('.account-balance');window.closedSummary=document.querySelector('.billing-total strong');});
 await page.getByLabel('关闭账户管理',{exact:true}).click();await page.locator('.account-panel').waitFor({state:'detached'});
 await page.evaluate(()=>{const ticket=CanvasCreditBalance.beginRead();CanvasCreditBalance.publish({total_balance:'700',recharge_balance:'700',gift_balance:'0'},ticket);});
 assert.equal(await page.locator('.member-account-balance').textContent(),'积分余额 700 · 查看明细');
 assert.equal(await page.evaluate(()=>closedBalance.textContent),'积分余额： 600');
 assert.equal(await page.evaluate(()=>closedSummary.textContent),'600');
 assert.deepEqual(errors,[]);
});
test('regular workbench user menu dismisses outside, with Escape and on blur',async t=>{
 const {page,errors}=await setup(t),menu=page.locator('.member-session-account'),trigger=menu.locator('summary');
 for(const dismiss of [()=>page.locator('#outside').click(),()=>page.keyboard.press('Escape'),()=>page.evaluate(()=>window.dispatchEvent(new Event('blur'))) ]){
  await trigger.click();await page.waitForFunction(()=>document.querySelector('.member-session-account').open);
  await dismiss();await page.waitForFunction(()=>!document.querySelector('.member-session-account').open);
 }
 await trigger.click();await page.keyboard.press('Escape');assert.equal(await trigger.evaluate(n=>n===document.activeElement),true);
 assert.deepEqual(errors,[]);
});
test('account modal locks document scrolling without shifting width and restores inline styles and focus',async t=>{
 const {page,errors}=await setup(t);
 await page.evaluate(()=>scrollTo(0,240));
 const before=await page.evaluate(()=>({root:document.documentElement.style.cssText,body:document.body.style.cssText,width:document.querySelector('main').getBoundingClientRect().width,y:scrollY}));
 for(const escape of [false,true]){
  await page.evaluate(async()=>{document.querySelector('#outside').focus({preventScroll:true});await import('/static/js/account-panel.js');await CanvasAccountPanel.show();});
  const locked=await page.evaluate(()=>({root:getComputedStyle(document.documentElement).overflow,body:getComputedStyle(document.body).overflow,width:document.querySelector('main').getBoundingClientRect().width,y:scrollY}));
  assert.equal(locked.root,'hidden');assert.equal(locked.body,'hidden');assert.equal(locked.width,before.width);assert.equal(locked.y,before.y);
  await page.mouse.move(2,790);await page.mouse.wheel(0,500);await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>scrollY),before.y);
  if(escape)await page.keyboard.press('Escape');else await page.getByLabel('关闭账户管理',{exact:true}).click();
  await page.locator('.account-panel').waitFor({state:'detached'});
  assert.deepEqual(await page.evaluate(()=>({root:document.documentElement.style.cssText,body:document.body.style.cssText,width:document.querySelector('main').getBoundingClientRect().width,y:scrollY})),before);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'outside');
 }
 assert.deepEqual(errors,[]);
});
