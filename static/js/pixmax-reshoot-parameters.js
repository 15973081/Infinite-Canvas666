/* Native reshoot fields retain host model policy and task ownership. */
(() => {
    'use strict';
    let schemaPromise;
    async function schema(){
        if(!schemaPromise)schemaPromise=fetch('/static/vendor/pixmax/reshoot-schema.json').then(async response=>{
            if(!response.ok)throw new Error('重拍参数加载失败');const value=await response.json();
            if(value.modelCode!=='PIXDANCE_2_5'||!Array.isArray(value.fields))throw new Error('重拍参数格式无效');return value;
        }).catch(error=>{schemaPromise=null;throw error;});
        return schemaPromise;
    }
    function resolutions(config){return smartVideoResolutions(config).filter(value=>['','480p','720p','1080p'].includes(value));}
    function modelCatalog(){
        return (apiProviders||[]).filter(provider=>provider.enabled!==false&&videoProviderPlatform(provider.id)==='volcengine').flatMap(provider=>(provider.video_models||[]).filter(isSeedance25VideoModel).filter(model=>provider.model_policies?.['video:'+model]?.visible!==false).map(model=>{
            const allowed=resolutions({videoProvider:provider.id,videoModel:model});
            const reason=!provider.has_key?'供应商尚未配置密钥':provider.model_policies?.['video:'+model]?.enabled===false?'此模型已停用':!allowed.length?'此模型没有可用的重拍分辨率':'';
            return {provider,model,value:JSON.stringify([provider.id,model]),label:(provider.name||provider.id)+' · '+model,
                subtitle:(provider.name||provider.id)+' · '+(allowed.map(value=>value||'自动').join(' / ')||'规格不可用'),tag:'Seedance 2.5',disabled:!!reason,tooltip:reason};
        }));
    }
    function modelData(node){
        const options=modelCatalog().map(({value,label,subtitle,tag,disabled,tooltip})=>({value,label,subtitle,tag,disabled,tooltip})),selected=JSON.stringify([node.runSettings.videoProvider,node.runSettings.videoModel]);
        return {value:options.some(option=>option.value===selected)?selected:'',options};
    }
    function settings(node,config=node.runSettings){
        return {...config,count:1,videoTaskMode:'edit',videoAspect:'adaptive',videoDuration:Math.max(4,Math.min(30,Math.round(node.segmentReshoot.endSec-node.segmentReshoot.startSec))),
            videoGenerateAudio:config.videoGenerateAudio??true,videoOutputFormat:config.videoOutputFormat||'mp4'};
    }
    function validate(node,config=node.runSettings){
        const result=settings(node,config);
        if(!resolutions(result).includes(result.videoResolution||''))throw new Error('重拍分辨率已失效，请重新选择模型和分辨率');
        if(!['mp4','mov'].includes(result.videoOutputFormat))throw new Error('重拍输出格式仅支持 MP4 或 MOV');
        if(typeof result.videoGenerateAudio!=='boolean')throw new Error('重拍声音设置无效');return result;
    }
    function data(node,definition){
        const config=settings(node),allowed=resolutions(config),fields=definition.fields.map(field=>{
            if(field.name==='aspectRatio')return {...field,options:field.options.filter(option=>option.value==='adaptive')};
            if(field.name==='resolution')return {...field,options:[...field.options.filter(option=>allowed.includes(option.value.toLowerCase())),...(allowed.includes('')&&!(config.videoResolution||'')?[{name:'Auto',value:''}]:[])]};
            return field;
        });
        return {fields,value:{resolution:(config.videoResolution||'').toUpperCase(),aspectRatio:'adaptive',duration:String(config.videoDuration),includeAudio:String(config.videoGenerateAudio),outputFormat:config.videoOutputFormat}};
    }
    function modelChanged(node){
        const config=node.runSettings,allowed=resolutions(config),current=String(config.videoResolution||'').toLowerCase();
        config.videoResolution=allowed.includes(current)?current:allowed.includes('720p')?'720p':allowed[0]||'';
        Object.assign(config,settings(node,config));
    }
    function apply(node,value){
        const config={...node.runSettings,videoResolution:String(value.resolution||'').toLowerCase(),videoGenerateAudio:value.includeAudio==='true',videoOutputFormat:value.outputFormat};
        Object.assign(node.runSettings,validate(node,config));
    }
    window.PixmaxReshootParameters=Object.freeze({schema,resolutions,settings,validate,data,modelChanged,apply,modelCatalog,modelData});
})();
