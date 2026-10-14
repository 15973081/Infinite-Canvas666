/* A late task response cannot mutate another canvas, member, or edit generation. */
(() => {
    'use strict';
    function capture(win=window) {
        if(!win.CanvasSession?.enabled) return () => true;
        const entry=win.MemberCanvasEdit?.active, epoch=entry?.lease?.epoch, generation=entry?.lease?.generation;
        const allowed=Boolean(entry?.lease?.canEdit), member=entry?.memberId, workspace=entry?.workspaceId;
        return () => Boolean(allowed && win.CanvasSession?.enabled && entry===win.MemberCanvasEdit?.active && entry.lease?.epoch===epoch &&
            entry.lease?.generation===generation && entry.lease?.canEdit && !win.CanvasSession?.paused &&
            win.CanvasSession?.context?.member?.id===member && win.CanvasSession?.context?.workspace?.id===workspace);
    }
    function pending() {
        const error=new Error('画布或编辑资格已变化，已提交任务的结果保留在生成结果列表。');
        error.resultPending=true;return error;
    }
    function guard(targets, read, win=window) {
        const validSession=capture(win), original=read();
        let paused=false;
        const valid=()=>{
            if(paused || !validSession())return false;
            const current=read();
            return !win.CanvasSession?.enabled || (current.canvas===original.canvas && targets.every(node=>node && current.nodes.includes(node)));
        };
        const pause=()=>{paused=true;return pending();};
        return {valid,pause,check(){if(!valid())throw pause();}};
    }
    const labels={checking:'正在核对后台任务',running:'后台正在处理',disconnected:'连接中断，后台任务可能仍在处理',
        succeeded:'已完成，待加入',failed:'生成失败',needs_review:'任务需要核对',cancelled:'任务已取消',unavailable:'任务不可读取，请检查空间权限'};
    const taskKey=task=>String(task?.canvasTaskId || task?.taskId || '');
    // Display observations live outside the saved document. Losing edit rights
    // must neither mutate that document nor stop authorized status reads.
    function recovery({list,read,apply,changed,current,allowed,sync,now=Date.now,
        visible=()=>typeof document==='undefined' || !document.hidden}) {
        const states=new Map();let stopped=false,busy=false,timer=null;
        const unsettled=status=>['checking','running','disconnected'].includes(status);
        const live=()=>!stopped && current();
        const present=item=>live() && allowed() && list().some(row=>row.task===item.task && row.id===item.id);
        function update(item,status){
            const previous=states.get(item.id);
            states.set(item.id,{task:item.task,status,at:now()});
            if(previous?.task!==item.task || previous.status!==status)changed(item);
        }
        function get(task){
            if(!live() || !allowed())return {status:'unavailable',label:labels.unavailable};
            const value=states.get(taskKey(task));
            const status=value?.task===task ? (unsettled(value.status) && now()-value.at>15000 ? 'disconnected' : value.status) : 'checking';
            return {status,label:labels[status] || labels.checking};
        }
        async function refresh(){
            if(busy || stopped)return;
            clearTimeout(timer);busy=true;
            try {
                if(!visible())return;
                if(!live() || !allowed()){states.clear();changed();return;}
                if(sync)await sync(()=>live() && allowed());
                if(!live() || !allowed())return;
                const items=list(),ids=new Set(items.map(item=>item.id));
                for(const id of states.keys())if(!ids.has(id))states.delete(id);
                // Bound simultaneous requests even for large reopened canvases.
                let index=0;
                await Promise.all(Array.from({length:Math.min(4,items.length)},async()=>{
                    while(index<items.length){
                        const item=items[index++];if(!present(item))continue;
                        try {
                            const record=await read(item);
                            if(!present(item))continue;
                            if((record.id || record.task_id)!==item.id || record.canvas_id && record.canvas_id!==item.canvasId ||
                                record.canvas_binding?.canvas_id && record.canvas_binding.canvas_id!==item.canvasId)throw new Error('task scope mismatch');
                            const status=['succeeded','failed','needs_review','cancelled'].includes(record.status) ? record.status :
                                ['queued','pending','submitting','submitted','running','polling','saving','finalizing','processing'].includes(record.status) ? 'running' : 'checking';
                            update(item,status);
                            if(status==='succeeded'){
                                try {await apply(item,record,()=>present(item));}
                                catch(error){if(!error?.resultPending)console.warn('Canvas task local apply failed',item.id,error);}
                            }
                        } catch(error){
                            if(!present(item))continue;
                            update(item,[401,403,404].includes(error.status)?'unavailable':'disconnected');
                        }
                    }
                }));
            } catch(error) {
                // A failed sync keeps the old delivery cursor for the next retry.
                console.warn('Canvas task reconciliation failed', error);
            } finally {
                busy=false;
                if(live()){
                    const pending=list().some(item=>{
                        const state=states.get(item.id);
                        return state?.task!==item.task || unsettled(state.status);
                    });
                    timer=setTimeout(refresh,visible() && pending ? 5000 : 60000);
                }
            }
        }
        return {get,refresh,stop(){stopped=true;clearTimeout(timer);states.clear();}};
    }
    function mergeDeliveries(document, response){
        if(response.canvas_id!==document.id || !Number.isSafeInteger(response.result_version) ||
            response.result_version<(document.task_result_version || 0) || !Array.isArray(response.deliveries))throw new Error('Invalid canvas deliveries');
        const nodes=document.nodes, affected=new Set(), clone=value=>JSON.parse(JSON.stringify(value));
        const append=result=>{
            const node=clone(result),taken=new Set(nodes.map(item=>item.id));let suffix=1;
            while(taken.has(node.id))node.id=result.id+'_'+(++suffix);
            nodes.push(node);affected.add(node.id);return node;
        };
        const mediaId=item=>item?.media_asset_id || String(item?.url || item || '').match(/^\/(?:assets\/cloud|api\/media)\/(ast_[A-Za-z0-9_-]+)(?:\/|$)/)?.[1] || item?.url || item;
        for(const delivery of response.deliveries){
            if(delivery.version<=(document.task_result_version || 0))continue;
            const result=delivery.node, taskId=delivery.task_id;
            if(result.images?.length){
                const present=new Set(nodes.flatMap(node=>node.images || []).map(mediaId));
                const missing=result.images.filter(item=>!present.has(mediaId(item)));
                if(missing.length){
                    let target=nodes.find(node=>node.id===delivery.target_id && ['output','smart-image','smart-audio','smart-model'].includes(node.type));
                    if(!target)target=nodes.find(node=>node.result_task_id===taskId && ['output','smart-image','smart-audio','smart-model'].includes(node.type));
                    if(!target)target=append({...result,images:[]});
                    target.images=[...(target.images || []),...clone(missing)];affected.add(target.id);
                }
            }else if(!nodes.some(node=>node.result_task_id===taskId && node.text===result.text)){
                append(result);
            }
            for(const node of nodes){
                for(const [field,key] of [['_pending','canvasTaskId'],['pendingTasks','taskId']]){
                    if(!Array.isArray(node[field]))continue;
                    const remaining=node[field].filter(task=>task?.[key]!==taskId);
                    if(remaining.length===node[field].length)continue;
                    node[field]=remaining;affected.add(node.id);
                    if(field==='pendingTasks'){node.pending=remaining.length;if(!node.pending)node.running=false;}
                }
            }
        }
        document.task_result_version=response.result_version;
        return [...affected];
    }
    function elapsed(task){
        if(!['succeeded','failed','cancelled'].includes(task?.status))return null;
        const start=task.created_at,end=task.completed_at;
        if(typeof start!=='number' || typeof end!=='number' || !Number.isFinite(start) || !Number.isFinite(end) || start<=0 || end<=start)return null;
        const ms=Math.round((end-start)*1000);
        return Number.isSafeInteger(ms) && ms>0 ? ms : null;
    }
    const api={capture,guard,pending,recovery,elapsed,mergeDeliveries};
    if(typeof module==='object' && module.exports) module.exports=api;
    else window.CanvasTaskResults=api;
})();
