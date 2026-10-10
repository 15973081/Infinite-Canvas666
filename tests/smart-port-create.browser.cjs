const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');

async function dragPort(page,id,port,point){
    await page.locator(`.image-node[data-id="${id}"]`).hover();
    const locator=page.locator(`.image-node[data-id="${id}"] .node-port[data-port="${port}"]`);
    const bounds=await locator.boundingBox();
    await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
    await page.mouse.down();
    await page.mouse.move(point.x,point.y,{steps:8});
    await page.mouse.up();
}

test('dragging an output offers image/video prompts and creates the chosen connected node as one undo operation',async t=>{
    const {page,errors,record}=await fixture(t,'smart',false);
    const sourceId=await page.evaluate(()=>{
        apiProviders=[{id:'test',name:'Test',enabled:true,has_key:true,image_models:['image-model'],video_models:['video-model']}];
        const source=createPromptNode(100,180);source.text='雨夜街道';render();return source.id;
    });
    for(const kind of ['image','video']){
        const undoCount=await page.evaluate(()=>undoStack.length);
        await dragPort(page,sourceId,'out',{x:800,y:300});
        assert.equal(await page.locator('#createMenu.open').count(),1);
        assert.deepEqual((await page.locator('#createMenu [role="menuitem"]:visible').allTextContents()).map(text=>text.trim()),['图片提示词','视频提示词']);
        const bounds=await page.locator('#createMenu').boundingBox();assert.ok(bounds.width<=220 && bounds.height<110);
        assert.deepEqual(await page.evaluate(()=>({nodes:nodes.length,links:canvas.connections.length,undo:undoStack.length})),{nodes:1,links:0,undo:undoCount});
        if(kind==='video'){await page.keyboard.press('End');await page.keyboard.press('Enter');}
        else await page.getByRole('menuitem',{name:'图片提示词',exact:true}).click();
        const result=await page.evaluate(()=>{
            const node=nodes[1],rect=nodeRect(node);
            return {id:node.id,kind:node.generationKind,mode:node.runSettings.apiKind,inputs:node.inputNodeIds,connections:canvas.connections,undo:undoStack.length,center:{x:rect.x+rect.width/2,y:rect.y+rect.height/2}};
        });
        assert.equal(result.kind,kind);assert.equal(result.mode,kind);
        assert.deepEqual(result.inputs,[sourceId]);
        assert.deepEqual(result.connections,[{from:sourceId,to:result.id,kind:'input'}]);
        assert.equal(result.undo,undoCount+1);assert.deepEqual(result.center,{x:800,y:300});
        assert.equal(await page.locator('#composerHeading').textContent(),kind==='image'?'图片生成':'视频生成');
        assert.match(await page.locator('#inputPromptPreview').innerText(),/雨夜街道/);
        assert.equal(await page.locator('#apiKindToggle').isVisible(),false);
        assert.equal(await page.locator('#promptInput').evaluate(el=>el===document.activeElement),true);
        await page.evaluate(async()=>saveCanvas({force:true}));
        assert.equal(record.nodes[1].generationKind,kind);assert.deepEqual(record.connections,result.connections);
        await page.reload();await page.waitForFunction(()=>nodes.length===2);
        assert.equal(await page.evaluate(()=>nodes[1].generationKind),kind);
        // Start the next kind with only the original text node.
        await page.evaluate(()=>{nodes=nodes.slice(0,1);canvas.connections=[];clearSelection();render();});
    }
    // Exercise the real history without a reload in between.
    await page.evaluate(()=>{smartSelection.createdNode(nodes[0].id);render();});
    await dragPort(page,sourceId,'out',{x:800,y:300});
    await page.getByRole('menuitem',{name:'视频提示词',exact:true}).click();
    await page.evaluate(()=>performUndo());
    assert.deepEqual(await page.evaluate(()=>({nodes:nodes.length,links:canvas.connections.length,inputs:nodes[0].inputNodeIds||[]})),{nodes:1,links:0,inputs:[]});
    assert.deepEqual(errors,[]);
});

test('input drag respects connection direction and zoom; direct drops keep connecting existing nodes',async t=>{
    const {page,errors}=await fixture(t,'smart',true);
    const targetId=await page.evaluate(()=>{
        const target=createGenerationNodeAt({x:550,y:220},'video');
        viewport={x:40,y:20,scale:1.25};applyViewport();return target.id;
    });
    await dragPort(page,targetId,'in',{x:180,y:300});
    await page.getByRole('menuitem',{name:'图片提示词',exact:true}).click();
    const sourceId=await page.evaluate(()=>nodes[1].id);
    assert.deepEqual(await page.evaluate(()=>({links:canvas.connections,inputs:nodes[0].inputNodeIds,point:{x:nodes[1].x+120,y:nodes[1].y+120}})),{
        links:[{from:sourceId,to:targetId,kind:'input'}],inputs:[sourceId],point:{x:112,y:224}
    });
    await page.evaluate(()=>performUndo());
    const textId=await page.evaluate(()=>{viewport={x:0,y:0,scale:1};applyViewport();return createPromptNode(40,120).id;});
    const port=await page.locator(`.image-node[data-id="${targetId}"] .node-port[data-port="in"]`).boundingBox();
    await dragPort(page,textId,'out',{x:port.x+port.width/2,y:port.y+port.height/2});
    assert.equal(await page.locator('#createMenu.open').count(),0);
    assert.equal(await page.evaluate(()=>nodes.length),2);
    assert.deepEqual(await page.evaluate(()=>canvas.connections),[{from:textId,to:targetId,kind:'input'}]);
    assert.deepEqual(errors,[]);
});

test('cancelled, stale and readonly menus do not create nodes or undo entries; blank double-click retains all actions',async t=>{
    const {page,errors}=await fixture(t,'smart',true);
    const sourceId=await page.evaluate(()=>createPromptNode(100,180).id);
    const undoCount=await page.evaluate(()=>undoStack.length);
    for(const cancel of ['escape','outside','wheel']){
        await dragPort(page,sourceId,'out',{x:800,y:300});
        await page.keyboard.press('ArrowDown');
        assert.equal(await page.evaluate(()=>document.activeElement.dataset.createType),'generate-video');
        await page.keyboard.press('ArrowDown');
        assert.equal(await page.evaluate(()=>document.activeElement.dataset.createType),'generate-image');
        if(cancel==='escape')await page.keyboard.press('Escape');
        if(cancel==='outside')await page.mouse.click(650,140);
        if(cancel==='wheel'){await page.mouse.move(650,140);await page.mouse.wheel(0,50);}
        await page.waitForFunction(()=>!createMenu.classList.contains('open'));
        assert.deepEqual(await page.evaluate(()=>({nodes:nodes.length,links:canvas.connections.length,undo:undoStack.length})),{nodes:1,links:0,undo:undoCount});
    }
    await page.mouse.dblclick(800,300);
    assert.equal(await page.locator('#createMenu [role="menuitem"]:visible').count(),5);
    assert.equal(await page.getByRole('menuitem',{name:'图片生成',exact:true}).count(),1);
    await page.keyboard.press('Escape');
    await dragPort(page,sourceId,'out',{x:800,y:300});
    await page.evaluate(()=>MemberCanvasEdit.setEditable(false));
    assert.equal(await page.locator('#createMenu.open').count(),0);
    await page.evaluate(()=>createNodeFromMenu('generate-video'));
    assert.equal(await page.evaluate(()=>nodes.length),1);
    await page.evaluate(()=>MemberCanvasEdit.setEditable(true));
    await dragPort(page,sourceId,'out',{x:800,y:300});
    await page.evaluate(()=>{nodes=[];render();});
    await page.getByRole('menuitem',{name:'视频提示词',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>({nodes:nodes.length,undo:undoStack.length})),{nodes:0,undo:undoCount});
    assert.deepEqual(errors,[]);
});
