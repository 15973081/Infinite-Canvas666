const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
test('management billing separates account totals and entries, opens scoped trace drawer and clears it on navigation',async t=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<link id="billing-view-style"><main id="content"></main>');
 for(const file of ['static/css/billing-view.css','management/frontend/management.css'])await page.addStyleTag({content:fs.readFileSync(file,'utf8')});
 await page.addScriptTag({content:fs.readFileSync('static/js/billing-view.js','utf8')});
 await page.evaluate(async()=>{
  window.queries=[];
  document.querySelector('main').append(await CanvasBillingUI.create({management:true,fetchReport:async params=>{
   queries.push(params);return {page:1,pages:1,records:1,totals:[{currency:'CNY',amount_micros:'1250000',base_amount_micros:'1250000',discount_amount_micros:'0',unknown:0}],accounts:[{member_id:'member-1',username:'alice',display_name:'Alice',member_status:'active',amount_micros:'1250000',currency:'CNY',records:1,unknown:0}],entries:[{id:'ledger-1',member_id:'member-1',username:'alice',created_at:1792000000000,canvas_title:'画布 A',workspace_name:'设计空间',model:'image-model',kind:'image',status:'success',cost_status:'priced',amount_micros:'1250000',currency:'CNY',task_id:'task-1'}]};
  }}));
 });
 assert.equal(await page.getByRole('tab',{name:'账号汇总'}).getAttribute('aria-selected'),'true');
 assert.equal(await page.getByText('画布 A',{exact:true}).isVisible(),false);
 await page.getByRole('button',{name:'查看明细',exact:true}).click();
 await page.getByText('画布 A',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>queries.at(-1).member_id),'member-1');
 assert.equal(await page.getByRole('tab',{name:'消费明细'}).getAttribute('aria-selected'),'true');
 await page.locator('.billing-origin summary').click();
 await page.getByRole('dialog',{name:'消费溯源详情'}).waitFor();assert.equal(await page.locator('.management-drawer').getByText('task-1',{exact:true}).count(),1);
 await page.keyboard.press('Escape');await page.locator('.management-drawer').waitFor({state:'detached'});assert.equal(await page.locator('.management-drawer').count(),0);
 await page.getByRole('button',{name:'返回全部账号',exact:true}).click();
 await page.getByRole('tab',{name:'账号汇总',selected:true}).waitFor();assert.equal(await page.evaluate(()=>queries.at(-1).member_id),undefined);
 await page.getByRole('tab',{name:'消费明细'}).click();await page.locator('.billing-origin summary').click();
 await page.evaluate(()=>document.querySelector('main').replaceChildren());assert.equal(await page.getByRole('dialog').count(),0);
 assert.deepEqual(errors,[]);
});
