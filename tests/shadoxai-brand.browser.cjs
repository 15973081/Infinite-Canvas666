const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');

test('canvas fields survive export and draft restore with native dataset bindings',async t=>{
    const {page,errors}=await fixture(t,'smart',true,{record:{nodes:[
        {id:'model',type:'smart-model',x:100,y:100,images:[],shadoxaiSourceType:'BASE_3D',shadoxaiStoryboardSource:{shotNoList:[]}}
    ]}});
    const result=await page.evaluate(()=>{
        const loaded=JSON.parse(JSON.stringify(nodes[0]));
        const exported=canvasForStorage().nodes[0];
        restoreSmartMemberDraft({...canvas,kind:'smart',nodes:[{...loaded,shadoxaiStoryboardSource:{shotNoList:[{shotNo:'1'}]}}],connections:[]});
        const restored=JSON.parse(JSON.stringify(nodes[0]));
        const prompt='%%subject-ref(actor|PERSONAL|Actor|)%%';
        const template=document.createElement('template');
        template.innerHTML=ShadoxAIPromptTokens.html(prompt);
        return {loaded,exported,restored,prompt,dataset:template.content.firstElementChild.dataset.shadoxaiPromptToken};
    });
    for(const node of [result.loaded,result.exported,result.restored])assert.equal(node.shadoxaiSourceType,'BASE_3D');
    assert.deepEqual(result.restored.shadoxaiStoryboardSource,{shotNoList:[{shotNo:'1'}]});
    assert.equal(result.dataset,result.prompt);
    assert.deepEqual(errors,[]);
});
