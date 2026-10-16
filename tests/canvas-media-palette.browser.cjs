const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');
const clip=fs.readFileSync(path.join(__dirname,'fixtures/smart-video-trim.webm'));
const screenshots=path.resolve('docs/design/media-palette');
async function serveVideo(route){
 const range=route.request().headers().range?.match(/bytes=(\d+)-(\d*)/),start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),clip.length-1):clip.length-1;
 const body=clip.subarray(start,end+1),headers={'accept-ranges':'bytes','content-length':String(body.length)};
 if(range)headers['content-range']=`bytes ${start}-${end}/${clip.length}`;
 await route.fulfill({status:range?206:200,headers,contentType:'video/webm',body});
}
async function themedSurface(page,selector){
 await page.locator(selector).first().evaluate(async el=>Promise.allSettled(el.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished)));
 const css=await page.locator(selector).first().evaluate(el=>{
  const s=getComputedStyle(el),rgb=v=>(v.match(/[\d.]+/g)||[]).map(Number);
  const lum=v=>rgb(v).slice(0,3).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
  return {background:s.backgroundColor,color:s.color,contrast:(Math.max(lum(s.color),lum(s.backgroundColor))+.05)/(Math.min(lum(s.color),lum(s.backgroundColor))+.05)};
 });
 if(process.env.PALETTE_BASELINE)return;
 assert.ok(!css.background.startsWith('rgba'),'component has an opaque readable surface: '+selector);
 const rgb=css.background.match(/[\d.]+/g).map(Number);assert.ok(rgb[2]<=rgb[1],'no legacy blue surface: '+selector+' '+css.background);
 assert.ok(css.contrast>=4.5,selector+' text contrast '+JSON.stringify(css));
}
async function mountWorkspaceControls(page){
 // Exercise the production member toolbar, not the legacy standalone lock UI.
 let editing=false;
 await page.route('**/api/canvases/canvas-test/edit-lease**',async route=>{
  if(route.request().url().endsWith('/acquire'))editing=true;
  await route.fulfill({json:{generation:1,revision:1,edit_token:editing?'palette-fixture-token':null,
   holder:editing?{is_self:true,display_name:'测试成员'}:null,
   server_time:new Date().toISOString(),expires_at:new Date(Date.now()+60000).toISOString()}});
 });
 await page.route('**/api/canvases/canvas-test/page-state',route=>route.fulfill({json:{presence:{online_members:1,members:[{id:'member-1',display_name:'测试成员',is_self:true,activity:editing?'editing':'viewing'}]}}}));
 await page.evaluate(()=>{
  CanvasSession.context.workspace.permissions=['canvas.read','canvas.edit','asset.read'];
  // The fixture's HTTP test hostname is not a secure context; localhost is.
  if(!crypto.randomUUID)crypto.randomUUID=()=>{const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');};
 });
 const memberStyles=await page.addStyleTag({url:'/static/css/member-canvas-edit.css'});
 // The server injects member styles before the page's studio styles.
 await memberStyles.evaluate(node=>document.head.insertBefore(node,document.head.querySelector('link[rel="stylesheet"]')));
 await page.addScriptTag({url:'/static/js/canvas-edit-lease.js'});
 await page.addScriptTag({url:'/static/js/member-canvas-edit.js'});
 await page.evaluate(()=>openCanvas('canvas-test'));
 await page.getByRole('button',{name:'开始编辑',exact:true}).click();
 await page.waitForFunction(()=>MemberCanvasEdit.canEdit);
 await page.locator('.member-canvas-edit').waitFor({state:'visible'});

 assert.equal(await page.locator('#canvasLockBadge,#smartLockBadge,#canvasLockOverlay,#smartLockOverlay').count(),0,'legacy lock UI is removed from both canvases');
}
test('classic media cards, trim and preview controls use the dark palette',async t=>{
 const kind='classic';
 const {page,errors,writes,record}=await fixture(t,kind,true);
 record.title='媒体组件配色验收';record.updated_at=Date.UTC(2026,9,7);
 await mountWorkspaceControls(page);
 let videoRequests=0;
 await page.route('**/assets/palette-video.webm',async route=>{videoRequests++;await serveVideo(route);});
 await page.route('**/api/media-preview?*',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#556a41"/><path d="M0 140L90 60 180 140 250 40 320 140" fill="#8aa563"/></svg>'}));
 await page.evaluate(kind=>{
  const media={url:'/assets/palette-video.webm',name:'视频配色验收',kind:'video',thumbnail:'/test-image.svg',preview_url:'/test-image.svg',natural_w:320,natural_h:180};
  nodes=[{id:'palette-output',type:'output',x:100,y:130,images:[media]}, {id:'palette-video',type:'image',x:540,y:130,url:media.url,name:media.name,mediaKind:'video',thumbnail:media.thumbnail}];
  viewport={x:0,y:0,scale:1};render();
 },kind);
 fs.mkdirSync(screenshots,{recursive:true});
 const prefix=process.env.PALETTE_BASELINE?'before':'after';
 const card='.output-img-wrap > img',play='.output-video-play';
 await page.waitForFunction(()=>document.querySelector('img[data-preview-kind="video"]')?.naturalWidth>0);
 assert.equal(videoRequests,0,'canvas thumbnails do not download videos');
 for(const theme of ['dark']){

  await themedSurface(page,card);await themedSurface(page,play);
  const playButton=page.locator(play).first();
  await page.keyboard.press('Tab');
  await playButton.focus();
  assert.ok(await playButton.evaluate(el=>getComputedStyle(el).outlineStyle!=='none'),'play control has keyboard focus');
  await playButton.hover();await themedSurface(page,play);
  await page.mouse.move(5,5);
  await themedSurface(page,play);
  await page.screenshot({path:path.join(screenshots,`${prefix}-${kind}-cards-${theme}.png`)});
  await page.locator(play).first().click();
  await page.waitForFunction(()=>document.getElementById('outputLightboxVideo').readyState>=2);
  await page.evaluate(async()=>{const video=document.querySelector('.output-preview video,.preview-stage video');await video.play();await new Promise(resolve=>video.requestVideoFrameCallback(resolve));video.pause();});
  await page.locator('#outputTrimToggle').click();
  const panel='#outputTrimPanel';
  await page.locator(panel).waitFor({state:'visible'});
  await page.evaluate(()=>{setOutputTrimValue('end',1.4,false);setOutputTrimValue('start',.4,false);});
  for(const selector of [panel,'#outputTrimStart','#outputTrimApply','.output-resolution','.preview-icon-btn'])await themedSurface(page,selector);
  await page.waitForFunction(()=>{const v=document.querySelector('.output-preview video,.preview-stage video');return v&&!v.seeking&&v.readyState>=2;});
  await page.evaluate(()=>document.querySelector('.output-preview video,.preview-stage video').pause());
  await page.screenshot({path:path.join(screenshots,`${prefix}-${kind}-trim-${theme}.png`)});
  const input=page.locator('#outputTrimStart');await input.focus();
  if(!process.env.PALETTE_BASELINE)assert.ok(await input.evaluate(el=>getComputedStyle(el).outlineStyle!=='none'||getComputedStyle(el).boxShadow!=='none'),'time input has a visible focus');
  await page.evaluate(()=>{setOutputTrimValue('start',0,false);setOutputTrimValue('end',document.getElementById('outputLightboxVideo').duration,false);});
  const apply=page.locator('#outputTrimApply');
  assert.ok(await apply.isDisabled(),'full range disables redundant export');
  await themedSurface(page,'#outputTrimApply');
  await page.evaluate(()=>closeOutputLightbox());
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator(play).first().evaluate(el=>getComputedStyle(el).transitionDuration),'0s','reduced motion suppresses decorative transitions');
 assert.equal(writes.filter(row=>row.path.includes('video-trim')).length,0,'palette inspection never submits a trim');
 assert.equal(writes.filter(row=>row.path.endsWith('/lock')).length,0,'workspace mode never acquires a legacy edit lock');
 assert.ok(writes.every(row=>/^\/api\/canvases\/canvas-test(?:\/touch)?$/.test(row.path)),'palette inspection uses only existing canvas/session requests');
 assert.deepEqual(errors,[]);
});
