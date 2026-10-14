/* Real browser controls -> JSON-lines bridge -> authenticated ASGI/database. */
const assert=require('node:assert/strict'),readline=require('node:readline');
const {fixture}=require('./canvas-browser.cjs');
const lines=readline.createInterface({input:process.stdin}),requests=new Map();let sequence=0,initial;
const ready=new Promise(resolve=>initial=resolve);
lines.on('line',line=>{const message=JSON.parse(line);if(message.initial){initial(message.initial);return;}const resolve=requests.get(message.id);requests.delete(message.id);resolve(message);});
const watchdog=setTimeout(()=>{console.error('Browser/database bridge timed out');process.exit(2);},45000);watchdog.unref();
async function transport(request,canvasId){
    const url=new URL(request.url());
    if(url.pathname!=='/api/canvases/'+canvasId&&!url.pathname.startsWith('/api/canvases/'+canvasId+'/task-results')&&!/^\/api\/canvas-(audio|model|llm|image)-tasks(?:\/|$)/.test(url.pathname))return;
    const id=++sequence,answer=new Promise(resolve=>requests.set(id,resolve));
    process.stdout.write(JSON.stringify({id,path:url.pathname+url.search,method:request.method(),headers:request.headers(),body:request.postData()})+'\n');
    return answer;
}
(async()=>{
    const config=await ready,cleanup=[];let posts=0;
    try{
        const taskKind=config.kind==='parse'?'llm':['assets','shots','frame-drag'].includes(config.kind)?'image':config.kind;
        const {page,errors}=await fixture({after:fn=>cleanup.push(fn)},'smart',true,{secureOrigin:true,origin:'http://testserver',record:config.canvas,
            apiHandler:request=>{if(request.method()==='POST'&&request.url().includes('/api/canvas-'+taskKind+'-tasks'))posts++;return transport(request,config.canvas.id);}});
        await page.addScriptTag({url:'/static/js/canvas-task-bindings.js'});
        if(config.kind==='parse'){
            await page.addScriptTag({url:'/static/js/canvas-llm-tasks.js'});
            await page.route('**/assets/cloud/**',route=>route.fulfill({body:Buffer.from(config.videoBytes,'base64'),contentType:'video/mp4'}));
        }
        await page.evaluate(config=>{
            apiProviders=[{id:config.providerId,has_key:true,image_models:['assets','shots'].includes(config.kind)?['test']:[],video_models:config.kind==='shots'?['test-video']:[],chat_models:config.kind==='parse'?['test']:[],audio_models:config.kind==='audio'?['speech-2.8-hd']:[],model_models:config.kind==='model'?['3.0']:[]}];
            Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});
            Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});
            // Use the editor's actual private proof for writes. The browser's
            // current revision supplies both headers and save body, as in the
            // production lease adapter (which has separate integration tests).
            MemberCanvasEdit.send=(url,init={},fetcher=fetch)=>{
                if(['POST','PUT'].includes(init.method)){
                    const headers=new Headers(init.headers);for(const [key,value] of Object.entries(config.proof))headers.set(key,value);
                    headers.set('X-Canvas-Revision',String(canvas.revision));init={...init,headers};
                    if(init.method==='PUT')init.body=JSON.stringify({...JSON.parse(init.body),base_revision:canvas.revision});
                }
                return fetcher(url,init);
            };
            if(config.kind==='parse')PixmaxVideoParse.create(nodes[0].id,0);else if(config.kind==='assets')PixmaxStoryboardAssets.open(nodes[0]);else if(config.kind==='shots')PixmaxStoryboardMedia.open(nodes.find(node=>node.type==='smart-storyboard'),'image');else if(config.kind!=='frame-drag')openSmartStudio(nodes[0].id);
        },config);
        if(config.kind==='frame-drag'){
            const taskId=await page.evaluate(async config=>{
                const source=nodes.find(node=>node.id==='source'),target=nodes.find(node=>node.id==='target');
                const binding=smartTaskInputBinding(source,target,canvasTaskWriteGuard(source,target));
                const canvas_target=await binding.prepare();binding.beginSubmission();
                const id='canvas_img_'+crypto.randomUUID().replace(/-/g,'');
                const response=await CanvasApi.createCanvasImageTaskRequest({canvas_id:canvas.id,client_task_id:id,provider_id:config.providerId,model:'test',prompt:'private original input',n:1,canvas_target});
                if(!response.ok)throw Error(await response.text());binding.remember(await response.json());
                window.frameTaskBinding=binding;PixmaxCanvasFrames.create(['prompt','source']);return id;
            },config);
            const box=await page.locator('[data-id="target"] .node-body').boundingBox();
            await page.mouse.move(box.x+10,box.y+35);await page.mouse.down();await page.mouse.move(box.x-430,box.y+35,{steps:5});await page.mouse.up();
            assert.equal(await page.evaluate(()=>{const frame=nodes.find(PixmaxCanvasFrames.isFrame);return nodes.every(node=>PixmaxCanvasFrames.isFrame(node)||node.frameId===frame.id);}),true);
            assert.equal(await page.evaluate(()=>saveCanvas({force:true})),true);
            await page.evaluate(async id=>{const response=await CanvasApi.getCanvasImageTaskRequest(id);if(!response.ok)throw Error(await response.text());frameTaskBinding.verify(await response.json(),id);},taskId);
            await page.reload();await page.waitForFunction(id=>canvas?.id===id,config.canvas.id);
            assert.equal(await page.evaluate(()=>{const frame=nodes.find(PixmaxCanvasFrames.isFrame);return nodes.every(node=>PixmaxCanvasFrames.isFrame(node)||node.frameId===frame.id);}),true);
            assert.equal(await page.evaluate(()=>nodes.find(node=>node.id==='target').x),510);
            assert.equal(await page.locator('.smart-connection').count(),2);assert.deepEqual(errors,[]);assert.equal(posts,1);
            process.stdout.write(JSON.stringify({done:true,posts,taskId,revision:await page.evaluate(()=>canvas.revision)})+'\n');return;
        }
        if(config.kind==='shots'){
            await page.getByRole('button',{name:'创建生成节点'}).click();await page.waitForFunction(()=>!document.querySelector('.pixmax-story-media-modal'));
            await page.evaluate(()=>PixmaxStoryboardMedia.open(nodes.find(node=>node.type==='smart-storyboard'),'video'));
            await page.getByRole('button',{name:'创建生成节点'}).click();await page.waitForFunction(()=>!document.querySelector('.pixmax-story-media-modal'));
            assert.equal(posts,0);assert.equal(await page.evaluate(()=>nodes.length),7);
            await page.evaluate(async()=>{const node=nodes.find(node=>node.storyboardShotBinding?.mediaType==='image');smartSelection.createdNode(node.id);render();await runGeneration();});
            assert.equal(await page.evaluate(()=>nodes.find(node=>node.storyboardShotBinding?.mediaType==='image').images.length),1,await page.locator('#toast').textContent());
            assert.equal(await page.evaluate(()=>saveCanvas({force:true})),true);await page.reload();await page.waitForFunction(id=>canvas?.id===id,config.canvas.id);
            assert.equal(await page.evaluate(()=>nodes.find(node=>node.storyboardShotBinding?.mediaType==='image').images.length),1);
            assert.equal(await page.evaluate(()=>nodes.find(node=>node.type==='smart-editor').inputNodeIds.length),1);
            assert.deepEqual(errors,[]);assert.equal(posts,1);
            process.stdout.write(JSON.stringify({done:true,posts,revision:await page.evaluate(()=>canvas.revision)})+'\n');return;
        }
        if(config.kind==='assets'){
            await page.locator('[data-story-image-all]').click();await page.waitForFunction(()=>!PixmaxStoryboardAssets.busy());
            assert.deepEqual(await page.evaluate(()=>nodes.filter(node=>node.storyboardAssetBinding).map(node=>node.images.length)),[1,1],await page.locator('.pixmax-creation-status').textContent());
            assert.equal(await page.evaluate(()=>canvas.task_result_version),2);
            await page.evaluate(()=>performUndo());assert.deepEqual(await page.evaluate(()=>nodes.filter(node=>node.storyboardAssetBinding).map(node=>node.images.length)),[1,0]);
            assert.equal(await page.evaluate(()=>nodes.every(node=>smartPendingTasks(node).length===0)),true);
            assert.equal(await page.evaluate(()=>saveCanvas({force:true})),true);
            await page.evaluate(()=>redoSmartCanvas());assert.deepEqual(await page.evaluate(()=>nodes.filter(node=>node.storyboardAssetBinding).map(node=>node.images.length)),[1,1]);
            await page.evaluate(()=>performUndo());assert.equal(await page.evaluate(()=>saveCanvas({force:true})),true);
            await page.reload();await page.waitForFunction(id=>canvas?.id===id,config.canvas.id);
            assert.deepEqual(await page.evaluate(()=>nodes.filter(node=>node.storyboardAssetBinding).map(node=>node.images.length)),[1,0]);
            assert.equal(await page.evaluate(()=>{const frame=nodes.find(PixmaxCanvasFrames.isFrame);return !!frame&&nodes.filter(node=>node.storyboardAssetBinding).every(node=>node.frameId===frame.id);}),true);
            assert.equal(await page.evaluate(()=>nodes[0].storyboardAssets.every(asset=>nodes.some(node=>node.id===asset.imageNodeId&&node.storyboardAssetBinding.ownerId===nodes[0].id))),true);
            assert.deepEqual(errors,[]);assert.equal(posts,2);
            process.stdout.write(JSON.stringify({done:true,posts,revision:await page.evaluate(()=>canvas.revision)})+'\n');return;
        }
        if(config.kind==='parse'){
            await page.getByRole('textbox',{name:'视频解析补充文本'}).fill('根据画面拆分镜头');await page.locator('[data-video-parse-run]').click();
            await page.waitForFunction(()=>!PixmaxVideoParse.busy());
            assert.equal(await page.evaluate(()=>nodes[1].shots.length),2,await page.locator('.pixmax-creation-status').textContent());
            assert.equal(await page.evaluate(()=>nodes[1].storyboardAssets.length),1);
            await page.screenshot({path:'.local/pixmax-video-parse.png'});
            await page.evaluate(()=>performUndo());assert.equal(await page.evaluate(()=>nodes[1].shots.length),0);assert.equal(await page.evaluate(()=>PixmaxVideoParse.pending().length),0);
            assert.equal(await page.evaluate(()=>saveCanvas({force:true})),true);
            await page.reload();await page.waitForFunction(id=>canvas?.id===id,config.canvas.id);
            assert.equal(await page.evaluate(()=>nodes.length),2);assert.equal(await page.evaluate(()=>nodes[1].shots.length),0);assert.equal(await page.evaluate(()=>PixmaxVideoParse.pending().length),0);
            assert.deepEqual(errors,[]);assert.equal(posts,1);
            process.stdout.write(JSON.stringify({done:true,posts,revision:await page.evaluate(()=>canvas.revision)})+'\n');return;
        }
        await page.getByRole('textbox',{name:config.kind==='audio'?'音频创作内容':'3D 模型描述'}).fill('雨夜陶瓷小猫');
        await page.locator('[data-'+config.kind+'-run]').click();
        await page.waitForFunction(kind=>!window[kind==='audio'?'PixmaxAudioCreation':'PixmaxModelCreation'].busy(),config.kind);
        if(await page.evaluate(()=>nodes[0].images.length)!==1){
            throw new Error('Unexpected result; dialog status: '+await page.locator('.pixmax-creation-status').textContent()+'; browser errors: '+errors.join('; ')+'; submissions: '+posts);
        }
        assert.equal(await page.evaluate(()=>canvas.task_result_version),1);
        await page.evaluate(()=>performUndo());assert.equal(await page.evaluate(()=>nodes[0].images.length),0);
        assert.equal(await page.evaluate(()=>smartPendingTasks(nodes[0]).length),0);assert.equal(await page.evaluate(()=>saveCanvas({force:true})),true);
        await page.evaluate(()=>redoSmartCanvas());assert.equal(await page.evaluate(()=>nodes[0].images.length),1);assert.equal(await page.evaluate(()=>saveCanvas({force:true})),true);
        await page.evaluate(()=>performUndo());assert.equal(await page.evaluate(()=>saveCanvas({force:true})),true);
        await page.reload();await page.waitForFunction(id=>canvas?.id===id,config.canvas.id);
        assert.equal(await page.evaluate(()=>nodes[0].images.length),0);assert.equal(await page.evaluate(()=>smartPendingTasks(nodes[0]).length),0);
        assert.deepEqual(errors,[]);assert.equal(posts,1);
        process.stdout.write(JSON.stringify({done:true,posts,revision:await page.evaluate(()=>canvas.revision)})+'\n');
    }finally{for(const close of cleanup.reverse())await close();clearTimeout(watchdog);lines.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error.stack);process.exit(1);});
