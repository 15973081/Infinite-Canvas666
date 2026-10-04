const {readCanvasSource} = require('./helpers/canvas-source.cjs');
const test=require('node:test');
const assert=require('node:assert/strict');
const media=require('../static/js/member-media.js');
const fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 const links=[];
 const win={location:{href:'https://studio.example/static/canvas.html'},
 CanvasSession:{enabled:true,context:{member:{id:'member-a'},workspace:{id:'space-a',permissions:['canvas.export']}}},
 document:{createElement(){const a={click(){a.clicked=true;},remove(){a.removed=true;}};links.push(a);return a;},body:{appendChild(){}}}};
 return {win,links};
}
test('cloud download navigates with scoped identity and never fetches a blob',()=>{
 const {win,links}=fixture();
 assert.equal(media.download('/assets/cloud/ast_abc/image.png','image.png',win),true);
 assert.equal(links[0].href,'/assets/cloud/ast_abc/image.png?workspace=space-a&member=member-a');
 assert.equal(links[0].target,'_blank');assert.equal(links[0].rel,'noopener');
 assert.ok(links[0].clicked && links[0].removed);
});
test('download cannot bypass export permission or use another workspace',()=>{
 const {win,links}=fixture();
 assert.throws(()=>media.download('/api/media/ast_abc/content?workspace=other','x',win));
 win.CanvasSession.context.workspace.permissions=[];
 assert.throws(()=>media.download('/assets/cloud/ast_abc/x','x',win));assert.equal(links.length,0);
});
test('local and external downloads retain existing behavior',()=>{
 const {win,links}=fixture();
 assert.equal(media.download('https://other.example/x','x',win),false);
 win.CanvasSession.enabled=false;
 assert.equal(media.download('/output/x.png','x',win),false);assert.equal(links.length,0);
});
for(const [file,name,next] of [['canvas.js','downloadUrl','setOutputCompareMode'],['smart-canvas.js','downloadPreviewImage','downloadPreviewFile'],['smart-canvas.js','downloadPreviewFile','previewDownloadGroupItems']]){
 test(file+' '+name+' uses the scoped download path',async()=>{
  const {win,links}=fixture();win.MemberMediaDownload=(url,name)=>media.download(url,name,win);
  const source=readCanvasSource('static/js/'+file,'utf8');
  const start=source.indexOf((name==='downloadUrl'?'async ':'')+'function '+name+'('),end=source.indexOf('function '+next+'(',start);
  const ctx={window:win,nodes:[{id:'n',images:[{url:'/assets/cloud/ast_abc/x.png'}]}],smartImageEditor:{state:{nodeId:'n',imageIndex:0}},downloadNameForMediaItem:()=> 'x.png'};
  vm.runInNewContext(source.slice(start,end),ctx);
  if(name==='downloadUrl')await ctx[name]('/assets/cloud/ast_abc/x.png','x.png');
  else ctx[name]({url:'/assets/cloud/ast_abc/x.png'});
  assert.equal(links.length,1);assert.ok(links[0].clicked);
 });
}

for(const extension of ['png','mp4','mp3'])test('asset manager single '+extension+' uses scoped cloud media, not legacy proxy',()=>{
 const {win,links}=fixture();win.MemberMediaDownload=(url,name)=>media.download(url,name,win);
 const source=readCanvasSource('static/js/asset-manager.js','utf8');
 const start=source.indexOf('function downloadAssetItem('),end=source.indexOf('const SMART_CANVAS_ASSET_INBOX_KEY',start);
 const item={url:'/assets/cloud/ast_abc/file.'+extension};
 const ctx={window:win,findAssetItem:()=>item,assetDownloadName:()=> 'file.'+extension,setStatus:s=>ctx.status=s,
 downloadUrl(){throw new Error('cloud asset must not call legacy proxy');}};
 vm.runInNewContext(source.slice(start,end),ctx);ctx.downloadAssetItem('asset');
 assert.equal(links.length,1);assert.ok(links[0].clicked);assert.match(links[0].href,/workspace=space-a/);
 win.CanvasSession.paused=true;ctx.downloadAssetItem('asset');assert.equal(links.length,1);
 assert.notEqual(ctx.status,'已开始下载');
});
test('asset manager legacy download keeps attachment endpoint',()=>{
 const source=readCanvasSource('static/js/asset-manager.js','utf8');
 const start=source.indexOf('function downloadAssetItem('),end=source.indexOf('const SMART_CANVAS_ASSET_INBOX_KEY',start);
 let requested='';const ctx={window:{},findAssetItem:()=>({url:'/assets/local.png'}),assetDownloadName:()=> 'local.png',setStatus(){},downloadUrl:url=>requested=url};
 vm.runInNewContext(source.slice(start,end),ctx);ctx.downloadAssetItem('asset');assert.match(requested,/^\/api\/download-output\?/);
});
