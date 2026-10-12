// Lazy, browser-only inference. No source frame is sent to a server.
import {MODEL, REVISION, createDepthModelCache} from './local-depth-model-loader.js';
let estimator, RawImage, modelCache;
// Keep the JS bundle and its ONNX/WASM binaries on the same pinned release.
const runtimeSources = [
    'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/',
    'https://fastly.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/',
    'https://unpkg.com/@huggingface/transformers@3.8.1/dist/'
];
const networkFailure = error => /fetch|network|import|load failed|loading.*module|下载超时/i.test(error?.message || String(error));
async function loadRuntime(url){
    let timer;
    try {
        return await Promise.race([import(url),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('推理运行库下载超时')),30000);})]);
    } finally {clearTimeout(timer);}
}
self.onmessage = async ({data}) => {
    const {id, type} = data;
    const runtimeIndex = Number.isInteger(data.runtimeIndex) && runtimeSources[data.runtimeIndex] ? data.runtimeIndex : 0;
    let stage = type === 'load' ? 'runtime' : 'inference';
    try {
        if(type === 'load') {
            const runtimeBase = runtimeSources[runtimeIndex];
            self.postMessage({type:'progress',progress:{status:'runtime',source:new URL(runtimeBase).hostname}});
            const transformers = await loadRuntime(runtimeBase+'transformers.min.js');
            RawImage = transformers.RawImage;
            transformers.env.backends.onnx.wasm.wasmPaths = runtimeBase;
            transformers.env.allowLocalModels = true;
            transformers.env.allowRemoteModels = false;
            transformers.env.useBrowserCache = false;
            transformers.env.useCustomCache = true;
            modelCache = transformers.env.customCache = createDepthModelCache({
                source:data.source, localFiles:data.files,
                onProgress:progress => self.postMessage({type:'progress',progress})
            });
            stage = 'initialization';
            estimator = await transformers.pipeline('depth-estimation', MODEL, {
                revision:REVISION, device:'webgpu', dtype:'fp16',
                progress_callback:progress => self.postMessage({type:'progress', progress})
            });
            self.postMessage({id, type:'ready'});
        } else if(type === 'frame') {
            if(!estimator) throw new Error('模型尚未加载');
            const result = await estimator(new RawImage(new Uint8ClampedArray(data.pixels), data.width, data.height, 4));
            const depth = result.depth;
            const pixels = Uint8Array.from(depth.data);
            self.postMessage({id, type:'frame', pixels:pixels.buffer, width:depth.width, height:depth.height, channels:depth.channels}, [pixels.buffer]);
        }
    } catch(error) {
        if(modelCache?.lastError)stage='model';
        else if(type==='load' && networkFailure(error))stage='runtime';
        self.postMessage({id, type:'error', stage,
            retryRuntime:stage==='runtime' && runtimeIndex+1<runtimeSources.length,
            message:modelCache?.lastError?.message || error?.message || String(error)});
    }
};
