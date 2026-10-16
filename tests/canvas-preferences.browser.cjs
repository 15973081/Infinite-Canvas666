const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function setup(t){
 const f=await fixture(t,'smart',true,{record:{nodes:[{id:'n1',type:'smart-image',x:100,y:100,images:[],generationKind:'image'},{id:'n2',type:'smart-image',x:700,y:100,images:[],generationKind:'image'}],connections:[{from:'n1',to:'n2',kind:'input'}]}});
 await f.page.evaluate(()=>CanvasPreferences.show());return f;
}
test('preferences persist per member and control real font, grid, selected connections and new node names',async t=>{
 const {page,errors}=await setup(t),dialog=page.getByRole('dialog',{name:'偏好管理',exact:true});
 await dialog.getByLabel('提示词输入框字体大小',{exact:true}).selectOption('18');await dialog.getByLabel('画布连接线显示',{exact:true}).uncheck();await dialog.getByLabel('显示点阵背景图',{exact:true}).uncheck();
 await dialog.getByText('默认节点名称 · 自定义',{exact:true}).click();await dialog.getByLabel('图像生成节点',{exact:true}).fill('产品草图');await dialog.getByRole('button',{name:'保存偏好',exact:true}).click();
 await dialog.getByText('偏好已保存',{exact:true}).waitFor();await dialog.getByLabel('关闭偏好管理',{exact:true}).click();
 assert.equal(await page.locator('#shell').evaluate(n=>getComputedStyle(n).backgroundImage),'none');
 assert.equal(await page.locator('#promptInput').evaluate(n=>getComputedStyle(n).fontSize),'18px');
 await page.waitForFunction(()=>document.querySelector('.smart-connection')?.style.display==='none');
 await page.evaluate(()=>{smartSelection.createdNode('n1');render();});await page.waitForFunction(()=>document.querySelector('.smart-connection')?.style.display==='');
 const node=await page.evaluate(()=>createGenerationNodeAt({x:1000,y:600},'image'));assert.equal(node.label,'产品草图');
 assert.equal(await page.evaluate(()=>nodes.find(n=>n.id==='n1').label||''),'');
 await page.reload();assert.equal(await page.evaluate(()=>CanvasPreferences.get().font),18);
 await page.evaluate(()=>{CanvasSession.context.member.id='member-b';window.dispatchEvent(new Event('member-session:ready'));});assert.equal(await page.evaluate(()=>CanvasPreferences.get().font),14);assert.deepEqual(errors,[]);
});

test('default prompt safely initializes only newly created matching model nodes',async t=>{
 const {page,errors}=await setup(t);await page.getByLabel('关闭偏好管理',{exact:true}).click();
 await page.evaluate(()=>{window.CanvasPreferenceModels=()=>[{provider:'test',model:'image-1'}];CanvasPreferences.show();});
 const dialog=page.getByRole('dialog',{name:'偏好管理',exact:true});await dialog.getByText('模型默认填充文本内容 · 自定义',{exact:true}).click();await dialog.getByRole('button',{name:'新增',exact:true}).click();
 await dialog.getByLabel('默认文本的模型',{exact:true}).selectOption(JSON.stringify(['test','image-1']));await dialog.getByLabel('模型默认填充文本',{exact:true}).fill('<img src=x onerror=alert(1)>');await dialog.getByRole('button',{name:'保存偏好',exact:true}).click();await dialog.getByText('偏好已保存',{exact:true}).waitFor();
 const result=await page.evaluate(()=>{
  const node={generationKind:'image',images:[],runSettings:{provider_id:'test',model:'image-1'}};CanvasPreferences.applyNode(node);
  const existing={...node,promptDraftText:'Keep original'};CanvasPreferences.applyNode(existing);
  const video={generationKind:'video',images:[],runSettings:{videoProvider:'test',videoModel:'image-1',provider_id:'other',model:'other'}};CanvasPreferences.applyNode(video);
  const wrongVideo={generationKind:'video',images:[],runSettings:{videoProvider:'other',videoModel:'other',provider_id:'test',model:'image-1'}};CanvasPreferences.applyNode(wrongVideo);return {node,existing,video,wrongVideo};
 });assert.equal(result.node.promptDraftText,'<img src=x onerror=alert(1)>');assert.match(result.node.promptDraftHtml,/&lt;img/);assert.equal(result.existing.promptDraftText,'Keep original');assert.equal(result.video.promptDraftText,'<img src=x onerror=alert(1)>');assert.equal(result.wrongVideo.promptDraftText,undefined);assert.deepEqual(errors,[]);
});

test('preferences cannot save after identity pause and survive unavailable storage honestly',async t=>{
 const {page,errors}=await setup(t),dialog=page.getByRole('dialog',{name:'偏好管理',exact:true});
 await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw Error('Storage unavailable');};});
 await dialog.getByLabel('提示词输入框字体大小',{exact:true}).selectOption('18');await dialog.getByRole('button',{name:'保存偏好',exact:true}).click();await dialog.getByText('Storage unavailable',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>CanvasPreferences.get().font),14);
 await page.evaluate(()=>{CanvasSession.paused=true;window.dispatchEvent(new Event('member-session:paused'));});await dialog.waitFor({state:'detached'});assert.deepEqual(errors,[]);
});

test('preferences preview has usable desktop and mobile layouts',async t=>{
 const {page,errors}=await setup(t);fs.mkdirSync('.local/commercial-kickoff',{recursive:true});
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});const bounds=await page.locator('.canvas-preferences').evaluate(n=>({w:n.getBoundingClientRect().width,scroll:n.scrollWidth,client:n.clientWidth}));assert.ok(bounds.w<=width&&bounds.scroll<=bounds.client,JSON.stringify(bounds));await page.screenshot({path:'.local/commercial-kickoff/canvas-preferences-'+width+'.png',fullPage:true});}
 assert.deepEqual(errors,[]);
});

test('custom shortcuts reject conflicts and invoke the real canvas dispatcher outside text fields',async t=>{
 const {page,errors}=await setup(t),dialog=page.getByRole('dialog',{name:'偏好管理',exact:true});
 await dialog.getByText('快捷键 · 自定义',{exact:true}).click();
 await dialog.getByLabel('打开 / 关闭资源库',{exact:true}).selectOption('f6');await dialog.getByLabel('切换缩小预览',{exact:true}).selectOption('f6');
 await dialog.getByRole('button',{name:'保存偏好',exact:true}).click();await dialog.getByText('两个画布快捷键不能相同。',{exact:true}).waitFor();
 await dialog.getByLabel('切换缩小预览',{exact:true}).selectOption('f8');await dialog.getByRole('button',{name:'保存偏好',exact:true}).click();await dialog.getByText('偏好已保存',{exact:true}).waitFor();await dialog.getByLabel('关闭偏好管理',{exact:true}).click();
 await dialog.waitFor({state:'detached'});
 await page.locator('#shell').click({position:{x:1100,y:650}});
 await page.evaluate(()=>{window.shortcutCalls={asset:0,zoom:0};toggleAssetLibrary=()=>shortcutCalls.asset++;toggleZoomPreview=()=>shortcutCalls.zoom++;});
 await page.keyboard.press('F6');await page.keyboard.press('F8');await page.keyboard.press('a');await page.keyboard.press('z');
 assert.deepEqual(await page.evaluate(()=>shortcutCalls),{asset:1,zoom:1});
 await page.evaluate(()=>{const input=document.createElement('input');input.id='shortcut-test-input';document.body.append(input);input.focus();});await page.keyboard.press('F6');assert.deepEqual(await page.evaluate(()=>shortcutCalls),{asset:1,zoom:1});assert.deepEqual(errors,[]);
});
