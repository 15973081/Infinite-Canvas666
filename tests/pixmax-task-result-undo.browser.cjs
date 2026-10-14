const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');
const results=require('../static/js/canvas-task-results.js');
const clone=value=>JSON.parse(JSON.stringify(value));

async function setup(t,kind,{sibling=false,held=false}={}){
    const state=await fixture(t,'smart',true,{secureOrigin:true});const {page,record}=state;
    await page.addScriptTag({url:'/static/js/canvas-task-bindings.js'});
    await page.evaluate(()=>{
        apiProviders=[{id:'provider',has_key:true,audio_models:['speech-2.8-hd'],model_models:['3.0']}];
        Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});
        Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});
    });
    let task,version=0,reads=0,release,seen,deltaFailure=false,deltaMutation=value=>value;const calls=[],deliveries=[],gate=new Promise(resolve=>release=resolve),arrived=new Promise(resolve=>seen=resolve);
    function delta(after){return {canvas_id:record.id,result_version:version,deliveries:clone(deliveries.filter(item=>item.version>after&&record.nodes.some(node=>node.images?.some(image=>image.url===item.node.images[0].url))))};}
    await page.route('**/api/canvases/canvas-test/task-results**',async route=>{
        reads++;seen();if(held)await gate;
        if(deltaFailure)return route.fulfill({status:503,json:{detail:'同步暂不可用'}});
        return route.fulfill({json:deltaMutation(delta(Number(new URL(route.request().url()).searchParams.get('delivered_after')||0)))});
    });
    await page.route('**/api/canvases/canvas-test',route=>{
        if(route.request().method()!=='PUT')return route.fallback();
        const body=route.request().postDataJSON();assert.ok((body.task_result_version||0)<=version);
        const oldRevision=record.revision;Object.assign(record,clone(body));record.updated_at++;record.revision=oldRevision+1;
        // Match server merge_unseen_deliveries: an old save cannot lose a
        // worker output, while an acknowledged deletion belongs to the editor.
        results.mergeDeliveries(record,{canvas_id:record.id,result_version:version,deliveries:clone(deliveries.filter(item=>item.version>(body.task_result_version||0)))});
        return route.fulfill({json:{canvas:record}});
    });
    await page.route('**/api/canvas-'+kind+'-tasks**',route=>{
        const request=route.request();
        if(request.method()==='POST'){
            const body=request.postDataJSON(),binding=body.canvas_target;calls.push(body);
            task={id:body.client_task_id,status:'succeeded',canvas_edit_generation:1,result:{[kind==='audio'?'audios':'models']:['/output/generated.'+(kind==='audio'?'mp3':'glb')]},
                canvas_binding:{version:3,canvas_id:record.id,canvas_kind:'smart',source_node_id:binding.source_node_id,target_node_id:binding.target_node_id,
                    submitted_revision:binding.base_revision,graph_sha256:binding.input_sha256,request_sha256:'a'.repeat(64)}};
            return route.fulfill({json:{task_id:task.id,status:'queued',canvas_binding:task.canvas_binding}});
        }
        if(!version){
            if(sibling)deliveries.push({task_id:'completed-sibling',version:++version,target_id:'sibling',node:{id:'sibling-result',type:'smart-image',images:[{url:'/output/sibling.png',kind:'image'}]}});
            deliveries.push({task_id:task.id,version:++version,target_id:task.canvas_binding.target_node_id,node:{id:'result_'+task.id,type:'smart-'+kind,images:[{url:task.result[kind==='audio'?'audios':'models'][0],kind}]}});
            results.mergeDeliveries(record,{canvas_id:record.id,result_version:version,deliveries:clone(deliveries)});
        }
        return route.fulfill({json:task});
    });
    await page.evaluate(kind=>openSmartStudio(createSmartStudioNode(kind,{x:600,y:300}).id),kind);
    await page.getByRole('textbox',{name:kind==='audio'?'音频创作内容':'3D 模型描述'}).fill('原始创作内容');
    return {...state,calls,delta:()=>delta(0),task:()=>clone(task),arrived,release,reads:()=>reads,failDelta:value=>deltaFailure=value,mutateDelta:value=>deltaMutation=value};
}
async function generate(page,kind){await page.locator('[data-'+kind+'-run]').click();}
async function finished(page,kind){await page.waitForFunction(kind=>!window[kind==='audio'?'PixmaxAudioCreation':'PixmaxModelCreation'].busy()&&nodes[0].images.length===1,kind);}

for(const kind of ['audio','model'])for(const sibling of [false,true])test(kind+' undo/save/reload removes only the accepted output and never restores completed progress'+(sibling?' with another delivery':''),async t=>{
    const api=await setup(t,kind,{sibling});const {page,record,errors}=api;
    await generate(page,kind);await finished(page,kind);
    await page.evaluate(()=>performUndo());assert.equal(await page.evaluate(()=>nodes[0].images.length),0);
    assert.equal(await page.evaluate(()=>smartPendingTasks(nodes[0]).length),0);
    await page.evaluate(()=>saveCanvas({force:true}));assert.equal(record.nodes[0].images.length,0);
    assert.equal(record.nodes.filter(node=>node.images?.some(item=>item.url==='/output/sibling.png')).length,sibling?1:0);
    await page.evaluate(()=>redoSmartCanvas());assert.equal(await page.evaluate(()=>nodes[0].images.length),1);assert.equal(await page.evaluate(()=>smartPendingTasks(nodes[0]).length),0);
    await page.evaluate(()=>{performUndo();performUndo();});assert.equal(await page.evaluate(()=>nodes.some(node=>smartPendingTasks(node).length)),false);
    await page.evaluate(()=>saveCanvas({force:true}));await page.reload();await page.waitForFunction(()=>canvas?.id==='canvas-test');
    assert.equal(await page.evaluate(()=>nodes.some(node=>smartPendingTasks(node).length)),false);
    assert.equal(await page.evaluate(()=>nodes.some(node=>node.images.some(item=>/generated\.(mp3|glb)$/.test(item.url)))),false);
    assert.equal(api.calls.length,1);assert.deepEqual(errors,[]);
});

for(const kind of ['audio','model'])test(kind+' delivery failure retries the original receipt and leaves undo durable',async t=>{
    const api=await setup(t,kind);api.failDelta(true);await generate(api.page,kind);
    await api.page.waitForFunction(kind=>!window[kind==='audio'?'PixmaxAudioCreation':'PixmaxModelCreation'].busy(),kind);
    assert.equal(await api.page.evaluate(()=>nodes[0].images.length),0);assert.equal(await api.page.evaluate(()=>smartPendingTasks(nodes[0]).length),1);
    assert.equal(await api.page.evaluate(()=>canvas.task_result_version||0),0);
    api.failDelta(false);await generate(api.page,kind);await finished(api.page,kind);await api.page.evaluate(()=>performUndo());
    assert.equal(await api.page.evaluate(()=>saveCanvas({force:true})),true);assert.equal(api.record.nodes[0].images.length,0);assert.equal(api.calls.length,1);assert.deepEqual(api.errors,[]);
});

for(const change of ['input','lease','workspace','close'])test('pending 3D delivery cannot advance the cursor or edit history after '+change,async t=>{
    const api=await setup(t,'model',{held:true});await generate(api.page,'model');await api.arrived;
    const history=await api.page.evaluate(()=>JSON.stringify(undoStack));
    if(change==='input')await api.page.getByRole('textbox',{name:'3D 模型描述'}).fill('已改写的描述');
    if(change==='lease')await api.page.evaluate(()=>MemberCanvasEdit.setEditable(false));
    if(change==='workspace')await api.page.evaluate(()=>CanvasSession.context.workspace.id='other-workspace');
    if(change==='close')await api.page.getByRole('button',{name:'关闭3D 生成',exact:true}).click();
    // Input editing adds its own draft history; delivery itself may not alter it.
    const updated=await api.page.evaluate(()=>JSON.stringify(undoStack));api.release();await api.page.waitForFunction(()=>!PixmaxModelCreation.busy());
    assert.equal(await api.page.evaluate(()=>canvas.task_result_version||0),0);assert.equal(await api.page.evaluate(()=>nodes[0].images.length),0);
    assert.equal(await api.page.evaluate(()=>JSON.stringify(undoStack)),updated);if(change!=='input')assert.equal(updated,history);
    assert.equal(api.calls.length,1);assert.deepEqual(api.errors,[]);
});

test('invalid delivery batches cannot apply a sibling or acknowledge unseen output',async t=>{
    const api=await setup(t,'model',{sibling:true});api.mutateDelta(delta=>({...delta,deliveries:[delta.deliveries[0],{...delta.deliveries[1],node:{id:'invalid',images:[{kind:'model'}]}}]}));
    await generate(api.page,'model');await api.page.waitForFunction(()=>!PixmaxModelCreation.busy());
    assert.equal(await api.page.evaluate(()=>nodes.length),1);assert.equal(await api.page.evaluate(()=>nodes[0].images.length),0);assert.equal(await api.page.evaluate(()=>canvas.task_result_version||0),0);
    assert.equal(await api.page.evaluate(()=>smartPendingTasks(nodes[0]).length),1);assert.deepEqual(api.errors,[]);
});

for(const kind of ['audio','model'])test(kind+' background recovery uses the same delivery acknowledgment and undo history',async t=>{
    const api=await setup(t,kind);api.failDelta(true);await generate(api.page,kind);
    await api.page.waitForFunction(kind=>!window[kind==='audio'?'PixmaxAudioCreation':'PixmaxModelCreation'].busy(),kind);
    await api.page.getByRole('button',{name:kind==='audio'?'关闭音频生成':'关闭3D 生成',exact:true}).click();api.failDelta(false);
    await api.page.evaluate(async task=>{const recovery=smartTaskRecovery();await recovery.apply(recovery.list()[0],task,()=>true);},api.task());
    await api.page.evaluate(()=>performUndo());assert.equal(await api.page.evaluate(()=>saveCanvas({force:true})),true);
    assert.equal(api.record.nodes[0].images.length,0);assert.equal(api.record.nodes[0].pendingTasks.length,0);assert.equal(api.calls.length,1);assert.deepEqual(api.errors,[]);
});
