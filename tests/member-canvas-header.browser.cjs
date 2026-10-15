const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');

async function setup(t){
    const f=await fixture(t,'smart',true);
    const member={id:'member-1',display_name:'本地管理员',avatar:''},workspace={id:'workspace-1',name:'共享工作区',permissions:['canvas.read','canvas.edit']};
    await f.page.route('**/api/auth/status',route=>route.fulfill({json:{authenticated:true,mode:'members',member}}));
    await f.page.route('**/api/auth/workspaces',route=>route.fulfill({json:{workspaces:[workspace]}}));
    await f.page.route('**/api/workspace/storage',route=>route.fulfill({json:{workspace_id:workspace.id,bytes:93532979,files:12,by_kind:{video:{bytes:93532979,files:12}},updated_at:'2026-10-15T00:00:00Z'}}));
    await f.page.route('**/api/auth/profile',route=>{
        Object.assign(member,route.request().postDataJSON());return route.fulfill({json:{member}});
    });
    const canvasPage=route=>{
        const html=fs.readFileSync(path.resolve('static/smart-canvas.html'),'utf8').replace('<head>','<head><link rel="stylesheet" href="/static/css/member-session.css"><script src="/static/js/member-session.js"></script>').replace('</head>','<script src="/static/js/canvas-edit-lease.js"></script><script src="/static/js/canvas-directory-writes.js"></script><script src="/static/js/canvas-task-results.js"></script></head>');
        return route.fulfill({contentType:'text/html',body:html});
    };
    await f.page.route('**/static/smart-canvas.html**',canvasPage);
    await f.page.route('**/workspaces/*/canvases/*',canvasPage);
    await f.page.reload();
    await f.page.locator('.pixmax-topbar .member-session-canvas-controls').waitFor({timeout:2500}).catch(async error=>{throw Error(error.message+'; '+JSON.stringify(f.errors)+'; '+JSON.stringify(await f.page.evaluate(()=>({url:location.pathname,classes:document.documentElement.className,notices:document.querySelector('.member-session-panel')?.textContent,bar:document.querySelector('.member-session-bar')?.outerHTML.slice(0,800)}))));});
    await f.page.getByRole('button',{name:'关闭画布目录',exact:true}).click();
    return f;
}

test('smart canvas keeps its full height and places workspace settings inside its account menu',async t=>{
    const {page,errors}=await setup(t);
    assert.equal(await page.locator('body > .member-session-bar').count(),0);
    assert.equal(await page.locator('.member-session-brand').count(),0);
    assert.deepEqual(await page.locator('#shell').evaluate(el=>({top:el.getBoundingClientRect().top,height:el.getBoundingClientRect().height,viewport:innerHeight})),{top:0,height:900,viewport:900});
    const account=page.locator('.member-session-account'),summary=account.locator(':scope > summary');
    assert.equal(await summary.getAttribute('aria-label'),'账号：本地管理员');
    assert.equal(await page.locator('.member-session-space').isVisible(),false);
    await page.screenshot({path:'.local/pixmax-canvas-header.png',clip:{x:0,y:0,width:1280,height:120}});
    await summary.click();await page.getByLabel('切换工作空间',{exact:true}).click();
    await page.getByRole('button',{name:'刷新用量',exact:true}).waitFor();
    assert.notEqual(await account.getAttribute('open'),null,'expanding a nested workspace menu keeps the account menu open');
    await page.waitForFunction(()=>document.querySelector('.member-storage-total')?.textContent==='89.2 MB');
    await page.getByLabel('切换工作空间',{exact:true}).press('Escape');
    assert.equal(await page.locator('.member-session-spaces').getAttribute('open'),null);
    assert.notEqual(await account.getAttribute('open'),null);
    await page.getByLabel('切换工作空间',{exact:true}).press('Escape');
    assert.equal(await account.getAttribute('open'),null);
    for(const width of [320,390,768,1440]){
        await page.setViewportSize({width,height:844});await summary.click();await page.getByLabel('切换工作空间',{exact:true}).click();
        const box=await page.locator('.member-session-account-menu').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight,parents:[el.parentElement,el.parentElement.parentElement,el.closest('.pixmax-topbar')].map(p=>({class:p.className,x:p.getBoundingClientRect().x,width:p.getBoundingClientRect().width,display:getComputedStyle(p).display,right:getComputedStyle(p).right}))};});
        assert.ok(box.left>=0&&box.right<=box.width&&box.bottom<=box.height,JSON.stringify(box));
        await page.mouse.click(width-1,500);assert.equal(await account.getAttribute('open'),null);
    }
    assert.deepEqual(errors,[]);
});

test('profile updates recreate one compact account control and preserve existing account actions',async t=>{
    const {page,errors}=await setup(t);
    await page.locator('.member-session-account > summary').click();
    for(const name of ['我的费用','个人数据','成员资料','退出登录'])assert.equal(await page.getByRole('button',{name,exact:true}).isVisible(),true);
    await page.getByRole('button',{name:'成员资料',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'成员资料',exact:true});await dialog.getByLabel('昵称',{exact:true}).fill('新昵称');
    await dialog.getByRole('button',{name:'保存资料',exact:true}).click();await dialog.waitFor({state:'detached'});
    assert.equal(await page.locator('.member-session-canvas-controls').count(),1);
    await page.getByLabel('账号：新昵称',{exact:true}).click();await page.getByLabel('切换工作空间',{exact:true}).click();
    assert.notEqual(await page.locator('.member-session-account').getAttribute('open'),null);
    assert.equal(await page.locator('body > .member-session-bar').count(),0);assert.deepEqual(errors,[]);
});

test('expired account request shows one recovery banner and protects unsaved edits',async t=>{
    const {page,errors}=await setup(t);
    await page.route('**/api/account/billing',route=>route.fulfill({status:401,json:{detail:{code:'authentication_required'}}}));
    await page.evaluate(async()=>{await fetch('/api/account/billing');await fetch('/api/account/billing');});
    assert.equal(await page.locator('.member-session-banner').count(),1);
    assert.equal(await page.evaluate(()=>CanvasSession.paused),true);
    await page.getByRole('button',{name:'重新检查登录',exact:true}).click();
    await page.evaluate(()=>{window.FrontendVersion={flushPages:async()=>false};});
    await page.getByRole('button',{name:'重新打开',exact:true}).click();
    await page.getByText('当前更改尚未保存，请先在自动草稿中保留或另存副本，再重新打开。',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>CanvasSession.paused),true);
    assert.deepEqual(errors,[]);
});
