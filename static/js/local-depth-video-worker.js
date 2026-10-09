// Lazy, browser-only inference. No source frame is sent to a server.
import {MODEL, REVISION, createDepthModelCache} from './local-depth-model-loader.js';
let estimator, RawImage, modelCache;
self.onmessage = async ({data}) => {
    const {id, type} = data;
    try {
        if(type === 'load') {
            const transformers = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js');
            RawImage = transformers.RawImage;
            transformers.env.allowLocalModels = true;
            transformers.env.allowRemoteModels = false;
            transformers.env.useBrowserCache = false;
            transformers.env.useCustomCache = true;
            modelCache = transformers.env.customCache = createDepthModelCache({
                source:data.source, localFiles:data.files,
                onProgress:progress => self.postMessage({type:'progress',progress})
            });
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
        self.postMessage({id, type:'error', message:modelCache?.lastError?.message || error?.message || String(error)});
    }
};
