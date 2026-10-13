const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');

function legacyGraph(){
    return {
        nodes:[
            {id:'prompt',type:'smart-prompt',x:40,y:80,text:'原提示词'},
            {id:'loop',type:'smart-loop',x:340,y:80,count:4,mode:'parallel',showPrompt:true,variablePrompt:'第[计数]张'},
            {id:'output',type:'smart-image',x:700,y:80,images:[{url:'/test-image.svg',kind:'image'}],inputNodeIds:['loop','prompt'],loopSourceId:'loop',loopRoundIndex:2}
        ],
        connections:[{from:'prompt',to:'loop',kind:'input'},{from:'loop',to:'output',kind:'input'},{from:'prompt',to:'output',kind:'input'}]
    };
}

test('legacy canvas drops loop controls and their links, preserves outputs and saves the cleanup',async t=>{
    const {page,errors,record}=await fixture(t,'smart',false,{record:legacyGraph()});
    const result=await page.evaluate(async()=>{
        await saveCanvas({force:true});
        return {ids:nodes.map(n=>n.id),inputs:nodes.find(n=>n.id==='output').inputNodeIds,connections:canvas.connections,media:nodes.find(n=>n.id==='output').images[0].url,
            create:typeof createLoopNode,run:typeof runSmartCascadeFromLoop,render:typeof smartLoopBodyHtml};
    });
    assert.deepEqual(result,{ids:['prompt','output'],inputs:['prompt'],connections:[{from:'prompt',to:'output',kind:'input'}],media:'/test-image.svg',create:'undefined',run:'undefined',render:'undefined'});
    assert.equal(record.nodes.some(n=>n.type==='smart-loop'),false);
    assert.equal(await page.locator('.loop-smart-node').count(),0);
    await page.mouse.dblclick(1000,650);
    assert.equal(await page.locator('[data-create-type="loop"]').count(),0);
    await page.evaluate(()=>createNodeFromMenu('loop'));
    assert.equal(await page.evaluate(()=>nodes.length),2);
    await page.reload();await page.waitForFunction(()=>nodes.length===2);
    assert.equal(await page.locator('.loop-smart-node').count(),0);
    assert.deepEqual(errors,[]);
});

test('workflow import and member draft restoration retire loop nodes without losing generated media',async t=>{
    const {page,errors}=await fixture(t,'smart',false);
    const graph=legacyGraph();
    const imported=await page.evaluate(graph=>{
        insertSmartWorkflowIntoCanvas(graph);
        const output=nodes.find(n=>n.images?.length);
        return {types:nodes.map(n=>n.type),links:canvas.connections.length,inputs:output.inputNodeIds,media:output.images[0].url};
    },graph);
    assert.deepEqual(imported,{types:['smart-prompt','smart-image'],links:1,inputs:['prompt'],media:'/test-image.svg'});
    const restored=await page.evaluate(graph=>{
        restoreSmartMemberDraft({id:canvas.id,kind:'smart',...graph});
        return {ids:nodes.map(n=>n.id),inputs:nodes[1].inputNodeIds,links:canvas.connections,media:nodes[1].images[0].url};
    },graph);
    assert.deepEqual(restored,{ids:['prompt','output'],inputs:['prompt'],links:[{from:'prompt',to:'output',kind:'input'}],media:'/test-image.svg'});
    const exported=await page.evaluate(()=>{smartSelection.insertedNodes(nodes.map(n=>n.id));return selectedSmartWorkflowPayload();});
    assert.equal(exported.nodes.some(n=>n.type==='smart-loop'),false);
    assert.equal(exported.connections.length,1);
    assert.deepEqual(errors,[]);
});

test('ordinary cascade executes each step once, shares branch outputs and still stops after the current step',async t=>{
    const {page,errors}=await fixture(t,'smart',false);
    const result=await page.evaluate(async()=>{
        nodes=[{id:'root',type:'smart-image',x:0,y:0,images:[{url:'/test-image.svg',kind:'image'}]},
            ...['left','right','tail'].map((id,i)=>({id,type:'smart-image',x:350+i*300,y:100*i,images:id==='left'?[{url:'/test-image.svg',kind:'image'}]:[]}))];
        canvas.nodes=nodes;
        canvas.connections=[{from:'root',to:'left',kind:'input'},{from:'root',to:'right',kind:'input'},{from:'left',to:'tail',kind:'input'}];
        clearSelection();render();
        const generated=[],received=[];
        runCascadeStepIntoNode=async(source,target)=>{generated.push(source.id+'->'+target.id);return [{url:'/test-image.svg',kind:'image'}];};
        appendCascadeRefsToReceiver=(target,refs)=>{received.push(target.id);return refs;};
        const tail=nodes.find(n=>n.id==='tail');
        await runSmartCascade(tail);
        const first={generated:[...generated],received:[...received],running:smartCascadeAnyRunning()};
        generated.length=received.length=0;
        runCascadeStepIntoNode=async(source,target)=>{generated.push(source.id+'->'+target.id);requestSmartCascadeStop();return [{url:'/test-image.svg',kind:'image'}];};
        await runSmartCascade(tail);
        return {first,stopped:{generated,received,running:smartCascadeAnyRunning()}};
    });
    assert.deepEqual(result,{first:{generated:['root->left','left->tail'],received:['right'],running:false},stopped:{generated:['root->left'],received:[],running:false}});
    assert.deepEqual(errors,[]);
});
