const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');
const folders=[{id:'a',name:'品牌',parent_id:''},{id:'b',name:'品牌',parent_id:'a'},{id:'c',name:'宣传片',parent_id:''}];
const menu=page=>page.locator('.canvas-item .studio-card-menu').first();
const openPicker=async page=>{await menu(page).locator('summary').click();await menu(page).getByRole('button',{name:/^移动到文件夹/}).click();};

test('card actions paint above the cover and open a centered top-layer folder picker',async t=>{
 const {page,errors,writes}=await fixture(t,'classic',false,{directory:true,folders});
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.locator('.canvas-item').hover();
 const layers=await page.locator('.canvas-item').evaluate(card=>({
  menu:+getComputedStyle(card.querySelector('.studio-card-menu')).zIndex,
  cover:+getComputedStyle(card.querySelector('.project-card-enter')).zIndex
 }));assert.ok(layers.menu>layers.cover);
 await menu(page).locator('summary').click();
 await page.waitForFunction(()=>Boolean(document.querySelector('.studio-card-menu[open] .studio-card-menu-items')?.style.left));
 const trigger=await menu(page).locator('summary').boundingBox(),panel=await menu(page).locator('.studio-card-menu-items').boundingBox();
 assert.ok(Math.abs(trigger.x+trigger.width-panel.x-panel.width)<1,'menu aligns to trigger right edge');
 assert.ok(panel.y>=trigger.y+trigger.height&&panel.y+panel.height<900);
 await page.screenshot({path:path.resolve('.local/commercial-kickoff/project-card-menu-fixed.png')});
 await menu(page).getByRole('button',{name:/^移动到文件夹/}).click();
 const dialog=page.getByRole('dialog',{name:'移动到文件夹'});
 assert.equal(await dialog.evaluate(el=>el.matches(':modal')),true);
 const bounds=await dialog.boundingBox();assert.equal(bounds.width,480);assert.ok(Math.abs(bounds.x+bounds.width/2-640)<1);
 assert.equal(await dialog.locator('[data-folder-destination=""]').isDisabled(),true);
 assert.match(await dialog.locator('[data-folder-destination="b"]').innerText(),/品牌 \/ 品牌/);
 assert.equal(await page.locator('.canvas-folder-menu').count(),0);
 await page.screenshot({path:path.resolve('.local/commercial-kickoff/project-folder-picker.png')});
 await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
 await page.waitForFunction(()=>document.activeElement===document.querySelector('.canvas-item .studio-card-menu summary'));
 assert.equal(await menu(page).locator('summary').evaluate(el=>el===document.activeElement),true);
 assert.equal(writes.length,0);assert.deepEqual(errors,[]);
});

test('picker keeps errors visible, retries once, and supports an explicit move out to root',async t=>{
 const {page,record,errors}=await fixture(t,'classic',false,{directory:true,folders});
 let denied=true,release;const calls=[];
 await page.route('**/api/canvases/canvas-test/folder',async route=>{
  const body=route.request().postDataJSON();calls.push(body);
  if(denied)return route.fulfill({status:403,json:{detail:'没有移动权限'}});
  if(body.folder_id==='a')await new Promise(resolve=>{release=resolve;});
  record.folder_id=body.folder_id;return route.fulfill({json:{canvas:record}});
 });
 await openPicker(page);const dialog=page.getByRole('dialog',{name:'移动到文件夹'});
 const destination=dialog.locator('[data-folder-destination="a"]');
 await destination.click();await dialog.getByRole('alert').filter({hasText:'没有移动权限'}).waitFor();
 assert.equal(await dialog.isVisible(),true);assert.equal(await page.locator('.canvas-item').count(),1);
 denied=false;await destination.click();await page.waitForFunction(()=>document.querySelector('dialog')?.getAttribute('aria-busy')==='true');
 await destination.evaluate(el=>{el.click();el.click();});await page.keyboard.press('Escape');
 assert.equal(await dialog.isVisible(),true,'pending move cannot be dismissed');
 assert.equal(calls.length,2);release();await dialog.waitFor({state:'detached'});
 assert.equal(await page.locator('.canvas-item').count(),0);
 await page.locator('[data-folder-card="a"] .project-folder-open').click();
 await menu(page).locator('summary').click();
 await menu(page).getByRole('button',{name:'移出文件夹',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('.canvas-item'));
 await page.locator('#projectFolderPath').getByRole('button',{name:'全部画布',exact:true}).click();
 assert.equal(await page.locator('.canvas-item').count(),1);
 await menu(page).locator('summary').click();assert.equal(await menu(page).getByRole('button',{name:'移出文件夹',exact:true}).count(),0);
 assert.deepEqual(calls,[{folder_id:'a'},{folder_id:'a'},{folder_id:''}]);assert.deepEqual(errors,[]);
});

test('picker can remove a filed project and scroll a long list without clipping its close button',async t=>{
 const many=[...folders,...Array.from({length:40},(_,i)=>({id:'f'+i,name:'文件夹 '+i,parent_id:''}))];
 const {page,record,errors}=await fixture(t,'classic',false,{directory:true,folders:many,record:{folder_id:'a'}});
 await page.route('**/api/canvases/canvas-test/folder',route=>{record.folder_id=route.request().postDataJSON().folder_id;return route.fulfill({json:{canvas:record}});});
 await page.locator('[data-folder-card="a"] .project-folder-open').click();await openPicker(page);
 const dialog=page.getByRole('dialog',{name:'移动到文件夹'});
 assert.ok((await dialog.boundingBox()).height<=630);
 await dialog.locator('[data-folder-destination="f39"]').scrollIntoViewIfNeeded();
 assert.equal(await dialog.getByRole('button',{name:'关闭',exact:true}).isVisible(),true);
 assert.ok(await dialog.locator('.folder-picker-list').evaluate(el=>el.scrollTop>0));
 await dialog.locator('[data-folder-destination=""]').click();await dialog.waitFor({state:'detached'});
 assert.equal(await page.locator('.canvas-item').count(),0);assert.equal(record.folder_id,'');assert.deepEqual(errors,[]);
});

