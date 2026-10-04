const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {functionSource}=require('./helpers/canvas-source.cjs');
const workspace=fs.readFileSync('static/js/canvas/smart/smart-workspace.js','utf8');
const media=fs.readFileSync('static/js/canvas/smart/smart-media-editor.js','utf8');
const plain=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const a={id:'a',type:'smart-image',promptDraftText:'A',runSettings:{model:'a-model',count:2}},b={id:'b',type:'smart-image',promptDraftText:'B',runSettings:{model:'b-model',count:3}},calls=[];
 const c=vm.createContext({nodes:[a,b],choice:a,settings:{model:'initial'},canvas:{id:'canvas'},
  promptInput:{textContent:'live',dataset:{preserveDraftOnce:'old'}},composer:{classList:{remove(){},contains:()=>false}},
  selectedNode:()=>c.choice,isSmartImageNode:n=>n?.type==='smart-image',escapeHtml:s=>s.replace(/</g,'&lt;'),
  cloneSmartSettings:s=>plain(s),withOutpaintDisplaySettings:(n,s)=>({...s,resolution:'custom',customWidth:n.outpaintSize.width,customHeight:n.outpaintSize.height,outpaintResolutionLocked:true}),
  smartSettingsForNode:n=>plain(n.runSettings),renderDynamicParams:()=>calls.push('params')});
 vm.runInContext(functionSource(workspace,'createSmartComposer'),c);c.smartComposer=c.createSmartComposer();
 vm.runInContext(functionSource(workspace,'applySmartOutpaintComposer'),c);return {c,a,b,calls};
}
test('outpaint calls one workspace input command; editor no longer coordinates settings, prompt or draft markers',()=>{
 const apply=functionSource(media,'applyImageOutpaint');assert.match(apply,/applySmartOutpaintComposer\(outW, outH, node\)/);
 assert.doesNotMatch(apply,/applyOutpaintSizeToSmartParams|setPromptDraftForNode|promptInput|settings/);
 assert.doesNotMatch(media,/function applyOutpaintSizeToSmartParams/);
 assert.match(functionSource(workspace,'applySmartOutpaintComposer'),/return smartComposer.applyOutpaint/);
});

function manualFixture(){
 const f=fixture(),c=f.c;c.refs=[{url:'/one'},{url:'/two'}];c.dialogValue='https://example.test/one\nasset://second';c.settings.videoTempShLinks=[{source:'auto',url:'https://automatic'},{source:'old',url:'https://old',manual:true}];
 Object.assign(c,{currentUploadMediaRefs:()=>c.refs,currentSmartMediaLinks:()=>[],mediaRefSourceUrl:r=>r.sourceUrl||r.url,
  isRemoteVideoReferenceUrl:u=>/^(https?:\/\/|asset:\/\/)/.test(u),tempShUploadedUrlFor:u=>u,
  openAssetNameDialog:async options=>{c.dialogOptions=options;return c.dialogValue;},
  scheduleSave:()=>f.calls.push('save'),render:()=>f.calls.push('render'),toast:s=>{c.note=s;}});
 vm.runInContext(functionSource(media,'splitManualMediaUrls')+'\n'+functionSource(media,'setCurrentSmartManualVideoUrl'),c);return f;
}
test('manual URL entry delegates one complete operation and leaves no settings mutation in media-editor',()=>{
 assert.match(functionSource(media,'setCurrentSmartManualVideoUrl'),/return smartComposer.setManualMediaUrls/);
 assert.doesNotMatch(media,/settings\.videoTempShLinks\s*=/);assert.doesNotMatch(media,/function (?:clearManualSmartVideoUrl|applyManualVideoUrlToSmartRef)/);
});
test('manual input retains URL parsing, ordered sources, automatic links and exactly one save/render',async()=>{
 const f=manualFixture();assert.equal(await f.c.setCurrentSmartManualVideoUrl(),'https://example.test/one');
 assert.deepEqual(plain(f.c.settings.videoTempShLinks),[{source:'auto',url:'https://automatic'},
  {source:'/one',url:'https://example.test/one',manual:true},{source:'/two',url:'asset://second',manual:true}]);
 assert.equal(f.c.dialogOptions.multiline,true);assert.equal(f.c.dialogOptions.cancelValue,null);assert.deepEqual(f.calls,['save','render']);
 f.c.dialogValue='https://first, https://second，https://last';await f.c.setCurrentSmartManualVideoUrl();
 assert.equal(f.c.settings.videoTempShLinks.at(-1).url,'https://last');assert.equal(f.c.note,'已设置 3 个媒体网址');
});
for(const value of [null,'not-a-url',''])test('manual '+JSON.stringify(value)+' preserves cancel/invalid/clear behavior',async()=>{
 const f=manualFixture(),before=plain(f.c.settings);f.c.dialogValue=value;assert.equal(await f.c.setCurrentSmartManualVideoUrl(),'');
 if(value===''){assert.deepEqual(plain(f.c.settings.videoTempShLinks),[{source:'auto',url:'https://automatic'}]);assert.deepEqual(f.calls,['save','render']);}
 else {assert.deepEqual(plain(f.c.settings),before);assert.deepEqual(f.calls,[]);}
});
for(const change of ['selection','node','canvas','inputs','pause','destroy','reopen'])test('manual late dialog ignores '+change+' session changes',async()=>{
 const f=manualFixture();let release;f.c.openAssetNameDialog=()=>new Promise(r=>release=r);const waiting=f.c.setCurrentSmartManualVideoUrl();
 if(change==='selection')f.c.choice=f.b;if(change==='node')f.c.nodes[0]={...f.a};if(change==='canvas')f.c.canvas={id:'other'};
 if(change==='inputs')f.c.refs[0]={url:'/replacement'};if(change==='pause')f.c.smartComposer.pause();if(change==='destroy')f.c.smartComposer.destroy();
 if(change==='reopen')f.c.smartComposer.documentReplaced();
 const before=plain({settings:f.c.settings,a:f.a,b:f.b,input:f.c.promptInput});release('https://late.test');assert.equal(await waiting,'');
 assert.deepEqual(plain({settings:f.c.settings,a:f.a,b:f.b,input:f.c.promptInput}),before);assert.deepEqual(f.calls,[]);
});
test('a newer manual input request retires the preceding request without another save',async()=>{
 const f=manualFixture(),answers=[];f.c.openAssetNameDialog=()=>new Promise(resolve=>answers.push(resolve));
 const old=f.c.setCurrentSmartManualVideoUrl(),latest=f.c.setCurrentSmartManualVideoUrl();answers[1]('https://latest.test');await latest;
 const before=plain(f.c.settings);answers[0]('https://old.test');assert.equal(await old,'');assert.deepEqual(plain(f.c.settings),before);assert.deepEqual(f.calls,['save','render']);
});
test('outpaint command keeps size rounding, the original node model, prompt and current input without scheduling another save',()=>{
 const {c,a,b,calls}=fixture(),other=plain(b);
 assert.equal(c.applySmartOutpaintComposer(379.6,240.4,a),true);
 assert.deepEqual(plain(a.outpaintSize),{width:380,height:240});assert.equal(a.runSettings.model,'a-model');assert.equal(a.runSettings.count,2);
 assert.equal(a.runSettings.outpaintResolutionLocked,true);assert.equal(c.settings.customWidth,380);
 assert.equal(a.promptDraftText,'Remove white area and fill the scene');assert.equal(c.promptInput.textContent,a.promptDraftText);
 assert.equal(c.promptInput.dataset.preserveDraftOnce,'1');assert.deepEqual(plain(b),other);assert.deepEqual(calls,['params']);
});
test('applying to another valid node preserves current composer input/settings and legacy once-marker semantics',()=>{
 const {c,a,b,calls}=fixture();c.choice=b;const input=c.promptInput.textContent,settings=plain(c.settings),other=plain(b);
 c.applySmartOutpaintComposer(400,300,a);assert.equal(a.promptDraftText,'Remove white area and fill the scene');
 assert.equal(c.promptInput.textContent,input);assert.deepEqual(plain(c.settings),settings);assert.deepEqual(plain(b),other);
 assert.equal(c.promptInput.dataset.preserveDraftOnce,'1');assert.deepEqual(calls,[]);
});
for(const change of ['missing','replaced','paused','destroyed'])test('outpaint input command is inert for '+change+' targets/sessions',()=>{
 const {c,a,calls}=fixture();if(change==='missing')c.nodes=[];if(change==='replaced')c.nodes[0]={...a};
 if(change==='paused')c.smartComposer.pause();if(change==='destroyed')c.smartComposer.destroy();
 const before=plain({a,settings:c.settings,input:c.promptInput});assert.equal(c.applySmartOutpaintComposer(400,300,a),false);
 assert.deepEqual(plain({a,settings:c.settings,input:c.promptInput}),before);assert.deepEqual(calls,[]);
});
