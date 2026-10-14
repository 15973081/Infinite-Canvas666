/* Native video marking UI; graph writes and upload ownership stay in this app. */
(() => {
    'use strict';
    let session,runtimePromise,pageExitAllowed=false;
    const scope=()=>window.CanvasSession?.enabled?window.CanvasSession.context?.member?.id+':'+window.CanvasSession.context?.workspace?.id:'local';
    const mediaKey=item=>JSON.stringify([item?.url,item?.kind||'video',item?.media_asset_id||'']);
    const hasUnfinishedWork=()=>!!session&&!session.closed&&(session.running||session.files.length>0||
        (session.marker?.listMarks().length||0)>0&&(!session.stage?.saved||session.revision!==session.stage.revision));
    function documentChanged(){if(session&&(session.canvasId!==canvas?.id||session.scope!==scope()))dispose(session);}
    function dispose(current){
        current.closed=true;current.root.remove();current.files=[];
        current.unsubscribeMarker?.();current.unsubscribeDocument?.();
        if(current.instance)void current.runtime.unmountCanvasVideoAnnotation(current.instance);
        if(session===current)session=null;
    }
    function bindMarker(current,marker){
        current.marker=marker;feedback(current,'');
        current.unsubscribeMarker=marker.subscribe(state=>{
            if(state.status==='ready'&&!current.unsubscribeDocument)current.unsubscribeDocument=marker.getMarkEditor().on('documentchange',()=>current.revision++);
        });
    }
    function feedback(current,message){
        if(!current.root.isConnected||scope()!==current.scope)return;
        current.root.querySelector('[role=status]').textContent=message;
        const downloads=current.root.querySelector('[data-annotation-downloads]');downloads.replaceChildren();
        for(const file of current.files){
            const button=document.createElement('button');button.type='button';button.textContent='下载 '+file.name;
            button.onclick=()=>{if(scope()===current.scope)downloadBlob(file,file.name);};downloads.appendChild(button);
        }
    }
    async function sameFiles(left,right){
        if(left.length!==right.length)return false;
        for(let index=0;index<left.length;index++){
            if(left[index].name!==right[index].name||left[index].size!==right[index].size)return false;
            const a=new Uint8Array(await left[index].arrayBuffer()),b=new Uint8Array(await right[index].arrayBuffer());
            if(a.some((value,offset)=>value!==b[offset]))return false;
        }
        return true;
    }
    function nativeNode(node){
        const media=node.images?.[0];
        return {id:node.id,type:node.generationKind==='video'?'video-gen':media?.kind==='video'?'video':'image',
            data:{label:node.label||'',url:media?.url,params:{prompt:node.promptDraftText||''}}};
    }
    function remapReferences(node,idMap,{connected=true,referenceNodes=[]}={}){
        if(!Array.isArray(node.annotationImageNodeIds))return;
        const mapped=id=>connected?idMap.get(id)||'':'';
        node.annotationSourceNodeId=mapped(node.annotationSourceNodeId);
        node.annotationImageNodeIds=node.annotationImageNodeIds.map(mapped).filter(Boolean);
        if(typeof node.pixmaxAnnotationPrompt==='string')node.pixmaxAnnotationPrompt=node.pixmaxAnnotationPrompt.replace(/\(([^)]+)\)%%/g,(_match,id)=>'('+mapped(id)+')%%');
        if(typeof node.promptDraftHtml==='string'){
            const template=document.createElement('template');template.innerHTML=node.promptDraftHtml;
            template.content.querySelectorAll('.mention-image-token[data-node-id]').forEach(token=>{
                const id=mapped(token.dataset.nodeId),index=Number(token.dataset.imageIndex||0),media=referenceNodes.find(owner=>owner.id===id)?.images?.[index];
                if(media){const fresh=document.createElement('template');fresh.innerHTML=mentionTokenHtml({...media,nodeId:id,imageIndex:index,name:token.dataset.name,referenceLabel:token.lastElementChild?.textContent});token.replaceWith(fresh.content.firstElementChild);}
                else token.dataset.nodeId=id;
            });
            node.promptDraftHtml=template.innerHTML;
        }
        if(Array.isArray(node.runPromptRefs))node.runPromptRefs=node.runPromptRefs.map(ref=>({...ref,nodeId:mapped(ref.nodeId)}));
    }
    function confirmSaved(document){
        const current=session,stage=current?.stage;
        if(!stage?.inserted||stage.saved||!document||document.id!==current.canvasId||scope()!==current.scope)return;
        if(!stage.images.every(image=>document.nodes?.some(node=>node.id===image.id&&node.images?.some(media=>media.url===image.media.url))))return;
        if(!document.nodes?.some(node=>node.id===stage.genId&&node.annotationSourceNodeId===current.sourceId&&
            JSON.stringify(node.annotationImageNodeIds)===JSON.stringify(stage.images.map(image=>image.id))))return;
        if(![current.sourceId,...stage.images.map(image=>image.id)].every(id=>document.connections?.some(edge=>edge.from===id&&edge.to===stage.genId)))return;
        stage.saved=true;current.files=[];feedback(current,'标记结果已保存到画布');
    }
    async function open(nodeId,index=0){
        const source=nodes.find(node=>node.id===nodeId),item=source?.images?.[index];
        if(!item||mediaKindForItem(item)!=='video'||isSmartCanvasLocked())return;
        if(session&&!session.closed){toast('请先保存或退出当前视频标记');return;}
        const origin=canvas,expected=scope(),sourceKey=mediaKey(item),base=canvasTaskWriteGuard(source);
        const root=document.createElement('section');root.className='pixmax-video-annotation-host';root.setAttribute('aria-label','视频画面标记');
        root.innerHTML='<div data-native-video-annotation></div><aside class="pixmax-annotation-feedback"><p role="status">正在加载视频标记工具…</p><div data-annotation-downloads></div></aside>';
        document.body.appendChild(root);
        const current={root,scope:expected,canvasId:canvas.id,sourceId:nodeId,sourceKey,files:[],closed:false,running:false,marker:null,revision:0};session=current;
        const valid=()=>!current.closed&&session===current&&canvas===origin&&scope()===expected&&nodes.includes(source)&&!isSmartCanvasLocked()&&base.valid()&&source.images?.some(media=>mediaKey(media)===sourceKey);
        function check(){documentChanged();if(!valid())throw new Error('来源、画布或编辑资格已变化，标记结果没有写入画布');}
        const guarded=work=>async(...args)=>{
            current.running=true;
            try{return await work(...args);}catch(error){feedback(current,error.message||'保存标记失败');throw error;}
            finally{current.running=false;}
        };
        const graph={
            get nodes(){return [...nodes.map(nativeNode),...(current.stage?.images||[]).filter(image=>!nodes.some(node=>node.id===image.id)).map(image=>({id:image.id,type:'image',data:{url:image.media.url,label:image.label}})),
                ...(current.stage?.genId&&!nodes.some(node=>node.id===current.stage.genId)?[{id:current.stage.genId,type:'video-gen',data:{params:{}}}]:[])];},
            get edges(){const stage=current.stage;return [...(canvas.connections||[]).map(edge=>({source:edge.from,target:edge.to})),
                ...(stage?.genId&&!stage.inserted?[current.sourceId,...stage.images.map(image=>image.id)].map(id=>({source:id,target:stage.genId})):[])];},
            updateGenNodeResult(id,result){check();if(id!==current.stage?.genId)throw new Error('标记生成节点不一致');current.stage.nativePrompt=result.params.prompt;}
        };
        const controller={
            insertFilesBesideSourceNode:guarded(async({sourceNodeId,files})=>{
                check();if(sourceNodeId!==nodeId)throw new Error('标记来源不一致');
                const previous=current.stage;
                if(previous?.saved&&previous.revision===current.revision&&[previous.genId,...previous.images.map(image=>image.id)].every(id=>nodes.some(node=>node.id===id)))return previous.images.map(image=>({id:image.id}));
                if(previous&&!previous.saved&&await sameFiles(current.files,files)){check();previous.revision=current.revision;return previous.images.map(image=>({id:image.id}));}
                if(previous?.inserted&&!previous.saved)throw new Error('上次标记结果尚未保存，请先保存画布后重试');
                current.files=[...files];feedback(current,'正在上传标记画面…');
                const uploaded=await uploadFiles(files);check();
                if(uploaded.length!==files.length||uploaded.some(media=>!media?.url))throw new Error('标记图片上传不完整，本地图片已保留，请重试');
                current.stage={images:uploaded.map((media,offset)=>({id:uid('mark'),media:{...media,kind:'image',sourceMediaUrl:item.url,processingTool:'video-annotation'},label:files[offset].name.replace(/\.png$/i,'')})),inserted:false,saved:false,revision:current.revision};
                return current.stage.images.map(image=>({id:image.id}));
            }),
            flowPositionBesideSourceNode(){check();const rect=nodeRect(source);return {x:rect.x+rect.width+100,y:rect.y};},
            addGenNodeWithConnection(_kind,position,connection,options){
                check();const stage=current.stage;if(!stage||connection.source!==nodeId||options.extraSourceIds.join(',')!==stage.images.map(image=>image.id).join(','))throw new Error('标记引用不完整');
                stage.genId ||= uid('annotated-video');stage.position=position;return stage.genId;
            },
            commit:guarded(async()=>{
                check();const stage=current.stage;if(!stage?.genId)throw new Error('标记结果不完整');
                if(!stage.inserted){
                    pushUndo();let y=stage.position.y;
                    stage.images.forEach(image=>{const node=createNode(stage.position.x,y,[image.media],{id:image.id,skipUndo:true,select:false,deferRender:true});node.label=image.label;y+=nodeRect(node).height+60;});
                    const gen=createNode(stage.position.x+360,stage.position.y,[],{id:stage.genId,skipUndo:true,select:false,deferRender:true,generationKind:'video'});
                    gen.annotationSourceNodeId=nodeId;gen.annotationImageNodeIds=stage.images.map(image=>image.id);gen.pixmaxAnnotationPrompt=stage.nativePrompt;
                    gen.promptDraftText=stage.promptText=stage.images.map(image=>'@'+image.label).join(' ');
                    gen.promptDraftHtml=stage.images.map(image=>mentionTokenHtml({...image.media,nodeId:image.id,imageIndex:0,name:image.label,referenceLabel:image.label})).join(' ');
                    gen.runSettings.videoTaskMode='edit';
                    [nodeId,...gen.annotationImageNodeIds].forEach(id=>addConnection(id,gen.id,'input'));
                    stage.inserted=true;smartSelection.insertedNodes([gen.id]);render();scheduleSave();
                }else if(![stage.genId,...stage.images.map(image=>image.id)].every(id=>nodes.some(node=>node.id===id)))throw new Error('标记结果节点已移除，请下载本地图片或重新标记');
                if(!await saveCanvas({force:true})||!stage.saved)throw new Error('标记结果已加入画布，但尚未保存，请重试保存');
            })
        };
        root.addEventListener('keydown',event=>event.stopPropagation());
        try{
            const runtime=await (runtimePromise ||= import('/static/vendor/pixmax/editors.js').catch(error=>{runtimePromise=null;throw error;}));check();current.runtime=runtime;
            const instance=await runtime.mountCanvasVideoAnnotation(root.querySelector('[data-native-video-annotation]'),{
                nodeId,sourceLabel:source.label||item.name||'视频',videoUrl:displayMediaUrl(item),naturalWidth:item.natural_w||item.width,naturalHeight:item.natural_h||item.height,
                onMarkerReady:marker=>bindMarker(current,marker),
                onRootReady:element=>{element.classList.add('pixmax-native-video-annotation');element.setAttribute('aria-label','视频画面标记');},onClose:()=>dispose(current)
            },{controller,graph},message=>{if(root.isConnected&&scope()===expected)toast(message);});
            if(!valid()){await runtime.unmountCanvasVideoAnnotation(instance);dispose(current);return;}current.instance=instance;
        }catch(error){feedback(current,error.message||'视频标记工具加载失败');if(!current.instance){const close=document.createElement('button');close.textContent='关闭视频标记';close.onclick=()=>dispose(current);root.querySelector('aside').appendChild(close);}}
    }
    window.addEventListener('beforeunload',event=>{if(!pageExitAllowed&&hasUnfinishedWork()){event.preventDefault();event.returnValue='';}});
    window.addEventListener('pagehide',event=>{if(!event.persisted&&session)dispose(session);});
    window.PixmaxVideoAnnotation=Object.freeze({open,hasUnfinishedWork,confirmSaved,documentChanged,remapReferences,allowPageExit(){pageExitAllowed=true;if(session)dispose(session);}});
})();
