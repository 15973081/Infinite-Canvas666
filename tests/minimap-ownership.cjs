const {installWorkspaceView}=require('./helpers/workspace-view.cjs');
const {functionSource}=require('./helpers/canvas-source.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {readCanvasSource} = require('./helpers/canvas-source.cjs');

function target() {
    const listeners = new Map();
    return {
        style:{}, dataset:{}, children:[], className:'',
        addEventListener(type, fn, options={}) {
            if(!listeners.has(type)) listeners.set(type,new Set());
            listeners.get(type).add(fn);
            options.signal?.addEventListener('abort',()=>this.removeEventListener(type,fn),{once:true});
        },
        removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
        handlers(type) { return [...(listeners.get(type)||[])]; },
        emit(type, event={}) { this.handlers(type).forEach(fn=>fn(event)); },
        appendChild(el) { el.parent=this; this.children.push(el); },
        remove() { this.parent.children=this.parent.children.filter(el=>el!==this); },
        querySelectorAll(selector) { return this.children.filter(el=>'.'+el.className===selector); },
        getBoundingClientRect() { return {left:10,top:20,width:800,height:600}; },
    };
}
function setup(kind) {
    const source=readCanvasSource(path.join(__dirname,'../static/js/'+(kind==='classic'?'canvas.js':'smart-canvas.js')),'utf8').replace(/\r\n/g,'\n');
    const win=target(), root=target(), content=target(), view=target();
    const frames=new Map(); let frameId=0;
    const calls={measurements:0, paints:0, saves:0};
    content.clientWidth=172;content.clientHeight=110;
    Object.defineProperty(content,'innerHTML',{set(){calls.paints++;},get(){return '';}});
    const ctx=vm.createContext({
        canvas:{id:'a',connections:[]},nodes:[{id:'n',x:0,y:0,w:200,h:100,width:200,height:100}],
        selected:new Set(),viewport:{x:0,y:0,scale:1},board:root,shell:{clientWidth:800,clientHeight:600},
        window:win,document:{getElementById:id=>({minimap:root,minimapContent:content,minimapViewport:view}[id]),createElement:target},
        CSS:{escape:x=>x},nodesEl:{querySelector(){calls.measurements++;return null;}},
        defaultNodeSize:()=>({w:200,h:100}),nodeRect:n=>{calls.measurements++;return n;},
        requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id),
        windowPointerSession:null,AbortController,
        renderLinks(){},renderSelectionHub(){},
        scheduleViewportSave(){calls.saves++;},scheduleSave(){calls.saves++;},
    });
    function load(name) {
        const start=source.indexOf('function '+name+'(');
        assert.ok(start>=0,name);
        vm.runInContext(functionSource(source,name),ctx);
    }
    const factory='create'+(kind==='classic'?'Classic':'Smart')+'Minimap';
    if(kind==='smart')load('smartViewportBounds');
    const ownerName=kind+'Minimap';
    load(factory);
    if(kind==='classic') ['estimatedNodeRect','currentWorldViewRect','minimapNodeBounds','minimapBounds','startWindowPointerSession','endWindowPointerSession'].forEach(load);
    else {installWorkspaceView(ctx,'smart');load('withSmartComputation');}
    load('centerViewportOnWorldPoint');
    ctx[ownerName]=ctx[factory]();
    const owner=ctx[ownerName];
    // The workspace retains viewport application; its command expresses only view changes.
    ctx.applyViewport=()=>owner.viewportChanged();
    const tick=()=>{const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn());};
    const mouse=(x=90,y=70)=>({button:0,clientX:x,clientY:y,preventDefault(){},stopPropagation(){}});
    return {source,ctx,owner,root,content,view,win,frames,calls,tick,mouse};
}

for(const kind of ['classic','smart']) {
    test(`${kind} minimap: viewport bursts coalesce, layout wins in either order, direct paint cancels queued work`,()=>{
        const {owner,frames,calls,tick,ctx}=setup(kind);
        owner.render();assert.equal(calls.measurements,1);
        for(let i=0;i<120;i++)owner.viewportChanged();
        assert.equal(frames.size,1);tick();assert.equal(calls.measurements,1);
        for(const layoutFirst of [true,false]) {
            ctx.nodes[0].x+=10;
            if(layoutFirst)owner.layoutChanged();
            owner.viewportChanged();
            if(!layoutFirst)owner.layoutChanged();
            assert.equal(frames.size,1);tick();
        }
        assert.equal(calls.measurements,3);
        owner.layoutChanged();const late=[...frames.values()][0];owner.render();
        assert.equal(frames.size,0);const before=calls.measurements;late();assert.equal(calls.measurements,before);
        owner.viewportChanged();late();owner.viewportChanged();
        assert.equal(frames.size,1,'cancelled callback cannot clear the newer frame handle');
        tick();assert.equal(calls.measurements,before);
    });
    test(`${kind} minimap: reset cancels old frame/drag, releases layout and never saves the new canvas`,()=>{
        const {ctx,owner,root,win,frames,calls,tick,mouse}=setup(kind);
        owner.bind();root.emit('mousedown',mouse());assert.equal(owner.dragging,true);
        const stale=[...frames.values()][0], moves=win.handlers('mousemove');
        const saves=calls.saves;
        owner.reset();ctx.canvas={id:'b',connections:[]};ctx.nodes=[{id:'new',x:500,y:700,w:40,h:80,width:40,height:80}];
        const viewport=JSON.stringify(ctx.viewport);stale();moves.forEach(fn=>fn(mouse(150,100)));
        assert.equal(owner.move(mouse()),false);assert.equal(owner.endDrag(),false);
        assert.equal(JSON.stringify(ctx.viewport),viewport);assert.equal(calls.saves,saves);assert.equal(frames.size,0);
        owner.viewportChanged();tick();assert.equal(calls.measurements,2);
        assert.equal(owner.dragging,false);
    });
    test(`${kind} minimap: binding is idempotent, saving timing remains unchanged and cleanup preserves other listeners`,()=>{
        const {owner,root,win,calls,mouse}=setup(kind);let unrelated=0;
        const onMove=()=>unrelated++;win.addEventListener('mousemove',onMove);
        owner.bind();owner.bind();owner.bind();assert.equal(root.handlers('mousedown').length,1);
        root.emit('mousedown',mouse());assert.equal(calls.saves,kind==='classic'?0:1);
        owner.move(mouse(100,80));assert.equal(calls.saves,kind==='classic'?0:2);
        owner.endDrag();assert.equal(calls.saves,kind==='classic'?1:2);
        owner.endDrag();assert.equal(calls.saves,kind==='classic'?1:2);
        root.emit('mousedown',mouse());owner.destroy();owner.destroy();owner.bind();
        const saves=calls.saves;win.emit('mousemove',mouse());win.emit('mouseup',mouse());
        root.emit('mousedown',mouse());assert.equal(unrelated,1);assert.equal(calls.saves,saves);
        assert.equal(root.handlers('mousedown').length,0);assert.equal(win.handlers('pagehide').length,0);
        assert.equal(win.handlers('pageshow').length,0);assert.deepEqual(win.handlers('mousemove'),[onMove]);
        assert.equal(owner.eventToWorld(mouse()),null);
    });
    test(`${kind} minimap: cached-page exit suspends work, return rebuilds once, permanent exit ignores late calls`,()=>{
        const {owner,win,root,calls,frames,tick,mouse}=setup(kind);
        owner.bind();root.emit('mousedown',mouse());const stale=[...frames.values()][0];
        win.emit('pagehide',{persisted:true});const before=calls.measurements;
        owner.layoutChanged();owner.render();root.emit('mousedown',mouse());stale();
        assert.equal(frames.size,0);assert.equal(calls.measurements,before);assert.equal(owner.dragging,false);
        win.emit('pageshow',{persisted:true});assert.equal(frames.size,1);tick();assert.equal(calls.measurements,before+1);
        owner.layoutChanged();const last=[...frames.values()][0];win.emit('pagehide',{persisted:false});
        last();owner.viewportChanged();win.emit('pageshow',{persisted:true});
        assert.equal(frames.size,0);assert.equal(calls.measurements,before+1);
    });
    test(`${kind} minimap: internal bindings and DOM stay inside the factory`,()=>{
        const {source,owner}=setup(kind), name='create'+(kind==='classic'?'Classic':'Smart')+'Minimap';
        const start=source.indexOf('function '+name+'('), end=source.indexOf('\n}',start)+2;
        const outside=source.slice(0,start)+source.slice(end);
        assert.doesNotMatch(outside,/\b(?:minimapState|minimapLayoutDirty|minimapRenderQueued|minimapDrag|smartMinimapState|smartMinimapFrame|smartMinimapViewportOnly|smartMinimapDrag|minimapContent|minimapViewport)\b/);
        assert.doesNotMatch(outside,/(?:const|let|var) minimap\b/);
        assert.equal(Object.isFrozen(owner),true);
        assert.equal(owner.state,undefined);assert.equal(owner.elements,undefined);
        const entry=fs.readFileSync(path.join(__dirname,'../static/js/'+(kind==='classic'?'canvas.js':'smart-canvas.js')),'utf8');
        assert.match(entry,new RegExp(kind+'Minimap\\.reset\\(\\)'));
    });
}

test('Classic minimap: reset does not abort a newer workspace pointer session',()=>{
    const {ctx,owner,root,win,mouse}=setup('classic');owner.bind();root.emit('mousedown',mouse());
    let moves=0;const newer=ctx.startWindowPointerSession(()=>moves++,()=>{});
    assert.equal(owner.dragging,false);owner.reset();win.emit('mousemove',mouse());
    assert.equal(newer.signal.aborted,false);assert.equal(moves,1);
});

test('Smart minimap: original projection and minimum marker sizes map back to exact world points',()=>{
    const {owner,content,view,ctx}=setup('smart');owner.render();
    // The original 1200 x 1000 bounds project at 0.11 with 20px horizontal letterboxing.
    const marker=content.children[0];
    assert.deepEqual({...marker.style},{left:'42px',top:'22px',width:'22px',height:'11px'});
    assert.deepEqual({...view.style},{left:'42px',top:'22px',width:'88px',height:'66px'});
    const point=owner.eventToWorld({clientX:10+86,clientY:20+55});
    assert.ok(Math.abs(point.x-400)<1e-8);assert.ok(Math.abs(point.y-300)<1e-8);
    ctx.nodes=[{id:'tiny',x:0,y:0,width:1,height:1}];owner.render();
    assert.equal(content.children[0].style.width,'4px');assert.equal(content.children[0].style.height,'4px');
    ctx.nodes=[];owner.render();assert.equal(content.children.length,0);
    assert.ok(Number.isFinite(parseFloat(view.style.left)));
});
