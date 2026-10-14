/* Native text voice design: durable audition, then explicit registration. */
(() => {
    'use strict';
    let active=null;
    const languageNames={Chinese:'中文-普通话','Chinese,Yue':'中文-粤语',English:'英文',Japanese:'日文',Korean:'韩文',Spanish:'西班牙文',Portuguese:'葡萄牙文',French:'法文',Indonesian:'印尼文',German:'德文',Russian:'俄文',Italian:'意大利文',Arabic:'阿拉伯文',Turkish:'土耳其文',Ukrainian:'乌克兰文',Dutch:'荷兰文',Vietnamese:'越南文',Thai:'泰文',Polish:'波兰文',Romanian:'罗马尼亚文',Greek:'希腊文',Czech:'捷克文',Finnish:'芬兰文',Hindi:'印地文'};
    function stop(root){root.querySelectorAll('audio').forEach(audio=>{audio.pause();audio.removeAttribute('src');audio.load();});}
    function close(){const state=active;if(!state)return;active=null;state.abort.abort();state.observer.disconnect();state.recorder?.dispose();state.unsubscribe?.();stop(state.root);state.root.remove();if(state.parent.isConnected&&state.valid())state.parent.querySelector('[data-voice-design]')?.focus({preventScroll:true});}
    function open({parent,node,provider,model,catalog,voice,mode=voice?.source||'design',canGenerate=true,valid,onRegistered}){
        if(!node||!nodes.includes(node)||!valid())return;close();
        const origin=canvas,base=canvasTaskWriteGuard(node),root=pixmaxCreationModal(voice?'编辑音色':mode==='clone'?'录音生成音色':'文本生成音色');root.classList.add('pixmax-voice-design');root.setAttribute('aria-modal','true');root.tabIndex=-1;
        const state={root,parent,valid,abort:new AbortController(),running:false,jobId:null,draft:{prompt:'',preview:''},observer:null};active=state;
        const alive=()=>active===state&&root.isConnected&&parent.isConnected&&valid()&&base.valid()&&canvas===origin&&nodes.includes(node);
        state.observer=new MutationObserver(()=>{if(!alive())close();});state.observer.observe(document.body,{childList:true,subtree:true,attributes:true});
        const body=root.querySelector('.pixmax-creation-content'),status=root.querySelector('[role=status]');
        root.querySelector('[data-creation-close]').onclick=close;root.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}},true);root.focus({preventScroll:true});
        const options=(values,selected,placeholder='请选择')=>`<option value="">${placeholder}</option>`+Object.entries(values).map(([id,label])=>`<option value="${escapeAttr(id)}" ${id===selected?'selected':''}>${escapeHtml(label)}</option>`).join('');
        async function registration(record){
            if(!alive())return;const result=record.result,source=result?.audios?.[0],sample=imageForDisplay(typeof source==='string'?{url:source,kind:'audio'}:source),voiceId=result?.audio_info?.voice_id;
            if(record.id!==state.jobId||result?.audio_info?.mode!==mode||!sample?.url||!voiceId)throw Error('音色结果尚不可登记，请查询原任务');
            state.recorder?.dispose();state.unsubscribe?.();state.recorder=null;state.unsubscribe=null;
            state.running=false;root.querySelector('header strong').textContent=voice?'编辑音色':'音色登记';
            body.innerHTML=`<label>生成音色结果<audio controls preload="metadata" src="${escapeAttr(displayMediaUrl(sample))}"></audio></label><label>音色名称<input data-voice-field="name" aria-label="音色名称" maxlength="180" value="${escapeAttr(voice?.name||'')}" required placeholder="请输入你的专属音色名称"></label><div class="pixmax-voice-registration-fields"><label>语言<select data-voice-field="language" aria-label="音色登记语言" required>${options(languageNames,voice?.language)}</select></label><label>口音<select data-voice-field="accent" aria-label="音色登记口音">${options({CHINESE_SOUTHERN:'中国-南方',CHINESE_NORTHERN:'中国-北方',ENGLISH_US:'英语-美音',ENGLISH_UK:'英语-英音',ENGLISH_AUSTRALIAN:'英语-澳洲口音',ENGLISH_INDIAN:'英语-印度口音'},voice?.accent,'不选择口音')}</select></label><label>性别<select data-voice-field="gender" aria-label="音色登记性别" required>${options({MALE:'男声',FEMALE:'女声'},voice?.gender)}</select></label><label>年龄<select data-voice-field="age" aria-label="音色登记年龄" required>${options({CHILD:'儿童',YOUTH:'青年',ADULT:'成年',ELDER:'老年'},voice?.age)}</select></label></div><label>音色描述<textarea data-voice-field="description" aria-label="音色描述" maxlength="1000">${escapeHtml(voice?.description||'')}</textarea></label><button type="button" data-voice-register>${voice?'保存音色':'创建音色'}</button>`;
            if(!voice){const back=document.createElement('button');back.type='button';back.dataset.voiceDesignBack='';back.textContent='返回';body.appendChild(back);back.onclick=()=>{if(!alive()||state.running)return;state.jobId=null;root.querySelector('header strong').textContent=mode==='clone'?'录音生成音色':'文本生成音色';designer(state.draft.prompt,state.draft.preview);state.checked=true;if(mode==='clone')updateRecording();status.textContent='';root.focus({preventScroll:true});};}
            root.focus({preventScroll:true});status.textContent='';body.querySelector('[data-voice-register]').onclick=async event=>{
                if(!alive()||state.running)return;const fields=[...body.querySelectorAll('[data-voice-field]')];if(fields.some(field=>!field.reportValidity()))return;
                state.running=true;event.target.disabled=true;status.textContent='正在保存音色…';
                try{const response=await CanvasApi.registerCanvasAudioVoice({provider_id:provider,model,catalog_id:catalog,task_id:state.jobId,...Object.fromEntries(fields.map(field=>[field.dataset.voiceField,field.value]))},{signal:state.abort.signal});
                    if(!alive())return;if(!response.ok)throw Error(await responseErrorMessage(response,'音色登记失败，请重试'));const saved=await response.json();if(saved.voice_id!==voiceId)throw Error('音色标识不一致，请刷新目录');close();await onRegistered(saved);
                }catch(error){if(alive()){status.textContent=error.message;state.running=false;event.target.disabled=false;}}
            };
        }
        const recordingText='好，换个话题。你们吃过真正手擀的面条吗？那种粗细不均厚薄不匀的。机器面再好吃也比不上那种带着手温的口感。今天想聊聊手工食物为什么总有一种机器替代不了的味道。欢迎明天继续收听。';
        function updateRecording(){
            if(!alive()||mode!=='clone'||!state.recorder)return;
            const sample=state.recorder.getSnapshot(),recording=sample.status==='recording',terms=body.querySelector('[data-voice-terms]'),run=body.querySelector('[data-voice-design-run]');if(!run)return;
            body.querySelector('[data-voice-record-time]').textContent=(Math.min(sample.elapsedMs,60000)/1000).toFixed(1)+' / 60 秒';
            body.querySelector('meter').value=sample.volume;
            const start=body.querySelector('[data-voice-record]');start.textContent=recording?'停止录制':sample.result?'重新录制':'开始录制';start.disabled=!canGenerate||!state.checked||state.running||state.starting||state.stopping;
            body.querySelector('[data-voice-sample-delete]').disabled=!sample.result||state.running;
            run.disabled=!canGenerate||!state.checked||state.running||sample.status!=='recorded'||!sample.result||sample.result.durationMs<10000||!sample.hasDetectedVoice||!terms.checked;
            if(sample.result&&!sample.hasDetectedVoice)status.textContent='录音样本音量不足，请重试';
            const audio=body.querySelector('[data-voice-record-sample]');if(sample.result&&audio.getAttribute('src')!==sample.result.url){audio.src=sample.result.url;audio.hidden=false;}
            if(recording&&sample.elapsedMs>=60000&&!state.stopping)finishRecording();
        }
        async function finishRecording(){
            if(state.stopping)return;state.stopping=true;
            try{await state.recorder.stop();if(alive()){status.textContent='录音样本已保存，可试听或重新录制';updateRecording();}}catch(error){if(alive())status.textContent=error.message;}finally{state.stopping=false;if(alive())updateRecording();}
        }
        function recording(){
            state.recorder?.dispose();state.unsubscribe?.();state.recorder=new PixmaxVoiceRecorder();state.uploaded=null;state.checked=false;
            body.innerHTML=`<p>朗读一段文字，即可克隆你的专属声音</p><div class="pixmax-voice-record-box"><p>${recordingText}</p><button type="button" data-voice-record>开始录制</button><output data-voice-record-time>0.0 / 60 秒</output><meter min="0" max="1" value="0" aria-label="录音音量"></meter></div><label>录音样本<audio data-voice-record-sample controls preload="metadata" hidden></audio></label><button type="button" data-voice-sample-delete disabled>删除录音样本</button><small>录音时长需在10秒～60秒之间，请在安静环境中清晰朗读。</small><label class="pixmax-voice-terms"><input type="checkbox" data-voice-terms>我已阅读并同意《声音克隆功能使用规则》</label><details><summary>声音克隆功能使用规则</summary><p>我确认对所上传的声音样本具有充分、合法、必要的权利或授权，并同意将其用于使用声音克隆功能；我承诺不将本功能用于违法违规的目的或用途。</p></details><button type="button" data-voice-design-run disabled>生成音色</button><small>生成试听按当前供应商的音色克隆配置计费。</small>`;
            state.unsubscribe=state.recorder.subscribe(updateRecording);
            body.querySelector('[data-voice-terms]').onchange=updateRecording;
            body.querySelector('[data-voice-record]').onclick=async()=>{
                if(!alive()||state.running||state.starting||state.stopping)return;
                if(state.recorder.getSnapshot().status==='recording'){if(state.recorder.getSnapshot().elapsedMs<10000){status.textContent='录音时长需在10秒～60秒之间';return;}await finishRecording();return;}
                if(!body.querySelector('[data-voice-terms]').checked){status.textContent='请勾选协议后再开始录音';body.querySelector('[data-voice-terms]').focus();return;}
                state.starting=true;state.uploaded=null;stop(root);state.recorder.reset();body.querySelector('[data-voice-record-sample]').hidden=true;status.textContent='正在申请麦克风权限…';updateRecording();
                const recorder=state.recorder;
                try{await recorder.start();if(!alive()||!body.querySelector('[data-voice-terms]').checked){recorder.dispose();return;}status.textContent='正在录制，请清晰朗读';}
                catch(error){if(alive())status.textContent=error.code==='permission-denied'?'麦克风权限未获允许，请调整浏览器权限后重试':error.code==='unsupported'?'当前浏览器无法录音，请使用支持麦克风的安全连接':error.message;}
                finally{state.starting=false;if(alive())updateRecording();}
            };
            body.querySelector('[data-voice-sample-delete]').onclick=()=>{if(!alive()||state.running)return;stop(root);state.recorder.reset();state.uploaded=null;body.querySelector('[data-voice-record-sample]').hidden=true;status.textContent='';updateRecording();};
            body.querySelector('[data-voice-design-run]').onclick=generateClone;
        }
        async function recordingFile(sample){
            const context=new (window.AudioContext||window.webkitAudioContext)();
            try{const audio=await context.decodeAudioData(await sample.blob.arrayBuffer()),frames=audio.length,channels=audio.numberOfChannels,buffer=new ArrayBuffer(44+frames*2),view=new DataView(buffer);
                if(audio.duration<10||audio.duration>61)throw Error('录音时长需在10秒～60秒之间，请重新录制');
                const text=(offset,value)=>[...value].forEach((char,index)=>view.setUint8(offset+index,char.charCodeAt(0)));
                text(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,audio.sampleRate,true);view.setUint32(28,audio.sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,frames*2,true);
                const data=Array.from({length:channels},(_,index)=>audio.getChannelData(index));for(let index=0;index<frames;index++){const value=Math.max(-1,Math.min(1,data.reduce((sum,channel)=>sum+channel[index],0)/channels));view.setInt16(44+index*2,value<0?value*32768:value*32767,true);}
                return new File([buffer],'voice-recording.wav',{type:'audio/wav'});
            }finally{await context.close();}
        }
        async function generateClone(){
            if(!alive()||state.running||!canGenerate||body.querySelector('[data-voice-design-run]').disabled)return;
            const sample=state.recorder.getSnapshot().result;state.running=true;updateRecording();status.textContent='录音上传中…';
            const guard={valid:()=>alive()&&state.recorder?.getSnapshot().result===sample&&body.querySelector('[data-voice-terms]')?.checked,check(){if(!this.valid())throw Error('录音输入或编辑资格已变化，请重新打开查询原任务');}};
            try{if(!state.uploaded){const file=await recordingFile(sample);guard.check();const form=new FormData();form.append('files',file);const uploaded=await CanvasApi.uploadAi(form,{nodeId:node.id,signal:state.abort.signal,onProgress:({loaded,total})=>{if(alive())status.textContent='录音上传中 '+Math.round(loaded/total*100)+'%';}});guard.check();state.uploaded=uploaded.files?.[0]?.url;if(!state.uploaded)throw Error('录音上传失败，请重试');}
                const binding=smartTaskInputBinding(node,node,guard);status.textContent='正在生成音色…';const record=await CanvasAudioTasks.run({provider_id:provider,model:'voice-clone',mode:'clone',voice_catalog_id:catalog,sample_audio:state.uploaded,clone_preview_model:model,clone_terms_accepted:true,preview_text:recordingText},{binding,canvasId:origin.id,onRemember:async receipt=>{state.jobId=receipt.task_id;}});if(alive())await registration(record);
            }catch(error){if(alive()){root.focus({preventScroll:true});status.textContent=error.message||'音色生成未确认，请查询原任务';state.running=false;updateRecording();if(error.resultPending&&error.taskId){state.jobId=error.taskId;const button=body.querySelector('[data-voice-design-run]');button.disabled=false;button.textContent='查询已有音色任务';button.onclick=()=>inspect(error.taskId);}}}
        }
        function designer(prompt='',preview=''){
            stop(root);state.draft={prompt,preview};
            if(mode==='clone'){recording();return;}
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
            const response=await CanvasApi.getCanvasAudioVoiceDesignTasks(provider,model,origin.id,node.id,{signal:state.abort.signal},mode);if(!alive())return;if(!response.ok)throw Error(await responseErrorMessage(response,'音色任务核对失败'));
            const latest=(await response.json()).tasks?.find(task=>!task.registered&&['queued','running','submitting','polling','finalizing','needs_review','succeeded'].includes(task.status));if(!alive())return;
            if(latest){designer(latest.prompt,latest.preview_text);await inspect(latest.task_id);}else{state.checked=true;if(mode==='clone')updateRecording();else body.querySelector('[data-voice-design-run]').disabled=!canGenerate;status.textContent=canGenerate?'':mode==='clone'?'请为当前供应商配置 voice-clone 音色克隆模型':'请为当前供应商配置 voice-design 音色设计模型';}
        }catch(error){if(alive())status.textContent=(error.message||'音色任务核对失败')+'；请关闭后重试';}})();
    }
    window.PixmaxVoiceDesign=Object.freeze({open,close,get opened(){return Boolean(active);}});
})();
