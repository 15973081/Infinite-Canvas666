const test=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../static/js/studio-frame-messages.js');
function target(){const handlers=new Map();return {handlers,
    addEventListener(type,fn){if(!handlers.has(type))handlers.set(type,new Set());handlers.get(type).add(fn);},
    removeEventListener(type,fn){handlers.get(type)?.delete(fn);},
    emit(type,event={}){for(const fn of handlers.get(type)||[])fn(event);}};}
function fixture(child=false){
    const posts=[],channels=[],errors=[],frames=[target(),target()];let active=frames[0];
    for(const [i,frame] of frames.entries())frame.contentWindow={postMessage:(data,origin)=>posts.push({i,data,origin})};
    const window=Object.assign(target(),{location:{origin:'https://studio.test'},reportError:e=>errors.push(e),
        document:{querySelectorAll:()=>frames,querySelector:()=>active},
        BroadcastChannel:class{constructor(name){this.name=name;channels.push(this);}close(){this.closed=true;}}});
    window.parent=child?{}:window;const api=create(window);
    const message=(type,more={})=>window.emit('message',{origin:window.location.origin,source:child?window.parent:frames[0].contentWindow,data:{type},...more});
    return {api,window,frames,posts,channels,errors,message,setActive:frame=>active=frame};
}
for(const type of ['cloud_status','canvas_updated'])test(type+' goes only to the page active at send time',()=>{
    const f=fixture(),data={type,data:{id:'a'}};f.api.forwardUpdate(data);f.setActive(f.frames[1]);f.api.forwardUpdate(data);
    assert.deepEqual(f.posts.map(p=>p.i),[0,1]);assert.ok(f.posts.every(p=>p.data===data&&p.origin==='https://studio.test'));
});
for(const type of ['asset_library_updated'])test(type+' includes background pages',()=>{
    const f=fixture();f.api.forwardUpdate({type});assert.deepEqual(f.posts.map(p=>p.i),[0,1]);
});

test('retired editing-lock messages are not delivered to frames',()=>{
    const f=fixture();
    for(const type of ['canvas_locked','canvas_unlocked'])assert.equal(f.api.send(f.frames[0],{type}),false);
    assert.equal(f.posts.length,0);
});
test('unknown protocol and removed frames cannot receive messages',()=>{
    const f=fixture();assert.equal(f.api.send(f.frames[0],{type:'unknown'}),false);
    const old=f.frames.pop();assert.equal(f.api.send(old,{type:'studio-ui-scale'}),false);f.api.forwardUpdate({type:'studio-ui-scale'});assert.equal(f.posts.length,0);
});
for(const child of [false,true])test('receiver validates origin and '+(child?'parent':'owned iframe')+' source',()=>{
    const f=fixture(child);let count=0;f.api.subscribe(['studio-lang'],()=>count++);
    f.message('studio-lang');f.message('studio-lang',{origin:''});f.message('studio-lang',{origin:'https://foreign.test'});
    f.message('studio-lang',{source:{}});f.message('unknown');f.window.emit('message',{origin:'https://studio.test',source:null,data:null});assert.equal(count,1);
    if(!child){const source=f.frames.pop().contentWindow;f.message('studio-lang',{source});assert.equal(count,1);}
});
test('same callback binds once and explicit unsubscribe removes it',()=>{
    const f=fixture();let count=0;const fn=()=>count++;f.api.subscribe(['studio-lang'],fn);const off=f.api.subscribe(['studio-lang'],fn);
    f.message('studio-lang');off();f.message('studio-lang');assert.equal(count,1);assert.throws(()=>f.api.subscribe(['unknown'],fn),TypeError);
});
test('consumer failure does not suppress other consumers',()=>{
    const f=fixture();let count=0;f.api.subscribe(['studio-lang'],()=>{throw Error('consumer');});f.api.subscribe(['studio-lang'],()=>count++);
    f.message('studio-lang');assert.equal(count,1);assert.equal(f.errors.length,1);
});
test('API payload is unchanged and missing BroadcastChannel remains supported',()=>{
    const f=fixture();const data={type:'existing-channel-payload',extra:1};let received;
    const off=f.api.subscribeApi(event=>received=event.data);f.channels[0].onmessage({data});assert.equal(received,data);off();assert.equal(f.channels[0].closed,true);
    delete f.window.BroadcastChannel;assert.doesNotThrow(()=>f.api.subscribeApi(()=>{}));
});
test('cached exit pauses channels and load listeners, resume rejects old callbacks',()=>{
    const f=fixture();let count=0,loaded=0;const fn=()=>loaded++;f.api.subscribe(['studio-lang'],()=>count++);f.api.subscribeApi(()=>count++);
    f.api.watchFrameLoads(fn);f.api.watchFrameLoads(fn);assert.equal(f.frames[0].handlers.get('load').size,1);
    const old=f.channels[0].onmessage,load=[...f.frames[0].handlers.get('load')][0];f.window.emit('pagehide',{persisted:true});
    f.message('studio-lang');old({data:{type:'providers-changed'}});load();f.api.broadcast({type:'studio-lang'});
    assert.equal(count,0);assert.equal(loaded,0);assert.equal(f.posts.length,0);assert.equal(f.channels[0].closed,true);
    f.window.emit('pageshow',{persisted:true});f.window.emit('pageshow',{persisted:true});old({data:{}});load();
    f.message('studio-lang');f.channels[1].onmessage({data:{}});f.frames[0].emit('load');assert.equal(count,2);assert.equal(loaded,1);assert.equal(f.channels.length,2);
});
test('permanent exit releases own listeners and cannot be restarted',()=>{
    const f=fixture();let count=0;const unrelated=()=>count++;f.window.addEventListener('message',unrelated);
    f.api.subscribeApi(()=>count++);f.api.watchFrameLoads(()=>count++);const old=f.channels[0].onmessage;
    f.window.emit('pagehide',{persisted:false});f.api.destroy();f.api.resume();f.api.subscribeApi(()=>count++);old({data:{}});
    assert.equal(count,0);assert.equal(f.window.handlers.get('message').size,1);assert.equal(f.window.handlers.get('pagehide').size,0);
    assert.equal(f.frames[0].handlers.get('load').size,0);assert.equal(f.api.send(f.frames[0],{type:'canvas-focus'}),false);
    assert.ok(Object.isFrozen(f.api));assert.ok(Object.isFrozen(f.api.state));
});
