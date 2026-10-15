const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');

async function setup(t){
    const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
    const page=await browser.newPage(),errors=[],requests=[];
    const state={expired:false,permissions:['canvas.read','canvas.edit'],available:true};
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url());requests.push(url.pathname);
        if(url.pathname.startsWith('/static/js/'))return route.fulfill({contentType:'text/javascript; charset=utf-8',body:fs.readFileSync(path.resolve('.'+url.pathname),'utf8')});
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
        return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><script src="/static/js/member-session.js"></script></head><body><textarea id="draft">unsaved local draft</textarea><script src="/static/js/canvas-edit-lease.js"></script><script src="/static/js/member-canvas-edit.js"></script></body></html>'});
    });
    await page.goto('https://member-session.test/workspaces/space_a');
    await page.evaluate(async()=>{await CanvasSession.ready;for(const name of ['first','second']){
        const frame=document.createElement('iframe');frame.name=name;frame.src='/editor?workspace=space_a';document.body.append(frame);
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
    return {page,state,errors,requests};
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
