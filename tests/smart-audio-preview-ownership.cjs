const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../static'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const results=read('js/canvas/smart/smart-results.js');

test('Smart audio construction is lazy; feature and snapshot expose no mutable target/player/DOM',()=>{
    const context=vm.createContext({});vm.runInContext(results,context);
    const owner=vm.runInContext('createSmartAudioPreview()',context),snapshot=owner.state;
    assert.ok(Object.isFrozen(owner)&&Object.isFrozen(snapshot));
    assert.equal(snapshot.open,false);assert.equal(snapshot.targetValid,false);
    assert.ok(Object.values(snapshot).every(value=>typeof value!=='object'));
    assert.equal(Reflect.set(snapshot,'open',true),false);assert.equal(owner.state.open,false);
    assert.equal(vm.runInContext('typeof smartAudioLightboxState',context),'undefined');
});

test('Smart audio callers use complete commands and predicates without session fields, audio DOM or player creation',()=>{
    for(const file of ['js/smart-canvas.js','js/canvas/smart/smart-workspace.js','js/canvas/smart/smart-document.js','js/canvas/smart/smart-media-editor.js']){
        const source=read(file);
        assert.doesNotMatch(source,/\bsmartAudioLightbox(?:State|Title|Host)?\b/);
        assert.doesNotMatch(source,/createElement\(['"]audio['"]\)/);
    }
    const workspace=read('js/canvas/smart/smart-workspace.js'),document=read('js/canvas/smart/smart-document.js');
    assert.match(workspace,/return smartAudioPreview\.openExternal\(ref\)/);
    assert.match(workspace,/smartAudioPreview\.isPreviewingNode\(node\.id\)/);
    assert.match(workspace,/Escape' && smartAudioPreview\.state\.open/);
    assert.match(document,/smartAudioPreview\.closeForNodes\(deleteIds\)/);
    const modal=read('smart-canvas.html').split('<div id="smartAudioLightbox"')[1].split('<div id="toast"')[0];
    assert.doesNotMatch(modal,/onclick=/);assert.match(modal,/data-audio-close/);assert.match(modal,/data-audio-download/);
});

test('Smart audio owner keeps native playback independent of image/video targets and selection ownership',()=>{
    const {functionSource}=require('./helpers/canvas-source.cjs'),owner=functionSource(results,'createSmartAudioPreview');
    assert.doesNotMatch(owner,/\b(?:selectedId|selectedIds|selectedImage)\s*=/);
    assert.doesNotMatch(owner,/smartPreviewGestures|currentEditImage\(/);
    assert.match(owner,/activateSmartAudioPreviewTarget\(node,index\)/);
    assert.match(owner,/const item=target\.node\.images\?\.\[target\.index\]/);
    assert.match(owner,/item\?\.url===target\.url/);
    assert.match(owner,/canvas\?\.id!==target\.canvasId/);
    assert.match(owner,/origin!==revision \|\| player!==audio/);
    assert.match(functionSource(results,'closeSmartAudioLightbox'),/smartAudioPreview\.close/);
});
