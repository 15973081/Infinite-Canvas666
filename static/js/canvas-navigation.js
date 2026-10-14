/* Same-origin document navigation. Canvas data and edit leases stay in their owners. */
(() => {
    'use strict';
    const match=location.pathname.match(/^\/workspaces\/([\w-]+)(?:\/canvases\/([\w-]+))?$/);
    const query=new URLSearchParams(location.search);
    let leaveGuard=async()=>true, navigating=false;
    const workspace=()=>window.CanvasSession?.context?.workspace.id || match?.[1] || query.get('workspace') || 'local';
    const homeUrl=()=>'/workspaces/'+encodeURIComponent(workspace());
    const canvasUrl=(id,{cover=false}={})=>homeUrl()+'/canvases/'+encodeURIComponent(id)+(cover?'?cover=1':'');
    const canvasId=match?.[2] || query.get('id') || '';
    if(canvasId)document.documentElement.classList.add('standalone-canvas');
    async function go(url,deletedId){
        if(navigating)return false;
        const target=new URL(url,location.origin);
        if(target.origin!==location.origin)return false;
        navigating=true;
        try {
            if(deletedId){
                const current=location.pathname.match(/^\/workspaces\/[^/]+\/canvases\/([^/]+)$/)?.[1]||new URLSearchParams(location.search).get('id');
                if(current!==deletedId||window.MemberCanvasEdit?.canSave)return false;
                if(window.CanvasSession?.enabled&&window.MemberCanvasEdit?.leave&&!await window.MemberCanvasEdit.leave())return false;
            }else if(!await leaveGuard())return false;
            window.LocalDepthVideo?.allowPageExit?.();
            window.PixmaxMediaTools?.allowPageExit?.();
            window.PixmaxVideoAnnotation?.allowPageExit?.();
            window.top.location.assign(target.href);
            return true;
        } catch(error) {
            window.alert(error.message || '保存尚未完成，请稍后重试。');return false;
        } finally {navigating=false;}
    }
    function bindLink(link,id,options){
        link.href=canvasUrl(id,options);link.target='_top';
        link.addEventListener('click',event=>{
            if(event.defaultPrevented || event.button!==0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)return;
            event.preventDefault();void go(link.href);
        });
    }
    function adopt(id){
        document.documentElement.classList.add('standalone-canvas');
        if(!match && window.top===window){
            const target=new URL(canvasUrl(id),location.origin);
            for(const name of ['cover','__frontend_build'])if(query.has(name))target.searchParams.set(name,query.get(name));
            history.replaceState(history.state,'',target);
        }
    }
    function failure(){
        if(document.querySelector('.canvas-route-error'))return;
        const card=document.createElement('section');card.className='canvas-route-error';card.setAttribute('role','alert');
        const title=document.createElement('h2');title.textContent='暂时无法打开画布';
        const note=document.createElement('p');note.textContent='画布可能已删除、访问权限已变化，或网络暂时不可用。';
        const retry=document.createElement('button');retry.textContent='重试';retry.onclick=()=>location.reload();
        const back=document.createElement('a');back.textContent='返回画布首页';back.href=homeUrl();
        card.append(title,note,retry,back);document.body.append(card);
    }
    function confirmLocalWork(){
        return !(window.LocalDepthVideo?.hasUnfinishedWork?.()||window.PixmaxMediaTools?.hasUnfinishedWork?.()||window.PixmaxVideoAnnotation?.hasUnfinishedWork?.()) || window.confirm('本地媒体处理仍在进行，或结果尚未保存到画布。离开将中断处理并丢失未保存的本地结果。确定离开？');
    }
    async function prepareReload(guard){
        if(!confirmLocalWork())return false;
        const ready=await guard();
        if(ready){window.LocalDepthVideo?.allowPageExit?.();window.PixmaxMediaTools?.allowPageExit?.();window.PixmaxVideoAnnotation?.allowPageExit?.();}
        return ready;
    }
    window.CanvasNavigation=Object.freeze({canvasId,workspace,homeUrl,canvasUrl,bindLink,go:url=>go(url),afterDeletion:id=>go(homeUrl(),id),adopt,failure,confirmLocalWork,prepareReload,
        setLeaveGuard:guard=>{leaveGuard=guard;}});
    window.addEventListener('pageshow',event=>{
        // Explicit return disposes the lease UI. A history-restored document must
        // mount a fresh lease rather than resurrect an editor without controls.
        if(event.persisted && canvasId && window.CanvasSession?.enabled && !window.MemberCanvasEdit?.active)location.reload();
    });
    document.addEventListener('DOMContentLoaded',()=>{
        if(!canvasId)return;
        const host=document.querySelector('.canvas-nav,.smart-nav');if(!host)return;
        const group=document.createElement('div');group.className='canvas-navigation-group';
        host.before(group);group.append(host);
        const action=document.createElement('div');action.className='canvas-share-action';
        const button=document.createElement('button');button.type='button';button.className='canvas-link-copy';
        button.setAttribute('aria-label','分享画布链接');button.title='复制画布链接 · 仅有空间访问权限的成员可打开';
        const feedback=document.createElement('span');feedback.className='canvas-share-feedback';feedback.setAttribute('role','status');
        let feedbackTimer;
        const icon=name=>{button.innerHTML='<i data-lucide="'+name+'"></i>';window.lucide?.createIcons({root:button});};
        icon('arrow-up-right');
        button.onclick=async()=>{
            clearTimeout(feedbackTimer);button.disabled=true;
            try{await navigator.clipboard.writeText(new URL(canvasUrl(canvasId),location.origin).href);icon('check');feedback.textContent='链接已复制';}
            catch(_){feedback.textContent='复制失败，请复制地址栏链接';}
            finally{button.disabled=false;}
            feedbackTimer=setTimeout(()=>{icon('arrow-up-right');feedback.textContent='';},2500);
        };action.append(button,feedback);group.append(action);
    });
})();
