const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
test('management tool settings stay isolated, save one revision, and lock the form while saving',async t=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage();await page.setContent('<main></main>');
 await page.addScriptTag({content:fs.readFileSync('management/frontend/image-tools.js','utf8')});
 await page.evaluate(()=>{
  const item={enabled:true,provider_id:'a',model:'a-model',ratio:'2:1',resolution:'2k',quality:'auto',prompt:'Make an image'};
  window.saved=[];window.releaseSave=null;
  const data={revision:7,config:{panorama:{...item},depth:{...item,ratio:'1:1'}},ratios:['1:1','2:1'],providers:[{id:'a',name:'A',models:['a-model']},{id:'b',name:'B',models:['b-model']}]};
  document.querySelector('main').append(ManagementImageTools.create({data,save:body=>{window.saved.push(body);return new Promise(resolve=>window.releaseSave=()=>resolve({revision:8}));}}));
 });
 await page.getByLabel('供应商',{exact:true}).nth(0).selectOption('b');
 assert.equal(await page.getByLabel('图片模型',{exact:true}).nth(0).inputValue(),'');
 assert.equal(await page.getByLabel('图片模型',{exact:true}).nth(1).inputValue(),'a-model');
 await page.getByLabel('图片模型',{exact:true}).nth(0).selectOption('b-model');
 await page.getByLabel('修改原因').fill('配置图片工具');
 await page.getByRole('button',{name:'保存图片工具配置'}).click();
 assert.equal(await page.getByLabel('供应商',{exact:true}).nth(1).isDisabled(),true);
 let saved=await page.evaluate(()=>window.saved);assert.equal(saved.length,1);assert.equal(saved[0].expected_revision,7);
 assert.equal(saved[0].config.panorama.model,'b-model');assert.equal(saved[0].config.depth.model,'a-model');
 await page.evaluate(()=>window.releaseSave());await page.getByText('已保存，新提交的任务将使用此配置。').waitFor();
 await page.getByLabel('修改原因').fill('第二次调整');await page.getByRole('button',{name:'保存图片工具配置'}).click();
 saved=await page.evaluate(()=>window.saved);assert.equal(saved[1].expected_revision,8);await page.evaluate(()=>window.releaseSave());
});
