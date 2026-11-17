/* APIMart gateway capabilities from its docs; not MiniMax official API limits. */
(function(root){
    const models={
        'kling-v4':{model:'kling-v4',family:'kling',min:3,max:30,resolutions:['720p','1080p'],omitWatermarkAt:['720p','1080p'],keyframes:true},
        'kling-v4-flash':{model:'kling-v4-flash',family:'kling',min:3,max:20,resolutions:['720p'],omitWatermarkAt:['720p'],keyframes:false},
        'minimax-h3':{model:'MiniMax-H3',min:4,max:15,resolutions:['2k','768p'],omitWatermarkAt:[]},
        'minimax-h3-max':{model:'MiniMax-H3-Max',min:5,max:15,resolutions:['768p','480p','1080p'],omitWatermarkAt:['1080p']}
    };
    function isProvider(provider){
        // Member config deliberately omits protocol/base_url; the server supplies this marker.
        if(typeof provider?.video_adapter==='string')return provider.video_adapter==='apimart';
        if(String(provider?.protocol || '').trim().toLowerCase()==='apimart')return true;
        try{
            const host=new URL(provider?.base_url || '').hostname.toLowerCase();
            return host==='apimart.ai' || host.endsWith('.apimart.ai');
        }catch{return false;}
    }
    function capabilities(provider,model){
        if(!isProvider(provider))return null;
        const rule=models[String(model || '').trim().toLowerCase()];
        return rule ? {...rule,resolutions:[...rule.resolutions],omitWatermarkAt:[...rule.omitWatermarkAt]} : null;
    }
    const taskModes=[['auto','自动判断'],['text','文生视频'],['image','图生视频'],['reference','参考生成'],['edit','视频编辑'],['extend','视频续写']];
    function kling(provider,model){return capabilities(provider,model)?.family==='kling';}
    function imageRoles(images,mode='auto',frames=false){
        return images.map((ref,i)=>({...ref,role:mode==='extend' ? 'last_frame' : mode==='image' || (mode==='auto' && frames)
            ? (i===0 ? 'first_frame' : i===images.length-1 ? 'last_frame' : 'keyframe') : 'reference_image'}));
    }
    function canOmitPrompt(mode,frames,images,videos=[],audios=[]){
        return (mode==='image' || (mode==='auto' && frames)) && images.length>0 && !videos.length && !audios.length;
    }
    function durationBounds(provider,model,mode,defaults){
        const durationPolicy=root.VideoDurationPolicy || (typeof require==='function' ? require('./video-duration-policy.js') : null);
        const range=durationPolicy.bounds(provider,model,defaults);
        return {...range,auto:range.auto || (kling(provider,model) && mode==='edit' && !range.configured)};
    }
    const api={capabilities,kling,taskModes,imageRoles,canOmitPrompt,durationBounds};
    if(typeof module==='object'&&module.exports)module.exports=api;else root.ApimartVideoPolicy=api;
})(typeof window==='undefined'?globalThis:window);
