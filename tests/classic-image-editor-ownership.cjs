const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../static/js');
const editor=fs.readFileSync(path.join(root,'canvas/classic/canvas-media-editor.js'),'utf8');
const entry=fs.readFileSync(path.join(root,'canvas.js'),'utf8');
const owned=['cropState','cropDrag','imageEditMode','imageEditModeTouched','editDrawState','editTextItems',
    'editTextSelectedId','editTextDrag','editTextDirty','editTextInlineEditor','editDrawUndoStack','editDrawRedoStack',
    'brushTool','brushLabelCounter','gridCustomMode','gridCustomLines','gridCustomOrientation','gridCustomHistory',
    'gridCustomDrag','imageEditZoom','imageEditBaseW','imageEditBaseH'];

test('Classic image editor owns all 22 session bindings, DOM helpers and local history without eager DOM access',()=>{
    const context=vm.createContext({});
    vm.runInContext(editor,context);
    for(const name of [...owned,'editDrawCanvas','editTextCanvas','editDrawSnapshot','selectedEditTextItem']){
        assert.equal(vm.runInContext('typeof '+name,context),'undefined',name+' must remain private');
        assert.doesNotMatch(entry,new RegExp('^(?:let|const|var) '+name+'\\b','m'));
    }
    const state=vm.runInContext('createClassicImageEditor().state',context);
    assert.equal(Object.isFrozen(state),true);
    assert.equal(state.open,false);
    assert.ok(Object.values(state).every(value=>value===null||typeof value!=='object'),'snapshots contain no arrays or DOM');
    assert.match(entry,/const classicImageEditor = createClassicImageEditor\(\);/);
    const factory=editor.slice(editor.indexOf('function createClassicImageEditor('),editor.indexOf('\nfunction openImageEditor(...args)'));
    assert.doesNotMatch(factory,/\b(?:undoStack|redoStack)\b/,'canvas history remains outside the editor');
});

test('Classic workspace and other modules use editor intents rather than private fields or dedicated DOM',()=>{
    for(const file of fs.readdirSync(path.join(root,'canvas/classic')).filter(file=>file.endsWith('.js')&&file!=='canvas-media-editor.js')){
        const source=fs.readFileSync(path.join(root,'canvas/classic',file),'utf8');
        for(const name of owned)assert.doesNotMatch(source,new RegExp('\\b'+name+'\\b'),file+' must use editor commands');
        assert.doesNotMatch(source,/getElementById\(['"](?:cropImage|cropBox|cropCanvas|imageEditModal|editDrawCanvas|editTextCanvas)['"]\)/);
    }
    const workspace=fs.readFileSync(path.join(root,'canvas/classic/canvas-workspace.js'),'utf8');
    assert.match(workspace,/classicImageEditor\.isEditingNode\(node\.id\)/);
    assert.match(workspace,/classicImageEditor\.state\.open/);
});
