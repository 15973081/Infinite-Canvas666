const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');

test('blank canvas right-click opens a compact menu; double-click no longer opens it',async t=>{
    const {page,errors}=await fixture(t,'smart',true);
    await page.mouse.dblclick(900,600);assert.equal(await page.locator('#createMenu.open').count(),0);
    await page.mouse.click(900,600,{button:'right'});
    assert.equal(await page.locator('#createMenu.open').count(),1);
    const bounds=await page.locator('#createMenu').boundingBox();assert.ok(bounds.width<=220 && bounds.height<=150);
    assert.equal(await page.locator('#createMenu [role="menuitem"]').count(),3);
    assert.equal(await page.locator('#createMenu .create-card-sub').count(),0);
    await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.dataset.createType),'prompt');
    await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement.dataset.createType),'loop');
    await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>document.activeElement.dataset.createType),'image');
    await page.keyboard.press('Escape');assert.equal(await page.locator('#createMenu.open').count(),0);
    await page.mouse.click(1275,895,{button:'right'});
    const edge=await page.locator('#createMenu').boundingBox();assert.ok(edge.x>=12 && edge.y>=12 && edge.x+edge.width<=1268 && edge.y+edge.height<=888);
    await page.mouse.click(300,500);assert.equal(await page.locator('#createMenu.open').count(),0);
    await page.mouse.click(900,600,{button:'right'});await page.mouse.wheel(0,100);await page.waitForFunction(()=>!createMenu.classList.contains('open'));
    assert.deepEqual(errors,[]);
});

test('all menu actions create at the right-click world point, including keyboard activation',async t=>{
    const {page,errors}=await fixture(t,'smart',true);
    for(const [kind,type,offset] of [['image','smart-image',null],['prompt','smart-prompt',[158,97]],['loop','smart-loop',[135,95]]]){
        await page.evaluate(()=>{nodes=[];canvas.nodes=nodes;clearSelection();render();});
        await page.mouse.click(800,400,{button:'right'});
        const point=await page.evaluate(()=>({...createMenuPoint}));
        if(kind==='prompt'){await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');}
        else await page.locator(`[data-create-type="${kind}"]`).click();
        const result=await page.evaluate(()=>({count:nodes.length,type:nodes[0].type,x:nodes[0].x,y:nodes[0].y,rect:nodeRect(nodes[0])}));
        assert.equal(result.count,1);assert.equal(result.type,type);
        assert.equal(await page.locator('#createMenu.open').count(),0);
        if(offset){assert.equal(result.x,point.x-offset[0]);assert.equal(result.y,point.y-offset[1]);}
        else{assert.ok(Math.abs(result.x+result.rect.width/2-point.x)<=1);assert.ok(Math.abs(result.y+result.rect.height/2-point.y)<=1);}
    }
    assert.deepEqual(errors,[]);
});

test('node and controls preserve their context interactions, and readonly cannot create',async t=>{
    const {page,errors}=await fixture(t,'smart',true);
    await page.evaluate(()=>{nodes=[{id:'source',type:'smart-image',x:50,y:150,images:[{url:'/test-image.svg',kind:'image'}]}];render();});
    const native=await page.evaluate(()=>document.querySelector('.image-node').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:200,clientY:200})));
    assert.equal(native,true);assert.equal(await page.locator('#createMenu.open').count(),0);
    await page.locator('.smart-top-tools').dispatchEvent('contextmenu');assert.equal(await page.locator('#createMenu.open').count(),0);
    await page.mouse.click(900,600,{button:'right'});assert.equal(await page.locator('#createMenu.open').count(),1);
    await page.evaluate(()=>MemberCanvasEdit.setEditable(false));assert.equal(await page.locator('#createMenu.open').count(),0);
    await page.mouse.click(900,600,{button:'right'});assert.equal(await page.locator('#createMenu.open').count(),0);
    await page.evaluate(()=>createNodeFromMenu('prompt'));assert.equal(await page.evaluate(()=>nodes.length),1);assert.deepEqual(errors,[]);
});
