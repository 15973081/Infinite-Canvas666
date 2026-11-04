const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
for(const outcome of ['accepted','rejected','unknown'])test('classic upgrade revision and cleanup: '+outcome,async()=>{
    const source=fs.readFileSync('static/js/canvas/classic/canvas-execution.js','utf8');
    const start=source.indexOf('async function upgradeClassicOutputDraft(');
    const end=source.indexOf('\nasync function ',start+1);
    let revision=1,submitted=0,polled=0,prepared;
    const item={url:'draft.mp4',seedance_draft:{source_task_id:'source',provider_id:'ark',model:'seedance'}},out={id:'out',type:'output',images:[]};
    out.images.push(item);
    const guard={check(){},valid:()=>true};
    const binding={check(){},prepare:async()=>{prepared=revision;return {base_revision:revision};},beginSubmission(){assert.equal(prepared,revision);},remember(){}};
    const c={nodes:[out],window:{SeedanceDrafts:{upgradePayload:()=>({resolution:'1080p',draft_source_task_id:'source'})}},
        outputUrlValue:i=>i.url,classicOutputDraftState:()=>({}),isCanvasLockedByOther:()=>false,
        canvasTaskWriteGuard:()=>guard,uid:p=>p+'-id',refreshNodes(){},runSnapshot:()=>({}),classicTaskInputBinding:()=>binding,
        attachClassicTaskBinding:p=>p,makePending:(id,run,task)=>({id,run,...task}),scheduleSave(){},
        saveCanvas:async()=>{revision++;},
        createCanvasVideoTask:async payload=>{assert.equal(payload.canvas_target.base_revision,revision,'server rejects a stale binding revision');submitted++;if(outcome!=='accepted'){const error=new Error('rejected or disconnected');if(outcome==='rejected')error.status=409;throw error;}return {task_id:payload.client_task_id};},
        pollCanvasVideoTask:async()=>{polled++;},setStatus(){},showErrorModal:message=>{if(outcome==='accepted')assert.fail(message);}};
    vm.runInNewContext(source.slice(start,end),c);
    await c.upgradeClassicOutputDraft('out','draft.mp4','source');
    assert.equal(submitted,1);assert.equal(polled,outcome==='accepted'?1:0);
    if(outcome==='rejected'){assert.equal(out._pending.length,0);assert.equal(revision,3,'cleanup persisted after explicit rejection');}
    if(outcome==='unknown'){assert.equal(out._pending.length,1);assert.equal(revision,2,'unknown submission keeps original ID without retry');}
});
