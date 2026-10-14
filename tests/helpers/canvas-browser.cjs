const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../..');
const origin = 'http://canvas-modules.test';
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="#83966c"/></svg>';

async function fixture(t, kind, member, options={}) {
    const sourceRoot=path.resolve(options.sourceRoot || root);
    const browser = await chromium.launch({channel:'chrome', headless:true,args:options.secureOrigin?['--unsafely-treat-insecure-origin-as-secure='+origin]:[]});
    t.after(() => browser.close());
    const page = await browser.newPage({viewport:{width:1280, height:900}});
    page.setDefaultTimeout(15000);
    const errors = [], writes = [], loaded = [], requests=[];
    page.on('pageerror', error => errors.push(error.message));
    const record = {id:'canvas-test', kind, title:'Module regression', revision:1, updated_at:1,
        nodes:[], connections:[], logs:[], settings:{}, viewport:{x:0,y:0,scale:1},...options.record};
    await page.addInitScript(({member,navigatorOpen,permissions}) => {
        // Other editor tests keep their canvas unobscured. Sidebar tests opt in
        // to the production default; saved preferences survive fixture reloads.
        const navigatorKey=member?'member-1:workspace-1:pixmax_navigator_v1':'pixmax_navigator_v1';
        if(localStorage.getItem(navigatorKey)===null)localStorage.setItem(navigatorKey,JSON.stringify({opened:navigatorOpen}));
        window.WebSocket = class extends EventTarget { constructor(){super();this.readyState=1;setTimeout(()=>this.onopen?.(),0);} close(){this.readyState=3;} };
        // Non-member fixtures isolate legacy business adapters, not retired lock UI.
        // Production access fails closed without MemberCanvasEdit.
        if (!member){window.MemberCanvasEdit={canEdit:true,canRefresh:true,markDirty(){},send:(url,init,transport=fetch)=>transport(url,init),leave:async()=>true};return;}
        // Exercise the production canvas and task guard against a changing lease.
        // The membership service itself has separate HTTP/lease regression tests.
        window.CanvasSession = {enabled:true, ready:Promise.resolve(), paused:false,observeStatus(){},
            context:{member:{id:'member-1',display_name:'Test member'},workspace:{id:'workspace-1',permissions}},
            socketUrl:url=>url,url:value=>{const url=new URL(value,location.origin);url.searchParams.set('workspace','workspace-1');return url.href;},storageKey:key=>'member-1:workspace-1:'+key};
        window.MemberCanvasEdit = {
            active:null, get canEdit(){return Boolean(this.active?.lease.canEdit);}, canRefresh:true,
            send:(url,init,transport=fetch)=>transport(url,init), markDirty(){},
            async mount(options){
                this.active={id:options.id,memberId:'member-1',workspaceId:'workspace-1',
                    lease:{canEdit:true,epoch:1,generation:1,refresh:async()=>{}}};
                this.options=options;
                options.changed(this.active.lease);
            },
            leave:async()=>true,
            prepareReload:async()=>true,
            setEditable(value){
                this.active.lease.canEdit=value;
                this.active.lease.epoch++;
                this.options.changed(this.active.lease);
            }
        };
    }, {member,navigatorOpen:options.navigatorOpen===true,permissions:options.permissions||['canvas.read','canvas.create','canvas.edit']});
    await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        requests.push(url.pathname);
        if(url.origin !== origin) return route.abort();
        if(url.pathname.startsWith('/api/')) {
            const method=request.method();
            if(!['GET','HEAD'].includes(method)) writes.push({path:url.pathname,method,body:request.headers()['content-type']?.includes('application/json')?request.postDataJSON():null});
            let result={};
            if(url.pathname==='/api/config') result={api_providers:[],image_models:['gpt-image-2'],chat_models:['gpt-4o-mini'],video_models:[]};
            else if(url.pathname==='/api/canvases') result={canvases:[record,...(options.extraRecords||[])]};
            else if(url.pathname==='/api/canvases/trash') result={canvases:options.trashRecords||[]};
            else if(url.pathname==='/api/canvas-folders') result={folders:options.folders||[]};
            else if(url.pathname==='/api/canvases/canvas-test') {
                if(method==='PUT'){Object.assign(record,request.postDataJSON());record.updated_at++;record.revision++;}
                result={canvas:record};
            } else if(url.pathname.endsWith('/touch')) result={canvas:record};
            else if(url.pathname.endsWith('/meta')) result={updated_at:record.updated_at,revision:record.revision};
            else if(url.pathname==='/api/asset-library') result={categories:[],libraries:[]};
            else if(url.pathname==='/api/local-assets') result={items:[],tree:null};
            else if(url.pathname==='/api/prompt-libraries') result={libraries:[]};
            else if(url.pathname.includes('presence')) result={missing:[]};
            return route.fulfill({json:result});
        }
        if(url.pathname==='/test-image.svg') return route.fulfill({contentType:'image/svg+xml',body:svg});
        const canonical=url.pathname.match(/^\/workspaces\/[^/]+(?:\/canvases\/([^/]+))?$/);
        const pagePath=canonical ? '/static/'+(canonical[1] ? record.kind==='smart'?'smart-canvas.html':'canvas.html' : 'index.html') : url.pathname;
        const filename=path.resolve(sourceRoot,'.'+decodeURIComponent(pagePath));
        if(!filename.startsWith(sourceRoot+path.sep)||!fs.existsSync(filename)||!fs.statSync(filename).isFile())return route.fulfill({status:404,body:'Not found'});
        if(url.pathname.includes('/canvas/')&&filename.endsWith('.js'))loaded.push(url.pathname);
        if(filename.endsWith('.html')){
            let body=fs.readFileSync(filename,'utf8');
            if(member&&body.includes('content="directory"'))body=body.replace('</head>','<script src="/static/js/canvas-edit-lease.js"></script><script src="/static/js/canvas-directory-writes.js"></script></head>');
            if(member&&!body.includes('content="directory"')&&!body.includes('content="workbench"'))body=body.replace('</head>','<script src="/static/js/canvas-edit-lease.js"></script><script src="/static/js/canvas-directory-writes.js"></script><script src="/static/js/canvas-task-results.js"></script></head>');
            return route.fulfill({contentType:'text/html',body});
        }
        return route.fulfill({path:filename});
    });
    await page.goto(origin+(options.startPath || (options.directory?'/static/canvas-home.html':'/static/'+(kind==='classic'?'canvas.html':'smart-canvas.html')+'?id=canvas-test')));
    if(options.directory){
        await page.waitForFunction(()=>window.CanvasHome?.ready);
        await page.evaluate(()=>CanvasHome.ready);
        return {page,errors,writes,record,requests};
    }
    if(options.home){
        await page.frameLocator('#frame-canvas').locator('.canvas-open').first().waitFor().catch(async error=>{
            throw new Error(error.message+'; page errors: '+errors.join('; ')+'; frames: '+page.frames().map(f=>f.url()).join(', '));
        });
        return {page,errors,writes,record};
    }
    if(kind==='classic') {
        await page.waitForFunction(()=>typeof openCanvas==='function'&&typeof apiProviders!=='undefined');
    }
    await page.waitForFunction(()=>typeof canvas!=='undefined'&&canvas?.id==='canvas-test');
    if(member)await page.waitForFunction(()=>Boolean(window.MemberCanvasEdit?.active));
    assert.equal(new Set(loaded).size,7,'all seven task files load once');
    assert.equal(loaded.length,7);
    assert.deepEqual(errors,[],'page boots without declaration/order errors');
    return {page,errors,writes,record};
}

module.exports = {fixture,origin};
