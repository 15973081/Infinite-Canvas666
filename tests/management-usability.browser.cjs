const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');

test('member filters, provider sections, dirty guards and error recovery work together',async t=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const queries=[],writes=[];let failMembers=false,failSave=false,saveGate=null;
 const provider={id:'p',version:1,configured_secrets:[],config:{name:'Test API',base_url:'https://example.com/v1',protocol:'openai',enabled:true,image_models:['image-a'],video_models:['video-a'],chat_models:['chat-a'],model_prices:[]}};
 const me={member:{id:'admin',display_name:'管理员'},permissions:['member.manage','role.manage','provider.configure','maintenance.platform','backup.platform','billing.platform'],workspaces:[{id:'space-a',name:'空间 A',permissions:['space.members.manage','task.review','maintenance.space','backup.read']}]};
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:fs.readFileSync('management/frontend/index.html','utf8')});
  if(url.pathname.startsWith('/static/')){const name=url.pathname.split('/').pop(),path=name==='billing-view.css'?'static/css/'+name:name==='billing-view.js'?'static/js/'+name:'management/frontend/'+name;return route.fulfill({contentType:name.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(path,'utf8')});}
  let data={};
  if(url.pathname==='/api/me')data=me;
  else if(url.pathname==='/api/overview')data={workspace:url.searchParams.has('workspace')?{id:'space-a',name:'空间 A'}:null,observed_at:Date.now(),manageable_spaces:1,members:{total:1,active:1,invited:0,disabled:0},tasks:{total:3,queued:0,active:0,needs_review:3},maintenance:{mode:'normal'},services:[],backup:{total:1,pending:0,latest:{status:'failed',created_at:Date.now()}}};
  else if(url.pathname==='/api/members'){
   queries.push(Object.fromEntries(url.searchParams));if(failMembers)return route.fulfill({status:503,json:{detail:{code:'unavailable'}}});
   const member={id:'m',username:'alice',display_name:'Alice',status:'active',role_ids:[],auth_version:1};
   data={members:url.searchParams.get('search')==='missing'||url.searchParams.get('status')==='disabled'?[]:[member],next:url.searchParams.get('search')==='many'&&!url.searchParams.get('after')?'cursor-1':null};
  } else if(url.pathname==='/api/tasks')data={tasks:[],counts:{needs_review:3},next:null};
  else if(url.pathname==='/api/backups')data={jobs:[],configured:false};
  else if(url.pathname==='/api/image-tools')data={revision:1,ratios:['1:1'],providers:[{id:'p',name:'Test API',models:['image-a']}],config:Object.fromEntries(['panorama','depth'].map(k=>[k,{enabled:true,provider_id:'p',model:'image-a',ratio:'1:1',resolution:'1k',quality:'auto',prompt:'original'}]))};
  else if(url.pathname==='/api/providers')data={providers:[provider],presets:{builtin:[],quickstart:[]}};
  else if(url.pathname==='/api/provider-assignments')data={provider_ids:[],primary_provider_id:null,version:1};
  else if(url.pathname==='/api/providers/p'&&request.method()==='PUT'){writes.push(request.postDataJSON());if(failSave)return route.fulfill({status:503,json:{detail:{code:'save_failed'}}});if(saveGate)await saveGate;provider.config=writes.at(-1).config;provider.version++;data=provider;}
  return route.fulfill({json:data});
 });
 await page.goto('http://127.0.0.1:8770/');await page.getByRole('button',{name:'刷新概览'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'检查最近失败备份'}).count(),1);
 await page.getByRole('button',{name:'检查最近失败备份'}).click();await page.getByRole('button',{name:'刷新记录'}).waitFor();assert.equal(await page.locator('#title').innerText(),'备份记录');
 await page.getByRole('button',{name:'概览',exact:true}).click();await page.getByRole('button',{name:'刷新概览'}).waitFor();await page.getByLabel('管理范围',{exact:true}).selectOption('space-a');
 await page.getByRole('button',{name:'处理待核对任务 · 3'}).click();await page.getByLabel('任务状态').waitFor();assert.equal(await page.getByLabel('任务状态').inputValue(),'needs_review');
 await page.getByLabel('管理范围',{exact:true}).selectOption('');
 await page.getByRole('button',{name:'成员与分配',exact:true}).click();
 await page.getByLabel('账号或名称').fill('many');await page.getByRole('button',{name:'搜索',exact:true}).click();await page.getByRole('button',{name:'下一页',exact:true}).click();
 await page.getByRole('button',{name:'回到首页'}).waitFor();assert.equal(queries.at(-1).after,'cursor-1');assert.equal(queries.at(-1).search,'many');
 await page.getByLabel('成员状态').selectOption('disabled');await page.getByText('没有符合筛选条件的成员',{exact:false}).waitFor();assert.equal(queries.at(-1).after,'');assert.equal(queries.at(-1).status,'disabled');
 await page.getByRole('button',{name:'重置筛选'}).click();await page.getByText('alice',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'重置密码',exact:true}).isVisible(),false);
 await page.locator('.row-more summary').click();assert.equal(await page.getByRole('button',{name:'重置密码',exact:true}).isVisible(),true);
 failMembers=true;await page.getByRole('button',{name:'刷新',exact:true}).click();await page.getByRole('heading',{name:'成员与分配加载失败'}).waitFor();failMembers=false;
 await page.getByRole('button',{name:'重新加载'}).click();await page.getByText('alice',{exact:true}).waitFor();
 await page.getByRole('button',{name:'供应商与分配',exact:true}).click();await page.getByRole('tab',{name:'连接',exact:true}).waitFor();
 assert.equal(await page.getByLabel(/^API Key/).isVisible(),false);
 await page.getByLabel('平台名称').fill('Changed');await page.getByRole('tab',{name:'凭证',exact:true}).click();await page.getByLabel(/^API Key/).fill('test-key');
 await page.getByRole('tab',{name:'模型',exact:true}).click();await page.getByRole('tab',{name:'高级配置',exact:true}).click();await page.getByLabel(/^代理地址/).fill('https://proxy.example.com');
 await page.getByRole('tab',{name:'连接',exact:true}).click();assert.equal(await page.getByLabel('平台名称').inputValue(),'Changed');
 await page.getByLabel('平台名称').fill('');await page.getByRole('tab',{name:'模型',exact:true}).click();await page.getByRole('button',{name:'保存配置',exact:true}).first().click();assert.equal(await page.getByRole('tab',{name:'连接',exact:true}).getAttribute('aria-selected'),'true');assert.equal(writes.length,0);await page.getByLabel('平台名称').fill('Changed');
 page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'成员与分配',exact:true}).click();assert.equal(await page.locator('#title').innerText(),'供应商与分配');
 failSave=true;await page.getByRole('button',{name:'保存配置',exact:true}).first().click();await page.locator('.provider-save-status').filter({hasText:'操作未完成'}).waitFor();assert.equal(await page.getByLabel('平台名称').inputValue(),'Changed');failSave=false;
 let release;saveGate=new Promise(resolve=>release=resolve);await page.getByRole('button',{name:'保存配置',exact:true}).first().click();
 await page.waitForFunction(()=>document.querySelector('.provider-editor').dataset.saving==='true');assert.equal(await page.getByLabel('平台名称').isDisabled(),true);release();
 await page.getByText('供应商配置已保存',{exact:true}).waitFor();
 await page.getByRole('button',{name:'模型与计费',exact:true}).click();await page.getByLabel('修改原因').fill('unsaved billing');assert.equal(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;}),true);page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'成员与分配',exact:true}).click();assert.equal(await page.locator('#title').innerText(),'模型与计费');page.once('dialog',dialog=>dialog.accept());assert.equal(writes.length,2);assert.equal(writes[1].config.name,'Changed');assert.equal(writes[1].secrets.api_key,'test-key');assert.equal(writes[1].config.proxy_url,'https://proxy.example.com');
 await page.getByRole('button',{name:'成员与分配',exact:true}).click();await page.getByText('alice',{exact:true}).waitFor();
 await page.getByRole('button',{name:'创建成员',exact:true}).click();await page.getByLabel('显示名称').fill('Draft');page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'取消',exact:true}).click();assert.equal(await page.locator('#dialog').evaluate(e=>e.open),true);
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'取消',exact:true}).click();assert.equal(await page.locator('#dialog').evaluate(e=>e.open),false);
 await page.getByLabel('管理范围',{exact:true}).selectOption('space-a');await page.getByRole('button',{name:'图片工具',exact:true}).click();await page.getByLabel('生成提示词').first().fill('draft');page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'成员与分配',exact:true}).click();assert.equal(await page.locator('#title').innerText(),'图片工具');page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'成员与分配',exact:true}).click();await page.getByText('alice',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;}),false);
 assert.deepEqual(errors,[]);
});
