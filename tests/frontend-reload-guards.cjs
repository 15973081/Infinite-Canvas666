const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('static/js/frontend-version.js','utf8');
const turn=()=>new Promise(setImmediate);
function fixture(){
    const timers=new Map(),navigations=[];let sequence=0,banner;
    function frame(){
        const listeners=new Map(),frames=[];
        const win={CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},
            addEventListener(type,fn){const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);},
            dispatchEvent(event){for(const fn of listeners.get(event.type)||[]) fn(event);},
            document:{querySelectorAll:()=>frames}};
        return {win,listeners,frames};
    }
    const root=frame(),meta={content:'old',dataset:{}},button={disabled:false,textContent:'保存并刷新',addEventListener(){}},message={textContent:''};
    const document={...root.win.document,readyState:'loading',addEventListener(){},querySelector:()=>meta,
        createElement(){banner={style:{},setAttribute(){},querySelector:s=>s==='button'?button:message};return banner;},
        body:{appendChild(){}}};
    const context={window:root.win,document,URL,Promise,CustomEvent:root.win.CustomEvent,
        fetch:async()=>({ok:true,json:async()=>({build_id:'new'})}),
        setTimeout(fn,ms){timers.set(++sequence,{fn,ms});return sequence;},clearTimeout(id){timers.delete(id);},clearInterval(){}};
    Object.assign(root.win,{document,parent:root.win,location:{href:'http://canvas.local/?workspace=A&id=canvas',replace:url=>navigations.push(url)},setInterval(){}});
    vm.runInNewContext(source,context);
    return {root,frame,timers,navigations,button,message,api:root.win.FrontendVersion};
}
test('refresh waits for nested iframe saves once before preserving scoped navigation',async()=>{
    const f=fixture(),child=f.frame(),nested=f.frame();let release,visited=0;
    f.root.frames.push({contentWindow:child.win});child.frames.push({contentWindow:nested.win});
    nested.win.addEventListener('frontend:before-reload',e=>{visited++;e.detail.waitUntil(new Promise(r=>release=r));});
    await f.api.checkForUpdate();
    const pending=f.api.refreshToLatestBuild();assert.equal(f.api.refreshToLatestBuild(),pending);
    await turn();assert.equal(f.navigations.length,0);assert.equal(f.button.disabled,true);assert.equal(visited,1);
    release(true);assert.equal(await pending,true);
    const url=new URL(f.navigations[0]);assert.equal(url.searchParams.get('workspace'),'A');assert.equal(url.searchParams.get('id'),'canvas');assert.equal(url.searchParams.get('__frontend_build'),'new');
    assert.equal(f.timers.size,0);
});
test('failed child save blocks refresh and allows an explicit retry',async()=>{
    const f=fixture(),child=f.frame();f.root.frames.push({contentWindow:child.win});
    child.win.addEventListener('frontend:before-reload',e=>e.detail.waitUntil(false));
    await f.api.checkForUpdate();assert.equal(await f.api.refreshToLatestBuild(),false);
    assert.equal(f.navigations.length,0);assert.equal(f.button.disabled,false);assert.match(f.message.textContent,/保留草稿/);
    child.listeners.clear();assert.equal(await f.api.refreshToLatestBuild(),true);assert.equal(f.navigations.length,1);
});
test('timeout keeps the page, resets the button, and ignores a late success',async()=>{
    const f=fixture();let release;
    f.root.win.addEventListener('frontend:before-reload',e=>e.detail.waitUntil(new Promise(r=>release=r)));
    await f.api.checkForUpdate();const pending=f.api.refreshToLatestBuild();await turn();
    const timer=[...f.timers.values()].find(t=>t.ms===45000);assert.ok(timer);timer.fn();
    assert.equal(await pending,false);assert.match(f.message.textContent,/超时/);assert.equal(f.button.disabled,false);
    release(true);await turn();assert.equal(f.navigations.length,0);assert.equal(f.timers.size,0);
});
test('a rejected guard or inaccessible frame cannot silently authorize navigation',async()=>{
    for(const inaccessible of [false,true]){
        const f=fixture();f.root.win.addEventListener('frontend:before-reload',e=>e.detail.waitUntil(Promise.reject(new Error('save failed'))));
        if(inaccessible)f.root.frames.push({get contentWindow(){throw new Error('frame inaccessible');}});
        await f.api.checkForUpdate();assert.equal(await f.api.refreshToLatestBuild(),false);await turn();
        assert.equal(f.navigations.length,0);assert.equal(f.button.disabled,false);
    }
});
