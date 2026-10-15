/* Real authenticated ASGI/PG transport; only supplier completion is simulated. */
const assert=require('node:assert/strict'),readline=require('node:readline'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./canvas-browser.cjs');
const lines=readline.createInterface({input:process.stdin}),requests=new Map();let sequence=0,resolveInitial,dataRoot;
const initial=new Promise(resolve=>resolveInitial=resolve);
lines.on('line',line=>{let message=JSON.parse(line);if(message.initial){dataRoot=path.resolve(message.initial.directory);return resolveInitial(message.initial);}assert.match(message.file,/^response-\d+\.json$/);message=JSON.parse(fs.readFileSync(path.join(dataRoot,message.file),'utf8'));const resolve=requests.get(message.id);requests.delete(message.id);resolve(message);});
const watchdog=setTimeout(()=>{console.error('Native prompt browser bridge timed out');process.exit(2);},60000);watchdog.unref();
async function rpc(request){const url=new URL(request.url()),id=++sequence,answer=new Promise(resolve=>requests.set(id,resolve)),body=request.postDataBuffer(),bodyFile=body?'body-'+id+'.bin':null;if(body)fs.writeFileSync(path.join(dataRoot,bodyFile),body);const file='request-'+id+'.json';fs.writeFileSync(path.join(dataRoot,file),JSON.stringify({id,path:url.pathname+url.search,method:request.method(),headers:request.headers(),bodyFile}));process.stdout.write(JSON.stringify({file})+'\n');return answer;}
async function transport(request){const pathname=new URL(request.url()).pathname;if(/^\/api\/(canvases|canvas-folders|canvas-(image|video)-tasks|subject-library|camera-motions)(\/|$)/.test(pathname)||pathname==='/api/config'||pathname==='/api/ai/upload')return rpc(request);}
(async()=>{
    const config=await initial,cleanup=[];
    try{
        const {page,errors}=await fixture({after:fn=>cleanup.push(fn)},'smart',true,{secureOrigin:true,origin:'http://testserver',record:config.canvas,permissions:['canvas.read','canvas.edit','canvas.create','generation.submit','provider.use','asset.read','asset.manage'],apiHandler:transport});
        for(const pattern of ['**/assets/cloud/**','**/api/media/**','**/api/media-preview**'])await page.route(pattern,async route=>{const response=await rpc(route.request());if(response.binaryFile)assert.match(response.binaryFile,/^binary-\d+\.bin$/);return route.fulfill(response.binaryFile?{status:response.status,body:fs.readFileSync(path.join(dataRoot,response.binaryFile)),contentType:response.contentType,headers:response.headers}:{status:response.status,json:response.body});});
        await page.evaluate(config=>{window.__nativeOptions=MemberCanvasEdit.options;CanvasSession.context.member.id=config.member;CanvasSession.context.workspace.id=config.workspace;CanvasSession.storageKey=key=>config.member+':'+config.workspace+':'+key;CanvasSession.url=value=>{const url=new URL(value,location.origin);url.searchParams.set('workspace',config.workspace);return url.href;};apiProviders=[config.provider];},config);
        for(const file of ['member-canvas-edit.js','canvas-task-bindings.js'])await page.addScriptTag({url:'/static/js/'+file});
        await page.evaluate(async config=>{
            await MemberCanvasEdit.mount(__nativeOptions);await MemberCanvasEdit.active.lease.start(MemberCanvasEdit.active.options.reload);
            window.__nativeTarget=createGenerationNodeAt({x:400,y:100},config.kind);
            Object.assign(__nativeTarget.runSettings,{engine:'api',apiKind:config.kind,provider_id:config.provider.id,model:config.provider.image_models[0],videoProvider:config.provider.id,videoModel:config.provider.video_models[0],videoTaskMode:'auto',videoAspect:'16:9',videoDuration:5,videoResolution:'720p'});render();
            for(const item of config.references||[]){const source=createNode(80,100,[item],{select:false,deferRender:true});source.pixmaxSourceType=item.kind==='image'?'BASE_IMAGE':item.kind==='video'?'BASE_VIDEO':'BASE_AUDIO';canvas.connections.push({from:source.id,to:__nativeTarget.id,kind:'input'});}render();
        },config);
        if(await page.locator('.pixmax-navigator-toggle[aria-expanded=true]').count())await page.locator('.pixmax-navigator-toggle').click();
        await page.getByRole('textbox',{name:'生成提示词',exact:true}).fill('黄昏的摄影师缓慢回头');
        if(config.camerawork){
            await page.getByRole('button',{name:'运镜',exact:true}).click();const library=page.locator('[data-native-camerawork="library"]');await library.getByRole('button',{name:'我的运镜',exact:true}).click();await library.getByRole('button',{name:'新建运镜',exact:true}).click();const editor=page.locator('[data-native-camerawork="editor"]');await editor.getByRole('textbox',{name:'运镜名称',exact:true}).fill('数据库运镜');await editor.getByRole('textbox',{name:'运镜提示词',exact:true}).fill('镜头缓慢绕人物环绕一周');await editor.locator('input[type=file]').setInputFiles(config.camerawork);await editor.getByRole('button',{name:'确认',exact:true}).click();await editor.waitFor({state:'detached'});await library.getByText('数据库运镜',{exact:true}).click();await library.waitFor({state:'detached'});assert.equal(await page.locator('[data-hash-type=camerawork]').count(),1);
        }
        if(config.subject){
            await page.getByRole('button',{name:'主体库',exact:true}).click();const library=page.getByRole('dialog',{name:'主体库',exact:true});await library.getByText(config.subject.name,{exact:true}).waitFor();await library.locator('[data-subject-cards] .group').filter({hasText:config.subject.name}).hover();await library.getByRole('button',{name:'应用',exact:true}).click();await library.waitFor({state:'detached'});
            assert.equal(await page.locator('.pixmax-native-prompt [data-editor-node-type=subject-reference]').count(),1);
        }else if(config.kind==='image'){
            await page.getByRole('button',{name:'相机',exact:true}).click();const panel=page.locator('[data-native-camera]');await panel.waitFor();await panel.locator('header button').click();assert.equal(await page.locator('.pixmax-native-prompt [data-hash-type=camera]').count(),1);
        }
        if(config.mode){
            await page.getByRole('button',{name:'视频生成模式',exact:true}).click();await page.locator('.pixmax-reshoot-model-options').getByRole('button',{name:config.mode,exact:true}).click();
            await page.locator('#composer.pixmax-native-form-active').waitFor();
            assert.equal(await page.locator('.pixmax-native-generation-references [data-source-node-order-item]').count(),config.references.length);
            if(config.references.length){const label=['图生视频','首尾帧'].includes(config.mode)?'首帧':'图片1';await page.locator('.pixmax-native-generation-references').getByRole('button',{name:new RegExp('引用 '+label)}).click();await page.waitForFunction(()=>__nativeTarget.nativePrompt.prompt.includes('[image]'));}
        }
        if(config.parameters){
            await page.getByRole('button',{name:'生成参数',exact:true}).click();const panel=page.locator('[data-combo-selector-panel]');
            if(config.kind==='image'){await panel.getByRole('button',{name:'2K',exact:true}).click();await panel.getByRole('button',{name:'高',exact:true}).click();}
            else{await panel.getByRole('button',{name:'1080P',exact:true}).click();await panel.getByRole('button',{name:'Audio On',exact:true}).click();await panel.getByRole('button',{name:'MOV',exact:true}).click();}
            await page.keyboard.press('Escape');await panel.waitFor({state:'detached'});
        }
        await page.locator('[data-native-generation-submit]').click();await page.waitForFunction(()=>__nativeTarget.images.length===1).catch(async error=>{const details=await page.evaluate(()=>({notices:[...document.querySelectorAll('[role=status],.toast')].map(item=>item.textContent)}));fs.writeFileSync(path.join(dataRoot,'binding-diagnostic.json'),JSON.stringify(details));throw Error(error.message+'; see binding-diagnostic.json');});
        assert.equal(await page.evaluate(()=>saveCanvas({force:true})),true);
        // Reload through the actual lease controller, then reopen the saved editor.
        await page.evaluate(async()=>{const id=__nativeTarget.id;await MemberCanvasEdit.active.options.reload();window.__nativeTarget=nodes.find(node=>node.id===id);smartSelection.createdNode(id);render();});
        await page.getByRole('textbox',{name:'生成提示词',exact:true}).waitFor();
        await page.locator('#composer.pixmax-native-form-active').waitFor();
        if(config.subject||config.kind==='image')assert.equal(await page.locator('.pixmax-native-prompt '+(config.subject?'[data-editor-node-type=subject-reference]':'[data-hash-type=camera]')).count(),1);
        if(config.camerawork)assert.equal(await page.locator('[data-hash-type=camerawork]').count(),1);
        if(config.mode)assert.equal(await page.evaluate(()=>__nativeTarget.runSettings.videoReferenceMode),{文生视频:'textToVideo',图生视频:'imageToVideo',首尾帧:'firstAndLastFrame',多模态参考:'referToVideo',视频编辑:'videoEdit',向后延长:'extend_backward',向前延长:'extend_forward'}[config.mode]);
        assert.match(await page.getByRole('textbox',{name:'生成提示词',exact:true}).innerText(),/黄昏的摄影师/);assert.deepEqual(errors,[]);process.stdout.write(JSON.stringify({done:true,targetId:await page.evaluate(()=>__nativeTarget.id)})+'\n');
    }finally{for(const close of cleanup.reverse())await close();clearTimeout(watchdog);lines.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error.stack);process.exit(1);});
