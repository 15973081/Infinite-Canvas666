const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');

for(const kind of ['image','video'])test(kind+' generation no longer exposes camerawork or loads its library',async t=>{
    const {page,errors}=await fixture(t,'smart',true);
    const motionRequests=[];
    page.on('request',request=>{if(request.url().includes('/camera-motions'))motionRequests.push(request.url());});
    await page.evaluate(kind=>{
        apiProviders=[{id:'p',name:'测试供应商',has_key:true,enabled:true,image_models:['gpt-image-2'],video_models:['doubao-seedance-2-5-pro']}];
        createGenerationNodeAt({x:400,y:100},kind);render();
    },kind);
    await page.getByRole('textbox',{name:'生成提示词',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'运镜',exact:true}).count(),0);
    await page.getByRole('button',{name:'全屏',exact:true}).click();
    await page.getByRole('dialog',{name:'全屏',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'运镜',exact:true}).count(),0);
    assert.equal(await page.locator('[data-native-camerawork]').count(),0);
    assert.equal(await page.evaluate(()=>typeof window.PixmaxCamerawork),'undefined');
    assert.deepEqual(motionRequests,[]);assert.deepEqual(errors,[]);
});
