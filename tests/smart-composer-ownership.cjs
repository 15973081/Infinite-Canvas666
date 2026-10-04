const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {functionSource}=require('./helpers/canvas-source.cjs');const source=fs.readFileSync('static/js/canvas/smart/smart-workspace.js','utf8');

test('Smart composer session is lazy, frozen and not exposed through entry or other modules',()=>{
 const c=vm.createContext({});vm.runInContext(functionSource(source,'createSmartComposer'),c);const owner=c.createSmartComposer();assert.ok(Object.isFrozen(owner)&&Object.isFrozen(owner.state));assert.equal(owner.state.open,false);assert.equal(owner.state.targetValid,false);assert.ok(Object.values(owner.state).every(v=>typeof v!=='object'));
 for(const file of ['static/js/smart-canvas.js','static/js/canvas/smart/smart-document.js','static/js/canvas/smart/smart-execution.js','static/js/canvas/smart/smart-library.js']){
  const text=fs.readFileSync(file,'utf8');assert.doesNotMatch(text,/\b(?:activeComposerSubject|lastComposerNodeId|smartComposerBaseline)\b/,file);
 }
});

test('Smart composer document/task notifications preserve core operations and do not create another data store',()=>{
 const owner=functionSource(source,'createSmartComposer');assert.doesNotMatch(owner,/\b(?:selectedId|selectedIds|selectedImage|nodes|undoStack|redoStack)\s*=(?!=)/);
 assert.match(owner,/if\(switchedNode\) savePromptDraftForCurrent\(\)/);assert.match(owner,/if\(switchedNode\)\{\s*settings = smartSettingsForNode\(subject\);\s*loadPromptDraft\(subject\);/);
 assert.doesNotMatch(owner,/scheduleSave\(|pushUndo\(|clone.*nodes/);assert.match(functionSource(owner,'smartComposerChanges'),/baseline\.settings/);
 for(const name of ['activeComposerNode','smartComposerChanges','savePromptDraftForCurrent'])assert.match(functionSource(source,name),/return smartComposer\./);
});
