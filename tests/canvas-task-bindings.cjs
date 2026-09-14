const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash,webcrypto}=require('node:crypto');
const api=require('../static/js/canvas-task-bindings.js');
const taskResults=require('../static/js/canvas-task-results.js');
const golden=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/task-input-bindings-v2.json'),'utf8'));
const hash=text=>createHash('sha256').update(text,'utf8').digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(options={}) {
    let doc=clone(golden.graphs[0].document),revision=2;
    const entry={memberId:'m',workspaceId:'w',lease:{epoch:1,generation:2,canEdit:true}};
    const win={CanvasSession:{enabled:true,context:{member:{id:'m'},workspace:{id:'w'}}},MemberCanvasEdit:{active:entry}};
    const identity=taskResults.guard([doc.nodes[1],doc.nodes[2]],()=>({canvas:'c',nodes:doc.nodes}),win);
    const op=api.operation({canvasId:'c',kind:'classic',sourceId:'s',targetId:'o',read:()=>doc,
        valid:identity.valid,flush:options.flush||(()=>Promise.resolve(true)),revision:()=>revision,crypto:options.crypto||webcrypto});
    return {op,win,get doc(){return doc;},replace(value){doc=value;},setRevision(value){revision=value;}};
}
async function submitted(f,count=2) {
    const target=await f.op.prepare();f.op.beginSubmission();
    const tasks=Array.from({length:count},(_,index)=>({id:'task-'+index,canvas_binding:{version:3,canvas_id:'c',canvas_kind:'classic',
        source_node_id:'s',target_node_id:'o',submitted_revision:target.base_revision,graph_sha256:target.input_sha256,
        request_sha256:String(index+1).repeat(64)}}));
    tasks.forEach(task=>f.op.remember({...task,task_id:task.id}));
    return tasks;
}
for(const vector of golden.values)test('v2 scalar golden: '+vector.name,()=>assert.equal(hash(api.canonical(vector.value)),vector.sha256));
for(const vector of golden.graphs)test('v2 graph golden: '+vector.name,async()=>{
    assert.equal(await api.graphFingerprint(vector.document,vector.source,vector.target,webcrypto),vector.sha256);
});
test('unsafe numbers, non-JSON values and unpaired surrogates cannot acquire a fingerprint',()=>{
    for(const value of [NaN,Infinity,-Infinity,9007199254740992,-9007199254740992,undefined,()=>{},'\ud800',{'\udfff':'bad'},new Date(),[undefined]]){
        assert.throws(()=>api.canonical(value));
    }
    assert.equal(api.canonical(-0),api.canonical(0));
    assert.equal(api.canonical(1),JSON.stringify(['number','3ff0000000000000']));
    assert.equal(new Set([null,false,0,'0',[],{}].map(api.canonical)).size,6);
});
test('layout, progress, unrelated nodes and node order do not change the graph',()=>{
    const doc=clone(golden.graphs[0].document),before=api.graphCanonical(doc,'s','o');
    doc.nodes[0].x=500;doc.nodes[1].running=true;doc.nodes[2]._pending=[{task:'t'}];
    doc.nodes.push({id:'other',text:'unrelated'});doc.nodes.reverse();doc.connections[0].id='new';
    assert.equal(api.graphCanonical(doc,'s','o'),before);
});
test('inputs, reference order, defaults and group members are bound',()=>{
    const original=golden.graphs[1].document,before=api.graphCanonical(original,'s','o');
    for(const edit of [d=>d.nodes[0].text='changed',d=>d.nodes[1].url='/new',d=>d.nodes[3].model='new',
        d=>d.nodes[4].images.push({url:'/new'}),d=>d.connections.reverse(),d=>d.settings={seed:42}]){
        const doc=clone(original);edit(doc);assert.notEqual(api.graphCanonical(doc,'s','o'),before);
    }
});
test('missing nodes, duplicate IDs and malformed groups fail closed',()=>{
    for(const edit of [d=>d.nodes.pop(),d=>d.nodes.push(d.nodes[0]),d=>d.nodes[2].items='invalid',d=>d.nodes[2].items=['missing']]){
        const doc=clone(golden.graphs[1].document);edit(doc);assert.throws(()=>api.graphCanonical(doc,'s','o'));
    }
});
test('preflight awaits saved revision and sends the common graph fingerprint',async()=>{
    const gate=deferred(),f=fixture({flush:()=>gate.promise});let ready=false;
    const preparing=f.op.prepare().then(value=>{ready=true;return value;});await Promise.resolve();assert.equal(ready,false);
    f.setRevision(3);gate.resolve(true);const target=await preparing;
    assert.equal(target.base_revision,3);assert.equal(target.input_sha256,await api.graphFingerprint(f.doc,'s','o',webcrypto));
    target.base_revision=99;f.op.beginSubmission(); // returned target cannot mutate private baseline
});
test('failed save cannot submit, and input changes during save latch the operation',async()=>{
    const failed=fixture({flush:async()=>false});await assert.rejects(failed.op.prepare(),/尚未保存/);
    assert.throws(()=>failed.op.beginSubmission(),e=>e.resultPending && !e.submitted);
    const gate=deferred(),f=fixture({flush:()=>gate.promise}),pending=f.op.prepare();
    f.doc.nodes[0].text='edited during save';gate.resolve(true);
    await assert.rejects(pending,e=>e.inputChanged && !e.submitted);
    f.doc.nodes[0].text=golden.graphs[0].document.nodes[0].text;
    assert.throws(()=>f.op.check(),e=>e.resultPending);
});
test('input or revision changes while crypto is pending cannot submit',async()=>{
    for(const change of [f=>f.doc.nodes[0].text='new input',f=>f.setRevision(3)]){
        const gate=deferred(),started=deferred();
        const crypto={subtle:{digest:async(...args)=>{started.resolve();await gate.promise;return webcrypto.subtle.digest(...args);}}};
        const f=fixture({crypto}),pending=f.op.prepare();await started.promise;change(f);gate.resolve();
        await assert.rejects(pending,e=>e.resultPending);assert.throws(()=>f.op.beginSubmission(),e=>e.resultPending);
    }
});
test('revision advancing between preflight and POST requires another confirmed save',async()=>{
    const f=fixture();await f.op.prepare();f.setRevision(3);assert.throws(()=>f.op.beginSubmission(),e=>e.resultPending);
});
test('normal save replacement and multiple own results keep the batch valid',async()=>{
    const f=fixture(),tasks=await submitted(f,3);
    // Classic save replaces its document wrapper but keeps the live nodes.
    f.replace({...f.doc,revision:4});f.setRevision(4);
    f.op.mutate(()=>{f.doc.nodes[2].history=[{url:'/previous'}];});
    for(const task of tasks){
        f.op.apply(task,()=>{f.doc.nodes[2].images.push({url:'/'+task.id});f.doc.nodes[1].generatedOutputs=['/'+task.id];});
        f.op.check();
    }
    assert.equal(f.doc.nodes[2].images.length,3);
});
test('user edit between batch results preserves the newer input and defers siblings',async()=>{
    const f=fixture(),tasks=await submitted(f);let writes=0;
    f.op.apply(tasks[0],()=>{f.doc.nodes[2].images.push({url:'/first'});writes++;});
    f.doc.nodes[0].text='keep this newer prompt';
    assert.throws(()=>f.op.apply(tasks[1],()=>writes++),e=>e.resultPending && e.submitted);
    assert.equal(writes,1);assert.equal(f.doc.nodes[0].text,'keep this newer prompt');assert.equal(f.doc.nodes[2].images.length,1);
});
test('lease, scope, and same-ID replacement invalidate result and failure mutations',async()=>{
    for(const change of [f=>f.win.MemberCanvasEdit.active.lease.generation++,f=>f.win.MemberCanvasEdit.active.lease.canEdit=false,
        f=>f.win.CanvasSession.context.workspace.id='other',f=>f.replace(clone(f.doc)),f=>f.doc.nodes.pop()]){
        const f=fixture(),[task]=await submitted(f,1);let writes=0;change(f);
        assert.throws(()=>f.op.apply(task,()=>writes++),e=>e.resultPending);assert.equal(writes,0);
    }
});
test('receipts must match immutable canvas, target, revision, graph, request and task',async()=>{
    for(const edit of [t=>t.canvas_binding=null,t=>t.canvas_binding.version=1,t=>t.canvas_binding.canvas_id='other',
        t=>t.canvas_binding.canvas_kind='smart',t=>t.canvas_binding.source_node_id='other',t=>t.canvas_binding.target_node_id='s',
        t=>t.canvas_binding.submitted_revision++,t=>t.canvas_binding.graph_sha256='f'.repeat(64),
        t=>t.canvas_binding.request_sha256='f'.repeat(64),t=>t.id='other']){
        const f=fixture(),[task]=await submitted(f,1);let writes=0;edit(task);
        assert.throws(()=>f.op.apply(task,()=>writes++),e=>e.resultPending);assert.equal(writes,0);
    }
});
test('late POST acknowledgements cannot attach to changed inputs',async()=>{
    const f=fixture(),[task]=await submitted(f,1);f.doc.nodes[0].text='new';
    assert.throws(()=>f.op.remember(task),e=>e.resultPending && e.submitted);
});
test('consumed receipt cannot apply twice or rebind a submitted operation',async()=>{
    const f=fixture(),[task]=await submitted(f,1);let writes=0;f.op.apply(task,()=>writes++);
    await assert.rejects(f.op.prepare(),/不能重新绑定/);
    assert.throws(()=>f.op.apply(task,()=>writes++),e=>e.resultPending);assert.equal(writes,1);
});

test('interrupted own mutation latches pending instead of allowing outer failure cleanup',async()=>{
    const f=fixture(),[task]=await submitted(f,1);
    assert.throws(()=>f.op.apply(task,()=>{throw new Error('render interrupted');}),e=>e.resultPending && e.cause.message==='render interrupted');
    assert.throws(()=>f.op.check(),e=>e.resultPending);
});
test('a failed second preflight cannot reuse a previous successful preparation',async()=>{
    let saved=true;const f=fixture({flush:async()=>saved});await f.op.prepare();saved=false;
    await assert.rejects(f.op.prepare(),/尚未保存/);
    assert.throws(()=>f.op.beginSubmission(),e=>e.resultPending && !e.submitted);
});

test('v3 ignores save-derived local asset IDs but binds actual URLs and ID-only references',()=>{
    const doc=clone(golden.graphs[0].document);
    doc.nodes[2].images=[{url:'/assets/cloud/ast_result/one.png',run:{refs:[{url:'/api/media/ast_ref/content'}]}}];
    const before=api.graphCanonical(doc,'s','o');
    doc.nodes[2].images[0].media_asset_id='ast_result';doc.nodes[2].images[0].run.refs[0].media_asset_id='ast_ref';
    assert.equal(api.graphCanonical(doc,'s','o'),before);
    doc.nodes[2].images[0].url='/assets/cloud/ast_other/two.png';assert.notEqual(api.graphCanonical(doc,'s','o'),before);
    for(const item of [{media_asset_id:'ast_only'},{url:'https://provider.test/image',media_asset_id:'ast_external'}]){
        doc.nodes[2].images=[item];const first=api.graphCanonical(doc,'s','o');item.media_asset_id+='_changed';
        assert.notEqual(api.graphCanonical(doc,'s','o'),first);
    }
});
test('a receipt for another task in the same batch cannot satisfy a requested task ID',async()=>{
    const f=fixture(),tasks=await submitted(f);let writes=0;
    assert.throws(()=>f.op.apply(tasks[1],()=>writes++,tasks[0].id),e=>e.resultPending);assert.equal(writes,0);
});
