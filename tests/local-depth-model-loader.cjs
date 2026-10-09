const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync('static/js/local-depth-model-loader.js','utf8');
const loader=import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const config=new TextEncoder().encode('{\r\n  "model_type": "depth_anything"\r\n}');
function storage(){
    const entries=new Map(),writes=[];
    const cache={match:async key=>entries.get(key)?.clone(),put:async(key,response)=>{entries.set(key,response);writes.push(key)},delete:async key=>entries.delete(key)};
    return {entries,writes,open:async()=>cache};
}
test('fixed ModelScope mirror falls back to Hugging Face only in auto mode',async()=>{
    const m=await loader,requests=[],progress=[],cache=storage();
    const fetcher=async(url,options)=>{assert.equal(options.credentials,'omit');requests.push(url);return url.includes('modelscope.cn')?new Response('',{status:503}):new Response(config)};
    const model=m.createDepthModelCache({cacheStorage:cache,fetcher,onProgress:p=>progress.push(p)});
    const response=await model.match(m.modelUrl('huggingface','config.json'));
    assert.equal((await response.arrayBuffer()).byteLength,38);assert.equal(requests.length,2);
    assert.match(requests[0],/modelscope\.cn\/models\/onnx-community\/depth-anything-v2-small\/resolve\/412694b964262937af8683baa8a5433485787a9a\//);
    assert.ok(progress.some(p=>p.status==='fallback'&&p.source==='huggingface'));assert.equal(cache.writes.length,1);
    const pinned=m.createDepthModelCache({source:'modelscope',cacheStorage:null,fetcher});
    await assert.rejects(pinned.match(m.modelUrl('huggingface','config.json')),/503/);
    assert.equal(requests.length,3,'manual source does not silently use the other provider');
});
test('both providers reuse one verified browser cache; corrupt entries are replaced',async()=>{
    const m=await loader,cache=storage(),requests=[];
    const fetcher=async url=>{requests.push(url);return new Response(config)};
    const key=m.modelUrl('huggingface','config.json');
    await m.createDepthModelCache({source:'modelscope',cacheStorage:cache,fetcher}).match(key);
    await m.createDepthModelCache({source:'huggingface',cacheStorage:cache,fetcher}).match(key);
    assert.equal(requests.length,1);assert.match(requests[0],/modelscope\.cn/);assert.equal(cache.entries.size,1);
    cache.entries.set(key,new Response(new Uint8Array(38)));
    await m.createDepthModelCache({source:'huggingface',cacheStorage:cache,fetcher}).match(key);
    assert.equal(requests.length,2);assert.equal(cache.writes.length,2);
});
test('wrong hashes and partial downloads never enter cache or trigger repeated hidden downloads',async()=>{
    const m=await loader,cache=storage();let calls=0;
    const model=m.createDepthModelCache({source:'modelscope',cacheStorage:cache,fetcher:async()=>{calls++;return new Response(new Uint8Array(38))}});
    const key=m.modelUrl('huggingface','config.json');
    await assert.rejects(model.match(key),/SHA-256/);await assert.rejects(model.match(key),/SHA-256/);
    assert.equal(calls,1);assert.equal(cache.writes.length,0);assert.match(model.lastError.message,/SHA-256/);
    await assert.rejects(m.downloadModelFile(m.MODEL_FILES[0],'modelscope',()=>{},async()=>new Response(config.slice(0,10))),/不完整/);
    await assert.rejects(m.downloadModelFile(m.MODEL_FILES[0],'modelscope',()=>{},async()=>new Response(new Uint8Array(39))),/超过/);
});
test('slow download times out; denied storage still permits verified local processing',async()=>{
    const m=await loader;
    await assert.rejects(m.downloadModelFile(m.MODEL_FILES[0],'modelscope',()=>{},(_,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')))),5),/超时/);
    const denied={open:async()=>{throw Error('denied')}};
    const online=m.createDepthModelCache({source:'modelscope',cacheStorage:denied,fetcher:async()=>new Response(config)});
    const key=m.modelUrl('huggingface','config.json');assert.equal((await (await online.match(key)).arrayBuffer()).byteLength,38);
    const local=m.createDepthModelCache({localFiles:[{path:'config.json',file:new Blob([config])}],fetcher:async()=>{throw Error('must not download')}});
    assert.equal((await (await local.match(key)).arrayBuffer()).byteLength,38);
});
