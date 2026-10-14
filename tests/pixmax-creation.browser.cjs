const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');

async function setup(t){
    const result=await fixture(t,'smart',true,{secureOrigin:true});
    for(const file of ['canvas-task-bindings.js','canvas-llm-tasks.js'])await result.page.addScriptTag({url:'/static/js/'+file});
    await result.page.evaluate(()=>{
        apiProviders=[{id:'writer',name:'测试文本服务',enabled:true,has_key:true,chat_models:['writer-model']}];
        Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});
        Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});
    });
    return result;
}
async function textService(page,replies,{held=false}={}){
    const calls=[],records=new Map();let release,seenPoll;
    const gate=new Promise(resolve=>release=resolve),polling=new Promise(resolve=>seenPoll=resolve);
    await page.route('**/api/canvas-llm-tasks**',async route=>{
        const request=route.request();
        if(request.method()==='POST'){
            const payload=request.postDataJSON(),target=payload.canvas_target;
            calls.push(payload);
            const record={id:payload.client_task_id,status:'succeeded',result:{text:replies[Math.min(calls.length-1,replies.length-1)]},
                canvas_binding:{version:3,canvas_id:payload.canvas_id,canvas_kind:'smart',source_node_id:target.source_node_id,target_node_id:target.target_node_id,submitted_revision:target.base_revision,graph_sha256:target.input_sha256,request_sha256:'a'.repeat(64)}};
            records.set(record.id,record);return route.fulfill({json:{...record,task_id:record.id}});
        }
        seenPoll();if(held)await gate;
        const id=new URL(request.url()).pathname.split('/').pop();return route.fulfill({json:records.get(id)});
    });
    return {calls,polling,release};
}

test('native Pixmax JSON import preserves typed media, prompt and remapped input links through reload and undo',async t=>{
    const {page,errors}=await setup(t);
    const source={data:{nodes:[
        {uuid:'original-text',type:'GENERATE_TEXT',nodeText:'故事文本',params:{prompt:'创作要求'},metaData:JSON.stringify({position:{x:100,y:100},width:240,height:240})},
        {uuid:'original-image',type:'GENERATE_IMAGE',params:{prompt:'<img onerror=alert(1)>电影画面',model:'picture',resolution:'2k',aspectRatio:'16:9'},prevNodeUuids:['original-text'],defaultAsset:{webUrl:'/test-image.svg',type:'IMAGE',width:320,height:240},metaData:JSON.stringify({position:{x:500,y:100}}),generatingTask:{id:'foreign-paid-task'}}
    ]}};
    await page.evaluate(async value=>{await importSmartWorkflowFile(new File([JSON.stringify(value)],'pixmax-canvas.json',{type:'application/json'}));},source);
    const imported=await page.evaluate(()=>nodes.map(node=>({id:node.id,type:node.type,text:node.text,inputs:node.inputNodeIds,prompt:node.promptDraftText,foreign:node.generatingTask})));
    assert.equal(imported[0].type,'smart-prompt');assert.equal(imported[0].text,'故事文本');assert.notEqual(imported[0].id,'original-text');
    assert.deepEqual(imported[1].inputs,[imported[0].id]);assert.equal(imported[1].prompt,source.data.nodes[1].params.prompt);assert.equal(imported[1].foreign,undefined);
    assert.deepEqual(await page.evaluate(()=>({ratio:nodes[1].runSettings.ratio,resolution:nodes[1].runSettings.resolution})),{ratio:'wide',resolution:'2k'});
    assert.equal(await page.locator('#promptInput img').count(),0);
    await page.evaluate(()=>performUndo());assert.equal(await page.evaluate(()=>nodes.length),0);
    await page.evaluate(value=>insertSmartWorkflowIntoCanvas(value),source);await page.evaluate(()=>saveCanvas({force:true}));
    await page.reload();await page.waitForFunction(()=>nodes.length===2);
    assert.equal(await page.evaluate(()=>canvas.connections[0].from===nodes[0].id&&nodes[1].inputNodeIds[0]===nodes[0].id),true);assert.deepEqual(errors,[]);
});

test('text generation uses saved input receipts and updates the existing text node',async t=>{
    const {page,errors,record}=await setup(t),service=await textService(page,['电影剧本已生成']);
    await page.evaluate(()=>{const node=createPromptNode(200,150);node.text='原始内容';openPixmaxTextGeneration(node);});
    await page.getByRole('textbox',{name:'文本创作要求',exact:true}).fill('写一个电影开场');
    await page.locator('[data-text-run]').click();
    await page.waitForFunction(()=>nodes[0].text==='电影剧本已生成');
    assert.equal(service.calls.length,1);assert.equal(service.calls[0].provider_id,'writer');assert.equal(service.calls[0].model,'writer-model');
    assert.equal(service.calls[0].canvas_target.source_node_id,await page.evaluate(()=>nodes[0].id));
    await page.evaluate(()=>saveCanvas({force:true}));assert.equal(record.nodes[0].text,'电影剧本已生成');assert.ok(record.nodes[0].result_task_id);assert.deepEqual(errors,[]);
});

test('text generation captures current upstream references at submission rather than modal opening',async t=>{
    const {page,errors}=await setup(t),service=await textService(page,['新引用生成结果']);
    await page.evaluate(()=>{
        const source=createPromptNode(100,150,{select:false}),target=createPromptNode(440,150);source.text='打开时的引用';
        canvas.connections.push({from:source.id,to:target.id,kind:'input'});openPixmaxTextGeneration(target);
        source.text='提交时的引用';
    });
    await page.getByRole('textbox',{name:'文本创作要求',exact:true}).fill('依据最新输入创作');
    await page.locator('[data-text-run]').click();await page.waitForFunction(()=>nodes[1].text==='新引用生成结果');
    assert.match(service.calls[0].message,/提交时的引用/);assert.doesNotMatch(service.calls[0].message,/打开时的引用/);assert.deepEqual(errors,[]);
});

test('storyboard generates shots, prepares assets and generates prompts through three durable tasks',async t=>{
    const {page,errors}=await setup(t);
    const shots=[{duration:4,description:'雨夜街道',size:'全景',movement:'推进'},{duration:6,description:'人物回头',size:'近景',movement:'固定'}];
    const service=await textService(page,[JSON.stringify({shots}),JSON.stringify({shots:shots.map((shot,index)=>({...shot,asset:'角色和街景 '+index}))}),JSON.stringify({shots:shots.map((shot,index)=>({...shot,prompt:'电影画面提示词 '+index}))})]);
    await page.evaluate(()=>openSmartStoryboard(createSmartStudioNode('storyboard',{x:400,y:250})));
    await page.getByRole('textbox',{name:'分镜故事剧本'}).fill('一个人在雨夜寻找旧友');await page.getByRole('spinbutton',{name:'分镜镜头数量'}).fill('2');
    await page.getByRole('button',{name:'自动拆分镜头'}).click();await page.waitForFunction(()=>nodes[0].shots.length===2);
    await page.getByRole('button',{name:'2 准备资产',exact:true}).click();await page.getByRole('button',{name:'生成资产说明',exact:true}).click();
    await page.waitForFunction(()=>nodes[0].shots[0].asset==='角色和街景 0');
    await page.getByRole('button',{name:'3 生成提示词',exact:true}).click();await page.getByRole('button',{name:'生成镜头提示词',exact:true}).click();
    await page.waitForFunction(()=>nodes[0].shots[0].prompt==='电影画面提示词 0');
    await page.getByRole('button',{name:'插入画布',exact:true}).click();
    const result=await page.evaluate(()=>({count:nodes.length,links:canvas.connections.length,text:nodes.slice(1).map(node=>node.text),shots:nodes[0].shots}));
    assert.equal(result.count,3);assert.equal(result.links,2);assert.deepEqual(result.text,['电影画面提示词 0','电影画面提示词 1']);assert.equal(result.shots[0].duration,4);assert.equal(result.shots[0].asset,'角色和街景 0');assert.equal(service.calls.length,3);assert.deepEqual(errors,[]);
});

for(const change of ['input','lease','close'])test('text generation refuses delayed results after '+change,async t=>{
    const {page,errors}=await setup(t),service=await textService(page,['迟到的回复'],{held:true});
    await page.evaluate(()=>{const node=createPromptNode(200,150);node.text='保留文本';openPixmaxTextGeneration(node);});
    await page.getByRole('textbox',{name:'文本创作要求'}).fill('第一条创作要求');await page.locator('[data-text-run]').click();await service.polling;
    if(change==='input')await page.getByRole('textbox',{name:'文本创作要求'}).fill('新的创作要求');
    if(change==='lease')await page.evaluate(()=>MemberCanvasEdit.setEditable(false));
    if(change==='close')await page.getByRole('button',{name:'关闭文本生成'}).click();
    service.release();
    await page.waitForFunction(()=>!pixmaxTextJobs.has(nodes[0]));
    assert.equal(await page.evaluate(()=>nodes[0].text),'保留文本');assert.equal(service.calls.length,1);assert.equal(await page.evaluate(()=>nodes[0].result_task_id),undefined);assert.deepEqual(errors,[]);
});

test('invalid storyboard reply preserves manually edited shots and reports a useful error',async t=>{
    const {page,errors}=await setup(t);await textService(page,['{"shots":[{"duration":-1,"description":"错误镜头"}]}']);
    await page.evaluate(()=>{const node=createSmartStudioNode('storyboard',{x:400,y:250});node.shots=[{duration:7,description:'已有镜头'}];openSmartStoryboard(node);});
    await page.getByRole('textbox',{name:'分镜故事剧本'}).fill('剧本');await page.getByRole('button',{name:'自动拆分镜头'}).click();
    await page.getByRole('status').filter({hasText:'镜头时长'}).waitFor();
    assert.deepEqual(await page.evaluate(()=>nodes[0].shots),[{duration:7,description:'已有镜头'}]);assert.deepEqual(errors,[]);
});

test('pin summary locates saved nodes and assistant uses pinned context then inserts its reply',async t=>{
    const {page,errors,record}=await setup(t),service=await textService(page,['以雨夜为主题的创作提示词']);
    await page.evaluate(()=>{const node=createPromptNode(120,160,{select:false});node.text='雨夜的街景';node.label='参考故事';node.pinned=true;clearSelection();render();});
    await page.getByRole('button',{name:'pin汇总',exact:true}).click();await page.getByRole('button',{name:'定位 参考故事',exact:true}).click();
    assert.equal(await page.evaluate(()=>selectedNode().label),'参考故事');
    await page.getByRole('button',{name:'打开创作助手',exact:true}).click();await page.getByRole('textbox',{name:'助手创作要求'}).fill('写一段画面提示词');await page.getByRole('button',{name:'发送',exact:true}).click();
    await page.getByRole('button',{name:'插入文本节点',exact:true}).waitFor({timeout:5000}).catch(async error=>{throw new Error(error.message+'; assistant: '+await page.locator('#pixmaxAssistantPanel').innerText()+'; requests: '+service.calls.length+'; errors: '+errors.join('; '));});
    assert.match(service.calls[0].message,/写一段画面提示词/);assert.match(service.calls[0].message,/雨夜的街景/);
    await page.getByRole('button',{name:'插入文本节点',exact:true}).click();
    assert.equal(await page.evaluate(()=>nodes[1].text),'以雨夜为主题的创作提示词');
    await page.evaluate(()=>saveCanvas({force:true}));assert.equal(record.nodes[0].pinned,true);assert.equal(record.nodes[0].assistantMessages.length,2);assert.deepEqual(errors,[]);
});

test('image canvas defers the native runtime until a video player is needed',async t=>{
    const {page,errors}=await fixture(t,'smart',false),requests=[];page.on('request',request=>requests.push(new URL(request.url()).pathname));
    const initial=await page.evaluate(()=>performance.getEntriesByType('resource').map(item=>new URL(item.name).pathname));assert.equal(initial.includes('/static/vendor/pixmax/editors.js'),false);
    await page.route('**/native.webm',route=>route.fulfill({path:path.resolve('tests/fixtures/smart-preview.webm'),contentType:'video/webm'}));
    await page.evaluate(()=>createNode(200,160,[{url:'/native.webm',kind:'video',natural_w:320,natural_h:240}],{select:false}));
    await page.locator('.pixmax-inline-video').waitFor();
    assert.equal(requests.filter(path=>path==='/static/vendor/pixmax/editors.js').length,1);assert.deepEqual(errors,[]);
});

test('native image thumbnails load on the canvas and in the node list while the full viewer keeps the original',async t=>{
    const {page,errors}=await fixture(t,'smart',false),calls=[];
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#90acb0"/></svg>';
    await page.route('**/api/download-output?**',route=>{const url=new URL(route.request().url()).searchParams.get('url');calls.push(url);return route.fulfill({contentType:'image/svg+xml',body:svg});});
    await page.evaluate(()=>{
        insertSmartWorkflowIntoCanvas({nodes:[{uuid:'native-image',type:'BASE_IMAGE',defaultAsset:{type:'IMAGE',webUrl:'/static/img/original.png',thumbnailWebUrl:'/static/img/thumbnail.webp',width:320,height:180}}]});
        nodes[0].x=650;nodes[0].y=180;render();
    });
    await page.waitForFunction(()=>document.querySelector('.image-node img')?.naturalWidth>0);
    assert.ok(calls.some(url=>url.endsWith('/static/img/thumbnail.webp')));assert.equal(calls.some(url=>url.endsWith('/static/img/original.png')),false);
    const urls=await page.evaluate(()=>({preview:smartMediaPreviewUrl(nodes[0].images[0],768),large:smartMediaPreviewUrl(nodes[0].images[0],2048),raw:nodes[0].images[0].url}));
    assert.match(urls.preview,/thumbnail/);assert.match(urls.large,/original/);assert.equal(urls.raw,'https://pixmax-prod.oss-accelerate.aliyuncs.com/static/img/original.png');
    await page.getByRole('button',{name:'画布目录',exact:true}).click();await page.getByRole('tab',{name:'节点',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-node-row] img')?.naturalWidth>0);
    assert.equal(calls.some(url=>url.endsWith('/static/img/original.png')),false);
    await page.evaluate(()=>openImageEditor(nodes[0].id));await page.waitForFunction(()=>smartImageEditor.state.ready);
    assert.ok(calls.some(url=>url.endsWith('/static/img/original.png')));assert.deepEqual(errors,[]);
});

test('native inline video uses its preview stream and image poster while retaining the original source',async t=>{
    const {page,errors}=await fixture(t,'smart',false),calls=[];
    await page.route('**/api/download-output?**',route=>{
        const url=new URL(route.request().url()).searchParams.get('url');calls.push(url);
        if(url.endsWith('.jpg'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#5a7875"/></svg>'});
        return route.fulfill({path:path.resolve('tests/fixtures/smart-preview.webm'),contentType:'video/webm'});
    });
    await page.evaluate(()=>{
        insertSmartWorkflowIntoCanvas({nodes:[{uuid:'clip',type:'BASE_VIDEO',defaultAsset:{fileType:'VIDEO',webUrl:'/static/video/original.webm',thumbnailWebUrl:'/static/video/poster.jpg',thumbnailVideoWebUrl:'/static/video/preview.webm',width:320,height:180}}]});
        nodes[0].x=650;nodes[0].y=180;render();
    });
    await page.locator('.pixmax-inline-video').waitFor();
    const source=await page.locator('.pixmax-inline-video').getAttribute('src'),poster=await page.locator('.pixmax-player-mount').getAttribute('data-poster');
    assert.ok(new URL(source,page.url()).searchParams.get('url').endsWith('/static/video/preview.webm'));assert.ok(new URL(poster,page.url()).searchParams.get('url').endsWith('/static/video/poster.jpg'));
    assert.equal(await page.evaluate(()=>nodes[0].images[0].url),'https://pixmax-prod.oss-accelerate.aliyuncs.com/static/video/original.webm');
    await page.locator('.pixmax-player-mount .play-toggle').click();await page.waitForFunction(()=>!document.querySelector('.pixmax-inline-video').paused);
    assert.ok(calls.some(url=>url.endsWith('/static/video/poster.jpg')));assert.deepEqual(errors,[]);
});

test('video card can be selected before the runtime loads and native playback still works afterwards',async t=>{
    const {page,errors}=await fixture(t,'smart',false);let release,loading;
    const gate=new Promise(resolve=>release=resolve),requested=new Promise(resolve=>loading=resolve);
    await page.route('**/static/vendor/pixmax/editors.js',async route=>{loading();await gate;return route.fallback();});
    await page.route('**/loading.webm',route=>route.fulfill({path:path.resolve('tests/fixtures/smart-preview.webm'),contentType:'video/webm'}));
    await page.evaluate(()=>{createNode(200,160,[{url:'/loading.webm',kind:'video',natural_w:320,natural_h:240}],{select:false});clearSelection();render();});
    await requested;await page.locator('.node-body').click();
    assert.equal(await page.evaluate(()=>smartSelection.nodeId===nodes[0].id),true);
    assert.equal(await page.locator('#imageEditModal').isVisible(),false);
    release();await page.locator('.pixmax-inline-video').waitFor();
    await page.locator('.pixmax-player-mount .play-toggle').click();
    await page.waitForFunction(()=>!document.querySelector('.pixmax-inline-video').paused);assert.deepEqual(errors,[]);
});

test('assistant refuses a delayed reply after a pinned reference changes',async t=>{
    const {page,errors}=await setup(t),service=await textService(page,['失效的创意'],{held:true});
    await page.evaluate(()=>{const reference=createPromptNode(100,120,{select:false});reference.pinned=true;reference.text='参考内容';const owner=createPromptNode(440,120);owner.text='我的要求';openPixmaxAssistant();});
    await page.getByRole('textbox',{name:'助手创作要求'}).fill('依据参考写一个故事');await page.getByRole('button',{name:'发送',exact:true}).click();await service.polling;
    await page.evaluate(()=>nodes[0].text='已修改参考');service.release();
    await page.waitForFunction(()=>!pixmaxTextJobs.has(nodes[1]));
    assert.equal(await page.evaluate(()=>nodes[1].assistantMessages),undefined);assert.equal(await page.getByRole('button',{name:'插入文本节点',exact:true}).count(),0);assert.equal(service.calls.length,1);assert.deepEqual(errors,[]);
});
