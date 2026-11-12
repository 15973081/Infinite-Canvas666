const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,origin}=require('./helpers/canvas-browser.cjs');

async function workspace(t){
 const f=await fixture(t,'classic',false);
 await f.page.route('**/api/skills**',route=>route.fulfill({json:{skills:[],can_import:true}}));
 await f.page.route('**/api/asset-library',route=>route.fulfill({json:{library:{libraries:[{id:'default',name:'默认资产库',categories:[
  {id:'images',name:'图片素材',type:'image',items:[]},{id:'workflows',name:'工作流',type:'workflow',items:[]}
 ]}]}}}));
 await f.page.route('**/api/config',route=>route.fulfill({json:{api_providers:[{id:'test',name:'API',enabled:true,has_key:true,image_models:['gpt-image-2'],chat_models:['test-chat']}],image_models:['gpt-image-2'],chat_models:['test-chat']}}));
 return f;
}

test('empty workflow shelf keeps its upload target through resizing, search and virtualized results',async t=>{
 const {page,errors,writes}=await workspace(t);
 await page.goto(origin+'/static/asset-manager.html');
 await page.getByRole('button',{name:'工作流管理',exact:true}).click();
 const upload=page.locator('#workflowDrop');await upload.waitFor();
 const before=writes.length;
 for(const width of [1440,1024]){
  await page.setViewportSize({width,height:900});
  const empty=await page.locator('.asset-content .empty-state').boundingBox(),button=await upload.boundingBox();
  assert.ok(button.y>empty.y&&button.y+button.height<empty.y+empty.height);
  assert.ok(Math.abs(button.x+button.width/2-empty.x-empty.width/2)<1,'upload stays centered in the empty shelf');
  const bottoms=await page.locator('.asset-manager-root>.asset-panel').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().bottom));
  assert.ok(bottoms.every(value=>Math.abs(value-bottoms[0])<1),'three panels share a bottom edge');
 }
 const chooser=page.waitForEvent('filechooser');await upload.click();assert.equal((await chooser).isMultiple(),true);
 await page.evaluate(()=>{
  assetLibrary.libraries[0].categories[1].items=Array.from({length:80},(_,i)=>({id:'workflow-'+i,name:'流程 '+i,kind:'workflow',format:'json',url:'/fixtures/'+i+'.json'}));
  render();
 });
 await page.locator('.workflow-card').first().waitFor();
 assert.equal(await page.locator('.asset-content .empty-state').count(),0);
 const grid=page.locator('[data-manager-virtual-grid]');
 assert.equal(await grid.evaluate(el=>getComputedStyle(el).display),'grid');
 await page.locator('.asset-content .content-scroll').evaluate(el=>el.scrollTop=el.scrollHeight);
 await page.locator('[data-workflow-card="workflow-79"]').waitFor();
 await page.locator('#workflowSearch').fill('没有这个工作流');
 await page.locator('[data-manager-clear-search]').waitFor();
 await page.getByRole('button',{name:'清空搜索',exact:true}).click();
 await page.locator('.workflow-card').first().waitFor();
 assert.equal(writes.length,before,'presentation and search do not upload or mutate the library');
 assert.deepEqual(errors,[]);
});

test('empty workspace layouts fit narrow screens and image results retain stretched panels',async t=>{
 const {page,errors}=await workspace(t);
 for(const name of ['skill-library','gpt-chat','online']){
  await page.goto(origin+'/static/'+name+'.html');
  if(name==='skill-library')await page.locator('.skill-empty').waitFor();
  if(name==='online')await page.getByRole('combobox',{name:'模型',exact:true}).waitFor();
  for(const width of [1440,768,390]){
   await page.setViewportSize({width,height:900});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,name+' '+width);
   if(name==='gpt-chat'){
    const bounds=await page.locator('.composer-wrap').boundingBox();
    assert.ok(bounds.y>=0&&bounds.y+bounds.height<=900,'welcome and composer stay in the viewport');
    assert.match(await page.locator('.composer-wrap').evaluate(el=>getComputedStyle(el,'::before').content),/有什么可以帮你的/);
   }
   if(name==='online'&&width>760){
    const bottoms=await page.locator('.image-workspace-layout>div').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().bottom));
    assert.ok(Math.abs(bottoms[0]-bottoms[1])<1,'empty preview stretches to the settings panel');
   }
  }
  if(name==='skill-library'){
   const disclosure=page.locator('#skillContextUpgrade');await disclosure.locator('summary').click();
   assert.equal(await disclosure.getAttribute('open'),'');
   assert.equal(await disclosure.locator('summary').evaluate(el=>getComputedStyle(el).listStyleType),'none');
  }
  if(name==='online'){
   await page.setViewportSize({width:1440,height:900});
   await page.evaluate(()=>{document.getElementById('placeholder').classList.add('hidden');const image=document.getElementById('outputImg');image.src='/test-image.svg';image.classList.remove('hidden')});
   await page.locator('#outputImg').waitFor();
   const bottoms=await page.locator('.image-workspace-layout>div').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().bottom));
   assert.ok(Math.abs(bottoms[0]-bottoms[1])<1,'loaded preview keeps the same stretched layout');
   await page.locator('.image-records>summary').click();assert.equal(await page.locator('.image-records').getAttribute('open'),'');
  }
 }
 assert.deepEqual(errors,[]);
});
