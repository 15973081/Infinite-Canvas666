/* Native folder deletion coordinates private leases; receipts contain no tokens. */
(() => {
    'use strict';
    const busy=new Set(),uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
    const scope=()=>{let session=window.CanvasSession;try{if(!session&&window.parent!==window)session=window.parent.CanvasSession;}catch{}const value=session?.context;return session?.enabled&&value?.member?.id&&value?.workspace?.id?{member:value.member.id,workspace:value.workspace.id}:null;};
    const key=value=>'canvas-folder-deletion-v1:'+value.member+':'+value.workspace;
    const notice=()=>window.dispatchEvent(new CustomEvent('canvas-folder-deletion-change'));
    const same=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
    const shape=plan=>JSON.stringify({name:plan.name,folders:plan.folders,canvases:plan.canvases.map(({revision,...item})=>item)});
    function pending(){
        const owner=scope();if(!owner)return null;
        try{const value=JSON.parse(sessionStorage.getItem(key(owner))||'null');return value&&uuid.test(value.operation_id)&&typeof value.folder_id==='string'&&typeof value.name==='string'&&Array.isArray(value.canvas_ids)&&Array.isArray(value.folder_ids)&&value.canvas_ids.every(id=>typeof id==='string')&&value.folder_ids.every(id=>typeof id==='string')?value:null;}catch{return null;}
    }
    function store(receipt,storageKey){sessionStorage.setItem(storageKey,JSON.stringify(receipt));notice();}
    function clear(storageKey,operation){try{if(JSON.parse(sessionStorage.getItem(storageKey)||'null')?.operation_id===operation)sessionStorage.removeItem(storageKey);}catch{}notice();}
    function options(owner,timeout=15000){return {signal:AbortSignal.timeout(timeout),headers:{'X-Workspace-ID':owner.workspace,'X-Member-ID':owner.member}};}
    function check(owner,valid){const current=scope();if(!current||current.member!==owner.member||current.workspace!==owner.workspace||!valid())throw new Error('工作空间或编辑资格已变化，请在原空间查询删除结果');}
    function verify(result,receipt){if(result?.ok!==true||result.operation_id!==receipt.operation_id||result.folder_id!==receipt.folder_id||!Array.isArray(result.canvas_ids)||!Array.isArray(result.folder_ids)||!same(result.canvas_ids,receipt.canvas_ids)||!same(result.folder_ids,receipt.folder_ids))throw new Error('删除回执标识不一致，请查询原操作');return result;}
    async function prepare(id,valid=()=>true){const owner=scope();if(!owner)throw new Error('级联删除需要空间账号');check(owner,valid);const value=await CanvasDirectoryApi.prepareFolderTreeDelete(id,options(owner));check(owner,valid);if(value.folder_id!==id||!Array.isArray(value.folders)||!Array.isArray(value.canvases)||!/^[a-f0-9]{64}$/.test(value.plan_sha256))throw new Error('目录清单格式无效，请刷新后重试');return value;}
    async function run(plan,valid=()=>true,retry=null,acceptValid=valid){
        const owner=scope();if(!owner)throw new Error('级联删除需要空间账号');const storageKey=key(owner),existing=pending();check(owner,valid);
        if(busy.has(storageKey))throw new Error('目录删除正在处理，请稍后查询');
        if(existing&&(!retry||retry.operation_id!==existing.operation_id))throw new Error('请先查询已有文件夹删除操作');
        if(retry&&(retry.folder_id!==plan.folder_id||retry.name!==plan.name||!same(retry.canvas_ids,plan.canvases.map(item=>item.id))||!same(retry.folder_ids,plan.folders.map(item=>item.id))))throw new Error('目录已变化，请继续核对原删除操作');
        busy.add(storageKey);const leases=[];let dispatched=false,committed=false,receipt,renewTimer=null;
        const classify=error=>{if(dispatched&&(existing||!error.status||error.status>=500||error.status===408)){if(!error.uncertain){error.uncertain=true;error.message=(error.message||'网络异常')+'；请查询原删除结果';}}else if(dispatched)clear(storageKey,receipt.operation_id);return error;};
        const transport=(path,init={})=>fetch(path,{...init,headers:new Headers({...Object.fromEntries(new Headers(init.headers)),...options(owner).headers})});
        try {
            if(!window.MemberCanvasEdit?.withFolderDeletion)throw new Error('请重新打开画布后再删除文件夹');
            return await MemberCanvasEdit.withFolderDeletion(plan.canvases.map(item=>item.id),async own=>{
                const fresh=await prepare(plan.folder_id,valid);if(shape(fresh)!==shape(plan))throw new Error('目录内容已变化，请重新打开确认');
                const targets=fresh.canvases.filter(item=>item.id!==own?.id),byId=new Map();let cursor=0,failure;
                renewTimer=setInterval(()=>{try{check(owner,valid);}catch{clearInterval(renewTimer);return;}for(const lease of leases)if(lease.canSave)void lease.renew().catch(()=>{});},10000);
                const worker=async()=>{while(cursor<targets.length&&!failure){const item=targets[cursor++];try{check(owner,valid);const lease=new CanvasEditLease({id:item.id,fetch:transport});leases.push(lease);byId.set(item.id,lease);await lease.start(async()=>({revision:lease.revision}));}catch(error){error.message=item.title+'：'+error.message;failure=error;}}};
                await Promise.all(Array.from({length:Math.min(6,targets.length)},worker));if(failure)throw failure;
                const proofs=fresh.canvases.map(item=>{const value=own?.id===item.id?own:byId.get(item.id),proof={id:item.id,token:value.token,generation:value.generation,revision:value.revision};if(proof.revision!==item.revision)throw new Error(item.title+'：版本已变化，请重新打开确认');if(value instanceof CanvasEditLease&&!value.canSave)throw new Error(item.title+'：编辑资格已失效，请重新打开确认');return proof;});
                check(owner,valid);
                receipt={operation_id:retry?.operation_id||crypto.randomUUID(),folder_id:fresh.folder_id,name:fresh.name,plan_sha256:fresh.plan_sha256,canvas_ids:fresh.canvases.map(item=>item.id),folder_ids:fresh.folders.map(item=>item.id)};
                // Persist only public IDs before dispatch; failed persistence aborts deletion.
                try{store(receipt,storageKey);}catch{throw new Error('删除回执无法暂存，未提交删除，请检查浏览器存储');}
                dispatched=true;
                try{const result=verify(await CanvasDirectoryApi.deleteFolderTree(fresh.folder_id,{operation_id:receipt.operation_id,name:fresh.name,plan_sha256:fresh.plan_sha256,canvases:proofs},options(owner,30000)),receipt);committed=true;check(owner,acceptValid);clear(storageKey,receipt.operation_id);return result;}catch(error){throw classify(error);}
            });
        }catch(error){
            throw classify(error);
        }finally{
            clearInterval(renewTimer);
            for(const lease of leases){
                if(!committed&&lease.canSave){try{const state=await lease.request('');if(state.holder?.is_self&&state.generation===lease.generation)await lease.request('/release',{method:'POST',headers:{...lease.headers(),'X-Canvas-Revision':String(state.revision)}});}catch{/* A purged or expired resource needs no new write. */}}
                lease.dispose();
            }
            busy.delete(storageKey);notice();
        }
    }
    async function query(valid=()=>true){
        const owner=scope(),receipt=pending();if(!owner||!receipt)throw new Error('当前空间没有待确认的文件夹删除');const storageKey=key(owner);
        if(busy.has(storageKey))throw new Error('删除正在处理，请稍后查询原操作');busy.add(storageKey);
        try{const result=await CanvasDirectoryApi.folderTreeDeleteStatus(receipt.folder_id,receipt.operation_id,options(owner));check(owner,valid);if(result.state!=='done')return {state:'unconfirmed',receipt};verify(result,receipt);clear(storageKey,receipt.operation_id);window.MemberCanvasEdit?.acceptFolderDeletion?.(result.canvas_ids);return result;}
        finally{busy.delete(storageKey);notice();}
    }
    window.CanvasFolderDeletion=Object.freeze({prepare,run,query,pending,get busy(){const owner=scope();return owner?busy.has(key(owner)):false;}});
    function recovery(){
        let root,text,button,confirmedScope='',message='',messageOperation='';
        const draw=()=>{
            const owner=scope(),receipt=pending();if(!owner||!receipt&&confirmedScope!==key(owner)){if(root&&!root.hidden)root.hidden=true;return;}
            const host=document.querySelector('.canvas-route-error')||document.getElementById('studioHomeFeedback');if(!host){if(root&&!root.hidden)root.hidden=true;return;}
            if(!root){root=document.createElement('section');root.className='canvas-folder-delete-recovery';root.setAttribute('aria-label','文件夹删除回执');text=document.createElement('span');text.setAttribute('role','status');button=document.createElement('button');button.type='button';button.textContent='查询文件夹删除结果';root.append(text,button);
                button.onclick=async()=>{const original=pending(),clickedOwner=scope();if(!original||!clickedOwner)return;const current=()=>{const value=scope();return value&&key(value)===key(clickedOwner);};messageOperation=original.operation_id;message='正在查询原删除结果…';draw();
                    try{const result=await query(current);if(!current())return;if(result.state==='unconfirmed')message='原删除结果尚未确认，请稍后继续查询';else{confirmedScope=key(clickedOwner);message='文件夹及其内容的删除结果已确认';await window.CanvasHome?.refresh?.();}}
                    catch(error){if(current())message=error.message||'查询暂未完成，请重试';}draw();};
            }
            if(root.parentNode!==host.parentNode)host.before(root);
            const visible=Boolean(receipt)||confirmedScope===key(owner);if(root.hidden===visible)root.hidden=!visible;
            const label=receipt?(messageOperation===receipt.operation_id&&message?message:'文件夹删除结果待确认：'+receipt.name):confirmedScope===key(owner)?message:'';if(text.textContent!==label)text.textContent=label;
            if(button.hidden===Boolean(receipt))button.hidden=!receipt;const disabled=window.CanvasFolderDeletion.busy;if(button.disabled!==disabled)button.disabled=disabled;
        };
        // Host insertion needs observation; ordinary canvas transforms do not.
        new MutationObserver(draw).observe(document.body,{childList:true,subtree:true});for(const event of ['canvas-folder-deletion-change','member-session:ready','member-session:paused','pageshow'])window.addEventListener(event,draw);draw();
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',recovery,{once:true});else recovery();
})();
