const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {functionSource}=require('./helpers/canvas-source.cjs');
const source=fs.readFileSync('static/js/canvas/classic/canvas-library.js','utf8').replace(/\r\n/g,'\n');
test('Classic manager state and DOM have one owner; library callbacks notify without writable aliases',()=>{
 const body=functionSource(source,'createClassicLibraryManager'),outside=source.replace(body,'');
 const entry=fs.readFileSync('static/js/canvas.js','utf8');
 for(const name of ['assetManagerTab','managerSelectedAssetIds','managerSelectedWorkflowIds','managerSelectedPromptIds','assetManagerModal','assetManagerBody']){
  assert.doesNotMatch(outside,new RegExp('\\b'+name+'\\b'));assert.doesNotMatch(entry,new RegExp('\\b'+name+'\\b'));
 }
 assert.match(functionSource(source,'classicAssetSelectionChanged'),/classicLibraryManager.selectionChanged/);
 assert.match(functionSource(source,'deleteCanvasAssetItem'),/classicLibraryManager.itemsRemoved/);
 assert.match(body,/if\(accept\(uiOrigin\)\)managerSelectedWorkflowIds.clear\(\)/);
});
test('Classic manager construction is lazy and snapshots cannot alter live state; destroy is final',()=>{
 const c=vm.createContext({document:{getElementById:()=>assert.fail('constructor cannot query DOM')},window:{},});
 vm.runInContext(functionSource(source,'createClassicLibraryManager'),c);const owner=c.createClassicLibraryManager(),before=owner.state;
 assert.ok(Object.isFrozen(owner)&&Object.isFrozen(before)&&Object.isFrozen(before.assetIds));
 assert.throws(()=>before.assetIds.push('a'));assert.equal(owner.state.tab,'assets');owner.destroy();owner.destroy();owner.open();owner.bind();owner.reveal();owner.selectionChanged('manager-assets');owner.close();assert.equal(owner.state.destroyed,true);assert.equal(owner.state.open,false);
});
test('Classic manager async UI guards do not enclose the committed data updates',()=>{
 const body=functionSource(source,'createClassicLibraryManager');
 assert.match(body,/const data = await classicAssetPanel.mutate[\s\S]*setCanvasAssetLibraryFromResponse\(data, \{render:false\}\);\s*if\(accept\(uiOrigin\)\)managerSelectedAssetIds.clear\(\)/);
 assert.match(body,/const data = await window.CanvasApi.deletePromptItems[\s\S]*canvasPromptLibraries = data.library\?\.libraries \|\| canvasPromptLibraries;\s*if\(accept\(uiOrigin\)\)managerSelectedPromptIds.clear\(\)/);
 assert.match(body,/listen\(upload,'change',[\s\S]*undefined,renderBindings/);
});
