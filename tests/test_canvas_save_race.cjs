const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../static/js/canvas.js'), 'utf8').replace(/\r\n/g, '\n');
const clone = value => JSON.parse(JSON.stringify(value));

function setup(){
    const requests = [], timers = new Map(), statuses = [];
    let timerId = 0;
    const ctx = vm.createContext({
        canvas:{id:'canvas-1', title:'Original', icon:'layers', updated_at:1, logs:[{
            id:'old', status:'success', billingKind:'image', providerId:'image-api', billingModel:'image-model',
            cost:{status:'priced', source:'actual', kind:'image', amount_micros:90000}
        }]},
        nodes:[{id:'output', images:[]}], connections:[], viewport:{x:10, y:20, scale:1},
        apiProviders:[{id:'image-api', model_prices:[{
            kind:'image', model:'image-model', billing_type:'per_image', unit_price:'0.03', effective_from:0
        }]}],
        CLIENT_ID:'test-client', MS_GEN_MODELS:{},
        applyingRemoteCanvas:false, savingCanvasNow:false, saveCanvasAgain:false,
        localCanvasDirty:true, lastSavedCanvasSnapshot:'', lastCanvasUpdatedAt:1, saveTimer:null,
        currentCanvasTime:null,
        window:{CanvasApi:{saveCanvas(id, payload){
            return new Promise(resolve => requests.push({id, payload:clone(payload), resolve}));
        }}},
        uid:()=> 'new-log', runPlatformLabel:()=> 'Image API', runTaskLabel:()=> 'image-model',
        updateCanvasCostButton(){}, sanitizeConnections(){}, isCanvasLockedByOther:()=> false,
        setStatus:value=> statuses.push(value), updateCanvasListRecord(){}, refreshGateViewControls(){},
        showErrorModal(){}, console,
        setTimeout(callback){timers.set(++timerId, callback); return timerId;},
        clearTimeout(id){timers.delete(id);}
    });
    for(const name of [
        'serializableCanvasNode', 'serializableCanvasNodes', 'canvasSavePayload', 'canvasSaveSnapshot',
        'scheduleSave', 'saveCanvas', 'flushClassicCanvasBeforeFrontendReload', 'billingIdentity', 'modelPriceAt', 'calculateGenerationCost',
        'generationLogCost', 'canvasCostTotals', 'addGenerationLog'
    ]){
        const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
        assert.ok(start >= 0, name);
        vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), ctx);
    }
    function completeGeneration(){
        ctx.nodes[0].images.push({url:'/output/new.png'});
        ctx.addGenerationLog({run:{nodeType:'generator', node:{apiProvider:'image-api', model:'image-model'}}, outputs:['/output/new.png']});
    }
    function acknowledge(index, updatedAt, overrides={}){
        const request = requests[index];
        request.resolve({ok:true, status:200, json:async()=> ({canvas:{
            ...clone(request.payload), id:request.id, updated_at:updatedAt, ...overrides
        }})});
    }
    function runScheduledSave(){
        assert.equal(timers.size, 1, 'one follow-up save');
        const [id, callback] = [...timers][0];
        timers.delete(id);
        return callback();
    }
    return {ctx, requests, timers, statuses, completeGeneration, acknowledge, runScheduledSave};
}

for(const notifySave of [true, false]){
    test(`generation during save survives acknowledgement and is persisted (scheduleSave=${notifySave})`, async()=>{
        const h = setup(), {ctx} = h;
        const first = ctx.saveCanvas();
        assert.equal(h.requests[0].payload.logs.length, 1);
        h.completeGeneration();
        ctx.canvas.title = 'Edited while saving';
        ctx.viewport.x = 80;
        if(notifySave) ctx.scheduleSave();
        h.acknowledge(0, 2);
        await first;

        assert.equal(ctx.canvas.logs.length, 2, 'the old response must not remove the new log');
        assert.equal(ctx.canvasCostTotals().total, 120000);
        assert.equal(ctx.canvas.title, 'Edited while saving');
        assert.equal(ctx.viewport.x, 80);
        assert.equal(ctx.localCanvasDirty, true);
        assert.equal(ctx.lastCanvasUpdatedAt, 2);
        assert.equal(ctx.lastSavedCanvasSnapshot, ctx.canvasSaveSnapshot(h.requests[0].payload));
        assert.equal(h.statuses.at(-1), 'Saving...');

        const second = h.runScheduledSave();
        const saved = h.requests[1].payload;
        assert.equal(saved.base_updated_at, 2, 'retry uses the acknowledged server version');
        assert.deepEqual(saved.logs.map(log=> log.id), ['new-log', 'old']);
        assert.equal(saved.title, 'Edited while saving');
        assert.equal(saved.nodes[0].images[0].url, '/output/new.png');
        h.acknowledge(1, 3);
        await second;
        assert.equal(ctx.localCanvasDirty, false);
        assert.equal(h.timers.size, 0);
        assert.equal(h.statuses.at(-1), 'Saved');
        assert.equal(ctx.canvasCostTotals(clone(saved.logs)).total, 120000, 'saved/reloaded costs include both calls');
        await ctx.saveCanvas();
        assert.equal(h.requests.length, 2, 'unchanged state does not save again');
    });
}

test('a save without concurrent edits still accepts the server response', async()=>{
    const h = setup();
    const pending = h.ctx.saveCanvas();
    h.acknowledge(0, 2, {title:'Normalized title', owner:'owner'});
    await pending;
    assert.equal(h.ctx.canvas.title, 'Normalized title');
    assert.equal(h.ctx.canvas.owner, 'owner');
    assert.equal(h.ctx.canvas.updated_at, 2);
    assert.equal(h.ctx.localCanvasDirty, false);
    assert.equal(h.timers.size, 0);
});

test('a save conflict retains new logs and does not acknowledge the rejected snapshot', async()=>{
    const h = setup();
    const pending = h.ctx.saveCanvas();
    h.completeGeneration();
    h.ctx.scheduleSave();
    h.requests[0].resolve({ok:false, status:409});
    await pending;
    assert.equal(h.ctx.canvas.logs.length, 2);
    assert.equal(h.ctx.canvasCostTotals().total, 120000);
    assert.equal(h.ctx.localCanvasDirty, true);
    assert.equal(h.ctx.lastCanvasUpdatedAt, 1);
    assert.equal(h.ctx.lastSavedCanvasSnapshot, '');
    assert.equal(h.timers.size, 0, 'conflicts still require reconciliation');
});

for(const concurrentEdit of [false,true]) test(`reload flush awaits the current save without deferred-save starvation (edit=${concurrentEdit})`,async()=>{
    const h=setup(),waits=[],schedule=h.ctx.setTimeout;
    h.ctx.setTimeout=(fn,ms)=>ms===80?(waits.push(fn),-1):schedule(fn,ms);
    const first=h.ctx.saveCanvas();
    if(concurrentEdit)h.ctx.canvas.title='Latest edit';
    const flushed=h.ctx.flushClassicCanvasBeforeFrontendReload();
    assert.equal(h.ctx.saveCanvasAgain,false,'waiting does not enqueue a redundant save');
    h.acknowledge(0,2);await first;
    waits.shift()();await new Promise(setImmediate);
    if(concurrentEdit){
        assert.equal(h.requests.length,2,'new content saves immediately without the 1500 ms timer');
        assert.equal(h.requests[1].payload.title,'Latest edit');h.acknowledge(1,3);
    }
    assert.equal(await flushed,true);assert.equal(h.timers.size,0);assert.equal(h.ctx.localCanvasDirty,false);
    assert.equal(h.requests.length,concurrentEdit?2:1);
});

test('reload flush retains dirty contents on a failed save without retrying it',async()=>{
    const h=setup();const flushed=h.ctx.flushClassicCanvasBeforeFrontendReload();
    h.requests[0].resolve({ok:false,status:409});
    assert.equal(await flushed,false);assert.equal(h.ctx.localCanvasDirty,true);
    assert.equal(h.requests.length,1);assert.equal(h.timers.size,0);
});
