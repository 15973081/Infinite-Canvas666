const test=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../static/js/studio-stats-connection.js');
let parseMessage;
test.before(async()=>({parseMessage}=await import('../static/js/studio-stats-codec.mjs')));
const settle=()=>new Promise(setImmediate);
function fixture({ready=()=>Promise.resolve(),failFactory=false,loadCodec=()=>Promise.resolve({parseMessage})}={}){
    const listeners=new Map(),timers=new Map(),sockets=[],events=[];let serial=0;
    const window={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
    const api=create({window,ready,loadCodec,address:()=> 'wss://studio.test/ws/stats?client_id=a&workspace=bound',
        delay:(fn,ms)=>{timers.set(++serial,{fn,ms});return serial;},cancel:id=>timers.delete(id),
        onOpen:value=>events.push(['open',value]),onMessage:value=>events.push(['message',value]),onUnavailable:()=>events.push(['unavailable']),
        socketFactory:url=>{if(failFactory)throw Error('constructor');const s={url,readyState:0,close(){this.readyState=3;this.onclose?.();}};sockets.push(s);return s;}});
    return {api,listeners,timers,sockets,events,open(s=sockets.at(-1)){s.readyState=1;s.onopen();},
        timer(ms){const entry=[...timers].find(([,value])=>value.ms===ms);assert.ok(entry,'timer '+ms);timers.delete(entry[0]);entry[1].fn();return entry;}};
}
test('parser keeps message body and rejects malformed/non-object envelopes',()=>{
    const data={type:'stats',online_members:3,nested:{unchanged:true}};assert.deepEqual(parseMessage(JSON.stringify(data)),data);
    for(const text of ['broken','null','[]','3','"stats"','{}','{"type":1}'])assert.equal(parseMessage(text),null);
});
test('session-ready startup and repeated start construct one scoped socket',async()=>{
    let release;const waiting=new Promise(r=>release=r),f=fixture({ready:()=>waiting});const first=f.api.start(),second=f.api.start();
    assert.equal(first,second);await settle();assert.equal(f.sockets.length,0);release();await first;
    assert.equal(f.sockets.length,1);assert.match(f.sockets[0].url,/workspace=bound/);f.open();await f.api.start();assert.equal(f.sockets.length,1);
    assert.deepEqual(f.events,[['open',false]]);assert.ok(Object.isFrozen(f.api));assert.ok(Object.isFrozen(f.api.state));
});
test('disconnect keeps 700ms notification and exact existing retry sequence with cap',async()=>{
    const f=fixture();await f.api.start();f.open();f.sockets[0].close();f.timer(700);assert.deepEqual(f.events.at(-1),['unavailable']);
    for(let i=0;i<8;i++){
        const ms=Math.min(10000,800*Math.pow(1.7,i));f.timer(ms);await settle();f.sockets.at(-1).close();
    }
    f.timer(10000);await settle();f.open();assert.equal(f.api.state.attempts,0);assert.deepEqual(f.events.at(-1),['open',true]);assert.equal(f.timers.size,0);
});
test('recovered connection before notice deadline avoids disconnect presentation',async()=>{
    const f=fixture();await f.api.start();f.sockets[0].close();const old=[...f.timers.values()].find(t=>t.ms===700).fn;
    await f.api.start();f.open();old();assert.equal(f.events.filter(e=>e[0]==='unavailable').length,0);
});
test('old socket callbacks cannot alter a replacement connection or deliver messages',async()=>{
    const f=fixture();await f.api.start();const first=f.sockets[0],old={open:first.onopen,message:first.onmessage,close:first.onclose,error:first.onerror};
    first.close();f.timer(800);await settle();f.open();const before=JSON.stringify(f.events),count=f.timers.size;
    old.open();old.close();old.error();old.message({data:'{"type":"stats","online_count":999}'});
    assert.equal(JSON.stringify(f.events),before);assert.equal(f.timers.size,count);assert.equal(f.api.isOpen(),true);
    f.sockets[1].onmessage({data:'{"type":"stats","online_count":2}'});assert.deepEqual(f.events.at(-1),['message',{type:'stats',online_count:2}]);
});
for(const permanent of [false,true])test((permanent?'permanent':'cached')+' exit during readiness ignores old completion',async()=>{
    let release;const waiting=new Promise(r=>release=r),f=fixture({ready:()=>waiting});const job=f.api.start();await settle();
    f.listeners.get('pagehide')({persisted:!permanent});release();await job;assert.equal(f.sockets.length,0);
    f.api.resume();await settle();assert.equal(f.sockets.length,permanent?0:1);
    if(permanent){await f.api.start();assert.equal(f.listeners.size,0);}
});
test('cache lifecycle cancels retry/notice, resumes once and rejects captured timers',async()=>{
    const f=fixture();await f.api.start();f.sockets[0].close();const old=[...f.timers.values()].map(t=>t.fn);
    f.listeners.get('pagehide')({persisted:true});assert.equal(f.timers.size,0);old.forEach(fn=>fn());await settle();assert.equal(f.sockets.length,1);
    f.listeners.get('pageshow')({persisted:true});f.listeners.get('pageshow')({persisted:true});await settle();assert.equal(f.sockets.length,2);
    old.forEach(fn=>fn());assert.equal(f.events.length,0);
});
test('destroy detaches/closes socket once and saved callbacks cannot report or reconnect',async()=>{
    const f=fixture();await f.api.start();const s=f.sockets[0],old=[s.onopen,s.onclose,s.onerror,()=>s.onmessage];const message=s.onmessage;
    let closes=0;s.close=()=>closes++;f.api.destroy();f.api.destroy();f.api.resume();await f.api.start();
    old.slice(0,3).forEach(fn=>fn());message({data:'{"type":"canvas_updated"}'});
    assert.equal(closes,1);assert.equal(s.onmessage,null);assert.equal(f.timers.size,0);assert.equal(f.listeners.size,0);assert.equal(f.events.length,0);
});
for(const failure of ['ready','constructor'])test(failure+' failure uses existing retry timing',async()=>{
    const f=fixture(failure==='ready'?{ready:()=>Promise.reject(Error('ready'))}:{failFactory:true});await f.api.start();
    assert.equal(f.sockets.length,0);assert.deepEqual([...f.timers.values()].map(t=>t.ms),[700,800]);f.api.destroy();assert.equal(f.timers.size,0);
});
test('codec failure does not construct a socket and follows the existing retry lifecycle',async()=>{
    const f=fixture({loadCodec:()=>Promise.reject(Error('module unavailable'))});await f.api.start();
    assert.equal(f.sockets.length,0);assert.deepEqual([...f.timers.values()].map(t=>t.ms),[700,800]);f.api.destroy();assert.equal(f.timers.size,0);
});
test('pending module load cannot create a socket after close, and reopening awaits its own session',async()=>{
    const jobs=[];const f=fixture({loadCodec:()=>new Promise(resolve=>jobs.push(resolve))});
    const first=f.api.start();await settle();f.api.pause();f.api.resume();await settle();assert.equal(jobs.length,2);
    jobs[0]({parseMessage});await first;assert.equal(f.sockets.length,0);
    jobs[1]({parseMessage});await settle();assert.equal(f.sockets.length,1);
});
