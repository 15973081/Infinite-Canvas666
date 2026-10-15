/* Captured Rlt/klt own the UI. The adapter owns scoped requests and revisions. */
(() => {
    'use strict';
    let active;
    async function open({api,valid,onRoot,onChoose,onClose}){
        active?.destroy();
        const member=CanvasSession.context.member.id,workspace=CanvasSession.context.workspace.id;
        const target=document.createElement('div');document.body.append(target);
        let closed=false,handle,catalogRevision=0,writes=Promise.resolve();
        const current=()=>!closed&&target.isConnected&&valid()&&CanvasSession.context.member.id===member&&CanvasSession.context.workspace.id===workspace;
        const canManage=()=>CanvasSession.context.workspace.permissions.includes('asset.manage');
        async function request(path,init={}){
            if(!current())throw Error('运镜操作已失效');
            const response=await fetch(CanvasSession.url('/api/camera-motions'+path),{...init,headers:{'Content-Type':'application/json','X-Member-ID':member,...init.headers},body:init.body?JSON.stringify(init.body):undefined});
            const data=await response.json();if(!current())throw Error('运镜操作已失效');
            if(!response.ok)throw Error(response.status===409?'运镜目录已变化，草稿已保留；请关闭后重新打开以读取最新版本。':typeof data.detail==='string'?data.detail:'运镜操作失败');
            if(Number.isInteger(data.catalog_revision))catalogRevision=Math.max(catalogRevision,data.catalog_revision);
            return data;
        }
        const display=motion=>({...motion,...Object.fromEntries(['webUrl','previewWebUrl','thumbnailWebUrl','thumbnailVideoWebUrl'].map(key=>[key,motion[key]?displayMediaUrl(motion[key]):'']))});
        const list=tab=>async({pageIndex=1,pageSize=50,keyword=''})=>{const data=await request('?'+new URLSearchParams({tab,page:pageIndex,page_size:pageSize,keyword}));return {...data,success:true,data:data.data.map(display)};};
        const write=run=>{const job=writes.then(run,run);writes=job.catch(()=>{});return job.catch(error=>({success:false,errMessage:error.message}));};
        const body=motion=>({name:motion.name,description:motion.description||'',prompt:motion.promptFragment,url:motion.assetsUuid||motion.webUrl});
        const service={
            cameraMotionPlazaList:list('plaza'),cameraMotionMineList:list('mine'),cameraMotionFavoriteList:list('favorite'),
            cameraMotionDetail:async({motionUuid})=>{const data=await request('/'+encodeURIComponent(motionUuid));return {...data,success:true,data:display(data.data)};},
            cameraMotionMineCreate:motion=>write(()=>{if(!canManage())throw Error('没有管理运镜的权限');return request('',{method:'POST',body:{...body(motion),expected_revision:catalogRevision}});}),
            cameraMotionMineUpdate:motion=>write(()=>{if(!canManage())throw Error('没有管理运镜的权限');return request('/'+encodeURIComponent(motion.uuid),{method:'PUT',body:{...body(motion),expected_revision:motion.expected_revision}});}),
            cameraMotionMineDelete:motion=>write(()=>request('/'+encodeURIComponent(motion.uuid)+'?expected_revision='+motion.expected_revision,{method:'DELETE'})),
            cameraMotionFavorite:motion=>write(()=>request('/'+encodeURIComponent(motion.motionUuid)+'/favorite',{method:'PUT',body:{favorite:true,expected_revision:catalogRevision}})),
            cameraMotionFavoriteCancel:motion=>write(()=>request('/'+encodeURIComponent(motion.motionUuid)+'/favorite',{method:'PUT',body:{favorite:false,expected_revision:catalogRevision}}))
        };
        const uploadService={
            validateFiles:files=>({valid:files.filter(file=>/^(image|video)\//.test(file.type)),invalidType:files.filter(file=>!/^(image|video)\//.test(file.type)),invalidSize:[]}),
            async upload(file,onProgress){if(!current()||!canManage())throw Error('运镜操作已失效');onProgress(0);const [item]=await uploadFiles([file]);if(!current()||!item?.url)throw Error('运镜操作已失效');onProgress(100);return {success:true,data:{relativePath:displayMediaUrl(item),assetUuid:item.media_asset_id||item.url.match(/ast_[a-f0-9]{32}/)?.[0]||item.url}};}
        };
        const controller={destroy,sync(){if(!current())destroy();},get root(){return target;}};active=controller;
        try{
            handle=await api.mountCamerawork(target,{api:service,uploadService,canManage:canManage(),onNotice:message=>{if(current())toast(message);},onClose:destroy,onRootReady:onRoot,onSelect:motion=>current()&&onChoose(motion)});
            if(closed){handle.destroy();return controller;}if(!current())destroy();return controller;
        }catch(error){destroy();throw error;}
        function destroy(){if(closed)return;closed=true;handle?.destroy();target.remove();if(active===controller)active=null;onClose?.(controller);}
    }
    window.PixmaxCamerawork=Object.freeze({open});
})();
