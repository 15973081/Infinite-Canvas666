const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');

test('image/video nodes share default bounds while retaining media proportions',async t=>{
    const {page,errors}=await fixture(t,'smart',false);
    const sizes=await page.evaluate(()=>{
        const upload=createNode(20,100);
        const image=createGenerationNodeAt({x:540,y:260},'image');
        const video=createGenerationNodeAt({x:920,y:190},'video');
        const square=createNode(20,440,[{url:'/test-image.svg',kind:'image',natural_w:1024,natural_h:1024}]);
        const wide=createNode(380,480,[{url:'/test-image.svg',kind:'video',natural_w:1920,natural_h:1080}]);
        const portrait=createNode(820,420,[{url:'/test-image.svg',kind:'image',natural_w:1080,natural_h:1920}]);
        clearSelection();render();
        return [upload,image,video,square,wide,portrait].map(node=>{
            const element=document.querySelector(`[data-id="${node.id}"]`);
            const bounds=element.getBoundingClientRect(),rect=nodeRect(node);
            return {width:rect.width,height:rect.height,display:[Math.round(bounds.width),Math.round(bounds.height)]};
        });
    });
    assert.deepEqual(sizes.map(({width,height})=>[width,height]),[[200,200],[200,200],[300,200],[200,200],[356,200],[200,356]]);
    assert.ok(sizes.every(s=>s.display[0]===s.width&&s.display[1]===s.height),'rendered cards agree with connection geometry');
    const fs=require('node:fs'),path=require('node:path');
    const out=path.resolve(__dirname,'../.local/node-sizing');fs.mkdirSync(out,{recursive:true});
    for(const theme of ['dark']){

        await page.screenshot({path:path.join(out,theme+'.png'),animations:'disabled'});
    }
    assert.deepEqual(errors,[]);
});

test('legacy automatic bounds update without rewriting custom sizes or saved media',async t=>{
    const {page,errors}=await fixture(t,'smart',false);
    const result=await page.evaluate(()=>{
        const item={url:'/test-image.svg',kind:'video',natural_w:960,natural_h:540};
        const legacy={id:'old',type:'smart-image',x:20,y:100,w:520,h:293,scale:2,images:[item]};
        const custom={...legacy,id:'custom',w:700,h:420};
        const scaled={...legacy,id:'scaled',w:260,h:146,scale:1};
        nodes=[legacy,custom,scaled];render();
        return {rects:nodes.map(n=>({width:nodeRect(n).width,height:nodeRect(n).height})),saved:nodes.map(serializableSmartNode)};
    });
    assert.deepEqual(result.rects,[{width:356,height:200},{width:700,height:420},{width:260,height:146}]);
    assert.equal(result.saved[0].w,520,'display update does not rewrite a document merely by viewing');
    assert.equal(result.saved[0].images[0].natural_w,960);
    assert.deepEqual(errors,[]);
});

test('uploading a video preserves node identity, position, connections and bounds after reload',async t=>{
    const {page,errors}=await fixture(t,'smart',false);
    const expected=await page.evaluate(async()=>{
        const upload=createNode(50,140,[],{generationKind:'video'}),target=createGenerationNodeAt({x:780,y:230},'video');
        connectInputNode(upload.id,target.id);
        uploadFiles=async()=>[{url:'/test-image.svg',kind:'video',name:'clip.mp4',natural_w:1920,natural_h:1080}];
        await handleFiles([new File(['fixture'],'clip.mp4',{type:'video/mp4'})],upload.id);
        clearSelection();render();await saveCanvas({force:true});
        return {id:upload.id,x:upload.x,y:upload.y,connections:canvas.connections};
    });
    await page.reload();await page.waitForFunction(()=>canvas?.id==='canvas-test'&&nodes.length===2);
    const actual=await page.evaluate(id=>{
        const upload=nodes.find(n=>n.id===id);return {id:upload.id,x:upload.x,y:upload.y,connections:canvas.connections,width:nodeRect(upload).width,height:nodeRect(upload).height};
    },expected.id);
    assert.deepEqual(actual,{...expected,width:356,height:200});
    assert.deepEqual(errors,[]);
});

test('typed uploads reject mismatches before sending files and mixed blank-canvas uploads split by kind',async t=>{
    const {page,errors}=await fixture(t,'smart',false);
    const result=await page.evaluate(async()=>{
        const image=createNode(30,160),video=createGenerationNodeAt({x:750,y:250},'video');
        const warnings=[];toast=message=>warnings.push(message);
        let requests=0;uploadFiles=async files=>{requests++;return files.map(file=>({url:'/test-image.svg',name:file.name,kind:mediaKindForFile(file)}));};
        await handleFiles([new File(['fixture'],'clip.mp4',{type:'video/mp4'})],image.id);
        await handleFiles([new File(['fixture'],'image.png',{type:'image/png'})],video.id);
        const blocked={requests,count:nodes.length,media:nodes.map(n=>n.images.length),warnings:warnings.slice()};
        await handleFiles([new File(['fixture'],'image.png',{type:'image/png'}),new File(['fixture'],'clip.mp4',{type:'video/mp4'})],'',{forceNew:true,point:{x:400,y:600}});
        const added=nodes.slice(2).map(n=>({kind:n.generationKind,media:n.images.map(mediaKindForItem),x:n.x}));
        performUndo();
        return {blocked,added,requests,undoCount:nodes.length};
    });
    assert.equal(result.blocked.requests,0);
    assert.deepEqual(result.blocked.media,[0,0]);
    assert.equal(result.blocked.warnings.length,2);
    assert.equal(result.requests,1);
    assert.deepEqual(result.added.map(({kind,media})=>({kind,media})),[{kind:'image',media:['image']},{kind:'video',media:['video']}]);
    assert.ok(result.added[1].x>result.added[0].x);
    assert.equal(result.undoCount,2);
    assert.deepEqual(errors,[]);
});

test('legacy empty slots migrate without losing IDs, drafts or connections; clearing media retains node kind',async t=>{
    const {page,errors}=await fixture(t,'smart',false);
    const result=await page.evaluate(()=>{
        const original={id:'old-upload',type:'smart-image',title:'上传节点',x:40,y:180,w:208,h:128,images:[],promptDraftText:'Keep draft',runSettings:{apiKind:'video'}};
        const migrated=normalizeLegacySmartNode(original);
        nodes.push(migrated);canvas.connections=[{from:migrated.id,to:'existing'}];
        migrated.images=[{url:'/test-image.svg',kind:'video'}];
        render();clearNodeMediaBeforeDelete(migrated.id);
        return {id:migrated.id,kind:migrated.generationKind,draft:migrated.promptDraftText,connections:canvas.connections,images:migrated.images,layout:imageLayout([],2,migrated)};
    });
    assert.equal(result.id,'old-upload');assert.equal(result.kind,'video');assert.equal(result.draft,'Keep draft');
    assert.deepEqual(result.connections,[{from:'old-upload',to:'existing'}]);assert.deepEqual(result.images,[]);
    assert.equal(result.layout.width,300);assert.equal(result.layout.height,200);
    assert.deepEqual(errors,[]);
});
