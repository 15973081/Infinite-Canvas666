/* Shared read-only media viewer. Never obtains a lease or modifies a canvas. */
(() => {
    'use strict';
    const mediaSelector='.image-preview-wrap img,.output-img-wrap img,.output-video-play,.output-video-fallback,.canvas-video-fallback,.output-audio-card,.image-wrap img,.thumb-item img,.smart-video-play,.smart-video-fallback,.smart-audio-open';
    function collect(snapshot, base) {
        const items=[];
        for(const node of snapshot?.nodes || []) {
            const refs=node.type==='image' && node.url ? [node] : Array.isArray(node.images) ? node.images : [];
            refs.forEach((ref,index) => {
                const value=typeof ref==='string' ? {url:ref} : ref;
                if(!value?.url || !node.id)return;
                let url;try{url=new URL(value.url,base);}catch{return;}
                if(!['http:','https:','blob:'].includes(url.protocol) && !(url.protocol==='data:' && /^data:(image|video|audio)\//i.test(value.url)))return;
                const kind=value.kind || value.mediaKind || (/\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(value.url) ? 'video'
                    : /\.(mp3|wav|m4a|aac|ogg|flac)(?:$|[?#])/i.test(value.url) ? 'audio'
                    : /\.(txt|json|csv|srt|vtt|md|pdf|zip)(?:$|[?#])/i.test(value.url) ? 'file' : 'image');
                if(!['image','video','audio'].includes(kind))return;
                items.push({nodeId:String(node.id),index,url:String(value.url),kind,name:String(value.name || node.name || node.title || '素材')});
            });
        }
        return items;
    }
    function matchTarget(target, items) {
        const media=target.closest?.(mediaSelector);
        const node=media?.closest('.node[data-id],.image-node[data-id]');
        if(!node)return null;
        const candidates=items.filter(item=>item.nodeId===node.dataset.id);
        const slot=media.closest('[data-image-index]');
        if(slot)return candidates.find(item=>item.index===Number(slot.dataset.imageIndex)) || null;
        const raw=media.closest('[data-output-url]')?.dataset.outputUrl || media.dataset.originalSrc || media.dataset.url;
        return raw ? candidates.find(item=>item.url===raw) || null : candidates.length===1 ? candidates[0] : null;
    }
    function create({window:win=window,entry,valid}) {
        const doc=win.document, initialEpoch=()=>entry.lease.epoch;
        let disposed=false,dialog=null,media=null,selected=null,openedEpoch=null,zoom=1;
        let heading,stage,status,counter,kindLabel,previous,next,smaller,larger,reset,download;
        const annotations=new Map();
        const permitted=()=>!disposed && valid() && entry.lease.state!=='paused' && !['offline','recovering'].includes(entry.lease.maintenance)
            && ['canvas.read','asset.read'].every(permission=>win.CanvasSession.context?.workspace?.permissions?.includes(permission));
        const items=()=>collect(entry.options.snapshot(),win.location.href);
        const el=(tag,text)=>{const value=doc.createElement(tag);if(text!==undefined)value.textContent=text;return value;};
        const button=(name,action)=>{const value=el('button',name);value.type='button';value.onclick=action;return value;};
        const trigger=button('预览素材',()=>open());
        function release() {
            win.CanvasMediaLoader?.unwatch(media);
            if(media){if(media.tagName!=='IMG'){media.pause();}media.removeAttribute('src');if(media.tagName!=='IMG')media.load();media.remove();media=null;}
            if(download)download.removeAttribute('href');
        }
        function close() {
            win.CanvasMediaLoader?.end('member-preview');
            selected=null;openedEpoch=null;release();
            if(dialog?.open)dialog.close();
        }
        function ensureDialog() {
            if(dialog)return;
            dialog=el('dialog');dialog.className='member-media-preview';dialog.setAttribute('aria-label','画布素材预览');
            const header=el('header'),controls=el('footer'),title=el('div'),navigation=el('div'),zoomControls=el('div');
            title.className='member-preview-title';navigation.className='member-preview-navigation';zoomControls.className='member-preview-zoom';
            kindLabel=el('span');kindLabel.className='member-preview-kind';heading=el('strong');title.append(kindLabel,heading);
            status=el('p');status.setAttribute('role','status');status.className='member-preview-feedback';counter=el('span');counter.className='member-preview-counter';
            stage=el('div');stage.className='member-media-preview-stage';
            previous=button('上一项',()=>step(-1));next=button('下一项',()=>step(1));
            smaller=button('缩小',()=>scale(1/1.25));larger=button('放大',()=>scale(1.25));reset=button('适合窗口',()=>scale(0));
            download=el('a','下载原件');download.rel='noopener';download.target='_blank';
            download.className='member-preview-download';
            download.addEventListener('click',event=>{if(!permitted() || !win.CanvasSession.context.workspace.permissions.includes('canvas.export')){event.preventDefault();close();}});
            const dismiss=button('关闭预览',close);dismiss.className='member-preview-dismiss';dismiss.setAttribute('aria-label','关闭预览');dismiss.title='关闭预览';
            for(const [control,icon] of [[previous,'previous'],[next,'next'],[smaller,'minus'],[larger,'plus']]){control.setAttribute('data-preview-icon',icon);control.setAttribute('aria-label',control.textContent);control.title=control.textContent;}
            header.append(title,dismiss);navigation.append(previous,counter,next);zoomControls.append(smaller,reset,larger);controls.append(navigation,zoomControls,download);
            dialog.append(header,stage,status,controls);doc.body.append(dialog);
            dialog.addEventListener('close',()=>{win.CanvasMediaLoader?.end('member-preview');selected=null;openedEpoch=null;release();});
            dialog.addEventListener('cancel',close);
            dialog.addEventListener('keydown',event=>{if(event.key==='ArrowLeft' && event.target===dialog){event.preventDefault();step(-1);}if(event.key==='ArrowRight' && event.target===dialog){event.preventDefault();step(1);}});
        }
        function scale(factor) {
            if(!permitted()){close();return;}
            if(media?.tagName!=='IMG')return;
            zoom=factor ? Math.max(.25,Math.min(8,zoom*factor)) : 1;
            media.style.width=zoom===1 ? '' : String(zoom*100)+'%';
            media.style.maxWidth=zoom===1 ? '100%' : 'none';media.style.maxHeight=zoom===1 ? '100%' : 'none';
        }
        function show(item,list) {
            release();selected=item;zoom=1;
            const url=win.MemberMediaUrl?.(item.url);
            if(!url){close();return;}
            win.CanvasMediaLoader?.begin('member-preview');
            dialog.setAttribute('data-kind',item.kind);
            heading.textContent=item.name;heading.title=item.name;kindLabel.textContent='画布素材 · '+({image:'图片',video:'视频',audio:'音频'}[item.kind]);
            counter.textContent=(list.indexOf(item)+1)+' / '+list.length;status.textContent='';
            media=el(item.kind==='image' ? 'img' : item.kind);media.setAttribute('aria-label',item.name);
            if(item.kind==='image')media.alt=item.name;else{media.controls=true;media.preload='metadata';}
            media.onerror=()=>{if(selected===item)status.textContent='素材加载失败，请确认素材仍可访问后重新打开。';};
            if(item.kind==='audio'){
                const card=el('div'),art=el('div'),details=el('p');card.className='member-preview-audio-card';art.className='member-preview-audio-art';art.setAttribute('aria-hidden','true');details.className='member-preview-audio-meta';
                const format=item.name.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toUpperCase();details.textContent=format || '音频';
                const player=media;player.onloadedmetadata=()=>{if(selected!==item||!Number.isFinite(player.duration))return;const seconds=Math.floor(player.duration);details.textContent=[format,Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')].filter(Boolean).join(' · ');};
                card.append(art,details,media);stage.replaceChildren(card);
            }else stage.replaceChildren(media);
            win.CanvasMediaLoader?.watch(media,stage,item.url);
            media.src=url;stage.scrollTop=0;stage.scrollLeft=0;
            previous.disabled=list.indexOf(item)===0;next.disabled=list.indexOf(item)===list.length-1;
            smaller.hidden=larger.hidden=reset.hidden=item.kind!=='image';
            download.hidden=!win.CanvasSession.context.workspace.permissions.includes('canvas.export');
            if(!download.hidden){download.href=url;download.download=item.name;}
        }
        function open(item) {
            if(!permitted())return;
            const list=items();const current=item ? list.find(value=>value.nodeId===item.nodeId && value.index===item.index && value.url===item.url) : list[0];
            if(!current)return;
            ensureDialog();openedEpoch=initialEpoch();show(current,list);
            if(selected && !dialog.open)dialog.showModal();
        }
        function step(offset) {
            if(!sync() || !selected)return;
            const list=items(),index=list.findIndex(item=>item.nodeId===selected.nodeId && item.index===selected.index && item.url===selected.url);
            if(list[index+offset])show(list[index+offset],list);
        }
        function restore(node,original) {
            for(const [name,value] of Object.entries(original)){if(value===null)node.removeAttribute(name);else node.setAttribute(name,value);}
            node.removeAttribute('data-member-preview');annotations.delete(node);
        }
        function sync() {
            const allowed=permitted(),readOnly=allowed && !entry.lease.canEdit;
            trigger.disabled=!allowed;
            if(selected && (!allowed || initialEpoch()!==openedEpoch || !items().some(item=>item.nodeId===selected.nodeId && item.index===selected.index && item.url===selected.url && item.kind===selected.kind)))close();
            for(const [node,original] of annotations){if(!readOnly || !node.isConnected)restore(node,original);}
            if(readOnly) {
                const list=items();
                for(const node of doc.querySelectorAll(mediaSelector)) {
                    if(!matchTarget(node,list)){if(annotations.has(node))restore(node,annotations.get(node));continue;}
                    if(!annotations.has(node))annotations.set(node,Object.fromEntries(['tabindex','role','aria-label','draggable'].map(name=>[name,node.getAttribute(name)])));
                    node.setAttribute('data-member-preview','');node.setAttribute('tabindex','0');node.setAttribute('role','button');node.setAttribute('aria-label','预览素材');node.setAttribute('draggable','false');
                }
            }
            return allowed;
        }
        function capture(event) {
            if(disposed || entry.lease.canEdit || !event.target.closest?.('[data-member-preview]'))return;
            if(event.type==='keydown' && !['Enter',' '].includes(event.key))return;
            event.preventDefault();event.stopImmediatePropagation();
            if(event.type==='click' || event.type==='keydown'){const item=matchTarget(event.target,items());if(permitted() && item)open(item);}
        }
        const events=['pointerdown','pointerup','mousedown','mouseup','click','dblclick','dragstart','keydown'];
        events.forEach(type=>win.addEventListener(type,capture,true));
        const observer=new win.MutationObserver(()=>sync());
        const world=doc.querySelector('#nodes') || doc.querySelector('#world');
        if(world)observer.observe(world,{childList:true,subtree:true});
        return {trigger,open,sync,close,dispose(){disposed=true;close();observer.disconnect();events.forEach(type=>win.removeEventListener(type,capture,true));for(const [node,original] of annotations)restore(node,original);dialog?.remove();trigger.remove();}};
    }
    const api={collect,matchTarget,create};
    if(typeof module==='object' && module.exports)module.exports=api;else window.MemberMediaPreview=api;
})();
