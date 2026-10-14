/* The native editor owns its subtree; legacy promptInput is the host projection. */
(() => {
    'use strict';
    let active,loading,sequence=0;
    const scope=()=>CanvasSession.context?.member?.id+':'+CanvasSession.context?.workspace?.id;
    const runtime=()=>loading||=import('/static/vendor/pixmax/editors.js').then(value=>value.canvasSegmentReshoot).catch(error=>{loading=null;throw error;});
    const readable=session=>!session.closed&&active===session&&canvas===session.canvas&&scope()===session.scope&&nodes.includes(session.node)&&activeComposerNode()===session.node&&composer.classList.contains('open');
    const editable=session=>readable(session)&&session.guard.valid()&&!isSmartCanvasLocked();
    const supported=node=>Boolean(window.CanvasSession?.enabled&&node?.type==='smart-image'&&!node.segmentReshoot&&!node.localDepth&&isApiLikeEngine(smartSettingsForNode(node).engine));
    const subjects=node=>smartSettingsForNode(node).apiKind==='video'&&isSeedance25VideoModel(smartSettingsForNode(node).videoModel);
    function raw(node,fromComposer=false){
        if(!fromComposer&&node.nativePrompt?.schemaVersion===1)return node.nativePrompt.prompt;
        const temporary={...node,nativePrompt:{...node.nativePrompt,schemaVersion:1,prompt:'',subjects:node.nativePrompt?.subjects||[]}};
        PixmaxReshootReferences.captureComposer(temporary);return temporary.nativePrompt.prompt;
    }
    function ensure(node,value){if(!node.nativePrompt)node.nativePrompt={schemaVersion:1,prompt:value,subjects:[]};}
    function mentionModel(node){
        const current=PixmaxReshootReferences.plan(node),cited=new Set(current.resources.map(entry=>entry.nodeId));
        const categories=smartSettingsForNode(node).apiKind==='video'?['text','image','audio']:['text','image'];
        return {cited:current.mentions,allowedCategories:categories,canvasItems:nodes.filter(source=>source!==node&&!source.hidden&&!cited.has(source.id)).map(source=>({id:source.id,category:source.type==='smart-prompt'?'text':mediaKindForItem(source.images?.[0]),label:source.label||source.text?.slice(0,40)||'素材'})).filter(source=>categories.includes(source.category))};
    }
    function dispose(){
        const session=active;if(!session)return;session.closed=true;active=null;sequence++;
        session.observer?.disconnect();session.resize?.disconnect();session.controls?.destroy();session.handle?.destroy();session.camera?.destroy();for(const picker of session.pickers)picker.remove();
        session.root.remove();promptInput.style.display='';promptInput.removeAttribute('aria-hidden');
    }
    function replaceValue(session,value){
        if(!session.handle)return;
        const version=session.valueVersion=(session.valueVersion||0)+1;session.syncPending=true;
        Promise.resolve(session.handle.setValue(value)).then(()=>{if(session.valueVersion===version)session.syncPending=false;},error=>{if(session.valueVersion===version)session.syncPending=false;if(readable(session))toast(error.message||'提示词同步失败');});
    }
    function project(session,value,{undo=true}={}){
        if(!editable(session))return;
        if(undo&&!session.edited){pushUndo();session.edited=true;}
        ensure(session.node,value);PixmaxReshootReferences.setPrompt(session.node,value);session.value=value;
        promptInput.dataset.preserveDraftOnce='1';replaceValue(session,value);scheduleSave();
    }
    function refresh(session){
        if(!readable(session)){dispose();return;}
        const disabled=!editable(session),plan=PixmaxReshootReferences.plan(session.node);
        const invalid=PixmaxSubjects.invalid(session.node),stamp=JSON.stringify([plan.mentions,plan.incomingNodes,invalid]);
        const cameraSupported=smartSettingsForNode(session.node).apiKind==='image';
        session.handle?.setReadonly(disabled);session.camera?.setDisabled(disabled||!cameraSupported);
        session.root.querySelectorAll('button').forEach(button=>{if(!button.closest('[data-native-camera]'))button.disabled=disabled;});
        session.subjectButton.hidden=!subjects(session.node);session.root.querySelector('[data-native-camera-open]').hidden=!cameraSupported;session.root.style.setProperty('--prompt-h',promptInput.style.getPropertyValue('--prompt-h')||'124px');
        if(session.stamp!==stamp){session.stamp=stamp;session.handle?.setReferences({mentionItems:plan.mentions,incomingNodes:plan.incomingNodes});session.handle?.setInvalidSubjects(invalid);}
        if(session.node.nativePrompt&&session.value!==session.node.nativePrompt.prompt){session.value=session.node.nativePrompt.prompt;replaceValue(session,session.value);}
        session.controls?.refresh();
    }
    async function sync(){
        const node=activeComposerNode();if(!supported(node)||!composer.classList.contains('open')){dispose();return;}
        const epoch=MemberCanvasEdit.active?.lease?.epoch;
        if(active&&active.node===node&&active.canvas===canvas&&active.scope===scope()&&active.epoch===epoch){refresh(active);return;}
        dispose();const value=raw(node),root=document.createElement('div');root.className='pixmax-native-prompt';
        if(!document.getElementById('pixmax-native-prompt-style')){const style=document.createElement('style');style.id='pixmax-native-prompt-style';style.textContent='.pixmax-native-prompt-tools{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0}.pixmax-native-prompt-tools button{padding:5px 9px;border:1px solid var(--studio-border,#444);border-radius:8px;background:var(--studio-panel,#25262b);color:inherit;font:inherit;cursor:pointer}.pixmax-native-prompt [data-native-prompt-host] .prompt-editor{min-height:60px;height:var(--prompt-h,124px);max-height:380px;box-sizing:border-box;overflow:auto;font-size:13px}.pixmax-native-camera-portal{position:relative;z-index:100150}';document.head.append(style);}
        root.innerHTML='<div class="pixmax-native-prompt-tools"><button type="button" data-native-subject>添加主体</button><button type="button" data-native-camera-open>添加镜头参数</button></div><div data-native-camera></div><div data-native-prompt-host></div>';
        const session={root,node,canvas,scope:scope(),epoch,guard:canvasTaskWriteGuard(node),closed:false,value,fallbackHtml:promptInput.innerHTML,edited:false,pickers:new Set(),id:++sequence};active=session;
        promptInput.after(root);root.addEventListener('mousedown',event=>event.stopPropagation());root.addEventListener('keydown',event=>event.stopPropagation());root.addEventListener('wheel',event=>event.stopPropagation(),{passive:true});
        session.subjectButton=root.querySelector('[data-native-subject]');refresh(session);
        session.observer=new MutationObserver(()=>{if(active===session&&!root.isConnected)dispose();});session.observer.observe(document.body,{childList:true,subtree:true});
        session.resize=new MutationObserver(()=>{if(readable(session))root.style.setProperty('--prompt-h',promptInput.style.getPropertyValue('--prompt-h')||'124px');});session.resize.observe(promptInput,{attributes:true,attributeFilter:['style']});
        try{
            const api=await runtime();if(!readable(session))return;
            const preserveFallback=()=>{if(promptInput.innerHTML!==session.fallbackHtml){project(session,raw(node,true));session.fallbackHtml=promptInput.innerHTML;}};
            preserveFallback();
            const plan=PixmaxReshootReferences.plan(node),handle=await api.mountPrompt(root.querySelector('[data-native-prompt-host]'),{value:session.value,ariaLabel:'生成提示词',maxLength:10000,placeholder:smartSettingsForNode(node).apiKind==='video'?'描述你想生成或编辑的视频…':'描述你想生成或编辑的图片…',readonly:!editable(session),
                references:{mentionItems:plan.mentions,incomingNodes:plan.incomingNodes},invalidSubjectGroupIds:PixmaxSubjects.invalid(node),subjectApi:PixmaxSubjects.adapter(node,()=>readable(session)),subjectMediaUrl:url=>displayMediaUrl({url}),
                atMentionPicker:{getModel:()=>mentionModel(node),connect:id=>editable(session)&&PixmaxReshootReferences.connect(node,id)},
                onChange:value=>{if(!editable(session)||session.syncPending||value===session.value)return;project(session,value);refresh(session);}});
            if(!readable(session)){handle.destroy();return;}session.handle=handle;
            // A fallback edit made while the runtime was loading wins over mount props.
            preserveFallback();
            replaceValue(session,session.value);promptInput.style.display='none';promptInput.setAttribute('aria-hidden','true');
            session.subjectButton.onclick=async()=>{
                if(!editable(session)||!subjects(node))return;
                await PixmaxSubjectLibrary.open({api,node,valid:()=>editable(session),onRoot:(root,added)=>added?session.pickers.add(root):session.pickers.delete(root),onChoose:async(group,type)=>{
                    if(!editable(session))return;ensure(node,session.value);const chip=PixmaxSubjects.select(node,group,type);session.edited=true;
                    let value;try{value=await handle.insertSubject(chip);}catch{value=node.nativePrompt.prompt;}
                    if(!editable(session))return;project(session,value,{undo:false});render();refresh(session);
                }});
            };
            root.querySelector('[data-native-camera-open]').onclick=async()=>{
                if(!editable(session)||smartSettingsForNode(node).apiKind!=='image')return;
                if(!session.camera){const key=CanvasSession.storageKey('pixmax-camera-preferences-v1'),target=document.createElement('div');target.className='pixmax-native-camera-portal';target.dataset.nativeCamera='';document.body.append(target);session.pickers.add(target);for(const event of ['mousedown','click','keydown','wheel'])target.addEventListener(event,event=>event.stopPropagation());const camera=await api.mountCamera(target,{disabled:false,
                    readPreferences:()=>{try{const value=JSON.parse(localStorage.getItem(key)||'null');return value?.indices&&Object.keys(PixmaxPromptCatalog).every(key=>Number.isInteger(value.indices[key])&&value.indices[key]>=0&&value.indices[key]<PixmaxPromptCatalog[key].length)?value:null;}catch{return null;}},writePreferences:indices=>{if(editable(session))localStorage.setItem(key,JSON.stringify({indices}));},onInsert:item=>{if(editable(session))handle.insertCamera(item);}});
                    if(!readable(session)){camera.destroy();return;}session.camera=camera;
                }
                if(editable(session))session.camera.setOpen(true);
            };
            const controls=await PixmaxGenerationParameters.mount({node,api,valid:()=>readable(session),editable:()=>editable(session),onRoot:(root,added)=>added?session.pickers.add(root):session.pickers.delete(root)});if(!readable(session)){controls?.destroy();return;}session.controls=controls;
            refresh(session);positionComposerForNode(node);
        }catch(error){if(readable(session)){dispose();toast(error.message||'原生提示词加载失败');}}
    }
    function flush(node){
        if(active?.node!==node||!editable(active)||!active.handle||active.syncPending)return;
        if(node.nativePrompt&&node.nativePrompt.prompt!==active.value){refresh(active);return;}
        const value=active.handle.instance.getRichEditorManager()?.serialize();
        if(typeof value==='string'&&(value!==active.value||/%%@\[|%%#\[|%%subject-ref\(/.test(value)&&!node.nativePrompt))project(active,value);
    }
    function remap(node,idMap){if(node.nativePrompt?.schemaVersion===1)PixmaxReshootReferences.remap(node,idMap);}
    window.PixmaxNativePrompt=Object.freeze({sync,dispose,flush,remap});
    window.addEventListener('pagehide',dispose);
})();
