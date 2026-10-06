const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
for(const [kind,name] of [['classic','isCanvasLockedByOther'],['smart','isSmartCanvasLocked']]){
 test(kind+' editing fails closed without workspace controls and follows only the current lease',()=>{
  const c={window:{}};vm.createContext(c);
  vm.runInContext(fs.readFileSync(`static/js/canvas/${kind}/${kind==='classic'?'canvas':'smart'}-session.js`,'utf8'),c);
  assert.equal(c[name](),true,'missing controls never permit editing');
  c.window.MemberCanvasEdit={canEdit:false};assert.equal(c[name](),true);
  c.window.MemberCanvasEdit.canEdit=true;assert.equal(c[name](),false);
  c.window.MemberCanvasEdit.canEdit=false;assert.equal(c[name](),true,'lease revocation immediately blocks editing');
 });
}
