// The Python integration fixture bridges these requests to the real ASGI app.
const readline=require('node:readline'),assert=require('node:assert/strict');
const {createClient,itemsFor}=require('../../static/js/online-imports.js'),Lease=require('../../static/js/canvas-edit-lease.js');
const input=readline.createInterface({input:process.stdin})[Symbol.asyncIterator]();let serial=0;
async function transport(path,init={}){
 const id=++serial;process.stdout.write(JSON.stringify({id,path,method:init.method||'GET',headers:Object.fromEntries(new Headers(init.headers)),body:init.body})+'\n');
 const next=await input.next(),reply=JSON.parse(next.value);assert.equal(reply.id,id);
 return new Response(JSON.stringify(reply.body),{status:reply.status,headers:{'Content-Type':'application/json'}});
}
(async()=>{
 const settings=JSON.parse(process.argv[2]);
 const session={enabled:true,paused:false,context:{member:{id:'test'},workspace:{id:'test',permissions:['canvas.read','canvas.create','canvas.edit','asset.manage']}}};
 const client=createClient({session,transport,Lease}),receipts=[];
 for(const kind of ['classic','smart'])receipts.push(await client.toCanvas(settings.data,{kind}));
 receipts.push(await client.toCanvas(settings.data,{id:settings.existing}));
 const repeat=await client.toCanvas(settings.data,{id:settings.existing});assert.equal(repeat.added,0);
 const library=await client.toLibrary(settings.data,settings.library);assert.equal(library.count,itemsFor(settings.data).length);
 await client.toLibrary(settings.data,settings.library);
 process.stdout.write(JSON.stringify({done:true,canvases:receipts.map(r=>r.canvas),count:library.count})+'\n');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{process.stdin.destroy();});
