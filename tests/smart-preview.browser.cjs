const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');
const svg=(w,h,color)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${color}"/></svg>`;
async function preview(t,member=false){
    const f=await fixture(t,'smart',member);
    for(const [name,w,h,color] of [['ref-a',400,300,'red'],['ref-b',640,360,'blue']])await f.page.route('**/'+name+'.svg',route=>route.fulfill({contentType:'image/svg+xml',body:svg(w,h,color)}));
    await f.page.evaluate(()=>{
        const image=name=>({url:'/test-image.svg?'+name,name:name+'.svg',kind:'image',natural_w:320,natural_h:240});
        nodes=[{id:'a',type:'smart-image',images:[image('first'),image('second')],runPrompt:'Alpha prompt',runInputRefs:[{url:'/ref-a.svg',kind:'image'},{url:'/ref-b.svg',kind:'image'}],x:20,y:20},
            {id:'b',type:'smart-image',images:[image('other')],runPrompt:'Beta prompt',runInputRefs:[{url:'/ref-b.svg',kind:'image'}],x:400,y:20}];
        render();window.previewSaves=0;const save=scheduleSave;scheduleSave=()=>{previewSaves++;save();};
        openImageEditor('a');
    });
    await f.page.waitForFunction(()=>smartImageEditor.state.ready);
    return f;
}
async function videoRoute(page){
    // A tiny real VP8/WebM clip; tests do not depend on MediaRecorder timing or ffmpeg.
    const bytes=require('node:fs').readFileSync(require('node:path').join(__dirname,'fixtures/smart-preview.webm'));
    await page.route('**/preview.webm',route=>route.fulfill({contentType:'video/webm',body:Buffer.from(bytes)}));
}

test('Smart preview commands own frozen comparison/metadata snapshots and retain same-item toggle semantics',async t=>{
    const {page,errors}=await preview(t);await page.click('#compareToggleBtn');
    assert.deepEqual(await page.evaluate(()=>({frozen:Object.isFrozen(smartPreviewGestures)&&Object.isFrozen(smartPreviewGestures.state),on:smartPreviewGestures.state.compareOn,index:smartPreviewGestures.state.compareIndex,active:smartPreviewGestures.state.compareActive,
        globals:[typeof previewCompareOn,typeof previewCompareIndex,typeof previewMetaExtraText]})),{frozen:true,on:true,index:0,active:true,globals:['undefined','undefined','undefined']});
    await page.click('[data-compare-idx="1"]');assert.equal(await page.evaluate(()=>smartPreviewGestures.state.compareIndex),1);
    assert.equal(await page.locator('#previewCompareImage').getAttribute('src'),'/ref-b.svg');
    await page.click('[data-compare-idx="1"]');
    assert.deepEqual(await page.evaluate(()=>({on:smartPreviewGestures.state.compareOn,index:smartPreviewGestures.state.compareIndex,active:smartPreviewGestures.state.compareActive})),{on:true,index:-1,active:false});
    assert.match(await page.locator('#previewMetaHint').textContent(),/Alpha prompt.*点缩略图开始对比/);
    await page.click('#compareToggleBtn');assert.equal(await page.locator('[data-compare-idx]').count(),0);
    assert.equal(await page.evaluate(()=>previewSaves),0);assert.deepEqual(errors,[]);
});

test('Smart group navigation resets comparison and metadata through the existing editor target',async t=>{
    const {page,errors}=await preview(t);await page.click('#compareToggleBtn');await page.click('[data-compare-idx="1"]');
    await page.evaluate(()=>updatePreviewMetaHint('old extra'));await page.keyboard.press('ArrowRight');
    await page.waitForFunction(()=>smartImageEditor.state.imageIndex===1&&smartImageEditor.state.ready);
    assert.deepEqual(await page.evaluate(()=>({on:smartPreviewGestures.state.compareOn,index:smartPreviewGestures.state.compareIndex,extra:smartPreviewGestures.state.extraText})),{on:false,index:-1,extra:'提示词：Alpha prompt'});
    assert.equal(await page.locator('#previewCompareImage').getAttribute('src'),null);await page.click('#compareToggleBtn');
    assert.equal(await page.locator('#previewCompareImage').getAttribute('src'),'/ref-a.svg');
    await page.evaluate(()=>openImageEditor('b'));await page.waitForFunction(()=>smartImageEditor.state.ready);
    assert.match(await page.locator('#previewMetaHint').textContent(),/320 x 240.*Beta prompt/);
    await page.click('#compareToggleBtn');assert.equal(await page.locator('[data-compare-idx]').count(),1);
    assert.equal(await page.locator('#previewCompareImage').getAttribute('src'),'/ref-b.svg');assert.equal(await page.evaluate(()=>previewSaves),0);assert.deepEqual(errors,[]);
});

test('Smart image-video-image presentation clears comparison and uses each media type resolution without saving',async t=>{
    const {page,errors}=await preview(t);await videoRoute(page);
    await page.evaluate(()=>nodes[0].images.push({url:'/preview.webm',name:'clip.webm',kind:'video',natural_w:160,natural_h:90}));
    await page.click('#compareToggleBtn');await page.evaluate(()=>openImageEditor('a',2));
    await page.waitForFunction(()=>document.getElementById('previewCurrentVideo').videoWidth===160);
    assert.deepEqual(await page.evaluate(()=>({mode:smartImageEditor.state.mode,on:smartPreviewGestures.state.compareOn,index:smartPreviewGestures.state.compareIndex,
        image:document.getElementById('previewCurrentImage').getAttribute('src'),compare:document.getElementById('previewCompareImage').getAttribute('src'),thumbs:document.querySelectorAll('[data-compare-idx]').length})),{mode:'preview',on:false,index:-1,image:null,compare:null,thumbs:0});
    assert.match(await page.locator('#previewMetaHint').textContent(),/160 x 90/);assert.equal(await page.locator('#compareToggleBtn').isVisible(),false);
    await page.evaluate(()=>openImageEditor('a',0));await page.waitForFunction(()=>smartImageEditor.state.ready);
    assert.equal(await page.locator('#previewCurrentVideo').getAttribute('src'),null);assert.match(await page.locator('#previewMetaHint').textContent(),/320 x 240/);
    assert.equal(await page.evaluate(()=>previewSaves),0);assert.deepEqual(errors,[]);
});

test('Smart comparison validates removed candidates at command boundaries; empty sources exit comparison',async t=>{
    const {page,errors}=await preview(t);await page.click('#compareToggleBtn');await page.click('[data-compare-idx="1"]');
    await page.evaluate(()=>{nodes[0].runInputRefs.pop();refreshComparePanel();});
    assert.deepEqual(await page.evaluate(()=>({on:smartPreviewGestures.state.compareOn,index:smartPreviewGestures.state.compareIndex,active:smartPreviewGestures.state.compareActive})),{on:true,index:-1,active:false});
    await page.evaluate(()=>{nodes[0].runInputRefs=[];togglePreviewCompare();});
    assert.equal(await page.evaluate(()=>smartPreviewGestures.state.compareOn),false);assert.equal(await page.locator('#compareToggleBtn').isDisabled(),true);assert.equal(await page.locator('[data-compare-idx]').count(),0);
    assert.equal(await page.evaluate(()=>previewSaves),0);assert.deepEqual(errors,[]);
});

for(const change of ['selection','group','mode','close','destroy'])test(`Smart old current/comparison load callbacks cannot mutate presentation after ${change}`,async t=>{
    const {page,errors}=await preview(t);await page.click('#compareToggleBtn');
    await page.evaluate(()=>{window.oldCurrentLoad=document.getElementById('previewCurrentImage').onload;window.oldCompareLoad=document.getElementById('previewCompareImage').onload;});
    await page.evaluate(change=>{
        if(change==='selection')smartPreviewGestures.selectComparison(1);
        if(change==='group')openImageEditor('a',1);
        if(change==='mode')setImageEditMode('brush',true);
        if(change==='close')closeImageEditor();
        if(change==='destroy')smartImageEditor.destroy();
    },change);
    if(change==='group')await page.waitForFunction(()=>smartImageEditor.state.ready);
    if(change==='selection'||change==='group')await page.evaluate(async()=>{
        await Promise.all(['previewCurrentImage','previewCompareImage'].map(id=>{const img=document.getElementById(id);return img.getAttribute('src')?img.decode().catch(()=>{}):Promise.resolve();}));
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    });
    const snapshot=await page.evaluate(()=>({metadata:document.getElementById('previewMetaHint').textContent,state:smartPreviewGestures.state,saves:previewSaves}));
    await page.evaluate(()=>{document.getElementById('previewFrame').style.width='777px';oldCurrentLoad();oldCompareLoad();});
    assert.equal(await page.locator('#previewFrame').evaluate(el=>el.style.width),'777px');
    assert.deepEqual(await page.evaluate(()=>({metadata:document.getElementById('previewMetaHint').textContent,state:smartPreviewGestures.state,saves:previewSaves})),snapshot);assert.deepEqual(errors,[]);
});

test('Smart obsolete video metadata callback cannot resize or write to a new image',async t=>{
    const {page,errors}=await preview(t);await videoRoute(page);
    await page.evaluate(()=>{nodes[0].images.push({url:'/preview.webm',name:'clip.webm',kind:'video',natural_w:160,natural_h:90});openImageEditor('a',2);window.oldVideoLoaded=document.getElementById('previewCurrentVideo').onloadedmetadata;});
    await page.evaluate(()=>openImageEditor('a',1));await page.waitForFunction(()=>smartImageEditor.state.ready);
    await page.evaluate(()=>{document.getElementById('previewFrame').style.width='888px';oldVideoLoaded();});
    assert.equal(await page.locator('#previewFrame').evaluate(el=>el.style.width),'888px');assert.match(await page.locator('#previewMetaHint').textContent(),/320 x 240/);assert.equal(await page.evaluate(()=>previewSaves),0);assert.deepEqual(errors,[]);
});

test('Smart repeat binding/open keeps one comparison click; close releases detached thumbnails and preserves other listeners',async t=>{
    const {page,errors}=await preview(t);
    await page.evaluate(()=>{window.sharedMoves=0;window.addEventListener('mousemove',()=>sharedMoves++);for(let i=0;i<5;i++){bindSmartPreviewCompareEvents();bindSmartPreviewPanEvents();}});
    await page.click('#compareToggleBtn');await page.click('[data-compare-idx="1"]');assert.equal(await page.evaluate(()=>smartPreviewGestures.state.compareIndex),1);
    await page.evaluate(()=>{window.oldThumb=document.querySelector('.compare-thumb img');closeImageEditor();oldThumb.dispatchEvent(new Event('error'));window.dispatchEvent(new MouseEvent('mousemove'));});
    assert.deepEqual(await page.evaluate(()=>({src:oldThumb.getAttribute('src'),queued:oldThumb.getAttribute('data-canvas-media-src'),on:smartPreviewGestures.state.compareOn,meta:document.getElementById('previewMetaHint').textContent,shared:sharedMoves})),{src:null,queued:null,on:false,meta:'',shared:1});
    for(let i=0;i<3;i++){await page.evaluate(()=>openImageEditor('a'));await page.waitForFunction(()=>smartImageEditor.state.ready);await page.click('#compareToggleBtn');await page.click('[data-compare-idx="1"]');assert.equal(await page.evaluate(()=>smartPreviewGestures.state.compareIndex),1);}
    await page.evaluate(()=>smartImageEditor.destroy());assert.equal(await page.locator('[data-compare-idx]').count(),0);assert.deepEqual(errors,[]);
});

test('Smart cached-page return preserves comparison choice, cancels old frames and restores one control listener',async t=>{
    const {page,errors}=await preview(t);await page.click('#compareToggleBtn');await page.click('[data-compare-idx="1"]');
    const cancellation=await page.evaluate(()=>{
        window.oldLoad=document.getElementById('previewCurrentImage').onload;
        const request=window.requestAnimationFrame,cancel=window.cancelAnimationFrame,queued=new Map(),cancelled=new Set();let next=9000;
        window.requestAnimationFrame=fn=>{const id=next++;queued.set(id,fn);return id;};
        window.cancelAnimationFrame=id=>cancelled.add(id);
        refreshComparePanel();window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
        window.requestAnimationFrame=request;window.cancelAnimationFrame=cancel;
        window.oldFrames=[...queued.values()];return {queued:queued.size,cancelled:[...queued.keys()].every(id=>cancelled.has(id))};
    });
    assert.ok(cancellation.queued>0);assert.equal(cancellation.cancelled,true);
    assert.equal(await page.evaluate(()=>smartPreviewGestures.state.paused),true);
    await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));oldLoad();oldFrames.forEach(fn=>fn());});
    assert.equal(await page.evaluate(()=>smartPreviewGestures.state.compareIndex),1);
    await page.click('[data-compare-idx="0"]');assert.equal(await page.evaluate(()=>smartPreviewGestures.state.compareIndex),0);
    assert.equal(await page.evaluate(()=>previewSaves),0);assert.deepEqual(errors,[]);
});

test('Smart preview delayed image and failed retry cannot retain old metadata',async t=>{
    const {page,errors}=await preview(t);const held=[];await page.route('**/late-preview.svg',route=>held.push(route));
    await page.evaluate(()=>{nodes[1].images[0]={url:'/late-preview.svg',name:'late.svg',kind:'image',natural_w:800,natural_h:600};openImageEditor('b');window.oldLoad=document.getElementById('previewCurrentImage').onload;});
    await page.evaluate(()=>openImageEditor('a'));await page.waitForFunction(()=>smartImageEditor.state.ready);
    for(const route of held)await route.fulfill({contentType:'image/svg+xml',body:svg(800,600,'orange')}).catch(()=>{});
    await page.evaluate(()=>oldLoad());assert.match(await page.locator('#previewMetaHint').textContent(),/320 x 240.*Alpha/);
    let fail=true;await page.route('**/retry-preview.svg',route=>route.fulfill(fail?{status:503,body:'failed'}:{contentType:'image/svg+xml',body:svg(320,240,'red')}));
    await page.evaluate(()=>{nodes[1].images[0]={url:'/retry-preview.svg',name:'retry.svg',kind:'image',natural_w:320,natural_h:240};openImageEditor('b');});
    await page.getByText('素材加载失败，请重试').waitFor();fail=false;await page.getByRole('button',{name:'重试',exact:true}).click();await page.waitForFunction(()=>smartImageEditor.state.ready);
    assert.match(await page.locator('#previewMetaHint').textContent(),/320 x 240.*Beta/);assert.doesNotMatch(await page.locator('#previewMetaHint').textContent(),/失败|Alpha/);assert.deepEqual(errors,[]);
});

test('Smart readonly preview controls do not upload, save or change node content',async t=>{
    const {page,errors,writes}=await preview(t,true);await page.evaluate(()=>MemberCanvasEdit.setEditable(false));const before=await page.evaluate(()=>JSON.stringify(nodes));
    await page.click('#compareToggleBtn');await page.click('[data-compare-idx="1"]');await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>smartImageEditor.state.ready);
    await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>JSON.stringify(nodes)),before);assert.equal(await page.evaluate(()=>previewSaves),0);
    assert.equal(writes.filter(w=>w.method==='PUT'||w.path.includes('/upload')).length,0);assert.deepEqual(errors,[]);
});
