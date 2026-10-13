const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {fixture}=require('./helpers/canvas-browser.cjs');

test('reference canvas creates all eight node types, context actions and redo preserve document state',async t=>{
    const {page,errors}=await fixture(t,'smart',true);
    await page.evaluate(()=>Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}}));
    await page.mouse.click(800,400,{button:'right'});
    await page.locator('[data-context-action="add"]').click();
    assert.equal(await page.locator('#createMenu [role="menuitem"]').count(),8);
    await page.locator('[data-create-type="director"]').click();
    assert.equal(await page.evaluate(()=>nodes[0].type),'smart-director');
    await page.evaluate(()=>{performUndo();redoSmartCanvas();});
    assert.equal(await page.evaluate(()=>nodes.length),1);
    for(const kind of ['editor','storyboard','audio','model'])await page.evaluate(kind=>{createMenuPoint={x:600,y:400};createNodeFromMenu(kind);},kind);
    assert.equal(await page.evaluate(()=>nodes.length),5);
    assert.equal(await page.evaluate(()=>getComputedStyle(shell).backgroundColor),'rgb(0, 0, 0)');
    await page.evaluate(()=>MemberCanvasEdit.setEditable(false));
    await page.evaluate(()=>createNodeFromMenu('director'));
    assert.equal(await page.evaluate(()=>nodes.length),5);
    assert.deepEqual(errors,[]);
});

test('original director and editing components mount locally and save their documents on close',async t=>{
    const {page,errors}=await fixture(t,'smart',true);
    await page.evaluate(()=>Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}}));
    for(const kind of ['director','editor']){
        await page.evaluate(()=>{
            if(document.querySelector('.test-member-shell'))return;
            const header=document.createElement('nav');header.className='test-member-shell';header.textContent='完整页面账号栏';header.style.cssText='position:fixed;top:0;left:0;right:0;height:56px;z-index:100000;background:white';document.body.appendChild(header);
            const footer=document.createElement('section');footer.textContent='协作工具条';footer.style.cssText='position:fixed;bottom:18px;left:30%;width:600px;height:54px;z-index:3000;background:white';document.body.appendChild(footer);
        });
        await page.evaluate(kind=>{const node=createSmartStudioNode(kind,{x:600,y:350});openSmartStudio(node.id);},kind);
        const frame=page.frameLocator('.pixmax-editor-overlay iframe');
        await frame.locator(kind==='director'?'.stage-editor':'.video-editor').waitFor({timeout:30000});
        if(kind==='director'){
            await frame.getByRole('button',{name:'添加几何体',exact:true}).click();
            await frame.getByRole('button',{name:'正方体',exact:true}).click();
        }
        await page.screenshot({path:path.resolve('output/pixmax-'+kind+'.png')});
        await frame.getByRole('button',{name:'关闭编辑器',exact:true}).click();
        await page.waitForFunction(()=>!smartStudioSession);
        assert.equal(await page.evaluate(kind=>nodes.find(node=>node.type==='smart-'+kind).studioDocument.version,kind),kind==='director'?1:2);
        if(kind==='director'){
            assert.equal(await page.evaluate(()=>nodes.find(node=>node.type==='smart-director').studioDocument.nodes.length),1);
            await page.evaluate(()=>performUndo());
            assert.equal(await page.evaluate(()=>nodes[0].studioDocument),undefined);
            await page.evaluate(()=>redoSmartCanvas());
            assert.equal(await page.evaluate(()=>nodes[0].studioDocument.nodes.length),1);
        }
    }
    assert.deepEqual(errors,[]);
});

test('storyboard shots persist and export connected prompt nodes',async t=>{
    const {page,errors}=await fixture(t,'smart',true);
    await page.evaluate(()=>Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}}));
    await page.evaluate(()=>{const node=createSmartStudioNode('storyboard',{x:450,y:350});openSmartStudio(node.id);});
    await page.getByRole('textbox',{name:'镜头 1 画面描述',exact:true}).fill('球员从左侧跑入画面');
    await page.locator('[data-story-step="2"]').click();
    await page.locator('[data-story-export]').click();
    const result=await page.evaluate(async()=>{await saveCanvas({force:true});return {shots:nodes[0].shots,prompt:nodes[1].text,connections:canvas.connections,stored:canvasForStorage().nodes};});
    assert.equal(result.shots[0].description,'球员从左侧跑入画面');
    assert.match(result.prompt,/球员/);assert.equal(result.connections.length,1);
    assert.equal(result.stored[0].shots.length,1);assert.deepEqual(errors,[]);
});

test('director capture uploads a real image and adds a connected result; scene survives reopening',async t=>{
    const {page,errors}=await fixture(t,'smart',false);
    await page.evaluate(()=>{
        window.capturedFiles=[];
        uploadFiles=async files=>{capturedFiles.push(...files.map(file=>({type:file.type,size:file.size})));return files.map(file=>({url:'/test-image.svg',name:file.name,kind:'image'}));};
        const node=createSmartStudioNode('director',{x:400,y:350});openSmartStudio(node.id);
    });
    let frame=page.frameLocator('.pixmax-editor-overlay iframe');
    await frame.getByRole('button',{name:'添加几何体',exact:true}).click();
    await frame.getByRole('button',{name:'正方体',exact:true}).click();
    await frame.getByRole('button',{name:'截图',exact:true}).click();
    await page.waitForFunction(()=>capturedFiles.length===1 && nodes.length===2);
    assert.match((await page.evaluate(()=>capturedFiles[0])).type,/image\//);
    assert.ok(await page.evaluate(()=>capturedFiles[0].size>1000));
    assert.equal(await page.evaluate(()=>canvas.connections.length),1);
    await frame.getByRole('button',{name:'关闭编辑器',exact:true}).click();
    await page.waitForFunction(()=>!smartStudioSession);
    await page.evaluate(async()=>{await saveCanvas({force:true});await loadCanvas();openSmartStudio(nodes.find(node=>node.type==='smart-director').id);});
    frame=page.frameLocator('.pixmax-editor-overlay iframe');
    await frame.locator('.stage-editor').waitFor();
    assert.match(await frame.locator('body').innerText(),/立方体/);
    await frame.getByRole('button',{name:'关闭编辑器',exact:true}).click();
    await page.waitForFunction(()=>!smartStudioSession);assert.deepEqual(errors,[]);
});

test('director loads local characters and action clips and persists the animation timeline',async t=>{
    const {page,errors}=await fixture(t,'smart',false);
    const resources=[];page.on('response',response=>{if(response.url().includes('/previs/'))resources.push({url:response.url(),status:response.status()});});
    await page.evaluate(()=>{const node=createSmartStudioNode('director',{x:400,y:350});openSmartStudio(node.id);});
    const frame=page.frameLocator('.pixmax-editor-overlay iframe');
    await frame.getByRole('button',{name:'添加角色',exact:true}).click();
    await frame.getByRole('button',{name:'行走',exact:true}).click();
    await frame.getByRole('button',{name:'选择动作',exact:true}).click();
    await frame.getByRole('button',{name:/空中深蹲/}).click();
    await frame.getByRole('button',{name:'应用动作',exact:true}).click();
    await frame.getByRole('button',{name:'播放',exact:true}).click();
    await frame.getByRole('button',{name:'暂停',exact:true}).waitFor();
    await frame.getByRole('button',{name:'关闭编辑器',exact:true}).click();await page.waitForFunction(()=>!smartStudioSession);
    const document=await page.evaluate(()=>nodes[0].studioDocument);
    assert.equal(document.nodes[0].kind,'character');assert.match(document.nodes[0].resource.url,/^\/static\/vendor\/pixmax\//);
    assert.equal(document.animation.characterActionClips.length,1);
    assert.ok(resources.some(resource=>resource.url.endsWith('x-bot.fbx')&&resource.status===200));
    assert.ok(resources.some(resource=>resource.url.endsWith('.anim')&&resource.status===200));
    assert.deepEqual(errors,[]);
});

test('editing imports canvas media and persists source connections and clips',async t=>{
    const {page,errors}=await fixture(t,'smart',false);
    await page.route('**/clip.webm',route=>route.fulfill({contentType:'video/webm',path:path.resolve('tests/fixtures/smart-preview.webm')}));
    await page.evaluate(()=>{createNode(100,200,[{url:'/clip.webm',kind:'video',name:'球员视频'}],{select:false});const editor=createSmartStudioNode('editor',{x:700,y:350});openSmartStudio(editor.id);});
    const frame=page.frameLocator('.pixmax-editor-overlay iframe');
    await frame.getByRole('button',{name:'画布选择',exact:true}).click();
    await frame.getByRole('checkbox').check();
    await frame.getByRole('button',{name:'添加所选素材',exact:true}).click();
    await frame.getByText('球员视频',{exact:true}).first().waitFor();
    await page.waitForFunction(()=>nodes.find(node=>node.type==='smart-editor').studioDocument?.clips?.length===1);
    await frame.getByRole('button',{name:'关闭编辑器',exact:true}).click();
    await page.waitForFunction(()=>!smartStudioSession);
    assert.equal(await page.evaluate(()=>canvas.connections.length),1);
    const document=await page.evaluate(()=>nodes.find(node=>node.type==='smart-editor').studioDocument);
    assert.equal(document.clips.length,1);assert.match(JSON.stringify(document),/clip.webm/);
    assert.deepEqual(errors,[]);
});

test('original editing exporter encodes a real MP4 and returns it to the canvas',async t=>{
    const {page,errors}=await fixture(t,'smart',false,{secureOrigin:true});
    await page.route('**/clip.webm',route=>route.fulfill({contentType:'video/webm',path:path.resolve('tests/fixtures/smart-preview.webm')}));
    await page.evaluate(()=>{
        window.exportedFiles=[];
        uploadFiles=async files=>{
            for(const file of files){
                const video=document.createElement('video'),url=URL.createObjectURL(file);video.src=url;
                await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(new Error('Exported MP4 is not decodable'));});
                exportedFiles.push({name:file.name,size:file.size,type:file.type,duration:video.duration,width:video.videoWidth,height:video.videoHeight});
                URL.revokeObjectURL(url);
            }
            return files.map(file=>({url:'/clip.webm',kind:'video',name:file.name}));
        };
        const source=createNode(100,200,[{url:'/clip.webm',kind:'video',name:'原片'}],{select:false});
        const editor=createSmartStudioNode('editor',{x:700,y:350});connectInputNode(source.id,editor.id);openSmartStudio(editor.id);
    });
    const frame=page.frameLocator('.pixmax-editor-overlay iframe');
    await page.waitForFunction(()=>nodes.find(node=>node.type==='smart-editor').studioDocument?.clips?.length===1);
    await frame.getByRole('button',{name:'导出到画布',exact:true}).click();
    await page.waitForFunction(()=>exportedFiles.length===1,{},{timeout:45000});
    const file=await page.evaluate(()=>exportedFiles[0]);assert.equal(file.type,'video/mp4');assert.ok(file.size>0);assert.ok(file.duration>0);assert.ok(file.width>0&&file.height>0);
    await page.waitForFunction(()=>nodes.length===3);
    await frame.getByRole('button',{name:'关闭编辑器',exact:true}).click();await page.waitForFunction(()=>!smartStudioSession);
    assert.equal(await page.evaluate(()=>canvas.connections.length),2);assert.deepEqual(errors,[]);
});

test('editor restores persisted clips with the current member playback URL and keeps edits across reopening',async t=>{
    const {page,errors}=await fixture(t,'smart',false);
    await page.route('**/clip.webm?**',route=>route.fulfill({contentType:'video/webm',path:path.resolve('tests/fixtures/smart-preview.webm')}));
    await page.evaluate(()=>{
        window.playbackMember='first';
        window.MemberMediaUrl=url=>url?.startsWith('/clip.webm')?url+'?member='+playbackMember:url;
        const source=createNode(100,200,[{url:'/clip.webm',kind:'video',name:'恢复素材'}],{select:false});
        const editor=createSmartStudioNode('editor',{x:700,y:350});connectInputNode(source.id,editor.id);openSmartStudio(editor.id);
    });
    let frame=page.frameLocator('.pixmax-editor-overlay iframe');
    await frame.getByRole('spinbutton',{name:'旋转',exact:true}).fill('25');
    await frame.getByRole('spinbutton',{name:'旋转',exact:true}).press('Enter');
    await frame.getByRole('button',{name:'关闭编辑器',exact:true}).click();await page.waitForFunction(()=>!smartStudioSession);
    const saved=await page.evaluate(()=>nodes[1].studioDocument);
    assert.equal(saved.clips.length,1);assert.equal(saved.clips[0].resource.url,'/clip.webm');
    await page.evaluate(()=>{playbackMember='second';openSmartStudio(nodes[1].id);});
    frame=page.frameLocator('.pixmax-editor-overlay iframe');
    await frame.getByRole('button',{name:'恢复素材 0.30s',exact:true}).waitFor();
    await frame.getByRole('button',{name:'恢复素材 0.30s',exact:true}).click();
    assert.equal(Number(await frame.getByRole('spinbutton',{name:'旋转',exact:true}).inputValue()),25);
    await frame.getByRole('spinbutton',{name:'旋转',exact:true}).fill('35');
    await frame.getByRole('spinbutton',{name:'旋转',exact:true}).press('Tab');
    await page.evaluate(async()=>{const closing=closeSmartStudio();window.sameClosingPromise=closeSmartStudio()===closing;await saveCanvas({force:true});});
    assert.equal(await page.evaluate(()=>sameClosingPromise&&!smartStudioSession),true);
    await page.evaluate(()=>openSmartStudio(nodes[1].id));
    frame=page.frameLocator('.pixmax-editor-overlay iframe');
    await frame.getByRole('button',{name:'恢复素材 0.30s',exact:true}).click();
    assert.equal(Number(await frame.getByRole('spinbutton',{name:'旋转',exact:true}).inputValue()),35);
    await frame.getByRole('button',{name:'关闭编辑器',exact:true}).click();await page.waitForFunction(()=>!smartStudioSession);
    assert.equal(await page.evaluate(()=>nodes[1].studioDocument.clips.length),1);assert.deepEqual(errors,[]);
});

test('losing the editing lease closes a workbench and refuses delayed exports',async t=>{
    const {page,errors,writes}=await fixture(t,'smart',true);
    await page.evaluate(()=>{
        Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});
        const node=createSmartStudioNode('director',{x:400,y:350});openSmartStudio(node.id);
    });
    await page.frameLocator('.pixmax-editor-overlay iframe').locator('.stage-editor').waitFor();
    await page.evaluate(()=>MemberCanvasEdit.setEditable(false));
    await page.waitForFunction(()=>!smartStudioSession);
    assert.equal(await page.evaluate(()=>nodes.length),1);
    const before=writes.length;
    await page.evaluate(()=>createNodeFromMenu('director'));
    assert.equal(writes.length,before);assert.deepEqual(errors,[]);
});

test('native editor upload creates a source card, removing it clears clips and fresh canvas selection sees exported media',async t=>{
    const {page,errors}=await fixture(t,'smart',false,{secureOrigin:true});
    await page.route('**/clip.webm',route=>route.fulfill({contentType:'video/webm',path:path.resolve('tests/fixtures/smart-preview.webm')}));
    await page.evaluate(()=>{
        uploadFiles=async files=>files.map(file=>({url:'/clip.webm',kind:'video',name:file.name}));
        const editor=createSmartStudioNode('editor',{x:700,y:350});openSmartStudio(editor.id);
    });
    const frame=page.frameLocator('.pixmax-editor-overlay iframe');
    const chooser=page.waitForEvent('filechooser');await frame.getByRole('button',{name:'本地上传',exact:true}).click();await (await chooser).setFiles(path.resolve('tests/fixtures/smart-preview.webm'));
    await page.waitForFunction(()=>nodes.length===2&&nodes[0].studioDocument?.clips?.length===1);
    assert.equal(await page.evaluate(()=>canvas.connections[0].to),await page.evaluate(()=>nodes[0].id));
    await frame.getByRole('button',{name:'导出到画布',exact:true}).click();await page.waitForFunction(()=>nodes.length===3);
    await frame.getByRole('button',{name:'smart-preview.webm',exact:true}).click({button:'right'});
    await frame.getByRole('menuitem',{name:'删除素材',exact:true}).click();
    await page.waitForFunction(()=>nodes[0].studioDocument.clips.length===0);
    assert.equal(await page.evaluate(()=>canvas.connections.filter(e=>e.to===nodes[0].id).length),0);
    await frame.getByRole('button',{name:'画布选择',exact:true}).click();
    await frame.locator('[role="checkbox"]').first().waitFor();
    assert.equal(await frame.locator('[role="checkbox"]').count(),2);
    await frame.getByRole('button',{name:'取消',exact:true}).click();
    await frame.getByRole('button',{name:'关闭编辑器',exact:true}).click();await page.waitForFunction(()=>!smartStudioSession);
    assert.equal(await page.evaluate(()=>nodes[0].studioDocument.clips.length),0);assert.deepEqual(errors,[]);
});

test('native director imports a connected image on first opening and restores it without duplicating panoramas',async t=>{
    const {page,errors}=await fixture(t,'smart',false);
    await page.evaluate(()=>{const source=createNode(100,180,[{url:'/test-image.svg',kind:'image',name:'场景背景'}],{select:false}),director=createSmartStudioNode('director',{x:700,y:350});connectInputNode(source.id,director.id);openSmartStudio(director.id);});
    const frame=page.frameLocator('.pixmax-editor-overlay iframe');
    await frame.locator('.stage-editor').waitFor();
    await frame.getByRole('button',{name:/全景1/}).first().waitFor();
    await frame.getByRole('button',{name:'关闭编辑器',exact:true}).click();await page.waitForFunction(()=>!smartStudioSession);
    assert.equal(await page.evaluate(()=>nodes[1].studioDocument.nodes.length),1);
    assert.equal(await page.evaluate(()=>nodes[1].studioDocument.nodes[0].kind),'panorama');
    await page.evaluate(()=>openSmartStudio(nodes[1].id));await frame.locator('.stage-editor').waitFor();
    await frame.getByRole('button',{name:'关闭编辑器',exact:true}).click();await page.waitForFunction(()=>!smartStudioSession);
    assert.equal(await page.evaluate(()=>nodes[1].studioDocument.nodes.length),1);assert.deepEqual(errors,[]);
});
