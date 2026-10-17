const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('static/js/canvas-api.js','utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
function setup(protocol='graph-delta-v2'){
 let document={id:'test',revision:1,updated_at:10,title:'Test',nodes:Array.from({length:100},(_,i)=>({id:'n'+i,x:i,text:'x'.repeat(1000)})),connections:[{from:'n0',to:'n1'}],logs:[]};
 const calls=[];let hold=null,fail=false;
 const window={CanvasSession:{enabled:true,context:{member:{id:'m'},workspace:{id:'w'}}}};
 const fetch=async(path,init={})=>{
  if(init.method==='PUT'){
   const body=JSON.parse(init.body);calls.push(body);if(hold)await hold;
   if(fail)return new Response('{}',{status:409});
   if(body.graph_delta){
    const d=body.graph_delta,map=new Map(document.nodes.map(n=>[n.id,n]));
    for(const id of d.delete)map.delete(id);for(const node of [...d.create,...d.update])map.set(node.id,node);
    document.nodes=d.node_order?d.node_order.map(id=>map.get(id)):[...map.values()];
    document.connections=document.connections.filter(e=>!d.connections_remove.some(r=>JSON.stringify(r)===JSON.stringify(e))).concat(d.connections_add);
    if(d.connections_order)document.connections=d.connections_order;
    for(const [key,value] of Object.entries(body))if(!['graph_delta','base_revision','base_updated_at','client_id'].includes(key))document[key]=value;
   }else document={...document,...body};
   document.revision++;document.updated_at++;
  }
  return new Response(JSON.stringify({canvas:document,save_protocol:protocol}),{headers:{'Content-Type':'application/json'}});
 };
 vm.runInNewContext(source,{window,fetch,Response});
 const payload=()=>({...clone(document),base_updated_at:document.updated_at,client_id:'page'});
 return {api:window.CanvasApi,window,calls,payload,get doc(){return document;},hold(value){hold=value;},fail(){fail=true;}};
}
test('one changed node sends a small delta; reverting content sends no write',async t=>{
 const h=setup();await h.api.getCanvas('test');let p=h.payload();p.nodes[5].x=123;
 const size=JSON.stringify(p).length;await h.api.saveCanvas('test',p);
 assert.equal(h.calls[0].nodes,undefined);assert.equal(h.calls[0].graph_delta.update.length,1);
 assert.equal(h.calls[0].graph_delta.update[0].id,'n5');assert.ok(JSON.stringify(h.calls[0]).length<size/10);
 t.diagnostic('100-node fixture, one position edit: '+size+' -> '+JSON.stringify(h.calls[0]).length+' bytes');
 p=h.payload();p.nodes[5].x=200;p.nodes[5].x=123;
 const response=await h.api.saveCanvas('test',p);assert.equal((await response.json()).unchanged,true);assert.equal(h.calls.length,1);
});
test('create/delete/reorder and edge changes survive in the delta',async()=>{
 const h=setup();await h.api.getCanvas('test');const p=h.payload();p.nodes=p.nodes.filter(n=>n.id!=='n1');p.nodes.unshift({id:'added',x:9});
 p.connections=[{from:'n0',to:'added'}];p.title='Changed';await h.api.saveCanvas('test',p);
 const d=h.calls[0].graph_delta;assert.deepEqual(d.delete,['n1']);assert.deepEqual(d.create,[{id:'added',x:9}]);
 assert.equal(d.node_order[0],'added');assert.deepEqual(d.connections_remove,[{from:'n0',to:'n1'}]);
 assert.equal(h.doc.title,'Changed');assert.deepEqual(h.doc.nodes,p.nodes);assert.deepEqual(h.doc.connections,p.connections);
});
test('acknowledgement cannot include edits made during the request',async()=>{
 const h=setup();await h.api.getCanvas('test');let release;h.hold(new Promise(r=>release=r));
 const p=h.payload();p.nodes[0].x=111;const pending=h.api.saveCanvas('test',p);p.nodes[0].x=222;release();await pending;h.hold(null);
 p.base_updated_at=h.doc.updated_at;await h.api.saveCanvas('test',p);
 assert.equal(h.calls.length,2);assert.equal(h.calls[0].graph_delta.update[0].x,111);assert.equal(h.calls[1].graph_delta.update[0].x,222);
});
test('old servers and changed workspace use full saves; failed saves never acknowledge changes',async()=>{
 for(const protocol of [null,'graph-delta-v1']){
  const old=setup(protocol);await old.api.getCanvas('test');let p=old.payload();p.nodes[0].x=99;await old.api.saveCanvas('test',p);assert.ok(old.calls[0].nodes);
 }
 const h=setup();await h.api.getCanvas('test');h.window.CanvasSession.context.workspace.id='other';let p=h.payload();p.nodes[0].x=99;await h.api.saveCanvas('test',p);assert.ok(h.calls[0].nodes);
 h.fail();p=h.payload();p.nodes[0].x=101;assert.equal((await h.api.saveCanvas('test',p)).status,409);
 await h.api.saveCanvas('test',p);assert.equal(h.calls.length,3);
});

test('observing a new result version reconciles with a full snapshot then resumes deltas',async()=>{
 const h=setup();await h.api.getCanvas('test');
 h.doc.nodes.push({id:'delivered',text:'result'});h.doc.task_result_version=1;
 let p=h.payload();p.nodes[0].x=17;await h.api.saveCanvas('test',p);
 assert.ok(h.calls[0].nodes);assert.equal(h.calls[0].graph_delta,undefined);
 p=h.payload();p.nodes=p.nodes.filter(n=>n.id!=='delivered');await h.api.saveCanvas('test',p);
 assert.deepEqual(h.calls[1].graph_delta.delete,['delivered']);assert.equal(h.calls[1].graph_delta.base_task_result_version,1);
 assert.equal(h.doc.nodes.some(n=>n.id==='delivered'),false);
});

test('delivery race retries one frozen full snapshot through the lease; ordinary conflicts never retry',async()=>{
 const Lease=require('../static/js/canvas-edit-lease.js');
 for(const outcome of ['recover','full-conflict','lease-conflict','epoch-change']){
  let record={id:'test',revision:1,updated_at:10,title:'Test',nodes:Array.from({length:40},(_,i)=>({id:'n'+i,text:'x'.repeat(1000)})),connections:[],task_result_version:0};
  const calls=[];let payload;
  const grant={canvas_id:'test',revision:1,generation:1,holder:{is_self:true},server_time:'2026-10-17T00:00:00Z',expires_at:'2026-10-17T00:01:00Z',edit_token:'test-private'};
  let lease;
  const transport=async(path,init={})=>{
   if(path.endsWith('/acquire'))return new Response(JSON.stringify(grant));
   if(init.method==='PUT'){
    const body=JSON.parse(init.body);calls.push(body);
    assert.equal(new Headers(init.headers).get('X-Canvas-Edit-Token'),'test-private');
    if(path.endsWith('/delta')){
     payload.nodes[0].text='later edit';
     if(outcome==='epoch-change')lease.pause('taken over');
     return new Response(JSON.stringify({detail:{code:outcome==='lease-conflict'?'canvas_revision_conflict':'canvas_delta_delivery_changed'}}),{status:409});
    }
    if(outcome==='full-conflict')return new Response(JSON.stringify({detail:{code:'canvas_revision_conflict'}}),{status:409});
    record={...record,...body,revision:2,updated_at:11};
   }
   return new Response(JSON.stringify({canvas:record,save_protocol:'graph-delta-v2'}));
  };
  lease=new Lease({id:'test',fetch:transport,now:()=>0});
  const window={CanvasSession:{enabled:true,context:{member:{id:'m'},workspace:{id:'w'}}},MemberCanvasEdit:{active:{lease},send:(path,init)=>init.method==='PUT'?lease.write(path,init,transport):transport(path,init)}};
  vm.runInNewContext(source,{window,fetch:transport,Response});
  await lease.start(async()=>(await window.CanvasApi.getCanvas('test')).canvas);
  payload={...clone(record),base_updated_at:10};payload.nodes[0].text='submitted edit';
  if(outcome==='epoch-change')await assert.rejects(window.CanvasApi.saveCanvas('test',payload));
  else {
   const result=await window.CanvasApi.saveCanvas('test',payload);
   assert.equal(result.status,outcome==='recover'?200:409);
  }
  assert.equal(calls.length,['recover','full-conflict'].includes(outcome)?2:1);
  if(calls.length===2){assert.equal(calls[1].nodes[0].text,'submitted edit');assert.equal(calls[1].base_updated_at,10);}
  assert.equal(lease.canEdit,outcome==='recover');
 }
});
