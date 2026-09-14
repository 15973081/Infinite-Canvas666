const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const mediaUrl = require('../static/js/member-media.js');
const source = fs.readFileSync(path.join(__dirname, '../static/js/asset-manager.js'), 'utf8').replace(/\r\n/g,'\n');
function fixture(){
 const session={enabled:true,context:{member:{id:'member-a'},workspace:{id:'space-a'}}};
 const opened=[],appended=[];
 const document={querySelector:()=>null,createElement:()=>({dataset:{},click(){this.clicked=true;},remove(){this.removed=true;}}),body:{appendChild:e=>appended.push(e),classList:{add:()=>{}}}};
 const context=vm.createContext({window:{MemberMediaUrl:u=>mediaUrl(u,session,'http://localhost:8772/static/asset-manager.html'),open:(...args)=>opened.push(args)},document,escapeHtml:String,escapeAttr:s=>String(s).replaceAll('&','&amp;'),setStatus:()=>{}});
 for(const name of ['assetDisplayMediaUrl','openAssetUrl','assetKind','assetMediaPreviewUrl','assetThumb','downloadUrl','showDetailPreview','openAssetItem','openLocalItem']){
  const start=source.search(new RegExp('^(?:async )?function '+name+'\\(','m'));assert.ok(start>=0,name);
  vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),context);
 }
 return {context,session,opened,appended};
}
function assertBound(url){const u=new URL(url.replaceAll('&amp;','&'),'http://localhost:8772');assert.equal(u.searchParams.get('workspace'),'space-a');assert.equal(u.searchParams.get('member'),'member-a');return u;}
test('asset thumbnail and detail reuse bound preview URLs without changing saved references',()=>{
 const {context:c}=fixture(),item={url:'/assets/cloud/ast_demo/image.png',name:'image',kind:'image'};
 const original=JSON.stringify(item),html=c.assetThumb(item);
 const u=assertBound(html.match(/src="([^"]+)"/)[1]);assert.equal(u.pathname,'/api/media-preview');assert.equal(u.searchParams.get('url'),item.url);
 assert.ok(html.includes('data-original-src="'+item.url+'"'));assert.equal(JSON.stringify(item),original);
});
test('direct media API videos remain video elements after identity query binding',()=>{
 const {context:c}=fixture();const html=c.assetThumb({url:'/api/media/ast_demo/content',kind:'video'});
 assert.ok(html.startsWith('<video'));assertBound(html.match(/src="([^"]+)"/)[1]);
});
test('image and video lightboxes bind all asset catalog sources',()=>{
 const {context:c,appended}=fixture();
 for(const kind of ['image','video'])for(const sourceName of ['assets','canvas-asset','local','localup']){
  const item={url:'/assets/demo.'+(kind==='image'?'png':'mp4'),name:'demo',kind};
  c.findAssetItem=c.findCanvasAssetItem=c.findLocalItem=c.findLocalUpload=()=>item;c.localObjectUrl=i=>i.url;
  c.showDetailPreview(sourceName,'id');const html=appended.at(-1).innerHTML;
  assert.ok(html.includes(kind==='image'?'<img':'<video'));assertBound(html.match(/src="([^"]+)"/)[1]);assert.equal(item.url,'/assets/demo.'+(kind==='image'?'png':'mp4'));
 }
});
test('open original and single file download carry member and space and refuse paused context',()=>{
 const {context:c,session,opened,appended}=fixture();c.findAssetItem=c.findLocalItem=()=>({url:'/assets/demo.png'});c.localObjectUrl=i=>i.url;
 c.openAssetItem('id');c.openLocalItem('id');c.downloadUrl('/assets/workflow.zip','workflow.zip');
 assert.equal(opened.length,2);opened.forEach(args=>{assertBound(args[0]);assert.equal(args[2],'noopener');});
 assertBound(appended[0].href);assert.equal(appended[0].download,'workflow.zip');assert.ok(appended[0].clicked);
 session.paused=true;c.openAssetItem('id');c.downloadUrl('/assets/demo.png');assert.equal(opened.length,2);assert.equal(appended.length,1);
});
test('thumbnail error handler binds original once instead of issuing an unscoped retry',()=>{
 const {context:c}=fixture();let errorHandler;
 c.HTMLImageElement=class {};c.root={addEventListener:(name,handler)=>errorHandler=handler};
 const start=source.indexOf("root.addEventListener('error',");vm.runInContext(source.slice(start,source.indexOf('}, true);',start)+9),c);
 const img=new c.HTMLImageElement();img.dataset={originalSrc:'/assets/demo.png'};img.src='/api/media-preview?failed=1';
 errorHandler({target:img});assertBound(img.src);assert.equal(img.dataset.originalSrc,undefined);const bound=img.src;errorHandler({target:img});assert.equal(img.src,bound);
});
