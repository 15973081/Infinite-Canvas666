const fs=require('node:fs'),vm=require('node:vm');
const {functionSource}=require('./canvas-source.cjs');
const source=fs.readFileSync('static/js/canvas/smart/smart-workspace.js','utf8');

// Isolated legacy function tests use the production owner, not writable globals.
function installSmartSelection(context){
 const seed={selectedId:context.selectedId || '',selectedIds:context.selectedIds || [],
  selectedImage:context.selectedImage || {nodeId:'',index:-1}};
 if(!vm.isContext(context))vm.createContext(context);
 vm.runInContext(functionSource(source,'createSmartSelection'),context);
 context.smartSelection=context.createSmartSelection();
 context.smartSelection.restoreDocument(seed);
 delete context.selectedId;delete context.selectedIds;delete context.selectedImage;
 return context.smartSelection;
}
module.exports={installSmartSelection};
