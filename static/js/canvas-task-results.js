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
    function recovery({list,read,apply,changed,current,allowed,now=Date.now}) {
        const states=new Map();let stopped=false,busy=false,timer=null;
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
            const status=value?.task===task ? (now()-value.at>15000 ? 'disconnected' : value.status) : 'checking';
            return {status,label:labels[status] || labels.checking};
        }
        async function refresh(){
            if(busy || stopped)return;
            clearTimeout(timer);busy=true;
            try {
                if(!live() || !allowed()){states.clear();changed();return;}
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
                                try {await apply(item,record,()=>present(item));} catch(_){/* Keep the saved result available for explicit joining. */}
                            }
                        } catch(error){
                            if(!present(item))continue;
                            update(item,[401,403,404].includes(error.status)?'unavailable':'disconnected');
                        }
                    }
                }));
            } finally {
                busy=false;if(live())timer=setTimeout(refresh,5000);
            }
        }
        return {get,refresh,stop(){stopped=true;clearTimeout(timer);states.clear();}};
    }
    const api={capture,guard,pending,recovery};
    if(typeof module==='object' && module.exports) module.exports=api;
    else window.CanvasTaskResults=api;
})();
