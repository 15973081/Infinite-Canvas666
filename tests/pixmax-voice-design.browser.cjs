const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function setup(t,{enabled=true,unknown=false,recovered=false}={}){
    const f=await fixture(t,'smart',true,{secureOrigin:true}),calls=[],registrations=[],voices=[],catalogId='a'.repeat(64);let record;
    if(recovered)record={id:'canvas_audio_recovered_voice',status:'succeeded',result:{audios:['/voice-sample.mp3'],audio_info:{mode:'design',voice_id:'canvas-voice-recovered'}},registered:false};
    await f.page.addScriptTag({url:'/static/js/canvas-task-bindings.js'});await f.page.addScriptTag({url:'/static/js/canvas-task-results.js'});
    await f.page.route('**/voice-sample.mp3',route=>route.fulfill({path:path.resolve('tests/fixtures/pixmax-generated-audio.mp3'),contentType:'audio/mpeg'}));
    await f.page.route('**/api/canvas-audio-voices**',route=>{
        const url=new URL(route.request().url());if(url.pathname.endsWith('/design-tasks'))return route.fulfill({json:{tasks:record?[{task_id:record.id,status:record.status,registered:record.registered,prompt:'温暖旁白',preview_text:'你好，世界。'}]:[]}});
        if(url.pathname.endsWith('/registration')){const body=route.request().postDataJSON();registrations.push(body);const voice={id:record.result.audio_info.voice_id,task_id:record.id,category:'clone',source:'design',favorite:false,preview_url:'/voice-sample.mp3',...body};voice.id=record.result.audio_info.voice_id;record.registered=true;voices.splice(0,voices.length,voice);return route.fulfill({json:{voice_id:voice.id,name:voice.name}});}
        return route.fulfill({json:{provider_id:'audio',catalog_id:catalogId,voices,can_design:enabled,has_design_tasks:Boolean(record&&!record.registered)}});
    });
    await f.page.route('**/api/canvas-audio-tasks**',route=>{
        if(route.request().method()==='POST'){
            const body=route.request().postDataJSON(),target=body.canvas_target;calls.push(body);
            record={id:body.client_task_id,status:'succeeded',canvas_edit_generation:1,result:{audios:['/voice-sample.mp3'],audio_info:{mode:'design',voice_id:'canvas-voice-browser'}},canvas_binding:{version:3,canvas_id:body.canvas_id,canvas_kind:'smart',source_node_id:target.source_node_id,target_node_id:target.target_node_id,submitted_revision:target.base_revision,graph_sha256:target.input_sha256,request_sha256:'a'.repeat(64)}};
            if(unknown)return route.fulfill({status:502,json:{detail:'音色任务回执未确认'}});
            return route.fulfill({json:{task_id:record.id,status:'queued',canvas_binding:record.canvas_binding}});
        }return route.fulfill({json:record});
    });
    await f.page.evaluate(()=>{apiProviders=[{id:'audio',name:'音色设计测试',has_key:true,audio_models:['speech-2.8-hd','voice-design']}];Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});openSmartStudio(createSmartStudioNode('audio',{x:600,y:200}).id);});
    await f.page.getByRole('button',{name:'选择音色',exact:true}).click();await f.page.waitForFunction(()=>document.querySelector('[data-voice-design]')?.disabled===false||document.querySelector('.pixmax-voice-modal [role=status]')?.textContent==='');
    return {...f,calls,registrations,voices,catalogId};
}
async function design(page){await page.locator('[data-voice-design]').click();await page.locator('[data-voice-design-run]:not(:disabled)').waitFor();await page.getByRole('textbox',{name:'音色设计提示词'}).fill('沉稳、温暖的纪录片旁白');await page.getByRole('textbox',{name:'音色试听文本'}).fill('欢迎来到这座城市。');await page.locator('[data-voice-design-run]').dblclick();await page.locator('[data-voice-register]').waitFor();}
async function register(page,name='城市旁白'){await page.getByRole('textbox',{name:'音色名称',exact:true}).fill(name);await page.getByRole('combobox',{name:'音色登记语言'}).selectOption('Chinese');await page.getByRole('combobox',{name:'音色登记性别'}).selectOption('MALE');await page.getByRole('combobox',{name:'音色登记年龄'}).selectOption('ADULT');await page.locator('[data-voice-register]').click();await page.locator('.pixmax-voice-design').waitFor({state:'detached'});await page.locator('[data-voice-id]').waitFor();}

test('text voice design auditions a real MP3, registers metadata and selects a named voice without inserting media',async t=>{
    const {page,calls,registrations,errors}=await setup(t);assert.deepEqual(await page.locator('[data-audio-model] option').allTextContents(),['speech-2.8-hd']);await design(page);
    assert.equal(calls.length,1);assert.equal(calls[0].mode,'design');assert.equal(calls[0].model,'voice-design');assert.equal(calls[0].voice_catalog_id,'a'.repeat(64));assert.equal(await page.evaluate(()=>nodes[0].images.length),0);
    await page.waitForFunction(()=>document.querySelector('.pixmax-voice-design audio')?.readyState>=2);await page.evaluate(async()=>{window.__designAudio=document.querySelector('.pixmax-voice-design audio');await window.__designAudio.play();});
    await page.locator('[data-voice-register]').click();assert.equal(registrations.length,0);await register(page);await page.waitForFunction(()=>window.__designAudio.paused&&!window.__designAudio.hasAttribute('src'));
    assert.equal(registrations.length,1);await page.locator('[data-voice-select]').click();assert.equal(await page.locator('[data-audio-field="timbre_id"]').inputValue(),'canvas-voice-browser');assert.match(await page.locator('[data-audio-voice]').textContent(),/城市旁白/);assert.equal(await page.evaluate(()=>nodes[0].images.length),0);assert.deepEqual(errors,[]);
});

test('completed voice design recovers registration and allows metadata editing without another generation',async t=>{
    const {page,calls,registrations,errors}=await setup(t,{recovered:true});await page.locator('[data-voice-design]').click();await page.locator('[data-voice-register]').waitFor();await register(page);
    await page.locator('[data-voice-edit]').click();await page.locator('[data-voice-register]').waitFor();assert.equal(await page.getByRole('textbox',{name:'音色名称',exact:true}).inputValue(),'城市旁白');await page.getByRole('textbox',{name:'音色名称',exact:true}).fill('纪录片旁白');await page.locator('[data-voice-register]').click();await page.locator('.pixmax-voice-design').waitFor({state:'detached'});
    assert.equal(calls.length,0);assert.equal(registrations.length,2);await page.locator('[data-voice-id]').waitFor();assert.match(await page.locator('[data-voice-id]').textContent(),/纪录片旁白/);assert.deepEqual(errors,[]);
});

test('ambiguous design admission recovers its original receipt instead of generating a second voice',async t=>{
    const {page,calls,errors}=await setup(t,{unknown:true});await page.locator('[data-voice-design]').click();await page.locator('[data-voice-design-run]:not(:disabled)').waitFor();await page.getByRole('textbox',{name:'音色设计提示词'}).fill('温暖旁白');await page.getByRole('textbox',{name:'音色试听文本'}).fill('你好。');await page.locator('[data-voice-design-run]').click();await page.getByRole('button',{name:'查询已有音色任务',exact:true}).waitFor();
    await page.keyboard.press('Escape');assert.equal(await page.locator('.pixmax-voice-modal').count(),1);await page.locator('[data-voice-design]').click();await page.locator('[data-voice-register]').waitFor();assert.equal(calls.length,1);assert.deepEqual(errors,[]);
});

test('design requires configured capability and closes on lease loss without any paid admission',async t=>{
    const unavailable=await setup(t,{enabled:false});assert.equal(await unavailable.page.locator('[data-voice-design]').isDisabled(),true);assert.equal(unavailable.calls.length,0);assert.deepEqual(unavailable.errors,[]);
    const {page,calls,errors}=await setup(t);await page.locator('[data-voice-design]').click();await page.locator('[data-voice-design-run]:not(:disabled)').waitFor();await page.evaluate(()=>MemberCanvasEdit.setEditable(false));await page.waitForFunction(()=>!PixmaxVoiceDesign.opened);assert.equal(calls.length,0);assert.deepEqual(errors,[]);
});

test('returning from registration releases its audition and preserves the design draft without another paid request',async t=>{
    const {page,calls,errors}=await setup(t);await design(page);await page.waitForFunction(()=>document.querySelector('.pixmax-voice-design audio')?.readyState>=2);await page.evaluate(async()=>{window.__returnedDesignAudio=document.querySelector('.pixmax-voice-design audio');await window.__returnedDesignAudio.play();});await page.locator('[data-voice-design-back]').click();
    assert.equal(await page.getByRole('textbox',{name:'音色设计提示词'}).inputValue(),'沉稳、温暖的纪录片旁白');assert.equal(await page.getByRole('textbox',{name:'音色试听文本'}).inputValue(),'欢迎来到这座城市。');assert.equal(await page.evaluate(()=>window.__returnedDesignAudio.paused&&!window.__returnedDesignAudio.hasAttribute('src')),true);assert.equal(calls.length,1);assert.deepEqual(errors,[]);
});

test('an existing audition can be registered after new voice design capability is disabled',async t=>{
    const {page,calls,registrations,errors}=await setup(t,{enabled:false,recovered:true});assert.equal(await page.locator('[data-voice-design]').isDisabled(),false);await page.locator('[data-voice-design]').click();await page.locator('[data-voice-register]').waitFor();await register(page);assert.equal(calls.length,0);assert.equal(registrations.length,1);assert.deepEqual(errors,[]);
});
