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
                response=target ? (window.MemberCanvasEdit?.send
                    ? await window.MemberCanvasEdit.send(path,init)
                    : await window.CanvasDirectoryWrites.write(target,path,init)) : await fetch(path,init);
            }else response=await fetch(path,init);
            if(!response.ok){
                const data=await response.clone().json().catch(()=>({}));
                const error=new Error(typeof data.detail==='string'?data.detail:data.detail?.message||({permission_denied:'当前账号没有此操作权限。',canvas_revision_conflict:'画布已更新，请刷新后重试。',folder_deletion_plan_changed:'目录内容已变化，请重新打开确认。',folder_deletion_operation_conflict:'原删除操作已变化，请查询原回执。',canvas_lease_lost:'目标画布的编辑资格已变化，操作尚未确认。',directory_target_changed:'目录目标已变化，请刷新后重新拖动。',directory_target_not_found:'目录目标已删除或不可访问，请刷新目录。',directory_placement_cycle:'不能把文件夹移到自己或自己的子文件夹。',directory_placement_invalid:'此位置不能接收该目录项目。',member_directory_placement_required:'请在空间工作台中移动目录项目。'}[data.detail?.code])||'请求失败，请重试。');
                error.status=response.status;error.data=data.detail;throw error;
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
        placeDirectoryItem:(kind,key,value)=>request('/api/'+(kind==='folder'?'canvas-folders':'canvases')+'/'+id(key)+'/placement',body('PATCH',value)),
        deleteCanvasFolder:key=>request('/api/canvas-folders/'+id(key),{method:'DELETE'}),
        prepareFolderTreeDelete:(key,init={})=>request('/api/canvas-folders/'+id(key)+'/delete-tree',init),
        deleteFolderTree:(key,value,init={})=>request('/api/canvas-folders/'+id(key)+'/delete-tree',{...body('POST',value),...init,headers:{'Content-Type':'application/json',...init.headers}}),
        folderTreeDeleteStatus:(key,operation,init={})=>request('/api/canvas-folders/'+id(key)+'/delete-tree-status/'+id(operation),init)
    });
})();
