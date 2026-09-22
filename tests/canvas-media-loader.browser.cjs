// Local, intercepted fixtures only. NODE_PATH may point at the bundled Playwright.
const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const script=fs.readFileSync(path.join(__dirname,'../static/js/canvas-media-loader.js'),'utf8');
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90"><rect width="120" height="90" fill="#a7c98a"/></svg>';
async function fixture(t) {
    const browser=await chromium.launch({channel:'chrome',headless:true});
    t.after(()=>browser.close());
    const page=await browser.newPage({viewport:{width:1000,height:800}}),pending=[],requests=[];
    let slow=true,fail=true;
    await page.route('http://media.test/**',async route=>{
        const url=new URL(route.request().url());requests.push(url.pathname);
        if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<main style="display:flex;flex-wrap:wrap;width:600px"></main><section style="position:relative" id="viewer"></section>'});
        if(url.pathname.startsWith('/thumb') && slow){pending.push(route);return;}
        const missing=url.pathname==='/failure' && fail;
        return route.fulfill({status:missing ? 404 : 200,contentType:missing ? 'text/plain' : 'image/svg+xml',body:missing ? 'missing image' : svg,headers:{'Cache-Control':'no-store'}});
    });
    await page.goto('http://media.test/');await page.addScriptTag({content:script});
    return {page,requests,async release(){slow=false;for(const route of pending.splice(0))await route.fulfill({contentType:'image/svg+xml',body:svg}).catch(()=>{});},recover(){fail=false;}};
}
test('visible thumbnails are bounded; foreground bypasses queue; closing resumes; offscreen stays deferred',async t=>{
    const f=await fixture(t),p=f.page;
    await p.evaluate(()=>{
        document.querySelector('main').innerHTML=Array.from({length:12},(_,i)=>`<img ${CanvasMediaLoader.imageAttributes('/thumb'+i)} style="width:120px;height:90px">`).join('')+
            `<img id="offscreen" ${CanvasMediaLoader.imageAttributes('/thumb-outside')} style="position:absolute;top:9000px;width:120px;height:90px">`;
    });
    await p.waitForFunction(()=>document.querySelectorAll('main img[src]').length===4);
    // Setting src in the renderer precedes Playwright's Node-side route callback.
    // Wait for that observation before asserting the actual request bound.
    for(let attempt=0;attempt<100 && f.requests.filter(u=>u.startsWith('/thumb')).length<4;attempt++){
        await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.equal(f.requests.filter(u=>u.startsWith('/thumb')).length,4);
    await p.evaluate(()=>document.querySelector('main img[src]').remove());
    await p.waitForFunction(()=>document.querySelectorAll('main img[src]').length===4);
    await p.evaluate(()=>{
        CanvasMediaLoader.begin('editor');
        const img=document.createElement('img');img.id='focus';document.querySelector('#viewer').append(img);
        CanvasMediaLoader.watch(img);img.src='/focus';
    });
    await p.waitForFunction(()=>document.querySelector('#focus').naturalWidth>0);
    assert.equal(await p.locator('main img[src]').count(),0);
    assert.equal(await p.locator('.canvas-media-status:visible').count(),0);
    await f.release();await p.evaluate(()=>CanvasMediaLoader.end('editor'));
    await p.waitForFunction(()=>[...document.querySelectorAll('main img:not(#offscreen)')].every(i=>i.complete && i.naturalWidth));
    assert.ok(!f.requests.includes('/thumb-outside'));
    assert.equal(await p.locator('.canvas-media-status').count(),0);
});
test('foreground failure is visible and retry recovers; switching removes stale listeners',async t=>{
    const f=await fixture(t),p=f.page;
    await p.evaluate(()=>{
        CanvasMediaLoader.begin('editor');
        const img=document.createElement('img');img.id='focus';document.querySelector('#viewer').append(img);
        CanvasMediaLoader.watch(img);img.src='/failure';
    });
    await p.getByText('素材加载失败，请重试').waitFor();
    f.recover();await p.getByRole('button',{name:'重试',exact:true}).click();
    await p.waitForFunction(()=>document.querySelector('#focus').naturalWidth>0);
    assert.equal(await p.locator('.canvas-media-status:visible').count(),0);
    await p.evaluate(()=>{
        CanvasMediaLoader.begin('editor');
        document.querySelector('#focus').dispatchEvent(new Event('error'));
    });
    assert.equal(await p.locator('.canvas-media-status').count(),0);
    await p.evaluate(()=>CanvasMediaLoader.end('editor'));
});
test('queued sources recheck identity and nested previews do not resume early',async t=>{
    const f=await fixture(t),p=f.page;
    await p.evaluate(()=>{
        CanvasMediaLoader.begin('a');CanvasMediaLoader.begin('b');
        document.querySelector('main').innerHTML=`<img ${CanvasMediaLoader.imageAttributes('/thumb-private')} width="120" height="90">`;
        window.MemberMediaUrl=()=>'';
        CanvasMediaLoader.end('a');
    });
    assert.equal(await p.locator('main img[src]').count(),0);
    await p.evaluate(()=>CanvasMediaLoader.end('b'));
    await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await p.locator('main img[src]').count(),0);
    assert.ok(!f.requests.includes('/thumb-private'));
});

test('selected video reuses its loaded poster and decodes the first frame while background is paused',async t=>{
    const {spawnSync}=require('node:child_process');
    const clip=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=green:s=160x90:r=10','-t','0.5','-c:v','libvpx','-f','webm','pipe:1'],{windowsHide:true});
    assert.equal(clip.status,0,clip.stderr?.toString() || 'ffmpeg required for local video fixture');
    const f=await fixture(t),p=f.page;
    await p.route('http://media.test/movie.webm',route=>route.fulfill({contentType:'video/webm',body:clip.stdout}));
    await f.release();
    await p.evaluate(()=>{document.querySelector('main').innerHTML=`<img id="poster" data-original-src="/movie.webm" ${CanvasMediaLoader.imageAttributes('/thumb-poster')} width="120" height="90">`;});
    await p.waitForFunction(()=>document.querySelector('#poster').naturalWidth>0);
    await p.evaluate(()=>{
        CanvasMediaLoader.begin('editor');
        const video=document.createElement('video');video.id='focus';video.muted=true;video.controls=true;
        document.querySelector('#viewer').append(video);
        CanvasMediaLoader.watch(video,video.parentElement,'/movie.webm');video.src='/movie.webm';
    });
    await p.waitForFunction(()=>document.querySelector('#focus').readyState>=2);
    assert.ok((await p.locator('#focus').getAttribute('poster')).endsWith('/thumb-poster'));
    assert.equal(await p.locator('.canvas-media-status:visible').count(),0);
    await p.evaluate(()=>document.querySelector('#focus').play());
    await p.waitForFunction(()=>document.querySelector('#focus').currentTime>0);
    await p.evaluate(()=>{CanvasMediaLoader.end('editor');document.querySelector('#focus').pause();});
});
