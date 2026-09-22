const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..');
const origin = 'http://canvas-modules.test';
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="#83966c"/></svg>';

async function fixture(t, kind, member) {
    const browser = await chromium.launch({channel:'chrome', headless:true});
    t.after(() => browser.close());
    const page = await browser.newPage({viewport:{width:1280, height:900}});
    const errors = [], writes = [], loaded = [];
    page.on('pageerror', error => errors.push(error.message));
    const record = {id:'canvas-test', kind, title:'Module regression', revision:1, updated_at:1,
        nodes:[], connections:[], logs:[], settings:{}, viewport:{x:0,y:0,scale:1}};
    await page.addInitScript(({member}) => {
        window.WebSocket = class extends EventTarget { close() {} };
        if (!member) return;
        // Exercise the production canvas and task guard against a changing lease.
        // The membership service itself has separate HTTP/lease regression tests.
        window.CanvasSession = {enabled:true, ready:Promise.resolve(), paused:false,
            context:{member:{id:'member-1',display_name:'Test member'},workspace:{id:'workspace-1'}},
            socketUrl:url=>url};
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
    }, {member});
    await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if(url.origin !== origin) return route.abort();
        if(url.pathname.startsWith('/api/')) {
            const method=request.method();
            if(!['GET','HEAD'].includes(method)) writes.push({path:url.pathname,method,body:request.postDataJSON()});
            let result={};
            if(url.pathname==='/api/config') result={api_providers:[],image_models:['gpt-image-2'],chat_models:['gpt-4o-mini'],video_models:[]};
            else if(url.pathname==='/api/canvases') result={canvases:[record]};
            else if(url.pathname==='/api/canvases/trash') result={canvases:[]};
            else if(url.pathname==='/api/canvas-folders') result={folders:[]};
            else if(url.pathname.endsWith('/lock')) result={holder:method==='POST'?{...request.postDataJSON(),ip:'127.0.0.1'}:null};
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
        const filename=path.resolve(root,'.'+decodeURIComponent(url.pathname));
        if(!filename.startsWith(root+path.sep)||!fs.existsSync(filename)||!fs.statSync(filename).isFile())return route.fulfill({status:404,body:'Not found'});
        if(url.pathname.includes('/canvas/')&&filename.endsWith('.js'))loaded.push(url.pathname);
        if(filename.endsWith('.html')){
            let body=fs.readFileSync(filename,'utf8');
            if(member)body=body.replace('</head>','<script src="/static/js/canvas-task-results.js"></script></head>');
            return route.fulfill({contentType:'text/html',body});
        }
        return route.fulfill({path:filename});
    });
    await page.goto(origin+'/static/'+(kind==='classic'?'canvas.html':'smart-canvas.html')+'?id=canvas-test');
    if(kind==='classic') {
        await page.waitForFunction(()=>typeof openCanvas==='function'&&typeof apiProviders!=='undefined');
        await page.evaluate(()=>openCanvas('canvas-test'));
    }
    await page.waitForFunction(()=>typeof canvas!=='undefined'&&canvas?.id==='canvas-test');
    if(member)await page.waitForFunction(()=>Boolean(window.MemberCanvasEdit?.active));
    assert.equal(new Set(loaded).size,7,'all seven task files load once');
    assert.equal(loaded.length,7);
    assert.deepEqual(errors,[],'page boots without declaration/order errors');
    return {page,errors,writes,record};
}

for(const kind of ['classic','smart']) {
    test(`${kind}: full page keeps nodes, styles, inline actions and single event bindings`, async t => {
        const {page,errors,writes}=await fixture(t,kind,false);
        const id=await page.evaluate(kind=>{
            if(kind==='classic')addPromptNode();else createPromptNode(220,220);
            clearTimeout(saveTimer);saveTimer=null;
            return nodes.at(-1).id;
        },kind);
        const selector=kind==='classic'?`.node[data-id="${id}"]`:`.image-node[data-id="${id}"]`;
        await page.locator(selector).waitFor({state:'visible'});
        assert.equal(await page.locator(selector).evaluate(el=>getComputedStyle(el).position),'absolute');
        // Open a real inline action, whose global function now lives in another file.
        const workflow=kind==='classic'?'#workflowTransferToggle':'#smartWorkflowToggle';
        await page.locator(workflow).click();
        const modal=kind==='classic'?'#workflowTransferModal':'#smartWorkflowTransferModal';
        assert.ok(await page.locator(modal).evaluate(el=>el.classList.contains('open')));
        await page.locator(`${modal} button[onclick="${kind==='classic'?'closeWorkflowTransferModal()':'closeSmartWorkflowTransferModal()'}"]`).click();
        assert.equal(await page.locator(modal).evaluate(el=>el.classList.contains('open')),false);
        // One click must open (not immediately close) the library panel.
        await page.locator(kind==='classic'?'#canvasAssetToggle':'#assetToggle').click();
        assert.equal(await page.evaluate(kind=>kind==='classic'?canvasAssetPanel.classList.contains('open'):assetLibraryOpen,kind),true);
        await page.evaluate(kind=>kind==='classic'?toggleCanvasAssetLibrary(false):toggleAssetLibrary(false),kind);
        await page.evaluate(()=>saveCanvas());
        assert.equal(writes.filter(w=>w.method==='PUT'&&w.path==='/api/canvases/canvas-test').length,1);
        assert.deepEqual(errors,[]);
    });

    test(`${kind}: read-only save/run gates and late-result guard survive module loading`, async t => {
        const {page,errors,writes}=await fixture(t,kind,true);
        const result=await page.evaluate(async kind=>{
            const node={id:'guard-target',type:kind==='classic'?'generator':'smart-image',x:200,y:200,images:[]};
            nodes.push(node);
            const guard=canvasTaskWriteGuard(node);
            const initiallyValid=guard.valid();
            window.MemberCanvasEdit.setEditable(false);
            const afterRevocation=guard.valid();
            scheduleSave();
            const dirty=kind==='classic'?localCanvasDirty:smartCanvasDirty;
            await saveCanvas();
            if(kind==='classic')await runCanvasGenerate(node.id);else await runGeneration();
            window.MemberCanvasEdit.setEditable(true);
            const oldGuardAfterRestore=guard.valid();
            const next=canvasTaskWriteGuard(node);
            const newGuardValid=next.valid();
            canvas={...canvas,id:'another-canvas'};
            return {initiallyValid,afterRevocation,dirty,oldGuardAfterRestore,newGuardValid,afterSwitch:next.valid()};
        },kind);
        assert.deepEqual(result,{initiallyValid:true,afterRevocation:false,dirty:false,oldGuardAfterRestore:false,newGuardValid:true,afterSwitch:false});
        assert.equal(writes.filter(w=>w.method==='PUT'||w.path.includes('-tasks')||w.path.includes('canvas-llm')).length,0);
        assert.deepEqual(errors,[]);
    });
}
