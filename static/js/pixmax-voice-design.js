/* Native text voice design: durable audition, then explicit registration. */
(() => {
    'use strict';
    let active=null;
    const languageNames={Chinese:'中文-普通话','Chinese,Yue':'中文-粤语',English:'英文',Japanese:'日文',Korean:'韩文',Spanish:'西班牙文',Portuguese:'葡萄牙文',French:'法文',Indonesian:'印尼文',German:'德文',Russian:'俄文',Italian:'意大利文',Arabic:'阿拉伯文',Turkish:'土耳其文',Ukrainian:'乌克兰文',Dutch:'荷兰文',Vietnamese:'越南文',Thai:'泰文',Polish:'波兰文',Romanian:'罗马尼亚文',Greek:'希腊文',Czech:'捷克文',Finnish:'芬兰文',Hindi:'印地文'};
    function stop(root){root.querySelectorAll('audio').forEach(audio=>{audio.pause();audio.removeAttribute('src');audio.load();});}
    function close(){const state=active;if(!state)return;active=null;state.abort.abort();state.observer.disconnect();stop(state.root);state.root.remove();if(state.parent.isConnected&&state.valid())state.parent.querySelector('[data-voice-design]')?.focus({preventScroll:true});}
    function open({parent,node,provider,model,catalog,voice,canGenerate=true,valid,onRegistered}){
        if(!node||!nodes.includes(node)||!valid())return;close();
        const origin=canvas,base=canvasTaskWriteGuard(node),root=pixmaxCreationModal(voice?'编辑音色':'文本生成音色');root.classList.add('pixmax-voice-design');root.setAttribute('aria-modal','true');root.tabIndex=-1;
        const state={root,parent,valid,abort:new AbortController(),running:false,jobId:null,draft:{prompt:'',preview:''},observer:null};active=state;
        const alive=()=>active===state&&root.isConnected&&parent.isConnected&&valid()&&base.valid()&&canvas===origin&&nodes.includes(node);
        state.observer=new MutationObserver(()=>{if(!alive())close();});state.observer.observe(document.body,{childList:true,subtree:true,attributes:true});
        const body=root.querySelector('.pixmax-creation-content'),status=root.querySelector('[role=status]');
        root.querySelector('[data-creation-close]').onclick=close;root.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}},true);root.focus({preventScroll:true});
        const options=(values,selected,placeholder='请选择')=>`<option value="">${placeholder}</option>`+Object.entries(values).map(([id,label])=>`<option value="${escapeAttr(id)}" ${id===selected?'selected':''}>${escapeHtml(label)}</option>`).join('');
        async function registration(record){
            if(!alive())return;const result=record.result,source=result?.audios?.[0],sample=imageForDisplay(typeof source==='string'?{url:source,kind:'audio'}:source),voiceId=result?.audio_info?.voice_id;
            if(record.id!==state.jobId||result?.audio_info?.mode!=='design'||!sample?.url||!voiceId)throw Error('音色结果尚不可登记，请查询原任务');
            state.running=false;root.querySelector('header strong').textContent=voice?'编辑音色':'音色登记';
            body.innerHTML=`<label>生成音色结果<audio controls preload="metadata" src="${escapeAttr(displayMediaUrl(sample))}"></audio></label><label>音色名称<input data-voice-field="name" aria-label="音色名称" maxlength="180" value="${escapeAttr(voice?.name||'')}" required placeholder="请输入你的专属音色名称"></label><div class="pixmax-voice-registration-fields"><label>语言<select data-voice-field="language" aria-label="音色登记语言" required>${options(languageNames,voice?.language)}</select></label><label>口音<select data-voice-field="accent" aria-label="音色登记口音">${options({CHINESE_SOUTHERN:'中国-南方',CHINESE_NORTHERN:'中国-北方',ENGLISH_US:'英语-美音',ENGLISH_UK:'英语-英音',ENGLISH_AUSTRALIAN:'英语-澳洲口音',ENGLISH_INDIAN:'英语-印度口音'},voice?.accent,'不选择口音')}</select></label><label>性别<select data-voice-field="gender" aria-label="音色登记性别" required>${options({MALE:'男声',FEMALE:'女声'},voice?.gender)}</select></label><label>年龄<select data-voice-field="age" aria-label="音色登记年龄" required>${options({CHILD:'儿童',YOUTH:'青年',ADULT:'成年',ELDER:'老年'},voice?.age)}</select></label></div><label>音色描述<textarea data-voice-field="description" aria-label="音色描述" maxlength="1000">${escapeHtml(voice?.description||'')}</textarea></label><button type="button" data-voice-register>${voice?'保存音色':'创建音色'}</button>`;
            if(!voice){const back=document.createElement('button');back.type='button';back.dataset.voiceDesignBack='';back.textContent='返回';body.appendChild(back);back.onclick=()=>{if(!alive()||state.running)return;state.jobId=null;root.querySelector('header strong').textContent='文本生成音色';designer(state.draft.prompt,state.draft.preview);status.textContent='';root.focus({preventScroll:true});};}
            root.focus({preventScroll:true});status.textContent='';body.querySelector('[data-voice-register]').onclick=async event=>{
                if(!alive()||state.running)return;const fields=[...body.querySelectorAll('[data-voice-field]')];if(fields.some(field=>!field.reportValidity()))return;
                state.running=true;event.target.disabled=true;status.textContent='正在保存音色…';
                try{const response=await CanvasApi.registerCanvasAudioVoice({provider_id:provider,model,catalog_id:catalog,task_id:state.jobId,...Object.fromEntries(fields.map(field=>[field.dataset.voiceField,field.value]))},{signal:state.abort.signal});
                    if(!alive())return;if(!response.ok)throw Error(await responseErrorMessage(response,'音色登记失败，请重试'));const saved=await response.json();if(saved.voice_id!==voiceId)throw Error('音色标识不一致，请刷新目录');close();await onRegistered(saved);
                }catch(error){if(alive()){status.textContent=error.message;state.running=false;event.target.disabled=false;}}
            };
        }
        function designer(prompt='',preview=''){
            stop(root);state.draft={prompt,preview};
            body.innerHTML=`<p>使用文字描述设计你的全新音色</p><label>提示词<textarea data-voice-design-prompt aria-label="音色设计提示词" maxlength="10000" required placeholder="例：充满激情和活力的体育赛事解说员">${escapeHtml(prompt)}</textarea></label><label>试听文本<textarea data-voice-design-preview aria-label="音色试听文本" maxlength="500" required placeholder="填写用于试听的文本">${escapeHtml(preview)}</textarea></label><button type="button" data-voice-design-run>生成音色</button>`;
            body.querySelector('[data-voice-design-run]').onclick=generate;
            body.querySelector('[data-voice-design-run]').disabled=!canGenerate;
            const hint=document.createElement('small');hint.textContent='生成试听按当前供应商的音色设计计费。';body.appendChild(hint);
        }
        async function inspect(id){
            state.jobId=id;state.running=true;status.textContent='正在查询已有音色任务…';const button=body.querySelector('[data-voice-design-run]');if(button)button.disabled=true;
            try{let response=await CanvasApi.getCanvasAudioTaskRequest(id),record;if(!response.ok)throw Error(await responseErrorMessage(response,'音色任务查询失败'));record=await response.json();if(!alive())return;
                if(record.status!=='succeeded')record=await pollSmartCanvasTask(id,'audio',{returnRecord:true,inputBinding:{check(){if(!alive())throw Error('音色面板已关闭，原任务继续保留');},verify(task,expected){if(task.id!==expected)throw Error('音色任务标识不一致，请查询原任务');}}});if(!alive())return;await registration(record);
            }catch(error){if(alive()){root.focus({preventScroll:true});status.textContent=(error.message||'查询未完成')+'；关闭后可重新打开查询原任务';state.running=false;if(button){button.disabled=false;button.textContent='查询已有音色任务';button.onclick=()=>inspect(id);}}}
        }
        async function generate(){
            if(!alive()||state.running||!canGenerate)return;const prompt=body.querySelector('[data-voice-design-prompt]'),preview=body.querySelector('[data-voice-design-preview]');if(!prompt.reportValidity()||!preview.reportValidity())return;
            state.running=true;const button=body.querySelector('[data-voice-design-run]');button.disabled=true;status.textContent='正在生成音色…';
            const input={prompt:prompt.value,preview_text:preview.value};state.draft={prompt:input.prompt,preview:input.preview_text};const guard={valid:()=>alive()&&prompt.value===input.prompt&&preview.value===input.preview_text,check(){if(!this.valid())throw Error('音色输入或编辑资格已变化，请重新打开查询原任务');}};
            try{const binding=smartTaskInputBinding(node,node,guard);const record=await CanvasAudioTasks.run({provider_id:provider,model:'voice-design',mode:'design',voice_catalog_id:catalog,...input},{binding,canvasId:origin.id,onRemember:async receipt=>{state.jobId=receipt.task_id;}});if(alive())await registration(record);
            }catch(error){if(alive()){root.focus({preventScroll:true});status.textContent=error.message||'生成尚未确认，请查询原任务';state.running=false;if(error.resultPending&&error.taskId){state.jobId=error.taskId;button.textContent='查询已有音色任务';button.onclick=()=>inspect(error.taskId);}button.disabled=false;}}
        }
        designer();status.textContent='正在核对已有音色任务…';body.querySelector('[data-voice-design-run]').disabled=true;
        (async()=>{try{
            if(voice){state.jobId=voice.task_id;await inspect(voice.task_id);return;}
            const response=await CanvasApi.getCanvasAudioVoiceDesignTasks(provider,model,origin.id,node.id,{signal:state.abort.signal});if(!alive())return;if(!response.ok)throw Error(await responseErrorMessage(response,'音色任务核对失败'));
            const latest=(await response.json()).tasks?.find(task=>!task.registered&&['queued','running','submitting','polling','finalizing','needs_review','succeeded'].includes(task.status));if(!alive())return;
            if(latest){designer(latest.prompt,latest.preview_text);await inspect(latest.task_id);}else{body.querySelector('[data-voice-design-run]').disabled=!canGenerate;status.textContent=canGenerate?'':'请为当前供应商配置 voice-design 音色设计模型';}
        }catch(error){if(alive())status.textContent=(error.message||'音色任务核对失败')+'；请关闭后重试';}})();
    }
    window.PixmaxVoiceDesign=Object.freeze({open,close,get opened(){return Boolean(active);}});
})();
