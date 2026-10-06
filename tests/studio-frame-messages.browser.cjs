const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {fixture:canvasFixture,origin:canvasOrigin}=require('./helpers/canvas-browser.cjs');
const origin='http://studio-messages.test',root=path.resolve(__dirname,'..');
const protocol=fs.readFileSync(path.join(root,'static/js/studio-frame-messages.js'),'utf8');
async function fixture(t,options={}){
    const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
    const page=await browser.newPage(),errors=[],codecRequests=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
        // Routing tests exercise two known frames regardless of the product's home default.
        localStorage.setItem('studio_active_page','online');
        window.CanvasSession={ready:Promise.resolve(),url:x=>x,socketUrl:x=>x,observeStatus(){}};
        window.WebSocket=class{static OPEN=1;static CONNECTING=0;constructor(url){this.url=url;this.readyState=1;window.sockets||=[];window.sockets.push(this);}close(){this.readyState=3;}};
    });
    await page.route('**/*',async route=>{
        const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();
        if(u.pathname==='/static/index.html'){
            let body=fs.readFileSync(path.join(root,'static/index.html'),'utf8');
            if(options.build)body=body.replace('<head>',`<head><meta name="frontend-build-id" content="${options.build}">`);
            return route.fulfill({contentType:'text/html',body});
        }
        if(u.pathname==='/static/js/studio-stats-codec.mjs'){
            codecRequests.push(u.href);
            if(options.beforeCodec)await options.beforeCodec(page);
            let body=fs.readFileSync(path.join(root,'static/js/studio-stats-codec.mjs'),'utf8');
            if(options.codecVersion)body=body.replace('export function parseMessage','function parseOriginal')+`\nexport function parseMessage(text){const data=parseOriginal(text);if(data)data.codecVersion=${JSON.stringify(options.codecVersion)};return data;}`;
            return route.fulfill({contentType:'text/javascript',body});
        }
        if(u.pathname.endsWith('.html'))return route.fulfill({contentType:'text/html',body:`<!doctype html><script>${protocol}</script><script>
            window.received=[];StudioFrameMessages.subscribe(['canvas_updated','cloud_status','asset_library_updated','studio-lang','studio-theme','studio-ui-scale','canvas-focus','providers-changed','maintenance_changed'],event=>received.push(event.data));
            window.StudioTheme={apply(theme){received.push({type:'sync-theme',theme});}};
            </script>`});
        if(u.pathname==='/api/maintenance/status')return route.fulfill({json:{mode:'normal',boot_id:'test'}});
        if(u.pathname.startsWith('/api/'))return route.fulfill({json:{enabled:false}});
        const filename=path.resolve(root,'.'+u.pathname);
        if(filename.startsWith(root+path.sep)&&fs.existsSync(filename))return route.fulfill({path:filename});
        return route.fulfill({status:404,body:''});
    });
    await page.goto(origin+'/static/index.html');await page.waitForFunction(()=>document.querySelector('iframe.active')?.contentWindow.received);
    await page.evaluate(()=>switchUI(null,'gpt-chat'));
    await page.waitForFunction(()=>document.getElementById('frame-gpt-chat').contentWindow.received);
    await page.waitForLoadState('networkidle');
    await page.evaluate(()=>document.querySelectorAll('iframe').forEach(f=>{if(f.contentWindow.received)f.contentWindow.received.length=0;}));
    return {page,errors,codecRequests};
}
async function counts(page,type){return page.evaluate(type=>['online','gpt-chat'].map(id=>document.getElementById('frame-'+id).contentWindow.received.filter(m=>m.type===type).length),type);}
test('production shell switches foreground routing and broadcasts library payloads',async t=>{
    const {page,errors}=await fixture(t);
    await page.evaluate(()=>{sockets[0].onmessage({data:JSON.stringify({type:'canvas_updated',canvas_id:'a'})});});
    await page.waitForFunction(()=>document.getElementById('frame-gpt-chat').contentWindow.received.some(m=>m.type==='canvas_updated'));
    assert.deepEqual(await counts(page,'canvas_updated'),[0,1]);
    await page.evaluate(()=>{switchUI(null,'online');sockets[0].onmessage({data:JSON.stringify({type:'canvas_updated',canvas_id:'b'})});
        for(const type of ['asset_library_updated'])sockets[0].onmessage({data:JSON.stringify({type,extra:{keep:true}})});});
    await page.waitForFunction(()=>document.getElementById('frame-online').contentWindow.received.some(m=>m.type==='asset_library_updated'));
    assert.deepEqual(await counts(page,'canvas_updated'),[1,1]);
    for(const type of ['asset_library_updated'])assert.deepEqual(await counts(page,type),[1,1]);
    assert.deepEqual(errors,[]);
});
test('production stats connection reconnects with original delay, retires old callbacks and restores presentation',async t=>{
    const {page,errors}=await fixture(t);
    await page.evaluate(async()=>{
        await Promise.all([connectStudioWebSocket(),connectStudioWebSocket()]);
        window.oldStats={open:sockets[0].onopen,message:sockets[0].onmessage,close:sockets[0].onclose,error:sockets[0].onerror};
        sockets[0].close();oldStats.close();
    });
    await page.waitForFunction(()=>!document.getElementById('service-disconnected').hidden);
    await page.waitForFunction(()=>sockets.length===2);
    await page.evaluate(()=>{sockets[1].onopen();oldStats.open();oldStats.close();oldStats.error();oldStats.message({data:'{"type":"stats","online_count":999}'});sockets[1].onmessage({data:'{"type":"stats","online_members":7}'});});
    assert.equal(await page.locator('#online-val').innerText(),'7');assert.equal(await page.locator('#service-disconnected').isVisible(),false);
    assert.equal(await page.evaluate(()=>sockets.length),2);assert.deepEqual(errors,[]);
});
test('malformed WebSocket envelopes do not repaint or prevent subsequent messages',async t=>{
    const {page,errors}=await fixture(t);
    await page.evaluate(()=>{for(const data of ['bad','null','[]','{"type":1}'])sockets[0].onmessage({data});sockets[0].onmessage({data:'{"type":"stats","online_count":3}'});});
    assert.equal(await page.locator('#online-val').innerText(),'3');assert.deepEqual(errors,[]);
});
test('exit while reconnect is queued removes socket timers and stale callbacks',async t=>{
    const {page,errors}=await fixture(t);
    await page.evaluate(()=>{window.closedCallback=sockets[0].onclose;sockets[0].close();closedCallback();window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}));closedCallback();});
    await page.waitForTimeout(900);assert.equal(await page.evaluate(()=>sockets.length),1);
    assert.equal(await page.locator('#service-disconnected').isVisible(),false);assert.deepEqual(errors,[]);
});
test('native ES module cold startup waits for decoder and preserves legacy start entry',async t=>{
    let checked=false;
    const {page,errors,codecRequests}=await fixture(t,{build:'cold-build',beforeCodec:async page=>{
        assert.equal(await page.evaluate(()=>window.sockets?.length||0),0);checked=true;
    }});
    await page.waitForFunction(()=>sockets.length===1);
    await page.evaluate(async()=>{await Promise.all([connectStudioWebSocket(),connectStudioWebSocket()]);sockets[0].onmessage({data:'{"type":"stats","online_members":12}'});});
    assert.equal(await page.locator('#online-val').innerText(),'12');assert.equal(await page.evaluate(()=>sockets.length),1);
    assert.equal(checked,true);assert.equal(codecRequests.length,1);assert.match(codecRequests[0],/__frontend_build=cold-build/);assert.deepEqual(errors,[]);
});
test('module-only build update changes native import URL without changing legacy bridge script',async t=>{
    const options={build:'build-one',codecVersion:'one'},f=await fixture(t,options);
    await f.page.evaluate(()=>sockets[0].onmessage({data:'{"type":"canvas_updated"}'}));
    await f.page.waitForFunction(()=>document.querySelector('iframe.active').contentWindow.received.some(m=>m.codecVersion==='one'));
    options.build='build-two';options.codecVersion='two';await f.page.reload();await f.page.waitForLoadState('networkidle');await f.page.waitForFunction(()=>sockets.length===1);
    assert.equal(f.codecRequests.length,2);
    assert.equal(new URL(f.codecRequests[0]).searchParams.get('__frontend_build'),'build-one');
    assert.equal(new URL(f.codecRequests[1]).searchParams.get('__frontend_build'),'build-two');
    await f.page.evaluate(()=>sockets[0].onmessage({data:'{"type":"stats","online_count":4}'}));
    await f.page.evaluate(()=>sockets[0].onmessage({data:'{"type":"canvas_updated"}'}));
    await f.page.waitForFunction(()=>document.querySelector('iframe.active').contentWindow.received.some(m=>m.codecVersion==='two'));
    assert.equal(await f.page.locator('#online-val').innerText(),'4');assert.deepEqual(f.errors,[]);
});
test('real postMessage accepts only parent/owned frames and API forwarding keeps payload',async t=>{
    const {page,errors}=await fixture(t);
    await page.evaluate(()=>document.getElementById('frame-online').contentWindow.eval("parent.postMessage({type:'providers-changed',extra:9}, location.origin)"));
    await page.waitForFunction(()=>document.getElementById('frame-gpt-chat').contentWindow.received.some(m=>m.type==='providers-changed'));
    assert.deepEqual(await counts(page,'providers-changed'),[1,1]);
    // A sibling is same-origin, but is not the receiving iframe's parent.
    await page.evaluate(()=>document.getElementById('frame-online').contentWindow.eval("parent.document.getElementById('frame-gpt-chat').contentWindow.postMessage({type:'studio-lang',lang:'spoof'}, location.origin)"));
    await page.evaluate(()=>window.postMessage({type:'providers-changed'},location.origin));
    await page.waitForTimeout(50);
    assert.deepEqual(await counts(page,'studio-lang'),[0,0]);assert.deepEqual(await counts(page,'providers-changed'),[1,1]);
    const channel=await page.evaluate(()=>{window.testChannel=new BroadcastChannel('studio-api');testChannel.postMessage({type:'providers-changed',extra:11});return true;});assert.equal(channel,true);
    await page.waitForFunction(()=>document.getElementById('frame-gpt-chat').contentWindow.received.filter(m=>m.type==='providers-changed').length===2);
    assert.deepEqual(await counts(page,'providers-changed'),[2,2]);
    assert.deepEqual(errors,[]);
});
test('cached exit resumes once, while permanent exit blocks late socket/API delivery',async t=>{
    const {page,errors}=await fixture(t);
    await page.evaluate(()=>window.oldSocketMessage=sockets[0].onmessage);
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
    await page.evaluate(()=>oldSocketMessage({data:JSON.stringify({type:'asset_library_updated'})}));await page.waitForTimeout(30);
    assert.deepEqual(await counts(page,'asset_library_updated'),[0,0]);
    await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
    await page.waitForFunction(()=>sockets.length===2);
    await page.evaluate(()=>sockets[1].onmessage({data:JSON.stringify({type:'asset_library_updated'})}));
    await page.waitForFunction(()=>document.getElementById('frame-gpt-chat').contentWindow.received.some(m=>m.type==='asset_library_updated'));
    assert.deepEqual(await counts(page,'asset_library_updated'),[1,1]);
    await page.evaluate(()=>{const old=sockets[1].onmessage;window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}));old({data:JSON.stringify({type:'asset_library_updated'})});window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
    await page.waitForTimeout(30);assert.deepEqual(await counts(page,'asset_library_updated'),[1,1]);assert.deepEqual(errors,[]);
});
for(const kind of ['classic','smart'])test(kind+' production iframe keeps message handling and theme after cache return',async t=>{
    const {page,errors}=await canvasFixture(t,kind);
    await page.route('**/message-host.html',route=>route.fulfill({contentType:'text/html',body:`<script>${protocol}</script><iframe id="child" src="/static/${kind==='classic'?'canvas':'smart-canvas'}.html?id=canvas-test"></iframe>`}));
    await page.goto(canvasOrigin+'/message-host.html');
    const child=await (await page.waitForSelector('#child')).contentFrame();
    await child.waitForFunction(()=>typeof handleCanvasUpdatedMessage==='function');
    if(kind==='classic')await child.evaluate(()=>openCanvas('canvas-test'));
    await child.waitForFunction(()=>typeof canvas!=='undefined'&&canvas?.id==='canvas-test');await page.waitForLoadState('networkidle');
    await child.evaluate(()=>{window.messageUpdates=[];handleCanvasUpdatedMessage=data=>messageUpdates.push(data);});
    await page.evaluate(()=>{
        StudioFrameMessages.send(document.getElementById('child'),{type:'canvas_updated',canvas_id:'a'});
        StudioFrameMessages.send(document.getElementById('child'),{type:'studio-theme',theme:'dark'});
    });
    await child.waitForFunction(()=>messageUpdates.length===1&&document.body.classList.contains('studio-theme-dark'));
    await child.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
    await page.evaluate(()=>StudioFrameMessages.send(document.getElementById('child'),{type:'canvas_updated',canvas_id:'paused'}));
    await page.waitForTimeout(30);assert.equal(await child.evaluate(()=>messageUpdates.length),1);
    await child.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
    await page.evaluate(()=>StudioFrameMessages.send(document.getElementById('child'),{type:'canvas_updated',canvas_id:'resumed'}));
    await child.waitForFunction(()=>messageUpdates.length===2);
    await child.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false})));
    await page.evaluate(()=>StudioFrameMessages.send(document.getElementById('child'),{type:'canvas_updated',canvas_id:'late'}));
    await page.waitForTimeout(30);assert.equal(await child.evaluate(()=>messageUpdates.length),2);assert.deepEqual(errors,[]);
});
