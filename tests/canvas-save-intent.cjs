const {readCanvasSource} = require('./helpers/canvas-source.cjs');
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
for(const [file,dirty,lock] of [['canvas.js','localCanvasDirty','isCanvasLockedByOther'],['smart-canvas.js','smartCanvasDirty','isSmartCanvasLocked']]){
 const source=readCanvasSource('static/js/'+file,'utf8');
 const start=source.indexOf('function scheduleSave(){');
 const end=source.indexOf('\nfunction ',start+1);
 const fn=source.slice(start,end).split('\nasync function ')[0];
 function setup(editable,initial=false){
  const c={canvas:{},applyingRemoteCanvas:false,[dirty]:initial,saveTimer:null,savingCanvasNow:false,saveCanvasAgain:false,smartSaveInFlight:null,smartSaveAgain:false,marks:0,timers:0,setStatus(){},syncPixmaxSaveStatus(){},clearTimeout(){},setTimeout(){c.timers++;return 1;},saveCanvas(){},[lock]:()=>!editable};
  c.window={CanvasSession:{enabled:true},MemberCanvasEdit:{canEdit:editable,markDirty(){c.marks++;}}};
  vm.createContext(c);vm.runInContext(fn,c);return c;
 }
 test(file+' ignores load-time save callbacks in view mode',()=>{const c=setup(false);c.scheduleSave();assert.equal(c[dirty],false);assert.equal(c.marks,0);assert.equal(c.timers,0);});
 test(file+' preserves actual unsaved work after lease loss',()=>{const c=setup(false,true);c.scheduleSave();assert.equal(c[dirty],true);});
 test(file+' still schedules genuine edits',()=>{const c=setup(true);c.scheduleSave();assert.equal(c[dirty],true);assert.equal(c.marks,1);assert.equal(c.timers,1);});
}
