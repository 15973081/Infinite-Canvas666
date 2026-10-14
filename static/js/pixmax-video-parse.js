/* VideoToStoryboard: saved source inputs, one durable task, editable shots/assets. */
(() => {
    'use strict';
    const jobs=new Set(),identity=url=>String(url).match(/(?:assets\/cloud|api\/media)\/(ast_[a-f0-9]{32})(?:\/|$)/)?.[1]||url;
    const completed=node=>node.creationResults?.some(item=>item.taskId===node.videoAnalysis?.taskId);
    function sourceFor(node){
        const url=node.videoAnalysis?.source?.url,ids=new Set((canvas.connections||[]).filter(edge=>edge.to===node.id).map(edge=>edge.from));
        for(const source of nodes.filter(source=>ids.has(source.id))){const item=source.images?.find(item=>mediaKindForItem(item)==='video'&&(!url||identity(item.url)===identity(url)));if(item)return {node:source,item};}
        throw new Error('原视频连接已变化，请重新选择解析来源');
    }
    function decode(text){
        if(text.length>500000)throw new Error('解析回复过长，请在生成结果中核对');
        let value;try{value=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{throw new Error('解析回复不是有效 JSON，原结果保留在生成结果中');}
        if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('解析回复需要镜头与资产清单');
        const assets=value.assets??[];if(!Array.isArray(assets)||assets.length>200)throw new Error('资产清单最多包含 200 项');
        const ids=new Set(),safe=value=>typeof value==='string'&&value.length<=10000;
        const normalized=assets.map(asset=>{
            if(!asset||typeof asset!=='object'||typeof asset.id!=='string'||!asset.id||asset.id.length>120||ids.has(asset.id)||!['character','scene','prop'].includes(asset.type)||!safe(asset.name)||!asset.name.trim()||!safe(asset.description||'')||!safe(asset.prompt||''))throw new Error('解析资产的标识、类型或内容无效');
            ids.add(asset.id);return {id:asset.id,type:asset.type,name:asset.name,description:asset.description||'',prompt:asset.prompt||''};
        });
        const shots=pixmaxStructuredShots(text);let end=0;
        return {assets:normalized,shots:shots.map((shot,index)=>{
            const raw=value.shots[index],references=raw.assetIds??[];
            if(typeof raw.duration!=='number'||['description','size','lighting','dialogue','sound','movement','asset','prompt'].some(field=>raw[field]!==undefined&&!safe(raw[field])))throw new Error('镜头字段需要有效文本和秒数');
            if(!Array.isArray(references)||references.some(id=>!ids.has(id))||new Set(references).size!==references.length)throw new Error('镜头引用了不存在或重复的资产');
            const start=raw.start_seconds??end,finish=raw.end_seconds??start+shot.duration;
            if(typeof start!=='number'||typeof finish!=='number'||!Number.isFinite(start)||!Number.isFinite(finish)||start<end-.05||finish<=start||Math.abs(finish-start-shot.duration)>.05)throw new Error('镜头时间或时长不一致');
            end=finish;return {...shot,start_seconds:start,end_seconds:finish,assetIds:references};
        })};
    }
    function removeRawFallback(record){
        const removed=new Set(nodes.filter(node=>node.result_task_id===record.id&&node.type==='smart-prompt'&&node.title==='生成结果'&&!node.label&&node.text===record.result.text&&
            !(canvas.connections||[]).some(edge=>edge.from===node.id||edge.to===node.id)).map(node=>node.id));
        if(removed.size){nodes=nodes.filter(node=>!removed.has(node.id));canvas.nodes=nodes;smartSelection.nodesRemoved(removed);}
    }
    async function accept(node,record,binding,{valid,recovered=false}={}){
        const parsed=decode(record.result.text);
        return commitSmartStudioTaskResult(node,record,'llm',binding,{valid,recovered,prepareResult:()=>removeRawFallback(record),applyResult:()=>{
            node.shots=parsed.shots;node.storyboardAssets=parsed.assets;node.result_task_id=record.id;
            node.creationResults=[...(node.creationResults||[]).filter(item=>item.taskId!==record.id),{taskId:record.id,text:record.result.text}].slice(-50);
            window.CanvasTaskResults.clearPending([node],[record.id]);node.running=false;
        }});
    }
    async function recover(node,record,{valid=()=>true,foreground=false}={}){
        if(jobs.has(node)&&!foreground)return;const base=canvasTaskWriteGuard(node),config=node.videoAnalysis;
        const current=()=>valid()&&base.valid()&&config===node.videoAnalysis&&config.taskId===record.id&&!completed(node);
        if(!current())return;
        const binding=await window.CanvasTaskBindings.recover({task:record,taskId:record.id,canvasId:canvas.id,kind:'smart',sourceId:node.id,targetId:node.id,read:smartTaskInputDocument,valid:current});
        await accept(node,record,binding,{valid:current,recovered:true});
    }
    function pending(){return nodes.filter(node=>node.type==='smart-storyboard'&&node.videoAnalysis?.taskId&&!completed(node)).map(node=>({id:node.videoAnalysis.taskId,canvasId:canvas.id,kind:'llm',node,task:node.videoAnalysis}));}
    function deliveryPrefix(response){
        const pendingIds=new Set(pending().map(item=>item.id)),deferred=response.deliveries?.filter(entry=>pendingIds.has(entry.task_id))||[];
        if(!deferred.length)return response;
        const version=Math.min(...deferred.map(entry=>entry.version))-1;
        return {...response,result_version:version,deliveries:response.deliveries.filter(entry=>entry.version<=version)};
    }
    function create(nodeId,index){
        const source=nodes.find(node=>node.id===nodeId),item=source?.images?.[index];if(isSmartCanvasLocked()||!window.CanvasSession?.enabled||mediaKindForItem(item)!=='video')return;
        const existing=nodes.find(node=>node.type==='smart-storyboard'&&node.videoAnalysis?.taskId&&!completed(node)&&identity(node.videoAnalysis.source?.url)===identity(item.url)&&(canvas.connections||[]).some(edge=>edge.from===source.id&&edge.to===node.id));
        if(existing)return open(existing);
        pushUndo();const [w,h]=window.PixmaxCanvasAssets.sizes.storyboard;
        const node=createSmartStudioNode('storyboard',{x:(source.x||0)+400+w/2,y:(source.y||0)+h/2},{skipUndo:true});
        node.label=(source.label||item.name||'视频')+' · 分镜';node.videoAnalysis={templateCode:'VideoToStoryboard',source:{url:item.url},frames:12,instructions:'',locale:'zh-CN'};
        canvas.connections.push({from:source.id,to:node.id,kind:'input'});render();scheduleSave();open(node);
    }
    function open(node){
        if(isSmartCanvasLocked()||!window.CanvasSession?.enabled||!nodes.includes(node))return;
        const root=pixmaxCreationModal('视频解析'),body=root.querySelector('.pixmax-creation-content'),status=root.querySelector('[role=status]'),origin=canvas,base=canvasTaskWriteGuard(node);
        root.classList.add('pixmax-video-parse-modal');
        let source;try{source=sourceFor(node);}catch(error){status.textContent=error.message;return;}
        const initial=node.videoAnalysis||{},currentSource=identity(source.item.url),valid=()=>root.isConnected&&canvas===origin&&base.valid()&&!isSmartCanvasLocked()&&identity(sourceFor(node).item.url)===currentSource;
        body.innerHTML=`<p>将视频画面解析为可编辑镜头及人物、场景、道具清单。</p><p class="pixmax-creation-hint">基于全片采样画面；补充文本可提供对白、旁白或其他要求。请选择支持图片理解的模型。</p><div class="pixmax-creation-models">${pixmaxTextModelControls(initial)}</div><label>采样画面上限<select data-parse-frames aria-label="采样画面上限">${[6,12,24].map(count=>`<option value="${count}" ${count===(initial.frames||12)?'selected':''}>${count} 张</option>`).join('')}</select></label><label>补充文本<textarea data-parse-instructions aria-label="视频解析补充文本" maxlength="10000">${escapeHtml(initial.instructions||'')}</textarea></label><button type="button" data-video-parse-run class="pixmax-creation-primary">${initial.taskId&&!completed(node)?'查询已有解析任务':'解析视频'}</button><button type="button" data-video-parse-board ${node.shots?.length?'':'hidden'}>打开分镜脚本</button>`;
        bindPixmaxTextModels(root);const run=body.querySelector('[data-video-parse-run]');
        const configuration=()=>{const model=root.querySelector('[data-creation-model]')?.value,providerId=root.querySelector('[data-creation-provider]')?.value;return {...node.videoAnalysis,templateCode:'VideoToStoryboard',providerId,model,frames:Number(body.querySelector('[data-parse-frames]').value),instructions:body.querySelector('[data-parse-instructions]').value,locale:'zh-CN',source:{url:sourceFor(node).item.url}};};
        let edited=false;function draft(){try{if(!valid())return;if(!edited){pushUndo();edited=true;}node.videoAnalysis=configuration();scheduleSave();}catch(error){status.textContent=error.message;}}
        body.addEventListener('input',draft);body.addEventListener('change',draft);
        body.querySelector('[data-video-parse-board]').onclick=()=>{if(valid()){root.remove();openSmartStoryboard(node);}};
        run.onclick=async()=>{
            if(jobs.has(node))return;jobs.add(node);run.disabled=true;let binding,taskId;
            try{
                if(!valid())throw new Error('视频来源或编辑资格已变化');
                if(node.videoAnalysis?.taskId&&!completed(node)){
                    const response=await window.CanvasApi.getCanvasLLMTaskRequest(node.videoAnalysis.taskId);if(!response.ok)throw new Error('原解析任务暂不可读取，请在生成结果中核对');
                    const record=await response.json();if(!valid())throw window.CanvasTaskResults.pending();
                    if(record.status!=='succeeded'){status.textContent=['failed','needs_review','cancelled'].includes(record.status)?'原任务需要核对，请查看生成结果':'后台正在解析，稍后查询原任务';return;}
                    // Use a fresh input proof; restore never performs a paid POST.
                    await recover(node,record,{valid,foreground:true});
                }else{
                    const model=pixmaxTextModelValue(root),config={...configuration(),...model,taskId:'canvas_llm_'+crypto.randomUUID().replace(/-/g,'')};taskId=config.taskId;
                    pushUndo();node.videoAnalysis=config;scheduleSave();const signature=JSON.stringify(config);
                    const live=()=>valid()&&JSON.stringify(configuration())===signature&&JSON.stringify(node.videoAnalysis)===signature;
                    binding=smartTaskInputBinding(node,node,{valid:live,check(){if(!live())throw window.CanvasTaskResults.pending();}});
                    const record=await window.CanvasLLMTasks.run({provider_id:model.providerId,model:model.model,videos:[sourceFor(node).item.url],video_sampling:'uniform',video_frames:config.frames,
                        message:'解析所提供的视频画面。补充文本：'+config.instructions,
                        system_prompt:'你是分镜导演。根据带时间戳的全片采样画面提炼镜头，并列出人物、场景、道具。对白与声音仅来自用户补充文本，不要猜测音频。仅返回 JSON：{"assets":[{"id":"a1","type":"character|scene|prop","name":"名称","description":"外观描述","prompt":"资产图像提示词"}],"shots":[{"start_seconds":0,"end_seconds":5,"duration":5,"description":"画面","size":"景别","lighting":"光影","dialogue":"对白","sound":"声音","movement":"运镜","asset":"资产备注","assetIds":["a1"],"prompt":"镜头生成提示词"}]}。镜头时间按秒递增，duration=end_seconds-start_seconds；资产标识唯一，镜头引用须来自 assets。'},
                        {binding,canvasId:canvas.id,taskId,onRemember:async receipt=>{binding.mutate(()=>{node.pendingTasks=[...smartPendingTasks(node),{taskId:receipt.task_id,kind:'llm'}];node.pending=smartPendingTasks(node).length;});refreshSmartNodes([node.id]);scheduleSave();await saveCanvas({force:true});}});
                    await accept(node,record,binding,{valid:live});
                }
                status.textContent=`已解析 ${node.shots.length} 个镜头、${node.storyboardAssets.length} 项资产`;body.querySelector('[data-video-parse-board]').hidden=false;run.textContent='重新解析视频';
            }catch(error){
                if(taskId&&(!error.taskId||error.rejected)&&base.valid()&&node.videoAnalysis?.taskId===taskId){delete node.videoAnalysis.taskId;scheduleSave();}
                status.textContent=error.message||'解析未完成，原任务保留在生成结果中';
            }finally{jobs.delete(node);run.disabled=false;if(node.videoAnalysis?.taskId&&!completed(node))run.textContent='查询已有解析任务';}
        };
    }
    window.PixmaxVideoParse=Object.freeze({create,open,recover,decode,pending,deliveryPrefix,busy:()=>jobs.size>0});
})();
