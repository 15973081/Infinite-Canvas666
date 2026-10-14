const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function setup(t,{includesCurrent=true,blocked=false,uncertain=false,commitUnknown=true,deny=false,hold=false}={}){
    const folders=[{id:'film',name:'电影项目',parent_id:''},{id:'shots',name:'镜头',parent_id:'film'},{id:'outside',name:'其他项目',parent_id:''}];
    const f=await fixture(t,'smart',true,{navigatorOpen:true,secureOrigin:true,permissions:['canvas.read','canvas.edit','canvas.create','canvas.delete','canvas.restore'],folders,record:{folder_id:includesCurrent?'film':'outside',nodes:[{id:'text',type:'smart-prompt',text:'原始内容',x:500,y:200,images:[]}]}});
    const state={folders,canvases:[f.record,{id:'other',kind:'smart',title:'其他画布',folder_id:'film',revision:1},{id:'child',kind:'classic',title:'子画布',folder_id:'shots',revision:1,deleted_at:1}],held:new Map(),generations:new Map(),calls:[],posts:[],journals:new Map(),changed:false};let release;const gate=new Promise(resolve=>release=resolve);
    const plan=()=>({folder_id:'film',name:'电影项目',folders:state.folders.filter(item=>['film','shots'].includes(item.id)),canvases:state.canvases.filter(item=>!item.purged_at&&['film','shots'].includes(item.folder_id)).map(item=>({id:item.id,title:item.title,kind:item.kind,folder_id:item.folder_id,revision:item.revision,deleted_at:item.deleted_at||0})),plan_sha256:'a'.repeat(64)});
    await f.page.route('**/api/canvas-folders**',async route=>{
        const request=route.request(),url=new URL(request.url());state.calls.push({path:url.pathname,method:request.method()});
        if(url.pathname==='/api/canvas-folders')return route.fulfill({json:{folders:state.folders}});
        if(url.pathname.includes('/delete-tree-status/')){const operation=url.pathname.split('/').at(-1);return route.fulfill({json:state.journals.has(operation)?{state:'done',...state.journals.get(operation)}:{state:'not_found',operation_id:operation}});}
        if(url.pathname.endsWith('/delete-tree')&&request.method()==='GET'){const value=plan();if(state.changed)value.folders.push({id:'new',name:'新增文件夹',parent_id:'film'});return route.fulfill({json:value});}
        if(request.method()==='POST'){
            const body=request.postDataJSON();state.posts.push(body);const current=plan();assert.equal(body.name,current.name);assert.deepEqual(body.canvases.map(item=>item.id).sort(),current.canvases.map(item=>item.id).sort());
            for(const proof of body.canvases){assert.equal(state.held.get(proof.id),proof.token);assert.equal(state.canvases.find(item=>item.id===proof.id).revision,proof.revision);}
            if(hold)await gate;if(deny)return route.fulfill({status:403,json:{detail:{code:'permission_denied'}}});
            const result={ok:true,operation_id:body.operation_id,folder_id:'film',folder_ids:['film','shots'],canvas_ids:current.canvases.map(item=>item.id),deleted_at:1};
            if(!uncertain||commitUnknown){state.journals.set(body.operation_id,result);state.folders=state.folders.filter(item=>!result.folder_ids.includes(item.id));for(const item of state.canvases)if(result.canvas_ids.includes(item.id)){item.purged_at=1;state.held.delete(item.id);}}
            return route.fulfill(uncertain?{status:502,json:{detail:'回执丢失'}}:{json:result});
        }
        return route.fallback();
    });
    await f.page.route('**/api/canvases**',route=>{
        const request=route.request(),url=new URL(request.url()),id=url.pathname.split('/')[3],item=state.canvases.find(item=>item.id===id);state.calls.push({path:url.pathname,method:request.method()});
        if(url.pathname==='/api/canvases')return route.fulfill({json:{canvases:state.canvases.filter(item=>!item.purged_at&&!item.deleted_at)}});
        if(url.pathname==='/api/canvases/trash')return route.fulfill({json:{canvases:state.canvases.filter(item=>!item.purged_at&&item.deleted_at)}});
        if(!item)return route.fallback();
        if(item.purged_at)return route.fulfill({status:404,json:{detail:'画布已永久删除'}});
        const lease=()=>({canvas_id:id,generation:state.generations.get(id)||0,revision:item.revision,holder:state.held.has(id)?{id:'member-1',is_self:true}:null,server_time:new Date().toISOString(),expires_at:new Date(Date.now()+60000).toISOString(),heartbeat_seconds:10});
        if(url.pathname.endsWith('/edit-lease/acquire')){if(blocked&&id==='child')return route.fulfill({status:423,json:{detail:{code:'canvas_locked',canvas_id:id}}});const generation=(state.generations.get(id)||0)+1;state.generations.set(id,generation);const token='tree-token-'+id+'-'+generation;state.held.set(id,token);return route.fulfill({json:{...lease(),edit_token:token}});}
        if(url.pathname.endsWith('/edit-lease')||url.pathname.endsWith('/edit-lease/renew'))return route.fulfill({json:lease()});
        if(url.pathname.endsWith('/edit-lease/release')){assert.equal(request.headers()['x-canvas-revision'],String(item.revision));state.held.delete(id);return route.fulfill({json:{released:true,revision:item.revision}});}
        if(url.pathname.endsWith('/edit-lease/transfers'))return route.fulfill({json:{lease:lease(),requests:[]}});
        if(url.pathname==='/api/canvases/'+id){if(request.method()==='PUT'){assert.equal(Boolean(item.purged_at),false,'deleted canvases are not saved again');Object.assign(item,request.postDataJSON());item.revision++;}return route.fulfill({json:{canvas:item}});}
        return route.fallback();
    });
    await f.page.evaluate(()=>window.__treeOriginalOptions=MemberCanvasEdit.options);await f.page.addScriptTag({url:'/static/js/member-canvas-edit.js'});await f.page.evaluate(async()=>{await MemberCanvasEdit.mount(__treeOriginalOptions);await MemberCanvasEdit.active.lease.start(MemberCanvasEdit.active.options.reload);});await f.page.evaluate(()=>PixmaxNavigator.refresh());await f.page.locator('[data-folder-menu="film"]').waitFor();
    return {...f,state,release};
}
async function dialog(page){await page.locator('[data-folder-menu="film"]').click();await page.getByRole('menuitem',{name:'永久删除文件夹',exact:true}).click();await page.locator('#canvasNameField').waitFor();}
async function confirm(page){await dialog(page);await page.locator('#canvasNameField').fill('电影项目');await page.getByRole('button',{name:'永久删除',exact:true}).click();}

test('native tree deletion confirms exact name and target list, saves current edits and leaves after one atomic request',async t=>{
    const {page,state,errors}=await setup(t);await page.evaluate(()=>{nodes[0].text='目录删除前保存';smartCanvasDirty=true;});await dialog(page);assert.equal(await page.getByRole('button',{name:'永久删除',exact:true}).isDisabled(),true);await page.getByText('查看将删除的内容',{exact:true}).click();assert.match(await page.locator('.name-dialog-targets').textContent(),/子画布（回收站）/);await page.locator('#canvasNameField').fill('电影项目');await page.screenshot({path:'.local/pixmax-folder-deletion-confirm.png'});await page.getByRole('button',{name:'永久删除',exact:true}).dblclick();await page.waitForURL('**/workspaces/workspace-1');assert.equal(state.posts.length,1);assert.equal(state.posts[0].canvases.length,3);assert.equal(state.canvases[0].nodes[0].text,'目录删除前保存');assert.equal(state.held.size,0);assert.equal(state.folders.length,1);assert.deepEqual(errors,[]);
});

test('a locked child prevents the entire deletion and releases already acquired temporary leases',async t=>{
    const {page,state,errors}=await setup(t,{blocked:true});await confirm(page);await page.locator('.name-dialog-error').filter({hasText:'已有成员正在编辑'}).waitFor();assert.equal(state.posts.length,0);assert.deepEqual([...state.held.keys()],['canvas-test']);assert.equal(await page.evaluate(()=>MemberCanvasEdit.canEdit),true);assert.equal(state.folders.length,3);assert.equal(await page.evaluate(()=>CanvasFolderDeletion.pending()),null);assert.deepEqual(errors,[]);
});

test('directory changes after confirmation prevent dispatch and keep the saved current canvas editable',async t=>{
    const {page,state,errors}=await setup(t);await dialog(page);state.changed=true;await page.locator('#canvasNameField').fill('电影项目');await page.getByRole('button',{name:'永久删除',exact:true}).click();await page.locator('.name-dialog-error').filter({hasText:'目录内容已变化'}).waitFor();assert.equal(state.posts.length,0);assert.equal(await page.evaluate(()=>MemberCanvasEdit.canEdit),true);assert.deepEqual([...state.held.keys()],['canvas-test']);assert.deepEqual(errors,[]);
});

test('an uncertain tree receipt pauses current writes and is recovered by querying once without another deletion',async t=>{
    const {page,state,errors}=await setup(t,{uncertain:true});await confirm(page);await page.getByRole('button',{name:'查询删除结果',exact:true}).waitFor();assert.equal(await page.evaluate(()=>MemberCanvasEdit.canSave),false);const stored=await page.evaluate(()=>CanvasFolderDeletion.pending());assert.ok(stored.operation_id);assert.equal(JSON.stringify(stored).includes('tree-token-'),false);await page.getByRole('button',{name:'取消',exact:true}).click();await page.getByRole('button',{name:'查询文件夹删除结果',exact:true}).click();await page.waitForURL('**/workspaces/workspace-1');assert.equal(state.posts.length,1);assert.deepEqual(errors,[]);
});

test('an absent receipt stays uncertain and a second confirmation reuses its original operation ID',async t=>{
    const {page,state,errors}=await setup(t,{includesCurrent:false,uncertain:true,commitUnknown:false});await confirm(page);await page.getByRole('button',{name:'查询删除结果',exact:true}).waitFor();const operation=state.posts[0].operation_id;await page.getByRole('button',{name:'取消',exact:true}).click();await page.getByRole('button',{name:'查询文件夹删除结果',exact:true}).click();await page.locator('#pixmaxNavigator [role=status]').filter({hasText:'原删除结果尚未确认'}).waitFor();assert.equal(state.posts.length,1);
    // The user explicitly reconfirms the same operation after checking it.
    await page.getByRole('button',{name:'重新确认原删除',exact:true}).click();await page.locator('#canvasNameField').fill('电影项目');await page.getByRole('button',{name:'重新确认原删除',exact:true}).last().click();await page.getByRole('button',{name:'查询删除结果',exact:true}).waitFor();assert.equal(state.posts.length,2);assert.equal(state.posts[1].operation_id,operation);assert.deepEqual(errors,[]);
});

test('workspace changes during an in-flight deletion preserve the old scoped receipt without navigating the new space',async t=>{
    const {page,state,release,errors}=await setup(t,{includesCurrent:false,hold:true});await confirm(page);await page.waitForFunction(()=>CanvasFolderDeletion.pending()?.operation_id);while(!state.posts.length)await new Promise(setImmediate);await page.evaluate(()=>{CanvasSession.context.workspace.id='new-space';PixmaxNavigator.documentChanged();});release();await page.locator('.canvas-name-dialog').waitFor({state:'detached'});await page.waitForFunction(()=>!CanvasFolderDeletion.busy);assert.equal(await page.evaluate(()=>CanvasFolderDeletion.pending()),null);assert.ok(await page.evaluate(()=>sessionStorage.getItem('canvas-folder-deletion-v1:member-1:workspace-1')));assert.equal(state.posts.length,1);assert.match(page.url(),/canvas-test/);assert.deepEqual(errors,[]);
});

test('a known server rejection retains the directory and releases temporary leases without an uncertain receipt',async t=>{
    const {page,state,errors}=await setup(t,{deny:true});await confirm(page);await page.locator('.name-dialog-error').filter({hasText:'没有此操作权限'}).waitFor();assert.equal(state.posts.length,1);assert.equal(await page.evaluate(()=>CanvasFolderDeletion.pending()),null);assert.deepEqual([...state.held.keys()],['canvas-test']);assert.equal(await page.evaluate(()=>MemberCanvasEdit.canEdit),true);assert.equal(state.folders.length,3);assert.deepEqual(errors,[]);
});

test('an uncertain receipt survives page reload and can be queried after its source folder disappears',async t=>{
    const {page,state,errors}=await setup(t,{includesCurrent:false,uncertain:true});await confirm(page);await page.getByRole('button',{name:'查询删除结果',exact:true}).waitFor();await page.reload();await page.getByRole('button',{name:'查询文件夹删除结果',exact:true}).waitFor();await page.getByRole('button',{name:'查询文件夹删除结果',exact:true}).click();await page.locator('#pixmaxNavigator [role=status]').filter({hasText:'文件夹及其内容已永久删除'}).waitFor();assert.equal(state.posts.length,1);assert.equal(await page.evaluate(()=>CanvasFolderDeletion.pending()),null);assert.deepEqual(errors,[]);
});

test('storage failure aborts before dispatch and releases temporary leases while retaining current editing',async t=>{
    const {page,state,errors}=await setup(t);await dialog(page);await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('canvas-folder-deletion-v1:'))throw new DOMException('quota exceeded','QuotaExceededError');return original.call(this,key,value);};});await page.locator('#canvasNameField').fill('电影项目');await page.getByRole('button',{name:'永久删除',exact:true}).click();await page.locator('.name-dialog-error').filter({hasText:'回执无法暂存'}).waitFor();assert.equal(state.posts.length,0);assert.equal(await page.evaluate(()=>MemberCanvasEdit.canEdit),true);assert.deepEqual([...state.held.keys()],['canvas-test']);assert.deepEqual(errors,[]);
});

test('edit qualification loss dismisses the old tree confirmation without dispatching',async t=>{
    const {page,state,errors}=await setup(t);await dialog(page);await page.evaluate(()=>MemberCanvasEdit.active.lease.pause('编辑资格失效'));await page.locator('.canvas-name-dialog').waitFor({state:'detached'});assert.equal(state.posts.length,0);assert.deepEqual(errors,[]);
});

test('reloading a deleted current canvas offers receipt recovery on its actual load-error page',async t=>{
    const {page,state,errors}=await setup(t,{uncertain:true});await confirm(page);await page.getByRole('button',{name:'查询删除结果',exact:true}).waitFor();await page.reload();await page.locator('.canvas-route-error').waitFor();const recovery=page.locator('.canvas-folder-delete-recovery');await recovery.getByRole('button',{name:'查询文件夹删除结果',exact:true}).click();await recovery.getByRole('status').filter({hasText:'删除结果已确认'}).waitFor();assert.equal(state.posts.length,1);assert.equal(await page.evaluate(()=>CanvasFolderDeletion.pending()),null);assert.equal(await page.evaluate(()=>MemberCanvasEdit.active),null);assert.deepEqual(errors,[]);
});

test('the canvas home can query a persisted receipt without mounting an editor or reacquiring leases',async t=>{
    const {page,state,errors}=await setup(t,{uncertain:true});await confirm(page);await page.getByRole('button',{name:'查询删除结果',exact:true}).waitFor();await page.goto(new URL('/static/canvas-home.html',page.url()).href);await page.evaluate(async()=>{await CanvasHome.ready;delete window.MemberCanvasEdit;});const calls=state.calls.length,recovery=page.locator('.canvas-folder-delete-recovery');await recovery.getByRole('button',{name:'查询文件夹删除结果',exact:true}).click();await recovery.getByRole('status').filter({hasText:'删除结果已确认'}).waitFor();assert.equal(state.posts.length,1);assert.equal(state.calls.slice(calls).some(item=>item.method!=='GET'),false);assert.equal(await page.evaluate(()=>CanvasFolderDeletion.pending()),null);await page.screenshot({path:'.local/pixmax-folder-deletion-recovery.png'});assert.deepEqual(errors,[]);
});

test('a late home query keeps its original scoped receipt and does not display success in another space',async t=>{
    const {page,state,errors}=await setup(t,{includesCurrent:false,uncertain:true});await confirm(page);await page.getByRole('button',{name:'查询删除结果',exact:true}).waitFor();await page.goto(new URL('/static/canvas-home.html',page.url()).href);await page.evaluate(()=>CanvasHome.ready);let release,started;const gate=new Promise(resolve=>release=resolve),requestStarted=new Promise(resolve=>started=resolve);await page.route('**/delete-tree-status/**',async route=>{started();await gate;return route.fallback();});const recovery=page.locator('.canvas-folder-delete-recovery');await recovery.getByRole('button',{name:'查询文件夹删除结果',exact:true}).click();await requestStarted;await page.evaluate(()=>{CanvasSession.context.workspace.id='other-space';window.dispatchEvent(new CustomEvent('canvas-folder-deletion-change'));});const finished=page.waitForEvent('requestfinished',{predicate:request=>request.url().includes('/delete-tree-status/')});release();await finished;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await recovery.waitFor({state:'hidden'});assert.ok(await page.evaluate(()=>sessionStorage.getItem('canvas-folder-deletion-v1:member-1:workspace-1')));assert.equal(state.posts.length,1);await page.evaluate(()=>{CanvasSession.context.workspace.id='workspace-1';window.dispatchEvent(new CustomEvent('canvas-folder-deletion-change'));});await recovery.getByRole('button',{name:'查询文件夹删除结果',exact:true}).click();await recovery.getByRole('status').filter({hasText:'删除结果已确认'}).waitFor();assert.equal(await page.evaluate(()=>CanvasFolderDeletion.pending()),null);assert.deepEqual(errors,[]);
});
