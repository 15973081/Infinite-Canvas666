/* Catalog-only transport. No document saves, providers, media uploads or tasks. */
(() => {
    'use strict';
    const pending=new Set();
    let epoch=0;
    const id=value=>encodeURIComponent(value);
    const body=(method,value)=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
    async function request(path,init={},raw=false){
        const operation=(async()=>{
            if(window.CanvasSession)await window.CanvasSession.ready;
            let response;
            if(window.CanvasSession?.enabled){
                const target=window.CanvasDirectoryWrites.matches(path,init);
                response=target ? await window.CanvasDirectoryWrites.write(target,path,init) : await fetch(path,init);
            }else response=await fetch(path,init);
            if(!response.ok){
                const data=await response.clone().json().catch(()=>({}));
                throw new Error(typeof data.detail==='string'?data.detail:data.detail?.message||({permission_denied:'当前账号没有此操作权限。',canvas_revision_conflict:'画布已更新，请刷新后重试。'}[data.detail?.code])||'请求失败，请重试。');
            }
            return raw?response:response.json();
        })();
        if(!['GET','HEAD'].includes((init.method||'GET').toUpperCase())){
            epoch++;
            pending.add(operation);
            const finished=()=>{epoch++;pending.delete(operation);};
            operation.then(finished,finished);
        }
        return operation;
    }
    window.CanvasDirectoryApi=Object.freeze({
        get busy(){return pending.size>0;},
        get epoch(){return epoch;},
        async flush(){
            let success=true;
            while(pending.size){
                const results=await Promise.allSettled([...pending]);
                if(results.some(result=>result.status==='rejected'))success=false;
            }
            return success;
        },
        listCanvases:()=>request('/api/canvases'),
        listTrashCanvases:()=>request('/api/canvases/trash'),
        createCanvas:value=>request('/api/canvases',body('POST',value)),
        patchCanvasMeta:(key,value)=>request('/api/canvases/'+id(key)+'/meta',body('POST',value)),
        moveCanvasToFolder:(key,folder)=>request('/api/canvases/'+id(key)+'/folder',body('PATCH',{folder_id:folder})),
        deleteCanvas:key=>request('/api/canvases/'+id(key),{method:'DELETE'},true),
        restoreCanvas:key=>request('/api/canvases/'+id(key)+'/restore',{method:'POST'},true),
        purgeCanvas:key=>request('/api/canvases/'+id(key)+'/purge',{method:'DELETE'},true),
        listCanvasFolders:()=>request('/api/canvas-folders'),
        createCanvasFolder:value=>request('/api/canvas-folders',body('POST',value)),
        updateCanvasFolder:(key,value)=>request('/api/canvas-folders/'+id(key),body('PATCH',value)),
        deleteCanvasFolder:key=>request('/api/canvas-folders/'+id(key),{method:'DELETE'})
    });
})();
