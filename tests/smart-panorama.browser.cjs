const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/canvas-browser.cjs');
const svg=color=>`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="256"><rect width="512" height="256" fill="${color}"/></svg>`;
async function setup(t,{member=false,instrument=true}={}){
 const f=await fixture(t,'smart',member),p=f.page;
 await p.route('**/pano-green.svg',r=>r.fulfill({contentType:'image/svg+xml',body:svg('#228844')}));
 await p.route('**/pano-blue.svg',r=>r.fulfill({contentType:'image/svg+xml',body:svg('#2244cc')}));
 if(instrument)await p.evaluate(async()=>{
  const THREE=await import(window.FrontendVersion?.versionedUrl('/static/vendor/js/three-0.160.0.module.js')||'/static/vendor/js/three-0.160.0.module.js');
  window.disposals={texture:[],geometry:[],material:[],lost:0};
  for(const [key,proto] of [['texture',THREE.Texture.prototype],['geometry',THREE.BufferGeometry.prototype],['material',THREE.Material.prototype]]){
   const original=proto.dispose;proto.dispose=function(...args){disposals[key].push(this.uuid);return original.apply(this,args);};
  }
  document.getElementById('panoramaCanvas').addEventListener('webglcontextlost',()=>disposals.lost++);
 });
 await p.evaluate(()=>{
  nodes=[{id:'pano',type:'smart-image',images:[{url:'/pano-green.svg',name:'green.svg',kind:'image',natural_w:512,natural_h:256},{url:'/pano-blue.svg',name:'blue.svg',kind:'image',natural_w:512,natural_h:256}],x:20,y:20}];render();
  window.saveCalls=0;window.undoCalls=0;const save=scheduleSave,undo=pushUndo;
  scheduleSave=()=>{saveCalls++;save();};pushUndo=()=>{undoCalls++;undo();};openImageEditor('pano');
 });
 await p.waitForFunction(()=>smartImageEditor.state.ready);
 return f;
}
async function enable(p){await p.evaluate(()=>setPanoramaEnabled(true));await p.waitForFunction(()=>smartPanoramaPreview.state.ready&&smartPanoramaPreview.state.framePending);}
async function pixel(p){return p.evaluate(()=>{const c=document.getElementById('panoramaCanvas'),gl=c.getContext('webgl2')||c.getContext('webgl'),a=new Uint8Array(4);gl.readPixels(c.width>>1,c.height>>1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,a);return {size:[c.width,c.height],pixel:[...a],lost:gl.isContextLost()};});}
async function waitPixel(p,color){await p.waitForFunction(color=>{const c=document.getElementById('panoramaCanvas'),g=c.getContext('webgl2')||c.getContext('webgl');if(!g||g.isContextLost())return false;const a=new Uint8Array(4);g.readPixels(c.width>>1,c.height>>1,1,1,g.RGBA,g.UNSIGNED_BYTE,a);return color.every((v,i)=>a[i]===v);},color);}
async function holdUpload(p,{fail=false}={}){
 let route;let resolve;const arrived=new Promise(r=>resolve=r);
 await p.route('**/api/ai/upload',r=>{route=r;resolve();});
 return {arrived,async release(){await route.fulfill(fail?{status:503,json:{detail:'fixture upload failed'}}:{json:{files:[{url:'/test-image.svg?panorama-export',name:'frame.png'}]}});}};
}
async function submit(p){await p.evaluate(()=>{window.exportJob=exportPanoramaFrame();});}
async function finish(p){await p.evaluate(()=>window.exportJob);}

test('Smart panorama native WebGL preserves default pixels, dimensions, ratio and gesture projection',async t=>{
 const {page:p,errors}=await setup(t);await enable(p);await waitPixel(p,[34,136,68,255]);
 assert.deepEqual(await pixel(p),{size:[1536,864],pixel:[34,136,68,255],lost:false});
 assert.equal(await p.evaluate(()=>window.__smartCanvasPanoramaState),undefined);
 const frozen=await p.evaluate(()=>{const s=smartPanoramaPreview.state;try{s.yaw=999;}catch{}return Object.isFrozen(s)&&Object.isFrozen(smartPanoramaPreview)&&smartPanoramaPreview.state.yaw===0&&!('renderer' in s);});assert.equal(frozen,true);
 const stage=p.locator('#previewStage'),box=await stage.boundingBox();await p.mouse.move(box.x+80,box.y+80);await p.mouse.down();await p.mouse.move(box.x+180,box.y+130);
 const drag=await p.evaluate(()=>smartPanoramaPreview.state);assert.ok(Math.abs(drag.yaw+18)<.001);assert.ok(Math.abs(drag.pitch-9)<.001);assert.equal(drag.dragging,true);
 await p.mouse.up();await stage.dispatchEvent('wheel',{deltaY:-100});assert.equal(await p.evaluate(()=>smartPanoramaPreview.state.fov),69);
 await p.evaluate(()=>{for(let i=0;i<50;i++)smartPanoramaPreview.zoom({deltaY:-1});});assert.equal(await p.evaluate(()=>smartPanoramaPreview.state.fov),35);
 await p.evaluate(()=>{resetPanoramaView();applyPanoramaRatio('square');});await waitPixel(p,[34,136,68,255]);assert.deepEqual((await pixel(p)).size,[1536,1536]);
 await p.evaluate(()=>applyPanoramaRatio('story'));assert.deepEqual(await p.evaluate(()=>panoramaResolutionValue()),{w:864,h:1536});
 await p.evaluate(()=>applyPanoramaRatio('custom'));await p.locator('#panoramaRatioW').fill('3');await p.locator('#panoramaRatioH').fill('2');assert.deepEqual(await p.evaluate(()=>panoramaRatioValue()),{w:3,h:2});
 assert.deepEqual(await p.evaluate(()=>[saveCalls,undoCalls]),[0,0]);assert.deepEqual(errors,[]);
});

test('Smart panorama repeated binding and open reuse GPU; close during drag cancels frame and releases each texture once',async t=>{
 const {page:p,errors}=await setup(t);await enable(p);
 await p.evaluate(()=>{bindSmartPanoramaControls();bindSmartPanoramaControls();window.sharedResize=0;window.addEventListener('resize',()=>sharedResize++);});
 const stage=p.locator('#previewStage');await stage.dispatchEvent('mousedown',{button:0,clientX:100,clientY:100});assert.equal(await p.evaluate(()=>smartPanoramaPreview.state.dragging),true);
 await p.locator('#panoramaToggleBtn').click();
 assert.deepEqual(await p.evaluate(()=>{const s=smartPanoramaPreview.state;return [s.enabled,s.ready,s.framePending,s.dragging,s.initialized];}),[false,false,false,false,true]);
 await p.locator('#panoramaToggleBtn').click();await p.waitForFunction(()=>smartPanoramaPreview.state.ready);await waitPixel(p,[34,136,68,255]);
 await stage.dispatchEvent('wheel',{deltaY:-1});assert.equal(await p.evaluate(()=>smartPanoramaPreview.state.fov),69,'one owned wheel listener');
 await p.evaluate(()=>{window.dispatchEvent(new Event('resize'));closeImageEditor();});
 const counts=await p.evaluate(()=>({texture:disposals.texture,geometry:disposals.geometry.length,material:disposals.material.length,resize:sharedResize}));
 assert.equal(counts.texture.length,2);assert.equal(new Set(counts.texture).size,2);assert.equal(counts.geometry,0);assert.equal(counts.material,0);assert.equal(counts.resize,1);
 await p.evaluate(()=>{openImageEditor('pano');});await p.waitForFunction(()=>smartImageEditor.state.ready);await enable(p);assert.deepEqual(errors,[]);
});

test('Smart panorama same-source save copies keep readonly rendering and gestures without weakening editing write validation',async t=>{
 const {page:p,errors}=await setup(t);await enable(p);await waitPixel(p,[34,136,68,255]);
 await p.evaluate(async()=>{smartCanvasDirty=true;await saveCanvas({force:true});});
 assert.deepEqual(await p.evaluate(()=>[smartImageEditor.state.targetValid,smartImageEditor.isPanoramaPreviewing(),smartPanoramaPreview.state.targetValid]),[false,true,true]);
 await p.locator('#previewStage').dispatchEvent('wheel',{deltaY:-1});assert.equal(await p.evaluate(()=>smartPanoramaPreview.state.fov),69);
 await waitPixel(p,[34,136,68,255]);await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>smartImageEditor.state.open),false);assert.deepEqual(errors,[]);
});

test('Smart panorama group image switch and edit/preview transition retire old textures without copying the target',async t=>{
 const {page:p,errors}=await setup(t);await enable(p);await p.keyboard.press('ArrowRight');
 await p.waitForFunction(()=>smartImageEditor.state.imageIndex===1&&smartImageEditor.state.ready);assert.equal(await p.evaluate(()=>smartPanoramaPreview.state.enabled),false);
 await enable(p);await waitPixel(p,[34,68,204,255]);assert.equal(await p.evaluate(()=>smartPanoramaPreview.state.loadedSrc),'/pano-blue.svg');
 await p.evaluate(()=>setImageEditMode('crop'));assert.equal(await p.evaluate(()=>smartPanoramaPreview.state.enabled),false);
 await p.evaluate(()=>setImageEditMode('preview'));await enable(p);await waitPixel(p,[34,68,204,255]);assert.deepEqual(errors,[]);
});

for(const replacement of ['node','url','canvas'])test(`Smart panorama ${replacement} replacement stops rendering and real Escape still closes`,async t=>{
 const {page:p,errors}=await setup(t);await enable(p);
 await p.evaluate(kind=>{if(kind==='node')nodes=[{...nodes[0],images:[...nodes[0].images]}];else if(kind==='url')nodes[0].images[0]={...nodes[0].images[0],url:'/pano-blue.svg'};else canvas={...canvas,id:'other-canvas'};},replacement);
 await p.waitForFunction(()=>!smartPanoramaPreview.state.framePending);assert.equal(await p.evaluate(()=>smartPanoramaPreview.state.enabled),false);
 assert.equal(await p.evaluate(()=>smartImageEditor.state.open),true);await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>smartImageEditor.state.open),false);
 assert.equal(await p.evaluate(()=>smartPanoramaPreview.state.ready),false);assert.deepEqual(errors,[]);
});

test('Smart panorama cached return releases GPU once, restores one binding and never automatically reopens',async t=>{
 const {page:p,errors}=await setup(t);await enable(p);await waitPixel(p,[34,136,68,255]);
 await p.evaluate(()=>{window.oldPanoCanvas=document.getElementById('panoramaCanvas');window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));});
 await p.waitForFunction(()=>oldPanoCanvas.getContext('webgl2').isContextLost());
 assert.deepEqual(await p.evaluate(()=>[smartPanoramaPreview.state.paused,smartPanoramaPreview.state.initialized,smartPanoramaPreview.state.enabled,disposals.geometry.length,disposals.material.length]),[true,false,false,1,1]);
 await p.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));assert.equal(await p.evaluate(()=>smartPanoramaPreview.state.enabled),false);
 await p.locator('#panoramaToggleBtn').click();await p.waitForFunction(()=>smartPanoramaPreview.state.ready);await waitPixel(p,[34,136,68,255]);
 await p.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}));smartPanoramaPreview.destroy();smartPanoramaPreview.bind();setPanoramaEnabled(true);});
 const final=await p.evaluate(()=>({s:smartPanoramaPreview.state,geometry:disposals.geometry,material:disposals.material,texture:disposals.texture}));assert.equal(final.s.destroyed,true);assert.equal(final.s.initialized,false);assert.equal(final.s.framePending,false);
 for(const key of ['geometry','material','texture']){assert.equal(final[key].length,2);assert.equal(new Set(final[key]).size,2);}assert.deepEqual(errors,[]);
});

test('Smart panorama delayed Three initialization cannot create GPU or reopen a closed target',async t=>{
 const {page:p,errors}=await setup(t,{instrument:false});let held,resolve;const arrived=new Promise(r=>resolve=r);
 await p.route('**/three-0.160.0.module.js*',r=>{held=r;resolve();});
 await p.evaluate(()=>setPanoramaEnabled(true));await arrived;await p.keyboard.press('Escape');await held.fallback();
 // Wait for the actual imported module, not a timeout or mocked renderer.
 await p.evaluate(()=>import(window.FrontendVersion?.versionedUrl('/static/vendor/js/three-0.160.0.module.js')||'/static/vendor/js/three-0.160.0.module.js'));
 assert.deepEqual(await p.evaluate(()=>{const s=smartPanoramaPreview.state;return [s.enabled,s.ready,s.initialized,s.framePending];}),[false,false,false,false]);
 await p.evaluate(()=>openImageEditor('pano'));await p.waitForFunction(()=>smartImageEditor.state.ready);await enable(p);await waitPixel(p,[34,136,68,255]);assert.deepEqual(errors,[]);
});

test('Smart panorama delayed original cannot apply a texture after close and reopen on a different group image',async t=>{
 const {page:p,errors}=await setup(t);let held,resolve;const arrived=new Promise(r=>resolve=r);
 await p.route('**/pano-green.svg',r=>{held=r;resolve();});
 await p.evaluate(()=>{closeImageEditor();openImageEditor('pano');setPanoramaEnabled(true);});await arrived;
 await p.evaluate(()=>{closeImageEditor();openImageEditor('pano',1);});await p.waitForFunction(()=>smartImageEditor.state.ready);await enable(p);await waitPixel(p,[34,68,204,255]);
 await held.fulfill({contentType:'image/svg+xml',body:svg('#228844')});await p.evaluate(()=>Promise.resolve());
 assert.equal(await p.evaluate(()=>smartPanoramaPreview.state.loadedSrc),'/pano-blue.svg');await waitPixel(p,[34,68,204,255]);assert.deepEqual(errors,[]);
});

for(const change of ['close','target-delete','destroy','canvas','readonly'])test(`Smart panorama submitted upload survives ${change} with bounded writeback and original save counts`,async t=>{
 const {page:p,errors}=await setup(t,{member:change==='readonly'});await enable(p);await waitPixel(p,[34,136,68,255]);const upload=await holdUpload(p);await submit(p);await upload.arrived;
 await p.evaluate(change=>{if(change==='close')closeImageEditor();else if(change==='target-delete')nodes=[];else if(change==='destroy')smartImageEditor.destroy();else if(change==='canvas')canvas={...canvas,id:'other-canvas'};else MemberCanvasEdit.setEditable(false);},change);
 await upload.release();await finish(p);
 const state=await p.evaluate(()=>({count:nodes.length,saves:saveCalls,undos:undoCalls,s:smartPanoramaPreview.state,frame:nodes.at(-1)?.images[0],selectedImage}));
 const apply=!['canvas','readonly'].includes(change);assert.equal(state.count,(change==='target-delete'?0:1)+(apply?1:0));assert.deepEqual([state.saves,state.undos],apply?[2,1]:[0,0]);assert.equal(state.s.exportsPending,0);
 if(apply){assert.deepEqual([state.frame.natural_w,state.frame.natural_h],[1536,864]);assert.equal(state.selectedImage.index,0);}if(change==='close'||change==='destroy')assert.equal(state.s.enabled,false);assert.deepEqual(errors,[]);
});

test('Smart panorama encoding captures original file, pixels, placement and dimensions before UI/source/ratio changes',async t=>{
 const {page:p,errors}=await setup(t);await enable(p);await waitPixel(p,[34,136,68,255]);
 await p.evaluate(()=>{
  const c=document.getElementById('panoramaCanvas'),encode=c.toBlob.bind(c);c.toBlob=(callback,...args)=>encode(blob=>{window.pendingBlob=blob;window.releaseEncoding=()=>callback(blob);},...args);
  const upload=uploadFiles;window.sent=[];uploadFiles=async files=>{const bitmap=await createImageBitmap(files[0]);const copy=document.createElement('canvas');copy.width=bitmap.width;copy.height=bitmap.height;copy.getContext('2d').drawImage(bitmap,0,0);window.sent.push({name:files[0].name,size:[bitmap.width,bitmap.height],pixel:[...copy.getContext('2d').getImageData(768,432,1,1).data]});bitmap.close();return upload(files);};
  const apply=applySmartPanoramaExport;applySmartPanoramaExport=(frame,point)=>{window.exportPoint=point;return apply(frame,point);};window.originRect=nodeRect(nodes[0]);
 });
 const upload=await holdUpload(p);await submit(p);await p.waitForFunction(()=>Boolean(window.releaseEncoding));
 await p.evaluate(()=>{closeImageEditor();openImageEditor('pano',1);applyPanoramaRatio('square');});await p.waitForFunction(()=>smartImageEditor.state.ready);await enable(p);await waitPixel(p,[34,68,204,255]);
 await p.evaluate(()=>releaseEncoding());await upload.arrived;await upload.release();await finish(p);
 assert.deepEqual(await p.evaluate(()=>sent),[{name:'green-panorama.png',size:[1536,864],pixel:[34,136,68,255]}]);
 assert.equal(await p.evaluate(()=>exportPoint.x===originRect.x+originRect.width+240&&exportPoint.y===originRect.y+originRect.height/2),true);
 assert.deepEqual(await p.evaluate(()=>[nodes.at(-1).images[0].natural_w,nodes.at(-1).images[0].natural_h,saveCalls,undoCalls]),[1536,864,2,1]);assert.deepEqual(errors,[]);
});

test('Smart panorama failed upload can retry; readonly submission does not encode or upload',async t=>{
 const {page:p,errors}=await setup(t,{member:true});await enable(p);const bad=await holdUpload(p,{fail:true});await submit(p);await bad.arrived;await bad.release();await finish(p);
 assert.deepEqual(await p.evaluate(()=>[nodes.length,saveCalls,undoCalls,smartPanoramaPreview.state.exportsPending]),[1,0,0,0]);
 const good=await holdUpload(p);await submit(p);await good.arrived;await good.release();await finish(p);assert.deepEqual(await p.evaluate(()=>[nodes.length,saveCalls,undoCalls]),[2,2,1]);
 await p.evaluate(()=>{window.uploadAttempts=0;uploadFiles=async()=>{uploadAttempts++;return[];};MemberCanvasEdit.setEditable(false);});await p.evaluate(()=>exportPanoramaFrame());assert.equal(await p.evaluate(()=>uploadAttempts),0);assert.deepEqual(errors,[]);
});

test('Smart panorama rapid close/reopen shares delayed Three initialization and only paints the latest group target',async t=>{
 const {page:p,errors}=await setup(t,{instrument:false});let held,resolve;const arrived=new Promise(r=>resolve=r);
 await p.route('**/three-0.160.0.module.js*',r=>{held=r;resolve();});
 await p.evaluate(()=>setPanoramaEnabled(true));await arrived;
 await p.evaluate(()=>{closeImageEditor();openImageEditor('pano',1);setPanoramaEnabled(true);});
 await p.waitForFunction(()=>smartImageEditor.state.ready);await held.fallback();await p.waitForFunction(()=>smartPanoramaPreview.state.ready);await waitPixel(p,[34,68,204,255]);
 assert.equal(await p.evaluate(()=>smartPanoramaPreview.state.loadedSrc),'/pano-blue.svg');await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>smartPanoramaPreview.state.framePending),false);assert.deepEqual(errors,[]);
});

test('Smart active panorama to real video clears textures and gestures while retaining the ordinary player owner',async t=>{
 const {page:p,errors}=await setup(t);const bytes=require('node:fs').readFileSync(require('node:path').join(__dirname,'fixtures/smart-preview.webm'));
 await p.route('**/pano-video.webm',r=>r.fulfill({contentType:'video/webm',body:bytes}));await enable(p);
 await p.evaluate(()=>{nodes[0].images.push({url:'/pano-video.webm',kind:'video',natural_w:160,natural_h:90});openImageEditor('pano',2);});
 await p.waitForFunction(()=>document.getElementById('previewCurrentVideo').videoWidth===160);
 assert.deepEqual(await p.evaluate(()=>{const s=smartPanoramaPreview.state;return [s.enabled,s.ready,s.dragging,s.framePending];}),[false,false,false,false]);assert.equal(await p.locator('#panoramaToggleBtn').isVisible(),false);
 await p.evaluate(()=>document.getElementById('previewCurrentVideo').play());await p.waitForFunction(()=>document.getElementById('previewCurrentVideo').currentTime>0);
 await p.evaluate(()=>openImageEditor('pano'));await p.waitForFunction(()=>smartImageEditor.state.ready);await enable(p);await waitPixel(p,[34,136,68,255]);assert.equal(await p.locator('#previewCurrentVideo').getAttribute('src'),null);assert.deepEqual(errors,[]);
});
