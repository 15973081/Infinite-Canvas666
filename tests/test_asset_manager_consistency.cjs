const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../static/js/asset-manager.js'), 'utf8').replace(/\r\n/g, '\n');
function load(context, names) {
    for (const name of names) {
        const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
        assert.ok(start >= 0, name);
        vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), context);
    }
}

test('upload entry points reset file types after workflow -> local -> asset transitions', async () => {
    const opened = [];
    const context = vm.createContext({suppressClickAfterMarquee:false,handleManagerSelectionClick:()=>false,
        uploadInput:{accept:'', click() { opened.push(this.accept); }}});
    load(context, ['openManagerUpload', 'handleClick']);
    for(const selector of ['[data-workflow-upload]', '[data-localup-upload]', '[data-asset-upload]']) {
        await context.handleClick({target:{closest: value => value === selector ? {} : null}});
    }
    assert.match(opened[0], /json/);
    assert.equal(opened[1], 'image/*,video/*,audio/*');
    assert.equal(opened[2], opened[1]);
});

test('canvas selection updates summary/actions in both directions without replacing detail', () => {
    const summary = {textContent:''}, clear = {disabled:true}, download = {disabled:true};
    const checkbox = {dataset:{canvasAssetCheck:'a'}, checked:false};
    const controls = new Map([[':scope > span', summary], ['[data-canvas-asset-clear-selection]', clear], ['[data-canvas-asset-download-selected]', download]]);
    const context = vm.createContext({selectedCanvasAssetId:'a', selectedCanvasAssetIds:new Set(['a']),
        document:{querySelectorAll: selector => selector.includes('check') ? [checkbox] : []},
        root:{querySelector: selector => { assert.equal(selector, '.asset-content .manage-tools'); return {querySelector: value => controls.get(value)}; }}});
    load(context, ['refreshCanvasAssetSelectionOnly']);
    context.refreshCanvasAssetSelectionOnly({detail:false});
    assert.equal(checkbox.checked, true);
    assert.match(summary.textContent, /1 个/);
    assert.equal(download.disabled, false);
    context.selectedCanvasAssetIds.clear();
    context.refreshCanvasAssetSelectionOnly({detail:false});
    assert.equal(checkbox.checked, false);
    assert.match(summary.textContent, /0 个/);
    assert.equal(clear.disabled, true);
    assert.equal(download.disabled, true);
});

test('virtual geometry follows width even when column count does not change', () => {
    const context = vm.createContext({getComputedStyle:()=>({gridTemplateColumns:'152px 152px 152px 152px 152px',rowGap:'10px',columnGap:'10px'})});
    load(context, ['assetVirtualMetrics', 'assetAnchorScrollTop']);
    const grid = {clientWidth:800,getBoundingClientRect:()=>({top:112})};
    const scroll = {kind:'element',viewportTop:100,top:0};
    const before = context.assetVirtualMetrics(grid,scroll);
    grid.clientWidth = 820;
    const after = context.assetVirtualMetrics(grid,scroll);
    assert.equal(after.columns,5);
    assert.equal(after.rowStride-before.rowStride,4);
    assert.equal(after.cardHeight,204);
    const items = Array.from({length:1000},(_,i)=>({id:String(i)}));
    const snapshot = {anchorId:'334',anchorOffset:-20,top:14000};
    assert.equal(context.assetAnchorScrollTop(snapshot,items,after),12+67*214+20);
    items.unshift(...Array.from({length:50},(_,i)=>({id:`new-${i}`})));
    assert.equal(context.assetAnchorScrollTop(snapshot,items,after),12+77*214+20);
    assert.equal(context.assetAnchorScrollTop({...snapshot,anchorId:'removed'},items,after),14000);
});

test('view memories isolate tab/category/search/sort, bound history and remember last category per library', () => {
    let stored;
    const context=vm.createContext({activeTab:'assets',activeAssetLibraryId:'lib',activeAssetCategoryId:'cat2',assetQuery:'',selectedAssetId:'picked',
        managerViews:{tabs:{},views:{},libraries:{},collapsed:{}},MANAGER_VIEW_STORAGE_KEY:'views',sessionStorage:{setItem(_key,value){stored=JSON.parse(value)}}});
    load(context,['managerViewDescriptor','managerViewKey','rememberManagerView','restoreManagerDescriptor']);
    for(let i=0;i<100;i++) context.rememberManagerView({tab:'assets',libraryId:'lib',categoryId:String(i),savedAt:i,top:i*10});
    assert.equal(Object.keys(stored.views).length,80);
    assert.equal(stored.libraries[JSON.stringify(['assets','lib'])],'cat2');
    assert.equal(stored.tabs.assets.selectedId,'picked');
    assert.equal(context.managerViewKey({tab:'assets',query:' AB '}),context.managerViewKey({tab:'assets',query:'ab'}));
    assert.notEqual(context.managerViewKey({tab:'assets',categoryId:'a'}),context.managerViewKey({tab:'local',categoryId:'a'}));
    assert.notEqual(context.managerViewKey({tab:'canvas-assets',sort:'name'}),context.managerViewKey({tab:'canvas-assets',sort:'date'}));
    context.restoreManagerDescriptor({tab:'assets',libraryId:'lib2',categoryId:'cat4',query:'abc',selectedId:'saved'});
    assert.equal(context.activeAssetCategoryId,'cat4');
    assert.equal(context.selectedAssetId,'saved');
});

test('late scroll restoration cannot move a different view; search reset returns to top', () => {
    const frames=[], positions=[];let descriptor={tab:'prompts',libraryId:'a',categoryId:'x',query:''};
    const context=vm.createContext({activeTab:'prompts',managerRestoreToken:0,requestAnimationFrame:fn=>frames.push(fn),
        managerViewDescriptor:()=>descriptor,managerScrollContext:()=>({element:{},kind:'element'}),
        setAssetScrollPosition:(_context,top)=>positions.push(top),root:{querySelector:()=>null},scheduleAssetViewSave(){}});
    load(context,['managerViewKey','restoreManagerView']);
    context.restoreManagerView({top:500});
    descriptor={...descriptor,categoryId:'y'};
    frames.shift()();assert.equal(positions.length,0);
    context.restoreManagerView({top:900},true);
    frames.shift()();assert.deepEqual(positions,[0]);
});

test('selection removes hidden results and select-all replaces previous selection without a full render', () => {
    const selection={prefix:'workflow',key:'workflowCard',checkSelector:'[data-workflow-check]',cardSelector:'[data-workflow-card]',ids:new Set(['hidden','a']),items:[{id:'a'},{id:'b'}],mode:true};
    let updates=0;
    const context=vm.createContext({activeTab:'workflows',managerSelectionContext:()=>selection,refreshManagerSelection:()=>updates++,pendingBatchDelete:''});
    load(context,['pruneManagerSelection','handleManagerSelectionClick']);
    context.pruneManagerSelection();assert.deepEqual([...selection.ids],['a']);
    selection.ids.add('hidden');
    context.handleManagerSelectionClick({closest:s=>s==='[data-workflow-select-all]'?{}:null});
    assert.deepEqual([...selection.ids],['a','b']);assert.equal(updates,1);
    context.handleManagerSelectionClick({closest:s=>s==='[data-workflow-check]'?{}:null});
    assert.equal(updates,1); // checkbox click does not double-toggle before change
    selection.readonly=true;context.pruneManagerSelection();assert.equal(selection.ids.size,0);
});

test('workflow and local upload batch modes expose correct marquee targets', () => {
    const context=vm.createContext({activeTab:'workflows',selectedWorkflowIds:new Set(),currentWorkflowItems:()=>[],workflowManageMode:true,selectedWorkflowId:'',
        selectedLocalUploadIds:new Set(),localUploadItems:()=>[],localUploadManageMode:true,selectedLocalUploadId:''});
    load(context,['managerSelectionContext','marqueeTargetSelector']);
    assert.equal(context.marqueeTargetSelector(),'[data-workflow-card]');
    context.activeTab='local';assert.equal(context.marqueeTargetSelector(),'[data-localup-card]');
    context.localUploadManageMode=false;assert.equal(context.marqueeTargetSelector(),'');
});
