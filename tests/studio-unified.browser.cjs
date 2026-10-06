const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');

test('production page controls share readable opaque surfaces across both themes',async t=>{
 const {page,writes}=await fixture(t,'classic',false);
 const pages={
  online:['#promptInput','.tool-panel','.result-frame','#modelSelect'],
  'gpt-chat':['.topbar','.composer','.model-picker-popover','.upload-btn'],
  'asset-manager':['.asset-panel','.asset-tabs'],
 };
 for(const [name,selectors] of Object.entries(pages)){
  await page.goto('http://canvas-modules.test/static/'+name+'.html');
  await page.waitForFunction(()=>Boolean(window.StudioTheme));
  const initialWrites=writes.length;
  for(const theme of ['dark','light']){
   await page.evaluate(theme=>StudioTheme.apply(theme),theme);
   await page.locator('body').evaluate(async el=>{await new Promise(requestAnimationFrame);await Promise.all(el.getAnimations({subtree:true}).filter(a=>a.effect.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))});
   for(const selector of selectors){
    const styles=await page.locator(selector).first().evaluate(el=>{
     const css=getComputedStyle(el),rgb=s=>(s.match(/[\d.]+/g)||[]).map(Number);
     const luminance=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
     const a=luminance(rgb(css.color)),b=luminance(rgb(css.backgroundColor));
     return {color:css.color,background:css.backgroundColor,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
    });
    assert.ok(styles.contrast>=4.5,`${name} ${theme} ${selector} contrast ${styles.contrast} ${JSON.stringify(styles)}`);
    assert.ok(!/rgba|23, 34|20, 29/.test(styles.background),`${name} ${theme} ${selector} retained a legacy/translucent fill: ${styles.background}`);
   }
  }
  for(const width of [390,768,1280]){
   await page.setViewportSize({width,height:844});
   await page.evaluate(()=>StudioScale.set('115',false));
   const bounds=await page.locator('body').evaluate(el=>({width:el.getBoundingClientRect().width,viewport:el.ownerDocument.documentElement.clientWidth,scroll:el.ownerDocument.documentElement.scrollWidth}));
   assert.ok(Math.abs(bounds.width-bounds.viewport)<2,`${name} zoomed body ${JSON.stringify(bounds)}`);
   assert.ok(bounds.scroll<=bounds.viewport+1,`${name} unexpected horizontal scrolling ${JSON.stringify(bounds)}`);
   if(name==='gpt-chat'){
    await page.locator('#modelPickerBtn').click();
    const menu=await page.locator('.model-picker-popover').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right}});
    assert.ok(menu.left>=0&&menu.right<=width+1,`model menu outside viewport ${JSON.stringify(menu)}`);
    await page.locator('#modelPickerBtn').click();
   }
  }
  assert.equal(writes.length,initialWrites,`${name}: appearance and theme changes must not write business data`);
 }
});

test('history selection toolbar keeps neutral disabled state, themed selection and original actions',async t=>{
 const {page,writes}=await fixture(t,'classic',false);
 await page.goto('http://canvas-modules.test/static/online.html');
 await page.waitForFunction(()=>Boolean(document.querySelector('#masonry')?._hbm));
 await page.evaluate(()=>{
  const grid=document.querySelector('#masonry');
  for(const id of ['1','2']){const card=document.createElement('button');card.dataset.historyTs=id;card.textContent='回归图片 '+id;grid.append(card);}
  grid._hbm.refresh();
 });
 const before=writes.length;
 for(const theme of ['dark','light']){
  await page.evaluate(theme=>StudioTheme.apply(theme),theme);
  await page.getByRole('button',{name:'管理',exact:true}).click();
  const remove=page.getByRole('button',{name:'删除所选',exact:true});
  assert.equal(await remove.isEnabled(),false);
  const neutral=await remove.evaluate(el=>({color:getComputedStyle(el).color,opacity:getComputedStyle(el).opacity,muted:getComputedStyle(document.querySelector('.hbm-count')).color}));
  assert.equal(neutral.color,neutral.muted,'disabled delete uses the neutral text color');
  assert.equal(neutral.opacity,'1','disabled delete must remain readable');
  await page.getByRole('button',{name:'全选',exact:true}).press('Enter');
  assert.equal(await page.locator('.hbm-count').textContent(),'已选 2 张');
  assert.equal(await remove.isEnabled(),true);
  assert.equal(await page.locator('.hbm-selected').count(),2);
  await page.getByRole('button',{name:'取消全选',exact:true}).click();
  assert.equal(await remove.isEnabled(),false);
  await page.setViewportSize({width:390,height:844});
  const bar=await page.locator('.hbm-toolbar').evaluate(el=>({width:el.scrollWidth,client:el.clientWidth,buttons:[...el.querySelectorAll('button:not(.hbm-hide)')].map(b=>b.getBoundingClientRect().height)}));
  assert.ok(bar.width<=bar.client);assert.ok(bar.buttons.every(h=>h>=44));
  await page.getByRole('button',{name:'完成',exact:true}).press('Enter');
  assert.equal(await page.locator('.hbm-selected').count(),0);
  assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('history-bulk-selecting')),false);
 }
 assert.equal(writes.length,before,'selection must not write or delete history');
});
