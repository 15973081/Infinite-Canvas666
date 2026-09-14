const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('management/frontend/management.js','utf8');
const body=source.slice(source.indexOf('  const taskStates ='),source.indexOf('  const reviewOutcomes ='));
function fixture() {
  const dialogs=[],reads=[],pending=[],writes=[];
  class Element {constructor(tag,text){this.tag=tag;this.textContent=text;this.children=[];}append(...nodes){this.children.push(...nodes);}querySelector(){return this.input;}}
  const context=vm.createContext({serial:1,workspace:'space-a',taskStatus:'needs_review',taskAfter:'',me:{member:{id:'admin'}},URLSearchParams,Date,
    crypto:{randomUUID:()=> 'one-review-request'},document:{createTextNode:text=>text},
    el:(tag,text)=>new Element(tag,text),table:()=>new Element('table'),labelText:()=>new Element('label'),
    field:()=>{const e=new Element('label');e.input={};return e;},
    dialog:(title,nodes,submit)=>dialogs.push({title,nodes,submit}),
    api:path=>{reads.push(path);return new Promise(resolve=>pending.push(resolve));},
    call:async(path,method,payload)=>{writes.push({path,method,payload});if(writes.length===1)throw new Error('connection lost');return {};},
    allowed:()=>true,denied:()=>['denied'],button:()=>new Element('button'),refresh(){},render(){},execute(){}
  });
  vm.runInContext(body,context);return{context,dialogs,reads,pending,writes};
}
const row={id:'task-a',status:'needs_review',review_version:5,provider_id:'test',submission_counts:{uncertain:1},reviews:[],actions:['confirm_failed','resume_polling'],account_status:'matched',upstream_task_id:'known'};
const form=(action,note='已核对',verified=false)=>({get:k=>k==='action'?action:note,has:()=>verified});

test('task review uses explicit action, upstream confirmation and stable retry identity',async()=>{
  const f=fixture(),loading=f.context.reviewTask('task-a','space-a');f.pending[0](row);await loading;
  const submit=f.dialogs[0].submit;
  await assert.rejects(()=>submit(form('')),/请选择/);
  await assert.rejects(()=>submit(form('confirm_failed')),/供应商/);
  await assert.rejects(()=>submit(form('confirm_failed','已核对',true)),/connection lost/);
  await submit(form('confirm_failed','已核对',true));
  assert.equal(f.writes.length,2);
  assert.deepEqual(f.writes[0].payload,f.writes[1].payload);
  assert.equal(f.writes[0].payload.expected_version,5);
  assert.equal(f.writes[0].path,'/api/tasks/task-a/review?workspace=space-a');
  await assert.rejects(()=>submit(form('resume_polling')),/不能更改/);
  assert.equal(f.writes.length,2);
});

test('a late task detail cannot open in another space, account or view',async()=>{
  for(const change of [f=>f.context.workspace='space-b',f=>f.context.me=null,f=>f.context.serial++]) {
    const f=fixture(),loading=f.context.reviewTask('task-a','space-a');change(f);f.pending[0](row);await loading;
    assert.equal(f.dialogs.length,0);assert.equal(f.writes.length,0);
  }
});

test('a task without allowed actions has only a read-only record dialog',async()=>{
  const f=fixture(),loading=f.context.reviewTask('task-a','space-a');
  f.pending[0]({...row,actions:[],leased:true});await loading;
  assert.equal(f.dialogs[0].submit,null);assert.equal(f.writes.length,0);
});

test('task listing requires a selected space and sends that scope with the filter',async()=>{
  const f=fixture();f.context.workspace='';
  await f.context.taskView();assert.equal(f.reads.length,0);
  f.context.workspace='space-a';
  const listing=f.context.taskView();
  assert.match(f.reads[0],/workspace=space-a/);assert.match(f.reads[0],/status=needs_review/);
  f.pending[0]({tasks:[],counts:{},next:null});await listing;
});
