const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '../static/js', name), 'utf8').replace(/\r\n/g, '\n');
function load(ctx, source, names){
    for(const name of names){
        const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
        assert.ok(start >= 0, name);
        vm.runInContext(source.slice(start, source.indexOf('\n}', start)+2), ctx);
    }
}
const result = () => ({videos:['/output/video.mp4'], task_id:'upstream-1',
    usage:{completion_tokens:108900, total_tokens:108900},
    video_info:{model:'doubao-seedance-2-5-260628', resolution:'720p', duration:5, ratio:'16:9', framespersecond:24, task_id:'upstream-1'},
    cost:{status:'priced', source:'actual', billing_source:'volcengine_usage', kind:'video', providerId:'volcengine',
        model:'doubao-seedance-2-5-260628', quantity:108900, billing_type:'per_million_tokens', unit_price:'70', amount_micros:7623000}});
function setup(smart=false){
    const ctx = vm.createContext({window:{}, canvas:{logs:[]}, nodes:[], apiProviders:[{id:'volcengine', protocol:'volcengine'}],
        uid:()=> 'log', scheduleSave(){}, updateCanvasCostButton(){}, updateSmartCanvasCostButton(){},
        runPlatformLabel:()=> '火山', runTaskLabel:()=> 'Seedance', smartRunPlatformLabel:()=> '火山', smartRunTaskLabel:()=> 'Seedance',
        smartRunRequestMeta:()=> ({}), MS_GEN_MODELS:{}});
    vm.runInContext(read('volcengine-video-billing.js'), ctx);
    load(ctx, read(smart ? 'smart-canvas.js' : 'canvas.js'), smart
        ? ['smartBillingIdentity','smartModelPriceAt','calculateSmartGenerationCost','smartGenerationLogCost','addSmartGenerationLog','smartCanvasCostTotals']
        : ['billingIdentity','modelPriceAt','calculateGenerationCost','generationLogCost','addGenerationLog','canvasCostTotals']);
    return ctx;
}
for(const smart of [false,true]){
    test(`${smart?'smart':'classic'} logs keep usage, actual duration, and server amount after save/reload`,()=>{
        const c = setup(smart), original = result();
        const run = {kind:'video', nodeType:'video', providerId:'volcengine', billingModel:original.cost.model,
            node:{apiProvider:'volcengine',model:original.cost.model,duration:-1},
            settings:{videoProvider:'volcengine', videoModel:original.cost.model,videoDuration:-1},
            ...c.window.VolcengineVideoBilling.metadata(original)};
        c[smart?'addSmartGenerationLog':'addGenerationLog']({run, outputs:original.videos});
        const log = JSON.parse(JSON.stringify(c.canvas.logs[0]));
        assert.equal(log.usage.completion_tokens,108900);
        assert.equal(log.video_info.resolution,'720p'); assert.equal(log.durationSeconds,5);
        original.cost.amount_micros = 1;
        c.apiProviders[0].model_prices = [{kind:'video',model:run.billingModel,billing_type:'per_second',unit_price:'999'}];
        assert.equal(c[smart?'smartGenerationLogCost':'generationLogCost'](log).amount_micros,7623000);
        assert.equal(c[smart?'smartCanvasCostTotals':'canvasCostTotals']([log]).video,7623000);
        // Delivery failed after upstream generation; its cost must still count.
        log.status='failed';
        assert.equal(c[smart?'smartCanvasCostTotals':'canvasCostTotals']([log]).video,7623000);
    });
    test(`${smart?'smart':'classic'} old Ark seconds never masquerade as actual tokens; other providers unchanged`,()=>{
        const c = setup(smart), get = c[smart?'smartGenerationLogCost':'generationLogCost'];
        const log={status:'success',billingKind:'video',nodeType:'video',providerId:'volcengine',billingModel:'seedance-2.0',
            cost:{status:'priced',source:'actual',billing_type:'per_second',amount_micros:5000000}};
        assert.equal(get(log).status,'unknown'); assert.equal(get(log).reason,'missing_usage');
        log.providerId='other'; assert.equal(get(log).amount_micros,5000000);
    });
}
test('classic completion saves metadata on output media as well as the run and cannot complete twice',()=>{
    const c=setup(), res=result(), pending={id:'p',startedAt:1,run:{node:{id:'g'}}}, out={_pending:[pending]};
    Object.assign(c,{nowMs:()=>100, findPendingTask:()=>out._pending.length?{out,pending}:null,
        requestMetaFromResult:r=>({task_id:r.task_id}), resultMediaUrls:r=>r.videos, outputUrlValue:x=>typeof x==='string'?x:x.url,
        appendOutputImages:(_out,items)=>{out.images=items;}, mergeGeneratedOutputs(){},refreshRunNodes(){}});
    let logged=0;c.addGenerationLog=({run})=>{logged++;assert.equal(run.usage.completion_tokens,108900);};
    load(c,read('canvas.js'),['videoOutputsFromResult','completeCanvasVideoTask']);
    c.completeCanvasVideoTask('task',res);c.completeCanvasVideoTask('task',res);
    assert.equal(logged,1);assert.equal(out.images[0].video_info.model,res.video_info.model);
});
test('smart completion preserves media token metadata and rejects duplicate finalization',()=>{
    const c=setup(true), res=result();let logged=0;
    Object.assign(c,{smartPendingTasks:n=>n.pendingTasks||[],stripImageGenerationMeta:x=>x,copyMediaSizeFields:(_x,y)=>y,
        smartPendingTaskRun:()=>({settings:{videoProvider:'volcengine'}}),cloneSmartSettings:x=>({...x}),nowMs:()=>100,
        mediaNodeDefaultScale:()=>1,addSmartGenerationLog:({run})=>{logged++;assert.equal(run.cost.amount_micros,7623000);}});
    load(c,read('smart-canvas.js'),['finalizeSmartPendingTask']);
    const node={pendingTasks:[{taskId:'t',kind:'video',startedAt:1}],pending:1,images:[]};
    c.finalizeSmartPendingTask(node,'t',res.videos,'video',res);
    c.finalizeSmartPendingTask(node,'t',res.videos,'video',res);
    assert.equal(logged,1);assert.equal(node.images[0].usage.completion_tokens,108900);
});
test('price editor changes only the selected specification and blank restores default',()=>{
    const c=setup();const p={id:'volcengine',video_models:['seedance-2.0'],model_prices:[]};
    c.provider=()=>p;load(c,read('api-settings.js'),['updateVolcengineVideoPrice']);
    c.updateVolcengineVideoPrice(0,'720p',false,'46');c.updateVolcengineVideoPrice(0,'720p',true,'28');
    c.updateVolcengineVideoPrice(0,'1080p',false,'0');assert.equal(p.model_prices.length,3);
    c.updateVolcengineVideoPrice(0,'720p',false,'');assert.equal(p.model_prices.length,2);
    assert.equal(p.model_prices[0].has_video_input,true);assert.equal(p.model_prices[1].unit_price,'0');
});
