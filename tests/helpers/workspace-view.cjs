const fs=require('node:fs'),vm=require('node:vm');
const {functionSource}=require('./canvas-source.cjs');
function installWorkspaceView(context,kind){
 const owner=kind==='classic'?'classicWorkspaceView':'smartWorkspaceView';
 if(context[owner])return context[owner];
 const factory=kind==='classic'?'createClassicWorkspaceView':'createSmartWorkspaceView';
 const file=kind==='classic'?'canvas-workspace.js':'smart-workspace.js';
 const source=fs.readFileSync(require('node:path').join(__dirname,'../../static/js/canvas',kind,file),'utf8').replace(/\r\n/g,'\n');
 vm.runInContext(functionSource(source,factory),context);
 context[owner]=context[factory]();
 if(kind==='smart')for(const name of ['smartNodeForComputation','smartConnectionsForComputation'])vm.runInContext(functionSource(source,name),context);
 return context[owner];
}
module.exports={installWorkspaceView};
