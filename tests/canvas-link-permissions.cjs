const {readCanvasSource} = require('./helpers/canvas-source.cjs');
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=readCanvasSource(require('node:path').join(__dirname,'../static/js/canvas.js'),'utf8');
function setup(locked){
 const calls=[];
 const c=vm.createContext({locked,canvas:{id:'c'},connections:[{id:'edge'}],hoveredConnectionId:'edge',nodes:[{id:'a'}],
  isCanvasLockedByOther:()=>c.locked,pushUndo:()=>calls.push('undo'),syncGeneratorInputs:()=>calls.push('sync'),render:()=>calls.push('render'),scheduleSave:()=>calls.push('save'),renderLinks:()=>calls.push('links'),setStatus(){},portPoint:()=>({x:0,y:0}),
  startWindowPointerSession:(_move,finish)=>c.finish=finish});
 for(const name of ['deleteConnection','applyKnifeCut','startKnifeDrag','startLink']){
  const start=source.indexOf('function '+name+'(');vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),c);
 }
 return {c,calls};
}
test('view mode cannot delete or cut connections or add undo/save entries',()=>{
 const {c,calls}=setup(true);c.deleteConnection('edge');c.applyKnifeCut({x:0,y:0},{x:1,y:1});
 assert.equal(c.startKnifeDrag({}),false);assert.equal(c.connections.length,1);assert.equal(c.hoveredConnectionId,'edge');assert.deepEqual(calls,[]);
});
test('editing mode can delete a connection and save normally',()=>{
 const {c,calls}=setup(false);c.deleteConnection('edge');assert.equal(c.connections.length,0);assert.deepEqual(calls,['undo','sync','render','save']);
});
test('losing edit permission before releasing a link cancels the operation',()=>{
 const {c,calls}=setup(false);c.startLink({stopPropagation(){}},'a','out');c.locked=true;c.finish({});
 assert.equal(c.tempLink,null);assert.equal(c.connections.length,1);assert.deepEqual(calls,['links']);
});
