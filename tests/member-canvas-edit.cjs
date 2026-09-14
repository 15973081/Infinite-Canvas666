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
    const calls=[],records=new Map(),queries=[],listeners=new Map(),timers=new Map(),downloads=[]; let sequence=0;
    const element=(tag='div')=>({tagName:tag.toUpperCase(),value:'',children:[],classList:{toggle(){},remove(){}},setAttribute(){},append(...items){this.children.push(...items);},addEventListener(){},remove(){this.removed=true;},click(){downloads.push(this.download);},showModal(){},close(){},querySelectorAll(selector){return this.children.filter(node=>node.tagName===selector.toUpperCase());}});
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
        setTimeout(fn){timers.set(++sequence,fn);return sequence;},clearTimeout(id){timers.delete(id);},
        addEventListener(name,fn){listeners.set(name,fn);},
        CanvasSession:{enabled:true,context:{member:{id:'member'},workspace:{id:'space',permissions:['canvas.read','canvas.edit']}}},
        fetch:async(path,init={})=>{calls.push([path,init]);
            if(path.endsWith('/acquire'))return reply({...status,edit_token:'secret-lease-proof'});
            if(path.endsWith('/renew'))return reply(status);
            if(path.endsWith('/edit-lease/transfers'))return reply({lease:{...status,holder:null},requests:[]});
            if(path.endsWith('/edit-lease'))return reply({...status,holder:null});
            if(init.method==='PUT')return reply({canvas:{revision:4}});
            return reply({id:'created'});
        }};
    context.window=context;context.parent=context;
    context.CanvasEditLease=class extends Lease {constructor(options){super({...options,fetch:context.fetch,now:()=>0});}};
    vm.createContext(context);vm.runInContext(source,context);vm.runInContext(apiSource,context);
    return {context,calls,records,queries,listeners,timers,downloads,database,api:context.MemberCanvasEdit,
        mount:()=>context.MemberCanvasEdit.mount({id:'a',dirty:()=>false,snapshot:()=>({id:'a',kind:'classic',revision:3,nodes:[],connections:[]}),reload:async()=>({revision:3}),flush:async()=>true})};
}
test('opening a member canvas only observes; saves require explicit start',async()=>{
    const f=fixture();await f.mount();await new Promise(setImmediate);
    assert.equal(f.calls.length,1);assert.equal(f.calls[0][0],'/api/canvases/a/edit-lease/transfers');
    await assert.rejects(f.context.CanvasApi.saveCanvas('a',{nodes:[]}));
    assert.equal(f.calls.length,1);
    await f.api.active.lease.start(async()=>({revision:3}));
    const response=await f.context.CanvasApi.saveCanvas('a',{nodes:[],base_revision:99});
    assert.equal(response.ok,true);
    const init=f.calls.at(-1)[1];assert.equal(new Headers(init.headers).get('X-Canvas-Edit-Token'),'secret-lease-proof');
    assert.equal(JSON.parse(init.body).base_revision,3);assert.equal(f.api.active.lease.revision,4);
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
    await f.api.active.bar.children.find(node=>node.textContent==='本地草稿').onclick();
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
const action=(node,label)=>node.children.find(child=>child.textContent===label);
async function draftLine(f) {
    await action(f.api.active.bar,'本地草稿').onclick();
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
    await action(line,'导出').onclick();assert.equal(f.downloads.length,0);assert.match(line.children.at(-1).textContent,/成员或空间/);
    f.api.active.options.dirty=()=>true;f.api.active.lease.pause('account changed');await new Promise(setImmediate);
    assert.equal([...f.records.values()].every(row=>row.member_id==='member'),true);
});
test('an unsaved paused page can leave only after explicit export confirmation',async()=>{
    const f=fixture();await f.mount();f.api.active.options.dirty=()=>true;
    f.api.active.lease.pause('offline');
    const operation=f.api.leave();await confirmLatest(f,'导出并离开');
    assert.equal(await operation,true);assert.equal(f.api.active,null);assert.equal(f.downloads.length,1);assert.equal(f.records.size,1);
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
test('opening a confirmed copy preserves and exports unsaved original-page changes first',async()=>{
    const f=fixture();await f.mount();enableCopy(f);seedDraft(f);let opened;
    f.api.active.options.dirty=()=>true;f.api.active.options.openCopy=async copy=>{opened=copy;};
    f.context.fetch=async()=>copyReply();
    const line=await draftLine(f),operation=action(line,'另存副本').onclick();
    await confirmLatest(f,'确认另存副本');await operation;
    assert.equal(opened,undefined);assert.ok(f.api.active);assert.equal(f.api.active.options.dirty(),true);
    const opening=action(line,'打开副本').onclick();await confirmLatest(f,'导出并离开');await opening;
    assert.equal(opened.id,'new-copy');assert.equal(f.api.active,null);assert.equal(f.downloads.length,1);
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
