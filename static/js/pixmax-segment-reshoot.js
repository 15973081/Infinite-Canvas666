/* Native reshoot range/crop/cache; the host retains task and canvas ownership. */
(() => {
    'use strict';
    let runtimePromise,activeSession,openAttempt=0;
    const jobs=new Map(),creating=new Set(),scope=()=>window.CanvasSession?.context?.member?.id+':'+window.CanvasSession?.context?.workspace?.id;
    const identity=item=>String(item?.url||'').match(/(?:assets\/cloud|api\/media)\/(ast_[a-f0-9]{32})(?:\/|$)/)?.[1]||item?.url;
    const runtime=()=>runtimePromise ||= import('/static/vendor/pixmax/editors.js').then(value=>value.canvasSegmentReshoot).catch(error=>{runtimePromise=null;throw error;});
    function dispose(session){
        if(!session||session.closed)return;session.closed=true;
        session.observer?.disconnect();clearTimeout(session.seekTimer);session.root.remove();
        session.cleanupVideo?.();session.unmountPlayer?.();
        session.promptHandle?.destroy();session.parametersHandle?.destroy();session.modelHandle?.destroy();for(const picker of session.pickers||[])picker.remove();
        if(session.video){session.video.pause();session.video.removeAttribute('src');session.video.load();}
        if(session.timeline)void session.timeline.destroy();
        if(activeSession===session)activeSession=null;
    }
    function mountPlayer(api,session,media,height='220px'){
        const target=session.root.querySelector('[data-reshoot-player]');
        const instance=api.mountPlayer(target,{src:displayMediaUrl(media),poster:pixmaxMediaPoster(media),durationHint:session.node.segmentReshoot.source.duration,
            preload:'metadata',eagerMetadataProbe:true,fit:'fill',showCaptureButton:false,showFullscreenButton:true,style:'width:100%;height:'+height,
            onControllerReady:controller=>{session.controller=controller;}});
        session.unmountPlayer=()=>{void api.unmountPlayer(instance);};session.video=target.querySelector('video');
        if(!session.video)throw new Error('源视频播放器未初始化');
        return session.video;
    }
    async function preview(id){
        const node=nodes.find(item=>item.id===id),media=previewMedia(node);if(!media)return;
        const origin=canvas,owner=scope(),key=identity(media),attempt=++openAttempt;
        const readable=()=>{try{return canvas===origin&&scope()===owner&&nodes.includes(node)&&identity(sourceFor(node).media)===key;}catch{return false;}};
        let previewSession;try{
            const api=await runtime();if(!readable()||attempt!==openAttempt)return;dispose(activeSession);
            const root=pixmaxCreationModal('源视频预览');root.classList.add('pixmax-reshoot-preview-modal');root.querySelector('.pixmax-creation-content').innerHTML='<div class="pixmax-reshoot-preview-player" data-reshoot-player></div>';
            const session={root,node,canvasId:canvas.id,scope:owner,closed:false,video:null,sync(){if(!readable())dispose(session);}};activeSession=previewSession=session;
            mountPlayer(api,session,media,'min(65vh,420px)');
            session.observer=new MutationObserver(()=>{if(!root.isConnected)dispose(session);});session.observer.observe(document.body,{childList:true});
        }catch(error){dispose(previewSession);toast(error.message||'源视频预览失败');}
    }
    function models(){return PixmaxReshootParameters.modelCatalog().filter(item=>!item.disabled);}
    function sourceFor(node){
        const state=node.segmentReshoot,source=typeof smartNodeForComputation==='function'?smartNodeForComputation(state?.source?.nodeId):nodes.find(item=>item.id===state?.source?.nodeId),media=source?.images?.find(item=>mediaKindForItem(item)==='video'&&identity(item)===state.source.identity);
        if(state?.importError)throw new Error(state.importError);
        if(!state?.source?.url)throw new Error('片段重拍的源视频不可用');
        if(state?.schemaVersion===1&&!state.source.nodeId)return {source:null,media:state.source.media||{url:state.source.url,kind:'video',duration:state.source.duration}};
        const incoming=typeof smartConnectionsForComputation==='function'?smartConnectionsForComputation(node.id):canvas.connections||[];
        if(!media||!incoming.some(edge=>edge.from===source.id&&edge.to===node.id))throw new Error('原视频或连接已变化，请重新创建片段重拍');
        return {source,media};
    }
    function previewMedia(node){
        if(node?.segmentReshoot?.schemaVersion!==1||(node.images||[]).length)return null;
        try{return sourceFor(node).media;}catch{return null;}
    }
    function previewBody(node,layout){
        const media=previewMedia(node);if(!media)return '';
        return `<div class="pixmax-reshoot-source" data-reshoot-source data-media-signature="${escapeAttr('reshoot-source:'+identity(media))}">${singleMediaHtml(media,layout.width,layout.height).replace('class="pixmax-player-mount"','class="pixmax-player-mount" data-reshoot-source-player')}</div>`;
    }
    async function captureSource(id,frames){
        const node=nodes.find(item=>item.id===id);if(!previewMedia(node)||isSmartCanvasLocked())return toast('当前无法保存源视频截图');
        const source=sourceFor(node),owner=source.source||node,valid=owned(node),files=frames.map(frame=>new File([frame.blob],frame.fileName,{type:frame.blob.type}));
        const uploaded=await uploadFiles(files);if(!valid())return;
        if(uploaded.length!==files.length)throw new Error('截图上传失败');
        pushUndo();uploaded.forEach((item,index)=>{const result=createNode(node.x+nodeRect(node).width+80,node.y+index*240,[item],{skipUndo:true,select:false});result.label=(owner.label||'片段重拍')+'-截帧';connectInputNode(owner.id,result.id);});
        render();scheduleSave();toast('截图已插入画布');
    }
    function owned(node,root){
        const origin=canvas,owner=scope(),base=canvasTaskWriteGuard(node),source=sourceFor(node),key=identity(source.media);
        return ()=>{try{return (!root||root.isConnected)&&canvas===origin&&scope()===owner&&base.valid()&&!isSmartCanvasLocked()&&identity(sourceFor(node).media)===key;}catch{return false;}};
    }
    async function duration(media){
        if(Number.isFinite(media.duration)&&media.duration>0)return media.duration;
        const video=document.createElement('video');video.preload='metadata';video.src=displayMediaUrl(media);
        try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('视频时长读取超时')),8000);video.onloadedmetadata=()=>{clearTimeout(timer);Number.isFinite(video.duration)&&video.duration>0?resolve(video.duration):reject(new Error('源视频时长不可用'));};video.onerror=()=>{clearTimeout(timer);reject(new Error('源视频不可用'));};});}
        finally{video.removeAttribute('src');video.load();}
    }
    async function create(id,index){
        const source=nodes.find(node=>node.id===id),media=source?.images?.[index];if(!window.CanvasSession?.enabled||isSmartCanvasLocked()||mediaKindForItem(media)!=='video')return;
        const selected=models()[0];if(!selected)return toast('请配置支持视频编辑的 Seedance 2.5 模型');
        const origin=canvas,base=canvasTaskWriteGuard(source),key=identity(media);
        const creationKey=JSON.stringify([scope(),canvas.id,id,key]);if(creating.has(creationKey))return;creating.add(creationKey);
        try{
            const [api,seconds]=await Promise.all([runtime(),duration(media)]);
            if(canvas!==origin||!base.valid()||identity(source.images?.[index])!==key)return;
            const status=api.durationStatus(seconds);if(status)throw new Error(status==='too-short'?'视频时长需大于 4 秒':'视频时长不能超过 10 分钟');
            pushUndo();const node=createNode((source.x||0)+nodeRect(source).width+80,source.y||0,[],{generationKind:'video',skipUndo:true,deferRender:true});
            node.label=pixmaxUniqueNodeLabel((source.label||media.name||'视频')+'-片段重拍');
            node.runSettings={...node.runSettings,engine:selected.provider.id==='volcengine'?'volcengine':'api',apiKind:'video',videoProvider:selected.provider.id,videoModel:selected.model,videoTaskMode:'edit',videoDuration:4,videoAspect:'adaptive',videoGenerateAudio:true,videoOutputFormat:'mp4',count:1};
            const resolutions=smartVideoResolutions(node.runSettings);node.runSettings.videoResolution=resolutions.includes('720p')?'720p':resolutions[0]||'';
            node.segmentReshoot={schemaVersion:1,source:{nodeId:id,url:media.url,media:{...media},identity:key,duration:seconds},startSec:0,endSec:4,prompt:''};
            canvas.connections.push({from:id,to:node.id,kind:'input'});render();scheduleSave();await open(node);
        }catch(error){toast(error.message||'创建片段重拍节点失败');}finally{creating.delete(creationKey);}
    }
    function signature(node){const state=node.segmentReshoot;return JSON.stringify([scope(),canvas.id,node.id,state.source.identity,state.startSec,state.endSec]);}
    async function prepare(node,valid,status){
        const api=await runtime();if(!valid())throw new Error('来源或编辑资格已变化');
        const state=node.segmentReshoot,original=signature(node),source=sourceFor(node),params=api.params({}, {sourceAssetUuid:state.source.identity,startSec:state.startSec,endSec:state.endSec});
        const current=()=>valid()&&signature(node)===original;
        let job=jobs.get(original);if(!job){job={files:null,uploaded:new Map(),running:null};jobs.set(original,job);}
        if(job.running)return job.running;
        const work=(async()=>{
            const result=await api.prepare({params,cache:state.cache,sourceUrl:displayMediaUrl(source.media),onPrepare:()=>{status.textContent='正在准备裁剪片段和首尾帧…';},loadSource:async url=>{const response=await fetch(url);if(!response.ok)throw new Error('视频读取失败');return response.blob();},buildFiles:async options=>{if(!current())throw new Error('片段已变化');if(!job.files){const files=await api.buildFiles(options);if(files.ok)job.files=files;}return job.files;},upload:async file=>{
                if(!current())return {ok:false};if(job.uploaded.has(file.name))return {ok:true,assetUuid:job.uploaded.get(file.name).url};
                try{const [value]=await uploadFiles([file]);if(!current()||!value?.url)return {ok:false};job.uploaded.set(file.name,value);return {ok:true,assetUuid:value.url};}catch{return {ok:false};}
            }});
            if(!current())throw new Error('片段、来源或编辑资格已变化，未写入处理结果');
            if(!result.ok)throw new Error('片段裁剪或上传失败，本地处理结果已保留，可重试');
            state.cache=result.cache;state.preparedMedia=[{url:result.cache.clipAssetUuid,kind:'video'},{url:result.cache.headFrameAssetUuid,kind:'image'},{url:result.cache.tailFrameAssetUuid,kind:'image'}];node.runSettings.videoTempShLinks=[{manual:true,url:result.cache.clipAssetUuid}];scheduleSave();
            if(!await saveCanvas({force:true}))throw new Error('重拍片段已准备，但画布尚未保存，请重试保存');
            if(!current())throw new Error('编辑资格已变化');
            job.files=null;job.uploaded.clear();jobs.delete(original);return result.cache;
        })();job.running=work;try{return await work;}finally{job.running=null;}
    }
    async function submit(node,root,status){
        const valid=owned(node,root),state=node.segmentReshoot;
        if(!valid())throw new Error('视频来源或编辑资格已变化');
        if(state.taskId&&state.completedTaskId!==state.taskId){
            status.textContent='正在查询原重拍任务…';const response=await CanvasApi.getCanvasVideoTaskRequest(state.taskId);
            if(!response.ok)throw new Error('原重拍任务尚未确认，请稍后继续查询');const record=await response.json();if(!valid())throw new Error('编辑资格已变化');
            if(record.status==='failed'){delete state.taskId;scheduleSave();throw new Error(record.error?.message||record.error||'原重拍任务失败，请核对参数后重新提交');}
            if(record.status!=='succeeded'){status.textContent='原重拍任务仍在处理中，请稍后继续查询';return;}
            const binding=await CanvasTaskBindings.recover({task:record,taskId:state.taskId,canvasId:canvas.id,kind:'smart',sourceId:node.id,targetId:node.id,read:smartTaskInputDocument,valid});
            await commitSmartStudioTaskResult(node,record,'video',binding,{valid,recovered:true,prepareResult:()=>{if(!smartPendingTasks(node).some(task=>task.taskId===state.taskId)){node.pendingTasks=[...smartPendingTasks(node),{taskId:state.taskId,kind:'video',providerId:node.runSettings.videoProvider,model:node.runSettings.videoModel}];node.pending=Math.max(1,node.pending||0);}}});
            if(valid()){state.completedTaskId=state.taskId;scheduleSave();status.textContent='重拍结果已加入画布';}return;
        }
        PixmaxReshootReferences.validate(node);
        if(!models().some(item=>item.provider.id===node.runSettings.videoProvider&&item.model===node.runSettings.videoModel))throw new Error('模型配置已变化，请重新选择');
        PixmaxReshootParameters.validate(node);
        const references=PixmaxReshootReferences.signature(node);
        const cache=await prepare(node,valid,status);if(!valid())throw new Error('编辑资格已变化');
        if(PixmaxReshootReferences.signature(node)!==references)throw new Error('提示词、模型或参考素材已变化，请再次生成');
        const choice=models().find(item=>item.provider.id===node.runSettings.videoProvider&&item.model===node.runSettings.videoModel);if(!choice)throw new Error('模型配置已变化，请重新选择');
        const request=PixmaxReshootReferences.request(node,executionSettings(node,node.runSettings));
        pushUndo();state.taskId=uid('canvas_vid');delete state.completedTaskId;
        const guard=canvasTaskWriteGuard(node),binding=smartTaskInputBinding(node,node,{valid,check(){if(!valid())throw new Error('来源或编辑资格已变化');}});
        const params=request.settings,prompt=request.prompt;status.textContent='正在提交片段重拍…';
        try{
            const result=await runApiVideoGeneration(prompt,request.refs,params,binding,{taskId:state.taskId});
            guard.check();await queueAndResumeSmartApiTasks(node,result,{kind:'video',archiveExisting:false});
            if(valid()){state.completedTaskId=state.taskId;scheduleSave();status.textContent='重拍结果已加入画布';}
        }catch(error){if(valid()&&error.status>=400&&error.status<500){delete state.taskId;scheduleSave();}throw error;}
    }
    async function open(node){
        if(!nodes.includes(node)||!node.segmentReshoot||isSmartCanvasLocked())return;
        const attempt=++openAttempt;
        let source,api;try{
            source=sourceFor(node);const accepted=owned(node);
            [api]=await Promise.all([runtime(),(async()=>{
                if(!(node.segmentReshoot.source.duration>0)){const seconds=await duration(source.media);if(!accepted())return;node.segmentReshoot.source.duration=seconds;scheduleSave();}
            })()]);
            if(!accepted()||attempt!==openAttempt)return;
            const state=node.segmentReshoot,status=api.durationStatus(state.source.duration);
            if(status)throw new Error(status==='too-short'?'视频时长需大于 4 秒':'视频时长不能超过 10 分钟');
            if(!Number.isFinite(state.startSec)||!Number.isFinite(state.endSec)||state.startSec<0||state.endSec-state.startSec<4-1e-6||state.endSec-state.startSec>30+1e-6||state.endSec>state.source.duration+1e-6)throw new Error('片段范围无效，请从源视频重新选择');
        }catch(error){return toast(error.message);}
        dispose(activeSession);
        const root=pixmaxCreationModal('片段重拍'),body=root.querySelector('.pixmax-creation-content'),status=root.querySelector('[role=status]'),state=node.segmentReshoot,valid=owned(node,root);
        root.classList.add('pixmax-segment-reshoot-modal');
        body.innerHTML=`<div class="pixmax-reshoot-preview-player" data-reshoot-player></div><p class="pixmax-creation-hint">选择 4–30 秒片段，描述需要修改的内容。</p><div class="pixmax-reshoot-range"><div class="pixmax-reshoot-native-timeline" data-reshoot-timeline aria-label="重拍视频选段"></div><div class="pixmax-reshoot-time-fields"><label>开始时间<input type="number" data-reshoot-start min="0" max="${state.source.duration}" step="0.1" aria-label="重拍开始时间"></label><label>结束时间<input type="number" data-reshoot-end min="0" max="${state.source.duration}" step="0.1" aria-label="重拍结束时间"></label></div><output data-reshoot-summary></output></div><label>重拍要求<textarea data-reshoot-prompt maxlength="10000" aria-label="重拍要求" placeholder="也可以写要改什么，例如：把头发换成红色">${escapeHtml(state.prompt)}</textarea></label><div class="pixmax-reshoot-model"><span>生成模型</span><div data-reshoot-model></div></div><button type="button" data-reshoot-prepare>准备片段</button><button type="button" data-reshoot-run class="pixmax-creation-primary">${state.taskId&&state.completedTaskId!==state.taskId?'查询原重拍任务':'生成重拍视频'}</button>`;
        let edited=false,busy=false;
        const target=body.querySelector('[data-reshoot-timeline]'),session={root,video:null,canvasId:canvas.id,scope:scope(),node,valid,closed:false,timeline:null,scrubbing:false,seekTimer:null,lastSeek:0,pendingSeek:null};activeSession=session;
        const oldPrompt=body.querySelector('[data-reshoot-prompt]'),promptTarget=document.createElement('div');promptTarget.dataset.reshootPrompt='';promptTarget.className='pixmax-reshoot-rich-prompt';oldPrompt.replaceWith(promptTarget);
        const modelTarget=body.querySelector('[data-reshoot-model]');
        const parameterTarget=document.createElement('div');parameterTarget.dataset.reshootParameters='';modelTarget.parentElement.after(parameterTarget);
        let modelStamp='';session.refreshModel=()=>{const data=PixmaxReshootParameters.modelData(node),stamp=JSON.stringify(data);session.modelHasOptions=data.options.length>0;if(modelStamp!==stamp){modelStamp=stamp;session.modelHandle?.setData(data);}};
        session.refreshParameters=()=>{if(session.parameterDefinition&&!session.closed)session.parametersHandle?.setData(PixmaxReshootParameters.data(node,session.parameterDefinition));};
        const referenceArea=document.createElement('section');referenceArea.className='pixmax-reshoot-references';referenceArea.innerHTML='<header><span>参考素材</span><button type="button" data-reshoot-add-canvas>添加画布参考</button><button type="button" data-reshoot-add-asset>添加资产参考</button></header><div data-reshoot-references></div>';promptTarget.closest('label').before(referenceArea);
        let video;try{video=mountPlayer(api,session,source.media);}catch(error){dispose(session);return toast(error.message);}
        const draw=()=>{body.querySelector('[data-reshoot-start]').value=state.startSec;body.querySelector('[data-reshoot-end]').value=state.endSec;body.querySelector('[data-reshoot-summary]').textContent=`${state.startSec.toFixed(1)} – ${state.endSec.toFixed(1)} · ${(state.endSec-state.startSec).toFixed(1)}s`;session.timeline?.setRange({startSec:state.startSec,endSec:state.endSec});session.refreshParameters();};draw();
        const sync=()=>{const disabled=busy||!valid();body.querySelectorAll('input,textarea,select,button').forEach(control=>{if(!control.closest('[data-reshoot-player],[data-reshoot-parameters],[data-reshoot-model]'))control.disabled=disabled;});target.inert=disabled;session.timeline?.setDisabled(disabled);session.promptHandle?.setReadonly(disabled);session.parametersHandle?.setDisabled(disabled);session.modelHandle?.setDisabled(disabled||!session.modelHasOptions);};session.sync=sync;
        let referenceStamp='';
        function refreshReferences(){
            if(session.closed)return;const current=PixmaxReshootReferences.plan(node),stamp=JSON.stringify([current.mentions,current.incomingNodes]);if(stamp===referenceStamp)return;referenceStamp=stamp;
            const list=referenceArea.querySelector('[data-reshoot-references]');list.replaceChildren();
            for(const entry of current.resources){
                const row=document.createElement('span');row.className='pixmax-reshoot-reference';const insert=document.createElement('button');insert.type='button';insert.textContent=entry.alias+' · '+entry.name;insert.dataset.reshootMention=entry.id;
                insert.onclick=()=>{if(!valid()||busy)return;const item=PixmaxReshootReferences.plan(node).mentions.find(item=>item.id===entry.id);if(item)session.promptHandle?.insertMention(item);};row.appendChild(insert);
                if(!entry.crop){const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','移除参考 '+entry.name);remove.onclick=()=>{if(valid()&&!busy)PixmaxReshootReferences.remove(node,entry);};row.appendChild(remove);}list.appendChild(row);
            }
            session.promptHandle?.setReferences({mentionItems:current.mentions,incomingNodes:current.incomingNodes});sync();
        }
        session.refreshReferences=refreshReferences;refreshReferences();
        function pickerModel(){
            if(!valid())return {cited:[],allowedCategories:[],canvasItems:[]};const current=PixmaxReshootReferences.plan(node),included=new Set(current.resources.map(entry=>entry.nodeId));
            return {cited:current.mentions,allowedCategories:['text','image','audio'],canvasItems:nodes.filter(source=>source!==node&&!source.hidden&&(!included.has(source.id)||(node.blockedInputRefs||[]).some(key=>key.startsWith(source.id+'|')))).map(source=>{
                const category=source.type==='smart-prompt'?'text':mediaKindForItem(source.images?.[0]);return {id:source.id,category,label:source.label||source.text?.slice(0,40)||source.images?.[0]?.name||'节点',thumbnailUrl:category==='image'?smartMediaPreviewUrl(source.images?.[0],256):undefined,disabled:!['text','image','audio'].includes(category)};
            }).filter(item=>!item.disabled)};
        }
        async function pick(fromAssets){
            if(!valid()||busy)return;const picker=pixmaxCreationModal(fromAssets?'添加资产参考':'添加画布参考'),content=picker.querySelector('.pixmax-creation-content');(session.pickers||=new Set()).add(picker);picker.classList.add('pixmax-reshoot-reference-picker');
            const search=document.createElement('input');search.type='search';search.placeholder='搜索参考素材';search.setAttribute('aria-label','搜索参考素材');const list=document.createElement('div');list.className='pixmax-reshoot-reference-candidates';content.append(search,list);
            let items=[];
            const draw=()=>{list.replaceChildren();for(const entry of items.filter(entry=>entry.name.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()))){const button=document.createElement('button');button.type='button';button.textContent=entry.name;button.dataset.reshootCandidate=entry.id;button.onclick=()=>{
                if(!picker.isConnected||!valid()||busy)return;const id=fromAssets?PixmaxReshootReferences.addAsset(node,entry.item):PixmaxReshootReferences.connect(node,entry.id)?entry.id:null;
                if(!id){picker.querySelector('[role=status]').textContent='无法连接该参考，请检查素材或循环连接';return;}picker.remove();session.pickers.delete(picker);refreshReferences();
            };list.appendChild(button);}};search.oninput=draw;
            if(fromAssets){try{const response=await CanvasApi.getAssetLibrary();if(!picker.isConnected||!valid())return;const library=response.library||response;const categories=(library.libraries||[{categories:library.categories||[]}]).flatMap(lib=>lib.categories||[]);items=categories.flatMap(category=>category.items||[]).filter(item=>item.url&&['image','video','audio'].includes(assetMediaKind(item))).map(item=>({id:item.id||item.url,name:item.name||'素材',item}));}catch(error){if(picker.isConnected&&valid())picker.querySelector('[role=status]').textContent=error.message||'素材加载失败';}}
            else items=pickerModel().canvasItems.map(item=>({id:item.id,name:item.label}));draw();
        }
        referenceArea.querySelector('[data-reshoot-add-canvas]').onclick=()=>void pick(false);referenceArea.querySelector('[data-reshoot-add-asset]').onclick=()=>void pick(true);
        session.observer=new MutationObserver(()=>{if(!root.isConnected)dispose(session);});session.observer.observe(document.body,{childList:true});
        function changeRange(range){if(!valid()||busy||Math.abs(range.startSec-state.startSec)<.001&&Math.abs(range.endSec-state.endSec)<.001)return;if(!edited){pushUndo();edited=true;}Object.assign(state,range);Object.assign(node.runSettings,PixmaxReshootParameters.settings(node));delete state.cache;delete state.preparedMedia;node.runSettings.videoTempShLinks=[];draw();scheduleSave();}
        function seek(seconds,final=false){
            if(!valid()||busy||session.closed)return;const time=Math.min(state.source.duration,Math.max(0,seconds));session.timeline?.setPlayheadTime(time);
            session.pendingSeek=time;const apply=()=>{session.seekTimer=null;if(!valid()||busy||session.closed)return;const value=session.pendingSeek;session.pendingSeek=null;session.lastSeek=performance.now();if(value!==null&&Math.abs(video.currentTime-value)>=.05){if(session.controller)session.controller.seek(value);else video.currentTime=value;}};
            if(final||performance.now()-session.lastSeek>=60){clearTimeout(session.seekTimer);apply();}else if(session.seekTimer===null)session.seekTimer=setTimeout(apply,60-(performance.now()-session.lastSeek));
        }
        const playback=event=>{if(event.type==='play')session.startingPlayback=true;if(event.type==='pause')session.startingPlayback=false;if(session.closed||video.seeking)return;session.timeline?.setPlayheadTime(video.currentTime);if(session.scrubbing||video.paused)return;if(session.startingPlayback){session.startingPlayback=false;if(video.currentTime<state.startSec-.05||video.currentTime>=state.endSec-.05){video.currentTime=state.startSec;session.timeline?.setPlayheadTime(state.startSec);return;}}if(video.currentTime<state.startSec-.05)video.currentTime=state.startSec;else if(video.currentTime>=state.endSec-.05){video.pause();video.currentTime=state.endSec;}};
        for(const event of ['timeupdate','seeked','play','pause'])video.addEventListener(event,playback);
        session.cleanupVideo=()=>{for(const event of ['timeupdate','seeked','play','pause'])video.removeEventListener(event,playback);};
        function draft(event){if(!event.target.matches('[data-reshoot-start],[data-reshoot-end],[data-reshoot-prompt]')||!valid()||busy)return;if(!edited){pushUndo();edited=true;}
            if(event.target.matches('[data-reshoot-start],[data-reshoot-end]')){changeRange(api.normalizeRange(Number(body.querySelector('[data-reshoot-start]').value),Number(body.querySelector('[data-reshoot-end]').value),state.source.duration));seek(state.startSec,true);}
            session.refreshParameters();scheduleSave();
        }
        body.addEventListener('input',draft);body.addEventListener('change',draft);
        async function perform(run){if(busy)return;busy=true;sync();
            try{if(run)await submit(node,root,status);else{await prepare(node,valid,status);status.textContent='裁剪片段及首尾帧已准备并保存';}}
            catch(error){if(root.isConnected)status.textContent=error.message||'片段重拍暂未完成';}
            finally{busy=false;if(!session.closed){sync();body.querySelector('[data-reshoot-run]').textContent=state.taskId&&state.completedTaskId!==state.taskId?'查询原重拍任务':'生成重拍视频';}}
        }
        body.querySelector('[data-reshoot-prepare]').onclick=()=>void perform(false);body.querySelector('[data-reshoot-run]').onclick=()=>void perform(true);
        try{
            const modelHandle=await api.mountModelSelector(modelTarget,{...PixmaxReshootParameters.modelData(node),placeholder:'请选择已配置的 Seedance 2.5 模型',disabled:busy||!valid(),onChange:value=>{
                if(!valid()||busy)return;const choice=models().find(item=>item.value===value);if(!choice){status.textContent='模型配置已变化，请重新选择';session.refreshModel();return;}
                if(node.runSettings.videoProvider===choice.provider.id&&node.runSettings.videoModel===choice.model)return;
                if(!edited){pushUndo();edited=true;}Object.assign(node.runSettings,{videoProvider:choice.provider.id,videoModel:choice.model,engine:choice.provider.id==='volcengine'?'volcengine':'api'});PixmaxReshootParameters.modelChanged(node);session.refreshModel();session.refreshParameters();render();scheduleSave();
            }});
            if(session.closed||activeSession!==session||!root.isConnected){void modelHandle.destroy();return;}session.modelHandle=modelHandle;session.refreshModel();sync();
            session.parameterDefinition=await PixmaxReshootParameters.schema();if(session.closed||activeSession!==session||!root.isConnected)return;
            const parametersHandle=await api.mountParameters(parameterTarget,{...PixmaxReshootParameters.data(node,session.parameterDefinition),disabled:busy||!valid(),onChange:value=>{if(!valid()||busy)return;try{if(!edited){pushUndo();edited=true;}PixmaxReshootParameters.apply(node,value);session.refreshParameters();render();scheduleSave();}catch(error){status.textContent=error.message;session.refreshParameters();}}});
            if(session.closed||activeSession!==session||!root.isConnected){void parametersHandle.destroy();return;}session.parametersHandle=parametersHandle;sync();
            const timeline=await api.mountTimeline(target,{videoUrl:displayMediaUrl(source.media),knownDuration:state.source.duration,startSec:state.startSec,endSec:state.endSec,
                onChange:changeRange,onSeek:seconds=>seek(seconds,true),onScrub:seconds=>{session.scrubbing=true;seek(seconds);},onScrubEnd:seconds=>{session.scrubbing=false;seek(seconds,true);}});
            if(session.closed||activeSession!==session||!root.isConnected){void timeline.destroy();return;}
            session.timeline=timeline;draw();sync();
            const current=PixmaxReshootReferences.plan(node);
            const promptHandle=await api.mountPrompt(promptTarget,{value:state.prompt,maxLength:10000,ariaLabel:'重拍要求',placeholder:'也可以写要改什么，例如：把头发换成红色',previewZIndex:100150,onNotice:message=>{if(valid())toast(message);},readonly:busy||!valid(),references:{mentionItems:current.mentions,incomingNodes:current.incomingNodes},
                atMentionPicker:{getModel:pickerModel,connect:id=>valid()&&!busy&&PixmaxReshootReferences.connect(node,id)},
                onChange:value=>{if(!valid()||busy||value===state.prompt)return;if(!edited){pushUndo();edited=true;}PixmaxReshootReferences.setPrompt(node,value);session.promptHandle?.setValue(value);scheduleSave();}});
            if(session.closed||activeSession!==session||!root.isConnected){void promptHandle.destroy();return;}session.promptHandle=promptHandle;promptHandle.setValue(state.prompt);sync();
        }catch(error){if(!session.closed)status.textContent=error.message||'选段时间轴加载失败';}
    }
    function documentChanged(){
        if(activeSession){if(activeSession.canvasId!==canvas?.id||activeSession.scope!==scope()||!nodes.includes(activeSession.node))dispose(activeSession);else{activeSession.refreshReferences?.();activeSession.refreshModel?.();activeSession.refreshParameters?.();activeSession.sync();}}
        window.dispatchEvent(new Event('pixmax-reshoot-preview-changed'));
        for(const node of nodes.filter(node=>node.segmentReshoot?.schemaVersion===1)){
            const element=world.querySelector(`.image-node[data-id="${CSS.escape(node.id)}"] .node-body`);if(!element)continue;const existing=element.querySelector('[data-reshoot-open]');if(existing){existing.disabled=isSmartCanvasLocked();continue;}
            const button=document.createElement('button');button.type='button';button.dataset.reshootOpen='';button.className='pixmax-reshoot-open';button.textContent='片段重拍 · 选择片段';button.disabled=isSmartCanvasLocked();button.onclick=event=>{event.stopPropagation();void open(node);};element.appendChild(button);
        }
    }
    function configurationChanged(){if(activeSession&&!activeSession.closed){activeSession.refreshModel?.();activeSession.refreshParameters?.();activeSession.sync();}}
    function executionSettings(node,config){
        const state=node.segmentReshoot,cache=state?.cache;if(state?.schemaVersion!==1)return config;
        if(!models().some(item=>item.provider.id===config.videoProvider&&item.model===config.videoModel))throw new Error('片段重拍需要可用的 Seedance 2.5 视频编辑模型');
        sourceFor(node);
        if(!cache||cache.reshootSourceAssetUuid!==state.source.identity||Number(cache.reshootStartSec)!==state.startSec||Number(cache.reshootEndSec)!==state.endSec)throw new Error('请先准备片段重拍的裁剪视频及首尾帧');
        return {...PixmaxReshootParameters.validate(node,config),videoTempShLinks:[{manual:true,url:cache.clipAssetUuid}]};
    }
    function remapReferences(node,idMap,{connected=true,referenceNodes=[],preservePrepared=false}={}){
        const state=node.segmentReshoot;if(state?.schemaVersion!==1)return;
        const originalIdentity=state.source.identity,previousSource=state.source.nodeId;
        state.source.nodeId=connected?idMap.get(state.source.nodeId)||'':'';
        const source=referenceNodes.find(item=>item.id===state.source.nodeId),videos=source?.images?.filter(item=>mediaKindForItem(item)==='video')||[],media=videos.find(item=>identity(item)===identity(state.source.media)||identity(item)===originalIdentity)||(videos.length===1?videos[0]:null);
        if(media){state.source.url=media.url;state.source.media={...media};state.source.identity=identity(media);}
        else if(state.source.media){state.source.url=state.source.media.url;state.source.identity=identity(state.source.media);}
        window.PixmaxReshootReferences?.remap(node,idMap,previousSource);
        delete state.taskId;delete state.completedTaskId;
        const cache=state.cache,prepared=state.preparedMedia;
        const keep=preservePrepared&&originalIdentity===state.source.identity&&cache?.reshootSourceAssetUuid===state.source.identity&&Number(cache.reshootStartSec)===state.startSec&&Number(cache.reshootEndSec)===state.endSec&&Array.isArray(prepared)&&prepared.length===3&&[cache.clipAssetUuid,cache.headFrameAssetUuid,cache.tailFrameAssetUuid].every((url,index)=>typeof url==='string'&&/^(https?:\/\/|\/[^/])/.test(url)&&prepared[index]?.url===url&&mediaKindForItem(prepared[index])===(index?'image':'video'));
        if(!keep){delete state.cache;delete state.preparedMedia;if(node.runSettings)node.runSettings.videoTempShLinks=[];}
    }
    window.PixmaxSegmentReshoot=Object.freeze({create,open,preview,previewMedia,previewBody,captureSource,documentChanged,configurationChanged,executionSettings,remapReferences,available:()=>Boolean(window.CanvasSession?.enabled&&models().length)});
    window.addEventListener('pagehide',event=>{if(!event.persisted)dispose(activeSession);else activeSession?.video.pause();});
})();
