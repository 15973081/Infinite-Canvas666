const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../static'),results=fs.readFileSync(path.join(root,'js/canvas/smart/smart-results.js'),'utf8');

test('Smart trim construction is lazy and exposes only frozen UI scalars, without a second target/player owner',()=>{
    const context=vm.createContext({});vm.runInContext(results,context);
    const state=vm.runInContext('createSmartVideoTrimPanel().state',context);
    assert.ok(Object.isFrozen(state));assert.equal(state.active,false);
    assert.ok(Object.values(state).every(value=>typeof value!=='object'));
    assert.equal(vm.runInContext('typeof videoTrimState',context),'undefined');
    assert.equal(vm.runInContext('typeof VIDEO_TRIM_MIN_DURATION',context),'undefined');
    const owner=results.slice(results.indexOf('function createSmartVideoTrimPanel('),results.indexOf('\nfunction resetVideoTrimState(){return'));
    assert.doesNotMatch(owner,/getElementById\(['"]previewCurrentVideo['"]\)|\.video\(\)/);
    assert.doesNotMatch(owner,/\b(?:target|nodeId|imageIndex)\s*=/);
    assert.match(owner,/smartImageEditor\.guardPreviewCallback/);
    assert.match(owner,/smartPreviewGestures\.(?:onVideo|videoState|seekVideo|playVideo)/);
});

test('Smart trim controls use removable feature listeners and no external mutable trim fields',()=>{
    for(const filename of ['js/smart-canvas.js','js/canvas/smart/smart-media-editor.js','js/canvas/smart/smart-workspace.js']){
        const source=fs.readFileSync(path.join(root,filename),'utf8');
        assert.doesNotMatch(source,/\bvideoTrimState\b|\bVIDEO_TRIM_MIN_DURATION\b/);
        assert.doesNotMatch(source,/(?:getElementById|element)\(['"]videoTrim[^'"]+['"]\)/);
    }
    const html=fs.readFileSync(path.join(root,'smart-canvas.html'),'utf8');
    assert.doesNotMatch(html,/on(?:click|change|input)="(?:[a-zA-Z]*VideoTrim)/);
    assert.match(html,/data-video-trim-close/);assert.match(html,/data-video-trim-point="start"/);
    assert.match(results,/resumeSmartEditorPreview/);assert.match(results,/destroySmartEditorPreview/);
});

test('Smart trim rendering reads session choices; submitted receipts use captured range and dimensions',()=>{
    const {functionSource}=require('./helpers/canvas-source.cjs');
    assert.doesNotMatch(functionSource(results,'syncVideoTrimUi'),/videoTrimState\.[a-z]+\s*=(?!=)/);
    const apply=functionSource(results,'applyVideoTrim');
    assert.match(apply,/const task=Object\.freeze/);
    const receipt=apply.slice(apply.indexOf('const result=await'));
    assert.doesNotMatch(receipt,/videoTrimState\.(?:start|end)|video\.(?:videoWidth|videoHeight)/);
    assert.match(receipt,/canvas\?\.id!==task\.canvasId/);
    assert.match(receipt,/busyTask===task/);
});
