const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {webcrypto}=require('node:crypto');
const Lease=require('../static/js/canvas-edit-lease.js');
const source=fs.readFileSync('static/js/member-canvas-edit.js','utf8');
const apiSource=fs.readFileSync('static/js/canvas-api.js','utf8');
const status={canvas_id:'a',generation:1,revision:3,holder:{id:'member',display_name:'甲',is_self:true},server_time:'2026-09-14T00:00:00Z',expires_at:'2026-09-14T00:01:00Z'};
const reply=(data,code=200)=>new Response(JSON.stringify(data),{status:code});
function fixture() {
    const calls=[],records=new Map(),queries=[],listeners=new Map(),timers=new Map(),delays=new Map(),downloads=[]; let sequence=0;
    const element=(tag='div')=>({tagName:tag.toUpperCase(),value:'',children:[],classList:{toggle(){},remove(){}},setAttribute(){},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},addEventListener(){},remove(){this.removed=true;},click(){downloads.push(this.download);},showModal(){},close(){},querySelectorAll(selector){return this.children.filter(node=>node.tagName===selector.toUpperCase());}});
    const database={transaction(){
        const transaction={abort(){this.aborted=true;queueMicrotask(()=>this.onabort?.());},objectStore:()=>({
            put(value){records.set(value.key,structuredClone(value));return {result:value.key};},
            get(key){const request={result:structuredClone(records.get(key))};queueMicrotask(()=>request.onsuccess?.());return request;},
            delete(key){records.delete(key);return {};},
            getAll(range){queries.push(range);return {result:structuredClone([...records.values()].filter(row=>row.key>=range.lower && row.key<=range.upper))};}})};
        queueMicrotask(()=>queueMicrotask(()=>{if(!transaction.aborted)transaction.oncomplete?.();}));return transaction;
    }};
    const context={window:null,module:undefined,URL,Headers,AbortSignal,Blob,TextEncoder,console,crypto:webcrypto,queueMicrotask,
        location:{origin:'http://canvas.local',href:'http://canvas.local/static/canvas.html'},
        indexedDB:{open(){const request={result:database};queueMicrotask(()=>request.onsuccess());return request;}},
        IDBKeyRange:{bound:(lower,upper)=>({lower,upper})},
        document:{body:element(),querySelectorAll:()=>[],createElement:element},
        setTimeout(fn,ms){timers.set(++sequence,fn);delays.set(sequence,ms);return sequence;},clearTimeout(id){timers.delete(id);delays.delete(id);},
        addEventListener(name,fn){listeners.set(name,fn);},
        CanvasSession:{enabled:true,context:{member:{id:'member'},workspace:{id:'space',permissions:['canvas.read','canvas.edit']}}},
        fetch:async(path,init={})=>{calls.push([path,init]);
            if(path.endsWith('/acquire'))return reply({...status,edit_token:'secret-lease-proof'});
            if(path.endsWith('/renew'))return reply(status);
            if(path.endsWith('/edit-lease/transfers'))return reply({lease:{...status,holder:null},requests:[]});
            if(path.endsWith('/edit-lease'))return reply({...status,holder:null});
            if(path.endsWith('/page-state'))return reply({accepted:true,presence:{online_members:0,members:[]}});
            if(init.method==='PUT')return reply({canvas:{revision:4}});
            return reply({id:'created'});
        }};
    context.window=context;context.parent=context;
    context.CanvasEditLease=class extends Lease {constructor(options){super({...options,fetch:context.fetch,now:()=>0});}};
    vm.createContext(context);vm.runInContext(fs.readFileSync('static/js/canvas-directory-writes.js','utf8'),context);vm.runInContext(source,context);vm.runInContext(apiSource,context);
    return {context,calls,records,queries,listeners,timers,delays,downloads,database,api:context.MemberCanvasEdit,
        mount:()=>context.MemberCanvasEdit.mount({id:'a',dirty:()=>false,snapshot:()=>({id:'a',kind:'classic',revision:3,nodes:[],connections:[]}),reload:async()=>({revision:3}),flush:async()=>true})};
}
test('healthy idle subscription suppresses transfer polling but keeps a minute fallback',async()=>{
    const f=fixture();await f.mount();await new Promise(setImmediate);
    const entry=f.api.active;entry.subscription={healthy:true};
    const count=()=>f.calls.filter(([path])=>path.endsWith('/transfers')).length;
    const tick=async()=>{await [...f.timers].find(([id])=>f.delays.get(id)===15000)[1]();await new Promise(setImmediate);};
    assert.equal(count(),1);assert.equal(f.delays.get(entry.reportTimer),20000);
    await tick();assert.equal(count(),1);
    entry.lastStateAt=Date.now()-61000;await tick();assert.equal(count(),2);
    entry.subscription.healthy=false;await tick();assert.equal(count(),3);
    f.context.document.hidden=true;await tick();assert.equal(count(),3);
});

test('hidden editor renews at the server heartbeat without transfer requests',async()=>{
    const f=fixture();await f.mount();await new Promise(setImmediate);
    const entry=f.api.active;await entry.lease.start(async()=>({revision:3}));
    const transport=entry.lease.transport;entry.lease.transport=async(path,init)=>{
        if(path.endsWith('/renew')){f.calls.push([path,init]);return reply({...status,heartbeat_seconds:10});}
        return transport(path,init);
    };
    f.context.document.hidden=true;
    const tick=[...f.timers].find(([id])=>f.delays.get(id)===15000)[1];
    const before=f.calls.length;await tick();
    assert.deepEqual(f.calls.slice(before).map(([path])=>path),['/api/canvases/a/edit-lease/renew']);
    assert.ok([...f.delays.values()].includes(10000));assert.equal(entry.lease.canSave,true);
    entry.reportSuspended=true;const suspended=f.calls.length;await tick();assert.equal(f.calls.length,suspended);
});

test('transient renewal failure schedules a two-second retry and clears recovered feedback',async()=>{
    const f=fixture();await f.mount();await new Promise(setImmediate);
    const entry=f.api.active;await entry.lease.start(async()=>({revision:3}));
    f.context.document.hidden=true;
    let fail=true;entry.lease.transport=async()=>{if(fail)throw new TypeError('network');return reply({...status,heartbeat_seconds:10});};
    await [...f.timers].find(([id])=>f.delays.get(id)===15000)[1]();
    assert.equal(entry.lease.canEdit,true);assert.equal(entry.lease.renewRetry,true);assert.ok(entry.feedback);
    const retry=[...f.timers].find(([id])=>f.delays.get(id)===2000);assert.ok(retry);
    fail=false;await retry[1]();
    assert.equal(entry.lease.canEdit,true);assert.equal(entry.feedback,'');assert.equal(entry.lease.renewRetry,false);
    assert.ok([...f.delays.values()].includes(10000));
    assert.equal(f.calls.filter(([path])=>path.endsWith('/acquire')).length,1);
});

test('slow occupancy reads cannot stall private heartbeat scheduling',async()=>{
    const f=fixture();await f.mount();await new Promise(setImmediate);
    const entry=f.api.active;await entry.lease.start(async()=>({revision:3}));
    let complete;entry.lease.transport=async(path,init)=>{
        f.calls.push([path,init]);
        if(path.endsWith('/transfers'))return new Promise(resolve=>{complete=()=>resolve(reply({lease:status,requests:[]}));});
        return reply({...status,heartbeat_seconds:5});
    };
    const first=[...f.timers].find(([id])=>f.delays.get(id)===15000)[1];
    await first();await new Promise(setImmediate);assert.ok(complete);
    const next=[...f.timers].find(([id])=>f.delays.get(id)===5000);
    assert.ok(next,'next heartbeat is scheduled while status read is still pending');
    await next[1]();
    assert.equal(f.calls.filter(([path])=>path.endsWith('/renew')).length,2);
    assert.equal(entry.lease.canEdit,true);complete();await new Promise(setImmediate);
});
test('opening a member canvas only observes; saves require explicit start',async()=>{
    const f=fixture();await f.mount();await new Promise(setImmediate);
    assert.deepEqual(f.calls.map(([path])=>path).sort(),['/api/canvases/a/edit-lease/transfers','/api/canvases/a/page-state']);
    await assert.rejects(f.context.CanvasApi.saveCanvas('a',{nodes:[]}));
    assert.equal(f.calls.length,2);
    await f.api.active.lease.start(async()=>({revision:3}));
    const response=await f.context.CanvasApi.saveCanvas('a',{nodes:[],base_revision:99});
    assert.equal(response.ok,true);
    const init=f.calls.at(-1)[1];assert.equal(new Headers(init.headers).get('X-Canvas-Edit-Token'),'secret-lease-proof');
    assert.equal(JSON.parse(init.body).base_revision,3);assert.equal(f.api.active.lease.revision,4);
});

test('page reports capture scope and monotonic dirty/closed state without document or credentials',async()=>{
    const f=fixture();await f.mount();await new Promise(setImmediate);
    const entry=f.api.active;
    const reports=()=>f.calls.filter(([path])=>path.endsWith('/page-state'));
    const initial=JSON.parse(reports()[0][1].body);
    assert.deepEqual(Object.keys(initial).sort(),['closed','dirty','page_id','sequence']);
    assert.equal(initial.dirty,false);assert.equal(initial.sequence,1);
    entry.options.dirty=()=>true;
    await f.timers.get(entry.reportTimer)();
    const changed=JSON.parse(reports().at(-1)[1].body);
    assert.equal(changed.dirty,true);assert.equal(changed.sequence,2);assert.equal(changed.page_id,initial.page_id);
    f.listeners.get('pagehide')({persisted:false});await new Promise(setImmediate);
    const [path,init]=reports().at(-1),closed=JSON.parse(init.body);
    assert.equal(closed.closed,true);assert.equal(closed.dirty,true);assert.equal(closed.sequence,3);assert.equal(init.keepalive,true);
    assert.equal(init.headers['X-Member-ID'],'member');assert.equal(init.headers['X-Workspace-ID'],'space');
    assert.equal(entry.reportClosed,true);assert.equal(entry.lease.state,'closed');
});

test('page reporting stops on account changes and failure does not revoke editing',async()=>{
    const f=fixture();await f.mount();await new Promise(setImmediate);const entry=f.api.active;
    await entry.lease.start(async()=>({revision:3}));
    const native=f.context.fetch;f.context.fetch=async(path,init)=>{if(path.endsWith('/page-state'))throw new Error('network');return native(path,init);};
    await f.timers.get(entry.reportTimer)();assert.match(entry.reportMessage,/暂未上报/);assert.equal(entry.lease.canSave,true);
    const before=f.calls.length;f.context.CanvasSession.context.member.id='another';
    await f.timers.get(entry.reportTimer)();assert.equal(f.calls.length,before);
});

test('back-forward suspension keeps one report identity and requires a new editing claim',async()=>{
    const f=fixture();await f.mount();await new Promise(setImmediate);const entry=f.api.active;
    await entry.lease.start(async()=>({revision:3}));entry.options.dirty=()=>true;
    const pageId=entry.reportId;
    f.listeners.get('pagehide')({persisted:true});await new Promise(setImmediate);
    assert.equal(entry.reportClosed,undefined);assert.equal(entry.reportSuspended,true);assert.equal(entry.lease.canSave,false);
    f.listeners.get('pageshow')({persisted:true});await new Promise(setImmediate);
    const reports=f.calls.filter(([path])=>path.endsWith('/page-state')).map(([,init])=>JSON.parse(init.body));
    assert.equal(reports.length,3);assert.ok(reports.every(row=>row.page_id===pageId&&!row.closed));
    assert.equal(reports.at(-1).sequence,3);assert.equal(reports.at(-1).dirty,true);assert.equal(entry.lease.canSave,false);
});

test('reload snapshots dirty content, flushes and confirms release before allowing navigation',async()=>{
    const f=fixture();await f.mount();await f.api.active.lease.start(async()=>({revision:3}));
    const entry=f.api.active;let dirty=true,complete;
    entry.options.dirty=()=>dirty;
    entry.options.flush=async()=>{assert.equal(f.records.size,1);await new Promise(r=>complete=r);dirty=false;return true;};
    entry.lease.transport=async(path)=>{assert.ok(path.endsWith('/release'));assert.equal(dirty,false);return reply({released:true,revision:3});};
    const pending=f.api.prepareReload();assert.equal(f.api.prepareReload(),pending);
    await new Promise(setImmediate);assert.equal(entry.lease.canEdit,false);complete();
    assert.equal(await pending,true);assert.equal(entry.lease.state,'view');assert.equal(f.records.size,1);
});

test('reload refuses failed or unowned dirty pages and preserves their scoped drafts',async()=>{
    for(const owner of [false,true]){
        const f=fixture();await f.mount();
        if(owner)await f.api.active.lease.start(async()=>({revision:3}));
        f.api.active.options.dirty=()=>true;f.api.active.options.flush=async()=>false;
        assert.equal(await f.api.prepareReload(),false);assert.equal(f.records.size,1);
        assert.equal(f.calls.some(([path])=>path.endsWith('/release')),false);
        assert.equal(f.api.active.lease.state,owner?'editing':'view');
    }
});
test('canvas tasks carry the active proof and reject another canvas',async()=>{
    const f=fixture();await f.mount();await f.api.active.lease.start(async()=>({revision:3}));
    const before=f.calls.length;
    await assert.rejects(f.context.CanvasApi.createCanvasImageTask({canvas_id:'foreign'}));
    assert.equal(f.calls.length,before);
    await f.context.CanvasApi.createCanvasImageTask({canvas_id:'a'});
    assert.equal(f.calls.at(-1)[0],'/api/canvas-image-tasks');
    assert.equal(new Headers(f.calls.at(-1)[1].headers).get('X-Canvas-Revision'),'3');
    await f.context.CanvasApi.createCanvas({title:'new'});
    assert.equal(f.calls.at(-1)[0],'/api/canvases');
    assert.equal(new Headers(f.calls.at(-1)[1].headers).has('X-Canvas-Edit-Token'),false);
});
test('draft persistence is bound to member, workspace, canvas and page; it excludes lease secrets',async()=>{
    const f=fixture();await f.mount();await f.api.active.lease.start(async()=>({revision:3}));
    f.api.active.options.dirty=()=>true;
    f.api.active.options.snapshot=()=>({revision:3,nodes:[{prompt:'keep this'}]});
    f.api.active.lease.pause('offline');await new Promise(setImmediate);
    assert.equal(f.records.size,1);
    const draft=[...f.records.values()][0];
    assert.deepEqual(JSON.parse(draft.key),['member','space','a',draft.page]);
    assert.equal(draft.document.nodes[0].prompt,'keep this');
    assert.equal(JSON.stringify(draft).includes('secret-lease-proof'),false);
    const leaving=f.api.leave();await new Promise(setImmediate);
    await f.context.document.body.children.at(-1).children.find(node=>node.textContent==='取消').onclick();
    assert.equal(await leaving,false);assert.ok(f.api.active);
});
test('paused editing does not resume after maintenance returns to normal',async()=>{
    const f=fixture();await f.mount();await f.api.active.lease.start(async()=>({revision:3}));
    f.listeners.get('member-session:maintenance')({detail:{mode:'read_only'}});
    assert.equal(f.api.canSave,false);
    f.listeners.get('member-session:maintenance')({detail:{mode:'normal'}});
    assert.equal(f.api.canSave,false);
    await assert.rejects(f.context.CanvasApi.saveCanvas('a',{nodes:[]}));
});
test('draft listing queries only the exact member, workspace and canvas key range',async()=>{
    const f=fixture();await f.mount();
    await action(f.api.active.bar,'自动草稿').onclick();
    assert.equal(f.queries.length,1);
    assert.deepEqual(f.queries[0],{lower:'["member","space","a",',upper:'["member","space","a",\uffff'});
    for(const ids of [['other','space','a'],['member','other','a'],['member','space','ab']]) {
        const key=JSON.stringify([...ids,'page']);
        assert.equal(key>=f.queries[0].lower && key<=f.queries[0].upper,false);
    }
});
test('viewer cannot start and only a takeover permission exposes the force action',async()=>{
    const f=fixture();await f.mount();await new Promise(setImmediate);
    f.context.CanvasSession.context.workspace.permissions=['canvas.read'];
    f.api.active.lease.status={...status,holder:null};f.api.active.lease.emit();
    assert.equal(f.api.active.begin.disabled,true);assert.equal(f.api.active.force.hidden,true);
    f.context.CanvasSession.context.workspace.permissions.push('canvas.edit');
    f.api.active.lease.status={...status,holder:{is_self:false}};f.api.active.lease.emit();
    assert.equal(f.api.active.ask.hidden,false);assert.equal(f.api.active.ask.disabled,false);assert.equal(f.api.active.force.hidden,true);
    f.context.CanvasSession.context.workspace.permissions.push('canvas.lock.takeover');f.api.active.lease.emit();
    assert.equal(f.api.active.force.hidden,false);assert.equal(f.api.active.force.disabled,false);
});
test('force dialog requires a reason, permits correcting an empty reason, and submits confirmed generation',async()=>{
    const f=fixture();await f.mount();await new Promise(setImmediate);
    f.context.CanvasSession.context.workspace.permissions.push('canvas.lock.takeover');
    f.api.active.lease.status={...status,holder:{is_self:false}};f.api.active.lease.emit();
    const operation=f.api.active.force.onclick();await new Promise(setImmediate);
    const dialog=f.context.document.body.children.at(-1), confirm=dialog.children.find(node=>node.textContent==='确认强制接管');
    const before=f.calls.length;
    await confirm.onclick();assert.equal(f.calls.length,before);assert.equal(confirm.disabled,false);
    dialog.children.find(node=>node.tagName==='TEXTAREA').value='维护检查需要';
    await confirm.onclick();await operation;
    assert.deepEqual(JSON.parse(f.calls.at(-1)[1].body),{takeover:'force',expected_generation:1,confirm:true,reason:'维护检查需要'});
});

function seedDraft(f,extra={}) {
    const row={member_id:'member',workspace_id:'space',canvas_id:'a',page:'old-page',base_revision:3,saved_at:'2026-09-14T01:00:00Z',
        document:{id:'a',kind:'classic',revision:3,nodes:[{id:'saved',prompt:'recover'}],connections:[]},...extra};
    row.key=JSON.stringify([row.member_id,row.workspace_id,row.canvas_id,row.page]);f.records.set(row.key,structuredClone(row));return row;
}
const action=(node,label)=>node.children.find(child=>child.tagName==='BUTTON' && child.textContent===label) || node.children.map(child=>action(child,label)).find(Boolean);
async function draftLine(f) {
    await action(f.api.active.bar,'自动草稿').onclick();
    return f.context.document.body.children.at(-1).children.find(node=>node.children.some(child=>child.textContent==='恢复到本页'));
}
async function confirmLatest(f,label) {
    await new Promise(setImmediate);await action(f.context.document.body.children.at(-1),label).onclick();
}
test('restoring a scoped draft requires confirmation and proof verification, and keeps the original',async()=>{
    const f=fixture();await f.mount();seedDraft(f);let restored;
    f.api.active.options.restore=value=>{restored=value;f.api.active.options.dirty=()=>true;f.api.active.options.snapshot=()=>value;};
    const line=await draftLine(f);await action(line,'恢复到本页').onclick();
    assert.equal(restored,undefined);assert.match(line.children.at(-1).textContent,/开始编辑/);
    await f.api.active.lease.start(async()=>({revision:3}));
    const operation=action(line,'恢复到本页').onclick();await confirmLatest(f,'确认恢复到本页');await operation;
    assert.equal(restored.nodes[0].prompt,'recover');assert.equal(f.records.size,2);
    assert.equal(f.calls.at(-1)[0],'/api/canvases/a/edit-lease/renew');
    assert.equal(f.calls.some(([,init])=>init.method==='PUT'),false);
    assert.equal(JSON.stringify([...f.records.values()]).includes('secret-lease-proof'),false);
});
test('mismatched revisions and a busy canvas leave the current graph intact',async()=>{
    const f=fixture();await f.mount();await f.api.active.lease.start(async()=>({revision:3}));
    seedDraft(f,{base_revision:2});f.api.active.options.restore=()=>assert.fail('restored');
    const line=await draftLine(f),operation=action(line,'恢复到本页').onclick();
    await confirmLatest(f,'确认恢复到本页');await operation;
    assert.match(line.children.at(-1).textContent,/版本不一致/);assert.equal(f.records.size,1);
    f.api.active.options.busy=()=>true;await action(line,'恢复到本页').onclick();
    assert.match(line.children.at(-1).textContent,/保存或生成/);
});
test('draft deletion is confirmed, scope checked and does not delete a newer record',async()=>{
    const f=fixture();await f.mount();const row=seedDraft(f),foreign=seedDraft(f,{member_id:'other'});
    const line=await draftLine(f),operation=action(line,'删除草稿').onclick();
    await new Promise(setImmediate);
    f.records.set(row.key,{...row,record_id:'newer'});
    await confirmLatest(f,'确认删除草稿');await operation;
    assert.equal(f.records.has(row.key),true);assert.match(line.children.at(-1).textContent,/草稿已变化/);
    const freshLine=await draftLine(f),removing=action(freshLine,'删除草稿').onclick();
    await confirmLatest(f,'确认删除草稿');await removing;
    assert.equal(f.records.has(row.key),false);assert.equal(f.records.has(foreign.key),true);assert.equal(freshLine.removed,true);
});
test('an account switch blocks a draft dialog and never relabels old-page persistence',async()=>{
    const f=fixture();await f.mount();seedDraft(f);const line=await draftLine(f);
    f.context.CanvasSession.context.member.id='new-member';
    await action(line,'恢复到本页').onclick();assert.equal(f.downloads.length,0);assert.match(line.children.at(-1).textContent,/成员或空间/);
    f.api.active.options.dirty=()=>true;f.api.active.lease.pause('account changed');await new Promise(setImmediate);
    assert.equal([...f.records.values()].every(row=>row.member_id==='member'),true);
});
test('an unsaved paused page can leave only after confirmed automatic preservation',async()=>{
    const f=fixture();await f.mount();f.api.active.options.dirty=()=>true;
    f.api.active.lease.pause('offline');
    const operation=f.api.leave();await confirmLatest(f,'保留草稿并离开');
    assert.equal(await operation,true);assert.equal(f.api.active,null);assert.equal(f.downloads.length,0);assert.equal(f.records.size,2);
    assert.equal(f.calls.some(([,init])=>init.method==='PUT'),false);
});

test('restoring the current page draft archives the selected content before replacing its live record',async()=>{
    const f=fixture();await f.mount();await f.api.active.lease.start(async()=>({revision:3}));
    f.api.active.options.dirty=()=>true;
    f.api.active.options.snapshot=()=>({id:'a',kind:'classic',revision:3,nodes:[{prompt:'original'}],connections:[]});
    f.api.active.lease.pause('offline');await new Promise(setImmediate);
    f.api.active.options.dirty=()=>false;
    await f.api.active.lease.start(async()=>({revision:3}));
    f.api.active.options.restore=value=>{f.api.active.options.snapshot=()=>value;f.api.active.options.dirty=()=>true;};
    const line=await draftLine(f),operation=action(line,'恢复到本页').onclick();
    await confirmLatest(f,'确认恢复到本页');await operation;
    assert.equal(f.records.size,2);
    const archived=[...f.records.values()].find(row=>row.page.includes('/restored/'));
    assert.equal(archived.document.nodes[0].prompt,'original');
    const live=[...f.records.values()].find(row=>!row.page.includes('/restored/'));
    assert.equal(live.base_generation,1);assert.notEqual(live.record_id,archived.record_id);
    await draftLine(f);
    const currentLine=f.context.document.body.children.at(-1).children.find(node=>node.tagName==='P' && node.textContent.includes('· 本页'));
    await action(currentLine,'删除草稿').onclick();
    assert.match(currentLine.children.at(-1).textContent,/未保存内容/);assert.equal(f.records.size,2);
});

function enableCopy(f){f.context.CanvasSession.context.workspace.permissions.push('canvas.create','asset.read');}
const copyReply=()=>reply({canvas:{id:'new-copy',title:'草稿副本',kind:'classic',revision:1},replayed:false});
test('lost copy responses keep a frozen retry draft; a reopened page sends the same request without a lease',async()=>{
    const f=fixture();await f.mount();enableCopy(f);const source=seedDraft(f);const submitted=[];
    f.context.fetch=async(path,init)=>{
        assert.equal(path,'/api/canvas-draft-copies');const body=JSON.parse(init.body);submitted.push(body);
        assert.ok([...f.records.values()].some(row=>row.copy_request_id===body.request_id));
        assert.equal(new Headers(init.headers).has('X-Canvas-Edit-Token'),false);
        throw new Error('lost response');
    };
    const line=await draftLine(f),operation=action(line,'另存副本').onclick();
    await confirmLatest(f,'确认另存副本');await operation;
    assert.equal(f.records.size,2);assert.match(line.children.at(-1).textContent,/lost response/);
    assert.deepEqual(f.records.get(source.key),source);
    const g=fixture();await g.mount();enableCopy(g);
    for(const [key,row] of f.records)g.records.set(key,structuredClone(row));
    g.context.fetch=async(path,init)=>{submitted.push(JSON.parse(init.body));return copyReply();};
    await draftLine(g);
    const retryLine=g.context.document.body.children.at(-1).children.find(node=>node.children.some(child=>child.textContent==='重试 / 确认副本'));
    const retry=action(retryLine,'重试 / 确认副本').onclick();await confirmLatest(g,'确认另存副本');await retry;
    assert.deepEqual(submitted[0],submitted[1]);assert.equal(action(retryLine,'打开副本').hidden,false);
    assert.equal([...g.records.values()].find(row=>row.copy_request_id).copy_result.id,'new-copy');
    assert.equal(g.api.canSave,false);
});
test('copy refuses storage failure, missing permission or maintenance before posting',async()=>{
    for(const failure of ['storage','permission','maintenance']) {
        const f=fixture();await f.mount();enableCopy(f);seedDraft(f);
        f.context.fetch=async()=>assert.fail('submitted copy');
        const line=await draftLine(f);
        if(failure==='storage')f.database.transaction=()=>{throw new Error('disk full');};
        if(failure==='permission')f.context.CanvasSession.context.workspace.permissions=['canvas.read'];
        if(failure==='maintenance')f.api.active.lease.setMaintenance('draining');
        const operation=action(line,'另存副本').onclick();await confirmLatest(f,'确认另存副本');await operation;
        assert.ok(line.children.at(-1).textContent);assert.equal(action(line,'打开副本').hidden,true);
    }
});
test('opening a confirmed copy automatically preserves unsaved original-page changes first',async()=>{
    const f=fixture();await f.mount();enableCopy(f);seedDraft(f);let opened;
    f.api.active.options.dirty=()=>true;f.api.active.options.openCopy=async copy=>{opened=copy;};
    f.context.fetch=async()=>copyReply();
    const line=await draftLine(f),operation=action(line,'另存副本').onclick();
    await confirmLatest(f,'确认另存副本');await operation;
    assert.equal(opened,undefined);assert.ok(f.api.active);assert.equal(f.api.active.options.dirty(),true);
    const opening=action(line,'打开副本').onclick();await confirmLatest(f,'保留草稿并离开');await opening;
    assert.equal(opened.id,'new-copy');assert.equal(f.api.active,null);assert.equal(f.downloads.length,0);
    assert.ok([...f.records.values()].some(row=>row.page!=='old-page' && !row.copy_request_id));
});
test('copy request identity is reproducible for the same source and changes with edited content',async()=>{
    const ids=[];
    for(const prompt of ['one','one','two']) {
        const f=fixture();await f.mount();enableCopy(f);seedDraft(f,{document:{id:'a',kind:'classic',nodes:[{prompt}],connections:[]}});
        f.context.fetch=async(path,init)=>{ids.push(JSON.parse(init.body).request_id);return copyReply();};
        const line=await draftLine(f),operation=action(line,'另存副本').onclick();await confirmLatest(f,'确认另存副本');await operation;
    }
    assert.equal(ids[0],ids[1]);assert.notEqual(ids[0],ids[2]);
});

test('opening drafts immediately after typing flushes the latest text before listing',async()=>{
    const f=fixture();await f.mount();f.api.active.options.dirty=()=>true;
    f.api.active.options.snapshot=()=>({id:'a',kind:'classic',revision:3,nodes:[{prompt:'typed just now'}],connections:[]});
    f.api.markDirty();await draftLine(f);
    assert.equal([...f.records.values()][0].document.nodes[0].prompt,'typed just now');
    assert.equal(f.records.size,1);
});


test('canvas roster renders trusted names as text and expires without changing the edit lease',async()=>{
    const f=fixture();await f.mount();await new Promise(setImmediate);const entry=f.api.active;
    f.context.fetch=async()=>reply({accepted:true,presence:{online_members:2,members:[
        {id:'member_111111',display_name:'<img src=x onerror=alert(1)>',activity:'editing',is_self:true},
        {id:'member_222222',display_name:'同名',activity:'viewing',is_self:false}]}});
    await f.timers.get(entry.reportTimer)();
    assert.equal(entry.presenceSummary.textContent,'2 人在线');
    assert.equal(entry.presenceList.children[0].textContent,'<img src=x onerror=alert(1)> · 111111（你） · 编辑中');
    assert.equal(entry.presenceList.children[0].children.length,0);
    assert.equal(entry.presenceList.children[1].textContent,'同名 · 222222 · 查看中');
    assert.equal(entry.lease.canSave,false);
    entry.presenceReceivedAt=0;entry.lease.emit();
    assert.equal(entry.presenceSummary.textContent,'在线名单暂不可用');
    assert.match(entry.presenceList.children[0].textContent,/暂时无法获取/);
});

test('overlapping roster requests coalesce and late responses cannot leak across account changes',async()=>{
    const f=fixture();await f.mount();await new Promise(setImmediate);const entry=f.api.active;
    const pending=[];f.context.fetch=()=>new Promise(resolve=>pending.push(resolve));
    const tick=f.timers.get(entry.reportTimer),one=tick(),two=tick();
    const roster=name=>reply({accepted:true,presence:{online_members:1,members:[{id:'member',display_name:name,activity:'viewing'}]}});
    assert.equal(pending.length,1,'only one request may be in flight');
    pending[0](roster('新名单'));await Promise.all([one,two]);
    assert.match(entry.presenceList.children[0].textContent,/新名单/);
    const three=f.timers.get(entry.reportTimer)();
    f.context.CanvasSession.context.member.id='other';pending[1](roster('旧账号的名单'));await three;
    assert.match(entry.presenceList.children[0].textContent,/暂时无法获取/);
    assert.equal(entry.presenceSummary.textContent,'在线名单暂不可用');
});

test('repeated edits report only dirty transitions, preserving a fresh roster on temporary failure',async()=>{
    const f=fixture();await f.mount();await new Promise(setImmediate);const entry=f.api.active;
    await entry.lease.start(async()=>({revision:3}));
    let count=0,resolve,dirty=true;
    entry.options.dirty=()=>dirty;
    f.context.fetch=()=>{count++;return new Promise(done=>{resolve=done;});};
    const changed=async()=>{
        f.api.markDirty();const [id,fn]=[...f.timers].find(([id])=>f.delays.get(id)===150);
        f.timers.delete(id);f.delays.delete(id);fn();await new Promise(setImmediate);
    };
    for(let i=0;i<12;i++)await changed();
    assert.equal(count,1);resolve(reply({accepted:true,presence:{online_members:1,members:[{id:'member',display_name:'甲',is_self:true,activity:'editing'}]}}));
    await new Promise(setImmediate);assert.equal(entry.presenceSummary.textContent,'1 人在线');
    for(let i=0;i<12;i++)await changed();assert.equal(count,1,'unchanged dirty status does not post again');
    const stamp=entry.presenceReceivedAt;
    f.context.fetch=async()=>{throw Error('timeout');};await f.timers.get(entry.reportTimer)();
    assert.equal(entry.presenceSummary.textContent,'1 人在线');assert.equal(entry.presenceReceivedAt,stamp);
    assert.equal(f.delays.get(entry.reportTimer),3000);assert.equal(entry.lease.canEdit,true);
    entry.presenceReceivedAt=0;entry.lease.emit();assert.equal(entry.presenceSummary.textContent,'在线名单暂不可用');
    assert.match(entry.presenceList.children[0].textContent,/重试/);
    entry.lease.pause('续期失败');assert.equal(entry.label.textContent,'本页编辑已暂停');
});

test('closing a page bypasses a pending report and late completion cannot revive its roster',async()=>{
    const f=fixture();await f.mount();await new Promise(setImmediate);const entry=f.api.active,pending=[];
    f.context.fetch=(path,init)=>new Promise(resolve=>pending.push({body:JSON.parse(init.body),resolve}));
    const operation=f.timers.get(entry.reportTimer)();f.listeners.get('pagehide')({persisted:false});
    assert.equal(pending.length,2);assert.equal(pending[1].body.closed,true);assert.ok(pending[1].body.sequence>pending[0].body.sequence);
    pending[1].resolve(reply({accepted:true}));pending[0].resolve(reply({presence:{members:[{id:'late'}],online_members:1}}));
    await operation;await new Promise(setImmediate);
    assert.equal(entry.presence.members.length,0);assert.equal(entry.reportClosed,true);
    assert.equal(f.timers.has(entry.reportTimer),false);
});


test('subscription refreshes clean viewers but never replaces dirty documents',async()=>{
    const f=fixture();let revision=3,dirty=false,refreshes=0;
    f.context.CanvasSubscription=class {constructor(options){this.options=options;}start(){}stop(){this.stopped=true;}};
    f.context.CanvasSession.socketUrl=value=>value;
    await f.api.mount({id:'a',dirty:()=>dirty,snapshot:()=>({id:'a',revision,nodes:[],connections:[]}),
        refresh:async()=>{refreshes++;revision=4;},reload:async()=>({revision}),flush:async()=>true});
    await new Promise(setImmediate);const entry=f.api.active;
    entry.lease.transport=async()=>reply({lease:{...status,revision:4,holder:null},requests:[]});
    await entry.subscription.options.onChange({maintenance:{mode:'normal'}});
    assert.equal(refreshes,1);assert.equal(entry.lease.canSave,false);
    dirty=true;entry.lease.transport=async()=>reply({lease:{...status,revision:5,holder:null},requests:[]});
    await entry.subscription.options.onChange({maintenance:{mode:'normal'}});
    assert.equal(refreshes,1);assert.equal(revision,4);
});

test('transient subscription loss retains the private lease and draft across repeated reconnects',async()=>{
    const f=fixture();let dirty=false;
    f.context.CanvasSubscription=class {constructor(options){this.options=options;}start(){}stop(){this.stopped=true;}};
    f.context.CanvasSession.socketUrl=value=>value;
    await f.api.mount({id:'a',dirty:()=>dirty,snapshot:()=>({id:'a',revision:3,nodes:[],connections:[]}),
        refresh:async()=>assert.fail('draft overwritten'),reload:async()=>({revision:3}),flush:async()=>true});
    await new Promise(setImmediate);const entry=f.api.active;
    await entry.lease.start(async()=>({revision:3}));dirty=true;
    const token=entry.lease.token,epoch=entry.lease.epoch;
    entry.lease.transport=async(path,init)=>{
        f.calls.push([path,init]);
        return reply(path.endsWith('/transfers')?{lease:status,requests:[]}:status);
    };
    for(let i=0;i<3;i++){
        await entry.subscription.options.onDisconnect('实时通知中断');await new Promise(setImmediate);
        assert.equal(entry.lease.canEdit,true);assert.equal(entry.lease.token,token);assert.equal(entry.lease.epoch,epoch);
        await entry.subscription.options.onChange({maintenance:{mode:'normal'}});
    }
    assert.equal(f.calls.some(([path])=>path.endsWith('/release')),false);
    assert.equal(f.calls.filter(([path])=>path.endsWith('/acquire')).length,1);
    assert.equal(f.calls.filter(([path])=>path.endsWith('/renew')).length,3);
});

test('revoked subscriptions and rejected private renewals still pause without automatic reacquisition',async()=>{
    for(const fatal of [true,false]){
        const f=fixture();f.context.CanvasSubscription=class {constructor(options){this.options=options;}start(){}stop(){}};
        f.context.CanvasSession.socketUrl=value=>value;
        await f.api.mount({id:'a',dirty:()=>true,snapshot:()=>({id:'a',revision:3,nodes:[{text:'draft'}]}),
            refresh:async()=>assert.fail('draft overwritten'),reload:async()=>({revision:3}),flush:async()=>true});
        await new Promise(setImmediate);const entry=f.api.active;
        await entry.lease.start(async()=>({revision:3}));
        entry.lease.transport=async()=>reply({detail:{code:'canvas_lease_lost'}},409);
        await entry.subscription.options.onDisconnect('连接异常',{fatal});await new Promise(setImmediate);
        assert.equal(entry.lease.canEdit,false);assert.equal(entry.lease.state,'paused');assert.equal(f.records.size,1);
        assert.equal(f.calls.filter(([path])=>path.endsWith('/acquire')).length,1);
        assert.equal(f.calls.some(([path])=>path.endsWith('/release')),false);
    }
});

test('canceling start with unsaved work never downloads a draft',async()=>{
 const f=fixture();await f.mount();await new Promise(setImmediate);
 f.api.active.options.dirty=()=>true;
 const pending=f.api.active.begin.onclick();await new Promise(setImmediate);
 assert.equal(f.downloads.length,0);
 const dialog=f.context.document.body.children.find(n=>n.tagName==='DIALOG');
 assert.ok(dialog);
 await dialog.children.find(n=>n.textContent==='取消').onclick();
 await pending;assert.equal(f.downloads.length,0);
 assert.equal(f.calls.some(([path])=>path.endsWith('/acquire')),false);
});

test('storage failure blocks leaving and retains the current document without downloads',async()=>{
 const f=fixture();await f.mount();const entry=f.api.active;
 entry.options.dirty=()=>true;entry.options.snapshot=()=>({id:'a',revision:3,nodes:[{text:'keep me'}]});
 f.database.transaction=()=>{throw new Error('storage unavailable');};
 const leaving=f.api.leave();const rejected=assert.rejects(leaving,/暂存未完成/);
 await confirmLatest(f,'保留草稿并离开');await rejected;
 assert.equal(f.api.active,entry);assert.equal(entry.options.snapshot().nodes[0].text,'keep me');assert.equal(f.downloads.length,0);
});
test('start checkpoints survive later edits to the live draft without exporting',async()=>{
 const f=fixture();await f.mount();await new Promise(setImmediate);const entry=f.api.active;
 entry.options.dirty=()=>true;entry.options.snapshot=()=>({id:'a',revision:3,nodes:[{text:'original'}]});
 const starting=entry.begin.onclick();await confirmLatest(f,'保留草稿并开始编辑');await starting;
 entry.options.snapshot=()=>({id:'a',revision:3,nodes:[{text:'later'}]});entry.lease.pause('offline');await new Promise(setImmediate);
 const checkpoint=[...f.records.values()].find(row=>row.page.includes('/restored/'));
 assert.equal(checkpoint.document.nodes[0].text,'original');assert.equal(f.downloads.length,0);
 assert.equal(action(entry.bar,'导出当前草稿'),undefined);
});

function folderFixture({locked=false,writeStatus=200}={}) {
    const f=fixture();let revision=3,held=false;
    f.context.fetch=async(path,init={})=>{
        f.calls.push([path,init]);
        if(path.endsWith('/acquire')) {
            if(locked)return reply({detail:{code:'canvas_locked'}},409);
            held=true;return reply({...status,revision,edit_token:'folder-proof'});
        }
        if(path.endsWith('/edit-lease'))return reply({...status,revision,holder:held?status.holder:null});
        if(path.endsWith('/release')) {assert.equal(new Headers(init.headers).get('X-Canvas-Revision'),String(revision));held=false;return reply({released:true,revision});}
        if(path.endsWith('/folder') || path.endsWith('/meta') || path.endsWith('/restore')) {
            assert.equal(new Headers(init.headers).get('X-Canvas-Edit-Token'),'folder-proof');
            assert.equal(new Headers(init.headers).get('X-Canvas-Revision'),String(revision));
            if(writeStatus!==200)return reply({detail:'missing folder'},writeStatus);
            revision++;return reply({canvas:{id:'a',...JSON.parse(init.body || '{}'),revision}});
        }
        throw new Error('Unexpected request '+path);
    };
    return {...f,held:()=>held};
}
test('folder move from the directory acquires and releases a short lease without opening an editor',async()=>{
    const f=folderFixture();const result=await f.context.CanvasApi.moveCanvasToFolder('a','folder-one');
    assert.equal(result.canvas.folder_id,'folder-one');assert.equal(result.canvas.revision,4);
    assert.equal(f.api.active,null);assert.equal(f.held(),false);
    assert.deepEqual(f.calls.map(([path])=>path),['/api/canvases/a/edit-lease/acquire','/api/canvases/a/folder','/api/canvases/a/edit-lease','/api/canvases/a/edit-lease/release']);
    await assert.rejects(f.context.CanvasApi.saveCanvas('a',{nodes:[]}));
});
test('folder moves never take over another editor and preserve errors',async()=>{
    const f=folderFixture({locked:true});await assert.rejects(f.context.CanvasApi.moveCanvasToFolder('a','folder-one'),/已有成员正在编辑/);
    assert.equal(f.calls.length,1);assert.deepEqual(JSON.parse(f.calls[0][1].body),{});
});
test('rejected folder writes release the temporary lease',async()=>{
    const f=folderFixture({writeStatus:403});await assert.rejects(f.context.CanvasApi.moveCanvasToFolder('a','missing'));
    assert.equal(f.held(),false);assert.ok(f.calls.at(-1)[0].endsWith('/release'));
});
test('consecutive folder moves are serialized and release each lease',async()=>{
    const f=folderFixture();await Promise.all([f.context.CanvasApi.moveCanvasToFolder('a','one'),f.context.CanvasApi.moveCanvasToFolder('a','')]);
    assert.deepEqual(f.calls.filter(([p])=>p.endsWith('/folder')).map(([,i])=>JSON.parse(i.body).folder_id),['one','']);
    assert.equal(f.held(),false);assert.equal(f.calls.filter(([p])=>p.endsWith('/release')).length,2);
});
test('moving an actively edited canvas reuses its lease and does not release editing',async()=>{
    const f=fixture();await f.mount();await f.api.active.lease.start(async()=>({revision:3}));const entry=f.api.active;
    f.context.fetch=async(path,init)=>{f.calls.push([path,init]);return reply({canvas:{id:'a',folder_id:'one',revision:4}});};
    await f.context.CanvasApi.moveCanvasToFolder('a','one');
    assert.equal(f.api.active,entry);assert.equal(entry.lease.canEdit,true);assert.equal(entry.lease.revision,4);
    assert.equal(f.calls.filter(([p])=>p.endsWith('/acquire')).length,1);assert.equal(f.calls.some(([p])=>p.endsWith('/release')),false);
});

test('directory rename acquires a lease and returns the saved title',async()=>{
 const f=folderFixture();const result=await f.context.CanvasApi.patchCanvasMeta('a',{title:'新名称'});
 assert.equal(result.canvas.title,'新名称');assert.equal(result.canvas.revision,4);assert.equal(f.held(),false);assert.equal(f.api.active,null);
});
test('directory rename cannot take over an active editor',async()=>{
 const f=folderFixture({locked:true});await assert.rejects(f.context.CanvasApi.patchCanvasMeta('a',{title:'新名称'}),/已有成员正在编辑/);assert.equal(f.calls.length,1);
});

test('trash restore acquires a short lease without opening a deleted canvas and releases the new revision',async()=>{
 const f=folderFixture();const result=await f.context.CanvasApi.restoreCanvas('a');
 assert.equal(result.ok,true);assert.equal((await result.json()).canvas.revision,4);
 assert.equal(f.api.active,null);assert.equal(f.held(),false);
 assert.deepEqual(f.calls.map(([path])=>path),['/api/canvases/a/edit-lease/acquire','/api/canvases/a/restore','/api/canvases/a/edit-lease','/api/canvases/a/edit-lease/release']);
 assert.deepEqual(JSON.parse(f.calls[0][1].body),{});
 await assert.rejects(f.context.CanvasApi.saveCanvas('a',{nodes:[]}));
});

test('trash restore cannot take over another editor or bypass server permissions',async()=>{
 const locked=folderFixture({locked:true});await assert.rejects(locked.context.CanvasApi.restoreCanvas('a'),/已有成员正在编辑/);assert.equal(locked.calls.length,1);
 const denied=folderFixture({writeStatus:403});const result=await denied.context.CanvasApi.restoreCanvas('a');assert.equal(result.status,403);assert.equal(denied.held(),false);
 assert.ok(denied.calls.at(-1)[0].endsWith('/release'));
});

test('failed occupancy refresh is explicit and manual recovery never acquires a lease',async()=>{
    const f=fixture();await f.mount();await new Promise(setImmediate);
    const entry=f.api.active,transport=entry.lease.transport;
    entry.lease.status={...status,holder:{id:'other',display_name:'乙',is_self:false}};
    entry.lease.emit();assert.match(entry.label.textContent,/乙 正在编辑/);
    entry.lease.transport=async()=>{throw new Error('offline');};
    const tick=[...f.timers].find(([id])=>f.delays.get(id)===15000)[1];
    await tick();await new Promise(setImmediate);assert.equal(entry.label.textContent,'占用状态待确认');
    assert.match(entry.notice.textContent,/刷新占用状态/);
    const all=node=>[node,...(node.children||[]).flatMap(all)];
    const refresh=all(entry.bar).find(node=>node.textContent==='刷新占用状态');
    assert.ok(refresh);entry.lease.transport=transport;
    await refresh.onclick();
    assert.equal(entry.label.textContent,'查看模式 · 无人编辑');
    assert.equal(entry.stateError,'');assert.equal(entry.feedback,'');
    assert.equal(entry.begin.hidden,false);assert.equal(entry.lease.canEdit,false);
    assert.equal(f.calls.some(([path])=>path.endsWith('/acquire')),false);
});
