/* Read-only media detail view, separated from all image editing state. */
(() => {
    'use strict';
    let current;
    const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
    const btn=(label,fn,cls)=>{const n=el('button',label,cls);n.type='button';n.onclick=fn;return n;};
    const scope=()=>JSON.stringify([window.CanvasSession?.context?.member?.id,window.CanvasSession?.context?.workspace?.id]);
    const idOf=item=>item?.media_asset_id||item?.id||'';
    const date=value=>value&&!Number.isNaN(new Date(value).getTime())?new Date(value).toLocaleString('zh-CN',{hour12:false}):'—';
    const bytes=value=>Number.isFinite(value)&&value>=0?(value<1024?value+' B':value<1048576?(value/1024).toFixed(1)+' KB':(value/1048576).toFixed(1)+' MB'):'—';
    function open(options){
        current?.close(false);
        if(smartImageEditor.state.open)closeImageEditor();
        const origin=canvas,bound=scope(),sessionEnabled=Boolean(window.CanvasSession?.enabled),previous=document.activeElement;
        const root=el('dialog',undefined,'pixmax-image-preview');root.setAttribute('aria-label','图片预览');
        const main=el('main'),stage=el('div',undefined,'pixmax-detail-stage'),picture=el('img'),thumbs=el('div',undefined,'pixmax-detail-thumbs'),mediaStatus=el('div','','pixmax-detail-media-status');mediaStatus.setAttribute('role','status');
        picture.draggable=false;picture.alt='预览图片';stage.append(picture,mediaStatus);main.append(stage,thumbs);
        const aside=el('aside'),details=el('div',undefined,'pixmax-detail-info'),status=el('p','','pixmax-detail-status');status.setAttribute('role','status');aside.append(details,status);
        let stopped=false,version=0,controller=new AbortController(),item=options.item,items=options.images||[item],history=options.history||[],cursor=options.nextCursor||null;
        let scale=1,x=0,y=0,drag=null,dimensions,historyLoading=false;
        const active=()=>!stopped&&root.isConnected&&canvas===origin&&scope()===bound&&Boolean(window.CanvasSession?.enabled)===sessionEnabled&&!window.CanvasSession?.paused&&(!options.isActive||options.isActive());
        const close=(notify=true)=>{if(stopped)return;stopped=true;version++;controller.abort();observer.disconnect();window.removeEventListener('member-session:paused',paused);window.removeEventListener('pagehide',paused);picture.onload=picture.onerror=null;picture.removeAttribute('src');root.querySelectorAll('video,audio').forEach(n=>{n.pause();n.removeAttribute('src');n.load();});root.close();root.remove();if(current?.element===root)current=null;if(previous?.isConnected)previous.focus();if(notify)options.onClose?.();};
        const paused=()=>close(false),observer=new MutationObserver(()=>{if(!active())close(false);});
        function transform(){picture.style.transform=`translate(${x}px,${y}px) scale(${scale})`;stage.dataset.scale=String(scale);stage.dataset.panX=String(x);stage.dataset.panY=String(y);}
        function reset(){scale=1;x=y=0;drag=null;transform();}
        stage.addEventListener('wheel',e=>{e.preventDefault();e.stopPropagation();if(!active())return;const box=stage.getBoundingClientRect(),px=e.clientX-box.left-box.width/2,py=e.clientY-box.top-box.height/2,next=Math.max(.5,Math.min(5,scale+(e.deltaY>0?-.15:.15))),ratio=next/scale;x=px-(px-x)*ratio;y=py-(py-y)*ratio;scale=next;transform();},{passive:false});
        stage.onpointerdown=e=>{if(e.button!==0||e.target.closest('button'))return;e.preventDefault();stage.setPointerCapture(e.pointerId);drag={px:e.clientX,py:e.clientY,x,y};stage.classList.add('dragging');};
        stage.onpointermove=e=>{if(!drag||!active())return;x=drag.x+e.clientX-drag.px;y=drag.y+e.clientY-drag.py;transform();};
        stage.onpointerup=stage.onpointercancel=stage.onlostpointercapture=()=>{drag=null;stage.classList.remove('dragging');};stage.ondblclick=e=>{if(!e.target.closest('button'))reset();};
        const exit=btn('×',()=>close(),'pixmax-detail-close');exit.setAttribute('aria-label','关闭图片预览');
        const prev=btn('‹',()=>navigate(-1),'pixmax-detail-prev'),next=btn('›',()=>navigate(1),'pixmax-detail-next');prev.setAttribute('aria-label','上一条历史');next.setAttribute('aria-label','下一条历史');stage.append(exit,prev,next);
        function navigation(){const index=history.findIndex(v=>idOf(v)===idOf(item));prev.hidden=index<=0;next.hidden=index<0||index>=history.length-1&&!cursor;prev.disabled=next.disabled=historyLoading;}
        async function request(path){const response=await MemberCanvasEdit.send(path,{signal:controller.signal,cache:'no-store'});if(!response.ok)throw Error(response.status===403?'无权读取这条生成记录。':response.status===404?'该素材没有可读取的生成详情。':'详情加载失败，请重试。');return response.json();}
        const params=()=>new URLSearchParams({...options.canvasId?{canvas_id:options.canvasId}:{},...options.nodeId?{node_id:options.nodeId}:{}});
        async function moreHistory(){if(historyLoading||!active())return;historyLoading=true;navigation();try{const query=params();query.set('kind','image');query.set('limit','100');if(cursor)query.set('cursor',cursor);const data=await request('/api/canvas-generation-history?'+query);if(!active())return;history=[...history,...(data.items||[]).filter(v=>!history.some(h=>idOf(h)===idOf(v)))];cursor=data.next_cursor||null;}catch(error){if(active()&&error.name!=='AbortError')status.replaceChildren(el('span',error.message),btn('重试历史',moreHistory));}finally{historyLoading=false;if(active())navigation();}}
        async function navigate(delta){if(historyLoading||!active())return;let index=history.findIndex(v=>idOf(v)===idOf(item));if(index<0)return;if(delta>0&&index===history.length-1&&cursor)await moreHistory();const target=history[index+delta];if(active()&&target){items=[target];await select(target);}}
        function field(label,value){const row=el('div'),title=el('dt',label),text=el('dd',value??'—');row.append(title,text);details.append(row);return text;}
        function info(asset,metadata={},parameters={},references=[]){
            details.replaceChildren();field('文件名称',asset.name||options.label||'—');field('文件类型',metadata.file_type||asset.name?.split('.').pop()?.toUpperCase()||'图片');field('文件大小',bytes(metadata.size_bytes));dimensions=field('尺寸',asset.natural_w&&asset.natural_h?`${asset.natural_w} × ${asset.natural_h}`:'—');
            if(picture.complete&&picture.naturalWidth)dimensions.textContent=`${picture.naturalWidth} × ${picture.naturalHeight}`;
            if(asset.task_id)field('任务 ID',asset.task_id);field('任务创建时间',date(metadata.task_created_at));field('结束时间',date(metadata.completed_at));
            const chips=el('div',undefined,'pixmax-detail-tags');for(const value of [parameters.model,parameters.resolution||parameters.size,parameters.aspect_ratio])if(value)chips.append(el('span',String(value)));details.append(chips);
            if(references.length){const list=el('div',undefined,'pixmax-detail-references');list.setAttribute('aria-label','输入素材');const order={text:0,audio:1,image:2,video:3};for(const ref of [...references].sort((a,b)=>(order[a.kind]??4)-(order[b.kind]??4))){const b=btn('',()=>reference(ref));b.dataset.referenceId=ref.id;b.setAttribute('aria-label','预览参考素材 '+ref.name);if(ref.kind==='image'||ref.kind==='video'){const img=el('img');img.alt=ref.name;img.loading='lazy';img.onerror=()=>img.replaceWith(el('span',ref.kind==='video'?'视频':'图片'));img.src=displayMediaUrl(ref.thumbnail_url||ref.url);b.append(img);}else b.append(el('span',ref.kind==='audio'?'音频':'素材'));list.append(b);}details.append(list);}
            if(parameters.prompt){const prompt=el('div',String(parameters.prompt),'pixmax-detail-prompt');prompt.setAttribute('aria-label','生成提示词');details.append(prompt);}
        }
        function reference(ref){if(!active())return;const parent={...options,item,images:items,history,nextCursor:cursor};if(ref.kind==='image'){open({item:ref,isActive:options.isActive,onMount:options.onMount,onClose:()=>open(parent)});return;}
            if(!['audio','video'].includes(ref.kind)){status.textContent='该输入素材暂不支持内嵌预览。';return;}
            const viewer=el('dialog',undefined,'pixmax-reference-view');viewer.setAttribute('aria-label','参考素材');const player=el(ref.kind==='audio'?'audio':'video');player.controls=true;player.src=displayMediaUrl(ref.url);const finish=()=>{player.pause();player.removeAttribute('src');player.load();viewer.close();viewer.remove();};viewer.append(btn('关闭',finish),player);root.append(viewer);viewer.addEventListener('keydown',e=>e.stopPropagation());viewer.addEventListener('cancel',e=>{e.preventDefault();e.stopPropagation();finish();});viewer.showModal();}
        async function select(value){
            if(!active())return;root.querySelectorAll('.pixmax-reference-view').forEach(view=>{view.querySelectorAll('video,audio').forEach(p=>{p.pause();p.removeAttribute('src');p.load();});view.close();view.remove();});item=value;options.onSelect?.(item);const stamp=++version;reset();status.replaceChildren();mediaStatus.textContent='正在加载图片…';picture.onload=()=>{if(active()&&stamp===version){mediaStatus.replaceChildren();if(dimensions)dimensions.textContent=`${picture.naturalWidth} × ${picture.naturalHeight}`;}};picture.onerror=()=>{if(active()&&stamp===version)mediaStatus.replaceChildren(el('span','图片加载失败。'),btn('重试图片',()=>select(item)));};picture.src=displayMediaUrl(item.url);picture.alt=item.name||'预览图片';
            info(item,options.metadata,options.parameters);thumbs.replaceChildren();if(items.length>1)for(const candidate of items){const b=btn('',()=>select(candidate)),img=el('img');img.src=displayMediaUrl(candidate.thumbnail_url||candidate.url);img.alt=candidate.name||'结果图片';b.setAttribute('aria-label','查看 '+(candidate.name||'结果图片'));b.setAttribute('aria-pressed',String(candidate===item));b.append(img);thumbs.append(b);}navigation();
            if(!idOf(item)||!window.CanvasSession?.enabled)return;status.textContent='正在读取详情…';
            try{const data=await request('/api/canvas-generation-history/'+encodeURIComponent(idOf(item))+'?'+params());if(!active()||stamp!==version)return;info(data.item,data.metadata,data.parameters,data.references);status.textContent='';}
            catch(error){if(active()&&stamp===version&&error.name!=='AbortError')status.replaceChildren(el('span',error.message),btn('重试详情',()=>select(item)));}
        }
        if(options.onPanorama){const panorama=btn('◎',()=>{if(!active())return;const selected=item;close(false);options.onPanorama(selected);},'pixmax-detail-panorama');panorama.title='进入全景预览';panorama.setAttribute('aria-label','进入全景预览');stage.append(panorama);}
        root.addEventListener('cancel',e=>{e.preventDefault();close();});root.addEventListener('keydown',e=>{e.stopPropagation();if(e.target.closest('input,textarea,[contenteditable=true]'))return;if(e.key==='ArrowLeft'){e.preventDefault();navigate(-1);}if(e.key==='ArrowRight'){e.preventDefault();navigate(1);}});
        for(const type of ['pointerdown','mousedown','wheel','dblclick','paste'])root.addEventListener(type,e=>e.stopPropagation());root.onclick=e=>{if(e.target===root)close();};
        root.append(main,aside);document.body.append(root);root.showModal();current={element:root,close};options.onMount?.(root);observer.observe(document.body,{childList:true,subtree:true});window.addEventListener('member-session:paused',paused);window.addEventListener('pagehide',paused);select(item);if(options.nodeId&&window.CanvasSession?.enabled&&!options.history)moreHistory();return current;
    }
    function openNode(node,index=0){
        const source=node.images?.[index];if(!source?.url)return;
        // Autosave normalizes media objects. Bind to the slot and resource identity,
        // not object references that change during an otherwise unchanged save.
        const resources=node.images.map(item=>({item,url:item.url,id:idOf(item)})),origin=resources[index];
        const matches=(item,resource)=>item?.url===resource.url&&idOf(item)===resource.id&&mediaKindForItem(item)==='image';
        const images=resources.map(resource=>resource.item).filter(item=>item.url&&mediaKindForItem(item)==='image');
        return open({item:source,images,label:node.label,canvasId:canvas.id,nodeId:node.generationKind==='image'?node.id:undefined,
            isActive:()=>nodes.includes(node)&&matches(node.images?.[index],origin),
            onPanorama:selected=>{const position=resources.findIndex(resource=>resource.item===selected);
                if(position>=0&&matches(node.images?.[position],resources[position]))openImageEditor(node.id,position);
                else smartImageEditor.openDetached({id:'__panorama_detail__',type:'smart-image',images:[selected]},0);
                smartPanoramaPreview.toggle();}});
    }
    window.PixmaxImagePreview=Object.freeze({open,openNode,close:()=>current?.close(),get opened(){return Boolean(current);}});
})();
