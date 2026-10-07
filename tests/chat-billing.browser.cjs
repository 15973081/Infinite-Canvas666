const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const out=path.resolve('.local/chat-billing');fs.mkdirSync(out,{recursive:true});

test('chat billing switches, validation, save isolation and responsive controls',async t=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.setContent('<main style="max-width:1120px;margin:auto;padding:24px"></main>');
 await page.addStyleTag({content:fs.readFileSync('management/frontend/management.css','utf8')});
 await page.addScriptTag({content:fs.readFileSync('management/frontend/model-billing.js','utf8')});
 await page.evaluate(async()=>{
  const row={id:'test-provider',version:3,config:{name:'测试厂商',chat_models:['chat-A','chat-B'],image_models:['image-A'],model_prices:[{kind:'image',model:'image-A',billing_type:'per_image',unit_price:'1'}]}};
  window.writes=[];
  document.querySelector('main').append(await ManagementModelBilling.create({catalog:{providers:[row]},save:(_row,body)=>{window.writes.push(structuredClone(body));return new Promise((resolve,reject)=>{window.resolveSave=()=>resolve({version:body.expected_version+1,config:body.config});window.rejectSave=()=>reject(Error('保存失败，请重试'));});}}));
 });
 await page.getByLabel('类型',{exact:true}).selectOption('chat');
 const tokens=page.getByRole('checkbox',{name:'开启 Token 计费'}),calls=page.getByRole('checkbox',{name:'开启按次计费'});
 const input=page.getByLabel('输入价格（元 / 百万 Token）'),output=page.getByLabel('输出价格（元 / 百万 Token）'),unit=page.getByLabel('单次询问价格（元 / 次）');
 assert.equal(await tokens.isChecked(),false);assert.equal(await input.isDisabled(),true);
 await tokens.check();assert.equal(await calls.isChecked(),false);assert.equal(await input.isEnabled(),true);assert.equal(await unit.isDisabled(),true);
 await calls.check();assert.equal(await tokens.isChecked(),false);assert.equal(await input.isDisabled(),true);
 await tokens.check();await input.fill('2');await output.fill('8');await page.getByLabel('缓存输入价格（选填）').fill('0.5');
 await page.getByLabel('修改原因').fill('启用对话 Token 计费');
 await page.getByRole('button',{name:'保存当前模型配置'}).click();
 assert.equal(await tokens.isDisabled(),true);assert.equal(await page.getByLabel('模型',{exact:true}).isDisabled(),true);
 const body=await page.evaluate(()=>window.writes[0]);assert.equal(body.expected_version,3);
 assert.equal(body.config.model_prices.find(p=>p.kind==='image').unit_price,'1');
 const price=body.config.model_prices.find(p=>p.kind==='chat');assert.equal(price.billing_type,'per_million_tokens');assert.equal(price.cached_input_price,'0.5');assert.equal(price.stream_usage,true);
 await page.evaluate(()=>window.rejectSave());await page.getByText('保存失败，请重试',{exact:true}).waitFor();
 assert.equal(await input.inputValue(),'2');assert.equal(await unit.isDisabled(),true);
 await page.getByRole('button',{name:'保存当前模型配置'}).click();await page.evaluate(()=>window.resolveSave());await page.getByText(/已保存 chat-A/).waitFor();
 await page.screenshot({path:path.join(out,'management-token-desktop.png'),fullPage:true});
 await page.getByLabel('模型',{exact:true}).selectOption('chat-B');assert.equal(await tokens.isChecked(),false);
 await calls.check();await unit.fill('0.1');await page.getByLabel('修改原因').fill('启用按次计费');
 await page.getByRole('button',{name:'保存当前模型配置'}).click();
 const next=await page.evaluate(()=>window.writes.at(-1));assert.equal(next.expected_version,4);
 assert.equal(next.config.model_prices.find(p=>p.model==='chat-A').input_price,'2');
 assert.equal(next.config.model_prices.find(p=>p.model==='chat-B').billing_type,'per_call');
 await page.evaluate(()=>window.resolveSave());await page.getByText(/已保存 chat-B/).waitFor();
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile controls should not overflow');
 await page.screenshot({path:path.join(out,'management-per-call-mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);
});

test('chat cost displays exact server money and missing usage',async t=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage();await page.setContent('<div id="message">模型回复</div><div id="pending">模型回复</div>');
 await page.addStyleTag({content:fs.readFileSync('static/css/chat-cost.css','utf8')});
 await page.addScriptTag({content:fs.readFileSync('static/js/chat-cost.js','utf8')});
 await page.evaluate(()=>{
  ChatCost.decorate(document.querySelector('#message'),{kind:'chat',status:'priced',billing_type:'per_million_tokens',amount_micros:5700,usage:{input_tokens:1000,output_tokens:500,cached_input_tokens:200}});
  ChatCost.decorate(document.querySelector('#pending'),{kind:'chat',status:'unknown',reason:'missing_usage',billing_type:'per_million_tokens'});
 });
 assert.match(await page.locator('#message').innerText(),/0\.0057/);
 assert.match(await page.locator('#message').innerText(),/1000/);assert.match(await page.locator('#pending').innerText(),/待核算/);
});
