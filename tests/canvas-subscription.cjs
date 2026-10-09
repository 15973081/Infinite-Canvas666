const test=require('node:test');
const assert=require('node:assert/strict');
const Subscription=require('../static/js/canvas-subscription.js');
const settle=()=>new Promise(setImmediate);
const state=(extra={})=>({type:'canvas_state',workspace_id:'space',canvas_id:'a',sequence:1,revision:3,generation:2,stamp:'one',maintenance:{mode:'normal'},...extra});
function fixture(){
    const sockets=[],messages=[],errors=[],timers=new Map();let serial=0,valid=true;
    const subscription=new Subscription({id:'a',workspace:'space',url:'ws://canvas.test/ws/canvases/a?workspace=space&member=me',
        onChange:value=>messages.push(value),onDisconnect:value=>errors.push(value),valid:()=>valid,
        delay:(fn,ms)=>{timers.set(++serial,{fn,ms});return serial;},cancel:id=>timers.delete(id),
        socketFactory:url=>{const socket={url,close(code=1006){this.closed=true;this.onclose?.({code});}};sockets.push(socket);return socket;}});
    const send=(value,socket=sockets.at(-1))=>socket.onmessage({data:JSON.stringify(value)});
    subscription.start();return {subscription,sockets,messages,errors,timers,send,setValid:value=>valid=value};
}
test('only the bound canvas and workspace with increasing sequence can notify',async()=>{
    const f=fixture();
    for(const extra of [{canvas_id:'b'},{workspace_id:'other'},{sequence:0},{revision:-1},{generation:'2'},{type:'canvas_updated'}])f.send(state(extra));
    await settle();assert.equal(f.messages.length,0);
    f.send(state());f.send(state({sequence:1,revision:4}));await settle();assert.equal(f.messages.length,1);
    f.send(state({sequence:2,stamp:'two'}));await settle();assert.equal(f.messages.length,2);
});
test('reconnection accepts a new sequence baseline and ignores callbacks from the old socket',async()=>{
    const f=fixture();f.send(state());await settle();const old=f.sockets[0];old.close();
    assert.equal(f.errors.length,1);f.timers.get(f.subscription.retry).fn();
    f.send(state({sequence:500,revision:100}),old);
    f.send(state({sequence:1,revision:4,stamp:'new'}));await settle();
    assert.deepEqual(f.messages.map(v=>v.revision),[3,4]);
    assert.equal(f.sockets[1].url,f.sockets[0].url);
});
test('replayed or rolled-back generations cannot overwrite newer state even after reconnect',async()=>{
    for(const extra of [{revision:2},{generation:1}]){
        const f=fixture();f.send(state());await settle();f.sockets[0].close();f.timers.get(f.subscription.retry).fn();
        f.send(state(extra));await settle();assert.equal(f.messages.length,1);assert.equal(f.subscription.stopped,true);
        assert.match(f.errors.at(-1),/版本发生回退/);
    }
});
test('heartbeats keep transport live without repeatedly refreshing the document',async()=>{
    const f=fixture();assert.equal(f.subscription.healthy,false);f.send(state());await settle();const first=f.subscription.watchdog;
    assert.equal(f.subscription.healthy,true);
    f.send(state({sequence:2}));await settle();assert.equal(f.messages.length,1);assert.equal(f.timers.has(first),false);
    f.timers.get(f.subscription.watchdog).fn();assert.equal(f.sockets[0].closed,true);assert.equal(f.errors.length,1);
    assert.equal(f.subscription.healthy,false);
});
test('intentional stop and account changes suppress old callbacks; revoked subscriptions do not retry',async()=>{
    const f=fixture();f.setValid(false);f.send(state());await settle();assert.equal(f.messages.length,0);
    f.subscription.stop();f.sockets[0].onclose({code:1006});assert.equal(f.errors.length,0);
    const other=fixture();other.sockets[0].close(1008);assert.equal(other.subscription.stopped,true);
    assert.equal(other.timers.size,0);assert.match(other.errors[0],/权限已失效/);
});

test('default browser timers are called without a subscription receiver',()=>{
    const vm=require('node:vm');
    const source=require('node:fs').readFileSync(require.resolve('../static/js/canvas-subscription.js'),'utf8');
    let scheduled=0,cancelled=0;
    const context={window:{},setTimeout:function(){'use strict';assert.equal(this,undefined);scheduled++;return 1;},
        clearTimeout:function(){'use strict';assert.equal(this,undefined);cancelled++;}};
    vm.runInNewContext(source,context);
    const subscription=new context.window.CanvasSubscription({id:'a',workspace:'space',url:'ws://test',onChange:()=>{},socketFactory:()=>({close(){}})});
    subscription.start();subscription.stop();assert.equal(scheduled,1);assert.ok(cancelled>=2);
});
