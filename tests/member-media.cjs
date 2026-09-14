const test=require('node:test');const assert=require('node:assert/strict');const mediaUrl=require('../static/js/member-media.js');
const session={enabled:true,context:{member:{id:'m'},workspace:{id:'w'}}},base='http://canvas.test/static/canvas.html';
test('rendered originals and previews bind workspace and member without changing canonical input',()=>{
 for(const source of ['/assets/cloud/ast_a/result.png','/output/movie.mp4','/api/media-preview?w=512&url=%2Fassets%2Fresult.png','/api/media/ast_a/content']){
  const result=new URL(mediaUrl(source,session,base),base);assert.equal(result.searchParams.get('workspace'),'w');assert.equal(result.searchParams.get('member'),'m');
  assert.equal(mediaUrl(result.href,session,base),result.pathname+result.search);
 }
});
test('foreign scoped media never silently rebind to a different account or workspace',()=>{
 assert.equal(mediaUrl('/assets/x.png?workspace=other',session,base),'');assert.equal(mediaUrl('/api/media/a/signed?member=other',session,base),'');
});
test('paused or not-yet-bound member pages cannot create new media requests',()=>{assert.equal(mediaUrl('/assets/x.png',{...session,paused:true},base),'');assert.equal(mediaUrl('/assets/x.png',{enabled:true},base),'');});
test('external data blob URLs and legacy pages stay unchanged',()=>{for(const url of ['https://remote.test/x.png','data:image/png;base64,a','blob:http://canvas.test/abc'])assert.equal(mediaUrl(url,session,base),url);assert.equal(mediaUrl('/assets/a.png',{},base),'/assets/a.png');});
