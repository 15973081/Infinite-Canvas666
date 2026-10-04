// Repeatable browser measurements; synthetic documents, production page/scripts.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {fixture}=require('../tests/helpers/canvas-browser.cjs');
const args=process.argv.slice(2),value=name=>args[args.indexOf(name)+1];
if(!args.includes('--baseline-root') || !args.includes('--output'))throw Error('Required: --baseline-root path --output path');
const repository=path.resolve(__dirname,'..'),current=args.includes('--current-root')?path.resolve(value('--current-root')):repository;
const baseline=path.resolve(value('--baseline-root'));
const baselineCommit=args.includes('--baseline-commit')?value('--baseline-commit'):'ae150ab';
const currentCommit=args.includes('--current-commit')?value('--current-commit'):execFileSync('git',['rev-parse','HEAD'],{cwd:repository,encoding:'utf8'}).trim();
const percentile=(values,q)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*q)-1];
function summarize(samples){return {samples_ms:samples,p50_ms:percentile(samples,.5),p95_ms:percentile(samples,.95),min_ms:Math.min(...samples),max_ms:Math.max(...samples)};}
async function run(root,kind){
    const cleanup=[],{page,errors}=await fixture({after:fn=>cleanup.push(fn)},kind,false,{sourceRoot:root});
    try{
        await page.waitForLoadState('networkidle');
        const version=await page.evaluate(()=>navigator.userAgent);
        const result=await page.evaluate(async kind=>{
            const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
            const measure=async action=>{
                for(let i=0;i<2;i++){action(i);await frame();}
                const samples=[];
                for(let i=0;i<20;i++){
                    const start=performance.now();action(i);document.getElementById('shell').getBoundingClientRect();
                    samples.push(performance.now()-start);await frame();
                }
                return samples;
            };
            let saves=0;scheduleSave=()=>saves++;
            // 25 x 40 grid, 1000 nodes and a 999-edge chain, no media/network decode.
            nodes=Array.from({length:1000},(_,i)=>({id:`node-${i}`,type:kind==='classic'?'prompt':'smart-prompt',
                x:(i%25)*400,y:Math.floor(i/25)*350,w:320,h:240,text:`Prompt ${i}`,prompt:`Prompt ${i}`,images:[]}));
            canvas.connections=Array.from({length:999},(_,i)=>({id:`edge-${i}`,from:`node-${i}`,to:`node-${i+1}`,kind:'input'}));
            if(kind==='classic'){connections=canvas.connections;selected.clear();}else{selectedId='';selectedIds=[];}
            Object.assign(viewport,{x:0,y:0,scale:1});render();await frame();
            const full=await measure(()=>render());
            const first=document.querySelector(`[data-id="node-0"]`);
            const pan=await measure(i=>{viewport.x=-i*2;viewport.y=-i;applyViewport({viewportOnly:true});});
            const panPreservedNode=first===document.querySelector(`[data-id="node-0"]`);
            const partial=await measure(i=>{
                nodes[0].text=`Edit ${i}`;nodes[0].prompt=`Edit ${i}`;
                if(kind==='classic')refreshNodes(['node-0']);else refreshSmartNodes(['node-0']);
            });
            const workspace={nodes:nodes.length,connections:canvas.connections.length,
                nodeElements:document.querySelectorAll(kind==='classic'?'.node':'.image-node').length,
                edgeElements:document.querySelectorAll(kind==='classic'?'#links path.link':'.smart-connection').length,
                panPreservedNode};
            let gate=null;
            if(kind==='classic'){
                canvases=Array.from({length:2000},(_,i)=>({id:`canvas-${i}`,title:`Canvas ${i}`,folder_id:`folder-${i%100}`,updated_at:i}));
                canvasFolders=Array.from({length:100},(_,i)=>({id:`folder-${i}`,name:`Folder ${i}`,order:i}));
                deletedCanvases=[];activeFolderId='all';trashMode=false;canvasSearchQuery='';
                Object.assign(canvasGate.style,{display:'flex',visibility:'visible',opacity:'1',pointerEvents:'auto'});
                const all=await measure(()=>renderCanvasList());
                const search=await measure(i=>{
                    const query=i%2?'Canvas 199':'Canvas 198';
                    if(typeof searchCanvases==='function')searchCanvases(query);
                    else {canvasSearchQuery=query;closeCanvasMetaPopover();renderCanvasList();}
                });
                gate={canvases:canvases.length,folders:canvasFolders.length,all,search,
                    searchCards:document.querySelectorAll('#gateCanvasList .canvas-item').length};
            }
            return {full,pan,partial,workspace,gate,saves};
        },kind);
        if(errors.length)throw Error(`${kind}: ${errors.join('; ')}`);
        assert.equal(result.workspace.nodeElements,1000,'the full synthetic document is represented');
        assert.equal(result.workspace.edgeElements,999,'all valid unique connections are rendered');
        assert.equal(result.workspace.panPreservedNode,true,'viewport updates preserve the target DOM');
        for(const key of ['full','pan','partial'])result[key]=summarize(result[key]);
        if(result.gate){result.gate.all=summarize(result.gate.all);result.gate.search=summarize(result.gate.search);}
        return {chrome:version,...result};
    }finally{for(const close of cleanup.reverse())await close();}
}
(async()=>{
    const output={measured_at:new Date().toISOString(),baseline_commit:baselineCommit,current_commit:currentCommit,
        environment:{platform:os.platform(),release:os.release(),cpu:os.cpus()[0].model,logical_cpus:os.cpus().length,node:process.version,
            viewport:'1280x900',headless:true,samples:20,warmups:2},
        definition:'Synchronous production operations plus forced layout; scheduled follow-up frames settle between samples and are excluded from operation timing. Partial calls refreshNodes([node-0]) in Classic and refreshSmartNodes([node-0]) in Smart; Smart expands the 999-edge chain to 1000 dependent targets. Synthetic API and text-only documents; not network, GPU media, input latency or provider performance.',results:[]};
    // Alternating versions reduces the effect of machine/Chrome warmup drift.
    for(const [label,root,kind] of [['baseline',baseline,'classic'],['current',current,'classic'],['current',current,'smart'],['baseline',baseline,'smart']]){
        process.stdout.write(`Measuring ${label} ${kind}\n`);output.results.push({version:label,kind,...await run(root,kind)});
        fs.writeFileSync(path.resolve(value('--output')),JSON.stringify(output,null,2)+'\n');
    }
    fs.writeFileSync(path.resolve(value('--output')),JSON.stringify(output,null,2)+'\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
