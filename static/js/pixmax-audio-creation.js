/* Speech/music controls from the native canvas, backed by durable member tasks. */
(() => {
    'use strict';
    const jobs=new Set();
    const providers=()=>apiProviders.filter(provider=>provider.enabled!==false&&provider.has_key&&provider.audio_models?.length);
    const speechControls=[['timbre_id','音色 ID','text','male-qn-qingse'],['speed','语速','number',1,.5,2,.01],['vol','音量','number',1,0,10,.01],['pitch','音调','number',0,-12,12,1]];
    const advanced=[['voice_modify_pitch','音高修饰','number',0,-100,100,1],['voice_modify_intensity','声音力度','number',0,-100,100,1],['voice_modify_timbre','音色修饰','number',0,-100,100,1]];
    function inputs(rows,settings){return rows.map(([key,label,type,value,min,max,step])=>key==='timbre_id'?`<label>音色<input data-audio-field="timbre_id" type="hidden" value="${escapeAttr(settings[key]??value)}"><button type="button" data-audio-voice aria-label="选择音色">${escapeHtml(settings[key]||value)} ▾</button></label>`:`<label>${label}<input data-audio-field="${key}" aria-label="${label}" type="${type}" value="${escapeAttr(settings[key]??value)}" ${type==='number'?`min="${min}" max="${max}" step="${step}"`:''}></label>`).join('');}
    function context(node){
        const ids=new Set((canvas.connections||[]).filter(edge=>edge.to===node.id).map(edge=>edge.from));
        const sources=nodes.filter(source=>ids.has(source.id));
        if(sources.length>20||sources.some(source=>source.type!=='smart-prompt'))throw new Error('音频生成支持最多 20 个文本输入节点');
        return sources.map(source=>source.text||'').filter(Boolean).join('\n\n');
    }
    async function open(node){
        if(isSmartCanvasLocked()||!nodes.includes(node))return;
        const root=pixmaxCreationModal('音频生成'),body=root.querySelector('.pixmax-creation-content'),saved=node.audioGeneration||{};
        const catalog=providers(),selected=catalog.find(provider=>provider.id===saved.provider_id)||catalog[0];
        body.innerHTML=`<div class="pixmax-creation-models"><label>供应商<select data-audio-provider aria-label="音频供应商">${catalog.map(provider=>`<option value="${escapeAttr(provider.id)}" ${provider===selected?'selected':''}>${escapeHtml(provider.name||provider.id)}</option>`).join('')}</select></label><label>模型<select data-audio-model aria-label="音频模型"></select></label></div>${catalog.length?'':'<p class="pixmax-creation-hint">请在管理平台配置并分配音频模型。</p>'}<label>创作内容<textarea data-audio-field="prompt" aria-label="音频创作内容" maxlength="9999" placeholder="填写配音文本，或音乐风格描述">${escapeHtml(saved.prompt||'')}</textarea></label><div data-audio-speech class="pixmax-audio-fields">${inputs(speechControls,saved)}</div><details data-audio-advanced><summary>声音修饰</summary><div class="pixmax-audio-fields">${inputs(advanced,saved)}<label>声音效果<select data-audio-field="voice_modify_sound_effects" aria-label="声音效果">${[['','无'],['spacious_echo','空间回声'],['auditorium_echo','礼堂回声'],['lofi_telephone','电话音效'],['robotic','机器人音效']].map(([id,label])=>`<option value="${id}" ${id===saved.voice_modify_sound_effects?'selected':''}>${label}</option>`).join('')}</select></label></div></details><div data-audio-music><label>音乐模式<select data-audio-field="music_mode" aria-label="音乐模式">${[['CUSTOM','自定义歌词'],['ADAPTIVE','自动生成歌词'],['INSTRUMENTAL','纯音乐']].map(([id,label])=>`<option value="${id}" ${id===(saved.music_mode||'CUSTOM')?'selected':''}>${label}</option>`).join('')}</select></label><label data-audio-lyrics>歌词<textarea data-audio-field="lyrics" aria-label="歌词" maxlength="3500">${escapeHtml(saved.lyrics||'')}</textarea></label></div><p data-audio-references class="pixmax-creation-hint"></p><button type="button" data-audio-run class="pixmax-creation-primary">生成音频</button>`;
        const model=body.querySelector('[data-audio-model]'),providerInput=body.querySelector('[data-audio-provider]'),run=body.querySelector('[data-audio-run]'),status=root.querySelector('[role=status]');
        function modes(){const music=model.value.startsWith('music-');body.querySelector('[data-audio-speech]').hidden=body.querySelector('[data-audio-advanced]').hidden=music;body.querySelector('[data-audio-music]').hidden=!music;body.querySelector('[data-audio-lyrics]').hidden=body.querySelector('[data-audio-field="music_mode"]').value!=='CUSTOM';}
        function models(){const current=providers().find(provider=>provider.id===providerInput.value);model.innerHTML=(current?.audio_models||[]).filter(value=>!['voice-design','voice-clone'].includes(value)).map(value=>`<option value="${escapeAttr(value)}" ${value===saved.model?'selected':''}>${escapeHtml(value)}</option>`).join('');run.disabled=!model.value||jobs.has(node);modes();}
        providerInput.onchange=models;model.onchange=modes;body.querySelector('[data-audio-field="music_mode"]').onchange=modes;models();
        try{const text=context(node);body.querySelector('[data-audio-references]').textContent=text?'将引用已连接的文本节点。':'';}catch(error){status.textContent=error.message;}
        const origin=canvas,base=canvasTaskWriteGuard(node);
        const valid=()=>root.isConnected&&canvas===origin&&nodes.includes(node)&&!isSmartCanvasLocked()&&base.valid();
        body.querySelector('[data-audio-voice]').onclick=()=>{
            if(!valid()||model.value.startsWith('music-'))return;
            const selectedProvider=providerInput.value,selectedModel=model.value,input=body.querySelector('[data-audio-field="timbre_id"]');
            window.PixmaxAudioVoices.open({parent:root,node,provider:selectedProvider,model:selectedModel,value:input.value,
                valid:()=>valid()&&providerInput.value===selectedProvider&&model.value===selectedModel,
                onSelect:voice=>{input.value=voice.id;body.querySelector('[data-audio-voice]').textContent=voice.name+' ▾';},
                onDeleteSelected:()=>{input.value='';body.querySelector('[data-audio-voice]').textContent='选择音色 ▾';}});
        };
        function configuration(){
            const provider_id=providerInput.value,chosen=model.value;
            if(!providers().some(provider=>provider.id===provider_id&&provider.audio_models.includes(chosen)))throw new Error('请选择已配置的音频供应商和模型');
            const fields=Object.fromEntries([...body.querySelectorAll('[data-audio-field]')].map(input=>[input.dataset.audioField,input.type==='number'?Number(input.value):input.value]));
            if(!chosen.startsWith('music-')&&!fields.timbre_id)throw new Error('请选择音色');
            return {provider_id,model:chosen,mode:chosen.startsWith('music-')?'music':'speech',...fields};
        }
        if(smartPendingTasks(node).some(task=>task.kind==='audio')){run.textContent='查询已有音频任务';}
        run.onclick=async()=>{
            if(jobs.has(node)||window.PixmaxBatchExecution?.busy(node.id))return;jobs.add(node);run.disabled=true;let binding,config,request;
            try{
                if(!valid())throw new Error('画布或编辑资格已变化，请重新打开音频生成');
                const pending=smartPendingTasks(node).find(task=>task.kind==='audio');
                if(pending){
                    status.textContent='正在查询原音频任务…';
                    const response=await window.CanvasApi.getCanvasAudioTaskRequest(pending.taskId);if(!response.ok)throw new Error('原任务暂不可读取，请在生成结果中核对');
                    const record=await response.json();if(!valid())throw new Error('编辑资格已变化');
                    if(record.status==='succeeded'){
                        binding=await window.CanvasTaskBindings.recover({task:record,taskId:pending.taskId,canvasId:canvas.id,kind:'smart',sourceId:node.id,targetId:node.id,read:smartTaskInputDocument,valid});
                        await commitSmartStudioTaskResult(node,record,'audio',binding,{recovered:true,valid});status.textContent='音频已加入节点';run.textContent='生成音频';return;
                    }
                    if(['failed','cancelled','needs_review'].includes(record.status))throw new Error('原任务未完成，请先在生成结果中核对');
                    status.textContent='后台正在处理，稍后查询已有任务';return;
                }
                const invalid=[...body.querySelectorAll('input,textarea')].find(input=>!input.checkValidity());
                if(invalid){invalid.reportValidity();throw new Error('请检查音频参数范围');}
                config=configuration();const text=context(node);request={...config,prompt:[config.prompt,text].filter(Boolean).join('\n\n')};
                if(!request.prompt.trim()&&!(config.mode==='music'&&config.music_mode==='CUSTOM'&&config.lyrics.trim()))throw new Error('请填写创作内容或连接文本节点');
                if(request.prompt.length>(config.mode==='music'?2000:9999))throw new Error(config.mode==='music'?'音乐描述和引用文本合计最多 2000 个字符':'配音文本和引用文本合计最多 9999 个字符');
                if(config.mode==='music'&&config.music_mode==='CUSTOM'&&!config.lyrics.trim())throw new Error('自定义歌曲需要歌词');
                pushUndo();node.audioGeneration=config;scheduleSave();
                const signature=JSON.stringify(config),guard={valid:()=>{try{return valid()&&JSON.stringify(configuration())===signature&&JSON.stringify(node.audioGeneration)===signature;}catch{return false;}},
                    check(){if(!this.valid())throw new Error('音频输入或编辑资格已变化，原任务结果已保留');}};
                binding=smartTaskInputBinding(node,node,guard);if(!binding)throw new Error('请在成员画布中生成音频');
                status.textContent='正在生成音频…';
                const record=await window.CanvasAudioTasks.run(request,{binding,canvasId:canvas.id,onRemember:async receipt=>{
                    guard.check();binding.mutate(()=>{node.pendingTasks=[...smartPendingTasks(node),attachSmartTaskBinding({taskId:receipt.task_id,kind:'audio',providerId:config.provider_id,model:config.model,startedAt:nowMs(),run:{nodeId:node.id,nodeType:node.type,kind:'audio',prompt:request.prompt,settings:config,refs:[]}},binding)];node.pending=smartPendingTasks(node).length;});
                    refreshSmartNodes([node.id]);scheduleSave();await saveCanvas({force:true});
                }});
                guard.check();await commitSmartStudioTaskResult(node,record,'audio',binding,{valid:()=>guard.valid()});status.textContent='音频已加入节点';
            }catch(error){
                if(valid()&&error.resultPending&&error.taskId&&!smartPendingTasks(node).some(task=>task.taskId===error.taskId)){
                    node.pendingTasks=[...smartPendingTasks(node),{taskId:error.taskId,kind:'audio',paused:true,providerId:config?.provider_id,model:config?.model,run:{nodeId:node.id,kind:'audio',prompt:request?.prompt||'',settings:config||{}}}];node.pending=0;render();scheduleSave();
                }
                if(error.inputChanged&&canvas===origin&&nodes.includes(node)&&base.valid())pauseSmartTaskInput(node,binding,base,error);
                if(root.isConnected)status.textContent=error.message||'音频生成未完成，请核对原任务';
            }finally{jobs.delete(node);run.disabled=!model.value;if(smartPendingTasks(node).some(task=>task.kind==='audio'))run.textContent='查询已有音频任务';}
        };
    }
    function prepare(node){
        const config=node.audioGeneration;if(!config||!providers().some(provider=>provider.id===config.provider_id&&provider.audio_models.includes(config.model)))throw new Error('请先配置音频供应商和模型');
        const request={...config,prompt:[config.prompt,context(node)].filter(Boolean).join('\n\n')};
        if(!request.prompt.trim()&&!(config.mode==='music'&&config.music_mode==='CUSTOM'&&config.lyrics?.trim()))throw new Error('请填写音频创作内容或连接文本节点');
        return request;
    }
    window.PixmaxAudioCreation=Object.freeze({open,prepare,busy:node=>node?jobs.has(node):jobs.size>0});
})();
