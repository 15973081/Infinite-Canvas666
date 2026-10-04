// AB/AB comparison of the same trusted gesture and fixture; no production overrides.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFile,execFileSync}=require('node:child_process'),{promisify}=require('node:util');
const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1];
for(const name of ['--baseline-root','--output'])assert(args.includes(name),`${name} is required`);
const root=path.resolve(__dirname,'..'),baseline=path.resolve(arg('--baseline-root')),output=path.resolve(arg('--output'));
const samples=args.includes('--samples')?Number(arg('--samples')):12;
const file='static/js/canvas/classic/canvas-workspace.js',hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const normalize=s=>s.replace(/\r\n/g,'\n');
const before=normalize(fs.readFileSync(path.join(baseline,file),'utf8')),after=normalize(fs.readFileSync(path.join(root,file),'utf8'));
const expected=before.replace("    endWindowPointerSession();\n    render();\n    if(workflowTransferModal?.classList.contains('open')) updateWorkflowTransferMeta();\n}","    endWindowPointerSession();\n    refreshSelectionVisuals();\n}");
assert.notEqual(expected,before,'baseline contains the original finishSelection');assert.equal(after,expected,'candidate production file has only the approved replacement');
const scratch=fs.mkdtempSync(path.join(root,'.local/classic-selection-compare-'));
let report={measured_at:new Date().toISOString(),baseline_commit:'8b8ef5c',candidate_parent_commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
    workspace_sha256:{baseline:hash(path.join(baseline,file)),candidate:hash(path.join(root,file))},
    method:'Two serial batches, baseline/candidate/baseline/candidate. Same 100/1000-node legal fan-in graphs, production HTML, Ctrl background drag. Each group has 2 warmups, 12 lean samples by default, and a separate profile. Exact production file diff is asserted; loaded static resource hashes are compared, allowing only the workspace change. No timing alongside regression tests.',groups:[],comparisons:[]};
function compareSources(a,b){
    assert.deepEqual(Object.keys(a),Object.keys(b),'both versions load the same static resources');
    for(const key of Object.keys(a))if(key!=='/'+file&&a[key]!==b[key]){
        assert(/\.(js|mjs|css|html|json|svg)$/.test(key),`same binary resource bytes: ${key}`);
        const original=fs.readFileSync(path.join(baseline,key.slice(1))),candidate=fs.readFileSync(path.join(root,key.slice(1)));
        assert.equal(crypto.createHash('sha256').update(original).digest('hex'),a[key]);
        assert.equal(crypto.createHash('sha256').update(candidate).digest('hex'),b[key]);
        assert.equal(normalize(original.toString('utf8')),normalize(candidate.toString('utf8')),`same text ignoring existing CRLF/LF: ${key}`);
        report.newline_only_resources=[...new Set([...(report.newline_only_resources||[]),key])].sort();
    }
    assert.notEqual(a['/'+file],b['/'+file]);
}
(async()=>{
    if(args.includes('--resume')){
        const existing=JSON.parse(fs.readFileSync(output,'utf8'));
        assert.deepEqual(existing.workspace_sha256,report.workspace_sha256,'resume requires the identical production patch and baseline');
        report=existing;(report.resumed_at??=[]).push(new Date().toISOString());
    }
    report.resource_comparison='Raw hashes retained; text with different hashes must match after CRLF/LF normalization. Binary bytes and static resource URLs must match exactly; only the approved workspace replacement differs.';
    for(const batch of [1,2])for(const version of ['baseline','candidate']){
        process.stdout.write(`Batch ${batch}: ${version}\n`);
        let measurements=report.groups.find(g=>g.batch===batch&&g.version===version);
        if(!measurements){
            const destination=path.join(scratch,`${batch}-${version}.json`);
            const {stdout}=await promisify(execFile)(process.execPath,[path.join(root,'tools/canvas_interaction_diagnostics.cjs'),
            '--source-root',version==='baseline'?baseline:root,'--baseline-commit',version==='baseline'?'8b8ef5c':'8bcffe0+selection-patch',
            '--only','classic-box','--box-mode',version==='baseline'?'full':'selection','--samples',String(samples),'--output',destination],{cwd:root,env:process.env,maxBuffer:4*1024*1024});
            process.stdout.write(stdout);measurements=JSON.parse(fs.readFileSync(destination,'utf8'));
            report.groups.push({batch,version,...measurements});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
        }
        if(version==='candidate'){
            const control=report.groups.find(g=>g.batch===batch&&g.version==='baseline');
            for(const count of [100,1000]){
                const a=control.results.find(r=>r.count===count),b=measurements.results.find(r=>r.count===count);
                compareSources(a.source_manifest,b.source_manifest);
                const gains={};for(const phase of ['synchronous','second_frame'])gains[phase]=Object.fromEntries(['p50_ms','p95_ms'].map(key=>[key,100*(1-b[phase][key]/a[phase][key])]));
                report.comparisons=report.comparisons.filter(r=>r.batch!==batch||r.count!==count);
                report.comparisons.push({batch,count,improvement_percent:gains,p50_target_50_percent_met:gains.synchronous.p50_ms>=50&&gains.second_frame.p50_ms>=50});
            }
            fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
        }
    }
    process.stdout.write('Two batches completed and source/behavior assertions passed.\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
