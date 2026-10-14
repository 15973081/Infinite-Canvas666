const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function setup(t,{unknown=false,hold=false}={}){
    const f=await fixture(t,'smart',true,{secureOrigin:true}),calls=[],checks=[];let deleted=false,release;const gate=new Promise(resolve=>release=resolve);
    const voice={id:'canvas-voice-selected',task_id:'canvas_audio_existing_voice',name:'城市旁白',language:'Chinese',gender:'MALE',age:'ADULT',description:'清晰旁白',category:'clone',favorite:true,preview_url:'/voice-sample.mp3',delete_state:'active'};
    await f.page.route('**/voice-sample.mp3',route=>route.fulfill({path:path.resolve('tests/fixtures/pixmax-generated-audio.mp3'),contentType:'audio/mpeg'}));
    await f.page.route('**/api/canvas-audio-voices**',async route=>{
        const request=route.request(),url=new URL(request.url());
        if(url.pathname.endsWith('/delete-status')){checks.push(request.postDataJSON());deleted=true;return route.fulfill({json:{voice_id:voice.id,state:'deleted',operation_id:'operation-existing'}});}
        if(url.pathname.endsWith('/delete')){calls.push(request.postDataJSON());if(hold)await gate;if(unknown){voice.delete_state='unknown';return route.fulfill({json:{voice_id:voice.id,state:'unknown',can_retry:true,operation_id:'operation-existing'}});}deleted=true;return route.fulfill({json:{voice_id:voice.id,state:'deleted',operation_id:'operation-existing'}});}
        return route.fulfill({json:{provider_id:'audio',catalog_id:'a'.repeat(64),voices:deleted?[]:[voice],can_design:false}});
    });
    await f.page.evaluate(()=>{apiProviders=[{id:'audio',name:'音频测试',has_key:true,audio_models:['speech-2.8-hd']}];const node=createSmartStudioNode('audio',{x:600,y:200});node.audioGeneration={model:'speech-2.8-hd',provider_id:'audio',timbre_id:'canvas-voice-selected'};openSmartStudio(node.id);});
    await f.page.getByRole('button',{name:'选择音色',exact:true}).click();await f.page.getByRole('tab',{name:'我的音色',exact:true}).click();await f.page.locator('[data-voice-delete]').waitFor();
    return {...f,calls,checks,release};
}

test('voice deletion asks for confirmation, cancels without calls and clears the selected voice on success',async t=>{
    const {page,calls,errors}=await setup(t);await page.locator('[data-voice-delete]').click();await page.getByRole('button',{name:'取消',exact:true}).click();assert.equal(calls.length,0);
    await page.locator('[data-voice-preview]').click();await page.waitForFunction(()=>document.querySelector('.pixmax-voice-modal audio')?.readyState>=2);await page.evaluate(()=>window.__deletedVoiceAudio=document.querySelector('.pixmax-voice-modal audio'));
    await page.locator('[data-voice-delete]').click();await page.locator('[data-voice-delete-confirm]').dblclick();await page.locator('[data-voice-id]').waitFor({state:'detached'});assert.equal(calls.length,1);assert.equal(calls[0].voice_id,'canvas-voice-selected');assert.equal(calls[0].retry,false);
    assert.equal(await page.locator('[data-audio-field="timbre_id"]').inputValue(),'');assert.equal(await page.evaluate(()=>nodes[0].images.length),0);assert.equal(await page.evaluate(()=>window.__deletedVoiceAudio.paused&&!window.__deletedVoiceAudio.hasAttribute('src')),true);assert.deepEqual(errors,[]);
});

test('an uncertain deletion is queried after reopening instead of issuing a second delete',async t=>{
    const {page,calls,checks,errors}=await setup(t,{unknown:true});await page.locator('[data-voice-delete]').click();await page.locator('[data-voice-delete-confirm]').click();await page.getByRole('button',{name:'查询删除结果 城市旁白',exact:true}).waitFor();assert.equal(await page.locator('[data-voice-select]').isDisabled(),true);
    await page.getByRole('button',{name:'关闭音色选择',exact:true}).click();await page.getByRole('button',{name:'选择音色',exact:true}).click();await page.getByRole('tab',{name:'我的音色',exact:true}).click();await page.locator('[data-voice-delete]').click();await page.locator('[data-voice-id]').waitFor({state:'detached'});assert.equal(calls.length,1);assert.equal(checks.length,1);assert.deepEqual(errors,[]);
});

test('lease loss cancels a deletion confirmation before any supplier mutation',async t=>{
    const {page,calls,errors}=await setup(t);await page.locator('[data-voice-delete]').click();await page.evaluate(()=>MemberCanvasEdit.setEditable(false));await page.locator('.pixmax-voice-delete-confirm').waitFor({state:'detached'});assert.equal(calls.length,0);assert.deepEqual(errors,[]);
});

test('a late deletion response cannot clear the selection in a different workspace',async t=>{
    const {page,calls,release,errors}=await setup(t,{hold:true});await page.locator('[data-voice-delete]').click();await page.locator('[data-voice-delete-confirm]').click();await page.waitForTimeout(50);assert.equal(calls.length,1);
    await page.evaluate(()=>{CanvasSession.context.workspace.id='other-space';MemberCanvasEdit.active.workspaceId='other-space';document.body.appendChild(document.createElement('span'));});release();await page.locator('.pixmax-voice-delete-confirm').waitFor({state:'detached'});assert.equal(await page.locator('[data-audio-field="timbre_id"]').inputValue(),'canvas-voice-selected');assert.deepEqual(errors,[]);
});
