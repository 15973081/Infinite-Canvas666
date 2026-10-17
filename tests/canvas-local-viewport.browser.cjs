const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');

for(const kind of ['smart','classic'])test(kind+': navigation stays local while content changes still save',async t=>{
 const original={x:17,y:23,scale:1};
 const {page,writes,record,errors}=await fixture(t,kind,true,{record:{viewport:original}});
 await page.evaluate(()=>Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}}));
 await page.clock.install();
 const initial=await page.evaluate(()=>({...viewport}));
 await page.mouse.move(900,500);await page.mouse.down({button:'middle'});
 await page.mouse.move(1040,580,{steps:8});await page.mouse.up({button:'middle'});
 await page.mouse.wheel(0,120);
 if(kind==='smart'){
  await page.keyboard.down('Control');await page.mouse.wheel(0,-120);await page.keyboard.up('Control');
  await page.evaluate(()=>{centerViewportOnWorldPoint({x:600,y:300});fitAllNodesViewport();enterZoomPreview();exitZoomPreview();zoomPixmaxCanvas(1.2);});
 }
 await page.clock.fastForward(2500);
 await page.evaluate(()=>MemberCanvasEdit.options.flush());
 const local=await page.evaluate(()=>({...viewport}));assert.notDeepEqual(local,initial);
 assert.equal(await page.evaluate(()=>MemberCanvasEdit.options.dirty()),false);
 assert.equal(writes.filter(row=>row.method==='PUT'||row.path.endsWith('/page-state')).length,0,'navigation sends neither saves nor dirty reports');
 assert.deepEqual(record.viewport,original);
 await page.reload();await page.waitForFunction(()=>Boolean(MemberCanvasEdit.active));
 assert.deepEqual(await page.evaluate(()=>({...viewport})),local,'same tab remembers its own viewport');
 await page.evaluate(()=>Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}}));
 await page.evaluate(async()=>{canvas.title='内容修改仍保存';scheduleSave();await MemberCanvasEdit.options.flush();});
 assert.equal(record.title,'内容修改仍保存');
 assert.equal(writes.filter(row=>row.method==='PUT').length,1);
 assert.deepEqual(record.viewport,original,'content save does not upload the navigation viewport');
 assert.deepEqual(errors,[]);
});
