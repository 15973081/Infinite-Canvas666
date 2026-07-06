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

    window.CanvasApi = {
        request,
        json,
        jsonOr,
        getConfig,
        getWorkflows,
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
        uploadAi
    };
})();
