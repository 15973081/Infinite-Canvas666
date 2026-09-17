const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('static/js/asset-manager.js','utf8').replace(/\r/g,'');
const start=src.indexOf('function canvasCatalogMutationMessage('),ctx={};
vm.runInNewContext(src.slice(start,src.indexOf('\n}',start)+2),ctx);
test('pending staging is never reported as completely deleted',()=>{
 const message=ctx.canvasCatalogMutationMessage('purge',{changed:0,pending:[{key:'a'}],failures:[]});
 assert.match(message,/已完成彻底删除 0 项/);assert.match(message,/正式文件已删除，暂存清理待完成 1 项/);
});
test('partial failure and completed deletions are reported separately',()=>{
 const message=ctx.canvasCatalogMutationMessage('purge',{changed:2,pending:[{}],failures:[{message:'denied'}]});
 assert.match(message,/彻底删除 2 项/);assert.match(message,/待完成 1 项/);assert.match(message,/文件清理失败 1 项/);
});
