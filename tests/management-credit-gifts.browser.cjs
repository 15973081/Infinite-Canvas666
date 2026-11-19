const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const {chromium} = require('playwright');

async function setup(t, permissions = ['credits.gift.platform','audit.platform']) {
  const browser = await chromium.launch({channel:'chrome',headless:true}); t.after(() => browser.close());
  const page = await browser.newPage();
  const state = {permissions, previews:[], applies:[], history:[], receipts:new Map(), failure:null, memberId:'admin-a',
    deductionPreviews:[], deductionApplies:[], deductionReceipts:new Map()};
  const target = {id:'member-target',username:'recipient',display_name:'收款人'};
  const actor = {id:'admin-a',username:'admin',display_name:'操作员'};
  const wallet = {recharge_balance:'90',gift_balance:'10',total_balance:'100',frozenBalance:'15',availableBalance:'85'};
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    if (path === '/') return route.fulfill({contentType:'text/html; charset=utf-8',body:fs.readFileSync('management/frontend/index.html','utf8')});
    if (path.startsWith('/static/')) {
      const name = path.split('/').pop(), dir = name === 'billing-view.js' ? 'static/js/' : name === 'billing-view.css' ? 'static/css/' : 'management/frontend/';
      return route.fulfill({contentType:name.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8',body:fs.readFileSync(dir+name,'utf8')});
    }
    if (path === '/api/me') {
      if(req.headers()['x-member-id'] && req.headers()['x-member-id']!==state.memberId)
        return route.fulfill({status:409,json:{detail:{code:'member_identity_changed'}}});
      return route.fulfill({json:{member:{id:state.memberId,display_name:'操作员'},permissions:state.permissions,workspaces:[]}});
    }
    if (path === '/api/credits/wallets') return route.fulfill({json:{target,wallet}});
    if (path === '/api/credits/gifts') {
      state.history.push(Object.fromEntries(url.searchParams));
      if (state.failure === 'history') return route.fulfill({status:503,json:{detail:{code:'management_dependency_unavailable'}}});
      return route.fulfill({json:{entries:[...state.receipts.values()].map(r=>({...r,created_at:'2026-10-16T10:00:00Z'})),next:null}});
    }
    if (path === '/api/credits/gifts/preview') {
      const data = req.postDataJSON(); state.previews.push(data);
      assert.equal(req.headers()['x-member-id'],'admin-a');
      return route.fulfill({json:{...data,target,wallet,preview_token:'a'.repeat(64),applied:false}});
    }
    if (path === '/api/credits/gifts/apply') {
      const data = req.postDataJSON(); state.applies.push(data);
      if (state.failure === 'stale') {state.failure=null;return route.fulfill({status:409,json:{detail:{code:'credit_gift_preview_changed'}}});}
      if (!state.receipts.has(data.request_id)) state.receipts.set(data.request_id,{...data,applied:true,target,actor,grant_id:'grant-'+data.request_id,transaction_id:'42',balance_after:data.amount,expires_at:data.valid_days?'2026-10-23T10:00:00Z':null});
      if (state.holdFirst) {state.holdFirst=false;await new Promise(resolve=>{state.release=resolve;});}
      if (state.failure === 'abort') {state.failure=null;return route.abort('failed');}
      return route.fulfill({json:state.receipts.get(data.request_id)});
    }
    if (path === '/api/credits/deductions') {
      return route.fulfill({json:{entries:[...state.deductionReceipts.values()],next:null}});
    }
    if (path === '/api/credits/deductions/preview') {
      const data = req.postDataJSON(); state.deductionPreviews.push(data);
      return route.fulfill({json:{...data,target,available_before:'100',available_after:'75',
        allocations:[{grant_id:'grant',category:'recharge',amount:data.amount}],preview_token:'b'.repeat(64),applied:false}});
    }
    if (path === '/api/credits/deductions/apply') {
      const data = req.postDataJSON(); state.deductionApplies.push(data);
      if (state.failure === 'stale') {
        state.failure=null;
        return route.fulfill({status:409,json:{detail:{code:'credit_deduction_preview_changed'}}});
      }
      const receipt = {...data,target,actor,applied:true,transaction_id:'43',balance_after:'75',
        allocations:[{grant_id:'grant',category:'recharge',amount:data.amount,transaction_id:'43'}],created_at:'2026-10-16T10:00:00Z'};
      state.deductionReceipts.set(data.request_id,receipt);
      return route.fulfill({json:receipt});
    }
    return route.fulfill({json:{manageable_spaces:0,members:{total:0},tasks:{total:0},services:[],maintenance:{mode:'normal'}}});
  });
  const open = async () => {
    await page.goto('http://localhost:8770/');
    await page.getByRole('button',{name:'积分管理',exact:true}).click();
    await page.locator('#content[aria-busy="false"]').waitFor();
  };
  await open();
  const fill = async (amount='125') => {
    await page.getByLabel('收款登录账号',{exact:true}).fill('recipient');
    await page.getByLabel('赠送积分数（正整数）',{exact:true}).fill(amount);
    await page.getByLabel('赠送原因（管理端留档）',{exact:true}).fill('人工核准');
    await page.getByLabel('来源依据（工单、审批或活动编号）',{exact:true}).fill('APPROVAL-42');
    await page.getByRole('button',{name:'预览赠送',exact:true}).click();
    await page.getByRole('button',{name:`确认赠送 ${amount} 积分`,exact:true}).waitFor();
  };
  return {page,state,fill,open};
}

test('presets, account balances, projected grant and issuing operator', async t => {
  const {page}=await setup(t);
  await page.getByRole('button',{name:'外部客户补偿'}).click();
  assert.equal(await page.getByLabel('有效天数',{exact:true}).inputValue(),'30');
  assert.equal(await page.getByLabel('积分类别',{exact:true}).inputValue(),'gift');
  await page.getByRole('button',{name:'内部员工额度'}).click();
  assert.equal(await page.getByLabel('积分类别',{exact:true}).inputValue(),'recharge');
  assert.equal(await page.getByLabel('有效期',{exact:true}).inputValue(),'permanent');
  assert.equal(await page.getByLabel('来源依据（工单、审批或活动编号）',{exact:true}).inputValue(),'内部员工额度');
  assert.equal(await page.getByLabel('赠送原因（管理端留档）',{exact:true}).inputValue(),'内部员工额度');
  await page.getByLabel('收款登录账号',{exact:true}).fill('recipient');
  await page.getByLabel('赠送积分数（正整数）',{exact:true}).fill('25');
  await page.getByText(/收款人（recipient）.*充值余额 90.*赠送余额 10.*冻结中 15.*可用余额 85/).waitFor();
  await page.getByRole('button',{name:'预览赠送'}).click();
  await page.getByText('预计总余额：100 → 125',{exact:true}).waitFor();
  await page.getByText('预计充值积分余额：90 → 115',{exact:true}).waitFor();
  await page.getByRole('button',{name:'确认赠送 25 积分'}).click();
  await page.getByRole('button',{name:'新建赠送'}).waitFor();
  await page.getByRole('tab',{name:'发放记录'}).click();
  await page.getByRole('cell',{name:'操作员 / admin',exact:true}).waitFor();
  await page.getByRole('tab',{name:'积分扣减 / 冲正'}).click();
  await page.getByLabel('目标登录账号',{exact:true}).fill('recipient');
  await page.getByRole('button',{name:'查余额'}).click();
  await page.getByRole('tabpanel').getByText(/收款人（recipient）.*可用余额 85/).waitFor();
});

test('credit gift requires explicit confirmation and displays linked receipt', async t => {
  const {page,state,fill} = await setup(t); await fill();
  assert.equal(state.applies.length,0);
  assert.match(await page.locator('.credit-gift-facts').textContent(),/收款人 \/ recipient \/ member-target/);
  await page.getByRole('button',{name:'确认赠送 125 积分',exact:true}).click();
  await page.getByText('已入账。以下编号可用于核对来源记录与操作审计。',{exact:true}).waitFor();
  assert.equal(state.applies.length,1); assert.equal(state.receipts.size,1);
  await page.getByRole('tab',{name:'发放记录',exact:true}).click();await page.getByRole('columnheader',{name:'发放积分',exact:true}).waitFor();assert.equal(await page.locator('.management-kpis strong').nth(1).textContent(),'125');await page.getByRole('tab',{name:'发放积分',exact:true}).click();assert.equal(await page.getByRole('tabpanel').locator('.credit-steps [aria-current=step]').textContent(),'确认入账');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('management-credit-gift-pending:admin-a')),null);
  await page.getByRole('button',{name:'新建赠送',exact:true}).click();
  await fill('20');
  assert.notEqual(state.previews[0].request_id,state.previews[1].request_id);
});

test('credit gift confirms the selected category and term, then shows the actual expiry', async t => {
  const {page,state,fill} = await setup(t);
  await page.getByLabel('积分类别',{exact:true}).selectOption('recharge');
  await page.getByLabel('有效期',{exact:true}).selectOption('days');
  await page.getByLabel('有效天数',{exact:true}).fill('7');
  await fill();
  assert.match(await page.locator('.credit-gift-facts').textContent(), /平台赠送 · 充值积分 · 入账后 7 天/);
  await page.getByRole('button',{name:'确认赠送 125 积分',exact:true}).click();
  await page.getByRole('button',{name:'新建赠送',exact:true}).waitFor();
  assert.equal(state.applies[0].category,'recharge');
  assert.equal(state.applies[0].valid_days,7);
  await page.getByRole('tab',{name:'发放记录',exact:true}).click();
  const expiry = await page.evaluate(() => new Date('2026-10-23T10:00:00Z').toLocaleString('zh-CN'));
  await page.getByRole('cell',{name:expiry,exact:true}).waitFor();
  await page.getByRole('cell',{name:'充值积分',exact:true}).waitFor();
});

test('credit deduction requires a reason and a fresh preview, then shows the audited receipt', async t => {
  const {page,state} = await setup(t);
  await page.getByRole('tab',{name:'积分扣减 / 冲正',exact:true}).click();
  await page.getByLabel('目标登录账号',{exact:true}).fill('recipient');
  await page.getByLabel('扣减积分数（正整数）',{exact:true}).fill('25');
  await page.getByLabel('扣减类别',{exact:true}).selectOption('recharge');
  const reason = page.getByLabel('扣减原因（管理端留档）',{exact:true});
  const preview = page.getByRole('button',{name:'预览扣减',exact:true});
  const confirm = page.getByRole('button',{name:'确认扣减 25 积分',exact:true});
  await preview.click();
  assert.equal(state.deductionPreviews.length,0);
  await reason.fill('更正误发额度');
  await preview.click();
  await confirm.waitFor();
  await page.getByText('所选范围可用积分：100 → 75',{exact:true}).waitFor();
  assert.equal(state.deductionApplies.length,0);
  state.failure='stale';
  await confirm.click();
  await preview.waitFor();
  assert.equal(await reason.inputValue(),'更正误发额度');
  await preview.click();
  await confirm.click();
  await page.getByText('已扣减。凭证可在扣减记录中查询。',{exact:true}).waitFor();
  assert.equal(state.deductionApplies[1].preview_token,'b'.repeat(64));
  assert.equal(state.deductionApplies[1].category,'recharge');
  assert.equal(state.deductionApplies[1].reason,'更正误发额度');
  await page.getByRole('tab',{name:'扣减记录',exact:true}).click();
  await page.getByRole('cell',{name:'−25',exact:true}).waitFor();
  await page.getByText('更正误发额度',{exact:true}).click();
  await page.getByRole('table').getByText('流水编号：43',{exact:true}).waitFor();
});

test('credit gift uncertain result survives reload and reuses identical request', async t => {
  const {page,state,fill,open} = await setup(t); await fill(); state.failure='abort';
  await page.getByRole('button',{name:'确认赠送 125 积分',exact:true}).click();
  await page.getByRole('button',{name:'重试确认结果',exact:true}).waitFor();
  assert.equal(await page.getByLabel('赠送积分数（正整数）',{exact:true}).isDisabled(),true);
  await open(); await page.getByRole('button',{name:'重试确认结果',exact:true}).click();
  await page.getByText('已入账。以下编号可用于核对来源记录与操作审计。',{exact:true}).waitFor();
  assert.equal(state.applies.length,2); assert.deepEqual(state.applies[0],state.applies[1]);
  assert.equal(state.receipts.size,1);
});

test('credit gift rejected stale preview preserves inputs for a fresh preview', async t => {
  const {page,state,fill} = await setup(t); await fill(); state.failure='stale';
  await page.getByRole('button',{name:'确认赠送 125 积分',exact:true}).click();
  await page.getByRole('button',{name:'预览赠送',exact:true}).waitFor();
  assert.equal(await page.getByLabel('赠送积分数（正整数）',{exact:true}).inputValue(),'125');
  assert.equal(await page.getByLabel('赠送积分数（正整数）',{exact:true}).isEnabled(),true);
  assert.equal(state.receipts.size,0);
  await page.getByRole('button',{name:'预览赠送',exact:true}).click();
  await page.getByRole('button',{name:'确认赠送 125 积分',exact:true}).click();
  await page.getByRole('button',{name:'新建赠送',exact:true}).waitFor();
  assert.equal(state.receipts.size,1);
});

for (const change of ['permission','identity']) test(`credit gift ${change} change pauses submission without losing inputs`, async t => {
  const {page,state,fill} = await setup(t); await fill();
  if(change==='permission')state.permissions=['audit.platform']; else state.memberId='admin-b';
  const checked = page.waitForResponse(r=>r.url().endsWith('/api/me'));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus'))); await checked;
  await page.locator('#message').filter({hasText:change==='permission'?'管理权限已改变':'登录账号已改变'}).waitFor();
  await page.getByRole('button',{name:'确认赠送 125 积分',exact:true}).click();
  await page.getByRole('button',{name:'重试确认结果',exact:true}).waitFor();
  assert.equal(state.applies.length,0);
  assert.equal(await page.getByLabel('来源依据（工单、审批或活动编号）',{exact:true}).inputValue(),'APPROVAL-42');
});

test('credit gift auditor can filter history but cannot create gifts', async t => {
  const {page,state} = await setup(t,['audit.platform']);
  assert.equal(await page.getByRole('button',{name:'预览赠送',exact:true}).count(),0);
  await page.getByLabel('收款账号（精确筛选）',{exact:true}).fill('recipient');
  await page.getByLabel('请求编号（精确筛选）',{exact:true}).fill('29d05b0e-2da1-4e5d-83ef-3c51d429e2ba');
  await page.getByRole('button',{name:'查询记录',exact:true}).click();
  await page.getByText('暂无符合条件的赠送记录。',{exact:true}).waitFor();
  assert.deepEqual(state.history.at(-1),{username:'recipient',request_id:'29d05b0e-2da1-4e5d-83ef-3c51d429e2ba'});
});

test('credit gift ordinary billing reader cannot read provenance', async t => {
  const {page,state} = await setup(t,['billing.platform','member.manage']);
  assert.equal(state.history.length,0);
  assert.equal(await page.getByRole('button',{name:'预览赠送',exact:true}).count(),0);
});

test('credit gift keeps bigint exact and safely renders untrusted evidence', async t => {
  const {page,state,fill} = await setup(t); await fill('9223372036854775807');
  await page.getByRole('button',{name:'修改内容',exact:true}).click();
  await page.getByLabel('来源依据（工单、审批或活动编号）',{exact:true}).fill('<img src=x onerror="window.injected=true">');
  await page.getByRole('button',{name:'预览赠送',exact:true}).click();
  await page.getByRole('button',{name:'确认赠送 9223372036854775807 积分',exact:true}).click();
  await page.getByRole('button',{name:'新建赠送',exact:true}).waitFor();
  assert.equal(state.applies[0].amount,'9223372036854775807');
  assert.equal(await page.locator('.credit-gifts img').count(),0);
  assert.equal(await page.evaluate(()=>window.injected),undefined);
});

test('credit gift receipt remains confirmed when history refresh fails', async t => {
  const {page,state,fill} = await setup(t); await fill(); state.failure='history';
  await page.getByRole('button',{name:'确认赠送 125 积分',exact:true}).click();
  await page.getByRole('button',{name:'新建赠送',exact:true}).waitFor();
  await page.getByText('已入账。以下编号可用于核对来源记录与操作审计。',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'重试确认结果',exact:true}).isVisible(),false);
  assert.equal(state.receipts.size,1);
});

test('credit gift preview remains readable at desktop widths', async t => {
  const {page,fill} = await setup(t); await fill();
  fs.mkdirSync('.local/commercial-kickoff',{recursive:true});
  for(const width of [1366,1920]) {
    await page.setViewportSize({width,height:1000});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
    await page.screenshot({path:`.local/commercial-kickoff/credit-gift-preview-${width}.png`,fullPage:true});
  }
});

test('credit gift late receipt cannot erase a newer pending operation after navigation', async t => {
  const {page,state,fill} = await setup(t); await fill(); state.holdFirst=true;
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button',{name:'确认赠送 125 积分',exact:true}).click();
  await page.getByRole('button',{name:'概览',exact:true}).click();
  await page.getByRole('button',{name:'积分管理',exact:true}).click();
  await page.getByRole('button',{name:'重试确认结果',exact:true}).click();
  await page.getByRole('button',{name:'新建赠送',exact:true}).click();
  await fill('30'); state.failure='abort';
  await page.getByRole('button',{name:'确认赠送 30 积分',exact:true}).click();
  await page.getByRole('button',{name:'重试确认结果',exact:true}).waitFor();
  const pending = await page.evaluate(()=>sessionStorage.getItem('management-credit-gift-pending:admin-a'));
  const oldResponse = page.waitForResponse(r=>r.url().endsWith('/apply'));
  const refreshed = page.waitForResponse(r=>new URL(r.url()).pathname==='/api/credits/gifts');
  state.release(); await oldResponse; await refreshed;
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('management-credit-gift-pending:admin-a')),pending);
  assert.equal(JSON.parse(pending).amount,'30');
});
