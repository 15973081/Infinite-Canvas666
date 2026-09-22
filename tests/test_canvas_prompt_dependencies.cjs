const {readCanvasSource} = require('./helpers/canvas-source.cjs');
const test=require('node:test'), assert=require('node:assert/strict'), vm=require('node:vm');
const source=readCanvasSource(require('node:path').join(__dirname,'../static/js/canvas.js'),'utf8').replace(/\r\n/g,'\n');
function setup(){
    const nodes=[{id:'p',type:'prompt',text:'first'},{id:'other',type:'prompt',text:'other'},
        {id:'group',type:'group',items:['p']},{id:'pg',type:'promptGroup',items:['p']},
        {id:'loop',type:'loop',showPrompt:true,variablePrompt:'fallback',count:2},
        {id:'loop2',type:'loop',showPrompt:true},
        ...['direct','groupGen','pgGen','loopGen'].map(id=>({id,type:'video'})),
        ...Array.from({length:100},(_,i)=>({id:`unrelated${i}`,type:'video'}))];
    const connections=[['p','direct'],['group','groupGen'],['pg','pgGen'],['pg','loop'],['loop','loop2'],['loop2','loopGen'],
        ...Array.from({length:100},(_,i)=>['other',`unrelated${i}`])].map(([from,to],i)=>({id:`c${i}`,from,to}));
    const computed=[], previews=new Map();
    const ctx=vm.createContext({nodes,connections,CANVAS_GENERATOR_TYPES:['video','ltxDirector'],CANVAS_MEDIA_OUTPUT_TYPES:['video'],
        loopPromptVisiting:new Set(),loopInputImageRefs:()=>[],tr:s=>s,
        nodesEl:{querySelector:selector=>{const id=selector.match(/data-id="([^"]+)"/)[1];return {classList:{contains:()=>false},querySelector:()=>id};}},
        videoNodeMediaRefs:r=>r,renderPromptPreview:(id,s)=>previews.set(id,s.map(x=>x.prompt).join('|')),
        renderVideoImageInputs(){},ltxSyncConnectedImagesToTimeline(){}});
    for(const name of ['canvasInputGraph','refreshPromptDependents','generatorSources','orderedSources','refreshGeneratorInputViews','syncGeneratorInputs','loopCount','loopInputPromptItems','loopInputPrompt','renderLoopPrompt']){
        const start=source.indexOf(`function ${name}(`);vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),ctx);
    }
    const actual=ctx.generatorSources;ctx.generatorSources=(gen,...args)=>{computed.push(gen.id);return actual(gen,...args);};
    return {ctx,nodes,computed,previews,actual};
}
test('one edit computes each dependent once, including containers and nested loops, not 100 unrelated generators',()=>{
    const {ctx,computed,previews}=setup();ctx.refreshPromptDependents('p');
    assert.deepEqual(computed.sort(),['direct','groupGen','loopGen','pgGen']);
    assert.equal(previews.size,4);assert.ok([...previews.values()].every(text=>text==='first'));
});
test('clear/refill and current connection or group membership changes match uncached full sources',()=>{
    const {ctx,nodes,actual,previews}=setup();
    for(const value of ['', 'new Chinese 中文']){
        nodes[0].text=value;ctx.refreshPromptDependents('p');
        for(const id of ['direct','groupGen','loopGen','pgGen']){
            const gen=nodes.find(n=>n.id===id);
            const expected=actual(gen).filter(s=>s.prompt&&!s.refs?.length).map(s=>s.prompt).join('|');
            assert.equal(previews.get(id),expected);
            assert.deepEqual([...gen.inputs],[...ctx.orderedSources(gen,actual(gen))].map(s=>s.id));
        }
    }
    const saved=ctx.connections;ctx.connections=ctx.connections.filter(c=>c.from!=='p');
    ctx.syncGeneratorInputs();ctx.refreshGeneratorInputViews();assert.equal(previews.get('direct'),'');
    nodes[0].text='after disconnect';ctx.refreshPromptDependents('p');assert.equal(previews.get('direct'),'');
    ctx.connections=saved;ctx.syncGeneratorInputs();ctx.refreshGeneratorInputViews();assert.equal(previews.get('direct'),'after disconnect');
    nodes.find(n=>n.id==='pg').items=[];ctx.syncGeneratorInputs();ctx.refreshGeneratorInputViews();
    assert.equal(previews.get('pgGen'),'');assert.equal(previews.get('loopGen'),'fallback');
});
test('dependency and loop cycles terminate and fresh graph replacement does not retain old node objects',()=>{
    const {ctx,computed}=setup();
    ctx.connections.push({id:'cycle',from:'loop2',to:'loop'});
    ctx.nodes.find(n=>n.id==='group').items.push('group');
    ctx.refreshPromptDependents('p');assert.equal(computed.length,4);
    ctx.nodes=[{id:'p',type:'prompt',text:'replacement'},{id:'g',type:'video'}];
    ctx.connections=[{id:'new',from:'p',to:'g'}];computed.length=0;ctx.refreshPromptDependents('p');
    assert.deepEqual(computed,['g']);assert.equal(ctx.nodes[1].inputs[0],'p');
});
