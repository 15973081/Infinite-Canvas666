const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function setup(t){
    const f=await fixture(t,'smart',true,{secureOrigin:true,permissions:['canvas.read','canvas.edit','asset.read']});
    const state={fail:false,holder:{id:'other',display_name:'另一位成员',is_self:false},requests:[]};
    await f.page.route('**/api/canvases/canvas-test/edit-lease**',route=>{
        state.requests.push(route.request().method()+' '+new URL(route.request().url()).pathname);
        return route.fulfill(state.fail?{status:503,json:{detail:'offline'}}:{json:{lease:{canvas_id:'canvas-test',generation:1,revision:1,holder:state.holder},requests:[]}});
    });
    await f.page.route('**/api/canvases/canvas-test/page-state',route=>route.fulfill({json:{presence:{online_members:1,members:[]}}}));
    const styles=await f.page.addStyleTag({url:'/static/css/member-canvas-edit.css'});
    await styles.evaluate(node=>document.head.insertBefore(node,document.head.querySelector('link[rel="stylesheet"]')));
    await f.page.addScriptTag({url:'/static/js/member-media.js'});
    await f.page.addScriptTag({url:'/static/js/member-media-preview.js'});
    await f.page.addScriptTag({url:'/static/js/member-canvas-edit.js'});
    await f.page.evaluate(()=>MemberCanvasEdit.mount({id:'canvas-test',dirty:()=>false,snapshot:()=>({id:'canvas-test',kind:'smart',revision:1,nodes:[{id:'preview',images:[{url:'/test-image.svg',kind:'image',name:'预览测试'}]}]}),reload:async()=>({revision:1}),flush:async()=>true}));
    await f.page.getByText('另一位成员 正在编辑',{exact:true}).waitFor();
    return {...f,state};
}
test('occupancy can recover without reloading, acquiring or writing the canvas',async t=>{
    const {page,state,errors}=await setup(t);
    await page.locator('.member-canvas-more > summary').click();
    state.fail=true;await page.getByRole('button',{name:'刷新占用状态',exact:true}).click();
    await page.getByText('占用状态待确认',{exact:true}).waitFor();
    state.fail=false;state.holder=null;
    await page.getByRole('button',{name:'刷新占用状态',exact:true}).click();
    await page.getByText('查看模式 · 无人编辑',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'开始编辑',exact:true}).isEnabled(),true);
    assert.equal(await page.evaluate(()=>MemberCanvasEdit.canEdit),false);
    assert.ok(state.requests.every(request=>request.startsWith('GET ')));
    assert.deepEqual(errors,[]);
});
test('smart canvas drafts use the Pixmax palette and remain reachable in narrow viewports',async t=>{
    const {page,errors}=await setup(t);
    await page.locator('.member-canvas-more > summary').click();
    await page.getByRole('button',{name:'自动草稿',exact:true}).click();
    const dialog=page.locator('dialog.member-canvas-drafts');await dialog.waitFor();
    assert.equal(await dialog.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(20, 20, 22)');
    assert.equal(await dialog.getByRole('button',{name:'关闭',exact:true}).evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(37, 37, 41)');
    fs.mkdirSync('.local/commercial-kickoff',{recursive:true});
    for(const width of [320,390,720,1280]){
        await page.setViewportSize({width,height:720});
        const bounds=await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,overflow:el.scrollWidth>el.clientWidth};});
        assert.ok(bounds.left>=0&&bounds.right<=width&&bounds.top>=0&&bounds.bottom<=720,JSON.stringify(bounds));
        assert.ok(Math.abs((bounds.left+bounds.right)/2-width/2)<1,'dialog is horizontally centered');
        assert.ok(Math.abs((bounds.top+bounds.bottom)/2-360)<1,'dialog is vertically centered');
        assert.equal(bounds.overflow,false);
        await page.screenshot({path:path.resolve('.local/commercial-kickoff/dialog-'+width+'.png')});
    }
    await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),false);
    assert.deepEqual(errors,[]);
});

test('read-only media preview shares the canvas palette without claiming edit access',async t=>{
    const {page,state,errors}=await setup(t);
    await page.getByRole('button',{name:'预览素材',exact:true}).click();
    const dialog=page.locator('.member-media-preview');await dialog.waitFor();
    assert.equal(await dialog.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(20, 20, 22)');
    assert.equal(await page.locator('.member-media-preview-stage').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(0, 0, 0)');
    await page.setViewportSize({width:320,height:720});
    const bounds=await dialog.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=320);
    await page.screenshot({path:path.resolve('.local/commercial-kickoff/preview-320.png')});
    assert.ok(state.requests.every(request=>request.startsWith('GET ')));
    assert.deepEqual(errors,[]);
});
