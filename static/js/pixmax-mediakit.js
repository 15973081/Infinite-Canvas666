/* MediaKit tools use the canvas's durable admission and server result delivery. */
(() => {
    'use strict';
    const tools={upscale:{model:'enhance-video',label:'视频超分'},erase:{model:'erase-video-subtitle',label:'字幕擦除'},understand:{model:'video-understand-router',label:'视频理解'}};
    function providers(action){
        const model=tools[action]?.model;
        return (apiProviders||[]).filter(provider=>provider.enabled!==false&&provider.has_key&&
            (provider.mediakit_tools||[]).includes(model));
    }
    function available(action){return !!window.CanvasSession?.enabled&&providers(action).length>0;}
    async function errorText(response){
        try{const value=await response.json();if(typeof value.detail==='string')return value.detail;if(value.detail?.message)return value.detail.message;}catch{}
        return '请求未确认，请查看生成结果中的原任务';
    }
    function open(nodeId,index,action){
        const source=nodes.find(node=>node.id===nodeId),item=source?.images?.[index],tool=tools[action];
        if(!tool||isSmartCanvasLocked()||!window.CanvasSession?.enabled||mediaKindForItem(item)!=='video')return;
        const root=pixmaxCreationModal(tool.label),body=root.querySelector('.pixmax-creation-content'),status=root.querySelector('[role=status]');
        const origin=canvas,guard=canvasTaskWriteGuard(source),url=item.url;
        const valid=()=>canvas===origin&&guard.valid()&&source.images?.[index]?.url===url;
        const options=providers(action);
        body.innerHTML=`<p>使用火山 MediaKit 处理所选视频，完成后结果自动加入画布。</p><label>厂商<select aria-label="MediaKit 厂商" data-mediakit-provider>${options.map(provider=>`<option value="${escapeAttr(provider.id)}">${escapeHtml(provider.name||provider.id)}</option>`).join('')}</select></label>`;
        if(action==='upscale')body.insertAdjacentHTML('beforeend','<label>目标分辨率<select aria-label="超分分辨率" data-mediakit-resolution><option value="1080p">1080P</option><option value="2k">2K</option><option value="4k">4K</option><option value="8k">8K</option></select></label><label>增强版本<select aria-label="增强版本" data-mediakit-version><option value="standard">标准版</option><option value="professional">专业版</option></select></label><p class="pixmax-creation-hint">输入最高支持 2K，增强版本和输出规格会影响处理费用。</p>');
        if(action==='erase')body.insertAdjacentHTML('beforeend','<p class="pixmax-creation-hint">自动检测并擦除画面中的硬字幕。输入最高支持 2K，输出最高 1080P。</p>');
        if(action==='understand')body.insertAdjacentHTML('beforeend','<label>理解要求<textarea aria-label="视频理解要求" data-mediakit-prompt maxlength="10000">请按时间顺序描述视频中的人物、场景、动作和关键事件。</textarea></label><label>分析档位<select aria-label="分析档位" data-mediakit-level><option value="Economy">经济</option><option value="Balanced">均衡</option><option value="Quality">高质量</option></select></label>');
        body.insertAdjacentHTML('beforeend',`<button type="button" class="pixmax-creation-primary" data-mediakit-run ${options.length?'':'disabled'}>开始${tool.label}</button>`);
        if(!options.length)status.textContent='请在管理平台添加“火山 MediaKit”，配置 API Key 并分配到当前空间。';
        const previous=source.mediakitJobs?.[action];
        const run=body.querySelector('[data-mediakit-run]');let taskId=previous?.url===url&&previous.status!=='succeeded'?previous.taskId:null,busy=false,accepted=false,submitted=!!taskId;
        if(taskId){run.disabled=false;run.textContent='查询原任务';body.querySelectorAll('select,textarea').forEach(control=>control.disabled=true);}
        run.onclick=async()=>{
            if(busy||!valid())return;
            busy=true;run.disabled=true;
            try{
                if(!taskId){
                    const providerId=body.querySelector('[data-mediakit-provider]').value;
                    if(!providers(action).some(provider=>provider.id===providerId))throw new Error('厂商配置已变化，请重新打开工具');
                    const prompt=body.querySelector('[data-mediakit-prompt]')?.value.trim()||'';
                    if(action==='understand'&&!prompt)throw new Error('请填写视频理解要求');
                    taskId='canvas_mediakit_'+crypto.randomUUID().replace(/-/g,'');
                    pushUndo();source.mediakitJobs={...source.mediakitJobs,[action]:{taskId,url,status:'pending'}};
                    let target=source;
                    if(action!=='understand'){
                        target=createNode((source.x||0)+(source.w||320)+80,source.y||0,[],{select:false,deferRender:true});
                        target.label=tool.label;target.outputKind='video';target.mediakitTaskId=taskId;
                        canvas.connections.push({from:source.id,to:target.id,kind:'input'});render();scheduleSave();
                    }
                    scheduleSave();const binding=smartTaskInputBinding(source,target,{valid,check(){if(!valid())throw window.CanvasTaskResults.pending();}});
                    const canvasTarget=await binding.prepare();binding.beginSubmission();
                    const payload={mediakit:true,canvas_id:origin.id,client_task_id:taskId,canvas_target:canvasTarget,provider_id:providerId,model:tool.model,videos:[url],prompt};
                    if(action==='upscale'){payload.resolution=body.querySelector('[data-mediakit-resolution]').value;payload.tool_version=body.querySelector('[data-mediakit-version]').value;}
                    if(action==='understand')payload.level=body.querySelector('[data-mediakit-level]').value;
                    status.textContent='正在提交…';
                    submitted=true;
                    const response=await MemberCanvasEdit.send('/api/canvas-mediakit-tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
                    if(!response.ok){const message=await errorText(response);if([400,401,403,404,422,423,428].includes(response.status))taskId=null;throw new Error(message);}
                    const receipt=await response.json();
                    if(receipt.task_id!==taskId)throw new Error('返回的任务编号不一致，请核对生成结果');
                    binding.remember(receipt);accepted=true;
                    body.querySelectorAll('select,textarea').forEach(control=>control.disabled=true);
                }
                // After an ambiguous POST, only GET the same ID; never resubmit it.
                for(let attempt=0;attempt<1200&&root.isConnected&&canvas===origin;attempt++){
                    const response=await fetch(CanvasSession.url('/api/canvas-mediakit-tasks/'+encodeURIComponent(taskId)),{cache:'no-store',signal:AbortSignal.timeout(30000)});
                    if(!response.ok)throw new Error(await errorText(response));
                    const record=await response.json();
                    if(record.id!==taskId)throw new Error('任务编号不一致');
                    if(record.status==='succeeded'){
                        if(valid()&&source.mediakitJobs?.[action]?.taskId===taskId){source.mediakitJobs[action].status='succeeded';scheduleSave();}
                        if(canvas===origin){const delivered=await CanvasApi.getCanvasTaskDeliveriesRequest(origin.id,origin.task_result_version||0);if(delivered.ok&&canvas===origin)smartTaskRecovery().mergeDeliveries(await delivered.json());}
                        status.textContent=tool.label+'完成，结果已保存到画布。';run.textContent='已完成';return;
                    }
                    if(['failed','needs_review','cancelled'].includes(record.status))throw new Error(record.error||'任务未完成，请在生成结果中核对原任务');
                    status.textContent=(record.status==='polling'?'云端处理中':'任务已排队')+'，关闭窗口后仍会继续。';
                    await new Promise(resolve=>setTimeout(resolve,2000));
                }
                if(root.isConnected)status.textContent='任务仍在后台处理，可稍后查询。';
            }catch(error){if(!submitted)taskId=null;if(!taskId&&valid()){delete source.mediakitJobs?.[action];scheduleSave();}status.textContent=(error.message||'请求未完成')+(taskId?' · 任务：'+taskId:'');}
            finally{busy=false;if(run.textContent!=='已完成'){run.disabled=false;run.textContent=taskId?'查询原任务':'开始'+tool.label;}if(!taskId&&!accepted)body.querySelectorAll('select,textarea').forEach(control=>control.disabled=false);}
        };
    }
    window.PixmaxMediaKit=Object.freeze({open,available,providers});
})();
