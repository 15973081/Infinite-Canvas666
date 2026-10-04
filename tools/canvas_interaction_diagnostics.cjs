// Diagnostic only: production HTML, trusted mouse/keyboard events, fixed API/text fixture.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {fixture}=require('../tests/helpers/canvas-browser.cjs');
const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const root=path.resolve(__dirname,'..'),sourceRoot=path.resolve(option('--source-root',root));
const output=path.resolve(option('--output','.local/canvas-interaction-diagnostics.json'));
const samples=Number(option('--samples',12));
assert(Number.isInteger(samples)&&samples>=2);
const boxMode=option('--box-mode','full');assert(['full','selection'].includes(boxMode));
const repositoryHead=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const commit=option('--baseline-commit',repositoryHead);
const summary=values=>{const sorted=[...values].sort((a,b)=>a-b);return {samples_ms:values,p50_ms:sorted[Math.ceil(sorted.length*.5)-1],p95_ms:sorted[Math.ceil(sorted.length*.95)-1]};};

async function install(page,kind,profile,action){
    await page.evaluate(({kind,profile,action})=>{
        const d=window.__diagnostic={armed:false,current:null,profile,serial:0,totalSaves:0};
        const endAfterHandler=c=>{
            if(c.ending)return;c.ending=true;
            // Queue inside the actual handler stack, not a capture listener: native
            // dispatch can checkpoint microtasks between listener callbacks.
            queueMicrotask(()=>{
                c.syncEnd=performance.now();performance.mark('diagnostic-sync-end');
                requestAnimationFrame(()=>{c.frames.push(performance.now()-c.start);requestAnimationFrame(()=>c.frames.push(performance.now()-c.start));});
            });
        };
        const wrap=(obj,name)=>{
            const fn=obj[name];if(typeof fn!=='function')return;
            obj[name]=function(...args){
                if(name==='scheduleSave')d.totalSaves++;
                const c=d.current;if(!c)return fn.apply(this,args);
                const start=performance.now();
                const following=Number.isFinite(c.syncEnd);
                const row=c.calls[name]??={count:0,inclusive_ms:0,synchronous_ms:0,following_ms:0};row.count++;
                if(name==='refreshSmartNodes'||name==='refreshNodes')c.requested.push([...args[0]]);
                try{
                    const result=fn.apply(this,args);
                    if(name==='smartAffectedNodeIds')c.affected.push(result.size);
                    return result;
                }finally{
                    const elapsed=performance.now()-start;row.inclusive_ms+=elapsed;row[following?'following_ms':'synchronous_ms']+=elapsed;
                    if(['render','refreshSmartNodes','scheduleSave','refreshSelectionVisuals'].includes(name))endAfterHandler(c);
                }
            };
        };
        // Wrappers preserve the actual save implementation and all return values.
        const names=['render','refreshNodes','refreshSmartNodes','scheduleSave','refreshSelectionVisuals'];
        if(profile)names.push('renderNode','renderNodePlaceholder','renderSmartNodeHtml','renderSmartNodePlaceholderHtml',
            'smartAffectedNodeIds','refreshGeometry','renderLinks','refreshConnectionLayer','renderMinimap',
            'portPoint','bindNodeEvents','refreshIcons','refreshPromptDependents','canvasInputGraph');
        names.forEach(name=>wrap(window,name));
        if(profile){
            const measure=(name,fn)=>function(...args){
                const c=d.current;if(!c)return fn.apply(this,args);
                const start=performance.now(),outer=!c.domDepth++;c.domCalls[name]=(c.domCalls[name]||0)+1;
                try{return fn.apply(this,args);}finally{const elapsed=performance.now()-start;c.domDepth--;if(outer)c.dom_ms+=elapsed;c.domInclusive[name]=(c.domInclusive[name]||0)+elapsed;}
            };
            for(const [proto,name] of [[Node.prototype,'appendChild'],[Node.prototype,'removeChild'],[Element.prototype,'replaceWith'],[Element.prototype,'getBoundingClientRect'],[Element.prototype,'setAttribute'],[Document.prototype,'createElement'],[Element.prototype,'querySelector'],[Element.prototype,'querySelectorAll']]){
                proto[name]=measure(name,proto[name]);
            }
            const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
            Object.defineProperty(Element.prototype,'innerHTML',{...descriptor,set:measure('innerHTML',descriptor.set)});
        }
        const type=action==='box'?'mouseup':'click';
        const start=e=>{
            if(!d.armed||d.current)return;
            d.armed=false;
            const c=d.current={id:++d.serial,event:e.type,trusted:e.isTrusted,start:performance.now(),calls:{},requested:[],affected:[],dom_ms:0,domDepth:0,domCalls:{},domInclusive:{},frames:[]};
            performance.mark('diagnostic-start');
        };
        window.addEventListener(type,start,true);window.addEventListener('input',start,true);
    },{kind,profile,action});
}
async function seed(page,kind,count,topology,target){
    await page.evaluate(({kind,count,topology,target})=>{
        const anchorX=kind==='classic'?100:700;
        canvas.nodes=nodes=Array.from({length:count},(_,i)=>({id:`node-${i}`,type:kind==='classic'?'prompt':'smart-prompt',x:anchorX+(i%25)*400,y:130+Math.floor(i/25)*350,w:320,h:240,text:`Prompt ${i}`,images:[]}));
        if(kind==='classic'&&topology==='fanin')nodes[count-1].type='generator';
        canvas.connections=topology==='none'?[]:Array.from({length:count-1},(_,i)=>({id:`edge-${i}`,from:`node-${i}`,to:`node-${topology==='fanin'?count-1:i+1}`,kind:'input'}));
        if(kind==='classic'){connections=canvas.connections;selected.clear();}else{selectedId='';selectedIds=[];canvasUsesConnections=true;}
        if(kind==='classic'&&connections.some(c=>!canConnect(c.from,c.to)))throw Error('Invalid Classic connection');
        // Keep Smart controls clear of the dormant composer at world origin.
        const node=nodes[target];Object.assign(viewport,{x:anchorX-node.x,y:130-node.y,scale:1});applyViewport();render();
    },{kind,count,topology,target});
    await page.waitForTimeout(550);
    const actual=await page.evaluate(kind=>({nodes:document.querySelectorAll(kind==='classic'?'.node':'.image-node').length,edges:document.querySelectorAll(kind==='classic'?'#links path.link':'.smart-connection').length}),kind);
    assert.equal(actual.nodes,count);assert.equal(actual.edges,topology==='none'?0:count-1);
    return actual;
}
async function prepare(page,scenario){
    const {kind,action,target=0}=scenario;
    if(action==='toggle'){
        // Expanded prompt controls can move behind the composer. Position the
        // viewport before arming; never force a click through the overlay.
        const moved=await page.evaluate(target=>{
            const control=document.querySelector(`[data-id="node-${target}"] .prompt-llm-toggle`),r=control.getBoundingClientRect();
            const y=r.y+r.height/2;if(y>=100&&y<=550)return false;
            viewport.y+=300-y;applyViewport();return true;
        },target);
        if(moved)await page.waitForTimeout(350);
    }
    if(action==='box'){
        // Ctrl + background drag; release is the measured action, not synthetic dispatch.
        await page.keyboard.down('Control');await page.mouse.move(85,115);await page.mouse.down();await page.mouse.move(440,410,{steps:3});
        assert(await page.evaluate(()=>Boolean(selectDrag)),'background gesture must start a selection');
    }else if(action==='input'){
        const selector=kind==='classic'?`[data-id="node-${target}"] textarea`:`[data-id="node-${target}"] .prompt-node-text`;
        await page.locator(selector).click();await page.keyboard.press('End');
    }
    await page.evaluate(kind=>{
        const d=window.__diagnostic;d.current=null;
        d.before=new Map([...document.querySelectorAll(kind==='classic'?'.node':'.image-node')].map(el=>[el.dataset.id,el]));
        d.beforeText=nodes.map(n=>n.text);d.armed=true;
    },kind);
}
async function gesture(page,scenario){
    if(scenario.action==='box'){await page.mouse.up();await page.keyboard.up('Control');}
    else if(scenario.action==='input')await page.keyboard.type('x');
    else if(scenario.action==='select')await page.locator('[data-id="node-0"] .node-title').click();
    else await page.locator(`[data-id="node-${scenario.target}"] .prompt-llm-toggle`).click();
}
async function finish(page,scenario){
    // Include scheduled geometry/minimap frames and the 200ms virtualization timer.
    await page.waitForTimeout(350);
    const row=await page.evaluate(kind=>{
        const d=window.__diagnostic,c=d.current;if(!c)throw Error('No trusted event was measured');
        performance.mark('diagnostic-window-end');
        d.current=null;
        c.window_ms=performance.now()-c.start;c.sync_ms=c.syncEnd-c.start;
        const els=[...document.querySelectorAll(kind==='classic'?'.node':'.image-node')];
        c.replacedNodes=els.filter(el=>d.before.get(el.dataset.id)!==el).length;
        c.selected=kind==='classic'?[...selected]:null;
        c.changedText=nodes.map((n,i)=>n.text!==d.beforeText[i]?n.id:null).filter(Boolean);
        c.llmEnabled=kind==='smart'?nodes.find(n=>n.id==='node-0')?.llmEnabled:null;
        delete c.domDepth;delete c.ending;delete c.start;delete c.syncEnd;return c;
    },scenario.kind);
    assert.equal(row.trusted,true);assert.equal(row.frames.length,2);assert(Number.isFinite(row.sync_ms));
    if(scenario.action==='box'){
        assert.deepEqual(row.selected,['node-0']);assert.equal(row.calls.scheduleSave?.count||0,0);
        assert.equal(row.calls.render?.count||0,boxMode==='full'?1:0);
        assert.equal(row.calls.refreshSelectionVisuals?.count||0,boxMode==='selection'?1:0);
        assert.equal(row.replacedNodes,boxMode==='selection'?0:scenario.count);
    }
    if(scenario.action==='select'){assert(row.selected.includes('node-0'));assert.equal(row.calls.render?.count||0,0);assert.equal(row.calls.refreshSelectionVisuals?.count,1);assert.equal(row.calls.scheduleSave?.count||0,0);assert.equal(row.replacedNodes,0);}
    if(scenario.action==='toggle'){assert.equal(row.calls.refreshSmartNodes?.count,1);assert.equal(row.calls.scheduleSave?.count,1);}
    if(scenario.action==='input'){assert.equal(row.calls.render?.count||0,0);assert.equal(row.calls.refreshSmartNodes?.count||0,0);assert.equal(row.changedText.length,1);assert.equal(row.replacedNodes,0);assert.equal(row.calls.scheduleSave?.count,1);}
    return row;
}
async function readTrace(cdp){
    const completed=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));
    await cdp.send('Tracing.end');const {stream}=await completed;let raw='';
    while(true){const chunk=await cdp.send('IO.read',{handle:stream});raw+=chunk.data;if(chunk.eof)break;}
    await cdp.send('IO.close',{handle:stream});return JSON.parse(raw).traceEvents;
}
function intervalTime(events,names,start,end,pid,tid){
    const spans=events.filter(e=>e.ph==='X'&&e.pid===pid&&e.tid===tid&&names.includes(e.name)&&e.dur>0)
        .map(e=>[Math.max(start,e.ts),Math.min(end,e.ts+e.dur)]).filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);
    let sum=0,left=0,right=0;for(const [a,b]of spans){if(a>right){sum+=right-left;left=a;right=b;}else right=Math.max(right,b);}return (sum+right-left)/1000;
}
function analyzeTrace(events){
    const mark=name=>events.find(e=>e.name===name);const a=mark('diagnostic-start'),b=mark('diagnostic-sync-end'),c=mark('diagnostic-window-end');
    assert(a&&b&&c,'trace must contain all phase marks');
    const phase=(start,end)=>({style_ms:intervalTime(events,['UpdateLayoutTree'],start,end,a.pid,a.tid),
        layout_ms:intervalTime(events,['Layout'],start,end,a.pid,a.tid),paint_ms:intervalTime(events,['Paint','PrePaint'],start,end,a.pid,a.tid),
        raf_ms:intervalTime(events,['FireAnimationFrame'],start,end,a.pid,a.tid),timer_ms:intervalTime(events,['TimerFire'],start,end,a.pid,a.tid),
        task_ms:intervalTime(events,['RunTask'],start,end,a.pid,a.tid)});
    return {synchronous:phase(a.ts,b.ts),following:phase(b.ts,c.ts),sync_trace_ms:(b.ts-a.ts)/1000,
        note:'Main renderer thread; durations are interval unions per category. Nested categories overlap; do not add task/RAF/timer to layout/style/paint.'};
}
async function run(scenario){
    const cleanup=[],{page,errors,writes}=await fixture({after:fn=>cleanup.push(fn)},scenario.kind,false,{sourceRoot});
    try{
        await page.waitForLoadState('networkidle');
        const actual=await seed(page,scenario.kind,scenario.count,scenario.topology,scenario.target||0);
        await install(page,scenario.kind,false,scenario.action);const rows=[];
        for(let i=0;i<samples+2;i++){
            await prepare(page,scenario);await gesture(page,scenario);const row=await finish(page,scenario);
            // Let the original debounce/save complete outside the measured frame window.
            await page.waitForTimeout(scenario.action==='box'?50:scenario.kind==='classic'?1250:200);
            if(i>=2)rows.push(row);
        }
        const savesBefore=writes.filter(w=>w.method==='PUT'&&w.path==='/api/canvases/canvas-test').length;
        const saveCallsBefore=await page.evaluate(()=>window.__diagnostic.totalSaves);
        // Node-head click also passes through the existing drag-release save path
        // before the measured click listener. Later identical snapshots skip PUT.
        // Box selection does not save.
        assert.equal(saveCallsBefore,scenario.action==='box'?0:samples+2,'original save calls are preserved');
        assert.equal(savesBefore,scenario.action==='box'?0:scenario.action==='select'?1:samples+2,'original API save debounce and unchanged-document deduplication are preserved');
        // One separate heavily instrumented sample for attribution; excluded from percentiles.
        await install(page,scenario.kind,true,scenario.action);
        const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
        await prepare(page,scenario);
        const before=(await cdp.send('Performance.getMetrics')).metrics;
        await cdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline',transferMode:'ReturnAsStream'});
        await gesture(page,scenario);const profile=await finish(page,scenario);
        const after=(await cdp.send('Performance.getMetrics')).metrics;
        const trace=analyzeTrace(await readTrace(cdp));
        profile.cdp_delta=Object.fromEntries(['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','LayoutCount','RecalcStyleCount'].map(name=>[name,(after.find(x=>x.name===name)?.value||0)-(before.find(x=>x.name===name)?.value||0)]));
        assert.deepEqual(errors,[]);
        const resources=await page.evaluate(()=>[...new Set(performance.getEntriesByType('resource').map(e=>new URL(e.name).pathname).filter(p=>p.startsWith('/static/')))].sort());
        const sourceManifest=Object.fromEntries(resources.map(url=>{
            const file=path.resolve(sourceRoot,'.'+decodeURIComponent(url));
            return [url,fs.existsSync(file)?crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'):null];
        }));
        return {...scenario,actual,chrome:await page.evaluate(()=>navigator.userAgent),
            synchronous:summary(rows.map(r=>r.sync_ms)),second_frame:summary(rows.map(r=>r.frames[1])),
            samples:rows,save_calls_before_profile:saveCallsBefore,save_requests_before_profile:savesBefore,source_manifest:sourceManifest,profile,trace};
    }finally{for(const close of cleanup.reverse())await close();}
}
(async()=>{
    let report={baseline_commit:commit,box_mode:boxMode,measured_at:new Date().toISOString(),environment:{cpu:os.cpus()[0].model,logical_cpus:os.cpus().length,platform:os.platform(),release:os.release(),node:process.version,viewport:'1280x900',headless:true,samples,warmups:2},
        method:'Trusted Playwright gestures on production HTML/scripts. Fixed API and text-only synthetic documents. No replaced save implementation. Lean timings include event handler through first microtask, then first/second RAF arrival; 350ms follow-up window. Profile is a separate instrumented CDP trace, excluded from percentiles. Second RAF is a presentation opportunity, not physical display latency.',results:[]};
    const scenarios=[
        {kind:'classic',action:'box',count:100,topology:'fanin'},
        {kind:'classic',action:'box',count:1000,topology:'fanin'},
        {kind:'classic',action:'input',count:1000,topology:'none'},
        {kind:'smart',action:'toggle',count:1000,topology:'chain',target:0},
        {kind:'smart',action:'toggle',count:1000,topology:'chain',target:999},
        {kind:'smart',action:'toggle',count:1000,topology:'none',target:0},
        {kind:'smart',action:'input',count:1000,topology:'chain',target:0},
        {kind:'classic',action:'select',count:1000,topology:'fanin'}
    ];
    if(args.includes('--resume')){
        report=JSON.parse(fs.readFileSync(output,'utf8'));
        assert.equal(report.baseline_commit,commit);assert.equal(report.environment.samples,samples);
        assert.equal(report.box_mode||'full',boxMode);
        (report.resumed_at??=[]).push(new Date().toISOString());
    }
    for(const scenario of scenarios.filter(s=>!args.includes('--only')||s.kind===option('--only')||`${s.kind}-${s.action}`===option('--only'))){
        if(report.results.some(r=>Object.keys(scenario).every(k=>r[k]===scenario[k])))continue;
        process.stdout.write(`Measuring ${JSON.stringify(scenario)}\n`);report.results.push(await run(scenario));fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
    }
})().catch(error=>{console.error(error);process.exitCode=1;});
