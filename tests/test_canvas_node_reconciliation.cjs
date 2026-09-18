const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function load(ctx,file,name){const src=fs.readFileSync(require('node:path').join(__dirname,'../static/js/'+file),'utf8').replace(/\r\n/g,'\n');
    const start=src.indexOf(`function ${name}(`);vm.runInContext(src.slice(start,src.indexOf('\n}',start)+2),ctx);}
test('2000-node smart render retains unchanged DOM, bindings and media; only changed/deleted nodes affect links',()=>{
    const elements=new Map(),scopes=[];let built=0,bound=0;
    const element=id=>({dataset:{id},querySelector:()=>null,remove(){elements.delete(id);},replaceWith(fresh){elements.set(id,fresh);}});
    const noop=()=>{};
    const ctx=vm.createContext({nodes:Array.from({length:2000},(_,i)=>({id:String(i),x:i})),smartRenderedNodes:new WeakMap(),
        cancelSmartGeometryRefresh:noop,smartWorkflowTransferModal:null,selectedNodeIds:()=>[],portDragState:null,smartChangedConnectionNodes:()=>[],
        world:{classList:{toggle:noop},querySelectorAll:()=>[...elements.values()],querySelector:s=>s.startsWith('svg')?{}:null,
            appendChild:el=>elements.set(el.dataset.id,el)},withSmartComputation:fn=>fn(),isSmartNodeInViewport:()=>true,
        renderSmartNodeHtml:JSON.stringify,document:{createElement:()=>({content:{},set innerHTML(value){built++;this.content.firstElementChild=element(JSON.parse(value).id);}})},
        bindNodeEvents:()=>bound++,restoreSmartNodeScroll:noop,bindSmartPreviewImageFallbacks:noop,measureSmartNodeImages:noop,
        releaseSmartGroupPreviews:noop,transplantSmartMediaElements:noop,smartViewportScrolls:new WeakMap(),
        refreshConnectionLayer:ids=>scopes.push([...ids]),scheduleSmartGeometryRefresh:noop,updateComposer:noop,
        scheduleSmartMinimapRender:noop,refreshIcons:noop,refreshRunTimerPills:noop});
    load(ctx,'smart-canvas.js','render');ctx.render();assert.equal(built,2000);
    const unchanged=elements.get('1999');built=0;bound=0;ctx.render();assert.equal(built,0);assert.equal(bound,0);
    ctx.nodes[0].x=999;ctx.render();assert.equal(built,1);assert.equal(bound,1);assert.deepEqual(scopes.at(-1),['0']);
    assert.equal(elements.get('1999'),unchanged);
    ctx.nodes[0]={...ctx.nodes[0]};ctx.render();assert.equal(built,2,'new node object must rebind closures even when markup matches');
    ctx.nodes.shift();ctx.render();assert.equal(elements.size,1999);assert.deepEqual(scopes.at(-1),['0']);
});

test('classic partial node refresh passes the same affected ids to immediate and post-layout links',()=>{
    const scopes=[],later=[],rebuilt=[];
    const ctx=vm.createContext({nodes:Array.from({length:2000},(_,i)=>({id:String(i),type:'image'})),CSS:{escape:x=>x},
        captureOutputScrolls:()=>[],applyViewport(){},nodesEl:{querySelector:()=>({replaceWith(){}})},
        renderNode:n=>{rebuilt.push(n.id);return{};},nodeHasLiveMedia:()=>false,restoreOutputScrolls(){},
        refreshGeometry:ids=>scopes.push([...ids]),refreshGeometryAfterLayout:ids=>later.push([...ids]),
        refreshIcons(){},bindCanvasPreviewImageFallbacks(){},refreshOutputTimer(){}});
    load(ctx,'canvas.js','refreshNodes');ctx.refreshNodes(['17','17']);
    assert.deepEqual(rebuilt,['17']);assert.deepEqual(scopes,[['17']]);assert.deepEqual(later,[['17']]);
});

test('connection presentation changes refresh endpoints even without a node markup change',()=>{
    let state='';
    const ctx=vm.createContext({nodes:[{id:'a'},{id:'b'},{id:'c'}],canvas:{connections:[{from:'a',to:'b'},{from:'b',to:'c'}]},
        smartRenderedConnectionStates:new Map(),cascadeConnectionKeys:()=>new Set(),loopInsertPreview:null,
        smartCascadeEdgeState:key=>key==='a->b'?state:''});
    load(ctx,'smart-canvas.js','smartChangedConnectionNodes');ctx.smartChangedConnectionNodes();
    assert.deepEqual([...ctx.smartChangedConnectionNodes()],[]);
    state='active';assert.deepEqual([...ctx.smartChangedConnectionNodes()],['a','b']);
    ctx.loopInsertPreview={index:1};assert.deepEqual([...ctx.smartChangedConnectionNodes()],['b','c']);
});
