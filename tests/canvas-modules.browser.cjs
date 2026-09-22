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
    test(`${kind}: billing prompt expands and copies complete source text and all output links`,async t=>{
        const {page,errors}=await fixture(t,kind,false);
        const prompt='起点 <巴士> & 夜景\n'+('镜头和灯光细节，'.repeat(140))+'\n终点：保留这个收尾。';
        const outputs=Array.from({length:12},(_,i)=>'/test-image.svg?output='+i);
        await page.evaluate(({kind,prompt,outputs})=>{
            window.copiedText=[];
            Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.copiedText.push(text)}});
            const logs=[{id:'long-prompt',createdAt:1789000000000,status:'success',runMs:129000,
                platform:'api-40824715',model:'gpt-image-2.5',billingModel:'gpt-image-2.5',prompt,outputs,
                request:{task_id:'task-full'},cost:{status:'priced',currency:'CNY',amount_micros:30000}}];
            window.CanvasLedger.view=()=>({logs,ready:true,totals:{total:30000,image:30000,video:0,calls:1,unknown:0,estimated:0}});
            window.CanvasLedger.mount=()=>{};
            if(kind==='classic'){renderCanvasLog();document.getElementById('logModal').classList.add('open');}
            else {renderSmartCanvasLog();document.getElementById('smartLogModal').classList.add('open');}
        },{kind,prompt,outputs});
        const root=page.locator(kind==='classic'?'#logList':'#smartLogList');
        assert.equal(await root.locator('.log-prompt-text').textContent(),prompt);
        assert.equal(await root.locator('[data-log-expand]').getAttribute('aria-expanded'),'false');
        await root.locator('[data-log-expand]').click();
        assert.equal(await root.locator('[data-log-expand]').getAttribute('aria-expanded'),'true');
        await root.locator('[data-log-copy="prompt"]').click();
        await page.waitForFunction(()=>window.copiedText.length===1);
        assert.equal(await page.evaluate(()=>window.copiedText[0]),prompt);
        await root.locator('[data-log-copy="record"]').click();
        await page.waitForFunction(()=>window.copiedText.length===2);
        const copied=await page.evaluate(()=>window.copiedText[1]);
        assert.ok(copied.includes(prompt));
        assert.ok(copied.includes(outputs[11]));
        assert.ok(copied.includes('任务 ID：task-full'));
        assert.match(await root.locator('.log-copy-feedback').textContent(),/已复制完整内容/);
        await root.locator('[data-log-expand]').click();
        await page.setViewportSize({width:390,height:844});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
        assert.equal(await root.locator('[data-log-copy="prompt"]').isVisible(),true);
        await page.evaluate(()=>{
            Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('denied');}}});
            document.execCommand=()=>false;
        });
        await root.locator('[data-log-copy="prompt"]').click();
        await page.waitForFunction(()=>document.querySelector('.log-copy-feedback.error'));
        assert.equal(await page.evaluate(()=>window.copiedText.length),2);
        assert.deepEqual(errors,[]);
    });
    test(`${kind}: history displays unknown duration instead of zero and formats backend duration`,async t=>{
        const {page,errors}=await fixture(t,kind,false);
        const labels=await page.evaluate(kind=>{
            const logs=[undefined,0,129000].map((runMs,i)=>({id:'duration-'+i,createdAt:1789000000000,status:'success',
                runMs,platform:'test',model:'test',outputs:[],cost:{status:'unknown'}}));
            window.CanvasLedger.view=()=>({logs,ready:true,totals:{total:0,image:0,video:0,calls:3,unknown:3,estimated:0}});
            window.CanvasLedger.mount=()=>{};
            if(kind==='classic')renderCanvasLog();else renderSmartCanvasLog();
            return [...document.querySelectorAll((kind==='classic'?'#logList':'#smartLogList')+' .log-meta .log-chip:last-child')].map(el=>el.textContent);
        },kind);
        assert.equal(labels.length,3);assert.match(labels[0],/耗时未知|Duration unknown/);assert.equal(labels[1],labels[0]);
        assert.match(labels[2],/2.*09/);assert.deepEqual(errors,[]);
    });
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

test('classic: 420-node deletion and undo keep unrelated images and playing media mounted',async t=>{
    const {page,errors,record}=await fixture(t,'classic',false);
    await page.evaluate(async()=>{
        nodes=Array.from({length:418},(_,i)=>({id:'image-'+i,type:'image',x:80+(i%12)*35,y:80+Math.floor(i/12)*12,
            w:120,h:120,url:'/test-image.svg?image='+i,mediaKind:'image',name:'Image '+i}));
        nodes.push({id:'group',type:'group',x:20,y:20,w:300,h:240,items:['image-0','image-1']},
            {id:'generator',type:'generator',x:500,y:80,inputs:['group'],model:'gpt-image-2',count:1});
        connections=[{id:'group-input',from:'group',to:'generator'}];
        render();resetCanvasHistory();
        window.deletionRefs=new Map([...nodesEl.querySelectorAll('.node')].filter(el=>!['image-0','image-1','group','generator'].includes(el.dataset.id))
            .map(el=>[el.dataset.id,{el,img:el.querySelector('img')}]));
        window.fullRenders=0;const original=render;render=()=>{window.fullRenders++;return original();};
        const video=document.createElement('video'),surface=document.createElement('canvas');surface.width=surface.height=8;
        surface.getContext('2d').fillRect(0,0,8,8);video.muted=true;video.srcObject=surface.captureStream(5);
        nodesEl.querySelector('[data-id="image-2"] .node-body').append(video);
        await video.play();window.deletionVideo=video;window.videoPauses=0;video.addEventListener('pause',()=>window.videoPauses++);
    });
    const stable=async()=>assert.deepEqual(await page.evaluate(()=>({
        stable:[...window.deletionRefs].every(([id,ref])=>nodesEl.querySelector(`.node[data-id="${id}"]`)===ref.el &&
            ref.el.isConnected && (!ref.img || ref.el.querySelector('img')===ref.img)),
        fullRenders:window.fullRenders,playing:window.deletionVideo.isConnected && !window.deletionVideo.paused,pauses:window.videoPauses
    })),{stable:true,fullRenders:0,playing:true,pauses:0});
    await page.locator('.node[data-id="image-0"] .node-delete-btn').evaluate(button=>button.click());
    assert.equal(await page.evaluate(()=>nodes.find(node=>node.id==='image-0').url),'');
    assert.equal(await page.locator('.node[data-id="generator"] .input-list img').count(),1);
    await stable();
    await page.evaluate(()=>performUndo());await stable();
    assert.equal(await page.locator('.node[data-id="generator"] .input-list img').count(),2);
    await page.evaluate(()=>performRedo());await stable();
    await page.locator('.node[data-id="image-0"] .node-delete-btn').evaluate(button=>button.click());
    assert.deepEqual(await page.evaluate(()=>({exists:nodes.some(node=>node.id==='image-0'),items:nodes.find(node=>node.id==='group').items})),
        {exists:false,items:['image-1']});
    await stable();await page.evaluate(()=>performUndo());await stable();
    assert.ok(await page.locator('.node[data-id="image-0"]').count());
    await page.evaluate(()=>{selected=new Set(['group']);deleteSelectedNodes();});await stable();
    assert.deepEqual(await page.evaluate(()=>({ids:nodes.filter(node=>['image-0','image-1','group'].includes(node.id)).map(node=>node.id),
        connections:connections.length,inputs:nodes.find(node=>node.id==='generator').inputs,links:renderedCanvasLinks.size})),
        {ids:[],connections:0,inputs:[],links:0});
    await page.evaluate(()=>performUndo());await stable();
    assert.equal(await page.evaluate(()=>renderedCanvasLinks.size),1);
    await page.evaluate(()=>performRedo());await stable();
    await page.evaluate(()=>saveCanvas());
    assert.equal(record.nodes.length,417);assert.equal(record.connections.length,0);
    await page.evaluate(()=>{window.deletionVideo.srcObject.getTracks().forEach(track=>track.stop());});
    await page.evaluate(()=>openCanvas('canvas-test'));
    assert.equal(await page.evaluate(()=>nodes.length),417);
    assert.deepEqual(errors,[]);
});

test('classic: output deletion has undo and persistence, recovery buttons and read-only gates stay separate',async t=>{
    const {page,errors}=await fixture(t,'classic',true);
    await page.evaluate(()=>{
        nodes=[{id:'out',type:'output',x:80,y:80,images:[{url:'/test-image.svg?1'},{url:'/test-image.svg?2'}],
            _pending:[{id:'pending',canvasTaskId:'task',canvasTaskType:'video'}]},
            {id:'other',type:'image',x:500,y:100,url:'/test-image.svg?other'}];
        connections=[];render();resetCanvasHistory();
        window.otherImage=nodesEl.querySelector('[data-id="other"] img');
        window.resultsOpened=0;window.MemberCanvasEdit.taskState=()=>({status:'succeeded',label:'已完成，待加入'});
        window.MemberCanvasEdit.openTaskResults=()=>window.resultsOpened++;
        refreshNodes(['out']);
    });
    await page.locator('[data-pending-id="pending"] .output-recover-query').evaluate(button=>button.click());
    assert.equal(await page.evaluate(()=>window.resultsOpened),1);
    await page.locator('[data-pending-id="pending"] .output-del').evaluate(button=>button.click());
    assert.deepEqual(await page.evaluate(()=>({pending:nodes[0]._pending.length,dirty:localCanvasDirty,undo:undoStack.length,opened:window.resultsOpened})),
        {pending:0,dirty:true,undo:1,opened:1});
    await page.evaluate(()=>performUndo());assert.equal(await page.locator('[data-pending-id="pending"]').count(),1);
    // Retained output wrappers must bind to the current document object too.
    await page.evaluate(()=>{nodes[0]={...nodes[0]};refreshNodes(['out']);});
    await page.locator('[data-output-url="/test-image.svg?1"] .output-del').evaluate(button=>button.click());
    assert.equal(await page.evaluate(()=>nodes[0].images.length),1);
    await page.evaluate(()=>performUndo());assert.equal(await page.evaluate(()=>nodes[0].images.length),2);
    const position=await page.evaluate(()=>{
        const old=nodes[0].x;pushUndo();nodes[0].x=700;refreshNodes(['out'],{rebuildOutputs:true});performUndo();
        return {old,restored:Number.parseFloat(nodesEl.querySelector('[data-id="out"]').style.left)};
    });
    assert.equal(position.restored,position.old);
    assert.equal(await page.evaluate(()=>window.otherImage===nodesEl.querySelector('[data-id="other"] img')),true);
    const before=await page.evaluate(()=>{window.MemberCanvasEdit.setEditable(false);return JSON.stringify(canvasHistorySnapshot());});
    await page.locator('[data-pending-id="pending"] .output-del').evaluate(button=>button.click());
    await page.evaluate(()=>{clearNodeContentBeforeDelete('other');deleteNode('other');selected.add('out');deleteSelectedNodes();performUndo();performRedo();});
    assert.equal(await page.evaluate(()=>JSON.stringify(canvasHistorySnapshot())),before);
    assert.deepEqual(errors,[]);
});
