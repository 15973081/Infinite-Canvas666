// Real Chrome -> loopback HTTP/WebSocket -> disposable PostgreSQL schema.
const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const config=JSON.parse(fs.readFileSync(0,'utf8'));
async function main(){
    const browser=await chromium.launch({channel:'chrome',headless:true});const checks=[],contexts=[];
    try{
        const anon=await browser.newContext();contexts.push(anon);
        assert.equal((await anon.request.get(config.origin+'/static/js/canvas-core.js')).status(),401);checks.push('anonymous static resource rejected');
        async function actor(name){
            const context=await browser.newContext({viewport:{width:1280,height:900}});contexts.push(context);
            const login=await context.request.post(config.origin+'/api/auth/login',{data:{username:config[name],password:config.password}});
            assert.equal(login.status(),200,'isolated member login');
            const status=await (await context.request.get(config.origin+'/api/auth/status')).json();
            return {context,headers:{'X-Workspace-ID':config.workspace,'X-Member-ID':status.member.id,Origin:config.origin}};
        }
        const editor=await actor('editor'),viewer=await actor('viewer');
        const shell=await viewer.context.newPage(),errors=[],stats=[],sockets=[],failed=[],moduleResponses=[],consoleErrors=[];
        shell.on('pageerror',error=>errors.push(error.message));
        shell.on('requestfailed',request=>failed.push({path:new URL(request.url()).pathname,error:request.failure()?.errorText}));
        shell.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
        shell.on('response',response=>{if(response.url().includes('studio-stats-codec.mjs'))moduleResponses.push({status:response.status(),mime:response.headers()['content-type']});});
        shell.on('websocket',socket=>{sockets.push(new URL(socket.url()).pathname);if(new URL(socket.url()).pathname==='/ws/stats')socket.on('framereceived',event=>{try{stats.push(JSON.parse(String(event.payload)).type);}catch{}});});
        await shell.goto(config.origin+'/static/index.html?workspace='+config.workspace);
        await shell.waitForFunction(()=>window.CanvasSession?.context?.workspace?.id);
        await shell.waitForFunction(()=>document.querySelectorAll('iframe').length>0);
        const deadline=Date.now()+10000;
        while(!stats.includes('stats') && Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
        assert.ok(stats.includes('stats'),'native shell received real stats message '+JSON.stringify({stats,sockets,errors,failed,moduleResponses,consoleErrors}));
        checks.push('production shell native codec, real authenticated stats WebSocket and iframe startup');
        const statsConnections=()=>sockets.filter(path=>path==='/ws/stats').length;
        const connected=statsConnections();
        await shell.evaluate(()=>Promise.all([connectStudioWebSocket(),connectStudioWebSocket()]));
        assert.equal(statsConnections(),connected,'duplicate startup does not open another real socket');
        await shell.evaluate(()=>studioStatsConnection.pause());
        assert.equal(await shell.evaluate(()=>studioStatsConnection.isOpen()),false);
        await shell.evaluate(()=>studioStatsConnection.resume());
        const reconnectDeadline=Date.now()+10000;
        while(statsConnections()===connected && Date.now()<reconnectDeadline)await new Promise(resolve=>setTimeout(resolve,50));
        assert.equal(statsConnections(),connected+1,'resume creates exactly one new real socket');
        checks.push('real stats transport duplicate startup and pause/resume reconnect');
        for(const kind of ['classic','smart']){
            const response=await editor.context.request.post(config.origin+'/api/canvases',{headers:editor.headers,data:{kind,title:'Frontend acceptance '+kind}});
            assert.equal(response.status(),200,'create isolated canvas');const record=(await response.json()).canvas;
            const page=await viewer.context.newPage(),updates=[];
            page.on('pageerror',error=>errors.push(error.message));
            page.on('websocket',socket=>{if(new URL(socket.url()).pathname.startsWith('/ws/canvases/'))socket.on('framereceived',event=>{try{updates.push(JSON.parse(String(event.payload)));}catch{}});});
            await page.goto(config.origin+`/static/${kind==='classic'?'canvas':'smart-canvas'}.html?id=${record.id}&workspace=${config.workspace}`);
            if(kind==='classic'){await page.waitForFunction(()=>typeof openCanvas==='function');await page.evaluate(id=>openCanvas(id),record.id);}
            await page.waitForFunction(id=>typeof canvas!=='undefined' && canvas?.id===id,record.id);
            assert.equal(await page.evaluate(()=>window.MemberCanvasEdit.canEdit),false,'viewer stays read-only');
            const base=config.origin+'/api/canvases/'+record.id;
            const acquire=await editor.context.request.post(base+'/edit-lease/acquire',{headers:editor.headers,data:{}});
            assert.equal(acquire.status(),200,'real edit lease');const lease=await acquire.json();
            const proof={...editor.headers,'X-Canvas-Edit-Token':lease.edit_token,'X-Canvas-Generation':String(lease.generation),'X-Canvas-Revision':String(lease.revision)};
            const saved=await editor.context.request.put(base,{headers:proof,data:{base_revision:lease.revision,title:'Accepted '+kind,
                nodes:[{id:'acceptance-node',type:kind==='classic'?'prompt':'smart-prompt',text:'Persisted',prompt:'Persisted',x:10,y:10,w:320,h:240,images:[]}],connections:[]}});
            assert.equal(saved.status(),200,'real authorized save');
            await page.waitForFunction(title=>canvas?.title===title,'Accepted '+kind,{timeout:15000});
            await page.waitForFunction(()=>Boolean(document.querySelector('[data-id="acceptance-node"]')));
            const rendered=await page.locator('[data-id="acceptance-node"]').evaluate(element=>({text:element.textContent,
                fields:[...element.querySelectorAll('textarea,input,[contenteditable="true"]')].map(field=>field.value||field.textContent)}));
            assert.ok(rendered.text.includes('Persisted') || rendered.fields.some(value=>value.includes('Persisted')),'subscription update rendered saved prompt content');
            assert.ok(updates.some(value=>value.revision>record.revision),'native subscription received committed revision');
            const loaded=await viewer.context.request.get(base,{headers:viewer.headers});assert.equal(loaded.status(),200);
            assert.equal((await loaded.json()).canvas.title,'Accepted '+kind,'database-backed reload');
            const denied=await viewer.context.request.put(base,{headers:viewer.headers,data:{title:'forbidden',nodes:[],connections:[]}});
            assert.equal(denied.status(),403,'viewer write denied');
            await page.reload();if(kind==='classic'){await page.waitForFunction(()=>typeof openCanvas==='function');await page.evaluate(id=>openCanvas(id),record.id);}
            await page.waitForFunction(title=>typeof canvas!=='undefined' && canvas?.title===title,'Accepted '+kind);
            checks.push(`${kind}: real lease/save, cross-client WebSocket application, read-only permission and reload persistence`);
            await page.close();
        }
        assert.deepEqual(errors,[],'production pages have no uncaught errors');checks.push('production shell and both canvas pages without uncaught errors');
        return {checks,passed:checks.length,scope:'Real loopback HTTP and native Chrome WebSocket with disposable PostgreSQL; no provider or paid generation calls'};
    }finally{for(const context of contexts.reverse())await context.close();await browser.close();}
}
main().then(result=>process.stdout.write(JSON.stringify(result))).catch(error=>{console.error(error);process.exitCode=1;});
