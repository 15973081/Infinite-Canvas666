const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {functionSource}=require('./helpers/canvas-source.cjs');
const results=require('../static/js/canvas-task-results.js');
const read=file=>fs.readFileSync(path.join(__dirname,'../static/js/',file),'utf8').replace(/\r\n/g,'\n');

function setup(){
    const timers=[],source={id:'source',type:'smart-image',images:[{url:'/video.mp4',kind:'video'}]},nodes=[source];
    const run={},status={},controls={
        '[data-mediakit-run]':run,'[data-mediakit-provider]':{value:'provider',addEventListener(){}},
        '[data-mediakit-prompt]':{value:'描述视频'},'[data-mediakit-level]':{value:'Balanced'},
        '[data-mediakit-resolution]':{value:'1080p'},'[data-mediakit-version]':{value:'standard'}
    };
    controls['.pixmax-mediakit-actions']={prepend(){}};
    const modalBody={insertAdjacentHTML(){},appendChild(){},querySelector:key=>controls[key],querySelectorAll:()=>[]};
    const root={classList:{add(){}},isConnected:false,querySelector:key=>key==='[role=status]'?status:modalBody};
    let requests=0,prepared;
    const ctx=vm.createContext({window:{},nodes,canvas:{id:'canvas',nodes,connections:[]},crypto:{randomUUID:()=> 'task-1'},
        apiProviders:[{id:'provider',has_key:true,mediakit_tools:['erase-video-subtitle','enhance-video','video-understand-router']}],
        escapeHtml:String,escapeAttr:String,isSmartCanvasLocked:()=>false,mediaKindForItem:item=>item?.kind,
        pixmaxCreationModal:()=>root,canvasTaskWriteGuard:()=>({valid:()=>true}),
        document:{createElement:()=>({})},nodeRect:()=>({x:0,y:0,width:320}),
        createNode:(x,y,images)=>{const node={id:'target',type:'smart-image',x,y,images};nodes.push(node);return node;},
        createPromptNode:(x,y)=>{const node={id:'target',type:'smart-prompt',x,y,text:''};nodes.push(node);return node;},
        render(){},scheduleSave(){},pushUndo(){},refreshSmartNodes(){},
        smartTaskInputBinding:(_source,target)=>({async prepare(){prepared=JSON.parse(JSON.stringify(target));return {};},beginSubmission(){},remember(){}}),
        setTimeout:fn=>timers.push(fn),AbortSignal:{timeout:()=>undefined},
        fetch:async()=>{requests++;return {ok:true,json:async()=>({id:'canvas_mediakit_task1',status:'polling'})};},
        smartPendingTasks:node=>node.pendingTasks||[],smartLocalDepthBodyHtml:()=>'',
        smartNodeMediaBodyHtml:node=>node.text?'<div class="result-text">'+node.text+'</div>':node.images?.length?'<video></video>':'<button data-node-upload>上传视频</button>'
    });
    ctx.CanvasSession=ctx.window.CanvasSession={enabled:true,url:value=>value};
    ctx.MemberCanvasEdit=ctx.window.MemberCanvasEdit={send:async()=>({ok:true,json:async()=>({task_id:'canvas_mediakit_task1'})})};
    ctx.smartTaskRecovery=()=>({mergeDeliveries:data=>results.mergeDeliveries(ctx.canvas,data)});
    vm.runInContext(read('pixmax-mediakit.js'),ctx);
    vm.runInContext(functionSource(read('canvas/smart/smart-workspace.js'),'nodeBodyHtml'),ctx);
    vm.runInContext(functionSource(read('canvas/smart/smart-media-editor.js'),'pickMediaForSmartNode'),ctx);
    return {ctx,nodes,source,timers,run,get prepared(){return prepared;},get requests(){return requests;},
        async start(action){ctx.window.PixmaxMediaKit.open('source',0,action);await run.onclick();return nodes[1];}};
}

for(const action of ['erase','understand','upscale'])test(action+' registers pending before saving and renders one non-uploadable task body',async()=>{
    const env=setup(),node=await env.start(action),{ctx}=env;
    assert.equal(env.prepared.pendingTasks[0].kind,'mediakit');
    assert.equal(env.prepared.pendingTasks[0].taskId,node.mediakitTaskId);
    const html=ctx.nodeBodyHtml(node,{width:400,height:280});
    assert.equal((html.match(/role="status"/g)||[]).length,1);
    assert.ok(html.includes('local-depth-node'));
    assert.ok(html.includes('正在提交'));
    assert.doesNotMatch(html,/data-node-upload|task-recovery-status/);
    ctx.document.createElement=()=>assert.fail('pending task must not open a file picker');
    ctx.pickMediaForSmartNode(node.id);
    await env.timers.shift()();
    assert.match(ctx.nodeBodyHtml(node,{}),action==='erase'?/正在擦除字幕/:action==='understand'?/正在理解视频/:/正在处理视频/);
});

test('reopened MediaKit video resumes status polling without an upload placeholder',async()=>{
    const env=setup(),node={id:'target',type:'smart-image',label:'字幕擦除',images:[],mediakitTaskId:'canvas_mediakit_task1',pendingTasks:[{taskId:'canvas_mediakit_task1',kind:'mediakit'}]};
    env.nodes.push(JSON.parse(JSON.stringify(node)));
    const restored=env.nodes[1];
    assert.match(env.ctx.nodeBodyHtml(restored,{}),/正在查询任务/);
    assert.equal(env.timers.length,1);
    await env.timers.shift()();
    assert.match(env.ctx.nodeBodyHtml(restored,{}),/正在擦除字幕/);
});

test('terminal failure stays visible, stops automatic polling and allows explicit refresh',async()=>{
    const env=setup(),node=await env.start('erase');
    env.ctx.fetch=async()=>({ok:true,json:async()=>({id:node.mediakitTaskId,status:'failed',error:'视频处理失败'})});
    await env.timers.shift()();
    const html=env.ctx.nodeBodyHtml(node,{});
    assert.match(html,/视频处理失败/);
    assert.match(html,/data-mediakit-query/);
    assert.doesNotMatch(html,/<progress|data-node-upload/);
    env.ctx.nodeBodyHtml(node,{});
    assert.equal(env.timers.length,0);
    env.ctx.window.PixmaxMediaKit.refresh(node.id);
    assert.equal(env.timers.length,1);
});

test('interrupted status query keeps the task visible and schedules another query',async()=>{
    const env=setup(),node=await env.start('erase');
    env.ctx.fetch=async()=>({ok:false,status:503});
    await env.timers.shift()();
    const html=env.ctx.nodeBodyHtml(node,{});
    assert.match(html,/查询暂时中断，正在重试/);
    assert.match(html,/<progress/);
    assert.doesNotMatch(html,/data-node-upload/);
    assert.equal(env.timers.length,1);
});

for(const action of ['erase','understand'])test(action+' delivery replaces progress with its result',async()=>{
    const env=setup(),node=await env.start(action),taskId=node.mediakitTaskId;
    const result=action==='understand'?{...node,text:'视频理解结果',result_task_id:taskId}:{...node,images:[{url:'/result.mp4',kind:'video'}]};
    env.ctx.fetch=async()=>({ok:true,json:async()=>({id:taskId,status:'succeeded'})});
    env.ctx.CanvasApi={getCanvasTaskDeliveriesRequest:async()=>({ok:true,json:async()=>({canvas_id:'canvas',result_version:1,deliveries:[{version:1,task_id:taskId,target_id:node.id,node:result}]})})};
    await env.timers.shift()();
    assert.equal(node.pendingTasks.length,0);
    const html=env.ctx.nodeBodyHtml(node,{});
    assert.doesNotMatch(html,/role="status"|data-node-upload/);
    assert.match(html,action==='understand'?/视频理解结果/:/<video>/);
    assert.equal(env.timers.length,0);
});
