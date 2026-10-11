const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');

test('directory ignores a stale list response after metadata changes',async t=>{
    const {page,record,errors}=await fixture(t,'classic',false,{directory:true});
    let release,reads=0;
    const blocked=new Promise(resolve=>{release=resolve;});
    await page.route('**/api/canvases',async route=>{
        const snapshot={...record};
        if(++reads===1)await blocked;
        await route.fulfill({json:{canvases:[snapshot]}});
    });
    await page.route('**/api/canvases/canvas-test/meta',route=>{
        Object.assign(record,route.request().postDataJSON());
        return route.fulfill({json:{canvas:record}});
    });
    const first=page.waitForRequest('**/api/canvases');
    await page.evaluate(()=>{window.directoryRefresh=CanvasHome.refresh();});
    await first;
    await page.evaluate(()=>CanvasDirectoryApi.patchCanvasMeta('canvas-test',{title:'Updated during refresh'}));
    release();await page.evaluate(()=>window.directoryRefresh);
    assert.equal(reads,2);
    assert.equal(await page.locator('.canvas-card-title').innerText(),'Updated during refresh');
    assert.deepEqual(errors,[]);
});

test('directory waits for additional writes started during navigation flush',async t=>{
    const {page,errors}=await fixture(t,'classic',false,{directory:true});
    const releases={};
    await page.route('**/api/canvases/*/meta',async route=>{
        const title=route.request().postDataJSON().title;
        await new Promise(resolve=>{releases[title]=resolve;});
        await route.fulfill({json:{}});
    });
    async function start(title){
        const sent=page.waitForRequest(request=>request.url().endsWith('/meta')&&request.postDataJSON().title===title);
        await page.evaluate(title=>{void CanvasDirectoryApi.patchCanvasMeta('canvas-test',{title});},title);
        await sent;
    }
    await start('first');
    await page.evaluate(()=>{window.flushed=false;window.directoryFlush=CanvasDirectoryApi.flush().then(ok=>{window.flushed=true;return ok;});});
    await start('second');
    const completed=page.waitForResponse(response=>response.url().endsWith('/meta'));
    releases.first();await completed;
    assert.equal(await page.evaluate(()=>window.flushed),false);
    releases.second();assert.equal(await page.evaluate(()=>window.directoryFlush),true);
    assert.equal(await page.evaluate(()=>CanvasDirectoryApi.busy),false);
    assert.deepEqual(errors,[]);
});

test('open card menu survives viewport resize and rejected metadata remains visible',async t=>{
    const {page,errors}=await fixture(t,'classic',false,{directory:true});
    await page.locator('.studio-card-menu summary').click();
    await page.setViewportSize({width:1100,height:800});
    assert.equal(await page.locator('.canvas-card-edit').isVisible(),true);
    const rect=await page.locator('.studio-card-menu-items').boundingBox();
    assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=1100&&rect.y+rect.height<=800);
    await page.route('**/api/canvases/canvas-test/meta',route=>route.fulfill({status:409,json:{detail:'Locked by another editor'}}));
    await page.locator('.canvas-pin-btn').click();
    await page.waitForFunction(()=>document.querySelector('#studioHomeFeedback')?.textContent.includes('Locked by another editor'));
    assert.equal(await page.locator('.canvas-pin-btn').getAttribute('aria-label'),'置顶');
    assert.deepEqual(errors,[]);
});
