const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../static/js');
const media=fs.readFileSync(path.join(root,'canvas/smart/smart-media-editor.js'),'utf8');
const results=fs.readFileSync(path.join(root,'canvas/smart/smart-results.js'),'utf8');
const entry=fs.readFileSync(path.join(root,'smart-canvas.js'),'utf8');
const owned=['cropState','cropDrag','imageEditMode','imageEditModeTouched','editDrawState','editTextItems',
    'editTextSelectedId','editTextDrag','editTextDirty','editTextInlineEditor','editDrawUndoStack','editDrawRedoStack',
    'brushTool','brushLabelCounter','gridCustomMode','gridCustomLines','gridCustomOrientation','gridCustomHistory',
    'gridCustomDrag','gridOperationMode','gridJoinLayout','gridJoinDrag','gridJoinImageCache','gridJoinUserMoved','gridJoinOutputSize',
    'imageEditZoom','imageEditBaseW','imageEditBaseH','imageEditPanDrag','smartEditableResource','smartEditableJob'];
const preview=['previewZoom','previewPan','previewPanDrag','previewCompareDrag','previewComparePos'];

test('Smart editor privately owns 31 original bindings and dedicated DOM/history; snapshot is frozen and construction is lazy',()=>{
    const context=vm.createContext({});vm.runInContext(media,context);
    for(const name of [...owned,'editDrawCanvas','editTextCanvas','editDrawSnapshot','gridSplitRects','imageEditModal']){
        assert.equal(vm.runInContext('typeof '+name,context),'undefined',name);
        assert.doesNotMatch(entry,new RegExp('^(?:let|const|var) '+name+'\\b','m'));
    }
    const state=vm.runInContext('createSmartImageEditor().state',context);
    assert.equal(Object.isFrozen(state),true);assert.equal(state.open,false);
    assert.ok(Object.values(state).every(value=>typeof value!=='object'),'UI snapshots contain no arrays, nodes or DOM');
    assert.doesNotMatch(media.slice(media.indexOf('function createSmartImageEditor(')),/\b(?:undoStack|redoStack)\b/);
    assert.match(entry,/const smartImageEditor = createSmartImageEditor\(\);/);
});

test('Smart results uniquely owns preview gestures, editor selection is not duplicated, and workspace delegates both owners',()=>{
    const context=vm.createContext({});vm.runInContext(results,context);
    for(const name of preview){assert.equal(vm.runInContext('typeof '+name,context),'undefined',name);assert.doesNotMatch(entry,new RegExp('^(?:let|const|var) '+name+'\\b','m'));}
    const pose=vm.runInContext('createSmartPreviewGestures().state',context);
    assert.ok(Object.isFrozen(pose)&&Object.isFrozen(pose.pan));
    for(const filename of fs.readdirSync(path.join(root,'canvas/smart')).filter(name=>name.endsWith('.js'))){
        const source=fs.readFileSync(path.join(root,'canvas/smart',filename),'utf8');
        assert.doesNotMatch(source,/\b(?:previewNavState|detachedEditPreview)\b/,filename);
        if(filename!=='smart-media-editor.js')for(const name of owned)assert.doesNotMatch(source,new RegExp('\\b'+name+'\\b'),filename+': '+name);
        if(filename!=='smart-results.js')for(const name of preview)assert.doesNotMatch(source,new RegExp('\\b'+name+'\\b'),filename+': '+name);
    }
    const workspace=fs.readFileSync(path.join(root,'canvas/smart/smart-workspace.js'),'utf8');
    assert.match(workspace,/smartImageEditor\.isEditingNode\(node\.id\)/);
    assert.match(workspace,/smartImageEditor\.moveWindowGesture\(e\)/);
    assert.match(workspace,/smartPreviewGestures\.movePan\(e\)/);
    assert.doesNotMatch(workspace,/getElementById\(['"](?:cropImage|cropBox|cropCanvas|imageEditModal|editDrawCanvas|editTextCanvas)['"]\)/);
});
