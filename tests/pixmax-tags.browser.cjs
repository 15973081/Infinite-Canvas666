const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function setup(t,options={}){
    const result=await fixture(t,'smart',true,options);
    await result.page.evaluate(()=>Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}}));return result;
}
test('colored node tags support multiple memberships, persist and participate in undo and redo',async t=>{
    const {page,record,errors}=await setup(t);
    await page.evaluate(()=>{const node=createPromptNode(600,180);node.label='故事';PixmaxTags.openPicker([node.id]);});
    await page.getByRole('checkbox',{name:'蓝色',exact:true}).check();await page.getByRole('checkbox',{name:'绿色',exact:true}).check();
    assert.deepEqual(await page.evaluate(()=>nodes[0].tags),['blue','green']);assert.equal(await page.evaluate(()=>nodes[0].pinned),true);assert.equal(await page.locator('.pixmax-node-tag-dots .pixmax-tag-dot').count(),2);
    await page.getByRole('button',{name:'关闭节点标签',exact:true}).click();await page.evaluate(()=>performUndo());assert.deepEqual(await page.evaluate(()=>nodes[0].tags),['blue']);await page.evaluate(()=>redoSmartCanvas());assert.deepEqual(await page.evaluate(()=>nodes[0].tags),['blue','green']);
    await page.evaluate(()=>saveCanvas({force:true}));assert.equal(record.node_tags.length,6);await page.reload();await page.waitForFunction(()=>nodes[0]?.tags?.length===2);assert.deepEqual(errors,[]);
});
test('batch tag selection adds memberships and explicit clearing replaces them as one undo operation',async t=>{
    const {page,errors}=await setup(t);
    await page.evaluate(()=>{const first=createPromptNode(400,180,{select:false}),second=createPromptNode(700,180);first.tags=['blue'];first.pinned=true;PixmaxTags.openPicker([first.id,second.id]);});
    await page.getByRole('checkbox',{name:'黄色',exact:true}).check();await page.getByRole('button',{name:'应用到选中节点',exact:true}).click();assert.deepEqual(await page.evaluate(()=>nodes.map(node=>node.tags)),[['blue','yellow'],['yellow']]);
    await page.evaluate(()=>PixmaxTags.openPicker(nodes.map(node=>node.id)));await page.getByRole('button',{name:'清空标签',exact:true}).click();await page.getByRole('checkbox',{name:'紫色',exact:true}).check();await page.getByRole('button',{name:'应用到选中节点',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>nodes.map(node=>node.tags)),[['purple'],['purple']]);await page.evaluate(()=>performUndo());assert.deepEqual(await page.evaluate(()=>nodes.map(node=>node.tags)),[['blue','yellow'],['yellow']]);assert.deepEqual(errors,[]);
});
test('pin summary renames groups, searches and clears a single group without deleting nodes or other memberships',async t=>{
    const {page,record,errors}=await setup(t);
    await page.evaluate(()=>{const one=createPromptNode(400,180,{select:false}),two=createPromptNode(700,180);one.label='雨夜';one.text='街景';one.tags=['blue','green'];one.pinned=true;two.label='人物';two.tags=['blue'];two.pinned=true;openPixmaxPins();});
    await page.locator('[data-pin-tag="blue"]').click();await page.getByRole('button',{name:'修改pin名称',exact:true}).click();await page.getByRole('textbox',{name:'pin名称',exact:true}).fill('剧情素材');await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.locator('[data-pin-tag="blue"]').filter({hasText:'剧情素材'}).waitFor();await page.getByRole('searchbox',{name:'搜索pin素材',exact:true}).fill('街景');await page.getByRole('button',{name:'定位 人物',exact:true}).waitFor({state:'detached'});
    await page.screenshot({path:require('node:path').resolve('.local/pixmax-pin-groups.png')});
    await page.getByRole('searchbox',{name:'搜索pin素材',exact:true}).fill('');page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'批量去除当前pin',exact:true}).click();
    assert.equal(await page.evaluate(()=>nodes.length),2);assert.deepEqual(await page.evaluate(()=>nodes.map(node=>node.tags)),[['green'],[]]);await page.evaluate(()=>performUndo());assert.deepEqual(await page.evaluate(()=>nodes.map(node=>node.tags)),[['blue','green'],['blue']]);
    await page.evaluate(()=>saveCanvas({force:true}));assert.equal(record.node_tags.find(tag=>tag.id==='blue').name,'剧情素材');assert.deepEqual(errors,[]);
});
test('native import remaps colliding tag definitions and workflow export retains them',async t=>{
    const {page,errors}=await setup(t);
    await page.evaluate(()=>{
        canvas.node_tags=PixmaxTags.definitions().map(tag=>tag.id==='blue'?{...tag,name:'背景'}:tag);
        insertSmartWorkflowIntoCanvas({metaData:JSON.stringify({nodeTags:{schemaVersion:1,value:{tags:[{id:'blue',color:'#4285f4',name:'角色'}]}}}),nodes:[{uuid:'reference',type:'GENERATE_TEXT',nodeText:'演员',metaData:JSON.stringify({data:{tags:['blue']},position:{x:10,y:10}})}]});
    });
    const result=await page.evaluate(()=>({ids:nodes[0].tags,definitions:PixmaxTags.definitions(),export:selectedSmartWorkflowPayload()}));assert.notEqual(result.ids[0],'blue');assert.equal(result.definitions.find(tag=>tag.id===result.ids[0]).name,'角色');assert.equal(result.definitions.find(tag=>tag.id==='blue').name,'背景');assert.ok(result.export.node_tags.some(tag=>tag.name==='角色'));
    await page.evaluate(()=>performUndo());assert.equal(await page.evaluate(()=>nodes.length),0);assert.equal(await page.evaluate(()=>PixmaxTags.definitions().some(tag=>tag.name==='角色')),false);assert.deepEqual(errors,[]);
});
test('read-only tag browsing cannot mutate memberships, and an expired picker cannot commit',async t=>{
    const {page,errors,writes}=await setup(t,{record:{nodes:[{id:'node',type:'smart-prompt',tags:['blue'],pinned:true,text:'内容',x:400,y:150}]}});
    await page.evaluate(()=>{MemberCanvasEdit.setEditable(false);PixmaxTags.openPicker(['node']);});assert.equal(await page.getByRole('checkbox',{name:'蓝色',exact:true}).isDisabled(),true);await page.getByRole('button',{name:'关闭节点标签',exact:true}).click();
    await page.evaluate(()=>{MemberCanvasEdit.setEditable(true);PixmaxTags.openPicker(['node']);MemberCanvasEdit.setEditable(false);});await page.getByRole('checkbox',{name:'绿色',exact:true}).check();await page.getByRole('button',{name:'关闭节点标签',exact:true}).click();assert.deepEqual(await page.evaluate(()=>nodes[0].tags),['blue']);assert.equal(writes.filter(row=>row.method==='PUT').length,0);assert.deepEqual(errors,[]);
});
test('pin bulk download includes literal text and readonly viewing still permits downloading',async t=>{
    const {page,errors}=await setup(t,{record:{nodes:[{id:'node',type:'smart-prompt',pinned:true,text:'雨夜剧本',label:'剧本',x:400,y:150}]}});
    let payload;await page.route('**/api/canvas-assets/download',route=>{payload=route.request().postDataJSON();return route.fulfill({contentType:'application/zip',body:Buffer.from('PK fixture')});});
    await page.evaluate(()=>{MemberCanvasEdit.setEditable(false);openPixmaxPins();});assert.equal(await page.getByRole('button',{name:'批量去除当前pin',exact:true}).isDisabled(),true);
    const download=page.waitForEvent('download');await page.getByRole('button',{name:'批量下载pin节点',exact:true}).click();await download;assert.deepEqual(payload.items,[{kind:'text',name:'剧本.txt',text:'雨夜剧本'}]);assert.deepEqual(errors,[]);
});

test('tag panels close on a workspace change without applying a pending batch selection',async t=>{
    const {page,errors}=await setup(t);
    await page.evaluate(()=>{const one=createPromptNode(300,150,{select:false}),two=createPromptNode(600,150);one.text='私有内容';one.pinned=true;openPixmaxPins();PixmaxTags.openPicker([one.id,two.id]);});
    await page.getByRole('checkbox',{name:'蓝色',exact:true}).check();await page.evaluate(()=>{CanvasSession.context.workspace.id='another-space';PixmaxTags.notifyChanged();});
    await page.locator('.pixmax-tag-picker').waitFor({state:'detached'});await page.locator('#pixmaxPinsPanel').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>nodes.some(node=>node.tags?.includes('blue'))),false);assert.deepEqual(errors,[]);
});

test('clipboard paste remaps renamed tag definitions and undo restores the destination metadata',async t=>{
    const {page,errors}=await setup(t);
    await page.evaluate(()=>{
        const node=createPromptNode(400,150);node.tags=['blue'];node.pinned=true;
        canvas.node_tags=PixmaxTags.definitions().map(tag=>tag.id==='blue'?{...tag,name:'角色'}:tag);copySelectedNodes();
        canvas.node_tags=PixmaxTags.definitions().map(tag=>tag.id==='blue'?{...tag,name:'背景'}:tag);pasteNodes();
    });
    assert.equal(await page.evaluate(()=>PixmaxTags.definitions().find(tag=>tag.id===nodes[1].tags[0]).name),'角色');assert.equal(await page.evaluate(()=>PixmaxTags.definitions().find(tag=>tag.id==='blue').name),'背景');
    await page.evaluate(()=>performUndo());assert.equal(await page.evaluate(()=>nodes.length),1);assert.equal(await page.evaluate(()=>PixmaxTags.definitions().some(tag=>tag.name==='角色')),false);assert.deepEqual(errors,[]);
});

test('draft restoration retains named tags, rejects invalid definitions atomically, and saves recovered metadata',async t=>{
    const {page,record,errors}=await setup(t);
    await page.evaluate(()=>{
        const tags=[{id:'blue',color:'#4285f4',name:'恢复的角色'}];
        restoreSmartMemberDraft({id:canvas.id,kind:'smart',nodes:[{id:'draft-node',type:'smart-prompt',text:'演员',tags:['blue'],x:400,y:150}],connections:[],node_tags:tags});
        const before=JSON.stringify(canvas);
        try{restoreSmartMemberDraft({id:canvas.id,kind:'smart',nodes:[],connections:[],node_tags:[{id:'blue',color:'invalid'}]});throw new Error('invalid draft was accepted');}
        catch(error){if(error.message==='invalid draft was accepted')throw error;}
        if(JSON.stringify(canvas)!==before)throw new Error('invalid draft mutated the canvas');
    });
    assert.equal(await page.evaluate(()=>PixmaxTags.definitions()[0].name),'恢复的角色');
    assert.deepEqual(await page.evaluate(()=>PixmaxTags.ids(nodes[0])),['blue']);
    await page.evaluate(()=>saveCanvas({force:true}));assert.deepEqual(record.node_tags,[{id:'blue',color:'#4285F4',name:'恢复的角色'}]);
    await page.reload();await page.waitForFunction(()=>canvas?.node_tags?.[0]?.name==='恢复的角色');assert.deepEqual(errors,[]);
});

test('tag-only saved nodes show their pin state in navigator and node menus',async t=>{
    const {page,errors}=await setup(t,{navigatorOpen:true,record:{nodes:[{id:'tag-only',type:'smart-prompt',text:'角色',label:'角色',tags:['blue'],x:500,y:150}]}});
    await page.locator('[data-directory-tab="nodes"]').click();
    await page.locator('[data-node-row="tag-only"] .pixmax-directory-pin').waitFor();
    await page.getByRole('button',{name:'节点操作 角色',exact:true}).click();
    await page.getByRole('menuitem',{name:'取消 pin',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>nodes[0].tags),[]);assert.deepEqual(errors,[]);
});
