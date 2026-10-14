/* Native media + real member leases, uploads, graph saves and task receipts. */
const assert=require('node:assert/strict'),readline=require('node:readline'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./canvas-browser.cjs');
const lines=readline.createInterface({input:process.stdin}),requests=new Map();let sequence=0,resolveInitial,dataRoot;
const initial=new Promise(resolve=>resolveInitial=resolve);
lines.on('line',line=>{let message=JSON.parse(line);if(message.initial){dataRoot=path.resolve(message.initial.directory);return resolveInitial(message.initial);}assert.match(message.file,/^response-\d+\.json$/);message=JSON.parse(fs.readFileSync(path.join(dataRoot,message.file),'utf8'));const resolve=requests.get(message.id);requests.delete(message.id);resolve(message);});
const watchdog=setTimeout(()=>{console.error('Reshoot browser bridge timed out');process.exit(2);},60000);watchdog.unref();
async function rpc(request){const url=new URL(request.url()),id=++sequence,answer=new Promise(resolve=>requests.set(id,resolve)),body=request.postDataBuffer(),bodyFile=body?'body-'+id+'.bin':null;if(body)fs.writeFileSync(path.join(dataRoot,bodyFile),body);const file='request-'+id+'.json';fs.writeFileSync(path.join(dataRoot,file),JSON.stringify({id,path:url.pathname+url.search,method:request.method(),headers:request.headers(),bodyFile}));process.stdout.write(JSON.stringify({file})+'\n');return answer;}
async function transport(request){const path=new URL(request.url()).pathname;if(path.startsWith('/api/canvases')||path.startsWith('/api/canvas-folders')||path.startsWith('/api/canvas-video-tasks')||path==='/api/config')return rpc(request);}
(async()=>{
    const config=await initial,cleanup=[];
    try{
        const {page,errors}=await fixture({after:fn=>cleanup.push(fn)},'smart',true,{secureOrigin:true,origin:'http://testserver',record:config.canvas,permissions:['canvas.read','canvas.edit','canvas.create','generation.submit','provider.use','asset.read','asset.manage'],apiHandler:transport});
        for(const pattern of ['**/assets/cloud/**','**/api/media/**','**/api/media-preview**'])await page.route(pattern,async route=>{const response=await rpc(route.request());if(response.binaryFile)assert.match(response.binaryFile,/^binary-\d+\.bin$/);return route.fulfill(response.binaryFile?{status:response.status,body:fs.readFileSync(path.join(dataRoot,response.binaryFile)),contentType:response.contentType}: {status:response.status,json:response.body});});
        await page.evaluate(config=>{window.__reshootOptions=MemberCanvasEdit.options;CanvasSession.context.member.id=config.member;CanvasSession.context.workspace.id=config.workspace;CanvasSession.storageKey=key=>config.member+':'+config.workspace+':'+key;apiProviders=[config.provider];},config);
        for(const file of ['member-canvas-edit.js','canvas-task-bindings.js'])await page.addScriptTag({url:'/static/js/'+file});
        await page.evaluate(async config=>{
            await MemberCanvasEdit.mount(__reshootOptions);await MemberCanvasEdit.active.lease.start(MemberCanvasEdit.active.options.reload);
            if(config.nativeDocument){insertSmartWorkflowIntoCanvas(config.nativeDocument);const target=nodes.find(node=>node.segmentReshoot);assertNativeSource(target);await saveCanvas({force:true});await PixmaxSegmentReshoot.open(target);}
            else{const source=createNode(600,140,[{...config.source,kind:'video',duration:8}],{select:false});window.__realReshootSource=source.id;await saveCanvas({force:true});await PixmaxSegmentReshoot.create(source.id,0);}
            function assertNativeSource(target){if(!target||target.images.length||!nodes.some(node=>node.id===target.segmentReshoot.source.nodeId))throw new Error('Native reshoot source or empty output did not import');}
        },config);
        if(config.nativeDocument)await page.getByRole('combobox',{name:'重拍模型'}).selectOption(JSON.stringify([config.provider.id,config.provider.video_models[0]]));
        try{await page.getByRole('textbox',{name:'重拍要求'}).fill('将衣服改为红色');}catch(error){throw new Error(error.message+'; '+JSON.stringify(await page.evaluate(()=>({available:PixmaxSegmentReshoot.available(),providers:apiProviders.map(({id,protocol,platform,has_key,video_models})=>({id,protocol,platform,has_key,video_models})),notices:[...document.querySelectorAll('[role=status],.toast')].map(item=>item.textContent)}))));}await page.getByRole('button',{name:'生成重拍视频',exact:true}).click();await page.waitForFunction(()=>nodes.some(node=>node.segmentReshoot&&node.images.length));
        await page.getByRole('button',{name:'关闭片段重拍',exact:true}).click();assert.equal(await page.evaluate(()=>saveCanvas({force:true})),true);assert.deepEqual(errors,[]);process.stdout.write(JSON.stringify({done:true})+'\n');
    }finally{for(const close of cleanup.reverse())await close();clearTimeout(watchdog);lines.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error.stack);process.exit(1);});
