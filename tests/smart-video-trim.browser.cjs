const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');
const clip=fs.readFileSync(path.join(__dirname,'fixtures/smart-video-trim.webm'));
async function serveClip(route){
    // Match the production file server: seeking requires a byte range response.
    const range=route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
    const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),clip.length-1):clip.length-1;
    const body=clip.subarray(start,end+1),headers={'accept-ranges':'bytes','content-length':String(body.length)};
    if(range)headers['content-range']=`bytes ${start}-${end}/${clip.length}`;
    return route.fulfill({status:range?206:200,headers,contentType:'video/webm',body});
}
async function trim(t,member=false){
    const f=await fixture(t,'smart',member);
    await f.page.route('**/assets/trim-*.webm',serveClip);
    await f.page.evaluate(()=>{
        const video=name=>({url:'/assets/trim-'+name+'.webm',name:name+'.webm',kind:'video',natural_w:160,natural_h:90});
        nodes=[{id:'a',type:'smart-image',images:[video('a'),video('b')],x:20,y:20},
            {id:'b',type:'smart-image',images:[video('b')],x:400,y:20},
            {id:'image',type:'smart-image',images:[{url:'/test-image.svg',kind:'image',natural_w:320,natural_h:240}],x:600,y:20}];
        render();window.trimSaves=0;window.trimUndos=0;
        const save=scheduleSave,undo=pushUndo;scheduleSave=()=>{trimSaves++;save();};pushUndo=()=>{trimUndos++;undo();};
        openImageEditor('a');
    });
    await f.page.waitForFunction(()=>smartPreviewGestures.videoState().readyState>=2);
    return f;
}
async function open(page){await page.click('#videoTrimToggleBtn');await page.waitForFunction(()=>smartVideoTrimPanel.state.active);}
async function range(page,start=.4,end=1.4){await page.evaluate(({start,end})=>{setVideoTrimValue('start',start,false);setVideoTrimValue('end',end,false);},{start,end});}
async function holdRequests(page){
    const requests=[];
    await page.route('**/api/smart-canvas/video-trim',route=>requests.push(route));
    return requests;
}
async function submit(page,requests){await page.evaluate(()=>{window.trimPromise=applyVideoTrim();});await page.waitForFunction(()=>smartVideoTrimPanel.state.busy);assert.ok(requests.length);}
async function finish(route,extra={}){await route.fulfill({json:{url:'/assets/trim-result.webm',name:'clip.webm',...extra}});}
async function settled(page){await page.evaluate(()=>window.trimPromise);}

test('Smart trim frozen session owns time controls, parsing/clamping/current-point commands and full-range validation',async t=>{
    const {page,errors}=await trim(t);await open(page);
    assert.deepEqual(await page.evaluate(()=>({frozen:Object.isFrozen(smartVideoTrimPanel)&&Object.isFrozen(smartVideoTrimPanel.state),global:typeof videoTrimState,duration:smartVideoTrimPanel.state.duration})),{frozen:true,global:'undefined',duration:2});
    assert.equal(await page.locator('#videoTrimApplyBtn').isDisabled(),true);
    await page.locator('#videoTrimStartInput').fill('00:00.40');await page.locator('#videoTrimStartInput').press('Tab');
    await page.locator('#videoTrimEndRange').fill('1.4');
    assert.equal(await page.evaluate(()=>smartVideoTrimPanel.state.start),.4);assert.equal(await page.evaluate(()=>smartVideoTrimPanel.state.end),1.4);
    assert.match(await page.locator('#videoTrimSummary').textContent(),/00:01.00/);
    assert.equal(await page.locator('#videoTrimApplyBtn').isDisabled(),false);
    await page.locator('#videoTrimStartInput').fill('invalid');await page.locator('#videoTrimStartInput').press('Tab');
    assert.equal(await page.evaluate(()=>smartVideoTrimPanel.state.start),.4);
    await page.evaluate(()=>smartPreviewGestures.seekVideo(.6));
    await page.waitForFunction(()=>Math.abs(smartPreviewGestures.videoState().currentTime-.6)<.01);
    await page.evaluate(()=>setVideoTrimPoint('start'));
    assert.equal(await page.evaluate(()=>smartVideoTrimPanel.state.start),.6);
    await page.evaluate(()=>setVideoTrimValue('end',10,false));assert.equal(await page.evaluate(()=>smartVideoTrimPanel.state.end),2);
    await page.getByRole('button',{name:'取消',exact:true}).click();assert.equal(await page.locator('#videoTrimPanel').isVisible(),false);
    assert.equal(await page.evaluate(()=>trimSaves),0);assert.deepEqual(errors,[]);
});

test('Smart trim segment playback stops at its end, returns to start and preserves the video',async t=>{
    const {page,errors}=await trim(t);await open(page);await range(page);
    await page.evaluate(()=>previewVideoTrim());assert.equal(await page.evaluate(()=>smartVideoTrimPanel.state.previewing),true);
    await page.waitForFunction(()=>!smartVideoTrimPanel.state.previewing);
    await page.waitForFunction(()=>Math.abs(smartPreviewGestures.videoState().currentTime-.4)<.01);
    assert.equal(await page.evaluate(()=>smartVideoTrimPanel.state.previewing),false);
    assert.equal(await page.evaluate(()=>smartPreviewGestures.videoState().currentTime),.4);
    assert.equal(await page.evaluate(()=>trimSaves),0);assert.deepEqual(errors,[]);
});

test('Smart trim success keeps request parameters, appends one video node, original undo/save schedule and opens the new clip',async t=>{
    const {page,errors}=await trim(t),requests=await holdRequests(page);await open(page);await range(page);await submit(page,requests);
    assert.deepEqual(requests[0].request().postDataJSON(),{url:'/assets/trim-a.webm',start_seconds:.4,end_seconds:1.4,name:'a.webm'});
    await page.evaluate(()=>{setVideoTrimValue('start',.7,false);applyVideoTrim();});assert.equal(requests.length,1);
    await finish(requests[0]);await settled(page);
    const state=await page.evaluate(()=>({count:nodes.length,last:nodes.at(-1).images[0],current:smartImageEditor.state.nodeId,saves:trimSaves,undos:trimUndos,panel:smartVideoTrimPanel.state.active}));
    assert.equal(state.count,4);assert.equal(state.last.clip_source_url,'/assets/trim-a.webm');assert.equal(state.last.clip_start,.4);assert.equal(state.last.clip_end,1.4);
    assert.ok(Math.abs(state.last.duration_seconds-1)<.0001);assert.equal(state.last.natural_w,160);assert.equal(state.last.natural_h,90);
    assert.notEqual(state.current,'a');assert.equal(state.saves,2);assert.equal(state.undos,1);assert.equal(state.panel,false);assert.deepEqual(errors,[]);
});

for(const change of ['panel-close','editor-close','switch-video','switch-image','delete-target','destroy'])test(`Smart submitted trim survives ${change} without reopening stale UI or using new player dimensions`,async t=>{
    const {page,errors}=await trim(t),requests=await holdRequests(page);await open(page);await range(page);await submit(page,requests);
    await page.evaluate(change=>{
        if(change==='panel-close')closeVideoTrimPanel();
        if(change==='editor-close')closeImageEditor();
        if(change==='switch-video')openImageEditor('a',1);
        if(change==='switch-image')openImageEditor('image');
        if(change==='delete-target'){nodes=nodes.filter(node=>node.id!=='a');}
        if(change==='destroy')smartImageEditor.destroy();
    },change);
    const before=await page.evaluate(()=>({open:smartImageEditor.state.open,current:smartImageEditor.state.nodeId,index:smartImageEditor.state.imageIndex}));
    await finish(requests[0]);await settled(page);
    assert.deepEqual(await page.evaluate(()=>({open:smartImageEditor.state.open,current:smartImageEditor.state.nodeId,index:smartImageEditor.state.imageIndex})),before);
    const item=await page.evaluate(()=>nodes.at(-1).images[0]);assert.equal(item.clip_start,.4);assert.equal(item.clip_end,1.4);assert.ok(Math.abs(item.duration_seconds-1)<.0001);assert.equal(item.natural_w,160);assert.equal(item.natural_h,90);
    assert.deepEqual(await page.evaluate(()=>({saves:trimSaves,undos:trimUndos,pending:smartVideoTrimPanel.state.pendingTasks})),{saves:2,undos:1,pending:0});assert.deepEqual(errors,[]);
});

test('Smart old trim completion cannot clear a reopened panel busy state or restore old range',async t=>{
    const {page,errors}=await trim(t),requests=await holdRequests(page);await open(page);await range(page);await submit(page,requests);
    await page.evaluate(()=>{window.firstTrim=trimPromise;closeVideoTrimPanel();});await open(page);await range(page,.6,1.6);await submit(page,requests);
    await finish(requests[0]);await page.evaluate(()=>firstTrim);
    assert.deepEqual(await page.evaluate(()=>({active:smartVideoTrimPanel.state.active,busy:smartVideoTrimPanel.state.busy,start:smartVideoTrimPanel.state.start,end:smartVideoTrimPanel.state.end,pending:smartVideoTrimPanel.state.pendingTasks})),{active:true,busy:true,start:.6,end:1.6,pending:1});
    assert.equal(await page.locator('#videoTrimApplyBtn').isDisabled(),true);
    await finish(requests[1]);await settled(page);assert.equal(await page.evaluate(()=>trimSaves),4);assert.deepEqual(errors,[]);
});

test('Smart trim response after a canvas switch retains its file without writing into the new canvas',async t=>{
    const {page,errors}=await trim(t),requests=await holdRequests(page);await open(page);await range(page);await submit(page,requests);
    await page.evaluate(()=>{closeImageEditor();canvas={...canvas,id:'new-canvas'};nodes=[];render();});
    await finish(requests[0]);await settled(page);
    assert.deepEqual(await page.evaluate(()=>({count:nodes.length,saves:trimSaves,undos:trimUndos,open:smartImageEditor.state.open})),{count:0,saves:0,undos:0,open:false});
    assert.equal(await page.evaluate(async()=>(await trimPromise).url),'/assets/trim-result.webm');assert.deepEqual(errors,[]);
});

for(const change of ['close','reopen','switch-video','canvas','destroy'])test(`Smart late metadata cannot activate obsolete trim session after ${change}`,async t=>{
    const {page,errors}=await trim(t),held=[];await page.route('**/assets/late-trim.webm',route=>held.push(route));
    await page.evaluate(()=>{nodes[0].images[0]={url:'/assets/late-trim.webm',kind:'video',natural_w:160,natural_h:90};openImageEditor('a');window.oldOpening=toggleVideoTrimPanel();});
    await page.waitForFunction(()=>smartVideoTrimPanel.state.opening);
    await page.evaluate(change=>{
        if(change==='close')closeVideoTrimPanel();
        if(change==='reopen'||change==='switch-video')openImageEditor('a',1);
        if(change==='canvas'){closeImageEditor();canvas={...canvas,id:'new-canvas'};}
        if(change==='destroy')smartImageEditor.destroy();
    },change);
    if(change==='reopen'){await page.waitForFunction(()=>smartPreviewGestures.videoState().readyState>=2);await open(page);await range(page,.6,1.6);}
    for(const route of held)await serveClip(route).catch(()=>{});
    await page.evaluate(()=>oldOpening);
    assert.equal(await page.evaluate(()=>smartVideoTrimPanel.state.active),change==='reopen');
    if(change==='reopen')assert.equal(await page.evaluate(()=>smartVideoTrimPanel.state.start),.6);
    assert.equal(await page.evaluate(()=>trimSaves),0);assert.deepEqual(errors,[]);
});

test('Smart trim cancels a pending seek and ignores late play failures after close/reopen',async t=>{
    const {page,errors}=await trim(t);await open(page);await range(page);
    await page.evaluate(()=>{
        const video=document.getElementById('previewCurrentVideo');window.playCalls=0;
        video.play=()=>{playCalls++;return Promise.resolve();};
        Object.defineProperty(video,'currentTime',{configurable:true,get:()=>0,set:()=>{}});
        window.oldSeeking=previewVideoTrim();closeVideoTrimPanel();delete video.currentTime;
    });
    await page.evaluate(()=>oldSeeking);assert.equal(await page.evaluate(()=>playCalls),0);
    await open(page);await range(page,0,1.4);
    await page.evaluate(()=>{const video=document.getElementById('previewCurrentVideo');video.play=()=>new Promise((resolve,reject)=>{window.failOldPlay=reject;});window.oldPlaying=previewVideoTrim();});
    await page.waitForFunction(()=>smartVideoTrimPanel.state.previewing);
    await page.evaluate(()=>{closeVideoTrimPanel();openImageEditor('a',1);});await page.waitForFunction(()=>smartPreviewGestures.videoState().readyState>=2);
    await open(page);await range(page,.6,1.6);await page.evaluate(()=>failOldPlay(new Error('late playback error')));await page.evaluate(()=>oldPlaying);
    assert.equal(await page.evaluate(()=>smartVideoTrimPanel.state.start),.6);assert.equal(await page.evaluate(()=>smartVideoTrimPanel.state.previewing),false);
    assert.doesNotMatch(await page.locator('#toast').textContent(),/无法播放/);assert.deepEqual(errors,[]);
});

test('Smart repeated bindings/openings and cached return keep one listener; close/destroy remove owned playback and controls',async t=>{
    const {page,errors}=await trim(t);
    await page.evaluate(()=>{
        const video=document.getElementById('previewCurrentVideo'),add=video.addEventListener.bind(video),remove=video.removeEventListener.bind(video),live=new Map();
        window.trimListenerCount=()=>[...live.values()].reduce((sum,set)=>sum+set.size,0);
        video.addEventListener=(type,fn,options)=>{if(['timeupdate','ended','seeked'].includes(type)){if(!live.has(type))live.set(type,new Set());live.get(type).add(fn);}return add(type,fn,options);};
        video.removeEventListener=(type,fn,options)=>{live.get(type)?.delete(fn);return remove(type,fn,options);};
        window.sharedTrimClicks=0;document.getElementById('videoTrimToggleBtn').addEventListener('click',()=>sharedTrimClicks++);
        for(let i=0;i<5;i++)smartVideoTrimPanel.bind();
    });
    for(let i=0;i<3;i++){await open(page);assert.equal(await page.evaluate(()=>trimListenerCount()),2);await page.evaluate(()=>closeVideoTrimPanel());assert.equal(await page.evaluate(()=>trimListenerCount()),0);}
    await open(page);await range(page);
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));assert.equal(await page.evaluate(()=>trimListenerCount()),0);
    assert.equal(await page.evaluate(()=>smartVideoTrimPanel.state.paused),true);
    await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
    assert.equal(await page.evaluate(()=>trimListenerCount()),2);assert.equal(await page.evaluate(()=>smartVideoTrimPanel.state.start),.4);
    await page.click('#videoTrimToggleBtn');assert.equal(await page.evaluate(()=>smartVideoTrimPanel.state.active),false);
    await page.evaluate(()=>{smartImageEditor.destroy();smartVideoTrimPanel.bind();toggleVideoTrimPanel();document.getElementById('videoTrimToggleBtn').click();});
    assert.equal(await page.evaluate(()=>trimListenerCount()),0);assert.equal(await page.evaluate(()=>sharedTrimClicks),6);assert.deepEqual(errors,[]);
});

test('Smart failed trim leaves range for retry and readonly submission preserves request/save guards',async t=>{
    const {page,errors}=await trim(t,true),requests=await holdRequests(page);await open(page);await range(page);await submit(page,requests);
    await requests[0].fulfill({status:500,json:{detail:'FFmpeg failed'}});await settled(page);
    assert.deepEqual(await page.evaluate(()=>({active:smartVideoTrimPanel.state.active,busy:smartVideoTrimPanel.state.busy,start:smartVideoTrimPanel.state.start,saves:trimSaves})),{active:true,busy:false,start:.4,saves:0});
    await page.evaluate(()=>MemberCanvasEdit.setEditable(false));await page.evaluate(()=>applyVideoTrim());assert.equal(requests.length,1);
    await page.evaluate(()=>MemberCanvasEdit.setEditable(true));await submit(page,requests);await finish(requests[1]);await settled(page);
    assert.equal(await page.evaluate(()=>trimSaves),2);assert.deepEqual(errors,[]);
});
