const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');

async function prepare(page){
 await page.evaluate(()=>Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}}));
 const time=new Date('2026-10-17T00:00:00Z');
 await page.clock.install({time});await page.clock.pauseAt(time);
}
for(const kind of ['smart','classic']){
 test(kind+': autosave waits five idle seconds, manual flush remains immediate',async t=>{
  const {page,writes,record,errors}=await fixture(t,kind,true);await prepare(page);
  const saves=()=>writes.filter(row=>row.method==='PUT');
  await page.evaluate(()=>{canvas.title='first edit';scheduleSave();});
  await page.clock.runFor(4000);assert.equal(saves().length,0);
  await page.evaluate(()=>{canvas.title='final edit';scheduleSave();});
  await page.clock.runFor(4999);assert.equal(saves().length,0,'another edit restarts the idle delay');
  await page.clock.runFor(1);
  await page.waitForFunction(()=>!MemberCanvasEdit.options.dirty());
  assert.equal(saves().length,1);assert.equal(record.title,'final edit');
  await page.evaluate(async()=>{canvas.title='manual flush';scheduleSave();await MemberCanvasEdit.options.flush();});
  assert.equal(saves().length,2);assert.equal(record.title,'manual flush');
  await page.clock.runFor(6000);assert.equal(saves().length,2,'timer after manual save does not upload again');
  await page.evaluate(()=>{canvas.title='unsaved after lease loss';scheduleSave();MemberCanvasEdit.setEditable(false);});
  await page.clock.runFor(5000);assert.equal(saves().length,2,'pending autosave cannot bypass editing permission');
  assert.deepEqual(errors,[]);
 });
 test(kind+': editing during an in-flight save still waits from the latest edit',async t=>{
  let release,entered,held=false;
  const gate=new Promise(resolve=>{release=resolve;});
  const arrived=new Promise(resolve=>{entered=resolve;});
  const {page,writes,record,errors}=await fixture(t,kind,true,{apiHandler:async request=>{
   if(request.method()==='PUT'&&!held){held=true;entered();await gate;}
  }});await prepare(page);
  const saves=()=>writes.filter(row=>row.method==='PUT');
  const firstRequest=page.waitForRequest(request=>request.method()==='PUT');
  await page.evaluate(()=>{canvas.title='initial save';scheduleSave();});
  await page.clock.runFor(5000);await firstRequest;await arrived;
  assert.equal(saves().length,1);
  await page.clock.runFor(1000);
  await page.evaluate(()=>{canvas.title='edited while saving';scheduleSave();});
  await page.clock.runFor(1000);release();
  await page.waitForFunction(()=>typeof smartSaveInFlight!=='undefined'?!smartSaveInFlight:!savingCanvasNow);
  assert.equal(saves().length,1);
  await page.clock.runFor(3999);assert.equal(saves().length,1);
  await page.clock.runFor(1);
  await page.waitForFunction(()=>!MemberCanvasEdit.options.dirty());
  assert.equal(saves().length,2);assert.equal(record.title,'edited while saving');
  assert.deepEqual(errors,[]);
 });
}
