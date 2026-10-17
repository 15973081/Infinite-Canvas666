const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function setup(t,member=false){
 return fixture(t,'classic',member,{directory:true,record:{title:'Alpha 10',folder_id:'one',updated_at:10},
  extraRecords:[{id:'two',title:'Alpha 2',folder_id:'one',updated_at:20,pinned:true},
   {id:'three',title:'ＢＥＴＡ',folder_id:'child',updated_at:30,kind:'smart',icon:'✨',color:' red ',cover_style:'sage'},
   {id:'other',title:'Other',folder_id:'',updated_at:1}],
  trashRecords:[{id:'gone',title:'Removed',deleted_at:10,pinned:true,folder_id:'missing'}],
  folders:[{id:'one',name:'One'},{id:'child',name:'Child',parent_id:'one'}]});
}
const ids=page=>page.locator('#gateCanvasList .canvas-item').evaluateAll(rows=>rows.map(r=>r.dataset.canvasId));
async function folder(page,id){await page.locator('#studioFolderTrigger').click();await page.locator('[data-folder-id="'+id+'"] .gate-folder-main').click();}

test('independent directory loads no editor, provider config, task or document modules',async t=>{
 const {page,errors,writes,requests}=await setup(t,true);
 assert.equal(await page.locator('[data-folder-id="one"] .gate-folder-count').textContent(),'2');
 await folder(page,'child');
 assert.equal(await page.locator('[data-canvas-id="three"]').getAttribute('data-cover-style'),'sage');
 assert.equal(await page.evaluate(()=>typeof canvas),'undefined');
 assert.equal(await page.locator('#board,#nodes,[data-canvas-module]').count(),0);
 assert.equal(requests.some(path=>path==='/api/config'||path==='/static/js/canvas.js'||path.startsWith('/static/js/canvas/classic/')||path==='/static/css/canvas.css'||/task-results|page-state|renew/.test(path)),false);
 assert.equal(writes.length,0);assert.deepEqual(errors,[]);
});

test('directory search, clear, folder, sort and trash controls remain independent',async t=>{
 const {page,errors,writes}=await setup(t);
 await page.locator('#gateSearchInput').fill('beta');assert.deepEqual(await ids(page),['three']);
 assert.equal(await page.locator('#gateCountPill').innerText(),'1 个画布');
 await page.locator('#gateSearchClear').click();
 assert.equal(await page.locator('#gateSearchInput').evaluate(el=>el===document.activeElement),true);
 await folder(page,'one');assert.deepEqual(await ids(page),['two','canvas-test']);
 await page.locator('#gateSearchInput').fill('missing');assert.equal(await page.locator('.gate-list-empty').innerText(),'没有找到匹配的画布');
 await page.locator('#gateSearchInput').press('Escape');assert.deepEqual(await ids(page),['two','canvas-test']);
 await folder(page,'all');await page.locator('#studioSortTrigger').click();await page.locator('[data-sort="name"]').click();
 assert.deepEqual(await ids(page),['other']);
 assert.equal(await page.locator('[data-folder-card="one"]').count(),1);
 await folder(page,'one');assert.deepEqual(await ids(page),['two','canvas-test']);
 await page.locator('#gateTrashBtn').click();await page.locator('[data-canvas-id="gone"]').waitFor();assert.deepEqual(await ids(page),['gone']);
 assert.equal(await page.locator('.canvas-pin-btn').count(),0);assert.equal(await page.locator('.canvas-restore').count(),1);
 await page.locator('.canvas-purge').click();assert.equal(await page.locator('.canvas-delete-confirm').count(),1);
 await page.locator('.canvas-cancel-btn').click();assert.equal(await page.locator('.canvas-delete-confirm').count(),0);
 assert.equal(writes.length,0);assert.deepEqual(errors,[]);
});

test('directory metadata commands issue only the intended mutation and preserve server errors',async t=>{
 const {page,record,errors}=await setup(t);const calls=[];
 await page.route('**/api/canvases/canvas-test/meta',async route=>{const patch=route.request().postDataJSON();calls.push(patch);Object.assign(record,patch);await route.fulfill({json:{canvas:record}});});
 await folder(page,'one');
 const card=page.locator('[data-canvas-id="canvas-test"]');
 await card.locator('summary').click();await card.getByRole('button',{name:'置顶',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-canvas-id="canvas-test"]').classList.contains('pinned'));
 await page.evaluate(()=>CanvasDirectoryApi.flush());assert.deepEqual(calls,[{pinned:true}]);
 await card.locator('summary').click();await card.locator('.canvas-card-edit').click();
 await page.locator('#canvasNameField').fill('Directory renamed');await page.getByRole('button',{name:'保存',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-canvas-id="canvas-test"] .canvas-card-title').textContent==='Directory renamed');
 assert.deepEqual(calls,[{pinned:true},{title:'Directory renamed'}]);assert.deepEqual(errors,[]);
});
