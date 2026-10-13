const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,origin}=require('./helpers/canvas-browser.cjs');

test('studio pages render local Tabler geometry, including dynamic library and chat menus',async t=>{
 const {page,writes,errors}=await fixture(t,'classic',false);
 const warnings=[];page.on('console',message=>{if(message.text().includes('Unknown studio icon:'))warnings.push(message.text());});
 const external=[];page.on('request',request=>{if(!request.url().startsWith(origin))external.push(request.url());});
 await page.route(/\/api\/canvas-assets(?:\?|$)/,route=>route.fulfill({json:{categories:[],canvases:[{id:'c',title:'品牌画布',kind:'classic'},{id:'s',title:'智能开始',kind:'smart'}],items:[]}}));
 for(const name of ['canvas-home','canvas','smart-canvas','online','gpt-chat','asset-manager']){
  await page.goto(origin+'/static/'+name+'.html'+(['canvas','smart-canvas'].includes(name)?'?id=canvas-test':''));
  await page.waitForFunction(()=>Boolean(window.StudioIcons)&&document.querySelector('svg[data-studio-icon]'));
  await page.waitForLoadState('networkidle');
  const before=writes.length;
  if(name==='canvas-home'){
   await page.evaluate(()=>CanvasHome.ready);
   await page.locator('.studio-card-menu summary').click();
   assert.equal(await page.locator('.studio-card-menu [data-tabler="folder-symlink"]').count(),1);
  }
  if(name==='gpt-chat')await page.locator('#modelPickerBtn').click();
  if(name==='asset-manager'){
   await page.getByRole('button',{name:'画布资产',exact:true}).click();
   await page.getByText('智能开始',{exact:true}).waitFor();
   assert.ok(await page.locator('.tree-row-icon [data-tabler="sparkles"]').count()>0);
   assert.ok(await page.locator('.tree-row-icon [data-tabler="layout-grid"]').count()>0);
   const fold=page.getByRole('button',{name:'折叠智能画布 0',exact:true});
   assert.equal(await fold.locator('[data-tabler="chevron-down"]').count(),1);
   await fold.click();
   assert.equal(await page.getByRole('button',{name:'展开智能画布 0',exact:true}).locator('[data-tabler="chevron-right"]').count(),1);
   await page.getByRole('button',{name:'展开智能画布 0',exact:true}).click();
  }
  const actual=await page.evaluate(()=>[...document.querySelectorAll('[data-lucide]')].map(el=>({tag:el.tagName.toLowerCase(),name:el.dataset.lucide,target:el.dataset.tabler,stroke:el.getAttribute('stroke-width'),
   valid:el.tagName.toLowerCase()==='svg'&&JSON.stringify([...el.children].map(n=>[n.tagName,Object.fromEntries([...n.attributes].map(a=>[a.name,a.value]))]))===JSON.stringify(StudioIcons.icons[el.dataset.tabler])})));
  assert.ok(actual.length>0,name+' has real icons');
  assert.ok(actual.every(icon=>icon.tag==='svg'&&icon.target&&icon.stroke==='1.5'&&icon.valid),name+': '+JSON.stringify(actual.filter(icon=>!icon.valid)));
  for(const theme of ['dark']){

   for(const width of [390,1280]){
    await page.setViewportSize({width,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,name+' fits '+width);
   }
  }
  assert.equal(writes.length,before,name+' presentation does not write business data');
 }
 assert.deepEqual(warnings,[]);assert.deepEqual(external,[],'icons load from local resources');assert.deepEqual(errors,[]);
});

test('icon refresh preserves identifiers, accessibility, interaction and existing SVG identity',async t=>{
 const {page,writes}=await fixture(t,'classic',false);
 await page.goto(origin+'/static/online.html');
 await page.waitForFunction(()=>Boolean(window.StudioIcons));
 const before=writes.length;
 const result=await page.evaluate(()=>{
  const button=document.createElement('button');button.type='button';button.setAttribute('aria-label','回归按钮');
  button.innerHTML='<i id="icon-regression" data-lucide="Image" class="w-4 custom-icon" style="display:none" aria-label="示例图片" role="img"></i>';
  let clicks=0;button.onclick=()=>clicks++;document.body.append(button);lucide.createIcons({root:button});
  const icon=button.querySelector('svg');icon.addEventListener('click',()=>clicks++);
  lucide.createIcons({root:button});icon.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  const preserved={id:icon.id,library:icon.dataset.tabler,role:icon.getAttribute('role'),label:icon.getAttribute('aria-label'),hidden:icon.getAttribute('aria-hidden'),display:icon.style.display,
   custom:icon.classList.contains('custom-icon'),same:icon===button.querySelector('svg'),clicks};
  button.innerHTML='<i data-lucide="loader-2" class="animate-spin"></i>';lucide.createIcons({root:button});
  preserved.spinner=button.querySelector('svg').classList.contains('animate-spin');
  const template=document.createElement('template');template.innerHTML='<i data-lucide="trash-2"></i>';button.append(template);lucide.createIcons({root:button,inTemplates:true});
  preserved.template=template.content.querySelector('svg').dataset.tabler;button.remove();return preserved;
 });
 assert.deepEqual(result,{id:'icon-regression',library:'photo',role:'img',label:'示例图片',hidden:null,display:'none',custom:true,same:true,clicks:2,spinner:true,template:'trash'});
 assert.equal(writes.length,before);
});
