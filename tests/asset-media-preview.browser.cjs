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
    const viewport=page.locator('[data-asset-view-library]');
    const initialHeight=(await viewport.boundingBox()).height;
    assert.equal(await viewport.locator('[data-asset-virtual-grid] > :first-child').getAttribute('data-asset-card'),'audio');
    await page.locator('[data-asset-card=file]').click();
    await page.locator('[data-asset-card=audio]').click();
    assert.equal((await viewport.boundingBox()).height,initialHeight);
    assert.equal(await page.getByRole('complementary',{name:'图片资产详情'}).isVisible(),true);
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
        await button.press('Enter');
        const dialog=page.getByRole('dialog',{name:'音频预览'});
        await dialog.waitFor({state:'visible'});
        assert.equal(await dialog.locator('audio').getAttribute('preload'),'none');
        assert.equal(await dialog.locator('audio').getAttribute('autoplay'),null);
        await dialog.locator('audio').evaluate(async media=>{window.previewAudio=media;await media.play();});
        assert.equal(await page.evaluate(()=>previewAudio.paused),false);
        await page.keyboard.press('Escape');
        await page.waitForFunction(()=>!previewAudio.isConnected);
        assert.equal(await page.evaluate(()=>previewAudio.paused && !previewAudio.hasAttribute('src')),true);
        await page.waitForFunction(() => document.activeElement?.matches('button[data-asset-preview="audio"]'));
    }
    assert.ok(requests.includes('/assets/sound.wav'));
    assert.equal(writes.length,0);
    assert.deepEqual(errors,[]);
});

test('image and workflow inspectors open on the right and keep separate collapse states',async t=>{
    const {page,errors}=await fixture(t,'classic',false);
    const image=items.find(item=>item.id==='image');
    const workflow={id:'workflow',name:'分镜流程',kind:'workflow',format:'json',url:'/fixtures/storyboard.json'};
    await page.route('**/api/asset-library',route=>route.fulfill({json:{library:{libraries:[{
        id:'default',name:'默认资产库',categories:[
            {id:'images',name:'分镜',type:'image',items:[image]},
            {id:'workflows',name:'创作流程',type:'workflow',items:[workflow]},
        ],
    }]}}}));
    await page.route('**/fixtures/storyboard.json',route=>route.fulfill({json:{nodes:[]}}));
    await page.goto(origin+'/static/asset-manager.html');

    const inspector=page.locator('#assetInspector');
    const toggle=page.locator('[data-inspector-toggle]');
    const libraryToggle=page.getByRole('button',{name:'折叠默认资产库',exact:true});
    const folder=page.locator('[data-asset-cat=images]');
    await folder.waitFor();
    await libraryToggle.press('Enter');
    const closedLibrary=page.getByRole('button',{name:'展开默认资产库',exact:true});
    assert.equal(await closedLibrary.getAttribute('aria-expanded'),'false');
    assert.equal(await closedLibrary.evaluate(el=>document.activeElement===el),true);
    assert.equal(await folder.isVisible(),false);
    assert.equal(await inspector.getByRole('textbox',{name:'直接修改名称'}).inputValue(),image.name);
    await closedLibrary.press('Enter');
    assert.equal(await folder.isVisible(),true);
    assert.equal(await folder.getAttribute('aria-current'),'true');
    await page.locator('[data-asset-lib=default]').press('Enter');
    assert.equal(await libraryToggle.getAttribute('aria-expanded'),'true');
    await folder.click();
    await page.locator('[data-asset-cat-rename]').click();
    await page.waitForFunction(()=>document.activeElement?.id==='assetTreeEditInput');
    await page.keyboard.press('Escape');

    const assertAlignedActions=async()=>{
        const row=page.locator('.asset-directory [aria-current="true"]');
        await row.hover();
        const name=await row.locator('.tree-row-name').boundingBox();
        const action=await page.locator('.asset-directory .tree-action-bar button').first().boundingBox();
        assert.ok(action.x>=name.x+name.width-1,'actions follow the directory name');
        assert.ok(Math.abs(name.y+name.height/2-action.y-action.height/2)<3,'actions share the directory row');
        const rows=await page.locator('.asset-directory .tree-action-bar button').evaluateAll(
            buttons=>new Set(buttons.map(button=>button.getBoundingClientRect().top)).size
        );
        assert.equal(rows,1);
    };
    for(const [tab,title] of [['图片资产','图片资产详情'],['工作流管理','工作流详情']]){
        await page.getByRole('button',{name:tab,exact:true}).click();
        await page.getByRole('complementary',{name:title}).waitFor();
        assert.equal(await toggle.getAttribute('aria-expanded'),'true');
        for(const width of [1024,1440,1920]){
            await page.setViewportSize({width,height:900});
            if(tab==='图片资产'){
                await page.locator('[data-asset-lib=default]').press('Enter');
                await assertAlignedActions();
                await folder.click();
            }
            const grid=await page.locator('.asset-content').boundingBox();
            const side=await inspector.boundingBox();
            assert.ok(side.x>=grid.x+grid.width && side.y===grid.y && side.height===grid.height);
            assert.ok(side.x+side.width<=width);
            assert.equal(await inspector.locator('.detail-scroll').evaluate(el=>el.scrollWidth>el.clientWidth),false);
            const card=page.locator('.asset-grid .asset-card').first();
            const thumb=await card.locator('.asset-thumb').evaluate(el=>{
                const {width,height}=el.getBoundingClientRect();
                return {width,height};
            });
            assert.ok(thumb.width<=185 && Math.abs(thumb.height-thumb.width*0.75)<1);
            await assertAlignedActions();
        }
        if(tab==='图片资产'){
            assert.equal(await inspector.getByRole('textbox',{name:'直接修改名称'}).inputValue(),image.name);
            await toggle.press('Enter');
            assert.equal(await inspector.isVisible(),false);
        }
    }
    assert.equal(await inspector.getByRole('textbox',{name:'直接修改名称'}).inputValue(),workflow.name);
    const download=page.waitForEvent('download');
    await inspector.getByRole('button',{name:'导出',exact:true}).click();
    assert.equal((await download).suggestedFilename(),'分镜流程.json');
    await page.getByRole('button',{name:'图片资产',exact:true}).click();
    await page.getByRole('button',{name:'查看详情',exact:true}).waitFor();
    assert.equal(await inspector.isVisible(),false);
    await toggle.press('Enter');
    await page.getByRole('complementary',{name:'图片资产详情'}).waitFor();
    assert.deepEqual(errors,[]);
});

test('canvas asset browsing keeps one refresh entry and returns to a valid page when results shrink',async t=>{
    const {page,errors}=await fixture(t,'smart');
    const canvas={id:'depth',title:'深度视频',kind:'smart',asset_source_state:'active'};
    const items=Array.from({length:64},(_,index)=>({
        id:'asset-'+index,
        name:index===0?'depth-video.mp4':'frame-'+index+'.png',
        kind:index===0?'video':'image',
        url:index===0?'/assets/depth-video.mp4':'/test-image.svg?frame='+index,
        canvas_id:canvas.id,canvas_title:canvas.title,canvas_kind:canvas.kind,
    }));
    let total=items.length;
    const offsets=[];
    await page.route('**/api/canvas-assets?**',route=>{
        const offset=Number(new URL(route.request().url()).searchParams.get('offset'));
        offsets.push(offset);
        return route.fulfill({json:{
            canvases:[{...canvas,asset_count:total}],
            categories:[{id:'all',count:total},{id:'smart',name:'智能画布',count:total,canvas_count:1}],
            limit:60,offset,total,has_more:offset+60<total,catalog_enabled:true,can_manage:true,
            items:items.slice(0,total).slice(offset,offset+60),
        }});
    });
    await page.goto(origin+'/static/asset-manager.html');
    await page.getByRole('button',{name:'画布资产',exact:true}).click();
    await page.locator('[data-canvas-asset-canvas=depth]').click();
    await page.locator('.content-heading').getByText('深度视频',{exact:true}).waitFor();
    await page.locator('.content-heading').getByText('64 个素材',{exact:true}).waitFor();
    await page.locator('.canvas-asset-card').first().getByRole('img',{name:'视频',exact:true}).waitFor();
    assert.equal(await page.locator('.manager-group-heading').count(),0);
    assert.equal(await page.locator('.canvas-asset-card .asset-card-meta').count(),0);

    const inspector=page.locator('#assetInspector');
    const toggle=page.locator('[data-inspector-toggle]');
    await inspector.waitFor();
    assert.equal(await toggle.getAttribute('aria-controls'),'assetInspector');
    assert.equal(await toggle.getAttribute('aria-expanded'),'true');
    for(const width of [1024,1440,1920]){
        await page.setViewportSize({width,height:900});
        const grid=await page.locator('.asset-content').boundingBox();
        const side=await inspector.boundingBox();
        assert.ok(side.x>=grid.x+grid.width && side.y===grid.y && side.height===grid.height);
        assert.ok(side.x+side.width<=width);
    }
    await page.locator('[data-canvas-asset-card=asset-1]').click();
    await inspector.getByText('frame-1.png',{exact:true}).waitFor();
    assert.ok(await inspector.getByRole('button',{name:'下载',exact:true}).isVisible());
    assert.ok(await inspector.getByRole('button',{name:'查看引用',exact:true}).isVisible());
    await inspector.getByRole('button',{name:'放大预览',exact:true}).press('Enter');
    const preview=page.getByRole('dialog',{name:'图片预览'});
    await preview.waitFor();
    await page.keyboard.press('Escape');
    await preview.waitFor({state:'hidden'});
    await toggle.press('Enter');
    assert.equal(await inspector.isVisible(),false);
    assert.equal(await toggle.getAttribute('aria-expanded'),'false');
    assert.equal(await toggle.evaluate(el=>document.activeElement===el),true);

    await page.setViewportSize({width:1024,height:768});
    const viewport=page.locator('.asset-content .content-scroll');
    const anchor=await viewport.evaluate(async el=>{
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        el.scrollTop=530;
        const top=el.getBoundingClientRect().top;
        const card=[...el.querySelectorAll('[data-canvas-asset-card]')].find(item=>item.getBoundingClientRect().bottom>top+1);
        return {id:card.dataset.canvasAssetCard,offset:card.getBoundingClientRect().top-top};
    });
    await toggle.press('Enter');
    await page.waitForFunction(({id,offset})=>{
        const viewport=document.querySelector('.asset-content .content-scroll');
        const card=viewport.querySelector('[data-canvas-asset-card="'+id+'"]');
        return card && Math.abs(card.getBoundingClientRect().top-viewport.getBoundingClientRect().top-offset)<2;
    },anchor);

    await page.getByRole('button',{name:'下一页',exact:true}).click();
    await page.getByText('第 2 / 2 页 · 共 64 个素材',{exact:true}).waitFor();
    const refresh=page.getByRole('button',{name:'刷新',exact:true});
    assert.equal(await refresh.count(),1);
    await refresh.click();
    await page.locator('#assetStatus').filter({hasText:'画布资产已刷新'}).waitFor();
    assert.equal(offsets.at(-1),60);
    assert.equal(await page.getByRole('navigation',{name:'素材分页'}).isVisible(),true);

    total=3;
    await refresh.click();
    await page.locator('#assetStatus').filter({hasText:'画布资产已刷新'}).waitFor();
    assert.deepEqual(offsets.slice(-2),[60,0]);
    assert.equal(await page.getByRole('navigation',{name:'素材分页'}).count(),0);
    assert.equal(await page.locator('.canvas-asset-footer').innerText(),'共 3 个素材');
    assert.deepEqual(errors,[]);
});
