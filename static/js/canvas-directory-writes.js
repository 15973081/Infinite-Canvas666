/* Short-lived catalog writes, shared by the directory and active editors. */
(() => {
    'use strict';
    const pending=new Map();
    function matches(path,init={}){
        const url=new URL(path,location.href),method=(init.method||'GET').toUpperCase();
        if(url.origin!==location.origin)return null;
        const match=url.pathname.match(/^\/api\/canvases\/([^/]+)(.*)$/);
        if(!match)return null;
        return ((['/folder','/placement'].includes(match[2])&&method==='PATCH') ||
            (['/meta','/restore'].includes(match[2])&&method==='POST') ||
            (['','/purge'].includes(match[2])&&method==='DELETE')) ? decodeURIComponent(match[1]) : null;
    }
    function write(id,path,init,transport=window.fetch.bind(window),activeLease=null){
        const previous=pending.get(id)||Promise.resolve();
        const operation=previous.catch(()=>{}).then(async()=>{
            if(activeLease?.id===id&&activeLease.canSave)return activeLease.write(path,init,transport);
            const lease=new window.CanvasEditLease({id,fetch:transport});
            let proof=null;
            try{
                await lease.start(async()=>({revision:lease.revision}));
                proof=lease.headers();
                return await lease.write(path,init,transport);
            }finally{
                if(proof){
                    try{
                        const state=await lease.request('');
                        if(state.holder?.is_self&&state.generation===lease.generation)
                            await lease.request('/release',{method:'POST',headers:{...proof,'X-Canvas-Revision':String(state.revision)}});
                    }catch(error){console.warn('目录操作的编辑资格释放未确认，将自动到期。',error);}
                }
                lease.dispose();
            }
        });
        pending.set(id,operation);
        const clear=()=>{if(pending.get(id)===operation)pending.delete(id);};
        operation.then(clear,clear);return operation;
    }
    window.CanvasDirectoryWrites=Object.freeze({matches,write});
})();
