const {test} = require('node:test');
const assert = require('node:assert/strict');
const {fixture} = require('./helpers/canvas-browser.cjs');

async function scenario(page,kind){
    // Finish boot/config refreshes before replacing services and counting panel actions.
    await page.waitForLoadState('networkidle');
    await page.evaluate(async kind=>{
        const libraries=['system','one','two'].map(id=>({id,name:id,readonly:id==='system',
            categories:[{id:'view',name:'View'},{id:'custom',name:'Custom'}],items:[
                {id:id+'-a',name:'Alpha',positive:'alpha text',category:'view',negative:'negative',params:{steps:20}},
                {id:id+'-b',name:'Beta',positive:'beta text',category:'custom'}]}));
        window.CanvasApi.getPromptLibraries=async()=>({library:{libraries:structuredClone(libraries)}});
        nodes=[{id:'p',type:kind==='classic'?'prompt':'smart-prompt',text:'old',x:50,y:50,images:[]},
            {id:'q',type:kind==='classic'?'prompt':'smart-prompt',text:'other',x:500,y:50,images:[]}];
        if(kind==='smart')smartSelection.panelTarget('p');
        else {selectedId='p';selectedIds=[];}
        render();
        const owner=kind==='classic'?classicPromptPanel:smartPromptPanels;
        if(kind==='classic'){canvasPromptTemplatesLoaded=false;await loadCanvasPromptTemplates();}
        else await loadPromptTemplates();
        owner.dataChanged();await owner.selectLibrary('one');
        window.promptTest={owner,libraries,kind,saves:0,renders:0,
            snapshot:()=>({library:{libraries:structuredClone(libraries)}})};
        scheduleSave=()=>promptTest.saves++;
        const original=render;render=(...args)=>{promptTest.renders++;return original(...args);};
        await owner.open('p');
    },kind);
}

test('classic canvas keeps its prompt library in the manager after retiring the standalone template panel',async t=>{
    const {page,errors}=await fixture(t,'classic',false);
    await scenario(page,'classic');
    assert.equal(await page.locator('#promptTemplatePanel,#promptTemplateSearch').count(),0);
    await page.evaluate(async()=>{await openAssetManager();selectClassicAssetManagerTab('prompts');});
    await page.locator('[data-manager-prompt-check="one-a"]').waitFor();
    assert.deepEqual(errors,[]);
});

test('classic: manager library selection uses the same command, clears only its multi-selection and retains cached loading',async t=>{
    const {page,errors}=await fixture(t,'classic',false);await scenario(page,'classic');
    const result=await page.evaluate(async()=>{
        const {owner}=promptTest;owner.selectCategory('view');let loads=0;
        window.CanvasApi.getPromptLibraries=async()=>{loads++;return promptTest.snapshot();};
        canvasAssetLibrary={libraries:[{id:'assets-one',categories:[{id:'assets-cat',items:[{id:'asset-kept',name:'kept',url:'/test-image.svg'}]}]}]};
        classicAssetPanel.selectLibrary('assets-one',{source:'manager-assets'});selectClassicAssetManagerTab('assets');
        const assetCheck=document.querySelector('[data-manager-asset-check="asset-kept"]');assetCheck.checked=true;assetCheck.dispatchEvent(new Event('change',{bubbles:true}));
        selectClassicAssetManagerTab('prompts');
        const promptCheck=document.querySelector('[data-manager-prompt-check="one-a"]');promptCheck.checked=true;promptCheck.dispatchEvent(new Event('change',{bubbles:true}));
        document.querySelector('[data-manager-prompt-lib="two"]').click();
        const state=[owner.state.libraryId,owner.state.categoryId,owner.state.itemId];
        owner.close();await owner.open('p');
        return {state,selected:classicLibraryManager.state.promptIds.length,assets:classicLibraryManager.state.assetIds.length,loads};
    });
    assert.deepEqual(result,{state:['two','view','two-a'],selected:0,assets:1,loads:0});assert.deepEqual(errors,[]);
});
