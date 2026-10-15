const test = require('node:test');
const assert = require('node:assert/strict');
const {fixture} = require('./helpers/canvas-browser.cjs');

async function panel(t, member=false){
    const f = await fixture(t, 'smart', member);
    await f.page.waitForLoadState('networkidle');
    await f.page.evaluate(()=>toggleAssetLibrary(true));
    await f.page.locator('#assetPanel').waitFor({state:'visible'});
    await f.page.locator('#assetPanel').evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished)));
    return f;
}
async function drag(page, distance){
    await page.locator('#assetResizeHandle').hover();
    const box = await page.locator('#assetResizeHandle').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - distance, box.y + box.height / 2, {steps:5});
    await page.mouse.up();
}
async function width(page){return page.locator('#assetPanel').evaluate(el=>parseFloat(getComputedStyle(el).width));}

test('Smart sidebar drag expands the grid, persists across reload and resets without canvas writes', async t=>{
    const {page, errors, writes} = await panel(t);
    const initial = await width(page);
    const beforeWrites = writes.length;
    const viewport = await page.evaluate(()=>JSON.stringify(canvas.viewport));
    await page.waitForLoadState('networkidle');
    await page.evaluate(()=>setAssetLibraryFromResponse({library:{libraries:[{id:'one',name:'资产库',categories:[{
        id:'images',name:'角色',type:'image',items:Array.from({length:12},(_,i)=>({id:'a'+i,name:'素材 '+i,url:'/test-image.svg'}))
    }]}],active_library_id:'one'}}));
    assert.equal(await page.locator('#assetGrid .asset-item').count(),12);
    await drag(page, 240);
    assert.ok(Math.abs(await width(page) - initial - 240) <= 2);
    assert.ok(await page.locator('#assetGrid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length) >= 3);
    assert.equal(await page.locator('#assetGrid .asset-item').count(),12, 'resize retains material cards');
    const saved = await width(page);
    await page.reload();
    await page.waitForFunction(()=>typeof canvas!=='undefined' && canvas?.id==='canvas-test');
    await page.evaluate(()=>toggleAssetLibrary(true));
    assert.equal(await width(page), saved);
    const handle = page.locator('#assetResizeHandle');
    await handle.focus();
    await page.keyboard.press('Shift+ArrowLeft');
    assert.equal(await width(page), saved + 64);
    await handle.dblclick();
    assert.equal(await width(page), 300);
    assert.equal(await page.evaluate(()=>JSON.stringify(canvas.viewport)), viewport);
    assert.equal(writes.length, beforeWrites);
    assert.deepEqual(errors, []);
});

test('Smart sidebar ignores retired UI zoom and keeps the desktop preference', async t=>{
    const {page, errors} = await panel(t);
    await page.evaluate(()=>{document.documentElement.removeAttribute('data-studio-scale');StudioScale.set('115');});
    const before = await width(page);
    await drag(page, 230);
    assert.ok(Math.abs(await width(page) - before - 230) <= 2);
    const preferred = await width(page);
    await page.setViewportSize({width:390,height:900});
    await page.evaluate(()=>StudioScale.set('140'));
    await page.waitForFunction(()=>{const rect=document.querySelector('#assetPanel').getBoundingClientRect();return rect.x>=0 && rect.right<=innerWidth;}, null, {timeout:2000});
    const bounds = await page.locator('#assetPanel').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    assert.equal(await page.evaluate(()=>smartAssetPanel.state.width), preferred);
    await page.setViewportSize({width:1280,height:900});
    await page.evaluate(()=>StudioScale.set('100'));
    assert.equal(await width(page), preferred);
    assert.deepEqual(errors, []);
});

test('Resize works in read-only mode and listeners end on close, cancellation and destruction', async t=>{
    const {page, errors, writes} = await panel(t, true);
    await page.evaluate(()=>{MemberCanvasEdit.setEditable(false);bindSmartAssetPanelEvents();bindSmartAssetPanelEvents();});
    const beforeWrites = writes.length;
    await drag(page, 100);
    assert.equal(await width(page), 400);
    await page.locator('#assetResizeHandle').focus();
    await page.keyboard.press('ArrowLeft');
    assert.equal(await width(page), 424, 'rebind does not duplicate keyboard listeners');
    for(const action of ['close','cancel','pagehide','destroy']){
        const handle = page.locator('#assetResizeHandle');
        await handle.dispatchEvent('pointerdown',{button:0,isPrimary:true,pointerId:7,clientX:500});
        assert.equal(await page.evaluate(()=>Boolean(smartAssetPanel.state.resize)),true);
        await page.evaluate(action=>{
            if(action==='close'){toggleAssetLibrary(false);toggleAssetLibrary(true);}
            if(action==='cancel')window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:7}));
            if(action==='pagehide')window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
            if(action==='destroy')smartAssetPanel.destroy();
        },action);
        assert.equal(await page.evaluate(()=>smartAssetPanel.state.resize),null);
        assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('smart-asset-panel-resizing')),false);
    }
    assert.equal(writes.length,beforeWrites);
    assert.deepEqual(errors,[]);
});
