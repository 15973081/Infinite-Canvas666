const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'), origin='http://skills.test';
const out=path.join(root,'.local','skill-library');fs.mkdirSync(out,{recursive:true});
const content={name:'prompt-review',description:'将灵感整理成明确的主体、构图和光线。',instructions:'先确认目标，再优化提示词。',references:{'references/tips.md':'使用具体描述'},warnings:[],files:[]};
async function fixture(t,pageName){
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1440,height:960}}), calls=[], errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.CanvasSession={ready:Promise.resolve(),enabled:true,context:{member:{id:'m1'},workspace:{id:'w1'}},errorText:data=>data.detail?.code||'请求失败'};localStorage.setItem('studio_theme','dark');});
 const skills=[{id:'s1',...content,origin_workspace_id:'w1',origin_workspace_name:'创作团队',uploader_name:'林岳',visibility:'workspace',installed_version_id:'v1',enabled:true,can_edit:true,can_uninstall:true},
 {id:'s2',name:'cinematic-prompts',description:'电影镜头与画面氛围的提示词结构。',origin_workspace_id:'w2',origin_workspace_name:'影像实验室',uploader_name:'陈星',visibility:'shared',installed_version_id:null,enabled:false,can_install:true}];
 let fail=false,chatFail=false,canImport=true;
 await page.route('**/*',async route=>{
  const req=route.request(), url=new URL(req.url());if(url.origin!==origin)return route.abort();
  if(url.pathname.startsWith('/api/')){
   const method=req.method();calls.push({path:url.pathname,method,body:req.postData(),q:url.searchParams.get('q')});
   if(url.pathname==='/api/skills'){
    if(fail)return route.fulfill({status:503,json:{detail:'暂时无法加载'}});
    let rows=skills.filter(s=>url.searchParams.get('scope')!=='enabled'||(s.enabled&&s.installed_version_id));
    const q=url.searchParams.get('q');if(q)rows=rows.filter(s=>(s.name+s.description+s.uploader_name).includes(q));
    return route.fulfill({json:{skills:rows,can_import:canImport,has_more:false}});
   }
   if(url.pathname==='/api/skills/preview')return route.fulfill({json:content});
   if(url.pathname==='/api/skills/import')return route.fulfill({json:{id:'s3'}});
   if(url.pathname.endsWith('/preference')){const s=skills.find(s=>url.pathname.includes(s.id));s.enabled=req.postDataJSON().enabled;return route.fulfill({json:{enabled:s.enabled}});}
   if(url.pathname.endsWith('/install')){const s=skills.find(s=>url.pathname.includes(s.id));s.installed_version_id=method==='DELETE'?null:'v2';s.enabled=method!=='DELETE';s.can_uninstall=true;return route.fulfill({json:{installed:method!=='DELETE'}});}
   if(url.pathname==='/api/skills/s1')return route.fulfill({json:{...content,uploader_name:'林岳',origin_workspace_name:'创作团队'}});
   if(url.pathname==='/api/chat/stream'){
    if(chatFail)return route.fulfill({status:409,json:{detail:'技能未安装或未启用'}});
    const payload=req.postDataJSON(),user={role:'user',content:payload.message,skill_refs:payload.skill_ids.map(id=>({id,name:skills.find(s=>s.id===id).name}))},message={role:'assistant',content:'优化后的提示词'},conversation={id:'c1',title:'提示词优化',messages:[user,message]};
    return route.fulfill({contentType:'text/event-stream',body:[{type:'meta',conversation:{...conversation,messages:[user]}},{type:'delta',delta:message.content},{type:'done',conversation,message}].map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')});
   }
   if(url.pathname==='/api/config')return route.fulfill({json:{api_providers:[{id:'comfly',name:'API',enabled:true,chat_models:['test-chat']}],chat_model:'test-chat',chat_models:['test-chat']}});
   if(url.pathname==='/api/conversations')return route.fulfill({json:{conversations:[]}});
   return route.fulfill({json:{}});
  }
  const filename=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!filename.startsWith(root+path.sep)||!fs.existsSync(filename))return route.fulfill({status:404,body:'Missing'});
  return route.fulfill({path:filename});
 });
 await page.goto(origin+'/static/'+pageName+'.html');
 return {page,calls,errors,skills,setFail:value=>fail=value,setChatFail:value=>chatFail=value,setCanImport:value=>canImport=value};
}
test('skill library search, install, enable, preview, retry and responsive dark layout',async t=>{
 const {page,calls,errors,setFail}=await fixture(t,'skill-library');await page.locator('.skill-card').first().waitFor();
 assert.match(await page.locator('#skillGrid').innerText(),/上传者：林岳/);assert.match(await page.locator('#skillGrid').innerText(),/影像实验室/);
 await page.getByRole('button',{name:'安装到本空间'}).click();await page.getByRole('checkbox',{name:'启用 cinematic-prompts'}).waitFor();
 await page.getByRole('checkbox',{name:'启用 prompt-review'}).uncheck();
 assert.ok(calls.some(c=>c.path==='/api/skills/s1/preference'&&JSON.parse(c.body).enabled===false));
 await page.locator('#skillSearch').fill('林岳');await page.waitForFunction(()=>document.querySelectorAll('.skill-card').length===1);
 await page.locator('#skillSearch').fill('不存在');await page.locator('.skill-empty').waitFor();assert.match(await page.locator('.skill-empty').innerText(),/没有匹配/);
 await page.locator('#skillSearch').fill('');await page.waitForFunction(()=>document.querySelectorAll('.skill-card').length===2);
 await page.locator('.skill-card').first().getByRole('button',{name:'查看详情'}).click();await page.getByRole('dialog').getByText('先确认目标，再优化提示词。',{exact:true}).waitFor();
 await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
 await page.locator('#skillFile').setInputFiles({name:'SKILL.md',mimeType:'text/markdown',buffer:Buffer.from('sample')});const dialog=page.getByRole('dialog');await dialog.getByRole('combobox').selectOption('shared');await dialog.getByRole('button',{name:'确认导入并安装'}).click();await dialog.waitFor({state:'detached'});assert.ok(calls.some(c=>c.path==='/api/skills/import'&&c.body.includes('shared')));
 for(const theme of ['dark']){assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(9, 11, 9)');await page.screenshot({path:path.join(out,'library-'+theme+'.png')});}
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'library-mobile.png')});
 setFail(true);await page.getByRole('button',{name:'刷新',exact:true}).click();await page.getByRole('button',{name:'加载失败，点击重试'}).waitFor();setFail(false);await page.getByRole('button',{name:'加载失败，点击重试'}).click();await page.locator('.skill-card').first().waitFor();assert.deepEqual(errors,[]);
});
test('GPT @ selection stays visible, is keyboard accessible and only sends skill IDs',async t=>{
 const {page,calls,errors,setChatFail}=await fixture(t,'gpt-chat');await page.waitForFunction(()=>typeof ChatSkills!=='undefined'&&typeof config!=='undefined');
 const trigger=page.locator('#chatSkillButton'),icon=trigger.locator('svg');
 const metrics=await page.evaluate(()=>[...document.querySelectorAll('.upload-btn svg')].map(svg=>{const style=getComputedStyle(svg);return {width:style.width,height:style.height,stroke:style.strokeWidth};}));
 assert.deepEqual(metrics[1],metrics[0]);assert.equal(await icon.getAttribute('aria-hidden'),'true');
 await icon.click();await page.locator('.chat-skill-option').waitFor();assert.equal(await trigger.getAttribute('aria-expanded'),'true');
 await icon.locator('circle').click();assert.equal(await page.locator('#chatSkillPicker').isVisible(),false);assert.equal(await trigger.getAttribute('aria-expanded'),'false');
 await trigger.focus();await trigger.press('Enter');await page.locator('.chat-skill-option').waitFor();await page.locator('#chatSkillSearch').press('Escape');
 await page.locator('#chatTitle').click();
 for(const theme of ['dark']){await page.waitForTimeout(250);await page.locator('.composer').screenshot({path:path.join(out,'chat-skill-trigger-'+theme+'.png')});}
 const input=page.locator('#messageInput');await input.fill('优化一段夜景 @prompt');await page.locator('.chat-skill-option').waitFor();
 const box=await page.locator('#chatSkillPicker').boundingBox();assert.ok(box.y>=0&&box.width>200);assert.ok(await page.locator('#chatSkillPicker').isVisible());
 await page.screenshot({path:path.join(out,'chat-at-dark.png')});await input.press('Enter');assert.equal(calls.filter(c=>c.path==='/api/chat/stream').length,0);assert.match(await page.locator('#chatSkillSelection').innerText(),/@prompt-review/);assert.equal(await input.inputValue(),'优化一段夜景 ');
 setChatFail(true);await page.locator('#sendBtn').click();await page.waitForFunction(()=>!document.getElementById('sendBtn').disabled);assert.equal(await input.inputValue(),'优化一段夜景');assert.equal(await page.locator('.chat-skill-chip').count(),1);
 setChatFail(false);await page.locator('#sendBtn').click();await page.waitForFunction(()=>document.querySelectorAll('.chat-skill-chip').length===0);const sent=JSON.parse(calls.filter(c=>c.path==='/api/chat/stream').at(-1).body);assert.deepEqual(sent.skill_ids,['s1']);assert.equal(sent.message,'优化一段夜景');assert.ok(!sent.tools);assert.equal(await page.locator('.chat-skill-history').count(),1);
 await page.setViewportSize({width:390,height:844});await page.locator('#chatSkillButton').click();await page.locator('.chat-skill-option').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'chat-at-mobile.png')});await page.locator('#chatSkillSearch').press('Escape');assert.equal(await page.locator('#chatSkillPicker').isVisible(),false);assert.deepEqual(errors,[]);
});
test('an unavailable remembered conversation returns an empty composer without losing skills UI',async t=>{
 const {page,errors}=await fixture(t,'gpt-chat');
 await page.evaluate(()=>localStorage.setItem('gpt_chat_last_conversation_v1','deleted-or-other-space'));
 await page.route('**/api/conversations/deleted-or-other-space',route=>route.fulfill({status:404,json:{detail:'对话不存在'}}));
 await page.reload();await page.waitForFunction(()=>typeof ChatSkills!=='undefined'&&!localStorage.getItem('gpt_chat_last_conversation_v1'));
 await page.locator('#chatSkillButton').click();await page.locator('.chat-skill-option').waitFor();assert.deepEqual(errors,[]);
});

test('private chat attachment manager supports sharing, deletion retry and mobile layout',async t=>{
 const {page,errors}=await fixture(t,'gpt-chat');
 const files=[{id:'ast_'+'1'.repeat(32),name:'《沉锋》第三集B_分镜V5.xlsx',size:2048,kind:'file',status:'ready',shared:false,url:'/assets/cloud/test/分镜.xlsx'}];
 let failDelete=true;const writes=[];page.on('dialog',dialog=>dialog.accept());
 await page.route('**/api/chat/attachments**',route=>{const req=route.request();if(req.method()==='GET')return route.fulfill({json:{files,next_offset:null}});writes.push({method:req.method(),url:req.url(),body:req.postData()});if(req.method()==='PATCH'){files[0].shared=req.postDataJSON().shared;return route.fulfill({json:{shared:files[0].shared}});}if(failDelete){files[0].status='deleting';return route.fulfill({status:503,json:{detail:'附件已停止访问，但原文件清理未完成，请重试删除。'}});}files.length=0;return route.fulfill({json:{deleted:true}});});
 await page.getByRole('button',{name:'我的对话附件'}).click();const dialog=page.getByRole('dialog',{name:'我的对话附件'});
 await dialog.getByText(/《沉锋》第三集B_分镜V5.xlsx/).waitFor();
 await dialog.getByRole('button',{name:'共享给当前空间'}).click();await dialog.getByRole('button',{name:'取消共享'}).waitFor();assert.deepEqual(JSON.parse(writes[0].body),{shared:true});
 await dialog.getByRole('button',{name:'彻底删除'}).click();await dialog.getByText(/原文件清理未完成/).waitFor();
 await dialog.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:'我的对话附件'}).click();await dialog.getByRole('button',{name:'重试删除'}).waitFor();
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'chat-private-attachments-mobile.png')});
 failDelete=false;await dialog.getByRole('button',{name:'重试删除'}).click();await dialog.getByText('没有本人上传的对话附件。').waitFor();assert.ok(writes.at(-1).url.includes('confirm_permanent=true'));assert.deepEqual(errors,[]);
});

test('attachment capacity, unused filter, size order and confirmed batch deletion',async t=>{
 const {page,errors}=await fixture(t,'gpt-chat');
 const files=[{id:'ast_'+'2'.repeat(32),name:'使用中.txt',size:10,status:'ready',shared:false,referenced:true},
  {id:'ast_'+'3'.repeat(32),name:'未发送.xlsx',size:100,status:'ready',shared:false,referenced:false}];
 const calls=[],deletes=[];page.on('dialog',dialog=>dialog.accept());
 await page.route('**/api/chat/attachments**',route=>{const req=route.request(),url=new URL(req.url());if(req.method()==='DELETE'){deletes.push(url.pathname.split('/').at(-1));files.splice(files.findIndex(f=>f.id===deletes.at(-1)),1);return route.fulfill({json:{deleted:true}});}calls.push(url.search);let shown=files.filter(f=>url.searchParams.get('unreferenced')!=='true'||!f.referenced);if(url.searchParams.get('sort')==='size')shown.sort((a,b)=>b.size-a.size);return route.fulfill({json:{files:shown,next_offset:null,usage:{used_bytes:110,reserved_bytes:0,quota_bytes:1024,remaining_bytes:914}}});});
 await page.getByRole('button',{name:'我的对话附件'}).click();const dialog=page.getByRole('dialog',{name:'我的对话附件'});
 await dialog.getByText(/已占用.*剩余/).waitFor();assert.ok(await dialog.getByRole('progressbar',{name:'个人附件容量'}).isVisible());
 await dialog.getByRole('combobox',{name:'附件排序'}).selectOption('size');await page.waitForTimeout(50);
 assert.match(await dialog.locator('article').first().innerText(),/未发送.xlsx/);
 await dialog.getByRole('checkbox',{name:'仅看未引用'}).check();await page.waitForTimeout(50);
 assert.equal(await dialog.locator('article').count(),1);assert.ok(calls.some(url=>url.includes('sort=size')&&url.includes('unreferenced=true')));
 await dialog.getByRole('checkbox',{name:'选择 未发送.xlsx'}).check();await dialog.getByRole('button',{name:'删除选中的未引用附件'}).click();
 await dialog.getByText('没有本人上传的对话附件。').waitFor();assert.deepEqual(deletes,['ast_'+'3'.repeat(32)]);assert.equal(files[0].name,'使用中.txt');assert.deepEqual(errors,[]);
});

test('context preflight displays estimate and preserves input without starting an over-limit chat',async t=>{
 const {page,calls,errors}=await fixture(t,'gpt-chat');
 await page.route('**/api/chat/budget',route=>route.fulfill({json:{estimated_input_tokens:250000,context_tokens:131072,reserved_output_tokens:4096,over_limit:true,source:'platform_default'}}));
 await page.locator('#messageInput').fill('保留这段超长请求');await page.locator('#sendBtn').click();
 await page.locator('#chatContextBudget').waitFor({state:'visible'});
 await page.getByText(/请减少引用、拆分附件或切换更大容量模型/).waitFor();
 assert.equal(await page.locator('#messageInput').inputValue(),'保留这段超长请求');
 assert.equal(calls.filter(call=>call.path==='/api/chat/stream').length,0);
 assert.match(await page.locator('#chatContextBudget').innerText(),/平台默认上限/);assert.deepEqual(errors,[]);
});

test('attachment manager explains load failures, retries and preserves visible files on refresh failure',async t=>{
 const {page,errors}=await fixture(t,'gpt-chat');let fail=true;
 await page.route('**/api/chat/attachments**',route=>fail
  ? route.fulfill({status:403,json:{detail:{code:'permission_denied'}}})
  : route.fulfill({json:{files:[{id:'ast_'+'4'.repeat(32),name:'《沉锋》第三集B_分镜V5.xlsx',size:287232,status:'ready',shared:false,referenced:false,url:'/assets/storyboard.xlsx'}],next_offset:null,usage:{used_bytes:287232,reserved_bytes:0,quota_bytes:1024**3,remaining_bytes:1024**3-287232}}}));
 await page.getByRole('button',{name:'我的对话附件'}).click();
 const dialog=page.getByRole('dialog',{name:'我的对话附件',exact:true});
 await dialog.getByText('当前账号没有查看或管理附件的权限。').waitFor();
 assert.ok(await dialog.getByRole('progressbar',{name:'个人附件容量'}).isHidden());
 assert.ok(await dialog.getByRole('button',{name:'删除选中的未引用附件'}).isDisabled());

 await dialog.screenshot({path:path.join(out,'attachments-upgraded-error-light.png')});
 fail=false;await dialog.getByRole('button',{name:'重试加载',exact:true}).click();
 await dialog.getByRole('heading',{name:'《沉锋》第三集B_分镜V5.xlsx'}).waitFor();
 assert.ok(await dialog.getByRole('progressbar',{name:'个人附件容量'}).isVisible());
 await dialog.screenshot({path:path.join(out,'attachments-upgraded-light.png')});
 await dialog.getByRole('checkbox',{name:'选择 《沉锋》第三集B_分镜V5.xlsx'}).check();
 assert.ok(await dialog.getByRole('button',{name:'删除选中的未引用附件'}).isEnabled());
 fail=true;await dialog.getByRole('button',{name:'刷新',exact:true}).click();
 await dialog.getByText('当前账号没有查看或管理附件的权限。').waitFor();
 assert.equal(await dialog.locator('article').count(),1);
 assert.ok(await dialog.getByRole('checkbox',{name:'选择 《沉锋》第三集B_分镜V5.xlsx'}).isChecked());
 fail=false;await dialog.getByRole('button',{name:'重试加载',exact:true}).click();
 await dialog.getByRole('checkbox',{name:'选择 《沉锋》第三集B_分镜V5.xlsx'}).waitFor();
 await dialog.screenshot({path:path.join(out,'attachments-upgraded-dark.png')});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth));
 await dialog.screenshot({path:path.join(out,'attachments-upgraded-mobile.png')});
 await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
 assert.equal(await page.evaluate(()=>document.activeElement.id),'chatAttachmentManager');assert.deepEqual(errors,[]);
});

test('personal attachment audit loads pages, retries, and returns focus on mobile',async t=>{
 const {page,errors}=await fixture(t,'gpt-chat');let fail=true;const auditCalls=[];
 await page.route('**/api/chat/attachments**',route=>{
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/audit')){
   auditCalls.push(url.search);
   if(fail)return route.fulfill({status:503,json:{detail:'记录加载失败，请重试。'}});
   const older=url.searchParams.has('before');
   return route.fulfill({json:{events:[{label:older?'共享给空间':'原文件清理完成',actor:older?'本人':'后台任务',asset_id:'ast_'+'1'.repeat(32),created_at:'2026-10-08T00:00:00Z',attempts:older?undefined:2}],next_before:older?null:'12'}});
  }
  return route.fulfill({json:{files:[],next_offset:null}});
 });
 await page.getByRole('button',{name:'我的对话附件'}).click();
 const manager=page.getByRole('dialog',{name:'我的对话附件',exact:true});
 await manager.getByRole('button',{name:'共享与删除记录',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'附件共享与删除记录',exact:true});
 await dialog.getByText('记录加载失败，请重试。').waitFor();fail=false;
 await dialog.getByRole('button',{name:'重试加载记录'}).click();await dialog.getByText(/原文件清理完成.*后台任务/).waitFor();
 await dialog.getByRole('button',{name:'加载更多记录'}).click();await dialog.getByText(/共享给空间.*本人/).waitFor();
 assert.ok(auditCalls.includes('?before=12'));assert.equal(await dialog.locator('article').count(),2);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
 assert.equal(await page.evaluate(()=>document.activeElement.textContent),'共享与删除记录');
 assert.ok(await manager.isVisible());assert.deepEqual(errors,[]);
});

for(const kind of ['docx','xlsx'])test(kind+' preview applies authoritative ranges and sends selection metadata',async t=>{
 const {page,calls,errors}=await fixture(t,'gpt-chat');const seen=[];let fail=true;
 const ref={name:'分镜.'+kind,url:'/assets/input/preview.'+kind,kind:'file'};
 await page.route('**/api/chat/attachments',route=>route.fulfill({json:{files:[ref]}}));
 await page.route('**/api/chat/attachments/preview',route=>{
  const payload=route.request().postDataJSON();seen.push(payload);
  if(fail)return route.fulfill({status:503,json:{detail:'解析暂时失败，请重试。'}});
  if(payload.selection?.sheets?.some(s=>s.region==='B3:A2'))return route.fulfill({status:422,json:{detail:'选择区域起止顺序错误。'}});
  return route.fulfill({json:{kind,sha256:'a'.repeat(64),sections:kind==='docx'?[{id:'section-0',title:'第一章'},{id:'section-1',title:'第二章'}]:[],
   sheets:kind==='xlsx'?[{name:'分镜',rows:20,columns:4,hidden:false},{name:'人物',rows:10,columns:3,hidden:true}]:[],
   warnings:['内嵌图片内容未分析。'],text:payload.selection?'选择范围正文':'完整预览正文',characters:20,preview_truncated:false,truncated:false}});
 });
 await page.locator('#attachmentInput').setInputFiles({name:ref.name,mimeType:'application/octet-stream',buffer:Buffer.from('office fixture')});
 await page.getByRole('button',{name:'解析预览',exact:true}).click();const dialog=page.getByRole('dialog',{name:'附件解析预览',exact:true});
 await dialog.getByText('解析暂时失败，请重试。').waitFor();fail=false;
 await dialog.getByRole('button',{name:'更新预览'}).click();await dialog.getByText('完整预览正文').waitFor();
 await dialog.getByRole('checkbox',{name:'引用全文',exact:true}).uncheck();
 if(kind==='docx')await dialog.getByRole('checkbox',{name:'第二章',exact:true}).uncheck();
 else{
  await dialog.getByRole('checkbox',{name:/人物/}).uncheck();
  await dialog.getByRole('textbox',{name:'分镜 单元格区域'}).fill('B3:A2');
  await dialog.getByRole('button',{name:'应用引用范围'}).click();await dialog.getByText('选择区域起止顺序错误。').waitFor();assert.ok(await dialog.isVisible());
  await dialog.getByRole('textbox',{name:'分镜 单元格区域'}).fill('A2:B3');
  await dialog.getByRole('button',{name:'更新预览'}).click();await dialog.getByText('选择范围正文').waitFor();
 }
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await dialog.screenshot({path:path.join(out,'chat-document-preview-'+kind+'-mobile.png')});
 await dialog.getByRole('button',{name:'应用引用范围'}).click();await dialog.waitFor({state:'detached'});
 await page.getByRole('button',{name:'已选范围',exact:true}).waitFor();
 await page.locator('#messageInput').fill('分析所选范围');await page.locator('#sendBtn').click();await page.waitForFunction(()=>!document.getElementById('sendBtn').disabled);
 const payload=JSON.parse(calls.find(c=>c.path==='/api/chat/stream').body),selection=payload.reference_images[0].selection;
 assert.equal(selection.sha256,'a'.repeat(64));assert.equal(selection.kind,kind);
 if(kind==='docx')assert.deepEqual(selection.sections,['section-0']);else assert.deepEqual(selection.sheets,[{name:'分镜',region:'A2:B3'}]);
 assert.ok(seen.some(p=>p.selection));assert.deepEqual(errors,[]);
});

test('personal data retries reads and native ZIP download avoids buffering in JavaScript',async t=>{
 const {page,errors}=await fixture(t,'gpt-chat');let readFail=true,exportFail=true;const writes=[];
 await page.route('**/api/account/data',route=>readFail?route.fulfill({status:503,json:{detail:'读取暂时失败'}}):route.fulfill({json:{member:{id:'m1',username:'member-test',display_name:'林岳'},conversations:2,objects:3,bytes:4096,workspaces:[],retained:['费用与审计独立保留。']}}));
 await page.route('**/api/account/data/export',route=>{
  writes.push(route.request().postData());
  if(exportFail)return route.fulfill({status:409,json:{detail:'附件仍在清理，请稍后重新导出。'}});
  return route.fulfill({headers:{'Content-Disposition':'attachment; filename="personal-data.zip"'},contentType:'application/zip',body:'PK-download-test'});
 });
 await page.addScriptTag({url:origin+'/static/js/account-data.js'});await page.evaluate(()=>CanvasAccountData.show());
 const dialog=page.getByRole('dialog',{name:'个人数据',exact:true});await dialog.getByText('读取暂时失败').waitFor();readFail=false;
 await dialog.getByRole('button',{name:'重试读取'}).click();await dialog.getByText(/本人对话 2 个/).waitFor();
 const downloadButton=dialog.getByRole('button',{name:'导出本人数据（ZIP）'});
 await downloadButton.click();await dialog.getByText('附件仍在清理，请稍后重新导出。').waitFor();
 exportFail=false;const download=page.waitForEvent('download');await downloadButton.click();assert.equal((await download).suggestedFilename(),'personal-data.zip');
 assert.ok(writes.every(body=>new URLSearchParams(body).get('member_id')==='m1'));
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await dialog.screenshot({path:path.join(out,'personal-data-mobile.png')});await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert.deepEqual(errors,[]);
});

test('account closure requires typed confirmation, preserves blockers, clears password and disables export after success',async t=>{
 const {page,errors}=await fixture(t,'gpt-chat');let blocker=true;const writes=[];
 await page.route('**/api/account/data',route=>route.fulfill({json:{member:{id:'m1',username:'member-test',display_name:'林岳'},conversations:2,objects:3,bytes:4096,workspaces:[],retained:['共享画布和费用保留。']}}));
 await page.route('**/api/account/data/close',route=>{
  writes.push(route.request().postDataJSON());
  return blocker?route.fulfill({status:409,json:{detail:{code:'last_workspace_administrator'}}}):route.fulfill({json:{closed:true,pending_attachments:3,message:'账号已注销，附件后台清理。'}});
 });
 await page.addScriptTag({url:origin+'/static/js/account-data.js'});await page.evaluate(()=>CanvasAccountData.show());
 const dialog=page.getByRole('dialog',{name:'个人数据',exact:true}),password=dialog.getByLabel('账号密码'),confirmation=dialog.getByLabel('输入“注销并删除本人数据”');
 await password.fill('test-password-12345');await confirmation.fill('不完整确认');await dialog.getByRole('button',{name:'注销账号并清理本人数据'}).click();
 await dialog.getByText('请完整输入确认文字。').waitFor();assert.equal(writes.length,0);
 await confirmation.fill('注销并删除本人数据');await dialog.getByRole('button',{name:'注销账号并清理本人数据'}).click();
 await dialog.getByText('你是最后一位管理员，请先完成管理员交接。').waitFor();assert.equal(await password.inputValue(),'');
 blocker=false;await password.fill('test-password-12345');await dialog.getByRole('button',{name:'注销账号并清理本人数据'}).click();
 await dialog.getByRole('link',{name:'返回登录页'}).waitFor();assert.ok(await dialog.getByRole('button',{name:'导出本人数据（ZIP）'}).isDisabled());
 assert.equal(writes.length,2);assert.ok(writes.every(w=>w.confirmation==='注销并删除本人数据'));
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await dialog.screenshot({path:path.join(out,'account-closed-mobile.png')});assert.deepEqual(errors,[]);
});

async function transfer(page,files){
 return page.evaluateHandle(files=>{
  const data=new DataTransfer();
  for(const file of files)data.items.add(new File([file.size?new Uint8Array(file.size):(file.content||'sample')],file.name,{type:file.type||'application/octet-stream'}));
  return data;
 },files);
}
async function drop(page,files){
 const dataTransfer=await transfer(page,files);
 await page.locator('#skillDropzone').dispatchEvent('drop',{dataTransfer});
 await dataTransfer.dispose();
}

test('MD and ZIP drag import highlight, keyboard upload and file validation share one preview flow',async t=>{
 const {page,calls,errors}=await fixture(t,'skill-library');await page.locator('#skillChooseFile:enabled').waitFor();
 const dataTransfer=await transfer(page,[{name:'prompt.MD'}]);
 await page.locator('body').dispatchEvent('dragenter',{dataTransfer});
 await page.locator('#skillDropzone[data-dragging=true]').waitFor();
 await page.locator('.skill-drop-copy').dispatchEvent('dragenter',{dataTransfer});
 await page.locator('.skill-drop-copy').dispatchEvent('dragleave',{dataTransfer});
 assert.equal(await page.locator('#skillDropzone').getAttribute('data-dragging'),'true');
 await page.screenshot({path:path.join(out,'library-drop-dark.png')});
 await page.locator('#skillDropzone').dispatchEvent('drop',{dataTransfer});await dataTransfer.dispose();
 const dialog=page.getByRole('dialog');await dialog.getByRole('combobox').waitFor();
 assert.match(await dialog.locator('.skill-file-summary').innerText(),/prompt.MD.*\n.*Markdown/);
 assert.equal(await page.locator('#skillDropzone').getAttribute('data-dragging'),null);
 await page.screenshot({path:path.join(out,'library-import-preview.png')});
 await page.keyboard.press('Escape');
 await drop(page,[{name:'prompt.ZIP'}]);await dialog.getByRole('combobox').waitFor();
 assert.match(await dialog.locator('.skill-file-summary').innerText(),/ZIP 技能包/);await page.keyboard.press('Escape');
 const previews=calls.filter(c=>c.path==='/api/skills/preview').length;
 for(const [files,message] of [
  [[{name:'image.png'}],/格式不支持/],
  [[{name:'big.zip',size:2*1024*1024+1}],/超过 2 MiB/],
  [[{name:'empty.md',content:''}],/文件为空/],
  [[{name:'one.md'},{name:'two.zip'}],/每次导入一个/]
 ]){
  if(files[0].name==='empty.md'){
   await page.locator('#skillFile').setInputFiles({name:'empty.md',mimeType:'text/markdown',buffer:Buffer.alloc(0)});
  }else await drop(page,files);
  assert.match(await page.locator('#skillDropMessage').innerText(),message);
  assert.equal(await page.getByRole('dialog').count(),0);
 }
 assert.equal(calls.filter(c=>c.path==='/api/skills/preview').length,previews);
 const chooserButton=page.getByRole('button',{name:'选择文件',exact:true});await chooserButton.focus();
 const choosing=page.waitForEvent('filechooser');await page.keyboard.press('Enter');
 const chooser=await choosing;await chooser.setFiles({name:'SKILL.md',mimeType:'text/markdown',buffer:Buffer.from('skill')});
 await dialog.getByRole('combobox').waitFor();await page.keyboard.press('Escape');
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.equal(await page.locator('#skillDropzone').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
 await page.screenshot({path:path.join(out,'library-drop-mobile.png')});assert.deepEqual(errors,[]);
});

test('upload state prevents closing and duplicate submits, retaining file and visibility for retry',async t=>{
 const {page,errors}=await fixture(t,'skill-library');await page.locator('#skillChooseFile:enabled').waitFor();
 let releasePreview;const previewGate=new Promise(resolve=>releasePreview=resolve);
 let previewAttempts=0;
 await page.route('**/api/skills/preview',async route=>{
  previewAttempts++;if(previewAttempts===1){await previewGate;return route.fulfill({status:503,json:{detail:'读取服务暂不可用'}});}
  return route.fulfill({json:content});
 });
 await drop(page,[{name:'retry.zip'}]);const dialog=page.getByRole('dialog');
 await dialog.locator('progress:not([hidden])').waitFor();assert.equal(await dialog.getAttribute('aria-busy'),'true');
 assert.equal(await dialog.getByRole('button',{name:'确认导入并安装'}).count(),0);
 releasePreview();await dialog.getByRole('button',{name:'重新校验'}).waitFor();assert.match(await dialog.getByRole('alert').innerText(),/读取服务暂不可用/);
 await dialog.getByRole('button',{name:'重新校验'}).click();await dialog.getByRole('combobox').selectOption('shared');
 let attempts=0,releaseImport;const gate=new Promise(resolve=>releaseImport=resolve),bodies=[];
 await page.route('**/api/skills/import',async route=>{
  attempts++;bodies.push(route.request().postData());
  if(attempts===1){await gate;return route.fulfill({status:503,json:{detail:'存储暂不可用'}});}
  return route.fulfill({json:{id:'s3'}});
 });
 await dialog.getByRole('button',{name:'确认导入并安装'}).click();await dialog.locator('progress:not([hidden])').waitFor();
 assert.equal(await dialog.getByRole('button',{name:'关闭',exact:true}).isDisabled(),true);
 assert.equal(await dialog.getByRole('combobox').isDisabled(),true);
 await page.keyboard.press('Escape');await page.mouse.click(3,3);
 assert.equal(await dialog.count(),1);assert.equal(attempts,1);
 releaseImport();await dialog.getByRole('button',{name:'重试导入'}).waitFor();
 assert.equal(await dialog.getByRole('combobox').inputValue(),'shared');assert.match(await dialog.getByRole('alert').innerText(),/存储暂不可用/);
 await dialog.getByRole('button',{name:'重试导入'}).click();await dialog.waitFor({state:'detached'});
 assert.equal(attempts,2);assert.ok(bodies.every(body=>body.includes('shared')&&body.includes('retry.zip')));
 assert.match(await page.locator('#skillDropMessage').innerText(),/导入完成/);assert.deepEqual(errors,[]);
});

test('drag import respects missing permissions and failed permission loading without upload requests',async t=>{
 const {page,calls,errors,setCanImport,setFail}=await fixture(t,'skill-library');await page.locator('#skillChooseFile:enabled').waitFor();
 setCanImport(false);await page.getByRole('button',{name:'刷新',exact:true}).click();
 await page.locator('#skillDropzone[data-state=disabled]').waitFor();
 assert.equal(await page.getByRole('button',{name:'选择文件',exact:true}).isDisabled(),true);
 await drop(page,[{name:'SKILL.md'}]);assert.match(await page.locator('#skillDropMessage').innerText(),/当前无法导入/);
 setCanImport(true);setFail(true);await page.getByRole('button',{name:'刷新',exact:true}).click();
 await page.getByRole('button',{name:'加载失败，点击重试'}).waitFor();await drop(page,[{name:'SKILL.zip'}]);
 assert.equal(calls.filter(c=>c.path==='/api/skills/preview'||c.path==='/api/skills/import').length,0);
 assert.equal(await page.getByRole('dialog').count(),0);assert.deepEqual(errors,[]);
});
