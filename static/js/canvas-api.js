(function(){
    function send(path, init={}, transport=fetch){
        return window.MemberCanvasEdit ? window.MemberCanvasEdit.send(path, init, transport) : transport(path, init);
    }
    async function json(path, init={}, options={}){
        const response = await send(path, init);
        if(options.checkOk && !response.ok){
            const message = await window.CanvasCore?.responseErrorMessage(response, options.errorFallback || '请求失败');
            throw new Error(message || options.errorFallback || '请求失败');
        }
        return response.json();
    }

    async function jsonOr(path, fallback, init={}){
        try {
            const response = await send(path, init);
            if(!response.ok) return fallback;
            return await response.json();
        } catch(e) {
            return fallback;
        }
    }

    function request(path, init={}, options={}){
        const transport = options.transport || fetch;
        return send(path, init, (url, settings) => transport(url, settings, options.transportOptions || {}));
    }

    function jsonBodyInit(method, payload){
        return {
            method,
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify(payload || {})
        };
    }

    function getConfig(){
        return json('/api/config');
    }







    function getAssetLibrary(){
        return json('/api/asset-library');
    }

    function getLocalAssets(fallback={items:[], tree:null}){
        // The member gateway disables the legacy filesystem catalog. Shared
        // workspace assets are still fetched through getAssetLibrary().
        if(window.CanvasSession?.enabled) return Promise.resolve(fallback);
        return jsonOr('/api/local-assets', fallback);
    }

    function getAssetLibraries(){
        return Promise.all([getAssetLibrary(), getLocalAssets()]);
    }

    function listCanvases(){
        return json('/api/canvases', {}, {checkOk:true});
    }

    function listTrashCanvases(fallback=null){
        if(fallback !== null) return jsonOr('/api/canvases/trash', fallback);
        return json('/api/canvases/trash', {}, {checkOk:true});
    }

    function createCanvas(payload){
        return json('/api/canvases', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify(payload || {})
        }, {checkOk:true});
    }

    function getCanvas(id, options={}){
        const path = `/api/canvases/${encodeURIComponent(id)}`;
        if('fallback' in options) return jsonOr(path, options.fallback);
        return json(path, {}, {checkOk:true, errorFallback:options.errorFallback});
    }

    function getCanvasMeta(id, fallback=null){
        return jsonOr(`/api/canvases/${encodeURIComponent(id)}/meta`, fallback);
    }

    function patchCanvasMeta(id, patch){
        return json(`/api/canvases/${encodeURIComponent(id)}/meta`, jsonBodyInit('POST', patch), {checkOk:true});
    }

    function touchCanvas(id, fallback=null){
        return jsonOr(`/api/canvases/${encodeURIComponent(id)}/touch`, fallback, {method:'POST'});
    }

    function saveCanvas(id, payload){
        return request(`/api/canvases/${encodeURIComponent(id)}`, jsonBodyInit('PUT', payload));
    }

    function deleteCanvas(id){
        return request(`/api/canvases/${encodeURIComponent(id)}`, {method:'DELETE'});
    }

    function restoreCanvas(id){
        return request(`/api/canvases/${encodeURIComponent(id)}/restore`, {method:'POST'});
    }

    function purgeCanvas(id){
        return request(`/api/canvases/${encodeURIComponent(id)}/purge`, {method:'DELETE'});
    }

    function moveCanvasToFolder(id, folderId){
        return json(`/api/canvases/${encodeURIComponent(id)}/folder`, jsonBodyInit('PATCH', {folder_id:folderId}), {checkOk:true});
    }

    function createCanvasBackup(id){
        return json(`/api/canvases/${encodeURIComponent(id)}/backup`, {method:'POST'}, {checkOk:true});
    }

    function listCanvasBackups(id, fallback={backups:[]}){
        return jsonOr(`/api/canvases/${encodeURIComponent(id)}/backups`, fallback);
    }

    function restoreCanvasBackup(id, filename){
        return request(`/api/canvases/${encodeURIComponent(id)}/backups/${encodeURIComponent(filename)}/restore`, {method:'POST'});
    }

    function deleteCanvasBackup(id, filename){
        return request(`/api/canvases/${encodeURIComponent(id)}/backups/${encodeURIComponent(filename)}`, {method:'DELETE'});
    }

    let uploadCapabilities;
    async function uploadJson(path, init={}){
        const response = await fetch(path, init);
        const body = await response.json().catch(() => ({}));
        if(!response.ok){
            const error = new Error(typeof body.detail === 'string' ? body.detail : '上传失败，请重试');
            error.status = response.status;
            error.retryAfter = response.headers.get('Retry-After');
            throw error;
        }
        return body;
    }
    async function uploadDigest(blob){
        const input = await blob.arrayBuffer();
        const bytes = crypto.subtle ? await crypto.subtle.digest('SHA-256', input) : await uploadDigestFallback(input);
        return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    async function uploadDigestFallback(input){
        // Web Crypto digest requires HTTPS (except loopback). Keep private LAN
        // development usable, with bounded 8 MiB inputs and periodic UI yields.
        const constants = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
            0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
            0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
            0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
            0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
            0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
            0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
            0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
        const state = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
        const padded = new Uint8Array(Math.ceil((input.byteLength+9)/64)*64);
        padded.set(new Uint8Array(input)); padded[input.byteLength]=128;
        const view = new DataView(padded.buffer), words = new Uint32Array(64);
        view.setUint32(padded.length-8, Math.floor(input.byteLength/0x20000000));
        view.setUint32(padded.length-4, input.byteLength*8);
        const rotate = (value,n) => (value>>>n)|(value<<(32-n));
        for(let offset=0; offset<padded.length; offset+=64){
            for(let i=0;i<16;i++) words[i]=view.getUint32(offset+4*i);
            for(let i=16;i<64;i++){
                const x=words[i-15], y=words[i-2];
                words[i]=words[i-16]+(rotate(x,7)^rotate(x,18)^(x>>>3))+words[i-7]+(rotate(y,17)^rotate(y,19)^(y>>>10));
            }
            let [a,b,c,d,e,f,g,h]=state;
            for(let i=0;i<64;i++){
                const t1=(h+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^(~e&g))+constants[i]+words[i])|0;
                const t2=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))|0;
                h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
            }
            [a,b,c,d,e,f,g,h].forEach((value,i)=>{state[i]=(state[i]+value)|0;});
            if(offset && offset%262144===0) await new Promise(resolve=>setTimeout(resolve,0));
        }
        const output = new DataView(new ArrayBuffer(32));
        state.forEach((value,i)=>output.setUint32(i*4,value));
        return output.buffer;
    }
    async function uploadResumeKey(file){
        const sample = new Blob([file.slice(0, 65536), file.slice(Math.max(0, file.size-65536))]);
        return 'canvas-upload-v1:' + JSON.stringify([file.name, file.size, file.lastModified, await uploadDigest(sample)]);
    }
    function uploadCache(key, value){
        try {
            if(value === null) sessionStorage.removeItem(key);
            else if(value !== undefined) sessionStorage.setItem(key, JSON.stringify(value));
            else return JSON.parse(sessionStorage.getItem(key) || 'null');
        } catch(_) {}
        return null;
    }
    async function resumableUpload(file, options){
        const key = await uploadResumeKey(file);
        let cached = uploadCache(key);
        if(!cached || cached.expires_at <= Date.now()/1000){
            const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte=>byte.toString(16).padStart(2,'0')).join('');
            cached = {idempotency_key:token, expires_at:Date.now()/1000+86400};
            uploadCache(key, cached);
        }
        const signal = options.signal;
        const post = (path, body) => uploadJson(path, {...jsonBodyInit('POST', body), signal});
        let upload;
        try {
            upload = await post('/api/media/uploads', {name:file.name, size:file.size, idempotency_key:cached.idempotency_key});
        } catch(error){
            if(error.status === 409 || error.status === 410) uploadCache(key, null);
            throw error;
        }
        const base = `/api/media/uploads/${encodeURIComponent(upload.media_asset_id)}`;
        uploadCache(key, {...cached, expires_at:upload.expires_at});
        if(upload.status === 'initiating') throw new Error('上传正在初始化，请稍后重试');
        if(upload.status === 'aborted'){
            uploadCache(key, null);
            throw new Error('上传已取消，请重新选择文件');
        }
        const completed = new Map(upload.parts.map(part => [part.part_number, part.sha256]));
        for(let number=1; number<=upload.part_count; number++){
            const offset = (number-1)*upload.part_size;
            const part = file.slice(offset, Math.min(file.size, offset+upload.part_size));
            const sha256 = await uploadDigest(part);
            if(completed.has(number)){
                if(completed.get(number) !== sha256){
                    uploadCache(key, null);
                    throw new Error('续传文件内容已改变，请重新选择文件上传');
                }
            } else {
                for(let attempt=0; ; attempt++){
                    try {
                        const signed = await post(`${base}/parts/${number}`, {sha256});
                        const response = await fetch(signed.url, {method:'PUT', headers:signed.headers, body:part, signal,
                            credentials:signed.url.startsWith('/') ? 'same-origin' : 'omit'});
                        if(!response.ok){
                            const error = new Error('分片上传失败，请重试');
                            error.status = response.status;
                            throw error;
                        }
                        await post(`${base}/parts/${number}/complete`, {});
                        break;
                    } catch(error){
                        if(error.status === 410 || error.status === 409) uploadCache(key, null);
                        if(signal?.aborted || attempt>=2 || (error.status && error.status<500)) throw error;
                        await new Promise(resolve => setTimeout(resolve, 500*(attempt+1)));
                    }
                }
            }
            options.onProgress?.({file, loaded:Math.min(file.size, offset+part.size), total:file.size});
        }
        for(let attempt=0; ; attempt++){
            try {
                upload = await post(`${base}/complete`, {});
                break;
            } catch(error){
                if(signal?.aborted || attempt>=4 || !(error.retryAfter || !error.status || error.status>=500)) throw error;
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        uploadCache(key, null);
        return upload;
    }
    async function uploadAiRaw(form, options={}){
        if(!uploadCapabilities){
            uploadCapabilities = uploadJson('/api/media/uploads/capabilities').catch(error => {
                uploadCapabilities = null;
                throw error;
            });
        }
        const capability = await uploadCapabilities;
        if(!capability.resumable) return json('/api/ai/upload', {method:'POST', body:form}, {...options,checkOk:true});
        const files = form.getAll('files');
        if(files.some(file => !file.size || file.size>capability.max_file_bytes)) throw new Error('文件为空或超过上传大小限制');
        const uploaded = [];
        for(const file of files) uploaded.push(await resumableUpload(file, options));
        return {files:uploaded};
    }
    async function uploadAi(form, options={}){
        const files=form.getAll('files'),total=files.reduce((sum,file)=>sum+(file.size||0),0),loaded=new Map();
        const state=window.StudioTransferStatus?.begin({nodeId:options.nodeId,name:files.length===1 ? files[0].name||'素材' : files.length+' 个素材'});
        try{
            const data=await uploadAiRaw(form,{...options,onProgress:progress=>{loaded.set(progress.file,progress.loaded);state?.progress({loaded:[...loaded.values()].reduce((a,b)=>a+b,0),total});options.onProgress?.(progress);}});
            state?.finish();return data;
        }catch(error){state?.fail(error);throw error;}
    }

    function createAssetItem(payload, options={}){
        return json('/api/asset-library/items', jsonBodyInit('POST', payload), {checkOk:true, ...options});
    }

    function createAssetItemsBatch(payload, options={}){
        return json('/api/asset-library/items/batch', jsonBodyInit('POST', payload), {checkOk:true, ...options});
    }

    function updateAssetItem(id, patch, options={}){
        return json(`/api/asset-library/items/${encodeURIComponent(id)}`, jsonBodyInit('PATCH', patch), {checkOk:true, ...options});
    }

    function deleteAssetItem(id, options={}){
        return json(`/api/asset-library/items/${encodeURIComponent(id)}`, {method:'DELETE'}, {checkOk:true, ...options});
    }

    function deleteAssetItems(payload, options={}){
        return json('/api/asset-library/items/delete', jsonBodyInit('POST', payload), {checkOk:true, ...options});
    }

    function uploadAssetWorkflows(form, options={}){
        return json('/api/asset-library/workflows/upload', {method:'POST', body:form}, {checkOk:true, ...options});
    }

    function createAssetLibrary(payload, options={}){
        return json('/api/asset-library/libraries', jsonBodyInit('POST', payload), {checkOk:true, ...options});
    }

    function updateAssetLibrary(id, patch, options={}){
        return json(`/api/asset-library/libraries/${encodeURIComponent(id)}`, jsonBodyInit('PATCH', patch), {checkOk:true, ...options});
    }

    function deleteAssetLibrary(id, options={}){
        return json(`/api/asset-library/libraries/${encodeURIComponent(id)}`, {method:'DELETE'}, {checkOk:true, ...options});
    }

    function createAssetCategory(payload, options={}){
        return json('/api/asset-library/categories', jsonBodyInit('POST', payload), {checkOk:true, ...options});
    }

    function updateAssetCategory(id, patch, options={}){
        return json(`/api/asset-library/categories/${encodeURIComponent(id)}`, jsonBodyInit('PATCH', patch), {checkOk:true, ...options});
    }

    function deleteAssetCategory(id, options={}){
        return json(`/api/asset-library/categories/${encodeURIComponent(id)}`, {method:'DELETE'}, {checkOk:true, ...options});
    }

    function getPromptLibraries(fallback={library:{libraries:[]}}){
        return jsonOr('/api/prompt-libraries', fallback);
    }

    function createPromptLibrary(payload, options={}){
        return json('/api/prompt-libraries', jsonBodyInit('POST', payload), {checkOk:true, ...options});
    }

    function updatePromptLibrary(id, patch, options={}){
        return json(`/api/prompt-libraries/${encodeURIComponent(id)}`, jsonBodyInit('PATCH', patch), {checkOk:true, ...options});
    }

    function deletePromptLibrary(id, options={}){
        return json(`/api/prompt-libraries/${encodeURIComponent(id)}`, {method:'DELETE'}, {checkOk:true, ...options});
    }

    function createPromptItem(payload, options={}){
        return json('/api/prompt-libraries/items', jsonBodyInit('POST', payload), {checkOk:true, ...options});
    }

    function updatePromptItem(id, patch, options={}){
        return json(`/api/prompt-libraries/items/${encodeURIComponent(id)}`, jsonBodyInit('PATCH', patch), {checkOk:true, ...options});
    }

    function deletePromptItem(id, options={}){
        return json(`/api/prompt-libraries/items/${encodeURIComponent(id)}`, {method:'DELETE'}, {checkOk:true, ...options});
    }

    function deletePromptItems(payload, options={}){
        return json('/api/prompt-libraries/items/delete', jsonBodyInit('POST', payload), {checkOk:true, ...options});
    }

    function createPromptCategory(payload, options={}){
        return json('/api/prompt-libraries/categories', jsonBodyInit('POST', payload), {checkOk:true, ...options});
    }

    function updatePromptCategory(id, patch, options={}){
        return json(`/api/prompt-libraries/categories/${encodeURIComponent(id)}`, jsonBodyInit('PATCH', patch), {checkOk:true, ...options});
    }

    function deletePromptCategory(id, options={}){
        return json(`/api/prompt-libraries/categories/${encodeURIComponent(id)}`, {method:'DELETE'}, {checkOk:true, ...options});
    }

    function listCanvasFolders(){
        return json('/api/canvas-folders', {}, {checkOk:true});
    }

    function createCanvasFolder(payload){
        return json('/api/canvas-folders', jsonBodyInit('POST', payload), {checkOk:true});
    }

    function updateCanvasFolder(id, patch){
        return json(`/api/canvas-folders/${encodeURIComponent(id)}`, jsonBodyInit('PATCH', patch), {checkOk:true});
    }

    function deleteCanvasFolder(id){
        return json(`/api/canvas-folders/${encodeURIComponent(id)}`, {method:'DELETE'}, {checkOk:true});
    }

    function exportCanvasWorkflow(payload){
        return request('/api/canvas-workflows/export', jsonBodyInit('POST', payload));
    }
    function downloadCanvasAssets(payload){
        return request('/api/canvas-assets/download',jsonBodyInit('POST',payload));
    }

    function exportCanvasWorkflowToLibrary(payload){
        return request('/api/canvas-workflows/export-to-library', jsonBodyInit('POST', payload));
    }

    function importCanvasWorkflow(form){
        return request('/api/canvas-workflows/import', {method:'POST', body:form});
    }

    function trimSmartCanvasVideo(payload, options={}){
        return json('/api/smart-canvas/video-trim', jsonBodyInit('POST', payload), {checkOk:true, ...options});
    }

    function bodyInit(payload){
        return payload instanceof FormData ? {method:'POST', body:payload} : jsonBodyInit('POST', payload);
    }

    function uploadCloudVideo(payload, options={}){
        return json('/api/cloud-video/upload', bodyInit(payload), {checkOk:true, ...options});
    }







    function onlineImage(payload, options={}){
        return json('/api/online-image', jsonBodyInit('POST', payload), {checkOk:true, ...options});
    }

    function canvasLLM(payload, options={}){
        return json('/api/canvas-llm', jsonBodyInit('POST', payload), {checkOk:true, ...options});
    }

    function canvasLLMRequest(payload, options={}){
        return request('/api/canvas-llm', jsonBodyInit('POST', payload), options);
    }

    function createCanvasImageTask(payload, options={}){
        return json('/api/canvas-image-tasks', jsonBodyInit('POST', payload), {checkOk:true, ...options});
    }

    function createCanvasImageTaskRequest(payload, options={}){
        return request('/api/canvas-image-tasks', jsonBodyInit('POST', payload), options);
    }

    function getCanvasImageTask(taskId, fallback=null){
        return jsonOr(`/api/canvas-image-tasks/${encodeURIComponent(taskId)}`, fallback);
    }

    function getCanvasImageTaskRequest(taskId, options={}){
        return request(`/api/canvas-image-tasks/${encodeURIComponent(taskId)}`, {signal:AbortSignal.timeout(10000)}, options);
    }

    function createCanvasVideo(payload, options={}){
        return json('/api/canvas-video', jsonBodyInit('POST', payload), {checkOk:true, ...options});
    }

    function createCanvasVideoTaskRequest(payload, options={}){
        return request('/api/canvas-video-tasks', jsonBodyInit('POST', payload), options);
    }

    function getCanvasVideoTaskRequest(taskId, options={}){
        return request(`/api/canvas-video-tasks/${encodeURIComponent(taskId)}`, {signal:AbortSignal.timeout(10000)}, options);
    }

    function getCanvasAudioTaskRequest(taskId, options={}){
        return request(`/api/canvas-audio-tasks/${encodeURIComponent(taskId)}`, {signal:AbortSignal.timeout(10000)}, options);
    }

    function getCanvasLLMTaskRequest(taskId, options={}){
        return request(`/api/canvas-llm-tasks/${encodeURIComponent(taskId)}`, {cache:'no-store',signal:AbortSignal.timeout(10000)}, options);
    }

    function getCanvasModelTaskRequest(taskId, options={}){
        return request(`/api/canvas-model-tasks/${encodeURIComponent(taskId)}`, {signal:AbortSignal.timeout(10000)}, options);
    }

    function getCanvasTaskDeliveriesRequest(canvasId,version,options={}){
        return request(`/api/canvases/${encodeURIComponent(canvasId)}/task-results?delivered_after=${version}`, {cache:'no-store',signal:AbortSignal.timeout(10000)}, options);
    }

    function getCanvasAudioVoices(provider, model, init={}){
        return request('/api/canvas-audio-voices?'+new URLSearchParams({provider_id:provider,model}), {signal:AbortSignal.timeout(25000),...init});
    }

    function setCanvasAudioVoiceFavorite(payload, init={}){
        return request('/api/canvas-audio-voices/favorite', {...jsonBodyInit('PUT',payload),signal:AbortSignal.timeout(10000),...init});
    }

    function registerCanvasAudioVoice(payload, init={}){
        return request('/api/canvas-audio-voices/registration', {...jsonBodyInit('PUT',payload),signal:AbortSignal.timeout(15000),...init});
    }

    function getCanvasAudioVoiceDesignTasks(provider,model,canvasId,nodeId,init={}){
        return request('/api/canvas-audio-voices/design-tasks?'+new URLSearchParams({provider_id:provider,model,canvas_id:canvasId,node_id:nodeId}), {signal:AbortSignal.timeout(15000),...init});
    }

    function deleteCanvasAudioVoice(payload,init={}){
        return request('/api/canvas-audio-voices/delete',{...jsonBodyInit('POST',payload),signal:AbortSignal.timeout(30000),...init});
    }
    function getCanvasAudioVoiceDeleteStatus(payload,init={}){
        return request('/api/canvas-audio-voices/delete-status',{...jsonBodyInit('POST',payload),signal:AbortSignal.timeout(25000),...init});
    }

    function queryImageTask(payload, options={}){
        return json('/api/image-task-query', jsonBodyInit('POST', payload), {checkOk:true, ...options});
    }

    window.CanvasApi = {
        request,
        json,
        jsonOr,
        getConfig,
        getAssetLibrary,
        getLocalAssets,
        getAssetLibraries,
        listCanvases,
        listTrashCanvases,
        createCanvas,
        getCanvas,
        getCanvasMeta,
        patchCanvasMeta,
        touchCanvas,
        saveCanvas,
        deleteCanvas,
        restoreCanvas,
        purgeCanvas,
        moveCanvasToFolder,
        createCanvasBackup,
        listCanvasBackups,
        restoreCanvasBackup,
        deleteCanvasBackup,
        uploadAi,
        createAssetItem,
        createAssetItemsBatch,
        updateAssetItem,
        deleteAssetItem,
        deleteAssetItems,
        uploadAssetWorkflows,
        createAssetLibrary,
        updateAssetLibrary,
        deleteAssetLibrary,
        createAssetCategory,
        updateAssetCategory,
        deleteAssetCategory,
        getPromptLibraries,
        createPromptLibrary,
        updatePromptLibrary,
        deletePromptLibrary,
        createPromptItem,
        updatePromptItem,
        deletePromptItem,
        deletePromptItems,
        createPromptCategory,
        updatePromptCategory,
        deletePromptCategory,
        listCanvasFolders,
        createCanvasFolder,
        updateCanvasFolder,
        deleteCanvasFolder,
        exportCanvasWorkflow,
        downloadCanvasAssets,
        exportCanvasWorkflowToLibrary,
        importCanvasWorkflow,
        trimSmartCanvasVideo,
        uploadCloudVideo,
        onlineImage,
        canvasLLM,
        canvasLLMRequest,
        createCanvasImageTask,
        createCanvasImageTaskRequest,
        getCanvasImageTask,
        getCanvasImageTaskRequest,
        createCanvasVideo,
        createCanvasVideoTaskRequest,
        getCanvasVideoTaskRequest,
        getCanvasAudioTaskRequest,
        getCanvasLLMTaskRequest,
        getCanvasModelTaskRequest,
        getCanvasTaskDeliveriesRequest,
        getCanvasAudioVoices,
        setCanvasAudioVoiceFavorite,
        registerCanvasAudioVoice,
        getCanvasAudioVoiceDesignTasks,
        deleteCanvasAudioVoice,
        getCanvasAudioVoiceDeleteStatus,
        queryImageTask
    };
})();
