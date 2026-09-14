/* Shared durable text task transport. Result application belongs to the input binding. */
(function () {
    'use strict';
    async function run(payload, {binding, canvasId, transport=window.fetch.bind(window), sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
        if(!binding || !window.CanvasSession?.enabled)throw new Error('对话任务校验尚未就绪，请保存并刷新页面。');
        const taskId='canvas_llm_'+crypto.randomUUID().replace(/-/g,'');
        const target=await binding.prepare();
        binding.beginSubmission();
        let accepted=false;
        try {
            const response=await window.MemberCanvasEdit.send('/api/canvas-llm-tasks',{signal:AbortSignal.timeout(30000),method:'POST',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({...payload,canvas_id:canvasId,client_task_id:taskId,canvas_target:target})},transport);
            binding.check();
            if(!response.ok)throw new Error('对话任务未确认，请检查编辑资格、供应商配置或管理平台的任务记录。');
            const receipt=await response.json();
            binding.check();
            if(receipt.task_id!==taskId)throw new Error('对话任务标识不一致，请到生成结果中核对。');
            binding.remember(receipt);accepted=true;
            for(let attempt=0;attempt<1200;attempt++) {
                binding.check();
                const response=await transport('/api/canvas-llm-tasks/'+encodeURIComponent(taskId),{cache:'no-store',signal:AbortSignal.timeout(30000)});
                binding.check();
                if(!response.ok)throw new Error('对话任务查询中断；任务会在服务器保留，请稍后查看生成结果。');
                const task=await response.json();
                binding.verify(task,taskId);
                if(task.status==='succeeded') {
                    if(typeof task.result?.text!=='string' || !task.result.text)throw new Error('回复内容待核对，请检查任务记录。');
                    return task;
                }
                if(['failed','cancelled','needs_review'].includes(task.status))throw new Error('对话任务未完成，请在管理平台核对原任务；不会自动重新生成。');
                await sleep(1000);
            }
            throw new Error('已停止等待，任务仍保留在服务器，请稍后查看生成结果。');
        } catch(error) {
            error.resultPending=true;
            error.taskId=taskId;
            if(!accepted && !error.inputChanged)error.message+=' 任务编号：'+taskId;
            throw error;
        }
    }
    window.CanvasLLMTasks={run};
})();
