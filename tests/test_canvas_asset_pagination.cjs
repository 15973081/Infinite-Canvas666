const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../static/js/asset-manager.js'),'utf8').replace(/\r\n/g,'\n');
function load(ctx,name){const start=source.indexOf(`function ${name}(`);
    vm.runInContext(source.slice(name==='loadCanvasAssetPage'?start-6:start,source.indexOf('\n}',start)+2),ctx);}
test('page requests are bounded, encode filters and discard out-of-order replies including aborted transports',async()=>{
    const pending=[];
    const ctx=vm.createContext({URLSearchParams,AbortController,setTimeout,clearTimeout,canvasAssetRequest:null,canvasAssetRequestToken:0,
        canvasAssetTrashMode:false,canvasAssetSourceState:'active',activeCanvasAssetCategory:'smart',
        activeCanvasAssetCanvasId:'',canvasAssetQuery:'',canvasAssetSort:'canvas_asc',canvasAssetsData:{items:[]},
        apiJson:(url,options)=>new Promise(resolve=>pending.push({url,options,resolve}))});
    load(ctx,'canvasAssetPageUrl');load(ctx,'loadCanvasAssetPage');
    const old=ctx.loadCanvasAssetPage();ctx.canvasAssetQuery='中文 & %_';const newer=ctx.loadCanvasAssetPage(60);
    assert.equal(pending[0].options.signal.aborted,true);
    const params=new URL('https://test'+pending[1].url).searchParams;
    assert.equal(params.get('limit'),'60');assert.equal(params.get('offset'),'60');assert.equal(params.get('query'),'中文 & %_');
    pending[1].resolve({items:[{id:'new'}],total:121,limit:60});assert.equal(await newer,true);
    pending[0].resolve({items:[{id:'old'}]});assert.equal(await old,false);assert.equal(ctx.canvasAssetsData.items[0].id,'new');
    const superseded=ctx.loadCanvasAssetPage();ctx.activeCanvasAssetCategory='classic';pending[2].resolve({items:[{id:'wrong-filter'}]});
    assert.equal(await superseded,false);assert.equal(ctx.canvasAssetsData.items[0].id,'new');
});

test('a timeout during JSON decoding cannot replace the page with an empty success',async()=>{
    let expire,respond;
    const ctx=vm.createContext({URLSearchParams,AbortController,setTimeout:fn=>{expire=fn;return 1;},clearTimeout(){},
        canvasAssetRequest:null,canvasAssetRequestToken:0,canvasAssetTrashMode:false,canvasAssetSourceState:'active',
        activeCanvasAssetCategory:'smart',activeCanvasAssetCanvasId:'',canvasAssetQuery:'',canvasAssetSort:'canvas_asc',
        canvasAssetsData:{items:[{id:'retained'}]},apiJson:()=>new Promise(resolve=>respond=resolve)});
    load(ctx,'canvasAssetPageUrl');load(ctx,'loadCanvasAssetPage');
    const pending=ctx.loadCanvasAssetPage();expire();respond({});
    await assert.rejects(pending,/请求超时/);assert.equal(ctx.canvasAssetsData.items[0].id,'retained');
});
