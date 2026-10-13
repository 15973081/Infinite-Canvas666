const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');

test('history preview uses dark surfaces and fits the viewport without losing image interactions',async t=>{
 const {page,writes,errors}=await fixture(t,'classic',false);
 await page.goto('http://canvas-modules.test/static/online.html');
 await page.waitForFunction(()=>Boolean(window.StudioScale));
 const before=writes.length;
 for(const theme of ['dark']){
  for(const [width,height,scale] of [[1280,720,'100'],[768,600,'115'],[390,844,'115'],[1280,600,'140']]){
   await page.setViewportSize({width,height});
   await page.evaluate(({theme,scale})=>{StudioScale.set(scale,false);}, {theme,scale});
   await page.locator('#promptInput').focus();
   await page.evaluate(()=>openLightbox({images:['/test-image.svg'],prompt:'预览回归 '.repeat(180)}));
   await page.waitForFunction(()=>document.querySelector('#lightboxImg').naturalWidth===320);
   const geometry=await page.locator('.gallery-preview').evaluate(el=>{
    const bounds=node=>{const r=node.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
    const frame=document.querySelector('#lightboxFrame');
    return {box:bounds(el),close:bounds(document.querySelector('#lightboxClose')),footer:bounds(document.querySelector('#lightboxCard')),frame:bounds(frame),
     fill:getComputedStyle(frame).backgroundColor,palette:getComputedStyle(document.body).getPropertyValue('--studio-page').trim(),
     overflow:el.scrollWidth>el.clientWidth||el.scrollHeight>el.clientHeight};
   });
   for(const name of ['box','close','footer','frame']){
    const b=geometry[name];
    assert.ok(b.left>=-1&&b.top>=-1&&b.right<=width+1&&b.bottom<=height+1,`${theme}/${scale}/${width} ${name}: ${JSON.stringify(b)}`);
   }
   assert.equal(geometry.overflow,false,'all preview controls fit inside the panel');
   assert.ok(geometry.frame.height>100,'preview retains usable image space');
   assert.equal(geometry.fill,'rgb(9, 11, 9)');
   assert.equal(await page.locator('#lightboxClose').evaluate(el=>el===document.activeElement),true);
   await page.locator('#lightboxClose').press('Shift+Tab');
   assert.equal(await page.locator('#lightboxCard [data-online-import="library"]').evaluate(el=>el===document.activeElement),true,'focus stays inside preview');
   await page.locator('#lightboxCard [data-online-import="library"]').press('Escape');
   assert.equal(await page.locator('#lightbox').isVisible(),false);
   assert.equal(await page.locator('#promptInput').evaluate(el=>el===document.activeElement),true,'focus returns to opener');
  }
 }
 await page.setViewportSize({width:1280,height:900});
 await page.evaluate(()=>{StudioScale.set('100',false);openLightbox({images:['/test-image.svg'],prompt:'保留原始提示词'});});
 const frame=page.locator('#lightboxFrame');
 await frame.hover();await page.mouse.wheel(0,-100);
 await page.waitForFunction(()=>document.querySelector('#lightboxImg').style.transform.includes('scale(1.1)'));
 await frame.dblclick();
 assert.ok((await page.locator('#lightboxImg').getAttribute('style')).includes('scale(1)'),'double click resets existing preview zoom');
 await page.getByRole('button',{name:'复用',exact:true}).click();
 assert.equal(await page.locator('#promptInput').inputValue(),'保留原始提示词');
 assert.equal(await page.locator('#lightbox').isVisible(),false);
 assert.equal(writes.length,before,'preview and reuse must not generate or write business data');
 assert.deepEqual(errors,[]);
});

test('production page controls share readable opaque dark surfaces',async t=>{
 const {page,writes}=await fixture(t,'classic',false);
 const pages={
  online:['#promptInput','.tool-panel','.result-frame','#modelSelect'],
  'gpt-chat':['.topbar','.composer','.model-picker-popover','.upload-btn'],
  'asset-manager':['.asset-panel','.asset-tabs'],
 };
 for(const [name,selectors] of Object.entries(pages)){
  await page.goto('http://canvas-modules.test/static/'+name+'.html');
  await page.waitForFunction(()=>Boolean(window.StudioScale));
  const initialWrites=writes.length;
  for(const theme of ['dark']){

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
 for(const theme of ['dark']){

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
