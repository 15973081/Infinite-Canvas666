const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');
const wav=fs.readFileSync(path.join(__dirname,'fixtures/smart-audio-preview.wav'));
const webm=fs.readFileSync(path.join(__dirname,'fixtures/smart-video-trim.webm'));
async function media(route){
    const audio=route.request().url().includes('.wav'),data=audio?wav:webm,range=route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
    const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),data.length-1):data.length-1;
    const body=data.subarray(start,end+1),headers={'accept-ranges':'bytes','content-length':String(body.length)};
    if(range)headers['content-range']=`bytes ${start}-${end}/${data.length}`;
    await route.fulfill({status:range?206:200,headers,contentType:audio?'audio/wav':'video/webm',body});
}
async function preview(t,member=false){
    const f=await fixture(t,'classic',member);
    await f.page.route('**/assets/classic-preview-*',media);
    await f.page.evaluate(()=>{
        const item=n=>({url:'/test-image.svg?'+n,kind:'image',run:{prompt:n,refs:[{url:'/test-image.svg?original'}]},runMs:1000});
        nodes=[{id:'out',type:'output',x:20,y:20,images:[item('a'),item('b')]},
            {id:'audio',type:'image',x:400,y:0,url:'/assets/classic-preview-a.wav',name:'Voice',mediaKind:'audio'},
            {id:'video',type:'image',x:700,y:0,url:'/assets/classic-preview-a.webm',name:'Movie',mediaKind:'video'},
            {id:'image',type:'image',x:2000,y:0,url:'/test-image.svg?node',name:'Image',mediaKind:'image'},
            {id:'child',type:'image',x:2200,y:0,url:'/test-image.svg?child',name:'Child',mediaKind:'image'},
            {id:'group',type:'group',x:2400,y:0,items:['image','child'],name:'Group'}];render();
        selected=new Set(['image']);window.previewSaves=0;window.previewUndos=0;
        const save=scheduleSave,undo=pushUndo;scheduleSave=()=>{previewSaves++;save();};pushUndo=()=>{previewUndos++;undo();};
        window.previewDownloads=[];window.MemberMediaDownload=(url,name)=>{previewDownloads.push({url,name});return true;};
    });return f;
}
async function open(page,id='out',index=0){
    await page.evaluate(({id,index})=>{const node=nodes.find(n=>n.id===id);openOutputLightbox(node.type==='output'?node.images[index].url:node.type==='group'?nodes.find(n=>n.id===node.items[index]).url:node.url,node);},{id,index});
    if(id==='audio')await page.waitForFunction(()=>document.querySelector('#outputLightboxAudioHost audio')?.readyState>=2);
    else if(id==='video')await page.waitForFunction(()=>document.getElementById('outputLightboxVideo').readyState>=2);
    else await page.waitForFunction(()=>document.getElementById('outputLightboxImg').naturalWidth>0);
}
async function remember(page,audio=true){await page.evaluate(audio=>{window.retiredPreviewPlayer=audio?document.querySelector('#outputLightboxAudioHost audio'):document.getElementById('outputLightboxVideo');},audio);}
async function released(page,audio=true){assert.deepEqual(await page.evaluate(()=>({paused:retiredPreviewPlayer.paused,src:retiredPreviewPlayer.getAttribute('src'),ready:retiredPreviewPlayer.readyState,connected:retiredPreviewPlayer.isConnected})),{paused:true,src:null,ready:0,connected:!audio});}

test('Classic viewed accounting, navigation, prompt, downloads and selection match the recorded baseline',async t=>{
    const {page,errors}=await preview(t);await open(page);await page.click('#outputDownloadBtn');
    assert.deepEqual(await page.evaluate(()=>({saves:previewSaves,selected:[...selected],prompt:classicOutputPreview.state.prompt})),{saves:1,selected:['image'],prompt:'a'});
    await open(page);assert.equal(await page.evaluate(()=>previewSaves),1);
    await page.keyboard.press('ArrowRight');await page.click('#outputDownloadBtn');
    assert.equal(await page.evaluate(()=>classicOutputPreview.state.prompt),'b');assert.equal(await page.evaluate(()=>previewSaves),2);
    assert.deepEqual(await page.evaluate(()=>previewDownloads.map(item=>item.url)),['/test-image.svg?a','/test-image.svg?b']);
    assert.deepEqual(await page.evaluate(()=>nodes[0].images.map(item=>item.viewed)),[true,true]);
    await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>classicOutputPreview.state.prompt),'a');
    await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>classicOutputPreview.state.open),false);assert.deepEqual(errors,[]);
});

test('Classic compare slider, zoom and pan preserve geometry; media switch resets gestures and comparison',async t=>{
    const {page,errors}=await preview(t);await open(page);
    await page.locator('#outputPreview').dblclick({position:{x:180,y:160}});
    assert.equal(await page.evaluate(()=>classicOutputPreview.state.compareOn),true);
    const rect=await page.locator('#outputCompareContainer').boundingBox();
    await page.mouse.move(rect.x+rect.width*.3,rect.y+rect.height*.3);await page.mouse.down();await page.mouse.up();
    assert.ok(Math.abs(await page.evaluate(()=>classicOutputPreview.state.comparePosition)-30)<.1);
    await page.mouse.wheel(0,-100);assert.ok(Math.abs(await page.evaluate(()=>classicOutputPreview.state.zoom)-1.1)<1e-6);
    await page.locator('#outputPreview').dblclick({position:{x:180,y:160}});
    const before=await page.evaluate(()=>classicOutputPreview.state.pan);
    await page.mouse.move(rect.x+200,rect.y+200);await page.mouse.down();await page.mouse.move(rect.x+220,rect.y+210);await page.mouse.up();
    const after=await page.evaluate(()=>classicOutputPreview.state.pan);assert.ok(Math.abs(after.x-before.x-20)<1);assert.ok(Math.abs(after.y-before.y-10)<1);
    await open(page,'video');assert.deepEqual(await page.evaluate(()=>({compare:classicOutputPreview.state.compareOn,zoom:classicOutputPreview.state.zoom,drag:classicOutputPreview.state.dragging})),{compare:false,zoom:1,drag:false});assert.deepEqual(errors,[]);
});

test('Classic native video and audio play, switch sources, keep one player and release every media resource',async t=>{
    const {page,errors}=await preview(t);await open(page,'video');await remember(page,false);
    await page.evaluate(()=>document.getElementById('outputLightboxVideo').play());await page.waitForFunction(()=>document.getElementById('outputLightboxVideo').currentTime>.08);
    assert.equal(await page.locator('#outputResolution').textContent(),'160 x 90');
    await open(page,'audio');await released(page,false);await remember(page);
    await page.evaluate(()=>document.querySelector('#outputLightboxAudioHost audio').play());await page.waitForFunction(()=>document.querySelector('#outputLightboxAudioHost audio').currentTime>.08);
    assert.equal(await page.locator('#outputLightboxAudioTitle').textContent(),'Voice');await page.click('#outputDownloadBtn');
    await page.evaluate(()=>{nodes[1].url='/assets/classic-preview-b.wav';openOutputLightbox(nodes[1].url,nodes[1]);});
    await page.waitForFunction(()=>document.querySelector('#outputLightboxAudioHost audio')?.readyState>=2);await released(page);
    assert.equal(await page.locator('#outputLightboxAudioHost audio').count(),1);await remember(page);await page.keyboard.press('Escape');await released(page);
    assert.equal(await page.evaluate(()=>previewSaves),0);assert.deepEqual(errors,[]);
});

test('Classic group navigation and submitted zip download retain their existing scope after close',async t=>{
    const {page,errors}=await preview(t),requests=[];await page.route('**/api/canvas-assets/download',route=>requests.push(route));
    await open(page,'group');assert.equal(await page.locator('#outputDownloadAllBtn').isVisible(),true);
    await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>classicOutputPreview.state.url),'/test-image.svg?child');
    const request=page.waitForEvent('request',{predicate:r=>r.url().endsWith('/api/canvas-assets/download')});
    await page.click('#outputDownloadAllBtn');await request;
    assert.equal(requests.length,1);const payload=requests[0].request().postDataJSON();assert.equal(payload.items.length,2);
    const download=page.waitForEvent('download');await page.keyboard.press('Escape');await requests[0].fulfill({contentType:'application/zip',body:Buffer.from('preview-zip')});
    await download;assert.equal(await page.evaluate(()=>classicOutputPreview.state.open),false);assert.equal(await page.evaluate(()=>previewSaves),0);assert.deepEqual(errors,[]);
});

test('Classic detached reference and log previews stay usable without inventing a node target',async t=>{
    const {page,errors}=await preview(t);
    await page.evaluate(()=>openOutputLightbox('/test-image.svg?reference',{type:'image',url:'/test-image.svg?reference',mediaKind:'image',name:'Ref'}));
    await page.click('#outputDownloadBtn');assert.equal(await page.evaluate(()=>classicOutputPreview.state.targetValid),true);
    await page.evaluate(()=>openOutputLightbox('/test-image.svg?log',null));await page.click('#outputDownloadBtn');
    await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>classicOutputPreview.state.url),'/test-image.svg?b');
    assert.equal(await page.evaluate(()=>previewDownloads.length),2);assert.deepEqual(errors,[]);
});

for(const change of ['node','url','kind','canvas','no-canvas'])test(`Classic invalid ${change} forbids operations but real Escape still closes and releases`,async t=>{
    const {page,errors}=await preview(t);await open(page,'audio');await remember(page);
    await page.evaluate(change=>{
        if(change==='node')nodes=nodes.map(n=>n.id==='audio'?{...n}:n);
        if(change==='url')nodes[1].url='/assets/classic-preview-b.wav';
        if(change==='kind')nodes[1].mediaKind='image';
        if(change==='canvas')canvas={...canvas,id:'other'};
        if(change==='no-canvas')canvas=null;
        classicOutputPreview.download();
    },change);
    assert.deepEqual(await page.evaluate(()=>({open:classicOutputPreview.state.open,valid:classicOutputPreview.state.targetValid,downloads:previewDownloads.length,protected:classicOutputPreview.isPreviewingNode(nodes[1])})),{open:true,valid:false,downloads:0,protected:false});
    await page.keyboard.press('Escape');await released(page);assert.equal(await page.evaluate(()=>classicOutputPreview.state.open),false);assert.deepEqual(errors,[]);
});

test('Classic same-source metadata copies survive saves; removed output or group child closes through render notifications',async t=>{
    const {page,errors}=await preview(t);await open(page);
    await page.evaluate(async()=>{nodes[0].images=nodes[0].images.map(item=>({...item}));await saveCanvas();render();});
    assert.equal(await page.evaluate(()=>classicOutputPreview.state.targetValid),true);
    await page.evaluate(()=>{nodes[0].images.shift();refreshNodes(['out']);});assert.equal(await page.evaluate(()=>classicOutputPreview.state.open),false);
    await open(page,'group');await page.evaluate(()=>{nodes=nodes.filter(n=>n.id!=='image');render();});
    assert.equal(await page.evaluate(()=>classicOutputPreview.state.open),false);assert.deepEqual(errors,[]);
});

for(const change of ['close','switch','canvas','destroy'])test(`Classic delayed image load and metadata after ${change} cannot update the new preview`,async t=>{
    const {page,errors}=await preview(t),held=[];await page.route('**/late-preview.svg',route=>held.push(route));
    const request=page.waitForEvent('request',{predicate:r=>r.url().endsWith('late-preview.svg')});
    await page.evaluate(()=>{nodes[3].url='/late-preview.svg';openOutputLightbox(nodes[3].url,nodes[3]);window.oldPreviewLoad=document.getElementById('outputLightboxImg').onload;});await request;
    await page.evaluate(change=>{if(change==='close')closeOutputLightbox();if(change==='switch')openOutputLightbox(nodes[1].url,nodes[1]);if(change==='canvas'){canvas={...canvas,id:'other'};render();}if(change==='destroy')classicOutputPreview.destroy();},change);
    const before=await page.evaluate(()=>({state:classicOutputPreview.state,resolution:document.getElementById('outputResolution').innerHTML}));
    for(const route of held)await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="888" height="444"/>'}).catch(()=>{});
    await page.evaluate(()=>oldPreviewLoad());assert.deepEqual(await page.evaluate(()=>({state:classicOutputPreview.state,resolution:document.getElementById('outputResolution').innerHTML})),before);assert.deepEqual(errors,[]);
});

test('Classic old video metadata and trim frames cannot affect a reopened source',async t=>{
    const {page,errors}=await preview(t);await open(page,'video');
    await page.evaluate(()=>{
        window.oldPreviewMetadata=document.getElementById('outputLightboxVideo').onloadedmetadata;
        const raf=requestAnimationFrame;window.previewFrames=[];requestAnimationFrame=fn=>{previewFrames.push(fn);return raf(fn);};
        toggleOutputVideoTrim();setOutputTrimValue('end',1,false);previewOutputVideoTrim();closeOutputLightbox();openOutputLightbox(nodes[2].url,nodes[2]);
        toggleOutputVideoTrim();setOutputTrimValue('start',.2,false);window.beforeRetiredFrame=classicOutputPreview.state;
        oldPreviewMetadata();for(const fn of previewFrames)fn();requestAnimationFrame=raf;
    });assert.deepEqual(await page.evaluate(()=>classicOutputPreview.state),await page.evaluate(()=>beforeRetiredFrame));assert.deepEqual(errors,[]);
});

for(const change of ['close','switch'])test(`Classic delayed video metadata after ${change} cannot update the current presentation`,async t=>{
    const {page,errors}=await preview(t),held=[];
    await page.route('**/assets/classic-preview-late.webm',route=>held.push(route));
    const request=page.waitForEvent('request',{predicate:r=>r.url().endsWith('classic-preview-late.webm')});
    await page.evaluate(()=>{nodes[2].url='/assets/classic-preview-late.webm';openOutputLightbox(nodes[2].url,nodes[2]);window.oldVideoMetadata=document.getElementById('outputLightboxVideo').onloadedmetadata;});await request;
    if(change==='close')await page.keyboard.press('Escape');else await open(page,'audio');
    const before=await page.evaluate(()=>({state:classicOutputPreview.state,resolution:document.getElementById('outputResolution').innerHTML}));
    for(const route of held)await media(route).catch(()=>{});
    await page.evaluate(()=>oldVideoMetadata());assert.deepEqual(await page.evaluate(()=>({state:classicOutputPreview.state,resolution:document.getElementById('outputResolution').innerHTML})),before);
    assert.equal(await page.locator('#outputLightboxVideo').getAttribute('src'),null);assert.deepEqual(errors,[]);
});

test('Classic failed trim can retry without changing its source or duplicating submitted writes',async t=>{
    const {page,errors}=await preview(t),requests=[];await page.route('**/api/smart-canvas/video-trim',route=>requests.push(route));await open(page,'video');
    await page.evaluate(()=>{toggleOutputVideoTrim();setOutputTrimValue('end',1,false);window.previewTrimPromise=applyOutputVideoTrim();applyOutputVideoTrim();});
    await page.waitForFunction(()=>classicOutputPreview.state.trimBusy);assert.equal(requests.length,1);
    await requests[0].fulfill({status:500,json:{detail:'trim failed'}});await page.evaluate(()=>previewTrimPromise);
    assert.equal(await page.evaluate(()=>classicOutputPreview.state.trimBusy),false);assert.match(await page.locator('#outputTrimSummary').textContent(),/trim failed/);
    assert.equal(await page.evaluate(()=>previewSaves),0);assert.equal(await page.evaluate(()=>previewUndos),0);
    await page.evaluate(()=>{window.previewTrimPromise=applyOutputVideoTrim();});await page.waitForFunction(()=>classicOutputPreview.state.trimBusy);
    assert.equal(requests.length,2);await requests[1].fulfill({json:{url:'/assets/classic-preview-result.webm',name:'clip.webm'}});await page.evaluate(()=>previewTrimPromise);
    assert.equal(await page.evaluate(()=>nodes[2].url),'/assets/classic-preview-a.webm');assert.equal(await page.evaluate(()=>previewSaves),1);assert.equal(await page.evaluate(()=>previewUndos),1);
    assert.equal(await page.evaluate(()=>classicOutputPreview.state.url),'/assets/classic-preview-result.webm');assert.deepEqual(errors,[]);
});

test('Classic repeated binding removes only owned handlers, copy timers and dragging are cleaned, destroy is final',async t=>{
    const {page,errors}=await preview(t);await page.evaluate(()=>{
        const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener,records=[];
        const owned=(el,type)=>(el===window&&['pagehide','pageshow','mousemove','mouseup','touchmove','touchend'].includes(type))||Boolean(el.closest?.('#outputLightbox'));
        EventTarget.prototype.addEventListener=function(type,fn,options){if(owned(this,type))records.push({el:this,type,fn,live:true});return add.call(this,type,fn,options);};
        EventTarget.prototype.removeEventListener=function(type,fn,options){for(const r of records)if(r.el===this&&r.type===type&&r.fn===fn)r.live=false;return remove.call(this,type,fn,options);};
        window.previewListenerCount=()=>records.filter(r=>r.live).length;window.sharedPreviewClicks=0;
        document.getElementById('outputDownloadBtn').addEventListener('click',()=>sharedPreviewClicks++);
        classicOutputPreview.bind();window.firstPreviewListeners=previewListenerCount();for(let i=0;i<8;i++)classicOutputPreview.bind();
    });assert.equal(await page.evaluate(()=>previewListenerCount()),await page.evaluate(()=>firstPreviewListeners));
    await open(page);await page.evaluate(()=>{window.activePreviewListeners=previewListenerCount();});
    await page.click('#outputCopyPromptBtn');assert.equal(await page.locator('#outputCopyPromptBtn').evaluate(el=>el.classList.contains('copied')),true);
    await page.click('#outputDownloadBtn');assert.equal(await page.evaluate(()=>sharedPreviewClicks),1);assert.equal(await page.evaluate(()=>previewDownloads.length),1);
    await page.keyboard.press('Escape');assert.equal(await page.locator('#outputCopyPromptBtn').evaluate(el=>el.classList.contains('copied')),false);
    assert.equal(await page.evaluate(()=>previewListenerCount()),await page.evaluate(()=>firstPreviewListeners));
    await open(page);assert.equal(await page.evaluate(()=>previewListenerCount()),await page.evaluate(()=>activePreviewListeners));
    await page.evaluate(()=>classicOutputPreview.destroy());assert.equal(await page.evaluate(()=>previewListenerCount()),1);
    await page.evaluate(()=>{classicOutputPreview.bind();classicOutputPreview.open(nodes[0].images[0].url,nodes[0]);for(const [name,fn] of Object.entries(classicOutputPreview))if(typeof fn==='function'&&!['isPreviewingNode','open','state'].includes(name))fn();document.getElementById('outputDownloadBtn').click();});
    assert.equal(await page.evaluate(()=>sharedPreviewClicks),2);assert.equal(await page.evaluate(()=>previewDownloads.length),1);assert.equal(await page.evaluate(()=>classicOutputPreview.state.destroyed),true);assert.deepEqual(errors,[]);
});

test('Classic cached page return restores controls without reopening or playing; permanent departure destroys',async t=>{
    const {page,errors}=await preview(t);await open(page,'audio');await remember(page);
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));await released(page);
    assert.deepEqual(await page.evaluate(()=>({open:classicOutputPreview.state.open,paused:classicOutputPreview.state.paused})),{open:false,paused:true});
    await page.evaluate(()=>{openOutputLightbox(nodes[1].url,nodes[1]);window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
    assert.equal(await page.locator('#outputLightboxAudioHost audio').count(),0);await open(page,'audio');
    assert.equal(await page.locator('#outputLightboxAudioHost audio').evaluate(el=>el.paused),true);await remember(page);
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false})));await released(page);
    assert.equal(await page.evaluate(()=>classicOutputPreview.state.destroyed),true);assert.deepEqual(errors,[]);
});

for(const ending of ['close','switch','destroy','canvas','readonly'])test(`Classic submitted trim after ${ending} preserves task completion, save and undo without reopening stale UI`,async t=>{
    const {page,errors}=await preview(t,ending==='readonly'),requests=[];
    await page.route('**/api/smart-canvas/video-trim',route=>requests.push(route));await open(page,'video');
    await page.evaluate(()=>{toggleOutputVideoTrim();setOutputTrimValue('start',.4,false);setOutputTrimValue('end',1.4,false);window.previewTrimPromise=applyOutputVideoTrim();});
    await page.waitForFunction(()=>classicOutputPreview.state.trimBusy);assert.equal(requests.length,1);
    assert.deepEqual({...requests[0].request().postDataJSON(),name:undefined},{url:'/assets/classic-preview-a.webm',start_seconds:.4,end_seconds:1.4,name:undefined});
    await page.evaluate(ending=>{if(ending==='close')closeOutputLightbox();if(ending==='switch')openOutputLightbox(nodes[1].url,nodes[1]);if(ending==='destroy')classicOutputPreview.destroy();if(ending==='canvas'){canvas={...canvas,id:'other'};classicOutputPreview.reset();}if(ending==='readonly')MemberCanvasEdit.setEditable(false);},ending);
    await requests[0].fulfill({json:{url:'/assets/classic-preview-result.webm',name:'clip.webm',duration_seconds:1}});await page.evaluate(()=>previewTrimPromise);
    const blocked=['canvas','readonly'].includes(ending);
    assert.deepEqual(await page.evaluate(()=>({count:nodes.length,save:previewSaves,undo:previewUndos,busy:classicOutputPreview.state.trimBusy})),{count:blocked?6:7,save:blocked?0:1,undo:blocked?0:1,busy:false});
    if(!blocked)assert.deepEqual(await page.evaluate(()=>({url:nodes.at(-1).url,w:nodes.at(-1).natural_w,h:nodes.at(-1).natural_h,start:nodes.at(-1).clip_start,end:nodes.at(-1).clip_end})),{url:'/assets/classic-preview-result.webm',w:160,h:90,start:.4,end:1.4});
    if(ending==='switch')assert.equal(await page.evaluate(()=>classicOutputPreview.state.kind),'audio');
    else if(ending!=='readonly')assert.equal(await page.evaluate(()=>classicOutputPreview.state.open),false);
    assert.deepEqual(errors,[]);
});

test('Classic readonly preview retains viewed effects and downloads while the original save guard forbids writes',async t=>{
    const {page,errors,writes}=await preview(t,true);await page.evaluate(()=>MemberCanvasEdit.setEditable(false));await open(page);await page.click('#outputDownloadBtn');
    await page.evaluate(()=>saveCanvas());assert.equal(await page.evaluate(()=>previewSaves),1);
    assert.equal(writes.filter(w=>w.path==='/api/canvases/canvas-test'&&w.method==='PUT').length,0);
    assert.equal(await page.evaluate(()=>previewDownloads.length),1);assert.deepEqual(errors,[]);
});

for(const operation of ['delete','clear','undo','redo','draft','reload'])test(`Classic ${operation} invalidates replaced targets through the original document path`,async t=>{
    const {page,errors}=await preview(t,operation==='draft');await open(page,'audio');await remember(page);
    await page.evaluate(async operation=>{
        if(operation==='delete')deleteNode('audio');
        if(operation==='clear')clearNodeContentBeforeDelete('audio');
        if(operation==='undo'){pushUndo();nodes[1].x+=10;performUndo();}
        if(operation==='redo'){pushUndo();nodes[1].x+=10;performUndo();openOutputLightbox(nodes[1].url,nodes[1]);performRedo();}
        if(operation==='draft')restoreClassicMemberDraft({...canvas,nodes:JSON.parse(JSON.stringify(nodes)),connections:[]});
        if(operation==='reload')await openCanvas(canvas.id);
    },operation);
    assert.equal(await page.evaluate(()=>classicOutputPreview.state.open),false);await released(page);assert.deepEqual(errors,[]);
});

test('Classic media retention protects an offscreen preview and releases it after close',async t=>{
    const {page,errors}=await preview(t);
    await page.evaluate(()=>{selected.clear();viewport={x:0,y:0,scale:1};nodes[3].x=20;render();});
    await page.waitForFunction(()=>{const img=document.querySelector('.node[data-id="image"] img');return img?.complete&&img.naturalWidth>0;});
    await page.evaluate(()=>{nodes[3].x=4000;openOutputLightbox(nodes[3].url,nodes[3]);});
    assert.equal(await page.evaluate(()=>classicOutputPreview.isPreviewingNode(nodes[3])),true);
    await page.evaluate(()=>refreshCanvasMediaVisibility());
    assert.equal(await page.locator('.node[data-id="image"] img').getAttribute('data-canvas-media-suspended'),null);
    await page.keyboard.press('Escape');await page.evaluate(()=>refreshCanvasMediaVisibility());
    assert.equal(await page.evaluate(()=>classicOutputPreview.isPreviewingNode(nodes[3])),false);
    assert.equal(await page.locator('.node[data-id="image"] img').getAttribute('data-canvas-media-suspended'),'1');
    assert.deepEqual(errors,[]);
});

test('Classic legacy image metadata still uses URL-based media fallback without invalidating the target',async t=>{
    const {page,errors}=await preview(t);
    await page.evaluate(()=>{nodes[1].mediaKind='image';openOutputLightbox(nodes[1].url,nodes[1]);});
    await page.waitForFunction(()=>document.querySelector('#outputLightboxAudioHost audio')?.readyState>=2);
    assert.equal(await page.evaluate(()=>classicOutputPreview.state.kind),'audio');assert.equal(await page.evaluate(()=>classicOutputPreview.state.targetValid),true);
    await page.click('#outputDownloadBtn');assert.equal(await page.evaluate(()=>previewDownloads.length),1);assert.deepEqual(errors,[]);
});

for(const kind of ['audio','video'])test(`Classic legacy string ${kind} results preserve playback, download and zero viewed-save behavior`,async t=>{
    const {page,errors}=await preview(t);
    await page.evaluate(kind=>{nodes[0].images=['/assets/classic-preview-legacy.'+(kind==='audio'?'wav':'webm')];openOutputLightbox(nodes[0].images[0],nodes[0]);},kind);
    await page.waitForFunction(kind=>{const player=kind==='audio'?document.querySelector('#outputLightboxAudioHost audio'):document.getElementById('outputLightboxVideo');return player?.readyState>=2;},kind);
    assert.equal(await page.evaluate(()=>classicOutputPreview.state.kind),kind);assert.equal(await page.evaluate(()=>classicOutputPreview.state.targetValid),true);
    await page.evaluate(kind=>(kind==='audio'?document.querySelector('#outputLightboxAudioHost audio'):document.getElementById('outputLightboxVideo')).play(),kind);
    await page.waitForFunction(kind=>(kind==='audio'?document.querySelector('#outputLightboxAudioHost audio'):document.getElementById('outputLightboxVideo')).currentTime>.08,kind);
    await page.click('#outputDownloadBtn');assert.equal(await page.evaluate(()=>previewDownloads.length),1);assert.equal(await page.evaluate(()=>previewSaves),0);
    await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>classicOutputPreview.state.open),false);assert.deepEqual(errors,[]);
});

test('Classic submitted single download completes after closing and revokes only its own blob',async t=>{
    const {page,errors}=await preview(t),held=[];await open(page);
    await page.evaluate(()=>{window.MemberMediaDownload=null;window.previewBlobUrls=[];const revoke=URL.revokeObjectURL;URL.revokeObjectURL=url=>{previewBlobUrls.push(url);revoke.call(URL,url);};});
    await page.route('**/test-image.svg?a',route=>held.push(route));
    const request=page.waitForEvent('request',{predicate:r=>r.url().endsWith('/test-image.svg?a')});
    await page.click('#outputDownloadBtn');await request;await page.keyboard.press('Escape');
    const download=page.waitForEvent('download');await held[0].fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"/>'});await download;
    await page.waitForFunction(()=>previewBlobUrls.length===1);assert.match(await page.evaluate(()=>previewBlobUrls[0]),/^blob:/);
    assert.equal(await page.evaluate(()=>classicOutputPreview.state.open),false);assert.deepEqual(errors,[]);
});

test('Classic switching an open preview retains media priority and flushes deferred background work only on close',async t=>{
    const {page,errors}=await preview(t);await open(page);
    await page.evaluate(()=>{window.previewDeferredRuns=0;CanvasMediaLoader.defer(()=>previewDeferredRuns++);openOutputLightbox(nodes[1].url,nodes[1]);});
    await page.evaluate(()=>Promise.resolve());assert.equal(await page.evaluate(()=>previewDeferredRuns),0);
    await page.keyboard.press('Escape');await page.waitForFunction(()=>previewDeferredRuns===1);
    assert.deepEqual(errors,[]);
});
