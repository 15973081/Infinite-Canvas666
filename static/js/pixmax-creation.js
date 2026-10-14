/* Pixmax creation workflows share the canvas's task admission and write guards. */
const pixmaxTextJobs=new WeakSet();

function pixmaxChatProviders(){
    return (apiProviders||[]).filter(provider=>provider.enabled!==false&&provider.has_key&&(provider.chat_models||[]).length);
}
function pixmaxTextModelControls(saved={}){
    const providers=pixmaxChatProviders(),provider=providers.find(item=>item.id===saved.providerId)||providers[0];
    const models=provider?.chat_models||[];
    return `<label>供应商<select data-creation-provider aria-label="文本供应商">${providers.map(item=>`<option value="${escapeAttr(item.id)}" ${item===provider?'selected':''}>${escapeHtml(item.name||item.id)}</option>`).join('')}</select></label><label>模型<select data-creation-model aria-label="文本模型">${models.map(model=>`<option value="${escapeAttr(model)}" ${model===saved.model?'selected':''}>${escapeHtml(model)}</option>`).join('')}</select></label>${providers.length?'':'<span class="pixmax-creation-hint">请在 API 设置中配置可用的文本模型</span>'}`;
}
function bindPixmaxTextModels(root){
    root.querySelector('[data-creation-provider]')?.addEventListener('change',event=>{
        const models=pixmaxChatProviders().find(provider=>provider.id===event.target.value)?.chat_models||[];
        root.querySelector('[data-creation-model]').innerHTML=models.map(model=>`<option value="${escapeAttr(model)}">${escapeHtml(model)}</option>`).join('');
    });
}
function pixmaxTextModelValue(root){
    const providerId=root.querySelector('[data-creation-provider]')?.value,model=root.querySelector('[data-creation-model]')?.value;
    if(!pixmaxChatProviders().some(provider=>provider.id===providerId&&provider.chat_models.includes(model)))throw new Error('请选择已配置的文本供应商和模型');
    return {providerId,model};
}
function pixmaxTextModelUnchanged(root,config){
    return root.querySelector('[data-creation-provider]')?.value===config.providerId&&root.querySelector('[data-creation-model]')?.value===config.model;
}
function pixmaxTextContext(node){
    const incoming=new Set((canvas.connections||[]).filter(edge=>edge.to===node.id).map(edge=>edge.from));
    const sources=nodes.filter(source=>incoming.has(source.id));
    return {text:sources.map(source=>source.text||source.promptDraftText||'').filter(Boolean).join('\n\n'),
        images:sources.flatMap(source=>(source.images||[]).filter(media=>mediaKindForItem(media)==='image').map(media=>media.url)).slice(0,8),
        videos:sources.flatMap(source=>(source.images||[]).filter(media=>mediaKindForItem(media)==='video').map(media=>media.url)).slice(0,3)};
}
async function runPixmaxTextTask(node,request,apply,valid=()=>true,decode=text=>text){
    if(isSmartCanvasLocked())throw new Error('请先开始编辑画布');
    if(pixmaxTextJobs.has(node))throw new Error('此节点正在生成，请等待当前任务完成');
    if(!request.message?.trim())throw new Error('请先填写创作内容');
    pixmaxTextJobs.add(node);
    try{
        const base=canvasTaskWriteGuard(node),origin=canvas;
        const guard={valid:()=>canvas===origin&&nodes.includes(node)&&!isSmartCanvasLocked()&&base.valid()&&valid(),
            check(){base.check();if(!this.valid())throw new Error('画布、输入或编辑资格已变化，结果未写入');}};
        guard.check();
        const binding=smartTaskInputBinding(node,node,guard);
        const payload={message:request.message,system_prompt:request.systemPrompt||'',model:request.model,provider_id:request.providerId,
            messages:(request.messages||[]).slice(-100).map(({role,content})=>({role,content})),images:request.images||[],videos:request.videos||[]};
        if(request.videoSampling)payload.video_sampling=request.videoSampling;
        if(request.videoFrames)payload.video_frames=request.videoFrames;
        let task;
        if(binding){
            if(!window.CanvasLLMTasks?.run)throw new Error('文本任务组件尚未加载，请保存后刷新');
            task=await window.CanvasLLMTasks.run(payload,{binding,canvasId:origin.id});
        }else{
            const input=JSON.stringify(smartTaskInputDocument());
            const result=await window.CanvasApi.canvasLLM({...payload,provider:request.providerId});
            guard.check();
            if(JSON.stringify(smartTaskInputDocument())!==input)throw new Error('生成输入已变化，结果未写入');
            task={result};
        }
        guard.check();
        const result=decode(task.result.text);
        const write=()=>{
            pushUndo();apply(result,task);
            if(task.id){
                node.result_task_id=task.id;
                node.creationResults=[...(node.creationResults||[]).filter(item=>item.taskId!==task.id),{taskId:task.id,text:task.result.text}].slice(-50);
            }
        };
        if(binding)binding.apply(task,write,task.id);else write();
        refreshSmartNodes([node.id]);scheduleSave();
        return task.result.text;
    }finally{pixmaxTextJobs.delete(node);}
}
function pixmaxStructuredShots(text){
    const clean=text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
    let value;
    try{value=JSON.parse(clean);}catch{throw new Error('模型回复不是有效分镜 JSON，原结果已保留在任务记录中');}
    const shots=Array.isArray(value)?value:value.shots;
    if(!Array.isArray(shots)||!shots.length||shots.length>100)throw new Error('分镜必须包含 1 到 100 个镜头');
    const fields=['description','size','lighting','dialogue','sound','movement','asset','prompt'];
    return shots.map(shot=>{
        if(!shot||typeof shot!=='object'||Array.isArray(shot))throw new Error('模型返回的镜头格式不正确');
        const duration=Number(shot.duration??5);
        if(!Number.isFinite(duration)||duration<=0||duration>600)throw new Error('镜头时长必须在 0 到 600 秒之间');
        if(!String(shot.description||shot.prompt||'').trim())throw new Error('模型返回了空镜头，请核对任务回复');
        return Object.fromEntries([['duration',duration],...fields.map(field=>[field,String(shot[field]||'')])]);
    });
}
function pixmaxCreationModal(title){
    const modal=document.createElement('div');modal.className='pixmax-creation-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-label',title);
    modal.innerHTML=`<section><header><strong>${escapeHtml(title)}</strong><button type="button" data-creation-close aria-label="关闭${escapeAttr(title)}">×</button></header><div class="pixmax-creation-content"></div><p class="pixmax-creation-status" role="status"></p></section>`;
    modal.querySelector('[data-creation-close]').onclick=()=>modal.remove();
    modal.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape')modal.remove();});
    modal.addEventListener('wheel',event=>event.stopPropagation(),{passive:true});
    document.body.appendChild(modal);return modal;
}
function openPixmaxTextGeneration(node){
    if(isSmartCanvasLocked())return;
    const origin=canvas,epoch=window.MemberCanvasEdit?.active?.lease?.epoch,context=pixmaxTextContext(node),saved=node.textGeneration||{};
    const modal=pixmaxCreationModal('文本生成'),body=modal.querySelector('.pixmax-creation-content');
    body.innerHTML=`<div class="pixmax-creation-models">${pixmaxTextModelControls(saved)}</div><label>创作要求<textarea data-text-request aria-label="文本创作要求" placeholder="描述你想写的内容">${escapeHtml(saved.input||context.text||node.text||'')}</textarea></label><label>角色要求<textarea data-text-system aria-label="文本角色要求" placeholder="例如：你是一位电影编剧">${escapeHtml(saved.systemPrompt||'')}</textarea></label><button class="pixmax-creation-primary" type="button" data-text-run>生成文本</button>`;
    bindPixmaxTextModels(modal);
    const valid=()=>modal.isConnected&&canvas===origin&&nodes.includes(node)&&!isSmartCanvasLocked()&&window.MemberCanvasEdit?.active?.lease?.epoch===epoch;
    modal.querySelector('[data-text-run]').onclick=async event=>{
        const button=event.target,status=modal.querySelector('[role=status]');
        try{
            if(!valid())throw new Error('编辑资格已变化，请重新打开文本生成');
            const config={...pixmaxTextModelValue(modal),input:modal.querySelector('[data-text-request]').value,systemPrompt:modal.querySelector('[data-text-system]').value};
            if(!config.input.trim())throw new Error('请先填写创作要求');
            pushUndo();node.textGeneration=config;scheduleSave();
            button.disabled=true;status.textContent='正在生成文本…';
            const request=JSON.stringify(config);
            const liveContext=pixmaxTextContext(node);
            await runPixmaxTextTask(node,{...config,...liveContext,message:[config.input,liveContext.text?'引用文本：\n'+liveContext.text:''].filter(Boolean).join('\n\n')},text=>node.text=text,()=>valid()&&pixmaxTextModelUnchanged(modal,config)&&modal.querySelector('[data-text-request]').value===config.input&&modal.querySelector('[data-text-system]').value===config.systemPrompt&&JSON.stringify(node.textGeneration)===request);
            status.textContent='文本已更新到节点';
        }catch(error){status.textContent=error.message||'文本生成失败';}
        finally{button.disabled=false;}
    };
}
function focusPixmaxNode(node){
    const bounds=nodeRect(node),center=viewportCenter();
    viewport.x+=(center.x-bounds.x-bounds.width/2)*viewport.scale;
    viewport.y+=(center.y-bounds.y-bounds.height/2)*viewport.scale;
    smartSelection.createdNode(node.id);applyViewport();render();
}
function bindPixmaxSidebarEvents(panel){
    for(const type of ['mousedown','click','dblclick','contextmenu','keydown'])panel.addEventListener(type,event=>event.stopPropagation());
    panel.addEventListener('wheel',event=>event.stopPropagation(),{passive:true});
}
function openPixmaxPins(){
    return window.PixmaxTags.openPins();
}
function openPixmaxAssistant(){
    if(isSmartCanvasLocked())return toast('请先开始编辑画布');
    document.getElementById('pixmaxAssistantPanel')?.remove();
    const origin=canvas,epoch=window.MemberCanvasEdit?.active?.lease?.epoch;
    const panel=document.createElement('aside');panel.id='pixmaxAssistantPanel';panel.className='pixmax-creation-sidebar';panel.setAttribute('aria-label','创作助手');
    panel.innerHTML=`<header><strong>创作助手</strong><button type="button" data-assistant-close aria-label="关闭创作助手">×</button></header><div class="pixmax-creation-models">${pixmaxTextModelControls()}</div><p class="pixmax-creation-hint">引用当前节点的输入与 pin 素材，帮你构思、改写和生成提示词。</p><div class="pixmax-assistant-messages" aria-live="polite"></div><label>创作要求<textarea aria-label="助手创作要求" data-assistant-input placeholder="你想创作什么？"></textarea></label><button type="button" class="pixmax-creation-primary" data-assistant-send>发送</button><p role="status"></p>`;
    shell.appendChild(panel);bindPixmaxTextModels(panel);
    panel.querySelector('[data-assistant-close]').onclick=()=>panel.remove();
    bindPixmaxSidebarEvents(panel);
    let owner=selectedNode();
    const draw=()=>{
        const root=panel.querySelector('.pixmax-assistant-messages');
        root.innerHTML=(owner?.assistantMessages||[]).map((item,index)=>`<article class="pixmax-assistant-${item.role}"><strong>${item.role==='user'?'你':'创作助手'}</strong><p>${escapeHtml(item.content)}</p>${item.role==='assistant'?`<button type="button" data-assistant-insert="${index}">插入文本节点</button>`:''}</article>`).join('');root.scrollTop=root.scrollHeight;
    };
    panel.querySelector('[data-assistant-send]').onclick=async event=>{
        const button=event.target,status=panel.querySelector('[role=status]');
        const valid=()=>panel.isConnected&&canvas===origin&&!isSmartCanvasLocked()&&window.MemberCanvasEdit?.active?.lease?.epoch===epoch;
        try{
            if(!valid())throw new Error('编辑资格已变化，请重新打开助手');
            const input=panel.querySelector('[data-assistant-input]').value.trim(),model=pixmaxTextModelValue(panel);
            if(!input)throw new Error('请先填写创作要求');
            if(!owner||!nodes.includes(owner)){
                owner=selectedNode();
                if(!owner){const point=viewportCenter();owner=createPromptNode(point.x,point.y,{select:false});owner.label='创作助手';}
            }
            const references=()=>[owner,...nodes.filter(node=>(window.PixmaxTags?PixmaxTags.ids(node).length:node.pinned)&&node!==owner)];
            const signature=()=>JSON.stringify(references().map(node=>({id:node.id,text:node.text||'',prompt:node.promptDraftText||'',images:(node.images||[]).map(mediaItemForStorage)})));
            const pinned=references(),snapshot=signature();
            const context=pixmaxTextContext(owner),pinsText=pinned.map(node=>[node.label||node.title||'素材',node.text||node.promptDraftText||'',...(node.images||[]).map(media=>media.name||media.kind||'素材')].join('\n')).join('\n\n');
            const request={...model,message:[input,context.text,pinsText].filter(Boolean).join('\n\n'),systemPrompt:'你是画布创作助手。依据用户要求和提供的素材上下文，给出可直接使用的创意、剧本或生成提示词。',messages:owner.assistantMessages||[],images:[...context.images,...pinned.flatMap(node=>(node.images||[]).filter(media=>mediaKindForItem(media)==='image').map(media=>media.url))].slice(0,8),videos:context.videos};
            pushUndo();owner.assistantRequest={input,...model};scheduleSave();
            button.disabled=true;status.textContent='创作助手正在思考…';
            await runPixmaxTextTask(owner,request,(text,task)=>{owner.assistantMessages=[...(owner.assistantMessages||[]),{role:'user',content:input},{role:'assistant',content:text,...(task.id?{taskId:task.id}:{})}];},()=>valid()&&pixmaxTextModelUnchanged(panel,model)&&panel.querySelector('[data-assistant-input]').value.trim()===input&&signature()===snapshot);
            panel.querySelector('[data-assistant-input]').value='';status.textContent='';draw();
        }catch(error){status.textContent=error.message||'创作助手请求失败';}
        finally{button.disabled=false;}
    };
    panel.addEventListener('click',event=>{
        const button=event.target.closest('[data-assistant-insert]');if(!button||canvas!==origin||isSmartCanvasLocked()||window.MemberCanvasEdit?.active?.lease?.epoch!==epoch)return;
        const message=owner?.assistantMessages?.[Number(button.dataset.assistantInsert)];if(!message)return;
        const point=viewportCenter(),node=createPromptNode(point.x,point.y,{select:false});node.text=message.content;node.label='创作助手 · 文本';if(message.taskId)node.result_task_id=message.taskId;render();scheduleSave();toast('已插入文本节点');
    });
    draw();
}
