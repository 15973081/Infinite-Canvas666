const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
async function setup(t,personal){
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setContent('<link id="billing-view-style"><main></main>');
 await page.addStyleTag({content:fs.readFileSync('static/css/billing-view.css','utf8')});
 await page.addScriptTag({content:fs.readFileSync('static/js/billing-view.js','utf8')});
 await page.evaluate(async personal=>{
  window.requests=[];window.pending=[];
  window.report=page=>({page,pages:3,records:101,workspaces:[],accounts:[],totals:[{currency:'CNY',amount_micros:'9007199254740993',base_amount_micros:'9007199254740993',discount_amount_micros:'0',unknown:0}],entries:[{
   id:'entry-'+page,created_at:1792000000000,canvas_title:'Page '+page,workspace_name:'Space',model:'model',kind:'image',status:'success',cost_status:'priced',amount_micros:'1',currency:'CNY'
  }]});
  document.querySelector('main').append(await CanvasBillingUI.create({personal,fetchReport:params=>{
   requests.push(params);
   if(requests.length===1)return Promise.resolve(report(1));
   return new Promise((resolve,reject)=>pending.push({resolve,reject,params}));
  }}));
 },personal);
 return {page,errors};
}

for(const personal of [true,false]){
test(`${personal?'personal':'admin'} rapid next clicks request exactly the next ledger page and cannot skip records`,async t=>{
 const {page,errors}=await setup(t,personal);
 await page.getByRole('button',{name:'下一页',exact:true}).evaluate(button=>{button.click();button.click();});
 assert.deepEqual(await page.evaluate(()=>requests.map(row=>row.page)),[1,2]);
 assert.equal(await page.getByRole('button',{name:'下一页',exact:true}).isDisabled(),true);
 await page.evaluate(()=>pending[0].resolve(report(2)));
 await page.getByText('Page 2',{exact:true}).waitFor();
 await page.getByRole('button',{name:'下一页',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>requests.map(row=>row.page)),[1,2,3]);
 await page.evaluate(()=>pending[1].resolve(report(3)));await page.getByText('Page 3',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'下一页',exact:true}).isDisabled(),true);
 assert.match(await page.locator('.billing-total strong').textContent(),/9007199254\.740993/);
 assert.deepEqual(errors,[]);
});

test(`${personal?'personal':'admin'} reset supersedes an outstanding page and late responses cannot replace new totals or entries`,async t=>{
 const {page,errors}=await setup(t,personal);
 await page.getByRole('button',{name:'下一页',exact:true}).click();
 await page.getByRole('button',{name:'重置',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>requests.map(row=>row.page)),[1,2,1]);
 await page.evaluate(()=>pending[1].resolve({...report(1),records:1,pages:1}));
 await page.waitForFunction(()=>document.querySelector('.billing-page-number').textContent==='1 / 1');
 await page.evaluate(()=>pending[0].resolve(report(2)));
 assert.equal(await page.getByText('Page 2',{exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'下一页',exact:true}).isDisabled(),true);
 assert.deepEqual(errors,[]);
});

test(`${personal?'personal':'admin'} failed page queries show an error and reset can retry without a stuck busy state`,async t=>{
 const {page,errors}=await setup(t,personal);
 await page.getByRole('button',{name:'下一页',exact:true}).click();
 await page.evaluate(()=>pending[0].reject(Error('费用读取失败')));
 await page.getByText('费用读取失败',{exact:true}).waitFor();
 assert.equal(await page.locator('.billing-view').getAttribute('aria-busy'),'false');
 await page.getByRole('button',{name:'重置',exact:true}).click();
 await page.evaluate(()=>pending[1].resolve(report(1)));await page.getByText('Page 1',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'下一页',exact:true}).isEnabled(),true);
 assert.deepEqual(errors,[]);
});
}
