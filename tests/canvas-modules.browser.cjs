const {test} = require('node:test');
const assert = require('node:assert/strict');
const {fixture,origin} = require('./helpers/canvas-browser.cjs');

async function assetScenario(page,kind){
    await page.evaluate(async kind=>{
        const library={active_library_id:'one',libraries:['one','two'].map(id=>({id,name:id,categories:[
            {id:id+'-images',name:'Images',type:'image',items:Array.from({length:125},(_,i)=>({id:id+'-'+i,name:'Image '+i,url:'/test-image.svg?'+i}))},
            {id:id+'-other',name:'Other',type:'image',items:[]},
            {id:id+'-flows',name:'Flows',type:'workflow',items:[]}]}))};
        const owner=kind==='classic'?classicAssetPanel:smartAssetPanel;
        const read=()=>kind==='classic'?loadCanvasAssetLibrary():loadAssetLibrary();
        const snapshot=()=>structuredClone([{library},{items:[],tree:null}]);
        window.CanvasApi.getAssetLibraries=async()=>snapshot();
        await read();owner.setOpen(true);
        window.assetTest={owner,read,snapshot,library,kind,messages:[]};
        if(kind==='classic')setStatus=message=>assetTest.messages.push(message);
        else toast=message=>assetTest.messages.push(message);
    },kind);
}

for(const kind of ['classic','smart']){
    test(`${kind}: late authentication snapshot cannot undo a mutation while its item receipt remains available`,async t=>{
        const {page,errors}=await fixture(t,kind,false);await assetScenario(page,kind);
        const result=await page.evaluate(async kind=>{
            const {owner,snapshot}=assetTest;const old=snapshot()[0];let resolve;
            old.item={id:'one-0',registrations:{volcengine:{status:'Active'}}};
            const originalFetch=fetch;window.fetch=()=>new Promise(done=>resolve=done);
            try{
                const request=kind==='classic'?canvasAvatarRequest:smartAvatarRequest;
                const apply=kind==='classic'?setCanvasAssetLibraryFromResponse:setAssetLibraryFromResponse;
                const reading=request('/api/asset-library/items/one-0/avatar-status','one','volcengine');
                const newer=snapshot()[0];newer.library.libraries[0].name='newer mutation';
                const written=await owner.mutate(async()=>newer);apply(written);
                resolve(new Response(JSON.stringify(old),{status:200}));const receipt=await reading;
                const accepted=apply(receipt);
                return {accepted,name:(kind==='classic'?canvasAssetLibrary:assetLibrary).libraries[0].name,
                    status:receipt.item.registrations.volcengine.status};
            }finally{window.fetch=originalFetch;}
        },kind);
        assert.deepEqual(result,{accepted:false,name:'newer mutation',status:'Active'});assert.deepEqual(errors,[]);
    });
    test(`${kind}: asynchronous drop resolves media into its original library/category`,async t=>{
        const {page,errors}=await fixture(t,kind,false);await assetScenario(page,kind);
        const result=await page.evaluate(async kind=>{
            const {owner,library}=assetTest;let resolve,submitted;
            const resolvePayload=()=>new Promise(done=>resolve=done);
            window.CanvasApi.createAssetItem=async payload=>{submitted=payload;return {library:structuredClone(library)};};
            if(kind==='classic'){
                hasCanvasAssetSaveDrop=()=>true;hasCanvasNodeAssetDrag=()=>false;hasOutputImageDrag=()=>false;resolveImageDropPayload=resolvePayload;
            }else {hasSmartImageDropData=()=>true;resolveSmartImageDropPayload=resolvePayload;}
            const data=new DataTransfer();data.setData('text/plain','/test-image.svg');
            document.getElementById(kind==='classic'?'canvasAssetDropZone':'assetDropZone').dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true}));
            owner.selectLibrary('two');
            resolve({type:'url',url:'/test-image.svg'});for(let i=0;i<12;i++)await Promise.resolve();
            return {library:submitted.library_id,category:submitted.category_id,selection:owner.state.libraryId};
        },kind);
        assert.deepEqual(result,{library:'one',category:'one-images',selection:'two'});assert.deepEqual(errors,[]);
    });
    test(`${kind}: complete selection commands preserve manager/mention rules and renderers do not repair selection`,async t=>{
        const {page,errors}=await fixture(t,kind,false);await assetScenario(page,kind);
        const result=await page.evaluate(kind=>{
            const {owner}=assetTest, states=[];
            owner.loadMore();states.push(owner.state.renderedCount);
            owner.selectLibrary('two');states.push([owner.state.libraryId,owner.state.categoryId,owner.state.renderedCount]);
            owner.selectCategory('missing');states.push(owner.state.categoryId);
            owner.selectLibrary('one');owner.selectCategory('one-other');states.push(owner.state.categoryId);
            owner.selectLibrary('two');owner.selectLibrary('one');states.push(owner.state.categoryId);
            if(kind==='classic'){
                owner.selectCategory('one-flows');states.push(owner.state.categoryId);
                owner.selectCategory('one-other',{source:'manager-assets'});
                owner.selectLibrary('two',{source:'manager-workflows'});
                states.push([owner.state.categoryId,owner.state.workflowCategoryId]);
                owner.selectCategory('two-other',{source:'manager-assets'});
                owner.selectCategory('two-flows',{source:'manager-workflows'});
                states.push([owner.state.categoryId,owner.state.workflowCategoryId]);
            }else{
                owner.selectTab('workflow');owner.selectLibrary('__local_assets__');states.push(owner.state.tab);
                owner.selectTab('workflow');states.push([owner.state.libraryId,owner.state.tab,owner.state.workflowCategoryId]);
                owner.selectLibrary('two',{source:'mention'});
                selectSmartMentionCategory('two-other');
                states.push([owner.state.libraryId,owner.state.categoryId,owner.state.workflowCategoryId,owner.state.tab,mentionAssetCategoryId]);
                closeMentionPicker();
            }
            const before=JSON.stringify(owner.state);
            if(kind==='classic'){renderCanvasAssetLibrary();renderImageAssetManager();renderWorkflowAssetManager();}
            else renderAssetLibrary();
            return {states,pure:before===JSON.stringify(owner.state)};
        },kind);
        assert.deepEqual(result.states.slice(0,5),[120,['two','two-images',60],'two-images','one-other','one-images']);
        if(kind==='classic')assert.deepEqual(result.states.slice(5),['one-flows',['two-images','two-flows'],['two-other','two-flows']]);
        else assert.deepEqual(result.states.slice(5),['image',['one','workflow','one-flows'],['two','two-images','two-flows','workflow','two-other']]);
        assert.equal(result.pure,true);assert.deepEqual(errors,[]);
    });

    test(`${kind}: reverse reads, read/write interleaving, failed retry and cached-page return`,async t=>{
        const {page,errors}=await fixture(t,kind,false);await assetScenario(page,kind);
        const result=await page.evaluate(async kind=>{
            const {owner,read,snapshot,library}=assetTest;
            const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
            let pending=[];
            window.CanvasApi.getAssetLibraries=()=>{const next=deferred();pending.push(next);return next.promise;};
            const a=read(),b=read();const newer=snapshot();newer[0].library.libraries[0].name='newer';
            pending[1].resolve(newer);await b;pending[0].resolve(snapshot());await a;
            const getLibrary=()=>kind==='classic'?canvasAssetLibrary:assetLibrary;
            const newest=getLibrary().libraries[0].name;
            owner.selectLibrary('two');
            const stale=read(),fresh=read();pending[2].reject(new Error('old failure'));await stale;
            pending[3].resolve(newer);await fresh;
            const selection=owner.state.libraryId, staleErrors=assetTest.messages.length;
            // A read issued before rename and one issued during it must both lose to its receipt.
            owner.selectLibrary('one');const beforeWrite=read();
            const mutation=deferred();window.CanvasApi.updateAssetItem=()=>mutation.promise;
            let renamed;
            if(kind==='classic'){window.prompt=()=> 'Renamed';renamed=renameCanvasAssetItem('one-0');}
            else{
                beginAssetInlineRename('one-0');const input=document.querySelector('.asset-rename-input');input.value='Renamed';
                input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
            }
            const duringWrite=read();
            library.libraries[0].categories[0].items[0].name='Renamed';
            mutation.resolve({library:structuredClone(library)});if(renamed)await renamed;
            for(let i=0;i<8;i++)await Promise.resolve();
            const old=snapshot();old[0].library.libraries[0].categories[0].items[0].name='Old';
            pending[4].resolve(old);pending[5].resolve(old);await Promise.all([beforeWrite,duringWrite]);
            const name=getLibrary().libraries[0].categories[0].items[0].name;
            // The same barrier protects deletion without discarding the submitted operation.
            const beforeDelete=read();window.CanvasApi.deleteAssetItem=async()=>{
                library.libraries[0].categories[0].items.shift();return {library:structuredClone(library)};
            };
            if(kind==='classic'){window.confirm=()=>true;await deleteCanvasAssetItem('one-0');}
            else {document.querySelector('[data-delete-asset="one-0"]').click();for(let i=0;i<8;i++)await Promise.resolve();}
            pending[6].resolve(old);await beforeDelete;
            const deleted=!getLibrary().libraries[0].categories[0].items.some(item=>item.id==='one-0');
            const failure=read();pending[7].reject(new Error('offline'));await failure;
            const retry=read();pending[8].resolve(snapshot());await retry;
            const failedThenRetried=assetTest.messages.filter(message=>message==='资产库加载失败').length;
            owner.selectLibrary('two');owner.setQuery('Image 2');
            const cached=read();window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
            pending[9].resolve(old);await cached;
            window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
            const resumed=pending.length;pending[10].resolve(snapshot());for(let i=0;i<8;i++)await Promise.resolve();
            return {newest,selection,staleErrors,name,deleted,failedThenRetried,resumed,
                restored:[owner.destroyed,owner.state.libraryId,owner.state.query]};
        },kind);
        assert.deepEqual(result,{newest:'newer',selection:'two',staleErrors:0,name:'Renamed',deleted:true,failedThenRetried:1,resumed:11,restored:[false,'two','Image 2']});
        assert.deepEqual(errors,[]);
    });

    test(`${kind}: category creation retains its original target and cannot undo A-B-A navigation`,async t=>{
        const {page,errors}=await fixture(t,kind,false);await assetScenario(page,kind);
        const result=await page.evaluate(async kind=>{
            const {owner,library}=assetTest;let finish,answer,submitted;
            window.CanvasApi.createAssetCategory=payload=>{submitted=payload;return new Promise(resolve=>finish=resolve);};
            if(kind==='classic')window.prompt=()=> 'Created';
            else openAssetNameDialog=()=>new Promise(resolve=>answer=resolve);
            document.getElementById(kind==='classic'?'canvasAssetAddCategoryBtn':'assetAddCategoryBtn').click();
            owner.selectLibrary('two');
            if(answer){answer('Created');for(let i=0;i<8;i++)await Promise.resolve();}
            owner.selectLibrary('one');owner.selectCategory('one-other');
            library.libraries[0].categories.push({id:'created',name:'Created',type:'image',items:[]});
            finish({library:structuredClone(library),category:{id:'created'}});for(let i=0;i<8;i++)await Promise.resolve();
            const current=kind==='classic'?canvasAssetLibrary:assetLibrary;
            return {target:submitted.library_id,selection:owner.state.categoryId,saved:current.libraries[0].categories.some(cat=>cat.id==='created')};
        },kind);
        assert.deepEqual(result,{target:'one',selection:'one-other',saved:true});assert.deepEqual(errors,[]);
    });
}

test('classic: workflow export completes without restoring an obsolete library selection',async t=>{
    const {page,errors}=await fixture(t,'classic',false);await assetScenario(page,'classic');
    const result=await page.evaluate(async()=>{
        const {owner,library}=assetTest;let resolve,submitted;
        selectedWorkflowPayload=()=>({nodes:[{id:'exported',type:'prompt',text:'test'}],connections:[]});
        window.CanvasApi.exportCanvasWorkflowToLibrary=payload=>{submitted=payload;return new Promise(done=>resolve=done);};
        const exporting=exportSelectedWorkflowToLibrary();owner.selectLibrary('two');
        library.libraries[0].categories[2].items.push({id:'workflow-new',url:'/flow.zip',name:'Exported'});
        resolve(new Response(JSON.stringify({library,item:{id:'workflow-new',name:'Exported'}}),{status:200}));await exporting;
        return {target:submitted.library_id,category:submitted.category_id,selection:owner.state.libraryId,
            received:canvasAssetLibrary.libraries[0].categories[2].items.some(item=>item.id==='workflow-new')};
    });
    assert.deepEqual(result,{target:'one',category:'one-flows',selection:'two',received:true});assert.deepEqual(errors,[]);
});

for(const kind of ['classic','smart']) {
    test(`${kind}: asset panel selection, search, paging, drag payload and listener lifecycle`,async t=>{
        const {page,errors}=await fixture(t,kind,false);
        await page.evaluate(kind=>{
            window.panelLoads=0;
            const items=Array.from({length:125},(_,i)=>({id:'asset-'+i,name:i===3?'中文 Needle':'Image '+i,url:'/test-image.svg?'+i}));
            const library={active_library_id:'one',libraries:[
                {id:'one',name:'One',categories:[{id:'images',name:'Images',type:'image',items},
                    {id:'empty',name:'Empty',type:'image',items:[]},{id:'flows',name:'Flows',type:'workflow',items:[{id:'flow',name:'Workflow',url:'/flow.zip',kind:'workflow'}]}]},
                {id:'two',name:'Two',categories:[{id:'second',name:'Second',type:'image',items:[items[3]]}]}]};
            window.CanvasApi.getAssetLibraries=async()=>{window.panelLoads++;return [{library},{items:[items[0]],tree:null}];};
            window.panelRenames=0;
            window.CanvasApi.updateAssetItem=async(id,patch)=>{
                window.panelRenames++;
                const item=items.find(item=>item.id===id);Object.assign(item,patch);
                return {library,item};
            };
            for(let i=0;i<3;i++){
                if(kind==='classic'){bindClassicAssetPanelControls();bindClassicLibraryNavigation();bindClassicAssetPanelDropEvents();}
                else {bindSmartLibraryToggle();bindSmartAssetPanelEvents();bindSmartAssetPanelSelection();bindSmartLibraryDropEvents();}
            }
        },kind);
        const ids=kind==='classic'?{toggle:'canvasAssetToggle',close:'canvasAssetCloseBtn',panel:'canvasAssetPanel',grid:'canvasAssetGrid',search:'canvasAssetSearch',library:'canvasAssetLibrarySelect',category:'canvasAssetCategorySelect'}
            :{toggle:'assetToggle',close:'assetCloseBtn',panel:'assetPanel',grid:'assetGrid',search:'assetNameSearch',library:'assetLibrarySelect',category:'assetCategorySelect'};
        const cards=kind==='classic'?'.canvas-asset-item':'.asset-item';
        await page.locator('#'+ids.toggle).click();
        await page.waitForFunction(({grid,cards})=>document.getElementById(grid).querySelectorAll(cards).length===60,{grid:ids.grid,cards});
        assert.equal(await page.evaluate(()=>window.panelLoads),1,'repeated binding still makes one request');
        const paging=await page.evaluate(({ids,cards,kind})=>{
            const owner=kind==='classic'?classicAssetPanel:smartAssetPanel,grid=document.getElementById(ids.grid);
            window.oldAssetCard=grid.querySelector(cards);
            grid.scrollTop=grid.scrollHeight;grid.dispatchEvent(new Event('scroll'));
            const count=grid.querySelectorAll(cards).length,top=grid.scrollTop;
            const data=new DataTransfer();grid.querySelector(cards).dispatchEvent(new DragEvent('dragstart',{dataTransfer:data,bubbles:true}));
            const stale=new DataTransfer();window.oldAssetCard.dispatchEvent(new DragEvent('dragstart',{dataTransfer:stale,bubbles:true}));
            return {count,top,rendered:owner.state.renderedCount,payload:JSON.parse(data.getData(kind==='classic'?'application/x-canvas-asset':'application/x-smart-asset')),stale:stale.types.length};
        },{ids,cards,kind});
        assert.equal(paging.count,120);assert.equal(paging.rendered,120);assert.ok(paging.top>0);
        assert.equal(paging.payload.url,'/test-image.svg?0');assert.equal(paging.stale,0,'detached cards release drag listeners');
        if(kind==='smart'){
            await page.locator('[data-rename-asset="asset-0"]').click();
            await page.locator('.asset-rename-input').fill('Renamed 0');
            await page.locator('.asset-rename-input').press('Enter');
            await page.waitForFunction(()=>document.querySelector('[data-asset-id="asset-0"] .asset-name')?.textContent==='Renamed 0');
            await page.locator('[data-rename-asset="asset-0"]').click();
            await page.locator('.asset-rename-input').fill('Cancelled');
            await page.locator('.asset-rename-input').press('Escape');
            assert.equal(await page.locator('[data-asset-id="asset-0"] .asset-name').textContent(),'Renamed 0');
        } else {
            page.once('dialog',dialog=>dialog.accept('Renamed 0'));
            await page.locator('[data-canvas-asset-rename="asset-0"]').click();
            await page.waitForFunction(()=>document.querySelector('[data-asset-id="asset-0"] .canvas-asset-name')?.textContent==='Renamed 0');
        }
        assert.equal(await page.evaluate(()=>window.panelRenames),1,'rename submits exactly once; Escape does not save');
        await page.evaluate(()=>{
            window.panelCanvasRenders=0;const original=render;
            render=(...args)=>{window.panelCanvasRenders++;return original(...args);};
        });
        await page.locator('#'+ids.search).fill('  NEEDLE  ');
        assert.equal(await page.locator('#'+ids.grid+' '+cards).count(),1);
        assert.equal(await page.evaluate(()=>window.panelCanvasRenders),0,'search does not redraw the canvas');
        assert.equal(await page.evaluate(kind=>(kind==='classic'?classicAssetPanel:smartAssetPanel).state.query,kind),'  NEEDLE  ');
        await page.locator('#'+ids.category).selectOption('empty');
        assert.equal(await page.locator('#'+ids.grid+' '+cards).count(),0);
        await page.locator('#'+ids.search).fill('');
        await page.locator('#'+ids.library).selectOption('two');
        assert.equal(await page.locator('#'+ids.category).inputValue(),'second');
        assert.equal(await page.locator('#'+ids.grid+' '+cards).count(),1);
        await page.locator('#'+ids.library).selectOption('__local_assets__');
        assert.equal(await page.locator('#'+(kind==='classic'?'canvasAssetAddCategoryBtn':'assetAddCategoryBtn')).isDisabled(),true);
        if(kind==='smart'){
            await page.locator('[data-asset-tab="workflow"]').click();
            assert.equal(await page.locator('#'+ids.library).inputValue(),'one');
            assert.equal(await page.locator('#'+ids.category).inputValue(),'flows');
            assert.equal(await page.locator('#'+ids.grid+' '+cards).count(),1);
            await page.locator('[data-asset-tab="image"]').click();
        }
        await page.locator('#'+ids.close).click();
        assert.equal(await page.locator('#'+ids.panel).evaluate(el=>el.classList.contains('open')),false);
        await page.locator('#'+ids.toggle).click();
        assert.equal(await page.evaluate(()=>window.panelLoads),2);
        const disposed=await page.evaluate(async({kind,ids})=>{
            const owner=kind==='classic'?classicAssetPanel:smartAssetPanel;
            const grid=document.getElementById(ids.grid),html=grid.innerHTML;
            let resolve;window.CanvasApi.getAssetLibraries=()=>new Promise(done=>resolve=done);
            const request=kind==='classic'?loadCanvasAssetLibrary():loadAssetLibrary();
            if(kind==='classic')document.getElementById('canvasAssetResizeHandle').dispatchEvent(new MouseEvent('mousedown',{button:0,clientX:200,bubbles:true}));
            else refreshAssetLibrarySoon(1);
            owner.destroy();owner.destroy();
            resolve([{library:{libraries:[{id:'late',categories:[]}]}},{items:[]}]);await request;
            const before=owner.state;
            document.getElementById(ids.toggle).click();
            document.getElementById(ids.search).value='late';document.getElementById(ids.search).dispatchEvent(new Event('input'));
            window.dispatchEvent(new MouseEvent('mousemove',{clientX:500}));
            return {same:owner.state===before,html:grid.innerHTML===html,refs:Object.keys(owner.elements).length,
                resizing:document.body.classList.contains('canvas-asset-panel-resizing'),library:(kind==='classic'?canvasAssetLibrary:assetLibrary).libraries[0].id};
        },{kind,ids});
        assert.deepEqual(disposed,{same:true,html:true,refs:0,resizing:false,library:'one'});
        assert.deepEqual(errors,[]);
    });
}

for(const kind of ['classic', 'smart']) {
    test(`${kind}: Chinese editor labels and loop counts render without translation helpers`, async t => {
        const {page, errors} = await fixture(t, kind, false);
        await page.evaluate(kind => {
            nodes = [{id:'label-image',type:kind === 'classic' ? 'image' : 'smart-image',
                url:'/test-image.svg',images:[{url:'/test-image.svg'}],x:0,y:0}];
            if(kind === 'classic') openImageEditor('label-image', 'preview');
            else openImageEditor('label-image');
        }, kind);
        await page.waitForFunction(() => document.getElementById('cropImage').naturalWidth > 0);
        const labels = await page.evaluate(() => ['crop','outpaint','mask','brush','grid','preview'].map(mode => {
            setImageEditMode(mode);
            return {
                title:document.getElementById('imageEditTitle').textContent,
                hint:document.getElementById('imageEditSub').textContent,
                apply:document.getElementById('imageEditApplyBtn').textContent,
                hidden:document.getElementById('imageEditApplyBtn').style.display === 'none'
            };
        }));
        assert.deepEqual(labels.map(item => item.title), ['裁剪图片','扩图','遮罩编辑','画笔编辑','宫格切分','预览图片']);
        assert.deepEqual(labels.slice(0,5).map(item => item.apply), ['应用裁剪','应用扩图','生成遮罩节点','应用画笔','切分到 Output']);
        assert.ok(labels.every(item => item.hint && !/^(canvas|smart)\./.test(item.hint)));
        assert.equal(labels[5].hidden, true);
        const hints = await page.evaluate(kind => {
            // Supply different upstream counts while exercising the production renderer.
            const renderHints = [];
            for(const count of [0,1,12]) {
                const node = {id:'loop-label-test',type:kind === 'classic' ? 'loop' : 'smart-loop',imageInput:true};
                if(kind === 'classic') {
                    loopInputImageRefs = () => Array.from({length:count}, () => ({url:'/test-image.svg'}));
                    renderHints.push(renderLoopBody(node).querySelector('.loop-image-hint-only').textContent);
                } else {
                    smartLoopInputImages = () => Array.from({length:count}, () => ({url:'/test-image.svg'}));
                    const host = document.createElement('div');
                    host.innerHTML = smartLoopBodyHtml(node);
                    renderHints.push(host.querySelector('.loop-smart-note').textContent);
                }
            }
            return renderHints;
        }, kind);
        assert.deepEqual(hints, ['把图片或图片组连接到左侧输入口','当前会输出 1 张图片','当前会输出 12 张图片']);
        if(kind === 'smart') {
            const toggles = await page.evaluate(() => {
                const host = document.createElement('div');
                host.innerHTML = renderVideoAdvancedControl(true);
                return [...host.querySelectorAll('[data-toggle-param]')].map(button => button.textContent);
            });
            assert.deepEqual(toggles, ['提示词增强','高清','生成音频','镜头固定','水印','智能多参','首尾帧','可信素材模式']);
        }
        assert.deepEqual(errors, []);
    });
}


for(const kind of ['classic','smart']) {
    test(`${kind}: minimap navigation reuses layout, mixed updates measure once and preserve save timing`,async t=>{
        const {page,errors}=await fixture(t,kind,false);
        const result=await page.evaluate(kind=>{
            const owner=kind==='classic'?classicMinimap:smartMinimap;
            const originalFrame=requestAnimationFrame,originalCancel=cancelAnimationFrame;
            const originalMeasure=kind==='classic'?estimatedNodeRect:nodeRect;
            const originalSave=kind==='classic'?scheduleViewportSave:scheduleSave;
            let measurements=0,saves=0,id=0;const frames=new Map();
            const tick=()=>{const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn());};
            try {
                owner.reset();
                nodes=Array.from({length:200},(_,i)=>({id:'mini-'+i,type:kind==='classic'?'text':'smart-image',
                    x:(i%20)*500-2000,y:Math.floor(i/20)*600-2000,images:[]}));
                viewport={x:0,y:0,scale:1};
                if(kind==='classic')estimatedNodeRect=n=>{measurements++;return originalMeasure(n);};
                else nodeRect=n=>{measurements++;return originalMeasure(n);};
                window.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};
                window.cancelAnimationFrame=frame=>frames.delete(frame);
                if(kind==='classic')scheduleViewportSave=()=>saves++;else scheduleSave=()=>saves++;
                owner.render();const first=document.querySelector('.minimap-node');
                for(let i=0;i<120;i++){
                    viewport.x=-i;viewport.y=-i;owner.viewportChanged();tick();
                }
                const navigation={measurements,reused:first===document.querySelector('.minimap-node')};
                nodes[0].x-=100;owner.viewportChanged();owner.layoutChanged();owner.viewportChanged();tick();
                const mixed=measurements;
                owner.bind();owner.bind();
                const rect=document.getElementById('minimapContent').getBoundingClientRect();
                const event={clientX:rect.left+40,clientY:rect.top+30};
                const point=owner.eventToWorld(event);
                document.getElementById('minimap').dispatchEvent(new MouseEvent('mousedown',{...event,button:0,bubbles:true,cancelable:true}));
                const area=kind==='classic'?board.getBoundingClientRect():{width:shell.clientWidth,height:shell.clientHeight};
                const centered=Math.abs(viewport.x-(area.width/2-point.x*viewport.scale))<1e-8
                    && Math.abs(viewport.y-(area.height/2-point.y*viewport.scale))<1e-8;
                const down=saves;
                window.dispatchEvent(new MouseEvent('mousemove',{clientX:event.clientX+5,clientY:event.clientY+5,cancelable:true}));
                const moved=saves;
                window.dispatchEvent(new MouseEvent('mouseup',{...event,button:0}));
                return {navigation,mixed,centered,saves:[down,moved,saves],dragging:owner.dragging};
            } finally {
                owner.reset();window.requestAnimationFrame=originalFrame;window.cancelAnimationFrame=originalCancel;
                if(kind==='classic'){estimatedNodeRect=originalMeasure;scheduleViewportSave=originalSave;}
                else {nodeRect=originalMeasure;scheduleSave=originalSave;}
            }
        },kind);
        assert.deepEqual(result,{navigation:{measurements:200,reused:true},mixed:400,centered:true,
            saves:kind==='classic'?[0,0,1]:[1,2,2],dragging:false});
        assert.deepEqual(errors,[]);
    });
    test(`${kind}: minimap canvas reload, cached-page return and destroy reject old resources and retain workspace gestures`,async t=>{
        const {page,errors}=await fixture(t,kind,false);
        const result=await page.evaluate(async kind=>{
            const owner=kind==='classic'?classicMinimap:smartMinimap;
            const originalFrame=requestAnimationFrame,originalCancel=cancelAnimationFrame;
            const frames=new Map();let id=0,otherMoves=0;
            const listener=()=>otherMoves++;window.addEventListener('mousemove',listener);
            try {
                owner.reset();owner.render();
                window.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};
                window.cancelAnimationFrame=frame=>frames.delete(frame);
                const mouse={clientX:1150,clientY:780,button:0,bubbles:true,cancelable:true};
                const start=()=>document.getElementById('minimap').dispatchEvent(new MouseEvent('mousedown',mouse));
                start();const old=[...frames.values()];
                if(kind==='classic'){
                    const next={...structuredClone(canvas),id:'canvas-next',nodes:[]};
                    const originalGet=window.CanvasApi.getCanvas;
                    window.CanvasApi.getCanvas=async()=>({canvas:next});
                    try {await openCanvas(next.id);}finally{window.CanvasApi.getCanvas=originalGet;}
                }else await loadCanvas();
                const released=!owner.dragging;
                // Drain new-canvas frames, then deliberately invoke the cancelled old callback.
                const fresh=[...frames.values()];frames.clear();fresh.forEach(fn=>fn());
                const html=document.getElementById('minimapContent').innerHTML,view=JSON.stringify(viewport);
                old.forEach(fn=>fn());window.dispatchEvent(new MouseEvent('mousemove',mouse));
                const unchanged=html===document.getElementById('minimapContent').innerHTML&&view===JSON.stringify(viewport);
                start();window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
                const hiddenView=JSON.stringify(viewport),hiddenFrameCount=frames.size;
                window.dispatchEvent(new MouseEvent('mousemove',mouse));owner.layoutChanged();
                const suspended=hiddenView===JSON.stringify(viewport)&&frames.size===hiddenFrameCount&&!owner.dragging;
                window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
                const resumed=frames.size>hiddenFrameCount;
                const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn());
                start();const moveHandler=window.onmousemove,upHandler=window.onmouseup;
                owner.destroy();const finalView=JSON.stringify(viewport);
                window.dispatchEvent(new MouseEvent('mousemove',mouse));window.dispatchEvent(new MouseEvent('mouseup',mouse));
                start();owner.layoutChanged();
                const destroyed=finalView===JSON.stringify(viewport)&&!owner.dragging;
                let workspacePan=true;
                if(kind==='smart'){
                    const before=viewport.x;
                    shell.dispatchEvent(new MouseEvent('mousedown',{clientX:600,clientY:350,button:1,bubbles:true,cancelable:true}));
                    window.dispatchEvent(new MouseEvent('mousemove',{clientX:650,clientY:350,cancelable:true}));
                    window.dispatchEvent(new MouseEvent('mouseup',{clientX:650,clientY:350,button:1}));
                    workspacePan=viewport.x!==before;
                }
                return {released,unchanged,suspended,resumed,destroyed,workspacePan,
                    sharedHandlers:window.onmousemove===moveHandler&&window.onmouseup===upHandler,otherMoves};
            } finally {
                owner.reset();window.requestAnimationFrame=originalFrame;window.cancelAnimationFrame=originalCancel;
                window.removeEventListener('mousemove',listener);
            }
        },kind);
        assert.deepEqual(result,{released:true,unchanged:true,suspended:true,resumed:true,destroyed:true,
            workspacePan:true,sharedHandlers:true,otherMoves:kind==='smart'?4:3});
        assert.deepEqual(errors,[]);
    });
}

for(const kind of ['classic','smart']) {
    test(`${kind}: server delivery renders in view mode without replacing unrelated media or submitting a write`,async t=>{
        const {page,errors,writes}=await fixture(t,kind,true);
        const state=await page.evaluate(kind=>{
            const type=kind==='classic'?'output':'smart-image';
            nodes.push({id:'kept',type,x:50,y:50,images:[{url:'/test-image.svg?kept'}]},
                {id:'target',type,x:420,y:50,promptDraftText:'unsaved input',images:[],
                 _pending:[{canvasTaskId:'task-a'}],pendingTasks:[{taskId:'task-a'}]});
            canvas.nodes=nodes;render();
            const kept=document.querySelector('[data-id="kept"] img');
            window.MemberCanvasEdit.setEditable(false);
            const adapter=kind==='classic'?classicTaskRecovery():smartTaskRecovery();
            adapter.mergeDeliveries({canvas_id:canvas.id,result_version:1,deliveries:[{task_id:'task-a',version:1,target_id:'target',
                node:{id:'result-a',type,result_task_id:'task-a',images:[{url:'/test-image.svg?result',media_asset_id:'ast_result'}]}}]});
            // A deleted target is rendered as a new independent result node.
            adapter.mergeDeliveries({canvas_id:canvas.id,result_version:2,deliveries:[{task_id:'task-b',version:2,target_id:'deleted',
                node:{id:'result-b',type,x:700,y:50,result_task_id:'task-b',images:[{url:'/test-image.svg?fallback',media_asset_id:'ast_fallback'}]}}]});
            return {kept:Boolean(kept) && kept===document.querySelector('[data-id="kept"] img'),
                target:Boolean(document.querySelector('[data-id="target"] img')),
                fallback:Boolean(document.querySelector('[data-id="result-b"] img')),
                prompt:nodes.find(n=>n.id==='target').promptDraftText,version:canvas.task_result_version};
        },kind);
        assert.deepEqual(state,{kept:true,target:true,fallback:true,prompt:'unsaved input',version:2});
        assert.deepEqual(errors,[]);
        assert.deepEqual(writes.filter(write=>!write.path.endsWith('/touch')),[]);
    });
    test(`${kind}: recovered task shows an animated polling indicator only while active`,async t=>{
        const {page,errors}=await fixture(t,kind,true);
        const states=await page.evaluate(kind=>{
            const task={id:'pending-1',canvasTaskId:'task-1',taskId:'task-1'};
            const node={id:'node-1',type:'image',images:[],pendingTasks:[task]};
            const layout={width:240,height:240};
            const host=document.createElement('div');document.body.append(host);
            function render(status){
                window.MemberCanvasEdit.taskState=()=>({status,label:status==='running'?'后台正在处理':'连接中断'});
                host.innerHTML=kind==='classic'?renderPendingOutput(task):nodeBodyHtml(node,layout);
                refreshIcons();
                const ring=host.querySelector('.task-recovery-ring');
                return {ring:Boolean(ring),animation:ring?getComputedStyle(ring).animationName:'',
                    text:host.textContent};
            }
            const running=render('running'),disconnected=render('disconnected');
            host.remove();return {running,disconnected};
        },kind);
        assert.equal(states.running.ring,true);
        assert.match(states.running.animation,/spin/);
        assert.doesNotMatch(states.running.text,/每 5 秒自动核对后台状态/);
        assert.equal(states.disconnected.ring,false);
        assert.deepEqual(errors,[]);
    });
    if(kind==='classic')test('classic: wide pending result keeps recovery controls inside its card',async t=>{
        const {page,errors}=await fixture(t,'classic',true);
        const bounds=await page.evaluate(()=>{
            window.MemberCanvasEdit.taskState=()=>({status:'running',label:'后台正在处理'});
            const host=document.createElement('div');host.style.width='180px';document.body.append(host);
            host.innerHTML=renderPendingOutput({id:'pending-wide',canvasTaskId:'task-wide',previewSize:{w:1600,h:900}});
            const card=host.querySelector('.output-img-wrap'),ring=host.querySelector('.task-recovery-ring'),button=host.querySelector('.output-recover-query');
            const result={card:card.getBoundingClientRect().toJSON(),ring:ring.getBoundingClientRect().toJSON(),button:button.getBoundingClientRect().toJSON()};
            host.remove();return result;
        });
        assert.ok(bounds.card.height>=132);
        assert.ok(bounds.ring.top>=bounds.card.top,'progress ring stays inside the card');
        assert.ok(bounds.button.bottom<=bounds.card.bottom,'refresh button stays inside the card');
        assert.deepEqual(errors,[]);
    });
    if(kind==='smart')test('smart: recovered task fills its node without an upload shell',async t=>{
        const {page,errors}=await fixture(t,'smart',true);
        const cases=await page.evaluate(()=>{
            window.MemberCanvasEdit.taskState=task=>task.paused
                ? {status:'succeeded',label:'已完成，待加入'}
                : {status:'running',label:'后台正在处理'};
            return [false,true].map(paused=>{
                const node={id:'recovered-'+paused,type:'smart-image',x:100,y:100,w:260,h:320,images:[],pending:paused?0:1,
                    pendingTasks:[{taskId:'task-'+paused,kind:'image',paused}]};
                world.insertAdjacentHTML('beforeend',renderSmartNodeHtml(node));
                const el=world.querySelector(`.image-node[data-id="${node.id}"]`),card=el.querySelector('.task-recovery-status');
                const box=el.getBoundingClientRect(),status=card.getBoundingClientRect();
                const result={empty:el.classList.contains('empty-node'),uploadHint:el.querySelector('.node-hint')?.textContent || null,
                    nodeHeight:box.height,cardHeight:status.height,cardTop:status.top,nodeTop:box.top,
                    nodeWidth:box.width,cardWidth:status.width,cardLeft:status.left,nodeLeft:box.left};
                el.remove();return result;
            });
        });
        for(const entry of cases){
            assert.equal(entry.empty,false);
            assert.equal(entry.uploadHint,null);
            assert.ok(Math.abs(entry.cardTop-entry.nodeTop)<2);
            assert.ok(Math.abs(entry.cardHeight-entry.nodeHeight)<2);
            assert.ok(Math.abs(entry.cardLeft-entry.nodeLeft)<2);
            assert.ok(Math.abs(entry.cardWidth-entry.nodeWidth)<2);
        }
        assert.deepEqual(errors,[]);
    });
    if(kind==='smart')test('smart: selecting a pending result preserves its submitted inputs',async t=>{
        const {page,errors}=await fixture(t,'smart',true);
        await page.addScriptTag({url:origin+'/static/js/canvas-task-bindings.js'});
        const result=await page.evaluate(()=>{
            const source={id:'managed-source',type:'smart-image',x:20,y:20,images:[{url:'/test-image.svg',kind:'image'}]};
            const target={id:'managed-result',type:'smart-image',x:400,y:20,w:260,h:180,images:[],pending:1,
                runPrompt:'生成深度图',runModelPrompt:'depth model prompt',promptDraftHtml:'',promptDraftText:'',
                runSettings:{engine:'api',apiKind:'image',provider_id:'test',model:'gpt-image-2',resolution:'custom',customWidth:1024,customHeight:576,count:1},
                pendingTasks:[{taskId:'managed-task',kind:'image',run:{nodeId:source.id}}]};
            nodes.push(source,target);canvas.nodes=nodes;canvas.connections=[{from:source.id,to:target.id,kind:'flow'}];
            selectedId='';lastComposerNodeId='';activeComposerSubject=null;render();
            const snapshot=()=>window.CanvasTaskBindings.graphCanonical(smartTaskInputDocument(),source.id,target.id);
            const before=snapshot(),dataBefore=JSON.stringify(target);
            document.querySelector('.image-node[data-id="managed-result"]').click();
            const after=snapshot(),dataAfter=JSON.stringify(target);
            promptInput.textContent='用户修改了提示词';
            promptInput.dispatchEvent(new Event('input',{bubbles:true}));
            const afterEdit=snapshot();
            return {same:before===after,nodeSame:dataBefore===dataAfter,editDetected:afterEdit!==before,
                before:JSON.parse(dataBefore),after:JSON.parse(dataAfter)};
        });
        assert.equal(result.same,true,JSON.stringify(result));
        assert.equal(result.nodeSame,true,JSON.stringify(result));
        assert.equal(result.editDetected,true,'a real prompt edit still invalidates the task binding');
        assert.deepEqual(errors,[]);
    });
    if(kind==='smart')test('smart: creating and viewing a managed result keeps its preflight binding valid',async t=>{
        const {page,errors}=await fixture(t,'smart',true);
        await page.addScriptTag({url:origin+'/static/js/canvas-task-bindings.js'});
        const result=await page.evaluate(()=>{
            const source={id:'tool-source',type:'smart-image',x:20,y:20,images:[{url:'/test-image.svg',kind:'image'}]};
            nodes.push(source);canvas.nodes=nodes;selectedId=source.id;render();
            const settings={engine:'api',apiKind:'image',provider_id:'provider',model:'gpt-image-2',
                resolution:'custom',customWidth:1024,customHeight:576,customSize:'1024x576',count:1};
            const meta={prompt:'depth prompt',displayPrompt:'生成深度图',promptText:'生成深度图',promptHtml:'',
                promptRefs:[{url:'/test-image.svg',kind:'image'}],inputRefs:[{url:'/test-image.svg',kind:'image'}],
                sourceNodeId:source.id,settings,createdAt:Date.now()};
            const output=createPendingOutputFromSource(source,1,meta,{connectSource:false,selectOutput:true,refs:meta.inputRefs});
            const binding=smartTaskInputBinding(source,output,canvasTaskWriteGuard(source,output));
            render();binding.check();
            document.querySelector(`.image-node[data-id="${output.id}"]`).click();binding.check();
            promptInput.textContent='真正修改结果卡输入';
            promptInput.dispatchEvent(new Event('input',{bubbles:true}));
            let blocked=false;try{binding.check();}catch(error){blocked=Boolean(error.inputChanged);}
            return {blocked};
        });
        assert.equal(result.blocked,true);
        assert.deepEqual(errors,[]);
    });
    if(kind==='classic')test('classic: rendering generation and upstream nodes preserves submitted inputs',async t=>{
        const {page,errors}=await fixture(t,'classic',true);
        await page.addScriptTag({url:origin+'/static/js/canvas-task-bindings.js'});
        const result=await page.evaluate(()=>{
            apiProviders=[{id:'provider',enabled:true,image_models:['gpt-image-2'],video_models:['veo3-fast'],chat_models:['gpt-4o-mini']}];
            const source={id:'input',type:'image',x:20,y:20,url:'/test-image.svg'};
            const image={id:'image-generator',type:'generator',x:400,y:20,apiProvider:'provider',model:'gpt-image-2',
                resolution:'custom',ratio:'custom',customRatio:'16:9',customSize:'1024x576',inputs:[]};
            const video={id:'video-generator',type:'video',x:400,y:500,apiProvider:'provider',model:'veo3-fast',
                duration:5,aspectRatio:'16:9',resolution:'',inputs:[]};
            const loop={id:'loop-source',type:'loop',x:800,y:20,variablePrompt:'step 《计数》'};
            const llm={id:'llm-source',type:'llm',x:800,y:500,llmProvider:'provider',model:'gpt-4o-mini',outputText:'prompt'};
            const targets=[image,video,loop,llm];
            nodes.push(source,...targets);
            connections=targets.map(target=>({from:'input',to:target.id,kind:'flow'}));
            const snapshot=target=>window.CanvasTaskBindings.graphCanonical(canvasSavePayload(),'input',target);
            const before=targets.map(target=>snapshot(target.id)),dataBefore=targets.map(target=>JSON.stringify(target));
            render();
            const after=targets.map(target=>snapshot(target.id)),dataAfter=targets.map(target=>JSON.stringify(target));
            const display=['.custom-ratio-w-input','.custom-ratio-h-input','.custom-w-input','.custom-h-input']
                .map(selector=>document.querySelector(`.node[data-id="image-generator"] ${selector}`).value);
            const quality=document.querySelector('.node[data-id="image-generator"] .quality-select');
            quality.value='high';quality.dispatchEvent(new Event('change',{bubbles:true}));
            return {same:before.map((value,index)=>value===after[index]),display,editDetected:snapshot(image.id)!==before[0],dataBefore,dataAfter};
        });
        assert.deepEqual(result.same,[true,true,true,true],JSON.stringify(result));
        assert.deepEqual(result.display,['16','9','1024','576']);
        assert.equal(result.editDetected,true,'a real setting edit still invalidates the task binding');
        assert.deepEqual(errors,[]);
    });
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
        assert.equal(await page.evaluate(kind=>kind==='classic'?classicAssetPanel.state.open:smartAssetPanel.state.open,kind),true);
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
