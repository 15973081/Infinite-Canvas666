const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../static/js/smart-canvas.js'),'utf8').replace(/\r\n/g,'\n');
function setup(locked){
 const calls=[],node={id:'b',inputNodeIds:['a']};
 const c=vm.createContext({canvas:{connections:[{from:'a',to:'b',kind:'input'}]},nodes:[node],locked,
 isSmartCanvasLocked:()=>c.locked,pushUndo:()=>calls.push('undo'),clearDetachedRunInputRefs:()=>calls.push('clear'),render:()=>calls.push('render'),scheduleSave:()=>calls.push('save')});
 const start=source.indexOf('function disconnectConnection(');vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),c);
 return {c,calls,node};
}
test('view mode preserves connection and input bindings without undo or saving',()=>{
 const {c,calls,node}=setup(true);c.disconnectConnection(0);
 assert.equal(c.canvas.connections.length,1);assert.deepEqual(node.inputNodeIds,['a']);assert.deepEqual(calls,[]);
});
test('permission is checked at deletion time after edit mode ends',()=>{
 const {c,calls}=setup(false);c.locked=true;c.disconnectConnection(0);assert.equal(c.canvas.connections.length,1);assert.deepEqual(calls,[]);
});
test('editing mode disconnects and updates inputs normally',()=>{
 const {c,calls,node}=setup(false);c.disconnectConnection(0);assert.equal(c.canvas.connections.length,0);assert.equal(node.inputNodeIds.length,0);assert.deepEqual(calls,['undo','clear','render','save']);
});
