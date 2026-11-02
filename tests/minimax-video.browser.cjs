const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');

for(const kind of ['classic','smart'])test(`${kind} canvas loads H3 capabilities and switches to Max`,async t=>{
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
    assert.deepEqual(errors,[]);
});
