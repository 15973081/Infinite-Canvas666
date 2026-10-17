const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('static/js/canvas-api.js','utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
function setup(protocol='graph-delta-v1'){
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
 const old=setup(null);await old.api.getCanvas('test');let p=old.payload();p.nodes[0].x=99;await old.api.saveCanvas('test',p);assert.ok(old.calls[0].nodes);
 const h=setup();await h.api.getCanvas('test');h.window.CanvasSession.context.workspace.id='other';p=h.payload();p.nodes[0].x=99;await h.api.saveCanvas('test',p);assert.ok(h.calls[0].nodes);
 h.fail();p=h.payload();p.nodes[0].x=101;assert.equal((await h.api.saveCanvas('test',p)).status,409);
 await h.api.saveCanvas('test',p);assert.equal(h.calls.length,3);
});
