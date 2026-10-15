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
        return {types:nodes.map(n=>n.type),links:canvas.connections.length,inputs:output.inputNodeIds,sourceId:nodes.find(n=>n.type==='smart-prompt').id,media:output.images[0].url};
    },graph);
    assert.deepEqual(imported,{types:['smart-prompt','smart-image'],links:1,inputs:[imported.sourceId],sourceId:imported.sourceId,media:'/test-image.svg'});
    assert.notEqual(imported.sourceId,'prompt');
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

test('legacy one-click cascade is absent from connected ordinary generation nodes',async t=>{
    const {page,errors,writes}=await fixture(t,'smart',true,{secureOrigin:true});
    await page.evaluate(()=>{
        apiProviders=[{id:'p',enabled:true,has_key:true,image_models:['gpt-image-2']}];
        nodes=['root','middle','tail'].map((id,index)=>({id,type:'smart-image',generationKind:'image',x:100+index*300,y:180,images:index===0?[{url:'/test-image.svg',kind:'image'}]:[],promptDraftText:'模型生成要求',runSettings:{engine:'api',apiKind:'image',provider_id:'p',model:'gpt-image-2',resolution:'1k',ratio:'square',count:1}}));
        canvas.nodes=nodes;canvas.connections=[{from:'root',to:'middle',kind:'input'},{from:'middle',to:'tail',kind:'input'}];smartSelection.createdNode('tail');render();
    });
    await page.locator('.pixmax-native-generation-form').waitFor();
    assert.equal(await page.locator('#cascadeRunBtn,.cascade-run-btn').count(),0);
    assert.equal(await page.getByRole('button',{name:'一键运行',exact:true}).count(),0);
    assert.deepEqual(await page.evaluate(()=>({run:typeof runSmartCascade,stop:typeof requestSmartCascadeStop,plan:typeof smartCascadeGraphForTail})),{run:'undefined',stop:'undefined',plan:'undefined'});
    assert.equal(await page.getByRole('button',{name:'生成模型',exact:true}).count(),1);
    assert.equal(await page.locator('[data-native-generation-submit]').count(),1);
    assert.deepEqual(await page.evaluate(()=>({nodes:nodes.length,edges:canvas.connections.length})),{nodes:3,edges:2});
    assert.equal(writes.filter(write=>/canvas-(image|video)-tasks/.test(write.path)).length,0);assert.deepEqual(errors,[]);
});
