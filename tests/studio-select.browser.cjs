const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const {fixture, origin} = require('./helpers/canvas-browser.cjs');
async function online(t) {
 const f = await fixture(t, 'classic', false);
 const models = ['gpt-image-2', ...Array.from({length:18}, (_,i) => 'image-model-' + i)];
 await f.page.route('**/api/config', route => route.fulfill({json:{image_models:models, api_providers:[
  {id:'apimart',name:'APIMART',has_key:true,protocol:'apimart',image_models:models,model_policies:{'image:image-model-17':{resolutions:['2k']}}},
  {id:'gemini',name:'Gemini',has_key:true,protocol:'gemini',image_models:['nano-banana'],model_policies:{'image:nano-banana':{resolutions:['4k','custom']}}}
 ]}}));
 await f.page.goto(origin + '/static/online.html');
 await f.page.waitForFunction(() => document.querySelector('#providerSelect-trigger')?.textContent === 'APIMART');
 return f;
}
test('custom selects use direct lists, commit one change, preserve dependencies, and recover focus', async t => {
 const {page, writes, errors} = await online(t), before = writes.length;
 await page.evaluate(() => { window.changed = 0; document.querySelector('#modelSelect').addEventListener('change', () => changed++); });
 const model = page.getByRole('combobox',{name:'模型',exact:true});
 await model.click();
 assert.equal(await page.locator('.studio-select-search').count(),0);
 assert.equal(await page.getByRole('option').count(),19);
 await page.getByRole('listbox',{name:'模型',exact:true}).press('End');
 await page.getByRole('listbox',{name:'模型',exact:true}).press('Enter');
 assert.equal(await model.innerText(),'image-model-17');
 assert.equal(await page.evaluate(() => selectedModel),'image-model-17');
 assert.equal(await page.evaluate(() => changed),1);
 assert.equal(await page.getByRole('combobox',{name:'分辨率',exact:true}).innerText(),'2K');
 await model.click();
 await page.getByRole('listbox',{name:'模型',exact:true}).press('Home');
 await page.getByRole('listbox',{name:'模型',exact:true}).press('Escape');
 assert.equal(await model.evaluate(el => el === document.activeElement),true);
 assert.equal(await page.evaluate(() => changed),1,'Escape must not commit');
 await page.getByRole('combobox',{name:'厂商',exact:true}).click();
 await page.getByRole('option',{name:'Gemini',exact:true}).click();
 assert.equal(await model.innerText(),'nano-banana');
 assert.equal(await page.getByRole('combobox',{name:'生成质量',exact:true}).isVisible(),false);
 assert.equal(await page.getByRole('combobox',{name:'分辨率',exact:true}).innerText(),'4K');
 await page.getByRole('combobox',{name:'分辨率',exact:true}).press('ArrowDown');
 await page.getByRole('listbox',{name:'分辨率',exact:true}).press('End');
 await page.getByRole('listbox',{name:'分辨率',exact:true}).press('Enter');
 assert.equal(await page.getByRole('combobox',{name:'画面比例',exact:true}).isDisabled(),true);
 assert.equal(await page.locator('#sizeCustomWidth').isVisible(),true);
 await page.getByRole('combobox',{name:'图片数量',exact:true}).click();
 await page.getByRole('listbox',{name:'图片数量',exact:true}).press('End');
 await page.getByRole('listbox',{name:'图片数量',exact:true}).press('Enter');
 assert.equal(await page.evaluate(() => outputCount),4);
 await page.getByRole('combobox',{name:'图片数量',exact:true}).click();
 await page.locator('#promptInput').click();
 assert.equal(await page.getByRole('combobox',{name:'图片数量',exact:true}).getAttribute('aria-expanded'),'false');
 await page.evaluate(() => { apiProviders=[{id:'empty',has_key:false,image_models:[]}];renderProviderControls(); });
 assert.equal(await model.isDisabled(),true);
 assert.equal(writes.length,before,'selecting settings does not generate or write data');
 assert.deepEqual(errors,[]);
});
test('select menus fit both themes, mobile and UI zoom with reduced motion', async t => {
 const {page, errors} = await online(t);
 fs.mkdirSync('.local/studio-select',{recursive:true});
 for(const theme of ['dark','light']) for(const [width,height,scale] of [[1280,720,'100'],[390,844,'115'],[768,600,'140']]) {
  await page.setViewportSize({width,height});
  await page.evaluate(({theme,scale}) => {StudioTheme.apply(theme);StudioScale.set(scale,false);},{theme,scale});
  for(const label of ['厂商','模型','生成质量','图片数量','分辨率','画面比例']) {
   const trigger=page.getByRole('combobox',{name:label,exact:true});await trigger.scrollIntoViewIfNeeded();await trigger.click();
   const menu=page.locator('.studio-select-menu:not([hidden])');
   const r=await menu.evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,bg:getComputedStyle(el).backgroundColor};});
   assert.ok(r.left>=-1&&r.right<=width+1&&r.top>=-1&&r.bottom<=height+1,`${theme}/${width}/${scale}/${label}: ${JSON.stringify(r)}`);
   assert.equal(r.bg,theme==='dark'?'rgb(18, 22, 17)':'rgb(255, 255, 255)');
   if(width===1280&&label==='生成质量') {
    const box=await page.locator('.tool-panel').boundingBox();
    await page.screenshot({path:'.local/studio-select/'+theme+'.png',animations:'disabled',clip:{x:box.x,y:box.y,width:box.width,height:Math.max(box.height,r.bottom-box.y)+8}});
   }
   await page.keyboard.press('Escape');
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.getByRole('combobox',{name:'分辨率',exact:true}).click();
 assert.equal(await page.locator('.studio-select-menu:not([hidden])').evaluate(el=>getComputedStyle(el).animationName),'none');
 assert.deepEqual(errors,[]);
});
