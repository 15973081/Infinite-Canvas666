// Compare archived production with the approved patch. AB then BA; separate small-graph tail check.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFile,execFileSync}=require('node:child_process'),{promisify}=require('node:util');
const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
assert(args.includes('--baseline-root'));assert(args.includes('--output'));
const root=path.resolve(__dirname,'..'),baseline=path.resolve(option('--baseline-root')),output=path.resolve(option('--output'));
const samples=Number(option('--samples',16)),smallSamples=Number(option('--small-samples',64));
assert(Number.isInteger(samples)&&samples>=12);assert(Number.isInteger(smallSamples)&&smallSamples>=40);
const file='static/js/canvas/classic/canvas-workspace.js',normalize=s=>s.replace(/\r\n/g,'\n');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const original=normalize(fs.readFileSync(path.join(baseline,file),'utf8')),candidate=normalize(fs.readFileSync(path.join(root,file),'utf8'));
let expected=original.replace("    renderLinks();\n    renderSelectionHub();\n    if(workflowTransferModal?.classList.contains('open'))", "    classicWorkspaceView.refreshSelectionLinks();\n    renderSelectionHub();\n    if(workflowTransferModal?.classList.contains('open'))")
    .replace('    function renderLinksImpl(nodeIds=null){','    function renderLinksImpl(nodeIds=null, readPortsFirst=false){')
    .replace('        const liveIds = new Set();',"        if(readPortsFirst){\n            // Selection keeps live geometry, but reads all endpoints before SVG/control writes.\n            connections.forEach(c => { pointFor(c.from, 'out'); pointFor(c.to, 'in'); });\n        }\n        const liveIds = new Set();")
    .replace('        inputCurrent:(...args)=>', '        refreshSelectionLinks:()=>view(renderLinksImpl,[null,true]),\n        inputCurrent:(...args)=>');
assert.notEqual(expected,original);assert.equal(candidate,expected,'candidate has only the bounded approved production patch');
assert.equal(original,normalize(execFileSync('git',['show','2ca5dc9:'+file],{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024})),'archive is the agreed baseline');
fs.mkdirSync(path.dirname(output),{recursive:true});fs.mkdirSync(path.join(root,'.local'),{recursive:true});
const scratch=fs.mkdtempSync(path.join(root,'.local/classic-ports-compare-'));
let report={baseline_commit:execFileSync('git',['rev-parse','2ca5dc9'],{cwd:root,encoding:'utf8'}).trim(),candidate_parent_commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),measured_at:new Date().toISOString(),
    workspace_sha256:{baseline:hash(path.join(baseline,file)),candidate:hash(path.join(root,file))},
    samples,small_samples:smallSamples,method:'Main: two serial reversed-order batches AB/BA, 100/1000 legal fan-in graphs, trusted Ctrl gestures alternating node-0/empty. Independent small-tail phase: two reversed-order batches with 64 samples by default at 100 nodes. Two warmups per group; separate CDP profile excluded. No runtime renderer overrides; no regression tests alongside timings. Source diff and resource content checked.',groups:[],comparisons:[]};
function compareSources(a,b){
    assert.deepEqual(Object.keys(a),Object.keys(b),'same loaded static URLs');
    for(const key of Object.keys(a))if(key!=='/'+file&&a[key]!==b[key]){
        assert(/\.(js|mjs|css|html|json|svg)$/.test(key),'binary content differs: '+key);
        const first=fs.readFileSync(path.join(baseline,key.slice(1))),second=fs.readFileSync(path.join(root,key.slice(1)));
        assert.equal(crypto.createHash('sha256').update(first).digest('hex'),a[key]);assert.equal(crypto.createHash('sha256').update(second).digest('hex'),b[key]);
        assert.equal(normalize(first.toString('utf8')),normalize(second.toString('utf8')),'only pre-existing line endings may differ: '+key);
        report.newline_only_resources=[...new Set([...(report.newline_only_resources||[]),key])].sort();
    }
    assert.notEqual(a['/'+file],b['/'+file]);
}
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
(async()=>{
    if(args.includes('--resume')){
        const existing=JSON.parse(fs.readFileSync(output,'utf8'));assert.deepEqual(existing.workspace_sha256,report.workspace_sha256);
        assert.equal(existing.samples,samples);assert.equal(existing.small_samples,smallSamples);report=existing;(report.resumed_at??=[]).push(new Date().toISOString());
    }
    for(const phase of ['main','small-tail'])for(const batch of [1,2]){
        for(const version of batch===1?['baseline','candidate']:['candidate','baseline']){
            process.stdout.write(`${phase} batch ${batch}: ${version}\n`);
            if(report.groups.some(g=>g.phase===phase&&g.batch===batch&&g.version===version))continue;
            const destination=path.join(scratch,`${phase}-${batch}-${version}.json`);
            const {stdout}=await promisify(execFile)(process.execPath,[path.join(root,'tools/canvas_interaction_diagnostics.cjs'),
                '--source-root',version==='baseline'?baseline:root,'--baseline-commit',version==='baseline'?'2ca5dc9':report.candidate_parent_commit+'+port-read-patch',
                '--box-mode','selection','--alternate-empty-box','--only','classic-box','--counts',phase==='main'?'100,1000':'100',
                '--samples',String(phase==='main'?samples:smallSamples),'--output',destination],{cwd:root,env:process.env,maxBuffer:4*1024*1024});
            process.stdout.write(stdout);report.groups.push({phase,batch,version,...JSON.parse(fs.readFileSync(destination,'utf8'))});save();
        }
        const a=report.groups.find(g=>g.phase===phase&&g.batch===batch&&g.version==='baseline'),b=report.groups.find(g=>g.phase===phase&&g.batch===batch&&g.version==='candidate');
        for(const count of phase==='main'?[100,1000]:[100]){
            const first=a.results.find(r=>r.count===count),second=b.results.find(r=>r.count===count);compareSources(first.source_manifest,second.source_manifest);
            const gains={};for(const timing of ['synchronous','second_frame'])gains[timing]=Object.fromEntries(['p50_ms','p95_ms'].map(key=>[key,100*(1-second[timing][key]/first[timing][key])]));
            report.comparisons=report.comparisons.filter(r=>!(r.phase===phase&&r.batch===batch&&r.count===count));
            report.comparisons.push({phase,batch,count,improvement_percent:gains});
        }save();
    }
    process.stdout.write('Reversed-order batches, independent small-tail confirmation and source/behavior assertions passed.\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
