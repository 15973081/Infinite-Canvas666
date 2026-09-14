const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('management/frontend/management.js','utf8');
const body=source.slice(source.indexOf('  const backupStates ='),source.indexOf('  const taskStates ='));
function fixture(perms=['backup.read','backup.request']) {
  const dialogs=[],writes=[],reads=[],buttons=[];
  class Element {constructor(tag,text){this.tag=tag;this.textContent=text;this.children=[];}append(...nodes){this.children.push(...nodes);}querySelector(){return this.input;}}
  const context=vm.createContext({workspace:'space-a',backupAfter:'',me:{member:{id:'admin'}},Date,
    crypto:{randomUUID:()=> 'stable-id'},document:{createTextNode:text=>text},
    el:(tag,text)=>new Element(tag,text),table:()=>new Element('table'),labelText:()=>new Element('label'),actions:(...nodes)=>nodes,
    field:()=>{const e=new Element('label');e.input={};return e;},
    dialog:(title,nodes,submit)=>dialogs.push({title,nodes,submit}),
    call:async(path,method,payload)=>{writes.push({path,method,payload});if(writes.length===1)throw new Error('connection lost');return {};},
    api:async path=>{reads.push(path);return{jobs:[],configured:true,next:null};},
    scoped:path=>path+'?workspace='+context.workspace,allowed:p=>perms.includes(p),
    denied:()=>['denied'],button:(text,fn)=>{const e=new Element('button',text);e.onclick=fn;buttons.push(e);return e;},refresh(){},render(){}
  });
  vm.runInContext(body,context);return{context,dialogs,writes,reads,buttons};
}
const form=(note='备份说明',confirmed=true)=>({get:()=>note,has:()=>confirmed});
test('backup request needs explicit scope confirmation and retains identity on retry',async()=>{
  const f=fixture();f.context.requestBackup('space-a');
  const submit=f.dialogs[0].submit;
  await assert.rejects(()=>submit(form('说明',false)),/确认/);
  await assert.rejects(()=>submit(form()),/connection lost/);
  await submit(form());
  assert.deepEqual(f.writes[0],f.writes[1]);
  assert.equal(f.writes[0].path,'/api/backups?workspace=space-a');
  assert.equal(f.writes[0].payload.request_id,'stable-id');
  await assert.rejects(()=>submit(form('另一说明')),/不能更改/);
  f.context.workspace='space-b';
  await assert.rejects(()=>submit(form()),/范围已变化/);
});
test('backup viewer cannot request and requester does not read unauthorized records',async()=>{
  const reader=fixture(['backup.read']);await reader.context.backupView();
  assert.equal(reader.reads.length,1);
  assert.ok(!reader.buttons.some(b=>b.textContent==='请求空间导出'));
  const requester=fixture(['backup.request']);await requester.context.backupView();
  assert.equal(requester.reads.length,0);
  assert.ok(requester.buttons.some(b=>b.textContent==='请求空间导出'));
});
test('platform backup requires the platform permission and does not inherit space grants',async()=>{
  const f=fixture();f.context.workspace='';
  assert.deepEqual(Array.from(await f.context.backupView()),['denied']);
  assert.equal(f.reads.length,0);
});
