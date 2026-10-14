const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function setup(t,{silent=false,holdPermission=false,recovered=false,unknown=false,enabled=true}={}){
    const f=await fixture(t,'smart',true,{secureOrigin:true}),calls=[],uploads=[],registrations=[],voices=[];let record=recovered?{id:'canvas_audio_recovered_clone',status:'succeeded',result:{audios:['/voice-sample.mp3'],audio_info:{mode:'clone',voice_id:'canvas-voice-clone-browser'}}}:null;
    await f.page.addScriptTag({url:'/static/js/canvas-task-bindings.js'});await f.page.addScriptTag({url:'/static/js/canvas-task-results.js'});
    await f.page.route('**/voice-sample.mp3',route=>route.fulfill({path:path.resolve('tests/fixtures/pixmax-generated-audio.mp3'),contentType:'audio/mpeg'}));
    await f.page.route('**/api/canvas-audio-voices**',route=>{
        const request=route.request(),url=new URL(request.url());
        if(url.pathname.endsWith('/design-tasks')){assert.equal(url.searchParams.get('mode'),'clone');return route.fulfill({json:{tasks:record?[{task_id:record.id,status:record.status,registered:record.registered}]:[]}});}
        if(url.pathname.endsWith('/registration')){const body=request.postDataJSON();registrations.push(body);record.registered=true;voices.push({id:record.result.audio_info.voice_id,task_id:record.id,source:'clone',category:'clone',preview_url:'/voice-sample.mp3',...body});return route.fulfill({json:{voice_id:record.result.audio_info.voice_id,name:body.name}});}
        return route.fulfill({json:{provider_id:'audio',catalog_id:'a'.repeat(64),can_clone:enabled,can_design:false,voices,has_clone_tasks:Boolean(record&&!record.registered)}});
    });
    await f.page.route('**/api/media/uploads/capabilities**',route=>route.fulfill({json:{resumable:false}}));
    await f.page.route('**/api/ai/upload**',route=>{uploads.push(route.request().postDataBuffer());return route.fulfill({json:{files:[{url:'/assets/cloud/ast_'+'b'.repeat(32)+'/voice.wav'}]}});});
    await f.page.route('**/api/canvas-audio-tasks**',route=>{
        const request=route.request();if(request.method()==='POST'){const body=request.postDataJSON(),target=body.canvas_target;calls.push(body);record={id:body.client_task_id,status:'succeeded',canvas_edit_generation:1,result:{audios:['/voice-sample.mp3'],audio_info:{mode:'clone',voice_id:'canvas-voice-clone-browser'}},canvas_binding:{version:3,canvas_id:body.canvas_id,canvas_kind:'smart',source_node_id:target.source_node_id,target_node_id:target.target_node_id,submitted_revision:target.base_revision,graph_sha256:target.input_sha256,request_sha256:'a'.repeat(64)}};return route.fulfill(unknown?{status:502,json:{detail:'克隆回执未确认'}}:{json:{task_id:record.id,status:'queued',canvas_binding:record.canvas_binding}});}return route.fulfill({json:record});
    });
    await f.page.evaluate(({silent,holdPermission})=>{
        window.__micCalls=0;window.__micTracks=[];window.__micContexts=[];
        navigator.mediaDevices.getUserMedia=async()=>{window.__micCalls++;if(holdPermission)await new Promise(resolve=>window.__micRelease=resolve);const context=new AudioContext(),oscillator=context.createOscillator(),gain=context.createGain(),destination=context.createMediaStreamDestination();gain.gain.value=silent?0:.5;oscillator.connect(gain);gain.connect(destination);oscillator.start();await context.resume();window.__micContexts.push(context);window.__micTracks.push(...destination.stream.getTracks());return destination.stream;};
        apiProviders=[{id:'audio',name:'克隆测试',has_key:true,audio_models:['speech-2.8-hd','voice-clone']}];Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});openSmartStudio(createSmartStudioNode('audio',{x:600,y:200}).id);
    },{silent,holdPermission});
    t.after(async()=>{if(!f.page.isClosed())await f.page.evaluate(()=>Promise.all(window.__micContexts.map(context=>context.close()))).catch(()=>{});});
    await f.page.getByRole('button',{name:'选择音色',exact:true}).click();await f.page.waitForFunction(()=>document.querySelector('[data-voice-clone]')?.disabled===false||document.querySelector('.pixmax-voice-modal [role=status]')?.textContent==='');
    return {...f,calls,uploads,registrations};
}
async function start(page){await page.locator('[data-voice-clone]').click();await page.locator('[data-voice-record]:not(:disabled)').waitFor();await page.locator('[data-voice-terms]').check();await page.locator('[data-voice-record]').click();await page.getByRole('button',{name:'停止录制',exact:true}).waitFor();}
async function register(page){await page.getByRole('textbox',{name:'音色名称',exact:true}).fill('我的声音');for(const [label,value] of [['音色登记语言','Chinese'],['音色登记性别','MALE'],['音色登记年龄','ADULT']])await page.getByRole('combobox',{name:label}).selectOption(value);await page.locator('[data-voice-register]').click();await page.locator('.pixmax-voice-design').waitFor({state:'detached'});await page.locator('[data-voice-id]').waitFor();}

test('native microphone recording validates terms and duration, generates one audition and registers a usable voice',async t=>{
    const {page,calls,uploads,registrations,errors}=await setup(t);assert.deepEqual(await page.locator('[data-audio-model] option').allTextContents(),['speech-2.8-hd']);await page.locator('[data-voice-clone]').click();await page.locator('[data-voice-record]:not(:disabled)').waitFor();await page.locator('[data-voice-record]').click();assert.equal(await page.evaluate(()=>__micCalls),0);
    await page.locator('[data-voice-terms]').check();await page.locator('[data-voice-record]').click();await page.getByRole('button',{name:'停止录制',exact:true}).waitFor();await page.locator('[data-voice-record]').click();assert.match(await page.locator('.pixmax-voice-design [role=status]').textContent(),/10秒/);
    await page.waitForFunction(()=>parseFloat(document.querySelector('[data-voice-record-time]').textContent)>=11.1);await page.locator('[data-voice-record]').click();await page.locator('[data-voice-design-run]:not(:disabled)').waitFor();assert.equal(await page.evaluate(()=>__micTracks.every(track=>track.readyState==='ended')),true);await page.screenshot({path:'.local/pixmax-voice-clone.png'});
    await page.locator('[data-voice-design-run]').dblclick();await page.locator('[data-voice-register]').waitFor();assert.equal(calls.length,1);assert.equal(uploads.length,1);assert.ok(uploads[0].includes(Buffer.from('RIFF')));assert.equal(calls[0].model,'voice-clone');assert.equal(calls[0].clone_preview_model,'speech-2.8-hd');assert.equal(calls[0].clone_terms_accepted,true);
    await register(page);assert.equal(registrations.length,1);await page.locator('[data-voice-select]').click();assert.equal(await page.locator('[data-audio-field="timbre_id"]').inputValue(),'canvas-voice-clone-browser');assert.equal(await page.evaluate(()=>nodes[0].images.length),0);assert.deepEqual(errors,[]);
});

test('quiet recordings cannot generate and deleting a sample releases its player and blob',async t=>{
    const {page,calls,uploads,errors}=await setup(t,{silent:true});await start(page);await page.waitForTimeout(150);await page.evaluate(()=>{const original=Date.now;Date.now=()=>original()+11000;});await page.waitForFunction(()=>parseFloat(document.querySelector('[data-voice-record-time]').textContent)>=10);await page.locator('[data-voice-record]').click();await page.getByRole('button',{name:'重新录制',exact:true}).waitFor();assert.equal(await page.locator('[data-voice-design-run]').isDisabled(),true);assert.match(await page.locator('.pixmax-voice-design [role=status]').textContent(),/音量不足/);
    await page.evaluate(()=>window.__quietPlayer=document.querySelector('[data-voice-record-sample]'));await page.locator('[data-voice-sample-delete]').click();assert.equal(await page.evaluate(()=>__quietPlayer.paused&&!__quietPlayer.hasAttribute('src')),true);assert.equal(calls.length,0);assert.equal(uploads.length,0);assert.deepEqual(errors,[]);
});

test('closing during microphone permission releases a late stream and never submits generation',async t=>{
    const {page,calls,errors}=await setup(t,{holdPermission:true});await page.locator('[data-voice-clone]').click();await page.locator('[data-voice-record]:not(:disabled)').waitFor();await page.locator('[data-voice-terms]').check();await page.locator('[data-voice-record]').click();await page.waitForFunction(()=>typeof __micRelease==='function');await page.keyboard.press('Escape');await page.evaluate(()=>__micRelease());await page.waitForFunction(()=>__micTracks.length>0&&__micTracks.every(track=>track.readyState==='ended'));assert.equal(await page.locator('.pixmax-voice-design').count(),0);assert.equal(calls.length,0);assert.deepEqual(errors,[]);
});

test('recording automatically stops at sixty seconds and releases the microphone',async t=>{
    const {page,calls,errors}=await setup(t);await start(page);await page.waitForFunction(()=>Number(document.querySelector('meter')?.value)>.1);await page.waitForTimeout(300);await page.evaluate(()=>{const original=Date.now;Date.now=()=>original()+60000;});await page.getByRole('button',{name:'重新录制',exact:true}).waitFor();assert.equal(await page.evaluate(()=>__micTracks.every(track=>track.readyState==='ended')),true);assert.equal(await page.locator('[data-voice-record-time]').textContent(),'60.0 / 60 秒');assert.equal(calls.length,0);assert.deepEqual(errors,[]);
});

test('clone recovery after an uncertain receipt does not upload or generate a second time',async t=>{
    const {page,calls,uploads,errors}=await setup(t,{unknown:true});await start(page);await page.waitForFunction(()=>parseFloat(document.querySelector('[data-voice-record-time]').textContent)>=11.1);await page.locator('[data-voice-record]').click();await page.locator('[data-voice-design-run]:not(:disabled)').waitFor();await page.locator('[data-voice-design-run]').click();await page.getByRole('button',{name:'查询已有音色任务',exact:true}).waitFor();await page.keyboard.press('Escape');await page.locator('[data-voice-clone]').click();await page.locator('[data-voice-register]').waitFor();assert.equal(calls.length,1);assert.equal(uploads.length,1);assert.deepEqual(errors,[]);
});

test('lease loss stops active recording and completed clone registration remains recoverable when creation is disabled',async t=>{
    const first=await setup(t);await start(first.page);await first.page.evaluate(()=>MemberCanvasEdit.setEditable(false));await first.page.locator('.pixmax-voice-design').waitFor({state:'detached'});assert.equal(await first.page.evaluate(()=>__micTracks.every(track=>track.readyState==='ended')),true);assert.equal(first.calls.length,0);assert.deepEqual(first.errors,[]);
    const second=await setup(t,{recovered:true,enabled:false});await second.page.locator('[data-voice-clone]').click();await second.page.locator('[data-voice-register]').waitFor();await register(second.page);assert.equal(second.calls.length,0);assert.equal(second.uploads.length,0);assert.equal(second.registrations.length,1);assert.deepEqual(second.errors,[]);
});
