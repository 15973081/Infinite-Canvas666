const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');
const catalog={provider_id:'audio',catalog_id:'a'.repeat(64),voices:[
    {id:'male-qn-qingse',name:'青涩青年',description:'清晰男声',category:'system',language:'Chinese',gender:'MALE',accent:'CHINESE_NORTHERN',age:'YOUTH',favorite:false,preview_url:'/voice-sample.mp3'},
    {id:'English_CalmWoman',name:'Calm Woman',description:'Calm narration',category:'system',language:'English',gender:'FEMALE',accent:'ENGLISH_US',age:'ADULT',favorite:false,preview_url:''},
    {id:'private-clone',name:'我的专属音色',description:'自定义声音',category:'clone',language:'Chinese',gender:'FEMALE',favorite:false,preview_url:''}
]};
async function setup(t,{held=false,fail=false,favoriteFailure=false,count=0}={}){
    const {page,errors,writes}=await fixture(t,'smart',true,{secureOrigin:true});
    const data=structuredClone(catalog),calls=[];let release,seen;
    if(count)data.voices=Array.from({length:count},(_,index)=>({...data.voices[0],id:'voice-'+index,name:'音色 '+index}));
    const gate=new Promise(resolve=>release=resolve),arrived=new Promise(resolve=>seen=resolve);
    await page.route('**/api/canvas-audio-voices**',async route=>{
        const request=route.request();calls.push({method:request.method(),url:request.url(),body:request.method()==='PUT'?request.postDataJSON():null});
        if(request.method()==='GET'){seen();if(held)await gate;if(fail){fail=false;return route.fulfill({status:502,json:{detail:'音色目录读取失败'}});}return route.fulfill({json:data});}
        if(favoriteFailure){favoriteFailure=false;return route.fulfill({status:503,json:{detail:'收藏未保存，请重试'}});}
        const payload=request.postDataJSON();data.voices.find(voice=>voice.id===payload.voice_id).favorite=payload.favorite;
        return route.fulfill({json:{voice_id:payload.voice_id,favorite:payload.favorite}});
    });
    await page.route('**/voice-sample.mp3',route=>route.fulfill({path:path.resolve('tests/fixtures/pixmax-generated-audio.mp3'),contentType:'audio/mpeg'}));
    await page.evaluate(()=>{apiProviders=[{id:'audio',has_key:true,audio_models:['speech-2.8-hd','music-2.6']},{id:'other',has_key:true,audio_models:['speech-2.8-hd']}];openSmartStudio(createSmartStudioNode('audio',{x:600,y:300}).id);});
    await page.getByRole('button',{name:'选择音色',exact:true}).click();
    return {page,errors,writes,calls,data,release,arrived};
}

test('voice library searches and filters then selects a named voice into audio settings',async t=>{
    const {page,errors,calls}=await setup(t);await page.getByRole('dialog',{name:'音色选择',exact:true}).waitFor();
    await page.locator('[data-voice-id]').first().waitFor();
    assert.equal(await page.locator('[data-voice-id]').count(),2);
    await page.getByRole('combobox',{name:'音色语言'}).selectOption('English');assert.equal(await page.locator('[data-voice-id]').count(),1);
    await page.getByRole('combobox',{name:'音色语言'}).selectOption('');
    await page.locator('.pixmax-voice-filters summary').click();await page.getByRole('combobox',{name:'音色口音'}).selectOption('ENGLISH_US');
    await page.getByRole('checkbox',{name:'成年',exact:true}).check();assert.equal(await page.locator('[data-voice-id]').count(),1);
    await page.getByRole('searchbox',{name:'搜索音色'}).fill('calm');
    await page.locator('[data-voice-id="English_CalmWoman"] [data-voice-select]').click();
    assert.equal(await page.getByRole('dialog',{name:'音色选择',exact:true}).count(),0);
    assert.equal(await page.locator('[data-audio-field="timbre_id"]').inputValue(),'English_CalmWoman');
    assert.match(await page.getByRole('button',{name:'选择音色',exact:true}).innerText(),/Calm Woman/);
    assert.ok(calls.every(call=>call.method==='GET'));assert.deepEqual(errors,[]);
});

test('personal voices and favorites survive reopening while the canvas and tasks remain unchanged',async t=>{
    const {page,errors,calls}=await setup(t);await page.locator('[data-voice-id]').first().waitFor();
    const before=await page.evaluate(()=>JSON.stringify(canvasForStorage({...canvas,nodes})));
    await page.getByRole('button',{name:'收藏音色 青涩青年',exact:true}).click();await page.getByRole('button',{name:'取消收藏 青涩青年',exact:true}).waitFor();
    await page.getByRole('tab',{name:'收藏音色',exact:true}).click();assert.equal(await page.locator('[data-voice-id]').count(),1);
    await page.getByRole('tab',{name:'我的音色',exact:true}).click();assert.equal(await page.locator('[data-voice-id="private-clone"]').count(),1);
    await page.getByRole('button',{name:'关闭音色选择'}).click();await page.getByRole('button',{name:'选择音色',exact:true}).click();
    await page.getByRole('button',{name:'取消收藏 青涩青年',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>JSON.stringify(canvasForStorage({...canvas,nodes}))),before);
    assert.equal(calls.filter(call=>call.method==='PUT').length,1);assert.deepEqual(errors,[]);
});

test('voice audition plays an existing MP3 and closing the panel stops and removes its player',async t=>{
    const {page,errors,calls}=await setup(t);await page.getByRole('button',{name:'试听音色 青涩青年',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.pixmax-voice-modal audio')?.readyState>=2);
    await page.evaluate(()=>window.voiceTestAudio=document.querySelector('.pixmax-voice-modal audio'));
    assert.equal(await page.getByRole('button',{name:'试听音色 Calm Woman',exact:true}).isEnabled(),false);
    await page.getByRole('button',{name:'关闭音色选择'}).click();
    assert.equal(await page.evaluate(()=>voiceTestAudio.paused&&!voiceTestAudio.isConnected&&voiceTestAudio.getAttribute('src')===null),true);
    assert.ok(calls.every(call=>call.method==='GET'));assert.deepEqual(errors,[]);
});

for(const change of ['provider','lease','close'])test('voice directory ignores delayed responses after '+change,async t=>{
    const {page,errors,release,arrived}=await setup(t,{held:true});await arrived;
    if(change==='provider')await page.evaluate(()=>{const select=document.querySelector('[data-audio-provider]');select.value='other';select.onchange();});
    if(change==='lease')await page.evaluate(()=>MemberCanvasEdit.setEditable(false));
    if(change==='close')await page.evaluate(()=>document.querySelector('.pixmax-creation-modal header button').click());
    release();await page.waitForFunction(()=>!document.querySelector('.pixmax-voice-modal'));
    assert.equal(await page.evaluate(()=>nodes[0].images.length),0);assert.deepEqual(errors,[]);
});

test('voice lookup and favorite failures retry without creating generation tasks',async t=>{
    const {page,errors,calls}=await setup(t,{fail:true,favoriteFailure:true});
    await page.locator('.pixmax-voice-modal [role=status]').filter({hasText:'音色目录读取失败'}).waitFor();
    await page.getByRole('button',{name:'刷新',exact:true}).click();await page.getByRole('button',{name:'收藏音色 青涩青年',exact:true}).click();
    await page.locator('.pixmax-voice-modal [role=status]').filter({hasText:'收藏未保存'}).waitFor();
    await page.getByRole('button',{name:'收藏音色 青涩青年',exact:true}).click();await page.getByRole('button',{name:'取消收藏 青涩青年',exact:true}).waitFor();
    assert.equal(calls.filter(call=>call.method==='PUT').length,2);assert.equal(await page.evaluate(()=>smartPendingTasks(nodes[0]).length),0);assert.deepEqual(errors,[]);
});

test('large voice lists mount bounded pages and search includes voices outside the mounted page',async t=>{
    const {page,errors}=await setup(t,{count:151});await page.locator('[data-voice-id]').first().waitFor();
    assert.equal(await page.locator('[data-voice-id]').count(),50);await page.getByRole('button',{name:'加载更多',exact:true}).click();
    assert.equal(await page.locator('[data-voice-id]').count(),100);await page.getByRole('searchbox',{name:'搜索音色'}).fill('音色 150');
    assert.equal(await page.locator('[data-voice-id]').count(),1);assert.equal(await page.locator('[data-voice-id="voice-150"]').count(),1);assert.deepEqual(errors,[]);
});

test('selected voice is saved into the durable speech request rather than remaining a display-only choice',async t=>{
    const {page,errors}=await setup(t);await page.addScriptTag({url:'/static/js/canvas-task-bindings.js'});await page.addScriptTag({url:'/static/js/canvas-task-results.js'});
    await page.evaluate(()=>{Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});});
    const calls=[];let record;
    await page.route('**/api/canvas-audio-tasks**',route=>{
        const request=route.request();if(request.method()==='POST'){
            const payload=request.postDataJSON(),target=payload.canvas_target;calls.push(payload);
            record={id:payload.client_task_id,status:'succeeded',canvas_edit_generation:1,result:{audios:['/voice-sample.mp3']},canvas_binding:{version:3,canvas_id:payload.canvas_id,canvas_kind:'smart',source_node_id:target.source_node_id,target_node_id:target.target_node_id,submitted_revision:target.base_revision,graph_sha256:target.input_sha256,request_sha256:'a'.repeat(64)}};
            return route.fulfill({json:{task_id:record.id,status:'queued',canvas_binding:record.canvas_binding}});
        }return route.fulfill({json:record});
    });
    await page.locator('[data-voice-id="English_CalmWoman"] [data-voice-select]').click();
    await page.getByRole('textbox',{name:'音频创作内容'}).fill('Welcome to the canvas.');await page.locator('[data-audio-run]').click();
    await page.waitForFunction(()=>nodes[0].images.length===1);
    assert.equal(calls.length,1);assert.equal(calls[0].timbre_id,'English_CalmWoman');assert.equal(calls[0].mode,'speech');
    assert.equal(await page.evaluate(()=>nodes[0].audioGeneration.timbre_id),'English_CalmWoman');assert.deepEqual(errors,[]);
});
