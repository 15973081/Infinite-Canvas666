const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../userscripts/canvas-legacy-cost-filter.user.js'), 'utf8').replace(/\r\n/g, '\n');

test('userscript injection rules allow the real application canvas iframe and standalone canvas', () => {
    const shell = fs.readFileSync(path.join(__dirname, '../static/index.html'), 'utf8');
    const framePath = shell.match(/<iframe\s+id="frame-canvas"\s+data-src="([^"]+)"/)[1];
    const header = source.slice(0, source.indexOf('// ==/UserScript=='));
    const patterns = [...header.matchAll(/^\/\/\s*@match\s+(\S+)/gm)].map(match =>
        new RegExp('^' + match[1].split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$'));
    function injects(url, inFrame) {
        return !(inFrame && /^\/\/\s*@noframes\b/m.test(header)) && patterns.some(pattern => pattern.test(url));
    }
    const frameUrl = new URL(framePath, 'http://localhost:6006').href;
    assert.equal(injects(frameUrl, true), true, 'main shell embeds the actual canvas in a child frame');
    assert.equal(injects(frameUrl, false), true);
    assert.equal(injects('http://localhost:6006/static/api-settings.html', true), false);
});
function setup() {
    const blobs = [], downloads = [];
    const ctx = vm.createContext({window:{}, localStorage:{getItem:()=> null}, Blob,
        URL:{createObjectURL:blob=> {blobs.push(blob); return 'blob:test';}, revokeObjectURL(){}},
        setTimeout(){}, document:{body:{append(){}}, getElementById:()=> null, createElement:()=> {const link = {click:()=> downloads.push(link), remove(){}}; return link;}}});
    // Expose the actual userscript's pure functions without starting its browser interval.
    const end = source.indexOf("  window.addEventListener('canvas-legacy-activity'");
    assert.ok(end > 0);
    vm.runInContext(source.slice(0, end) + '\nthis.api = {calculator, summarize, boundary, exportCSV, retainedLogs, setRows(rows){currentRows=rows;}};\n})();', ctx);
    return {...ctx.api, blobs, downloads, window:ctx.window};
}
const at = new Date(2026, 8, 9, 12).getTime();
const video = overrides => ({id:'video', createdAt:at, status:'success', nodeType:'video', billingKind:'video',
    providerId:'volcengine', billingModel:'seedance-2.5', platform:'火山引擎', request:{duration:5, resolution:'720p'}, ...overrides});
const rate = overrides => ({kind:'video', model:'seedance-2.5', billing_type:'per_second', unit_price:'0.12', effective_from:at - 1000, ...overrides});
const options = prices => ({providers:[{id:'volcengine', model_prices:prices}]});

test('legacy plugin reads all independent entries and does not fall back to a partial cache on failure', async () => {
    const {retainedLogs,window}=setup();
    const current={id:'c',logs:[{id:'cached'}]};
    assert.equal((await retainedLogs(current)).independent,false);
    let reads=0;
    window.CanvasLedger={revision:()=>1,readAll:async()=>{reads++;return {revision:1,logs:[{id:'all-1'},{id:'all-2'}]};}};
    assert.equal((await retainedLogs(current)).logs.length,2);
    await retainedLogs(current);
    assert.equal(reads,1);
    window.CanvasLedger.readAll=async()=>{throw new Error('offline');};
    await assert.rejects(retainedLogs(current,true),/offline/);
    assert.equal(current.logs.length,1);
});

test('legacy video snapshot bypasses the current token hook and retains its billed seconds', () => {
    const {calculator} = setup();
    const log = video({durationSeconds:9, video_info:{duration:8}, cost:{status:'priced', billing_type:'per_second', quantity:5,
        unit_price:'0.12', amount_micros:600000, currency:'CNY', source:'actual'}});
    const before = JSON.stringify(log);
    const cost = calculator.costFor(log, {...options([rate({unit_price:'9'})]), imageHook(){throw Error('video must bypass the hook');}});
    assert.equal(cost.amount_micros, 600000);
    assert.equal(cost.seconds, 5);
    assert.equal(cost.price_source, '旧日志秒价快照');
    assert.equal(JSON.stringify(log), before);
});

test('token snapshots are recalculated using historical second prices, never token quantity or token unit price', () => {
    const {calculator} = setup();
    const log = video({cost:{status:'priced', kind:'video', billing_source:'volcengine_usage', billing_type:'per_million_tokens',
        unit_price:'70', quantity:108900, amount_micros:7623000}, usage:{completion_tokens:108900}});
    const cost = calculator.costFor(log, options([rate(), rate({billing_type:'per_million_tokens', unit_price:'70', effective_from:at})]));
    assert.equal(cost.amount_micros, 600000);
    assert.equal(cost.quantity, 5);
    assert.equal(cost.source, 'estimated');
    assert.equal(log.cost.amount_micros, 7623000);
    assert.equal(log.usage.completion_tokens, 108900);
    assert.equal(calculator.costFor(log, options([rate({billing_type:'per_million_tokens'})])).status, 'unknown');
});

test('historical price ranges are start-inclusive/end-exclusive and match resolution/input/tier', () => {
    const {calculator} = setup();
    const log = video({video_info:{has_video_input:true, service_tier:'flex'}});
    const rows = [rate({effective_to:at, unit_price:'8'}), rate({effective_from:at + 1, unit_price:'9'}),
        rate({resolution:'1080p', unit_price:'10'}), rate({has_video_input:false, unit_price:'11'}),
        rate({service_tier:'default', unit_price:'12'}), rate({effective_from:at, resolution:'720p', has_video_input:true, service_tier:'flex'})];
    assert.equal(calculator.costFor(log, options(rows)).amount_micros, 600000);
    assert.equal(calculator.costFor(log, options(rows.slice(0, -1))).status, 'unknown');
});

test('manual price only fills missing historical prices for the exact provider/model/spec/date', () => {
    const {calculator} = setup();
    const manual = rate({providerId:'volcengine', resolution:'720p', unit_price:'0.2', effective_from:at, effective_to:at + 1});
    const opts = {...options([]), manualRules:[manual]};
    assert.equal(calculator.costFor(video(), opts).amount_micros, 1000000);
    assert.equal(calculator.costFor(video({providerId:'other'}), opts).status, 'unknown');
    assert.equal(calculator.costFor(video({billingModel:'seedance-2.0'}), opts).status, 'unknown');
    assert.equal(calculator.costFor(video({request:{duration:5, resolution:'1080p'}}), opts).status, 'unknown');
    assert.equal(calculator.costFor(video({createdAt:at + 1}), opts).status, 'unknown');
    assert.equal(calculator.costFor(video(), {...options([rate()]), manualRules:[manual]}).amount_micros, 600000);
    manual.unit_price = '0';
    assert.equal(calculator.costFor(video(), opts).amount_micros, 0);
});

test('a manual price for missing resolution never applies to a known resolution', () => {
    const {calculator} = setup();
    const opts = {manualRules:[rate({providerId:'volcengine', resolution:'__unknown__'})]};
    assert.equal(calculator.costFor(video({request:{duration:5}}), opts).amount_micros, 600000);
    assert.equal(calculator.costFor(video(), opts).status, 'unknown');
});

test('manual rules for unrecorded video input do not override known input specifications', () => {
    const {calculator} = setup();
    const opts = {manualRules:[rate({providerId:'volcengine', has_video_input:null})]};
    assert.equal(calculator.costFor(video(), opts).amount_micros, 600000);
    assert.equal(calculator.costFor(video({video_info:{has_video_input:true}}), opts).status, 'unknown');
    assert.equal(calculator.costFor(video({video_info:{has_video_input:false}}), opts).status, 'unknown');
});

test('missing/sentinel video duration never falls back to runMs or token count', () => {
    const {calculator} = setup();
    const log = video({request:{duration:-1}, durationSeconds:0, runMs:120000,
        cost:{billing_type:'per_million_tokens', quantity:108900}});
    assert.equal(calculator.costFor(log, options([rate()])).status, 'unknown');
    log.video_info = {duration:5.25};
    assert.equal(calculator.costFor(log, options([rate()])).amount_micros, 630000);
});

test('historical output links provide duration without rewriting nodes or logs', () => {
    const {calculator} = setup();
    const nodes = [{images:[{url:'/old.mp4', run:{request:{duration:6}}}]}];
    const log = video({request:{}, outputs:['/old.mp4']});
    const before = JSON.stringify({nodes, log});
    const cost = calculator.costFor(log, {...options([rate()]), mediaIndex:calculator.indexMedia(nodes)});
    assert.equal(cost.amount_micros, 720000);
    assert.equal(JSON.stringify({nodes, log}), before);
});

test('image snapshots remain unchanged and failed requests follow the old exclusion policy', () => {
    const {calculator} = setup();
    const image = {status:'success', billingKind:'image', cost:{status:'priced', kind:'image', amount_micros:30000}};
    assert.equal(calculator.costFor(image).amount_micros, 30000);
    image.cost.amount_micros = -1;
    assert.equal(calculator.costFor(image).status, 'unknown');
    assert.equal(calculator.costFor(video({status:'failed', cost:{status:'priced', amount_micros:999}})), null);
});

test('micro-yuan precision includes zero, rejects malformed/negative/overflow prices, and sums 5000 records', () => {
    const {calculator, summarize} = setup();
    assert.equal(calculator.amountMicros('0.03', '5.25'), 157500);
    assert.equal(calculator.amountMicros('0.0000005', 5), 5, 'old unit-price rounding');
    for (const value of ['', null, undefined, true, '-1', 'abc', 'Infinity', '1e90']) assert.equal(calculator.amountMicros(value, 5), null);
    const logs = Array.from({length:5000}, (_, i) => ({id:String(i), createdAt:at, status:'success', billingKind:'image', cost:{status:'priced', kind:'image', amount_micros:30000}}));
    assert.equal(summarize(logs, '', '', {}).totals.total, 150000000);
    logs[0].cost.amount_micros = Number.MAX_SAFE_INTEGER;
    assert.throws(()=> summarize(logs, '', '', {}), /精确计算范围/);
});

test('date filtering includes the end day, reports invalid dates, and never treats unknown costs as billed zero', () => {
    const {summarize, boundary} = setup();
    const start = boundary('2026-09-09'), end = boundary('2026-09-09', true);
    const logs = [video({createdAt:start}), video({createdAt:end - 1}), video({createdAt:end}),
        video({createdAt:0}), video({status:'failed'}), video({request:{}})];
    const {rows, totals} = summarize(logs, '2026-09-09', '2026-09-09', options([rate({effective_from:0})]));
    assert.equal(rows.length, 4);
    assert.equal(totals.calls, 2); assert.equal(totals.total, 1200000);
    assert.equal(totals.unknown, 1); assert.equal(totals.failed, 1); assert.equal(totals.invalid, 1);
    assert.throws(()=> boundary('2026-02-30'), /有效日期/);
    assert.throws(()=> summarize([], '2026-09-10', '2026-09-09', {}), /不能晚于/);
});

test('CSV exports seconds/price/source alongside original cost and escapes formula-like text', async()=> {
    const h = setup();
    const log = video({platform:'=SUM(1,2)', cost:{status:'priced', billing_type:'per_million_tokens', amount_micros:7623000}});
    const {rows} = h.summarize([log], '', '', options([rate()]));
    h.setRows(rows); h.exportCSV();
    const csv = await h.blobs[0].text();
    assert.match(csv, /原账单金额/);
    assert.match(csv, /"'\=SUM\(1,2\)"/);
    assert.match(csv, /"5","0.12","0.600000"/);
    assert.match(csv, /"7.623000","CNY","per_million_tokens"/);
    assert.match(h.downloads[0].download, /\.csv$/);
});
