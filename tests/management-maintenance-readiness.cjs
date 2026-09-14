const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('management/frontend/management.js','utf8');
function render(report){
  class Element{constructor(text){this.text=text??'';this.children=[];}append(...items){this.children.push(...items);} }
  const context=vm.createContext({el:(_tag,text)=>new Element(text),table:(head,rows)=>new Element(JSON.stringify({head,rows}))});
  vm.runInContext(source.slice(source.indexOf('  function releaseChecksPanel('),source.indexOf('  async function maintenanceView(')),context);
  function text(e){return e.text+' '+e.children.map(text).join(' ');}
  return text(context.releaseChecksPanel(report));
}
function report(overrides={}){return {observed_at:'2026-09-14T00:00:00Z',observed_checks_passed:false,
  checks:[{code:'expired_unfinished_uploads',count:2,status:'blocked'},{code:'queued_task_recovery',count:1,status:'review_required'}],
  operator_checks:['unreported_pages','stop_all_database_clients'],database_stop:{status:'blocked'},...overrides};}
test('release checks show concrete blockers and unknown-process limitations',()=>{
  const text=render(report());assert.match(text,/过期未收尾上传/);assert.match(text,/尚未完成/);assert.match(text,/暂停的排队任务/);
  assert.match(text,/待运维核对/);assert.match(text,/心跳消失不能证明进程退出/);assert.match(text,/其他数据库客户端均已停止/);
});
test('passing observations never say database stop is approved and space report remains scoped',()=>{
  const text=render(report({observed_checks_passed:true,checks:[],database_stop:{status:'not_applicable'}}));
  assert.match(text,/仍需完成以下运维核对/);assert.match(text,/当前仅检查本空间/);assert.match(text,/不会锁定服务或授权停库/);
});
test('missing or newer reports show uncertainty without treating it as passed',()=>{
  assert.match(render(null),/检查报告暂不可用/);
  assert.match(render(report({checks:[{code:'future_check',count:1,status:'future_status'}]})),/未识别检查项/);
});
