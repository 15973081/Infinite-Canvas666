(function(){
    async function json(path, init={}, options={}){
        const response = await fetch(path, init);
        if(options.checkOk && !response.ok){
            const message = await window.CanvasCore?.responseErrorMessage(response, options.errorFallback || '请求失败');
            throw new Error(message || options.errorFallback || '请求失败');
        }
        return response.json();
    }

    async function jsonOr(path, fallback, init={}){
        try {
            const response = await fetch(path, init);
            if(!response.ok) return fallback;
            return await response.json();
        } catch(e) {
            return fallback;
        }
    }

    function request(path, init={}){
        return fetch(path, init);
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

    function getWorkflows(fallback={workflows:[]}){
        return jsonOr('/api/workflows', fallback);
    }

    function getWorkflow(name, fallback=null){
        return jsonOr(`/api/workflows/${encodeURIComponent(name)}`, fallback);
    }

    function runWorkflow(name, payload, options={}){
        return json(`/api/workflows/${encodeURIComponent(name)}/run`, jsonBodyInit('POST', payload), {checkOk:true, ...options});
    }

    function getAssetLibrary(){
        return json('/api/asset-library');
    }

    function getLocalAssets(fallback={items:[], tree:null}){
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

    function checkCanvasLock(id){
        return jsonOr(`/api/canvases/${encodeURIComponent(id)}/lock`, null);
    }

    function acquireCanvasLock(id, payload){
        return request(`/api/canvases/${encodeURIComponent(id)}/lock`, jsonBodyInit('POST', payload));
    }

    function releaseCanvasLock(id, clientId){
        return request(`/api/canvases/${encodeURIComponent(id)}/lock?client_id=${encodeURIComponent(clientId)}`, {method:'DELETE'});
    }

    function releaseCanvasLockKeepalive(id, payload){
        return request(`/api/canvases/${encodeURIComponent(id)}/lock/release`, {
            ...jsonBodyInit('POST', payload),
            keepalive:true
        });
    }

    function uploadAi(form, options={}){
        return json('/api/ai/upload', {method:'POST', body:form}, options);
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

    function exportCanvasWorkflowToLibrary(payload){
        return request('/api/canvas-workflows/export-to-library', jsonBodyInit('POST', payload));
    }

    function importCanvasWorkflow(form){
        return request('/api/canvas-workflows/import', {method:'POST', body:form});
    }

    function getRunningHubWorkflow(workflowId, fallback=null){
        return jsonOr(`/api/runninghub/workflows/${encodeURIComponent(workflowId)}`, fallback);
    }

    function getRunningHubAppInfo(webappId){
        return json(`/api/runninghub/app-info?webappId=${encodeURIComponent(webappId)}`, {}, {checkOk:true});
    }

    function getRunningHubWorkflowInfo(workflowId){
        return json(`/api/runninghub/workflow-info?workflowId=${encodeURIComponent(workflowId)}`, {}, {checkOk:true});
    }

    function bodyInit(payload){
        return payload instanceof FormData ? {method:'POST', body:payload} : jsonBodyInit('POST', payload);
    }

    function uploadRunningHubAsset(payload, options={}){
        return json('/api/runninghub/upload-asset', bodyInit(payload), {checkOk:true, ...options});
    }

    function submitRunningHub(mode, payload){
        const endpoint = mode === 'workflow' ? '/api/runninghub/workflow-submit' : '/api/runninghub/submit';
        return request(endpoint, jsonBodyInit('POST', payload));
    }

    function queryRunningHubTask(taskId){
        return json(`/api/runninghub/query?taskId=${encodeURIComponent(taskId)}`, {}, {checkOk:true});
    }

    function uploadCloudVideo(payload, options={}){
        return json('/api/cloud-video/upload', bodyInit(payload), {checkOk:true, ...options});
    }

    function uploadGeneric(form, options={}){
        return json('/api/upload', {method:'POST', body:form}, {checkOk:true, ...options});
    }

    function generate(payload, options={}){
        return json('/api/generate', jsonBodyInit('POST', payload), {checkOk:true, ...options});
    }

    function onlineImage(payload, options={}){
        return json('/api/online-image', jsonBodyInit('POST', payload), {checkOk:true, ...options});
    }

    function canvasLLM(payload, options={}){
        return json('/api/canvas-llm', jsonBodyInit('POST', payload), {checkOk:true, ...options});
    }

    function createCanvasImageTask(payload, options={}){
        return json('/api/canvas-image-tasks', jsonBodyInit('POST', payload), {checkOk:true, ...options});
    }

    function getCanvasImageTask(taskId, fallback=null){
        return jsonOr(`/api/canvas-image-tasks/${encodeURIComponent(taskId)}`, fallback);
    }

    function createCanvasVideo(payload, options={}){
        return json('/api/canvas-video', jsonBodyInit('POST', payload), {checkOk:true, ...options});
    }

    function queryImageTask(payload, options={}){
        return json('/api/image-task-query', jsonBodyInit('POST', payload), {checkOk:true, ...options});
    }

    window.CanvasApi = {
        request,
        json,
        jsonOr,
        getConfig,
        getWorkflows,
        getWorkflow,
        runWorkflow,
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
        checkCanvasLock,
        acquireCanvasLock,
        releaseCanvasLock,
        releaseCanvasLockKeepalive,
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
        exportCanvasWorkflowToLibrary,
        importCanvasWorkflow,
        getRunningHubWorkflow,
        getRunningHubAppInfo,
        getRunningHubWorkflowInfo,
        uploadRunningHubAsset,
        submitRunningHub,
        queryRunningHubTask,
        uploadCloudVideo,
        uploadGeneric,
        generate,
        onlineImage,
        canvasLLM,
        createCanvasImageTask,
        getCanvasImageTask,
        createCanvasVideo,
        queryImageTask
    };
})();
