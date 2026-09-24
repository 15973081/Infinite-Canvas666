const {readCanvasSource} = require('./helpers/canvas-source.cjs');
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const bindings=require('../static/js/canvas-task-bindings.js');
const guards=require('../static/js/canvas-task-results.js');
const source=readCanvasSource(path.join(__dirname,'../static/js/canvas.js'),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function until(check){const deadline=Date.now()+5000;while(!check()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(check(),'reached async boundary');}
function install(c,...names){
    vm.createContext(c);
    for(const name of names){
        const start=new RegExp('(?:async )?function '+name+'\\(').exec(source).index;
        const next=source.slice(start+1).search(/\n(?:async )?function /);
        vm.runInContext(source.slice(start,next<0?undefined:start+1+next),c);
    }
}
function fixture(kind='Image',{count=2,noOutput=false,stage='poll',status='succeeded'}={}){
    const gate=deferred(),sourceNode={id:'src',type:kind==='Image'?'generator':'video',apiProvider:'p',model:'m',count,x:0,y:0},prompt={id:'prompt',type:'prompt',text:'original'};
    const lease={epoch:1,generation:2,revision:1,canEdit:true,state:'editing'};
    const win={addEventListener(){},CanvasSession:{enabled:true,context:{member:{id:'m'},workspace:{id:'w'}}},MemberCanvasEdit:{
        active:{memberId:'m',workspaceId:'w',lease},get canEdit(){return lease.canEdit;},get canSave(){return lease.canEdit;},markDirty(){}}};
    win.CanvasTaskResults={guard:(targets,read)=>guards.guard(targets,read,win),capture:()=>guards.capture(win)};
    win.CanvasTaskBindings=bindings;
    win.VideoDurationPolicy=require('../static/js/video-duration-policy.js');
    const counts={saved:0,submitted:0,completed:0,failed:0},requests=[],records=new Map(),timers=[];
    let reached=false,serverDocument=null;
    const boundary=async where=>{if(where===stage){reached=true;await gate.promise;}};
    const c={window:win,canvas:{id:'c',title:'test',logs:[]},nodes:[prompt,sourceNode],connections:[{from:'prompt',to:'src'}],viewport:{},
        CLIENT_ID:'page',lastCanvasUpdatedAt:0,lastSavedCanvasSnapshot:'',localCanvasDirty:false,savingCanvasNow:false,saveCanvasAgain:false,saveTimer:null,
        applyingRemoteCanvas:false,currentCanvasTime:null,Date,console,JSON,Object,setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},
        isCanvasLockedByOther:()=>false,canvasSaveSnapshot:p=>JSON.stringify(p),sanitizeConnections(){},updateCanvasListRecord(){},refreshGateViewControls(){},
        setStatus:message=>c.message=message,showErrorModal:message=>c.error=message,alert:message=>c.error=message,tr:s=>s,nowMs:()=>1000,
        uid:prefix=>prefix+'-'+Math.random(),cascadeTargetIdFromOptions:()=>'',cascadeFetch(){},ensureCascadeActive(){},isCascadeAbortError:()=>false,
        shouldCreateOutputForNode:()=>!noOutput,apiProviders:[],orderedSources:(node,items)=>items,generatorSources:()=>[{prompt:prompt.text,refs:[]}],
        allowedImageResolutions:()=>['1k','2k','4k','custom'],allowedVideoResolutions:()=>['','480p','720p','1080p'],
        imageRefsOnly:r=>r,videoRefsOnly:()=>[],audioRefsOnly:()=>[],applyUploadedUrlToRefs:r=>r,resolveImageProviderId:p=>p,resolveVideoProviderId:p=>p,
        canvasAvatarPlatform:()=>'',resolveImageModel:m=>m,generatorSizeForRun:async()=>{await boundary('size');return '1024x1024';},normalizedImageQuality:()=>'',
        videoNodeDurationRange:()=>({min:1,max:60,auto:false}),manualVideoUrlForNode:()=>'',refreshRunNodes(){},requestMetaFromResult:()=>({}),addGenerationLog:entry=>c.canvas.logs.push(entry),
        appendOutputImages:(out,images)=>{out.images.push(...images.map(url=>({url})));counts.completed++;},
        mergeGeneratedOutputs:(node,images)=>node.generatedOutputs=[...images],activeCanvasTaskPolls:new Set(),
        videoOutputsFromResult:r=>r.videos||[],normalizeCanvasTaskError:e=>e.message,canvasTaskPollRetryWindow:()=>0,
        extractUpstreamTaskId:()=>'',pendingById:(out,id)=>out?._pending?.find(p=>p.id===id),collectRunMeta:()=>({runMs:0}),collectRunMetas:()=>[],
        makePendingForRun:(id,run,node,options,metadata)=>({id,run,startedAt:1000,...metadata}),
        responseErrorMessage:async()=> 'HTTP failure'};
    win.CanvasApi={
        saveCanvas:async(id,payload)=>{
            const sent=clone(payload);await boundary('save');counts.saved++;lease.revision++;
            const normalize=value=>{
                if(Array.isArray(value))return value.map(normalize);
                if(value && typeof value==='object'){
                    const result=Object.fromEntries(Object.entries(value).map(([key,item])=>[key,normalize(item)]));
                    const asset=typeof result.url==='string' && result.url.match(/^\/assets\/cloud\/(ast_[^/]+)\//);
                    if(asset)result.media_asset_id=asset[1];return result;
                }
                return value;
            };
            serverDocument=normalize(sent);
            return {ok:true,status:200,json:async()=>({canvas:{id,revision:lease.revision,updated_at:lease.revision,...clone(serverDocument)}})};
        },
        createCanvasImageTaskRequest:payload=>create(payload),createCanvasVideoTaskRequest:payload=>create(payload),
        getCanvasImageTaskRequest:taskId=>get(taskId),getCanvasVideoTaskRequest:taskId=>get(taskId)
    };
    async function create(payload){
        const sent=clone(payload);requests.push(sent);counts.submitted++;const id='task-'+requests.length;
        assert.equal(sent.canvas_target.base_revision,lease.revision);
        assert.equal(sent.canvas_id,'c');assert.ok(serverDocument,'save must finish before submission');
        assert.equal(sent.canvas_target.input_sha256,await bindings.graphFingerprint(serverDocument,'src',noOutput?'src':c.nodes.find(n=>n.type==='output').id));
        const record={id,status,canvas_edit_generation:2,result:{images:['/assets/cloud/ast_'+id+'/result.png'],videos:['/assets/cloud/ast_'+id+'/result.mp4']},
            canvas_binding:{version:3,canvas_id:'c',canvas_kind:'classic',source_node_id:'src',target_node_id:sent.canvas_target.target_node_id,
                submitted_revision:sent.canvas_target.base_revision,graph_sha256:sent.canvas_target.input_sha256,request_sha256:id.endsWith('1')?'a'.repeat(64):'b'.repeat(64)}};
        records.set(id,record);await boundary('submit');
        return {ok:true,json:async()=>({task_id:id,canvas_binding:clone(record.canvas_binding)})};
    }
    async function get(id){await boundary('poll');return {ok:true,json:async()=>clone(records.get(id))};}
    install(c,'canvasTaskWriteGuard','classicTaskInputBinding','attachClassicTaskBinding','classicPendingInputBinding','pauseClassicTaskInput',
        'serializableCanvasNode','serializableCanvasNodes','canvasSavePayload','saveCanvas','scheduleSave','flushClassicCanvasBeforeFrontendReload',
        'outputForNode','runSnapshot','findPendingTask','createCanvas'+kind+'Task','pollCanvas'+kind+'Task','waitCanvas'+kind+'TaskResult',
        'completeCanvas'+kind+'Task','failCanvas'+kind+'Task',kind==='Image'?'runGenerator':'runVideoNode');
    return {c,prompt,source:sourceNode,lease,counts,requests,records,timers,gate,reached:()=>reached,
        start:()=>c[kind==='Image'?'runGenerator':'runVideoNode']('src'),get out(){return c.nodes.find(n=>n.type==='output');}};
}
test('classic partial batch submission keeps and completes the accepted sibling',async()=>{
    const f=fixture('Image'),submit=f.c.window.CanvasApi.createCanvasImageTaskRequest;
    let attempts=0;
    f.c.window.CanvasApi.createCanvasImageTaskRequest=payload=>++attempts===1?Promise.reject(new Error('one request rejected')):submit(payload);
    const waiting=f.start();await until(f.reached);f.gate.resolve();await waiting;
    assert.equal(attempts,2);assert.equal(f.counts.submitted,1);assert.equal(f.out.images.length,1);assert.equal(f.out._pending.length,0);
});

for(const kind of ['Image','Video']){
    test('classic '+kind+' actual save, POST receipt and completion use one bound input',async()=>{
        const f=fixture(kind),waiting=f.start();await until(f.reached);assert.ok(f.counts.saved>=2);
        f.gate.resolve();await waiting;
        assert.equal(f.counts.completed,kind==='Image'?2:1);assert.equal(f.out.images.length,kind==='Image'?2:1);
        assert.equal(f.out._pending.length,0);assert.equal(f.prompt.text,'original');assert.equal(f.source.running,false);
        assert.ok(f.requests.every(r=>r.canvas_target.input_sha256===f.requests[0].canvas_target.input_sha256));
        assert.equal(f.c.error,undefined);
    });
    for(const stage of ['save','submit','poll'])for(const edit of ['prompt','model','handoff','replace']){
        test('classic '+kind+' preserves '+edit+' changes during '+stage,async()=>{
            const f=fixture(kind,{stage}),waiting=f.start();await until(f.reached);
            if(edit==='prompt')f.prompt.text='keep newer input';
            if(edit==='model')f.source.model='new model';
            if(edit==='handoff')f.lease.generation++;
            if(edit==='replace')f.c.nodes=f.c.nodes.map(n=>n===f.source?{...n,marker:'replacement'}:n);
            f.gate.resolve();await waiting;
            assert.equal(f.counts.completed,0);assert.equal(f.out.images.length,0);
            if(stage==='save')assert.equal(f.counts.submitted,0);
            if(edit==='prompt')assert.equal(f.prompt.text,'keep newer input');
            if(edit==='model')assert.equal(f.source.model,'new model');
            if(['prompt','model'].includes(edit)){assert.equal(f.source.running,false);assert.match(f.c.message,/输入|编辑资格/);}
            if(stage==='poll'){
                assert.equal(f.out._pending.length,kind==='Image'?2:1);
                for(const task of f.out._pending){
                    assert.equal(Boolean(task.paused),['prompt','model'].includes(edit));
                    assert.equal(task.failed,undefined);
                    assert.ok(task.canvasTaskId);
                }
                if(['prompt','model'].includes(edit))assert.equal(f.source.runStatus,'paused');
            }
        });
    }
    test('classic '+kind+' chained generation without output node also checks receipts',async()=>{
        const f=fixture(kind,{noOutput:true,count:1}),waiting=f.start();await until(f.reached);f.gate.resolve();await waiting;
        assert.equal(f.requests[0].canvas_target.target_node_id,'src');assert.equal(f.source.generatedOutputs.length,1);assert.equal(f.c.error,undefined);
    });
    test('classic '+kind+' chained generation defers changed inputs',async()=>{
        const f=fixture(kind,{noOutput:true,count:1}),waiting=f.start();await until(f.reached);f.prompt.text='keep';f.gate.resolve();await waiting;
        assert.equal(f.source.generatedOutputs,undefined);assert.equal(f.prompt.text,'keep');
    });
    test('classic '+kind+' failed server task cannot clean up newer inputs',async()=>{
        const f=fixture(kind,{status:'failed'}),waiting=f.start();await until(f.reached);f.prompt.text='keep';f.gate.resolve();await waiting;
        assert.equal(f.out._pending.length,kind==='Image'?2:1);assert.equal(f.prompt.text,'keep');assert.equal(f.counts.completed,0);
    });
    test('classic '+kind+' missing or changed task binding defers a completed result',async()=>{
        const f=fixture(kind),waiting=f.start();await until(f.reached);
        for(const record of f.records.values())record.canvas_binding.graph_sha256='0'.repeat(64);
        f.gate.resolve();await waiting;assert.equal(f.counts.completed,0);assert.ok(f.out._pending.length>0);
    });
    test('classic '+kind+' serialized pending does not revive an in-memory operation',async()=>{
        const f=fixture(kind),waiting=f.start();await until(f.reached);
        const saved=clone(f.out._pending);assert.equal(saved[0]._inputBinding,undefined);
        f.out._pending=saved;f.gate.resolve();await waiting;
        assert.equal(await f.c['pollCanvas'+kind+'Task'](saved[0].canvasTaskId),'paused');assert.equal(f.counts.completed,0);
    });
}
test('classic size preparation captures the original input before awaiting media dimensions',async()=>{
    const f=fixture('Image',{stage:'size'}),waiting=f.start();await until(f.reached);f.prompt.text='new';f.gate.resolve();await waiting;
    assert.equal(f.counts.submitted,0);assert.equal(f.source.running,false);assert.equal(f.prompt.text,'new');
});

test('classic subsequent generation survives actual save enrichment of previous result references',async()=>{
    const f=fixture('Image',{count:1});let waiting=f.start();await until(f.reached);f.gate.resolve();await waiting;
    await f.c.flushClassicCanvasBeforeFrontendReload();
    assert.ok(f.c.canvas.nodes.find(n=>n.type==='output').images[0].media_asset_id);
    assert.equal(f.out.images[0].media_asset_id,undefined);
    await f.start();assert.equal(f.counts.completed,2);assert.equal(f.out.images.length,2);assert.equal(f.c.error,undefined);
});

test('paused placeholder shows manual results instead of a spinner or failure',()=>{
    const c={window:{},escapeAttr:String,tr:s=>s,pendingOutputStyle:()=>''};
    install(c,'renderPendingOutput');
    const html=c.renderPendingOutput({id:'p',paused:true,canvasTaskId:'original'});
    assert.match(html,/查看生成结果/);
    assert.doesNotMatch(html,/output-spinner|running|失败/);
});
test('paused recovery opens saved task results without querying or resubmitting',async()=>{
    let opened=0;
    const pending={id:'p',paused:true},out={_pending:[pending]};
    const c={findOutputByPendingId:()=>out,pendingById:()=>pending,
        window:{MemberCanvasEdit:{openTaskResults:async()=>{opened++;}}}};
    install(c,'queryRecoverPendingOutput');
    await c.queryRecoverPendingOutput('p');
    assert.equal(opened,1);
});
test('pause only settles its own batch, and an old run cannot stop a newer run',()=>{
    const binding={},other={},token={},own={_inputBinding:binding},foreign={_inputBinding:other};
    const node={running:true,_taskRunToken:token},out={_pending:[own,foreign]};
    const c={scheduleSave(){},refreshRunNodes(){},setStatus(){}};
    install(c,'pauseClassicTaskInput');
    c.pauseClassicTaskInput(node,out,{valid:()=>true},{inputChanged:true}, {},binding);
    assert.equal(node.running,true);assert.equal(own.paused,undefined);
    c.pauseClassicTaskInput(node,out,{valid:()=>true},{inputChanged:true},token,binding);
    assert.equal(own.paused,true);assert.equal(foreign.paused,undefined);
});
