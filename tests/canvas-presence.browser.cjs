const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');

test('presence retains a fresh roster on failure, exposes a usable stale state, and retries without claiming editing',async t=>{
 const {page,errors,writes}=await fixture(t,'smart',true,{secureOrigin:true});
 let failed=false;
 await page.route('**/api/canvases/canvas-test/page-state',route=>route.fulfill(failed?
  {status:503,json:{detail:'temporary failure'}}:
  {json:{accepted:true,presence:{online_members:1,members:[{id:'member-1',display_name:'名单验收',is_self:true,activity:'viewing'}]}}}));
 await page.route('**/api/canvases/canvas-test/edit-lease**',route=>route.fulfill({json:{lease:{canvas_id:'canvas-test',generation:1,revision:1,holder:null},requests:[]}}));
 await page.clock.install();
 await page.evaluate(()=>window.presenceOptions=MemberCanvasEdit.options);
 await page.addScriptTag({url:'/static/js/member-canvas-edit.js'});
 await page.addStyleTag({url:'/static/css/member-canvas-edit.css'});
 await page.evaluate(()=>MemberCanvasEdit.mount(presenceOptions));
 const summary=page.locator('.member-canvas-presence > summary');
 await page.waitForFunction(()=>document.querySelector('.member-canvas-presence > summary')?.textContent==='1 人在线');
 await summary.click();await page.getByText('名单验收 · mber-1（你） · 查看中',{exact:true}).waitFor();
 failed=true;await page.clock.fastForward(21000);
 await page.getByText('名单更新稍有延迟，正在重试。',{exact:false}).waitFor();
 assert.equal(await summary.innerText(),'1 人在线');
 await page.clock.fastForward(16000);
 await page.waitForFunction(()=>document.querySelector('.member-canvas-presence > summary')?.textContent==='在线名单暂不可用');
 await page.getByRole('button',{name:'重试',exact:true}).waitFor();
 assert.equal(await page.getByText(/名单验收 ·/).count(),0,'expired names are never presented as current');
 const bounds=await page.locator('.member-canvas-presence ul').boundingBox();assert.ok(bounds.height>35,'unavailable roster is not an empty sliver');
 await page.screenshot({path:'.local/commercial-kickoff/canvas-presence-retry.png'});
 failed=false;await page.getByRole('button',{name:'重试',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.member-canvas-presence > summary')?.textContent==='1 人在线');
 assert.equal(await page.evaluate(()=>MemberCanvasEdit.canEdit),false);
 assert.equal(writes.filter(row=>row.path.includes('/acquire')).length,0);assert.deepEqual(errors,[]);
});
