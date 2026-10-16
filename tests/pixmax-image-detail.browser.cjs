const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture}=require('./helpers/canvas-browser.cjs');
const record=()=>({nodes:[{id:'a',type:'smart-image',x:100,y:100,images:[{url:'/test-image.svg',name:'source.svg',kind:'image',natural_w:320,natural_h:240},{url:'/test-image.svg',name:'second.svg',kind:'image',natural_w:320,natural_h:240}]}],connections:[]});
async function setup(t,extra={}){return fixture(t,'smart',true,{record:record(),...extra});}

test('real double click stays open across pending autosave and panorama retains the source node',async t=>{
 const {page,errors}=await setup(t);
 await page.evaluate(()=>{Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});window.originalPreviewSource=nodes[0].images[0];scheduleSave();});
 const saved=page.waitForResponse(response=>response.request().method()==='PUT'&&new URL(response.url()).pathname==='/api/canvases/canvas-test');
 await page.locator('.image-node[data-id="a"] [data-image-index="0"]').first().dblclick();
 await saved;
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await page.evaluate(()=>nodes[0].images[0]===originalPreviewSource),false,'autosave normalizes media into new objects');
 const modal=page.getByRole('dialog',{name:'图片预览',exact:true});assert.equal(await modal.isVisible(),true,'autosave must not dismiss the preview');
 await modal.getByRole('button',{name:'查看 second.svg',exact:true}).click();
 await modal.getByRole('button',{name:'进入全景预览',exact:true}).click();
 await page.waitForFunction(()=>smartPanoramaPreview.state.ready);
 assert.deepEqual(await page.evaluate(()=>({id:smartImageEditor.state.nodeId,index:smartImageEditor.state.imageIndex})),{id:'a',index:1});
 assert.deepEqual(errors,[]);
});

test('node and log image previews are read-only, independent, zoomable and have separate result thumbnails',async t=>{
 const {page,errors,writes}=await setup(t);await page.evaluate(()=>{window.beforePreview=JSON.stringify(nodes);openImagePreview('a');});
 const modal=page.getByRole('dialog',{name:'图片预览',exact:true});await modal.waitFor();await page.waitForFunction(()=>document.querySelector('.pixmax-detail-stage>img')?.naturalWidth===320);
 assert.equal(await page.locator('#imageEditModal.open').count(),0);assert.equal(await modal.locator('[data-image-edit-mode]').count(),0);assert.equal(await modal.locator('.pixmax-detail-thumbs button').count(),2);
 await modal.locator('.pixmax-detail-stage').hover();await page.mouse.wheel(0,-100);assert.equal(await modal.locator('.pixmax-detail-stage').getAttribute('data-scale'),'1.15');
 await modal.locator('.pixmax-detail-stage').dblclick();assert.equal(await modal.locator('.pixmax-detail-stage').getAttribute('data-scale'),'1');
 await modal.getByRole('button',{name:'查看 second.svg',exact:true}).click();await modal.locator('dd').filter({hasText:'second.svg'}).waitFor();
 assert.equal(await page.evaluate(()=>JSON.stringify(nodes)===beforePreview),true);assert.equal(writes.length,0);
 await page.keyboard.press('Escape');await modal.waitFor({state:'detached'});await page.evaluate(()=>smartLogPreviewNode('/test-image.svg','image'));await modal.waitFor();assert.equal(await page.locator('#imageEditModal.open').count(),0);assert.deepEqual(errors,[]);
});

test('history navigation uses real details, stops at boundaries and late responses cannot replace a newer selection',async t=>{
 const items=[{id:'ast_one',url:'/test-image.svg',name:'one.svg',kind:'image'},{id:'ast_two',url:'/test-image.svg',name:'two.svg',kind:'image'}];let release;
 const {page,errors}=await setup(t,{apiHandler:async req=>{const path=new URL(req.url()).pathname;if(path.endsWith('/ast_one')){await new Promise(r=>release=r);return {body:{item:items[0],parameters:{prompt:'STALE'},metadata:{}}};}if(path.endsWith('/ast_two'))return {body:{item:items[1],parameters:{prompt:'<img src=x onerror=alert(1)>',model:'verified-model'},metadata:{size_bytes:2048,completed_at:'2026-10-16T00:00:00Z'},references:[]}};}});
 await page.evaluate(items=>PixmaxImagePreview.open({item:items[0],history:items}),items);await page.waitForRequest(()=>false,{timeout:50}).catch(()=>{});
 const modal=page.getByRole('dialog',{name:'图片预览',exact:true});await modal.getByRole('button',{name:'下一条历史',exact:true}).click();await modal.getByText('verified-model',{exact:true}).waitFor();release();
 await modal.getByText('<img src=x onerror=alert(1)>',{exact:true}).waitFor();assert.equal(await modal.locator('.pixmax-detail-prompt img').count(),0);assert.equal(await modal.getByRole('button',{name:'下一条历史',exact:true}).count(),0);await page.keyboard.press('ArrowRight');assert.equal(await modal.getByText('two.svg',{exact:true}).count(),1);assert.deepEqual(errors,[]);
});

test('session pause clears preview; removing the source closes it without leaving handlers',async t=>{
 const {page,errors}=await setup(t);await page.evaluate(()=>openImagePreview('a'));const modal=page.getByRole('dialog',{name:'图片预览',exact:true});await modal.waitFor();
 await page.evaluate(()=>{CanvasSession.paused=true;window.dispatchEvent(new Event('member-session:paused'));});await modal.waitFor({state:'detached'});
 await page.evaluate(()=>{CanvasSession.paused=false;openImagePreview('a');nodes=[];render();});await modal.waitFor({state:'detached'});assert.deepEqual(errors,[]);
});

for(const change of ['url','asset-id'])test(`replacing the actual preview resource still closes it after autosave (${change})`,async t=>{
 const {page,errors}=await setup(t);
 await page.evaluate(async()=>{Object.defineProperty(MemberCanvasEdit,'canSave',{get(){return this.canEdit;}});openImagePreview('a');await saveCanvas({force:true});});
 const modal=page.getByRole('dialog',{name:'图片预览',exact:true});assert.equal(await modal.isVisible(),true);
 await page.evaluate(change=>{const item=nodes[0].images[0];if(change==='url')item.url='/changed.svg';else item.media_asset_id='replacement-asset';render();},change);
 await modal.waitFor({state:'detached'});assert.deepEqual(errors,[]);
});

async function toolsSetup(t,mode){const f=await setup(t);await f.page.evaluate(mode=>{
 window.sourceBefore=JSON.stringify(nodes[0]);window.exports=[];CanvasApi.uploadAi=async form=>{const file=form.get('files'),bitmap=await createImageBitmap(file),c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;c.getContext('2d').drawImage(bitmap,0,0);const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let red=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>200&&pixels[i+1]<100)red++;exports.push({name:file.name,width:bitmap.width,height:bitmap.height,red});bitmap.close();return {files:[{url:'/result.png',name:file.name}]};};runSmartNodeToolbarAction('a',mode);
 },mode);await f.page.getByRole('button',{name:'保存为新节点',exact:true}).waitFor();await f.page.waitForFunction(()=>!document.querySelector('.pixmax-image-tool .primary')?.disabled);return f;}

test('independent crop exports chosen aspect ratio to a new node and preserves original group',async t=>{
 const {page,errors}=await toolsSetup(t,'crop');const modal=page.getByRole('dialog',{name:'裁剪图片',exact:true});await modal.getByLabel('裁剪比例',{exact:true}).selectOption('.75');await modal.getByRole('button',{name:'保存为新节点',exact:true}).click();await modal.waitFor({state:'detached'});
 const result=await page.evaluate(()=>({same:JSON.stringify(nodes[0])===sourceBefore,count:nodes.length,exported:exports[0],last:nodes.at(-1)}));assert.equal(result.same,true);assert.equal(result.count,2);assert.equal(result.exported.width,180);assert.equal(result.exported.height,240);assert.equal(result.last.images[0].url,'/result.png');assert.equal(result.last.generationKind,undefined);assert.deepEqual(errors,[]);
});

test('annotation supports undo and redo and exports a new node instead of replacing source',async t=>{
 const {page,errors}=await toolsSetup(t,'brush'),modal=page.getByRole('dialog',{name:'图片标记',exact:true});const b=await modal.locator('canvas').boundingBox();await page.mouse.move(b.x+b.width*.25,b.y+b.height*.25);await page.mouse.down();await page.mouse.move(b.x+b.width*.65,b.y+b.height*.65,{steps:8});await page.mouse.up();
 await modal.getByRole('button',{name:'撤销',exact:true}).click();await modal.getByRole('button',{name:'保存为新节点',exact:true}).click();await modal.getByText('请先添加标记。',{exact:true}).waitFor();await modal.getByRole('button',{name:'重做',exact:true}).click();await modal.getByRole('button',{name:'保存为新节点',exact:true}).click();await modal.waitFor({state:'detached'});
 assert.deepEqual(await page.evaluate(()=>({same:JSON.stringify(nodes[0])===sourceBefore,n:nodes.length,width:exports[0].width})),{same:true,n:2,width:320});assert.ok(await page.evaluate(()=>exports[0].red>0));assert.deepEqual(errors,[]);
});

test('late crop upload after session pause never inserts or overwrites nodes',async t=>{
 const {page,errors}=await toolsSetup(t,'crop');await page.evaluate(()=>{CanvasApi.uploadAi=()=>new Promise(resolve=>window.releaseCrop=()=>resolve({files:[{url:'/late.png',name:'late.png'}]}));});await page.getByRole('button',{name:'保存为新节点',exact:true}).click();await page.waitForFunction(()=>typeof releaseCrop==='function');await page.evaluate(()=>{CanvasSession.paused=true;window.dispatchEvent(new Event('member-session:paused'));releaseCrop();});await page.getByRole('dialog',{name:'裁剪图片',exact:true}).waitFor({state:'detached'});assert.equal(await page.evaluate(()=>nodes.length),1);assert.equal(await page.evaluate(()=>JSON.stringify(nodes[0])===sourceBefore),true);assert.deepEqual(errors,[]);
});

test('desktop and mobile preview retain image and details without viewport overflow',async t=>{
 const {page,errors}=await setup(t);await page.evaluate(()=>openImagePreview('a'));fs.mkdirSync('.local/commercial-kickoff',{recursive:true});
 for(const width of [1600,390]){await page.setViewportSize({width,height:1000});const bounds=await page.locator('.pixmax-image-preview').evaluate(n=>({scroll:n.scrollWidth,w:n.clientWidth,h:n.getBoundingClientRect().height}));assert.ok(bounds.scroll<=bounds.w&&bounds.h<=1000,JSON.stringify(bounds));await page.screenshot({path:'.local/commercial-kickoff/image-preview-'+width+'.png'});}
 assert.deepEqual(errors,[]);
});

test('preview panorama entry hands the displayed image to the retained renderer',async t=>{
 const {page,errors}=await setup(t);await page.evaluate(()=>openImagePreview('a'));await page.getByRole('button',{name:'进入全景预览',exact:true}).click();await page.waitForFunction(()=>smartPanoramaPreview.state.ready);assert.equal(await page.evaluate(()=>PixmaxImagePreview.opened),false);assert.equal(await page.evaluate(()=>smartImageEditor.state.nodeId),'a');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>smartImageEditor.state.open),false);assert.deepEqual(errors,[]);
});

test('crop load failure is retryable; read-only members cannot launch editing tools',async t=>{
 const {page,errors}=await setup(t);await page.route('**/test-image.svg',route=>route.fulfill({status:503,body:'unavailable'}));await page.evaluate(()=>runSmartNodeToolbarAction('a','crop'));await page.getByRole('button',{name:'重试原图',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'保存为新节点',exact:true}).isDisabled(),true);
 await page.unroute('**/test-image.svg');await page.getByRole('button',{name:'重试原图',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.pixmax-image-tool .primary').disabled);await page.getByRole('button',{name:'取消',exact:true}).click();
 await page.evaluate(()=>{MemberCanvasEdit.setEditable(false);runSmartNodeToolbarAction('a','crop');runSmartNodeToolbarAction('a','brush');});assert.equal(await page.locator('.pixmax-image-tool').count(),0);assert.deepEqual(errors,[]);
});

test('crop handles stay inside original bounds and produce an undoable new image',async t=>{
 const {page,errors}=await toolsSetup(t,'crop');const modal=page.locator('.pixmax-image-tool'),handle=await modal.locator('.pixmax-crop-handle.se').boundingBox(),image=await modal.locator('canvas').boundingBox();await page.mouse.move(handle.x+8,handle.y+8);await page.mouse.down();await page.mouse.move(image.x+image.width*.5,image.y+image.height*.5);await page.mouse.up();await page.getByRole('button',{name:'保存为新节点',exact:true}).click();await modal.waitFor({state:'detached'});const output=await page.evaluate(()=>exports[0]);assert.ok(Math.abs(output.width-160)<=1&&Math.abs(output.height-120)<=1,JSON.stringify(output));await page.evaluate(()=>performUndo());assert.equal(await page.evaluate(()=>nodes.length),1);assert.deepEqual(errors,[]);
});

test('independent tools fit mobile and desktop without distorting their drawing coordinates',async t=>{
 const {page,errors}=await toolsSetup(t,'brush');fs.mkdirSync('.local/commercial-kickoff',{recursive:true});
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.waitForFunction(()=>{const n=document.querySelector('.pixmax-image-tool canvas').getBoundingClientRect();return Math.abs(n.width/n.height-4/3)<.01;});const b=await page.locator('.pixmax-image-tool').boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=width&&b.y+b.height<=1000);await page.screenshot({path:'.local/commercial-kickoff/image-annotation-'+width+'.png'});}
 assert.deepEqual(errors,[]);
});

test('successful metadata cannot hide an image load failure and the picture can retry',async t=>{
 const {page,errors}=await setup(t,{apiHandler:async req=>new URL(req.url()).pathname.endsWith('/ast_bad')?{body:{item:{id:'ast_bad',name:'failed.svg'},parameters:{model:'available metadata'},metadata:{}}}:undefined});await page.route('**/failed.svg',route=>route.fulfill({status:503,body:'failed'}));await page.evaluate(()=>PixmaxImagePreview.open({item:{id:'ast_bad',url:'/failed.svg',name:'failed.svg'}}));await page.getByText('available metadata',{exact:true}).waitFor();await page.getByRole('button',{name:'重试图片',exact:true}).waitFor();
 await page.route('**/failed.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="green"/></svg>'}));await page.getByRole('button',{name:'重试图片',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.pixmax-detail-stage>img').naturalWidth===320&&document.querySelector('.pixmax-detail-media-status').textContent==='');assert.deepEqual(errors,[]);
});
