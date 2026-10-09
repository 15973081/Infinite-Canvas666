// Fixed, byte-identical browser model sources. Shared identity avoids duplicate 49.6 MB caches.
export const MODEL = 'onnx-community/depth-anything-v2-small';
export const REVISION = 'c70d1ddbcd93c9bda8098268cc3554adf5e8dd4f';
export const MODELSCOPE_REVISION = '412694b964262937af8683baa8a5433485787a9a';
export const CACHE_NAME = 'transformers-cache';
export const MODEL_FILES = [
    {path:'config.json',size:38,sha256:'3aee5b9bc4f711ee885c2526d871f0c8c6c8c4b26b8e04253d0167f6a83264f5'},
    {path:'preprocessor_config.json',size:461,sha256:'03576db3c13dd0471fdf5f5e1428befcb95de063fe699879150b293dc9e0a2c6'},
    {path:'onnx/model_fp16.onnx',size:49642442,sha256:'2df6223f206b5164e21f664ace61dabeb9bb6a49b8b5a3e00510b4807d0f5b04'}
];
export function modelUrl(source,path) {
    if(source === 'modelscope') return `https://modelscope.cn/models/${MODEL}/resolve/${MODELSCOPE_REVISION}/${path}`;
    if(source === 'huggingface') return `https://huggingface.co/${MODEL}/resolve/${REVISION}/${path}`;
    throw new Error('未知模型下载源');
}
export async function verifyModelBytes(bytes,file) {
    if(bytes.byteLength !== file.size) throw new Error(`${file.path} 大小不匹配`);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2,'0')).join('');
    if(hash !== file.sha256) throw new Error(`${file.path} SHA-256 校验失败`);
    return bytes;
}
export async function downloadModelFile(file,source,onProgress=()=>{},fetcher=fetch,timeoutMs=30000) {
    const controller = new AbortController();
    let timer, reader;
    const resetTimer = () => {clearTimeout(timer); timer = setTimeout(()=>controller.abort(),timeoutMs);};
    const limitTimer = setTimeout(()=>controller.abort(),240000);
    resetTimer();
    try {
        onProgress({status:'source',file:file.path,source});
        const response = await fetcher(modelUrl(source,file.path),{signal:controller.signal,credentials:'omit'});
        if(!response.ok || response.type === 'opaque') throw new Error(`下载失败 HTTP ${response.status}`);
        const length = response.headers.get('content-length');
        if(length && Number(length) !== file.size) throw new Error(`${file.path} 下载大小不匹配`);
        const bytes = new Uint8Array(file.size); let offset = 0;
        reader = response.body.getReader();
        for(;;) {
            resetTimer(); const {done,value} = await reader.read();
            if(done) break;
            if(offset + value.byteLength > file.size) throw new Error(`${file.path} 下载超过预期大小`);
            bytes.set(value,offset); offset += value.byteLength;
            onProgress({status:'progress',file:file.path,source,progress:offset/file.size*100});
        }
        if(offset !== file.size) throw new Error(`${file.path} 下载不完整`);
        return await verifyModelBytes(bytes,file);
    } catch(error) {
        controller.abort(); try {await reader?.cancel();} catch(_) {}
        if(error.name === 'AbortError') throw new Error(`${source} 下载超时`);
        throw error;
    } finally {clearTimeout(timer); clearTimeout(limitTimer);}
}
export function createDepthModelCache({source='auto',localFiles,onProgress=()=>{},cacheStorage=globalThis.caches,fetcher=fetch}={}) {
    if(!['auto','modelscope','huggingface'].includes(source)) throw new Error('未知模型下载源');
    let cachePromise;
    const pending = new Map(), failures = new Map();
    async function read(file) {
        const responseFrom = bytes => new Response(bytes,{headers:{'content-length':String(file.size),'content-type':'application/octet-stream'}});
        if(localFiles?.length) {
            const entry = localFiles.find(entry => entry.path === file.path);
            if(!entry) throw new Error(`本地目录缺少 ${file.path}`);
            onProgress({status:'source',file:file.path,source:'local'});
            return responseFrom(await verifyModelBytes(await entry.file.arrayBuffer(),file));
        }
        cachePromise ||= cacheStorage?.open(CACHE_NAME).catch(()=>null) || Promise.resolve(null);
        const cache = await cachePromise, key = modelUrl('huggingface',file.path);
        try {
            const cached = await cache?.match(key);
            if(cached) {
                const bytes = await verifyModelBytes(await cached.arrayBuffer(),file);
                onProgress({status:'cache',file:file.path}); return responseFrom(bytes);
            }
        } catch(_) {try {await cache?.delete(key);} catch(_) {}}
        const sources = source === 'auto' ? ['modelscope','huggingface'] : [source];
        const errors = [];
        for(const provider of sources) {
            try {
                const bytes = await downloadModelFile(file,provider,onProgress,fetcher);
                const response = responseFrom(bytes);
                try {await cache?.put(key,response.clone());} catch(_) {onProgress({status:'cache-warning',file:file.path});}
                return response;
            } catch(error) {
                errors.push(`${provider}: ${error.message}`);
                if(provider !== sources.at(-1)) onProgress({status:'fallback',file:file.path,source:sources.at(-1)});
            }
        }
        throw new Error(errors.join('；'));
    }
    return {
        get lastError() {return [...failures.values()].at(-1);},
        async match(request) {
            const url = typeof request === 'string' ? request : request.url;
            const file = MODEL_FILES.find(file => url.endsWith('/'+file.path));
            if(!file) return new Response('',{status:404});
            if(failures.has(file.path)) throw failures.get(file.path);
            if(!pending.has(file.path)) pending.set(file.path,read(file).catch(error=>{failures.set(file.path,error);throw error;}).finally(()=>pending.delete(file.path)));
            return (await pending.get(file.path)).clone();
        },
        async put() {} // Download path stores only complete, hash-verified bytes.
    };
}
