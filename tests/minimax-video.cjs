const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const policy=require('../static/js/video-duration-policy.js');

function fixture(model,rule={}){
    const provider={id:'p',protocol:'apimart',video_models:[model],model_policies:{['video:'+model]:rule}};
    const window={VideoDurationPolicy:policy};
    const context=vm.createContext({window,apiProviders:[provider],isSeedance20VideoModel:()=>false,isVolcengineSeedance25VideoNode:()=>false});
    vm.runInContext(fs.readFileSync('static/js/canvas-core.js','utf8'),context);
    for(const [path,name] of [['classic/canvas-execution.js','allowedVideoResolutions'],['smart/smart-execution.js','smartVideoResolutions']]){
        const source=fs.readFileSync('static/js/canvas/'+path,'utf8');
        const start=source.indexOf('function '+name+'('),end=source.indexOf('\n}',start)+2;
        vm.runInContext(source.slice(start,end),context);
    }
    return {provider,context};
}

test('both canvases show exact H3 and Max tiers, respecting platform restrictions',()=>{
    for(const [model,expected] of [['MiniMax-H3',['2k','768p']],['MiniMax-H3-Max',['768p','480p','1080p']]]){
        const {context}=fixture(model);
        assert.deepEqual(Array.from(context.allowedVideoResolutions({model,apiProvider:'p'})),expected);
        assert.deepEqual(Array.from(context.smartVideoResolutions({videoModel:model,videoProvider:'p'})),expected);
        const limited=fixture(model,{resolutions:['768p']});
        assert.deepEqual(Array.from(limited.context.allowedVideoResolutions({model,apiProvider:'p'})),['768p']);
    }
});

test('model duration limits intersect administrator rules and exclude impossible models',()=>{
    for(const [model,min] of [['MiniMax-H3',4],['MiniMax-H3-Max',5]]){
        const {provider}=fixture(model);
        assert.equal(policy.bounds(provider,model).min,min);
        assert.equal(policy.bounds(provider,model).max,15);
        assert.equal(policy.clamp(60,policy.bounds(provider,model)),15);
        const limited=fixture(model,{duration_min:7,duration_max:30});
        assert.equal(policy.bounds(limited.provider,model).min,7);
        assert.equal(policy.bounds(limited.provider,model).max,15);
        const unavailable=fixture(model,{duration_min:20,duration_max:30});
        assert.deepEqual(Array.from(unavailable.context.smartVideoResolutions({videoModel:model,videoProvider:'p'})),[]);
    }
});

test('other providers and other models keep their original choices',()=>{
    assert.equal(policy.minimax({protocol:'openai',base_url:'https://other.invalid'},'MiniMax-H3'),null);
    assert.equal(policy.minimax({protocol:'apimart'},'doubao-seedance-2.0'),null);
    assert.equal(policy.minimax({base_url:'https://api.apimart.ai'},'minimax-h3-max').min,5);
});
