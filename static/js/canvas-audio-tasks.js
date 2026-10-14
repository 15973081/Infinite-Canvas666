/* Audio admission uses the same saved-input receipts and polling as other media. */
(() => {
    'use strict';
    async function run(kind,payload,{binding,canvasId,onRemember}){
        const label=kind==='model'?'3D 模型':'音频';
        if(!binding||!window.CanvasSession?.enabled)throw new Error('请在成员画布中生成'+label);
        const taskId='canvas_'+kind+'_'+crypto.randomUUID().replace(/-/g,'');
        const target=await binding.prepare();binding.beginSubmission();
        let accepted=false;
        try{
            const response=await window.MemberCanvasEdit.send('/api/canvas-'+kind+'-tasks',{signal:AbortSignal.timeout(30000),method:'POST',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({...payload,canvas_id:canvasId,client_task_id:taskId,canvas_target:target})});
            binding.check();
            if(!response.ok){const error=new Error(await responseErrorMessage(response,label+'任务未确认'));error.rejected=[400,401,403,404,410,422,423,428].includes(response.status);throw error;}
            const receipt=await response.json();binding.check();
            if(receipt.task_id!==taskId)throw new Error(label+'任务标识不一致，请核对原任务');
            binding.remember(receipt);accepted=true;await onRemember(receipt);
            return await pollSmartCanvasTask(taskId,kind,{inputBinding:binding,returnRecord:true});
        }catch(error){error.taskId=taskId;error.resultPending=!error.rejected;error.accepted=accepted;throw error;}
    }
    window.CanvasAudioTasks=Object.freeze({run:(payload,options)=>run('audio',payload,options)});
    window.CanvasModelTasks=Object.freeze({run:(payload,options)=>run('model',payload,options)});
})();
