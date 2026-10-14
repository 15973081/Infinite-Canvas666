/* Generated media history mirrors the native date groups and 100-asset selection. */
(() => {
    'use strict';
    const mime='application/x-pixmax-history-asset',labels={all:'全部',image:'图片',video:'视频',audio:'音频',model:'3D模型',file:'文件'};
    const displayUrl=url=>displayMediaUrl(url);
    let active=null;
    const day=item=>{const date=new Date(item.created_at);return Number.isNaN(date.getTime())?'':date.toISOString().slice(0,10);};
    const scope=()=>JSON.stringify([CanvasSession.context?.member?.id,CanvasSession.context?.workspace?.id]);
    function release(root){root?.querySelectorAll('video,audio').forEach(player=>{player.pause();player.removeAttribute('src');player.load();});root?.remove();}
    function close(){const state=active;if(!state)return;active=null;state.abort.abort();state.observer?.disconnect();state.root.remove();release(state.detail);window.removeEventListener('pagehide',close);window.removeEventListener('resize',state.position);document.removeEventListener('pointerdown',state.outside,true);document.removeEventListener('keydown',state.escape,true);document.removeEventListener('drop',state.drop,true);}
    function alive(state){return active===state&&state.root.isConnected&&window.CanvasSession?.enabled&&canvas===state.origin&&(!state.node||nodes.includes(state.node))&&scope()===state.scope&&!CanvasSession.paused;}
    function status(state,text){if(alive(state))state.root.querySelector('[role=status]').textContent=text;}
    function bindImageView(state,root){
        const pane=root.querySelector('.history-detail-preview'),image=pane?.querySelector('img');if(!image)return;
        pane.classList.add('history-image-view');image.draggable=false;let scale=1,x=0,y=0,drag=null;
        const controls=document.createElement('div');controls.className='history-image-controls';controls.setAttribute('role','group');controls.setAttribute('aria-label','图片视图');controls.innerHTML='<button type="button" data-history-image-out aria-label="缩小图片">−</button><span data-history-image-scale>100%</span><button type="button" data-history-image-in aria-label="放大图片">＋</button><button type="button" data-history-image-reset>复位</button>';pane.appendChild(controls);
        function paint(){image.style.transform=`translate(${x}px,${y}px) scale(${scale})`;pane.dataset.imageScale=String(scale);pane.dataset.imageX=String(x);pane.dataset.imageY=String(y);controls.querySelector('[data-history-image-scale]').textContent=Math.round(scale*100)+'%';controls.querySelector('[data-history-image-out]').disabled=scale<=.5;controls.querySelector('[data-history-image-in]').disabled=scale>=5;}
        function zoom(next,px=0,py=0){if(!alive(state)||!root.isConnected)return;const ratio=Math.min(5,Math.max(.5,next))/scale;x=px-(px-x)*ratio;y=py-(py-y)*ratio;scale=Math.min(5,Math.max(.5,next));paint();}
        function reset(){if(!alive(state)||!root.isConnected)return;scale=1;x=y=0;paint();}
        controls.onpointerdown=event=>event.stopPropagation();controls.ondblclick=event=>event.stopPropagation();controls.querySelector('[data-history-image-out]').onclick=()=>zoom(scale-.15);controls.querySelector('[data-history-image-in]').onclick=()=>zoom(scale+.15);controls.querySelector('[data-history-image-reset]').onclick=reset;
        pane.addEventListener('wheel',event=>{event.preventDefault();event.stopPropagation();const box=pane.getBoundingClientRect();zoom(scale+(event.deltaY>0?-.15:.15),event.clientX-box.left-box.width/2,event.clientY-box.top-box.height/2);},{passive:false});
        pane.onpointerdown=event=>{if(event.button!==0||!alive(state)||!root.isConnected)return;event.preventDefault();pane.setPointerCapture(event.pointerId);drag={clientX:event.clientX,clientY:event.clientY,x,y};pane.classList.add('image-panning');};
        pane.onpointermove=event=>{if(drag&&alive(state)&&root.isConnected){x=drag.x+event.clientX-drag.clientX;y=drag.y+event.clientY-drag.clientY;paint();}};
        pane.onpointerup=pane.onpointercancel=pane.onlostpointercapture=()=>{drag=null;pane.classList.remove('image-panning');};pane.ondblclick=reset;paint();
    }
    function access(state){const editable=alive(state)&&!isSmartCanvasLocked();state.root.querySelectorAll('[data-history-insert],[data-history-batch-insert]').forEach(button=>button.disabled=!editable||button.hasAttribute('data-history-batch-insert')&&![...state.selected.values()].some(item=>item.kind!=='file'));state.root.querySelectorAll('[data-history-asset]').forEach(card=>card.draggable=editable&&state.cache.get(card.dataset.historyAsset)?.kind!=='file');}
    function selection(state){
        state.root.classList.toggle('history-selecting',state.selecting);
        state.root.querySelector('[data-history-count]').textContent=`已选择 ${state.selected.size} 个资源`;
        state.root.querySelector('[data-history-batch-download]').disabled=!state.selected.size||state.downloading;
        for(const card of state.root.querySelectorAll('[data-history-asset]')){const checked=state.selected.has(card.dataset.historyAsset);card.classList.toggle('history-selected',checked);card.setAttribute('aria-selected',String(checked));}
        for(const button of state.root.querySelectorAll('[data-history-group]')){const ids=state.items.filter(item=>day(item)===button.dataset.historyGroup).map(item=>item.id),count=ids.filter(id=>state.selected.has(id)).length;button.setAttribute('aria-pressed',count===ids.length?'true':count?'mixed':'false');}
        access(state);
    }
    function toggle(state,items){
        if(!alive(state))return;const all=items.every(item=>state.selected.has(item.id));
        if(all)items.forEach(item=>state.selected.delete(item.id));else for(const item of items){if(state.selected.has(item.id))continue;if(state.selected.size>=100){status(state,'最多选择 100 个资源');break;}state.selected.set(item.id,item);}
        selection(state);
    }
    function insert(state,items,point=viewportCenter()){
        if(!alive(state)||isSmartCanvasLocked())return status(state,'请先开始编辑画布');
        const media=items.filter(item=>item.kind!=='file');if(!media.length)return;
        if(!canvasTaskWriteGuard().valid())return;pushUndo();const ids=[];
        media.forEach((item,index)=>{
            const image={url:item.url,name:item.name,kind:item.kind,media_asset_id:item.id,...(item.natural_w?{natural_w:item.natural_w}:{}),...(item.natural_h?{natural_h:item.natural_h}:{}),...(item.duration?{duration:item.duration}:{})};
            const node=createNode(point.x+index*119,point.y+index*20,[image],{skipUndo:true,select:false,deferRender:true});
            delete node.generationKind;delete node.runSettings;node.outputKind=item.kind;node.historyTaskId=item.task_id;
            node.pixmaxSourceType={image:'BASE_IMAGE',video:'BASE_VIDEO',audio:'BASE_AUDIO',model:'BASE_3D'}[item.kind];
            if(item.kind==='model'){node.type='smart-model';node.scale=1;}
            ids.push(node.id);
        });
        smartSelection.insertedNodes(ids);render();scheduleSave();status(state,`已插入 ${ids.length} 个素材`);
    }
    async function download(state,items,zip=false){
        if(!alive(state)||!items.length||state.downloading)return;state.downloading=true;selection(state);status(state,'正在准备下载…');
        try{
            const response=zip?await CanvasApi.downloadCanvasAssets({items:items.map(item=>({url:item.url,name:item.name,kind:item.kind})),filename:'pixmax-assets.zip'}):await MemberCanvasEdit.send(displayUrl(items[0].url),{cache:'no-store'});
            if(!response.ok)throw Error(await responseErrorMessage(response,'素材下载失败'));const blob=await response.blob();if(!alive(state))return;
            downloadBlob(blob,zip?'pixmax-assets.zip':items[0].name);status(state,'下载已开始');
        }catch(error){status(state,error.message||'素材下载失败');}finally{state.downloading=false;if(alive(state))selection(state);}
    }
    async function view(state,item){
        if(!alive(state))return;const version=++state.viewVersion;release(state.detail);
        if(state.node){state.lastViewed=item.id;for(const card of state.root.querySelectorAll('[data-history-asset]')){card.querySelector('[data-history-last-viewed]')?.remove();if(card.dataset.historyAsset===item.id){const label=document.createElement('span');label.dataset.historyLastViewed='';label.className='history-last-viewed';label.textContent='上次查看';card.appendChild(label);}}}
        const root=pixmaxCreationModal('生成素材预览');root.classList.add('pixmax-history-detail');root.tabIndex=-1;root.focus({preventScroll:true});state.detail=root;const body=root.querySelector('.pixmax-creation-content');root.querySelector('[role=status]').textContent='正在读取素材…';
        try{
            const params=new URLSearchParams({...state.current?{canvas_id:state.origin.id}:{},...state.node?{node_id:state.node.id}:{}}),response=await MemberCanvasEdit.send('/api/canvas-generation-history/'+encodeURIComponent(item.id)+'?'+params);
            if(!response.ok)throw Error(await responseErrorMessage(response,'素材详情读取失败'));const data=await response.json();if(!alive(state)||version!==state.viewVersion||!root.isConnected)return;
            const asset=data.item,url=escapeAttr(displayUrl(asset.url));
            body.innerHTML=`<div class="history-detail-preview">${asset.kind==='image'?`<img src="${url}" alt="${escapeAttr(asset.name)}">`:asset.kind==='video'?`<video src="${url}" controls playsinline preload="metadata"></video>`:asset.kind==='audio'?`<audio src="${url}" controls preload="metadata"></audio>`:asset.kind==='model'?'<button type="button" data-history-model>预览 3D 模型</button>':'<span>文件</span>'}</div><p>${escapeHtml(asset.name)}</p><dl>${Object.entries(data.parameters||{}).map(([key,value])=>`<dt>${escapeHtml(({prompt:'提示词',model:'模型',size:'尺寸',quality:'质量',duration:'时长',resolution:'分辨率',aspect_ratio:'比例',mode:'模式',generate_type:'生成类型',music_mode:'音乐模式'})[key]||key)}</dt><dd>${escapeHtml(String(value))}</dd>`).join('')}</dl><div class="history-detail-actions"><button type="button" data-history-prev>上一项</button><button type="button" data-history-next>下一项</button><button type="button" data-history-detail-download>下载</button>${asset.kind!=='file'?'<button type="button" data-history-detail-insert>插入画布</button>':''}</div>`;
            const position=state.items.findIndex(value=>value.id===item.id),previous=body.querySelector('[data-history-prev]'),next=body.querySelector('[data-history-next]');previous.disabled=position<=0;next.disabled=position<0||position>=state.items.length-1;
            previous.hidden=next.hidden=!state.node||state.items.length<2;previous.onclick=()=>view(state,state.items[position-1]);next.onclick=()=>view(state,state.items[position+1]);
            root.addEventListener('keydown',event=>{if(event.target.closest('input,textarea')||!state.node)return;if(event.key==='ArrowLeft'&&!previous.disabled){event.preventDefault();previous.click();}else if(event.key==='ArrowRight'&&!next.disabled){event.preventDefault();next.click();}});
            bindImageView(state,root);
            body.querySelector('[data-history-detail-download]').onclick=()=>download(state,[asset]);
            const add=body.querySelector('[data-history-detail-insert]');if(add){add.disabled=isSmartCanvasLocked();add.onclick=()=>insert(state,[asset]);}
            body.querySelector('[data-history-model]')?.addEventListener('click',()=>PixmaxModelPreview.openAsset({url:asset.url,name:asset.name,kind:'model'},()=>alive(state)&&root.isConnected));
            root.querySelector('[role=status]').textContent='';
        }catch(error){if(alive(state)&&root.isConnected)root.querySelector('[role=status]').textContent=error.message;}
        const observer=new MutationObserver(()=>{if(!root.isConnected){root.querySelectorAll('video,audio').forEach(player=>{player.pause();player.removeAttribute('src');player.load();});observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});
    }
    function paint(state){
        const groups=new Map();for(const item of state.items){const date=state.node?'':day(item);if(!groups.has(date))groups.set(date,[]);groups.get(date).push(item);}
        state.root.querySelector('[data-history-grid]').innerHTML=[...groups].map(([date,items])=>`<section class="history-day"><header><span>${escapeHtml(date)}</span><button type="button" data-history-group="${date}">选择分组</button></header><div class="history-assets">${items.map(item=>`<div class="history-asset" data-history-asset="${escapeAttr(item.id)}" tabindex="0" role="option" aria-label="${escapeAttr(item.name)}"><div class="history-asset-preview">${['image','video'].includes(item.kind)?`<img src="${escapeAttr(window.MemberMediaUrl?MemberMediaUrl('/api/media-preview?w=128&url='+encodeURIComponent(item.url)):CanvasSession.url('/api/media-preview?w=128&url='+encodeURIComponent(item.url)))}" alt="${escapeAttr(item.name)}" loading="lazy" decoding="async">`:`<span>${labels[item.kind]}</span>`}</div><span class="history-asset-label">${labels[item.kind]}</span><span class="history-asset-check">✓</span><div class="history-asset-actions"><button type="button" data-history-view aria-label="预览 ${escapeAttr(item.name)}">预览</button>${item.kind!=='file'?'<button type="button" data-history-insert>插入</button>':''}<button type="button" data-history-download>下载</button></div></div>`).join('')}</div></section>`).join('')||'<p class="history-empty">暂无生成记录</p>';
        for(const card of state.root.querySelectorAll('[data-history-asset]')){
            const item=state.cache.get(card.dataset.historyAsset);
            if(state.node&&state.lastViewed===item.id){const label=document.createElement('span');label.dataset.historyLastViewed='';label.className='history-last-viewed';label.textContent='上次查看';card.appendChild(label);}
            const image=card.querySelector('img');if(image){let fallback=false;image.onerror=()=>{if(item.kind==='image'&&!fallback){fallback=true;image.src=displayUrl(item.url);}else image.parentElement.textContent=labels[item.kind];};}
            card.onclick=event=>{if(event.target.closest('button'))return;if(state.selecting)toggle(state,[item]);};
            card.onkeydown=event=>{if(['Enter',' '].includes(event.key)&&!event.target.closest('button')){event.preventDefault();if(state.selecting)toggle(state,[item]);}};
            card.querySelector('[data-history-view]').onclick=()=>view(state,item);card.querySelector('[data-history-insert]')?.addEventListener('click',()=>{insert(state,[item]);if(state.node)close();});card.querySelector('[data-history-download]').onclick=()=>download(state,[item]);
            card.ondragstart=event=>{if(!alive(state)||isSmartCanvasLocked()||item.kind==='file'){event.preventDefault();return;}event.dataTransfer.setData(mime,JSON.stringify({session:state.id,id:item.id}));event.dataTransfer.effectAllowed='copy';state.root.classList.add('history-dragging');};card.ondragend=()=>state.root.classList.remove('history-dragging');
        }
        for(const button of state.root.querySelectorAll('[data-history-group]'))button.onclick=()=>toggle(state,state.items.filter(item=>day(item)===button.dataset.historyGroup));
        selection(state);
    }
    async function load(state,reset=false){
        if(!alive(state)||!reset&&(state.loading||!state.cursor))return;const version=reset?++state.version:state.version;state.loading=true;
        if(reset){state.items=[];state.cursor=null;paint(state);}status(state,'正在读取历史…');
        const params=new URLSearchParams({kind:state.kind,limit:state.node?'15':state.compact?'30':'100',...(state.current?{canvas_id:state.origin.id}:{}),...(state.node?{node_id:state.node.id}:{}),...(!reset&&state.cursor?{cursor:state.cursor}:{})});
        try{
            const response=await MemberCanvasEdit.send('/api/canvas-generation-history?'+params,{signal:state.abort.signal,cache:'no-store'});if(!response.ok)throw Error(await responseErrorMessage(response,'历史读取失败'));const data=await response.json();if(!alive(state)||version!==state.version)return;
            const ids=new Set(state.items.map(item=>item.id));for(const item of data.items){state.cache.set(item.id,item);if(!ids.has(item.id)){state.items.push(item);ids.add(item.id);}}state.cursor=data.next_cursor;paint(state);status(state,'');
        }catch(error){if(version===state.version)status(state,error.message||'历史读取失败');}finally{if(alive(state)&&version===state.version){state.loading=false;state.root.querySelector('[data-history-more]').hidden=!state.cursor;const scroll=state.root.querySelector('.history-scroll');if(state.node&&state.cursor&&scroll.scrollHeight<=scroll.clientHeight+1)queueMicrotask(()=>load(state));}}
    }
    function open({kind='all',compact=false,trigger=null,node=null}={}){
        if(!window.CanvasSession?.enabled)return toast('请在成员画布中查看生成历史');close();
        const root=document.createElement('div');root.className='pixmax-generation-history'+(compact?' history-compact':'')+(node?' history-node':'');root.setAttribute('role','dialog');root.setAttribute('aria-modal',String(!compact));root.setAttribute('aria-label',node?'当前节点生成历史':compact?'生成历史小弹层':'历史记录');
        root.innerHTML=`<section class="history-panel"><header class="history-heading"><strong>历史记录</strong><button type="button" data-history-close aria-label="关闭历史记录">×</button></header><div class="history-controls"><div class="history-scope"><button type="button" data-history-scope="current" aria-pressed="true">当前项目</button><button type="button" data-history-scope="all" aria-pressed="false">全部历史</button><button type="button" data-history-refresh>刷新</button><button type="button" data-history-select>批量选择</button></div><div class="history-filters">${Object.entries(labels).map(([value,label])=>`<button type="button" data-history-kind="${value}" aria-pressed="${kind===value}">${label}</button>`).join('')}</div></div><div class="history-scroll"><div data-history-grid></div><button type="button" data-history-more hidden>加载更多</button></div><p role="status"></p><footer class="history-batch"><span data-history-count>已选择 0 个资源</span><button type="button" data-history-batch-download>批量下载</button><button type="button" data-history-batch-insert>批量插入</button></footer></section>`;
        const state={id:crypto.randomUUID(),root,origin:canvas,scope:scope(),current:true,kind,compact,trigger,node,selected:new Map(),cache:new Map(),items:[],cursor:null,selecting:false,version:0,viewVersion:0,abort:new AbortController(),loading:false,downloading:false};active=state;document.body.appendChild(root);
        if(compact){
            if(node)root.querySelector('.history-controls').innerHTML='<p>当前节点的历史</p>';else{const expand=document.createElement('button');expand.type='button';expand.dataset.historyExpand='';expand.setAttribute('aria-label','展开全部历史');expand.title='展开全部历史';expand.textContent='↗';expand.onclick=()=>open();root.querySelector('.history-scope').appendChild(expand);}
            state.position=()=>{
                if(!alive(state))return;const bounds=(node?trigger:trigger?.closest('.pixmax-rail')||trigger||document.querySelector('.pixmax-rail')).getBoundingClientRect(),panel=root.querySelector('.history-panel'),width=Math.min(node?310:436,innerWidth-24),height=Math.min(node?400:500,innerHeight-24);
                const right=node?bounds.left:bounds.right+8,left=right+width<=innerWidth-12?right:Math.max(12,node?innerWidth-width-12:bounds.left-width-8),top=node?(bounds.bottom+8+height<=innerHeight-12?bounds.bottom+8:bounds.top-height-8):bounds.top;
                Object.assign(panel.style,{left:left+'px',top:Math.max(12,Math.min(top,innerHeight-height-12))+'px',width:width+'px',height:height+'px'});
            };
            state.outside=event=>{if(!alive(state)||root.contains(event.target)||trigger?.contains(event.target)||state.detail?.isConnected)return;close();};
            state.escape=event=>{if(event.key==='Escape'&&!state.detail?.isConnected){event.preventDefault();event.stopImmediatePropagation();close();}};
            document.addEventListener('pointerdown',state.outside,true);document.addEventListener('keydown',state.escape,true);window.addEventListener('resize',state.position);state.position();
        }
        root.querySelector('[data-history-close]').onclick=close;root.onkeydown=event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}};root.onwheel=event=>event.stopPropagation();root.onmousedown=event=>event.stopPropagation();
        root.querySelector('[data-history-refresh]')?.addEventListener('click',()=>load(state,true));root.querySelector('[data-history-more]').onclick=()=>load(state);root.querySelector('.history-scroll').onscroll=event=>{const el=event.target;if(el.scrollHeight-el.scrollTop-el.clientHeight<80)load(state);};
        const select=root.querySelector('[data-history-select]');if(select)select.onclick=event=>{state.selecting=!state.selecting;event.target.textContent=state.selecting?'退出批量选择':'批量选择';if(!state.selecting)state.selected.clear();selection(state);};
        root.querySelector('[data-history-batch-insert]').onclick=()=>insert(state,[...state.selected.values()]);root.querySelector('[data-history-batch-download]').onclick=()=>download(state,[...state.selected.values()],true);
        for(const button of root.querySelectorAll('[data-history-scope]'))button.onclick=()=>{state.current=button.dataset.historyScope==='current';state.kind='all';for(const el of root.querySelectorAll('[data-history-scope]'))el.setAttribute('aria-pressed',String(el===button));for(const el of root.querySelectorAll('[data-history-kind]'))el.setAttribute('aria-pressed',String(el.dataset.historyKind==='all'));release(state.detail);load(state,true);};
        for(const button of root.querySelectorAll('[data-history-kind]'))button.onclick=()=>{state.kind=button.dataset.historyKind;for(const el of root.querySelectorAll('[data-history-kind]'))el.setAttribute('aria-pressed',String(el===button));release(state.detail);load(state,true);};
        state.drop=event=>{if(!event.dataTransfer?.types.includes(mime))return;event.preventDefault();event.stopImmediatePropagation();state.root.classList.remove('history-dragging');try{const data=JSON.parse(event.dataTransfer.getData(mime)),item=state.cache.get(data.id);if(data.session===state.id&&item&&event.target.closest('#shell'))insert(state,[item],screenToWorld(event));}catch{}};
        document.addEventListener('drop',state.drop,true);window.addEventListener('pagehide',close);state.observer=new MutationObserver(()=>{if(!alive(state))close();else access(state);});state.observer.observe(document.body,{childList:true,subtree:true});load(state,true);
    }
    function openCompact(trigger){if(active?.compact&&active.trigger===trigger){close();return;}open({compact:true,trigger});}
    function openNode(node,trigger){if(!node||!nodes.includes(node))return;if(active?.node===node){close();return;}open({kind:node.generationKind||(node.type==='smart-model'?'model':mediaKindForItem((node.images||[])[0]||{})),compact:true,trigger,node});}
    window.PixmaxGenerationHistory=Object.freeze({open,openCompact,openNode,close,get opened(){return Boolean(active);}});
})();
