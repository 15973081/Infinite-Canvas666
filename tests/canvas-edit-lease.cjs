const test = require('node:test');
const assert = require('node:assert/strict');
const Lease = require('../static/js/canvas-edit-lease.js');
const json = (data, status=200) => new Response(JSON.stringify(data), {status,headers:{'Content-Type':'application/json'}});
const publicLease = (extra={}) => ({canvas_id:'a', generation:1, revision:3,holder:{id:'m',is_self:true,display_name:'甲'},
    server_time:'2026-09-14T00:00:00Z',expires_at:'2026-09-14T00:01:00Z',heartbeat_seconds:10,...extra});
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
