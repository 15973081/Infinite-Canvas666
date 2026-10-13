const {installSmartSelection}=require('./helpers/smart-selection.cjs');
const {readCanvasSource} = require('./helpers/canvas-source.cjs');
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function sourceFunction(path,name) {
    const source=readCanvasSource(path,'utf8'),start=source.indexOf('function '+name+'(');
    assert.ok(start>=0,name);return source.slice(start,source.indexOf('\n}',start)+2);
}
function adapter(kind) {
    const path='static/js/'+(kind==='classic'?'canvas.js':'smart-canvas.js');
    const document={id:'a',kind,revision:7,created_at:10,title:'server',logs:[{id:'server-fee'}],nodes:[],connections:[]};
    const context={canvas:document,nodes:[],connections:[],selected:new Set(['old']),selectedId:'old',selectedIds:['old'],
        localCanvasDirty:false,smartCanvasDirty:false,saveTimer:123,undoStack:['old'],pendingUndoSnapshot:{old:true},
        canvasUsesConnections:false,settings:{},canvasDefaultSmartSettings:{},markCount:0,cleared:[],
        clearTimeout:id=>context.cleared.push(id),
        render(){},renderCanvasList(){},resetCanvasHistory(){},resetCascadeRuntimeState(){},sanitizeConnections(){},setStatus(){},
        updateProviderModels(){},updateSmartCanvasNav(){},
        normalizeLegacySmartNode:node=>node,stripImageGenerationMeta:item=>item,mediaItemForStorage:item=>item,
        settingsForStorage:value=>structuredClone(value),cloneSmartSettings:value=>structuredClone(value),
        window:{MemberCanvasEdit:{markDirty:()=>context.markCount++}}};
    vm.createContext(context);
    if(kind==='smart')installSmartSelection(context);
    for(const name of kind==='classic' ? ['serializableCanvasNode','resetTransientRunState','restoreClassicMemberDraft'] : ['serializableSmartNode','removeRetiredSmartLoopNodes','restoreSmartMemberDraft']) {
        vm.runInContext(sourceFunction(path,name),context);
    }
    return {context,restore:context[kind==='classic'?'restoreClassicMemberDraft':'restoreSmartMemberDraft']};
}
for(const kind of ['classic','smart']) test(kind+' restores graph content without changing server identity, version, billing or restarting tasks',()=>{
    const f=adapter(kind),draft={id:'a',kind,revision:2,created_at:999,title:'recovered',icon:'draft',logs:[{id:'old-fee'}],
        settings:{model:'chosen'},connections:[{from:'n',to:'o'}],
        nodes:[{id:'n',prompt:'local work',running:true,pending:2,queued:true,pendingTasks:[{taskId:'old-task'}],_pending:[{canvasTaskId:'old-task'}]},
            {id:'o',type:'output',images:[{url:'/api/media/asset'}]}]};
    f.restore(draft);
    const current=f.context.canvas;
    assert.equal(current.id,'a');assert.equal(current.revision,7);assert.equal(current.created_at,10);
    assert.equal(current.logs[0].id,'server-fee');assert.equal(current.title,'recovered');
    assert.equal(current.nodes[0].prompt,'local work');assert.equal(Boolean(current.nodes[0].running),false);
    assert.equal(current.connections[0].from,'n');assert.equal(current.nodes[1].images[0].url,'/api/media/asset');
    assert.equal(f.context.saveTimer,null);assert.equal(f.context.markCount,1);
    if(kind==='classic') {assert.equal(current.nodes[0]._pending,undefined);assert.equal(f.context.localCanvasDirty,true);assert.equal(f.context.selected.size,0);}
    else {assert.equal(current.nodes[0].pendingTasks,undefined);assert.equal(current.nodes[0].pending,0);assert.equal(f.context.smartCanvasDirty,true);assert.equal(current.settings.model,'chosen');assert.equal(f.context.undoStack.length,0);}
    assert.equal(draft.nodes[0].running,true);
});
for(const kind of ['classic','smart']) test(kind+' rejects mismatched or malformed drafts before changing the current canvas',()=>{
    const f=adapter(kind),before=JSON.stringify(f.context.canvas);
    for(const draft of [{id:'other',kind,nodes:[],connections:[]},{id:'a',kind:kind==='classic'?'smart':'classic',nodes:[],connections:[]},{id:'a',kind,nodes:null,connections:[]}]) {
        assert.throws(()=>f.restore(draft));assert.equal(JSON.stringify(f.context.canvas),before);
    }
});

for(const direction of ['smart','list']) test('standalone member navigation to '+direction+' preserves the selected space',async()=>{
    const context={canvasId:'a',canvas:null,saveTimer:null,window:{CanvasSession:{enabled:true,url:path=>new URL(path,'http://canvas.local').href+(path.includes('?')?'&':'?')+'workspace=chosen-space'},location:{}},
        clearTimeout(){},savePromptDraftForCurrent(){}};
    context.window.location.replace=value=>{context.destination=value;};
    vm.createContext(context);
    const path=direction==='smart'?'static/js/canvas.js':'static/js/smart-canvas.js';
    const name=direction==='smart'?'openSmartCanvasPage':'backToCanvasList';
    vm.runInContext('async '+sourceFunction(path,name),context);
    await context[name]('canvas-id');
    const target=new URL(context.destination || context.window.location.href);
    assert.equal(target.searchParams.get('workspace'),'chosen-space');
    if(direction==='smart')assert.equal(target.searchParams.get('id'),'canvas-id');
});
