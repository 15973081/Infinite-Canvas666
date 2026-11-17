const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
async function setup(t,productionSkin=false){
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1600,height:1050}}),errors=[],calls=[];page.setDefaultTimeout(5000);
 const source=JSON.parse(fs.readFileSync('config/credit-policy-defaults.json','utf8'));
 const policy={config:Object.fromEntries(['creditsPerCNY','tiers','rewards','validity'].map(k=>[k,source[k]])),version:0,mode:'active'};
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.pathname==='/')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<html lang="zh-CN"><head><meta charset="utf-8">'+(productionSkin?'<link rel="stylesheet" href="/static/css/studio-cyber.css"><link rel="stylesheet" href="/static/css/studio-workspace-surface.css">':'')+'</head><body class="'+(productionSkin?'studio-skin':'')+'"><button id="open">账户</button><script src="/static/js/account-panel.js"></script></body></html>'});
  if(url.pathname.startsWith('/static/'))return route.fulfill({path:path.resolve('.'+url.pathname)});
  calls.push({path:url.pathname,method:req.method(),headers:req.headers(),query:Object.fromEntries(url.searchParams)});
  if(url.pathname==='/api/account/credit-policy')return route.fulfill({json:policy});
  if(url.pathname==='/api/account/credits')return route.fulfill({json:{wallet:{total_balance:'9007199254740993',recharge_balance:'0',gift_balance:'9007199254740993',frozenBalance:'0',availableBalance:'9007199254740993'},page:1,pages:1,records:1,entries:[{type:'ADD',amount:'125',balance_after:'9007199254740993',remaining_amount:'125',category:'gift',source:'PLATFORM_GIFT',validity:'PERMANENT',created_at:1792000000000,note:'<img src=x onerror=alert(1)>'}]}});
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
 await page.locator('.account-panel[open]').waitFor();
 return {page,errors,calls,policy};
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

test('account tab replacement enhances new filters and disposes open dropdowns',async t=>{
 const {page,errors}=await setup(t,true),dialog=page.locator('.account-panel');
 const avatar=dialog.getByRole('combobox',{name:'头像颜色',exact:true});await avatar.click();
 await dialog.getByRole('option',{name:'紫色',exact:true}).click();assert.equal(await dialog.locator('select').inputValue(),'purple');
 await avatar.click();await page.keyboard.press('Escape');assert.equal(await dialog.getAttribute('open'),'');
 page.once('dialog',d=>d.accept());await dialog.getByRole('button',{name:'任务明细',exact:true}).click();
 const status=dialog.getByRole('combobox',{name:'任务状态',exact:true});await status.click();await dialog.getByRole('option',{name:'失败',exact:true}).click();
 await page.getByText('task-1',{exact:true}).waitFor();assert.equal(await dialog.locator('select').inputValue(),'failed');
 await status.click();fs.mkdirSync('.local/custom-select',{recursive:true});await page.screenshot({path:'.local/custom-select/account-tasks-open.png',fullPage:true});
 await page.evaluate(()=>{window.oldTaskSelect=document.querySelector('.account-content select');void CanvasAccountPanel.show('credits');});
 await dialog.getByRole('combobox',{name:'积分分类',exact:true}).waitFor();
 assert.equal(await page.locator('.studio-select-menu:popover-open').count(),0);assert.equal(await page.evaluate(()=>Object.hasOwn(oldTaskSelect,'value')),false);
 await dialog.getByRole('combobox',{name:'积分分类',exact:true}).click();await page.keyboard.press('Escape');assert.equal(await dialog.getAttribute('open'),'');assert.deepEqual(errors,[]);
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

test('topup uses current policy, sorted tiers and decimal gift flooring',async t=>{
 const {page,errors,calls,policy}=await setup(t);
 policy.config.creditsPerCNY=20;
 policy.config.tiers=[{minAmount:100,bonusRate:0.375},{minAmount:5,bonusRate:0.29}];
 policy.config.rewards.firstRechargeEnabled=false;
 await page.getByRole('button',{name:'积分充值',exact:true}).click();
 const summary=page.locator('.account-topup-summary');await summary.waitFor();
 const value=label=>summary.locator(':scope > div').filter({has:page.locator('span',{hasText:new RegExp('^'+label+'$')})}).locator('strong').textContent();
 assert.deepEqual(await page.locator('.account-plan').evaluateAll(ns=>ns.map(n=>n.getAttribute('aria-label'))),['5 元充值方案','100 元充值方案']);
 assert.equal(await value('充值积分'),'100');assert.equal(await value('赠送积分'),'29');assert.equal(await value('预计到账积分'),'129');
 await summary.getByText('首充加赠未开启',{exact:true}).waitFor();
 await page.getByLabel('其他金额',{exact:true}).fill('4');assert.equal(await value('赠送积分'),'0');
 await page.getByLabel('其他金额',{exact:true}).fill('101');assert.equal(await value('赠送积分'),'757');
 policy.version++;policy.config.creditsPerCNY=30;policy.config.tiers=[{minAmount:10,bonusRate:1e-7}];
 policy.config.rewards={...policy.config.rewards,firstRechargeEnabled:true,firstRechargeMinimum:10,firstRechargeCredits:321};
 await page.getByRole('button',{name:'刷新充值方案',exact:true}).click();
 await page.getByRole('button',{name:'10 元充值方案',exact:true}).waitFor();
 assert.equal(await value('充值积分'),'300');assert.equal(await value('赠送积分'),'0');
 assert.match(await value('首充加赠'),/321.*资格未接入/);assert.equal(await value('预计到账积分'),'300');
 assert.ok(calls.filter(c=>c.path==='/api/account/credit-policy').length===2);
 assert.equal(calls.some(c=>c.method!=='GET'),false);assert.deepEqual(errors,[]);
});

test('topup read failure offers retry without showing hardcoded plans',async t=>{
 const {page,errors}=await setup(t);let fail=true;
 await page.route('**/api/account/credit-policy',route=>fail?route.fulfill({status:503,json:{}}):route.fallback());
 await page.getByRole('button',{name:'积分充值',exact:true}).click();
 await page.getByText('充值方案读取失败，请重试。',{exact:true}).waitFor();assert.equal(await page.locator('.account-plan').count(),0);
 fail=false;await page.getByRole('button',{name:'重试',exact:true}).click();await page.getByRole('button',{name:'69 元充值方案',exact:true}).waitFor();
 assert.deepEqual(errors,[]);
});

for(const action of ['tab','close','identity'])test('late topup response cannot render after '+action,async t=>{
 const {page,errors,policy}=await setup(t);
 await page.evaluate(policy=>{
  const original=window.fetch;
  window.fetch=(url,options)=>String(url).includes('/api/account/credit-policy')?new Promise(resolve=>{
   window.policySignal=options.signal;window.releasePolicy=()=>resolve(new Response(JSON.stringify(policy),{status:200,headers:{'Content-Type':'application/json'}}));
  }):original(url,options);
 },policy);
 await page.getByRole('button',{name:'积分充值',exact:true}).click();await page.waitForFunction(()=>typeof releasePolicy==='function');
 if(action==='tab')await page.getByRole('button',{name:'个人资料',exact:true}).click();
 else if(action==='close')await page.getByRole('button',{name:'关闭账户管理',exact:true}).click();
 else await page.evaluate(()=>{CanvasSession.context.member={id:'member-b'};CanvasSession.paused=true;dispatchEvent(new Event('member-session:paused'));});
 await page.waitForFunction(()=>policySignal.aborted);
 await page.evaluate(async()=>{releasePolicy();await new Promise(resolve=>setTimeout(resolve,0));});
 assert.equal(await page.locator('.account-plan').count(),0);
 if(action==='tab')await page.getByLabel('昵称',{exact:true}).waitFor();
 if(action==='identity')await page.getByText('登录状态已变化，请关闭后重新确认登录。',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);
});

test('tasks filter and page without inventing credit consumption, and usage costs remain accessible',async t=>{
 const {page,calls,errors}=await setup(t);await page.getByRole('button',{name:'任务明细',exact:true}).click();await page.getByText('task-1',{exact:true}).waitFor();
 await page.getByRole('button',{name:'下一页',exact:true}).click();await page.getByText('task-2',{exact:true}).waitFor();
 await page.locator('select[aria-label="任务状态"]').selectOption('failed');await page.getByText('task-1',{exact:true}).waitFor();
 assert.equal(calls.filter(c=>c.path==='/api/account/tasks').at(-1).query.status,'failed');
 assert.equal(await page.getByText('未接入积分结算',{exact:true}).count(),1);
 await page.getByRole('button',{name:'查看使用费用',exact:true}).click();await page.getByText('暂无费用记录',{exact:true}).waitFor();assert.deepEqual(errors,[]);
});

test('task list renders frozen, settled, partial, released and historical credit states',async t=>{
 const {page,errors}=await setup(t,true);
 const entries=[
  {id:'frozen',status:'finalizing',credit_status:'FROZEN',credit_frozen:'36',credit_settled:null,credit_released:null},
  {id:'full',status:'succeeded',credit_status:'SETTLED',credit_frozen:'36',credit_settled:'36',credit_released:'0'},
  {id:'partial',status:'succeeded',credit_status:'SETTLED',credit_frozen:'36',credit_settled:'18',credit_released:'18'},
  {id:'failed',status:'failed',credit_status:'RELEASED',credit_frozen:'36',credit_settled:'0',credit_released:'36'},
  {id:'legacy',status:'succeeded',credit_status:null}
 ].map(row=>({...row,kind:'online-image',model:'gpt-image-2',created_at:1792000000000}));
 await page.route('**/api/account/tasks?*',route=>route.fulfill({json:{entries,page:1,pages:1,records:5}}));
 await page.getByRole('button',{name:'任务明细',exact:true}).click();
 for(const text of ['冻结中 36 积分','已实扣 -36 积分','已实扣 -18 积分（释放 18 积分）','已退回 36 积分 / 未扣费','未接入积分结算'])await page.getByText(text,{exact:true}).waitFor();
 fs.mkdirSync('.local/image-credits',{recursive:true});
 for(const width of [1600,390]){
  await page.setViewportSize({width,height:1050});
  assert.ok(await page.locator('.account-panel').evaluate(n=>n.scrollWidth<=n.clientWidth));
  await page.screenshot({path:'.local/image-credits/tasks-'+width+'.png',fullPage:true});
 }
 assert.deepEqual(errors,[]);
});

test('account consumption and grant tabs request separate transaction types',async t=>{
 const {page,calls,errors}=await setup(t);
 await page.getByRole('button',{name:'积分明细',exact:true}).click();
 await page.getByText('赠送积分 / 平台赠送',{exact:true}).waitFor();
 assert.equal(calls.filter(c=>c.path==='/api/account/credits'&&c.query.category!==undefined).at(-1).query.transaction_type,'ADD');
 await page.getByRole('tab',{name:'消耗明细',exact:true}).click();
 await page.getByText('赠送积分 / 平台赠送',{exact:true}).waitFor();
 assert.equal(calls.filter(c=>c.path==='/api/account/credits'&&c.query.category!==undefined).at(-1).query.transaction_type,'SPEND');
 assert.deepEqual(errors,[]);
});

test('media tasks show review holds, duration refunds and understanding charges',async t=>{
 const {page,errors}=await setup(t,true);
 const entries=[
  {id:'review-video',kind:'video',model:'doubao-seedance-2-5-260628',status:'needs_review',credit_status:'FROZEN',credit_frozen:'1260',credit_settled:null,credit_released:null},
  {id:'short-video',kind:'video',model:'doubao-seedance-2-5-260628',status:'succeeded',credit_status:'SETTLED',credit_frozen:'1260',credit_settled:'336',credit_released:'924'},
  {id:'understand',kind:'llm',model:'video-understand-router',status:'succeeded',credit_status:'SETTLED',credit_frozen:'4',credit_settled:'4',credit_released:'0'}
 ].map(r=>({...r,created_at:1792000000000}));
 await page.route('**/api/account/tasks?*',route=>route.fulfill({json:{entries,page:1,pages:1,records:3}}));
 await page.getByRole('button',{name:'任务明细',exact:true}).click();
 await page.getByRole('cell',{name:'待核对',exact:true}).waitFor();
 for(const text of ['冻结中 1,260 积分','已实扣 -336 积分（释放 924 积分）','已实扣 -4 积分'])await page.getByText(text,{exact:true}).waitFor();
 fs.mkdirSync('.local/media-credits',{recursive:true});
 for(const width of [1600,390]){
  await page.setViewportSize({width,height:1050});
  assert.ok(await page.locator('.account-panel').evaluate(n=>n.scrollWidth<=n.clientWidth));
  await page.screenshot({path:'.local/media-credits/tasks-'+width+'.png',fullPage:true});
 }
 assert.deepEqual(errors,[]);
});

test('ordinary chat calls show pending, spent and interrupted refunds',async t=>{
 const {page,errors}=await setup(t,true);
 const entries=[
  {id:'chat-pending',status:'pending',credit_status:'FROZEN',credit_frozen:'4'},
  {id:'chat-delivered',status:'succeeded',credit_status:'SETTLED',credit_frozen:'4',credit_settled:'4',credit_released:'0'},
  {id:'chat-interrupted',status:'uncertain',credit_status:'RELEASED',credit_frozen:'4',credit_settled:'0',credit_released:'4'}
 ].map(r=>({...r,kind:'chat',source_type:'chat_call',model:'gemini-3.1-pro',created_at:1792000000000}));
 await page.route('**/api/account/tasks?*',route=>route.fulfill({json:{entries,page:1,pages:1,records:3}}));
 await page.getByRole('button',{name:'任务明细',exact:true}).click();
 for(const name of ['等待回复','回复中断'])await page.getByRole('cell',{name,exact:true}).waitFor();
 for(const name of ['冻结中 4 积分','已实扣 -4 积分','已退回 4 积分 / 未扣费'])await page.getByText(name,{exact:true}).waitFor();
 assert.deepEqual(errors,[]);
});

test('account session pause clears all private data and prevents late wallet rendering',async t=>{
 const {page,errors}=await setup(t);let release;
 await page.route('**/api/account/credits?category=*',async route=>{await new Promise(r=>release=r);try{await route.fulfill({json:{wallet:{total_balance:'777',recharge_balance:'777',gift_balance:'0',frozenBalance:'0',availableBalance:'777'},entries:[],page:1,pages:1,records:0}});}catch{}});
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
  await page.locator('.account-topup-summary').waitFor();
  const bounds=await page.locator('.account-panel').evaluate(n=>({w:n.getBoundingClientRect().width,scroll:n.scrollWidth,client:n.clientWidth,viewport:innerWidth}));assert.ok(bounds.w<=width&&bounds.scroll<=bounds.client,JSON.stringify(bounds));
  await page.screenshot({path:'.local/commercial-kickoff/account-topup-'+width+'.png',fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'企业认证',exact:true}).click();await page.getByText('企业认证服务尚未开放，暂不收集营业执照或认证材料。',{exact:true}).waitFor();
 }
 assert.deepEqual(errors,[]);
});

test('account surfaces retain neutral navigation and native controls under production skins',async t=>{
 const {page,errors,calls}=await setup(t,true);
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.account-panel')).getPropertyValue('--ac-bg').trim()==='#0c0c0e');
 const dialog=page.locator('.account-panel');
 const style=(selector,property)=>dialog.locator(selector).first().evaluate((el,property)=>getComputedStyle(el)[property],property);
 assert.equal(await dialog.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(12, 12, 14)');
 assert.equal(await style('.account-nav button.active','backgroundColor'),'rgb(28, 28, 33)');
 assert.deepEqual(await dialog.locator('.account-nav svg').evaluateAll(nodes=>nodes.map(node=>node.dataset.accountIcon)),['user','coins','receipt-text','arrow-left-right','list-checks','building-2']);
 assert.ok(await dialog.locator('.account-nav svg').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).strokeWidth==='1.75px'&&getComputedStyle(node).width==='16px')));
 assert.equal(await style('.account-avatar svg','width'),'20px');
 assert.equal(await style('.account-primary','fontWeight'),'600');
 assert.equal(await style('.account-primary','color'),'rgb(9, 9, 11)');
 assert.equal(await style('.studio-select-trigger','height'),'36px');
 assert.equal(await style('.studio-select-trigger','borderRadius'),'8px');
 await dialog.locator('.account-profile select').selectOption('purple');
 await page.getByRole('button',{name:'保存资料',exact:true}).click();
 await page.getByText('资料已保存',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>saved[0].avatar),'purple');
 await page.getByRole('button',{name:'积分充值',exact:true}).click();
 assert.equal(await style('.account-plan.selected','borderColor'),'rgba(255, 255, 255, 0.25)');
 assert.equal(await dialog.locator('.account-plan svg[data-account-icon="zap"]').count(),4);
 assert.equal(await style('.account-plan-credits svg','width'),'14px');
 assert.equal(await style('.account-plan-credits svg','fill'),'rgba(212, 255, 51, 0.2)');
 assert.equal(await dialog.locator('.account-payment-unavailable svg[data-account-icon="lock"]').count(),1);
 assert.doesNotMatch(await dialog.innerText(),/[ϟ◇]/);
 const heights=await dialog.locator('.account-topup-other input,.account-topup-other button').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));
 assert.deepEqual(heights,[40,40]);
 await page.getByRole('button',{name:'399 元充值方案',exact:true}).click();
 assert.equal(await dialog.locator('.account-plan.selected').count(),1);
 assert.match(await dialog.locator('.account-topup-summary').innerText(),/7,780/);
 await page.getByRole('button',{name:'任务明细',exact:true}).click();
 await page.getByText('task-1',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'下一页',exact:true}).evaluate(el=>el.getBoundingClientRect().width),28);
 await page.getByRole('button',{name:'下一页',exact:true}).click();await page.getByText('task-2',{exact:true}).waitFor();
 for(const tab of ['账单发票','企业认证']){
  await page.getByRole('button',{name:tab,exact:true}).click();
  assert.match(await dialog.locator('.account-empty').innerText(),/尚未开放/);
  assert.equal(await style('.account-empty','borderRadius'),'12px');
  assert.equal(await dialog.locator('.account-empty-icon svg').getAttribute('data-account-icon'),tab==='账单发票'?'file-text':'building-2');
 }
 assert.equal(calls.some(call=>call.method!=='GET'),false);
 assert.deepEqual(errors,[]);
});
