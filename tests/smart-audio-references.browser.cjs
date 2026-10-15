const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture}=require('./helpers/canvas-browser.cjs');
async function setup(t){
 const f=await fixture(t,'smart',false);
 await f.page.evaluate(()=>{
  const audio={url:'/assets/golden-water.mp3',kind:'audio',name:'金色的水位'};
  nodes=[{id:'sound',type:'smart-image',images:[audio],x:280,y:160,
   runSettings:{engine:'api',apiKind:'image',model:'gpt-image-2'},
   promptDraftHtml:'<span class="mention-image-token" contenteditable="false" data-kind="image" data-url="/assets/golden-water.mp3" data-node-id="sound"><img src="/assets/golden-water.mp3"><span>@图片1</span></span>',promptDraftText:'@图片1'},
   {id:'image',type:'smart-image',images:[{url:'/test-image.svg',kind:'image',name:'参考图片',natural_w:320,natural_h:240}],x:700,y:40},
   {id:'target',type:'smart-image',images:[],x:100,y:400,runSettings:{engine:'api',apiKind:'video',videoProvider:'test',videoModel:'test-video'}}];
  canvas.connections=[{from:'sound',to:'target',kind:'input'},{from:'image',to:'target',kind:'input'}];
  smartSelection.createdNode('sound');render();updateComposer();
 });
 return f;
}
test('audio drafts and image mode never render or submit audio as an image',async t=>{
 const {page,errors,writes}=await setup(t),before=writes.length;
 assert.equal(await page.locator('#inputThumbsRow img').count(),0);
 assert.equal(await page.locator('#inputThumbsRow .smart-audio-input-note').isVisible(),true);
 assert.equal(await page.locator('#promptInput .mention-image-token img').count(),0);
 assert.equal(await page.locator('#promptInput .mention-image-token').getAttribute('data-kind'),'audio');
 assert.equal(await page.locator('#promptInput .smart-ref-symbol svg').count(),1);
 assert.equal(await page.locator('#promptInput .mention-image-token').innerText(),'@音频');
 await page.locator('.pixmax-audio-mount[data-audio-ready=true]').waitFor();
 assert.equal(await page.locator('.pixmax-audio-card canvas').count(),1);
 assert.equal(await page.getByRole('button',{name:'播放音频',exact:true}).count(),1);
 assert.equal(await page.locator('audio').count(),0,'displaying audio must not create a decoder');
 const result=await page.evaluate(()=>{
  let error='';try{buildPromptRequest(nodes[0]);}catch(e){error=e.message;}
  const candidates=inputMentionCandidateImages(nodes[2]);
  promptInput.textContent='生成海报';
  return {error,refs:buildPromptRequest(nodes[0]).refs,candidates:candidates.map(mediaKindForItem)};
 });
 assert.match(result.error,/图片生成不支持音频引用/);assert.deepEqual(result.refs,[]);
 assert.ok(!result.candidates.includes('audio'));
 assert.equal(writes.length,before);assert.deepEqual(errors,[]);
});
test('video mode audio references keep type, alias insertion, preview routing and themed compact layout',async t=>{
 const {page,errors}=await setup(t);
 await page.evaluate(()=>{smartSelection.createdNode('target');render();updateComposer();});
 await page.locator('.smart-ref-audio').waitFor();
 assert.equal(await page.locator('.smart-ref-audio img').count(),0);
 assert.equal(await page.locator('.smart-ref-audio .smart-ref-alias').innerText(),'音频1');
 assert.equal(await page.locator('.smart-ref-audio .smart-ref-name').innerText(),'金色的水位');
 await page.locator('.smart-ref-audio [data-ref-insert]').click();
 const payload=await page.evaluate(()=>buildPromptRequest(nodes.find(n=>n.id==='target')));
 assert.ok(payload.prompt.includes('音频1'));
 assert.equal(payload.refs.find(r=>r.kind==='audio').url,'/assets/golden-water.mp3');
 assert.equal(await page.locator('#promptInput [data-kind=audio] img').count(),0);
 assert.equal(await page.locator('#promptInput .smart-ref-unsupported').count(),0);
 await page.evaluate(()=>{window.previewedRef=null;previewSmartReference=ref=>{previewedRef=ref;};});
 await page.locator('.smart-ref-audio [data-ref-preview]').click();
 assert.equal(await page.evaluate(()=>previewedRef.kind),'audio');
 fs.mkdirSync('.local/smart-audio-reference',{recursive:true});
 for(const theme of ['dark']){
  await page.evaluate(theme=>{viewport={x:0,y:0,scale:1};applyViewport();},theme);
  await page.locator('.smart-ref-audio').screenshot({path:'.local/smart-audio-reference/'+theme+'-reference.png',animations:'disabled'});
  await page.locator('.pixmax-audio-card').screenshot({path:'.local/smart-audio-reference/'+theme+'-node.png',animations:'disabled'});
  const sizes=await page.locator('.smart-ref-audio').evaluate(el=>({w:el.clientWidth,scroll:el.scrollWidth,h:el.clientHeight}));
  assert.ok(sizes.scroll<=sizes.w&&sizes.h<=60);
 }
 assert.deepEqual(errors,[]);
});
