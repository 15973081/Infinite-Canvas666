const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');

async function setup(t,options={}){
    const result=await fixture(t,'smart',true,{secureOrigin:true,...options});
    await result.page.addScriptTag({url:'/static/js/canvas-task-bindings.js'});
    await result.page.addScriptTag({url:'/static/js/canvas-task-results.js'});
    await result.page.evaluate(()=>{
        apiProviders=[{id:'audio',name:'音频测试',has_key:true,audio_models:['speech-2.8-hd','speech-2.8-turbo','music-2.6']}];
        Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});
        Object.defineProperty(MemberCanvasEdit.active.lease,'revision',{get(){return canvas.revision;}});
    });
    await result.page.route('**/generated-audio.mp3',route=>route.fulfill({path:path.resolve('tests/fixtures/pixmax-generated-audio.mp3'),contentType:'audio/mpeg'}));
    return result;
}
async function service(page,{held=false,status=200}={}){
    const calls=[],records=new Map();let release,seen;
    const gate=new Promise(resolve=>release=resolve),polling=new Promise(resolve=>seen=resolve);
    await page.route('**/api/canvas-audio-tasks**',async route=>{
        const request=route.request();
        if(request.method()==='POST'){
            const payload=request.postDataJSON(),target=payload.canvas_target;calls.push(payload);
            const record={id:payload.client_task_id,status:'succeeded',canvas_edit_generation:1,result:{audios:['/generated-audio.mp3']},
                canvas_binding:{version:3,canvas_id:payload.canvas_id,canvas_kind:'smart',source_node_id:target.source_node_id,target_node_id:target.target_node_id,
                    submitted_revision:target.base_revision,graph_sha256:target.input_sha256,request_sha256:'a'.repeat(64)}};
            records.set(record.id,record);
            return route.fulfill({status,json:status===200?{task_id:record.id,status:'queued',canvas_binding:record.canvas_binding}:{detail:'任务未确认'}});
        }
        seen();if(held)await gate;
        const id=new URL(request.url()).pathname.split('/').pop();return route.fulfill({json:records.get(id)});
    });
    return {calls,records,polling,release};
}
async function open(page){
    await page.evaluate(()=>openSmartStudio(createSmartStudioNode('audio',{x:600,y:300}).id));
    await page.getByRole('textbox',{name:'音频创作内容'}).fill('雨夜的城市灯光');
}
async function finished(page){await page.waitForFunction(()=>nodes.some(node=>node.type==='smart-audio'&&node.images.length===1));}

test('speech parameters and current text references produce a playable saved audio node with undo',async t=>{
    const {page,errors,record}=await setup(t),api=await service(page);await open(page);
    await page.evaluate(()=>{const source=createPromptNode(80,100,{select:false});source.text='刚更新的参考文本';canvas.connections.push({from:source.id,to:nodes[0].id,kind:'input'});});
    await page.getByRole('spinbutton',{name:'语速',exact:true}).fill('1.25');
    await page.getByRole('spinbutton',{name:'音量',exact:true}).fill('0');
    await page.getByRole('spinbutton',{name:'音调',exact:true}).fill('-2');
    await page.locator('details summary').click();await page.getByRole('spinbutton',{name:'音高修饰'}).fill('7');
    await page.getByRole('combobox',{name:'声音效果'}).selectOption('lofi_telephone');
    await page.locator('[data-audio-run]').click();await finished(page);
    assert.equal(api.calls.length,1);assert.equal(api.calls[0].mode,'speech');assert.equal(api.calls[0].vol,0);
    assert.equal(api.calls[0].speed,1.25);assert.equal(api.calls[0].voice_modify_pitch,7);assert.equal(api.calls[0].pitch,-2);
    assert.match(api.calls[0].prompt,/刚更新的参考文本/);
    await page.getByRole('button',{name:'关闭音频生成',exact:true}).click();await page.getByRole('button',{name:'播放音频',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('audio')?.readyState>=2);
    await page.evaluate(()=>saveCanvas({force:true}));assert.equal(record.nodes[0].audioGeneration.vol,0);assert.equal(record.nodes[0].images[0].kind,'audio');
    await page.evaluate(()=>performUndo());assert.equal(await page.evaluate(()=>nodes[0].images.length),0);assert.deepEqual(errors,[]);
});

for(const mode of ['CUSTOM','ADAPTIVE','INSTRUMENTAL'])test('music '+mode+' preserves the native mode and lyrics',async t=>{
    const {page,errors}=await setup(t),api=await service(page);await open(page);
    await page.getByRole('combobox',{name:'音频模型'}).selectOption('music-2.6');
    await page.getByRole('combobox',{name:'音乐模式'}).selectOption(mode);
    if(mode==='CUSTOM')await page.getByRole('textbox',{name:'歌词',exact:true}).fill('[verse]\n雨夜城市的灯光');
    assert.equal(await page.getByRole('spinbutton',{name:'语速',exact:true}).isVisible(),false);
    assert.equal(await page.getByRole('textbox',{name:'歌词',exact:true}).isVisible(),mode==='CUSTOM');
    await page.locator('[data-audio-run]').click();await finished(page);
    assert.equal(api.calls.length,1);assert.equal(api.calls[0].music_mode,mode);assert.equal(api.calls[0].mode,'music');assert.deepEqual(errors,[]);
});

for(const change of ['input','reference','lease','close'])test('audio refuses a delayed result after '+change,async t=>{
    const {page,errors}=await setup(t),api=await service(page,{held:true});await open(page);
    if(change==='reference')await page.evaluate(()=>{const source=createPromptNode(80,100,{select:false});source.text='原参考';canvas.connections.push({from:source.id,to:nodes[0].id,kind:'input'});});
    await page.locator('[data-audio-run]').click();await api.polling;
    if(change==='input')await page.getByRole('textbox',{name:'音频创作内容'}).fill('修改的内容');
    if(change==='reference')await page.evaluate(()=>nodes[1].text='已修改参考');
    if(change==='lease')await page.evaluate(()=>MemberCanvasEdit.setEditable(false));
    if(change==='close')await page.getByRole('button',{name:'关闭音频生成',exact:true}).click();
    api.release();await page.waitForFunction(()=>!PixmaxAudioCreation.busy());
    assert.equal(await page.evaluate(()=>nodes[0].images.length),0);assert.equal(api.calls.length,1);
    assert.equal(await page.evaluate(()=>smartPendingTasks(nodes[0])[0]?.taskId),api.calls[0].client_task_id);assert.deepEqual(errors,[]);
});

test('ambiguous admission queries the original task without a second paid submission',async t=>{
    const {page,errors}=await setup(t),api=await service(page,{status:503});await open(page);
    await page.locator('[data-audio-run]').click();await page.waitForFunction(()=>!PixmaxAudioCreation.busy()&&smartPendingTasks(nodes[0]).length===1);
    await page.getByRole('button',{name:'查询已有音频任务',exact:true}).click();await finished(page);
    assert.equal(api.calls.length,1);assert.equal(await page.evaluate(()=>smartPendingTasks(nodes[0]).length),0);assert.deepEqual(errors,[]);
});

test('native audio import maps speech and music parameters without foreign task state',async t=>{
    const {page,errors}=await setup(t);
    const converted=await page.evaluate(()=>PixmaxWorkflow.convert({nodes:[
        {uuid:'speech',type:'GENERATE_AUDIO',params:{model:'MINIMAX_SPEECH_28_TURBO',prompt:'文本',speed:.8,vol:0,voiceModifyPitch:-4,voiceModifySoundEffects:'robotic'},generatingTask:{id:'foreign'}},
        {uuid:'music',type:'GENERATE_AUDIO',params:{model:'MINIMAX_MUSIC_26',musicMode:'INSTRUMENTAL',prompt:'电影配乐'}}]}));
    assert.equal(converted.nodes[0].audioGeneration.model,'speech-2.8-turbo');assert.equal(converted.nodes[0].audioGeneration.vol,0);
    assert.equal(converted.nodes[0].audioGeneration.voice_modify_pitch,-4);assert.equal(converted.nodes[0].generatingTask,undefined);
    assert.equal(converted.nodes[1].audioGeneration.mode,'music');assert.equal(converted.nodes[1].audioGeneration.music_mode,'INSTRUMENTAL');assert.deepEqual(errors,[]);
});

test('unsupported references and invalid ranges do not submit; explicit rejection creates no pending task',async t=>{
    const {page,errors}=await setup(t),api=await service(page,{status:422});await open(page);
    await page.getByRole('spinbutton',{name:'语速',exact:true}).fill('3');await page.locator('[data-audio-run]').click();
    assert.equal(api.calls.length,0);
    await page.getByRole('spinbutton',{name:'语速',exact:true}).fill('1');
    await page.evaluate(()=>{const source=createNode(80,80,[{url:'/test-image.svg',kind:'image'}],{select:false});canvas.connections.push({from:source.id,to:nodes[0].id,kind:'input'});});
    await page.locator('[data-audio-run]').click();assert.equal(api.calls.length,0);
    await page.evaluate(()=>canvas.connections=[]);await page.locator('[data-audio-run]').click();
    await page.waitForFunction(()=>!PixmaxAudioCreation.busy());
    assert.equal(api.calls.length,1);assert.equal(await page.evaluate(()=>smartPendingTasks(nodes[0]).length),0);assert.deepEqual(errors,[]);
});

test('saved pending audio recovers on a fresh document and readonly users can play existing results',async t=>{
    const {page,errors}=await setup(t),api=await service(page,{status:503});await open(page);
    await page.locator('[data-audio-run]').click();await page.waitForFunction(()=>!PixmaxAudioCreation.busy()&&smartPendingTasks(nodes[0]).length===1);
    await page.evaluate(()=>saveCanvas({force:true}));await page.reload();await page.waitForFunction(()=>nodes.length===1);
    await page.addScriptTag({url:'/static/js/canvas-task-bindings.js'});await page.addScriptTag({url:'/static/js/canvas-task-results.js'});
    await page.evaluate(()=>Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}}));
    const record=[...api.records.values()][0];
    await page.evaluate(async task=>{const recovery=smartTaskRecovery(),item=recovery.list()[0];await recovery.apply(item,task,()=>true);},record);
    await finished(page);assert.equal(await page.evaluate(()=>saveCanvas({force:true})),true);
    await page.evaluate(()=>{MemberCanvasEdit.setEditable(false);render();});
    assert.equal(await page.locator('[data-studio-open]').count(),1,await page.evaluate(()=>JSON.stringify({nodes,viewport,html:world.innerHTML.slice(0,2000)})));
    assert.equal(await page.locator('[data-studio-open]').isEnabled(),false);
    await page.getByRole('button',{name:'播放音频',exact:true}).click();await page.waitForFunction(()=>document.querySelector('audio')?.readyState>=2);
    assert.equal(api.calls.length,1);assert.deepEqual(errors,[]);
});
