const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,origin}=require('./helpers/canvas-browser.cjs');
const audio={id:'audio',kind:'audio',url:'/assets/sound.wav',name:'金色的水位',created_at:1723521046};
const items=[audio,{id:'file',kind:'file',url:'/assets/hash',name:'041a82b5c12640099fead0d402b1c5ad'},
    {id:'image',kind:'image',url:'/test-image.svg',name:'参考图片'},
    {id:'video',kind:'video',url:'/external-video.mp4',name:'视频素材'}];
const library={libraries:[{id:'one',name:'默认资产库',categories:[{id:'images',name:'角色',type:'image',items}]}],active_library_id:'one'};

test('Smart sidebar shows typed previews with no audio/file/video original requests on hover',async t=>{
    const {page,errors,writes}=await fixture(t,'smart');
    await page.waitForLoadState('networkidle');
    await page.evaluate(()=>toggleAssetLibrary(true));
    await page.waitForLoadState('networkidle');
    await page.evaluate(library=>{setAssetLibraryFromResponse({library});applySmartAssetPanelWidth(450);},library);
    await page.locator('#assetPanel').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));
    const requests=[];page.on('request',r=>requests.push(new URL(r.url()).pathname));
    const preview=page.locator('#assetHoverPreview');
    for(const theme of ['dark']){

        for(const id of ['audio','file','video']){
            await page.locator(`[data-asset-id=${id}] .asset-thumb-wrap`).hover();
            await preview.waitFor({state:'visible'});
            assert.equal(await preview.locator('img,audio,video').count(),0);
            assert.equal(await preview.locator('.asset-file-preview svg').count(),1);
            const p=await preview.boundingBox(),panel=await page.locator('#assetPanel').boundingBox();
            assert.ok(p.width>200 && p.height>200 && p.x>=0 && p.x+p.width<=panel.x,'usable preview sits outside the sidebar');
            await page.mouse.move(30,30);
            await preview.waitFor({state:'hidden'});
        }
        const thumb=page.locator('[data-asset-id=audio] .asset-file-preview');
        assert.equal(await thumb.evaluate(el=>getComputedStyle(el).justifyContent),'center');
    }
    assert.equal(requests.some(path=>['/assets/sound.wav','/assets/hash','/external-video.mp4'].includes(path)),false);
    assert.equal(writes.length,0);
    assert.deepEqual(errors,[]);
});

test('Smart image hover retains loaded thumbnails and replaces failed media without broken image text',async t=>{
    const {page,errors}=await fixture(t,'smart');
    await page.waitForLoadState('networkidle');
    await page.evaluate(()=>toggleAssetLibrary(true));
    await page.waitForLoadState('networkidle');
    await page.evaluate(library=>setAssetLibraryFromResponse({library}),library);
    await page.locator('#assetPanel').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));
    await page.locator('[data-asset-id=image] .asset-thumb-wrap').hover();
    await page.waitForFunction(()=>document.querySelector('#assetHoverPreview img')?.naturalWidth===320);
    await page.evaluate(()=>showAssetHoverPreviewNow({clientX:1200,clientY:400},{url:'/broken-image.png',name:'损坏的图片',kind:'image'}));
    await page.waitForFunction(()=>document.querySelector('#assetHoverPreview .asset-file-preview')?.textContent.includes('暂无法预览'));
    assert.equal(await page.locator('#assetHoverPreview img').count(),0);
    assert.ok((await page.locator('#assetHoverPreview').boundingBox()).height>200);
    await page.mouse.down();await page.mouse.up();
    assert.equal(await page.locator('#assetHoverPreview').isVisible(),false,'drag/click hides the preview');
    assert.deepEqual(errors,[]);
});

test('Library audio detail loads on demand, supports playback, and releases audio on close',async t=>{
    const {page,errors,writes}=await fixture(t,'smart');
    await page.goto(origin+'/static/asset-manager.html');
    await page.waitForLoadState('networkidle');
    await page.evaluate(library=>{assetLibrary=library;activeAssetLibraryId='one';activeAssetCategoryId='images';selectedAssetId='audio';render();},library);
    assert.equal(await page.locator('[data-asset-card=file] img, [data-asset-card=file] video').count(),0,'generic files are not decoded as images');
    assert.equal(await page.locator('[data-asset-card=file] .asset-file-icon').count(),1);
    const requests=[];page.on('request',r=>requests.push(new URL(r.url()).pathname));
    // A valid PCM sample exercises native playback without external services.
    const wav=Buffer.alloc(44+16000);
    wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);
    wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);
    await page.route('**/assets/sound.wav',route=>route.fulfill({contentType:'audio/wav',body:wav}));
    for(const theme of ['dark']){

        const button=page.getByRole('button',{name:'试听音频',exact:true});
        await button.focus();
        assert.equal(await page.locator('.asset-audio-detail .detail-media-frame').count(),0,'audio uses its own detail layout');
        assert.equal(await page.locator('audio').count(),0,'no eager player is mounted');
        await button.click();
        const dialog=page.getByRole('dialog',{name:'音频预览'});
        await dialog.waitFor({state:'visible'});
        assert.equal(await dialog.locator('audio').getAttribute('preload'),'none');
        assert.equal(await dialog.locator('audio').getAttribute('autoplay'),null);
        await dialog.locator('audio').evaluate(async media=>{window.previewAudio=media;await media.play();});
        assert.equal(await page.evaluate(()=>previewAudio.paused),false);
        await page.keyboard.press('Escape');
        await dialog.waitFor({state:'detached'});
        assert.equal(await page.evaluate(()=>previewAudio.paused && !previewAudio.hasAttribute('src')),true);
        assert.equal(await button.evaluate(el=>el===document.activeElement),true);
    }
    assert.ok(requests.includes('/assets/sound.wav'));
    assert.equal(writes.length,0);
    assert.deepEqual(errors,[]);
});
