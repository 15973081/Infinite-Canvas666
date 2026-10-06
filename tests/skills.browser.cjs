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
test('skill library search, install, enable, preview, retry and responsive themes',async t=>{
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
 for(const theme of ['dark','light']){await page.evaluate(theme=>StudioTheme.set(theme),theme);assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),theme==='dark'?'rgb(9, 11, 9)':'rgb(243, 244, 237)');await page.screenshot({path:path.join(out,'library-'+theme+'.png')});}
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'library-mobile.png')});
 setFail(true);await page.getByRole('button',{name:'刷新',exact:true}).click();await page.getByRole('button',{name:'加载失败，点击重试'}).waitFor();setFail(false);await page.getByRole('button',{name:'加载失败，点击重试'}).click();await page.locator('.skill-card').first().waitFor();assert.deepEqual(errors,[]);
});
test('GPT @ selection stays visible, is keyboard accessible and only sends skill IDs',async t=>{
 const {page,calls,errors,setChatFail}=await fixture(t,'gpt-chat');await page.waitForFunction(()=>typeof ChatSkills!=='undefined'&&typeof config!=='undefined');
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
 await page.evaluate(()=>StudioTheme.set('light'));await page.emulateMedia({reducedMotion:'reduce'});
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
