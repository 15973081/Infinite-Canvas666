const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const policy=require('../static/js/video-duration-policy.js');
const apimart=require('../static/js/apimart-video-policy.js');

test('Kling model tiers, frame ordering and edit duration work on both canvases',()=>{
    for(const [model,max,resolutions] of [['kling-v4',30,['720p','1080p']],['kling-v4-flash',20,['720p']]]){
        const {provider,context}=fixture(model);
        assert.deepEqual(Array.from(context.allowedVideoResolutions({model,apiProvider:'p'})),resolutions);
        assert.deepEqual(Array.from(context.smartVideoResolutions({videoModel:model,videoProvider:'p'})),resolutions);
        assert.equal(policy.bounds(provider,model).min,3);
        assert.equal(policy.bounds(provider,model).max,max);
        assert.equal(apimart.durationBounds(provider,model,'edit').auto,true);
        assert.equal(apimart.durationBounds(provider,model,'extend').auto,false);
        assert.equal(apimart.kling({protocol:'openai',base_url:'https://elsewhere.invalid'},model),false);
    }
    const images=Array.from({length:10},(_,i)=>({url:`https://example.invalid/${i}.png`}));
    assert.deepEqual(apimart.imageRoles(images,'image').map(i=>i.role),['first_frame',...Array(8).fill('keyframe'),'last_frame']);
    assert.ok(apimart.imageRoles(images,'reference').every(i=>i.role==='reference_image'));
    assert.equal(apimart.imageRoles(images.slice(0,1),'extend')[0].role,'last_frame');
    assert.equal(apimart.canOmitPrompt('image',false,images),true);
    assert.equal(apimart.canOmitPrompt('reference',false,images),false);
    assert.equal(apimart.canOmitPrompt('image',false,images,['video']),false);
});

function fixture(model,rule={}){
    const provider={id:'p',protocol:'apimart',video_models:[model],model_policies:{['video:'+model]:rule}};
    const window={VideoDurationPolicy:policy,ApimartVideoPolicy:apimart};
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
    assert.equal(apimart.capabilities({protocol:'openai',base_url:'https://other.invalid'},'MiniMax-H3'),null);
    assert.equal(apimart.capabilities({protocol:'apimart'},'doubao-seedance-2.0'),null);
    assert.equal(apimart.capabilities({base_url:'https://api.apimart.ai'},'minimax-h3-max').min,5);
});

test('same model names on official or other gateways keep their own limits',()=>{
    for(const base_url of ['https://api.minimax.io','https://other.invalid','https://apimart.ai.other.invalid','https://other.invalid/apimart.ai','https://other.invalid?upstream=apimart.ai']){
        const provider={protocol:'openai',base_url};
        for(const model of ['MiniMax-H3','MiniMax-H3-Max']){
            assert.equal(apimart.capabilities(provider,model),null);
            assert.equal(policy.bounds(provider,model).max,60);
            const configured={...provider,model_policies:{['video:'+model]:{duration_min:2,duration_max:30}}};
            assert.equal(policy.bounds(configured,model).min,2);
            assert.equal(policy.bounds(configured,model).max,30);
        }
    }
});

test('member adapter metadata works without publishing protocol or endpoint',()=>{
    const member={id:'custom-platform',video_adapter:'apimart'};
    assert.deepEqual(apimart.capabilities(member,'MiniMax-H3-Max').resolutions,['768p','480p','1080p']);
    assert.equal(policy.bounds(member,'MiniMax-H3-Max').min,5);
    assert.equal(apimart.capabilities({video_adapter:''},'MiniMax-H3-Max'),null);
});
