/* Pixmax-style draft badges and an adjacent, connected final video. */
(() => {
    'use strict';
    const active=new Set();
    const resultFor=draft=>nodes.find(node=>node.images?.some(item=>item.draft_source_task_id===draft.source_task_id));
    const targetFor=draft=>resultFor(draft)||nodes.find(node=>node.seedanceUpgrade?.sourceTaskId===draft.source_task_id);
    function action(node){
        const draft=node.images?.[smartNodeToolbarImageIndex(node)]?.seedance_draft;
        if(!draft)return [];
        const target=targetFor(draft),complete=!!resultFor(draft),pending=!!target?.seedanceUpgrade?.taskId;
        return [{key:'seedance-final',label:complete?'查看成片':pending?'查看成片任务':'生成成片',icon:'clapperboard',
            enabled:!isSmartCanvasLocked()&&(complete||pending||SeedanceDrafts.available(draft)),
            hint:complete?'查看此样片对应的成片':pending?'查询原任务，不重复生成':SeedanceDrafts.available(draft)?'生成 1080P 成片，另行计费':'样片已过期，请重新生成样片'}];
    }
    function badge(item){
        const text=item?.seedance_draft?'样片 480P':item?.draft_source_task_id?'成片 1080P':'';
        return text?`<span class="pixmax-video-stage-badge">${text}</span>`:'';
    }
    function open(source,index){
        const item=source?.images?.[index],draft=item?.seedance_draft;
        if(!draft||isSmartCanvasLocked())return;
        const completed=resultFor(draft);if(completed){focusPixmaxNode(completed);return;}
        const origin=canvas,guard=canvasTaskWriteGuard(source),key=origin.id+':'+draft.source_task_id;
        const valid=()=>canvas===origin&&guard.valid()&&source.images?.some(media=>media.url===item.url&&media.seedance_draft?.source_task_id===draft.source_task_id);
        const root=pixmaxCreationModal('生成成片'),body=root.querySelector('.pixmax-creation-content'),status=root.querySelector('[role=status]');
        const provider=apiProviders.find(provider=>provider.id===draft.provider_id);
        body.innerHTML=`<p>基于这份样片生成 1080P 成片，保留原样片，并在旁边创建连线的视频节点。</p><p>${escapeHtml(provider?.name||draft.provider_id)} · ${escapeHtml(draft.model)}</p><p class="pixmax-creation-hint">样片生成后 7 天内可生成成片。成片另行计费，使用样片原始内容。</p><button type="button" class="pixmax-creation-primary" data-seedance-final-run>生成成片 · 1080P</button>`;
        const button=body.querySelector('[data-seedance-final-run]');
        function sync(){
            const target=targetFor(draft);
            button.disabled=active.has(key)||!valid()||(!SeedanceDrafts.available(draft)&&!target?.seedanceUpgrade?.taskId);
            button.textContent=resultFor(draft)?'查看成片':target?.seedanceUpgrade?.taskId?'查询成片任务':'生成成片 · 1080P';
            if(!SeedanceDrafts.available(draft)&&!target)status.textContent='样片已过期，请重新生成样片。';
        }
        sync();
        button.onclick=async()=>{
            if(active.has(key)||!valid())return;
            active.add(key);button.disabled=true;
            let target=targetFor(draft);
            try{
                if(resultFor(draft)){root.remove();focusPixmaxNode(resultFor(draft));return;}
                if(target?.seedanceUpgrade?.taskId){
                    const response=await CanvasApi.getCanvasVideoTaskRequest(target.seedanceUpgrade.taskId);
                    if(!valid())return;
                    if(response.ok){
                        const record=await response.json();
                        if(['failed','cancelled'].includes(record.status)){
                            delete target.seedanceUpgrade.taskId;target.pendingTasks=[];target.pending=0;
                            status.textContent=(record.error||'成片生成未完成')+'，可点击重新生成。';scheduleSave();return;
                        }
                        if(window.CanvasSession?.enabled){
                            const deliveries=await CanvasApi.getCanvasTaskDeliveriesRequest(origin.id,origin.task_result_version||0);
                            if(deliveries.ok&&valid())smartTaskRecovery().mergeDeliveries(await deliveries.json());
                        }
                        if(!valid())return;
                        const result=resultFor(draft);
                        if(result){root.remove();focusPixmaxNode(result);return;}
                        status.textContent=record.status==='succeeded'?'成片已完成，请在生成结果中查看。':'成片任务处理中，可关闭此窗口，结果会回填画布。';
                        focusPixmaxNode(target);return;
                    }
                    if(response.status!==404)throw Error(await smartResponseErrorMessage(response,'任务查询失败，请稍后重试'));
                    // A lost submit response must reuse the persisted idempotency key.
                }
                if(!SeedanceDrafts.available(draft))throw Error('样片已过期，请重新生成样片。');
                const config={engine:'api',apiKind:'video',videoProvider:draft.provider_id,videoModel:draft.model,videoResolution:'1080p',videoReferenceMode:'auto',videoTaskMode:'auto',videoTempShLinks:[]};
                pushUndo();
                if(!target){
                    const rect=nodeRect(source);target=createNode(rect.x+rect.width+60,rect.y,[],{mediaKind:'video',select:false,skipUndo:true});
                    target.label='成片 1080P';target.w=rect.width;target.h=rect.height;
                    canvas.connections.push({from:source.id,to:target.id,kind:'input'});
                    target.seedanceUpgrade={sourceTaskId:draft.source_task_id};
                }
                const taskId=target.seedanceUpgrade.taskId||uid('canvas_vid');target.seedanceUpgrade.taskId=taskId;
                target.runSettings=config;target.pending=1;target.runStartedAt=nowMs();render();scheduleSave();
                const writeGuard=canvasTaskWriteGuard(source,target),binding=smartTaskInputBinding(source,target,writeGuard);
                status.textContent='正在提交成片任务…';
                const submitted=await runApiVideoGeneration('样片生成成片',[],config,binding,{draftSource:draft,taskId});
                await queueAndResumeSmartApiTasks(target,submitted,{kind:'video',archiveExisting:false,run:{nodeId:source.id,nodeType:source.type,kind:'video',prompt:'样片生成成片',settings:config,refs:[]}});
                if(valid()){status.textContent='成片已生成';root.remove();focusPixmaxNode(resultFor(draft)||target);}
            }catch(error){
                if(valid())status.textContent=error.message||'任务尚未确认，请查询原任务';
            }finally{active.delete(key);if(valid()){refreshSmartNodes([source.id,...(target?[target.id]:[])]);scheduleSave();sync();}}
        };
    }
    window.PixmaxSeedanceDrafts=Object.freeze({action,badge,open});
})();
