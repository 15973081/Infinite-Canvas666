/* Native group batch planning; admission stays in the existing durable APIs. */
(() => {
    'use strict';
    const active=new Map(),reservations=new WeakSet(),labels={image:'图像生成',video:'视频生成',llm:'文本生成',audio:'音频生成',model:'3D 生成'};
    let admissions=0;
    function kind(node){
        if(!node||node.pixmaxSourceType?.startsWith('BASE_')||isHistoryGroupNode(node))return null;
        if(node.type==='smart-prompt')return 'llm';if(node.type==='smart-audio')return 'audio';if(node.type==='smart-model')return 'model';
        return node.type==='smart-image'&&['image','video'].includes(node.generationKind)?node.generationKind:null;
    }
    function busy(node){return Boolean(node.running||node.pending||smartPendingTasks(node).length||active.has(node)||pixmaxTextJobs.has(node)||window.PixmaxAudioCreation?.busy(node)||window.PixmaxModelCreation?.busy(node));}
    function plan(ids){
        const selected=new Set(ids),byId=new Map(nodes.map(node=>[node.id,node])),adj=new Map(),reverse=new Map();
        for(const id of selected)if(byId.has(id)){adj.set(id,[]);reverse.set(id,[]);}
        for(const edge of canvas.connections||[])if(adj.has(edge.from)&&adj.has(edge.to)&&edge.kind!=='history'){adj.get(edge.from).push(edge.to);reverse.get(edge.to).push(edge.from);}
        const seen=new Set(),order=[];
        for(const id of adj.keys()){
            if(seen.has(id))continue;const stack=[[id,false]];
            while(stack.length){const [current,done]=stack.pop();if(done){order.push(current);continue;}if(seen.has(current))continue;seen.add(current);stack.push([current,true]);for(const next of adj.get(current))if(!seen.has(next))stack.push([next,false]);}
        }
        const cyclic=new Set(),visited=new Set();
        for(const id of order.reverse()){
            if(visited.has(id))continue;const component=[],stack=[id];visited.add(id);
            while(stack.length){const current=stack.pop();component.push(current);for(const next of reverse.get(current))if(!visited.has(next)){visited.add(next);stack.push(next);}}
            if(component.length>1||adj.get(id).includes(id))component.forEach(value=>cyclic.add(value));
        }
        const generators=nodes.filter(node=>selected.has(node.id)&&kind(node)),genIds=new Set(generators.map(node=>node.id)),excluded=new Set();
        for(const node of generators){if(cyclic.has(node.id))continue;const seen=new Set([node.id]),stack=[...adj.get(node.id)||[]];while(stack.length){const id=stack.pop();if(seen.has(id))continue;seen.add(id);if(genIds.has(id)&&!cyclic.has(id))excluded.add(id);stack.push(...adj.get(id)||[]);}}
        const candidates=[],skipped=[];
        for(const node of generators){const reason=cyclic.has(node.id)?'cyclic-selection':excluded.has(node.id)?'downstream-in-selection':busy(node)?'busy':null;if(reason)skipped.push({nodeId:node.id,reason});else candidates.push({nodeId:node.id,kind:kind(node)});}
        return {candidates,skipped,excludedDownstreamIds:[...excluded]};
    }
    async function prepare(node,type){
        if(node.segmentReshoot?.schemaVersion===1||node.nativePrompt?.schemaVersion===1){const guard=canvasTaskWriteGuard(node);await PixmaxSubjects.refresh(node,guard.valid,{checkOnly:true});guard.check();}
        if(type==='audio')return window.PixmaxAudioCreation.prepare(node);
        if(type==='model')return window.PixmaxModelCreation.prepare(node);
        if(type==='llm'){
            const config=node.textGeneration,context=pixmaxTextContext(node);
            if(!config||!pixmaxChatProviders().some(provider=>provider.id===config.providerId&&provider.chat_models.includes(config.model)))throw new Error('请先配置文本供应商和模型');
            if(!config.input?.trim())throw new Error('请填写文本创作要求');
            return {provider_id:config.providerId,model:config.model,message:[config.input,context.text?'引用文本：\n'+context.text:''].filter(Boolean).join('\n\n'),system_prompt:config.systemPrompt||'',images:context.images,videos:context.videos};
        }
        const old=settings;let request,config;
        try{settings={...settings,...cloneSmartSettings(smartSettingsForNode(node))};config=cloneSmartSettings(settings);request=buildPromptRequestForNode(node,null);}finally{settings=old;}
        config=window.PixmaxSegmentReshoot?.executionSettings(node,config)||config;
        if(node.segmentReshoot?.schemaVersion===1){const reshoot=PixmaxReshootReferences.request(node,config);request=reshoot;config=reshoot.settings;}
        if(!isApiLikeEngine(config.engine))throw new Error('请配置通用 API 模型');
        if(!request.prompt.trim()&&smartRunNeedsPrompt(config))throw new Error('请填写提示词或连接文本节点');
        return type==='video'?runApiVideoGeneration(request.prompt,request.refs,config,null,{preview:true}):runApiGeneration(request.prompt,request.refs,config,null,null,{preview:true});
    }
    function members(frame){return nodes.filter(node=>node.frameId===frame.id).map(node=>node.id);}
    function stamp(frame){const ids=members(frame),selected=new Set(ids);return JSON.stringify([ids,(canvas.connections||[]).filter(edge=>selected.has(edge.from)&&selected.has(edge.to))]);}
    async function preview(frame){
        if(isSmartCanvasLocked()||!window.CanvasSession?.enabled)throw new Error('请先开始编辑成员画布');
        const initialGuard=canvasTaskWriteGuard(frame);
        for(const node of nodes.filter(node=>node.frameId===frame.id&&(node.segmentReshoot?.schemaVersion===1||node.nativePrompt?.schemaVersion===1))){
            const guard=canvasTaskWriteGuard(node,frame);await PixmaxSubjects.refresh(node,()=>initialGuard.valid()&&guard.valid());guard.check();
        }
        initialGuard.check();
        savePromptDraftForCurrent();if(!await saveCanvas({force:true}))throw new Error('画布尚未保存，请稍后重试');
        const guard=canvasTaskWriteGuard(frame),origin=canvas,selection=stamp(frame),result=plan(members(frame)),entries=[];
        for(const item of result.candidates){
            const node=nodes.find(node=>node.id===item.nodeId);
            try{const binding=smartTaskInputBinding(node,node,canvasTaskWriteGuard(node)),request=await prepare(node,item.kind);binding.check();const input_sha256=await CanvasTaskBindings.graphFingerprint(smartTaskInputDocument(),node.id,node.id);binding.check();entries.push({...item,node,request,binding,input_sha256});}
            catch(error){result.skipped.push({nodeId:item.nodeId,reason:'invalid',message:error.message});}
        }
        if(!guard.valid()||canvas!==origin||stamp(frame)!==selection)throw new Error('分组或编辑资格已变化，请重新预览');
        if(!entries.length)return {...result,entries,costs:{},unknownCount:0,frame,guard,origin,selection};
        const response=await MemberCanvasEdit.send('/api/canvases/'+encodeURIComponent(canvas.id)+'/batch-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({frame_id:frame.id,base_revision:canvas.revision,items:entries.map(item=>({node_id:item.nodeId,kind:item.kind,input_sha256:item.input_sha256,request:item.request}))})});
        if(!response.ok)throw new Error(await responseErrorMessage(response,'批量执行预览失败'));
        const data=await response.json();if(!guard.valid()||canvas!==origin||stamp(frame)!==selection)throw new Error('分组或编辑资格已变化，请重新预览');
        const allowed=new Set(data.prepared.map(item=>item.nodeId));return {...result,...data,skipped:[...result.skipped,...data.skipped],entries:entries.filter(item=>allowed.has(item.nodeId)),frame,guard,origin,selection};
    }
    function pending(node,entry,id,binding){
        const task=attachSmartTaskBinding({taskId:id,kind:entry.kind,providerId:entry.request.provider_id,model:entry.request.model,startedAt:nowMs(),batchFrameId:entry.frameId,
            run:{nodeId:node.id,nodeType:node.type,kind:entry.kind,prompt:entry.request.prompt||entry.request.message,settings:entry.request,refs:[]}},binding);
        node.pendingTasks=[...smartPendingTasks(node),task];node.pending=node.pendingTasks.length;return task;
    }
    async function observe(entry,id,binding,guard){
        const node=entry.node;
        try{
            if(entry.kind==='llm'){
                for(let attempt=0;attempt<1200;attempt++){
                    guard.check();binding.check();const response=await CanvasApi.getCanvasLLMTaskRequest(id);if(!response.ok)throw Error('文本任务查询中断');const record=await response.json();binding.verify(record,id);
                    if(record.status==='succeeded'){await commitSmartStudioTaskResult(node,record,'llm',binding,{valid:guard.valid,applyResult:()=>{node.text=record.result.text;node.creationResults=[...(node.creationResults||[]),{taskId:id,text:record.result.text}].slice(-50);}});return;}
                    if(['failed','cancelled','needs_review'].includes(record.status))throw Error('文本任务未完成，请核对原任务');await new Promise(resolve=>setTimeout(resolve,1000));
                }
                throw Error('文本任务仍在后台处理');
            }
            const record=await pollSmartCanvasTask(id,entry.kind,{inputBinding:binding,returnRecord:true});guard.check();binding.check();
            await commitSmartStudioTaskResult(node,record,entry.kind,binding,{valid:guard.valid});
        }catch(error){if(guard.valid()){const task=smartPendingTasks(node).find(task=>task.taskId===id);if(task){task.paused=true;node.pending=0;refreshSmartNodes([node.id]);scheduleSave();}if(error.inputChanged)pauseSmartTaskInput(node,binding,guard,error);}}
        finally{if(active.get(node)===id)active.delete(node);}
    }
    async function submit(snapshot){
        if(!snapshot.guard.valid()||canvas!==snapshot.origin||stamp(snapshot.frame)!==snapshot.selection)throw Error('分组或编辑资格已变化，请重新预览');
        if(snapshot.entries.some(entry=>reservations.has(entry.node)||active.has(entry.node)))throw Error('节点已在提交，请等待当前批次');
        snapshot.entries.forEach(entry=>reservations.add(entry.node));
        admissions++;
        try{
        for(const entry of snapshot.entries){entry.binding.check();if(busy(entry.node))throw Error('节点已在运行，请重新预览');if(JSON.stringify(await prepare(entry.node,entry.kind))!==JSON.stringify(entry.request))throw Error('生成参数已变化，请重新预览');}
        const accepted=[],failed=[];
        for(const entry of snapshot.entries){
            const node=entry.node,guard=canvasTaskWriteGuard(node,snapshot.frame);let id,dispatched=false,binding;
            try{
                if(!snapshot.guard.valid()||canvas!==snapshot.origin||stamp(snapshot.frame)!==snapshot.selection)throw Error('分组或编辑资格已变化');
                if(busy(node))throw Error('节点已在运行');
                if(node.segmentReshoot?.schemaVersion===1||node.nativePrompt?.schemaVersion===1){await PixmaxSubjects.refresh(node,guard.valid,{checkOnly:true});guard.check();}
                entry.binding.check();binding=smartTaskInputBinding(node,node,guard);const target=await binding.prepare();binding.beginSubmission();
                id='canvas_'+({image:'img',video:'vid'}[entry.kind]||entry.kind)+'_'+crypto.randomUUID().replace(/-/g,'');active.set(node,id);
                const request={...entry.request,canvas_id:canvas.id,client_task_id:id,canvas_target:target};dispatched=true;
                const response=await MemberCanvasEdit.send('/api/canvas-'+entry.kind+'-tasks',{method:'POST',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
                if(!response.ok){const error=Error(await responseErrorMessage(response,'任务未确认'));error.rejected=[400,401,403,404,410,422,423,428].includes(response.status);throw error;}
                const receipt=await response.json();guard.check();binding.remember(receipt);
                binding.mutate(()=>pending(node,{...entry,frameId:snapshot.frame.id},id,binding));refreshSmartNodes([node.id]);scheduleSave();await saveCanvas({force:true});accepted.push(id);
                // Persist each receipt before admitting the next node. Results
                // are observed only after every admission to protect sibling hashes.
                entry.submitted={id,binding,guard};
            }catch(error){
                if(id&&dispatched&&!error.rejected&&guard.valid()&&!smartPendingTasks(node).some(task=>task.taskId===id)){const task=pending(node,{...entry,frameId:snapshot.frame.id},id,binding);task.paused=true;node.pending=0;refreshSmartNodes([node.id]);scheduleSave();await saveCanvas({force:true});}
                if(active.get(node)===id)active.delete(node);failed.push({nodeId:entry.nodeId,message:error.message});
            }
        }
        for(const entry of snapshot.entries)if(entry.submitted)void observe(entry,entry.submitted.id,entry.submitted.binding,entry.submitted.guard);
        return {accepted,failed};
        }finally{admissions--;snapshot.entries.forEach(entry=>reservations.delete(entry.node));}
    }
    async function open(frame){
        if(isSmartCanvasLocked()||!nodes.includes(frame))return;const root=pixmaxCreationModal('批量执行'),body=root.querySelector('.pixmax-creation-content'),status=root.querySelector('[role=status]');status.textContent='正在预览…';let submitting=false;
        try{
            const snapshot=await preview(frame);if(!root.isConnected)return;
            if(!snapshot.entries.length){status.textContent='没有可执行的生成任务';return;}
            const counts=new Map();snapshot.entries.forEach(entry=>counts.set(entry.kind,(counts.get(entry.kind)||0)+1));
            const money=value=>{const amount=BigInt(value),fraction=(amount%1000000n).toString().padStart(6,'0').replace(/0+$/,'');return (amount/1000000n).toLocaleString('zh-CN')+(fraction?'.'+fraction:'');};
            body.innerHTML=`<p>将执行 ${snapshot.entries.length} 个生成节点</p><div class="pixmax-batch-counts">${[...counts].map(([type,count])=>`<span>${labels[type]} × ${count}</span>`).join('')}</div>${Object.entries(snapshot.costs).map(([currency,cost])=>`<p>预计费用：${escapeHtml(currency)} ${money(cost.amount_micros)} ${cost.base_amount_micros>cost.amount_micros?`<del>${money(cost.base_amount_micros)}</del>`:''}</p>`).join('')}${snapshot.unknownCount?`<p>${snapshot.unknownCount} 个节点的费用待核算</p>`:''}${snapshot.excludedDownstreamIds.length?`<p>已排除 ${snapshot.excludedDownstreamIds.length} 个组内下游生成节点，避免重复提交</p>`:''}${snapshot.skipped.filter(item=>item.reason!=='downstream-in-selection').length?`<p>跳过 ${snapshot.skipped.filter(item=>item.reason!=='downstream-in-selection').length} 个忙碌、循环或参数无效的节点</p>`:''}<div class="pixmax-batch-actions"><button type="button" data-batch-cancel>取消</button><button type="button" class="pixmax-creation-primary" data-batch-confirm>确认执行</button></div>`;
            status.textContent='';body.querySelector('[data-batch-cancel]').onclick=()=>root.remove();
            body.querySelector('[data-batch-confirm]').onclick=async event=>{
                if(submitting)return;submitting=true;event.target.disabled=true;status.textContent='正在提交…';
                try{const result=await submit(snapshot);status.textContent=`已提交 ${result.accepted.length} 个任务${result.failed.length?`；${result.failed.length} 个节点未确认，请核对原任务`:''}`;event.target.textContent='已提交';body.querySelector('[data-batch-cancel]').textContent='关闭';}
                catch(error){status.textContent=error.message;submitting=false;event.target.disabled=false;}
            };
        }catch(error){if(root.isConnected)status.textContent=error.message||'批量执行预览失败';}
    }
    async function recover(item,record,current){
        if(active.has(item.node)||!current())return;const guard=canvasTaskWriteGuard(item.node),valid=()=>current()&&guard.valid();
        const binding=await CanvasTaskBindings.recover({task:record,taskId:item.id,canvasId:canvas.id,kind:'smart',sourceId:item.node.id,targetId:item.node.id,read:smartTaskInputDocument,valid});
        return commitSmartStudioTaskResult(item.node,record,'llm',binding,{recovered:true,valid,applyResult:()=>{item.node.text=record.result.text;item.node.creationResults=[...(item.node.creationResults||[]),{taskId:item.id,text:record.result.text}].slice(-50);}});
    }
    window.PixmaxBatchExecution=Object.freeze({kind,plan,preview,submit,open,recover,busy:id=>id===undefined?admissions>0||active.size>0:active.has(nodes.find(node=>node.id===id))||reservations.has(nodes.find(node=>node.id===id)),ownsTask:id=>[...active.values()].includes(id)});
})();
