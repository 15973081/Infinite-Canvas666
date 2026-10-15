const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('static/js/member-session.js', 'utf8');

class Node {
    constructor(tag) { this.tag = tag; this.children = []; this.events = {}; this.classList = {add(){},remove(){}}; }
    append(...nodes) { for (const node of nodes) { this.children.push(node); if (node && typeof node === 'object') node.parent = this; } }
    setAttribute() {}
    removeAttribute() {}
    focus() {}
    contains(target) { return target===this || this.children.some(child=>child.contains?.(target)); }
    querySelectorAll(selector) { return this.children.flatMap(child=>[...(selector==='button' && child.tag==='button' ? [child] : []),...(child.querySelectorAll?.(selector)||[])]); }
    querySelector() { return null; }
    addEventListener(name, fn) { this.events[name] = fn; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
}
function harness({member='alice', selected='space_a', parent, search='', pathname='/static/canvas.html', failBusiness=false, accountFailure=null}={}) {
    const calls=[], body=new Node('body'), nodes=[], store=new Map(), frames=[], server={workspaceFailure:false};
    if (selected) store.set('canvas:workspace:' + member, selected);
    const spaces = [{id:'space_a',name:'A',permissions:['canvas.read']},{id:'space_b',name:'B',permissions:['canvas.edit']}];
    const location = {href:'http://localhost'+pathname + search, origin:'http://localhost',host:'localhost',pathname,search,replace(){},assign(){},reload(){}};
    const document = {addEventListener(){},removeEventListener(){},readyState:'complete',body,documentElement:new Node('html'),createElement(tag){const node = new Node(tag);nodes.push(node);return node;}, querySelectorAll(selector){return selector==='iframe' ? frames : [];}};
    const window = {location,document,events:{},addEventListener(name,fn){this.events[name]=fn;},removeEventListener(){},dispatchEvent(event){this.events[event.type]?.(event);},alert(){},fetch:async (url,init={}) => {
        calls.push({url:String(url),init});
        const path = new URL(url instanceof Request ? url.url : String(url),location.href).pathname;
        if (accountFailure && path === accountFailure.path) return Response.json({detail:{code:accountFailure.code}},{status:accountFailure.status});
        if (path === '/api/auth/status') return Response.json({authenticated:true,mode:'members',member:{id:member,display_name:member,avatar:''}});
        if (path === '/api/auth/workspaces') {
            if(server.workspaceFailure)throw new Error('network unavailable');
            return Response.json({workspaces:spaces});
        }
        return failBusiness ? Response.json({detail:{code:'member_identity_changed'}},{status:409}) : Response.json({ok:true});
    }};
    window.parent=parent || window;
    const context={window,document,location,URL,URLSearchParams,Request,Headers,Response,AbortSignal,Promise,
        CustomEvent:class {constructor(type,init){this.type=type;this.detail=init?.detail;}},
        sessionStorage:{getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)}};
    vm.runInNewContext(source,context);
    return {window,calls,nodes,store,frames,spaces,server};
}
async function settle(){for(let i=0;i<20;i++) await new Promise(resolve=>setImmediate(resolve));}

for(const origin of ['parent','child']) test(`session pause from ${origin} freezes the entire embedded workbench once`,async()=>{
    const root=harness();await root.window.CanvasSession.ready;
    const child=harness({parent:root.window}), sibling=harness({parent:root.window});
    root.frames.push({contentWindow:child.window},{contentWindow:sibling.window},
        {get contentWindow(){throw new Error('foreign frame');}});
    await Promise.all([child.window.CanvasSession.ready,sibling.window.CanvasSession.ready]);
    const pages=[root,child,sibling], events=new Map();
    for(const page of pages)page.window.addEventListener('member-session:paused',()=>events.set(page,(events.get(page)||0)+1));
    await (origin==='parent'?root:child).window.CanvasSession.pause('登录已失效');
    await settle();
    for(const page of pages){
        assert.equal(page.window.CanvasSession.paused,true);
        assert.equal(events.get(page),1);
        await assert.rejects(page.window.fetch('/api/canvases'),/暂停/);
        assert.equal(page.nodes.filter(node=>node.className==='member-session-banner').length,1);
    }
});

test('new embedded pages cannot inherit a paused workbench session',async()=>{
    const root=harness();await root.window.CanvasSession.ready;
    await root.window.CanvasSession.pause('登录已失效');
    const child=harness({parent:root.window});
    await assert.rejects(child.window.CanvasSession.ready,/暂停/);
    await assert.rejects(child.window.fetch('/api/canvases'),/暂停/);
    assert.equal(child.calls.some(call=>call.url==='/api/canvases'),false);
});

for(const change of ['revoked','downgraded','upgraded'])test(`focus rechecks ${change} workspace access without silently changing the active context`,async()=>{
    const h=harness({selected:'space_b'});await h.window.CanvasSession.ready;
    if(change==='revoked')h.spaces.pop();
    else h.spaces[1].permissions=change==='downgraded'?['canvas.read']:['canvas.read','canvas.edit'];
    await h.window.events.focus();
    assert.equal(h.window.CanvasSession.paused,true);
    assert.deepEqual(Array.from(h.window.CanvasSession.context.workspace.permissions),['canvas.edit']);
    await assert.rejects(h.window.fetch('/api/canvases'),/暂停/);
});

test('opening or refreshing the space menu detects revoked membership',async()=>{
    for(const refresh of [false,true]){
        const h=harness();await h.window.CanvasSession.ready;
        h.spaces.shift();
        if(refresh)await h.nodes.find(node=>node.tag==='button'&&node.textContent==='刷新空间列表').events.click();
        else {const menu=h.nodes.find(node=>node.className==='member-session-spaces');menu.open=true;menu.events.toggle();await settle();}
        assert.equal(h.window.CanvasSession.paused,true);
    }
});

test('temporary workspace lookup failures preserve identity and can be retried on focus',async()=>{
    const h=harness();await h.window.CanvasSession.ready;
    h.server.workspaceFailure=true;await h.window.events.focus();
    assert.equal(h.window.CanvasSession.paused,false);
    h.server.workspaceFailure=false;h.spaces.shift();await h.window.events.focus();
    assert.equal(h.window.CanvasSession.paused,true);
});

test('workspace labels and permission order may change without pausing an equivalent grant',async()=>{
    const h=harness();h.spaces[0].permissions=['canvas.edit','canvas.read'];await h.window.CanvasSession.ready;
    h.spaces[0].permissions=['canvas.read','canvas.edit'];h.spaces[0].name='Renamed';
    await h.window.events.focus();assert.equal(h.window.CanvasSession.paused,false);
});

test('canonical page workspace overrides remembered space and refuses conflicting query',async()=>{
    const h=harness({selected:'space_b',pathname:'/workspaces/space_a/canvases/one'});
    await h.window.CanvasSession.ready;
    assert.equal(h.window.CanvasSession.context.workspace.id,'space_a');
    const conflict=harness({pathname:'/workspaces/space_a/canvases/one',search:'?workspace=space_b'});
    await assert.rejects(conflict.window.CanvasSession.ready,/不一致/);
});

test('personal data routes remain account scoped without workspace injection',async()=>{
    const h=harness();await h.window.CanvasSession.ready;
    for(const path of ['/api/account/data','/api/account/data/export']){
        await h.window.fetch(path,{method:path.endsWith('/export')?'POST':'GET',headers:{'X-Member-ID':'alice'}});
        const call=h.calls.at(-1),headers=new Headers(call.init.headers);
        assert.equal(headers.get('X-Member-ID'),'alice');assert.equal(headers.has('X-Workspace-ID'),false);
        assert.equal(new URL(call.url,'http://localhost').searchParams.has('workspace'),false);
    }
});

test('query-bound media reads keep credentials and selectors without redirecting member headers',async()=>{
    const h=harness();await h.window.CanvasSession.ready;
    for(const path of ['/assets/cloud/photo.png','/output/photo.png','/api/media-preview','/api/media/ast_'+'a'.repeat(32)+'/content']){
        const url=path+'?workspace=space_a&member=alice';
        await h.window.fetch(new Request('http://localhost'+url),{headers:{'X-Member-ID':'alice','X-Workspace-ID':'space_a',Range:'bytes=0-9'}});
        const call=h.calls.at(-1);
        assert.equal(call.init.credentials,'same-origin');
        assert.equal(call.init.headers.has('X-Member-ID'),false);
        assert.equal(call.init.headers.has('X-Workspace-ID'),false);
        assert.equal(call.init.headers.get('Range'),'bytes=0-9');
    }
    for(const [url,init] of [['/assets/cloud/photo.png',{}],['/api/canvases?workspace=space_a&member=alice',{}],['/assets/cloud/photo.png?workspace=space_a&member=alice',{method:'POST'}]]){
        await h.window.fetch(url,init);
        assert.equal(h.calls.at(-1).init.headers.get('X-Member-ID'),'alice');
    }
});

test('media reads reject foreign or duplicate bindings and still pause on identity rejection',async()=>{
    const h=harness();await h.window.CanvasSession.ready;
    const count=h.calls.length;
    for(const query of ['workspace=space_b&member=alice','workspace=space_a&member=bob','workspace=space_a&member=alice&member=alice','workspace=space_a&workspace=space_a&member=alice']){
        await assert.rejects(h.window.fetch('/assets/cloud/photo.png?'+query,{headers:{'X-Workspace-ID':'space_a'}}),/不一致/);
    }
    assert.equal(h.calls.length,count);
    const rejected=harness({failBusiness:true});await rejected.window.CanvasSession.ready;
    await rejected.window.fetch('/assets/cloud/photo.png?workspace=space_a&member=alice');
    assert.equal(rejected.window.CanvasSession.paused,true);
    await assert.rejects(rejected.window.fetch('/assets/cloud/photo.png?workspace=space_a&member=alice'),/暂停/);
});

test('business calls wait for explicit first space selection and bind member and workspace', async () => {
    const h=harness({selected:null});
    const request=h.window.fetch('/api/canvases');
    await settle();
    assert.equal(h.calls.some(c=>c.url==='/api/canvases'),false);
    const choice=h.nodes.find(n=>n.tag==='button'&&n.textContent==='B');
    assert.ok(choice);
    await choice.events.click(); await request;
    const call=h.calls.find(c=>c.url==='/api/canvases');
    assert.equal(call.init.headers.get('X-Workspace-ID'),'space_b');
    assert.equal(call.init.headers.get('X-Member-ID'),'alice');
    assert.equal(h.store.get('canvas:workspace:alice'),'space_b');
});

test('stored selection is keyed to the member and a foreign explicit URL does not fall back', async () => {
    const h=harness({selected:'space_b',search:'?workspace=foreign'});
    await assert.rejects(h.window.CanvasSession.ready,/未被分配/);
    assert.equal(h.calls.some(c=>c.url==='/api/canvases'),false);
});

test('iframes inherit the parent selected space and storage namespaces include member and space', async () => {
    const parent=harness({selected:'space_b'}); await parent.window.CanvasSession.ready;
    const child=harness({parent:parent.window,selected:'space_a'}); await child.window.CanvasSession.ready;
    await child.window.fetch('/api/history');
    assert.equal(child.calls.at(-1).init.headers.get('X-Workspace-ID'),'space_b');
    assert.equal(child.window.CanvasSession.storageKey('draft'),'canvas-member:alice:space_b:draft');
    assert.equal(new URL(child.window.CanvasSession.socketUrl('ws://localhost/ws/stats?client_id=old')).searchParams.get('member'),'alice');
});

test('a changed identity in a child frame fails before business requests', async () => {
    const parent=harness(); await parent.window.CanvasSession.ready;
    const child=harness({member:'bob',parent:parent.window});
    await assert.rejects(child.window.CanvasSession.ready,/账号已改变/);
});

test('explicit foreign workspace is refused and external requests receive no member headers', async () => {
    const h=harness(); await h.window.CanvasSession.ready;
    await assert.rejects(h.window.fetch('/api/canvases?workspace=space_b'),/空间/);
    await assert.rejects(h.window.fetch('/api/canvases',{headers:{'X-Workspace-ID':'space_b'}}),/空间/);
    await h.window.fetch('https://supplier.invalid/public',{method:'GET'});
    assert.equal(h.calls.at(-1).init.headers,undefined);
    assert.equal(h.calls.at(-1).init.credentials,undefined);
});

test('account mismatch response pauses later calls without erasing the page', async () => {
    const h=harness({failBusiness:true}); await h.window.CanvasSession.ready;
    assert.equal((await h.window.fetch('/api/canvases')).status,409);
    assert.equal(h.window.CanvasSession.paused,true);
    const count=h.calls.length;
    await assert.rejects(h.window.fetch('/api/canvases',{method:'PUT'}),/暂停/);
    assert.equal(h.calls.length,count);
    assert.ok(h.nodes.some(n=>n.className==='member-session-banner'));
});

test('space dropdown preserves the page until saving succeeds and drops old canvas IDs',async()=>{
    const h=harness({search:'?workspace=space_a&id=old&canvas_id=old'});await h.window.CanvasSession.ready;
    let destination='',saves=0;
    h.window.location.assign=value=>destination=value;
    h.window.FrontendVersion={flushPages:async()=>{saves++;return false;}};
    const menu=h.nodes.find(n=>n.className==='member-session-spaces');
    menu.open=true;menu.events.toggle();await settle();
    assert.equal(h.nodes.some(n=>n.className==='member-session-panel'),false);
    const options=h.nodes.filter(n=>n.className==='member-space-option');
    await options[0].events.click();assert.equal(saves,0);assert.equal(destination,'');
    await options[1].events.click();assert.equal(destination,'');assert.equal(h.store.get('canvas:workspace:alice'),'space_a');
    assert.match(h.nodes.find(n=>n.className==='member-space-message').textContent,/保存尚未完成/);
    h.window.FrontendVersion.flushPages=async()=>true;
    await options[1].events.click();assert.equal(destination,'/workspaces/space_b');
});

test('logout forgets the space only after saving succeeds; refresh still restores selection',async()=>{
    const h=harness({selected:'space_b'});
    assert.equal((await h.window.CanvasSession.ready).workspace.id,'space_b');
    assert.equal(h.nodes.some(n=>n.className==='member-session-panel'),false);
    let destination='';
    h.window.location.assign=value=>destination=value;
    const logout=h.nodes.find(n=>n.tag==='button'&&n.textContent==='退出登录');
    h.window.FrontendVersion={flushPages:async()=>false};
    await logout.events.click();
    assert.equal(h.store.get('canvas:workspace:alice'),'space_b');
    assert.equal(h.calls.some(c=>c.url==='/api/auth/logout'),false);
    h.window.FrontendVersion.flushPages=async()=>true;
    await logout.events.click();
    assert.equal(h.store.has('canvas:workspace:alice'),false);
    assert.equal(destination,'/login');
    const next=harness({selected:h.store.get('canvas:workspace:alice') || null});
    await settle();
    assert.ok(next.nodes.some(n=>n.tag==='h1'&&n.textContent==='选择工作空间'));
    await next.nodes.find(n=>n.tag==='button'&&n.textContent==='A').events.click();
    assert.equal((await next.window.CanvasSession.ready).workspace.id,'space_a');
});

for(const [path,status,code] of [
    ['/api/account/billing',401,'authentication_required'],
    ['/api/account/data',409,'member_identity_changed'],
    ['/api/auth/profile',401,'authentication_required']
]) test(`account endpoint ${path} pauses expired sessions without adding workspace headers`,async()=>{
    const h=harness({accountFailure:{path,status,code}});await h.window.CanvasSession.ready;
    const response=await h.window.fetch(path);
    assert.equal(response.status,status);assert.equal(h.window.CanvasSession.paused,true);
    assert.equal(new Headers(h.calls.find(call=>call.url===path).init.headers).has('X-Workspace-ID'),false);
    assert.equal((await response.json()).detail.code,code,'observing errors preserves the response body');
    await assert.rejects(h.window.fetch('/api/canvases'),/暂停/);
    assert.equal(h.nodes.filter(n=>n.className==='member-session-banner').length,1);
});

test('ordinary account permission denial does not expire the login',async()=>{
    const h=harness({accountFailure:{path:'/api/account/billing',status:403,code:'permission_denied'}});
    await h.window.CanvasSession.ready;await h.window.fetch('/api/account/billing');
    assert.equal(h.window.CanvasSession.paused,false);
});

test('reopening a recovered login still waits for unsaved content protection',async()=>{
    const h=harness();await h.window.CanvasSession.ready;
    await h.window.CanvasSession.pause('登录已失效');
    await h.nodes.find(n=>n.tag==='button'&&n.textContent==='重新检查登录').events.click();
    const reopen=h.nodes.find(n=>n.tag==='button'&&n.textContent==='重新打开');
    let reloads=0;h.window.location.reload=()=>reloads++;
    h.window.FrontendVersion={flushPages:async()=>false};
    await reopen.events.click();assert.equal(reloads,0);
    assert.ok(h.nodes.some(n=>n.textContent?.includes('当前更改尚未保存')));
    h.window.FrontendVersion.flushPages=async()=>true;
    await reopen.events.click();assert.equal(reloads,1);
});
