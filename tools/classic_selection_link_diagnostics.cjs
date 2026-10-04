// Diagnostic page overrides only. Never imported by production HTML.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {fixture}=require('../tests/helpers/canvas-browser.cjs');
const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const root=path.resolve(__dirname,'..'),output=path.resolve(option('--output','.local/classic-selection-links.json'));
const samples=Number(option('--samples',12));assert(Number.isInteger(samples)&&samples>=2);
const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const baseline=execFileSync('git',['rev-parse','2ca5dc9'],{cwd:root,encoding:'utf8'}).trim();
execFileSync('git',['merge-base','--is-ancestor',baseline,head],{cwd:root});
execFileSync('git',['diff','--exit-code','--ignore-space-at-eol','2ca5dc9','--','static'],{cwd:root});
fs.mkdirSync(path.dirname(output),{recursive:true});
const summary=values=>{const s=[...values].sort((a,b)=>a-b);return {samples_ms:values,p50_ms:s[Math.ceil(s.length*.5)-1],p95_ms:s[Math.ceil(s.length*.95)-1]};};
async function seed(page,count=3){
    await page.evaluate(count=>{
        canvas.nodes=nodes=Array.from({length:count},(_,i)=>({id:'n'+i,type:i===count-1?'generator':'prompt',model:'gpt-image-2',text:'Prompt '+i,
            x:100+(i%25)*400,y:130+Math.floor(i/25)*350,w:320,h:240}));
        canvas.connections=connections=Array.from({length:count-1},(_,i)=>({id:'e'+i,from:'n'+i,to:'n'+(count-1)}));
        if(connections.some(c=>!canConnect(c.from,c.to)))throw Error('illegal graph');
        selected.clear();Object.assign(viewport,{x:0,y:0,scale:1});render();
    },count);await page.waitForTimeout(550);
}
async function install(page,mode,profile=false){
    await page.evaluate(({mode,profile})=>{
        // Capture references outside the timed operation, approximating the existing private link map.
        const paths=new Map([...linksEl.querySelectorAll('path.link[data-connection-id]')].map(el=>[el.dataset.connectionId,el]));
        const hits=new Map([...linksEl.querySelectorAll('path.link-hit')].map(el=>[el.dataset.connectionId,el]));
        const buttons=new Map([...linkControlsEl.querySelectorAll('.link-delete')].map(el=>[el.dataset.connectionId,el]));
        const d=window.linkDiagnostic={mode,profile,armed:false,current:null,inSelection:false,saves:0,ports:null,paths,hits,buttons};
        const originalPort=portPoint,originalLinks=renderLinks,originalSelection=refreshSelectionVisuals,originalSave=scheduleSave;
        portPoint=(...args)=>{
            const c=d.current,start=performance.now();if(c)c.port_calls++;
            try{return d.ports?d.ports[args[1]].get(args[0]):originalPort(...args);}
            finally{if(c)c.port_inclusive_ms+=performance.now()-start;}
        };
        renderLinks=(...args)=>{
            const c=d.current,start=performance.now();if(c)c.link_calls++;
            try{
                if(!d.inSelection||mode==='current')return originalLinks(...args);
                if(mode==='batch-ports'){
                    // All current DOM measurements precede every SVG/control write.
                    const nodeById=new Map(nodes.map(n=>[n.id,n])),points={in:new Map(),out:new Map()};
                    for(const edge of connections)for(const [id,kind] of [[edge.from,'out'],[edge.to,'in']]){
                        if(points[kind].has(id))continue;
                        const t=performance.now();points[kind].set(id,originalPort(id,kind,nodeById));
                        if(c){c.actual_port_reads++;c.premeasure_ms+=performance.now()-t;}
                    }
                    d.ports=points;try{return originalLinks(...args);}finally{d.ports=null;}
                }
                // Deliberately unguarded reuse: a lower bound, NOT a safe shipping implementation.
                for(const edge of connections){
                    const button=buttons.get(edge.id);if(!button?.isConnected)throw Error('prototype cache missing');
                    button.classList.toggle('visible',isConnectionSelected(edge));
                    button.classList.toggle('hover',hoveredConnectionId===edge.id);
                }
            }finally{if(c)c.link_ms+=performance.now()-start;}
        };
        refreshSelectionVisuals=(...args)=>{
            d.inSelection=true;try{return originalSelection(...args);}finally{
                d.inSelection=false;const c=d.current;if(c&&!c.ending){c.ending=true;queueMicrotask(()=>{
                    c.sync_ms=performance.now()-c.start;if(profile)performance.mark('selection-links-sync-end');
                    requestAnimationFrame(()=>{c.frames.push(performance.now()-c.start);requestAnimationFrame(()=>c.frames.push(performance.now()-c.start));});
                });}
            }
        };
        scheduleSave=(...args)=>{d.saves++;return originalSave(...args);};
        if(profile){
            const measure=(proto,name)=>{const fn=proto[name];proto[name]=function(...args){
                const c=d.current;if(!c)return fn.apply(this,args);const t=performance.now();
                c.dom_calls[name]=(c.dom_calls[name]||0)+1;
                if(name==='setAttribute'&&args[0]==='d')c.path_writes++;
                try{return fn.apply(this,args);}finally{c.dom_inclusive_ms[name]=(c.dom_inclusive_ms[name]||0)+performance.now()-t;}
            };};
            for(const name of ['getBoundingClientRect','setAttribute','querySelector','querySelectorAll'])measure(Element.prototype,name);
            for(const name of ['offsetWidth','offsetHeight']){
                const desc=Object.getOwnPropertyDescriptor(HTMLElement.prototype,name);
                Object.defineProperty(HTMLElement.prototype,name,{...desc,get(){const c=d.current,t=performance.now();
                    if(c)c.dom_calls[name]=(c.dom_calls[name]||0)+1;
                    try{return desc.get.call(this);}finally{if(c)c.dom_inclusive_ms[name]=(c.dom_inclusive_ms[name]||0)+performance.now()-t;}
                }});
            }
        }
        window.addEventListener('mouseup',e=>{
            if(!d.armed)return;d.armed=false;if(profile)performance.mark('selection-links-start');d.current={trusted:e.isTrusted,start:performance.now(),frames:[],link_calls:0,link_ms:0,
                port_calls:0,actual_port_reads:0,port_inclusive_ms:0,premeasure_ms:0,path_writes:0,dom_calls:{},dom_inclusive_ms:{}};
        },true);
    },{mode,profile});
}
async function geometry(page){
    return page.evaluate(()=>connections.map(c=>({id:c.id,d:linksEl.querySelector(`path.link[data-connection-id="${c.id}"]`).getAttribute('d'),
        hit:linksEl.querySelector(`path.link-hit[data-connection-id="${c.id}"]`).getAttribute('d'),
        left:linkControlsEl.querySelector(`[data-connection-id="${c.id}"]`).style.left,top:linkControlsEl.querySelector(`[data-connection-id="${c.id}"]`).style.top})));
}
async function liveGeometryError(page){
    return page.evaluate(()=>{
        let max=0;const map=new Map(nodes.map(n=>[n.id,n]));
        for(const c of connections){
            const a=portPoint(c.from,'out',map),b=portPoint(c.to,'in',map),expected=connectionPathData(a.x,a.y,b.x,b.y).match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi).map(Number);
            for(const cls of ['link','link-hit']){
                const actual=linksEl.querySelector(`path.${cls}[data-connection-id="${c.id}"]`).getAttribute('d').match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi).map(Number);
                if(actual.length!==expected.length)throw Error('path schema');
                actual.forEach((v,i)=>max=Math.max(max,Math.abs(v-expected[i])));
            }
            const button=linkControlsEl.querySelector(`[data-connection-id="${c.id}"]`);
            max=Math.max(max,Math.abs(parseFloat(button.style.left)-(a.x+b.x)/2),Math.abs(parseFloat(button.style.top)-(a.y+b.y)/2));
        }return max;
    });
}
async function gesture(page,empty=false){
    await page.keyboard.down('Control');await page.mouse.move(empty?50:85,empty?750:115);await page.mouse.down();
    await page.mouse.move(empty?80:440,empty?780:410,{steps:3});assert(await page.evaluate(()=>Boolean(selectDrag)));
    await page.evaluate(()=>{linkDiagnostic.current=null;linkDiagnostic.before=new Map([...nodesEl.querySelectorAll('.node')].map(el=>[el.dataset.id,el]));linkDiagnostic.armed=true;});
    await page.mouse.up();await page.keyboard.up('Control');await page.waitForTimeout(350);
    const row=await page.evaluate(()=>{
        const d=linkDiagnostic,c=d.current;if(d.profile)performance.mark('selection-links-window-end');d.current=null;delete c.start;delete c.ending;
        c.selected=[...selected];c.visible=[...linkControlsEl.querySelectorAll('.link-delete.visible')].map(el=>el.dataset.connectionId);
        c.replacedNodes=[...nodesEl.querySelectorAll('.node')].filter(el=>d.before.get(el.dataset.id)!==el).length;
        return c;
    });assert(row.trusted);assert.equal(row.frames.length,2);assert.equal(row.replacedNodes,0);
    assert.deepEqual(row.selected,empty?[]:['n0']);assert.deepEqual(row.visible,empty?[]:['e0']);return row;
}
async function withPage(work){
    const cleanup=[],f=await fixture({after:fn=>cleanup.push(fn)},'classic',false);
    try{await f.page.waitForLoadState('networkidle');const result=await work(f);assert.deepEqual(f.errors,[]);return result;}
    finally{for(const close of cleanup.reverse())await close();}
}
async function readTrace(cdp){
    const done=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');const {stream}=await done;let raw='';
    while(true){const item=await cdp.send('IO.read',{handle:stream});raw+=item.data;if(item.eof)break;}
    await cdp.send('IO.close',{handle:stream});return JSON.parse(raw).traceEvents;
}
function analyzeTrace(events){
    const a=events.find(e=>e.name==='selection-links-start'),b=events.find(e=>e.name==='selection-links-sync-end'),c=events.find(e=>e.name==='selection-links-window-end');assert(a&&b&&c);
    const duration=(name,start,end)=>{
        const spans=events.filter(e=>e.ph==='X'&&e.name===name&&e.pid===a.pid&&e.tid===a.tid&&e.dur>0)
            .map(e=>[Math.max(start,e.ts),Math.min(end,e.ts+e.dur)]).filter(([x,y])=>y>x).sort((x,y)=>x[0]-y[0]);
        let sum=0,left=0,right=0;for(const [x,y]of spans){if(x>right){sum+=right-left;left=x;right=y;}else right=Math.max(right,y);}return(sum+right-left)/1000;
    };
    const phase=(start,end)=>Object.fromEntries([['style_ms','UpdateLayoutTree'],['layout_ms','Layout'],['paint_ms','Paint'],['raf_ms','FireAnimationFrame'],['task_ms','RunTask']].map(([key,name])=>[key,duration(name,start,end)]));
    return {synchronous:phase(a.ts,b.ts),following:phase(b.ts,c.ts),note:'Main renderer thread, category interval unions. Categories overlap: do not add layout/style to task/RAF. Profile overhead excluded from lean percentiles.'};
}
async function benchmark(mode,count,profile=false){return withPage(async({page,writes})=>{
    await seed(page,count);await install(page,mode,profile);const before=await geometry(page),rows=[];
    const cdp=profile?await page.context().newCDPSession(page):null;
    if(cdp)await cdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline',transferMode:'ReturnAsStream'});
    for(let i=0;i<(profile?1:samples+2);i++){const row=await gesture(page,i%2===1);if(profile||i>=2)rows.push(row);}
    const trace=cdp?analyzeTrace(await readTrace(cdp)):null;
    assert.deepEqual(await geometry(page),before);assert((await liveGeometryError(page))<1e-3);
    assert.equal(await page.evaluate(()=>linkDiagnostic.saves),0);assert.equal(writes.filter(w=>w.method==='PUT').length,0);
    return {mode,count,profile,chrome:await page.evaluate(()=>navigator.userAgent),sync:summary(rows.map(r=>r.sync_ms)),second_frame:summary(rows.map(r=>r.frames[1])),rows,...(trace?{trace}: {})};
});}
async function boundaries(mode){return withPage(async({page})=>{
    await seed(page);await install(page,mode);const cases=[];
    const capture=async(name,before,expectChanged=true)=>{
        const after=await geometry(page),changed=JSON.stringify(before)!==JSON.stringify(after),error=await liveGeometryError(page);
        assert.equal(changed,expectChanged,name+' geometry change');assert(error<1e-3,name+' final geometry agrees with live ports');cases.push({name,changed,max_world_error:error});
    };
    let before=await geometry(page);await gesture(page);await capture('selection only',before,false);
    before=await geometry(page);
    const title=await page.locator('[data-id="n0"] .node-title').boundingBox();
    await page.mouse.move(title.x+10,title.y+5);await page.mouse.down();await page.mouse.move(title.x+70,title.y+45,{steps:4});await page.mouse.up();await page.waitForTimeout(300);
    await capture('native node movement',before);
    before=await geometry(page);const handle=await page.locator('[data-id="n0"] .resize-handle').boundingBox();
    await page.mouse.move(handle.x+5,handle.y+5);await page.mouse.down();await page.mouse.move(handle.x+50,handle.y+40,{steps:4});await page.mouse.up();await page.waitForTimeout(300);
    await capture('native node resize',before);
    // Pure viewport transforms should preserve world points (allow float rounding).
    await page.mouse.move(60,720);await page.mouse.down({button:'middle'});await page.mouse.move(105,745,{steps:3});await page.mouse.up({button:'middle'});await page.waitForTimeout(300);
    const panError=await liveGeometryError(page);assert(panError<1e-3);cases.push({name:'native pan',max_world_error:panError});
    await page.mouse.move(900,500);await page.mouse.wheel(0,100);await page.waitForTimeout(300);
    const zoomError=await liveGeometryError(page);assert(zoomError<1e-3,`zoom error ${zoomError}`);cases.push({name:'native wheel zoom, original scheduled geometry',max_world_error:zoomError});
    before=await geometry(page);
    await page.evaluate(()=>{const el=nodesEl.querySelector('[data-id="n0"] .port.out');el.style.top='30%';refreshGeometryAfterLayout(['n0']);});await page.waitForTimeout(200);
    await capture('notified port layout change',before);
    // Deliberate missing notification demonstrates the condition a permanent cache would miss.
    const negative=await page.evaluate(()=>{
        const port=nodesEl.querySelector('[data-id="n0"] .port.out');port.style.top='70%';
        const model=JSON.stringify(nodes[0]),pending=classicWorkspaceView.state.pendingGeometry;
        selected.clear();selected.add('n0');refreshSelectionVisuals();return {model,pending};
    });const staleError=await liveGeometryError(page);
    if(mode==='presentation-only')assert(staleError>10);else assert(staleError<1e-3);
    cases.push({name:'unnotified port movement, node model unchanged',pending_geometry:negative.pending,max_world_error:staleError,expected_stale:mode==='presentation-only'});
    await page.evaluate(()=>refreshGeometryAfterLayout(['n0']));await page.waitForTimeout(200);assert((await liveGeometryError(page))<1e-3);
    // A replaced placeholder must use fallback dimensions until original hydration reconciles ports.
    before=await geometry(page);const placeholder=await page.evaluate(()=>{
        const n=nodes[0],old=nodesEl.querySelector('[data-id="n0"]');n.x=4000;old.replaceWith(renderNodePlaceholder(n));refreshGeometry(['n0']);
        return {placeholder:nodesEl.querySelector('[data-id="n0"]').classList.contains('node-placeholder'),ports:nodesEl.querySelector('[data-id="n0"]').querySelectorAll('.port').length};
    });assert(placeholder.placeholder);assert.equal(placeholder.ports,0);await capture('placeholder fallback',before);
    before=await geometry(page);await page.evaluate(()=>{viewport.x=-3900;viewport.y=0;applyViewport();scheduleViewportRefresh(0);});await page.waitForTimeout(300);
    assert.equal(await page.evaluate(()=>nodesEl.querySelector('[data-id="n0"]').classList.contains('node-placeholder')),false);await capture('original viewport hydration',before);
    // Missing controls / changed topology must be handled by the existing geometry path, not selection-only reuse.
    await page.evaluate(()=>{linkControlsEl.querySelector('[data-connection-id="e0"]').remove();renderLinks();});assert((await liveGeometryError(page))<1e-3);
    cases.push({name:'detached button repaired by original geometry path',max_world_error:await liveGeometryError(page)});
    return {mode,cases};
});}
async function styleControl(removeBodyFlag,changeSelection){return withPage(async({page,writes})=>{
    await seed(page,1000);await install(page,'presentation-only',true);
    if(removeBodyFlag){await page.evaluate(()=>document.body.classList.add('canvas-selecting'));await page.waitForTimeout(200);}
    const before=await geometry(page),cdp=await page.context().newCDPSession(page);
    await cdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline',transferMode:'ReturnAsStream'});
    await page.evaluate(({removeBodyFlag,changeSelection})=>{
        performance.mark('selection-links-start');linkDiagnostic.current={trusted:false,start:performance.now(),frames:[],link_calls:0,link_ms:0,
            port_calls:0,actual_port_reads:0,port_inclusive_ms:0,premeasure_ms:0,path_writes:0,dom_calls:{},dom_inclusive_ms:{}};
        if(removeBodyFlag)document.body.classList.remove('canvas-selecting');
        if(changeSelection)selected.add('n0');refreshSelectionVisuals();
    },{removeBodyFlag,changeSelection});await page.waitForTimeout(350);
    const row=await page.evaluate(()=>{performance.mark('selection-links-window-end');const c=linkDiagnostic.current;linkDiagnostic.current=null;delete c.start;delete c.ending;return c;});
    const trace=analyzeTrace(await readTrace(cdp));assert.deepEqual(await geometry(page),before);assert.equal(writes.filter(w=>w.method==='PUT').length,0);
    return {remove_body_flag:removeBodyFlag,change_selection:changeSelection,row,trace,note:'Non-gesture isolation control, not included in performance percentiles. Existing CSS and original node/minimap selection rendering; only link geometry omitted.'};
});}
(async()=>{
    const sourcePaths=['static/js/canvas/classic/canvas-workspace.js','static/css/canvas.css'];
    const report={baseline_commit:baseline,repository_head:head,measured_at:new Date().toISOString(),environment:{cpu:os.cpus()[0].model,logical_cpus:os.cpus().length,release:os.release(),node:process.version,viewport:'1280x900',samples,warmups:2},
        source_sha256:Object.fromEntries(sourcePaths.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')])),
        method:'Unchanged production HTML/source. Browser-only overrides restricted to refreshSelectionVisuals -> renderLinks. Current, read-all-current-ports-before-writes, and deliberately unguarded presentation-only lower bound. Trusted Ctrl gestures alternate nonempty/empty. Two serial batches; no regression tests run concurrently. Separate profiled pages excluded from timings. World-coordinate error tolerance 1e-3.',boundaries:[],groups:[],profiles:[]};
    const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
    if(args.includes('--style-controls-only')){
        report.style_controls=[];for(const [remove,select]of [[false,true],[true,false],[true,true]]){
            process.stdout.write(`Style control: body=${remove} selection=${select}\n`);report.style_controls.push(await styleControl(remove,select));save();
        }
        process.stdout.write('All style isolation assertions passed.\n');return;
    }
    if(!args.includes('--profile-only'))for(const mode of ['current','batch-ports','presentation-only']){process.stdout.write('Boundaries: '+mode+'\n');report.boundaries.push(await boundaries(mode));save();}
    if(!args.includes('--profile-only'))for(const batch of [1,2])for(const mode of ['current','batch-ports','presentation-only'])for(const count of [100,1000]){
        process.stdout.write(`Batch ${batch}: ${mode} ${count}\n`);report.groups.push({batch,...await benchmark(mode,count)});save();
    }
    for(const mode of ['current','batch-ports','presentation-only']){process.stdout.write('Profile: '+mode+'\n');report.profiles.push(await benchmark(mode,1000,true));save();}
    process.stdout.write('All diagnostic assertions passed.\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
