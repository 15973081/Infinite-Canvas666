const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('static/js/theme-transition.js', 'utf8');
const turn = () => new Promise(setImmediate);
function fixture({supported=true, reduced=false, failReady=false, failStart=false, failAnimation=false}={}){
    const calls=[], listeners=new Map(), motionListeners=new Map();
    let releaseAnimation, resolveFinished, skipped=0;
    const animation = {finished:new Promise(r=>releaseAnimation=r),cancel(){releaseAnimation();}};
    function doc(){
        const classes=new Set(),styles=[];
        return {classes,styles,frames:[],hovers:[],head:{appendChild:s=>styles.push(s)},
            getElementById:id=>styles.find(s=>s.id===id),createElement:()=>({}),
            querySelectorAll(selector){return selector==='iframe' ? this.frames : this.hovers;},
            documentElement:{classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},
                getBoundingClientRect:()=>({width:1000,height:700}),
                animate(frames,options){calls.push({frames,options});if(failAnimation)throw Error('no pseudo animations');return animation;}},
            body:{animate(frames,options){calls.push({frames,options});return {finished:Promise.resolve(),cancel(){}};}}};
    }
    const document=doc(),child=doc();document.frames.push({contentDocument:child});
    const motion={matches:reduced,addEventListener:(k,f)=>motionListeners.set(k,f),removeEventListener:k=>motionListeners.delete(k)};
    if(supported)document.startViewTransition=update=>{
        if(failStart)throw Error('unsupported capture');
        const done=Promise.resolve().then(update);
        const finished=new Promise(r=>resolveFinished=r);
        const ready=done.then(()=>{if(failReady)throw Error('capture skipped');});
        return {ready,finished,updateCallbackDone:done,skipTransition(){skipped++;resolveFinished();}};
    };
    const window={innerWidth:1000,innerHeight:700,matchMedia:()=>motion,CSS:{supports:()=>true},
        addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)};
    vm.runInNewContext(source,{window,document,Math,Number});
    return {api:window.StudioThemeTransition,document,child,calls,listeners,motion,motionListeners,
        finish(){releaseAnimation();resolveFinished?.();},get skipped(){return skipped;}};
}
function clean(f){assert.equal(f.document.classes.size,0);assert.equal(f.child.classes.size,0);assert.equal(f.listeners.size,0);assert.equal(f.motionListeners.size,0);}
test('mouse coordinates define a farthest-corner circle on only the new snapshot',async()=>{
    const f=fixture();let updates=0;
    const result=f.api.run(()=>{updates++;assert.equal(f.child.classes.has('studio-theme-transitioning'),true);},{clientX:23,clientY:681,detail:1});
    await turn();assert.equal(updates,1);assert.equal(f.calls.length,1);
    const {frames,options}=f.calls[0];assert.equal(options.pseudoElement,'::view-transition-new(root)');
    assert.equal(frames.clipPath[0],'circle(0px at 23px 681px)');
    assert.equal(frames.clipPath[1],`circle(${Math.hypot(977,681)}px at 23px 681px)`);
    assert.deepEqual(Object.keys(frames),['clipPath']);
    f.finish();assert.equal(await result,true);clean(f);
});
test('touch origin is exact, including zero coordinates',async()=>{
    const f=fixture();const result=f.api.run(()=>{},{changedTouches:[{clientX:0,clientY:0}]});
    await turn();assert.equal(f.calls[0].frames.clipPath[0],'circle(0px at 0px 0px)');f.finish();await result;clean(f);
});
test('keyboard activation uses the triggering button center',async()=>{
    const f=fixture();const result=f.api.run(()=>{},{detail:0,clientX:0,clientY:0,currentTarget:{getBoundingClientRect:()=>({left:40,top:90,width:60,height:30})}});
    await turn();assert.equal(f.calls[0].frames.clipPath[0],'circle(0px at 70px 105px)');f.finish();await result;clean(f);
});
test('reduced motion commits without any animation',async()=>{
    const f=fixture({reduced:true});let updates=0;assert.equal(await f.api.run(()=>updates++),true);assert.equal(updates,1);assert.equal(f.calls.length,0);clean(f);
});
for(const options of [{supported:false},{failReady:true},{failStart:true},{failAnimation:true}]){
    test('unavailable or failed transition safely fades once '+JSON.stringify(options),async()=>{
        const f=fixture(options);let updates=0;await f.api.run(()=>updates++);
        assert.equal(updates,1);assert.ok(f.calls.some(c=>c.frames[0]?.opacity===0.94));clean(f);
    });
}
test('rapid repeat cannot overlap snapshots or apply a stale theme',async()=>{
    const f=fixture();let updates=0;const result=f.api.run(()=>updates++);assert.equal(await f.api.run(()=>updates++),false);
    await turn();f.finish();await result;assert.equal(updates,1);clean(f);
    const again=f.api.run(()=>updates++);await turn();f.finish();await again;assert.equal(updates,2);clean(f);
});
for(const kind of ['resize','motion']){
    test(kind+' interruption releases the snapshot and transient styles',async()=>{
        const f=fixture();let updates=0;const result=f.api.run(()=>updates++);await turn();
        if(kind==='resize')f.listeners.get('resize')();else {f.motion.matches=true;f.motionListeners.get('change')();}
        await result;assert.equal(updates,1);assert.equal(f.skipped,1);clean(f);
    });
}
test('main toggle passes its actual event and synchronously updates embedded themes',()=>{
    const html=fs.readFileSync('static/index.html','utf8');
    assert.match(html,/onclick="toggleTheme\(event\)"/);
    assert.match(html,/StudioThemeTransition.run\(\(\) => broadcastTheme\(next\), event\)/);
    const sync=html.match(/function syncThemeToFrame\(iframe\) \{([\s\S]*?)\n        function broadcastTheme/)[0];
    let applied,posts=0;
    const context={window:{StudioTheme:{get:()=> 'dark'}}};vm.runInNewContext(sync.replace(/\n        function broadcastTheme$/,''),context);
    context.syncThemeToFrame({contentWindow:{StudioTheme:{apply:t=>applied=t},postMessage:()=>posts++}});
    assert.equal(applied,'dark');assert.equal(posts,0);
    context.syncThemeToFrame({contentWindow:{postMessage:()=>posts++}});assert.equal(posts,1);
});

test('hover-driven layout is frozen during capture and restored on completion',async()=>{
    const f=fixture();let state='';const hover={getAttribute:()=>state,setAttribute:(key,value)=>{state=value;},matches:()=>true};
    f.document.hovers.push(hover);const result=f.api.run(()=>assert.equal(state,'on'));
    await turn();assert.equal(state,'on');f.finish();await result;assert.equal(state,'');clean(f);
});
