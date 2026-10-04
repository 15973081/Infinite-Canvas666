const {readCanvasSource} = require('./helpers/canvas-source.cjs');
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = readCanvasSource(require('node:path').join(__dirname, '../static/js/smart-canvas.js'),'utf8').replace(/\r\n/g,'\n');
function load(ctx,names){
    for(const name of names){
        const start=source.indexOf(`function ${name}(`);
        assert.ok(start>=0,name);
        vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),ctx);
    }
}
function scheduler(){
    const frames=new Map(), scopes=[]; let id=0;
    const ctx=vm.createContext({
        smartGeometryFrame:null,smartGeometryPasses:0,smartGeometryAll:false,smartGeometryNodes:new Set(),
        requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
        refreshConnectionLayer:ids=>scopes.push(ids===null?null:[...ids]),
    });
    load(ctx,['scheduleSmartGeometryRefresh','cancelSmartGeometryRefresh']);
    return {ctx,scopes,frames,tick(){const batch=[...frames];frames.clear();batch.forEach(([,fn])=>fn());}};
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

function element(){
    return {style:{},dataset:{},children:[],className:'',parent:null,
        appendChild(el){el.parent=this;this.children.push(el);return el;},
        remove(){if(this.parent)this.parent.children=this.parent.children.filter(el=>el!==this);},
        querySelectorAll(selector){return this.children.filter(el=>`.${el.className}`===selector);}};
}
test('minimap reuses DOM and layout on pan, reprojects expanded bounds, invalidates on change',()=>{
    const root=element(),view=element();let layouts=0;
    const nodes=[{id:'a',x:0,y:0,width:200,height:200},{id:'b',x:1000,y:1000,width:200,height:200}];
    const ctx=vm.createContext({nodes,canvas:{},smartComputationContext:null,
        shell:{clientWidth:800,clientHeight:600},viewport:{x:0,y:0,scale:1},
        nodeRect:n=>{layouts++;return n;},document:{createElement:element,getElementById:id=>id==='minimapContent'?root:id==='minimapViewport'?view:null},cancelAnimationFrame(){}});
    load(ctx,['createSmartMinimap','renderMinimap','withSmartComputation']);ctx.smartMinimap=ctx.createSmartMinimap();ctx.renderMinimap();
    const first=root.children[0],firstLeft=first.style.left;
    ctx.viewport.x=-100;ctx.renderMinimap({viewportOnly:true});
    assert.equal(layouts,2);assert.equal(root.children[0],first);
    ctx.viewport.x=2000;ctx.renderMinimap({viewportOnly:true});
    assert.equal(layouts,2);assert.notEqual(first.style.left,firstLeft);
    nodes[0].x=400;ctx.renderMinimap();assert.equal(layouts,4);assert.equal(root.children[0],first);
    nodes.pop();ctx.renderMinimap();assert.equal(root.children.length,1);
    ctx.nodes=[{id:'c',x:0,y:0,width:50,height:50}];ctx.renderMinimap({viewportOnly:true});
    assert.equal(root.children.length,1);assert.equal(root.children[0].dataset.nodeId,'c');
});
test('composer refreshes material list once through normalized dynamic params',()=>{
    let inputs=0;const noop=()=>{},node={id:'a'};
    const ctx=vm.createContext({selectedNode:()=>node,smartCascadeSilentSelection:false,activeComposerSubject:node,
        composer:{classList:{toggle(){},contains:()=>true}},cascadeRunBtn:{style:{}},isSmartImageNode:()=>true,
        lastComposerNodeId:'a:node',smartComposerBaseline:{nodeId:'a',html:'',text:'',settings:'{}'},
        smartComposerChanges:()=>({prompt:false,settings:false}),promptInputNodesFor:()=>[],setPromptInputLocked:noop,syncCascadeRunButton:noop,
        positionComposerForNode:noop,settings:{},settingsForStorage:x=>x,promptPlainText:()=>'',
        promptInput:{innerHTML:'',style:{setProperty:noop}},renderInputPromptPreview:noop,
        renderInputThumbsRow:()=>inputs++,updateProviderModels:()=>ctx.renderInputThumbsRow()});
    load(ctx,['updateComposer']);ctx.updateComposer();assert.equal(inputs,1);
});
test('unchanged typed list preserves DOM but still updates tokens; metadata invalidates bindings',()=>{
    let writes=0,binds=0,tokenChecks=0;
    const row={classList:{toggle(){}},querySelectorAll:()=>[],set innerHTML(v){writes++;}};
    const plan={refs:[],invalid:[],aliases:new Map()};
    const ctx=vm.createContext({inputThumbsRow:row,collectPromptParts:()=>[],smartMediaReferencePlan:()=>plan,
        defaultReferenceImagesFor:()=>[],promptInput:{querySelectorAll(){tokenChecks++;return[];}},
        bindSmartPreviewImageFallbacks(){binds++;}});
    load(ctx,['renderSmartMediaGroups']);ctx.renderSmartMediaGroups({id:'a'});ctx.renderSmartMediaGroups({id:'a'});
    assert.equal(writes,1);assert.equal(binds,1);assert.equal(tokenChecks,2);
    ctx.renderSmartMediaGroups({id:'b'});assert.equal(writes,2);
    plan.invalid.push({url:'missing'});ctx.renderSmartMediaGroups({id:'b'});assert.equal(writes,3);
    // Changes not present in the markup still require fresh event closures.
    plan.refs.push({kind:'unknown',url:'asset://a',asset_uris:{volcengine:'asset://first'}});
    ctx.renderSmartMediaGroups({id:'b'});plan.refs[0].asset_uris.volcengine='asset://second';
    ctx.renderSmartMediaGroups({id:'b'});assert.equal(writes,5);
});
test('affected nodes include transitive/cyclic and legacy dependencies, not unrelated nodes',()=>{
    const ctx=vm.createContext({canvasUsesConnections:true,nodes:[{id:'legacy',inputNodeIds:['a']}],
        canvas:{connections:[{from:'a',to:'b'},{from:'b',to:'c'},{from:'c',to:'a'},{from:'x',to:'y'}]}});
    load(ctx,['smartAffectedNodeIds']);assert.deepEqual([...ctx.smartAffectedNodeIds(['a'])],['a','b','c']);
    ctx.canvasUsesConnections=false;assert.deepEqual([...ctx.smartAffectedNodeIds(['a'])],['a','b','legacy','c']);
});
test('node refresh defers focused editor and never replaces unrelated DOM',()=>{
    const a={id:'a'},b={id:'b'};let replaced=0,focusout,scheduled=0,focused=true;
    const current={contains:()=>focused,addEventListener:(_name,fn)=>focusout=fn,
        querySelector:()=>({scrollTop:93}),replaceWith:()=>replaced++};
    const fresh={querySelector:()=>scroller},scroller={scrollTop:0};
    const ctx=vm.createContext({nodes:[a,b],smartAffectedNodeIds:ids=>new Set(ids),selectedId:'b',smartViewportScrolls:new WeakMap(),
        world:{querySelector:()=>current},CSS:{escape:x=>x},document:{activeElement:{},createElement:()=>({content:{firstElementChild:fresh}})},
        setTimeout:fn=>fn(),isSmartNodeInViewport:()=>true,renderSmartNodeHtml:()=>'',transplantSmartMediaElements(){},bindNodeEvents(){},
        releaseSmartGroupPreviews(){},bindSmartPreviewImageFallbacks(){},measureSmartNodeImages(){},scheduleSmartGeometryRefresh(){scheduled++;},
        scheduleSmartMinimapRender(){},refreshRunTimerPills(){},refreshIcons(){},updateComposer(){throw Error('unrelated composer');}});
    load(ctx,['refreshSmartNodes']);ctx.refreshSmartNodes(['a']);ctx.refreshSmartNodes(['a']);assert.equal(replaced,0);
    assert.equal(current._smartRefreshPending,true);focused=false;focusout();assert.equal(replaced,1);assert.equal(scroller.scrollTop,93);
    assert.equal(scheduled,3);
});
test('restored nodes use complete event bindings and selection avoids full render',()=>{
    let bound;const ctx=vm.createContext({bindNodeEvents:els=>bound=els});load(ctx,['bindSmartNodeEvents']);
    const el={};ctx.bindSmartNodeEvents(el,{id:'a'});assert.equal(bound[0],el);
    const click=source.slice(source.indexOf('el.onclick = e => {',source.indexOf('function bindNodeEvents(')),source.indexOf('el.ondblclick =',source.indexOf('function bindNodeEvents(')));
    assert.ok(click.includes('syncSelectionUi()'));assert.ok(!click.includes('render()'));
});
test('partial links compute only endpoints, match full geometry, preserve history/cascade states',()=>{
    let layouts=0;
    const nodes=Array.from({length:1001},(_,i)=>({id:String(i),x:i*30,y:10,images:[]}));
    const ctx=vm.createContext({nodes,canvas:{connections:nodes.slice(1).map((n,i)=>({from:String(i),to:n.id,kind:i===0?'history':'input'}))},
        smartComputationContext:null,loopInsertPreview:null,cascadeConnectionKeys:()=>new Set(),smartCascadeEdgeState:()=>'',
        imageLayout:()=>{layouts++;return {width:200,height:100};},nodeScale:()=>1,escapeHtml:s=>s});
    load(ctx,['withSmartComputation','nodeRect','renderConnections','renderSmartConnectionPaths','smartConnectionTopology']);
    const full=ctx.renderConnections();assert.equal(layouts,1001);
    layouts=0;const partial=ctx.renderConnections(['0']);assert.equal(layouts,2);
    assert.equal((partial.match(/class="smart-connection"/g)||[]).length,1);
    assert.ok(partial.includes('conn-history'));assert.ok(full.includes(partial.slice(partial.indexOf('<g class='),partial.lastIndexOf('</svg>'))));
    nodes[0].x=999;const moved=ctx.renderConnections(['0']);assert.ok(moved.includes('M1099 110'));
    ctx.smartCascadeEdgeState=()=> 'active';assert.ok(ctx.renderConnections(['2']).includes('conn-cascade-active'));
    assert.equal(ctx.smartComputationContext,null);
});
test('computation indexes are fresh per call and released on failure',()=>{
    const ctx=vm.createContext({nodes:[{id:'a'},{id:'b'}],canvas:{connections:[{from:'a',to:'b',kind:'input'}]},canvasUsesConnections:true,smartComputationContext:null});
    load(ctx,['withSmartComputation','upstreamNodesForKinds']);
    assert.equal(ctx.withSmartComputation(()=>ctx.upstreamNodesForKinds({id:'b'})[0].id),'a');
    ctx.canvas.connections=[];assert.equal(ctx.withSmartComputation(()=>ctx.upstreamNodesForKinds({id:'b'}).length),0);
    assert.throws(()=>ctx.withSmartComputation(()=>{throw Error('test');}));assert.equal(ctx.smartComputationContext,null);
});
test('offscreen reclamation protects interaction, running tasks, editors and lightboxes',()=>{
    const node={id:'a',type:'smart-image',images:[{url:'a.png'}]},el={contains:()=>false,querySelector:()=>null};
    const ctx=vm.createContext({document:{activeElement:{}},smartNodePendingCount:n=>n.pending||0,isNodeSelected:()=>false,
        dragState:null,resizeState:null,thumbDragState:null,portDragState:null,selectionState:null,smartCascadeAnyRunning:()=>false,
        imageEditModal:{classList:{contains:()=>false}},previewNavState:{nodeId:'a'},smartAudioLightbox:{classList:{contains:()=>false}},smartAudioLightboxState:{nodeId:'a'}});
    load(ctx,['canRecycleSmartMediaNode']);assert.equal(ctx.canRecycleSmartMediaNode(node,el),true);
    for(const key of ['running','queued','pending'])assert.equal(ctx.canRecycleSmartMediaNode({...node,[key]:1},el),false);
    for(const key of ['dragState','resizeState','thumbDragState','portDragState','selectionState']){ctx[key]={};assert.equal(ctx.canRecycleSmartMediaNode(node,el),false);ctx[key]=null;}
    assert.equal(ctx.canRecycleSmartMediaNode({...node,type:'smart-loop'},el),false);
    assert.equal(ctx.canRecycleSmartMediaNode(node,{...el,contains:()=>true}),false);
    assert.equal(ctx.canRecycleSmartMediaNode(node,{...el,querySelector:()=>({})}),false);
    ctx.imageEditModal.classList.contains=()=>true;assert.equal(ctx.canRecycleSmartMediaNode(node,el),false);
    ctx.imageEditModal.classList.contains=()=>false;ctx.smartCascadeAnyRunning=()=>true;assert.equal(ctx.canRecycleSmartMediaNode(node,el),false);
});
test('large group previews load observed cells, suspend sources and disconnect',()=>{
    let callback,observed=0,disconnected=0;
    const img={dataset:{smartGroupSrc:'preview.png'},srcValue:null,hasAttribute(){return this.srcValue!==null;},getAttribute(){return this.srcValue;},removeAttribute(){this.srcValue=null;},set src(v){this.srcValue=v;}};
    const item={querySelector:()=>img},grid={isConnected:true,querySelectorAll:()=>[item]},root={querySelectorAll:()=>[grid]};
    const ctx=vm.createContext({IntersectionObserver:class {constructor(fn){callback=fn;}observe(){observed++;}disconnect(){disconnected++;}}});
    load(ctx,['manageSmartGroupPreviews','releaseSmartGroupPreviews']);ctx.manageSmartGroupPreviews(root);ctx.manageSmartGroupPreviews(root);
    assert.equal(observed,1);assert.equal(img.srcValue,null);
    callback([{target:item,isIntersecting:true}]);assert.equal(img.srcValue,'preview.png');
    img.src='fallback.png';callback([{target:item,isIntersecting:false}]);assert.equal(img.srcValue,null);
    callback([{target:item,isIntersecting:true}]);assert.equal(img.srcValue,'fallback.png');
    ctx.releaseSmartGroupPreviews(root);assert.equal(disconnected,1);assert.equal(grid._smartPreviewObserver,undefined);
});
test('deferred thumbnail HTML retains media metadata and contains no live player',()=>{
    const ctx=vm.createContext({isFileMediaItem:()=>false,isTextMediaItem:()=>false,isAudioMediaItem:()=>false,isVideoMediaItem:img=>img.kind==='video',
        smartVideoPreviewHtml:()=>'<img src="poster.png" data-url="video.mp4">',smartPreviewImgHtml:()=>'<img src="preview.png" data-url="original.png">'});
    load(ctx,['thumbMediaHtml']);const html=ctx.thumbMediaHtml({kind:'video'},true);
    assert.ok(html.includes('data-smart-group-src="poster.png"'));assert.ok(html.includes('data-url="video.mp4"'));assert.ok(!html.includes('<video'));
    assert.ok(!/<img src=/.test(html));assert.ok(ctx.thumbMediaHtml({}).includes('<img src='));
});
test('suspending an image cannot trigger proxy or preview fallback reloads',()=>{
    const listeners=[];let reloads=0;
    const img={dataset:{smartGroupSrc:'preview.png'},hasAttribute:()=>false,addEventListener:(_name,fn)=>listeners.push(fn),set src(v){reloads++;}};
    const ctx=vm.createContext({proxiedMediaUrl:()=> 'proxy.png',manageSmartGroupPreviews(){}});
    load(ctx,['bindImageProxyFallback','bindSmartPreviewImageFallbacks']);
    ctx.bindImageProxyFallback(img,'original.png');ctx.bindSmartPreviewImageFallbacks({querySelectorAll:()=>[img]});
    listeners.forEach(fn=>fn());assert.equal(reloads,0);
});
test('completed run labels do not keep timer alive or rewrite unchanged text',()=>{
    let started=0,stopped=0,writes=0,text='';const node={id:'a',runFinishedAt:100};
    const el={dataset:{runTimer:'a'},classList:{toggle(){}},get textContent(){return text;},set textContent(v){writes++;text=v;}};
    const ctx=vm.createContext({nodes:[node],runTimerInterval:null,document:{querySelectorAll:()=>[el]},
        smartNodePendingCount:n=>n.pending||0,formatRunDuration:ms=>String(ms),nodeRunElapsedMs:()=>100,
        setInterval:()=>{started++;return 1;},clearInterval:()=>stopped++});
    load(ctx,['refreshRunTimerPills']);ctx.refreshRunTimerPills();ctx.refreshRunTimerPills();
    assert.equal(started,0);assert.equal(writes,1);
    node.running=true;ctx.refreshRunTimerPills();assert.equal(started,1);
    node.running=false;ctx.refreshRunTimerPills();assert.equal(stopped,1);assert.equal(ctx.runTimerInterval,null);
});
