const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('static/js/theme-transition.js', 'utf8');
const turn = () => new Promise(setImmediate);
function fixture({supported=true, reduced=false, failReady=false, failStart=false, failAnimation=false, controlledPaint=false, width=1000, height=700, dpr=1}={}){
    const calls=[], listeners=new Map(), motionListeners=new Map(), documentListeners=new Map(), frames=new Map();
    let frameId=0;
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
    document.addEventListener=(name,fn)=>documentListeners.set(name,fn);
    document.removeEventListener=name=>documentListeners.delete(name);
    const motion={matches:reduced,addEventListener:(k,f)=>motionListeners.set(k,f),removeEventListener:k=>motionListeners.delete(k)};
    if(supported)document.startViewTransition=update=>{
        if(failStart)throw Error('unsupported capture');
        const done=Promise.resolve().then(update);
        const finished=new Promise(r=>resolveFinished=r);
        const ready=done.then(()=>{if(failReady)throw Error('capture skipped');});
        return {ready,finished,updateCallbackDone:done,skipTransition(){skipped++;resolveFinished();}};
    };
    const window={innerWidth:width,innerHeight:height,devicePixelRatio:dpr,matchMedia:()=>motion,CSS:{supports:()=>true},
        addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)};
    if(controlledPaint){
        window.requestAnimationFrame=fn=>{frames.set(++frameId,fn);return frameId;};
        window.cancelAnimationFrame=id=>frames.delete(id);
    }
    vm.runInNewContext(source,{window,document,Math,Number});
    return {api:window.StudioThemeTransition,document,child,calls,listeners,motion,motionListeners,
        frames,documentListeners,
        paint(){const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());},
        hide(){document.hidden=true;documentListeners.get('visibilitychange')?.();},
        finish(){releaseAnimation();resolveFinished?.();},get skipped(){return skipped;}};
}
function clean(f){assert.equal(f.document.classes.size,0);assert.equal(f.child.classes.size,0);assert.equal(f.listeners.size,0);assert.equal(f.motionListeners.size,0);assert.equal(f.frames.size,0);assert.equal(f.documentListeners.size,0);}
test('mouse coordinates define a farthest-corner circle on only the new snapshot',async()=>{
    const f=fixture();let updates=0;
    const result=f.api.run(()=>{updates++;assert.equal(f.child.classes.has('studio-theme-transitioning'),true);},{clientX:23,clientY:681,detail:1});
    await turn();assert.equal(updates,1);assert.equal(f.calls.length,1);
    const {frames,options}=f.calls[0];assert.equal(options.pseudoElement,'::view-transition-new(root)');
    assert.equal(frames.clipPath[0],'circle(0% at 2.3% '+(100*681/700)+'%)');
    assert.equal(frames.clipPath[1],`circle(${100*(Math.hypot(977,681)+1)/(Math.hypot(1000,700)/Math.SQRT2)}% at 2.3% ${100*681/700}%)`);
    assert.deepEqual(Object.keys(frames),['clipPath']);
    f.finish();assert.equal(await result,true);clean(f);
});
test('touch origin is exact, including zero coordinates',async()=>{
    const f=fixture();const result=f.api.run(()=>{},{changedTouches:[{clientX:0,clientY:0}]});
    await turn();assert.equal(f.calls[0].frames.clipPath[0],'circle(0% at 0% 0%)');f.finish();await result;clean(f);
});
test('keyboard activation uses the triggering button center',async()=>{
    const f=fixture();const result=f.api.run(()=>{},{detail:0,clientX:0,clientY:0,currentTarget:{getBoundingClientRect:()=>({left:40,top:90,width:60,height:30})}});
    await turn();assert.equal(f.calls[0].frames.clipPath[0],'circle(0% at 7% 15%)');f.finish();await result;clean(f);
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
    const context={window:{StudioTheme:{get:()=> 'dark'},StudioFrameMessages:{send:frame=>frame.contentWindow.postMessage()}}};vm.runInNewContext(sync.replace(/\n        function broadcastTheme$/,''),context);
    context.syncThemeToFrame({contentWindow:{StudioTheme:{apply:t=>applied=t},postMessage:()=>posts++}});
    assert.equal(applied,'dark');assert.equal(posts,0);
    context.syncThemeToFrame({contentWindow:{postMessage:()=>posts++}});assert.equal(posts,1);
});

test('hover-driven layout is frozen during capture and restored on completion',async()=>{
    const f=fixture();let state='';const hover={getAttribute:()=>state,setAttribute:(key,value)=>{state=value;},matches:()=>true};
    f.document.hovers.push(hover);const result=f.api.run(()=>assert.equal(state,'on'));
    await turn();assert.equal(state,'on');f.finish();await result;assert.equal(state,'');clean(f);
});


test('snapshot handoff keeps hover layout frozen across a paint before unlocking',async()=>{
    const f=fixture({controlledPaint:true});let state='',updates=0;
    f.document.hovers.push({getAttribute:()=>state,setAttribute:(key,value)=>{state=value;},matches:()=>true});
    const result=f.api.run(()=>updates++);await turn();f.finish();await turn();
    assert.equal(state,'on');assert.ok(f.document.classes.has('studio-theme-transitioning'));
    assert.equal(await f.api.run(()=>updates++),false);
    f.paint();await turn();
    assert.equal(state,'on');assert.ok(f.document.classes.has('studio-theme-transitioning'));
    f.paint();assert.equal(await result,true);
    assert.equal(state,'');assert.equal(updates,1);clean(f);
});

for(const hideBeforeFinish of [true,false]){
    test('hidden tab releases handoff without waiting for suspended frames '+hideBeforeFinish,async()=>{
        const f=fixture({controlledPaint:true});const result=f.api.run(()=>{});await turn();
        if(hideBeforeFinish)f.hide();
        f.finish();await turn();
        if(!hideBeforeFinish){assert.equal(f.frames.size,1);f.hide();}
        assert.equal(await result,true);clean(f);
    });
}

test('resize interruption bypasses the live-page paint wait',async()=>{
    const f=fixture({controlledPaint:true});const result=f.api.run(()=>{});await turn();
    f.listeners.get('resize')();assert.equal(await result,true);clean(f);
});


function decodeCircle(value,width,height){
    const [,r,x,y]=value.match(/^circle\(([-\d.]+)% at ([-\d.]+)% ([-\d.]+)%\)$/).map(Number);
    return {r:r/100*Math.hypot(width,height)/Math.SQRT2,x:x/100*width,y:y/100*height};
}
for(const screen of [
    {width:1000,height:700,dpr:1}, {width:2560,height:1440,dpr:1.5},
    {width:3840,height:2160,dpr:1}, {width:1920,height:1080,dpr:2},
    {width:7680,height:4320,dpr:1}, {width:900,height:1600,dpr:3},
    {width:3440,height:1440,dpr:1.25}
]){
    test('button origin and full coverage are invariant under snapshot scaling '+JSON.stringify(screen),async()=>{
        const f=fixture(screen);
        const center={x:screen.width*.03,y:screen.height*.94};
        const result=f.api.run(()=>{}, {clientX:7,clientY:9,detail:1,currentTarget:{
            getBoundingClientRect:()=>({left:center.x-30,top:center.y-15,width:60,height:30})
        }});
        await turn();const {frames,options}=f.calls[0];
        assert.equal(options.duration,520);assert.equal(options.easing,'linear');
        for(const scale of [.5,1,1.25,1.5,2]){
            const w=screen.width*scale,h=screen.height*scale;
            const first=decodeCircle(frames.clipPath[0],w,h);
            const last=decodeCircle(frames.clipPath[1],w,h);
            assert.ok(Math.abs(first.x-center.x*scale)<1e-8);
            assert.ok(Math.abs(first.y-center.y*scale)<1e-8);
            assert.equal(first.r,0);
            for(const [x,y] of [[0,0],[w,0],[0,h],[w,h]])
                assert.ok(last.r>Math.hypot(x-last.x,y-last.y));
        }
        f.finish();await result;clean(f);
    });
}
test('origin is measured after hover layout freezes, not at stale pointer position',async()=>{
    const f=fixture();let frozen=false;
    f.document.hovers.push({getAttribute:()=>'',matches:()=>true,setAttribute:(_,v)=>{frozen=v==='on';}});
    const result=f.api.run(()=>{}, {detail:1,clientX:30,clientY:400,currentTarget:{
        getBoundingClientRect:()=>({left:20,top:frozen?600:400,width:100,height:40})
    }});
    await turn();const circle=decodeCircle(f.calls[0].frames.clipPath[0],1000,700);
    assert.ok(Math.abs(circle.x-70)<1e-8);assert.ok(Math.abs(circle.y-620)<1e-8);
    f.finish();await result;clean(f);
});
