const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');

test('director round trip and repeated notification timeouts retain editing; real takeover still stops writes',async t=>{
 const {page,record,errors}=await fixture(t,'smart',true,{secureOrigin:true});
 let generation=1,held=false,renewals=0,acquires=0;
 const state=()=>({canvas_id:'canvas-test',generation,revision:record.revision,
  holder:held?{id:'member-1',display_name:'Test member',is_self:true}:null,
  server_time:new Date().toISOString(),expires_at:held?new Date(Date.now()+60000).toISOString():null,heartbeat_seconds:5});
 await page.route('**/api/canvases/canvas-test/edit-lease**',route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.pathname.endsWith('/acquire')){held=true;acquires++;return route.fulfill({json:{...state(),edit_token:'test-private-lease'}});}
  if(url.pathname.endsWith('/renew')){
   renewals++;
   if(req.headers()['x-canvas-generation']!==String(generation))return route.fulfill({status:409,json:{detail:{code:'canvas_lease_lost'}}});
   return route.fulfill({json:state()});
  }
  return route.fulfill({json:{lease:state(),requests:[]}});
 });
 await page.route('**/api/canvases/canvas-test/page-state',route=>route.fulfill({json:{presence:{online_members:1,members:[]}}}));
 await page.clock.install();
 await page.evaluate(()=>{
  window.realLeaseOptions=MemberCanvasEdit.options;
  window.notificationSockets=[];
  window.WebSocket=class {
   constructor(){notificationSockets.push(this);this.readyState=1;}
   close(code=1006){this.readyState=3;this.onclose?.({code});}
  };
 });
 await page.addScriptTag({url:'/static/js/canvas-subscription.js'});
 await page.addScriptTag({url:'/static/js/member-canvas-edit.js'});
 await page.addStyleTag({url:'/static/css/member-canvas-edit.css'});
 await page.evaluate(()=>MemberCanvasEdit.mount(realLeaseOptions));
 await page.getByRole('button',{name:'开始编辑',exact:true}).click();
 await page.waitForFunction(()=>MemberCanvasEdit.canEdit);
 const proof=await page.evaluate(()=>({epoch:MemberCanvasEdit.active.lease.epoch,generation:MemberCanvasEdit.active.lease.generation}));
 await page.evaluate(()=>{const node=createSmartStudioNode('director',{x:600,y:350});openSmartStudio(node.id);});
 const frame=page.frameLocator('.pixmax-editor-overlay iframe');
 await frame.locator('.stage-editor').waitFor({timeout:30000});
 await frame.getByRole('button',{name:'添加几何体',exact:true}).click();
 await frame.getByRole('button',{name:'正方体',exact:true}).click();
 let before=renewals;
 await page.evaluate(()=>notificationSockets.at(-1).close());
 await page.waitForFunction(()=>Boolean(MemberCanvasEdit.active.lease.renewing)===false);
 assert.ok(renewals>before);assert.equal(await page.evaluate(()=>MemberCanvasEdit.canEdit),true);
 await frame.getByRole('button',{name:'关闭编辑器',exact:true}).click();
 await page.waitForFunction(()=>!smartStudioSession);
 assert.equal(await page.evaluate(()=>nodes.find(n=>n.type==='smart-director').studioDocument.nodes.length),1);
 assert.equal(await page.getByRole('button',{name:'接管到本页',exact:true}).isVisible(),false);
 for(let i=0;i<3;i++){
  before=renewals;
  await page.clock.fastForward(26000);
  await page.waitForFunction(()=>MemberCanvasEdit.active.lease.renewing===null);
  assert.ok(renewals>before,'HTTP lease renews across notification watchdog timeouts');
  assert.equal(await page.evaluate(()=>MemberCanvasEdit.canEdit),true);
 }
 await page.evaluate(async()=>{
  nodes.find(n=>n.type==='smart-director').title='导演台续期验收';scheduleSave();
  if(!await MemberCanvasEdit.active.options.flush())throw Error('save failed');
 });
 assert.equal(record.nodes.find(n=>n.type==='smart-director').title,'导演台续期验收');
 assert.deepEqual(await page.evaluate(()=>({epoch:MemberCanvasEdit.active.lease.epoch,generation:MemberCanvasEdit.active.lease.generation})),proof);
 assert.equal(acquires,1,'notification reconnect never takes over or reacquires');
 generation++;
 await page.evaluate(async()=>{try{await MemberCanvasEdit.active.lease.renew();}catch(_){}});
 assert.equal(await page.evaluate(()=>MemberCanvasEdit.canEdit),false);
 assert.equal(await page.evaluate(()=>nodes.find(n=>n.type==='smart-director').title),'导演台续期验收');
 assert.equal(acquires,1);assert.deepEqual(errors,[]);
});
