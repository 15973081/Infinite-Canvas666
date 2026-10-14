/* Convert recorded Pixmax canvas documents without importing account/task state. */
(function(){
    'use strict';
    const types={BASE_TEXT:'smart-prompt',GENERATE_TEXT:'smart-prompt',BASE_IMAGE:'smart-image',GENERATE_IMAGE:'smart-image',BASE_VIDEO:'smart-image',GENERATE_VIDEO:'smart-image',BASE_AUDIO:'smart-image',GENERATE_AUDIO:'smart-audio',BASE_3D:'smart-model',GENERATE_3D:'smart-model',STAGE_EDITOR:'smart-director',VIDEO_EDITOR:'smart-editor',STORYBOARD_SCRIPT:'smart-storyboard'};
    const number=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
    const ratios={'1:1':'square','3:2':'landscape','2:3':'portrait','4:3':'landscape43','3:4':'portrait43','16:9':'wide','9:16':'story','21:9':'ultrawide','9:21':'ultratall'};
    const metadata=value=>{if(value&&typeof value==='object')return value;try{return JSON.parse(value||'{}');}catch{return {};}};
    // Native /static media paths belong to Pixmax's storage origin, not the
    // receiving application's static directory. Absolute URLs retain their host.
    function assetUrl(value,domain){
        if(typeof value!=='string'||!(/^(https?:\/\/|\/[^/])/.test(value)))return '';
        if(!value.startsWith('/static/'))return value;
        let origin='https://pixmax-prod.oss-accelerate.aliyuncs.com';
        try{const candidate=new URL(domain);if(['https:','http:'].includes(candidate.protocol)&&!candidate.username&&!candidate.password)origin=candidate.origin;}catch(_){}
        return origin+value;
    }
    function unwrap(value){return value?.data?.nodes?value.data:value?.canvas?.nodes?value.canvas:value?.workflow?.nodes?value.workflow:value;}
    function isNative(value){const document=unwrap(value);return Array.isArray(document?.nodes)&&document.nodes.some(node=>node?.uuid&&types[node.type]);}
    function media(asset){
        if(!asset||typeof asset!=='object')return null;
        const url=assetUrl(asset.webUrl,asset.ossDomain)||assetUrl(asset.previewWebUrl,asset.ossDomain);
        if(!url)return null;
        const info=metadata(asset.metaData),kind=String(asset.type||asset.fileType||'').toLowerCase();
        const thumbnail=assetUrl(asset.thumbnailWebUrl,asset.ossDomain),videoThumbnail=assetUrl(asset.thumbnailVideoWebUrl,asset.ossDomain);
        const videoPreview=/\.(mp4|webm|mov|m4v)(?:[?#]|$)/i.test(videoThumbnail)?videoThumbnail:'';
        const poster=kind.includes('video')?(thumbnail||(!videoPreview?videoThumbnail:'')||assetUrl(asset.previewWebUrl,asset.ossDomain)):videoThumbnail;
        return {url,kind:kind.includes('video')?'video':kind.includes('audio')?'audio':kind.includes('3d')||kind.includes('model')?'model':'image',
            name:info.name||info.fileName||'',natural_w:number(asset.width),natural_h:number(asset.height),
            ...(thumbnail?{thumbnailUrl:thumbnail}:{}),...(poster?{poster}:{}),...(videoPreview?{previewVideoUrl:videoPreview}:{}),
            ...(asset.panorama?{panorama:true}:{})};
    }
    function storyboard(source,info,warnings){
        let document;
        if(source.nodeText){try{document=typeof source.nodeText==='string'?JSON.parse(source.nodeText.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')):source.nodeText;}catch{warnings.push('分镜源数据不是有效 JSON：'+source.uuid);}}
        if(!Array.isArray(document?.shotNoList))return {shots:Array.isArray(info.data?.shots)?info.data.shots:[]};
        const client=info.data?.shotScriptClientState||{},visualAssets=[],audioAssets=[];
        for(const [key,type] of [['characterAssets','character'],['sceneAssets','scene'],['propsAssets','prop']]){
            for(const asset of Array.isArray(document.assets?.[key])?document.assets[key]:[]){
                const id=String(asset.assetId||'');if(!id)continue;
                const binding=client.assetClientById?.[id];visualAssets.push({id,type,name:String(asset.assetRef||id),description:String(asset.assetDescription||''),prompt:String(asset.assetPrompt||''),...(asset.audioAssetId?{audioAssetId:String(asset.audioAssetId)}:{}),...(binding?.imageNodeId?{imageNodeId:String(binding.imageNodeId)}:{})});
            }
        }
        for(const asset of Array.isArray(document.assets?.audioAssets)?document.assets.audioAssets:[]){
            const id=String(asset.audioAssetId||asset.assetId||'');if(!id)continue;const binding=client.audioClientById?.[id];audioAssets.push({id,name:String(asset.audioRef||id),description:String(asset.audioDescription||''),prompt:String(asset.audioPrompt||''),...(binding?.nodeId?{nodeId:String(binding.nodeId)}:{})});
        }
        const known=new Set(visualAssets.map(asset=>asset.id)),shots=[];
        function visit(list){for(const shot of list){if(!shot||typeof shot!=='object')continue;if(Array.isArray(shot.children)&&shot.children.length){visit(shot.children);continue;}
            const shotNo=String(shot.shotNo||shots.length+1),saved=client.shotClientByNo?.[shotNo]||{},assetIds=[...new Set([...String(shot.visualDescription||'').matchAll(/<[^<>\n@]+@([^<>\n@]+)(?:@[^<>\n@]+)?>/g),...String(shot.dialogueVoiceOver||'').matchAll(/<[^<>\n@]+@([^<>\n@]+)(?:@[^<>\n@]+)?>/g)].map(match=>match[1].trim()).filter(id=>known.has(id)))];
            shots.push({shotNo,duration:number(shot.duration,5)||5,description:String(shot.visualDescription||''),size:String(shot.shotSize||''),cameraAngle:String(shot.cameraAngle||''),lighting:String(shot.lightingMood||''),dialogue:String(shot.dialogueVoiceOver||''),sound:String(shot.soundEffects||''),movement:String(shot.cameraMovement||''),assetIds,prompt:String(saved.shotPrompt||''),videoPrompt:String(saved.videoPrompt||''),promptStatus:['queue','generating'].includes(saved.promptStatus)?'interrupted':String(saved.promptStatus||'idle'),...(saved.promptTaskError?{promptError:String(saved.promptTaskError)}:{})});
        }}visit(document.shotNoList);
        return {shots,storyboardAssets:visualAssets,storyboardAudioAssets:audioAssets,pixmaxStoryboardSource:JSON.parse(JSON.stringify(document))};
    }
    function convert(value){
        const document=unwrap(value);
        if(!isNative(document))throw new Error('文件不是 Pixmax 画布文档');
        const nodes=[],warnings=[],ids=new Set();
        for(const source of document.nodes){
            if(!types[source?.type]){warnings.push('未导入节点类型：'+String(source?.type||'未知'));continue;}
            if(typeof source.uuid!=='string'||ids.has(source.uuid))throw new Error('Pixmax 画布节点标识无效或重复');
            ids.add(source.uuid);
            const info=metadata(source.metaData),params=source.params||{},kind=source.type.includes('VIDEO')?'video':source.type.includes('AUDIO')?'audio':source.type.includes('3D')?'model':'image';
            const assets=[source.defaultAsset,...(Array.isArray(source.nodeAssets)?source.nodeAssets:[])].map(media).filter(Boolean);
            const images=[...new Map(assets.map(asset=>[asset.url,asset])).values()];
            if(['audio','video','model'].includes(kind))images.forEach(asset=>asset.kind=kind);
            const node={id:source.uuid,type:types[source.type],x:number(info.position?.x),y:number(info.position?.y),images,
                tags:Array.isArray(info.data?.tags)?[...new Set(info.data.tags.filter(id=>typeof id==='string'))]:[],
                label:String(info.data?.label||''),created_at:number(source.createTime,Date.now()),pixmaxSourceType:source.type,
                ...(info.width?{w:number(info.width)}:{}),...(info.height?{h:number(info.height)}:{})};
            if(typeof info.parentId==='string'&&info.parentId)node.frameId=info.parentId;
            if(node.type==='smart-prompt'){
                node.text=String(source.nodeText||params.prompt||'');
                node.textGeneration={input:String(params.prompt||''),model:String(params.model||''),providerId:''};
            }
            if(source.type==='GENERATE_IMAGE'||source.type==='GENERATE_VIDEO'){
                node.generationKind=kind;node.promptDraftText=String(params.prompt||'');
                node.promptDraftHtml=node.promptDraftText.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
                const ratio=String(params.aspectRatio||'1:1');
                node.runSettings={engine:'api',apiKind:kind,...(kind==='video'?{videoModel:String(params.model||''),videoDuration:number(params.duration,5),videoAspect:ratio,videoResolution:String(params.resolution||'')}:{model:String(params.model||'')}),
                    resolution:String(params.resolution||'1k').toLowerCase(),ratio:ratios[ratio]||'custom',
                    ...(!ratios[ratio]?{customRatio:ratio,customRatioWidth:ratio.split(':')[0]||'',customRatioHeight:ratio.split(':')[1]||''}:{})};
            }
            if(node.type==='smart-storyboard')Object.assign(node,storyboard(source,info,warnings));
            if(source.type==='GENERATE_AUDIO'){
                const audioModels={MINIMAX_SPEECH_28_HD:'speech-2.8-hd',MINIMAX_SPEECH_28_TURBO:'speech-2.8-turbo',MINIMAX_MUSIC_26:'music-2.6'};
                const model=audioModels[params.model]||String(params.model||'');
                node.audioGeneration={provider_id:'',model,mode:model.startsWith('music-')?'music':'speech',prompt:String(params.prompt||''),
                    timbre_id:String(params.timbreId||'male-qn-qingse'),speed:number(params.speed,1),vol:number(params.vol,1),pitch:number(params.pitch),
                    voice_modify_pitch:number(params.voiceModifyPitch),voice_modify_intensity:number(params.voiceModifyIntensity),voice_modify_timbre:number(params.voiceModifyTimbre),
                    voice_modify_sound_effects:String(params.voiceModifySoundEffects||''),music_mode:String(params.musicMode||'CUSTOM'),lyrics:String(params.lyrics||'')};
            }
            if(source.type==='GENERATE_3D'){
                node.modelGeneration={provider_id:'',model:params.model==='HUNYUAN_3D_PRO_31'?'3.1':'3.0',mode:{textTo3D:'text',imageTo3D:'image',multiTo3D:'multi'}[params.referModel]||'text',prompt:String(params.prompt||''),
                    generate_type:String(params.generateType||'Normal'),enable_pbr:params.enablePBR===true||params.enablePBR==='true',face_count:number(params.faceCount,300000),polygon_type:String(params.polygonType||'triangle')};
            }
            // Preserve native parameters for later capability mapping, never resume foreign tasks.
            node.pixmaxParams=JSON.parse(JSON.stringify(params));
            nodes.push(node);
        }
        const frames=new Map();
        for(const source of document.nodes){const node=nodes.find(node=>node.id===source.uuid);if(!node?.frameId)continue;if(ids.has(node.frameId)){warnings.push('分组标识与节点冲突：'+node.frameId);delete node.frameId;continue;}const info=metadata(source.metaData);if(!frames.has(node.frameId))frames.set(node.frameId,{id:node.frameId,type:'smart-frame',label:String(info.groupTitle||'分组'),images:[],tags:[],x:node.x-20,y:node.y-44,w:240,h:160});}
        nodes.push(...frames.values());
        const connections=[],seen=new Set();
        for(const source of document.nodes){
            if(!ids.has(source.uuid))continue;
            for(const from of Array.isArray(source.prevNodeUuids)?source.prevNodeUuids:[]){
                const key=JSON.stringify([from,source.uuid]);
                if(!ids.has(from)||from===source.uuid||seen.has(key))continue;
                seen.add(key);connections.push({from,to:source.uuid,kind:'input'});
            }
        }
        nodes.forEach(node=>node.inputNodeIds=connections.filter(edge=>edge.to===node.id).map(edge=>edge.from));
        const byId=new Map(nodes.map(node=>[node.id,node]));
        nodes.forEach(node=>{
            for(const asset of node.storyboardAssets||[]){const image=byId.get(asset.imageNodeId);if(!image||image.generationKind==='video'||image.type!=='smart-image')delete asset.imageNodeId;}
            for(const asset of node.storyboardAudioAssets||[]){const audio=byId.get(asset.nodeId);if(!audio||!audio.images.some(item=>item.kind==='audio'))delete asset.nodeId;}
        });
        const tagState=metadata(document.metaData).nodeTags;
        let nodeTags;
        if(tagState){
            if(tagState.schemaVersion!==1||!Array.isArray(tagState.value?.tags))throw new Error('不支持此 Pixmax 标签元数据版本');
            nodeTags=tagState.value.tags;
        }else if(nodes.some(node=>node.tags.length))nodeTags=[['yellow','#FBBC05'],['blue','#4285F4'],['purple','#8825F9'],['green','#35AF4B'],['pink','#EA35BA'],['white','#FFFFFF']].map(([id,color])=>({id,color}));
        if(nodeTags){const used=new Set(nodes.flatMap(node=>node.tags));nodeTags=nodeTags.filter(tag=>used.has(tag.id));}
        return {format:'infinite-canvas-workflow',version:1,nodes,connections,warnings,...(nodeTags?{node_tags:nodeTags}:{})};
    }
    window.PixmaxWorkflow={isNative,convert};
})();
