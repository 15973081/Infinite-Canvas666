const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');

for(const kind of ['smart','classic'])test(kind+': editor sends only changed nodes after protocol negotiation',async t=>{
 const {page,record,errors}=await fixture(t,kind,true);
 await page.evaluate(()=>Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}}));
 const writes=[];
 await page.route(/\/api\/canvases\/canvas-test(?:\/delta)?$/,async route=>{
  const request=route.request();
  if(request.method()==='PUT'){
   const body=request.postDataJSON();writes.push(body);
   if(body.graph_delta){
    assert.equal(body.graph_delta.base_updated_at,record.updated_at);
    assert.equal(body.graph_delta.base_revision,record.revision);
    const map=new Map(record.nodes.map(node=>[node.id,node]));
    for(const id of body.graph_delta.delete)map.delete(id);
    for(const node of [...body.graph_delta.create,...body.graph_delta.update])map.set(node.id,node);
    record.nodes=body.graph_delta.node_order?body.graph_delta.node_order.map(id=>map.get(id)):[...map.values()];
   }else Object.assign(record,body);
   record.updated_at++;record.revision++;
  }
  return route.fulfill({json:{canvas:record,save_protocol:'graph-delta-v1'}});
 });
 await page.evaluate(async()=>{
  nodes=Array.from({length:40},(_,i)=>({id:'node-'+i,type:'text',x:i*10,y:0,width:200,height:150,text:'content '.repeat(150)}));
  scheduleSave();await MemberCanvasEdit.options.flush();
 });
 assert.equal(writes.length,1);assert.equal(record.nodes.length,40);
 await page.evaluate(async()=>{nodes[3].x=1234;scheduleSave();await MemberCanvasEdit.options.flush();});
 assert.equal(writes.length,2);assert.equal(writes[1].nodes,undefined);
 assert.equal(writes[1].graph_delta.update.length,1);assert.equal(writes[1].graph_delta.update[0].id,'node-3');
 assert.equal(record.nodes.find(node=>node.id==='node-3').x,1234);
 assert.ok(JSON.stringify(writes[1]).length<JSON.stringify(writes[0]).length/10);
 await page.evaluate(async()=>{scheduleSave();await MemberCanvasEdit.options.flush();});
 assert.equal(writes.length,2,'same content does not create another version');
 assert.deepEqual(errors,[]);
});
