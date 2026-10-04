const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../static/js/canvas-core.js'),'utf8');
function fixture(){
    const target=new EventTarget(), classes=new Set(), input={value:''}, timers=new Map();
    target.classList={toggle:(name,value)=>value?classes.add(name):classes.delete(name)};
    let next=0, cleanups=0;
    const context={window:{},document:{getElementById:id=>id==='assetNameSearch'?input:target},
        setTimeout:fn=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id)};
    vm.runInNewContext(source,context);
    const panel=context.window.CanvasCore.createAssetPanelController({ids:['assetPanel','assetToggle','assetNameSearch'],onDestroy:()=>cleanups++});
    return {panel,target,classes,input,timers,cleanups:()=>cleanups};
}
test('panel commands own immutable state and keep input/open projections synchronized',()=>{
    const {panel,classes,input}=fixture(), before=panel.state;
    panel.setOpen(true);panel.selectLibrary('library');panel.selectCategory('images');panel.selectTarget({workflowCategoryId:'flows'});
    panel.setQuery('  中文 Cat ');panel.selectTab('workflow');
    assert.equal(before.open,false);
    assert.equal(panel.state.libraryId,'library');assert.equal(panel.state.categoryId,'images');
    assert.equal(panel.state.workflowCategoryId,'flows');assert.equal(panel.state.tab,'workflow');
    assert.equal(input.value,'  中文 Cat ');assert.equal(panel.state.query,input.value);
    assert.equal(classes.has('open'),true);assert.equal(classes.has('active'),true);
    assert.equal(Reflect.set(panel.state,'open',false),false);
    panel.setOpen(false);assert.equal(classes.has('open'),false);
    const resize={startX:4};panel.setResize(resize);resize.startX=8;
    assert.equal(panel.state.resize.startX,4);assert.ok(Object.isFrozen(panel.state.resize));
});
test('rebinding, replacing cards and destroying remove listeners and coalesced refreshes',()=>{
    const {panel,target,timers,cleanups}=fixture();let clicks=0,cards=0,refreshes=0;
    for(let i=0;i<5;i++)panel.events('controls').on(target,'click',()=>clicks++);
    panel.events('cards').on(target,'click',()=>cards++);
    const editor=panel.events('cards:rename:item');editor.on(target,'input',()=>cards++);
    target.dispatchEvent(new Event('click'));assert.equal(clicks,1);assert.equal(cards,1);
    panel.clearEvents('cards');target.dispatchEvent(new Event('click'));assert.equal(cards,1);
    editor.on(target,'input',()=>cards++);target.dispatchEvent(new Event('input'));assert.equal(cards,1);
    panel.scheduleRefresh(()=>refreshes++,120);panel.scheduleRefresh(()=>refreshes++,120);assert.equal(timers.size,1);
    panel.destroy();panel.destroy();assert.equal(cleanups(),1);assert.equal(timers.size,0);
    assert.equal(Object.keys(panel.elements).length,0);
    target.dispatchEvent(new Event('click'));assert.equal(clicks,2);
    panel.selectLibrary('late');panel.scheduleRefresh(()=>refreshes++,120);
    assert.equal(panel.state.libraryId,'');assert.equal(refreshes,0);assert.equal(timers.size,0);
});
test('entry/workspace/document modules never keep or mutate panel DOM and old UI globals are gone',()=>{
    const root=path.join(__dirname,'../static/js');
    for(const [kind,entry,prefix,old] of [
        ['classic','canvas','classicAssetPanel','canvasAssetLibraryOpen|activeCanvasAssetLibraryId|activeCanvasAssetCategoryId|canvasAssetSearchQuery'],
        ['smart','smart-canvas','smartAssetPanel','assetLibraryOpen|activeAssetLibraryId|activeAssetCategoryId|activeWorkflowAssetCategoryId|assetNameSearchQuery|assetTab']]){
        const files=[path.join(root,entry+'.js'),...fs.readdirSync(path.join(root,'canvas',kind)).map(file=>path.join(root,'canvas',kind,file))];
        for(const file of files){
            const text=fs.readFileSync(file,'utf8');
            assert.doesNotMatch(text,new RegExp(`\\b(?:let|const|var) (?:${old})\\b`),file);
            assert.doesNotMatch(text,new RegExp(`${prefix}\\.state\\.\\w+\\s*=(?!=)`),file);
            if(!file.endsWith('-library.js'))assert.ok(!text.includes(prefix+'.elements'),file);
        }
    }
});

test('failed writes still invalidate reads; later retry is admissible and submitted writes complete after disposal',async()=>{
    const {panel}=fixture();let reject;
    const first=panel.beginRead();
    const failed=panel.mutate(()=>new Promise((_,fail)=>reject=fail));
    const during=panel.beginRead();
    assert.equal(panel.acceptsRead(first),false);assert.equal(panel.acceptsRead(during),false);
    reject(new Error('offline'));await assert.rejects(failed,/offline/);
    assert.equal(panel.acceptsRead(during),false);
    assert.equal(panel.acceptsRead(panel.beginRead()),true);
    const origin=panel.captureSelection();panel.selectLibrary('B');panel.selectLibrary('');
    panel.selectTarget({libraryId:'old',categoryId:'created'},{expected:origin});
    assert.equal(panel.state.libraryId,'');
    let resolve;const saved=panel.mutate(()=>new Promise(done=>resolve=done));panel.destroy();
    resolve({item:{id:'saved'}});assert.deepEqual(await saved,{item:{id:'saved'}});
    assert.equal(panel.acceptsRead(panel.beginRead()),false);
});
