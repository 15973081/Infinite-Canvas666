const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('management/frontend/management.js','utf8');
function harness(api){
  class Element{constructor(tag,text,css){this.tag=tag;this.text=text??'';this.css=css;this.children=[];}append(...items){this.children.push(...items);}}
  const context=vm.createContext({workspace:'space_a',serial:1,me:{member:{id:'member_a'}},view:'overview',backupAfter:'old',URLSearchParams,
    api,refresh:()=>{context.refreshed=true;},render:()=>{context.rendered=true;},
    el:(tag,text,css)=>new Element(tag,text,css),button:(text,action)=>Object.assign(new Element('button',text),{action})});
  vm.runInContext(source.slice(source.indexOf('  function overviewBytes('),source.indexOf('  async function memberView(')),context);
  return context;
}
function data(overrides={}){return {workspace:{id:'space_a',name:'设计空间',status:'active'},observed_at:'2026-09-15T01:00:00Z',manageable_spaces:2,
  members:{total:2,active:1,invited:1,disabled:0},canvases:{total:3,classic:2,smart:1,recycled:4},assets:{originals:5,previews:2,ready_bytes:'1536'},
  tasks:{total:9,queued:3,active:2,needs_review:1},maintenance:{mode:'scheduled',message:'今晚维护',planned_at:'2026-09-15T12:00:00Z'},
  services:[{kind:'workbench',online:1,unknown:2,stopped:3}],backup:{total:2,pending:0,latest:{status:'failed',created_at:'2026-09-15T00:00:00Z'}},...overrides};}
function flatten(nodes){return nodes.flatMap(node=>[node,...flatten(node.children)]);}
function text(nodes){return flatten(nodes).map(node=>node.text).join(' ');}
test('selected scope displays real resource counts and navigates to maintenance and backups',async()=>{
  const calls=[],c=harness(async path=>{calls.push(path);return data();}),nodes=await c.overview(),value=text(nodes);
  assert.deepEqual(calls,['/api/overview?workspace=space_a']);
  for(const phrase of ['设计空间','经典 2 · 智能 1 · 回收站 4','派生预览 2 份','1.5 KiB','排队 3 · 执行中 2 · 待核对 1','今晚维护','在线 1 · 失联未确认 2 · 已记录停止 3','失败'])assert.ok(value.includes(phrase),phrase);
  flatten(nodes).find(n=>n.text==='打开维护中心').action();assert.equal(c.view,'maintenance');assert.ok(c.rendered);
  flatten(nodes).find(n=>n.text==='查看备份记录').action();assert.equal(c.view,'backups');assert.equal(c.backupAfter,'');
  flatten(nodes).find(n=>n.text==='刷新概览').action();assert.ok(c.refreshed);
});
test('zero resources remain zero while unavailable permissions stay explicit',async()=>{
  const c=harness(async()=>data({members:null,canvases:null,assets:{originals:0,previews:0,ready_bytes:'0'},tasks:null,maintenance:null,backup:null}));
  const nodes=await c.overview(),value=text(nodes);assert.match(value,/0 B/);assert.equal(flatten(nodes).filter(n=>n.css==='metric'&&n.text==='未授权').length,3);
  assert.match(value,/需要当前范围的维护权限/);assert.match(value,/需要当前范围的备份读取权限/);
  assert.ok(!flatten(nodes).some(n=>n.text==='打开维护中心'||n.text==='查看备份记录'));
});
test('byte formatting preserves large decimal strings without float rounding',()=>{
  const c=harness();assert.equal(c.overviewBytes(null),'未授权');assert.equal(c.overviewBytes('0'),'0 B');assert.equal(c.overviewBytes('1023'),'1023 B');
  assert.equal(c.overviewBytes('1152921504606846975'),'1023.9 PiB');assert.equal(c.overviewBytes('1152921504606846976'),'1.0 EiB');
});
test('platform scope omits space-only resource cards',async()=>{
  const c=harness(async path=>{assert.equal(path,'/api/overview');return data({workspace:null});});c.workspace='';
  const value=text(await c.overview());assert.match(value,/平台概览/);assert.match(value,/可管理空间/);assert.ok(!value.includes('任务总数'));
});
test('archived scope stops rendering counts while preserving its identity',async()=>{
  const c=harness(async()=>data({workspace:{id:'space_a',name:'历史空间',status:'archived'}}));const value=text(await c.overview());
  assert.match(value,/历史空间/);assert.match(value,/已归档/);assert.ok(!value.includes('任务总数'));
});
test('switching scope, view generation or signed-in member discards a late response',async()=>{
  for(const change of [c=>c.workspace='space_b',c=>c.serial++,c=>c.me={member:{id:'member_b'}},c=>c.me=null]){
    let resolve;const c=harness(()=>new Promise(r=>resolve=r));const pending=c.overview();change(c);resolve(data());assert.equal((await pending).length,0);
  }
});
test('failures allow retry but obsolete request errors cannot overwrite a new page',async()=>{
  const c=harness(async()=>{throw new Error('服务暂不可用');}),nodes=await c.overview();assert.match(text(nodes),/概览暂不可用.*服务暂不可用/);
  flatten(nodes).find(n=>n.text==='重试读取').action();assert.ok(c.refreshed);
  let reject;const d=harness(()=>new Promise((_r,j)=>reject=j));const pending=d.overview();d.workspace='space_b';reject(new Error('old failure'));assert.equal((await pending).length,0);
});
test('a mismatched server scope cannot render resource counts',async()=>{
  const c=harness(async()=>data({workspace:{id:'space_b',name:'其他空间'}}));await assert.rejects(c.overview(),/概览范围已变化/);
});
