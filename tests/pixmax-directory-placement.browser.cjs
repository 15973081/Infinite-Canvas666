const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function setup(t,{readOnly=false,denySave=false,denyMove=false,holdMove=false}={}){
    const folders=[{id:'film',name:'电影项目',parent_id:''},{id:'shots',name:'镜头',parent_id:'film'},{id:'sound',name:'声音',parent_id:'shots'},{id:'outside',name:'其他项目',parent_id:''}];
    const f=await fixture(t,'smart',true,{secureOrigin:true,navigatorOpen:true,folders,permissions:['canvas.read',...(readOnly?[]:['canvas.edit','canvas.create'])],record:{folder_id:'outside',nodes:[{id:'text',type:'smart-prompt',text:'原始文本',x:600,y:200,images:[]}]},extraRecords:[{id:'child-canvas',kind:'classic',title:'镜头画布',folder_id:'shots',revision:1}]});
    const state={folders,records:[f.record,{id:'child-canvas',kind:'classic',title:'镜头画布',folder_id:'shots',revision:1}],ordering:{},moves:[],held:new Map(),generation:0,calls:[]};let release;const gate=new Promise(resolve=>release=resolve);
    const find=(kind,id)=>(kind==='folder'?state.folders:state.records).find(item=>item.id===id),parent=(kind,item)=>kind==='folder'?item.parent_id||'':item.folder_id||'';
    await f.page.route('**/api/canvas-folders**',route=>{
        const url=new URL(route.request().url());if(url.pathname==='/api/canvas-folders')return route.fulfill({json:{folders:state.folders,ordering:state.ordering}});return route.fallback();
    });
    await f.page.route('**/api/canvases**',route=>{
        const request=route.request(),url=new URL(request.url()),id=url.pathname.split('/')[3],item=find('canvas',id);state.calls.push({path:url.pathname,method:request.method()});
        if(url.pathname==='/api/canvases')return route.fulfill({json:{canvases:state.records}});
        if(url.pathname==='/api/canvases/trash')return route.fulfill({json:{canvases:[]}});
        if(!item)return route.fallback();
        const lease=()=>({canvas_id:id,generation:state.generation,revision:item.revision,holder:state.held.has(id)?{id:'member-1',is_self:true}:null,server_time:new Date().toISOString(),expires_at:new Date(Date.now()+60000).toISOString(),heartbeat_seconds:10});
        if(url.pathname.endsWith('/edit-lease/acquire')){state.generation++;const token='move-token-'+id;state.held.set(id,token);return route.fulfill({json:{...lease(),edit_token:token}});}
        if(url.pathname.endsWith('/edit-lease')||url.pathname.endsWith('/edit-lease/renew'))return route.fulfill({json:lease()});
        if(url.pathname.endsWith('/edit-lease/release')){state.held.delete(id);return route.fulfill({json:{released:true,revision:item.revision}});}
        if(url.pathname.endsWith('/edit-lease/transfers'))return route.fulfill({json:{lease:lease(),requests:[]}});
        if(url.pathname==='/api/canvases/'+id){if(request.method()==='PUT'){if(denySave)return route.fulfill({status:503,json:{detail:'保存失败'}});Object.assign(item,request.postDataJSON());item.revision++;}return route.fulfill({json:{canvas:item}});}
        return route.fallback();
    });
    await f.page.route('**/placement',async route=>{
        const request=route.request(),url=new URL(request.url()),kind=url.pathname.includes('/canvas-folders/')?'folder':'canvas',id=url.pathname.split('/')[3],body=request.postDataJSON();state.moves.push({kind,id,body});if(holdMove)await gate;
        if(denyMove)return route.fulfill({status:409,json:{detail:{code:'directory_target_changed'}}});
        const item=find(kind,id),target=find(body.target_kind,body.target_id);assert.equal(body.source_parent_id,parent(kind,item));assert.equal(body.target_parent_id,target?parent(body.target_kind,target):'');
        if(kind==='canvas')assert.equal(request.headers()['x-canvas-edit-token'],state.held.get(id));
        const newParent=body.target_kind==='root'?'':body.placement==='into'?body.target_id:parent(body.target_kind,target),sourceKey=kind+':'+id,targetKey=body.target_kind+':'+body.target_id;
        const groups={};for(const entryKind of ['canvas','folder'])for(const value of entryKind==='folder'?state.folders:state.records){const key=parent(entryKind,value);(groups[key]||=[]).push(entryKind+':'+value.id);}
        for(const [key,values] of Object.entries(groups)){const rank=new Map((state.ordering[key]||[]).map((key,index)=>[key,index]));values.sort((a,b)=>(rank.get(a)??Infinity)-(rank.get(b)??Infinity));}
        groups[parent(kind,item)]=groups[parent(kind,item)].filter(key=>key!==sourceKey);const siblings=groups[newParent]||=[];siblings.splice(body.placement==='into'?siblings.length:siblings.indexOf(targetKey)+(body.placement==='below'),0,sourceKey);
        item[kind==='folder'?'parent_id':'folder_id']=newParent;if(kind==='canvas')item.revision++;state.ordering=groups;
        return route.fulfill({json:{ok:true,folder_id:newParent,folders:state.folders,ordering:groups,canvas:kind==='canvas'?item:null}});
    });
    await f.page.evaluate(()=>window.__moveOptions=MemberCanvasEdit.options);await f.page.addScriptTag({url:'/static/js/member-canvas-edit.js'});await f.page.evaluate(async readOnly=>{await MemberCanvasEdit.mount(__moveOptions);if(!readOnly)await MemberCanvasEdit.active.lease.start(MemberCanvasEdit.active.options.reload);await PixmaxNavigator.refresh();},readOnly);
    return {...f,state,release};
}
const row=(page,kind,id)=>page.locator(`[data-directory-kind="${kind}"][data-directory-id="${id}"]`);
async function drag(page,sourceKind,source,targetKind,target,position=.5){const targetRow=row(page,targetKind,target),box=await targetRow.boundingBox();await row(page,sourceKind,source).dragTo(targetRow,{targetPosition:{x:box.width/2,y:box.height*position}});}

test('dragging a folder into another folder preserves its subtree and expands the destination',async t=>{
    const {page,state,errors}=await setup(t);await page.locator('[data-folder-toggle="outside"]').click();await drag(page,'folder','film','folder','outside');await page.waitForFunction(()=>document.querySelector('[data-folder-drop="outside"] [data-folder-drop="film"]'));assert.equal(state.moves.length,1);assert.equal(state.moves[0].body.placement,'into');assert.equal(state.folders.find(item=>item.id==='shots').parent_id,'film');assert.equal(state.records[1].folder_id,'shots');assert.equal(await row(page,'canvas','child-canvas').count(),1);assert.deepEqual(errors,[]);
});

test('above and below drop positions interleave folders and canvases and persist after reload',async t=>{
    const {page,state,errors}=await setup(t);await drag(page,'folder','shots','canvas','canvas-test',.1);await page.waitForFunction(()=>document.querySelector('[data-folder-drop="outside"] [data-folder-drop="shots"]'));await drag(page,'folder','film','canvas','canvas-test',.9);await page.waitForFunction(()=>document.querySelector('[data-folder-drop="outside"] [data-folder-drop="film"]'));assert.deepEqual(state.ordering.outside,['folder:shots','canvas:canvas-test','folder:film']);await page.reload();await row(page,'folder','shots').waitFor();const order=await page.locator('[data-folder-drop="outside"] > .pixmax-directory-row, [data-folder-drop="outside"] > .pixmax-directory-folder > .pixmax-directory-row[data-directory-kind="folder"]').evaluateAll(rows=>rows.map(row=>row.dataset.directoryId));assert.deepEqual(order,['outside','shots','canvas-test','film']);await page.screenshot({path:'.local/pixmax-directory-placement.png'});assert.equal(state.moves.length,2);assert.deepEqual(errors,[]);
});

test('moving the current canvas saves its final document first and retains the active lease',async t=>{
    const {page,state,errors}=await setup(t);await page.evaluate(()=>{nodes[0].text='拖放前最终文本';smartCanvasDirty=true;});await drag(page,'canvas','canvas-test','folder','film');await page.waitForFunction(()=>canvas.folder_id==='film');assert.equal(state.records[0].nodes[0].text,'拖放前最终文本');assert.equal(state.moves.length,1);assert.equal(await page.evaluate(()=>MemberCanvasEdit.canEdit),true);assert.equal(await page.evaluate(()=>canvas.revision),state.records[0].revision);assert.equal(state.calls.filter(call=>call.path.includes('/edit-lease/acquire')).length,1);assert.deepEqual(errors,[]);
});

test('moving another canvas acquires and releases its own temporary edit lease',async t=>{
    const {page,state,errors}=await setup(t);await drag(page,'canvas','child-canvas','folder','outside');await page.waitForFunction(()=>document.querySelector('[data-folder-drop="outside"] > [data-canvas-row="child-canvas"]'));assert.equal(state.moves.length,1);assert.equal(state.held.has('child-canvas'),false);assert.equal(state.held.has('canvas-test'),true);assert.deepEqual(errors,[]);
});

test('failed final save prevents the current canvas move and preserves its draft',async t=>{
    const {page,state,errors}=await setup(t,{denySave:true});await page.evaluate(()=>{nodes[0].text='未保存草稿';smartCanvasDirty=true;});await drag(page,'canvas','canvas-test','folder','film');await page.locator('#pixmaxNavigator [role=status]').filter({hasText:'当前更改尚未保存'}).waitFor();assert.equal(state.moves.length,0);assert.equal(state.records[0].folder_id,'outside');assert.equal(await page.evaluate(()=>nodes[0].text),'未保存草稿');assert.deepEqual(errors,[]);
});

test('dragging a folder to one of its descendants does not dispatch a move',async t=>{
    const {page,state,errors}=await setup(t);await drag(page,'folder','film','folder','sound');assert.equal(state.moves.length,0);assert.equal(state.folders[0].parent_id,'');assert.deepEqual(errors,[]);
});

test('read-only members cannot start a folder or canvas drag',async t=>{
    const {page,state,errors}=await setup(t,{readOnly:true});assert.equal(await row(page,'folder','film').getAttribute('draggable'),'false');assert.equal(await row(page,'canvas','canvas-test').getAttribute('draggable'),'false');await drag(page,'folder','film','folder','outside');assert.equal(state.moves.length,0);assert.deepEqual(errors,[]);
});

test('a rejected placement leaves the authoritative hierarchy intact and reports its conflict',async t=>{
    const {page,state,errors}=await setup(t,{denyMove:true});await drag(page,'folder','film','folder','outside');await page.locator('#pixmaxNavigator [role=status]').filter({hasText:'目录目标已变化'}).waitFor();assert.equal(state.moves.length,1);assert.equal(state.folders[0].parent_id,'');assert.equal(await page.locator('[data-folder-drop="outside"] [data-folder-drop="film"]').count(),0);assert.deepEqual(errors,[]);
});

test('a late placement response cannot update the canvas or directory in a different workspace',async t=>{
    const {page,state,release,errors}=await setup(t,{holdMove:true});await drag(page,'canvas','canvas-test','folder','film');await page.waitForFunction(()=>CanvasDirectoryApi.busy);await page.evaluate(()=>{window.__moveOldFolder=canvas.folder_id;CanvasSession.context.workspace.id='other-space';PixmaxNavigator.documentChanged();});release();await page.waitForFunction(()=>!CanvasDirectoryApi.busy);assert.equal(await page.evaluate(()=>canvas.folder_id),'outside');assert.equal(state.moves.length,1);assert.deepEqual(errors,[]);
});
