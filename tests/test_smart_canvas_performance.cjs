const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../static/js/smart-canvas.js'),'utf8').replace(/\r\n/g,'\n');
function load(ctx,names){
    for(const name of names){
        const start=source.indexOf(`function ${name}(`);
        assert.ok(start>=0,name);
        vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),ctx);
    }
}
function scheduler(){
    const frames=new Map(), scopes=[], maps=[]; let id=0;
    const ctx=vm.createContext({
        smartGeometryFrame:null,smartGeometryPasses:0,smartGeometryAll:false,smartGeometryNodes:new Set(),
        smartMinimapFrame:null,smartMinimapViewportOnly:true,
        requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
        refreshConnectionLayer:ids=>scopes.push(ids===null?null:[...ids]),renderMinimap:opts=>maps.push(opts),
    });
    load(ctx,['scheduleSmartGeometryRefresh','cancelSmartGeometryRefresh','scheduleSmartMinimapRender']);
    return {ctx,scopes,maps,frames,tick(){const batch=[...frames];frames.clear();batch.forEach(([,fn])=>fn());}};
}
test('120 geometry requests coalesce and retain layout correction',()=>{
    const {ctx,scopes,tick,frames}=scheduler();
    for(let i=0;i<120;i++)ctx.scheduleSmartGeometryRefresh(['a'],2);
    assert.equal(frames.size,1);tick();assert.deepEqual(scopes,[['a']]);
    tick();assert.deepEqual(scopes,[['a'],['a']]);assert.equal(frames.size,0);
});
test('scopes union; global refresh cannot be downgraded; cancellation removes stale correction',()=>{
    const {ctx,scopes,tick,frames}=scheduler();
    ctx.scheduleSmartGeometryRefresh(['a']);ctx.scheduleSmartGeometryRefresh(['b']);tick();
    assert.deepEqual(scopes,[['a','b']]);
    ctx.scheduleSmartGeometryRefresh(null,2);ctx.scheduleSmartGeometryRefresh(['c']);tick();
    assert.equal(scopes[1],null);ctx.cancelSmartGeometryRefresh();tick();assert.equal(scopes.length,2);assert.equal(frames.size,0);
});
test('minimap requests coalesce and preserve pending layout invalidation',()=>{
    const {ctx,maps,tick,frames}=scheduler();
    for(let i=0;i<120;i++)ctx.scheduleSmartMinimapRender(true);
    ctx.scheduleSmartMinimapRender();ctx.scheduleSmartMinimapRender(true);
    assert.equal(frames.size,1);tick();assert.equal(maps.length,1);assert.equal(maps[0].viewportOnly,false);
    ctx.scheduleSmartMinimapRender(true);tick();assert.equal(maps[1].viewportOnly,true);
});
