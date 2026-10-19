const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');

test('smart edit reload preserves unchanged media nodes and applies server changes',async t=>{
    const {page,record,errors}=await fixture(t,'smart',true,{record:{nodes:[
        {id:'picture',type:'smart-image',images:[{url:'/test-image.svg',kind:'image',natural_w:320,natural_h:240}],x:100,y:100},
        {id:'video',type:'smart-image',images:[{url:'/test-video.mp4',kind:'video'}],x:500,y:100}
    ]}});
    await page.waitForTimeout(300);
    await page.evaluate(()=>{
        MemberCanvasEdit.setEditable(false);
        // Production mount retains the existing lease during its reload;
        // the generic fixture otherwise creates a new editable lease each time.
        MemberCanvasEdit.mount=async options=>{MemberCanvasEdit.options=options;};
        render();
        window.originalNodes=[...document.querySelectorAll('.image-node')];
        window.originalMedia=[...document.querySelectorAll('.image-node img,.image-node video')];
        window.originalData=nodes.slice();
    });
    await page.evaluate(()=>MemberCanvasEdit.options.reload());
    assert.deepEqual(await page.evaluate(()=>({
        nodes:originalNodes.map(el=>el===document.querySelector(`.image-node[data-id="${el.dataset.id}"]`)),
        media:originalMedia.map(el=>el.isConnected),
        data:originalData.map(node=>nodes.includes(node))
    })),{nodes:[true,true],media:[true,true],data:[true,true]});
    record.revision++;
    record.nodes[0].title='Server changed';
    record.nodes.push({id:'new',type:'smart-prompt',x:100,y:500,text:'New server node'});
    const revision=await page.evaluate(async()=> (await MemberCanvasEdit.options.reload()).revision);
    assert.equal(revision,record.revision);
    assert.deepEqual(await page.evaluate(()=>({
        title:nodes.find(n=>n.id==='picture').title,
        video:originalNodes[1]===document.querySelector('.image-node[data-id="video"]'),
        added:!!document.querySelector('.image-node[data-id="new"]')
    })),{title:'Server changed',video:true,added:true});
    record.nodes=record.nodes.filter(n=>n.id!=='picture');
    await page.evaluate(()=>MemberCanvasEdit.options.reload());
    assert.equal(await page.locator('.image-node[data-id="picture"]').count(),0);
    assert.deepEqual(errors,[]);
});
