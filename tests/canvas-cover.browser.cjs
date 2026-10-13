const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const {fixture,origin}=require('./helpers/canvas-browser.cjs');
const shots=path.resolve(__dirname,'../.local/canvas-home-split/canvas-covers');
const nodes=[{id:'picture',type:'image',title:'建筑草图',url:'/assets/test.png',x:100,y:100},
 {id:'video',type:'output',title:'城市夜景',images:[{url:'/output/first.mp4',kind:'video'}],x:500,y:100},
 {id:'later',type:'image',title:'海边片段',url:'https://example.test/later.webm',mediaKind:'video',x:800,y:100}];
for(const kind of ['classic','smart'])test(kind+': cover selection, saving, fallback and view-only ownership use thumbnails',async t=>{
 const {page,errors,writes,record}=await fixture(t,kind,true);
 await page.route('**/api/media-preview?*',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300"><defs><linearGradient id="g"><stop stop-color="#222e29"/><stop offset="1" stop-color="#536348"/></linearGradient></defs><rect width="480" height="300" fill="url(#g)"/><path d="M0 245L95 120L150 215L240 80L350 195L430 140L480 220V300H0Z" fill="#101611"/></svg>'}));
 const mediaRequests=[];page.on('request',req=>{if(/first\.mp4|later\.webm/.test(req.url()))mediaRequests.push(req.url());});
 await page.evaluate(value=>{nodes=value;canvas.nodes=nodes;Object.defineProperty(MemberCanvasEdit,'canSave',{get:()=>MemberCanvasEdit.canEdit});},nodes);
 const button=page.getByRole('button',{name:'画布封面',exact:true});await button.click();
 const dialog=page.getByRole('dialog',{name:'画布封面',exact:true});await dialog.waitFor();
 assert.equal(await dialog.locator('video').count(),0,'covers do not mount video players');
 assert.equal(await dialog.locator('.canvas-cover-preview img').getAttribute('data-canvas-media-src'),'/api/media-preview?w=512&url=%2Foutput%2Ffirst.mp4');
 assert.ok(mediaRequests.every(url=>url.startsWith(origin+'/api/media-preview?')),'no original videos requested');
 assert.equal(await dialog.locator('.studio-cover-title').evaluate(el=>getComputedStyle(el).textAlign),'left');
 await page.getByLabel('封面文字',{exact:true}).fill('城市视觉 / 01');
 await dialog.getByRole('button',{name:'建筑草图 · 图片',exact:true}).click();
 await dialog.getByRole('button',{name:'应用封面',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('.canvas-cover-dialog'));
 // Explicit flush exercises the production race/lease guarded save path.
 await page.evaluate(()=>saveCanvas({force:true}));
 assert.equal(writes.filter(w=>w.method==='PUT').at(-1).body.cover.node_id,'picture');
 assert.deepEqual(record.cover,{node_id:'picture',index:-1,text:'城市视觉 / 01'});
 await button.click();await dialog.waitFor();
 assert.equal(await dialog.getByRole('button',{name:'建筑草图 · 图片',exact:true}).getAttribute('aria-pressed'),'true');
 await fs.mkdir(shots,{recursive:true});
 for(const theme of ['dark']){

  await page.screenshot({path:path.join(shots,kind+'-cover-'+theme+'.png')});
 }
 await page.setViewportSize({width:390,height:844});
 assert.equal(await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&el.scrollWidth<=el.clientWidth+1;}),true);
 await page.screenshot({path:path.join(shots,kind+'-cover-mobile.png')});
 await dialog.getByRole('button',{name:'取消',exact:true}).click();
 // Removing the selected source resolves to the first remaining video without writing.
 await page.evaluate(()=>{nodes=nodes.filter(n=>n.id!=='picture');});await button.click();
 assert.match(await dialog.locator('.canvas-cover-feedback').innerText(),/已移除/);
 await dialog.getByRole('button',{name:'自动封面 · 优先第一个视频节点',exact:true}).click();
 await dialog.getByRole('button',{name:'应用封面',exact:true}).click();
 await page.evaluate(()=>saveCanvas({force:true}));
 assert.equal(record.cover.node_id,'');assert.equal(record.cover.text,'城市视觉 / 01');
 await button.click();const before=writes.length;
 await page.evaluate(()=>MemberCanvasEdit.setEditable(false));
 // Commit rechecks lease loss after the dialog opened.
 await dialog.getByRole('button',{name:'应用封面',exact:true}).click();
 assert.equal(await dialog.getByRole('button',{name:'应用封面',exact:true}).isEnabled(),false);
 assert.equal(writes.length,before);await dialog.getByRole('button',{name:'取消',exact:true}).click();
 assert.deepEqual(errors,[]);
});

test('directory shows compact cover data with no graph fetches or original video requests',async t=>{
 const {page,errors,requests}=await fixture(t,'classic',false,{directory:true,
  record:{title:'夜景 / 项目',kind:'classic',cover:null,cover_media:{node_id:'v',index:0,kind:'video',url:'/output/cover.mp4'}},
  extraRecords:[{id:'b',title:'未命名画布',kind:'smart',cover:{text:'自定义文字'},cover_media:null}]});
 assert.equal(await page.locator('#canvasGate video').count(),0);
 assert.equal(await page.locator('#canvasGate .studio-cover-title').first().innerText(),'夜景 / 项目');
 assert.equal(await page.locator('#canvasGate .studio-cover-title').nth(1).innerText(),'自定义文字');
 assert.ok(!requests.some(url=>url.includes('/api/canvases/')&&!url.endsWith('/trash')),'render has no per-card document fetch');
 assert.ok(!requests.some(url=>url.endsWith('/output/cover.mp4')),'only thumbnail requested');
 const summaries=page.locator('.studio-card-menu summary');await summaries.first().click();
 assert.equal(await page.getByRole('button',{name:'编辑封面',exact:true}).first().count(),1);
 assert.deepEqual(errors,[]);
});
