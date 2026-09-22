const {readCanvasSource} = require('./helpers/canvas-source.cjs');
const test=require('node:test'), assert=require('node:assert/strict'), vm=require('node:vm');
const source=readCanvasSource(require('node:path').join(__dirname,'../static/js/canvas.js'),'utf8').replace(/\r\n/g,'\n');
function setup(){
    const elements=new Map(), frames=new Map(), calls={requests:[],opened:[],errors:[],undo:0,save:0,appended:[]};let seq=0;
    const element=()=>({style:{},attrs:{},hidden:false,value:'',setAttribute(k,v){this.attrs[k]=v;},classList:{contains:()=>true,toggle(){}}});
    const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
    const original={id:'source',type:'image',mediaKind:'video',url:'/assets/source.mp4',name:'source.mp4',x:10,y:20};
    const video={style:{display:'block'},duration:10,readyState:4,currentTime:0,videoWidth:640,videoHeight:360,paused:true,ended:false,
        pause(){this.paused=true;},play(){this.paused=false;return Promise.resolve();}};
    const ctx=vm.createContext({outputTrimState:null,outputTrimJob:null,outputTrimFrame:null,outputLightboxVideo:video,outputLightbox:element(),
        currentOutputLightboxUrl:original.url,currentOutputLightboxOutId:original.id,canvas:{id:'canvas-a'},nodes:[original],
        document:{getElementById:get,querySelectorAll:()=>[]},requestAnimationFrame:fn=>{frames.set(++seq,fn);return seq;},cancelAnimationFrame:id=>frames.delete(id),
        isCanvasLockedByOther:()=>false,showErrorModal:message=>calls.errors.push(message),setStatus:message=>calls.errors.push(message),
        nodeRect:n=>({...n,w:260}),defaultPoint:()=>({x:30,y:40}),outputImageName:()=> 'video.mp4',uid:()=> 'clip',
        pushUndo:()=>calls.undo++,nodesEl:{appendChild:el=>calls.appended.push(el)},isNodeInCanvasViewport:()=>true,
        renderNode:n=>n,renderNodePlaceholder:n=>n,bindCanvasPreviewImageFallbacks(){},refreshIcons(){},refreshGeometryAfterLayout(){},scheduleSave:()=>calls.save++,
        openOutputLightbox:(...args)=>{calls.opened.push(args);ctx.resetOutputVideoTrim();},
        window:{CanvasApi:{trimSmartCanvasVideo:async payload=>{calls.requests.push(payload);return {url:'/output/clip.mp4',name:'clip.mp4',duration_seconds:3};}}}});
    for(const name of ['outputTrimTime','parseOutputTrimTime','stopOutputTrimPreview','resetOutputVideoTrim','syncOutputTrimUi','toggleOutputVideoTrim','setOutputTrimValue','setOutputTrimInput','tickOutputTrimPreview','previewOutputVideoTrim','applyOutputVideoTrim']){
        const start=source.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));assert.ok(start>=0);
        vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),ctx);
    }
    return {ctx,video,calls,frames,get,original};
}
test('time parsing and clamping reject invalid values and maintain a minimum range',()=>{
    const {ctx,video,get}=setup();assert.equal(ctx.parseOutputTrimTime('1:02.50'),62.5);assert.equal(ctx.parseOutputTrimTime('1:02:03'),3723);
    assert.ok(Number.isNaN(ctx.parseOutputTrimTime('-1')));assert.ok(Number.isNaN(ctx.parseOutputTrimTime('')));
    assert.equal(ctx.outputTrimTime(59.999),'01:00.00');ctx.toggleOutputVideoTrim();
    assert.equal(get('outputTrimApply').disabled,true);ctx.setOutputTrimValue('end',4);ctx.setOutputTrimValue('start',100);
    assert.ok(Math.abs(ctx.outputTrimState.start-3.9)<1e-8);ctx.setOutputTrimValue('start',-9);assert.equal(ctx.outputTrimState.start,0);
    ctx.setOutputTrimValue('end',NaN);assert.match(ctx.outputTrimState.error,/请输入/);assert.equal(video.currentTime,0);
});
test('remote links and unavailable or non-video media do not start a trim session',()=>{
    const {ctx,video}=setup();ctx.currentOutputLightboxUrl='https://example.com/a.mp4';ctx.toggleOutputVideoTrim();assert.equal(ctx.outputTrimState,null);
    ctx.currentOutputLightboxUrl='/assets/a.mp4';video.duration=Infinity;ctx.toggleOutputVideoTrim();assert.equal(ctx.outputTrimState,null);
    video.duration=10;video.style.display='none';ctx.toggleOutputVideoTrim();assert.equal(ctx.outputTrimState,null);
});
test('live time edits preserve focused drafts, update range without seeking, and invalid drafts block export',async()=>{
    const {ctx,get,video,calls}=setup();ctx.toggleOutputVideoTrim();const input=get('outputTrimStart');
    ctx.document.activeElement=input;input.value='1.25';ctx.setOutputTrimInput('start',false);
    assert.equal(input.value,'1.25');assert.equal(ctx.outputTrimState.start,1.25);assert.equal(video.currentTime,0);
    input.value='bad';ctx.setOutputTrimInput('start',false);ctx.setOutputTrimValue('end',4);
    assert.equal(get('outputTrimApply').disabled,true);assert.equal(get('outputTrimPreview').disabled,true);
    await ctx.applyOutputVideoTrim();assert.equal(calls.requests.length,0);
    input.value='1.25';ctx.setOutputTrimInput('start',false);assert.equal(get('outputTrimApply').disabled,false);
});
test('preview uses the shared video, stops at the end and cancels its animation loop on close or native pause',async()=>{
    const {ctx,video,frames}=setup();ctx.toggleOutputVideoTrim();ctx.setOutputTrimValue('end',3);
    await ctx.previewOutputVideoTrim();assert.equal(video.paused,false);assert.equal(frames.size,1);
    video.currentTime=3;const callback=frames.values().next().value;frames.clear();callback();
    assert.equal(video.paused,true);assert.equal(video.currentTime,0);assert.equal(frames.size,0);
    await ctx.previewOutputVideoTrim();ctx.resetOutputVideoTrim();assert.equal(video.paused,true);assert.equal(frames.size,0);
    ctx.toggleOutputVideoTrim();await ctx.previewOutputVideoTrim();video.pause();const pausedTick=frames.values().next().value;frames.clear();pausedTick();assert.equal(frames.size,0);
});
test('export is non-destructive, records undo, appends only one node and opens the new clip',async()=>{
    const {ctx,calls,original}=setup(), before=JSON.stringify(original);ctx.toggleOutputVideoTrim();ctx.setOutputTrimValue('start',1);ctx.setOutputTrimValue('end',4);
    await ctx.applyOutputVideoTrim();assert.equal(JSON.stringify(original),before);assert.equal(ctx.nodes.length,2);
    assert.equal(calls.undo,1);assert.equal(calls.save,1);assert.equal(calls.appended.length,1);
    assert.equal(ctx.nodes[1].url,'/output/clip.mp4');assert.equal(ctx.nodes[1].clip_source_url,original.url);
    assert.equal(ctx.nodes[1].x,330);assert.equal(ctx.nodes[1].mediaKind,'video');assert.equal(calls.opened[0][0],'/output/clip.mp4');
    assert.equal(calls.requests[0].start_seconds,1);assert.equal(calls.requests[0].end_seconds,4);
});
test('full range, read-only mode and duplicate clicks cannot submit extra exports',async()=>{
    const {ctx,calls}=setup();ctx.toggleOutputVideoTrim();await ctx.applyOutputVideoTrim();assert.equal(calls.requests.length,0);
    ctx.setOutputTrimValue('end',3);ctx.isCanvasLockedByOther=()=>true;await ctx.applyOutputVideoTrim();assert.equal(calls.requests.length,0);
    ctx.isCanvasLockedByOther=()=>false;let resolve;ctx.window.CanvasApi.trimSmartCanvasVideo=()=>new Promise(r=>resolve=r);
    const pending=ctx.applyOutputVideoTrim();await ctx.applyOutputVideoTrim();assert.ok(ctx.outputTrimJob);
    resolve({url:'/output/clip.mp4'});await pending;assert.equal(ctx.nodes.length,2);
});
test('closing while exporting adds the result without reopening; switching canvas never adds it to the wrong graph',async()=>{
    for(const switchCanvas of [false,true]){
        const {ctx,calls}=setup();ctx.toggleOutputVideoTrim();ctx.setOutputTrimValue('end',3);let resolve;
        ctx.window.CanvasApi.trimSmartCanvasVideo=()=>new Promise(r=>resolve=r);const pending=ctx.applyOutputVideoTrim();
        ctx.resetOutputVideoTrim();if(switchCanvas)ctx.canvas={id:'canvas-b'};
        resolve({url:'/output/clip.mp4'});await pending;
        assert.equal(calls.opened.length,0);assert.equal(ctx.nodes.length,switchCanvas?1:2);assert.equal(ctx.outputTrimJob,null);
        if(switchCanvas)assert.match(calls.errors[0],/未添加节点/);
    }
});
test('export failure retains the original and permits retry; stale play failure cannot change a newer session',async()=>{
    const {ctx,calls,video}=setup();ctx.toggleOutputVideoTrim();ctx.setOutputTrimValue('end',3);
    ctx.window.CanvasApi.trimSmartCanvasVideo=async()=>{throw Error('FFmpeg failed');};await ctx.applyOutputVideoTrim();
    assert.equal(ctx.nodes.length,1);assert.equal(calls.undo,0);assert.equal(ctx.outputTrimJob,null);assert.match(ctx.outputTrimState.error,/FFmpeg/);
    let reject;video.play=()=>new Promise((_r,j)=>reject=j);const pending=ctx.previewOutputVideoTrim();ctx.resetOutputVideoTrim();ctx.toggleOutputVideoTrim();
    reject(Error('old request'));await pending;assert.equal(ctx.outputTrimState.error,'');
});
