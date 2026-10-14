/* Named, colored pins are canvas metadata; node membership stays with nodes. */
(() => {
    'use strict';
    const defaults=[['yellow','#FBBC05','黄色'],['blue','#4285F4','蓝色'],['purple','#8825F9','紫色'],['green','#35AF4B','绿色'],['pink','#EA35BA','粉色'],['white','#FFFFFF','白色']];
    let picker,pins,frame=null;
    const scope=()=>window.CanvasSession?.enabled?window.CanvasSession.context?.member?.id+':'+window.CanvasSession.context?.workspace?.id:'local';
    const label=tag=>tag.name||defaults.find(item=>item[0]===tag.id)?.[2]||tag.id;
    function normalized(values){
        if(!Array.isArray(values)||values.length>256)throw new Error('标签定义格式不正确');
        const seen=new Set();
        return values.map(value=>{
            if(!value||typeof value.id!=='string'||!value.id||value.id.length>96||seen.has(value.id)||!/^#[0-9a-f]{6}$/i.test(value.color)||typeof (value.name||'')!=='string'||(value.name||'').length>80)throw new Error('标签定义无效或重复');
            seen.add(value.id);return {id:value.id,color:value.color.toUpperCase(),name:value.name||''};
        });
    }
    function definitions(){return normalized(Array.isArray(canvas?.node_tags)?canvas.node_tags:defaults.map(([id,color])=>({id,color})));}
    function ids(node){
        const active=new Set(definitions().map(tag=>tag.id)),raw=Array.isArray(node?.tags)?node.tags.filter(id=>typeof id==='string'):[];
        return [...new Set(raw.length?raw.filter(id=>active.has(id)):node?.pinned&&active.has('yellow')?['yellow']:[])];
    }
    function writeIds(node,selection){
        const active=new Set(definitions().map(tag=>tag.id)),unknown=(Array.isArray(node.tags)?node.tags:[]).filter(id=>typeof id==='string'&&!active.has(id));
        node.tags=[...new Set([...unknown,...selection.filter(id=>active.has(id))])];node.pinned=ids({...node,pinned:false}).length>0;
    }
    function writable(origin,targets=[]){
        const base=canvasTaskWriteGuard(...targets);
        return ()=>canvas===origin&&!isSmartCanvasLocked()&&base.valid()&&targets.every(node=>nodes.includes(node));
    }
    function change(targets,selection,{add=false,clear=false}={}){
        if(!writable(canvas,targets)())return;
        pushUndo();targets.forEach(node=>writeIds(node,clear?[]:add?[...ids(node),...selection]:selection));
        refreshSmartNodes(targets.map(node=>node.id));scheduleSave();notifyChanged();
    }
    function togglePin(node){if(!nodes.includes(node)||isSmartCanvasLocked())return;change([node],ids(node).length?[]:['yellow']);}
    function closePicker(){
        if(!picker)return;const previous=picker;picker=null;
        previous.root.remove();
        if(previous.batch&&previous.touched&&previous.valid())change(previous.targets,previous.selection,{add:!previous.clear});
    }
    function openPicker(nodeIds=selectedNodeIds(),anchor){
        closePicker();const targets=nodes.filter(node=>nodeIds.includes(node.id));if(!targets.length)return;
        const origin=canvas,batch=targets.length>1,valid=writable(origin,targets),root=document.createElement('section');
        root.className='pixmax-tag-picker';root.setAttribute('role','dialog');root.setAttribute('aria-label','节点标签');
        const state={root,targets,valid,batch,origin,scope:scope(),selection:batch?[]:ids(targets[0]),clear:false,touched:false};picker=state;
        root.innerHTML='<header><strong>标签</strong><button type="button" data-tags-close aria-label="关闭节点标签">×</button></header><div data-tag-choices></div><button type="button" data-tags-clear>清空标签</button>'+(batch?'<button type="button" data-tags-apply>应用到选中节点</button>':'');
        function draw(){
            root.querySelector('[data-tag-choices]').innerHTML=definitions().map(tag=>`<label><input type="checkbox" data-tag-id="${escapeAttr(tag.id)}" ${state.selection.includes(tag.id)?'checked':''} ${valid()?'':'disabled'}><span class="pixmax-tag-dot" style="background:${tag.color}"></span><span>${escapeHtml(label(tag))}</span></label>`).join('')||'<p>暂无可用标签</p>';
            root.querySelector('[data-tags-clear]').disabled=!valid();
            const apply=root.querySelector('[data-tags-apply]');if(apply)apply.disabled=!valid();
        }
        root.onchange=event=>{
            const id=event.target.dataset.tagId;if(!id||!valid())return;
            state.selection=event.target.checked?[...new Set([...state.selection,id])]:state.selection.filter(value=>value!==id);state.touched=true;
            if(!batch){change(targets,state.selection);state.touched=false;}
        };
        root.querySelector('[data-tags-close]').onclick=closePicker;
        root.querySelector('[data-tags-clear]').onclick=()=>{if(!valid())return;state.selection=[];state.clear=true;state.touched=true;if(!batch){change(targets,[]);state.touched=false;}draw();};
        root.querySelector('[data-tags-apply]')?.addEventListener('click',closePicker);
        root.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){closePicker();anchor?.focus();}});
        document.body.appendChild(root);draw();
        const box=anchor?.getBoundingClientRect()||{right:innerWidth/2,top:innerHeight/2};
        root.style.left=Math.max(8,Math.min(box.right+8,innerWidth-root.offsetWidth-8))+'px';root.style.top=Math.max(8,Math.min(box.top,innerHeight-root.offsetHeight-8))+'px';
    }
    function rename(tag){
        if(isSmartCanvasLocked())return;const origin=canvas,valid=writable(origin);
        window.CanvasNameDialog.open({title:'修改pin名称',label:'pin名称',value:tag.name,allowEmpty:true,onSubmit:async name=>{
            if(!valid())throw new Error('画布或编辑资格已变化，请重新打开');
            const current=definitions().find(item=>item.id===tag.id);if(!current||current.name!==tag.name||current.color!==tag.color)throw new Error('标签已变化，请重新打开');
            pushUndo();canvas.node_tags=definitions().map(item=>item.id===tag.id?{...item,name}:item);render();scheduleSave();notifyChanged();
        }});
    }
    function openPins(){
        pins?.root.remove();document.getElementById('pixmaxPinsPanel')?.remove();
        const root=document.createElement('aside');root.id='pixmaxPinsPanel';root.className='pixmax-creation-sidebar pixmax-pins-panel';root.setAttribute('aria-label','pin汇总');
        root.innerHTML='<header><strong>pin汇总</strong><button type="button" data-pin-close aria-label="关闭pin汇总">×</button></header><div class="pixmax-pin-tags"></div><label class="pixmax-pin-search"><input type="search" aria-label="搜索pin素材" placeholder="搜索素材"></label><div class="pixmax-pin-actions"><strong data-pin-heading></strong><button type="button" data-pin-rename>修改pin名称</button><button type="button" data-pin-clear>批量去除当前pin</button><button type="button" data-pin-download>批量下载pin节点</button></div><div class="pixmax-pin-list"></div><p role="status"></p>';
        pins={root,origin:canvas,scope:scope(),selected:'all',query:''};
        bindPixmaxSidebarEvents(root);shell.appendChild(root);
        root.querySelector('[data-pin-close]').onclick=()=>{root.remove();pins=null;};
        root.querySelector('input').oninput=event=>{pins.query=event.target.value;drawPins();};
        root.onclick=event=>{
            if(!pins||canvas!==pins.origin||scope()!==pins.scope){root.remove();pins=null;return;}
            const tag=event.target.closest('[data-pin-tag]');if(tag){pins.selected=tag.dataset.pinTag;drawPins();return;}
            const focus=event.target.closest('[data-pin-focus]');if(focus){const node=nodes.find(node=>node.id===focus.dataset.pinFocus);if(node)focusPixmaxNode(node);return;}
            const remove=event.target.closest('[data-pin-remove]');if(remove){const node=nodes.find(node=>node.id===remove.dataset.pinRemove);if(node)change([node],pins.selected==='all'?[]:ids(node).filter(id=>id!==pins.selected));}
        };
        root.querySelector('[data-pin-rename]').onclick=()=>{const tag=definitions().find(tag=>tag.id===pins.selected);if(tag)rename(tag);};
        root.querySelector('[data-pin-clear]').onclick=()=>{
            if(isSmartCanvasLocked()||canvas!==pins.origin)return;
            const selected=pinnedNodes(),name=pins.selected==='all'?'全部pin':label(definitions().find(tag=>tag.id===pins.selected));
            if(!selected.length||!window.confirm(`将移除“${name}”标记的 ${selected.length} 个节点。节点本身不会被删除。`))return;
            if(canvas!==pins.origin||!writable(pins.origin,selected)())return;pushUndo();selected.forEach(node=>writeIds(node,pins.selected==='all'?[]:ids(node).filter(id=>id!==pins.selected)));render();scheduleSave();notifyChanged();
        };
        root.querySelector('[data-pin-download]').onclick=async()=>{
            const origin=canvas,expected=scope(),button=root.querySelector('[data-pin-download]');if(!pins||pins.scope!==expected||pins.origin!==origin)return;button.disabled=true;
            try{
                const items=pinnedNodes().flatMap(node=>[...(node.images||[]).map(media=>({url:media.url,name:media.name||node.label||'素材'})),...(!node.images?.length&&(node.text||node.promptDraftText)?[{kind:'text',name:(node.label||'文本')+'.txt',text:node.text||node.promptDraftText}]:[])]);
                if(!items.length)throw new Error('当前pin没有可下载的内容');
                const response=await window.CanvasApi.downloadCanvasAssets({items,filename:'pin-'+(pins.selected==='all'?'汇总':label(definitions().find(tag=>tag.id===pins.selected)))+'.zip'});
                if(!response.ok)throw new Error(await responseErrorMessage(response,'下载失败'));
                const blob=await response.blob();if(canvas!==origin||scope()!==expected||!root.isConnected)return;
                downloadBlob(blob,'pin汇总.zip');root.querySelector('[role=status]').textContent='下载已开始';
            }catch(error){if(root.isConnected)root.querySelector('[role=status]').textContent=error.message;}
            finally{if(root.isConnected)button.disabled=false;}
        };
        drawPins();
    }
    function pinnedNodes(){return nodes.filter(node=>{const tags=ids(node);return pins.selected==='all'?tags.length>0:tags.includes(pins.selected);});}
    function drawPins(){
        if(!pins||!pins.root.isConnected)return;
        if(canvas!==pins.origin||scope()!==pins.scope){pins.root.remove();pins=null;return;}
        const tags=definitions();if(pins.selected!=='all'&&!tags.some(tag=>tag.id===pins.selected))pins.selected='all';
        const {root,selected,query}=pins,counts=new Map(tags.map(tag=>[tag.id,0]));nodes.forEach(node=>ids(node).forEach(id=>counts.set(id,counts.get(id)+1)));
        const all=nodes.filter(node=>ids(node).length),tag=tags.find(tag=>tag.id===selected);
        root.querySelector('.pixmax-pin-tags').innerHTML=`<button type="button" data-pin-tag="all" ${selected==='all'?'class="active"':''}>全部 ${all.length}</button>`+tags.map(tag=>`<button type="button" data-pin-tag="${escapeAttr(tag.id)}" ${selected===tag.id?'class="active"':''}><span class="pixmax-tag-dot" style="background:${tag.color}"></span>${escapeHtml(label(tag))} ${counts.get(tag.id)}</button>`).join('');
        const matching=pinnedNodes().filter(node=>String((node.label||node.title||'')+' '+(node.text||node.promptDraftText||'')).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
        root.querySelector('[data-pin-heading]').textContent=(tag?label(tag):'全部pin')+' · '+matching.length+'个节点';
        root.querySelector('[data-pin-rename]').disabled=isSmartCanvasLocked()||!tag;root.querySelector('[data-pin-clear]').disabled=isSmartCanvasLocked()||!pinnedNodes().length;
        root.querySelector('.pixmax-pin-list').innerHTML=matching.map(node=>{
            const media=node.images?.[0]||node.studioPreview,poster=media&&(mediaKindForItem(media)==='image'?smartMediaPreviewUrl(media,256):pixmaxMediaPoster(media));
            return `<article><button type="button" data-pin-focus="${escapeAttr(node.id)}" aria-label="定位 ${escapeAttr(node.label||node.title||node.id)}">${poster?`<img src="${escapeAttr(poster)}" loading="lazy" alt="">`:''}<strong>${escapeHtml(node.label||node.title||'节点')}</strong><p>${escapeHtml((node.text||node.promptDraftText||media?.name||'').slice(0,240))}</p></button><button type="button" data-pin-remove="${escapeAttr(node.id)}" aria-label="取消pin" ${isSmartCanvasLocked()?'disabled':''}>×</button></article>`;
        }).join('')||'<p class="pixmax-creation-hint">暂无pin节点</p>';
    }
    function notifyChanged(){
        if(frame!==null)return;frame=requestAnimationFrame(()=>{
            frame=null;if(picker&&(picker.origin!==canvas||picker.scope!==scope())){picker.root.remove();picker=null;}drawPins();
        });
    }
    function mergeImported(imported,importedNodes){
        if(!Array.isArray(imported.node_tags))return;
        const current=definitions(),byId=new Map(current.map(tag=>[tag.id,tag])),mapping=new Map();
        for(const tag of normalized(imported.node_tags)){
            const existing=byId.get(tag.id);let id=tag.id;
            if(existing&&(existing.color!==tag.color||existing.name!==tag.name))id=uid('pin');
            if(!byId.has(id)){const copy={...tag,id};current.push(copy);byId.set(id,copy);}mapping.set(tag.id,id);
        }
        if(current.length>256)throw new Error('标签数量超过画布限制');
        canvas.node_tags=current;importedNodes.forEach(node=>{const source=Array.isArray(node.tags)&&node.tags.length?node.tags:node.pinned?['yellow']:[];node.tags=source.map(id=>mapping.get(id)||id);node.pinned=ids(node).length>0;});
    }
    function markup(node){return '<span class="pixmax-node-tag-dots">'+ids(node).map(id=>{const tag=definitions().find(tag=>tag.id===id);return `<span class="pixmax-tag-dot" style="background:${tag.color}" title="${escapeAttr(label(tag))}"></span>`;}).join('')+'</span>';}
    document.addEventListener('pointerdown',event=>{if(picker&&!picker.root.contains(event.target)&&!event.target.closest('[data-smart-node-action="tags"],[data-pin-picker]'))closePicker();});
    window.addEventListener('pagehide',()=>{if(picker){picker.root.remove();picker=null;}if(frame!==null)cancelAnimationFrame(frame);frame=null;});
    window.PixmaxTags=Object.freeze({definitions,ids,markup,togglePin,openPicker,openPins,notifyChanged,mergeImported,normalize:normalized});
})();
