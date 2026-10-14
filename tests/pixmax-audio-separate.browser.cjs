const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function setup(t,member=false){
    const result=await fixture(t,'smart',member,{secureOrigin:true});
    await result.page.route('**/assets/separate.mp4',route=>route.fulfill({path:path.resolve('tests/fixtures/pixmax-audio-source.mp4'),contentType:'video/mp4'}));
    await result.page.evaluate(()=>{
        if(window.CanvasSession?.enabled)Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});
        const source=createNode(600,120,[{url:'/assets/separate.mp4',name:'实拍.mp4',kind:'video',natural_w:160,natural_h:90}],{select:false});window.separateSourceId=source.id;
    });
    return result;
}
async function uploads(page,{held=false}={}){
    const files=[];let release,seen;const gate=new Promise(resolve=>release=resolve),requested=new Promise(resolve=>seen=resolve);
    await page.route('**/api/ai/upload',async route=>{
        const request=route.request(),form=await new Request('http://upload.test',{method:'POST',headers:request.headers(),body:request.postDataBuffer()}).formData();
        for(const file of form.getAll('files'))files.push({name:file.name,type:file.type,bytes:Buffer.from(await file.arrayBuffer())});
        seen();if(held)await gate;
        return route.fulfill({json:{files:files.map((file,index)=>({url:'/assets/separated-'+index+(file.type.startsWith('audio/')?'.mp3':'.mp4'),name:file.name,kind:file.type.startsWith('audio/')?'audio':'video'}))}});
    });
    await page.route('**/assets/separated-*',route=>{
        const index=Number(new URL(route.request().url()).pathname.match(/separated-(\d+)/)?.[1]),file=files[index];
        return file?route.fulfill({body:file.bytes,contentType:file.type}):route.fulfill({status:404,body:'missing'});
    });
    return {files,requested,release};
}
test('native audio separation produces a real silent MP4 and MP3, saves both nodes and undoes them together',async t=>{
    const {page,errors,record}=await setup(t),service=await uploads(page);
    await page.evaluate(()=>runSmartNodeToolbarAction(separateSourceId,'audio-separate'));
    await page.locator('.pixmax-media-progress [role=status]').filter({hasText:'已保存 2 个分离文件'}).waitFor();
    assert.equal(service.files.length,2);assert.deepEqual(service.files.map(file=>file.name),['实拍-无声.mp4','实拍-音轨-1.mp3']);
    const tmp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'pixmax-split-'));t.after(()=>{
        assert.ok(path.resolve(tmp).startsWith(path.resolve(require('node:os').tmpdir())+path.sep)&&path.basename(tmp).startsWith('pixmax-split-'));
        fs.rmSync(tmp,{recursive:true,force:true});
    });
    for(const [index,file] of service.files.entries()){
        const filename=path.join(tmp,index+'.'+(index?'mp3':'mp4'));fs.writeFileSync(filename,file.bytes);
        const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name','-of','json',filename],{encoding:'utf8'}));
        assert.deepEqual(probe.streams.map(stream=>stream.codec_type),[index?'audio':'video']);if(index)assert.equal(probe.streams[0].codec_name,'mp3');
    }
    assert.equal(record.nodes.length,3);assert.deepEqual(record.nodes.slice(1).map(node=>node.images[0].kind),['video','audio']);assert.equal(await page.evaluate(()=>PixmaxMediaTools.hasUnfinishedWork()),false);
    await page.evaluate(()=>openSmartAudioLightbox(nodes[2].id,0));
    await page.waitForFunction(()=>Number.isFinite(document.querySelector('audio')?.duration)&&document.querySelector('audio').duration>1);
    await page.evaluate(()=>performUndo());assert.equal(await page.evaluate(()=>nodes.length),1);assert.deepEqual(errors,[]);
});

test('multiple source audio tracks produce distinct MP3 files rather than duplicating the primary track',async t=>{
    const {page,errors}=await setup(t),service=await uploads(page);
    await page.route('**/assets/multitrack.mp4',route=>route.fulfill({path:path.resolve('tests/fixtures/pixmax-audio-multitrack.mp4'),contentType:'video/mp4'}));
    await page.evaluate(()=>{nodes[0].images[0].url='/assets/multitrack.mp4';PixmaxMediaTools.openAudioSeparate(separateSourceId,0);});
    await page.locator('.pixmax-media-progress [role=status]').filter({hasText:'已保存 3 个分离文件'}).waitFor();
    assert.deepEqual(service.files.map(file=>file.name),['实拍-无声.mp4','实拍-音轨-1.mp3','实拍-音轨-2.mp3']);assert.notDeepEqual(service.files[1].bytes,service.files[2].bytes);
    assert.equal(await page.evaluate(()=>nodes.length),4);assert.deepEqual(errors,[]);
});
for(const change of ['source','lease','close','scope'])test('late audio separation uploads cannot write after '+change,async t=>{
    const {page,errors}=await setup(t,true),service=await uploads(page,{held:true});
    // Exercise the real native processor while keeping only the upload transport
    // local; the member uploader's chunk protocol has its own integration suite.
    await page.evaluate(()=>{window.CanvasApi={...CanvasApi,uploadAi:async form=>{const response=await fetch('/api/ai/upload',{method:'POST',body:form});return response.json();}};});
    await page.evaluate(()=>PixmaxMediaTools.openAudioSeparate(separateSourceId,0));await service.requested;
    if(change==='source')await page.evaluate(()=>nodes[0].images[0].url='/assets/changed.mp4');
    if(change==='lease')await page.evaluate(()=>MemberCanvasEdit.setEditable(false));
    if(change==='close')await page.getByRole('button',{name:'关闭音频分离',exact:true}).click();
    if(change==='scope')await page.evaluate(()=>CanvasSession.context.workspace.id='other-workspace');
    service.release();await page.waitForFunction(()=>!document.querySelector('.pixmax-media-progress')||document.querySelector('.pixmax-media-progress [data-media-retry]')?.hidden===false);
    assert.equal(await page.evaluate(()=>nodes.length),1);assert.deepEqual(errors,[]);
});

test('saving during an upload preserves semantic source identity and successful manual save releases local results',async t=>{
    const {page,errors}=await setup(t,true),service=await uploads(page,{held:true});
    await page.evaluate(()=>{window.CanvasApi={...CanvasApi,uploadAi:async form=>(await fetch('/api/ai/upload',{method:'POST',body:form})).json()};});
    await page.evaluate(()=>PixmaxMediaTools.openAudioSeparate(separateSourceId,0));await service.requested;
    await page.evaluate(()=>saveCanvas({force:true}));service.release();await page.locator('.pixmax-media-progress [role=status]').filter({hasText:'已保存 2 个分离文件'}).waitFor();
    assert.equal(await page.evaluate(()=>nodes.length),3);assert.equal(await page.evaluate(()=>PixmaxMediaTools.hasUnfinishedWork()),false);assert.deepEqual(errors,[]);
});

test('viewers cannot invoke separation directly and cancelling navigation retains pending local results',async t=>{
    const {page,errors}=await setup(t,true),service=await uploads(page,{held:true});
    await page.evaluate(()=>MemberCanvasEdit.setEditable(false));await page.evaluate(()=>PixmaxMediaTools.openAudioSeparate(separateSourceId,0));assert.equal(await page.locator('.pixmax-media-progress').count(),0);
    await page.evaluate(()=>{MemberCanvasEdit.setEditable(true);window.CanvasApi={...CanvasApi,uploadAi:async form=>(await fetch('/api/ai/upload',{method:'POST',body:form})).json()};});
    await page.evaluate(()=>PixmaxMediaTools.openAudioSeparate(separateSourceId,0));await service.requested;
    page.once('dialog',dialog=>dialog.dismiss());assert.equal(await page.evaluate(()=>CanvasNavigation.confirmLocalWork()),false);assert.equal(await page.evaluate(()=>PixmaxMediaTools.hasUnfinishedWork()),true);
    await page.getByRole('button',{name:'关闭音频分离',exact:true}).click();service.release();assert.equal(await page.evaluate(()=>PixmaxMediaTools.hasUnfinishedWork()),false);assert.deepEqual(errors,[]);
});
test('retrying document save retains inserted results without uploading or inserting duplicates',async t=>{
    const {page,errors}=await setup(t),service=await uploads(page);let fail=true;
    await page.route('**/api/canvases/canvas-test',route=>route.request().method()==='PUT'&&fail?route.fulfill({status:503,json:{detail:'save failed'}}):route.fallback());
    await page.evaluate(()=>PixmaxMediaTools.openAudioSeparate(separateSourceId,0));
    await page.locator('.pixmax-media-progress [role=status]').filter({hasText:'尚未保存'}).waitFor();assert.equal(await page.evaluate(()=>nodes.length),3);assert.equal(service.files.length,2);
    fail=false;await page.getByRole('button',{name:'重试保存',exact:true}).click();await page.locator('.pixmax-media-progress [role=status]').filter({hasText:'已保存 2 个分离文件'}).waitFor();
    assert.equal(await page.evaluate(()=>nodes.length),3);assert.equal(service.files.length,2);assert.equal(await page.evaluate(()=>PixmaxMediaTools.hasUnfinishedWork()),false);assert.deepEqual(errors,[]);
});

test('the ordinary canvas save acknowledges separated results after the first save fails',async t=>{
    const {page,errors}=await setup(t),service=await uploads(page);let fail=true;
    await page.route('**/api/canvases/canvas-test',route=>route.request().method()==='PUT'&&fail?route.fulfill({status:503,json:{detail:'save failed'}}):route.fallback());
    await page.evaluate(()=>PixmaxMediaTools.openAudioSeparate(separateSourceId,0));
    await page.locator('.pixmax-media-progress [role=status]').filter({hasText:'尚未保存'}).waitFor();assert.equal(await page.evaluate(()=>PixmaxMediaTools.hasUnfinishedWork()),true);
    fail=false;await page.evaluate(()=>saveCanvas({force:true}));await page.locator('.pixmax-media-progress [role=status]').filter({hasText:'已保存 2 个分离文件'}).waitFor();
    assert.equal(await page.evaluate(()=>PixmaxMediaTools.hasUnfinishedWork()),false);assert.equal(await page.getByRole('button',{name:'重试保存',exact:true}).isVisible(),false);assert.equal(service.files.length,2);assert.deepEqual(errors,[]);
});

test('explicit page exit discards pending local results and removes a progress panel before navigation',async t=>{
    const {page,errors}=await setup(t),service=await uploads(page,{held:true});
    await page.evaluate(()=>PixmaxMediaTools.openAudioSeparate(separateSourceId,0));await service.requested;
    await page.evaluate(()=>PixmaxMediaTools.allowPageExit());assert.equal(await page.locator('.pixmax-media-progress').count(),0);assert.equal(await page.evaluate(()=>PixmaxMediaTools.hasUnfinishedWork()),false);
    const received=page.waitForResponse(response=>response.url().endsWith('/api/ai/upload'));service.release();await received;
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await page.evaluate(()=>nodes.length),1);assert.deepEqual(errors,[]);
});
