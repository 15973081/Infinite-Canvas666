const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const source=require('node:fs').readFileSync('management/frontend/management.js','utf8');
const body=source.slice(source.indexOf('  const occupancyStates ='),source.indexOf('  const taskStates ='));
function fixture(){
  const dialogs=[],writes=[],reads=[],buttons=[],tables=[];
  class Element {constructor(tag,text){this.tag=tag;this.textContent=text;this.children=[];this.input={};}append(...items){this.children.push(...items);}querySelector(){return this.input;}}
  const context=vm.createContext({serial:1,workspace:'a',occupancyAfter:'',me:{member:{id:'admin'},workspaces:[{id:'a',name:'空间 A'}]},URLSearchParams,Date,encodeURIComponent,
    el:(tag,text)=>new Element(tag,text),field:()=>new Element('label'),choices:()=>new Element('checks'),labelText:(title,id)=>({title,id}),
    table:(head,rows)=>{tables.push({head,rows});return new Element('table');},
    button:(text,fn)=>{const e=new Element('button',text);e.click=fn;buttons.push(e);return e;},
    allowed:()=>true,denied:()=>['denied'],render(){},refresh(){},
    dialog:(title,nodes,submit)=>dialogs.push({title,nodes,submit}),
    call:async(path,method,payload)=>writes.push({path,method,payload}),
    api:async path=>{reads.push(path);return {canvases:[row,{...row,canvas_id:'expired',state:'expired',holder:null}],next:'next'};}
  });
  vm.runInContext(body,context);return {context,dialogs,writes,reads,buttons,tables};
}
const row={canvas_id:'canvas/id',title:'<img src=x>',kind:'smart',state:'active',holder:{id:'editor',display_name:'成员'},generation:7,revision:9,expires_at:'2026-09-14T08:00:00Z'};
const form=(note='已联系成员',confirm=true)=>({get:()=>note,has:()=>confirm});
test('explicit confirmation is bound to the shown scope, lease generation and saved revision',async()=>{
  const f=fixture();f.context.revokeOccupancy(row,'a');const submit=f.dialogs[0].submit;
  assert.throws(()=>submit(form('',true)),/填写原因/);assert.throws(()=>submit(form('原因',false)),/勾选/);
  await submit(form());assert.equal(f.writes.length,1);
  assert.equal(f.writes[0].path,'/api/canvas-occupancy/canvas%2Fid/revoke?workspace=a');
  assert.deepEqual(JSON.parse(JSON.stringify(f.writes[0].payload)),{expected_generation:7,expected_revision:9,confirm:true,reason:'已联系成员'});
});
test('old management dialogs cannot act after account, scope or view changes',()=>{
  for(const change of [f=>f.context.workspace='b',f=>f.context.me=null,f=>f.context.serial++]){
    const f=fixture();f.context.revokeOccupancy(row,'a');change(f);
    assert.throws(()=>f.dialogs[0].submit(form()),/管理范围或账号/);assert.equal(f.writes.length,0);
  }
});
test('listing requires exact scope and both grants; only active records offer revocation',async()=>{
  const f=fixture();f.context.workspace='';await f.context.occupancyView();assert.equal(f.reads.length,0);
  f.context.workspace='a';f.context.allowed=permission=>permission==='canvas.lock.takeover';
  assert.deepEqual(Array.from(await f.context.occupancyView()),['denied']);assert.equal(f.reads.length,0);
  f.context.allowed=()=>true;await f.context.occupancyView();assert.equal(f.reads[0],'/api/canvas-occupancy?workspace=a&after=');
  assert.equal(f.buttons.filter(b=>b.textContent==='结束占用').length,1);
  assert.equal(f.tables[0].rows[0][0].title,'<img src=x>');
  f.buttons.find(b=>b.textContent==='下一页').click();assert.equal(f.context.occupancyAfter,'next');
});
