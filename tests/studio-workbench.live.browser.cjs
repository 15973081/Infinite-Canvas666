/* Opt-in integration against an isolated local runtime; never defaults to a user's workspace. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
test('live workbench creates, saves and opens both canvas types through production routes',
 {skip:!process.env.STUDIO_TEST_URL},async t=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const origin=process.env.STUDIO_TEST_URL;
 const out=process.env.STUDIO_TEST_SCREENSHOT_DIR || path.resolve(__dirname,'../docs/design/cyber');fs.mkdirSync(out,{recursive:true});
 assert.match(origin,/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/);
 const login=await page.request.post(origin+'/api/auth/login',{data:{username:process.env.STUDIO_TEST_USER,password:process.env.STUDIO_TEST_PASSWORD}});
 assert.equal(login.ok(),true);
 await page.goto(origin+'/');
 const canvasFrame=()=>page.frames().find(f=>/\/static\/(smart-)?canvas\.html/.test(f.url()));
 await page.waitForFunction(()=>document.getElementById('frame-canvas')?.contentWindow.CanvasHome);
 let frame=canvasFrame();
 const title='浏览器回归 '+Date.now();
 await page.locator('#studioNewCanvas').click();
 await frame.locator('#canvasNameField').fill(title+' 经典');
 await frame.getByRole('button',{name:'创建画布',exact:true}).click();
 await frame.locator('#board').click({button:'right',position:{x:400,y:350}});
 await frame.getByRole('button',{name:'提示词',exact:true}).click();
 await frame.getByRole('textbox',{name:'提示词',exact:true}).fill('保存回归输入');
 assert.equal(await frame.locator('.node').first().evaluate(el=>getComputedStyle(el).borderRadius),'18px');
 await page.screenshot({path:path.join(out,'after-classic-editor-light.png')});
 await frame.locator('#backToManagerBtn').click();
 await frame.locator('#gateSearchInput').fill(title+' 经典');
 await frame.locator('.canvas-open').click();
 assert.equal(await frame.getByRole('textbox',{name:'提示词',exact:true}).inputValue(),'保存回归输入');
 await frame.locator('#backToManagerBtn').click();
 await frame.locator('#gateSearchInput').fill('');
 await frame.locator('#gateCreateSmartBtn').click();
 await frame.locator('#canvasNameField').fill(title+' 智能');
 await frame.getByRole('button',{name:'创建画布',exact:true}).click();
 await page.waitForFunction(()=>document.getElementById('frame-canvas').contentWindow.location.pathname.endsWith('/smart-canvas.html'));
 frame=canvasFrame();await frame.waitForLoadState();
 await page.screenshot({path:path.join(out,'after-smart-editor-light.png')});
 // The sidebar must follow the smart editor's save/lease guard and land in creation.
 await page.locator('#studioNewCanvas').click();
 await page.waitForFunction(()=>document.getElementById('frame-canvas').contentWindow.location.pathname.endsWith('/canvas.html'));
 frame=canvasFrame();await frame.locator('#canvasNameField').waitFor({state:'visible'});
 await frame.getByRole('button',{name:'取消',exact:true}).click();
 await frame.locator('#gateSearchInput').fill('');
 for(const theme of ['dark','light']){
  await page.evaluate(theme=>broadcastTheme(theme),theme);
  await frame.waitForFunction(()=>{
   const background=getComputedStyle(document.getElementById('canvasGate')).backgroundColor;
   return [...document.querySelectorAll('.studio-start-card,.studio-recent-item')].every(el=>getComputedStyle(el).backgroundColor===background);
  });
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.nav-item.active')).backgroundColor===
   (document.documentElement.classList.contains('theme-dark')?'rgb(38, 52, 24)':'rgb(229, 241, 195)'));
  await page.screenshot({path:path.join(out,'after-'+theme+'-desktop.png')});
  if(theme==='dark'){
   await frame.locator('#studioFolderTrigger').click();
   await frame.waitForFunction(()=>document.getElementById('studioFolderMenu').getAnimations().every(animation=>animation.playState==='finished'));
   await page.screenshot({path:path.join(out,'after-dark-menu.png')});
   await frame.locator('#studioFolderTrigger').press('Escape');
  }
  const contrast=await frame.evaluate(()=>{
   const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number);
   const luminance=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
   const root=getComputedStyle(document.documentElement),values=['--studio-text-muted','--studio-page','--studio-accent-text','--studio-accent'].map(v=>root.getPropertyValue(v).trim());
   const parse=hex=>hex.slice(1).match(/.{2}/g).map(v=>parseInt(v,16));
   const ratio=(a,b)=>{const x=luminance(parse(a)),y=luminance(parse(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
   return {muted:ratio(values[0],values[1]),button:ratio(values[2],values[3])};
  });
  assert.ok(contrast.muted>=4.5);assert.ok(contrast.button>=4.5);
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('#studioMobileMenu').click();
 await page.screenshot({path:path.join(out,'after-light-mobile-nav.png')});
 await page.locator('#studioNewCanvas').press('Escape');
 await frame.locator('#gateSearchInput').fill('不存在的画布名称');
 assert.match(await frame.locator('.gate-list-empty').innerText(),/没有找到/);
 await page.screenshot({path:path.join(out,'after-light-mobile-search.png')});
 assert.deepEqual(errors,[]);
});
