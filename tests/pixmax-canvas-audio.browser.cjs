const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function setup(t){
    const f=await fixture(t,'smart',true,{secureOrigin:true});
    await f.page.route('**/native-audio*.mp3',route=>route.fulfill({path:path.resolve('tests/fixtures/pixmax-generated-audio.mp3'),contentType:'audio/mpeg'}));
    await f.page.evaluate(()=>{
        window.nativeAudioElements=[];window.Audio=new Proxy(Audio,{construct(Target,args){const element=Reflect.construct(Target,args);nativeAudioElements.push(element);return element;}});
        Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});
        window.uploadedAudio=createNode(100,180,[{url:'/native-audio.mp3',kind:'audio',name:'上传音频.mp3'}],{select:false});
        window.generatedAudio=createSmartStudioNode('audio',{x:600,y:240},{select:false});generatedAudio.images=[{url:'/native-audio.mp3',kind:'audio',name:'生成音频.mp3'}];render();
    });
    await f.page.waitForFunction(()=>document.querySelectorAll('.pixmax-audio-mount[data-audio-ready=true]').length===2);return f;
}
const card=(page,kind='uploadedAudio')=>page.locator('.image-node').filter({has:page.locator('.pixmax-audio-mount')}).nth(kind==='uploadedAudio'?0:1);
test('uploaded and generated audio mount the same captured waveform controls and native dimensions',async t=>{
    const {page,errors}=await setup(t);
    assert.equal(await page.locator('.pixmax-audio-result,[data-studio-audio-play]').count(),0);
    assert.equal(await page.getByRole('button',{name:'播放音频',exact:true}).count(),2);
    const surfaces=await page.locator('.pixmax-audio-card').evaluateAll(elements=>elements.map(element=>({width:element.getBoundingClientRect().width,height:element.getBoundingClientRect().height,canvasWidth:element.querySelector('canvas').width,canvasHeight:element.querySelector('canvas').height})));
    for(const surface of surfaces){assert.equal(surface.canvasWidth,520);assert.equal(surface.canvasHeight,140);assert.equal(surface.width,278);assert.equal(surface.height,118);}
    for(const box of await page.locator('.image-node>.node-body').evaluateAll(elements=>elements.map(element=>({width:element.getBoundingClientRect().width,height:element.getBoundingClientRect().height}))))assert.deepEqual(box,{width:280,height:120});
    assert.equal(await page.evaluate(()=>nativeAudioElements.length),0);await page.screenshot({path:'.local/pixmax-native-audio-cards.png'});assert.deepEqual(errors,[]);
});
test('real audio plays inline and retains its player and position through full and partial canvas refresh',async t=>{
    const {page,errors}=await setup(t);const button=card(page).getByRole('button',{name:'播放音频',exact:true});await button.click();
    await page.waitForFunction(()=>nativeAudioElements[0]?.currentTime>.2&&Number(document.querySelector('.pixmax-audio-mount').dataset.duration)>0);
    const before=await page.evaluate(()=>{window.retainedAudioMount=document.querySelector('.pixmax-audio-mount');return nativeAudioElements[0].currentTime;});
    await page.evaluate(()=>{uploadedAudio.label='重命名音频';render();refreshSmartNodes([uploadedAudio.id]);});
    assert.equal(await page.evaluate(()=>document.querySelector('.pixmax-audio-mount')===retainedAudioMount),true);assert.equal(await page.evaluate(()=>nativeAudioElements.length),1);
    assert.ok(await page.evaluate(()=>nativeAudioElements[0].currentTime)>=before);await card(page).getByRole('button',{name:'暂停音频',exact:true}).click();assert.equal(await page.evaluate(()=>nativeAudioElements[0].paused),true);assert.deepEqual(errors,[]);
});
test('playing audio survives viewport recycling while a paused card can be released and restored',async t=>{
    const {page,errors}=await setup(t);await card(page).getByRole('button',{name:'播放音频',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.pixmax-audio-mount').dataset.playing==='true');
    await page.evaluate(()=>{window.originalAudioMount=document.querySelector('.pixmax-audio-mount');viewport.x=-10000;applyViewport();renderSmartOffscreenPlaceholders();render();refreshSmartNodes([uploadedAudio.id]);});assert.equal(await page.evaluate(()=>originalAudioMount.isConnected),true);
    await page.evaluate(()=>nativeAudioElements[0].pause());await page.waitForFunction(()=>originalAudioMount.dataset.playing==='false');await page.evaluate(()=>{document.activeElement.blur();renderSmartOffscreenPlaceholders();});
    await page.waitForFunction(()=>!originalAudioMount.isConnected);assert.equal(await page.evaluate(()=>nativeAudioElements[0].getAttribute('src')),null);
    await page.evaluate(()=>{viewport.x=0;applyViewport();renderSmartOffscreenPlaceholders();});await page.waitForFunction(()=>document.querySelectorAll('.pixmax-audio-mount[data-audio-ready=true]').length===2);assert.deepEqual(errors,[]);
});
test('deleting generated audio stops the detached native audio element and undo restores a paused card',async t=>{
    const {page,errors,record}=await setup(t);await card(page,'generatedAudio').getByRole('button',{name:'播放音频',exact:true}).click();await page.waitForFunction(()=>nativeAudioElements[0]&&!nativeAudioElements[0].paused);
    await page.evaluate(()=>deleteNode(generatedAudio.id));await page.waitForFunction(()=>nativeAudioElements[0].paused&&nativeAudioElements[0].getAttribute('src')===null);
    await page.evaluate(()=>performUndo());await page.waitForFunction(()=>document.querySelectorAll('.pixmax-audio-mount[data-audio-ready=true]').length===2);assert.equal(await page.getByRole('button',{name:'播放音频',exact:true}).count(),2);
    await page.evaluate(()=>saveCanvas({force:true}));assert.equal(record.nodes.find(node=>node.type==='smart-audio').images[0].url,'/native-audio.mp3');assert.deepEqual(errors,[]);
});
test('readonly audio remains playable without an edit or a separate lightbox',async t=>{
    const {page,errors,writes}=await setup(t);await page.evaluate(()=>MemberCanvasEdit.setEditable(false));const before=writes.length;await card(page).getByRole('button',{name:'播放音频',exact:true}).click();await page.waitForFunction(()=>nativeAudioElements[0]&&!nativeAudioElements[0].paused);
    assert.equal(await page.locator('#smartAudioLightbox.open').count(),0);assert.equal(writes.length,before);assert.deepEqual(errors,[]);
});
