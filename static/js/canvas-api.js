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

    function uploadAi(form, options={}){
        return json('/api/ai/upload', {method:'POST', body:form}, options);
    }

    window.CanvasApi = {
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
        uploadAi
    };
})();
