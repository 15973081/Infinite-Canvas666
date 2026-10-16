const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture,origin}=require('./helpers/canvas-browser.cjs');
async function returnHome(page,kind='smart'){
    await page.locator(kind==='smart'?'.smart-nav-back':'#backToManagerBtn').click();
    if(kind==='smart')await page.getByRole('menuitem',{name:'返回画布管理',exact:true}).click();
}

test('legacy classic directory link redirects to standalone home and preserves create intent',async t=>{
    const {page,errors}=await fixture(t,'classic',true,{home:true,startPath:'/static/canvas.html?create=classic'});
    await page.waitForURL('**/workspaces/workspace-1');
    const home=page.frameLocator('#frame-canvas');
    await home.locator('#canvasNameField').waitFor();
    assert.equal(await home.getByRole('radio',{name:/经典画布/}).isChecked(),true);
    assert.equal(await home.locator('#canvas').count(),0);
    await home.getByRole('button',{name:'取消',exact:true}).click();
    assert.deepEqual(errors,[]);
});

for(const kind of ['classic','smart']){
    test(`${kind}: home card opens a standalone canonical document, reload and return preserve identity`,async t=>{
        const {page,errors}=await fixture(t,kind,true,{home:true,startPath:'/workspaces/workspace-1'});
        const home=page.frameLocator('#frame-canvas');
        const link=home.locator('.canvas-open').first();
        assert.equal(await link.getAttribute('href'),'/workspaces/workspace-1/canvases/canvas-test');
        assert.equal(await link.getAttribute('target'),'_top');
        await home.locator('#gateSearchInput').fill('Module');
        await page.evaluate(()=>localStorage.setItem('studio_active_page','gpt-chat'));
        await link.click();
        await page.waitForURL('**/workspaces/workspace-1/canvases/canvas-test');
        await page.waitForFunction(()=>typeof canvas!=='undefined'&&canvas?.id==='canvas-test');
        assert.equal(await page.locator('iframe').count(),0);
        assert.equal(await page.locator('.canvas-link-copy').count(),1);
        assert.equal(await page.locator(kind==='smart'?'.smart-nav':'#currentCanvasTitle').isVisible(),true);
        await page.reload();
        await page.waitForFunction(()=>typeof canvas!=='undefined'&&canvas?.id==='canvas-test');
        assert.equal(await page.evaluate(()=>canvas.kind),kind);
        await returnHome(page,kind);
        await page.waitForURL('**/workspaces/workspace-1');
        await home.locator('.canvas-open').first().waitFor();
        assert.equal(await home.locator('#gateSearchInput').inputValue(),'Module');
        assert.deepEqual(errors,[]);
    });

    test(`${kind}: failed save blocks leaving, successful save reaches home with latest document`,async t=>{
        const {page,record,errors}=await fixture(t,kind,true,{startPath:'/workspaces/workspace-1/canvases/canvas-test'});
        await page.evaluate(kind=>{
            MemberCanvasEdit.canSave=true;
            MemberCanvasEdit.leave=async()=>{window.leaveCalls=(window.leaveCalls||0)+1;return await MemberCanvasEdit.options.flush();};
            canvas.title='Saved before leaving';
            if(kind==='smart')smartCanvasDirty=true;else localCanvasDirty=true;
        },kind);
        let fail=true;
        await page.route('**/api/canvases/canvas-test',route=>route.request().method()==='PUT'&&fail?route.fulfill({status:503,json:{detail:'save unavailable'}}):route.fallback());
        await returnHome(page,kind);await page.waitForFunction(()=>leaveCalls===1);
        assert.equal(new URL(page.url()).pathname,'/workspaces/workspace-1/canvases/canvas-test');
        fail=false;await returnHome(page,kind);
        await page.waitForURL('**/workspaces/workspace-1');
        assert.equal(record.title,'Saved before leaving');
        assert.deepEqual(errors,[]);
    });
}

test('local depth leave cancellation keeps document and lease; explicit exit permits saved navigation',async t=>{
    const {page}=await fixture(t,'smart',true,{startPath:'/workspaces/workspace-1/canvases/canvas-test'});
    await page.evaluate(()=>{
        LocalDepthVideo.hasUnfinishedWork=()=>true;
        MemberCanvasEdit.leave=async()=>{window.leaveCalled=true;return true;};
    });
    page.once('dialog',dialog=>dialog.dismiss());
    await returnHome(page);
    assert.equal(await page.evaluate(()=>Boolean(window.leaveCalled)),false);
    assert.equal(new URL(page.url()).pathname,'/workspaces/workspace-1/canvases/canvas-test');
    page.once('dialog',dialog=>dialog.accept());
    await returnHome(page);
    await page.waitForURL('**/workspaces/workspace-1');
});

test('legacy smart link adopts canonical URL and missing API document offers retry and home',async t=>{
    const {page}=await fixture(t,'smart',true);
    assert.equal(page.url(),origin+'/workspaces/workspace-1/canvases/canvas-test');
    await page.route('**/api/canvases/canvas-test',route=>route.fulfill({status:404,json:{detail:'not found'}}));
    await page.reload();
    await page.locator('.canvas-route-error').waitFor();
    assert.equal(await page.locator('.canvas-route-error a').getAttribute('href'),'/workspaces/workspace-1');
});

test('home restores folder, sort and scroll after returning from a document',async t=>{
    const extraRecords=Array.from({length:24},(_,i)=>({id:'extra-'+i,kind:'classic',title:'Module '+String(i).padStart(2,'0'),folder_id:'folder-1',updated_at:i+2}));
    const {page,errors}=await fixture(t,'classic',true,{home:true,startPath:'/workspaces/workspace-1',
        record:{folder_id:'folder-1'},folders:[{id:'folder-1',name:'Projects',parent_id:''}],extraRecords});
    let home=page.frames().find(frame=>frame.url().includes('/static/canvas-home.html'));
    await home.locator('#studioFolderTrigger').click();
    await home.locator('[data-folder-id="folder-1"] .gate-folder-main').click();
    await home.locator('#studioSortTrigger').click();
    await home.locator('[data-sort="name"]').click();
    await home.locator('#canvasGate').evaluate(el=>el.scrollTop=350);
    const scroll=await home.locator('#canvasGate').evaluate(el=>el.scrollTop);
    assert.ok(scroll>0);
    // Native keyboard opening keeps the card a usable link; programmatic click
    // avoids Playwright scrolling the card and changing the state under test.
    await home.locator('.canvas-open[href$="/canvas-test"]').evaluate(el=>el.click());
    await page.waitForURL('**/canvases/canvas-test');
    await page.locator('#backToManagerBtn').click();
    await page.waitForURL('**/workspaces/workspace-1');
    home=page.frames().find(frame=>frame.url().includes('/static/canvas-home.html'));
    await home.waitForFunction(expected=>document.querySelector('[data-folder-id="folder-1"]').classList.contains('active')&&document.querySelector('[data-sort="name"]').classList.contains('active')&&document.getElementById('canvasGate').scrollTop===expected,scroll);
    assert.deepEqual(errors,[]);
});
