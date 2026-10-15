const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');

async function setup(t,permissions=['canvas.read','canvas.edit']){
    const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
    const context=await browser.newContext(),page=await context.newPage(),errors=[],requests=[];
    const state={expired:false,permissions,available:true};
    page.on('pageerror',error=>errors.push(error.message));
    await context.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url());requests.push(url.pathname);
        if(url.pathname.startsWith('/static/js/'))return route.fulfill({contentType:'text/javascript; charset=utf-8',body:fs.readFileSync(path.resolve('.'+url.pathname),'utf8')});
        if(url.pathname.startsWith('/static/css/'))return route.fulfill({contentType:'text/css; charset=utf-8',body:fs.readFileSync(path.resolve('.'+url.pathname),'utf8')});
        if(url.pathname.startsWith('/api/')){
            if(state.expired)return route.fulfill({status:401,json:{detail:{code:'authentication_required'}}});
            let data={};
            const member={id:'alice',display_name:'Alice'},workspace={id:'space_a',name:'A',permissions:state.permissions};
            if(url.pathname==='/api/auth/status')data={authenticated:true,mode:'members',member};
            if(url.pathname==='/api/auth/workspaces')data={workspaces:state.available?[workspace]:[]};
            const canvasId=url.pathname.split('/')[3];
            if(url.pathname.endsWith('/transfers'))data={lease:{canvas_id:canvasId,generation:1,revision:1,holder:null},requests:[]};
            if(url.pathname.endsWith('/acquire'))data={canvas_id:canvasId,generation:1,revision:1,edit_token:'private-'+canvasId,
                holder:{id:'alice',is_self:true},server_time:new Date().toISOString(),expires_at:new Date(Date.now()+60000).toISOString()};
            return route.fulfill({json:data});
        }
        return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html><head><link rel="stylesheet" href="/static/css/member-session.css"><link rel="stylesheet" href="/static/css/member-canvas-edit.css"><script src="/static/js/member-session.js"></script></head><body><textarea id="draft">unsaved local draft</textarea><script src="/static/js/canvas-edit-lease.js"></script><script src="/static/js/member-canvas-edit.js"></script></body></html>'});
    });
    await page.goto('https://member-session.test/workspaces/space_a');
    await page.evaluate(async()=>{await CanvasSession.ready;for(const name of ['first','second']){
        const frame=document.createElement('iframe');frame.name=name;frame.src='/editor?workspace=space_a&id='+name;document.body.append(frame);
    }});
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('iframe')).every(frame=>frame.contentWindow.CanvasSession?.context));
    for(const frame of page.frames().filter(frame=>frame.parentFrame())){
        await frame.evaluate(async()=>{
            await CanvasSession.ready;
            await MemberCanvasEdit.mount({id:window.name,dirty:()=>true,flush:async()=>false,
                snapshot:()=>({id:window.name,kind:'smart',revision:1,title:document.querySelector('#draft').value,nodes:[]}),reload:async()=>({revision:1})});
            await MemberCanvasEdit.active.lease.start(async()=>({revision:1}));
        });
    }
    return {page,context,state,errors,requests};
}

for(const origin of ['parent','child'])test(`401 in ${origin} stops both real embedded editors and preserves drafts`,async t=>{
    const {page,state,errors,requests}=await setup(t);
    state.expired=true;
    await (origin==='parent'?page:page.frame({name:'first'})).evaluate(()=>fetch('/api/account/billing'));
    for(const frame of page.frames()){
        assert.equal(await frame.evaluate(()=>CanvasSession.paused),true);
        assert.equal(await frame.locator('#draft').inputValue(),'unsaved local draft');
        assert.equal(await frame.locator('.member-session-banner').count(),1);
        if(frame.parentFrame())assert.deepEqual(await frame.evaluate(()=>({edit:MemberCanvasEdit.canEdit,token:MemberCanvasEdit.active.lease.token})),{edit:false,token:null});
    }
    const before=requests.length;
    assert.match(await page.frame({name:'second'}).evaluate(()=>fetch('/api/canvases').catch(error=>error.message)),/暂停/);
    assert.equal(requests.length,before);
    for(const frame of page.frames().filter(frame=>frame.parentFrame())){
        await frame.waitForFunction(async()=>{
            const db=await new Promise(resolve=>{const request=indexedDB.open('canvas-member-drafts');request.onsuccess=()=>resolve(request.result);});
            try{return await new Promise(resolve=>{const request=db.transaction('drafts').objectStore('drafts').getAll();request.onsuccess=()=>resolve(request.result.some(row=>JSON.stringify(row).includes('unsaved local draft')));});}
            finally{db.close();}
        });
    }
    assert.deepEqual(errors,[]);
});

for(const trigger of ['focus','visibility','menu'])test(`${trigger} detects changed space grants and stops embedded editors`,async t=>{
    const {page,state,errors}=await setup(t);
    if(trigger==='focus')state.permissions=['canvas.read'];
    else state.available=false;
    if(trigger==='menu')await page.getByLabel('切换工作空间',{exact:true}).click();
    else await page.evaluate(trigger=>{
        if(trigger==='focus')window.dispatchEvent(new Event('focus'));
        else document.dispatchEvent(new Event('visibilitychange'));
    },trigger);
    await page.waitForFunction(()=>CanvasSession.paused);
    for(const frame of page.frames().filter(frame=>frame.parentFrame())){
        assert.equal(await frame.evaluate(()=>MemberCanvasEdit.canEdit),false);
        assert.equal(await frame.locator('#draft').inputValue(),'unsaved local draft');
    }
    assert.deepEqual(await page.evaluate(()=>Array.from(CanvasSession.context.workspace.permissions)),['canvas.read','canvas.edit']);
    if(!state.available){
        await page.getByRole('button',{name:'重新检查登录',exact:true}).click();
        await page.getByText('当前空间仍不可用，请先保留草稿，再返回工作台选择可用空间。',{exact:true}).waitFor();
        assert.equal(await page.getByRole('button',{name:'重新打开',exact:true}).count(),0);
        assert.equal(await page.getByRole('link',{name:'在新标签页恢复草稿',exact:true}).count(),0);
    }
    assert.deepEqual(errors,[]);
});

for(const action of ['login','logout'])test(`another tab's successful ${action} pauses existing editors without focusing them`,async t=>{
    const {page,context,errors}=await setup(t);
    const other=await context.newPage();
    if(action==='login'){
        await other.route('**/api/auth/status',route=>route.fulfill({json:{authenticated:false,mode:'members'}}));
        await other.route('**/api/auth/login',route=>route.fulfill({json:{member:{id:'alice'}}}));
        await other.route('https://member-session.test/',route=>route.fulfill({contentType:'text/html',body:'signed in'}));
        await other.route('https://member-session.test/login',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:fs.readFileSync('static/login.html','utf8').replace(/<script type="module"[^>]*><\/script>/g,'')}));
        await other.goto('https://member-session.test/login');
        await other.locator('#username').fill('alice');await other.locator('#password').fill('test-only-password');
        await other.locator('#submit-button').click();
    }else{
        await other.goto('https://member-session.test/workspaces/space_a');
        await other.evaluate(async()=>{await CanvasSession.ready;document.querySelector('.member-session-account').open=true;});
        // Keep the new tab on a blank login page after the successful logout.
        await other.route('**/login',route=>route.fulfill({contentType:'text/html',body:'signed out'}));
        await other.getByRole('button',{name:'退出登录',exact:true}).click();
    }
    await page.waitForFunction(()=>CanvasSession.paused);
    for(const frame of page.frames().filter(frame=>frame.parentFrame())){
        assert.equal(await frame.evaluate(()=>MemberCanvasEdit.canEdit),false);
        assert.equal(await frame.locator('#draft').inputValue(),'unsaved local draft');
    }
    assert.equal(await page.evaluate(()=>CanvasSession.context.member.id),'alice');
    assert.deepEqual(errors,[]);
});

test('confirmed login can open a fresh tab and copy the old draft while the paused page stays intact',async t=>{
    const {page,context}=await setup(t,['canvas.read','canvas.edit','canvas.create','asset.read']);
    await page.setViewportSize({width:1280,height:1000});
    await page.locator('iframe[name="first"]').evaluate(frame=>{frame.style.cssText='display:block;width:1000px;height:700px;margin-top:60px';});
    const source=page.frame({name:'first'}),copies=[];
    await context.route('**/api/canvas-draft-copies',route=>{
        copies.push(route.request().postDataJSON());
        return route.fulfill({json:{canvas:{id:'copy-first',kind:'smart',revision:1,title:'Recovered copy'}}});
    });
    await page.evaluate(()=>CanvasSession.pause('其他标签页更新了登录状态'));
    await source.getByRole('button',{name:'重新检查登录',exact:true}).click();
    const recovery=source.getByRole('link',{name:'在新标签页恢复草稿',exact:true});
    await recovery.waitFor({timeout:1500});
    const opened=context.waitForEvent('page');await recovery.click();const fresh=await opened;
    await fresh.waitForLoadState();
    await fresh.evaluate(async()=>{
        await CanvasSession.ready;
        await MemberCanvasEdit.mount({id:new URL(location.href).searchParams.get('id'),dirty:()=>false,flush:async()=>true,
            snapshot:()=>({id:'first',kind:'smart',revision:1,nodes:[]}),reload:async()=>({revision:1})});
    });
    await fresh.locator('.member-canvas-more > summary').click();await fresh.getByRole('button',{name:'自动草稿',exact:true}).click();
    await fresh.getByRole('button',{name:'另存副本',exact:true}).click();await fresh.getByRole('button',{name:'确认另存副本',exact:true}).click();
    await fresh.getByText('已创建副本：Recovered copy',{exact:true}).waitFor();
    assert.equal(copies.length,1);assert.equal(copies[0].document.title,'unsaved local draft');
    assert.equal(await source.locator('#draft').inputValue(),'unsaved local draft');
    assert.equal(await source.evaluate(()=>CanvasSession.paused),true);
    assert.equal(await fresh.evaluate(()=>MemberCanvasEdit.canEdit),false);
    assert.equal(await fresh.evaluate(()=>window.opener),null);
});
