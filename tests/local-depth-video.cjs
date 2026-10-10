const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),vm=require('node:vm');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
// Two real H.264 frames, one second. No supplier or model network calls in regression tests.
const input=Buffer.from('AAAAHGZ0eXBpc29tAAACAGlzb21hdmMxbXA0MQAAArRtb292AAAAbG12aGQAAAAA5u37f+bt+38AAOEAAADhAAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAACQHRyYWsAAABcdGtoZAAAAAPm7ft/5u37fwAAAAEAAAAAAADhAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAQAAAAEAAAAAAAdxtZGlhAAAAIG1kaGQAAAAA5u37f+bt+38AAAACAAAAAlXEAAAAAAA3aGRscgAAAABtaGxydmlkZQAAAAAAAAAAAAAAAE1lZGlhYnVubnlWaWRlb0hhbmRsZXIAAAABfW1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAT1zdGJsAAAAuXN0c2QAAAAAAAAAAQAAAKlhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAEAAQABIAAAASAAAAAAAAAABEk1lZGlhYnVubnkgdjEuNjEuMwAAAAAAAAAAAAAAAAAAGP//AAAALGF2Y0MBZAwJ/+EAEWdkDAmsGNCEk1AQ0BB4RCNQAQAEaM48gP34+AAAAAATY29scm5jbHgAAQANAAEAAAAAFGJ0cnQAAAAAAAACMAAAAjAAAAAYc3R0cwAAAAAAAAABAAAAAgAAAAEAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAEAAAABAAAAHHN0c3oAAAAAAAAAAAAAAAIAAAAeAAAAKAAAABhzdGNvAAAAAAAAAAIAAALYAAAC9gAAABRzdHNzAAAAAAAAAAEAAAABAAAATm1kYXQAAAAaZbgABAn///h6KAAIJ/k5OTrrrrrrrrrrrrwAAAAkYeAAfkCfN//8PRQABBI+JxeJ8T57F5/P5/Pefz+fzyZ/P5/A','base64');
const muxStub=`export class BufferTarget{buffer=new Uint8Array([1,2,3])} export class Mp4OutputFormat{} export class Output{constructor(o){this.target=o.target}addVideoTrack(){}async start(){}async finalize(){}async cancel(){window.encodingCancelled=true}} export class CanvasSource{async add(t,d){window.encodedFrames.push([t,d])}}`;
async function browserFixture(t){
    const server=http.createServer((req,res)=>{
        if(req.url==='/input.mp4'){res.setHeader('Content-Type','video/mp4');return res.end(input);}
        if(req.url==='/input.svg'){res.setHeader('Content-Type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="768"><rect width="1536" height="768" fill="orange"/></svg>');}
        if(req.url.startsWith('/static/')){res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');return res.end(fs.readFileSync(path.join(root,req.url)));}
        res.setHeader('Content-Type','text/html; charset=utf-8');
        res.end('<html><head><link rel="stylesheet" href="/static/css/local-depth-video.css"></head><body><button id="origin">Open</button><script src="/static/js/local-depth-video.js"></script></body></html>');
    }).listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
    const browser=await chromium.launch({channel:'chrome',headless:true});t.after(async()=>{await browser.close();await new Promise(resolve=>server.close(resolve));});
    const page=await browser.newPage({viewport:{width:1100,height:750}}),requests=[];
    await page.route('https://cdn.jsdelivr.net/npm/mediabunny@1.61.3/**',route=>route.fulfill({contentType:'text/javascript',body:process.env.DEPTH_MEDIA_BUNDLE?fs.readFileSync(process.env.DEPTH_MEDIA_BUNDLE):muxStub}));
    await page.addInitScript(()=>{
        window.encodedFrames=[];window.workerCalls=[];window.saved=0;window.terminated=0;
        Object.defineProperty(navigator,'gpu',{value:{requestAdapter:async()=>({features:new Set(['shader-f16'])})}});
        window.Worker=class {
            postMessage(data){window.workerCalls.push(data.type);if(data.type==='frame')window.frameSize=[data.width,data.height];if(window.stallWorker)return;
                setTimeout(()=>{if(this.dead)return;
                    if(window.failWorker){this.onmessage({data:{id:data.id,type:'error',message:'test model failure'}});return;}
                    this.onmessage({data:data.type==='load'?{id:data.id,type:'ready'}:{id:data.id,type:'frame',width:2,height:2,channels:1,pixels:new Uint8Array([0,80,160,255]).buffer}});
                },0);
            }
            terminate(){this.dead=true;window.terminated++;}
        };
    });
    page.on('request',request=>requests.push({method:request.method(),url:request.url()}));
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.evaluate(()=>{document.getElementById('origin').focus();LocalDepthVideo.open({url:'/input.mp4',save:async file=>{window.saved++;window.savedType=file.type}});});
    return {page,requests};
}
test('local extraction is lazy, preserves timestamps, and saves only on explicit click',async t=>{
    const {page,requests}=await browserFixture(t);
    assert.deepEqual(await page.evaluate(()=>workerCalls),[]);
    await page.locator('.local-depth-start').click();
    await page.waitForFunction(()=>!document.querySelector('[data-download]').disabled);
    if(!process.env.DEPTH_MEDIA_BUNDLE){const frames=await page.evaluate(()=>encodedFrames);assert.equal(frames.length,30);assert.equal(frames[0][0],0);assert.equal(frames.at(-1)[0],29/30);assert.ok(Math.abs(frames.reduce((n,f)=>n+f[1],0)-1)<1e-6);}
    assert.equal(await page.evaluate(()=>saved),0);assert.ok(requests.every(r=>r.method==='GET'));
    assert.equal(await page.evaluate(()=>workerCalls.filter(t=>t==='frame').length),30);
    assert.match(await page.locator('.local-depth-status').textContent(),/仅保存在当前浏览器/);
    if(process.env.DEPTH_MEDIA_BUNDLE){const duration=await page.locator('video').evaluate(v=>new Promise(resolve=>{if(v.readyState>=1)resolve(v.duration);else v.onloadedmetadata=()=>resolve(v.duration)}));assert.ok(Math.abs(duration-1)<.01);}
    await page.locator('[data-save]').click();await page.waitForFunction(()=>saved===1);assert.equal(await page.evaluate(()=>savedType),'video/mp4');
    await page.keyboard.press('Escape');assert.equal(await page.locator('[role=dialog]').count(),0);assert.equal(await page.evaluate(()=>document.activeElement.id),'origin');
});
test('model failure is retryable; cancel and close terminate pending inference',async t=>{
    const {page}=await browserFixture(t);
    await page.evaluate(()=>{window.failWorker=true});await page.locator('.local-depth-start').click();
    await page.waitForFunction(()=>document.querySelector('.local-depth-status').textContent.includes('test model failure'));
    await page.evaluate(()=>{window.failWorker=false;window.stallWorker=true});await page.locator('.local-depth-start').click();
    await page.waitForFunction(()=>workerCalls.filter(t=>t==='load').length===2);
    await page.locator('.local-depth-start').click();await page.waitForFunction(()=>document.querySelector('.local-depth-status').textContent.includes('已取消'));
    await page.evaluate(()=>window.stallWorker=false);await page.locator('.local-depth-start').click();
    await page.waitForFunction(()=>!document.querySelector('[data-download]').disabled);
    assert.equal(await page.evaluate(()=>saved),0);assert.ok(await page.evaluate(()=>terminated>=3));
    await page.setViewportSize({width:390,height:800});assert.ok(await page.locator('.local-depth-dialog').evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
});
test('smart save checks editing lease, canvas, and source before and after upload',async()=>{
    const source=fs.readFileSync(path.join(root,'static/js/canvas/smart/smart-media-editor.js'),'utf8').replace(/\r\n/g,'\n');
    const code=['openSmartLocalDepthVideo','openSmartLocalDepthImage','openSmartLocalDepthMedia'].map(name=>{const start=source.indexOf(`function ${name}(`);return source.slice(start,source.indexOf('\n}',start)+2)}).join('\n');
    for(const kind of ['image','video'])for(const change of ['lock','canvas','source'])for(const after of [false,true]){
        const node={id:'v',x:1,y:1,images:[{url:'/input.mp4',kind}]},ctx=vm.createContext({nodes:[node],canvas:{id:'one'},locked:false,saves:0,uploads:0,mediaKindForItem:i=>i.kind,imageForDisplay:i=>i,displayMediaUrl:i=>i.url,canvasTaskWriteGuard:()=>({check(){}}),window:{LocalDepthVideo:{open:o=>o},LocalDepthImage:{open:o=>o}},pushUndo(){},appendImagesToSmartNode(){ctx.saves++},isSmartCanvasLocked:()=>ctx.locked});
        const mutate=()=>{if(change==='lock')ctx.locked=true;else if(change==='canvas')ctx.canvas.id='two';else node.images[0].url='replaced';};
        ctx.uploadFiles=async()=>{ctx.uploads++;if(after)mutate();return [{url:'/result.mp4'}]};
        vm.runInContext(code,ctx);const panel=ctx.openSmartLocalDepthMedia('v',0,kind);if(!after)mutate();
        await assert.rejects(panel.save({}),/变化/);assert.equal(ctx.saves,0);assert.equal(ctx.uploads,after?1:0);
    }
});
test('local image exports grayscale PNG, preserves aspect ratio and never needs a video encoder',async t=>{
    const {page,requests}=await browserFixture(t);
    await page.evaluate(()=>{
        Object.defineProperty(window,'VideoEncoder',{value:undefined});
        LocalDepthImage.open({url:'/input.svg',save:async file=>{window.saved++;window.savedType=file.type;window.savedName=file.name}});
    });
    assert.deepEqual(await page.evaluate(()=>workerCalls),[]);
    assert.equal(await page.locator('[data-fps]').count(),0);
    await page.locator('.local-depth-start').click();await page.waitForFunction(()=>!document.querySelector('[data-download]').disabled);
    await page.waitForFunction(()=>document.querySelector('.local-depth-preview').naturalWidth===1024);
    const output=await page.locator('.local-depth-preview').evaluate(img=>{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return {size:[c.width,c.height],pixel:[...ctx.getImageData(100,100,1,1).data]}});
    assert.deepEqual(output.size,[1024,512]);assert.equal(output.pixel[0],output.pixel[1]);assert.equal(output.pixel[1],output.pixel[2]);assert.equal(output.pixel[3],255);
    assert.deepEqual(await page.evaluate(()=>frameSize),[518,259]);
    assert.equal(await page.evaluate(()=>workerCalls.filter(t=>t==='frame').length),1);
    assert.ok(requests.every(r=>r.method==='GET'));assert.ok(requests.every(r=>!r.url.includes('mediabunny')));assert.equal(await page.evaluate(()=>saved),0);
    const download=page.waitForEvent('download');await page.locator('[data-download]').click();assert.equal((await download).suggestedFilename(),'depth-image.png');
    await page.locator('[data-save]').click();await page.waitForFunction(()=>saved===1);assert.equal(await page.evaluate(()=>savedType),'image/png');assert.equal(await page.evaluate(()=>savedName),'depth-image.png');
});
test('image cancel/retry leaves local download available in read-only mode',async t=>{
    const {page}=await browserFixture(t);
    await page.evaluate(()=>{LocalDepthImage.open({url:'/input.svg'});window.stallWorker=true});
    await page.locator('.local-depth-start').click();await page.waitForFunction(()=>workerCalls.includes('load'));
    await page.locator('.local-depth-start').click();await page.waitForFunction(()=>document.querySelector('.local-depth-status').textContent.includes('已取消'));
    await page.evaluate(()=>window.stallWorker=false);await page.locator('.local-depth-start').click();await page.waitForFunction(()=>!document.querySelector('[data-download]').disabled);
    assert.equal(await page.locator('[data-save]').isDisabled(),true);assert.equal(await page.evaluate(()=>saved),0);
});
test('smart image toolbar opens local depth and creates a separate image node only when saved',async t=>{
    const {page,errors}=await require('./helpers/canvas-browser.cjs').fixture(t,'smart',true);
    await page.evaluate(()=>{nodes=[{id:'depth-source',type:'smart-image',x:20,y:20,images:[{url:'/test-image.svg',kind:'image',name:'input.svg'}]}];smartSelection.createdNode('depth-source');render();});
    assert.equal(await page.locator('[data-smart-node-action="depth-local"]').count(),1);
    assert.equal(await page.locator('[data-smart-node-action="depth"]').count(),1,'existing managed depth stays available');
    await page.locator('[data-smart-node-action="depth-local"]').click();assert.equal(await page.locator('#localDepthTitle').textContent(),'本地深度图');await page.keyboard.press('Escape');
    await page.evaluate(async()=>{
        const open=LocalDepthImage.open;LocalDepthImage.open=options=>options;
        const panel=openSmartLocalDepthImage('depth-source',0);LocalDepthImage.open=open;
        window.imageUploads=0;uploadFiles=async files=>{imageUploads++;if(files[0].type!=='image/png')throw Error('wrong type');return [{url:'/depth.png',kind:'image',name:'depth-image.png'}]};
        await panel.save(new File(['test'],'depth-image.png',{type:'image/png'}));
    });
    assert.equal(await page.evaluate(()=>nodes.length),2);assert.equal(await page.evaluate(()=>imageUploads),1);
    assert.equal(await page.evaluate(()=>nodes.find(n=>n.id==='depth-source').images[0].url),'/test-image.svg');
    assert.equal(await page.evaluate(()=>nodes.find(n=>n.id!=='depth-source').images[0].kind),'image');
    await page.evaluate(()=>{MemberCanvasEdit.setEditable(false);const open=LocalDepthImage.open;LocalDepthImage.open=options=>options;window.readOnlySave=Boolean(openSmartLocalDepthImage('depth-source',0).save);LocalDepthImage.open=open;});
    assert.equal(await page.evaluate(()=>readOnlySave),false);assert.deepEqual(errors,[]);
});
test('smart video creates one result node, keeps preview behavior and saves into the same node',async t=>{
    const {page,errors}=await require('./helpers/canvas-browser.cjs').fixture(t,'smart',true);
    await page.route('**/input.mp4',route=>route.fulfill({contentType:'video/mp4',body:input}));
    await page.evaluate(()=>{nodes=[{id:'depth-source',type:'smart-image',x:20,y:20,images:[{url:'/input.mp4',kind:'video',name:'input.mp4'}]}];smartSelection.createdNode('depth-source');render();});
    await page.evaluate(()=>{
        window.depthUploads=0;
        LocalDepthVideo.generate=options=>{window.depthOptions=options;return {close(){},cancel(){options.onError(new DOMException('cancel','AbortError'));options.onFinally();},download(){window.depthDownloaded=true;}};};
        uploadFiles=async()=>{depthUploads++;return [{url:'/result.mp4',kind:'video',name:'depth-video.mp4'}];};
    });
    assert.equal(await page.locator('[data-smart-node-action="depth-video"]').count(),1);
    await page.evaluate(()=>runSmartNodeToolbarAction('depth-source','depth-video'));
    assert.equal(await page.locator('.local-depth-dialog').count(),0);
    assert.equal(await page.evaluate(()=>nodes.length),2);assert.equal(await page.locator('.local-depth-node').count(),1);
    assert.equal(await page.evaluate(()=>nodes[1].x>=nodeRect(nodes[0]).x+nodeRect(nodes[0]).width+60),true);
    assert.equal(await page.locator('.composer.open').count(),0);
    await page.evaluate(()=>runSmartNodeToolbarAction('depth-source','depth-video'));assert.equal(await page.evaluate(()=>nodes.length),2);
    await page.evaluate(async()=>{depthOptions.onProgress({text:'提取 3 / 30 帧',progress:10});await depthOptions.onResult(new File(['depth'],'depth-video.mp4',{type:'video/mp4'}));depthOptions.onFinally();});
    assert.equal(await page.evaluate(()=>depthUploads),1);assert.equal(await page.evaluate(()=>nodes.length),2);
    assert.equal(await page.evaluate(()=>nodes[1].images[0].url),'/result.mp4');assert.equal(await page.locator('.local-depth-node').count(),0);
    await page.evaluate(()=>runSmartNodeToolbarAction('depth-source','preview'));
    await page.waitForFunction(()=>document.getElementById('previewCurrentVideo').currentSrc.includes('input.mp4'));
    assert.deepEqual(await page.evaluate(()=>nodes[0].images.map(({url,kind,name})=>({url,kind,name}))),[{url:'/input.mp4',kind:'video',name:'input.mp4'}]);
    assert.deepEqual(errors,[]);
});

test('smart media toolbar follows editing access without another node click or remount',async t=>{
    const {page,errors}=await require('./helpers/canvas-browser.cjs').fixture(t,'smart',true);
    await page.evaluate(()=>{
        MemberCanvasEdit.setEditable(false);
        nodes=[{id:'source',type:'smart-image',x:20,y:140,images:[{url:'/input.mp4',kind:'video'}]},
            {id:'image',type:'smart-image',x:400,y:140,images:[{url:'/test-image.svg',kind:'image'}]}];
        smartSelection.createdNode('source');render();
        window.originalNode=world.querySelector('[data-id="source"]');
        window.originalVideo=originalNode.querySelector('video');
        window.depthControl=originalNode.querySelector('[data-smart-node-action="depth-video"]');
        window.generatedJobs=0;
        LocalDepthVideo.generate=()=>{generatedJobs++;return {close(){},cancel(){},download(){}};};
    });
    const disabled=()=>page.evaluate(()=>['depth-video','depth','panorama'].map(action=>world.querySelector(`[data-smart-node-action="${action}"]`).disabled));
    assert.deepEqual(await disabled(),[true,true,true]);
    await page.evaluate(()=>MemberCanvasEdit.setEditable(true));
    assert.deepEqual(await disabled(),[false,false,false]);
    assert.equal(await page.evaluate(()=>originalNode.isConnected && originalVideo===originalNode.querySelector('video') && depthControl===originalNode.querySelector('[data-smart-node-action="depth-video"]')),true);
    await page.evaluate(()=>{smartImageToolBusy=true;MemberCanvasEdit.options.changed(MemberCanvasEdit.active.lease);});
    assert.deepEqual(await disabled(),[false,true,true],'permission refresh preserves the managed image tools busy state');
    await page.evaluate(()=>{smartImageToolBusy=false;MemberCanvasEdit.options.changed(MemberCanvasEdit.active.lease);});
    assert.deepEqual(await disabled(),[false,false,false]);
    await page.evaluate(()=>MemberCanvasEdit.setEditable(false));
    assert.deepEqual(await disabled(),[true,true,true]);
    await page.evaluate(()=>runSmartNodeToolbarAction('source','depth-video'));
    assert.equal(await page.evaluate(()=>generatedJobs),0,'read-only access still blocks generation');
    await page.evaluate(()=>{render();MemberCanvasEdit.setEditable(true);});
    assert.deepEqual(await disabled(),[false,false,false]);
    await page.locator('[data-smart-node-action="depth-video"]').click();
    assert.equal(await page.evaluate(()=>generatedJobs),1);
    assert.equal(await page.locator('.local-depth-node').count(),1);
    assert.deepEqual(errors,[]);
});

test('smart depth progress keeps the card, icon and focused cancel button mounted without breathing animation',async t=>{
    const {page,errors}=await require('./helpers/canvas-browser.cjs').fixture(t,'smart',true);
    await page.addStyleTag({path:path.join(root,'static/css/local-depth-video.css')});
    await page.evaluate(()=>{
        nodes=[{id:'source',type:'smart-image',x:20,y:140,images:[{url:'/input.mp4',kind:'video'}]}];
        LocalDepthVideo.generate=options=>{window.depthOptions=options;return {close(){},cancel(){window.depthCancelled=true;options.onError(new DOMException('cancel','AbortError'));options.onFinally();},download(){}};};
        window.depthTarget=startSmartLocalDepthVideo('source',0);
        window.depthCard=document.querySelector(`.image-node[data-id="${depthTarget.id}"]`);
        window.depthIcon=depthCard.querySelector('.local-depth-node-icon svg');
        window.depthButton=depthCard.querySelector('[data-local-depth-action="cancel"]');
        window.depthBar=depthCard.querySelector('progress');
        window.sourceVideo=document.querySelector('.image-node[data-id="source"] video');
        for(let i=1;i<=20;i++){
            smartLocalDepthState().jobs.get(depthTarget.id).lastPaint=0;
            depthOptions.onProgress({text:`提取 ${i} / 50 帧`,progress:i*2});
        }
    });
    assert.deepEqual(await page.evaluate(()=>({
        card:depthCard===document.querySelector(`.image-node[data-id="${depthTarget.id}"]`),
        icon:depthIcon===depthCard.querySelector('.local-depth-node-icon svg'),
        button:depthButton===depthCard.querySelector('[data-local-depth-action="cancel"]'),
        bar:depthBar===depthCard.querySelector('progress'),video:sourceVideo===document.querySelector('.image-node[data-id="source"] video'),
        value:depthBar.value,label:depthCard.querySelector('.local-depth-node-sub').textContent,
        animation:getComputedStyle(depthCard.querySelector('.local-depth-node-icon')).animationName
    })),{card:true,icon:true,button:true,bar:true,video:true,value:40,label:'本地处理 · 40%',animation:'none'});
    await page.locator('[data-local-depth-action="cancel"]').focus();
    await page.evaluate(()=>{
        const send=state=>{smartLocalDepthState().jobs.get(depthTarget.id).lastPaint=0;depthOptions.onProgress(state);};
        send({text:'正在读取视频…',progress:null});
        window.wasIndeterminate=!depthBar.hasAttribute('value');
        send({text:'提取 35 / 50 帧',progress:70});
    });
    assert.deepEqual(await page.evaluate(()=>({focus:document.activeElement===depthButton,indeterminate:wasIndeterminate,value:depthBar.value})),{focus:true,indeterminate:true,value:70});
    await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>depthCancelled),true);
    assert.equal(await page.locator('.local-depth-node strong').textContent(),'已取消');
    await page.evaluate(()=>depthOptions.onProgress({text:'提取 50 / 50 帧',progress:100}));
    assert.equal(await page.evaluate(()=>depthTarget.localDepth.progress),70);
    assert.equal(await page.locator('[data-local-depth-action="retry"]').count(),1);
    assert.deepEqual(errors,[]);
});

test('headless generation uses configured fps and produces a file without opening a panel',async t=>{
    const {page,requests}=await browserFixture(t);
    await page.keyboard.press('Escape');
    await page.evaluate(()=>{
        window.generated=null;window.backgroundError=null;
        window.backgroundJob=LocalDepthVideo.generate({url:'/input.mp4',config:{source:'modelscope',resolution:640,fps:15},
            onResult:file=>{window.generated={type:file.type,name:file.name};},onError:error=>{window.backgroundError=error.message;}});
    });
    await page.waitForFunction(()=>generated || backgroundError);
    assert.equal(await page.evaluate(()=>backgroundError),null);assert.equal(await page.locator('[role=dialog]').count(),0);
    assert.equal(await page.evaluate(()=>workerCalls.filter(type=>type==='frame').length),15);
    assert.deepEqual(await page.evaluate(()=>generated),{type:'video/mp4',name:'depth-video.mp4'});
    assert.ok(requests.every(request=>request.method==='GET'));
    await page.evaluate(()=>backgroundJob.close());
});

test('headless cancel stops model loading and exposes cancellation for the node',async t=>{
    const {page}=await browserFixture(t);await page.keyboard.press('Escape');
    await page.evaluate(()=>{
        window.stallWorker=true;window.cancelState=null;
        window.backgroundJob=LocalDepthVideo.generate({url:'/input.mp4',onError:error=>{window.cancelState=error.name;}});
    });
    await page.waitForFunction(()=>workerCalls.includes('load'));await page.evaluate(()=>backgroundJob.cancel());
    await page.waitForFunction(()=>cancelState==='AbortError');
    assert.equal(await page.locator('[role=dialog]').count(),0);assert.ok(await page.evaluate(()=>terminated>0));
    await page.evaluate(()=>backgroundJob.close());
});

test('removing a pending node disposes the job and restored placeholders require an explicit retry',async t=>{
    const {page,errors}=await require('./helpers/canvas-browser.cjs').fixture(t,'smart',true);
    await page.evaluate(()=>{
        nodes=[{id:'source',type:'smart-image',images:[{url:'/input.mp4',kind:'video'}]}];window.closedJobs=0;
        LocalDepthVideo.generate=()=>({close(){closedJobs++;},cancel(){},download(){}});
        const target=startSmartLocalDepthVideo('source',0);window.savedPlaceholder=JSON.parse(JSON.stringify(target));nodes=nodes.filter(node=>node!==target);render();
    });
    await page.waitForFunction(()=>closedJobs===1 && smartLocalDepthState().jobs.size===0);
    await page.evaluate(()=>{nodes.push(savedPlaceholder);render();});
    assert.equal(await page.locator('.local-depth-node strong').textContent(),'生成已中断');
    assert.equal(await page.locator('[data-local-depth-action="retry"]').textContent(),'重新生成');assert.deepEqual(errors,[]);
});

test('control center persists validated scoped defaults and keeps advanced model options collapsed',async t=>{
    const {page}=await browserFixture(t);await page.keyboard.press('Escape');
    await page.evaluate(()=>LocalDepthVideo.openSettings());
    assert.equal(await page.locator('.local-depth-settings details').evaluate(el=>el.open),false);
    await page.locator('[data-resolution]').selectOption('640');await page.locator('[data-fps]').selectOption('15');
    await page.locator('summary').click();await page.locator('[data-source]').selectOption('huggingface');await page.locator('[data-save]').click();
    assert.deepEqual(await page.evaluate(()=>LocalDepthVideo.getSettings()),{source:'huggingface',resolution:640,fps:15});
    await page.evaluate(()=>{window.CanvasSession={context:{member:{id:'other'},workspace:{id:'space'}}};});
    assert.deepEqual(await page.evaluate(()=>LocalDepthVideo.getSettings()),{source:'auto',resolution:960,fps:30});
    await page.evaluate(()=>LocalDepthVideo.openSettings());await page.setViewportSize({width:390,height:800});
    assert.ok(await page.locator('.local-depth-settings').evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
    await page.keyboard.press('Escape');assert.equal(await page.locator('[role=dialog]').count(),0);
});

test('node upload failure retains download and retries saving without regenerating',async t=>{
    const {page,errors}=await require('./helpers/canvas-browser.cjs').fixture(t,'smart',true);
    await page.evaluate(async()=>{
        nodes=[{id:'source',type:'smart-image',images:[{url:'/input.mp4',kind:'video'}]}];window.generatedJobs=0;window.uploadAttempts=0;
        LocalDepthVideo.generate=options=>{generatedJobs++;window.jobOptions=options;return {close(){},cancel(){},download(){window.didDownload=true;}};};
        uploadFiles=async()=>{if(++uploadAttempts===1)throw new Error('network');return [{url:'/result.mp4',kind:'video'}];};
        window.target=startSmartLocalDepthVideo('source',0);
        try{await jobOptions.onResult(new File(['file'],'depth.mp4',{type:'video/mp4'}));}catch(error){jobOptions.onError(error);}jobOptions.onFinally();
    });
    assert.equal(await page.locator('[data-local-depth-action="retry"]').textContent(),'重试保存');
    await page.locator('[data-local-depth-action="download"]').click();assert.equal(await page.evaluate(()=>didDownload),true);
    await page.locator('[data-local-depth-action="retry"]').click();await page.waitForFunction(()=>target.images.length===1);
    assert.equal(await page.evaluate(()=>generatedJobs),1);assert.equal(await page.evaluate(()=>uploadAttempts),2);assert.deepEqual(errors,[]);
});

test('local result cannot write after source, target or lease changes',async t=>{
    const {page,errors}=await require('./helpers/canvas-browser.cjs').fixture(t,'smart',true);
    for(const mutation of ['source','target','lease']){
        const outcome=await page.evaluate(async mutation=>{
            for(const job of smartLocalDepthState().jobs.values())job.runner.close();smartLocalDepthState().jobs.clear();
            if(!MemberCanvasEdit.canEdit)MemberCanvasEdit.setEditable(true);
            nodes=[{id:'source',type:'smart-image',images:[{url:'/input.mp4',kind:'video'}]}];let uploads=0;
            LocalDepthVideo.generate=options=>{window.protectedOptions=options;return {close(){},cancel(){},download(){}};};
            uploadFiles=async()=>{uploads++;return [{url:'/result.mp4',kind:'video'}];};
            const target=startSmartLocalDepthVideo('source',0);
            if(mutation==='source')nodes[0].images[0].url='/changed.mp4';
            if(mutation==='target')nodes=nodes.filter(node=>node!==target);
            if(mutation==='lease')MemberCanvasEdit.setEditable(false);
            let rejected=false;try{await protectedOptions.onResult(new File(['file'],'depth.mp4',{type:'video/mp4'}));}catch(_){rejected=true;}protectedOptions.onFinally();
            return {uploads,rejected,images:target.images.length};
        },mutation);
        assert.deepEqual(outcome,{uploads:0,rejected:true,images:0});
    }
    assert.deepEqual(errors,[]);
});
