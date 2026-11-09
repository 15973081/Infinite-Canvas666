const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');

test('refresh releases its private lease while refreshing another tab leaves the editor active',async t=>{
    let holder=null,generation=0;
    const status=()=>({canvas_id:'refresh',generation,revision:1,holder:holder?{id:'member',display_name:'成员',is_self:true}:null,
        server_time:new Date().toISOString(),expires_at:holder?new Date(Date.now()+60000).toISOString():null,heartbeat_seconds:10});
    const server=http.createServer((req,res)=>{
        res.setHeader('Content-Type','application/json');
        const send=(value,code=200)=>{res.statusCode=code;res.end(JSON.stringify(value));};
        if(req.url.startsWith('/static/js/')){
            res.setHeader('Content-Type','text/javascript');
            return res.end(fs.readFileSync(path.resolve('static/js',path.basename(req.url))));
        }
        if(req.url.endsWith('/acquire')){
            if(holder)return send({detail:{code:'canvas_locked'}},409);
            holder='private-'+(++generation);return send({...status(),edit_token:holder});
        }
        if(req.url.endsWith('/abandon')){
            if(req.headers['x-canvas-edit-token']!==holder)return send({},409);
            holder=null;return send({released:true,generation,revision:1});
        }
        if(req.url.endsWith('/renew'))return send(status());
        if(req.url.endsWith('/transfers'))return send({lease:status(),requests:[]});
        if(req.url.endsWith('/edit-lease'))return send(status());
        if(req.url.endsWith('/page-state'))return send({accepted:true,presence:{online_members:1,members:[]}});
        res.setHeader('Content-Type','text/html');
        res.end(`<!doctype html><html><head><meta charset="utf-8"></head><body>
            <script>window.CanvasSession={enabled:true,context:{member:{id:'member'},workspace:{id:'space',permissions:['canvas.read','canvas.edit']}}};</script>
            <script src="/static/js/canvas-edit-lease.js"></script><script src="/static/js/member-canvas-edit.js"></script>
            <script>MemberCanvasEdit.mount({id:'refresh',dirty:()=>false,snapshot:()=>({id:'refresh',kind:'classic',revision:1,nodes:[],connections:[]}),reload:async()=>({revision:1}),flush:async()=>true});</script>
            </body></html>`);
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
    const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());
    const context=await browser.newContext(),page=await context.newPage(),other=await context.newPage();
    const url='http://127.0.0.1:'+server.address().port+'/canvas';
    await page.goto(url);await page.getByRole('button',{name:'开始编辑',exact:true}).click();
    await page.waitForFunction(()=>MemberCanvasEdit.canEdit);
    await other.goto(url);await other.waitForFunction(()=>MemberCanvasEdit.active?.lease.status?.holder);
    await other.reload();assert.ok(holder);assert.equal(await page.evaluate(()=>MemberCanvasEdit.canEdit),true);
    await page.reload();
    await page.waitForFunction(()=>MemberCanvasEdit.active?.lease.status&&!MemberCanvasEdit.active.lease.status.holder);
    assert.equal(holder,null);
    await page.getByRole('button',{name:'开始编辑',exact:true}).click();
    await page.waitForFunction(()=>MemberCanvasEdit.canEdit);
    assert.equal(generation,2);
});
