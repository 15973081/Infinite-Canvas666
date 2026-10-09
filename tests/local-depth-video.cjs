const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),vm=require('node:vm');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
// Two real H.264 frames, one second. No supplier or model network calls in regression tests.
const input=Buffer.from('AAAAHGZ0eXBpc29tAAACAGlzb21hdmMxbXA0MQAAArRtb292AAAAbG12aGQAAAAA5u37f+bt+38AAOEAAADhAAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAACQHRyYWsAAABcdGtoZAAAAAPm7ft/5u37fwAAAAEAAAAAAADhAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAQAAAAEAAAAAAAdxtZGlhAAAAIG1kaGQAAAAA5u37f+bt+38AAAACAAAAAlXEAAAAAAA3aGRscgAAAABtaGxydmlkZQAAAAAAAAAAAAAAAE1lZGlhYnVubnlWaWRlb0hhbmRsZXIAAAABfW1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAT1zdGJsAAAAuXN0c2QAAAAAAAAAAQAAAKlhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAEAAQABIAAAASAAAAAAAAAABEk1lZGlhYnVubnkgdjEuNjEuMwAAAAAAAAAAAAAAAAAAGP//AAAALGF2Y0MBZAwJ/+EAEWdkDAmsGNCEk1AQ0BB4RCNQAQAEaM48gP34+AAAAAATY29scm5jbHgAAQANAAEAAAAAFGJ0cnQAAAAAAAACMAAAAjAAAAAYc3R0cwAAAAAAAAABAAAAAgAAAAEAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAEAAAABAAAAHHN0c3oAAAAAAAAAAAAAAAIAAAAeAAAAKAAAABhzdGNvAAAAAAAAAAIAAALYAAAC9gAAABRzdHNzAAAAAAAAAAEAAAABAAAATm1kYXQAAAAaZbgABAn///h6KAAIJ/k5OTrrrrrrrrrrrrwAAAAkYeAAfkCfN//8PRQABBI+JxeJ8T57F5/P5/Pefz+fzyZ/P5/A','base64');
const muxStub=`export class BufferTarget{buffer=new Uint8Array([1,2,3])} export class Mp4OutputFormat{} export class Output{constructor(o){this.target=o.target}addVideoTrack(){}async start(){}async finalize(){}async cancel(){window.encodingCancelled=true}} export class CanvasSource{async add(t,d){window.encodedFrames.push([t,d])}}`;
async function browserFixture(t){
    const server=http.createServer((req,res)=>{
        if(req.url==='/input.mp4'){res.setHeader('Content-Type','video/mp4');return res.end(input);}
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
            postMessage(data){window.workerCalls.push(data.type);if(window.stallWorker)return;
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
    const start=source.indexOf('function openSmartLocalDepthVideo('),code=source.slice(start,source.indexOf('\n}',start)+2);
    for(const change of ['lock','canvas','source'])for(const after of [false,true]){
        const node={id:'v',x:1,y:1,images:[{url:'/input.mp4',kind:'video'}]},ctx=vm.createContext({nodes:[node],canvas:{id:'one'},locked:false,saves:0,uploads:0,mediaKindForItem:i=>i.kind,imageForDisplay:i=>i,displayMediaUrl:i=>i.url,canvasTaskWriteGuard:()=>({check(){}}),window:{LocalDepthVideo:{open:o=>o}},pushUndo(){},appendImagesToSmartNode(){ctx.saves++},isSmartCanvasLocked:()=>ctx.locked});
        const mutate=()=>{if(change==='lock')ctx.locked=true;else if(change==='canvas')ctx.canvas.id='two';else node.images[0].url='replaced';};
        ctx.uploadFiles=async()=>{ctx.uploads++;if(after)mutate();return [{url:'/result.mp4'}]};
        vm.runInContext(code,ctx);const panel=ctx.openSmartLocalDepthVideo('v',0);if(!after)mutate();
        await assert.rejects(panel.save({}),/变化/);assert.equal(ctx.saves,0);assert.equal(ctx.uploads,after?1:0);
    }
});
test('smart video toolbar opens the local panel and keeps existing preview behavior',async t=>{
    const {page,errors}=await require('./helpers/canvas-browser.cjs').fixture(t,'smart',true);
    await page.route('**/input.mp4',route=>route.fulfill({contentType:'video/mp4',body:input}));
    await page.evaluate(()=>{nodes=[{id:'depth-source',type:'smart-image',x:20,y:20,images:[{url:'/input.mp4',kind:'video',name:'input.mp4'}]}];smartSelection.createdNode('depth-source');render();});
    assert.equal(await page.locator('[data-smart-node-action="depth-video"]').count(),1);
    await page.evaluate(()=>runSmartNodeToolbarAction('depth-source','depth-video'));
    assert.equal(await page.locator('.local-depth-dialog').count(),1);
    await page.keyboard.press('Escape');
    await page.evaluate(()=>runSmartNodeToolbarAction('depth-source','preview'));
    await page.waitForFunction(()=>document.getElementById('previewCurrentVideo').currentSrc.includes('input.mp4'));
    assert.deepEqual(await page.evaluate(()=>nodes[0].images.map(({url,kind,name})=>({url,kind,name}))),[{url:'/input.mp4',kind:'video',name:'input.mp4'}]);
    assert.deepEqual(errors,[]);
});
