const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');
for(const kind of ['classic','smart'])test(`${kind} actual log renders CNY, foreign, estimated and unknown costs without writes`,async t=>{
    const {page,errors,writes}=await fixture(t,kind);await page.waitForLoadState('networkidle');const beforeWrites=writes.length;
    const result=await page.evaluate(kind=>{
        const costs=[{status:'priced',amount_micros:1234567,currency:'CNY'},
            {status:'priced',amount_micros:1000000,currency:'USD'},
            {status:'priced',amount_micros:-1234500,currency:'EUR',source:'estimated'},
            {status:'unknown'}];
        const logs=costs.map((cost,i)=>Object.freeze({_ledger:true,_ledger_cost:Object.freeze(cost),createdAt:1,status:'ok',runMs:61000,outputs:Object.freeze([]),prompt:'',platform:'fixture',id:String(i)}));
        const totals=Object.freeze({total:1234567,image:1234567,video:0,calls:3,unknown:1,estimated:0});
        const ledger=Object.freeze({logs:Object.freeze(logs),totals,allTotals:totals,ready:true});
        const original=JSON.stringify(ledger);let saves=0;scheduleSave=()=>saves++;
        window.CanvasLedger={...window.CanvasLedger,view:()=>ledger,mount:()=>{}};
        if(kind==='classic')renderCanvasLog();else renderSmartCanvasLog();
        const list=document.getElementById(kind==='classic'?'logList':'smartLogList');
        return {costs:[...list.querySelectorAll('.log-entry-cost')].map(el=>el.textContent),
            summary:document.getElementById(kind==='classic'?'canvasCostSummary':'smartCostSummary').textContent,
            unchanged:JSON.stringify(ledger)===original,saves};
    },kind);
    assert.deepEqual(result.costs,['¥1.234567','USD 1','EUR -1.2345 预估','待定价']);
    assert.match(result.summary,/总计 ¥1\.234567/);assert.equal(result.unchanged,true);assert.equal(result.saves,0);
    assert.equal(writes.length,beforeWrites);assert.deepEqual(errors,[]);
});
