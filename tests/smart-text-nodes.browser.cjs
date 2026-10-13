const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,origin}=require('./helpers/canvas-browser.cjs');

test('pure text node edits, scrolls, connects, resizes and saves without template or LLM controls',async t=>{
    const {page,errors,record}=await fixture(t,'smart',false);
    const requests=[];page.on('request',r=>requests.push(new URL(r.url()).pathname));
    await page.reload();await page.waitForFunction(()=>canvas?.id==='canvas-test');
    await page.evaluate(()=>{window.textNode=createPromptNode(100,160);window.imageNode=createGenerationNodeAt({x:750,y:280},'image');connectInputNode(textNode.id,imageNode.id);});
    const editor=page.getByRole('textbox',{name:'节点文本'});
    assert.equal(await page.locator('.prompt-smart-node .pixmax-node-name').inputValue(),'文本生成节点');
    assert.equal(await page.locator('.prompt-node-tools,.prompt-node-llm,#composerTemplateBtn,#promptTemplatePanel,#promptPresetPanel').count(),0);
    assert.deepEqual(await page.evaluate(()=>[typeof runPromptLLMNode,typeof smartPromptPanels,typeof loadPromptTemplates]),['undefined','undefined','undefined']);
    const content='城市雨夜，霓虹灯映在湿润的街道上。\n'.repeat(40);
    await page.locator('.pixmax-text-view').dblclick();
    await editor.fill(content);
    assert.equal(await page.evaluate(()=>textNode.text),content);
    assert.equal(await editor.evaluate(el=>getComputedStyle(el).borderWidth),'0px');
    assert.equal(await editor.evaluate(el=>getComputedStyle(el).boxShadow),'none');
    const before=await page.evaluate(()=>({...viewport}));
    await editor.hover();await page.mouse.wheel(0,150);
    await page.waitForFunction(()=>document.querySelector('.prompt-node-text').scrollTop>0);
    assert.deepEqual(await page.evaluate(()=>({...viewport})),before);
    // Resize through the real handle, then undo through the document controller.
    const handle=await page.locator('.prompt-smart-node .node-resize-handle').boundingBox();
    await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
    await page.mouse.move(handle.x+handle.width/2+80,handle.y+handle.height/2+60,{steps:5});await page.mouse.up();
    assert.deepEqual(await page.evaluate(()=>({w:textNode.w,h:textNode.h})),{w:320,h:300});
    await page.evaluate(()=>performUndo());
    assert.deepEqual(await page.evaluate(()=>({w:nodes.find(n=>n.type==='smart-prompt').w,h:nodes.find(n=>n.type==='smart-prompt').h})),{w:240,h:240});
    await page.evaluate(()=>{smartSelection.createdNode(imageNode.id);render();});
    assert.match(await page.locator('#inputPromptPreview').innerText(),/城市雨夜/);
    await page.evaluate(async()=>saveCanvas({force:true}));
    assert.equal(record.nodes.find(n=>n.type==='smart-prompt').text,content);
    assert.equal(record.nodes.find(n=>n.type==='smart-prompt').llmEnabled,undefined);
    assert.equal(record.connections.length,1);
    await page.reload();await page.waitForFunction(()=>nodes.length===2);
    assert.equal(await page.locator('.pixmax-text-view').textContent(),content);
    assert.equal(requests.some(p=>/prompt-libraries|prompt-templates|canvas-llm/.test(p)),false);
    assert.deepEqual(errors,[]);
});

test('legacy LLM prompt remains editable plain text and readonly input cannot change its content',async t=>{
    const {page,errors,writes}=await fixture(t,'smart',true);
    await page.evaluate(()=>{
        nodes=[{id:'old',type:'smart-prompt',x:150,y:150,w:316,h:344,text:'已有文本',llmEnabled:true,llmInstruction:'旧指令',llmSystemEnabled:true}];canvas.nodes=nodes;render();
    });
    const editor=page.getByRole('textbox',{name:'节点文本'});
    assert.equal(await page.locator('.pixmax-text-view').isVisible(),true);
    await page.locator('.pixmax-text-view').dblclick();
    assert.equal(await editor.getAttribute('readonly'),null);
    await editor.fill('已有文本继续编辑');
    await page.evaluate(()=>MemberCanvasEdit.setEditable(false));
    assert.equal(await page.locator('.prompt-node-text').getAttribute('readonly'),'');
    await page.evaluate(()=>{const el=document.querySelector('.prompt-node-text');el.value='late input';el.dispatchEvent(new Event('input',{bubbles:true}));});
    assert.equal(await page.evaluate(()=>nodes[0].text),'已有文本继续编辑');
    assert.equal(await page.locator('.prompt-node-text').inputValue(),'已有文本继续编辑');
    assert.equal(writes.filter(w=>/canvas-llm/.test(w.path)).length,0);assert.deepEqual(errors,[]);
});

test('asset manager retires the prompt library tab and saved prompt-tab sessions fall back to images',async t=>{
    const {page,errors}=await fixture(t,'smart',false);
    const requests=[];page.on('request',r=>requests.push(new URL(r.url()).pathname));
    await page.evaluate(()=>sessionStorage.setItem('asset_manager_views_v1',JSON.stringify({activeTab:'prompts',tabs:{prompts:{tab:'prompts',libraryId:'system',categoryId:'all'}},views:{},libraries:{}})));
    await page.goto(origin+'/static/asset-manager.html');
    await page.waitForFunction(()=>document.getElementById('assetManagerRoot').dataset.managerView);
    assert.equal(await page.locator('[data-tab="prompts"]').count(),0);
    assert.deepEqual(await page.locator('[data-tab]').evaluateAll(buttons=>buttons.map(b=>b.dataset.tab)),['assets','workflows','canvas-assets']);
    assert.equal(await page.evaluate(()=>activeTab),'assets');
    await page.evaluate(()=>switchManagerTab('prompts'));
    assert.equal(await page.evaluate(()=>activeTab),'assets');
    await page.getByRole('button',{name:'工作流管理',exact:true}).click();
    await page.waitForFunction(()=>activeTab==='workflows' && root.dataset.managerView?.includes('workflows'));
    await page.getByRole('button',{name:'画布资产',exact:true}).click();
    await page.waitForFunction(()=>activeTab==='canvas-assets' && root.dataset.managerView?.includes('canvas-assets'));
    await page.getByRole('button',{name:'图片资产',exact:true}).click();
    await page.waitForFunction(()=>activeTab==='assets');
    assert.equal(requests.some(path=>path.includes('prompt-libraries')),false);assert.deepEqual(errors,[]);
});
