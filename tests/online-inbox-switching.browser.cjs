const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');

test('inbox tabs preserve layout while loading, ignore repeated tabs and discard stale reads',async t=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const requests=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://inbox.test/',r=>r.fulfill({contentType:'text/html',body:'<style>body{margin:0;padding:24px}#stage{height:1000px}</style><div id="stage"></div><section id="host"></section>'}));
 await page.route('**/api/online-works?*',r=>{requests.push({route:r,state:new URL(r.request().url()).searchParams.get('state')});});
 await page.goto('http://inbox.test/');
 for(const path of ['static/css/studio-tokens.css','static/css/online-inbox.css'])await page.addStyleTag({content:fs.readFileSync(path,'utf8')});
 await page.addScriptTag({content:fs.readFileSync('static/js/online-inbox.js','utf8')});
 await page.evaluate(()=>{window.inbox=OnlineInbox.attach(document.getElementById('host'));});
 const reply=async(index,items=[])=>requests[index].route.fulfill({json:{items,next_cursor:null,summary:{counts:{},bytes:{}},folders:[],models:[]}});
 await page.waitForFunction(()=>document.querySelector('#inboxGrid')?.getAttribute('aria-busy')==='true');
 while(requests.length<1)await new Promise(r=>setTimeout(r,10));
 await reply(0);await page.locator('.inbox-empty').waitFor();
 await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
 const before=await page.evaluate(()=>({y:scrollY,height:document.documentElement.scrollHeight,top:document.querySelector('.inbox-tools').getBoundingClientRect().top}));
 await page.getByRole('tab',{name:'未整理',exact:true}).click();
 assert.equal(requests.length,1);
 await page.getByRole('tab',{name:'已保留',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#inboxGrid').getAttribute('aria-busy')==='true');
 assert.equal(await page.locator('.inbox-empty').count(),1,'old content stays mounted during request');
 assert.equal(await page.locator('#inboxGrid').evaluate(e=>e.inert),true);
 const pending=await page.evaluate(()=>({y:scrollY,height:document.documentElement.scrollHeight,top:document.querySelector('.inbox-tools').getBoundingClientRect().top}));
 assert.deepEqual(pending,before,'loading must not collapse document or move the toolbar');
 await page.getByRole('tab',{name:'回收站',exact:true}).click();
 while(requests.length<3)await new Promise(r=>setTimeout(r,10));
 await reply(2);await page.getByText('回收站为空',{exact:true}).waitFor();
 await reply(1).catch(()=>{}); // Aborted older response must not replace the newer tab.
 assert.equal(await page.getByRole('tab',{name:'回收站',exact:true}).getAttribute('aria-selected'),'true');
 assert.equal(await page.getByText('回收站为空',{exact:true}).count(),1);
 assert.equal(await page.locator('#inboxGrid').evaluate(e=>e.inert),false);
 assert.deepEqual(errors,[]);
});
