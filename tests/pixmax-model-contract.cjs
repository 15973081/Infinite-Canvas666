const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'static/js/pixmax-model-contract.js'),'utf8'),context);
const contract=context.window.PixmaxModelContract,definitions=JSON.parse(fs.readFileSync(path.join(root,'static/vendor/pixmax/generation-schema.json'),'utf8')).models;
const copy=value=>JSON.parse(JSON.stringify(value));
const model=code=>definitions.find(item=>item.modelCode===code);
const refs=(kind,count)=>Array.from({length:count},(_,index)=>({id:kind+index,kind}));

test('all 39 frozen models resolve by exact public code and display name within their generation kind',()=>{
    assert.equal(definitions.length,39);assert.equal(new Set(definitions.map(item=>item.modelCode)).size,39);
    for(const definition of definitions){
        const kind=definition.nodeType==='GENERATE_IMAGE'?'image':'video';
        assert.equal(contract.resolve(definitions,kind,definition.modelCode),definition);
        assert.equal(contract.resolve(definitions,kind,definition.modelName),definition);
        assert.equal(contract.resolve(definitions,kind==='image'?'video':'image',definition.modelCode),undefined);
        assert.ok(definition.inputConstraints.length>0,definition.modelCode);
        assert.equal(contract.connections(definition).length,definition.inputConstraints.length);
    }
});
test('dated Seedance and Seedream API names preserve exact variants and reject unknown suffixes',()=>{
    const cases={
        'doubao-seedance-2-5-pro-260128':'PIXDANCE_2_5',
        'Seedance 2.5 Draft':'PIXDANCE_2_5_DRAFT',
        'doubao-seedance-2.5-draft-20261001':'PIXDANCE_2_5_DRAFT',
        'doubao-seedance-2-0-fast-260128':'PIXDANCE_2_FAST',
        'doubao-seedance-2-0-mini':'PIXDANCE_2_MINI',
        'doubao-seedance-1-5-pro-251215':'SEEDANCE_1_5',
        'doubao-seedream-5-0-lite-260128':'JIMENG_5_LITE',
        'doubao-seedream-5-0-pro':'DOUBAO_SEEDREAM_5_PRO',
        'doubao-seedream-4-5-251128':'DOUBAO_SEEDREAM_4_5'
    };
    for(const [name,code] of Object.entries(cases))assert.equal(contract.resolve(definitions,code.includes('SEEDREAM')||code==='JIMENG_5_LITE'?'image':'video',name)?.modelCode,code,name);
    for(const name of ['my-seedance-2-5-pro','seedance-2-5-ultra','seedance-2-0-faster','seedance-2-5-pro-future','seedream-4-5-lite','seedream-5-1-pro','gpt-image-2']){
        assert.equal(contract.resolve(definitions,'video',name),undefined,name);assert.equal(contract.resolve(definitions,'image',name),undefined,name);
    }
});
test('Qwen editing enforces its minimum and maximum images and marks the contributing cards',()=>{
    const definition=model('QWEN_IMAGE_EDIT_PLUS');
    assert.equal(contract.inputIssues(definition,[])[0].actual,0);
    assert.deepEqual(copy(contract.inputIssues(definition,refs('image',3))),[]);
    const issue=contract.inputIssues(definition,refs('image',4))[0];
    assert.deepEqual(copy(issue.sourceIds),['image0','image1','image2','image3']);assert.deepEqual(copy(issue.expected),{min:1,max:3});
    assert.equal(contract.inputIssues(definition,[...refs('image',1),...refs('audio',1)])[0].actual,1);
});
test('Wan 2.6 applies the combined image/video ceiling as well as individual ceilings',()=>{
    const definition=model('WAN2_6');assert.equal(contract.inputIssues(definition,[...refs('image',3),...refs('video',2)]).length,0);
    const issues=contract.inputIssues(definition,[...refs('image',3),...refs('video',3)]);
    assert.equal(issues.length,1);assert.equal(issues[0].actual,6);assert.equal(issues[0].expected.max,5);assert.equal(issues[0].sourceIds.length,6);
});
test('generated storyboard frames count as images and mixed source types keep separate limits',()=>{
    const resources=[...refs('image',30).map(entry=>({...entry,sourceType:'GENERATE_STORYBOARD'})),...refs('video',10),...refs('audio',10)];
    assert.equal(contract.inputIssues(model('PIXDANCE_2_5'),resources).length,0);
    assert.ok(contract.inputIssues(model('PIXDANCE_2_5'),[...resources,...refs('audio',1)]).some(issue=>issue.expected.max===10&&issue.actual===11));
    assert.equal(contract.inputIssues(model('MINIMAX_IMAGE_01'),refs('image',1))[0].expected.max,0);
});
test('all model constraint boundaries match the frozen source without mutating it',()=>{
    const before=JSON.stringify(definitions);
    for(const definition of definitions)for(const rule of definition.inputConstraints){
        const range=contract.bounds(rule.length);assert.ok(range,definition.modelCode);
        const input=Array.from({length:range.max+1},(_,index)=>({id:String(index),kind:'image',sourceType:rule.codes[0]}));
        assert.ok(contract.inputIssues(definition,input).some(issue=>issue.actual===range.max+1&&issue.expected.max===range.max),definition.modelCode);
    }
    assert.equal(JSON.stringify(definitions),before);
    assert.deepEqual(copy(contract.inputIssues(undefined,refs('image',100))),[]);
    assert.equal(contract.bounds('[-1,20]'),null);assert.equal(contract.bounds('[9,2]'),null);
});
