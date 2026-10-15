const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
async function setup(t){
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage();await page.setContent('<link id="billing-view-style"><main></main>');
 await page.addScriptTag({content:fs.readFileSync('static/js/billing-view.js','utf8')});
 await page.evaluate(async()=>{
  window.calls=[];window.failPreview=false;window.previewCount=0;
  document.querySelector('main').append(await CanvasBillingUI.create({fetchReport:async()=>({page:1,pages:1,records:0,totals:[],accounts:[],entries:[]}),assignmentApi:async(path,init={})=>{
   calls.push({path,body:init.body&&JSON.parse(init.body)});
   if(path.startsWith('assignment/choices'))return {canvases:[{canvas_id:'canvas-a',title:'Canvas',records:1}],members:[{id:'member-a',username:'alice',display_name:'Alice'}]};
   if(path==='assignment/preview'){
    if(failPreview)throw Error('预览读取失败');
    return {preview_token:'token-'+(++previewCount),records:1,totals:[{currency:'CNY',amount_micros:'1234567'}],unknown:0,skipped:0,target:{display_name:'Alice',username:'alice'}};
   }
   return new Promise((resolve,reject)=>{window.completeApply=resolve;window.failApply=reject;});
  }}));
 });
 await page.getByRole('button',{name:'按画布补录归属',exact:true}).click();
 await page.getByLabel('来源画布').selectOption('canvas-a');await page.getByLabel('费用归属账号').selectOption('member-a');await page.getByLabel('补录原因').fill('核对历史费用');
 await page.getByRole('button',{name:'预览归属',exact:true}).click();
 return page;
}

test('failed re-preview invalidates the previous approval and preserves selected conditions',async t=>{
 const page=await setup(t);assert.equal(await page.getByRole('button',{name:'确认归属',exact:true}).isEnabled(),true);
 await page.evaluate(()=>{failPreview=true;});await page.getByRole('button',{name:'预览归属',exact:true}).click();
 await page.getByText('预览读取失败',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'确认归属',exact:true}).isDisabled(),true);
 assert.equal(await page.getByLabel('补录原因').inputValue(),'核对历史费用');
 await page.evaluate(()=>{failPreview=false;});await page.getByRole('button',{name:'预览归属',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'确认归属',exact:true}).isEnabled(),true);
});

test('an uncertain assignment locks its conditions and close controls then requires a new preview',async t=>{
 const page=await setup(t);await page.getByRole('button',{name:'确认归属',exact:true}).click();
 for(const label of ['来源画布','费用归属账号','补录原因'])assert.equal(await page.getByLabel(label).isDisabled(),true);
 assert.equal(await page.getByRole('button',{name:'关闭',exact:true}).isDisabled(),true);
 await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').evaluate(node=>node.open),true);
 await page.evaluate(()=>failApply(Error('补录结果未确认')));await page.getByText('补录结果未确认',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'确认归属',exact:true}).isDisabled(),true);
 assert.equal(await page.getByLabel('补录原因').isEnabled(),true);
 await page.getByRole('button',{name:'预览归属',exact:true}).click();await page.getByRole('button',{name:'确认归属',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>calls.filter(call=>call.path==='assignment/apply').map(call=>call.body.preview_token)),['token-1','token-2']);
 await page.evaluate(()=>completeApply({assigned:1}));await page.locator('dialog').waitFor({state:'detached'});
});
