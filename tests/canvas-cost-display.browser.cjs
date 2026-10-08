const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');
const fs=require('node:fs'),path=require('node:path');
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

for(const kind of ['classic','smart'])test(`${kind} clean cost table preserves resource clicks, details and mobile layout`,async t=>{
    const {page,errors,writes}=await fixture(t,kind);await page.waitForLoadState('networkidle');const beforeWrites=writes.length;
    await page.route('**/api/canvases/canvas-test/ledger**',route=>route.fulfill({json:{logs:[],totals:{total:660000,image:660000,video:0,calls:1,unknown:1,estimated:0,records:2},page:1,pages:1,revision:1}}));
    await page.route('**/test-video.mp4',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#83966c"/><text x="12" y="36">VIDEO</text></svg>'}));
    await page.evaluate(()=>CanvasLedger.refresh(canvas.id));
    await page.evaluate(kind=>{
        const logs=[{_ledger:true,_ledger_cost:{status:'priced',amount_micros:660000,currency:'CNY'},createdAt:Date.now(),status:'success',runMs:94000,
            outputs:[{url:'/test-image.svg',kind:'image'},{url:'/test-video.mp4',kind:'video'}],prompt:'完整提示词需要留在详情中',platform:'volcengine',model:'doubao-seedream-5-0-pro-260628',id:'one'},
            {_ledger:true,_ledger_cost:{status:'unknown'},createdAt:Date.now(),status:'failed',outputs:[],prompt:'',error:'测试错误',id:'two'}];
        const totals={total:660000,image:660000,video:0,calls:1,unknown:1,estimated:0};
        window.CanvasLedger={...window.CanvasLedger,view:()=>({logs,totals,allTotals:totals,ready:true})};
        window.resourceClicks=[];document.getElementById(kind==='classic'?'canvasLogTitle':'smartLogTitle').textContent='费用中心';
        if(kind==='classic'){
            openOutputLightbox=(url)=>window.resourceClicks.push({url});
            document.querySelector('#logModal .log-panel').classList.add('cost-mode');renderCanvasLog();document.getElementById('logModal').classList.add('open');
        }else{
            smartLogPreviewNode=(url,type)=>window.resourceClicks.push({url,type});
            document.getElementById('smartLogPanel').classList.add('cost-mode');renderSmartCanvasLog();document.getElementById('smartLogModal').classList.add('open');
        }
    },kind);
    const panel=page.locator(kind==='classic'?'#logModal .log-panel':'#smartLogPanel');
    assert.equal(await panel.locator('.cost-ledger-row').count(),2);
    const thumbnail=panel.locator('.cost-resource [data-url]').first();await thumbnail.click();
    assert.equal((await page.evaluate(()=>resourceClicks))[0].url,'/test-image.svg');
    await panel.locator('.cost-resource [data-url="/test-video.mp4"]').click();
    const videoClick=(await page.evaluate(()=>resourceClicks))[1];
    assert.equal(videoClick.url,'/test-video.mp4');if(kind==='smart')assert.equal(videoClick.type,'video');
    assert.ok(await panel.locator('.cost-detail-row').first().isHidden());
    await panel.getByRole('button',{name:'详情',exact:true}).first().click();
    await panel.getByText('完整提示词需要留在详情中',{exact:true}).waitFor();
    assert.equal(await panel.getByRole('button',{name:'收起',exact:true}).getAttribute('aria-expanded'),'true');
    await panel.getByRole('button',{name:'收起',exact:true}).click();
    assert.ok(await panel.locator('.cost-detail-row').first().isHidden());
    const out=path.resolve(__dirname,'../.local/cost-center');fs.mkdirSync(out,{recursive:true});
    for(const theme of ['light','dark']){await page.evaluate(theme=>StudioTheme.set(theme),theme);await panel.screenshot({path:path.join(out,kind+'-'+theme+'.png')});}
    await page.setViewportSize({width:390,height:844});
    assert.ok(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth));
    await thumbnail.click();assert.equal((await page.evaluate(()=>resourceClicks)).length,3);
    await panel.screenshot({path:path.join(out,kind+'-mobile.png')});
    assert.equal(writes.length,beforeWrites);assert.deepEqual(errors,[]);
});
