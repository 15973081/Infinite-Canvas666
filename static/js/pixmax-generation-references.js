/* N1's o$ source cards project the host graph; callbacks never own canvas data. */
(() => {
    'use strict';
    async function mount({node,api,valid,editable,onInsert,onRoot}){
        const root=document.createElement('section');root.className='pixmax-native-generation-references';root.setAttribute('aria-label','参考素材');
        inputThumbsRow.before(root);onRoot?.(root,true);
        for(const type of ['mousedown','pointerdown','keydown','wheel'])root.addEventListener(type,event=>event.stopPropagation());
        let closed=false,handle,stamp;
        const current=()=>!closed&&root.isConnected&&valid();
        const allowed=()=>current()&&editable();
        function data(plan){
            const config=smartSettingsForNode(node),mode=window.PixmaxVideoModes?.selected(config),images=plan.resources.filter(entry=>entry.kind==='image');
            const names={},sourceNodes=plan.resources.map(entry=>{
                const label=entry.kind==='image'&&['imageToVideo','firstAndLastFrame'].includes(mode)?images.indexOf(entry)===0?'首帧':'尾帧':null;
                names[entry.id]='引用 '+(label||entry.alias)+' · '+entry.name;
                const media=entry.media,url=media?displayMediaUrl(media):undefined,preview=entry.kind==='image'?smartMediaPreviewUrl(media,256):entry.kind==='video'?pixmaxMediaPoster(media):undefined;
                const icon=window.PixmaxCanvasAssets?.icons[entry.kind],thumbnail=preview||(icon?'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60"><g transform="translate(20 20) scale(1.43)">'+icon.replace(/^<svg[^>]*>|<\/svg>$/g,'')+'</g></svg>'):undefined);
                return {id:entry.id,type:entry.kind,data:{label:entry.name,text:entry.text,url,thumbnailUrl:entry.kind==='image'?thumbnail:undefined,poster:entry.kind==='video'?thumbnail:undefined,duration:media?.duration}};
            });
            return {nodes:sourceNodes,referenceNames:names};
        }
        function refresh(plan=PixmaxReshootReferences.plan(node),force=false){
            if(!current())return;
            const next=data(plan),key=JSON.stringify(next);
            if(force||key!==stamp){stamp=key;handle?.setData(next);}
            handle?.setDisabled(!editable());handle?.setViewport(viewport);
        }
        const graph={
            removeIncomingEdge(target,id){
                if(!allowed()||target!==node.id)return;
                const entry=PixmaxReshootReferences.plan(node).byId.get(id);if(!entry)return;
                PixmaxNativePrompt.flush(node);PixmaxReshootReferences.remove(node,entry);refresh();
            },
            reorderEdges(target,ids){
                if(!allowed()||target!==node.id)return;
                const plan=PixmaxReshootReferences.plan(node),entries=ids.map(id=>plan.byId.get(id));
                if(new Set(ids).size!==ids.length||entries.some(entry=>!entry)||ids.length!==plan.resources.length){refresh(plan,true);return;}
                const keys=entries.filter(entry=>entry.media).map(entry=>smartMediaRefKey(entry.media));
                const texts=entries.filter(entry=>entry.kind==='text').map(entry=>entry.nodeId),textIds=new Set(texts);
                const slots=canvas.connections.flatMap((edge,index)=>edge.to===node.id&&(edge.kind||'flow')==='input'&&textIds.has(edge.from)?[index]:[]),edges=slots.map(index=>canvas.connections[index]);
                const ordered=edges.slice().sort((a,b)=>texts.indexOf(a.from)-texts.indexOf(b.from));
                if(JSON.stringify(keys)===JSON.stringify(node.mediaReferenceOrder||plan.resources.filter(entry=>entry.media).map(entry=>smartMediaRefKey(entry.media)))&&ordered.every((edge,index)=>edge===edges[index]))return;
                PixmaxNativePrompt.flush(node);pushUndo();node.mediaReferenceOrder=keys;
                slots.forEach((slot,index)=>canvas.connections[slot]=ordered[index]);
                render();scheduleSave();refresh();
            }
        };
        try{
            const plan=PixmaxReshootReferences.plan(node);
            handle=await api.mountReferences(root,{...data(plan),nodeId:node.id,hostGraph:graph,disabled:!editable(),viewport,
                canPreview:source=>!String(source.data.url||'').startsWith('asset://'),
                onInsertMention:id=>{if(!allowed())return;const mention=PixmaxReshootReferences.plan(node).mentions.find(mention=>mention.id===id);if(mention)onInsert(mention);}});
            if(!current()){destroy();return;}
            composer.classList.add('pixmax-native-references-active');refresh();return {refresh,destroy,updateViewport:()=>{if(current())handle.setViewport(viewport);}};
        }catch(error){destroy();throw error;}
        function destroy(){if(closed)return;closed=true;handle?.destroy();root.remove();onRoot?.(root,false);if(!composer.querySelector('.pixmax-native-generation-references'))composer.classList.remove('pixmax-native-references-active');}
    }
    window.PixmaxGenerationReferences=Object.freeze({mount});
})();
