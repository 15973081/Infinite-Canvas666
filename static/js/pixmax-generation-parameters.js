/* N1's native Kz/g$ controls; provider identities and policy remain host-owned. */
(() => {
    'use strict';
    let definitionPromise,referenceDefinitions=[];
    const select=(name,options)=>({name,type:'select',options:options.map(([value,name])=>({value:String(value),name}))});
    const supported=node=>Boolean(window.CanvasSession?.enabled&&node?.type==='smart-image'&&!node.segmentReshoot&&!node.localDepth&&isApiLikeEngine(smartSettingsForNode(node).engine));
    function configuration(node){
        const resolved=smartSettingsForNode(node),saved=node.runSettings||{},kind=resolved.apiKind;
        const identity=kind==='video'?saved.videoProvider&&saved.videoModel:saved.provider_id&&saved.model;
        return identity?enforceSmartGenerationKind(node,{...resolved,...saved}):resolved;
    }
    const identity=config=>config.apiKind==='video'?[config.videoProvider,config.videoModel]:[config.provider_id,config.model];
    function resolutions(config){const [id,model]=identity(config);return CanvasCore.modelResolutions(apiProviders.find(provider=>provider.id===id),config.apiKind,model,config.apiKind==='video'?['','480p','720p','1080p',...(isSeedance20VideoModel(model)?['4k']:[])]:['1k','2k','4k','custom']);}
    function catalog(node){
        const kind=configuration(node).apiKind;
        return apiProviders.filter(provider=>provider.enabled!==false).flatMap(provider=>(provider[kind+'_models']||[]).filter(model=>provider.model_policies?.[kind+':'+model]?.visible!==false).map(model=>{
            const rule=provider.model_policies?.[kind+':'+model],config=kind==='video'?{apiKind:kind,videoProvider:provider.id,videoModel:model}:{apiKind:kind,provider_id:provider.id,model};
            const specs=resolutions(config),reason=!provider.has_key?'供应商尚未配置密钥':rule?.enabled===false?'此模型已停用':!specs.length?'此模型没有可用的生成规格':'';
            return {value:JSON.stringify([provider.id,model]),label:(provider.name||provider.id)+' · '+model,subtitle:specs.map(value=>value?value.toUpperCase():'自动').join(' / '),disabled:!!reason,tooltip:reason};
        }));
    }
    async function definitions(){
        return definitionPromise||=fetch('/static/vendor/pixmax/generation-schema.json').then(async response=>{if(!response.ok)throw Error('原生生成参数加载失败');const value=await response.json();if(!Array.isArray(value.models))throw Error('原生生成参数格式无效');referenceDefinitions=value.models;return value.models;}).catch(error=>{definitionPromise=null;throw error;});
    }
    function referenceModel(config,definitions){
        return PixmaxModelContract.resolve(definitions,config.apiKind,identity(config)[1]);
    }
    function inputIssues(node,config=configuration(node),current=PixmaxReshootReferences.plan(node,{configuration:config})){
        return supported(node)?PixmaxModelContract.inputIssues(referenceModel(config,referenceDefinitions),current.resources):[];
    }
    async function validateInputs(node,config=configuration(node),current){
        if(!supported(node))return;await definitions();
        const issues=inputIssues(node,config,current);if(issues.length)throw Error(issues.map(issue=>issue.errMsg+'；'+issue.support).join('\n'));
    }
    function data(node,definitions){
        const config=configuration(node),native=referenceModel(config,definitions),fields=[],disabledFieldNames=[];
        const add=(name,options)=>{const field=select(name,options);fields.push({...native?.fields.find(field=>field.name===name),...field});};
        const specs=resolutions(config);add('resolution',specs.map(value=>[value,value==='custom'?'自定义':value?value.toUpperCase():'自动']));
        if(config.apiKind==='video'){
            const range=smartVideoDurationRange(config),values=VideoDurationPolicy.choices(range,[-1,3,4,5,6,8,10,12,15,20,30,60]);
            add('aspectRatio',[['adaptive','Auto'],...['16:9','9:16','1:1','4:3','3:4','21:9',...(!isSeedance25VideoModel(config.videoModel)?['9:21','keep_ratio']:[])].map(value=>[value,value==='keep_ratio'?'原图比例':value])]);
            fields.push({name:'duration',type:'stops',min:range.min,max:range.max,step:1,options:values.map(value=>({value:String(value),name:value===-1?'Auto':String(value)}))});
            add('includeAudio',[['true','Audio On'],['false','Audio Off']]);
            if(isSeedance25VideoModel(config.videoModel))add('outputFormat',[['mp4','MP4'],['mov','MOV']]);
            if(window.PixmaxVideoModes?.lockedAspect(config))disabledFieldNames.push('aspectRatio');
            if(window.PixmaxVideoModes?.supported(config)&&isSeedance25VideoModel(config.videoModel)&&window.PixmaxVideoModes.selected(config)==='videoEdit')disabledFieldNames.push('duration');
            return {fields,disabledFieldNames,value:{resolution:config.videoResolution||'',aspectRatio:disabledFieldNames.includes('aspectRatio')?'adaptive':config.videoAspect||'16:9',duration:disabledFieldNames.includes('duration')?'-1':String(config.videoDuration??5),includeAudio:String(!!config.videoGenerateAudio),outputFormat:config.videoOutputFormat||'mp4'}};
        }
        add('aspectRatio',Object.keys(SIZE_MAP).map(value=>[value,({square:'1:1',landscape:'3:2',portrait:'2:3',landscape43:'4:3',portrait43:'3:4',wide:'16:9',story:'9:16',ultrawide:'21:9',ultratall:'9:21'})[value]]).concat([['source','原图比例'],['custom','自定义比例']]));
        add('quality',[['auto','自动'],['low','低'],['medium','中'],['high','高']]);
        const dimensions=config.resolution==='custom'?['customWidth','customHeight']:config.ratio==='custom'?['customRatioWidth','customRatioHeight']:[];
        for(const name of dimensions)fields.push({name,type:'range',min:1,max:name.includes('Ratio')?1000:8192,step:1});
        if(config.outpaintResolutionLocked)disabledFieldNames.push('resolution','aspectRatio',...dimensions);
        return {fields,disabledFieldNames,value:{resolution:config.resolution||specs[0]||'1k',aspectRatio:config.ratio||'square',quality:config.quality||'auto',customWidth:String(config.customWidth||1024),customHeight:String(config.customHeight||1024),customRatioWidth:String(config.customRatioWidth||1),customRatioHeight:String(config.customRatioHeight||1)}};
    }
    function apply(config,value){
        if(config.apiKind==='video'){
            const next={...config,videoResolution:value.resolution,videoAspect:value.aspectRatio,videoDuration:Number(value.duration),videoGenerateAudio:value.includeAudio==='true'};
            if(isSeedance25VideoModel(config.videoModel))next.videoOutputFormat=value.outputFormat;return next;
        }
        const next={...config,resolution:value.resolution,ratio:value.aspectRatio,quality:value.quality};
        if(config.outpaintResolutionLocked){next.resolution=config.resolution;next.ratio=config.ratio;return next;}
        if(next.resolution==='custom'){next.customWidth=Number(value.customWidth||config.customWidth||1024);next.customHeight=Number(value.customHeight||config.customHeight||1024);next.customSize=next.customWidth+'x'+next.customHeight;}
        else if(next.ratio==='custom'){next.customRatioWidth=Number(value.customRatioWidth||config.customRatioWidth||1);next.customRatioHeight=Number(value.customRatioHeight||config.customRatioHeight||1);next.customRatio=next.customRatioWidth+':'+next.customRatioHeight;}
        return next;
    }
    function validate(node,config=configuration(node)){
        if(!supported(node))return config;
        const option=catalog(node).find(option=>option.value===JSON.stringify(identity(config)));
        if(!option||option.disabled)throw Error(option?.tooltip||'已保存的供应商或模型已不可用，请重新选择生成模型');
        if(!resolutions(config).includes(config.apiKind==='video'?config.videoResolution||'':config.resolution||'1k')&&!config.outpaintResolutionLocked)throw Error('生成分辨率已失效，请重新选择');
        if(config.apiKind==='video'){
            const range=smartVideoDurationRange(config);if(VideoDurationPolicy.clamp(config.videoDuration,range)!==Number(config.videoDuration))throw Error('生成时长超出当前模型范围');
            if(config.videoOutputFormat&&!['mp4','mov'].includes(config.videoOutputFormat))throw Error('视频输出格式无效');
            if(typeof config.videoGenerateAudio!=='boolean')throw Error('视频声音设置无效');
            if(window.PixmaxVideoModes?.supported(config)||config.videoReferenceMode)window.PixmaxVideoModes.validate(config,window.PixmaxVideoModes.references(node,config));
        }else if(config.resolution==='custom'&&(!Number.isSafeInteger(config.customWidth)||!Number.isSafeInteger(config.customHeight)||config.customWidth<1||config.customHeight<1||config.customWidth>8192||config.customHeight>8192))throw Error('自定义图像尺寸无效');
        return config;
    }
    function formData(node,definitionsValue){
        const config=configuration(node),options=catalog(node),make=(option)=>{
            const [provider,model]=JSON.parse(option.value),next=config.apiKind==='video'?{...config,videoProvider:provider,videoModel:model}:{...config,provider_id:provider,model};
            const specs=resolutions(next),sizeKey=config.apiKind==='video'?'videoResolution':'resolution';if(!specs.includes(next[sizeKey]||''))next[sizeKey]=specs.includes(config.apiKind==='video'?'720p':'1k')?(config.apiKind==='video'?'720p':'1k'):specs[0];
            if(config.apiKind==='video')next.videoDuration=VideoDurationPolicy.clamp(next.videoDuration,smartVideoDurationRange(next));
            const temp={...node,runSettings:next},parameters=data(temp,definitionsValue),fields=[{name:'prompt',type:'text',default:'',max:10000},...parameters.fields];
            if(config.apiKind==='image')fields.push(select('count',[1,2,3,4,5,6,7,8].map(value=>[value,value+'张'])));
            else if(PixmaxVideoModes.supported(next))fields.push({name:'referModel',type:'radio',default:'auto',options:PixmaxVideoModes.options(node,next,definitionsValue).map(option=>({name:option.label,value:option.value,disabled:option.disabled}))});
            if(config.apiKind==='video')for(const [name,key] of [['watermark','videoWatermark'],['enhancePrompt','videoEnhancePrompt'],['enableUpsample','videoEnableUpsample'],['cameraFixed','videoCameraFixed']])fields.push({name,type:'switch',default:String(!!next[key])});
            return {modelCode:option.value,modelName:option.label,connectConstraint:PixmaxModelContract.connections(referenceModel(next,definitionsValue)),filedConfig:fields.map(field=>({...field,default:parameters.value[field.name]??field.default??String(config.count||1)}))};
        };
        const parameters=data(node,definitionsValue),videoEdit=config.apiKind==='video'&&PixmaxVideoModes.selected(config)==='videoEdit';
        if(videoEdit){const source=PixmaxReshootReferences.plan(node).incomingNodes.find(source=>source.type==='video'&&source.data.url),field=parameters.fields.find(field=>field.name==='duration');if(source&&field){const duration=Math.max(1,Math.floor(Number(source.data.duration)||0)),choices=(field.options||[]).filter(option=>!option.disabled).map(option=>Number(option.value)).filter(Number.isFinite);parameters.value.duration=String(choices.sort((a,b)=>Math.abs(a-duration)-Math.abs(b-duration)||b-a)[0]??Math.max(field.min,Math.min(duration,field.max)));}}
        return {schema:options.map(make),modelOptions:options.map(option=>({...option,text:option.label})),disabledFieldNames:parameters.disabledFieldNames,value:{...parameters.value,model:JSON.stringify(identity(config)),prompt:node.nativePrompt?.prompt||'',count:String(config.count||1),referModel:PixmaxVideoModes.selected(config),watermark:String(!!config.videoWatermark),enhancePrompt:String(!!config.videoEnhancePrompt),enableUpsample:String(!!config.videoEnableUpsample),cameraFixed:String(!!config.videoCameraFixed)},videoEdit};
    }
    function applyForm(node,value){
        let config=configuration(node);const [provider,model]=JSON.parse(value.model),changedModel=JSON.stringify(identity(config))!==value.model;
        config=config.apiKind==='video'?{...config,engine:'api',videoProvider:provider,videoModel:model}:{...config,engine:'api',provider_id:provider,model};
        config=apply(config,value);
        if(config.apiKind==='image')config.count=Number(value.count||1);
        else{
            if(PixmaxVideoModes.supported(config))config=PixmaxVideoModes.choose(node,config,value.referModel||'auto');
            else if(changedModel){config.videoReferenceMode='auto';config.videoTaskMode='auto';config.videoUseFrameRoles=false;}
            for(const [name,key]of [['watermark','videoWatermark'],['enhancePrompt','videoEnhancePrompt'],['enableUpsample','videoEnableUpsample'],['cameraFixed','videoCameraFixed']])config[key]=value[name]==='true';
            if(!isSeedance25VideoModel(config.videoModel))delete config.videoOutputFormat;
        }
        return config;
    }
    window.PixmaxGenerationParameters=Object.freeze({supported,configuration,catalog,data,apply,validate,definitions,formData,applyForm,referenceModel,inputIssues,validateInputs});
})();
