/* Asset images live in normal generation nodes; board mappings are saved first. */
(() => {
    'use strict';
    const jobs=new Set();
    function assetNode(owner,asset){const node=nodes.find(node=>node.id===asset.imageNodeId);return node?.type==='smart-image'&&node.generationKind!=='video'?node:null;}
    function references(owner,asset){return (assetNode(owner,asset)?.images||[]).filter(item=>mediaKindForItem(item)==='image');}
    function linkShot(owner,shot,target){
        const ids=new Set(Array.isArray(shot.assetIds)?shot.assetIds:[]);
        for(const asset of owner.storyboardAssets||[]){if(!ids.has(asset.id))continue;const node=assetNode(owner,asset);if(node)connectInputNode(node.id,target.id);}
    }
    function remapReferences(node,map,{connected=true}={}){
        for(const asset of node.storyboardAssets||[]){if(asset.imageNodeId){const id=connected?map.get(asset.imageNodeId):null;if(id)asset.imageNodeId=id;else delete asset.imageNodeId;}}
        for(const asset of node.storyboardAudioAssets||[]){if(asset.nodeId){const id=connected?map.get(asset.nodeId):null;if(id)asset.nodeId=id;else delete asset.nodeId;}}
        if(node.storyboardAssetBinding){const id=connected?map.get(node.storyboardAssetBinding.ownerId):null;if(id)node.storyboardAssetBinding.ownerId=id;else delete node.storyboardAssetBinding;}
    }
    function open(owner,selectedId){
        if(isSmartCanvasLocked()||!window.CanvasSession?.enabled||!nodes.includes(owner))return;
        const assets=(owner.storyboardAssets||[]).filter(asset=>!selectedId||asset.id===selectedId);
        if(!assets.length){toast('请先准备人物、场景或道具清单');return;}
        const root=pixmaxCreationModal('分镜资产图像'),body=root.querySelector('.pixmax-creation-content'),status=root.querySelector('[role=status]'),origin=canvas,base=canvasTaskWriteGuard(owner),catalog=imageProviders(),saved=owner.storyboardImageConfig||{};
        const valid=()=>root.isConnected&&canvas===origin&&base.valid()&&!isSmartCanvasLocked()&&assets.every(asset=>owner.storyboardAssets.includes(asset));
        root.classList.add('pixmax-storyboard-image-modal');
        const selected=catalog.find(provider=>provider.id===saved.provider_id)||catalog[0];
        body.innerHTML=`<div class="pixmax-creation-models"><label>供应商<select data-story-image-provider aria-label="资产图像供应商">${catalog.map(provider=>`<option value="${escapeAttr(provider.id)}" ${provider===selected?'selected':''}>${escapeHtml(provider.name||provider.id)}</option>`).join('')}</select></label><label>模型<select data-story-image-model aria-label="资产图像模型"></select></label></div><div class="pixmax-story-image-params"><label>分辨率<select data-story-image-resolution aria-label="资产图像分辨率"></select></label><label>画幅<select data-story-image-ratio aria-label="资产图像画幅">${[['square','1:1'],['portrait','2:3'],['landscape','3:2'],['wide','16:9']].map(([key,label])=>`<option value="${key}" ${key===(saved.ratio||'square')?'selected':''}>${label}</option>`).join('')}</select></label></div><p class="pixmax-creation-hint">每项资产生成一张图像，结果保存在对应的图像节点中。</p><div data-story-image-list></div><button type="button" class="pixmax-creation-primary" data-story-image-all>生成全部资产图像</button>`;
        const provider=body.querySelector('[data-story-image-provider]'),model=body.querySelector('[data-story-image-model]'),resolution=body.querySelector('[data-story-image-resolution]'),ratio=body.querySelector('[data-story-image-ratio]');
        function resolutions(){const item=imageProviders().find(item=>item.id===provider.value),allowed=window.CanvasCore.modelResolutions(item,'image',model.value,['1k','2k','4k']);resolution.innerHTML=allowed.map(value=>`<option value="${value}" ${value===saved.resolution?'selected':''}>${value}</option>`).join('');}
        function models(){model.innerHTML=providerImageModels(provider.value).map(value=>`<option value="${escapeAttr(value)}" ${value===saved.model?'selected':''}>${escapeHtml(value)}</option>`).join('');resolutions();}
        provider.onchange=models;model.onchange=resolutions;models();
        function config(){const item=imageProviders().find(item=>item.id===provider.value);if(!item||!providerImageModels(item.id).includes(model.value)||!resolution.value)throw new Error('请选择可用的图像模型和分辨率');return {engine:'api',apiKind:'image',provider_id:item.id,model:model.value,resolution:resolution.value,ratio:ratio.value,quality:'auto',count:1};}
        function draw(){body.querySelector('[data-story-image-list]').innerHTML=assets.map(asset=>{const node=assetNode(owner,asset),images=references(owner,asset);return `<section class="pixmax-story-image-asset"><strong>${escapeHtml(asset.name||asset.id)}</strong><label>图像提示词<textarea data-story-image-prompt="${escapeAttr(asset.id)}" aria-label="${escapeAttr(asset.name||asset.id)} 图像提示词">${escapeHtml(asset.prompt||asset.description||'')}</textarea></label>${images.length?`<img src="${escapeAttr(smartMediaPreviewUrl(images.at(-1),256))}" alt="${escapeAttr(asset.name||asset.id)} 生成图像">`:''}<button type="button" data-story-image-run="${escapeAttr(asset.id)}">${smartPendingTasks(node).length?'查询原图像任务':'生成图像'}</button></section>`;}).join('');}
        draw();
        let edited=false;body.addEventListener('input',event=>{
            if(!event.target.matches('[data-story-image-prompt]')||!valid())return;
            const asset=assets.find(asset=>asset.id===event.target.dataset.storyImagePrompt);if(!asset)return;
            if(!edited){pushUndo();edited=true;}asset.prompt=event.target.value;scheduleSave();
        });
        async function generate(selected){
            if(jobs.has(owner))return;jobs.add(owner);const controls=[...body.querySelectorAll('button')];controls.forEach(button=>button.disabled=true);
            let configValue,signature,completed=0,waiting=0;
            try{
                if(!valid())throw new Error('分镜或编辑资格已变化');
                // Query existing receipts before changing shared inputs or admitting
                // another paid task. Queries also work after a provider is removed.
                const pendingAssets=selected.filter(asset=>smartPendingTasks(assetNode(owner,asset)).some(task=>task.kind==='image'));
                const querying=pendingAssets.length>0;
                if(querying)selected=pendingAssets;
                else{
                    configValue=config();
                    for(const asset of selected)if(!body.querySelector(`[data-story-image-prompt="${CSS.escape(asset.id)}"]`).value.trim())throw new Error('请填写 '+asset.name+' 的图像提示词');
                    pushUndo();owner.storyboardImageConfig=configValue;
                }
                // Create every mapping before the first input receipt. Completing
                // one sibling changes only its own node, never the shared board.
                for(const asset of selected){
                    if(querying)continue;
                    const prompt=body.querySelector(`[data-story-image-prompt="${CSS.escape(asset.id)}"]`).value.trim();if(!prompt)throw new Error('请填写 '+asset.name+' 的图像提示词');
                    asset.prompt=prompt;
                    let node=assetNode(owner,asset);
                    if(!node||node.storyboardAssetBinding?.ownerId!==owner.id||node.storyboardAssetBinding.assetId!==asset.id){node=createGenerationNodeAt({x:owner.x+480,y:owner.y+selected.indexOf(asset)*320},'image',{skipUndo:true,select:false,deferRender:true});asset.imageNodeId=node.id;node.storyboardAssetBinding={ownerId:owner.id,assetId:asset.id};canvas.connections.push({from:owner.id,to:node.id,kind:'input'});}
                    if(!smartPendingTasks(node).length){node.promptDraftText=prompt;node.promptDraftHtml=escapeHtml(prompt);node.runSettings={...configValue};node.label=asset.name||asset.id;}
                }
                if(!querying)window.PixmaxCanvasFrames?.layoutAndGroup(selected.map(asset=>assetNode(owner,asset).id),{label:'分镜资产',side:'left',owner});
                signature=JSON.stringify(configValue);if(!querying){render();scheduleSave();}
                for(const asset of selected){
                    const node=assetNode(owner,asset),baseNode=canvasTaskWriteGuard(owner,node),prompt=asset.prompt;
                    const live=()=>valid()&&baseNode.valid()&&(querying||JSON.stringify(config())===signature)&&assetNode(owner,asset)===node&&asset.prompt===prompt&&body.querySelector(`[data-story-image-prompt="${CSS.escape(asset.id)}"]`).value.trim()===prompt;
                    if(!live())throw window.CanvasTaskResults.pending();
                    const pending=smartPendingTasks(node).find(task=>task.kind==='image');
                    if(pending){
                        const response=await window.CanvasApi.getCanvasImageTaskRequest(pending.taskId);if(!response.ok)throw new Error('原图像任务暂不可读取，请在生成结果中核对');
                        const record=await response.json();if(['failed','needs_review','cancelled'].includes(record.status))throw new Error(record.error||'原图像任务未成功，请在生成结果中核对');if(record.status!=='succeeded'){waiting++;continue;}
                        const binding=await window.CanvasTaskBindings.recover({task:record,taskId:pending.taskId,canvasId:canvas.id,kind:'smart',sourceId:node.id,targetId:node.id,read:smartTaskInputDocument,valid:live});
                        await commitSmartStudioTaskResult(node,record,'image',binding,{valid:live,recovered:true});
                    }else{
                        const binding=smartTaskInputBinding(node,node,{valid:live,check(){if(!live())throw window.CanvasTaskResults.pending();}});
                        try{
                            status.textContent='正在生成 '+asset.name+'…';
                            const record=await window.CanvasImageTasks.run({prompt,provider_id:configValue.provider_id,model:configValue.model,size:sizeForRun(configValue),quality:configValue.quality,n:1,reference_images:[]},
                                {binding,canvasId:canvas.id,onRemember:async receipt=>{binding.mutate(()=>{node.pendingTasks=[{taskId:receipt.task_id,kind:'image',providerId:configValue.provider_id,model:configValue.model,run:{nodeId:node.id,kind:'image',prompt,settings:configValue,refs:[]}}];node.pending=1;});refreshSmartNodes([node.id]);scheduleSave();await saveCanvas({force:true});}});
                            await commitSmartStudioTaskResult(node,record,'image',binding,{valid:live});
                        }catch(error){
                            if(baseNode.valid()&&error.resultPending&&error.taskId&&!smartPendingTasks(node).some(task=>task.taskId===error.taskId)){node.pendingTasks=[{taskId:error.taskId,kind:'image',paused:true,run:{nodeId:node.id,kind:'image',prompt,settings:configValue,refs:[]}}];node.pending=1;scheduleSave();}
                            throw error;
                        }
                    }
                    completed++;
                }
                if(valid())status.textContent=waiting?`${completed} 项完成，${waiting} 项原图像任务尚未完成，请稍后查询`:querying?'原任务图像已保存到画布；其余资产可继续生成':'资产图像已保存到画布';
            }catch(error){status.textContent=error.message||'资产图像未完成，请核对原任务';}
            finally{jobs.delete(owner);controls.forEach(button=>button.disabled=false);if(root.isConnected)draw();}
        }
        body.addEventListener('click',event=>{const button=event.target.closest('button');if(button?.hasAttribute('data-story-image-run'))generate(assets.filter(asset=>asset.id===button.dataset.storyImageRun));else if(button?.hasAttribute('data-story-image-all'))generate(assets);});
    }
    window.PixmaxStoryboardAssets=Object.freeze({open,references,linkShot,remapReferences,busy:()=>jobs.size>0});
})();
