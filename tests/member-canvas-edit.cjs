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
    const calls=[],records=new Map(),queries=[],listeners=new Map(),timers=new Map(); let sequence=0;
    const element=(tag='div')=>({tagName:tag.toUpperCase(),value:'',children:[],classList:{toggle(){}},setAttribute(){},append(...items){this.children.push(...items);},addEventListener(){},remove(){},showModal(){},close(){},querySelectorAll(selector){return this.children.filter(node=>node.tagName===selector.toUpperCase());}});
    const database={transaction(){
        const transaction={objectStore:()=>({put(value){records.set(value.key,structuredClone(value));return {result:value.key};},getAll(range){queries.push(range);return {result:[...records.values()].filter(row=>row.key>=range.lower && row.key<=range.upper)};}})};
        queueMicrotask(()=>transaction.oncomplete?.());return transaction;
    }};
    const context={window:null,module:undefined,URL,Headers,AbortSignal,Blob,console,crypto:webcrypto,queueMicrotask,
        location:{origin:'http://canvas.local',href:'http://canvas.local/static/canvas.html'},
        indexedDB:{open(){const request={result:database};queueMicrotask(()=>request.onsuccess());return request;}},
        IDBKeyRange:{bound:(lower,upper)=>({lower,upper})},
        document:{body:element(),querySelectorAll:()=>[],createElement:element},
        setTimeout(fn){timers.set(++sequence,fn);return sequence;},clearTimeout(id){timers.delete(id);},
        addEventListener(name,fn){listeners.set(name,fn);},
        CanvasSession:{enabled:true,context:{member:{id:'member'},workspace:{id:'space',permissions:['canvas.read','canvas.edit']}}},
        fetch:async(path,init={})=>{calls.push([path,init]);
            if(path.endsWith('/acquire'))return reply({...status,edit_token:'secret-lease-proof'});
            if(path.endsWith('/edit-lease/transfers'))return reply({lease:{...status,holder:null},requests:[]});
            if(path.endsWith('/edit-lease'))return reply({...status,holder:null});
            if(init.method==='PUT')return reply({canvas:{revision:4}});
            return reply({id:'created'});
        }};
    context.window=context;context.parent=context;
    context.CanvasEditLease=class extends Lease {constructor(options){super({...options,fetch:context.fetch,now:()=>0});}};
    vm.createContext(context);vm.runInContext(source,context);vm.runInContext(apiSource,context);
    return {context,calls,records,queries,listeners,timers,api:context.MemberCanvasEdit,
        mount:()=>context.MemberCanvasEdit.mount({id:'a',dirty:()=>false,snapshot:()=>({revision:3,nodes:[]}),reload:async()=>({revision:3}),flush:async()=>true})};
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
    assert.equal(await f.api.leave(),false);assert.ok(f.api.active);
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
