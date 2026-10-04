const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../static/js'),results=fs.readFileSync(path.join(root,'canvas/smart/smart-results.js'),'utf8');
const owned=['previewCompareOn','previewCompareIndex','previewMetaExtraText'];
test('Smart normal preview privately owns comparison/meta DOM through its existing feature object',()=>{
    const c=vm.createContext({});vm.runInContext(results,c);
    for(const name of [...owned,'previewCompareSources','previewResolutionText','rememberPreviewImageResolution'])assert.equal(vm.runInContext('typeof '+name,c),'undefined',name);
    const state=vm.runInContext('createSmartPreviewGestures().state',c);assert.ok(Object.isFrozen(state)&&Object.isFrozen(state.pan));assert.equal(state.compareIndex,-1);
    for(const filename of ['smart-canvas.js','canvas/smart/smart-media-editor.js','canvas/smart/smart-workspace.js']){
        const source=fs.readFileSync(path.join(root,filename),'utf8');for(const name of owned)assert.doesNotMatch(source,new RegExp('\\b'+name+'\\b'));
        assert.doesNotMatch(source,/getElementById\(['"](?:previewCurrentImage|previewCompareImage|previewCurrentVideo|previewMetaHint|compareThumbs|compareToggleBtn)['"]\)/);
        assert.doesNotMatch(source,/element\(['"](?:previewCurrentImage|previewCompareImage|previewCurrentVideo|previewMetaHint|compareThumbs|compareToggleBtn)['"]\)/);
    }
});
test('Smart preview presenter reads a selection repaired by commands and owns no second image target',()=>{
    const {functionSource}=require('./helpers/canvas-source.cjs');const render=functionSource(results,'renderPreview');
    for(const field of owned)assert.doesNotMatch(render,new RegExp('\\b'+field+'\\s*=(?!=)'));
    assert.doesNotMatch(render,/updatePreviewMetaHint\(/);
    const owner=results.slice(results.indexOf('function createSmartPreviewGestures('),results.indexOf('\nfunction smartEditorPreviewState'));
    assert.doesNotMatch(owner,/\b(?:selectedId|selectedImage|previewNavState|detachedEditPreview)\s*=/);
    assert.doesNotMatch(owner,/getElementById\(['"]cropImage['"]\)/);
    assert.match(owner,/smartImageEditor\.guardPreviewCallback/);assert.match(owner,/smartImageEditor\.imageResolution\(\)/);
});
