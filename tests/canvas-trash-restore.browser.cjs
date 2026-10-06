const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,origin}=require('./helpers/canvas-browser.cjs');

for(const kind of ['classic','smart'])test(`${kind} trash restores through the production member guard and shows failures`,{timeout:15000},async t=>{
 const {page,errors}=await fixture(t,'classic',false);
 const item={id:'deleted-test',kind,title:'回收站恢复验收',revision:3,deleted_at:1,nodes:[],connections:[]};
 let deleted=true,held=false,deny=false,restoreCalls=0,finishRestore;
 const calls=[];
 await page.route('**/api/canvases**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();calls.push({path,method,headers:req.headers()});
  if(path==='/api/canvases')return route.fulfill({json:{canvases:deleted?[]:[item]}});
  if(path==='/api/canvases/trash')return route.fulfill({json:{canvases:deleted?[item]:[]}});
  const lease=()=>({canvas_id:item.id,generation:1,revision:item.revision,holder:held?{id:'member-1',is_self:true}:null,server_time:new Date().toISOString(),expires_at:new Date(Date.now()+60000).toISOString()});
  if(path.endsWith('/acquire')){held=true;return route.fulfill({json:{...lease(),edit_token:'test-private-proof'}});}
  if(path.endsWith('/edit-lease'))return route.fulfill({json:lease()});
  if(path.endsWith('/edit-lease/release')){assert.equal(req.headers()['x-canvas-revision'],String(item.revision));held=false;return route.fulfill({json:{released:true,revision:item.revision}});}
  if(path.endsWith('/restore')){
   restoreCalls++;assert.equal(held,true,JSON.stringify(calls));assert.equal(req.headers()['x-canvas-edit-token'],'test-private-proof');
   assert.equal(req.headers()['x-canvas-revision'],String(item.revision));
   await new Promise(resolve=>finishRestore=resolve);
   if(deny)return route.fulfill({status:403,json:{detail:{code:'permission_denied'}}});
   deleted=false;delete item.deleted_at;item.revision++;return route.fulfill({json:{canvas:item}});
  }
  return route.fulfill({json:{}});
 });
 await page.goto(origin+'/static/canvas.html');
 await page.waitForFunction(()=>typeof setTrashMode==='function'&&typeof apiProviders!=='undefined');
 await page.evaluate(()=>{
  // The intercepted .test origin lacks the secure-context UUID API available on localhost.
  crypto.randomUUID ||= ()=> 'fixture-page-id';
  window.CanvasSession={enabled:true,paused:false,context:{member:{id:'member-1'},workspace:{id:'workspace-1',permissions:['canvas.read','canvas.edit','canvas.restore']}}};
 });
 await page.addScriptTag({url:origin+'/static/js/canvas-edit-lease.js'});
 await page.addScriptTag({url:origin+'/static/js/member-canvas-edit.js'});
 assert.equal(await page.evaluate(()=>Boolean(window.MemberCanvasEdit)),true,'production member guard installed');
 await page.getByRole('button',{name:'打开回收站',exact:true}).click();
 const restore=page.getByRole('button',{name:'恢复画布 回收站恢复验收',exact:true});
 await restore.waitFor({state:'visible'});
 await restore.focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.querySelector('.canvas-restore')?.disabled===true);
 assert.match(await page.locator('#studioHomeFeedback').innerText(),/正在恢复画布/);
 await page.waitForFunction(()=>document.querySelector('.canvas-restore')?.getAttribute('aria-busy')==='true');
 while(!finishRestore)await new Promise(setImmediate);
 finishRestore();
 await page.waitForFunction(()=>document.querySelector('#studioHomeFeedback').textContent.includes('画布已恢复'));
 assert.equal(await restore.count(),0);assert.equal(held,false);
 assert.equal(await page.evaluate(()=>MemberCanvasEdit.active),null);
 assert.equal(calls.some(row=>row.path==='/api/canvases/deleted-test'),false,'deleted document is never opened');
 await page.getByRole('button',{name:'返回画布列表',exact:true}).click();
 assert.equal(await page.locator('[data-canvas-id="deleted-test"]').count(),1);
 if(kind==='classic'){
  fs.mkdirSync(path.resolve('docs/design/trash-restore'),{recursive:true});
  await page.screenshot({path:path.resolve('docs/design/trash-restore/restored-list.png')});
 }
 // A denied restore remains in trash, explains the failure, and can be retried.
 deleted=true;item.deleted_at=1;deny=true;finishRestore=null;
 await page.getByRole('button',{name:'打开回收站',exact:true}).click();await restore.click();
 while(!finishRestore)await new Promise(setImmediate);
 finishRestore();
 await page.waitForFunction(()=>document.querySelector('#studioHomeFeedback').textContent.includes('没有恢复画布的权限'));
 assert.equal(await restore.isEnabled(),true);assert.equal(held,false);assert.equal(restoreCalls,2);
 if(kind==='classic')await page.screenshot({path:path.resolve('docs/design/trash-restore/permission-feedback.png')});
 assert.deepEqual(errors,[]);
});
