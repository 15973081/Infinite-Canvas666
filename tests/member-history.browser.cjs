const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function setup(t){
 const f=await fixture(t,'smart',true,{secureOrigin:true,permissions:['canvas.read','canvas.edit','canvas.create','asset.read']});
 let editing=false;
 await f.page.route('**/api/canvases/canvas-test/edit-lease**',route=>{
  if(route.request().url().endsWith('/acquire'))editing=true;
  const lease={canvas_id:'canvas-test',generation:1,revision:3,holder:editing?{id:'member-1',is_self:true,display_name:'测试成员'}:null,edit_token:editing?'test-token':null,server_time:new Date().toISOString(),expires_at:new Date(Date.now()+60000).toISOString()};
  return route.fulfill({json:route.request().url().endsWith('/transfers')?{lease,requests:[]}:lease});
 });
 await f.page.route('**/api/canvases/canvas-test/page-state',route=>route.fulfill({json:{presence:{online_members:1,members:[]}}}));
 await f.page.addStyleTag({url:'/static/css/member-canvas-edit.css'});
 await f.page.addScriptTag({url:'/static/js/member-canvas-edit.js'});
 await f.page.evaluate(()=>{
  window.historyDocument={id:'canvas-test',kind:'smart',revision:3,nodes:[],connections:[]};window.historyDirty=false;
  return MemberCanvasEdit.mount({id:'canvas-test',dirty:()=>historyDirty,snapshot:()=>historyDocument,reload:async()=>({revision:3}),flush:async()=>true,restore:doc=>{window.historyDocument=doc;window.historyDirty=true;}});
 });
 await f.page.waitForFunction(()=>MemberCanvasEdit.active.lease.state==='view');
 return f;
}
async function seed(page,items){
 await page.evaluate(async items=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('canvas-member-drafts',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');for(const item of items){
   const row={member_id:'member-1',workspace_id:'workspace-1',canvas_id:'canvas-test',page:'old-'+item.age,base_revision:3,record_id:'record-'+item.age,saved_at:new Date(Date.now()-item.age*60000).toISOString(),document:{id:'canvas-test',kind:'smart',revision:3,nodes:[{id:'saved',text:'历史内容'}],connections:[]},...item};
   row.key=JSON.stringify([row.member_id,row.workspace_id,row.canvas_id,row.page]);tx.objectStore('drafts').put(row);
  }tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
 },items);
}
async function open(page){
 await page.getByRole('button',{name:'画布菜单',exact:true}).click();await page.getByRole('menuitem',{name:'查看历史版本',exact:true}).click();
 await page.locator('.member-history-group>summary').filter({hasText:/个历史版本/}).waitFor();
 return page.getByRole('dialog',{name:'历史版本',exact:true});
}

test('history lives in a nonmodal right sidebar with scoped timeline and no old smart draft entry',async t=>{
 const {page,errors,writes}=await setup(t);await seed(page,[...Array.from({length:20},(_,i)=>({age:1+i*5})),{age:20,member_id:'another-member'},{age:30,canvas_id:'other-canvas'}]);
 const panel=await open(page);assert.equal(await panel.locator('.member-history-row').count(),20);
 assert.equal(await panel.evaluate(n=>n.matches(':modal')),false);
 assert.equal(await page.getByRole('button',{name:'自动草稿',exact:true}).count(),0);
 await page.evaluate(()=>MemberCanvasEdit.openHistory());assert.equal(await page.locator('.member-canvas-history').count(),1);
 const row=panel.locator('.member-history-row').first();await row.locator('summary').click();
 assert.equal(await row.getByText('1 个节点 · 0 条连线',{exact:true}).count(),1);
 await row.getByRole('button',{name:'恢复到本页',exact:true}).click();await row.getByRole('status').filter({hasText:'请先在底部开始编辑'}).waitFor();
 assert.equal(await page.evaluate(()=>historyDocument.nodes.length),0);
 await panel.locator('.member-history-group>summary').click();assert.equal(await row.isVisible(),false);
 await panel.locator('.member-history-group>summary').click();
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:900});await panel.evaluate(async n=>Promise.all(n.getAnimations().map(a=>a.finished)));
  const b=await panel.boundingBox();assert.equal(b.width,260);assert.equal(b.x,width-260);assert.equal(b.y,0);assert.equal(b.height,900);
  assert.equal(await panel.locator('.member-history-scroll').evaluate(n=>n.scrollHeight>n.clientHeight),true);
  await page.screenshot({path:'.local/commercial-kickoff/history-sidebar-'+width+'.png'});
 }
 await panel.getByRole('button',{name:'关闭历史版本',exact:true}).focus();await page.keyboard.press('Escape');assert.equal(await panel.count(),0);
 assert.equal(writes.some(w=>w.path.includes('acquire')||w.path.includes('copies')||w.method==='PUT'),false);assert.deepEqual(errors,[]);
});

test('timeline restores only after confirmation, keeps current content on revision mismatch, and preserves original history',async t=>{
 const {page,errors,writes}=await setup(t);await seed(page,[{age:1,base_revision:2},{age:6}]);
 await page.getByRole('button',{name:'开始编辑',exact:true}).click();await page.waitForFunction(()=>MemberCanvasEdit.canEdit);
 const panel=await open(page),rows=panel.locator('.member-history-row');
 await rows.first().locator('summary').click();await rows.first().getByRole('button',{name:'恢复到本页'}).click();
 assert.equal(await page.evaluate(()=>historyDocument.nodes.length),0);
 await page.getByRole('button',{name:'确认恢复到本页',exact:true}).click();await rows.first().getByRole('status').filter({hasText:'版本不一致'}).waitFor();
 assert.equal(await page.evaluate(()=>historyDocument.nodes.length),0);
 await rows.nth(1).locator('summary').click();await rows.nth(1).getByRole('button',{name:'恢复到本页'}).click();
 await page.getByRole('button',{name:'取消',exact:true}).click();assert.equal(await page.evaluate(()=>historyDocument.nodes.length),0);
 await rows.nth(1).getByRole('button',{name:'恢复到本页'}).click();await page.getByRole('button',{name:'确认恢复到本页',exact:true}).click();
 await panel.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>historyDocument.nodes[0].text),'历史内容');
 const reopened=await open(page);assert.equal(await reopened.locator('.member-history-row').count(),3);
 assert.equal(writes.some(w=>w.method==='PUT'||w.path.includes('tasks')),false);assert.deepEqual(errors,[]);
});

test('history deletion updates the count and empty state; changing member closes the scoped sidebar',async t=>{
 const {page,errors}=await setup(t);await seed(page,[{age:1}]);const panel=await open(page);
 await panel.locator('.member-history-row>summary').click();await panel.getByRole('button',{name:'删除记录',exact:true}).click();
 await page.getByRole('button',{name:'确认删除记录',exact:true}).click();await panel.getByText('暂无本机历史记录',{exact:true}).waitFor();
 assert.equal(await panel.locator('.member-history-row').count(),0);
 await page.evaluate(()=>{CanvasSession.context.member.id='different';window.dispatchEvent(new CustomEvent('member-session:paused',{detail:{message:'账号已变化'}}));});
 await panel.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>document.body.classList.contains('member-history-open')),false);assert.deepEqual(errors,[]);
});
