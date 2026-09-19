const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
const source=fs.readFileSync('static/js/smart-canvas.js','utf8').replace(/\r\n/g,'\n');
function fn(name){const start=source.indexOf(`function ${name}(`);assert.ok(start>=0,name);return (source.slice(start-6,start)==='async '?'async ':'')+source.slice(start,source.indexOf('\n}',start)+2);}
const labels=Object.fromEntries([...source.matchAll(/"(smart\.[^"]+)": "([^"]*)"/g)].map(m=>[m[1],m[2]]));
async function fixture(t){
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1000,height:850}});
 // All transport is blocked. The fixture renders production markup and event handlers.
 await page.route('**/*',route=>route.abort());
 await page.setContent('<body class="studio-skin studio-content studio-smart-canvas"><div id="shell"><div id="world"></div></div></body>');
 await page.evaluate(html=>{const doc=new DOMParser().parseFromString(html,'text/html');document.getElementById('world').append(doc.getElementById('composer'));},fs.readFileSync('static/smart-canvas.html','utf8'));
 for(const name of ['smart-canvas.css','studio-workbench.css','smart-composer.css'])await page.addStyleTag({content:fs.readFileSync('static/css/'+name,'utf8').replace(/^@import.*$/gm,'')});
 await page.addScriptTag({path:'static/vendor/js/lucide.js'});
 await page.addScriptTag({path:'static/js/video-duration-policy.js'});
 await page.evaluate(labels=>{
  Object.assign(window,{
   settings:{engine:'volcengine',apiKind:'video',videoProvider:'volcengine',videoModel:'doubao-seedance-2-0-mini-260615',videoResolution:'720p',videoAspect:'16:9',videoDuration:5,videoGenerateAudio:true},
   composer:document.getElementById('composer'),dynamicParams:document.getElementById('dynamicParams'),engineSelect:document.getElementById('engineSelect'),apiKindToggle:document.getElementById('apiKindToggle'),
   tr:key=>labels[key]||key,escapeHtml:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
   isApiLikeEngine:()=>true,clearVolcengineSelectionOutsideVolcengine(){},
   volcengineProvider:()=>({id:'volcengine',name:'火山引擎'}),volcengineVideoModels:()=>['doubao-seedance-2-0-mini-260615'],
   videoApiProviders:()=>[{id:'volcengine',name:'火山引擎'}],providerVideoModels:()=>['doubao-seedance-2-0-mini-260615'],
   normalizeSmartVideoResolution:()=>['480p','720p','1080p'],smartVideoDurationRange:()=>({min:1,max:60,auto:false}),
   updatePromptPlaceholder(){},selectedNode:()=>null,renderInputThumbsRow(){},
   persistActiveSmartSettings(){window.savedSettings={...settings};},scheduleSave(){window.saves=(window.saves||0)+1;},
   uploadCurrentSmartVideosToCloud:async()=>{window.cloudActions=(window.cloudActions||0)+1;},setCurrentSmartManualVideoUrl:async()=>{window.manualActions=(window.manualActions||0)+1;},
  });
  composer.classList.add('open');composer.style.cssText='left:230px;top:100px;';
  document.getElementById('promptInput').textContent='让角色缓缓转身，镜头向前推进。保留原图的柔和光线与画面细节。';
  document.getElementById('cascadeRunBtn').style.display='inline-flex';
 },labels);
 const names=['renderVideoToggleControl','renderVideoTrustedAssetControl','renderVideoAdvancedControl','renderDynamicParams','renderApiVideoParams','renderVolcengineVideoParams','renderVideoProviderControl','renderVideoModelControl','isSeedance25VideoModel','renderSeedance25TaskModeControl','renderVideoDurationControl','renderVideoAspectControl','videoAspectIconClass','renderVideoResolutionControl','closeAllSmartPopovers','bindDynamicParams','syncApiKindToggleVisibility'];
 await page.addScriptTag({content:names.map(fn).join('\n')+'\nrenderDynamicParams();'});
 return page;
}
test('optional video controls are hidden, preserve values and stay usable after rerenders',async t=>{
 const page=await fixture(t),summary=page.locator('.composer-advanced summary');
 assert.equal(await page.getByRole('switch').count(),0);
 assert.equal(await page.locator('.composer-advanced').evaluate(e=>e.open),false);
 assert.equal(await page.evaluate(()=>settings.videoGenerateAudio),true);
 await summary.click();
 const audio=page.locator('[data-toggle-param="videoGenerateAudio"]');
 assert.equal(await audio.getAttribute('aria-checked'),'true');
 await audio.click();
 assert.equal(await audio.getAttribute('aria-checked'),'false');
 assert.equal(await page.locator('.composer-advanced').evaluate(e=>e.open),true);
 assert.equal(await page.evaluate(()=>savedSettings.videoGenerateAudio),false);
 await audio.press('Space');assert.equal(await audio.getAttribute('aria-checked'),'true');
 await page.locator('[data-toggle-param="videoTrustedAsset"]').click();
 await page.locator('[data-trusted-source="manual"]').click();
 assert.equal(await page.evaluate(()=>manualActions),1);
 assert.equal(await page.evaluate(()=>savedSettings.videoTrustedSource),'manual');
 await page.evaluate(()=>closeAllSmartPopovers());
 assert.equal(await page.getByRole('switch').count(),0);
 await page.evaluate(()=>{settings.engine='api';renderDynamicParams();});
 await summary.click();
 await page.locator('[data-toggle-param="videoUseFrameRoles"]').click();
 await page.locator('[data-toggle-param="videoMultimodal"]').click();
 assert.deepEqual(await page.evaluate(()=>[settings.videoUseFrameRoles,settings.videoMultimodal]),[false,true]);
});
test('card layout fits desktop and narrow screens in both themes',async t=>{
 const page=await fixture(t);
 fs.mkdirSync('.local/composer-preview',{recursive:true});
 for(const dark of [true,false])for(const width of [1000,390]){
  await page.setViewportSize({width,height:850});
  await page.evaluate(({dark,width})=>{
   document.documentElement.classList.toggle('theme-dark',dark);document.documentElement.classList.toggle('studio-theme-dark',dark);
   document.body.classList.toggle('theme-dark',dark);document.body.classList.toggle('studio-theme-dark',dark);
   composer.style.left=width===390?'14px':'230px';
  },{dark,width});
  const card=await page.locator('.composer-card').boundingBox();assert.ok(card.x>=0&&card.x+card.width<=width);
  assert.equal(await page.locator('.composer-card').evaluate(e=>getComputedStyle(e).backgroundColor),dark?'rgb(43, 48, 53)':'rgb(250, 249, 245)');
  for(const selector of ['#runBtn','#engineSelect','#cascadeRunBtn','.composer-advanced summary','.model-control > .smart-pill']){
   const b=await page.locator(selector).boundingBox();assert.ok(b.x>=card.x&&b.x+b.width<=card.x+card.width+1,selector);
  }
  await page.locator('.composer-advanced summary').click();
  const panel=await page.locator('.composer-advanced-panel').boundingBox();assert.ok(panel.x>=0&&panel.x+panel.width<=width);
  await page.evaluate(()=>closeAllSmartPopovers());
  await page.locator('.composer-card').screenshot({path:`.local/composer-preview/${dark?'dark':'light'}-${width}.png`});
 }
});
test('mixed references share one strip and overflow without stretching the card',async t=>{
 const page=await fixture(t);
 await page.evaluate(()=>{
  Object.assign(window,{
   inputThumbsRow:document.getElementById('inputThumbsRow'),collectPromptParts:()=>[],escapeAttr:escapeHtml,
   fixtureRefs:[{kind:'image',url:'asset://image',referenceLabel:'图片1'},{kind:'video',url:'asset://video',referenceLabel:'视频1'}],
   smartMediaReferencePlan:()=>({refs:fixtureRefs,invalid:[]}),
   mediaKindForItem:ref=>ref.kind,bindSmartPreviewImageFallbacks(){},saveMentionRange(){},savePromptDraftForCurrent(){},
   insertMentionToken:ref=>{window.inserted=ref;},previewSmartReference:ref=>{window.previewed=ref;}
  });
  inputThumbsRow.classList.add('typed-media-inputs');
 });
 await page.addScriptTag({content:fn('smartReferencePreviewHtml')+fn('renderSmartMediaGroups')+'\nrenderSmartMediaGroups(null);'});
 const groups=await page.locator('.smart-ref-group').all();
 assert.equal((await groups[0].boundingBox()).y,(await groups[1].boundingBox()).y);
 await page.locator('[data-ref-insert="1"]').click();assert.equal(await page.evaluate(()=>inserted.url),'asset://video');
 await page.locator('[data-ref-preview="0"]').click();assert.equal(await page.evaluate(()=>previewed.url),'asset://image');
 await page.setViewportSize({width:390,height:850});
 await page.evaluate(()=>{
  composer.style.left='14px';
  fixtureRefs.unshift(...Array.from({length:9},(_,i)=>({kind:'image',url:'asset://image-'+i,referenceLabel:'图片'+(i+2)})));
  renderSmartMediaGroups(null);
 });
 const card=await page.locator('.composer-card').boundingBox();assert.ok(card.x+card.width<=390);
 assert.ok((await page.locator('#inputThumbsRow').boundingBox()).height<=148);
 await page.locator('[data-ref-insert="10"]').click();assert.equal(await page.evaluate(()=>inserted.url),'asset://video');
});
