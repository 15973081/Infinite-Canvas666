const {readCanvasSource,functionSource} = require('./helpers/canvas-source.cjs');
// Real HTTP cache/CORS test: Playwright routing disables cache, so use two local origins.
const {test}=require('node:test'),assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
const source=readCanvasSource(path.join(root,'static/js/smart-canvas.js'),'utf8').replace(/\r\n/g,'\n');
function fn(name){return functionSource(source,name).replace(/\belement\(/g,'document.getElementById(');}
async function fixture(t){
    const hits=[],svg='<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="green"/></svg>';
    let allow=true,fail=false,delay=false;const held=[],gatewayHits=[];
    const objects=http.createServer((req,res)=>{
        hits.push({url:req.url,origin:req.headers.origin||null,method:req.method,member:req.headers['x-member-id'],workspace:req.headers['x-workspace-id']});
        // Match production TOS: application identity headers are not allowed.
        if(req.method==='OPTIONS'){res.writeHead(403);return res.end();}
        const send=()=>{res.setHeader('Cache-Control','private, max-age=600');res.setHeader('Content-Type',fail?'text/plain':'image/svg+xml');if(allow && req.headers.origin)res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.statusCode=fail?503:200;res.end(fail?'unavailable':svg);};
        if(delay)held.push(send);else send();
    });
    await new Promise(r=>objects.listen(0,'127.0.0.1',r));
    const objectUrl=`http://127.0.0.1:${objects.address().port}/image.svg?signature=unchanged`;
    const app=http.createServer((req,res)=>{
        const url=new URL(req.url,'http://app.test');
        if(url.pathname==='/api/auth/status'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({authenticated:true,mode:'members',member:{id:'alice',display_name:'Alice'}}));}
        if(url.pathname==='/api/auth/workspaces'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({workspaces:[{id:'space-test',name:'Test',permissions:['canvas.read','asset.read']}]}));}
        if(url.pathname==='/assets/cloud/sample.svg'){
            gatewayHits.push({member:url.searchParams.get('member'),workspace:url.searchParams.get('workspace'),cookie:req.headers.cookie});
            if(url.searchParams.get('member')!=='alice' || url.searchParams.get('workspace')!=='space-test' || req.headers.cookie!=='fixture_session=alice'){res.writeHead(403);return res.end();}
            res.writeHead(307,{'Location':objectUrl,'Cache-Control':'no-store'});return res.end();
        }
        res.setHeader('Set-Cookie','fixture_session=alice; HttpOnly; SameSite=Lax; Path=/');
        res.setHeader('Content-Type','text/html');res.end('<div id="imageEditStage" style="position:relative"><img id="previewCurrentImage"><img id="cropImage"><div id="panoramaStage"></div></div><button id="imageEditApplyBtn">应用</button><canvas id="export"></canvas><canvas id="gl"></canvas>');
    });
    await new Promise(r=>app.listen(0,'127.0.0.1',r));
    const browser=await chromium.launch({channel:'chrome',headless:true});
    t.after(async()=>{held.splice(0).forEach(send=>send());await browser.close();app.closeAllConnections();objects.closeAllConnections();await Promise.all([new Promise(r=>app.close(r)),new Promise(r=>objects.close(r))]);});
    const page=await browser.newPage();await page.goto(`http://127.0.0.1:${app.address().port}`);
    for(const name of ['member-session.js','member-media.js','canvas-media-loader.js','canvas-editable-image.js'])await page.addScriptTag({content:readCanvasSource(path.join(root,'static/js',name),'utf8')});
    await page.evaluate(()=>CanvasSession.ready);
    await page.addScriptTag({content:`
        let smartEditableResource=null,smartEditableJob=null,cropState={nodeId:'a'};
        // This fixture isolates CORS/cache behavior. Full-page editor regressions
        // exercise the real session tokens, targets, close and write receipts.
        let loaded=true;
        function capture(){return {};}
        function accept(){return true;}
        function clearSmartEditorPreviewImage(){const img=document.getElementById('previewCurrentImage');img.onload=null;img.onerror=null;img.removeAttribute('src');}
        function setSmartEditorPreviewSource(url){const img=document.getElementById('previewCurrentImage');img.crossOrigin='anonymous';img.src=url;}
        function retrySmartEditorPreview(source){if(panoramaState.enabled)loadPanoramaTexture(source);}
        let item={url:'/assets/cloud/sample.svg',kind:'image'};
        let panoramaState={enabled:true,loadToken:0,image:null};
        function currentEditImage(){return {node:{id:'a'},image:item};}
        window.exportsCaptured=[];
        async function uploadCroppedBlob(blob,name){
            const bitmap=await createImageBitmap(blob);
            window.exportsCaptured.push({name,width:bitmap.width,height:bitmap.height,type:blob.type});
            bitmap.close();return null; // Capture locally; never upload test media.
        }
        function clampOutpaint(){}
        function mediaKindForItem(value){return value.kind;}
        function displayMediaUrl(value){return MemberMediaUrl(value.url);}
        function updatePreviewMetaHint(){}
        function tr(value){return value;}
        function toast(value){window.lastToast=value;}
        async function ensurePanoramaRenderer(){return true;}
        function disposePanoramaTexture(){}
        function resizePanoramaViewer(){}
        function startPanoramaLoop(){}
        function applyPanoramaTexture(image){
            const gl=document.querySelector('#gl').getContext('webgl');
            if(!gl)throw new Error('WebGL unavailable');
            gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());
            gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
            window.textureError=gl.getError();return window.textureError===gl.NO_ERROR;
        }
        ${fn('clearSmartEditableImage')}
        ${fn('ensureSmartEditableImage')}
        ${fn('loadPanoramaTexture')}
        ${fn('applyImageCrop')}
        ${fn('applyImageOutpaint')}
    `});
    return {page,hits,gatewayHits,objectUrl,allow(v){allow=v;},fail(v){fail=v;},delay(v){delay=v;},release(){held.splice(0).forEach(send=>send());}};
}
test('old no-CORS cache reproduces broken crop; shared original fixes preview, crop export and WebGL without repeat download',async t=>{
    const f=await fixture(t),p=f.page;
    const before=await p.evaluate(async url=>{
        const plain=new Image();plain.src=url;document.body.append(plain);await plain.decode();
        const crop=new Image();crop.crossOrigin='anonymous';
        const result=await new Promise(resolve=>{crop.onload=()=>resolve('loaded');crop.onerror=()=>resolve('failed');crop.src=url;});
        return {plain:plain.naturalWidth,crop:result};
    },f.objectUrl);
    assert.equal(before.plain,200);assert.equal(before.crop,'failed');assert.equal(f.hits.length,1);
    const result=await p.evaluate(async()=>{
        CanvasMediaLoader.begin('editor');
        const [a,b]=await Promise.all([ensureSmartEditableImage(),ensureSmartEditableImage()]);
        await Promise.all([document.querySelector('#cropImage').decode(),document.querySelector('#previewCurrentImage').decode()]);
        const canvas=document.querySelector('#export');canvas.width=100;canvas.height=100;
        canvas.getContext('2d').drawImage(document.querySelector('#cropImage'),0,0,100,100,0,0,100,100);
        const exported=canvas.toDataURL();
        Object.assign(cropState,{x:0,y:0,w:100,h:50});
        await applyImageCrop();
        Object.assign(cropState,{w:300,h:150});
        await applyImageOutpaint();
        await loadPanoramaTexture('/asset');
        return {same:a.url===b.url,exported:exported.startsWith('data:image/png'),texture:window.textureError,shared:panoramaState.image===a.image};
    });
    assert.deepEqual(result,{same:true,exported:true,texture:0,shared:true});
    assert.deepEqual(await p.evaluate(()=>window.exportsCaptured),[
        {name:'image_crop.png',width:100,height:50,type:'image/png'},
        {name:'image_outpaint.png',width:300,height:150,type:'image/png'},
    ]);
    assert.equal(f.hits.length,2,'one CORS reload shared by all modes');assert.ok(f.hits[1].origin);
    assert.ok(f.hits.every(hit=>hit.method==='GET' && !hit.member && !hit.workspace),'no preflight or leaked member headers at object store');
    assert.deepEqual(f.gatewayHits,[{member:'alice',workspace:'space-test',cookie:'fixture_session=alice'}]);
    assert.equal(f.hits[0].url,f.hits[1].url,'signed target was never cache-busted');
    await p.evaluate(()=>clearSmartEditableImage());
    assert.equal(await p.locator('#cropImage').getAttribute('src'),null);
});
test('failed original disables apply, exposes retry, and recovers without reopening',async t=>{
    const f=await fixture(t),p=f.page;f.fail(true);
    await p.evaluate(()=>{CanvasMediaLoader.begin('editor');ensureSmartEditableImage().catch(()=>{});});
    await p.getByText('素材加载失败，请重试').waitFor();assert.equal(await p.locator('#imageEditApplyBtn').isDisabled(),true);
    f.fail(false);await p.getByRole('button',{name:'重试',exact:true}).click();
    await p.waitForFunction(()=>document.querySelector('#cropImage').naturalWidth===200);
    assert.equal(await p.locator('.canvas-media-status:visible').count(),0);
});
test('missing CORS remains blocked and a closed editor ignores late downloads',async t=>{
    const f=await fixture(t),p=f.page;f.allow(false);
    assert.equal(await p.evaluate(()=>ensureSmartEditableImage().then(()=>false,()=>true)),true);
    assert.equal(await p.locator('#cropImage').getAttribute('src'),null);
    f.allow(true);f.delay(true);
    await p.evaluate(()=>{window.pendingEdit=ensureSmartEditableImage({retry:true}).then(v=>v?'loaded':'ignored',()=> 'aborted');});
    await p.evaluate(()=>clearSmartEditableImage());f.release();
    assert.ok(['ignored','aborted'].includes(await p.evaluate(()=>window.pendingEdit)));
    assert.equal(await p.locator('#cropImage').getAttribute('src'),null);
});
