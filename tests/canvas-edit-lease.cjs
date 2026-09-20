const test = require('node:test');
const assert = require('node:assert/strict');
const Lease = require('../static/js/canvas-edit-lease.js');
const json = (data, status=200) => new Response(JSON.stringify(data), {status,headers:{'Content-Type':'application/json'}});
const publicLease = (extra={}) => ({canvas_id:'a', generation:1, revision:3,holder:{id:'m',is_self:true,display_name:'甲'},
    server_time:'2026-09-14T00:00:00Z',expires_at:'2026-09-14T00:01:00Z',heartbeat_seconds:10,...extra});

test('model validation rejection preserves editing; permission and lease failures still pause', async () => {
    for(const code of ['model_not_available','model_resolution_not_allowed','permission_denied','workspace_forbidden','canvas_lease_lost']){
        const f=fixture(path=>path.endsWith('/acquire') ? json(publicLease({edit_token:'private'})) : json({detail:{code,message:'模型规格不允许'}},403));
        await f.start();
        const response=await f.lease.write('/api/canvas-image-tasks',{method:'POST',body:'{}'});
        assert.equal(response.status,403);
        assert.equal(f.lease.canEdit,code.startsWith('model_'));
        assert.equal(f.lease.revision,3);
    }
    const f=fixture(path=>path.endsWith('/acquire') ? json(publicLease({edit_token:'private'})) : json({detail:{code:'model_not_available'}},403));
    await f.start();await f.lease.write('/api/canvases/a',{method:'PUT',body:'{}'});
    assert.equal(f.lease.canEdit,false);
});
function fixture(handler) {
    let time = 0; const calls = [];
    const lease = new Lease({id:'a',now:() => time,fetch:async (path,init) => {
        calls.push([path,init]); return handler(path,init);
    }});
    return {lease,calls,setTime:value => {time=value;},start:() => lease.start(async () => ({revision:3}))};
}
test('public same-account holder cannot authorize another page', async () => {
    const f = fixture(() => json(publicLease()));
    await f.lease.refresh();
    assert.equal(f.lease.canSave,false);
    assert.throws(() => f.lease.headers(),/开始编辑/);
});
test('start reloads the exact revision; lease expires on monotonic time', async () => {
    const f = fixture(() => json(publicLease({edit_token:'private'})));
    await f.start(); assert.equal(f.lease.canEdit,true);
    assert.equal(f.lease.headers()['X-Canvas-Revision'],'3');
    f.setTime(60000); assert.equal(f.lease.canSave,false); assert.equal(f.lease.token,null);
});
test('slow acquisition and a changed reload revision cannot grant editing', async () => {
    const f = fixture(() => { f.setTime(61000); return json(publicLease({edit_token:'private'})); });
    await assert.rejects(f.start()); assert.equal(f.lease.canSave,false);
    const g = fixture(() => json(publicLease({edit_token:'private'})));
    await assert.rejects(g.lease.start(async () => ({revision:4})),/版本/);
    assert.equal(g.lease.canSave,false);
});
test('renewal extends time but never replaces the acknowledged document revision', async () => {
    const f = fixture(path => json(publicLease(path.endsWith('/acquire') ? {edit_token:'private'} : {revision:9})));
    await f.start(); await f.lease.renew();
    assert.equal(f.lease.revision,3);
});
test('writes serialize revision proofs, and release waits for acknowledged saves', async () => {
    let revision=3;
    const f = fixture((path,init) => {
        if(path.endsWith('/acquire')) return json(publicLease({edit_token:'private'}));
        assert.equal(new Headers(init.headers).get('X-Canvas-Revision'),String(revision));
        if(path.endsWith('/release')) return json({released:true,revision,generation:1});
        assert.equal(JSON.parse(init.body).base_revision,revision);
        return json({canvas:{revision:++revision}});
    });
    await f.start();
    await Promise.all([1,2].map(() => f.lease.write('/api/canvases/a',{method:'PUT',body:'{}'})));
    assert.equal(f.lease.revision,5);
    assert.equal(await f.lease.finish(async () => {
        assert.equal(f.lease.canEdit,false); assert.equal(f.lease.canSave,true);
        await f.lease.write('/api/canvases/a',{method:'PUT',body:'{}'}); return true;
    }),true);
    assert.equal(f.calls.at(-1)[0],'/api/canvases/a/edit-lease/release');
    assert.equal(f.lease.canSave,false);
});
test('failed flush keeps the lease and does not release unsaved work', async () => {
    const f=fixture(() => json(publicLease({edit_token:'private'}))); await f.start();
    assert.equal(await f.lease.finish(async () => false),false);
    assert.equal(f.calls.length,1); assert.equal(f.lease.canEdit,true);
});
test('conflict and uncertain writes stop retries; unknown save revision is not acknowledged', async () => {
    for (const reply of [() => json({detail:{code:'canvas_revision_conflict'}},409), () => {throw new Error('offline');}, () => json({canvas:{}})]) {
        const f=fixture(path => path.endsWith('/acquire') ? json(publicLease({edit_token:'private'})) : reply());
        await f.start(); await f.lease.write('/api/canvases/a',{method:'PUT',body:'{}'}).catch(() => {});
        assert.equal(f.lease.canSave,false); assert.equal(f.lease.revision,3);
        await assert.rejects(f.lease.write('/api/canvases/a',{method:'PUT',body:'{}'}));
        assert.equal(f.calls.length,2);
    }
});
test('paused page ignores late renewal and save acknowledgements', async () => {
    let resolve;
    const f=fixture(path => path.endsWith('/acquire') ? json(publicLease({edit_token:'private'})) : new Promise(r => {resolve=r;}));
    await f.start(); const pending=f.lease.renew(); await new Promise(setImmediate);
    f.lease.pause('account changed'); resolve(json(publicLease())); await pending;
    assert.equal(f.lease.canSave,false); assert.equal(f.lease.state,'paused');
});
test('late successful save after revocation cannot clear the caller draft', async () => {
    let resolve;
    const f=fixture(path => path.endsWith('/acquire') ? json(publicLease({edit_token:'private'})) : new Promise(r => {resolve=r;}));
    await f.start(); const pending=f.lease.write('/api/canvases/a',{method:'PUT',body:'{}'}); await new Promise(setImmediate);
    f.lease.pause('revoked'); resolve(json({canvas:{revision:4}}));
    await assert.rejects(pending,/资格已改变/); assert.equal(f.lease.revision,3);
});
test('maintenance drain permits final save but blocks new edits and other mutations', async () => {
    const f=fixture(path => path.endsWith('/acquire') ? json(publicLease({edit_token:'private'})) : json({canvas:{revision:4}}));
    await f.start(); f.lease.setMaintenance('draining');
    assert.equal(f.lease.canEdit,false); assert.equal(f.lease.canSave,true);
    await assert.rejects(f.lease.write('/api/canvases/a/meta',{method:'POST',body:'{}'}));
    await f.lease.write('/api/canvases/a',{method:'PUT',body:'{}'});
    f.lease.setMaintenance('read_only'); assert.equal(f.lease.canSave,false);
    f.lease.setMaintenance('normal'); assert.equal(f.lease.canSave,false);
});
test('approved transfer requires the requesting page token, a fresh proof check and matching reload',async()=>{
    let approved=false;
    const pending={id:'transfer-1',generation:1,status:'pending'};
    const f=fixture((path,init)=>{
        if(path.endsWith('/transfers') && init.method==='POST')return json({...pending,edit_token:'recipient-only'});
        if(path.endsWith('/transfers'))return json({requests:[{...pending,status:approved?'approved':'pending'}],lease:publicLease({generation:approved?2:1,holder:{is_self:approved}})});
        assert.equal(path.endsWith('/renew'),true);
        assert.equal(init.headers['X-Canvas-Edit-Token'],'recipient-only');
        assert.equal(init.headers['X-Canvas-Generation'],'2');
        return json(publicLease({generation:2,revision:7}));
    });
    await f.lease.requestTransfer();await f.lease.requestTransfer();assert.equal(f.calls.length,1);
    await f.lease.refreshTransfers(()=>{throw Error('must not reload pending');});assert.equal(f.lease.canSave,false);
    approved=true;let loaded=0;
    await f.lease.refreshTransfers(async()=>{loaded++;assert.equal(f.lease.canSave,false);return {revision:7};});
    assert.equal(loaded,1);assert.equal(f.lease.canSave,true);assert.equal(f.lease.revision,7);assert.equal(f.lease.pending,null);
    const other=fixture(()=>json({requests:[{...pending,status:'approved'}],lease:publicLease({generation:2})}));
    await other.lease.refreshTransfers(()=>{throw Error('other page cannot reload into editing');});
    assert.equal(other.lease.canSave,false);assert.equal(other.calls.length,1);
});
test('rejected or expired requests clear private pending proof without acquiring',async()=>{
    for(const result of ['rejected','expired']) {
        const f=fixture((path,init)=>init.method==='POST' ? json({id:'t',generation:1,edit_token:'private'})
            :json({requests:[{id:'t',status:result}],lease:publicLease({holder:{is_self:false}})}));
        await f.lease.requestTransfer();await f.lease.refreshTransfers(()=>{throw Error('no reload');});
        assert.equal(f.lease.pending,null);assert.equal(f.lease.state,'view');assert.equal(f.lease.canSave,false);
    }
});
test('another takeover or recipient reload conflict never enables a stale transfer',async()=>{
    for(const generation of [2,3]) {
        const f=fixture((path,init)=>path.endsWith('/renew') ? json(publicLease({generation:2,revision:9}))
            :init.method==='POST' ? json({id:'t',generation:1,edit_token:'private'})
            :json({requests:[{id:'t',status:'approved'}],lease:publicLease({generation})}));
        await f.lease.requestTransfer();await f.lease.refreshTransfers(async()=>({revision:8})).catch(()=>{});
        assert.equal(f.lease.canSave,false);assert.equal(f.lease.state,'paused');assert.equal(f.lease.pending,null);
    }
});
test('approval saves first and transfers atomically, never issuing a release or acquisition',async()=>{
    let revision=3;
    const f=fixture((path,init)=>{
        if(path.endsWith('/acquire'))return json(publicLease({edit_token:'holder'}));
        if(init.method==='PUT')return json({canvas:{revision:++revision}});
        assert.equal(path.endsWith('/transfers/target'),true);
        assert.equal(new Headers(init.headers).get('X-Canvas-Revision'),'4');
        assert.deepEqual(JSON.parse(init.body),{approve:true,confirm:true});
        return json({status:'approved',lease:publicLease({generation:2,revision,holder:{is_self:false,display_name:'乙'}})});
    });
    await f.start();
    await assert.rejects(f.lease.resolveTransfer('target',{approve:true},async()=>true),/确认/);
    assert.equal(await f.lease.resolveTransfer('target',{approve:true,confirm:true},async()=>{
        assert.equal(f.lease.canEdit,false);
        await f.lease.write('/api/canvases/a',{method:'PUT',body:'{}'});return true;
    }),true);
    assert.equal(f.lease.canSave,false);assert.equal(f.lease.state,'view');assert.match(f.lease.message,/乙/);
    assert.equal(f.calls.length,3);
});
test('failed final save never sends approval, while rejection does not flush',async()=>{
    const f=fixture(path=>path.endsWith('/acquire')?json(publicLease({edit_token:'holder'})):json({status:'rejected',lease:publicLease()}));
    await f.start();assert.equal(await f.lease.resolveTransfer('t',{approve:true,confirm:true},async()=>false),false);
    assert.equal(f.calls.length,1);assert.equal(f.lease.canEdit,true);
    assert.equal(await f.lease.resolveTransfer('t',{approve:false},async()=>{throw Error('reject must not flush');}),true);
    assert.equal(f.lease.canEdit,true);
});
test('expired approval preserves holder editing; uncertain approval stops further writes',async()=>{
    for(const uncertain of [false,true]) {
        const f=fixture(path=>{
            if(path.endsWith('/acquire'))return json(publicLease({edit_token:'holder'}));
            if(uncertain)throw Error('response lost');
            return json({detail:{code:'canvas_transfer_expired'}},409);
        });
        await f.start();await assert.rejects(f.lease.resolveTransfer('t',{approve:true,confirm:true},async()=>true));
        assert.equal(f.lease.canSave,!uncertain);assert.equal(f.lease.finishing,false);
    }
});
test('pause during pending request invalidates its late private response',async()=>{
    let resolve;const f=fixture(()=>new Promise(r=>{resolve=r;}));
    const requested=f.lease.requestTransfer();await new Promise(setImmediate);f.lease.pause('signed out');
    resolve(json({id:'t',generation:1,edit_token:'late-secret'}));await requested;
    assert.equal(f.lease.pending,null);assert.equal(f.lease.state,'paused');
});
test('closing a canvas prevents queued or delayed dialogs from reacquiring it',async()=>{
    const f=fixture(()=>{throw Error('closed page must not send');});
    const start=f.start();f.lease.dispose();
    await assert.rejects(start,/关闭/);await assert.rejects(f.lease.requestTransfer(),/关闭/);
    assert.equal(f.calls.length,0);
});

test('draft restore revalidates the private proof and keeps the acknowledged revision without writing', async () => {
    const f=fixture(() => json(publicLease({edit_token:'private'})));
    let applied=false;
    await assert.rejects(f.lease.restoreDraft(3,()=>{applied=true;}),/开始编辑/);
    await f.start();
    await f.lease.restoreDraft(3,()=>{assert.equal(f.lease.canEdit,false);applied=true;});
    assert.equal(applied,true);assert.equal(f.lease.revision,3);assert.equal(f.lease.canEdit,true);
    assert.equal(f.calls.at(-1)[0],'/api/canvases/a/edit-lease/renew');
    assert.equal(f.calls.at(-1)[1].headers['X-Canvas-Edit-Token'],'private');
    assert.equal(f.calls.some(([,init])=>init.method==='PUT'),false);
});
test('old or unknown draft revisions cannot overwrite the current document', async () => {
    const f=fixture(() => json(publicLease({edit_token:'private'})));
    await f.start();const count=f.calls.length;
    for(const revision of [null,2,4,'3']) await assert.rejects(f.lease.restoreDraft(revision,()=>assert.fail('applied')),/版本/);
    assert.equal(f.calls.length,count);assert.equal(f.lease.canEdit,true);
});
test('draft restore rejects stale server versions, revoked proofs and maintenance during verification', async () => {
    for(const outcome of ['revision','revoked','maintenance','paused']) {
        const f=fixture(path => {
            if(path.endsWith('/acquire')) return json(publicLease({edit_token:'private'}));
            if(outcome==='revoked') return json({detail:{code:'canvas_lease_lost'}},409);
            if(outcome==='maintenance') f.lease.setMaintenance('draining');
            if(outcome==='paused') f.lease.pause('offline');
            return json(publicLease(outcome==='revision' ? {revision:4} : {}));
        });
        await f.start();await assert.rejects(f.lease.restoreDraft(3,()=>assert.fail('applied')));
        assert.equal(f.lease.canEdit,false);assert.equal(f.lease.revision,3);
    }
});
test('a save already in the queue completes before checking a draft base revision', async () => {
    const f=fixture(path => path.endsWith('/acquire') ? json(publicLease({edit_token:'private'})) : json({canvas:{revision:4}}));
    await f.start();
    const save=f.lease.write('/api/canvases/a',{method:'PUT',body:'{}'});
    const restoring=f.lease.restoreDraft(3,()=>assert.fail('applied'));
    await save;await assert.rejects(restoring,/版本/);assert.equal(f.lease.revision,4);
});

test('joining saved results freezes edits, flushes first and adopts only acknowledged revision',async()=>{
 let revision=3,flushed=false;
 const f=fixture((path,init)=>{
  if(path.endsWith('/acquire'))return json(publicLease({edit_token:'private'}));
  assert.equal(flushed,true);assert.equal(f.lease.canEdit,false);assert.equal(new Headers(init.headers).get('X-Canvas-Revision'),'3');
  return json({canvas:{id:'a',revision:++revision}});
 });await f.start();
 await f.lease.joinResult('task',async()=>{flushed=true;return true;},async()=>({revision}));
 assert.equal(f.lease.revision,4);assert.equal(f.lease.canEdit,true);
});
test('result join lost response or changed page never claims success or reloads another graph',async()=>{
 for(const changed of [false,true]){
  const f=fixture(path=>{if(path.endsWith('/acquire'))return json(publicLease({edit_token:'private'}));if(changed)f.lease.pause('changed');else throw new Error('network');return json({canvas:{id:'a',revision:4}});});
  await f.start();let reloaded=false;
  await assert.rejects(f.lease.joinResult('task',async()=>true,async()=>{reloaded=true;return {revision:4};}));
  assert.equal(reloaded,false);assert.equal(f.lease.canEdit,false);
 }
});
