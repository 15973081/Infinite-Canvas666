const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');
const wav=fs.readFileSync(path.join(__dirname,'fixtures/smart-audio-preview.wav'));
const webm=fs.readFileSync(path.join(__dirname,'fixtures/smart-video-trim.webm'));
async function setup(t){
    const f=await fixture(t,'classic',false);await f.page.waitForLoadState('networkidle');
    await f.page.route('**/assets/selection-media.*',async route=>{
        const audio=route.request().url().endsWith('.wav'),data=audio?wav:webm;
        const range=route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
        const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),data.length-1):data.length-1;
        const body=data.subarray(start,end+1),headers={'accept-ranges':'bytes','content-length':String(body.length)};
        if(range)headers['content-range']=`bytes ${start}-${end}/${data.length}`;
        await route.fulfill({status:range?206:200,headers,contentType:audio?'audio/wav':'video/webm',body});
    });
    await f.page.evaluate(()=>{
        canvas.nodes=nodes=[{id:'a',type:'prompt',x:100,y:130,w:260,h:220,text:'line\n'.repeat(200)},
            {id:'b',type:'prompt',x:500,y:130,w:260,h:220,text:'second'},
            {id:'g',type:'generator',x:820,y:130,w:260,h:220,model:'gpt-image-2'},
            {id:'video',type:'image',x:950,y:440,w:240,h:180,url:'/assets/selection-media.webm',mediaKind:'video'},
            {id:'audio',type:'image',x:650,y:440,w:240,h:180,url:'/assets/selection-media.wav',mediaKind:'audio'},
            {id:'far',type:'prompt',x:4000,y:4000,w:260,h:220,text:'placeholder'}];
        canvas.connections=connections=[{id:'ag',from:'a',to:'g'},{id:'bg',from:'b',to:'g'}];
        selected.clear();Object.assign(viewport,{x:0,y:0,scale:1});render();
    });await f.page.waitForTimeout(300);
    await f.page.evaluate(()=>{
        window.boxCheck={saves:0,undos:0,renders:0,visuals:0,meta:0,minimap:0,trusted:[],beforeUndo:undoStack.length,beforeRedo:redoStack.length,
            refs:new Map([...nodesEl.querySelectorAll('.node')].map(el=>[el.dataset.id,el]))};
        for(const [name,key] of [['scheduleSave','saves'],['pushUndo','undos'],['render','renders'],['refreshSelectionVisuals','visuals'],['updateWorkflowTransferMeta','meta'],['scheduleMinimapRender','minimap']]){
            const fn=window[name];window[name]=(...args)=>{boxCheck[key]++;return fn(...args);};
        }
        window.addEventListener('mouseup',e=>boxCheck.trusted.push(e.isTrusted),true);
    });return f;
}
async function bounds(page,id){return page.locator(`.node[data-id="${id}"]`).boundingBox();}
async function begin(page,ids,key='Control'){
    const first=await bounds(page,ids[0]),last=await bounds(page,ids.at(-1));
    await page.keyboard.down(key);await page.mouse.move(first.x-20,first.y-20);await page.mouse.down();
    assert.equal(await page.evaluate(()=>Boolean(selectDrag)),true);
    await page.mouse.move(last.x+last.width+10,last.y+last.height+10,{steps:3});
}
async function end(page,key='Control'){await page.mouse.up();await page.keyboard.up(key);await page.waitForTimeout(80);}
async function box(page,ids,key='Control'){await begin(page,ids,key);await end(page,key);}
async function check(f,expected){
    const result=await f.page.evaluate(()=>({selected:[...selected].sort(),classes:[...nodesEl.querySelectorAll('.node.selected')].map(el=>el.dataset.id).sort(),
        same:[...boxCheck.refs].every(([id,el])=>nodesEl.querySelector(`.node[data-id="${id}"]`)===el),
        saves:boxCheck.saves,undos:boxCheck.undos,renders:boxCheck.renders,undo:undoStack.length-boxCheck.beforeUndo,redo:redoStack.length-boxCheck.beforeRedo,
        dragging:Boolean(selectDrag),pointer:Boolean(windowPointerSession),boxHidden:selectionBox.style.display==='none',bodySelecting:document.body.classList.contains('canvas-selecting'),
        trusted:boxCheck.trusted.every(Boolean)}));
    assert.deepEqual(result,{selected:[...expected].sort(),classes:[...expected].sort(),same:true,saves:0,undos:0,renders:0,undo:0,redo:0,dragging:false,pointer:false,boxHidden:true,bodySelecting:false,trusted:true});
    assert.deepEqual(f.errors,[]);
}
test('Classic real Ctrl/R selection, reselection and empty rectangle keep nodes and do not save or add history',async t=>{
    const f=await setup(t);await box(f.page,['a']);await check(f,['a']);
    assert.equal(await f.page.locator('path.link[data-connection-id="ag"]').count(),1);
    assert.equal(await f.page.evaluate(()=>document.querySelector('.link-delete')?.classList.contains('visible')),true);
    await box(f.page,['a','b'],'r');await check(f,['a','b']);
    await box(f.page,['b']);await check(f,['b']);
    await f.page.keyboard.down('Control');await f.page.mouse.move(50,700);await f.page.mouse.down();await f.page.mouse.move(85,760);await end(f.page);await check(f,[]);
    const state=await f.page.evaluate(()=>({visuals:boxCheck.visuals,visible:[...document.querySelectorAll('.link-delete')].filter(el=>el.classList.contains('visible')).length,minimap:boxCheck.minimap}));
    assert.equal(state.visuals,4);assert.equal(state.visible,0);assert.equal(state.minimap,4);
    // A later mouseup has no retired pointer session to finish again.
    await f.page.mouse.up();assert.equal(await f.page.evaluate(()=>boxCheck.visuals),4);
    await f.page.waitForTimeout(1600);assert.equal(f.writes.filter(w=>w.method==='PUT').length,0);
});
test('Classic transformed Ctrl/R hit testing matches the nodes visible at the new viewport',async t=>{
    const f=await setup(t);await f.page.evaluate(()=>{Object.assign(viewport,{x:150,y:80,scale:.75});applyViewport();});await f.page.waitForTimeout(300);
    await box(f.page,['a']);await check(f,['a']);await box(f.page,['a','b'],'r');await check(f,['a','b']);
});
test('Classic selection blurs the editor while keeping its DOM draft, scroll and offscreen placeholder',async t=>{
    const f=await setup(t);
    await f.page.evaluate(()=>{const text=nodesEl.querySelector('[data-id="a"] textarea');window.retainedText=text;text.value+='DOM draft';text.scrollTop=260;text.focus();boxCheck.scroll=text.scrollTop;});
    await box(f.page,['a']);await check(f,['a']);
    assert.deepEqual(await f.page.evaluate(()=>({same:retainedText===nodesEl.querySelector('[data-id="a"] textarea'),draft:retainedText.value.endsWith('DOM draft'),scroll:retainedText.scrollTop===boxCheck.scroll,wasScrolled:boxCheck.scroll>0,blurred:document.activeElement!==retainedText,placeholder:nodesEl.querySelector('[data-id="far"]').classList.contains('node-placeholder')})),{same:true,draft:true,scroll:true,wasScrolled:true,blurred:true,placeholder:true});
});
test('Classic a transfer dialog opened during selection receives exactly one refreshed selection summary',async t=>{
    const f=await setup(t);await begin(f.page,['a']);
    await f.page.evaluate(()=>workflowTransferModal.classList.add('open'));await end(f.page);await check(f,['a']);
    assert.equal(await f.page.evaluate(()=>boxCheck.meta),1);
    assert.match(await f.page.evaluate(()=>workflowExportMeta.textContent),/1 个节点，0 条连线/);
});
for(const kind of ['audio','video'])test(`Classic pending selection preserves a newly opened native ${kind} preview and playback`,async t=>{
    const f=await setup(t);await begin(f.page,['a']);
    await f.page.evaluate(kind=>{const node=nodes.find(n=>n.id===kind);openOutputLightbox(node.url,node);},kind);
    const selector=kind==='audio'?'#outputLightboxAudioHost audio':'#outputLightboxVideo';
    await f.page.waitForFunction(selector=>document.querySelector(selector)?.readyState>=2,selector);
    await f.page.evaluate(async selector=>{const media=document.querySelector(selector);window.retainedMedia=media;media.muted=true;media.loop=true;media.playbackRate=1.25;await media.play();},selector);
    await f.page.waitForFunction(()=>retainedMedia.currentTime>.08);
    const before=await f.page.evaluate(()=>retainedMedia.currentTime);await end(f.page);await check(f,['a']);
    await f.page.waitForFunction(time=>retainedMedia.currentTime>time+.05,before);
    assert.deepEqual(await f.page.evaluate(selector=>({same:retainedMedia===document.querySelector(selector),connected:retainedMedia.isConnected,paused:retainedMedia.paused,rate:retainedMedia.playbackRate,open:classicOutputPreview.state.open,valid:classicOutputPreview.state.targetValid}),selector),{same:true,connected:true,paused:false,rate:1.25,open:true,valid:true});
});
test('Classic blur during a real box drag cancels the pointer session without changing selection',async t=>{
    const f=await setup(t);await box(f.page,['a']);await begin(f.page,['b']);
    await f.page.evaluate(()=>window.dispatchEvent(new Event('blur')));await end(f.page);await check(f,['a']);
    assert.equal(await f.page.evaluate(()=>boxCheck.visuals),1);
});
