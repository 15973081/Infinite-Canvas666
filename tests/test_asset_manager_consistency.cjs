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
        setAssetScrollPosition:(_context,top)=>positions.push(top),root:{querySelector:()=>null},scheduleAssetViewSave(){},renderManagerVirtualWindow(){}});
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

test('grouped virtual layout keeps headings, indexes anchors and bounds a 1000-item viewport', () => {
    const context=vm.createContext({});load(context,['buildManagerVirtualRows','managerVisibleRows']);
    const groups=Array.from({length:4},(_,g)=>({key:String(g),title:`Group ${g}`,items:Array.from({length:250},(_,i)=>({id:`${g}-${i}`}))}));
    const layout=context.buildManagerVirtualRows(groups,5,200,10);
    assert.equal(layout.rows.filter(row=>row.cells[0].group).length,4);
    assert.equal(layout.offsets.get('0-0'),74);
    assert.equal(layout.offsets.get('1-0'),74+50*210+74);
    const [start,end]=context.managerVisibleRows(layout.rows,20000,700,630);
    assert.ok(start>0);assert.ok(end-start<=12);
    assert.ok(layout.rows.slice(start,end).flatMap(row=>row.cells).length<=60);
});

test('filter cache reuses results during scrolling and invalidates for source/query/render changes', () => {
    const context=vm.createContext({managerItemCache:new Map()});load(context,['cachedManagerItems']);
    let calls=0;const source=[];const compute=()=>{calls++;return ['result']};
    const first=context.cachedManagerItems('assets',source,'q',compute);
    for(let i=0;i<100;i++) assert.equal(context.cachedManagerItems('assets',source,'q',compute),first);
    assert.equal(calls,1);
    context.cachedManagerItems('assets',source,'other',compute);
    context.cachedManagerItems('assets',[],'other',compute);
    context.managerItemCache.clear();context.cachedManagerItems('assets',source,'other',compute);
    assert.equal(calls,4);
});

test('virtual patch retains overlapping media nodes and removes offscreen nodes', () => {
    class Node {
        constructor(){this.dataset={};this.children=[];}
        get firstElementChild(){return this.children[0] || null;}
        get nextElementSibling(){return this.parent?.children[this.parent.children.indexOf(this)+1] || null;}
        remove(){if(this.parent){const p=this.parent;p.children.splice(p.children.indexOf(this),1);this.parent=null;}}
        insertBefore(node,before){node.remove();let index=before?this.children.indexOf(before):this.children.length;assert.ok(index>=0);this.children.splice(index,0,node);node.parent=this;}
    }
    const grid=new Node();let created=0;
    const context=vm.createContext({document:{createElement(){return {set innerHTML(value){created++;this.content={firstElementChild:new Node()};}}}}});
    load(context,['patchVirtualGrid']);
    const a={},b={},c={},d={};const cell=(key,item)=>({key,item,html:'<article></article>'});
    context.patchVirtualGrid(grid,[cell('a',a),cell('b',b),cell('c',c)],0,100);
    const oldB=grid.children[1],oldC=grid.children[2];
    context.patchVirtualGrid(grid,[cell('b',b),cell('c',c),cell('d',d)],100,0);
    assert.equal(grid.children[1],oldB);assert.equal(grid.children[2],oldC);
    assert.deepEqual(grid.children.map(n=>n.dataset.managerCellKey),['__top__','b','c','d']);
    assert.equal(created,6);
});

test('stale refresh completion never renders or reports success in a newer tab', async () => {
    let resolve;const pending=new Promise(r=>resolve=r);const status=[];let renders=0;
    const context=vm.createContext({activeTab:'assets',managerTabSwitchToken:0,refreshBtn:{disabled:false},
        setStatus:value=>status.push(value),loadManagerData:()=>pending,render:()=>renders++,resumeAvatarPolls(){}});
    load(context,['managerTabLabel','refreshCurrentManager']);
    const refresh=context.refreshCurrentManager();
    context.activeTab='prompts';context.managerTabSwitchToken++;context.refreshBtn.disabled=false;
    resolve();await refresh;
    assert.equal(renders,0);assert.equal(status.length,1);assert.equal(context.refreshBtn.disabled,false);
});

test('local loading failure preserves data and propagates to the retry UI', async () => {
    const old=[{id:'old'}];const tree={path:''};
    const context=vm.createContext({localAssets:old,localUploadTree:tree,apiJson:async()=>{throw Error('offline')}});
    load(context,['loadLocalAssets']);
    await assert.rejects(context.loadLocalAssets(),/offline/);
    assert.equal(context.localAssets,old);assert.equal(context.localUploadTree,tree);
});

test('batch delete confirms the exact view and selected IDs, and supports cancellation and failure recovery', async () => {
    let calls=0;const context=vm.createContext({managerDeleteConfirmation:'',managerDeleteBusy:false,pendingBatchDelete:'',
        managerViewDescriptor:()=>({tab:'assets',categoryId:'a'}),root:{querySelector:()=>null},setStatus(){}});
    load(context,['managerViewKey','managerTabLabel','cancelManagerDelete','confirmManagerBatchDelete']);
    const action=async()=>calls++;
    await context.confirmManagerBatchDelete('assets',['a'],action);assert.equal(calls,0);
    await context.confirmManagerBatchDelete('assets',['b'],action);assert.equal(calls,0);
    await context.confirmManagerBatchDelete('assets',['b'],action);assert.equal(calls,1);
    await context.confirmManagerBatchDelete('assets',['a'],action);context.cancelManagerDelete();
    await context.confirmManagerBatchDelete('assets',['a'],action);assert.equal(calls,1);
    await assert.rejects(context.confirmManagerBatchDelete('assets',['a'],async()=>{throw Error('failed')}),/failed/);
    assert.equal(context.managerDeleteBusy,false);assert.equal(context.managerDeleteConfirmation,'');
});
