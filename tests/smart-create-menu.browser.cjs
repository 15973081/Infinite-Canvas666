const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');

test('image node supports keyboard upload and fills the original node',async t=>{
    const {page,errors}=await fixture(t,'smart',true);
    await page.evaluate(()=>{
        window.uploadTarget=createNode(400,200,[],{select:true});
        uploadFiles=async files=>[{url:'/test-image.svg',kind:'image',name:files[0].name}];
    });
    const rect=await page.locator('.empty-node').boundingBox();assert.equal(rect.width,200);assert.equal(rect.height,200);
    assert.equal(await page.locator('.node-drop').count(),0);
    const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'上传图片',exact:true}).focus();await page.keyboard.press('Enter');
    assert.equal(await page.locator('input[type="file"]').last().getAttribute('accept'),'image/*');
    await (await chooser).setFiles({name:'input.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')});
    await page.waitForFunction(()=>uploadTarget.images.length===1);
    assert.equal(await page.evaluate(()=>nodes.length),1);assert.equal(await page.evaluate(()=>uploadTarget.images[0].name),'input.png');
    assert.equal(await page.locator('.empty-node').count(),0);assert.deepEqual(errors,[]);
});

test('blank canvas double-click opens the reference node menu; right-click opens context actions',async t=>{
    const {page,errors}=await fixture(t,'smart',true);
    await page.mouse.click(900,600,{button:'right'});assert.equal(await page.locator('#createMenu.open').count(),0);
    await page.mouse.dblclick(900,600);
    assert.equal(await page.locator('#createMenu.open').count(),1);
    const bounds=await page.locator('#createMenu').boundingBox();assert.ok(bounds.width<=360 && bounds.height<=650);
    assert.equal(await page.locator('#createMenu [role="menuitem"]').count(),8);
    assert.equal(await page.locator('#createMenu [data-create-type="image"]').count(),0);
    assert.equal(await page.locator('#createMenu .create-card-sub').count(),0);
    await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.dataset.createType),'generate-image');
    await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement.dataset.createType),'storyboard');
    await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>document.activeElement.dataset.createType),'prompt');
    await page.keyboard.press('Escape');assert.equal(await page.locator('#createMenu.open').count(),0);
    await page.mouse.dblclick(1275,895);
    const edge=await page.locator('#createMenu').boundingBox();assert.ok(edge.x>=12 && edge.y>=12 && edge.x+edge.width<=1268 && edge.y+edge.height<=888);
    await page.mouse.click(300,500);assert.equal(await page.locator('#createMenu.open').count(),0);
    await page.mouse.dblclick(900,600);await page.mouse.wheel(0,100);await page.waitForFunction(()=>!createMenu.classList.contains('open'));
    assert.deepEqual(errors,[]);
});

test('all menu actions create at the double-click world point, including keyboard activation',async t=>{
    const {page,errors}=await fixture(t,'smart',true);
    for(const [kind,type,offset] of [['prompt','smart-prompt',[120,120]],['generate-image','smart-image',null],['generate-video','smart-image',null],['audio','smart-audio',[140,60]],['model','smart-model',[120,120]],['director','smart-director',[120,120]],['editor','smart-editor',[150,100]],['storyboard','smart-storyboard',[120,120]]]){
        await page.evaluate(()=>{nodes=[];canvas.nodes=nodes;clearSelection();render();});
        await page.mouse.dblclick(800,400);
        const point=await page.evaluate(()=>({...createMenuPoint}));
        if(kind==='prompt'){await page.keyboard.press('Enter');}
        else await page.locator(`[data-create-type="${kind}"]`).click();
        const result=await page.evaluate(()=>({count:nodes.length,type:nodes[0].type,kind:nodes[0].generationKind,x:nodes[0].x,y:nodes[0].y,rect:nodeRect(nodes[0])}));
        assert.equal(result.count,1);assert.equal(result.type,type);
        assert.equal(await page.locator('#createMenu.open').count(),0);
        assert.equal(result.x,point.x);assert.equal(result.y,point.y);
        if(kind.startsWith('generate-')) assert.equal(result.kind,kind.slice('generate-'.length));
    }
    assert.deepEqual(errors,[]);
});

test('node and controls preserve their context interactions, and readonly cannot create',async t=>{
    const {page,errors}=await fixture(t,'smart',true);
    await page.evaluate(()=>{nodes=[{id:'source',type:'smart-image',x:50,y:150,images:[{url:'/test-image.svg',kind:'image'}]}];render();});
    const native=await page.evaluate(()=>document.querySelector('.image-node').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:200,clientY:200})));
    assert.equal(native,false);assert.equal(await page.locator('.pixmax-context-menu button').count(),4);assert.equal(await page.locator('#createMenu.open').count(),0);
    await page.locator('.image-node').dispatchEvent('dblclick');assert.equal(await page.locator('#createMenu.open').count(),0);
    await page.locator('.pixmax-topbar').dispatchEvent('contextmenu');assert.equal(await page.locator('#createMenu.open').count(),0);
    await page.locator('.pixmax-topbar').dispatchEvent('dblclick');assert.equal(await page.locator('#createMenu.open').count(),0);
    await page.mouse.dblclick(900,600);assert.equal(await page.locator('#createMenu.open').count(),1);
    await page.evaluate(()=>MemberCanvasEdit.setEditable(false));assert.equal(await page.locator('#createMenu.open').count(),0);
    await page.mouse.dblclick(900,600);assert.equal(await page.locator('#createMenu.open').count(),0);
    await page.evaluate(()=>createNodeFromMenu('prompt'));assert.equal(await page.evaluate(()=>nodes.length),1);assert.deepEqual(errors,[]);
});
