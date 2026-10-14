const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function setup(t,{owner=false,failSave=false,holdDelete=false,denyRestore=false,denyPurge=false,permissions}={}){
    const f=await fixture(t,'smart',true,{navigatorOpen:true,secureOrigin:true,permissions:permissions||['canvas.read','canvas.edit','canvas.create','canvas.delete','canvas.restore'],record:{nodes:[{id:'text',type:'smart-prompt',text:'原始内容',x:500,y:200,images:[]}]},extraRecords:[{id:'other',title:'其他画布',kind:'smart',revision:1}]});
    const current=f.record,other={id:'other',title:'其他画布',kind:'smart',revision:1,nodes:[]},state={current,other,deleted:new Set(),purged:new Set(),calls:[],held:new Set(),failSave,denyRestore};let release;const gate=new Promise(resolve=>release=resolve);
    await f.page.route('**/api/canvases**',async route=>{
        const request=route.request(),url=new URL(request.url()),method=request.method(),parts=url.pathname.split('/'),id=parts[3],item=id===current.id?current:id===other.id?other:null;state.calls.push({path:url.pathname,method,headers:request.headers()});
        if(url.pathname==='/api/canvases')return route.fulfill({json:{canvases:[current,other].filter(item=>!state.deleted.has(item.id)&&!state.purged.has(item.id))}});
        if(url.pathname==='/api/canvases/trash')return route.fulfill({json:{canvases:[current,other].filter(item=>state.deleted.has(item.id)&&!state.purged.has(item.id)).map(item=>({...item,deleted_at:1}))}});
        if(!item)return route.fallback();
        const lease=()=>({canvas_id:id,generation:1,revision:item.revision,holder:state.held.has(id)?{id:'member-1',is_self:true,display_name:'Test member'}:null,server_time:new Date().toISOString(),expires_at:new Date(Date.now()+60000).toISOString(),heartbeat_seconds:10});
        if(url.pathname.endsWith('/edit-lease/acquire')){state.held.add(id);return route.fulfill({json:{...lease(),edit_token:'directory-test-proof'}});}
        if(url.pathname.endsWith('/edit-lease/renew'))return route.fulfill({json:lease()});
        if(url.pathname.endsWith('/edit-lease/release')){assert.equal(request.headers()['x-canvas-revision'],String(item.revision));state.held.delete(id);return route.fulfill({json:{released:true,revision:item.revision}});}
        if(url.pathname.endsWith('/edit-lease'))return route.fulfill({json:lease()});
        if(url.pathname.endsWith('/edit-lease/transfers'))return route.fulfill({json:{lease:lease(),requests:[]}});
        if(url.pathname==='/api/canvases/'+id&&method==='DELETE'){
            assert.equal(state.held.has(id),true);assert.equal(request.headers()['x-canvas-revision'],String(item.revision));if(holdDelete)await gate;
            state.deleted.add(id);item.deleted_at=1;item.revision++;return route.fulfill({json:{ok:true,canvas:{id,revision:item.revision,deleted_at:1}}});
        }
        if(url.pathname==='/api/canvases/'+id&&method==='PUT'){
            if(state.failSave)return route.fulfill({status:503,json:{detail:'保存暂时失败'}});assert.equal(state.deleted.has(id),false,'a removed canvas cannot be saved again');Object.assign(item,request.postDataJSON());item.revision++;return route.fulfill({json:{canvas:item}});
        }
        if(url.pathname.endsWith('/restore')){if(state.denyRestore)return route.fulfill({status:403,json:{detail:{code:'permission_denied'}}});state.deleted.delete(id);delete item.deleted_at;item.revision++;return route.fulfill({json:{canvas:item}});}
        if(url.pathname.endsWith('/purge')){assert.equal(state.deleted.has(id),true);if(denyPurge)return route.fulfill({status:403,json:{detail:{code:'permission_denied'}}});state.purged.add(id);item.revision++;return route.fulfill({json:{ok:true}});}
        if(url.pathname==='/api/canvases/'+id&&method==='GET')return route.fulfill({json:{canvas:item}});
        return route.fallback();
    });
    if(owner){await f.page.evaluate(()=>window.__originalCanvasOptions=MemberCanvasEdit.options);await f.page.addScriptTag({url:'/static/js/member-canvas-edit.js'});await f.page.evaluate(async()=>{await MemberCanvasEdit.mount(__originalCanvasOptions);await MemberCanvasEdit.active.lease.start(MemberCanvasEdit.active.options.reload);});}
    else await f.page.evaluate(()=>{Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});MemberCanvasEdit.send=(path,init,transport=window.fetch.bind(window))=>CanvasDirectoryWrites.write(CanvasDirectoryWrites.matches(path,init),path,init,transport,MemberCanvasEdit.active?.lease);});
    await f.page.evaluate(()=>PixmaxNavigator.refresh());await f.page.locator('[data-canvas-open="other"]').waitFor();
    return {...f,state,release};
}
async function confirmation(page,id='other',name='其他画布'){await page.locator('[data-canvas-menu="'+id+'"]').click();await page.getByRole('menuitem',{name:'移入回收站',exact:true}).click();await page.locator('#canvasNameField').fill(name);}
async function removeOther(page){await confirmation(page);await page.getByRole('button',{name:'移入回收站',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.canvas-name-dialog')||document.querySelector('.name-dialog-error:not([hidden])'));const count=await page.locator('.canvas-name-dialog').count();assert.equal(count,0,count?await page.locator('.name-dialog-error').textContent():'');await page.locator('[data-canvas-open="other"]').waitFor({state:'detached'});}

test('sidebar deletion requires the exact canvas name and cancel never mutates the directory',async t=>{
    const {page,state,errors}=await setup(t);await confirmation(page,'other','错误名称');assert.equal(await page.getByRole('button',{name:'移入回收站',exact:true}).isDisabled(),true);await page.getByRole('button',{name:'取消',exact:true}).click();assert.equal(state.calls.some(call=>call.method==='DELETE'),false);await removeOther(page);assert.equal(state.calls.filter(call=>call.method==='DELETE').length,1);assert.equal(state.held.size,0);assert.deepEqual(errors,[]);
});

test('trash search restores without opening the deleted document and returns it to the canvas list',async t=>{
    const {page,state,errors}=await setup(t);await removeOther(page);await page.getByRole('button',{name:'回收站',exact:true}).click();await page.getByRole('button',{name:'恢复画布 其他画布',exact:true}).waitFor();assert.equal(await page.locator('#pixmaxNavigator [data-canvas-open="other"]').count(),0);await page.getByRole('searchbox',{name:'搜索画布或节点',exact:true}).fill('不存在');await page.locator('[data-trash-row]').waitFor({state:'detached'});await page.getByRole('searchbox',{name:'搜索画布或节点',exact:true}).fill('其他');await page.getByRole('button',{name:'恢复画布 其他画布',exact:true}).dblclick();await page.locator('[data-trash-row="other"]').waitFor({state:'detached'});assert.equal(state.calls.filter(call=>call.path.endsWith('/restore')).length,1);assert.equal(state.calls.some(call=>call.path==='/api/canvases/other'&&call.method==='GET'),false);await page.getByRole('button',{name:'返回画布列表',exact:true}).click();await page.locator('[data-canvas-open="other"]').waitFor();assert.deepEqual(errors,[]);
});

test('permanent deletion requires a new name confirmation and has no restore action afterwards',async t=>{
    const {page,state,errors}=await setup(t);await removeOther(page);await page.getByRole('button',{name:'回收站',exact:true}).click();await page.getByRole('button',{name:'永久删除画布 其他画布',exact:true}).click();assert.equal(await page.getByRole('button',{name:'永久删除',exact:true}).isDisabled(),true);await page.locator('#canvasNameField').fill('其他画布');await page.screenshot({path:'.local/pixmax-directory-permanent-delete.png'});await page.getByRole('button',{name:'永久删除',exact:true}).dblclick();await page.locator('.canvas-name-dialog').waitFor({state:'detached'});await page.locator('[data-trash-row="other"]').waitFor({state:'detached'});assert.equal(state.purged.has('other'),true);assert.equal(state.calls.filter(call=>call.path.endsWith('/purge')).length,1);assert.equal(state.held.size,0);assert.deepEqual(errors,[]);
});

test('active deletion saves the last edits, freezes editing until acknowledgement and leaves without another save',async t=>{
    const {page,state,release,errors}=await setup(t,{owner:true,holdDelete:true});await page.evaluate(()=>{nodes[0].text='删除前保存的内容';smartCanvasDirty=true;});await confirmation(page,'canvas-test','Module regression');await page.getByRole('button',{name:'移入回收站',exact:true}).click();await page.waitForFunction(()=>MemberCanvasEdit.active?.lease.finishing===true);assert.equal(await page.evaluate(()=>MemberCanvasEdit.canEdit),false);while(!state.calls.some(call=>call.method==='DELETE'))await new Promise(setImmediate);assert.equal(state.current.nodes[0].text,'删除前保存的内容');release();await page.waitForURL('**/workspaces/workspace-1');assert.equal(state.held.size,0);assert.equal(state.calls.filter(call=>call.method==='PUT').length,1);assert.equal(state.calls.filter(call=>call.method==='DELETE').length,1);assert.deepEqual(errors,[]);
});

test('a failed final save prevents active deletion and keeps the draft in the editor',async t=>{
    const {page,state,errors}=await setup(t,{owner:true,failSave:true});await page.evaluate(()=>{nodes[0].text='未保存的修改';smartCanvasDirty=true;});await confirmation(page,'canvas-test','Module regression');await page.getByRole('button',{name:'移入回收站',exact:true}).click();await page.waitForFunction(()=>MemberCanvasEdit.canSave===false);assert.equal(state.calls.some(call=>call.method==='DELETE'),false);assert.equal(await page.evaluate(()=>nodes[0].text),'未保存的修改');assert.equal(state.deleted.size,0);assert.deepEqual(errors,[]);
});

test('workspace changes dismiss an old deletion confirmation and send no old-space mutation',async t=>{
    const {page,state,errors}=await setup(t);await confirmation(page);await page.evaluate(()=>{CanvasSession.context.workspace.id='other-space';PixmaxNavigator.documentChanged();});await page.locator('.canvas-name-dialog').waitFor({state:'detached'});assert.equal(state.calls.some(call=>call.method==='DELETE'),false);assert.deepEqual(errors,[]);
});

test('read-only members can browse trash while restore and delete stay disabled',async t=>{
    const {page,state,errors}=await setup(t,{permissions:['canvas.read']});state.deleted.add('other');await page.evaluate(()=>MemberCanvasEdit.setEditable(false));await page.getByRole('button',{name:'回收站',exact:true}).click();await page.locator('[data-trash-row="other"]').waitFor();assert.equal(await page.getByRole('button',{name:'恢复画布 其他画布',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'永久删除画布 其他画布',exact:true}).isDisabled(),true);assert.deepEqual(errors,[]);
});

test('a denied restore remains visible with a retryable action',async t=>{
    const {page,state,errors}=await setup(t,{denyRestore:true});await removeOther(page);await page.getByRole('button',{name:'回收站',exact:true}).click();await page.getByRole('button',{name:'恢复画布 其他画布',exact:true}).click();await page.locator('#pixmaxNavigator [role=status]').filter({hasText:'没有此操作权限'}).waitFor();assert.equal(await page.getByRole('button',{name:'恢复画布 其他画布',exact:true}).isEnabled(),true);assert.equal(state.deleted.has('other'),true);assert.deepEqual(errors,[]);
});

test('native permanent deletion is available directly in the active canvas menu and closes the saved document',async t=>{
    const {page,state,errors}=await setup(t,{owner:true});await page.evaluate(()=>{nodes[0].text='永久删除前保存';smartCanvasDirty=true;});await page.locator('[data-canvas-menu="canvas-test"]').click();await page.getByRole('menuitem',{name:'永久删除',exact:true}).click();await page.locator('#canvasNameField').fill('Module regression');await page.getByRole('button',{name:'永久删除',exact:true}).click();await page.waitForURL('**/workspaces/workspace-1');assert.equal(state.purged.has('canvas-test'),true);assert.equal(state.current.nodes[0].text,'永久删除前保存');assert.equal(state.held.size,0);assert.equal(state.calls.filter(call=>call.method==='PUT').length,1);assert.equal(state.calls.filter(call=>call.path.endsWith('/purge')).length,1);assert.deepEqual(errors,[]);
});

test('a rejected permanent delete leaves the already-trashed canvas recoverable and explains the partial outcome',async t=>{
    const {page,state,errors}=await setup(t,{denyPurge:true});await page.locator('[data-canvas-menu="other"]').click();await page.getByRole('menuitem',{name:'永久删除',exact:true}).click();await page.locator('#canvasNameField').fill('其他画布');await page.getByRole('button',{name:'永久删除',exact:true}).click();await page.locator('.name-dialog-error').filter({hasText:'画布已移入回收站；永久删除未确认'}).waitFor();assert.equal(state.deleted.has('other'),true);assert.equal(state.purged.size,0);await page.getByRole('button',{name:'取消',exact:true}).click();await page.getByRole('button',{name:'回收站',exact:true}).click();await page.getByRole('button',{name:'恢复画布 其他画布',exact:true}).waitFor();assert.deepEqual(errors,[]);
});
