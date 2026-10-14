const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function setup(t,options={}){
    const result=await fixture(t,'smart',true,{navigatorOpen:true,...options});
    await result.page.waitForFunction(()=>document.querySelector('#pixmaxNavigator')&&document.querySelector('[data-canvas-open="canvas-test"]'));
    await result.page.evaluate(()=>Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}}));
    return result;
}

test('canvas sidebar matches reference geometry, searches folder descendants and retains closed preference',async t=>{
    const {page,errors}=await setup(t,{folders:[{id:'film',name:'电影项目',parent_id:''},{id:'story',name:'分镜',parent_id:'film'}],
        extraRecords:[{id:'scene',title:'雨夜',kind:'smart',folder_id:'story'},{id:'poster',title:'海报',kind:'classic',folder_id:'film'}]});
    const box=await page.locator('#pixmaxNavigator').boundingBox();assert.deepEqual({x:box.x,y:box.y,width:box.width,height:box.height},{x:16,y:16,width:380,height:868});
    assert.ok((await page.locator('.pixmax-rail').boundingBox()).x>=408);
    assert.equal(await page.locator('.pixmax-navigator-toggle svg').count(),1);
    await page.evaluate(()=>localStorage.removeItem(CanvasSession.storageKey('pixmax_navigator_v1')));await page.reload();await page.waitForFunction(()=>Boolean(document.querySelector('[data-canvas-open="scene"]')));
    assert.equal(await page.locator('#pixmaxNavigator').isVisible(),true);
    await page.getByRole('searchbox',{name:'搜索画布或节点'}).fill('电影项目');
    await page.locator('[data-canvas-open="canvas-test"]').waitFor({state:'detached'});assert.equal(await page.locator('[data-canvas-open="poster"]').count(),1);assert.equal(await page.locator('[data-canvas-open="scene"]').count(),1);
    await page.getByRole('searchbox',{name:'搜索画布或节点'}).fill('雨夜');await page.locator('[data-canvas-open="poster"]').waitFor({state:'detached'});assert.equal(await page.locator('[data-canvas-open="scene"]').count(),1);
    await page.getByRole('button',{name:'关闭画布目录',exact:true}).click();await page.reload();await page.waitForFunction(()=>typeof canvas!=='undefined'&&canvas?.id==='canvas-test'&&document.querySelector('#pixmaxNavigator'));
    assert.equal(await page.locator('#pixmaxNavigator').isVisible(),false);await page.getByRole('button',{name:'画布目录',exact:true}).click();assert.equal(await page.locator('#pixmaxNavigator').isVisible(),true);assert.deepEqual(errors,[]);
});

test('node sidebar filters, locates in the uncovered viewport and tracks names, pin, undo and deletion',async t=>{
    const {page,errors}=await setup(t);
    await page.evaluate(()=>{const text=createPromptNode(900,3000,{select:false});text.label='故事';text.text='雨夜寻找旧友';const video=createGenerationNodeAt({x:2000,y:1000},'video',{select:false});video.label='电影镜头';render();});
    await page.getByRole('tab',{name:'节点',exact:true}).click();await page.getByRole('searchbox',{name:'搜索画布或节点'}).fill('寻找旧友');
    await page.getByRole('button',{name:'定位节点 故事',exact:true}).click();
    const result=await page.evaluate(()=>{const rect=world.querySelector('.selected').getBoundingClientRect();return {label:selectedNode().label,centerX:(rect.left+rect.right)/2,centerY:(rect.top+rect.bottom)/2};});
    assert.equal(result.label,'故事');assert.ok(Math.abs(result.centerX-846)<2);assert.ok(Math.abs(result.centerY-450)<2);
    await page.getByRole('tab',{name:'节点',exact:true}).press('ArrowLeft');await page.waitForFunction(()=>document.querySelector('[data-directory-tab="canvas"]').getAttribute('aria-selected')==='true');
    await page.getByRole('tab',{name:'画布',exact:true}).press('ArrowRight');await page.waitForFunction(()=>document.querySelector('[data-directory-tab="nodes"]').getAttribute('aria-selected')==='true');
    await page.getByRole('searchbox',{name:'搜索画布或节点'}).fill('');await page.getByRole('combobox',{name:'节点类型'}).selectOption('video');
    await page.getByRole('button',{name:'定位节点 故事',exact:true}).waitFor({state:'detached'});assert.equal(await page.getByRole('button',{name:'定位节点 电影镜头',exact:true}).count(),1);
    await page.getByRole('combobox',{name:'节点类型'}).selectOption('');
    await page.getByRole('button',{name:'节点操作 故事',exact:true}).click();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
    await page.locator('.canvas-name-dialog').getByRole('textbox',{name:'节点名称',exact:true}).fill('雨夜剧本');await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.getByRole('button',{name:'定位节点 雨夜剧本',exact:true}).waitFor();
    await page.getByRole('button',{name:'节点操作 雨夜剧本',exact:true}).click();await page.getByRole('menuitem',{name:'pin 到汇总',exact:true}).click();
    assert.equal(await page.evaluate(()=>nodes[0].pinned),true);await page.evaluate(()=>performUndo());await page.waitForFunction(()=>!nodes[0].pinned);
    await page.evaluate(()=>{deleteNode(nodes[0].id);});await page.getByRole('button',{name:'定位节点 雨夜剧本',exact:true}).waitFor({state:'detached'});assert.deepEqual(errors,[]);
});

test('new folder and nested folder rename use authoritative catalog and preserve canvas selection',async t=>{
    const {page,errors,record}=await setup(t),folders=[];
    await page.route('**/api/canvas-folders',route=>{
        if(route.request().method()==='POST'){const payload=route.request().postDataJSON(),folder={id:'folder-'+folders.length,...payload};folders.push(folder);return route.fulfill({json:{folder,folders}});}
        return route.fulfill({json:{folders}});
    });
    await page.route('**/api/canvas-folders/folder-0',route=>{Object.assign(folders[0],route.request().postDataJSON());return route.fulfill({json:{folder:folders[0],folders}});});
    await page.evaluate(()=>{createPromptNode(700,200);});const selected=await page.evaluate(()=>smartSelection.nodeId);
    await page.getByRole('button',{name:'新建文件夹',exact:true}).click();await page.getByRole('textbox',{name:'文件夹名称',exact:true}).fill('电影');await page.getByRole('button',{name:'创建',exact:true}).click();
    await page.getByRole('button',{name:'文件夹 电影',exact:true}).waitFor();assert.equal(await page.evaluate(()=>smartSelection.nodeId),selected);
    await page.getByRole('button',{name:'文件夹操作 电影',exact:true}).click();await page.getByRole('menuitem',{name:'重命名',exact:true}).click();await page.getByRole('textbox',{name:'文件夹名称',exact:true}).fill('电影项目');await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.getByRole('button',{name:'文件夹 电影项目',exact:true}).waitFor();assert.equal(record.kind,'smart');assert.deepEqual(errors,[]);
});

test('current canvas metadata uses the member write owner and keeps document edits and revision',async t=>{
    const {page,errors,record,writes}=await setup(t,{folders:[{id:'film',name:'电影',parent_id:''}]});
    await page.evaluate(()=>{
        const original=MemberCanvasEdit.send;MemberCanvasEdit.send=(path,init,transport)=>{window.memberWrites=(window.memberWrites||[]).concat(path);return original(path,init,transport);};
        window.CanvasDirectoryWrites={...CanvasDirectoryWrites,write:()=>{throw new Error('must not acquire a second lease directly');}};
        createPromptNode(650,220).text='保存前的正文';
    });
    await page.route('**/api/canvases/canvas-test/meta',route=>{Object.assign(record,route.request().postDataJSON());record.revision++;return route.fulfill({json:{canvas:record}});});
    await page.route('**/api/canvases/canvas-test/folder',route=>{Object.assign(record,route.request().postDataJSON());record.revision++;return route.fulfill({json:{canvas:record}});});
    await page.getByRole('button',{name:'画布操作 Module regression',exact:true}).click();await page.getByRole('menuitem',{name:'重命名',exact:true}).click();
    await page.getByRole('textbox',{name:'画布名称',exact:true}).fill('电影项目画布');await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.getByRole('button',{name:'画布操作 电影项目画布',exact:true}).waitFor();
    await page.getByRole('button',{name:'画布操作 电影项目画布',exact:true}).click();await page.getByRole('menuitem',{name:'移动到文件夹',exact:true}).click();await page.getByRole('menuitem',{name:'移到 电影',exact:true}).click();
    await page.waitForFunction(()=>canvas.folder_id==='film');await page.evaluate(()=>saveCanvas({force:true}));
    assert.equal(record.nodes[0].text,'保存前的正文');assert.equal(record.title,'电影项目画布');assert.equal(record.folder_id,'film');
    const sent=await page.evaluate(()=>memberWrites);assert.ok(sent.includes('/api/canvases/canvas-test/meta'));assert.ok(sent.includes('/api/canvases/canvas-test/folder'));assert.equal(writes.filter(write=>write.path.includes('/edit-lease')).length,0);assert.deepEqual(errors,[]);
});

test('read-only users can locate nodes but cannot create, rename, pin or move',async t=>{
    const {page,errors,writes}=await setup(t,{permissions:['canvas.read'],record:{nodes:[{id:'text',type:'smart-prompt',text:'只读正文',label:'只读节点',x:800,y:500,images:[]}]}});
    await page.evaluate(()=>MemberCanvasEdit.setEditable(false));
    assert.equal(await page.getByRole('button',{name:'新建画布',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'新建文件夹',exact:true}).isDisabled(),true);
    await page.getByRole('tab',{name:'节点',exact:true}).click();await page.getByRole('button',{name:'定位节点 只读节点',exact:true}).click();
    await page.getByRole('button',{name:'节点操作 只读节点',exact:true}).click();assert.equal(await page.getByRole('menuitem',{name:'重命名',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('menuitem',{name:'pin 到汇总',exact:true}).isDisabled(),true);
    assert.equal(writes.filter(write=>!write.path.endsWith('/touch')).length,0);assert.deepEqual(errors,[]);
});

test('an open node rename dialog refuses a changed edit lease',async t=>{
    const {page,errors}=await setup(t,{record:{nodes:[{id:'text',type:'smart-prompt',label:'已有节点',x:800,y:500,images:[]}]}});
    await page.getByRole('tab',{name:'节点',exact:true}).click();await page.getByRole('button',{name:'节点操作 已有节点',exact:true}).click();await page.getByRole('menuitem',{name:'重命名',exact:true}).click();
    await page.locator('.canvas-name-dialog').getByRole('textbox',{name:'节点名称',exact:true}).fill('不应写入');await page.evaluate(()=>{MemberCanvasEdit.setEditable(false);MemberCanvasEdit.setEditable(true);});
    await page.getByRole('button',{name:'保存',exact:true}).click();await page.getByRole('alert').filter({hasText:'编辑资格已变化'}).waitFor();assert.equal(await page.evaluate(()=>nodes[0].label),'已有节点');assert.deepEqual(errors,[]);
});

test('sidebar navigation saves the current document before opening another canvas',async t=>{
    const other={id:'other',kind:'smart',title:'另一个画布',revision:1,nodes:[],connections:[],logs:[],settings:{},viewport:{x:0,y:0,scale:1}};
    const {page,record,errors}=await setup(t,{extraRecords:[other]});
    await page.route('**/api/canvases/other',route=>route.fulfill({json:{canvas:other}}));
    await page.evaluate(()=>{MemberCanvasEdit.leave=()=>MemberCanvasEdit.options.flush();createPromptNode(700,200).text='离开前保存';});
    let fail=true;await page.route('**/api/canvases/canvas-test',route=>route.request().method()==='PUT'&&fail?route.fulfill({status:503,json:{detail:'save unavailable'}}):route.fallback());
    await page.locator('[data-canvas-open="other"]').click();await page.waitForResponse(response=>response.url().endsWith('/canvas-test')&&response.status()===503);
    assert.ok(page.url().endsWith('/canvas-test'));fail=false;await page.locator('[data-canvas-open="other"]').click();await page.waitForURL('**/canvases/other');await page.waitForFunction(()=>canvas?.id==='other');
    assert.equal(record.nodes[0].text,'离开前保存');assert.deepEqual(errors,[]);
});

test('sidebar fits narrow screens and supplies a visual preview',async t=>{
    const {page,errors}=await setup(t,{folders:[{id:'film',name:'电影项目',parent_id:''}],extraRecords:[{id:'scene',kind:'smart',title:'雨夜镜头',folder_id:'film'}]});
    await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.resolve('.local/pixmax-navigator-upgrade.png')});
    await page.setViewportSize({width:375,height:667});const rect=await page.locator('#pixmaxNavigator').boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=375&&rect.y+rect.height<=667);
    await page.getByRole('button',{name:'关闭画布目录',exact:true}).click();await page.getByRole('button',{name:'画布目录',exact:true}).click();assert.equal(await page.locator('#pixmaxNavigator').isVisible(),true);assert.deepEqual(errors,[]);
});

test('creating a canvas retains it in the catalog when the current document cannot yet be saved',async t=>{
    const {page,record,errors}=await setup(t),created={id:'new-film',kind:'smart',revision:1,title:'新电影',nodes:[],connections:[],logs:[],settings:{},viewport:{x:0,y:0,scale:1}};
    let admissions=0,fail=true;
    await page.route('**/api/canvases',route=>{
        if(route.request().method()==='POST'){admissions++;assert.deepEqual(route.request().postDataJSON(),{title:'新电影',kind:'smart',icon:'sparkles',folder_id:''});return route.fulfill({json:{canvas:created}});}
        return route.fulfill({json:{canvases:admissions?[record,created]:[record]}});
    });
    await page.route('**/api/canvases/canvas-test',route=>route.request().method()==='PUT'&&fail?route.fulfill({status:503,json:{detail:'save unavailable'}}):route.fallback());
    await page.route('**/api/canvases/new-film',route=>route.fulfill({json:{canvas:created}}));
    await page.evaluate(()=>{MemberCanvasEdit.leave=()=>MemberCanvasEdit.options.flush();createPromptNode(700,250).text='尚未保存的剧本';});
    await page.getByRole('button',{name:'新建画布',exact:true}).click();await page.getByRole('textbox',{name:'画布名称',exact:true}).fill('新电影');await page.getByRole('button',{name:'创建',exact:true}).click();
    await page.locator('#pixmaxNavigator [role=status]').filter({hasText:'画布已创建'}).waitFor();assert.equal(admissions,1);assert.ok(page.url().endsWith('/canvas-test'));assert.equal(await page.locator('[data-canvas-open="new-film"]').count(),1);
    fail=false;await page.locator('[data-canvas-open="new-film"]').click();await page.waitForURL('**/canvases/new-film');await page.waitForFunction(()=>canvas?.id==='new-film');assert.equal(record.nodes[0].text,'尚未保存的剧本');assert.deepEqual(errors,[]);
});

test('a directory read started before a write cannot overwrite the updated catalog',async t=>{
    const other={id:'other',kind:'smart',title:'旧名称'}, {page,record,errors}=await setup(t,{extraRecords:[other]});
    let release,seen,reads=0;const gate=new Promise(resolve=>release=resolve),requested=new Promise(resolve=>seen=resolve);
    await page.route('**/api/canvases',async route=>{const snapshot=JSON.parse(JSON.stringify([record,other]));if(++reads===1){seen();await gate;}return route.fulfill({json:{canvases:snapshot}});});
    await page.route('**/api/canvases/other/meta',route=>{Object.assign(other,route.request().postDataJSON());return route.fulfill({json:{canvas:other}});});
    await page.evaluate(()=>{window.navRefresh=PixmaxNavigator.refresh();});await requested;await page.evaluate(()=>CanvasDirectoryApi.patchCanvasMeta('other',{title:'新名称'}));release();await page.evaluate(()=>navRefresh);
    await page.getByRole('button',{name:'画布操作 新名称',exact:true}).waitFor();assert.equal(reads,2);assert.equal(await page.getByRole('button',{name:'画布操作 旧名称',exact:true}).count(),0);assert.deepEqual(errors,[]);
});

test('changing workspace clears old catalog and node references and ignores an old pending read',async t=>{
    const {page,errors}=await setup(t,{record:{title:'旧空间画布',nodes:[{id:'private',type:'smart-prompt',label:'旧空间节点',text:'旧空间内容',x:800,y:500,images:[]}]}});
    let release,seen,reads=0;const gate=new Promise(resolve=>release=resolve),requested=new Promise(resolve=>seen=resolve);
    await page.route('**/api/canvases',async route=>{if(++reads===1){seen();await gate;return route.fulfill({json:{canvases:[{id:'canvas-test',kind:'smart',title:'旧空间画布'}]}});}return route.fulfill({json:{canvases:[{id:'new-space',kind:'smart',title:'新空间画布'}]}});});
    await page.evaluate(()=>{window.oldRefresh=PixmaxNavigator.refresh();});await requested;
    await page.evaluate(()=>{CanvasSession.context.workspace={id:'workspace-2',name:'新空间',permissions:['canvas.read']};CanvasSession.storageKey=key=>'member-1:workspace-2:'+key;PixmaxNavigator.documentChanged();});
    await page.locator('[data-canvas-open="new-space"]').waitFor();assert.equal(await page.locator('[data-canvas-open="canvas-test"]').count(),0);release();await page.evaluate(()=>oldRefresh);
    await page.getByRole('tab',{name:'节点',exact:true}).click();await page.locator('.pixmax-directory-empty').filter({hasText:'请从目录打开画布'}).waitFor();assert.equal(await page.getByRole('button',{name:'定位节点 旧空间节点',exact:true}).count(),0);assert.equal(await page.locator('[data-directory-title]').innerText(),'新空间');assert.deepEqual(errors,[]);
});

test('fit and zoom use the visible canvas area, and mobile node selection closes the overlay',async t=>{
    const {page,errors}=await setup(t);
    await page.evaluate(()=>{createPromptNode(-300,300,{select:false}).label='左侧';createPromptNode(600,600,{select:false}).label='右侧';fitAllNodesViewport();});
    const result=await page.evaluate(()=>{const bounds=smartViewportBounds(),before=viewportCenter();zoomPixmaxCanvas(1.2);const after=viewportCenter();return {x:bounds.x,width:bounds.width,before,after,boxes:[...world.querySelectorAll('.image-node')].map(el=>el.getBoundingClientRect().toJSON())};});
    assert.equal(result.x,412);assert.equal(result.width,868);assert.ok(Math.abs(result.before.x-result.after.x)<.001);assert.ok(Math.abs(result.before.y-result.after.y)<.001);assert.ok(result.boxes.every(box=>box.left>=396&&box.right<=1280));
    await page.setViewportSize({width:375,height:667});await page.getByRole('tab',{name:'节点',exact:true}).click();await page.getByRole('button',{name:'定位节点 左侧',exact:true}).click();assert.equal(await page.locator('#pixmaxNavigator').isVisible(),false);assert.equal(await page.evaluate(()=>selectedNode().label),'左侧');assert.deepEqual(errors,[]);
});
