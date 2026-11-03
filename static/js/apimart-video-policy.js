/* APIMart gateway capabilities from its docs; not MiniMax official API limits. */
(function(root){
    const models={
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
        return rule ? {...rule,resolutions:[...rule.resolutions],omitWatermarkAt:[...rule.omitWatermarkAt],inputLimits:{image:9,video:3,audio:3}} : null;
    }
    const api={capabilities};
    if(typeof module==='object'&&module.exports)module.exports=api;else root.ApimartVideoPolicy=api;
})(typeof window==='undefined'?globalThis:window);
