/* Native prompt resources use the host graph and keep the crop as video 1. */
(() => {
    'use strict';
    const token=/%%@\[([^\]]*)\]\[(text|image|audio|video)\]\[(\d+)\]\(([^)]+)\)%%/g;
    const identity=media=>String(media?.url||'').match(/(?:assets\/cloud|api\/media)\/(ast_[a-f0-9]{32})(?:\/|$)/)?.[1]||media?.url;
    const label={image:'图片',audio:'音频',video:'视频',text:'文本'};
    function plan(node){
        const state=node.segmentReshoot,entries=[],seen=new Set(),blocked=blockedInputRefKeys(node),counts={image:0,audio:0,video:1,text:0};
        const crop={id:state.source.nodeId||node.id+'::source',nodeId:state.source.nodeId,kind:'video',alias:'视频1',name:'重拍片段',crop:true,media:state.source.media||{url:state.source.url,kind:'video'}};
        for(const source of upstreamNodesForKinds(node,['input','flow'])){
            if(source.type==='smart-prompt'){
                if(source.text?.trim())entries.push({id:source.id,nodeId:source.id,kind:'text',name:source.label||'文本',text:source.text,alias:'文本'+(++counts.text)});
                continue;
            }
            for(const [index,media] of (source.images||[]).entries()){
                const kind=mediaKindForItem(media);if(!media.url||!['image','audio','video'].includes(kind))continue;
                if(kind==='video'&&identity(media)===state.source.identity&&!source.subjectReference)continue;
                const ref={...media,kind,nodeId:source.id,imageIndex:index},key=kind+':'+identity(media);
                if(blocked.has(inputRefKey(ref))||seen.has(key))continue;seen.add(key);
                entries.push({id:index?source.id+'::'+index:source.id,nodeId:source.id,imageIndex:index,kind,name:source.label||media.name||label[kind],media:ref,alias:label[kind]+(++counts[kind])});
            }
        }
        const order=new Map((node.mediaReferenceOrder||[]).map((key,index)=>[key,index]));
        for(const kind of ['image','audio','video']){
            const group=entries.filter(entry=>entry.kind===kind).sort((a,b)=>(order.get(smartMediaRefKey(a.media))??Infinity)-(order.get(smartMediaRefKey(b.media))??Infinity));
            let index=kind==='video'?1:0;for(const entry of group)entry.alias=label[kind]+(++index);
            const slots=entries.flatMap((entry,index)=>entry.kind===kind?[index]:[]);slots.forEach((slot,index)=>entries[slot]=group[index]);
        }
        const resources=[crop,...entries],byId=new Map(resources.map(entry=>[entry.id,entry]));
        const mentions=resources.map(entry=>({id:entry.id,type:entry.kind,index:Number(entry.alias.replace(/\D/g,''))-1,tokenTitle:entry.name.replace(/[\[\]\r\n]/g,' '),displayTitle:entry.alias+' ('+entry.name+')',thumbnailUrl:entry.kind==='image'?smartMediaPreviewUrl(entry.media,256):entry.kind==='video'?pixmaxMediaPoster(entry.media):undefined}));
        const incomingNodes=resources.map(entry=>({id:entry.id,type:entry.kind,data:{label:entry.name,text:entry.text,url:entry.media?.url,thumbnailUrl:entry.kind==='image'?smartMediaPreviewUrl(entry.media,256):undefined,poster:entry.kind==='video'?pixmaxMediaPoster(entry.media):undefined}}));
        return {entries,resources,byId,mentions,incomingNodes};
    }
    function validate(node,current=plan(node)){
        const invalid=[];
        let prompt=PixmaxPromptTokens.compile(window.PixmaxSubjects?PixmaxSubjects.compile(node,current):String(node.segmentReshoot.prompt||'')).replace(token,(_value,_title,kind,_index,id)=>{
            const entry=current.byId.get(id);if(!entry||entry.kind!==kind){invalid.push(id);return '';}
            return entry.alias;
        });
        if(invalid.length||/%%@\[/.test(prompt))throw new Error('提示词中存在失效参考，请重新选择或移除引用');
        return [...current.entries.filter(entry=>entry.kind==='text').map(entry=>entry.alias+'：'+entry.text),prompt.trim()||'保留原画面、人物、声音及镜头运动，不改变内容。'].join('\n\n');
    }
    function request(node,config){
        const current=plan(node),prompt=validate(node,current);
        const refs=current.entries.filter(entry=>entry.media).map(entry=>({...entry.media,referenceLabel:entry.alias}));
        const provider=(apiProviders||[]).find(item=>item.id===config.videoProvider);
        const extraVideos=refs.filter(ref=>ref.kind==='video').map(ref=>({manual:true,url:smartVolcengineAssetUrisForRef(smartCurrentFaceAuthRef(ref),provider).volcengine||ref.url}));
        return {prompt,refs,settings:{...config,videoTempShLinks:[{manual:true,url:node.segmentReshoot.cache.clipAssetUuid},...extraVideos]}};
    }
    function signature(node){
        const current=plan(node),config=settingsForStorage(node.runSettings);delete config.videoTempShLinks;
        return JSON.stringify([node.segmentReshoot.prompt,config,current.resources.map(entry=>[entry.id,entry.kind,entry.text,identity(entry.media),entry.media?.asset_uris]),window.PixmaxSubjects?.signature(node)]);
    }
    function setPrompt(node,value){
        const current=plan(node);let position=0,html='';
        for(const match of value.matchAll(token)){
            html+=PixmaxPromptTokens.html(value.slice(position,match.index));position=match.index+match[0].length;
            const entry=current.byId.get(match[4]);
            html+=entry?.media?mentionTokenHtml({...entry.media,nodeId:entry.nodeId||'',imageIndex:entry.imageIndex||0,name:entry.name,referenceLabel:entry.alias}):entry?`<span class="pixmax-reshoot-text-token" contenteditable="false" data-reshoot-reference-id="${escapeAttr(entry.id)}">@${escapeHtml(entry.alias)}</span>`:escapeHtml(match[0]);
        }
        node.segmentReshoot.prompt=value;window.PixmaxSubjects?.prune(node);node.promptDraftText=PixmaxPromptTokens.text(value.replace(token,(_match,_title,_kind,_index,id)=>'@'+(current.byId.get(id)?.alias||'失效参考')));
        node.promptDraftHtml=html+PixmaxPromptTokens.html(value.slice(position));
        if(typeof activeComposerNode==='function'&&activeComposerNode()===node&&promptInput)promptInput.innerHTML=node.promptDraftHtml;
    }
    function captureComposer(node){
        const current=plan(node);
        const parts=[];
        const walk=element=>{
            if(element.nodeType===Node.TEXT_NODE){parts.push({type:'text',text:element.textContent||''});return;}
            if(element.nodeType!==Node.ELEMENT_NODE)return;
            if(element.dataset.pixmaxPromptToken){parts.push({type:'literal',token:element.dataset.pixmaxPromptToken});return;}
            if(element.dataset.reshootReferenceId){parts.push({type:'reference',id:element.dataset.reshootReferenceId});return;}
            if(element.classList.contains('mention-image-token')){parts.push({type:'image',kind:element.dataset.kind,url:element.dataset.url,nodeId:element.dataset.nodeId,imageIndex:Number(element.dataset.imageIndex||0)});return;}
            if(element.tagName==='BR')parts.push({type:'text',text:'\n'});element.childNodes.forEach(walk);if(element!==promptInput&&['DIV','P'].includes(element.tagName))parts.push({type:'text',text:'\n'});
        };promptInput.childNodes.forEach(walk);
        node.segmentReshoot.prompt=parts.map(part=>{
            if(part.type==='text')return part.text;
            if(part.type==='literal')return part.token;
            const entry=part.id?current.byId.get(part.id):current.resources.find(entry=>entry.media&&entry.kind===mediaKindForItem(part)&&((entry.nodeId===part.nodeId&&entry.imageIndex===part.imageIndex)||(entry.crop&&identity(entry.media)===identity(part))));
            const mention=current.mentions.find(item=>item.id===entry?.id);
            return mention?`%%@[${mention.tokenTitle}][${mention.type}][${mention.index}](${mention.id})%%`:`%%@[失效参考][${part.id?'text':mediaKindForItem(part)}][0](${part.id||part.nodeId||'missing'})%%`;
        }).join('');window.PixmaxSubjects?.prune(node);
    }
    function remap(node,idMap,previousSource){
        const currentSource=node.segmentReshoot.source.nodeId||node.id+'::source';
        setPrompt(node,String(node.segmentReshoot.prompt||'').replace(token,(value,title,kind,index,id)=>{
            const split=id.lastIndexOf('::'),base=split<0?id:id.slice(0,split),suffix=split<0?'':id.slice(split);
            const next=kind==='video'&&id===previousSource?currentSource:idMap.has(base)?idMap.get(base)+suffix:id;
            return `%%@[${title}][${kind}][${index}](${next})%%`;
        }));
        if(node.blockedInputRefs)node.blockedInputRefs=node.blockedInputRefs.map(key=>{const [id,index]=key.split('|');return idMap.has(id)?idMap.get(id)+'|'+index:key;});
    }
    function connect(node,id){
        const source=nodes.find(item=>item.id===id);if(!source||source===node||source.hidden)return false;
        const unblocked=(node.blockedInputRefs||[]).filter(key=>!key.startsWith(id+'|')),changed=unblocked.length!==(node.blockedInputRefs||[]).length;
        if(!canvas.connections.some(edge=>edge.from===id&&edge.to===node.id)){
            const visited=new Set(),stack=[node.id];while(stack.length){const next=stack.pop();if(next===id)return false;if(visited.has(next))continue;visited.add(next);for(const edge of canvas.connections)if(edge.from===next)stack.push(edge.to);}
            pushUndo();canvas.connections.push({from:id,to:node.id,kind:'input'});node.blockedInputRefs=unblocked;render();scheduleSave();
        }else if(changed){pushUndo();node.blockedInputRefs=unblocked;render();scheduleSave();
        }
        return true;
    }
    function addAsset(node,item){
        const kind=assetMediaKind(item);if(!item.url||!['image','audio','video'].includes(kind))return;
        const existing=plan(node).resources.find(entry=>entry.kind===kind&&identity(entry.media)===identity(item));if(existing)return existing.id;
        for(const source of upstreamNodesForKinds(node,['input','flow'])){
            const index=(source.images||[]).findIndex(media=>mediaKindForItem(media)===kind&&identity(media)===identity(item));if(index<0)continue;
            const key=inputRefKey({...source.images[index],nodeId:source.id,imageIndex:index});if(!(node.blockedInputRefs||[]).includes(key))continue;
            pushUndo();node.blockedInputRefs=node.blockedInputRefs.filter(value=>value!==key);render();scheduleSave();return index?source.id+'::'+index:source.id;
        }
        pushUndo();const source=createNode(node.x-56,node.y,[{...item,kind,asset_item_id:item.id,asset_uris:assetRegisteredUris(item)}],{select:false,skipUndo:true,deferRender:true});source.hidden=true;source.label=item.name||label[kind];
        canvas.connections.push({from:source.id,to:node.id,kind:'input'});render();scheduleSave();return source.id;
    }
    function remove(node,entry){
        if(entry.crop)return;
        const source=nodes.find(source=>source.id===entry.nodeId);if(source?.subjectReference){PixmaxSubjects.remove(node,source.subjectReference.groupId);return;}
        pushUndo();
        if(entry.media)node.blockedInputRefs=[...new Set([...(node.blockedInputRefs||[]),inputRefKey(entry.media)])];
        else canvas.connections=canvas.connections.filter(edge=>!(edge.from===entry.nodeId&&edge.to===node.id));
        render();scheduleSave();
    }
    function expandHidden(ids){
        const selected=new Set(ids),byId=new Map(nodes.map(node=>[node.id,node])),stack=[...ids];
        while(stack.length){const target=stack.pop();for(const edge of canvas.connections||[])if(edge.to===target&&byId.get(edge.from)?.hidden&&!selected.has(edge.from)){selected.add(edge.from);stack.push(edge.from);}}
        return [...selected];
    }
    function project(documentNodes){for(const node of documentNodes)if(node.segmentReshoot?.schemaVersion===1)setPrompt(node,node.segmentReshoot.prompt||'');}
    window.PixmaxReshootReferences=Object.freeze({plan,validate,request,signature,setPrompt,captureComposer,remap,connect,addAsset,remove,expandHidden,project});
})();
