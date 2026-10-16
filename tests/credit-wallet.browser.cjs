const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
async function setup(t){
  const browser=await chromium.launch(fs.existsSync(chrome)?{executablePath:chrome,headless:true}:{channel:'chrome',headless:true});
  t.after(()=>browser.close());const page=await browser.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<html class="dark"><main></main></html>');
  await page.addStyleTag({content:fs.readFileSync('static/css/billing-view.css','utf8')});
  await page.addScriptTag({content:fs.readFileSync('static/js/credit-wallet.js','utf8')});
  await page.evaluate(()=>{
    window.active=true;window.pending=[];window.requests=[];
    window.report=(page=1)=>({wallet:{total_balance:'9007199254740993',recharge_balance:'9007199254740000',gift_balance:'993'},
      page,pages:3,records:51,entries:[{id:String(page),type:'ADD',amount:'5',balance_after:'9007199254740993',remaining_amount:'5',
        category:'gift',source:'RECHARGE_GIFT',validity:'PERMANENT',created_at:1792000000000,note:'<img src=x onerror=alert(1)>'}]});
    window.view=CanvasCreditWallet.create({isActive:()=>active,fetchReport:(params,signal)=>{
      requests.push(params);return new Promise((resolve,reject)=>pending.push({resolve,reject,signal}));
    }});document.querySelector('main').append(view.element);
  });return {page,errors};
}
test('credit wallet keeps integer precision, labels gift separately and renders notes as text',async t=>{
  const {page,errors}=await setup(t);
  await page.evaluate(()=>pending[0].resolve(report()));
  await page.getByText('9,007,199,254,740,993',{exact:true}).first().waitFor();
  assert.equal(await page.getByText('赠送积分 / 充值赠送',{exact:true}).count(),1);
  assert.equal(await page.locator('img').count(),0);
  assert.equal(await page.getByText('<img src=x onerror=alert(1)>',{exact:true}).count(),1);
  assert.equal(await page.locator('td').first().evaluate(e=>getComputedStyle(e).color),'rgb(229, 234, 242)');
  assert.deepEqual(errors,[]);
});
test('credit wallet rapid next and changed filter do not skip pages or accept stale responses',async t=>{
  const {page,errors}=await setup(t);
  await page.evaluate(()=>pending[0].resolve(report()));
  await page.getByRole('button',{name:'下一页'}).evaluate(b=>{b.click();b.click();});
  assert.deepEqual(await page.evaluate(()=>requests.map(r=>r.page)),[1,2]);
  await page.getByLabel('积分分类').selectOption('recharge');
  assert.equal(await page.evaluate(()=>pending[1].signal.aborted),true);
  await page.evaluate(()=>pending[2].resolve({...report(),entries:[],records:0,pages:1}));
  await page.getByText('暂无积分流水',{exact:true}).waitFor();
  await page.evaluate(()=>pending[1].resolve(report(2)));
  assert.equal(await page.locator('.billing-page-number').textContent(),'1 / 1');
  assert.equal(await page.getByRole('button',{name:'下一页'}).isDisabled(),true);
  assert.deepEqual(errors,[]);
});
test('credit wallet request failures clear stale balances and remain retryable',async t=>{
  const {page}=await setup(t);
  await page.evaluate(()=>pending[0].resolve(report()));
  await page.getByRole('button',{name:'刷新'}).click();
  await page.evaluate(()=>pending[1].reject(Error('offline')));
  await page.getByText('积分读取失败，请点击刷新重试。',{exact:true}).waitFor();
  assert.equal(await page.locator('.billing-total').count(),0);
  assert.equal(await page.locator('.credit-wallet').getAttribute('aria-busy'),'false');
  await page.getByRole('button',{name:'刷新'}).click();
  await page.evaluate(()=>pending[2].resolve({...report(),entries:[],records:0,pages:1,wallet:{total_balance:'0',recharge_balance:'0',gift_balance:'0'}}));
  await page.getByText('暂无积分流水',{exact:true}).waitFor();
  assert.equal(await page.locator('.billing-total strong').first().textContent(),'0');
});
test('credit wallet session pause clears personal values and rejects late replies',async t=>{
  const {page}=await setup(t);
  await page.evaluate(()=>pending[0].resolve(report()));
  await page.getByRole('button',{name:'刷新'}).click();
  await page.evaluate(()=>{active=false;window.dispatchEvent(new CustomEvent('member-session:paused'));pending[1].resolve(report());});
  await page.getByText('登录状态已变化，请重新打开积分页面。',{exact:true}).waitFor();
  assert.equal(await page.locator('.billing-total').count(),0);
  assert.equal(await page.getByRole('button',{name:'刷新'}).isDisabled(),true);
});
test('credit wallet modal binds the displayed account and aborts when closed',async t=>{
  const {page}=await setup(t);
  await page.evaluate(()=>{
    view.dispose();document.querySelector('main').replaceChildren();
    window.CanvasSession={context:{member:{id:'owner'}},paused:false};window.fetchCalls=[];
    window.fetch=(url,options)=>{fetchCalls.push({url,options});return new Promise(resolve=>window.reply=resolve);};
    CanvasCreditWallet.show();
  });
  assert.equal(await page.evaluate(()=>fetchCalls[0].options.headers['X-Member-ID']),'owner');
  await page.getByRole('button',{name:'关闭我的积分'}).click();
  await page.waitForFunction(()=>!document.querySelector('dialog'));
  assert.equal(await page.evaluate(()=>fetchCalls[0].options.signal.aborted),true);
  await page.evaluate(()=>reply({ok:true,json:async()=>report()}));
  assert.equal(await page.locator('dialog').count(),0);
});
