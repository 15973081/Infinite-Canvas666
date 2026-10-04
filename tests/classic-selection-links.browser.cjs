const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function setup(t){
    const f=await fixture(t,'classic',false);await f.page.waitForLoadState('networkidle');
    await f.page.evaluate(()=>{
        canvas.nodes=nodes=[{id:'a',type:'prompt',x:100,y:130,w:260,h:220,text:'A'},
            {id:'b',type:'prompt',x:500,y:130,w:260,h:220,text:'B'},
            {id:'g',type:'generator',x:820,y:130,w:260,h:220,model:'gpt-image-2'},
            {id:'h',type:'generator',x:820,y:500,w:260,h:220,model:'gpt-image-2'},
            {id:'far',type:'prompt',x:4000,y:4000,w:260,h:220,text:'placeholder'}];
        canvas.connections=connections=[{id:'ag',from:'a',to:'g'},{id:'bg',from:'b',to:'g'},{id:'ah',from:'a',to:'h'}];
        selected.clear();Object.assign(viewport,{x:0,y:0,scale:1});render();
    });await f.page.waitForTimeout(300);
    await f.page.evaluate(()=>{
        window.linkCheck={events:[],active:false,saves:0,undos:0,undo:undoStack.length,redo:redoStack.length};
        const port=portPoint,attribute=Element.prototype.setAttribute;
        portPoint=(id,kind,...args)=>{if(linkCheck.active)linkCheck.events.push('read:'+id+':'+kind);return port(id,kind,...args);};
        Element.prototype.setAttribute=function(name,...args){if(linkCheck.active&&name==='d')linkCheck.events.push('write');return attribute.call(this,name,...args);};
        const save=scheduleSave,undo=pushUndo;scheduleSave=(...args)=>{linkCheck.saves++;return save(...args);};pushUndo=(...args)=>{linkCheck.undos++;return undo(...args);};
        window.checkLiveLinks=()=>{
            const map=new Map(nodes.map(n=>[n.id,n]));let error=0;
            for(const c of connections){
                const a=portPoint(c.from,'out',map),b=portPoint(c.to,'in',map);
                const expected=connectionPathData(a.x,a.y,b.x,b.y).match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi).map(Number);
                for(const cls of ['link','link-hit']){
                    const actual=linksEl.querySelector(`path.${cls}[data-connection-id="${c.id}"]`).getAttribute('d').match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi).map(Number);
                    if(actual.length!==expected.length)throw Error('path shape');actual.forEach((v,i)=>error=Math.max(error,Math.abs(v-expected[i])));
                }
                const btn=linkControlsEl.querySelector(`[data-connection-id="${c.id}"]`);
                error=Math.max(error,Math.abs(parseFloat(btn.style.left)-(a.x+b.x)/2),Math.abs(parseFloat(btn.style.top)-(a.y+b.y)/2));
                if(btn.classList.contains('visible')!==isConnectionSelected(c))throw Error('selection visibility');
                if(btn.classList.contains('hover')!==(hoveredConnectionId===c.id))throw Error('hover visibility');
            }return error;
        };
    });return f;
}
async function refresh(page,ids=['a']){
    const events=await page.evaluate(ids=>{selected.clear();ids.forEach(id=>selected.add(id));linkCheck.events=[];linkCheck.active=true;
        try{refreshSelectionVisuals();}finally{linkCheck.active=false;}return linkCheck.events;},ids);
    const first=events.indexOf('write');assert(first>=0);assert(events.slice(first).every(e=>e==='write'),'all port reads precede path writes');
    assert.equal(new Set(events.slice(0,first)).size,first,'each live endpoint is read once per refresh');
    assert((await page.evaluate(()=>checkLiveLinks()))<.001);return events;
}
async function noWrites(f){
    assert.deepEqual(await f.page.evaluate(()=>({saves:linkCheck.saves,undos:linkCheck.undos,undo:undoStack.length-linkCheck.undo,redo:redoStack.length-linkCheck.redo})),{saves:0,undos:0,undo:0,redo:0});
    await f.page.waitForTimeout(1600);assert.equal(f.writes.filter(w=>w.method==='PUT').length,0);assert.deepEqual(f.errors,[]);
}
test('Classic selection reads unique current endpoints before writes, preserves DOM and empty/hover presentation',async t=>{
    const f=await setup(t);await f.page.evaluate(()=>{window.paths=[...linksEl.querySelectorAll('path')];window.cards=[...nodesEl.children];hoveredConnectionId='bg';});
    const events=await refresh(f.page);assert.deepEqual(events.slice(0,4),['read:a:out','read:g:in','read:b:out','read:h:in']);
    await refresh(f.page,[]);assert.equal(await f.page.locator('.link-delete.visible').count(),0);assert.equal(await f.page.locator('.link-delete.hover').count(),1);
    assert.equal(await f.page.evaluate(()=>paths.every(el=>el.isConnected)&&cards.every(el=>el.isConnected)),true);
    await noWrites(f);
});
test('Classic selection rereads changed ports, sizes and viewport without retaining coordinates',async t=>{
    const f=await setup(t);const before=await f.page.locator('path.link[data-connection-id="ag"]').getAttribute('d');
    await f.page.evaluate(()=>{const el=nodesEl.querySelector('[data-id="a"]');el.style.height='300px';el.querySelector('.port.out').style.top='30%';});
    await refresh(f.page);assert.notEqual(await f.page.locator('path.link[data-connection-id="ag"]').getAttribute('d'),before);
    await f.page.evaluate(()=>{nodes[0].x+=35;nodesEl.querySelector('[data-id="a"]').style.left=nodes[0].x+'px';Object.assign(viewport,{x:150,y:70,scale:.75});applyViewport();});
    await refresh(f.page);await noWrites(f);
});
test('Classic selection reconciles new/deleted/relinked edges and repairs detached controls',async t=>{
    const f=await setup(t);await f.page.evaluate(()=>{window.oldEdge=linksEl.querySelector('[data-connection-id="ag"]');linkControlsEl.querySelector('[data-connection-id="bg"]').remove();
        connections[0].to='h';connections.splice(2,1);connections.push({id:'bh',from:'b',to:'h'});});
    await refresh(f.page,['b']);assert.equal(await f.page.evaluate(()=>oldEdge===linksEl.querySelector('path.link[data-connection-id="ag"]')),true);
    assert.equal(await f.page.locator('[data-connection-id="ah"]').count(),0);assert.equal(await f.page.locator('path.link[data-connection-id="bh"]').count(),1);
    await noWrites(f);
});
test('Classic selection retains temp and knife layers and preserves ordinary dirty-node rendering',async t=>{
    const f=await setup(t);await f.page.evaluate(()=>{tempLink={x1:10,y1:20,x2:70,y2:80};knifeActive=true;knifeTrail=[{x:30,y:40},{x:70,y:80}];});
    await refresh(f.page);assert.equal(await f.page.locator('path.temp').count(),1);assert.equal(await f.page.locator('.knife-trail').count(),1);
    const normal=await f.page.evaluate(()=>{linkCheck.events=[];linkCheck.active=true;try{renderLinks(['a']);}finally{linkCheck.active=false;}return linkCheck.events;});
    assert(normal.slice(normal.indexOf('write')+1).some(e=>e.startsWith('read:')),'ordinary rendering keeps lazy per-edge reads');
    await f.page.evaluate(()=>{tempLink=null;knifeActive=false;knifeTrail=[];});await refresh(f.page);assert.equal(await f.page.locator('.temp,.knife-trail').count(),0);
    await noWrites(f);
});
test('Classic selection uses placeholder fallback and hydrated ports, preserves pending correction',async t=>{
    const f=await setup(t);await f.page.evaluate(()=>{connections.push({id:'fg',from:'far',to:'g'});});await refresh(f.page,['far']);
    const fallback=await f.page.locator('path.link[data-connection-id="fg"]').getAttribute('d');
    await f.page.evaluate(()=>{viewport.x=-3900;viewport.y=-3900;applyViewport();scheduleViewportRefresh(0);});await f.page.waitForTimeout(300);
    assert.equal(await f.page.locator('[data-id="far"] .port.out').count(),1);await refresh(f.page,['far']);
    assert.notEqual(await f.page.locator('path.link[data-connection-id="fg"]').getAttribute('d'),fallback);
    const pending=await f.page.evaluate(()=>{
        nodesEl.querySelector('[data-id="far"]').style.height='310px';refreshGeometryAfterLayout(['far']);
        const before=classicWorkspaceView.state.pendingGeometry;refreshSelectionVisuals();
        return {before,after:classicWorkspaceView.state.pendingGeometry};
    });assert.deepEqual(pending,{before:true,after:true});await refresh(f.page,['far']);
    await f.page.waitForTimeout(100);assert((await f.page.evaluate(()=>checkLiveLinks()))<.001);
    await noWrites(f);
});
test('Classic selection entry respects pause, document reset and final destruction without adding listeners',async t=>{
    const f=await setup(t);const state=await f.page.evaluate(()=>{
        const owner=classicWorkspaceView;owner.pause();linkCheck.events=[];linkCheck.active=true;owner.refreshSelectionLinks();const paused=linkCheck.events.length;
        owner.resume();nodes=canvas.nodes=nodes.map(n=>({...n}));canvas.id='replacement';owner.refreshSelectionLinks();const afterReplace=linksEl.querySelectorAll('path.link').length;
        owner.destroy();linkCheck.events=[];owner.refreshSelectionLinks();owner.bind();linkCheck.active=false;
        return {paused,afterReplace,afterDestroy:linkCheck.events.length,destroyed:owner.state.destroyed};
    });assert.deepEqual(state,{paused:0,afterReplace:3,afterDestroy:0,destroyed:true});assert.deepEqual(f.errors,[]);
});
