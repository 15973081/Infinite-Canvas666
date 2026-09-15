const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../static/js/canvas-focus.js'),'utf8');
function classes(){const set=new Set();return {toggle:(key,on)=>on?set.add(key):set.delete(key),add:key=>set.add(key),contains:key=>set.has(key)};}
for(const smart of [false,true]) test((smart?'smart':'classic')+' focus preserves iframe and prioritizes modal Escape',()=>{
 const listeners={},parentListeners={},attrs={},host={append(node){this.button=node;}};
 let modal=false;
 const doc={documentElement:{classList:classes()},querySelector:s=>s==='#quickToolbar'?(!smart?host:null):{parentElement:host},getElementById:id=>id==='smartWorkflowToggle'&&smart?{}:null,
 createElement:()=>({classList:classes(),setAttribute:(k,v)=>attrs[k]=v,addEventListener:(k,v)=>listeners['button:'+k]=v,focus(){}}),
 querySelectorAll:()=>modal?[{getAttribute:()=>null,getClientRects:()=>[{}]}]:[],defaultView:{getComputedStyle:()=>({display:'block',visibility:'visible'})}};
 const parentDoc={documentElement:{classList:classes()},querySelectorAll:()=>[]};
 const parent={document:parentDoc,addEventListener:(k,v)=>parentListeners[k]=v,removeEventListener:k=>delete parentListeners[k]};
 const win={parent,frameElement:{id:'frame-canvas'},addEventListener:(k,v)=>listeners[k]=v,dispatchEvent(){}};
 vm.runInNewContext(source,{document:doc,window:win,Event:class{}});
 const click=()=>listeners['button:click']({stopPropagation(){}});
 const esc=()=>listeners.keydown({key:'Escape',preventDefault(){},stopImmediatePropagation(){}});
 click();assert.equal(attrs['aria-pressed'],'true');assert.equal(parentDoc.documentElement.classList.contains('canvas-focus-host'),true);
 modal=true;esc();assert.equal(attrs['aria-pressed'],'true');
 modal=false;esc();assert.equal(attrs['aria-pressed'],'false');assert.equal(parentDoc.documentElement.classList.contains('canvas-focus-host'),false);
 click();listeners.pagehide();assert.equal(attrs['aria-pressed'],'false');assert.equal(parentListeners.keydown,undefined);
});
