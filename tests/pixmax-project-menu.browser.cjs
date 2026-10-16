const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function setup(t){
    const result=await fixture(t,'smart',true,{permissions:['canvas.read','canvas.edit','canvas.delete'],secureOrigin:true});
    await result.page.waitForFunction(()=>Boolean(document.querySelector('.pixmax-project-toggle')?.onclick));
    await result.page.evaluate(()=>Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}}));
    return result;
}

test('logo opens a keyboard-accessible menu without navigating; repeated toggle, outside click and Esc close it',async t=>{
    const {page,errors,writes}=await setup(t),url=page.url();
    const trigger=page.getByRole('button',{name:'画布菜单',exact:true}),menu=page.getByRole('menu',{name:'画布菜单',exact:true});
    await trigger.hover();
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.pixmax-project-menu-icon')).opacity==='1');
    assert.equal(await page.locator('.pixmax-project-mark img').evaluate(n=>getComputedStyle(n).opacity),'0');
    for(let i=0;i<3;i++){
        await trigger.click();assert.equal(await trigger.getAttribute('aria-expanded'),'true');await menu.waitFor();
        await trigger.click();assert.equal(await menu.count(),0);assert.equal(await trigger.getAttribute('aria-expanded'),'false');
    }
    await trigger.focus();await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(()=>document.activeElement.textContent),'返回画布管理');
    await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'移入回收站');
    await page.keyboard.press('Escape');assert.equal(await trigger.evaluate(n=>n===document.activeElement),true);
    await trigger.press('Enter');await page.mouse.click(700,500);assert.equal(await menu.count(),0);
    await trigger.press('Space');assert.equal(await menu.count(),1);
    await page.keyboard.press('Tab');assert.equal(await menu.count(),0);
    for(const width of [1440,390,320]){
        await page.setViewportSize({width,height:900});await trigger.click();
        await menu.evaluate(async n=>Promise.all(n.getAnimations().map(a=>a.finished)));
        const box=await menu.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);
        await page.screenshot({path:'.local/commercial-kickoff/project-menu-'+width+'.png',clip:{x:0,y:0,width:Math.min(width,450),height:360}});
        await page.keyboard.press('Escape');
    }
    await page.emulateMedia({reducedMotion:'reduce'});await trigger.click();
    assert.equal(await menu.evaluate(n=>getComputedStyle(n).animationName),'none');
    await page.keyboard.press('Escape');await trigger.blur();await page.mouse.move(250,500);
    assert.equal(await page.locator('.pixmax-project-mark img').evaluate(n=>getComputedStyle(n).opacity),'1');
    assert.equal(page.url(),url);assert.equal(writes.filter(w=>!w.path.endsWith('/touch')).length,0);assert.deepEqual(errors,[]);
});

test('project menu uses existing rename guards and disables changes while viewing',async t=>{
    const {page,errors}=await setup(t),trigger=page.getByRole('button',{name:'画布菜单',exact:true});
    await page.evaluate(()=>MemberCanvasEdit.setEditable(false));await trigger.click();
    for(const name of ['重命名','移入回收站'])assert.equal(await page.getByRole('menuitem',{name,exact:true}).isDisabled(),true);
    await page.keyboard.press('Escape');await page.evaluate(()=>MemberCanvasEdit.setEditable(true));
    await trigger.click();await page.getByRole('menuitem',{name:'重命名',exact:true}).click();
    await page.getByRole('textbox',{name:'画布名称',exact:true}).fill('新的画布名称');
    await page.evaluate(()=>{MemberCanvasEdit.setEditable(false);MemberCanvasEdit.setEditable(true);});
    await page.getByRole('button',{name:'保存',exact:true}).click();await page.getByRole('alert').filter({hasText:'编辑资格已变化'}).waitFor();
    assert.equal(await page.locator('#smartTitle').textContent(),'Module regression');
    await page.getByRole('button',{name:'取消',exact:true}).click();
    await page.route('**/api/canvases/canvas-test/meta',route=>route.request().method()==='POST'?route.fulfill({json:{canvas:{title:route.request().postDataJSON().title,revision:2}}}):route.fallback());
    await trigger.click();await page.getByRole('menuitem',{name:'重命名',exact:true}).click();
    await page.getByRole('textbox',{name:'画布名称',exact:true}).fill('新的画布名称');await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#smartTitle').textContent==='新的画布名称');assert.deepEqual(errors,[]);
});

test('directory entry opens the sidebar; deletion after browsing trash still validates the active edit lease',async t=>{
    const {page,errors,writes}=await setup(t),trigger=page.getByRole('button',{name:'画布菜单',exact:true});
    await trigger.click();await page.getByRole('menuitem',{name:'画布目录',exact:true}).click();
    await page.locator('#pixmaxNavigator').waitFor();assert.equal(await page.locator('#pixmaxProjectMenu').count(),0);
    await page.locator('[data-directory-trash]').click();await page.getByRole('button',{name:'关闭画布目录',exact:true}).click();
    await trigger.click();await page.getByRole('menuitem',{name:'移入回收站',exact:true}).click();
    await page.getByRole('textbox',{name:'输入画布名称以确认',exact:true}).fill('Module regression');
    await page.evaluate(()=>{MemberCanvasEdit.setEditable(false);MemberCanvasEdit.setEditable(true);});
    await page.locator('.canvas-name-dialog').waitFor({state:'detached'});
    assert.equal(writes.filter(w=>w.method==='DELETE').length,0);assert.deepEqual(errors,[]);
});
