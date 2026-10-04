const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');
const wav=fs.readFileSync(path.join(__dirname,'fixtures/smart-audio-preview.wav'));
async function serveAudio(route){
    const range=route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
    const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),wav.length-1):wav.length-1;
    const body=wav.subarray(start,end+1),headers={'accept-ranges':'bytes','content-length':String(body.length)};
    if(range)headers['content-range']=`bytes ${start}-${end}/${wav.length}`;
    return route.fulfill({status:range?206:200,headers,contentType:'audio/wav',body});
}
async function audio(t,{member=false,finished=false}={}){
    const f=await fixture(t,'smart',member);
    await f.page.route('**/assets/audio-*.wav',serveAudio);
    await f.page.evaluate(finished=>{
        const item=name=>({url:'/assets/audio-'+name+'.wav',name:name+'.wav',kind:'audio'});
        nodes=[{id:'a',type:'smart-image',images:[item('a'),item('b')],x:20,y:20,...(finished?{runFinishedAt:100}:{})},
            {id:'b',type:'smart-image',images:[item('b')],x:400,y:20},
            {id:'image',type:'smart-image',images:[{url:'/test-image.svg',kind:'image',natural_w:320,natural_h:240}],x:600,y:20}];
        render();window.audioSaves=0;const save=scheduleSave;scheduleSave=()=>{audioSaves++;save();};
        window.audioDownloads=[];window.MemberMediaDownload=(url,name)=>{audioDownloads.push({url,name});return true;};
    },finished);
    return f;
}
async function ready(page){await page.waitForFunction(()=>document.querySelector('#smartAudioLightboxHost audio')?.readyState>=2,{},{timeout:5000});}
async function open(page,index=0){await page.evaluate(index=>openSmartAudioLightbox('a',index),index);await ready(page);}
async function play(page){
    await page.evaluate(()=>document.querySelector('#smartAudioLightboxHost audio').play());
    await page.waitForFunction(()=>document.querySelector('#smartAudioLightboxHost audio')?.currentTime>.08,{},{timeout:5000});
}
async function remember(page){await page.evaluate(()=>{window.retiredAudio=document.querySelector('#smartAudioLightboxHost audio');});}
async function released(page){
    assert.deepEqual(await page.evaluate(()=>({paused:retiredAudio.paused,src:retiredAudio.getAttribute('src'),connected:retiredAudio.isConnected,ready:retiredAudio.readyState})),{paused:true,src:null,connected:false,ready:0});
}
async function selection(page){return page.evaluate(()=>({id:selectedId,ids:selectedIds,image:selectedImage,saves:audioSaves,downloads:audioDownloads.length}));}

test('Smart node and group audio really play, preserve first-view save and selection, and download the current item',async t=>{
    const {page,errors}=await audio(t,{finished:true});await open(page);await play(page);
    assert.equal(await page.evaluate(async()=>{const item=nodes[0].images[0];await saveCanvas();return nodes[0].images[0]!==item;}),true);
    assert.equal(await page.evaluate(()=>smartAudioPreview.state.targetValid),true);
    assert.equal(await page.locator('#smartAudioLightboxHost audio').evaluate(el=>el.paused),false);
    assert.ok(Math.abs(await page.locator('#smartAudioLightboxHost audio').evaluate(el=>el.duration)-2)<.01);
    assert.equal(await page.locator('#smartAudioLightboxTitle').textContent(),'a.wav');
    await page.click('[data-audio-download]');
    assert.deepEqual(await selection(page),{id:'a',ids:[],image:{nodeId:'a',index:0},saves:1,downloads:1});
    await remember(page);await open(page,1);await released(page);await play(page);await page.click('[data-audio-download]');
    assert.deepEqual(await selection(page),{id:'a',ids:[],image:{nodeId:'a',index:1},saves:1,downloads:2});
    assert.equal(await page.locator('#smartAudioLightboxHost audio').count(),1);
    assert.equal(await page.locator('#smartAudioLightboxTitle').textContent(),'b.wav');
    assert.ok((await page.evaluate(()=>audioDownloads)).at(-1).url.endsWith('audio-b.wav'));assert.deepEqual(errors,[]);
});

test('Smart node-backed reference audio restores selection, while retaining viewed-timer save and node download',async t=>{
    const {page,errors}=await audio(t,{finished:true});
    await page.evaluate(()=>{
        selectedId='b';selectedIds=['b'];selectedImage={nodeId:'b',index:0};
        window.previousSelection={selectedIds,selectedImage};
        previewSmartReference({nodeId:'a',url:nodes[0].images[1].url,kind:'audio'});
    });await ready(page);await play(page);await page.click('[data-audio-download]');
    assert.deepEqual(await selection(page),{id:'b',ids:['b'],image:{nodeId:'b',index:0},saves:1,downloads:1});
    assert.equal(await page.evaluate(()=>selectedIds===previousSelection.selectedIds && selectedImage===previousSelection.selectedImage),true);
    assert.equal(await page.evaluate(()=>nodes[0].runTimerHidden),true);assert.deepEqual(errors,[]);
});

test('Smart external reference uses one complete open command, releases the node player and keeps selection/download/save differences',async t=>{
    const {page,errors}=await audio(t,{finished:true});await open(page);await play(page);await remember(page);
    const before=await selection(page);
    await page.evaluate(()=>previewSmartReference({kind:'audio',url:'/assets/audio-external.wav',name:'External voice'}));
    await ready(page);await released(page);await play(page);await page.click('[data-audio-download]');
    assert.deepEqual(await selection(page),before);assert.equal(await page.locator('#smartAudioLightboxTitle').textContent(),'External voice');
    assert.deepEqual(await page.evaluate(()=>({source:smartAudioPreview.state.source,id:smartAudioPreview.state.nodeId,index:smartAudioPreview.state.index})),{source:'external',id:'',index:-1});
    assert.equal(await page.evaluate(()=>nodes[0].runTimerHidden),true);assert.deepEqual(errors,[]);
});

test('Smart invalid opens keep the existing session, and unfinished/running node viewing does not hide its timer',async t=>{
    const {page,errors}=await audio(t);await page.evaluate(()=>{nodes[0].running=true;nodes[0].runFinishedAt=100;});await open(page);
    const state=await page.evaluate(()=>smartAudioPreview.state);
    assert.equal(await page.evaluate(()=>openSmartAudioLightbox('missing')),false);
    assert.equal(await page.evaluate(()=>openSmartAudioLightbox('image')),false);
    assert.deepEqual(await page.evaluate(()=>smartAudioPreview.state),state);
    assert.equal(await page.evaluate(()=>Boolean(nodes[0].runTimerHidden)),false);assert.equal(await page.evaluate(()=>audioSaves),0);assert.deepEqual(errors,[]);
});

test('Smart readonly audio retains viewing/download effects and schedule count without bypassing the save guard',async t=>{
    const {page,errors,writes}=await audio(t,{member:true,finished:true});
    await page.evaluate(()=>MemberCanvasEdit.setEditable(false));await open(page);await play(page);await page.click('[data-audio-download]');
    assert.deepEqual(await selection(page),{id:'a',ids:[],image:{nodeId:'a',index:0},saves:1,downloads:1});
    await page.evaluate(()=>saveCanvas());assert.equal(writes.filter(w=>w.path==='/api/canvases/canvas-test'&&w.method==='PUT').length,0);
    await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>smartAudioPreview.state.open),false);assert.deepEqual(errors,[]);
});

for(const change of ['node','item','url','canvas'])test(`Smart invalid ${change} forbids target download but still permits real Escape close and resource release`,async t=>{
    const {page,errors}=await audio(t);await open(page);await remember(page);
    await page.evaluate(change=>{
        if(change==='node')nodes=nodes.map(node=>node.id==='a'?{...node}:node);
        if(change==='item')nodes[0].images[0]={...nodes[0].images[0],url:'/assets/audio-replacement.wav'};
        if(change==='url')nodes[0].images[0].url='/assets/audio-replaced.wav';
        if(change==='canvas')canvas={...canvas,id:'other-canvas'};
        downloadSmartAudioLightbox();
    },change);
    assert.deepEqual(await page.evaluate(()=>({open:smartAudioPreview.state.open,valid:smartAudioPreview.state.targetValid,downloads:audioDownloads.length,protected:smartAudioPreview.isPreviewingNode('a')})),{open:true,valid:false,downloads:0,protected:false});
    await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>smartAudioPreview.state.open),false);await released(page);assert.deepEqual(errors,[]);
});

test('Smart media replacement notification stops live audio; index shifts cannot download a different group item',async t=>{
    const {page,errors}=await audio(t);await open(page,1);await play(page);await remember(page);
    assert.equal(await page.evaluate(()=>{selectedId='';selectedIds=[];selectedImage={nodeId:'',index:-1};return canRecycleSmartMediaNode(nodes[0],world.querySelector('.image-node[data-id="a"]'));}),false);
    await page.evaluate(()=>{nodes[0].images.shift();refreshSmartNodes(['a']);downloadSmartAudioLightbox();});
    assert.equal(await page.evaluate(()=>smartAudioPreview.state.open),false);await released(page);
    assert.equal(await page.evaluate(()=>audioDownloads.length),0);assert.equal(await page.evaluate(()=>audioSaves),0);assert.deepEqual(errors,[]);
});

for(const operation of ['delete','clear','undo','draft','reload'])test(`Smart ${operation} closes and releases a replaced audio target through production document paths`,async t=>{
    const {page,errors}=await audio(t,{member:operation==='draft'});await open(page);await play(page);await remember(page);
    await page.evaluate(async operation=>{
        if(operation==='delete')deleteSmartNodes(['a']);
        if(operation==='clear')clearNodeMediaBeforeDelete('a');
        if(operation==='undo'){pushUndo();nodes[0].x+=10;performUndo();}
        if(operation==='draft')restoreSmartMemberDraft({...canvas,kind:'smart',nodes:JSON.parse(JSON.stringify(nodes)),connections:[],settings:{}});
        if(operation==='reload')await loadCanvas();
    },operation);
    assert.equal(await page.evaluate(()=>smartAudioPreview.state.open),false);await released(page);assert.deepEqual(errors,[]);
});

test('Smart audio and image preview remain mutually exclusive and release the preceding owner resources',async t=>{
    const {page,errors}=await audio(t);await open(page);await play(page);await remember(page);
    await page.evaluate(()=>openImageEditor('image'));await page.waitForFunction(()=>smartImageEditor.state.ready);
    assert.equal(await page.evaluate(()=>smartAudioPreview.state.open),false);await released(page);
    await open(page);assert.equal(await page.evaluate(()=>smartImageEditor.state.open),false);await play(page);assert.deepEqual(errors,[]);
});

for(const change of ['close','switch','canvas','destroy'])test(`Smart late audio metadata after ${change} cannot restore a prior target or player`,async t=>{
    const {page,errors}=await audio(t),held=[];await page.route('**/assets/audio-late.wav',route=>held.push(route));
    const request=page.waitForEvent('request',{predicate:request=>request.url().endsWith('audio-late.wav'),timeout:5000});
    await page.evaluate(()=>{nodes[0].images[0].url='/assets/audio-late.wav';openSmartAudioLightbox('a');window.retiredAudio=document.querySelector('#smartAudioLightboxHost audio');});
    await page.waitForFunction(()=>document.querySelector('#smartAudioLightboxHost audio')?.readyState===0);
    // Observe the actual network request before releasing a delayed response.
    await request;assert.ok(held.length);
    await page.evaluate(change=>{
        if(change==='close')closeSmartAudioLightbox();
        if(change==='switch')openSmartAudioLightbox('a',1);
        if(change==='canvas'){canvas={...canvas,id:'new-canvas'};render();}
        if(change==='destroy')smartAudioPreview.destroy();
    },change);
    if(change==='switch')await ready(page);
    const state=await page.evaluate(()=>smartAudioPreview.state);
    for(const route of held)await serveAudio(route).catch(()=>{});
    await page.evaluate(()=>{retiredAudio.dispatchEvent(new Event('loadedmetadata'));retiredAudio.dispatchEvent(new Event('play'));retiredAudio.dispatchEvent(new Event('timeupdate'));});
    assert.deepEqual(await page.evaluate(()=>smartAudioPreview.state),state);await released(page);assert.equal(await page.evaluate(()=>audioSaves),0);assert.deepEqual(errors,[]);
});

test('Smart repeated bindings/opens keep one set of owned listeners, preserve shared listeners, and destroy is final',async t=>{
    const {page,errors}=await audio(t);
    await page.evaluate(()=>{
        const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener,records=[];
        const owned=(el,type)=>(el===window && ['pagehide','pageshow'].includes(type))||el instanceof HTMLAudioElement||Boolean(el.closest?.('#smartAudioLightbox'));
        EventTarget.prototype.addEventListener=function(type,fn,options){if(owned(this,type))records.push({el:this,type,fn,live:true});return add.call(this,type,fn,options);};
        EventTarget.prototype.removeEventListener=function(type,fn,options){for(const r of records)if(r.el===this&&r.type===type&&r.fn===fn)r.live=false;return remove.call(this,type,fn,options);};
        window.audioListenerCounts=()=>({controls:records.filter(r=>r.live&&r.el!==window&&!(r.el instanceof HTMLAudioElement)).length,media:records.filter(r=>r.live&&r.el instanceof HTMLAudioElement).length,lifecycle:records.filter(r=>r.live&&r.el===window).length});
        window.sharedAudioClicks=0;document.querySelector('[data-audio-download]').addEventListener('click',()=>sharedAudioClicks++);
        for(let i=0;i<5;i++)smartAudioPreview.bind();
    });
    assert.deepEqual(await page.evaluate(()=>audioListenerCounts()),{controls:5,media:0,lifecycle:2});
    for(let i=0;i<3;i++){await open(page);assert.deepEqual(await page.evaluate(()=>audioListenerCounts()),{controls:5,media:3,lifecycle:2});await remember(page);await page.click('[data-audio-close]');await released(page);assert.equal(await page.evaluate(()=>audioListenerCounts().media),0);}
    await open(page);await page.click('[data-audio-download]');assert.equal(await page.evaluate(()=>sharedAudioClicks),1);assert.equal(await page.evaluate(()=>audioDownloads.length),1);
    await remember(page);await page.evaluate(()=>smartAudioPreview.destroy());await released(page);
    assert.deepEqual(await page.evaluate(()=>audioListenerCounts()),{controls:1,media:0,lifecycle:0});
    await page.evaluate(()=>{smartAudioPreview.bind();openSmartAudioLightbox('a');smartAudioPreview.openExternal({url:'/assets/audio-external.wav'});document.querySelector('[data-audio-download]').click();});
    assert.equal(await page.locator('#smartAudioLightboxHost audio').count(),0);assert.equal(await page.evaluate(()=>sharedAudioClicks),2);assert.equal(await page.evaluate(()=>audioDownloads.length),1);
    assert.equal(await page.evaluate(()=>smartAudioPreview.state.destroyed),true);assert.deepEqual(errors,[]);
});

test('Smart cached page lifecycle closes audio, restores only its controls and never resumes playback or reopens automatically',async t=>{
    const {page,errors}=await audio(t);await open(page);await play(page);await remember(page);
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));await released(page);
    assert.deepEqual(await page.evaluate(()=>({open:smartAudioPreview.state.open,paused:smartAudioPreview.state.paused})),{open:false,paused:true});
    assert.equal(await page.evaluate(()=>openSmartAudioLightbox('a')),false);
    await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
    assert.equal(await page.evaluate(()=>smartAudioPreview.state.open),false);assert.equal(await page.locator('#smartAudioLightboxHost audio').count(),0);
    await open(page);assert.equal(await page.locator('#smartAudioLightboxHost audio').evaluate(el=>el.paused),true);
    await page.click('[data-audio-close]');await open(page);await page.click('#smartAudioLightbox',{position:{x:5,y:5}});
    assert.equal(await page.evaluate(()=>smartAudioPreview.state.open),false);assert.equal(await page.evaluate(()=>audioSaves),0);assert.deepEqual(errors,[]);
});

test('Smart real page departure releases native audio before navigation, and browser back does not reopen it',async t=>{
    const {page,errors}=await audio(t);await open(page);await play(page);
    await page.evaluate(()=>{
        const audio=document.querySelector('#smartAudioLightboxHost audio');
        window.addEventListener('pagehide',()=>localStorage.setItem('audioExitEvidence',JSON.stringify({paused:audio.paused,src:audio.getAttribute('src'),connected:audio.isConnected})),{once:true});
    });
    await page.route('**/audio-away',route=>route.fulfill({contentType:'text/html',body:'<title>Away</title>'}));
    await page.goto('http://canvas-modules.test/audio-away');
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('audioExitEvidence'))),{paused:true,src:null,connected:false});
    await page.goBack();await page.waitForFunction(()=>typeof smartAudioPreview!=='undefined');
    assert.equal(await page.evaluate(()=>smartAudioPreview.state.open),false);assert.equal(await page.locator('#smartAudioLightboxHost audio').count(),0);assert.deepEqual(errors,[]);
});
