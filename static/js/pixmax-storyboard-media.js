/* Pixmax bulk media creates editable generation nodes, then users submit them. */
(() => {
    'use strict';
    const tokenPattern=/<([^<>\n@]+)@([^<>\n@]+)(?:@([^<>\n@]+))?>/g;
    function promptFor(shot,kind){return String(kind==='video'?shot.videoPrompt||'':shot.prompt||'').trim();}
    function tokens(text){return [...text.matchAll(new RegExp(tokenPattern.source,'g'))].map(match=>({name:match[1].trim(),id:match[2].trim(),audioId:match[3]?.trim(),raw:match[0]}));}
    function displayPrompt(text,owner){
        let html='',offset=0;
        for(const match of String(text).matchAll(new RegExp(tokenPattern.source,'g'))){const voice=(owner.storyboardAudioAssets||[]).find(asset=>asset.id===match[3]?.trim());html+=escapeHtml(String(text).slice(offset,match.index))+`<span class="pixmax-story-inline-asset">@${escapeHtml(match[1].trim())}</span>`+(voice?` <span class="pixmax-story-inline-asset">@${escapeHtml(voice.name)}</span>`:'');offset=match.index+match[0].length;}
        return html+escapeHtml(String(text).slice(offset));
    }
    function plan(owner,shot,kind){
        const prompt=promptFor(shot,kind),mentions=tokens(prompt),ids=[...new Set(mentions.length?mentions.map(token=>token.id):shot.assetIds||[])],inputs=[],refs=[],missing=[];
        for(const id of ids){
            const asset=(owner.storyboardAssets||[]).find(asset=>asset.id===id),node=nodes.find(node=>node.id===asset?.imageNodeId),media=node?.images?.findLast(item=>mediaKindForItem(item)==='image');
            if(!asset||!node||!media){missing.push(asset?.name||id);if(asset&&node)inputs.push(node.id);continue;}
            inputs.push(node.id);refs.push({...media,nodeId:node.id,imageIndex:node.images.indexOf(media),name:asset.name||id,assetId:id});
        }
        if(kind==='video')for(const token of mentions){
            if(!token.audioId||(owner.storyboardAssets||[]).find(asset=>asset.id===token.id)?.type!=='character')continue;
            const asset=(owner.storyboardAudioAssets||[]).find(asset=>asset.id===token.audioId),node=nodes.find(node=>node.id===asset?.nodeId),media=node?.images?.findLast(item=>mediaKindForItem(item)==='audio');
            if(!node||!media){missing.push(asset?.name||token.audioId);continue;}
            inputs.push(node.id);if(!refs.some(ref=>ref.nodeId===node.id&&ref.url===media.url))refs.push({...media,nodeId:node.id,imageIndex:node.images.indexOf(media),name:asset.name||token.audioId,audioAssetId:token.audioId});
        }
        let html='',offset=0,text='';
        for(const match of prompt.matchAll(new RegExp(tokenPattern.source,'g'))){
            const before=prompt.slice(offset,match.index),ref=refs.find(ref=>ref.assetId===match[2].trim()),audio=refs.find(ref=>ref.audioAssetId===match[3]?.trim());
            const label=match[1].trim();
            html+=escapeHtml(before)+(ref?escapeHtml('<'+label+' ')+mentionTokenHtml(ref)+(audio?' '+mentionTokenHtml(audio):'')+escapeHtml('>'):escapeHtml('<'+label+'>'));
            text+=before+(ref?'<'+label+' @'+ref.name+(audio?' @'+audio.name:'')+'>':'<'+label+'>');offset=match.index+match[0].length;
        }
        html+=escapeHtml(prompt.slice(offset));text+=prompt.slice(offset);
        return {prompt,html,text,inputs:[...new Set(inputs)],refs,missing};
    }
    function referencesFor(node){
        if(!node.storyboardShotBinding)return null;
        const latest=new Map();for(const ref of inputImagesFor(node)){const kind=mediaKindForItem(ref);if(kind==='image'||node.generationKind==='video'&&['audio','video'].includes(kind))latest.set(ref.nodeId+'|'+kind,ref);}
        return [...latest.values()];
    }
    function refreshPromptReferences(node,element){
        const binding=node.storyboardShotBinding;if(!binding)return;
        const refs=referencesFor(node),bound=new Set([...(binding.imageNodeIds||[]),...(binding.audioNodeIds||[])]);
        element.querySelectorAll('.mention-image-token[data-node-id]').forEach(token=>{
            if(!bound.has(token.dataset.nodeId))return;
            const ref=refs.find(ref=>ref.nodeId===token.dataset.nodeId&&mediaKindForItem(ref)===token.dataset.kind);
            if(!ref){token.replaceWith(document.createTextNode('@'+(token.dataset.name||'素材')));return;}
            const fresh=document.createElement('template');fresh.innerHTML=mentionTokenHtml({...ref,name:token.dataset.name});token.replaceWith(fresh.content.firstElementChild);
        });
    }
    function remapReferences(node,map,{connected=true,referenceNodes=[]}={}){
        if(!node.storyboardShotBinding)return;
        const binding=node.storyboardShotBinding,mapped=id=>connected?map.get(id)||'':'';
        binding.ownerId=mapped(binding.ownerId);binding.imageNodeIds=(binding.imageNodeIds||[]).map(mapped).filter(Boolean);binding.audioNodeIds=(binding.audioNodeIds||[]).map(mapped).filter(Boolean);
        if(!binding.ownerId)delete binding.ownerId;
        if(typeof node.promptDraftHtml==='string'){
            const template=document.createElement('template');template.innerHTML=node.promptDraftHtml;
            template.content.querySelectorAll('.mention-image-token[data-node-id]').forEach(token=>{
                const id=mapped(token.dataset.nodeId),source=referenceNodes.find(node=>node.id===id),index=Number(token.dataset.imageIndex||0),media=source?.images?.[index];
                if(!id){token.replaceWith(document.createTextNode('@'+(token.dataset.name||'素材')));return;}
                if(media){const fresh=document.createElement('template');fresh.innerHTML=mentionTokenHtml({...media,nodeId:id,imageIndex:index,name:token.dataset.name});token.replaceWith(fresh.content.firstElementChild);}else token.dataset.nodeId=id;
            });node.promptDraftHtml=template.innerHTML;
        }
        if(Array.isArray(node.runPromptRefs))node.runPromptRefs=node.runPromptRefs.map(ref=>({...ref,nodeId:mapped(ref.nodeId)})).filter(ref=>ref.nodeId);
    }
    function open(owner,kind){
        if(!['image','video'].includes(kind)||isSmartCanvasLocked()||!nodes.includes(owner))return;
        const root=pixmaxCreationModal(kind==='image'?'批量生成镜头图像':'批量生成镜头视频'),body=root.querySelector('.pixmax-creation-content'),status=root.querySelector('[role=status]'),origin=canvas,guard=canvasTaskWriteGuard(owner),shots=owner.shots||[],snapshot=JSON.stringify([shots,owner.storyboardAssets,owner.storyboardAudioAssets]),saved=owner.storyboardMediaConfig?.[kind]||{};
        const catalog=window.CanvasCore.availableModelProviders(kind==='image'?imageProviders():(apiProviders||[]).filter(provider=>provider.enabled!==false&&provider.has_key&&(provider.video_models||[]).length));
        const valid=()=>root.isConnected&&canvas===origin&&guard.valid()&&!isSmartCanvasLocked()&&nodes.includes(owner),unchanged=()=>valid()&&JSON.stringify([owner.shots,owner.storyboardAssets,owner.storyboardAudioAssets])===snapshot;
        root.classList.add('pixmax-story-media-modal');
        body.innerHTML=`<div class="pixmax-creation-models"><label>供应商<select data-shot-provider aria-label="镜头生成供应商">${catalog.map(provider=>`<option value="${escapeAttr(provider.id)}" ${provider.id===(saved.provider_id||saved.videoProvider)?'selected':''}>${escapeHtml(provider.name||provider.id)}</option>`).join('')}</select></label><label>模型<select data-shot-model aria-label="镜头生成模型"></select></label></div><div class="pixmax-story-image-params"><label>分辨率<select data-shot-resolution aria-label="镜头生成分辨率"></select></label><label>画幅<select data-shot-ratio aria-label="镜头生成画幅">${[['square','1:1'],['landscape','3:2'],['portrait','2:3'],['landscape43','4:3'],['portrait43','3:4'],['wide','16:9'],['story','9:16']].map(([value,label])=>`<option value="${kind==='image'?value:label}" ${(kind==='image'?value===saved.ratio:label===(saved.videoAspect||'16:9'))?'selected':''}>${label}</option>`).join('')}</select></label></div>${kind==='video'?'<label><input type="checkbox" data-shot-audio>生成声音</label>':''}<div data-shot-list></div><p class="pixmax-creation-hint">创建后在画布节点中运行生成${kind==='video'?'；视频节点会连接一个剪辑台':''}。</p><button type="button" class="pixmax-creation-primary" data-shot-create>创建生成节点</button>`;
        const provider=body.querySelector('[data-shot-provider]'),model=body.querySelector('[data-shot-model]'),resolution=body.querySelector('[data-shot-resolution]'),ratio=body.querySelector('[data-shot-ratio]'),button=body.querySelector('[data-shot-create]');
        if(kind==='video')body.querySelector('[data-shot-audio]').checked=!!saved.videoGenerateAudio;
        function fillResolutions(){const item=catalog.find(item=>item.id===provider.value),options=kind==='image'?window.CanvasCore.modelResolutions(item,kind,model.value,['1k','2k','4k']):smartVideoResolutions({videoProvider:provider.value,videoModel:model.value});resolution.innerHTML=options.map(value=>`<option value="${value}" ${value===(saved.resolution||saved.videoResolution||(kind==='image'?'1k':'720p'))?'selected':''}>${value||'默认'}</option>`).join('');}
        function fillModels(){model.innerHTML=(catalog.find(item=>item.id===provider.value)?.[kind+'_models']||[]).map(value=>`<option value="${escapeAttr(value)}" ${value===(saved.model||saved.videoModel)?'selected':''}>${escapeHtml(value)}</option>`).join('');fillResolutions();}
        provider.onchange=fillModels;model.onchange=fillResolutions;fillModels();
        const list=body.querySelector('[data-shot-list]');
        list.insertAdjacentHTML('beforebegin','<div class="pixmax-story-media-actions"><button type="button" data-shot-check-all>选择全部</button><button type="button" data-shot-check-none>清空选择</button></div>');
        for(const [selector,value] of [['[data-shot-check-all]',true],['[data-shot-check-none]',false]])body.querySelector(selector).onclick=()=>body.querySelectorAll('[data-shot-selected]:not(:disabled)').forEach(input=>input.checked=value);
        list.innerHTML=shots.map((shot,index)=>{const item=plan(owner,shot,kind),blocked=['queue','failed','interrupted'].includes(shot.promptStatus),reason=blocked?'提示词任务尚未成功':!item.prompt?'缺少'+(kind==='image'?'图像':'视频运动')+'提示词':'';return `<section class="pixmax-story-image-asset"><label class="pixmax-shot-row-select"><input type="checkbox" data-shot-selected="${index}" aria-label="选择镜头 ${index+1}" ${reason?'disabled':'checked'}>镜头 ${escapeHtml(shot.shotNo||String(index+1))}</label><p>${displayPrompt(shot.description||'',owner)}</p>${item.prompt?`<details><summary>查看${kind==='image'?'图像':'视频运动'}提示词</summary><p>${displayPrompt(item.prompt,owner)}</p></details>`:''}${reason?`<p class="pixmax-story-warning">${escapeHtml(reason)}</p>`:''}${item.missing.length?`<p class="pixmax-story-warning">资产尚未就绪：${escapeHtml(item.missing.join('、'))}</p>`:''}${kind==='video'?`<label>时长(s)<input type="number" step="1" min="1" data-shot-duration="${index}" aria-label="镜头 ${index+1} 视频时长" value="${Number(shot.duration)||5}"></label>`:''}</section>`;}).join('');
        let staged=null,busy=false;
        button.onclick=async()=>{
            if(busy)return;busy=true;button.disabled=true;
            try{
                if(!valid())throw new Error('画布或编辑资格已变化');
                if(!staged){
                    if(!unchanged())throw new Error('分镜内容已变化，请重新打开');
                    const item=catalog.find(item=>item.id===provider.value),liveProvider=apiProviders.find(item=>item.id===provider.value),available=window.CanvasCore.availableModelProviders(liveProvider?[liveProvider]:[])[0];
                    const allowedResolutions=kind==='image'?window.CanvasCore.modelResolutions(available,kind,model.value,['1k','2k','4k']):smartVideoResolutions({videoProvider:provider.value,videoModel:model.value});
                    if(!available?.has_key||!available[kind+'_models']?.includes(model.value)||!resolution.options.length||!allowedResolutions.includes(resolution.value))throw new Error('请选择当前可用的供应商、模型和分辨率');
                    const config=kind==='image'?{engine:'api',apiKind:'image',provider_id:item.id,model:model.value,resolution:resolution.value,ratio:ratio.value,quality:'auto',count:1}:{engine:item.id==='volcengine'?'volcengine':'api',apiKind:'video',videoProvider:item.id,videoModel:model.value,videoResolution:resolution.value,videoAspect:ratio.value,videoGenerateAudio:body.querySelector('[data-shot-audio]').checked,videoTaskMode:'auto',videoUseFrameRoles:false,videoMultimodal:true,count:1};
                    const selected=[...body.querySelectorAll('[data-shot-selected]:checked')].filter(input=>!input.disabled).map(input=>Number(input.dataset.shotSelected));
                    if(!selected.length)throw new Error('请选择要生成的镜头');
                    const plans=selected.map(index=>({index,shot:shots[index],...plan(owner,shots[index],kind),duration:kind==='video'?Number(body.querySelector(`[data-shot-duration="${index}"]`).value):null}));
                    if(plans.some(item=>!item.prompt))throw new Error('镜头提示词为空');
                    if(kind==='video'){const range=smartVideoDurationRange(config);if(plans.some(item=>!Number.isSafeInteger(item.duration)||item.duration<range.min||item.duration>range.max))throw new Error(`当前视频模型时长须为 ${range.min} 到 ${range.max} 秒的整数`);}
                    pushUndo();owner.storyboardMediaConfig={...owner.storyboardMediaConfig,[kind]:config};
                    const created=[],columns=Math.ceil(Math.sqrt(plans.length));
                    for(const [offset,item] of plans.entries()){
                        const node=createGenerationNodeAt({x:owner.x+520+(offset%columns)*400,y:owner.y+Math.floor(offset/columns)*420},kind,{skipUndo:true,select:false,deferRender:true});
                        node.label='镜头 '+(item.shot.shotNo||item.index+1);node.promptDraftText=item.text;node.promptDraftHtml=item.html;node.runSettings={...config,...(kind==='video'?{videoDuration:item.duration}:{})};node.runPromptRefs=item.refs;
                        node.storyboardShotBinding={ownerId:owner.id,shotNo:String(item.shot.shotNo||item.index+1),mediaType:kind,assetIds:tokens(item.prompt).length?tokens(item.prompt).map(token=>token.id):item.shot.assetIds||[],imageNodeIds:item.refs.filter(ref=>ref.assetId).map(ref=>ref.nodeId),audioNodeIds:item.refs.filter(ref=>ref.audioAssetId).map(ref=>ref.nodeId)};
                        for(const id of item.inputs)connectInputNode(id,node.id);created.push(node.id);
                    }
                    if(kind==='video'){const editor=createSmartStudioNode('editor',{x:owner.x+600+columns*400,y:owner.y+120},{skipUndo:true,select:false,deferRender:true});for(const id of created)connectInputNode(id,editor.id);created.push(editor.id);}
                    staged=created;smartSelection.insertedNodes(created);render();scheduleSave();body.querySelectorAll('input,select,[data-shot-check-all],[data-shot-check-none]').forEach(control=>control.disabled=true);
                }
                if(!staged.every(id=>nodes.some(node=>node.id===id)))throw new Error('创建的节点已移除，请关闭窗口后重新选择');
                if(!await saveCanvas({force:true}))throw new Error('节点已加入画布，保存失败，请重试保存');
                if(valid()){toast('镜头生成节点已创建');root.remove();}
            }catch(error){status.textContent=error.message||'镜头节点创建失败';if(staged)button.textContent='重试保存';}
            finally{busy=false;button.disabled=false;}
        };
    }
    window.PixmaxStoryboardMedia=Object.freeze({open,plan,referencesFor,refreshPromptReferences,remapReferences});
})();
