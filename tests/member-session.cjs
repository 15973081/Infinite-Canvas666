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
function harness({member='alice', selected='space_a', parent, search='', failBusiness=false}={}) {
    const calls=[], body=new Node('body'), nodes=[], store=new Map();
    if (selected) store.set('canvas:workspace:' + member, selected);
    const spaces = [{id:'space_a',name:'A',permissions:['canvas.read']},{id:'space_b',name:'B',permissions:['canvas.edit']}];
    const location = {href:'http://localhost/static/canvas.html' + search, origin:'http://localhost',host:'localhost',pathname:'/static/canvas.html',search,replace(){},assign(){},reload(){}};
    const document = {addEventListener(){},removeEventListener(){},readyState:'complete',body,documentElement:new Node('html'),createElement(tag){const node = new Node(tag);nodes.push(node);return node;}, querySelectorAll(){return [];}};
    const window = {location,document,events:{},addEventListener(name,fn){this.events[name]=fn;},removeEventListener(){},dispatchEvent(){},alert(){},fetch:async (url,init={}) => {
        calls.push({url:String(url),init});
        const path = new URL(url instanceof Request ? url.url : String(url),location.href).pathname;
        if (path === '/api/auth/status') return Response.json({authenticated:true,mode:'members',member:{id:member,display_name:member,avatar:''}});
        if (path === '/api/auth/workspaces') return Response.json({workspaces:spaces});
        return failBusiness ? Response.json({detail:{code:'member_identity_changed'}},{status:409}) : Response.json({ok:true});
    }};
    window.parent=parent || window;
    const context={window,document,location,URL,URLSearchParams,Request,Headers,Response,AbortSignal,Promise,
        CustomEvent:class {constructor(type,init){this.type=type;this.detail=init?.detail;}},
        sessionStorage:{getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value)}};
    vm.runInNewContext(source,context);
    return {window,calls,nodes,store};
}
async function settle(){for(let i=0;i<20;i++) await new Promise(resolve=>setImmediate(resolve));}

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
    await options[1].events.click();assert.equal(destination,'/static/canvas.html?workspace=space_b');
});
