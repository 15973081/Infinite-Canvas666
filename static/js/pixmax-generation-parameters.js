/* N1's native Kz/g$ controls; provider identities and policy remain host-owned. */
(() => {
    'use strict';
    let definitionPromise,legacyOwner;
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
        return definitionPromise||=fetch('/static/vendor/pixmax/generation-schema.json').then(async response=>{if(!response.ok)throw Error('原生生成参数加载失败');const value=await response.json();if(!Array.isArray(value.models))throw Error('原生生成参数格式无效');return value.models;}).catch(error=>{definitionPromise=null;throw error;});
    }
    function referenceModel(config,definitions){
        const [,model]=identity(config),name=String(model||'').toLowerCase();
        const code=isSeedance25VideoModel(model)?'PIXDANCE_2_5':isSeedance20VideoModel(model)?'PIXDANCE_2':name.includes('seedream-4-5')?'DOUBAO_SEEDREAM_4_5':name.includes('seedream-5')?'DOUBAO_SEEDREAM_5_PRO':undefined;
        return definitions.find(item=>item.modelCode===code);
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
            if(window.PixmaxVideoModes?.supported(config)&&window.PixmaxVideoModes.selected(config)==='videoEdit')disabledFieldNames.push('duration');
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
    async function mount({node,api,valid,editable,onRoot}){
        const definitionsValue=await definitions();if(!valid())return;
        const root=document.createElement('div');root.className='pixmax-generation-controls';root.innerHTML='<div data-generation-model></div><div data-generation-parameters></div><div data-generation-count></div><div data-generation-mode></div><div data-generation-advanced></div>';
        dynamicParams.after(root);onRoot?.(root,true);let closed=false,signature,handles=[],refresh=()=>{};const owner={};
        for(const event of ['mousedown','keydown','wheel'])root.addEventListener(event,event=>event.stopPropagation());
        const current=()=>!closed&&valid()&&root.isConnected;
        function commit(config){
            if(!current()||!editable())return;validate(node,config);
            if(config.ratio==='source'){
                const ratio=reducedRatioForImage(sourceRatioImageForNode(node)||PixmaxReshootReferences.plan(node).resources.find(entry=>entry.kind==='image')?.media);if(!ratio)throw Error('原图尺寸尚未就绪，请稍后重试');
                config={...config,customRatio:ratio.w+':'+ratio.h,customRatioWidth:ratio.w,customRatioHeight:ratio.h};
            }
            if(JSON.stringify(settingsForStorage(config))===JSON.stringify(settingsForStorage(configuration(node))))return;
            pushUndo();node.runSettings=settingsForStorage(config);settings={...settings,...config};persistActiveSmartSettings();renderDynamicParams(false);scheduleSave();refresh();positionComposerForNode(node);
        }
        const change=callback=>value=>{try{if(current()&&editable())callback(value);}catch(error){if(current())toast(error.message);}};
        try{
        const model=await api.mountModelSelector(root.querySelector('[data-generation-model]'),{...modelData(),ariaLabel:'生成模型',placeholder:'请选择生成模型',selectedLabelClass:'truncate min-w-0 text-left',onChange:change(value=>{
            const [provider,selected]=JSON.parse(value),old=configuration(node);let config=old.apiKind==='video'?{...old,engine:'api',videoProvider:provider,videoModel:selected}:{...old,engine:'api',provider_id:provider,model:selected};
            const specs=resolutions(config),key=old.apiKind==='video'?'videoResolution':'resolution';if(!config.outpaintResolutionLocked&&!specs.includes(config[key]||''))config[key]=specs.includes(old.apiKind==='video'?'720p':'1k')?(old.apiKind==='video'?'720p':'1k'):specs[0];
            if(old.apiKind==='image'&&config.resolution==='custom'){config.customWidth=Number(config.customWidth)||1024;config.customHeight=Number(config.customHeight)||1024;config.customSize=config.customWidth+'x'+config.customHeight;}
            if(old.apiKind==='video'){config.videoDuration=VideoDurationPolicy.clamp(config.videoDuration,smartVideoDurationRange(config));if(!isSeedance25VideoModel(selected))delete config.videoOutputFormat;if(!window.PixmaxVideoModes.supported(config)||!window.PixmaxVideoModes.options(node,config,definitionsValue).some(option=>option.value===window.PixmaxVideoModes.selected(config))){config.videoReferenceMode='auto';config.videoTaskMode='auto';}}commit(config);
        })});handles.push(model);
        const parameters=await api.mountParameters(root.querySelector('[data-generation-parameters]'),{...data(node,definitionsValue),ariaLabel:'生成参数',fieldLabelOverrides:{quality:'画质',duration:'时长',customWidth:'宽度',customHeight:'高度',customRatioWidth:'比例宽',customRatioHeight:'比例高'},onChange:change(value=>commit(apply(configuration(node),value)))});handles.push(parameters);
        const count=await api.mountModelSelector(root.querySelector('[data-generation-count]'),{...countData(),ariaLabel:'生成数量',onChange:change(value=>commit({...configuration(node),count:Number(value)}))});handles.push(count);
        const mode=await api.mountModelSelector(root.querySelector('[data-generation-mode]'),{...modeData(),ariaLabel:'视频生成模式',onChange:change(value=>commit(window.PixmaxVideoModes.choose(node,configuration(node),value)))});handles.push(mode);
        const advanced=await api.mountParameters(root.querySelector('[data-generation-advanced]'),{...advancedData(),ariaLabel:'更多生成设置',disabledFieldNames:[],displayTextOverride:'更多设置',fieldLabelOverrides:{videoEnhancePrompt:'提示词增强',videoEnableUpsample:'高清',videoWatermark:'水印',videoCameraFixed:'镜头固定',videoMultimodal:'智能多参',videoUseFrameRoles:'首尾帧'},onChange:change(value=>{
            const config=configuration(node),framesSelected=value.videoUseFrameRoles==='true'&&!config.videoUseFrameRoles;for(const key of Object.keys(value))config[key]=value[key]==='true';if(framesSelected)config.videoMultimodal=false;else if(config.videoMultimodal)config.videoUseFrameRoles=false;commit(config);
        })});handles.push(advanced);
        if(!current()){destroy();return;}
        legacyOwner=owner;dynamicParams.hidden=true;engineSelect.hidden=true;refresh();
        function modelData(){const options=catalog(node),value=JSON.stringify(identity(configuration(node)));return {options,value:options.some(option=>option.value===value)?value:''};}
        function countData(){return {value:String(configuration(node).count||1),options:[1,2,3,4,5,6,7,8].map(value=>({label:value+'张',value:String(value)}))};}
        function modeData(){const config=configuration(node);return {value:window.PixmaxVideoModes.selected(config),options:window.PixmaxVideoModes.supported(config)?window.PixmaxVideoModes.options(node,config,definitionsValue):[]};}
        function advancedData(){const config=configuration(node),keys=['videoEnhancePrompt','videoEnableUpsample','videoWatermark','videoCameraFixed','videoMultimodal',...(videoProviderPlatform(config.videoProvider)!=='volcengine'?['videoUseFrameRoles']:[])];return {fields:keys.map(name=>select(name,[['true','开启'],['false','关闭']])),value:Object.fromEntries(keys.map(key=>[key,String(!!config[key])]))};}
        refresh=()=>{
            if(!current())return;const config=configuration(node),next=JSON.stringify([config,catalog(node),modeData()]),disabled=!editable();
            if(signature!==next){signature=next;model.setData(modelData());parameters.setData(data(node,definitionsValue));count.setData(countData());mode.setData(modeData());advanced.setData(advancedData());}
            handles.forEach(handle=>handle.setDisabled(disabled));
            root.querySelector('[data-generation-count]').hidden=config.apiKind==='video';root.querySelector('[data-generation-mode]').hidden=!window.PixmaxVideoModes.supported(config);root.querySelector('[data-generation-advanced]').hidden=config.apiKind!=='video';
        }
        return {refresh,destroy};
        }catch(error){destroy();throw error;}
        function destroy(){if(closed)return;closed=true;handles.forEach(handle=>handle.destroy());root.remove();onRoot?.(root,false);if(legacyOwner===owner){legacyOwner=null;dynamicParams.hidden=false;engineSelect.hidden=false;}}
    }
    window.PixmaxGenerationParameters=Object.freeze({supported,configuration,catalog,data,apply,validate,mount});
})();
