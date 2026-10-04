const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function manager(t){
 const f=await fixture(t,'classic');await f.page.waitForLoadState('networkidle');
 await f.page.evaluate(()=>{
  window.managerData={libraries:[{id:'one',name:'One',categories:[{id:'images',name:'Images',type:'image',items:[{id:'a',name:'A',url:'/test-image.svg'}]},
   {id:'workflows',name:'Workflows',type:'workflow',items:[{id:'w',name:'W',url:'/workflow.json'}]}]},
   {id:'two',name:'Two',categories:[{id:'images-two',type:'image',items:[]}]}],active_library_id:'one'};
  window.managerPrompts={libraries:[{id:'system',name:'System',readonly:true,items:[{id:'system-p',positive:'System'}]},
   {id:'mine',name:'Mine',items:[{id:'p',name:'P',positive:'prompt'}]}]};
  window.managerReads=0;window.managerWrites=0;window.managerCanvasSaves=0;
  window.CanvasApi.getAssetLibraries=async()=>{managerReads++;return [{library:structuredClone(managerData)},{items:[],tree:null}];};
  window.CanvasApi.getPromptLibraries=async()=>({library:structuredClone(managerPrompts)});
  const save=scheduleSave;scheduleSave=(...args)=>{managerCanvasSaves++;return save(...args);};
  classicLibraryManager.bind();openAssetManager();
 });
 await f.page.waitForFunction(()=>document.querySelector('[data-manager-asset-check="a"]'));
 return f;
}
test('Classic manager exposes frozen UI snapshots without external state/DOM aliases; reopens preserve workflow selection only',async t=>{
 const {page,errors}=await manager(t);
 await page.locator('[data-manager-asset-check="a"]').check();await page.locator('[data-manager-tab="workflows"]').click();await page.locator('[data-manager-workflow-check="w"]').check();
 await page.locator('[data-manager-tab="prompts"]').click();await page.locator('[data-manager-prompt-lib="mine"]').click();await page.locator('[data-manager-prompt-check="p"]').check();
 const before=await page.evaluate(()=>classicLibraryManager.state);assert.deepEqual(before.assetIds,['a']);assert.deepEqual(before.workflowIds,['w']);assert.deepEqual(before.promptIds,['p']);
 await page.evaluate(()=>{closeAssetManager();openAssetManager();});await page.waitForFunction(()=>document.querySelector('[data-manager-prompt-check="p"]'));
 const result=await page.evaluate(()=>({state:classicLibraryManager.state,frozen:Object.isFrozen(classicLibraryManager)&&Object.isFrozen(classicLibraryManager.state)&&Object.isFrozen(classicLibraryManager.state.workflowIds),
  aliases:[typeof assetManagerTab,typeof managerSelectedAssetIds,typeof managerSelectedWorkflowIds,typeof managerSelectedPromptIds],domExposed:'assetManagerModal' in classicLibraryManager||'assetManagerBody' in classicLibraryManager,saves:managerCanvasSaves}));
 assert.deepEqual(result.state.assetIds,[]);assert.deepEqual(result.state.promptIds,[]);assert.deepEqual(result.state.workflowIds,['w']);assert.equal(result.frozen,true);assert.deepEqual(result.aliases,Array(4).fill('undefined'));assert.equal(result.domExposed,false);assert.equal(result.saves,0);assert.deepEqual(errors,[]);
});
test('Classic manager repeated bind gives one read/open and one submitted deletion, without touching unrelated controls',async t=>{
 const {page,errors}=await manager(t);await page.evaluate(()=>{classicLibraryManager.bind();classicLibraryManager.bind();closeAssetManager();managerReads=0;});
 await page.locator('#gateAssetManagerBtn').evaluate(el=>el.click());await page.waitForFunction(()=>managerReads===1);
 await page.locator('[data-manager-asset-check="a"]').check();
 await page.evaluate(()=>{window.CanvasApi.deleteAssetItems=async request=>{managerWrites++;window.managerDeleteRequest=request;return {library:managerData};};});
 await page.locator('[data-manager-asset-delete]').click();await page.waitForFunction(()=>managerWrites===1);
 assert.deepEqual(await page.evaluate(()=>({reads:managerReads,writes:managerWrites,ids:managerDeleteRequest.ids,selected:classicLibraryManager.state.assetIds,saves:managerCanvasSaves})),{reads:1,writes:1,ids:['a'],selected:[],saves:0});assert.deepEqual(errors,[]);
});
test('Classic manager shared library/category commands clear the corresponding set and retain other tabs',async t=>{
 const {page,errors}=await manager(t);await page.locator('[data-manager-asset-check="a"]').check();await page.locator('[data-manager-tab="workflows"]').click();await page.locator('[data-manager-workflow-check="w"]').check();
 await page.evaluate(()=>classicAssetPanel.selectCategory('workflows',{source:'manager-workflows'}));
 assert.deepEqual(await page.evaluate(()=>({assets:classicLibraryManager.state.assetIds,workflows:classicLibraryManager.state.workflowIds})),{assets:['a'],workflows:[]});
 await page.locator('[data-manager-tab="assets"]').click();await page.locator('[data-manager-asset-lib="two"]').click();
 assert.deepEqual(await page.evaluate(()=>({assets:classicLibraryManager.state.assetIds,lib:classicAssetPanel.state.libraryId,cat:classicAssetPanel.state.categoryId})),{assets:[],lib:'two',cat:'images-two'});assert.deepEqual(errors,[]);
});
test('Classic manager delayed open cannot redraw after close or restore an old tab after re-opening',async t=>{
 const {page,errors}=await manager(t);
 await page.evaluate(()=>{closeAssetManager();window.managerResolves=[];loadCanvasAssetLibrary=()=>new Promise(resolve=>managerResolves.push(resolve));loadCanvasPromptTemplates=async()=>[];openAssetManager();closeAssetManager();});
 const before=await page.locator('#assetManagerBody').innerHTML();await page.evaluate(()=>managerResolves[0]());assert.equal(await page.locator('#assetManagerBody').innerHTML(),before);assert.equal(await page.evaluate(()=>classicLibraryManager.state.open),false);
 await page.evaluate(()=>{openAssetManager();selectClassicAssetManagerTab('workflows');managerResolves[1]();});assert.equal(await page.evaluate(()=>classicLibraryManager.state.tab),'workflows');assert.equal(await page.locator('#assetManagerModal.open').count(),1);assert.deepEqual(errors,[]);
});
for(const change of ['close','reopen','destroy'])test('Classic submitted management deletion completes after '+change+' without reactivating or clearing a new session',async t=>{
 const {page,errors}=await manager(t);await page.locator('[data-manager-asset-check="a"]').check();
 await page.evaluate(()=>{window.CanvasApi.deleteAssetItems=request=>{managerWrites++;window.managerDeleteRequest=request;return new Promise(resolve=>window.managerRelease=()=>resolve({library:managerData}));};});
 await page.locator('[data-manager-asset-delete]').click();await page.waitForFunction(()=>typeof managerRelease==='function');
 await page.evaluate(change=>{closeAssetManager();if(change==='reopen')openAssetManager();if(change==='destroy')classicLibraryManager.destroy();window.managerReceiptControl=document.querySelector('#managerAssetUpload');},change);
 if(change==='reopen'){await page.waitForFunction(()=>document.querySelector('[data-manager-asset-check="a"]'));await page.locator('[data-manager-asset-check="a"]').check();}
 await page.evaluate(()=>managerRelease());await page.waitForTimeout(20);
 const result=await page.evaluate(()=>({open:classicLibraryManager.state.open,assets:classicLibraryManager.state.assetIds,writes:managerWrites,saves:managerCanvasSaves,data:canvasAssetLibrary.libraries[0].id}));
 assert.deepEqual(result,{open:change==='reopen',assets:change==='destroy'?[]:['a'],writes:1,saves:0,data:'one'});assert.deepEqual(errors,[]);
 if(change!=='reopen')assert.equal(await page.evaluate(()=>document.querySelector('#managerAssetUpload')===managerReceiptControl),true);
});
test('Classic manager upload listeners belong to rendered controls and submitted workflow upload retains its original fields',async t=>{
 const {page,errors}=await manager(t);await page.locator('[data-manager-tab="workflows"]').click();
 await page.evaluate(()=>{classicLibraryManager.render();classicLibraryManager.render();window.CanvasApi.uploadAssetWorkflows=form=>{managerWrites++;window.managerForm={lib:form.get('library_id'),cat:form.get('category_id'),names:form.getAll('files').map(f=>f.name)};return new Promise(resolve=>window.managerRelease=()=>resolve({library:managerData}));};});
 await page.locator('#managerWorkflowUpload').setInputFiles({name:'workflow.json',mimeType:'application/json',buffer:Buffer.from('{}')});await page.waitForFunction(()=>typeof managerRelease==='function');
 await page.evaluate(()=>{closeAssetManager();managerRelease();});await page.waitForTimeout(20);
 assert.deepEqual(await page.evaluate(()=>({form:managerForm,writes:managerWrites,open:classicLibraryManager.state.open,saves:managerCanvasSaves})),{form:{lib:'one',cat:'workflows',names:['workflow.json']},writes:1,open:false,saves:0});assert.deepEqual(errors,[]);
});
test('Classic manager cached return keeps tab/selections with one listener; permanent departure is final',async t=>{
 const {page,errors}=await manager(t);await page.locator('[data-manager-asset-check="a"]').check();
 await page.evaluate(()=>{classicLibraryManager.bind();classicLibraryManager.bind();window.managerOtherShows=0;window.addEventListener('pageshow',()=>managerOtherShows++);window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));});
 assert.equal(await page.evaluate(()=>classicLibraryManager.state.paused),true);
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await page.waitForFunction(()=>!classicLibraryManager.state.paused);
 assert.deepEqual(await page.evaluate(()=>classicLibraryManager.state.assetIds),['a']);
 await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}));classicLibraryManager.bind();openAssetManager();classicLibraryManager.destroy();window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
 assert.deepEqual(await page.evaluate(()=>({destroyed:classicLibraryManager.state.destroyed,open:classicLibraryManager.state.open,other:managerOtherShows,saves:managerCanvasSaves})),{destroyed:true,open:false,other:2,saves:0});assert.deepEqual(errors,[]);
});
