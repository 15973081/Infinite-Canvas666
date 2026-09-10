const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../static/js/canvas-ledger.js'), 'utf8');
const turn = () => new Promise(resolve => setImmediate(resolve));
function setup(fetcher) {
    const events = [], timers = [];
    const window = {dispatchEvent:e => events.push(e)};
    const ctx = vm.createContext({window, fetch:fetcher, URLSearchParams, Intl,
        CustomEvent:class {constructor(type, options){this.type=type;this.detail=options.detail;}},
        document:{visibilityState:'visible'}, setTimeout:fn=>timers.push(fn), setInterval(){}});
    vm.runInContext(source, ctx);
    return {api:window.CanvasLedger, events, timers};
}
const response = (data, status=200) => ({ok:status===200, status, json:async()=>data});
const page = (logs=[], totals={total:60000, records:2}, revision=1) => ({logs, totals, page:1, pages:1, revision});

test('readAll consumes every page with one revision, independent of visible logs', async () => {
    const urls=[];
    const {api}=setup(async url=>{
        const params=new URL('http://local'+url).searchParams;
        urls.push(params);
        const current=Number(params.get('page'));
        return response({...page([{id:current}], {total:999, records:3}, 8), pages:3, page:current});
    });
    const result=await api.readAll('canvas-a', {from_ms:1,to_ms:99});
    assert.deepEqual(Array.from(result.logs, x=>x.id), [1,2,3]);
    assert.equal(urls[1].get('expected_revision'), '8');
    assert.equal(urls[2].get('from_ms'), '1');
    assert.equal(urls[2].get('to_ms'), '99');
});

test('readAll restarts on concurrent writes instead of exporting duplicates or missing records', async () => {
    let calls=0;
    const {api}=setup(async url=>{
        const n=++calls;
        if(n===2) return response({detail:'changed'},409);
        return response({...page([{id:n}], {}, n===1?1:2), pages:2});
    });
    const result=await api.readAll('c');
    assert.equal(calls,4);
    assert.deepEqual(Array.from(result.logs,x=>x.id),[3,4]);
});

test('refresh uses full totals, and late results never replace a different canvas', async () => {
    let release;
    const {api}=setup(url => url.includes('/slow/') ? new Promise(resolve=>release=()=>resolve(response(page([{id:'slow'}],{total:11,records:1}))))
        : Promise.resolve(response(page([{id:'fast'}],{total:51010000,records:5101}))));
    api.view('slow');
    api.view('fast');
    await turn();
    release(); await turn();
    assert.equal(api.view('fast').allTotals.total,51010000);
    assert.equal(api.view('fast').logs.length,1);
    assert.equal(api.view('slow').allTotals.total,11);
});

test('failed append retains queue and error across refresh, retry uses the same log ID', async () => {
    let writes=0;const ids=[];
    const {api,timers}=setup(async (url,options)=>{
        if(options.method==='POST') {
            ids.push(JSON.parse(options.body).logs[0].id);
            return ++writes===1?response({detail:'offline'},503):response({report:{added:1}});
        }
        return response(page());
    });
    api.record('c',{id:'stable',createdAt:1});
    await turn();await turn();
    assert.equal(api.view('c').pending,1);
    assert.match(api.view('c').error,/offline/);
    await timers.shift()();await turn();
    assert.equal(api.view('c').pending,0);
    assert.deepEqual(ids,['stable','stable']);
});

test('newer payload for same queued ID survives an older append acknowledgment', async () => {
    let release;let writes=0;const sent=[];
    const {api,timers}=setup(async (url,options)=>{
        if(options.method==='POST'){
            sent.push(JSON.parse(options.body).logs[0]);
            if(++writes===1) return new Promise(resolve=>release=()=>resolve(response({report:{added:1}})));
            return response({report:{updated:1}});
        }
        return response(page());
    });
    api.record('c',{id:'same',cost:1});
    api.record('c',{id:'same',cost:2});
    release();await turn();
    assert.equal(api.view('c').pending,1);
    await timers.shift()();await turn();
    assert.equal(api.view('c').pending,0);
    assert.deepEqual(sent.map(x=>x.cost),[1,2]);
});

test('both canvas clients use ledger totals and preserve ledger snapshots without recomputation', () => {
    for(const [file, sum, cost] of [['canvas.js','canvasCostTotals','generationLogCost'],['smart-canvas.js','smartCanvasCostTotals','smartGenerationLogCost']]){
        const raw=fs.readFileSync(path.join(__dirname,'../static/js',file),'utf8').replace(/\r\n/g,'\n');
        const ctx=vm.createContext({canvas:{id:'c',logs:[]},window:{CanvasLedger:{view:()=>({allTotals:{total:987654,records:5001}})}}});
        for(const name of [sum,cost]){
            const start=raw.indexOf(`function ${name}(`);
            vm.runInContext(raw.slice(start,raw.indexOf('\n}',start)+2),ctx);
        }
        assert.equal(ctx[sum]().total,987654);
        assert.equal(ctx[cost]({_ledger:{},_ledger_cost:{status:'priced',amount_micros:222}}).amount_micros,222);
        assert.equal(ctx[cost]({_ledger:{},_ledger_cost:{status:'excluded'}}),null);
    }
});
