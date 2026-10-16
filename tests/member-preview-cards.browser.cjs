const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture}=require('./helpers/canvas-browser.cjs');
function wav(){
 const data=Buffer.alloc(44+32000);data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(8000,24);data.writeUInt32LE(16000,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(32000,40);return data;
}
async function setup(t){
 const f=await fixture(t,'smart',true,{secureOrigin:true,permissions:['canvas.read','canvas.edit','asset.read','canvas.export']});
 await f.page.route('**/api/canvases/canvas-test/edit-lease**',route=>route.fulfill({json:{lease:{canvas_id:'canvas-test',generation:1,revision:1,holder:null},requests:[]}}));
 await f.page.route('**/api/canvases/canvas-test/page-state',route=>route.fulfill({json:{presence:{online_members:1,members:[]}}}));
 await f.page.route('**/assets/preview.wav*',route=>route.fulfill({contentType:'audio/wav',body:wav()}));
 await f.page.route('**/assets/preview.webm*',route=>route.fulfill({contentType:'video/webm',body:fs.readFileSync('tests/fixtures/smart-video-trim.webm')}));
 const style=await f.page.addStyleTag({url:'/static/css/member-canvas-edit.css'});await style.evaluate(n=>document.head.insertBefore(n,document.head.querySelector('link[rel="stylesheet"]')));
 for(const name of ['member-media','member-media-preview','member-canvas-edit'])await f.page.addScriptTag({url:'/static/js/'+name+'.js'});
 await f.page.evaluate(()=>MemberCanvasEdit.mount({id:'canvas-test',dirty:()=>false,snapshot:()=>({id:'canvas-test',kind:'smart',revision:1,nodes:[{id:'media',images:[{url:'/assets/preview.wav',kind:'audio',name:'晚安吧 老朋友.wav'},{url:'/test-image.svg',kind:'image',name:'画布图片.svg'},{url:'/assets/preview.webm',kind:'video',name:'画布视频.webm'}]}]}),reload:async()=>({revision:1}),flush:async()=>true}));
 await f.page.getByRole('button',{name:'预览素材',exact:true}).waitFor();return f;
}
async function bounds(page,dialog){const box=await dialog.boundingBox(),size=page.viewportSize();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=size.width+1&&box.y+box.height<=size.height+1,JSON.stringify(box));assert.equal(await dialog.evaluate(n=>n.scrollWidth>n.clientWidth),false);}

test('audio card uses actual metadata and compact controls; switching releases media and restores image zoom',async t=>{
 const {page,errors}=await setup(t);await page.getByRole('button',{name:'预览素材',exact:true}).click();const dialog=page.getByRole('dialog',{name:'画布素材预览',exact:true});
 await dialog.locator('.member-preview-audio-meta').getByText('WAV · 0:02',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('.member-media-preview audio')?.readyState>=2);
 await page.evaluate(()=>window.oldPreviewAudio=document.querySelector('.member-media-preview audio'));
 fs.mkdirSync('.local/commercial-kickoff',{recursive:true});
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});await bounds(page,dialog);assert.ok((await dialog.boundingBox()).height<500);await page.screenshot({path:'.local/commercial-kickoff/media-audio-card-'+width+'.png'});}
 assert.equal(await dialog.getByRole('link',{name:'下载原件'}).isVisible(),true);
 await dialog.getByRole('button',{name:'下一项',exact:true}).click();await dialog.locator('img').waitFor();
 assert.equal(await page.evaluate(()=>oldPreviewAudio.paused&&!oldPreviewAudio.getAttribute('src')),true);
 assert.equal(await dialog.locator('.member-preview-counter').innerText(),'2 / 3');await dialog.getByRole('button',{name:'放大',exact:true}).click();assert.equal(await dialog.locator('img').evaluate(n=>n.style.width),'125%');
 await dialog.getByRole('button',{name:'适合窗口',exact:true}).click();await bounds(page,dialog);
 await dialog.getByRole('button',{name:'下一项',exact:true}).click();await dialog.locator('video').waitFor();await page.evaluate(()=>window.oldPreviewVideo=document.querySelector('.member-media-preview video'));
 await dialog.getByRole('button',{name:'关闭预览',exact:true}).click();assert.equal(await dialog.isVisible(),false);assert.equal(await page.evaluate(()=>oldPreviewVideo.paused&&!oldPreviewVideo.getAttribute('src')),true);assert.deepEqual(errors,[]);
});

test('saved results distinguish empty and error states and fit small screens',async t=>{
 const {page,errors}=await setup(t);let failed=false;
 await page.route('**/api/canvases/canvas-test/task-results**',route=>route.fulfill(failed?{status:403,json:{detail:'denied'}}:{json:{results:[],next_after:''}}));
 await page.getByRole('button',{name:'生成结果',exact:true}).click();const dialog=page.getByRole('dialog',{name:'生成结果',exact:true});await dialog.getByText('暂无生成结果',{exact:true}).waitFor();
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});await bounds(page,dialog);await page.screenshot({path:'.local/commercial-kickoff/results-empty-card-'+width+'.png'});}
 failed=true;await dialog.getByRole('button',{name:'刷新结果',exact:true}).click();await dialog.getByRole('status').getByText(/结果列表暂不可用/).waitFor();assert.equal(await dialog.locator('.member-results-empty').isVisible(),false);
 failed=false;await dialog.getByRole('button',{name:'刷新结果',exact:true}).click();await dialog.getByText('暂无生成结果',{exact:true}).waitFor();await dialog.getByRole('button',{name:'关闭',exact:true}).click();assert.equal(await dialog.count(),0);assert.deepEqual(errors,[]);
});

test('saved result cards show actual model, type and receipt state without enabling readonly insertion',async t=>{
 const {page,errors,writes}=await setup(t);
 await page.route('**/api/canvases/canvas-test/task-results**',route=>route.fulfill({json:{results:[{id:'task-image-1',kind:'image',model:'图片模型',state:'ready',outputs:[{url:'/test-image.svg'}],binding:{state:'changed'}},{id:'task-text-2',kind:'llm',model:'文本模型',state:'in_canvas',outputs:[{text:'已生成正文'}]}],next_after:''}}));
 await page.getByRole('button',{name:'生成结果',exact:true}).click();const dialog=page.getByRole('dialog',{name:'生成结果',exact:true});await dialog.getByText('task-image-1',{exact:true}).waitFor();assert.equal(await dialog.locator('.member-canvas-result-row').count(),2);
 await dialog.getByText('已在画布中',{exact:true}).waitFor();assert.equal(await dialog.getByRole('button',{name:'加入为新结果节点',exact:true}).first().isDisabled(),true);
 for(const width of [1440,320]){await page.setViewportSize({width,height:900});await bounds(page,dialog);await page.screenshot({path:'.local/commercial-kickoff/results-filled-card-'+width+'.png'});}
 assert.equal(writes.filter(row=>/join-result|acquire/.test(row.path)).length,0);assert.deepEqual(errors,[]);
});
