const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const path=require('node:path');
const {readCanvasSource}=require('./helpers/canvas-source.cjs');
const results=require('../static/js/canvas-task-results.js');
const bindings=require('../static/js/canvas-task-bindings.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

test('read recovery survives an expired edit lease, reconnects, and never changes persisted cards',async t=>{
    const task={canvasTaskId:'task',canvasTaskType:'video'},original=clone(task);
    const item={id:'task',kind:'video',canvasId:'canvas',task};let status='running',offline=false,reads=0,rights=true,current=true;
    const observer=results.recovery({list:()=>[item],current:()=>current,allowed:()=>rights,changed(){},apply(){},
        read:async()=>{reads++;if(offline)throw new TypeError('offline');return {id:'task',canvas_id:'canvas',status};}});
    t.after(()=>observer.stop());
    assert.equal(observer.get(task).status,'checking');
    await observer.refresh();assert.equal(observer.get(task).status,'running');
    offline=true;await observer.refresh();assert.equal(observer.get(task).status,'disconnected');
    offline=false;status='succeeded';await observer.refresh();assert.equal(observer.get(task).status,'succeeded');
    rights=false;await observer.refresh();assert.equal(observer.get(task).status,'unavailable');assert.equal(reads,3);
    current=false;rights=true;await observer.refresh();assert.equal(reads,3);
    assert.deepEqual(task,original);
});

for(const change of ['canvas','rights','node'])test('delayed response discarded after '+change,async t=>{
    const gate=deferred(),task={taskId:'task'},item={id:'task',canvasId:'c',task};let current=true,rights=true,items=[item],writes=0,changes=0;
    const observer=results.recovery({list:()=>items,current:()=>current,allowed:()=>rights,changed(){changes++;},apply(){writes++;},read:()=>gate.promise});
    t.after(()=>observer.stop());const promise=observer.refresh();
    if(change==='canvas')current=false;if(change==='rights')rights=false;if(change==='node')items=[];
    gate.resolve({id:'task',canvas_id:'c',status:'succeeded'});await promise;
    assert.equal(writes,0);assert.equal(changes,0);
});

test('polls coalesce, stale observations stop claiming running, and wrong scope cannot apply',async t=>{
    const gate=deferred(),task={taskId:'task'},item={id:'task',canvasId:'c',task};let reads=0,writes=0,now=0;
    const observer=results.recovery({list:()=>[item],current:()=>true,allowed:()=>true,changed(){},apply(){writes++;},now:()=>now,
        read:async()=>{if(++reads===1)return {id:'task',status:'running'};return gate.promise;}});
    t.after(()=>observer.stop());await observer.refresh();now=16000;assert.equal(observer.get(task).status,'disconnected');
    const pending=observer.refresh();await observer.refresh();assert.equal(reads,2);
    gate.resolve({id:'task',canvas_id:'other',status:'succeeded'});await pending;assert.equal(writes,0);
});

function install(context,kind,names){
    const source=readCanvasSource(path.join(__dirname,'../static/js/'+(kind==='classic'?'canvas':'smart-canvas')+'.js'),'utf8');
    vm.createContext(context);
    for(const name of names){
        const start=new RegExp('(?:async )?function '+name+'\\(').exec(source).index;
        const next=source.slice(start+1).search(/\n(?:async )?function /);
        vm.runInContext(source.slice(start,next<0?undefined:start+1+next),context);
    }
}

async function fixture(kind,media){
    const task=kind==='classic'?{id:'pending',canvasTaskId:'task',canvasTaskType:media==='video'?'video':'online-image',run:{node:{id:'source'}}}:
        {taskId:'task',kind:media,run:{nodeId:'source'}};
    const source={id:'source',type:'generator',prompt:'original'},target={id:'target',type:kind==='classic'?'output':'smart-image',images:[],
        ...(kind==='classic'?{_pending:[task]}:{pendingTasks:[task],pending:1})};
    const lease={epoch:2,generation:8,canEdit:true},entry={id:'canvas',memberId:'m',workspaceId:'w',lease};
    const win={CanvasSession:{enabled:true,context:{member:{id:'m'},workspace:{id:'w'}}},MemberCanvasEdit:{active:entry,get canEdit(){return lease.canEdit;}},CanvasTaskBindings:bindings};
    const canvas={id:'canvas',kind,nodes:[source,target],connections:[],settings:{}},ctx={window:win,canvas,nodes:canvas.nodes,JSON,
        canvasSavePayload:()=>clone(canvas),smartTaskInputDocument:()=>clone(canvas),refreshRunNodes(){},refreshSmartNodes(){},scheduleSave(){},
        activeCanvasTaskPolls:new Set(),activeSmartTaskPolls:new Map(),videoOutputsFromResult:r=>r.videos || [],resultMediaUrls:r=>r.videos || r.images || r};
    win.CanvasTaskResults={guard:(targets,read)=>results.guard(targets,read,win)};
    let writes=0;
    const complete=()=>{writes++;target.images.push({url:'saved.mp4'});target._pending=[];target.pendingTasks=[];};
    ctx.completeCanvasImageTask=ctx.completeCanvasVideoTask=ctx.finalizeSmartPendingTask=complete;
    install(ctx,kind,['canvasTaskWriteGuard',...(kind==='classic'?['findPendingTask','classicTaskRecovery']:['smartPendingTasks','smartTaskRecovery'])]);
    const adapter=ctx[kind==='classic'?'classicTaskRecovery':'smartTaskRecovery'](),item=adapter.list()[0];
    const record={id:'task',canvas_id:'canvas',canvas_edit_generation:1,status:'succeeded',result:media==='video'?{videos:['saved.mp4']}:{images:['saved.png']},
        canvas_binding:{version:3,canvas_id:'canvas',canvas_kind:kind,source_node_id:'source',target_node_id:'target',submitted_revision:1,
            graph_sha256:await bindings.graphFingerprint(clone(canvas),'source','target'),request_sha256:'a'.repeat(64)}};
    return {ctx,canvas,source,target,task,lease,win,adapter,item,record,writes:()=>writes,
        apply:()=>adapter.apply(item,record,()=>adapter.list().some(row=>row.task===task))};
}

for(const kind of ['classic','smart'])for(const media of ['image','video']){
    test(`${kind} ${media}: reload without memory binding uses new edit lease once`,async()=>{
        const f=await fixture(kind,media);assert.equal(f.task._inputBinding,undefined);
        await f.apply();await f.apply();assert.equal(f.writes(),1);
    });
    for(const change of ['readonly','input','deleted','workspace','target','legacy'])test(`${kind} ${media}: ${change} never overwrites`,async()=>{
        const f=await fixture(kind,media);
        if(change==='readonly')f.lease.canEdit=false;
        if(change==='input')f.source.prompt='new input';
        if(change==='deleted')f.ctx.nodes.splice(f.ctx.nodes.indexOf(f.source),1);
        if(change==='workspace')f.win.CanvasSession.context.workspace.id='other';
        if(change==='target')f.record.canvas_binding.target_node_id='other';
        if(change==='legacy')f.record.canvas_binding.version=2;
        await f.apply().catch(()=>{});assert.equal(f.writes(),0);assert.equal(f.target.images.length,0);
    });
}

test('input and lease changes during fingerprint hashing invalidate recovered receipt',async()=>{
    for(const change of ['input','lease']){
        const f=await fixture('classic','video'),gate=deferred();let valid=true;
        const promise=bindings.recover({task:f.record,taskId:'task',canvasId:'canvas',kind:'classic',sourceId:'source',targetId:'target',
            read:()=>clone(f.canvas),valid:()=>valid,crypto:{subtle:{digest:async()=>{await gate.promise;return Buffer.from(f.record.canvas_binding.graph_sha256,'hex');}}}});
        if(change==='input')f.source.prompt='changed';else valid=false;
        gate.resolve();await assert.rejects(promise);assert.equal(f.writes(),0);
    }
});
