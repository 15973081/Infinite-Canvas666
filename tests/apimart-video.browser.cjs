const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');
const {execFileSync}=require('node:child_process');

// Use the production member projection rather than a full administrator config.
function memberConfig(){
    return JSON.parse(execFileSync('python',['-c',`
import json
from app.providers import registry
from app.services.member_gateway import public_provider_config
registry.load_api_providers = lambda: [{
    'id':'gateway-custom', 'name':'APIMART', 'protocol':'apimart',
    'base_url':'https://private-proxy.invalid', 'api_key':'must-not-leak',
    'has_key':True, 'enabled':True,
    'video_models':['MiniMax-H3-Max','MiniMax-H3'],
    'model_policies':{
        'video:MiniMax-H3-Max':{'resolutions':['480p','768p','1080p'],'duration_min':5,'duration_max':15},
        'video:MiniMax-H3':{'resolutions':['2k','768p'],'duration_min':4,'duration_max':15}
    }
}]
print(json.dumps(public_provider_config()))
`],{encoding:'utf8'}));
}

for(const kind of ['classic','smart'])test(`${kind} member dropdown includes 768P from the real public config`,async t=>{
    const config=memberConfig();
    assert.ok(!JSON.stringify(config).includes('must-not-leak'));
    assert.equal(config.api_providers[0].protocol,undefined);
    assert.equal(config.api_providers[0].base_url,undefined);
    const {page,errors}=await fixture(t,kind,true,{config});
    for(const [model,expected] of [['MiniMax-H3-Max',['768P','480P','1080P']],['MiniMax-H3',['2K','768P']]]){
        const labels=await page.evaluate(({kind,model})=>{
            const host=document.querySelector('#resolution-regression') || document.body.appendChild(Object.assign(document.createElement('div'),{id:'resolution-regression'}));
            if(kind==='classic'){
                const node={id:'regression-video',type:'video',apiProvider:'gateway-custom',model,duration:5,resolution:'',aspectRatio:'16:9',inputs:[]};
                normalizeVideoNodeSelection(node);
                host.replaceChildren(renderVideoBody(node));
                return [...host.querySelector('.video-resolution').options].map(option=>option.textContent);
            }
            Object.assign(settings,{videoProvider:'gateway-custom',videoModel:model,videoResolution:'',videoDuration:5});
            host.innerHTML=renderVideoResolutionControl();
            return [...host.querySelectorAll('[data-smart-param="videoResolution"]')].map(button=>button.textContent.trim());
        },{kind,model});
        assert.deepEqual(labels,expected);
    }
    assert.deepEqual(errors,[]);
});

for(const kind of ['classic','smart'])test(`${kind} canvas scopes H3 capabilities to APIMart`,async t=>{
    const {page,errors}=await fixture(t,kind,false);
    const result=await page.evaluate(kind=>{
        apiProviders.splice(0,apiProviders.length,{id:'h3-test',protocol:'apimart',has_key:true,enabled:true,
            video_models:['MiniMax-H3','MiniMax-H3-Max'],image_models:[]});
        const results=[];
        for(const model of ['MiniMax-H3','MiniMax-H3-Max']){
            if(kind==='classic'){
                const node={apiProvider:'h3-test',model,duration:60,resolution:'1080p'};
                normalizeVideoNodeSelection(node);
                results.push({resolutions:allowedVideoResolutions(node),duration:node.duration,resolution:node.resolution});
            }else{
                Object.assign(settings,{videoProvider:'h3-test',videoModel:model,videoDuration:60,videoResolution:'1080p'});
                const resolutions=normalizeSmartVideoResolution();
                results.push({resolutions,duration:VideoDurationPolicy.clamp(settings.videoDuration,smartVideoDurationRange()),resolution:settings.videoResolution,
                    html:renderVideoAdvancedControl(true)});
            }
        }
        return results;
    },kind);
    assert.deepEqual(result[0].resolutions,['2k','768p']);
    assert.deepEqual(result[1].resolutions,['768p','480p','1080p']);
    assert.equal(result[0].duration,15);assert.equal(result[1].duration,15);
    assert.equal(result[0].resolution,'2k');assert.equal(result[1].resolution,'1080p');
    if(kind==='smart'){
        assert.ok(result[0].html.includes('videoWatermark'));
        assert.ok(result[1].html.includes('videoUseFrameRoles'));
        assert.ok(!result[1].html.includes('videoWatermark'));
        assert.ok(!result[1].html.includes('videoGenerateAudio'));
    }
    const isolated=await page.evaluate(kind=>{
        const observations=[];
        for(const base_url of ['https://api.minimax.io','https://other.invalid','https://other.invalid/apimart.ai']){
            Object.assign(apiProviders[0],{protocol:'openai',base_url});
            for(const model of ['MiniMax-H3','MiniMax-H3-Max']){
                if(kind==='classic'){
                    const node={apiProvider:'h3-test',model,duration:30,resolution:'720p'};
                    normalizeVideoNodeSelection(node);
                    observations.push({resolutions:allowedVideoResolutions(node),duration:node.duration,resolution:node.resolution});
                }else{
                    Object.assign(settings,{videoProvider:'h3-test',videoModel:model,videoDuration:30,videoResolution:'720p'});
                    observations.push({resolutions:normalizeSmartVideoResolution(),duration:VideoDurationPolicy.clamp(settings.videoDuration,smartVideoDurationRange()),resolution:settings.videoResolution,
                        html:renderVideoAdvancedControl(true)});
                }
            }
        }
        return observations;
    },kind);
    for(const value of isolated){
        assert.ok(value.resolutions.includes('720p'));
        assert.ok(!value.resolutions.includes('768p'));
        assert.ok(!value.resolutions.includes('2k'));
        assert.equal(value.resolution,'720p');
        assert.equal(value.duration,30);
        if(kind==='smart')assert.ok(value.html.includes('videoGenerateAudio'));
    }
    assert.deepEqual(errors,[]);
});
