/* Local native media processing, guarded by the current canvas edit owner. */
(() => {
    'use strict';
    const jobs=new Map();let runtimePromise,pageExitAllowed=false;
    const scope=()=>window.CanvasSession?.enabled?window.CanvasSession.context?.member?.id+':'+window.CanvasSession.context?.workspace?.id:'local';
    const mediaKey=item=>JSON.stringify([item?.url,item?.kind||'video',item?.media_asset_id||'']);
    const pending=job=>!job.saved&&!job.discarded&&(job.running||job.files.length>0);
    const hasUnfinishedWork=()=>[...jobs.values()].some(pending);
    function guard(job){
        const node=nodes.find(item=>item.id===job.nodeId),origin=canvas;
        const index=node?.images?.findIndex(item=>mediaKey(item)===job.sourceKey)??-1;
        if(scope()!==job.scope||canvas?.id!==job.canvasId||!node||index<0||isSmartCanvasLocked())throw new Error('来源或编辑资格已变化，请返回原画布后重试保存');
        const base=canvasTaskWriteGuard(node);
        return {node,index,valid:()=>!job.discarded&&scope()===job.scope&&canvas===origin&&nodes.includes(node)&&!isSmartCanvasLocked()&&base.valid()&&mediaKey(node.images?.[index])===job.sourceKey,
            check(){if(!this.valid())throw new Error('来源、画布或编辑资格已变化，结果没有写入画布');}};
    }
    function progress(job,value,message){
        if(!job.root.isConnected)return;
        job.root.querySelector('progress').value=Math.max(0,Math.min(1,value));
        job.root.querySelector('[role=status]').textContent=message||`音频分离 ${Math.round(value*100)}%`;
    }
    function drawFiles(job){
        const list=job.root.querySelector('[data-separated-files]');list.replaceChildren();
        if(scope()!==job.scope)return;
        for(const file of job.files){
            const button=document.createElement('button');button.type='button';button.textContent='下载 '+file.name;
            button.onclick=()=>{if(scope()===job.scope)downloadBlob(file,file.name);};list.appendChild(button);
        }
    }
    function confirmSaved(document){
        if(!document||!Array.isArray(document.nodes))return;
        for(const job of jobs.values()){
            if(job.discarded||!job.inserted||job.scope!==scope()||job.canvasId!==document.id)continue;
            if(!job.resultMedia.every(result=>document.nodes.some(node=>node.id===result.id&&node.images?.some(item=>item.url===result.url))))continue;
            job.saved=true;job.files.length=0;jobs.delete(job.key);
            job.root.querySelector('[data-separated-files]').replaceChildren();job.root.querySelector('[data-media-retry]').hidden=true;
            progress(job,1,`已保存 ${job.outputCount} 个分离文件到画布`);
        }
    }
    async function save(job){
        const write=guard(job);write.check();
        progress(job,.98,'正在保存静音视频和音轨…');
        const uploaded=await uploadFiles(job.files);write.check();
        if(uploaded.length!==job.files.length||uploaded.some(item=>!item?.url))throw new Error('上传结果不完整，本地文件已保留，请重试保存');
        pushUndo();const ids=[];let y=write.node.y;
        const x=write.node.x+nodeRect(write.node).width+100;
        uploaded.forEach((item,index)=>{
            const node=createNode(x,y,[{...item,kind:job.files[index].type.startsWith('audio/')?'audio':'video',sourceMediaUrl:job.sourceUrl,processingTool:'audio-separate'}],{skipUndo:true,select:false});
            node.label=job.files[index].name.replace(/\.[^.]+$/,'');ids.push(node.id);y+=nodeRect(node).height+80;
        });
        job.inserted=true;job.resultNodeIds=ids;job.outputCount=job.files.length;
        job.resultMedia=ids.map((id,index)=>({id,url:uploaded[index].url}));
        smartSelection.insertedNodes(ids);render();scheduleSave();
        // Retain local files until the document itself is confirmed saved.
        if(!await saveCanvas({force:true})||!job.saved)throw new Error('结果已加入当前画布，但尚未保存，请重试保存');
    }
    async function run(job){
        if(job.running||job.saved||job.discarded)return;
        job.running=true;job.root.querySelector('[data-media-retry]').hidden=true;
        try{
            const write=guard(job);write.check();
            if(!job.files.length){
                progress(job,0,'正在读取原始视频…');
                const response=await fetch(displayMediaUrl(write.node.images[write.index]));
                if(!response.ok)throw new Error('视频资源读取失败');
                const source=await response.blob();write.check();
                const runtime=await (runtimePromise ||= import('/static/vendor/pixmax/editors.js').catch(error=>{runtimePromise=null;throw error;}));write.check();
                const result=await runtime.separateCanvasAudio({source,onProgress:value=>{write.check();progress(job,value*.97);}});
                if(!result.ok)throw new Error(result.err||'音频分离失败');
                const stem=(job.sourceName||'视频').replace(/\.[^.]+$/,'');
                if(result.video)job.files.push(new File([result.video],stem+'-无声.mp4',{type:result.videoMimeType||'video/mp4'}));
                result.audios.forEach((audio,index)=>job.files.push(new File([audio.output],stem+'-音轨-'+(index+1)+'.mp3',{type:audio.mimeType||'audio/mpeg'})));
                if(!job.files.length)throw new Error('视频没有可分离的音轨或画面');
                write.check();
            }
            if(job.inserted){
                if(!job.resultNodeIds.every(id=>nodes.some(node=>node.id===id)))throw new Error('结果节点已移除，请下载本地文件或重新分离');
                if(!await saveCanvas({force:true})||!job.saved)throw new Error('当前画布尚未保存，请重试');
            }else await save(job);
        }catch(error){
            if(!job.discarded){progress(job,0,error.message||'音频分离失败');drawFiles(job);job.root.querySelector('[data-media-retry]').hidden=false;}
        }finally{job.running=false;if(job.discarded)jobs.delete(job.key);}
    }
    function openAudioSeparate(nodeId,index){
        const node=nodes.find(item=>item.id===nodeId),item=node?.images?.[index];
        if(!item||mediaKindForItem(item)!=='video'||isSmartCanvasLocked())return;
        const key=scope()+':'+canvas.id+':'+nodeId+':'+mediaKey(item),existing=jobs.get(key);
        if(existing&&!existing.saved&&!existing.discarded){existing.root.hidden=false;return;}
        const root=document.createElement('section');root.className='pixmax-media-progress';root.setAttribute('aria-label','音频分离');
        root.innerHTML='<header><strong>音频分离</strong><button type="button" aria-label="关闭音频分离">×</button></header><progress max="1" value="0" aria-label="音频分离进度"></progress><p role="status"></p><div data-separated-files></div><button type="button" data-media-retry hidden>重试保存</button>';
        document.body.appendChild(root);
        const job={key,root,nodeId,canvasId:canvas.id,scope:scope(),sourceKey:mediaKey(item),sourceUrl:item.url,sourceName:item.name||node.label||'视频',files:[],running:false,saved:false,inserted:false,discarded:false};
        jobs.set(key,job);
        root.querySelector('header button').onclick=()=>{job.discarded=true;root.remove();if(!job.running)jobs.delete(key);};
        root.querySelector('[data-media-retry]').onclick=()=>run(job);
        root.addEventListener('keydown',event=>event.stopPropagation());
        void run(job);
    }
    window.addEventListener('beforeunload',event=>{if(!pageExitAllowed&&hasUnfinishedWork()){event.preventDefault();event.returnValue='';}});
    window.addEventListener('pagehide',event=>{if(!event.persisted)for(const job of jobs.values()){job.discarded=true;job.root.remove();}});
    window.PixmaxMediaTools=Object.freeze({openAudioSeparate,hasUnfinishedWork,confirmSaved,allowPageExit(){
        pageExitAllowed=true;for(const job of jobs.values())if(pending(job)){job.discarded=true;job.root.remove();if(!job.running)jobs.delete(job.key);}
    }});
})();
