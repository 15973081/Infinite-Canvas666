/* MediaKit tools use the canvas's durable admission and server result delivery. */
(() => {
    'use strict';
    const tools={upscale:{model:'enhance-video',label:'视频超分'},erase:{model:'erase-video-subtitle',label:'字幕擦除'},understand:{model:'video-understand-router',label:'视频理解'}};
    const progress=new Map(),watching=new Set(),preparing=new Set();
    const taskKey=id=>canvas.id+':'+id;
    function body(node){
        const id=node.mediakitTaskId;
        if(!id||node.text?.trim()||!node.pendingTasks?.some(task=>task.taskId===id&&task.kind==='mediakit'))return '';
        const key=taskKey(id);
        if(!preparing.has(key))watch(node);
        const state=progress.get(key)||{label:'正在提交视频理解…',busy:true};
        return `<div class="local-depth-node" role="status"><strong>${escapeHtml(state.label)}</strong><span class="local-depth-node-sub">视频理解 · 完成后文本显示在此节点</span>${state.busy?'<progress aria-label="视频理解处理中"></progress>':''}</div>`;
    }
    function watch(node){
        const id=node.mediakitTaskId,key=taskKey(id),origin=canvas;
        if(watching.has(key))return;
        watching.add(key);
        const current=()=>canvas===origin&&nodes.includes(node)&&node.pendingTasks?.some(task=>task.taskId===id);
        const paint=()=>{if(canvas===origin&&nodes.includes(node))refreshSmartNodes([node.id],{forceIds:[node.id]});};
        const poll=async()=>{
            if(!current()){watching.delete(key);return;}
            let repeat=true;
            try{
                const response=await fetch(CanvasSession.url('/api/canvas-mediakit-tasks/'+encodeURIComponent(id)),{cache:'no-store',signal:AbortSignal.timeout(15000)});
                if(!current())return;
                if(!response.ok){if(response.status===404){repeat=false;throw Error('提交未完成，请打开视频理解重新提交');}throw Error('查询暂时中断，正在重试…');}
                const record=await response.json();if(record.id!==id)throw Error('任务编号不一致');
                const labels={queued:'排队中…',running:'正在上传视频…',submitting:'正在提交云端…',polling:'云端分析中…',finalizing:'正在保存文本…',succeeded:'正在同步结果…'};
                const failed=['failed','needs_review','cancelled'].includes(record.status);
                progress.set(key,{label:failed?(record.error||'处理未完成，请打开视频理解查看'):labels[record.status]||'正在查询…',busy:!failed});
                if(failed)repeat=false;
                if(record.status==='succeeded'){
                    const response=await CanvasApi.getCanvasTaskDeliveriesRequest(origin.id,origin.task_result_version||0);
                    if(response.ok&&canvas===origin)smartTaskRecovery().mergeDeliveries(await response.json());
                }
            }catch(error){if(canvas===origin)progress.set(key,{label:error.message||'查询暂时中断，正在重试…',busy:repeat});}
            finally{
                paint();
                if(repeat&&current())setTimeout(poll,3000);
                else {watching.delete(key);}
            }
        };
        setTimeout(poll,0);
    }
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
        const resultButton=document.createElement('button');resultButton.type='button';resultButton.className='pixmax-creation-primary';
        resultButton.textContent='查看结果';resultButton.hidden=true;body.appendChild(resultButton);
        const findResult=id=>nodes.find(node=>node.result_task_id===id||node.images?.some(media=>media.run?.canvasTaskId===id)||node.mediakitTaskId===id&&(node.text?.trim()||node.images?.length));
        function showResult(id){
            if(!id||!findResult(id))return;
            resultButton.hidden=false;
            resultButton.onclick=()=>{if(canvas!==origin)return;const result=findResult(id);if(result){root.remove();focusPixmaxNode(result);}else status.textContent='结果节点已移除，请从生成结果记录查看。';};
        }
        if(previous?.url===url)showResult(previous.taskId);
        const run=body.querySelector('[data-mediakit-run]');let taskId=previous?.url===url&&previous.status!=='succeeded'?previous.taskId:null,busy=false;
        let needsSubmission=!taskId||previous?.status==='retry';
        function syncControls(){
            body.querySelectorAll('select,textarea').forEach(control=>control.disabled=!needsSubmission);
            run.disabled=busy||(needsSubmission&&!providers(action).length);
            run.textContent=needsSubmission?(taskId?'重新提交':'开始'+tool.label):'查询原任务';
        }
        function allowRetry(){
            needsSubmission=true;
            if(valid()&&source.mediakitJobs?.[action]?.taskId===taskId){source.mediakitJobs[action].status='retry';scheduleSave();}
        }
        syncControls();
        run.onclick=async()=>{
            if(busy||!valid())return;
            busy=true;run.disabled=true;
            try{
                if(needsSubmission){
                    const providerId=body.querySelector('[data-mediakit-provider]').value;
                    if(!providers(action).some(provider=>provider.id===providerId))throw new Error('厂商配置已变化，请重新打开工具');
                    const prompt=body.querySelector('[data-mediakit-prompt]')?.value.trim()||'';
                    if(action==='understand'&&!prompt)throw new Error('请填写视频理解要求');
                    // Keep the original idempotency key even if a delayed first
                    // request arrives after a 404. The server admits at most one.
                    taskId=taskId||'canvas_mediakit_'+crypto.randomUUID().replace(/-/g,'');
                    pushUndo();source.mediakitJobs={...source.mediakitJobs,[action]:{taskId,url,status:'pending'}};
                    let target=source;
                    if(action==='understand'){
                        preparing.add(taskKey(taskId));
                        progress.set(taskKey(taskId),{label:'正在提交视频理解…',busy:true});
                        target=nodes.find(node=>node.mediakitTaskId===taskId&&node.type==='smart-prompt'&&!node.text?.trim());
                        if(!target){const rect=nodeRect(source);target=createPromptNode(rect.x+rect.width+60,rect.y,{select:false,skipUndo:true});}
                        target.label='视频理解结果';target.w=400;target.h=280;target.mediakitTaskId=taskId;
                        target.pendingTasks=[{taskId,kind:'mediakit'}];
                        if(!canvas.connections.some(edge=>edge.from===source.id&&edge.to===target.id))canvas.connections.push({from:source.id,to:target.id,kind:'input'});
                        render();scheduleSave();
                    }else{
                        target=nodes.find(node=>node.mediakitTaskId===taskId&&!node.images?.length);
                        if(!target){
                            target=createNode((source.x||0)+(source.w||320)+80,source.y||0,[],{select:false,deferRender:true,mediaKind:'video'});
                            target.label=tool.label;target.outputKind='video';target.mediakitTaskId=taskId;
                            canvas.connections.push({from:source.id,to:target.id,kind:'input'});
                        }
                        render();scheduleSave();
                    }
                    scheduleSave();const binding=smartTaskInputBinding(source,target,{valid,check(){if(!valid())throw window.CanvasTaskResults.pending();}});
                    const canvasTarget=await binding.prepare();binding.beginSubmission();
                    const payload={mediakit:true,canvas_id:origin.id,client_task_id:taskId,canvas_target:canvasTarget,provider_id:providerId,model:tool.model,videos:[url],prompt};
                    if(action==='upscale'){payload.resolution=body.querySelector('[data-mediakit-resolution]').value;payload.tool_version=body.querySelector('[data-mediakit-version]').value;}
                    if(action==='understand')payload.level=body.querySelector('[data-mediakit-level]').value;
                    status.textContent='正在提交…';
                    needsSubmission=false;
                    const response=await MemberCanvasEdit.send('/api/canvas-mediakit-tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
                    if(!response.ok){const message=await errorText(response);if([400,401,403,404,422,423,428].includes(response.status))allowRetry();throw new Error(message);}
                    const receipt=await response.json();
                    if(receipt.task_id!==taskId)throw new Error('返回的任务编号不一致，请核对生成结果');
                    binding.remember(receipt);
                    if(action==='understand'){preparing.delete(taskKey(taskId));watch(target);}
                    body.querySelectorAll('select,textarea').forEach(control=>control.disabled=true);
                }
                // An ambiguous POST is queried first. Missing tasks can be retried
                // explicitly with the same ID, never with a second payment key.
                for(let attempt=0;attempt<1200&&root.isConnected&&canvas===origin;attempt++){
                    const response=await fetch(CanvasSession.url('/api/canvas-mediakit-tasks/'+encodeURIComponent(taskId)),{cache:'no-store',signal:AbortSignal.timeout(30000)});
                    if(response.status===404){
                        allowRetry();
                        status.textContent='上次提交未完成，未找到后台任务。可点击“重新提交”继续，将复用原任务编号。';
                        return;
                    }
                    if(!response.ok)throw new Error(await errorText(response));
                    const record=await response.json();
                    if(record.id!==taskId)throw new Error('任务编号不一致');
                    if(record.status==='succeeded'){
                        if(valid()&&source.mediakitJobs?.[action]?.taskId===taskId){source.mediakitJobs[action].status='succeeded';scheduleSave();}
                        if(canvas===origin){const delivered=await CanvasApi.getCanvasTaskDeliveriesRequest(origin.id,origin.task_result_version||0);if(delivered.ok&&canvas===origin)smartTaskRecovery().mergeDeliveries(await delivered.json());}
                        showResult(taskId);
                        status.textContent=tool.label+'完成，结果已保存到画布。';run.textContent='已完成';return;
                    }
                    if(['failed','needs_review','cancelled'].includes(record.status))throw new Error(record.error||'任务未完成，请在生成结果中核对原任务');
                    status.textContent=(record.status==='polling'?'云端处理中':'任务已排队')+'，关闭窗口后仍会继续。';
                    await new Promise(resolve=>setTimeout(resolve,2000));
                }
                if(root.isConnected)status.textContent='任务仍在后台处理，可稍后查询。';
            }catch(error){if(needsSubmission)allowRetry();status.textContent=(error.message||'请求未完成')+(taskId?' · 任务：'+taskId:'');}
            finally{busy=false;if(taskId){preparing.delete(origin.id+':'+taskId);const target=nodes.find(node=>node.mediakitTaskId===taskId&&node.type==='smart-prompt');if(target&&canvas===origin)watch(target);}if(run.textContent!=='已完成')syncControls();}
        };
    }
    window.PixmaxMediaKit=Object.freeze({open,available,providers,body});
})();
