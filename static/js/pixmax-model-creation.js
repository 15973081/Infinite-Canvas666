/* Reference 3D modes mapped to saved inputs and durable member tasks. */
(() => {
    'use strict';
    const jobs=new Set(),labels={front:'正面',left:'左侧',right:'右侧',back:'背面',top:'顶部',bottom:'底部',left_front:'左前 45°',right_front:'右前 45°'};
    const providers=()=>apiProviders.filter(provider=>provider.enabled!==false&&provider.has_key&&provider.model_models?.length);
    const key=url=>String(url).match(/(?:assets\/cloud|api\/media)\/(ast_[a-f0-9]{32})(?:\/|$)/)?.[1]||url;
    function references(node){
        const ids=new Set((canvas.connections||[]).filter(edge=>edge.to===node.id).map(edge=>edge.from)),byId=new Map(nodes.map(source=>[source.id,source])),sources=[...ids].map(id=>byId.get(id)).filter(Boolean);
        const text=sources.filter(source=>source.type==='smart-prompt');
        if(text.length>20||sources.some(source=>source.type!=='smart-prompt'&&(source.type!=='smart-image'||source.images?.some(item=>mediaKindForItem(item)!=='image'))))throw new Error('3D 生成支持文本和图片输入节点');
        const images=sources.filter(source=>source.type==='smart-image').flatMap(source=>(source.images||[]).map(item=>({...item,source:source.id}))).filter(item=>item.url);
        if(images.length>7)throw new Error('3D 生成最多引用 7 张图片');
        if(new Set(images.map(item=>key(item.url))).size!==images.length)throw new Error('请为每个视角连接独立的图片');
        return {text:text.map(source=>source.text||'').filter(Boolean).join('\n\n'),images,textCount:text.length};
    }
    async function open(node){
        if(isSmartCanvasLocked()||!nodes.includes(node))return;
        const root=pixmaxCreationModal('3D 生成'),body=root.querySelector('.pixmax-creation-content'),status=root.querySelector('[role=status]'),saved=node.modelGeneration||{};
        const catalog=providers(),selected=catalog.find(provider=>provider.id===saved.provider_id)||catalog[0];
        let initial;try{initial=references(node);}catch(error){status.textContent=error.message;initial={images:[],text:'',textCount:0};}
        body.innerHTML=`<div class="pixmax-creation-models"><label>供应商<select data-model-provider aria-label="3D 供应商">${catalog.map(provider=>`<option value="${escapeAttr(provider.id)}" ${provider===selected?'selected':''}>${escapeHtml(provider.name||provider.id)}</option>`).join('')}</select></label><label>模型<select data-model-version aria-label="3D 模型"></select></label></div>${catalog.length?'':'<p class="pixmax-creation-hint">请在管理平台配置并分配混元 3D 模型。</p>'}<div class="pixmax-model-fields"><label>生成模式<select data-model-field="mode" aria-label="3D 生成模式">${[['text','文字生成'],['image','单图生成'],['multi','多图生成']].map(([id,label])=>`<option value="${id}" ${id===(saved.mode||(initial.images.length>1?'multi':initial.images.length?'image':'text'))?'selected':''}>${label}</option>`).join('')}</select></label><label>生成类型<select data-model-field="generate_type" aria-label="3D 生成类型"></select></label><label>材质<select data-model-field="enable_pbr" aria-label="PBR 材质"><option value="false">关闭</option><option value="true" ${saved.enable_pbr?'selected':''}>开启</option></select></label><label>模型面数<select data-model-field="face_count" aria-label="模型面数"><option value="300000">30 万</option><option value="500000" ${saved.face_count===500000?'selected':''}>50 万</option><option value="0">默认</option></select></label><label data-model-polygon>网格类型<select data-model-field="polygon_type" aria-label="网格类型"><option value="triangle">三角形</option><option value="quadrilateral" ${saved.polygon_type==='quadrilateral'?'selected':''}>四边形</option></select></label></div><label data-model-prompt>模型描述<textarea data-model-field="prompt" aria-label="3D 模型描述" maxlength="1024" placeholder="描述模型的形状、材质与风格">${escapeHtml(saved.prompt||'')}</textarea></label><div data-model-references></div><button type="button" data-model-run class="pixmax-creation-primary">生成 3D 模型</button>`;
        const model=body.querySelector('[data-model-version]'),providerInput=body.querySelector('[data-model-provider]'),mode=body.querySelector('[data-model-field="mode"]'),type=body.querySelector('[data-model-field="generate_type"]'),faces=body.querySelector('[data-model-field="face_count"]'),pbr=body.querySelector('[data-model-field="enable_pbr"]'),run=body.querySelector('[data-model-run]');
        const origin=canvas,base=canvasTaskWriteGuard(node),valid=()=>root.isConnected&&canvas===origin&&nodes.includes(node)&&base.valid()&&!isSmartCanvasLocked();
        const pending=()=>smartPendingTasks(node).some(task=>task.kind==='model');
        function drawReferences(){
            const target=body.querySelector('[data-model-references]');
            try{
                const refs=references(node),views=model.value==='3.0'?['front','left','right','back']:Object.keys(labels);
                target.innerHTML=refs.images.map((item,index)=>{const stored=node.modelViews?.find(view=>key(view.url)===key(item.url)),view=stored?.view||views[index]||'';
                    return `<label class="pixmax-model-reference"><img src="${escapeAttr(smartMediaPreviewUrl(item,256))}" alt="${escapeAttr(item.name||'参考图片')}" loading="lazy"><span>${escapeHtml(item.name||'参考图片 '+(index+1))}</span><select data-model-view="${escapeAttr(key(item.url))}" aria-label="参考图片 ${index+1} 视角" ${mode.value==='multi'?'':'hidden'}>${views.map(value=>`<option value="${value}" ${value===view?'selected':''}>${labels[value]}</option>`).join('')}</select></label>`;
                }).join('')||`<p class="pixmax-creation-hint">${refs.text?'将引用已连接的文本节点。':'连接文本或图片节点作为生成输入。'}</p>`;
            }catch(error){status.textContent=error.message;target.replaceChildren();}
        }
        function modes(){
            const current=type.value||saved.generate_type||'Normal',allowed=model.value==='3.1'?['Normal','Geometry']:['Normal','Geometry','LowPoly','Sketch'];
            type.innerHTML=allowed.map(value=>`<option value="${value}" ${value===current?'selected':''}>${{Normal:'标准模型',Geometry:'白模',LowPoly:'低面数',Sketch:'草图'}[value]}</option>`).join('');
            const low=type.value==='LowPoly';body.querySelector('[data-model-polygon]').hidden=!low;
            faces.querySelector('[value="0"]').disabled=!low;faces.querySelectorAll('option:not([value="0"])').forEach(option=>option.disabled=low);if(low)faces.value='0';else if(faces.value==='0')faces.value='300000';
            pbr.disabled=type.value==='Geometry';if(pbr.disabled)pbr.value='false';body.querySelector('[data-model-prompt]').hidden=mode.value!=='text'&&type.value!=='Sketch';drawReferences();
        }
        function models(){const provider=providers().find(provider=>provider.id===providerInput.value);model.innerHTML=(provider?.model_models||[]).filter(value=>['3.0','3.1'].includes(value)).map(value=>`<option value="${value}" ${value===saved.model?'selected':''}>Hunyuan 3D Pro ${value}</option>`).join('');modes();run.disabled=jobs.has(node)||!model.value&&!pending();}
        function configuration(){return {provider_id:providerInput.value,model:model.value,mode:mode.value,prompt:body.querySelector('[data-model-field="prompt"]').value,generate_type:type.value,enable_pbr:pbr.value==='true',face_count:Number(faces.value),polygon_type:body.querySelector('[data-model-field="polygon_type"]').value};}
        function selectedViews(){const refs=references(node);return refs.images.map(item=>({url:item.url,view:body.querySelector(`[data-model-view="${CSS.escape(key(item.url))}"]`)?.value||'front'})).sort((a,b)=>String(key(a.url)).localeCompare(String(key(b.url))));}
        let changed=false;
        function draft(){if(!valid())return;try{if(!changed){pushUndo();changed=true;}node.modelGeneration=configuration();node.modelViews=selectedViews();scheduleSave();}catch(error){status.textContent=error.message;}}
        providerInput.onchange=()=>{models();draft();};model.onchange=()=>{modes();draft();};mode.onchange=()=>{modes();draft();};type.onchange=()=>{modes();draft();};
        body.addEventListener('input',event=>{if(event.target.matches('[data-model-field],[data-model-view]'))draft();});body.addEventListener('change',event=>{if(event.target.matches('[data-model-field],[data-model-view]'))draft();});models();
        let previousRefs;const observer=new MutationObserver(()=>{
            if(!root.isConnected){observer.disconnect();return;}
            if(!valid()){root.remove();observer.disconnect();return;}
            try{const refs=references(node),signature=JSON.stringify([refs.images.map(item=>[key(item.url),item.name]),refs.textCount]);if(signature!==previousRefs){previousRefs=signature;drawReferences();}}catch{}
        });observer.observe(document.body,{childList:true,subtree:true});
        if(pending())run.textContent='查询已有 3D 任务';
        run.onclick=async()=>{
            if(jobs.has(node))return;jobs.add(node);run.disabled=true;let binding,config,request;
            try{
                if(!valid())throw new Error('画布或编辑资格已变化，请重新打开 3D 生成');
                const task=smartPendingTasks(node).find(task=>task.kind==='model');
                if(task){
                    const response=await window.CanvasApi.getCanvasModelTaskRequest(task.taskId);if(!response.ok)throw new Error('原任务暂不可读取，请在生成结果中核对');
                    const record=await response.json();if(!valid())throw new Error('编辑资格已变化');
                    if(record.status!=='succeeded'){status.textContent=['failed','cancelled','needs_review'].includes(record.status)?'原任务需要核对，请查看生成结果':'后台正在处理，稍后查询已有任务';return;}
                    binding=await window.CanvasTaskBindings.recover({task:record,taskId:task.taskId,canvasId:canvas.id,kind:'smart',sourceId:node.id,targetId:node.id,read:smartTaskInputDocument,valid});
                    await commitSmartStudioTaskResult(node,record,'model',binding,{recovered:true,valid});status.textContent='模型已加入节点';return;
                }
                config=configuration();if(!providers().some(provider=>provider.id===config.provider_id&&provider.model_models.includes(config.model)))throw new Error('请选择已配置的 3D 模型');
                const refs=references(node),views=selectedViews();request={...config,images:[],view_types:[]};
                if(config.mode==='text'){
                    if(refs.images.length)throw new Error('文字生成模式请移除图片连接');request.prompt=[config.prompt,refs.text].filter(Boolean).join('\n\n');if(!request.prompt.trim())throw new Error('请填写模型描述或连接文本节点');
                }else{
                    if(refs.textCount)throw new Error('图片生成模式请移除文本连接');if(!refs.images.length||config.mode==='image'&&refs.images.length!==1)throw new Error('请连接模式所需数量的图片节点');
                    request.images=refs.images.map(item=>item.url);if(config.generate_type!=='Sketch')request.prompt='';
                    if(config.mode==='multi'){
                        const paired=refs.images.map(item=>({url:item.url,view:views.find(view=>key(view.url)===key(item.url)).view})),types=paired.map(item=>item.view);
                        if(!types.includes('front')||new Set(types).size!==types.length)throw new Error('需要指定一个正面，各视角不可重复');
                        if(config.model==='3.0'&&refs.images.length>4)throw new Error('3.0 多图模式最多使用正面、左侧、右侧和背面 4 张图片');
                        paired.sort((a,b)=>Number(b.view==='front')-Number(a.view==='front'));request.images=paired.map(item=>item.url);request.view_types=paired.map(item=>item.view);
                    }
                }
                if(request.prompt.length>1024)throw new Error('模型描述与引用文本合计最多 1024 个字符');
                pushUndo();node.modelGeneration=config;node.modelViews=views;scheduleSave();
                const signature=JSON.stringify([config,views]),guard={valid:()=>{try{return valid()&&JSON.stringify([configuration(),selectedViews()])===signature&&JSON.stringify([node.modelGeneration,node.modelViews])===signature;}catch{return false;}},check(){if(!this.valid())throw new Error('3D 输入或编辑资格已变化，原任务结果已保留');}};
                binding=smartTaskInputBinding(node,node,guard);if(!binding)throw new Error('请在成员画布中生成 3D 模型');status.textContent='正在生成 3D 模型…';
                const record=await window.CanvasModelTasks.run(request,{binding,canvasId:canvas.id,onRemember:async receipt=>{
                    guard.check();binding.mutate(()=>{node.pendingTasks=[...smartPendingTasks(node),attachSmartTaskBinding({taskId:receipt.task_id,kind:'model',providerId:config.provider_id,model:config.model,startedAt:nowMs(),run:{nodeId:node.id,nodeType:node.type,kind:'model',prompt:request.prompt,settings:config,refs:refs.images}},binding)];node.pending=smartPendingTasks(node).length;});refreshSmartNodes([node.id]);scheduleSave();await saveCanvas({force:true});
                }});
                guard.check();await commitSmartStudioTaskResult(node,record,'model',binding,{valid:()=>guard.valid()});status.textContent='模型已加入节点';
            }catch(error){
                if(valid()&&error.resultPending&&error.taskId&&!smartPendingTasks(node).some(task=>task.taskId===error.taskId)){node.pendingTasks=[...smartPendingTasks(node),{taskId:error.taskId,kind:'model',paused:true,providerId:config?.provider_id,model:config?.model,run:{nodeId:node.id,kind:'model',prompt:request?.prompt||'',settings:config||{}}}];node.pending=0;render();scheduleSave();}
                if(error.inputChanged&&canvas===origin&&nodes.includes(node)&&base.valid())pauseSmartTaskInput(node,binding,base,error);
                if(root.isConnected)status.textContent=error.message||'3D 生成未完成，请核对原任务';
            }finally{jobs.delete(node);run.disabled=!model.value&&!pending();run.textContent=pending()?'查询已有 3D 任务':'生成 3D 模型';}
        };
    }
    window.PixmaxModelCreation=Object.freeze({open,busy:()=>jobs.size>0});
})();
