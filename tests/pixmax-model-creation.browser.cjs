const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');

async function setup(t,options={}){
    const result=await fixture(t,'smart',true,{secureOrigin:true,...options});
    await result.page.addScriptTag({url:'/static/js/canvas-task-bindings.js'});
    await result.page.addScriptTag({url:'/static/js/member-media.js'});
    await result.page.evaluate(()=>{
        apiProviders=[{id:'model',name:'混元测试',has_key:true,model_models:['3.0','3.1']}];
        Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});
        Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});
    });
    await result.page.route('**/generated-model.glb',route=>route.fulfill({path:path.resolve('tests/fixtures/pixmax-generated-model.glb'),contentType:'model/gltf-binary'}));
    return result;
}
async function service(page,{held=false,status=200}={}){
    const calls=[],records=new Map();let release,seen;
    const gate=new Promise(resolve=>release=resolve),polling=new Promise(resolve=>seen=resolve);
    await page.route('**/api/canvas-model-tasks**',async route=>{
        const request=route.request();
        if(request.method()==='POST'){
            const payload=request.postDataJSON(),target=payload.canvas_target;calls.push(payload);
            const record={id:payload.client_task_id,status:'succeeded',canvas_edit_generation:1,result:{models:['/generated-model.glb']},
                canvas_binding:{version:3,canvas_id:payload.canvas_id,canvas_kind:'smart',source_node_id:target.source_node_id,target_node_id:target.target_node_id,
                    submitted_revision:target.base_revision,graph_sha256:target.input_sha256,request_sha256:'a'.repeat(64)}};
            records.set(record.id,record);
            return route.fulfill({status,json:status===200?{task_id:record.id,status:'queued',canvas_binding:record.canvas_binding}:{detail:'任务未确认'}});
        }
        seen();if(held)await gate;
        return route.fulfill({json:records.get(new URL(request.url()).pathname.split('/').pop())});
    });
    return {calls,records,polling,release};
}
async function open(page,count=0){
    await page.evaluate(count=>{
        const target=createSmartStudioNode('model',{x:600,y:300});target.title='我的 3D';
        for(let i=0;i<count;i++){
            const source=createNode(80+i*100,100,[{url:'/test-image.svg?v='+i,name:'视角 '+i,kind:'image'}],{select:false});
            canvas.connections.push({from:source.id,to:target.id,kind:'input'});
        }
        openSmartStudio(target.id);
    },count);
    if(!count)await page.getByRole('textbox',{name:'3D 模型描述'}).fill('一只陶瓷小猫');
}
async function finished(page){await page.waitForFunction(()=>nodes.some(node=>node.type==='smart-model'&&node.images.length===1));}

test('text inputs and controls produce a saved GLB node preserving title, size and undo',async t=>{
    const {page,errors,record}=await setup(t),api=await service(page);await open(page);
    const size=await page.evaluate(()=>{const source=createPromptNode(80,100,{select:false});source.text='刚更新的文本';canvas.connections.push({from:source.id,to:nodes[0].id,kind:'input'});return [nodes[0].w,nodes[0].h];});
    await page.getByRole('combobox',{name:'PBR 材质'}).selectOption('true');
    await page.getByRole('combobox',{name:'模型面数'}).selectOption('500000');
    await page.locator('[data-model-run]').click();await finished(page);
    assert.equal(api.calls.length,1);assert.match(api.calls[0].prompt,/刚更新的文本/);assert.equal(api.calls[0].enable_pbr,true);assert.equal(api.calls[0].face_count,500000);
    await page.evaluate(()=>saveCanvas({force:true}));assert.equal(record.nodes[0].title,'我的 3D');assert.deepEqual([record.nodes[0].w,record.nodes[0].h],size);
    assert.equal(record.nodes[0].images[0].kind,'model');assert.match(record.nodes[0].images[0].name,/\.glb$/);assert.equal(record.nodes[0].modelGeneration.face_count,500000);
    await page.evaluate(()=>performUndo());assert.equal(await page.evaluate(()=>nodes[0].images.length),0);assert.deepEqual(errors,[]);
});

for(const version of ['3.0','3.1'])test('multi-view '+version+' pairs each image with its view and puts the chosen front first',async t=>{
    const {page,errors}=await setup(t),api=await service(page);await open(page,3);
    await page.getByRole('combobox',{name:'3D 模型',exact:true}).selectOption(version);
    await page.getByRole('combobox',{name:'参考图片 1 视角'}).selectOption(version==='3.0'?'back':'top');
    await page.getByRole('combobox',{name:'参考图片 2 视角'}).selectOption('front');
    await page.getByRole('combobox',{name:'参考图片 3 视角'}).selectOption(version==='3.0'?'left':'left_front');
    if(version==='3.1')await page.screenshot({path:'.local/pixmax-model-creation.png'});
    // Array order changes must not silently switch the input view assignment.
    await page.evaluate(()=>nodes.reverse());
    await page.locator('[data-model-run]').click();await finished(page);
    assert.deepEqual(api.calls[0].images,['/test-image.svg?v=1','/test-image.svg?v=0','/test-image.svg?v=2']);
    assert.deepEqual(api.calls[0].view_types,['front',version==='3.0'?'back':'top',version==='3.0'?'left':'left_front']);
    await page.evaluate(()=>saveCanvas({force:true}));await page.reload();await page.waitForFunction(()=>nodes.length===4);
    await page.evaluate(()=>{apiProviders=[{id:'model',has_key:true,model_models:['3.0','3.1']}];openSmartStudio(nodes.find(node=>node.type==='smart-model').id);});
    assert.equal(await page.getByRole('combobox',{name:'参考图片 1 视角'}).inputValue(),version==='3.0'?'back':'top');assert.equal(await page.getByRole('combobox',{name:'参考图片 2 视角'}).inputValue(),'front');assert.deepEqual(errors,[]);
});

test('single image, LowPoly polygons and version restrictions follow the native model contract',async t=>{
    const {page,errors}=await setup(t),api=await service(page);await open(page,1);
    await page.getByRole('combobox',{name:'3D 生成类型'}).selectOption('LowPoly');
    await page.getByRole('combobox',{name:'网格类型'}).selectOption('quadrilateral');
    await page.locator('[data-model-run]').click();await finished(page);
    assert.equal(api.calls[0].mode,'image');assert.equal(api.calls[0].face_count,0);assert.equal(api.calls[0].polygon_type,'quadrilateral');assert.equal(api.calls[0].prompt,'');
    await page.getByRole('combobox',{name:'3D 模型',exact:true}).selectOption('3.1');
    assert.deepEqual(await page.getByRole('combobox',{name:'3D 生成类型'}).locator('option').evaluateAll(items=>items.map(item=>item.value)),['Normal','Geometry']);
    await page.getByRole('combobox',{name:'3D 生成类型'}).selectOption('Geometry');assert.equal(await page.getByRole('combobox',{name:'PBR 材质'}).inputValue(),'false');assert.equal(await page.getByRole('combobox',{name:'PBR 材质'}).isDisabled(),true);assert.deepEqual(errors,[]);
});

for(const change of ['input','reference','view','lease','workspace','close'])test('delayed 3D completion refuses stale '+change+' and retains the original task',async t=>{
    const {page,errors}=await setup(t),api=await service(page,{held:true});await open(page,change==='view'?2:0);
    if(change==='reference')await page.evaluate(()=>{const source=createPromptNode(80,100,{select:false});source.text='原参考';canvas.connections.push({from:source.id,to:nodes[0].id,kind:'input'});});
    await page.locator('[data-model-run]').click();await api.polling;
    if(change==='input')await page.getByRole('textbox',{name:'3D 模型描述'}).fill('修改后的模型');
    if(change==='reference')await page.evaluate(()=>nodes[1].text='已修改参考');
    if(change==='view')await page.getByRole('combobox',{name:'参考图片 2 视角'}).selectOption('back');
    if(change==='lease')await page.evaluate(()=>MemberCanvasEdit.setEditable(false));
    if(change==='workspace')await page.evaluate(()=>CanvasSession.context.workspace.id='other-workspace');
    if(change==='close')await page.getByRole('button',{name:'关闭3D 生成',exact:true}).click();
    api.release();await page.waitForFunction(()=>!PixmaxModelCreation.busy());
    assert.equal(await page.evaluate(()=>nodes[0].images.length),0);assert.equal(api.calls.length,1);
    assert.equal(await page.evaluate(()=>smartPendingTasks(nodes[0])[0]?.taskId),api.calls[0].client_task_id);assert.deepEqual(errors,[]);
});

test('ambiguous admission queries the original task even when the provider inventory is unavailable',async t=>{
    const {page,errors}=await setup(t),api=await service(page,{status:503});await open(page);
    await page.locator('[data-model-run]').click();await page.waitForFunction(()=>!PixmaxModelCreation.busy()&&smartPendingTasks(nodes[0]).length===1);
    await page.getByRole('button',{name:'关闭3D 生成',exact:true}).click();await page.evaluate(()=>{apiProviders=[];openSmartStudio(nodes[0].id);});
    await page.getByRole('button',{name:'查询已有 3D 任务',exact:true}).click();await finished(page);assert.equal(api.calls.length,1);assert.deepEqual(errors,[]);
});

test('invalid modes and duplicate views are rejected before admission',async t=>{
    const {page,errors}=await setup(t),api=await service(page);await open(page,2);
    await page.getByRole('combobox',{name:'参考图片 2 视角'}).selectOption('front');await page.locator('[data-model-run]').click();assert.equal(api.calls.length,0);
    await page.getByRole('combobox',{name:'3D 生成模式'}).selectOption('image');await page.locator('[data-model-run]').click();assert.equal(api.calls.length,0);
    await page.getByRole('combobox',{name:'3D 生成模式'}).selectOption('text');await page.getByRole('textbox',{name:'3D 模型描述'}).fill('陶瓷');await page.locator('[data-model-run]').click();assert.equal(api.calls.length,0);assert.deepEqual(errors,[]);
});

test('saved pending model recovers on reload without another submission',async t=>{
    const {page,errors}=await setup(t),api=await service(page,{status:503});await open(page);
    await page.locator('[data-model-run]').click();await page.waitForFunction(()=>!PixmaxModelCreation.busy()&&smartPendingTasks(nodes[0]).length===1);
    await page.evaluate(()=>saveCanvas({force:true}));await page.reload();await page.waitForFunction(()=>nodes.length===1);
    await page.addScriptTag({url:'/static/js/canvas-task-bindings.js'});await page.evaluate(()=>Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}}));
    await page.evaluate(async task=>{const recovery=smartTaskRecovery();await recovery.apply(recovery.list()[0],task,()=>true);},[...api.records.values()][0]);
    await finished(page);assert.equal(await page.evaluate(()=>saveCanvas({force:true})),true);assert.equal(api.calls.length,1);assert.deepEqual(errors,[]);
});

test('native import maps 3D parameters and assets without foreign task state',async t=>{
    const {page,errors}=await setup(t);
    const converted=await page.evaluate(()=>PixmaxWorkflow.convert({nodes:[
        {uuid:'generator',type:'GENERATE_3D',params:{model:'HUNYUAN_3D_PRO_31',referModel:'multiTo3D',generateType:'Geometry',enablePBR:true,faceCount:500000,prompt:'陶瓷'},generatingTask:{id:'foreign'}},
        {uuid:'asset',type:'BASE_3D',defaultAsset:{webUrl:'/generated-model.glb',type:'model',metaData:{name:'cube.glb'}}}]}));
    assert.equal(converted.nodes[0].modelGeneration.model,'3.1');assert.equal(converted.nodes[0].modelGeneration.mode,'multi');assert.equal(converted.nodes[0].modelGeneration.face_count,500000);assert.equal(converted.nodes[0].generatingTask,undefined);
    assert.equal(converted.nodes[0].modelGeneration.enable_pbr,true);assert.equal(converted.nodes[1].images[0].url,'/generated-model.glb');assert.equal(converted.nodes[1].type,'smart-model');assert.equal(converted.nodes[1].pixmaxSourceType,'BASE_3D');assert.deepEqual(errors,[]);
});

test('workflow import and clipboard copies keep model parameters and view URLs while remapping graph IDs',async t=>{
    const {page,errors}=await setup(t);
    const result=await page.evaluate(()=>{
        const workflow={nodes:[{id:'source',type:'smart-image',images:[{url:'/test-image.svg',kind:'image'}],x:100,y:100},
            {id:'model',type:'smart-model',images:[],x:500,y:100,modelGeneration:{model:'3.1',mode:'multi',generate_type:'Geometry',face_count:500000},modelViews:[{url:'/test-image.svg',view:'front'}],pendingTasks:[{taskId:'foreign',kind:'model'}]}],connections:[{from:'source',to:'model',kind:'input'}]};
        insertSmartWorkflowIntoCanvas(workflow);copySelectedNodes();pasteNodes({includeConnections:true});
        return {ids:nodes.map(node=>node.id),connections:canvas.connections,models:nodes.filter(node=>node.type==='smart-model').map(node=>({params:node.modelGeneration,views:node.modelViews,pending:smartPendingTasks(node)}))};
    });
    assert.equal(new Set(result.ids).size,4);assert.deepEqual(result.connections.map(edge=>[edge.from,edge.to]),[[result.ids[0],result.ids[1]],[result.ids[2],result.ids[3]]]);
    for(const model of result.models){assert.equal(model.params.model,'3.1');assert.equal(model.params.face_count,500000);assert.deepEqual(model.views,[{url:'/test-image.svg',view:'front'}]);assert.deepEqual(model.pending,[]);}assert.deepEqual(errors,[]);
});

test('readonly GLB preview renders real geometry, rotates, zooms, resets and downloads; close releases resources',async t=>{
    // Chrome's same-origin direct downloads bypass Playwright routing. Serve
    // those bytes on loopback instead of substituting a blob or proxy download.
    const fs=require('node:fs'),http=require('node:http'),bytes=fs.readFileSync('tests/fixtures/pixmax-generated-model.glb');
    let directDownload=false;
    const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://127.0.0.1');if(url.pathname!=='/assets/cloud/ast_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/original'||url.searchParams.get('workspace')!=='workspace-1'||url.searchParams.get('member')!=='member-1'){res.writeHead(404);res.end();return;}directDownload=true;res.writeHead(200,{'Content-Type':'model/gltf-binary','Content-Disposition':'attachment; filename="cube.glb"','Content-Length':bytes.length});res.end(bytes);});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
    const {page,errors}=await setup(t,{origin:'http://127.0.0.1:'+server.address().port,permissions:['canvas.read','canvas.edit','canvas.export'],record:{nodes:[{id:'model',type:'smart-model',pixmaxSourceType:'BASE_3D',x:300,y:200,images:[{url:'/assets/cloud/ast_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/original',name:'cube.glb',kind:'model'}]}]}});
    const modelRoute=route=>{
        const url=new URL(route.request().url());assert.equal(url.searchParams.get('workspace'),'workspace-1');assert.equal(url.searchParams.get('member'),'member-1');
        return route.fulfill({path:path.resolve('tests/fixtures/pixmax-generated-model.glb'),contentType:'model/gltf-binary',headers:{'Content-Disposition':'attachment; filename="cube.glb"'}});
    };
    await page.route('**/assets/cloud/ast_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/original**',modelRoute);
    await page.context().route('**/assets/cloud/ast_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/original**',modelRoute);
    assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').some(item=>item.name.includes('/vendor/pixmax/editors.js'))),false);
    await page.evaluate(()=>{MemberCanvasEdit.setEditable(false);render();});await page.locator('[data-studio-model-preview]').click();
    await page.waitForFunction(()=>PixmaxModelPreview.state.triangles===12);
    await page.waitForFunction(()=>PixmaxModelPreview.state.frame===0);
    const before=await page.evaluate(()=>PixmaxModelPreview.state.camera),view=page.getByLabel('3D 模型视图'),box=await view.boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+100,box.y+box.height/2+40,{steps:10});await page.mouse.up();
    await page.waitForFunction(original=>JSON.stringify(PixmaxModelPreview.state.camera)!==JSON.stringify(original),before);
    await page.getByRole('button',{name:'复位',exact:true}).click();await page.waitForFunction(original=>PixmaxModelPreview.state.camera.every((v,i)=>Math.abs(v-original[i])<.001),before);
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,200);await page.waitForFunction(original=>JSON.stringify(PixmaxModelPreview.state.camera)!==JSON.stringify(original),before);
    await page.screenshot({path:'.local/pixmax-model-preview.png'});
    const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'下载模型',exact:true}).click();const download=await downloaded;assert.equal(download.suggestedFilename(),'cube.glb');
    assert.deepEqual(fs.readFileSync(await download.path()),bytes);assert.equal(directDownload,true);
    await page.evaluate(()=>{window.modelContextReleased=false;document.querySelector('.pixmax-model-preview canvas').addEventListener('webglcontextlost',()=>window.modelContextReleased=true);});
    await page.getByRole('button',{name:'关闭 3D 模型预览',exact:true}).click();await page.waitForFunction(()=>window.modelContextReleased);assert.equal(await page.evaluate(()=>PixmaxModelPreview.state.opened),false);assert.equal(await page.locator('.pixmax-model-preview').count(),0);assert.deepEqual(errors,[]);
});

test('closing a loading preview and deleting its source cannot leave an orphan renderer',async t=>{
    const {page,errors}=await setup(t,{record:{nodes:[{id:'model',type:'smart-model',x:300,y:200,images:[{url:'/generated-model.glb',kind:'model'}]}]}});
    let release,seen;const gate=new Promise(resolve=>release=resolve),requested=new Promise(resolve=>seen=resolve);
    await page.route('**/generated-model.glb',async route=>{seen();await gate;try{await route.fulfill({path:path.resolve('tests/fixtures/pixmax-generated-model.glb'),contentType:'model/gltf-binary'});}catch{}});
    await page.locator('[data-studio-model-preview]').click();await requested;await page.getByRole('button',{name:'关闭 3D 模型预览',exact:true}).click();release();
    await page.locator('[data-studio-model-preview]').click();await page.waitForFunction(()=>PixmaxModelPreview.state.triangles===12);
    await page.evaluate(()=>{nodes=[];render();});assert.equal(await page.evaluate(()=>PixmaxModelPreview.state.opened),false);assert.deepEqual(errors,[]);
});
