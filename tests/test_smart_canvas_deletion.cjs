const {installSmartSelection}=require('./helpers/smart-selection.cjs');
const {readCanvasSource} = require('./helpers/canvas-source.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=readCanvasSource(require('node:path').join(__dirname,'../static/js/smart-canvas.js'),'utf8').replace(/\r\n/g,'\n');
const plain=v=>JSON.parse(JSON.stringify(v));
function setup(){
    const calls={save:0,refresh:[],links:0,composer:0,audio:0,video:0,release:[],correction:[]};
    const elements=new Map();
    const ctx=vm.createContext({nodes:[],canvas:{connections:[]},canvasUsesConnections:true,
        selectedId:'',selectedIds:[],selectedImage:{nodeId:'',index:-1},undoStack:[],undoSuppressed:false,UNDO_LIMIT:40,
        smartComposer:{documentReplaced(){}},smartImageEditor:{state:{nodeId:'',open:true}},
        smartAudioPreview:{nodeId:'',closeForNodes(ids){if(new Set(ids).has(this.nodeId))calls.audio++;}},smartWorkflowTransferModal:null,
        world:{querySelector:s=>elements.get(s.match(/data-id="(.*)"/)[1])},CSS:{escape:s=>s},
        releaseSmartGroupPreviews:el=>calls.release.push(el.id),closeImageEditor:()=>calls.video++,closeSmartAudioLightbox:()=>calls.audio++,
        refreshSmartNodes:(ids,opts)=>calls.refresh.push({ids:[...ids],forceIds:[...opts.forceIds]}),
        updateComposer:()=>calls.composer++,syncSelectionUi(){},refreshConnectionLayer:()=>calls.links++,
        scheduleSmartGeometryRefresh:(ids,passes)=>calls.correction.push({ids:[...ids],passes}),
        scheduleSave:()=>calls.save++,tr:s=>s,toast(){},render(){throw Error('unexpected full render');}});
    installSmartSelection(ctx);
    for(const name of ['snapshotForUndo','pushUndo','performUndo','isSmartImageNode','isHistoryGroupNode','hasHistoryConnection','demoteHistoryGroupNode','historyGroupForNode','smartAffectedNodeIds','deleteNode','deleteSmartNodes','finishSmartNodeRemoval','clearNodeMediaBeforeDelete','deleteNodeFromButton']){
        const start=source.indexOf(`function ${name}(`);assert.ok(start>=0,name);
        vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),ctx);
    }
    function node(id,extra={}){
        const n={id,type:'smart-image',images:[],...extra};ctx.nodes.push(n);
        const el={id,removed:false,media:[],querySelectorAll(){return this.media;},remove(){this.removed=true;elements.delete(id);}};elements.set(id,el);return n;
    }
    return {ctx,calls,elements,node};
}
test('delete removes owner/history once, preserves unrelated nodes and refreshes former dependants',()=>{
    const {ctx,calls,node,elements}=setup();node('a');node('h',{historyFor:'a'});node('b',{inputNodeIds:['a','h']});node('c');node('x');
    ctx.canvas.connections=[{from:'a',to:'h',kind:'history'},{from:'a',to:'b',kind:'input'},{from:'h',to:'b',kind:'input'},{from:'b',to:'c',kind:'input'}];
    ctx.smartSelection.restoreDocument({selectedId:'h',selectedIds:['a','x'],selectedImage:{nodeId:'h',index:0}});
    const x=elements.get('x');ctx.deleteNode('a');
    assert.deepEqual(plain(ctx.nodes.map(n=>n.id)),['b','c','x']);assert.equal(elements.get('x'),x);
    assert.deepEqual(plain(ctx.canvas.connections),[{from:'b',to:'c',kind:'input'}]);assert.deepEqual(plain(ctx.nodes[0].inputNodeIds),[]);
    assert.deepEqual(calls.refresh,[{ids:['b','c'],forceIds:[]}]);assert.equal(ctx.smartSelection.nodeId,'');assert.deepEqual(plain(ctx.smartSelection.ids),['x']);
    assert.equal(ctx.undoStack.length,1);assert.equal(calls.save,1);assert.equal(calls.links,1);assert.equal(calls.correction[0].passes,2);
});
test('bulk deletion is one snapshot/update, undo restores nodes, edges, media and selection',()=>{
    const {ctx,calls,node}=setup();node('a',{images:[{url:'asset://voice',kind:'audio'}]});node('b');node('x');
    ctx.smartSelection.boxSelection(['a','b']);ctx.canvas.connections=[{from:'a',to:'b',kind:'input'}];
    const before=plain(ctx.snapshotForUndo());ctx.deleteSmartNodes(['a','b']);
    assert.equal(ctx.undoStack.length,1);assert.equal(calls.links,1);assert.equal(calls.refresh.length,1);assert.equal(calls.save,1);
    let full=0;ctx.render=()=>full++;ctx.performUndo();assert.equal(full,1);assert.deepEqual(plain(ctx.snapshotForUndo()),before);
});
test('button clears media first, deletes on second click, refreshes history users and closes lightbox',()=>{
    const {ctx,calls,node,elements}=setup();const a=node('a',{images:[{url:'clip.mp4',kind:'video'}],w:250,h:200});node('h',{historyFor:'a'});node('b',{inputNodeIds:['h']});
    ctx.canvas.connections=[{from:'a',to:'h',kind:'history'},{from:'h',to:'b',kind:'input'}];ctx.smartImageEditor.state.nodeId='a';
    ctx.deleteNodeFromButton('a');assert.equal(ctx.nodes.includes(a),true);assert.deepEqual(plain(a.images),[]);assert.equal(a.w,undefined);
    assert.equal(elements.has('h'),false);assert.equal(calls.video,1);assert.deepEqual(calls.refresh[0],{ids:['a','b'],forceIds:['a']});
    assert.deepEqual(plain(ctx.nodes.find(n=>n.id==='b').inputNodeIds),[]);assert.equal(ctx.smartSelection.nodeId,'a');
    ctx.deleteNodeFromButton('a');assert.equal(elements.has('a'),false);assert.equal(ctx.undoStack.length,2);
});
test('unconnected mention composer is revalidated; unrelated lightbox remains open',()=>{
    const {ctx,calls,node}=setup();node('a');node('x');ctx.smartSelection.createdNode('x');ctx.smartImageEditor.state.nodeId='x';ctx.smartAudioPreview.nodeId='x';
    ctx.deleteNode('a');assert.equal(calls.composer,1);assert.equal(calls.audio,0);assert.equal(calls.video,0);
});
test('removed media resources are released; missing ids do not create undo or redraw',()=>{
    const {ctx,calls,node,elements}=setup();node('a');let paused=0,cleared=0,loaded=0;
    elements.get('a').media=[{pause:()=>paused++,removeAttribute:()=>cleared++,load:()=>loaded++}];ctx.smartAudioPreview.nodeId='a';
    ctx.deleteNode('a');assert.deepEqual([paused,cleared,loaded],[1,1,1]);assert.equal(calls.audio,1);
    ctx.deleteNode('a');assert.equal(ctx.undoStack.length,1);assert.equal(calls.save,1);
});
test('actual keyboard Delete branch batches selected nodes without an extra render or snapshot',()=>{
    const {ctx,calls,node}=setup();node('a');node('b');node('x');ctx.smartSelection.boxSelection(['a','b']);
    let prevented=0;ctx.e={key:'Delete',target:{},preventDefault:()=>prevented++};ctx.isEditableTarget=()=>false;
    const start=source.indexOf("    if((e.key === 'Delete' || e.key === 'Backspace')");
    const end=source.indexOf("    if((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'g'",start);
    vm.runInContext(source.slice(start,end),ctx);
    assert.equal(prevented,1);assert.equal(ctx.undoStack.length,1);assert.equal(calls.links,1);assert.equal(calls.save,1);
    assert.deepEqual(plain(ctx.nodes.map(n=>n.id)),['x']);
});
