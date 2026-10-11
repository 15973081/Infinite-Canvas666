const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../static/js/canvas-directory-model.js');
const frozen=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;};
const records=()=>[{id:'a',title:'ＡLPHA 10',folder_id:'one',updated_at:10},
    {id:'b',title:'alpha 2',folder_id:'one',pinned:true,created_at:5},
    {id:'c',title:'Beta',folder_id:'child',updated_at:20,kind:'smart',icon:'✨',owner:' X ',color:' red ',cover_style:'sage'},
    {id:'d',title:'Other',folder_id:'',updated_at:4}];
function input(more={}){return {canvases:records(),deletedCanvases:[{id:'old',title:'Removed',folder_id:'missing',pinned:true}],
    folders:[{id:'child',parent_id:'one',name:'Child'},{id:'one',name:'One'}],folderId:'all',query:'',trashMode:false,canvasId:'c',...more};}
test('filter retains folder, NFKC, locale, search and trash differences without mutating records',()=>{
    const data=frozen(input({folderId:'one',query:'ａｌＰＨＡ'})),before=JSON.stringify(data);
    assert.deepEqual(model.build(data).items.map(x=>x.id),['a','b']);
    assert.deepEqual(model.build({...data,folderId:''}).items,[]);
    assert.deepEqual(model.build({...data,trashMode:true,query:'removed'}).items.map(x=>x.id),['old']);assert.equal(JSON.stringify(data),before);
});
test('pin-first comparison preserves numeric names, tie dates and missing timestamps',()=>{
    const data=frozen(records()),before=JSON.stringify(data);
    assert.deepEqual([...data].sort((a,b)=>model.compareRecords(a,b,'recent')).map(x=>x.id),['b','c','a','d']);
    assert.deepEqual([...data].sort((a,b)=>model.compareRecords(a,b,'name')).map(x=>x.id),['b','a','c','d']);
    assert.equal(model.compareRecords({title:'a',created_at:4},{title:'a',updated_at:6},'name'),2);
    assert.equal(model.compareRecords({}, {}, 'recent'),0);assert.equal(JSON.stringify(data),before);
    assert.ok(model.compareRecords({title:'Test 2'},{title:'Test 10'},'name')<0);
});
test('folder counts are unfiltered and children preserve order/numeric names with immutable derived arrays',()=>{
    const data=frozen(input({query:'beta',folders:[{id:'z',name:'Root 10',order:1},{id:'a',name:'Root 2',order:1},{id:'child',parent_id:'one',name:'Child'}]}));
    const view=model.build(data);assert.equal(view.count('all'),4);assert.equal(view.count('one'),2);assert.equal(view.count(''),1);
    assert.deepEqual(view.children('').map(x=>x.id),['a','z']);assert.deepEqual(view.children('one').map(x=>x.id),['child']);
    assert.equal(view.folderLabel('all'),'全部画布');assert.equal(view.folderLabel(''),'未分类');assert.equal(view.folderLabel('missing'),'文件夹');
    assert.ok(Object.isFrozen(view.children('')));assert.ok(Object.isFrozen(view.children('missing')));
});
test('presentation fields preserve type/icon/color/cover rules and trash disables pin',()=>{
    const view=model.build(frozen(input())),smart=view.rows[2];
    assert.deepEqual([smart.isSmartCanvas,smart.icon,smart.color,smart.owner,smart.coverStyle,smart.active],[true,'sparkles','red','X','sage',true]);
    assert.equal(view.rows[0].coverStyle,'type');assert.equal(model.build(input({trashMode:true})).rows[0].pinned,false);
    assert.ok(Object.isFrozen(view));assert.ok(Object.isFrozen(view.rows));assert.ok(Object.isFrozen(smart));assert.ok(Object.isFrozen(view.items));
});
test('empty descriptions preserve search precedence and count snapshot is consistent after data changes',()=>{
    const data=input({canvases:[]});assert.equal(model.build(data).emptyKind,'empty');
    assert.equal(model.build({...data,trashMode:true}).emptyKind,'trash');assert.equal(model.build({...data,query:' x ',trashMode:true}).emptyKind,'search');
    const view=model.build(data);data.canvases.push({id:'new'});assert.equal(view.count('all'),0);assert.equal(view.items.length,0);
});
test('normalization retains existing legal identifiers without a DOM environment',()=>{
    assert.equal(model.normalizeFolderId(' f/o-1_中 '),'fo-1_');assert.equal(model.normalizeFolderId(null),'');
});
test('standalone legacy queries preserve hierarchy and bounded parent-cycle depth',()=>{
    const data=frozen(input());assert.equal(model.countInFolder(data.canvases,'one'),2);
    assert.deepEqual(model.folderChildren(data.folders,'one').map(x=>x.id),['child']);
    assert.equal(model.folderDepth(data.folders,'child'),1);assert.equal(model.folderLabel(data.folders,'one'),'One');
    assert.equal(model.folderDepth(frozen([{id:'a',parent_id:'b'},{id:'b',parent_id:'a'}]),'a'),2);
});
