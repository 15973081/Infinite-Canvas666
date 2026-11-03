/* The captured N1 owns form layout/fullscreen; host state remains authoritative. */
(() => {
    'use strict';
    async function mount({node,api,valid,editable,raw,project,onRoot,mentionModel}){
        const definitions=await PixmaxGenerationParameters.definitions();if(!valid())return;
        const target=document.createElement('div');target.className='pixmax-native-generation-form pixmax-native-prompt';composer.append(target);onRoot(target,true);
        let closed=false,handle,signature,quoteStamp,quoteTimer,quoteVersion=0,generateLabel='生成',surface;
        const current=()=>!closed&&target.isConnected&&valid(),allowed=()=>current()&&editable();
        const plan=()=>PixmaxReshootReferences.plan(node);
        function graphData(currentPlan,values){
            const refs=currentPlan.incomingNodes.map(source=>({...source,data:{...source.data,url:source.data.url?displayMediaUrl(source.data.url):undefined}}));
            return {nodes:[{id:node.id,type:smartSettingsForNode(node).apiKind==='video'?'video-gen':'image-gen',position:{x:node.x,y:node.y},data:{params:values}},...refs],edges:refs.map(source=>({id:source.id+'->'+node.id,source:source.id,target:node.id}))};
        }
        function data(){
            const base=PixmaxGenerationParameters.formData(node,definitions),refs=plan();base.value.prompt=raw();
            const [providerValue]=JSON.parse(base.value.model),available=base.modelOptions.filter(option=>!option.disabled);
            const providerOptions=apiProviders.filter(provider=>available.some(option=>JSON.parse(option.value)[0]===provider.id)).map(provider=>({value:provider.id,label:provider.name||provider.id}));
            base.providerValue=providerValue;base.providerOptions=providerOptions;
            base.modelOptions=available.filter(option=>JSON.parse(option.value)[0]===providerValue).map(option=>({...option,label:JSON.parse(option.value)[1],text:JSON.parse(option.value)[1]}));
            let message;try{PixmaxGenerationParameters.validate(node);PixmaxReshootReferences.validate(node,refs);}catch(error){message=error.message;}
            const issues=PixmaxGenerationParameters.inputIssues(node,undefined,refs),summary=[...(message?[{errMsg:message,support:''}]:[]),...issues];
            const sourceDetails=Object.create(null);for(const issue of issues)for(const id of issue.sourceIds)(sourceDetails[id]||=[]).push(issue);
            const mode=PixmaxVideoModes.selected(smartSettingsForNode(node)),images=refs.resources.filter(entry=>entry.kind==='image');
            return {...base,graph:graphData(refs,base.value),referenceNames:Object.fromEntries(refs.resources.map(entry=>[entry.id,'引用 '+(entry.kind==='image'&&['imageToVideo','firstAndLastFrame'].includes(mode)?images.indexOf(entry)===0?'首帧':'尾帧':entry.alias)+' · '+entry.name])),validation:{invalid:summary.length>0,sourceDetails,summary,groups:summary.length?[{title:'生成设置',items:summary}]:[]},generateLabel};
        }
        function refresh(){
            if(!current())return;repairModelSelection();const quoteKey=JSON.stringify([PixmaxReshootReferences.signature(node),apiProviders]);
            if(quoteKey!==quoteStamp){quoteStamp=quoteKey;generateLabel='生成';quoteVersion++;clearTimeout(quoteTimer);if(editable()&&window.CanvasSession?.enabled)quoteTimer=setTimeout(()=>void quote(quoteKey),300);}
            const next=data(),key=JSON.stringify(next);if(key!==signature){signature=key;handle?.setData(next);}handle?.setDisabled(!editable());
        }
        function repairModelSelection(){
            if(!allowed())return;
            const saved=smartSettingsForNode(node);
            if(saved.apiKind==='video'&&(saved.videoReferenceMode==='firstAndLastFrame'||saved.videoUseFrameRoles)){
                const config={...saved,videoReferenceMode:'auto',videoTaskMode:'auto',videoUseFrameRoles:false};
                pushUndo();node.runSettings=settingsForStorage(config);settings={...settings,...config};
                persistActiveSmartSettings();scheduleSave();
            }
            const gatewayConfig=PixmaxGenerationParameters.configuration(node);
            const capability=gatewayConfig.apiKind==='video'&&window.ApimartVideoPolicy?.capabilities(apiProviders.find(provider=>provider.id===gatewayConfig.videoProvider),gatewayConfig.videoModel);
            if(capability&&smartVideoResolutions(gatewayConfig).length){
                const config={...gatewayConfig};normalizeSmartVideoResolution(config);
                config.videoDuration=VideoDurationPolicy.clamp(config.videoDuration,smartVideoDurationRange(config));
                if(!['adaptive','16:9','9:16','1:1','4:3','3:4','21:9'].includes(config.videoAspect))config.videoAspect='16:9';
                config.videoGenerateAudio=config.videoEnhancePrompt=config.videoEnableUpsample=config.videoCameraFixed=false;
                if(capability.omitWatermarkAt.includes(config.videoResolution))config.videoWatermark=false;
                if(JSON.stringify(config)!==JSON.stringify(gatewayConfig)){
                    pushUndo();node.runSettings=settingsForStorage(config);settings={...settings,...config};
                    persistActiveSmartSettings();scheduleSave();
                }
            }
            const base=PixmaxGenerationParameters.formData(node,definitions),options=base.modelOptions;
            if(options.some(option=>option.value===base.value.model&&!option.disabled))return;
            const option=options.find(option=>!option.disabled&&option.subtitle.startsWith('空间默认'))||options.find(option=>!option.disabled);
            if(!option)return;
            const schema=base.schema.find(model=>model.modelCode===option.value);
            const value={...base.value,...Object.fromEntries(schema.filedConfig.map(field=>[field.name,field.default])),model:option.value,prompt:raw()};
            const config=PixmaxGenerationParameters.applyForm(node,value);
            pushUndo();node.runSettings=settingsForStorage(config);settings={...settings,...config};
            persistActiveSmartSettings();scheduleSave();
        }
        function selectProvider(providerId){
            if(!allowed())return;
            const base=PixmaxGenerationParameters.formData(node,definitions),[,model]=JSON.parse(base.value.model);
            const options=base.modelOptions.filter(option=>!option.disabled&&JSON.parse(option.value)[0]===providerId);
            const option=options.find(option=>JSON.parse(option.value)[1]===model)||options.find(option=>option.subtitle.startsWith('空间默认'))||options[0];
            if(!option)return;
            const schema=base.schema.find(item=>item.modelCode===option.value);
            changed({...base.value,...Object.fromEntries(schema.filedConfig.map(field=>[field.name,field.default])),model:option.value,prompt:raw()});
        }
        async function quote(key){
            const version=quoteVersion;
            try{
                if(!allowed())return;const config=PixmaxGenerationParameters.configuration(node),request=await PixmaxBatchExecution.prepare(node,config.apiKind);
                if(!allowed()||quoteStamp!==key||quoteVersion!==version)return;
                const response=await fetch(CanvasSession.url('/api/canvases/'+encodeURIComponent(canvas.id)+'/generation-preview'),{method:'POST',headers:{'Content-Type':'application/json','X-Member-ID':CanvasSession.context.member.id},body:JSON.stringify({kind:config.apiKind,request})});
                if(!response.ok)return;const {cost}=await response.json();if(!allowed()||quoteStamp!==key||quoteVersion!==version)return;
                if(cost?.status==='estimated')generateLabel='生成 · 预计 '+new Intl.NumberFormat('zh-CN',{style:'currency',currency:cost.currency}).format(cost.amount_micros/1000000);else generateLabel='生成 · 费用待核算';
                signature=null;refresh();
            }catch{/* Invalid drafts can be edited without creating an estimate or task. */}
        }
        function changed(value){
            if(!allowed())return;
            try{
                const before=PixmaxGenerationParameters.formData(node,definitions).value,prompt=value.prompt??'';
                const previous={...before};delete previous.prompt;const next={...value};delete next.prompt;
                const settingsChanged=JSON.stringify(previous)!==JSON.stringify(next);
                if(settingsChanged){
                    const config=PixmaxGenerationParameters.applyForm(node,value);PixmaxGenerationParameters.validate(node,config);
                    if(config.ratio==='source'){const ratio=reducedRatioForImage(sourceRatioImageForNode(node));if(!ratio)throw Error('原图尺寸尚未就绪');config.customRatio=ratio.w+':'+ratio.h;config.customRatioWidth=ratio.w;config.customRatioHeight=ratio.h;}
                    pushUndo();node.runSettings=settingsForStorage(config);settings={...settings,...config};persistActiveSmartSettings();
                }
                if(prompt!==raw())project(prompt);
                if(settingsChanged){render();scheduleSave();}refresh();
            }catch(error){toast(error.message);signature=null;refresh();}
        }
        const graphActions={
            removeIncomingEdge(targetId,id){if(!allowed()||targetId!==node.id)return;const entry=plan().byId.get(id);if(entry){PixmaxReshootReferences.remove(node,entry);refresh();}},
            reorderEdges(targetId,ids){if(!allowed()||targetId!==node.id)return;const refs=plan(),entries=ids.map(id=>refs.byId.get(id));if(entries.some(entry=>!entry)||ids.length!==refs.resources.length||new Set(ids).size!==refs.resources.length){signature=null;refresh();return;}const keys=entries.filter(entry=>entry.media).map(entry=>smartMediaRefKey(entry.media));const texts=entries.filter(entry=>entry.kind==='text').map(entry=>entry.nodeId),slots=canvas.connections.flatMap((edge,index)=>edge.to===node.id&&edge.kind==='input'&&texts.includes(edge.from)?[index]:[]),edges=slots.map(slot=>canvas.connections[slot]).sort((a,b)=>texts.indexOf(a.from)-texts.indexOf(b.from));if(JSON.stringify(keys)===JSON.stringify(node.mediaReferenceOrder||refs.resources.filter(entry=>entry.media).map(entry=>smartMediaRefKey(entry.media)))&&edges.every((edge,index)=>edge===canvas.connections[slots[index]]))return;PixmaxNativePrompt.flush(node);pushUndo();node.mediaReferenceOrder=keys;slots.forEach((slot,index)=>canvas.connections[slot]=edges[index]);render();scheduleSave();refresh();}
        };
        async function assets(){
            if(!allowed())return;const picker=pixmaxCreationModal('添加资产参考'),content=picker.querySelector('.pixmax-creation-content');onRoot(picker,true);const search=document.createElement('input');search.type='search';search.placeholder='搜索参考素材';const list=document.createElement('div');content.append(search,list);
            try{const response=await CanvasApi.getAssetLibrary();if(!allowed()||!picker.isConnected)return;const library=response.library||response,categories=(library.libraries||[{categories:library.categories||[]}]).flatMap(lib=>lib.categories||[]),items=categories.flatMap(category=>category.items||[]).filter(item=>smartSettingsForNode(node).apiKind==='video'||assetMediaKind(item)==='image');
                const draw=()=>{list.replaceChildren();for(const item of items.filter(item=>(item.name||'').includes(search.value))){const button=document.createElement('button');button.textContent=item.name||'素材';button.onclick=()=>{if(!allowed()||!picker.isConnected)return;PixmaxReshootReferences.addAsset(node,item);picker.remove();onRoot(picker,false);refresh();};list.append(button);}};search.oninput=draw;draw();
            }catch(error){if(picker.isConnected)picker.querySelector('[role=status]').textContent=error.message;}
        }
        const key=window.CanvasSession?.storageKey?.('pixmax-camera-preferences-v1')||'pixmax-camera-preferences-v1';
        try{
            repairModelSelection();
            handle=await api.mountGenerationForm(target,{data:data(),nodeId:node.id,formVariant:smartSettingsForNode(node).apiKind==='video'?'video-gen':'default',showCameraParamsEntry:smartSettingsForNode(node).apiKind==='image',showCamerawork:false,showSubjects:false,viewport,disabled:!editable(),fieldLabelOverrides:{watermark:'水印',enhancePrompt:'提示词增强',enableUpsample:'超分辨率',cameraFixed:'固定镜头',quality:'画质',duration:'时长',customWidth:'宽度',customHeight:'高度',customRatioWidth:'比例宽',customRatioHeight:'比例高'},canPreview:source=>!String(source.data.url||'').startsWith('asset://'),subjectApi:PixmaxSubjects.adapter(node,current),subjectMediaUrl:url=>displayMediaUrl({url}),atMentionPicker:{getModel:mentionModel,connect:id=>allowed()&&PixmaxReshootReferences.connect(node,id)},enabledProtocols:['at-mention','hash-rich','subject-reference'],graphActions,onProviderChange:selectProvider,onChange:changed,onSubmit:async()=>{if(allowed())await runGeneration();},onNotice:toast,onOpenAssets:assets,
                readCameraPreferences:()=>{try{const value=JSON.parse(localStorage.getItem(key)||'null'),indices=value?.indices;if(!indices||Object.entries(PixmaxPromptCatalog).some(([name,items])=>!Number.isInteger(indices[name])||indices[name]<0||indices[name]>=items.length))return null;return {indices};}catch{return null;}},writeCameraPreferences:indices=>{if(allowed())localStorage.setItem(key,JSON.stringify({indices}));},
                onFormRoot:(root,fullscreen)=>{surface=root;queueMicrotask(()=>{if(!current()||!root.isConnected)return;if(fullscreen){root.parentElement.classList.add('pixmax-native-generation-fullscreen');onRoot(root.parentElement,true);}positionComposerForNode(node);})}});
            if(!current()){destroy();return;}composer.classList.add('pixmax-native-form-active');refresh();positionComposerForNode(node);return {refresh,destroy,flush:()=>{if(allowed()){const value=handle.instance.getSerializedPrompt();if(typeof value==='string'&&value!==raw())project(value);}},updateViewport:()=>{if(current())handle.setViewport(viewport);},surface:()=>surface};
        }catch(error){destroy();throw error;}
        function destroy(){if(closed)return;closed=true;quoteVersion++;clearTimeout(quoteTimer);handle?.destroy();target.remove();onRoot(target,false);composer.classList.remove('pixmax-native-form-active');}
    }
    window.PixmaxGenerationForm=Object.freeze({mount});
})();
