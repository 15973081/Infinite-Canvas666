const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {functionSource}=require('./helpers/canvas-source.cjs');
const read=file=>fs.readFileSync(path.join(__dirname,'../static',file),'utf8');
const source=read('js/canvas/classic/canvas-results.js');

test('Classic preview construction is lazy and exposes frozen snapshots without media, targets or mutable pan',()=>{
    const context=vm.createContext({});vm.runInContext(source,context);
    const owner=vm.runInContext('createClassicOutputPreview()',context),state=owner.state;
    assert.ok(Object.isFrozen(owner)&&Object.isFrozen(state)&&Object.isFrozen(state.pan));
    assert.equal(state.open,false);assert.equal(state.targetValid,false);
    assert.equal(Reflect.set(state,'open',true),false);assert.equal(Reflect.set(state.pan,'x',99),false);
    assert.equal(owner.state.pan.x,0);
    assert.ok(Object.keys(state).every(key=>!['player','node','meta','element'].includes(key)));
    for(const name of ['outputTrimState','outputTrimJob','currentOutputLightboxUrl','currentOutputMeta','outputPreviewPan'])assert.equal(vm.runInContext('typeof '+name,context),'undefined');
});

test('Classic preview callers own no preview fields or DOM; keyboard and virtualization use the owner',()=>{
    for(const file of ['js/canvas.js','js/canvas/classic/canvas-workspace.js']){
        const code=read(file);
        assert.doesNotMatch(code,/\b(?:currentOutput(?:Meta|CompareUrl|LightboxOutId|LightboxUrl)|outputPreviewPan|outputPreviewZoom|outputCompareDrag|outputTrim(?:State|Job|Frame)|outputLightbox)\b/);
    }
    const workspace=read('js/canvas/classic/canvas-workspace.js');
    assert.match(workspace,/classicOutputPreview\.previewedNodeIds\(\)/);
    assert.match(workspace,/classicOutputPreview\.dataChanged\(\)/);
    assert.match(workspace,/Escape' && classicOutputPreview\.state\.open/);
    const html=read('canvas.html').split('<div id="outputLightbox"')[1].split('<div id="cropModal"')[0];
    // Only this shared window belongs to the owner, not subsequent unrelated modals.
    assert.doesNotMatch(html.slice(0,html.indexOf('id="outputRerunBtn"')+200),/onclick=|oninput=|onchange=/);
});

test('Classic preview retention validates once for a large virtualization pass and returns only IDs',()=>{
    let validations=0,valid=true;
    const context=vm.createContext({openState:true,targetValid:()=>{validations++;return valid;},currentOutputLightboxOutId:'19999',currentOutputLightboxUrl:'/shared',nodes:Array.from({length:20000},(_,i)=>({id:String(i),url:i===123?'/shared':'/image-'+i}))});
    vm.runInContext(functionSource(source,'previewedNodeIds'),context);
    const ids=context.previewedNodeIds();assert.deepEqual([...ids],['123','19999']);assert.ok(Object.isFrozen(ids));assert.equal(validations,1);
    valid=false;assert.deepEqual([...context.previewedNodeIds()],[]);assert.equal(validations,2);
});

test('Classic preview keeps submitted downloads and trim independent of UI invalidation and never owns selection',()=>{
    const owner=functionSource(source,'createClassicOutputPreview');
    assert.doesNotMatch(owner,/\b(?:selected|nodes|canvas)\s*=/);
    assert.match(owner,/canvas\?\.id !== canvasId \|\| isCanvasLockedByOther\(\)/);
    assert.match(owner,/outputTrimState === state && openState && targetValid\(\)/);
    const close=functionSource(owner,'clearOutputPreview');
    assert.doesNotMatch(close,/outputTrimJob\s*=/);
    assert.doesNotMatch(functionSource(source,'downloadUrl'),/classicOutputPreview|targetValid|revision/);
    assert.doesNotMatch(functionSource(source,'downloadGroupNodeImages'),/classicOutputPreview|targetValid|revision/);
});
