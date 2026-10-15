/* JSON-lines transport to Python's real ASGI TestClients, not a mocked server. */
const assert=require('node:assert/strict');
const readline=require('node:readline');
const Lease=require('../../static/js/canvas-edit-lease.js');
const lines=readline.createInterface({input:process.stdin});
const requests=new Map();let sequence=0;
lines.on('line',line=>{const message=JSON.parse(line);const resolve=requests.get(message.id);requests.delete(message.id);resolve(message);});
setTimeout(()=>{console.error('HTTP bridge timed out');process.exit(2);},25000).unref();
const transport=actor=>async(path,init={})=>{
    const id=++sequence;
    const answer=new Promise(resolve=>requests.set(id,resolve));
    process.stdout.write(JSON.stringify({id,actor,path,method:init.method || 'GET',headers:Object.fromEntries(new Headers(init.headers)),body:init.body})+'\n');
    const result=await answer;
    return new Response(JSON.stringify(result.body),{status:result.status});
};
(async()=>{
    const id=process.argv[2],path='/api/canvases/'+id;
    const ownerFetch=transport('owner'),recipientFetch=transport('recipient');
    const owner=new Lease({id,fetch:ownerFetch}),recipient=new Lease({id,fetch:recipientFetch});
    const reload=fetch=>async()=>{const response=await fetch(path);assert.equal(response.ok,true);return (await response.json()).canvas;};
    const write=(client,title)=>client.write(path,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,nodes:[{id:'prompt',type:'prompt',prompt:title}],connections:[]})});
    if(process.argv[3]==='startup-recovery'){
        await assert.rejects(owner.start(async()=>{throw Error('load failed');}),/load failed/);
        assert.equal(owner.canEdit,false);
        await recipient.start(reload(recipientFetch));assert.equal(recipient.canEdit,true);
        assert.equal(await recipient.finish(async()=>true),true);
        await owner.start(reload(ownerFetch));await recipient.requestTransfer();
        await owner.refreshTransfers(reload(ownerFetch));
        assert.equal(await owner.resolveTransfer(recipient.pending.id,{approve:true,confirm:true},async()=>true),true);
        await assert.rejects(recipient.refreshTransfers(async()=>{throw Error('handoff load failed');}),/handoff load failed/);
        assert.equal(recipient.canEdit,false);
        await assert.rejects(owner.start(async()=>{
            // A new holder can take over while the old page is still loading.
            // The old page's cleanup must never release this newer grant.
            await recipient.start(reload(recipientFetch),{takeover:'force',expected_generation:owner.generation,confirm:true,reason:'startup recovery acceptance'});
            throw Error('superseded load');
        }),/superseded load/);
        await recipient.renew();assert.equal(recipient.canEdit,true);assert.equal(owner.canEdit,false);
        assert.equal(await recipient.finish(async()=>true),true);
        process.stdout.write(JSON.stringify({done:true,revision:recipient.revision})+'\n');lines.close();process.exit(0);
    }
    await owner.start(reload(ownerFetch));
    await recipient.requestTransfer();
    await owner.refreshTransfers(reload(ownerFetch));
    const target=owner.requests.find(row=>row.id===recipient.pending.id);assert.ok(target);
    assert.equal(await owner.resolveTransfer(target.id,{approve:true,confirm:true},async()=>{
        const saved=await write(owner,'saved for recipient');return saved.ok;
    }),true);
    assert.equal(owner.canSave,false);
    await recipient.refreshTransfers(reload(recipientFetch));
    assert.equal(recipient.canSave,true);
    assert.equal((await reload(recipientFetch)()).title,'saved for recipient');
    assert.equal((await write(recipient,'recipient saved')).ok,true);
    await owner.requestTransfer();
    await recipient.refreshTransfers(reload(recipientFetch));
    assert.equal(await recipient.resolveTransfer(owner.pending.id,{approve:false},()=>{throw Error('rejection must not save');}),true);
    await owner.refreshTransfers(reload(ownerFetch));assert.equal(owner.pending,null);assert.match(owner.message,/拒绝/);
    await owner.start(reload(ownerFetch),{takeover:'force',expected_generation:owner.status.generation,confirm:true,reason:'client acceptance takeover'});
    await assert.rejects(recipient.renew());assert.equal(recipient.canSave,false);
    assert.equal(await owner.finish(async()=>{const saved=await write(owner,'forced final');return saved.ok;}),true);
    assert.equal(owner.state,'view');
    process.stdout.write(JSON.stringify({done:true,revision:owner.revision})+'\n');lines.close();process.exit(0);
})().catch(error=>{console.error(error.stack);process.exit(1);});
