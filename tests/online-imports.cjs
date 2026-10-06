const test=require('node:test'),assert=require('node:assert/strict');
const {itemsFor,mergeCanvas,createClient}=require('../static/js/online-imports.js');
const Lease=require('../static/js/canvas-edit-lease.js');
const result={timestamp:123,prompt:'城市夜景 <test>',images:['/assets/a.png','/assets/b.png','/assets/a.png']};
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(options={}){
 const session={enabled:true,paused:false,context:{member:{id:'m'},workspace:{id:'w',permissions:['canvas.read','canvas.create','canvas.edit','asset.manage']}}};
 const document={id:'existing',kind:options.kind||'classic',title:'existing',revision:3,nodes:[{id:'original',type:'prompt',x:0,y:0,text:'keep'}],connections:[{id:'edge',from:'original',to:'other'}],viewport:{x:-20,y:10,scale:.8},settings:{size:'1K'},cover:{mode:'node',node_id:'original'},logs:['keep'],task_result_version:4};
 const records=new Map([['existing',document]]),calls=[];
 const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 let next=0;
 async function transport(url,init={}){
  const method=init.method||'GET',body=init.body?JSON.parse(init.body):{};calls.push({url,method,body,headers:init.headers});
  if(options.afterRequest)await options.afterRequest({url,method,session});
  if(url==='/api/asset-library/items/batch')return response({items:body.items.slice(0,options.partial??body.items.length).map((item,i)=>({...item,id:'asset-'+i}))});
  if(url==='/api/canvases'&&method==='POST'){
   const canvas={...clone(document),...body,id:'new-'+(++next),nodes:[],connections:[],revision:1,viewport:{x:0,y:0,scale:1}};records.set(canvas.id,canvas);return response({canvas});
  }
  const id=url.split('/')[3],canvas=records.get(id);
  if(url.endsWith('/acquire')){
   if(options.locked)return response({detail:{code:'canvas_locked'}},409);
   return response({edit_token:'private',generation:1,revision:canvas.revision,holder:{is_self:true},server_time:new Date().toISOString(),expires_at:new Date(Date.now()+60000).toISOString()});
  }
  if(url.endsWith('/release')){if(options.releaseFailure)throw new Error('offline');return response({released:true,revision:canvas.revision});}
  if(method==='PUT'){
   const headers=new Headers(init.headers);assert.equal(headers.get('X-Canvas-Edit-Token'),'private');assert.equal(Number(headers.get('X-Canvas-Revision')),canvas.revision);assert.equal(body.base_revision,canvas.revision);
   if(options.writeFailure)return response({detail:{code:'canvas_revision_conflict'}},409);
   Object.assign(canvas,body,{revision:canvas.revision+1});return response({canvas});
  }
  return response({canvas});
 }
 return {session,records,calls,client:createClient({session,transport,Lease})};
}
for(const kind of ['classic','smart'])test(kind+' imports all images and optional prompt without changing the existing graph',()=>{
 const original=fixture({kind}).records.get('existing'),before=clone(original);
 const merged=mergeCanvas(original,result);
 assert.deepEqual(original,before);assert.equal(merged.added,3);
 for(const key of ['connections','viewport','settings','cover','logs','task_result_version'])assert.deepEqual(merged.document[key],before[key]);
 assert.equal(merged.document.nodes[0].id,'original');
 const media=merged.document.nodes.filter(n=>n.type===(kind==='smart'?'smart-image':'image'));
 assert.equal(media.length,2);assert.deepEqual(media.map(n=>kind==='smart'?n.images[0].url:n.url),result.images.slice(0,2));
 assert.equal(merged.document.nodes.at(-1).text,result.prompt);
 assert.ok(merged.document.nodes.at(-1).x>320,'prompt does not overlap pre-existing nodes');
 assert.equal(mergeCanvas(merged.document,result).added,0,'same source is idempotent');
 assert.equal(mergeCanvas(original,result,false).added,2);
});
test('media normalization discards empty and repeated URLs',()=>assert.equal(itemsFor(result).length,2));
for(const kind of ['classic','smart'])test('new '+kind+' canvas is created once, saved with a lease, and released',async()=>{
 const f=fixture(),target={kind};const receipt=await f.client.toCanvas(result,target);
 assert.equal(receipt.canvas.kind,kind);assert.equal(receipt.canvas.nodes.length,3);assert.equal(receipt.notice,'');assert.equal(target.id,receipt.canvas.id);
 const repeat=await f.client.toCanvas(result,target);assert.equal(repeat.added,0);
 assert.equal(f.calls.filter(c=>c.url==='/api/canvases'&&c.method==='POST').length,1);
 assert.equal(f.calls.filter(c=>c.method==='PUT').length,1);
 assert.equal(f.calls.filter(c=>c.url.endsWith('/release')).length,2);
 assert.ok(receipt.canvas.nodes.every(n=>n.x>=0),'new nodes are inside the initial viewport');
});
test('existing canvas gets appended nodes without creating a new document',async()=>{
 const f=fixture();await f.client.toCanvas(result,{id:'existing'});
 assert.equal(f.calls.filter(c=>c.url==='/api/canvases').length,0);
 assert.equal(f.records.get('existing').nodes.length,4);
});
test('busy canvas is never overwritten or forcibly acquired',async()=>{
 const f=fixture({locked:true});await assert.rejects(f.client.toCanvas(result,{id:'existing'}),/已有成员/);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].url.endsWith('/acquire'),true);assert.deepEqual(f.calls[0].body,{});
});
test('rejected save is not reported as successful',async()=>{
 const f=fixture({writeFailure:true});await assert.rejects(f.client.toCanvas(result,{id:'existing'}));assert.equal(f.records.get('existing').nodes.length,1);
});
test('release failure preserves the successful save acknowledgement',async()=>{
 const f=fixture({releaseFailure:true});const receipt=await f.client.toCanvas(result,{id:'existing'});assert.ok(receipt.notice.includes('已保存'));assert.equal(receipt.canvas.nodes.length,4);
});
test('workspace switch aborts import before writing into the wrong space',async()=>{
 const f=fixture({afterRequest:({url,session})=>{if(url==='/api/canvases/existing')session.context.workspace.id='other';}});
 await assert.rejects(f.client.toCanvas(result,{id:'existing'}),/工作空间/);assert.equal(f.calls.filter(c=>c.method==='PUT').length,0);
});
for(const mode of ['draining','read_only','offline','recovering'])test('maintenance '+mode+' blocks import before creation',async()=>{
 const f=fixture();f.session.maintenance={mode};await assert.rejects(f.client.toCanvas(result,{kind:'classic'}),/维护/);assert.equal(f.calls.length,0);
});
test('viewer cannot write canvas or library data',async()=>{
 const f=fixture();f.session.context.workspace.permissions=['canvas.read','asset.read'];
 await assert.rejects(f.client.toCanvas(result,{id:'existing'}),/权限/);await assert.rejects(f.client.toLibrary(result,{library_id:'lib',category_id:'cat'}),/权限/);assert.equal(f.calls.length,0);
});
test('batch library import coalesces simultaneous clicks and acknowledged repeats',async()=>{
 const f=fixture(),target={library_id:'lib',category_id:'cat'};
 const receipts=await Promise.all([f.client.toLibrary(result,target),f.client.toLibrary(result,target)]);
 assert.equal(receipts[0].count,2);await f.client.toLibrary(result,target);assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].body.items.length,2);assert.equal(f.calls[0].body.category_id,'cat');
});
test('partial library acknowledgement does not retry successful items',async()=>{
 const f=fixture({partial:1}),target={library_id:'lib',category_id:'cat'};
 const receipt=await f.client.toLibrary(result,target);assert.equal(receipt.count,1);assert.match(receipt.notice,/1\/2/);
 await f.client.toLibrary(result,target);assert.equal(f.calls.length,1);
});
test('unavailable library originals show an actionable failure',async()=>{
 const f=fixture({partial:0});await assert.rejects(f.client.toLibrary(result,{}),/原图/);
});
for(const kind of ['classic','smart'])test(kind+' multi-selection preserves individual prompts and single-import identities',async()=>{
 const other={timestamp:456,prompt:'另一条作品',images:['/assets/b.png','/assets/c.png']},f=fixture({kind});
 const receipt=await f.client.toCanvas([result,other],{id:'existing'});
 assert.equal(receipt.added,6);assert.deepEqual(receipt.canvas.nodes.filter(n=>n.type.endsWith('prompt')).map(n=>n.text),['keep',result.prompt,other.prompt]);
 assert.equal(mergeCanvas(receipt.canvas,result).added,0);
 assert.equal(mergeCanvas(receipt.canvas,[other,result]).added,0);
 assert.equal(f.calls.filter(c=>c.method==='PUT').length,1,'a multi-selection is saved in one lease-protected write');
 const library=await f.client.toLibrary([result,other],{library_id:'lib',category_id:'cat'});assert.equal(library.count,3,'shared URLs are deduplicated for the library');
});
test('large library selections respect the existing 200-item endpoint limit',async()=>{
 const f=fixture(),data=Array.from({length:205},(_,i)=>({timestamp:i,images:['/assets/'+i+'.png']}));
 const receipt=await f.client.toLibrary(data,{});assert.equal(receipt.count,205);assert.deepEqual(f.calls.map(c=>c.body.items.length),[200,5]);
});
test('later chunk failure retains partial acknowledgement and avoids duplicate retry',async()=>{
 let chunks=0;const f=fixture({afterRequest:({url})=>{if(url.endsWith('/items/batch')&&++chunks===2)throw new Error('网络中断');}});
 const data={images:Array.from({length:205},(_,i)=>'/assets/'+i+'.png')};
 const receipt=await f.client.toLibrary(data,{});assert.equal(receipt.count,200);assert.match(receipt.notice,/200\/205.*网络中断/);
 await f.client.toLibrary(data,{});assert.equal(chunks,2);
});
