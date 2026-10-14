const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');

test('scoped connection updates preserve unrelated paths and avoid rescanning SVG groups',async t=>{
    const {page,errors}=await fixture(t,'smart',false);
    const result=await page.evaluate(()=>{
        nodes=Array.from({length:200},(_,index)=>({id:'n'+index,type:'smart-prompt',text:'节点',x:index*320,y:160,images:[]}));
        canvas.connections=nodes.slice(1).map((node,index)=>({from:nodes[index].id,to:node.id,kind:'input'}));render();cancelSmartGeometryRefresh();
        refreshConnectionLayer(['n100']);
        const svg=world.querySelector('.connection-layer'),unrelated=svg.querySelector('[data-conn-key="0"]'),oldPath=unrelated.outerHTML;
        const affected=svg.querySelector('[data-conn-key="99"]'),before=affected.querySelector('path').getAttribute('d');
        const original=svg.querySelectorAll;let scans=0;
        svg.querySelectorAll=function(selector){if(selector==='.smart-connection')scans++;return original.call(this,selector);};
        for(let index=0;index<30;index++){nodes[100].x+=1;refreshConnectionLayer(['n100']);}
        const observer=new MutationObserver(()=>{});observer.observe(svg,{attributes:true,childList:true,subtree:true});
        refreshConnectionLayer([]);const emptyMutations=observer.takeRecords().length;observer.disconnect();
        return {scans,emptyMutations,stable:svg.querySelector('[data-conn-key="0"]')===unrelated&&unrelated.outerHTML===oldPath,
            changed:affected.querySelector('path').getAttribute('d')!==before,count:original.call(svg,'.smart-connection').length};
    });
    assert.deepEqual(result,{scans:0,emptyMutations:0,stable:true,changed:true,count:199});assert.deepEqual(errors,[]);
});

test('connection cache survives insertion, removal, reorder, undo and document replacement',async t=>{
    const {page,errors}=await fixture(t,'smart',false);
    const checks=await page.evaluate(()=>{
        nodes=Array.from({length:4},(_,index)=>({id:'n'+index,type:'smart-prompt',text:'节点',x:index*320,y:160,images:[]}));
        canvas.connections=[{from:'n0',to:'n1',kind:'input'},{from:'n1',to:'n2',kind:'history'},{from:'n2',to:'n3',kind:'flow'}];render();cancelSmartGeometryRefresh();
        const actual=()=>[...world.querySelectorAll('.smart-connection')].map(group=>({key:group.dataset.connKey,path:group.querySelector('path').getAttribute('d'),stroke:group.querySelector('path').getAttribute('stroke')})).sort((a,b)=>a.key.localeCompare(b.key));
        const valid=()=>{
            const template=document.createElement('template');template.innerHTML=renderConnections();
            const expected=[...template.content.querySelectorAll('.smart-connection')].map(group=>({key:group.dataset.connKey,path:group.querySelector('path').getAttribute('d'),stroke:group.querySelector('path').getAttribute('stroke')})).sort((a,b)=>a.key.localeCompare(b.key));
            return JSON.stringify(actual())===JSON.stringify(expected);
        };
        const results=[];pushUndo();
        canvas.connections.splice(1,1);refreshConnectionLayer(['n0']);results.push(valid());
        canvas.connections.unshift({from:'n3',to:'n0',kind:'input'});refreshConnectionLayer([]);results.push(valid());
        canvas.connections.reverse();refreshConnectionLayer(['n2']);results.push(valid());
        canvas.connections[0].kind='history';refreshConnectionLayer(['n0']);results.push(valid());
        performUndo();cancelSmartGeometryRefresh();results.push(valid());
        nodes=JSON.parse(JSON.stringify(nodes));nodes[1].x+=100;refreshConnectionLayer(['n1']);results.push(valid());
        canvas={...canvas,id:'another-canvas',connections:[{from:'n3',to:'n1',kind:'flow'}]};render();cancelSmartGeometryRefresh();results.push(valid());
        world.querySelector('.connection-layer').remove();render();cancelSmartGeometryRefresh();nodes[3].y+=100;refreshConnectionLayer(['n3']);results.push(valid());
        return results;
    });
    assert.deepEqual(checks,Array(8).fill(true));assert.deepEqual(errors,[]);
});
