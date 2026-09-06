const test=require('node:test'), assert=require('node:assert/strict'), vm=require('node:vm');
const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../static/js/canvas.js'),'utf8').replace(/\r\n/g,'\n');
function setup(){
    const calls=[], textarea={value:'old',scrollTop:27};
    const body={querySelector:()=>textarea};
    const node={id:'p',type:'prompt',text:'old'}, gen={id:'g',type:'video',inputs:['a','b']};
    const ctx=vm.createContext({nodes:[node,gen],nodesEl:{querySelector:()=>body},CSS:{escape:s=>s},
        canvasPromptTemplates:[{id:'t'}],promptTemplateSelectedId:'t',promptTemplateNodeId:'p',canvasPromptTemplateText:()=> 'new template',
        closePromptTemplateModal(){},scheduleSave(){},syncGeneratorInputs(){},refreshPromptCounter:(_body,text)=>calls.push(['counter',text]),
        refreshGeneratorInputViews:ids=>calls.push(['views',ids && [...ids]]),refreshGeometryAfterLayout:()=>calls.push(['layout']),
        generatorSources:()=>[{id:'a',refs:[{url:'/a.mp4',kind:'video'}]},{id:'b',refs:[{url:'/b.mp4',kind:'video'}]}],
        orderedSources:(_g,s)=>s,mediaKindForRef:r=>r.kind,isRemoteVideoReferenceUrl:s=>/^https:/.test(s),
        manualVideoUrlForNode:()=>'',currentCanvasMediaLinks:()=>[],tempShUploadedUrlForNode:()=>'',
        prompt:()=> 'https://example.com/manual.mp4',clearManualVideoUrlForNode:n=>{n.manualVideoUrls=[];},
        applyManualVideoUrlToCanvasRef:(n,_r,url)=>{n.manualVideoUrls=[url];},showErrorModal(){},
        render(){throw Error('full render forbidden');},refreshNodes(){throw Error('node rebuild forbidden');}});
    for(const name of ['applyPromptTemplateToPromptNode','setCanvasManualVideoUrl','reorderInput']){
        const start=source.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));
        vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),ctx);
    }
    return {ctx,calls,textarea,node,gen};
}
test('material reorder refreshes only the target inputs without rebuilding nodes',()=>{
    const {ctx,calls,gen}=setup();ctx.reorderInput(gen,'b','a');
    assert.deepEqual([...gen.inputs],['b','a']);assert.deepEqual(calls,[['views',['g']],['layout']]);
});
test('template updates the existing editor and counter while retaining its scroll',()=>{
    const {ctx,textarea,node,calls}=setup();ctx.applyPromptTemplateToPromptNode();
    assert.equal(node.text,'new template');assert.equal(textarea.value,node.text);assert.equal(textarea.scrollTop,27);
    assert.deepEqual(calls[0],['counter',node.text]);
});
test('manual URL set, clear, cancel and invalid input do not rebuild any node',async()=>{
    const {ctx,gen,calls}=setup();await ctx.setCanvasManualVideoUrl('g');
    assert.deepEqual(gen.manualVideoUrls,['https://example.com/manual.mp4']);assert.deepEqual(calls[0],['views',['g']]);
    ctx.prompt=()=>'';await ctx.setCanvasManualVideoUrl('g');assert.deepEqual(gen.manualVideoUrls,[]);
    const n=calls.length;ctx.prompt=()=>null;await ctx.setCanvasManualVideoUrl('g');
    ctx.prompt=()=>'/local.mp4';await ctx.setCanvasManualVideoUrl('g');assert.equal(calls.length,n);
});
