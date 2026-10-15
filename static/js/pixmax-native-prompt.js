/* A single native N1 form owns the composer; promptInput is a host projection. */
(() => {
    'use strict';
    let active,loading;
    const scope=()=>CanvasSession.context?.member?.id+':'+CanvasSession.context?.workspace?.id;
    const runtime=()=>loading||=import('/static/vendor/pixmax/editors.js').then(value=>value.canvasSegmentReshoot).catch(error=>{loading=null;throw error;});
    const readable=session=>!session.closed&&active===session&&canvas===session.canvas&&scope()===session.scope&&nodes.includes(session.node)&&activeComposerNode()===session.node&&composer.classList.contains('open');
    const editable=session=>readable(session)&&session.guard.valid()&&!isSmartCanvasLocked();
    const supported=node=>Boolean(window.CanvasSession?.enabled&&node?.type==='smart-image'&&!node.segmentReshoot&&!node.localDepth&&isApiLikeEngine(smartSettingsForNode(node).engine));
    function raw(node){
        if(node.nativePrompt?.schemaVersion===1)return node.nativePrompt.prompt;
        const temporary={...node,nativePrompt:{schemaVersion:1,prompt:'',subjects:[]}};PixmaxReshootReferences.captureComposer(temporary);return temporary.nativePrompt.prompt;
    }
    function mentionModel(node){
        const current=PixmaxReshootReferences.plan(node),cited=new Set(current.resources.map(entry=>entry.nodeId)),categories=smartSettingsForNode(node).apiKind==='video'?['text','image','audio']:['text','image'];
        return {cited:current.mentions,allowedCategories:categories,canvasItems:nodes.filter(source=>source!==node&&!source.hidden&&!cited.has(source.id)).map(source=>({id:source.id,category:source.type==='smart-prompt'?'text':mediaKindForItem(source.images?.[0]),label:source.label||source.text?.slice(0,40)||'素材'})).filter(source=>categories.includes(source.category))};
    }
    function dispose(){
        const session=active;if(!session)return;session.closed=true;active=null;session.observer?.disconnect();promptInput.removeEventListener('input',session.onFallbackInput);session.form?.destroy();for(const root of session.roots)root.remove();session.roots.clear();promptInput.style.display='';promptInput.removeAttribute('aria-hidden');
    }
    function project(session,value){
        if(!editable(session))return;
        if(!session.edited){pushUndo();session.edited=true;}
        if(!session.node.nativePrompt)session.node.nativePrompt={schemaVersion:1,prompt:value,subjects:[]};PixmaxReshootReferences.setPrompt(session.node,value);session.value=value;session.fallbackHtml=promptInput.innerHTML;promptInput.dataset.preserveDraftOnce='1';scheduleSave();
    }
    function value(session){
        if(!session.form&&editable(session)&&promptInput.innerHTML!==session.fallbackHtml)project(session,raw({...session.node,nativePrompt:undefined}));
        return session.node.nativePrompt?.prompt??session.value;
    }
    async function sync(){
        const node=activeComposerNode();if(!supported(node)||!composer.classList.contains('open')){dispose();return;}
        const epoch=MemberCanvasEdit.active?.lease?.epoch,kind=smartSettingsForNode(node).apiKind;
        if(active&&active.node===node&&active.canvas===canvas&&active.scope===scope()&&active.epoch===epoch&&active.kind===kind){if(readable(active))active.form?.refresh();return;}
        dispose();const session={node,canvas,scope:scope(),epoch,kind,guard:canvasTaskWriteGuard(node),closed:false,value:raw(node),fallbackHtml:promptInput.innerHTML,edited:false,roots:new Set()};active=session;session.onFallbackInput=()=>{if(editable(session)&&!session.form)project(session,raw({...node,nativePrompt:undefined}));};promptInput.addEventListener('input',session.onFallbackInput);
        try{
            const api=await runtime();if(!readable(session))return;
            const form=await PixmaxGenerationForm.mount({node,api,valid:()=>readable(session),editable:()=>editable(session),raw:()=>value(session),project:next=>project(session,next),onRoot:(root,added)=>added?session.roots.add(root):session.roots.delete(root),mentionModel:()=>mentionModel(node)});
            if(!readable(session)){form?.destroy();return;}session.form=form;promptInput.style.display='none';promptInput.setAttribute('aria-hidden','true');form.refresh();
            session.observer=new MutationObserver(()=>{if(readable(session)&&!composer.querySelector('.pixmax-native-generation-form'))dispose();});session.observer.observe(composer,{childList:true});
        }catch(error){if(readable(session)){dispose();toast(error.message||'原生生成表单加载失败');}}
    }
    function flush(node){if(active?.node===node&&editable(active))active.form?.flush();}
    function remap(node,idMap){if(node.nativePrompt?.schemaVersion===1)PixmaxReshootReferences.remap(node,idMap);}
    window.PixmaxNativePrompt=Object.freeze({sync,dispose,flush,remap,updateViewport:()=>active?.form?.updateViewport()});
    window.addEventListener('pagehide',dispose);
})();
