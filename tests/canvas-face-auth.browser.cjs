const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');

for(const kind of ['classic','smart']) for(const media of ['image','audio']) test(`${kind}/${media}: ProjectName controls node and sidebar certification markers`,async t=>{
    const {page,errors,record,writes}=await fixture(t,kind,true);
    const provider={id:'volcengine',enabled:true,volcengine_project_name:'seedance-companyA',
        avatar_registration:{platform:'volcengine',supported:true,credentials_configured:true},
        image_models:[],video_models:[],chat_models:[]};
    const item={id:'certified',url:media==='audio'?'/assets/certified-audio.mp3':'/test-image.svg',name:'Certified '+media,kind:media,
        registrations:{volcengine:{status:'Active',asset_uri:'asset://verified',
            provider_id:'volcengine',project_name:'seedance-companyA'}}};
    const image={url:item.url,name:item.name,kind:media,asset_item_id:item.id,asset_library_id:'library',
        asset_uris:{volcengine:'asset://verified',volcengine_provider_id:'volcengine',volcengine_project_name:'seedance-companyA'}};
    record.nodes=kind==='classic'?[{...image,id:'certified-node',type:'image',x:150,y:130}]
        :[{id:'certified-node',type:'smart-image',x:150,y:130,images:[image]}];
    const library={libraries:[{id:'library',name:'Library',categories:[{id:'images',name:'Images',type:'image',items:[item]}]}]};
    await page.route('**/api/config',route=>route.fulfill({json:{api_providers:[provider],providers:[provider],image_models:[],video_models:[],chat_models:[]}}));
    await page.route('**/api/asset-library',route=>route.fulfill({json:{library}}));
    await page.reload();
    await page.waitForFunction(()=>typeof apiProviders!=='undefined'&&apiProviders[0]?.volcengine_project_name==='seedance-companyA');
    if(kind==='classic')await page.evaluate(()=>openCanvas('canvas-test'));
    await page.waitForFunction(()=>typeof canvas!=='undefined'&&canvas?.id==='canvas-test'&&nodes.some(n=>n.id==='certified-node'));
    await page.evaluate(async kind=>{
        if(kind==='classic')await loadCanvasAssetLibrary();else await loadAssetLibrary();
        if(kind==='classic')toggleCanvasAssetLibrary(true);else toggleAssetLibrary(true);
        render();
    },kind);
    await page.waitForLoadState('networkidle');
    const node=page.locator('[data-id="certified-node"]').first();
    await node.waitFor();
    const state=()=>page.evaluate(kind=>kind==='classic'?canvasFaceAuthState(nodes[0]):smartFaceAuthState(nodes[0].images[0]),kind);
    assert.equal((await state()).status,'Active');
    assert.ok(await node.evaluate(el=>el.classList.contains('face-verified')));
    if(kind==='smart')assert.equal(await node.locator('.smart-face-verified-badge').count(),1);
    else assert.notEqual(await node.locator('.image-preview-wrap').evaluate(el=>getComputedStyle(el,'::after').content),'none');
    const sidebar=page.locator(kind==='classic'?'#canvasAssetGrid':'#assetGrid');
    const badge=kind==='classic'?'.canvas-face-verified-badge':'.smart-face-verified-badge';
    assert.equal(await sidebar.locator(badge).count(),1,'certified audio and images carry the same sidebar marker');
    const out=path.resolve('.local/face-auth');fs.mkdirSync(out,{recursive:true});
    await page.screenshot({path:path.join(out,`${kind}-${media}-same-project.png`)});
    await page.evaluate(kind=>{apiProviders[0].volcengine_project_name='seedance-companyB';render();if(kind==='classic')renderCanvasAssetLibrary();else renderAssetLibrary();},kind);
    assert.equal((await state()).status,'ScopeMismatch');
    assert.ok(await node.evaluate(el=>!el.classList.contains('face-verified')));
    if(kind==='smart')assert.equal(await node.locator('.smart-face-verified-badge').count(),0);
    assert.equal(await sidebar.locator(badge).count(),0,'another ProjectName does not carry a verified marker');
    await page.evaluate(kind=>{apiProviders[0].volcengine_project_name='seedance-companyA';render();if(kind==='classic')renderCanvasAssetLibrary();else renderAssetLibrary();},kind);
    assert.equal((await state()).ready,true);
    assert.ok(await node.evaluate(el=>el.classList.contains('face-verified')));
    assert.equal(await sidebar.locator(badge).count(),1);
    for(const status of ['Processing','Failed']){
        await page.evaluate(({kind,status})=>{
            const libraries=kind==='classic'?canvasAssetLibraries():assetLibraries();
            libraries[0].categories[0].items[0].registrations.volcengine.status=status;
            render();if(kind==='classic')renderCanvasAssetLibrary();else renderAssetLibrary();
        },{kind,status});
        assert.equal((await state()).status,status);
        assert.ok(await node.evaluate(el=>!el.classList.contains('face-verified')));
        assert.equal(await sidebar.locator(badge).count(),0,`${status} is not verified`);
    }
    assert.ok(!writes.some(row=>/avatar|generate|video-task/.test(row.path)),'inspection makes no certification or generation request');
    assert.deepEqual(errors,[]);
});
