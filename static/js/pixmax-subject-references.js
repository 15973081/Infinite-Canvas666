/* Subject chips resolve scoped catalogs into persistent typed hidden input nodes. */
(() => {
    'use strict';
    const pattern=/%%subject-ref\(([^)]*)\)%%/g, clone=value=>JSON.parse(JSON.stringify(value));
    const remoteInvalid=new WeakMap();
    const scope=()=>({memberId:window.CanvasSession?.context?.member?.id,workspaceId:window.CanvasSession?.context?.workspace?.id});
    const mediaId=item=>item.media_asset_id||String(item.url||'').match(/(?:assets\/cloud|api\/media)\/(ast_[a-f0-9]{32})/)?.[1]||item.url;
    const safeName=value=>String(value||'主体').replace(/[|)\r\n]/g,' ');
    const parse=value=>[...String(value||'').matchAll(pattern)].map(match=>{
        const [groupId,second,third,...rest]=match[1].split('|'),typed=['PERSONAL','TEAM'].includes(second);
        return {groupId:groupId.trim(),ownerType:typed?second:undefined,name:typed?third:second,coverUrl:(typed?rest:[third,...rest]).filter(value=>value!==undefined).join('|'),token:match[0]};
    });
    const fingerprint=group=>JSON.stringify([group.name,group.description||'',group.cover_url||'',group.items.map(item=>[item.id,item.kind,item.name,item.text,mediaId(item),item.url,item.available!==false,item.registrations||{}])]);
    const token=subject=>`%%subject-ref(${subject.groupId}|${subject.ownerType}|${safeName(subject.name)}|${subject.cover_url||''})%%`;
    const belongs=subject=>subject.workspaceId===scope().workspaceId&&(subject.ownerType==='TEAM'||subject.memberId===scope().memberId);
    const sources=(node,subject)=>{
        const incoming=new Set(canvas.connections.filter(edge=>edge.to===node.id&&edge.kind==='input').map(edge=>edge.from));
        return nodes.filter(source=>incoming.has(source.id)&&source.hidden&&source.subjectReference?.groupId===subject.groupId&&source.subjectReference.ownerType===subject.ownerType);
    };
    function drop(node,subject){
        const selected=sources(node,subject),ids=new Set(selected.map(source=>source.id));
        canvas.connections=canvas.connections.filter(edge=>!(edge.to===node.id&&ids.has(edge.from)));
        const orphan=new Set(selected.filter(source=>!canvas.connections.some(edge=>edge.from===source.id||edge.to===source.id)).map(source=>source.id));
        nodes=nodes.filter(source=>!orphan.has(source.id));
        node.blockedInputRefs=(node.blockedInputRefs||[]).filter(key=>!ids.has(key.split('|')[0]));
    }
    function prune(node){
        if(!nodes.includes(node))return;
        const refs=parse(node.segmentReshoot.prompt),subjects=node.segmentReshoot.subjects||[];
        const removed=subjects.filter(subject=>!refs.some(ref=>ref.groupId===subject.groupId&&(!ref.ownerType||ref.ownerType===subject.ownerType)));
        removed.forEach(subject=>drop(node,subject));node.segmentReshoot.subjects=subjects.filter(subject=>!removed.includes(subject));
    }
    function ensureGraph(node,subject){
        const linked=sources(node,subject);
        if(linked.length!==subject.items.length||subject.items.some(item=>!linked.some(source=>source.subjectReference.itemId===item.id)))throw Error('主体输入连接已变化，请重新选择主体');
        const blocked=blockedInputRefKeys(node);
        for(const source of linked){
            const item=subject.items.find(item=>item.id===source.subjectReference.itemId);
            if(item.kind!=='text'&&(source.images?.length!==1||blocked.has(inputRefKey({...source.images[0],nodeId:source.id,imageIndex:0}))))throw Error('主体输入连接已变化，请重新选择主体');
        }
    }
    function apply(node,group,ownerType){
        if(!group.items.length||group.items.some(item=>item.available===false))throw Error('主体没有可用素材或包含失效素材，请先编辑主体');
        const subject={...clone(group),groupId:group.id,ownerType,...scope()},previous=(node.segmentReshoot.subjects||[]).find(item=>item.groupId===group.id&&item.ownerType===ownerType);
        remoteInvalid.get(node)?.delete(group.id);
        const linked=previous?sources(node,previous):[],byItem=new Map(linked.map(source=>[source.subjectReference.itemId,source]));
        const keep=new Set(group.items.map(item=>item.id));
        if(previous){
            for(const source of linked.filter(source=>!keep.has(source.subjectReference.itemId)||byItem.get(source.subjectReference.itemId)!==source)){
                canvas.connections=canvas.connections.filter(edge=>!(edge.from===source.id&&edge.to===node.id));
                if(!canvas.connections.some(edge=>edge.from===source.id||edge.to===source.id))nodes=nodes.filter(item=>item!==source);
            }
        }
        for(const item of group.items){
            let source=byItem.get(item.id);
            if(!source){source={id:uid('subject'),x:node.x-56,y:node.y,hidden:true,created_at:Date.now(),images:[]};nodes.push(source);canvas.connections.push({from:source.id,to:node.id,kind:'input'});}
            source.subjectReference={groupId:group.id,ownerType,itemId:item.id};source.label=item.name;source.hidden=true;
            if(item.kind==='text'){source.type='smart-prompt';source.text=item.text;source.images=[];}
            else{source.type='smart-image';delete source.text;source.images=[{...clone(item),kind:item.kind,asset_item_id:item.asset_item_id,asset_uris:assetRegisteredUris(item)}];}
        }
        const selectedIds=new Set(sources(node,subject).map(source=>source.id));
        node.blockedInputRefs=(node.blockedInputRefs||[]).filter(key=>!selectedIds.has(key.split('|')[0]));
        node.segmentReshoot.subjects=[...(node.segmentReshoot.subjects||[]).filter(item=>item.groupId!==group.id||item.ownerType!==ownerType),subject];
        return subject;
    }
    function select(node,group,ownerType,{insertPrompt=true}={}){
        if(!group.items.length||group.items.some(item=>item.available===false))throw Error('主体没有可用素材或包含失效素材，请先编辑主体');
        pushUndo();const previous=(node.segmentReshoot.subjects||[]).find(item=>item.groupId===group.id&&item.ownerType===ownerType);
        if(previous&&!belongs(previous))drop(node,previous);
        const subject=apply(node,group,ownerType);
        if(insertPrompt)PixmaxReshootReferences.setPrompt(node,node.segmentReshoot.prompt+token(subject));
        return {groupUuid:subject.groupId,ownerType,name:safeName(subject.name),coverUrl:subject.cover_url||''};
    }
    function remove(node,groupId){
        pushUndo();PixmaxReshootReferences.setPrompt(node,node.segmentReshoot.prompt.replace(pattern,(value,body)=>body.split('|')[0]===groupId?'':value));render();scheduleSave();
    }
    function compile(node,current){
        const subjects=node.segmentReshoot.subjects||[];
        const byMedia=new Map(current.resources.filter(entry=>entry.media).map(entry=>[entry.kind+':'+mediaId(entry.media),entry]));
        let value=String(node.segmentReshoot.prompt||'').replace(pattern,(raw,body)=>{
            const ref=parse(raw)[0],subject=subjects.find(item=>item.groupId===ref.groupId&&(!ref.ownerType||ref.ownerType===item.ownerType));
            if(!subject||!belongs(subject))throw Error('主体引用不属于当前成员或空间，请重新选择主体');
            if(remoteInvalid.get(node)?.has(ref.groupId))throw Error('主体已删除或失效，请重新选择主体');
            ensureGraph(node,subject);const linked=sources(node,subject),aliases=[];
            for(const item of subject.items){
                const source=linked.find(source=>source.subjectReference.itemId===item.id);
                const entry=current.byId.get(source.id)||byMedia.get(item.kind+':'+mediaId(item));
                if(!entry||item.available===false||entry.kind!==item.kind||(item.kind==='text'?source.text!==item.text:mediaId(source.images[0])!==mediaId(item)))throw Error('主体素材引用已变化，请重新选择主体');
                aliases.push(entry.alias);
            }
            if(!aliases.length)throw Error('主体没有可用素材，请先编辑主体');
            return subject.name+'（'+[...new Set(aliases)].join('、')+'）';
        });
        if(value.includes('%%subject-ref('))throw Error('主体标记不完整，请移除或重新选择主体');
        return value;
    }
    function invalid(node){
        const current=PixmaxReshootReferences.plan(node);
        return [...new Set(parse(node.segmentReshoot.prompt).filter(ref=>{
            if(remoteInvalid.get(node)?.has(ref.groupId))return true;
            try{compile({...node,segmentReshoot:{...node.segmentReshoot,prompt:ref.token}},current);return false;}catch{return true;}
        }).map(ref=>ref.groupId))];
    }
    async function request(path,init={}){
        const owner=scope(),context=CanvasSession.context;
        if(!owner.memberId||!owner.workspaceId)throw Error('请登录并选择当前空间');
        const response=await fetch(path,{...init,cache:'no-store',headers:{'Content-Type':'application/json','X-Workspace-ID':owner.workspaceId,'X-Member-ID':owner.memberId,...init.headers}});
        const data=await response.json();
        if(CanvasSession.context!==context||JSON.stringify(scope())!==JSON.stringify(owner))throw Error('成员或空间已变化');
        if(!response.ok){const error=Error(response.status===404?'主体不存在或已删除，请重新选择主体':typeof data.detail==='string'?data.detail:data.detail?.code==='subject_library_changed'?'主体目录已被其他窗口修改，请重新加载后再保存':'主体读取或保存失败，请检查权限后重试');error.status=response.status;throw error;}
        return data;
    }
    const details=(ownerType,groupId)=>request('/api/subject-library/'+ownerType+'/groups/'+encodeURIComponent(groupId));
    async function refresh(node,valid,{checkOnly=false}={}){
        const original=node.segmentReshoot.prompt,subjects=node.segmentReshoot.subjects||[],wanted=new Map();
        for(const ref of parse(original)){
            const subject=subjects.find(item=>item.groupId===ref.groupId&&(!ref.ownerType||item.ownerType===ref.ownerType));
            if(!subject||!belongs(subject))throw Error('主体引用不属于当前成员或空间，请重新选择主体');
            ensureGraph(node,subject);wanted.set(subject.ownerType+':'+subject.groupId,subject);
        }
        if(!wanted.size)return;
        const fetched=await Promise.all([...wanted.values()].map(async subject=>{
            try{return {subject,data:await details(subject.ownerType,subject.groupId)};}
            catch(error){if(error.status===404&&valid()&&node.segmentReshoot.prompt===original){const invalid=remoteInvalid.get(node)||new Set();invalid.add(subject.groupId);remoteInvalid.set(node,invalid);}throw error;}
        }));
        if(!valid()||node.segmentReshoot.prompt!==original)throw Error('提示词或编辑资格已变化');
        for(const {subject,data} of fetched){
            if(!data.group.items.length||data.group.items.some(item=>item.available===false)){const invalid=remoteInvalid.get(node)||new Set();invalid.add(subject.groupId);remoteInvalid.set(node,invalid);throw Error('主体没有可用素材或包含失效素材，请先编辑主体');}
            remoteInvalid.get(node)?.delete(subject.groupId);
        }
        const changed=fetched.filter(({subject,data})=>fingerprint(subject)!==fingerprint(data.group));
        if(checkOnly&&changed.length)throw Error('主体目录已变化，请再次生成；已准备的片段仍可复用');
        if(changed.length){
            pushUndo();for(const {subject,data} of changed)apply(node,data.group,subject.ownerType);
            PixmaxReshootReferences.setPrompt(node,original.replace(pattern,raw=>{
                const ref=parse(raw)[0],subject=node.segmentReshoot.subjects.find(item=>item.groupId===ref.groupId&&(!ref.ownerType||item.ownerType===ref.ownerType));return token(subject);
            }));render();scheduleSave();
        }
        compile(node,PixmaxReshootReferences.plan(node));
    }
    function adapter(node,valid){
        const loaded=new Map();
        return {async assetLibraryGroupList({groupUuid,ownerType}){
            if(!valid())return {success:false,data:[]};
            ownerType=ownerType||(node.segmentReshoot.subjects||[]).find(item=>item.groupId===groupUuid)?.ownerType;
            if(!ownerType)return {success:false,data:[]};
            try{const data=await details(ownerType,groupUuid);if(!valid())return {success:false,data:[]};loaded.set(groupUuid,data.group);
                const group=data.group;return {success:true,data:[{groupUuid,ownerType,name:group.name,description:group.description,assetCount:group.items.length,createTime:new Date(group.created_at).toISOString(),coverPreviewWebUrl:group.cover_url?displayMediaUrl({url:group.cover_url}):''}]};
            }catch{return {success:false,data:[]};}
        },async assetLibraryGroupAssetsList({groupUuid,pageIndex=1,pageSize=100}){
            const group=loaded.get(groupUuid);if(!valid()||!group)return {success:false,data:[]};
            return {success:true,data:group.items.slice((pageIndex-1)*pageSize,pageIndex*pageSize).map(item=>({groupItemId:item.id,itemType:item.kind==='text'?'TEXT':'ASSET',textContent:item.text,name:item.name,assetsUuid:item.media_asset_id,fileType:{image:'IMG',audio:'AUDIO',video:'VIDEO'}[item.kind],webUrl:item.url?displayMediaUrl(item):'',createTime:new Date(item.created_at).toISOString()}))};
        }};
    }
    window.PixmaxSubjects=Object.freeze({parse,token,fingerprint,compile,invalid,select,remove,prune,refresh,request,details,adapter,signature:node=>(node.segmentReshoot.subjects||[]).map(subject=>[subject.groupId,subject.ownerType,subject.memberId,subject.workspaceId,fingerprint(subject)])});
})();
