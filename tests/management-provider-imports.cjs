const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('management/frontend/management.js', 'utf8');
const body = source.slice(source.indexOf('  function importProviders()'), source.indexOf('  async function providerView()'));
function fixture() {
  const calls=[], pending=[], buttons=[], dialogs=[], tables=[], elements=[];
  class Element {
    constructor(tag,text) {this.tag=tag;this.textContent=text;this.children=[];this.isConnected=false;this.value='';elements.push(this);}
    append(...nodes) {this.children.push(...nodes);nodes.forEach(n=>{if(typeof n==='object')n.isConnected=this.isConnected;});}
    replaceChildren(...nodes) {this.children.forEach(n=>{if(typeof n==='object')n.isConnected=false;});this.children=[];this.append(...nodes);}
    querySelector() {return this.input;}
    setAttribute(name,value) {this[name]=value;}
  }
  const modal={open:true}, confirm={hidden:false};
  const context=vm.createContext({serial:1,me:{member:{id:'admin'}},Date,
    $:s=>s==='#dialog'?modal:confirm,
    el:(tag,text)=>new Element(tag,text),
    labelText:(name,id)=>new Element('label',name+id),
    table:(heads,rows)=>{tables.push(rows);return new Element('table');},
    field:()=>{const e=new Element('label');e.input={value:'迁移原因',reportValidity:()=>true};return e;},
    button:(name,fn)=>{const e=new Element('button',name);e.run=fn;buttons.push(e);return e;},
    dialog:(name,nodes,submit)=>{dialogs.forEach(d=>d.nodes.forEach(n=>n.isConnected=false));nodes.forEach(n=>n.isConnected=true);dialogs.push({name,nodes,submit});},
    call:(path,method,payload)=>{calls.push({path,method,payload});return new Promise((resolve,reject)=>pending.push({resolve,reject}));},
    setTimeout:()=>{}
  });
  vm.runInContext(body,context);context.importProviders();
  return {context,calls,pending,buttons,dialogs,tables,elements,modal,confirm};
}
const preview={id:'opaque-preview',expires_at:'2026-09-14T10:00:00Z',items:[
  {id:'keep',index:0,status:'available',config:{name:'保留供应商',image_models:['old']},configured_secrets:['api_key']},
  {id:'modelscope',index:1,status:'retired',configured_secrets:[]}
]};
const form=(ids=[],keys=[])=>({getAll:name=>name==='provider_ids'?ids:keys});

test('preview requires explicit provider and separate credential selections',async()=>{
  const f=fixture();assert.equal(f.confirm.hidden,true);
  const load=f.buttons[0].run();f.pending[0].resolve(preview);await load;
  assert.equal(f.calls.length,1);assert.equal(f.confirm.hidden,false);
  const rows=f.tables[0];assert.equal(rows[0][0].checked,undefined);assert.equal(rows[0][4].disabled,true);
  assert.equal(rows[1][0].disabled,true);
  rows[0][0].checked=true;rows[0][0].onchange();assert.equal(rows[0][4].disabled,false);
  rows[0][4].checked=true;rows[0][0].checked=false;rows[0][0].onchange();assert.equal(rows[0][4].checked,false);
  await assert.rejects(()=>f.dialogs[0].submit(form()),/勾选/);
  const save=f.dialogs[0].submit(form(['keep'],['keep']));
  assert.equal(f.calls[1].path,'/api/provider-imports/opaque-preview/confirm');
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[1].payload)),{provider_ids:['keep'],credential_provider_ids:['keep']});
  f.pending[1].resolve({id:'opaque-preview',imported:[{id:'keep',configured_secrets:['api_key']}]});await save;
});

test('source edits invalidate a preview and discard a late response',async()=>{
  const f=fixture(), selector=f.elements.find(e=>e.tag==='select');
  selector.value='local_file';
  const load=f.buttons[0].run();selector.value='default_workspace';selector.onchange();
  selector.value='local_file';selector.onchange();
  f.pending[0].resolve(preview);await load;
  assert.equal(f.confirm.hidden,true);assert.equal(f.tables.length,0);
  await assert.rejects(()=>f.dialogs[0].submit(form(['keep'])),/重新读取/);
});

test('closed dialog or revoked browser identity does not render a late preview',async()=>{
  for(const change of [f=>{f.modal.open=false;},f=>{f.context.me=null;},f=>{f.context.serial++;},f=>{f.context.importProviders();}]) {
    const f=fixture(),load=f.buttons[0].run();change(f);
    f.pending[0].resolve(preview);await load;
    assert.equal(f.tables.length,0);assert.equal(f.confirm.hidden,true);
  }
});

test('failed new preview cannot reuse previously selected rows',async()=>{
  const f=fixture();let load=f.buttons[0].run();f.pending[0].resolve(preview);await load;
  load=f.buttons[0].run();f.pending[1].reject(new Error('source changed'));await load;
  await assert.rejects(()=>f.dialogs[0].submit(form(['keep'])),/重新读取/);
  assert.equal(f.confirm.hidden,true);assert.equal(f.calls.length,2);
});


test('late form completion cannot close a newer dialog or show its errors there', async () => {
  const dialogBody=source.slice(source.indexOf('  function dialog('),source.indexOf('  function tokenDialog('));
  for(const outcome of ['success','failure']) {
    let connected=[], task, resolve, reject;
    const pending=new Promise((yes,no)=>{resolve=yes;reject=no;});
    const d={open:true,classList:{toggle(){}},close(){this.open=false;this.closed=(this.closed||0)+1;},showModal(){this.open=true;}};
    const f={reset(){},dataset:{}}, confirm={}, cancel={}, message={};
    const body={replaceChildren(...nodes){connected.forEach(n=>n.isConnected=false);connected=nodes;nodes.forEach(n=>n.isConnected=true);}};
    const nodes={'#dialog':d,'#dialog-form':f,'#dialog-body':body,'#confirm-dialog':confirm,'#cancel-dialog':cancel,'#message':message};
    const context=vm.createContext({$:s=>nodes[s],el:()=>({setAttribute(){}}),FormData:class {},
      execute:fn=>{task=fn();},refresh:()=>{throw new Error('must not refresh a newer dialog');}});
    vm.runInContext(dialogBody,context);
    context.dialog('old',[],()=>pending);
    f.onsubmit({preventDefault(){}});
    context.dialog('new',[],()=>{});
    const newError=connected.at(-1);
    if(outcome==='success')resolve();else reject(new Error('old request failed'));
    await task;
    assert.equal(d.closed,undefined);assert.equal(d.open,true);assert.equal(newError.hidden,true);
  }
});
